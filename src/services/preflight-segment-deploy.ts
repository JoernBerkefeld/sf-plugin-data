import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  isQualifiedSegmentUpdate,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import { retrieveSegment } from './retrieve-segment.js';
import { SegmentError } from '../artifacts/segment-document.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import type { DmoDeployPreview } from './preflight-dmo-deploy.js';

export type SegmentDeployPreview = DmoDeployPreview & {
  family: 'segment';
  route: { apiVersion: string; method: 'GET'; resource: 'segments' };
  requiredEffects: Array<'processing'>;
};

/**
 * Compare independently admitted Segments or native68 exact ITEM_NOT_FOUND404.
 * CREATE uses create-only POST; Metadata-only collision protection remains untested.
 * @param {unknown} value Desired bounded authored document.
 * @param {Connection} connection Command-owned authenticated target connection.
 * @param {string | ApiVersionSelection} apiVersion Explicit API65 or API68 selection.
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
                      'Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.',
                    )
                  : 'Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.',
              },
            ]
          : [],
      },
      getConnectDiagnostic(evidence),
    );
  let desired;
  try {
    desired = validateSegmentDocument(value);
  } catch {
    return result('blocked', 'unknown', 'INVALID_SOURCE');
  }
  if (
    !['65.0', '68.0'].includes(requested) ||
    dataSpace !== 'default' ||
    connection.getApiVersion() !== requested ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== requested || apiVersion.restSelector !== `v${requested}`))
  )
    return result('blocked', 'unknown', 'INVALID_SCOPE');
  try {
    // Compatibility is always required, including unchanged and explicit-only selections.
    await bind(desired, connection, apiVersion, dataSpace);
  } catch (error: unknown) {
    return result(
      'blocked',
      'unknown',
      error instanceof SegmentError ? error.code : 'SEGMENT_DEPENDENCY_UNQUALIFIED',
      error,
    );
  }
  try {
    const acquired = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
    // API68 POST is create-only (observed duplicate409), never an upsert. Runtime
    // absence does not claim Metadata-only absence; that collision remains untested.
    const diagnostic = getConnectDiagnostic(acquired);
    if (
      requested === '68.0' &&
      !acquired.candidate &&
      !acquired.expectations &&
      acquired.blockers.length === 1 &&
      acquired.blockers[0] === 'SEGMENT_ACQUISITION_FAILED' &&
      diagnostic?.statusCode === 404 &&
      diagnostic.errors?.length === 1 &&
      diagnostic.errors[0].code === 'ITEM_NOT_FOUND'
    )
      return result('create', 'absent');
    if (!acquired.candidate || acquired.blockers.length > 0 || !acquired.expectations)
      return result('blocked', 'unknown', 'SEGMENT_CREATE_AND_TARGET_UNQUALIFIED', acquired);
    const current = validateSegmentDocument(acquired.candidate);
    if (JSON.stringify(current.identity) !== JSON.stringify(desired.identity))
      return result('blocked', 'unknown', 'SEGMENT_TARGET_IDENTITY_MISMATCH');
    // ACTIVE is the only independently observed settled state for this bounded variant.
    if (acquired.expectations.runtime.segmentStatus !== 'ACTIVE')
      return result('blocked', 'present', 'SEGMENT_TARGET_NOT_SETTLED');
    if (!isQualifiedSegmentUpdate(current, desired))
      return result('blocked-changes', 'present', 'SEGMENT_DEFINITION_UPDATE_UNQUALIFIED');
    return result(
      JSON.stringify(desired) === JSON.stringify(current) ? 'unchanged' : 'update',
      'present',
    );
  } catch (error) {
    return result('blocked', 'unknown', 'SEGMENT_CREATE_AND_TARGET_UNQUALIFIED', error);
  }
}
