import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { explainMismatch, replaceExplanation } from './operation-diagnostic.js';
import {
  NativeDmoError,
  normalizeNativeDmo,
  unwrapNativeDmo,
} from '../artifacts/native-dmo-document.js';
import type { NativeDmoDocument } from '../artifacts/native-dmo-document.js';
import {
  NativeMappingError,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
} from '../artifacts/native-mapping-document.js';
import type { NativeMappingDocument } from '../artifacts/native-mapping-document.js';
import {
  defaultNativeDmoSettle,
  isGeneratedDmoField,
  previewFieldDeleteNativeDmo,
  retrieveNativeDmo,
} from './native-dmo.js';
import type { NativeDmoSettle } from './native-dmo.js';
import { retrieveNativeMapping } from './native-mapping.js';
import type { DmoClient } from '../transport/dmo-rest.js';
import type { MappingClient } from '../transport/mapping-rest.js';

/** One mapping pair whose target is a field selected for deletion. */
export type DmoFieldPair = {
  mapping: string;
  sourceFieldDeveloperName: string;
  targetFieldDeveloperName: string;
  /** Observed pair selector; the only identity the pair DELETE accepts. */
  developerName: string;
};

export type DmoFieldDeleteClients = {
  /** Single-attempt DMO reads. */
  dmo: Pick<DmoClient, 'get'>;
  /** Client with the Metadata API route for the destructive change. */
  remover: Pick<DmoClient, 'removeFields'>;
  mappings: Pick<MappingClient, 'list' | 'get'>;
};

export type DmoFieldDeletePlan = {
  apiName: string;
  dataSpace: string;
  fields: string[];
  /** Mappings that hold a pair for a selected field, in inventory order. */
  mappings: Array<{ document: NativeMappingDocument; pairs: DmoFieldPair[] }>;
};

/** Updated while the writes run, so a stop can report exactly what was already written. */
export type DmoFieldDeleteProgress = {
  step: 'recheck' | 'remove' | 'readback';
  /** Pairs Salesforce dropped with the fields, confirmed by an independent read. */
  unmappedPairs: DmoFieldPair[];
  /** Whether the destructive change was sent. */
  removalSent: boolean;
};

/** Reads that bracket a field removal. */
export type FieldRemovalReaders = {
  dmo: Pick<DmoClient, 'get'>;
  mappings: Pick<MappingClient, 'list' | 'get'>;
};

/** What a field removal must leave untouched, read right before the write. */
export type FieldRemovalSnapshot = {
  apiName: string;
  fields: string[];
  /** Raw DMO read. */
  dmo: Record<string, unknown>;
  /** Every mapping of the DMO, normalized, ordered by name. */
  mappings: NativeMappingDocument[];
  /** Pairs whose target is a removed field; Salesforce drops them with the field. */
  pairs: DmoFieldPair[];
};

export type DmoFieldLocalFile = {
  kind: 'dmo' | 'mapping';
  /** Org name of the DMO or mapping. */
  apiName: string;
  path: string;
  /** Name the local file uses for the mapping; differs from the org name for a hand-written file. */
  fileApiName?: string;
};

export type DmoFieldRefresh = {
  path: string;
  outcome: 'refreshed' | 'unchanged' | 'not-present' | 'failed';
  /** Refusal code of a failed refresh. */
  code?: string;
};

type Receipt = { path: string; outcome: 'retrieved' | 'unchanged' };

export type DmoFieldWriters = {
  dmo: (value: unknown, projectRoot: string, overwrite: boolean) => Promise<Receipt>;
  mapping: (value: unknown, projectRoot: string, overwrite: boolean) => Promise<Receipt>;
};

/**
 * Attach a complete plugin-built explanation to a refusal.
 * @template {Error} T
 * @param {T} error Typed refusal; its code is untouched.
 * @param {string} message Text built only from validated identifiers.
 * @returns {T} The same error.
 */
function explained<T extends Error>(error: T, message: string): T {
  replaceExplanation(error, message);
  return error;
}

