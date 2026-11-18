import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  carriesDefinition,
  segmentScheduleNotice,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import { retrieveSegment } from './retrieve-segment.js';
import { SegmentError } from '../artifacts/segment-document.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import type { DeployPreviewResult } from './deploy-result.js';

export type SegmentDeployPreview = DeployPreviewResult & {
  family: 'segment';
  route: { apiVersion: string; method: 'GET'; resource: 'segments' };
  requiredEffects: Array<'processing'>;
};

/**
 * Classify one authored Segment against the target by its exact name at API68: exact
 * ITEM_NOT_FOUND404 is create, a readable Segment is update or unchanged. The authored
 * definition is not judged; Salesforce decides about it on the write. A schedule the write would
 * send is reported as SEGMENT_SCHEDULE_CHANGE beside create or update.
 * @param {unknown} value Desired bounded authored document.
 * @param {Connection} connection Command-owned authenticated target connection.
 * @param {string | ApiVersionSelection} apiVersion API68 selection.
 * @param {string} dataSpace Explicit default target space.
 * @param {Function} acquire Independent acquisition seam for deterministic synthetic tests.
 * @param {Function} bind Fresh independent target dependency binding; never cached across calls.
 * @returns {Promise<SegmentDeployPreview>} Read-only semantic classification and possible effects.
 */
export async function preflightSegmentDeploy(
  value: unknown,
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'>,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  acquire: typeof retrieveSegment = retrieveSegment,
  bind: typeof bindSegmentDependencies = bindSegmentDependencies,
): Promise<SegmentDeployPreview> {
  const requested = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  const result = (
    outcome: SegmentDeployPreview['outcome'],
    target: SegmentDeployPreview['target'],
    code?: string,
    evidence?: unknown,
  ): SegmentDeployPreview =>
    retainConnectDiagnostic(
      {
        family: 'segment',
        route: { apiVersion: requested, method: 'GET', resource: 'segments' },
        outcome,
        target,
        absenceProof: 'none',
        requiredEffects: ['create', 'update'].includes(outcome) ? ['processing'] : [],
        diagnostics: code
          ? [
              {
                code,
                message: getConnectDiagnostic(evidence)
                  ? operationDiagnostic(
                      evidence,
                      'Segment preview is not execution authorization. Resolve the reported cause before deployment.',
                    )
                  : 'Segment preview is not execution authorization. Resolve the reported cause before deployment.',
              },
            ]
          : [],
      },
      getConnectDiagnostic(evidence),
    );
  let desired: ReturnType<typeof validateSegmentDocument>;
  // A schedule the deploy would send makes the segment publish on it in the target org.
  const withNotice = (
    preview: SegmentDeployPreview,
    current?: ReturnType<typeof validateSegmentDocument>,
  ): SegmentDeployPreview => {
    const notice = segmentScheduleNotice(desired, current);
    if (notice) (preview.diagnostics as Array<{ code: string; message: string }>).push(notice);
    return preview;
  };
  try {
    desired = validateSegmentDocument(value);
  } catch {
    return result('blocked', 'unknown', 'INVALID_SOURCE');
  }
  if (
    requested !== '68.0' ||
    dataSpace !== 'default' ||
    connection.getApiVersion() !== requested ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== requested || apiVersion.restSelector !== `v${requested}`))
  )
    return result('blocked', 'unknown', 'INVALID_SCOPE');
  try {
    // The DMO the Segment is built on must exist; its ID binds the readback.
    await bind(desired, connection, apiVersion, dataSpace);
  } catch (error: unknown) {
    return result(
      'blocked',
      'unknown',
      error instanceof SegmentError ? error.code : 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED',
      error,
    );
  }
  try {
    const acquired = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
    // POST is create-only (observed duplicate409), never an upsert; only exact 404 is absence.
    const diagnostic = getConnectDiagnostic(acquired);
    if (
      !acquired.candidate &&
      !acquired.expectations &&
      acquired.blockers.length === 1 &&
      acquired.blockers[0] === 'SEGMENT_ACQUISITION_FAILED' &&
      diagnostic?.statusCode === 404 &&
      diagnostic.errors?.length === 1 &&
      diagnostic.errors[0].code === 'ITEM_NOT_FOUND'
    )
      return withNotice(result('create', 'absent'));
    if (!acquired.candidate || acquired.blockers.length > 0 || !acquired.expectations)
      return result(
        'blocked',
        'unknown',
        acquired.blockers[0] ?? 'SEGMENT_ACQUISITION_FAILED',
        acquired,
      );
    const current = validateSegmentDocument(acquired.candidate);
    if (JSON.stringify(current.identity) !== JSON.stringify(desired.identity))
      return result('blocked', 'unknown', 'SEGMENT_TARGET_IDENTITY_MISMATCH');
    return carriesDefinition(current, desired)
      ? result('unchanged', 'present')
      : withNotice(result('update', 'present'), current);
  } catch (error) {
    return result(
      'blocked',
      'unknown',
      error instanceof SegmentError ? error.code : 'SEGMENT_ACQUISITION_FAILED',
      error,
    );
  }
}
