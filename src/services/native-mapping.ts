import { isDeepStrictEqual } from 'node:util';
import { paceReadback, readbackPace } from './readback-pace.js';
import { explainMismatch, replaceExplanation } from './operation-diagnostic.js';
import {
  NativeMappingError,
  nativeMappingName,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
  validateNativeMappingDocument,
} from '../artifacts/native-mapping-document.js';
import { normalizeDlo } from '../artifacts/dlo-document.js';
import {
  nativeDmoWriteScope,
  normalizeNativeDmo,
  unwrapNativeDmo,
} from '../artifacts/native-dmo-document.js';
import type { DloField } from '../artifacts/dlo-document.js';
import type { NativeDmoField } from '../artifacts/native-dmo-document.js';
import type {
  NativeMappingDocument,
  NativeMappingField,
} from '../artifacts/native-mapping-document.js';
import type { MappingClient, MappingWriteBody } from '../transport/mapping-rest.js';
import type { DloClient } from '../transport/dlo-rest.js';
import type { DmoClient } from '../transport/dmo-rest.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';

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
  /** Pairs whose source and target data types differ; Salesforce accepts them. */
  typeDifferences?: Array<{
    source: string;
    target: string;
    sourceType: string;
    targetType: string;
  }>;
  /** Set when this create is the first mapping of a standard DMO that is not yet enabled. */
  activatesStandardDmo?: true;
};

const systemSourceFields = new Set([
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
]);
const keyQualifierField = /^KQ_(\w+)__c$/u;

/**
 * Recognise a pair Salesforce generates for a system field on a standard DMO. The target field is
 * the source's namesake or `ssot__<Name>Id__c`. A target field read as System qualifies any such
 * pair; otherwise only the three known system sources onto their standard-named field do.
 * @param {DloField} from Source field.
 * @param {NativeDmoField} to Target field.
 * @returns {boolean} Whether the pair is generated, not authored.
 */
function isStandardSystemPair(from: DloField, to: NativeDmoField): boolean {
  if (from.isPrimaryKey || to.isPrimaryKey || keyQualifierField.test(from.name)) return false;
  const named = to.name === `ssot__${from.name.slice(0, -'__c'.length)}Id__c`;
  if (to.creationType === 'System') return named || to.name === from.name;
  return named && systemSourceFields.has(from.name) && to.creationType === 'Standard';
}

/**
 * Recognise the generated key qualifier pair of a standard DMO: `KQ_<Key>__c` on both sides,
 * where `<Key>__c` is the source primary key. With a target field it must be a System field that
 * a target primary key names as its qualifier; without one (the DMO has never been mapped) the
 * target only needs a primary key, because Salesforce adds the field with the first mapping.
 * @param {NativeMappingField} pair Mapping pair.
 * @param {Map<string, DloField>} sources Source fields by name.
 * @param {Map<string, NativeDmoField>} targets Target fields by name.
 * @returns {boolean} Whether the pair is generated, not authored.
 */
function isStandardKeyQualifierPair(
  pair: NativeMappingField,
  sources: Map<string, DloField>,
  targets: Map<string, NativeDmoField>,
): boolean {
  const match = keyQualifierField.exec(pair.sourceFieldDeveloperName);
  if (!match || pair.targetFieldDeveloperName !== pair.sourceFieldDeveloperName) return false;
  if (!sources.get(`${match[1]}__c`)?.isPrimaryKey) return false;
  const to = targets.get(pair.targetFieldDeveloperName);
  const keys = [...targets.values()].filter((field) => field.isPrimaryKey);
  if (!to) return keys.length > 0;
  return (
    to.creationType === 'System' &&
    keys.some((field) => field.keyQualifierName === `KQ_${match[1]}`)
  );
}

