import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
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
  command.config = { pjson: { version: '0.1.0' } };
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
    ]);
    return {
      outcome: 'create',
      target: 'absent',
      absenceProof: 'complete-inventory',
      diagnostics: [],
    };
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
  assert.equal(result.provenance.targetOrgId, 'synthetic-target');
  assert.ok(Number.isFinite(Date.parse(result.provenance.generatedAt)));
  assert.equal(result.result.items[0].operation, 'preview');
  assert.equal(result.result.items[0].outcome, 'create');
  assert.equal(result.result.items[0].absenceProof, 'complete-inventory');
  assert.ok(!JSON.stringify(result).includes('deployed'));
});

test('without preview execution is always blocked before local or target work', async () => {
  const { command, calls } = invocation({ preview: false });
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'DEPLOY_EXECUTION_NOT_IMPLEMENTED');
  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);
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
    const { command, calls } = invocation();
    command.resolveInputs = async () => {
      throw new DeployInputError(code);
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
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
  for (const outcome of ['create', 'unchanged', 'blocked-changes', 'blocked']) {
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
