import { dataGraphName, DataGraphError, graphRequire } from '../artifacts/data-graph-document.js';
import { ConnectClient } from './connect-client.js';
import {
  nativeDataGraphCreateDefinition,
  validateNativeDataGraphDocument,
} from '../artifacts/native-data-graph-document.js';

export type DataGraphClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (definition: unknown) => Promise<unknown>;
  update?: (apiName: string, definition: unknown) => Promise<unknown>;
  delete: (apiName: string) => Promise<unknown>;
};

/**
 * Build the native API68 create body from an authored definition of any shape the native
 * document admits; the API decides what it accepts. Generated names are dropped (see
 * nativeDataGraphCreateDefinition); enum spellings are sent in request form.
 * @param {unknown} value Raw authored definition, not the API67 facade artifact.
 * @returns {Record<string, unknown>} Detached native request.
 */
export function buildDataGraphCreateRequest(value: unknown): Record<string, unknown> {
  return nativeDataGraphCreateDefinition({
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: value,
  });
}

/** Shared core authentication and single-attempt transport, without a generic public writer. */
class DataGraphTransport extends ConnectClient {
  /**
   * Send an exact operation with refresh/replay/redirect disabled.
   * @param {string} route Fixed qualified route.
   * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} method Native single-attempt verb.
   * @param {Record<string, unknown>} [body] Validated create definition only.
   * @returns {Promise<unknown>} Untrusted response, including undefined for HTTP204.
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
 * Bind native API68/default Graph CRD transport only, not lifecycle authorization.
 * The caller must independently qualify dependencies, absence, ownership and settlement.
 * A DELETE acknowledgement does not prove absence or generated-resource cleanup.
 * @param {ConstructorParameters<typeof ConnectClient>[0]} connection Authenticated core receiver.
 * @param {string} apiVersion Explicit qualified numeric version.
 * @param {string} dataSpace Explicit qualified space.
 * @returns {DataGraphClient} Exact operations without automatic retries.
 */
export function createDataGraphClient(
  connection: ConstructorParameters<typeof ConnectClient>[0],
  apiVersion: string,
  dataSpace: string,
): DataGraphClient & Required<Pick<DataGraphClient, 'update'>> {
  if (apiVersion !== '68.0' || dataSpace !== 'default')
    throw new DataGraphError('INVALID_NATIVE_DATA_GRAPH_SCOPE');
  const transport = new DataGraphTransport(connection, apiVersion);
  const endpoint = '/services/data/v68.0/ssot/data-graphs';
  /**
   * Bind an exact developer name, never a URL, ID or query.
   * @param {string} apiName Exact Graph name.
   * @returns {string} Fixed item route.
   */
  function item(apiName: string): string {
    if (typeof apiName !== 'string' || !dataGraphName.test(apiName))
      throw new DataGraphError('INVALID_NATIVE_DATA_GRAPH_NAME');
    return `${endpoint}/${apiName}`;
  }
  return {
    get: async (apiName) => transport.request(item(apiName), 'GET'),
    create: async (value) =>
      transport.request(endpoint, 'POST', buildDataGraphCreateRequest(value)),
    update: async (apiName, value) => {
      const route = item(apiName);
      const { definition } = validateNativeDataGraphDocument({
        schemaVersion: 1,
        kind: 'native-data-graph',
        apiVersion: '68.0',
        definition: value,
      });
      graphRequire(definition.name === apiName);
      return transport.request(route, 'PUT', definition);
    },
    delete: async (apiName) => transport.request(item(apiName), 'DELETE'),
  };
}
