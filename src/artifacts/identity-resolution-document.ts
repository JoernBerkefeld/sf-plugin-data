import { isDeepStrictEqual } from 'node:util';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';
import { dataSpaceKey, isDataSpaceName, readSingleDataSpace } from './data-space-field.js';

/**
 * The references of a ruleset (its DMOs, fields, DLO sources and generated outputs) carry no data
 * space: they are all in the ruleset's own data space, the file's `c__dataSpace`, and named as
 * Salesforce stores them there (`ds2_Individual__dlm`, `FirstName__c` in a non-default space).
 */
export type IdentityResolutionIdentity = {
  kind: 'identity-resolution';
  apiName: string;
};
export type IdentityResolutionDmoReference = { kind: 'dmo'; apiName: string };
export type IdentityResolutionFieldReference = {
  kind: 'dmo-field';
  parentApiName: string;
  apiName: string;
};
export type IdentityResolutionOutputIdentity = {
  owner: IdentityResolutionIdentity;
  entity: IdentityResolutionDmoReference;
  role: 'unified' | 'link';
};
export type IdentityResolutionSourceReference = {
  kind: 'dlo';
  apiName: string;
};
export type IdentityResolutionReconciliationSettings = {
  ruleType: string;
  shouldIgnoreEmptyValue: boolean;
  sources: IdentityResolutionSourceReference[];
};
export type IdentityResolutionDocument = {
  schemaVersion: 1;
  kind: 'identity-resolution';
  c__dataSpace: string;
  identity: { apiName: string };
  spec: {
    configurationType: string;
    label: string;
    description: string;
    doesRunAutomatically: boolean;
    isCaseSensitive: boolean;
    secondaryDmo: IdentityResolutionDmoReference;
    filters: unknown[];
    trustedSources?: unknown[];
    matchRules: Array<{
      label: string;
      criteria: Array<{
        field: IdentityResolutionFieldReference;
        matchMethodType: string;
        caseSensitiveMatch: boolean;
        shouldMatchOnBlank: boolean;
        partyIdentificationInfo?: Record<string, unknown>;
      }>;
    }>;
    reconciliationRules: Array<
      IdentityResolutionReconciliationSettings & {
        entity: IdentityResolutionDmoReference;
        fields: Array<
          IdentityResolutionReconciliationSettings & {
            field: IdentityResolutionFieldReference;
          }
        >;
        outputs: IdentityResolutionOutputIdentity[];
      }
    >;
  };
};
export type IdentityResolutionProjection = {
  candidate: IdentityResolutionDocument;
  expectations: {
    native: Record<string, unknown>;
    outputs: Array<{ identity: IdentityResolutionOutputIdentity; sourceApiName: string }>;
  };
};

/** Refuse unsupported IR shapes without retaining payloads. */
export class IdentityResolutionError extends Error {
  public constructor(public readonly code: string) {
    super('Identity resolution configuration could not be admitted.');
    this.name = 'IdentityResolutionError';
  }
}

export const identityResolutionName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const dmoName = /^[A-Za-z][A-Za-z0-9_]*__dlm$/u;
const objectName = /^[A-Za-z][A-Za-z0-9_]*$/u;
// Documents keep the established PascalCase spelling of these API values; the API answers
// in lowercase. Values outside these lists are kept exactly as the API returns them.
const matchMethods = ['Fuzzy', 'Exact', 'ExactNormalized'];
const ruleTypes = ['LastUpdated', 'MostFrequent', 'SourceSequence'];
const configurationTypes = ['Individual'];

const unsupported = 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION';

/**
 * Enforce a payload-free invariant; with a key path, the refusal names it.
 * @param {unknown} condition Required invariant.
 * @param {string} [keyPath] Printable key path of an authored file.
 * @param {string} [problem] What is wrong with it.
 */
function requireValid(condition: unknown, keyPath?: string, problem?: string): asserts condition {
  if (condition) return;
  const error = new IdentityResolutionError(unsupported);
  if (keyPath !== undefined)
    explainInput(
      error,
      `The identity resolution file cannot be deployed: ${keyPath} ${problem ?? 'is not valid'}. Correct the file, or retrieve the ruleset again once the plugin supports it.`,
    );
  throw error;
}

