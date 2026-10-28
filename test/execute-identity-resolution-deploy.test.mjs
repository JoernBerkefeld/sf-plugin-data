import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import test from 'node:test';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  executeIdentityResolutionDeploy,
  identityResolutionPollBudget,
} from '../lib/services/execute-identity-resolution-deploy.js';
import { irFixture, selection } from './identity-resolution-fixtures.mjs';

/**
 * Build a synthetic target and instrument all execution boundaries.
 * @param {boolean} equality Whether desired already matches target.
 * @returns {object} Detached fixture and invocation controls.
 */
function harness(equality = false) {
  const pair = irFixture(equality ? 'mostfrequent' : 'lastupdated');
  const desired = projectIdentityResolution(
    ...Object.values(irFixture()),
    'Individual_A1b2',
  ).candidate;
  const calls = {
    mutations: [],
    reads: 0,
    native: 0,
    polls: [],
    delays: [],
    inputs: 0,
    dependencies: 0,
    acquisitions: 0,
    outputs: 0,
  };
  let clock = 0;
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '67.0',
    request: async () => {
      throw new Error('Unexpected network');
    },
  };
  const options = {
    targetApiName: 'Individual_A1b2',
    allowProcessing: true,
    verifyInput: async () => {
      calls.inputs++;
    },
    verifyDependencies: async () => {
      calls.dependencies++;
      return { fingerprint: 'fresh-compatible-inputs' };
    },
    verifyOutputs: async (owner, outputs) => {
      calls.outputs++;
      assert.deepEqual(owner, {
        targetApiName: 'Individual_A1b2',
        targetId: 'synthetic-owner-id',
        dataSpace: 'default',
      });
      return outputs.map((output, index) => ({
        ...output,
        targetId: `target-output-${index}`,
        creationType: output.identity.role === 'unified' ? 'Derived' : 'Bridge',
        fields: [
          {
            apiName: output.identity.role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c',
            dataType: 'Text',
          },
        ],
      }));
    },
    acquire: async () => {
      calls.acquisitions++;
      return {
        identity: desired.identity,
        ...projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2'),
        blockers: [],
      };
    },
    mutate: async (parameters) => {
      calls.mutations.push(parameters);
      Object.assign(pair, irFixture());
      return structuredClone(pair.facade);
    },
    readFacade: async () => {
      calls.reads++;
      return structuredClone(pair.facade);
    },
    readNative: async () => {
      calls.native++;
      return structuredClone(pair.native);
    },
    now: () => clock,
    delay: async (ms) => {
      calls.delays.push(ms);
      clock += ms;
    },
    recordPoll: async (value) => {
      calls.polls.push(value);
    },
  };
  return {
    pair,
    desired,
    calls,
    options,
    connection,
    run: () => executeIdentityResolutionDeploy(desired, connection, selection, 'default', options),
  };
}

test('IR equality needs no effects acknowledgement or polling recorder and makes zero writes/jobs', async () => {
  const h = harness(true);
  h.options.allowProcessing = false;
  delete h.options.recordPoll;
  assert.equal(await h.run().then((result) => result.outcome), 'unchanged');
  assert.equal(await h.run().then((result) => result.mutation), 'not-attempted');
  assert.equal(h.calls.mutations.length + h.calls.reads + h.calls.native, 0);
  assert.ok(h.calls.inputs >= 6 && h.calls.dependencies >= 4);
});

test('IR update requires explicit acknowledgement before writes', async () => {
  const h = harness();
  h.options.allowProcessing = false;
  assert.equal(await h.run().then((result) => result.outcome), 'blocked');
  assert.equal(h.calls.mutations.length, 0);
});

for (const callback of ['verifyInput', 'verifyDependencies', 'verifyOutputs', 'recordPoll']) {
  test(`IR fails closed without ${callback}`, async () => {
    const h = harness();
    delete h.options[callback];
    assert.equal(await h.run().then((result) => result.mutation), 'not-attempted');
    assert.equal(h.calls.mutations.length, 0);
  });
}

