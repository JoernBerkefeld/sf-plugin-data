import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import {
  SegmentError,
  carriesDefinition,
  sameSegmentSchedule,
  segmentScheduleNotice,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { preflightSegmentDeploy } from './preflight-segment-deploy.js';
import { projectSegment, retrieveSegment } from './retrieve-segment.js';
import { rejectedNextAction } from './deploy-result.js';
import type { DeployExecutionResult } from './deploy-result.js';

export const segmentPollBudget = Object.freeze({ reads: 12, intervalMs: 1000, timeoutMs: 120_000 });
export type SegmentExecutionOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  acquire?: typeof retrieveSegment;
  bind?: typeof bindSegmentDependencies;
  read?: (name: string) => Promise<unknown>;
  patch?: (document: unknown, schedule: boolean) => Promise<unknown>;
  create?: (document: unknown) => Promise<unknown>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type SegmentDeployExecution = DeployExecutionResult & {
  family: 'segment';
  serverProcessing?: true;
  route: { apiVersion: string; method: 'POST' | 'PATCH'; resource: 'segments' };
};
type TargetConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'
>;

/**
 * Compare the fields the file does not set; the authored ones are compared via the projection.
 * The source DMO reference is authored (segmentOnApiName) or bound separately (segmentOnId). A
 * file with a schedule authors the schedule keys; without one they must stay as they were
 * (except the server-owned `nextScheduledDate`). With a schedule, a date the file does not state
 * stays in the baseline, so a write that resets it is a readback mismatch.
 * @param {Record<string, unknown>} runtime Exact admitted runtime snapshot.
 * @param {SegmentDocument} desired Admitted requested definition.
 * @returns {Record<string, unknown>} Detached full preservation baseline.
 */
function preservation(
  runtime: Record<string, unknown>,
  desired: SegmentDocument,
): Record<string, unknown> {
  const result = structuredClone(runtime);
  if (desired.spec.schedule === undefined) {
    const info = result.publishScheduleInfo;
    if (info && typeof info === 'object')
      delete (info as Record<string, unknown>).nextScheduledDate;
  } else {
    // The file authors the schedule details and the dates it states; a date it leaves out must
    // keep its org value (turning the schedule off clears every date).
    const schedule = desired.spec.schedule;
    const off = String(schedule.frequency).toLowerCase() === 'none';
    for (const [file, key] of [
      ['', 'publishInterval'],
      ['', 'publishScheduleInfo'],
      ['startDateTime', 'publishScheduleStartDateTime'],
      ['endDate', 'publishScheduleEndDate'],
      ['endDateTime', 'publishScheduleEndDateTime'],
    ])
      if (!file || off || Object.hasOwn(schedule, file)) delete result[key];
  }
  // Criteria content is checked by projectSegment; its presence must not silently disappear.
  if (Object.hasOwn(result, 'includeCriteria')) result.includeCriteria = true;
  for (const key of [
    'displayName',
    'description',
    'segmentStatus',
    'lastModifiedBy',
    'lastModifiedDate',
    'lastSegmentMemberCount',
    'includeDbt',
    'segmentOnApiName',
    'segmentOnId',
    // Authored (compared via the projection) or server-owned UI keys.
    'segmentType',
    'lookbackPeriod',
    'publishStatus',
    'lastPublishedEndDateTime',
  ])
    delete result[key];
  for (const key of ['marketSegmentId', 'marketSegmentDefinitionId']) {
    if (typeof result[key] !== 'string' || !result[key]) throw new Error('Missing exact identity');
  }
  return result;
}

/**
 * Validate the observed partial PATCH acknowledgement, not an independent GET snapshot.
 * Only segmentOnApiName and generated membership references may be omitted by PATCH.
 * @param {unknown} value Exact PATCH response.
 * @param {ReturnType<typeof validateSegmentDocument>} desired Admitted requested definition.
 * @param {Record<string, unknown>} baseline Private prewrite preservation snapshot.
 * @returns {boolean} Whether supplied fields positively acknowledge this exact update.
 */
function acknowledgedUpdate(
  value: unknown,
  desired: ReturnType<typeof validateSegmentDocument>,
  baseline: Record<string, unknown>,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  // Supply only the observed omitted association for local semantic validation. The
  // subsequent independent full GET must prove it; this is not GET admission.
  const response = projectSegment(
    {
      segments: [
        Object.hasOwn(raw, 'segmentOnApiName')
          ? raw
          : { ...raw, segmentOnApiName: desired.spec.segmentOn.apiName },
      ],
    },
    desired.identity.apiName,
  );
  const expected = structuredClone(baseline);
  if (!Object.hasOwn(raw, 'segmentMembershipDmo')) delete expected.segmentMembershipDmo;
  return (
    ['PROCESSING', 'ACTIVE'].includes(String(response.runtime.segmentStatus)) &&
    isDeepStrictEqual(preservation(response.runtime, desired), expected) &&
    carriesDefinition(response.candidate, desired)
  );
}

/**
 * Execute native68 create-only POST, PATCH of the authored definition, or zero-write equality.
 * The definition is sent as written and Salesforce decides; every write is single-attempt,
 * without replay or rollback.
 * @param {unknown} value Complete authored desired Segment.
 * @param {TargetConnection} connection Command-owned authenticated target.
 * @param {string | ApiVersionSelection} apiVersion API68 selection.
 * @param {string} dataSpace Fixed default space.
 * @param {SegmentExecutionOptions} options Acknowledgement, JSON digest verifier and bounded test seams.
 * @returns {Promise<SegmentDeployExecution>} Payload-free outcome with conservative mutation evidence.
 */
export async function executeSegmentDeploy(
  value: unknown,
  connection: TargetConnection,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  options: SegmentExecutionOptions,
): Promise<SegmentDeployExecution> {
  const version = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  let creating = false;
  const result = (
    outcome: DeployExecutionResult['outcome'],
    mutation: DeployExecutionResult['mutation'],
    code?: string,
    evidence?: unknown,
    cause?: string,
  ): SegmentDeployExecution =>
    retainConnectDiagnostic(
      {
        family: 'segment',
        route: { apiVersion: version, method: creating ? 'POST' : 'PATCH', resource: 'segments' },
        outcome,
        mutation,
        diagnostics: code
          ? [
              {
                code,
                message: (() => {
                  const next =
                    mutation === 'rejected'
                      ? rejectedNextAction
                      : mutation === 'unknown'
                        ? 'Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.'
                        : 'Segment deployment was not attempted. Resolve input, scope, effects or target qualification.';
                  const text = getConnectDiagnostic(evidence)
                    ? operationDiagnostic(evidence, next)
                    : next;
                  return cause ? `${cause} ${text}` : text;
                })(),
              },
            ]
          : [],
      },
      getConnectDiagnostic(evidence),
    );
  const acquire = options.acquire ?? retrieveSegment;
  const bind = options.bind ?? bindSegmentDependencies;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? setTimeout;
  let desired: ReturnType<typeof validateSegmentDocument>;
  let baseline: Record<string, unknown>;
  let bindings: Awaited<ReturnType<typeof bindSegmentDependencies>>;
  // The org segment before an update; the schedule is sent only when it differs from the file.
  let current: SegmentDocument | undefined;
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
    creating = preview.outcome === 'create';
    if (!['create', 'update', 'unchanged'].includes(preview.outcome))
      return retainConnectDiagnostic(
        {
          ...result('blocked', 'not-attempted', 'SEGMENT_TARGET_UNQUALIFIED', preview),
          preflight: preview,
        },
        getConnectDiagnostic(preview),
      );
    if (['create', 'update'].includes(preview.outcome) && options.allowProcessing !== true)
      return {
        ...result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED'),
        preflight: preview,
      };
    // Capture fresh bindings after prerequisite settlement; never trust batch-time binding IDs.
    bindings = await bind(desired, connection, apiVersion, dataSpace);
    if (creating) {
      const fresh = await preflightSegmentDeploy(
        desired,
        connection,
        apiVersion,
        dataSpace,
        acquire,
        bind,
      );
      if (fresh.outcome !== 'create')
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_DRIFT', fresh);
      await options.verifyInput();
      if (!isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace)))
        return result('blocked', 'not-attempted', 'SEGMENT_DEPENDENCY_DRIFT');
      await options.verifyInput();
      baseline = {};
    } else {
      const acquired = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
      if (!acquired.candidate || !acquired.expectations || acquired.blockers.length > 0)
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_UNQUALIFIED', acquired);
      const projected = projectSegment(
        { segments: [acquired.expectations.runtime] },
        desired.identity.apiName,
      );
      if (!isDeepStrictEqual(projected.candidate, validateSegmentDocument(acquired.candidate)))
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_DRIFT');
      baseline = preservation(projected.runtime, desired);
      current = projected.candidate;
      // JSON bytes and target binding must still agree after fresh exact runtime acquisition.
      await options.verifyInput();
      if (!isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace)))
        return result('blocked', 'not-attempted', 'SEGMENT_DEPENDENCY_DRIFT');
      await options.verifyInput();
      if (carriesDefinition(projected.candidate, desired))
        return result('unchanged', 'not-attempted');
      if (options.allowProcessing !== true)
        return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    }
  } catch (error) {
    return result('blocked', 'not-attempted', 'SEGMENT_ADMISSION_FAILED', error);
  }
  const client = new ConnectClient(connection, apiVersion);
  const read =
    options.read ??
    ((name: string) => client.get(`/services/data/v${version}/ssot/segments/${name}`));
  const patch =
    options.patch ??
    ((document: unknown, schedule: boolean) => client.patchSegment(document, schedule));
  const schedule = desired.spec.schedule;
  // A schedule the write sends makes the segment publish on it in this org.
  const notice = segmentScheduleNotice(desired, current);
  const confirmed = (): SegmentDeployExecution => {
    const done = result(
      creating ? 'created' : 'updated',
      creating ? 'confirmed-created' : 'confirmed-updated',
    );
    if (notice) done.diagnostics.push(notice);
    return done;
  };
  let responseQualified = false;
  let writeFailure: unknown;
  try {
    // Exactly one attempt. An uncertain response remains unknown even after reconciliation.
    if (creating) {
      const response = projectSegment(
        {
          segments: [
            await (options.create ?? ((document: unknown) => client.createSegment(document)))(
              desired,
            ),
          ],
        },
        desired.identity.apiName,
      );
      baseline = preservation(response.runtime, desired);
      responseQualified =
        ['PROCESSING', 'ACTIVE'].includes(String(response.runtime.segmentStatus)) &&
        carriesDefinition(response.candidate, desired);
    } else
      responseQualified = acknowledgedUpdate(
        await patch(
          desired,
          schedule !== undefined && !sameSegmentSchedule(current?.spec.schedule, schedule),
        ),
        desired,
        baseline,
      );
  } catch (error) {
    writeFailure = error;
    // Bounded independent reads may reveal the target, but cannot authorize a replay.
  }
  // A synchronous HTTP 4xx answer to the single write is Salesforce's refusal: nothing was
  // applied. A create409 is a conflict, never permission to PATCH/upsert or retry.
  const status = getConnectDiagnostic(writeFailure)?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500)
    return result(
      'failed',
      'rejected',
      creating && status === 409 ? 'SEGMENT_CREATE_CONFLICT' : 'REQUEST_FAILED',
      writeFailure,
    );
  // Other failures remain uncertain even if independent reads find the desired state.
  const unknown = result(
    'failed',
    'unknown',
    creating ? 'SEGMENT_CREATE_UNCONFIRMED' : 'SEGMENT_UPDATE_UNCONFIRMED',
    writeFailure,
  );
  const matches = (runtime: Record<string, unknown>): boolean => {
    const observed = preservation(runtime, desired);
    if (!creating)
      return (
        isDeepStrictEqual(observed, baseline) &&
        (!Object.hasOwn(runtime, 'segmentOnId') || runtime.segmentOnId === bindings[0].targetId)
      );
    // POST omits generated membership/audit fields; full GET admission stays strict.
    return (
      responseQualified &&
      Object.entries(baseline).every(([key, value]) => isDeepStrictEqual(observed[key], value)) &&
      Object.hasOwn(runtime, 'segmentMembershipDmo') &&
      runtime.segmentOnId === bindings[0].targetId
    );
  };
  // A read failing after the write (for example HTTP 404 right after a create) is retried
  // within the bound; the last one is reported when the bound ends without a confirmation.
  let readFailure: unknown;
  const unconfirmed = (error: unknown): SegmentDeployExecution => {
    const code = (error as { code?: unknown } | undefined)?.code;
    return result(
      'failed',
      'unknown',
      creating ? 'SEGMENT_CREATE_UNCONFIRMED' : 'SEGMENT_UPDATE_UNCONFIRMED',
      error,
      `The read after the ${creating ? 'create' : 'update'} failed${typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(code) ? ` with ${code}` : ''}.`,
    );
  };
  const expired = (): SegmentDeployExecution =>
    readFailure === undefined || getConnectDiagnostic(writeFailure)
      ? unknown
      : unconfirmed(readFailure);
  const started = now();
  if (!Number.isFinite(started)) return unknown;
  for (let attempt = 0; attempt < segmentPollBudget.reads; attempt++) {
    try {
      const elapsed = now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= segmentPollBudget.timeoutMs)
        return expired();
      if (attempt > 0) await delay(segmentPollBudget.intervalMs);
      if (now() - started >= segmentPollBudget.timeoutMs) return expired();
      const observed = projectSegment(
        await read(desired.identity.apiName),
        desired.identity.apiName,
      );
      const readElapsed = now() - started;
      if (
        !Number.isFinite(readElapsed) ||
        readElapsed < 0 ||
        readElapsed >= segmentPollBudget.timeoutMs
      )
        return expired();
      if (creating && !responseQualified) return unknown;
      if (!matches(observed.runtime) || !carriesDefinition(observed.candidate, desired))
        return result('failed', 'unknown', 'SEGMENT_READBACK_MISMATCH', writeFailure);
      if (['PROCESSING', 'COUNTING'].includes(String(observed.runtime.segmentStatus))) {
        if (!responseQualified) continue;
        if (!isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace)))
          return result('failed', 'unknown', 'SEGMENT_READBACK_MISMATCH');
        if (now() - started >= segmentPollBudget.timeoutMs) return unknown;
        // Confirmed configuration acceptance, not finished audience computation.
        return {
          ...confirmed(),
          serverProcessing: true,
        };
      }
      if (observed.runtime.segmentStatus !== 'ACTIVE')
        return result('failed', 'unknown', 'SEGMENT_SETTLEMENT_UNQUALIFIED', writeFailure);
      if (creating) baseline = preservation(observed.runtime, desired);
      // A separately acquired exact runtime snapshot, not the write echo or poll response.
      const settled = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
      if (
        !settled.candidate ||
        !settled.expectations ||
        settled.blockers.length > 0 ||
        settled.expectations.runtime.segmentStatus !== 'ACTIVE' ||
        !carriesDefinition(validateSegmentDocument(settled.candidate), desired) ||
        !carriesDefinition(
          projectSegment({ segments: [settled.expectations.runtime] }, desired.identity.apiName)
            .candidate,
          desired,
        ) ||
        !isDeepStrictEqual(preservation(settled.expectations.runtime, desired), baseline) ||
        !isDeepStrictEqual(bindings, await bind(desired, connection, apiVersion, dataSpace)) ||
        now() - started >= segmentPollBudget.timeoutMs
      )
        return result(
          'failed',
          'unknown',
          'SEGMENT_READBACK_MISMATCH',
          getConnectDiagnostic(writeFailure) ? writeFailure : settled,
        );
      return responseQualified ? confirmed() : unknown;
    } catch (error) {
      // A projection refusal is final; a failed read is tried again within the bound.
      if (!(error instanceof SegmentError)) {
        readFailure = error;
        continue;
      }
      return getConnectDiagnostic(writeFailure) ? unknown : unconfirmed(error);
    }
  }
  return expired();
}
