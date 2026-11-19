import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Publish from '../lib/commands/data360/publish.js';
import { observeNativeCalculatedInsight } from '../lib/artifacts/native-calculated-insight-document.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import { publishCalculatedInsight } from '../lib/services/publish-calculated-insight.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { errorCodeInfo } from '../lib/errors/registry.js';
import { ConnectError } from '../lib/transport/connect-client.js';
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
const runtime = (status, dataSpace = 'default') => ({
  apiName: 'SyntheticPublish__cio',
  dataSpace,
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
const harness = async (overrides = {}, fileSpace = 'default') => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-publish-command-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const pair = await writeNativeCalculatedInsightDocument(
    observeNativeCalculatedInsight(runtime('DRAFT', fileSpace)),
    root,
    false,
  );
  // The org answers in the run's data space.
  const space = overrides.dataspace ?? 'default';
  const flags = {
    'source-dir': pair.path,
    'api-version': '68.0',
    preview: false,
    ...overrides,
  };
  const command = Object.create(Publish.prototype);
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  const calls = { auth: 0, writes: 0, reads: 0, bodies: [] };
  let status = 'DRAFT';
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    getApiVersion: () => '68.0',
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
      return runtime(status, space);
    },
  };
  command.calculatedInsightContext = (_connection, dataSpace) => {
    contexts.push(dataSpace);
    return context;
  };
  command.publishCalculatedInsight = (...arguments_) =>
    publishCalculatedInsight(...arguments_.slice(0, 4), {
      ...arguments_[4],
      nativeClient: {
        update: async (document, options) => {
          calls.writes++;
          calls.bodies.push({ document, options });
          status = 'ACTIVE';
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
    active: () => {
      status = 'ACTIVE';
    },
  };
};

test('publish sends the file with draft false and reads until ACTIVE', async () => {
  const h = await harness();
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(exit, undefined);
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.reads, 2);
  assert.deepEqual(h.calls.bodies, [
    {
      document: observeNativeCalculatedInsight(runtime('DRAFT')),
      options: { draft: false, observed: observeNativeCalculatedInsight(runtime('DRAFT')) },
    },
  ]);
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
    ],
  );
  assert.doesNotMatch(JSON.stringify(result), /SELECT|lastRunDateTime/u);
});
for (const active of [false, true])
  test(`publish read-only ${active ? 'ACTIVE noop' : 'DRAFT preview'} writes nothing`, async () => {
    const h = await harness({ preview: !active });
    if (active) h.active();
    const { result } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(h.calls.writes, 0);
    assert.equal(result.result.items[0].outcome, active ? 'unchanged' : 'publish');
  });
test('publish has no --allow-processing flag and publishes a DRAFT without one', async () => {
  assert.equal(Publish.flags['allow-processing'], undefined);
  const h = await harness();
  const { result } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(h.calls.writes, 1);
});
test('publish of an absent insight is refused with CI_NOT_FOUND and writes nothing', async () => {
  const h = await harness();
  h.context.get = async () => {
    h.calls.reads++;
    const error = new ConnectError('REQUEST_FAILED', 404);
    error.nativeCode = 'ITEM_NOT_FOUND';
    throw error;
  };
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'CI_NOT_FOUND');
  assert.equal(h.calls.writes, 0);
});
test('publish of an ACTIVE insight that differs from the file sends the file', async () => {
  const h = await harness();
  h.active();
  const get = h.context.get;
  h.context.get = async () => ({
    ...(await get()),
    ...(h.calls.writes === 0 ? { displayName: 'Org label' } : {}),
  });
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].outcome, 'published');
  assert.equal(h.calls.bodies[0].document.displayName, 'Synthetic publish');
});
for (const pin of ['65.0', '64.0', '66.0', '67.0', '69.0', 'latest'])
  test(`publish rejects pin ${pin} before auth`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
    assert.equal(h.calls.writes, 0);
  });