/**
 * Check bounded inert JSON before reading properties or cloning.
 * @param {unknown} value Candidate content.
 * @param {Set<object>} ancestors Current recursion path.
 * @param {number} depth Current depth.
 */
function json(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  requireValid(depth <= 20);
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (typeof value === 'string') {
    requireValid(value.length <= 262_144);
    return;
  }
  requireValid(value && typeof value === 'object' && !ancestors.has(value));
  requireValid(
    Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype),
  );
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  requireValid(keys.length <= 256);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValid(
      typeof key === 'string' &&
        key !== 'toJSON' &&
        descriptor?.enumerable &&
        'value' in descriptor,
    );
    json(descriptor.value, ancestors, depth + 1);
  }
  if (Array.isArray(value)) requireValid(Object.keys(value).length === value.length);
  ancestors.delete(value);
}

/**
 * Admit a record with all of its required keys. A closed record also rejects every other key;
 * an open one (retrieve) keeps them. With a key path, the refusal names the key.
 * @param {unknown} value Candidate record.
 * @param {string[]} keys Required (and, when closed, complete) key inventory.
 * @param {boolean} [open] Whether keys outside `keys` are kept.
 * @param {string} [keyPath] Printable path of an authored record.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(
  value: unknown,
  keys: string[],
  open = false,
  keyPath?: string,
): Record<string, unknown> {
  requireValid(
    value && typeof value === 'object' && !Array.isArray(value),
    keyPath,
    'is not an object',
  );
  const result = value as Record<string, unknown>;
  const at = (key: string): string | undefined =>
    keyPath === undefined ? undefined : `${keyPath}.${printableKey(key)}`;
  const missing = keys.find((key) => !Object.hasOwn(result, key));
  requireValid(missing === undefined, at(missing ?? ''), 'is missing');
  const unknown = open ? undefined : Object.keys(result).find((key) => !keys.includes(key));
  requireValid(
    unknown === undefined,
    at(unknown ?? ''),
    'is not a key an identity resolution file can hold',
  );
  return result;
}

/**
 * The keys of a native record the projection does not map, to keep on retrieve. A key that the
 * projected document already uses could not be told apart from it and is refused.
 * @param {Record<string, unknown>} item Native record.
 * @param {string[]} known Native keys the projection maps.
 * @param {string[]} projected Keys of the projected document record.
 * @returns {Record<string, unknown>} Unmapped keys in read order.
 */
function extras(
  item: Record<string, unknown>,
  known: string[],
  projected: string[],
): Record<string, unknown> {
  const entries = Object.entries(item).filter(([key]) => !known.includes(key));
  requireValid(entries.every(([key]) => !projected.includes(key)));
  return Object.fromEntries(entries.map(([key, value]) => [key, structuredClone(value)]));
}

/**
 * Validate display text without changing bytes.
 * @param {unknown} value Candidate text.
 * @param {string} keyPath Printable key path.
 * @param {boolean} empty Whether empty text is admitted.
 */
function text(value: unknown, keyPath: string, empty = false): void {
  requireValid(
    typeof value === 'string' && (empty || value.trim().length > 0),
    keyPath,
    empty ? 'is not text' : 'is not non-empty text',
  );
}

/**
 * The entries of a list, or none for a `null` list that retrieve keeps as read.
 * @param {unknown} value Candidate list.
 * @param {string} keyPath Printable key path.
 * @param {boolean} lenient Whether `null` is kept.
 * @returns {unknown[]} Entries to check.
 */
function list(value: unknown, keyPath: string, lenient: boolean): unknown[] {
  if (lenient && value === null) return [];
  requireValid(Array.isArray(value), keyPath, 'is not a list');
  return value;
}

/**
 * Validate the complete observed portable variant and return detached data. Retrieve mode keeps
 * keys the plugin does not model and `null` values, and checks only what places the file and
 * builds its structure; deploy checks every type, name and uniqueness rule and names the key path.
 * @param {unknown} value Portable content, never a raw response.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys and nulls).
 * @returns {IdentityResolutionDocument} Checked detached document.
 */
