import type { Connection } from '@salesforce/core';
import {
  buildDmoCreateRequestFromDocument,
  DmoDocumentError,
  projectCommonDmoConnectMetadata,
} from '../artifacts/dmo-document.js';
import type { DmoCommonProjection, DmoDocument } from '../artifacts/dmo-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';

/** Payload-free acquisition diagnostics; no remote errors or partial projections escape. */
export class DmoRetrieveError extends Error {
  public constructor(public readonly code: string) {
    super('DMO retrieval failed.');
    this.name = 'DmoRetrieveError';
  }
}

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;

/**
 * Validate retrieval syntax and current scope before authentication or resource reads.
 * @param {string[]} selectors Repeated type or exact selectors; empty means all implemented families.
 * @param {string} apiVersion Explicit API version.
 * @param {string} dataSpace Explicit source scope.
 */
export function validateDmoSelection(
  selectors: string[],
  apiVersion: string,
  dataSpace: string,
): void {
  if (selectors.some((selector) => !/^dmo(?::[A-Za-z][A-Za-z0-9_]*__dlm)?$/u.test(selector)))
    throw new DmoRetrieveError('INVALID_SELECTION');
  if (apiVersion !== '65.0' || dataSpace !== 'default') throw new DmoRetrieveError('INVALID_SCOPE');
}

/**
 * Expand complete inventory only for type/all selection; exact-only needs no list request.
 * @param {ReadConnection} connection Authenticated core connection.
 * @param {string[]} selectors Previously supplied selectors.
 * @param {string} apiVersion Explicit API version.
 * @param {string} dataSpace Explicit source scope.
 * @returns {Promise<string[]>} Deduplicated, deterministically ordered exact names.
 */
export async function selectDmos(
  connection: ReadConnection,
  selectors: string[],
  apiVersion: string,
  dataSpace: string,
): Promise<string[]> {
  validateDmoSelection(selectors, apiVersion, dataSpace);
  if (connection.getApiVersion() !== apiVersion) throw new DmoRetrieveError('INVALID_SCOPE');
  const names = selectors
    .filter((selector) => selector !== 'dmo')
    .map((selector) => selector.slice(4));
  if (selectors.length === 0 || selectors.includes('dmo')) {
    const inventory = await new ConnectClient(connection, apiVersion).listDataModelObjects();
    for (const item of inventory) {
      if (item.dataSpaceName !== dataSpace) continue;
      if (typeof item.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*__dlm$/u.test(item.name))
        throw new DmoRetrieveError('INVALID_INVENTORY');
      names.push(item.name);
    }
  }
  // eslint-disable-next-line unicorn/no-array-sort -- The package TypeScript library target lacks toSorted; this array is newly allocated.
  return [...new Set(names)].sort();
}

type MetadataTransport = {
  httpRequest: (request: unknown, options: Record<string, unknown>) => unknown;
};

/**
 * Read through core's Metadata/SOAP implementation with operation-local redirect refusal.
 * Installed jsforce Metadata binds SOAP to _conn, bypassing Connection.request options.
 * Shadow that receiver and transport only; retain core credentials, envelope and parser.
 * @param {ReadConnection} connection Existing authenticated core connection.
 * @param {string} objectApiName Exact independently validated DMO identity.
 * @returns {Promise<unknown>} Untrusted parsed Metadata records, never a raw SOAP envelope.
 */
export async function readDmoMetadata(
  connection: ReadConnection,
  objectApiName: string,
): Promise<unknown> {
  try {
    const transport = (connection as unknown as { _transport: MetadataTransport })._transport;
    if (typeof transport?.httpRequest !== 'function')
      throw new DmoRetrieveError('ACQUISITION_FAILED');
    const receiver = Object.create(connection) as ReadConnection;
    const guardedTransport = Object.create(transport) as MetadataTransport;
    guardedTransport.httpRequest = (request, options) =>
      transport.httpRequest(request, {
        ...options,
        followRedirect: () => {
          throw new DmoRetrieveError('METADATA_REDIRECT_REFUSED');
        },
        retry: { maxRetries: 0 },
      });
    Object.defineProperty(receiver, '_transport', { value: guardedTransport });
    const metadata = Object.create(connection.metadata) as Connection['metadata'];
    Object.defineProperty(metadata, '_conn', { value: receiver });
    return await metadata.read('CustomObject', [objectApiName]);
  } catch (error: unknown) {
    if (error instanceof DmoRetrieveError) throw error;
    throw new DmoRetrieveError('ACQUISITION_FAILED');
  }
}

/**
 * Acquire complete API 65/default inputs and qualify them through the common DMO projector.
 * Core owns authentication; Metadata read returns records, not a raw SOAP envelope.
 * @param {ReadConnection} connection Existing authenticated Salesforce core connection at API 65.0.
 * @param {unknown} objectApiName Exact non-namespaced custom DMO API name.
 * @param {unknown} apiVersion Explicit supported API version, without fallback.
 * @param {unknown} dataSpace Explicit supported source space, without fallback.
 * @returns {Promise<DmoCommonProjection & { candidate: DmoDocument }>} Qualified projection and expectations.
 */
export async function retrieveDmo(
  connection: ReadConnection,
  objectApiName: unknown,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoCommonProjection & { candidate: DmoDocument }> {
  if (apiVersion !== '65.0' || dataSpace !== 'default') throw new DmoRetrieveError('INVALID_SCOPE');
  if (
    typeof objectApiName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dlm$/u.test(objectApiName) ||
    /^ssot/iu.test(objectApiName)
  )
    throw new DmoRetrieveError('UNSUPPORTED_DMO_IDENTITY');
  try {
    // Metadata's SOAP endpoint uses the connection version, not the Connect URL version.
    if (connection.getApiVersion() !== apiVersion) throw new DmoRetrieveError('INVALID_SCOPE');
    const client = new ConnectClient(connection, apiVersion);
    const connect = await client.get(
      `/services/data/v${apiVersion}/ssot/data-model-objects/${objectApiName}`,
    );
    // Array input preserves record cardinality so missing/ambiguous reads cannot be selected away.
    const records = await readDmoMetadata(connection, objectApiName);
    if (!Array.isArray(records) || records.length !== 1)
      throw new DmoRetrieveError('INVALID_METADATA');
    const metadata: unknown = records[0];
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      !Object.hasOwn(metadata, 'fullName') ||
      (metadata as Record<string, unknown>).fullName !== objectApiName
    )
      throw new DmoRetrieveError('INVALID_METADATA');
    const relationships = await client.listDataModelObjectRelationships(objectApiName, dataSpace);
    const projection = projectCommonDmoConnectMetadata(connect, metadata, relationships);
    // Incomplete candidates are diagnostic only, including absent Engagement event designations.
    if (
      projection.status !== 'projected' ||
      projection.blockers.length > 0 ||
      !projection.candidate
    )
      throw new DmoRetrieveError(
        projection.blockers.includes('ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE')
          ? 'ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE'
          : (projection.blockers[0] ?? 'INCOMPLETE_DMO_PROJECTION'),
      );
    const candidate = projection.candidate;
    buildDmoCreateRequestFromDocument(candidate, dataSpace);
    if (candidate.identity.apiName !== objectApiName)
      throw new DmoRetrieveError('INVALID_METADATA');
    return { ...projection, candidate };
  } catch (error: unknown) {
    if (
      error instanceof DmoRetrieveError ||
      error instanceof ConnectError ||
      error instanceof DmoDocumentError
    )
      throw error;
    throw new DmoRetrieveError('ACQUISITION_FAILED');
  }
}
