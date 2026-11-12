import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { graphRecord, graphRequire, graphText } from '../artifacts/data-graph-document.js';
import {
  nativeGraphFingerprint,
  nativeDataGraphDocumentFromResponse,
  buildNativeDataGraphUpdateRequest,
  observeNativeDataGraph,
  validateNativeDataGraphDocument,
} from '../artifacts/native-data-graph-document.js';
import type {
  NativeDataGraphObservation,
  NativeDataGraphDocument,
} from '../artifacts/native-data-graph-document.js';
import type { DataGraphClient } from '../transport/data-graph-rest.js';

export type NativeGraphRead = { status: number; body: unknown };
/** Internal trusted readers must bind every response to the supplied exact name/default scope. */
export type NativeGraphContext = {
  check: () => void;
  orgId: string;
  get: (name: string) => Promise<NativeGraphRead>;
  metadata: (name: string) => Promise<NativeGraphRead>;
  inventory: () => Promise<NativeGraphRead>;
  query: (name: string) => Promise<NativeGraphRead>;
  /** Read the named primary object (DMO) detail and its Metadata record. */
  root: (name: string) => Promise<{ detail: unknown; metadata: unknown }>;
  dataSpace?: () => Promise<NativeGraphRead>;
};
export type NativeGraphAcquisition =
  | { state: 'present'; observation: NativeDataGraphObservation }
  | { state: 'absent'; proof: 'item+metadata+inventory+soql' }
  | { state: 'pending' }
  | { state: 'unknown' };

/**
 * Canonicalize validated keyed root inventories without discarding field properties.
 * @param {Map<string, Record<string, unknown>>} values Unique field records indexed by name.
 * @returns {Record<string, unknown>[]} Name-ordered records.
 */
function orderedRootFields(
  values: Map<string, Record<string, unknown>>,
): Record<string, unknown>[] {
  return (
    [...values.entries()]
      // eslint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted; entries is newly allocated.
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, field]) => field)
  );
}

/**
 * Independently bind the graph's enabled primary object in the default data space. The root is
 * the document's `primaryObjectName` (standard or unified); its fields are not restricted.
 * @param {NativeGraphContext} context Scope-checked readers.
 * @param {string} rootName The document's primary object.
 * @returns {Promise<{id: string; fingerprint: string}>} Detached root binding.
 */
export async function bindNativeGraphRoot(
  context: NativeGraphContext,
  rootName: string,
): Promise<{ id: string; fingerprint: string }> {
  context.check();
  graphText(rootName);
  const acquired = structuredClone(await context.root(rootName));
  context.check();
  const detail = graphRecord(acquired.detail);
  graphRequire(Array.isArray(acquired.metadata) && acquired.metadata.length === 1);
  const metadata = graphRecord(acquired.metadata[0]);
  const attributes = graphRecord(metadata.mktDataModelAttributes);
  graphText(detail.creationType);
  graphRequire(
    detail.name === rootName &&
      detail.dataSpaceName === 'default' &&
      detail.isEnabled === true &&
      metadata.fullName === detail.name &&
      attributes.dataSpaceName === 'default' &&
      attributes.creationType === detail.creationType,
  );
  graphText(detail.id);
  graphRequire(Array.isArray(detail.fields) && Array.isArray(metadata.fields));
  const index = (values: unknown[], key: string): Map<string, Record<string, unknown>> => {
    const map = new Map<string, Record<string, unknown>>();
    for (const value of values) {
      const field = graphRecord(value);
      graphText(field[key]);
      graphRequire(!map.has(field[key]));
      map.set(field[key], field);
    }
    return map;
  };
  // These field inventories are keyed sets, not ordered projections. Preserve every property.
  detail.fields = orderedRootFields(index(detail.fields, 'name'));
  metadata.fields = orderedRootFields(index(metadata.fields, 'fullName'));
  return { id: detail.id, fingerprint: nativeGraphFingerprint(acquired) };
}

/**
 * Detect a ready item whose server-generated names are not populated yet.
 * @param {unknown} body Untrusted item body.
 * @returns {boolean} True while generation is visibly incomplete.
 */
function nativeGraphStillGenerating(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const raw = body as Record<string, unknown>;
  if (raw.status !== 'ready') return false;
  const source = raw.sourceObject as Record<string, unknown> | undefined;
  return [
    raw.idDmoName,
    raw.valuesDmoName,
    raw.dayZeroMappingDevName,
    raw.dayZeroTransformDevName,
    source?.fragmentDMOName,
  ].some((value) => typeof value !== 'string' || !value.trim());
}

/**
 * Read the exact graph metadata build status after the item itself reads ready.
 * @param {NativeGraphContext} context Deadline-guarded readers.
 * @param {string} name Exact graph name.
 * @returns {Promise<string>} Metadata status, for example Inprogress or Ready.
 */
