import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { listNativeNames, listNativeMappingNames } from '../lib/services/select-native-retrieve.js';
import { createMappingInventoryReader } from '../lib/transport/mapping-rest.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { writeCalculatedInsightDocument } from '../lib/artifacts/write-calculated-insight.js';
import {
  readDeployInputs,
  captureDeployInputDigest,
  verifyCalculatedInsightInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import { operationApiVersion } from '../lib/transport/api-version.js';
import { retrieveCalculatedInsightSourceMetadata } from '../lib/transport/project-metadata.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

import { executeCalculatedInsightDeploy } from '../lib/services/execute-calculated-insight-deploy.js';
import { preflightCalculatedInsightDeploy } from '../lib/services/preflight-calculated-insight-deploy.js';

// eslint-disable-next-line unicorn/no-null -- Complete qualified wire settings preserve explicit nulls.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const candidate = (name = 'SyntheticInsight__cio') => ({
  schemaVersion: 1,
  kind: 'calculated-insight',
  identity: { dataSpace: 'default', apiName: name },
  spec: {
    displayName: 'Synthetic insight',
    expression: `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`,
    creationType: 'Custom',
    definitionType: 'CALCULATED_METRIC',
    definitionStatus: 'IN_USE',
    description: wireNull,
    isEnabled: true,
    subType: wireNull,
    publishScheduleInterval: 'SYSTEM_MANAGED',
    publishScheduleStartDateTime: wireNull,
    publishScheduleEndDate: wireNull,
    dimensions: [
      {
        apiName: 'app_id__c',
        creationType: 'Custom',
        dataType: 'Text',
        dateGranularity: wireNull,
        displayName: 'app_id',
        fieldRole: 'DIMENSION',
        formula: application,
      },
    ],
    measures: [
      {
        apiName: 'device_count__c',
        creationType: 'Custom',
        dataType: 'Number',
        displayName: 'device_count',
        fieldAggregationType: 'NONAGGREGATABLE',
        fieldRole: 'MEASURE',
        formula: `APPROX_COUNT_DISTINCT(${device})`,
      },
    ],
    dependencies: [
      {
        kind: 'dmo',
        dataSpace: 'default',
        apiName: table,
        fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'],
      },
    ],
  },
});
const xml = (document = candidate()) =>
  `<MktCalcInsightObjectDef xmlns="http://soap.sforce.com/2006/04/metadata"><creationType>Custom</creationType><expression>${document.spec.expression}</expression><masterLabel>${document.spec.displayName}</masterLabel></MktCalcInsightObjectDef>\n`;
