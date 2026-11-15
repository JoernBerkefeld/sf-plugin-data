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
 * mode keeps unknown keys of observed mappings and source fields as returned, and lifts the
 * 500-character text limit and the 40-character DLO label limit.
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
  if (document.observed !== undefined) {
    const observed = object(document.observed, 'observed', [
      'mappings',
      'sourceFields',
      'dloFields',
      'actualDloName',
    ]);
    identifier(observed.actualDloName, 'observed.actualDloName', true);
    for (const key of ['mappings', 'sourceFields', 'dloFields'])
      if (!Array.isArray(observed[key])) throw new DataStreamError('INVALID_STREAM_OBSERVED');
    const observedTargets = new Set<string>();
    const sourceNames = new Set<string>();
    const fieldNames = new Set<string>();
    for (const [index, entry] of (observed.mappings as unknown[]).entries()) {
      const at = `observed.mappings[${index}]`;
      const mapping = object(
        entry,
        at,
        ['targetFieldName'],
        ['sourceFieldName', 'formula'],
        lenient,
      );
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
      const field = object(entry, at, ['name', 'datatype'], [], lenient);
      const source = identifier(field.name, `${at}.name`).toLowerCase();
      if (sourceNames.has(source)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      sourceNames.add(source);
      text(field.datatype, `${at}.datatype`, bounded);
    }
    for (const [index, entry] of (observed.dloFields as unknown[]).entries()) {
      const at = `observed.dloFields[${index}]`;
      const field = object(entry, at, ['name', 'label', 'dataType', 'isPrimaryKey']);
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
