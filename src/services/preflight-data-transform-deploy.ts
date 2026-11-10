import { isDeepStrictEqual } from 'node:util';
import {
  DataTransformError,
  dataTransformId,
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type {
  DataTransformDocument,
  DataTransformObservation,
} from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import type { DloClient } from '../transport/dlo-rest.js';
import { resolveNativeDloTarget } from './native-dlo.js';
import { retrieveDataTransform } from './retrieve-data-transform.js';

export type DataTransformDeploySelection =
  { operation: 'create' } | { operation: 'update'; targetId: string };
export type DataTransformPrerequisites = Awaited<ReturnType<typeof resolveNativeDloTarget>>[];
export type DataTransformDeployPlan = {
  operation: 'create' | 'update' | 'unchanged';
  document: DataTransformDocument;
  targetId?: string;
  current?: DataTransformObservation;
  prerequisites: DataTransformPrerequisites;
};

/**
 * Bind the admitted mapping to two compatible, existing target DLOs through the shared adapter.
 * No missing prerequisite is provisioned and no error becomes absence.
 * @param {DataTransformDocument} document Admitted input artifact.
 * @param {Pick<DloClient, 'get'>} client Existing native DLO read adapter.
 * @returns {Promise<DataTransformPrerequisites>} Complete schemas and target identities.
 */
export async function bindDataTransformDlos(
  document: DataTransformDocument,
  client: Pick<DloClient, 'get'>,
): Promise<DataTransformPrerequisites> {
  const input = validateDataTransformDocument(document).definition;
  const definition = input.definition as Record<string, unknown>;
  const nodes = Object.values(definition.nodes as Record<string, Record<string, unknown>>);
  const load = nodes.find((node) => node.action === 'load')!.parameters as Record<string, unknown>;
  const output = nodes.find((node) => node.action === 'outputD360')!.parameters as Record<
    string,
    unknown
  >;
  const sourceName = (load.dataset as Record<string, unknown>).name as string;
  const targets = [];
  for (const name of [sourceName, output.name as string]) {
    const target = await resolveNativeDloTarget(name, client, 'default');
    if (target.runtime.status !== 'ACTIVE' || target.document.spec.category !== 'Other')
      throw new DataTransformError('UNSUPPORTED_TRANSFORM_DLO_STATE');
    targets.push(target);
  }
  if (targets[0].targetId === targets[1].targetId)
    throw new DataTransformError('TRANSFORM_DLO_IDENTITY_MISMATCH');
  const mapping = (output.fieldsMappings as Record<string, unknown>[])[0];
  const source = targets[0].document.spec.fields.find(
    (field) => field.name === mapping.sourceField,
  );
  const destination = targets[1].document.spec.fields.find(
    (field) => field.name === mapping.targetField,
  );
  // The qualified one-field load/output maps the complete primary key, not an omitted output key.
  if (
    !source ||
    !destination ||
    !source.isPrimaryKey ||
    !destination.isPrimaryKey ||
    !isDeepStrictEqual(
      Object.fromEntries(
        Object.entries(source).filter(([key]) => !['name', 'label'].includes(key)),
      ),
      Object.fromEntries(
        Object.entries(destination).filter(([key]) => !['name', 'label'].includes(key)),
      ),
    )
  )
    throw new DataTransformError('INCOMPATIBLE_TRANSFORM_DLO_FIELDS');
  return targets;
}

/**
 * Preflight explicit create-only or positively identity-bound update; never infer absence.
 * @param {unknown} value Portable artifact.
 * @param {DataTransformDeploySelection} selection Explicit operation and target ID for update.
 * @param {DataTransformClient} client Native API68 transform transport.
 * @param {Pick<DloClient, 'get'>} dlos Existing native DLO adapter.
 * @param {object} [options] Preview-only native validation control.
 * @param {boolean} [options.skipServerValidation] Skip validation POST for GET-only preview.
 * @returns {Promise<DataTransformDeployPlan>} Fresh target-bound plan, not a replay token.
 */
export async function preflightDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  dlos: Pick<DloClient, 'get'>,
  options: { skipServerValidation?: boolean } = {},
): Promise<DataTransformDeployPlan> {
  const document = validateDataTransformDocument(value);
  if (
    !selection ||
    !['create', 'update'].includes(selection.operation) ||
    Object.keys(selection).length !== (selection.operation === 'create' ? 1 : 2)
  )
    throw new DataTransformError('INVALID_TRANSFORM_DEPLOY_SELECTION');
  let current: DataTransformObservation | undefined;
  if (selection.operation === 'update') {
    if (typeof selection.targetId !== 'string' || !dataTransformId.test(selection.targetId))
      throw new DataTransformError('INVALID_TRANSFORM_TARGET_ID');
    current = await retrieveDataTransform(selection.targetId, client);
    if (current.document.definition.name !== document.definition.name)
      throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
    if (!isDeepStrictEqual(current.document.definition.definition, document.definition.definition))
      throw new DataTransformError('UNSUPPORTED_TRANSFORM_LOGIC_CHANGE');
  }
  const prerequisites = await bindDataTransformDlos(document, dlos);
  if (
    current &&
    serializeDataTransformDocument(current.document) === serializeDataTransformDocument(document)
  )
    return { operation: 'unchanged', document, targetId: current.targetId, current, prerequisites };
  // Update keeps the proven-identical logic, and the validation endpoint rejects an existing owner's own output (live-observed), so only create is validated.
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
    prerequisites,
  };
}
