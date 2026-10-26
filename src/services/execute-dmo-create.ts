import type { Connection } from '@salesforce/core';
import {
  buildDmoCreateRequestFromDocument,
  validateDmoDocument,
} from '../artifacts/dmo-document.js';
import { ConnectClient } from '../transport/connect-client.js';
import { compareDmoMeaning, preflightDmoDeploy } from './preflight-dmo-deploy.js';
import type { DmoDeployPreview } from './preflight-dmo-deploy.js';
import { dmoApiSelection, retrieveDmo } from './retrieve-other-dmo.js';

type TargetConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;

export type DmoCreateExecution = {
  outcome: 'unchanged' | 'blocked' | 'created' | 'failed';
  mutation: 'not-attempted' | 'confirmed-created' | 'unknown';
  preflight?: DmoDeployPreview;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Execute one authored create after fresh absence proof; never accepts a saved preview.
 * Snapshot validation happens synchronously before the first await. Only qualified independent
 * readback can establish created status; HTTP failure/ambiguous response never authorizes retry.
 * @param {unknown} document Authored-only document, not a preview or projection.
 * @param {TargetConnection} connection Actual target connection with explicit API version.
 * @param {unknown} apiVersion Explicit API 65.0.
 * @param {unknown} dataSpace Explicit default data space.
 * @returns {Promise<DmoCreateExecution>} Payload-free result retaining possible mutation evidence.
 */
export async function executeDmoCreate(
  document: unknown,
  connection: TargetConnection,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoCreateExecution> {
  let snapshot;
  let source;
  let client;
  try {
    // Validate before serializing so accessor/toJSON payloads cannot run during snapshotting.
    const { name, dataSpaceName, ...spec } = buildDmoCreateRequestFromDocument(document, 'default');
    snapshot = validateDmoDocument({
      schemaVersion: 1,
      kind: 'dmo',
      identity: { dataSpace: dataSpaceName, apiName: `${name}__dlm` },
      spec,
    });
  } catch {
    return {
      outcome: 'blocked',
      mutation: 'not-attempted',
      diagnostics: [
        {
          code: 'INVALID_SOURCE',
          message: 'Supply one valid authored-only default-space DMO document.',
        },
      ],
    };
  }
  try {
    const selection = dmoApiSelection(apiVersion);
    if (
      selection.requested !== '65.0' ||
      dataSpace !== 'default' ||
      connection.getApiVersion() !== selection.soapNumeric
    )
      throw new Error('Invalid scope');
    apiVersion = selection;
    client = new ConnectClient(connection, selection);
    source = buildDmoCreateRequestFromDocument(snapshot, dataSpace);
  } catch {
    return {
      outcome: 'blocked',
      mutation: 'not-attempted',
      diagnostics: [
        {
          code: 'INVALID_SCOPE',
          message: 'Use an explicit API 65.0 connection and default target data space.',
        },
      ],
    };
  }
  const preflight = await preflightDmoDeploy(snapshot, connection, apiVersion, dataSpace);
  if (
    preflight.outcome !== 'create' ||
    preflight.target !== 'absent' ||
    preflight.absenceProof !== 'complete-inventory'
  )
    return {
      outcome: preflight.outcome === 'unchanged' ? 'unchanged' : 'blocked',
      mutation: 'not-attempted',
      preflight,
      diagnostics: preflight.diagnostics,
    };
  try {
    // The response body is deliberately not trusted or used as the readback identity.
    await client.createDataModelObject(snapshot);
  } catch {
    return {
      outcome: 'failed',
      mutation: 'unknown',
      preflight,
      diagnostics: [
        {
          code: 'CREATE_UNCONFIRMED',
          message:
            'Creation may have occurred. Inspect target state before any further attempt; no automatic retry or rollback was performed.',
        },
      ],
    };
  }
  try {
    const acquired = await retrieveDmo(connection, `${source.name}__dlm`, apiVersion, dataSpace);
    const target = buildDmoCreateRequestFromDocument(acquired.candidate, dataSpace);
    if (compareDmoMeaning(source, target).length > 0)
      return {
        outcome: 'failed',
        mutation: 'unknown',
        preflight,
        diagnostics: [
          {
            code: 'READBACK_MISMATCH',
            message:
              'Creation may have occurred, but qualified target meaning differs. Inspect target; no retry or rollback was performed.',
          },
        ],
      };
    return { outcome: 'created', mutation: 'confirmed-created', preflight, diagnostics: [] };
  } catch {
    return {
      outcome: 'failed',
      mutation: 'unknown',
      preflight,
      diagnostics: [
        {
          code: 'READBACK_UNQUALIFIED',
          message:
            'Creation may have occurred, but independent target qualification failed. Inspect target; no retry or rollback was performed.',
        },
      ],
    };
  }
}
