import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { explainMismatch, replaceExplanation } from './operation-diagnostic.js';
import { NativeDmoError } from '../artifacts/native-dmo-document.js';
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
  previewDeleteNativeDmo,
  retrieveNativeDmo,
} from './native-dmo.js';
import type { NativeDmoSettle } from './native-dmo.js';
import { retrieveNativeMapping } from './native-mapping.js';
import { isNativeMappingDeletionVersion } from '../transport/api-version.js';
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
  mappings: Pick<MappingClient, 'apiVersion' | 'list' | 'get' | 'deleteField'>;
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
  step: 'unmap' | 'recheck' | 'remove' | 'readback';
  /** Pairs whose removal an independent read confirmed. */
  unmappedPairs: DmoFieldPair[];
  /** Pair whose DELETE was sent and is not confirmed yet. */
  pendingPair?: DmoFieldPair;
  /** Whether the destructive change was sent. */
  removalSent: boolean;
};

export type DmoFieldLocalFile = { kind: 'dmo' | 'mapping'; apiName: string; path: string };

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
 * Admit a field-level delete with reads only: the custom-only DMO guard, every named field
 * present, custom, not the primary key and not generated, and every mapping pair that targets a
 * named field identified by its observed selector on an ACTIVE mapping.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Exact, distinct field names ending in __c.
 * @param {DmoFieldDeleteClients} clients Target clients; only read here.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<DmoFieldDeletePlan>} Pairs to unmap per mapping and fields to remove.
 */
export async function planDmoFieldDelete(
  apiName: string,
  fields: string[],
  clients: DmoFieldDeleteClients,
  requestScope?: string,
): Promise<DmoFieldDeletePlan> {
  // Standard, namespaced and platform-generated DMOs are refused here (UNSUPPORTED_DMO_TARGET).
  const target = await previewDeleteNativeDmo(apiName, clients.dmo, requestScope);
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
      (field.creationType !== undefined && field.creationType !== 'Custom')
    )
      throw explained(
        new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE'),
        `Field delete refused for ${apiName}: ${name} is ${field.isPrimaryKey ? 'the primary-key field' : 'a generated or system field'} and is never removed.`,
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
  if (mappings.length > 0 && !isNativeMappingDeletionVersion(clients.mappings.apiVersion))
    throw explained(
      new NativeMappingError('MAPPING_UNMAP_VERSION_UNQUALIFIED'),
      `Field delete refused for ${apiName}: mapping pairs must be removed first, and pair removal is qualified for API 61.0 to 68.0 only.`,
    );
  return { apiName, dataSpace: target.identity.dataSpace, fields, mappings };
}

/**
 * Confirm one pair removal by reading the mapping: exactly the expected pairs, settled ACTIVE.
 * @param {NativeMappingDocument} expected Definition without the removed pair.
 * @param {Pick<MappingClient, 'get'>} client Mapping reader.
 * @param {string} [requestScope] Optional explicit data space.
 */
async function confirmUnmapped(
  expected: NativeMappingDocument,
  client: Pick<MappingClient, 'get'>,
  requestScope?: string,
): Promise<void> {
  const name = expected.identity.apiName;
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = (await client.get(name)) as Record<string, unknown> | null;
    const observed = normalizeNativeMapping(raw, requestScope);
    if (!isDeepStrictEqual(observed, expected))
      throw explainMismatch(
        new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED'),
        'field unmap readback',
        name,
        expected,
        observed,
      );
    if (raw?.status === 'ACTIVE') return;
    if (raw?.status !== 'CREATING') throw new NativeMappingError('MAPPING_TARGET_NOT_SETTLED');
  }
  throw new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
}

