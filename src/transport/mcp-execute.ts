import type { Connection } from '@salesforce/core';
import type { ApiVersionSelection } from './api-version.js';
import { ConnectError } from './connect-client.js';
import { ingestionEvent } from '../artifacts/ingestion-dlo-document.js';

export type IngestionReadOperation =
  | 'd360_dlo_get'
  | 'd360_dlo_kq_list'
  | 'd360_datastream_get'
  | 'd360_datastream_list'
  | 'd360_connection_list'
  | 'd360_connection_get'
  | 'd360_connection_schema_get';
export type McpReadOperation =
  'd360_data_graph_get' | 'd360_ir_get' | 'd360_transform_get' | IngestionReadOperation;
/** Private detached wire observation; never include it in artifacts or command results. */
export type McpReadObserver = (observation: unknown) => Promise<void>;
export type McpMutationOperation =
  | 'd360_ci_create'
  | 'd360_data_graph_create'
  | 'd360_data_graph_update'
  | 'd360_data_graph_delete'
  | 'd360_ir_create'
  | 'd360_ir_update'
  | 'd360_ir_delete'
  | 'd360_connection_schema_put_ingestion_api'
  | 'd360_datastream_patch_ingestion_api';
type Operation = McpReadOperation | McpMutationOperation;
type JsonObject = Record<string, unknown>;
type WireResponse = { statusCode: number };
type WirePromise = Promise<WireResponse> & { stream: () => unknown };
type CoreTransport = {
  httpRequest: (...arguments_: unknown[]) => WirePromise;
};

const ingestionReads = new Set<string>([
  'd360_dlo_get',
  'd360_dlo_kq_list',
  'd360_datastream_get',
  'd360_datastream_list',
  'd360_connection_list',
  'd360_connection_get',
  'd360_connection_schema_get',
]);
const reads = new Set<string>([
  'd360_data_graph_get',
  'd360_ir_get',
  'd360_transform_get',
  ...ingestionReads,
]);
const mutations = new Set<string>([
  'd360_ci_create',
  'd360_connection_schema_put_ingestion_api',
  'd360_datastream_patch_ingestion_api',
  'd360_data_graph_create',
  'd360_data_graph_update',
  'd360_data_graph_delete',
  'd360_ir_create',
  'd360_ir_update',
  'd360_ir_delete',
]);
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
 * @param {unknown} value Candidate JSON value.
 * @param {boolean} update Allow the qualified update omission of creationMode.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function graph(value: unknown, update: boolean): JsonObject {
  const input = object(value, [
    'name',
    'label',
    'description',
    ...(!update || (value && typeof value === 'object' && Object.hasOwn(value, 'creationMode'))
      ? ['creationMode']
      : []),
    'dataspaceName',
    'primaryObjectName',
    'type',
    'fullRefreshConfig',
    'incrementalRefreshConfig',
    'sourceObject',
  ]);
  if (
    !name(input.name) ||
    !text(input.label) ||
    typeof input.description !== 'string' ||
    ((!update || Object.hasOwn(input, 'creationMode')) && input.creationMode !== 'DEFAULT') ||
    input.dataspaceName !== 'default' ||
    !name(input.primaryObjectName) ||
    !input.primaryObjectName.endsWith('__dlm') ||
    input.type !== 'NONE'
  )
    invalid();
  const schedule = object(object(input.fullRefreshConfig, ['schedule']).schedule, [
    'frequency',
    'timeGranularity',
  ]);
  if (schedule.frequency !== 7 || schedule.timeGranularity !== 'Day') invalid();
  if (object(input.incrementalRefreshConfig, ['enabled']).enabled !== false) invalid();
  const source = object(input.sourceObject, [
    'name',
    'devName',
    'label',
    'path',
    'fields',
    'relatedObjects',
  ]);
  if (
    source.name !== input.primaryObjectName ||
    source.devName !== source.name ||
    !text(source.label) ||
    !Array.isArray(source.path) ||
    source.path.length > 0 ||
    !Array.isArray(source.relatedObjects) ||
    source.relatedObjects.length > 0 ||
    !Array.isArray(source.fields) ||
    source.fields.length < 2 ||
    source.fields.length > 3
  )
    invalid();
  const fields = source.fields as unknown[];
  const expected = ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'];
  for (const [index, value] of fields.entries()) {
    const field = object(value, ['sourceFieldName', 'dataType', 'isKeyColumn', 'isProjected']);
    if (
      field.sourceFieldName !== expected[index] ||
      field.dataType !== 'Text' ||
      field.isKeyColumn !== (index === 0) ||
      field.isProjected !== true
    )
      invalid();
  }
  return input;
}

