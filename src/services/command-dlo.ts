import { operationDiagnostic } from './operation-diagnostic.js';
import { DloError } from '../artifacts/dlo-document.js';
import { preflightNativeDlo, deployNativeDlo } from './native-dlo.js';
import type { DloClient } from '../transport/dlo-rest.js';

export type DloPreview = {
  family: 'dlo';
  outcome: 'create' | 'update' | 'unchanged' | 'blocked';
  target: 'absent' | 'existing' | 'unknown';
  absenceProof: 'confirmed-404' | 'none';
  diagnostics: Array<{ code: string; message: string }>;
};
export type DloExecution = {
  family: 'dlo';
  outcome: 'created' | 'updated' | 'unchanged' | 'failed' | 'blocked';
  mutation: 'confirmed-created' | 'confirmed-updated' | 'unknown' | 'not-attempted';
  diagnostics: Array<{ code: string; message: string }>;
};
/**
 * Compare a portable definition without mutation.
 * @param {unknown} value Portable definition.
 * @param {DloClient} client Target API client.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<DloPreview>} Payload-free comparison.
 */
export async function preflightDloDeploy(
  value: unknown,
  client: DloClient,
  requestScope?: string,
): Promise<DloPreview> {
  const plan = await preflightNativeDlo(value, client, requestScope);
  return {
    family: 'dlo',
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-404' : 'none',
    diagnostics: [],
  };
}
/**
 * Deploy through freshly resolved target identity.
 * @param {unknown} value Portable definition.
 * @param {DloClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<DloExecution>} Accepted write or conservative unknown outcome.
 */
export async function executeDloDeploy(
  value: unknown,
  client: DloClient,
  requestScope?: string,
): Promise<DloExecution> {
  let dispatched = false;
  const guarded: DloClient = {
    ...client,
    create: async (body) => {
      dispatched = true;
      return client.create(body);
    },
    update: async (id, body) => {
      dispatched = true;
      return client.update(id, body);
    },
  };
  try {
    const result = await deployNativeDlo(value, guarded, requestScope);
    if (result.operation === 'unchanged')
      return {
        family: 'dlo',
        outcome: 'unchanged',
        mutation: 'not-attempted',
        diagnostics: [],
      };
    return {
      family: 'dlo',
      outcome: result.operation === 'create' ? 'created' : 'updated',
      mutation: result.operation === 'create' ? 'confirmed-created' : 'confirmed-updated',
      diagnostics: [],
    };
  } catch (error) {
    return {
      family: 'dlo',
      outcome: dispatched ? 'failed' : 'blocked',
      mutation: dispatched ? 'unknown' : 'not-attempted',
      diagnostics: [
        {
          code: error instanceof DloError ? error.code : 'DLO_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            dispatched
              ? 'Write outcome is unknown; inspect target before another attempt.'
              : 'Target lookup or definition admission failed; no write attempted.',
          ),
        },
      ],
    };
  }
}