/**
 * Refuse to remove a mapped field whose pair cannot be removed first.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Mapped fields without an identified pair.
 * @param {string} reason Why the pair is not identified.
 * @returns {NativeDmoError} DMO_FIELD_REMOVAL_MAPPED refusal.
 */
function mappedRefusal(apiName: string, fields: string[], reason: string): NativeDmoError {
  return explained(
    new NativeDmoError('DMO_FIELD_REMOVAL_MAPPED'),
    `Field removal refused for ${apiName}: ${fields.join(', ')} ${fields.length === 1 ? 'is' : 'are'} mapped, and ${reason}. Salesforce would drop the mapping pair together with the field, so a mapped field is never removed without first removing its pair.`,
  );
}

/**
 * Admit a field-level delete with reads only: a custom or standard DMO, every named field
 * present, custom, not the primary key and not generated, and every mapping pair that targets a
 * named field identified by its observed selector on an ACTIVE mapping.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Exact, distinct field names ending in __c.
 * @param {DmoFieldDeleteClients} clients Target clients; only read here.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<DmoFieldDeletePlan>} Pairs Salesforce drops with the fields, per mapping, and the fields.
 */
export async function planDmoFieldDelete(
  apiName: string,
  fields: string[],
  clients: DmoFieldDeleteClients,
  requestScope?: string,
): Promise<DmoFieldDeletePlan> {
  // Platform-generated DMOs and namespaced custom DMOs are refused here (UNSUPPORTED_DMO_TARGET).
  const admitted = await previewFieldDeleteNativeDmo(apiName, clients.dmo, requestScope);
  const target = admitted.document;
  const known = new Map(target.spec.fields.map((field) => [field.name, field]));
  const missing = fields.filter((name) => !known.has(name));
  if (missing.length > 0)
    throw explained(
      new NativeDmoError('DMO_FIELD_NOT_FOUND'),
      `Field delete refused for ${apiName}: ${missing.join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist on the target.`,
    );
  for (const name of fields) {
    const field = known.get(name)!;
    if (
      field.isPrimaryKey ||
      isGeneratedDmoField(field) ||
      // On a standard DMO only a field marked custom is removed; an unmarked one is not.
      (admitted.scope === 'standard'
        ? field.creationType !== 'Custom'
        : field.creationType !== undefined && field.creationType !== 'Custom')
    )
      throw explained(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        `Field delete refused for ${apiName}: ${name} is ${field.isPrimaryKey ? 'the primary-key field' : 'a standard, generated or system field'} and is never removed.`,
      );
  }
  if (!clients.remover.removeFields) throw new NativeDmoError('DMO_FIELD_REMOVAL_UNAVAILABLE');
  const mapped = fields.filter((name) => known.get(name)!.isMapped === true);
  let entries: Record<string, unknown>[] = [];
  try {
    entries = unwrapNativeMappingCollection(await clients.mappings.list(apiName), requestScope);
  } catch (error) {
    const none =
      error instanceof NativeMappingError &&
      error.code === 'MAPPING_HTTP_ERROR' &&
      error.status === 404;
    if (!none && mapped.length > 0)
      throw mappedRefusal(apiName, mapped, 'the mapping lookup failed');
  }
  const mappings: DmoFieldDeletePlan['mappings'] = [];
  for (const entry of entries) {
    const document = normalizeNativeMapping(entry, requestScope);
    if (document.spec.targetEntityDeveloperName !== apiName) continue;
    // A named field is custom, not a key and not generated, so its pairs are ordinary pairs:
    // the generated, key-qualifier and primary-key pairs of the mapping are never selected.
    const selected = document.spec.fieldMappings.filter((pair) =>
      fields.includes(pair.targetFieldDeveloperName),
    );
    if (selected.length === 0) continue;
    const name = document.identity.apiName;
    const pairs: DmoFieldPair[] = [];
    for (const pair of selected) {
      if (!pair.developerName) throw new NativeMappingError('MAPPING_SELECTOR_REQUIRED');
      pairs.push({
        mapping: name,
        sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
        targetFieldDeveloperName: pair.targetFieldDeveloperName,
        developerName: pair.developerName,
      });
    }
    // Bind the inventory entry to an independent detail read before planning a write on it.
    const detail = (await clients.mappings.get(name)) as Record<string, unknown> | null;
    if (entry.status !== 'ACTIVE' || detail?.status !== 'ACTIVE')
      throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
    if (!isDeepStrictEqual(normalizeNativeMapping(detail, requestScope), document))
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    mappings.push({ document, pairs });
  }
  const unlisted = mapped.filter(
    (name) =>
      !mappings.some(({ pairs }) => pairs.some((pair) => pair.targetFieldDeveloperName === name)),
  );
  if (unlisted.length > 0)
    throw mappedRefusal(
      apiName,
      unlisted,
      'no mapping targeting this DMO lists a pair for the field',
    );

  return { apiName, dataSpace: target.identity.dataSpace, fields, mappings };
}

