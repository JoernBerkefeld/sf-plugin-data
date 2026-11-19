import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import { sameEnum } from './enum-case.js';
import type { DocumentMode } from './verbatim-document.js';
import { dataSpaceKey, readSingleDataSpace, refuseLegacyDataSpace } from './data-space-field.js';

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
  /** The data space the DMO belongs to (file key `c__dataSpace`). */
  c__dataSpace: string;
  identity: { apiName: string };
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
  return sameEnum(left, right);
}

/**
 * What may be written on an existing DMO, decided from its raw read alone.
 * 'custom': every field and property this plugin writes.
 * 'standard': custom fields, the object label and the object description only; fields of any
 * other creationType are never sent or removed.
 * 'refused': nothing (a read without a name).
 */
export type NativeDmoWriteScope = 'custom' | 'standard' | 'refused';

/**
 * Classify an existing DMO for writes. A customer-created DMO with an unprefixed name is
 * 'custom'. Every other read with a name is 'standard': Salesforce standard DMOs, the DMOs
 * Salesforce generates (for example `Derived` and `Bridge` from identity resolution, `Adg` from
 * data graphs, `Segment_Membership`), a custom creationType under a namespaced name and a read
 * without a creationType. Salesforce does not protect the generated fields of those DMOs, so the
 * standard scope keeps them out of every write; what Salesforce refuses on them it answers itself.
 * @param {Record<string, unknown>} raw Direct native read.
 * @returns {NativeDmoWriteScope} Write scope of the target.
 */
export function nativeDmoWriteScope(raw: Record<string, unknown>): NativeDmoWriteScope {
  if (typeof raw.name !== 'string') return 'refused';
  return raw.creationType === 'Custom' && !raw.name.slice(0, -'__dlm'.length).includes('__')
    ? 'custom'
    : 'standard';
}

/**
 * Whether a whole-DMO delete is sent. It is sent for every read that names the DMO, whatever its
 * creationType (standard, generated, custom or none); Salesforce decides and its answer is
 * reported as it comes.
 * @param {Record<string, unknown>} raw Direct native read.
 * @returns {boolean} Whether the delete is sent.
 */
export function isDeletableNativeDmo(raw: Record<string, unknown>): boolean {
  return typeof raw.name === 'string';
}

const dmoSystemFields = new Set([
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
]);

/**
 * Identify generated fields without borrowing DLO SourceVersion assumptions.
 * @param {NativeDmoField} field Portable field.
 * @returns {boolean} Whether writes must omit the field.
 */
export function isGeneratedDmoField(field: NativeDmoField): boolean {
  return (
    dmoSystemFields.has(field.name) ||
    (typeof field.name === 'string' && field.name.startsWith('KQ_')) ||
    field.creationType === 'System'
  );
}

/**
 * Keep the authored content of a DMO definition: generated fields (system fields, key qualifiers
 * and every field read as System) are left out; a deploy keeps them from the org when the file
 * omits them. Primary keys and the standard fields of a standard DMO stay: a deploy compares a
 * listed standard field, and a definition needs at least one field. Fields are sorted by name:
 * Salesforce returns them in an order that varies between reads, and a deploy matches them by
 * name, so the order carries no meaning.
 * @param {NativeDmoDocument} document Complete definition as read.
 * @returns {NativeDmoDocument} Independent copy without generated fields, fields sorted by name.
 */
export function leanNativeDmoDocument(document: NativeDmoDocument): NativeDmoDocument {
  const lean = structuredClone(document);
  lean.spec.fields = lean.spec.fields
    .filter((field) => field.isPrimaryKey || !isGeneratedDmoField(field))
    // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh filtered array within the ES2022 library target.
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return lean;
}

/** Payload-free refusal for the isolated native DMO boundary. */
export class NativeDmoError extends Error {
  /**
   * @param {string} code Stable plugin code.
   * @param {number} [status] HTTP status of Salesforce's answer.
   * @param {true} [rejected] Salesforce answered with a refusal, so nothing was changed.
   */
  public constructor(
    public readonly code: string,
    public readonly status?: number,
    public readonly rejected?: true,
  ) {
    super(`Native DMO operation refused: ${code}.`);
    this.name = 'NativeDmoError';
  }
}

