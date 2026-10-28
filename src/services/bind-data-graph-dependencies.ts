import { createHash } from 'node:crypto';
import {
  graphRecord,
  graphRequire,
  graphText,
  validateDataGraphDocument,
} from '../artifacts/data-graph-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';
import { dataGraphScope } from './retrieve-data-graph.js';
import type { DataGraphConnection } from './retrieve-data-graph.js';

/**
 * Independently bind the qualified root and all required Text fields.
 * @param {unknown} value Document.
 * @param {DataGraphConnection} connection Connection.
 * @param {ApiVersionSelection} selection Version.
 * @param {string} dataSpace Space.
 * @param {Function} [acquire] Independent read seam.
 * @returns {Promise<{fingerprint: string}>} Private stable target binding.
 */
export async function bindDataGraphDependencies(
  value: unknown,
  connection: DataGraphConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire?: (name: string) => Promise<{ detail: unknown; metadata: unknown }>,
): Promise<{ fingerprint: string }> {
  const document = validateDataGraphDocument(value);
  dataGraphScope(connection, selection, dataSpace);
  const name = document.spec.primaryObjectName;
  // Owner-qualified roots remain fail-closed until exact output binding is integrated.
  graphRequire(typeof name === 'string');
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
  const acquired = await reader(name);
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
  dataGraphScope(connection, selection, dataSpace);
  return {
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          id: detail.id,
          name,
          fields: ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'],
          key: primary[0][0],
        }),
      )
      .digest('hex'),
  };
}