const byName = (a: { identity: { apiName: string } }, b: { identity: { apiName: string } }) =>
  a.identity.apiName.localeCompare(b.identity.apiName);

// Runtime keys the DMO normalization ignores as well; they may move with any write.
const volatileKeys = new Set([
  'id',
  'recordId',
  'recordID',
  'createdDate',
  'lastModifiedDate',
  'isEnabled',
  'isEditable',
  'isSegmentable',
  'status',
]);

/**
 * Drop runtime keys before comparing two reads of the same DMO or field.
 * @param {Record<string, unknown>} value Raw object.
 * @returns {Record<string, unknown>} Comparable content.
 */
function stable(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !volatileKeys.has(key)));
}

/**
 * Read every mapping of a DMO with its status; a DMO without mappings answers with a typed 404.
 * @param {string} apiName Exact DMO full name.
 * @param {Pick<MappingClient, 'list'>} client Mapping reader.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<Array<{document: NativeMappingDocument, status: unknown}>>} Ordered by name.
 */
async function readDmoMappings(
  apiName: string,
  client: Pick<MappingClient, 'list'>,
  requestScope?: string,
): Promise<Array<{ document: NativeMappingDocument; status: unknown }>> {
  let entries: Record<string, unknown>[] = [];
  try {
    entries = unwrapNativeMappingCollection(await client.list(apiName), requestScope);
  } catch (error) {
    if (
      !(error instanceof NativeMappingError) ||
      error.code !== 'MAPPING_HTTP_ERROR' ||
      error.status !== 404
    )
      throw error;
  }
  return (
    entries
      .map((entry) => ({
        document: normalizeNativeMapping(entry, requestScope),
        status: entry.status,
      }))
      .filter((entry) => entry.document.spec.targetEntityDeveloperName === apiName)
      // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh mapped array within the ES2022 library target.
      .sort((a, b) => byName(a.document, b.document))
  );
}

/**
 * Snapshot, read-only and right before the write, what a field removal may change: the fields
 * must exist, every mapping of the DMO must be ACTIVE and match its detail read, and every mapped
 * field must have an identified pair, because Salesforce drops those pairs with the field.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Fields to remove.
 * @param {FieldRemovalReaders} readers Target readers.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<FieldRemovalSnapshot>} Expected state around the write.
 */
