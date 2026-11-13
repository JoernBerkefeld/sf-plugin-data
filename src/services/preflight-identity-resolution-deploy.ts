import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Connection } from '@salesforce/core';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { operationDiagnostic } from './operation-diagnostic.js';
import {
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionReconciliationSettings,
} from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { bindIdentityResolutionDependencies } from './bind-identity-resolution-dependencies.js';
import { errorCodeInfo } from '../errors/registry.js';

/**
 * Admit a complete authored definition for the native68 route; the API decides its settings.
 * @param {unknown} value Complete portable definition.
 * @returns {IdentityResolutionDocument} Detached native68 definition.
 */
export function nativeIdentityResolutionDocument(value: unknown): IdentityResolutionDocument {
  return validateIdentityResolutionDocument(value);
}

/**
 * Build the CREATE input from the document, never replaying source IDs or generated names.
 * The API names a ruleset `<type>_<rulesetId>`, so the ruleset ID is everything after the
 * type and its underscore; a name equal to the type creates the default ruleset (no ID).
 * Preflight refuses names that are neither (IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH).
 * @param {unknown} value Complete native68 portable definition.
 * @returns {Record<string, unknown>} Detached native request, not execution authorization.
 */
export function buildNativeIdentityResolutionCreate(value: unknown): Record<string, unknown> {
  const document = nativeIdentityResolutionDocument(value);
  const name = document.identity.apiName;
  const prefix = `${document.spec.configurationType}_`;
  const rulesetId = name.toLowerCase().startsWith(prefix.toLowerCase())
    ? name.slice(prefix.length)
    : '';
  return {
    configurationType: document.spec.configurationType,
    ...(rulesetId ? { rulesetId } : {}),
    dataSpaceName: document.identity.dataSpace,
    secondaryDmo: document.spec.secondaryDmo.apiName,
    ...buildNativeIdentityResolutionUpdate(document),
  };
}

/**
 * Serialize the complete qualified parent PATCH shape without generated output identities.
 * Empty explicit overrides reset fields to object inheritance; source order is semantic.
 * @param {unknown} value Complete native68 desired definition.
 * @param {unknown} [current] Current target definition, when updating.
 * @returns {Record<string, unknown>} Detached input-shaped configuration.
 */
export function buildNativeIdentityResolutionUpdate(
  value: unknown,
  current?: unknown,
): Record<string, unknown> {
  const document = nativeIdentityResolutionDocument(value);
  const existing = current === undefined ? undefined : nativeIdentityResolutionDocument(current);
  const settings = (item: IdentityResolutionReconciliationSettings): Record<string, unknown> => ({
    ruleType: item.ruleType,
    shouldIgnoreEmptyValue: item.shouldIgnoreEmptyValue,
    sources: item.sources.map((source) => ({ name: source.apiName })),
  });
  // Empty filters and trusted sources stay omitted, as in the proven requests, unless the
  // existing ruleset has entries: then the empty list is sent and the API decides.
  const lists = Object.fromEntries(
    (['filters', 'trustedSources'] as const)
      .filter(
        (key) => (document.spec[key]?.length ?? 0) > 0 || (existing?.spec[key]?.length ?? 0) > 0,
      )
      .map((key) => [key, document.spec[key] ?? []]),
  );
  return {
    label: document.spec.label,
    description: document.spec.description,
    doesRunAutomatically: document.spec.doesRunAutomatically,
    isCaseSensitive: document.spec.isCaseSensitive,
    ...lists,
    matchRules: document.spec.matchRules.map((rule) => ({
      label: rule.label,
      criteria: rule.criteria.map((criterion) => ({
        entityName: criterion.field.parentApiName,
        fieldName: criterion.field.apiName,
        matchMethodType: criterion.matchMethodType,
        shouldMatchOnBlank: criterion.shouldMatchOnBlank,
        caseSensitiveMatch: criterion.caseSensitiveMatch,
        ...(criterion.partyIdentificationInfo
          ? { partyIdentificationInfo: criterion.partyIdentificationInfo }
          : {}),
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
 * Compare complete configuration while retaining exact logical owner identity.
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
  // PATCH carries neither configuration type nor secondary DMO, so it cannot change them.
  return (
    isDeepStrictEqual(expected.identity, desired.identity) &&
    expected.spec.configurationType === desired.spec.configurationType &&
    isDeepStrictEqual(expected.spec.secondaryDmo, desired.spec.secondaryDmo) &&
    !isDeepStrictEqual(expected, desired)
  );
}

export const inFlightIdentityResolutionStatuses = ['PUBLISHING', 'DELETING'];

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
        // The API names a new ruleset `<type>_<rulesetId>` (or `<type>`); a file name that
        // does not follow it would create a ruleset under another name than the file's.
        const name = desired.identity.apiName.toLowerCase();
        const type = desired.spec.configurationType.toLowerCase();
        if (name !== type && !(name.startsWith(`${type}_`) && name.length > type.length + 1))
          throw new Error('IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH');
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
    const projection = projectNativeIdentityResolution(raw, desired.identity.apiName);
    const current = projection.candidate;
    if (!isDeepStrictEqual(selection, frozen) || connection.getApiVersion() !== '68.0')
      throw new Error('INVALID_SCOPE');
    // A write while the API is still processing the ruleset could not be told apart from it.
    if (
      inFlightIdentityResolutionStatuses.includes(
        String(projection.expectations.native.rulesetStatus),
      )
    )
      throw new Error('IDENTITY_RESOLUTION_NOT_SETTLED');
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
    const fallback =
      errorCodeInfo(code)?.hint ??
      'The identity resolution deployment did not pass the plugin checks.';
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
  verifyDependencies?: (
    document: IdentityResolutionDocument,
    connection: IdentityResolutionTargetConnection,
    apiVersion: ApiVersionSelection,
    dataSpace: string,
  ) => Promise<void>;
};
