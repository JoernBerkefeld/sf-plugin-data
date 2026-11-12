import { operationDiagnostic } from './operation-diagnostic.js';
import { NativeRelationshipError } from '../artifacts/native-relationship-document.js';
import { deployNativeRelationship, preflightNativeRelationship } from './native-relationship.js';
import type { RelationshipClient } from '../transport/relationship-rest.js';
import { WriteLedger, rejectedNextAction } from './deploy-result.js';

/**
 * Compare a relationship with the org read-only, matched by its binding.
 * @param {unknown} value Portable relationship.
 * @param {Pick<RelationshipClient, 'list'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<object>} Payload-free preview.
 */
export async function preflightRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list'>,
  requestScope?: string,
) {
  const plan = await preflightNativeRelationship(value, client, requestScope);
  return {
    family: 'relationship' as const,
    outcome: plan.operation,
    target: plan.operation === 'create' ? ('absent' as const) : ('existing' as const),
    absenceProof: plan.operation === 'create' ? 'confirmed-binding-lookup' : 'none',
    ...(plan.existing ? { targetApiName: plan.existing } : {}),
    diagnostics: [] as Array<{ code: string; message: string }>,
  };
}

/**
 * Create a relationship once when absent and report independently confirmed settlement.
 * @param {unknown} value Portable relationship.
 * @param {RelationshipClient} client Relationship transport.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<object>} Payload-free execution outcome.
 */
export async function executeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'create'>,
  requestScope?: string,
) {
  const ledger = new WriteLedger();
  const guarded = {
    list: client.list,
    create: async (body: Parameters<RelationshipClient['create']>[0]) =>
      ledger.run(async () => client.create(body)),
  };
  try {
    const result = await deployNativeRelationship(value, guarded, requestScope);
    return {
      outcome: result.operation === 'noop' ? ('unchanged' as const) : ('created' as const),
      mutation:
        result.operation === 'noop' ? ('not-attempted' as const) : ('confirmed-created' as const),
      targetApiName: result.apiName,
      diagnostics: [] as Array<{ code: string; message: string }>,
    };
  } catch (error) {
    const failure = ledger.failure(error);
    return {
      ...failure,
      diagnostics: [
        {
          code:
            error instanceof NativeRelationshipError
              ? error.code
              : 'RELATIONSHIP_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            failure.mutation === 'rejected'
              ? rejectedNextAction
              : failure.mutation === 'unknown'
                ? 'Write outcome is unknown; list the source DMO relationships before another attempt. No automatic retry.'
                : 'No write attempted; correct the reported check before another attempt.',
          ),
        },
      ],
    };
  }
}
