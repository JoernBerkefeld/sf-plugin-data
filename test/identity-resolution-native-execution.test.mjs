import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  executeNativeIdentityResolutionDeploy,
  nativeIdentityResolutionPollBudget,
} from '../lib/services/execute-native-identity-resolution-deploy.js';
import { buildNativeIdentityResolutionUpdate } from '../lib/services/preflight-identity-resolution-deploy.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import {
  expandedNativeIrFixture,
  nativeIrFixture,
  nativeSelection,
} from './identity-resolution-fixtures.mjs';

/**
 * Construct a native-only synthetic transport with independently mutable reads and writes.
 * @param {boolean} creating Whether the target is initially absent.
 * @returns {object} Executor harness and counters.
 */
function harness(creating = true) {
  const raw = nativeIrFixture();
  for (const [index, rule] of raw.reconciliationRules.entries()) {
    rule.unifiedDmoName = `UnrelatedAllocated${index}__dlm`;
    rule.linkDmoName = `OtherServerLink${index}__dlm`;
  }
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const h = {
    raw,
    desired,
    writes: [],
    gets: 0,
    inputChecks: 0,
    inputBindings: 0,
    outputs: 0,
    present: !creating,
    afterWrite: false,
  };
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    _refreshDelegate: {
      refresh: () => {
        throw new Error('Must never refresh');
      },
    },
    request: async function (request, options) {
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.equal(typeof options.followRedirect, 'function');
      if (request.method !== 'GET') {
        h.writes.push(structuredClone(request));
        h.afterWrite = true;
        if (h.writeFailure) return h.writeFailure(options);
        h.present = true;
        const payload = JSON.parse(request.body);
        for (const key of ['label', 'description', 'doesRunAutomatically', 'isCaseSensitive'])
          raw[key] = payload[key];
        for (const key of ['filters', 'trustedSources'])
          if (Object.hasOwn(payload, key)) raw[key] = payload[key];
        raw.matchRules = payload.matchRules.map((rule) => ({
          ...rule,
          criteria: rule.criteria.map((criterion) => ({
            ...criterion,
            matchMethodType: criterion.matchMethodType.toLowerCase(),
          })),
        }));
        raw.reconciliationRules = payload.reconciliationRules.map((rule, index) => ({
          ...raw.reconciliationRules[index],
          ...rule,
          ruleType: rule.ruleType.toLowerCase(),
          fields: rule.fields.map((override) => ({
            ...override,
            ruleType: override.ruleType.toLowerCase(),
          })),
        }));
        return h.echo ? h.echo() : structuredClone(raw);
      }
      assert.equal(request.url.includes('/data-model-objects?'), false);
      h.gets++;
      if (h.ownerRead) return h.ownerRead();
      if (!h.present)
        throw {
          statusCode: 404,
          name: 'ITEM_NOT_FOUND',
          errorCode: 'ITEM_NOT_FOUND',
          data: { errorCode: 'ITEM_NOT_FOUND', message: 'No owner' },
        };
      return structuredClone(raw);
    },
  };
  const options = {
    allowProcessing: true,
    allowGeneratedOutputProvisioning: true,
    verifyInput: async () => {
      h.inputChecks++;
      if (h.checkInput) await h.checkInput();
    },
    verifyDependencies: async () => {
      h.inputBindings++;
      return { fingerprint: h.fingerprint ?? 'a'.repeat(64) };
    },
    verifyOutputs: async (owner, outputs) => {
      h.outputs++;
      assert.equal(owner.targetId, raw.id);
      assert.deepEqual(
        outputs.map((output) => output.targetApiName),
        raw.reconciliationRules.flatMap((rule) => [rule.unifiedDmoName, rule.linkDmoName]),
      );
      const proof = outputs.map((output, index) => ({
        ...output,
        targetId: `allocated-id-${index}`,
        creationType: output.identity.role === 'unified' ? 'Derived' : 'Bridge',
        fields: [
          {
            apiName: output.identity.role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c',
            dataType: 'Text',
          },
        ],
      }));
      if (h.changeProof) h.changeProof(proof);
      return proof;
    },
    delay: async () => {},
  };
  const run = () =>
    executeNativeIdentityResolutionDeploy(desired, connection, nativeSelection, 'default', options);
  return Object.assign(h, { connection, options, run });
}