export async function snapshotFieldRemoval(
  apiName: string,
  fields: string[],
  readers: FieldRemovalReaders,
  requestScope?: string,
): Promise<FieldRemovalSnapshot> {
  const dmo = unwrapNativeDmo(await readers.dmo.get(apiName));
  const present = new Map(
    (dmo.fields as Array<Record<string, unknown>>).map((field) => [field.name, field]),
  );
  const missing = fields.filter((name) => !present.has(name));
  if (missing.length > 0)
    throw explained(
      new NativeDmoError('DMO_FIELD_NOT_FOUND'),
      `Field removal stopped for ${apiName}: ${missing.join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist on the target.`,
    );
  const read = await readDmoMappings(apiName, readers.mappings, requestScope);
  const pairs: DmoFieldPair[] = [];
  for (const { document, status } of read) {
    const name = document.identity.apiName;
    // Bind each inventory entry to an independent detail read before the write.
    const detail = (await readers.mappings.get(name)) as Record<string, unknown> | null;
    if (status !== 'ACTIVE' || detail?.status !== 'ACTIVE')
      throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
    if (!isDeepStrictEqual(normalizeNativeMapping(detail, requestScope), document))
      throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
    for (const pair of document.spec.fieldMappings)
      if (fields.includes(pair.targetFieldDeveloperName))
        pairs.push({
          mapping: name,
          sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
          targetFieldDeveloperName: pair.targetFieldDeveloperName,
          developerName: pair.developerName ?? '',
        });
  }
  const unlisted = fields.filter(
    (name) =>
      present.get(name)!.isMapped === true &&
      !pairs.some((pair) => pair.targetFieldDeveloperName === name),
  );
  if (unlisted.length > 0)
    throw mappedRefusal(
      apiName,
      unlisted,
      'no mapping targeting this DMO lists a pair for the field',
    );
  return { apiName, fields, dmo, mappings: read.map((entry) => entry.document), pairs };
}

/**
 * Send the one field removal, then confirm with bounded reads that the fields are gone, that
 * every mapping lost exactly its pairs for them (Salesforce drops those itself) and that the other
 * mappings, pairs, selectors, DMO properties and fields are unchanged. A pair or field still
 * present is waited for; any other difference stops with DMO_FIELD_REMOVAL_SIDE_EFFECT. Nothing is
 * retried.
 * @param {FieldRemovalSnapshot} snapshot State read right before the write.
 * @param {FieldRemovalReaders} readers Target readers.
 * @param {Function} remove The single write: one Metadata API destructive change.
 * @param {Function} [onSent] Called once the write is about to be sent, and once it returned.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @returns {Promise<{pairs: DmoFieldPair[], dmo: Record<string, unknown>}>} The pairs Salesforce dropped and the DMO read that confirmed it.
 */
export async function removeFieldsWithPairs(
  snapshot: FieldRemovalSnapshot,
  readers: FieldRemovalReaders,
  remove: () => Promise<void>,
  onSent: (step: 'remove' | 'readback') => void = () => {},
  requestScope?: string,
  settle: NativeDmoSettle = defaultNativeDmoSettle,
): Promise<{ pairs: DmoFieldPair[]; dmo: Record<string, unknown> }> {
  const { apiName, fields } = snapshot;
  const { fields: beforeFields, ...rawBeforeObject } = snapshot.dmo;
  const beforeObject = stable(rawBeforeObject);
  const keptFields = (beforeFields as Array<Record<string, unknown>>)
    .filter((field) => !fields.includes(field.name as string))
    .map((field) => stable(field));
  const expected = snapshot.mappings.map((document) => ({
    ...document,
    spec: {
      ...document.spec,
      fieldMappings: document.spec.fieldMappings.filter(
        (pair) => !fields.includes(pair.targetFieldDeveloperName),
      ),
    },
  }));
  const sideEffect = (check: string, want: unknown, got: unknown): NativeDmoError =>
    explainMismatch(
      new NativeDmoError('DMO_FIELD_REMOVAL_SIDE_EFFECT'),
      check,
      apiName,
      want,
      got,
      'state',
      'Salesforce changed more than the removed fields and their mapping pairs. Nothing was retried or rolled back; read the DMO and its mappings before any further action.',
    );
  onSent('remove');
  await remove();
  onSent('readback');
  let lingering: 'field' | 'pair' = 'field';
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    const dmo = unwrapNativeDmo(await readers.dmo.get(apiName));
    const { fields: afterFields, ...rawAfterObject } = dmo;
    const afterObject = stable(rawAfterObject);
    const after = (afterFields as Array<Record<string, unknown>>).map((field) => stable(field));
    if (after.some((field) => fields.includes(field.name as string))) {
      lingering = 'field';
      continue;
    }
    // The fields are gone; from here only the mappings can still be settling.
    lingering = 'pair';
    if (!isDeepStrictEqual(afterObject, beforeObject))
      throw sideEffect('field removal readback of the DMO properties', beforeObject, afterObject);
    if (!isDeepStrictEqual(after, keptFields))
      throw sideEffect('field removal readback of the other DMO fields', keptFields, after);
    const read = await readDmoMappings(apiName, readers.mappings, requestScope);
    const names = read.map((entry) => entry.document.identity.apiName);
    const wanted = expected.map((document) => document.identity.apiName);
    if (!isDeepStrictEqual(names, wanted))
      throw sideEffect('field removal readback of the mapping inventory', wanted, names);
    let settled = true;
    for (const [index, { document, status }] of read.entries()) {
      if (
        document.spec.fieldMappings.some((pair) => fields.includes(pair.targetFieldDeveloperName))
      ) {
        settled = false;
        continue;
      }
      if (!isDeepStrictEqual(document, expected[index]))
        throw sideEffect('field removal readback of the mapping pairs', expected[index], document);
      if (status === 'CREATING') settled = false;
      else if (status !== 'ACTIVE')
        throw sideEffect('field removal readback of the mapping status', 'ACTIVE', status);
    }
    if (settled) return { pairs: snapshot.pairs, dmo };
  }
  throw lingering === 'field'
    ? new NativeDmoError('DMO_PERSISTENCE_UNCONFIRMED')
    : new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
}

