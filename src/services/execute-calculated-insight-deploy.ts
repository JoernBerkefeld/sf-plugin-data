import { isDeepStrictEqual } from 'node:util';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { validateCalculatedInsightDocument } from '../artifacts/calculated-insight-document.js';
import type { CalculatedInsightProjection } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import {
  calculatedInsightDeployContext,
  calculatedInsightPlanEvidence,
  planNativeCalculatedInsightDeploy,
} from './preflight-calculated-insight-deploy.js';
import type { CalculatedInsightDeployIntent } from './preflight-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';
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
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type CalculatedInsightExecution = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'POST' | 'PATCH'; resource: 'calculated-insights' };
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
export async function executeCalculatedInsightDeploy(
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
    if (
      !isDeepStrictEqual(
        calculatedInsightPlanEvidence(baseline),
        calculatedInsightPlanEvidence(fresh),
      )
    )
      throw new Error('Target drift');
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