test('native IR write rejection keeps uncertainty, one attempt and safe actionable evidence', async () => {
  for (const message of [
    'Reduce the ruleset count to 10.',
    'password=never-display-this',
    'Internal Server Error',
  ]) {
    const h = harness();
    h.writeFailure = async () => {
      throw { statusCode: 400, data: [{ errorCode: 'INVALID_INPUT', message }] };
    };
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(result.diagnostics[0].code, 'IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED');
    assert.equal(h.writes.length, 1);
    assert.equal(h.outputs, 0);
    assert.match(result.diagnostics[0].message, /HTTP 400.*INVALID_INPUT/u);
    assert.match(
      result.diagnostics[0].message,
      /IR write acknowledgement unconfirmed.*No retry or rollback/u,
    );
    if (message.startsWith('Reduce')) assert.ok(result.diagnostics[0].message.includes(message));
    else assert.ok(!JSON.stringify(result).includes(message));
  }
});

test('native IR acknowledged write preserves output-verification API evidence without replay', async () => {
  const h = harness();
  h.options.verifyOutputs = async () => {
    const { apiDiagnostic, retainConnectDiagnostic } =
      await import('../lib/transport/connect-diagnostic.js');
    throw retainConnectDiagnostic(
      new Error('Output verification unavailable'),
      apiDiagnostic(503, [{ errorCode: 'UNAVAILABLE', message: 'Internal Server Error' }]),
    );
  };
  const result = await h.run();
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED');
  assert.equal(h.writes.length, 1);
  assert.match(result.diagnostics[0].message, /HTTP 503/u);
  assert.match(result.diagnostics[0].message, /IR write acknowledged; settlement unconfirmed/u);
  assert.doesNotMatch(
    JSON.stringify(result),
    /Internal Server Error|Output verification unavailable/u,
  );
});

test('native IR preflight rejection reaches execution result without attempting a mutation', async () => {
  const h = harness();
  h.ownerRead = async () => {
    throw { statusCode: 500, data: 'unclear private body' };
  };
  const result = await h.run();
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(h.writes.length, 0);
  assert.match(result.diagnostics[0].message, /HTTP 500.*could not be verified before the write/u);
  assert.doesNotMatch(JSON.stringify(result), /unclear private body/u);
});

test('native CREATE without DMO enumeration verifies server-returned outputs and sends exactly one full POST', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.outcome, 'created');
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'POST');
  assert.equal(h.writes[0].url.endsWith('/v68.0/ssot/identity-resolutions'), true);
  assert.equal(JSON.parse(h.writes[0].body).rulesetId, 'A1b2');
  assert.equal(Object.hasOwn(JSON.parse(h.writes[0].body), 'trustedSources'), false);
  assert.equal(h.writes[0].body.includes('UnrelatedAllocated'), false);
  assert.equal(h.outputs, 1);
  assert.equal(JSON.stringify(result).includes('allocated'), false);
});

test('native delayed publication beyond historical 12 reads confirms only independent PUBLISHED and outputs', async () => {
  const h = harness();
  let clock = 0;
  let polls = 0;
  h.options.now = () => clock;
  h.options.delay = async (milliseconds) => {
    clock += milliseconds;
  };
  h.echo = () => ({ id: h.raw.id, rulesetStatus: 'PUBLISHING' });
  const verifyOutputs = h.options.verifyOutputs;
  h.options.verifyOutputs = async (...arguments_) => {
    clock += 31_000;
    return verifyOutputs(...arguments_);
  };
  h.ownerRead = () => {
    if (!h.afterWrite)
      throw {
        statusCode: 404,
        name: 'ITEM_NOT_FOUND',
        errorCode: 'ITEM_NOT_FOUND',
        data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
      };
    polls++;
    return {
      ...structuredClone(h.raw),
      rulesetStatus: clock < 260_000 ? 'PUBLISHING' : 'PUBLISHED',
    };
  };
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-created');
  assert.ok(polls > 12);
  assert.equal(clock, 291_000);
  assert.equal(h.outputs, 1);
  assert.equal(h.writes.length, 1);
});

