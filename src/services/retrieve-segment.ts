import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  SegmentError,
  decodeSegmentCriteria,
  opaqueSegmentSchedule,
  segmentName,
  unnamedChildSegment,
  validateSegmentDocument,
  waterfallChildIds,
  waterfallSegmentType,
} from '../artifacts/segment-document.js';
import type { SegmentDocument, SegmentSchedule } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { carryNativeResponse } from '../artifacts/verbatim-document.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
import { isDataSpaceName } from '../artifacts/data-space-field.js';
import { explainInput, explanationOf } from './operation-diagnostic.js';
export type SegmentAcquisition = {
  /** The reported identity: the requested name in the run's data space. */
  identity: { dataSpace: string; apiName: string };
  candidate?: SegmentDocument;
  blockers: string[];
  expectations?: { runtime: Record<string, unknown> };
  /** The plugin-built explanation of the first blocker, when it has one. */
  explanation?: string;
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

// The schedule keys of a segment GET: none for a segment that does not refresh.
const scheduleRead = [
  'publishScheduleInfo',
  'publishScheduleStartDateTime',
  'publishScheduleEndDate',
  'publishScheduleEndDateTime',
];
const scheduleInfoKeys = new Set([
  'daysOfWeek',
  'frequency',
  'interval',
  'nextScheduledDate',
  'timeInfo',
]);

/**
 * Whether a read value is set (neither absent nor null).
 * @param {unknown} value Read value.
 * @returns {boolean} Set.
 */
const present = (value: unknown): boolean => value !== undefined && value !== null;

/**
 * Project the schedule of a segment GET onto the write shape of the file (live API 68,
 * 2026-11-18): `publishScheduleInfo` gives `frequency`, `interval`, `daysOfWeek` (read as a plain
 * list; an empty one is left out) and `time` (from `timeInfo`, which Salesforce reads back as
 * null); `publishScheduleStartDateTime`, `publishScheduleEndDate` and
 * `publishScheduleEndDateTime` give `startDateTime`, `endDate` and `endDateTime`;
 * `nextScheduledDate` is left out, and so is `publishInterval` beside `publishScheduleInfo`.
 * Without `publishScheduleInfo`, a refresh other than NO_REFRESH (an hourly interval) keeps its
 * `publishInterval`. A segment with NO_REFRESH and no dates has no schedule, so retrieve leaves
 * the key out. Schedule details the plugin does not know (another `publishScheduleInfo` key, a
 * `frequency` that is not text, `daysOfWeek` that is not a list) are UNSUPPORTED_SEGMENT_VARIANT
 * on retrieve; a deploy-mode read gives `opaqueSegmentSchedule`, so a file without `schedule`
 * still deploys and keeps the org schedule.
 * @param {Record<string, unknown>} raw The segment inside the GET response.
 * @param {DocumentMode} [mode] `deploy` (target reads) or `retrieve`.
 * @returns {SegmentSchedule | undefined} Projected schedule, or undefined for none.
 */
export function projectSegmentSchedule(
  raw: Record<string, unknown>,
  mode: DocumentMode = 'deploy',
): SegmentSchedule | undefined {
  const info = raw.publishScheduleInfo;
  const dates = {
    ...(present(raw.publishScheduleStartDateTime)
      ? { startDateTime: raw.publishScheduleStartDateTime }
      : {}),
    ...(present(raw.publishScheduleEndDate) ? { endDate: raw.publishScheduleEndDate } : {}),
    ...(present(raw.publishScheduleEndDateTime)
      ? { endDateTime: raw.publishScheduleEndDateTime }
      : {}),
  };
  const unknown = (): SegmentSchedule => {
    if (mode === 'retrieve') throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
    return { ...opaqueSegmentSchedule };
  };
  if (!present(info)) {
    if (raw.publishInterval === 'NO_REFRESH' && Object.keys(dates).length === 0) return undefined;
    if (typeof raw.publishInterval !== 'string') return unknown();
    return { publishInterval: raw.publishInterval, ...dates };
  }
  const read = info as Record<string, unknown>;
  if (
    typeof info !== 'object' ||
    Array.isArray(info) ||
    Object.keys(read).some((key) => !scheduleInfoKeys.has(key)) ||
    typeof read.frequency !== 'string' ||
    (present(read.daysOfWeek) && !Array.isArray(read.daysOfWeek))
  )
    return unknown();
  const days = read.daysOfWeek as unknown[] | null | undefined;
  return {
    frequency: read.frequency,
    ...(present(read.interval) ? { interval: read.interval } : {}),
    ...(days && days.length > 0 ? { daysOfWeek: structuredClone(days) } : {}),
    ...dates,
    ...(present(read.timeInfo) ? { time: structuredClone(read.timeInfo) } : {}),
  };
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
const uiObservations = ['lastPublishedEndDateTime', 'publishStatus', 'segmentMembershipTable'];
// What a GET of another type (Waterfall, Dynamic, ...) must hold.
const otherConfiguration = [
  'apiName',
  'displayName',
  'dataSpace',
  'segmentType',
  'segmentOnApiName',
  'publishInterval',
];

/**
 * Project a segment of a type other than DBT (UI and the other types) onto the file: the GET
 * minus server-owned keys, with the schedule projected by `projectSegmentSchedule`. A UI
 * segment's `includeCriteria` is decoded from its HTML-entity-encoded JSON string into an object;
 * another type keeps its lookback when it has one. Retrieve keeps keys the plugin does not know in
 * `spec`; deploy refuses them (UNKNOWN_SEGMENT_CONFIGURATION). Criteria that are not a JSON
 * object, and parameters (no write takes them), are UNSUPPORTED_SEGMENT_VARIANT. A Waterfall's
 * criteria holding only its child segments become `childSegments`, each child named through
 * `children` (definition ID to API name); a child it cannot name keeps the criteria as read on
 * retrieve (deploy refuses that file) and is `unnamedChildSegment` on a deploy-mode read.
 * @param {Record<string, unknown>} raw The segment inside the GET response.
 * @param {string} apiName Requested exact identity.
 * @param {DocumentMode} mode `deploy` (strict observed fields) or `retrieve`.
 * @param {ReadonlyMap<string, string>} children Child definition ID to segment API name.
 * @returns {{candidate: SegmentDocument; runtime: Record<string, unknown>}} Detached portable and private projections.
 */
function projectTypedSegment(
  raw: Record<string, unknown>,
  apiName: string,
  mode: DocumentMode,
  children: ReadonlyMap<string, string>,
): { candidate: SegmentDocument; runtime: Record<string, unknown> } {
  const ui = raw.segmentType === 'UI';
  const required = ui ? uiConfiguration : otherConfiguration;
  const childIds =
    raw.segmentType === waterfallSegmentType && typeof raw.includeCriteria === 'string'
      ? waterfallChildIds(decodeSegmentCriteria(raw.includeCriteria))
      : undefined;
  const named = childIds?.map((id) => children.get(id));
  const childSegments =
    named && (mode !== 'retrieve' || named.every((name) => name !== undefined))
      ? named.map((name) => name ?? unnamedChildSegment)
      : undefined;
  const known = new Set([
    ...(childSegments ? ['includeCriteria'] : []),
    ...required,
    ...observations,
    ...uiObservations,
    ...scheduleRead,
    'lookbackPeriod',
    'description',
    'parameters',
  ]);
  const unknown = Object.keys(raw).filter((key) => !known.has(key));
  if (required.some((key) => !Object.hasOwn(raw, key)))
    throw new SegmentError(
      mode === 'retrieve' ? 'UNSUPPORTED_SEGMENT_VARIANT' : 'UNKNOWN_SEGMENT_CONFIGURATION',
    );
  if (mode !== 'retrieve' && unknown.length > 0)
    throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  // An unknown key named like a spec key could not be told apart from it.
  if (unknown.some((key) => ['segmentOn', 'models', 'includeDbt', 'schedule'].includes(key)))
    throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  if (Object.hasOwn(raw, 'parameters') && !isDeepStrictEqual(raw.parameters, []))
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  let criteria: unknown;
  if (ui) {
    if (typeof raw.includeCriteria !== 'string')
      throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
    try {
      criteria = JSON.parse(decodeSegmentCriteria(raw.includeCriteria));
    } catch {
      throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
    }
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria))
      throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  }
  const schedule = projectSegmentSchedule(raw, mode);
  const candidate = validateSegmentDocument(
    {
      schemaVersion: 1,
      kind: 'segment',
      c__dataSpace: raw.dataSpace,
      identity: { apiName },
      spec: {
        displayName: raw.displayName,
        // Salesforce leaves description out of the GET when it is empty.
        description: Object.hasOwn(raw, 'description') ? raw.description : '',
        segmentType: raw.segmentType,
        segmentOn: { kind: 'dmo', apiName: raw.segmentOnApiName },
        ...(ui ? { includeCriteria: criteria } : {}),
        ...(Object.hasOwn(raw, 'lookbackPeriod') ? { lookbackPeriod: raw.lookbackPeriod } : {}),
        ...(schedule ? { schedule } : {}),
        ...(childSegments ? { childSegments } : {}),
        ...Object.fromEntries(unknown.map((key) => [key, raw[key]])),
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
 * what the file cannot represent (no DBT configuration, parameters, a schedule the file cannot
 * hold, another source kind, a model name unfit for a file), so the segment is written verbatim.
 * Segments of other types than DBT are projected by `projectTypedSegment`.
 * @param {unknown} response Untrusted API68 exact GET response.
 * @param {string} apiName Requested exact identity.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @param {ReadonlyMap<string, string>} [children] Waterfall child definition ID to API name.
 * @returns {{candidate: SegmentDocument; runtime: Record<string, unknown>}} Detached portable and private projections.
 */
export function projectSegment(
  response: unknown,
  apiName: string,
  mode: DocumentMode = 'deploy',
  children: ReadonlyMap<string, string> = new Map(),
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
  // The data space is the segment's own (its name is unique in the org); a caller that requested
  // one compares it.
  if (raw.apiName !== apiName || !isDataSpaceName(raw.dataSpace))
    throw new SegmentError('SEGMENT_IDENTITY_MISMATCH');
  if (raw.segmentType !== 'DBT') return projectTypedSegment(raw, apiName, mode, children);
  const known = new Set([
    ...configuration,
    ...observations,
    ...scheduleRead,
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
  if (unknown.some((key) => ['segmentOn', 'models', 'includeDbt', 'schedule'].includes(key)))
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
  const schedule = projectSegmentSchedule(raw, mode);
  const { models, ...dbtExtra } = dbt;
  const candidate = {
    schemaVersion: 1,
    kind: 'segment',
    c__dataSpace: raw.dataSpace,
    identity: { apiName },
    spec: {
      displayName: raw.displayName,
      // Salesforce leaves description out of the GET when it is empty.
      description: Object.hasOwn(raw, 'description') ? raw.description : '',
      segmentType: raw.segmentType,
      segmentOn: { kind: 'dmo', apiName: raw.segmentOnApiName },
      models,
      lookbackPeriod: raw.lookbackPeriod,
      ...(schedule ? { schedule } : {}),
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
 * The refusal of a segment that the org holds in another data space than the run's. Its name is
 * unique in the org (Salesforce stores a non-default segment as `<prefix>_<Name>`), so a read by
 * name finds it wherever it is.
 * @param {string} apiName Segment name.
 * @param {unknown} found The data space the org names for it.
 * @param {string} dataSpace The run's data space.
 * @returns {SegmentError} SEGMENT_DATASPACE_MISMATCH with an explanation.
 */
export function segmentSpaceMismatch(
  apiName: string,
  found: unknown,
  dataSpace: string,
): SegmentError {
  return explainInput(
    new SegmentError('SEGMENT_DATASPACE_MISMATCH'),
    `Segment ${apiName} is in the data space ${isDataSpaceName(found) ? found : '(none named)'}, but the run's data space is ${dataSpace}. Run the command with --dataspace ${isDataSpaceName(found) ? found : '<its data space>'}.`,
  );
}

/**
 * Acquire one API68 Segment of the run's data space by its exact (stored) name; the GET needs no
 * data space (live API 68: the stored name is unique in the org), and a segment of another data
 * space is SEGMENT_DATASPACE_MISMATCH.
 * A failed GET is never absence evidence; no runtime writes are available. A retrieve of a
 * Waterfall with child segments, without `children`, names them with one segment list read
 * (their definition IDs are org-specific); when that read fails the criteria stay as read.
 * @param {Connection} connection Authenticated command-owned API68 connection.
 * @param {string} apiName Exact selected identity.
 * @param {string | ApiVersionSelection} apiVersion Requested fixed API version.
 * @param {string} dataSpace The run's data space.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps what the plugin does not model).
 * @param {ReadonlyMap<string, string>} [children] Waterfall child definition ID to API name.
 * @returns {Promise<SegmentAcquisition>} Detached portable candidate and private runtime baseline.
 */
export async function retrieveSegment(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion' | 'getUsername'>,
  apiName: string,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
  children?: ReadonlyMap<string, string>,
): Promise<SegmentAcquisition> {
  const version = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  if (
    version !== '68.0' ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.soapNumeric !== version || apiVersion.restSelector !== `v${version}`)) ||
    connection.getApiVersion() !== version ||
    !isDataSpaceName(dataSpace) ||
    !segmentName.test(apiName)
  )
    throw new SegmentError('INVALID_SCOPE');
  const identity = { dataSpace, apiName };
  // The raw GET response travels with the result and the candidate, for a verbatim file when
  // the segment cannot be represented.
  let read: { native: unknown } | undefined;
  try {
    const raw = await new ConnectClient(connection, version).get(
      `/services/data/v${version}/ssot/segments/${apiName}`,
    );
    read = { native: raw };
    const found = (
      (raw as { segments?: unknown[] } | undefined)?.segments?.[0] as
        { apiName?: unknown; dataSpace?: unknown } | undefined
    )?.dataSpace;
    if ((raw as { segments?: unknown[] } | undefined)?.segments?.length && found !== dataSpace)
      throw segmentSpaceMismatch(apiName, found, dataSpace);
    const projection = projectSegment(
      raw,
      apiName,
      mode,
      children ?? (mode === 'retrieve' ? await segmentChildNames(connection, raw) : undefined),
    );
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
    // A data space refusal keeps its explanation for the item.
    const explanation = explanationOf(error);
    if (error instanceof SegmentError && explanation !== undefined)
      (result as SegmentAcquisition).explanation = explanation;
    return read ? carryNativeResponse(result, read.native) : result;
  }
}

// One definition-ID-to-name map per command connection (one list read per run).
const childNameCache = new WeakMap<object, Promise<ReadonlyMap<string, string> | undefined>>();

/**
 * Name the child segments of a Waterfall read in retrieve mode (retrieve and delete): one
 * segment list read per connection maps each definition ID to its API name. Nothing is read for
 * another segment type or a Waterfall without children; a failed list read names nothing.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated API 68 connection.
 * @param {unknown} response Segment GET response.
 * @returns {Promise<ReadonlyMap<string, string> | undefined>} Definition ID to API name.
 */
export async function segmentChildNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  response: unknown,
): Promise<ReadonlyMap<string, string> | undefined> {
  const raw = (response as { segments?: unknown[] } | undefined)?.segments?.[0] as
    Record<string, unknown> | undefined;
  if (
    raw?.segmentType !== waterfallSegmentType ||
    typeof raw.includeCriteria !== 'string' ||
    !waterfallChildIds(decodeSegmentCriteria(raw.includeCriteria))
  )
    return undefined;
  let names = childNameCache.get(connection);
  if (!names) {
    names = (async (): Promise<ReadonlyMap<string, string> | undefined> => {
      try {
        const map = new Map<string, string>();
        for (const entry of await listSegmentEntries(connection))
          if (typeof entry.marketSegmentDefinitionId === 'string')
            map.set(entry.marketSegmentDefinitionId, entry.apiName);
        return map;
      } catch {
        return undefined;
      }
    })();
    childNameCache.set(connection, names);
  }
  return names;
}

/** Largest page the segment list accepts (`batchSize` 1 to 200). */
const segmentPageSize = 200;

/**
 * Every segment of the run's data space the API 68 list returns, following its
 * `batchSize`/`offset` paging until `totalSize` (or, without it, until a short or empty page).
 * The list is filtered by each entry's own `dataSpace`, never by a query parameter. Extra envelope
 * keys are ignored; a malformed page stops the listing (SEGMENT_ACQUISITION_FAILED). An entry
 * without a usable API name or data space is skipped with a warning, a segment of another data
 * space is left out and a repeated name is listed once. A page that adds no new name ends the
 * listing (a server ignoring the offset).
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated API 68 connection.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @param {string} [dataSpace] The run's data space.
 * @returns {Promise<string[]>} Sorted API names.
 */
export async function listSegmentNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  warnings?: string[],
  dataSpace = 'default',
): Promise<string[]> {
  const entries = await listSegmentEntries(connection, warnings, dataSpace);
  const names = entries.map((entry) => entry.apiName);
  names.sort();
  return names;
}

/**
 * The entries of the segment list in one data space (or, without one, in every data space), as
 * `listSegmentNames` pages and filters them, in list order.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated API 68 connection.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @param {string} [dataSpace] Data space to keep; undefined keeps every one.
 * @returns {Promise<Array<Record<string, unknown> & {apiName: string}>>} Listed segments.
 */
async function listSegmentEntries(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  warnings?: string[],
  dataSpace?: string,
): Promise<Array<Record<string, unknown> & { apiName: string }>> {
  const client = new ConnectClient(connection, '68.0');
  const seen = new Set<string>();
  const names: Array<Record<string, unknown> & { apiName: string }> = [];
  for (let offset = 0; ;) {
    const page = await client.get<unknown>(
      `/services/data/v68.0/ssot/segments?batchSize=${segmentPageSize}&offset=${offset}`,
    );
    const entries = (page as { segments?: unknown } | undefined)?.segments;
    if (!page || typeof page !== 'object' || !Array.isArray(entries))
      throw new SegmentError('SEGMENT_ACQUISITION_FAILED');
    let named = 0;
    let added = 0;
    for (const [index, entry] of (entries as unknown[]).entries()) {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const apiName = typeof item.apiName === 'string' ? item.apiName : undefined;
      const usable = apiName !== undefined && segmentName.test(apiName);
      if (!usable || typeof item.dataSpace !== 'string' || !item.dataSpace) {
        warnings?.push(
          `segment inventory: skipped ${apiName === undefined ? `the entry at position ${offset + index}` : `"${apiName}"`} because it has no usable ${usable ? 'data space' : 'API name'}.`,
        );
        continue;
      }
      named++;
      if (seen.has(apiName)) continue;
      seen.add(apiName);
      added++;
      if (dataSpace === undefined || item.dataSpace === dataSpace) names.push({ ...item, apiName });
    }
    offset += entries.length;
    const total = (page as { totalSize?: unknown }).totalSize;
    const more =
      typeof total === 'number' && Number.isSafeInteger(total)
        ? offset < total
        : entries.length >= segmentPageSize;
    // A page of names listed already means the server ignores the offset.
    if (entries.length === 0 || !more || (named > 0 && added === 0)) return names;
  }
}