/** Pairs a deployment may let Salesforce drop: covered fields, held by selected mappings only. */
export type FieldRemovalCoverage = {
  /** Mapped fields the admission covered. */
  fields: string[];
  /** Source DLOs of the selected mapping files that target the DMO. */
  sources: string[];
};

/**
 * Snapshot, remove and confirm in one call; used by deploy for fields the file omits. The
 * snapshot must agree with the admission: a pair on an uncovered field, or held by a mapping the
 * deployment does not reconcile, refuses before the removal is sent.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Fields to remove.
 * @param {FieldRemovalReaders} readers Target readers.
 * @param {Function} remove The single Metadata API destructive change.
 * @param {FieldRemovalCoverage} coverage What the admission allowed to be dropped.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @returns {Promise<DmoFieldPair[]>} The pairs Salesforce dropped.
 */
/**
 * Read-only check before any write of a deployment that removes fields: the snapshot conditions
 * hold and every pair on a removed field is covered by the admission.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Fields to remove.
 * @param {FieldRemovalReaders} readers Target readers.
 * @param {FieldRemovalCoverage} coverage What the admission allowed to be dropped.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<FieldRemovalSnapshot>} The snapshot.
 */
export async function checkFieldRemoval(
  apiName: string,
  fields: string[],
  readers: FieldRemovalReaders,
  coverage: FieldRemovalCoverage,
  requestScope?: string,
): Promise<FieldRemovalSnapshot> {
  const snapshot = await snapshotFieldRemoval(apiName, fields, readers, requestScope);
  const sourceOf = new Map(
    snapshot.mappings.map((document) => [
      document.identity.apiName,
      document.spec.sourceEntityDeveloperName,
    ]),
  );
  const uncovered = snapshot.pairs.filter(
    (pair) =>
      !coverage.fields.includes(pair.targetFieldDeveloperName) ||
      !coverage.sources.includes(sourceOf.get(pair.mapping) ?? ''),
  );
  if (uncovered.length > 0)
    throw mappedRefusal(
      apiName,
      [...new Set(uncovered.map((pair) => pair.targetFieldDeveloperName))],
      `a mapping this deployment does not reconcile holds a pair for it (${[...new Set(uncovered.map((pair) => pair.mapping))].join(', ')}); the field was not removed`,
    );
  return snapshot;
}

/**
 * Snapshot, remove and confirm in one call; used by deploy for fields the file omits.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Fields to remove.
 * @param {FieldRemovalReaders} readers Target readers.
 * @param {Function} remove The single Metadata API destructive change.
 * @param {FieldRemovalCoverage} coverage What the admission allowed to be dropped.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @returns {Promise<DmoFieldPair[]>} The pairs Salesforce dropped.
 */
