import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import {
  identityResolutionName,
  projectIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type { IdentityResolutionDocument } from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';
import { bindIdentityResolutionDependencies } from './bind-identity-resolution-dependencies.js';

export type IdentityResolutionTargetConnection = Pick<
  Connection,
  'instanceUrl' | 'request' | 'getApiVersion'
>;
export type IdentityResolutionPreflightOptions = {
  targetApiName?: string;
  verifyDependencies?: (
    document: IdentityResolutionDocument,
    connection: IdentityResolutionTargetConnection,
    apiVersion: ApiVersionSelection,
    dataSpace: string,
  ) => Promise<void>;
  acquire?: typeof retrieveIdentityResolution;
};
export type IdentityResolutionDeployPreview = {
  family: 'identity-resolution';
  outcome: 'update' | 'unchanged' | 'blocked-changes' | 'blocked';
  target: 'present' | 'unknown';
  absenceProof: 'none';
  route: { apiVersion: '67.0'; operation: 'd360_ir_update' };
  requiredEffects: Array<'publication' | 'generated-output-provisioning'>;
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Preview an explicitly bound existing PUBLISHED owner; never infer absence or authorize writes.
 * Dependency verification defaults to independent bounded target DMO/Metadata compatibility reads.
 * Label/description edits are not qualified by evidence that only preserved those values.
 * @param {unknown} value Complete authored desired configuration.
 * @param {IdentityResolutionTargetConnection} connection Authenticated numeric API67 target.
 * @param {ApiVersionSelection} apiVersion Explicit frozen API67 selection.
 * @param {string} dataSpace Explicit default target space.
 * @param {IdentityResolutionPreflightOptions} options Exact owner binding and fresh compatibility verifier.
 * @returns {Promise<IdentityResolutionDeployPreview>} Payload-free read-only classification.
 */
export async function preflightIdentityResolutionDeploy(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: IdentityResolutionPreflightOptions = {},
): Promise<IdentityResolutionDeployPreview> {
  const result = (
    outcome: IdentityResolutionDeployPreview['outcome'],
    target: IdentityResolutionDeployPreview['target'],
    code?: string,
  ): IdentityResolutionDeployPreview => ({
    family: 'identity-resolution',
    outcome,
    target,
    absenceProof: 'none',
    route: { apiVersion: '67.0', operation: 'd360_ir_update' },
    requiredEffects: outcome === 'update' ? ['publication', 'generated-output-provisioning'] : [],
    diagnostics: code
      ? [
          {
            code,
            message:
              'IR preview is not execution authorization. Resolve target, dependency or configuration qualification before deployment.',
          },
        ]
      : [],
  });
  let desired: IdentityResolutionDocument;
  try {
    desired = validateIdentityResolutionDocument(value);
  } catch {
    return result('blocked', 'unknown', 'INVALID_SOURCE');
  }
  try {
    if (
      apiVersion?.requested !== '67.0' ||
      apiVersion.restSelector !== 'v67.0' ||
      apiVersion.soapNumeric !== '67.0' ||
      connection.getApiVersion() !== '67.0' ||
      dataSpace !== 'default' ||
      !identityResolutionName.test(desired.identity.apiName) ||
      (options.targetApiName !== undefined && options.targetApiName !== desired.identity.apiName)
    )
      return result('blocked', 'unknown', 'INVALID_SCOPE');
    // Snapshot caller-owned routing/options before asynchronous reads; never derive names from suffixes.
    const targetApiName = desired.identity.apiName;
    const selection = { ...apiVersion };
    const acquire = options.acquire ?? retrieveIdentityResolution;
    const verify = options.verifyDependencies ?? bindIdentityResolutionDependencies;
    if (typeof verify !== 'function')
      return result('blocked', 'unknown', 'IDENTITY_RESOLUTION_DEPENDENCY_VERIFIER_REQUIRED');
    // Verification must independently read existing target dependencies on every invocation, including equality.
    await verify(structuredClone(desired), connection, { ...selection }, dataSpace);
    const acquired = await acquire(connection, targetApiName, selection, dataSpace);
    if (
      !acquired.candidate ||
      !acquired.expectations ||
      !Array.isArray(acquired.blockers) ||
      acquired.blockers.length > 0
    )
      return result('blocked', 'unknown', 'IDENTITY_RESOLUTION_CREATE_AND_TARGET_UNQUALIFIED');
    // Re-project independent full representations instead of trusting a candidate or injected success flag.
    const projection = projectIdentityResolution(
      acquired.expectations.facade,
      acquired.expectations.native,
      targetApiName,
    );
    if (
      !isDeepStrictEqual(acquired.identity, desired.identity) ||
      !isDeepStrictEqual(
        validateIdentityResolutionDocument(acquired.candidate),
        projection.candidate,
      ) ||
      !isDeepStrictEqual(acquired.expectations.outputs, projection.expectations.outputs)
    )
      return result('blocked', 'unknown', 'IDENTITY_RESOLUTION_TARGET_CORRELATION_MISMATCH');
    const current = projection.candidate;
    if (isDeepStrictEqual(current, desired)) return result('unchanged', 'present');
    // Only the first entity's LastUpdated -> MostFrequent delta is evidenced. All six generated
    // reconciliation entries and ordered matching semantics remain in the full comparison.
    const expected = structuredClone(current);
    if (expected.spec.reconciliationRules[0].ruleType !== 'LastUpdated')
      return result('blocked-changes', 'present', 'IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED');
    expected.spec.reconciliationRules[0].ruleType = 'MostFrequent';
    return isDeepStrictEqual(expected, desired)
      ? result('update', 'present')
      : result('blocked-changes', 'present', 'IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED');
  } catch {
    return result('blocked', 'unknown', 'IDENTITY_RESOLUTION_TARGET_OR_DEPENDENCY_UNQUALIFIED');
  }
}
