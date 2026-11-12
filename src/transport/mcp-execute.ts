import type { Connection } from '@salesforce/core';
import {
  apiDiagnostic,
  diagnosticDataProperty,
  diagnosticRequestId,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import type { ConnectDiagnostic } from './connect-diagnostic.js';
import type { ApiVersionSelection } from './api-version.js';
import { ConnectError } from './connect-client.js';

export type IngestionReadOperation =
  | 'd360_dlo_get'
  | 'd360_dlo_kq_list'
  | 'd360_dlo_dependencies_list'
  | 'd360_datastream_dependencies_list'
  | 'd360_datastream_get'
  | 'd360_datastream_list'
  | 'd360_connection_list'
  | 'd360_connection_get'
  | 'd360_connection_schema_get';
export type McpReadOperation = IngestionReadOperation;
/** Private detached wire observation; never include it in artifacts or command results. */
export type McpReadObserver = (observation: unknown) => Promise<void>;
export type McpMutationOperation = 'd360_ci_create';
type Operation = McpReadOperation | McpMutationOperation;
type JsonObject = Record<string, unknown>;
type WireResponse = { statusCode: number; headers?: unknown };
type WirePromise = Promise<WireResponse> & { stream: () => unknown };
type CoreTransport = {
  httpRequest: (...arguments_: unknown[]) => WirePromise;
};

const ingestionReads = new Set<string>([
  'd360_dlo_get',
  'd360_dlo_kq_list',
  'd360_dlo_dependencies_list',
  'd360_datastream_dependencies_list',
  'd360_datastream_get',
  'd360_datastream_list',
  'd360_connection_list',
  'd360_connection_get',
  'd360_connection_schema_get',
]);
const reads = ingestionReads;
const mutations = new Set<string>(['d360_ci_create']);
const namePattern = /^[A-Za-z][A-Za-z0-9_]*$/u;

/** Reject a request without retaining its payload. */
function invalid(): never {
  throw new ConnectError('INVALID_REQUEST');
}

/**
 *
 * @param {unknown} value Candidate JSON value.
 * @param {string[]} keys Exact admitted property names.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function object(value: unknown, keys: string[]): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const result = value as JsonObject;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    invalid();
  return result;
}

/**
 *
 * @param {unknown} value Candidate JSON value.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 *
 * @param {unknown} value Candidate JSON value.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function name(value: unknown): value is string {
  return typeof value === 'string' && namePattern.test(value);
}

/**
 * Reject executable/accessor/non-JSON inputs before serializing once.
 * @param {unknown} value Candidate JSON value.
 * @param {Set<object>} ancestors Current recursion ancestors.
 */
function json(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || ancestors.has(value)) invalid();
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype))
    invalid();
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (typeof key !== 'string' || key === 'toJSON') invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid();
    json(descriptor.value, ancestors);
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) invalid();
  ancestors.delete(value);
}

