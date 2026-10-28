import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { projectIdentityResolution } from '../artifacts/identity-resolution-document.js';
import type { IdentityResolutionOutputIdentity } from '../artifacts/identity-resolution-document.js';
import { verifyIdentityResolutionOutputs } from './bind-identity-resolution-dependencies.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';
import {
  graphRecord,
  graphRequire,
  graphText,
  validateDataGraphDocument,
} from '../artifacts/data-graph-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';
import { dataGraphScope, graphCanonicalObject } from './retrieve-data-graph.js';
import type { DataGraphConnection } from './retrieve-data-graph.js';

export type DataGraphDependencyBinding = {
  fingerprint: string;
  preservationFingerprint?: string;
  root?: { identity: IdentityResolutionOutputIdentity; targetApiName: string; targetId: string };
};

/**
 * Independently bind the qualified root and all required Text fields.
 * @param {unknown} value Document.
 * @param {DataGraphConnection} connection Connection.
 * @param {ApiVersionSelection} selection Version.
 * @param {string} dataSpace Space.
 * @param {Function} [acquire] Independent read seam.
 * @param {Function} [acquireOwner] Independent exact facade/native owner read.
 * @returns {Promise<DataGraphDependencyBinding>} Private stable target binding.
 */
export async function bindDataGraphDependencies(
  value: unknown,
  connection: DataGraphConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire?: (name: string) => Promise<{ detail: unknown; metadata: unknown }>,
  acquireOwner = retrieveIdentityResolution,
): Promise<DataGraphDependencyBinding> {
  const document = validateDataGraphDocument(value);
  const version = { ...selection };
  const origin = connection.instanceUrl;
  const scope = (): void => {
    dataGraphScope(connection, version, dataSpace);
    graphRequire(isDeepStrictEqual(selection, version) && connection.instanceUrl === origin);
  };
  scope();
  const root = document.spec.primaryObjectName;
  let name: string;
  let bound: DataGraphDependencyBinding['root'];
  let ownerProof: unknown;
  let outputProof: unknown;
  const reader =
    acquire ??
    (async (name: string) => {
      const receiver = Object.create(connection) as Parameters<typeof readDmoMetadata>[0];
      Object.defineProperty(receiver, 'version', { value: '65.0' });
      Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
      return {
        detail: await new ConnectClient(connection, '65.0').get(
          `/services/data/v65.0/ssot/data-model-objects/${name}`,
        ),
        metadata: await readDmoMetadata(receiver, name),
      };
    });
  if (typeof root === 'string') name = root;
  else {
    const owner = await acquireOwner(connection, root.owner.apiName, { ...version }, dataSpace);
    scope();
    graphRequire(
      owner.candidate &&
        owner.expectations &&
        owner.blockers.length === 0 &&
        isDeepStrictEqual(owner.identity, {
          dataSpace: 'default',
          apiName: root.owner.apiName,
        }),
    );
    const projection = projectIdentityResolution(
      owner.expectations.facade,
      owner.expectations.native,
      root.owner.apiName,
    );
    graphRequire(
      isDeepStrictEqual(owner.candidate, projection.candidate) &&
        isDeepStrictEqual(owner.expectations, projection.expectations),
    );
    const outputs = await verifyIdentityResolutionOutputs(
      {
        targetApiName: root.owner.apiName,
        targetId: projection.expectations.facade.id as string,
        dataSpace: 'default',
      },
      projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity,
        targetApiName: sourceApiName,
      })),
      connection,
      { ...version },
      reader,
      async (...arguments_: Parameters<typeof retrieveIdentityResolution>) => {
        const fresh = await acquireOwner(...arguments_);
        scope();
        graphRequire(
          fresh.expectations &&
            fresh.candidate &&
            fresh.blockers.length === 0 &&
            isDeepStrictEqual(fresh.identity, owner.identity) &&
            isDeepStrictEqual(fresh.candidate, projection.candidate) &&
            isDeepStrictEqual(fresh.expectations, projection.expectations),
        );
        return fresh;
      },
    );
    scope();
    const matches = outputs.filter((output) => isDeepStrictEqual(output.identity, root));
    graphRequire(matches.length === 1);
    name = matches[0].targetApiName;
    bound = { identity: structuredClone(root), targetApiName: name, targetId: matches[0].targetId };
    ownerProof = projection;
    outputProof = outputs;
  }
  const acquired = await reader(name);
  scope();
  const detail = graphRecord(acquired.detail);
  const raw = acquired.metadata;
  graphRequire(Array.isArray(raw) && raw.length === 1);
  const metadata = graphRecord(raw[0]);
  graphRequire(
    detail.name === name &&
      detail.dataSpaceName === 'default' &&
      metadata.fullName === name &&
      graphRecord(metadata.mktDataModelAttributes).dataSpaceName === 'default',
  );
  graphText(detail.id);
  graphRequire(
    Array.isArray(detail.fields) &&
      Array.isArray(metadata.fields) &&
      detail.fields.length <= 4096 &&
      metadata.fields.length <= 4096,
  );
  const index = (values: unknown[], key: string): Map<string, Record<string, unknown>> => {
    const result = new Map<string, Record<string, unknown>>();
    for (const value of values) {
      const field = graphRecord(value);
      graphText(field[key]);
      graphRequire(!result.has(field[key] as string));
      result.set(field[key] as string, field);
    }
    return result;
  };
  const fields = index(detail.fields, 'name');
  const meta = index(metadata.fields, 'fullName');
  for (const field of ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'])
    graphRequire(fields.get(field)?.type === 'Text' && meta.get(field)?.type === 'Text');
  const primary = [...meta.entries()].filter(([, field]) => {
    if (field.type === 'Lookup' && !Object.hasOwn(field, 'mktDataModelFieldAttributes'))
      return false;
    return graphRecord(field.mktDataModelFieldAttributes).primaryIndexOrder === '1';
  });
  const rawKey = fields.get('ssot__Id__c')!;
  graphRequire(
    primary.length === 1 &&
      primary[0][0] === 'ssot__Id__c' &&
      (!Object.hasOwn(rawKey, 'isPrimaryKey') || rawKey.isPrimaryKey === true),
  );
  if (bound) {
    graphRequire(
      detail.id === bound.targetId &&
        detail.creationType === 'Derived' &&
        graphRecord(metadata.mktDataModelAttributes).creationType === 'Derived',
    );
    const final = await acquireOwner(
      connection,
      bound.identity.owner.apiName,
      { ...version },
      dataSpace,
    );
    graphRequire(final.expectations && final.candidate && final.blockers.length === 0);
    const projection = projectIdentityResolution(
      final.expectations.facade,
      final.expectations.native,
      bound.identity.owner.apiName,
    );
    graphRequire(
      isDeepStrictEqual(projection, ownerProof) &&
        isDeepStrictEqual(final.candidate, projection.candidate) &&
        isDeepStrictEqual(final.expectations, projection.expectations),
    );
  }
  scope();
  return {
    ...(bound
      ? {
          root: bound,
          preservationFingerprint: createHash('sha256')
            .update(JSON.stringify(graphCanonicalObject({ outputs: outputProof, root: acquired })))
            .digest('hex'),
        }
      : {}),
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          id: detail.id,
          name,
          fields: ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'],
          key: primary[0][0],
          ...(bound
            ? {
                proof: graphCanonicalObject({
                  owner: ownerProof,
                  outputs: outputProof,
                  root: acquired,
                }),
              }
            : {}),
        }),
      )
      .digest('hex'),
  };
}
