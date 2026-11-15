import type { Connection } from '@salesforce/core';
import { ConnectClient } from '../transport/connect-client.js';
import type { MappingClient } from '../transport/mapping-rest.js';
import {
  NativeMappingError,
  mappingDloName,
  mappingDmoName,
  nativeMappingName,
} from '../artifacts/native-mapping-document.js';

/**
 * The data spaces an inventory entry belongs to; an unusable space is left out.
 * @param {Record<string, unknown>} item Inventory entry.
 * @param {'dlo' | 'dmo'} family Inventory family.
 * @returns {string[]} Its data space names.
 */
function entrySpaces(item: Record<string, unknown>, family: 'dlo' | 'dmo'): string[] {
  if (family === 'dmo')
    return typeof item.dataSpaceName === 'string' && item.dataSpaceName ? [item.dataSpaceName] : [];
  if (!Array.isArray(item.dataSpaceInfo)) return [];
  return item.dataSpaceInfo.flatMap((space: unknown) =>
    space &&
    typeof space === 'object' &&
    'name' in space &&
    typeof space.name === 'string' &&
    space.name
      ? [space.name]
      : [],
  );
}

/**
 * The listing entry as an object; anything else has no usable field.
 * @param {unknown} value Listing entry.
 * @returns {Record<string, unknown>} The entry, or an empty object.
 */
function entryObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Name a skipped listing entry in a warning.
 * @param {string | undefined} name Its name, when it has one.
 * @param {number} position Its position in the listing.
 * @returns {string} `"Name"` or `the entry at position N`.
 */
function entryLabel(name: string | undefined, position: number): string {
  return name === undefined ? `the entry at position ${position}` : `"${name}"`;
}

/**
 * Read a native DLO or DMO inventory through its documented offset paging, until the API has no
 * more pages: `totalSize` when the answer has it, otherwise a non-empty `nextPageUrl` or a full
 * page. Extra envelope keys and the format of the page URLs are ignored. A page whose entries are
 * all listed already ends the listing (a server ignoring the offset). An entry without a usable
 * API name or data space is skipped with a warning; a repeated entry is listed once.
 * @param {Connection} connection Authenticated command-owned connection.
 * @param {string} version Admitted numeric native version.
 * @param {'dlo' | 'dmo'} family Inventory family.
 * @param {string} [requestScope] Local response-space filter; omission lists the default space.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted names in the selected space.
 */
export async function listNativeNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  family: 'dlo' | 'dmo',
  requestScope?: string,
  warnings?: string[],
): Promise<string[]> {
  const client = new ConnectClient(connection, version);
  const key = family === 'dmo' ? 'dataModelObject' : 'dataLakeObjects';
  const resource = family === 'dmo' ? 'data-model-objects' : 'data-lake-objects';
  const limit = family === 'dmo' ? 50 : 20;
  const pattern = family === 'dmo' ? mappingDmoName : mappingDloName;
  const seen = new Set<string>();
  const names: string[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = await client.get<unknown>(
      `/services/data/v${version}/ssot/${resource}?limit=${limit}&offset=${offset}&orderBy=ASC`,
    );
    if (!page || typeof page !== 'object' || Array.isArray(page))
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    const wrapper = page as Record<string, unknown>;
    const entries: unknown = wrapper[key];
    if (!Array.isArray(entries)) throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    let added = 0;
    for (const [index, value] of entries.entries()) {
      const item = entryObject(value);
      const name = typeof item.name === 'string' ? item.name : undefined;
      const named = name !== undefined && pattern.test(name);
      const spaces = entrySpaces(item, family);
      if (!named || spaces.length === 0) {
        warnings?.push(
          `${family} inventory: skipped ${entryLabel(name, offset + index)} because it has no usable ${named ? 'data space' : 'API name'}.`,
        );
        continue;
      }
      const identity = name.toLowerCase();
      if (seen.has(identity)) continue;
      seen.add(identity);
      added++;
      if (spaces.includes(requestScope ?? 'default')) names.push(name);
    }
    const total =
      typeof wrapper.totalSize === 'number' &&
      Number.isSafeInteger(wrapper.totalSize) &&
      wrapper.totalSize >= 0
        ? wrapper.totalSize
        : undefined;
    // Salesforce may return fewer entries than a page's offset range; totalSize decides.
    const more =
      total === undefined
        ? added > 0 &&
          ((typeof wrapper.nextPageUrl === 'string' && wrapper.nextPageUrl !== '') ||
            entries.length >= limit)
        : offset + limit < total;
    if (!more) break;
  }
  names.sort();
  return names;
}

/** What a mapping listing reports besides the names. */
export type MappingListingReport = {
  /** Receives one warning per skipped listing entry. */
  warnings?: string[];
  /** Receives a DMO whose mapping list could not be read; without it, that failure is thrown. */
  failure?: (dmo: string, error: unknown) => void;
};

/**
 * Collect the names of the mappings of every selected-space DMO; each mapping is read and checked
 * on its own later. A filtered no-map 404 means the DMO has none. Extra envelope keys are
 * ignored. An entry without a usable name, or of another data space, is skipped with a warning;
 * a name listed under several DMOs is kept once.
 * @param {string[]} dmos Selected-space DMO inventory.
 * @param {Pick<MappingClient, 'list'>} client Filtered mapping reader.
 * @param {string} [requestScope] Explicit request context; omission uses the default space.
 * @param {MappingListingReport} [report] Warnings and per-DMO failures.
 * @returns {Promise<string[]>} Unique sorted mapping names.
 */
export async function listNativeMappingNames(
  dmos: string[],
  client: Pick<MappingClient, 'list'>,
  requestScope?: string,
  report: MappingListingReport = {},
): Promise<string[]> {
  const mappings = new Map<string, string>();
  const space = requestScope ?? 'default';
  const fail = (dmo: string, error: unknown): void => {
    if (!report.failure) throw error;
    report.failure(dmo, error);
  };
  for (const dmo of dmos) {
    let response: unknown;
    try {
      response = await client.list(dmo);
    } catch (error) {
      if (!(
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      ))
        fail(dmo, error);
      continue;
    }
    const entries: unknown = entryObject(response).objectSourceTargetMaps;
    if (!Array.isArray(entries)) {
      fail(dmo, new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED'));
      continue;
    }
    for (const [index, value] of entries.entries()) {
      const item = entryObject(value);
      const name = typeof item.developerName === 'string' ? item.developerName : undefined;
      if (name === undefined || !nativeMappingName.test(name)) {
        report.warnings?.push(
          `mapping inventory of ${dmo}: skipped ${entryLabel(name, index)} because it has no usable API name.`,
        );
        continue;
      }
      if (item.dataSpaceName !== undefined && item.dataSpaceName !== space) {
        report.warnings?.push(
          `mapping inventory of ${dmo}: skipped "${name}" because it belongs to another data space.`,
        );
        continue;
      }
      const identity = name.toLowerCase();
      if (!mappings.has(identity)) mappings.set(identity, name);
    }
  }
  const names = [...mappings.values()];
  names.sort();
  return names;
}
