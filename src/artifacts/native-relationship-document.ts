import { nativeRelationshipName } from './path-selector.js';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';
import { dataSpaceKey, readSingleDataSpace, refuseLegacyDataSpace } from './data-space-field.js';

export type NativeRelationshipSpec = {
  sourceObjectName: string;
  sourceFieldName: string;
  targetObjectName: string;
  targetFieldName: string;
  cardinality: string;
  relationshipOwner: string;
  /** Optional label (Metadata API masterLabel); absent leaves the org's label as it is. */
  label?: string;
};

export type NativeRelationshipDocument = {
  schemaVersion: 1;
  kind: 'relationship';
  /** The data space the relationship belongs to (file key `c__dataSpace`). */
  c__dataSpace: string;
  identity: { apiName: string };
  spec: NativeRelationshipSpec;
};

/** One relationship as the native list reports it; fields are type-checked, not admitted. */
export type ObservedRelationship = NativeRelationshipSpec & { name: string; status: string };

/** Payload-free refusal for the isolated relationship boundary. */
export class NativeRelationshipError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Native relationship operation refused: ${code}.`);
    this.name = 'NativeRelationshipError';
  }
}

export const relationshipDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
// The target may be a DMO or a CRM object (owner SObject, e.g. Account.Id): any API name.
const targetObjectName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const targetFieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
const specKeys = [
  'cardinality',
  'relationshipOwner',
  'sourceFieldName',
  'sourceObjectName',
  'targetFieldName',
  'targetObjectName',
];

/**
 * Require an object at the relationship boundary.
 * @param {unknown} value Untrusted input.
 * @param {string} code Refusal code.
 * @returns {Record<string, unknown>} Object content.
 */
function record(value: unknown, code = 'INVALID_RELATIONSHIP_DOCUMENT'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeRelationshipError(code);
  return value as Record<string, unknown>;
}

/**
 * A trimmed, non-empty string without control characters.
 * @param {unknown} value Untrusted value.
 * @returns {boolean} Whether it is a plain token.
 */
function plain(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value === value.trim() &&
    ![...value].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    )
  );
}

/**
 * Refuse an authored relationship file, naming the key path that cannot be deployed.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {NativeRelationshipError} Refusal with an explanation.
 */
function refuse(keyPath: string, problem: string): NativeRelationshipError {
  return refuseWith('INVALID_RELATIONSHIP_DOCUMENT', keyPath, problem);
}

/**
 * Refuse an authored relationship file with a given code, naming the key path.
 * @param {string} code Refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {NativeRelationshipError} Refusal with an explanation.
 */
function refuseWith(code: string, keyPath: string, problem: string): NativeRelationshipError {
  return explainInput(
    new NativeRelationshipError(code),
    `The relationship file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the relationship again once the plugin supports it.`,
  );
}

/**
 * Require a JSON object at a key path of the file.
 * @param {unknown} value Untrusted input.
 * @param {string} keyPath Printable key path.
 * @returns {Record<string, unknown>} Object content.
 */
function objectAt(value: unknown, keyPath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse(keyPath, 'must be an object');
  return value as Record<string, unknown>;
}

/**
 * Refuse a key outside the given set and a missing one.
 * @param {Record<string, unknown>} value Object of the file.
 * @param {string} prefix Key path of the object, with a trailing dot (empty at the top).
 * @param {string[]} keys Keys it must hold.
 * @param {string[]} [optional] Keys it may hold besides.
 */
function closedKeys(
  value: Record<string, unknown>,
  prefix: string,
  keys: string[],
  optional: string[] = [],
): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key) && !optional.includes(key))
      throw refuse(`${prefix}${printableKey(key)}`, 'is not a key a relationship file can hold');
  for (const key of keys)
    if (!Object.hasOwn(value, key)) throw refuse(`${prefix}${key}`, 'is missing');
}

/**
 * Validate the portable relationship structurally. Cardinality, owner and the optional label are
 * sent as authored;
 * Salesforce decides which values it accepts. Deploy mode (the default) names the first offending
 * key path; retrieve mode keeps what the org returned (unknown keys, null or missing values, any
 * field names) and checks only what names and places the file.
 * @param {unknown} value Portable input.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {NativeRelationshipDocument} Checked independent copy.
 */
export function validateNativeRelationshipDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): NativeRelationshipDocument {
  const document = objectAt(value, 'the document');
  const identity = objectAt(document.identity, 'identity');
  const spec = objectAt(document.spec, 'spec');
  if (document.schemaVersion !== 1) throw refuse('schemaVersion', 'must be 1');
  if (document.kind !== 'relationship') throw refuse('kind', 'must be "relationship"');
  if (typeof identity.apiName !== 'string' || !nativeRelationshipName.test(identity.apiName))
    throw refuse('identity.apiName', 'must be a relationship API name');
  refuseLegacyDataSpace(identity, refuseWith);
  readSingleDataSpace(document, refuseWith);
  if (mode === 'retrieve') return structuredClone(value) as NativeRelationshipDocument;
  closedKeys(document, '', [dataSpaceKey, 'identity', 'kind', 'schemaVersion', 'spec']);
  closedKeys(identity, 'identity.', ['apiName']);
  closedKeys(spec, 'spec.', specKeys, ['label']);
  const checks: Array<[string, (value: unknown) => boolean, string]> = [
    [
      'sourceObjectName',
      (part) => typeof part === 'string' && relationshipDmoName.test(part),
      'must be a data model object API name ending in __dlm',
    ],
    [
      'sourceFieldName',
      (part) => typeof part === 'string' && fieldName.test(part),
      'must be a field API name ending in __c',
    ],
    [
      'targetObjectName',
      (part) => typeof part === 'string' && targetObjectName.test(part),
      'must be an object API name',
    ],
    [
      'targetFieldName',
      (part) => typeof part === 'string' && targetFieldName.test(part),
      'must be a field API name',
    ],
    ['cardinality', plain, 'must be a non-empty text'],
    ['relationshipOwner', plain, 'must be a non-empty text'],
  ];
  for (const [key, check, problem] of checks)
    if (!check(spec[key])) throw refuse(`spec.${key}`, problem);
  if (Object.hasOwn(spec, 'label') && !plain(spec.label))
    throw refuse('spec.label', 'must be a non-empty text');
  return structuredClone(value) as NativeRelationshipDocument;
}

/**
 * The name of a nested object or field reference of a list entry.
 * @param {unknown} part Nested reference.
 * @returns {unknown} Its name, unchecked.
 */
function name(part: unknown): unknown {
  return part && typeof part === 'object' && !Array.isArray(part)
    ? (part as Record<string, unknown>).name
    : undefined;
}

/**
 * Read one entry of a native relationship list: names and values must be strings, except in
 * retrieve mode, which takes them as listed (an entry the retrieve keeps is checked when its
 * document is built; one it does not keep is never checked).
 * @param {unknown} value Native list entry.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (as listed).
 * @returns {ObservedRelationship} Flat observation, not yet a portable document.
 */
export function observeNativeRelationship(
  value: unknown,
  mode: DocumentMode = 'deploy',
): ObservedRelationship {
  const entry = record(value, 'INVALID_RELATIONSHIP_RESPONSE');
  const observed = {
    name: entry.name,
    status: entry.status,
    sourceObjectName: name(entry.sourceObject),
    sourceFieldName: name(entry.sourceField),
    targetObjectName: name(entry.targetObject),
    targetFieldName: name(entry.targetField),
    cardinality: entry.cardinality,
    relationshipOwner: entry.owner,
  };
  if (mode === 'deploy' && Object.values(observed).some((part) => typeof part !== 'string'))
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE');
  return observed as ObservedRelationship;
}

/**
 * Save the authored binding without the generated id, labels, status or creation type.
 * @param {unknown} value Native list entry.
 * @param {string} dataSpace The data space the relationship was listed in (the run's).
 * @param {DocumentMode} [mode] `retrieve` keeps null or missing values as listed.
 * @returns {NativeRelationshipDocument} Portable definition.
 */
export function normalizeNativeRelationship(
  value: unknown,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): NativeRelationshipDocument {
  const observed = observeNativeRelationship(value, mode);
  return validateNativeRelationshipDocument(
    {
      schemaVersion: 1,
      kind: 'relationship',
      [dataSpaceKey]: dataSpace,
      identity: { apiName: observed.name },
      spec: relationshipSpec(observed),
    },
    mode,
  );
}

/**
 * The authored binding, cardinality and owner of a relationship, in the order of the create body
 * (the label is not part of it).
 * @param {NativeRelationshipSpec} value Observation or document spec.
 * @returns {NativeRelationshipSpec} Exactly the six values of the create body.
 */
export function relationshipSpec(value: NativeRelationshipSpec): NativeRelationshipSpec {
  return {
    sourceObjectName: value.sourceObjectName,
    sourceFieldName: value.sourceFieldName,
    targetObjectName: value.targetObjectName,
    targetFieldName: value.targetFieldName,
    cardinality: value.cardinality,
    relationshipOwner: value.relationshipOwner,
  };
}

/**
 * Whether an observation carries the binding of a document: both objects and both fields.
 * @param {NativeRelationshipSpec} observed Native observation.
 * @param {NativeRelationshipSpec} desired Portable spec.
 * @returns {boolean} Exact binding match.
 */
export function sameRelationshipBinding(
  observed: NativeRelationshipSpec,
  desired: NativeRelationshipSpec,
): boolean {
  return (
    observed.sourceObjectName === desired.sourceObjectName &&
    observed.sourceFieldName === desired.sourceFieldName &&
    observed.targetObjectName === desired.targetObjectName &&
    observed.targetFieldName === desired.targetFieldName
  );
}

export { nativeRelationshipName } from './path-selector.js';
