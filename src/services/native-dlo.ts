import { isDeepStrictEqual } from 'node:util';
import { explainMismatch } from './operation-diagnostic.js';
import {
  DloError,
  normalizeDlo,
  unwrapDlo,
  validateDloDocument,
} from '../artifacts/dlo-document.js';
import type { DloDocument, DloField } from '../artifacts/dlo-document.js';
import type { DloClient } from '../transport/dlo-rest.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { replaceExplanation } from './operation-diagnostic.js';
import { paceReadback, readbackPace } from './readback-pace.js';

export type DloDeployPlan =
  | {
      operation: 'create' | 'update';
      apiName: string;
      targetId?: string;
      body: Record<string, unknown>;
    }
  | {
      operation: 'unchanged';
      apiName: string;
      targetId: string;
      document: DloDocument;
    };

const systemFields = new Set([
  'cdp_sys_SourceVersion__c',
  // Engagement DLOs: Salesforce adds it with the event field.
  'cdp_sys_PartitionDate__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
]);

/**
 * Identify qualified generated qualifier/system fields, never generic Id-bearing fields.
 * @param {DloField} field Portable definition.
 * @returns {boolean} Whether native create generates this field.
 */
function generated(field: DloField): boolean {
  return systemFields.has(field.name) || field.name.startsWith('KQ_');
}

/**
 * Convert the saved API field name to native input without losing definitions.
 * @param {DloField} field Saved field.
 * @returns {Record<string, unknown>} Native field input.
 */
function fieldInput(field: DloField): Record<string, unknown> {
  return { ...field, name: field.name.slice(0, -3) };
}

/**
 * Resolve exactly the requested API name in the target, retaining only its current target ID.
 * @param {string} apiName Requested full API name.
 * @param {DloClient} client Target client.
 * @param {string} [requestScope] Optional expected data space, never a URL query.
 * @returns {Promise<{document: DloDocument, targetId: string}>} Definition and target identity.
 */
export async function resolveNativeDloTarget(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  requestScope?: string,
): Promise<{ document: DloDocument; targetId: string; runtime: Record<string, unknown> }> {
  const raw = unwrapDlo(await client.get(apiName));
  const document = normalizeDlo(raw, requestScope);
  if (
    document.identity.apiName !== apiName ||
    typeof raw.id !== 'string' ||
    !/^[A-Za-z0-9]{18}$/u.test(raw.id)
  )
    throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  return { document, targetId: raw.id, runtime: structuredClone(raw) };
}

/**
 * Retrieve a portable definition by its full API name, never saving the source ID.
 * @param {string} apiName Exact name ending in __dll.
 * @param {Pick<DloClient, 'get'>} client Authenticated target client.
 * @param {string} [requestScope] Optional expected data space, never a URL query.
 * @returns {Promise<DloDocument>} Portable definition.
 */
export async function retrieveNativeDlo(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  requestScope?: string,
): Promise<DloDocument> {
  const target = await resolveNativeDloTarget(apiName, client, requestScope);
  return target.document;
}

/**
 * Preflight one native deploy: only authoritative absence selects create.
 * Updates permit label and ordinary field additions, refusing any removed/changed field or key.
 * @param {unknown} value Saved document.
 * @param {DloClient} client Authenticated target client.
 * @param {string} [requestScope] Optional expected data space, never a URL query.
 * @returns {Promise<DloDeployPlan>} Target-bound write plan with no source IDs.
 */
