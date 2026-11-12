import { operationDiagnostic } from './operation-diagnostic.js';
import { DataStreamError, validateDataStreamDocument } from '../artifacts/data-stream-document.js';
import {
  resolveDataStreamBinding,
  preflightNativeDataStreamCreate,
  preflightNativeDataStreamUpdate,
  createNativeDataStream,
  updateNativeDataStream,
  preflightNativeDataStreamDelete,
  deleteNativeDataStream,
} from './native-data-stream.js';
import type {
  DataStreamDeployClients,
  DataStreamDeployOptions,
  DataStreamDeleteClients,
  DataStreamDeleteOptions,
} from './native-data-stream.js';

type PublicDeleteOptions = Omit<DataStreamDeleteOptions, 'survivorDloNames'>;

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
  const plan = await preflightNativeDataStreamDelete(apiName, clients, {
    deleteDlo: options.deleteDlo,
    survivorDloNames: [],
  });
  await options.verifyInput();
  const dloName = (plan.dlo as { name?: unknown } | null)?.name;
  return {
    outcome: 'delete' as const,
    mutation: 'not-attempted' as const,
    deleteDlo: options.deleteDlo,
    // Names the linked DLO only when it is deleted too, so its local file can be listed.
    ...(options.deleteDlo && typeof dloName === 'string' ? { targetDloName: dloName } : {}),
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
  try {
    const receipt = await deleteNativeDataStream(
      apiName,
      {
        ...clients,
        streams: {
          get: (identity) => clients.streams.get(identity),
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
 * @returns {Promise<object>} Private selected lifecycle plan.
 */
async function planDataStream(value: unknown, clients: DataStreamDeployClients) {
  const document = validateDataStreamDocument(value);
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
    ? preflightNativeDataStreamUpdate(document, clients)
    : preflightNativeDataStreamCreate(document, clients);
}

/**
 * Compare qualified stream configuration without exposing private source/schema/record identifiers.
 * @param {unknown} value Portable stream intent.
 * @param {DataStreamDeployClients} clients Independent target readers.
 * @returns {Promise<object>} Public payload-free read-only preview.
 */
export async function preflightDataStream(value: unknown, clients: DataStreamDeployClients) {
  const plan = await planDataStream(value, clients);
  return {
    family: 'data-stream' as const,
    outcome: plan.operation === 'noop' ? ('unchanged' as const) : plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'complete-binding-inventory-and-dlo-404' : 'none',
    requiredEffects: plan.operation === 'noop' ? [] : ['processing'],
    diagnostics: [],
  };
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
  let dispatched = false;
  const guarded: DataStreamDeployClients = {
    ...clients,
    streams: {
      get: (name) => clients.streams.get(name),
      list: (connection) => clients.streams.list(connection),
      create: async (document) => {
        dispatched = true;
        return clients.streams.create(document);
      },
      update: async (name, document) => {
        dispatched = true;
        return clients.streams.update(name, document);
      },
    },
  };
  try {
    const document = validateDataStreamDocument(value);
    await options.verifyInput();
    const plan = await planDataStream(document, guarded);
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
      diagnostics: [],
    };
  } catch (error) {
    return {
      family: 'data-stream' as const,
      outcome: dispatched ? ('failed' as const) : ('blocked' as const),
      mutation: dispatched ? ('unknown' as const) : ('not-attempted' as const),
      diagnostics: [
        {
          code: error instanceof DataStreamError ? error.code : 'DATA_STREAM_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            dispatched
              ? 'Write outcome is unknown; inspect target before another attempt. No automatic retry.'
              : 'No write attempted; correct the reported check before another attempt.',
          ),
        },
      ],
    };
  }
}
