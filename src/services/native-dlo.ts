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
    if (desired.spec.category !== 'Other') throw new DloError('UNSUPPORTED_DLO_CREATE_CATEGORY');
    const fields = desired.spec.fields.filter((field) => !generated(field));
    if (fields.filter((field) => field.isPrimaryKey).length !== 1)
      throw new DloError('INVALID_DLO_PRIMARY_KEY');
    return {
      operation: 'create',
      apiName,
      body: {
        name: apiName.slice(0, -5),
        label: desired.spec.label,
        category: 'Other',
        dataspaceInfo: [{ name: desired.identity.dataSpace }],
        dataLakeFieldInputRepresentations: fields.map((field) => fieldInput(field)),
      },
    };
  }
  if (desired.spec.category !== target.document.spec.category)
    throw new DloError('UNSUPPORTED_DLO_CATEGORY_CHANGE');
  const existing = new Map(target.document.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  for (const [name, field] of existing) {
    // Native additive PATCH retains only this omitted generated qualifier.
    if (
      name === 'KQ_Id__c' &&
      !field.isPrimaryKey &&
      field.creationType !== 'Custom' &&
      !incoming.has(name)
    )
      continue;
    if (!isDeepStrictEqual(field, incoming.get(name)))
      throw explainMismatch(
        new DloError('UNSUPPORTED_DLO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        incoming.get(name),
        `fields.${name}`,
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
