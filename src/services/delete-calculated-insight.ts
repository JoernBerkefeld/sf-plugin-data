import { isDeepStrictEqual } from 'node:util';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { validateCalculatedInsightDocument } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { calculatedInsightDeployContext } from './preflight-calculated-insight-deploy.js';
import { acquireExactCalculatedInsight } from './retrieve-calculated-insight.js';
import type {
  CalculatedInsightConnection,
  CalculatedInsightReadContext,
} from './retrieve-calculated-insight.js';
import type { CalculatedInsightObservation } from './execute-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';

export type CalculatedInsightDeleteOptions = {
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
  recordObservation: (observation: CalculatedInsightObservation) => Promise<void>;
  context?: CalculatedInsightReadContext;
  nativeClient?: Pick<CalculatedInsightClient, 'delete'>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type CalculatedInsightDeleteResult = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'DELETE'; resource: 'calculated-insights' };
  outcome: 'delete' | 'deleted' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-deleted' | 'unknown';
  requiredEffects: Array<'destructive'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Delete only an exactly paired, never-run native68 component, without cascade or replay.
 * The required verifier revalidates both paired files and their captured digests.
 * @param {unknown} value Complete paired semantic ownership expectation, not a selector.
 * @param {CalculatedInsightConnection} connection Explicit native68 receiver.
 * @param {ApiVersionSelection} selection Exact explicit68 route.
 * @param {string} dataSpace Default space only.
 * @param {CalculatedInsightDeleteOptions} options Pair guards and explicit destructive confirmation.
 * @returns {Promise<CalculatedInsightDeleteResult>} Payload-free independently proven outcome.
 */
export async function deleteCalculatedInsight(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightDeleteOptions,
): Promise<CalculatedInsightDeleteResult> {
  let attempted = false;
  const result = (
    outcome: CalculatedInsightDeleteResult['outcome'],
    code?: string,
    error?: unknown,
  ): CalculatedInsightDeleteResult => ({
    family: 'calculated-insight',
    route: { apiVersion: '68.0', method: 'DELETE', resource: 'calculated-insights' },
    outcome,
    mutation: attempted
      ? outcome === 'deleted'
        ? 'confirmed-deleted'
        : 'unknown'
      : 'not-attempted',
    requiredEffects: outcome === 'delete' ? ['destructive'] : [],
    diagnostics: code
      ? [
          {
            code,
            message: getConnectDiagnostic(error)
              ? operationDiagnostic(
                  error,
                  attempted ? 'CI deletion may have occurred.' : 'CI deletion was not attempted.',
                )
              : attempted
                ? 'CI deletion may have occurred; no replay or rollback was performed.'
                : 'CI deletion was not attempted; paired input, scope, ownership, dependencies or intent are unqualified.',
          },
        ]
      : [],
  });
  try {
    const desired = validateCalculatedInsightDocument(value);
    if (desired.spec.publishScheduleInterval !== 'NOT_SCHEDULED') throw new Error('Schedule');
    if (
      typeof options.verifyInput !== 'function' ||
      typeof options.recordObservation !== 'function'
    )
      throw new Error('Required guards');
    const context = calculatedInsightDeployContext(connection, selection, dataSpace, {
      context: options.context,
    });
    const preview = options.preview === true;
    if ('preview' in options && typeof options.preview !== 'boolean') throw new Error('Preview');
    const capture = async () => {
      context.check();
      const acquired = await acquireExactCalculatedInsight(context, desired.identity.apiName);
      context.check();
      if (
        acquired.state === 'unknown' ||
        (acquired.state === 'present' &&
          (!['DRAFT', 'ACTIVE'].includes(acquired.status) ||
            !isDeepStrictEqual(acquired.document, desired)))
      )
        throw retainConnectDiagnostic(new Error('Ownership'), getConnectDiagnostic(acquired));
      return acquired;
    };
    await options.verifyInput();
    const bound = structuredClone(await context.bind(desired, context.check));
    const baseline = await capture();
    if (baseline.state === 'present')
      await options.recordObservation({
        phase: 'baseline',
        status: baseline.status as 'DRAFT' | 'ACTIVE',
        observations: structuredClone(baseline.observations),
      });
    await options.verifyInput();
    if (!isDeepStrictEqual(bound, await context.bind(desired, context.check)))
      throw new Error('Dependency drift');
    const fresh = await capture();
    if (!isDeepStrictEqual(baseline, fresh)) throw new Error('Target drift');
    await options.verifyInput();
    if (!isDeepStrictEqual(desired, validateCalculatedInsightDocument(value)))
      throw new Error('Input drift');
    context.check();
    if (fresh.state === 'absent') return result('unchanged');
    if (preview) return result('delete');
    if (options.confirmDelete !== true)
      return result('blocked', 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
    const client =
      options.nativeClient ?? createCalculatedInsightClient(connection, '68.0', dataSpace);
    const now = options.now ?? Date.now;
    let previous = now();
    const end = previous + 120_000;
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
      const work = async (): Promise<CalculatedInsightDeleteResult> => {
        attempted = true;
        await client.delete(desired.identity.apiName);
        check();
        const settled = await settleCalculatedInsight({ ...context, check }, desired, 'absent', {
          now,
          delay: options.delay,
        });
        check();
        if (settled.state !== 'absent')
          throw retainConnectDiagnostic(new Error('Settlement'), getConnectDiagnostic(settled));
        return result('deleted');
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
    return result(
      attempted ? 'failed' : 'blocked',
      attempted ? 'CI_DELETION_UNCONFIRMED' : 'CI_ADMISSION_FAILED',
      error,
    );
  }
}
