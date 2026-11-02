import { NativeDmoError } from '../artifacts/native-dmo-document.js';
import { preflightNativeDmo, deployNativeDmo } from './native-dmo.js';
import type { DmoClient } from '../transport/dmo-rest.js';

/**
 * Compare an exact native DMO without mutation.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @returns {Promise<object>} Payload-free comparison.
 */
export async function preflightDmo(value: unknown, client: DmoClient) {
  const plan = await preflightNativeDmo(value, client);
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
 * @returns {Promise<object>} Payload-free outcome.
 */
export async function executeDmo(value: unknown, client: DmoClient) {
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
    const result = await deployNativeDmo(value, guarded);
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
          message: 'Deployment stopped; inspect unknown outcomes before another attempt.',
        },
      ],
    };
  }
}
