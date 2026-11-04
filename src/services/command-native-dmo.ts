import { operationDiagnostic } from './operation-diagnostic.js';
import { NativeDmoError } from '../artifacts/native-dmo-document.js';
import { preflightNativeDmo, deployNativeDmo } from './native-dmo.js';
import type { DmoClient } from '../transport/dmo-rest.js';

/**
 * Compare an exact native DMO without mutation.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<object>} Payload-free comparison.
 */
export async function preflightDmo(value: unknown, client: DmoClient, requestScope?: string) {
  const plan = await preflightNativeDmo(value, client, requestScope);
  return {
    family: 'dmo' as const,
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-404' : 'none',
    diagnostics: [],
  };
}
/**
 * Execute one write with conservative dispatch evidence and independent readback.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @returns {Promise<object>} Payload-free outcome.
 */
export async function executeDmo(value: unknown, client: DmoClient, requestScope?: string) {
  let dispatched = false;
  const guarded: DmoClient = {
    ...client,
    create: async (body) => {
      dispatched = true;
      return client.create(body);
    },
    update: async (name, body) => {
      dispatched = true;
      return client.update(name, body);
    },
  };
  try {
    const result = await deployNativeDmo(value, guarded, requestScope);
    if (result.operation === 'unchanged')
      return {
        outcome: 'unchanged' as const,
        mutation: 'not-attempted' as const,
        diagnostics: [],
      };
    return {
      outcome: result.operation === 'create' ? ('created' as const) : ('updated' as const),
      mutation:
        result.operation === 'create'
          ? ('confirmed-created' as const)
          : ('confirmed-updated' as const),
      diagnostics: [],
    };
  } catch (error) {
    return {
      outcome: dispatched ? ('failed' as const) : ('blocked' as const),
      mutation: dispatched ? ('unknown' as const) : ('not-attempted' as const),
      diagnostics: [
        {
          code: error instanceof NativeDmoError ? error.code : 'DMO_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            dispatched
              ? 'Write outcome is unknown; inspect target before another attempt. No automatic retry.'
              : 'No write attempted; correct the reported check before another attempt.',
          ),
        },
      ],
    };
  }
}
