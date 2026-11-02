export type NativeDmoField = {
  name: string;
  label: string;
  dataType: string;
  isPrimaryKey: boolean;
  [key: string]: unknown;
};

export type NativeDmoDocument = {
  schemaVersion: 1;
  kind: 'dmo';
  identity: { apiName: string; dataSpace: 'default' };
  spec: { label: string; category: 'Other'; fields: NativeDmoField[] };
};

/** Payload-free refusal for the isolated native DMO boundary. */
export class NativeDmoError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Native DMO operation refused: ${code}.`);
    this.name = 'NativeDmoError';
  }
}

export const nativeDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
const runtimeKeys = new Set([
  'id',
  'recordId',
  'recordID',
  'createdDate',
  'lastModifiedDate',
  'isEnabled',
  'isEditable',
  'isSegmentable',
  'status',
]);

/**
 * Require a JSON object.
 * @param {unknown} value Untrusted input.
 * @returns {Record<string, unknown>} Object content.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeDmoError('INVALID_DMO_DOCUMENT');
  return value as Record<string, unknown>;
}

/**
 * Validate the canonical default-space document, retaining field definitions.
 * @param {unknown} value Portable input.
 * @returns {NativeDmoDocument} Checked independent copy.
 */
export function validateNativeDmoDocument(value: unknown): NativeDmoDocument {
  const document = record(value);
  const identity = record(document.identity);
  const spec = record(document.spec);
  if (
    Object.keys(document).length !== 4 ||
    !['identity', 'kind', 'schemaVersion', 'spec'].every((key) => Object.hasOwn(document, key)) ||
    Object.keys(identity).length !== 2 ||
    Object.keys(spec).length !== 3 ||
    document.schemaVersion !== 1 ||
    document.kind !== 'dmo' ||
    typeof identity.apiName !== 'string' ||
    !nativeDmoName.test(identity.apiName) ||
    identity.dataSpace !== 'default' ||
    typeof spec.label !== 'string' ||
    !spec.label.trim() ||
    spec.label.length > 40 ||
    spec.category !== 'Other' ||
    !Array.isArray(spec.fields) ||
    spec.fields.length === 0
  )
    throw new NativeDmoError('INVALID_DMO_DOCUMENT');
  const names = new Set<string>();
  for (const value of spec.fields) {
    const field = record(value);
    if (
      typeof field.name !== 'string' ||
      !fieldName.test(field.name) ||
      names.has(field.name.toLowerCase()) ||
      typeof field.label !== 'string' ||
      !field.label.trim() ||
      typeof field.dataType !== 'string' ||
      !field.dataType ||
      typeof field.isPrimaryKey !== 'boolean' ||
      Object.keys(field).some((key) => runtimeKeys.has(key) || key === 'type')
    )
      throw new NativeDmoError('INVALID_DMO_FIELD');
    names.add(field.name.toLowerCase());
  }
  if (spec.fields.filter((field) => record(field).isPrimaryKey === true).length !== 1)
    throw new NativeDmoError('INVALID_DMO_PRIMARY_KEY');
  return structuredClone(value) as NativeDmoDocument;
}

/**
 * Unwrap only the direct single-object native DMO representation.
 * @param {unknown} value Native response.
 * @returns {Record<string, unknown>} Direct object.
 */
export function unwrapNativeDmo(value: unknown): Record<string, unknown> {
  const object = record(value);
  if (typeof object.name !== 'string' || !Array.isArray(object.fields))
    throw new NativeDmoError('INVALID_DMO_RESPONSE');
  return object;
}

/**
 * Normalize API65 output type names and retain generated field definitions, not runtime IDs.
 * @param {unknown} value Direct native response.
 * @returns {NativeDmoDocument} Portable default-space definition.
 */
export function normalizeNativeDmo(value: unknown): NativeDmoDocument {
  const object = unwrapNativeDmo(value);
  if (object.dataSpaceName !== 'default') throw new NativeDmoError('UNSUPPORTED_DMO_DATASPACE');
  return validateNativeDmoDocument({
    schemaVersion: 1,
    kind: 'dmo',
    identity: { apiName: object.name, dataSpace: 'default' },
    spec: {
      label: object.label,
      category: object.category === 'OTHER' ? 'Other' : object.category,
      fields: (object.fields as unknown[]).map((value) => {
        const field = record(value);
        if (
          typeof field.type !== 'string' ||
          (field.dataType !== undefined && field.dataType !== field.type) ||
          (field.isPrimaryKey !== undefined && typeof field.isPrimaryKey !== 'boolean')
        )
          throw new NativeDmoError('INVALID_DMO_FIELD');
        return {
          ...Object.fromEntries(
            Object.entries(field).filter(([key]) => !runtimeKeys.has(key) && key !== 'type'),
          ),
          dataType: field.type,
          isPrimaryKey: field.isPrimaryKey ?? false,
        };
      }),
    },
  });
}
