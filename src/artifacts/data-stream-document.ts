import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

export type DataStreamMapping = {
  sourceFieldLabel: string;
  targetFieldName: string;
  targetFieldReturntype: 'Text';
};

export type DataStreamDocument = {
  schemaVersion: 1;
  kind: 'data-stream';
  identity: { apiName: string; dataSpace: string };
  spec: {
    connectorType: 'IngestApi';
    connectionName: string;
    event: string;
    datastreamType: 'INGEST_API';
    refreshMode: 'UPSERT';
    label: string;
    newDlo: {
      name: string;
      label: string;
      category: 'Other';
      primaryKey: { name: string; label: string; dataType: 'Text' };
    };
    additiveFieldMappings: DataStreamMapping[];
  };
  observed?: {
    mappings: { sourceFieldName?: string; formula?: string; targetFieldName: string }[];
    sourceFields: { name: string; datatype: string }[];
    dloFields: { name: string; label: string; dataType: string; isPrimaryKey: boolean }[];
    actualDloName: string;
  };
};

/** Payload-free refusal at the portable stream boundary. */
export class DataStreamError extends Error {
  public constructor(public readonly code: string) {
    super(`Data stream operation refused: ${code}.`);
    this.name = 'DataStreamError';
  }
}

const name = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const dloName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dll$/u;

/**
 * Refuse a stream file, naming the key path that cannot be deployed.
 * @param {string} code Refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {DataStreamError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): DataStreamError {
  return explainInput(
    new DataStreamError(code),
    `The data stream file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the stream again once the plugin supports it.`,
  );
}

/**
 * Check one object shape without accepting runtime identifiers.
 * @param {unknown} value Untrusted object.
 * @param {string} keyPath Printable key path of the object (empty for the document).
 * @param {string[]} required Required keys.
 * @param {string[]} [optional] Optional keys.
 * @param {boolean} [open] Whether keys outside the set are kept (retrieve mode).
 * @returns {Record<string, unknown>} Checked object.
 */
function object(
  value: unknown,
  keyPath: string,
  required: string[],
  optional: string[] = [],
  open = false,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse('INVALID_STREAM_DOCUMENT', keyPath || 'the document', 'must be an object');
  const result = value as Record<string, unknown>;
  const prefix = keyPath ? `${keyPath}.` : '';
  if (!open)
    for (const key of Object.keys(result))
      if (!required.includes(key) && !optional.includes(key))
        throw refuse(
          'INVALID_STREAM_DOCUMENT',
          `${prefix}${printableKey(key)}`,
          'is not a key a data stream file can hold',
        );
  for (const key of required)
    if (!Object.hasOwn(result, key))
      throw refuse('INVALID_STREAM_DOCUMENT', `${prefix}${key}`, 'is missing');
  return result;
}

/**
 * Check text, preserving labels rather than rewriting them.
 * @param {unknown} value Untrusted text.
 * @param {string} keyPath Printable key path.
 * @param {boolean} [bounded] Whether the 500-character limit applies (deploy mode).
 * @returns {string} Checked text.
 */
function text(value: unknown, keyPath: string, bounded = true): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    )
  )
    throw refuse(
      'INVALID_STREAM_DOCUMENT',
      keyPath,
      'must be non-empty text without surrounding spaces or control characters',
    );
  if (bounded && value.length > 500)
    throw refuse('INVALID_STREAM_DOCUMENT', keyPath, 'is longer than 500 characters');
  return value;
}

/**
 * Check a portable developer name.
 * @param {unknown} value Untrusted name.
 * @param {string} keyPath Printable key path.
 * @param {boolean} [dlo] Whether a DLO suffix is required.
 * @returns {string} Checked name.
 */
function identifier(value: unknown, keyPath: string, dlo = false): string {
  if (!(dlo ? dloName : name).test(text(value, keyPath)))
    throw refuse(
      'INVALID_STREAM_NAME',
      keyPath,
      dlo ? 'must be a developer name ending in __dll' : 'must be a developer name',
    );
  return value as string;
}

/**
 * Freeze a detached JSON value recursively.
 * @param {unknown} value Detached value.
 * @returns {T} Frozen value.
 */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate authored intent separately from retained, read-only schema evidence. Deploy mode (the
 * default) admits only what a deploy can send and names the first offending key path; retrieve
 * mode lifts the 500-character text limit and the 40-character DLO label limit. Unknown keys
 * inside `observed`, which deploy never sends, are kept in both modes.
 * @param {unknown} value Untrusted portable document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {DataStreamDocument} Detached deeply frozen document.
 */
