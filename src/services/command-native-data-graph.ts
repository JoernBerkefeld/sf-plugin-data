import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { isDeepStrictEqual } from 'node:util';
import { graphRequire } from '../artifacts/data-graph-document.js';
import {
  observeNativeDataGraph,
  nativeDataGraphDocumentFromResponse,
  nativeDataGraphUnreferenced,
} from '../artifacts/native-data-graph-document.js';
import { graphRecord } from '../artifacts/data-graph-document.js';
import { validateNativeDataGraphDocument } from '../artifacts/native-data-graph-document.js';
import {
  acquireNativeDataGraph,
  bindNativeGraphRoot,
  nativeDataGraphLifecycle,
  NativeGraphWriteRefused,
  sendNativeGraphWrite,
  settleNativeDataGraph,
  updateNativeDataGraph,
} from './native-data-graph-crd.js';
import type { NativeGraphContext, NativeGraphCreateCheck } from './native-data-graph-crd.js';
import type { DataGraphClient } from '../transport/data-graph-rest.js';

/**
 * Project independently read native runtime configuration into a distinct authored artifact.
 * @param {string} name Exact selected graph.
 * @param {NativeGraphContext} context Scoped independent readers.
 * @returns {Promise<import('../artifacts/native-data-graph-document.js').NativeDataGraphDocument>} Portable intent without generated identities.
 */
export async function retrieveNativeDataGraph(
  name: string,
  context: NativeGraphContext,
): Promise<import('../artifacts/native-data-graph-document.js').NativeDataGraphDocument> {
  context.check();
  const read = await context.get(name);
  if (read.status !== 200)
    throw retainConnectDiagnostic(
      new Error('Native Graph read unavailable'),
      getConnectDiagnostic(read),
    );
  const raw = graphRecord(read.body);
  graphRequire(raw.name === name);
  const document = nativeDataGraphDocumentFromResponse(raw);
  const rootName = document.definition.primaryObjectName as string;
  const root = await bindNativeGraphRoot(context, rootName);
  const observed = observeNativeDataGraph(raw, document);
  graphRequire(observed.status === 'ready');
  const fresh = await acquireNativeDataGraph(context, document);
  try {
    graphRequire(
      isDeepStrictEqual({ state: 'present', observation: observed }, fresh) &&
        isDeepStrictEqual(root, await bindNativeGraphRoot(context, rootName)),
    );
  } catch (error) {
    if (error instanceof Error) retainConnectDiagnostic(error, getConnectDiagnostic(fresh));
    throw error;
  }
  return document;
}

export const nativeGraphLimitations =
  'Native dependency and related-segment arrays block delete only: delete is refused while any node or field reports one, while deploy and retrieve proceed regardless. Exhaustive external-consumer exclusion is unverified. Definition absence does not establish generated DMO, mapping or transform cleanup, computation success, storage reclamation or credit savings.';
export type NativeGraphOperationResult = {
  outcome:
    | 'create'
    | 'update'
    | 'delete'
    | 'created'
    | 'updated'
    | 'deleted'
    | 'unchanged'
    | 'blocked'
    | 'failed';
  mutation:
    | 'not-attempted'
    | 'confirmed-created'
    | 'confirmed-updated'
    | 'confirmed-deleted'
    | 'rejected'
    | 'unknown';
  /** After an attempted create: the step that could not confirm it. */
  failedCheck?: NativeGraphCreateCheck;
};

/**
 * Bind one invocation to fresh target identity and root; never import creation ownership.
 * @param {unknown} value Exact local native intent.
 * @param {NativeGraphContext} context Independently org-bound readers.
 * @param {DataGraphClient} client Single-attempt writer.
 * @param {object} options Explicit operation intent and immutable source verifier.
 * @param {'deploy' | 'delete'} options.operation Requested product operation.
 * @param {boolean} options.preview Zero-write comparison.
 * @param {boolean} options.confirmed Explicit processing/deletion acknowledgement.
 * @param {Function} options.verifyInput Re-admit exact local bytes and flags.
 * @param {Function} [options.pause] Read-only polling seam.
 * @param {Function} [options.now] Injectable monotonic clock.
 * @param {number} [options.waitTimeoutSeconds] Deploy invocation budget in seconds.
 * @param {Function} [options.progress] Stderr-only progress sink.
 * @returns {Promise<NativeGraphOperationResult>} Truthful mutation evidence.
 */
