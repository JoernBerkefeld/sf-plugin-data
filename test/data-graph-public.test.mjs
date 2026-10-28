import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { dataGraphFields } from '../lib/artifacts/data-graph-document.js';
import { writeDataGraphDocument } from '../lib/artifacts/write-data-graph.js';
import {
  readDeployInputs,
  captureDeployInputDigest,
  verifyDataGraphInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
import { operationApiVersion } from '../lib/transport/api-version.js';
import { selectDeployDependencies } from '../lib/services/select-deploy-dependencies.js';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { writeIdentityResolutionDocument } from '../lib/artifacts/write-identity-resolution.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

const document = (apiName = 'SyntheticGraph') => ({
  schemaVersion: 1,
  kind: 'data-graph',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: 'Synthetic Graph',
    description: 'Preserved',
    primaryObjectName: 'UnifiedssotIndividualMkt__dlm',
    type: 'NONE',
    fullRefreshConfig: { schedule: { frequency: 7, timeGranularity: 'Day' } },
    incrementalRefreshConfig: { enabled: false },
    sourceObject: {
      name: 'UnifiedssotIndividualMkt__dlm',
      devName: 'UnifiedssotIndividualMkt__dlm',
      label: 'Unified Individual',
      path: [],
      fields: dataGraphFields(false),
      relatedObjects: [],
    },
  },
});
const root = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-graph-public-'));
  await writeFile(path.join(cwd, 'ownership'), randomUUID());
  return cwd;
};
test('local owned Graph selection expands exact IR owner, orders reversed roots and guards every byte', async () => {
  for (const configured of [false, true]) {
    const cwd = await root();
    if (configured)
      await writeFile(
        path.join(cwd, 'sfdx-project.json'),
        JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
      );
    const pair = irFixture();
    const owner = projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2');
    const graph = document();
    const identity = owner.expectations.outputs[0].identity;
    graph.spec.primaryObjectName = structuredClone(identity);
    graph.spec.sourceObject.name = structuredClone(identity);
    graph.spec.sourceObject.devName = structuredClone(identity);
    const graphReceipt = await writeDataGraphDocument(graph, cwd, false);
    const roots = await readDeployInputs({ cwd, metadata: ['data-graph:SyntheticGraph'] });
    const absent = await selectDeployDependencies(roots, cwd);
    assert.deepEqual(absent.inputs, roots);
    const ownerReceipt = await writeIdentityResolutionDocument(owner.candidate, cwd, false);
    const expanded = await selectDeployDependencies(roots, cwd);
    assert.deepEqual(
      expanded.inputs.map(({ document }) => document.kind),
      ['identity-resolution', 'data-graph'],
    );
    assert.equal(expanded.inputs[1], roots[0]);
    assert.equal(
      expanded.reasons.get('identity-resolution:default:Individual_A1b2').explicit,
      false,
    );
    const explicit = await readDeployInputs({
      cwd,
      metadata: ['data-graph:SyntheticGraph', 'identity-resolution:Individual_A1b2'],
    });
    for (const ordered of [explicit, explicit.toReversed()]) {
      const selected = await selectDeployDependencies(ordered, cwd);
      assert.deepEqual(
        selected.inputs.map(({ document }) => document.kind),
        ['identity-resolution', 'data-graph'],
      );
      assert.equal(
        selected.reasons.get('identity-resolution:default:Individual_A1b2').explicit,
        true,
      );
      await selected.verify();
    }
    for (const receipt of [ownerReceipt, graphReceipt]) {
      const bytes = await readFile(receipt.path, 'utf8');
      await writeFile(receipt.path, `${bytes} `);
      await assert.rejects(expanded.verify());
      await writeFile(receipt.path, bytes);
      await expanded.verify();
    }
    const unrelated = structuredClone(owner.candidate);
    unrelated.identity.apiName = 'UnrelatedOwner';
    await writeFile(ownerReceipt.path, JSON.stringify(unrelated));
    await assert.rejects(selectDeployDependencies(roots, cwd), { code: 'INVALID_SOURCE' });
    assert.equal(JSON.stringify(roots[0].document).includes(pair.facade.id), false);
  }
});

