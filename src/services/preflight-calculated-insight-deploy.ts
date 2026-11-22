import { getConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { refuseEscapedCopy } from './escaped-copy.js';
import { explanationOf, operationDiagnostic } from './operation-diagnostic.js';
import {
  CalculatedInsightError,
  calculatedInsightMatches,
  calculatedInsightSpaceMismatch,
  validateNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  acquireCalculatedInsight,
  calculatedInsightReadContext,
} from './native-calculated-insight.js';
import type {
  CalculatedInsightAcquisition,
  CalculatedInsightConnection,
  CalculatedInsightReadContext,
} from './native-calculated-insight.js';

export type CalculatedInsightDeployIntent = {
  draft?: true;
  context?: CalculatedInsightReadContext;
};

/**
 * The read context of one item: API 68 and the data space of the document only.
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {ApiVersionSelection} selection Route selection (68.0).
 * @param {string} dataSpace Selected data space.
 * @param {NativeCalculatedInsight} desired Document; its `dataSpace` must be the selected one.
 * @param {CalculatedInsightReadContext} [context] Injected context.
 * @returns {CalculatedInsightReadContext} Checked context.
 */
export function calculatedInsightDeployContext(
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  desired: NativeCalculatedInsight,
  context?: CalculatedInsightReadContext,
): CalculatedInsightReadContext {
  // The routes are API 68 only, and the file names the data space it belongs to.
  if (selection.requested !== '68.0') throw new Error('Native CI scope');
  if (desired.dataSpace !== dataSpace) throw calculatedInsightSpaceMismatch(desired, dataSpace);
  const result = context ?? calculatedInsightReadContext(connection, dataSpace);
  result.check();
  return result;
}

export type CalculatedInsightPlan = {
  action: 'create' | 'update' | 'unchanged';
  acquired: CalculatedInsightAcquisition;
  /** The `draft` value an update sends: true with --draft or for a DRAFT insight, else none. */
  draft?: true;
};

/**
 * Create when the name reads absent, unchanged when the org insight holds every key of the
 * document, update otherwise. An update of a DRAFT insight keeps it a draft: deploy never
 * publishes (that is `sf data360 publish`).
 * @param {NativeCalculatedInsight} desired Document from the files.
 * @param {CalculatedInsightReadContext} context Read context.
 * @param {boolean} draft --draft given.
 * @returns {Promise<CalculatedInsightPlan>} Action and the read it is based on.
 */
export async function planNativeCalculatedInsightDeploy(
  desired: NativeCalculatedInsight,
  context: CalculatedInsightReadContext,
  draft: boolean,
): Promise<CalculatedInsightPlan> {
  context.check();
  const acquired = await acquireCalculatedInsight(context, desired.apiName);
  context.check();
  if (acquired.state === 'absent') return { action: 'create', acquired };
  refuseEscapedCopy(desired, acquired.document, (code) => new CalculatedInsightError(code));
  if (calculatedInsightMatches(desired, acquired.document))
    return { action: 'unchanged', acquired };
  return {
    action: 'update',
    acquired,
    ...(draft || acquired.status === 'DRAFT' ? { draft: true as const } : {}),
  };
}

export type CalculatedInsightPreview = {
  family: 'calculated-insight';
  outcome: 'create' | 'update' | 'unchanged' | 'blocked';
  target: 'present' | 'absent' | 'unknown';
  absenceProof: 'none' | 'native-item-not-found';
  route: { apiVersion: '68.0'; method: 'POST' | 'PATCH'; resource: 'calculated-insights' };
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Preview one create, update or no-op from one GET; never writes.
 * @param {unknown} value Document from the files (JSON with its SQL).
 * @param {CalculatedInsightConnection} connection API 68 connection.
 * @param {ApiVersionSelection} selection Route selection (68.0).
 * @param {string} dataSpace Selected data space.
 * @param {CalculatedInsightDeployIntent} options --draft and an injected read context.
 * @returns {Promise<CalculatedInsightPreview>} Payload-free classification.
 */
export async function preflightCalculatedInsightDeploy(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightDeployIntent = {},
): Promise<CalculatedInsightPreview> {
  const route = {
    apiVersion: '68.0' as const,
    method: 'PATCH' as 'POST' | 'PATCH',
    resource: 'calculated-insights' as const,
  };
  try {
    const desired = validateNativeCalculatedInsight(value);
    const context = calculatedInsightDeployContext(
      connection,
      selection,
      dataSpace,
      desired,
      options.context,
    );
    const plan = await planNativeCalculatedInsightDeploy(desired, context, options.draft === true);
    return {
      family: 'calculated-insight',
      outcome: plan.action,
      target: plan.acquired.state,
      absenceProof: plan.acquired.state === 'absent' ? 'native-item-not-found' : 'none',
      route: { ...route, method: plan.action === 'create' ? 'POST' : 'PATCH' },
      diagnostics: [],
    };
  } catch (error) {
    return {
      family: 'calculated-insight',
      outcome: 'blocked',
      target: 'unknown',
      absenceProof: 'none',
      route,
      diagnostics: [
        {
          code: error instanceof CalculatedInsightError ? error.code : 'CI_ADMISSION_FAILED',
          // Salesforce's answer or the plugin's own explanation (a data space mismatch).
          message:
            getConnectDiagnostic(error) || explanationOf(error) !== undefined
              ? operationDiagnostic(error, 'Native CI deployment was not attempted.')
              : 'The calculated insight could not be read or its file or data space is invalid; nothing was sent.',
        },
      ],
    };
  }
}
