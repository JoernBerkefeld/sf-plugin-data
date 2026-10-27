import type { Connection } from '@salesforce/core';
import { dloAcquisitionBlockers, validateDloAcquisition } from '../artifacts/dlo-acquisition.js';
import type { DloAcquisition } from '../artifacts/dlo-acquisition.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'getApiVersion'>;

/** Payload-free acquisition failure; no remote payloads escape this service. */
export class DloRetrieveError extends Error {
  public constructor(
    public readonly code: 'INVALID_SCOPE' | 'INVALID_IDENTITY' | 'ACQUISITION_FAILED',
  ) {
    super('DLO acquisition failed.');
    this.name = 'DloRetrieveError';
  }
}

/**
 * Read one exact API65/default DLO into an explicitly incomplete internal snapshot.
 * ConnectClient uses an operation-local receiver with refresh/retry/redirect disabled.
 * @param {ReadConnection} connection Existing core connection, never initialized here.
 * @param {unknown} apiName Exact non-namespaced custom DLO name.
 * @param {unknown} apiVersion Explicit numeric API65 selector.
 * @param {unknown} dataSpace Explicit default space.
 * @returns {Promise<DloAcquisition>} Detached snapshot, never a portable deployment input.
 */
export async function retrieveDlo(
  connection: ReadConnection,
  apiName: unknown,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DloAcquisition> {
  if (apiVersion !== '65.0' || dataSpace !== 'default') throw new DloRetrieveError('INVALID_SCOPE');
  if (
    typeof apiName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dll$/u.test(apiName) ||
    /^ssot/iu.test(apiName)
  )
    throw new DloRetrieveError('INVALID_IDENTITY');
  try {
    if (connection.getApiVersion() !== '65.0') throw new DloRetrieveError('INVALID_SCOPE');
    const detail = await new ConnectClient(connection, '65.0').get(
      `/services/data/v65.0/ssot/data-lake-objects/${apiName}`,
    );
    return validateDloAcquisition({
      schemaVersion: 1,
      kind: 'dlo-acquisition',
      apiVersion: '65.0',
      identity: { dataSpace: 'default', apiName },
      status: 'incomplete',
      blockers: [...dloAcquisitionBlockers],
      detail,
    });
  } catch (error: unknown) {
    if (error instanceof DloRetrieveError || error instanceof ConnectError) throw error;
    throw new DloRetrieveError('ACQUISITION_FAILED');
  }
}
