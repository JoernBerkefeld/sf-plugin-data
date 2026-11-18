import {
  DataTransformError,
  dataTransformId,
  observeDataTransform,
  serializeDataTransformDocument,
  unscheduled,
} from '../artifacts/data-transform-document.js';
import type { DataTransformObservation } from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import { setTimeout as wait } from 'node:timers/promises';
import { rejectedWrite } from './execute-calculated-insight-deploy.js';
import { preflightDataTransformDeploy } from './preflight-data-transform-deploy.js';
import type { DataTransformDeploySelection } from './preflight-data-transform-deploy.js';

/**
 * The frequency of a schedule in lower case, for the readback check.
 * @param {Record<string, unknown> | undefined} schedule Projected or authored schedule.
 * @returns {string | undefined} Lower-case frequency, if any.
 */
function frequency(schedule: Record<string, unknown> | undefined): string | undefined {
  return typeof schedule?.frequency === 'string' ? schedule.frequency.toLowerCase() : undefined;
}

/**
 * A new or updated transform answers `PROCESSING` (live it stayed so for about 2.5 minutes after a
 * create), and Salesforce refuses a schedule PUT on a transform that is not active (400
 * `INVALID_STATUS`). Before the schedule PUT the transform is read until it is no longer
 * processing, within this bound.
 */
const SETTLE_BUDGET_MS = 300_000;
const SETTLE_INTERVAL_MS = 5000;

/**
 * The definition was written, but the schedule of the file was not: Salesforce refused the
 * schedule PUT (`TRANSFORM_SCHEDULE_REJECTED`, its answer in `cause`), or the transform was still
 * processing at the end of the bound and the PUT was not sent (`TRANSFORM_SCHEDULE_NOT_SENT`).
 */
export class DataTransformScheduleError extends DataTransformError {
  /**
   * @param {'TRANSFORM_SCHEDULE_REJECTED' | 'TRANSFORM_SCHEDULE_NOT_SENT'} code Outcome code.
   * @param {'create' | 'update'} definition The definition write that was confirmed.
   * @param {unknown} [cause] Salesforce's refusal of the schedule PUT.
   */
  public constructor(
    code: 'TRANSFORM_SCHEDULE_REJECTED' | 'TRANSFORM_SCHEDULE_NOT_SENT',
    public readonly definition: 'create' | 'update',
    public readonly cause?: unknown,
  ) {
    super(code);
  }
}

/** Errors of an item's first write that Salesforce answered with a 4xx: nothing was written. */
const refusals = new WeakSet<object>();

/**
 * Whether a transform deploy failed because Salesforce refused its first write (HTTP 4xx), so
 * nothing was written for the transform.
 * @param {unknown} error Error thrown by {@link executeDataTransformDeploy}.
 * @returns {boolean} True for that refusal.
 */
export function rejectedTransformWrite(error: unknown): boolean {
  return typeof error === 'object' && error !== null && refusals.has(error);
}

/**
 * Freshly preflight, then send what changed exactly once: the definition (create POST or update
 * PUT), then the schedule PUT of the file. Afterwards the transform and its schedule are read back
 * for their identity; Salesforce stores a normalized form, so the definition is not compared with
 * the file (retrieve gives the stored form), and a written schedule must read back with the
 * frequency of the file. A 4xx answer to the first write is Salesforce's refusal (see
 * {@link rejectedTransformWrite}); any other error after dispatch is not absence or permission to
 * replay; processing is not run success.
 * @param {unknown} value Portable input artifact.
 * @param {DataTransformDeploySelection} selection Create, or update of the target resolved by name.
 * @param {DataTransformClient} client Native transform adapter.
 * @param {object} [options] Input verification and mutation boundary notification.
 * @param {() => Promise<void>} [options.verifyInput] Reverify captured local bytes.
 * @param {() => void} [options.onDispatch] Notify immediately before invoking the first write.
 * @param {() => number} [options.now] Clock of the settle poll.
 * @param {(milliseconds: number) => Promise<void>} [options.delay] Sleep of the settle poll.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', observation: DataTransformObservation, scheduleWritten?: true, serverProcessing?: true}>} The stored transform as read back, never computation completion.
 */
