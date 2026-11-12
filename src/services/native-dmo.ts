import { isDeepStrictEqual } from 'node:util';
import { explainMismatch } from './operation-diagnostic.js';
import {
  isGeneratedDmoField,
  NativeDmoError,
  nativeDmoName,
  nativeDmoWriteScope,
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
      operation: 'create';
      apiName: string;
      body: Record<string, unknown>;
    }
  | {
      operation: 'update';
      apiName: string;
      targetApiName: string;
      /** Absent when field removals are the only change, so no PATCH is sent. */
      body?: Record<string, unknown>;
      /** Custom target fields missing from the file; set only with allowFieldRemoval. */
      removeFields?: string[];
      /** Set for a standard DMO: readback confirms custom fields, label and description only. */
      standard?: true;
    }
  | {
      operation: 'unchanged';
      apiName: string;
      document: NativeDmoDocument;
    };

export type NativeDmoDeployOptions = {
  /** Remove custom target fields missing from the file through the Metadata API. */
  allowFieldRemoval?: boolean;
  /**
   * Mapped fields whose pairs the selected mapping files of the same deployment drop. They are
   * removed instead of refused; Salesforce drops their pairs together with the fields.
   */
  coveredMappedFields?: string[];
  /** Source DLOs of the selected mapping files that target this DMO. */
  coveredMappingSources?: string[];
  /**
   * Wraps the single field removal in reads before and after it, and returns the mapping pairs
   * Salesforce dropped with the fields. Without it the removal is sent unwrapped.
   */
  /**
   * Read-only check of a planned field removal, run before the PATCH of the same deployment so a
   * removal that would be refused stops the item before any write.
   */
  precheckRemoval?: (
    targetApiName: string,
    fields: string[],
    coverage: { fields: string[]; sources: string[] },
  ) => Promise<void>;
  removeChecked?: (
    targetApiName: string,
    fields: string[],
    remove: () => Promise<void>,
    coverage: { fields: string[]; sources: string[] },
  ) => Promise<DroppedPair[]>;
};

/** A mapping pair Salesforce dropped together with its removed target field. */
export type DroppedPair = {
  mapping: string;
  sourceFieldDeveloperName: string;
  targetFieldDeveloperName: string;
};

/** Bounded post-write readback; the single write is never repeated. */
export type NativeDmoSettle = {
  attempts: number;
  delayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
};

export const defaultNativeDmoSettle: NativeDmoSettle = {
  attempts: 6,
  delayMs: 5000,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

// Returned by reads but rejected as unknown input by the API (live API 68 probes).
const readOnlyFieldKeys = new Set(['creationType', 'isDistinct', 'usageTag', 'keyQualifierName']);
// Accepted as input but not returned by reads, so they cannot be compared or confirmed.
const writeOnlyFieldKeys = new Set(['description', 'isDynamicLookup']);
// The API answers 200 to these edits of an existing field and silently ignores them.
const immutableFieldKeys = new Set(['dataType', 'isPrimaryKey']);
// Mapping state reported on a field; it belongs to the mapping, not to the DMO definition,
// so it is never sent, compared or confirmed here.
const observedFieldKeys = new Set(['isMapped']);
const handledSpecKeys = new Set(['label', 'category', 'description', 'fields']);
const mappedRemovals = new WeakMap<Error, { apiName: string; fields: string[] }>();

/**
 * Name the DMO and every mapped field a DMO_FIELD_REMOVAL_MAPPED refusal was raised for.
 * @param {unknown} error Caught error.
 * @returns {{apiName: string, fields: string[]} | undefined} Refused removal, or nothing for any other error.
 */
export function mappedFieldRemoval(
  error: unknown,
): { apiName: string; fields: string[] } | undefined {
  return error instanceof Error ? mappedRemovals.get(error) : undefined;
}

export { isGeneratedDmoField } from '../artifacts/native-dmo-document.js';

/**
 * Project an authored field to native input: bare name, read-only keys dropped, the rest as written.
 * Data type and optional keys are not restricted here; the API decides.
 * @param {NativeDmoField} field Saved field.
 * @returns {Record<string, unknown>} Native input with bare field name.
 */
function fieldInput(field: NativeDmoField): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.entries(field).filter(
        ([key]) => !readOnlyFieldKeys.has(key) && !observedFieldKeys.has(key),
      ),
    ),
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
    if (observedFieldKeys.has(key) || isDeepStrictEqual(before, after)) continue;
    if (writeOnlyFieldKeys.has(key) && before === undefined) continue;
    if (readOnlyFieldKeys.has(key) && after === undefined) continue;
    if (readOnlyFieldKeys.has(key) || immutableFieldKeys.has(key) || isGeneratedDmoField(target))
      return { blocked: key };
    change = 'edit';
  }
  return change;
}

