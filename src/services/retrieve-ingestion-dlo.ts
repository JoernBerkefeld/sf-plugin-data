import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  ingestionCollection,
  ingestionEvent,
  ingestionName,
  ingestionRecord,
  ingestionRequire,
  IngestionDloError,
  validateIngestionDloDocument,
} from '../artifacts/ingestion-dlo-document.js';
import type { IngestionDloDocument } from '../artifacts/ingestion-dlo-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';
import type { IngestionReadOperation, McpReadObserver } from '../transport/mcp-execute.js';

export type IngestionDloConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;
export type IngestionReader = (
  operation: IngestionReadOperation,
  parameters: Record<string, unknown>,
  observe?: McpReadObserver,
) => Promise<Record<string, unknown>>;
export type IngestionDloBaseline = {
  connection: Record<string, unknown>;
  schema: Record<string, unknown>;
  stream: Record<string, unknown>;
  dlo: Record<string, unknown>;
  keyQualifiers: unknown[];
};
export type IngestionDloAcquisition = {
  identity: IngestionDloDocument['identity'];
  candidate?: IngestionDloDocument;
  expectations?: IngestionDloBaseline;
  blockers: string[];
};

/**
 * Verify fixed explicit API67/default scope before every operation.
 * @param {IngestionDloConnection} connection Authenticated receiver.
 * @param {ApiVersionSelection} version Fixed selection.
 * @param {string} space Space.
 */
export function ingestionScope(
  connection: IngestionDloConnection,
  version: ApiVersionSelection,
  space: string,
): void {
  ingestionRequire(
    version?.requested === '67.0' &&
      version.restSelector === 'v67.0' &&
      version.soapNumeric === '67.0' &&
      space === 'default' &&
      connection.getApiVersion() === '67.0',
    'INVALID_SCOPE',
  );
  const origin = new URL(connection.instanceUrl);
  ingestionRequire(
    origin.protocol === 'https:' &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash,
    'INVALID_SCOPE',
  );
}

/**
 * Require a complete bounded collection; no next-page assumptions or empty-filter absence proof.
 * @param {Record<string, unknown>} response Collection response.
 * @param {string} key Collection key.
 * @returns {Array<Record<string, unknown>>} Complete records.
 */
function complete(response: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  ingestionRequire(
    Object.keys(response).every((item) =>
      [key, 'totalSize', 'currentPageUrl', 'nextPageUrl'].includes(item),
    ),
  );
  const entries = ingestionCollection(response[key]);
  ingestionRequire(
    response.totalSize === entries.length && entries.length <= 200 && !response.nextPageUrl,
    'INCOMPLETE_SOURCE_INVENTORY',
  );
  return entries;
}

/**
 * Normalize qualified field collections, preserving every definition property.
 * @param {Record<string, unknown>} value DLO or embedded DLO.
 * @returns {Array<Record<string, unknown>>} Full fields.
 */
export function ingestionDloFields(value: Record<string, unknown>): Array<Record<string, unknown>> {
  const fields = ingestionCollection(value.fields);
  ingestionRequire(
    isDeepStrictEqual(fields, ingestionCollection(value.dataLakeFieldInfoRepresentation)),
  );
  for (const field of fields) {
    ingestionRecord(field, ['name', 'label', 'dataType', 'isPrimaryKey']);
    ingestionRequire(
      field.dataType === 'Text' &&
        typeof field.label === 'string' &&
        typeof field.isPrimaryKey === 'boolean',
    );
  }
  return fields;
}

/**
 * Re-admit independently acquired raw bindings; no receipt, generated-name parsing or supplied authority flag.
 * @param {IngestionDloBaseline} value Private observations.
 * @param {string} apiName Exact existing DLO.
 * @param {boolean} [pending] Permit the single expected stage-one source extension only.
 * @returns {IngestionDloDocument} Complete admitted source config.
 */
