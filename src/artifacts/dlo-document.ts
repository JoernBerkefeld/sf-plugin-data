export type DloField = {
  name: string;
  label: string;
  dataType: string;
  isPrimaryKey: boolean;
  [key: string]: unknown;
};

export type DloDocument = {
  schemaVersion: 1;
  kind: 'dlo';
  identity: { apiName: string; dataSpace: 'default' };
  spec: { label: string; category: string; fields: DloField[] };
};

/** Payload-free native DLO refusal, with an authoritative HTTP status when available. */
export class DloError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Native DLO operation refused: ${code}.`);
    this.name = 'DloError';
  }
}

export const dloName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dll$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
const runtimeFieldKeys = new Set(['id', 'recordId', 'recordID', 'createdDate', 'lastModifiedDate']);

/**
 * Require a plain JSON object.
 * @param {unknown} value Untrusted input.
 * @returns {Record<string, unknown>} Object content.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DloError('INVALID_DLO_DOCUMENT');
  return value as Record<string, unknown>;
}

/**
 * Validate a portable native DLO document without losing additional field definitions.
 * @param {unknown} value Untrusted saved document.
 * @returns {DloDocument} Checked document.
 */
export function validateDloDocument(value: unknown): DloDocument {
  const document = record(value);
  const identity = record(document.identity);
  const spec = record(document.spec);
  if (
    Object.keys(document).length !== 4 ||
    !['identity', 'kind', 'schemaVersion', 'spec'].every((key) => Object.hasOwn(document, key)) ||
    Object.keys(identity).length !== 2 ||
    !['apiName', 'dataSpace'].every((key) => Object.hasOwn(identity, key)) ||
    Object.keys(spec).length !== 3 ||
    !['category', 'fields', 'label'].every((key) => Object.hasOwn(spec, key)) ||
    document.schemaVersion !== 1 ||
    document.kind !== 'dlo' ||
    typeof identity.apiName !== 'string' ||
    !dloName.test(identity.apiName) ||
    identity.dataSpace !== 'default' ||
    typeof spec.label !== 'string' ||
    !spec.label.trim() ||
    spec.label.length > 40 ||
    typeof spec.category !== 'string' ||
    !spec.category ||
    !Array.isArray(spec.fields) ||
    spec.fields.length === 0
  )
    throw new DloError('INVALID_DLO_DOCUMENT');
  const names = new Set<string>();
  for (const value of spec.fields) {
    const field = record(value);
    if (
      typeof field.name !== 'string' ||
      !fieldName.test(field.name) ||
      names.has(field.name.toLowerCase()) ||
      typeof field.label !== 'string' ||
      !field.label ||
      typeof field.dataType !== 'string' ||
      !field.dataType ||
      typeof field.isPrimaryKey !== 'boolean' ||
      Object.keys(field).some((key) => runtimeFieldKeys.has(key))
    )
      throw new DloError('INVALID_DLO_FIELD');
    names.add(field.name.toLowerCase());
  }
  if (spec.fields.filter((field) => record(field).isPrimaryKey === true).length !== 1)
    throw new DloError('INVALID_DLO_PRIMARY_KEY');
  return structuredClone(value) as DloDocument;
}

/**
 * Unwrap exactly one native GET object or a POST/PATCH single-object response.
 * @param {unknown} value Native response.
 * @returns {Record<string, unknown>} Single native object with target runtime identity retained.
 */
export function unwrapDlo(value: unknown): Record<string, unknown> {
  const response = record(value);
  if (!Object.hasOwn(response, 'dataLakeObjects')) return response;
  if (!Array.isArray(response.dataLakeObjects) || response.dataLakeObjects.length !== 1)
    throw new DloError('AMBIGUOUS_DLO_RESPONSE');
  return record(response.dataLakeObjects[0]);
}

/**
 * Save definition fields, including generated fields, without runtime/wrapper duplication.
 * @param {unknown} value Native API GET or write response.
 * @returns {DloDocument} Portable API68/default document.
 */
export function normalizeDlo(value: unknown): DloDocument {
  const object = unwrapDlo(value);
  if (
    !Array.isArray(object.dataSpaceInfo) ||
    object.dataSpaceInfo.length !== 1 ||
    record(object.dataSpaceInfo[0]).name !== 'default'
  )
    throw new DloError('UNSUPPORTED_DLO_DATASPACE');
  const fields = object.dataLakeFieldInfoRepresentation ?? object.fields;
  if (!Array.isArray(fields)) throw new DloError('INVALID_DLO_RESPONSE');
  return validateDloDocument({
    schemaVersion: 1,
    kind: 'dlo',
    identity: { apiName: object.name, dataSpace: 'default' },
    spec: {
      label: object.label,
      category: object.category,
      fields: fields.map((field) =>
        Object.fromEntries(
          Object.entries(record(field)).filter(([key]) => !runtimeFieldKeys.has(key)),
        ),
      ),
    },
  });
}
