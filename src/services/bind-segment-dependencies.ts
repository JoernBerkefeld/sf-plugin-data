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
import { isDataSpaceName } from '../artifacts/data-space-field.js';

export type SegmentDependencyBinding = {
  identity: SegmentDocument['spec']['segmentOn'];
  targetId: string;
};

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;

/**
 * The refusal of a segment whose segmentOn DMO or Waterfall child the org holds in another data
 * space: a segment and everything it names are in one data space.
 * @param {string} what What the segment names (`its DMO X`, `the child segment X`).
 * @param {unknown} found The data space the org names for it.
 * @param {string} dataSpace The segment's data space.
 * @returns {SegmentError} SEGMENT_DEPENDENCY_OTHER_DATASPACE with an explanation.
 */
function otherSpace(what: string, found: unknown, dataSpace: string): SegmentError {
  return explainInput(
    new SegmentError('SEGMENT_DEPENDENCY_OTHER_DATASPACE'),
    `The segment names ${what}, which is in the data space ${isDataSpaceName(found) ? found : '(none named)'}, not in the segment's data space ${dataSpace}. Name the component of the segment's data space (in a non-default data space Salesforce stores it as <prefix>_<Name>); nothing was written.`,
  );
}

/**
 * Bind the DMO a Segment is built on to its target-local ID with one native API68 read.
 * Only existence, identity and data space are checked (a DMO read that names another data space
 * than the segment's is SEGMENT_DEPENDENCY_OTHER_DATASPACE); whether the DMO suits the Segment is
 * Salesforce's call.
 * @param {unknown} value Complete authored Segment.
 * @param {ReadConnection} connection Authenticated target connection, never modified.
 * @param {string | ApiVersionSelection} apiVersion API68 selection.
 * @param {string} dataSpace The run's data space; the segment's c__dataSpace must name it.
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
    document.c__dataSpace !== dataSpace ||
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
    // A read without a data space leaves the decision to Salesforce's write.
    const found = (detail as Record<string, unknown>).dataSpaceName;
    if (found !== undefined && found !== null && found !== dataSpace)
      throw otherSpace(`its DMO ${name}`, found, dataSpace);
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
  identity: { kind: 'segment'; dataSpace: string; apiName: string };
  /** The child's `marketSegmentDefinitionId` in the target org. */
  targetId: string;
};

/**
 * Bind the child segments a Waterfall file names (`spec.childSegments`) to their definition IDs
 * in the target org, one exact segment read per child, in the order of the file. Nothing is read
 * for a segment without child segments. A child that is not a segment API name, or that the
 * target answers with HTTP 404, is SEGMENT_CHILD_NOT_FOUND (the child must exist in the target
 * or be deployed earlier in the same run); another answer without that exact segment and its
 * definition ID is SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING, a child of another data space than the
 * Waterfall's SEGMENT_DEPENDENCY_OTHER_DATASPACE; a failed read
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
  const document = validateSegmentDocument(value);
  const names = (document.spec as OtherSegmentSpec).childSegments ?? [];
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
      typeof entry.marketSegmentDefinitionId !== 'string' ||
      !entry.marketSegmentDefinitionId
    )
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    // A read by name finds a segment in any data space; a Waterfall takes children of its own.
    if (entry.dataSpace !== document.c__dataSpace)
      throw otherSpace(`the child segment ${name}`, entry.dataSpace, document.c__dataSpace);
    bindings.push({
      identity: { kind: 'segment', dataSpace: document.c__dataSpace, apiName: name },
      targetId: entry.marketSegmentDefinitionId,
    });
  }
  return bindings;
}
