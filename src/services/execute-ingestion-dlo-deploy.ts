import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import {
  ingestionAddition,
  ingestionCollection,
  ingestionRecord,
  ingestionRequire,
  IngestionDloError,
  validateIngestionDloDocument,
} from '../artifacts/ingestion-dlo-document.js';
import type { IngestionDloDocument } from '../artifacts/ingestion-dlo-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';
import {
  ingestionScope,
  projectIngestionDlo,
  retrieveIngestionDlo,
} from './retrieve-ingestion-dlo.js';
import type {
  IngestionDloAcquisition,
  IngestionDloBaseline,
  IngestionDloConnection,
  IngestionReader,
} from './retrieve-ingestion-dlo.js';

export type IngestionDloOptions = {
  read?: IngestionReader;
  acquire?: typeof retrieveIngestionDlo;
};
export type IngestionDloPreview = {
  family: 'ingestion-dlo';
  outcome: 'unchanged' | 'update' | 'blocked';
  requiredEffects: Array<'processing'>;
  diagnostics: string[];
};
export type IngestionDloExecution = {
  family: 'ingestion-dlo';
  outcome: 'unchanged' | 'updated' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-updated' | 'unknown';
  stage: 'none' | 'schema-attempted' | 'schema-confirmed' | 'sync-attempted' | 'settled';
  diagnostics: string[];
};

/**
 * Re-admit raw acquisition and canonical content; injected candidates confer no authority.
 * @param {IngestionDloAcquisition} acquired Observation.
 * @param {IngestionDloDocument} desired Input.
 * @param {boolean} [pending] Stage-one expected source delta.
 * @returns {IngestionDloBaseline} Detached baseline.
 */
function admit(
  acquired: IngestionDloAcquisition,
  desired: IngestionDloDocument,
  pending = false,
): IngestionDloBaseline {
  ingestionRequire(
    acquired.expectations &&
      acquired.candidate &&
      acquired.blockers.length === 0 &&
      isDeepStrictEqual(acquired.identity, desired.identity),
  );
  const projected = projectIngestionDlo(acquired.expectations, desired.identity.apiName, pending);
  ingestionRequire(isDeepStrictEqual(projected, validateIngestionDloDocument(acquired.candidate)));
  return structuredClone(acquired.expectations);
}

/**
 * Normalize only known unordered collections and volatile observations. Preserve all config values.
 * @param {IngestionDloBaseline} value Raw baseline.
 * @returns {IngestionDloBaseline} Canonical full preservation baseline.
 */
export function canonicalIngestionDloBaseline(value: IngestionDloBaseline): IngestionDloBaseline {
  const result = structuredClone(value);
  result.schema.fields = ingestionCollection(result.schema.fields);
  // Availability is source-runtime state, not a writable schema property.
  delete result.schema.availabilityStatus;
  for (const object of [result.dlo, ingestionRecord(result.stream.dataLakeObjectInfo)]) {
    object.fields = ingestionCollection(object.fields);
    object.dataLakeFieldInfoRepresentation = ingestionCollection(
      object.dataLakeFieldInfoRepresentation,
    );
  }
  result.stream.sourceFields = ingestionCollection(result.stream.sourceFields);
  result.stream.mappings = ingestionCollection(result.stream.mappings, 'targetFieldName');
  for (const key of [
    'lastAddedRecords',
    'lastProcessedRecords',
    'lastRefreshDate',
    'lastRunStatus',
    'totalRecords',
  ])
    delete result.stream[key];
  return result;
}

/**
 * Read-only preview of complete equality or exactly one fresh Text extension.
 * @param {unknown} value Desired.
 * @param {IngestionDloConnection} connection Receiver.
 * @param {ApiVersionSelection} version Route.
 * @param {string} space Space.
 * @param {IngestionDloOptions} [options] Private test seam.
 * @returns {Promise<IngestionDloPreview>} Honest admission.
 */
export async function preflightIngestionDloDeploy(
  value: unknown,
  connection: IngestionDloConnection,
  version: ApiVersionSelection,
  space: string,
  options: IngestionDloOptions = {},
): Promise<IngestionDloPreview> {
  try {
    const desired = validateIngestionDloDocument(value);
    ingestionScope(connection, version, space);
    const acquired = await (options.acquire ?? retrieveIngestionDlo)(
      connection,
      desired.identity.apiName,
      version,
      space,
      { read: options.read },
    );
    const baseline = admit(acquired, desired);
    const current = projectIngestionDlo(baseline, desired.identity.apiName);
    const equal = isDeepStrictEqual(current, desired);
    ingestionRequire(equal || ingestionAddition(current, desired));
    return {
      family: 'ingestion-dlo',
      outcome: equal ? 'unchanged' : 'update',
      requiredEffects: equal ? [] : ['processing'],
      diagnostics: [],
    };
  } catch (error: unknown) {
    return {
      family: 'ingestion-dlo',
      outcome: 'blocked',
      requiredEffects: [],
      diagnostics: [
        error instanceof IngestionDloError ? error.code : 'INGESTION_DLO_PREFLIGHT_FAILED',
      ],
    };
  }
}