export async function removeFieldsChecked(
  apiName: string,
  fields: string[],
  readers: FieldRemovalReaders,
  remove: () => Promise<void>,
  coverage: FieldRemovalCoverage,
  requestScope?: string,
  settle: NativeDmoSettle = defaultNativeDmoSettle,
): Promise<DmoFieldPair[]> {
  const snapshot = await checkFieldRemoval(apiName, fields, readers, coverage, requestScope);
  const { pairs } = await removeFieldsWithPairs(
    snapshot,
    readers,
    remove,
    undefined,
    requestScope,
    settle,
  );
  return pairs;
}

/**
 * Run the admitted removal once, never retried: a fresh snapshot that must still match the plan,
 * one Metadata API destructive change for all fields (Salesforce drops their mapping pairs
 * itself), then bounded reads that confirm the fields and exactly those pairs are gone and nothing
 * else changed. The first failure throws; `progress` then says what was already written.
 * @param {DmoFieldDeletePlan} plan Admitted plan.
 * @param {DmoFieldDeleteClients} clients Target clients.
 * @param {DmoFieldDeleteProgress} progress Mutated before and after the write.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoSettle} [settle] Readback attempts and spacing.
 * @returns {Promise<NativeDmoDocument>} Definition read back without the fields.
 */
export async function executeDmoFieldDelete(
  plan: DmoFieldDeletePlan,
  clients: DmoFieldDeleteClients,
  progress: DmoFieldDeleteProgress,
  requestScope?: string,
  settle: NativeDmoSettle = defaultNativeDmoSettle,
): Promise<NativeDmoDocument> {
  progress.step = 'recheck';
  const snapshot = await snapshotFieldRemoval(plan.apiName, plan.fields, clients, requestScope);
  const planned = plan.mappings.flatMap(({ pairs }) => pairs);
  if (!isDeepStrictEqual(snapshot.pairs, planned))
    throw explainMismatch(
      new NativeMappingError('MAPPING_UNMAP_PLAN_CHANGED'),
      'field delete pre-write recheck of the mapping pairs',
      plan.apiName,
      planned,
      snapshot.pairs,
    );
  const confirmed = await removeFieldsWithPairs(
    snapshot,
    clients,
    async () => clients.remover.removeFields!(plan.apiName, plan.fields),
    (step) => {
      progress.step = step;
      if (step === 'remove') progress.removalSent = true;
    },
    requestScope,
    settle,
  );
  progress.unmappedPairs = confirmed.pairs;
  // The read that confirmed the removal is the result; a further read could only fail it.
  const document = normalizeNativeDmo(confirmed.dmo, plan.dataSpace);
  if (document.identity.apiName !== plan.apiName)
    throw new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH');
  return document;
}
/**
 * Find the local file of a mapping: the file named after the org mapping, otherwise the one file
 * whose binding (source DLO, target DMO, data space) matches, as a hand-written file is named
 * freely. Unreadable files are skipped; two matching files leave the canonical name.
 * @param {NativeMappingDocument} document Org mapping.
 * @param {string} root Absolute project root.
 * @returns {Promise<DmoFieldLocalFile>} The file to refresh, existing or not.
 */
async function mappingLocalFile(
  document: NativeMappingDocument,
  root: string,
): Promise<DmoFieldLocalFile> {
  const folder = path.join(root, 'data360', 'mapping');
  const canonical: DmoFieldLocalFile = {
    kind: 'mapping',
    apiName: document.identity.apiName,
    path: path.join(folder, `${document.identity.apiName}.mapping-meta.json`),
  };
  if (await localFileExists(canonical.path)) return canonical;
  let names: string[] = [];
  try {
    const entries = await readdir(folder);
    names = entries.filter((name) => name.endsWith('.mapping-meta.json'));
  } catch {
    return canonical;
  }
  const matches: DmoFieldLocalFile[] = [];
  for (const name of names) {
    const file = path.join(folder, name);
    try {
      const stat = await lstat(file);
      if (!stat.isFile()) continue;
      const local = JSON.parse(await readFile(file, 'utf8')) as {
        identity?: { apiName?: unknown; dataSpace?: unknown };
        spec?: { sourceEntityDeveloperName?: unknown; targetEntityDeveloperName?: unknown };
      };
      if (
        local.spec?.sourceEntityDeveloperName === document.spec.sourceEntityDeveloperName &&
        local.spec?.targetEntityDeveloperName === document.spec.targetEntityDeveloperName &&
        local.identity?.dataSpace === document.identity.dataSpace &&
        typeof local.identity?.apiName === 'string' &&
        name === `${local.identity.apiName}.mapping-meta.json`
      )
        matches.push({ ...canonical, path: file, fileApiName: local.identity.apiName });
    } catch {
      /* Not a readable mapping file; it is never refreshed. */
    }
  }
  return matches.length === 1 ? matches[0] : canonical;
}

