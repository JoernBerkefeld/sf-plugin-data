import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { ConnectError } from '../transport/connect-client.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import { rejectedNextAction } from './deploy-result.js';
import {
  CalculatedInsightError,
  calculatedInsightName,
  calculatedInsightSpaceMismatch,
} from '../artifacts/native-calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import type { CalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import {
  calculatedInsightPresence,
  calculatedInsightReadContext,
} from './native-calculated-insight.js';
import type {
  CalculatedInsightConnection,
  CalculatedInsightReadContext,
} from './native-calculated-insight.js';
import { rejectedWrite } from './execute-calculated-insight-deploy.js';
import { settleCalculatedInsight } from './settle-calculated-insight.js';
import type { CalculatedInsightTiming } from './settle-calculated-insight.js';

export type CalculatedInsightDeleteOptions = CalculatedInsightTiming & {
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
  context?: CalculatedInsightReadContext;
  nativeClient?: Pick<CalculatedInsightClient, 'delete'>;
};
export type CalculatedInsightDeleteResult = {
  family: 'calculated-insight';
  route: { apiVersion: '68.0'; method: 'DELETE'; resource: 'calculated-insights' };
  outcome: 'delete' | 'deleted' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-deleted' | 'unknown' | 'rejected';
  requiredEffects: Array<'destructive'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Delete one insight by name: absent is unchanged; otherwise one DELETE, then reads until it
 * answers 404. The read before the DELETE must answer with the selected name and data space
 * (the name and data space check of `calculatedInsightPresence`). Any status and content is deletable;
 * Salesforce decides. No cascade, replay or rollback.
 * @param {object} value Identity of the insight (a document from the org or the base file).
 * @param {string} value.apiName Exact name ending in __cio.
 * @param {string} value.dataSpace Its data space.
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {ApiVersionSelection} selection Route selection (68.0).
 * @param {string} dataSpace Selected data space.
 * @param {CalculatedInsightDeleteOptions} options Confirmation, verifier, preview and test seams.
 * @returns {Promise<CalculatedInsightDeleteResult>} Payload-free outcome.
 */
export async function deleteCalculatedInsight(
  value: { apiName: string; dataSpace: string },
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightDeleteOptions,
): Promise<CalculatedInsightDeleteResult> {
  let attempted = false;
  const result = (
    outcome: CalculatedInsightDeleteResult['outcome'],
    mutation: CalculatedInsightDeleteResult['mutation'],
    code?: string,
    error?: unknown,
  ): CalculatedInsightDeleteResult =>
    retainConnectDiagnostic(
      {
        family: 'calculated-insight' as const,
        route: {
          apiVersion: '68.0' as const,
          method: 'DELETE' as const,
          resource: 'calculated-insights' as const,
        },
        outcome,
        mutation,
        requiredEffects: outcome === 'delete' ? (['destructive'] as Array<'destructive'>) : [],
        diagnostics: code
          ? [
              {
                code,
                message: (() => {
                  const next =
                    mutation === 'rejected'
                      ? rejectedNextAction
                      : mutation === 'unknown'
                        ? 'CI deletion may have occurred; no replay or rollback was performed.'
                        : 'CI deletion was not attempted.';
                  return getConnectDiagnostic(error) ? operationDiagnostic(error, next) : next;
                })(),
              },
            ]
          : [],
      },
      getConnectDiagnostic(error),
    );
  try {
    if (
      !value ||
      typeof value.apiName !== 'string' ||
      !calculatedInsightName.test(value.apiName) ||
      selection.requested !== '68.0'
    )
      throw new CalculatedInsightError('INVALID_CI_SCOPE');
    if (value.dataSpace !== dataSpace) throw calculatedInsightSpaceMismatch(value, dataSpace);
    if (typeof options.verifyInput !== 'function') throw new Error('Required guards');
    if ('preview' in options && typeof options.preview !== 'boolean') throw new Error('Preview');
    const context = options.context ?? calculatedInsightReadContext(connection, dataSpace);
    context.check();
    await options.verifyInput();
    // Name and data space only: an insight the plugin cannot represent is deleted by name.
    const acquired = await calculatedInsightPresence(context, value.apiName);
    context.check();
    await options.verifyInput();
    if (acquired.state === 'absent') return result('unchanged', 'not-attempted');
    if (options.preview === true) return result('delete', 'not-attempted');
    if (options.confirmDelete !== true)
      return result('blocked', 'not-attempted', 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
    const client =
      options.nativeClient ?? createCalculatedInsightClient(connection, '68.0', dataSpace);
    context.check();
    attempted = true;
    try {
      await client.delete(value.apiName);
    } catch (error) {
      // A 404 naming the insight absent or deleted (live API 68: ENTITY_IS_DELETED) is not a
      // refusal: the read below decides. Nothing is resent.
      const gone =
        error instanceof ConnectError && error.statusCode === 404 && error.nativeCode !== undefined;
      if (!gone && rejectedWrite(error))
        return result('failed', 'rejected', 'REQUEST_FAILED', error);
      if (!gone) throw error;
    }
    await settleCalculatedInsight(context, { apiName: value.apiName }, 'absent', options);
    return result('deleted', 'confirmed-deleted');
  } catch (error) {
    const code = error instanceof CalculatedInsightError ? error.code : undefined;
    return attempted
      ? result('failed', 'unknown', 'CI_DELETION_UNCONFIRMED', error)
      : result('blocked', 'not-attempted', code ?? 'CI_ADMISSION_FAILED', error);
  }
}
