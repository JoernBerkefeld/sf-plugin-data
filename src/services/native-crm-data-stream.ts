import { setTimeout as wait } from 'node:timers/promises';
import {
  DataStreamError,
  crmDataStreamPatch,
  crmDataStreamSpec,
  isCrmDataStream,
  validateCrmDataStreamDocument,
} from '../artifacts/data-stream-document.js';
import type { CrmDataStreamDocument } from '../artifacts/data-stream-document.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
import type { DataStreamClient } from '../transport/data-stream-rest.js';
import type { DataStreamDocument } from '../artifacts/data-stream-document.js';
import { WriteLedger, rejectedNextAction } from './deploy-result.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import {
  checkRetrievedStreamScope,
  isStreamNotFound,
  projectNativeDataStream,
} from './native-data-stream.js';
import type { DataStreamReadClients, DataStreamReadMode } from './native-data-stream.js';

type Json = Record<string, unknown>;
/** Native stream access a CRM stream deploy needs. */
export type CrmDataStreamClients = {
  streams: Pick<DataStreamClient, 'get' | 'create' | 'patch'>;
};
export type CrmDataStreamDeployOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<unknown>;
};

/**
 * Project a CRM stream GET into its stream file.
 * @param {unknown} read Stream GET response.
 * @param {string} apiName Requested stream name.
 * @param {DocumentMode} mode Validation mode.
 * @returns {CrmDataStreamDocument} Stream document.
 */
export function projectCrmDataStream(
  read: unknown,
  apiName: string,
  mode: DocumentMode,
): CrmDataStreamDocument {
  return validateCrmDataStreamDocument(
    {
      schemaVersion: 1,
      kind: 'data-stream',
      identity: { apiName, dataSpace: 'default' },
      spec: crmDataStreamSpec(read),
    },
    mode,
  );
}

/**
 * Retrieve one stream as its file: a CRM stream (retrieve mode) as its GET without server-owned
 * keys, every other stream through the Ingestion API projection.
 * @param {string} apiName Exact stream name.
 * @param {DataStreamReadClients} clients Native readers.
 * @param {string} dataSpace Data space (default only).
 * @param {boolean} postWrite Whether this read belongs to create/update settlement.
 * @param {DataStreamReadMode} mode `retrieve` or `deploy`.
 * @returns {Promise<DataStreamDocument | CrmDataStreamDocument>} Stream document.
 */
export async function retrieveDataStreamDocument(
  apiName: string,
  clients: DataStreamReadClients,
  dataSpace = 'default',
  postWrite = false,
  mode: DataStreamReadMode = 'deploy',
): Promise<DataStreamDocument | CrmDataStreamDocument> {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(apiName) || dataSpace !== 'default')
    throw new DataStreamError('INVALID_STREAM_BINDING');
  const read = await clients.streams.get(apiName);
  if (mode === 'retrieve' && isCrmDataStream(read)) {
    checkRetrievedStreamScope(read, apiName);
    return projectCrmDataStream(read, apiName, mode);
  }
  return projectNativeDataStream(read, apiName, clients, dataSpace, postWrite, mode);
}

/**
 * Read the stream of the file's name; an HTTP 404 means absent.
 * @param {string} apiName Stream name.
 * @param {CrmDataStreamClients} clients Native reader.
 * @returns {Promise<Json | undefined>} Stream GET, or undefined when absent.
 */
async function readCrmStream(
  apiName: string,
  clients: CrmDataStreamClients,
): Promise<Json | undefined> {
  let read: unknown;
  try {
    read = await clients.streams.get(apiName);
  } catch (error) {
    if (isStreamNotFound(error)) return undefined;
    throw error;
  }
  if (!read || typeof read !== 'object' || Array.isArray(read))
    throw new DataStreamError('INVALID_STREAM_READ');
  const stream = read as Json;
  // A stream of that name that is not a CRM stream is another object; never overwrite it.
  if (stream.name !== apiName || !isCrmDataStream(stream))
    throw new DataStreamError('STREAM_TARGET_MISMATCH');
  return stream;
}

type CrmPlan =
  | { operation: 'create' }
  | { operation: 'update' | 'noop'; current: Json; body: Json; parts: string[] };

/**
 * Compare the file with the org: absent creates, equal is unchanged, otherwise a PATCH of the
 * changed parts.
 * @param {CrmDataStreamDocument} document Validated CRM stream file.
 * @param {CrmDataStreamClients} clients Native reader.
 * @returns {Promise<CrmPlan>} Plan.
 */
async function planCrmDataStream(
  document: CrmDataStreamDocument,
  clients: CrmDataStreamClients,
): Promise<CrmPlan> {
  if (document.identity.dataSpace !== 'default')
    throw new DataStreamError('UNSUPPORTED_STREAM_DATASPACE');
  const current = await readCrmStream(document.identity.apiName, clients);
  if (!current) return { operation: 'create' };
  const { body, parts } = crmDataStreamPatch(document.spec, crmDataStreamSpec(current));
  return { operation: parts.length > 0 ? 'update' : 'noop', current, body, parts };
}

