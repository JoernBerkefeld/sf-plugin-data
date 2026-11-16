import { paceReadback, readbackPace } from './readback-pace.js';
import { explanationOf, replaceExplanation } from './operation-diagnostic.js';
import { getConnectDiagnostic } from '../transport/connect-diagnostic.js';
import {
  NativeRelationshipError,
  nativeRelationshipName,
  normalizeNativeRelationship,
  observeNativeRelationship,
  relationshipDmoName,
  relationshipSpec,
  sameRelationshipBinding,
  validateNativeRelationshipDocument,
} from '../artifacts/native-relationship-document.js';
import type {
  NativeRelationshipDocument,
  ObservedRelationship,
} from '../artifacts/native-relationship-document.js';
import type { RelationshipClient } from '../transport/relationship-rest.js';
import {
  carriedNativeResponse,
  carryNativeResponse,
  createVerbatimDocument,
  isVerbatimDocument,
  verbatimReason,
} from '../artifacts/verbatim-document.js';
import type { DocumentMode, VerbatimDocument } from '../artifacts/verbatim-document.js';

/** Upper bound of pages read for one DMO; far above any observed inventory. */
const maximumPages = 100;

/**
 * Read every relationship the DMO is source or target of, paging by offset. `nextPageUrl` is not
 * followed: Salesforce repeats the current offset in it. The collected count must equal the
 * reported totalSize and names must be unique, otherwise the inventory is refused as incomplete.
 * @param {string} dmoName Exact DMO name.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {DocumentMode} [mode] `retrieve` takes entries as listed; only text names count towards
 * the uniqueness check.
 * @returns {Promise<ObservedRelationship[]>} Complete, verified inventory (empty for 204).
 */
export async function listNativeRelationships(
  dmoName: string,
  client: Pick<RelationshipClient, 'list'>,
  mode: DocumentMode = 'deploy',
): Promise<ObservedRelationship[]> {
  if (!relationshipDmoName.test(dmoName))
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_BINDING');
  const collected: ObservedRelationship[] = [];
  let total: number | undefined;
  for (let page = 0; page < maximumPages; page++) {
    const response = await client.list(dmoName, collected.length);
    if (response === undefined) {
      // 204: the DMO has no relationship at all.
      if (page === 0) return [];
      break;
    }
    if (!response || typeof response !== 'object' || Array.isArray(response))
      throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE');
    const { relationships, totalSize } = response as Record<string, unknown>;
    if (
      !Array.isArray(relationships) ||
      typeof totalSize !== 'number' ||
      !Number.isSafeInteger(totalSize) ||
      totalSize < 0
    )
      throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE');
    if (total !== undefined && total !== totalSize)
      throw new NativeRelationshipError('RELATIONSHIP_INVENTORY_INCOMPLETE');
    total = totalSize;
    // Each observation keeps its raw list entry, for a verbatim file when it cannot be saved.
    collected.push(
      ...relationships.map((entry) =>
        carryNativeResponse(observeNativeRelationship(entry, mode), entry),
      ),
    );
    if (relationships.length === 0 || collected.length >= total) break;
  }
  const named = collected.filter((entry) => typeof entry.name === 'string');
  const names = new Set(named.map((entry) => entry.name));
  if (collected.length !== total || names.size !== named.length)
    throw new NativeRelationshipError('RELATIONSHIP_INVENTORY_INCOMPLETE');
  return collected;
}

/**
 * Retrieve every relationship whose source object is the DMO, as portable documents.
 * @param {string} dmoName Exact source DMO.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope; omission is the default data space.
 * A relationship the document cannot represent is returned as a verbatim document of its raw list
 * entry; each saved document carries its raw entry for the same fallback at write time.
 * @param {DocumentMode} [mode] `retrieve` checks only the entries it keeps and keeps their values
 * as listed.
 * @returns {Promise<Array<NativeRelationshipDocument | VerbatimDocument>>} Documents ordered by name.
 */
export async function retrieveNativeRelationships(
  dmoName: string,
  client: Pick<RelationshipClient, 'list' | 'readDefinitions'>,
  requestScope?: string,
  mode: DocumentMode = 'deploy',
): Promise<Array<NativeRelationshipDocument | VerbatimDocument>> {
  const documents = await retrieveUnlabelledRelationships(dmoName, client, requestScope, mode);
  return labelRelationships(documents, await readLabels(relationshipLabelNames(documents), client));
}

