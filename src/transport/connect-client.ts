import { Org } from '@salesforce/core';
import type { Connection } from '@salesforce/core';

export type TransportErrorCode = 'INVALID_REQUEST' | 'AUTHENTICATION_FAILED' | 'REQUEST_FAILED';

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

/** Read-only SSOT transport; Salesforce core owns credentials and session refresh. */
export class ConnectClient {
  private readonly origin: string;
  private readonly prefix: string;

  public constructor(
    private readonly connection: AuthenticatedConnection,
    apiVersion: string,
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
    const url = this.safeUrl(path);
    try {
      return await this.connection.request<T>(
        { method: 'GET', url },
        // Core narrows options to JSON, but its JSforce transport supports a redirect guard.
        {
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
