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
 * Check one exact object shape without accepting runtime identifiers.
 * @param {unknown} value Untrusted object.
 * @param {string[]} required Required keys.
 * @param {string[]} [optional] Optional keys.
 * @returns {Record<string, unknown>} Checked object.
 */
function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DataStreamError('INVALID_STREAM_DOCUMENT');
  const result = value as Record<string, unknown>;
  if (
    !required.every((key) => Object.hasOwn(result, key)) ||
    Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new DataStreamError('INVALID_STREAM_DOCUMENT');
  return result;
}

/**
 * Check bounded text, preserving labels rather than rewriting them.
 * @param {unknown} value Untrusted text.
 * @returns {string} Checked text.
 */
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > 500 ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    )
  )
    throw new DataStreamError('INVALID_STREAM_DOCUMENT');
  return value;
}

/**
 * Check a portable developer name.
 * @param {unknown} value Untrusted name.
 * @param {boolean} [dlo] Whether a DLO suffix is required.
 * @returns {string} Checked name.
 */
function identifier(value: unknown, dlo = false): string {
  if (!(dlo ? dloName : name).test(text(value))) throw new DataStreamError('INVALID_STREAM_NAME');
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
 * Validate authored intent separately from retained, read-only schema evidence.
 * @param {unknown} value Untrusted portable document.
 * @returns {DataStreamDocument} Detached deeply frozen document.
 */
export function validateDataStreamDocument(value: unknown): DataStreamDocument {
  const document = object(value, ['schemaVersion', 'kind', 'identity', 'spec'], ['observed']);
  const identity = object(document.identity, ['apiName', 'dataSpace']);
  identifier(identity.apiName);
  text(identity.dataSpace);
  const spec = object(document.spec, [
    'connectorType',
    'connectionName',
    'event',
    'datastreamType',
    'refreshMode',
    'label',
    'newDlo',
    'additiveFieldMappings',
  ]);
  identifier(spec.connectionName);
  identifier(spec.event);
  text(spec.label);
  const dlo = object(spec.newDlo, ['name', 'label', 'category', 'primaryKey']);
  identifier(dlo.name, true);
  if (text(dlo.label).length > 40) throw new DataStreamError('INVALID_STREAM_LABEL');
  const pk = object(dlo.primaryKey, ['name', 'label', 'dataType']);
  identifier(pk.name);
  text(pk.label);
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
  for (const entry of spec.additiveFieldMappings) {
    const mapping = object(entry, ['sourceFieldLabel', 'targetFieldName', 'targetFieldReturntype']);
    identifier(mapping.sourceFieldLabel);
    const target = identifier(mapping.targetFieldName);
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
    const observed = object(document.observed, [
      'mappings',
      'sourceFields',
      'dloFields',
      'actualDloName',
    ]);
    identifier(observed.actualDloName, true);
    for (const key of ['mappings', 'sourceFields', 'dloFields'])
      if (!Array.isArray(observed[key])) throw new DataStreamError('INVALID_STREAM_OBSERVED');
    const observedTargets = new Set<string>();
    const sourceNames = new Set<string>();
    const fieldNames = new Set<string>();
    for (const entry of observed.mappings as unknown[]) {
      const mapping = object(entry, ['targetFieldName'], ['sourceFieldName', 'formula']);
      const target = identifier(mapping.targetFieldName).toLowerCase();
      if (observedTargets.has(target)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      observedTargets.add(target);
      if ((mapping.sourceFieldName === undefined) === (mapping.formula === undefined))
        throw new DataStreamError('INVALID_STREAM_OBSERVED');
      if (mapping.sourceFieldName !== undefined) identifier(mapping.sourceFieldName);
      if (mapping.formula !== undefined) text(mapping.formula);
    }
    for (const entry of observed.sourceFields as unknown[]) {
      const field = object(entry, ['name', 'datatype']);
      const source = identifier(field.name).toLowerCase();
      if (sourceNames.has(source)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      sourceNames.add(source);
      text(field.datatype);
    }
    for (const entry of observed.dloFields as unknown[]) {
      const field = object(entry, ['name', 'label', 'dataType', 'isPrimaryKey']);
      const fieldName = identifier(field.name).toLowerCase();
      if (fieldNames.has(fieldName)) throw new DataStreamError('INVALID_STREAM_OBSERVED');
      fieldNames.add(fieldName);
      text(field.label);
      text(field.dataType);
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
  const target = identifier(value);
  if (target.endsWith('__c')) throw new DataStreamError('INVALID_STREAM_MAPPING');
  return `${target}__c`;
}
