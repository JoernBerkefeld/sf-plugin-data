import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

// Synthetic repositories under the verified OS temp directory; owned evidence is retained.
const execute = promisify(execFile);
const git = async (cwd, ...arguments_) => {
  const { stdout } = await execute('git', arguments_, { cwd, windowsHide: true });
  return stdout.trim();
};
const put = async (cwd, file, value) => {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), typeof value === 'string' ? value : JSON.stringify(value));
};
const commit = async (cwd) => {
  await git(cwd, 'add', '-A');
  await git(cwd, 'commit', '-m', 'Synthetic delete fixture');
  return git(cwd, 'rev-parse', 'HEAD');
};

const unified = 'UnifiedssotIndividualA1b2__dlm';
const irDocument = () => {
  const native = nativeIrFixture();
  native.objectApiName = 'Individual_A1b2';
  native.rulesetId = 'A1b2';
  return projectNativeIdentityResolution(native, 'Individual_A1b2').candidate;
};
const graphFields = ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'];
const graphDocument = {
  schemaVersion: 1,
  kind: 'native-data-graph',
  apiVersion: '68.0',
  definition: {
    name: 'SyntheticGraph',
    label: 'Synthetic graph',
    description: '',
    dataspaceName: 'default',
    primaryObjectName: unified,
    type: 'NONE',
    sourceObject: {
      name: unified,
      devName: 'AuthoredNode',
      label: 'Unified Individual',
      jsonPath: '$',
      path: [],
      type: 'derived',
      relatedObjects: [],
      fields: graphFields.map((sourceFieldName, index) => ({
        devName: `Authored${index}`,
        sourceFieldName,
        dataType: 'Text',
        isKeyColumn: index === 0,
        isProjected: true,
        usageTag: index === 1 ? 'KEY_QUALIFIER' : 'NONE',
      })),
    },
  },
};
const transformDocument = {
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  definition: {
    name: 'SyntheticTransform',
    label: 'Synthetic transform',
    description: 'Synthetic definition',
    type: 'BATCH',
    dataSpaceName: 'default',
    definition: {
      type: 'STL',
      version: '56.0',
      nodes: {
        LOAD_DATASET0: {
          action: 'load',
          parameters: {
            dataset: { name: 'Source__dll', type: 'dataLakeObject' },
            fields: ['Id__c'],
            sampleDetails: { sortBy: [], type: 'TopN' },
          },
          sources: [],
        },
        OUTPUT0: {
          action: 'outputD360',
          parameters: {
            name: 'Output__dll',
            type: 'dataLakeObject',
            fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
          },
          sources: ['LOAD_DATASET0'],
        },
      },
    },
  },
};
const dmoDocument = (apiName) => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: 'Example',
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
const dloDocument = (apiName) => ({
  schemaVersion: 1,
  kind: 'dlo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: 'Example',
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});
const streamDocument = {
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'Example_Probe', dataSpace: 'default' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: 'Example_Connection',
    event: 'ProbeRecord',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Example-Probe',
    newDlo: {
      name: 'Example_Probe__dll',
      label: 'Requested stream',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
};
const relationshipDocument = {
  schemaVersion: 1,
  kind: 'relationship',
  identity: { apiName: 'A_BRef_map_B_Id', dataSpace: 'default' },
  spec: {
    sourceObjectName: 'A__dlm',
    sourceFieldName: 'BRef__c',
    targetObjectName: 'B__dlm',
    targetFieldName: 'Id__c',
    cardinality: 'ManyToOne',
    relationshipOwner: 'DataCloud',
  },
};
const files = {
  graph: [
    'force-app/main/default/data360/dataGraphs/SyntheticGraph.native-dataGraph.json',
    graphDocument,
  ],
  ir: [
    'force-app/main/default/data360/identityResolution/Individual_A1b2.identityResolution.json',
    irDocument(),
  ],
  transform: ['data360/dataTransforms/SyntheticTransform.dataTransform.json', transformDocument],
  dmo: ['data360/dmo/Example__dlm.dmo-meta.json', dmoDocument('Example__dlm')],
  stream: ['data360/data-stream/Example_Probe.data-stream-meta.json', streamDocument],
  landing: ['data360/dlo/Example_Probe__dll.dlo-meta.json', dloDocument('Example_Probe__dll')],
  relationship: [
    'data360/relationship/A_BRef_map_B_Id.relationship-meta.json',
    relationshipDocument,
  ],
};

/**
 * A repository whose base commit holds the given files; they are then removed and committed.
 * @param {string[]} names Keys of {@link files} deleted in the range.
 * @param {string[]} [kept] Keys of files that stay.
 * @returns {Promise<{cwd: string, base: string}>} Repository and base commit.
 */
const repository = async (names, kept = []) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-git-delete-'));
  await writeFile(path.join(cwd, '.run-owner'), randomUUID());
  await git(cwd, 'init', '--initial-branch=main');
  await git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  await git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  await git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  await git(cwd, 'config', '--local', 'core.autocrlf', 'false');
  for (const name of [...names, ...kept]) await put(cwd, ...files[name]);
  const base = await commit(cwd);
  for (const name of names) await git(cwd, 'rm', '-q', '--', files[name][0]);
  if (names.length > 0) await commit(cwd);
  return { cwd, base };
};