const rejects = (code) => (error) => error.code === code;
const git = (cwd, ...arguments_) =>
  execFileSync('git', arguments_, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

for (const configured of [false, true]) {
  test(`Graph canonical writer and immutable input digest configured=${configured}`, async () => {
    const cwd = await root();
    if (configured)
      await writeFile(
        path.join(cwd, 'sfdx-project.json'),
        JSON.stringify({
          packageDirectories: [{ path: 'custom', default: true }],
          sourceApiVersion: '65.0',
        }),
      );
    const value = document();
    const receipt = await writeDataGraphDocument(value, cwd, false);
    assert.equal(
      receipt.path,
      path.join(
        cwd,
        configured ? 'custom' : 'force-app',
        'main/default/data360/dataGraphs/SyntheticGraph.dataGraph.json',
      ),
    );
    const repeated = await writeDataGraphDocument(value, cwd, false);
    const portableBytes = await readFile(receipt.path, 'utf8');
    assert.equal(repeated.outcome, 'unchanged');
    assert.equal(portableBytes.includes('creationMode'), false);
    const inputs = await readDeployInputs({
      cwd,
      metadata: ['data-graph:SyntheticGraph', 'data-graph:SyntheticGraph'],
    });
    assert.equal(inputs.length, 1);
    assert.ok(Object.isFrozen(inputs[0].document.spec.sourceObject.fields));
    assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
    value.spec.label = 'Changed';
    await assert.rejects(writeDataGraphDocument(value, cwd, false), rejects('OVERWRITE_REQUIRED'));
    await writeDataGraphDocument(value, cwd, true);
    await assert.rejects(verifyDataGraphInputDigest(inputs[0]), rejects('UNSAFE_SOURCE'));
  });
}

test('Graph safe local admission refuses duplicate keys, request-only mode, mismatches, aliases and links', async () => {
  const cwd = await root();
  const receipt = await writeDataGraphDocument(document(), cwd, false);
  const bytes = await readFile(receipt.path, 'utf8');
  for (const text of [
    bytes.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'),
    bytes.replace('"label":', '"creationMode": "DEFAULT", "label":'),
    bytes.replaceAll('SyntheticGraph', 'Different'),
  ]) {
    await writeFile(receipt.path, text);
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: [receipt.path] }),
      rejects('INVALID_SOURCE'),
    );
  }
  await writeFile(receipt.path, bytes);
  const alias = path.join(
    cwd,
    'other/main/default/data360/dataGraphs/SyntheticGraph.dataGraph.json',
  );
  await mkdir(path.dirname(alias), { recursive: true });
  await writeFile(alias, bytes);
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path, alias] }),
    rejects('DUPLICATE_IDENTITY'),
  );
  await link(receipt.path, path.join(cwd, 'hardlink'));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    rejects('UNSAFE_SOURCE'),
  );
  await unlink(path.join(cwd, 'hardlink'));
  const junction = path.join(cwd, 'junction');
  await symlink(
    path.dirname(receipt.path),
    junction,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [path.join(junction, path.basename(receipt.path))] }),
  );
  for (const metadata of [['data-graph:../escape'], ['data-graph'], ['data-graph:SyntheticGraph ']])
    await assert.rejects(readDeployInputs({ cwd, metadata }), rejects('INVALID_SELECTION'));
  await assert.rejects(
    writeDataGraphDocument(document(), `${cwd}${path.sep}..${path.sep}outside`, false),
    rejects('UNSAFE_PATH'),
  );
});

test('Graph no-clobber publication refuses a raced destination and reports post-publication failure privately', async () => {
  const cwd = await root();
  await assert.rejects(
    writeDataGraphDocument(document(), cwd, false, {
      link: async (source, destination) => {
        await writeFile(destination, 'raced');
        return link(source, destination);
      },
      rename,
      unlink,
    }),
    rejects('OUTPUT_FAILED'),
  );
  const other = await root();
  await assert.rejects(
    writeDataGraphDocument(document(), other, false, {
      link,
      rename,
      unlink: async () => {
        throw new Error('private');
      },
    }),
    rejects('PARTIAL_DATA_GRAPH_OUTPUT'),
  );
});

