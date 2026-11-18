import type { Connection } from '@salesforce/core';
import {
  SegmentError,
  segmentName,
  validateSegmentDocument,
} from '../artifacts/segment-document.js';
import type { OtherSegmentSpec, SegmentDocument } from '../artifacts/segment-document.js';
import { explainInput } from './operation-diagnostic.js';
import { ConnectClient } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';

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
 * @param {DocumentMode} [mode] How the Segment is checked: `retrieve` admits a retrieved file.
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
  mode: DocumentMode = 'deploy',
): Promise<SegmentDependencyBinding[]> {
  const document = validateSegmentDocument(value, mode);
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

export type SegmentChildBinding = {
  identity: { kind: 'segment'; dataSpace: 'default'; apiName: string };
  /** The child's `marketSegmentDefinitionId` in the target org. */
  targetId: string;
};

/**
 * Bind the child segments a Waterfall file names (`spec.childSegments`) to their definition IDs
 * in the target org, one exact segment read per child, in the order of the file. Nothing is read
 * for a segment without child segments. A child that is not a segment API name, or that the
 * target answers with HTTP 404, is SEGMENT_CHILD_NOT_FOUND (the child must exist in the target
 * or be deployed earlier in the same run); another answer without that exact segment and its
 * definition ID is SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING; a failed read
 * SEGMENT_DEPENDENCY_ACQUISITION_FAILED.
 * @param {unknown} value Complete authored Segment.
 * @param {ReadConnection} connection Authenticated target connection, never modified.
 * @param {string | ApiVersionSelection} apiVersion API68 selection.
 * @param {Function} [read] Raw segment GET by API name.
 * @returns {Promise<SegmentChildBinding[]>} Target-local child bindings in file order.
 */
export async function bindSegmentChildren(
  value: unknown,
  connection: ReadConnection,
  apiVersion: string | ApiVersionSelection,
  read: (name: string) => Promise<unknown> = async (name) =>
    new ConnectClient(connection, apiVersion).get(
      `/services/data/v${connection.getApiVersion()}/ssot/segments/${name}`,
    ),
): Promise<SegmentChildBinding[]> {
  const names = (validateSegmentDocument(value).spec as OtherSegmentSpec).childSegments ?? [];
  const bindings: SegmentChildBinding[] = [];
  for (const name of names) {
    const missing = (): SegmentError =>
      explainInput(
        new SegmentError('SEGMENT_CHILD_NOT_FOUND'),
        `The child segment ${segmentName.test(name) ? name : '[not a segment API name]'} of spec.childSegments is not in the target org. Deploy it first (in the same run it is deployed before the Waterfall) or correct the name; nothing was written.`,
      );
    if (!segmentName.test(name)) throw missing();
    let response: unknown;
    try {
      response = await read(name);
    } catch (error: unknown) {
      const diagnostic = getConnectDiagnostic(error);
      if (diagnostic?.statusCode === 404) throw retainConnectDiagnostic(missing(), diagnostic);
      throw retainConnectDiagnostic(
        new SegmentError('SEGMENT_DEPENDENCY_ACQUISITION_FAILED'),
        diagnostic,
      );
    }
    const child = (response as { segments?: unknown } | undefined)?.segments;
    const entry = (Array.isArray(child) && child.length === 1 ? child[0] : undefined) as
      Record<string, unknown> | undefined;
    if (
      !entry ||
      entry.apiName !== name ||
      entry.dataSpace !== 'default' ||
      typeof entry.marketSegmentDefinitionId !== 'string' ||
      !entry.marketSegmentDefinitionId
    )
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    bindings.push({
      identity: { kind: 'segment', dataSpace: 'default', apiName: name },
      targetId: entry.marketSegmentDefinitionId,
    });
  }
  return bindings;
}
