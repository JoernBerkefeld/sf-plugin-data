import { isDeepStrictEqual } from 'node:util';
import { isNativeMappingDeletionVersion } from '../transport/api-version.js';
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
  removals?: NativeMappingField[];
  retained?: NativeMappingField[];
  evidence?: NativeMappingUnmapPlan;
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
 * Plan create, desired-state reconciliation, or no-op without mutation.
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
  const removals = target.spec.fieldMappings.filter((pair) => !incoming.has(pairKey(pair)));
  const retained = target.spec.fieldMappings.filter((pair) => incoming.has(pairKey(pair)));
  const existing = new Set(target.spec.fieldMappings.map((pair) => pairKey(pair)));
  const added = desired.spec.fieldMappings.filter((pair) => !existing.has(pairKey(pair)));
  if (added.length === 0 && removals.length === 0)
    return { operation: 'noop', desired, target, writes: [] };
  // Preserve the existing compatible single-add contract; reconciliation has stricter evidence.
  if (
    removals.length === 0 &&
    added.length === 1 &&
    !target.spec.fieldMappings.some(
      (pair) =>
        pair.sourceFieldDeveloperName === added[0].sourceFieldDeveloperName ||
        pair.targetFieldDeveloperName === added[0].targetFieldDeveloperName,
    )
  )
    return {
      operation: 'update',
      desired,
      target,
      retained,
      writes: [{ body: bodyFor(desired, added) }],
    };
  if (client.apiVersion !== '68.0')
    throw new NativeMappingError('MAPPING_UNMAP_VERSION_UNQUALIFIED');
  const evidence = await preflightUnmapNativeMapping(target, client, dependencies, removals);
  if (evidence.protectedPairs.some((pair) => !incoming.has(pairKey(pair))))
    throw new NativeMappingError('MAPPING_PROTECTED_PAIR_REQUIRED');
  // Bind addition policy to the same immutable parent snapshot used for every unmap check.
  const { sources: additionSources, targets: additionTargets } = await validateDependencies(
    desired,
    {
      source: {
        get: async (name) => evidence.parents[evidence.sourceNames.indexOf(name)],
      },
      target: { get: async () => evidence.target },
    },
  );
  // Retarget proof covers unique empty Text targets, never shared/occupied destinations.
  for (const pair of added) {
    const from = additionSources.get(pair.sourceFieldDeveloperName)!;
    const to = additionTargets.get(pair.targetFieldDeveloperName)!;
    if (
      from.isPrimaryKey ||
      to.isPrimaryKey ||
      to.creationType !== 'Custom' ||
      to.dataType !== 'Text' ||
      (to.usageTag !== undefined && to.usageTag !== 'None') ||
      to.keyQualifierName !== undefined ||
      desired.spec.fieldMappings.filter(
        (field) => field.targetFieldDeveloperName === pair.targetFieldDeveloperName,
      ).length !== 1 ||
      retained.some((field) => field.sourceFieldDeveloperName === pair.sourceFieldDeveloperName) ||
      (to.isMapped !== undefined &&
        !removals.some(
          (field) => field.targetFieldDeveloperName === pair.targetFieldDeveloperName,
        )) ||
      evidence.inventory.some(
        (entry) =>
          entry.developerName !== target.identity.apiName &&
          normalizeNativeMapping(entry).spec.fieldMappings.some(
            (field) => field.targetFieldDeveloperName === pair.targetFieldDeveloperName,
          ),
      ) ||
      removals.some(
        (field) =>
          (field.sourceFieldDeveloperName === pair.sourceFieldDeveloperName ||
            field.targetFieldDeveloperName === pair.targetFieldDeveloperName) &&
          additionTargets.get(field.targetFieldDeveloperName)?.dataType !== 'Text',
      )
    )
      throw new NativeMappingError('MAPPING_ADDITION_POLICY_UNPROVEN');
  }
  return {
    operation: 'update',
    desired,
    target,
    removals,
    retained,
    evidence,
    writes: added.length > 0 ? [{ body: bodyFor(desired, added) }] : [],
  };
}