/**
 * The relationships whose source object is the DMO, as {@link retrieveNativeRelationships}
 * returns them but without their labels (no Metadata API read), so the labels of many DMOs can
 * be read together.
 * @param {string} dmoName Exact source DMO.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope; omission is the default data space.
 * @param {DocumentMode} [mode] `retrieve` keeps values as listed.
 * @returns {Promise<Array<NativeRelationshipDocument | VerbatimDocument>>} Documents ordered by name.
 */
export async function retrieveUnlabelledRelationships(
  dmoName: string,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
  mode: DocumentMode = 'deploy',
): Promise<Array<NativeRelationshipDocument | VerbatimDocument>> {
  const inventory = await listNativeRelationships(dmoName, client, mode);
  const kept = inventory.filter((entry) => entry.sourceObjectName === dmoName);
  const documents = kept.map((entry): NativeRelationshipDocument | VerbatimDocument => {
    const native = carriedNativeResponse(entry);
    try {
      return carryNativeResponse(
        normalizeNativeRelationship(entryToWire(entry), requestScope, mode),
        native?.native,
      );
    } catch (error) {
      const reason = verbatimReason(error);
      const verbatim =
        reason === undefined || native === undefined
          ? undefined
          : createVerbatimDocument(
              'relationship',
              { dataSpace: requestScope ?? 'default', apiName: entry.name },
              reason,
              native.native,
            );
      if (verbatim === undefined) throw error;
      return verbatim;
    }
  });
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh mapped array within the ES2022 library target.
  return documents.sort((a, b) => a.identity.apiName.localeCompare(b.identity.apiName));
}

/**
 * The names whose label a retrieve reads: those of the documents it can save (a verbatim file
 * keeps the list entry as read and takes no label).
 * @param {Array<NativeRelationshipDocument | VerbatimDocument>} documents Unlabelled documents.
 * @returns {string[]} Relationship names.
 */
export function relationshipLabelNames(
  documents: Array<NativeRelationshipDocument | VerbatimDocument>,
): string[] {
  return documents
    .filter((document) => !isVerbatimDocument(document))
    .map((document) => document.identity.apiName);
}

/**
 * Put each read label into its saved document; the raw list entry each carries is kept.
 * @param {Array<NativeRelationshipDocument | VerbatimDocument>} documents Unlabelled documents.
 * @param {Map<string, string>} labels Label by relationship name.
 * @returns {Array<NativeRelationshipDocument | VerbatimDocument>} Documents in the same order.
 */
export function labelRelationships(
  documents: Array<NativeRelationshipDocument | VerbatimDocument>,
  labels: Map<string, string>,
): Array<NativeRelationshipDocument | VerbatimDocument> {
  return documents.map((document) => {
    if (isVerbatimDocument(document)) return document;
    const label = labels.get(document.identity.apiName);
    if (label === undefined) return document;
    return carryNativeResponse(
      { ...document, spec: { ...document.spec, label } },
      carriedNativeResponse(document)?.native,
    );
  });
}

/**
 * The labels (Metadata API masterLabel) of relationships, read in batches over the bound
 * Connection. Without a Metadata API reader, or for a name without a record, there is none.
 * @param {string[]} names Relationship names.
 * @param {Pick<RelationshipClient, 'readDefinitions'>} client Relationship reader.
 * @returns {Promise<Map<string, string>>} Label by name.
 */
export async function readLabels(
  names: string[],
  client: Pick<RelationshipClient, 'readDefinitions'>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (names.length === 0 || !client.readDefinitions) return labels;
  for (const definition of await client.readDefinitions(names))
    if (typeof definition.masterLabel === 'string' && typeof definition.fullName === 'string')
      labels.set(definition.fullName, definition.masterLabel);
  return labels;
}

/**
 * Rebuild the native entry shape from an observation, for the shared normaliser.
 * @param {ObservedRelationship} entry Observation.
 * @returns {object} Native-shaped entry.
 */