export const nativeDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;

/**
 * The default spelling of a standard DMO copy in a non-default data space. Salesforce names the
 * copy of `ssot__<Name>__dlm` `<prefix>_<Name>__dlm` there, with fields without `ssot__`
 * (live API 68, DB entry data360:dataspace-name-spelling-api68). Only this rule is derived: a
 * name without the data space prefix, the default data space or no prefix give undefined, and
 * a standard DMO without `ssot__` (such as `StaticCurrencyRates_Home__dlm`) is never derived.
 * Whether the result is a standard DMO is for the caller's read to prove.
 * @param {string} name DMO name as the file names it.
 * @param {string} dataSpace The run's data space.
 * @param {string} [prefix] The prefix the org's data space list names for it.
 * @returns {string | undefined} `ssot__<Name>__dlm`, or undefined.
 */
export function standardCopyOrigin(
  name: string,
  dataSpace: string,
  prefix: string | undefined,
): string | undefined {
  if (dataSpace === 'default' || prefix === undefined || !name.startsWith(`${prefix}_`))
    return undefined;
  const spelling = `ssot__${name.slice(prefix.length + 1)}`;
  return nativeDmoName.test(spelling) ? spelling : undefined;
}

/**
 * The name a field of the default-spelling standard DMO has on its copy: `ssot__X__c` is
 * `X__c`, any other field (`KQ_`, unprefixed) keeps its name.
 * @param {string} name Field name on the default object.
 * @returns {string} Field name on the copy.
 */
