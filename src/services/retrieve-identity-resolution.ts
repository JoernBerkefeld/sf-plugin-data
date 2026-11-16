import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import {
  IdentityResolutionError,
  identityResolutionName,
  projectNativeIdentityResolution,
} from '../artifacts/identity-resolution-document.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionProjection,
} from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { carryNativeResponse } from '../artifacts/verbatim-document.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';

export type IdentityResolutionAcquisition = {
  identity: IdentityResolutionDocument['identity'];
  candidate?: IdentityResolutionDocument;
  blockers: string[];
  expectations?: IdentityResolutionProjection['expectations'];
};
/**
 * Acquire one settled qualified owner through its genuine API68 native endpoint.
 * Owner projection is not generated-DMO field/type qualification or target binding.
 * @param {Connection} connection Authenticated command-owned numeric API68 connection.
 * @param {string} apiName Exact exposed owner objectApiName, including its actual suffix.
 * @param {ApiVersionSelection} apiVersion Explicit frozen native version selection.
 * @param {string} dataSpace Requested default data space.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps what the plugin does not model).
 * @returns {Promise<IdentityResolutionAcquisition>} Candidate and private correlation expectations.
 */
export async function retrieveIdentityResolution(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): Promise<IdentityResolutionAcquisition> {
  const version = '68.0';
  if (
    apiVersion?.requested !== version ||
    apiVersion.restSelector !== `v${version}` ||
    apiVersion.soapNumeric !== version ||
    connection.getApiVersion() !== version ||
    dataSpace !== 'default' ||
    typeof apiName !== 'string' ||
    !identityResolutionName.test(apiName)
  )
    throw new IdentityResolutionError('INVALID_SCOPE');
  const identity = { dataSpace: 'default', apiName } as const;
  // The raw GET response travels with the result and the candidate, for a verbatim file when
  // the owner cannot be represented.
  let read: { native: unknown } | undefined;
  try {
    const native = await new ConnectClient(connection, apiVersion).get(
      `/services/data/v68.0/ssot/identity-resolutions/${apiName}`,
    );
    read = { native };
    const projection = projectNativeIdentityResolution(native, apiName, mode);
    carryNativeResponse(projection.candidate, native);
    return carryNativeResponse({ identity, ...projection, blockers: [] }, native);
  } catch (error: unknown) {
    const result = retainConnectDiagnostic(
      {
        identity,
        blockers: [
          error instanceof IdentityResolutionError
            ? error.code
            : 'IDENTITY_RESOLUTION_ACQUISITION_FAILED',
        ],
      },
      getConnectDiagnostic(error),
    );
    return read ? carryNativeResponse(result, read.native) : result;
  }
}

/**
 * Every default-space identity resolution ruleset the API 68 list returns, by owner
 * `objectApiName`. The list has no paging (it answers every ruleset at once and ignores
 * `batchSize`, `limit` and `offset`); extra envelope keys are ignored and a malformed answer is
 * IDENTITY_RESOLUTION_ACQUISITION_FAILED. An entry without a usable name or data space is skipped
 * with a warning, a ruleset of another data space is left out and a repeated name is listed once.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated API 68 connection.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted owner names.
 */
export async function listIdentityResolutionNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  warnings?: string[],
): Promise<string[]> {
  const response = await new ConnectClient(connection, '68.0').get<unknown>(
    '/services/data/v68.0/ssot/identity-resolutions',
  );
  const entries = (response as { identityResolutions?: unknown } | undefined)?.identityResolutions;
  if (!response || typeof response !== 'object' || !Array.isArray(entries))
    throw new IdentityResolutionError('IDENTITY_RESOLUTION_ACQUISITION_FAILED');
  const names = new Set<string>();
  for (const [index, entry] of (entries as unknown[]).entries()) {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const apiName = typeof item.objectApiName === 'string' ? item.objectApiName : undefined;
    const usable = apiName !== undefined && identityResolutionName.test(apiName);
    if (!usable || typeof item.dataSpaceName !== 'string' || !item.dataSpaceName) {
      warnings?.push(
        `identity-resolution inventory: skipped ${apiName === undefined ? `the entry at position ${index}` : `"${apiName}"`} because it has no usable ${usable ? 'data space' : 'API name'}.`,
      );
      continue;
    }
    if (item.dataSpaceName === 'default') names.add(apiName);
  }
  // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array.
  return [...names].sort();
}
