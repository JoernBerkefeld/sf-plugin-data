import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { rejectedNextAction } from './deploy-result.js';
import {
  CalculatedInsightError,
  calculatedInsightMatches,
  validateNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { calculatedInsightDeployContext } from './preflight-calculated-insight-deploy.js';
import { acquireCalculatedInsight } from './native-calculated-insight.js';
import type {
  CalculatedInsightConnection,
  CalculatedInsightReadContext,
} from './native-calculated-insight.js';
import { rejectedWrite } from './execute-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';
import type { CalculatedInsightTiming } from './settle-calculated-insight.js';

export type CalculatedInsightPublishOptions = CalculatedInsightTiming & {
  preview?: boolean;
  verifyInput: () => Promise<void>;
  context?: CalculatedInsightReadContext;
  nativeClient?: Pick<CalculatedInsightClient, 'update'>;
};
export type CalculatedInsightPublishResult = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'PATCH'; resource: 'calculated-insights' };
  outcome: 'publish' | 'published' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-published' | 'unknown' | 'rejected';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Publish one existing insight: an ACTIVE insight that holds every key of the document is
 * unchanged; otherwise one PATCH sends the document with `draft: false` (the files' SQL,
 * label and schedule become the active definition) and the insight is read until it is
 * ACTIVE with the document. Never creates; one attempt, no replay or rollback.
 * @param {unknown} value Document from the files (JSON with its SQL).
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {ApiVersionSelection} selection Route selection (68.0).
 * @param {string} dataSpace Selected data space.
 * @param {CalculatedInsightPublishOptions} options Input verifier, preview and test seams.
 * @returns {Promise<CalculatedInsightPublishResult>} Payload-free outcome.
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
    mutation: CalculatedInsightPublishResult['mutation'],
    code?: string,
    error?: unknown,
  ): CalculatedInsightPublishResult =>
    retainConnectDiagnostic(
      {
        family: 'calculated-insight' as const,
        route: {
          apiVersion: '68.0' as const,
          method: 'PATCH' as const,
          resource: 'calculated-insights' as const,
        },
        outcome,
        mutation,
        diagnostics: code
          ? [
              {
                code,
                message: (() => {
                  const next =
                    mutation === 'rejected'
                      ? rejectedNextAction
                      : mutation === 'unknown'
                        ? 'CI publication may have occurred; no replay or rollback was performed.'
                        : 'CI publication was not attempted.';
                  return getConnectDiagnostic(error) ? operationDiagnostic(error, next) : next;
                })(),
              },
            ]
          : [],
      },
      getConnectDiagnostic(error),
    );
  try {
    const desired = validateNativeCalculatedInsight(value);
    if (typeof options.verifyInput !== 'function') throw new Error('Required guards');
    if ('preview' in options && typeof options.preview !== 'boolean') throw new Error('Preview');
    const context = calculatedInsightDeployContext(
      connection,
      selection,
      dataSpace,
      desired,
      options.context,
    );
    await options.verifyInput();
    const acquired = await acquireCalculatedInsight(context, desired.apiName);
    context.check();
    // Publication needs the insight; creating it is `sf data360 deploy`.
    if (acquired.state === 'absent') throw new CalculatedInsightError('CI_NOT_FOUND');
    await options.verifyInput();
    if (acquired.status === 'ACTIVE' && calculatedInsightMatches(desired, acquired.document))
      return result('unchanged', 'not-attempted');
    if (options.preview === true) return result('publish', 'not-attempted');
    const client =
      options.nativeClient ?? createCalculatedInsightClient(connection, '68.0', dataSpace);
    context.check();
    attempted = true;
    try {
      await client.update(structuredClone(desired), {
        draft: false,
        observed: acquired.document,
      });
    } catch (error) {
      if (rejectedWrite(error)) return result('failed', 'rejected', 'REQUEST_FAILED', error);
      throw error;
    }
    await settleCalculatedInsight(context, desired, 'ACTIVE', options);
    return result('published', 'confirmed-published');
  } catch (error) {
    const code = error instanceof CalculatedInsightError ? error.code : undefined;
    return attempted
      ? result('failed', 'unknown', code ?? 'CI_PUBLICATION_UNCONFIRMED', error)
      : result('blocked', 'not-attempted', code ?? 'CI_ADMISSION_FAILED', error);
  }
}
