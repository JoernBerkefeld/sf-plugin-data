import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

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
 * Refuse an authored DLO file, naming the key path that cannot be deployed.
 * @param {string} code Refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {DloError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): DloError {
  return explainInput(
    new DloError(code),
    `The DLO file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the DLO again once the plugin supports it.`,
  );
}

/**
 * Require a plain JSON object at a key path of the file.
 * @param {unknown} value Untrusted input.
 * @param {string} keyPath Printable key path.
 * @returns {Record<string, unknown>} Object content.
 */
function objectAt(value: unknown, keyPath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse('INVALID_DLO_DOCUMENT', keyPath, 'must be an object');
  return value as Record<string, unknown>;
}

/**
 * Refuse a key outside the given set and a missing required key.
 * @param {Record<string, unknown>} value Object of the file.
 * @param {string} prefix Key path of the object, with a trailing dot (empty at the top).
 * @param {string[]} required Keys it must hold.
 * @param {string[]} [optional] Keys it may hold.
 * @param {string} [code] Refusal code.
 */
function closedKeys(
  value: Record<string, unknown>,
  prefix: string,
  required: string[],
  optional: string[] = [],
  code = 'INVALID_DLO_DOCUMENT',
): void {
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key))
      throw refuse(code, `${prefix}${printableKey(key)}`, 'is not a key a DLO file can hold');
  for (const key of required)
    if (!Object.hasOwn(value, key)) throw refuse(code, `${prefix}${key}`, 'is missing');
}

/**
 * Validate a native DLO document without losing additional field definitions. Deploy mode (the
 * default) admits only what a deploy can send and names the first offending key path; retrieve
 * mode keeps what the org returned and checks only what names and places the file.
 * @param {unknown} value Untrusted saved document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {DloDocument} Checked document.
 */
export function validateDloDocument(value: unknown, mode: DocumentMode = 'deploy'): DloDocument {
  const document = objectAt(value, 'the document');
  const identity = objectAt(document.identity, 'identity');
  const spec = objectAt(document.spec, 'spec');
  if (document.schemaVersion !== 1)
    throw refuse('INVALID_DLO_DOCUMENT', 'schemaVersion', 'must be 1');
  if (document.kind !== 'dlo') throw refuse('INVALID_DLO_DOCUMENT', 'kind', 'must be "dlo"');
  if (typeof identity.apiName !== 'string' || !dloName.test(identity.apiName))
    throw refuse(
      'INVALID_DLO_DOCUMENT',
      'identity.apiName',
      'must be a DLO API name ending in __dll',
    );
  if (
    typeof identity.dataSpace !== 'string' ||
    !identity.dataSpace.trim() ||
    identity.dataSpace !== identity.dataSpace.trim() ||
    [...identity.dataSpace].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0)! === 127,
    )
  )
    throw refuse('INVALID_DLO_DOCUMENT', 'identity.dataSpace', 'must be a data space name');
  if (!Array.isArray(spec.fields))
    throw refuse('INVALID_DLO_DOCUMENT', 'spec.fields', 'must be a list of fields');
  const fields = spec.fields.map((field, index) => objectAt(field, `spec.fields[${index}]`));
  if (mode === 'retrieve') return structuredClone(value) as DloDocument;
  closedKeys(document, '', ['identity', 'kind', 'schemaVersion', 'spec']);
  closedKeys(identity, 'identity.', ['apiName', 'dataSpace']);
  closedKeys(spec, 'spec.', ['category', 'fields', 'label'], ['eventDateTimeFieldName']);
  if (
    Object.hasOwn(spec, 'eventDateTimeFieldName') &&
    (typeof spec.eventDateTimeFieldName !== 'string' ||
      !fieldName.test(spec.eventDateTimeFieldName))
  )
    throw refuse(
      'INVALID_DLO_DOCUMENT',
      'spec.eventDateTimeFieldName',
      'must be a field API name ending in __c',
    );
  if (typeof spec.label !== 'string' || !spec.label.trim() || spec.label.length > 40)
    throw refuse('INVALID_DLO_DOCUMENT', 'spec.label', 'must be a text of 1 to 40 characters');
  if (typeof spec.category !== 'string' || !spec.category)
    throw refuse('INVALID_DLO_DOCUMENT', 'spec.category', 'must be a category name');
  if (fields.length === 0)
    throw refuse('INVALID_DLO_DOCUMENT', 'spec.fields', 'must list at least one field');
  const names = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const at = `spec.fields[${index}]`;
    const runtime = Object.keys(field).find((key) => runtimeFieldKeys.has(key));
    if (runtime !== undefined)
      throw refuse('INVALID_DLO_FIELD', `${at}.${runtime}`, 'is not a key a DLO file can hold');
    if (typeof field.name !== 'string' || !fieldName.test(field.name))
      throw refuse('INVALID_DLO_FIELD', `${at}.name`, 'must be a field API name ending in __c');
    if (names.has(field.name.toLowerCase()))
      throw refuse('INVALID_DLO_FIELD', `${at}.name`, 'repeats the name of another field');
    if (typeof field.label !== 'string' || !field.label)
      throw refuse('INVALID_DLO_FIELD', `${at}.label`, 'must be a non-empty text');
    if (typeof field.dataType !== 'string' || !field.dataType)
      throw refuse('INVALID_DLO_FIELD', `${at}.dataType`, 'must be a data type name');
    if (typeof field.isPrimaryKey !== 'boolean')
      throw refuse('INVALID_DLO_FIELD', `${at}.isPrimaryKey`, 'must be true or false');
    names.add(field.name.toLowerCase());
  }
  const keys = fields.filter((field) => field.isPrimaryKey === true).length;
  if (keys !== 1)
    throw refuse(
      'INVALID_DLO_PRIMARY_KEY',
      'spec.fields',
      `marks ${keys} fields as isPrimaryKey; a DLO deploy needs exactly one`,
    );
  // The event field has to name one of the listed fields exactly.
  if (
    spec.eventDateTimeFieldName !== undefined &&
    !fields.some((field) => field.name === spec.eventDateTimeFieldName)
  )
    throw refuse('INVALID_DLO_DOCUMENT', 'spec.eventDateTimeFieldName', 'must name a listed field');
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
 * @param {DocumentMode} [mode] `retrieve` keeps values the plugin cannot deploy as returned.
 * @returns {DloDocument} Portable document with observed membership.
 */
export function normalizeDlo(
  value: unknown,
  dataSpace?: string,
  mode: DocumentMode = 'deploy',
): DloDocument {
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
  return validateDloDocument(
    {
      schemaVersion: 1,
      kind: 'dlo',
      identity: { apiName: object.name, dataSpace: scope },
      spec: {
        label: object.label,
        category: object.category,
        ...(typeof object.eventDateTimeFieldName === 'string' ||
        (mode === 'retrieve' &&
          object.eventDateTimeFieldName !== undefined &&
          object.eventDateTimeFieldName !== null)
          ? { eventDateTimeFieldName: object.eventDateTimeFieldName }
          : {}),
        fields: fields.map((field) =>
          Object.fromEntries(
            Object.entries(record(field)).filter(([key]) => !runtimeFieldKeys.has(key)),
          ),
        ),
      },
    },
    mode,
  );
}