/**
 * Recognise a pair Salesforce generates on a custom DMO: a system field onto its namesake, or
 * the key qualifier of the target's primary key.
 * @param {DloField} from Source field.
 * @param {NativeDmoField} to Target field.
 * @param {Map<string, DloField>} sources Source fields by name.
 * @param {Map<string, NativeDmoField>} targets Target fields by name.
 * @returns {boolean} Whether the pair is generated, not authored.
 */
function isCustomGeneratedPair(
  from: DloField,
  to: NativeDmoField,
  sources: Map<string, DloField>,
  targets: Map<string, NativeDmoField>,
): boolean {
  if (from.name !== to.name) return false;
  if (
    systemSourceFields.has(to.name) &&
    to.creationType === 'System' &&
    !from.isPrimaryKey &&
    !to.isPrimaryKey
  )
    return true;
  const qualifier = keyQualifierField.exec(to.name);
  if (!qualifier || to.creationType !== 'System' || to.usageTag !== 'KeyQualifier') return false;
  // The qualifier belongs to the target's primary key, whatever its name and type.
  return (
    [...sources.values()].some((field) => field.isPrimaryKey) &&
    [...targets.values()].some(
      (field) => field.isPrimaryKey && field.keyQualifierName === `KQ_${qualifier[1]}`,
    )
  );
}

/**
 * Recognise the authored primary-key pair that is never unmapped: the source primary key onto
 * the target primary key, read from the org's flags, whatever their names and types.
 * @param {DloField} from Source field.
 * @param {NativeDmoField} to Target field.
 * @returns {boolean} Whether the pair is the key pair.
 */
function isKeyPair(from: DloField, to: NativeDmoField): boolean {
  return from.isPrimaryKey === true && to.isPrimaryKey === true;
}

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
    expected.identity.dataSpace !== actual.identity.dataSpace ||
    expected.spec.sourceEntityDeveloperName !== actual.spec.sourceEntityDeveloperName ||
    expected.spec.targetEntityDeveloperName !== actual.spec.targetEntityDeveloperName
  )
    throw explainMismatch(
      new NativeMappingError('MAPPING_TARGET_BINDING_MISMATCH'),
      'mapping binding readback',
      expected.identity.apiName,
      {
        dataSpace: expected.identity.dataSpace,
        sourceEntityDeveloperName: expected.spec.sourceEntityDeveloperName,
        targetEntityDeveloperName: expected.spec.targetEntityDeveloperName,
      },
      {
        dataSpace: actual.identity.dataSpace,
        sourceEntityDeveloperName: actual.spec.sourceEntityDeveloperName,
        targetEntityDeveloperName: actual.spec.targetEntityDeveloperName,
      },
    );
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
  const entries = unwrapNativeMappingCollection(response, desired.identity.dataSpace).map((entry) =>
    normalizeNativeMapping(entry, desired.identity.dataSpace),
  );
  for (const entry of entries) checkBinding(desired, entry);
  if (entries.length > 1) throw new NativeMappingError('AMBIGUOUS_MAPPING_TARGET');
  if (entries.length === 0) return;
  const raw = await client.get(entries[0].identity.apiName);
  const document = normalizeNativeMapping(raw, desired.identity.dataSpace);
  if ((raw as Record<string, unknown>).status !== 'ACTIVE')
    throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
  checkBinding(desired, document);
  if (document.identity.apiName !== entries[0].identity.apiName)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  return document;
}

/** Fresh fields of a mapping's source DLO and target DMO, and the target's write scope. */
export type MappingPairContext = {
  sources: Map<string, DloField>;
  targets: Map<string, NativeDmoField>;
  standard: boolean;
};

/**
 * Whether a pair of an existing mapping is one Salesforce generated. This one predicate decides
 * both which org pairs a deploy keeps when the file does not list them and which pairs a
 * retrieve leaves out of the file, so the two cannot diverge. A pair whose source or target
 * field is not read is never generated.
 * @param {NativeMappingField} pair Mapping pair.
 * @param {MappingPairContext} context Fresh source and target fields.
 * @returns {boolean} Whether the pair is generated, not authored.
 */
