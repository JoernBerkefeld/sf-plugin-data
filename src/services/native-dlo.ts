import { isDeepStrictEqual } from 'node:util';
import {
  DloError,
  normalizeDlo,
  unwrapDlo,
  validateDloDocument,
} from '../artifacts/dlo-document.js';
import type { DloDocument, DloField } from '../artifacts/dlo-document.js';
import type { DloClient } from '../transport/dlo-rest.js';

export type DloDeployPlan = {
  operation: 'create' | 'update';
  apiName: string;
  targetId?: string;
  body: Record<string, unknown>;
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
 * @returns {Promise<{document: DloDocument, targetId: string}>} Definition and target identity.
 */
async function resolveTarget(
  apiName: string,
  client: DloClient,
): Promise<{ document: DloDocument; targetId: string }> {
  const raw = unwrapDlo(await client.get(apiName));
  const document = normalizeDlo(raw);
  if (
    document.identity.apiName !== apiName ||
    typeof raw.id !== 'string' ||
    !/^[A-Za-z0-9]{18}$/u.test(raw.id)
  )
    throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  return { document, targetId: raw.id };
}

/**
 * Retrieve a portable definition by its full API name, never saving the source ID.
 * @param {string} apiName Exact name ending in __dll.
 * @param {DloClient} client Authenticated target client.
 * @returns {Promise<DloDocument>} Portable definition.
 */
export async function retrieveNativeDlo(apiName: string, client: DloClient): Promise<DloDocument> {
  const target = await resolveTarget(apiName, client);
  return target.document;
}

/**
 * Preflight one API68/default deploy: only authoritative absence selects create.
 * Updates permit label and ordinary field additions, refusing any removed/changed field or key.
 * @param {unknown} value Saved document.
 * @param {DloClient} client Authenticated target client.
 * @returns {Promise<DloDeployPlan>} Target-bound write plan with no source IDs.
 */
export async function preflightNativeDlo(
  value: unknown,
  client: DloClient,
): Promise<DloDeployPlan> {
  const desired = validateDloDocument(value);
  const apiName = desired.identity.apiName;
  let target: Awaited<ReturnType<typeof resolveTarget>>;
  try {
    target = await resolveTarget(apiName, client);
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
        dataspaceInfo: [{ name: 'default' }],
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
      throw new DloError('UNSUPPORTED_DLO_FIELD_CHANGE');
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => generated(field) || field.isPrimaryKey))
    throw new DloError('UNSUPPORTED_DLO_FIELD_ADDITION');
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
 * @returns {Promise<{operation: 'create' | 'update', document: DloDocument}>} Accepted definition, not terminal activation proof.
 */
export async function deployNativeDlo(
  value: unknown,
  client: DloClient,
): Promise<{ operation: 'create' | 'update'; document: DloDocument }> {
  const plan = await preflightNativeDlo(value, client);
  const response =
    plan.operation === 'create'
      ? await client.create(plan.body)
      : await client.update(plan.targetId!, plan.body);
  const document = normalizeDlo(response);
  if (document.identity.apiName !== plan.apiName)
    throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  return { operation: plan.operation, document };
}

/**
 * Delete only a freshly resolved exact target ID, without cascade or retry.
 * The command executes by default; its preview path never invokes this operation.
 * @param {string} apiName Confirmed full API name.
 * @param {DloClient} client Authenticated target client.
 * @returns {Promise<{apiName: string, targetId: string}>} Exact deleted target identity.
 */
export async function deleteNativeDlo(
  apiName: string,
  client: DloClient,
): Promise<{ apiName: string; targetId: string }> {
  const { targetId } = await resolveTarget(apiName, client);
  await client.delete(targetId);
  return { apiName, targetId };
}
