import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import {
  buildCalculatedInsightUpdateDelta,
  observeCalculatedInsight,
  projectCalculatedInsight,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import type { CalculatedInsightProjection } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { bindCalculatedInsightDependencies } from './bind-calculated-insight-dependencies.js';
import {
  calculatedInsightScope,
  retrieveCalculatedInsight,
} from './retrieve-calculated-insight.js';
import type { CalculatedInsightConnection } from './retrieve-calculated-insight.js';

export const calculatedInsightPollBudget = Object.freeze({
  reads: 12,
  intervalMs: 1000,
  timeoutMs: 120_000,
});
export type CalculatedInsightObservation = {
  phase: 'baseline' | 'echo' | 'poll' | 'settled';
  status: 'ACTIVE' | 'PROCESSING';
  observations: CalculatedInsightProjection['observations'];
};
export type CalculatedInsightExecutionOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  recordObservation: (observation: CalculatedInsightObservation) => Promise<void>;
  acquire?: typeof retrieveCalculatedInsight;
  bind?: typeof bindCalculatedInsightDependencies;
  patch?: (value: unknown) => Promise<unknown>;
  read?: (apiName: string) => Promise<unknown>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type CalculatedInsightExecution = {
  family: 'calculated-insight';
  route: { apiVersion: '65.0'; method: 'PATCH'; resource: 'calculated-insights' };
  outcome: 'unchanged' | 'blocked' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-updated' | 'unknown';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Execute an existing ACTIVE expression-only delta with at most one mutation attempt.
 * Twelve reads means runtime polls; final independent runtime/Metadata and binding reads
 * additionally consume the same wall-clock deadline, which starts before PATCH.
 * @param {unknown} value Complete desired document.
 * @param {CalculatedInsightConnection} connection Existing authenticated target.
 * @param {ApiVersionSelection} selection Explicit API65 route.
 * @param {string} dataSpace Default target space.
 * @param {CalculatedInsightExecutionOptions} options Input/effect guards and private observations.
 * @returns {Promise<CalculatedInsightExecution>} Conservative payload-free mutation evidence.
 */
export async function executeCalculatedInsightDeploy(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightExecutionOptions,
): Promise<CalculatedInsightExecution> {
  const result = (
    outcome: CalculatedInsightExecution['outcome'],
    mutation: CalculatedInsightExecution['mutation'],
    code?: string,
  ): CalculatedInsightExecution => ({
    family: 'calculated-insight',
    route: { apiVersion: '65.0', method: 'PATCH', resource: 'calculated-insights' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message:
              mutation === 'unknown'
                ? 'CI update may have occurred; no replay or rollback was performed.'
                : 'CI deployment was not attempted; resolve input, scope, effects or target qualification.',
          },
        ]
      : [],
  });
  let attempted = false;
  try {
    const desired = validateCalculatedInsightDocument(value);
    const version = { ...selection };
    const {
      allowProcessing,
      verifyInput,
      recordObservation,
      acquire = retrieveCalculatedInsight,
      bind = bindCalculatedInsightDependencies,
      now = Date.now,
      delay = setTimeout,
    } = options;
    if (typeof verifyInput !== 'function' || typeof recordObservation !== 'function')
      throw new Error('Required guards absent');
    const scope = (): void => {
      calculatedInsightScope(connection, version, dataSpace, desired.identity.apiName);
      if (!isDeepStrictEqual(selection, version)) throw new Error('Version drift');
    };
    const capture = async (): Promise<{
      projection: CalculatedInsightProjection;
      runtime: unknown;
      metadata: unknown;
    }> => {
      scope();
      const acquired = await acquire(
        connection,
        desired.identity.apiName,
        { ...version },
        dataSpace,
      );
      if (
        !acquired.expectations ||
        !acquired.candidate ||
        acquired.blockers.length > 0 ||
        !isDeepStrictEqual(acquired.identity, desired.identity)
      )
        throw new Error('Target unavailable');
      const projection = projectCalculatedInsight(
        acquired.expectations.runtime,
        acquired.expectations.metadata,
      );
      if (!isDeepStrictEqual(projection.document, acquired.candidate))
        throw new Error('Target correlation failed');
      return { projection, ...structuredClone(acquired.expectations) };
    };
    scope();
    await verifyInput();
    const bound = await bind(desired, connection, { ...version }, dataSpace);
    const baseline = await capture();
    await recordObservation({
      phase: 'baseline',
      status: 'ACTIVE',
      observations: structuredClone(baseline.projection.observations),
    });
    await verifyInput();
    if (!isDeepStrictEqual(bound, await bind(desired, connection, { ...version }, dataSpace)))
      throw new Error('Dependency drift');
    const fresh = await capture();
    if (!isDeepStrictEqual(fresh.projection.document, baseline.projection.document))
      throw new Error('Target drift');
    const delta = buildCalculatedInsightUpdateDelta(
      desired,
      fresh.runtime,
      fresh.metadata,
      dataSpace,
    );
    if (delta.status === 'blocked') throw new Error('Delta blocked');
    await verifyInput();
    scope();
    if (delta.status === 'unchanged') return result('unchanged', 'not-attempted');
    if (allowProcessing !== true)
      return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    const client = new ConnectClient(connection, version);
    const patch = options.patch ?? ((document: unknown) => client.patchCalculatedInsight(document));
    const read =
      options.read ??
      ((name: string) => client.get(`/services/data/v65.0/ssot/calculated-insights/${name}`));
    const started = now();
    const deadline = (): void => {
      const elapsed = now() - started;
      if (
        !Number.isFinite(started) ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed >= calculatedInsightPollBudget.timeoutMs
      )
        throw new Error('Deadline exceeded');
    };
    const observe = async (
      raw: unknown,
      phase: CalculatedInsightObservation['phase'],
    ): Promise<'ACTIVE' | 'PROCESSING'> => {
      deadline();
      const observed = observeCalculatedInsight(raw);
      await recordObservation({
        phase,
        status: observed.status,
        observations: structuredClone(observed.observations),
      });
      deadline();
      if (!isDeepStrictEqual(observed.document, desired)) throw new Error('Readback drift');
      return observed.status;
    };
    deadline();
    attempted = true;
    await observe(await patch(structuredClone(desired)), 'echo');
    for (let attempt = 0; attempt < calculatedInsightPollBudget.reads; attempt++) {
      deadline();
      if (attempt > 0) await delay(calculatedInsightPollBudget.intervalMs);
      deadline();
      if ((await observe(await read(desired.identity.apiName), 'poll')) === 'PROCESSING') continue;
      const settled = await capture();
      deadline();
      await recordObservation({
        phase: 'settled',
        status: 'ACTIVE',
        observations: structuredClone(settled.projection.observations),
      });
      deadline();
      if (
        !isDeepStrictEqual(settled.projection.document, desired) ||
        !isDeepStrictEqual(bound, await bind(desired, connection, { ...version }, dataSpace))
      )
        throw new Error('Final readback drift');
      deadline();
      scope();
      return result('updated', 'confirmed-updated');
    }
    return result('failed', 'unknown', 'CI_SETTLEMENT_UNCONFIRMED');
  } catch {
    return attempted
      ? result('failed', 'unknown', 'CI_UPDATE_UNCONFIRMED')
      : result('blocked', 'not-attempted', 'CI_ADMISSION_FAILED');
  }
}