const version = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
const root = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-command-'));
  await writeFile(path.join(cwd, '.owner'), randomUUID());
  return cwd;
};
const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};
const retrieve = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const flags = {
    metadata: ['calculated-insight:SyntheticInsight__cio'],
    'api-version': 'auto',
    dataspace: 'default',
    'target-org': 'synthetic',
    overwrite: false,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const connection = { getApiVersion: () => '68.0' };
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic',
    getConnection: (pin) => {
      assert.equal(pin, '68.0');
      return connection;
    },
  });
  return { command, calls };
};
for (const family of ['dlo', 'dmo', 'mapping'])
  for (const status of [429, 503])
    for (const retryAfter of ['31', 'private-invalid'])
      for (const json of [false, true])
        test(`native ${family} inventory HTTP${status} ${retryAfter} in ${json ? 'JSON' : 'human'} output`, async () => {
          const h = retrieve({ metadata: [family], 'api-version': '68.0' });
          const output = [];
          const requests = [];
          h.command.listNativeNames = listNativeNames;
          h.command.listNativeMappingNames = listNativeMappingNames;
          h.command.createMappingInventoryReader = createMappingInventoryReader;
          let writes = 0;
          h.command.jsonEnabled = () => json;
          h.command.log = (line) => output.push(line);
          const connection = Object.assign(Object.create(Connection.prototype), {
            instanceUrl: 'https://synthetic.my.salesforce.com',
            version: '68.0',
            accessToken: 'private-token',
            logger: { getRawLogger: () => ({ debug() {} }) },
            _propagators: [],
            _refreshDelegate: {
              isRefreshing: () => assert.fail('no refresh'),
              refresh: () => assert.fail('no refresh'),
            },
            _transport: {
              httpRequest(request, options) {
                requests.push(request);
                assert.equal(options.retry.maxRetries, 0);
                const inventory = family === 'mapping' && requests.length === 1;
                const pending = Promise.resolve({
                  statusCode: inventory ? 200 : status,
                  headers: {
                    'retry-after': retryAfter,
                    'content-type': 'application/json',
                    authorization: 'private-header',
                  },
                  body: JSON.stringify(
                    inventory
                      ? { dataModelObject: [{ name: 'Synthetic__dlm', dataSpaceName: 'default' }] }
                      : [{ errorCode: 'INTERNAL_ERROR', message: 'Bearer private-body <html>' }],
                  ),
                });
                pending.stream = () => new PassThrough();
                return pending;
              },
            },
          });
          h.command.resolveOrg = async () => ({
            getOrgId: () => 'synthetic',
            getConnection: (pin) => {
              assert.equal(pin, '68.0');
              return connection;
            },
          });
          for (const method of ['writeDlo', 'writeNativeDmo', 'writeNativeMapping'])
            h.command[method] = async () => {
              writes++;
              assert.fail('inventory failure must not write files');
            };
          const result = await run(h.command);
          assert.equal(result.status, 'blocked');
          assert.deepEqual(result.result.items, []);
          assert.equal(result.diagnostics.errors.length, 1);
          assert.equal(result.diagnostics.errors[0].code, 'NATIVE_INVENTORY_FAILED');
          assert.equal(result.diagnostics.errors[0].retryable, false);
          const message = json ? JSON.stringify(result) : output.join('\n');
          assert.match(
            message,
            status === 429 ? /429 Too Many Requests/u : /503.*POSSIBLE Connect rate limit/u,
          );
          if (retryAfter === '31') assert.match(message, /Server Retry-After: 31/u);
          else assert.doesNotMatch(message, /Server Retry-After/u);
          assert.doesNotMatch(
            JSON.stringify(result) + output.join('\n'),
            /private-|Bearer|<html>/u,
          );
          if (json) assert.deepEqual(output, []);
          else assert.equal(output.filter((line) => line.includes(`HTTP ${status}`)).length, 1);
          assert.equal(requests.length, family === 'mapping' ? 2 : 1);
          if (family === 'mapping') assert.match(requests[1].url, /data-model-object-mappings/u);
          assert.equal(writes, 0);
        });