function entryToWire(entry: ObservedRelationship): Record<string, unknown> {
  return {
    name: entry.name,
    status: entry.status,
    cardinality: entry.cardinality,
    owner: entry.relationshipOwner,
    sourceObject: { name: entry.sourceObjectName },
    sourceField: { name: entry.sourceFieldName },
    targetObject: { name: entry.targetObjectName },
    targetField: { name: entry.targetFieldName },
  };
}

/**
 * Admit a portable relationship for the request scope.
 * @param {unknown} value Portable input.
 * @param {string} [requestScope] Optional request scope; omission is the default data space.
 * @param {DocumentMode} [mode] `retrieve` for a delete: values the plugin does not model are kept.
 * @returns {NativeRelationshipDocument} Checked document.
 */
function admit(
  value: unknown,
  requestScope?: string,
  mode: DocumentMode = 'deploy',
): NativeRelationshipDocument {
  const document = validateNativeRelationshipDocument(value, mode);
  if (document.identity.dataSpace !== (requestScope ?? 'default'))
    throw new NativeRelationshipError('UNSUPPORTED_RELATIONSHIP_DATASPACE');
  return document;
}

/**
 * Find the relationship carrying the document's binding in the source DMO's inventory.
 * @param {NativeRelationshipDocument} desired Portable document.
 * @param {ObservedRelationship[]} inventory Source DMO inventory.
 * @returns {ObservedRelationship | undefined} Unique match or confirmed absence.
 */
function findBinding(
  desired: NativeRelationshipDocument,
  inventory: ObservedRelationship[],
): ObservedRelationship | undefined {
  const matches = inventory.filter((entry) => sameRelationshipBinding(entry, desired.spec));
  if (matches.length > 1) throw new NativeRelationshipError('AMBIGUOUS_RELATIONSHIP_TARGET');
  return matches[0];
}

export type NativeRelationshipDeployPlan = {
  operation: 'create' | 'update' | 'noop';
  desired: NativeRelationshipDocument;
  /** Name of the org relationship the file means, when present. */
  existing?: string;
  /** Update only: the file keys whose values differ from the org. */
  changes?: string[];
  /** Update only: the whole Metadata API record to send. */
  definition?: Record<string, unknown>;
};

/**
 * Whether a Metadata API value is an explicit nil (`xsi:nil`), which a write must not send back.
 * @param {unknown} value Record value.
 * @returns {boolean} Explicit nil.
 */
function metadataNil(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const attributes = (value as Record<string, unknown>).$;
  return (
    !!attributes &&
    typeof attributes === 'object' &&
    (attributes as Record<string, unknown>)['xsi:nil'] === 'true'
  );
}

/**
 * Read the Metadata API record of one relationship.
 * @param {string} name Relationship name.
 * @param {Pick<RelationshipClient, 'readDefinitions'>} client Relationship reader.
 * @returns {Promise<Record<string, unknown>>} The record.
 */
async function readDefinition(
  name: string,
  client: Pick<RelationshipClient, 'readDefinitions'>,
): Promise<Record<string, unknown>> {
  if (!client.readDefinitions)
    throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
  const definitions = await client.readDefinitions([name]);
  const found = definitions.find((entry) => entry.fullName === name);
  if (!found) {
    const error = new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
    replaceExplanation(
      error,
      `The relationship ${name} is listed for its DMO, but the Metadata API returns no FieldSrcTrgtRelationship record of that name. Nothing was changed.`,
    );
    throw error;
  }
  return found;
}

/**
 * The record to send: the org's record with the file's values, without explicit nil values.
 * @param {Record<string, unknown>} current Org record.
 * @param {NativeRelationshipDocument['spec']} spec File values.
 * @returns {Record<string, unknown>} Whole record for `updateMetadata`.
 */
function updateDefinition(
  current: Record<string, unknown>,
  spec: NativeRelationshipDocument['spec'],
): Record<string, unknown> {
  const kept = Object.fromEntries(
    Object.entries(current).filter(([, value]) => !metadataNil(value)),
  );
  return {
    ...kept,
    ...(spec.label === undefined ? {} : { masterLabel: spec.label }),
    owner: spec.relationshipOwner,
    relationshipCardinality: spec.cardinality,
    sourceFieldName: `${spec.sourceObjectName}.${spec.sourceFieldName}`,
    targetFieldName: `${spec.targetObjectName}.${spec.targetFieldName}`,
  };
}

