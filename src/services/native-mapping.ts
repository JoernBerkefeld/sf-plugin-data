import { isDeepStrictEqual } from 'node:util';
import {
  NativeMappingError,
  nativeMappingName,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
  validateNativeMappingDocument,
} from '../artifacts/native-mapping-document.js';
import { normalizeDlo } from '../artifacts/dlo-document.js';
import { normalizeNativeDmo } from '../artifacts/native-dmo-document.js';
import type {
  NativeMappingDocument,
  NativeMappingField,
} from '../artifacts/native-mapping-document.js';
import type { MappingClient, MappingWriteBody } from '../transport/mapping-rest.js';
import type { DloClient } from '../transport/dlo-rest.js';
import type { DmoClient } from '../transport/dmo-rest.js';

export type MappingDependencies = {
  source: Pick<DloClient, 'get'>;
  target: Pick<DmoClient, 'get'>;
};
export type NativeMappingDeployPlan = {
  operation: 'create' | 'update' | 'noop';
  desired: NativeMappingDocument;
  target?: NativeMappingDocument;
  writes: { body: MappingWriteBody }[];
};

/**
 * Compare logical pairs without treating source selectors as portable target identity.
 * @param {NativeMappingField} field Mapping pair.
 * @returns {string} Exact logical pair key.
 */
function pairKey(field: NativeMappingField): string {
  return `${field.sourceFieldDeveloperName}:${field.targetFieldDeveloperName}`;
}

/**
 * Verify the logical binding independently of a server-generated mapping name.
 * @param {NativeMappingDocument} expected Requested binding.
 * @param {NativeMappingDocument} actual Target response.
 */
function checkBinding(expected: NativeMappingDocument, actual: NativeMappingDocument): void {
  if (
    expected.spec.sourceEntityDeveloperName !== actual.spec.sourceEntityDeveloperName ||
    expected.spec.targetEntityDeveloperName !== actual.spec.targetEntityDeveloperName
  )
    throw new NativeMappingError('MAPPING_TARGET_BINDING_MISMATCH');
}

/**
 * Resolve a unique exact pair through filtered inventory, never source-name 404 fallback.
 * @param {NativeMappingDocument} desired Logical binding.
 * @param {MappingClient} client Target mapping transport.
 * @returns {Promise<NativeMappingDocument | undefined>} Verified detail or confirmed absence.
 */
async function resolveTarget(
  desired: NativeMappingDocument,
  client: MappingClient,
): Promise<NativeMappingDocument | undefined> {
  let response: unknown;
  try {
    response = await client.list(
      desired.spec.targetEntityDeveloperName,
      desired.spec.sourceEntityDeveloperName,
    );
  } catch (error) {
    if (
      error instanceof NativeMappingError &&
      error.code === 'MAPPING_HTTP_ERROR' &&
      error.status === 404
    )
      return;
    throw error;
  }
  // The retained contract has exactly this wrapper and no pagination mechanism.
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const entries = unwrapNativeMappingCollection(response).map((entry) =>
    normalizeNativeMapping(entry),
  );
  for (const entry of entries) checkBinding(desired, entry);
  if (entries.length > 1) throw new NativeMappingError('AMBIGUOUS_MAPPING_TARGET');
  if (entries.length === 0) return;
  const raw = await client.get(entries[0].identity.apiName);
  const document = normalizeNativeMapping(raw);
  if ((raw as Record<string, unknown>).status !== 'ACTIVE')
    throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
  checkBinding(desired, document);
  if (document.identity.apiName !== entries[0].identity.apiName)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  return document;
}

/**
 * Validate source/target existence and every requested field against fresh definitions.
 * The four exact generated pairs are qualified by the retained three-to-seven create probe.
 * @param {NativeMappingDocument} desired Requested definition.
 * @param {MappingDependencies} dependencies Fresh source and target readers.
 * @returns {Promise<object>} Fresh definitions and evidence-backed generated pairs.
 */