for (const reason of ['read-budget-exhausted', 'deadline-exhausted', 'verification-failed'])
  test(`native acknowledged write reports ${reason} without confirmation or replay`, async () => {
    const h = harness();
    let clock = 0;
    let polls = 0;
    h.options.now = () => clock;
    h.options.delay = async (milliseconds) => {
      clock +=
        reason === 'deadline-exhausted'
          ? nativeIdentityResolutionPollBudget.timeoutMs
          : milliseconds;
    };
    h.echo = () => {
      h.raw.rulesetStatus = 'PUBLISHING';
      return { id: h.raw.id };
    };
    h.ownerRead = () => {
      if (!h.afterWrite)
        throw {
          statusCode: 404,
          name: 'ITEM_NOT_FOUND',
          errorCode: 'ITEM_NOT_FOUND',
          data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
        };
      polls++;
      return {
        ...structuredClone(h.raw),
        ...(reason === 'verification-failed' && polls === 15 ? { id: 'drifted-owner' } : {}),
      };
    };
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.match(result.diagnostics[0].message, /write acknowledged; settlement unconfirmed/u);
    assert.ok(result.diagnostics[0].message.includes(reason));
    assert.equal(h.writes.length, 1);
    assert.equal(h.outputs, 0);
    if (reason === 'read-budget-exhausted')
      assert.equal(polls, nativeIdentityResolutionPollBudget.reads);
    assert.equal(JSON.stringify(result).includes('drifted-owner'), false);
  });

test('native real timer deadline fences a stalled read and its late continuation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let release;
  let stalled;
  const reached = new Promise((resolve) => {
    stalled = resolve;
  });
  h.ownerRead = () => {
    if (!h.afterWrite)
      throw {
        statusCode: 404,
        name: 'ITEM_NOT_FOUND',
        errorCode: 'ITEM_NOT_FOUND',
        data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
      };
    stalled();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const pending = h.run();
  await reached;
  t.mock.timers.tick(nativeIdentityResolutionPollBudget.timeoutMs);
  const result = await pending;
  assert.equal(result.mutation, 'unknown');
  assert.match(result.diagnostics[0].message, /deadline-exhausted/u);
  release(structuredClone(h.raw));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.outputs, 0);
  assert.equal(h.writes.length, 1);
});

test('native deadline fences late dependency transport reads without mutating the caller connection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  const originalRequest = h.connection.request;
  let resume;
  let reached;
  const waiting = new Promise((resolve) => {
    reached = resolve;
  });
  let fenced = false;
  h.options.verifyOutputs = async (_owner, _outputs, connection) => {
    assert.notEqual(connection, h.connection);
    // Use the actual ConnectClient no-refresh receiver before expiration too.
    await new ConnectClient(connection, nativeSelection).get(
      '/services/data/v68.0/ssot/identity-resolutions/Individual_A1b2',
    );
    reached();
    await new Promise((resolve) => {
      resume = resolve;
    });
    try {
      await connection.request({ method: 'GET', url: 'https://synthetic.example.com/late' });
    } catch {
      fenced = true;
    }
    return [];
  };
  const pending = h.run();
  await waiting;
  const getsBefore = h.gets;
  t.mock.timers.tick(nativeIdentityResolutionPollBudget.timeoutMs);
  const result = await pending;
  assert.equal(result.mutation, 'unknown');
  assert.match(result.diagnostics[0].message, /deadline-exhausted/u);
  resume();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fenced, true);
  assert.equal(h.gets, getsBefore);
  assert.equal(h.connection.request, originalRequest);
  assert.equal(h.writes.length, 1);
});

test('native FirstName case-sensitive and automatic-run input is sent as authored', async () => {
  const h = harness();
  h.desired.spec.matchRules[0].criteria[0].caseSensitiveMatch = true;
  h.desired.spec.doesRunAutomatically = true;
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-created');
  const body = JSON.parse(h.writes[0].body);
  assert.equal(body.matchRules[0].criteria[0].caseSensitiveMatch, true);
  assert.equal(body.doesRunAutomatically, true);
});

test('native PATCH of an unpublished (NEW) ruleset settles in its state without publishing', async () => {
  const h = harness(false);
  h.raw.rulesetStatus = 'NEW';
  h.raw.matchRules = [];
  h.desired.spec.matchRules = [];
  h.desired.spec.label = 'Renamed draft';
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(h.raw.rulesetStatus, 'NEW');
  assert.equal(h.writes.length, 1);
});

