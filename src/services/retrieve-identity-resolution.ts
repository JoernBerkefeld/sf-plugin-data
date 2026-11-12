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
 * @returns {Promise<IdentityResolutionAcquisition>} Candidate and private correlation expectations.
 */
export async function retrieveIdentityResolution(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
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
  try {
    const native = await new ConnectClient(connection, apiVersion).get(
      `/services/data/v68.0/ssot/identity-resolutions/${apiName}`,
    );
    return { identity, ...projectNativeIdentityResolution(native, apiName), blockers: [] };
  } catch (error: unknown) {
    return retainConnectDiagnostic(
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
  }
}