export async function preflightNativeDlo(
  value: unknown,
  client: DloClient,
  requestScope?: string,
): Promise<DloDeployPlan> {
  const desired = validateDloDocument(value);
  const apiName = desired.identity.apiName;
  if (requestScope !== undefined && requestScope !== desired.identity.dataSpace)
    throw new DloError('DLO_DATASPACE_MISMATCH');
  let target: Awaited<ReturnType<typeof resolveNativeDloTarget>>;
  try {
    target = await resolveNativeDloTarget(apiName, client, requestScope);
    if (target.document.identity.dataSpace !== desired.identity.dataSpace)
      throw new DloError('DLO_DATASPACE_MISMATCH');
  } catch (error) {
    if (!(error instanceof DloError) || error.code !== 'DLO_HTTP_ERROR' || error.status !== 404)
      throw error;
    const fields = desired.spec.fields.filter((field) => !generated(field));
    if (fields.filter((field) => field.isPrimaryKey).length !== 1)
      throw new DloError('INVALID_DLO_PRIMARY_KEY');
    return {
      operation: 'create',
      apiName,
      body: {
        name: apiName.slice(0, -5),
        label: desired.spec.label,
        category: desired.spec.category,
        ...(desired.spec.eventDateTimeFieldName === undefined
          ? {}
          : { eventDateTimeFieldName: desired.spec.eventDateTimeFieldName.slice(0, -3) }),
        dataspaceInfo: [{ name: desired.identity.dataSpace }],
        dataLakeFieldInputRepresentations: fields.map((field) => fieldInput(field)),
      },
    };
  }
  // Neither can change after create: a PATCH naming them is rejected (HTTP 400, live API 68).
  if (desired.spec.category !== target.document.spec.category)
    throw new DloError('UNSUPPORTED_DLO_CATEGORY_CHANGE');
  if (
    desired.spec.eventDateTimeFieldName !== undefined &&
    desired.spec.eventDateTimeFieldName !== target.document.spec.eventDateTimeFieldName
  )
    throw explainMismatch(
      new DloError('UNSUPPORTED_DLO_EVENT_FIELD_CHANGE'),
      'event field preservation',
      apiName,
      target.document.spec.eventDateTimeFieldName,
      desired.spec.eventDateTimeFieldName,
      'spec.eventDateTimeFieldName',
      'The event field of a data lake object is set on create and cannot be changed.',
    );
  const existing = new Map(target.document.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  const keyQualifiers = new Set(
    target.document.spec.fields
      .filter((field) => field.isPrimaryKey)
      .map((field) => `KQ_${field.name}`),
  );
  for (const [name, field] of existing) {
    // Fields Salesforce generated (system fields and the key qualifier of the primary key) stay
    // as they are when the file does not list them.
    if (
      !incoming.has(name) &&
      !field.isPrimaryKey &&
      field.creationType !== 'Custom' &&
      (systemFields.has(name) || keyQualifiers.has(name))
    )
      continue;
    const listed = incoming.get(name);
    // A listed field is compared on the keys the file states; keys only the org adds are kept.
    const observed = listed
      ? Object.fromEntries(Object.entries(field).filter(([key]) => key in listed))
      : field;
    if (!isDeepStrictEqual(observed, listed))
      throw explainMismatch(
        new DloError('UNSUPPORTED_DLO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        incoming.get(name),
        `fields.${name}`,
        'Salesforce only adds fields to an existing data lake object: a changed field is rejected (HTTP 400), and removing one is refused by the Metadata API ("setup object in use"); only external data lake objects have a field delete route.',
      );
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => generated(field) || field.isPrimaryKey))
    throw new DloError('UNSUPPORTED_DLO_FIELD_ADDITION');
  if (added.length === 0 && desired.spec.label === target.document.spec.label)
    return {
      operation: 'unchanged',
      apiName,
      targetId: target.targetId,
      document: target.document,
    };
  return {
    operation: 'update',
    apiName,
    targetId: target.targetId,
    body: {
      label: desired.spec.label,
      ...(added.length > 0
        ? { dataLakeFieldInputRepresentations: added.map((field) => fieldInput(field)) }
        : {}),
    },
  };
}

/**
 * Resolve and preflight immediately before one write; no retries or cached-plan replay.
 * @param {unknown} value Portable document.
 * @param {DloClient} client Target client.
 * @param {string} [requestScope] Optional expected data space, never a URL query.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', document: DloDocument}>} Accepted or unchanged definition, not terminal activation proof.
 */
export async function deployNativeDlo(
  value: unknown,
  client: DloClient,
  requestScope?: string,
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  document: DloDocument;
  serverProcessing?: true;
}> {
  const desired = validateDloDocument(value);
  const plan = await preflightNativeDlo(desired, client, requestScope);
  if (plan.operation === 'unchanged') return { operation: 'unchanged', document: plan.document };
  const response =
    plan.operation === 'create'
      ? await client.create(plan.body)
      : await client.update(plan.targetId!, plan.body);
  const document = normalizeDlo(response, requestScope);
  if (document.identity.dataSpace !== desired.identity.dataSpace)
    throw new DloError('DLO_DATASPACE_MISMATCH');
  if (document.identity.apiName !== plan.apiName)
    throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  return {
    operation: plan.operation,
    document,
    ...(unwrapDlo(response).status === 'PROCESSING' ? { serverProcessing: true as const } : {}),
  };
}

/**
 * Delete only a freshly resolved exact target ID, without cascade or retry.
 * The command executes by default; its preview path never invokes this operation.
 * One name read after the DELETE settles the result: 404 confirms deletion; the same target
 * in a DELETING state is acknowledged-processing; anything else (still readable, or the read
 * failed) is acknowledged but unconfirmed (DLO_DELETE_NOT_CONFIRMED). Nothing is replayed.
 * @param {string} apiName Confirmed full API name.
 * @param {Pick<DloClient, 'get' | 'delete'>} client Authenticated target client.
 * @param {string} [requestScope] Optional expected data space, never a URL query.
 * @returns {Promise<{apiName: string, targetId: string, dataSpace: string, processing?: true}>} Exact deleted target identity.
 */
export async function deleteNativeDlo(
  apiName: string,
  client: Pick<DloClient, 'get' | 'delete'>,
  requestScope?: string,
): Promise<{ apiName: string; targetId: string; dataSpace: string; processing?: true }> {
  const { targetId, document } = await resolveNativeDloTarget(apiName, client, requestScope);
  await client.delete(targetId);
  const deleted = { apiName, targetId, dataSpace: document.identity.dataSpace };
  let readback: unknown;
  try {
    readback = await client.get(apiName);
  } catch (error) {
    if (error instanceof DloError && error.code === 'DLO_HTTP_ERROR' && error.status === 404)
      return deleted;
    // Keep the read failure's API detail (status, Retry-After) for the printed diagnostic.
    throw retainConnectDiagnostic(
      new DloError('DLO_DELETE_NOT_CONFIRMED'),
      getConnectDiagnostic(error),
    );
  }
  let observed: Record<string, unknown> | undefined;
  try {
    observed = unwrapDlo(readback);
  } catch {
    observed = undefined;
  }
  if (
    observed?.id === targetId &&
    typeof observed.status === 'string' &&
    observed.status.startsWith('DELETING')
  )
    return { ...deleted, processing: true };
  throw new DloError('DLO_DELETE_NOT_CONFIRMED', 200);
}

/** One entry of a DLO's dependency list, as Salesforce reports it. */
export type DloDependent = { componentType: string; name: string };

/**
 * Read the dependency list of a DLO; anything but the documented shape confirms nothing.
 * @param {unknown} response Native dependencies response.
 * @returns {DloDependent[]} Dependents by type and name.
 */
export function dloDependents(response: unknown): DloDependent[] {
  const list = (response as { dependencies?: unknown } | null)?.dependencies;
  if (!Array.isArray(list)) throw new DloError('DLO_DEPENDENCIES_UNCONFIRMED');
  return list.map((entry) => {
    const value = entry as { componentType?: unknown; name?: unknown } | null;
    if (typeof value?.componentType !== 'string' || typeof value.name !== 'string')
      throw new DloError('DLO_DEPENDENCIES_UNCONFIRMED');
    return { componentType: value.componentType, name: value.name };
  });
}

/**
 * Name the dependents a command does not delete.
 * @param {string} apiName Exact DLO name.
 * @param {DloDependent[]} open Uncovered dependents.
 * @returns {DloError} DLO_DEPENDENCY_EXISTS refusal.
 */
function dependencyRefusal(apiName: string, open: DloDependent[]): DloError {
  const error = new DloError('DLO_DEPENDENCY_EXISTS');
  replaceExplanation(
    error,
    `${apiName} cannot be deleted while Salesforce lists dependents: ${open
      .map((dependent) => `${dependent.componentType} ${dependent.name}`)
      .join(
        ', ',
      )}. Delete them first, or select them in the same command (a data model object as dmo:<Name>, or every mapping between this data lake object and it as mapping:<Name>).`,
  );
  return error;
}

const sameDependent = (a: DloDependent, b: DloDependent): boolean =>
  a.componentType === b.componentType && a.name === b.name;

/**
 * Salesforce refuses to delete a DLO that something depends on (HTTP 412 DEPENDENCY_EXISTS), so
 * the plugin reads the dependency list once, before the command's first write: a dependent the
 * same command does not delete refuses with DLO_DEPENDENCY_EXISTS naming each one.
 * @param {string} apiName Exact DLO name.
 * @param {object} client Dependency reader.
 * @param {Function} client.dependencies Reads the dependency list of a DLO by name.
 * @param {Function} covered Whether the same command deletes a dependent.
 * @returns {Promise<DloDependent[]>} The dependents the command deletes.
 */
export async function admitDloDependents(
  apiName: string,
  client: { dependencies: (apiName: string) => Promise<unknown> },
  covered: (dependent: DloDependent) => Promise<boolean>,
): Promise<DloDependent[]> {
  const dependents = dloDependents(await client.dependencies(apiName));
  const open: DloDependent[] = [];
  for (const dependent of dependents) if (!(await covered(dependent))) open.push(dependent);
  if (open.length > 0) throw dependencyRefusal(apiName, open);
  return dependents;
}

/**
 * Wait (bounded) until the dependents the command deleted are no longer listed. A dependent
 * that was not admitted before the first write refuses; one still listed after the last read
 * gives DLO_DEPENDENCY_PENDING. No DELETE is sent here.
 * @param {string} apiName Exact DLO name.
 * @param {object} client Dependency reader.
 * @param {Function} client.dependencies Reads the dependency list of a DLO by name.
 * @param {DloDependent[]} admitted Dependents admitted before the command's first write.
 * @returns {Promise<void>} Resolves when the list is empty.
 */
export async function waitForDloDependents(
  apiName: string,
  client: { dependencies: (apiName: string) => Promise<unknown> },
  admitted: DloDependent[],
): Promise<void> {
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const dependents = dloDependents(await client.dependencies(apiName));
    if (dependents.length === 0) return;
    const open = dependents.filter(
      (dependent) => !admitted.some((known) => sameDependent(known, dependent)),
    );
    if (open.length > 0) throw dependencyRefusal(apiName, open);
  }
  const error = new DloError('DLO_DEPENDENCY_PENDING');
  replaceExplanation(
    error,
    `${apiName} was not deleted: the dependents deleted by this command are still listed by Salesforce. Read the data lake object's dependencies and delete it again once the list is empty.`,
  );
  throw error;
}