export function validateIdentityResolutionDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): IdentityResolutionDocument {
  const lenient = mode === 'retrieve';
  if (!lenient) json(value);
  requireValid(
    value && typeof value === 'object' && !Array.isArray(value),
    '[document]',
    'is not an object',
  );
  legacySpace((value as Record<string, unknown>).identity, 'identity');
  readSingleDataSpace(value as Record<string, unknown>, refuseFile);
  const root = record(
    value,
    ['schemaVersion', 'kind', dataSpaceKey, 'identity', 'spec'],
    false,
    '[document]',
  );
  const identity = record(root.identity, ['apiName'], false, 'identity');
  requireValid(
    root.schemaVersion === 1 &&
      root.kind === 'identity-resolution' &&
      typeof identity.apiName === 'string' &&
      identityResolutionName.test(identity.apiName),
    'identity',
    'is not an identity resolution API name',
  );
  requireValid(root.spec && typeof root.spec === 'object', 'spec', 'is not an object');
  const hasTrustedSources = Object.hasOwn(root.spec, 'trustedSources');
  const spec = record(
    root.spec,
    [
      'configurationType',
      'label',
      'description',
      'doesRunAutomatically',
      'isCaseSensitive',
      'secondaryDmo',
      'filters',
      'matchRules',
      'reconciliationRules',
      ...(hasTrustedSources && !lenient ? ['trustedSources'] : []),
    ],
    lenient,
    'spec',
  );
  if (!lenient) {
    // Filters and trusted sources are sent as authored; the API decides what they may contain.
    requireValid(
      !hasTrustedSources || Array.isArray(spec.trustedSources),
      'spec.trustedSources',
      'is not a list',
    );
    requireValid(Array.isArray(spec.filters), 'spec.filters', 'is not a list');
    text(spec.configurationType, 'spec.configurationType');
    requireValid(
      typeof spec.doesRunAutomatically === 'boolean',
      'spec.doesRunAutomatically',
      'is not true or false',
    );
    requireValid(
      typeof spec.isCaseSensitive === 'boolean',
      'spec.isCaseSensitive',
      'is not true or false',
    );
    text(spec.label, 'spec.label');
    text(spec.description, 'spec.description', true);
  }
  validateDmo(spec.secondaryDmo, 'spec.secondaryDmo', lenient);
  const labels = new Set<unknown>();
  for (const [index, value] of list(spec.matchRules, 'spec.matchRules', lenient).entries()) {
    const rulePath = `spec.matchRules[${index}]`;
    const rule = record(value, ['label', 'criteria'], lenient, rulePath);
    if (!lenient) {
      text(rule.label, `${rulePath}.label`);
      requireValid(!labels.has(rule.label), `${rulePath}.label`, 'repeats another match rule');
      labels.add(rule.label);
    }
    const seen = new Set<string>();
    for (const [position, value] of list(
      rule.criteria,
      `${rulePath}.criteria`,
      lenient,
    ).entries()) {
      const criterionPath = `${rulePath}.criteria[${position}]`;
      const party =
        value !== null &&
        typeof value === 'object' &&
        Object.hasOwn(value, 'partyIdentificationInfo');
      const criterion = record(
        value,
        [
          'field',
          'matchMethodType',
          'caseSensitiveMatch',
          'shouldMatchOnBlank',
          ...(party ? ['partyIdentificationInfo'] : []),
        ],
        lenient,
        criterionPath,
      );
      legacySpace(criterion.field, `${criterionPath}.field`);
      const reference = record(
        criterion.field,
        ['kind', 'parentApiName', 'apiName'],
        false,
        `${criterionPath}.field`,
      );
      validateField(reference, reference.parentApiName, `${criterionPath}.field`, lenient);
      if (lenient) continue;
      const info = criterion.partyIdentificationInfo;
      requireValid(
        !party || (info && typeof info === 'object' && !Array.isArray(info)),
        `${criterionPath}.partyIdentificationInfo`,
        'is not an object',
      );
      text(criterion.matchMethodType, `${criterionPath}.matchMethodType`);
      for (const key of ['caseSensitiveMatch', 'shouldMatchOnBlank'])
        requireValid(
          typeof criterion[key] === 'boolean',
          `${criterionPath}.${key}`,
          'is not true or false',
        );
      const key = `${String(reference.parentApiName)}.${String(reference.apiName)}`;
      requireValid(!seen.has(key), `${criterionPath}.field`, 'repeats another criterion field');
      seen.add(key);
    }
  }
  // Outputs are identified by owner, entity and role, so each entity appears once.
  const reconciled = new Set<unknown>();
  for (const [index, value] of list(
    spec.reconciliationRules,
    'spec.reconciliationRules',
    lenient,
  ).entries()) {
    const rulePath = `spec.reconciliationRules[${index}]`;
    const reconciliation = record(
      value,
      ['entity', 'ruleType', 'shouldIgnoreEmptyValue', 'fields', 'sources', 'outputs'],
      lenient,
      rulePath,
    );
    validateDmo(reconciliation.entity, `${rulePath}.entity`, lenient);
    const entity = (reconciliation.entity as IdentityResolutionDmoReference).apiName;
    if (!lenient)
      requireValid(
        !reconciled.has(entity),
        `${rulePath}.entity`,
        'repeats another reconciliation rule',
      );
    reconciled.add(entity);
    validateSettings(reconciliation, rulePath, lenient);
    const seen = new Set<unknown>();
    for (const [position, value] of list(
      reconciliation.fields,
      `${rulePath}.fields`,
      lenient,
    ).entries()) {
      const overridePath = `${rulePath}.fields[${position}]`;
      const override = record(
        value,
        ['field', 'ruleType', 'shouldIgnoreEmptyValue', 'sources'],
        lenient,
        overridePath,
      );
      legacySpace(override.field, `${overridePath}.field`);
      const reference = record(
        override.field,
        ['kind', 'parentApiName', 'apiName'],
        false,
        `${overridePath}.field`,
      );
      validateField(reference, entity, `${overridePath}.field`, lenient);
      if (!lenient)
        requireValid(
          !seen.has(reference.apiName),
          `${overridePath}.field`,
          'repeats another field override',
        );
      seen.add(reference.apiName);
      validateSettings(override, overridePath, lenient);
    }
    if (Array.isArray(reconciliation.outputs))
      for (const [position, output] of reconciliation.outputs.entries())
        if (output && typeof output === 'object') {
          const item = output as Record<string, unknown>;
          legacySpace(item.owner, `${rulePath}.outputs[${position}].owner`);
          legacySpace(item.entity, `${rulePath}.outputs[${position}].entity`);
        }
    requireValid(
      isDeepStrictEqual(reconciliation.outputs, outputs(identity.apiName, entity)),
      `${rulePath}.outputs`,
      'is not the unified and link output of this ruleset and entity',
    );
  }
  return structuredClone(value) as IdentityResolutionDocument;
}