async function nativeGraphMetadataStatus(
  context: NativeGraphContext,
  name: string,
): Promise<string> {
  const metadata = await context.metadata(name);
  context.check();
  if (metadata.status !== 200)
    throw retainConnectDiagnostic(
      new Error('Native Graph metadata unavailable'),
      getConnectDiagnostic(metadata),
    );
  const entries = graphRecord(metadata.body).dataGraphMetadata;
  graphRequire(Array.isArray(entries));
  const matches = entries
    .map((entry) => graphRecord(entry))
    .filter((entry) => entry.developerName === name);
  // During the build the entry was recorded live to vanish briefly; that is still building.
  if (matches.length === 0) return 'Missing';
  graphRequire(matches.length === 1 && matches[0].dataspaceName === 'default');
  graphText(matches[0].status);
  return matches[0].status;
}

/**
 * Take the node types the API assigned on create. A recorded API68 create sent `standard` for a
 * unified root and the echo read `derived` (2026-11-12); later reads keep the assigned type, so
 * the created graph is compared with the assigned types, matched by node path.
 * @param {NativeDataGraphDocument} document Exact native intent.
 * @param {unknown} echoed Untrusted echoed root node.
 * @returns {NativeDataGraphDocument} Detached intent carrying the assigned node types.
 */
function nativeGraphAssignedTypes(
  document: NativeDataGraphDocument,
  echoed: unknown,
): NativeDataGraphDocument {
  const result = validateNativeDataGraphDocument(document);
  const visit = (node: Record<string, unknown>, found: unknown): void => {
    const echo = graphRecord(found);
    graphText(echo.type);
    node.type = echo.type;
    const children = echo.relatedObjects;
    graphRequire(Array.isArray(children));
    for (const child of node.relatedObjects as Record<string, unknown>[])
      visit(
        child,
        children.find((entry: unknown) => graphRecord(entry).jsonPath === child.jsonPath),
      );
  };
  visit(graphRecord(result.definition.sourceObject), echoed);
  return validateNativeDataGraphDocument(result);
}

/**
 * Take the identity of a create echo. A complete echo is fully observed; an echo that reads
 * ready before its generated names exist (still building) yields only its raw identity.
 * @param {unknown} response Untrusted create response.
 * @param {NativeDataGraphDocument} authored Exact native intent.
 * @returns {object} Identity fields the settled graph must match, and the intent to settle with.
 */
function nativeGraphCreateEcho(
  response: unknown,
  authored: NativeDataGraphDocument,
): {
  id: string;
  createdDate: string;
  source: Record<string, unknown>;
  document: NativeDataGraphDocument;
} {
  const raw = graphRecord(response);
  const document = nativeGraphAssignedTypes(authored, raw.sourceObject);
  if (!nativeGraphStillGenerating(response)) {
    const returned = observeNativeDataGraph(response, document);
    return {
      id: returned.id,
      createdDate: returned.createdDate,
      source: graphRecord(returned.target.sourceObject),
      document,
    };
  }
  graphText(raw.id);
  graphText(raw.createdDate);
  graphRequire(
    raw.name === document.definition.name && Number.isFinite(Date.parse(raw.createdDate)),
  );
  return {
    id: raw.id,
    createdDate: new Date(raw.createdDate).toISOString(),
    source: graphRecord(raw.sourceObject),
    document,
  };
}

/**
 * Acquire exact native state. HTTP400 alone is never absence evidence; stale metadata is pending.
 * @param {NativeGraphContext} context Independent exact readers, not mutation responses.
 * @param {NativeDataGraphDocument} document Native intent.
 * @param {boolean} [baseline] Acquire target independent of desired equality.
 * @returns {Promise<NativeGraphAcquisition>} Correlated state or conservative uncertainty.
 */
