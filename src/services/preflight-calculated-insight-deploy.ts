import { isDeepStrictEqual } from 'node:util';
import {
  buildCalculatedInsightUpdateDelta,
  projectCalculatedInsight,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { bindCalculatedInsightDependencies } from './bind-calculated-insight-dependencies.js';
import {
  calculatedInsightScope,
  retrieveCalculatedInsight,
} from './retrieve-calculated-insight.js';
import type { CalculatedInsightConnection } from './retrieve-calculated-insight.js';

export type CalculatedInsightPreview = {
  family: 'calculated-insight';
  outcome: 'update' | 'unchanged' | 'blocked';
  target: 'present' | 'unknown';
  absenceProof: 'none';
  route: { apiVersion: '65.0'; method: 'PATCH'; resource: 'calculated-insights' };
  requiredEffects: Array<'processing'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Preview only the existing settled forward expression delta; never infer create absence.
 * @param {unknown} value Complete authored desired CI.
 * @param {CalculatedInsightConnection} connection Authenticated target.
 * @param {ApiVersionSelection} selection Fixed API65 route.
 * @param {string} dataSpace Default target space.
 * @param {typeof retrieveCalculatedInsight} acquire Independent exact acquisition seam.
 * @param {typeof bindCalculatedInsightDependencies} bind Fresh dependency compatibility seam.
 * @returns {Promise<CalculatedInsightPreview>} Payload-free classification and processing effects.
 */
export async function preflightCalculatedInsightDeploy(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire = retrieveCalculatedInsight,
  bind = bindCalculatedInsightDependencies,
): Promise<CalculatedInsightPreview> {
  const result = (
    outcome: CalculatedInsightPreview['outcome'],
    code?: string,
  ): CalculatedInsightPreview => ({
    family: 'calculated-insight',
    outcome,
    target: outcome === 'blocked' ? 'unknown' : 'present',
    absenceProof: 'none',
    route: { apiVersion: '65.0', method: 'PATCH', resource: 'calculated-insights' },
    requiredEffects: outcome === 'update' ? ['processing'] : [],
    diagnostics: code
      ? [
          {
            code,
            message:
              'CI target, dependency or expression is not qualified; create and shell conversion are unavailable.',
          },
        ]
      : [],
  });
  try {
    const desired = validateCalculatedInsightDocument(value);
    const version = { ...selection };
    calculatedInsightScope(connection, version, dataSpace, desired.identity.apiName);
    await bind(desired, connection, version, dataSpace);
    const acquired = await acquire(connection, desired.identity.apiName, version, dataSpace);
    if (
      !acquired.candidate ||
      !acquired.expectations ||
      acquired.blockers.length > 0 ||
      !isDeepStrictEqual(acquired.identity, desired.identity)
    )
      return result('blocked', 'CI_TARGET_OR_SHELL_UNQUALIFIED');
    const projection = projectCalculatedInsight(
      acquired.expectations.runtime,
      acquired.expectations.metadata,
    );
    if (!isDeepStrictEqual(projection.document, acquired.candidate))
      return result('blocked', 'CI_TARGET_CORRELATION_MISMATCH');
    const delta = buildCalculatedInsightUpdateDelta(
      desired,
      acquired.expectations.runtime,
      acquired.expectations.metadata,
      dataSpace,
    );
    calculatedInsightScope(connection, version, dataSpace, desired.identity.apiName);
    return delta.status === 'blocked'
      ? result('blocked', delta.blockers[0])
      : result(delta.status === 'candidate' ? 'update' : 'unchanged');
  } catch {
    return result('blocked', 'CI_ADMISSION_FAILED');
  }
}
