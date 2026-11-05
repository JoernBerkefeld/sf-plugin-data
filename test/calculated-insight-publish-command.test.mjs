import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Publish from '../lib/commands/data360/publish.js';
import { observeCalculatedInsight } from '../lib/artifacts/calculated-insight-document.js';
import { writeCalculatedInsightDocument } from '../lib/artifacts/write-calculated-insight.js';
import { publishCalculatedInsight } from '../lib/services/publish-calculated-insight.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import {
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../lib/artifacts/read-deploy-input.js';

// eslint-disable-next-line unicorn/no-null -- Neutral complete wire profiles preserve null settings.
const nil = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const app = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${app} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${app}`;
const runtime = (status) => ({
  apiName: 'SyntheticPublish__cio',
  dataSpace: 'default',
  calculatedInsightStatus: status,
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: nil,
  displayName: 'Synthetic publish',
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
    const result = await command.run();
    return { result, exit: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};
const harness = async (overrides = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-publish-command-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const desired = observeCalculatedInsight(runtime('DRAFT'), '68.0').document;
  const xml = `<MktCalcInsightObjectDef xmlns="http://soap.sforce.com/2006/04/metadata"><creationType>Custom</creationType><expression>${expression}</expression><masterLabel>Synthetic publish</masterLabel></MktCalcInsightObjectDef>\n`;
  const pair = await writeCalculatedInsightDocument(desired, xml, root, false);
  const flags = {
    'source-dir': pair.path,
    'api-version': '68.0',
    preview: false,
    'allow-processing': true,
    ...overrides,
  };
  const command = Object.create(Publish.prototype);
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  const calls = { auth: 0, writes: 0, reads: 0 };
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
      return runtime(status);
    },
    async metadata() {
      return [
        {
          fullName: 'SyntheticPublish',
          creationType: 'Custom',
          expression,
          masterLabel: 'Synthetic publish',
        },
      ];
    },
    async bind() {
      return { targetId: 'private-local-id', fields: [] };
    },
  };
  command.calculatedInsightContext = () => context;
  command.publishCalculatedInsight = (...arguments_) =>
    publishCalculatedInsight(...arguments_.slice(0, 4), {
      ...arguments_[4],
      nativeClient: {
        publish: async () => {
          calls.writes++;
          status = 'ACTIVE';
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
    active: () => {
      status = 'ACTIVE';
    },
  };
};

test('publish command delegates guarded service with paired digest, separate publication and honest routes', async () => {
  const h = await harness();
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(exit, undefined);
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.reads, 3);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'published');
  assert.equal(item.mutation, 'confirmed-published');
  assert.deepEqual(item.route, {
    apiVersion: '68.0',
    method: 'PATCH',
    resource: 'calculated-insights',
  });
  assert.deepEqual(
    item.routes.map((r) => [r.operation, r.apiVersion]),
    [
      ['calculated-insight.publish', '68.0'],
      ['calculated-insight.get', '68.0'],
      ['calculated-insight.metadata', '65.0'],
      ['dependency.get', '65.0'],
      ['dependency.metadata', '65.0'],
    ],
  );
  assert.equal(h.command.calculatedInsightObservations.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /SELECT|private-local-id|lastRunDateTime/u);
});
for (const active of [false, true])
  test(`publish read-only ${active ? 'ACTIVE noop' : 'DRAFT preview'} needs no acknowledgement`, async () => {
    const h = await harness({ preview: !active, 'allow-processing': false });
    if (active) h.active();
    const { result } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(h.calls.writes, 0);
    assert.equal(result.result.items[0].outcome, active ? 'unchanged' : 'publish');
    assert.deepEqual(result.result.items[0].requiredEffects, active ? [] : ['processing']);
  });
test('publish DRAFT without processing acknowledgement is blocked with no mutation', async () => {
  const h = await harness({ 'allow-processing': false });
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(exit, 1);
  assert.equal(h.calls.writes, 0);
  assert.equal(result.diagnostics.errors[0].code, 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
});
for (const pin of [undefined, 'auto', '65.0', '64.0', '66.0', '67.0', '69.0', 'latest'])
  test(`publish rejects pin ${pin} before auth`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
    assert.equal(h.calls.writes, 0);
  });
for (const overrides of [
  { dataspace: 'other' },
  { 'source-dir': undefined },
  { 'source-dir': 'folder' },
  { 'source-dir': 'other.dmo-meta.json' },
  { 'source-dir': '*.calculatedInsight.json' },
])
  test(`publish rejects unqualified local intent ${JSON.stringify(overrides)}`, async () => {
    const h = await harness(overrides);
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
test('publish accepts the companion JSON member of the same exact pair', async () => {
  const h = await harness();
  h.flags['source-dir'] = h.pair.companionPath;
  const { result } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(h.calls.writes, 1);
});
for (const member of ['path', 'companionPath'])
  test(`publish pair byte drift ${member} before write blocks`, async () => {
    const h = await harness();
    const bind = h.context.bind;
    h.context.bind = async () => {
      await writeFile(h.pair[member], 'private changed input');
      return bind();
    };
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.writes, 0);
    assert.doesNotMatch(JSON.stringify(result), /private changed input/u);
  });
for (const drift of ['flags', 'receiver', 'target', 'unknown'])
  test(`publish ${drift} fails closed`, async () => {
    const h = await harness();
    if (drift === 'flags')
      h.command.resolveConnection = async () => {
        h.flags.preview = true;
        return h.connection;
      };
    if (drift === 'receiver') h.connection.getApiVersion = () => '65.0';
    if (drift === 'target')
      h.context.get = async () => ({ ...runtime('DRAFT'), displayName: 'foreign' });
    if (drift === 'unknown')
      h.command.publishCalculatedInsight = (...arguments_) =>
        publishCalculatedInsight(...arguments_.slice(0, 4), {
          ...arguments_[4],
          nativeClient: {
            publish: async () => {
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
for (const status of [429, 503])
  for (const phase of ['admission', 'write', 'settlement'])
    for (const json of [false, true])
      test(`publish ${phase} HTTP${status} guidance once in ${json ? 'JSON' : 'human'} output`, async () => {
        const h = await harness();
        const output = [];
        h.command.jsonEnabled = () => json;
        h.command.log = (line) => output.push(line);
        const failure = () => {
          throw retainConnectDiagnostic(
            new Error('Bearer private-secret <html>private-body</html>'),
            connectDiagnostic(status, { 'Retry-After': '17', authorization: 'private-token' }),
          );
        };
        const get = h.context.get;
        h.context.get = async () => {
          if (phase === 'admission' || h.calls.writes) failure();
          return get();
        };
        h.command.publishCalculatedInsight = (...arguments_) =>
          publishCalculatedInsight(...arguments_.slice(0, 4), {
            ...arguments_[4],
            delay: async () => {},
            nativeClient: {
              publish: async () => {
                h.calls.writes++;
                if (phase === 'write') failure();
              },
            },
          });
        const { result, exit } = await run(h.command);
        assert.equal(exit, 1);
        assert.equal(result.status, phase === 'admission' ? 'blocked' : 'failed');
        assert.equal(
          result.result.items[0].mutation,
          phase === 'admission' ? 'not-attempted' : 'unknown',
        );
        assert.equal(h.calls.writes, phase === 'admission' ? 0 : 1);
        assert.equal(result.diagnostics.errors.length, 1);
        assert.equal(result.diagnostics.errors[0].retryable, false);
        const message = result.diagnostics.errors[0].message;
        assert.match(
          message,
          status === 429 ? /429 Too Many Requests/u : /503.*POSSIBLE Connect rate limit/u,
        );
        assert.match(message, /Server Retry-After: 17/u);
        assert.match(message, /no automatic replay/u);
        assert.doesNotMatch(JSON.stringify(result) + output.join('\n'), /private-|Bearer|<html>/u);
        if (json) assert.deepEqual(output, []);
        else assert.equal(output.filter((line) => line.includes(message)).length, 1);
      });

test('publish ordinary blocked human output remains unchanged', async () => {
  const h = await harness({ 'allow-processing': false });
  const output = [];
  h.command.jsonEnabled = () => false;
  h.command.log = (line) => output.push(line);
  await run(h.command);
  assert.deepEqual(output, [
    'Publish: blocked.',
    'blocked: SyntheticPublish__cio; mutation: not-attempted.',
  ]);
});

test('publish help preserves separate lifecycle and no scheduling guarantees', () => {
  assert.deepEqual(Publish.aliases, ['datacloud:publish', 'd360:publish', 'dc:publish']);
  assert.match(Publish.description, /--preview is read-only/u);
  assert.match(Publish.description, /equal ACTIVE target is unchanged/u);
  assert.match(Publish.description, /dependency reads remain API65/u);
  assert.equal(Publish.flags['api-version'].default, undefined);
});
