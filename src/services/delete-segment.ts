import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { validateSegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { projectSegment } from './retrieve-segment.js';
import { operationDiagnostic } from './operation-diagnostic.js';

export const segmentDeleteBudget = Object.freeze({
  reads: 12,
  intervalMs: 1000,
  timeoutMs: 120_000,
});
export type SegmentDeleteOptions = {
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
  bind?: typeof bindSegmentDependencies;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type SegmentDeleteResult = {
  family: 'segment';
  outcome: 'delete' | 'deleted' | 'deletion-processing' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-deleted' | 'acknowledged-processing' | 'unknown';
  requiredEffects: Array<'destructive'>;
  diagnostics: Array<{ code: string; message: string }>;
};
type TargetConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'
>;

/**
 * Preserve the complete selected definition and private identity, excluding volatile observations.
 * @param {Record<string, unknown>} runtime Strict independently projected runtime.
 * @returns {Record<string, unknown>} Detached stable comparison baseline.
 */
function preservation(runtime: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(runtime);
  for (const key of [
    'segmentStatus',
    'lastModifiedBy',
    'lastModifiedDate',
    'lastSegmentMemberCount',
  ])
    delete result[key];
  return result;
}

/**
 * Delete one exact native68 JSON-matched Segment, without replay or generated-resource cleanup.
 * Bindings establish selected source compatibility, not exhaustive external-consumer exclusion.
 * @param {unknown} value Complete local JSON expectation; not ownership authority.
 * @param {TargetConnection} connection Fixed authenticated target.
 * @param {ApiVersionSelection} selection Exact API68 selection.
 * @param {string} dataSpace Exact default space.
 * @param {SegmentDeleteOptions} options Preview, destructive confirmation and fresh input guard.
 * @returns {Promise<SegmentDeleteResult>} Payload-free independent absence or preserved transition.
 */
export async function deleteSegment(
  value: unknown,
  connection: TargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: SegmentDeleteOptions,
): Promise<SegmentDeleteResult> {
  let attempted = false;
  const result = (
    outcome: SegmentDeleteResult['outcome'],
    code?: string,
    error?: unknown,
  ): SegmentDeleteResult =>
    retainConnectDiagnostic(
      {
        family: 'segment',
        outcome,
        mutation: attempted
          ? outcome === 'deleted'
            ? 'confirmed-deleted'
            : outcome === 'deletion-processing'
              ? 'acknowledged-processing'
              : 'unknown'
          : 'not-attempted',
        requiredEffects: outcome === 'delete' ? ['destructive'] : [],
        diagnostics: code
          ? [
              {
                code,
                message: operationDiagnostic(
                  error,
                  attempted
                    ? 'Segment deletion may have occurred; absence is unconfirmed. No replay, fallback or rollback was performed.'
                    : 'Segment deletion was not attempted; input, scope, identity, definition or binding is unqualified.',
                ),
              },
            ]
          : [],
      },
      getConnectDiagnostic(error),
    );
  try {
    const desired = validateSegmentDocument(value);
    const frozen = { ...selection };
    const origin = connection.instanceUrl;
    const request = connection.request;
    const preview = options.preview === true;
    const confirmed = options.confirmDelete;
    const verify = options.verifyInput;
    const now = options.now ?? Date.now;
    const started = now();
    let previous = started;
    const check = (): void => {
      const current = now();
      if (
        !Number.isFinite(started) ||
        !Number.isFinite(current) ||
        current < previous ||
        current - started >= segmentDeleteBudget.timeoutMs ||
        frozen.requested !== '68.0' ||
        frozen.restSelector !== 'v68.0' ||
        frozen.soapNumeric !== '68.0' ||
        !isDeepStrictEqual(selection, frozen) ||
        connection.getApiVersion() !== '68.0' ||
        connection.instanceUrl !== origin ||
        connection.request !== request ||
        dataSpace !== 'default' ||
        (options.preview === true) !== preview ||
        options.confirmDelete !== confirmed ||
        typeof verify !== 'function' ||
        options.verifyInput !== verify ||
        !isDeepStrictEqual(validateSegmentDocument(value), desired)
      )
        throw new Error('Scope, intent or deadline drift');
      previous = current;
    };
    const input = async (): Promise<void> => {
      check();
      await verify();
      check();
    };
    check();
    const client = new ConnectClient(connection, frozen);
    const read = async (): Promise<ReturnType<typeof projectSegment> | undefined> => {
      check();
      try {
        const raw = await client.get(
          `/services/data/v68.0/ssot/segments/${desired.identity.apiName}`,
        );
        check();
        return projectSegment(raw, desired.identity.apiName);
      } catch (error) {
        check();
        if (
          error instanceof ConnectError &&
          error.statusCode === 404 &&
          error.nativeCode === 'ITEM_NOT_FOUND'
        )
          return undefined;
        throw error;
      }
    };
    await input();
    const baseline = await read();
    if (!baseline) {
      await input();
      if (await read()) throw new Error('Target appeared');
      return result('unchanged');
    }
    const runtime = baseline.runtime;
    if (
      !isDeepStrictEqual(baseline.candidate, desired) ||
      !['ACTIVE', 'PROCESSING', 'COUNTING'].includes(String(runtime.segmentStatus)) ||
      typeof runtime.marketSegmentId !== 'string' ||
      !/^1sg[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(runtime.marketSegmentId) ||
      typeof runtime.marketSegmentDefinitionId !== 'string' ||
      !/^3HX[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(runtime.marketSegmentDefinitionId) ||
      typeof runtime.createdDate !== 'string' ||
      !runtime.createdDate ||
      !runtime.segmentMembershipDmo
    )
      throw new Error('Target identity or definition');
    const bind = options.bind ?? bindSegmentDependencies;
    const bindings = await bind(desired, connection, frozen, dataSpace);
    check();
    if (bindings.length !== 1 || runtime.segmentOnId !== bindings[0].targetId)
      throw new Error('Source identity');
    const matches = (observed: ReturnType<typeof projectSegment>): boolean =>
      isDeepStrictEqual(observed.candidate, desired) &&
      isDeepStrictEqual(preservation(observed.runtime), preservation(runtime));
    await input();
    if (!isDeepStrictEqual(bindings, await bind(desired, connection, frozen, dataSpace)))
      throw new Error('Dependency drift');
    check();
    const fresh = await read();
    if (
      !fresh ||
      !matches(fresh) ||
      !['ACTIVE', 'PROCESSING', 'COUNTING'].includes(String(fresh.runtime.segmentStatus))
    )
      throw new Error('Target drift');
    await input();
    if (preview) return result('delete');
    if (options.confirmDelete !== true)
      return result('blocked', 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
    check();
    attempted = true;
    // HTTP204 proves only acknowledgement. A failed/uncertain DELETE never becomes success.
    let failure: unknown;
    try {
      await client.deleteSegment(desired.identity.apiName);
    } catch (error) {
      failure = error;
    }
    check();
    for (let attempt = 0; attempt < segmentDeleteBudget.reads; attempt++) {
      if (attempt > 0) await (options.delay ?? delay)(segmentDeleteBudget.intervalMs);
      check();
      const observed = await read();
      if (failure) return result('failed', 'SEGMENT_DELETION_UNCONFIRMED', failure);
      if (!observed) return result('deleted');
      if (!matches(observed)) throw new Error('Readback mismatch');
      if (
        observed.runtime.segmentStatus === 'DELETING' ||
        (fresh.runtime.segmentStatus === 'ACTIVE' &&
          observed.runtime.segmentStatus === 'PROCESSING')
      )
        return result('deletion-processing');
      if (!['ACTIVE', 'COUNTING', 'PROCESSING'].includes(String(observed.runtime.segmentStatus)))
        throw new Error('Unknown lifecycle');
    }
    throw new Error('Read budget');
  } catch (error) {
    return result(
      attempted ? 'failed' : 'blocked',
      attempted ? 'SEGMENT_DELETION_UNCONFIRMED' : 'SEGMENT_DELETE_ADMISSION_FAILED',
      error,
    );
  }
}
