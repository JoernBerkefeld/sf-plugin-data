import type { Connection } from '@salesforce/core';
import {
  apiDiagnostic,
  diagnosticRequestId,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../transport/connect-diagnostic.js';
import type { ConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { ConnectError } from '../transport/connect-client.js';
import { dataGraphName, graphRequire } from '../artifacts/data-graph-document.js';
import { readDmoMetadata } from './read-metadata.js';
import type { NativeGraphContext, NativeGraphRead } from './native-data-graph-crd.js';

type TransportResponse = { statusCode?: unknown; body?: unknown; headers?: unknown };
type Transport = {
  httpRequest: (
    request: unknown,
    options: unknown,
  ) => Promise<TransportResponse> & { stream: () => unknown };
};

/**
 * Bind concrete read-only native68 routes to an independently verified authenticated org.
 * Raw wire status/body is retained privately because core otherwise discards Graph error envelopes.
 * No caller-supplied URL, SOQL, org identity, auth refresh or pagination replay is accepted.
 * @param {Connection} connection Existing API68 core connection.
 * @param {string} dataSpace Exact qualified default scope.
 * @returns {Promise<NativeGraphContext>} Scope-checked concrete readers, never write authority.
 */
export async function nativeDataGraphReadContext(
  connection: Connection,
  dataSpace: string,
): Promise<NativeGraphContext> {
  const origin = connection.instanceUrl;
  const parsed = new URL(origin);
  graphRequire(
    parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash,
  );
  const orgId = connection.getAuthInfoFields().orgId;
  graphRequire(typeof orgId === 'string' && /^00D[A-Za-z0-9]{15}$/u.test(orgId));
  const transport = (connection as unknown as { _transport: Transport })._transport;
  graphRequire(typeof transport?.httpRequest === 'function');
  const requestMethod = connection.request;
  const check = (): void => {
    graphRequire(
      dataSpace === 'default' &&
        connection.getApiVersion() === '68.0' &&
        connection.instanceUrl === origin &&
        connection.getAuthInfoFields().orgId === orgId &&
        connection.request === requestMethod &&
        (connection as unknown as { _transport: Transport })._transport === transport,
    );
  };
  check();
  /**
   * Observe exactly one fixed-route core GET without exposing payloads in thrown diagnostics.
   * @param {string} route Internally constructed API68 path.
   * @returns {Promise<NativeGraphRead>} Detached wire evidence, including exact errors.
   */
  const read = async (route: string): Promise<NativeGraphRead> => {
    check();
    let observed: NativeGraphRead | undefined;
    let diagnostic: ConnectDiagnostic | undefined;
    let calls = 0;
    const receiver = Object.create(connection) as Connection;
    Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
    const observer = {
      httpRequest: (request: unknown, options: unknown) => {
        check();
        graphRequire(++calls === 1);
        const pending = transport.httpRequest.call(transport, request, options);
        const captured = pending.then((response) => {
          check();
          diagnostic = apiDiagnostic(
            response.statusCode,
            response.body,
            response.headers,
            diagnosticRequestId(response.headers),
          );
          graphRequire(
            Number.isInteger(response.statusCode) &&
              (response.statusCode as number) >= 200 &&
              (response.statusCode as number) <= 599 &&
              typeof response.body === 'string',
          );
          observed = {
            status: response.statusCode as number,
            body: JSON.parse(response.body as string) as unknown,
          };
          return response;
        });
        return Object.assign(captured, { stream: () => pending.stream() });
      },
    };
    try {
      await receiver.request({ method: 'GET', url: `${parsed.origin}${route}` }, {
        transport: observer,
        retry: { maxRetries: 0 },
        followRedirect: () => {
          throw new Error('Native Graph redirect refused');
        },
      } as unknown as Parameters<Connection['request']>[1]);
    } catch {
      // A parsed HTTP error is evidence, not absence. Network/redirect/parser failures stay unknown.
      if (observed === undefined && diagnostic)
        throw retainConnectDiagnostic(
          new ConnectError('REQUEST_FAILED', diagnostic.statusCode),
          diagnostic,
        );
      graphRequire(observed !== undefined && observed.status >= 400);
    }
    check();
    graphRequire(calls === 1 && observed !== undefined);
    return retainConnectDiagnostic(structuredClone(observed), diagnostic);
  };
  const base = '/services/data/v68.0';
  const graphs = `${base}/ssot/data-graphs`;
  const query = (soql: string): Promise<NativeGraphRead> =>
    read(`${base}/query?q=${encodeURIComponent(soql)}`);
  const identity = await query('SELECT Id FROM Organization');
  const body = identity.body as { done?: unknown; totalSize?: unknown; records?: unknown };
  try {
    graphRequire(
      identity.status === 200 &&
        body?.done === true &&
        body.totalSize === 1 &&
        Array.isArray(body.records) &&
        body.records.length === 1 &&
        body.records[0]?.Id === orgId,
    );
  } catch (error) {
    if (error instanceof Error) retainConnectDiagnostic(error, getConnectDiagnostic(identity));
    throw error;
  }
  /**
   * Admit a developer name before constructing fixed item, metadata or SOQL requests.
   * @param {string} name Exact Graph developer name.
   * @returns {string} Validated name.
   */
  const name = (name: string): string => {
    check();
    graphRequire(typeof name === 'string' && dataGraphName.test(name));
    return name;
  };
  return {
    orgId,
    check,
    get: (value) => read(`${graphs}/${name(value)}`),
    metadata: (value) =>
      read(`${graphs}/metadata?dataspace=default&dataGraphEntityName=${name(value)}`),
    inventory: () => read(`${graphs}/metadata?dataspace=default`),
    dataSpace: () =>
      query(
        "SELECT Id, DataSpaceApiName, Status, IsDeleted FROM DataSpace WHERE DataSpaceApiName = 'default' LIMIT 2",
      ),
    query: (value) =>
      query(
        `SELECT Id, DataGraphApiName, Status, LastRunStatus, Version, DataSpaceId FROM DataGraph WHERE DataGraphApiName = '${name(value)}'`,
      ),
    root: async (value) => {
      const rootName = name(value);
      const detail = await read(`${base}/ssot/data-model-objects/${rootName}?dataspace=default`);
      if (detail.status !== 200)
        throw retainConnectDiagnostic(
          new Error('Native Graph root unavailable'),
          getConnectDiagnostic(detail),
        );
      check();
      const receiver = Object.create(connection) as Connection;
      Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
      const metadata = await readDmoMetadata(receiver, rootName);
      check();
      return { detail: detail.body, metadata };
    },
    identityResolutions: () => read(`${base}/ssot/identity-resolutions`),
  };
}
