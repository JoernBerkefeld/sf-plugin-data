import { isDeepStrictEqual } from 'node:util';
import {
  DataTransformError,
  dataTransformId,
  observeDataTransform,
  serializeDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import { preflightDataTransformDeploy } from './preflight-data-transform-deploy.js';
import type { DataTransformDeploySelection } from './preflight-data-transform-deploy.js';

/**
 * Freshly preflight, send exactly once, then read the written transform back for its identity.
 * Salesforce stores a normalized form, so the readback is not compared with the file; retrieve
 * gives the stored form. An error after dispatch is not absence or permission to replay;
 * processing is not run success.
 * @param {unknown} value Portable input artifact.
 * @param {DataTransformDeploySelection} selection Create, or update of the target resolved by name.
 * @param {DataTransformClient} client Native transform adapter.
 * @param {object} [options] Input verification and mutation boundary notification.
 * @param {() => Promise<void>} [options.verifyInput] Reverify captured local bytes.
 * @param {() => void} [options.onDispatch] Notify immediately before invoking the write.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', observation: DataTransformObservation, serverProcessing?: true}>} The stored transform as read back, never computation completion.
 */
export async function executeDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  options: {
    verifyInput?: () => Promise<void>;
    onDispatch?: () => void;
  } = {},
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  observation: DataTransformObservation;
  serverProcessing?: true;
}> {
  const plan = await preflightDataTransformDeploy(value, selection, client);
  if (plan.operation === 'unchanged') {
    await options.verifyInput?.();
    return { operation: 'unchanged', observation: plan.current! };
  }
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
  const raw = await client.get(receipt.id);
  const rawSchedule = await client.schedule(receipt.id);
  let observed: DataTransformObservation;
  try {
    observed = observeDataTransform(raw, rawSchedule);
  } catch (error) {
    // A readback that is not a custom, unpackaged transform of this name is an identity mismatch.
    if (error instanceof DataTransformError)
      throw new DataTransformError('TRANSFORM_READBACK_MISMATCH');
    throw error;
  }
  if (
    observed.targetId !== receipt.id ||
    observed.document.definition.name !== plan.document.definition.name
  )
    throw new DataTransformError('TRANSFORM_READBACK_MISMATCH');
  return {
    operation: plan.operation,
    observation: observed,
    ...(receipt.status === 'PROCESSING' || observed.runtime.status === 'PROCESSING'
      ? { serverProcessing: true as const }
      : {}),
  };
}
