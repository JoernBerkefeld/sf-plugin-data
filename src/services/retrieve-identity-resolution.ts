import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import {
  IdentityResolutionError,
  identityResolutionName,
  projectNativeIdentityResolution,
  projectIdentityResolution,
} from '../artifacts/identity-resolution-document.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionProjection,
} from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';

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
  return acquireOwner(connection, apiName, apiVersion, dataSpace, '68.0');
}

/**
 * Retain the historical graph/deployment reader until their separate migration; never a native68 fallback.
 * @param {Connection} connection Existing numeric API67 connection.
 * @param {string} apiName Exact requested owner.
 * @param {ApiVersionSelection} apiVersion Fixed historical selection.
 * @param {string} dataSpace Explicit default scope.
 * @returns {Promise<IdentityResolutionAcquisition>} Historical correlated acquisition.
 */
export async function retrieveLegacyIdentityResolution(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
): Promise<IdentityResolutionAcquisition> {
  return acquireOwner(connection, apiName, apiVersion, dataSpace, '67.0');
}

/**
 * Enforce disjoint fixed reader scopes and sanitize failures.
 * @param {Connection} connection Authenticated receiver.
 * @param {string} apiName Requested name.
 * @param {ApiVersionSelection} apiVersion Exact selection.
 * @param {string} dataSpace Explicit scope.
 * @param {string} version Fixed reader version.
 * @returns {Promise<IdentityResolutionAcquisition>} Checked acquisition.
 */
async function acquireOwner(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  version: '67.0' | '68.0',
): Promise<IdentityResolutionAcquisition> {
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
    if (version === '67.0') {
      const facade = await new McpExecuteClient(connection, apiVersion).read('d360_ir_get', {
        identityResolution: apiName,
      });
      const native = await new ConnectClient(connection, '65.0').get(
        `/services/data/v65.0/ssot/identity-resolutions/${apiName}`,
      );
      return { identity, ...projectIdentityResolution(facade, native, apiName), blockers: [] };
    }
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
