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
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import type { ConnectDiagnostic } from './connect-diagnostic.js';
import { validateCalculatedInsightDocument } from '../artifacts/calculated-insight-document.js';
import type { Connection } from '@salesforce/core';
import { validateSegmentDocument } from '../artifacts/segment-document.js';
import type { ApiVersionSelection } from './api-version.js';

export type TransportErrorCode = 'INVALID_REQUEST' | 'AUTHENTICATION_FAILED' | 'REQUEST_FAILED';

/** An intentionally payload-free diagnostic safe for JSON and console output. */
export class ConnectError extends Error {
  public constructor(
    public readonly code: TransportErrorCode,
    public readonly statusCode?: number,
    public readonly nativeCode?: 'ITEM_NOT_FOUND',
  ) {
    super(
      code === 'AUTHENTICATION_FAILED'
        ? 'Salesforce authentication failed.'
        : 'Data360 request failed.',
    );
    this.name = 'ConnectError';
  }
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
   * Read a single SSOT response. Does not infer pagination or retry a failed call.
   * @template T
   * @param {string} path Root-relative SSOT path or same-origin absolute URL, with optional query.
   * @returns {Promise<T>} The unmodified resource response; callers must validate its schema.
   */
  public async get<T = unknown>(path: string): Promise<T> {
    return this.read<T>(path);
  }

  /**
   * Create one native API68 Segment without refresh, redirect or replay.
   * @param {unknown} value Complete admitted portable definition.
   * @returns {Promise<unknown>} Untrusted acknowledgement, not settlement.
   */
  public async createSegment(value: unknown): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    const document = validateSegmentDocument(value);
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}segments`),
        body: JSON.stringify({
          developerName: document.identity.apiName,
          displayName: document.spec.displayName,
          description: document.spec.description,
          segmentOnApiName: document.spec.segmentOn.apiName,
          segmentType: 'Dbt',
          includeDbt: { models: { models: document.spec.models } },
          publishSchedule: 'NoRefresh',
        }),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * PATCH only a validated complete DBT definition on the selected API65/API68 Segment route.
   * Neither schedule field nor lookback is writable through this boundary.
   * @param {unknown} value Complete independently admitted desired Segment document.
   * @returns {Promise<unknown>} Untrusted single-attempt response, never settlement evidence.
   */
  public async patchSegment(value: unknown): Promise<unknown> {
    if (!['65.0', '68.0'].includes(this.selection.requested))
      throw new ConnectError('INVALID_REQUEST');
    const document = validateSegmentDocument(value);
    return this.send(
      {
        method: 'PATCH',
        url: this.safeUrl(`${this.prefix}segments/${document.identity.apiName}`),
        body: JSON.stringify({
          displayName: document.spec.displayName,
          description: document.spec.description,
          segmentOnApiName: document.spec.segmentOn.apiName,
          segmentType: 'Dbt',
          includeDbt: { models: { models: document.spec.models } },
        }),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Send one expression-only PATCH to the fixed API65 CI resource, without replay.
   * @param {unknown} value Complete qualified desired document; service owns delta admission.
   * @returns {Promise<unknown>} Untrusted echo, never settlement evidence.
   */
  public async patchCalculatedInsight(value: unknown): Promise<unknown> {
    if (this.selection.requested !== '65.0') throw new ConnectError('INVALID_REQUEST');
    const document = validateCalculatedInsightDocument(value);
    return this.send(
      {
        method: 'PATCH',
        url: this.safeUrl(`${this.prefix}calculated-insights/${document.identity.apiName}`),
        body: JSON.stringify({ expression: document.spec.expression }),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Create exactly one native68 IR owner without refresh, replay or redirect.
   * @param {unknown} value Complete independently admitted portable definition.
   * @returns {Promise<unknown>} Untrusted response, never settlement evidence.
   */
  public async createIdentityResolution(value: unknown): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}identity-resolutions`),
        body: JSON.stringify(buildNativeIdentityResolutionCreate(value)),
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * PATCH the complete preserved input shape on one exact native68 owner; never run processing.
   * @param {unknown} value Complete independently admitted desired definition.
   * @returns {Promise<unknown>} Untrusted response, never settlement evidence.
   */
  public async patchIdentityResolution(value: unknown): Promise<unknown> {
    if (this.selection.requested !== '68.0') throw new ConnectError('INVALID_REQUEST');
    const document = nativeIdentityResolutionDocument(value);
    return this.send(
      {
        method: 'PATCH',
        url: this.safeUrl(`${this.prefix}identity-resolutions/${document.identity.apiName}`),
        body: JSON.stringify(buildNativeIdentityResolutionUpdate(document)),
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
        request,
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
      const nativeCode =
        typeof request === 'object' &&
        request.method === 'GET' &&
        statusCode === 404 &&
        !expired &&
        nativeError?.name === 'ITEM_NOT_FOUND' &&
        nativeError.errorCode === 'ITEM_NOT_FOUND' &&
        !!data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data).length === 2 &&
        'errorCode' in data &&
        data.errorCode === 'ITEM_NOT_FOUND' &&
        'message' in data &&
        typeof data.message === 'string'
          ? 'ITEM_NOT_FOUND'
          : undefined;
      throw retainConnectDiagnostic(
        new ConnectError(
          statusCode === 401 || expired ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED',
          statusCode,
          nativeCode,
        ),
        diagnostic ??
          apiDiagnostic(statusCode, diagnosticDataProperty(error, 'data')) ??
          connectDiagnostic(statusCode),
      );
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