export function isGeneratedMappingPair(
  pair: NativeMappingField,
  context: MappingPairContext,
): boolean {
  const { sources, targets } = context;
  const from = sources.get(pair.sourceFieldDeveloperName);
  const to = targets.get(pair.targetFieldDeveloperName);
  if (!from || !to) return false;
  return context.standard
    ? isStandardSystemPair(from, to) || isStandardKeyQualifierPair(pair, sources, targets)
    : isCustomGeneratedPair(from, to, sources, targets);
}

/**
 * Read the source DLO and target DMO of a mapping fresh and check their identity.
 * @param {NativeMappingDocument} desired Mapping whose binding names both.
 * @param {MappingDependencies} dependencies Fresh source and target readers.
 * @returns {Promise<object>} Field maps, write scope and whether a first mapping activates the DMO.
 */
async function readMappingParents(
  desired: NativeMappingDocument,
  dependencies: MappingDependencies,
) {
  const source = normalizeDlo(
    await dependencies.source.get(desired.spec.sourceEntityDeveloperName),
    desired.identity.dataSpace,
  );
  const rawTarget = unwrapNativeDmo(
    await dependencies.target.get(desired.spec.targetEntityDeveloperName),
  );
  // Mappings to platform-generated, untyped or namespaced custom DMOs are not qualified.
  const scope = nativeDmoWriteScope(rawTarget);
  if (scope === 'refused') throw new NativeMappingError('MAPPING_TARGET_UNSUPPORTED');
  const standard = scope === 'standard';
  // The first mapping enables a standard DMO for good; the raw read says whether that is ahead.
  const activates = standard && rawTarget.isEnabled !== true;
  const target = normalizeNativeDmo(rawTarget, desired.identity.dataSpace);
  if (
    source.identity.dataSpace !== desired.identity.dataSpace ||
    target.identity.dataSpace !== desired.identity.dataSpace ||
    source.identity.apiName !== desired.spec.sourceEntityDeveloperName ||
    target.identity.apiName !== desired.spec.targetEntityDeveloperName
  )
    throw new NativeMappingError('MAPPING_DEPENDENCY_IDENTITY_MISMATCH');
  return {
    activates,
    context: {
      sources: new Map(source.spec.fields.map((field) => [field.name, field])),
      targets: new Map(target.spec.fields.map((field) => [field.name, field])),
      standard,
    } satisfies MappingPairContext,
  };
}

/**
 * Name the pairs of a mapping that Salesforce generated, from fresh reads of its source DLO and
 * target DMO, with the same predicate a deploy uses to keep them. A mapping onto a DMO this
 * plugin never writes has none: a deploy refuses it, so nothing it lists can be lost.
 * @param {NativeMappingDocument} document Mapping as read.
 * @param {MappingDependencies} dependencies Fresh source and target readers.
 * @returns {Promise<NativeMappingField[]>} Generated pairs, in document order.
 */
export async function generatedMappingPairs(
  document: NativeMappingDocument,
  dependencies: MappingDependencies,
): Promise<NativeMappingField[]> {
  let context: MappingPairContext;
  try {
    ({ context } = await readMappingParents(document, dependencies));
  } catch (error) {
    if (error instanceof NativeMappingError && error.code === 'MAPPING_TARGET_UNSUPPORTED')
      return [];
    throw error;
  }
  return document.spec.fieldMappings.filter((pair) => isGeneratedMappingPair(pair, context));
}

/**
 * Retrieve one mapping with its authored pairs only: the pairs Salesforce generated are left
 * out, decided by {@link generatedMappingPairs}. When the source DLO or the target DMO cannot be
 * read nothing is guessed: the retrieve is refused, as a file missing a pair a deploy does not
 * recognise as generated would remove it from the org.
 * @param {string} apiName Observed target mapping name.
 * @param {MappingClient} client Target mapping transport.
 * @param {string} [requestScope] Optional request scope.
 * @param {MappingDependencies} [dependencies] Fresh source and target readers; required.
 * @returns {Promise<NativeMappingDocument>} Authored portable definition.
 */