/**
 * Refuse an identity resolution file problem, naming the key.
 * @param {string} code Refusal code.
 * @param {string} keyPath Key path.
 * @param {string} problem What is wrong with it.
 * @returns {IdentityResolutionError} Refusal with an explanation.
 */
function refuseFile(code: string, keyPath: string, problem: string): IdentityResolutionError {
  return explainInput(
    new IdentityResolutionError(code),
    `The identity resolution file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the ruleset again.`,
  );
}

/**
 * Refuse a `dataSpace` key in the identity or a reference: the old place of the data space.
 * Every reference is in the ruleset's own data space (`c__dataSpace`); files are not migrated.
 * @param {unknown} value Identity or reference.
 * @param {string} keyPath Printable key path.
 */
function legacySpace(value: unknown, keyPath: string): void {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'dataSpace')
  )
    throw refuseFile(
      'LEGACY_DATASPACE_KEY',
      `${keyPath}.dataSpace`,
      `is the old place of a data space; a ruleset and everything it names are in the ruleset's data space, the top-level key ${dataSpaceKey}, or retrieve the ruleset again`,
    );
}

/**
 * Check a logical DMO reference; deploy also checks its name.
 * @param {unknown} value Candidate reference.
 * @param {string} keyPath Printable key path.
 * @param {boolean} lenient Retrieve mode: any name, `null` included.
 */