/**
 * Perform one complete source schema PUT and one owning-stream sync, never rollback or replay.
 * @param {unknown} value Desired.
 * @param {IngestionDloConnection} connection Receiver.
 * @param {ApiVersionSelection} version Fixed API67.
 * @param {string} space Default.
 * @param {object} options Immutable-input/effect/receipt guards.
 * @param {boolean} options.allowProcessing Explicit acknowledgement.
 * @param {Function} options.verifyInput Awaited fresh input verification.
 * @param {Function} options.recordObservation Awaited private observation sink.
 * @param {Function} [options.mutate] Test mutation boundary.
 * @param {Function} [options.now] Clock.
 * @param {Function} [options.delay] Wait.
 * @param {object} [options.pollWindow] Finite read budget.
 * @param {IngestionReader} [options.read] Read boundary.
 * @param {Function} [options.acquire] Acquisition boundary.
 * @returns {Promise<IngestionDloExecution>} Partial state stays unknown after either attempted write.
 */
export async function executeIngestionDloDeploy(
  value: unknown,
  connection: IngestionDloConnection,
  version: ApiVersionSelection,
  space: string,
  options: IngestionDloOptions & {
    allowProcessing: boolean;
    verifyInput: () => Promise<void>;
    recordObservation: (value: unknown) => Promise<void>;
    mutate?: (
      operation: 'd360_connection_schema_put_ingestion_api' | 'd360_datastream_patch_ingestion_api',
      parameters: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    pollWindow?: { reads: number; intervalMs: number; timeoutMs: number };
  },
): Promise<IngestionDloExecution> {
  let stage: IngestionDloExecution['stage'] = 'none';
  const result = (
    outcome: IngestionDloExecution['outcome'],
    diagnostic?: string,
  ): IngestionDloExecution => ({
    family: 'ingestion-dlo',
    outcome,
    stage,
    mutation:
      stage === 'none' ? 'not-attempted' : stage === 'settled' ? 'confirmed-updated' : 'unknown',
    diagnostics: diagnostic ? [diagnostic] : [],
  });
  try {
    const desired = validateIngestionDloDocument(value);
    const selection = structuredClone(version);
    const origin = connection.instanceUrl;
    const scope = (): void => {
      ingestionScope(connection, version, space);
      ingestionRequire(
        connection.instanceUrl === origin && isDeepStrictEqual(version, selection),
        'SCOPE_DRIFT',
      );
    };
    scope();
    const acquire = options.acquire ?? retrieveIngestionDlo;
    ingestionRequire(typeof options.verifyInput === 'function');
    const capture = async (pending = false): Promise<IngestionDloBaseline> => {
      scope();
      const acquired = await acquire(
        connection,
        desired.identity.apiName,
        { ...selection },
        space,
        { read: options.read, observe: options.recordObservation, pending },
      );
      scope();
      return admit(acquired, desired, pending);
    };
    await options.verifyInput();
    const baseline = await capture();
    const current = projectIngestionDlo(baseline, desired.identity.apiName);
    const equal = isDeepStrictEqual(current, desired);
    const addition = ingestionAddition(current, desired);
    ingestionRequire(equal || addition);
    await options.verifyInput();
    const fresh = await capture();
    ingestionRequire(
      isDeepStrictEqual(
        canonicalIngestionDloBaseline(baseline),
        canonicalIngestionDloBaseline(fresh),
      ),
      'SOURCE_DRIFT',
    );
    await options.verifyInput();
    scope();
    if (equal) return result('unchanged');
    ingestionRequire(
      addition &&
        options.allowProcessing === true &&
        typeof options.recordObservation === 'function',
      'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
    );
    const window = {
      ...(options.pollWindow ?? { reads: 6, intervalMs: 60_000, timeoutMs: 360_000 }),
    };
    ingestionRequire(
      Number.isInteger(window.reads) &&
        window.reads > 0 &&
        window.reads <= 30 &&
        Number.isFinite(window.intervalMs) &&
        window.intervalMs > 0 &&
        Number.isFinite(window.timeoutMs) &&
        window.timeoutMs > 0 &&
        window.timeoutMs <= 1_800_000,
    );
    const now = options.now ?? Date.now;
    const delay = options.delay ?? setTimeout;
    const started = now();
    const elapsed = (): void => {
      const duration = now() - started;
      ingestionRequire(Number.isFinite(duration) && duration >= 0 && duration < window.timeoutMs);
    };
    const client = new McpExecuteClient(connection, selection);
    const mutate =
      options.mutate ??
      ((operation, parameters) => client.mutate(operation, parameters, options.recordObservation));
    elapsed();
    stage = 'schema-attempted';
    // Mutation responses are recorded before classification, including nested errors.
    const schemaResponse = await mutate('d360_connection_schema_put_ingestion_api', {
      connectionId: baseline.connection.id,
      objects: [structuredClone(desired.spec.event)],
    });
    await options.recordObservation(structuredClone(schemaResponse));
    ingestionRecord(schemaResponse, ['schemas']);
    ingestionRequire(Array.isArray(schemaResponse.schemas) && schemaResponse.schemas.length === 1);
    // Independent post-PUT source read must show exactly the expected extension, while
    // all old stream/DLO settings and authority remain unchanged before stage two.
    const pending = await capture(true);
    ingestionRequire(
      isDeepStrictEqual(projectIngestionDlo(pending, desired.identity.apiName, true), desired),
    );
    const expectedPending = structuredClone(baseline);
    expectedPending.schema.fields = desired.spec.event.fields;
    ingestionRequire(
      isDeepStrictEqual(
        canonicalIngestionDloBaseline(expectedPending),
        canonicalIngestionDloBaseline(pending),
      ),
      'POST_SCHEMA_PRESERVATION_FAILED',
    );
    stage = 'schema-confirmed';
    await options.verifyInput();
    scope();
    elapsed();
    // A second fresh authority read immediately precedes the sync. Do not sync any
    // unrelated source delta or a modified local input after schema publication.
    ingestionRequire(
      isDeepStrictEqual(
        canonicalIngestionDloBaseline(pending),
        canonicalIngestionDloBaseline(await capture(true)),
      ),
      'SOURCE_DRIFT',
    );
    await options.verifyInput();
    scope();
    elapsed();
    stage = 'sync-attempted';
    const sync = await mutate('d360_datastream_patch_ingestion_api', {
      recordIdOrDeveloperName: baseline.stream.name,
      syncSchema: true,
    });
    await options.recordObservation(structuredClone(sync));
    const response = ingestionRecord(sync);
    ingestionRequire(
      Object.keys(response).every((key) =>
        ['dataLakeObjectInfo', 'id', 'label', 'name', 'recordId', 'status'].includes(key),
      ) &&
        response.name === baseline.stream.name &&
        response.recordId === baseline.stream.recordId &&
        ['PROCESSING', 'ACTIVE'].includes(response.status as string),
    );
    const target = ingestionRecord(response.dataLakeObjectInfo);
    ingestionRequire(
      target.name === desired.identity.apiName &&
        target.id === ingestionRecord(baseline.stream.dataLakeObjectInfo).id,
    );
    for (let attempt = 0; attempt < window.reads; attempt++) {
      elapsed();
      scope();
      const acquired = await acquire(
        connection,
        desired.identity.apiName,
        { ...selection },
        space,
        { read: options.read, observe: options.recordObservation },
      );
      await options.recordObservation(structuredClone(acquired));
      scope();
      elapsed();
      if (acquired.blockers.length === 0) {
        const settled = admit(acquired, desired);
        ingestionRequire(
          isDeepStrictEqual(projectIngestionDlo(settled, desired.identity.apiName), desired),
        );
        const expected = structuredClone(expectedPending);
        const field = { ...addition, name: `${addition.name}__c`, isPrimaryKey: false };
        expected.dlo.fields = [...(expected.dlo.fields as unknown[]), field];
        expected.dlo.dataLakeFieldInfoRepresentation = expected.dlo.fields;
        const embedded = ingestionRecord(expected.stream.dataLakeObjectInfo);
        embedded.fields = [...(embedded.fields as unknown[]), { ...addition, isPrimaryKey: false }];
        embedded.dataLakeFieldInfoRepresentation = embedded.fields;
        expected.stream.sourceFields = [
          ...(expected.stream.sourceFields as unknown[]),
          { name: addition.name, datatype: 'Text' },
        ];
        expected.stream.mappings = [
          ...(expected.stream.mappings as unknown[]),
          { sourceFieldName: addition.name, targetFieldName: addition.name },
        ];
        ingestionRequire(
          isDeepStrictEqual(
            canonicalIngestionDloBaseline(expected),
            canonicalIngestionDloBaseline(settled),
          ),
          'SETTLED_PRESERVATION_FAILED',
        );
        stage = 'settled';
        return result('updated');
      }
      if (attempt + 1 < window.reads) await delay(window.intervalMs);
    }
    return result('failed', 'SETTLEMENT_UNKNOWN_NO_REPLAY');
  } catch (error: unknown) {
    return result(
      stage === 'none' ? 'blocked' : 'failed',
      error instanceof IngestionDloError ? error.code : 'INGESTION_DLO_EXECUTION_FAILED',
    );
  }
}
