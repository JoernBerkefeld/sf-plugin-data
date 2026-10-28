import {
  CalculatedInsightError,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { calculatedInsightScope } from './retrieve-calculated-insight.js';
import type { CalculatedInsightConnection } from './retrieve-calculated-insight.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';

type Acquisition = { detail: unknown; metadata: unknown };
export type CalculatedInsightBinding = {
  identity: { kind: 'dmo'; dataSpace: 'default'; apiName: string };
  targetId: string;
  fields: Array<{ apiName: string; dataType: 'Text' }>;
};

/**
 * Require an independently read record, never array/absence coercion.
 * @param {unknown} value Raw response.
 * @returns {Record<string, unknown>} Record for bounded compatibility checks.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CalculatedInsightError('CI_DEPENDENCY_UNQUALIFIED');
  return value as Record<string, unknown>;
}

/**
 * Bind the fixed typed SQL dependency using separate exact REST and Metadata reads.
 * This admits required field compatibility, not the entire DMO as an authored artifact.
 * @param {unknown} value Complete desired CI document.
 * @param {CalculatedInsightConnection} connection Target-local authenticated connection.
 * @param {ApiVersionSelection} selection Explicit API65 family route.
 * @param {string} dataSpace Explicit default space.
 * @param {Function} acquire Independent compatibility read seam.
 * @returns {Promise<CalculatedInsightBinding>} Detached target-local identity and required types.
 */
export async function bindCalculatedInsightDependencies(
  value: unknown,
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire: (name: string) => Promise<Acquisition> = async (name) => ({
    detail: await new ConnectClient(connection, '65.0').get(
      `/services/data/v65.0/ssot/data-model-objects/${name}`,
    ),
    metadata: await readDmoMetadata(connection, name),
  }),
): Promise<CalculatedInsightBinding> {
  const document = validateCalculatedInsightDocument(value);
  calculatedInsightScope(connection, selection, dataSpace, document.identity.apiName);
  const dependency = document.spec.dependencies[0];
  const acquired = await acquire(dependency.apiName);
  const detail = record(acquired.detail);
  if (!Array.isArray(acquired.metadata) || acquired.metadata.length !== 1)
    throw new CalculatedInsightError('CI_DEPENDENCY_AMBIGUOUS');
  const metadata = record(acquired.metadata[0]);
  const attributes = record(metadata.mktDataModelAttributes);
  if (
    detail.name !== dependency.apiName ||
    metadata.fullName !== dependency.apiName ||
    detail.dataSpaceName !== dataSpace ||
    attributes.dataSpaceName !== dataSpace ||
    detail.category !== 'ENGAGEMENT' ||
    detail.creationType !== 'Standard' ||
    detail.isEnabled !== true ||
    typeof detail.id !== 'string' ||
    !detail.id.trim()
  )
    throw new CalculatedInsightError('CI_DEPENDENCY_UNQUALIFIED');
  const index = (value: unknown, key: string): Map<string, Record<string, unknown>> => {
    if (!Array.isArray(value) || value.length === 0 || value.length > 4096)
      throw new CalculatedInsightError('CI_DEPENDENCY_UNQUALIFIED');
    const result = new Map<string, Record<string, unknown>>();
    for (const item of value) {
      const field = record(item);
      const name = field[key];
      if (typeof name !== 'string' || !name || result.has(name))
        throw new CalculatedInsightError('CI_DEPENDENCY_AMBIGUOUS');
      result.set(name, field);
    }
    return result;
  };
  const raw = index(detail.fields, 'name');
  const meta = index(metadata.fields, 'fullName');
  const fields = dependency.fields.map((apiName) => {
    if (
      raw.get(apiName)?.type !== 'Text' ||
      raw.get(apiName)?.isMapped !== true ||
      meta.get(apiName)?.type !== 'Text'
    )
      throw new CalculatedInsightError('CI_DEPENDENCY_UNQUALIFIED');
    return { apiName, dataType: 'Text' as const };
  });
  calculatedInsightScope(connection, selection, dataSpace, document.identity.apiName);
  return {
    identity: { kind: 'dmo', dataSpace: 'default', apiName: dependency.apiName },
    targetId: detail.id,
    fields,
  };
}