function validateDmo(value: unknown, keyPath: string, lenient: boolean): void {
  legacySpace(value, keyPath);
  const reference = record(value, ['kind', 'apiName'], false, keyPath);
  requireValid(
    reference.kind === 'dmo' &&
      (lenient || (typeof reference.apiName === 'string' && dmoName.test(reference.apiName))),
    keyPath,
    'is not a DMO (__dlm)',
  );
}

/**
 * Check a logical field against its explicit parent; deploy also checks the names.
 * @param {Record<string, unknown>} reference Logical field.
 * @param {unknown} parent Required parent.
 * @param {string} keyPath Printable key path.
 * @param {boolean} lenient Retrieve mode: any names, `null` included.
 */
function validateField(
  reference: Record<string, unknown>,
  parent: unknown,
  keyPath: string,
  lenient: boolean,
): void {
  requireValid(
    reference.kind === 'dmo-field' &&
      reference.parentApiName === parent &&
      (lenient ||
        (typeof parent === 'string' &&
          dmoName.test(parent) &&
          typeof reference.apiName === 'string' &&
          /^[A-Za-z][A-Za-z0-9_]*__c$/u.test(reference.apiName))),
    keyPath,
    'is not a custom field (__c) of its DMO',
  );
}

/**
 * Validate explicit settings without inventing inherited field overrides.
 * @param {Record<string, unknown>} settings Object or explicit field settings.
 * @param {string} keyPath Printable key path.
 * @param {boolean} lenient Retrieve mode: any values, unknown source keys kept.
 */
function validateSettings(
  settings: Record<string, unknown>,
  keyPath: string,
  lenient: boolean,
): void {
  if (!lenient) {
    text(settings.ruleType, `${keyPath}.ruleType`);
    requireValid(
      typeof settings.shouldIgnoreEmptyValue === 'boolean',
      `${keyPath}.shouldIgnoreEmptyValue`,
      'is not true or false',
    );
  }
  const seen = new Set<unknown>();
  for (const [index, value] of list(settings.sources, `${keyPath}.sources`, lenient).entries()) {
    const sourcePath = `${keyPath}.sources[${index}]`;
    legacySpace(value, sourcePath);
    const source = record(value, ['kind', 'apiName'], lenient, sourcePath);
    requireValid(
      source.kind === 'dlo' &&
        (lenient ||
          (typeof source.apiName === 'string' &&
            objectName.test(source.apiName) &&
            !seen.has(source.apiName))),
      sourcePath,
      'is not a unique DLO',
    );
    seen.add(source.apiName);
  }
}

/**
 * Build a typed logical DMO reference, not an org-local identity.
 * @param {string} apiName Qualified input API name.
 * @returns {IdentityResolutionDmoReference} Logical reference.
 */
function dmo(apiName: string): IdentityResolutionDmoReference {
  return { kind: 'dmo', apiName };
}

/**
 * Build a typed field reference with explicit parent context.
 * @param {string} parentApiName Parent DMO API name.
 * @param {string} apiName Field API name.
 * @returns {IdentityResolutionFieldReference} Logical reference.
 */
function field(parentApiName: string, apiName: string): IdentityResolutionFieldReference {
  return { kind: 'dmo-field', parentApiName, apiName };
}

/**
 * Identify generated outputs only through their logical owner, entity and role.
 * @param {string} apiName Authored owner identity.
 * @param {string} entity Reconciliation input entity.
 * @returns {IdentityResolutionOutputIdentity[]} Ordered output identities.
 */
function outputs(apiName: string, entity: string): IdentityResolutionOutputIdentity[] {
  return (['unified', 'link'] as const).map((role) => ({
    owner: { kind: 'identity-resolution', apiName },
    entity: dmo(entity),
    role,
  }));
}

/**
 * The data space a ruleset GET names (`dataSpaceName`): the ruleset's real data space, read
 * before anything is projected. One without a usable one is IDENTITY_RESOLUTION_DATASPACE_UNREADABLE.
 * @param {unknown} native Native response.
 * @returns {string} Data space.
 */
