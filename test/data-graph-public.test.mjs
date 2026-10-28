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
    { 'include-dependencies': true },
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

test('Graph public deploy fixed API refusal and complete-selection acknowledgement produce zero writes', async () => {
  for (const overrides of [
    { 'api-version': '65.0' },
    { 'api-version': 'latest' },
    { 'include-dependencies': true },
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
