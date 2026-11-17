import { setTimeout as delay } from 'node:timers/promises';
import type { BoundSsot } from '../transport/bound-ssot.js';
import { ConnectError } from '../transport/connect-client.js';
import { replaceExplanation } from './operation-diagnostic.js';

/** A plugin refusal or an unexpected Salesforce answer while reading segment members. */
export class SegmentMembersError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SegmentMembersError';
    replaceExplanation(this, message);
  }
}

/** The fields of a segment read that the member export reports or needs. */
export type SegmentSummary = {
  apiName: string;
  marketSegmentId: string;
  dataSpace: string;
  displayName?: string;
  publishStatus?: string;
  lastPublishedEndDateTime?: string;
  lastSegmentMemberCount?: number;
  membershipDmo?: string;
  segmentOn?: string;
};

/** Query parameters of the members route, sent as given; Salesforce decides. */
export type MemberQuery = {
  fields?: string;
  filters?: string;
  orderBy?: string;
  /** Rows per request (`limit`, the page size). */
  limit: number;
  /** First row to read. */
  offset: number;
};

/** One page of the members route. */
export type MemberPage = { rows: Array<Record<string, unknown>>; totalCount: number };

/** One output column of the detail rows: a field of the DMO the segment is built on. */
export type DetailColumn = { name: string; label: string };

/** Waits of the detail query; replaceable in tests. */
export const detailQueryWait = { intervalMs: 1000, timeoutMs: 10 * 60 * 1000 };

const identifier = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const membershipKey = 'membership_key_internal';
const matchCount = 'detail_match_count_internal';

/**
 * A plain value of the segment read; anything else is left out.
 * @param {unknown} value Field value.
 * @returns {string | undefined} Bounded text.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w.:+-]{1,200}$/u.test(value) ? value : undefined;
}

/**
 * An object, or undefined.
 * @param {unknown} value Candidate.
 * @returns {Record<string, unknown> | undefined} Plain object.
 */
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Encode query parameters in a stable order, leaving out the absent ones.
 * @param {Array<[string, string | number | undefined]>} entries Name and value pairs.
 * @returns {string} Query string with a leading `?`.
 */
function query(entries: Array<[string, string | number | undefined]>): string {
  return `?${entries
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join('&')}`;
}

/**
 * Read one segment of the default data space by its exact name.
 * @param {BoundSsot} sender Bound transport.
 * @param {string} version Numeric API version.
 * @param {string} apiName Exact segment name.
 * @returns {Promise<SegmentSummary | undefined>} The segment, or undefined when Salesforce answers 404 ITEM_NOT_FOUND.
 */
export async function readSegmentSummary(
  sender: BoundSsot,
  version: string,
  apiName: string,
): Promise<SegmentSummary | undefined> {
  let response: unknown;
  try {
    response = await sender.request('GET', `/services/data/v${version}/ssot/segments/${apiName}`);
  } catch (error) {
    if (
      error instanceof ConnectError &&
      error.statusCode === 404 &&
      error.nativeCode === 'ITEM_NOT_FOUND'
    )
      return undefined;
    throw error;
  }
  const segments = record(response)?.segments;
  const raw = record(Array.isArray(segments) && segments.length === 1 ? segments[0] : undefined);
  if (!raw || raw.apiName !== apiName || typeof raw.marketSegmentId !== 'string')
    throw new SegmentMembersError(
      'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
      `Salesforce answered the read of segment ${apiName} without exactly one segment of that name.`,
    );
  const membership = record(raw.segmentMembershipDmo);
  const count = raw.lastSegmentMemberCount;
  return {
    apiName,
    marketSegmentId: raw.marketSegmentId,
    dataSpace: text(raw.dataSpace) ?? 'default',
    ...(typeof raw.displayName === 'string' ? { displayName: raw.displayName } : {}),
    ...(text(raw.publishStatus) ? { publishStatus: text(raw.publishStatus) } : {}),
    ...(text(raw.lastPublishedEndDateTime)
      ? { lastPublishedEndDateTime: text(raw.lastPublishedEndDateTime) }
      : {}),
    ...(Number.isSafeInteger(count) ? { lastSegmentMemberCount: count as number } : {}),
    ...(text(membership?.latestTable) ? { membershipDmo: text(membership?.latestTable) } : {}),
    ...(text(raw.segmentOnApiName) ? { segmentOn: text(raw.segmentOnApiName) } : {}),
  };
}

