import { AuthInfo, Connection } from '@salesforce/core';
import { ConnectClient, ConnectError } from './connect-client.js';
import { getConnectDiagnostic } from './connect-diagnostic.js';

/** Supplies the authenticated Connection; tests inject a synthetic JSforce one. */
export type BoundConnection = () => Promise<ConstructorParameters<typeof ConnectClient>[0]>;

/** The Metadata API CRUD calls of the bound Connection (jsforce `connection.metadata`). */
export type BoundMetadata = {
  read: (type: string, fullNames: string[]) => Promise<unknown>;
  update: (type: string, metadata: Record<string, unknown>) => Promise<unknown>;
};

/** HTTP methods of the bound sender; every method other than GET is a write. */
export type BoundMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** One bound SSOT route sender; see BoundTransport for its resend rules. */
export type BoundSsot = {
  request: (
    method: BoundMethod,
    route: string,
    noContent?: unknown,
    body?: unknown,
  ) => Promise<unknown>;
  /** Metadata API calls on the same Connection; never a child CLI process. */
  metadata?: () => Promise<BoundMetadata>;
};

/**
 * Whether a failure is Salesforce's answer to an expired access token: HTTP 401 INVALID_SESSION_ID.
 * @param {unknown} error Failure of one request.
 * @returns {boolean} Expired session.
 */
function sessionExpired(error: unknown): boolean {
  return (
    error instanceof ConnectError &&
    error.code === 'AUTHENTICATION_FAILED' &&
    error.statusCode === 401 &&
    (getConnectDiagnostic(error)?.errors ?? []).some((entry) => entry.code === 'INVALID_SESSION_ID')
  );
}

/**
 * Routes on the bound Connection: no child CLI and no redirect. A GET answered with an expired
 * session refreshes the token once through Salesforce core (one refresh shared by concurrent
 * reads) and is sent once more. A write (POST, PATCH, PUT, DELETE) keeps ConnectClient.send's
 * write rule: it is resent only after a failure that proves it never left (ECONNREFUSED,
 * ENOTFOUND, EHOSTUNREACH, EAI_AGAIN), never after a reset, timeout, 429 or 503, and never
 * after a token refresh. The caller's read-back decides what the write did.
 */
class BoundTransport extends ConnectClient {
  private refreshing?: Promise<void>;

  public constructor(
    private readonly session: ConstructorParameters<typeof ConnectClient>[0],
    version: string,
  ) {
    super(session, version);
  }

  /**
   * Dispatch one fixed route.
   * @param {BoundMethod} method Read or write.
   * @param {string} route Root-relative endpoint.
   * @param {unknown} [noContent] Sentinel JSforce returns for HTTP 204.
   * @param {unknown} [body] JSON body of a write.
   * @returns {Promise<unknown>} Untrusted native response.
   */
  public async request(
    method: BoundMethod,
    route: string,
    noContent?: unknown,
    body?: unknown,
  ): Promise<unknown> {
    const url = this.safeUrl(route);
    const request =
      body === undefined
        ? { method, url }
        : {
            method,
            url,
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          };
    const send = async (): Promise<unknown> =>
      this.send(request, this.noRefreshReceiver(), noContent);
    try {
      return await send();
    } catch (error) {
      const refresh = (this.session as { refreshAuth?: () => Promise<void> }).refreshAuth;
      if (method !== 'GET' || !sessionExpired(error) || typeof refresh !== 'function') throw error;
      try {
        this.refreshing ??= refresh.call(this.session).finally(() => {
          this.refreshing = undefined;
        });
        await this.refreshing;
      } catch {
        throw error;
      }
      return send();
    }
  }
}

/**
 * Bind SSOT reads and writes, and the Metadata API calls, to one lazily opened authenticated
 * Connection.
 * Failures surface as ConnectError with the retained API diagnostic; callers map them.
 * @param {string} targetOrg Resolved username of the target org.
 * @param {string} version Numeric API version such as 68.0, already normalized by the caller.
 * @param {BoundConnection} [connect] Supplies the Connection; defaults to the CLI auth for targetOrg.
 * @returns {BoundSsot} Sender; a GET is resent once after an expired-session refresh, a write never.
 * Its Metadata API calls use the same Connection.
 */
export function openBoundSsot(
  targetOrg: string,
  version: string,
  connect?: BoundConnection,
): BoundSsot {
  const open =
    connect ??
    (async () =>
      Connection.create({
        authInfo: await AuthInfo.create({ username: targetOrg }),
        connectionOptions: { version },
      }));
  let session: ReturnType<typeof open> | undefined;
  let transport: Promise<BoundTransport> | undefined;
  return {
    request: async (method, route, noContent, body) => {
      session ??= open();
      const opened = session;
      transport ??= (async () => new BoundTransport(await opened, version))();
      const client = await transport;
      return client.request(method, route, noContent, body);
    },
    metadata: async () => {
      session ??= open();
      const api = ((await session) as { metadata?: BoundMetadata }).metadata;
      if (!api || typeof api.read !== 'function' || typeof api.update !== 'function')
        throw new ConnectError('REQUEST_FAILED');
      return {
        read: async (type, fullNames) => api.read(type, fullNames),
        update: async (type, metadata) => api.update(type, metadata),
      };
    },
  };
}
