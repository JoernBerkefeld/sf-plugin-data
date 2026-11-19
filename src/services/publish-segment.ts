import { setTimeout as delay } from 'node:timers/promises';
import type { Connection } from '@salesforce/core';
import { SegmentError, carriesDefinition } from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { projectSegment, segmentSpaceMismatch } from './retrieve-segment.js';
import { operationDiagnostic, replaceExplanation } from './operation-diagnostic.js';

/** Default wait for the publish result and the pause between status reads. */
export const segmentPublishWait = Object.freeze({ timeoutSeconds: 1800, intervalMs: 30_000 });

export type SegmentPublishOptions = {
  preview: boolean;
  /** Return once Salesforce accepted the publish, without reading its status afterwards. */
  async?: boolean;
  /** Seconds to wait for SUCCESS or FAILED after Salesforce accepted the publish. */
  waitTimeoutSeconds: number;
  /** The segment file of a `-d` selection: the org must hold this definition. */
  desired?: SegmentDocument;
  /** The run's data space: the segment read must name it (default: default). */
  dataSpace?: string;
  verifyInput: () => Promise<void>;
  client?: Pick<ConnectClient, 'get' | 'publishSegment'>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  progress?: (message: string) => void;
};
export type SegmentPublishResult = {
  family: 'segment';
  route: { apiVersion: '68.0'; method: 'POST'; resource: 'segments/{id}/actions/publish' };
  outcome: 'publish' | 'published' | 'publishing' | 'blocked' | 'failed';
  mutation:
    | 'not-attempted'
    | 'confirmed-published'
    | 'publish-failed'
    | 'acknowledged-processing'
    | 'rejected'
    | 'unknown';
  segment?: {
    marketSegmentId: string;
    segmentStatus?: string;
    publishStatus?: string;
    lastPublishedEndDateTime?: string;
    jobId?: string;
  };
  waitedSeconds?: number;
  diagnostics: Array<{ code: string; message: string }>;
};
type SegmentConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;
type Observed = {
  raw: Record<string, unknown>;
  marketSegmentId: string;
  segmentStatus?: string;
  publishStatus?: string;
  lastPublishedEndDateTime?: string;
};

/**
 * A plain status value of the segment read, shown in results; anything else is left out.
 * @param {unknown} value Field value.
 * @returns {string | undefined} Bounded text.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w.:+-]{1,64}$/u.test(value) ? value : undefined;
}

/**
 * Fail with a plugin-built explanation that names the next step.
 * @param {string} message Explanation built from validated identifiers and static text.
 * @returns {Error} Error carrying the explanation.
 */
function explained(message: string): Error {
  const error = new Error(message);
  replaceExplanation(error, message);
  return error;
}

/**
 * Publish one segment of the run's data space and wait for the result. The segment is read by
 * its (stored) name, which is unique in the org; a read naming another data space is refused
 * (SEGMENT_DATASPACE_MISMATCH). With a file, the org must hold the file's definition. Salesforce decides whether it can
 * publish now (also while the segment is processing or counting): one POST to
 * `/ssot/segments/{marketSegmentId}/actions/publish` without a body, never resent, then status
 * reads until `publishStatus` is SUCCESS or FAILED for this publish, or the wait ends (still
 * processing, not failed). With `async`, the command returns once Salesforce accepted the POST
 * (started, not finished) and reads nothing afterwards.
 * @param {string} apiName Exact segment name.
 * @param {SegmentConnection} connection Fixed authenticated target.
 * @param {ApiVersionSelection} selection Exact API68 selection.
 * @param {SegmentPublishOptions} options Preview, wait and input guard.
 * @returns {Promise<SegmentPublishResult>} Payload-free publication receipt.
 */
