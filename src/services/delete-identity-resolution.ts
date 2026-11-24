import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  IdentityResolutionError,
  identityResolutionSpace,
  identityResolutionSpaceMismatch,
  observeIdentityResolutionOwner,
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import { isDataSpaceName } from '../artifacts/data-space-field.js';
import type {
  IdentityResolutionDocument,
  IdentityResolutionProjection,
} from '../artifacts/identity-resolution-document.js';
import { isVerbatimDocument, verbatimDataSpace } from '../artifacts/verbatim-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { inFlightIdentityResolutionStatuses } from './preflight-identity-resolution-deploy.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from './bind-identity-resolution-dependencies.js';
import { explanationOf, operationDiagnostic } from './operation-diagnostic.js';

export const identityResolutionDeleteBudget = Object.freeze({
  timeoutMs: 180_000,
  reads: 13,
  intervalMs: 10_000,
});
export type IdentityResolutionDeleteOptions = {
  preview?: boolean;
  confirmDelete: boolean;
  verifyInput: () => Promise<void>;
  verifyDependencies?: typeof bindIdentityResolutionDependencies;
  verifyOutputs?: typeof verifyIdentityResolutionOutputs;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
};
export type IdentityResolutionDeleteResult = {
  family: 'identity-resolution';
  route: { apiVersion: '68.0'; operation: 'identity-resolutions.delete' };
  outcome: 'delete' | 'deleted' | 'deletion-processing' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-deleted' | 'acknowledged-processing' | 'unknown';
  requiredEffects: Array<'destructive'>;
  diagnostics: Array<{ code: string; message: string }>;
};

type Projection = Omit<IdentityResolutionProjection, 'candidate'> & {
  candidate?: IdentityResolutionDocument;
};

/**
 * The owner of a raw GET, checked only for what names it (the same name; its data space is
 * checked before); used for a verbatim file, whose ruleset the plugin cannot model.
 * @param {unknown} raw Raw GET response.
 * @param {string} apiName Selected name.
 * @returns {Projection} The owner as read, without run statistics, and no outputs.
 */
function rawOwner(raw: unknown, apiName: string): Projection {
  const native = observeIdentityResolutionOwner(raw);
  if (native.objectApiName !== apiName) throw new Error('Owner identity');
  return { expectations: { native, outputs: [] } };
}

/**
 * Delete one matching settled native68 owner definition without replay.
 * Generated definitions are bound before dispatch but never manually deleted. Input/output
 * compatibility is not exhaustive inbound-consumer exclusion or physical profile cleanup.
 * @param {unknown} value Immutable local configuration expectation, not ownership authority.
 * @param {IdentityResolutionTargetConnection} connection Authenticated fixed receiver.
 * @param {ApiVersionSelection} selection Explicit native68 route.
 * @param {string} dataSpace The run's data space; the file and the org ruleset must be in it.
 * @param {IdentityResolutionDeleteOptions} options Confirmation, input guard and private test seams.
 * @returns {Promise<IdentityResolutionDeleteResult>} Payload-free independently observed outcome.
 */