/**
 * Whether a field of a standard DMO is one this plugin may add: marked custom or unmarked, with
 * a bare name that carries no namespace. Salesforce rejects the other names.
 * @param {NativeDmoField} field Authored field.
 * @returns {boolean} Whether the field is a plain custom field.
 */
function isPlainCustomField(field: NativeDmoField): boolean {
  return (
    (field.creationType === undefined || field.creationType === 'Custom') &&
    !field.name.slice(0, -3).includes('__')
  );
}

/**
 * Find the first comparable property in which an authored standard or system field of a standard
 * DMO differs from the target. Mapping state and the key qualifier appear when the DMO is first
 * mapped, so they are not compared; keys the API does not return cannot be compared.
 * @param {NativeDmoField} target Field as read from the target.
 * @param {NativeDmoField} incoming Field as authored.
 * @returns {string | undefined} Differing property, or nothing when the field is comparable and equal.
 */
function protectedFieldDifference(
  target: NativeDmoField,
  incoming: NativeDmoField,
): string | undefined {
  for (const key of new Set([...Object.keys(target), ...Object.keys(incoming)])) {
    const before = target[key];
    const after = incoming[key];
    if (observedFieldKeys.has(key) || key === 'keyQualifierName') continue;
    if (isDeepStrictEqual(before, after)) continue;
    if (writeOnlyFieldKeys.has(key) && before === undefined) continue;
    if (readOnlyFieldKeys.has(key) && after === undefined) continue;
    return key;
  }
  return undefined;
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
 * On a standard DMO only custom fields, the object label and the object description are written:
 * standard and system fields are compared and never sent, and the category is ignored because
 * Salesforce changes it when the DMO is first mapped.
 * @param {unknown} value Portable document.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @param {NativeDmoDeployOptions} [options] Opt-in field removal.
 * @returns {Promise<NativeDmoDeployPlan>} Fresh name-bound write plan.
 */
export async function preflightNativeDmo(
  value: unknown,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
  options: NativeDmoDeployOptions = {},
): Promise<NativeDmoDeployPlan> {
  const desired = validateNativeDmoDocument(value);
  const apiName = desired.identity.apiName;
  if (requestScope !== undefined && requestScope !== desired.identity.dataSpace)
    throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
  const extras = Object.fromEntries(
    Object.entries(desired.spec).filter(([key]) => !handledSpecKeys.has(key)),
  );
  let target: NativeDmoDocument;
  let raw: Record<string, unknown>;
  let standard = false;
  try {
    const read = await readTarget(apiName, client, requestScope);
    target = read.document;
    raw = read.raw;
    if (target.identity.dataSpace !== desired.identity.dataSpace)
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
    // Platform-generated DMOs, reads without a creationType and custom DMOs under a namespaced
    // name are never written; a standard DMO is written within the standard scope only.
    const scope = nativeDmoWriteScope(read.raw);
    if (scope === 'refused') throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
    standard = scope === 'standard';
  } catch (error) {
    if (
      !(error instanceof NativeDmoError) ||
      error.code !== 'DMO_HTTP_ERROR' ||
      error.status !== 404
    )
      throw error;
    if (requestScope === undefined && desired.identity.dataSpace !== 'default')
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
    // Standard and namespaced DMOs are never created.
    if (apiName.slice(0, -5).includes('__')) throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
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
          .filter((field) => !isGeneratedDmoField(field))
          .map((field) => fieldInput(field)),
      },
    };
  }
  const existing = new Map(target.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  const edited: NativeDmoField[] = [];
  const removed: string[] = [];
  const mapped: string[] = [];
  // A mapped field is removed only when the selected mapping files drop all of its pairs.
  const covered = new Set(options.coveredMappedFields);
  for (const [name, field] of existing) {
    const authored = incoming.get(name);
    if (standard && field.creationType !== 'Custom') {
      // Standard and system fields of a standard DMO are never sent and never removed. They may
      // be left out of the file; an authored one has to match the target.
      const property = authored ? protectedFieldDifference(field, authored) : undefined;
      if (authored && property !== undefined)
        throw explainMismatch(
          new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
          'standard field preservation',
          apiName,
          field[property],
          authored[property],
          `fields.${name}.${property}`,
          'Standard and system fields of a standard DMO cannot be changed; only custom fields, the object label and the object description are written.',
        );
      continue;
    }
    // Generated fields may be left out of an authored definition and are never removed.
    if (!authored && isGeneratedDmoField(field)) continue;
    if (!authored) {
      // The native DMO API has no route to remove a field; the Metadata API does, on request.
      if (options.allowFieldRemoval === true && !field.isPrimaryKey) {
        // Salesforce removes a mapped field without objection and drops its mapping pairs with
        // it (live API 68), so a mapped field is removed only when the selected mapping files
        // drop those pairs too. Every other one is collected so the refusal names them all.
        if (field.isMapped === true && !covered.has(name)) mapped.push(name);
        else removed.push(name);
        continue;
      }
      throw explainMismatch(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        authored,
        `fields.${name}`,
        field.isPrimaryKey
          ? 'The primary-key field is never removed; keep it in the file.'
          : 'A custom field missing from the file is removed only with --allow-field-removal.',
      );
    }
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
  if (mapped.length > 0) {
    const error = explainMismatch(
      new NativeDmoError('DMO_FIELD_REMOVAL_MAPPED'),
      'field removal',
      apiName,
      false,
      true,
      `fields.${mapped[0]}.isMapped`,
      mapped.length === 1
        ? 'This field is mapped. Remove its pair from the mapping first, then remove the field.'
        : `These fields are mapped: ${mapped.join(', ')}. Remove their pairs from the mapping first, then remove the fields.`,
    );
    mappedRemovals.set(error, { apiName, fields: mapped });
    throw error;
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => isGeneratedDmoField(field) || field.isPrimaryKey))
    throw new NativeDmoError('UNSUPPORTED_DMO_FIELD_ADDITION');
  // Salesforce rejects a namespaced field name on a standard DMO, so only plain custom fields are added.
  const foreign = standard ? added.find((field) => !isPlainCustomField(field)) : undefined;
  if (foreign)
    throw explainMismatch(
      new NativeDmoError('UNSUPPORTED_DMO_FIELD_ADDITION'),
      'standard DMO field addition',
      apiName,
      undefined,
      foreign.name,
      `fields.${foreign.name}`,
      'Only custom fields with a name without a namespace can be added to a standard DMO.',
    );
  const fields = [...edited, ...added].map((field) => fieldInput(field));
  // An absent description is not managed; an explicit empty string clears it.
  const description =
    desired.spec.description !== undefined &&
    desired.spec.description !== (target.spec.description ?? '')
      ? { description: desired.spec.description }
      : {};
  // The API refuses category updates; send a changed one so its answer is reported. Salesforce
  // itself changes the category of a standard DMO when it is first mapped, so there it is ignored.
  const category =
    standard || sameDmoCategory(desired.spec.category, target.spec.category)
      ? {}
      : { category: desired.spec.category };
  const relabelled = desired.spec.label !== target.spec.label;
  // Extra keys are compared with the raw read. One the API does not return cannot be compared,
  // so like write-only field keys it is sent on create only and never forces a PATCH.
  const changedExtras = Object.fromEntries(
    Object.entries(extras).filter(
      ([key, entry]) => raw[key] !== undefined && !isDeepStrictEqual(entry, raw[key]),
    ),
  );
  const patch =
    fields.length > 0 ||
    relabelled ||
    Object.keys({ ...description, ...category, ...changedExtras }).length > 0;
  if (!patch && removed.length === 0) return { operation: 'unchanged', apiName, document: target };
  return {
    operation: 'update',
    apiName,
    targetApiName: target.identity.apiName,
    ...(patch
      ? {
          body: {
            ...changedExtras,
            // A standard DMO receives its label only when it changes; a custom one always.
            ...(standard && !relabelled ? {} : { label: desired.spec.label }),
            ...description,
            ...category,
            ...(requestScope === undefined ? {} : { dataSpaceName: requestScope }),
            ...(fields.length > 0 ? { fields } : {}),
          },
        }
      : {}),
    ...(removed.length > 0 ? { removeFields: removed } : {}),
    ...(standard ? { standard: true as const } : {}),
  };
}

