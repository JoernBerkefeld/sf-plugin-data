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
 * @param {string} [requestScope] Local response-space filter; omission retains bounded default inventory.
 * @returns {Promise<string[]>} Sorted names in the selected space.
 */
export async function listNativeNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  family: 'dlo' | 'dmo',
  requestScope?: string,
): Promise<string[]> {
  const client = new ConnectClient(connection, version);
  const key = family === 'dmo' ? 'dataModelObject' : 'dataLakeObjects';
  const resource = family === 'dmo' ? 'data-model-objects' : 'data-lake-objects';
  const limit = family === 'dmo' ? 50 : 20;
  const seen = new Set<string>();
  const names: string[] = [];
  let totalSize: number | undefined;
  let pagedWrapper: boolean | undefined;
  const pageUrl = (offset: number): string =>
    `/services/data/v${version}/ssot/${resource}?limit=${limit}&offset=${offset}&orderBy=ASC`;
  for (let offset = 0; offset <= 2000; offset += limit) {
    const page = await client.get<unknown>(pageUrl(offset));
    if (!page || typeof page !== 'object' || Array.isArray(page))
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const wrapper = page as Record<string, unknown>;
    if (!Array.isArray(wrapper[key])) throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const entries = wrapper[key];
    if (entries.length > limit) throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const paged = family === 'dlo' && Object.keys(wrapper).length !== 1;
    if (pagedWrapper !== undefined && pagedWrapper !== paged)
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    pagedWrapper = paged;
    if (paged) {
      if (
        Object.keys(wrapper).some(
          (name) => !['currentPageUrl', key, 'nextPageUrl', 'totalSize'].includes(name),
        ) ||
        !['currentPageUrl', key, 'totalSize'].every((name) => Object.hasOwn(wrapper, name)) ||
        wrapper.currentPageUrl !== pageUrl(offset) ||
        typeof wrapper.totalSize !== 'number' ||
        !Number.isSafeInteger(wrapper.totalSize) ||
        wrapper.totalSize < offset + entries.length ||
        (totalSize !== undefined && totalSize !== wrapper.totalSize)
      )
        throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      totalSize = wrapper.totalSize;
      const more = offset + entries.length < totalSize;
      if (
        (more && (entries.length === 0 || wrapper.nextPageUrl !== pageUrl(offset + limit))) ||
        (!more &&
          Object.hasOwn(wrapper, 'nextPageUrl') &&
          wrapper.nextPageUrl !== null &&
          wrapper.nextPageUrl !== '')
      )
        throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    } else if (Object.keys(wrapper).length !== 1) {
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    }
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
      if (spaces.includes(requestScope ?? 'default')) names.push(item.name);
    }
    if (paged ? offset + entries.length === totalSize : entries.length < limit) {
      // Offset arithmetic does not prove that earlier short pages returned every entry.
      if (paged && seen.size !== totalSize)
        throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
      names.sort();
      return names;
    }
  }
  throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
}

/**
 * Resolve mappings through every confirmed selected-space DMO, never a global guess.
 * A filtered no-map 404 is meaningful only after the DMO inventory proved existence.
 * @param {string[]} dmos Complete validated selected-space DMO inventory.
 * @param {Pick<MappingClient, 'list'>} client Filtered mapping reader.
 * @param {string} [requestScope] Explicit request context; omission uses documented mapping default locally.
 * @returns {Promise<string[]>} Unique sorted mapping names.
 */
export async function listNativeMappingNames(
  dmos: string[],
  client: Pick<MappingClient, 'list'>,
  requestScope?: string,
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
    for (const raw of unwrapNativeMappingCollection(response, requestScope)) {
      const document = normalizeNativeMapping(raw, requestScope);
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
