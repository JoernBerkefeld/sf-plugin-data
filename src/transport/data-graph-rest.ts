import { dataGraphName, DataGraphError, graphRequire } from '../artifacts/data-graph-document.js';
import { ConnectClient } from './connect-client.js';

export type DataGraphClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (definition: unknown) => Promise<unknown>;
  delete: (apiName: string) => Promise<unknown>;
};

/**
 * Admit an exact inert record before reading any supplied property.
 * @param {unknown} value Candidate record.
 * @param {string[]} keys Exact own property inventory.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys: string[]): Record<string, unknown> {
  graphRequire(
    value &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Reflect.ownKeys(value).length === keys.length,
  );
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    graphRequire(descriptor?.enumerable && 'value' in descriptor);
  }
  return value as Record<string, unknown>;
}

/**
 * Require bounded display text without coercing objects or invoking serializers.
 * @param {unknown} value Candidate text.
 * @param {boolean} [empty] Permit an empty description.
 */
function text(value: unknown, empty = false): void {
  graphRequire(
    typeof value === 'string' && value.length <= 1024 && (empty || value.trim().length > 0),
  );
}

/**
 * Admit only the raw root-only Individual NONE create shape qualified at native API68.
 * No schedule, wrapper, generated IDs, nested objects or alternate spelling is accepted.
 * The server generates node/field developer names; these authored hints are not target bindings.
 * @param {unknown} value Raw authored definition, not the API67 facade artifact.
 * @returns {Record<string, unknown>} Detached minimal native request.
 */
export function buildDataGraphCreateRequest(value: unknown): Record<string, unknown> {
  const definition = record(value, [
    'name',
    'label',
    'description',
    'dataspaceName',
    'primaryObjectName',
    'type',
    'sourceObject',
  ]);
  graphRequire(typeof definition.name === 'string' && dataGraphName.test(definition.name));
  text(definition.label);
  text(definition.description, true);
  graphRequire(
    definition.dataspaceName === 'default' &&
      definition.primaryObjectName === 'ssot__Individual__dlm' &&
      definition.type === 'NONE',
  );
  const node = record(definition.sourceObject, [
    'name',
    'devName',
    'label',
    'jsonPath',
    'path',
    'type',
    'fields',
    'relatedObjects',
  ]);
  text(node.label);
  graphRequire(
    node.name === definition.primaryObjectName &&
      typeof node.devName === 'string' &&
      dataGraphName.test(node.devName) &&
      node.jsonPath === '$' &&
      node.type === 'standard',
  );
  for (const key of ['path', 'relatedObjects'])
    graphRequire(
      Array.isArray(node[key]) &&
        Object.getPrototypeOf(node[key]) === Array.prototype &&
        Reflect.ownKeys(node[key]).length === 1 &&
        node[key].length === 0,
    );
  graphRequire(
    Array.isArray(node.fields) &&
      Object.getPrototypeOf(node.fields) === Array.prototype &&
      node.fields.length === 3 &&
      Reflect.ownKeys(node.fields).length === 4,
  );
  const fieldNames = ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'];
  const developerNames = new Set<string>();
  for (const [index, sourceFieldName] of fieldNames.entries()) {
    const descriptor = Object.getOwnPropertyDescriptor(node.fields, String(index));
    graphRequire(descriptor?.enumerable && 'value' in descriptor);
    const field = record(descriptor.value, [
      'devName',
      'sourceFieldName',
      'dataType',
      'isKeyColumn',
      'isProjected',
      'usageTag',
    ]);
    graphRequire(
      typeof field.devName === 'string' &&
        dataGraphName.test(field.devName) &&
        !developerNames.has(field.devName) &&
        field.sourceFieldName === sourceFieldName &&
        field.dataType === 'Text' &&
        field.isKeyColumn === (index === 0) &&
        field.isProjected === true &&
        field.usageTag === (index === 1 ? 'KEY_QUALIFIER' : 'NONE'),
    );
    developerNames.add(field.devName);
  }
  return structuredClone(definition);
}

/** Shared core authentication and single-attempt transport, without a generic public writer. */
class DataGraphTransport extends ConnectClient {
  /**
   * Send an exact operation with refresh/replay/redirect disabled.
   * @param {string} route Fixed qualified route.
   * @param {'GET' | 'POST' | 'DELETE'} method Native verb; UPDATE is deliberately absent.
   * @param {Record<string, unknown>} [body] Validated create definition only.
   * @returns {Promise<unknown>} Untrusted response, including undefined for HTTP204.
   */
  public async request(
    route: string,
    method: 'GET' | 'POST' | 'DELETE',
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
 * @returns {DataGraphClient} Exact operations with no update or automatic retries.
 */
export function createDataGraphClient(
  connection: ConstructorParameters<typeof ConnectClient>[0],
  apiVersion: string,
  dataSpace: string,
): DataGraphClient {
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
    delete: async (apiName) => transport.request(item(apiName), 'DELETE'),
  };
}