export async function acquireNativeDataGraph(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
  baseline = false,
): Promise<NativeGraphAcquisition> {
  let diagnostic: ConnectDiagnostic | undefined;
  try {
    const expected = validateNativeDataGraphDocument(document);
    const name = expected.definition.name as string;
    context.check();
    const item = await context.get(name);
    diagnostic = getConnectDiagnostic(item);
    context.check();
    if (item.status === 200) {
      // A just-created graph can read ready ~30s before its generated DMO, mapping and
      // transform names exist (recorded live at API68); it is still being built, not unknown.
      if (nativeGraphStillGenerating(item.body)) return { state: 'pending' };
      const admitted = baseline ? nativeDataGraphDocumentFromResponse(item.body) : expected;
      graphRequire(admitted.definition.name === name);
      return { state: 'present', observation: observeNativeDataGraph(item.body, admitted) };
    }
    graphRequire(
      item.status === 400 &&
        isDeepStrictEqual(item.body, [
          { errorCode: 'INTERNAL_ERROR', message: `Data Graph not found with name ${name}` },
        ]),
    );
    const exact = await context.metadata(name);
    diagnostic = getConnectDiagnostic(exact);
    context.check();
    if (exact.status === 200) return { state: 'pending' };
    graphRequire(exact.status === 404 && Array.isArray(exact.body) && exact.body.length === 1);
    const error = graphRecord(exact.body[0]);
    graphRequire(error.errorCode === 'INTERNAL_ERROR' && typeof error.message === 'string');
    const nested = graphRecord(JSON.parse(error.message));
    graphRequire(
      nested.error === '404 NOT_FOUND' &&
        nested.internalErrorCode === 'METADATA_ERROR_ENTITY_NOTFOUND' &&
        typeof nested.message === 'string' &&
        nested.message.startsWith(`NOT_FOUND: DaoEntity with daoId = ${name} and tenantId = `),
    );
    const inventory = await context.inventory();
    diagnostic = getConnectDiagnostic(inventory);
    context.check();
    const entries = graphRecord(inventory.body).dataGraphMetadata;
    graphRequire(inventory.status === 200 && Array.isArray(entries));
    const names = new Set<string>();
    for (const value of entries) {
      const entry = graphRecord(value);
      graphText(entry.developerName);
      graphRequire(entry.dataspaceName === 'default' && !names.has(entry.developerName));
      names.add(entry.developerName);
    }
    const query = await context.query(name);
    diagnostic = getConnectDiagnostic(query);
    context.check();
    const rows = graphRecord(query.body);
    graphRequire(
      query.status === 200 &&
        rows.done === true &&
        Array.isArray(rows.records) &&
        rows.totalSize === rows.records.length &&
        rows.records.length <= 1,
    );
    if (names.has(name) || rows.records.length > 0) return { state: 'pending' };
    return { state: 'absent', proof: 'item+metadata+inventory+soql' };
  } catch (error) {
    return retainConnectDiagnostic({ state: 'unknown' }, getConnectDiagnostic(error) ?? diagnostic);
  }
}

/**
 * Settle using bounded GET-only reads; no write is retried on any outcome.
 * @param {NativeGraphContext} context Readers sharing one operation deadline.
 * @param {NativeDataGraphDocument} document Exact native intent.
 * @param {'ready' | 'absent'} goal Required independent state.
 * @param {Function} pause Injectable read-only polling delay.
 * @returns {Promise<NativeGraphAcquisition>} Settled evidence or unknown.
 */
export async function settleNativeDataGraph(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
  goal: 'ready' | 'absent',
  pause = delay,
): Promise<NativeGraphAcquisition> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = (): void => {
    graphRequire(!expired);
    context.check();
  };
  const work = async (): Promise<NativeGraphAcquisition> => {
    graphRequire(goal === 'ready' || goal === 'absent');
    for (let poll = 0; poll < 12; poll++) {
      check();
      const result = await acquireNativeDataGraph({ ...context, check }, document);
      check();
      if (result.state === 'unknown') return result;
      if (goal === 'absent' && result.state === 'absent') return result;
      if (result.state === 'present' && result.observation.status === 'ready' && goal === 'ready')
        return result;
      if (goal === 'ready' && result.state === 'absent') return { state: 'unknown' };
      if (poll < 11) await pause(1000);
    }
    return { state: 'unknown' };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<NativeGraphAcquisition>((resolve) => {
        timer = setTimeout(() => resolve({ state: 'unknown' }), 120_000);
      }),
    ]);
  } catch (error) {
    return retainConnectDiagnostic({ state: 'unknown' }, getConnectDiagnostic(error));
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}

/**
 * Wait for a created graph to finish building, bounded only by the invocation deadline.
 * While the item reads creating, still lacks its generated names, or its metadata still shows
 * it in progress, the graph is being built: keep reading with the documented pacing (20-second
 * waits, never past the deadline) instead of reporting an unknown result early. GET-only; the
 * create is never replayed.
 * @param {NativeGraphContext} context Deadline-guarded readers.
 * @param {NativeDataGraphDocument} document Exact native intent.
 * @param {object} timing Invocation clock, deadline, delay and progress sink.
 * @param {Function} timing.now Invocation clock.
 * @param {number} timing.started Invocation start time.
 * @param {number} timing.end Invocation deadline (--wait-timeout).
 * @param {Function} timing.pause Read-only delay.
 * @param {Function} timing.progress Stderr-only progress sink.
 * @returns {Promise<NativeGraphAcquisition>} Ready evidence or unknown.
 */
