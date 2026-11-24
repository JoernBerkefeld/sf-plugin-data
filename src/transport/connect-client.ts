import { Org } from '@salesforce/core';
import {
  buildNativeIdentityResolutionCreate,
  buildNativeIdentityResolutionUpdate,
  nativeIdentityResolutionDocument,
} from '../services/preflight-identity-resolution-deploy.js';
import {
  apiDiagnostic,
  connectDiagnostic,
  diagnosticDataProperty,
  diagnosticRequestId,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import type { ConnectDiagnostic } from './connect-diagnostic.js';
import type { Connection } from '@salesforce/core';
import { segmentWriteBody, validateSegmentDocument } from '../artifacts/segment-document.js';
import type { ApiVersionSelection } from './api-version.js';

export type TransportErrorCode = 'INVALID_REQUEST' | 'AUTHENTICATION_FAILED' | 'REQUEST_FAILED';

/** Native 404 codes that name an item as absent or deleted, read from a single REST error. */
const nativeAbsenceCodes = ['ITEM_NOT_FOUND', 'ENTITY_IS_DELETED'] as const;
export type NativeAbsenceCode = (typeof nativeAbsenceCodes)[number];

/**
 * The request header that makes Connect REST answer in plain text. By default it HTML-escapes
 * every string of a response (`<>"'\&` read as `&lt; &gt; &quot; &#39; &#92; &amp;`) while it
 * stores what a write sends as is, so a retrieved label, description, formula or SQL would not be
 * what Salesforce holds (live API 68: data transforms, DLOs, data streams, calculated insights,
 * segments; DB entry data360:connect-rest-entity-encoding-header-api68).
 */
export const plainTextHeaders: Readonly<Record<string, string>> = Object.freeze({
  'X-Chatter-Entity-Encoding': 'false',
});

/**
 * The request with {@link plainTextHeaders} when it goes to a Data 360 (`/ssot/`) route; any
 * other request as it is. Only `/ssot/` routes get the header: a Data 360 read on any other
 * route still returns HTML-escaped text.
 * @param {Parameters<Connection['request']>[0]} request Request as built.
 * @returns {Parameters<Connection['request']>[0]} Request to send.
 */
export function plainTextRequest(
  request: Parameters<Connection['request']>[0],
): Parameters<Connection['request']>[0] {
  const object = typeof request === 'string' ? { method: 'GET' as const, url: request } : request;
  if (!/\/services\/data\/[^/?#]+\/ssot\//u.test(String(object.url))) return request;
  return { ...object, headers: { ...object.headers, ...plainTextHeaders } };
}

/** An intentionally payload-free diagnostic safe for JSON and console output. */
export class ConnectError extends Error {
  public constructor(
    public readonly code: TransportErrorCode,
    public readonly statusCode?: number,
    public readonly nativeCode?: NativeAbsenceCode,
  ) {
    super(
      code === 'AUTHENTICATION_FAILED'
        ? 'Salesforce authentication failed.'
        : 'Data360 request failed.',
    );
    this.name = 'ConnectError';
  }
}

/**
 * Bounded retry of in-process requests. GETs retry after network errors and HTTP 429/503;
 * writes retry only when the request provably never reached Salesforce. `sleep` and `warn`
 * are replaceable (tests, commands); `warn` defaults to one stderr line so JSON stdout stays clean.
 * A Connection with its own sink (setRetryWarn) does not use `warn`.
 */
export const connectRetry = {
  attempts: 3,
  delaysMs: [1000, 2000],
  maxRetryAfterMs: 60_000,
  sleep: async (milliseconds: number): Promise<void> => {
    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },
  warn: (message: string): void => {
    process.stderr.write(`Warning: ${message}\n`);
  },
};

/** Retry warning sinks per Connection; a client without one uses `connectRetry.warn`. */
const retryWarnings = new WeakMap<object, (message: string) => void>();

/**
 * Set where the retry warnings of every ConnectClient over this Connection go (a library run
 * passes a no-op); other Connections keep `connectRetry.warn`.
 * @param {object} connection Connection the clients are built on (or a prototype of it).
 * @param {(message: string) => void} warn Sink for one warning line.
 */
export function setRetryWarn(connection: object, warn: (message: string) => void): void {
  retryWarnings.set(connection, warn);
}

/**
 * Send one retry warning to the sink of a Connection (or of a receiver derived from it with
 * Object.create), else to `connectRetry.warn`.
 * @param {object} connection Connection of a client.
 * @param {string} message Warning line.
 */
function retryWarn(connection: object, message: string): void {
  let current: object | null = connection;
  while (current && !retryWarnings.has(current)) current = Object.getPrototypeOf(current);
  (current ? retryWarnings.get(current)! : connectRetry.warn)(message);
}

// Codes raised before a connection exists: the request never reached Salesforce.
const unsentCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN']);
const readRetryCodes = new Set([...unsentCodes, 'ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED']);
const networkCodes = new WeakMap<object, string>();

/**
 * Find a Node network error code on the error or its first two causes.
 * @param {unknown} error Raw transport failure.
 * @returns {string | undefined} A known retry candidate code.
 */
function networkCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = diagnosticDataProperty(current, 'code');
    if (typeof code === 'string' && readRetryCodes.has(code)) return code;
    current = diagnosticDataProperty(current, 'cause');
  }
  return undefined;
}

/**
 * Decide whether and how long to wait before the next attempt.
 * @param {string} method HTTP method.
 * @param {number} attempt One-based number of the failed attempt.
 * @param {unknown} error The failure thrown by that attempt.
 * @returns {{ wait: number; reason: string } | undefined} Wait in ms, or undefined to give up.
 */
function retryPlan(
  method: string,
  attempt: number,
  error: unknown,
): { wait: number; reason: string } | undefined {
  if (attempt >= connectRetry.attempts || !error || typeof error !== 'object') return;
  const backoff = connectRetry.delaysMs[Math.min(attempt, connectRetry.delaysMs.length) - 1] ?? 0;
  const code = networkCodes.get(error);
  if (code) {
    if (method !== 'GET' && !unsentCodes.has(code)) return;
    return { wait: backoff, reason: code };
  }
  const diagnostic = getConnectDiagnostic(error);
  if (method !== 'GET' || !diagnostic || diagnostic.kind === 'api-error') return;
  let wait = backoff;
  if (diagnostic.retryAfter !== undefined) {
    wait = /^\d+$/u.test(diagnostic.retryAfter)
      ? Number(diagnostic.retryAfter) * 1000
      : Math.max(0, Date.parse(diagnostic.retryAfter) - Date.now());
    wait = Math.min(wait, connectRetry.maxRetryAfterMs);
  }
  return { wait, reason: `HTTP ${diagnostic.statusCode}` };
}

type AuthenticatedConnection = Pick<Connection, 'instanceUrl' | 'request'>;
type ObservableTransport = {
  httpRequest: (
    request: unknown,
    options: unknown,
  ) => Promise<{ statusCode?: unknown; headers?: unknown; body?: unknown }> & {
    stream: () => unknown;
  };
};

/** Bounded SSOT transport; Salesforce core owns credentials. */
export class ConnectClient {
  private readonly origin: string;
  private readonly prefix: string;
  private readonly selection: ApiVersionSelection;

  public constructor(
    private readonly connection: AuthenticatedConnection,
    selection: ApiVersionSelection | string,
  ) {
    // Numeric compatibility is normalized immediately; bare latest needs resolved SOAP evidence.
    const candidate =
      typeof selection === 'string'
        ? { requested: selection, restSelector: `v${selection}`, soapNumeric: selection }
        : selection;
    if (
      !candidate ||
      typeof candidate.soapNumeric !== 'string' ||
      !/^\d{2,3}\.0$/u.test(candidate.soapNumeric) ||
      !(
        (candidate.requested === 'latest' && candidate.restSelector === 'latest') ||
        (candidate.requested === candidate.soapNumeric &&
          candidate.restSelector === `v${candidate.soapNumeric}`)
      )
    )
      throw new ConnectError('INVALID_REQUEST');
    this.selection = Object.freeze({
      requested: candidate.requested,
      restSelector: candidate.restSelector,
      soapNumeric: candidate.soapNumeric,
    });
    try {
      const instance = new URL(connection.instanceUrl);
      if (
        instance.protocol !== 'https:' ||
        instance.username ||
        instance.password ||
        instance.pathname !== '/' ||
        instance.search ||
        instance.hash
      )
        throw new Error('Invalid origin');
      this.origin = instance.origin;
    } catch {
      throw new ConnectError('INVALID_REQUEST');
    }
    this.prefix = `/services/data/${this.selection.restSelector}/ssot/`;
  }

  /**
   * Load existing Salesforce CLI authentication without exposing token fields.
   * @param {string} aliasOrUsername Explicit existing org alias or username.
   * @param {string} apiVersion Explicit version; endpoint support is checked by future adapters.
   * @returns {Promise<ConnectClient>} An authenticated client, without making a resource request.
   */
  public static async create(aliasOrUsername: string, apiVersion: string): Promise<ConnectClient> {
    if (!aliasOrUsername.trim() || !/^\d{2,3}\.0$/u.test(apiVersion)) {
      throw new ConnectError('INVALID_REQUEST');
    }
    try {
      const org = await Org.create({ aliasOrUsername });
      return new ConnectClient(org.getConnection(apiVersion), apiVersion);
    } catch {
      throw new ConnectError('AUTHENTICATION_FAILED');
    }
  }

  /**
   * Read a single SSOT response. Does not infer pagination; see `connectRetry` for the bounded retry.
   * @template T
   * @param {string} path Root-relative SSOT path or same-origin absolute URL, with optional query.
   * @returns {Promise<T>} The unmodified resource response; callers must validate its schema.
   */
  public async get<T = unknown>(path: string): Promise<T> {
    return this.read<T>(path);
  }

  /**
   * Create one native API68 Segment in the data space of the file (`?dataspace=`), without
   * redirect or replay. The definition goes as written (`segmentWriteBody`); without a schedule in
   * the file it does not refresh.
   * @param {unknown} value Complete admitted portable definition.
   * @param {ReadonlyMap<string, string>} [children] Waterfall child API name to target definition ID.
   * @returns {Promise<unknown>} Untrusted acknowledgement, not settlement.
   */
  public async createSegment(
    value: unknown,
    children?: ReadonlyMap<string, string>,
  ): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    const document = validateSegmentDocument(value);
    return this.send(
      {
        method: 'POST',
        // The create names the data space of the file (live API 68: in a non-default data space
        // Salesforce stores the segment as <prefix>_<Name>, and keeps a name that has it already).
        url: this.safeUrl(
          `${this.prefix}segments?dataspace=${encodeURIComponent(document.c__dataSpace)}`,
        ),
        body: JSON.stringify(segmentWriteBody(document, true, false, children)),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * PATCH the full authored definition on the native API68 Segment route; the schedule keys go
   * along only when `schedule` is set (the schedule of the file differs from the org's).
   * @param {unknown} value Complete independently admitted desired Segment document.
   * @param {boolean} [schedule] Whether to send the schedule of the file.
   * @param {ReadonlyMap<string, string>} [children] Waterfall child API name to target definition ID.
   * @returns {Promise<unknown>} Untrusted single-attempt response, never settlement evidence.
   */
  public async patchSegment(
    value: unknown,
    schedule = false,
    children?: ReadonlyMap<string, string>,
  ): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    const document = validateSegmentDocument(value);
    return this.send(
      {
        method: 'PATCH',
        url: this.safeUrl(`${this.prefix}segments/${document.identity.apiName}`),
        body: JSON.stringify(segmentWriteBody(document, false, schedule, children)),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Create exactly one native68 IR owner without refresh, replay or redirect.
   * @param {unknown} value Complete independently admitted portable definition.
   * @param {string} [dataSpacePrefix] Prefix of the ruleset's data space; required outside default.
   * @returns {Promise<unknown>} Untrusted response, never settlement evidence.
   */
  public async createIdentityResolution(
    value: unknown,
    dataSpacePrefix?: string,
  ): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}identity-resolutions`),
        body: JSON.stringify(buildNativeIdentityResolutionCreate(value, dataSpacePrefix)),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * PATCH the complete preserved input shape on one exact native68 owner; never run processing.
   * @param {unknown} value Complete independently admitted desired definition.
   * @param {unknown} [current] Current target definition; lists it has and the file empties are sent empty.
   * @returns {Promise<unknown>} Untrusted response, never settlement evidence.
   */
  public async patchIdentityResolution(value: unknown, current?: unknown): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    const document = nativeIdentityResolutionDocument(value);
    return this.send(
      {
        method: 'PATCH',
        url: this.safeUrl(`${this.prefix}identity-resolutions/${document.identity.apiName}`),
        body: JSON.stringify(buildNativeIdentityResolutionUpdate(document, current)),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Delete exactly one native68 owner by its freshly resolved Salesforce record ID.
   * No name routing, refresh, replay, redirect or arbitrary DELETE path is exposed.
   * @param {string} id Independently bound target-local IR record ID.
   * @returns {Promise<void>} Acknowledged HTTP204 only, never owner absence proof.
   */
  public async deleteIdentityResolution(id: string): Promise<void> {
    if (
      this.selection.requested !== '68.0' ||
      typeof id !== 'string' ||
      !/^1ir[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(id)
    )
      throw new ConnectError('INVALID_REQUEST');
    const noContent = Symbol('identity-resolution-deleted');
    const response = await this.send<unknown>(
      { method: 'DELETE', url: this.safeUrl(`${this.prefix}identity-resolutions/${id}`) },
      this.noRefreshReceiver(),
      noContent,
    );
    if (response !== noContent) throw new ConnectError('REQUEST_FAILED');
  }

  /**
   * Delete one exact native68 Segment by API name, without replay or redirect.
   * @param {string} apiName Freshly matched target API name.
   * @returns {Promise<void>} HTTP204 acknowledgement, not independent absence proof.
   */
  public async deleteSegment(apiName: string): Promise<void> {
    if (this.selection.requested !== '68.0' || !/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(apiName))
      throw new ConnectError('INVALID_REQUEST');
    const noContent = Symbol('segment-deleted');
    const response = await this.send<unknown>(
      { method: 'DELETE', url: this.safeUrl(`${this.prefix}segments/${apiName}`) },
      this.noRefreshReceiver(),
      noContent,
    );
    if (response !== noContent) throw new ConnectError('REQUEST_FAILED');
  }

  /**
   * Publish one native API68 Segment by its record ID: one POST without a body, never resent
   * after a reset, timeout, 429 or 503 (only a request that provably never left is repeated).
   * @param {string} marketSegmentId Freshly read `1sg` record ID of the segment.
   * @returns {Promise<unknown>} Untrusted acknowledgement (publishStatus, jobId), not the result.
   */
  public async publishSegment(marketSegmentId: string): Promise<unknown> {
    if (
      this.selection.requested !== '68.0' ||
      typeof marketSegmentId !== 'string' ||
      !/^1sg[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(marketSegmentId)
    )
      throw new ConnectError('INVALID_REQUEST');
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}segments/${marketSegmentId}/actions/publish`),
        // JSforce never sends a POST whose body is undefined (the request hangs unsent);
        // an empty string goes out as Content-Length 0, the bodiless POST the route expects.
        body: '',
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Run one read-only SOQL query (the core `/query` route, outside SSOT) over the command's own
   * connection, without refresh or redirect; the first page only. Callers check `done`.
   * @param {string} query SOQL built only from validated identifiers and static text.
   * @returns {Promise<unknown>} Untrusted query response.
   */
  public async soql(query: string): Promise<unknown> {
    if (this.selection.restSelector === 'latest' || typeof query !== 'string' || !query.trim())
      throw new ConnectError('INVALID_REQUEST');
    return this.send(
      {
        method: 'GET',
        url: `${this.origin}/services/data/${this.selection.restSelector}/query?q=${encodeURIComponent(query)}`,
      },
      this.noRefreshReceiver(),
    );
  }

  protected noRefreshReceiver(): AuthenticatedConnection {
    const receiver = Object.create(this.connection) as AuthenticatedConnection;
    Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
    return receiver;
  }

  private async read<T>(path: string, noContentResponse?: unknown): Promise<T> {
    return this.send<T>(
      { method: 'GET', url: this.safeUrl(path) },
      this.noRefreshReceiver(),
      noContentResponse,
    );
  }

  protected async send<T>(
    request: Parameters<Connection['request']>[0],
    receiver: AuthenticatedConnection,
    noContentResponse?: unknown,
  ): Promise<T> {
    const method =
      typeof request === 'object' ? String(request.method ?? 'GET').toUpperCase() : 'GET';
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.sendOnce<T>(request, receiver, noContentResponse);
      } catch (error: unknown) {
        const plan = retryPlan(method, attempt, error);
        if (!plan) throw error;
        const url = typeof request === 'object' ? request.url : request;
        const route = typeof url === 'string' ? url.split('?')[0].replace(this.origin, '') : '';
        retryWarn(
          this.connection,
          `${method} ${route} failed (${plan.reason}); retrying in ${Math.ceil(plan.wait / 1000)} s (attempt ${attempt + 1} of ${connectRetry.attempts}).`,
        );
        await connectRetry.sleep(plan.wait);
      }
    }
  }

  private async sendOnce<T>(
    request: Parameters<Connection['request']>[0],
    receiver: AuthenticatedConnection,
    noContentResponse?: unknown,
  ): Promise<T> {
    let responseStatus: number | undefined;
    let diagnostic: ConnectDiagnostic | undefined;
    const transport =
      '_transport' in receiver
        ? (receiver._transport as ObservableTransport | undefined)
        : undefined;
    // Observe this request before JSforce discards numeric wire error status and headers.
    const observer =
      transport && typeof transport.httpRequest === 'function'
        ? {
            httpRequest: (input: unknown, options: unknown) => {
              const pending = transport.httpRequest.call(transport, input, options);
              const observed = pending.then((response) => {
                const status = response?.statusCode;
                const headers = diagnosticDataProperty(response, 'headers');
                diagnostic = apiDiagnostic(
                  status,
                  diagnosticDataProperty(response, 'body'),
                  headers,
                  diagnosticRequestId(headers),
                );
                if (
                  typeof status === 'number' &&
                  Number.isInteger(status) &&
                  status >= 400 &&
                  status <= 599
                )
                  responseStatus = status;
                return response;
              });
              return Object.assign(observed, { stream: () => pending.stream() });
            },
          }
        : undefined;
    try {
      return await receiver.request<T>(
        plainTextRequest(request),
        // Core narrows options to JSON, but JSforce supports request-local transport/redirect guards.
        {
          ...(observer ? { transport: observer } : {}),
          noContentResponse,
          retry: { maxRetries: 0, methods: [] },
          followRedirect: () => {
            throw new ConnectError('INVALID_REQUEST');
          },
        } as unknown as Parameters<Connection['request']>[1],
      );
    } catch (error: unknown) {
      if (error instanceof ConnectError) throw error;
      const status =
        error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      const statusCode =
        typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : responseStatus;
      const expired =
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'INVALID_SESSION_ID';
      // Core preserves the parsed single REST error in data. Never infer absence from
      // HTTP status, message text, raw JSON strings or a mixed/malformed error envelope.
      const nativeError = error as { name?: unknown; errorCode?: unknown; data?: unknown };
      const data = nativeError?.data;
      // A GET or DELETE may answer 404 ENTITY_IS_DELETED while an item is being deleted (live
      // API 68, calculated insight); callers decide whether that code means absent.
      const absence = nativeAbsenceCodes.find((value) => value === nativeError?.errorCode);
      const nativeCode =
        typeof request === 'object' &&
        (request.method === 'GET' || request.method === 'DELETE') &&
        statusCode === 404 &&
        !expired &&
        absence !== undefined &&
        nativeError?.name === absence &&
        !!data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data).length === 2 &&
        'errorCode' in data &&
        data.errorCode === absence &&
        'message' in data &&
        typeof data.message === 'string'
          ? absence
          : undefined;
      const code = statusCode === undefined && !expired ? networkCode(error) : undefined;
      const failure = retainConnectDiagnostic(
        new ConnectError(
          statusCode === 401 || expired ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED',
          statusCode,
          nativeCode,
        ),
        diagnostic ??
          apiDiagnostic(statusCode, diagnosticDataProperty(error, 'data')) ??
          connectDiagnostic(statusCode),
      );
      if (code) networkCodes.set(failure, code);
      throw failure;
    }
  }

  protected safeUrl(path: string): string {
    // Reject normalization ambiguities before URL parsing, including nested encodings.
    if (/[\\\s#\p{Cc}]/u.test(path) || /%(?:2e|2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(path)) {
      throw new ConnectError('INVALID_REQUEST');
    }
    try {
      const url = new URL(path, this.origin);
      const rawPath = path.startsWith('https://') ? path.slice(path.indexOf('/', 8)) : path;
      if (!(path.startsWith('/') && !path.startsWith('//')) && !path.startsWith(`${this.origin}/`))
        throw new Error('Invalid URL');
      if (
        url.origin !== this.origin ||
        url.username ||
        url.password ||
        !url.pathname.startsWith(this.prefix) ||
        url.pathname === this.prefix ||
        rawPath
          .split('?')[0]
          .split('/')
          .some((part) => part === '.' || part === '..') ||
        url.pathname.includes('//')
      )
        throw new Error('Invalid path');
      return url.href;
    } catch {
      throw new ConnectError('INVALID_REQUEST');
    }
  }
}
