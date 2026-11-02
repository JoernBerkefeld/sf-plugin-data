import { NativeMappingError } from '../artifacts/native-mapping-document.js';
import { deployNativeMapping, preflightNativeMapping } from './native-mapping.js';
import type { MappingDependencies } from './native-mapping.js';
import type { MappingClient } from '../transport/mapping-rest.js';

/**
 * Compare a mapping without exposing payloads or replaying source identity.
 * @param {unknown} value Portable mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target readers.
 * @returns {Promise<object>} Payload-free preview.
 */
export async function preflightMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
) {
  const plan = await preflightNativeMapping(value, client, dependencies);
  return {
    family: 'mapping' as const,
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-pair-lookup' : 'none',
    diagnostics: [],
  };
}

/**
 * Track write dispatch conservatively and report independent settlement, not response echoes.
 * @param {unknown} value Portable mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target readers.
 * @returns {Promise<object>} Payload-free execution outcome.
 */
export async function executeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
) {
  let dispatched = false;
  const guarded: MappingClient = {
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
    const result = await deployNativeMapping(value, guarded, dependencies);
    return {
      outcome:
        result.operation === 'noop'
          ? ('unchanged' as const)
          : result.operation === 'create'
            ? ('created' as const)
            : ('updated' as const),
      mutation:
        result.operation === 'noop'
          ? ('not-attempted' as const)
          : result.operation === 'create'
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
          code: error instanceof NativeMappingError ? error.code : 'MAPPING_REQUEST_UNCONFIRMED',
          message: 'Deployment stopped; inspect unknown outcomes before another attempt.',
        },
      ],
    };
  }
}
