import {
  DataTransformError,
  dataTransformId,
  dataTransformName,
  observeDataTransform,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';

/**
 * Acquire one explicitly selected native transform and independently verify no schedule.
 * HTTP404 remains a read failure, never an absence or create permission.
 * @param {string} nameOrId Exact selected API name or native record ID.
 * @param {Pick<DataTransformClient, 'get' | 'schedule'>} client Qualified API68/default transport.
 * @returns {Promise<DataTransformObservation>} Input-only artifact and detached observations.
 */
export async function retrieveDataTransform(
  nameOrId: string,
  client: Pick<DataTransformClient, 'get' | 'schedule'>,
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
  const schedule = await client.schedule(id.value);
  return observeDataTransform(runtime, schedule);
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
