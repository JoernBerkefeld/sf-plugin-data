import {
  DataTransformError,
  sameDataTransformDefinition,
  sameDataTransformSchedule,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type {
  DataTransformDocument,
  DataTransformObservation,
} from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import { retrieveDataTransform } from './retrieve-data-transform.js';

export type DataTransformDeploySelection =
  { operation: 'create' } | { operation: 'update'; targetId: string };
export type DataTransformDeployPlan = {
  operation: 'create' | 'update' | 'unchanged';
  document: DataTransformDocument;
  targetId?: string;
  current?: DataTransformObservation;
  /** Whether the definition is sent (create POST or update PUT). */
  writeDefinition: boolean;
  /** Whether the schedule of the file is sent with the schedule PUT. */
  writeSchedule: boolean;
};

/**
 * Preflight a create, or an update of the target the deploy resolved by name. The definition is
 * unchanged when it equals the org's projected input (enum values ignoring letter case); the
 * schedule is unchanged when the file has none (left alone) or it equals the org's projected
 * schedule (a new transform has none). What differs is sent as written and Salesforce decides.
 * @param {unknown} value Portable artifact.
 * @param {DataTransformDeploySelection} selection Create, or update with the resolved target ID.
 * @param {DataTransformClient} client Native API68 transform transport.
 * @param {object} [options] Preview-only native validation control.
 * @param {boolean} [options.skipServerValidation] Skip validation POST for GET-only preview.
 * @returns {Promise<DataTransformDeployPlan>} Fresh target-bound plan, not a replay token.
 */
export async function preflightDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  options: { skipServerValidation?: boolean } = {},
): Promise<DataTransformDeployPlan> {
  const document = validateDataTransformDocument(value);
  let current: DataTransformObservation | undefined;
  if (selection.operation === 'update') {
    current = await retrieveDataTransform(selection.targetId, client);
    if (current.document.definition.name !== document.definition.name)
      throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
  }
  const writeDefinition = !current || !sameDataTransformDefinition(current.document, document);
  const writeSchedule =
    document.schedule !== undefined &&
    !sameDataTransformSchedule(current?.document.schedule, document.schedule);
  if (current && !writeDefinition && !writeSchedule)
    return {
      operation: 'unchanged',
      document,
      targetId: current.targetId,
      current,
      writeDefinition,
      writeSchedule,
    };
  // The validation endpoint rejects an existing owner's own output (live-observed), so only create is validated.
  if (selection.operation === 'create' && !options.skipServerValidation) {
    const validation = await client.validate(document.definition);
    if (
      !validation ||
      typeof validation !== 'object' ||
      Array.isArray(validation) ||
      !Array.isArray((validation as Record<string, unknown>).issues) ||
      ((validation as Record<string, unknown>).issues as unknown[]).length > 0
    )
      throw new DataTransformError('TRANSFORM_VALIDATION_FAILED');
  }
  return {
    operation: selection.operation,
    document,
    targetId: current?.targetId,
    current,
    writeDefinition,
    writeSchedule,
  };
}
