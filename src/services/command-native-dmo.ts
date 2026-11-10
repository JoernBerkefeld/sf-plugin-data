import { operationDiagnostic } from './operation-diagnostic.js';
import { NativeDmoError } from '../artifacts/native-dmo-document.js';
import { preflightNativeDmo, deployNativeDmo } from './native-dmo.js';
import type { NativeDmoDeployOptions } from './native-dmo.js';
import type { DmoClient } from '../transport/dmo-rest.js';

export type DmoPreview = {
  family: 'dmo';
  outcome: 'create' | 'update' | 'unchanged';
  target: 'absent' | 'existing';
  absenceProof: 'confirmed-404' | 'none';
  /** Custom target fields a deploy with --allow-field-removal removes. */
  removeFields?: string[];
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Compare an exact native DMO without mutation.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoDeployOptions} [options] Opt-in field removal.
 * @returns {Promise<DmoPreview>} Payload-free comparison naming any planned field removals.
 */
export async function preflightDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  options: NativeDmoDeployOptions = {},
): Promise<DmoPreview> {
  const plan = await preflightNativeDmo(value, client, requestScope, options);
  const removeFields = plan.operation === 'update' ? plan.removeFields : undefined;
  return {
    family: 'dmo',
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-404' : 'none',
    ...(removeFields ? { removeFields } : {}),
    diagnostics: removeFields
      ? [
          {
            code: 'DMO_FIELD_REMOVAL_PLANNED',
            message: `Fields missing from the file are removed with one Metadata API destructive change: ${removeFields.join(', ')}.`,
          },
        ]
      : [],
  };
}
/**
 * Execute at most one PATCH and one field removal with conservative dispatch evidence and
 * independent readback.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {NativeDmoDeployOptions} [options] Opt-in field removal.
 * @returns {Promise<object>} Payload-free outcome.
 */
export async function executeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  options: NativeDmoDeployOptions = {},
) {
  let dispatched = false;
  const remove = client.removeFields;
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
    ...(remove
      ? {
          removeFields: async (name: string, fieldNames: string[]) => {
            dispatched = true;
            return remove(name, fieldNames);
          },
        }
      : {}),
  };
  try {
    const result = await deployNativeDmo(value, guarded, requestScope, undefined, options);
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
      ...(result.removedFields ? { removedFields: result.removedFields } : {}),
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