/**
 * Confirm a requested definition against an independent read, allowing server-added defaults.
 * Keys the API accepts but does not return cannot be confirmed and are not compared.
 * @param {NativeDmoDocument} desired Requested portable state.
 * @param {NativeDmoDocument} actual Independent GET state.
 * @param {string[]} [removed] Fields whose removal was requested and must be absent.
 * @param {boolean} [standard] Standard DMO: the category and its standard and system fields are not compared.
 * @returns {boolean} Whether every requested, readable property survived and every removal took effect.
 */
export function nativeDmoConfirmed(
  desired: NativeDmoDocument,
  actual: NativeDmoDocument,
  removed: string[] = [],
  standard = false,
): boolean {
  if (
    actual.spec.fields.some((field) => removed.includes(field.name)) ||
    actual.spec.label !== desired.spec.label ||
    (!standard && !sameDmoCategory(actual.spec.category, desired.spec.category)) ||
    (desired.spec.description !== undefined &&
      desired.spec.description !== (actual.spec.description ?? ''))
  )
    return false;
  const fields = new Map(actual.spec.fields.map((field) => [field.name, field]));
  return desired.spec.fields.every((field) => {
    const found = fields.get(field.name);
    // Never written on a standard DMO, and checked against the target before the write.
    if (standard && found && found.creationType !== 'Custom') return true;
    return (
      found &&
      Object.entries(field).every(
        ([key, entry]) =>
          observedFieldKeys.has(key) ||
          (writeOnlyFieldKeys.has(key) && found[key] === undefined) ||
          isDeepStrictEqual(entry, found[key]),
      )
    );
  });
}

