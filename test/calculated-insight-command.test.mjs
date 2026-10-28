import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { irFixture } from './identity-resolution-fixtures.mjs';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { writeCalculatedInsightDocument } from '../lib/artifacts/write-calculated-insight.js';
import {
  readDeployInputs,
  captureDeployInputDigest,
  verifyCalculatedInsightInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import { operationApiVersion } from '../lib/transport/api-version.js';
import { retrieveCalculatedInsightSourceMetadata } from '../lib/transport/project-metadata.js';

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
const version = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' };
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
    'api-version': '65.0',
    'data-space': 'default',
    'target-org': 'synthetic',
    overwrite: false,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const connection = { getApiVersion: () => '65.0' };
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic',
    getConnection: (pin) => {
      assert.equal(pin, '65.0');
      return connection;
    },
  });
  command.acquireCalculatedInsight = async (_, name, selected) => {
    assert.deepEqual(selected, version);
    calls.push(`acquire:${name}`);
    return { identity: candidate(name).identity, candidate: candidate(name), blockers: [] };
  };
  command.bindCalculatedInsight = async () => {
    calls.push('bind');
    return {};
  };
  command.acquireCalculatedInsightXml = async (target, name) => {
    assert.equal(target, 'synthetic');
    calls.push(`xml:${name}`);
    return xml(candidate(name));
  };
  command.writeCalculatedInsight = async (document, definition) => {
    assert.equal(definition, xml(document));
    calls.push(`write:${document.identity.apiName}`);
    return { path: 'ci.xml', companionPath: 'ci.json', outcome: 'retrieved' };
  };
  return { command, calls };
};
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
    'api-version': '65.0',
    'data-space': 'default',
    ...overrides,
  };
  const connection = { getApiVersion: () => '65.0' };
  flags['target-org'] = {
    getOrgId: () => 'synthetic',
    getConnection: (pin) => {
      assert.equal(pin, '65.0');
      return connection;
    },
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.captureInput = captureDeployInputDigest;
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  command.resolveInputs = async () => inputs;
  command.bindCalculatedInsight = async () => {
    calls.push('bind');
    return { stable: 'binding' };
  };
  command.preflightCalculatedInsight = async (_, receiver, selected) => {
    assert.equal(receiver, connection);
    assert.deepEqual(selected, version);
    calls.push('preview');
    return {
      family: 'calculated-insight',
      outcome: 'update',
      target: 'present',
      absenceProof: 'none',
      route: { apiVersion: '65.0', method: 'PATCH', resource: 'calculated-insights' },
      requiredEffects: ['processing'],
      diagnostics: [],
    };
  };
  command.executeCalculatedInsight = async (document, receiver, selected, space, options) => {
    assert.equal(receiver, connection);
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
      route: { apiVersion: '65.0', method: 'PATCH', resource: 'calculated-insights' },
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
    };
  };
  return { command, calls, inputs, flags, cwd };
};

