import type { Connection } from '@salesforce/core';
import {
  IdentityResolutionError,
  identityResolutionName,
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
 * Acquire one settled qualified owner through independent API67 facade and API65 native reads.
 * Native owner equality is not generated-DMO field/type qualification or target binding.
 * @param {Connection} connection Authenticated command-owned numeric API67 connection.
 * @param {string} apiName Exact exposed owner objectApiName, including its actual suffix.
 * @param {ApiVersionSelection} apiVersion Explicit frozen facade version selection.
 * @param {string} dataSpace Requested default data space.
 * @returns {Promise<IdentityResolutionAcquisition>} Candidate only after complete independent correlation.
 */
export async function retrieveIdentityResolution(
  connection: Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
): Promise<IdentityResolutionAcquisition> {
  if (
    apiVersion?.requested !== '67.0' ||
    apiVersion.restSelector !== 'v67.0' ||
    apiVersion.soapNumeric !== '67.0' ||
    connection.getApiVersion() !== '67.0' ||
    dataSpace !== 'default' ||
    typeof apiName !== 'string' ||
    !identityResolutionName.test(apiName)
  )
    throw new IdentityResolutionError('INVALID_SCOPE');
  const identity = { dataSpace: 'default', apiName } as const;
  try {
    const facade = await new McpExecuteClient(connection, apiVersion).read('d360_ir_get', {
      identityResolution: apiName,
    });
    // This is a separate exact native GET, not a second interpretation of the facade echo.
    const native = await new ConnectClient(connection, '65.0').get(
      `/services/data/v65.0/ssot/identity-resolutions/${apiName}`,
    );
    const projection = projectIdentityResolution(facade, native, apiName);
    return { identity, ...projection, blockers: [] };
  } catch (error: unknown) {
    return {
      identity,
      blockers: [
        error instanceof IdentityResolutionError
          ? error.code
          : 'IDENTITY_RESOLUTION_ACQUISITION_FAILED',
      ],
    };
  }
}
