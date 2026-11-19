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
import { bindSegmentChildren, bindSegmentDependencies } from './bind-segment-dependencies.js';
import type { SegmentChildBinding, SegmentDependencyBinding } from './bind-segment-dependencies.js';
import { preflightSegmentDeploy } from './preflight-segment-deploy.js';
import { projectSegment, retrieveSegment } from './retrieve-segment.js';
import { rejectedNextAction } from './deploy-result.js';
import type { DeployExecutionResult } from './deploy-result.js';

// One read a second until the 120 s budget runs out: the time budget, not a read count, decides.
export const segmentPollBudget = Object.freeze({
  reads: 120,
  intervalMs: 1000,
  timeoutMs: 120_000,
});
export type SegmentExecutionOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  acquire?: typeof retrieveSegment;
  bind?: typeof bindSegmentDependencies;
  children?: typeof bindSegmentChildren;
  read?: (name: string) => Promise<unknown>;
  patch?: (
    document: unknown,
    schedule: boolean,
    children: ReadonlyMap<string, string>,
  ) => Promise<unknown>;
  create?: (document: unknown, children: ReadonlyMap<string, string>) => Promise<unknown>;
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
  // Waterfall children the file states are authored (compared by name via the projection).
  if (Object.hasOwn(desired.spec, 'childSegments')) delete result.includeCriteria;
  else if (Object.hasOwn(result, 'includeCriteria')) result.includeCriteria = true;
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
 * Whether a membership table is not generated yet (absent, null or empty).
 * @param {unknown} table Table name as read.
 * @returns {boolean} The table is still missing.
 */
const missingTable = (table: unknown): boolean =>
  table === undefined || table === null || table === '';

/**
 * Salesforce generates the membership DMOs of the first segment on a DMO a few seconds after
 * the create (live API 68: ~2.5 s to ~16 s for the latest table, the history table later), so a read
 * may show `segmentMembershipDmo` null or with a table still empty. Drop such a not yet
 * generated value so the read projects; any other shape stays for the projection to refuse.
 * @param {unknown} response Exact segment GET or POST response.
 * @returns {unknown} The response, without a not yet generated membership value.
 */
function withoutPendingMembership(response: unknown): unknown {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const segments = (response as Record<string, unknown>).segments;
  if (!Array.isArray(segments)) return response;
  const pending = (value: unknown): boolean => {
    if (value === null) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const tables = value as Record<string, unknown>;
    return (
      Object.keys(tables).every((key) => ['historyTable', 'latestTable'].includes(key)) &&
      ['historyTable', 'latestTable'].every(
        (key) => missingTable(tables[key]) || (typeof tables[key] === 'string' && tables[key]),
      ) &&
      ['historyTable', 'latestTable'].some((key) => missingTable(tables[key]))
    );
  };
  return {
    ...(response as Record<string, unknown>),
    segments: segments.map((segment: unknown) => {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return segment;
      const raw = segment as Record<string, unknown>;
      if (!Object.hasOwn(raw, 'segmentMembershipDmo') || !pending(raw.segmentMembershipDmo))
        return segment;
      const rest = { ...raw };
      delete rest.segmentMembershipDmo;
      return rest;
    }),
  };
}

/**
 * Validate the observed partial PATCH acknowledgement, not an independent GET snapshot.
 * Only segmentOnApiName and generated membership references may be omitted by PATCH.
 * @param {unknown} value Exact PATCH response.
 * @param {ReturnType<typeof validateSegmentDocument>} desired Admitted requested definition.
 * @param {Record<string, unknown>} baseline Private prewrite preservation snapshot.
 * @param {ReadonlyMap<string, string>} names Waterfall child definition ID to API name.
 * @returns {boolean} Whether supplied fields positively acknowledge this exact update.
 */
