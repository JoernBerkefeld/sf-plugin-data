import {
  dataTransformSpaceMismatch,
  DataTransformError,
  dataTransformId,
  dataTransformName,
  observeDataTransform,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
import { resolveDataTransformSpace } from './data-transform-space.js';

/**
 * Acquire one explicitly selected native transform and its schedule (projected into the document
 * and kept as read). HTTP404 remains a read failure, never an absence or create permission. In
 * retrieve mode the schedule read is best effort: a failed read or an answer that is not an object
 * leaves the schedule out of the file (deploy then leaves the schedule alone), with a warning.
 * @param {string} nameOrId Exact selected API name or native record ID.
 * The transform's data space is resolved right after the GET, before anything is projected: its
 * `dataSpaceName`, otherwise the org's MktDataTransform record (`client.dataSpaces`). With
 * `dataSpace`, a transform of another data space is TRANSFORM_DATASPACE_MISMATCH, never a
 * verbatim stand-in.
 * @param {Pick<DataTransformClient, 'get' | 'schedule' | 'dataSpaces'>} client Qualified API68 transport.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @param {string[]} [warnings] Receives the retrieve-mode schedule warning.
 * @param {string} [dataSpace] The data space the transform must be in.
 * @returns {Promise<DataTransformObservation>} Input-only artifact and detached observations.
 */
export async function retrieveDataTransform(
  nameOrId: string,
  client: Pick<DataTransformClient, 'get' | 'schedule' | 'dataSpaces'>,
  mode: DocumentMode = 'deploy',
  warnings?: string[],
  dataSpace?: string,
): Promise<DataTransformObservation> {
  if (
    typeof nameOrId !== 'string' ||
    !(dataTransformName.test(nameOrId) || dataTransformId.test(nameOrId))
  )
    throw new DataTransformError('INVALID_TRANSFORM_SELECTION');
  const runtime = await client.get(nameOrId);
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime))
    throw new DataTransformError('INVALID_TRANSFORM_RESPONSE');
  const id = Object.getOwnPropertyDescriptor(runtime, 'id');
  const name = Object.getOwnPropertyDescriptor(runtime, 'name');
  if (
    !id ||
    !('value' in id) ||
    typeof id.value !== 'string' ||
    !dataTransformId.test(id.value) ||
    !name ||
    !('value' in name) ||
    typeof name.value !== 'string' ||
    !dataTransformName.test(name.value) ||
    (nameOrId !== id.value && nameOrId !== name.value)
  )
    throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
  const space = await resolveDataTransformSpace(runtime as Record<string, unknown>, async () =>
    client.dataSpaces(),
  );
  if (dataSpace !== undefined && space !== dataSpace)
    throw dataTransformSpaceMismatch(name.value, space, dataSpace);
  if (mode === 'deploy')
    return observeDataTransform(runtime, await client.schedule(id.value), 'deploy', space);
  let schedule: unknown;
  try {
    schedule = await client.schedule(id.value);
  } catch {
    schedule = undefined;
  }
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    warnings?.push(
      `data-transform:${name.value}: its schedule could not be read, so the file leaves it out and a deploy of the file leaves the schedule alone. Check it in Data Cloud.`,
    );
    schedule = {};
  }
  return observeDataTransform(runtime, schedule, mode, space);
}

/**
 * Return the portable artifact relative path; filesystem publication belongs to command integration.
 * @param {string} apiName Exact admitted transform developer name.
 * @returns {string} Fixed portable JSON destination under the source root.
 */
export function dataTransformArtifactPath(apiName: string): string {
  if (typeof apiName !== 'string' || !dataTransformName.test(apiName))
    throw new DataTransformError('INVALID_TRANSFORM_SELECTION');
  return `data360/dataTransforms/${apiName}.dataTransform.json`;
}
