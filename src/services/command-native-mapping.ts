import { operationDiagnostic } from './operation-diagnostic.js';
import { NativeMappingError } from '../artifacts/native-mapping-document.js';
import { deployNativeMapping, preflightNativeMapping } from './native-mapping.js';
import type { MappingDependencies } from './native-mapping.js';
import type { MappingClient } from '../transport/mapping-rest.js';

type MappingDiagnostic = { code: string; message: string };

/**
 * Information for a create that is the first mapping of a standard DMO; never a refusal.
 * @param {string} dmo Target DMO full name.
 * @returns {MappingDiagnostic} Notice carried by the preview item and the created item.
 */
function activationNotice(dmo: string): MappingDiagnostic {
  return {
    code: 'MAPPING_ACTIVATES_STANDARD_DMO',
    message: `Creating the first mapping onto the standard object ${dmo} activates it permanently: it becomes enabled, gets a category and a generated key qualifier field. Deleting the mapping does not undo this.`,
  };
}

/**
 * Information for pairs whose source and target data types differ; Salesforce accepts them.
 * @param {Array<object>} differences Pairs with both data types.
 * @returns {MappingDiagnostic} Non-blocking preview notice.
 */
function typeNotice(
  differences: NonNullable<Awaited<ReturnType<typeof preflightNativeMapping>>['typeDifferences']>,
): MappingDiagnostic {
  return {
    code: 'MAPPING_FIELD_TYPES_DIFFER',
    message: `These pairs map fields of different data types; Salesforce accepts them: ${differences
      .map(
        ({ source, target, sourceType, targetType }) =>
          `${source} (${sourceType}) -> ${target} (${targetType})`,
      )
      .join(', ')}.`,
  };
}

/**
 * Compare a mapping without exposing payloads or replaying source identity.
 * @param {unknown} value Portable mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target readers.
 * @param {string} [requestScope] Optional request scope forwarded without synthesizing a flag.
 * @returns {Promise<object>} Payload-free preview.
 */
export async function preflightMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
  requestScope?: string,
) {
  const plan = await preflightNativeMapping(value, client, dependencies, requestScope);
  return {
    family: 'mapping' as const,
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-pair-lookup' : 'none',
    diagnostics: [
      ...(plan.activatesStandardDmo
        ? [activationNotice(plan.desired.spec.targetEntityDeveloperName)]
        : []),
      ...(plan.typeDifferences?.length ? [typeNotice(plan.typeDifferences)] : []),
    ] as MappingDiagnostic[],
    plan: [
      ...(plan.removals ?? []).map((pair) => ({
        operation: 'unmap' as const,
        apiName: plan.target!.identity.apiName,
        ...pair,
      })),
      ...plan.writes.flatMap(({ body }) =>
        body.fieldMapping.map((pair) => ({
          operation: plan.operation === 'create' ? ('create' as const) : ('add' as const),
          ...(plan.target ? { apiName: plan.target.identity.apiName } : {}),
          ...pair,
        })),
      ),
    ],
  };
}

/**
 * Track write dispatch conservatively and report independent settlement, not response echoes.
 * @param {unknown} value Portable mapping.
 * @param {MappingClient} client Target mapping transport.
 * @param {MappingDependencies} dependencies Fresh source/target readers.
 * @param {Function} [onUpdated] Receive independently confirmed changes without changing JSON.
 * @param {string} [requestScope] Optional request scope forwarded without synthesizing a flag.
 * @param {Function} [onResolvedName] Receive the independently verified target name for presentation.
 * @returns {Promise<object>} Payload-free execution outcome.
 */
export async function executeMapping(
  value: unknown,
  client: MappingClient,
  dependencies: MappingDependencies,
  onUpdated?: Parameters<typeof deployNativeMapping>[3],
  requestScope?: string,
  onResolvedName?: (apiName: string) => void,
) {
  let dispatched = false;
  const guarded: MappingClient = {
    ...client,
    deleteField: async (name, selector) => {
      dispatched = true;
      return client.deleteField(name, selector);
    },
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
    const result = await deployNativeMapping(value, guarded, dependencies, onUpdated, requestScope);
    if (result.operation !== 'noop') onResolvedName?.(result.document.identity.apiName);
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
      diagnostics: (result.activatesStandardDmo
        ? [activationNotice(result.document.spec.targetEntityDeveloperName)]
        : []) as MappingDiagnostic[],
    };
  } catch (error) {
    return {
      outcome: dispatched ? ('failed' as const) : ('blocked' as const),
      mutation: dispatched ? ('unknown' as const) : ('not-attempted' as const),
      diagnostics: [
        {
          code: error instanceof NativeMappingError ? error.code : 'MAPPING_REQUEST_UNCONFIRMED',
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
