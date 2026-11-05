import { isDeepStrictEqual } from 'node:util';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { setTimeout as pause } from 'node:timers/promises';
import {
  buildCalculatedInsightUpdateDelta,
  observeCalculatedInsight,
  projectCalculatedInsight,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import type { CalculatedInsightProjection } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import {
  calculatedInsightDeployContext,
  planNativeCalculatedInsightDeploy,
} from './preflight-calculated-insight-deploy.js';
import type { CalculatedInsightDeployIntent } from './preflight-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';
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
  status: 'ACTIVE' | 'PROCESSING' | 'DRAFT';
  observations: CalculatedInsightProjection['observations'];
};
export type CalculatedInsightExecutionOptions = CalculatedInsightDeployIntent & {
  nativeClient?: Pick<CalculatedInsightClient, 'create' | 'update'>;
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
  route: { apiVersion: '65.0' | '68.0'; method: 'POST' | 'PATCH'; resource: 'calculated-insights' };
  outcome: 'unchanged' | 'blocked' | 'created' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-created' | 'confirmed-updated' | 'unknown';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Execute one native68 draft create/retaining edit or state-preserving ACTIVE expression edit.
 * @param {unknown} value Complete desired semantic document.
 * @param {CalculatedInsightConnection} connection Explicit native68 receiver.
 * @param {ApiVersionSelection} selection Exact native route.
 * @param {string} dataSpace Default space.
 * @param {CalculatedInsightExecutionOptions} options Fresh input, private observation and intent guards.
 * @returns {Promise<CalculatedInsightExecution>} Independent settlement or conservative uncertainty.
 */
async function executeNativeCalculatedInsightDeploy(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightExecutionOptions,
): Promise<CalculatedInsightExecution> {
  let attempted = false;
  let method: 'POST' | 'PATCH' = 'PATCH';
  const result = (
    outcome: CalculatedInsightExecution['outcome'],
    mutation: CalculatedInsightExecution['mutation'],
    code?: string,
    error?: unknown,
  ): CalculatedInsightExecution => ({
    family: 'calculated-insight',
    route: { apiVersion: '68.0', method, resource: 'calculated-insights' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message: getConnectDiagnostic(error)
              ? operationDiagnostic(
                  error,
                  mutation === 'unknown'
                    ? 'CI mutation may have occurred.'
                    : 'CI deployment was not attempted.',
                )
              : mutation === 'unknown'
                ? 'CI mutation may have occurred; no replay or rollback was performed.'
                : 'Native CI deployment was not attempted; qualification or explicit intent is required.',
          },
        ]
      : [],
  });
  try {
    const desired = validateCalculatedInsightDocument(value);
    const context = calculatedInsightDeployContext(connection, selection, dataSpace, options);
    const draft = options.draft === true;
    if (
      typeof options.verifyInput !== 'function' ||
      typeof options.recordObservation !== 'function'
    )
      throw new Error('Guards absent');
    await options.verifyInput();
    const bound = structuredClone(await context.bind(desired, context.check));
    const baseline = await planNativeCalculatedInsightDeploy(desired, context, draft);
    if (baseline.acquired.state === 'present')
      await options.recordObservation({
        phase: 'baseline',
        status: baseline.acquired.status as 'ACTIVE' | 'DRAFT',
        observations: structuredClone(baseline.acquired.observations),
      });
    await options.verifyInput();
    if (!isDeepStrictEqual(bound, await context.bind(desired, context.check)))
      throw new Error('Dependency drift');
    const fresh = await planNativeCalculatedInsightDeploy(desired, context, draft);
    if (!isDeepStrictEqual(baseline, fresh)) throw new Error('Target drift');
    await options.verifyInput();
    if (!isDeepStrictEqual(desired, validateCalculatedInsightDocument(value)))
      throw new Error('Desired input drift');
    context.check();
    if (fresh.action === 'unchanged') return result('unchanged', 'not-attempted');
    method = fresh.action === 'create' ? 'POST' : 'PATCH';
    if (options.allowProcessing !== true)
      return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    const client =
      options.nativeClient ?? createCalculatedInsightClient(connection, '68.0', dataSpace);
    const now = options.now ?? Date.now;
    let previous = now();
    const end = previous + calculatedInsightPollBudget.timeoutMs;
    let expired = false;
    const check = (): void => {
      context.check();
      const current = now();
      if (
        expired ||
        !Number.isFinite(previous) ||
        !Number.isFinite(current) ||
        current < previous ||
        current >= end
      )
        throw new Error('Deadline');
      previous = current;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      check();
      const work = async (): Promise<CalculatedInsightExecution> => {
        attempted = true;
        // A response is never settlement evidence, and a rejected write is never replayed.
        await (fresh.action === 'create'
          ? client.create(structuredClone(desired))
          : client.update(structuredClone(desired), draft ? { draft: true } : undefined));
        check();
        const settled = await settleCalculatedInsight(
          { ...context, check },
          desired,
          draft ? 'DRAFT' : 'ACTIVE',
          { now, delay: options.delay },
        );
        check();
        if (settled.state !== 'present' || !isDeepStrictEqual(settled.binding, bound))
          throw retainConnectDiagnostic(
            new Error('Settlement unknown'),
            getConnectDiagnostic(settled),
          );
        await options.recordObservation({
          phase: 'settled',
          status: settled.acquisition.status as 'ACTIVE' | 'DRAFT',
          observations: structuredClone(settled.acquisition.observations),
        });
        check();
        return fresh.action === 'create'
          ? result('created', 'confirmed-created')
          : result('updated', 'confirmed-updated');
      };
      return await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Deadline')), end - now());
        }),
      ]);
    } finally {
      expired = true;
      clearTimeout(timer);
    }
  } catch (error) {
    return attempted
      ? result('failed', 'unknown', 'CI_MUTATION_UNCONFIRMED', error)
      : result('blocked', 'not-attempted', 'CI_ADMISSION_FAILED', error);
  }
}

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
  if (
    selection.requested !== '65.0' ||
    'draft' in options ||
    options.context ||
    options.nativeClient
  )
    return executeNativeCalculatedInsightDeploy(value, connection, selection, dataSpace, options);
  const result = (
    outcome: CalculatedInsightExecution['outcome'],
    mutation: CalculatedInsightExecution['mutation'],
    code?: string,
    error?: unknown,
  ): CalculatedInsightExecution => ({
    family: 'calculated-insight',
    route: { apiVersion: '65.0', method: 'PATCH', resource: 'calculated-insights' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message: getConnectDiagnostic(error)
              ? operationDiagnostic(
                  error,
                  mutation === 'unknown'
                    ? 'CI mutation may have occurred.'
                    : 'CI deployment was not attempted.',
                )
              : mutation === 'unknown'
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
      delay = pause,
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
        throw retainConnectDiagnostic(
          new Error('Target unavailable'),
          getConnectDiagnostic(acquired),
        );
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
  } catch (error) {
    return attempted
      ? result('failed', 'unknown', 'CI_UPDATE_UNCONFIRMED', error)
      : result('blocked', 'not-attempted', 'CI_ADMISSION_FAILED', error);
  }
}