test('Graph Git selection captures exact immutable input and refuses deletion and rename', async () => {
  const cwd = await root();
  const receipt = await writeDataGraphDocument(document(), cwd, false);
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', 'Synthetic baseline');
  await writeFile(receipt.path, (await readFile(receipt.path, 'utf8')) + '\n');
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(selected.paths, [receipt.path]);
  assert.equal(selected.dataGraphs.length, 1);
  await verifyDataGraphInputDigest(selected.dataGraphs[0]);
  await rename(receipt.path, receipt.path.replace('SyntheticGraph', 'Renamed'));
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    rejects('BLOCKED_GIT_LIFECYCLE'),
  );
  await rename(receipt.path.replace('SyntheticGraph', 'Renamed'), receipt.path);
  await unlink(receipt.path);
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    rejects('BLOCKED_GIT_LIFECYCLE'),
  );
});

const retrieve = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const flags = {
    metadata: ['data-graph:SyntheticGraph'],
    'api-version': 'auto',
    'data-space': 'default',
    'output-dir': 'synthetic',
    overwrite: false,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const connection = { getApiVersion: () => '65.0' };
  command.resolveOrg = async () => {
    calls.push('org');
    return { getOrgId: () => 'synthetic', getConnection: () => connection };
  };
  command.selectDocuments = async () => ['Example__dlm'];
  command.selectDependencies = async () => ({
    entries: [
      { document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'Example__dlm' } } },
    ],
    reasons: new Map(),
  });
  command.acquireDataGraph = async (conn, apiName, selection) => {
    assert.equal(conn.getApiVersion(), '67.0');
    assert.equal(connection.getApiVersion(), '65.0');
    assert.equal(selection.soapNumeric, '67.0');
    calls.push(`read:${apiName}`);
    return {
      identity: { dataSpace: 'default', apiName },
      candidate: document(apiName),
      blockers: [],
    };
  };
  command.bindDataGraph = async () => {
    calls.push('binding');
  };
  const writer = async (value) => {
    calls.push(`write:${value.identity.apiName}`);
    return { path: 'synthetic', outcome: 'retrieved' };
  };
  command.writeDataGraph = writer;
  command.writeDocument = writer;
  return { command, calls };
};

test('Graph public retrieve refuses numeric65/latest/expansion/invalid exact selection before auth', async () => {
  assert.equal(operationApiVersion('auto', 'data-graph'), '67.0');
  for (const overrides of [
    { 'api-version': '65.0' },
    { 'api-version': 'latest' },
    { 'api-version': '68.0' },
    { metadata: ['data-graph'] },
    { metadata: ['data-graph:../unsafe'] },
    { 'data-space': 'other' },
    { 'api-version': '67.0', metadata: ['data-graph:SyntheticGraph', 'dmo:Example__dlm'] },
  ]) {
    const { command, calls } = retrieve(overrides);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(calls, []);
  }
});

