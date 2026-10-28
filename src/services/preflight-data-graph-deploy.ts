import { isDeepStrictEqual } from 'node:util';
import {
  dataGraphFields,
  graphRequire,
  projectDataGraph,
  validateDataGraphDocument,
} from '../artifacts/data-graph-document.js';
import type { DataGraphDocument } from '../artifacts/data-graph-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { bindDataGraphDependencies } from './bind-data-graph-dependencies.js';
import {
  dataGraphScope,
  retrieveDataGraph,
  verifyDataGraphTransform,
} from './retrieve-data-graph.js';
import type {
  DataGraphAcquisition,
  DataGraphConnection,
  DataGraphReadOptions,
} from './retrieve-data-graph.js';

export type DataGraphPreflightOptions = DataGraphReadOptions & {
  acquire?: typeof retrieveDataGraph;
  verifyDependencies?: typeof bindDataGraphDependencies;
};
export type DataGraphDeployPreview = {
  family: 'data-graph';
  outcome: 'unchanged' | 'update' | 'blocked' | 'blocked-changes';
  target: 'present' | 'unknown';
  absenceProof: 'none';
  route: { apiVersion: '67.0'; operation: 'd360_data_graph_update' };
  requiredEffects: Array<'processing'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Re-admit full raw evidence rather than trusting injected candidates.
 * @param {DataGraphAcquisition} acquired Acquisition.
 * @param {DataGraphDocument} desired Desired.
 * @returns {NonNullable<DataGraphAcquisition['expectations']>} Checked baseline.
 */
export function admitDataGraphAcquisition(
  acquired: DataGraphAcquisition,
  desired: DataGraphDocument,
): NonNullable<DataGraphAcquisition['expectations']> {
  graphRequire(
    acquired.candidate &&
      acquired.expectations &&
      Array.isArray(acquired.blockers) &&
      acquired.blockers.length === 0 &&
      isDeepStrictEqual(acquired.identity, desired.identity),
  );
  const projection = projectDataGraph(
    acquired.expectations.graph,
    desired.identity.apiName,
    acquired.expectations.intent,
  );
  graphRequire(
    isDeepStrictEqual(projection.candidate, validateDataGraphDocument(acquired.candidate)),
  );
  verifyDataGraphTransform(projection, acquired.expectations.transform);
  return structuredClone(acquired.expectations);
}

/**
 * Admit only the single qualified forward projection append.
 * @param {DataGraphDocument} current Existing.
 * @param {DataGraphDocument} desired Desired.
 * @returns {boolean} Exact forward delta.
 */
export function dataGraphAppend(current: DataGraphDocument, desired: DataGraphDocument): boolean {
  if (!isDeepStrictEqual(current.spec.sourceObject.fields, dataGraphFields(false))) return false;
  const updated = structuredClone(current);
  updated.spec.sourceObject.fields = dataGraphFields(true);
  return isDeepStrictEqual(updated, desired);
}

/**
 * Preview existing-owner update, never absence/create permission.
 * @param {unknown} value Desired.
 * @param {DataGraphConnection} connection Connection.
 * @param {ApiVersionSelection} apiVersion Version.
 * @param {string} dataSpace Space.
 * @param {DataGraphPreflightOptions} options Private acquisition/binding.
 * @returns {Promise<DataGraphDeployPreview>} Conservative classification.
 */
export async function preflightDataGraphDeploy(
  value: unknown,
  connection: DataGraphConnection,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: DataGraphPreflightOptions = {},
): Promise<DataGraphDeployPreview> {
  const result = (
    outcome: DataGraphDeployPreview['outcome'],
    code?: string,
  ): DataGraphDeployPreview => ({
    family: 'data-graph',
    outcome,
    target: outcome === 'blocked' ? 'unknown' : 'present',
    absenceProof: 'none',
    route: { apiVersion: '67.0', operation: 'd360_data_graph_update' },
    requiredEffects: outcome === 'update' ? ['processing'] : [],
    diagnostics: code
      ? [
          {
            code,
            message: 'Graph target, creation intent, dependency or configuration is unqualified.',
          },
        ]
      : [],
  });
  try {
    const desired = validateDataGraphDocument(value);
    dataGraphScope(connection, apiVersion, dataSpace);
    await (options.verifyDependencies ?? bindDataGraphDependencies)(
      structuredClone(desired),
      connection,
      { ...apiVersion },
      dataSpace,
    );
    const acquired = await (options.acquire ?? retrieveDataGraph)(
      connection,
      desired.identity.apiName,
      { ...apiVersion },
      dataSpace,
      options,
    );
    admitDataGraphAcquisition(acquired, desired);
    const current = acquired.candidate!;
    if (isDeepStrictEqual(current, desired)) return result('unchanged');
    return dataGraphAppend(current, desired)
      ? result('update')
      : result('blocked-changes', 'DATA_GRAPH_UPDATE_UNQUALIFIED');
  } catch {
    return result('blocked', 'DATA_GRAPH_TARGET_OR_DEPENDENCY_UNQUALIFIED');
  }
}