function acknowledgedUpdate(
  value: unknown,
  desired: ReturnType<typeof validateSegmentDocument>,
  baseline: Record<string, unknown>,
  names: ReadonlyMap<string, string>,
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
    'deploy',
    names,
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
 * @param {string} dataSpace The run's data space; the file's c__dataSpace must name it.
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
  const bindDmo = options.bind ?? bindSegmentDependencies;
  const bindChildren = options.children ?? bindSegmentChildren;
  // The DMO binding first, then each Waterfall child of the file; compared for drift as a whole.
  const bindAll = async (
    document: SegmentDocument,
  ): Promise<Array<SegmentDependencyBinding | SegmentChildBinding>> => [
    ...(await bindDmo(document, connection, apiVersion, dataSpace)),
    ...(await bindChildren(document, connection, apiVersion)),
  ];
  const now = options.now ?? Date.now;
  const delay = options.delay ?? setTimeout;
  let desired: ReturnType<typeof validateSegmentDocument>;
  let baseline: Record<string, unknown>;
  let bindings: Array<SegmentDependencyBinding | SegmentChildBinding>;
  // Waterfall child API name to its definition ID in the target, and back.
  let ids = new Map<string, string>();
  let names = new Map<string, string>();
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
      bindDmo,
      bindChildren,
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
    const children = await bindChildren(desired, connection, apiVersion);
    bindings = [...(await bindDmo(desired, connection, apiVersion, dataSpace)), ...children];
    ids = new Map(children.map((child) => [child.identity.apiName, child.targetId]));
    names = new Map(children.map((child) => [child.targetId, child.identity.apiName]));
    if (creating) {
      const fresh = await preflightSegmentDeploy(
        desired,
        connection,
        apiVersion,
        dataSpace,
        acquire,
        bindDmo,
        bindChildren,
      );
      if (fresh.outcome !== 'create')
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_DRIFT', fresh);
      await options.verifyInput();
      if (!isDeepStrictEqual(bindings, await bindAll(desired)))
        return result('blocked', 'not-attempted', 'SEGMENT_DEPENDENCY_DRIFT');
      await options.verifyInput();
      baseline = {};
    } else {
      const acquired = await acquire(
        connection,
        desired.identity.apiName,
        apiVersion,
        dataSpace,
        'deploy',
        names,
      );
      if (!acquired.candidate || !acquired.expectations || acquired.blockers.length > 0)
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_UNQUALIFIED', acquired);
      const projected = projectSegment(
        { segments: [acquired.expectations.runtime] },
        desired.identity.apiName,
        'deploy',
        names,
      );
      if (!isDeepStrictEqual(projected.candidate, validateSegmentDocument(acquired.candidate)))
        return result('blocked', 'not-attempted', 'SEGMENT_TARGET_DRIFT');
      baseline = preservation(projected.runtime, desired);
      current = projected.candidate;
      // JSON bytes and target binding must still agree after fresh exact runtime acquisition.
      await options.verifyInput();
      if (!isDeepStrictEqual(bindings, await bindAll(desired)))
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
    ((document: unknown, schedule: boolean, children: ReadonlyMap<string, string>) =>
      client.patchSegment(document, schedule, children));
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
        withoutPendingMembership({
          segments: [
            await (
              options.create ??
              ((document: unknown, children: ReadonlyMap<string, string>) =>
                client.createSegment(document, children))
            )(desired, ids),
          ],
        }),
        desired.identity.apiName,
        'deploy',
        names,
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
          ids,
        ),
        desired,
        baseline,
        names,
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
  // `membership: false` checks everything except the generated membership DMOs of a create.
  const matches = (runtime: Record<string, unknown>, membership = true): boolean => {
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
      (!membership || Object.hasOwn(runtime, 'segmentMembershipDmo')) &&
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
      const fetched = await read(desired.identity.apiName);
      const observed = projectSegment(
        creating ? withoutPendingMembership(fetched) : fetched,
        desired.identity.apiName,
        'deploy',
        names,
      );
      const readElapsed = now() - started;
      if (
        !Number.isFinite(readElapsed) ||
        readElapsed < 0 ||
        readElapsed >= segmentPollBudget.timeoutMs
      )
        return expired();
      if (creating && !responseQualified) return unknown;
      if (!carriesDefinition(observed.candidate, desired) || !matches(observed.runtime, false))
        return result('failed', 'unknown', 'SEGMENT_READBACK_MISMATCH', writeFailure);
      // Only the generated membership DMOs are still missing: read again within the budget.
      if (!matches(observed.runtime)) continue;
      if (['PROCESSING', 'COUNTING'].includes(String(observed.runtime.segmentStatus))) {
        if (!responseQualified) continue;
        if (!isDeepStrictEqual(bindings, await bindAll(desired)))
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
      const settled = await acquire(
        connection,
        desired.identity.apiName,
        apiVersion,
        dataSpace,
        'deploy',
        names,
      );
      if (
        !settled.candidate ||
        !settled.expectations ||
        settled.blockers.length > 0 ||
        settled.expectations.runtime.segmentStatus !== 'ACTIVE' ||
        !carriesDefinition(validateSegmentDocument(settled.candidate), desired) ||
        !carriesDefinition(
          projectSegment(
            { segments: [settled.expectations.runtime] },
            desired.identity.apiName,
            'deploy',
            names,
          ).candidate,
          desired,
        ) ||
        !isDeepStrictEqual(preservation(settled.expectations.runtime, desired), baseline) ||
        !isDeepStrictEqual(bindings, await bindAll(desired)) ||
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