test('Graph public retrieve completes mixed admission before output with fixed routes and repeated exact names', async () => {
  const { command, calls } = retrieve({
    metadata: [
      'dmo:Example__dlm',
      'data-graph:SyntheticGraph',
      'data-graph:OtherGraph',
      'data-graph:SyntheticGraph',
    ],
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(calls.indexOf('read:SyntheticGraph') < calls.indexOf('write:Example__dlm'));
  assert.equal(result.result.items.filter((item) => item.family === 'data-graph').length, 2);
  assert.deepEqual(
    result.result.items.at(-1).routes.map((route) => route.apiVersion),
    ['67.0', '67.0', '65.0'],
  );
  const blocked = retrieve({ metadata: ['dmo:Example__dlm', 'data-graph:SyntheticGraph'] });
  blocked.command.acquireDataGraph = async () => ({ blockers: ['UNQUALIFIED'] });
  const blockedResult = await run(blocked.command);
  assert.equal(blockedResult.status, 'blocked');
  assert.ok(!blocked.calls.some((call) => call.startsWith('write:')));
});

test('public owned Graph retrieve qualifies explicit/reversed/expanded owners before any publication', async () => {
  const pair = irFixture();
  const owner = projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2');
  const identity = owner.expectations.outputs[0].identity;
  for (const mode of ['explicit', 'reversed', 'expanded', 'no-expansion', 'drift', 'wrong-owner']) {
    const selectors = ['identity-resolution:Individual_A1b2', 'data-graph:SyntheticGraph'];
    const { command, calls } = retrieve({
      metadata: ['expanded', 'no-expansion', 'drift', 'wrong-owner'].includes(mode)
        ? ['data-graph:SyntheticGraph']
        : mode === 'reversed'
          ? selectors.toReversed()
          : selectors,
      'include-dependencies': mode === 'expanded',
    });
    command.selectDependencies = async () => ({ entries: [], reasons: new Map() });
    const graph = document();
    graph.spec.primaryObjectName = structuredClone(identity);
    graph.spec.sourceObject.name = structuredClone(identity);
    graph.spec.sourceObject.devName = structuredClone(identity);
    const binding = {
      fingerprint: 'qualified',
      root: { identity, targetApiName: 'ActualReturned__dlm', targetId: 'local-only' },
    };
    command.acquireDataGraph = async (_conn, name, _version, _space, options) => {
      calls.push('graph-read');
      return options?.dependencyBinding
        ? { identity: graph.identity, candidate: graph, blockers: [] }
        : { identity: { dataSpace: 'default', apiName: name }, blockers: ['UNSUPPORTED'] };
    };
    command.readRawDataGraph = async () => ({ primaryObjectName: 'ActualReturned__dlm' });
    command.discoverDataGraphOwner = async () => {
      if (mode === 'wrong-owner') throw new Error('no exact qualified owner');
      return binding;
    };
    let bindings = 0;
    command.bindDataGraph = async () => {
      bindings++;
      return mode === 'drift' && bindings > 1 ? { ...binding, fingerprint: 'changed' } : binding;
    };
    command.acquireIdentityResolution = async () => ({
      ...owner,
      identity: owner.candidate.identity,
      blockers: [],
    });
    command.writeIdentityResolution = async (value) => {
      calls.push(`write:${value.identity.apiName}`);
      return { path: 'owner', outcome: 'retrieved' };
    };
    const result = await run(command);
    if (['drift', 'wrong-owner'].includes(mode)) {
      assert.equal(result.status, 'blocked');
      assert.ok(!calls.some((call) => call.startsWith('write:')));
    } else {
      assert.equal(result.status, 'success');
      assert.deepEqual(
        calls.filter((call) => call.startsWith('write:')),
        mode === 'no-expansion'
          ? ['write:SyntheticGraph']
          : ['write:Individual_A1b2', 'write:SyntheticGraph'],
      );
      assert.equal(JSON.stringify(result).includes('local-only'), false);
    }
  }
});

const preview = (outcome = 'update') => ({
  family: 'data-graph',
  route: { apiVersion: '67.0', operation: 'd360_data_graph_update' },
  outcome,
  target: 'present',
  absenceProof: 'none',
  requiredEffects: outcome === 'update' ? ['processing'] : [],
  diagnostics: [],
});
const deploy = (overrides = {}, mixed = false) => {
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const input = { path: 'graph.json', document: document(), inputDigest: 'a'.repeat(64) };
  const selected = [
    input,
    ...(mixed
      ? [
          {
            path: 'dmo.json',
            document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'Example__dlm' } },
          },
        ]
      : []),
  ];
  const connection = { getApiVersion: () => '65.0' };
  const flags = {
    'source-dir': ['synthetic'],
    'api-version': 'auto',
    'data-space': 'default',
    'allow-processing': true,
    preview: false,
    ...overrides,
    'target-org': {
      getOrgId: () => {
        calls.push('org');
        return 'synthetic';
      },
      getConnection: () => connection,
    },
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => selected;
  command.captureInput = async () => 'a'.repeat(64);
  command.verifyDataGraphInput = async () => {
    calls.push('digest');
  };
  command.bindDataGraph = async () => {
    calls.push('binding');
    return 'stable';
  };
  command.preflightDataGraph = async (_, conn, version) => {
    assert.equal(conn.getApiVersion(), '67.0');
    assert.equal(connection.getApiVersion(), '65.0');
    assert.equal(version.soapNumeric, '67.0');
    calls.push('graph-preview');
    return preview();
  };
  command.preflight = async () => {
    calls.push('dmo-preview');
    return { outcome: 'update', target: 'present', absenceProof: 'none', diagnostics: [] };
  };
  command.execute = async () => {
    calls.push('dmo-write');
    return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
  };
  command.executeDataGraph = async (_, __, ___, ____, options) => {
    await options.verifyInput();
    await options.recordObservation({ attempt: 0, timestamp: 1, body: { private: 'not-public' } });
    calls.push('graph-write');
    return { ...preview(), outcome: 'updated', mutation: 'confirmed-updated' };
  };
  return { command, calls, input, selected };
};

test('public owned Graph deploy orders selected owner, expands opt-in and rebinds only after confirmed settlement', async () => {
  const pair = irFixture();
  const owner = projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2');
  const identity = owner.expectations.outputs[0].identity;
  for (const mode of [
    'explicit',
    'reversed',
    'expanded',
    'drift',
    'pending-byte',
    'unknown-owner',
    'wrong-owner',
  ]) {
    const d = deploy();
    const graph = d.input.document;
    graph.spec.primaryObjectName = structuredClone(identity);
    graph.spec.sourceObject.name = structuredClone(identity);
    graph.spec.sourceObject.devName = structuredClone(identity);
    const ownerInput = {
      path: 'owner.json',
      document: owner.candidate,
      inputDigest: 'a'.repeat(64),
    };
    if (mode === 'wrong-owner') {
      graph.spec.primaryObjectName.owner.apiName = 'UnrelatedOwner';
      graph.spec.sourceObject.name.owner.apiName = 'UnrelatedOwner';
      graph.spec.sourceObject.devName.owner.apiName = 'UnrelatedOwner';
    }
    let expandedInputs;
    if (mode === 'expanded') {
      const cwd = await root();
      await writeDataGraphDocument(graph, cwd, false);
      await writeIdentityResolutionDocument(owner.candidate, cwd, false);
      expandedInputs = await readDeployInputs({ cwd, metadata: ['data-graph:SyntheticGraph'] });
      d.command.parse = async () => ({
        flags: {
          metadata: ['data-graph:SyntheticGraph'],
          'include-dependencies': true,
          'api-version': 'auto',
          'data-space': 'default',
          'allow-processing': true,
          'target-org': {
            getOrgId: () => 'synthetic',
            getConnection: () => ({ getApiVersion: () => '65.0' }),
          },
        },
      });
      const previousCwd = process.cwd();
      d.restore = () => process.chdir(previousCwd);
      process.chdir(cwd);
      d.command.resolveInputs = async () => expandedInputs;
    } else {
      d.command.resolveInputs = async () =>
        mode === 'reversed' ? [d.input, ownerInput] : [ownerInput, d.input];
    }
    d.command.verifyIdentityResolutionInput = async () => {};
    let settled = false;
    let binds = 0;
    d.command.bindIdentityResolution = async () => 'owner-stable';
    d.command.bindDataGraph = async () => {
      binds++;
      return mode === 'drift' && binds > 1 ? 'unexpected' : settled ? 'post-owner' : 'pre-owner';
    };
    let digests = 0;
    d.command.captureInput = async () =>
      mode === 'pending-byte' && ++digests > 6 ? 'changed' : 'a'.repeat(64);
    d.command.preflightIdentityResolution = async () => ({
      outcome: 'update',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: ['processing', 'publication', 'generated-output-provisioning'],
    });
    d.command.executeIdentityResolution = async () => {
      d.calls.push('owner-write');
      settled = true;
      return {
        outcome: mode === 'unknown-owner' ? 'failed' : 'updated',
        mutation: mode === 'unknown-owner' ? 'unknown' : 'confirmed-updated',
        diagnostics: [],
      };
    };
    try {
      const result = await run(d.command);
      const writes = d.calls.filter((call) => call.includes('write'));
      if (['drift', 'pending-byte', 'wrong-owner'].includes(mode)) {
        assert.equal(result.status, 'blocked');
        assert.deepEqual(writes, []);
      } else if (mode === 'unknown-owner') {
        assert.equal(result.status, 'failed');
        assert.deepEqual(writes, ['owner-write']);
      } else {
        assert.equal(result.status, 'success');
        assert.deepEqual(writes, ['owner-write', 'graph-write']);
        assert.ok(binds >= 4);
      }
    } finally {
      d.restore?.();
    }
  }
});

test('Graph public deploy fixed API refusal and complete-selection acknowledgement produce zero writes', async () => {
  for (const overrides of [
    { 'api-version': '65.0' },
    { 'api-version': 'latest' },
    { 'allow-processing': false },
  ]) {
    const { command, calls } = deploy(overrides, true);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.ok(!calls.some((call) => call.includes('write')));
    if (overrides['api-version'] || overrides['include-dependencies'])
      assert.ok(!calls.includes('org'));
  }
});

test('Graph mixed preview remains read-only; execution keeps private observations and reports fixed routes', async () => {
  const p = deploy({ preview: true }, true);
  const previewed = await run(p.command);
  assert.equal(previewed.status, 'success');
  assert.ok(!p.calls.some((call) => call.includes('write')));
  assert.deepEqual(
    previewed.result.items[0].routes.map((route) => route.apiVersion),
    ['67.0', '67.0', '65.0', '67.0'],
  );
  const d = deploy({}, true);
  const result = await run(d.command);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    d.calls.filter((call) => call.includes('write')),
    ['graph-write', 'dmo-write'],
  );
  assert.equal(JSON.stringify(result).includes('not-public'), false);
  assert.equal(d.command.dataGraphObservations.get('graph.json')[0].body.private, 'not-public');
});