export function standardCopyFieldName(name: string): string {
  return name.startsWith('ssot__') ? name.slice('ssot__'.length) : name;
}
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
 * Refuse an authored DMO file, naming the key path that cannot be deployed.
 * @param {string} code Refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {NativeDmoError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): NativeDmoError {
  return explainInput(
    new NativeDmoError(code),
    `The DMO file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the DMO again once the plugin supports it.`,
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
    throw refuse('INVALID_DMO_DOCUMENT', keyPath, 'must be an object');
  return value as Record<string, unknown>;
}

/**
 * Validate the document shape, retaining field definitions and any extra spec keys. Category,
 * data types, label length and key rules are left to the API. Deploy mode (the default) admits
 * only what a deploy can send and names the first offending key path; retrieve mode keeps what
 * the org returned and checks only what names and places the file.
 * @param {unknown} value Portable input.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {NativeDmoDocument} Checked independent copy.
 */
export function validateNativeDmoDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): NativeDmoDocument {
  const document = objectAt(value, 'the document');
  const identity = objectAt(document.identity, 'identity');
  const spec = objectAt(document.spec, 'spec');
  if (document.schemaVersion !== 1)
    throw refuse('INVALID_DMO_DOCUMENT', 'schemaVersion', 'must be 1');
  if (document.kind !== 'dmo') throw refuse('INVALID_DMO_DOCUMENT', 'kind', 'must be "dmo"');
  if (typeof identity.apiName !== 'string' || !nativeDmoName.test(identity.apiName))
    throw refuse(
      'INVALID_DMO_DOCUMENT',
      'identity.apiName',
      'must be a DMO API name ending in __dlm',
    );
  refuseLegacyDataSpace(identity, refuse);
  readSingleDataSpace(document, refuse);
  if (!Array.isArray(spec.fields))
    throw refuse('INVALID_DMO_DOCUMENT', 'spec.fields', 'must be a list of fields');
  const fields = spec.fields.map((field, index) => objectAt(field, `spec.fields[${index}]`));
  if (mode === 'retrieve') return structuredClone(value) as NativeDmoDocument;
  for (const key of Object.keys(document))
    if (![dataSpaceKey, 'identity', 'kind', 'schemaVersion', 'spec'].includes(key))
      throw refuse('INVALID_DMO_DOCUMENT', printableKey(key), 'is not a key a DMO file can hold');
  for (const key of Object.keys(identity))
    if (key !== 'apiName')
      throw refuse(
        'INVALID_DMO_DOCUMENT',
        `identity.${printableKey(key)}`,
        'is not a key a DMO file can hold',
      );
  // Identity lives in `identity`; runtime observations are never authored input.
  const observed = Object.keys(spec).find(
    (key) => key === 'name' || key === 'dataSpaceName' || runtimeKeys.has(key),
  );
  if (observed !== undefined)
    throw refuse('INVALID_DMO_DOCUMENT', `spec.${observed}`, 'is not a key a DMO file can hold');
  if (typeof spec.label !== 'string' || !spec.label.trim())
    throw refuse('INVALID_DMO_DOCUMENT', 'spec.label', 'must be a non-empty text');
  if (typeof spec.category !== 'string' || !spec.category.trim())
    throw refuse('INVALID_DMO_DOCUMENT', 'spec.category', 'must be a category name');
  if (spec.description !== undefined && typeof spec.description !== 'string')
    throw refuse('INVALID_DMO_DOCUMENT', 'spec.description', 'must be a text');
  if (fields.length === 0)
    throw refuse('INVALID_DMO_DOCUMENT', 'spec.fields', 'must list at least one field');
  const names = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const at = `spec.fields[${index}]`;
    const unknown = Object.keys(field).find((key) => runtimeKeys.has(key) || key === 'type');
    if (unknown !== undefined)
      throw refuse('INVALID_DMO_FIELD', `${at}.${unknown}`, 'is not a key a DMO file can hold');
    if (typeof field.name !== 'string' || !nativeDmoFieldName.test(field.name))
      throw refuse('INVALID_DMO_FIELD', `${at}.name`, 'must be a field API name ending in __c');
    if (names.has(field.name.toLowerCase()))
      throw refuse('INVALID_DMO_FIELD', `${at}.name`, 'repeats the name of another field');
    if (typeof field.label !== 'string' || !field.label.trim())
      throw refuse('INVALID_DMO_FIELD', `${at}.label`, 'must be a non-empty text');
    if (typeof field.dataType !== 'string' || !field.dataType)
      throw refuse('INVALID_DMO_FIELD', `${at}.dataType`, 'must be a data type name');
    if (typeof field.isPrimaryKey !== 'boolean')
      throw refuse('INVALID_DMO_FIELD', `${at}.isPrimaryKey`, 'must be true or false');
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
 * Map the read field `type` to the authored `dataType` and keep definition fields, not runtime IDs.
 * Retrieve mode keeps what the plugin cannot map as returned: a field without `type`, or with a
 * `dataType` that differs from it, keeps both keys; a non-boolean `isPrimaryKey` stays; a read
 * without `dataSpaceName` takes the data space it was requested in. A DMO of another data space
 * is UNSUPPORTED_DMO_DATASPACE.
 * @param {unknown} value Direct native response.
 * @param {string} dataSpace The run's data space.
 * @param {DocumentMode} [mode] `retrieve` (lenient) or `deploy` (strict, the default).
 * @returns {NativeDmoDocument} Portable definition with authoritative observed scope.
 */
export function normalizeNativeDmo(
  value: unknown,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): NativeDmoDocument {
  const object = unwrapNativeDmo(value);
  const lenient = mode === 'retrieve';
  const observed =
    lenient && (object.dataSpaceName === undefined || object.dataSpaceName === null)
      ? dataSpace
      : object.dataSpaceName;
  if (observed !== dataSpace) throw new NativeDmoError('UNSUPPORTED_DMO_DATASPACE');
  return validateNativeDmoDocument(
    {
      schemaVersion: 1,
      kind: 'dmo',
      [dataSpaceKey]: dataSpace,
      identity: { apiName: object.name },
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
          // `type` becomes `dataType` only when the read leaves no doubt.
          const mapped =
            typeof field.type === 'string' &&
            (field.dataType === undefined || field.dataType === field.type);
          if (
            !lenient &&
            (!mapped ||
              (field.isPrimaryKey !== undefined && typeof field.isPrimaryKey !== 'boolean'))
          )
            throw new NativeDmoError('INVALID_DMO_FIELD');
          return {
            ...Object.fromEntries(
              Object.entries(field).filter(
                ([key]) => !runtimeKeys.has(key) && !(mapped && key === 'type'),
              ),
            ),
            ...(mapped ? { dataType: field.type } : {}),
            isPrimaryKey: field.isPrimaryKey === undefined ? false : field.isPrimaryKey,
          };
        }),
      },
    },
    mode,
  );
}
