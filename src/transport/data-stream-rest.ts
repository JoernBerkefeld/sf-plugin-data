import {
  displayableApiText,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import { replaceExplanation } from '../services/operation-diagnostic.js';
import {
  DataStreamError,
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
  crmDataStreamWriteBody,
  isCrmDataStreamDocument,
  validateCrmDataStreamDocument,
} from '../artifacts/data-stream-document.js';
import { dataStreamApiVersion } from './api-version.js';
import { ConnectClient, ConnectError } from './connect-client.js';
import { openBoundSsot } from './bound-ssot.js';
import type { BoundSsot } from './bound-ssot.js';

export type DataStreamClient = {
  get: (nameOrId: string) => Promise<unknown>;
  list: (connectionName: string) => Promise<Array<Record<string, unknown>>>;
  /** Ingestion API streams with formulas also send the event's typed source fields. */
  create: (
    document: unknown,
    sourceFields?: ReadonlyArray<{ name: string; dataType: string }>,
  ) => Promise<unknown>;
  update: (recordId: string, document: unknown) => Promise<unknown>;
  /** One PATCH with a prepared body: `datastreamType` plus the changed parts. */
  patch: (recordId: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (recordId: string, deleteDlo: boolean) => Promise<void>;
  /**
   * Set the stream label with one Metadata API `updateMetadata` of its DataStreamDefinition (the
   * record read first, `masterLabel` replaced) on the bound Connection; never resent. Salesforce
   * ignores a label in a stream PATCH. Absent without a bound Metadata API. `send` wraps only the
   * update (a caller's write ledger); the read before it is not a write.
   */
  relabel?: (
    apiName: string,
    label: string,
    send?: (write: () => Promise<void>) => Promise<void>,
  ) => Promise<void>;
};

/** Metadata API type of a data stream; its record name is the stream name. */
export const streamMetadataType = 'DataStreamDefinition';
type JsonObject = Record<string, unknown>;
/** Native connection and dependency reads a stream binding/delete decision depends on. */
export type DataStreamReferenceReader = {
  connections: {
    /** One page of IngestApi connections (200 per page) from the offset, 0 by default. */
    list: (offset?: number) => Promise<JsonObject>;
    get: (connectionId: string) => Promise<JsonObject>;
    schema: (connectionId: string) => Promise<JsonObject>;
  };
  dependencies: {
    stream: (recordIdOrName: string) => Promise<JsonObject>;
    dlo: (recordIdOrName: string) => Promise<JsonObject>;
  };
};
const name = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const developerName = /^[A-Za-z][A-Za-z0-9_]*$/u;
const id = /^[A-Za-z0-9]{18}$/u;
const readId = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u;

/**
 * Admit an exact connection record ID as one encoded path segment.
 * @param {string} value Candidate 15/18-character ID.
 * @returns {string} Connection resource path.
 */
function connectionPath(value: string): string {
  if (typeof value !== 'string' || !readId.test(value)) throw new ConnectError('INVALID_REQUEST');
  return `connections/${encodeURIComponent(value)}`;
}

/**
 * Admit an exact developer name or record ID as one encoded dependency path segment.
 * @param {string} value Candidate identity.
 * @returns {string} Dependency resource suffix.
 */
function dependencyPath(value: string): string {
  if (typeof value !== 'string' || (!developerName.test(value) && !readId.test(value)))
    throw new ConnectError('INVALID_REQUEST');
  return `${encodeURIComponent(value)}/dependencies`;
}

/**
 * Construct native connection/dependency readers. Family admission validates bodies and decides.
 * @param {ConnectClient} reader Authenticated native GET transport.
 * @param {string} apiVersion Qualified stream pin (API68 only).
 * @returns {DataStreamReferenceReader} Read-only native routes.
 */
export function createDataStreamReferenceReader(
  reader: Pick<ConnectClient, 'get'>,
  apiVersion = 'auto',
): DataStreamReferenceReader {
  const root = `/services/data/v${dataStreamApiVersion(apiVersion)}/ssot`;
  const read = async (path: string): Promise<JsonObject> => {
    const value = await reader.get<unknown>(`${root}/${path}`);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ConnectError('REQUEST_FAILED');
    const resource = value as JsonObject;
    if (
      Object.keys(resource).length === 0 ||
      ['error', 'errors', 'errorCode', 'body', 'result'].some((key) =>
        Object.hasOwn(resource, key),
      ) ||
      (Object.hasOwn(resource, 'success') && resource.success !== true)
    )
      throw new ConnectError('REQUEST_FAILED');
    return resource;
  };
  return {
    connections: {
      list: async (offset = 0) =>
        read(`connections?connectorType=IngestApi&limit=200&offset=${offset}`),
      get: async (connectionId) => read(connectionPath(connectionId)),
      schema: async (connectionId) => read(`${connectionPath(connectionId)}/schema`),
    },
    dependencies: {
      stream: async (identity) => read(`data-streams/${dependencyPath(identity)}`),
      dlo: async (identity) => read(`data-lake-objects/${dependencyPath(identity)}`),
    },
  };
}

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
 * Construct bounded stream transport. Writes go over the bound in-process connection and are
 * never resent once they may have reached Salesforce; they are not lifecycle authorization.
 * @param {string} targetOrg Existing CLI org alias.
 * @param {ConnectClient} reader Authenticated native GET transport.
 * @param {string} apiVersion Initial qualified pin only.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @returns {DataStreamClient} Internal operations; no command wiring.
 */
export function createDataStreamClient(
  targetOrg: string,
  reader: Pick<ConnectClient, 'get'>,
  apiVersion = 'auto',
  sender?: BoundSsot,
): DataStreamClient {
  const version = dataStreamApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-streams`;
  if (!targetOrg || targetOrg.startsWith('-') || /[\p{Cc}]/u.test(targetOrg))
    throw new DataStreamError('INVALID_STREAM_ORG');
  const bound = sender ?? openBoundSsot(targetOrg, version);

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
   * Send one native mutation on the bound connection. It is never resent once it may have
   * reached Salesforce, and never after a token refresh; the caller's read-back decides.
   * @param {'POST' | 'PATCH' | 'DELETE'} method Qualified HTTP verb.
   * @param {string} suffix Checked target/query suffix.
   * @param {unknown} [body] Operation-specific body, absent for DELETE.
   * @returns {Promise<unknown>} Untrusted echo or undefined, never settlement proof.
   */
  async function send(
    method: 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: unknown,
  ): Promise<unknown> {
    const noContent = Symbol('stream-no-content');
    let response: unknown;
    try {
      response = await bound.request(method, endpoint + suffix, noContent, body);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      const status = error.code === 'AUTHENTICATION_FAILED' ? 401 : error.statusCode;
      throw retainConnectDiagnostic(
        new DataStreamHttpError(
          status === undefined ? 'STREAM_REQUEST_UNCONFIRMED' : 'STREAM_HTTP_ERROR',
          status,
        ),
        getConnectDiagnostic(error),
      );
    }
    if (method === 'DELETE') {
      if (response !== noContent) throw new DataStreamHttpError('STREAM_DELETE_UNCONFIRMED');
      return;
    }
    if (response === noContent) throw new DataStreamHttpError('STREAM_REQUEST_UNCONFIRMED', 204);
    if (!response || typeof response !== 'object' || Array.isArray(response))
      throw new DataStreamHttpError('INVALID_STREAM_RESPONSE');
    return response;
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
    create: async (document, sourceFields) =>
      send(
        'POST',
        '',
        isCrmDataStreamDocument(document)
          ? crmDataStreamWriteBody(validateCrmDataStreamDocument(document).spec)
          : buildDataStreamCreateBody(document, sourceFields),
      ),
    update: async (recordId, document) => {
      if (!id.test(recordId)) throw new DataStreamError('INVALID_STREAM_TARGET_ID');
      return send('PATCH', `/${recordId}`, buildDataStreamPatchBody(document));
    },
    patch: async (recordId, body) => {
      if (!id.test(recordId)) throw new DataStreamError('INVALID_STREAM_TARGET_ID');
      if (!body || typeof body !== 'object' || Array.isArray(body) || !body.datastreamType)
        throw new DataStreamError('EMPTY_STREAM_PATCH');
      return send('PATCH', `/${recordId}`, body);
    },
    delete: async (recordId, deleteDlo) => {
      if (!id.test(recordId) || typeof deleteDlo !== 'boolean')
        throw new DataStreamError('INVALID_STREAM_TARGET_ID');
      await send('DELETE', `/${recordId}?shouldDeleteDataLakeObject=${String(deleteDlo)}`);
    },
    ...(bound.metadata ? { relabel: relabelCall(bound.metadata) } : {}),
  };
}

/**
 * Salesforce's refusal of a stream label update: nothing was changed. Texts pass the display
 * filter of REST errors; a text that does not pass is left out.
 * @param {string} apiName Stream name.
 * @param {Array<{code?: unknown; message?: unknown}>} problems Salesforce's answers.
 * @returns {DataStreamError} STREAM_LABEL_UPDATE_REJECTED with an explanation.
 */
function labelRefusal(
  apiName: string,
  problems: Array<{ code?: unknown; message?: unknown }>,
): DataStreamError {
  const said = problems
    .slice(0, 3)
    .map(({ code, message }) =>
      [
        typeof code === 'string' && /^[\w:.-]{1,80}$/u.test(code) ? code : undefined,
        displayableApiText(message),
      ]
        .filter(Boolean)
        .join(': '),
    )
    .filter(Boolean);
  const error = new DataStreamError('STREAM_LABEL_UPDATE_REJECTED');
  replaceExplanation(
    error,
    `Salesforce refused the Metadata API update of the ${streamMetadataType} ${apiName}${said.length > 0 ? `: ${said.join('; ').replace(/\.$/u, '')}` : ' without a text the plugin can show'}. The label was not changed.`,
  );
  return error;
}

/**
 * A Metadata API answer as a list of records.
 * @param {unknown} value One record or several.
 * @returns {unknown[]} Records.
 */
function metadataRecords(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Whether a Metadata API value is an explicit nil (`xsi:nil`), which a write must not send back.
 * @param {unknown} value Record value.
 * @returns {boolean} Explicit nil.
 */
function metadataNil(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const attributes = (value as Record<string, unknown>).$;
  return (
    !!attributes &&
    typeof attributes === 'object' &&
    (attributes as Record<string, unknown>)['xsi:nil'] === 'true'
  );
}

/** SOAP faults where Salesforce refused the request itself, so nothing was applied. */
const clientFault =
  /^(?:soapenv:Client|sf:(?:INVALID_\w+|MALFORMED_\w+|REQUEST_LIMIT_EXCEEDED|INSUFFICIENT_ACCESS|API_DISABLED_FOR_ORG|UNSUPPORTED_API_VERSION))$/u;

/**
 * The stream label update on the bound Connection: read the DataStreamDefinition, replace its
 * label, send one `updateMetadata`. Salesforce decides; its refusal is reported with its text.
 * @param {Function} open The bound sender's Metadata API.
 * @returns {Function} relabel(apiName, label, send).
 */
function relabelCall(
  open: NonNullable<BoundSsot['metadata']>,
): NonNullable<DataStreamClient['relabel']> {
  return async (apiName, label, send = async (write) => write()) => {
    if (!name.test(apiName) || typeof label !== 'string' || label === '')
      throw new DataStreamError('INVALID_STREAM_NAME');
    const api = await open();
    let current: Record<string, unknown> | undefined;
    try {
      current = metadataRecords(await api.read(streamMetadataType, [apiName])).find(
        (entry): entry is Record<string, unknown> =>
          !!entry &&
          typeof entry === 'object' &&
          (entry as Record<string, unknown>).fullName === apiName,
      );
    } catch {
      // Only a read failed: nothing was written.
      const error = new DataStreamError('STREAM_LABEL_READ_FAILED');
      replaceExplanation(
        error,
        `The Metadata API read of the ${streamMetadataType} ${apiName} before its label update failed, so the update was not sent.`,
      );
      throw error;
    }
    if (!current) throw labelRefusal(apiName, []);
    const record = {
      ...Object.fromEntries(Object.entries(current).filter(([, value]) => !metadataNil(value))),
      masterLabel: label,
    };
    await send(async () => {
      let answer: unknown;
      try {
        answer = await api.update(streamMetadataType, record);
      } catch (error) {
        // Only a client fault is Salesforce refusing the request; a server fault (soapenv:Server,
        // sf:UNKNOWN_EXCEPTION) may follow an applied update, so it stays unconfirmed.
        const fault = error as { name?: unknown; message?: unknown } | null;
        if (typeof fault?.name === 'string' && clientFault.test(fault.name))
          throw labelRefusal(apiName, [{ code: fault.name, message: fault.message }]);
        throw new DataStreamError('STREAM_REQUEST_UNCONFIRMED');
      }
      const [result] = metadataRecords(answer) as Array<Record<string, unknown> | undefined>;
      if (result?.success === true) return;
      if (result?.success === false)
        throw labelRefusal(
          apiName,
          metadataRecords(result.errors).map((entry) => {
            const problem = (entry ?? {}) as Record<string, unknown>;
            return { code: problem.statusCode, message: problem.message };
          }),
        );
      throw new DataStreamError('STREAM_REQUEST_UNCONFIRMED');
    });
  };
}
