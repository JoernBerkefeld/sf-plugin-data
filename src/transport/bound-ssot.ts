import { AuthInfo, Connection } from '@salesforce/core';
import { ConnectClient } from './connect-client.js';

/** Supplies the authenticated Connection; tests inject a synthetic JSforce one. */
export type BoundConnection = () => Promise<ConstructorParameters<typeof ConnectClient>[0]>;

/** One bound SSOT route sender: each call is a single wire attempt. */
export type BoundSsot = {
  request: (method: 'GET' | 'DELETE', route: string, noContent?: unknown) => Promise<unknown>;
};

/** Single-attempt routes on the bound Connection: no child CLI, refresh, retry or redirect. */
class BoundTransport extends ConnectClient {
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
    return this.send({ method, url: this.safeUrl(route) }, this.noRefreshReceiver(), noContent);
  }
}

/**
 * Bind GET and DELETE routes to one lazily opened authenticated Connection.
 * Failures surface as ConnectError with the retained API diagnostic; callers map them.
 * @param {string} targetOrg Resolved username of the target org.
 * @param {string} version Numeric API version such as 68.0, already normalized by the caller.
 * @param {BoundConnection} [connect] Supplies the Connection; defaults to the CLI auth for targetOrg.
 * @returns {BoundSsot} Sender whose every request is sent at most once.
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
