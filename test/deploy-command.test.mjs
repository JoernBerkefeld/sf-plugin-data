import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';

// A DMO-only selection joins the whole-selection batch route when Git selected it; explicit
// all-native selections use the per-item native route covered by the native DMO command tests.
const input = (name = 'Preview__dlm') => ({
  path: `data360/dmo/${name}.dmo-meta.json`,
  document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: name } },
});
const invocation = (overrides = {}) => {
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const connection = {};
  const client = {};
  const flags = {
    preview: true,
    'changed-since': 'main',
    'api-version': '65.0',
    dataspace: 'default',
    'target-org': {
      getOrgId: () => {
        calls.push('org');
        return 'synthetic-target';
      },
      getUsername: () => 'synthetic@example.invalid',
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
  command.selectGitInputs = async () => ({
    paths: ['authored.dmo-meta.json'],
    provenance: { requestedRef: 'main' },
  });
  command.resolveInputs = async (options) => {
    calls.push('inputs');
    assert.deepEqual(options, {
      cwd: process.cwd(),
      sourceDir: flags['source-dir'] ?? (flags.metadata ? undefined : ['authored.dmo-meta.json']),
      metadata: flags.metadata,
    });
    return [input()];
  };
  command.captureInput = async () => 'synthetic-digest';
  command.createDmoClient = (target, version) => {
    assert.equal(target, 'synthetic@example.invalid');
    assert.equal(version, flags['api-version']);
    return client;
  };
  command.preflightNativeDmo = async (...arguments_) => {
    calls.push('preflight');
    assert.deepEqual(arguments_, [input().document, client, flags.dataspace]);
    return {
      family: 'dmo',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  };
  command.executeNativeDmo = async () => {
    calls.push('execute');
    assert.equal(flags.preview, false, 'preview must never invoke the executor');
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  return { command, calls, client };
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

test('CI dependency expansion blocks public mixed selection before target work', async () => {
  const { command, calls } = invocation({ preview: false, 'include-dependencies': true });
  command.resolveInputs = async () => [
    input(),
    {
      path: 'ci.xml',
      companionPath: 'ci.json',
      inputDigest: 'synthetic',
      document: { kind: 'calculated-insight' },
    },
  ];
  const { result } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'CI_DEPENDENCY_EXPANSION_UNSUPPORTED');
  assert.deepEqual(calls, []);
});

test('auto deploy pins a native DMO batch to API68 without discovery and refuses malformed IR', async () => {
  const { command, calls } = invocation({ 'api-version': 'auto' });
  command.parse = async () => ({
    flags: {
      preview: true,
      'api-version': 'auto',
      dataspace: 'default',
      'changed-since': 'main',
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'synthetic@example.invalid',
        getConnection: (version) => {
          assert.equal(version, '68.0');
          return { request: () => assert.fail('no version discovery') };
        },
      },
    },
  });
  command.createDmoClient = (_target, version) => {
    assert.equal(version, '68.0');
    return {};
  };
  command.preflightNativeDmo = async () => previewResult('unchanged');
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.metadata.apiVersion, 'auto');
  assert.equal(result.metadata.soapApiVersion, '68.0');
  assert.deepEqual(result.result.items[0].routes, [
    { operation: 'dmo.deploy', apiVersion: '68.0', transport: 'native' },
  ]);
  command.resolveInputs = async () => [
    {
      path: 'owner.json',
      document: {
        kind: 'identity-resolution',
        identity: { dataSpace: 'default', apiName: 'Individual_A1b2' },
      },
    },
  ];
  command.preflightNativeDmo = command.executeNativeDmo = () =>
    assert.fail('IR must never dispatch DMO');
  const blocked = await run(command);
  assert.equal(blocked.result.status, 'blocked');
  assert.equal(blocked.result.diagnostics.errors[0].code, 'INVALID_SOURCE');
  assert.ok(!calls.includes('execute'));
});

test('processing acknowledgement parses only the exact boolean flag and defaults false', async () => {
  const { Parser } = await import('@oclif/core');
  const flags = { 'allow-processing': Deploy.flags['allow-processing'] };
  const defaults = await Parser.parse([], { flags });
  const acknowledged = await Parser.parse(['--allow-processing'], { flags });
  assert.equal(defaults.flags['allow-processing'], false);
  assert.equal(acknowledged.flags['allow-processing'], true);
  for (const arguments_ of [
    ['--allow-processing=false'],
    ['--allow-processing', 'true'],
    ['--allowProcessing'],
    ['--no-allow-processing'],
  ])
    await assert.rejects(Parser.parse(arguments_, { flags }));
});

test('latest is refused on every route before target inspection, discovery or services', async () => {
  for (const preview of [true, false])
    for (const git of [true, false]) {
      const { command, calls } = invocation({
        preview,
        'api-version': 'latest',
        ...(git ? {} : { 'changed-since': undefined, 'source-dir': ['authored.dmo-meta.json'] }),
      });
      command.preflightNativeDmo = command.executeNativeDmo = () =>
        assert.fail('no DMO reads, POST or PATCH');
      const { result, exitCode } = await run(command);
      assert.equal(result.status, 'blocked');
      assert.equal(exitCode, 1);
      assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
      assert.deepEqual(calls, ['inputs']);
      assert.deepEqual(result.result.items, []);
    }
});

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
    name: 'sf-plugin-data',
    version: '0.1.0',
  });
  assert.equal(result.provenance.pluginVersion, '0.1.0');
  assert.equal(result.provenance.targetOrgId, 'synthetic-target');
  assert.ok(Number.isFinite(Date.parse(result.provenance.generatedAt)));
  assert.equal(result.result.items[0].operation, 'preview');
  assert.equal(result.result.items[0].outcome, 'create');
  assert.equal(result.result.items[0].absenceProof, 'confirmed-404');
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
  family: 'dmo',
  outcome,
  target: outcome === 'create' ? 'absent' : 'existing',
  absenceProof: outcome === 'create' ? 'confirmed-404' : 'none',
  diagnostics: [],
});
const batchInvocation = () => {
  const setup = invocation({ preview: false });
  setup.command.resolveInputs = async () => [input('A__dlm'), input('B__dlm'), input('C__dlm')];
  setup.command.preflightNativeDmo = async () => {
    setup.calls.push('preflight');
    return previewResult();
  };
  return setup;
};

