import { isDeepStrictEqual } from 'node:util';
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

export type CalculatedInsightPublishOptions = {
  preview?: boolean;
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  recordObservation: (observation: CalculatedInsightObservation) => Promise<void>;
  context?: CalculatedInsightReadContext;
  nativeClient?: Pick<CalculatedInsightClient, 'publish'>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type CalculatedInsightPublishResult = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'PATCH'; resource: 'calculated-insights' };
  outcome: 'publish' | 'published' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-published' | 'unknown';
  requiredEffects: Array<'processing'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Publish an exactly paired, never-run native68 draft; never create, edit SQL or replay.
 * The caller's required verifier must revalidate both paired files and their captured digests.
 * @param {unknown} value Complete paired semantic ownership expectation.
 * @param {CalculatedInsightConnection} connection Explicit native68 receiver.
 * @param {ApiVersionSelection} selection Exact explicit68 route.
 * @param {string} dataSpace Default space only.
 * @param {CalculatedInsightPublishOptions} options Pair verifier, private recorder and explicit effects.
 * @returns {Promise<CalculatedInsightPublishResult>} Payload-free independent settlement evidence.
 */
export async function publishCalculatedInsight(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightPublishOptions,
): Promise<CalculatedInsightPublishResult> {
  let attempted = false;
  const result = (
    outcome: CalculatedInsightPublishResult['outcome'],
    code?: string,
  ): CalculatedInsightPublishResult => ({
    family: 'calculated-insight',
    route: { apiVersion: '68.0', method: 'PATCH', resource: 'calculated-insights' },
    outcome,
    mutation: attempted
      ? outcome === 'published'
        ? 'confirmed-published'
        : 'unknown'
      : 'not-attempted',
    requiredEffects: outcome === 'publish' ? ['processing'] : [],
    diagnostics: code
      ? [
          {
            code,
            message: attempted
              ? 'CI publication may have occurred; no replay or rollback was performed.'
              : 'CI publication was not attempted; paired input, scope, content, dependencies or intent are unqualified.',
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
        acquired.state !== 'present' ||
        !['DRAFT', 'ACTIVE'].includes(acquired.status) ||
        !isDeepStrictEqual(acquired.document, desired)
      )
        throw new Error('Ownership');
      return acquired;
    };
    await options.verifyInput();
    const bound = structuredClone(await context.bind(desired, context.check));
    const baseline = await capture();
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
    if (fresh.status === 'ACTIVE') return result('unchanged');
    if (preview) return result('publish');
    if (options.allowProcessing !== true)
      return result('blocked', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
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
      const work = async (): Promise<CalculatedInsightPublishResult> => {
        attempted = true;
        await client.publish(structuredClone(desired));
        check();
        const settled = await settleCalculatedInsight({ ...context, check }, desired, 'ACTIVE', {
          now,
          delay: options.delay,
        });
        check();
        if (settled.state !== 'present' || !isDeepStrictEqual(settled.binding, bound))
          throw new Error('Settlement');
        await options.recordObservation({
          phase: 'settled',
          status: 'ACTIVE',
          observations: structuredClone(settled.acquisition.observations),
        });
        check();
        return result('published');
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
  } catch {
    return result(
      attempted ? 'failed' : 'blocked',
      attempted ? 'CI_PUBLICATION_UNCONFIRMED' : 'CI_ADMISSION_FAILED',
    );
  }
}