/**
 * Wait until the PATCH of the same deployment is readable, so the reads that bracket the field
 * removal start from the edited definition. The fields still present are not compared.
 * @param {NativeDmoDocument} desired Requested definition without the removed fields.
 * @param {string} apiName Exact DMO full name.
 * @param {DmoClient} client Target client.
 * @param {boolean} standard Standard DMO: only custom fields, label and description are compared.
 * @param {NativeDmoSettle} settle Readback attempts and spacing.
 */
async function confirmEditBeforeRemoval(
  desired: NativeDmoDocument,
  apiName: string,
  client: DmoClient,
  standard: boolean,
  settle: NativeDmoSettle,
): Promise<void> {
  let last: NativeDmoDocument | undefined;
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    last = await resolveTarget(apiName, client, desired.identity.dataSpace);
    if (nativeDmoConfirmed(desired, last, [], standard)) return;
  }
  throw explainMismatch(
    new NativeDmoError('DMO_PERSISTENCE_UNCONFIRMED'),
    'edit readback before the field removal',
    apiName,
    desired,
    last,
  );
}

/**
 * Skip unchanged definitions, otherwise write once and require independent bounded GET confirmation.
 * An update sends at most one PATCH, then at most one Metadata API field removal, each exactly once.
 * Stale PATCH bodies never establish persistence; failed readback never triggers another write.
 * @param {unknown} value Portable requested definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @param {NativeDmoDeployOptions} [options] Opt-in field removal.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', document: NativeDmoDocument, removedFields?: string[], droppedPairs?: DroppedPair[]}>} Observed or confirmed definition, not activation proof.
 */
