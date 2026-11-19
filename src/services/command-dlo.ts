import { operationDiagnostic } from './operation-diagnostic.js';
import { DloError } from '../artifacts/dlo-document.js';
import { preflightNativeDlo, deployNativeDlo } from './native-dlo.js';
import type { DloDeployOptions, DloMembershipChange } from './native-dlo.js';
import type { DloClient } from '../transport/dlo-rest.js';
import { WriteLedger, rejectedNextAction } from './deploy-result.js';

export type DloPreview = {
  family: 'dlo';
  outcome: 'create' | 'update' | 'unchanged' | 'blocked';
  target: 'absent' | 'existing' | 'unknown';
  absenceProof: 'confirmed-404' | 'none';
  /** Every data space of the file, sorted. */
  dataSpaces?: string[];
  /** Data spaces the deploy adds the DLO to or removes it from; absent when none change. */
  dataSpaceChanges?: DloMembershipChange;
  diagnostics: Array<{ code: string; message: string }>;
};
export type DloExecution = {
  family: 'dlo';
  outcome: 'created' | 'updated' | 'unchanged' | 'failed' | 'blocked';
  mutation: 'confirmed-created' | 'confirmed-updated' | 'unknown' | 'not-attempted' | 'rejected';
  serverProcessing?: true;
  /** The data spaces the DLO belongs to after the deploy, sorted. */
  dataSpaces?: string[];
  diagnostics: Array<{ code: string; message: string }>;
};
/** Data space refusals a preview reports on the item instead of failing. */
const blockingSpaceCodes: ReadonlySet<string> = new Set([
  'DLO_DATASPACE_REMOVAL_NOT_ALLOWED',
  'DLO_DATASPACE_MEMBERS_UNREADABLE',
]);

/**
 * Compare a portable definition without mutation.
 * @param {unknown} value Portable definition.
 * @param {DloClient} client Target API client.
 * @param {string} dataSpace The run's data space.
 * @param {DloDeployOptions} [options] Data space removal permission.
 * @returns {Promise<DloPreview>} Payload-free comparison.
 */
export async function preflightDloDeploy(
  value: unknown,
  client: DloClient,
  dataSpace: string,
  options: DloDeployOptions = {},
): Promise<DloPreview> {
  let plan: Awaited<ReturnType<typeof preflightNativeDlo>>;
  try {
    plan = await preflightNativeDlo(value, client, dataSpace, options);
  } catch (error) {
    // A data space change the deploy would refuse is the item's own block, with its code.
    if (!(error instanceof DloError) || !blockingSpaceCodes.has(error.code)) throw error;
    return {
      family: 'dlo',
      outcome: 'blocked',
      target: 'existing',
      absenceProof: 'none',
      diagnostics: [
        {
          code: error.code,
          message: operationDiagnostic(error, 'Preview only; nothing was written.'),
        },
      ],
    };
  }
  return {
    family: 'dlo',
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-404' : 'none',
    dataSpaces: plan.dataSpaces,
    ...(plan.membership.add.length > 0 || plan.membership.remove.length > 0
      ? { dataSpaceChanges: plan.membership }
      : {}),
    diagnostics: [],
  };
}
/**
 * Deploy through freshly resolved target identity.
 * @param {unknown} value Portable definition.
 * @param {DloClient} client Target client.
 * @param {string} dataSpace The run's data space.
 * @param {DloDeployOptions} [options] Data space removal permission.
 * @returns {Promise<DloExecution>} Accepted write or conservative unknown outcome.
 */
export async function executeDloDeploy(
  value: unknown,
  client: DloClient,
  dataSpace: string,
  options: DloDeployOptions = {},
): Promise<DloExecution> {
  const ledger = new WriteLedger();
  const guarded: DloClient = {
    ...client,
    create: async (body) => ledger.run(async () => client.create(body)),
    update: async (id, body) => ledger.run(async () => client.update(id, body)),
    putMembers: async (space, names) => ledger.run(async () => client.putMembers(space, names)),
    removeMember: async (space, name) => ledger.run(async () => client.removeMember(space, name)),
  };
  try {
    const result = await deployNativeDlo(value, guarded, dataSpace, options);
    if (result.operation === 'unchanged')
      return {
        family: 'dlo',
        outcome: 'unchanged',
        mutation: 'not-attempted',
        dataSpaces: result.document.c__dataSpace,
        diagnostics: [],
      };
    return {
      family: 'dlo',
      outcome: result.operation === 'create' ? 'created' : 'updated',
      mutation: result.operation === 'create' ? 'confirmed-created' : 'confirmed-updated',
      ...(result.serverProcessing ? { serverProcessing: true as const } : {}),
      dataSpaces: result.document.c__dataSpace,
      diagnostics: [],
    };
  } catch (error) {
    const failure = ledger.failure(error);
    return {
      family: 'dlo',
      ...failure,
      diagnostics: [
        {
          code: error instanceof DloError ? error.code : 'DLO_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            failure.mutation === 'rejected'
              ? rejectedNextAction
              : failure.mutation === 'unknown'
                ? 'Write outcome is unknown; inspect target before another attempt.'
                : 'Target lookup or definition admission failed; no write attempted.',
          ),
        },
      ],
    };
  }
}