export async function settleNativeDataGraphCreation(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
  timing: {
    now: () => number;
    started: number;
    end: number;
    pause: (milliseconds: number) => Promise<unknown>;
    progress: (message: string) => void;
  },
): Promise<NativeGraphAcquisition> {
  try {
    for (;;) {
      context.check();
      const result = await acquireNativeDataGraph(context, document);
      if (result.state === 'unknown') return result;
      // Right after a create, absence is not a building state: report it as unknown.
      if (result.state === 'absent') return { state: 'unknown' };
      let stage = result.state === 'present' ? result.observation.status : 'build in progress';
      // Deleting (or any non-build status) is terminal for a create: stop at once.
      if (
        result.state === 'present' &&
        ![
          'creating',
          'processing',
          'editing',
          'editing_no_version_update',
          'editing_post_sync',
          'ready',
        ].includes(result.observation.status)
      )
        return { state: 'unknown' };
      if (result.state === 'present' && result.observation.status === 'ready') {
        // The item can read ready while its metadata is still Inprogress (recorded ~3.5 min)
        // or briefly absent; any other metadata status (e.g. Failed) is terminal.
        const metadata = await nativeGraphMetadataStatus(
          context,
          document.definition.name as string,
        );
        if (metadata === 'Ready') return result;
        if (metadata !== 'Inprogress' && metadata !== 'Missing') return { state: 'unknown' };
        stage = `ready, metadata ${metadata}`;
      }
      const remaining = timing.end - timing.now();
      if (remaining <= 0) return { state: 'unknown' };
      const wait = Math.min(20_000, remaining);
      timing.progress(
        `Data Graph ${stage}; elapsed ${Math.floor((timing.now() - timing.started) / 1000)}s; next wait ${wait / 1000}s.`,
      );
      await timing.pause(wait);
    }
  } catch (error) {
    return retainConnectDiagnostic({ state: 'unknown' }, getConnectDiagnostic(error));
  }
}

/**
 * Wait after a graph DELETE until the graph reads absent on every route. The item disappears
 * first; the by-name metadata entry stayed about 5 minutes longer (recorded live at API68,
 * 2026-11-12). GET-only, paced, never past the deadline, never re-sends the DELETE.
 * @param {NativeGraphContext} context Deadline-guarded readers.
 * @param {NativeDataGraphDocument} document Native intent of the deleted graph.
 * @param {object} timing Invocation clock, deadline, pacing and stderr progress.
 * @param {Function} timing.now Clock.
 * @param {number} timing.started Invocation start.
 * @param {number} timing.end Invocation deadline.
 * @param {Function} timing.pause Read-only delay.
 * @param {Function} timing.progress Stderr-only progress sink.
 * @returns {Promise<NativeGraphAcquisition>} Absence or unknown.
 */
export async function settleNativeDataGraphDeletion(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
  timing: {
    now: () => number;
    started: number;
    end: number;
    pause: (milliseconds: number) => Promise<unknown>;
    progress: (message: string) => void;
  },
): Promise<NativeGraphAcquisition> {
  try {
    // Only the recorded removal states (item gone with metadata left, or an item reading
    // deleting) justify the long wait; any other read keeps the short bound of 12 reads.
    let other = 0;
    for (let first = true; ; first = false) {
      context.check();
      const result = await acquireNativeDataGraph(context, document);
      if (result.state === 'unknown' || result.state === 'absent') return result;
      if (result.state === 'present' && result.observation.status !== 'deleting' && ++other >= 12)
        return { state: 'unknown' };
      const remaining = timing.end - timing.now();
      if (remaining <= 0) return { state: 'unknown' };
      const wait = Math.min(first ? 5000 : 20_000, remaining);
      const stage = result.state === 'present' ? result.observation.status : 'removal in progress';
      timing.progress(
        `Data Graph ${stage}; elapsed ${Math.floor((timing.now() - timing.started) / 1000)}s; next wait ${wait / 1000}s.`,
      );
      await timing.pause(wait);
    }
  } catch (error) {
    return retainConnectDiagnostic({ state: 'unknown' }, getConnectDiagnostic(error));
  }
}

/**
 * Resolve the authoritative default dataspace once per invocation.
 * @param {NativeGraphContext} context Bound target readers.
 * @returns {Promise<string>} Exact active default record identity.
 */
export async function bindNativeGraphDataSpace(context: NativeGraphContext): Promise<string> {
  context.check();
  graphRequire(typeof context.dataSpace === 'function');
  const read = await context.dataSpace();
  context.check();
  try {
    const body = graphRecord(read.body);
    graphRequire(
      read.status === 200 &&
        body.done === true &&
        body.totalSize === 1 &&
        Array.isArray(body.records) &&
        body.records.length === 1,
    );
    const row = graphRecord(body.records[0]);
    graphText(row.Id);
    graphRequire(
      row.DataSpaceApiName === 'default' && row.Status === 'ACTIVE' && row.IsDeleted === false,
    );
    return row.Id;
  } catch (error) {
    if (error instanceof Error) retainConnectDiagnostic(error, getConnectDiagnostic(read));
    throw error;
  }
}

