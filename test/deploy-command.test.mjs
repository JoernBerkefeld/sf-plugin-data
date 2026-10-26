import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { preflightDmoDeploy } from '../lib/services/preflight-dmo-deploy.js';
import { DeployInputError } from '../lib/artifacts/read-deploy-input.js';

const input = (name = 'Preview__dlm') => ({
  path: `${name}.json`,
  document: { identity: { dataSpace: 'default', apiName: name } },
});
const invocation = (overrides = {}) => {
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const connection = {};
  const flags = {
    preview: true,
    'source-dir': ['authored.json'],
    'api-version': '65.0',
    'data-space': 'default',
    'target-org': {
      getOrgId: () => {
        calls.push('org');
        return 'synthetic-target';
      },
      getConnection: (version) => {
        calls.push('connection');
        assert.equal(version, flags['api-version']);
        return connection;
      },
    },
    ...overrides,
  };
  command.config = { pjson: { version: '2.151.7' } };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = async (options) => {
    calls.push('inputs');
    assert.deepEqual(options, {
      cwd: process.cwd(),
      sourceDir: flags['source-dir'],
      metadata: flags.metadata,
    });
    return [input()];
  };
  command.preflight = async (...arguments_) => {
    calls.push('preflight');
    assert.deepEqual(arguments_, [
      input().document,
      connection,
      flags['api-version'],
      flags['data-space'],
      true,
    ]);
    return {
      outcome: 'create',
      target: 'absent',
      absenceProof: 'complete-inventory',
      diagnostics: [],
    };
  };
  command.execute = async () => {
    calls.push('execute');
    assert.equal(flags.preview, false, 'preview must never invoke the executor');
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  return { command, calls };
};
const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return { result: await command.run(), exitCode: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};

test('preview resolves local input before org inspection and returns advisory versioned envelope', async () => {
  const { command, calls } = invocation();
  const { result, exitCode } = await run(command);
  assert.deepEqual(calls, ['inputs', 'org', 'connection', 'preflight']);
  assert.equal(exitCode, undefined);
  assert.equal(result.contract, 'sf-data360-deploy');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.status, 'success');
  assert.equal(result.metadata.preview, true);
  assert.equal(result.metadata.operation, 'deploy');
  assert.deepEqual(result.metadata.plugin, {
    name: 'sf-plugin-data360',
    version: '0.1.0',
  });
  assert.equal(result.provenance.pluginVersion, '0.1.0');
  assert.equal(result.provenance.targetOrgId, 'synthetic-target');
  assert.ok(Number.isFinite(Date.parse(result.provenance.generatedAt)));
  assert.equal(result.result.items[0].operation, 'preview');
  assert.equal(result.result.items[0].outcome, 'create');
  assert.equal(result.result.items[0].absenceProof, 'complete-inventory');
  assert.ok(!JSON.stringify(result).includes('deployed'));
});

test('nonpreview runs executor after selection preflight and returns mutation envelope', async () => {
  const { command, calls } = invocation({ preview: false });
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.metadata.preview, false);
  assert.equal(exitCode, undefined);
  assert.deepEqual(calls, ['inputs', 'org', 'connection', 'preflight', 'execute']);
  assert.equal(result.result.items[0].operation, 'execute');
  assert.equal(result.result.items[0].outcome, 'created');
  assert.equal(result.result.items[0].mutation, 'confirmed-created');
});

const previewResult = (outcome = 'create') => ({
  outcome,
  target: outcome === 'create' ? 'absent' : 'present',
  absenceProof: outcome === 'create' ? 'complete-inventory' : 'none',
  diagnostics: [],
});
const batchInvocation = () => {
  const setup = invocation({ preview: false });
  setup.command.resolveInputs = async () => [input('A__dlm'), input('B__dlm'), input('C__dlm')];
  setup.command.preflight = async () => {
    setup.calls.push('preflight');
    return previewResult();
  };
  return setup;
};