const deploy = async (overrides = {}, names = ['SyntheticInsight__cio']) => {
  const cwd = await root();
  const receipts = [];
  for (const name of names)
    receipts.push(
      await writeCalculatedInsightDocument(candidate(name), xml(candidate(name)), cwd, false),
    );
  const inputs = await readDeployInputs({
    cwd,
    sourceDir: receipts.map(({ path: member }) => member),
  });
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const flags = {
    preview: true,
    'source-dir': receipts.map(({ path: member }) => member),
    'api-version': '68.0',
    dataspace: 'default',
    ...overrides,
  };
  const connection = { getApiVersion: () => '68.0' };
  flags['target-org'] = {
    getOrgId: () => 'synthetic',
    getUsername: () => 'synthetic@example.invalid',
    getConnection: (pin) => {
      assert.equal(pin, '68.0');
      return connection;
    },
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.captureInput = captureDeployInputDigest;
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  command.resolveInputs = async () => inputs;
  const context = {
    check: () => {},
    bind: async () => {
      calls.push('bind');
      return { stable: 'binding' };
    },
  };
  command.calculatedInsightContext = (receiver) => {
    assert.equal(receiver.getApiVersion(), '68.0');
    return context;
  };
  command.preflightCalculatedInsight = async (_, receiver, selected) => {
    assert.equal(receiver.getApiVersion(), '68.0');
    assert.deepEqual(selected, version);
    calls.push('preview');
    return {
      family: 'calculated-insight',
      outcome: 'update',
      target: 'present',
      absenceProof: 'none',
      route: { apiVersion: '68.0', method: 'PATCH', resource: 'calculated-insights' },
      requiredEffects: ['processing'],
      diagnostics: [],
    };
  };
  command.executeCalculatedInsight = async (document, receiver, selected, space, options) => {
    assert.equal(receiver.getApiVersion(), '68.0');
    assert.deepEqual(selected, version);
    assert.equal(space, 'default');
    await options.verifyInput();
    calls.push(`execute:${document.identity.apiName}`);
    await options.recordObservation({
      phase: 'baseline',
      status: 'ACTIVE',
      observations: { private: 'attribution' },
    });
    return {
      family: 'calculated-insight',
      route: { apiVersion: '68.0', method: 'PATCH', resource: 'calculated-insights' },
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
    };
  };
  return { command, calls, inputs, flags, cwd, context };
};

/**
 * Route neutral paired inputs through the real guarded native services.
 * @param {object} flags Explicit command intent.
 * @param {string} initial Initial exact target state.
 * @param {string[]} names Selected neutral members.
 * @returns {Promise<object>} Command fixture with independent reader/writer journal.
 */
async function nativeDeploy(flags = {}, initial = 'absent', names = ['SyntheticInsight__cio']) {
  const h = await deploy({ 'api-version': '68.0', ...flags }, names);
  for (const input of h.inputs) {
    const document = structuredClone(input.document);
    document.spec.publishScheduleInterval = 'NOT_SCHEDULED';
    await writeFile(input.companionPath, `${JSON.stringify(document)}\n`);
  }
  const inputs = await readDeployInputs({ cwd: h.cwd, sourceDir: h.flags['source-dir'] });
  h.command.resolveInputs = async () => inputs;
  const states = new Map(names.map((name) => [name, initial]));
  const expressions = new Map(names.map((name) => [name, candidate(name).spec.expression]));
  const receiver = { getApiVersion: () => '68.0' };
  h.flags['target-org'].getConnection = (pin) => {
    assert.equal(pin, '68.0');
    return receiver;
  };
  const context = {
    check: () => assert.equal(receiver.getApiVersion(), '68.0'),
    async get(name) {
      h.calls.push(`GET:${name}`);
      if (states.get(name) === 'absent')
        throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      const document = structuredClone(
        inputs.find((input) => input.document.identity.apiName === name).document,
      );
      return {
        ...document.spec,
        apiName: name,
        dataSpace: 'default',
        expression: expressions.get(name),
        calculatedInsightStatus: states.get(name),
        dimensions:
          states.get(name) === 'DRAFT'
            ? []
            : document.spec.dimensions.map((field) => ({ ...field, dataSource: wireNull })),
        measures:
          states.get(name) === 'DRAFT'
            ? []
            : document.spec.measures.map((field) => ({ ...field, dataSource: wireNull })),
        dependencies: undefined,
        lastCalcInsightStatusDateTime: '2026-11-01T00:00:00.000Z',
        lastCalcInsightStatusErrorCode: wireNull,
        lastRunDateTime: wireNull,
        lastRunStatus: wireNull,
        lastRunStatusDateTime: wireNull,
        lastRunStatusErrorCode: wireNull,
        historyPublishScheduleInterval: wireNull,
        historyPublishScheduleTimeZone: wireNull,
        historyPublishTime: wireNull,
        publishScheduleTimeZone: wireNull,
        sourceCiDevName: wireNull,
        sourceCiId: wireNull,
        sourceCiName: wireNull,
        isFromPackage: false,
        queryDialect: 'ANSI_SQL',
      };
    },
    async metadata(name) {
      return states.get(name) === 'absent'
        ? [{}]
        : [
            {
              fullName: name.slice(0, -5),
              creationType: 'Custom',
              expression: expressions.get(name),
              masterLabel: 'Synthetic insight',
            },
          ];
    },
    async bind() {
      h.calls.push('bind65');
      return { stable: 'binding' };
    },
  };
  // Dependencies are semantic input, not a runtime property.
  const get = context.get;
  context.get = async (name) => {
    const value = await get(name);
    delete value.dependencies;
    return value;
  };
  h.command.calculatedInsightContext = () => context;
  h.command.preflightCalculatedInsight = preflightCalculatedInsightDeploy;
  h.command.executeCalculatedInsight = (document, connection, selection, space, options) =>
    executeCalculatedInsightDeploy(document, connection, selection, space, {
      ...options,
      delay: async () => {},
      nativeClient: {
        async create(value) {
          h.calls.push('POST');
          states.set(value.identity.apiName, 'DRAFT');
          expressions.set(value.identity.apiName, value.spec.expression);
        },
        async update(value, intent) {
          h.calls.push(intent?.draft ? 'PATCH:draft' : 'PATCH:active');
          expressions.set(value.identity.apiName, value.spec.expression);
        },
      },
    });
  return { ...h, inputs, context, states, expressions };
}
for (const phase of ['binding', 'fresh', 'execution'])
  for (const status of [429, 503])
    test(`CI deploy ${phase} catch retains HTTP${status} diagnostic`, async () => {
      const h = await nativeDeploy({ draft: true, preview: false, 'allow-processing': true });
      // eslint-disable-next-line unicorn/consistent-function-scoping -- Bind this regression's exact status evidence.
      const failure = () => {
        throw retainConnectDiagnostic(new Error('private-secret'), connectDiagnostic(status));
      };
      if (phase === 'binding') h.context.bind = async () => failure();
      if (phase === 'fresh') {
        const preview = h.command.preflightCalculatedInsight;
        let calls = 0;
        h.command.preflightCalculatedInsight = async (...arguments_) =>
          ++calls > 1 ? failure() : preview(...arguments_);
      }
      if (phase === 'execution') h.command.executeCalculatedInsight = async () => failure();
      const result = await run(h.command);
      const diagnostics = [
        ...result.diagnostics.errors,
        ...result.result.items.flatMap((item) => [
          ...item.diagnostics,
          ...(item.preflight?.diagnostics ?? []),
        ]),
      ];
      assert.ok(
        diagnostics.some(({ message }) =>
          status === 429
            ? message.includes('429 Too Many Requests')
            : message.includes('POSSIBLE Connect rate limit'),
        ),
        JSON.stringify(result),
      );
      assert.equal(JSON.stringify(result).includes('private-secret'), false);
      assert.ok(!h.calls.some((call) => call.startsWith('POST:')));
    });

for (const pin of ['68.0', 'auto'])
  test(`native68 paired draft creation at ${pin} previews POST and executes once without publication`, async () => {
    const h = await nativeDeploy({
      draft: true,
      preview: false,
      'allow-processing': true,
      'api-version': pin,
    });
    const result = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(result.result.items[0].outcome, 'created');
    assert.equal(result.result.items[0].route.method, 'POST');
    assert.equal(h.calls.filter((call) => call === 'POST').length, 1);
    assert.equal(h.states.get('SyntheticInsight__cio'), 'DRAFT');
    assert.ok(
      result.result.items[0].routes.some(
        (route) => route.apiVersion === '65.0' && route.operation === 'dependency.get',
      ),
    );
  });
test('native68 absent target requires draft; create requires processing acknowledgement', async () => {
  for (const flags of [{}, { draft: true }]) {
    const h = await nativeDeploy({ preview: false, ...flags });
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.ok(!h.calls.includes('POST'));
  }
});
test('native68 create preview is read-only with honest native68 POST and fixed65 routes', async () => {
  const h = await nativeDeploy({ draft: true });
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'create');
  assert.deepEqual(result.result.items[0].route, {
    apiVersion: '68.0',
    method: 'POST',
    resource: 'calculated-insights',
  });
  assert.ok(!h.calls.includes('POST'));
});
for (const state of ['DRAFT', 'ACTIVE']) {
  test(`native68 ${state} qualified edit preserves state and repeat is GET-only without acknowledgement`, async () => {
    const h = await nativeDeploy(
      { draft: state === 'DRAFT', preview: false, 'allow-processing': true },
      state,
    );
    h.expressions.set(
      'SyntheticInsight__cio',
      candidate().spec.expression.replace('WHERE 1 = 0', `WHERE 1 = 0 AND ${device} IS NOT NULL`),
    );
    const result = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(result.result.items[0].outcome, 'updated');
    assert.equal(h.states.get('SyntheticInsight__cio'), state);
    assert.deepEqual(
      h.calls.filter((call) => call.startsWith('PATCH')),
      [state === 'DRAFT' ? 'PATCH:draft' : 'PATCH:active'],
    );
    h.flags['allow-processing'] = false;
    h.calls.length = 0;
    const repeat = await run(h.command);
    assert.equal(repeat.status, 'success');
    assert.equal(repeat.result.items[0].outcome, 'unchanged');
    assert.ok(h.calls.every((call) => call.startsWith('GET:') || call === 'bind65'));
  });
}
test('native68 draft never converts ACTIVE and unknown mutation stops later selected create', async () => {
  const active = await nativeDeploy(
    { draft: true, preview: false, 'allow-processing': true },
    'ACTIVE',
  );
  const activeResult = await run(active.command);
  assert.equal(activeResult.status, 'blocked');
  const h = await nativeDeploy(
    { draft: true, preview: false, 'allow-processing': true },
    'absent',
    ['First__cio', 'Second__cio'],
  );
  h.command.executeCalculatedInsight = async () => {
    h.calls.push('unknown');
    return { outcome: 'failed', mutation: 'unknown', diagnostics: [] };
  };
  const result = await run(h.command);
  assert.equal(result.status, 'failed');
  assert.equal(h.calls.filter((call) => call === 'unknown').length, 1);
  assert.equal(result.result.items[1].mutation, 'not-attempted');
});
for (const flags of [{ 'api-version': '65.0' }, { dataspace: 'other' }]) {
  test(`draft rejects unsupported scope before auth ${JSON.stringify(flags)}`, async () => {
    const h = await deploy({ draft: true, ...flags });
    h.flags['target-org'].getOrgId = () => assert.fail('auth');
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
  });
}
test('native68 pending binding or paired-byte drift blocks every dispatch', async () => {
  for (const drift of ['binding', 'pair', 'receiver']) {
    const h = await nativeDeploy(
      { draft: true, preview: false, 'allow-processing': true },
      'absent',
      ['First__cio', 'Second__cio'],
    );
    let bindings = 0;
    if (drift === 'binding') h.context.bind = async () => ({ changed: ++bindings });
    else {
      const preflight = h.command.preflightCalculatedInsight;
      h.command.preflightCalculatedInsight = async (...arguments_) => {
        const result = await preflight(...arguments_);
        if (drift === 'pair')
          await writeFile(h.inputs[1].path, `${await readFile(h.inputs[1].path, 'utf8')}\n`);
        else
          h.context.check = () => {
            throw new Error('private receiver drift');
          };
        return result;
      };
    }
    const result = await run(h.command);
    assert.notEqual(result.status, 'success');
    assert.ok(!h.calls.includes('POST'));
    assert.ok(!JSON.stringify(result).includes('private receiver drift'));
  }
});
test('native68 Git paired selection preserves captured admission and draft intent', async () => {
  const h = await nativeDeploy({ draft: true });
  delete h.flags['source-dir'];
  h.flags['changed-since'] = 'main';
  h.command.selectGitInputs = async () => ({
    paths: h.inputs.map((input) => input.path),
    capturedInputs: h.inputs,
    calculatedInsights: h.inputs,
    segments: [],
    identityResolutions: [],
    provenance: {},
  });
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'create');
});
test('draft beside an unrelated family rejects before authentication', async () => {
  for (const draft of [true]) {
    const h = await deploy({ 'api-version': '68.0', draft });
    h.command.resolveInputs = async () => [
      ...h.inputs,
      {
        path: 'Synthetic.native-dataGraph.json',
        document: {
          schemaVersion: 1,
          kind: 'native-data-graph',
          apiVersion: '68.0',
          definition: {},
        },
      },
    ];
    h.flags['target-org'].getOrgId = () => assert.fail('auth');
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
  }
});
test('deploy help documents explicit draft retention and read-only equality', () => {
  assert.ok(Deploy.flags.draft);
  assert.match(Deploy.description, /--draft creates or edits DRAFT without publication/u);
  assert.match(Deploy.description, /identical deploy is read-only/u);
});

