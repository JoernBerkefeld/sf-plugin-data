import {
  DataTransformError,
  serializeDataTransformDocument,
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
};

/**
 * Preflight a create, or an update of the target the deploy resolved by name. The file is
 * unchanged when it equals the org's projected input; otherwise it is sent as written and
 * Salesforce decides.
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
  if (
    current &&
    serializeDataTransformDocument(current.document) === serializeDataTransformDocument(document)
  )
    return { operation: 'unchanged', document, targetId: current.targetId, current };
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
  };
}
