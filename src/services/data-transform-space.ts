import { DataTransformError } from '../artifacts/data-transform-document.js';
import { isDataSpaceName } from '../artifacts/data-space-field.js';

// A transform record ID: `1dt`, 15 or 18 characters.
const recordId = /^1dt[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u;

/**
 * The refusal of an unreadable data space of a transform.
 * @returns {DataTransformError} TRANSFORM_DATASPACE_UNREADABLE.
 */
function unreadable(): DataTransformError {
  return new DataTransformError('TRANSFORM_DATASPACE_UNREADABLE');
}

/**
 * The data space of every data transform of the org, read with one SOQL query over the command's
 * own connection: `SELECT Id, DataSpace.Name FROM MktDataTransform`. Live at API 68 (DB entry
 * data360:dataspace-access-membership-20261118-api68): `Id` is the transform's `1dt` record ID
 * (the `id` of its GET and list entry) and `DataSpaceId` points at its data space; the system
 * transform `StaticCurrencyRatesTransform_Home` has none (null). `Name` is the label, not the API
 * name, and the object has no developer name, so the map is keyed by ID only (18 characters and
 * the 15-character prefix). Anything but one complete page of records with a usable ID is
 * TRANSFORM_DATASPACE_UNREADABLE.
 * @param {(query: string) => Promise<unknown>} soql Runs one SOQL query.
 * @returns {Promise<ReadonlyMap<string, string | null>>} Record ID to data space (null: none).
 */
export async function readDataTransformSpaces(
  soql: (query: string) => Promise<unknown>,
): Promise<ReadonlyMap<string, string | null>> {
  let response: unknown;
  try {
    response = await soql('SELECT Id, DataSpace.Name FROM MktDataTransform');
  } catch {
    throw unreadable();
  }
  const body = response as { done?: unknown; totalSize?: unknown; records?: unknown } | null;
  if (
    !body ||
    body.done !== true ||
    !Array.isArray(body.records) ||
    body.records.length !== body.totalSize
  )
    throw unreadable();
  const spaces = new Map<string, string | null>();
  for (const entry of body.records as unknown[]) {
    const record = (entry ?? {}) as { Id?: unknown; DataSpace?: unknown };
    const space = (record.DataSpace as { Name?: unknown } | null | undefined)?.Name;
    if (
      typeof record.Id !== 'string' ||
      !recordId.test(record.Id) ||
      (space !== undefined && space !== null && !isDataSpaceName(space))
    )
      throw unreadable();
    // eslint-disable-next-line unicorn/no-null -- null marks a transform without any data space.
    const value = isDataSpaceName(space) ? space : null;
    spaces.set(record.Id, value);
    // A 15-character ID matches the 18-character one of the GET too.
    spaces.set(record.Id.slice(0, 15), value);
  }
  return spaces;
}

/**
 * The data space of one transform as the plugin handles it: the `dataSpaceName` of its GET when
 * it names one, otherwise the data space its MktDataTransform record names, found by the GET's
 * record `id` only (never by a name or label). A transform without any data space (a system
 * transform) is handled in `default` only; a missing `id`, or one the records lack, is
 * TRANSFORM_DATASPACE_UNREADABLE.
 * @param {Record<string, unknown>} raw The transform GET.
 * @param {() => Promise<ReadonlyMap<string, string | null>>} spaces The org's transform spaces.
 * @returns {Promise<string>} Data space.
 */
export async function resolveDataTransformSpace(
  raw: Record<string, unknown>,
  spaces: () => Promise<ReadonlyMap<string, string | null>>,
): Promise<string> {
  if (isDataSpaceName(raw.dataSpaceName)) return raw.dataSpaceName;
  return dataTransformSpaceById(raw.id, await spaces());
}

/**
 * The data space of a transform record ID in the org's records (`default` for none).
 * @param {unknown} id Record ID.
 * @param {ReadonlyMap<string, string | null>} known The org's transform spaces.
 * @returns {string} Data space.
 */
export function dataTransformSpaceById(
  id: unknown,
  known: ReadonlyMap<string, string | null>,
): string {
  if (typeof id !== 'string' || !recordId.test(id) || !known.has(id)) throw unreadable();
  return known.get(id) ?? 'default';
}
