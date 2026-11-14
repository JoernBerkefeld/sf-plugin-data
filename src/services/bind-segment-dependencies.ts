import type { Connection } from '@salesforce/core';
import { SegmentError, validateSegmentDocument } from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';

export type SegmentDependencyBinding = {
  identity: SegmentDocument['spec']['segmentOn'];
  targetId: string;
};

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;

/**
 * Bind the DMO a Segment is built on to its target-local ID with one native API68 read.
 * Only existence and identity are checked; whether the DMO suits the Segment is Salesforce's call.
 * @param {unknown} value Complete authored Segment.
 * @param {ReadConnection} connection Authenticated target connection, never modified.
 * @param {string | ApiVersionSelection} apiVersion API68 selection.
 * @param {string} dataSpace Explicit default target space.
 * @param {Function} acquire Raw DMO detail read, not a write response.
 * @returns {Promise<SegmentDependencyBinding[]>} Private target-local binding; no source IDs.
 */
export async function bindSegmentDependencies(
  value: unknown,
  connection: ReadConnection,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  acquire: (name: string) => Promise<unknown> = async (name) =>
    new ConnectClient(connection, apiVersion).get(
      `/services/data/v${connection.getApiVersion()}/ssot/data-model-objects/${name}`,
    ),
): Promise<SegmentDependencyBinding[]> {
  const document = validateSegmentDocument(value);
  const version = typeof apiVersion === 'string' ? apiVersion : apiVersion.requested;
  if (
    dataSpace !== 'default' ||
    version !== '68.0' ||
    connection.getApiVersion() !== version ||
    (typeof apiVersion !== 'string' &&
      (apiVersion.restSelector !== `v${version}` || apiVersion.soapNumeric !== version))
  )
    throw new SegmentError('INVALID_SCOPE');
  const name = document.spec.segmentOn.apiName;
  try {
    const detail = await acquire(name);
    if (
      !detail ||
      typeof detail !== 'object' ||
      Array.isArray(detail) ||
      (detail as Record<string, unknown>).name !== name ||
      typeof (detail as Record<string, unknown>).id !== 'string' ||
      !(detail as Record<string, unknown>).id
    )
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    return [
      {
        identity: { ...document.spec.segmentOn },
        targetId: (detail as Record<string, string>).id,
      },
    ];
  } catch (error: unknown) {
    if (error instanceof SegmentError) throw error;
    throw retainConnectDiagnostic(
      new SegmentError('SEGMENT_DEPENDENCY_ACQUISITION_FAILED'),
      getConnectDiagnostic(error),
    );
  }
}
