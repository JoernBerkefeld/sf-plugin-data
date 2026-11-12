import { isDeepStrictEqual } from 'node:util';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import {
  buildCalculatedInsightUpdateDelta,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  calculatedInsightReadContext,
  calculatedInsightTargetEvidence,
  acquireExactCalculatedInsight,
} from './retrieve-calculated-insight.js';
import type {
  CalculatedInsightConnection,
  CalculatedInsightReadContext,
} from './retrieve-calculated-insight.js';

export type CalculatedInsightDeployIntent = {
  draft?: true;
  context?: CalculatedInsightReadContext;
};

/**
 * Admit only explicit native68/default lifecycle intent; never repin the caller.
 * @param {CalculatedInsightConnection} connection Authenticated native receiver.
 * @param {ApiVersionSelection} selection Exact native route selection.
 * @param {string} dataSpace Default space.
 * @param {CalculatedInsightDeployIntent} options Explicit draft intent and private readers.
 * @returns {CalculatedInsightReadContext} Scope-guarded operation-local readers.
 */
export function calculatedInsightDeployContext(
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: CalculatedInsightDeployIntent,
): CalculatedInsightReadContext {
  const version = { ...selection };
  const origin = connection.instanceUrl;
  const draft = { present: 'draft' in options, value: options.draft };
  const context = options.context ?? calculatedInsightReadContext(connection, dataSpace);
  const check = (): void => {
    if (
      version.requested !== '68.0' ||
      version.restSelector !== 'v68.0' ||
      version.soapNumeric !== '68.0' ||
      connection.getApiVersion() !== '68.0' ||
      connection.instanceUrl !== origin ||
      dataSpace !== 'default' ||
      !isDeepStrictEqual(selection, version) ||
      !isDeepStrictEqual(draft, { present: 'draft' in options, value: options.draft }) ||
      ('draft' in options && options.draft !== true)
    )
      throw new Error('Native CI scope drift');
    context.check();
  };
  check();
  return { ...context, check };
}

/**
 * Derive a guarded create/update/no-op from independent exact reads, never from a write echo.
 * @param {unknown} value Complete desired semantic document.
 * @param {CalculatedInsightReadContext} context Independent native68/Metadata65 readers.
 * @param {boolean} draft Explicit draft retention intent.
 * @returns {Promise<object>} Qualified action and detached acquisition snapshot.
 */
export async function planNativeCalculatedInsightDeploy(
  value: unknown,
  context: CalculatedInsightReadContext,
  draft: boolean,
) {
  const desired = validateCalculatedInsightDocument(value);
  context.check();
  if (desired.spec.publishScheduleInterval !== 'NOT_SCHEDULED') throw new Error('Schedule blocked');
  const acquired = await acquireExactCalculatedInsight(context, desired.identity.apiName);
  context.check();
  if (acquired.state === 'unknown')
    throw retainConnectDiagnostic(new Error('Target unknown'), getConnectDiagnostic(acquired));
  if (acquired.state === 'absent') {
    if (!draft) throw new Error('Draft create intent required');
    return { action: 'create' as const, acquired };
  }
  if (acquired.status !== (draft ? 'DRAFT' : 'ACTIVE')) throw new Error('State conversion blocked');
  const delta = buildCalculatedInsightUpdateDelta(
    desired,
    acquired.expectations.runtime,
    acquired.expectations.metadata,
    'default',
    { expectedStatus: draft ? 'DRAFT' : 'ACTIVE' },
  );
  if (delta.status === 'blocked') throw new Error('Content conversion blocked');
  return {
    action: delta.status === 'unchanged' ? ('unchanged' as const) : ('update' as const),
    acquired,
  };
}

/**
 * Comparable plan evidence: action plus drift-relevant target evidence, never volatile reads.
 * @param {Awaited<ReturnType<typeof planNativeCalculatedInsightDeploy>>} plan Guarded plan.
 * @returns {unknown} Detached comparable evidence.
 */
export function calculatedInsightPlanEvidence(
  plan: Awaited<ReturnType<typeof planNativeCalculatedInsightDeploy>>,
): unknown {
  return { action: plan.action, target: calculatedInsightTargetEvidence(plan.acquired) };
}

export type CalculatedInsightPreview = {
  family: 'calculated-insight';
  outcome: 'create' | 'update' | 'unchanged' | 'blocked';
  target: 'present' | 'absent' | 'unknown';
  absenceProof: 'none' | 'native-item-not-found+metadata-empty';
  route: { apiVersion: '68.0'; method: 'POST' | 'PATCH'; resource: 'calculated-insights' };
  requiredEffects: Array<'processing'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Preview one native68 create, update or no-op from independent reads; never writes.
 * @param {unknown} value Complete authored desired CI.
 * @param {CalculatedInsightConnection} connection Authenticated native68 target.
 * @param {ApiVersionSelection} selection Exact native68 route.
 * @param {string} dataSpace Default target space.
 * @param {CalculatedInsightDeployIntent} options Explicit draft intent and private readers.
 * @returns {Promise<CalculatedInsightPreview>} Payload-free classification and processing effects.
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
    const context = calculatedInsightDeployContext(connection, selection, dataSpace, options);
    const desired = validateCalculatedInsightDocument(value);
    await context.bind(desired, context.check);
    const plan = await planNativeCalculatedInsightDeploy(desired, context, options.draft === true);
    context.check();
    return {
      family: 'calculated-insight',
      outcome: plan.action,
      target: plan.acquired.state === 'absent' ? 'absent' : 'present',
      absenceProof: plan.acquired.state === 'absent' ? plan.acquired.absenceProof : 'none',
      route: { ...route, method: plan.action === 'create' ? 'POST' : 'PATCH' },
      requiredEffects: plan.action === 'unchanged' ? [] : ['processing'],
      diagnostics: [],
    };
  } catch (error) {
    return {
      family: 'calculated-insight',
      outcome: 'blocked',
      target: 'unknown',
      absenceProof: 'none',
      route,
      requiredEffects: [],
      diagnostics: [
        {
          code: 'CI_ADMISSION_FAILED',
          message: getConnectDiagnostic(error)
            ? operationDiagnostic(error, 'Native CI deployment was not attempted.')
            : 'Native CI intent, scope, content or dependencies are unqualified.',
        },
      ],
    };
  }
}