/** One default-space segment of the segment list, as offered when a selection is ambiguous. */
export type SegmentCandidate = { apiName: string; marketSegmentId: string; displayName?: string };

/** Largest page of the segment list (`batchSize` 1 to 200). */
const listPageSize = 200;

/**
 * Every default-space segment of the segment list, page by page with `batchSize` and `offset`
 * until `totalSize` (or, without it, a short or empty page). Entries without an API name or ID,
 * and segments of other data spaces, are left out. A page that adds no new name ends the
 * listing (a server ignoring the offset).
 * @param {BoundSsot} sender Bound transport.
 * @param {string} version Numeric API version.
 * @returns {Promise<SegmentCandidate[]>} Segments in list order.
 */
export async function listSegmentCandidates(
  sender: BoundSsot,
  version: string,
): Promise<SegmentCandidate[]> {
  const seen = new Set<string>();
  const candidates: SegmentCandidate[] = [];
  for (let offset = 0; ;) {
    const page = record(
      await sender.request(
        'GET',
        `/services/data/v${version}/ssot/segments${query([
          ['batchSize', listPageSize],
          ['offset', offset],
        ])}`,
      ),
    );
    const entries = page?.segments;
    if (!Array.isArray(entries))
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
        `Salesforce answered the segment list at offset ${offset} without a segments list.`,
      );
    let added = 0;
    for (const entry of entries) {
      const item = record(entry);
      if (
        typeof item?.apiName !== 'string' ||
        !identifier.test(item.apiName) ||
        typeof item.marketSegmentId !== 'string' ||
        seen.has(item.apiName)
      )
        continue;
      seen.add(item.apiName);
      added++;
      if (item.dataSpace === 'default')
        candidates.push({
          apiName: item.apiName,
          marketSegmentId: item.marketSegmentId,
          ...(typeof item.displayName === 'string' ? { displayName: item.displayName } : {}),
        });
    }
    offset += entries.length;
    const total = page?.totalSize;
    const more =
      typeof total === 'number' && Number.isSafeInteger(total)
        ? offset < total
        : entries.length >= listPageSize;
    if (entries.length === 0 || !more || added === 0) return candidates;
  }
}

/**
 * One candidate as a line: display name, API name and record ID.
 * @param {SegmentCandidate} candidate Segment.
 * @returns {string} Description.
 */
export function describeCandidate(candidate: SegmentCandidate): string {
  return `"${candidate.displayName ?? candidate.apiName}" (API name ${candidate.apiName}, ID ${candidate.marketSegmentId})`;
}

/**
 * Find the segment a selection names in the default data space, like the Data Cloud UI shows it:
 * by exact API name (read directly), otherwise through the segment list by exact record ID or
 * exact display name (case matters). More than one match is passed to `choose`; without it,
 * SEGMENT_SELECTION_AMBIGUOUS lists the candidates.
 * @param {BoundSsot} sender Bound transport.
 * @param {string} version Numeric API version.
 * @param {string} selection API name, record ID or display name.
 * @param {object} [options] Hooks.
 * @param {(candidates: SegmentCandidate[]) => Promise<SegmentCandidate>} [options.choose] Picks one of several matches.
 * @param {() => void} [options.listed] Called before the segment list is read.
 * @returns {Promise<SegmentSummary | undefined>} The segment, or undefined when nothing matches.
 */
