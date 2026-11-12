import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Delete from '../lib/commands/data360/delete.js';
import { observeCalculatedInsight } from '../lib/artifacts/calculated-insight-document.js';
import { writeCalculatedInsightDocument } from '../lib/artifacts/write-calculated-insight.js';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../lib/artifacts/read-deploy-input.js';

// eslint-disable-next-line unicorn/no-null -- Neutral wire profile retains explicit null settings.
const nil = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const app = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${app} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${app}`;
const runtime = (status = 'DRAFT') => ({
  apiName: 'SyntheticDelete__cio',
  dataSpace: 'default',
  calculatedInsightStatus: status,
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: nil,
  displayName: 'Synthetic delete',
  expression,
  isEnabled: true,
  dimensions:
    status === 'DRAFT'
      ? []
      : [
          {
            apiName: 'app_id__c',
            creationType: 'Custom',
            dataSource: nil,
            dataType: 'Text',
            dateGranularity: nil,
            displayName: 'app_id',
            fieldRole: 'DIMENSION',
            formula: app,
          },
        ],
  measures:
    status === 'DRAFT'
      ? []
      : [
          {
            apiName: 'device_count__c',
            creationType: 'Custom',
            dataSource: nil,
            dataType: 'Number',
            displayName: 'device_count',
            fieldAggregationType: 'NONAGGREGATABLE',
            fieldRole: 'MEASURE',
            formula: `APPROX_COUNT_DISTINCT(${device})`,
          },
        ],
  publishScheduleEndDate: nil,
  publishScheduleInterval: 'NOT_SCHEDULED',
  publishScheduleStartDateTime: nil,
  subType: nil,
  lastCalcInsightStatusDateTime: '2026-11-01T00:00:00.000Z',
  lastCalcInsightStatusErrorCode: nil,
  lastRunDateTime: nil,
  lastRunStatus: nil,
  lastRunStatusDateTime: nil,
  lastRunStatusErrorCode: nil,
  historyPublishScheduleInterval: nil,
  historyPublishScheduleTimeZone: nil,
  historyPublishTime: nil,
  publishScheduleTimeZone: nil,
  sourceCiDevName: nil,
  sourceCiId: nil,
  sourceCiName: nil,
  isFromPackage: false,
  queryDialect: 'ANSI_SQL',
});
const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return { result: await command.run(), exit: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};
const harness = async (overrides = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-delete-command-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const desired = observeCalculatedInsight(runtime()).document;
  const xml = `<MktCalcInsightObjectDef xmlns="http://soap.sforce.com/2006/04/metadata"><creationType>Custom</creationType><expression>${expression}</expression><masterLabel>Synthetic delete</masterLabel></MktCalcInsightObjectDef>\n`;
  const pair = await writeCalculatedInsightDocument(desired, xml, root, false);
  const flags = {
    metadata: ['calculated-insight:SyntheticDelete__cio'],
    'source-dir': pair.path,
    'api-version': '68.0',
    preview: false,
    'confirm-delete': true,
    ...overrides,
  };
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  const calls = { auth: 0, writes: 0, reads: 0 };
  let absent = false;
  let status = 'DRAFT';
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    getApiVersion: () => '68.0',
  };
  command.resolveConnection = async () => {
    calls.auth++;
    return connection;
  };
  const context = {
    check() {
      assert.equal(connection.getApiVersion(), '68.0');
    },
    async get() {
      calls.reads++;
      if (absent) {
        const error = new ConnectError('REQUEST_FAILED', 404);
        error.nativeCode = 'ITEM_NOT_FOUND';
        throw error;
      }
      return runtime(status);
    },
    async metadata() {
      return absent
        ? [{}]
        : [
            {
              fullName: 'SyntheticDelete',
              creationType: 'Custom',
              expression,
              masterLabel: 'Synthetic delete',
            },
          ];
    },
    async bind() {
      return { targetId: 'private-local-id', fields: [] };
    },
  };
  command.calculatedInsightContext = () => context;
  command.deleteCalculatedInsight = (...arguments_) =>
    deleteCalculatedInsight(...arguments_.slice(0, 4), {
      ...arguments_[4],
      nativeClient: {
        delete: async (name) => {
          assert.equal(name, desired.identity.apiName);
          calls.writes++;
          absent = true;
        },
      },
    });
  return {
    command,
    flags,
    calls,
    pair,
    context,
    connection,
    absent: () => {
      absent = true;
    },
    active: () => {
      status = 'ACTIVE';
    },
  };
};
for (const active of [false, true])
  test(`CI delete ${active ? 'ACTIVE' : 'DRAFT'} uses guarded deletion and independent dual absence`, async () => {
    const h = await harness();
    if (active) h.active();
    const { result, exit } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(exit, undefined);
    assert.equal(h.calls.writes, 1);
    assert.equal(h.calls.reads, 3);
    const [item] = result.result.items;
    assert.equal(item.outcome, 'deleted');
    assert.equal(item.mutation, 'confirmed-deleted');
    assert.deepEqual(item.route, {
      apiVersion: '68.0',
      method: 'DELETE',
      resource: 'calculated-insights',
    });
    assert.deepEqual(
      item.routes.map((r) => [r.operation, r.apiVersion]),
      [
        ['calculated-insight.delete', '68.0'],
        ['calculated-insight.get', '68.0'],
        ['calculated-insight.metadata', '65.0'],
        ['dependency.get', '65.0'],
        ['dependency.metadata', '65.0'],
      ],
    );
    assert.doesNotMatch(JSON.stringify(result), /SELECT|private-local-id|lastRunDateTime/u);
    h.flags['confirm-delete'] = false;
    const repeat = await run(h.command);
    assert.equal(repeat.result.result.items[0].outcome, 'unchanged');
    assert.equal(h.calls.writes, 1);
  });
for (const absent of [false, true])
  test(`CI read-only ${absent ? 'dual absent noop' : 'preview'} requires no confirmation`, async () => {
    const h = await harness({ preview: !absent, 'confirm-delete': false });
    if (absent) h.absent();
    const { result } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(h.calls.writes, 0);
    assert.equal(result.result.items[0].outcome, absent ? 'unchanged' : 'delete');
  });
for (const confirmation of [false, undefined, 'true'])
  test(`CI mutation requires explicit boolean confirmation ${confirmation}`, async () => {
    const h = await harness({ 'confirm-delete': confirmation });
    const { result, exit } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(exit, 1);
    assert.equal(h.calls.writes, 0);
    assert.equal(result.diagnostics.errors[0].code, 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
  });
for (const pin of ['65.0', '64.0', '66.0', '67.0', '69.0', 'latest'])
  test(`CI delete rejects pin ${pin} before auth`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
for (const overrides of [
  { dataspace: 'other' },
  { 'source-dir': undefined },
  { 'source-dir': 'folder' },
  { 'source-dir': '*.calculatedInsight.json' },
  { 'source-dir': 'other.dmo.json' },
  { metadata: ['calculated-insight:Foreign__cio'] },
  { metadata: ['calculated-insight:*'] },
  { metadata: ['calculated-insight:SyntheticDelete__cio', 'dlo:Other__dll'] },
  { 'delete-dlo': true },
  { metadata: ['dlo:Other__dll'] },
  { metadata: ['data-stream:Other'] },
])
  test(`CI invalid intent blocked before auth ${JSON.stringify(overrides)}`, async () => {
    const h = await harness(overrides);
    h.command.resolveTarget = () => assert.fail('No legacy auth');
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
test('CI deletion accepts JSON companion', async () => {
  const h = await harness();
  h.flags['source-dir'] = h.pair.companionPath;
  const { result } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(h.calls.writes, 1);
});
for (const member of ['path', 'companionPath'])
  test(`CI pair byte drift ${member} blocks deletion`, async () => {
    const h = await harness();
    const bind = h.context.bind;
    h.context.bind = async () => {
      await writeFile(h.pair[member], 'private changed input');
      return bind();
    };
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.writes, 0);
  });
for (const drift of ['flags', 'receiver', 'target', 'unknown'])
  test(`CI deletion ${drift} fails closed`, async () => {
    const h = await harness();
    if (drift === 'flags')
      h.command.resolveConnection = async () => {
        h.flags['confirm-delete'] = false;
        return h.connection;
      };
    if (drift === 'receiver') h.connection.getApiVersion = () => '65.0';
    if (drift === 'target') h.context.get = async () => ({ ...runtime(), displayName: 'foreign' });
    if (drift === 'unknown')
      h.command.deleteCalculatedInsight = (...arguments_) =>
        deleteCalculatedInsight(...arguments_.slice(0, 4), {
          ...arguments_[4],
          nativeClient: {
            delete: async () => {
              h.calls.writes++;
              throw new Error('private response');
            },
          },
        });
    const { result, exit } = await run(h.command);
    assert.equal(result.status, drift === 'unknown' ? 'failed' : 'blocked');
    assert.equal(exit, 1);
    assert.equal(h.calls.writes, drift === 'unknown' ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(result), /private response/u);
    if (drift === 'unknown') assert.equal(result.result.items[0].mutation, 'unknown');
  });
test('CI delete help discloses paired destructive boundary without changing aliases', () => {
  assert.deepEqual(Delete.aliases, ['datacloud:delete', 'd360:delete', 'dc:delete']);
  assert.match(Delete.description, /--confirm-delete/u);
  assert.match(Delete.description, /reads remain API65/u);
  assert.match(Delete.description, /already dual-absent targets are read-only/u);
});

for (const pin of [undefined, 'auto'])
  test(`CI delete accepts default pin ${pin} as native68`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(h.calls.writes, 1);
  });

test('CI delete ignores alternating ACTIVE attribution between baseline and fresh reads', async () => {
  const h = await harness();
  h.active();
  const get = h.context.get;
  let reads = 0;
  h.context.get = async () => {
    const raw = await get();
    const sourceApiName =
      ++reads % 2 === 0 ? 'ssot__DeviceId__c' : 'ssot__SoftwareApplicationId__c';
    for (const role of ['dimensions', 'measures'])
      raw[role][0].dataSource = { sourceApiName, type: 'STREAMING_DATA_MODEL' };
    return raw;
  };
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(h.calls.writes, 1);
});

test('CI delete still refuses a real status drift between baseline and fresh reads', async () => {
  const h = await harness();
  h.active();
  const get = h.context.get;
  let reads = 0;
  h.context.get = async () => {
    const raw = await get();
    if (++reads === 2) raw.calculatedInsightStatus = 'DRAFT';
    if (reads === 2) {
      raw.dimensions = [];
      raw.measures = [];
      raw.isFromPackage = nil;
    }
    return raw;
  };
  const { result } = await run(h.command);
  assert.notEqual(result.status, 'success');
  assert.equal(h.calls.writes, 0);
});
