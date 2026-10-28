import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import {
  graphRecord,
  graphRequire,
  projectDataGraph,
  validateDataGraphDocument,
} from '../artifacts/data-graph-document.js';
import type { DataGraphDocument } from '../artifacts/data-graph-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';
import { bindDataGraphDependencies } from './bind-data-graph-dependencies.js';
import { admitDataGraphAcquisition, dataGraphAppend } from './preflight-data-graph-deploy.js';
import type { DataGraphPreflightOptions } from './preflight-data-graph-deploy.js';
import { dataGraphScope, retrieveDataGraph } from './retrieve-data-graph.js';
import type { DataGraphConnection } from './retrieve-data-graph.js';

/** Graph poll reads only; confirmation/eligibility acquisitions are additional bounded reads. */
export const dataGraphPollBudget = Object.freeze({
  reads: 41,
  intervalMs: 60_000,
  timeoutMs: 2_400_000,
});
export type DataGraphObservation = { attempt: number; timestamp: number; body: unknown };
export type DataGraphExecutionOptions = DataGraphPreflightOptions & {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  recordObservation: (observation: DataGraphObservation) => Promise<void>;
  mutate?: (parameters: unknown) => Promise<unknown>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  pollWindow?: { reads: number; intervalMs: number; timeoutMs: number };
};
export type DataGraphDeployExecution = {
  family: 'data-graph';
  route: { apiVersion: '67.0'; operation: 'd360_data_graph_update' };
  outcome: 'unchanged' | 'blocked' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-updated' | 'unknown';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Compare preserved owner/computed bindings with only qualified differences.
 * @param {Record<string, unknown>} before Baseline.
 * @param {Record<string, unknown>} after Independent read.
 * @param {DataGraphDocument} desired Desired.
 */
function preserved(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  desired: DataGraphDocument,
): void {
  const expected = structuredClone(before);
  const actual = structuredClone(after);
  for (const raw of [expected, actual]) {
    delete raw.status;
    delete raw.modifiedDate;
    delete raw.version;
  }
  const expectedNode = graphRecord(expected.sourceObject);
  const actualNode = graphRecord(actual.sourceObject);
  const oldFields = expectedNode.fields as unknown[];
  const fields = actualNode.fields as unknown[];
  graphRequire(
    fields.length === desired.spec.sourceObject.fields.length &&
      isDeepStrictEqual(fields.slice(0, oldFields.length), oldFields),
  );
  expectedNode.fields = [];
  actualNode.fields = [];
  graphRequire(isDeepStrictEqual(expected, actual));
}

/**
 * Execute one full-definition update; uncertain outcomes never replay.
 * @param {unknown} value Desired.
 * @param {DataGraphConnection} connection Connection.
 * @param {ApiVersionSelection} apiVersion Fixed route.
 * @param {string} dataSpace Space.
 * @param {DataGraphExecutionOptions} options Private evidence guards.
 * @returns {Promise<DataGraphDeployExecution>} Conservative result.
 */
export async function executeDataGraphDeploy(
  value: unknown,
  connection: DataGraphConnection,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: DataGraphExecutionOptions,
): Promise<DataGraphDeployExecution> {
  const result = (
    outcome: DataGraphDeployExecution['outcome'],
    mutation: DataGraphDeployExecution['mutation'],
    code?: string,
  ): DataGraphDeployExecution => ({
    family: 'data-graph',
    route: { apiVersion: '67.0', operation: 'd360_data_graph_update' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message:
              mutation === 'unknown'
                ? 'Graph mutation may have occurred; no replay, refresh, activation or rollback was performed.'
                : 'Graph deployment blocked before mutation.',
          },
        ]
      : [],
  });
  let attempted = false;
  try {
    const desired = validateDataGraphDocument(value);
    const selection = { ...apiVersion };
    const origin = connection.instanceUrl;
    const {
      verifyInput,
      recordObservation,
      allowProcessing,
      now = Date.now,
      delay = setTimeout,
      acquire = retrieveDataGraph,
      verifyDependencies = bindDataGraphDependencies,
    } = options;
    const readOptions = {
      creationIntent: options.creationIntent ? structuredClone(options.creationIntent) : undefined,
      readGraph: options.readGraph,
      readTransform: options.readTransform,
    };
    const scope = (): void => {
      dataGraphScope(connection, selection, dataSpace);
      graphRequire(isDeepStrictEqual(apiVersion, selection) && connection.instanceUrl === origin);
    };
    graphRequire(typeof verifyInput === 'function');
    scope();
    const capture = async (): Promise<
      NonNullable<Awaited<ReturnType<typeof retrieveDataGraph>>['expectations']>
    > => {
      scope();
      const acquired = await acquire(
        connection,
        desired.identity.apiName,
        { ...selection },
        dataSpace,
        readOptions,
      );
      const baseline = admitDataGraphAcquisition(acquired, desired);
      scope();
      return baseline;
    };
    await verifyInput();
    const dependency = await verifyDependencies(
      structuredClone(desired),
      connection,
      { ...selection },
      dataSpace,
    );
    graphRequire(typeof dependency?.fingerprint === 'string' && dependency.fingerprint.length > 0);
    const baseline = await capture();
    const current = projectDataGraph(
      baseline.graph,
      desired.identity.apiName,
      baseline.intent,
    ).candidate;
    graphRequire(isDeepStrictEqual(current, desired) || dataGraphAppend(current, desired));
    await verifyInput();
    graphRequire(
      isDeepStrictEqual(
        dependency,
        await verifyDependencies(structuredClone(desired), connection, { ...selection }, dataSpace),
      ),
    );
    const fresh = await capture();
    graphRequire(isDeepStrictEqual(baseline, fresh));
    await verifyInput();
    scope();
    if (isDeepStrictEqual(current, desired)) return result('unchanged', 'not-attempted');
    graphRequire(allowProcessing === true && typeof recordObservation === 'function');
    const window = { ...(options.pollWindow ?? dataGraphPollBudget) };
    graphRequire(
      Number.isInteger(window.reads) &&
        window.reads > 0 &&
        window.reads <= 100 &&
        Number.isFinite(window.intervalMs) &&
        window.intervalMs > 0 &&
        Number.isFinite(window.timeoutMs) &&
        window.timeoutMs > 0 &&
        window.timeoutMs <= 3_600_000,
    );
    const started = now();
    const elapsed = (): void => {
      const duration = now() - started;
      graphRequire(Number.isFinite(duration) && duration >= 0 && duration < window.timeoutMs);
    };
    elapsed();
    const client = new McpExecuteClient(connection, selection);
    const mutate =
      options.mutate ?? ((parameters) => client.mutate('d360_data_graph_update', parameters));
    const read =
      options.readGraph ??
      ((name, observe) =>
        client.read(
          'd360_data_graph_get',
          { dataGraphName: name, includeCIDetails: true, includeSegmentDetails: true },
          observe,
        ));
    const input = {
      name: desired.identity.apiName,
      dataspaceName: 'default',
      ...structuredClone(desired.spec),
    };
    attempted = true;
    const response = graphRecord(await mutate({ input, editScheduleOnly: false }));
    graphRequire(
      response.id === baseline.graph.id &&
        response.name === desired.identity.apiName &&
        response.dataspaceName === 'default' &&
        ['processing', 'editing_post_sync', 'ready'].includes(response.status as string),
    );
    for (const key of ['error', 'errors', 'errorCode', 'body', 'result'])
      graphRequire(!Object.hasOwn(response, key));
    graphRequire(!Object.hasOwn(response, 'success') || response.success === true);
    elapsed();
    for (let attempt = 0; attempt < window.reads; attempt++) {
      if (attempt > 0) await delay(window.intervalMs);
      elapsed();
      let recorded = false;
      const observe = async (body: unknown): Promise<void> => {
        await recordObservation({ attempt, timestamp: now(), body: structuredClone(body) });
        recorded = true;
      };
      let observation: unknown;
      try {
        observation = await read(desired.identity.apiName, observe);
        // Synthetic/family read adapters may return a raw resource; record it before inspecting.
        if (!recorded) await observe({ result: observation });
      } catch {
        if (!recorded) await observe({ unavailable: true });
        throw new Error('Graph poll failed');
      }
      elapsed();
      scope();
      const raw = graphRecord(observation);
      const status = raw.status;
      graphRequire(['processing', 'editing_post_sync', 'ready'].includes(status as string));
      const normalized = { ...raw, status: 'ready' };
      const projected = projectDataGraph(normalized, desired.identity.apiName, baseline.intent);
      graphRequire(isDeepStrictEqual(projected.candidate, desired));
      preserved(baseline.graph, normalized, desired);
      if (status !== 'ready') continue;
      // Independent acquisition repeats exact owner/transform/owner reads, not mutation/poll echo.
      const settled = await capture();
      graphRequire(
        isDeepStrictEqual(
          projectDataGraph(settled.graph, desired.identity.apiName, baseline.intent).candidate,
          desired,
        ),
      );
      preserved(baseline.graph, settled.graph, desired);
      graphRequire(
        settled.transform.id === baseline.transform.id &&
          settled.transform.name === baseline.transform.name &&
          Date.parse(settled.transform.lastRunDate as string) >
            Date.parse(baseline.transform.lastRunDate as string) &&
          Date.parse(settled.transform.lastRunDate as string) >= started,
      );
      graphRequire(
        isDeepStrictEqual(
          dependency,
          await verifyDependencies(
            structuredClone(desired),
            connection,
            { ...selection },
            dataSpace,
          ),
        ),
      );
      elapsed();
      return result('updated', 'confirmed-updated');
    }
    return result('failed', 'unknown', 'DATA_GRAPH_SETTLEMENT_UNCONFIRMED');
  } catch {
    return attempted
      ? result('failed', 'unknown', 'DATA_GRAPH_UPDATE_UNCONFIRMED')
      : result('blocked', 'not-attempted', 'DATA_GRAPH_ADMISSION_FAILED');
  }
}
