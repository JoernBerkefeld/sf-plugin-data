import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  DataGraphError,
  graphRecord,
  graphRequire,
  graphText,
  projectDataGraph,
} from '../artifacts/data-graph-document.js';
import type {
  DataGraphCreationIntent,
  DataGraphDocument,
  DataGraphProjection,
} from '../artifacts/data-graph-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';
import type { McpReadObserver } from '../transport/mcp-execute.js';

export type DataGraphConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;
export type DataGraphReadOptions = {
  creationIntent?: DataGraphCreationIntent;
  observe?: McpReadObserver;
  readGraph?: (apiName: string, observe?: McpReadObserver) => Promise<unknown>;
  readTransform?: (name: string, observe?: McpReadObserver) => Promise<unknown>;
};
export type DataGraphAcquisition = {
  identity: DataGraphDocument['identity'];
  candidate?: DataGraphDocument;
  expectations?: DataGraphProjection['expectations'] & { transform: Record<string, unknown> };
  blockers: string[];
};

/**
 * Require fixed family scope without mutating the caller connection.
 * @param {DataGraphConnection} connection Connection.
 * @param {ApiVersionSelection} selection Fixed selection.
 * @param {string} dataSpace Space.
 */
export function dataGraphScope(
  connection: DataGraphConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
): void {
  graphRequire(
    selection?.requested === '67.0' &&
      selection.restSelector === 'v67.0' &&
      selection.soapNumeric === '67.0' &&
      connection.getApiVersion() === '67.0' &&
      dataSpace === 'default',
  );
}

/**
 * Verify completed owner transform and load/group/output lineage, without invocation-relative freshness.
 * @param {DataGraphProjection} projection Owner projection.
 * @param {unknown} value Independent transform.
 * @returns {Record<string, unknown>} Detached private transform.
 */
export function verifyDataGraphTransform(
  projection: DataGraphProjection,
  value: unknown,
): Record<string, unknown> {
  const raw = graphRecord(value);
  const owner = projection.expectations.graph;
  const node = graphRecord(owner.sourceObject);
  graphRequire(
    raw.name === owner.dayZeroTransformDevName &&
      raw.dataSpaceName === 'default' &&
      raw.creationSource === 'Data Graph' &&
      raw.creationType === 'SYSTEM' &&
      raw.status === 'ACTIVE' &&
      raw.lastRunStatus === 'SUCCESS',
  );
  graphText(raw.id);
  graphRequire(
    typeof raw.lastRunDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(raw.lastRunDate) &&
      Number.isFinite(Date.parse(raw.lastRunDate)) &&
      Number.isFinite(Date.parse(owner.createdDate as string)) &&
      Date.parse(raw.lastRunDate) >= Date.parse(owner.createdDate as string),
  );
  for (const key of ['error', 'errors', 'errorCode', 'body', 'result'])
    graphRequire(!Object.hasOwn(raw, key));
  graphRequire(!Object.hasOwn(raw, 'success') || raw.success === true);
  graphRequire(Array.isArray(raw.definitions) && raw.definitions.length === 1);
  const definition = graphRecord(raw.definitions[0]);
  const nodes = Object.values(graphRecord(definition.nodes)).map((value) => graphRecord(value));
  graphRequire(nodes.length > 0 && nodes.length <= 64);
  const loads = nodes
    .filter((item) => item.action === 'load')
    .map((item) => graphRecord(item.parameters));
  const rootLoads = loads.filter(
    (item) => graphRecord(item.dataset).name === projection.candidate.spec.primaryObjectName,
  );
  graphRequire(
    rootLoads.length === 1 &&
      graphRecord(rootLoads[0].dataset).type === 'dataModelObject' &&
      isDeepStrictEqual(
        rootLoads[0].fields,
        projection.candidate.spec.sourceObject.fields.map((field) => field.sourceFieldName),
      ),
  );
  const aggregates = nodes.filter((item) => item.action === 'jsonAggregate');
  graphRequire(aggregates.length === 1);
  const groups = graphRecord(
    graphRecord(aggregates[0].parameters).jsonAggregate,
  ).jsonAggregateParameters;
  graphRequire(Array.isArray(groups) && groups.length === 1);
  graphRequire(
    isDeepStrictEqual(graphRecord(groups[0]).groupings, ['ssot__Id__c']) &&
      graphRecord(groups[0]).levelName === node.name,
  );
  const outputs = nodes
    .filter((item) => item.action === 'outputD360')
    .map((item) => graphRecord(item.parameters));
  const valueOutput = outputs.filter((item) => item.name === owner.valuesDmoName);
  graphRequire(
    valueOutput.length === 1 &&
      valueOutput[0].type === 'dataModelObject' &&
      valueOutput[0].writeMode === 'OVERWRITE',
  );
  graphRequire(
    isDeepStrictEqual(valueOutput[0].fieldsMappings, [
      { sourceField: 'ssot__Id__c', targetField: 'Id__c' },
      { sourceField: node.name, targetField: 'json_blob__c' },
      { sourceField: 'version', targetField: 'version__c' },
    ]),
  );
  const detached = structuredClone(raw);
  for (const entry of detached.definitions as unknown[]) {
    const item = graphRecord(entry);
    if (!Object.hasOwn(item, 'outputDataObjects')) continue;
    item.outputDataObjects = graphInventory(item.outputDataObjects).map((output) => ({
      ...output,
      fields: graphInventory(output.fields),
    }));
  }
  return graphCanonicalObject(detached) as Record<string, unknown>;
}

