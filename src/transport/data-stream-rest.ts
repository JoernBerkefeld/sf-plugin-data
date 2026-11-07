import { randomUUID } from 'node:crypto';
import { apiReceiptDiagnostic, retainConnectDiagnostic } from './connect-diagnostic.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DataStreamError,
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
} from '../artifacts/data-stream-document.js';
import { dataStreamApiVersion } from './api-version.js';
import { ConnectClient, ConnectError } from './connect-client.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';

export type DataStreamClient = {
  get: (nameOrId: string) => Promise<unknown>;
  list: (connectionName: string) => Promise<Array<Record<string, unknown>>>;
  create: (document: unknown) => Promise<unknown>;
  update: (recordId: string, document: unknown) => Promise<unknown>;
  delete: (recordId: string, deleteDlo: boolean) => Promise<void>;
};
const name = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const id = /^[A-Za-z0-9]{18}$/u;
const readId = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u;

/** Genuine native HTTP failure, without response text or credentials. */
export class DataStreamHttpError extends DataStreamError {
  public constructor(
    code: string,
    public readonly status?: number,
  ) {
    super(code);
  }
}

/**
 * Construct bounded stream transport. Writes are single attempts, not lifecycle authorization.
 * @param {string} targetOrg Existing CLI org alias.
 * @param {ConnectClient} reader Authenticated native GET transport.
 * @param {string} apiVersion Initial qualified pin only.
 * @param {MetadataRunner} runner Installed CLI runner with real --include receipts.
 * @returns {DataStreamClient} Internal operations; no command wiring.
 */
