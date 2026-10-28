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
    matchRules: Array<{
      label: string;
      criteria: Array<{
        field: IdentityResolutionFieldReference;
        matchMethodType: 'Fuzzy' | 'Exact' | 'ExactNormalized';
        caseSensitiveMatch: false;
        shouldMatchOnBlank: false;
      }>;
    }>;
    reconciliationRules: Array<{
      entity: IdentityResolutionDmoReference;
      ruleType: 'LastUpdated' | 'MostFrequent';
      shouldIgnoreEmptyValue: true;
      fields: [];
      sources: [];
      outputs: IdentityResolutionOutputIdentity[];
    }>;
  };
};
export type IdentityResolutionProjection = {
  candidate: IdentityResolutionDocument;
  expectations: {
    facade: Record<string, unknown>;
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
  ]);
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
  requireValid(Array.isArray(spec.matchRules) && spec.matchRules.length === 1);
  const rule = record(spec.matchRules[0], ['label', 'criteria']);
  text(rule.label);
  requireValid(Array.isArray(rule.criteria) && rule.criteria.length === 3);
  for (const [index, expected] of criteria.entries()) {
    const criterion = record(rule.criteria[index], [
      'field',
      'matchMethodType',
      'caseSensitiveMatch',
      'shouldMatchOnBlank',
    ]);
    requireValid(
      isDeepStrictEqual(criterion.field, field(expected[0], expected[1])) &&
        criterion.matchMethodType === expected[2] &&
        criterion.caseSensitiveMatch === false &&
        criterion.shouldMatchOnBlank === false,
    );
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
    requireValid(
      isDeepStrictEqual(reconciliation.entity, dmo(entity)) &&
        reconciliation.shouldIgnoreEmptyValue === true &&
        isDeepStrictEqual(reconciliation.fields, []) &&
        isDeepStrictEqual(reconciliation.sources, []),
    );
    requireValid(
      reconciliation.ruleType === 'LastUpdated' ||
        (index === 0 && reconciliation.ruleType === 'MostFrequent'),
    );
    requireValid(isDeepStrictEqual(reconciliation.outputs, outputs(identity.apiName, entity)));
  }
  return structuredClone(value) as IdentityResolutionDocument;
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
  json(facade);
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
  const raw = record(facade, keys);
  const nativeRaw = record(
    native,
    keys.filter((key) => key !== 'filters'),
  );
  const { filters, ...withoutFilters } = raw;
  requireValid(isDeepStrictEqual(filters, []) && isDeepStrictEqual(withoutFilters, nativeRaw));
  requireValid(
    raw.objectApiName === apiName &&
      raw.dataSpaceName === 'default' &&
      raw.configurationType === 'individual' &&
      raw.secondaryDmo === entities[0],
  );
  text(raw.id);
  requireValid(typeof raw.rulesetId === 'string' && /^[A-Za-z0-9]{4}$/u.test(raw.rulesetId));
  if (raw.rulesetStatus !== 'PUBLISHED')
    throw new IdentityResolutionError('IDENTITY_RESOLUTION_NOT_SETTLED');
  requireValid(Array.isArray(raw.matchRules) && raw.matchRules.length === 1);
  const match = record(raw.matchRules[0], ['criteria', 'label']);
  requireValid(Array.isArray(match.criteria) && match.criteria.length === 3);
  const matchCriteria = match.criteria.map((value, index) => {
    const item = record(value, [
      'caseSensitiveMatch',
      'entityName',
      'fieldName',
      'matchMethodType',
      'shouldMatchOnBlank',
    ]);
    const expected = criteria[index];
    requireValid(
      item.entityName === expected[0] &&
        item.fieldName === expected[1] &&
        item.matchMethodType === expected[2].toLowerCase(),
    );
    return {
      field: field(expected[0], expected[1]),
      matchMethodType: expected[2],
      caseSensitiveMatch: item.caseSensitiveMatch,
      shouldMatchOnBlank: item.shouldMatchOnBlank,
    };
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
    requireValid(
      item.ruleType === 'lastupdated' || (index === 0 && item.ruleType === 'mostfrequent'),
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
      fields: item.fields,
      sources: item.sources,
      shouldIgnoreEmptyValue: item.shouldIgnoreEmptyValue,
      ruleType: item.ruleType === 'lastupdated' ? 'LastUpdated' : 'MostFrequent',
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
      matchRules: [{ label: match.label, criteria: matchCriteria }],
      reconciliationRules,
    },
  });
  return {
    candidate,
    expectations: {
      facade: structuredClone(raw),
      native: structuredClone(nativeRaw),
      outputs: structuredClone(bindings),
    },
  };
}

/**
 * Serialize complete admitted portable content, never private acquisition expectations.
 * @param {unknown} value Portable candidate.
 * @returns {string} Stable JSON bytes with final LF.
 */
export function serializeIdentityResolutionDocument(value: unknown): string {
  return `${JSON.stringify(validateIdentityResolutionDocument(value), undefined, 2)}\n`;
}