export function identityResolutionSpace(native: unknown): string {
  const found =
    native && typeof native === 'object' && !Array.isArray(native)
      ? (native as Record<string, unknown>).dataSpaceName
      : undefined;
  if (!isDataSpaceName(found))
    throw new IdentityResolutionError('IDENTITY_RESOLUTION_DATASPACE_UNREADABLE');
  return found;
}

/**
 * The refusal of a ruleset whose file, or whose ruleset in the org, is in another data space than
 * the run's.
 * @param {string} apiName Ruleset name.
 * @param {string} found The data space of the file or the org ruleset.
 * @param {string} dataSpace The run's data space.
 * @param {'file' | 'org'} where Whether the file or the org ruleset names `found`.
 * @returns {IdentityResolutionError} IDENTITY_RESOLUTION_DATASPACE_MISMATCH with an explanation.
 */
export function identityResolutionSpaceMismatch(
  apiName: string,
  found: string,
  dataSpace: string,
  where: 'file' | 'org',
): IdentityResolutionError {
  return explainInput(
    new IdentityResolutionError('IDENTITY_RESOLUTION_DATASPACE_MISMATCH'),
    `${where === 'file' ? `The file of identity resolution ruleset ${apiName} names the data space ${printableKey(found)} in ${dataSpaceKey}` : `Identity resolution ruleset ${apiName} is in the data space ${printableKey(found)} in the org`}, but the run's data space is ${printableKey(dataSpace)} (--dataspace, default "default"). Run the command with --dataspace ${printableKey(found)}${where === 'file' ? ', or correct the file' : ''}. Nothing was written.`,
  );
}

/**
 * Project the genuine API68 owner.
 * @param {unknown} native Exact native owner response.
 * @param {string} apiName Requested owner API name.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys and nulls).
 * @returns {IdentityResolutionProjection} Portable definition and private owner expectations.
 */
export function projectNativeIdentityResolution(
  native: unknown,
  apiName: string,
  mode: DocumentMode = 'deploy',
): IdentityResolutionProjection {
  return projectOwner(native, apiName, mode);
}

/**
 * Map an API enum to the document spelling: known values case-insensitively, others unchanged.
 * Retrieve keeps a value that is not text as read.
 * @param {unknown} value API value.
 * @param {string[]} known Document spellings.
 * @param {boolean} lenient Retrieve mode.
 * @returns {string} Document value.
 */
function canonical(value: unknown, known: string[], lenient: boolean): string {
  if (lenient && typeof value !== 'string') return value as string;
  requireValid(typeof value === 'string' && (lenient || value.trim().length > 0));
  return known.find((item) => item.toLowerCase() === value.toLowerCase()) ?? value;
}

// Read-only run statistics the API adds once a ruleset has run; never configuration.
const runtimeKeys = new Set([
  'anonymousUnifiedProfiles',
  'consolidationRate',
  'knownUnifiedProfiles',
  'lastJobCompleted',
  'lastJobStatus',
  'matchedSourceProfiles',
  'sourceProfiles',
  'totalUnifiedProfiles',
]);
const ownerKeys = [
  'configurationType',
  'dataSpaceName',
  'description',
  'doesRunAutomatically',
  'filters',
  'id',
  'isCaseSensitive',
  'label',
  'matchRules',
  'objectApiName',
  'reconciliationRules',
  'rulesetId',
  'rulesetStatus',
  'secondaryDmo',
  'trustedSources',
];
const criterionKeys = [
  'caseSensitiveMatch',
  'entityName',
  'fieldName',
  'matchMethodType',
  'shouldMatchOnBlank',
];
const settingKeys = ['ruleType', 'shouldIgnoreEmptyValue', 'sources'];

/**
 * The owner as the API returns it, without the run statistics it adds after a run: what a
 * by-name delete of a verbatim file compares between its reads.
 * @param {unknown} native Native response.
 * @returns {Record<string, unknown>} Detached owner.
 */
export function observeIdentityResolutionOwner(native: unknown): Record<string, unknown> {
  if (!native || typeof native !== 'object' || Array.isArray(native))
    throw new IdentityResolutionError('INCOMPLETE_IDENTITY_RESOLUTION');
  return structuredClone(
    Object.fromEntries(
      Object.entries(native as Record<string, unknown>).filter(([key]) => !runtimeKeys.has(key)),
    ),
  );
}