export async function executeDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  options: {
    verifyInput?: () => Promise<void>;
    onDispatch?: () => void;
    /** Clock and sleep for the settle poll before a schedule PUT; tests inject fakes. */
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  observation: DataTransformObservation;
  scheduleWritten?: true;
  serverProcessing?: true;
}> {
  const plan = await preflightDataTransformDeploy(value, selection, client);
  if (plan.operation === 'unchanged') {
    await options.verifyInput?.();
    return { operation: 'unchanged', observation: plan.current! };
  }
  await options.verifyInput?.();
  // Last remote check before the writes; this is not an atomic server-side conditional write.
  // The schedule compares as projected, so a moved next run time is no drift.
  if (plan.current) {
    const fresh = observeDataTransform(
      await client.get(plan.targetId!),
      await client.schedule(plan.targetId!),
    );
    if (
      fresh.targetId !== plan.targetId ||
      serializeDataTransformDocument(fresh.document) !==
        serializeDataTransformDocument(plan.current.document)
    )
      throw new DataTransformError('TRANSFORM_TARGET_DRIFT');
  }
  options.onDispatch?.();
  let first = true;
  const write = async (send: () => Promise<unknown>): Promise<unknown> => {
    const isFirst = first;
    first = false;
    try {
      return await send();
    } catch (error) {
      if (isFirst && rejectedWrite(error) && typeof error === 'object' && error !== null)
        refusals.add(error);
      throw error;
    }
  };
  let targetId = plan.targetId;
  let receiptStatus: unknown;
  if (plan.writeDefinition) {
    const response = await write(async () =>
      plan.operation === 'create'
        ? client.create(plan.document.definition)
        : client.update(plan.targetId!, plan.document.definition),
    );
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
    targetId = receipt.id;
    receiptStatus = receipt.status;
  }
  if (plan.writeSchedule && plan.writeDefinition) {
    // After a definition write, wait until the transform is no longer processing; a 4xx answer
    // to the schedule PUT then leaves the written definition in place.
    const definition = plan.operation === 'create' ? 'create' : 'update';
    const now = options.now ?? Date.now;
    const delay = options.delay ?? (async (milliseconds: number) => wait(milliseconds));
    const deadline = now() + SETTLE_BUDGET_MS;
    for (;;) {
      const read = await client.get(targetId!);
      const status =
        read && typeof read === 'object' ? (read as Record<string, unknown>).status : undefined;
      if (typeof status !== 'string' || status.toUpperCase() !== 'PROCESSING') break;
      if (now() >= deadline)
        throw new DataTransformScheduleError('TRANSFORM_SCHEDULE_NOT_SENT', definition);
      await delay(Math.min(SETTLE_INTERVAL_MS, Math.max(0, deadline - now())));
    }
    try {
      await write(async () => client.setSchedule(targetId!, plan.document.schedule!));
    } catch (error) {
      if (rejectedWrite(error))
        throw new DataTransformScheduleError('TRANSFORM_SCHEDULE_REJECTED', definition, error);
      throw error;
    }
  } else if (plan.writeSchedule)
    await write(async () => client.setSchedule(targetId!, plan.document.schedule!));
  const raw = await client.get(targetId!);
  const rawSchedule = await client.schedule(targetId!);
  let observed: DataTransformObservation;
  try {
    observed = observeDataTransform(raw, rawSchedule);
  } catch (error) {
    // A readback that is not a transform of this name is an identity mismatch.
    if (error instanceof DataTransformError)
      throw new DataTransformError('TRANSFORM_READBACK_MISMATCH');
    throw error;
  }
  if (
    observed.targetId !== targetId ||
    observed.document.definition.name !== plan.document.definition.name ||
    (plan.writeSchedule &&
      frequency(observed.document.schedule ?? unscheduled) !== frequency(plan.document.schedule))
  )
    throw new DataTransformError('TRANSFORM_READBACK_MISMATCH');
  return {
    operation: plan.operation,
    observation: observed,
    ...(plan.writeSchedule ? { scheduleWritten: true as const } : {}),
    ...(receiptStatus === 'PROCESSING' || observed.runtime.status === 'PROCESSING'
      ? { serverProcessing: true as const }
      : {}),
  };
}