/**
 * Dispatch ordered unmaps then one additions batch, settling with GETs and no write retries.
 * @param {unknown} value Portable desired definition.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Source/target readers.
 * @param {Function} [onUpdated] Receive confirmed pair changes for human output only.
 * @returns {Promise<{operation: 'create' | 'update' | 'noop', document: NativeMappingDocument}>} Confirmed definition.
 */
export async function deployNativeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
  onUpdated?: (changes: { deleted: NativeMappingField[]; added: NativeMappingField[] }) => void,
): Promise<{ operation: 'create' | 'update' | 'noop'; document: NativeMappingDocument }> {
  const plan = await preflightNativeMapping(value, client, dependencies);
  const reportUpdate = (): void => {
    if (plan.operation === 'update')
      onUpdated?.({
        deleted: structuredClone(plan.removals ?? []),
        added: structuredClone(plan.writes.flatMap(({ body }) => body.fieldMapping)),
      });
  };
  if (plan.operation === 'noop') return { operation: 'noop', document: plan.target! };
  if (plan.operation === 'update' && plan.evidence) {
    const snapshot = await unmapNativeMappingFields(plan.evidence!, client, dependencies, () => {});
    if (plan.writes.length > 0) {
      if (!(await checkUnmapSnapshot(snapshot, client, dependencies)))
        throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
      const body = plan.writes[0].body;
      const accepted = normalizeNativeMapping(
        await client.update(plan.target!.identity.apiName, body),
      );
      checkBinding(plan.desired, accepted);
      if (accepted.identity.apiName !== plan.target!.identity.apiName)
        throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
      for (const pair of body.fieldMapping) {
        const field = (snapshot.target.fields as Record<string, unknown>[]).find(
          (entry) => entry.name === pair.targetFieldDeveloperName,
        )!;
        field.isMapped = true;
      }
    }
    let settledPairs: NativeMappingField[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = (await client.get(plan.target!.identity.apiName)) as Record<string, unknown>;
      const document = normalizeNativeMapping(raw);
      checkBinding(plan.desired, document);
      const expected = new Set(plan.desired.spec.fieldMappings.map((pair) => pairKey(pair)));
      if (
        document.identity.apiName !== plan.target!.identity.apiName ||
        document.spec.fieldMappings.length !== expected.size ||
        document.spec.fieldMappings.some(
          (pair) => !expected.has(pairKey(pair)) || !pair.developerName,
        ) ||
        plan.retained!.some(
          (pair) =>
            !isDeepStrictEqual(
              pair,
              document.spec.fieldMappings.find((field) => pairKey(field) === pairKey(pair)),
            ),
        )
      )
        throw new NativeMappingError('MAPPING_PERSISTENCE_UNCONFIRMED');
      const entry = snapshot.inventory.find(
        (value) => value.developerName === document.identity.apiName,
      )!;
      // Only new pair selectors are discovered; every other raw property remains bound.
      if (settledPairs && !isDeepStrictEqual(settledPairs, document.spec.fieldMappings))
        throw new NativeMappingError('MAPPING_PERSISTENCE_UNCONFIRMED');
      settledPairs ??= structuredClone(document.spec.fieldMappings);
      entry.fieldMappings = settledPairs;
      if (await checkUnmapSnapshot(snapshot, client, dependencies)) {
        reportUpdate();
        return { operation: 'update', document };
      }
    }
    throw new NativeMappingError('MAPPING_PERSISTENCE_UNCONFIRMED');
  }
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
    if (
      desiredPresent &&
      preserved &&
      (plan.operation === 'create' || actual.size === plan.desired.spec.fieldMappings.length)
    ) {
      reportUpdate();
      return { operation: plan.operation, document };
    }
  }
  throw new NativeMappingError('MAPPING_PERSISTENCE_UNCONFIRMED');
}

export type NativeMappingUnmapPlan = {
  selected: NativeMappingDocument;
  removals: NativeMappingField[];
  protectedPairs: NativeMappingField[];
  inventory: Record<string, unknown>[];
  sourceNames: string[];
  parents: unknown[];
  target: Record<string, unknown>;
};

