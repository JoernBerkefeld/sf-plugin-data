import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  deleteIdentityResolution,
  identityResolutionDeleteBudget,
} from '../lib/services/delete-identity-resolution.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import { nativeIrFixture, nativeSelection } from './identity-resolution-fixtures.mjs';

export const missing = () => ({
  statusCode: 404,
  name: 'ITEM_NOT_FOUND',
  errorCode: 'ITEM_NOT_FOUND',
  data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
});
/**
 * Construct independent synthetic owner reads and bounded binding seams.
 * @returns {object} Mutable isolated service harness.
 */
export function deleteHarness() {
  const raw = { ...nativeIrFixture(), id: '1ir000000000001AAA' };
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const h = {
    raw,
    desired,
    writes: [],
    reads: [],
    inputChecks: 0,
    absent: false,
    afterWrite: false,
  };
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    _refreshDelegate: { refresh: () => assert.fail('No refresh') },
    async request(request, options) {
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      if (request.method !== 'GET') {
        h.writes.push(request);
        h.afterWrite = true;
        if (h.write) return h.write(options);
        h.absent = true;
        return options.noContentResponse;
      }
      const identity = request.url.split('/').at(-1);
      h.reads.push(identity);
      if (h.read) return h.read(identity);
      if (h.absent) throw missing();
      return structuredClone(raw);
    },
  };
  const options = {
    confirmDelete: true,
    verifyInput: async () => {
      h.inputChecks++;
      if (h.input) await h.input();
    },
    verifyDependencies: async () => ({ fingerprint: 'a'.repeat(64) }),
    verifyOutputs: async (_owner, outputs) =>
      outputs.map((output, index) => ({
        ...output,
        targetId: `output-${index}`,
        creationType: output.identity.role === 'unified' ? 'Derived' : 'Bridge',
        fields: [
          {
            apiName: output.identity.role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c',
            dataType: 'Text',
          },
        ],
      })),
    delay: async () => {},
  };
  const run = () =>
    deleteIdentityResolution(desired, connection, { ...nativeSelection }, 'default', options);
  return Object.assign(h, { connection, options, run });
}

test('IR delete binds both identities and sends exactly one target-ID DELETE then dual absence', async () => {
  const h = deleteHarness();
  const result = await h.run();
  assert.equal(result.outcome, 'deleted');
  assert.equal(result.mutation, 'confirmed-deleted');
  assert.deepEqual(
    h.writes.map((write) => [write.method, write.url]),
    [
      [
        'DELETE',
        `https://synthetic.example.com/services/data/v68.0/ssot/identity-resolutions/${h.raw.id}`,
      ],
    ],
  );
  assert.equal(h.writes[0].body, undefined);
  assert.deepEqual(h.reads, [
    h.raw.objectApiName,
    h.raw.id,
    h.raw.objectApiName,
    h.raw.id,
    h.raw.id,
    h.raw.objectApiName,
  ]);
  assert.doesNotMatch(JSON.stringify(result), /1ir000|SyntheticUnified|matchRules/u);
  h.options.confirmDelete = false;
  const repeat = await h.run();
  assert.equal(repeat.outcome, 'unchanged');
  assert.equal(h.writes.length, 1);
});
for (const mode of ['preview', 'absent', 'confirmation'])
  test(`IR ${mode} makes zero writes`, async () => {
    const h = deleteHarness();
    h.options.confirmDelete = false;
    if (mode === 'preview') h.options.preview = true;
    if (mode === 'absent') h.absent = true;
    const result = await h.run();
    assert.equal(
      result.outcome,
      mode === 'preview' ? 'delete' : mode === 'absent' ? 'unchanged' : 'blocked',
    );
    assert.equal(h.writes.length, 0);
  });
for (const failure of [
  '403',
  'malformed404',
  'malformed',
  'settings',
  'stripped-rules',
  'automatic',
  'publishing',
  'id-name',
  'input',
  'scope',
  'output',
  'dependency',
  'replacement',
])
  test(`IR ${failure} blocks before mutation`, async () => {
    const h = deleteHarness();
    if (failure === '403')
      h.read = () => {
        throw { statusCode: 403, data: 'private' };
      };
    if (failure === 'malformed404')
      h.read = () => {
        throw { statusCode: 404 };
      };
    if (failure === 'malformed') h.read = () => ({});
    if (failure === 'settings') h.raw.description = 'Concurrent';
    if (failure === 'stripped-rules') h.raw.reconciliationRules = [];
    if (failure === 'automatic') h.raw.doesRunAutomatically = true;
    if (failure === 'publishing') h.raw.rulesetStatus = 'PUBLISHING';
    if (failure === 'id-name')
      h.read = (identity) => ({
        ...h.raw,
        ...(identity === h.raw.id ? { id: '1ir000000000002AAA' } : {}),
      });
    if (failure === 'input')
      h.input = () => {
        if (h.inputChecks === 2) throw new Error('private');
      };
    if (failure === 'scope')
      h.input = () => {
        if (h.inputChecks === 2) h.connection.getApiVersion = () => '67.0';
      };
    if (failure === 'output') h.options.verifyOutputs = async () => [];
    if (failure === 'dependency')
      h.options.verifyDependencies = async () => {
        throw new Error('known consumer or unavailable required evidence');
      };
    if (failure === 'replacement')
      h.input = () => {
        if (h.inputChecks === 2) h.raw.id = '1ir000000000002AAA';
      };
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /private|Concurrent|known consumer/u);
  });