export async function retrieveLeanNativeMapping(
  apiName: string,
  client: MappingClient,
  requestScope?: string,
  dependencies?: MappingDependencies,
): Promise<NativeMappingDocument> {
  const document = await retrieveNativeMapping(apiName, client, requestScope);
  let generated: NativeMappingField[];
  try {
    if (!dependencies) throw new NativeMappingError('MAPPING_PARENTS_REQUIRED');
    generated = await generatedMappingPairs(document, dependencies);
  } catch (error) {
    const refusal = retainConnectDiagnostic(
      new NativeMappingError('MAPPING_GENERATED_PAIRS_UNPROVEN'),
      getConnectDiagnostic(error),
    );
    replaceExplanation(
      refusal,
      `${apiName} was not saved: its source data lake object ${document.spec.sourceEntityDeveloperName} and target data model object ${document.spec.targetEntityDeveloperName} must be readable to leave out the pairs Salesforce generates${error instanceof Error && 'code' in error ? ` (${String(error.code)})` : ''}. Nothing was written for it.`,
    );
    throw refusal;
  }
  const omitted = new Set(generated.map((pair) => pairKey(pair)));
  document.spec.fieldMappings = document.spec.fieldMappings.filter(
    (pair) => !omitted.has(pairKey(pair)),
  );
  return document;
}

/**
 * Validate source/target existence and every requested field against fresh definitions.
 * The four exact generated pairs are qualified by the retained three-to-seven create probe.
 * The target is a custom or a standard DMO; on a standard one the generated pairs are recognised
 * from the target's own field read, and `activates` says its first mapping will enable it.
 * @param {NativeMappingDocument} desired Requested definition.
 * @param {MappingDependencies} dependencies Fresh source and target readers.
 * @returns {Promise<object>} Fresh definitions and evidence-backed generated pairs.
 */
async function validateDependencies(
  desired: NativeMappingDocument,
  dependencies: MappingDependencies,
) {
  const { activates, context } = await readMappingParents(desired, dependencies);
  const { sources, targets } = context;
  const generated = new Set<string>();
  const typeDifferences: NonNullable<NativeMappingDeployPlan['typeDifferences']> = [];
  for (const pair of desired.spec.fieldMappings) {
    const from = sources.get(pair.sourceFieldDeveloperName);
    const to = targets.get(pair.targetFieldDeveloperName);
    // A never-mapped standard DMO has no key qualifier field yet; its first mapping adds it.
    if (from && !to && activates && isStandardKeyQualifierPair(pair, sources, targets)) {
      generated.add(pairKey(pair));
      continue;
    }
    if (!from || !to) {
      const error = new NativeMappingError('MAPPING_FIELD_NOT_FOUND');
      replaceExplanation(
        error,
        from
          ? `The mapping pair ${pair.sourceFieldDeveloperName} -> ${pair.targetFieldDeveloperName} names the field ${pair.targetFieldDeveloperName}, which does not exist on ${desired.spec.targetEntityDeveloperName}.`
          : `The mapping pair ${pair.sourceFieldDeveloperName} -> ${pair.targetFieldDeveloperName} names the field ${pair.sourceFieldDeveloperName}, which does not exist on ${desired.spec.sourceEntityDeveloperName}.`,
      );
      throw error;
    }
    // Salesforce accepts pairs of different data types (live API 68); preview names them.
    if (from.dataType !== to.dataType)
      typeDifferences.push({
        source: pair.sourceFieldDeveloperName,
        target: pair.targetFieldDeveloperName,
        sourceType: from.dataType,
        targetType: to.dataType,
      });
    if (isGeneratedMappingPair(pair, context)) generated.add(pairKey(pair));
  }
  return { generated, sources, targets, context, activates, typeDifferences };
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
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<NativeMappingDocument>} Complete portable definition.
 */
