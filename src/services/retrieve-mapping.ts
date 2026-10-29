import type { Connection } from '@salesforce/core';
import { MappingError, mappingName, projectMapping } from '../artifacts/mapping-document.js';
import type { MappingDocument } from '../artifacts/mapping-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import { retrieveMappingSourceMetadata } from '../transport/project-metadata.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';

type ReadConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'metadata' | 'getApiVersion' | 'getUsername'
>;
export type MappingAcquisition = {
  identity: MappingDocument['identity'];
  candidate?: never;
  definitionXml: string;
  blockers: ['DLO_PRIMARY_QUALIFIER_CORRELATION_UNVERIFIED'];
  expectations: {
    projection: MappingDocument;
    rawConnect: { mapping: unknown; source: unknown; target: unknown };
    rawSoap: { source: unknown; target: unknown };
  };
};

/** Payload-free failure, distinct from a successfully captured but unqualified snapshot. */
export class MappingAcquisitionError extends Error {
  public constructor(public readonly code: string) {
    super('Mapping evidence acquisition failed.');
    this.name = 'MappingAcquisitionError';
  }
}

/**
 * Require an identity-bearing record without interpreting unknown schema semantics.
 * @param {unknown} value Untrusted independent response.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MappingAcquisitionError('INVALID_PREREQUISITE_EVIDENCE');
  return value as Record<string, unknown>;
}

/**
 * Check exact identities and field inventory correlation only, not PK/KQ compatibility.
 * The direct Connect detail shape follows retrieveDlo/retrieveDmo; SOAP returns one member.
 * @param {unknown} detail Independent exact Connect detail.
 * @param {unknown} soap Independent CustomObject read result.
 * @param {string} name Exact prerequisite name from the mapping projection.
 * @param {string} collection Retained Connect field collection key.
 * @param {string[]} mappedFields Every runtime pair endpoint, including runtime-only pairs.
 */
function correlateSchema(
  detail: unknown,
  soap: unknown,
  name: string,
  collection: string,
  mappedFields: string[],
): void {
  if (!Array.isArray(soap) || soap.length !== 1)
    throw new MappingAcquisitionError('AMBIGUOUS_PREREQUISITE_EVIDENCE');
  const connect = record(detail);
  const metadata = record(soap[0]);
  if (connect.name !== name || metadata.fullName !== name)
    throw new MappingAcquisitionError('PREREQUISITE_IDENTITY_MISMATCH');
  const inventories = [connect[collection], metadata.fields];
  const names = inventories.map((items, index) => {
    if (!Array.isArray(items) || items.length === 0 || items.length > 4096)
      throw new MappingAcquisitionError('INVALID_PREREQUISITE_FIELDS');
    const entries = items.map((item) => record(item)[index === 0 ? 'name' : 'fullName']);
    if (
      entries.some((entry) => typeof entry !== 'string' || !entry) ||
      new Set(entries).size !== entries.length
    )
      throw new MappingAcquisitionError('AMBIGUOUS_PREREQUISITE_FIELDS');
    return new Set(entries);
  });
  if (
    names[0].size !== names[1].size ||
    [...names[0]].some((name) => !names[1].has(name)) ||
    mappedFields.some((name) => !names[0].has(name))
  )
    throw new MappingAcquisitionError('PREREQUISITE_FIELD_CORRELATION_FAILED');
}

/**
 * Capture internal API65/default mapping evidence; never produce a deployable candidate.
 * Unknown prerequisite properties remain private and lossless, not compatibility-admitted.
 * The SOAP seam reuses the guarded exact CustomObject read, whose transport is not DMO-specific.
 * @param {ReadConnection} connection Existing authenticated fixed-version connection.
 * @param {string} apiName Exact selected mapping identity.
 * @param {string} apiVersion Fixed API65 selector.
 * @param {string} dataSpace Fixed default space.
 * @param {Function} metadata Exact standard XML retrieve seam.
 * @param {Function} soap Exact readonly CustomObject SOAP seam.
 * @returns {Promise<MappingAcquisition>} Detached evidence with mandatory unresolved semantic blocker.
 */
export async function retrieveMapping(
  connection: ReadConnection,
  apiName: string,
  apiVersion: string,
  dataSpace: string,
  metadata: (targetOrg: string, name: string) => Promise<string> = retrieveMappingSourceMetadata,
  soap: (name: string) => Promise<unknown> = (name) => readDmoMetadata(connection, name),
): Promise<MappingAcquisition> {
  if (
    apiVersion !== '65.0' ||
    dataSpace !== 'default' ||
    connection.getApiVersion() !== '65.0' ||
    !mappingName.test(apiName)
  )
    throw new MappingAcquisitionError('INVALID_SCOPE');
  const username = connection.getUsername();
  if (!username) throw new MappingAcquisitionError('TARGET_ORG_REQUIRED');
  try {
    const client = new ConnectClient(connection, '65.0');
    const mapping = await client.get(
      `/services/data/v65.0/ssot/data-model-object-mappings/${apiName}`,
    );
    const definitionXml = await metadata(username, apiName);
    const projection = projectMapping(mapping, definitionXml, apiName);
    const sourceName = projection.spec.sourceObject;
    const targetName = projection.spec.targetObject;
    const source = await client.get(`/services/data/v65.0/ssot/data-lake-objects/${sourceName}`);
    const target = await client.get(`/services/data/v65.0/ssot/data-model-objects/${targetName}`);
    const sourceSoap = await soap(sourceName);
    const targetSoap = await soap(targetName);
    correlateSchema(
      source,
      sourceSoap,
      sourceName,
      'dataLakeFieldInfoRepresentation',
      projection.spec.pairs.map((pair) => pair.sourceField),
    );
    correlateSchema(
      target,
      targetSoap,
      targetName,
      'fields',
      projection.spec.pairs.map((pair) => pair.targetField),
    );
    return {
      identity: { ...projection.identity },
      definitionXml,
      blockers: ['DLO_PRIMARY_QUALIFIER_CORRELATION_UNVERIFIED'],
      expectations: structuredClone({
        projection,
        rawConnect: { mapping, source, target },
        rawSoap: { source: sourceSoap, target: targetSoap },
      }),
    };
  } catch (error: unknown) {
    if (error instanceof MappingAcquisitionError) throw error;
    throw new MappingAcquisitionError(
      error instanceof MappingError ? error.code : 'EVIDENCE_READ_FAILED',
    );
  }
}
