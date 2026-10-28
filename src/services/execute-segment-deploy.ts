import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { validateSegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { preflightSegmentDeploy } from './preflight-segment-deploy.js';
import { projectSegment, retrieveSegment } from './retrieve-segment.js';
import type { DmoDeployExecution } from './execute-dmo-deploy.js';

export const segmentPollBudget = Object.freeze({ reads: 12, intervalMs: 1000, timeoutMs: 120_000 });
export type SegmentExecutionOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  acquire?: typeof retrieveSegment;
  bind?: typeof bindSegmentDependencies;
  read?: (name: string) => Promise<unknown>;
  patch?: (document: unknown) => Promise<unknown>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type SegmentDeployExecution = DmoDeployExecution & {
  family: 'segment';
  route: { apiVersion: '65.0'; method: 'PATCH'; resource: 'segments' };
};
type TargetConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'
>;

/**
 * Exclude only observed volatile audit/member/state fields from private preservation comparison.
 * @param {Record<string, unknown>} runtime Exact admitted runtime snapshot.
 * @returns {Record<string, unknown>} Detached full preservation baseline.
 */
function preservation(runtime: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(runtime);
  for (const key of [
    'displayName',
    'description',
    'segmentStatus',
    'lastModifiedBy',
    'lastModifiedDate',
    'lastSegmentMemberCount',
  ])
    delete result[key];
  for (const key of ['marketSegmentId', 'marketSegmentDefinitionId']) {
    if (typeof result[key] !== 'string' || !result[key]) throw new Error('Missing exact identity');
  }
  return result;
}

/**
 * Execute only independently present ACTIVE DBT label/description updates or zero-write equality.
 * Creation, replay, rollback and Metadata deploy jobs are deliberately unavailable.
 * @param {unknown} value Complete authored desired Segment.
 * @param {TargetConnection} connection Command-owned authenticated target.
 * @param {string | ApiVersionSelection} apiVersion Fixed explicit API65 selection.
 * @param {string} dataSpace Fixed default space.
 * @param {SegmentExecutionOptions} options Acknowledgement, pair digest verifier and bounded test seams.
 * @returns {Promise<SegmentDeployExecution>} Payload-free outcome with conservative mutation evidence.
 */
export async function executeSegmentDeploy(
  value: unknown,
  connection: TargetConnection,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  options: SegmentExecutionOptions,
): Promise<SegmentDeployExecution> {
  const result = (
    outcome: DmoDeployExecution['outcome'],
    mutation: DmoDeployExecution['mutation'],
    code?: string,
  ): SegmentDeployExecution => ({
    family: 'segment',
    route: { apiVersion: '65.0', method: 'PATCH', resource: 'segments' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message:
              mutation === 'unknown'
                ? 'Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.'
                : 'Segment deployment was not attempted. Resolve input, scope, effects or target qualification.',
          },
        ]
      : [],
  });
  const acquire = options.acquire ?? retrieveSegment;
  const bind = options.bind ?? bindSegmentDependencies;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? setTimeout;
  let desired: ReturnType<typeof validateSegmentDocument>;
  let baseline: Record<string, unknown>;
  let bindings: Awaited<ReturnType<typeof bindSegmentDependencies>>;
  try {
    desired = validateSegmentDocument(value);
    await options.verifyInput();
    const preview = await preflightSegmentDeploy(
      desired,
      connection,
      apiVersion,
      dataSpace,
      acquire,
      bind,
    );
    if (preview.outcome !== 'update' && preview.outcome !== 'unchanged')
      return {
        ...result('blocked', 'not-attempted', 'SEGMENT_TARGET_UNQUALIFIED'),
        preflight: preview,
      };
    if (preview.outcome === 'update' && options.allowProcessing !== true)
      return {
        ...result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED'),
        preflight: preview,
      };
    // Capture fresh bindings after prerequisite settlement; never trust batch-time binding IDs.
    bindings = await bind(desired, connection, apiVersion, dataSpace);
    const acquired = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
    if (!acquired.candidate || !acquired.expectations || acquired.blockers.length > 0)
      return result('blocked', 'not-attempted', 'SEGMENT_TARGET_UNQUALIFIED');
    const projected = projectSegment(
      { segments: [acquired.expectations.runtime] },
      desired.identity.apiName,
    );
    if (
      !isDeepStrictEqual(projected.candidate, validateSegmentDocument(acquired.candidate)) ||
      projected.runtime.segmentStatus !== 'ACTIVE'
    )
      return result('blocked', 'not-attempted', 'SEGMENT_TARGET_DRIFT');
    const preservedSpec = (spec: typeof desired.spec): unknown => ({
      ...spec,
      displayName: '',
      description: '',
    });
    if (!isDeepStrictEqual(preservedSpec(desired.spec), preservedSpec(projected.candidate.spec)))
      return result('blocked', 'not-attempted', 'SEGMENT_DEFINITION_UPDATE_UNQUALIFIED');
    baseline = preservation(projected.runtime);
    // Pair bytes and target binding must still agree after exact runtime/Metadata acquisition.
    await options.verifyInput();
    if (!isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace)))
      return result('blocked', 'not-attempted', 'SEGMENT_DEPENDENCY_DRIFT');
    await options.verifyInput();
    if (isDeepStrictEqual(desired, projected.candidate))
      return result('unchanged', 'not-attempted');
    if (options.allowProcessing !== true)
      return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  } catch {
    return result('blocked', 'not-attempted', 'SEGMENT_ADMISSION_FAILED');
  }
  const client = new ConnectClient(connection, apiVersion);
  const read =
    options.read ?? ((name: string) => client.get(`/services/data/v65.0/ssot/segments/${name}`));
  const patch = options.patch ?? ((document: unknown) => client.patchSegment(document));
  let responseQualified = false;
  try {
    // Exactly one attempt. An uncertain response remains unknown even after reconciliation.
    const response = projectSegment({ segments: [await patch(desired)] }, desired.identity.apiName);
    responseQualified =
      ['PROCESSING', 'ACTIVE'].includes(String(response.runtime.segmentStatus)) &&
      isDeepStrictEqual(preservation(response.runtime), baseline) &&
      isDeepStrictEqual(response.candidate, desired);
  } catch {
    // Bounded independent reads may reveal the target, but cannot authorize a replay.
  }
  const unknown = result('failed', 'unknown', 'SEGMENT_UPDATE_UNCONFIRMED');
  const started = now();
  if (!Number.isFinite(started)) return unknown;
  for (let attempt = 0; attempt < segmentPollBudget.reads; attempt++) {
    try {
      const elapsed = now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= segmentPollBudget.timeoutMs)
        return unknown;
      if (attempt > 0) await delay(segmentPollBudget.intervalMs);
      if (now() - started >= segmentPollBudget.timeoutMs) return unknown;
      const observed = projectSegment(
        await read(desired.identity.apiName),
        desired.identity.apiName,
      );
      if (!isDeepStrictEqual(preservation(observed.runtime), baseline))
        return result('failed', 'unknown', 'SEGMENT_READBACK_MISMATCH');
      if (observed.runtime.segmentStatus === 'PROCESSING') continue;
      if (observed.runtime.segmentStatus !== 'ACTIVE')
        return result('failed', 'unknown', 'SEGMENT_SETTLEMENT_UNQUALIFIED');
      // A separately acquired runtime + Metadata pair, not the PATCH echo or poll response.
      const settled = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
      if (
        !settled.candidate ||
        !settled.expectations ||
        settled.blockers.length > 0 ||
        settled.expectations.runtime.segmentStatus !== 'ACTIVE' ||
        !isDeepStrictEqual(validateSegmentDocument(settled.candidate), desired) ||
        !isDeepStrictEqual(
          projectSegment({ segments: [settled.expectations.runtime] }, desired.identity.apiName)
            .candidate,
          desired,
        ) ||
        !isDeepStrictEqual(preservation(settled.expectations.runtime), baseline) ||
        !isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace))
      )
        return result('failed', 'unknown', 'SEGMENT_READBACK_MISMATCH');
      return responseQualified ? result('updated', 'confirmed-updated') : unknown;
    } catch {
      return unknown;
    }
  }
  return unknown;
}
