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
  identity: { apiName: string; dataSpace: string };
  spec: {
    label: string;
    category: string;
    description?: string;
    fields: NativeDmoField[];
    [key: string]: unknown;
  };
};

/**
 * Compare categories the way the API does: input is case-insensitive, reads are upper case.
 * @param {string} left One category spelling.
 * @param {string} right Another category spelling.
 * @returns {boolean} Whether both name the same category.
 */
export function sameDmoCategory(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * What may be written on an existing DMO, decided from its raw read alone.
 * 'custom': everything this plugin writes, including deleting the DMO.
 * 'standard': custom fields, the object label and the object description only.
 * 'refused': nothing.
 */
export type NativeDmoWriteScope = 'custom' | 'standard' | 'refused';

/**
 * Classify an existing DMO for writes. A customer-created DMO with an unprefixed name is
 * 'custom', a Salesforce standard DMO is 'standard', and everything else is 'refused':
 * platform-generated DMOs (any other creationType), a read without a creationType and a
 * custom creationType under a namespaced name.
 * @param {Record<string, unknown>} raw Direct native read.
 * @returns {NativeDmoWriteScope} Write scope of the target.
 */
export function nativeDmoWriteScope(raw: Record<string, unknown>): NativeDmoWriteScope {
  if (typeof raw.name !== 'string') return 'refused';
  if (raw.creationType === 'Standard') return 'standard';
  return raw.creationType === 'Custom' && !raw.name.slice(0, -'__dlm'.length).includes('__')
    ? 'custom'
    : 'refused';
}

/**
 * Only customer-created DMOs with an unprefixed name are deletable.
 * @param {Record<string, unknown>} raw Direct native read.
 * @returns {boolean} Whether the target is a custom, non-namespaced DMO.
 */
export function isCustomNativeDmo(raw: Record<string, unknown>): boolean {
  return nativeDmoWriteScope(raw) === 'custom';
}

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
export const nativeDmoFieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
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
 * Validate only the document shape, retaining field definitions and any extra spec keys.
 * Category, data types, label length and key rules are left to the API.
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
    document.schemaVersion !== 1 ||
    document.kind !== 'dmo' ||
    typeof identity.apiName !== 'string' ||
    !nativeDmoName.test(identity.apiName) ||
    typeof identity.dataSpace !== 'string' ||
    !identity.dataSpace.trim() ||
    identity.dataSpace !== identity.dataSpace.trim() ||
    [...identity.dataSpace].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0)! === 127,
    ) ||
    typeof spec.label !== 'string' ||
    !spec.label.trim() ||
    typeof spec.category !== 'string' ||
    !spec.category.trim() ||
    (spec.description !== undefined && typeof spec.description !== 'string') ||
    // Identity lives in `identity`; runtime observations are never authored input.
    Object.keys(spec).some(
      (key) => key === 'name' || key === 'dataSpaceName' || runtimeKeys.has(key),
    ) ||
    !Array.isArray(spec.fields) ||
    spec.fields.length === 0
  )
    throw new NativeDmoError('INVALID_DMO_DOCUMENT');
  const names = new Set<string>();
  for (const value of spec.fields) {
    const field = record(value);
    if (
      typeof field.name !== 'string' ||
      !nativeDmoFieldName.test(field.name) ||
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
 * @param {string} [dataSpace] Optional expected observed scope.
 * @returns {NativeDmoDocument} Portable definition with authoritative observed scope.
 */
export function normalizeNativeDmo(value: unknown, dataSpace?: string): NativeDmoDocument {
  const object = unwrapNativeDmo(value);
  if (dataSpace !== undefined && object.dataSpaceName !== dataSpace)
    throw new NativeDmoError('UNSUPPORTED_DMO_DATASPACE');
  return validateNativeDmoDocument({
    schemaVersion: 1,
    kind: 'dmo',
    identity: { apiName: object.name, dataSpace: object.dataSpaceName },
    spec: {
      label: object.label,
      // Reads are upper case (OTHER, SEGMENT_MEMBERSHIP); save the documented input spelling.
      category:
        typeof object.category === 'string'
          ? object.category
              .split('_')
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
              .join('_')
          : object.category,
      ...(typeof object.description === 'string' && object.description
        ? { description: object.description }
        : {}),
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