/**
 * Read-only comparison of a CRM stream file with the org.
 * @param {unknown} value CRM stream document.
 * @param {CrmDataStreamClients} clients Native reader.
 * @returns {Promise<object>} Preview item.
 */
export async function preflightCrmDataStream(value: unknown, clients: CrmDataStreamClients) {
  const document = validateCrmDataStreamDocument(value);
  const plan = await planCrmDataStream(document, clients);
  return {
    family: 'data-stream' as const,
    outcome: plan.operation === 'noop' ? ('unchanged' as const) : plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'stream-404' : 'none',
    requiredEffects: plan.operation === 'noop' ? [] : ['processing'],
    ...(plan.operation === 'update' ? { changes: plan.parts } : {}),
    diagnostics: [],
  };
}

/**
 * The parts Salesforce did not apply, as one notice. Salesforce answers a label PATCH with 200
 * and keeps the old label, so a label part gets its own sentence.
 * @param {string[]} parts Key paths that still differ after the write settled.
 * @returns {Array<{code: string; message: string}>} Notices.
 */
function notApplied(parts: string[]): Array<{ code: string; message: string }> {
  if (parts.length === 0) return [];
  const others = parts.filter((part) => part !== 'label');
  const sentences = [
    ...(parts.includes('label')
      ? ['Salesforce accepted the label change but kept the old label; change it in Salesforce.']
      : []),
    ...(others.length > 0
      ? [
          `Salesforce accepted the write but the stream still differs from the file in ${others.join(', ')}.`,
        ]
      : []),
  ];
  return [
    {
      code: 'STREAM_CHANGE_NOT_APPLIED',
      message: `${sentences.join(' ')} Retrieve the stream to see what it holds.`,
    },
  ];
}

/**
 * Create or update a CRM stream from its file and read it back until it is ACTIVE. The file is
 * translated into the create input or a PATCH of the changed parts and sent; Salesforce decides,
 * and its answer is reported. Create and update need --allow-processing.
 * @param {unknown} value CRM stream document.
 * @param {CrmDataStreamClients} clients Native clients.
 * @param {CrmDataStreamDeployOptions} options Processing acknowledgement, input guard, read bounds.
 * @returns {Promise<object>} Result item.
 */
export async function executeCrmDataStream(
  value: unknown,
  clients: CrmDataStreamClients,
  options: CrmDataStreamDeployOptions,
) {
  const ledger = new WriteLedger();
  try {
    const document = validateCrmDataStreamDocument(value);
    const apiName = document.identity.apiName;
    const targetDloName = (document.spec.dataLakeObjectInfo as Json).name as string;
    await options.verifyInput();
    const plan = await planCrmDataStream(document, clients);
    if (plan.operation === 'noop')
      return {
        family: 'data-stream' as const,
        outcome: 'unchanged' as const,
        mutation: 'not-attempted' as const,
        targetApiName: apiName,
        targetDloName,
        diagnostics: [],
      };
    if (options.allowProcessing !== true)
      throw new DataStreamError('PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    await options.verifyInput();
    await (plan.operation === 'create'
      ? ledger.run(async () => clients.streams.create(document))
      : ledger.run(async () => clients.streams.patch(String(plan.current.recordId), plan.body)));
    const now = options.now ?? Date.now;
    const pause = options.wait ?? wait;
    const deadline = now() + 15 * 60 * 1000;
    let remaining: string[] | undefined;
    let settledReads = 0;
    for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
      const current = await readCrmStream(apiName, clients);
      if (current && !['ACTIVE', 'PROCESSING'].includes(current.status as string))
        throw new DataStreamError(
          plan.operation === 'create'
            ? 'STREAM_CREATE_SETTLEMENT_UNCONFIRMED'
            : 'STREAM_UPDATE_SETTLEMENT_UNCONFIRMED',
        );
      if (current?.status === 'ACTIVE') {
        remaining = crmDataStreamPatch(document.spec, crmDataStreamSpec(current)).parts;
        settledReads++;
        // Done when the stream holds the file; a part Salesforce ignores stays after 3 reads.
        if (remaining.length === 0 || settledReads >= 3) break;
      }
      if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
    }
    if (remaining === undefined)
      throw new DataStreamError(
        plan.operation === 'create'
          ? 'STREAM_CREATE_SETTLEMENT_UNCONFIRMED'
          : 'STREAM_UPDATE_SETTLEMENT_UNCONFIRMED',
      );
    await options.verifyInput();
    return {
      family: 'data-stream' as const,
      outcome: plan.operation === 'create' ? ('created' as const) : ('updated' as const),
      mutation:
        plan.operation === 'create'
          ? ('confirmed-created' as const)
          : ('confirmed-updated' as const),
      targetApiName: apiName,
      targetDloName,
      diagnostics: notApplied(remaining),
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