/**
 * Project the owner the API returns. Retrieve mode requires the configuration keys but keeps
 * unknown owner and nested keys (after the known ones), `null` values and any names, so only a
 * missing key or a shape that is not a list or object stops the projection (the ruleset is then
 * written verbatim).
 * @param {unknown} native Native response.
 * @param {string} apiName Requested identity.
 * @param {DocumentMode} mode Check mode.
 * @returns {IdentityResolutionProjection} Checked projection.
 */
function projectOwner(
  native: unknown,
  apiName: string,
  mode: DocumentMode,
): IdentityResolutionProjection {
  const lenient = mode === 'retrieve';
  if (!lenient) json(native);
  requireValid(typeof apiName === 'string' && identityResolutionName.test(apiName));
  requireValid(native && typeof native === 'object' && !Array.isArray(native));
  // The ruleset's own data space is read before anything else is projected.
  const dataSpace = identityResolutionSpace(native);
  const has = (key: string): boolean => Object.hasOwn(native, key);
  // Native68 may omit filters, trustedSources, description and (default owner) rulesetId.
  const optional = new Set(['filters', 'rulesetId', 'description', 'trustedSources']);
  const observed = Object.fromEntries(
    Object.entries(native as Record<string, unknown>).filter(([key]) => !runtimeKeys.has(key)),
  );
  const raw = record(
    observed,
    ownerKeys.filter((key) => !optional.has(key) || has(key)),
    lenient,
  );
  const rows = (value: unknown): unknown[] | null => {
    // eslint-disable-next-line unicorn/no-null -- Retrieve keeps a list the API returns as null.
    if (lenient && value === null) return null;
    requireValid(Array.isArray(value));
    return value;
  };
  if (!lenient) {
    requireValid(
      raw.rulesetId === undefined ||
        (typeof raw.rulesetId === 'string' && raw.rulesetId.trim().length > 0),
    );
    requireValid(typeof raw.secondaryDmo === 'string');
    requireValid(typeof raw.id === 'string' && raw.id.trim().length > 0);
    requireValid(typeof raw.rulesetStatus === 'string' && raw.rulesetStatus.trim().length > 0);
  }
  requireValid(raw.objectApiName === apiName);
  const matchRules = rows(raw.matchRules)?.map((value) => {
    const match = record(value, ['criteria', 'label'], lenient);
    const criteria = rows(match.criteria)?.map((value) => {
      const party =
        value !== null &&
        typeof value === 'object' &&
        Object.hasOwn(value, 'partyIdentificationInfo');
      const item = record(
        value,
        [...criterionKeys, ...(party ? ['partyIdentificationInfo'] : [])],
        lenient,
      );
      if (!lenient)
        requireValid(typeof item.entityName === 'string' && typeof item.fieldName === 'string');
      return {
        field: field(item.entityName as string, item.fieldName as string),
        matchMethodType: canonical(item.matchMethodType, matchMethods, lenient),
        caseSensitiveMatch: item.caseSensitiveMatch,
        shouldMatchOnBlank: item.shouldMatchOnBlank,
        ...(party ? { partyIdentificationInfo: item.partyIdentificationInfo } : {}),
        ...extras(
          item,
          [...criterionKeys, 'partyIdentificationInfo'],
          ['field', 'matchMethodType', 'caseSensitiveMatch', 'shouldMatchOnBlank'],
        ),
      };
    });
    return {
      label: match.label,
      criteria: criteria ?? match.criteria,
      ...extras(match, ['criteria', 'label'], ['label', 'criteria']),
    };
  });
  const bindings: IdentityResolutionProjection['expectations']['outputs'] = [];
  const generatedNames = new Set<string>();
  const roles = ['unifiedDmoName', 'linkDmoName'];
  const reconciliationRules = rows(raw.reconciliationRules)?.map((value) => {
    requireValid(value && typeof value === 'object');
    const item = record(
      value,
      [
        'entityName',
        'fields',
        ...settingKeys,
        // Outputs may not be generated yet; bind only the names the API returns.
        ...roles.filter((key) => Object.hasOwn(value, key)),
      ],
      lenient,
    );
    if (!lenient) requireValid(typeof item.entityName === 'string');
    const entity = item.entityName as string;
    const identities = outputs(apiName, entity);
    for (const [roleIndex, key] of roles.entries()) {
      const name = item[key];
      if (name === undefined || name === null) continue;
      const usable = typeof name === 'string' && dmoName.test(name) && !generatedNames.has(name);
      // Retrieve binds no outputs; a name it cannot use is only left unbound.
      if (lenient && !usable) continue;
      requireValid(usable);
      generatedNames.add(name);
      bindings.push({ identity: identities[roleIndex], sourceApiName: name });
    }
    return {
      entity: dmo(entity),
      ...projectSettings(item, lenient),
      fields: projectOverrides(item.fields, entity, lenient),
      outputs: identities,
      ...extras(
        item,
        ['entityName', 'fields', ...settingKeys, ...roles],
        ['entity', 'fields', ...settingKeys, 'outputs'],
      ),
    };
  });
  const spec = {
    configurationType: canonical(raw.configurationType, configurationTypes, lenient),
    label: raw.label,
    description: has('description') ? raw.description : '',
    doesRunAutomatically: raw.doesRunAutomatically,
    isCaseSensitive: raw.isCaseSensitive,
    secondaryDmo: dmo(raw.secondaryDmo as string),
    filters: has('filters') ? raw.filters : [],
    trustedSources: has('trustedSources') ? raw.trustedSources : [],
    matchRules: matchRules ?? raw.matchRules,
    reconciliationRules: reconciliationRules ?? raw.reconciliationRules,
  };
  const candidate = validateIdentityResolutionDocument(
    {
      schemaVersion: 1,
      kind: 'identity-resolution',
      [dataSpaceKey]: dataSpace,
      identity: { apiName: raw.objectApiName },
      spec: { ...spec, ...extras(raw, ownerKeys, Object.keys(spec)) },
    },
    mode,
  );
  return {
    candidate,
    expectations: {
      native: structuredClone(raw),
      outputs: structuredClone(bindings),
    },
  };
}

