import { isDeepStrictEqual } from 'node:util';

export type IdentityResolutionIdentity = {
  kind: 'identity-resolution';
  dataSpace: 'default';
  apiName: string;
};
export type IdentityResolutionDmoReference = { kind: 'dmo'; dataSpace: 'default'; apiName: string };
export type IdentityResolutionFieldReference = {
  kind: 'dmo-field';
  dataSpace: 'default';
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
  dataSpace: 'default';
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
  identity: { dataSpace: 'default'; apiName: string };
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
    facade?: Record<string, unknown>;
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
// Historical API67 facade/graph contract only (retained until package G2).
const entities = [
  'Individual',
  'ContactPointEmail',
  'ContactPointPhone',
  'ContactPointAddress',
  'ContactPointApp',
  'PartyIdentification',
].map((name) => `ssot__${name}__dlm`);
const criteria = [
  ['ssot__Individual__dlm', 'ssot__FirstName__c', 'Fuzzy'],
  ['ssot__Individual__dlm', 'ssot__LastName__c', 'Exact'],
  ['ssot__ContactPointEmail__dlm', 'ssot__EmailAddress__c', 'ExactNormalized'],
] as const;

/**
 * Enforce a payload-free invariant.
 * @param {unknown} condition Required invariant.
 */
function requireValid(condition: unknown): asserts condition {
  if (!condition)
    throw new IdentityResolutionError('UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION');
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
 * Admit an exact record, never ignore unknown meaningful keys.
 * @param {unknown} value Candidate record.
 * @param {string[]} keys Exact key inventory.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys: string[]): Record<string, unknown> {
  requireValid(value && typeof value === 'object' && !Array.isArray(value));
  requireValid(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
  );
  return value as Record<string, unknown>;
}

/**
 * Validate display text without changing bytes.
 * @param {unknown} value Candidate text.
 * @param {boolean} empty Whether empty text is admitted.
 */
function text(value: unknown, empty = false): void {
  requireValid(typeof value === 'string' && (empty || value.trim().length > 0));
}

/**
 * Validate the complete observed portable variant and return detached data.
 * @param {unknown} value Portable content, never a raw response.
 * @returns {IdentityResolutionDocument} Checked detached document.
 */
export function validateIdentityResolutionDocument(value: unknown): IdentityResolutionDocument {
  json(value);
  const root = record(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  if (
    root.identity &&
    typeof root.identity === 'object' &&
    Object.hasOwn(root.identity, 'logicalName')
  )
    throw new IdentityResolutionError('LEGACY_IDENTITY_RESOLUTION_IDENTITY_UNSUPPORTED');
  const identity = record(root.identity, ['dataSpace', 'apiName']);
  requireValid(
    root.schemaVersion === 1 &&
      root.kind === 'identity-resolution' &&
      identity.dataSpace === 'default' &&
      typeof identity.apiName === 'string' &&
      identityResolutionName.test(identity.apiName),
  );
  requireValid(root.spec && typeof root.spec === 'object');
  const hasTrustedSources = Object.hasOwn(root.spec, 'trustedSources');
  const spec = record(root.spec, [
    'configurationType',
    'label',
    'description',
    'doesRunAutomatically',
    'isCaseSensitive',
    'secondaryDmo',
    'filters',
    'matchRules',
    'reconciliationRules',
    ...(hasTrustedSources ? ['trustedSources'] : []),
  ]);
  // Filters and trusted sources are sent as authored; the API decides what they may contain.
  requireValid(!hasTrustedSources || Array.isArray(spec.trustedSources));
  requireValid(Array.isArray(spec.filters));
  text(spec.configurationType);
  requireValid(
    typeof spec.doesRunAutomatically === 'boolean' && typeof spec.isCaseSensitive === 'boolean',
  );
  text(spec.label);
  text(spec.description, true);
  validateDmo(spec.secondaryDmo);
  requireValid(Array.isArray(spec.matchRules));
  const labels = new Set<unknown>();
  for (const value of spec.matchRules) {
    const rule = record(value, ['label', 'criteria']);
    text(rule.label);
    requireValid(!labels.has(rule.label));
    labels.add(rule.label);
    requireValid(Array.isArray(rule.criteria));
    const seen = new Set<string>();
    for (const value of rule.criteria) {
      const party =
        value !== null &&
        typeof value === 'object' &&
        Object.hasOwn(value, 'partyIdentificationInfo');
      const criterion = record(value, [
        'field',
        'matchMethodType',
        'caseSensitiveMatch',
        'shouldMatchOnBlank',
        ...(party ? ['partyIdentificationInfo'] : []),
      ]);
      const info = criterion.partyIdentificationInfo;
      requireValid(!party || (info && typeof info === 'object' && !Array.isArray(info)));
      const reference = record(criterion.field, ['kind', 'dataSpace', 'parentApiName', 'apiName']);
      validateField(reference, reference.parentApiName);
      text(criterion.matchMethodType);
      requireValid(
        typeof criterion.caseSensitiveMatch === 'boolean' &&
          typeof criterion.shouldMatchOnBlank === 'boolean',
      );
      const key = `${String(reference.parentApiName)}.${String(reference.apiName)}`;
      requireValid(!seen.has(key));
      seen.add(key);
    }
  }
  requireValid(Array.isArray(spec.reconciliationRules));
  // Outputs are identified by owner, entity and role, so each entity appears once.
  const reconciled = new Set<unknown>();
  for (const value of spec.reconciliationRules) {
    const reconciliation = record(value, [
      'entity',
      'ruleType',
      'shouldIgnoreEmptyValue',
      'fields',
      'sources',
      'outputs',
    ]);
    validateDmo(reconciliation.entity);
    const entity = (reconciliation.entity as IdentityResolutionDmoReference).apiName;
    requireValid(!reconciled.has(entity));
    reconciled.add(entity);
    validateSettings(reconciliation);
    requireValid(Array.isArray(reconciliation.fields));
    const seen = new Set<unknown>();
    for (const value of reconciliation.fields) {
      const override = record(value, ['field', 'ruleType', 'shouldIgnoreEmptyValue', 'sources']);
      const reference = record(override.field, ['kind', 'dataSpace', 'parentApiName', 'apiName']);
      validateField(reference, entity);
      requireValid(!seen.has(reference.apiName));
      seen.add(reference.apiName);
      validateSettings(override);
    }
    requireValid(isDeepStrictEqual(reconciliation.outputs, outputs(identity.apiName, entity)));
  }
  return structuredClone(value) as IdentityResolutionDocument;
}

/**
 * Check a logical DMO reference by name only.
 * @param {unknown} value Candidate reference.
 */
function validateDmo(value: unknown): void {
  const reference = record(value, ['kind', 'dataSpace', 'apiName']);
  requireValid(
    reference.kind === 'dmo' &&
      reference.dataSpace === 'default' &&
      typeof reference.apiName === 'string' &&
      dmoName.test(reference.apiName),
  );
}

/**
 * Check a logical field against its explicit parent.
 * @param {Record<string, unknown>} reference Logical field.
 * @param {unknown} parent Required parent.
 */
function validateField(reference: Record<string, unknown>, parent: unknown): void {
  requireValid(
    reference.kind === 'dmo-field' &&
      reference.dataSpace === 'default' &&
      typeof parent === 'string' &&
      dmoName.test(parent) &&
      reference.parentApiName === parent &&
      typeof reference.apiName === 'string' &&
      /^[A-Za-z][A-Za-z0-9_]*__c$/u.test(reference.apiName),
  );
}

/**
 * Validate explicit settings without inventing inherited field overrides.
 * @param {Record<string, unknown>} settings Object or explicit field settings.
 */
function validateSettings(settings: Record<string, unknown>): void {
  text(settings.ruleType);
  requireValid(
    typeof settings.shouldIgnoreEmptyValue === 'boolean' && Array.isArray(settings.sources),
  );
  const seen = new Set<unknown>();
  for (const value of settings.sources) {
    const source = record(value, ['kind', 'dataSpace', 'apiName']);
    requireValid(
      source.kind === 'dlo' &&
        source.dataSpace === 'default' &&
        typeof source.apiName === 'string' &&
        objectName.test(source.apiName) &&
        !seen.has(source.apiName),
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
  return { kind: 'dmo', dataSpace: 'default', apiName };
}

/**
 * Build a typed field reference with explicit parent context.
 * @param {string} parentApiName Parent DMO API name.
 * @param {string} apiName Field API name.
 * @returns {IdentityResolutionFieldReference} Logical reference.
 */
function field(parentApiName: string, apiName: string): IdentityResolutionFieldReference {
  return { kind: 'dmo-field', dataSpace: 'default', parentApiName, apiName };
}

/**
 * Identify generated outputs only through their logical owner, entity and role.
 * @param {string} apiName Authored owner identity.
 * @param {string} entity Reconciliation input entity.
 * @returns {IdentityResolutionOutputIdentity[]} Ordered output identities.
 */
function outputs(apiName: string, entity: string): IdentityResolutionOutputIdentity[] {
  return (['unified', 'link'] as const).map((role) => ({
    owner: { kind: 'identity-resolution', dataSpace: 'default', apiName },
    entity: dmo(entity),
    role,
  }));
}

/**
 * Compare complete independent observed owner representations and project the admitted variant.
 * Only native omission of facade filters:[] is qualified; no other omission/case is normalized between reads.
 * @param {unknown} facade API67 application result from frozen read transport.
 * @param {unknown} native Independent native API65 exact owner response.
 * @param {string} apiName Exact exposed owner API name requested by the caller.
 * @returns {IdentityResolutionProjection} Portable candidate plus private correlation baseline.
 */
export function projectIdentityResolution(
  facade: unknown,
  native: unknown,
  apiName: string,
): IdentityResolutionProjection {
  requireValid(facade !== undefined);
  return projectOwner(native, apiName, facade);
}

/**
 * Project the genuine API68 owner without manufacturing a facade representation.
 * @param {unknown} native Exact native owner response.
 * @param {string} apiName Requested owner API name.
 * @returns {IdentityResolutionProjection} Portable definition and private owner expectations.
 */
export function projectNativeIdentityResolution(
  native: unknown,
  apiName: string,
): IdentityResolutionProjection {
  return projectOwner(native, apiName);
}

/**
 * Map an API enum to the document spelling: known values case-insensitively, others unchanged.
 * @param {unknown} value API value.
 * @param {string[]} known Document spellings.
 * @returns {string} Document value.
 */
function canonical(value: unknown, known: string[]): string {
  text(value);
  const name = value as string;
  return known.find((item) => item.toLowerCase() === name.toLowerCase()) ?? name;
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

/**
 * Project the owner the API returns; the historical API67 facade mode keeps its bounded contract.
 * @param {unknown} native Native response.
 * @param {string} apiName Requested identity.
 * @param {unknown} [facade] Historical API67 facade response only.
 * @returns {IdentityResolutionProjection} Checked projection.
 */
function projectOwner(
  native: unknown,
  apiName: string,
  facade?: unknown,
): IdentityResolutionProjection {
  if (facade !== undefined) json(facade);
  json(native);
  requireValid(typeof apiName === 'string' && identityResolutionName.test(apiName));
  const keys = [
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
  ];
  const nativeMode = facade === undefined;
  requireValid(native && typeof native === 'object' && !Array.isArray(native));
  const has = (key: string): boolean => Object.hasOwn(native, key);
  // Native68 may omit filters, trustedSources, description and (default owner) rulesetId.
  const optional = new Set(['filters', 'rulesetId', 'description']);
  let observed = native as Record<string, unknown>;
  if (nativeMode)
    observed = Object.fromEntries(
      Object.entries(observed).filter(([key]) => !runtimeKeys.has(key)),
    );
  const nativeRaw = record(observed, [
    ...keys.filter((key) => (nativeMode ? !optional.has(key) || has(key) : key !== 'filters')),
    ...(nativeMode && has('trustedSources') ? ['trustedSources'] : []),
  ]);
  const raw = nativeMode ? nativeRaw : record(facade, keys);
  if (nativeMode)
    requireValid(
      raw.rulesetId === undefined ||
        (typeof raw.rulesetId === 'string' && raw.rulesetId.trim().length > 0),
    );
  else {
    const { filters: omitted, ...withoutFilters } = raw;
    requireValid(isDeepStrictEqual(omitted, []) && isDeepStrictEqual(withoutFilters, nativeRaw));
    requireValid(
      raw.configurationType === 'individual' &&
        raw.secondaryDmo === entities[0] &&
        raw.doesRunAutomatically === false &&
        raw.isCaseSensitive === true &&
        typeof raw.rulesetId === 'string' &&
        /^[A-Za-z0-9]{4}$/u.test(raw.rulesetId),
    );
    if (raw.rulesetStatus !== 'PUBLISHED')
      throw new IdentityResolutionError('IDENTITY_RESOLUTION_NOT_SETTLED');
  }
  requireValid(
    raw.objectApiName === apiName &&
      raw.dataSpaceName === 'default' &&
      typeof raw.secondaryDmo === 'string',
  );
  text(raw.id);
  text(raw.rulesetStatus);
  requireValid(Array.isArray(raw.matchRules));
  if (!nativeMode) requireValid(raw.matchRules.length === 1);
  const matchRules = raw.matchRules.map((value) => {
    const match = record(value, ['criteria', 'label']);
    requireValid(Array.isArray(match.criteria));
    if (!nativeMode) requireValid(match.criteria.length === 3);
    const matchCriteria = match.criteria.map((value, index) => {
      const party =
        nativeMode &&
        value !== null &&
        typeof value === 'object' &&
        Object.hasOwn(value, 'partyIdentificationInfo');
      const item = record(value, [
        'caseSensitiveMatch',
        'entityName',
        'fieldName',
        'matchMethodType',
        'shouldMatchOnBlank',
        ...(party ? ['partyIdentificationInfo'] : []),
      ]);
      const expected = criteria[index];
      if (!nativeMode)
        requireValid(
          item.entityName === expected[0] &&
            item.fieldName === expected[1] &&
            item.matchMethodType === expected[2].toLowerCase() &&
            item.caseSensitiveMatch === false &&
            item.shouldMatchOnBlank === false,
        );
      requireValid(typeof item.entityName === 'string' && typeof item.fieldName === 'string');
      return {
        field: field(item.entityName, item.fieldName),
        matchMethodType: canonical(item.matchMethodType, matchMethods),
        caseSensitiveMatch: item.caseSensitiveMatch,
        shouldMatchOnBlank: item.shouldMatchOnBlank,
        ...(party ? { partyIdentificationInfo: item.partyIdentificationInfo } : {}),
      };
    });
    return { label: match.label, criteria: matchCriteria };
  });
  requireValid(Array.isArray(raw.reconciliationRules));
  if (!nativeMode) requireValid(raw.reconciliationRules.length === 6);
  const bindings: IdentityResolutionProjection['expectations']['outputs'] = [];
  const generatedNames = new Set<string>();
  const roles = ['unifiedDmoName', 'linkDmoName'];
  const reconciliationRules = raw.reconciliationRules.map((value, index) => {
    requireValid(value && typeof value === 'object');
    const item = record(value, [
      'entityName',
      'fields',
      'ruleType',
      'shouldIgnoreEmptyValue',
      'sources',
      // Outputs may not be generated yet; bind only the names the API returns.
      ...roles.filter((key) => !nativeMode || Object.hasOwn(value, key)),
    ]);
    requireValid(typeof item.entityName === 'string');
    const entity = item.entityName;
    if (!nativeMode)
      requireValid(
        entity === entities[index] &&
          (item.ruleType === 'lastupdated' || (index === 0 && item.ruleType === 'mostfrequent')) &&
          item.shouldIgnoreEmptyValue === true &&
          isDeepStrictEqual(item.fields, []) &&
          isDeepStrictEqual(item.sources, []),
      );
    const identities = outputs(apiName, entity);
    for (const [roleIndex, key] of roles.entries()) {
      const name = item[key];
      if (nativeMode && (name === undefined || name === null)) continue;
      requireValid(typeof name === 'string' && dmoName.test(name) && !generatedNames.has(name));
      generatedNames.add(name);
      bindings.push({ identity: identities[roleIndex], sourceApiName: name });
    }
    return {
      entity: dmo(entity),
      ...projectSettings(item),
      fields: projectOverrides(item.fields, entity),
      outputs: identities,
    };
  });
  const candidate = validateIdentityResolutionDocument({
    schemaVersion: 1,
    kind: 'identity-resolution',
    identity: { dataSpace: 'default', apiName: raw.objectApiName },
    spec: {
      configurationType: canonical(raw.configurationType, configurationTypes),
      label: raw.label,
      description: nativeMode && !has('description') ? '' : raw.description,
      doesRunAutomatically: raw.doesRunAutomatically,
      isCaseSensitive: raw.isCaseSensitive,
      secondaryDmo: dmo(raw.secondaryDmo),
      filters: nativeMode && !has('filters') ? [] : raw.filters,
      ...(nativeMode
        ? { trustedSources: has('trustedSources') ? nativeRaw.trustedSources : [] }
        : {}),
      matchRules,
      reconciliationRules,
    },
  });
  return {
    candidate,
    expectations: {
      ...(nativeMode ? {} : { facade: structuredClone(raw) }),
      native: structuredClone(nativeRaw),
      outputs: structuredClone(bindings),
    },
  };
}

/**
 * Map API enum casing to the document spelling and keep ordered source references.
 * @param {Record<string, unknown>} item Exact native settings.
 * @returns {object} Portable settings.
 */
function projectSettings(item: Record<string, unknown>): object {
  requireValid(Array.isArray(item.sources));
  return {
    ruleType: canonical(item.ruleType, ruleTypes),
    shouldIgnoreEmptyValue: item.shouldIgnoreEmptyValue,
    sources: item.sources.map((value) => {
      const source = record(value, ['name']);
      return { kind: 'dlo', dataSpace: 'default', apiName: source.name };
    }),
  };
}

/**
 * Keep only server-returned explicit field overrides; empty means inheritance.
 * @param {unknown} value Native fields.
 * @param {string} parent Parent entity.
 * @returns {object[]} Portable explicit overrides.
 */
function projectOverrides(value: unknown, parent: string): object[] {
  requireValid(Array.isArray(value));
  return value.map((value) => {
    const item = record(value, ['fieldName', 'ruleType', 'shouldIgnoreEmptyValue', 'sources']);
    requireValid(typeof item.fieldName === 'string');
    return { field: field(parent, item.fieldName), ...projectSettings(item) };
  });
}

/**
 * Serialize complete admitted portable content, never private acquisition expectations.
 * @param {unknown} value Portable candidate.
 * @returns {string} Stable JSON bytes with final LF.
 */
export function serializeIdentityResolutionDocument(value: unknown): string {
  return `${JSON.stringify(validateIdentityResolutionDocument(value), undefined, 2)}\n`;
}