test('IR exact dual DELETING returns processing immediately without waiting or further reads', async () => {
  const h = deleteHarness();
  let polls = 0;
  h.options.delay = async () => assert.fail('No wait after validated dual DELETING');
  h.read = () => {
    if (!h.afterWrite) return structuredClone(h.raw);
    assert.ok(++polls <= 2, 'No further reads after validated dual DELETING');
    return { ...structuredClone(h.raw), rulesetStatus: 'DELETING' };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'deletion-processing');
  assert.equal(result.mutation, 'acknowledged-processing');
  assert.equal(polls, 2);
  assert.equal(h.writes.length, 1);
});
test('IR acknowledged DELETE admits exact dual empty-reconciliation DELETING immediately', async () => {
  const h = deleteHarness();
  let polls = 0;
  let waits = 0;
  h.options.delay = async (milliseconds) => {
    assert.equal(milliseconds, identityResolutionDeleteBudget.intervalMs);
    waits++;
  };
  h.read = () => {
    if (!h.afterWrite) return structuredClone(h.raw);
    assert.ok(++polls <= 2, 'No further reads after validated dual DELETING');
    return { ...structuredClone(h.raw), rulesetStatus: 'DELETING', reconciliationRules: [] };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'deletion-processing');
  assert.equal(result.mutation, 'acknowledged-processing');
  assert.equal(polls, 2);
  assert.equal(waits, 0);
  assert.equal(h.writes.length, 1);
});
for (const failure of ['malformed', 'unrelated', 'partial'])
  test(`IR valid first DELETING read and ${failure} second read cannot acknowledge processing`, async () => {
    const h = deleteHarness();
    h.read = (identity) => {
      if (!h.afterWrite) return structuredClone(h.raw);
      const raw = { ...structuredClone(h.raw), rulesetStatus: 'DELETING' };
      if (identity === h.raw.id) return raw;
      if (failure === 'malformed') return {};
      if (failure === 'unrelated') return { ...raw, objectApiName: 'Individual_B2c3' };
      throw missing();
    };
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.writes.length, 1);
  });
for (const failure of [
  'id',
  'name',
  'ruleset',
  'space',
  'settings',
  'status',
  'missing-rules',
  'null-rules',
  'partial-rules',
  'changed-rules',
  'extra-key',
  'budget',
])
  test(`IR stripped-reconciliation transition ${failure} preserves bounded evidence without replay`, async () => {
    const h = deleteHarness();
    let polls = 0;
    h.read = () => {
      if (!h.afterWrite) return structuredClone(h.raw);
      polls++;
      const raw = {
        ...structuredClone(h.raw),
        rulesetStatus: 'DELETING',
        reconciliationRules: [],
      };
      if (failure === 'id') raw.id = '1ir000000000002AAA';
      if (failure === 'name') raw.objectApiName = 'Individual_B2c3';
      if (failure === 'ruleset') raw.rulesetId = 'B2c3';
      if (failure === 'space') raw.dataSpaceName = 'other';
      if (failure === 'settings') raw.doesRunAutomatically = true;
      if (failure === 'status') raw.rulesetStatus = 'PUBLISHED';
      if (failure === 'missing-rules') delete raw.reconciliationRules;
      // eslint-disable-next-line unicorn/no-null -- Exercise malformed JSON null from a native response.
      if (failure === 'null-rules') raw.reconciliationRules = null;
      if (failure === 'partial-rules')
        raw.reconciliationRules = structuredClone(h.raw.reconciliationRules.slice(0, 1));
      if (failure === 'changed-rules') {
        raw.reconciliationRules = structuredClone(h.raw.reconciliationRules);
        raw.reconciliationRules[0].unifiedDmoName = 'Unrelated__dlm';
      }
      if (failure === 'extra-key') raw.unrelated = true;
      return raw;
    };
    const result = await h.run();
    assert.equal(result.outcome, failure === 'budget' ? 'deletion-processing' : 'failed');
    assert.equal(result.mutation, failure === 'budget' ? 'acknowledged-processing' : 'unknown');
    if (failure !== 'budget')
      assert.equal(result.diagnostics[0].code, 'IDENTITY_RESOLUTION_DELETION_UNCONFIRMED');
    assert.equal(h.writes.length, 1);
    assert.equal(polls, 2);
  });
