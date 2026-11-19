import { setTimeout as wait } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import {
  DataTransformError,
  dataTransformId,
  dataTransformName,
  dataTransformSpaceMismatch,
  sameDataTransformDocument,
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import { retrieveDataTransform } from './retrieve-data-transform.js';
import { isVerbatimDocument, verbatimDataSpace } from '../artifacts/verbatim-document.js';
import { resolveDataTransformSpace } from './data-transform-space.js';
import { ConnectError } from '../transport/connect-client.js';
import { rejectedWrite } from './execute-calculated-insight-deploy.js';
import { replaceExplanation } from './operation-diagnostic.js';

export type DataTransformDeleteOptions = {
  targetId: string;
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
  /** Clock and sleep for the settlement poll; tests inject fakes. */
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};

/** Salesforce keeps listing a deleted transform for about 10-25 seconds (live, 2026-11-14). */
const SETTLE_BUDGET_MS = 60_000;
const SETTLE_INTERVAL_MS = 5000;
export type DataTransformDeleteResult = {
  operation: 'delete';
  targetId: string;
  outcome: 'preview' | 'blocked' | 'deleted' | 'deletion-unconfirmed' | 'failed';
  mutation: 'not-attempted' | 'acknowledged' | 'confirmed-deleted' | 'unknown' | 'rejected';
  /** Salesforce's refusal of the DELETE (HTTP 4xx), when the mutation is `rejected`. */
  error?: unknown;
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
 * Resolve the target ID of a data transform from its API name: read the complete inventory and
 * take the one entry whose name matches, ignoring case. Read-only; used by delete and deploy.
 * @param {DataTransformClient} client Fixed API68/default adapter.
 * @param {string} name API name of the selected transform.
 * @returns {Promise<string | undefined>} The one matching target ID; undefined when none matches.
 */
export async function resolveDataTransformTargetId(
  client: DataTransformClient,
  name: string,
): Promise<string | undefined> {
  const inventory = await listDataTransformInventory(client);
  const matches = inventory.filter((row) => row.name.toLowerCase() === name.toLowerCase());
  if (matches.length > 1) {
    const error = new DataTransformError('TRANSFORM_TARGET_NOT_RESOLVED');
    replaceExplanation(
      error,
      `The org has ${matches.length} data transforms named ${name} (ignoring case), so the name does not resolve to one target ID. Nothing was changed.`,
    );
    throw error;
  }
  return matches[0]?.id;
}

/**
 * A transform Salesforce is still processing is not deleted: live (API 68, 2026-11-16) its DELETE
 * was answered but the transform stayed. Refused before the DELETE, so nothing is sent.
 * @param {unknown} status The `status` of the transform's GET.
 */
function refuseProcessing(status: unknown): void {
  if (typeof status !== 'string' || status.toUpperCase() !== 'PROCESSING') return;
  const error = new DataTransformError('TRANSFORM_DELETE_PROCESSING');
  replaceExplanation(
    error,
    'Data Cloud is still processing the data transform (status PROCESSING), so the DELETE was not sent and nothing was changed.',
  );
  throw error;
}

/**
 * The raw GET of a transform named by a verbatim file, checked only for what a delete needs: the
 * same record ID and name, in the file's data space (its `dataSpaceName`, otherwise the org's
 * MktDataTransform record; TRANSFORM_DATASPACE_MISMATCH otherwise). Any owner is accepted
 * (Salesforce decides; it refuses a system transform). Its definition is not projected.
 * @param {string} targetId Resolved record ID.
 * @param {string} name Name of the verbatim file.
 * @param {string} dataSpace The verbatim file's data space.
 * @param {Pick<DataTransformClient, 'get' | 'dataSpaces'>} client Transform reader.
 * @returns {Promise<string>} The GET without run observations, as comparable JSON text.
 */
async function readVerbatimTransform(
  targetId: string,
  name: string,
  dataSpace: string,
  client: Pick<DataTransformClient, 'get' | 'dataSpaces'>,
): Promise<string> {
  const runtime: unknown = await client.get(targetId);
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime))
    throw new DataTransformError('INVALID_TRANSFORM_RESPONSE');
  const raw = runtime as Record<string, unknown>;
  if (raw.id !== targetId || raw.name !== name)
    throw new DataTransformError('TRANSFORM_DELETE_IDENTITY_MISMATCH');
  const space = await resolveDataTransformSpace(raw, async () => client.dataSpaces());
  if (space !== dataSpace) throw dataTransformSpaceMismatch(name, space, dataSpace);
  refuseProcessing(raw.status);
  return JSON.stringify(
    Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('lastRun'))),
  );
}