export function projectIngestionDlo(
  value: IngestionDloBaseline,
  apiName: string,
  pending = false,
): IngestionDloDocument {
  const connection = ingestionRecord(value.connection, [
    'connectorType',
    'id',
    'label',
    'name',
    'status',
    'tenantSpecificEndpoint',
  ]);
  ingestionRequire(
    connection.connectorType === 'IngestApi' &&
      connection.status === 'CONNECTED' &&
      ingestionName(connection.name) &&
      typeof connection.id === 'string',
  );
  const schema = ingestionRecord(value.schema, [
    'name',
    'label',
    'fields',
    'schemaType',
    'availabilityStatus',
  ]);
  ingestionRequire(
    schema.schemaType === 'IngestApi' &&
      ['In Use', 'Available'].includes(schema.availabilityStatus as string),
  );
  const event = ingestionEvent({ name: schema.name, label: schema.label, fields: schema.fields });
  const stream = ingestionRecord(value.stream);
  const permitted = new Set([
    'advancedAttributes',
    'capabilities',
    'connectorInfo',
    'dataAccessMode',
    'dataLakeObjectInfo',
    'dataSource',
    'dataStreamType',
    'isEnabled',
    'label',
    'lastAddedRecords',
    'lastProcessedRecords',
    'lastRefreshDate',
    'lastRunStatus',
    'mappings',
    'name',
    'problemRecordDataLakeObjectName',
    'recordId',
    'refreshConfig',
    'sourceFields',
    'status',
    'totalRecords',
  ]);
  ingestionRequire(Object.keys(stream).every((key) => permitted.has(key)));
  ingestionRequire(
    stream.status === 'ACTIVE' &&
      ingestionName(stream.name) &&
      typeof stream.recordId === 'string' &&
      stream.dataSource === connection.name &&
      stream.dataStreamType === 'INGESTAPI' &&
      stream.dataAccessMode === 'INGEST' &&
      stream.isEnabled === true,
  );
  ingestionRequire(
    isDeepStrictEqual(stream.connectorInfo, { connectorType: 'IngestApi' }) &&
      isDeepStrictEqual(stream.capabilities, {}) &&
      isDeepStrictEqual(stream.advancedAttributes, {}),
  );
  ingestionRequire(ingestionName(stream.problemRecordDataLakeObjectName));
  const refresh = ingestionRecord(stream.refreshConfig, [
    'frequency',
    'hasHeaders',
    'isAccelerationEnabled',
    'refreshMode',
    'shouldFetchImmediately',
    'shouldTreatMissingFilesAsFailures',
  ]);
  ingestionRequire(
    isDeepStrictEqual(refresh, {
      frequency: { hours: [], refreshDayOfMonth: [] },
      hasHeaders: false,
      isAccelerationEnabled: false,
      refreshMode: 'UPSERT',
      shouldFetchImmediately: false,
      shouldTreatMissingFilesAsFailures: false,
    }),
  );
  const dlo = ingestionRecord(value.dlo);
  const runtimeKeys = new Set(['lastRefreshedDate', 'totalRecords']);
  ingestionRecord(
    Object.fromEntries(Object.entries(dlo).filter(([key]) => !runtimeKeys.has(key))),
    [
      'capabilities',
      'category',
      'createdDate',
      'dataLakeFieldInfoRepresentation',
      'dataSpaceInfo',
      'fields',
      'id',
      'label',
      'name',
      'namespace',
      'status',
    ],
  );
  // These optional persisted-DLO observations appear after automatic processing.
  // Admit only the observed value shapes; they are not deployment configuration.
  if (Object.hasOwn(dlo, 'lastRefreshedDate')) {
    const timestamp = dlo.lastRefreshedDate;
    ingestionRequire(
      typeof timestamp === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp) &&
        Number.isFinite(Date.parse(timestamp)) &&
        new Date(timestamp).toISOString() === timestamp,
    );
  }
  if (Object.hasOwn(dlo, 'totalRecords'))
    ingestionRequire(
      typeof dlo.totalRecords === 'number' &&
        Number.isSafeInteger(dlo.totalRecords) &&
        dlo.totalRecords >= 0,
    );
  ingestionRequire(
    dlo.name === apiName &&
      dlo.status === 'ACTIVE' &&
      dlo.category === 'Other' &&
      dlo.namespace === '' &&
      typeof dlo.id === 'string' &&
      isDeepStrictEqual(dlo.capabilities, {}) &&
      isDeepStrictEqual(dlo.dataSpaceInfo, [{ name: 'default', label: 'default' }]),
  );
  const embedded = ingestionRecord(stream.dataLakeObjectInfo, [
    'capabilities',
    'category',
    'dataLakeFieldInfoRepresentation',
    'dataSpaceInfo',
    'fields',
    'id',
    'label',
    'name',
    'status',
  ]);
  ingestionRequire(
    embedded.name === apiName &&
      embedded.category === dlo.category &&
      embedded.status === 'ACTIVE' &&
      embedded.label === dlo.label &&
      typeof embedded.id === 'string' &&
      isDeepStrictEqual(embedded.capabilities, {}) &&
      isDeepStrictEqual(embedded.dataSpaceInfo, dlo.dataSpaceInfo),
  );
  const fields = ingestionDloFields(dlo);
  const mappedFields = ingestionDloFields(embedded).map((field) => ({
    ...field,
    name: `${field.name as string}__c`,
  }));
  ingestionRequire(isDeepStrictEqual(fields, ingestionCollection(mappedFields)));
  const sources = ingestionCollection(stream.sourceFields);
  for (const field of sources) {
    ingestionRecord(field, ['name', 'datatype']);
    ingestionRequire(field.datatype === 'Text');
  }
  const eventSources = event.fields.map((field) => ({
    name: field.name,
    datatype: field.dataType,
  }));
  const missing = eventSources.filter(
    (field) => !sources.some((source) => isDeepStrictEqual(source, field)),
  );
  ingestionRequire(
    pending
      ? missing.length === 1 && eventSources.length === sources.length + 1
      : isDeepStrictEqual(sources, eventSources),
    'PENDING_SOURCE_FIELDS',
  );
  const keys = fields.filter((field) => field.isPrimaryKey);
  ingestionRequire(
    keys.length === 1 && sources.some((field) => `${field.name as string}__c` === keys[0].name),
  );
  const keyName = (keys[0].name as string).slice(0, -3);
  const expectedNames = [
    ...sources.map((field) => `${field.name as string}__c`),
    `KQ_${keyName}__c`,
    'DataSourceObject__c',
    'DataSource__c',
    'cdp_sys_SourceVersion__c',
  ];
  ingestionRequire(
    isDeepStrictEqual(
      ingestionCollection(fields.map((field) => ({ name: field.name }))),
      ingestionCollection(expectedNames.map((name) => ({ name }))),
    ),
  );
  const mappings = ingestionCollection(stream.mappings, 'targetFieldName');
  const expectedMappings = ingestionCollection(
    [
      ...sources.map((field) => ({ sourceFieldName: field.name, targetFieldName: field.name })),
      { formula: `&quot;${stream.name as string}&quot;`, targetFieldName: 'DataSourceObject' },
      { formula: `&quot;${connection.name}&quot;`, targetFieldName: 'DataSource' },
    ],
    'targetFieldName',
  );
  ingestionRequire(isDeepStrictEqual(mappings, expectedMappings));
  ingestionRequire(Array.isArray(value.keyQualifiers) && value.keyQualifiers.length === 0);
  return validateIngestionDloDocument({
    schemaVersion: 1,
    kind: 'ingestion-dlo',
    identity: { dataSpace: 'default', apiName },
    spec: { connectionName: connection.name, event },
  });
}

