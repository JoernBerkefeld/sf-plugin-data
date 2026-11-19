import { operationDiagnostic } from './operation-diagnostic.js';
import { WriteLedger, rejectedNextAction } from './deploy-result.js';
import {
  DataStreamError,
  isCrmDataStreamDocument,
  validateDataStreamDocument,
} from '../artifacts/data-stream-document.js';
import { executeCrmDataStream, preflightCrmDataStream } from './native-crm-data-stream.js';
import {
  resolveDataStreamBinding,
  preflightNativeDataStreamCreate,
  preflightNativeDataStreamUpdate,
  createNativeDataStream,
  updateNativeDataStream,
  preflightNativeDataStreamDelete,
  deleteNativeDataStream,
  isStreamNotFound,
  requireRunSpace,
} from './native-data-stream.js';
import type {
  DataStreamDeployClients,
  DataStreamDeployOptions,
  DataStreamDeleteClients,
  DataStreamDeleteOptions,
  DataStreamUpdatePlan,
} from './native-data-stream.js';

type PublicDeleteOptions = Omit<DataStreamDeleteOptions, 'survivorDloNames'>;

/**
 * Watch the first stream read of a delete: an exact HTTP 404 for the selected name means the
 * stream is already gone (a rerun after it was deleted), not a failure.
 * @template T
 * @param {string} apiName Exact selected stream name.
 * @param {T} clients Native clients.
 * @returns {object} Clients with the watched read, and whether that first read answered 404.
 */
export function watchStreamAbsence<
  T extends { streams: Pick<DataStreamDeleteClients['streams'], 'get'> },
>(apiName: string, clients: T): { clients: T; absent: () => boolean } {
  let reads = 0;
  let absent = false;
  return {
    clients: {
      ...clients,
      streams: {
        ...clients.streams,
        get: async (identity: string) => {
          const first = reads++ === 0;
          try {
            return await clients.streams.get(identity);
          } catch (error) {
            if (first && identity === apiName && isStreamNotFound(error)) absent = true;
            throw error;
          }
        },
      },
    } as T,
    absent: () => absent,
  };
}

/**
 * Preview selected-stream/linked-parent deletion only; unrelated org objects are outside this scope.
 * @param {string} apiName Exact selected stream name.
 * @param {DataStreamDeleteClients} clients Independent native and dependency readers.
 * @param {PublicDeleteOptions} options Explicit cascade acknowledgement and selection guard.
 * @returns {Promise<object>} Payload-free preview, never private target identifiers.
 */
export async function preflightDeleteDataStream(
  apiName: string,
  clients: DataStreamDeleteClients,
  options: PublicDeleteOptions,
) {
  await options.verifyInput();
  const watched = watchStreamAbsence(apiName, clients);
  let plan: Awaited<ReturnType<typeof preflightNativeDataStreamDelete>>;
  try {
    plan = await preflightNativeDataStreamDelete(apiName, watched.clients, {
      deleteDlo: options.deleteDlo,
      survivorDloNames: [],
      ...(options.dataSpace === undefined ? {} : { dataSpace: options.dataSpace }),
      ...(options.covered ? { covered: options.covered } : {}),
    });
  } catch (error) {
    if (!watched.absent()) throw error;
    // Already gone: nothing to delete.
    await options.verifyInput();
    return {
      outcome: 'unchanged' as const,
      mutation: 'not-attempted' as const,
      deleteDlo: options.deleteDlo,
    };
  }
  await options.verifyInput();
  const dloName = (plan.dlo as { name?: unknown } | null)?.name;
  return {
    outcome: plan.plannedDependencies ? ('planned-dependencies' as const) : ('delete' as const),
    mutation: 'not-attempted' as const,
    deleteDlo: options.deleteDlo,
    // Names the linked DLO only when it is deleted too, so its local file can be listed.
    ...(options.deleteDlo && typeof dloName === 'string' ? { targetDloName: dloName } : {}),
    ...(plan.plannedDependencies ? { plannedDependencies: plan.plannedDependencies } : {}),
  };
}

