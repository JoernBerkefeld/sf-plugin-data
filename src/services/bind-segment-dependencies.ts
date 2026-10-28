import type { Connection } from '@salesforce/core';
import { SegmentError, validateSegmentDocument } from '../artifacts/segment-document.js';
import type { SegmentDocument } from '../artifacts/segment-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';

export type SegmentDependencyBinding = {
  identity: SegmentDocument['spec']['segmentOn'];
  targetId: string;
  fields: Array<{ apiName: string; dataType: 'Text'; isPrimaryKey: true }>;
};

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;

/**
 * Require a record without accepting missing or array-shaped metadata.
 * @param {unknown} value Untrusted metadata.
 * @returns {Record<string, unknown>} Record for exact compatibility checks.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SegmentError('SEGMENT_DEPENDENCY_UNQUALIFIED');
  return value as Record<string, unknown>;
}

/**
 * Bind the qualified single-object SQL dependency to independently read target metadata.
 * This is compatibility admission, not portable DMO projection or create admission.
 * API names are mandatory in A1: a failed exact lookup never falls back to a label.
 * @param {unknown} value Complete authored Segment.
 * @param {ReadConnection} connection Authenticated target connection, never modified.
 * @param {string | ApiVersionSelection} apiVersion Explicit numeric API65 selection.
 * @param {string} dataSpace Explicit default target space.
 * @param {Function} acquire Acquire raw detail and independent Metadata, not a write response.
 * @returns {Promise<SegmentDependencyBinding[]>} Private target-local bindings; no source IDs.
 */
export async function bindSegmentDependencies(
  value: unknown,
  connection: ReadConnection,
  apiVersion: string | ApiVersionSelection,
  dataSpace: string,
  acquire: (name: string) => Promise<{ detail: unknown; metadata: unknown }> = async (name) => ({
    detail: await new ConnectClient(connection, '65.0').get(
      `/services/data/v65.0/ssot/data-model-objects/${name}`,
    ),
    metadata: await readDmoMetadata(connection as Parameters<typeof readDmoMetadata>[0], name),
  }),
): Promise<SegmentDependencyBinding[]> {
  const document = validateSegmentDocument(value);
  if (
    dataSpace !== 'default' ||
    connection.getApiVersion() !== '65.0' ||
    (typeof apiVersion === 'string'
      ? apiVersion !== '65.0'
      : apiVersion.requested !== '65.0' ||
        apiVersion.restSelector !== 'v65.0' ||
        apiVersion.soapNumeric !== '65.0')
  )
    throw new SegmentError('INVALID_SCOPE');
  // The document validator bounds this to one object and one qualified field.
  const dependency = document.spec.dependencies[0];
  try {
    const acquired = await acquire(dependency.apiName);
    const detail = record(acquired.detail);
    if (!Array.isArray(acquired.metadata) || acquired.metadata.length !== 1)
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    const metadata = record(acquired.metadata[0]);
    const objectAttributes = record(metadata.mktDataModelAttributes);
    if (
      detail.name !== dependency.apiName ||
      detail.dataSpaceName !== dependency.dataSpace ||
      metadata.fullName !== dependency.apiName ||
      objectAttributes.dataSpaceName !== dependency.dataSpace ||
      objectAttributes.isSegmentable !== 'true' ||
      typeof detail.id !== 'string' ||
      !detail.id ||
      detail.isSegmentable !== true ||
      detail.category !== 'PROFILE' ||
      !Array.isArray(detail.fields) ||
      !Array.isArray(metadata.fields) ||
      detail.fields.length > 4096 ||
      metadata.fields.length > 4096
    )
      throw new SegmentError('SEGMENT_DEPENDENCY_UNQUALIFIED');
    const fields = detail.fields.map((value) => record(value));
    const metadataFields = metadata.fields.map((value) => record(value));
    for (const [items, key] of [
      [fields, 'name'],
      [metadataFields, 'fullName'],
    ] as const) {
      const names = items.map((field) => field[key]);
      if (
        names.some((name) => typeof name !== 'string' || !name) ||
        new Set(names).size !== names.length
      )
        throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    }
    const name = dependency.fields[0];
    const matches = fields.filter((field) => field.name === name);
    const metadataMatches = metadataFields.filter((field) => field.fullName === name);
    if (matches.length !== 1 || metadataMatches.length !== 1)
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    const field = matches[0];
    const meta = metadataMatches[0];
    const attributes = record(meta.mktDataModelFieldAttributes);
    if (
      field.type !== 'Text' ||
      meta.type !== 'Text' ||
      attributes.primaryIndexOrder !== '1' ||
      (Object.hasOwn(field, 'isPrimaryKey') && field.isPrimaryKey !== true) ||
      metadataFields.filter(
        (entry) =>
          entry.mktDataModelFieldAttributes &&
          record(entry.mktDataModelFieldAttributes).primaryIndexOrder === '1',
      ).length !== 1
    )
      throw new SegmentError('SEGMENT_DEPENDENCY_UNQUALIFIED');
    return [
      {
        identity: { ...document.spec.segmentOn },
        targetId: detail.id,
        fields: [{ apiName: name, dataType: 'Text', isPrimaryKey: true }],
      },
    ];
  } catch (error: unknown) {
    if (error instanceof SegmentError) throw error;
    throw new SegmentError('SEGMENT_DEPENDENCY_ACQUISITION_FAILED');
  }
}
