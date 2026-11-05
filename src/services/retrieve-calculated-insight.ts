import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { isDeepStrictEqual } from 'node:util';
import { createCalculatedInsightClient } from '../transport/calculated-insight-rest.js';
import { bindCalculatedInsightDependencies } from './bind-calculated-insight-dependencies.js';
import type { CalculatedInsightBinding } from './bind-calculated-insight-dependencies.js';
import {
  CalculatedInsightError,
  projectCalculatedInsight,
  observeCalculatedInsight,
  calculatedInsightName,
} from '../artifacts/calculated-insight-document.js';
import type { CalculatedInsightProjection } from '../artifacts/calculated-insight-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { readCalculatedInsightMetadata, readDmoMetadata } from './retrieve-other-dmo.js';

export type CalculatedInsightConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion' | 'metadata'
>;
export type CalculatedInsightAcquisition = {
  identity: { dataSpace: 'default'; apiName: string };
  candidate?: CalculatedInsightProjection['document'];
  observations?: CalculatedInsightProjection['observations'];
  expectations?: { runtime: unknown; metadata: unknown };
  blockers: string[];
};

/**
 * Require the fixed API65/default-space CI scope before any request.
 * @param {CalculatedInsightConnection} connection Existing target connection.
 * @param {ApiVersionSelection} selection Explicit numeric family route.
 * @param {string} dataSpace Exact target space.
 * @param {string} apiName Exact CI identity.
 */
export function calculatedInsightScope(
  connection: CalculatedInsightConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  apiName: string,
): void {
  if (
    selection?.requested !== '65.0' ||
    selection.restSelector !== 'v65.0' ||
    selection.soapNumeric !== '65.0' ||
    connection.getApiVersion() !== '65.0' ||
    dataSpace !== 'default' ||
    !/^[A-Za-z][A-Za-z0-9_]*__cio$/u.test(apiName)
  )
    throw new CalculatedInsightError('INVALID_SCOPE');
}

/**
 * Independently acquire exact runtime and SOAP Metadata; no 404 absence inference.
 * @param {CalculatedInsightConnection} connection Existing authenticated connection.
 * @param {string} apiName Exact selected CI name.
 * @param {ApiVersionSelection} selection Explicit API65 route.
 * @param {string} dataSpace Explicit default space.
 * @returns {Promise<CalculatedInsightAcquisition>} Candidate only after full correlation.
 */
export async function retrieveCalculatedInsight(
  connection: CalculatedInsightConnection,
  apiName: string,
  selection: ApiVersionSelection,
  dataSpace: string,
): Promise<CalculatedInsightAcquisition> {
  calculatedInsightScope(connection, selection, dataSpace, apiName);
  const identity = { dataSpace: 'default' as const, apiName };
  try {
    const runtime = await new ConnectClient(connection, selection).get(
      `/services/data/v65.0/ssot/calculated-insights/${apiName}`,
    );
    const definitions = await readCalculatedInsightMetadata(connection, apiName.slice(0, -5));
    if (!Array.isArray(definitions) || definitions.length !== 1)
      throw new CalculatedInsightError('CI_METADATA_AMBIGUOUS');
    const metadata: unknown = definitions[0];
    const projection = projectCalculatedInsight(runtime, metadata);
    if (projection.document.identity.apiName !== apiName)
      throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
    return {
      identity,
      candidate: projection.document,
      observations: projection.observations,
      expectations: { runtime: structuredClone(runtime), metadata: structuredClone(metadata) },
      blockers: [],
    };
  } catch (error) {
    return retainConnectDiagnostic(
      {
        identity,
        blockers: [error instanceof CalculatedInsightError ? error.code : 'CI_ACQUISITION_FAILED'],
      },
      getConnectDiagnostic(error),
    );
  }
}

export type CalculatedInsightReadContext = {
  check: () => void;
  get: (name: string) => Promise<unknown>;
  metadata: (name: string) => Promise<unknown>;
  bind: (document: unknown, checkpoint?: () => void) => Promise<CalculatedInsightBinding>;
};
export type ExactCalculatedInsightAcquisition =
  | { state: 'unknown'; diagnostics: string[] }
  | { state: 'absent'; absenceProof: 'native-item-not-found+metadata-empty' }
  | {
      state: 'present';
      status: 'ACTIVE' | 'DRAFT' | 'PROCESSING' | 'DELETING';
      document: CalculatedInsightProjection['document'];
      observations: CalculatedInsightProjection['observations'];
      expectations: { runtime: unknown; metadata: unknown };
    };

