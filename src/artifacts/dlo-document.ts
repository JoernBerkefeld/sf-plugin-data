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
  identity: { apiName: string; dataSpace: string };
  spec: {
    label: string;
    category: string;
    /** Engagement DLOs: the DateTime field that dates each record; fixed after create. */
    eventDateTimeFieldName?: string;
    fields: DloField[];
  };
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
    Object.keys(spec).length !== (Object.hasOwn(spec, 'eventDateTimeFieldName') ? 4 : 3) ||
    !['category', 'fields', 'label'].every((key) => Object.hasOwn(spec, key)) ||
    (Object.hasOwn(spec, 'eventDateTimeFieldName') &&
      (typeof spec.eventDateTimeFieldName !== 'string' ||
        !fieldName.test(spec.eventDateTimeFieldName))) ||
    document.schemaVersion !== 1 ||
    document.kind !== 'dlo' ||
    typeof identity.apiName !== 'string' ||
    !dloName.test(identity.apiName) ||
    typeof identity.dataSpace !== 'string' ||
    !identity.dataSpace.trim() ||
    identity.dataSpace !== identity.dataSpace.trim() ||
    [...identity.dataSpace].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0)! === 127,
    ) ||
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
  // The event field has to name one of the listed fields exactly.
  if (
    spec.eventDateTimeFieldName !== undefined &&
    !spec.fields.some((field) => record(field).name === spec.eventDateTimeFieldName)
  )
    throw new DloError('INVALID_DLO_DOCUMENT');
  return structuredClone(value) as DloDocument;
}

/** Fields Salesforce adds to a data lake object itself. */
export const dloSystemFields: ReadonlySet<string> = new Set([
  'cdp_sys_SourceVersion__c',
  // Engagement DLOs: Salesforce adds it with the event field.
  'cdp_sys_PartitionDate__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
]);

/**
 * Whether a field of an existing DLO is one Salesforce generated: a system field or the key
 * qualifier of a primary key, never a primary key or a custom field. A deploy keeps such a field
 * when the file leaves it out, and a retrieve leaves it out; both use this one predicate.
 * @param {DloField} field Field of the DLO.
 * @param {DloField[]} fields Every field of the same DLO.
 * @returns {boolean} Whether the field is generated, not authored.
 */
export function isGeneratedDloField(field: DloField, fields: readonly DloField[]): boolean {
  if (field.isPrimaryKey || field.creationType === 'Custom') return false;
  return (
    dloSystemFields.has(field.name) ||
    fields.some((key) => key.isPrimaryKey && field.name === `KQ_${key.name}`)
  );
}

/**
 * Keep the authored content of a DLO definition: generated fields are left out, except a field
 * the event field names, which the document has to list.
 * @param {DloDocument} document Complete definition as read.
 * @returns {DloDocument} Independent copy without generated fields.
 */
export function leanDloDocument(document: DloDocument): DloDocument {
  const lean = structuredClone(document);
  lean.spec.fields = document.spec.fields.filter(
    (field) =>
      field.name === document.spec.eventDateTimeFieldName ||
      !isGeneratedDloField(field, document.spec.fields),
  );
  return lean;
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
 * @param {string} [dataSpace] Explicit membership to bind, if supplied.
 * @returns {DloDocument} Portable document with observed membership.
 */
export function normalizeDlo(value: unknown, dataSpace?: string): DloDocument {
  const object = unwrapDlo(value);
  if (!Array.isArray(object.dataSpaceInfo) || object.dataSpaceInfo.length === 0)
    throw new DloError('UNSUPPORTED_DLO_DATASPACE');
  const memberships = object.dataSpaceInfo.map((entry) => record(entry).name);
  if (
    memberships.some((name) => typeof name !== 'string' || !name.trim()) ||
    (dataSpace === undefined ? memberships.length !== 1 : !memberships.includes(dataSpace))
  )
    throw new DloError('UNSUPPORTED_DLO_DATASPACE');
  const scope = dataSpace ?? memberships[0];
  const fields = object.dataLakeFieldInfoRepresentation ?? object.fields;
  if (!Array.isArray(fields)) throw new DloError('INVALID_DLO_RESPONSE');
  return validateDloDocument({
    schemaVersion: 1,
    kind: 'dlo',
    identity: { apiName: object.name, dataSpace: scope },
    spec: {
      label: object.label,
      category: object.category,
      ...(typeof object.eventDateTimeFieldName === 'string'
        ? { eventDateTimeFieldName: object.eventDateTimeFieldName }
        : {}),
      fields: fields.map((field) =>
        Object.fromEntries(
          Object.entries(record(field)).filter(([key]) => !runtimeFieldKeys.has(key)),
        ),
      ),
    },
  });
}