/** Independently correlated readiness; metadata version/tree may legitimately lag. */
export type NativeGraphReadiness = {
  observation: NativeDataGraphObservation;
  ready: boolean;
  status: string;
};

/**
 * Read one fresh item/metadata/SOQL tuple without unrelated reads or write replay.
 * @param {NativeGraphContext} context Bound target readers.
 * @param {NativeDataGraphDocument} document Exact API name.
 * @param {string} dataSpaceId Invocation-resolved default identity.
 * @returns {Promise<NativeGraphReadiness>} Detached independent tuple.
 */
export async function readNativeGraphReadiness(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
  dataSpaceId: string,
): Promise<NativeGraphReadiness> {
  const name = document.definition.name as string;
  context.check();
  const item = await context.get(name);
  context.check();
  if (item.status !== 200)
    throw retainConnectDiagnostic(
      new Error('Native Graph item unavailable'),
      getConnectDiagnostic(item),
    );
  const actual = nativeDataGraphDocumentFromResponse(item.body);
  graphRequire(actual.definition.name === name);
  const observation = observeNativeDataGraph(item.body, actual);
  const metadata = await context.metadata(name);
  context.check();
  if (metadata.status !== 200)
    throw retainConnectDiagnostic(
      new Error('Native Graph metadata unavailable'),
      getConnectDiagnostic(metadata),
    );
  const entries = graphRecord(metadata.body).dataGraphMetadata;
  graphRequire(Array.isArray(entries) && entries.length === 1);
  const entry = graphRecord(entries[0]);
  graphRequire(
    entry.developerName === name &&
      entry.dataspaceName === 'default' &&
      entry.primaryObjectName === actual.definition.primaryObjectName,
  );
  graphText(entry.status);
  const query = await context.query(name);
  context.check();
  if (query.status !== 200)
    throw retainConnectDiagnostic(
      new Error('Native Graph query unavailable'),
      getConnectDiagnostic(query),
    );
  const rows = graphRecord(query.body);
  graphRequire(
    query.status === 200 &&
      rows.done === true &&
      rows.totalSize === 1 &&
      Array.isArray(rows.records) &&
      rows.records.length === 1,
  );
  const row = graphRecord(rows.records[0]);
  graphRequire(
    row.Id === observation.id &&
      row.DataGraphApiName === name &&
      row.Version === observation.target.version &&
      row.DataSpaceId === dataSpaceId,
  );
  graphText(row.Status);
  graphText(row.LastRunStatus);
  return {
    observation,
    ready:
      observation.status === 'ready' &&
      entry.status === 'Ready' &&
      row.Status === 'READY' &&
      row.LastRunStatus === 'ACTIVE',
    status: `${observation.status}/${entry.status}/${row.Status}/${row.LastRunStatus}`,
  };
}

/**
 * Apply one authored change to the bound target (see buildNativeDataGraphUpdateRequest), then
 * reconcile solely with paced GETs. An equal definition is unchanged with zero writes.
 * @param {NativeGraphContext} context Invocation/deadline guarded readers.
 * @param {DataGraphClient} client Single-attempt guarded writer.
 * @param {NativeDataGraphDocument} document Authored delta.
 * @param {NativeDataGraphObservation} baseline Initial independently acquired target.
 * @param {object} options Shared invocation controls.
 * @param {boolean} options.preview Zero-write comparison.
 * @param {boolean} options.confirmed Processing acknowledgement.
 * @param {Function} options.verify Revalidate bytes/flags/root before final tuple.
 * @param {Function} options.now Invocation clock.
 * @param {Function} options.pause Injectable read-only delay.
 * @param {Function} options.progress Stderr-only progress sink.
 * @param {number} options.started Invocation start time.
 * @param {number} options.end Invocation deadline.
 * @returns {Promise<'update'|'updated'|'unchanged'>} Independent result, never response echo.
 */