test('native CREATE of a non-default reconciliation set binds every returned output', async () => {
  const h = harness();
  h.desired.spec.reconciliationRules = h.desired.spec.reconciliationRules.slice(0, 2);
  h.raw.reconciliationRules = h.raw.reconciliationRules.slice(0, 2);
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(JSON.parse(h.writes[0].body).reconciliationRules.length, 2);
});

test('native default Individual CREATE omits rulesetId (synthetic only, not live qualification)', async () => {
  const h = harness();
  h.raw.objectApiName = 'Individual';
  delete h.raw.rulesetId;
  Object.assign(h.desired, projectNativeIdentityResolution(h.raw, 'Individual').candidate);
  const result = await h.run();
  assert.equal(result.outcome, 'created');
  assert.equal(Object.hasOwn(JSON.parse(h.writes[0].body), 'rulesetId'), false);
});

test('native description PATCH preserves all rules without run-now, DELETE or provisioning controls', async () => {
  const h = harness(false);
  h.desired.spec.description = 'New description';
  h.options.allowGeneratedOutputProvisioning = false;
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(h.writes[0].body), buildNativeIdentityResolutionUpdate(h.desired));
  assert.equal(Object.hasOwn(JSON.parse(h.writes[0].body), 'trustedSources'), false);
  assert.equal(h.writes[0].url.endsWith('/identity-resolutions/Individual_A1b2'), true);
});

test('native rich CREATE, full PATCH, override preservation, reset and inherited default no-op', async () => {
  const h = harness();
  Object.assign(
    h.desired,
    projectNativeIdentityResolution(expandedNativeIrFixture(), h.raw.objectApiName).candidate,
  );
  h.echo = () => ({
    id: h.raw.id,
    objectApiName: h.raw.objectApiName,
    rulesetStatus: 'PUBLISHING',
  });
  let result = await h.run();
  assert.equal(result.mutation, 'confirmed-created');
  assert.deepEqual(
    projectNativeIdentityResolution(h.raw, h.raw.objectApiName).candidate,
    h.desired,
  );
  const override = structuredClone(h.desired.spec.reconciliationRules[0].fields);
  const defaults = h.desired.spec.reconciliationRules[0];
  defaults.ruleType = 'LastUpdated';
  defaults.sources = [];
  h.desired.spec.matchRules[0].criteria[0].matchMethodType = 'Exact';
  h.desired.spec.matchRules[0].criteria = h.desired.spec.matchRules[0].criteria.toReversed();
  h.desired.spec.reconciliationRules[5].shouldIgnoreEmptyValue = false;
  result = await h.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.deepEqual(
    projectNativeIdentityResolution(h.raw, h.raw.objectApiName).candidate.spec
      .reconciliationRules[0].fields,
    override,
  );
  defaults.fields = [];
  result = await h.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.deepEqual(h.raw.reconciliationRules[0].fields, []);
  defaults.ruleType = 'MostFrequent';
  result = await h.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(h.raw.reconciliationRules[0].ruleType, 'mostfrequent');
  assert.deepEqual(h.raw.reconciliationRules[0].fields, []);
  assert.deepEqual(
    projectNativeIdentityResolution(h.raw, h.raw.objectApiName).candidate,
    h.desired,
  );
  assert.deepEqual(h.desired.spec.trustedSources, []);
  h.options.allowProcessing = false;
  const writesBeforeNoOp = h.writes.length;
  result = await h.run();
  assert.equal(result.outcome, 'unchanged');
  assert.equal(h.writes.length, writesBeforeNoOp);
  assert.deepEqual(
    h.writes.map((write) => write.method),
    ['POST', 'PATCH', 'PATCH', 'PATCH'],
  );
  for (const write of h.writes) {
    const payload = JSON.parse(write.body);
    assert.equal(Object.hasOwn(payload, 'trustedSources'), false);
    assert.equal(payload.reconciliationRules.length, 6);
    assert.equal(payload.matchRules.length, 2);
    assert.equal(write.url.includes('/fields'), false);
    assert.equal(write.body.includes('unifiedDmoName'), false);
  }
});

for (const creating of [true, false])
  test(`native partial mutation echo independently settles ${creating ? 'CREATE' : 'PATCH'}`, async () => {
    const h = harness(creating);
    if (!creating) h.desired.spec.label = 'Changed display label';
    h.echo = () => ({ id: h.raw.id });
    const result = await h.run();
    assert.equal(result.mutation, creating ? 'confirmed-created' : 'confirmed-updated');
    assert.equal(h.writes.length, 1);
  });