/**
 *
 * @param {Operation} operation Allowlisted semantic operation.
 * @param {unknown} value Candidate JSON value.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function parameters(operation: Operation, value: unknown): JsonObject {
  switch (operation) {
    case 'd360_connection_get':
    case 'd360_connection_schema_get': {
      const input = object(value, ['connectionId']);
      if (
        typeof input.connectionId !== 'string' ||
        !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u.test(input.connectionId)
      )
        invalid();
      return input;
    }
    case 'd360_dlo_dependencies_list':
    case 'd360_datastream_dependencies_list': {
      const input = object(value, ['recordIdOrDeveloperName']);
      const identity = input.recordIdOrDeveloperName;
      if (
        !name(identity) &&
        (typeof identity !== 'string' || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u.test(identity))
      )
        invalid();
      return input;
    }
    case 'd360_dlo_get':
    case 'd360_dlo_kq_list':
    case 'd360_datastream_get': {
      const input = object(value, ['recordIdOrDeveloperName']);
      if (!name(input.recordIdOrDeveloperName)) invalid();
      return input;
    }
    case 'd360_connection_list': {
      const input = object(value, ['connectorType', 'limit', 'offset']);
      if (input.connectorType !== 'IngestApi' || input.limit !== 200 || input.offset !== 0)
        invalid();
      return input;
    }
    case 'd360_datastream_list': {
      const candidate = value as JsonObject;
      const filtered = candidate && Object.hasOwn(candidate, 'connectionName');
      const input = object(
        value,
        filtered ? ['filter', 'connectionName', 'limit', 'offset'] : ['filter', 'limit', 'offset'],
      );
      if (
        input.filter !== 'INGESTAPI' ||
        (filtered && !name(input.connectionName)) ||
        input.limit !== 200 ||
        input.offset !== 0
      )
        invalid();
      return input;
    }
    case 'd360_ci_create': {
      const parameters_ = object(value, ['input']);
      const input = object(parameters_.input, [
        'apiName',
        'displayName',
        'expression',
        'definitionType',
        'dataSpaceName',
        'draft',
      ]);
      if (
        !name(input.apiName) ||
        !input.apiName.endsWith('__cio') ||
        !text(input.displayName) ||
        !text(input.expression) ||
        input.definitionType !== 'CalculatedMetric' ||
        input.dataSpaceName !== 'default' ||
        input.draft !== true
      )
        invalid();
      return parameters_;
    }
  }
}

/**
 *
 * @param {Operation} operation Allowlisted semantic operation.
 * @param {unknown} parameters_ Operation-specific parameters.
 * @param {unknown} value Candidate JSON value.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function result(operation: Operation, parameters_: JsonObject, value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConnectError('REQUEST_FAILED');
  const envelope = value as JsonObject;
  // Recorded core wire bodies use {result}; CLI body/statusCode and MCP defaultExc/responseCode
  // are separate adapters, not additional success schemas for this direct REST boundary.
  if (
    Object.keys(envelope).some((key) => key !== 'result') ||
    !Object.hasOwn(envelope, 'result') ||
    !envelope.result ||
    typeof envelope.result !== 'object' ||
    Array.isArray(envelope.result)
  )
    throw new ConnectError('REQUEST_FAILED');
  const resource = envelope.result as JsonObject;
  if (
    ['error', 'errors', 'errorCode', 'body', 'result'].some((key) =>
      Object.hasOwn(resource, key),
    ) ||
    (Object.hasOwn(resource, 'success') && resource.success !== true)
  )
    throw new ConnectError('REQUEST_FAILED');
  if (ingestionReads.has(operation)) {
    // Family admission independently validates full identities, source authority and settlement.
    if (Object.keys(resource).length === 0) throw new ConnectError('REQUEST_FAILED');
  } else {
    const input = parameters_.input as JsonObject;
    if (
      resource.apiName !== input.apiName ||
      resource.dataSpace !== 'default' ||
      resource.calculatedInsightStatus !== 'DRAFT'
    )
      throw new ConnectError('REQUEST_FAILED');
  }
  return resource;
}

/** Fixed API67 facade transport only; family admission, effects and settlement remain caller-owned. */
export class McpExecuteClient {
  private readonly url: string;

  public constructor(
    private readonly connection: Pick<Connection, 'instanceUrl' | 'request'>,
    selection: ApiVersionSelection,
  ) {
    if (
      !selection ||
      selection.requested !== '67.0' ||
      selection.restSelector !== 'v67.0' ||
      selection.soapNumeric !== '67.0'
    )
      invalid();
    try {
      const origin = new URL(connection.instanceUrl);
      if (
        origin.protocol !== 'https:' ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
      )
        invalid();
      this.url = `${origin.origin}/services/data/v67.0/ssot/mcp/execute`;
    } catch {
      invalid();
    }
  }