test('public CI preview uses paired input binding and never executor/private evidence output', async () => {
  const { command, calls } = await deploy();
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'update');
  assert.deepEqual(result.result.items[0].requiredEffects, ['processing']);
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
  assert.ok(!JSON.stringify(result).includes('attribution'));
});
test('CI effects acknowledgement blocks whole batch before dispatch', async () => {
  const { command, calls } = await deploy({ preview: false });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
});
test('CI command dispatches guarded executor and retains detached private observations', async () => {
  const { command, calls, inputs } = await deploy({
    preview: false,
    'allow-processing': true,
    'api-version': 'auto',
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].mutation, 'confirmed-updated');
  assert.equal(calls.filter((call) => call.startsWith('execute:')).length, 1);
  assert.equal(command.calculatedInsightObservations.get(inputs[0].path).length, 1);
  assert.ok(!JSON.stringify(result).includes('attribution'));
});
test('unchanged CI remains executable without processing acknowledgement', async () => {
  const { command } = await deploy({ preview: false });
  command.preflightCalculatedInsight = async () => ({
    outcome: 'unchanged',
    target: 'present',
    absenceProof: 'none',
    requiredEffects: [],
    diagnostics: [],
  });
  command.executeCalculatedInsight = async (_, __, ___, ____, options) => {
    assert.equal(options.allowProcessing, false);
    await options.verifyInput();
    return {
      family: 'calculated-insight',
      outcome: 'unchanged',
      mutation: 'not-attempted',
      diagnostics: [],
    };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'unchanged');
});
test('CI unknown mutation stops later selected CI without replay', async () => {
  const { command, calls } = await deploy({ preview: false, 'allow-processing': true }, [
    'First__cio',
    'Second__cio',
  ]);
  command.executeCalculatedInsight = async () => {
    calls.push('unknown-write');
    return { outcome: 'failed', mutation: 'unknown', diagnostics: [] };
  };
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(calls.filter((call) => call === 'unknown-write').length, 1);
  assert.equal(result.result.items[1].mutation, 'not-attempted');
});
test('CI pair byte drift during preview blocks before dispatch', async () => {
  const { command, inputs, calls } = await deploy({ preview: false, 'allow-processing': true });
  const preflight = command.preflightCalculatedInsight;
  command.preflightCalculatedInsight = async (...arguments_) => {
    const result = await preflight(...arguments_);
    await writeFile(inputs[0].path, `${await readFile(inputs[0].path, 'utf8')}\n`);
    return result;
  };
  const result = await run(command);
  assert.notEqual(result.status, 'success');
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
});
test('CI binding drift blocks before executor', async () => {
  const { command, calls, context } = await deploy({ preview: false, 'allow-processing': true });
  let count = 0;
  context.bind = async () => ({ changed: ++count });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
});
test('CI captured Git admission mismatch blocks before org access', async () => {
  const { command, inputs, flags } = await deploy({ 'changed-since': 'main' });
  delete flags['source-dir'];
  command.selectGitInputs = async () => ({
    paths: [inputs[0].path],
    calculatedInsights: [{ ...inputs[0], inputDigest: 'changed' }],
    segments: [],
    identityResolutions: [],
    provenance: {},
  });
  flags['target-org'].getOrgId = () => assert.fail('org before Git binding');
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'INVALID_GIT_SELECTION');
});
test('CI captured Git selection proceeds through public preview with unchanged admitted bytes', async () => {
  const { command, inputs, flags } = await deploy({ 'changed-since': 'main' });
  delete flags['source-dir'];
  command.selectGitInputs = async () => ({
    paths: [inputs[0].path],
    capturedInputs: inputs,
    calculatedInsights: inputs,
    segments: [],
    identityResolutions: [],
    provenance: {},
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
});
test('mixed CI/DMO ordering checks later CI binding before the earlier prerequisite dispatch', async () => {
  const { command, calls, inputs, context } = await deploy({
    preview: false,
    'allow-processing': true,
  });
  const dmo = {
    path: 'synthetic.dmo-meta.json',
    document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: table } },
  };
  command.resolveInputs = async () => [inputs[0], dmo];
  const capture = command.captureInput;
  command.captureInput = async (input) =>
    input.document.kind === 'dmo' ? 'stable' : capture(input);
  command.createDmoClient = () => ({});
  command.preflightNativeDmo = async () => ({
    family: 'dmo',
    outcome: 'unchanged',
    target: 'existing',
    absenceProof: 'none',
    diagnostics: [],
  });
  command.executeNativeDmo = async () => {
    calls.push('execute:dmo');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  let bindings = 0;
  context.bind = async () => ({ fingerprint: ++bindings });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].identity.apiName, table);
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
});
test('CI dependency node keeps actual DMO prerequisite and fixed version rejects upgrades', () => {
  assert.deepEqual(documentDependencyNode(candidate()).dependencies, [
    { kind: 'dmo', dataSpace: 'default', apiName: table },
  ]);
  assert.equal(operationApiVersion('auto', 'calculated-insight'), '68.0');
  assert.throws(() => operationApiVersion('65.0', 'calculated-insight'));
  assert.throws(() => operationApiVersion('67.0', 'calculated-insight'));
  assert.throws(() => operationApiVersion('latest', 'calculated-insight'));
});
test('CI standard source retrieve maps suffix and validates exact terminal member', async () => {
  const output = await retrieveCalculatedInsightSourceMetadata(
    'synthetic',
    'SyntheticInsight__cio',
    async (arguments_, cwd) => {
      assert.equal(arguments_[4], 'MktCalcInsightObjectDef:SyntheticInsight');
      assert.equal(path.dirname(cwd), os.tmpdir());
      const directory = path.join(cwd, 'force-app', 'main', 'default', 'mktCalcInsightObjectDefs');
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'SyntheticInsight.mktCalcInsightObjectDef-meta.xml'),
        xml(),
      );
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 0,
          result: {
            done: true,
            success: true,
            status: 'Succeeded',
            files: [
              { type: 'MktCalcInsightObjectDef', fullName: 'SyntheticInsight', state: 'Created' },
            ],
          },
        }),
      };
    },
  );
  assert.equal(output, xml());
  for (const fullName of ['SyntheticInsight__cio', 'Different'])
    await assert.rejects(
      retrieveCalculatedInsightSourceMetadata('synthetic', 'SyntheticInsight__cio', async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          status: 0,
          result: {
            done: true,
            success: true,
            status: 'Succeeded',
            files: [{ type: 'MktCalcInsightObjectDef', fullName, state: 'Created' }],
          },
        }),
      })),
    );
});

test('CI deploy receiver keeps the core version getter so the context can repin Metadata to 65', async () => {
  const h = await deploy({ 'api-version': 'auto' });
  const core = {
    version: '68.0',
    getApiVersion() {
      return this.version;
    },
  };
  h.flags['target-org'].getConnection = (pin) => {
    assert.equal(pin, '68.0');
    return core;
  };
  const pins = [];
  const context = h.command.calculatedInsightContext;
  h.command.calculatedInsightContext = (receiver, space) => {
    const metadata = Object.create(receiver);
    Object.defineProperty(metadata, 'version', { value: '65.0' });
    pins.push(receiver.getApiVersion(), metadata.getApiVersion());
    return context(receiver, space);
  };
  const result = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(pins, ['68.0', '65.0']);
});
