import { isDeepStrictEqual } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import {
  projectIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionOutputIdentity,
  IdentityResolutionProjection,
} from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { McpExecuteClient } from '../transport/mcp-execute.js';
import { ConnectClient } from '../transport/connect-client.js';
import { preflightIdentityResolutionDeploy } from './preflight-identity-resolution-deploy.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from './bind-identity-resolution-dependencies.js';

export const identityResolutionPollBudget = Object.freeze({
  reads: 12,
  intervalMs: 1000,
  timeoutMs: 120_000,
});
export type IdentityResolutionOutputBinding = {
  identity: IdentityResolutionOutputIdentity;
  targetApiName: string;
  targetId: string;
  creationType: 'Derived' | 'Bridge';
  fields: Array<{ apiName: string; dataType: 'Text' }>;
};
export type IdentityResolutionPollEvidence = {
  attempt: number;
  timestamp: number;
  statusPresent: boolean;
  statusType: string;
  statusValue: unknown;
};
export type IdentityResolutionExecutionOptions = {
  targetApiName: string;
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  verifyDependencies?: (
    document: IdentityResolutionDocument,
    connection: IdentityResolutionTargetConnection,
    selection: ApiVersionSelection,
    dataSpace: string,
  ) => Promise<{ fingerprint: string }>;
  verifyOutputs?: (
    owner: { targetApiName: string; targetId: string; dataSpace: 'default' },
    outputs: Array<{ identity: IdentityResolutionOutputIdentity; targetApiName: string }>,
    connection: IdentityResolutionTargetConnection,
    selection: ApiVersionSelection,
  ) => Promise<IdentityResolutionOutputBinding[]>;
  recordPoll?: (evidence: IdentityResolutionPollEvidence) => Promise<void>;
  acquire?: typeof retrieveIdentityResolution;
  readFacade?: (targetApiName: string) => Promise<unknown>;
  readNative?: (targetApiName: string) => Promise<unknown>;
  mutate?: (parameters: unknown) => Promise<unknown>;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type IdentityResolutionDeployExecution = {
  family: 'identity-resolution';
  route: { apiVersion: '67.0'; operation: 'd360_ir_update' };
  outcome: 'unchanged' | 'blocked' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-updated' | 'unknown';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Execute only the qualified existing-owner reconciliation delta with fresh production binding defaults.
 * Verifiers must independently read target dependencies/output definitions, not attest cached or source data.
 * @param {unknown} value Complete portable desired document.
 * @param {IdentityResolutionTargetConnection} connection Authenticated numeric API67 target.
 * @param {ApiVersionSelection} apiVersion Explicit fixed facade version.
 * @param {string} dataSpace Explicit default space.
 * @param {IdentityResolutionExecutionOptions} options Input/effect guards and private synthetic seams.
 * @returns {Promise<IdentityResolutionDeployExecution>} Payload-free conservative mutation evidence.
 */
export async function executeIdentityResolutionDeploy(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: IdentityResolutionExecutionOptions,
): Promise<IdentityResolutionDeployExecution> {
  const result = (
    outcome: IdentityResolutionDeployExecution['outcome'],
    mutation: IdentityResolutionDeployExecution['mutation'],
    code?: string,
  ): IdentityResolutionDeployExecution => ({
    family: 'identity-resolution',
    route: { apiVersion: '67.0', operation: 'd360_ir_update' },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message:
              mutation === 'unknown'
                ? 'IR mutation may have occurred. Inspect the exact target; no retry or rollback was performed.'
                : 'IR deployment blocked. Resolve input, effects, scope or target verification.',
          },
        ]
      : [],
  });
  let attempted = false;
  try {
    const desired = validateIdentityResolutionDocument(value);
    const selection = { ...apiVersion };
    const {
      targetApiName,
      allowProcessing,
      verifyInput,
      verifyDependencies = bindIdentityResolutionDependencies,
      verifyOutputs = verifyIdentityResolutionOutputs,
      recordPoll,
      acquire = retrieveIdentityResolution,
      now = Date.now,
      delay = setTimeout,
      readFacade: injectedRead,
      readNative: injectedNative,
      mutate: injectedMutate,
    } = options;
    if (
      typeof verifyInput !== 'function' ||
      typeof verifyDependencies !== 'function' ||
      typeof verifyOutputs !== 'function'
    )
      return result('blocked', 'not-attempted', 'IDENTITY_RESOLUTION_VERIFIERS_REQUIRED');
    const scope = (): void => {
      if (
        selection.requested !== '67.0' ||
        selection.restSelector !== 'v67.0' ||
        selection.soapNumeric !== '67.0' ||
        connection.getApiVersion() !== '67.0' ||
        dataSpace !== 'default' ||
        !/^Individual_[A-Za-z0-9]{4}$/u.test(targetApiName) ||
        !isDeepStrictEqual(apiVersion, selection)
      )
        throw new Error('Scope drift');
    };
    scope();
    let dependency: string | undefined;
    const verify = async (): Promise<void> => {
      scope();
      const proof = await verifyDependencies(
        structuredClone(desired),
        connection,
        { ...selection },
        dataSpace,
      );
      if (
        !proof ||
        typeof proof.fingerprint !== 'string' ||
        !proof.fingerprint.trim() ||
        (dependency !== undefined && proof.fingerprint !== dependency)
      )
        throw new Error('Dependency drift');
      dependency = proof.fingerprint;
    };
    const capture = async (): Promise<IdentityResolutionProjection> => {
      scope();
      const acquired = await acquire(
        connection,
        targetApiName,
        desired.identity.logicalName,
        { ...selection },
        dataSpace,
      );
      if (
        !acquired.candidate ||
        !acquired.expectations ||
        !Array.isArray(acquired.blockers) ||
        acquired.blockers.length > 0 ||
        !isDeepStrictEqual(acquired.identity, desired.identity)
      )
        throw new Error('Target unavailable');
      const projected = projectIdentityResolution(
        acquired.expectations.facade,
        acquired.expectations.native,
        targetApiName,
        desired.identity.logicalName,
      );
      if (
        !isDeepStrictEqual(
          validateIdentityResolutionDocument(acquired.candidate),
          projected.candidate,
        ) ||
        !isDeepStrictEqual(acquired.expectations.outputs, projected.expectations.outputs)
      )
        throw new Error('Target mismatch');
      return projected;
    };
    const outputs = async (
      projection: IdentityResolutionProjection,
    ): Promise<IdentityResolutionOutputBinding[]> => {
      const expected = projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity: structuredClone(identity),
        targetApiName: sourceApiName,
      }));
      const proof = structuredClone(
        await verifyOutputs(
          {
            targetApiName,
            targetId: projection.expectations.facade.id as string,
            dataSpace: 'default',
          },
          structuredClone(expected),
          connection,
          { ...selection },
        ),
      );
      if (!Array.isArray(proof) || proof.length !== 12) throw new Error('Output proof absent');
      const ids = new Set<string>();
      for (const [index, binding] of proof.entries()) {
        const role = expected[index].identity.role;
        const field = role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c';
        if (
          !isDeepStrictEqual(binding.identity, expected[index].identity) ||
          binding.targetApiName !== expected[index].targetApiName ||
          typeof binding.targetId !== 'string' ||
          !binding.targetId.trim() ||
          ids.has(binding.targetId) ||
          binding.creationType !== (role === 'unified' ? 'Derived' : 'Bridge') ||
          !Array.isArray(binding.fields) ||
          binding.fields.filter((item) => item.apiName === field && item.dataType === 'Text')
            .length !== 1
        )
          throw new Error('Output verification failed');
        ids.add(binding.targetId);
      }
      return proof;
    };
    await verifyInput();
    const preview = await preflightIdentityResolutionDeploy(
      desired,
      connection,
      selection,
      dataSpace,
      {
        targetApiName,
        acquire,
        verifyDependencies: verify,
      },
    );
    if (preview.outcome !== 'unchanged' && preview.outcome !== 'update')
      return result('blocked', 'not-attempted', 'IDENTITY_RESOLUTION_TARGET_UNQUALIFIED');
    if (preview.outcome === 'update' && allowProcessing !== true)
      return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    const baseline = await capture();
    const bound = await outputs(baseline);
    await verifyInput();
    await verify();
    const fresh = await capture();
    if (!isDeepStrictEqual(baseline, fresh) || !isDeepStrictEqual(bound, await outputs(fresh)))
      throw new Error('Target or output binding drift');
    await verifyInput();
    scope();
    if (!isDeepStrictEqual(fresh, await capture())) throw new Error('Final target drift');
    scope();
    if (isDeepStrictEqual(fresh.candidate, desired)) return result('unchanged', 'not-attempted');
    const admitted = structuredClone(fresh.candidate);
    if (admitted.spec.reconciliationRules[0].ruleType !== 'LastUpdated')
      throw new Error('Delta refused');
    admitted.spec.reconciliationRules[0].ruleType = 'MostFrequent';
    if (!isDeepStrictEqual(admitted, desired)) throw new Error('Delta refused');
    if (allowProcessing !== true)
      return result('blocked', 'not-attempted', 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
    // A private recorder is mandatory for updates; no raw observation enters public results.
    if (typeof recordPoll !== 'function')
      return result('blocked', 'not-attempted', 'IDENTITY_RESOLUTION_POLL_RECORDER_REQUIRED');
    const client = new McpExecuteClient(connection, selection);
    const read =
      injectedRead ?? ((name: string) => client.read('d360_ir_get', { identityResolution: name }));
    const readNative =
      injectedNative ??
      ((name: string) =>
        new ConnectClient(connection, '65.0').get(
          `/services/data/v65.0/ssot/identity-resolutions/${name}`,
        ));
    const mutate =
      injectedMutate ?? ((parameters: unknown) => client.mutate('d360_ir_update', parameters));
    const parameters = {
      identityResolution: targetApiName,
      input: {
        label: desired.spec.label,
        description: desired.spec.description,
        doesRunAutomatically: false,
        matchRules: {
          rules: desired.spec.matchRules.map((rule) => ({
            label: rule.label,
            criteria: {
              criteria: rule.criteria.map((criterion) => ({
                entityName: criterion.field.parentApiName,
                fieldName: criterion.field.apiName,
                matchMethodType: criterion.matchMethodType,
                shouldMatchOnBlank: false,
              })),
            },
          })),
        },
        reconciliationRules: {
          rules: [
            {
              entityName: 'ssot__Individual__dlm',
              ruleType: 'MostFrequent',
              shouldIgnoreEmptyValue: true,
            },
          ],
        },
      },
    };
    const expected = structuredClone(fresh.expectations.facade);
    (expected.reconciliationRules as Array<Record<string, unknown>>)[0].ruleType = 'mostfrequent';
    const started = now();
    if (!Number.isFinite(started)) throw new Error('Invalid clock');
    attempted = true;
    const echo = await mutate(parameters);
    // Even a qualified echo is not settlement; malformed/error responses retain uncertainty.
    const echoRecord = echo as Record<string, unknown>;
    const echoStatus = echoRecord?.rulesetStatus;
    if (echoStatus !== 'PUBLISHING' && echoStatus !== 'PUBLISHED') throw new Error('Invalid echo');
    const compare = (observed: unknown): void => {
      const raw = structuredClone(observed) as Record<string, unknown>;
      raw.rulesetStatus = 'PUBLISHED';
      if (!isDeepStrictEqual(raw, expected)) throw new Error('Readback drift');
    };
    compare(echo);
    const elapsed = (): number => {
      const duration = now() - started;
      if (
        !Number.isFinite(duration) ||
        duration < 0 ||
        duration >= identityResolutionPollBudget.timeoutMs
      )
        throw new Error('Deadline exceeded');
      return duration;
    };
    for (let attempt = 0; attempt < identityResolutionPollBudget.reads; attempt++) {
      elapsed();
      if (attempt > 0) await delay(identityResolutionPollBudget.intervalMs);
      elapsed();
      let observation: unknown;
      try {
        observation = await read(targetApiName);
      } catch {
        // The frozen transport can reject malformed application status before returning a body.
        // Record unavailable status explicitly; never invent a value or expose the rejected payload.
        await recordPoll({
          attempt,
          timestamp: now(),
          statusPresent: false,
          statusType: 'unavailable',
          statusValue: undefined,
        });
        throw new Error('Poll read failed');
      }
      const descriptor =
        observation && typeof observation === 'object'
          ? Object.getOwnPropertyDescriptor(observation, 'rulesetStatus')
          : undefined;
      const status =
        descriptor && 'value' in descriptor ? (descriptor.value as unknown) : undefined;
      await recordPoll({
        attempt,
        timestamp: now(),
        statusPresent: descriptor !== undefined,
        statusType: typeof status,
        statusValue: structuredClone(status),
      });
      // Recorder runs before any status or complete-payload classification, including failures.
      if (status !== 'PUBLISHING' && status !== 'PUBLISHED') throw new Error('Unexpected status');
      compare(observation);
      elapsed();
      if (status === 'PUBLISHING') continue;
      const native = await readNative(targetApiName);
      const settled = projectIdentityResolution(
        observation,
        native,
        targetApiName,
        desired.identity.logicalName,
      );
      if (
        !isDeepStrictEqual(settled.candidate, desired) ||
        !isDeepStrictEqual(settled.expectations.facade, expected) ||
        !isDeepStrictEqual(bound, await outputs(settled))
      )
        throw new Error('Settled readback drift');
      await verify();
      elapsed();
      return result('updated', 'confirmed-updated');
    }
    return result('failed', 'unknown', 'IDENTITY_RESOLUTION_SETTLEMENT_UNCONFIRMED');
  } catch {
    return attempted
      ? result('failed', 'unknown', 'IDENTITY_RESOLUTION_UPDATE_UNCONFIRMED')
      : result('blocked', 'not-attempted', 'IDENTITY_RESOLUTION_ADMISSION_FAILED');
  }
}