/**
 * Classify exact metadata-backed protected pairs and qualified authored identity pairs.
 * @param {NativeMappingDocument} selected Fresh target definition.
 * @param {MappingClient} client Version-bearing mapping reader.
 * @param {MappingDependencies} dependencies Fresh parent readers.
 * @param {NativeMappingField[]} [requestedRemovals] Desired-state omissions, or all authored pairs.
 * @returns {Promise<NativeMappingUnmapPlan>} Complete removal evidence, without mutation.
 */
export async function preflightUnmapNativeMapping(
  selected: NativeMappingDocument,
  client: MappingClient,
  dependencies: MappingDependencies,
  requestedRemovals?: NativeMappingField[],
): Promise<NativeMappingUnmapPlan> {
  if (!isNativeMappingDeletionVersion(client.apiVersion))
    throw new NativeMappingError('MAPPING_UNMAP_VERSION_UNQUALIFIED');
  const response = await client.list(selected.spec.targetEntityDeveloperName);
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const inventory = unwrapNativeMappingCollection(response);
  const documents = inventory.map((entry) => normalizeNativeMapping(entry));
  if (
    new Set(documents.map((entry) => entry.identity.apiName.toLowerCase())).size !==
      documents.length ||
    new Set(documents.map((entry) => entry.spec.sourceEntityDeveloperName.toLowerCase())).size !==
      documents.length ||
    documents.some(
      (entry) => entry.spec.targetEntityDeveloperName !== selected.spec.targetEntityDeveloperName,
    ) ||
    inventory.some((entry) => entry.status !== 'ACTIVE') ||
    !documents.some((entry) => isDeepStrictEqual(entry, selected))
  )
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const sourceNames = documents.map((entry) => entry.spec.sourceEntityDeveloperName);
  const parents = await Promise.all(sourceNames.map(async (name) => dependencies.source.get(name)));
  const target = (await dependencies.target.get(selected.spec.targetEntityDeveloperName)) as Record<
    string,
    unknown
  >;
  const parentByName = new Map(sourceNames.map((name, index) => [name, parents[index]]));
  for (const name of sourceNames) {
    if (normalizeDlo(parentByName.get(name)).identity.apiName !== name)
      throw new NativeMappingError('MAPPING_DEPENDENCY_IDENTITY_MISMATCH');
  }
  const { generated, sources, targets } = await validateDependencies(selected, {
    source: { get: async (name) => parentByName.get(name) },
    target: { get: async () => target },
  });
  const protectedPairs: NativeMappingField[] = [];
  const removals: NativeMappingField[] = [];
  for (const pair of selected.spec.fieldMappings) {
    const from = sources.get(pair.sourceFieldDeveloperName)!;
    const to = targets.get(pair.targetFieldDeveloperName)!;
    if (!pair.developerName) throw new NativeMappingError('MAPPING_SELECTOR_REQUIRED');
    if (
      generated.has(pairKey(pair)) ||
      (from.name === 'Id__c' &&
        to.name === 'Id__c' &&
        from.isPrimaryKey &&
        to.isPrimaryKey &&
        to.creationType === 'Custom' &&
        to.keyQualifierName === 'KQ_Id' &&
        to.dataType === 'Text')
    ) {
      if (from.dataType !== 'Text' || to.dataType !== 'Text' || to.isMapped !== true)
        throw new NativeMappingError('MAPPING_PROTECTED_LAYOUT_UNPROVEN');
      protectedPairs.push(pair);
      continue;
    }
    if (requestedRemovals && !requestedRemovals.some((field) => pairKey(field) === pairKey(pair)))
      continue;
    if (
      from.name !== to.name ||
      from.isPrimaryKey ||
      to.isPrimaryKey ||
      to.creationType !== 'Custom' ||
      !['Text', 'Number'].includes(to.dataType) ||
      (to.usageTag !== undefined && to.usageTag !== 'None') ||
      to.keyQualifierName !== undefined ||
      to.isMapped !== true ||
      documents.some(
        (entry) =>
          entry.identity.apiName !== selected.identity.apiName &&
          entry.spec.fieldMappings.some((field) => field.targetFieldDeveloperName === to.name),
      )
    )
      throw new NativeMappingError('MAPPING_UNMAP_FIELD_POLICY_UNPROVEN');
    removals.push(pair);
  }
  if (protectedPairs.length !== 5 || generated.size !== 4)
    throw new NativeMappingError('MAPPING_PROTECTED_LAYOUT_UNPROVEN');
  // Independently check every inventory detail, not merely collection echoes.
  for (const entry of inventory) {
    if (!isDeepStrictEqual(await client.get(entry.developerName as string), entry))
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  }
  return structuredClone({
    selected,
    removals,
    protectedPairs,
    inventory,
    sourceNames,
    parents,
    target,
  });
}

