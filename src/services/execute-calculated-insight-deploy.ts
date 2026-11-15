import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { rejectedNextAction } from './deploy-result.js';
import {
  CalculatedInsightError,
  validateNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { ConnectError } from '../transport/connect-client.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import {
  calculatedInsightDeployContext,
  planNativeCalculatedInsightDeploy,
} from './preflight-calculated-insight-deploy.js';
import type { CalculatedInsightDeployIntent } from './preflight-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';
import type { CalculatedInsightTiming } from './settle-calculated-insight.js';
import type { CalculatedInsightConnection } from './native-calculated-insight.js';

export type CalculatedInsightExecutionOptions = CalculatedInsightDeployIntent &
  CalculatedInsightTiming & {
    nativeClient?: Pick<CalculatedInsightClient, 'create' | 'update'>;
    verifyInput: () => Promise<void>;
  };
export type CalculatedInsightExecution = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'POST' | 'PATCH'; resource: 'calculated-insights' };
  outcome: 'unchanged' | 'blocked' | 'created' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-created' | 'confirmed-updated' | 'unknown' | 'rejected';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Whether a write failed with Salesforce's synchronous HTTP 4xx answer (nothing applied).
 * @param {unknown} error Write failure.
 * @returns {boolean} True for a 4xx refusal.
 */
export function rejectedWrite(error: unknown): boolean {
  const status =
    getConnectDiagnostic(error)?.statusCode ??
    (error instanceof ConnectError ? error.statusCode : undefined);
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Deploy one calculated insight: one GET decides create (POST), update (PATCH) or unchanged;
 * the document is sent as authored (input key names and enum forms translated) and
 * Salesforce decides. A 4xx answer is `rejected`; after any other write outcome the insight
 * is read until it holds the document. One attempt, no replay or rollback.
 * @param {unknown} value Document from the files (JSON with its SQL).
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {ApiVersionSelection} selection Route selection (68.0).
 * @param {string} dataSpace Selected data space.
 * @param {CalculatedInsightExecutionOptions} options --draft, input verifier and test seams.
 * @returns {Promise<CalculatedInsightExecution>} Payload-free outcome.
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
  ): CalculatedInsightExecution =>
    retainConnectDiagnostic(
      {
        family: 'calculated-insight' as const,
        route: { apiVersion: '68.0' as const, method, resource: 'calculated-insights' as const },
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
                        ? 'CI mutation may have occurred; no replay or rollback was performed.'
                        : 'CI deployment was not attempted.';
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
    const context = calculatedInsightDeployContext(
      connection,
      selection,
      dataSpace,
      desired,
      options.context,
    );
    if (typeof options.verifyInput !== 'function') throw new Error('Guards absent');
    await options.verifyInput();
    const plan = await planNativeCalculatedInsightDeploy(desired, context, options.draft === true);
    await options.verifyInput();
    if (plan.action === 'unchanged') return result('unchanged', 'not-attempted');
    method = plan.action === 'create' ? 'POST' : 'PATCH';
    const client =
      options.nativeClient ?? createCalculatedInsightClient(connection, '68.0', dataSpace);
    context.check();
    attempted = true;
    try {
      await (plan.action === 'create'
        ? client.create(structuredClone(desired), options.draft ? { draft: true } : undefined)
        : client.update(structuredClone(desired), {
            // A DRAFT insight stays a draft: deploy never publishes.
            ...(plan.draft ? { draft: true } : {}),
            ...(plan.acquired.state === 'present' ? { observed: plan.acquired.document } : {}),
          }));
    } catch (error) {
      if (rejectedWrite(error)) return result('failed', 'rejected', 'REQUEST_FAILED', error);
      throw error;
    }
    await settleCalculatedInsight(context, desired, 'present', options);
    return plan.action === 'create'
      ? result('created', 'confirmed-created')
      : result('updated', 'confirmed-updated');
  } catch (error) {
    return attempted
      ? result(
          'failed',
          'unknown',
          error instanceof CalculatedInsightError ? error.code : 'CI_MUTATION_UNCONFIRMED',
          error,
        )
      : result(
          'blocked',
          'not-attempted',
          error instanceof CalculatedInsightError ? error.code : 'CI_ADMISSION_FAILED',
          error,
        );
  }
}