test('IR full qualified payload preserves nested matching, labels and all six settled recon entries', async () => {
  const h = harness();
  assert.equal(await h.run().then((result) => result.mutation), 'confirmed-updated');
  assert.deepEqual(h.calls.mutations, [
    {
      identityResolution: 'Individual_A1b2',
      input: {
        label: 'Synthetic owner',
        description: 'Synthetic configuration',
        doesRunAutomatically: false,
        matchRules: {
          rules: [
            {
              label: 'Synthetic ordered rule',
              criteria: {
                criteria: [
                  {
                    entityName: 'ssot__Individual__dlm',
                    fieldName: 'ssot__FirstName__c',
                    matchMethodType: 'Fuzzy',
                    shouldMatchOnBlank: false,
                  },
                  {
                    entityName: 'ssot__Individual__dlm',
                    fieldName: 'ssot__LastName__c',
                    matchMethodType: 'Exact',
                    shouldMatchOnBlank: false,
                  },
                  {
                    entityName: 'ssot__ContactPointEmail__dlm',
                    fieldName: 'ssot__EmailAddress__c',
                    matchMethodType: 'ExactNormalized',
                    shouldMatchOnBlank: false,
                  },
                ],
              },
            },
          ],
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
    },
  ]);
  assert.equal(h.pair.facade.reconciliationRules.length, 6);
  assert.equal(h.calls.native, 1);
  assert.equal(h.calls.outputs, 3);
});

test('IR executor resolves authored API without a manual binding and blocks conflicting binding', async () => {
  const h = harness(true);
  delete h.options.targetApiName;
  const equal = await h.run();
  assert.equal(equal.outcome, 'unchanged');
  h.options.targetApiName = 'Individual_Z9z9';
  const conflicting = await h.run();
  assert.equal(conflicting.mutation, 'not-attempted');
  assert.equal(h.calls.mutations.length, 0);
});

for (const drift of ['input', 'version', 'dependency', 'target', 'output']) {
  test(`IR pre-dispatch ${drift} drift prevents any write`, async () => {
    const h = harness();
    if (drift === 'input')
      h.options.verifyInput = async () => {
        if (++h.calls.inputs === 3) throw new Error('Changed input');
      };
    if (drift === 'version')
      h.connection.getApiVersion = () => (++h.calls.inputs > 3 ? '65.0' : '67.0');
    if (drift === 'dependency')
      h.options.verifyDependencies = async () => ({
        fingerprint: `changed-${++h.calls.dependencies}`,
      });
    if (drift === 'target') {
      const acquire = h.options.acquire;
      h.options.acquire = async () => {
        if (h.calls.acquisitions === 3) h.pair.facade.description = 'changed';
        return acquire();
      };
    }
    if (drift === 'output') h.options.verifyOutputs = async () => [];
    assert.equal(await h.run().then((result) => result.mutation), 'not-attempted');
    assert.equal(h.calls.mutations.length, 0);
  });
}

for (const failure of [
  new Error('Network secret'),
  Object.assign(new Error('Auth secret'), { statusCode: 401 }),
  { body: { error: 'nested secret' } },
  undefined,
]) {
  test(`IR uncertain mutation never replays (${String(failure)})`, async () => {
    const h = harness();
    h.options.mutate = async (parameters) => {
      h.calls.mutations.push(parameters);
      if (failure instanceof Error) throw failure;
      return failure;
    };
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.calls.mutations.length, 1);
    assert.equal(h.calls.reads, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|synthetic-owner-id/);
  });
}

test('IR PUBLISHING settlement has finite read count and nonbusy delay', async () => {
  const h = harness();
  h.options.readFacade = async () => {
    h.calls.reads++;
    return { ...h.pair.facade, rulesetStatus: 'PUBLISHING' };
  };
  assert.equal(await h.run().then((result) => result.mutation), 'unknown');
  assert.equal(h.calls.reads, identityResolutionPollBudget.reads);
  assert.equal(h.calls.polls.length, identityResolutionPollBudget.reads);
  assert.deepEqual(
    h.calls.delays,
    Array.from({ length: 11 }, () => 1000),
  );
  assert.equal(h.calls.mutations.length, 1);
});

for (const status of [
  undefined,
  JSON.parse('null'),
  42,
  'DELETING',
  'READY',
  { error: 'private' },
]) {
  test(`IR records unexpected/missing status before classification (${JSON.stringify(status)})`, async () => {
    const h = harness();
    h.options.readFacade = async () => {
      const raw = structuredClone(h.pair.facade);
      if (status === undefined) delete raw.rulesetStatus;
      else raw.rulesetStatus = status;
      return raw;
    };
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.calls.polls.length, 1);
    assert.equal(h.calls.polls[0].statusPresent, status !== undefined);
    assert.equal(h.calls.polls[0].statusType, typeof status);
    assert.deepEqual(h.calls.polls[0].statusValue, status);
    assert.equal(h.calls.native, 0);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  });
}

for (const mismatch of [
  'native',
  'sixth-reconciliation',
  'match-order',
  'output-proof',
  'recorder',
  'deadline',
]) {
  test(`IR rejects settled ${mismatch} mismatch retaining mutation uncertainty`, async () => {
    const h = harness();
    if (mismatch === 'native')
      h.options.readNative = async () => ({ ...h.pair.native, id: 'wrong' });
    if (mismatch === 'sixth-reconciliation')
      h.options.readFacade = async () => {
        const raw = structuredClone(h.pair.facade);
        raw.reconciliationRules[5].sources.push('unexpected');
        return raw;
      };
    if (mismatch === 'match-order')
      h.options.readFacade = async () => {
        const raw = structuredClone(h.pair.facade);
        raw.matchRules[0].criteria.reverse();
        return raw;
      };
    if (mismatch === 'output-proof') {
      const verify = h.options.verifyOutputs;
      h.options.verifyOutputs = async (...arguments_) =>
        h.calls.outputs === 2 ? [] : verify(...arguments_);
    }
    if (mismatch === 'recorder')
      h.options.recordPoll = async () => {
        throw new Error('Private recorder unavailable');
      };
    if (mismatch === 'deadline') {
      let n = 0;
      h.options.now = () => (n++ === 0 ? 0 : 120_000);
    }
    assert.equal(await h.run().then((result) => result.mutation), 'unknown');
    assert.equal(h.calls.mutations.length, 1);
  });
}

