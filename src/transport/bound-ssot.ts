import { AuthInfo, Connection } from '@salesforce/core';
import { ConnectClient, ConnectError } from './connect-client.js';
import { getConnectDiagnostic } from './connect-diagnostic.js';

/** Supplies the authenticated Connection; tests inject a synthetic JSforce one. */
export type BoundConnection = () => Promise<ConstructorParameters<typeof ConnectClient>[0]>;

/** One bound SSOT route sender; see BoundTransport for its only resend. */
export type BoundSsot = {
  request: (method: 'GET' | 'DELETE', route: string, noContent?: unknown) => Promise<unknown>;
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
 * reads) and is sent once more; a DELETE is never refreshed or resent.
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
   * @param {'GET' | 'DELETE'} method Read or exact delete.
   * @param {string} route Root-relative endpoint.
   * @param {unknown} [noContent] Sentinel JSforce returns for HTTP 204.
   * @returns {Promise<unknown>} Untrusted native response.
   */
  public async request(
    method: 'GET' | 'DELETE',
    route: string,
    noContent?: unknown,
  ): Promise<unknown> {
    const send = async (): Promise<unknown> =>
      this.send({ method, url: this.safeUrl(route) }, this.noRefreshReceiver(), noContent);
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
 * Bind GET and DELETE routes to one lazily opened authenticated Connection.
 * Failures surface as ConnectError with the retained API diagnostic; callers map them.
 * @param {string} targetOrg Resolved username of the target org.
 * @param {string} version Numeric API version such as 68.0, already normalized by the caller.
 * @param {BoundConnection} [connect] Supplies the Connection; defaults to the CLI auth for targetOrg.
 * @returns {BoundSsot} Sender; a GET is resent once after an expired-session refresh, a DELETE never.
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
  let transport: Promise<BoundTransport> | undefined;
  return {
    request: async (method, route, noContent) => {
      transport ??= (async () => new BoundTransport(await open(), version))();
      const client = await transport;
      return client.request(method, route, noContent);
    },
  };
}
