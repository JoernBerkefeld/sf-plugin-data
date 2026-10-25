import type { Connection } from '@salesforce/core';
import {
  buildOtherDmoCreateRequest,
  DmoDocumentError,
  projectDmoConnectMetadata,
} from '../artifacts/dmo-document.js';
import type { DmoConnectMetadataProjection } from '../artifacts/dmo-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';

/** Payload-free acquisition diagnostics; no remote errors or partial projections escape. */
export class OtherDmoRetrieveError extends Error {
  public constructor(
    public readonly code: 'INVALID_SCOPE' | 'INVALID_METADATA' | 'ACQUISITION_FAILED',
  ) {
    super('Other DMO retrieval failed.');
    this.name = 'OtherDmoRetrieveError';
  }
}

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;

/**
 * Acquire and validate only the evidenced API 65/default, two-authored-field Other profile.
 * Core owns authentication; Metadata read returns records, not a raw SOAP envelope.
 * @param {ReadConnection} connection Existing authenticated Salesforce core connection at API 65.0.
 * @param {unknown} objectApiName Exact non-namespaced custom DMO API name.
 * @param {unknown} apiVersion Explicit supported API version, without fallback.
 * @param {unknown} dataSpace Explicit supported source space, without fallback.
 * @returns {Promise<DmoConnectMetadataProjection>} Full validated projection and readback expectations.
 */
export async function retrieveOtherDmo(
  connection: ReadConnection,
  objectApiName: unknown,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoConnectMetadataProjection> {
  if (
    apiVersion !== '65.0' ||
    dataSpace !== 'default' ||
    typeof objectApiName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dlm$/u.test(objectApiName) ||
    /^ssot/iu.test(objectApiName)
  )
    throw new OtherDmoRetrieveError('INVALID_SCOPE');
  try {
    // Metadata's SOAP endpoint uses the connection version, not the Connect URL version.
    if (connection.getApiVersion() !== apiVersion) throw new OtherDmoRetrieveError('INVALID_SCOPE');
    const client = new ConnectClient(connection, apiVersion);
    const connect = await client.get(
      `/services/data/v${apiVersion}/ssot/data-model-objects/${objectApiName}`,
    );
    // Array input preserves record cardinality so missing/ambiguous reads cannot be selected away.
    const records: unknown = await connection.metadata.read('CustomObject', [objectApiName]);
    if (!Array.isArray(records) || records.length !== 1)
      throw new OtherDmoRetrieveError('INVALID_METADATA');
    const metadata: unknown = records[0];
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      !Object.hasOwn(metadata, 'fullName') ||
      (metadata as Record<string, unknown>).fullName !== objectApiName
    )
      throw new OtherDmoRetrieveError('INVALID_METADATA');
    const relationships = await client.listDataModelObjectRelationships(objectApiName, dataSpace);
    const projection = projectDmoConnectMetadata(connect, metadata, relationships);
    // Enforce default-space binding and the offline replay checks; never return only the candidate.
    buildOtherDmoCreateRequest(projection, dataSpace);
    return projection;
  } catch (error: unknown) {
    if (
      error instanceof OtherDmoRetrieveError ||
      error instanceof ConnectError ||
      error instanceof DmoDocumentError
    )
      throw error;
    throw new OtherDmoRetrieveError('ACQUISITION_FAILED');
  }
}