for (const wireFailure of ['401', 'network', 'nested201']) {
  test(`IR actual core update ${wireFailure} attempts exactly once without refresh`, async () => {
    const h = harness();
    const connection = Object.create(Connection.prototype);
    let attempts = 0;
    Object.assign(connection, {
      instanceUrl: 'https://synthetic.example',
      version: '67.0',
      accessToken: 'synthetic-token',
      _refreshDelegate: {
        isRefreshing: () => assert.fail('refresh consulted'),
        refresh: () => assert.fail('refresh attempted'),
      },
      _propagators: [],
      logger: { getRawLogger: () => ({ debug: () => {} }) },
      _transport: {
        httpRequest: (request, options) => {
          attempts++;
          assert.equal(options.retry.maxRetries, 0);
          assert.equal(JSON.parse(request.body).toolName, 'd360_ir_update');
          const pending =
            wireFailure === 'network'
              ? Promise.reject(new Error('Disconnected'))
              : Promise.resolve({
                  statusCode: wireFailure === '401' ? 401 : 201,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(
                    wireFailure === '401'
                      ? [{ errorCode: 'INVALID_SESSION_ID', message: 'Expired' }]
                      : { result: { body: { error: 'private nested failure' } } },
                  ),
                });
          pending.stream = () => new PassThrough();
          return pending;
        },
      },
    });
    delete h.options.mutate;
    const result = await executeIdentityResolutionDeploy(
      h.desired,
      connection,
      selection,
      'default',
      h.options,
    );
    assert.equal(result.mutation, 'unknown');
    assert.equal(attempts, 1);
    assert.doesNotMatch(JSON.stringify(result), /private nested/);
  });
}

test('IR poll transport rejection records unavailable status and never retries', async () => {
  const h = harness();
  h.options.readFacade = async () => {
    h.calls.reads++;
    throw new Error('Malformed transport body');
  };
  assert.equal(await h.run().then((result) => result.mutation), 'unknown');
  assert.equal(h.calls.reads, 1);
  assert.deepEqual(h.calls.polls, [
    {
      attempt: 0,
      timestamp: 0,
      statusPresent: false,
      statusType: 'unavailable',
      statusValue: undefined,
    },
  ]);
});

test('IR PUBLISHING then independently PUBLISHED settles without another mutation', async () => {
  const h = harness();
  h.options.readFacade = async () => ({
    ...h.pair.facade,
    rulesetStatus: ++h.calls.reads === 1 ? 'PUBLISHING' : 'PUBLISHED',
  });
  assert.equal(await h.run().then((result) => result.mutation), 'confirmed-updated');
  assert.equal(h.calls.mutations.length, 1);
  assert.equal(h.calls.native, 1);
  assert.deepEqual(
    h.calls.polls.map((poll) => poll.statusValue),
    ['PUBLISHING', 'PUBLISHED'],
  );
});

for (const invalid of ['duplicate-id', 'wrong-field', 'wrong-type', 'wrong-role', 'source-name']) {
  test(`IR rejects unverified target output ${invalid} before writing`, async () => {
    const h = harness();
    const verify = h.options.verifyOutputs;
    h.options.verifyOutputs = async (...arguments_) => {
      const proof = await verify(...arguments_);
      if (invalid === 'duplicate-id') proof[1].targetId = proof[0].targetId;
      if (invalid === 'wrong-field') proof[0].fields[0].apiName = 'Wrong__c';
      if (invalid === 'wrong-type') proof[0].fields[0].dataType = 'Number';
      if (invalid === 'wrong-role') proof[0].creationType = 'Bridge';
      if (invalid === 'source-name') proof[0].targetApiName = 'SourceOnly__dlm';
      return proof;
    };
    assert.equal(await h.run().then((result) => result.mutation), 'not-attempted');
    assert.equal(h.calls.mutations.length, 0);
  });
}

test('IR missing/unreadable target never permits CREATE', async () => {
  const h = harness();
  h.options.acquire = async () => ({ identity: h.desired.identity, blockers: ['NOT_FOUND'] });
  assert.equal(await h.run().then((result) => result.mutation), 'not-attempted');
  assert.equal(h.calls.mutations.length, 0);
});
