import {
  calculatedInsightInputBody,
  calculatedInsightName,
  CalculatedInsightError,
  validateNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import { ConnectClient } from './connect-client.js';

export type CalculatedInsightClient = {
  get: (apiName: string) => Promise<unknown>;
  /** POST of the document; `draft: true` with --draft, no `draft` key otherwise. */
  create: (document: NativeCalculatedInsight, options?: { draft?: true }) => Promise<unknown>;
  /**
   * PATCH of the document; `draft` is sent only when given. `observed` is the org document
   * the update is based on (an unchanged `definitionType` is left out).
   */
  update: (
    document: NativeCalculatedInsight,
    options?: { draft?: boolean; observed?: NativeCalculatedInsight },
  ) => Promise<unknown>;
  delete: (apiName: string) => Promise<unknown>;
};

/** Internal access to the shared single-attempt, no-refresh transport, not a generic public writer. */
class CalculatedInsightTransport extends ConnectClient {
  /**
   * Send one request; every returned value remains untrusted.
   * @param {string} route Exact route.
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method Native verb.
   * @param {Record<string, unknown>} [body] Payload, absent for DELETE and GET.
   * @returns {Promise<unknown>} Raw response, including undefined for an empty DELETE reply.
   */
  public async request(
    route: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
 * The API 68 calculated insight routes. The body is the authored document with the input
 * key names and enum forms (`calculatedInsightInputBody`); Salesforce decides the rest.
 * @param {ConstructorParameters<typeof ConnectClient>[0]} connection Authenticated connection.
 * @param {string} apiVersion '68.0' only.
 * @param {string} dataSpace 'default' only (the item routes take no data space).
 * @returns {CalculatedInsightClient} Exact-name operations.
 */
export function createCalculatedInsightClient(
  connection: ConstructorParameters<typeof ConnectClient>[0],
  apiVersion: string,
  dataSpace: string,
): CalculatedInsightClient {
  if (apiVersion !== '68.0' || dataSpace !== 'default')
    throw new CalculatedInsightError('INVALID_CI_SCOPE');
  const transport = new CalculatedInsightTransport(connection, apiVersion);
  const endpoint = `/services/data/v${apiVersion}/ssot/calculated-insights`;

  /**
   * Bind only an exact full CI API name, never an ID or query.
   * @param {string} apiName Full developer name.
   * @returns {string} Exact resource route.
   */
  function item(apiName: string): string {
    if (typeof apiName !== 'string' || !calculatedInsightName.test(apiName))
      throw new CalculatedInsightError('INVALID_CI_NAME');
    return `${endpoint}/${apiName}`;
  }

  return {
    get: async (apiName) => transport.request(item(apiName), 'GET'),
    create: async (document, options) =>
      transport.request(endpoint, 'POST', {
        ...calculatedInsightInputBody(validateNativeCalculatedInsight(document), 'create'),
        ...(options?.draft === true ? { draft: true } : {}),
      }),
    update: async (document, options) => {
      const checked = validateNativeCalculatedInsight(document);
      return transport.request(item(checked.apiName), 'PATCH', {
        ...calculatedInsightInputBody(checked, 'update', options?.observed),
        ...(typeof options?.draft === 'boolean' ? { draft: options.draft } : {}),
      });
    },
    delete: async (apiName) => transport.request(item(apiName), 'DELETE'),
  };
}