export async function resolveSegmentSelection(
  sender: BoundSsot,
  version: string,
  selection: string,
  options: {
    choose?: (candidates: SegmentCandidate[]) => Promise<SegmentCandidate>;
    listed?: () => void;
  } = {},
): Promise<SegmentSummary | undefined> {
  if (identifier.test(selection)) {
    const direct = await readSegmentSummary(sender, version, selection);
    if (direct) return direct;
  }
  options.listed?.();
  const candidates = await listSegmentCandidates(sender, version);
  const exact = candidates.find(({ apiName }) => apiName === selection);
  const matches = exact
    ? [exact]
    : candidates.filter(
        ({ marketSegmentId, displayName }) =>
          marketSegmentId === selection || displayName === selection,
      );
  if (matches.length === 0) return undefined;
  let chosen = matches[0];
  if (matches.length > 1) {
    if (!options.choose)
      throw new SegmentMembersError(
        'SEGMENT_SELECTION_AMBIGUOUS',
        [
          `"${selection}" matches ${matches.length} segments in the default data space:`,
          ...matches.map((candidate) => `- ${describeCandidate(candidate)}`),
          'Rerun with -m segment:<API name>.',
        ].join('\n'),
      );
    chosen = await options.choose(matches);
  }
  const summary = await readSegmentSummary(sender, version, chosen.apiName);
  if (summary && summary.marketSegmentId !== chosen.marketSegmentId)
    throw new SegmentMembersError(
      'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
      `Salesforce lists segment ${chosen.apiName} with ID ${chosen.marketSegmentId}, but its read answers ID ${summary.marketSegmentId}.`,
    );
  return summary;
}

/**
 * Read the members route page by page with `limit` and `offset` until `totalCount` rows are
 * read or a page is empty. The query parameters are sent as given; Salesforce decides, and
 * its error (also HTTP 400 for an offset it refuses) ends the read. A `totalCount` that
 * changes between pages (a publish finished during the read) stops it.
 * @param {BoundSsot} sender Bound transport; GETs retry after network errors, 429 and 503.
 * @param {string} version Numeric API version.
 * @param {string} apiName Exact segment name.
 * @param {MemberQuery} options Query parameters and paging.
 * @yields {MemberPage} Each page as returned.
 */
export async function* readMemberPages(
  sender: BoundSsot,
  version: string,
  apiName: string,
  options: MemberQuery,
): AsyncGenerator<MemberPage> {
  let offset = options.offset;
  let total: number | undefined;
  for (;;) {
    const response = record(
      await sender.request(
        'GET',
        `/services/data/v${version}/ssot/segments/${apiName}/members${query([
          ['fields', options.fields],
          ['filters', options.filters],
          ['orderBy', options.orderBy],
          ['limit', options.limit],
          ['offset', offset],
        ])}`,
      ),
    );
    const rows = response?.data;
    const totalCount = response?.totalCount;
    if (
      !Array.isArray(rows) ||
      !rows.every((row) => record(row)) ||
      typeof totalCount !== 'number' ||
      !Number.isSafeInteger(totalCount) ||
      totalCount < 0
    )
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
        `Salesforce answered the members read of segment ${apiName} at offset ${offset} without a data list and a totalCount.`,
      );
    if (total !== undefined && total !== totalCount)
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_CHANGED',
        `The member count of segment ${apiName} changed from ${total} to ${totalCount} during the read (a publish finished).`,
      );
    total = totalCount;
    yield { rows: rows as Array<Record<string, unknown>>, totalCount };
    offset += rows.length;
    if (rows.length === 0 || offset >= total) return;
  }
}

/**
 * A double-quoted SQL identifier (already checked as letters, digits and underscores).
 * @param {string} name Identifier.
 * @returns {string} Quoted identifier.
 */
function quote(name: string): string {
  return `"${name}"`;
}

/**
 * Parse one entity of `/ssot/metadata`.
 * @param {unknown} response Metadata answer.
 * @param {string} name Expected entity name.
 * @returns {Record<string, unknown>} The entity.
 */
function metadataEntity(response: unknown, name: string): Record<string, unknown> {
  const entities = record(response)?.metadata;
  const matches = Array.isArray(entities)
    ? entities.filter((entity) => record(entity)?.name === name)
    : [];
  if (matches.length !== 1)
    throw new SegmentMembersError(
      'SEGMENT_MEMBER_DETAILS_UNAVAILABLE',
      `Salesforce returned ${matches.length} metadata entities named ${name} instead of one.`,
    );
  return matches[0] as Record<string, unknown>;
}

