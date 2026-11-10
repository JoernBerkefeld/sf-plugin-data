import type { Connection } from '@salesforce/core';
import {
  apiDiagnostic,
  diagnosticDataProperty,
  diagnosticRequestId,
  retainConnectDiagnostic,
} from '../transport/connect-diagnostic.js';

/** Payload-free Metadata read diagnostics; no remote errors or partial records escape. */
export class MetadataReadError extends Error {
  public constructor(public readonly code: string) {
    super('Metadata read failed.');
    this.name = 'MetadataReadError';
  }
}

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;

type MetadataTransport = {
  httpRequest: (
    request: unknown,
    options: Record<string, unknown>,
  ) => Promise<unknown> & { stream: () => unknown };
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
  return readIndependentMetadata(connection, objectApiName, 'CustomObject');
}

/**
 * Independently read one CI definition using the same guarded core SOAP receiver.
 * @param {ReadConnection} connection Existing authenticated API65 connection.
 * @param {string} fullName Exact qualified CI Metadata full name.
 * @returns {Promise<unknown>} Untrusted parsed definition records.
 */
export async function readCalculatedInsightMetadata(
  connection: ReadConnection,
  fullName: string,
): Promise<unknown> {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(fullName) || connection.getApiVersion() !== '65.0')
    throw new MetadataReadError('INVALID_SCOPE');
  return readIndependentMetadata(connection, fullName, 'MktCalcInsightObjectDef');
}

/**
 * Share only the concrete guarded SOAP mechanism, not family admission.
 * @param {ReadConnection} connection Authenticated existing receiver.
 * @param {string} fullName Exact selected member.
 * @param {'CustomObject' | 'MktCalcInsightObjectDef'} type Fixed supported type.
 * @returns {Promise<unknown>} Untrusted parsed Metadata records.
 */
async function readIndependentMetadata(
  connection: ReadConnection,
  fullName: string,
  type: 'CustomObject' | 'MktCalcInsightObjectDef',
): Promise<unknown> {
  let status: unknown;
  let headers: unknown;
  try {
    const transport = (connection as unknown as { _transport: MetadataTransport })._transport;
    if (typeof transport?.httpRequest !== 'function')
      throw new MetadataReadError('ACQUISITION_FAILED');
    const receiver = Object.create(connection) as ReadConnection;
    const guardedTransport = Object.create(transport) as MetadataTransport;
    guardedTransport.httpRequest = (request, options) => {
      const pending = transport.httpRequest(request, {
        ...options,
        followRedirect: () => {
          throw new MetadataReadError('METADATA_REDIRECT_REFUSED');
        },
        retry: { maxRetries: 0 },
      });
      const observed = pending.then((response) => {
        status = diagnosticDataProperty(response, 'statusCode');
        headers = diagnosticDataProperty(response, 'headers');
        return response;
      });
      return Object.assign(observed, { stream: () => pending.stream() });
    };
    Object.defineProperty(receiver, '_transport', { value: guardedTransport });
    const metadata = Object.create(connection.metadata) as Connection['metadata'];
    Object.defineProperty(metadata, '_conn', { value: receiver });
    // Installed JSforce's generated type union omits this API65-supported Metadata type.
    const read = metadata.read as unknown as (
      type: string,
      fullNames: string[],
    ) => Promise<unknown>;
    return await read.call(metadata, type, [fullName]);
  } catch (error: unknown) {
    if (error instanceof MetadataReadError) throw error;
    // Installed SOAP parser exposes only faultcode/faultstring as data.errorCode/message.
    // Admit those parsed leaves only with independently observed HTTP failure.
    throw retainConnectDiagnostic(
      new MetadataReadError('ACQUISITION_FAILED'),
      apiDiagnostic(
        status,
        diagnosticDataProperty(error, 'data'),
        headers,
        diagnosticRequestId(headers),
      ),
    );
  }
}
