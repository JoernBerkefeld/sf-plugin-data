import type { Connection } from '@salesforce/core';
import {
  SegmentError,
  segmentName,
  segmentSqlDependencies,
  validateSegmentPair,
  validateSegmentDocument,
  validateSegmentCriteria,
} from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { retrieveSegmentMetadata } from '../transport/project-metadata.js';

export type SegmentAcquisition = {
  identity: SegmentDocument['identity'];
  candidate?: SegmentDocument;
  definitionXml?: string;
  blockers: string[];
  expectations?: { runtime: Record<string, unknown> };
};

const configuration = [
  'apiName',
  'displayName',
  'description',
  'dataSpace',
  'segmentType',
  'segmentOnApiName',
  'includeDbt',
  'publishInterval',
  'lookbackPeriod',
];
// These known observations are private only, not portable definition fields.
const observations = [
  'marketSegmentDefinitionId',
  'marketSegmentId',
  'segmentStatus',
  'lastSegmentMemberCount',
  'createdBy',
  'createdDate',
  'lastModifiedBy',
  'lastModifiedDate',
  'segmentMembershipDmo',
  'segmentOnId',
];

/**
 * Validate observed audit/generated references without exporting their org-local identities.
 * @param {Record<string, unknown>} raw Independently acquired exact DBT response.
 * @returns {void} Nothing for the bounded observed shapes.
 */
function validateObservations(raw: Record<string, unknown>): void {
  for (const key of ['createdBy', 'lastModifiedBy']) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key] as Record<string, unknown>;
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 1 ||
      typeof value.id !== 'string' ||
      !value.id
    )
      throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  }
  for (const key of ['segmentMembershipDmo']) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key] as Record<string, unknown>;
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 2 ||
      !['historyTable', 'latestTable'].every(
        (field) => typeof value[field] === 'string' && value[field],
      )
    )
      throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  }
  for (const key of ['createdDate', 'lastModifiedDate', 'segmentOnId']) {
    if (Object.hasOwn(raw, key) && (typeof raw[key] !== 'string' || !raw[key]))
      throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  }
  if (
    Object.hasOwn(raw, 'parameters') &&
    (!Array.isArray(raw.parameters) || raw.parameters.length > 0)
  )
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
}

/**
 * Admit an exact response without discarding unknown potentially meaningful fields.
 * @param {unknown} response Untrusted API65 exact GET response.
 * @param {string} apiName Requested exact identity.
 * @returns {{candidate: SegmentDocument; runtime: Record<string, unknown>}} Detached portable and private projections.
 */
export function projectSegment(
  response: unknown,
  apiName: string,
): { candidate: SegmentDocument; runtime: Record<string, unknown> } {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const wrapper = response as Record<string, unknown>;
  if (
    Object.keys(wrapper).length !== 1 ||
    !Array.isArray(wrapper.segments) ||
    wrapper.segments.length !== 1
  )
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const value = wrapper.segments[0];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const raw = value as Record<string, unknown>;
  if (raw.apiName !== apiName || raw.dataSpace !== 'default')
    throw new SegmentError('SEGMENT_IDENTITY_MISMATCH');
  if (
    Object.keys(raw).some(
      (key) => ![...configuration, ...observations, 'includeCriteria', 'parameters'].includes(key),
    ) ||
    configuration.some((key) => !Object.hasOwn(raw, key))
  )
    throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  const dbt = raw.includeDbt as Record<string, unknown>;
  if (
    !dbt ||
    typeof dbt !== 'object' ||
    Object.keys(dbt).length !== 1 ||
    !Array.isArray(dbt.models) ||
    dbt.models.length !== 1
  )
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  const model = dbt.models[0] as Record<string, unknown>;
  if (!model || typeof model.sql !== 'string')
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  const candidate = {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName },
    spec: {
      displayName: raw.displayName,
      description: raw.description,
      segmentType: raw.segmentType,
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: raw.segmentOnApiName },
      models: dbt.models,
      dependencies: segmentSqlDependencies(model.sql),
      publishInterval: raw.publishInterval,
      lookbackPeriod: raw.lookbackPeriod,
    },
  } as SegmentDocument;
  const admitted = validateSegmentDocument(candidate);
  validateObservations(raw);
  if (Object.hasOwn(raw, 'includeCriteria'))
    validateSegmentCriteria(admitted, raw.includeCriteria as string);
  return { candidate: admitted, runtime: structuredClone(raw) };
}

/**
 * Acquire one fixed API65/default DBT Segment and independently correlate standard XML.
 * A failed GET is never absence evidence; no list expansion or runtime writes are available.
 * @param {Connection} connection Authenticated command-owned API65 connection.
 * @param {string} apiName Exact selected identity.
 * @param {string | ApiVersionSelection} apiVersion Requested fixed API version.
 * @param {string} dataSpace Requested default data space.
 * @param {Function} metadata Optional isolated standard retrieve seam.
 * @returns {Promise<SegmentAcquisition>} Detached candidate only after complete pair admission.
 */
export async function retrieveSegment(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'>,
  apiName: string,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  metadata: (targetOrg: string, name: string) => Promise<string> = retrieveSegmentMetadata,
): Promise<SegmentAcquisition> {
  const version = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  if (
    version !== '65.0' ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== '65.0' || apiVersion.restSelector !== 'v65.0')) ||
    connection.getApiVersion() !== '65.0' ||
    dataSpace !== 'default' ||
    !segmentName.test(apiName)
  )
    throw new SegmentError('INVALID_SCOPE');
  const identity = { dataSpace: 'default', apiName } as const;
  try {
    const raw = await new ConnectClient(connection, '65.0').get(
      `/services/data/v65.0/ssot/segments/${apiName}`,
    );
    const projection = projectSegment(raw, apiName);
    const username = connection.getUsername();
    if (!username) throw new SegmentError('TARGET_ORG_REQUIRED');
    const definitionXml = await metadata(username, apiName);
    const candidate = validateSegmentPair(projection.candidate, definitionXml);
    return {
      identity,
      candidate,
      definitionXml,
      blockers: [],
      expectations: { runtime: projection.runtime },
    };
  } catch (error: unknown) {
    return {
      identity,
      blockers: [error instanceof SegmentError ? error.code : 'SEGMENT_ACQUISITION_FAILED'],
    };
  }
}