test('native no-op needs neither processing nor provisioning acknowledgment and sends zero writes', async () => {
  const h = harness(false);
  h.options.allowProcessing = false;
  h.options.allowGeneratedOutputProvisioning = false;
  const result = await h.run();
  assert.equal(result.outcome, 'unchanged');
  assert.equal(h.writes.length, 0);
});

test('native empty-filter presence remains part of full raw owner drift comparison', async () => {
  const h = harness(false);
  h.checkInput = () => {
    if (h.inputChecks === 2) delete h.raw.filters;
  };
  const result = await h.run();
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(h.writes.length, 0);
});

test('native nonempty filters are sent as authored and cannot confirm a mutated owner', async () => {
  const filters = [{ fieldName: 'ssot__FirstName__c', value: 'Meaningful' }];
  for (const variant of ['kept', 'emptied', 'afterWrite']) {
    const h = harness(false);
    h.desired.spec.description = 'New description';
    if (variant === 'afterWrite')
      h.echo = () => {
        h.raw.filters = filters;
        return structuredClone(h.raw);
      };
    else h.raw.filters = structuredClone(filters);
    if (variant === 'kept') h.desired.spec.filters = structuredClone(filters);
    const result = await h.run();
    assert.equal(
      result.mutation,
      { kept: 'confirmed-updated', emptied: 'confirmed-updated', afterWrite: 'unknown' }[variant],
    );
    assert.equal(h.writes.length, 1);
    if (variant === 'kept') assert.deepEqual(JSON.parse(h.writes[0].body).filters, filters);
    // Emptying sends the empty list; the API decides.
    if (variant === 'emptied') assert.deepEqual(JSON.parse(h.writes[0].body).filters, []);
  }
});

for (const effect of ['allowProcessing', 'allowGeneratedOutputProvisioning'])
  test(`native CREATE requires ${effect}`, async () => {
    const h = harness();
    h.options[effect] = false;
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(h.writes.length, 0);
  });

for (const drift of ['owner-appears', 'input', 'file', 'scope', 'wrong-owner', 'rule-change'])
  test(`native ${drift} drift blocks without write or upsert fallback`, async () => {
    const h = harness(drift !== 'wrong-owner' && drift !== 'rule-change');
    if (drift === 'wrong-owner') h.raw.objectApiName = 'Individual_B';
    if (drift === 'rule-change') h.desired.spec.description = 'Desired description';
    h.checkInput = () => {
      if (h.inputChecks !== 2) return;
      if (drift === 'owner-appears') h.present = true;
      if (drift === 'rule-change') h.raw.matchRules[0].label = 'Concurrent target rule change';
      if (drift === 'input') h.fingerprint = 'b'.repeat(64);
      if (drift === 'file') throw new Error('Input changed');
      if (drift === 'scope') h.connection.getApiVersion = () => '67.0';
    };
    const result = await h.run();
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.writes.length, 0);
  });

for (const failure of [
  'auth',
  'redirect',
  'timeout',
  'malformed',
  'settlement',
  'wrong-owner',
  'wrong-output',
  'wrong-proof',
  'wrong-input',
  'publishing',
  'clock',
])
  test(`native attempted CREATE ${failure} is unknown with exactly one write`, async () => {
    const h = harness();
    if (failure === 'auth')
      h.writeFailure = () => {
        throw { statusCode: 401, name: 'INVALID_SESSION_ID' };
      };
    if (failure === 'redirect') h.writeFailure = (options) => options.followRedirect();
    if (failure === 'timeout')
      h.writeFailure = () => {
        throw new Error('timeout');
      };
    if (failure === 'malformed') h.echo = () => ({});
    if (failure === 'settlement')
      h.ownerRead = () => {
        if (h.afterWrite) throw new Error('settlement read failed');
        throw {
          statusCode: 404,
          name: 'ITEM_NOT_FOUND',
          errorCode: 'ITEM_NOT_FOUND',
          data: { errorCode: 'ITEM_NOT_FOUND', message: 'No owner' },
        };
      };
    if (failure === 'wrong-owner' || failure === 'wrong-output')
      h.echo = () => {
        const echo = structuredClone(h.raw);
        if (failure === 'wrong-owner') echo.objectApiName = 'Individual_B';
        else echo.reconciliationRules[0].unifiedDmoName = 'OtherReturned__dlm';
        return echo;
      };
    if (failure === 'wrong-proof')
      h.changeProof = (proof) => {
        proof[0].targetId = h.raw.id;
      };
    if (failure === 'wrong-input')
      h.changeProof = () => {
        h.fingerprint = 'b'.repeat(64);
      };
    if (failure === 'publishing')
      h.echo = () => {
        h.raw.rulesetStatus = 'PUBLISHING';
        return structuredClone(h.raw);
      };
    if (failure === 'clock')
      h.options.now = () => (h.afterWrite ? nativeIdentityResolutionPollBudget.timeoutMs + 1 : 0);
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.writes.length, 1);
  });

