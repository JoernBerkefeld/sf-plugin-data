import type { Connection } from '@salesforce/core';
import {
  CalculatedInsightError,
  calculatedInsightName,
  observeNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';

/**
 * Read one calculated insight by name with the API 68 GET and project it to the file form.
 * Read only; whatever the GET returns is retrieved (any status, schedule or SQL).
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
  if (!calculatedInsightName.test(apiName)) throw new CalculatedInsightError('INVALID_SELECTION');
  let raw: unknown;
  try {
    raw = await client.get(apiName);
  } catch (error) {
    if (
      error instanceof ConnectError &&
      error.statusCode === 404 &&
      error.nativeCode === 'ITEM_NOT_FOUND'
    )
      throw new CalculatedInsightError('CI_NOT_FOUND');
    throw retainConnectDiagnostic(
      new CalculatedInsightError('CI_RUNTIME_UNKNOWN'),
      getConnectDiagnostic(error),
    );
  }
  const document = observeNativeCalculatedInsight(raw);
  if (document.apiName !== apiName || document.dataSpace !== dataSpace)
    throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
  return document;
}

/**
 * Every calculated insight the API 68 list returns in the data space, following its offset
 * paging up to `total`. A malformed page or a repeated name stops the listing.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated connection.
 * @param {string} dataSpace Selected data space.
 * @returns {Promise<string[]>} Sorted API names.
 */
export async function listCalculatedInsightNames(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  dataSpace: string,
): Promise<string[]> {
  const client = new ConnectClient(connection, '68.0');
  const names = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 200; page++) {
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
    for (const item of collection.items as unknown[]) {
      const apiName = (item as { apiName?: unknown } | undefined)?.apiName;
      if (typeof apiName !== 'string' || !calculatedInsightName.test(apiName) || names.has(apiName))
        throw new CalculatedInsightError('CI_ACQUISITION_FAILED');
      names.add(apiName);
    }
    offset += collection.items.length;
    if (collection.items.length === 0 || offset >= collection.total)
      // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array.
      return [...names].sort();
  }
  throw new CalculatedInsightError('CI_ACQUISITION_FAILED');
}
