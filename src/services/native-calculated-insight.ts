import type { Connection } from '@salesforce/core';
import {
  CalculatedInsightError,
  calculatedInsightName,
  observeNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';

export type CalculatedInsightConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion'
>;

/** API 68 GET of one insight in one data space; `check` refuses a changed connection. */
export type CalculatedInsightReadContext = {
  dataSpace: string;
  check: () => void;
  get: (apiName: string) => Promise<unknown>;
};

/**
 * Read context on one API 68 connection. `check` refuses a connection whose version or
 * instance changed since, so every read and write of one item goes to the same org.
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {string} dataSpace Selected data space ('default').
 * @returns {CalculatedInsightReadContext} Read context.
 */
export function calculatedInsightReadContext(
  connection: CalculatedInsightConnection,
  dataSpace: string,
): CalculatedInsightReadContext {
  const origin = connection.instanceUrl;
  const check = (): void => {
    if (connection.getApiVersion() !== '68.0' || connection.instanceUrl !== origin)
      throw new CalculatedInsightError('INVALID_CI_SCOPE');
  };
  check();
  const client = createCalculatedInsightClient(connection, '68.0', dataSpace);
  return { dataSpace, check, get: async (apiName) => client.get(apiName) };
}

export type CalculatedInsightAcquisition =
  { state: 'absent' } | { state: 'present'; status: string; document: NativeCalculatedInsight };

/**
 * Read one insight by name: HTTP 404 ITEM_NOT_FOUND is absent, any other failure throws
 * (CI_RUNTIME_UNKNOWN with the Salesforce diagnostic). A present insight must answer with the
 * selected name and data space (CI_IDENTITY_CHANGED otherwise): every write and the DELETE go
 * by name, so they must address exactly the insight that was read.
 * @param {Pick<CalculatedInsightReadContext, 'dataSpace' | 'get'>} context Read context.
 * @param {string} apiName Exact name ending in __cio.
 * @returns {Promise<CalculatedInsightAcquisition>} Absent, or the status and file form.
 */
export async function acquireCalculatedInsight(
  context: Pick<CalculatedInsightReadContext, 'dataSpace' | 'get'>,
  apiName: string,
): Promise<CalculatedInsightAcquisition> {
  if (!calculatedInsightName.test(apiName)) throw new CalculatedInsightError('INVALID_SELECTION');
  let raw: unknown;
  try {
    raw = await context.get(apiName);
  } catch (error) {
    if (
      error instanceof ConnectError &&
      error.statusCode === 404 &&
      error.nativeCode === 'ITEM_NOT_FOUND'
    )
      return { state: 'absent' };
    throw retainConnectDiagnostic(
      new CalculatedInsightError('CI_RUNTIME_UNKNOWN'),
      getConnectDiagnostic(error),
    );
  }
  const document = observeNativeCalculatedInsight(raw);
  if (document.apiName !== apiName || document.dataSpace !== context.dataSpace)
    throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
  const status = (raw as { calculatedInsightStatus?: unknown }).calculatedInsightStatus;
  return { state: 'present', status: typeof status === 'string' ? status : 'UNKNOWN', document };
}

/** What the API 68 GET returns as `expression` for an unpublished Visual Builder draft. */
export const visualDraftPlaceholder =
  'SQL expression will be available when you publish the insight';

/**
 * Read one calculated insight by name with the API 68 GET and project it to the file form.
 * Read only; any status, schedule or SQL is projected, except a Visual Builder draft, whose
 * GET carries a placeholder instead of SQL (`CI_VISUAL_DRAFT_WITHOUT_SQL`), and an insight
 * without SQL (`INVALID_CI_DOCUMENT`). The retrieve command writes those two as returned
 * (verbatim, with the code as reason), and deploy refuses such a file.
 * @param {Pick<CalculatedInsightClient, 'get'>} client API 68 default-space client.
 * @param {string} apiName Exact name ending in __cio.
 * @param {string} dataSpace Selected data space.
 * @returns {Promise<NativeCalculatedInsight>} Document with the SQL as plain text.
 */
export async function retrieveNativeCalculatedInsight(
  client: Pick<CalculatedInsightClient, 'get'>,
  apiName: string,
  dataSpace: string,
): Promise<NativeCalculatedInsight> {
  const acquired = await acquireCalculatedInsight(
    { dataSpace, get: async (name) => client.get(name) },
    apiName,
  );
  if (acquired.state === 'absent') throw new CalculatedInsightError('CI_NOT_FOUND');
  // A Visual Builder draft reads this sentence instead of SQL until it is published; the
  // retrieve command writes it verbatim with this code as the reason.
  if (acquired.document.expression.trim() === visualDraftPlaceholder)
    throw new CalculatedInsightError('CI_VISUAL_DRAFT_WITHOUT_SQL');
  return acquired.document;
}

/**
 * Every calculated insight the API 68 list returns in the data space, following its offset
 * paging until `total` or an empty page. A malformed page stops the listing; an entry without a
 * usable API name is skipped with a warning and a repeated name is listed once. A page that adds
 * no new name ends the listing (a server ignoring the offset).
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string} dataSpace Selected data space.
 * @param {string[]} [warnings] Receives one warning per skipped entry.
 * @returns {Promise<string[]>} Sorted API names.
 */
export async function listCalculatedInsightNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  dataSpace: string,
  warnings?: string[],
): Promise<string[]> {
  const client = new ConnectClient(connection, '68.0');
  const names = new Set<string>();
  let offset = 0;
  for (;;) {
    const response = await client.get<unknown>(
      `/services/data/v68.0/ssot/calculated-insights?dataspace=${encodeURIComponent(dataSpace)}&batchSize=25&offset=${offset}`,
    );
    const collection = (response as { collection?: unknown } | undefined)?.collection as
      { items?: unknown; total?: unknown } | undefined;
    if (
      !collection ||
      typeof collection !== 'object' ||
      !Array.isArray(collection.items) ||
      typeof collection.total !== 'number' ||
      !Number.isSafeInteger(collection.total)
    )
      throw new CalculatedInsightError('CI_ACQUISITION_FAILED');
    const before = names.size;
    for (const [index, item] of (collection.items as unknown[]).entries()) {
      const apiName = (item as { apiName?: unknown } | undefined)?.apiName;
      if (typeof apiName !== 'string' || !calculatedInsightName.test(apiName)) {
        warnings?.push(
          `calculated-insight inventory: skipped ${typeof apiName === 'string' ? `"${apiName}"` : `the entry at position ${offset + index}`} because it has no usable API name.`,
        );
        continue;
      }
      names.add(apiName);
    }
    offset += collection.items.length;
    if (collection.items.length === 0 || offset >= collection.total || names.size === before)
      // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array.
      return [...names].sort();
  }
}