/**
 * Delete one positively matched target of any owner; preview never writes and execution sends
 * once, and Salesforce decides (a 4xx answer other than 404 is reported as rejected).
 * A verbatim file (a transform the plugin cannot model) is deleted by its name: the GET must
 * carry the same ID and name and not change between the reads.
 * A resolved DELETE is only acknowledgement; settlement is the transform's absence from one
 * bounded complete inventory, polled within a bound. Any read failure or partial list leaves
 * the deletion unconfirmed. Never deletes DLOs, retries mutations or treats GET404 as absence.
 * @param {unknown} value Exact portable definition expectation, not ownership authority.
 * @param {DataTransformClient} client Bound native API68/default transform adapter.
 * @param {DataTransformDeleteOptions} options Exact target ID, confirmation and fresh local input guard.
 * @returns {Promise<DataTransformDeleteResult>} Honest acknowledgement/settlement classification.
 */
export async function deleteDataTransform(
  value: unknown,
  client: DataTransformClient,
  options: DataTransformDeleteOptions,
): Promise<DataTransformDeleteResult> {
  // Read as retrieve writes it: the file and the GET may keep keys the plugin does not model.
  const verbatim = isVerbatimDocument(value, 'data-transform');
  const canonicalOf = (input: unknown): string =>
    verbatim
      ? JSON.stringify(input)
      : serializeDataTransformDocument(
          validateDataTransformDocument(input, 'retrieve'),
          'retrieve',
        );
  const canonical = canonicalOf(value);
  const name = verbatim
    ? value.identity.apiName
    : String(validateDataTransformDocument(value, 'retrieve').definition.name);
  // The org transform must be in the file's data space, before any DELETE.
  const space = verbatim
    ? verbatimDataSpace(value)
    : validateDataTransformDocument(value, 'retrieve').c__dataSpace;
  const { targetId, confirmDelete, verifyInput } = options;
  const preview = options.preview === true;
  const methods = { ...client };
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
      canonicalOf(value) !== canonical
    )
      throw new DataTransformError('TRANSFORM_DELETE_INPUT_DRIFT');
  };
  const verify = async (): Promise<void> => {
    check();
    await verifyInput();
    check();
  };
  let first: string | undefined;
  const read = async (): Promise<void> => {
    check();
    if (verbatim) {
      const observed = await readVerbatimTransform(targetId, name, space, client);
      check();
      first ??= observed;
      if (observed !== first) throw new DataTransformError('TRANSFORM_TARGET_DRIFT');
      return;
    }
    const observed = await retrieveDataTransform(targetId, client, 'retrieve', undefined, space);
    check();
    refuseProcessing(observed.runtime.status);
    // Enum values the org stores in its own letter case are no drift.
    if (
      !sameDataTransformDocument(
        observed.document,
        validateDataTransformDocument(value, 'retrieve'),
        'retrieve',
      )
    )
      throw new DataTransformError('TRANSFORM_TARGET_DRIFT');
  };
  await verify();
  await read();
  check();
  const inventory = await listDataTransformInventory(client, check);
  if (!inventory.some((row) => row.id === targetId && row.name === name))
    throw new DataTransformError('TRANSFORM_DELETE_IDENTITY_MISMATCH');
  await verify();
  await read();
  const result = (
    outcome: DataTransformDeleteResult['outcome'],
    mutation: DataTransformDeleteResult['mutation'],
  ): DataTransformDeleteResult => ({ operation: 'delete', targetId, outcome, mutation });
  if (preview) return result('preview', 'not-attempted');
  if (confirmDelete !== true) return result('blocked', 'not-attempted');
  try {
    await client.delete(targetId);
  } catch (error) {
    // Salesforce's 4xx refusal changed nothing (live API 68: 403 on a system transform). A 404
    // and any other error have an uncertain outcome. Never replay or claim acknowledgement.
    if (rejectedWrite(error) && !(error instanceof ConnectError && error.statusCode === 404))
      return { ...result('failed', 'rejected'), error };
    return result('deletion-unconfirmed', 'unknown');
  }
  try {
    // The list keeps the transform for a while after the DELETE: poll it, bounded.
    const now = options.now ?? Date.now;
    const delay = options.delay ?? (async (milliseconds: number) => wait(milliseconds));
    const deadline = now() + SETTLE_BUDGET_MS;
    let listed = true;
    for (;;) {
      check();
      const after = await listDataTransformInventory(client, check);
      listed = after.some((row) => row.id === targetId || row.name === name);
      if (!listed || now() >= deadline) break;
      await delay(Math.min(SETTLE_INTERVAL_MS, Math.max(0, deadline - now())));
    }
    if (listed) return result('deletion-unconfirmed', 'acknowledged');
    return result('deleted', 'confirmed-deleted');
  } catch {
    return result('deletion-unconfirmed', 'acknowledged');
  }
}