export async function updateNativeDataGraph(
  context: NativeGraphContext,
  client: DataGraphClient,
  document: NativeDataGraphDocument,
  baseline: NativeDataGraphObservation,
  options: {
    preview: boolean;
    confirmed: boolean;
    verify: () => Promise<void>;
    now: () => number;
    pause: (milliseconds: number) => Promise<unknown>;
    progress: (message: string) => void;
    started: number;
    end: number;
  },
): Promise<'update' | 'updated' | 'unchanged'> {
  const dataSpaceId = await bindNativeGraphDataSpace(context);
  const desired = buildNativeDataGraphUpdateRequest(baseline.target, document);
  const same = isDeepStrictEqual(
    desired,
    nativeDataGraphDocumentFromResponse(baseline.target).definition,
  );
  if (!same && options.preview) return 'update';
  if (!same) graphRequire(options.confirmed && typeof client.update === 'function');
  options.progress(
    'Data Graph processing can take seconds to many minutes, up to 30 minutes depending on objects, fields, data volume and service load.',
  );
  let lastDiagnostic: ConnectDiagnostic | undefined;
  /**
   * Wait before every retry under the same invocation deadline.
   * @param {string} stage Lifecycle stage/status.
   */
  const pause = async (stage: string): Promise<void> => {
    context.check();
    const header = lastDiagnostic?.retryAfter;
    const retry =
      header && /^\d+$/u.test(header)
        ? Number(header) * 1000
        : header
          ? Date.parse(header) - options.now()
          : 0;
    const wait = Math.max(20_000, Number.isFinite(retry) ? retry : 0);
    options.progress(
      `Data Graph ${stage}; elapsed ${Math.floor((options.now() - options.started) / 1000)}s; next wait ${Math.min(wait, options.end - options.now()) / 1000}s.`,
    );
    await options.pause(Math.min(wait, options.end - options.now()));
    context.check();
  };
  /**
   * Retry only explicit safe GET throttling/service failures; unknown shapes stop.
   * @param {boolean} [beforeWrite] Revalidate local/root inputs before each fresh prewrite attempt.
   * @returns {Promise<NativeGraphReadiness>} Fresh readiness tuple.
   */
  const read = async (beforeWrite = false): Promise<NativeGraphReadiness> => {
    for (;;) {
      if (beforeWrite) await options.verify();
      context.check();
      try {
        return await readNativeGraphReadiness(context, document, dataSpaceId);
      } catch (error) {
        const diagnostic = getConnectDiagnostic(error);
        if (!diagnostic || ![429, 503].includes(diagnostic.statusCode)) throw error;
        lastDiagnostic = diagnostic;
        try {
          await pause(`GET HTTP${diagnostic.statusCode}`);
        } catch {
          throw retainConnectDiagnostic(new Error('Native Graph deadline'), diagnostic);
        }
      }
    }
  };
  for (;;) {
    context.check();
    const fresh = await read(true);
    graphRequire(fresh.observation.definitionFingerprint === baseline.definitionFingerprint);
    if (fresh.ready) {
      if (same) return 'unchanged';
      const payload = buildNativeDataGraphUpdateRequest(fresh.observation.target, document);
      graphRequire(isDeepStrictEqual(payload, desired));
      context.check();
      const update = client.update;
      graphRequire(typeof update === 'function');
      // A rejected/uncertain PUT is never replayed or reported confirmed from a later echo.
      await update(document.definition.name as string, payload);
      context.check();
      break;
    }
    await pause(`readiness ${fresh.status}`);
  }
  for (;;) {
    await pause('settlement');
    const settled = await read();
    graphRequire(
      settled.observation.id === baseline.id &&
        settled.observation.createdDate === baseline.createdDate,
    );
    if (settled.ready) {
      const expected = { ...document, definition: desired };
      observeNativeDataGraph({ ...settled.observation.target, status: 'ready' }, expected);
      const actual = nativeDataGraphDocumentFromResponse(settled.observation.target).definition;
      for (const key of Object.keys(desired).filter((key) => key !== 'sourceObject'))
        graphRequire(isDeepStrictEqual(actual[key], desired[key]));
      /**
       * Match every retained binding; only new projections/nodes may gain generated names.
       * @param {Record<string, unknown>} wanted Complete dispatched node.
       * @param {Record<string, unknown>} found Independent settled node.
       */
      function preserved(wanted: Record<string, unknown>, found: Record<string, unknown>): void {
        for (const key of Object.keys(wanted).filter(
          (key) => !['fields', 'relatedObjects', 'path'].includes(key),
        ))
          graphRequire(isDeepStrictEqual(wanted[key], found[key]));
        const wantedPaths = wanted.path as Record<string, unknown>[];
        const foundPaths = found.path as Record<string, unknown>[];
        graphRequire(
          wantedPaths.length === foundPaths.length &&
            (wanted.fields as unknown[]).length === (found.fields as unknown[]).length &&
            (wanted.relatedObjects as unknown[]).length ===
              (found.relatedObjects as unknown[]).length,
        );
        for (const [index, path] of wantedPaths.entries())
          for (const key of Object.keys(path))
            graphRequire(isDeepStrictEqual(path[key], foundPaths[index][key]));
        for (const field of wanted.fields as Record<string, unknown>[]) {
          const match = (found.fields as Record<string, unknown>[]).find(
            (candidate) => candidate.sourceFieldName === field.sourceFieldName,
          );
          graphRequire(match);
          for (const key of Object.keys(field))
            graphRequire(isDeepStrictEqual(field[key], match[key]));
        }
        for (const child of wanted.relatedObjects as Record<string, unknown>[]) {
          const match = (found.relatedObjects as Record<string, unknown>[]).find(
            (candidate) => candidate.jsonPath === child.jsonPath,
          );
          graphRequire(match);
          preserved(child, match);
        }
      }
      preserved(graphRecord(desired.sourceObject), graphRecord(actual.sourceObject));
      context.check();
      return 'updated';
    }
  }
}