export async function operateNativeDataGraph(
  value: unknown,
  context: NativeGraphContext,
  client: DataGraphClient,
  options: {
    operation: 'deploy' | 'delete';
    preview: boolean;
    confirmed: boolean;
    verifyInput: () => Promise<void>;
    pause?: Parameters<typeof settleNativeDataGraph>[3];
    now?: () => number;
    waitTimeoutSeconds?: number;
    progress?: (message: string) => void;
  },
): Promise<NativeGraphOperationResult> {
  let attempted = false;
  let creating = false;
  let diagnostic: ConnectDiagnostic | undefined;
  const original = context;
  const now = options.now ?? Date.now;
  const started = now();
  const budget =
    options.operation === 'deploy' ? (options.waitTimeoutSeconds ?? 1800) * 1000 : 120_000;
  const end = started + budget;
  let previous = started;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  context = {
    ...original,
    check: () => {
      original.check();
      const current = now();
      graphRequire(
        !expired &&
          Number.isFinite(budget) &&
          budget > 0 &&
          Number.isFinite(current) &&
          current >= previous &&
          current < end &&
          context.orgId === original.orgId,
      );
      previous = current;
    },
  };
  // Guard the actual dispatch, including CREATE delegated to the fixture lifecycle.
  const writer: DataGraphClient = {
    get: (name) => client.get(name),
    create: (definition) => {
      context.check();
      attempted = true;
      return client.create(definition);
    },
    update: (name, definition) => {
      context.check();
      const update = client.update;
      graphRequire(typeof update === 'function');
      attempted = true;
      return update(name, definition);
    },
    delete: (name) => {
      context.check();
      attempted = true;
      return client.delete(name);
    },
  };
  const waitPause =
    options.pause ??
    (async (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const progress =
    options.progress ??
    ((message: string) => {
      process.stderr.write(`${message}\n`);
    });
  const acquire = async (
    document: Parameters<typeof acquireNativeDataGraph>[1],
  ): Promise<Awaited<ReturnType<typeof acquireNativeDataGraph>>> => {
    const result = await acquireNativeDataGraph(context, document, options.operation === 'deploy');
    diagnostic = getConnectDiagnostic(result) ?? diagnostic;
    return result;
  };
  const work = async (): Promise<NativeGraphOperationResult> => {
    context.check();
    const document = validateNativeDataGraphDocument(value);
    const orgId = context.orgId;
    await options.verifyInput();
    const rootName = document.definition.primaryObjectName as string;
    const root = await bindNativeGraphRoot(context, rootName);
    const before = await acquire(document);
    context.check();
    graphRequire(context.orgId === orgId);
    if (before.state === 'absent' && options.operation === 'delete')
      return { outcome: 'unchanged', mutation: 'not-attempted' };
    if (before.state === 'present' && options.operation === 'deploy') {
      let outcome: Awaited<ReturnType<typeof updateNativeDataGraph>>;
      try {
        outcome = await updateNativeDataGraph(context, writer, document, before.observation, {
          preview: options.preview,
          confirmed: options.confirmed,
          verify: async () => {
            await options.verifyInput();
            graphRequire(isDeepStrictEqual(root, await bindNativeGraphRoot(context, rootName)));
          },
          now,
          pause: waitPause,
          progress,
          started,
          end,
        });
      } catch (error) {
        // Every PUT was refused with HTTP429/503 until the budget ran out: nothing was processed.
        if (error instanceof NativeGraphWriteRefused)
          return retainConnectDiagnostic(
            { outcome: 'failed', mutation: 'not-attempted' },
            getConnectDiagnostic(error),
          );
        throw error;
      }
      return { outcome, mutation: outcome === 'updated' ? 'confirmed-updated' : 'not-attempted' };
    }
    graphRequire(
      options.operation === 'deploy'
        ? before.state === 'absent'
        : before.state === 'present' &&
            before.observation.status === 'ready' &&
            // Delete stays refused while any node or field reports dependencies or segments.
            nativeDataGraphUnreferenced(before.observation.target.sourceObject),
    );
    await options.verifyInput();
    graphRequire(
      isDeepStrictEqual(before, await acquire(document)) &&
        isDeepStrictEqual(root, await bindNativeGraphRoot(context, rootName)) &&
        context.orgId === orgId,
    );
    if (options.preview)
      return {
        outcome: options.operation === 'deploy' ? 'create' : 'delete',
        mutation: 'not-attempted',
      };
    graphRequire(options.confirmed === true);
    if (options.operation === 'deploy') {
      // Reuse the qualified create settlement; fixture ownership is not public delete authority.
      const lifecycle = nativeDataGraphLifecycle(document, context, writer, {
        record: async (phase) => {
          await options.verifyInput();
          if (phase === 'create-attempt')
            graphRequire(
              isDeepStrictEqual(root, await bindNativeGraphRoot(context, rootName)) &&
                isDeepStrictEqual(before, await acquire(document)),
            );
        },
        safeToDelete: async () => false,
        pause: options.pause,
        now,
        // Keep waiting while the created graph is still building, up to --wait-timeout.
        creation: { started, end, pause: waitPause, progress },
      });
      creating = true;
      const result = await lifecycle.create(true);
      return retainConnectDiagnostic(
        {
          outcome:
            result.outcome === 'created'
              ? 'created'
              : result.outcome === 'unknown'
                ? 'failed'
                : 'blocked',
          mutation:
            result.outcome === 'created'
              ? 'confirmed-created'
              : result.mutation === 'attempted'
                ? 'unknown'
                : 'not-attempted',
          ...(result.failedCheck ? { failedCheck: result.failedCheck } : {}),
        },
        getConnectDiagnostic(result) ?? diagnostic,
      );
    }
    // The pre-check above required empty native node/field dependencies and segments.
    // Compare all captured identity/date/definition fields again after local admission, immediately before dispatch.
    await options.verifyInput();
    graphRequire(
      isDeepStrictEqual(before, await acquire(document)) &&
        isDeepStrictEqual(root, await bindNativeGraphRoot(context, rootName)),
    );
    context.check();
    graphRequire(context.orgId === orgId);
    // The DELETE answer decides: 2xx is deleted, an API 4xx is a refusal. No read-back:
    // the by-name metadata read serves a stale copy for minutes after a delete (live, API68).
    // HTTP429/503 was not processed: the identical DELETE is sent again within the budget.
    try {
      await sendNativeGraphWrite(
        async () => writer.delete(document.definition.name as string),
        'delete',
        { now, end, pause: waitPause, progress },
      );
    } catch (error) {
      const evidence = getConnectDiagnostic(error);
      if (error instanceof NativeGraphWriteRefused)
        return retainConnectDiagnostic({ outcome: 'failed', mutation: 'not-attempted' }, evidence);
      if (evidence?.kind === 'api-error' && evidence.statusCode >= 400 && evidence.statusCode < 500)
        return retainConnectDiagnostic({ outcome: 'failed', mutation: 'rejected' }, evidence);
      // Other 5xx or transport: the DELETE may have happened; never replay it.
      throw error;
    }
    return { outcome: 'deleted', mutation: 'confirmed-deleted' };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        const schedule = (): void => {
          if (expired) return;
          const remaining = end - now();
          if (remaining <= 0) {
            expired = true;
            reject(new Error('Native Graph deadline'));
            return;
          }
          // Node overflows longer delays to 1ms; retain the original invocation deadline.
          timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
        };
        schedule();
      }),
    ]);
  } catch (error) {
    return retainConnectDiagnostic(
      {
        outcome: attempted ? 'failed' : 'blocked',
        mutation: attempted ? 'unknown' : 'not-attempted',
        // The invocation deadline can fire before the create lifecycle reports its step.
        ...(attempted && creating ? { failedCheck: 'deadline' as const } : {}),
      },
      getConnectDiagnostic(error) ?? diagnostic,
    );
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}
