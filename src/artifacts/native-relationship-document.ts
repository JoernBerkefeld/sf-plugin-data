export type NativeRelationshipSpec = {
  sourceObjectName: string;
  sourceFieldName: string;
  targetObjectName: string;
  targetFieldName: string;
  cardinality: string;
  relationshipOwner: string;
};

export type NativeRelationshipDocument = {
  schemaVersion: 1;
  kind: 'relationship';
  identity: { apiName: string; dataSpace: string };
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

export const nativeRelationshipName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
export const relationshipDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
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
 * Validate the portable relationship structurally. Cardinality and owner are sent as authored;
 * Salesforce decides which values it accepts.
 * @param {unknown} value Portable input.
 * @returns {NativeRelationshipDocument} Checked independent copy.
 */
export function validateNativeRelationshipDocument(value: unknown): NativeRelationshipDocument {
  const document = record(value);
  const identity = record(document.identity);
  const spec = record(document.spec);
  if (
    Object.keys(document).length !== 4 ||
    !['identity', 'kind', 'schemaVersion', 'spec'].every((key) => Object.hasOwn(document, key)) ||
    Object.keys(identity).length !== 2 ||
    document.schemaVersion !== 1 ||
    document.kind !== 'relationship' ||
    typeof identity.apiName !== 'string' ||
    !nativeRelationshipName.test(identity.apiName) ||
    !plain(identity.dataSpace) ||
    Object.keys(spec).length !== specKeys.length ||
    !specKeys.every((key) => Object.hasOwn(spec, key)) ||
    typeof spec.sourceObjectName !== 'string' ||
    !relationshipDmoName.test(spec.sourceObjectName) ||
    typeof spec.targetObjectName !== 'string' ||
    !relationshipDmoName.test(spec.targetObjectName) ||
    typeof spec.sourceFieldName !== 'string' ||
    !fieldName.test(spec.sourceFieldName) ||
    typeof spec.targetFieldName !== 'string' ||
    !fieldName.test(spec.targetFieldName) ||
    !plain(spec.cardinality) ||
    !plain(spec.relationshipOwner)
  )
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_DOCUMENT');
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
 * Read one entry of a native relationship list: names and values must be strings.
 * @param {unknown} value Native list entry.
 * @returns {ObservedRelationship} Flat observation, not yet a portable document.
 */
export function observeNativeRelationship(value: unknown): ObservedRelationship {
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
  if (Object.values(observed).some((part) => typeof part !== 'string'))
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE');
  return observed as ObservedRelationship;
}

/**
 * Save the authored binding without the generated id, labels, status or creation type.
 * @param {unknown} value Native list entry.
 * @param {string} [dataSpace] Local effective scope.
 * @returns {NativeRelationshipDocument} Portable definition.
 */
export function normalizeNativeRelationship(
  value: unknown,
  dataSpace = 'default',
): NativeRelationshipDocument {
  const observed = observeNativeRelationship(value);
  return validateNativeRelationshipDocument({
    schemaVersion: 1,
    kind: 'relationship',
    identity: { apiName: observed.name, dataSpace },
    spec: relationshipSpec(observed),
  });
}

/**
 * The authored part of a relationship, in the order of the create body.
 * @param {NativeRelationshipSpec} value Observation or document spec.
 * @returns {NativeRelationshipSpec} Exactly the six authored values.
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