/**
 * Acquire an existing DLO and authoritative connection/one-event/sole-stream binding in at most eight reads.
 * @param {IngestionDloConnection} connection Receiver.
 * @param {string} apiName Exact DLO.
 * @param {ApiVersionSelection} version API67.
 * @param {string} space Default.
 * @param {object} [options] Private injection/observation only.
 * @param {IngestionReader} [options.read] Guarded reader.
 * @param {McpReadObserver} [options.observe] Awaited private recorder.
 * @param {boolean} [options.pending] Stage-one reconciliation only.
 * @returns {Promise<IngestionDloAcquisition>} Detached admitted evidence or explicit blocker.
 */
export async function retrieveIngestionDlo(
  connection: IngestionDloConnection,
  apiName: string,
  version: ApiVersionSelection,
  space: string,
  options: { read?: IngestionReader; observe?: McpReadObserver; pending?: boolean } = {},
): Promise<IngestionDloAcquisition> {
  const identity = { dataSpace: 'default' as const, apiName };
  try {
    ingestionScope(connection, version, space);
    ingestionRequire(ingestionName(apiName) && apiName.endsWith('__dll'));
    const origin = connection.instanceUrl;
    const selection = structuredClone(version);
    const client = new McpExecuteClient(connection, version);
    const read = async (
      operation: IngestionReadOperation,
      parameters: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      ingestionScope(connection, version, space);
      ingestionRequire(connection.instanceUrl === origin && isDeepStrictEqual(selection, version));
      const result = await (
        options.read ?? ((op, parameters_, observe) => client.read(op, parameters_, observe))
      )(operation, parameters, options.observe);
      ingestionScope(connection, version, space);
      ingestionRequire(connection.instanceUrl === origin && isDeepStrictEqual(selection, version));
      return structuredClone(ingestionRecord(result));
    };
    // Bind the owner using complete per-connection inventories, never generated-name parsing.
    const connections = complete(
      await read('d360_connection_list', { connectorType: 'IngestApi', limit: 200, offset: 0 }),
      'connections',
    );
    const inventory = complete(
      await read('d360_datastream_list', { filter: 'INGESTAPI', limit: 200, offset: 0 }),
      'dataStreams',
    );
    const owners = inventory.filter(
      (item) => ingestionRecord(item.dataLakeObjectInfo).name === apiName,
    );
    ingestionRequire(owners.length === 1, 'AMBIGUOUS_DLO_OWNER');
    const matches = connections.filter((item) => item.name === owners[0].dataSource);
    ingestionRequire(matches.length === 1, 'SOURCE_CONNECTION_BINDING_REQUIRED');
    const listed = matches[0];
    const streams = complete(
      await read('d360_datastream_list', {
        filter: 'INGESTAPI',
        connectionName: listed.name,
        limit: 200,
        offset: 0,
      }),
      'dataStreams',
    );
    ingestionRequire(
      streams.length === 1 && ingestionRecord(streams[0].dataLakeObjectInfo).name === apiName,
      'SHARED_SOURCE_OR_UNKNOWN_OWNER',
    );
    const stream = await read('d360_datastream_get', { recordIdOrDeveloperName: streams[0].name });
    ingestionRequire(
      stream.name === streams[0].name &&
        stream.recordId === streams[0].recordId &&
        stream.dataSource === listed.name,
    );
    const bound = await read('d360_connection_get', { connectionId: listed.id });
    ingestionRequire(bound.id === listed.id && bound.name === listed.name);
    const schemas = await read('d360_connection_schema_get', { connectionId: bound.id });
    ingestionRecord(schemas, ['schemas']);
    ingestionRequire(
      Array.isArray(schemas.schemas) && schemas.schemas.length === 1,
      'MULTIPLE_SOURCE_EVENTS',
    );
    const detail = await read('d360_dlo_get', { recordIdOrDeveloperName: apiName });
    ingestionRecord(detail, ['dataLakeObjects']);
    ingestionRequire(Array.isArray(detail.dataLakeObjects) && detail.dataLakeObjects.length === 1);
    const qualifiers = await read('d360_dlo_kq_list', { recordIdOrDeveloperName: apiName });
    ingestionRecord(qualifiers, ['keyQualifiers']);
    ingestionRequire(Array.isArray(qualifiers.keyQualifiers));
    const expectations: IngestionDloBaseline = {
      connection: bound,
      schema: ingestionRecord(schemas.schemas[0]),
      stream,
      dlo: ingestionRecord(detail.dataLakeObjects[0]),
      keyQualifiers: qualifiers.keyQualifiers,
    };
    const candidate = projectIngestionDlo(expectations, apiName, options.pending);
    return { identity, candidate, expectations, blockers: [] };
  } catch (error: unknown) {
    return {
      identity,
      blockers: [
        error instanceof IngestionDloError ? error.code : 'INGESTION_DLO_ACQUISITION_FAILED',
      ],
    };
  }
}