/**
 *
 * @param {unknown} value Candidate JSON value.
 * @param {boolean} create Whether this is the create contract.
 * @returns {unknown} Validated value or a fail-closed diagnostic.
 */
function ir(value: unknown, create: boolean): JsonObject {
  const input = object(value, [
    ...(create ? ['configurationType', 'dataSpaceName', 'rulesetId'] : []),
    'label',
    'description',
    'doesRunAutomatically',
    'matchRules',
    'reconciliationRules',
  ]);
  if (
    !text(input.label) ||
    typeof input.description !== 'string' ||
    input.doesRunAutomatically !== false ||
    (create &&
      (input.configurationType !== 'Individual' ||
        input.dataSpaceName !== 'default' ||
        typeof input.rulesetId !== 'string' ||
        !/^[A-Za-z0-9]{4}$/u.test(input.rulesetId)))
  )
    invalid();
  const rules = object(input.matchRules, ['rules']).rules;
  if (!Array.isArray(rules) || rules.length !== 1) invalid();
  const rule = object(rules[0], ['label', 'criteria']);
  const criteria = object(rule.criteria, ['criteria']).criteria;
  if (!text(rule.label) || !Array.isArray(criteria) || criteria.length !== 3) invalid();
  const expected = [
    ['ssot__Individual__dlm', 'ssot__FirstName__c', 'Fuzzy'],
    ['ssot__Individual__dlm', 'ssot__LastName__c', 'Exact'],
    ['ssot__ContactPointEmail__dlm', 'ssot__EmailAddress__c', 'ExactNormalized'],
  ];
  for (const [index, value] of criteria.entries()) {
    const item = object(value, [
      'entityName',
      'fieldName',
      'matchMethodType',
      'shouldMatchOnBlank',
    ]);
    if (
      item.entityName !== expected[index][0] ||
      item.fieldName !== expected[index][1] ||
      item.matchMethodType !== expected[index][2] ||
      item.shouldMatchOnBlank !== false
    )
      invalid();
  }
  const reconciliation = object(input.reconciliationRules, ['rules']).rules;
  if (!Array.isArray(reconciliation) || reconciliation.length !== 1) invalid();
  const item = object(reconciliation[0], ['entityName', 'ruleType', 'shouldIgnoreEmptyValue']);
  if (
    item.entityName !== 'ssot__Individual__dlm' ||
    item.ruleType !== (create ? 'LastUpdated' : 'MostFrequent') ||
    item.shouldIgnoreEmptyValue !== true
  )
    invalid();
  return input;
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
    case 'd360_dlo_get':
    case 'd360_dlo_kq_list':
    case 'd360_datastream_get':
    case 'd360_datastream_patch_ingestion_api': {
      const sync = operation === 'd360_datastream_patch_ingestion_api';
      const input = object(
        value,
        sync ? ['recordIdOrDeveloperName', 'syncSchema'] : ['recordIdOrDeveloperName'],
      );
      if (!name(input.recordIdOrDeveloperName) || (sync && input.syncSchema !== true)) invalid();
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
    case 'd360_connection_schema_put_ingestion_api': {
      const input = object(value, ['connectionId', 'objects']);
      if (
        typeof input.connectionId !== 'string' ||
        !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u.test(input.connectionId) ||
        !Array.isArray(input.objects) ||
        input.objects.length !== 1
      )
        invalid();
      ingestionEvent(input.objects[0]);
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
    case 'd360_data_graph_create':
    case 'd360_data_graph_update': {
      const update = operation === 'd360_data_graph_update';
      const parameters_ = object(value, update ? ['input', 'editScheduleOnly'] : ['input']);
      graph(parameters_.input, update);
      if (update && parameters_.editScheduleOnly !== false) invalid();
      return parameters_;
    }
    case 'd360_transform_get': {
      const parameters_ = object(value, ['dataTransformNameOrId']);
      if (!name(parameters_.dataTransformNameOrId)) invalid();
      return parameters_;
    }
    case 'd360_ir_create': {
      const parameters_ = object(value, ['input']);
      ir(parameters_.input, true);
      return parameters_;
    }
    case 'd360_ir_update': {
      const parameters_ = object(value, ['identityResolution', 'input']);
      if (
        !name(parameters_.identityResolution) ||
        !/^Individual_[A-Za-z0-9]{4}$/u.test(parameters_.identityResolution)
      )
        invalid();
      ir(parameters_.input, false);
      return parameters_;
    }
    case 'd360_data_graph_get':
    case 'd360_data_graph_delete': {
      const read = operation === 'd360_data_graph_get';
      const parameters_ = object(
        value,
        read ? ['dataGraphName', 'includeCIDetails', 'includeSegmentDetails'] : ['dataGraphName'],
      );
      if (
        !name(parameters_.dataGraphName) ||
        (read &&
          (parameters_.includeCIDetails !== true || parameters_.includeSegmentDetails !== true))
      )
        invalid();
      return parameters_;
    }
    default: {
      const parameters_ = object(value, ['identityResolution']);
      if (!name(parameters_.identityResolution)) invalid();
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
  if (
    ingestionReads.has(operation) ||
    operation === 'd360_connection_schema_put_ingestion_api' ||
    operation === 'd360_datastream_patch_ingestion_api'
  ) {
    // Family admission independently validates full identities, source authority and settlement.
    if (Object.keys(resource).length === 0) throw new ConnectError('REQUEST_FAILED');
  } else if (operation.endsWith('_delete')) {
    if (Object.keys(resource).length !== 1 || resource.success !== true)
      throw new ConnectError('REQUEST_FAILED');
  } else if (operation === 'd360_ci_create') {
    const input = parameters_.input as JsonObject;
    if (
      resource.apiName !== input.apiName ||
      resource.dataSpace !== 'default' ||
      resource.calculatedInsightStatus !== 'DRAFT'
    )
      throw new ConnectError('REQUEST_FAILED');
  } else if (operation === 'd360_transform_get') {
    // Read the exact owner-returned name (or returned id); do not derive a transform name.
    // Pending/failed runs remain observations, not eligibility or successful processing proof.
    if (
      (resource.name !== parameters_.dataTransformNameOrId &&
        resource.id !== parameters_.dataTransformNameOrId) ||
      !text(resource.name) ||
      !name(resource.name) ||
      !text(resource.id) ||
      resource.dataSpaceName !== 'default' ||
      resource.creationSource !== 'Data Graph' ||
      !text(resource.status) ||
      !text(resource.lastRunStatus) ||
      (resource.lastRunDate !== null &&
        (typeof resource.lastRunDate !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(resource.lastRunDate) ||
          !Number.isFinite(Date.parse(resource.lastRunDate))))
    )
      throw new ConnectError('REQUEST_FAILED');
  } else if (operation.startsWith('d360_data_graph_')) {
    const expected =
      operation === 'd360_data_graph_get'
        ? parameters_.dataGraphName
        : (parameters_.input as JsonObject).name;
    if (
      resource.name !== expected ||
      resource.dataspaceName !== 'default' ||
      !text(resource.id) ||
      !['creating', 'processing', 'editing_post_sync', 'ready'].includes(resource.status as string)
    )
      throw new ConnectError('REQUEST_FAILED');
  } else {
    const expected =
      operation === 'd360_ir_create'
        ? `Individual_${(parameters_.input as JsonObject).rulesetId as string}`
        : parameters_.identityResolution;
    if (
      resource.objectApiName !== expected ||
      resource.dataSpaceName !== 'default' ||
      !text(resource.id) ||
      !['PUBLISHING', 'PUBLISHED', 'DELETING'].includes(resource.rulesetStatus as string)
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
   * @param {McpReadObserver} [observe] Private ingestion-only sink, awaited before classification.
   * @returns {Promise<JsonObject>} Validated application result, not settlement proof.
   */
  public async mutate(
    operation: McpMutationOperation,
    parameters_: unknown,
    observe?: McpReadObserver,
  ): Promise<JsonObject> {
    if (
      !mutations.has(operation) ||
      (observe !== undefined &&
        (typeof observe !== 'function' ||
          ![
            'd360_connection_schema_put_ingestion_api',
            'd360_datastream_patch_ingestion_api',
          ].includes(operation)))
    )
      invalid();
    return this.execute(operation, parameters_, observe);
  }

  private async execute(
    operation: Operation,
    value: unknown,
    observe?: McpReadObserver,
  ): Promise<JsonObject> {
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
      throw new ConnectError(
        status === 401 || expired ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED',
        typeof status === 'number' && status >= 400 && status <= 599 ? status : undefined,
      );
    }
  }
}