export async function retrieveNativeMapping(
  apiName: string,
  client: MappingClient,
  requestScope?: string,
): Promise<NativeMappingDocument> {
  if (!nativeMappingName.test(apiName)) throw new NativeMappingError('INVALID_MAPPING_NAME');
  const document = normalizeNativeMapping(await client.get(apiName), requestScope);
  if (document.identity.apiName !== apiName)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  return document;
}

/**
 * Plan create, desired-state reconciliation, or no-op without mutation.
 * @param {unknown} value Portable desired mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target definition readers.
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<NativeMappingDeployPlan>} Bounded operation plan.
 */
export async function preflightNativeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
  requestScope?: string,
): Promise<NativeMappingDeployPlan> {
  // Cloned: generated pairs of the org are merged into it below, never into the caller's input.
  const desired = structuredClone(validateNativeMappingDocument(value));
  if (desired.identity.dataSpace !== (requestScope ?? 'default'))
    throw new NativeMappingError('MAPPING_DATASPACE_MISMATCH');
  const { generated, context, activates, typeDifferences } = await validateDependencies(
    desired,
    dependencies,
  );
  const notices = typeDifferences.length > 0 ? { typeDifferences } : {};
  const target = await resolveTarget(desired, client);
  if (target) {
    // Pairs Salesforce generated stay part of the mapping when the file does not list them;
    // retrieve leaves out exactly these (generatedMappingPairs uses the same predicate).
    const listed = new Set(desired.spec.fieldMappings.map((pair) => pairKey(pair)));
    for (const pair of target.spec.fieldMappings)
      if (!listed.has(pairKey(pair)) && isGeneratedMappingPair(pair, context))
        desired.spec.fieldMappings.push(structuredClone(pair));
  }
  if (!target) {
    const fields = desired.spec.fieldMappings.filter((pair) => !generated.has(pairKey(pair)));
    return {
      operation: 'create',
      desired,
      writes: [{ body: bodyFor(desired, fields) }],
      ...notices,
      ...(activates ? { activatesStandardDmo: true as const } : {}),
    };
  }
  const incoming = new Set(desired.spec.fieldMappings.map((pair) => pairKey(pair)));
  const removals = target.spec.fieldMappings.filter((pair) => !incoming.has(pairKey(pair)));
  const retained = target.spec.fieldMappings.filter((pair) => incoming.has(pairKey(pair)));
  const existing = new Set(target.spec.fieldMappings.map((pair) => pairKey(pair)));
  const added = desired.spec.fieldMappings.filter((pair) => !existing.has(pairKey(pair)));
  if (added.length === 0 && removals.length === 0)
    return { operation: 'noop', desired, target, writes: [], ...notices };
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
      ...notices,
    };
  const evidence = await preflightUnmapNativeMapping(
    target,
    client,
    dependencies,
    removals,
    requestScope,
  );
  if (evidence.protectedPairs.some((pair) => !incoming.has(pairKey(pair))))
    throw new NativeMappingError('MAPPING_PROTECTED_PAIR_REQUIRED');
  return {
    operation: 'update',
    desired,
    target,
    removals,
    retained,
    evidence,
    writes: added.length > 0 ? [{ body: bodyFor(desired, added) }] : [],
    ...notices,
  };
}

/**
 * Dispatch ordered unmaps then one additions batch, settling with GETs and no write retries.
 * @param {unknown} value Portable desired definition.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Source/target readers.
 * @param {Function} [onUpdated] Receive confirmed pair changes for human output only.
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<{operation: 'create' | 'update' | 'noop', document: NativeMappingDocument}>} Confirmed definition.
 */
