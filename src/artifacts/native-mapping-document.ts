export type NativeMappingField = {
  sourceFieldDeveloperName: string;
  targetFieldDeveloperName: string;
  developerName?: string;
};

export type NativeMappingDocument = {
  schemaVersion: 1;
  kind: 'mapping';
  identity: { apiName: string; dataSpace: string };
  spec: {
    sourceEntityDeveloperName: string;
    targetEntityDeveloperName: string;
    fieldMappings: NativeMappingField[];
  };
};

/** Payload-free refusal for the isolated mapping boundary. */
export class NativeMappingError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Native mapping operation refused: ${code}.`);
    this.name = 'NativeMappingError';
  }
}

export const nativeMappingName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
export const mappingDloName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dll$/u;
export const mappingDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
const fieldSelector = /^[A-Za-z][A-Za-z0-9_]{0,499}$/u;

/**
 * Require an object at the mapping boundary.
 * @param {unknown} value Untrusted input.
 * @returns {Record<string, unknown>} Object content.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeMappingError('INVALID_MAPPING_DOCUMENT');
  return value as Record<string, unknown>;
}

/**
 * Validate portable bindings and retain every pair and observed field selector.
 * Saved mapping names identify source artifacts, not a recreated target mapping.
 * @param {unknown} value Portable input.
 * @returns {NativeMappingDocument} Checked independent copy.
 */
export function validateNativeMappingDocument(value: unknown): NativeMappingDocument {
  const document = record(value);
  const identity = record(document.identity);
  const spec = record(document.spec);
  if (
    Object.keys(document).length !== 4 ||
    !['identity', 'kind', 'schemaVersion', 'spec'].every((key) => Object.hasOwn(document, key)) ||
    Object.keys(identity).length !== 2 ||
    Object.keys(spec).length !== 3 ||
    document.schemaVersion !== 1 ||
    document.kind !== 'mapping' ||
    typeof identity.apiName !== 'string' ||
    !nativeMappingName.test(identity.apiName) ||
    typeof identity.dataSpace !== 'string' ||
    !identity.dataSpace.trim() ||
    identity.dataSpace !== identity.dataSpace.trim() ||
    [...identity.dataSpace].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    ) ||
    typeof spec.sourceEntityDeveloperName !== 'string' ||
    !mappingDloName.test(spec.sourceEntityDeveloperName) ||
    typeof spec.targetEntityDeveloperName !== 'string' ||
    !mappingDmoName.test(spec.targetEntityDeveloperName) ||
    !Array.isArray(spec.fieldMappings) ||
    spec.fieldMappings.length === 0
  )
    throw new NativeMappingError('INVALID_MAPPING_DOCUMENT');
  const pairs = new Set<string>();
  const selectors = new Set<string>();
  for (const value of spec.fieldMappings) {
    const field = record(value);
    const pair =
      `${field.sourceFieldDeveloperName}:${field.targetFieldDeveloperName}`.toLowerCase();
    if (
      Object.keys(field).some(
        (key) =>
          !['developerName', 'sourceFieldDeveloperName', 'targetFieldDeveloperName'].includes(key),
      ) ||
      typeof field.sourceFieldDeveloperName !== 'string' ||
      !fieldName.test(field.sourceFieldDeveloperName) ||
      typeof field.targetFieldDeveloperName !== 'string' ||
      !fieldName.test(field.targetFieldDeveloperName) ||
      pairs.has(pair) ||
      (field.developerName !== undefined &&
        (typeof field.developerName !== 'string' ||
          !fieldSelector.test(field.developerName) ||
          selectors.has(field.developerName.toLowerCase())))
    )
      throw new NativeMappingError('INVALID_MAPPING_FIELD');
    pairs.add(pair);
    if (typeof field.developerName === 'string') selectors.add(field.developerName.toLowerCase());
  }
  return structuredClone(value) as NativeMappingDocument;
}

/**
 * Unwrap a detail response without accepting collection or CLI envelopes.
 * @param {unknown} value Native detail response.
 * @returns {Record<string, unknown>} Direct representation.
 */
export function unwrapNativeMapping(value: unknown): Record<string, unknown> {
  const object = record(value);
  if (typeof object.developerName !== 'string' || !Array.isArray(object.fieldMappings))
    throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
  return object;
}

/**
 * Save logical bindings and every returned pair, without runtime mapping status or IDs.
 * @param {unknown} value Direct native response.
 * @param {string} [dataSpace] Local effective context; omitted native scope means default, not HTTP injection.
 * @returns {NativeMappingDocument} Portable definition, not a write payload.
 */
export function normalizeNativeMapping(
  value: unknown,
  dataSpace = 'default',
): NativeMappingDocument {
  const object = unwrapNativeMapping(value);
  if (object.dataSpaceName !== undefined && object.dataSpaceName !== dataSpace)
    throw new NativeMappingError('UNSUPPORTED_MAPPING_DATASPACE');
  return validateNativeMappingDocument({
    schemaVersion: 1,
    kind: 'mapping',
    identity: { apiName: object.developerName, dataSpace },
    spec: {
      sourceEntityDeveloperName: object.sourceEntityDeveloperName,
      targetEntityDeveloperName: object.targetEntityDeveloperName,
      fieldMappings: object.fieldMappings,
    },
  });
}

/**
 * Unwrap only the documented collection wrapper; do not infer pagination completeness.
 * @param {unknown} value Native collection response.
 * @param {string} [dataSpace] Local effective scope for every entry.
 * @returns {Record<string, unknown>[]} Checked detail representations.
 */
export function unwrapNativeMappingCollection(
  value: unknown,
  dataSpace = 'default',
): Record<string, unknown>[] {
  const object = record(value);
  if (!Array.isArray(object.objectSourceTargetMaps))
    throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
  return object.objectSourceTargetMaps.map((entry) => {
    const detail = unwrapNativeMapping(entry);
    normalizeNativeMapping(detail, dataSpace);
    return detail;
  });
}