for (const failure of ['malformed', 'owner-id', 'output-id', 'read'])
  test(`native PATCH ${failure} cannot confirm or retry`, async () => {
    const h = harness(false);
    h.desired.spec.description = 'New description';
    if (failure === 'malformed') h.echo = () => {};
    if (failure === 'owner-id') h.echo = () => ({ ...h.raw, id: 'different-owner' });
    if (failure === 'output-id')
      h.changeProof = (proof) => {
        if (h.afterWrite) proof[0].targetId = 'replacement-output';
      };
    if (failure === 'read')
      h.ownerRead = () => {
        if (h.afterWrite) throw new Error('Read failed');
        return structuredClone(h.raw);
      };
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].method, 'PATCH');
  });

for (const method of ['createIdentityResolution', 'patchIdentityResolution'])
  for (const failure of ['auth', 'same-redirect', 'cross-redirect', 'network'])
    test(`actual core native ${method} ${failure} sends exactly one wire attempt`, async () => {
      const h = harness();
      let attempts = 0;
      const refresh = { refresh: () => assert.fail('No refresh replay') };
      const connection = Object.assign(Object.create(Connection.prototype), {
        instanceUrl: h.connection.instanceUrl,
        version: '68.0',
        accessToken: 'synthetic-token',
        logger: { getRawLogger: () => ({ debug() {} }) },
        _refreshDelegate: refresh,
        _propagators: [],
        _transport: {
          httpRequest: (request, options) => {
            attempts++;
            assert.equal(request.method, method === 'createIdentityResolution' ? 'POST' : 'PATCH');
            if (failure.endsWith('redirect'))
              options.followRedirect(
                failure === 'same-redirect'
                  ? `${h.connection.instanceUrl}/services/data/v68.0/ssot/identity-resolutions/Individual_B`
                  : 'https://hostile.example.com/owner',
              );
            const pending =
              failure === 'network'
                ? Promise.reject(new Error('network timeout'))
                : Promise.resolve({
                    statusCode: 401,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify([{ errorCode: 'INVALID_SESSION_ID', message: 'private' }]),
                  });
            pending.stream = () => new PassThrough();
            return pending;
          },
        },
      });
      await assert.rejects(new ConnectClient(connection, nativeSelection)[method](h.desired));
      assert.equal(attempts, 1);
      assert.equal(connection._refreshDelegate, refresh);
    });

for (const method of ['createIdentityResolution', 'patchIdentityResolution'])
  test(`native transport ${method} refuses lower versions and unsupported owner names`, async () => {
    const h = harness();
    await assert.rejects(new ConnectClient(h.connection, '67.0')[method](h.desired));
    h.desired.identity.apiName = 'Individual_ABCDE';
    await assert.rejects(new ConnectClient(h.connection, nativeSelection)[method](h.desired));
    assert.equal(h.writes.length, 0);
  });