/**
 * The spec keys of the file whose values the listed relationship does not hold (label aside).
 * @param {ObservedRelationship} found Listed relationship.
 * @param {NativeRelationshipDocument['spec']} spec File values.
 * @returns {string[]} Differing keys.
 */
function listedChanges(
  found: ObservedRelationship,
  spec: NativeRelationshipDocument['spec'],
): string[] {
  const keys = [
    'sourceObjectName',
    'sourceFieldName',
    'targetObjectName',
    'targetFieldName',
    'cardinality',
    'relationshipOwner',
  ] as const;
  return keys.filter((key) => found[key] !== spec[key]);
}

/**
 * Plan a relationship deployment read-only. The org relationship is the one named like the file
 * (`identity.apiName`) in the source DMO's list, otherwise the one carrying the file's binding
 * (Salesforce generates the name on create). Absent is a create; present with every value of the
 * file (the label only when the file states one) is a no-op; otherwise an update of the whole
 * Metadata API record with the file's values. Salesforce decides which changes it accepts.
 * @param {unknown} value Portable relationship.
 * @param {Pick<RelationshipClient, 'list' | 'readDefinitions'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<NativeRelationshipDeployPlan>} Create, update or no-op.
 */
export async function preflightNativeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'readDefinitions'>,
  requestScope?: string,
): Promise<NativeRelationshipDeployPlan> {
  const desired = admit(value, requestScope);
  const inventory = await listNativeRelationships(desired.spec.sourceObjectName, client);
  const found =
    inventory.find((entry) => entry.name === desired.identity.apiName) ??
    findBinding(desired, inventory);
  if (!found) return { operation: 'create', desired };
  const changes = listedChanges(found, desired.spec);
  if (changes.length === 0 && desired.spec.label === undefined)
    return { operation: 'noop', desired, existing: found.name };
  const current = await readDefinition(found.name, client);
  if (desired.spec.label !== undefined && current.masterLabel !== desired.spec.label)
    changes.push('label');
  if (changes.length === 0) return { operation: 'noop', desired, existing: found.name };
  return {
    operation: 'update',
    desired,
    existing: found.name,
    changes,
    definition: updateDefinition(current, desired.spec),
  };
}

/**
 * Whether the relationship's Metadata API label is the file's (always true without one).
 * @param {string} name Relationship name.
 * @param {NativeRelationshipDocument} desired File.
 * @param {Pick<RelationshipClient, 'readDefinitions'>} client Relationship reader.
 * @returns {Promise<boolean>} Label confirmed.
 */
async function holdsLabel(
  name: string,
  desired: NativeRelationshipDocument,
  client: Pick<RelationshipClient, 'readDefinitions'>,
): Promise<boolean> {
  if (desired.spec.label === undefined) return true;
  const current = await readDefinition(name, client);
  return current.masterLabel === desired.spec.label;
}

/**
 * Send one update and read the relationship back by name until it holds the file.
 * @param {string} name Relationship name.
 * @param {Record<string, unknown>} definition Whole Metadata API record.
 * @param {NativeRelationshipDocument} desired File.
 * @param {Pick<RelationshipClient, 'list' | 'readDefinitions' | 'update'>} client Transport.
 */
async function updateAndConfirm(
  name: string,
  definition: Record<string, unknown>,
  desired: NativeRelationshipDocument,
  client: Pick<RelationshipClient, 'list' | 'readDefinitions' | 'update'>,
): Promise<void> {
  if (!client.update) throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
  await client.update(definition);
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const inventory = await listNativeRelationships(desired.spec.sourceObjectName, client);
    const found = inventory.find((entry) => entry.name === name);
    if (
      found !== undefined &&
      listedChanges(found, desired.spec).length === 0 &&
      (await holdsLabel(name, desired, client))
    )
      return;
  }
  const error = new NativeRelationshipError('RELATIONSHIP_PERSISTENCE_UNCONFIRMED');
  replaceExplanation(
    error,
    `Salesforce accepted the update of the relationship ${name}, but it did not read back with the file's values in time. Retrieve it before another attempt.`,
  );
  throw error;
}

