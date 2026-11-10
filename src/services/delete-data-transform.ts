import { isDeepStrictEqual } from 'node:util';
import {
  DataTransformError,
  dataTransformId,
  dataTransformName,
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import type { DloClient } from '../transport/dlo-rest.js';
import { bindDataTransformDlos } from './preflight-data-transform-deploy.js';
import type { DataTransformPrerequisites } from './preflight-data-transform-deploy.js';
import { retrieveDataTransform } from './retrieve-data-transform.js';

export type DataTransformDeleteOptions = {
  targetId: string;
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
};
export type DataTransformDeleteResult = {
  operation: 'delete';
  targetId: string;
  outcome: 'preview' | 'blocked' | 'deleted' | 'deletion-unconfirmed';
  mutation: 'not-attempted' | 'acknowledged' | 'confirmed-deleted' | 'unknown';
  prerequisitesPreserved?: true;
};

/**
 * Read the complete native collection using fixed 20-row pages, at most 101 pages (2020 rows).
 * Require stable totalSize, full nonfinal pages and unique identities; never follow server URLs.
 * This is collection visibility evidence, not an exhaustive external-consumer exclusion check.
 * @param {DataTransformClient} client Fixed API68/default adapter.
 * @param {() => void} check Scope/input drift guard between every page.
 * @returns {Promise<Array<{id: string, name: string}>>} Complete observed identity inventory.
 */
export async function listDataTransformInventory(
  client: DataTransformClient,
  check: () => void = () => {},
): Promise<Array<{ id: string; name: string }>> {
  const inventory: Array<{ id: string; name: string }> = [];
  let total: number | undefined;
  for (let offset = 0; offset <= 2000; offset += 20) {
    check();
    const raw = await client.list(offset);
    check();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
    const page = raw as Record<string, unknown>;
    if (
      !Number.isSafeInteger(page.totalSize) ||
      (page.totalSize as number) < 0 ||
      (page.totalSize as number) > 2020 ||
      (total !== undefined && page.totalSize !== total) ||
      !Array.isArray(page.dataTransforms)
    )
      throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
    total = page.totalSize as number;
    if (page.dataTransforms.length !== Math.min(20, total - offset))
      throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
    for (const item of page.dataTransforms as unknown[]) {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        !dataTransformId.test(row.id) ||
        typeof row.name !== 'string' ||
        !dataTransformName.test(row.name) ||
        inventory.some((entry) => entry.id === row.id || entry.name === row.name)
      )
        throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
      inventory.push({ id: row.id, name: row.name });
    }
    if (inventory.length === total) return inventory;
  }
  throw new DataTransformError('INCOMPLETE_TRANSFORM_INVENTORY');
}

/**
 * Compare complete DLO definitions, identities and memberships, excluding runtime counters.
 * @param {DataTransformPrerequisites} bindings Fresh existing DLO observations.
 * @returns {unknown} Stable preservation baseline.
 */
function preservation(bindings: DataTransformPrerequisites): unknown {
  return bindings.map(({ document, targetId, runtime }) => ({
    document,
    targetId,
    memberships: runtime.dataSpaceInfo,
  }));
}

/**
 * Delete one positively matched authored STL target; preview never writes and execution sends once.
 * A resolved DELETE is only acknowledgement. One bounded complete inventory plus independent DLO
 * preservation establishes settlement; any read failure/partial list leaves deletion unconfirmed.
 * Never deletes or provisions source/output DLOs, retries mutations, or treats GET404 as absence.
 * @param {unknown} value Exact portable definition expectation, not ownership authority.
 * @param {DataTransformClient} client Bound native API68/default transform adapter.
 * @param {DloClient} dlos Shared existing source/output DLO adapter.
 * @param {DataTransformDeleteOptions} options Exact target ID, confirmation and fresh local input guard.
 * @returns {Promise<DataTransformDeleteResult>} Honest acknowledgement/settlement classification.
 */
export async function deleteDataTransform(
  value: unknown,
  client: DataTransformClient,
  dlos: Pick<DloClient, 'get'>,
  options: DataTransformDeleteOptions,
): Promise<DataTransformDeleteResult> {
  const desired = validateDataTransformDocument(value);
  const canonical = serializeDataTransformDocument(desired);
  const { targetId, confirmDelete, verifyInput } = options;
  const preview = options.preview === true;
  const methods = { ...client };
  const dloGet = dlos.get;
  const check = (): void => {
    if (
      typeof targetId !== 'string' ||
      !dataTransformId.test(targetId) ||
      typeof verifyInput !== 'function' ||
      options.targetId !== targetId ||
      options.confirmDelete !== confirmDelete ||
      options.verifyInput !== verifyInput ||
      (options.preview === true) !== preview ||
      !isDeepStrictEqual({ ...client }, methods) ||
      dlos.get !== dloGet ||
      serializeDataTransformDocument(value) !== canonical
    )
      throw new DataTransformError('TRANSFORM_DELETE_INPUT_DRIFT');
  };
  const verify = async (): Promise<void> => {
    check();
    await verifyInput();
    check();
  };
  const read = async (): Promise<void> => {
    check();
    const observed = await retrieveDataTransform(targetId, client);
    check();
    if (serializeDataTransformDocument(observed.document) !== canonical)
      throw new DataTransformError('TRANSFORM_TARGET_DRIFT');
  };
  await verify();
  await read();
  const prerequisites = preservation(await bindDataTransformDlos(desired, dlos));
  check();
  const inventory = await listDataTransformInventory(client, check);
  if (!inventory.some((row) => row.id === targetId && row.name === desired.definition.name))
    throw new DataTransformError('TRANSFORM_DELETE_IDENTITY_MISMATCH');
  await verify();
  const fresh = preservation(await bindDataTransformDlos(desired, dlos));
  check();
  if (!isDeepStrictEqual(prerequisites, fresh))
    throw new DataTransformError('TRANSFORM_PREREQUISITE_DRIFT');
  await verify();
  await read();
  const result = (
    outcome: DataTransformDeleteResult['outcome'],
    mutation: DataTransformDeleteResult['mutation'],
    preserved = false,
  ): DataTransformDeleteResult => ({
    operation: 'delete',
    targetId,
    outcome,
    mutation,
    ...(preserved ? { prerequisitesPreserved: true as const } : {}),
  });
  if (preview) return result('preview', 'not-attempted');
  if (confirmDelete !== true) return result('blocked', 'not-attempted');
  try {
    await client.delete(targetId);
  } catch {
    // Even an HTTP error can have an uncertain outcome. Never replay or claim acknowledgement.
    return result('deletion-unconfirmed', 'unknown');
  }
  try {
    check();
    const after = await listDataTransformInventory(client, check);
    const retained = preservation(await bindDataTransformDlos(desired, dlos));
    check();
    if (!isDeepStrictEqual(prerequisites, retained))
      return result('deletion-unconfirmed', 'acknowledged');
    if (after.some((row) => row.id === targetId || row.name === desired.definition.name))
      return result('deletion-unconfirmed', 'acknowledged', true);
    return result('deleted', 'confirmed-deleted', true);
  } catch {
    return result('deletion-unconfirmed', 'acknowledged');
  }
}