export type NativeGraphReceipt = {
  orgId: string;
  dataSpace: 'default';
  apiName: string;
  id: string;
  createdDate: string;
  bodySHA256: string;
  rootId: string;
  definitionFingerprint: string;
};
export type NativeGraphResult = {
  outcome: 'created' | 'deleted' | 'blocked' | 'unknown';
  mutation: 'not-attempted' | 'attempted';
  receipt?: NativeGraphReceipt;
  /** After an attempted create: the step that could not confirm it. */
  failedCheck?: NativeGraphCreateCheck;
};

/** Steps after the create request that must confirm the created graph. */
export type NativeGraphCreateCheck =
  'request' | 'response' | 'settlement' | 'identity' | 'deadline';

/**
 * Create one run-local CRD owner; receipts cannot be imported to adopt preexisting graphs.
 * Each operation is single-use, mutually exclusive, deadline-bound and journaled before dispatch.
 * The coordinator supplies trusted scoped readers and an exclusive durable ledger guard.
 * @param {unknown} value Distinct native authored document.
 * @param {NativeGraphContext} context Exact API68/default/org read context.
 * @param {DataGraphClient} client Single-attempt native transport.
 * @param {object} guards Explicit intent, ledger and independent dependency safety.
 * @param {Function} guards.record Persist predispatch intent/receipt; reject duplicate run ownership.
 * @param {Function} guards.safeToDelete Independently verify no external usage; fail closed.
 * @param {Function} [guards.now] Injectable monotonic wall clock.
 * @param {Function} [guards.pause] Injectable polling delay.
 * @param {object} [guards.creation] Invocation budget; create settlement waits while building.
 * @param {number} guards.creation.started Invocation start time.
 * @param {number} guards.creation.end Invocation deadline (--wait-timeout).
 * @param {Function} guards.creation.pause Paced read-only delay.
 * @param {Function} guards.creation.progress Stderr-only progress sink.
 * @returns {{create: Function; delete: Function}} Internal lifecycle, no UPDATE or name-only delete.
 */