const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

/**
 * Delete command selected by --changed-since in a real repository, every executor mocked.
 * @param {string} cwd Repository.
 * @param {object} flags Flag overrides (changed-since included).
 * @returns {object} Command and call ledger.
 */
const harness = (cwd, flags) => {
  const h = { calls: [], linked: {}, transforms: [], hooks: {} };
  const command = Object.create(Delete.prototype);
  h.command = command;
  command.parse = async () => ({
    flags: { preview: false, 'confirm-delete': true, 'keep-local-files': false, ...flags },
  });
  command.jsonEnabled = () => true;
  command.selectGitInputs = async (options) => {
    h.calls.push('git');
    return selectGitDeployInputs({ ...options, cwd });
  };
  command.resolveInputs = async () => {
    throw new Error('A Git delete never reads --source-dir inputs');
  };
  command.resolveConnection = async () => {
    h.calls.push('auth');
    return { getUsername: () => 'target' };
  };
  command.resolveTarget = async () => 'target';
  command.nativeGraphContext = async () => ({});
  command.nativeGraphClient = () => ({});
  command.operateNativeGraph = async (document, _context, _client, options) => {
    await options.verifyInput();
    h.calls.push(`graph:${document.definition.name}`);
    await h.hooks.graph?.();
    return options.preview
      ? { outcome: 'delete', mutation: 'not-attempted' }
      : { outcome: 'deleted', mutation: 'confirmed-deleted' };
  };
  command.deleteIdentityResolution = async (desired, _connection, _version, _space, options) => {
    await options.verifyInput();
    h.calls.push(`ir:${desired.identity.apiName}`);
    return {
      outcome: options.preview ? 'delete' : 'deletion-processing',
      mutation: options.preview ? 'not-attempted' : 'acknowledged-processing',
      diagnostics: [],
    };
  };
  command.createDataTransformClient = () => ({
    list: async (offset) => ({
      totalSize: h.transforms.length,
      dataTransforms: h.transforms.slice(offset, offset + 20),
    }),
    delete: async () => {},
  });
  command.createDataTransformDloReader = () => ({});
  command.deleteDataTransform = async (_desired, _client, _reader, options) => {
    await options.verifyInput();
    h.calls.push(`transform:${options.targetId}`);
    return options.preview
      ? { outcome: 'preview', mutation: 'not-attempted' }
      : { outcome: 'deleted', mutation: 'confirmed-deleted', prerequisitesPreserved: true };
  };
  command.createDmoNativeDeleteClient = () => ({});
  command.retrieveDmo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  command.deleteDmo = async (name) => {
    h.calls.push(`dmo:${name}`);
    return { dataSpace: 'default' };
  };
  command.createDloNativeDeleteClient = () => ({
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  command.retrieveDlo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  command.deleteDlo = async (name) => {
    h.calls.push(`dlo:${name}`);
    return { dataSpace: 'default' };
  };
  command.createRelationshipSender = () => ({});
  command.createRelationshipClient = () => ({ list: async () => [], remove: async () => {} });
  command.preflightDeleteRelationship = async (name, document) => {
    h.calls.push(`relationship-preview:${name}:${document.spec.sourceObjectName}`);
    return { present: true };
  };
  command.deleteRelationship = async (name, document) => {
    h.calls.push(`relationship:${name}:${document.spec.sourceObjectName}`);
    return { outcome: 'deleted' };
  };
  command.createDataStreamClients = async () => ({});
  command.readStreamLinkedDlo = async (name) => {
    h.calls.push(`stream-link:${name}`);
    return h.linked[name];
  };
  command.preflightDeleteDataStream = async (name, _clients, options) => {
    h.calls.push(`stream-preview:${name}:${options.deleteDlo}`);
    return { outcome: 'delete', mutation: 'not-attempted' };
  };
  command.executeDeleteDataStream = async (name, _clients, options) => {
    h.calls.push(`stream:${name}:${options.deleteDlo}`);
    return { outcome: 'deleted', mutation: 'confirmed-deleted', diagnostics: [] };
  };
  return h;
};
const codes = (result) => result.diagnostics.errors.map((error) => error.code);

test('a graph and the IR it needs, deleted in the range, run graph first then the IR', async () => {
  const { cwd, base } = await repository(['ir', 'graph']);
  const h = harness(cwd, { 'changed-since': base });
  const result = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(h.calls, ['git', 'auth', 'graph:SyntheticGraph', 'ir:Individual_A1b2']);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome]),
    [
      ['data-graph', 'deleted'],
      ['identity-resolution', 'deletion-processing'],
    ],
  );
  // The files are already gone: nothing is listed or removed locally.
  assert.ok(result.result.items.every((item) => item.removedLocalFiles === undefined));
  assert.deepEqual(result.result.selection, { changedSince: base });
  assert.equal(result.provenance.git.mergeBase, base);
});