/**
 * Compare complete parents and inventory against one exact expected snapshot.
 * @param {NativeMappingUnmapPlan} plan Expected immutable evidence.
 * @param {MappingClient} client Mapping reader.
 * @param {MappingDependencies} dependencies Parent readers.
 * @returns {Promise<boolean>} Whether all mappings have settled ACTIVE.
 */
async function checkUnmapSnapshot(
  plan: NativeMappingUnmapPlan,
  client: MappingClient,
  dependencies: MappingDependencies,
): Promise<boolean> {
  const parents = await Promise.all(
    plan.sourceNames.map(async (name) => dependencies.source.get(name)),
  );
  const target = await dependencies.target.get(plan.selected.spec.targetEntityDeveloperName);
  if (!isDeepStrictEqual(parents, plan.parents) || !isDeepStrictEqual(target, plan.target))
    throw new NativeMappingError('MAPPING_PARENT_CHANGED');
  const response = await client.list(plan.selected.spec.targetEntityDeveloperName);
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const entries = unwrapNativeMappingCollection(response);
  if (entries.length !== plan.inventory.length)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  let active = true;
  for (const expected of plan.inventory) {
    const actual = entries.find((entry) => entry.developerName === expected.developerName);
    const detail = (await client.get(expected.developerName as string)) as Record<string, unknown>;
    for (const value of [actual, detail]) {
      if (
        !value ||
        !['ACTIVE', 'CREATING'].includes(value.status as string) ||
        !isDeepStrictEqual({ ...value, status: 'ACTIVE' }, expected)
      )
        throw new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
      if (value.status !== 'ACTIVE') active = false;
    }
  }
  return active;
}

/**
 * Unmap qualified observed selectors once each, checking exact schema after every dispatch.
 * This helper never deletes a parent mapping or admits desired-state retargeting.
 * @param {NativeMappingUnmapPlan} evidence Fresh complete preflight snapshot.
 * @param {MappingClient} client Mapping transport.
 * @param {MappingDependencies} dependencies Parent readers.
 * @param {Function} onDispatch Called before awaiting each mutation, including lost responses.
 * @returns {Promise<NativeMappingUnmapPlan>} Settled retained-pair snapshot for the next operation.
 */
