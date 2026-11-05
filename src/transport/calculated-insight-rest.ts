import {
  calculatedInsightName,
  CalculatedInsightError,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import { ConnectClient } from './connect-client.js';

export type CalculatedInsightClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (document: unknown) => Promise<unknown>;
  update: (document: unknown, options?: { draft?: true }) => Promise<unknown>;
  publish: (document: unknown) => Promise<unknown>;
  delete: (apiName: string) => Promise<unknown>;
};

/** Internal access to the shared single-attempt, no-refresh transport, not a generic public writer. */
class CalculatedInsightTransport extends ConnectClient {
  /**
   * Send one qualified request; every returned value remains untrusted.
   * @param {string} route Exact qualified route.
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method Native verb.
   * @param {Record<string, unknown>} [body] Operation-specific payload, absent for DELETE and GET.
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
 * Build only the default-space CI operations evidenced at native API64–68.
 * No response proves settlement, ownership, absence or successful publication/deletion.
 * @param {ConstructorParameters<typeof ConnectClient>[0]} connection Existing authenticated core connection.
 * @param {string} apiVersion Explicit enumerated numeric version; no latest/default admission.
 * @param {string} dataSpace Explicit default-space selection.
 * @returns {CalculatedInsightClient} Exact-name operations; lifecycle admission belongs to the caller.
 */
export function createCalculatedInsightClient(
  connection: ConstructorParameters<typeof ConnectClient>[0],
  apiVersion: string,
  dataSpace: string,
): CalculatedInsightClient {
  if (!['64.0', '65.0', '66.0', '67.0', '68.0'].includes(apiVersion) || dataSpace !== 'default')
    throw new CalculatedInsightError('INVALID_CI_SCOPE');
  const transport = new CalculatedInsightTransport(connection, apiVersion);
  const endpoint = `/services/data/v${apiVersion}/ssot/calculated-insights`;

  /**
   * Bind only an exact full CI API name, never an ID or query.
   * @param {string} apiName Full developer name.
   * @returns {string} Safe exact resource route.
   */
  function item(apiName: string): string {
    if (typeof apiName !== 'string' || !calculatedInsightName.test(apiName))
      throw new CalculatedInsightError('INVALID_CI_NAME');
    return `${endpoint}/${apiName}`;
  }

  return {
    get: async (apiName) => transport.request(item(apiName), 'GET'),
    create: async (value) => {
      const document = validateCalculatedInsightDocument(value);
      return transport.request(endpoint, 'POST', {
        apiName: document.identity.apiName,
        displayName: document.spec.displayName,
        expression: document.spec.expression,
        definitionType: 'CalculatedMetric',
        dataSpaceName: 'default',
        draft: true,
      });
    },
    update: async (value, options) => {
      if (
        options !== undefined &&
        (!options ||
          typeof options !== 'object' ||
          Array.isArray(options) ||
          Reflect.ownKeys(options).some((key) => key !== 'draft') ||
          ('draft' in options && options.draft !== true))
      )
        throw new CalculatedInsightError('INVALID_CI_SCOPE');
      const document = validateCalculatedInsightDocument(value);
      return transport.request(item(document.identity.apiName), 'PATCH', {
        expression: document.spec.expression,
        ...(options?.draft === true ? { draft: true } : {}),
      });
    },
    publish: async (value) => {
      const document = validateCalculatedInsightDocument(value);
      if (document.spec.publishScheduleInterval !== 'NOT_SCHEDULED')
        throw new CalculatedInsightError('CI_CONFIGURATION_UNQUALIFIED');
      return transport.request(item(document.identity.apiName), 'PATCH', {
        displayName: document.spec.displayName,
        draft: false,
        publishScheduleInterval: 'NotScheduled',
      });
    },
    delete: async (apiName) => transport.request(item(apiName), 'DELETE'),
  };
}
