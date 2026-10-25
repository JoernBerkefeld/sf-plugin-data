import { Org } from '@salesforce/core';
import type { Connection } from '@salesforce/core';
import { buildDmoCreateRequestFromDocument } from '../artifacts/dmo-document.js';

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

/** Bounded SSOT transport; Salesforce core owns credentials. */
export class ConnectClient {
  private readonly origin: string;
  private readonly prefix: string;

  public constructor(
    private readonly connection: AuthenticatedConnection,
    private readonly apiVersion: string,
  ) {
    if (!/^\d{2,3}\.0$/u.test(apiVersion)) throw new ConnectError('INVALID_REQUEST');
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
    this.prefix = `/services/data/v${apiVersion}/ssot/`;
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
    if (this.apiVersion !== '65.0') throw new ConnectError('INVALID_REQUEST');
    const body = JSON.stringify(buildDmoCreateRequestFromDocument(document, 'default'));
    const receiver = Object.create(this.connection) as AuthenticatedConnection;
    Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
    return this.send(
      {
        method: 'POST',
        url: this.safeUrl(`${this.prefix}data-model-objects`),
        body,
        headers: { 'content-type': 'application/json' },
      },
      receiver,
    );
  }

  private async read<T>(path: string, noContentResponse?: unknown): Promise<T> {
    return this.send<T>(
      { method: 'GET', url: this.safeUrl(path) },
      this.connection,
      noContentResponse,
    );
  }

  private async send<T>(
    request: Parameters<Connection['request']>[0],
    receiver: AuthenticatedConnection,
    noContentResponse?: unknown,
  ): Promise<T> {
    try {
      return await receiver.request<T>(
        request,
        // Core narrows options to JSON, but its JSforce transport supports a redirect guard.
        {
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
          : undefined;
      const expired =
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'INVALID_SESSION_ID';
      throw new ConnectError(
        statusCode === 401 || expired ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED',
        statusCode,
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
      Number(this.apiVersion) < 64 ||
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

  private safeUrl(path: string): string {
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