/**
 * Sort only evidenced unordered output inventories by exact unique name.
 * @param {unknown} value Inventory.
 * @returns {Array<Record<string, unknown>>} Detached ordered inventory.
 */
function graphInventory(value: unknown): Array<Record<string, unknown>> {
  graphRequire(Array.isArray(value) && value.length <= 4096);
  const entries = value.map((item: unknown) => graphRecord(item));
  const names = new Set<string>();
  for (const entry of entries) {
    graphText(entry.name);
    graphRequire(!names.has(entry.name as string));
    names.add(entry.name as string);
  }
  // eslint-disable-next-line unicorn/no-array-sort -- ES2022 library target; entries is a new array.
  return entries.sort((a, b) =>
    a.name === b.name ? 0 : (a.name as string) < (b.name as string) ? -1 : 1,
  );
}

/**
 * Stabilize JSON object keys without changing any array order.
 * @param {unknown} value Detached JSON.
 * @returns {unknown} Stable JSON.
 */
export function graphCanonicalObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => graphCanonicalObject(item));
  if (value && typeof value === 'object') {
    // eslint-disable-next-line unicorn/no-array-sort -- ES2022 library target; keys is a new array.
    const keys = Object.keys(value).sort();
    return Object.fromEntries(
      keys.map((key) => [key, graphCanonicalObject(graphRecord(value)[key])]),
    );
  }
  return value;
}

/**
 * Acquire settled Graph, completed transform and fresh identical owner GET.
 * @param {DataGraphConnection} connection Connection.
 * @param {string} apiName Exact owner.
 * @param {ApiVersionSelection} apiVersion Version.
 * @param {string} dataSpace Space.
 * @param {DataGraphReadOptions} options Private known intent and reads.
 * @returns {Promise<DataGraphAcquisition>} Candidate or payload-free blockers.
 */
export async function retrieveDataGraph(
  connection: DataGraphConnection,
  apiName: string,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: DataGraphReadOptions = {},
): Promise<DataGraphAcquisition> {
  const identity = { dataSpace: 'default', apiName } as const;
  try {
    dataGraphScope(connection, apiVersion, dataSpace);
    const selection = { ...apiVersion };
    const intent = options.creationIntent ? structuredClone(options.creationIntent) : undefined;
    const client = new McpExecuteClient(connection, selection);
    const readGraph =
      options.readGraph ??
      ((name, observe) =>
        client.read(
          'd360_data_graph_get',
          { dataGraphName: name, includeCIDetails: true, includeSegmentDetails: true },
          observe,
        ));
    const readTransform =
      options.readTransform ??
      ((name, observe) =>
        client.read('d360_transform_get', { dataTransformNameOrId: name }, observe));
    const projection = projectDataGraph(await readGraph(apiName, options.observe), apiName, intent);
    const transform = verifyDataGraphTransform(
      projection,
      await readTransform(
        projection.expectations.graph.dayZeroTransformDevName as string,
        options.observe,
      ),
    );
    const fresh = projectDataGraph(await readGraph(apiName, options.observe), apiName, intent);
    graphRequire(isDeepStrictEqual(projection, fresh) && isDeepStrictEqual(apiVersion, selection));
    dataGraphScope(connection, selection, dataSpace);
    return {
      identity,
      candidate: projection.candidate,
      expectations: { ...projection.expectations, transform },
      blockers: [],
    };
  } catch (error: unknown) {
    return {
      identity,
      blockers: [error instanceof DataGraphError ? error.code : 'DATA_GRAPH_ACQUISITION_FAILED'],
    };
  }
}