export function validateDataStreamDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): DataStreamDocument {
  const lenient = mode === 'retrieve';
  const bounded = !lenient;
  const document = object(value, '', ['schemaVersion', 'kind', 'identity', 'spec'], ['observed']);
  const identity = object(document.identity, 'identity', ['apiName', 'dataSpace']);
  identifier(identity.apiName, 'identity.apiName');
  text(identity.dataSpace, 'identity.dataSpace');
  const spec = object(document.spec, 'spec', [
    'connectorType',
    'connectionName',
    'event',
    'datastreamType',
    'refreshMode',
    'label',
    'newDlo',
    'additiveFieldMappings',
  ]);
  identifier(spec.connectionName, 'spec.connectionName');
  identifier(spec.event, 'spec.event');
  text(spec.label, 'spec.label', bounded);
  const dlo = object(spec.newDlo, 'spec.newDlo', ['name', 'label', 'category', 'primaryKey']);
  identifier(dlo.name, 'spec.newDlo.name', true);
  if (text(dlo.label, 'spec.newDlo.label', bounded).length > 40 && !lenient)
    throw refuse('INVALID_STREAM_LABEL', 'spec.newDlo.label', 'is longer than 40 characters');
  const pk = object(dlo.primaryKey, 'spec.newDlo.primaryKey', ['name', 'label', 'dataType']);
  identifier(pk.name, 'spec.newDlo.primaryKey.name');
  text(pk.label, 'spec.newDlo.primaryKey.label', bounded);
  if (
    document.schemaVersion !== 1 ||
    document.kind !== 'data-stream' ||
    spec.connectorType !== 'IngestApi' ||
    spec.datastreamType !== 'INGEST_API' ||
    spec.refreshMode !== 'UPSERT' ||
    dlo.category !== 'Other' ||
    pk.dataType !== 'Text' ||
    !Array.isArray(spec.additiveFieldMappings)
  )
    throw new DataStreamError('UNSUPPORTED_STREAM_SPEC');
  const targets = new Set<string>();
  for (const [index, entry] of (spec.additiveFieldMappings as unknown[]).entries()) {
    const at = `spec.additiveFieldMappings[${index}]`;
    const mapping = object(entry, at, [
      'sourceFieldLabel',
      'targetFieldName',
      'targetFieldReturntype',
    ]);
    identifier(mapping.sourceFieldLabel, `${at}.sourceFieldLabel`);
    const target = identifier(mapping.targetFieldName, `${at}.targetFieldName`);
    if (
      target.endsWith('__c') ||
      target.toLowerCase() === String(pk.name).toLowerCase() ||
      targets.has(target.toLowerCase()) ||
      mapping.targetFieldReturntype !== 'Text'
    )
      throw new DataStreamError('INVALID_STREAM_MAPPING');
    targets.add(target.toLowerCase());
  }
  // Deploy never sends `observed` (read-only schema evidence), so in both modes a key the plugin
  // does not model inside it is kept, never refused.
  if (document.observed !== undefined) {
    const observed = object(
      document.observed,
      'observed',
      ['mappings', 'sourceFields', 'dloFields', 'actualDloName'],
      [],
      true,
    );
    identifier(observed.actualDloName, 'observed.actualDloName', true);
    for (const key of ['mappings', 'sourceFields', 'dloFields'])
      if (!Array.isArray(observed[key])) throw new DataStreamError('INVALID_STREAM_OBSERVED');
    const observedTargets = new Set<string>();
    const sourceNames = new Set<string>();
    const fieldNames = new Set<string>();
    for (const [index, entry] of (observed.mappings as unknown[]).entries()) {
      const at = `observed.mappings[${index}]`;
      const mapping = object(entry, at, ['targetFieldName'], ['sourceFieldName', 'formula'], true);
      const target = identifier(mapping.targetFieldName, `${at}.targetFieldName`).toLowerCase();
      if (observedTargets.has(target)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      observedTargets.add(target);
      if ((mapping.sourceFieldName === undefined) === (mapping.formula === undefined))
        throw new DataStreamError('INVALID_STREAM_OBSERVED');
      if (mapping.sourceFieldName !== undefined)
        identifier(mapping.sourceFieldName, `${at}.sourceFieldName`);
      if (mapping.formula !== undefined) text(mapping.formula, `${at}.formula`, bounded);
    }
    for (const [index, entry] of (observed.sourceFields as unknown[]).entries()) {
      const at = `observed.sourceFields[${index}]`;
      const field = object(entry, at, ['name', 'datatype'], [], true);
      const source = identifier(field.name, `${at}.name`).toLowerCase();
      if (sourceNames.has(source)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      sourceNames.add(source);
      text(field.datatype, `${at}.datatype`, bounded);
    }
    for (const [index, entry] of (observed.dloFields as unknown[]).entries()) {
      const at = `observed.dloFields[${index}]`;
      const field = object(entry, at, ['name', 'label', 'dataType', 'isPrimaryKey'], [], true);
      const fieldName = identifier(field.name, `${at}.name`).toLowerCase();
      if (fieldNames.has(fieldName)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      fieldNames.add(fieldName);
      text(field.label, `${at}.label`, bounded);
      text(field.dataType, `${at}.dataType`, bounded);
      if (typeof field.isPrimaryKey !== 'boolean')
        throw new DataStreamError('INVALID_STREAM_OBSERVED');
    }
  }
  return freeze(structuredClone(value) as DataStreamDocument);
}

/**
 * Build only the proven PK-only object-shaped POST; no observed fields are replayed.
 * @param {unknown} value Portable document.
 * @returns {object} Native create body, not dispatch authorization.
 */
export function buildDataStreamCreateBody(value: unknown) {
  const document = validateDataStreamDocument(value);
  if (document.identity.dataSpace !== 'default')
    throw new DataStreamError('UNSUPPORTED_STREAM_DATASPACE');
  const { spec } = document;
  if (spec.additiveFieldMappings.length > 0)
    throw new DataStreamError('CREATE_ADDITIONS_UNSUPPORTED');
  return freeze({
    name: document.identity.apiName,
    label: spec.label,
    datastreamType: spec.datastreamType,
    connectorInfo: {
      connectorType: spec.connectorType,
      connectorDetails: { name: spec.connectionName, events: [spec.event] },
    },
    dataLakeObjectInfo: {
      name: spec.newDlo.name,
      label: spec.newDlo.label,
      category: spec.newDlo.category,
      dataspaceInfo: [{ name: document.identity.dataSpace }],
      dataLakeFieldInputRepresentations: [{ ...spec.newDlo.primaryKey, isPrimaryKey: true }],
    },
    mappings: [],
    sourceFields: [],
    refreshConfig: { refreshMode: spec.refreshMode },
  });
}

/**
 * Serialize explicit additive intent only; target binding and missing-pair selection belong to the service.
 * @param {unknown} value Portable document containing only additions selected for dispatch.
 * @returns {object} Proven source-label PATCH shape, not dispatch authorization.
 */
export function buildDataStreamPatchBody(value: unknown) {
  const document = validateDataStreamDocument(value);
  if (document.identity.dataSpace !== 'default')
    throw new DataStreamError('UNSUPPORTED_STREAM_DATASPACE');
  if (document.spec.additiveFieldMappings.length === 0)
    throw new DataStreamError('EMPTY_STREAM_PATCH');
  return freeze({
    datastreamType: document.spec.datastreamType,
    mappings: structuredClone(document.spec.additiveFieldMappings),
  });
}

/**
 * Convert a stream target selector to the independently read DLO field name.
 * @param {unknown} value Unsuffixed mapping target.
 * @returns {string} Persisted DLO field selector.
 */
export function dataStreamTargetFieldName(value: string): string {
  const target = identifier(value, 'targetFieldName');
  if (target.endsWith('__c')) throw new DataStreamError('INVALID_STREAM_MAPPING');
  return `${target}__c`;
}

/**
 * A data stream of the Salesforce CRM connector (`connectorInfo.connectorType` `SalesforceDotCom`):
 * `spec` is the stream GET without server-owned keys and without the fields and mappings
 * Salesforce adds itself. Formulas are stored decoded (the GET HTML-escapes them).
 */
export type CrmDataStreamDocument = {
  schemaVersion: 1;
  kind: 'data-stream';
  identity: { apiName: string; dataSpace: string };
  spec: Record<string, unknown>;
};

type Bag = Record<string, unknown>;
const crmConnector = 'SalesforceDotCom';
// Keys of a stream GET that Salesforce owns: identifiers, run state and values it derives.
const ownedStreamKeys = ['recordId', 'status', 'lastRunStatus', 'isEnabled', 'dataSource'];
// Keys the GET returns as empty objects; kept when Salesforce fills them.
const emptyStreamKeys = ['advancedAttributes', 'capabilities'];
const ownedDloKeys = [
  'id',
  'status',
  'capabilities',
  'columnMappingProperties',
  'dataLakeFieldInfoRepresentation',
];
const ownedRefreshKeys = [
  'hasHeaders',
  'shouldFetchImmediately',
  'shouldTreatMissingFilesAsFailures',
];

/**
 * Whether a value is a plain JSON object.
 * @param {unknown} value Candidate.
 * @returns {boolean} Object and not an array.
 */
function isBag(value: unknown): value is Bag {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether a field, source field or mapping target is one Salesforce adds to every CRM stream.
 * @param {unknown} fieldName Field name.
 * @returns {boolean} A system field the create input must not carry.
 */
export function isCrmSystemField(fieldName: unknown): boolean {
  return (
    typeof fieldName === 'string' &&
    (['DataSource', 'DataSourceObject', 'SfdcOrganizationId'].includes(fieldName) ||
      fieldName.startsWith('KQ_') ||
      fieldName.startsWith('cdp_sys_'))
  );
}

/**
 * Decode the HTML entities the stream GET puts into formulas.
 * @param {string} value Escaped formula.
 * @returns {string} Formula as written.
 */
function decodeFormula(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/**
 * Sort key of one entry: name, then target field, source field and formula.
 * @param {unknown} value Array entry.
 * @returns {string} Key.
 */
function key(value: unknown): string {
  const entry = isBag(value) ? value : {};
  return [entry.name, entry.targetFieldName, entry.sourceFieldName, entry.formula]
    .map((part) => (typeof part === 'string' ? part : ''))
    .join('\u0000');
}

/**
 * Order entries by name, then target field, source field and formula.
 * @param {unknown[]} values Array entries.
 * @returns {unknown[]} Sorted copy.
 */
function byName(values: unknown[]): unknown[] {
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a copied array within the existing ES2022 library target.
  return [...values].sort((left, right) =>
    key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0,
  );
}

/**
 * Whether a stream GET (or a CRM stream spec) uses the Salesforce CRM connector.
 * @param {unknown} value Stream GET or spec.
 * @returns {boolean} CRM connector.
 */
export function isCrmDataStream(value: unknown): boolean {
  return (
    isBag(value) && isBag(value.connectorInfo) && value.connectorInfo.connectorType === crmConnector
  );
}

/**
 * Whether a stream document is a CRM stream document (its spec names the CRM connector).
 * @param {unknown} value Candidate document.
 * @returns {boolean} CRM stream document.
 */
export function isCrmDataStreamDocument(value: unknown): value is CrmDataStreamDocument {
  return isBag(value) && isCrmDataStream(value.spec);
}

/**
 * The spec of a CRM stream file: the GET without server-owned keys, system fields and system
 * mappings, formulas decoded, fields, source fields and mappings in a stable order.
 * @param {unknown} value Stream GET response.
 * @returns {Bag} Spec as stored in the file.
 */
export function crmDataStreamSpec(value: unknown): Bag {
  if (!isBag(value)) throw new DataStreamError('INVALID_STREAM_READ');
  const spec = structuredClone(value);
  for (const key of ownedStreamKeys) delete spec[key];
  for (const key of emptyStreamKeys)
    if (isBag(spec[key]) && Object.keys(spec[key]).length === 0) delete spec[key];
  if (isBag(spec.connectorInfo) && isBag(spec.connectorInfo.connectorDetails))
    delete spec.connectorInfo.connectorDetails.type;
  if (isBag(spec.dataLakeObjectInfo)) {
    const dlo = spec.dataLakeObjectInfo;
    for (const key of ownedDloKeys) delete dlo[key];
    if (Array.isArray(dlo.fields))
      dlo.fields = byName(
        dlo.fields.filter((field) => !isCrmSystemField(isBag(field) && field.name)),
      );
  }
  if (isBag(spec.refreshConfig)) for (const key of ownedRefreshKeys) delete spec.refreshConfig[key];
  if (Array.isArray(spec.sourceFields))
    spec.sourceFields = byName(
      spec.sourceFields
        .filter((field) => !isCrmSystemField(isBag(field) && field.name))
        .map((field) => {
          if (!isBag(field) || field.format === undefined) return field;
          // Salesforce derives the date format of a CRM source field; the create input has none.
          const copy = { ...field };
          delete copy.format;
          return copy;
        }),
    );
  if (Array.isArray(spec.mappings))
    spec.mappings = byName(
      spec.mappings
        .filter((mapping) => !isCrmSystemField(isBag(mapping) && mapping.targetFieldName))
        .map((mapping) =>
          isBag(mapping) && typeof mapping.formula === 'string'
            ? { ...mapping, formula: decodeFormula(mapping.formula) }
            : mapping,
        ),
    );
  return spec;
}

/**
 * Validate a CRM stream document. Only what names and places the file is checked; everything
 * else is sent as written on deploy and Salesforce decides.
 * @param {unknown} value Untrusted document.
 * @param {DocumentMode} [mode] `deploy` bounds the label length; `retrieve` does not.
 * @returns {CrmDataStreamDocument} Detached deeply frozen document.
 */
export function validateCrmDataStreamDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): CrmDataStreamDocument {
  const document = object(value, '', ['schemaVersion', 'kind', 'identity', 'spec']);
  const identity = object(document.identity, 'identity', ['apiName', 'dataSpace']);
  identifier(identity.apiName, 'identity.apiName');
  text(identity.dataSpace, 'identity.dataSpace');
  if (document.schemaVersion !== 1 || document.kind !== 'data-stream')
    throw new DataStreamError('UNSUPPORTED_STREAM_SPEC');
  const spec = object(
    document.spec,
    'spec',
    ['name', 'label', 'connectorInfo', 'dataLakeObjectInfo'],
    [],
    true,
  );
  if (spec.name !== identity.apiName)
    throw refuse('INVALID_STREAM_DOCUMENT', 'spec.name', 'must equal identity.apiName');
  text(spec.label, 'spec.label', mode === 'deploy');
  const dlo = object(spec.dataLakeObjectInfo, 'spec.dataLakeObjectInfo', ['name'], [], true);
  identifier(dlo.name, 'spec.dataLakeObjectInfo.name', true);
  return freeze(structuredClone(value) as CrmDataStreamDocument);
}

/**
 * Validate either stream document: a CRM stream document, otherwise an Ingestion API one.
 * @param {unknown} value Untrusted document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {DataStreamDocument | CrmDataStreamDocument} Detached deeply frozen document.
 */
export function validateAnyDataStreamDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): DataStreamDocument | CrmDataStreamDocument {
  return isCrmDataStreamDocument(value)
    ? validateCrmDataStreamDocument(value, mode)
    : validateDataStreamDocument(value, mode);
}

/**
 * Rename one key of an object in place, when present.
 * @param {Bag} bag Object.
 * @param {string} from GET spelling.
 * @param {string} to Input spelling.
 */
function rename(bag: Bag, from: string, to: string): void {
  if (!Object.hasOwn(bag, from)) return;
  bag[to] = bag[from];
  delete bag[from];
}

/**
 * Translate a CRM stream spec into the create input: the GET spellings the input names
 * differently are renamed, the data space keeps its name only, plain field mappings are left
 * out (Salesforce maps source fields itself) and formula mappings carry the DLO field type.
 * @param {Bag} spec CRM stream spec.
 * @returns {Bag} Create (POST) body.
 */
export function crmDataStreamWriteBody(spec: Bag): Bag {
  const body = structuredClone(spec);
  rename(body, 'dataStreamType', 'datastreamType');
  rename(body, 'dataSource', 'datasource');
  const types = new Map<string, unknown>();
  if (isBag(body.dataLakeObjectInfo)) {
    const dlo = body.dataLakeObjectInfo;
    if (Array.isArray(dlo.dataSpaceInfo))
      dlo.dataSpaceInfo = dlo.dataSpaceInfo.map((space) =>
        isBag(space) ? { name: space.name } : space,
      );
    rename(dlo, 'dataSpaceInfo', 'dataspaceInfo');
    if (Array.isArray(dlo.fields))
      for (const field of dlo.fields)
        if (isBag(field)) types.set(String(field.name), field.dataType);
    rename(dlo, 'fields', 'dataLakeFieldInputRepresentations');
  }
  if (Array.isArray(body.sourceFields))
    body.sourceFields = body.sourceFields.map((field) => {
      if (!isBag(field)) return field;
      const copy = { ...field };
      rename(copy, 'datatype', 'dataType');
      return copy;
    });
  if (Array.isArray(body.mappings))
    body.mappings = body.mappings
      .filter((mapping): mapping is Bag => isBag(mapping) && typeof mapping.formula === 'string')
      .map((mapping) => {
        const entry: Bag = { ...mapping, transformationFormula: mapping.formula };
        delete entry.formula;
        delete entry.sourceFieldName;
        const type = types.get(String(entry.targetFieldName));
        if (entry.targetFieldReturntype === undefined && type !== undefined)
          entry.targetFieldReturntype = type;
        return entry;
      });
  return body;
}

/**
 * A copy with object keys sorted and every array of named entries ordered by name.
 * @param {unknown} value JSON value.
 * @returns {unknown} Copy for comparison only.
 */
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => comparable(entry));
    return entries.every((entry) => isBag(entry) && typeof entry.name === 'string')
      ? byName(entries)
      : entries;
  }
  if (!isBag(value)) return value;
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh key array within the ES2022 library target.
  const keys = Object.keys(value).sort();
  return Object.fromEntries(keys.map((key) => [key, comparable(value[key])]));
}