export async function publishSegment(
  apiName: string,
  connection: SegmentConnection,
  selection: ApiVersionSelection,
  options: SegmentPublishOptions,
): Promise<SegmentPublishResult> {
  let segment: SegmentPublishResult['segment'];
  let waitedSeconds: number | undefined;
  const result = (
    outcome: SegmentPublishResult['outcome'],
    mutation: SegmentPublishResult['mutation'],
    code?: string,
    message?: string,
    error?: unknown,
  ): SegmentPublishResult =>
    retainConnectDiagnostic(
      {
        family: 'segment',
        route: { apiVersion: '68.0', method: 'POST', resource: 'segments/{id}/actions/publish' },
        outcome,
        mutation,
        ...(segment ? { segment } : {}),
        ...(waitedSeconds === undefined ? {} : { waitedSeconds }),
        diagnostics: code ? [{ code, message: message ?? '' }] : [],
      },
      getConnectDiagnostic(error),
    );
  const now = options.now ?? Date.now;
  const pause = options.delay ?? (async (milliseconds: number) => delay(milliseconds));
  const client = options.client ?? new ConnectClient(connection, selection);
  const dataSpace = options.dataSpace ?? 'default';
  const read = async (): Promise<Observed | undefined> => {
    if (connection.getApiVersion() !== '68.0') throw new Error('Connection drift');
    let response: unknown;
    try {
      response = await client.get(`/services/data/v68.0/ssot/segments/${apiName}`);
    } catch (error) {
      if (
        error instanceof ConnectError &&
        error.statusCode === 404 &&
        error.nativeCode === 'ITEM_NOT_FOUND'
      )
        return undefined;
      throw error;
    }
    const segments = (response as { segments?: unknown } | null)?.segments;
    const value: unknown = Array.isArray(segments) ? segments[0] : undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw explained(`Salesforce answered the read of segment ${apiName} without a segment.`);
    const raw = value as Record<string, unknown>;
    if (
      raw.apiName !== apiName ||
      typeof raw.marketSegmentId !== 'string' ||
      !/^1sg[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(raw.marketSegmentId)
    )
      throw explained(
        `Salesforce answered the read of segment ${apiName} with another name or record ID.`,
      );
    if (raw.dataSpace !== dataSpace) throw segmentSpaceMismatch(apiName, raw.dataSpace, dataSpace);
    return {
      raw,
      marketSegmentId: raw.marketSegmentId,
      segmentStatus: text(raw.segmentStatus),
      publishStatus: text(raw.publishStatus),
      lastPublishedEndDateTime: text(raw.lastPublishedEndDateTime),
    };
  };
  const describe = (observed: Observed, jobId?: string): void => {
    segment = {
      marketSegmentId: observed.marketSegmentId,
      ...(observed.segmentStatus ? { segmentStatus: observed.segmentStatus } : {}),
      ...(observed.publishStatus ? { publishStatus: observed.publishStatus } : {}),
      ...(observed.lastPublishedEndDateTime
        ? { lastPublishedEndDateTime: observed.lastPublishedEndDateTime }
        : {}),
      ...(jobId ? { jobId } : {}),
    };
  };

  // Admission: nothing is sent until the segment is read and, with a file, matches it.
  let baseline: Observed;
  try {
    await options.verifyInput();
    const observed = await read();
    if (!observed)
      return result(
        'blocked',
        'not-attempted',
        'SEGMENT_PUBLISH_ADMISSION_FAILED',
        `Segment ${apiName} does not exist in the org (HTTP 404 ITEM_NOT_FOUND). Deploy it first with sf data360 deploy. Nothing was published.`,
      );
    baseline = observed;
    describe(baseline);
    if (options.desired) {
      let matches = false;
      try {
        matches = carriesDefinition(
          projectSegment({ segments: [baseline.raw] }, apiName, 'retrieve').candidate,
          options.desired,
        );
      } catch {
        matches = false;
      }
      if (!matches)
        return result(
          'blocked',
          'not-attempted',
          'SEGMENT_PUBLISH_DEFINITION_MISMATCH',
          `Segment ${apiName} in the org does not hold the definition of the file. Deploy the file first, or publish what the org holds with -m segment:${apiName}. Nothing was published.`,
        );
    }
    await options.verifyInput();
  } catch (error) {
    return result(
      'blocked',
      'not-attempted',
      error instanceof SegmentError ? error.code : 'SEGMENT_PUBLISH_ADMISSION_FAILED',
      operationDiagnostic(
        error,
        'The segment could not be read before the publish, so nothing was published.',
      ),
      error,
    );
  }
  if (options.preview) return result('publish', 'not-attempted');

  // One POST; Salesforce decides. A failed or unknown answer is never resent.
  let jobId: string | undefined;
  let acceptedStatus: string | undefined;
  try {
    const answer = await client.publishSegment(baseline.marketSegmentId);
    const body = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>;
    jobId = text(body.jobId);
    acceptedStatus = text(body.publishStatus);
    if (body.success === false)
      return result(
        'failed',
        'rejected',
        'SEGMENT_PUBLISH_REJECTED',
        `Salesforce answered the publish of segment ${apiName} with success: false. Nothing was resent.`,
      );
    if (body.success !== true)
      throw explained(
        `Salesforce answered the publish of segment ${apiName} without success: true, so the publish is not confirmed.`,
      );
  } catch (error) {
    const status = getConnectDiagnostic(error)?.statusCode;
    const rejected =
      error instanceof ConnectError &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 429 &&
      status !== 429;
    return result(
      'failed',
      rejected ? 'rejected' : 'unknown',
      rejected ? 'SEGMENT_PUBLISH_REJECTED' : 'SEGMENT_PUBLISH_UNCONFIRMED',
      operationDiagnostic(
        error,
        rejected
          ? 'Salesforce refused the publish; nothing was resent.'
          : 'The publish may have started. Read the segment before publishing again; nothing was resent.',
      ),
      error,
    );
  }

  // --async: the publish started; nothing is read afterwards and nothing is resent.
  if (options.async === true) {
    // The status of the read before the POST belongs to an earlier publish; report the answer's.
    describe(
      { ...baseline, publishStatus: acceptedStatus, lastPublishedEndDateTime: undefined },
      jobId,
    );
    return result(
      'publishing',
      'acknowledged-processing',
      'SEGMENT_PUBLISH_STARTED',
      `Salesforce accepted the publish of segment ${apiName}; it was started without waiting (--async) and runs on in Salesforce. It was not resent; read the segment later for the result.`,
    );
  }

  // Wait for this publish: a terminal status counts once it is new (end time changed, a
  // running status was seen, or the segment had never been published).
  const started = now();
  const deadline = started + options.waitTimeoutSeconds * 1000;
  let running = baseline.publishStatus === undefined;
  for (;;) {
    let observed: Observed | undefined;
    try {
      observed = await read();
      if (!observed) throw explained(`Segment ${apiName} read as absent after the publish.`);
    } catch (error) {
      waitedSeconds = Math.round((now() - started) / 1000);
      return result(
        'failed',
        'unknown',
        'SEGMENT_PUBLISH_UNCONFIRMED',
        operationDiagnostic(
          error,
          'Salesforce accepted the publish, but its status could not be read. Read the segment before publishing again; nothing was resent.',
        ),
        error,
      );
    }
    describe(observed, jobId);
    waitedSeconds = Math.round((now() - started) / 1000);
    const status = observed.publishStatus;
    const terminal = status === 'SUCCESS' || status === 'FAILED';
    const fresh =
      running || observed.lastPublishedEndDateTime !== baseline.lastPublishedEndDateTime;
    if (terminal && fresh)
      return status === 'SUCCESS'
        ? result('published', 'confirmed-published')
        : result(
            'failed',
            'publish-failed',
            'SEGMENT_PUBLISH_FAILED',
            `Salesforce reports publishStatus FAILED for segment ${apiName} after ${waitedSeconds} s. Check the segment in Data Cloud before publishing again.`,
          );
    if (!terminal) running = true;
    const remaining = deadline - now();
    if (remaining <= 0)
      return result(
        'publishing',
        'acknowledged-processing',
        'SEGMENT_PUBLISH_STILL_PROCESSING',
        `Salesforce accepted the publish of segment ${apiName} and is still processing it after ${waitedSeconds} s (publishStatus ${status ?? 'not reported'}). It was not resent; read the segment later for the result.`,
      );
    const wait = Math.min(segmentPublishWait.intervalMs, remaining);
    options.progress?.(
      `Segment ${apiName}: publishStatus ${status ?? 'not reported'} after ${waitedSeconds} s; next read in ${Math.ceil(wait / 1000)} s.`,
    );
    await pause(wait);
  }
}