async function validateDependencies(
  desired: NativeMappingDocument,
  dependencies: MappingDependencies,
) {
  const source = normalizeDlo(
    await dependencies.source.get(desired.spec.sourceEntityDeveloperName),
  );
  const target = normalizeNativeDmo(
    await dependencies.target.get(desired.spec.targetEntityDeveloperName),
  );
  if (
    source.identity.apiName !== desired.spec.sourceEntityDeveloperName ||
    target.identity.apiName !== desired.spec.targetEntityDeveloperName
  )
    throw new NativeMappingError('MAPPING_DEPENDENCY_IDENTITY_MISMATCH');
  const sources = new Map(source.spec.fields.map((field) => [field.name, field]));
  const targets = new Map(target.spec.fields.map((field) => [field.name, field]));
  const generated = new Set<string>();
  const system = new Set(['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c']);
  for (const pair of desired.spec.fieldMappings) {
    const from = sources.get(pair.sourceFieldDeveloperName);
    const to = targets.get(pair.targetFieldDeveloperName);
    if (!from || !to) throw new NativeMappingError('MAPPING_FIELD_NOT_FOUND');
    if (from.dataType !== to.dataType) throw new NativeMappingError('MAPPING_FIELD_TYPE_MISMATCH');
    if (from.name !== to.name) continue;
    if (
      system.has(to.name) &&
      to.creationType === 'System' &&
      !from.isPrimaryKey &&
      !to.isPrimaryKey
    )
      generated.add(pairKey(pair));
    if (to.name === 'KQ_Id__c' && to.creationType === 'System' && to.usageTag === 'KeyQualifier') {
      const sourceKey = sources.get('Id__c');
      const targetKey = targets.get('Id__c');
      if (
        sourceKey?.isPrimaryKey &&
        targetKey?.isPrimaryKey &&
        targetKey.keyQualifierName === 'KQ_Id'
      )
        generated.add(pairKey(pair));
    }
  }
  return { generated, sources, targets };
}

/**
 * Build a minimal names-only native write body, never replaying saved selectors.
 * @param {NativeMappingDocument} desired Binding.
 * @param {NativeMappingField[]} fields Explicit operation-selected pairs.
 * @returns {MappingWriteBody} Native singular fieldMapping input.
 */
function bodyFor(desired: NativeMappingDocument, fields: NativeMappingField[]): MappingWriteBody {
  return {
    sourceEntityDeveloperName: desired.spec.sourceEntityDeveloperName,
    targetEntityDeveloperName: desired.spec.targetEntityDeveloperName,
    fieldMapping: fields.map(({ sourceFieldDeveloperName, targetFieldDeveloperName }) => ({
      sourceFieldDeveloperName,
      targetFieldDeveloperName,
    })),
  };
}

/**
 * Retrieve one exact mapping with all runtime KQ/system pairs retained in portable JSON.
 * @param {string} apiName Observed target mapping name.
 * @param {MappingClient} client Target mapping transport.
 * @returns {Promise<NativeMappingDocument>} Complete portable definition.
 */
export async function retrieveNativeMapping(
  apiName: string,
  client: MappingClient,
): Promise<NativeMappingDocument> {
  if (!nativeMappingName.test(apiName)) throw new NativeMappingError('INVALID_MAPPING_NAME');
  const document = normalizeNativeMapping(await client.get(apiName));
  if (document.identity.apiName !== apiName)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  return document;
}

/**
 * Plan create, selector-free addition, or no-op without mutation.
 * @param {unknown} value Portable desired mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target definition readers.
 * @returns {Promise<NativeMappingDeployPlan>} Bounded operation plan.
 */
