import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import {
  identityResolutionName,
  projectIdentityResolution,
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionReconciliationSettings,
} from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { retrieveLegacyIdentityResolution as retrieveIdentityResolution } from './retrieve-identity-resolution.js';
import { bindIdentityResolutionDependencies } from './bind-identity-resolution-dependencies.js';

/**
 * Admit only the empirically qualified native68 authored variant.
 * Legacy artifacts must be explicitly migrated by retrieval, never silently normalized.
 * @param {unknown} value Complete portable definition.
 * @returns {IdentityResolutionDocument} Detached native68 definition.
 */
export function nativeIdentityResolutionDocument(value: unknown): IdentityResolutionDocument {
  const document = validateIdentityResolutionDocument(value);
  if (!Object.hasOwn(document.spec, 'trustedSources'))
    throw new Error('IDENTITY_RESOLUTION_TRUSTED_SOURCES_MIGRATION_REQUIRED');
  if (!/^Individual(?:_[A-Za-z0-9]{1,4})?$/u.test(document.identity.apiName))
    throw new Error('IDENTITY_RESOLUTION_NATIVE68_VARIANT_UNQUALIFIED');
  return document;
}

/**
 * Build the complete proven CREATE input, never replay source IDs or generated names.
 * Authored empty trusted sources remain in the document but are omitted from the request.
 * @param {unknown} value Complete native68 portable definition.
 * @returns {Record<string, unknown>} Detached native request, not execution authorization.
 */
export function buildNativeIdentityResolutionCreate(value: unknown): Record<string, unknown> {
  const document = nativeIdentityResolutionDocument(value);
  return {
    configurationType: 'Individual',
    ...(document.identity.apiName === 'Individual'
      ? {}
      : { rulesetId: document.identity.apiName.slice('Individual_'.length) }),
    dataSpaceName: document.identity.dataSpace,
    secondaryDmo: document.spec.secondaryDmo.apiName,
    ...buildNativeIdentityResolutionUpdate(document),
  };
}

/**
 * Serialize the complete qualified parent PATCH shape without generated output identities.
 * Empty explicit overrides reset fields to object inheritance; source order is semantic.
 * @param {unknown} value Complete native68 desired definition.
 * @returns {Record<string, unknown>} Detached input-shaped configuration.
 */
export function buildNativeIdentityResolutionUpdate(value: unknown): Record<string, unknown> {
  const document = nativeIdentityResolutionDocument(value);
  const settings = (item: IdentityResolutionReconciliationSettings): Record<string, unknown> => ({
    ruleType: item.ruleType,
    shouldIgnoreEmptyValue: item.shouldIgnoreEmptyValue,
    sources: item.sources.map((source) => ({ name: source.apiName })),
  });
  return {
    label: document.spec.label,
    description: document.spec.description,
    doesRunAutomatically: document.spec.doesRunAutomatically,
    isCaseSensitive: document.spec.isCaseSensitive,
    matchRules: document.spec.matchRules.map((rule) => ({
      label: rule.label,
      criteria: rule.criteria.map((criterion) => ({
        entityName: criterion.field.parentApiName,
        fieldName: criterion.field.apiName,
        matchMethodType: criterion.matchMethodType,
        shouldMatchOnBlank: criterion.shouldMatchOnBlank,
        caseSensitiveMatch: criterion.caseSensitiveMatch,
      })),
    })),
    reconciliationRules: document.spec.reconciliationRules.map((rule) => ({
      entityName: rule.entity.apiName,
      ...settings(rule),
      fields: rule.fields.map((override) => ({
        fieldName: override.field.apiName,
        ...settings(override),
      })),
    })),
  };
}

/**
 * Compare complete supported configuration while retaining exact logical owner identity.
 * @param {unknown} current Independently projected settled target.
 * @param {unknown} value Complete desired definition.
 * @returns {boolean} Qualified full supported configuration semantic delta.
 */
export function nativeIdentityResolutionConfigurationDelta(
  current: unknown,
  value: unknown,
): boolean {
  const expected = nativeIdentityResolutionDocument(current);
  const desired = nativeIdentityResolutionDocument(value);
  return (
    isDeepStrictEqual(expected.identity, desired.identity) && !isDeepStrictEqual(expected, desired)
  );
}

/**
 * Hash private binding evidence without exposing target resource identities.
 * @param {unknown} input Complete detached binding evidence.
 * @returns {string} SHA256 digest.
 */
