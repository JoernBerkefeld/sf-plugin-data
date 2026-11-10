import { isDeepStrictEqual } from 'node:util';
import {
  DataTransformError,
  dataTransformId,
  observeDataTransform,
  serializeDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import type { DloClient } from '../transport/dlo-rest.js';
import {
  bindDataTransformDlos,
  preflightDataTransformDeploy,
} from './preflight-data-transform-deploy.js';
import type { DataTransformDeploySelection } from './preflight-data-transform-deploy.js';

/**
 * Freshly preflight, send exactly once, then independently verify the acknowledged definition.
 * An error after dispatch is not absence or permission to replay; processing is not run success.
 * @param {unknown} value Portable input artifact.
 * @param {DataTransformDeploySelection} selection Explicit create-only or identity-bound update.
 * @param {DataTransformClient} client Native transform adapter.
 * @param {DloClient} dlos Shared native prerequisite adapter.
 * @param {object} [options] Input verification and mutation boundary notification.
 * @param {() => Promise<void>} [options.verifyInput] Reverify captured local bytes.
 * @param {() => void} [options.onDispatch] Notify immediately before invoking the write.
 * @param {boolean} [options.allowProcessing] Explicit processing acknowledgment when provided.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', observation: DataTransformObservation, serverProcessing?: true}>} Independently observed definition, never computation completion.
 */
export async function executeDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  dlos: Pick<DloClient, 'get'>,
  options: {
    verifyInput?: () => Promise<void>;
    onDispatch?: () => void;
    allowProcessing?: boolean;
  } = {},
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  observation: DataTransformObservation;
  serverProcessing?: true;
}> {
  const plan = await preflightDataTransformDeploy(value, selection, client, dlos);
  if (plan.operation === 'unchanged') {
    await options.verifyInput?.();
    return { operation: 'unchanged', observation: plan.current! };
  }
  if (options.allowProcessing === false)
    throw new DataTransformError('TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED');
  const prerequisites = await bindDataTransformDlos(plan.document, dlos);
  if (
    !isDeepStrictEqual(
      prerequisites.map(({ document, targetId, runtime }) => ({
        document,
        targetId,
        memberships: runtime.dataSpaceInfo,
      })),
      plan.prerequisites.map(({ document, targetId, runtime }) => ({
        document,
        targetId,
        memberships: runtime.dataSpaceInfo,
      })),
    )
  )
    throw new DataTransformError('TRANSFORM_PREREQUISITE_DRIFT');
  await options.verifyInput?.();
  // Last remote check before PUT; this is not an atomic server-side conditional write.
  if (plan.current) {
    const fresh = observeDataTransform(
      await client.get(plan.targetId!),
      await client.schedule(plan.targetId!),
    );
    if (
      fresh.targetId !== plan.targetId ||
      serializeDataTransformDocument(fresh.document) !==
        serializeDataTransformDocument(plan.current.document) ||
      !isDeepStrictEqual(fresh.schedule, plan.current.schedule)
    )
      throw new DataTransformError('TRANSFORM_TARGET_DRIFT');
  }
  options.onDispatch?.();
  const response =
    plan.operation === 'create'
      ? await client.create(plan.document.definition)
      : await client.update(plan.targetId!, plan.document.definition);
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new DataTransformError('TRANSFORM_WRITE_UNCONFIRMED');
  const receipt = response as Record<string, unknown>;
  if (
    typeof receipt.id !== 'string' ||
    !dataTransformId.test(receipt.id) ||
    receipt.name !== plan.document.definition.name ||
    (plan.targetId !== undefined && receipt.id !== plan.targetId)
  )
    throw new DataTransformError('TRANSFORM_WRITE_IDENTITY_MISMATCH');
  const observed = observeDataTransform(
    await client.get(receipt.id),
    await client.schedule(receipt.id),
    true,
  );
  if (
    observed.targetId !== receipt.id ||
    serializeDataTransformDocument(observed.document) !==
      serializeDataTransformDocument(plan.document)
  )
    throw new DataTransformError('TRANSFORM_READBACK_MISMATCH');
  const after = await bindDataTransformDlos(plan.document, dlos);
  // Runtime counters may change independently; complete field/key/category/membership definitions may not.
  if (
    !isDeepStrictEqual(
      after.map(({ document, targetId, runtime }) => ({
        document,
        targetId,
        memberships: runtime.dataSpaceInfo,
      })),
      prerequisites.map(({ document, targetId, runtime }) => ({
        document,
        targetId,
        memberships: runtime.dataSpaceInfo,
      })),
    )
  )
    throw new DataTransformError('TRANSFORM_PREREQUISITE_CHANGED');
  return {
    operation: plan.operation,
    observation: observed,
    ...(receipt.status === 'PROCESSING' || observed.runtime.status === 'PROCESSING'
      ? { serverProcessing: true as const }
      : {}),
  };
}