export async function deleteIdentityResolution(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  options: IdentityResolutionDeleteOptions,
): Promise<IdentityResolutionDeleteResult> {
  let attempted = false;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = (
    outcome: IdentityResolutionDeleteResult['outcome'],
    code?: string,
    error?: unknown,
  ): IdentityResolutionDeleteResult =>
    retainConnectDiagnostic(
      {
        family: 'identity-resolution',
        route: { apiVersion: '68.0', operation: 'identity-resolutions.delete' },
        outcome,
        mutation: attempted
          ? outcome === 'deleted'
            ? 'confirmed-deleted'
            : outcome === 'deletion-processing'
              ? 'acknowledged-processing'
              : 'unknown'
          : 'not-attempted',
        requiredEffects: outcome === 'delete' ? ['destructive'] : [],
        diagnostics: code
          ? [
              {
                code,
                message: operationDiagnostic(
                  error,
                  attempted
                    ? 'IR deletion may have occurred; owner absence is unconfirmed. No replay, fallback or rollback was performed.'
                    : 'IR deletion was not attempted; input, scope, definition, lifecycle or binding is unqualified.',
                ),
              },
            ]
          : [],
      },
      getConnectDiagnostic(error),
    );
  try {
    // Read as retrieve writes it: the file and the GET may keep keys the plugin does not model.
    // A verbatim file (a ruleset the plugin cannot model) is deleted by name.
    const verbatim = isVerbatimDocument(value, 'identity-resolution');
    const admit = (): IdentityResolutionDocument =>
      verbatim
        ? ({
            c__dataSpace: verbatimDataSpace(value),
            identity: { apiName: value.identity.apiName },
          } as IdentityResolutionDocument)
        : validateIdentityResolutionDocument(value, 'retrieve');
    const desired = admit();
    if (desired.c__dataSpace !== dataSpace)
      throw identityResolutionSpaceMismatch(
        desired.identity.apiName,
        desired.c__dataSpace,
        dataSpace,
        'file',
      );
    const frozen = { ...selection };
    const origin = connection.instanceUrl;
    const request = connection.request;
    const now = options.now ?? Date.now;
    const wait = options.delay ?? delay;
    const started = now();
    let previous = started;
    const check = (): void => {
      const current = now();
      if (
        expired ||
        !Number.isFinite(started) ||
        !Number.isFinite(current) ||
        current < previous ||
        current - started >= identityResolutionDeleteBudget.timeoutMs ||
        frozen.requested !== '68.0' ||
        frozen.restSelector !== 'v68.0' ||
        frozen.soapNumeric !== '68.0' ||
        !isDeepStrictEqual(selection, frozen) ||
        connection.getApiVersion() !== '68.0' ||
        connection.instanceUrl !== origin ||
        connection.request !== request ||
        !isDataSpaceName(dataSpace)
      )
        throw new Error('Scope or deadline');
      previous = current;
    };
    check();
    if (
      typeof options.verifyInput !== 'function' ||
      ('preview' in options && typeof options.preview !== 'boolean')
    )
      throw new Error('Intent');
    const verifyInput = options.verifyInput;
    const preview = options.preview === true;
    const confirmed = options.confirmDelete;
    const input = async (): Promise<void> => {
      check();
      await verifyInput();
      check();
      if (
        (options.preview === true) !== preview ||
        options.confirmDelete !== confirmed ||
        !isDeepStrictEqual(desired, admit())
      )
        throw new Error('Input drift');
    };
    // Fence every dependency-reader request as well as owner reads after cancellation.
    const receiver = Object.create(connection) as IdentityResolutionTargetConnection;
    Object.defineProperty(receiver, 'getApiVersion', {
      value: () => {
        check();
        return connection.getApiVersion();
      },
    });
    Object.defineProperty(receiver, 'request', {
      value: async function (
        this: IdentityResolutionTargetConnection,
        ...arguments_: Parameters<typeof connection.request>
      ) {
        check();
        const response = await request.apply(this, arguments_);
        check();
        return response;
      },
    });
    if ('_transport' in connection) {
      const transport = connection._transport as {
        httpRequest: (...arguments_: unknown[]) => Promise<unknown> & { stream: () => unknown };
      };
      const guarded = Object.create(transport) as typeof transport;
      guarded.httpRequest = (...arguments_) => {
        check();
        const pending = transport.httpRequest(...arguments_);
        const observed = pending.then((response) => {
          check();
          return response;
        });
        return Object.assign(observed, { stream: () => pending.stream() });
      };
      Object.defineProperty(receiver, '_transport', { value: guarded });
    }
    const client = new ConnectClient(receiver, frozen);
    const base = '/services/data/v68.0/ssot/identity-resolutions/';
    const read = async (identity: string): Promise<unknown | undefined> => {
      check();
      try {
        const raw = await client.get(`${base}${identity}`);
        check();
        if (raw === undefined) throw new Error('Malformed read');
        return raw;
      } catch (error) {
        check();
        if (
          error instanceof ConnectError &&
          error.statusCode === 404 &&
          error.nativeCode === 'ITEM_NOT_FOUND'
        )
          return undefined;
        throw error;
      }
    };
    const project = (raw: unknown): Projection => {
      // The ruleset's real data space, read before anything is projected.
      const found = identityResolutionSpace(raw);
      if (found !== dataSpace)
        throw identityResolutionSpaceMismatch(desired.identity.apiName, found, dataSpace, 'org');
      return verbatim
        ? rawOwner(raw, desired.identity.apiName)
        : projectNativeIdentityResolution(raw, desired.identity.apiName, 'retrieve');
    };
    const work = async (): Promise<IdentityResolutionDeleteResult> => {
      await input();
      const raw = await read(desired.identity.apiName);
      if (raw === undefined) {
        await input();
        if ((await read(desired.identity.apiName)) !== undefined) throw new Error('Owner appeared');
        return result('unchanged');
      }
      const baseline = project(raw);
      const id = baseline.expectations.native.id;
      if (
        typeof id !== 'string' ||
        !/^1ir[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(id) ||
        (!verbatim && !isDeepStrictEqual(baseline.candidate, desired))
      )
        throw new Error('Owner mismatch');
      // A DELETE while the API is still processing the ruleset could not be told apart from it.
      if (
        inFlightIdentityResolutionStatuses.includes(
          String(baseline.expectations.native.rulesetStatus),
        )
      )
        return result('blocked', 'IDENTITY_RESOLUTION_NOT_SETTLED');
      if (!isDeepStrictEqual(project(await read(id)), baseline))
        throw new Error('Identity mismatch');
      // Existing binders establish selected input/output compatibility, not reverse consumers.
      // A verbatim file names no inputs or outputs the plugin can bind; it goes by its name.
      const dependencies = verbatim
        ? { fingerprint: '0'.repeat(64) }
        : await (options.verifyDependencies ?? bindIdentityResolutionDependencies)(
            structuredClone(desired),
            receiver,
            { ...frozen },
            dataSpace,
            undefined,
            'retrieve',
          );
      check();
      if (!/^[a-f0-9]{64}$/u.test(dependencies?.fingerprint)) throw new Error('Dependency proof');
      const expected = baseline.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity: structuredClone(identity),
        targetApiName: sourceApiName,
      }));
      const outputs = verbatim
        ? []
        : await (options.verifyOutputs ?? verifyIdentityResolutionOutputs)(
            { targetApiName: desired.identity.apiName, targetId: id, dataSpace },
            expected,
            receiver,
            { ...frozen },
            undefined,
            undefined,
            'retrieve',
          );
      check();
      if (!Array.isArray(outputs) || outputs.length !== expected.length)
        throw new Error('Output proof');
      const ids = new Set([id]);
      for (const [index, binding] of outputs.entries()) {
        if (
          !isDeepStrictEqual(binding.identity, expected[index].identity) ||
          binding.targetApiName !== expected[index].targetApiName ||
          typeof binding.targetId !== 'string' ||
          !binding.targetId.trim() ||
          ids.has(binding.targetId)
        )
          throw new Error('Output mismatch');
        ids.add(binding.targetId);
      }
      await input();
      if (
        !isDeepStrictEqual(project(await read(desired.identity.apiName)), baseline) ||
        !isDeepStrictEqual(project(await read(id)), baseline)
      )
        throw new Error('Owner drift');
      await input();
      if (preview) return result('delete');
      if (options.confirmDelete !== true) return result('blocked', 'CONFIRMATION_REQUIRED');
      attempted = true;
      await client.deleteIdentityResolution(id);
      check();
      for (let attempt = 0; attempt < identityResolutionDeleteBudget.reads; attempt++) {
        if (attempt > 0) {
          check();
          await wait(identityResolutionDeleteBudget.intervalMs);
        }
        check();
        const byId = await read(id);
        const byName = await read(desired.identity.apiName);
        if (byId === undefined && byName === undefined) return result('deleted');
        for (const observed of [byId, byName]) {
          if (observed === undefined) continue;
          const transitional = structuredClone(observed) as Record<string, unknown>;
          if (!transitional || transitional.rulesetStatus !== 'DELETING')
            throw new Error('Not deleting');
          // An acknowledged DELETE can strip reconciliation/output references while DELETING.
          // Restore only the evidenced empty array for comparison, never for absence or replay.
          if (isDeepStrictEqual(transitional.reconciliationRules, []))
            transitional.reconciliationRules = structuredClone(
              baseline.expectations.native.reconciliationRules,
            );
          transitional.rulesetStatus = baseline.expectations.native.rulesetStatus;
          if (!isDeepStrictEqual(project(transitional), baseline))
            throw new Error('Readback drift');
        }
        if (byId !== undefined && byName !== undefined) return result('deletion-processing');
      }
      check();
      throw new Error('Read budget');
    };
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('Deadline'));
        }, identityResolutionDeleteBudget.timeoutMs);
      }),
    ]);
  } catch (error) {
    // A file or ruleset of another data space, or a component it names there: its own code.
    if (!attempted && error instanceof IdentityResolutionError && /DATASPACE/u.test(error.code))
      return {
        ...result('blocked'),
        diagnostics: [{ code: error.code, message: explanationOf(error) ?? error.message }],
      };
    return result(
      attempted ? 'failed' : 'blocked',
      attempted
        ? 'IDENTITY_RESOLUTION_DELETION_UNCONFIRMED'
        : 'IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED',
      error,
    );
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}