/**
 * Run the admitted writes in order, each once and never retried: every pair DELETE with its
 * readback, a fresh DMO read that must show every field unmapped, one Metadata API destructive
 * change for all fields, then a bounded readback that the fields are absent. The first failure
 * throws; `progress` then says what was already written.
 * @param {DmoFieldDeletePlan} plan Admitted plan.
 * @param {DmoFieldDeleteClients} clients Target clients.
 * @param {DmoFieldDeleteProgress} progress Mutated before and after every write.
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
  for (const mapping of plan.mappings) {
    let expected = mapping.document;
    for (const pair of mapping.pairs) {
      expected = structuredClone(expected);
      expected.spec.fieldMappings = expected.spec.fieldMappings.filter(
        (field) => field.developerName !== pair.developerName,
      );
      progress.step = 'unmap';
      progress.pendingPair = pair;
      await clients.mappings.deleteField(pair.mapping, pair.developerName);
      await confirmUnmapped(expected, clients.mappings, requestScope);
      progress.pendingPair = undefined;
      progress.unmappedPairs.push(pair);
    }
  }
  progress.step = 'recheck';
  const current = await previewDeleteNativeDmo(plan.apiName, clients.dmo, requestScope);
  const fresh = new Map(current.spec.fields.map((field) => [field.name, field]));
  const gone = plan.fields.filter((name) => !fresh.has(name));
  if (gone.length > 0)
    throw explained(
      new NativeDmoError('DMO_FIELD_NOT_FOUND'),
      `Field delete stopped for ${plan.apiName}: ${gone.join(', ')} no longer ${gone.length === 1 ? 'exists' : 'exist'} on the target.`,
    );
  const stillMapped = plan.fields.filter((name) => fresh.get(name)!.isMapped === true);
  if (stillMapped.length > 0)
    throw explained(
      new NativeDmoError('DMO_FIELD_REMOVAL_MAPPED'),
      `Field delete stopped for ${plan.apiName}: ${stillMapped.join(', ')} still ${stillMapped.length === 1 ? 'shows' : 'show'} as mapped, and a mapped field is never removed.`,
    );
  progress.step = 'remove';
  progress.removalSent = true;
  await clients.remover.removeFields!(plan.apiName, plan.fields);
  progress.step = 'readback';
  let last: NativeDmoDocument | undefined;
  for (let attempt = 0; attempt < settle.attempts; attempt++) {
    if (attempt > 0) await settle.sleep(settle.delayMs);
    const document = await retrieveNativeDmo(plan.apiName, clients.dmo, plan.dataSpace);
    last = document;
    if (!document.spec.fields.some((field) => plan.fields.includes(field.name))) return document;
  }
  const lingering = last?.spec.fields.find((field) => plan.fields.includes(field.name));
  throw explainMismatch(
    new NativeDmoError('DMO_PERSISTENCE_UNCONFIRMED'),
    'post-removal field absence readback',
    plan.apiName,
    undefined,
    lingering,
    `fields.${lingering?.name ?? 'unread'}`,
  );
}

/**
 * Name the canonical project files of the DMO and of every mapping that loses a pair.
 * @param {DmoFieldDeletePlan} plan Admitted plan.
 * @param {string} projectRoot Absolute project root.
 * @returns {DmoFieldLocalFile[]} DMO file first, then one file per mapping.
 */
export function dmoFieldLocalFiles(
  plan: DmoFieldDeletePlan,
  projectRoot: string,
): DmoFieldLocalFile[] {
  const root = path.resolve(projectRoot);
  return [
    {
      kind: 'dmo',
      apiName: plan.apiName,
      path: path.join(root, 'data360', 'dmo', `${plan.apiName}.dmo-meta.json`),
    },
    ...plan.mappings.map(({ document }) => ({
      kind: 'mapping' as const,
      apiName: document.identity.apiName,
      path: path.join(root, 'data360', 'mapping', `${document.identity.apiName}.mapping-meta.json`),
    })),
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
  for (const file of dmoFieldLocalFiles(plan, root)) {
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
              await retrieveNativeMapping(
                file.apiName,
                clients.mappings as MappingClient,
                requestScope,
              ),
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