test('public CI exact multiple retrieve admits all independent pairs before output', async () => {
  const { command, calls } = retrieve({
    metadata: [
      'calculated-insight:Second__cio',
      'calculated-insight:SyntheticInsight__cio',
      'calculated-insight:Second__cio',
    ],
    'api-version': 'auto',
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items.length, 2);
  assert.deepEqual(result.result.selection, [
    'calculated-insight:Second__cio',
    'calculated-insight:SyntheticInsight__cio',
  ]);
  assert.ok(calls.indexOf('xml:SyntheticInsight__cio') < calls.indexOf('write:Second__cio'));
  assert.ok(
    result.result.items.every(
      (item) =>
        item.family === 'calculated-insight' &&
        item.routes.every((route) => route.apiVersion === '65.0'),
    ),
  );
});
test('later CI pair mismatch prevents ALL mixed selected outputs', async () => {
  const { command, calls } = retrieve({
    metadata: ['dmo:Example__dlm', 'calculated-insight:SyntheticInsight__cio'],
  });
  command.selectDocuments = async () => ['Example__dlm'];
  command.selectDependencies = async () => ({
    entries: [
      { document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'Example__dlm' } } },
    ],
    reasons: new Map(),
  });
  command.writeDocument = async () => assert.fail('DMO publication before CI admission');
  command.acquireCalculatedInsightXml = async () => xml().replace('Synthetic insight', 'different');
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items.length, 0);
  assert.ok(!calls.some((call) => call.startsWith('write:')));
});
for (const overrides of [
  { 'api-version': '67.0' },
  { 'api-version': 'latest' },
  { 'data-space': 'other' },
  { 'include-dependencies': true },
  { metadata: ['calculated-insight'] },
  { metadata: ['calculated-insight:Invalid'] },
]) {
  test(`CI retrieve refuses unsupported scope before auth ${JSON.stringify(overrides)}`, async () => {
    const { command } = retrieve(overrides);
    command.resolveOrg = async () => assert.fail('auth');
    const result = await run(command);
    assert.equal(result.status, 'blocked');
  });
}
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
  const { command, calls } = await deploy({ preview: false, 'allow-processing': true });
  let count = 0;
  command.bindCalculatedInsight = async () => ({ changed: ++count });
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
    calculatedInsights: inputs,
    segments: [],
    identityResolutions: [],
    provenance: {},
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
});
test('mixed CI/DMO ordering checks later CI binding before the earlier prerequisite dispatch', async () => {
  const { command, calls, inputs } = await deploy({ preview: false, 'allow-processing': true });
  const dmo = {
    path: 'synthetic-dmo.json',
    document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: table } },
  };
  command.resolveInputs = async () => [inputs[0], dmo];
  const capture = command.captureInput;
  command.captureInput = async (input) =>
    input.document.kind === 'dmo' ? 'stable' : capture(input);
  command.preflight = async () => ({
    outcome: 'unchanged',
    target: 'present',
    absenceProof: 'none',
    diagnostics: [],
  });
  command.execute = async () => {
    calls.push('execute:dmo');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  let bindings = 0;
  command.bindCalculatedInsight = async () => ({ fingerprint: ++bindings });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].identity.apiName, table);
  assert.ok(!calls.some((call) => call.startsWith('execute:')));
});
test('mixed CI and IR retrieve acquires CI at API65 before IR shared receiver repin', async () => {
  const { facade, native } = irFixture();
  const ir = projectIdentityResolution(facade, native, facade.objectApiName).candidate;
  const { command, calls } = retrieve({
    metadata: [
      'identity-resolution:' + facade.objectApiName,
      'calculated-insight:SyntheticInsight__cio',
    ],
    'api-version': 'auto',
  });
  let pin;
  const connection = { getApiVersion: () => pin };
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic',
    getConnection: (version) => {
      pin = version;
      return connection;
    },
  });
  command.acquireCalculatedInsight = async (receiver) => {
    assert.equal(receiver.getApiVersion(), '65.0');
    calls.push('ci65');
    return { identity: candidate().identity, candidate: candidate(), blockers: [] };
  };
  command.acquireIdentityResolution = async (receiver) => {
    assert.equal(receiver.getApiVersion(), '67.0');
    calls.push('ir67');
    return { identity: ir.identity, candidate: ir, blockers: [] };
  };
  command.writeIdentityResolution = async () => ({ path: 'ir.json', outcome: 'retrieved' });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(calls.indexOf('ci65') < calls.indexOf('ir67'));
});
test('CI dependency node keeps actual DMO prerequisite and fixed version rejects upgrades', () => {
  assert.deepEqual(documentDependencyNode(candidate()).dependencies, [
    { kind: 'dmo', dataSpace: 'default', apiName: table },
  ]);
  assert.equal(operationApiVersion('auto', 'calculated-insight'), '65.0');
  assert.equal(operationApiVersion('65.0', 'calculated-insight'), '65.0');
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
