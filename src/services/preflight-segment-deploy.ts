import type { Connection } from '@salesforce/core';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { validateSegmentDocument } from '../artifacts/segment-document.js';
import { retrieveSegment } from './retrieve-segment.js';
import type { DmoDeployPreview } from './preflight-dmo-deploy.js';

export type SegmentDeployPreview = DmoDeployPreview & {
  family: 'segment';
  route: { apiVersion: '65.0'; method: 'GET'; resource: 'segments' };
  requiredEffects: Array<'processing'>;
};

/**
 * Compare only independently admitted exact existing Segments; never prove absence from errors.
 * This checkpoint advises label/description updates only and exposes no executor.
 * @param {unknown} value Desired bounded authored document.
 * @param {Connection} connection Command-owned authenticated target connection.
 * @param {string | ApiVersionSelection} apiVersion Explicit API65 selection.
 * @param {string} dataSpace Explicit default target space.
 * @param {Function} acquire Independent acquisition seam for deterministic synthetic tests.
 * @returns {Promise<SegmentDeployPreview>} Read-only semantic classification and possible effects.
 */
export async function preflightSegmentDeploy(
  value: unknown,
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'>,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  acquire: typeof retrieveSegment = retrieveSegment,
): Promise<SegmentDeployPreview> {
  const result = (
    outcome: SegmentDeployPreview['outcome'],
    target: SegmentDeployPreview['target'],
    code?: string,
  ): SegmentDeployPreview => ({
    family: 'segment',
    route: { apiVersion: '65.0', method: 'GET', resource: 'segments' },
    outcome,
    target,
    absenceProof: 'none',
    requiredEffects: outcome === 'update' ? ['processing'] : [],
    diagnostics: code
      ? [
          {
            code,
            message:
              'Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.',
          },
        ]
      : [],
  });
  let desired;
  try {
    desired = validateSegmentDocument(value);
  } catch {
    return result('blocked', 'unknown', 'INVALID_SOURCE');
  }
  const requested = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  if (
    requested !== '65.0' ||
    dataSpace !== 'default' ||
    connection.getApiVersion() !== '65.0' ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== '65.0' || apiVersion.restSelector !== 'v65.0'))
  )
    return result('blocked', 'unknown', 'INVALID_SCOPE');
  try {
    const acquired = await acquire(connection, desired.identity.apiName, apiVersion, dataSpace);
    if (!acquired.candidate || acquired.blockers.length > 0 || !acquired.expectations)
      return result('blocked', 'unknown', 'SEGMENT_CREATE_AND_TARGET_UNQUALIFIED');
    const current = validateSegmentDocument(acquired.candidate);
    if (JSON.stringify(current.identity) !== JSON.stringify(desired.identity))
      return result('blocked', 'unknown', 'SEGMENT_TARGET_IDENTITY_MISMATCH');
    // ACTIVE is the only independently observed settled state for this bounded variant.
    if (acquired.expectations.runtime.segmentStatus !== 'ACTIVE')
      return result('blocked', 'present', 'SEGMENT_TARGET_NOT_SETTLED');
    const preserved = (spec: typeof desired.spec): unknown => {
      return { ...spec, displayName: '', description: '' };
    };
    if (JSON.stringify(preserved(desired.spec)) !== JSON.stringify(preserved(current.spec)))
      return result('blocked-changes', 'present', 'SEGMENT_DEFINITION_UPDATE_UNQUALIFIED');
    return result(
      desired.spec.displayName === current.spec.displayName &&
        desired.spec.description === current.spec.description
        ? 'unchanged'
        : 'update',
      'present',
    );
  } catch {
    return result('blocked', 'unknown', 'SEGMENT_CREATE_AND_TARGET_UNQUALIFIED');
  }
}
