import type { Connection } from '@salesforce/core';
import { ConnectClient } from '../transport/connect-client.js';
import { readInOrder } from './bounded-reads.js';
import { explainInput } from './operation-diagnostic.js';
import type { SettledRead } from './bounded-reads.js';
import type { MappingClient } from '../transport/mapping-rest.js';
import {
  NativeMappingError,
  mappingDloName,
  mappingDmoName,
  nativeMappingName,
} from '../artifacts/native-mapping-document.js';

// Listing pages in flight at once (the one being read and those fetched ahead of it).
const pageReads = 4;

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
 * Whether a listing entry can stand in for its item GET. Live on API68 every DLO list entry, and
 * every DMO list entry, equalled its item GET byte for byte (the DLO item GET wraps it in a
 * one-element `dataLakeObjects` array), except that a few standard DMOs list their fields in
 * varying order in both reads; see DB entry data360:a2.retrieve-speed.api68. An entry without the
 * field list the item GET carries is not that shape, so its object is read on its own.
 * @param {'dlo' | 'dmo'} family Inventory family.
 * @param {Record<string, unknown>} item Listing entry.
 * @returns {boolean} The entry is the item GET's object.
 */
export function listedEntryReplacesGet(
  family: 'dlo' | 'dmo',
  item: Record<string, unknown>,
): boolean {
  return family === 'dlo'
    ? Array.isArray(item.dataLakeFieldInfoRepresentation) && Array.isArray(item.fields)
    : Array.isArray(item.fields);
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
 * API name is skipped with a warning; a repeated entry is listed once. Both lists hold every data
 * space whatever `?dataspace=` says, so each entry is kept by its own data space. A DLO entry
 * without a usable data space is skipped with a warning. A DMO entry without one stops the
 * listing (NATIVE_INVENTORY_UNCONFIRMED): every DMO entry read live names its `dataSpaceName`
 * (default ones too), so one without it is not a shape the plugin knows, and skipping it could
 * leave out a DMO of the run's space.
 * @param {Connection} connection Authenticated command-owned connection.
 * @param {string} version Admitted numeric native version.
 * @param {'dlo' | 'dmo'} family Inventory family.
 * @param {string} requestScope The run's data space; entries of other spaces are left out.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @param {Map<string, unknown>} [listed] Receives each listed name's entry, when the entry is
 * proven to equal its item GET (see listedEntryReplacesGet).
 * @returns {Promise<string[]>} Sorted names in the selected space.
 */
export async function listNativeNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  family: 'dlo' | 'dmo',
  requestScope: string,
  warnings?: string[],
  listed?: Map<string, unknown>,
): Promise<string[]> {
  const client = new ConnectClient(connection, version);
  const key = family === 'dmo' ? 'dataModelObject' : 'dataLakeObjects';
  const resource = family === 'dmo' ? 'data-model-objects' : 'data-lake-objects';
  const limit = family === 'dmo' ? 50 : 20;
  const pattern = family === 'dmo' ? mappingDmoName : mappingDloName;
  const seen = new Set<string>();
  const names: string[] = [];
  // Pages fetched ahead of the one being read, by offset (below totalSize when it is known).
  // A page fetched past the end is never read; the pages are used in order as before.
  const ahead = new Map<number, Promise<SettledRead<unknown>>>();
  const fetchPage = async (offset: number): Promise<unknown> =>
    client.get<unknown>(
      `/services/data/v${version}/ssot/${resource}?limit=${limit}&offset=${offset}&orderBy=ASC`,
    );
  const prefetch = (from: number, total = Number.POSITIVE_INFINITY): void => {
    for (let offset = from; offset < total && offset < from + pageReads * limit; offset += limit)
      if (!ahead.has(offset))
        ahead.set(
          offset,
          fetchPage(offset).then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          ),
        );
  };
  for (let offset = 0; ; offset += limit) {
    const early = ahead.get(offset);
    ahead.delete(offset);
    let page: unknown;
    if (early) {
      const settled = await early;
      if ('error' in settled) throw settled.error;
      page = settled.value;
    } else page = await fetchPage(offset);
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
      if (named && spaces.length === 0 && family === 'dmo')
        throw explainInput(
          new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED'),
          `The DMO list entry "${name}" names no data space (dataSpaceName), so the plugin cannot tell whether it belongs to the data space ${requestScope}; nothing was retrieved from the DMO list.`,
        );
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
      if (!spaces.includes(requestScope)) continue;
      names.push(name);
      if (listed && listedEntryReplacesGet(family, item)) listed.set(name, value);
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
    // The next pages are read in parallel; they are still used in order.
    prefetch(offset + limit, total);
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
  /**
   * Receives each listed mapping's entry by name. A mapping list entry is its item GET byte for
   * byte (live API 68, 143 of 143 mappings), so the retrieve answers the GET with it.
   */
  listed?: Map<string, unknown>;
};

/** Mapping lists (one per DMO) read at once; results are still used in DMO order. */
export const mappingListReads = 6;

/**
 * Collect the names of the mappings of every selected-space DMO; each mapping is read and checked
 * on its own later. A filtered no-map 404 means the DMO has none. Extra envelope keys are
 * ignored. An entry without a usable name, or of another data space, is skipped with a warning;
 * a name listed under several DMOs is kept once.
 * @param {string[]} dmos Selected-space DMO inventory.
 * @param {Pick<MappingClient, 'list'>} client Filtered mapping reader.
 * @param {string} requestScope The run's data space.
 * @param {MappingListingReport} [report] Warnings and per-DMO failures.
 * @returns {Promise<string[]>} Unique sorted mapping names.
 */
export async function listNativeMappingNames(
  dmos: string[],
  client: Pick<MappingClient, 'list'>,
  requestScope: string,
  report: MappingListingReport = {},
): Promise<string[]> {
  const mappings = new Map<string, string>();
  const space = requestScope;
  let stopped = false;
  const fail = (dmo: string, error: unknown): void => {
    if (!report.failure) {
      stopped = true;
      throw error;
    }
    report.failure(dmo, error);
  };
  // Up to mappingListReads DMOs are listed at once; names, warnings and failures follow the DMO
  // order. Retries (429, 503, network) stay per request in the transport.
  const reads = readInOrder(dmos, mappingListReads, async (dmo) => {
    if (stopped) throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    return client.list(dmo);
  });
  for (const [index, dmo] of dmos.entries()) {
    const read = await reads[index];
    if ('error' in read) {
      const { error } = read;
      if (!(
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      ))
        fail(dmo, error);
      continue;
    }
    const response = read.value;
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
      if (mappings.has(identity)) continue;
      mappings.set(identity, name);
      if (Array.isArray(item.fieldMappings)) report.listed?.set(name, value);
    }
  }
  const names = [...mappings.values()];
  names.sort();
  return names;
}
