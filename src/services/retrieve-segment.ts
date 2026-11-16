import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  SegmentError,
  decodeSegmentCriteria,
  segmentName,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { carryNativeResponse } from '../artifacts/verbatim-document.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
export type SegmentAcquisition = {
  identity: SegmentDocument['identity'];
  candidate?: SegmentDocument;
  blockers: string[];
  expectations?: { runtime: Record<string, unknown> };
};

const configuration = [
  'apiName',
  'displayName',
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

const uiConfiguration = [
  'apiName',
  'displayName',
  'dataSpace',
  'segmentType',
  'segmentOnApiName',
  'includeCriteria',
  'publishInterval',
  'lookbackPeriod',
];
// Server-owned keys of a UI segment GET beyond the DBT observations.
const uiObservations = ['lastPublishedEndDateTime', 'publishStatus'];

/**
 * Project a UI segment (built in the segment canvas): the GET minus server-owned keys, with
 * `includeCriteria` decoded from its HTML-entity-encoded JSON string into an object. What the
 * write cannot carry stays as-is (UNSUPPORTED_SEGMENT_VARIANT): a key the plugin does not know,
 * parameters, criteria that are not a JSON object, a schedule other than NO_REFRESH.
 * @param {Record<string, unknown>} raw The segment inside the GET response.
 * @param {string} apiName Requested exact identity.
 * @param {DocumentMode} mode `deploy` (strict observed fields) or `retrieve`.
 * @returns {{candidate: SegmentDocument; runtime: Record<string, unknown>}} Detached portable and private projections.
 */
function projectUiSegment(
  raw: Record<string, unknown>,
  apiName: string,
  mode: DocumentMode,
): { candidate: SegmentDocument; runtime: Record<string, unknown> } {
  const known = new Set([
    ...uiConfiguration,
    ...observations,
    ...uiObservations,
    'description',
    'parameters',
  ]);
  if (
    uiConfiguration.some((key) => !Object.hasOwn(raw, key)) ||
    Object.keys(raw).some((key) => !known.has(key)) ||
    (Object.hasOwn(raw, 'parameters') && !isDeepStrictEqual(raw.parameters, [])) ||
    typeof raw.includeCriteria !== 'string'
  )
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  let criteria: unknown;
  try {
    criteria = JSON.parse(decodeSegmentCriteria(raw.includeCriteria));
  } catch {
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  }
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria))
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  const candidate = validateSegmentDocument(
    {
      schemaVersion: 1,
      kind: 'segment',
      identity: { dataSpace: 'default', apiName },
      spec: {
        displayName: raw.displayName,
        // Salesforce leaves description out of the GET when it is empty.
        description: Object.hasOwn(raw, 'description') ? raw.description : '',
        segmentType: 'UI',
        segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: raw.segmentOnApiName },
        includeCriteria: criteria,
        publishInterval: raw.publishInterval,
        lookbackPeriod: raw.lookbackPeriod,
      },
    },
    mode,
  );
  if (mode !== 'retrieve') validateObservations(raw);
  return { candidate, runtime: structuredClone(raw) };
}

/**
 * Admit an exact response without discarding unknown potentially meaningful fields. Retrieve mode
 * reads `segments[0]` of any wrapper, keeps keys the plugin does not know in `spec` (and extra
 * `includeDbt` keys in `spec.includeDbt`), does not check the observed fields, and refuses only
 * what the file cannot represent (no DBT configuration, parameters, another type, refresh,
 * lookback or source kind, a model name unfit for a file), so the segment is written verbatim.
 * @param {unknown} response Untrusted API68 exact GET response.
 * @param {string} apiName Requested exact identity.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {{candidate: SegmentDocument; runtime: Record<string, unknown>}} Detached portable and private projections.
 */
