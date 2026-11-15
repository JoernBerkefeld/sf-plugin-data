import {
  DataTransformError,
  dataTransformId,
  dataTransformName,
  observeDataTransform,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';

/**
 * Acquire one explicitly selected native transform and its schedule (kept as an observation).
 * HTTP404 remains a read failure, never an absence or create permission. In retrieve mode the
 * schedule read is best effort (the file never carries the schedule): a failed read or an answer
 * that is not an object counts as no schedule, with a warning.
 * @param {string} nameOrId Exact selected API name or native record ID.
 * @param {Pick<DataTransformClient, 'get' | 'schedule'>} client Qualified API68/default transport.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @param {string[]} [warnings] Receives the retrieve-mode schedule warning.
 * @returns {Promise<DataTransformObservation>} Input-only artifact and detached observations.
 */
export async function retrieveDataTransform(
  nameOrId: string,
  client: Pick<DataTransformClient, 'get' | 'schedule'>,
  mode: DocumentMode = 'deploy',
  warnings?: string[],
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
  if (mode === 'deploy') return observeDataTransform(runtime, await client.schedule(id.value));
  let schedule: unknown;
  try {
    schedule = await client.schedule(id.value);
  } catch {
    schedule = undefined;
  }
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    warnings?.push(
      `data-transform:${name.value}: its schedule could not be read, so it is treated as none. The file never carries the schedule; check it in Data Cloud.`,
    );
    schedule = {};
  }
  return observeDataTransform(runtime, schedule, mode);
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
