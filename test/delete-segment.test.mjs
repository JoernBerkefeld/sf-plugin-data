import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteSegment, segmentDeleteBudget } from '../lib/services/delete-segment.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import Delete from '../lib/commands/data360/delete.js';

const document = () => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    dependencies: [
      { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
    ],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const runtime = () => ({
  apiName: 'Audience',
  dataSpace: 'default',
  displayName: 'Audience',
  description: 'Description',
  segmentType: 'DBT',
  segmentOnApiName: 'Person__dlm',
  includeDbt: { models: document().spec.models },
  publishInterval: 'NO_REFRESH',
  lookbackPeriod: 'P90D',
  marketSegmentId: '1sg000000000001AAA',
  marketSegmentDefinitionId: '3HX000000000001AAA',
  segmentOnId: 'dmo-id',
  createdDate: '2026-11-07T00:00:00Z',
  segmentMembershipDmo: { historyTable: 'history', latestTable: 'latest' },
  segmentStatus: 'ACTIVE',
});
const selection = () => ({ requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' });
/**
 * Simulate the exact native error retained by JSforce.
 * @param {string} code Native error code.
 * @param {number} statusCode HTTP status.
 * @returns {Error} Structured native failure.
 */
function absent(code = 'ITEM_NOT_FOUND', statusCode = 404) {
  return Object.assign(new Error('not found'), {
    name: code,
    errorCode: code,
    statusCode,
    data: { errorCode: code, message: 'not found' },
  });
}
/**
 * Build a deterministic exact-target deletion harness.
 * @param {string} mode Scenario to exercise.
 * @returns {object} Service runner and observable counters.
 */
function harness(mode = 'absence') {
  const desired = document();
  const selected = selection();
  const events = [];
  let reads = 0;
  let deletes = 0;
  let checks = 0;
  let binds = 0;
  const flags = {
    preview: mode === 'preview',
    confirmDelete: mode !== 'confirmation',
    verifyInput: async () => {
      events.push('input');
      checks++;
      if (mode === 'input' && checks === 3) throw new Error('drift');
      if (mode === 'late-confirmation' && checks === 3) flags.confirmDelete = false;
    },
    bind: async () => {
      binds++;
      events.push('bind');
      return [
        {
          targetId: mode === 'dependency' && binds === 2 ? 'foreign' : 'dmo-id',
          identity: desired.spec.segmentOn,
        },
      ];
    },
    now: () => 0,
    delay: async () => {},
  };
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    getApiVersion: () => '68.0',
    request: async function (request, options) {
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.throws(() => options.followRedirect());
      if (request.method === 'DELETE') {
        events.push('delete');
        deletes++;
        assert.equal(
          request.url,
          'https://synthetic.my.salesforce.com/services/data/v68.0/ssot/segments/Audience',
        );
        if (mode === 'uncertain') throw new Error('lost response');
        if (mode === 'malformed-write') return {};
        return options.noContentResponse;
      }
      events.push('read');
      reads++;
      if (mode === 'absent-before' || (deletes && ['absence', 'uncertain'].includes(mode)))
        throw absent();
      if (mode === 'auth') throw absent('INVALID_SESSION_ID', 401);
      if (mode === 'generic404') throw absent('NOT_FOUND');
      const raw = runtime();
      if (mode === 'preexisting-processing' || (mode === 'late-processing' && reads >= 2))
        raw.segmentStatus = 'PROCESSING';
      if (mode === 'source') raw.segmentOnId = 'foreign';
      if (mode === 'identity') raw.marketSegmentId = '';
      if (mode === 'definition') raw.description = 'not local';
      if (mode === 'unknown') raw.futureConfiguration = true;
      if (mode === 'drift' && reads === 2) raw.marketSegmentDefinitionId = '3HX000000000002AAA';
      if (mode === 'membership' && reads === 2) raw.segmentMembershipDmo.latestTable = 'foreign';
      if (deletes && mode === 'processing') raw.segmentStatus = 'PROCESSING';
      if (deletes && mode === 'deleting') raw.segmentStatus = 'DELETING';
      if (deletes && mode === 'readback-drift') {
        raw.segmentStatus = 'DELETING';
        raw.marketSegmentId = '1sg000000000002AAA';
      }
      if (deletes && mode === 'unknown-status') raw.segmentStatus = 'MYSTERY';
      return { segments: [raw] };
    },
  };
  return {
    run: () => deleteSegment(desired, connection, selected, 'default', flags),
    flags,
    connection,
    selected,
    counts: () => ({ reads, deletes, checks, binds }),
    events,
  };
}

test('Segment DELETE exact absence and preserved transitional acknowledgements follow one dispatch', async () => {
  for (const mode of ['absence', 'processing', 'deleting']) {
    const h = harness(mode);
    const result = await h.run();
    assert.equal(result.outcome, mode === 'absence' ? 'deleted' : 'deletion-processing');
    assert.equal(
      result.mutation,
      mode === 'absence' ? 'confirmed-deleted' : 'acknowledged-processing',
    );
    assert.equal(h.counts().deletes, 1);
    assert.equal(h.counts().reads, 3);
    assert.deepEqual(h.events.slice(-3), ['input', 'delete', 'read']);
  }
});
test('Segment preview, missing confirmation, already absent and admission failures never write', async () => {
  for (const mode of [
    'preview',
    'confirmation',
    'absent-before',
    'input',
    'late-confirmation',
    'dependency',
    'source',
    'identity',
    'definition',
    'unknown',
    'drift',
    'membership',
    'auth',
    'generic404',
  ]) {
    const h = harness(mode);
    const result = await h.run();
    assert.equal(
      result.outcome,
      mode === 'preview' ? 'delete' : mode === 'absent-before' ? 'unchanged' : 'blocked',
      mode,
    );
    assert.equal(result.mutation, 'not-attempted', mode);
    assert.equal(h.counts().deletes, 0, mode);
  }
});
test('HTTP204 alone, malformed responses, uncertain writes and mismatched reads never confirm deletion or replay', async () => {
  for (const mode of [
    'active',
    'preexisting-processing',
    'late-processing',
    'uncertain',
    'malformed-write',
    'readback-drift',
    'unknown-status',
  ]) {
    const h = harness(mode);
    const result = await h.run();
    assert.equal(result.outcome, 'failed', mode);
    assert.equal(result.mutation, 'unknown', mode);
    assert.equal(h.counts().deletes, 1, mode);
    assert.equal(
      h.counts().reads,
      ['active', 'preexisting-processing', 'late-processing'].includes(mode)
        ? 2 + segmentDeleteBudget.reads
        : 3,
      mode,
    );
  }
});
test('Segment deletion rejects scope drift and clock expiry before dispatch', async () => {
  for (const mode of ['selection', 'origin', 'version', 'time']) {
    const h = harness();
    let calls = 0;
    h.flags.verifyInput = async () => {
      if (++calls !== 3) return;
      if (mode === 'selection') h.selected.soapNumeric = '65.0';
      if (mode === 'origin') h.connection.instanceUrl = 'https://foreign.example';
      if (mode === 'version') h.connection.getApiVersion = () => '65.0';
      if (mode === 'time') h.flags.now = () => 999_999;
    };
    if (mode === 'time') {
      let ticks = 0;
      h.flags.now = () => (++ticks > 5 ? 999_999 : 0);
    }
    const result = await h.run();
    assert.equal(result.outcome, 'blocked', mode);
    assert.equal(h.counts().deletes, 0, mode);
  }
});
test('Segment transport rejects invalid names and non68 routes without dispatch', async () => {
  for (const version of ['65.0', '68.0']) {
    for (const name of ['../Audience', 'Audience/x', '', 'Audience?x']) {
      const client = new ConnectClient(
        { instanceUrl: 'https://synthetic.example', request: async () => assert.fail('write') },
        version,
      );
      await assert.rejects(client.deleteSegment(name));
    }
  }
});
/**
 * Build a public command invocation without org writes.
 * @param {object} overrides Flag overrides.
 * @returns {object} Command and captured activity.
 */
function invocation(overrides = {}) {
  const command = Object.create(Delete.prototype);
  const logs = [];
  const calls = [];
  const flags = {
    metadata: ['segment:Audience'],
    'source-dir': 'Audience.segment.json',
    preview: false,
    'confirm-delete': true,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => false;
  command.log = (line) => logs.push(line);
  command.resolveInputs = async () => [{ path: 'Audience.segment.json', document: document() }];
  command.verifySegmentInput = async () => {
    calls.push('input');
  };
  command.resolveConnection = async () => {
    calls.push('connection');
    return {};
  };
  command.deleteSegment = async (_document, _connection, route, scope, options) => {
    calls.push('service');
    assert.deepEqual(route, selection());
    assert.equal(scope, 'default');
    await options.verifyInput();
    return {
      family: 'segment',
      outcome: 'deletion-processing',
      mutation: 'acknowledged-processing',
      requiredEffects: [],
      diagnostics: [],
    };
  };
  return { command, flags, logs, calls };
}
/**
 * Preserve the test process exit code around a command.
 * @param {object} command Command under test.
 * @returns {Promise<object>} Command envelope.
 */
async function run(command) {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
}
test('public delete selects exact JSON, routes native68 and prints exact processing suffix', async () => {
  const h = invocation();
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.ok(h.logs.includes('deleted segment Audience (server is still processing)'));
  assert.equal(result.result.items[0].mutation, 'acknowledged-processing');
});
test('public Segment delete refuses mixed/legacy/mismatched scope or source before service', async () => {
  for (const overrides of [
    { metadata: ['segment:Audience', 'dlo:Other__dll'] },
    { 'api-version': '65.0' },
    { dataspace: 'other' },
    { 'source-dir': 'Audience.marketSegmentDefinition-meta.xml' },
    { metadata: ['segment:Other'] },
    { 'delete-dlo': true },
  ]) {
    const h = invocation(overrides);
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.ok(!h.calls.includes('service'));
  }
});
