import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  buildDmoCreateRequestFromDocument,
  validateDmoDocument,
} from '../artifacts/dmo-document.js';
import type { DmoCommonProjection, DmoDocument } from '../artifacts/dmo-document.js';
import type { DmoUpdatePatch } from '../artifacts/dmo-update-delta.js';
import { ConnectClient } from '../transport/connect-client.js';
import { executeDmoCreate } from './execute-dmo-create.js';
import type { DmoCreateExecution } from './execute-dmo-create.js';
import {
  buildExecutableDmoDelta,
  compareDmoMeaning,
  preflightDmoDeploy,
} from './preflight-dmo-deploy.js';
import type { DmoDeployPreview } from './preflight-dmo-deploy.js';
import { dmoApiSelection, retrieveDmo } from './retrieve-other-dmo.js';

type TargetConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;
export type DmoDeployExecution = {
  outcome: DmoCreateExecution['outcome'] | 'updated' | 'not-attempted';
  mutation: DmoCreateExecution['mutation'] | 'confirmed-updated';
  preflight?: DmoDeployPreview;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Normalize only independently keyed field collections; preserve every other raw value.
 * @param {DmoCommonProjection['expectations']} raw Full qualified runtime inputs.
 * @returns {DmoCommonProjection['expectations']} Detached normalized runtime.
 */
function normalizeRuntime(raw: DmoCommonProjection['expectations']) {
  const result = structuredClone(raw);
  for (const [record, key] of [
    [result.connect, 'name'],
    [result.metadata, 'fullName'],
  ] as const) {
    const fields = record.fields as Array<Record<string, unknown>>;

    fields.sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  }
  return result;
}

/**
 * Apply only evidenced label effects to the complete original runtime snapshot.
 * @param {DmoCommonProjection['expectations']} raw Pre-write qualified runtime.
 * @param {DmoUpdatePatch} patch Admitted label-only patch.
 * @returns {DmoCommonProjection['expectations']} Exact preservation expectation.
 */
function expectedRuntime(raw: DmoCommonProjection['expectations'], patch: DmoUpdatePatch) {
  const result = normalizeRuntime(raw);
  if (patch.label !== undefined) {
    result.connect.label = patch.label;
    result.metadata.label = patch.label;
    const attributes = result.metadata.mktDataModelAttributes as Record<string, unknown>;
    attributes.labelOverride = patch.label;
    attributes.masterLabel = patch.label;
  }
  for (const field of patch.fields ?? []) {
    const connect = (result.connect.fields as Array<Record<string, unknown>>).find(
      (item) => item.name === field.name,
    )!;
    const metadata = (result.metadata.fields as Array<Record<string, unknown>>).find(
      (item) => item.fullName === field.name,
    )!;
    connect.label = field.label;
    (metadata.mktDataModelFieldAttributes as Record<string, unknown>).labelOverride = field.label;
  }
  return result;
}

/**
 * Validate and detach before any asynchronous target acquisition.
 * @param {unknown} document Authored-only document.
 * @returns {DmoDocument} Independent mapped snapshot.
 */
function snapshotDocument(document: unknown): DmoDocument {
  const { name, dataSpaceName, ...spec } = buildDmoCreateRequestFromDocument(document, 'default');
  return validateDmoDocument({
    schemaVersion: 1,
    kind: 'dmo',
    identity: { apiName: `${name}__dlm`, dataSpace: dataSpaceName },
    spec,
  });
}

/**
 * Construct a payload-free conservative result.
 * @param {string} outcome Result classification.
 * @param {string} mutation Attempt evidence.
 * @param {string} code Stable diagnostic.
 * @returns {DmoDeployExecution} No remote payloads or error details.
 */
function result(
  outcome: DmoDeployExecution['outcome'],
  mutation: DmoDeployExecution['mutation'],
  code: string,
): DmoDeployExecution {
  return {
    outcome,
    mutation,
    diagnostics: [
      {
        code,
        message:
          mutation === 'unknown'
            ? 'Mutation may have occurred. Inspect target before any further attempt; no retry or rollback was performed.'
            : 'Deployment was not attempted. Resolve input, scope or target qualification before trying again.',
      },
    ],
  };
}

/**
 * Execute one internal create/unchanged/label-update operation using fresh target evidence.
 * Public CLI intentionally continues to invoke the create-only executor.
 * @param {unknown} document Authored document, never saved admission evidence.
 * @param {TargetConnection} connection Explicit authenticated API 65 connection.
 * @param {unknown} apiVersion Explicit 65.0.
 * @param {unknown} dataSpace Explicit default space.
 * @returns {Promise<DmoDeployExecution>} Attempt and independently confirmed outcome.
 */
export async function executeDmoDeploy(
  document: unknown,
  connection: TargetConnection,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoDeployExecution> {
  try {
    const selection = dmoApiSelection(apiVersion);
    if (selection.requested !== '65.0') return result('blocked', 'not-attempted', 'INVALID_SCOPE');
    apiVersion = selection;
  } catch {
    return result('blocked', 'not-attempted', 'INVALID_SCOPE');
  }
  let snapshot: DmoDocument;
  try {
    snapshot = snapshotDocument(document);
  } catch {
    return result('blocked', 'not-attempted', 'INVALID_SOURCE');
  }
  const preflight = await preflightDmoDeploy(snapshot, connection, apiVersion, dataSpace, true);
  if (preflight.outcome === 'create')
    return executeDmoCreate(snapshot, connection, apiVersion, dataSpace);
  if (preflight.outcome === 'unchanged')
    return { outcome: 'unchanged', mutation: 'not-attempted', preflight, diagnostics: [] };
  if (preflight.outcome !== 'update')
    return { ...result('blocked', 'not-attempted', 'UPDATE_BLOCKED'), preflight };
  let acquired;
  let delta;
  try {
    // Reacquire immediately before dispatch: admission snapshots never authorize a PATCH.
    acquired = await retrieveDmo(connection, snapshot.identity.apiName, apiVersion, dataSpace);
    delta = buildExecutableDmoDelta(snapshot, acquired.candidate);
  } catch {
    return { ...result('blocked', 'not-attempted', 'TARGET_UNQUALIFIED'), preflight };
  }
  if (delta.status === 'blocked')
    return { ...result('blocked', 'not-attempted', 'UPDATE_BLOCKED'), preflight };
  if (delta.status === 'unchanged')
    return { outcome: 'unchanged', mutation: 'not-attempted', preflight, diagnostics: [] };
  let runtime;
  try {
    runtime = expectedRuntime(acquired.expectations, delta.patch);
  } catch {
    return { ...result('blocked', 'not-attempted', 'TARGET_UNQUALIFIED'), preflight };
  }
  // Mark attempted before dispatch and never infer success from the PATCH response body.
  const execution: DmoDeployExecution = {
    ...result('failed', 'unknown', 'UPDATE_UNCONFIRMED'),
    preflight,
  };
  try {
    await new ConnectClient(connection, dmoApiSelection(apiVersion)).patchDataModelObject(
      snapshot.identity.apiName,
      delta.patch,
    );
    const readback = await retrieveDmo(
      connection,
      snapshot.identity.apiName,
      apiVersion,
      dataSpace,
    );
    if (
      compareDmoMeaning(
        buildDmoCreateRequestFromDocument(delta.expected, dataSpace),
        buildDmoCreateRequestFromDocument(readback.candidate, dataSpace),
      ).length > 0 ||
      !isDeepStrictEqual(runtime, normalizeRuntime(readback.expectations))
    ) {
      execution.diagnostics = result('failed', 'unknown', 'READBACK_MISMATCH').diagnostics;
      return execution;
    }
    return { outcome: 'updated', mutation: 'confirmed-updated', preflight, diagnostics: [] };
  } catch {
    return execution;
  }
}

/**
 * Admit the complete detached selection before writes, then stop on first ambiguity or block.
 * @param {unknown[]} documents Explicit selected authored inputs; duplicate identities are invalid.
 * @param {TargetConnection} connection Actual target connection.
 * @param {unknown} apiVersion Explicit API 65.0.
 * @param {unknown} dataSpace Explicit default space.
 * @returns {Promise<DmoDeployExecution[]>} Ordered item results, including never-attempted tail.
 */
export async function executeDmoDeploySelection(
  documents: unknown[],
  connection: TargetConnection,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoDeployExecution[]> {
  const items = documents.map(() =>
    result('not-attempted', 'not-attempted', 'SELECTION_NOT_ATTEMPTED'),
  );
  try {
    const selection = dmoApiSelection(apiVersion);
    if (selection.requested !== '65.0') throw new Error('Invalid mutation scope');
    apiVersion = selection;
  } catch {
    return items.map(() => result('blocked', 'not-attempted', 'INVALID_SCOPE'));
  }
  let snapshots;
  try {
    snapshots = documents.map((document) => snapshotDocument(document));
    if (
      snapshots.length === 0 ||
      new Set(snapshots.map((item) => item.identity.apiName)).size !== snapshots.length
    )
      throw new Error('Invalid selection');
  } catch {
    return items.map(() => result('blocked', 'not-attempted', 'INVALID_SELECTION'));
  }
  let blocked = false;
  for (const [index, snapshot] of snapshots.entries()) {
    try {
      const preflight = await preflightDmoDeploy(snapshot, connection, apiVersion, dataSpace, true);
      items[index].preflight = preflight;
      if (preflight.outcome === 'blocked' || preflight.outcome === 'blocked-changes') {
        items[index] = { ...result('blocked', 'not-attempted', 'SELECTION_BLOCKED'), preflight };
        blocked = true;
      }
    } catch {
      items[index] = result('blocked', 'not-attempted', 'PREFLIGHT_FAILED');
      blocked = true;
    }
  }
  if (blocked) return items;
  for (const [index, snapshot] of snapshots.entries()) {
    // An unexpected exception after entering execution cannot erase possible mutation evidence.
    items[index] = result('failed', 'unknown', 'EXECUTION_UNCONFIRMED');
    try {
      items[index] = await executeDmoDeploy(snapshot, connection, apiVersion, dataSpace);
    } catch {
      return items;
    }
    if (
      items[index].mutation === 'unknown' ||
      items[index].outcome === 'blocked' ||
      items[index].outcome === 'failed'
    )
      break;
  }
  return items;
}
