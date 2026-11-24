import { ConnectError } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import { DataSpaceError, readOrgDataSpaceEntries } from './data-space-check.js';
import type { LookupConnection } from './segment-lookup.js';

/** One data space of the org as `listDataSpaces` returns it. */
export type DataSpaceListing = { name: string; label: string; prefix?: string };

/**
 * Every data space of the org, complete: one paged `GET /ssot/data-spaces` read (API 68). The
 * label is the name when Salesforce gives none; `prefix` is set for every space that has one
 * (all but `default`).
 * @param {LookupConnection} connection Authenticated connection.
 * @returns {Promise<DataSpaceListing[]>} Data spaces in list order.
 * @throws {DataSpaceError} DATASPACE_READ_FAILED when the list is not complete or not readable,
 * AUTHENTICATION_FAILED when Salesforce refuses the session.
 */
export async function listDataSpaces(connection: LookupConnection): Promise<DataSpaceListing[]> {
  const sender = openBoundSsot('', '68.0', async () => connection);
  try {
    return await readOrgDataSpaceEntries(async () => sender);
  } catch (error) {
    if (error instanceof ConnectError)
      throw retainConnectDiagnostic(
        new DataSpaceError(error.code, error.statusCode),
        getConnectDiagnostic(error),
      );
    throw error;
  }
}