export function nativeDataGraphLifecycle(
  value: unknown,
  context: NativeGraphContext,
  client: DataGraphClient,
  guards: {
    record: (
      phase: 'create-attempt' | 'created' | 'delete-attempt',
      evidence: unknown,
    ) => Promise<void>;
    safeToDelete: (receipt: NativeGraphReceipt) => Promise<boolean>;
    now?: () => number;
    pause?: typeof delay;
    /** Invocation deadline; with it, create settlement waits while the graph is still building. */
    creation?: {
      started: number;
      end: number;
      pause: (milliseconds: number) => Promise<unknown>;
      progress: (message: string) => void;
    };
  },
): {
  create: (confirmed: boolean) => Promise<NativeGraphResult>;
  delete: (confirmed: boolean) => Promise<NativeGraphResult>;
} {
  const document = validateNativeDataGraphDocument(value);
  const orgId = context.orgId;
  graphRequire(/^00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(orgId));
  const name = document.definition.name as string;
  const rootName = document.definition.primaryObjectName as string;
  const bodySHA256 = createHash('sha256').update(JSON.stringify(document.definition)).digest('hex');
  let busy = false;
  let createUsed = false;
  let deleteUsed = false;
  let receipt: NativeGraphReceipt | undefined;
  let binding: Awaited<ReturnType<typeof bindNativeGraphRoot>> | undefined;
  // After a create, the intent carries the node types the API assigned (see the echo).
  let intent = document;
  // This is intentionally run-local only. A later public integration needs its own persisted adoption policy.
  const run = async (
    operation: 'create' | 'delete',
    confirmed: boolean,
  ): Promise<NativeGraphResult> => {
    if (
      busy ||
      confirmed !== true ||
      (operation === 'create' ? createUsed : deleteUsed || !receipt)
    )
      return { outcome: 'blocked', mutation: 'not-attempted' };
    busy = true;
    let attempted = false;
    let diagnostic: ConnectDiagnostic | undefined;
    let expired = false;
    let createCheck: NativeGraphCreateCheck | undefined;
    const now = guards.now ?? Date.now;
    let previous = now();
    const creation = operation === 'create' ? guards.creation : undefined;
    const end = creation ? creation.end : previous + 120_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      context.check();
      const current = now();
      graphRequire(
        !expired &&
          Number.isFinite(previous) &&
          Number.isFinite(current) &&
          current >= previous &&
          current < end &&
          context.orgId === orgId,
      );
      previous = current;
    };
    const readers = { ...context, check };
    const acquire = async (): Promise<NativeGraphAcquisition> => {
      const result = await acquireNativeDataGraph(readers, intent);
      diagnostic = getConnectDiagnostic(result) ?? diagnostic;
      return result;
    };
    const work = async (): Promise<NativeGraphResult> => {
      check();
      const root = await bindNativeGraphRoot(readers, rootName);
      const before = await acquire();
      check();
      if (operation === 'create') {
        graphRequire(before.state === 'absent');
        const freshRoot = await bindNativeGraphRoot(readers, rootName);
        graphRequire(isDeepStrictEqual(root, freshRoot));
        await guards.record('create-attempt', { orgId, name, bodySHA256, rootId: root.id });
        check();
        createUsed = true;
        attempted = true;
        // A thrown/ambiguous write is reconciled read-only, never replayed or adopted for deletion.
        let response: unknown;
        createCheck = 'request';
        try {
          response = await client.create(document.definition);
        } catch (error) {
          const settled = await settleNativeDataGraph(readers, document, 'ready', guards.pause);
          return retainConnectDiagnostic(
            { outcome: 'unknown', mutation: 'attempted', failedCheck: 'request' },
            getConnectDiagnostic(error) ?? getConnectDiagnostic(settled),
          );
        }
        createCheck = 'response';
        check();
        const returned = nativeGraphCreateEcho(response, document);
        createCheck = 'settlement';
        const settled = creation
          ? await settleNativeDataGraphCreation(readers, returned.document, { ...creation, now })
          : await settleNativeDataGraph(readers, returned.document, 'ready', guards.pause);
        diagnostic = getConnectDiagnostic(settled) ?? diagnostic;
        graphRequire(settled.state === 'present');
        createCheck = 'identity';
        graphRequire(
          settled.state === 'present' &&
            settled.observation.id === returned.id &&
            settled.observation.createdDate === returned.createdDate &&
            graphRecord(settled.observation.target.sourceObject).id === returned.source.id &&
            graphRecord(settled.observation.target.sourceObject).devName ===
              returned.source.devName &&
            isDeepStrictEqual(
              graphRecord(settled.observation.target.sourceObject).fields,
              returned.source.fields,
            ) &&
            isDeepStrictEqual(root, await bindNativeGraphRoot(readers, rootName)),
        );
        const observation = settled.observation;
        const owned: NativeGraphReceipt = {
          orgId,
          dataSpace: 'default',
          apiName: name,
          id: observation.id,
          createdDate: observation.createdDate,
          bodySHA256,
          rootId: root.id,
          definitionFingerprint: observation.definitionFingerprint,
        };
        await guards.record('created', structuredClone(owned));
        check();
        binding = root;
        intent = returned.document;
        receipt = owned;
        return { outcome: 'created', mutation: 'attempted', receipt: structuredClone(owned) };
      }
      const owned = receipt!;
      graphRequire(
        isDeepStrictEqual(root, binding) &&
          before.state === 'present' &&
          before.observation.status === 'ready' &&
          before.observation.id === owned.id &&
          before.observation.createdDate === owned.createdDate &&
          before.observation.definitionFingerprint === owned.definitionFingerprint &&
          owned.bodySHA256 === bodySHA256,
      );
      graphRequire((await guards.safeToDelete(structuredClone(owned))) === true);
      const fresh = await acquire();
      graphRequire(
        isDeepStrictEqual(before, fresh) &&
          isDeepStrictEqual(root, await bindNativeGraphRoot(readers, rootName)),
      );
      await guards.record('delete-attempt', structuredClone(owned));
      check();
      deleteUsed = true;
      attempted = true;
      try {
        await client.delete(name);
      } catch (error) {
        diagnostic = getConnectDiagnostic(error) ?? diagnostic;
        /* Reconcile ambiguous acknowledgement with independent GETs only. */
      }
      check();
      const settled = await settleNativeDataGraph(readers, intent, 'absent', guards.pause);
      diagnostic = diagnostic ?? getConnectDiagnostic(settled);
      graphRequire(settled.state === 'absent');
      return { outcome: 'deleted', mutation: 'attempted', receipt: structuredClone(owned) };
    };
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Native Graph deadline')),
            // Node overflows longer delays to 1ms; the guarded check still enforces the end.
            Math.min(Math.max(end - now(), 0), 2_147_483_647),
          );
        }),
      ]);
    } catch (error) {
      return retainConnectDiagnostic(
        {
          outcome: attempted ? 'unknown' : 'blocked',
          mutation: attempted ? 'attempted' : 'not-attempted',
          ...(attempted && createCheck ? { failedCheck: createCheck } : {}),
        },
        getConnectDiagnostic(error) ?? diagnostic,
      );
    } finally {
      expired = true;
      clearTimeout(timer);
      busy = false;
    }
  };
  return {
    create: (confirmed) => run('create', confirmed),
    delete: (confirmed) => run('delete', confirmed),
  };
}