/**
 * Name the project files of the DMO and of every mapping that loses a pair.
 * @param {DmoFieldDeletePlan} plan Admitted plan.
 * @param {string} projectRoot Absolute project root.
 * @returns {Promise<DmoFieldLocalFile[]>} DMO file first, then one file per mapping.
 */
export async function dmoFieldLocalFiles(
  plan: DmoFieldDeletePlan,
  projectRoot: string,
): Promise<DmoFieldLocalFile[]> {
  const root = path.resolve(projectRoot);
  const mappings = await Promise.all(
    plan.mappings.map(async ({ document }) => mappingLocalFile(document, root)),
  );
  return [
    {
      kind: 'dmo',
      apiName: plan.apiName,
      path: path.join(root, 'data360', 'dmo', `${plan.apiName}.dmo-meta.json`),
    },
    ...mappings,
  ];
}

/**
 * Report whether a project file exists, without reading or following it.
 * @param {string} file Exact path.
 * @returns {Promise<boolean>} False only for a confirmed absence.
 */
export async function localFileExists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Read a mapping for its local file, keeping the name a hand-written file uses.
 * @param {DmoFieldLocalFile} file Mapping file.
 * @param {MappingClient} client Mapping reader.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<NativeMappingDocument>} Current definition under the file's name.
 */
async function localMapping(
  file: DmoFieldLocalFile,
  client: MappingClient,
  requestScope?: string,
): Promise<NativeMappingDocument> {
  const document = await retrieveNativeMapping(file.apiName, client, requestScope);
  if (file.fileApiName) document.identity.apiName = file.fileApiName;
  return document;
}

/**
 * Refresh the project files that already exist from fresh reads of the target; a file that is not
 * present is never created. Every file is attempted; a failure is reported, never thrown.
 * @param {DmoFieldDeletePlan} plan Executed plan.
 * @param {string} projectRoot Absolute project root.
 * @param {DmoFieldDeleteClients} clients Target clients; only read here.
 * @param {DmoFieldWriters} writers Existing artifact writers.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<DmoFieldRefresh[]>} One outcome per canonical file.
 */
export async function refreshDmoFieldFiles(
  plan: DmoFieldDeletePlan,
  projectRoot: string,
  clients: DmoFieldDeleteClients,
  writers: DmoFieldWriters,
  requestScope?: string,
): Promise<DmoFieldRefresh[]> {
  const root = path.resolve(projectRoot);
  const results: DmoFieldRefresh[] = [];
  for (const file of await dmoFieldLocalFiles(plan, root)) {
    try {
      if (!(await localFileExists(file.path))) {
        results.push({ path: file.path, outcome: 'not-present' });
        continue;
      }
      const receipt =
        file.kind === 'dmo'
          ? await writers.dmo(
              await retrieveNativeDmo(file.apiName, clients.dmo, plan.dataSpace),
              root,
              true,
            )
          : await writers.mapping(
              await localMapping(file, clients.mappings as MappingClient, requestScope),
              root,
              true,
            );
      results.push({
        path: file.path,
        outcome: receipt.outcome === 'unchanged' ? 'unchanged' : 'refreshed',
      });
    } catch (error) {
      results.push({
        path: file.path,
        outcome: 'failed',
        code:
          error instanceof NativeDmoError || error instanceof NativeMappingError
            ? error.code
            : 'OUTPUT_FAILED',
      });
    }
  }
  return results;
}
