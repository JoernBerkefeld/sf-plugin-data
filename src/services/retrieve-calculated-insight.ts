import type { Connection } from '@salesforce/core';
import {
  CalculatedInsightError,
  projectCalculatedInsight,
} from '../artifacts/calculated-insight-document.js';
import type { CalculatedInsightProjection } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { readCalculatedInsightMetadata } from './retrieve-other-dmo.js';

export type CalculatedInsightConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion' | 'metadata'
>;
export type CalculatedInsightAcquisition = {
  identity: { dataSpace: 'default'; apiName: string };
  candidate?: CalculatedInsightProjection['document'];
  observations?: CalculatedInsightProjection['observations'];
  expectations?: { runtime: unknown; metadata: unknown };
  blockers: string[];
};

/**
 * Require the fixed API65/default-space CI scope before any request.
 * @param {CalculatedInsightConnection} connection Existing target connection.
 * @param {ApiVersionSelection} selection Explicit numeric family route.
 * @param {string} dataSpace Exact target space.
 * @param {string} apiName Exact CI identity.
 */
export function calculatedInsightScope(
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  apiName: string,
): void {
  if (
    selection?.requested !== '65.0' ||
    selection.restSelector !== 'v65.0' ||
    selection.soapNumeric !== '65.0' ||
    connection.getApiVersion() !== '65.0' ||
    dataSpace !== 'default' ||
    !/^[A-Za-z][A-Za-z0-9_]*__cio$/u.test(apiName)
  )
    throw new CalculatedInsightError('INVALID_SCOPE');
}

/**
 * Independently acquire exact runtime and SOAP Metadata; no 404 absence inference.
 * @param {CalculatedInsightConnection} connection Existing authenticated connection.
 * @param {string} apiName Exact selected CI name.
 * @param {ApiVersionSelection} selection Explicit API65 route.
 * @param {string} dataSpace Explicit default space.
 * @returns {Promise<CalculatedInsightAcquisition>} Candidate only after full correlation.
 */
export async function retrieveCalculatedInsight(
  connection: CalculatedInsightConnection,
  apiName: string,
  selection: ApiVersionSelection,
  dataSpace: string,
): Promise<CalculatedInsightAcquisition> {
  calculatedInsightScope(connection, selection, dataSpace, apiName);
  const identity = { dataSpace: 'default' as const, apiName };
  try {
    const runtime = await new ConnectClient(connection, selection).get(
      `/services/data/v65.0/ssot/calculated-insights/${apiName}`,
    );
    const definitions = await readCalculatedInsightMetadata(connection, apiName.slice(0, -5));
    if (!Array.isArray(definitions) || definitions.length !== 1)
      throw new CalculatedInsightError('CI_METADATA_AMBIGUOUS');
    const metadata: unknown = definitions[0];
    const projection = projectCalculatedInsight(runtime, metadata);
    if (projection.document.identity.apiName !== apiName)
      throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
    return {
      identity,
      candidate: projection.document,
      observations: projection.observations,
      expectations: { runtime: structuredClone(runtime), metadata: structuredClone(metadata) },
      blockers: [],
    };
  } catch (error) {
    return {
      identity,
      blockers: [error instanceof CalculatedInsightError ? error.code : 'CI_ACQUISITION_FAILED'],
    };
  }
}