/**
 * Discover the join between the latest membership DMO and the DMO the segment is built on.
 * @param {BoundSsot} sender Bound transport.
 * @param {string} version Numeric API version.
 * @param {SegmentSummary} segment Segment read.
 * @returns {Promise<{ sql: string; columns: DetailColumn[] }>} Detail SQL and its output columns.
 */
export async function discoverMemberDetails(
  sender: BoundSsot,
  version: string,
  segment: SegmentSummary,
): Promise<{ sql: string; columns: DetailColumn[] }> {
  const membership = segment.membershipDmo;
  const target = segment.segmentOn;
  if (
    !membership ||
    !target ||
    !identifier.test(membership) ||
    !identifier.test(target) ||
    !/^1sg[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(segment.marketSegmentId)
  )
    throw new SegmentMembersError(
      'SEGMENT_MEMBER_DETAILS_UNAVAILABLE',
      `Segment ${segment.apiName} names no latest membership DMO or no DMO it is built on (segmentMembershipDmo.latestTable, segmentOnApiName).`,
    );
  const read = async (name: string): Promise<Record<string, unknown>> =>
    metadataEntity(
      await sender.request(
        'GET',
        `/services/data/v${version}/ssot/metadata${query([
          ['entityType', 'DataModelObject'],
          ['entityName', name],
        ])}`,
      ),
      name,
    );
  const membershipEntity = await read(membership);
  const relationships = (
    Array.isArray(membershipEntity.relationships) ? membershipEntity.relationships : []
  )
    .map((value) => record(value))
    .filter((value) => value?.toEntity === target);
  const relationship = relationships.length === 1 ? relationships[0] : undefined;
  const from = relationship?.fromEntityAttribute ?? relationship?.fromField;
  const to = relationship?.toEntityAttribute ?? relationship?.toField;
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !identifier.test(from) ||
    !identifier.test(to)
  )
    throw new SegmentMembersError(
      'SEGMENT_MEMBER_DETAILS_UNAVAILABLE',
      `Salesforce lists ${relationships.length} relationships from ${membership} to ${target} instead of one with both field names.`,
    );
  const { fields } = await read(target);
  const columns = (Array.isArray(fields) ? fields : [])
    .map((value) => record(value))
    .filter((field) => typeof field?.name === 'string' && identifier.test(field.name))
    .map((field) => ({
      name: field!.name as string,
      label:
        typeof field!.displayName === 'string' && field!.displayName.trim()
          ? field!.displayName.trim()
          : (field!.name as string),
    }));
  if (columns.length === 0)
    throw new SegmentMembersError(
      'SEGMENT_MEMBER_DETAILS_UNAVAILABLE',
      `Salesforce lists no fields of ${target}.`,
    );
  const projections = [
    ...columns.map(({ name }) => `d.${quote(name)} AS ${quote(name)}`),
    `m.${quote(from)} AS ${quote(membershipKey)}`,
    `COUNT(d.${quote(to)}) OVER (PARTITION BY m.${quote(from)}) AS ${quote(matchCount)}`,
  ];
  const sql = [
    'SELECT * FROM (',
    `  SELECT ${projections.join(', ')}`,
    `  FROM ${quote(membership)} m`,
    `  LEFT JOIN ${quote(target)} d ON m.${quote(from)} IS NOT DISTINCT FROM d.${quote(to)}`,
    `  WHERE m."Segment_Id__c" = '${segment.marketSegmentId.slice(0, 15)}'`,
    `) bounded_members ORDER BY ${quote(membershipKey)}`,
  ].join('\n');
  return { sql, columns };
}

/**
 * The completion status of a query-sql answer (top level or nested `status`).
 * @param {Record<string, unknown> | undefined} body Answer.
 * @returns {{ queryId?: string; completion?: string; rowCount?: number }} Status fields.
 */