/**
 * Deploy one relationship: no-op when the org holds the file; an update of the whole Metadata API
 * record when it differs; otherwise one POST, a readback of the source DMO's inventory until the
 * binding is ACTIVE with the requested cardinality and owner, and an update of the label when the
 * file states another one than Salesforce generated.
 * @param {unknown} value Portable relationship.
 * @param {RelationshipClient} client Relationship transport.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<{operation: 'create' | 'update' | 'noop'; apiName: string}>} Confirmed outcome
 * and org name.
 */
export async function deployNativeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'create' | 'readDefinitions' | 'update'>,
  requestScope?: string,
): Promise<{ operation: 'create' | 'update' | 'noop'; apiName: string }> {
  const plan = await preflightNativeRelationship(value, client, requestScope);
  if (plan.operation === 'noop') return { operation: 'noop', apiName: plan.existing! };
  if (plan.operation === 'update') {
    await updateAndConfirm(plan.existing!, plan.definition!, plan.desired, client);
    return { operation: 'update', apiName: plan.existing! };
  }
  await client.create(relationshipSpec(plan.desired.spec));
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const found = findBinding(
      plan.desired,
      await listNativeRelationships(plan.desired.spec.sourceObjectName, client),
    );
    // Only CREATING may still turn ACTIVE; any other status is terminal.
    if (found && found.status !== 'ACTIVE' && found.status !== 'CREATING') {
      const error = new NativeRelationshipError('RELATIONSHIP_PERSISTENCE_UNCONFIRMED');
      replaceExplanation(
        error,
        `The relationship ${found.name} was created but reads back with status ${found.status}, not ACTIVE. Inspect it before another attempt.`,
      );
      throw error;
    }
    if (
      found?.status === 'ACTIVE' &&
      found.cardinality === plan.desired.spec.cardinality &&
      found.relationshipOwner === plan.desired.spec.relationshipOwner
    ) {
      if (plan.desired.spec.label !== undefined)
        await labelCreated(found.name, plan.desired, client);
      return { operation: 'create', apiName: found.name };
    }
  }
  throw new NativeRelationshipError('RELATIONSHIP_PERSISTENCE_UNCONFIRMED');
}

/**
 * Set the file's label on a relationship just created: the create body has no label, and
 * Salesforce names the label like the relationship.
 * @param {string} name Created relationship.
 * @param {NativeRelationshipDocument} desired File with a label.
 * @param {Pick<RelationshipClient, 'list' | 'readDefinitions' | 'update'>} client Transport.
 */
async function labelCreated(
  name: string,
  desired: NativeRelationshipDocument,
  client: Pick<RelationshipClient, 'list' | 'readDefinitions' | 'update'>,
): Promise<void> {
  try {
    const current = await readDefinition(name, client);
    if (current.masterLabel === desired.spec.label) return;
    await updateAndConfirm(name, updateDefinition(current, desired.spec), desired, client);
  } catch (error) {
    if (error instanceof NativeRelationshipError)
      replaceExplanation(
        error,
        `The relationship ${name} was created, but its label was not set: ${explanationOf(error) ?? error.message}`,
      );
    throw error;
  }
}

/**
 * Read-only: find a relationship by name among the relationships of its source DMO, ignoring
 * letter case. No match is absence, as is the source DMO itself not existing (HTTP404
 * ITEM_NOT_FOUND on its relationship list); two matches are refused.
 * @param {string} sourceDmo Exact source DMO named in the selector.
 * @param {string} name Relationship name named in the selector.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<NativeRelationshipDocument | undefined>} The relationship as a document.
 */
