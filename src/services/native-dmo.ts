import { isDeepStrictEqual } from 'node:util';
import { explainMismatch } from './operation-diagnostic.js';
import {
  isCustomNativeDmo,
  NativeDmoError,
  nativeDmoName,
  normalizeNativeDmo,
  sameDmoCategory,
  unwrapNativeDmo,
  validateNativeDmoDocument,
} from '../artifacts/native-dmo-document.js';
import type { NativeDmoDocument, NativeDmoField } from '../artifacts/native-dmo-document.js';
import type { DmoClient } from '../transport/dmo-rest.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';

export type NativeDmoDeployPlan =
  | {
      operation: 'create' | 'update';
      apiName: string;
      targetApiName?: string;
      body: Record<string, unknown>;
    }
  | {
      operation: 'unchanged';
      apiName: string;
      document: NativeDmoDocument;
    };

/** Bounded post-write readback; the single write is never repeated. */
export type NativeDmoSettle = {
  attempts: number;
  delayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
};

const defaultSettle: NativeDmoSettle = {
  attempts: 6,
  delayMs: 5000,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const systemFields = new Set(['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c']);
// Returned by reads but rejected as unknown input by the API (live API 68 probes).
const readOnlyFieldKeys = new Set(['creationType', 'isDistinct', 'usageTag', 'keyQualifierName']);
// Accepted as input but not returned by reads, so they cannot be compared or confirmed.
const writeOnlyFieldKeys = new Set(['description', 'isDynamicLookup']);
// The API answers 200 to these edits of an existing field and silently ignores them.
const immutableFieldKeys = new Set(['dataType', 'isPrimaryKey']);
const handledSpecKeys = new Set(['label', 'category', 'description', 'fields']);

/**
 * Identify generated fields without borrowing DLO SourceVersion assumptions.
 * @param {NativeDmoField} field Portable field.
 * @returns {boolean} Whether writes must omit the field.
 */
function generated(field: NativeDmoField): boolean {
  return (
    systemFields.has(field.name) || field.name.startsWith('KQ_') || field.creationType === 'System'
  );
}

/**
 * Project an authored field to native input: bare name, read-only keys dropped, the rest as written.
 * Data type and optional keys are not restricted here; the API decides.
 * @param {NativeDmoField} field Saved field.
 * @returns {Record<string, unknown>} Native input with bare field name.
 */
function fieldInput(field: NativeDmoField): Record<string, unknown> {
  return {
    ...Object.fromEntries(Object.entries(field).filter(([key]) => !readOnlyFieldKeys.has(key))),
    name: field.name.slice(0, -3),
  };
}

/**
 * Classify the difference between an existing target field and its authored definition.
 * @param {NativeDmoField} target Field as read from the target.
 * @param {NativeDmoField} incoming Field as authored.
 * @returns {'same' | 'edit' | {blocked: string}} Whether a PATCH can carry the difference, or the property that cannot change.
 */
function fieldChange(
  target: NativeDmoField,
  incoming: NativeDmoField,
): 'same' | 'edit' | { blocked: string } {
  let change: 'same' | 'edit' = 'same';
  for (const key of new Set([...Object.keys(target), ...Object.keys(incoming)])) {
    const before = target[key];
    const after = incoming[key];
    if (isDeepStrictEqual(before, after)) continue;
    if (writeOnlyFieldKeys.has(key) && before === undefined) continue;
    if (readOnlyFieldKeys.has(key) && after === undefined) continue;
    if (readOnlyFieldKeys.has(key) || immutableFieldKeys.has(key) || generated(target))
      return { blocked: key };
    change = 'edit';
  }
  return change;
}

/**
 * Read the exact full name and verify identity and observed data space, never inspecting its ID.
 * @param {string} apiName Requested full name.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<{raw: Record<string, unknown>, document: NativeDmoDocument}>} Raw read and its portable definition.
 */
async function readTarget(
  apiName: string,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<{ raw: Record<string, unknown>; document: NativeDmoDocument }> {
  if (!nativeDmoName.test(apiName)) throw new NativeDmoError('INVALID_DMO_NAME');
  const raw = unwrapNativeDmo(await client.get(apiName));
  const document = normalizeNativeDmo(raw, requestScope);
  if (document.identity.apiName !== apiName)
    throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
  return { raw, document };
}

/**
 * Resolve the portable definition of an exact full name.
 * @param {string} apiName Requested full name.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<NativeDmoDocument>} Verified target definition.
 */
async function resolveTarget(
  apiName: string,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<NativeDmoDocument> {
  const { document } = await readTarget(apiName, client, requestScope);
  return document;
}

/**
 * Retrieve an exact portable definition including all generated fields.
 * @param {string} apiName Full name ending in __dlm.
 * @param {Pick<DmoClient, 'get'>} client Authenticated client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<NativeDmoDocument>} Portable definition, without runtime observations.
 */
export async function retrieveNativeDmo(
  apiName: string,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<NativeDmoDocument> {
  return resolveTarget(apiName, client, requestScope);
}

/**
 * Preflight a create or update without mutation. Category, data types, labels and optional keys
 * are passed through for the API to judge; only edits the API cannot perform are refused here.
 * @param {unknown} value Portable document.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<NativeDmoDeployPlan>} Fresh name-bound write plan.
 */
export async function preflightNativeDmo(
  value: unknown,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<NativeDmoDeployPlan> {
  const desired = validateNativeDmoDocument(value);
  const apiName = desired.identity.apiName;
  if (requestScope !== undefined && requestScope !== desired.identity.dataSpace)
    throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
  const extras = Object.fromEntries(
    Object.entries(desired.spec).filter(([key]) => !handledSpecKeys.has(key)),
  );
  let target: NativeDmoDocument;
  try {
    const read = await readTarget(apiName, client, requestScope);
    target = read.document;
    if (target.identity.dataSpace !== desired.identity.dataSpace)
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
    // Standard, namespaced and platform-generated DMOs are never written.
    if (!isCustomNativeDmo(read.raw)) throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  } catch (error) {
    if (
      !(error instanceof NativeDmoError) ||
      error.code !== 'DMO_HTTP_ERROR' ||
      error.status !== 404
    )
      throw error;
    if (requestScope === undefined && desired.identity.dataSpace !== 'default')
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
    return {
      operation: 'create',
      apiName,
      body: {
        ...extras,
        name: apiName.slice(0, -5),
        label: desired.spec.label,
        category: desired.spec.category,
        ...(desired.spec.description === undefined
          ? {}
          : { description: desired.spec.description }),
        ...(requestScope === undefined ? {} : { dataSpaceName: requestScope }),
        fields: desired.spec.fields
          .filter((field) => !generated(field))
          .map((field) => fieldInput(field)),
      },
    };
  }
  const existing = new Map(target.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  const edited: NativeDmoField[] = [];
  for (const [name, field] of existing) {
    const authored = incoming.get(name);
    // Generated fields may be left out of an authored definition; custom fields may not,
    // because the API has no route to remove a field.
    if (!authored && generated(field)) continue;
    if (!authored)
      throw explainMismatch(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        authored,
        `fields.${name}`,
      );
    const change = fieldChange(field, authored);
    if (typeof change === 'object')
      // Name the one property that cannot change, not the first incidental difference.
      throw explainMismatch(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field[change.blocked],
        authored[change.blocked],
        `fields.${name}.${change.blocked}`,
      );
    if (change === 'edit') edited.push(authored);
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => generated(field) || field.isPrimaryKey))
    throw new NativeDmoError('UNSUPPORTED_DMO_FIELD_ADDITION');
  const fields = [...edited, ...added].map((field) => fieldInput(field));
  // An absent description is not managed; an explicit empty string clears it.
  const description =
    desired.spec.description !== undefined &&
    desired.spec.description !== (target.spec.description ?? '')
      ? { description: desired.spec.description }
      : {};
  // The API refuses category updates; send a changed one so its answer is reported.
  const category = sameDmoCategory(desired.spec.category, target.spec.category)
    ? {}
    : { category: desired.spec.category };
  const changedExtras = Object.fromEntries(
    Object.entries(extras).filter(([key, entry]) => !isDeepStrictEqual(entry, target.spec[key])),
  );
  if (
    fields.length === 0 &&
    desired.spec.label === target.spec.label &&
    Object.keys({ ...description, ...category, ...changedExtras }).length === 0
  )
    return { operation: 'unchanged', apiName, document: target };
  return {
    operation: 'update',
    apiName,
    targetApiName: target.identity.apiName,
    body: {
      ...changedExtras,
      label: desired.spec.label,
      ...description,
      ...category,
      ...(requestScope === undefined ? {} : { dataSpaceName: requestScope }),
      ...(fields.length > 0 ? { fields } : {}),
    },
  };
}

/**
 * Confirm a requested definition against an independent read, allowing server-added defaults.
 * Keys the API accepts but does not return cannot be confirmed and are not compared.
 * @param {NativeDmoDocument} desired Requested portable state.
 * @param {NativeDmoDocument} actual Independent GET state.
 * @returns {boolean} Whether every requested, readable property survived.
 */
export function nativeDmoConfirmed(desired: NativeDmoDocument, actual: NativeDmoDocument): boolean {
  if (
    actual.spec.label !== desired.spec.label ||
    !sameDmoCategory(actual.spec.category, desired.spec.category) ||
    (desired.spec.description !== undefined &&
      desired.spec.description !== (actual.spec.description ?? ''))
  )
    return false;
  const fields = new Map(actual.spec.fields.map((field) => [field.name, field]));
  return desired.spec.fields.every((field) => {
    const found = fields.get(field.name);
    return (
      found &&
      Object.entries(field).every(
        ([key, entry]) =>
          (writeOnlyFieldKeys.has(key) && found[key] === undefined) ||
          isDeepStrictEqual(entry, found[key]),
      )
    );
  });
}

/**
 * Skip unchanged definitions, otherwise write once and require independent bounded GET confirmation.
 * Stale PATCH bodies never establish persistence; failed readback never triggers another write.
 * @param {unknown} value Portable requested definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', document: NativeDmoDocument}>} Observed or confirmed definition, not activation proof.
 */
export async function deployNativeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  settle: NativeDmoSettle = defaultSettle,
): Promise<{ operation: 'create' | 'update' | 'unchanged'; document: NativeDmoDocument }> {
  const desired = validateNativeDmoDocument(value);
  const plan = await preflightNativeDmo(desired, client, requestScope);
  if (plan.operation === 'unchanged') return { operation: 'unchanged', document: plan.document };
  const response =
    plan.operation === 'create'
      ? await client.create(plan.body)
      : await client.update(plan.targetApiName!, plan.body);
  const accepted = normalizeNativeDmo(response, desired.identity.dataSpace);
  if (accepted.identity.apiName !== plan.apiName)
    throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
  let last: NativeDmoDocument | undefined;
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    const document = await resolveTarget(plan.apiName, client, desired.identity.dataSpace);
    last = document;
    if (nativeDmoConfirmed(desired, document)) return { operation: plan.operation, document };
  }
  throw explainMismatch(
    new NativeDmoError('DMO_PERSISTENCE_UNCONFIRMED'),
    'post-write requested definition readback',
    plan.apiName,
    desired,
    last,
  );
}

/**
 * Read-only delete preview: resolve the exact target and apply the same custom-only guard as delete.
 * @param {string} apiName Requested full name.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space.
 * @returns {Promise<NativeDmoDocument>} Definition that a delete would remove.
 */
export async function previewDeleteNativeDmo(
  apiName: string,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<NativeDmoDocument> {
  const { raw, document } = await readTarget(apiName, client, requestScope);
  if (!isCustomNativeDmo(raw)) throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  return document;
}

/**
 * Delete only the freshly resolved exact full name, without cascade or local deletion.
 * One read after the DELETE confirms it: 404 is deleted, the same name in a DELETING state is
 * still processing, and anything else (including a failed read) is never reported as deleted.
 * @param {string} apiName Requested full name.
 * @param {Pick<DmoClient, 'get' | 'delete'>} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<{apiName: string, targetApiName: string, dataSpace: string, processing?: true}>} Exact deleted target identity.
 */
export async function deleteNativeDmo(
  apiName: string,
  client: Pick<DmoClient, 'get' | 'delete'>,
  requestScope?: string,
): Promise<{ apiName: string; targetApiName: string; dataSpace: string; processing?: true }> {
  const { raw, document: target } = await readTarget(apiName, client, requestScope);
  // Standard, namespaced and platform-generated DMOs are never deleted.
  if (!isCustomNativeDmo(raw)) throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  const targetApiName = target.identity.apiName;
  await client.delete(targetApiName);
  const deleted = { apiName, targetApiName, dataSpace: target.identity.dataSpace };
  let readback: unknown;
  try {
    readback = await client.get(targetApiName);
  } catch (error) {
    if (error instanceof NativeDmoError && error.code === 'DMO_HTTP_ERROR' && error.status === 404)
      return deleted;
    // Keep the read failure's API detail (status, Retry-After) for the printed diagnostic.
    throw retainConnectDiagnostic(
      new NativeDmoError('DMO_DELETE_NOT_CONFIRMED'),
      getConnectDiagnostic(error),
    );
  }
  let observed: Record<string, unknown> | undefined;
  try {
    // Not normalizeNativeDmo: it strips the runtime status this check needs.
    observed = unwrapNativeDmo(readback);
  } catch {
    observed = undefined;
  }
  // DMO DELETING is assumed by analogy with DLO; no docs or live evidence confirm it yet.
  if (
    observed?.name === targetApiName &&
    typeof observed.status === 'string' &&
    observed.status.startsWith('DELETING')
  )
    return { ...deleted, processing: true };
  throw new NativeDmoError('DMO_DELETE_NOT_CONFIRMED', 200);
}