export async function deployNativeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
  onUpdated?: (changes: { deleted: NativeMappingField[]; added: NativeMappingField[] }) => void,
  requestScope?: string,
): Promise<{
  operation: 'create' | 'update' | 'noop';
  document: NativeMappingDocument;
  activatesStandardDmo?: true;
}> {
  const plan = await preflightNativeMapping(value, client, dependencies, requestScope);
  const reportUpdate = (): void => {
    if (plan.operation === 'update')
      onUpdated?.({
        deleted: structuredClone(plan.removals ?? []),
        added: structuredClone(plan.writes.flatMap(({ body }) => body.fieldMapping)),
      });
  };
  if (plan.operation === 'noop') return { operation: 'noop', document: plan.target! };
  if (plan.operation === 'update' && plan.evidence) {
    const snapshot = await unmapNativeMappingFields(
      plan.evidence!,
      client,
      dependencies,
      () => {},
      requestScope,
    );
    if (plan.writes.length > 0) {
      if (!(await checkUnmapSnapshot(snapshot, client, dependencies)))
        throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
      const body = plan.writes[0].body;
      const accepted = normalizeNativeMapping(
        await client.update(plan.target!.identity.apiName, body),
        requestScope,
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
    for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
      await paceReadback(attempt);
      const raw = (await client.get(plan.target!.identity.apiName)) as Record<string, unknown>;
      const document = normalizeNativeMapping(raw, requestScope);
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
    requestScope,
  );
  checkBinding(plan.desired, accepted);
  const name = plan.target?.identity.apiName ?? accepted.identity.apiName;
  if (accepted.identity.apiName !== name)
    throw new NativeMappingError('MAPPING_TARGET_IDENTITY_MISMATCH');
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    let document: NativeMappingDocument;
    try {
      const raw = await client.get(name);
      document = normalizeNativeMapping(raw, requestScope);
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
      return {
        operation: plan.operation,
        document,
        ...(plan.activatesStandardDmo ? { activatesStandardDmo: true as const } : {}),
      };
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
 * @param {NativeMappingField[]} requestedRemovals Desired-state omissions.
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<NativeMappingUnmapPlan>} Complete removal evidence, without mutation.
 */
export async function preflightUnmapNativeMapping(
  selected: NativeMappingDocument,
  client: MappingClient,
  dependencies: MappingDependencies,
  requestedRemovals: NativeMappingField[],
  requestScope?: string,
): Promise<NativeMappingUnmapPlan> {
  if (selected.identity.dataSpace !== (requestScope ?? 'default'))
    throw new NativeMappingError('MAPPING_DATASPACE_MISMATCH');
  const response = await client.list(selected.spec.targetEntityDeveloperName);
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const inventory = unwrapNativeMappingCollection(response, requestScope);
  const documents = inventory.map((entry) => normalizeNativeMapping(entry, requestScope));
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
    if (normalizeDlo(parentByName.get(name), selected.identity.dataSpace).identity.apiName !== name)
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
    if (generated.has(pairKey(pair)) || isKeyPair(from, to)) {
      if (to.isMapped !== true) throw new NativeMappingError('MAPPING_PROTECTED_LAYOUT_UNPROVEN');
      protectedPairs.push(pair);
      continue;
    }
    if (!requestedRemovals.some((field) => pairKey(field) === pairKey(pair))) continue;
    // A system or key-qualifier field not recognised as generated is never unmapped by a deploy.
    if (
      to.creationType === 'System' ||
      to.usageTag === 'KeyQualifier' ||
      keyQualifierField.test(to.name)
    )
      throw new NativeMappingError('MAPPING_PROTECTED_LAYOUT_UNPROVEN');
    // Any other pair is removable; Salesforce decides (live API 68, custom and standard fields).
    removals.push(pair);
  }
  // Without an identified key pair nothing proves which pair must survive, so nothing is removed.
  if (
    !protectedPairs.some((pair) =>
      isKeyPair(
        sources.get(pair.sourceFieldDeveloperName)!,
        targets.get(pair.targetFieldDeveloperName)!,
      ),
    )
  )
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
    throw explainMismatch(
      new NativeMappingError('MAPPING_PARENT_CHANGED'),
      'unmap parent preservation',
      plan.selected.identity.apiName,
      { parents: plan.parents, target: plan.target },
      { parents, target },
    );
  const response = await client.list(plan.selected.spec.targetEntityDeveloperName);
  if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const entries = unwrapNativeMappingCollection(response, plan.selected.identity.dataSpace);
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
        throw explainMismatch(
          new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED'),
          'unmap inventory/detail preservation',
          expected.developerName,
          expected,
          value,
        );
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
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<NativeMappingUnmapPlan>} Settled retained-pair snapshot for the next operation.
 */
export async function unmapNativeMappingFields(
  evidence: NativeMappingUnmapPlan,
  client: MappingClient,
  dependencies: MappingDependencies,
  onDispatch: () => void,
  requestScope?: string,
): Promise<NativeMappingUnmapPlan> {
  const fresh = await preflightUnmapNativeMapping(
    evidence.selected,
    client,
    dependencies,
    evidence.removals,
    requestScope,
  );
  if (!isDeepStrictEqual(fresh, evidence))
    throw explainMismatch(
      new NativeMappingError('MAPPING_UNMAP_PLAN_CHANGED'),
      'unmap pre-dispatch plan recheck',
      evidence.selected.identity.apiName,
      evidence,
      fresh,
    );
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
    // The field stays mapped for as long as another mapping of the DMO still targets it.
    if (
      !plan.inventory.some(
        (value) =>
          value.developerName !== plan.selected.identity.apiName &&
          (value.fieldMappings as NativeMappingField[]).some(
            (other) => other.targetFieldDeveloperName === pair.targetFieldDeveloperName,
          ),
      )
    )
      delete field.isMapped;
    onDispatch();
    await client.deleteField(plan.selected.identity.apiName, pair.developerName!);
    let settled = false;
    for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
      await paceReadback(attempt);
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

export type NativeMappingDeletePlan = {
  selected: NativeMappingDocument;
  /** Every other mapping of the same DMO, ordered by name. */
  others: NativeMappingDocument[];
  /** Field names of the target DMO, ordered. */
  targetFields: string[];
};
export type NativeMappingDeleteSettle = {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
};
export const defaultMappingDeleteSettle: NativeMappingDeleteSettle = {
  attempts: 6,
  delayMs: 5000,
  sleep: async (ms) => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
};

/**
 * Read what a mapping deletion must leave untouched: the other mappings and the DMO's fields.
 * @param {string} target Target DMO name.
 * @param {MappingClient} client Mapping reader.
 * @param {MappingDependencies} dependencies Parent readers.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<object>} Normalised mappings ordered by name, raw DMO and ordered field names.
 */
async function readMappingSurroundings(
  target: string,
  client: MappingClient,
  dependencies: Pick<MappingDependencies, 'target'>,
  requestScope?: string,
) {
  let entries: Record<string, unknown>[] = [];
  try {
    const response = await client.list(target);
    if (!response || typeof response !== 'object' || Object.keys(response).length !== 1)
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    entries = unwrapNativeMappingCollection(response, requestScope);
  } catch (error) {
    // A DMO without any mapping answers the filtered list with a typed 404.
    if (
      !(error instanceof NativeMappingError) ||
      error.code !== 'MAPPING_HTTP_ERROR' ||
      error.status !== 404
    )
      throw error;
  }
  const mappings = entries
    .map((entry) => normalizeNativeMapping(entry, requestScope))
    // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh mapped array within the ES2022 library target.
    .sort((a, b) => a.identity.apiName.localeCompare(b.identity.apiName));
  const rawTarget = unwrapNativeDmo(await dependencies.target.get(target));
  const fields = Array.isArray(rawTarget.fields) ? (rawTarget.fields as { name?: unknown }[]) : [];
  const targetFields = fields.map((field) => String(field.name));
  targetFields.sort();
  return { mappings, rawTarget, targetFields };
}

/**
 * Qualify a whole-mapping deletion without writing. Salesforce cannot delete the last mapping of
 * a custom DMO, so that case is refused here with its way out; a standard DMO has no such limit.
 * @param {string} apiName Exact target-native mapping name.
 * @param {MappingClient} client Target mapping reader.
 * @param {Pick<MappingDependencies, 'target'>} dependencies Fresh DMO reader.
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @returns {Promise<NativeMappingDeletePlan>} What must be unchanged after the deletion.
 */
export async function preflightDeleteNativeMapping(
  apiName: string,
  client: MappingClient,
  dependencies: Pick<MappingDependencies, 'target'>,
  requestScope?: string,
): Promise<NativeMappingDeletePlan> {
  const selected = await retrieveNativeMapping(apiName, client, requestScope);
  const target = selected.spec.targetEntityDeveloperName;
  const { mappings, rawTarget, targetFields } = await readMappingSurroundings(
    target,
    client,
    dependencies,
    requestScope,
  );
  if (!mappings.some((entry) => isDeepStrictEqual(entry, selected)))
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  const others = mappings.filter((entry) => entry.identity.apiName !== apiName);
  // Namespaced custom DMOs share the limit, so test the creation type, not the write scope.
  if (others.length === 0 && rawTarget.creationType === 'Custom') {
    const error = new NativeMappingError('MAPPING_LAST_MAPPING_DELETE_BLOCKED');
    replaceExplanation(
      error,
      `${apiName} is the only mapping of the custom DMO ${target}, and Salesforce does not delete the last mapping of a custom DMO. Delete the DMO instead (sf data360 delete --metadata dmo:${target}); that removes its mapping with it.`,
    );
    throw error;
  }
  return { selected, others, targetFields };
}

/**
 * Delete a mapping with one Metadata API destructive deployment, then confirm its absence and
 * that the DMO's other mappings and its fields are what they were.
 * @param {string} apiName Exact native name, never a source artifact alias.
 * @param {MappingClient} client Mapping transport.
 * @param {MappingDependencies} dependencies Fresh parent readers.
 * @param {string} [requestScope] Optional request scope; omission has local effective default context.
 * @param {NativeMappingDeleteSettle} [settle] Bounded readback budget.
 * @returns {Promise<{apiName: string}>} Independently verified absence.
 */
export async function deleteNativeMapping(
  apiName: string,
  client: MappingClient,
  dependencies: Pick<MappingDependencies, 'target'>,
  requestScope?: string,
  settle: NativeMappingDeleteSettle = defaultMappingDeleteSettle,
): Promise<{ apiName: string }> {
  const before = await preflightDeleteNativeMapping(apiName, client, dependencies, requestScope);
  await client.remove(apiName);
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    try {
      await retrieveNativeMapping(apiName, client, requestScope);
      continue;
    } catch (error) {
      if (
        !(error instanceof NativeMappingError) ||
        error.code !== 'MAPPING_HTTP_ERROR' ||
        error.status !== 404
      )
        throw error;
    }
    const after = await readMappingSurroundings(
      before.selected.spec.targetEntityDeveloperName,
      client,
      dependencies,
      requestScope,
    );
    const expected = { mappings: before.others, targetFields: before.targetFields };
    const observed = { mappings: after.mappings, targetFields: after.targetFields };
    if (!isDeepStrictEqual(observed, expected))
      throw explainMismatch(
        new NativeMappingError('MAPPING_DELETE_SIDE_EFFECT'),
        'mapping deletion readback of the other mappings and the DMO fields',
        apiName,
        expected,
        observed,
      );
    return { apiName };
  }
  throw new NativeMappingError('MAPPING_DELETION_UNCONFIRMED');
}
