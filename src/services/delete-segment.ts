import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import {
  SegmentError,
  carriesDefinition,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { isVerbatimDocument } from '../artifacts/verbatim-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { projectSegment, segmentChildNames } from './retrieve-segment.js';
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
 * The segment inside a raw GET, checked only for what names and places it: the same API name in
 * the default data space. Used for a verbatim file, whose segment the plugin cannot model.
 * @param {unknown} response Raw GET response.
 * @param {string} apiName Selected name.
 * @returns {{candidate: undefined; runtime: Record<string, unknown>}} The raw segment.
 */
function rawSegment(
  response: unknown,
  apiName: string,
): { candidate: undefined; runtime: Record<string, unknown> } {
  const segments = (response as { segments?: unknown } | null)?.segments;
  const value: unknown = Array.isArray(segments) ? segments[0] : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const raw = value as Record<string, unknown>;
  if (raw.apiName !== apiName || raw.dataSpace !== 'default')
    throw new SegmentError('SEGMENT_IDENTITY_MISMATCH');
  return { candidate: undefined, runtime: structuredClone(raw) };
}

/**
 * Delete one exact native68 JSON-matched Segment, without replay or generated-resource cleanup.
 * Bindings establish selected source compatibility, not exhaustive external-consumer exclusion.
 * A verbatim file (a segment the plugin cannot model, such as one built in the UI) is deleted by
 * name: the GET must name the same segment in the default data space and keep a deletable status,
 * and must not change between the reads; its definition and source DMO are not compared.
 * @param {unknown} value Complete local JSON expectation, or a verbatim file; not ownership authority.
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
    // Read as retrieve writes it: the file and the GET may keep keys the plugin does not model.
    const verbatim = isVerbatimDocument(value, 'segment');
    const desired = verbatim
      ? { identity: { ...value.identity } }
      : validateSegmentDocument(value, 'retrieve');
    const admit = (): unknown =>
      verbatim ? { identity: { ...value.identity } } : validateSegmentDocument(value, 'retrieve');
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
        !isDeepStrictEqual(admit(), desired)
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
    type Observed = {
      candidate: ReturnType<typeof projectSegment>['candidate'] | undefined;
      runtime: Record<string, unknown>;
    };
    const read = async (): Promise<Observed | undefined> => {
      check();
      try {
        const raw = await client.get(
          `/services/data/v68.0/ssot/segments/${desired.identity.apiName}`,
        );
        check();
        if (verbatim) return rawSegment(raw, desired.identity.apiName);
        // Waterfall children are compared by name, as retrieve wrote them.
        const children = await segmentChildNames(connection, raw);
        check();
        return projectSegment(raw, desired.identity.apiName, 'retrieve', children);
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
    if (verbatim) {
      if (!['ACTIVE', 'PROCESSING', 'COUNTING'].includes(String(runtime.segmentStatus)))
        throw new Error('Target status');
    } else if (
      !carriesDefinition(baseline.candidate, desired as SegmentDocument) ||
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
    // A verbatim file names no source DMO the plugin can bind; the segment goes by its name.
    const bind = options.bind ?? bindSegmentDependencies;
    const document = desired as ReturnType<typeof validateSegmentDocument>;
    const bindings = verbatim
      ? []
      : await bind(document, connection, frozen, dataSpace, undefined, 'retrieve');
    check();
    if (!verbatim && (bindings.length !== 1 || runtime.segmentOnId !== bindings[0].targetId))
      throw new Error('Source identity');
    const matches = (observed: Observed): boolean =>
      isDeepStrictEqual(observed.candidate, baseline.candidate) &&
      isDeepStrictEqual(preservation(observed.runtime), preservation(runtime));
    await input();
    if (
      !verbatim &&
      !isDeepStrictEqual(
        bindings,
        await bind(document, connection, frozen, dataSpace, undefined, 'retrieve'),
      )
    )
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