test('a Git delete needs --confirm-delete before any org call, even in one phase', async () => {
  const { cwd, base } = await repository(['dmo']);
  const h = harness(cwd, { 'changed-since': base, 'confirm-delete': false });
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(codes(result), ['DESTRUCTIVE_CONFIRMATION_REQUIRED']);
  assert.match(result.diagnostics.errors[0].message, /Git range/u);
  assert.deepEqual(h.calls, ['git']);
});

test('a Git delete preview runs without --confirm-delete and plans the IR after its graph', async () => {
  const { cwd, base } = await repository(['ir', 'graph']);
  const h = harness(cwd, { 'changed-since': base, 'confirm-delete': false, preview: true });
  const result = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(h.calls, ['git', 'auth', 'graph:SyntheticGraph']);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome]),
    [
      ['data-graph', 'delete'],
      ['identity-resolution', 'planned-dependencies'],
    ],
  );
  assert.ok(result.result.items.every((item) => item.localFiles === undefined));
});

test('a path deleted in a commit and re-added is not a delete', async () => {
  const { cwd, base } = await repository(['dmo']);
  await put(cwd, ...files.dmo);
  const h = harness(cwd, { 'changed-since': base });
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items, []);
  assert.deepEqual(h.calls, ['git']);
});

test('a deleted file of no known family in a plugin folder blocks before any org call', async () => {
  const { cwd } = await repository([]);
  await put(cwd, 'data360/dmo/Notes.txt', 'synthetic');
  const base = await commit(cwd);
  await git(cwd, 'rm', '-q', '--', 'data360/dmo/Notes.txt');
  await commit(cwd);
  const h = harness(cwd, { 'changed-since': base });
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(codes(result), ['BLOCKED_GIT_LIFECYCLE']);
  assert.deepEqual(h.calls, ['git']);
});

for (const stage of ['untracked', 'index']) {
  test(`a committed delete plus an ${stage} add of the same component blocks (rename split)`, async () => {
    const { cwd, base } = await repository(['dmo']);
    // Same DMO, different path (letter case): Git cannot pair the two stages as a rename.
    await put(cwd, 'data360/dmo/EXAMPLE__dlm.dmo-meta.json', dmoDocument('EXAMPLE__dlm'));
    if (stage === 'index') await git(cwd, 'add', '-A');
    const h = harness(cwd, { 'changed-since': base });
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(codes(result), ['BLOCKED_GIT_LIFECYCLE']);
    assert.deepEqual(h.calls, ['git']);
  });
}

