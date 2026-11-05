import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { graphRecord, graphRequire, graphText } from '../artifacts/data-graph-document.js';
import {
  nativeGraphFingerprint,
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
  root: () => Promise<{ detail: unknown; metadata: unknown }>;
};
export type NativeGraphAcquisition =
  | { state: 'present'; observation: NativeDataGraphObservation }
  | { state: 'absent'; proof: 'item+metadata+inventory+soql' }
  | { state: 'pending' }
  | { state: 'unknown' };

/**
 * Independently bind an enabled mapped Standard Individual and its exact primary key/qualifier.
 * @param {NativeGraphContext} context Scope-checked readers.
 * @returns {Promise<{id: string; fingerprint: string}>} Detached root binding.
 */
export async function bindNativeGraphRoot(
  context: NativeGraphContext,
): Promise<{ id: string; fingerprint: string }> {
  context.check();
  const acquired = structuredClone(await context.root());
  context.check();
  const detail = graphRecord(acquired.detail);
  graphRequire(Array.isArray(acquired.metadata) && acquired.metadata.length === 1);
  const metadata = graphRecord(acquired.metadata[0]);
  const attributes = graphRecord(metadata.mktDataModelAttributes);
  graphRequire(
    detail.name === 'ssot__Individual__dlm' &&
      detail.dataSpaceName === 'default' &&
      detail.creationType === 'Standard' &&
      detail.isEnabled === true &&
      metadata.fullName === detail.name &&
      attributes.dataSpaceName === 'default' &&
      attributes.creationType === 'Standard',
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
  const fields = index(detail.fields, 'name');
  const meta = index(metadata.fields, 'fullName');
  for (const name of ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'])
    graphRequire(
      fields.get(name)?.type === 'Text' &&
        fields.get(name)?.isMapped === true &&
        meta.get(name)?.type === 'Text',
    );
  graphRequire(
    fields.get('ssot__Id__c')?.isPrimaryKey === true &&
      fields.get('ssot__Id__c')?.keyQualifierName === 'KQ_Id' &&
      fields.get('KQ_Id__c')?.usageTag === 'KeyQualifier',
  );
  const primary = [...meta.entries()].filter(
    ([, field]) =>
      field.mktDataModelFieldAttributes &&
      graphRecord(field.mktDataModelFieldAttributes).primaryIndexOrder === '1',
  );
  graphRequire(primary.length === 1 && primary[0][0] === 'ssot__Id__c');
  return { id: detail.id, fingerprint: nativeGraphFingerprint(acquired) };
}

/**
 * Acquire exact native state. HTTP400 alone is never absence evidence; stale metadata is pending.
 * @param {NativeGraphContext} context Independent exact readers, not mutation responses.
 * @param {NativeDataGraphDocument} document Native intent.
 * @returns {Promise<NativeGraphAcquisition>} Correlated state or conservative uncertainty.
 */
export async function acquireNativeDataGraph(
  context: NativeGraphContext,
  document: NativeDataGraphDocument,
): Promise<NativeGraphAcquisition> {
  let diagnostic: ConnectDiagnostic | undefined;
  try {
    const expected = validateNativeDataGraphDocument(document);
    const name = expected.definition.name as string;
    context.check();
    const item = await context.get(name);
    diagnostic = getConnectDiagnostic(item);
    context.check();
    if (item.status === 200)
      return { state: 'present', observation: observeNativeDataGraph(item.body, expected) };
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
};

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
  },
): {
  create: (confirmed: boolean) => Promise<NativeGraphResult>;
  delete: (confirmed: boolean) => Promise<NativeGraphResult>;
} {
  const document = validateNativeDataGraphDocument(value);
  const orgId = context.orgId;
  graphRequire(/^00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(orgId));
  const name = document.definition.name as string;
  const bodySHA256 = createHash('sha256').update(JSON.stringify(document.definition)).digest('hex');
  let busy = false;
  let createUsed = false;
  let deleteUsed = false;
  let receipt: NativeGraphReceipt | undefined;
  let binding: Awaited<ReturnType<typeof bindNativeGraphRoot>> | undefined;
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
    const now = guards.now ?? Date.now;
    let previous = now();
    const end = previous + 120_000;
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
      const result = await acquireNativeDataGraph(readers, document);
      diagnostic = getConnectDiagnostic(result) ?? diagnostic;
      return result;
    };
    const work = async (): Promise<NativeGraphResult> => {
      check();
      const root = await bindNativeGraphRoot(readers);
      const before = await acquire();
      check();
      if (operation === 'create') {
        graphRequire(before.state === 'absent');
        const freshRoot = await bindNativeGraphRoot(readers);
        graphRequire(isDeepStrictEqual(root, freshRoot));
        await guards.record('create-attempt', { orgId, name, bodySHA256, rootId: root.id });
        check();
        createUsed = true;
        attempted = true;
        // A thrown/ambiguous write is reconciled read-only, never replayed or adopted for deletion.
        let response: unknown;
        try {
          response = await client.create(document.definition);
        } catch (error) {
          const settled = await settleNativeDataGraph(readers, document, 'ready', guards.pause);
          return retainConnectDiagnostic(
            { outcome: 'unknown', mutation: 'attempted' },
            getConnectDiagnostic(error) ?? getConnectDiagnostic(settled),
          );
        }
        check();
        const returned = observeNativeDataGraph(response, document);
        const settled = await settleNativeDataGraph(readers, document, 'ready', guards.pause);
        diagnostic = getConnectDiagnostic(settled) ?? diagnostic;
        graphRequire(
          settled.state === 'present' &&
            settled.observation.id === returned.id &&
            settled.observation.createdDate === returned.createdDate &&
            graphRecord(settled.observation.target.sourceObject).id ===
              graphRecord(returned.target.sourceObject).id &&
            graphRecord(settled.observation.target.sourceObject).devName ===
              graphRecord(returned.target.sourceObject).devName &&
            isDeepStrictEqual(
              graphRecord(settled.observation.target.sourceObject).fields,
              graphRecord(returned.target.sourceObject).fields,
            ) &&
            isDeepStrictEqual(root, await bindNativeGraphRoot(readers)),
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
          isDeepStrictEqual(root, await bindNativeGraphRoot(readers)),
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
      const settled = await settleNativeDataGraph(readers, document, 'absent', guards.pause);
      diagnostic = getConnectDiagnostic(settled) ?? diagnostic;
      graphRequire(settled.state === 'absent');
      return { outcome: 'deleted', mutation: 'attempted', receipt: structuredClone(owned) };
    };
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Native Graph deadline')), 120_000);
        }),
      ]);
    } catch (error) {
      return retainConnectDiagnostic(
        {
          outcome: attempted ? 'unknown' : 'blocked',
          mutation: attempted ? 'attempted' : 'not-attempted',
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
