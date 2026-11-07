import { Org } from '@salesforce/core';
import {
  buildNativeIdentityResolutionCreate,
  buildNativeIdentityResolutionUpdate,
  nativeIdentityResolutionDocument,
} from '../services/preflight-identity-resolution-deploy.js';
import { connectDiagnostic, retainConnectDiagnostic } from './connect-diagnostic.js';
import type { ConnectDiagnostic } from './connect-diagnostic.js';
import { validateCalculatedInsightDocument } from '../artifacts/calculated-insight-document.js';
import type { Connection } from '@salesforce/core';
import { buildDmoCreateRequestFromDocument } from '../artifacts/dmo-document.js';
import type { DmoUpdatePatch } from '../artifacts/dmo-update-delta.js';
import { validateSegmentDocument } from '../artifacts/segment-document.js';
import type { ApiVersionSelection } from './api-version.js';

export type TransportErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'REQUEST_FAILED'
  | 'INVALID_PAGE'
  | 'INCOMPLETE_LIST';

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
  ) => Promise<{ statusCode?: unknown; headers?: unknown }> & { stream: () => unknown };
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
   * Create one validated authored DMO at the fixed API65 endpoint, without retry or redirect.
   * A per-call receiver masks JSforce's refresh delegate (which otherwise replays POST on 401).
   * Never mutates the supplied connection or exposes a generic write route.
   * @param {unknown} document Independently validated authored-only default-space document.
   * @returns {Promise<unknown>} Untrusted response, never proof of successful creation.
   */
  public async createDataModelObject(document: unknown): Promise<unknown> {
    if (this.selection.requested !== '65.0') throw new ConnectError('INVALID_REQUEST');
    const body = JSON.stringify(buildDmoCreateRequestFromDocument(document, 'default'));
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}data-model-objects`),
        body,
        headers: { 'content-type': 'application/json' },
      },
      this.noRefreshReceiver(),
    );
  }

  /**
   * Send one PATCH to an exact API65 DMO route without refresh, retry or redirect.
   * Callers must qualify the patch and authorize execution independently; this is transport only.
   * @param {string} dataModelObjectName Exact qualified DMO API name.
   * @param {DmoUpdatePatch} patch Caller-qualified update payload, not validated here.
   * @returns {Promise<unknown>} Untrusted response, never proof of a successful update.
   */
  public async patchDataModelObject(
    dataModelObjectName: string,
    patch: DmoUpdatePatch,
  ): Promise<unknown> {
    if (
      this.selection.requested !== '65.0' ||
      !/^[A-Za-z][A-Za-z0-9_]*__dlm$/u.test(dataModelObjectName)
    )
      throw new ConnectError('INVALID_REQUEST');
    try {
      return await this.send(
        {
          method: 'PATCH',
          url: this.safeUrl(`${this.prefix}data-model-objects/${dataModelObjectName}`),
          body: JSON.stringify(patch),
          headers: { 'content-type': 'application/json' },
        },
        this.noRefreshReceiver(),
      );
    } catch (error: unknown) {
      if (error instanceof ConnectError) throw error;
      throw new ConnectError('INVALID_REQUEST');
    }
  }

  /**
   * PATCH only a validated complete DBT definition on the fixed API65 Segment route.
   * Neither schedule field nor lookback is writable through this boundary.
   * @param {unknown} value Complete independently admitted desired Segment document.
   * @returns {Promise<unknown>} Untrusted single-attempt response, never settlement evidence.
   */
  public async patchSegment(value: unknown): Promise<unknown> {
    if (this.selection.requested !== '65.0') throw new ConnectError('INVALID_REQUEST');
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
                diagnostic = connectDiagnostic(status, response?.headers);
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
          retry: { maxRetries: 0 },
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
        diagnostic ?? connectDiagnostic(statusCode),
      );
    }
  }

  /**
   * Read the offset-paginated DMO inventory, without projecting resource fields.
   * A short page terminates the list; unsupported continuation shapes fail closed.
   * @returns {Promise<Array<Record<string, unknown>>>} Complete raw DMO entries or an error, never a partial list.
   */
  public async listDataModelObjects(): Promise<Array<Record<string, unknown>>> {
    const result: Array<Record<string, unknown>> = [];
    const identities = new Set<string>();
    const limit = 50;
    // The official endpoint caps SOQL offsets at 2000. Never probe beyond it.
    for (let offset = 0; offset <= 2000; offset += limit) {
      const page = await this.get<unknown>(
        `${this.prefix}data-model-objects?limit=${limit}&offset=${offset}&orderBy=ASC`,
      );
      if (!page || typeof page !== 'object' || Array.isArray(page)) {
        throw new ConnectError('INVALID_PAGE');
      }
      const envelope = page as Record<string, unknown>;
      if (
        !Array.isArray(envelope.dataModelObject) ||
        envelope.dataModelObject.length > limit ||
        // DMO pagination has no documented server-provided continuation URL/token.
        ['nextPageUrl', 'nextPageToken'].some((key) => envelope[key] != undefined)
      ) {
        throw new ConnectError('INVALID_PAGE');
      }
      for (const entry of envelope.dataModelObject as unknown[]) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new ConnectError('INVALID_PAGE');
        }
        const item = entry as Record<string, unknown>;
        if (
          typeof item.name !== 'string' ||
          !item.name.trim() ||
          typeof item.dataSpaceName !== 'string' ||
          !item.dataSpaceName.trim()
        ) {
          throw new ConnectError('INVALID_PAGE');
        }
        const identity = JSON.stringify([item.dataSpaceName, item.name]);
        if (identities.has(identity)) throw new ConnectError('INCOMPLETE_LIST');
        identities.add(identity);
        result.push(item);
      }
      if (envelope.dataModelObject.length < limit) return result;
    }
    // A full final permitted page cannot prove exhaustion, even if exactly full.
    throw new ConnectError('INCOMPLETE_LIST');
  }

  /**
   * Acquire raw incoming and outgoing relationships in one explicit data space.
   * Pagination metadata must prove exhaustion; raw records are not portable artifacts.
   * @param {string} dataModelObjectName Exact DMO API name, including any namespace.
   * @param {string} dataSpace Exact server data-space name; never silently defaults.
   * @returns {Promise<Array<Record<string, unknown>>>} Complete raw relationships or an error.
   */
  public async listDataModelObjectRelationships(
    dataModelObjectName: string,
    dataSpace: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (
      Number(this.selection.soapNumeric) < 64 ||
      !/^[A-Za-z][A-Za-z0-9_]*__dlm$/u.test(dataModelObjectName) ||
      !/^[A-Za-z][A-Za-z0-9_]*$/u.test(dataSpace)
    )
      throw new ConnectError('INVALID_REQUEST');
    const result: Array<Record<string, unknown>> = [];
    const identities = new Set<string>();
    const limit = 20;
    let total: number | undefined;
    const envelopeKeys = new Set([
      'relationships',
      'count',
      'totalSize',
      'sortBy',
      'currentPageToken',
      'currentPageUrl',
      'nextPageToken',
      'nextPageUrl',
      'previousPageToken',
      'previousPageUrl',
    ]);
    // Local safety budget, not a claim about this endpoint's server offset ceiling.
    for (let offset = 0; offset <= 2000; offset += limit) {
      // JSforce substitutes this private sentinel only for HTTP 204, not malformed JSON.
      const emptyResponse = Symbol('relationship-no-content');
      const page = await this.read<unknown>(
        `${this.prefix}data-model-objects/${dataModelObjectName}/relationships?dataspace=${dataSpace}&limit=${limit}&offset=${offset}&orderBy=ASC&sortBy=DeveloperName`,
        emptyResponse,
      );
      if (page === emptyResponse) {
        if (offset === 0) return [];
        throw new ConnectError('INCOMPLETE_LIST');
      }
      if (!page || typeof page !== 'object' || Array.isArray(page))
        throw new ConnectError('INVALID_PAGE');
      const envelope = page as Record<string, unknown>;
      if (
        Object.keys(envelope).some((key) => !envelopeKeys.has(key)) ||
        !Array.isArray(envelope.relationships) ||
        envelope.relationships.length > limit ||
        (envelope.count !== undefined && envelope.count !== envelope.relationships.length) ||
        !Number.isSafeInteger(envelope.totalSize) ||
        (envelope.totalSize as number) < 0 ||
        (envelope.sortBy != undefined && envelope.sortBy !== 'DeveloperName') ||
        [...envelopeKeys].some(
          (key) =>
            (key.endsWith('Url') || key.endsWith('Token')) &&
            envelope[key] != undefined &&
            typeof envelope[key] !== 'string',
        )
      )
        throw new ConnectError('INVALID_PAGE');
      if (total !== undefined && total !== envelope.totalSize)
        throw new ConnectError('INCOMPLETE_LIST');
      total = envelope.totalSize as number;
      for (const entry of envelope.relationships as unknown[]) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
          throw new ConnectError('INVALID_PAGE');
        const item = entry as Record<string, unknown>;
        const entities = [item.sourceObject, item.targetObject];
        if (
          typeof item.name !== 'string' ||
          !item.name.trim() ||
          entities.some(
            (entity) =>
              !entity ||
              typeof entity !== 'object' ||
              Array.isArray(entity) ||
              typeof (entity as Record<string, unknown>).name !== 'string' ||
              !(entity as Record<string, unknown>).name,
          ) ||
          !entities.some(
            (entity) => (entity as Record<string, unknown>).name === dataModelObjectName,
          )
        )
          throw new ConnectError('INVALID_PAGE');
        if (identities.has(item.name)) throw new ConnectError('INCOMPLETE_LIST');
        identities.add(item.name);
        // Preserve every field, including unfamiliar semantics, for later strict projection.
        result.push(item);
      }
      if (result.length > total) throw new ConnectError('INVALID_PAGE');
      if (result.length === total) {
        if (envelope.nextPageUrl || envelope.nextPageToken)
          throw new ConnectError('INCOMPLETE_LIST');
        return result;
      }
      if (envelope.relationships.length !== limit) throw new ConnectError('INCOMPLETE_LIST');
      // Response URLs can reference legacy routes/versions. Never follow them.
    }
    throw new ConnectError('INCOMPLETE_LIST');
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
