import { paceReadback, readbackPace } from './readback-pace.js';
import { replaceExplanation } from './operation-diagnostic.js';
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

/** Upper bound of pages read for one DMO; far above any observed inventory. */
const maximumPages = 100;

/**
 * Read every relationship the DMO is source or target of, paging by offset. `nextPageUrl` is not
 * followed: Salesforce repeats the current offset in it. The collected count must equal the
 * reported totalSize and names must be unique, otherwise the inventory is refused as incomplete.
 * @param {string} dmoName Exact DMO name.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @returns {Promise<ObservedRelationship[]>} Complete, verified inventory (empty for 204).
 */
export async function listNativeRelationships(
  dmoName: string,
  client: Pick<RelationshipClient, 'list'>,
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
    collected.push(...relationships.map((entry) => observeNativeRelationship(entry)));
    if (relationships.length === 0 || collected.length >= total) break;
  }
  const names = new Set(collected.map((entry) => entry.name));
  if (collected.length !== total || names.size !== collected.length)
    throw new NativeRelationshipError('RELATIONSHIP_INVENTORY_INCOMPLETE');
  return collected;
}

/**
 * Retrieve every relationship whose source object is the DMO, as portable documents.
 * @param {string} dmoName Exact source DMO.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope; omission is the default data space.
 * @returns {Promise<NativeRelationshipDocument[]>} Documents ordered by name.
 */
export async function retrieveNativeRelationships(
  dmoName: string,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
): Promise<NativeRelationshipDocument[]> {
  const inventory = await listNativeRelationships(dmoName, client);
  const documents = inventory
    .filter((entry) => entry.sourceObjectName === dmoName)
    .map((entry) => normalizeNativeRelationship(entryToWire(entry), requestScope));
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh mapped array within the ES2022 library target.
  return documents.sort((a, b) => a.identity.apiName.localeCompare(b.identity.apiName));
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
 * @returns {NativeRelationshipDocument} Checked document.
 */
function admit(value: unknown, requestScope?: string): NativeRelationshipDocument {
  const document = validateNativeRelationshipDocument(value);
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
  operation: 'create' | 'noop';
  desired: NativeRelationshipDocument;
  /** Name of the org relationship carrying the binding, when present. */
  existing?: string;
};

/**
 * Plan a relationship deployment read-only. The org relationship is matched by its binding, not by
 * the generated name; a different cardinality or owner is refused, as no update route exists.
 * @param {unknown} value Portable relationship.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<NativeRelationshipDeployPlan>} Create or no-op.
 */
export async function preflightNativeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
): Promise<NativeRelationshipDeployPlan> {
  const desired = admit(value, requestScope);
  const found = findBinding(
    desired,
    await listNativeRelationships(desired.spec.sourceObjectName, client),
  );
  if (!found) return { operation: 'create', desired };
  if (
    found.cardinality !== desired.spec.cardinality ||
    found.relationshipOwner !== desired.spec.relationshipOwner
  ) {
    const error = new NativeRelationshipError('RELATIONSHIP_CHANGE_UNSUPPORTED');
    replaceExplanation(
      error,
      `The relationship ${found.name} with this binding exists with cardinality ${found.cardinality} and owner ${found.relationshipOwner}; the file asks for ${desired.spec.cardinality} and ${desired.spec.relationshipOwner}. Salesforce has no route to change a relationship: delete it (sf data360 delete --metadata relationship:${found.sourceObjectName}:${found.name}) and deploy the file again.`,
    );
    throw error;
  }
  return { operation: 'noop', desired, existing: found.name };
}

/**
 * Deploy one relationship: no-op when present, otherwise one POST and a readback of the source
 * DMO's inventory until the binding is ACTIVE with the requested cardinality and owner.
 * @param {unknown} value Portable relationship.
 * @param {RelationshipClient} client Relationship transport.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<{operation: 'create' | 'noop'; apiName: string}>} Confirmed outcome and org name.
 */
export async function deployNativeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'create'>,
  requestScope?: string,
): Promise<{ operation: 'create' | 'noop'; apiName: string }> {
  const plan = await preflightNativeRelationship(value, client, requestScope);
  if (plan.operation === 'noop') return { operation: 'noop', apiName: plan.existing! };
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
    )
      return { operation: 'create', apiName: found.name };
  }
  throw new NativeRelationshipError('RELATIONSHIP_PERSISTENCE_UNCONFIRMED');
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
    inventory = await listNativeRelationships(sourceDmo, client);
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
  return normalizeNativeRelationship(entryToWire(found), requestScope);
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
  const document = admit(value, requestScope);
  if (document.identity.apiName !== apiName)
    throw new NativeRelationshipError('RELATIONSHIP_FILE_IDENTITY_MISMATCH');
  const inventory = await listNativeRelationships(document.spec.sourceObjectName, client);
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
    const inventory = await listNativeRelationships(plan.document.spec.sourceObjectName, client);
    if (!inventory.some((entry) => entry.name === apiName)) return { outcome: 'deleted' };
  }
  throw new NativeRelationshipError('RELATIONSHIP_DELETION_UNCONFIRMED');
}
