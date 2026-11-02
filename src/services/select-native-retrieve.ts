import type { Connection } from '@salesforce/core';
import { ConnectClient } from '../transport/connect-client.js';
import type { MappingClient } from '../transport/mapping-rest.js';
import {
  NativeMappingError,
  mappingDloName,
  mappingDmoName,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
} from '../artifacts/native-mapping-document.js';

/**
 * Read complete native inventories using only documented offset pagination.
 * Unknown wrappers, repeated identities and a full last permitted page block publication.
 * @param {Connection} connection Authenticated command-owned connection.
 * @param {string} version Admitted numeric native version.
 * @param {'dlo' | 'dmo'} family Inventory family.
 * @returns {Promise<string[]>} Sorted default-space names.
 */
export async function listNativeNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  family: 'dlo' | 'dmo',
): Promise<string[]> {
  const client = new ConnectClient(connection, version);
  const key = family === 'dmo' ? 'dataModelObject' : 'dataLakeObjects';
  const resource = family === 'dmo' ? 'data-model-objects' : 'data-lake-objects';
  const limit = family === 'dmo' ? 50 : 20;
  const seen = new Set<string>();
  const names: string[] = [];
  for (let offset = 0; offset <= 2000; offset += limit) {
    const page = await client.get<unknown>(
      `/services/data/v${version}/ssot/${resource}?limit=${limit}&offset=${offset}&orderBy=ASC`,
    );
    if (!page || typeof page !== 'object' || Array.isArray(page))
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const wrapper = page as Record<string, unknown>;
    if (Object.keys(wrapper).length !== 1 || !Array.isArray(wrapper[key]))
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const entries = wrapper[key];
    if (entries.length > limit) throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    for (const value of entries) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      const item = value as Record<string, unknown>;
      if (
        typeof item.name !== 'string' ||
        !(family === 'dmo' ? mappingDmoName : mappingDloName).test(item.name)
      )
        throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      let spaces: string[];
      if (family === 'dmo') {
        if (typeof item.dataSpaceName !== 'string' || !item.dataSpaceName)
          throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
        spaces = [item.dataSpaceName];
      } else {
        if (!Array.isArray(item.dataSpaceInfo) || item.dataSpaceInfo.length === 0)
          throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
        spaces = item.dataSpaceInfo.map((space: unknown) => {
          if (
            !space ||
            typeof space !== 'object' ||
            !('name' in space) ||
            typeof space.name !== 'string' ||
            !space.name
          )
            throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
          return space.name;
        });
        if (new Set(spaces).size !== spaces.length)
          throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      }
      const identity = item.name.toLowerCase();
      if (seen.has(identity)) throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      seen.add(identity);
      if (spaces.includes('default')) names.push(item.name);
    }
    if (entries.length < limit) {
      names.sort();
      return names;
    }
  }
  throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
}

/**
 * Resolve mappings through every confirmed default-space DMO, never a global guess.
 * A filtered no-map 404 is meaningful only after the DMO inventory proved existence.
 * @param {string[]} dmos Complete validated default-space DMO inventory.
 * @param {MappingClient} client Filtered mapping reader.
 * @returns {Promise<string[]>} Unique sorted mapping names.
 */
export async function listNativeMappingNames(
  dmos: string[],
  client: MappingClient,
): Promise<string[]> {
  const mappings = new Map<string, string>();
  for (const dmo of dmos) {
    let response: unknown;
    try {
      response = await client.list(dmo);
    } catch (error) {
      if (
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      )
        continue;
      throw error;
    }
    if (
      !response ||
      typeof response !== 'object' ||
      Array.isArray(response) ||
      Object.keys(response).length !== 1
    )
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    for (const raw of unwrapNativeMappingCollection(response)) {
      const document = normalizeNativeMapping(raw);
      if (document.spec.targetEntityDeveloperName !== dmo)
        throw new NativeMappingError('MAPPING_INVENTORY_BINDING_MISMATCH');
      const key = document.identity.apiName.toLowerCase();
      const signature = JSON.stringify(document);
      if (mappings.has(key) && mappings.get(key) !== signature)
        throw new NativeMappingError('AMBIGUOUS_MAPPING_TARGET');
      mappings.set(key, signature);
    }
  }
  const names = [...mappings.values()].map(
    (value) => (JSON.parse(value) as { identity: { apiName: string } }).identity.apiName,
  );
  names.sort();
  return names;
}