test('whole selection preflight finishes before execution; unchanged stays no-op', async () => {
  const { command, calls } = batchInvocation();
  command.execute = async (...arguments_) => {
    calls.push('execute');
    assert.equal(calls.filter((call) => call === 'preflight').length, 3);
    assert.equal(arguments_[2], '65.0');
    assert.equal(arguments_[3], 'default');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  assert.ok(
    result.result.items.every(
      (item) => item.outcome === 'unchanged' && item.mutation === 'not-attempted',
    ),
  );
});

test('known later blocker or preflight error prevents all execution', async () => {
  for (const failure of ['blocked', 'blocked-changes', 'throw']) {
    const { command, calls } = batchInvocation();
    let count = 0;
    command.preflight = async () => {
      if (++count !== 2) return previewResult();
      if (failure === 'throw') throw new Error('private-response');
      return previewResult(failure);
    };
    const { result, exitCode } = await run(command);
    assert.equal(count, 3);
    assert.equal(result.status, failure === 'throw' ? 'failed' : 'blocked');
    assert.equal(exitCode, 1);
    assert.ok(!calls.includes('execute'));
    assert.ok(
      result.result.items.every(
        (item) => item.outcome === 'not-attempted' && item.mutation === 'not-attempted',
      ),
    );
    assert.equal(
      result.result.items[1].preflight.outcome,
      failure === 'throw' ? 'blocked' : failure,
    );
    assert.ok(!JSON.stringify(result).includes('private-response'));
  }
});

test('real batch preflight blocks later unsupported schemas before any earlier writes', async () => {
  for (const variant of ['Profile', 'Engagement', 'Number', 'dynamic']) {
    const { command, calls } = invocation({ preview: false });
    // eslint-disable-next-line unicorn/consistent-function-scoping -- Fixture is local to this admission regression.
    const document = (name) => ({
      schemaVersion: 1,
      kind: 'dmo',
      identity: { dataSpace: 'default', apiName: name },
      spec: {
        label: 'Synthetic',
        category: 'Other',
        fields: [
          {
            name: 'Key__c',
            label: 'Key',
            dataType: 'Text',
            isPrimaryKey: true,
            isDynamicLookup: false,
          },
          {
            name: 'Event__c',
            label: 'Event',
            dataType: 'DateTime',
            isPrimaryKey: false,
            isDynamicLookup: false,
          },
        ],
      },
    });
    const first = document('First__dlm');
    const later = document('Later__dlm');
    if (variant === 'Profile' || variant === 'Engagement') {
      later.spec.category = variant;
      if (variant === 'Engagement') later.spec.eventDateTimeFieldName = 'Event__c';
    } else if (variant === 'Number') later.spec.fields[0].dataType = variant;
    else later.spec.fields[0].isDynamicLookup = true;
    command.resolveInputs = async () =>
      [first, later].map((value) => ({ path: 'synthetic.json', document: value }));
    let reads = 0;
    const connection = {
      instanceUrl: 'https://synthetic.example',
      getApiVersion: () => '65.0',
      request: async (request) => {
        assert.equal(request.method, 'GET');
        reads++;
        return { dataModelObject: [] };
      },
    };
    command.preflight = (value, _connection, api, space) =>
      preflightDmoDeploy(value, connection, api, space);
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.equal(reads, 1);
    assert.equal(
      result.result.items[1].preflight.diagnostics[0].code,
      'SOURCE_EXECUTION_UNSUPPORTED',
    );
    assert.ok(!calls.includes('execute'));
    assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  }
});

test('sequential execution retains prior creation, stops and distinguishes remaining unattempted', async () => {
  for (const stop of ['blocked', 'failed', 'unknown', 'throw']) {
    const { command } = batchInvocation();
    let count = 0;
    command.execute = async () => {
      if (++count === 1)
        return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
      if (stop === 'throw') throw new Error('token-and-remote-payload');
      return {
        outcome: stop === 'blocked' ? 'blocked' : 'failed',
        mutation: stop === 'unknown' ? 'unknown' : 'not-attempted',
        diagnostics: [],
      };
    };
    const { result, exitCode } = await run(command);
    assert.equal(count, 2);
    assert.equal(result.status, stop === 'blocked' ? 'blocked' : 'failed');
    assert.equal(exitCode, 1);
    assert.equal(result.result.items[0].mutation, 'confirmed-created');
    assert.equal(result.result.items[0].outcome, 'created');
    assert.equal(
      result.result.items[1].mutation,
      ['unknown', 'throw'].includes(stop) ? 'unknown' : 'not-attempted',
    );
    assert.equal(result.result.items[2].outcome, 'not-attempted');
    assert.equal(result.result.items[2].mutation, 'not-attempted');
    assert.ok(!JSON.stringify(result).includes('token-and-remote-payload'));
  }
});

test('label update preview and execution retain update, noop and unknown evidence', async () => {
  const { executeDmoDeploy } = await import('../lib/services/execute-dmo-deploy.js');
  assert.equal(new Deploy([], {}).execute, executeDmoDeploy);
  const preview = invocation();
  preview.command.preflight = async (...arguments_) => {
    assert.equal(arguments_[4], true);
    return previewResult('update');
  };
  const advisory = await run(preview.command);
  assert.equal(advisory.result.result.items[0].outcome, 'update');
  assert.ok(!preview.calls.includes('execute'));
  for (const unknown of [false, true]) {
    const { command } = batchInvocation();
    command.preflight = async () => previewResult('update');
    let executions = 0;
    command.execute = async () => {
      executions++;
      return executions === 1
        ? { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] }
        : unknown
          ? { outcome: 'failed', mutation: 'unknown', diagnostics: [] }
          : { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, unknown ? 'failed' : 'success');
    assert.equal(exitCode, unknown ? 1 : undefined);
    assert.equal(result.result.items[0].outcome, 'updated');
    assert.equal(result.result.items[0].mutation, 'confirmed-updated');
    assert.equal(executions, unknown ? 2 : 3);
    assert.equal(result.result.items[2].outcome, unknown ? 'not-attempted' : 'unchanged');
    if (unknown) {
      assert.match(result.diagnostics.errors[0].message, /Mutation may have occurred/u);
      assert.doesNotMatch(result.diagnostics.errors[0].message, /Creation may/u);
    }
  }
});

test('supported label update plus mixed unsupported tail blocks whole selection without writes', async () => {
  const { command, calls } = batchInvocation();
  let admissions = 0;
  command.preflight = async (...arguments_) => {
    assert.equal(arguments_[4], true);
    return previewResult(++admissions === 2 ? 'blocked-changes' : 'update');
  };
  const { result, exitCode } = await run(command);
  assert.equal(admissions, 3);
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.ok(!calls.includes('execute'));
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  assert.equal(result.result.items[0].preflight.outcome, 'update');
  assert.equal(result.result.items[1].preflight.outcome, 'blocked-changes');
});

test('human execution output reports unknown mutation and never aggregate success', async () => {
  const { command } = batchInvocation();
  const logs = [];
  command.jsonEnabled = () => false;
  command.log = (message) => logs.push(message);
  command.execute = async () => ({ outcome: 'failed', mutation: 'unknown', diagnostics: [] });
  const { exitCode } = await run(command);
  assert.equal(exitCode, 1);
  assert.match(logs.join('\n'), /Deploy execution: failed/u);
  assert.match(logs.join('\n'), /Mutation may have occurred/u);
  assert.match(logs.join('\n'), /Execution: not-attempted; mutation: not-attempted/u);
  assert.doesNotMatch(logs.join('\n'), /No deployment executed|execution: success/u);
});

test('repeated source and metadata flags plus API/scope override pass unchanged to owning services', async () => {
  for (const overrides of [
    { 'source-dir': ['one.json', 'directory'] },
    { 'source-dir': undefined, metadata: ['dmo:A__dlm', 'dmo:B__dlm'] },
  ]) {
    const { command } = invocation({ ...overrides, 'api-version': '66.0', 'data-space': 'other' });
    const { result } = await run(command);
    assert.equal(result.metadata.apiVersion, '66.0');
    assert.equal(result.result.scope.dataSpace, 'other');
  }
});

test('all local selection refusals occur before target inspection and remain payload-free', async () => {
  for (const code of [
    'INVALID_SELECTION',
    'UNSAFE_SOURCE',
    'INVALID_SOURCE',
    'DUPLICATE_IDENTITY',
  ]) {
    for (const preview of [true, false]) {
      const { command, calls } = invocation({ preview });
      command.resolveInputs = async () => {
        throw new DeployInputError(code);
      };
      const { result, exitCode } = await run(command);
      assert.equal(result.diagnostics.errors[0].code, code);
      assert.equal(exitCode, 1);
      assert.deepEqual(calls, []);
      assert.deepEqual(result.result.items, []);
    }
  }
});

test('empty resolved selection and missing org cannot yield successful preview', async () => {
  const { command, calls } = invocation();
  command.resolveInputs = async () => [];
  const empty = await run(command);
  assert.equal(empty.result.status, 'blocked');
  assert.deepEqual(calls, []);
  const missing = invocation({ 'target-org': undefined });
  const { result, exitCode } = await run(missing.command);
  assert.equal(result.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
  assert.equal(exitCode, 1);
  assert.deepEqual(missing.calls, ['inputs']);
});

test('all four preflight outcomes preserve service proof and aggregate blocked nonzero', async () => {
  for (const outcome of ['create', 'update', 'unchanged', 'blocked-changes', 'blocked']) {
    const { command } = invocation();
    command.resolveInputs = async () => [input('First__dlm'), input('Second__dlm')];
    let count = 0;
    command.preflight = async () => {
      count++;
      return {
        outcome,
        target: outcome === 'create' ? 'absent' : 'present',
        absenceProof: outcome === 'create' ? 'complete-inventory' : 'none',
        diagnostics: outcome.startsWith('blocked')
          ? [{ code: 'UPDATE_UNSUPPORTED', message: 'Updates blocked.' }]
          : [],
      };
    };
    const { result, exitCode } = await run(command);
    assert.equal(count, 2);
    assert.equal(result.result.items.length, 2);
    assert.equal(result.result.items[0].outcome, outcome);
    assert.equal(result.status, outcome.startsWith('blocked') ? 'blocked' : 'success');
    assert.equal(exitCode, outcome.startsWith('blocked') ? 1 : undefined);
  }
});

test('unexpected per-item failure is redacted, retains all item outcomes and dominates blocked', async () => {
  const { command } = invocation();
  command.resolveInputs = async () => [input('First__dlm'), input('Second__dlm')];
  let count = 0;
  command.preflight = async () => {
    if (++count === 1) throw new Error('secret-remote-payload');
    return { outcome: 'unchanged', target: 'present', absenceProof: 'none', diagnostics: [] };
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  assert.equal(result.result.items[1].outcome, 'unchanged');
  assert.equal(result.result.items[0].diagnostics[0].code, 'PREFLIGHT_FAILED');
  assert.ok(!JSON.stringify(result).includes('secret-remote-payload'));
});

test('org and resolver unexpected failures are redacted with nonzero exit', async () => {
  for (const location of ['resolver', 'org']) {
    const { command } = invocation(
      location === 'org'
        ? {
            'target-org': {
              getOrgId: () => {
                throw new Error('private-auth');
              },
            },
          }
        : {},
    );
    if (location === 'resolver')
      command.resolveInputs = async () => {
        throw new Error('private-auth');
      };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(exitCode, 1);
    assert.ok(!JSON.stringify(result).includes('private-auth'));
  }
});

test('real resolver plus injected read-only preflight leaves authored files and directory unchanged', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-preview-command-'));
  const file = path.join(cwd, 'authored.json');
  const document = {
    schemaVersion: 1,
    kind: 'dmo',
    identity: { dataSpace: 'default', apiName: 'Preview__dlm' },
    spec: {
      label: 'Preview',
      category: 'Other',
      fields: [
        {
          name: 'Key__c',
          label: 'Key',
          dataType: 'Text',
          isPrimaryKey: true,
          isDynamicLookup: false,
        },
      ],
    },
  };
  const bytes = JSON.stringify(document);
  await writeFile(file, bytes);
  const { command } = invocation({ 'source-dir': [file] });
  command.resolveInputs = readDeployInputs;
  command.preflight = async (value) => {
    assert.deepEqual(value, document);
    return { outcome: 'unchanged', target: 'present', absenceProof: 'none', diagnostics: [] };
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.deepEqual(await readdir(cwd), ['authored.json']);
  assert.equal(await readFile(file, 'utf8'), bytes);
});

test('human summary states preview only, never actual deployment', async () => {
  const { command } = invocation();
  const logs = [];
  command.jsonEnabled = () => false;
  command.log = (message) => logs.push(message);
  await run(command);
  assert.match(logs.join('\n'), /No deployment executed/u);
  assert.match(logs.join('\n'), /Preview: create/u);
});
