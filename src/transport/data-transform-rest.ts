import { ConnectClient } from './connect-client.js';
import { DloError, dloName } from '../artifacts/dlo-document.js';
import type { DloClient } from './dlo-rest.js';

export type DataTransformDloReader = Pick<DloClient, 'get'>;
import {
  buildDataTransformInput,
  DataTransformError,
  dataTransformName,
  dataTransformId,
} from '../artifacts/data-transform-document.js';

export type DataTransformClient = {
  get: (nameOrId: string) => Promise<unknown>;
  schedule: (nameOrId: string) => Promise<unknown>;
  list: (offset?: number) => Promise<unknown>;
  validate: (input: unknown) => Promise<unknown>;
  create: (input: unknown) => Promise<unknown>;
  update: (targetId: string, input: unknown) => Promise<unknown>;
  delete: (targetId: string) => Promise<unknown>;
};

/** Native transport with no authentication replay or implicit write fallback. */
class DataTransformTransport extends ConnectClient {
  /**
   * Dispatch one fixed route without refresh, retry or redirects.
   * @param {string} route Qualified root-relative endpoint.
   * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} method Read or definition validation.
   * @param {Record<string, unknown>} [body] Admitted input projection only.
   * @returns {Promise<unknown>} Untrusted native response.
   */
  public async request(
    route: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.send(
      {
        method,
        url: this.safeUrl(route),
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      },
      this.noRefreshReceiver(),
    );
  }
}

/**
 * Read existing Transform prerequisites through the same bound API68 Connection.
 * No CRUD methods, child CLI, refresh, redirects or retry are exposed.
 * @param {ConstructorParameters<typeof ConnectClient>[0]} connection Bound authenticated receiver.
 * @returns {DataTransformDloReader} Exact-name GET-only prerequisite reader.
 */
export function createDataTransformDloReader(
  connection: ConstructorParameters<typeof ConnectClient>[0],
): DataTransformDloReader {
  const transport = new DataTransformTransport(connection, '68.0');
  const origin = connection.instanceUrl;
  const request = connection.request;
  return {
    get: async (apiName) => {
      if (connection.instanceUrl !== origin || connection.request !== request)
        throw new DataTransformError('TRANSFORM_CONNECTION_DRIFT');
      if (typeof apiName !== 'string' || !dloName.test(apiName))
        throw new DloError('UNSUPPORTED_DLO_SELECTION');
      return transport.request(`/services/data/v68.0/ssot/data-lake-objects/${apiName}`, 'GET');
    },
  };
}

/**
 * Bind only the native API68/default-space definition lifecycle contract.
 * Callers authorize create-only POST or identity-bound full-input PUT; no runs or schedule writes.
 * @param {ConstructorParameters<typeof ConnectClient>[0]} connection Existing authenticated receiver.
 * @param {string} apiVersion Exact native API version.
 * @param {string} dataSpace Exact qualified dataspace.
 * @returns {DataTransformClient} Single-attempt reads, validation and definition writes.
 */
export function createDataTransformClient(
  connection: ConstructorParameters<typeof ConnectClient>[0],
  apiVersion: string,
  dataSpace: string,
): DataTransformClient {
  if (apiVersion !== '68.0' || dataSpace !== 'default')
    throw new DataTransformError('INVALID_TRANSFORM_SCOPE');
  const transport = new DataTransformTransport(connection, apiVersion);
  const origin = connection.instanceUrl;
  const request = connection.request;
  /** Reject rebinding the authenticated receiver between admission and dispatch. */
  function checkBinding(): void {
    if (connection.instanceUrl !== origin || connection.request !== request)
      throw new DataTransformError('TRANSFORM_CONNECTION_DRIFT');
  }
  const endpoint = '/services/data/v68.0/ssot/data-transforms';
  /**
   * Validate a name or native transform record ID, never an arbitrary URL.
   * @param {string} nameOrId Selected exact identity.
   * @returns {string} Fixed item route.
   */
  function item(nameOrId: string): string {
    checkBinding();
    if (
      typeof nameOrId !== 'string' ||
      !(dataTransformName.test(nameOrId) || dataTransformId.test(nameOrId))
    )
      throw new DataTransformError('INVALID_TRANSFORM_SELECTION');
    return `${endpoint}/${nameOrId}`;
  }
  return {
    get: async (nameOrId) => transport.request(item(nameOrId), 'GET'),
    schedule: async (nameOrId) => transport.request(`${item(nameOrId)}/schedule`, 'GET'),
    list: async (offset) => {
      checkBinding();
      if (
        offset !== undefined &&
        (!Number.isSafeInteger(offset) || offset < 0 || offset > 2000 || offset % 20 !== 0)
      )
        throw new DataTransformError('INVALID_TRANSFORM_OFFSET');
      return transport.request(
        `${endpoint}?limit=20&orderBy=NameAsc${offset === undefined ? '' : `&offset=${offset}`}`,
        'GET',
      );
    },
    validate: async (input) => {
      checkBinding();
      return transport.request(`${endpoint}-validation`, 'POST', buildDataTransformInput(input));
    },
    create: async (input) => {
      checkBinding();
      return transport.request(endpoint, 'POST', buildDataTransformInput(input));
    },
    delete: async (targetId) => {
      if (typeof targetId !== 'string' || !dataTransformId.test(targetId))
        throw new DataTransformError('INVALID_TRANSFORM_TARGET_ID');
      return transport.request(item(targetId), 'DELETE');
    },
    update: async (targetId, input) => {
      if (typeof targetId !== 'string' || !dataTransformId.test(targetId))
        throw new DataTransformError('INVALID_TRANSFORM_TARGET_ID');
      return transport.request(item(targetId), 'PUT', buildDataTransformInput(input));
    },
  };
}