test('native async CREATE reports the accepted write without settlement reads; rerun is the status check', async () => {
  const h = harness();
  h.options.async = true;
  let readsAtWrite;
  let outputsAtWrite;
  h.echo = () => {
    readsAtWrite = h.gets;
    outputsAtWrite = h.outputs;
    h.raw.rulesetStatus = 'PUBLISHING';
    return { id: h.raw.id, objectApiName: h.raw.objectApiName, rulesetStatus: 'PUBLISHING' };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'creation-processing');
  assert.equal(result.mutation, 'acknowledged-processing');
  assert.equal(result.route.operation, 'identity-resolutions.post');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'POST');
  // No settlement read or output verification followed the write.
  assert.equal(h.gets, readsAtWrite);
  assert.equal(h.outputs, outputsAtWrite);
  assert.equal(h.outputs, 0);
  const getsAtWrite = h.gets;

  // Rerun while PUBLISHING: preflight refuses with NOT_SETTLED, nothing is written.
  delete h.echo;
  const { preflightNativeIdentityResolutionDeploy } =
    await import('../lib/services/preflight-identity-resolution-deploy.js');
  const pending = await preflightNativeIdentityResolutionDeploy(
    h.desired,
    h.connection,
    nativeSelection,
    'default',
    { verifyDependencies: async () => {} },
  );
  assert.equal(pending.outcome, 'blocked');
  assert.equal(pending.diagnostics[0].code, 'IDENTITY_RESOLUTION_NOT_SETTLED');
  const rerunPending = await h.run();
  assert.equal(rerunPending.outcome, 'blocked');
  assert.equal(rerunPending.mutation, 'not-attempted');
  assert.equal(h.writes.length, 1);
  assert.ok(h.gets > getsAtWrite);

  // Rerun once settled with equal settings: unchanged, no write, outputs verified.
  h.raw.rulesetStatus = 'PUBLISHED';
  const settled = await h.run();
  assert.equal(settled.outcome, 'unchanged');
  assert.equal(settled.mutation, 'not-attempted');
  assert.equal(h.writes.length, 1);
  assert.ok(h.outputs > 0);
});

test('native async UPDATE returns after the validated PATCH acknowledgement only', async () => {
  const h = harness(false);
  h.options.async = true;
  h.desired.spec.description = 'New description';
  let readsAtWrite;
  let outputsAtWrite;
  h.echo = () => {
    readsAtWrite = h.gets;
    outputsAtWrite = h.outputs;
    return { id: h.raw.id, rulesetStatus: 'PUBLISHING' };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'update-processing');
  assert.equal(result.mutation, 'acknowledged-processing');
  assert.equal(result.route.operation, 'identity-resolutions.patch');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'PATCH');
  assert.equal(h.gets, readsAtWrite);
  assert.equal(h.outputs, outputsAtWrite);
});

test('native async write still refuses a malformed or mismatched acknowledgement', async () => {
  for (const echo of [
    () => [],
    () => ({ unrelated: true }),
    () => ({ id: 'x', objectApiName: 'Individual_Other' }),
    () => ({ id: 'x', rulesetStatus: 'FAILED' }),
    // Plausible but anonymous: nothing in the echo names this ruleset.
    () => ({ rulesetStatus: 'PUBLISHING' }),
    () => ({ id: 'x' }),
  ]) {
    const h = harness();
    h.options.async = true;
    h.echo = echo;
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(result.diagnostics[0].code, 'IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED');
    assert.equal(h.writes.length, 1);
  }
});

test('native async UPDATE requires the echo to name the baseline ruleset', async () => {
  for (const echo of [() => ({ rulesetStatus: 'PUBLISHING' }), () => ({})]) {
    const h = harness(false);
    h.options.async = true;
    h.desired.spec.description = 'New description';
    h.echo = echo;
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.writes.length, 1);
  }
  const h = harness(false);
  h.options.async = true;
  h.desired.spec.description = 'New description';
  h.echo = () => ({ objectApiName: h.raw.objectApiName, rulesetStatus: 'PUBLISHING' });
  const named = await h.run();
  assert.equal(named.outcome, 'update-processing');
});

test('native default CREATE without async still waits for PUBLISHED and outputs', async () => {
  const h = harness();
  let reads = 0;
  h.echo = () => ({ id: h.raw.id, rulesetStatus: 'PUBLISHING' });
  h.ownerRead = () => {
    if (!h.afterWrite)
      throw {
        statusCode: 404,
        name: 'ITEM_NOT_FOUND',
        errorCode: 'ITEM_NOT_FOUND',
        data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
      };
    reads++;
    return { ...structuredClone(h.raw), rulesetStatus: reads < 3 ? 'PUBLISHING' : 'PUBLISHED' };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'created');
  assert.equal(result.mutation, 'confirmed-created');
  assert.ok(reads >= 3);
  assert.equal(h.outputs, 1);
});
