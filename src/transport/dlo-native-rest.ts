import { AuthInfo, Connection } from '@salesforce/core';
import { ConnectClient, ConnectError } from './connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from './connect-diagnostic.js';
import { DloError, dloName } from '../artifacts/dlo-document.js';
import { nativeApiVersion } from './api-version.js';
import type { DloClient } from './dlo-rest.js';

export type DloDeleteClient = Pick<DloClient, 'get' | 'delete'>;

const recordId = /^[A-Za-z0-9]{18}$/u;

/** Single-attempt DLO routes on the bound Connection: no child CLI, refresh, retry or redirect. */
class DloTransport extends ConnectClient {
  /**
   * Dispatch one fixed DLO route.
   * @param {string} route Root-relative endpoint.
   * @param {'GET' | 'DELETE'} method Read or exact-ID delete.
   * @param {unknown} [noContent] Sentinel JSforce returns for HTTP 204.
   * @returns {Promise<unknown>} Untrusted native response.
   */
  public async request(
    route: string,
    method: 'GET' | 'DELETE',
    noContent?: unknown,
  ): Promise<unknown> {
    return this.send({ method, url: this.safeUrl(route) }, this.noRefreshReceiver(), noContent);
  }
}

/**
 * Map transport failures to DLO codes while keeping the safe API diagnostic.
 * Any GET 404 means absent, matching the child adapter: the live DLO 404 body uses
 * INVALID_INPUT, not ITEM_NOT_FOUND, so a strict body check would never match.
 * @param {unknown} error Transport failure.
 * @returns {unknown} DloError with retained diagnostic, or the original error.
 */
function dloFailure(error: unknown): unknown {
  if (!(error instanceof ConnectError)) return error;
  const status = error.code === 'AUTHENTICATION_FAILED' ? 401 : error.statusCode;
  return retainConnectDiagnostic(
    new DloError(status === undefined ? 'DLO_REQUEST_UNCONFIRMED' : 'DLO_HTTP_ERROR', status),
    getConnectDiagnostic(error),
  );
}

/**
 * Bind DLO delete reads and the exact-ID DELETE to one authenticated Connection.
 * @param {string} targetOrg Resolved username of the target org.
 * @param {string} apiVersion Native API version (default/auto 68).
 * @param {Function} [connect] Supplies the authenticated Connection; tests inject a synthetic one.
 * @returns {DloDeleteClient} Name GET and ID DELETE, each sent at most once.
 */
export function createNativeDloDeleteClient(
  targetOrg: string,
  apiVersion = '68.0',
  connect?: () => Promise<ConstructorParameters<typeof ConnectClient>[0]>,
): DloDeleteClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-lake-objects`;
  const open =
    connect ??
    (async () =>
      Connection.create({
        authInfo: await AuthInfo.create({ username: targetOrg }),
        connectionOptions: { version },
      }));
  let transport: Promise<DloTransport> | undefined;
  const bound = (): Promise<DloTransport> =>
    (transport ??= (async () => new DloTransport(await open(), version))());
  return {
    get: async (apiName) => {
      if (!dloName.test(apiName)) throw new DloError('INVALID_DLO_NAME');
      const client = await bound();
      try {
        return await client.request(`${endpoint}/${apiName}`, 'GET');
      } catch (error) {
        throw dloFailure(error);
      }
    },
    delete: async (id) => {
      if (!recordId.test(id)) throw new DloError('INVALID_DLO_TARGET_ID');
      const client = await bound();
      const noContent = Symbol('dlo-deleted');
      let response: unknown;
      try {
        response = await client.request(`${endpoint}/${id}`, 'DELETE', noContent);
      } catch (error) {
        throw dloFailure(error);
      }
      if (response !== noContent) throw new DloError('DLO_DELETE_UNCONFIRMED');
    },
  };
}