export async function findNativeRelationshipByName(
  sourceDmo: string,
  name: string,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
): Promise<NativeRelationshipDocument | undefined> {
  if (!nativeRelationshipName.test(name))
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_NAME');
  let inventory: ObservedRelationship[];
  try {
    // Delete reads the inventory as retrieve does: unmodelled values never block it.
    inventory = await listNativeRelationships(sourceDmo, client, 'retrieve');
  } catch (error) {
    // A relationship cannot exist without its source DMO: only the list's exact HTTP404
    // ITEM_NOT_FOUND for that DMO is absence; any other error still blocks.
    const errors = getConnectDiagnostic(error)?.errors;
    if (
      error instanceof NativeRelationshipError &&
      error.code === 'RELATIONSHIP_HTTP_ERROR' &&
      error.status === 404 &&
      errors?.length === 1 &&
      errors[0].code === 'ITEM_NOT_FOUND'
    )
      return undefined;
    throw error;
  }
  const matches = inventory.filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (matches.length > 1) {
    const error = new NativeRelationshipError('AMBIGUOUS_RELATIONSHIP_TARGET');
    replaceExplanation(
      error,
      `${sourceDmo} has ${matches.length} relationships named ${name} when letter case is ignored, so the name does not resolve to one relationship. Nothing was deleted.`,
    );
    throw error;
  }
  const [found] = matches;
  if (found === undefined) return undefined;
  if (found.sourceObjectName !== sourceDmo) {
    const error = new NativeRelationshipError('RELATIONSHIP_TARGET_BINDING_MISMATCH');
    replaceExplanation(
      error,
      `The relationship ${found.name} has the source DMO ${found.sourceObjectName}, not ${sourceDmo}. Nothing was deleted; name its source DMO in the selector (relationship:${found.sourceObjectName}:${found.name}).`,
    );
    throw error;
  }
  return normalizeNativeRelationship(entryToWire(found), requestScope, 'retrieve');
}

/**
 * Qualify a relationship deletion read-only: the name must carry the document's binding.
 * @param {string} apiName Exact relationship name.
 * @param {unknown} value Local relationship file naming the source DMO.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<{present: boolean; document: NativeRelationshipDocument}>} Presence.
 */
export async function preflightDeleteNativeRelationship(
  apiName: string,
  value: unknown,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
): Promise<{ present: boolean; document: NativeRelationshipDocument }> {
  if (!nativeRelationshipName.test(apiName))
    throw new NativeRelationshipError('INVALID_RELATIONSHIP_NAME');
  // A delete reads the file and the inventory as retrieve writes them: values the plugin does
  // not model never block it; the name, data space and binding still must agree.
  const document = admit(value, requestScope, 'retrieve');
  if (document.identity.apiName !== apiName)
    throw new NativeRelationshipError('RELATIONSHIP_FILE_IDENTITY_MISMATCH');
  const inventory = await listNativeRelationships(
    document.spec.sourceObjectName,
    client,
    'retrieve',
  );
  const found = inventory.find((entry) => entry.name === apiName);
  if (!found) {
    // The binding may exist under another generated name, e.g. created by a later deploy.
    const other = findBinding(document, inventory);
    if (other) {
      const error = new NativeRelationshipError('RELATIONSHIP_NAME_MISMATCH');
      replaceExplanation(
        error,
        `No relationship is named ${apiName}, but the org relationship ${other.name} carries the file's binding. It was not deleted. Retrieve it (sf data360 retrieve -m relationship:${document.spec.sourceObjectName}) and delete it by that name (sf data360 delete -m relationship:${document.spec.sourceObjectName}:${other.name}).`,
      );
      throw error;
    }
    return { present: false, document };
  }
  if (!sameRelationshipBinding(found, document.spec))
    throw new NativeRelationshipError('RELATIONSHIP_TARGET_BINDING_MISMATCH');
  return { present: true, document };
}

/**
 * Delete one relationship by name with a single DELETE, then confirm its absence by listing.
 * @param {string} apiName Exact relationship name.
 * @param {unknown} value Local relationship file naming the source DMO.
 * @param {Pick<RelationshipClient, 'list' | 'remove'>} client Relationship transport.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<{outcome: 'deleted' | 'unchanged'}>} Confirmed absence.
 */
export async function deleteNativeRelationship(
  apiName: string,
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'remove'>,
  requestScope?: string,
): Promise<{ outcome: 'deleted' | 'unchanged' }> {
  const plan = await preflightDeleteNativeRelationship(apiName, value, client, requestScope);
  if (!plan.present) return { outcome: 'unchanged' };
  await client.remove(apiName);
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const inventory = await listNativeRelationships(
      plan.document.spec.sourceObjectName,
      client,
      'retrieve',
    );
    if (!inventory.some((entry) => entry.name === apiName)) return { outcome: 'deleted' };
  }
  throw new NativeRelationshipError('RELATIONSHIP_DELETION_UNCONFIRMED');
}