/**
 * Whether two JSON values are equal, ignoring key order and the order of named entries.
 * @param {unknown} left First value.
 * @param {unknown} right Second value.
 * @returns {boolean} Equal.
 */
function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

/**
 * The PATCH that brings a CRM stream from its current spec to the file's spec: `datastreamType`
 * plus each changed part only. Formula mappings are compared one by one (a removed formula is
 * sent with an empty formula); refresh settings key by key; every other changed key is sent
 * whole. The DLO fields of formula targets are left to the mappings. No parts means unchanged.
 * @param {Bag} wanted Spec of the file.
 * @param {Bag} current Spec of the org's stream.
 * @returns {{body: Bag; parts: string[]}} PATCH body and the changed key paths.
 */
export function crmDataStreamPatch(wanted: Bag, current: Bag): { body: Bag; parts: string[] } {
  const want = crmDataStreamWriteBody(wanted);
  const have = crmDataStreamWriteBody(current);
  const body: Bag = { datastreamType: want.datastreamType };
  const parts: string[] = [];
  const formulas = (value: Bag): Map<string, Bag> =>
    new Map(
      (Array.isArray(value.mappings) ? (value.mappings as Bag[]) : []).map((mapping) => [
        String(mapping.targetFieldName),
        mapping,
      ]),
    );
  const wantFormulas = formulas(want);
  const haveFormulas = formulas(have);
  const mappings: Bag[] = [];
  for (const [target, mapping] of wantFormulas)
    if (haveFormulas.get(target)?.transformationFormula !== mapping.transformationFormula)
      mappings.push(mapping);
  for (const target of haveFormulas.keys())
    if (!wantFormulas.has(target))
      mappings.push({ targetFieldName: target, transformationFormula: '' });
  if (mappings.length > 0) {
    body.mappings = mappings;
    parts.push('mappings');
  }
  const formulaTargets = new Set([...wantFormulas.keys(), ...haveFormulas.keys()]);
  const withoutFormulaFields = (value: unknown): unknown =>
    isBag(value) && Array.isArray(value.dataLakeFieldInputRepresentations)
      ? {
          ...value,
          dataLakeFieldInputRepresentations: value.dataLakeFieldInputRepresentations.filter(
            (field) => !(isBag(field) && formulaTargets.has(String(field.name))),
          ),
        }
      : value;
  for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
    if (key === 'mappings' || key === 'name' || !Object.hasOwn(want, key)) continue;
    if (key === 'refreshConfig' && isBag(want.refreshConfig)) {
      const wantRefresh = want.refreshConfig;
      const haveRefresh = isBag(have.refreshConfig) ? have.refreshConfig : {};
      const refresh: Bag = {};
      for (const setting of Object.keys(wantRefresh))
        if (!sameValue(wantRefresh[setting], haveRefresh[setting])) {
          refresh[setting] = wantRefresh[setting];
          parts.push(`refreshConfig.${setting}`);
        }
      if (Object.keys(refresh).length > 0) body.refreshConfig = refresh;
      continue;
    }
    const left = key === 'dataLakeObjectInfo' ? withoutFormulaFields(want[key]) : want[key];
    const right = key === 'dataLakeObjectInfo' ? withoutFormulaFields(have[key]) : have[key];
    if (sameValue(left, right)) continue;
    parts.push(key);
    if (key !== 'datastreamType') body[key] = want[key];
  }
  return { body, parts };
}