test('Graph all-pending fresh admission blocks earlier legacy mutation on target/input drift', async () => {
  for (const drift of ['binding', 'preview', 'input']) {
    const { command, calls, selected } = deploy({}, true);
    selected[1].document.identity.apiName = 'UnifiedssotIndividualMkt__dlm';
    let checks = 0;
    if (drift === 'binding')
      command.bindDataGraph = async () => (++checks > 1 ? 'changed' : 'stable');
    if (drift === 'preview')
      command.preflightDataGraph = async () => preview(++checks > 1 ? 'blocked' : 'update');
    if (drift === 'input')
      command.captureInput = async () => (++checks > 4 ? 'changed' : 'a'.repeat(64));
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.ok(!calls.some((call) => call.includes('write')));
  }
});

test('Graph unchanged needs no acknowledgement and captured Git drift blocks before target reads', async () => {
  const d = deploy({ 'allow-processing': false });
  d.command.preflightDataGraph = async () => preview('unchanged');
  d.command.executeDataGraph = async () => ({ ...preview('unchanged'), mutation: 'not-attempted' });
  const unchanged = await run(d.command);
  assert.equal(unchanged.status, 'success');
  const g = deploy({ 'source-dir': undefined, 'changed-since': 'HEAD' });
  g.command.selectGitInputs = async () => ({
    paths: ['graph.json'],
    dataGraphs: [{ ...g.input, inputDigest: 'b'.repeat(64) }],
    provenance: {},
  });
  const drifted = await run(g.command);
  assert.equal(drifted.status, 'blocked');
  assert.ok(!g.calls.includes('org'));
});
