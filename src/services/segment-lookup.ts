import type { Connection } from '@salesforce/core';
import { SegmentError } from '../artifacts/segment-document.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import { readOrgDataSpaceEntries } from './data-space-check.js';
import { explainInput, printableKey } from './operation-diagnostic.js';
import { listSegmentEntries } from './retrieve-segment.js';

/** The connection the lookup reads with: a `@salesforce/core` Connection, or its two used members. */
export type LookupConnection = Pick<Connection, 'instanceUrl' | 'request'>;

/** One segment of a data space as the segment list (API 68) names it. */
export type SegmentRow = {
  apiName: string;
  /** Record ID (`1sg…`); differs per org. */
  marketSegmentId: string;
  dataSpace: string;
  /** The DMO the segment is built on. */
  segmentOnApiName?: string;
  segmentStatus?: string;
  publishStatus?: string;
};

/** What `resolveSegment` looks for: one data space and the segment's API name or record ID. */
export type SegmentLookup =
  { dataSpace: string; apiName: string } | { dataSpace: string; marketSegmentId: string };

const segmentId = /^1sg[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u;

/**
 * A lookup refusal: a SegmentError whose message starts with what failed.
 * @param {string} code Error code.
 * @returns {SegmentError} The error, to be explained.
 */
function lookupError(code: string): SegmentError {
  const error = new SegmentError(code);
  error.message = 'Segment lookup failed.';
  return error;
}

/**
 * A looked-up name or ID as a message shows it: only letters, digits and underscores.
 * @param {string} value API name or record ID.
 * @returns {string} The value, or a placeholder.
 */
function shown(value: string): string {
  return /^[A-Za-z0-9_]{1,80}$/u.test(value) ? value : '[unprintable value]';
}

/**
 * A nonempty text value, or undefined.
 * @param {unknown} value Candidate.
 * @returns {string | undefined} The text.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Every segment of one data space, complete: one paged `GET /ssot/segments?dataspace=` read. An
 * entry the list cannot name (no API name, data space or record ID) makes the read incomplete, so
 * it fails instead of leaving the segment out.
 * @param {LookupConnection} connection Authenticated connection.
 * @param {{dataSpace: string}} options The data space (`default`, or the name of another one).
 * @param {string} options.dataSpace Data space name.
 * @returns {Promise<SegmentRow[]>} Segments in list order.
 * @throws {SegmentError} SEGMENT_ACQUISITION_FAILED when the list is not complete or not readable.
 */
export async function listSegments(
  connection: LookupConnection,
  options: { dataSpace: string },
): Promise<SegmentRow[]> {
  const warnings: string[] = [];
  const entries = await listSegmentEntries(connection, warnings, options.dataSpace, {
    queryDataSpace: true,
  });
  const incomplete = entries.find((entry) => !segmentId.test(String(entry.marketSegmentId)));
  if (warnings.length > 0 || incomplete)
    throw explainInput(
      lookupError('SEGMENT_ACQUISITION_FAILED'),
      `The segment list of the data space ${printableKey(options.dataSpace)} has an entry without ${incomplete ? `a record ID (${shown(incomplete.apiName)})` : 'an API name or data space'}, so it is not complete.`,
    );
  return entries.map((entry) => {
    const segmentOnApiName = text(entry.segmentOnApiName);
    const segmentStatus = text(entry.segmentStatus);
    const publishStatus = text(entry.publishStatus);
    return {
      apiName: entry.apiName,
      marketSegmentId: entry.marketSegmentId as string,
      dataSpace: entry.dataSpace as string,
      ...(segmentOnApiName ? { segmentOnApiName } : {}),
      ...(segmentStatus ? { segmentStatus } : {}),
      ...(publishStatus ? { publishStatus } : {}),
    };
  });
}

/**
 * Whether a row is the segment a lookup names (exact, case matters; a record ID in its 15- or
 * 18-character form).
 * @param {SegmentRow} row Listed segment.
 * @param {SegmentLookup} lookup What is looked for.
 * @returns {boolean} Match.
 */
function matches(row: SegmentRow, lookup: SegmentLookup): boolean {
  if ('apiName' in lookup) return row.apiName === lookup.apiName;
  // A record ID may come in its 15-character form (the 18-character one adds a case checksum).
  return row.marketSegmentId.slice(0, 15) === lookup.marketSegmentId.slice(0, 15);
}

/**
 * Find one segment of a data space by its API name or record ID. When the data space has none,
 * the org's other data spaces are listed: a segment found there is refused with
 * SEGMENT_OTHER_DATASPACE (a flow deploy would drop such a segment without an error), otherwise
 * SEGMENT_NOT_FOUND.
 * @param {LookupConnection} connection Authenticated connection.
 * @param {SegmentLookup} lookup Data space and API name or record ID.
 * @returns {Promise<SegmentRow>} The segment.
 * @throws {SegmentError} SEGMENT_NOT_FOUND, SEGMENT_OTHER_DATASPACE or SEGMENT_ACQUISITION_FAILED.
 */
export async function resolveSegment(
  connection: LookupConnection,
  lookup: SegmentLookup,
): Promise<SegmentRow> {
  if ('marketSegmentId' in lookup && !segmentId.test(lookup.marketSegmentId))
    throw explainInput(
      lookupError('SEGMENT_NOT_FOUND'),
      `The record ID ${shown(lookup.marketSegmentId)} is not a segment ID (1sg followed by 12 or 15 letters and digits); nothing was read.`,
    );
  const rows = await listSegments(connection, lookup);
  const found = rows.find((row) => matches(row, lookup));
  if (found) return found;
  const value = 'apiName' in lookup ? lookup.apiName : lookup.marketSegmentId;
  const what = `${'apiName' in lookup ? 'API name' : 'record ID'} ${shown(value)}`;
  const sender = openBoundSsot('', '68.0', async () => connection);
  const spaces = await readOrgDataSpaceEntries(async () => sender);
  for (const { name } of spaces) {
    if (name === lookup.dataSpace) continue;
    const other = await listSegments(connection, { dataSpace: name });
    const elsewhere = other.find((row) => matches(row, lookup));
    if (elsewhere)
      throw explainInput(
        lookupError('SEGMENT_OTHER_DATASPACE'),
        `The segment with the ${what} is in the data space ${printableKey(name)}, not in ${printableKey(lookup.dataSpace)}.`,
      );
  }
  throw explainInput(
    lookupError('SEGMENT_NOT_FOUND'),
    `No segment of the org has the ${what}; looked in the data space ${printableKey(lookup.dataSpace)} and the org's other data spaces.`,
  );
}