  /**
   * Execute one semantically read-only tool; POST does not make this a mutation.
   * @param {Operation} operation Allowlisted semantic operation.
   * @param {unknown} parameters_ Operation-specific parameters.
   * @param {McpReadObserver} [observe] Private receipt sink, awaited before application classification.
   * @returns {Promise<JsonObject>} Validated application result, not settlement proof.
   */
  public async read(
    operation: McpReadOperation,
    parameters_: unknown,
    observe?: McpReadObserver,
  ): Promise<JsonObject> {
    if (!reads.has(operation) || (observe !== undefined && typeof observe !== 'function'))
      invalid();
    return this.execute(operation, parameters_, observe);
  }

  /**
   * Attempt one mutation only; never retry, refresh, redirect, fall back or infer settlement.
   * @param {Operation} operation Allowlisted semantic operation.
   * @param {unknown} parameters_ Operation-specific parameters.
   * @returns {Promise<JsonObject>} Validated application result, not settlement proof.
   */
  public async mutate(operation: McpMutationOperation, parameters_: unknown): Promise<JsonObject> {
    if (!mutations.has(operation)) invalid();
    return this.execute(operation, parameters_);
  }

  private async execute(
    operation: Operation,
    value: unknown,
    observe?: McpReadObserver,
  ): Promise<JsonObject> {
    let responseStatus: number | undefined;
    let diagnostic: ConnectDiagnostic | undefined;
    try {
      json(value);
      const parametersJson = JSON.stringify(value);
      const parameters_ = parameters(operation, JSON.parse(parametersJson) as unknown);
      const receiver = Object.create(this.connection) as Connection;
      Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
      const transport = (this.connection as unknown as { _transport: CoreTransport })._transport;
      if (!transport || typeof transport.httpRequest !== 'function') invalid();
      // Observe the actual HTTP response before core strips its status while parsing JSON.
      const guarded = {
        httpRequest: (...arguments_: unknown[]) => {
          const pending = transport.httpRequest(...arguments_);
          const checked = pending.then((response) => {
            if (
              Number.isInteger(response?.statusCode) &&
              response.statusCode >= 400 &&
              response.statusCode <= 599
            )
              responseStatus = response.statusCode;
            const headers = diagnosticDataProperty(response, 'headers');
            diagnostic = apiDiagnostic(
              diagnosticDataProperty(response, 'statusCode'),
              diagnosticDataProperty(response, 'body'),
              headers,
              diagnosticRequestId(headers),
            );
            if (
              !response ||
              !Number.isInteger(response.statusCode) ||
              (response.statusCode < 400 &&
                response.statusCode !== 200 &&
                response.statusCode !== 201)
            )
              throw new ConnectError('REQUEST_FAILED');
            return response;
          }) as WirePromise;
          checked.stream = () => pending.stream();
          return checked;
        },
      };
      const response = await receiver.request<unknown>(
        {
          method: 'POST',
          url: this.url,
          body: JSON.stringify({ toolName: operation, paramsJson: parametersJson }),
          headers: { 'content-type': 'application/json' },
        },
        {
          transport: guarded,
          retry: { maxRetries: 0 },
          followRedirect: () => {
            throw new ConnectError('REQUEST_FAILED');
          },
        } as unknown as Parameters<Connection['request']>[1],
      );
      // Record actual body (including nested errors/unknown status) before strict classification.
      // Detach it so an observer cannot alter what is subsequently admitted. Recorder failure
      // fails closed; mutation calls never accept this observation hook.
      if (observe) await observe(structuredClone(response));
      return result(operation, parameters_, response);
    } catch (error: unknown) {
      if (error instanceof ConnectError) throw error;
      const status =
        error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      const expired =
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'INVALID_SESSION_ID';
      const statusCode =
        typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : responseStatus;
      throw retainConnectDiagnostic(
        new ConnectError(
          statusCode === 401 || expired ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED',
          statusCode,
        ),
        diagnostic ?? apiDiagnostic(statusCode, diagnosticDataProperty(error, 'data')),
      );
    }
  }
}