export function projectSegment(
  response: unknown,
  apiName: string,
  mode: DocumentMode = 'deploy',
): { candidate: SegmentDocument; runtime: Record<string, unknown> } {
  const lenient = mode === 'retrieve';
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const wrapper = response as Record<string, unknown>;
  if (
    !Array.isArray(wrapper.segments) ||
    wrapper.segments.length === 0 ||
    (!lenient && (Object.keys(wrapper).length !== 1 || wrapper.segments.length !== 1))
  )
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const value: unknown = wrapper.segments[0];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SegmentError('INVALID_SEGMENT_RESPONSE');
  const raw = value as Record<string, unknown>;
  if (raw.apiName !== apiName || raw.dataSpace !== 'default')
    throw new SegmentError('SEGMENT_IDENTITY_MISMATCH');
  if (raw.segmentType === 'UI') return projectUiSegment(raw, apiName, mode);
  const known = new Set([
    ...configuration,
    ...observations,
    'description',
    'includeCriteria',
    'parameters',
  ]);
  const unknown = Object.keys(raw).filter((key) => !known.has(key));
  // Without its configuration the segment is not a DBT segment the file can hold.
  if (configuration.some((key) => !Object.hasOwn(raw, key)))
    throw new SegmentError(
      lenient ? 'UNSUPPORTED_SEGMENT_VARIANT' : 'UNKNOWN_SEGMENT_CONFIGURATION',
    );
  if (!lenient && unknown.length > 0) throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  // An unknown key named like a spec key could not be told apart from it.
  if (unknown.some((key) => ['segmentOn', 'models', 'includeDbt'].includes(key)))
    throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  const dbt = raw.includeDbt as Record<string, unknown>;
  if (
    !dbt ||
    typeof dbt !== 'object' ||
    Array.isArray(dbt) ||
    (!lenient && Object.keys(dbt).length !== 1) ||
    !Array.isArray(dbt.models)
  )
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  if (lenient && Object.hasOwn(raw, 'parameters') && !isDeepStrictEqual(raw.parameters, []))
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  const { models, ...dbtExtra } = dbt;
  const candidate = {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName },
    spec: {
      displayName: raw.displayName,
      // Salesforce leaves description out of the GET when it is empty.
      description: Object.hasOwn(raw, 'description') ? raw.description : '',
      segmentType: raw.segmentType,
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: raw.segmentOnApiName },
      models,
      publishInterval: raw.publishInterval,
      lookbackPeriod: raw.lookbackPeriod,
      ...(Object.keys(dbtExtra).length > 0 ? { includeDbt: dbtExtra } : {}),
      ...Object.fromEntries(unknown.map((key) => [key, raw[key]])),
    },
  } as SegmentDocument;
  const admitted = validateSegmentDocument(candidate, mode);
  if (!lenient) validateObservations(raw);
  // includeCriteria is Salesforce's own rendering of includeDbt; the file keeps includeDbt.
  return { candidate: admitted, runtime: structuredClone(raw) };
}

/**
 * Acquire one API68/default DBT Segment by its exact name.
 * A failed GET is never absence evidence; no list expansion or runtime writes are available.
 * @param {Connection} connection Authenticated command-owned API68 connection.
 * @param {string} apiName Exact selected identity.
 * @param {string | ApiVersionSelection} apiVersion Requested fixed API version.
 * @param {string} dataSpace Requested default data space.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps what the plugin does not model).
 * @returns {Promise<SegmentAcquisition>} Detached portable candidate and private runtime baseline.
 */
export async function retrieveSegment(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'>,
  apiName: string,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): Promise<SegmentAcquisition> {
  const version = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  if (
    version !== '68.0' ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== version || apiVersion.restSelector !== `v${version}`)) ||
    connection.getApiVersion() !== version ||
    dataSpace !== 'default' ||
    !segmentName.test(apiName)
  )
    throw new SegmentError('INVALID_SCOPE');
  const identity = { dataSpace: 'default', apiName } as const;
  // The raw GET response travels with the result and the candidate, for a verbatim file when
  // the segment cannot be represented.
  let read: { native: unknown } | undefined;
  try {
    const raw = await new ConnectClient(connection, version).get(
      `/services/data/v${version}/ssot/segments/${apiName}`,
    );
    read = { native: raw };
    const projection = projectSegment(raw, apiName, mode);
    return carryNativeResponse(
      {
        identity,
        candidate: carryNativeResponse(projection.candidate, raw),
        blockers: [],
        expectations: { runtime: projection.runtime },
      },
      raw,
    );
  } catch (error: unknown) {
    const result = retainConnectDiagnostic(
      {
        identity,
        blockers: [error instanceof SegmentError ? error.code : 'SEGMENT_ACQUISITION_FAILED'],
      },
      getConnectDiagnostic(error),
    );
    return read ? carryNativeResponse(result, read.native) : result;
  }
}