for (const failure of [
  '401',
  'timeout',
  'redirect',
  'bad-ack',
  'read403',
  'partial',
  'replacement',
  'budget',
  'clock',
])
  test(`IR attempted ${failure} stays unknown without replay or fallback`, async () => {
    const h = deleteHarness();
    if (failure === '401')
      h.write = () => {
        throw { statusCode: 401, name: 'INVALID_SESSION_ID' };
      };
    if (failure === 'timeout')
      h.write = () => {
        h.absent = true;
        throw new Error('timeout private');
      };
    if (failure === 'redirect') h.write = (options) => options.followRedirect();
    if (failure === 'bad-ack') h.write = () => ({});
    if (failure === 'clock')
      h.options.now = () => (h.afterWrite ? identityResolutionDeleteBudget.timeoutMs : 0);
    if (['read403', 'partial', 'replacement', 'budget'].includes(failure))
      h.read = (identity) => {
        if (!h.afterWrite) return structuredClone(h.raw);
        if (failure === 'read403') throw { statusCode: 403 };
        if (failure === 'replacement') return { ...h.raw, id: '1ir000000000002AAA' };
        if (failure === 'partial' && identity === h.raw.id) throw missing();
        return { ...structuredClone(h.raw), rulesetStatus: 'DELETING' };
      };
    const result = await h.run();
    assert.equal(result.outcome, failure === 'budget' ? 'deletion-processing' : 'failed');
    assert.equal(result.mutation, failure === 'budget' ? 'acknowledged-processing' : 'unknown');
    assert.equal(h.writes.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /timeout private/u);
  });
test('IR real deadline fences late owner continuation and further reads', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = deleteHarness();
  let release;
  let reached;
  const waiting = new Promise((resolve) => {
    reached = resolve;
  });
  h.read = () => {
    if (!h.afterWrite) return structuredClone(h.raw);
    reached();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const pending = h.run();
  await waiting;
  const reads = h.reads.length;
  t.mock.timers.tick(identityResolutionDeleteBudget.timeoutMs);
  const result = await pending;
  assert.equal(result.mutation, 'unknown');
  release(structuredClone(h.raw));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.reads.length, reads);
  assert.equal(h.writes.length, 1);
});
for (const failure of ['204', '200', '401', 'same-redirect', 'cross-redirect', 'network', '503'])
  test(`actual core IR DELETE ${failure} is one wire attempt, HTTP204 only`, async () => {
    let calls = 0;
    const refresh = { refresh: () => assert.fail('No refresh replay') };
    const connection = Object.assign(Object.create(Connection.prototype), {
      instanceUrl: 'https://synthetic.example.com',
      version: '68.0',
      accessToken: 'synthetic-token',
      logger: { getRawLogger: () => ({ debug() {} }) },
      _refreshDelegate: refresh,
      _propagators: [],
      _transport: {
        httpRequest(request, options) {
          calls++;
          assert.equal(request.method, 'DELETE');
          assert.equal(
            request.url.endsWith('/v68.0/ssot/identity-resolutions/1ir000000000001AAA'),
            true,
          );
          if (failure.endsWith('redirect'))
            options.followRedirect(
              failure === 'same-redirect' ? request.url : 'https://other.example.com/',
            );
          const pending =
            failure === 'network'
              ? Promise.reject(new Error('private'))
              : Promise.resolve({
                  statusCode:
                    failure === '401'
                      ? 401
                      : failure === '503'
                        ? 503
                        : failure === '200'
                          ? 200
                          : 204,
                  headers: {
                    'content-type': 'application/json',
                    'x-sfdc-request-id': 'synthetic-request',
                  },
                  body:
                    failure === '401'
                      ? JSON.stringify([{ errorCode: 'INVALID_SESSION_ID', message: 'private' }])
                      : failure === '503'
                        ? JSON.stringify([{ errorCode: 'UNAVAILABLE', message: 'private' }])
                        : failure === '200'
                          ? '{}'
                          : '',
                });
          pending.stream = () => new PassThrough();
          return pending;
        },
      },
    });
    const pending = new ConnectClient(connection, nativeSelection).deleteIdentityResolution(
      '1ir000000000001AAA',
    );
    await (failure === '204'
      ? pending
      : assert.rejects(pending, (error) => {
          if (failure === '503') assert.equal(error.statusCode, 503);
          return true;
        }));
    assert.equal(calls, 1);
    assert.equal(connection._refreshDelegate, refresh);
  });
for (const id of [
  'Individual_A1b2',
  '',
  '../1ir000000000001AAA',
  '1ir000000000001AAA?x=1',
  'synthetic-owner-id',
])
  test(`IR transport rejects invalid ID ${id}`, async () => {
    const h = deleteHarness();
    await assert.rejects(
      new ConnectClient(h.connection, nativeSelection).deleteIdentityResolution(id),
    );
    assert.equal(h.writes.length, 0);
  });
test('IR transport rejects API67 before wire dispatch', async () => {
  const h = deleteHarness();
  await assert.rejects(new ConnectClient(h.connection, '67.0').deleteIdentityResolution(h.raw.id));
  assert.equal(h.writes.length, 0);
});