for (const [label, rows, expected] of [
  ['no match', [{ id: '1dt000000000002AAA', name: 'OtherTransform' }], 'unchanged'],
  ['one match', [{ id: '1dt000000000001AAA', name: 'SyntheticTransform' }], '1dt000000000001AAA'],
  [
    'two matches',
    [
      { id: '1dt000000000001AAA', name: 'SyntheticTransform' },
      { id: '1dt000000000003AAA', name: 'SYNTHETICTRANSFORM' },
    ],
    undefined,
  ],
]) {
  test(`a transform deleted in the range resolves its target ID by name: ${label}`, async () => {
    const { cwd, base } = await repository(['transform']);
    const h = harness(cwd, { 'changed-since': base });
    h.transforms = rows;
    const result = await run(h.command);
    if (expected === 'unchanged') {
      // Nothing of that name (also on a rerun after it was deleted): no delete is sent.
      assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
      assert.deepEqual(h.calls, ['git', 'auth']);
      assert.deepEqual(
        result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
        [['data-transform', 'unchanged', 'not-attempted']],
      );
      return;
    }
    if (expected) {
      assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
      assert.deepEqual(h.calls, ['git', 'auth', `transform:${expected}`]);
      assert.equal(result.result.items[0].outcome, 'deleted');
      return;
    }
    assert.equal(result.status, 'blocked');
    assert.deepEqual(codes(result), ['TRANSFORM_TARGET_NOT_RESOLVED']);
    assert.match(result.diagnostics.errors[0].message, /SyntheticTransform/u);
    assert.deepEqual(h.calls, ['git', 'auth']);
    // Refused during admission: no phase started, so no item is reported.
    assert.deepEqual(result.result.items, []);
  });
}

test('a transform deleted in the range with two matches blocks before its graph is deleted', async () => {
  const { cwd, base } = await repository(['graph', 'transform']);
  for (const preview of [false, true]) {
    const h = harness(cwd, { 'changed-since': base, preview });
    h.transforms = [
      { id: '1dt000000000001AAA', name: 'SyntheticTransform' },
      { id: '1dt000000000003AAA', name: 'SYNTHETICTRANSFORM' },
    ];
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(codes(result), ['TRANSFORM_TARGET_NOT_RESOLVED']);
    assert.deepEqual(h.calls, ['git', 'auth']);
    assert.deepEqual(result.result.items, []);
  }
});

test('a stream and its landing DLO deleted in the range are one stream delete with the DLO', async () => {
  const { cwd, base } = await repository(['stream', 'landing']);
  const h = harness(cwd, { 'changed-since': base });
  h.linked.Example_Probe = 'Example_Probe__dll';
  const result = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(h.calls, ['git', 'stream-link:Example_Probe', 'stream:Example_Probe:true']);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.removedWith]),
    [
      ['data-stream', 'deleted', undefined],
      ['dlo', 'deleted', 'data-stream:Example_Probe'],
    ],
  );
});

test('a relationship deleted in the range takes its source DMO from the base content', async () => {
  const { cwd, base } = await repository(['relationship']);
  for (const preview of [true, false]) {
    const h = harness(cwd, { 'changed-since': base, preview });
    const result = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(h.calls, [
      'git',
      `relationship${preview ? '-preview' : ''}:A_BRef_map_B_Id:A__dlm`,
    ]);
  }
});

test('a file deleted in the range that is present again before its phase blocks that phase', async () => {
  const { cwd, base } = await repository(['ir', 'graph']);
  const h = harness(cwd, { 'changed-since': base });
  h.hooks.graph = () => put(cwd, ...files.ir);
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(codes(result), ['BLOCKED_GIT_LIFECYCLE']);
  assert.deepEqual(h.calls, ['git', 'auth', 'graph:SyntheticGraph']);
  // The graph phase already deleted: the message must not claim nothing was deleted.
  const { message } = result.diagnostics.errors[0];
  assert.match(message, /this phase and the later ones did not start/u);
  assert.match(message, /items listed before it were deleted/u);
  assert.doesNotMatch(message, /Nothing was deleted/u);
});

for (const [flag, value, code] of [
  ['metadata', ['dmo:Example__dlm'], 'INVALID_SELECTION'],
  ['delete-dlo', true, 'INVALID_STREAM_DELETE_SELECTION'],
]) {
  test(`--changed-since refuses --${flag} before reading Git`, async () => {
    const h = harness(os.tmpdir(), { 'changed-since': 'HEAD', [flag]: value });
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(codes(result), [code]);
    assert.deepEqual(h.calls, []);
  });
}