export async function deployNativeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  settle: NativeDmoSettle = defaultNativeDmoSettle,
  options: NativeDmoDeployOptions = {},
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  document: NativeDmoDocument;
  removedFields?: string[];
  /** Mapping pairs Salesforce dropped together with the removed fields. */
  droppedPairs?: DroppedPair[];
}> {
  const desired = validateNativeDmoDocument(value);
  const plan = await preflightNativeDmo(desired, client, requestScope, options);
  if (plan.operation === 'unchanged') return { operation: 'unchanged', document: plan.document };
  const planned = plan.operation === 'update' ? (plan.removeFields ?? []) : [];
  const standard = plan.operation === 'update' && plan.standard === true;
  // Refuse before the PATCH when this client has no Metadata route for the planned removal.
  if (planned.length > 0 && !client.removeFields)
    throw new NativeDmoError('DMO_FIELD_REMOVAL_UNAVAILABLE');
  const removed = planned;
  if (plan.operation === 'update' && !plan.body && removed.length === 0)
    return {
      operation: 'unchanged',
      document: await resolveTarget(plan.apiName, client, desired.identity.dataSpace),
    };
  if (plan.operation === 'update' && removed.length > 0 && options.precheckRemoval)
    await options.precheckRemoval(plan.targetApiName, removed, {
      fields: options.coveredMappedFields ?? [],
      sources: options.coveredMappingSources ?? [],
    });
  const response =
    plan.operation === 'create'
      ? await client.create(plan.body)
      : plan.body
        ? await client.update(plan.targetApiName, plan.body)
        : undefined;
  if (plan.operation === 'create' || plan.body) {
    const accepted = normalizeNativeDmo(response, desired.identity.dataSpace);
    if (accepted.identity.apiName !== plan.apiName)
      throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
  }
  let droppedPairs: DroppedPair[] = [];
  if (plan.operation === 'update' && removed.length > 0) {
    if (plan.body) await confirmEditBeforeRemoval(desired, plan.apiName, client, standard, settle);
    const targetApiName = plan.targetApiName;
    const remove = async (): Promise<void> => client.removeFields!(targetApiName, removed);
    if (options.removeChecked)
      droppedPairs = await options.removeChecked(targetApiName, removed, remove, {
        fields: options.coveredMappedFields ?? [],
        sources: options.coveredMappingSources ?? [],
      });
    else await remove();
  }
  let last: NativeDmoDocument | undefined;
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    const document = await resolveTarget(plan.apiName, client, desired.identity.dataSpace);
    last = document;
    if (nativeDmoConfirmed(desired, document, removed, standard))
      return {
        operation: plan.operation,
        document,
        ...(removed.length > 0 ? { removedFields: removed } : {}),
        ...(droppedPairs.length > 0 ? { droppedPairs } : {}),
      };
  }
  const lingering = last?.spec.fields.find((field) => removed.includes(field.name));
  if (lingering)
    throw explainMismatch(
      new NativeDmoError('DMO_PERSISTENCE_UNCONFIRMED'),
      'post-removal field absence readback',
      plan.apiName,
      undefined,
      lingering,
      `fields.${lingering.name}`,
    );
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
  // Only a custom DMO is deleted; a standard one is open to field and label writes only.
  if (nativeDmoWriteScope(raw) !== 'custom') throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  return document;
}

/**
 * Read-only admission of a field-level delete: resolve the exact target and require a custom or
 * standard DMO. Which of its fields may be removed is decided by the caller from the scope.
 * @param {string} apiName Requested full name.
 * @param {Pick<DmoClient, 'get'>} client Target client.
 * @param {string} [requestScope] Optional expected data space.
 * @returns {Promise<{document: NativeDmoDocument, scope: 'custom' | 'standard'}>} Definition and its write scope.
 */
export async function previewFieldDeleteNativeDmo(
  apiName: string,
  client: Pick<DmoClient, 'get'>,
  requestScope?: string,
): Promise<{ document: NativeDmoDocument; scope: 'custom' | 'standard' }> {
  const { raw, document } = await readTarget(apiName, client, requestScope);
  const scope = nativeDmoWriteScope(raw);
  if (scope === 'refused') throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  return { document, scope };
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
  if (nativeDmoWriteScope(raw) !== 'custom') throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
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
