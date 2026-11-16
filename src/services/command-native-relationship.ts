import { operationDiagnostic } from './operation-diagnostic.js';
import { NativeRelationshipError } from '../artifacts/native-relationship-document.js';
import { deployNativeRelationship, preflightNativeRelationship } from './native-relationship.js';
import type { RelationshipClient } from '../transport/relationship-rest.js';
import { WriteLedger, rejectedNextAction } from './deploy-result.js';

/**
 * Compare a relationship with the org read-only, matched by name, else by its binding.
 * @param {unknown} value Portable relationship.
 * @param {Pick<RelationshipClient, 'list' | 'readDefinitions'>} client Relationship reader.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<object>} Payload-free preview.
 */
export async function preflightRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'readDefinitions'>,
  requestScope?: string,
) {
  const plan = await preflightNativeRelationship(value, client, requestScope);
  return {
    family: 'relationship' as const,
    outcome: plan.operation,
    target: plan.operation === 'create' ? ('absent' as const) : ('existing' as const),
    absenceProof: plan.operation === 'create' ? 'confirmed-binding-lookup' : 'none',
    ...(plan.existing ? { targetApiName: plan.existing } : {}),
    ...(plan.changes ? { changes: plan.changes } : {}),
    diagnostics: [] as Array<{ code: string; message: string }>,
  };
}

/**
 * Create a relationship when absent, update it through the Metadata API when it differs, and
 * report independently confirmed settlement. Salesforce's refusal of the item's first write is
 * `rejected`: nothing was written.
 * @param {unknown} value Portable relationship.
 * @param {RelationshipClient} client Relationship transport.
 * @param {string} [requestScope] Optional request scope.
 * @returns {Promise<object>} Payload-free execution outcome.
 */
export async function executeRelationship(
  value: unknown,
  client: Pick<RelationshipClient, 'list' | 'create' | 'readDefinitions' | 'update'>,
  requestScope?: string,
) {
  const ledger = new WriteLedger();
  let writes = 0;
  // Updates Salesforce refused; a refused update is resent once only when the org is unchanged.
  let refused = 0;
  const guarded = {
    list: client.list,
    readDefinitions: client.readDefinitions,
    create: async (body: Parameters<RelationshipClient['create']>[0]) => {
      writes++;
      return ledger.run(async () => client.create(body));
    },
    ...(client.update
      ? {
          update: async (definition: Record<string, unknown>) => {
            writes++;
            try {
              return await ledger.run(async () => client.update!(definition));
            } catch (error) {
              if (
                error instanceof NativeRelationshipError &&
                error.code === 'RELATIONSHIP_UPDATE_REJECTED'
              )
                refused++;
              throw error;
            }
          },
        }
      : {}),
  };
  try {
    const result = await deployNativeRelationship(value, guarded, requestScope);
    return {
      outcome:
        result.operation === 'noop'
          ? ('unchanged' as const)
          : result.operation === 'update'
            ? ('updated' as const)
            : ('created' as const),
      mutation:
        result.operation === 'noop'
          ? ('not-attempted' as const)
          : result.operation === 'update'
            ? ('confirmed-updated' as const)
            : ('confirmed-created' as const),
      targetApiName: result.apiName,
      diagnostics: [] as Array<{ code: string; message: string }>,
    };
  } catch (error) {
    // Salesforce refusing every write (a Metadata API update, and its one resend after an
    // unexpected error on an unchanged org) changed nothing.
    const failure =
      error instanceof NativeRelationshipError &&
      error.code === 'RELATIONSHIP_UPDATE_REJECTED' &&
      writes === refused
        ? { outcome: 'failed' as const, mutation: 'rejected' as const }
        : ledger.failure(error);
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