/**
 * Delete exactly the selected stream with linked-parent checks and actual-dispatch classification.
 * @param {string} apiName Exact selected stream name.
 * @param {DataStreamDeleteClients} clients Single-attempt native mutation and independent readers.
 * @param {PublicDeleteOptions} options Cascade acknowledgement and immutable selection guard.
 * @returns {Promise<object>} Confirmed deletion or payload-free blocked/unknown result.
 */
export async function executeDeleteDataStream(
  apiName: string,
  clients: DataStreamDeleteClients,
  options: PublicDeleteOptions,
) {
  let dispatched = false;
  const watched = watchStreamAbsence(apiName, clients);
  try {
    const receipt = await deleteNativeDataStream(
      apiName,
      {
        ...clients,
        streams: {
          get: (identity) => watched.clients.streams.get(identity),
          list: (connection) => clients.streams.list(connection),
          delete: async (identity, cascade) => {
            dispatched = true;
            await clients.streams.delete(identity, cascade);
          },
        },
      },
      { ...options, survivorDloNames: [] },
    );
    return {
      outcome: 'deleted' as const,
      mutation: 'confirmed-deleted' as const,
      targetApiName: receipt.targetApiName,
      targetDloName: receipt.targetDloName,
      diagnostics: [],
    };
  } catch (error) {
    // The first read of the stream answered 404: already gone, nothing was sent.
    if (!dispatched && watched.absent())
      return {
        outcome: 'unchanged' as const,
        mutation: 'not-attempted' as const,
        diagnostics: [],
      };
    return {
      outcome: dispatched ? ('failed' as const) : ('blocked' as const),
      mutation: dispatched ? ('unknown' as const) : ('not-attempted' as const),
      diagnostics: [
        {
          code: error instanceof DataStreamError ? error.code : 'DATA_STREAM_DELETE_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            dispatched
              ? 'Deletion outcome is unknown; inspect target before another attempt. No automatic retry.'
              : 'No deletion attempted; correct the reported check before another attempt.',
          ),
          retryable: false as const,
        },
      ],
    };
  }
}

/**
 * Select create only from independently confirmed logical absence, never an artifact-name miss.
 * @param {unknown} value Portable stream intent.
 * @param {DataStreamDeployClients} clients Independent target readers.
 * @param {string} dataSpace The run's data space.
 * @returns {Promise<object>} Private selected lifecycle plan.
 */
async function planDataStream(value: unknown, clients: DataStreamDeployClients, dataSpace: string) {
  const document = validateDataStreamDocument(value);
  requireRunSpace(document, dataSpace);
  const binding = await resolveDataStreamBinding(
    {
      ...document.identity,
      connectionName: document.spec.connectionName,
      event: document.spec.event,
      primaryKey: document.spec.newDlo.primaryKey.name,
    },
    clients,
  );
  return binding.target
    ? preflightNativeDataStreamUpdate(document, clients, dataSpace)
    : preflightNativeDataStreamCreate(document, clients, dataSpace);
}

/**
 * Compare qualified stream configuration without exposing private source/schema/record identifiers.
 * @param {unknown} value Portable stream intent.
 * @param {DataStreamDeployClients} clients Independent target readers.
 * @param {string} [dataSpace] The run's data space.
 * @returns {Promise<object>} Public payload-free read-only preview.
 */
export async function preflightDataStream(
  value: unknown,
  clients: DataStreamDeployClients,
  dataSpace = 'default',
) {
  if (isCrmDataStreamDocument(value)) return preflightCrmDataStream(value, clients, dataSpace);
  const plan = await planDataStream(value, clients, dataSpace);
  return {
    family: 'data-stream' as const,
    outcome: plan.operation === 'noop' ? ('unchanged' as const) : plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'complete-binding-inventory-and-dlo-404' : 'none',
    requiredEffects: plan.operation === 'noop' ? [] : ['processing'],
    ...(plan.operation === 'update' ? { changes: ingestUpdateChanges(plan) } : {}),
    diagnostics: [],
  };
}

