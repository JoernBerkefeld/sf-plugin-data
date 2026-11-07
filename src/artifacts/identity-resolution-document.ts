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
  ruleType: 'LastUpdated' | 'MostFrequent' | 'SourceSequence';
  shouldIgnoreEmptyValue: boolean;
  sources: IdentityResolutionSourceReference[];
};
export type IdentityResolutionDocument = {
  schemaVersion: 1;
  kind: 'identity-resolution';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    configurationType: 'Individual';
    label: string;
    description: string;
    doesRunAutomatically: false;
    isCaseSensitive: true;
    secondaryDmo: IdentityResolutionDmoReference;
    filters: [];
    trustedSources?: [];
    matchRules: Array<{
      label: string;
      criteria: Array<{
        field: IdentityResolutionFieldReference;
        matchMethodType: 'Fuzzy' | 'Exact' | 'ExactNormalized';
        caseSensitiveMatch: boolean;
        shouldMatchOnBlank: boolean;
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
  requireValid(!hasTrustedSources || isDeepStrictEqual(spec.trustedSources, []));
  requireValid(
    spec.configurationType === 'Individual' &&
      spec.doesRunAutomatically === false &&
      spec.isCaseSensitive === true,
  );
  text(spec.label);
  text(spec.description, true);
  requireValid(
    isDeepStrictEqual(spec.secondaryDmo, dmo(entities[0])) && isDeepStrictEqual(spec.filters, []),
  );
  requireValid(Array.isArray(spec.matchRules) && spec.matchRules.length > 0);
  const labels = new Set<unknown>();
  for (const value of spec.matchRules) {
    const rule = record(value, ['label', 'criteria']);
    text(rule.label);
    requireValid(!labels.has(rule.label));
    labels.add(rule.label);
    requireValid(Array.isArray(rule.criteria) && rule.criteria.length > 0);
    const seen = new Set<string>();
    for (const value of rule.criteria) {
      const criterion = record(value, [
        'field',
        'matchMethodType',
        'caseSensitiveMatch',
        'shouldMatchOnBlank',
      ]);
      const reference = record(criterion.field, ['kind', 'dataSpace', 'parentApiName', 'apiName']);
      validateField(reference, reference.parentApiName);
      requireValid(
        ['Fuzzy', 'Exact', 'ExactNormalized'].includes(String(criterion.matchMethodType)) &&
          typeof criterion.caseSensitiveMatch === 'boolean' &&
          typeof criterion.shouldMatchOnBlank === 'boolean',
      );
      // Native68 rejected this exact combination; field labels are not an API allowlist.
      requireValid(
        criterion.caseSensitiveMatch !== true ||
          reference.parentApiName !== 'ssot__Individual__dlm' ||
          reference.apiName !== 'ssot__FirstName__c',
      );
      const key = `${String(reference.parentApiName)}.${String(reference.apiName)}`;
      requireValid(!seen.has(key));
      seen.add(key);
    }
  }
  requireValid(Array.isArray(spec.reconciliationRules) && spec.reconciliationRules.length === 6);
  for (const [index, entity] of entities.entries()) {
    const reconciliation = record(spec.reconciliationRules[index], [
      'entity',
      'ruleType',
      'shouldIgnoreEmptyValue',
      'fields',
      'sources',
      'outputs',
    ]);
    requireValid(isDeepStrictEqual(reconciliation.entity, dmo(entity)));
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
  if (!hasTrustedSources) {
    // Historical Graph/facade artifacts retain their original bounded contract.
    requireValid(Array.isArray(spec.matchRules) && spec.matchRules.length === 1);
    const match = spec.matchRules[0] as Record<string, unknown>;
    requireValid(Array.isArray(match.criteria) && match.criteria.length === 3);
    for (const [index, expected] of criteria.entries()) {
      const item = match.criteria[index] as Record<string, unknown>;
      requireValid(
        isDeepStrictEqual(item.field, field(expected[0], expected[1])) &&
          item.matchMethodType === expected[2] &&
          item.caseSensitiveMatch === false &&
          item.shouldMatchOnBlank === false,
      );
    }
    for (const [index, value] of spec.reconciliationRules.entries()) {
      const item = value as Record<string, unknown>;
      requireValid(
        (item.ruleType === 'LastUpdated' || (index === 0 && item.ruleType === 'MostFrequent')) &&
          item.shouldIgnoreEmptyValue === true &&
          isDeepStrictEqual(item.fields, []) &&
          isDeepStrictEqual(item.sources, []),
      );
    }
  }
  return structuredClone(value) as IdentityResolutionDocument;
}

/**
 * Check a logical field against its explicit reconciliation parent.
 * @param {Record<string, unknown>} reference Logical field.
 * @param {unknown} parent Required parent.
 */
function validateField(reference: Record<string, unknown>, parent: unknown): void {
  requireValid(
    reference.kind === 'dmo-field' &&
      reference.dataSpace === 'default' &&
      typeof parent === 'string' &&
      entities.includes(parent) &&
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
  requireValid(
    ['LastUpdated', 'MostFrequent', 'SourceSequence'].includes(String(settings.ruleType)) &&
      typeof settings.shouldIgnoreEmptyValue === 'boolean' &&
      Array.isArray(settings.sources),
  );
  requireValid(
    settings.ruleType === 'SourceSequence'
      ? settings.sources.length > 0
      : settings.sources.length === 0,
  );
  const seen = new Set<unknown>();
  for (const value of settings.sources) {
    const source = record(value, ['kind', 'dataSpace', 'apiName']);
    requireValid(
      source.kind === 'dlo' &&
        source.dataSpace === 'default' &&
        typeof source.apiName === 'string' &&
        /^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(source.apiName) &&
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
 * Validate the exact native shape, retaining the historical paired-reader seam until deployment migration.
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
  // API68 exact GET for the default Individual owner omits rulesetId entirely.
  const defaultOwner =
    nativeMode &&
    native !== null &&
    typeof native === 'object' &&
    !Object.hasOwn(native, 'rulesetId') &&
    (native as Record<string, unknown>).objectApiName === 'Individual';
  // Native68 may return filters:[] or omit it; retain the exact read for drift comparisons.
  const nativeFilters =
    nativeMode && native !== null && typeof native === 'object' && Object.hasOwn(native, 'filters');
  const nativeRaw = record(native, [
    ...keys.filter(
      (key) => !(key === 'filters' && !nativeFilters) && !(defaultOwner && key === 'rulesetId'),
    ),
    ...(nativeMode ? ['trustedSources'] : []),
  ]);
  const raw = nativeMode ? nativeRaw : record(facade, keys);
  const filters = nativeMode && !nativeFilters ? [] : raw.filters;
  if (nativeMode) {
    requireValid(isDeepStrictEqual(nativeRaw.trustedSources, []));
    requireValid(defaultOwner || raw.objectApiName === `Individual_${String(raw.rulesetId)}`);
  } else {
    const { filters: omitted, ...withoutFilters } = raw;
    requireValid(isDeepStrictEqual(omitted, []) && isDeepStrictEqual(withoutFilters, nativeRaw));
  }
  requireValid(
    raw.objectApiName === apiName &&
      raw.dataSpaceName === 'default' &&
      raw.configurationType === 'individual' &&
      raw.secondaryDmo === entities[0],
  );
  text(raw.id);
  requireValid(
    defaultOwner ||
      (typeof raw.rulesetId === 'string' &&
        (nativeMode ? /^[A-Za-z0-9]{1,4}$/u : /^[A-Za-z0-9]{4}$/u).test(raw.rulesetId)),
  );
  if (raw.rulesetStatus !== 'PUBLISHED')
    throw new IdentityResolutionError('IDENTITY_RESOLUTION_NOT_SETTLED');
  requireValid(Array.isArray(raw.matchRules) && raw.matchRules.length > 0);
  if (!nativeMode) requireValid(raw.matchRules.length === 1);
  const matchRules = raw.matchRules.map((value) => {
    const match = record(value, ['criteria', 'label']);
    requireValid(Array.isArray(match.criteria) && match.criteria.length > 0);
    if (!nativeMode) requireValid(match.criteria.length === 3);
    const matchCriteria = match.criteria.map((value, index) => {
      const item = record(value, [
        'caseSensitiveMatch',
        'entityName',
        'fieldName',
        'matchMethodType',
        'shouldMatchOnBlank',
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
      const method = ['Fuzzy', 'Exact', 'ExactNormalized'].find(
        (name) => name.toLowerCase() === item.matchMethodType,
      );
      requireValid(
        method && typeof item.entityName === 'string' && typeof item.fieldName === 'string',
      );
      return {
        field: field(item.entityName, item.fieldName),
        matchMethodType: method,
        caseSensitiveMatch: item.caseSensitiveMatch,
        shouldMatchOnBlank: item.shouldMatchOnBlank,
      };
    });
    return { label: match.label, criteria: matchCriteria };
  });
  requireValid(Array.isArray(raw.reconciliationRules) && raw.reconciliationRules.length === 6);
  const bindings: IdentityResolutionProjection['expectations']['outputs'] = [];
  const generatedNames = new Set<string>();
  const reconciliationRules = raw.reconciliationRules.map((value, index) => {
    const item = record(value, [
      'entityName',
      'fields',
      'linkDmoName',
      'ruleType',
      'shouldIgnoreEmptyValue',
      'sources',
      'unifiedDmoName',
    ]);
    requireValid(item.entityName === entities[index]);
    if (!nativeMode)
      requireValid(
        (item.ruleType === 'lastupdated' || (index === 0 && item.ruleType === 'mostfrequent')) &&
          item.shouldIgnoreEmptyValue === true &&
          isDeepStrictEqual(item.fields, []) &&
          isDeepStrictEqual(item.sources, []),
      );
    const identities = outputs(apiName, entities[index]);
    for (const [roleIndex, key] of ['unifiedDmoName', 'linkDmoName'].entries()) {
      const name = item[key];
      requireValid(
        typeof name === 'string' &&
          /^[A-Za-z][A-Za-z0-9_]*__dlm$/u.test(name) &&
          !generatedNames.has(name),
      );
      generatedNames.add(name);
      bindings.push({ identity: identities[roleIndex], sourceApiName: name });
    }
    return {
      entity: dmo(entities[index]),
      ...projectSettings(item),
      fields: projectOverrides(item.fields, entities[index]),
      outputs: identities,
    };
  });
  const candidate = validateIdentityResolutionDocument({
    schemaVersion: 1,
    kind: 'identity-resolution',
    identity: { dataSpace: 'default', apiName: raw.objectApiName },
    spec: {
      configurationType: 'Individual',
      label: raw.label,
      description: raw.description,
      doesRunAutomatically: raw.doesRunAutomatically,
      isCaseSensitive: raw.isCaseSensitive,
      secondaryDmo: dmo(entities[0]),
      filters,
      ...(nativeMode ? { trustedSources: nativeRaw.trustedSources } : {}),
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
 * Normalize only earned lowercase wire enums and ordered source references.
 * @param {Record<string, unknown>} item Exact native settings.
 * @returns {object} Portable settings.
 */
function projectSettings(item: Record<string, unknown>): object {
  const ruleType = ['LastUpdated', 'MostFrequent', 'SourceSequence'].find(
    (name) => name.toLowerCase() === item.ruleType,
  );
  requireValid(ruleType && Array.isArray(item.sources));
  return {
    ruleType,
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