function queryStatus(body: Record<string, unknown> | undefined): {
  queryId?: string;
  completion?: string;
  rowCount?: number;
} {
  const status = record(body?.status) ?? body;
  const rowCount = status?.rowCount;
  return {
    ...(text(status?.queryId) ? { queryId: text(status?.queryId) } : {}),
    ...(typeof status?.completionStatus === 'string'
      ? { completion: status.completionStatus }
      : {}),
    ...(Number.isSafeInteger(rowCount) && (rowCount as number) >= 0
      ? { rowCount: rowCount as number }
      : {}),
  };
}

/**
 * Run the detail SQL through `/ssot/query-sql` (default data space), wait until it is
 * Finished, then read its rows page by page up to its row count, never past the end (an
 * offset past the end is HTTP 400). Each member must match at most one detail row.
 * @param {BoundSsot} sender Bound transport; the POST is never resent once it may have left.
 * @param {string} version Numeric API version.
 * @param {string} sql Detail SQL from discoverMemberDetails.
 * @param {number} columnCount Number of detail columns.
 * @param {number} pageSize Rows per read.
 * @param {(milliseconds: number) => Promise<void>} [pause] Wait between status reads.
 * @yields {{ rows: unknown[][]; totalCount: number }} Detail rows without the two internal columns.
 */
export async function* readDetailPages(
  sender: BoundSsot,
  version: string,
  sql: string,
  columnCount: number,
  pageSize: number,
  pause: (milliseconds: number) => Promise<void> = async (milliseconds) => delay(milliseconds),
): AsyncGenerator<{ rows: unknown[][]; totalCount: number }> {
  const base = `/services/data/v${version}/ssot/query-sql`;
  const space = query([['dataspace', 'default']]);
  let status = queryStatus(
    record(await sender.request('POST', `${base}${space}`, undefined, { sql, rowLimit: pageSize })),
  );
  const queryId = status.queryId;
  if (!queryId)
    throw new SegmentMembersError(
      'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
      'Salesforce answered the detail query without a queryId.',
    );
  let waited = 0;
  while (status.completion !== 'Finished') {
    if (status.completion && /^(?:Failed|Error|Cancel+ed)$/iu.test(status.completion))
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_READ_FAILED',
        `Salesforce reports the detail query as ${status.completion}.`,
      );
    if (waited >= detailQueryWait.timeoutMs)
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_READ_FAILED',
        `The detail query was not Finished after ${Math.round(waited / 1000)} s (completionStatus ${status.completion ?? 'not reported'}).`,
      );
    await pause(detailQueryWait.intervalMs);
    waited += detailQueryWait.intervalMs;
    status = queryStatus(record(await sender.request('GET', `${base}/${queryId}${space}`)));
  }
  const total = status.rowCount;
  if (total === undefined)
    throw new SegmentMembersError(
      'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
      'Salesforce reports the detail query Finished without a rowCount.',
    );
  const width = columnCount + 2;
  for (let offset = 0; offset < total;) {
    const body = record(
      await sender.request(
        'GET',
        `${base}/${queryId}/rows${query([
          ['dataspace', 'default'],
          ['offset', offset],
          ['rowLimit', pageSize],
        ])}`,
      ),
    );
    const rows = body?.data;
    const metadata = body?.metadata;
    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      !rows.every((row) => Array.isArray(row) && row.length === width) ||
      !Array.isArray(metadata) ||
      metadata.length !== width ||
      record(metadata[width - 2])?.name !== membershipKey ||
      record(metadata[width - 1])?.name !== matchCount
    )
      throw new SegmentMembersError(
        'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
        `Salesforce answered the detail rows at offset ${offset} of ${total} without rows of the queried columns.`,
      );
    const page: unknown[][] = [];
    for (const row of rows as unknown[][]) {
      const matches = row[width - 1];
      if (typeof matches === 'number' && matches > 1)
        throw new SegmentMembersError(
          'SEGMENT_MEMBER_DETAILS_AMBIGUOUS',
          `A segment member matched ${matches} rows of the DMO the segment is built on; expected at most one.`,
        );
      page.push(row.slice(0, columnCount));
    }
    yield { rows: page, totalCount: total };
    offset += rows.length;
  }
}