/**
 * The parts an Ingestion API update sends, for the preview: the label, each added or changed
 * mapping, and each mapping removed from the file.
 * @param {DataStreamUpdatePlan} plan Update plan.
 * @returns {string[]} Changed parts, for example `mappings[Score2]` or `remove mappings[Old]`.
 */
function ingestUpdateChanges(plan: DataStreamUpdatePlan): string[] {
  return [
    ...(plan.labelChange ? ['label'] : []),
    ...[...plan.additions, ...plan.formulaChanges].map((entry) =>
      'transformationFormula' in entry && entry.transformationFormula === ''
        ? `remove mappings[${entry.targetFieldName}]`
        : `mappings[${entry.targetFieldName}]`,
    ),
  ];
}

/**
 * Dispatch through completed internal lifecycle helpers and classify failure at the actual write boundary.
 * @param {unknown} value Portable stream intent.
 * @param {DataStreamDeployClients} clients Native target clients.
 * @param {DataStreamDeployOptions} options Exact local input guards and processing acknowledgement.
 * @returns {Promise<object>} Public confirmed/unknown mutation result, without response payloads.
 */
export async function executeDataStream(
  value: unknown,
  clients: DataStreamDeployClients,
  options: DataStreamDeployOptions,
) {
  if (isCrmDataStreamDocument(value)) return executeCrmDataStream(value, clients, options);
  // A 4xx answer to the single write is Salesforce's refusal and is reported as rejected.
  const ledger = new WriteLedger();
  const guarded: DataStreamDeployClients = {
    ...clients,
    streams: {
      get: (name) => clients.streams.get(name),
      list: (connection) => clients.streams.list(connection),
      create: async (document, sourceFields) =>
        ledger.run(async () => clients.streams.create(document, sourceFields)),
      update: async (name, document) =>
        ledger.run(async () => clients.streams.update(name, document)),
      patch: async (name, body) => ledger.run(async () => clients.streams.patch(name, body)),
      ...(clients.streams.relabel
        ? {
            // Only the update is a write: a failed read before it changed nothing.
            relabel: async (name: string, label: string) =>
              clients.streams.relabel!(name, label, async (write) => ledger.run(write)),
          }
        : {}),
    },
  };
  try {
    const document = validateDataStreamDocument(value);
    await options.verifyInput();
    const plan = await planDataStream(document, guarded, options.dataSpace ?? 'default');
    const result =
      plan.operation === 'create'
        ? await createNativeDataStream(document, guarded, options)
        : await updateNativeDataStream(document, guarded, options);
    return {
      family: 'data-stream' as const,
      outcome:
        result.operation === 'noop'
          ? ('unchanged' as const)
          : result.operation === 'create'
            ? ('created' as const)
            : ('updated' as const),
      mutation:
        result.operation === 'noop'
          ? ('not-attempted' as const)
          : result.operation === 'create'
            ? ('confirmed-created' as const)
            : ('confirmed-updated' as const),
      targetApiName: result.targetApiName,
      targetDloName: result.targetDloName,
      diagnostics: result.notices,
    };
  } catch (error) {
    const { outcome, mutation } = ledger.failure(error);
    return {
      family: 'data-stream' as const,
      outcome,
      mutation,
      diagnostics: [
        {
          code: error instanceof DataStreamError ? error.code : 'DATA_STREAM_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            mutation === 'rejected'
              ? rejectedNextAction
              : mutation === 'unknown'
                ? 'Write outcome is unknown; inspect target before another attempt. No automatic retry.'
                : 'No write attempted; correct the reported check before another attempt.',
          ),
        },
      ],
    };
  }
}