test('whole selection preflight finishes before execution; unchanged stays no-op', async () => {
  const { command, calls, client } = batchInvocation();
  command.executeNativeDmo = async (...arguments_) => {
    calls.push('execute');
    assert.equal(calls.filter((call) => call === 'preflight').length, 3);
    assert.equal(arguments_[1], client);
    assert.equal(arguments_[2], 'default');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  assert.equal(calls.filter((call) => call === 'execute').length, 3);
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
    command.preflightNativeDmo = async () => {
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

test('a later native DMO refusal names its own reason and prevents all earlier writes', async () => {
  const { command, calls } = batchInvocation();
  let count = 0;
  command.preflightNativeDmo = async () => {
    if (++count === 2) throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
    return previewResult();
  };
  const { result, exitCode } = await run(command);
  assert.equal(count, 3);
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  assert.equal(result.result.items[1].preflight.diagnostics[0].code, 'UNSUPPORTED_DMO_TARGET');
  assert.ok(!calls.includes('execute'));
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
});

test('sequential execution retains prior creation, stops and distinguishes remaining unattempted', async () => {
  for (const stop of ['blocked', 'failed', 'unknown', 'throw']) {
    const { command } = batchInvocation();
    let count = 0;
    command.executeNativeDmo = async () => {
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

test('update preview and execution retain update, noop and unknown evidence', async () => {
  const { executeDmo } = await import('../lib/services/command-native-dmo.js');
  const defaults = new Deploy([], {});
  assert.equal(defaults.executeNativeDmo, executeDmo);
  // The removed API65 adapter seams must not reappear on the command.
  assert.equal('execute' in defaults, false);
  assert.equal('preflight' in defaults, false);
  const preview = invocation();
  preview.command.preflightNativeDmo = async () => previewResult('update');
  const advisory = await run(preview.command);
  assert.equal(advisory.result.result.items[0].outcome, 'update');
  assert.ok(!preview.calls.includes('execute'));
  for (const unknown of [false, true]) {
    const { command } = batchInvocation();
    command.preflightNativeDmo = async () => previewResult('update');
    let executions = 0;
    command.executeNativeDmo = async () => {
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

test('supported update plus mixed unsupported tail blocks whole selection without writes', async () => {
  const { command, calls } = batchInvocation();
  let admissions = 0;
  command.preflightNativeDmo = async () =>
    previewResult(++admissions === 2 ? 'blocked-changes' : 'update');
  const { result, exitCode } = await run(command);
  assert.equal(admissions, 3);
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.ok(!calls.includes('execute'));
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  assert.equal(result.result.items[0].preflight.outcome, 'update');
  assert.equal(result.result.items[1].preflight.outcome, 'blocked-changes');
});

test('human successful DMO actions are lowercase and never infer processing from flags', async () => {
  for (const outcome of ['created', 'updated', 'unchanged']) {
    const { command } = batchInvocation();
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    command.executeNativeDmo = async () => ({
      outcome,
      mutation:
        outcome === 'created'
          ? 'confirmed-created'
          : outcome === 'updated'
            ? 'confirmed-updated'
            : 'not-attempted',
      diagnostics: [],
    });
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.ok(!lines.some((line) => line.includes('(server is still processing)')));
    if (outcome === 'unchanged') {
      assert.ok(!lines.some((line) => /^(created|updated) /u.test(line)));
    } else {
      assert.equal(lines.filter((line) => line.startsWith(`${outcome} dmo `)).length, 3);
    }
  }
});

test('human execution output reports unknown mutation and never aggregate success', async () => {
  const { command } = batchInvocation();
  const logs = [];
  command.jsonEnabled = () => false;
  command.log = (message) => logs.push(message);
  command.executeNativeDmo = async () => ({
    outcome: 'failed',
    mutation: 'unknown',
    diagnostics: [],
  });
  const { exitCode } = await run(command);
  assert.equal(exitCode, 1);
  assert.match(logs.join('\n'), /Deploy execution: failed/u);
  assert.match(logs.join('\n'), /Mutation may have occurred/u);
  assert.match(logs.join('\n'), /Not attempted: dmo:.*; mutation: not-attempted/u);
  assert.doesNotMatch(logs.join('\n'), /No deployment executed|execution: success/u);
});

test('repeated source and metadata flags plus API/scope override pass unchanged to owning services', async () => {
  for (const overrides of [
    { 'source-dir': ['one.json', 'directory'] },
    { 'source-dir': undefined, metadata: ['dmo:A__dlm', 'dmo:B__dlm'] },
  ]) {
    const { command, calls } = invocation({
      'changed-since': undefined,
      ...overrides,
      'api-version': '66.0',
      dataspace: 'other',
    });
    const resolve = command.resolveInputs;
    // A Segment keeps this selection on the batch route, whose families require default space.
    command.resolveInputs = async (options) => {
      await resolve(options);
      return [
        {
          path: 'Audience.segment.json',
          document: { kind: 'segment', identity: { dataSpace: 'default', apiName: 'Audience' } },
        },
      ];
    };
    const { result } = await run(command);
    assert.deepEqual(calls, ['inputs']);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
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
    command.preflightNativeDmo = async () => {
      count++;
      return {
        ...previewResult(outcome),
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
  command.preflightNativeDmo = async () => {
    if (++count === 1) throw new Error('secret-remote-payload');
    return previewResult('unchanged');
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

const authored = () => ({
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
});

test('real resolver plus injected read-only preflight leaves authored files and directory unchanged', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-preview-command-'));
  const directory = path.join(cwd, 'data360', 'dmo');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'Preview__dlm.dmo-meta.json');
  const bytes = JSON.stringify(authored());
  await writeFile(file, bytes);
  const { command } = invocation({ 'changed-since': undefined, 'source-dir': [file] });
  command.resolveInputs = readDeployInputs;
  command.preflightNativeDmo = async (value) => {
    assert.deepEqual(value, authored());
    return previewResult('unchanged');
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(await readdir(directory), ['Preview__dlm.dmo-meta.json']);
  assert.equal(await readFile(file, 'utf8'), bytes);
});

for (const mode of ['source-dir file', 'source-dir directory', 'metadata selector'])
  test(`legacy DMO artifact selected by ${mode} is refused before any org call`, async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-legacy-command-'));
    const directory = path.join(cwd, 'data360', 'default', 'dmo');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'Preview__dlm.json');
    const bytes = JSON.stringify(authored());
    await writeFile(file, bytes);
    for (const preview of [true, false]) {
      const { command, calls } = invocation({
        preview,
        'changed-since': undefined,
        ...(mode === 'metadata selector'
          ? { metadata: ['dmo:Preview__dlm'] }
          : { 'source-dir': [mode === 'source-dir file' ? file : path.join(cwd, 'data360')] }),
      });
      // The command reads its own working directory; bind the real reader to the fixture root.
      command.resolveInputs = (options) => readDeployInputs({ ...options, cwd });
      command.resolveTargetOrg =
        command.createDmoClient =
        command.preflightNativeDmo =
        command.executeNativeDmo =
          () => assert.fail('A legacy DMO artifact must be refused before auth or services.');
      const lines = [];
      command.jsonEnabled = () => false;
      command.log = (line) => lines.push(line);
      const { result, exitCode } = await run(command);
      assert.equal(result.status, 'blocked');
      assert.equal(exitCode, 1);
      assert.deepEqual(calls, []);
      assert.deepEqual(result.result.items, []);
      // eslint-disable-next-line unicorn/no-null -- The public JSON contract represents unresolved target identity as null.
      assert.equal(result.provenance.targetOrgId, null);
      assert.equal(result.diagnostics.errors.length, 1);
      const [diagnostic] = result.diagnostics.errors;
      assert.equal(diagnostic.code, 'LEGACY_DMO_ARTIFACT_UNSUPPORTED');
      assert.equal(diagnostic.retryable, false);
      assert.match(diagnostic.message, /sf data360 retrieve -m dmo:<ApiName>__dlm/u);
      assert.match(diagnostic.message, /<ApiName>__dlm[.]dmo-meta[.]json/u);
      assert.ok(lines.some((line) => line.startsWith('LEGACY_DMO_ARTIFACT_UNSUPPORTED: ')));
      assert.equal(await readFile(file, 'utf8'), bytes);
    }
  });

test('human summary states preview only, never actual deployment', async () => {
  const { command } = invocation();
  const logs = [];
  command.jsonEnabled = () => false;
  command.log = (message) => logs.push(message);
  await run(command);
  assert.match(logs.join('\n'), /No deployment executed/u);
  assert.match(logs.join('\n'), /Planned create: dmo:/u);
});
