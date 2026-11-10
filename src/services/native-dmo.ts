import { isDeepStrictEqual } from 'node:util';
import { explainMismatch } from './operation-diagnostic.js';
import {
  NativeDmoError,
  nativeDmoName,
  normalizeNativeDmo,
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
      omittedTargetFields?: NativeDmoField[];
      body: Record<string, unknown>;
    }
  | {
      operation: 'unchanged';
      apiName: string;
      document: NativeDmoDocument;
    };

const systemFields = new Set(['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c']);

/**
 * Identify generated fields without borrowing DLO SourceVersion assumptions.
 * @param {NativeDmoField} field Portable field.
 * @returns {boolean} Whether create must omit the field.
 */
function generated(field: NativeDmoField): boolean {
  return (
    systemFields.has(field.name) || field.name.startsWith('KQ_') || field.creationType === 'System'
  );
}

/**
 * Project only the qualified authored Text input, rejecting unqualified custom behavior.
 * @param {NativeDmoField} field Saved field.
 * @returns {Record<string, unknown>} Native input with bare field name.
 */
function fieldInput(field: NativeDmoField): Record<string, unknown> {
  const keys = new Set([
    'name',
    'label',
    'dataType',
    'isPrimaryKey',
    'isDynamicLookup',
    'creationType',
    'isDistinct',
    'usageTag',
    'keyQualifierName',
  ]);
  if (
    field.dataType !== 'Text' ||
    field.isDynamicLookup === true ||
    (field.isDynamicLookup !== undefined && field.isDynamicLookup !== false) ||
    (field.isDistinct !== undefined && field.isDistinct !== false) ||
    (field.usageTag !== undefined && field.usageTag !== 'None') ||
    (field.creationType !== undefined && field.creationType !== 'Custom') ||
    (field.keyQualifierName !== undefined &&
      (!field.isPrimaryKey || field.keyQualifierName !== `KQ_${field.name.slice(0, -3)}`)) ||
    Object.keys(field).some((key) => !keys.has(key))
  )
    throw new NativeDmoError('UNSUPPORTED_DMO_FIELD_INPUT');
  return {
    name: field.name.slice(0, -3),
    label: field.label,
    dataType: 'Text',
    isPrimaryKey: field.isPrimaryKey,
    isDynamicLookup: false,
  };
}

/**
 * Resolve and verify the exact full name and observed data space, never inspecting its ID.
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
  if (!nativeDmoName.test(apiName)) throw new NativeDmoError('INVALID_DMO_NAME');
  const document = normalizeNativeDmo(await client.get(apiName), requestScope);
  if (document.identity.apiName !== apiName)
    throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
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
 * Preflight a bounded API65 create or label/additive Text update without mutation.
 * @param {unknown} value Portable document.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional expected data space and explicit body scope.
 * @returns {Promise<NativeDmoDeployPlan>} Fresh name-bound write plan.
 */
export async function preflightNativeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
): Promise<NativeDmoDeployPlan> {
  const desired = validateNativeDmoDocument(value);
  const apiName = desired.identity.apiName;
  if (requestScope !== undefined && requestScope !== desired.identity.dataSpace)
    throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
  let target: NativeDmoDocument;
  try {
    target = await resolveTarget(apiName, client, requestScope);
    if (target.identity.dataSpace !== desired.identity.dataSpace)
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
  } catch (error) {
    if (
      !(error instanceof NativeDmoError) ||
      error.code !== 'DMO_HTTP_ERROR' ||
      error.status !== 404
    )
      throw error;
    if (requestScope === undefined && desired.identity.dataSpace !== 'default')
      throw new NativeDmoError('DMO_DATASPACE_MISMATCH');
    const fields = desired.spec.fields.filter((field) => !generated(field));
    if (fields.filter((field) => field.isPrimaryKey).length !== 1)
      throw new NativeDmoError('INVALID_DMO_PRIMARY_KEY');
    return {
      operation: 'create',
      apiName,
      body: {
        name: apiName.slice(0, -5),
        label: desired.spec.label,
        category: 'Other',
        ...(requestScope === undefined ? {} : { dataSpaceName: requestScope }),
        fields: fields.map((field) => fieldInput(field)),
      },
    };
  }
  const existing = new Map(target.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  const omittedTargetFields: NativeDmoField[] = [];
  for (const [name, field] of existing) {
    if (
      name === 'KQ_Id__c' &&
      !field.isPrimaryKey &&
      field.creationType === 'System' &&
      !incoming.has(name)
    ) {
      omittedTargetFields.push(field);
      continue;
    }
    if (!isDeepStrictEqual(field, incoming.get(name)))
      throw explainMismatch(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        incoming.get(name),
        `fields.${name}`,
      );
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => generated(field) || field.isPrimaryKey))
    throw new NativeDmoError('UNSUPPORTED_DMO_FIELD_ADDITION');
  const fields = added.map((field) => fieldInput(field));
  if (added.length === 0 && desired.spec.label === target.spec.label)
    return { operation: 'unchanged', apiName, document: target };
  return {
    operation: 'update',
    apiName,
    targetApiName: target.identity.apiName,
    ...(omittedTargetFields.length > 0 ? { omittedTargetFields } : {}),
    body: {
      label: desired.spec.label,
      ...(requestScope === undefined ? {} : { dataSpaceName: requestScope }),
      ...(fields.length > 0 ? { fields } : {}),
    },
  };
}

/**
 * Confirm desired definitions while allowing the server to add definition defaults.
 * @param {NativeDmoDocument} desired Requested portable state.
 * @param {NativeDmoDocument} actual Independent GET state.
 * @returns {boolean} Whether every requested field property and key survived.
 */
function confirmed(desired: NativeDmoDocument, actual: NativeDmoDocument): boolean {
  if (actual.spec.label !== desired.spec.label || actual.spec.category !== desired.spec.category)
    return false;
  const fields = new Map(actual.spec.fields.map((field) => [field.name, field]));
  return desired.spec.fields.every((field) => {
    const found = fields.get(field.name);
    return (
      found &&
      Object.entries(field).every(
        ([key, value]) =>
          (key === 'isDynamicLookup' && value === false && found[key] === undefined) ||
          isDeepStrictEqual(value, found[key]),
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
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', document: NativeDmoDocument}>} Observed or confirmed definition, not activation proof.
 */
export async function deployNativeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
): Promise<{ operation: 'create' | 'update' | 'unchanged'; document: NativeDmoDocument }> {
  const desired = validateNativeDmoDocument(value);
  const plan = await preflightNativeDmo(desired, client, requestScope);
  if (plan.operation === 'unchanged') return { operation: 'unchanged', document: plan.document };
  // Bind readback expectations to the same target snapshot that authorized PATCH.
  desired.spec.fields.push(...(plan.omittedTargetFields ?? []));
  const response =
    plan.operation === 'create'
      ? await client.create(plan.body)
      : await client.update(plan.targetApiName!, plan.body);
  const accepted = normalizeNativeDmo(response, desired.identity.dataSpace);
  if (accepted.identity.apiName !== plan.apiName)
    throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
  let last: NativeDmoDocument | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const document = await resolveTarget(plan.apiName, client, desired.identity.dataSpace);
    last = document;
    if (confirmed(desired, document)) return { operation: plan.operation, document };
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
  const target = await resolveTarget(apiName, client, requestScope);
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