export async function unmapNativeMappingFields(
  evidence: NativeMappingUnmapPlan,
  client: MappingClient,
  dependencies: MappingDependencies,
  onDispatch: () => void,
): Promise<NativeMappingUnmapPlan> {
  if (!isNativeMappingDeletionVersion(client.apiVersion))
    throw new NativeMappingError('MAPPING_UNMAP_VERSION_UNQUALIFIED');
  const fresh = await preflightUnmapNativeMapping(
    evidence.selected,
    client,
    dependencies,
    evidence.removals,
  );
  if (!isDeepStrictEqual(fresh, evidence))
    throw new NativeMappingError('MAPPING_UNMAP_PLAN_CHANGED');
  const plan = structuredClone(evidence);
  for (const pair of plan.removals) {
    if (!(await checkUnmapSnapshot(plan, client, dependencies)))
      throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
    const entry = plan.inventory.find(
      (value) => value.developerName === plan.selected.identity.apiName,
    )!;
    entry.fieldMappings = (entry.fieldMappings as NativeMappingField[]).filter(
      (field) => pairKey(field) !== pairKey(pair),
    );
    const field = (plan.target.fields as Record<string, unknown>[]).find(
      (value) => value.name === pair.targetFieldDeveloperName,
    )!;
    delete field.isMapped;
    onDispatch();
    await client.deleteField(plan.selected.identity.apiName, pair.developerName!);
    let settled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await checkUnmapSnapshot(plan, client, dependencies)) {
        settled = true;
        break;
      }
    }
    if (!settled) throw new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
  }
  plan.selected.spec.fieldMappings = plan.selected.spec.fieldMappings.filter(
    (pair) => !plan.removals.some((removed) => pairKey(removed) === pairKey(pair)),
  );
  plan.removals = [];
  return plan;
}

/**
 * Qualify unmap-first deletion with an independently metadata-backed protected survivor.
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
  if (!isNativeMappingDeletionVersion(client.apiVersion))
    throw new NativeMappingError('MAPPING_DELETE_VERSION_UNQUALIFIED');
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
  // The last-for-DMO check above precedes even the authored removal plan.
  const plan = await preflightUnmapNativeMapping(selected, client, dependencies);
  if (!isDeepStrictEqual(plan.inventory, entries))
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const protectedKeys = new Set(plan.protectedPairs.map((pair) => pairKey(pair)));
  let qualified = false;
  for (const entry of entries.filter(
    (value) => value.sourceEntityDeveloperName !== selected.spec.sourceEntityDeveloperName,
  )) {
    const document = normalizeNativeMapping(entry);
    const {
      generated,
      sources: from,
      targets: to,
    } = await validateDependencies(document, {
      source: {
        get: async (name) => plan.parents[plan.sourceNames.indexOf(name)],
      },
      target: { get: async () => plan.target },
    });
    if (
      generated.size === 4 &&
      document.spec.fieldMappings.every((pair) => pair.developerName) &&
      [...protectedKeys].every((key) =>
        document.spec.fieldMappings.some((pair) => {
          if (pairKey(pair) !== key) return false;
          const source = from.get(pair.sourceFieldDeveloperName)!;
          const target = to.get(pair.targetFieldDeveloperName)!;
          return (
            source.dataType === 'Text' &&
            target.dataType === 'Text' &&
            target.isMapped === true &&
            (generated.has(key) ||
              (source.name === 'Id__c' &&
                source.isPrimaryKey &&
                target.isPrimaryKey &&
                target.creationType === 'Custom' &&
                target.keyQualifierName === 'KQ_Id'))
          );
        }),
      )
    )
      qualified = true;
  }
  if (!qualified) throw new NativeMappingError('MAPPING_SURVIVOR_UNCONFIRMED');
  return plan;
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
  const remainder = await unmapNativeMappingFields(before, client, dependencies, () => {});
  // Requalify the protected-only remainder and all survivor metadata immediately before DELETE.
  const final = await preflightDeleteNativeMapping(apiName, client, dependencies);
  if (final.removals.length > 0 || !isDeepStrictEqual(final, remainder))
    throw new NativeMappingError('MAPPING_UNMAP_PLAN_CHANGED');
  if (!(await checkUnmapSnapshot(final, client, dependencies)))
    throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
  await client.delete(apiName);
  final.inventory = final.inventory.filter((entry) => entry.developerName !== apiName);
  for (let attempt = 0; attempt < 3; attempt++) {
    let absent = false;
    try {
      await retrieveNativeMapping(apiName, client);
    } catch (error) {
      if (
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_HTTP_ERROR' &&
        error.status === 404
      )
        absent = true;
      else throw error;
    }
    // Every settlement read checks full content, including while CREATING.
    const active = await checkUnmapSnapshot(final, client, dependencies);
    if (absent && active) return { apiName };
  }
  throw new NativeMappingError('MAPPING_DELETION_UNCONFIRMED');
}