export async function preflightNativeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
): Promise<NativeMappingDeployPlan> {
  const desired = validateNativeMappingDocument(value);
  const { generated, sources, targets } = await validateDependencies(desired, dependencies);
  const target = await resolveTarget(desired, client);
  if (!target) {
    const fields = desired.spec.fieldMappings.filter((pair) => !generated.has(pairKey(pair)));
    // Unknown system/qualifier inputs cannot inherit another component's omission policy.
    if (
      fields.some(
        (pair) =>
          targets.get(pair.targetFieldDeveloperName)?.creationType !== 'Custom' ||
          targets.get(pair.targetFieldDeveloperName)?.dataType !== 'Text' ||
          pair.sourceFieldDeveloperName.startsWith('KQ_') ||
          pair.targetFieldDeveloperName.startsWith('KQ_'),
      )
    )
      throw new NativeMappingError('MAPPING_CREATE_FIELD_POLICY_UNPROVEN');
    if (
      !fields.some(
        (pair) =>
          sources.get(pair.sourceFieldDeveloperName)?.isPrimaryKey &&
          targets.get(pair.targetFieldDeveloperName)?.isPrimaryKey,
      )
    )
      throw new NativeMappingError('MAPPING_PRIMARY_KEY_PAIR_REQUIRED');
    return { operation: 'create', desired, writes: [{ body: bodyFor(desired, fields) }] };
  }
  const incoming = new Set(desired.spec.fieldMappings.map((pair) => pairKey(pair)));
  if (target.spec.fieldMappings.some((pair) => !incoming.has(pairKey(pair))))
    throw new NativeMappingError('UNSUPPORTED_MAPPING_FIELD_REMOVAL_OR_RETARGET');
  const existing = new Set(target.spec.fieldMappings.map((pair) => pairKey(pair)));
  const added = desired.spec.fieldMappings.filter((pair) => !existing.has(pairKey(pair)));
  if (added.length === 0) return { operation: 'noop', desired, target, writes: [] };
  // API68 qualified one new logical pair; do not guess batch or replacement semantics.
  if (
    added.some((pair) =>
      target.spec.fieldMappings.some(
        (field) =>
          field.sourceFieldDeveloperName === pair.sourceFieldDeveloperName ||
          field.targetFieldDeveloperName === pair.targetFieldDeveloperName,
      ),
    )
  )
    throw new NativeMappingError('UNSUPPORTED_MAPPING_RETARGET');
  if (added.length !== 1) throw new NativeMappingError('UNSUPPORTED_MAPPING_MULTI_PAIR_UPDATE');
  return {
    operation: 'update',
    desired,
    target,
    writes: [{ body: bodyFor(desired, added) }],
  };
}

/**
 * Dispatch at most one write, then independently settle using bounded GETs, never write retries.
 * @param {unknown} value Portable desired definition.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Source/target readers.
 * @returns {Promise<{operation: 'create' | 'update' | 'noop', document: NativeMappingDocument}>} Confirmed definition.
 */
export async function deployNativeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
): Promise<{ operation: 'create' | 'update' | 'noop'; document: NativeMappingDocument }> {
  const plan = await preflightNativeMapping(value, client, dependencies);
  if (plan.operation === 'noop') return { operation: 'noop', document: plan.target! };
  const write = plan.writes[0];
  const accepted = normalizeNativeMapping(
    plan.operation === 'create'
      ? await client.create(write.body)
      : await client.update(plan.target!.identity.apiName, write.body),
  );
  checkBinding(plan.desired, accepted);
  const name = plan.target?.identity.apiName ?? accepted.identity.apiName;
  if (accepted.identity.apiName !== name)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  for (let attempt = 0; attempt < 3; attempt++) {
    let document: NativeMappingDocument;
    try {
      const raw = await client.get(name);
      document = normalizeNativeMapping(raw);
      if (document.identity.apiName !== name)
        throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
      if ((raw as Record<string, unknown>).status !== 'ACTIVE') continue;
    } catch (error) {
      if (
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      )
        continue;
      throw error;
    }
    checkBinding(plan.desired, document);
    const actual = new Map(document.spec.fieldMappings.map((pair) => [pairKey(pair), pair]));
    const desiredPresent = plan.desired.spec.fieldMappings.every((pair) =>
      actual.has(pairKey(pair)),
    );
    const preserved = (plan.target?.spec.fieldMappings ?? accepted.spec.fieldMappings).every(
      (pair) =>
        actual.has(pairKey(pair)) &&
        actual.get(pairKey(pair))?.developerName === pair.developerName,
    );
    if (desiredPresent && preserved) return { operation: plan.operation, document };
  }
  throw new NativeMappingError('MAPPING_PERSISTENCE_UNCONFIRMED');
}

/**
 * Guard whole-mapping deletion with a fresh complete DMO-only collection and live survivor.
 * Last-mapping deletion remains blocked; the DMO external-mapping boolean is not evidence.
 * @param {string} apiName Exact target-native mapping name.
 * @param {MappingClient} client Target mapping reader.
 * @param {MappingDependencies} dependencies Fresh parent readers.
 * @returns {Promise<object>} Immutable-before-write evidence for independent verification.
 */