/**
 * Isolate native68 reads from the qualified65 Metadata/dependency receiver without repinning callers.
 * @param {CalculatedInsightConnection} connection Explicit native68 authenticated connection.
 * @param {string} dataSpace Exact default space.
 * @returns {CalculatedInsightReadContext} Operation-local GET-only acquisition context.
 */
export function calculatedInsightReadContext(
  connection: CalculatedInsightConnection,
  dataSpace: string,
): CalculatedInsightReadContext {
  const origin = connection.instanceUrl;
  const check = (): void => {
    if (
      connection.getApiVersion() !== '68.0' ||
      connection.instanceUrl !== origin ||
      dataSpace !== 'default'
    )
      throw new CalculatedInsightError('INVALID_SCOPE');
  };
  check();
  const receiver = Object.create(connection) as CalculatedInsightConnection;
  Object.defineProperty(receiver, 'version', { value: '65.0' });
  Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
  const client = createCalculatedInsightClient(connection, '68.0', dataSpace);
  const selection = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' } as const;
  return {
    check,
    get: (name) => client.get(name),
    metadata: (name) => readCalculatedInsightMetadata(receiver, name.slice(0, -5)),
    bind: (document, checkpoint = check) =>
      bindCalculatedInsightDependencies(document, receiver, selection, dataSpace, async (name) => {
        checkpoint();
        const detail = await new ConnectClient(receiver, '65.0').get(
          `/services/data/v65.0/ssot/data-model-objects/${name}`,
        );
        checkpoint();
        const metadata = await readDmoMetadata(receiver, name);
        checkpoint();
        return { detail, metadata };
      }),
  };
}

/**
 * Classify exact independent native and Metadata reads; malformed or contradictory evidence is unknown.
 * DELETING is admitted only for deletion settlement and never projected as deployable state.
 * @param {CalculatedInsightReadContext} context Isolated read context.
 * @param {string} apiName Exact selected identity.
 * @param {boolean} deleting Permit the evidenced deletion transition only.
 * @returns {Promise<ExactCalculatedInsightAcquisition>} Detached evidence or payload-free diagnostics.
 */
export async function acquireExactCalculatedInsight(
  context: CalculatedInsightReadContext,
  apiName: string,
  deleting = false,
): Promise<ExactCalculatedInsightAcquisition> {
  try {
    context.check();
    if (!calculatedInsightName.test(apiName)) throw new CalculatedInsightError('INVALID_SCOPE');
    let runtime: unknown;
    let missing = false;
    try {
      runtime = await context.get(apiName);
    } catch (error) {
      if (!(
        error instanceof ConnectError &&
        error.code === 'REQUEST_FAILED' &&
        error.statusCode === 404 &&
        error.nativeCode === 'ITEM_NOT_FOUND'
      ))
        throw retainConnectDiagnostic(
          new CalculatedInsightError('CI_RUNTIME_UNKNOWN'),
          getConnectDiagnostic(error),
        );
      missing = true;
    }
    context.check();
    const records = await context.metadata(apiName);
    context.check();
    // Core array-form readMetadata maps its single missing record to exactly [{}].
    const empty = isDeepStrictEqual(records, [{}]);
    if (missing && empty)
      return { state: 'absent', absenceProof: 'native-item-not-found+metadata-empty' };
    if (missing || empty || !Array.isArray(records) || records.length !== 1)
      throw new CalculatedInsightError('CI_METADATA_AMBIGUOUS');
    const metadata: unknown = records[0];
    const raw = runtime as Record<string, unknown>;
    const isDeleting = deleting && raw?.calculatedInsightStatus === 'DELETING';
    const observed = observeCalculatedInsight(
      isDeleting ? { ...raw, calculatedInsightStatus: 'ACTIVE' } : runtime,
      '68.0',
    );
    const { document, observations } = observed;
    if (document.identity.apiName !== apiName)
      throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
    if (
      !isDeepStrictEqual(metadata, {
        fullName: apiName.slice(0, -5),
        creationType: document.spec.creationType,
        expression: document.spec.expression,
        masterLabel: document.spec.displayName,
      })
    )
      throw new CalculatedInsightError('CI_METADATA_MISMATCH');
    return {
      state: 'present',
      status: isDeleting ? 'DELETING' : observed.status,
      document,
      observations,
      expectations: { runtime: structuredClone(runtime), metadata: structuredClone(metadata) },
    };
  } catch (error) {
    return retainConnectDiagnostic(
      {
        state: 'unknown' as const,
        diagnostics: [
          error instanceof CalculatedInsightError ? error.code : 'CI_ACQUISITION_FAILED',
        ],
      },
      getConnectDiagnostic(error),
    );
  }
}
