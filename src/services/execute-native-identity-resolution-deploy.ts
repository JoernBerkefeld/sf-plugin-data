import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { projectNativeIdentityResolution } from '../artifacts/identity-resolution-document.js';
import type { IdentityResolutionProjection } from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import {
  nativeIdentityResolutionDocument,
  nativeIdentityResolutionConfigurationDelta,
  bindNativeIdentityResolutionPrecreate,
  preflightNativeIdentityResolutionDeploy,
} from './preflight-identity-resolution-deploy.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from './bind-identity-resolution-dependencies.js';
// Native68 retained CREATE was still PUBLISHING at ~78s and PUBLISHED by ~257s.
// Leave room for independently observed ~31s output binding; this is not an API SLA.
export const nativeIdentityResolutionPollBudget = Object.freeze({
  reads: 31,
  intervalMs: 10_000,
  timeoutMs: 360_000,
});

export type NativeIdentityResolutionExecutionOptions = {
  allowProcessing: boolean;
  allowGeneratedOutputProvisioning: boolean;
  verifyInput: () => Promise<void>;
  verifyDependencies?: typeof bindIdentityResolutionDependencies;
  verifyOutputs?: typeof verifyIdentityResolutionOutputs;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type NativeIdentityResolutionDeployExecution = {
  family: 'identity-resolution';
  route: {
    apiVersion: '68.0';
    operation: 'identity-resolutions.post' | 'identity-resolutions.patch';
  };
  outcome: 'unchanged' | 'blocked' | 'created' | 'updated' | 'failed';
  mutation: 'not-attempted' | 'confirmed-created' | 'confirmed-updated' | 'unknown';
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Execute one qualified full-settings native68 CREATE or PATCH, never retrying a write.
 * The caller must stop its batch on unknown mutation; no fallback or rollback exists here.
 * @param {unknown} value Complete portable native68 desired definition.
 * @param {IdentityResolutionTargetConnection} connection Fixed authenticated native68 receiver.
 * @param {ApiVersionSelection} apiVersion Explicit native68 selection.
 * @param {string} dataSpace Explicit default data space.
 * @param {NativeIdentityResolutionExecutionOptions} options Input/effect guards and synthetic read seams.
 * @returns {Promise<NativeIdentityResolutionDeployExecution>} Payload-free mutation evidence.
 */
export async function executeNativeIdentityResolutionDeploy(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  apiVersion: ApiVersionSelection,
  dataSpace: string,
  options: NativeIdentityResolutionExecutionOptions,
): Promise<NativeIdentityResolutionDeployExecution> {
  let attempted = false;
  let acknowledged = false;
  let failureReason = 'verification-failed';
  let expired = false;
  let operation: NativeIdentityResolutionDeployExecution['route']['operation'] =
    'identity-resolutions.patch';
  const result = (
    outcome: NativeIdentityResolutionDeployExecution['outcome'],
    mutation: NativeIdentityResolutionDeployExecution['mutation'],
    code?: string,
  ): NativeIdentityResolutionDeployExecution => ({
    family: 'identity-resolution',
    route: { apiVersion: '68.0', operation },
    outcome,
    mutation,
    diagnostics: code
      ? [
          {
            code,
            message: attempted
              ? `${acknowledged ? 'IR write acknowledged; settlement unconfirmed' : 'IR write acknowledgement unconfirmed'} (${failureReason}). Stop the batch; inspect the exact target. No retry or rollback was performed.`
              : 'IR deployment blocked by input, scope, effects or target verification.',
          },
        ]
      : [],
  });
  try {
    const desired = nativeIdentityResolutionDocument(value);
    const selection = { ...apiVersion };
    const {
      verifyInput,
      verifyDependencies = bindIdentityResolutionDependencies,
      verifyOutputs = verifyIdentityResolutionOutputs,
      now = Date.now,
      delay: wait = delay,
    } = options;
    const scope = (): void => {
      if (expired) throw new Error('Settlement cancelled');
      if (
        selection.requested !== '68.0' ||
        selection.restSelector !== 'v68.0' ||
        selection.soapNumeric !== '68.0' ||
        connection.getApiVersion() !== '68.0' ||
        dataSpace !== 'default' ||
        !isDeepStrictEqual(selection, apiVersion)
      )
        throw new Error('Scope drift');
    };
    scope();
    // Bindings can perform multiple reads internally. Fence their receiver too, so
    // an in-flight read completing after expiration cannot launch its next read.
    const verificationConnection = Object.create(connection) as IdentityResolutionTargetConnection;
    Object.defineProperty(verificationConnection, 'getApiVersion', {
      value: () => {
        scope();
        return connection.getApiVersion();
      },
    });
    Object.defineProperty(verificationConnection, 'request', {
      value: async function (
        this: IdentityResolutionTargetConnection,
        ...arguments_: Parameters<typeof connection.request>
      ) {
        scope();
        const response = await connection.request.apply(this, arguments_);
        scope();
        return response;
      },
    });
    if ('_transport' in connection) {
      const transport = connection._transport as {
        httpRequest: (...arguments_: unknown[]) => Promise<unknown> & { stream: () => unknown };
      };
      const guardedTransport = Object.create(transport) as typeof transport;
      guardedTransport.httpRequest = (...arguments_) => {
        scope();
        const pending = transport.httpRequest(...arguments_);
        const guarded = pending.then((value) => {
          scope();
          return value;
        });
        return Object.assign(guarded, { stream: () => pending.stream() });
      };
      Object.defineProperty(verificationConnection, '_transport', { value: guardedTransport });
    }
    let fingerprint: string | undefined;
    const verify = async (): Promise<{ fingerprint: string }> => {
      scope();
      const proof = await verifyDependencies(
        structuredClone(desired),
        verificationConnection,
        { ...selection },
        dataSpace,
      );
      scope();
      if (
        !/^[a-f0-9]{64}$/u.test(proof?.fingerprint) ||
        (fingerprint !== undefined && fingerprint !== proof.fingerprint)
      )
        throw new Error('Input drift');
      fingerprint = proof.fingerprint;
      return proof;
    };
    const client = new ConnectClient(connection, selection);
    const path = `/services/data/v68.0/ssot/identity-resolutions/${desired.identity.apiName}`;
    const read = (): Promise<unknown> => {
      scope();
      return client.get(path);
    };
    const project = (raw: unknown): IdentityResolutionProjection =>
      projectNativeIdentityResolution(raw, desired.identity.apiName);
    const outputs = async (projection: IdentityResolutionProjection): Promise<unknown> => {
      const expected = projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity: structuredClone(identity),
        targetApiName: sourceApiName,
      }));
      const ownerId = projection.expectations.native.id as string;
      const proof = await verifyOutputs(
        { targetApiName: desired.identity.apiName, targetId: ownerId, dataSpace: 'default' },
        structuredClone(expected),
        verificationConnection,
        { ...selection },
      );
      if (!Array.isArray(proof) || proof.length !== 12) throw new Error('Output proof absent');
      const ids = new Set([ownerId]);
      for (const [index, binding] of proof.entries()) {
        const unified = expected[index].identity.role === 'unified';
        if (
          !isDeepStrictEqual(binding.identity, expected[index].identity) ||
          binding.targetApiName !== expected[index].targetApiName ||
          typeof binding.targetId !== 'string' ||
          !binding.targetId.trim() ||
          ids.has(binding.targetId) ||
          binding.creationType !== (unified ? 'Derived' : 'Bridge') ||
          !Array.isArray(binding.fields) ||
          binding.fields.filter(
            (field) =>
              field.apiName === (unified ? 'ssot__Id__c' : 'UnifiedRecordId__c') &&
              field.dataType === 'Text',
          ).length !== 1
        )
          throw new Error('Output mismatch');
        ids.add(binding.targetId);
      }
      scope();
      return structuredClone(proof);
    };
    await verifyInput();
    const preview = await preflightNativeIdentityResolutionDeploy(
      desired,
      connection,
      selection,
      dataSpace,
      {
        verifyDependencies: async () => {
          await verify();
        },
        verifyPrecreateInputs: verify,
      },
    );
    if (!['create', 'update', 'unchanged'].includes(preview.outcome))
      throw new Error('Admission failed');
    const creating = preview.outcome === 'create';
    operation = creating ? 'identity-resolutions.post' : 'identity-resolutions.patch';
    let baseline: IdentityResolutionProjection | undefined;
    let bound: unknown;
    if (!creating) {
      baseline = project(await read());
      bound = await outputs(baseline);
      if (preview.outcome === 'unchanged' && !isDeepStrictEqual(baseline.candidate, desired))
        throw new Error('Target drift');
      if (
        preview.outcome === 'update' &&
        !nativeIdentityResolutionConfigurationDelta(baseline.candidate, desired)
      )
        throw new Error('Delta refused');
    }
    if (
      preview.outcome !== 'unchanged' &&
      (options.allowProcessing !== true ||
        (creating && options.allowGeneratedOutputProvisioning !== true))
    )
      return result(
        'blocked',
        'not-attempted',
        'IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED',
      );
    await verifyInput();
    await verify();
    if (creating) {
      const fresh = await preflightNativeIdentityResolutionDeploy(
        desired,
        connection,
        selection,
        dataSpace,
        {
          verifyDependencies: async () => {
            await verify();
          },
          verifyPrecreateInputs: verify,
        },
      );
      if (
        preview.outcome !== 'create' ||
        fresh.outcome !== 'create' ||
        !isDeepStrictEqual(preview.precreateBinding, fresh.precreateBinding)
      )
        throw new Error('Precreate drift');
    } else {
      const fresh = project(await read());
      if (!isDeepStrictEqual(fresh, baseline) || !isDeepStrictEqual(bound, await outputs(fresh)))
        throw new Error('Owner drift');
    }
    await verifyInput();
    await verify();
    // The last owner read is an exact absence check for CREATE, never an upsert decision.
    if (creating) {
      const finalBinding = await bindNativeIdentityResolutionPrecreate(
        desired,
        connection,
        selection,
        dataSpace,
        verify,
      );
      if (
        preview.outcome !== 'create' ||
        !isDeepStrictEqual(finalBinding, preview.precreateBinding)
      )
        throw new Error('Final precreate binding drift');
      try {
        await read();
        throw new Error('Owner appeared');
      } catch (error) {
        if (!(
          error instanceof ConnectError &&
          error.statusCode === 404 &&
          error.nativeCode === 'ITEM_NOT_FOUND'
        ))
          throw error;
      }
    } else if (!isDeepStrictEqual(project(await read()), baseline))
      throw new Error('Final owner drift');
    scope();
    if (preview.outcome === 'unchanged') return result('unchanged', 'not-attempted');
    const started = now();
    if (!Number.isFinite(started)) throw new Error('Invalid clock');
    let previous = started;
    const remaining = (): number => {
      const current = now();
      if (!Number.isFinite(current) || current < previous) {
        failureReason = 'invalid-clock';
        throw new Error('Invalid clock');
      }
      previous = current;
      if (current - started >= nativeIdentityResolutionPollBudget.timeoutMs) {
        failureReason = 'deadline-exhausted';
        expired = true;
        throw new Error('Settlement timeout');
      }
      scope();
      return nativeIdentityResolutionPollBudget.timeoutMs - (current - started);
    };
    const deadline = (): void => {
      remaining();
    };
    // A stalled request/binding cannot extend the real deadline. Expiration fences
    // continuations so a late completion cannot schedule another read or confirm success.
    const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const budget = remaining();
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            failureReason = 'deadline-exhausted';
            expired = true;
            reject(new Error('Settlement timeout'));
          }, budget);
        });
        const value = await Promise.race([work(), timeout]);
        deadline();
        return value;
      } finally {
        clearTimeout(timer);
      }
    };
    if (
      options.allowProcessing !== true ||
      (creating && options.allowGeneratedOutputProvisioning !== true)
    )
      return result(
        'blocked',
        'not-attempted',
        'IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED',
      );
    attempted = true;
    const echo = await bounded(async () => {
      const response = creating
        ? await client.createIdentityResolution(desired)
        : await client.patchIdentityResolution(desired);
      acknowledged = true;
      return response;
    });
    // The mutation echo is not authoritative. Only independent owner GETs settle configuration.
    // Retain any returned identity anchors, without requiring a full GET-shaped response.
    if (!echo || typeof echo !== 'object' || Array.isArray(echo))
      throw new Error('Malformed response');
    const response = echo as Record<string, unknown>;
    if (
      !['id', 'objectApiName', 'rulesetStatus'].some((key) => Object.hasOwn(response, key)) ||
      (response.rulesetStatus !== undefined &&
        !['PUBLISHING', 'PUBLISHED'].includes(response.rulesetStatus as string)) ||
      (response.objectApiName !== undefined &&
        response.objectApiName !== desired.identity.apiName) ||
      (response.id !== undefined && (typeof response.id !== 'string' || !response.id.trim())) ||
      (baseline && response.id !== undefined && response.id !== baseline.expectations.native.id)
    )
      throw new Error('Mutation identity mismatch');
    const compare = (raw: unknown): IdentityResolutionProjection => {
      const observed = structuredClone(raw) as Record<string, unknown>;
      if (!observed || !['PUBLISHING', 'PUBLISHED'].includes(observed.rulesetStatus as string))
        throw new Error('Malformed response');
      observed.rulesetStatus = 'PUBLISHED';
      const projection = project(observed);
      if (
        !isDeepStrictEqual(projection.candidate, desired) ||
        (baseline &&
          (projection.expectations.native.id !== baseline.expectations.native.id ||
            !isDeepStrictEqual(projection.expectations.outputs, baseline.expectations.outputs)))
      )
        throw new Error('Readback mismatch');
      return projection;
    };
    let settledIdentity: IdentityResolutionProjection['expectations'] | undefined;
    for (let attempt = 0; attempt < nativeIdentityResolutionPollBudget.reads; attempt++) {
      deadline();
      if (attempt > 0) await bounded(() => wait(nativeIdentityResolutionPollBudget.intervalMs));
      deadline();
      const raw = await bounded(read);
      const settled = compare(raw);
      if (Array.isArray(response.reconciliationRules)) {
        const observedRules = settled.expectations.native.reconciliationRules as Array<
          Record<string, unknown>
        >;
        for (const value of response.reconciliationRules) {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Malformed response identity');
          const anchor = value as Record<string, unknown>;
          const observed = observedRules.find((rule) => rule.entityName === anchor.entityName);
          for (const key of ['unifiedDmoName', 'linkDmoName'])
            if (anchor[key] !== undefined && anchor[key] !== observed?.[key])
              throw new Error('Mutation output identity mismatch');
        }
      }
      if (
        (response.id !== undefined && response.id !== settled.expectations.native.id) ||
        (settledIdentity &&
          (settledIdentity.native.id !== settled.expectations.native.id ||
            !isDeepStrictEqual(settledIdentity.outputs, settled.expectations.outputs)))
      )
        throw new Error('Settlement identity drift');
      settledIdentity = settled.expectations;
      deadline();
      if ((raw as Record<string, unknown>).rulesetStatus !== 'PUBLISHED') continue;
      const settledOutputs = await bounded(() => outputs(settled));
      if (baseline && !isDeepStrictEqual(bound, settledOutputs)) throw new Error('Output drift');
      if (!isDeepStrictEqual(project(await bounded(read)), settled))
        throw new Error('Final settlement drift');
      await bounded(verify);
      deadline();
      return result(
        creating ? 'created' : 'updated',
        creating ? 'confirmed-created' : 'confirmed-updated',
      );
    }
    failureReason = 'read-budget-exhausted';
    throw new Error('Settlement budget exhausted');
  } catch {
    expired = true;
    return attempted
      ? result('failed', 'unknown', 'IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED')
      : result('blocked', 'not-attempted', 'IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED');
  }
}