export async function preflightDeleteNativeMapping(
  apiName: string,
  client: MappingClient,
  dependencies: MappingDependencies,
) {
  const selected = await retrieveNativeMapping(apiName, client);
  const raw = await client.get(apiName);
  if ((raw as Record<string, unknown>).status !== 'ACTIVE')
    throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
  if (!isDeepStrictEqual(selected, normalizeNativeMapping(raw)))
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  const response = await client.list(selected.spec.targetEntityDeveloperName);
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const entries = unwrapNativeMappingCollection(response);
  const names = new Set<string>();
  const sources = new Set<string>();
  for (const entry of entries) {
    const document = normalizeNativeMapping(entry);
    const name = document.identity.apiName.toLowerCase();
    const source = document.spec.sourceEntityDeveloperName.toLowerCase();
    if (
      document.spec.targetEntityDeveloperName !== selected.spec.targetEntityDeveloperName ||
      names.has(name) ||
      sources.has(source) ||
      entry.status !== 'ACTIVE'
    )
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    names.add(name);
    sources.add(source);
  }
  const current = entries.find((entry) => entry.developerName === apiName);
  if (!current || !isDeepStrictEqual(normalizeNativeMapping(current), selected))
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const survivorEntry = entries.find(
    (entry) => entry.sourceEntityDeveloperName !== selected.spec.sourceEntityDeveloperName,
  );
  if (!survivorEntry) throw new NativeMappingError('MAPPING_LAST_MAPPING_DELETE_BLOCKED');
  const survivor = await client.get(survivorEntry.developerName as string);
  if (
    (survivor as Record<string, unknown>).status !== 'ACTIVE' ||
    !isDeepStrictEqual(normalizeNativeMapping(survivor), normalizeNativeMapping(survivorEntry))
  )
    throw new NativeMappingError('MAPPING_SURVIVOR_UNCONFIRMED');
  const sourceNames = [
    selected.spec.sourceEntityDeveloperName,
    survivorEntry.sourceEntityDeveloperName as string,
  ];
  const parents = await Promise.all(
    sourceNames.map(async (name) => {
      const value = await dependencies.source.get(name);
      if (normalizeDlo(value).identity.apiName !== name)
        throw new NativeMappingError('MAPPING_DEPENDENCY_IDENTITY_MISMATCH');
      return value;
    }),
  );
  const target = await dependencies.target.get(selected.spec.targetEntityDeveloperName);
  if (normalizeNativeDmo(target).identity.apiName !== selected.spec.targetEntityDeveloperName)
    throw new NativeMappingError('MAPPING_DEPENDENCY_IDENTITY_MISMATCH');
  return {
    selected,
    survivor: structuredClone(survivor),
    sourceNames,
    parents: structuredClone(parents),
    target: structuredClone(target),
  };
}

/**
 * Delete once, require typed exact absence, settle the survivor and verify unchanged parents.
 * @param {string} apiName Exact native name, never a source artifact alias.
 * @param {MappingClient} client Mapping transport.
 * @param {MappingDependencies} dependencies Fresh parent readers.
 * @returns {Promise<{apiName: string}>} Independently verified absence.
 */
export async function deleteNativeMapping(
  apiName: string,
  client: MappingClient,
  dependencies: MappingDependencies,
): Promise<{ apiName: string }> {
  const before = await preflightDeleteNativeMapping(apiName, client, dependencies);
  await client.delete(apiName);
  let absent = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await retrieveNativeMapping(apiName, client);
    } catch (error) {
      if (
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      ) {
        absent = true;
        break;
      }
      throw error;
    }
  }
  if (!absent) throw new NativeMappingError('MAPPING_DELETION_UNCONFIRMED');
  let preserved = false;
  const survivorName = normalizeNativeMapping(before.survivor).identity.apiName;
  for (let attempt = 0; attempt < 3; attempt++) {
    const after = await client.get(survivorName);
    if ((after as Record<string, unknown>).status !== 'ACTIVE') continue;
    if (!isDeepStrictEqual(after, before.survivor))
      throw new NativeMappingError('MAPPING_SURVIVOR_CHANGED');
    preserved = true;
    break;
  }
  if (!preserved) throw new NativeMappingError('MAPPING_SURVIVOR_UNCONFIRMED');
  const parents = await Promise.all(
    before.sourceNames.map(async (name) => dependencies.source.get(name)),
  );
  const target = await dependencies.target.get(before.selected.spec.targetEntityDeveloperName);
  if (!isDeepStrictEqual(parents, before.parents) || !isDeepStrictEqual(target, before.target))
    throw new NativeMappingError('MAPPING_PARENT_CHANGED');
  return { apiName };
}
