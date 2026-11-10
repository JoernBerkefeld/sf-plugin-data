import { openBoundSsot } from './bound-ssot.js';
import type { BoundConnection } from './bound-ssot.js';
import { ConnectError } from './connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from './connect-diagnostic.js';
import { NativeDmoError, nativeDmoName } from '../artifacts/native-dmo-document.js';
import { nativeApiVersion } from './api-version.js';
import type { DmoClient } from './dmo-rest.js';

export type DmoDeleteClient = Pick<DmoClient, 'get' | 'delete'>;

/**
 * Map transport failures to DMO codes while keeping the safe API diagnostic.
 * Any GET 404 means absent, matching the child adapter and the DLO delete path.
 * @param {unknown} error Transport failure.
 * @returns {unknown} NativeDmoError with retained diagnostic, or the original error.
 */
function dmoFailure(error: unknown): unknown {
  if (!(error instanceof ConnectError)) return error;
  const status = error.code === 'AUTHENTICATION_FAILED' ? 401 : error.statusCode;
  return retainConnectDiagnostic(
    new NativeDmoError(status === undefined ? 'DMO_REQUEST_UNCONFIRMED' : 'DMO_HTTP_ERROR', status),
    getConnectDiagnostic(error),
  );
}

/**
 * Bind DMO delete reads and the exact-name DELETE to one authenticated Connection.
 * @param {string} targetOrg Resolved username of the target org.
 * @param {string} apiVersion Native API version (default/auto 68).
 * @param {BoundConnection} [connect] Supplies the authenticated Connection; tests inject a synthetic one.
 * @returns {DmoDeleteClient} Name GET and name DELETE, each sent at most once.
 */
export function createNativeDmoDeleteClient(
  targetOrg: string,
  apiVersion = '68.0',
  connect?: BoundConnection,
): DmoDeleteClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-model-objects`;
  const ssot = openBoundSsot(targetOrg, version, connect);
  return {
    get: async (apiName) => {
      if (!nativeDmoName.test(apiName)) throw new NativeDmoError('INVALID_DMO_NAME');
      try {
        return await ssot.request('GET', `${endpoint}/${apiName}`);
      } catch (error) {
        throw dmoFailure(error);
      }
    },
    delete: async (apiName) => {
      if (!nativeDmoName.test(apiName)) throw new NativeDmoError('INVALID_DMO_NAME');
      const noContent = Symbol('dmo-deleted');
      let response: unknown;
      try {
        response = await ssot.request('DELETE', `${endpoint}/${apiName}`, noContent);
      } catch (error) {
        throw dmoFailure(error);
      }
      if (response !== noContent) throw new NativeDmoError('DMO_DELETE_UNCONFIRMED');
    },
  };
}