/**
 * Map API enum casing to the document spelling and keep ordered source references.
 * @param {Record<string, unknown>} item Exact native settings.
 * @param {boolean} lenient Retrieve mode: `null` sources and unknown source keys kept.
 * @returns {object} Portable settings.
 */
function projectSettings(item: Record<string, unknown>, lenient: boolean): object {
  if (!(lenient && item.sources === null)) requireValid(Array.isArray(item.sources));
  return {
    ruleType: canonical(item.ruleType, ruleTypes, lenient),
    shouldIgnoreEmptyValue: item.shouldIgnoreEmptyValue,
    sources: Array.isArray(item.sources)
      ? item.sources.map((value) => {
          const source = record(value, ['name'], lenient);
          return {
            kind: 'dlo',
            apiName: source.name,
            ...extras(source, ['name'], ['kind', 'apiName']),
          };
        })
      : item.sources,
  };
}

/**
 * Keep only server-returned explicit field overrides; empty means inheritance.
 * @param {unknown} value Native fields.
 * @param {string} parent Parent entity.
 * @param {boolean} lenient Retrieve mode: `null` and unknown keys kept.
 * @returns {object[]} Portable explicit overrides.
 */
function projectOverrides(value: unknown, parent: string, lenient: boolean): object[] {
  if (lenient && value === null) return value as unknown as object[];
  requireValid(Array.isArray(value));
  return value.map((value) => {
    const item = record(value, ['fieldName', ...settingKeys], lenient);
    if (!lenient) requireValid(typeof item.fieldName === 'string');
    return {
      field: field(parent, item.fieldName as string),
      ...projectSettings(item, lenient),
      ...extras(item, ['fieldName', ...settingKeys], ['field', ...settingKeys]),
    };
  });
}

/**
 * Serialize complete admitted portable content, never private acquisition expectations.
 * @param {unknown} value Portable candidate.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys and nulls).
 * @returns {string} Stable JSON bytes with final LF.
 */
export function serializeIdentityResolutionDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): string {
  return `${JSON.stringify(validateIdentityResolutionDocument(value, mode), undefined, 2)}\n`;
}