export function createDataStreamClient(
  targetOrg: string,
  reader: Pick<ConnectClient, 'get'>,
  apiVersion = 'auto',
  runner: MetadataRunner = runProjectMetadata,
): DataStreamClient {
  const version = dataStreamApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-streams`;
  if (!targetOrg || targetOrg.startsWith('-') || /[\p{Cc}]/u.test(targetOrg))
    throw new DataStreamError('INVALID_STREAM_ORG');

  /**
   * Resolve a safe pagination offset; response echoes may omit filters, never change them.
   * @param {unknown} value Server URL.
   * @param {string} connectionName Selected connection.
   * @param {boolean} continuation Require complete filters on a URL that would be followed.
   * @returns {number} Bounded integer offset.
   */
  function pageOffset(value: unknown, connectionName: string, continuation: boolean): number {
    if (typeof value !== 'string' || /[\\\s#%]/u.test(value) || !value.startsWith(`${endpoint}?`))
      throw new DataStreamError('INVALID_STREAM_PAGE');
    const url = new URL(value, 'https://pagination.invalid');
    const keys = [...url.searchParams.keys()];
    if (
      new Set(keys).size !== keys.length ||
      keys.some((key) => !['connectionName', 'includeMappings', 'limit', 'offset'].includes(key)) ||
      url.searchParams.get('limit') !== '200' ||
      (url.searchParams.has('connectionName') &&
        url.searchParams.get('connectionName') !== connectionName) ||
      (url.searchParams.has('includeMappings') &&
        url.searchParams.get('includeMappings') !== 'true') ||
      (continuation &&
        (url.searchParams.get('connectionName') !== connectionName ||
          url.searchParams.get('includeMappings') !== 'true'))
    )
      throw new DataStreamError('INVALID_STREAM_PAGE');
    const offset = url.searchParams.get('offset');
    if (!offset || !/^(?:0|[1-9]\d*)$/u.test(offset) || Number(offset) > 2000)
      throw new DataStreamError('INVALID_STREAM_PAGE');
    return Number(offset);
  }

  /**
   * Read a complete selected-connection inventory; never return partial evidence.
   * @param {string} connectionName Exact developer name.
   * @returns {Promise<Array<Record<string, unknown>>>} Detached raw stream inventory.
   */
  async function list(connectionName: string): Promise<Array<Record<string, unknown>>> {
    if (!name.test(connectionName)) throw new DataStreamError('INVALID_STREAM_CONNECTION');
    const entries: Array<Record<string, unknown>> = [];
    const identities = new Set<string>();
    const recordIds = new Set<string>();
    const offsets = new Set<number>();
    let offset = 0;
    let total: number | undefined;
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      if (offsets.has(offset)) throw new DataStreamError('INCOMPLETE_STREAM_LIST');
      offsets.add(offset);
      const value = await reader.get<unknown>(
        `${endpoint}?connectionName=${connectionName}&includeMappings=true&limit=200&offset=${offset}`,
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new DataStreamError('INVALID_STREAM_PAGE');
      const page = value as Record<string, unknown>;
      if (
        Object.keys(page).some(
          (key) => !['currentPageUrl', 'nextPageUrl', 'totalSize', 'dataStreams'].includes(key),
        ) ||
        !Array.isArray(page.dataStreams) ||
        page.dataStreams.length > 200 ||
        !Number.isSafeInteger(page.totalSize) ||
        (page.totalSize as number) < 0 ||
        (total !== undefined && total !== page.totalSize)
      )
        throw new DataStreamError('INVALID_STREAM_PAGE');
      total = page.totalSize as number;
      const echoed = pageOffset(page.currentPageUrl, connectionName, false);
      // Observed first-page offset is 1 for request offset 0. Do not follow that echo.
      if (echoed !== offset && !(offset === 0 && echoed === 1))
        throw new DataStreamError('INVALID_STREAM_PAGE');
      for (const value of page.dataStreams) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new DataStreamError('INVALID_STREAM_PAGE');
        const item = value as Record<string, unknown>;
        if (
          typeof item.name !== 'string' ||
          !name.test(item.name) ||
          typeof item.recordId !== 'string' ||
          !id.test(item.recordId) ||
          item.dataSource !== connectionName
        )
          throw new DataStreamError('INVALID_STREAM_PAGE');
        if (identities.has(item.name.toLowerCase()) || recordIds.has(item.recordId))
          throw new DataStreamError('INCOMPLETE_STREAM_LIST');
        identities.add(item.name.toLowerCase());
        recordIds.add(item.recordId);
        entries.push(structuredClone(item));
      }
      if (entries.length > total) throw new DataStreamError('INCOMPLETE_STREAM_LIST');
      if (entries.length === total) {
        if (page.nextPageUrl != undefined && page.nextPageUrl !== '')
          throw new DataStreamError('INCOMPLETE_STREAM_LIST');
        return entries;
      }
      if (page.dataStreams.length === 0) throw new DataStreamError('INCOMPLETE_STREAM_LIST');
      const next = pageOffset(page.nextPageUrl, connectionName, true);
      if (next !== offset + 200) throw new DataStreamError('INCOMPLETE_STREAM_LIST');
      offset = next;
    }
    throw new DataStreamError('INCOMPLETE_STREAM_LIST');
  }

  /**
   * Send a native mutation once with actual HTTP status evidence; retain owned scratch.
   * @param {string} method Qualified HTTP verb.
   * @param {string} suffix Checked target/query suffix.
   * @param {unknown} body Serialized operation-specific body, absent for DELETE.
   * @returns {Promise<unknown>} Untrusted echo or undefined, never settlement proof.
   */
  async function send(method: string, suffix: string, body?: unknown): Promise<unknown> {
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-native-stream-'));
    await writeFile(
      path.join(root, 'ownership.json'),
      JSON.stringify({ marker: randomUUID(), files: ['request.json'] }),
      { flag: 'wx' },
    );
    const file = path.join(root, 'request.json');
    const arguments_ = ['api', 'request', 'rest'];
    if (method === 'DELETE') {
      // plugin-api requires raw mode; omitting raw yields undefined, not a JSON request body.
      await writeFile(
        file,
        JSON.stringify({ url: endpoint + suffix, method, body: { mode: 'raw' } }),
        { flag: 'wx' },
      );
      arguments_.push('--file', file);
    } else {
      await writeFile(file, JSON.stringify(body), { flag: 'wx' });
      arguments_.push(
        endpoint + suffix,
        '--method',
        method,
        '--body',
        `@${file}`,
        '--header',
        'Content-Type:application/json',
      );
    }
    let receipt: Awaited<ReturnType<MetadataRunner>>;
    try {
      receipt = await runner([...arguments_, '--target-org', targetOrg, '--include'], root);
    } catch {
      throw new DataStreamHttpError('STREAM_REQUEST_UNCONFIRMED');
    }
    const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt.stdout);
    if (!match) throw new DataStreamHttpError('STREAM_REQUEST_UNCONFIRMED');
    const status = Number(match[1]);
    const payload = receipt.stdout
      .slice(match[0].length)
      .replace(/^(?:[^\r\n]+:[^\r\n]*\r?\n|\r?\n)*/u, '')
      .trim();
    if (status < 200 || status >= 300)
      throw retainConnectDiagnostic(
        new DataStreamHttpError('STREAM_HTTP_ERROR', status),
        apiReceiptDiagnostic(receipt.stdout),
      );
    if (
      receipt.exitCode !== 0 ||
      status !== (method === 'POST' ? 201 : method === 'PATCH' ? 200 : 204)
    )
      throw new DataStreamHttpError('STREAM_REQUEST_UNCONFIRMED', status);
    if (method === 'DELETE') {
      if (payload) throw new DataStreamHttpError('STREAM_DELETE_UNCONFIRMED', status);
      return;
    }
    try {
      const result: unknown = JSON.parse(payload);
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new Error('Invalid stream response');
      return result;
    } catch {
      throw new DataStreamHttpError('INVALID_STREAM_RESPONSE', status);
    }
  }
  return {
    get: async (nameOrId) => {
      if (!name.test(nameOrId) && !readId.test(nameOrId))
        throw new DataStreamError('INVALID_STREAM_NAME');
      try {
        return await reader.get(`${endpoint}/${nameOrId}?includeMappings=true`);
      } catch (error) {
        if (error instanceof ConnectError)
          throw new DataStreamHttpError(error.code, error.statusCode);
        throw new DataStreamHttpError('STREAM_REQUEST_UNCONFIRMED');
      }
    },
    list,
    create: async (document) => send('POST', '', buildDataStreamCreateBody(document)),
    update: async (recordId, document) => {
      if (!id.test(recordId)) throw new DataStreamError('INVALID_STREAM_TARGET_ID');
      return send('PATCH', `/${recordId}`, buildDataStreamPatchBody(document));
    },
    delete: async (recordId, deleteDlo) => {
      if (!id.test(recordId) || typeof deleteDlo !== 'boolean')
        throw new DataStreamError('INVALID_STREAM_TARGET_ID');
      await send('DELETE', `/${recordId}?shouldDeleteDataLakeObject=${String(deleteDlo)}`);
    },
  };
}