test('publish works in the run data space the file names', async () => {
  const h = await harness({ dataspace: 'dataspace2' }, 'dataspace2');
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(h.calls.writes, 1);
  assert.deepEqual(h.contexts, ['dataspace2']);
  assert.deepEqual(result.result.items[0].identity, {
    apiName: 'SyntheticPublish__cio',
    dataSpace: 'dataspace2',
  });
  // The PATCH body names the file's data space.
  assert.equal(h.calls.bodies[0].document.dataSpace, 'dataspace2');
});
test('publish refuses a file of another data space than the run without a write', async () => {
  const h = await harness({ dataspace: 'dataspace2' });
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(h.calls.writes, 0);
  assert.equal(result.diagnostics.errors[0].code, 'CI_DATASPACE_MISMATCH');
  // Refused before any write: no unknown outcome to inspect.
  assert.doesNotMatch(
    result.diagnostics.errors[0].message,
    /Inspect unknown outcomes|Mutation may have occurred/u,
  );
});
for (const overrides of [
  { 'source-dir': undefined },
  { 'source-dir': 'folder' },
  { 'source-dir': 'other.dmo-meta.json' },
  { 'source-dir': '*.calculatedInsight-meta.json' },
  { 'source-dir': 'SyntheticPublish__cio.calculatedInsight.json' },
  { 'source-dir': 'SyntheticPublish.mktCalcInsightObjectDef-meta.xml' },
])
  test(`publish rejects unqualified local intent ${JSON.stringify(overrides)}`, async () => {
    const h = await harness(overrides);
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
test('publish accepts the SQL file of the same insight', async () => {
  const h = await harness();
  h.flags['source-dir'] = h.pair.companionPath;
  const { result } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(h.calls.writes, 1);
});
for (const member of ['path', 'companionPath'])
  test(`publish JSON or SQL byte drift ${member} before write blocks`, async () => {
    const h = await harness();
    const get = h.context.get;
    h.context.get = async () => {
      await writeFile(h.pair[member], 'private changed input');
      return get();
    };
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.writes, 0);
    assert.doesNotMatch(JSON.stringify(result), /private changed input/u);
  });
for (const drift of ['flags', 'receiver', 'unknown'])
  test(`publish ${drift} fails closed`, async () => {
    const h = await harness();
    if (drift === 'flags')
      h.command.resolveConnection = async () => {
        h.flags.preview = true;
        return h.connection;
      };
    if (drift === 'receiver') h.connection.getApiVersion = () => '65.0';
    if (drift === 'unknown')
      h.command.publishCalculatedInsight = (...arguments_) =>
        publishCalculatedInsight(...arguments_.slice(0, 4), {
          ...arguments_[4],
          nativeClient: {
            update: async () => {
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
              update: async () => {
                h.calls.writes++;
                if (phase === 'write') failure();
              },
            },
          });
        const { result, exit } = await run(h.command);
        assert.equal(exit, 1);
        assert.equal(result.status, phase === 'admission' ? 'blocked' : 'failed');
        // A synchronous 4xx answer to the write (429) applied nothing.
        assert.equal(
          result.result.items[0].mutation,
          phase === 'admission'
            ? 'not-attempted'
            : phase === 'write' && status === 429
              ? 'rejected'
              : 'unknown',
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

for (const code of ['CI_RUNTIME_UNKNOWN'])
  test(`publish blocked human output prints ${code} with hint and docs`, async () => {
    const h = await harness();
    h.context.get = async () => {
      throw new Error('Synthetic admission read failure');
    };
    const output = [];
    h.command.jsonEnabled = () => false;
    h.command.log = (line) => output.push(line);
    const { result } = await run(h.command);
    const { hint, docs } = errorCodeInfo(code);
    const [diagnostic] = result.diagnostics.errors;
    assert.equal(diagnostic.code, code);
    assert.deepEqual(output, [
      'Publish: blocked.',
      'blocked: SyntheticPublish__cio; mutation: not-attempted.',
      `${code}: ${diagnostic.message}\nHint: ${hint}\nDocs: ${docs}`,
    ]);
  });

test('publish help names the API 68 PATCH with draft false and no API 65 reads', () => {
  assert.deepEqual(Publish.aliases, ['datacloud:publish', 'd360:publish', 'dc:publish']);
  assert.match(Publish.description, /--preview is read-only/u);
  assert.match(Publish.description, /holds every key of the file is unchanged/u);
  assert.match(Publish.description, /draft: false/u);
  assert.doesNotMatch(Publish.description, /API65|allow-processing|never-run/u);
  assert.equal(Publish.flags['api-version'].default, undefined);
});

for (const pin of [undefined, 'auto'])
  test(`publish accepts default pin ${pin} as native68`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(h.calls.writes, 1);
  });
test('publish --async sends the PATCH once and returns started without the ACTIVE read', async () => {
  const h = await harness({ async: true });
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'processing', JSON.stringify(result));
  assert.equal(exit, undefined);
  assert.equal(h.calls.writes, 1);
  // Only the admission read; nothing is read after the PATCH.
  assert.equal(h.calls.reads, 1);
  assert.equal(h.calls.bodies[0].options.draft, false);
  assert.deepEqual(result.diagnostics.errors, []);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'publishing');
  assert.equal(item.mutation, 'acknowledged-processing');
  assert.equal(item.diagnostics[0].code, 'CI_PUBLISH_STARTED');
  assert.match(item.diagnostics[0].message, /--async/u);
});
test('publish --async leaves an ACTIVE insight with the file unchanged', async () => {
  const h = await harness({ async: true });
  h.active();
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(exit, undefined);
  assert.equal(h.calls.writes, 0);
  assert.equal(result.result.items[0].outcome, 'unchanged');
});