function bindingDigest(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export type NativeIdentityResolutionPrecreateBinding = {
  phase: 'precreate';
  inputsFingerprint: string;
  fingerprint: string;
};

/**
 * Bind desired configuration and verified inputs without guessing future output names.
 * This is drift evidence only, never a substitute for settled owner/output proof.
 * @param {unknown} value Complete qualified native68 source.
 * @param {IdentityResolutionTargetConnection} connection Native68 receiver.
 * @param {ApiVersionSelection} selection Explicit native68 selection.
 * @param {string} dataSpace Exact default space.
 * @param {Function} verifyDependencies Fresh input identity/field/key verifier.
 * @returns {Promise<NativeIdentityResolutionPrecreateBinding>} Private non-authorizing binding.
 */
export async function bindNativeIdentityResolutionPrecreate(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  verifyDependencies = bindIdentityResolutionDependencies,
): Promise<NativeIdentityResolutionPrecreateBinding> {
  const desired = nativeIdentityResolutionDocument(value);
  const frozen = { ...selection };
  const checkScope = (): void => {
    if (
      frozen.requested !== '68.0' ||
      frozen.restSelector !== 'v68.0' ||
      frozen.soapNumeric !== '68.0' ||
      connection.getApiVersion() !== '68.0' ||
      dataSpace !== 'default' ||
      !isDeepStrictEqual(selection, frozen)
    )
      throw new Error('INVALID_SCOPE');
  };
  checkScope();
  const inputs = await verifyDependencies(
    structuredClone(desired),
    connection,
    { ...frozen },
    dataSpace,
  );
  checkScope();
  if (!/^[a-f0-9]{64}$/u.test(inputs?.fingerprint))
    throw new Error('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED');
  return {
    phase: 'precreate',
    inputsFingerprint: inputs.fingerprint,
    fingerprint: bindingDigest({ phase: 'precreate', desired, inputs }),
  };
}

type NativeIdentityResolutionExistingPreview = {
  family: 'identity-resolution';
  outcome: 'unchanged' | 'update' | 'blocked' | 'blocked-changes';
  target: 'present' | 'absent' | 'unknown';
  absenceProof: 'none' | 'exact-item-not-found';
  route: { apiVersion: '68.0'; operation: 'identity-resolutions.patch' };
  requiredEffects: Array<'processing'>;
  diagnostics: Array<{ code: string; message: string }>;
};
export type NativeIdentityResolutionCreatePreview = {
  family: 'identity-resolution';
  outcome: 'create';
  target: 'absent';
  absenceProof: 'exact-item-not-found';
  route: { apiVersion: '68.0'; operation: 'identity-resolutions.post' };
  requiredEffects: Array<'processing' | 'generated-output-provisioning'>;
  diagnostics: [];
  precreateBinding: NativeIdentityResolutionPrecreateBinding;
};
export type NativeIdentityResolutionPreview =
  NativeIdentityResolutionExistingPreview | NativeIdentityResolutionCreatePreview;

/**
 * Read-only native68 admission; exact absence plus compatible input binding previews CREATE.
 * Outputs are allocated by POST and require independent settled owner/output binding afterward.
 * This preview alone is not write authorization; historical public deploy remains separate.
 * @param {unknown} value Complete authored document.
 * @param {IdentityResolutionTargetConnection} connection Explicit native68 receiver.
 * @param {ApiVersionSelection} selection Explicit native68 route.
 * @param {string} dataSpace Exact default space.
 * @param {object} options Private independent dependency reader seam.
 * @param {Function} [options.verifyDependencies] Input-only dependency verification.
 * @returns {Promise<NativeIdentityResolutionPreview>} Payload-free non-authorizing preview.
 */
export async function preflightNativeIdentityResolutionDeploy(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: Pick<IdentityResolutionPreflightOptions, 'verifyDependencies'> & {
    verifyPrecreateInputs?: typeof bindIdentityResolutionDependencies;
  } = {},
): Promise<NativeIdentityResolutionPreview> {
  const result: NativeIdentityResolutionPreview = {
    family: 'identity-resolution',
    outcome: 'blocked',
    target: 'unknown',
    absenceProof: 'none',
    route: { apiVersion: '68.0', operation: 'identity-resolutions.patch' },
    requiredEffects: [],
    diagnostics: [],
  };
  try {
    const desired = nativeIdentityResolutionDocument(value);
    const frozen = { ...selection };
    if (
      frozen.requested !== '68.0' ||
      frozen.restSelector !== 'v68.0' ||
      frozen.soapNumeric !== '68.0' ||
      connection.getApiVersion() !== '68.0' ||
      dataSpace !== 'default'
    )
      throw new Error('INVALID_SCOPE');
    const verify = options.verifyDependencies ?? bindIdentityResolutionDependencies;
    await verify(structuredClone(desired), connection, { ...frozen }, dataSpace);
    const client = new ConnectClient(connection, frozen);
    let raw: unknown;
    try {
      raw = await client.get(
        `/services/data/v68.0/ssot/identity-resolutions/${desired.identity.apiName}`,
      );
    } catch (error) {
      if (
        error instanceof ConnectError &&
        error.statusCode === 404 &&
        error.nativeCode === 'ITEM_NOT_FOUND'
      ) {
        result.target = 'absent';
        result.absenceProof = 'exact-item-not-found';
        const precreateBinding = await bindNativeIdentityResolutionPrecreate(
          desired,
          connection,
          frozen,
          dataSpace,
          options.verifyPrecreateInputs,
        );
        if (!isDeepStrictEqual(selection, frozen) || connection.getApiVersion() !== '68.0')
          throw new Error('INVALID_SCOPE');
        return {
          family: 'identity-resolution',
          outcome: 'create',
          target: 'absent',
          absenceProof: 'exact-item-not-found',
          route: { apiVersion: '68.0', operation: 'identity-resolutions.post' },
          requiredEffects: ['processing', 'generated-output-provisioning'],
          diagnostics: [],
          precreateBinding,
        };
      }
      throw retainConnectDiagnostic(
        new Error('IDENTITY_RESOLUTION_TARGET_UNQUALIFIED'),
        getConnectDiagnostic(error),
      );
    }
    const current = projectNativeIdentityResolution(raw, desired.identity.apiName).candidate;
    if (!isDeepStrictEqual(selection, frozen) || connection.getApiVersion() !== '68.0')
      throw new Error('INVALID_SCOPE');
    result.target = 'present';
    result.outcome = isDeepStrictEqual(current, desired)
      ? 'unchanged'
      : nativeIdentityResolutionConfigurationDelta(current, desired)
        ? 'update'
        : 'blocked-changes';
    if (result.outcome === 'update') result.requiredEffects = ['processing'];
    if (result.outcome === 'blocked-changes')
      throw new Error('IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED');
  } catch (error) {
    const code =
      error instanceof Error &&
      /^(?:IDENTITY_RESOLUTION_[A-Z0-9_]+|INVALID_SCOPE)$/u.test(error.message)
        ? error.message
        : 'IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED';
    const fallback = 'Native68 IR deployment admission is incomplete or unqualified.';
    retainConnectDiagnostic(result, getConnectDiagnostic(error));
    result.diagnostics = [
      {
        code,
        message: getConnectDiagnostic(error) ? operationDiagnostic(error, fallback) : fallback,
      },
    ];
  }
  return result;
}

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
    evidence?: unknown,
  ): IdentityResolutionDeployPreview =>
    retainConnectDiagnostic(
      {
        family: 'identity-resolution',
        outcome,
        target,
        absenceProof: 'none',
        route: { apiVersion: '67.0', operation: 'd360_ir_update' },
        requiredEffects:
          outcome === 'update' ? ['publication', 'generated-output-provisioning'] : [],
        diagnostics: code
          ? [
              {
                code,
                message: getConnectDiagnostic(evidence)
                  ? operationDiagnostic(
                      evidence,
                      'IR preview is not execution authorization. Resolve target, dependency or configuration qualification before deployment.',
                    )
                  : 'IR preview is not execution authorization. Resolve target, dependency or configuration qualification before deployment.',
              },
            ]
          : [],
      },
      getConnectDiagnostic(evidence),
    );
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
      return result(
        'blocked',
        'unknown',
        'IDENTITY_RESOLUTION_CREATE_AND_TARGET_UNQUALIFIED',
        acquired,
      );
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
  } catch (error) {
    return result(
      'blocked',
      'unknown',
      'IDENTITY_RESOLUTION_TARGET_OR_DEPENDENCY_UNQUALIFIED',
      error,
    );
  }
}
