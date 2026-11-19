import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Delete from '../lib/commands/data360/delete.js';
import { observeNativeCalculatedInsight } from '../lib/artifacts/native-calculated-insight-document.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';
import { ConnectError } from '../lib/transport/connect-client.js';

// eslint-disable-next-line unicorn/no-null -- Neutral wire profile retains explicit null settings.
const nil = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const app = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${app} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${app}`;
const runtime = (status = 'DRAFT', dataSpace = 'default') => ({
  apiName: 'SyntheticDelete__cio',
  dataSpace,
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
  const cwd = process.cwd();
  process.exitCode = undefined;
  if (command.projectRoot) process.chdir(command.projectRoot);
  try {
    return { result: await command.run(), exit: process.exitCode };
  } finally {
    process.chdir(cwd);
    process.exitCode = previous;
  }
};
const harness = async (overrides = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-delete-command-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  // The org answers in the run's data space.
  const space = overrides.dataspace ?? 'default';
  const files = observeNativeCalculatedInsight(runtime('DRAFT', space));
  const pair = await writeNativeCalculatedInsightDocument(files, root, false);
  const flags = {
    metadata: ['calculated-insight:SyntheticDelete__cio'],
    'api-version': '68.0',
    preview: false,
    ...overrides,
  };
  const command = Object.create(Delete.prototype);
  command.projectRoot = root;
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const calls = { auth: 0, writes: 0, reads: 0 };
  let absent = false;
  let status = 'DRAFT';
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    getApiVersion: () => '68.0',
    getUsername: () => 'target',
  };
  command.resolveConnection = async () => {
    calls.auth++;
    return connection;
  };
  const contexts = [];
  const context = {
    dataSpace: space,
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
      return runtime(status, space);
    },
  };
  command.calculatedInsightContext = (_connection, dataSpace) => {
    contexts.push(dataSpace);
    return context;
  };
  command.deleteCalculatedInsight = (...arguments_) =>
    deleteCalculatedInsight(...arguments_.slice(0, 4), {
      ...arguments_[4],
      nativeClient: {
        delete: async (name) => {
          assert.equal(name, 'SyntheticDelete__cio');
          calls.writes++;
          absent = true;
        },
      },
    });
  return {
    command,
    flags,
    calls,
    contexts,
    pair,
    context,
    connection,
    restore: () => writeNativeCalculatedInsightDocument(files, root, false),
    absent: () => {
      absent = true;
    },
    active: () => {
      status = 'ACTIVE';
    },
  };
};
for (const active of [false, true])
  test(`CI delete ${active ? 'ACTIVE' : 'DRAFT'} sends one DELETE and reads until 404`, async () => {
    const h = await harness();
    if (active) h.active();
    const { result, exit } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(exit, undefined);
    assert.equal(h.calls.writes, 1, JSON.stringify(result));
    // The org source read, the read before the DELETE and the 404 after it.
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
      ],
    );
    assert.doesNotMatch(JSON.stringify(result), /SELECT|lastRunDateTime/u);
    // The JSON and the SQL file of the CI, at their canonical paths, are removed after the deletion.
    assert.deepEqual(
      item.removedLocalFiles.map((file) => file.path),
      [h.pair.path, h.pair.companionPath],
    );
    assert.ok(item.removedLocalFiles.every((file) => file.outcome === 'removed'));
    for (const file of item.removedLocalFiles)
      await assert.rejects(lstat(file.path), { code: 'ENOENT' });
    await h.restore();
    const repeat = await run(h.command);
    assert.equal(repeat.result.result.items[0].outcome, 'unchanged');
    assert.equal(h.calls.writes, 1);
  });
for (const absent of [false, true])
  test(`CI read-only ${absent ? 'dual absent noop' : 'preview'} is read-only`, async () => {
    const h = await harness({ preview: !absent });
    if (absent) h.absent();
    const { result } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(h.calls.writes, 0);
    assert.equal(result.result.items[0].outcome, absent ? 'unchanged' : 'delete');
  });
test('CI delete in another data space reads and deletes in that data space', async () => {
  const h = await harness({ dataspace: 'dataspace2' });
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(h.calls.writes, 1);
  assert.deepEqual([...new Set(h.contexts)], ['dataspace2']);
  assert.equal(result.result.scope.dataSpace, 'dataspace2');
  assert.deepEqual(result.result.items[0].identity, {
    dataSpace: 'dataspace2',
    apiName: 'SyntheticDelete__cio',
  });
});
test('CI delete refuses an insight the org reads in another data space than the run', async () => {
  const h = await harness({ dataspace: 'dataspace2' });
  h.context.get = async () => runtime('DRAFT', 'default');
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(h.calls.writes, 0);
});
test('CI delete by name needs no --confirm-delete and reads the definition from the org', async () => {
  const h = await harness();
  assert.equal(h.flags['confirm-delete'], undefined);
  // The local files are not an input: a changed file does not stop the delete.
  await writeFile(h.pair.companionPath, 'not the org definition');
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(h.calls.writes, 1);
});
test('CI delete of a name the org reads as another CI is blocked without a write', async () => {
  const h = await harness({ metadata: ['calculated-insight:Foreign__cio'] });
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(h.calls.writes, 0);
  assert.equal(result.diagnostics.errors[0].code, 'CI_IDENTITY_CHANGED');
});
for (const pin of ['65.0', '64.0', '66.0', '67.0', '69.0', 'latest'])
  test(`CI delete rejects pin ${pin} before auth`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
for (const overrides of [
  { dataspace: 'Unknown' },
  { metadata: ['calculated-insight:*'] },
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
for (const drift of ['flags', 'receiver', 'unknown'])
  test(`CI deletion ${drift} fails closed`, async () => {
    const h = await harness();
    if (drift === 'flags')
      h.command.resolveConnection = async () => {
        h.flags['keep-local-files'] = true;
        return h.connection;
      };
    if (drift === 'receiver') h.connection.getApiVersion = () => '65.0';
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
test('CI delete help names the API 68 read, any-status DELETE and the 404 confirmation', () => {
  assert.deepEqual(Delete.aliases, ['datacloud:delete', 'd360:delete', 'dc:delete']);
  assert.match(Delete.description, /deleted with one DELETE in any status, schedule or SQL/u);
  assert.match(Delete.description, /read until it answers 404/u);
  assert.doesNotMatch(Delete.description, /API65|never-run/u);
});

for (const variant of ['scheduled', 'never published SQL'])
  test(`CI delete of a ${variant} insight is not refused by the plugin`, async () => {
    const h = await harness();
    const get = h.context.get;
    h.context.get = async () => ({
      ...(await get()),
      ...(variant === 'scheduled'
        ? { publishScheduleInterval: 'TWENTY_FOUR', lastRunDateTime: '2026-11-01T00:00:00.000Z' }
        : { expression: 'SELECT 1 AS one__c FROM Other__dlm' }),
    });
    const { result } = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(h.calls.writes, 1);
  });

test('CI delete reports a 4xx DELETE answer as rejected and does not read again', async () => {
  const h = await harness();
  h.command.deleteCalculatedInsight = (...arguments_) =>
    deleteCalculatedInsight(...arguments_.slice(0, 4), {
      ...arguments_[4],
      nativeClient: {
        delete: async () => {
          h.calls.writes++;
          throw new ConnectError('REQUEST_FAILED', 400);
        },
      },
    });
  const { result, exit } = await run(h.command);
  assert.equal(exit, 1);
  assert.equal(result.result.items[0].mutation, 'rejected');
  assert.equal(result.diagnostics.errors[0].code, 'REQUEST_FAILED');
  assert.equal(h.calls.reads, 2);
});

for (const pin of [undefined, 'auto'])
  test(`CI delete accepts default pin ${pin} as native68`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(h.calls.writes, 1);
  });
