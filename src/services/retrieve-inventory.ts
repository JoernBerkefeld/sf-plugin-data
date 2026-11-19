import type { Connection } from '@salesforce/core';
import { dataTransformName } from '../artifacts/data-transform-document.js';
import { NativeMappingError } from '../artifacts/native-mapping-document.js';
import { ConnectClient } from '../transport/connect-client.js';

/** Stream and graph API names, as their exact selectors accept them. */
const componentName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

/** How one family's list route answers. */
type InventoryRoute = {
  /** Family named in a skip warning. */
  family: string;
  /** The list URL of a page; the offset is ignored by an unpaged route. */
  url: (offset: number) => string;
  /** Requested page size; undefined for a route that answers everything at once. */
  pageSize?: number;
  /** Envelope key holding the entries. */
  key: string;
  /** Entry key holding the API name. */
  nameKey: string;
  pattern: RegExp;
  /** The data spaces an entry names; none named leaves the decision to the item's own read. */
  spaces: (entry: Record<string, unknown>) => string[];
  /** The run's data space: an entry that names spaces must name it. */
  dataSpace: string;
};

/**
 * Every API name a list route returns, following its `limit`/`offset` paging until `totalSize`
 * (or, without it, a short or empty page). Extra envelope keys are ignored; a malformed answer
 * stops the listing (NATIVE_INVENTORY_UNCONFIRMED). An entry without a usable API name is skipped
 * with a warning, an entry that names only other data spaces is left out and a repeated name is
 * listed once. A page that adds no new name ends the listing (a server ignoring the offset).
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string} version Numeric API version of the reads.
 * @param {InventoryRoute} route The family's list route.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted API names.
 */
async function listNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  route: InventoryRoute,
  warnings?: string[],
): Promise<string[]> {
  const client = new ConnectClient(connection, version);
  const seen = new Set<string>();
  const names: string[] = [];
  for (let offset = 0; ;) {
    const page = await client.get<unknown>(route.url(offset));
    const entries = (page as Record<string, unknown> | undefined)?.[route.key];
    if (!page || typeof page !== 'object' || !Array.isArray(entries))
      throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
    let named = 0;
    let added = 0;
    for (const [index, entry] of (entries as unknown[]).entries()) {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const value = item[route.nameKey];
      const apiName = typeof value === 'string' ? value : undefined;
      if (apiName === undefined || !route.pattern.test(apiName)) {
        warnings?.push(
          `${route.family} inventory: skipped ${apiName === undefined ? `the entry at position ${offset + index}` : `"${apiName}"`} because it has no usable API name.`,
        );
        continue;
      }
      named++;
      if (seen.has(apiName)) continue;
      seen.add(apiName);
      added++;
      const spaces = route.spaces(item);
      if (spaces.length === 0 || spaces.includes(route.dataSpace)) names.push(apiName);
    }
    if (route.pageSize === undefined) break;
    offset += entries.length;
    const total = (page as { totalSize?: unknown }).totalSize;
    const more =
      typeof total === 'number' && Number.isSafeInteger(total)
        ? offset < total
        : entries.length >= route.pageSize;
    if (entries.length === 0 || !more || (named > 0 && added === 0)) break;
  }
  names.sort();
  return names;
}

/**
 * A string, or nothing.
 * @param {unknown} value Any value.
 * @returns {string[]} The non-empty string alone, else empty.
 */
const named = (value: unknown): string[] => (typeof value === 'string' && value ? [value] : []);

/**
 * Every data stream `GET /ssot/data-streams` lists (`limit` 1 to 200, `offset`), kept unless its
 * DLO names only other data spaces than the run's.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string} version Numeric API version.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @param {string} [dataSpace] The run's data space.
 * @returns {Promise<string[]>} Sorted stream API names.
 */
export async function listDataStreamNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  version: string,
  warnings?: string[],
  dataSpace = 'default',
): Promise<string[]> {
  return listNames(
    connection,
    version,
    {
      family: 'data-stream',
      url: (offset) => `/services/data/v${version}/ssot/data-streams?limit=200&offset=${offset}`,
      pageSize: 200,
      key: 'dataStreams',
      nameKey: 'name',
      pattern: componentName,
      dataSpace,
      spaces: (entry) => {
        const info = (entry.dataLakeObjectInfo as { dataSpaceInfo?: unknown } | undefined)
          ?.dataSpaceInfo;
        return Array.isArray(info)
          ? info.flatMap((space) => named((space as { name?: unknown } | undefined)?.name))
          : [];
      },
    },
    warnings,
  );
}

/**
 * Every data transform `GET /ssot/data-transforms` lists (pages of at most 20, `offset`), kept
 * unless it names another data space.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted transform names.
 */
export async function listDataTransformNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  warnings?: string[],
): Promise<string[]> {
  return listNames(
    connection,
    '68.0',
    {
      family: 'data-transform',
      url: (offset) => `/services/data/v68.0/ssot/data-transforms?limit=20&offset=${offset}`,
      pageSize: 20,
      key: 'dataTransforms',
      nameKey: 'name',
      pattern: dataTransformName,
      dataSpace: 'default',
      spaces: (entry) => named(entry.dataSpaceName),
    },
    warnings,
  );
}

/**
 * Every default-space data graph `GET /ssot/data-graphs/metadata` lists; the route has no paging.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted graph developer names.
 */
export async function listDataGraphNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  warnings?: string[],
): Promise<string[]> {
  return listNames(
    connection,
    '68.0',
    {
      family: 'data-graph',
      url: () => '/services/data/v68.0/ssot/data-graphs/metadata?dataspace=default',
      key: 'dataGraphMetadata',
      nameKey: 'developerName',
      pattern: componentName,
      dataSpace: 'default',
      spaces: (entry) => named(entry.dataspaceName),
    },
    warnings,
  );
}
