import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { link, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Delete from '../lib/commands/data360/delete.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { normalizeNativeMapping } from '../lib/artifacts/native-mapping-document.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeNativeRelationshipDocument } from '../lib/artifacts/write-native-relationship.js';
import { removeLocalFiles } from '../lib/services/local-file-removal.js';

const dlo = 'Example__dll';
const dmo = 'Target__dlm';
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-delete-local-files-'));
const exists = async (file) =>
  lstat(file).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );

/**
 * Write one local project file, creating its folder.
 * @param {string} root Project root.
 * @param {string[]} segments Path below data360.
 * @returns {Promise<string>} Absolute file path.
 */
async function projectFile(root, ...segments) {
  const file = path.join(root, 'data360', ...segments);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{}\n');
  return file;
}

/**
 * Run a delete command with the project as working directory, keeping the exit code.
 * @param {string} root Project root.
 * @param {object} command Delete command.
 * @returns {Promise<{result: object, exitCode: unknown}>} Envelope and exit code.
 */
async function inProject(root, command) {
  const cwd = process.cwd();
  const exitCode = process.exitCode;
  process.chdir(root);
  process.exitCode = undefined;
  try {
    const result = await command.run();
    return { result, exitCode: process.exitCode };
  } finally {
    process.exitCode = exitCode;
    process.chdir(cwd);
  }
}

/**
 * A delete command over fake native DLO/DMO/mapping clients.
 * @param {object} flags Flags merged over the defaults.
 * @param {object} [seams] Replaced command seams.
 * @returns {{command: object, lines: string[]}} Command and its human output.
 */
function command(flags, seams = {}) {
  const lines = [];
  const value = Object.create(Delete.prototype);
  value.parse = async () => ({ flags: { preview: false, ...flags } });
  value.jsonEnabled = () => !flags.human;
  value.log = (line) => lines.push(line);
  value.resolveTarget = async () => 'target';
  value.createDloNativeDeleteClient = () => ({
    get: async () => assert.fail('the DLO service is replaced'),
    delete: async () => {},
    dependencies: async () => ({ dependencies: [] }),
  });
  value.createDmoNativeDeleteClient = () => ({ get: async () => ({}), delete: async () => {} });
  value.retrieveDlo = async (apiName) => ({ identity: { dataSpace: 'default', apiName } });
  value.deleteDlo = async (apiName, client) => {
    await client.delete('0a0000000000000AAA');
    return { apiName, dataSpace: 'default' };
  };
  value.retrieveDmo = async (apiName) => ({ identity: { dataSpace: 'default', apiName } });
  value.deleteDmo = async (apiName, client) => {
    await client.delete(apiName);
    return { apiName, dataSpace: 'default' };
  };
  Object.assign(value, seams);
  return { command: value, lines };
}

test('a confirmed DLO, DMO and mapping deletion removes each item’s own local file', async () => {
  const root = await scratch();
  const files = [
    await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`),
    await projectFile(root, 'dmo', `${dmo}.dmo-meta.json`),
    await projectFile(root, 'mapping', 'Map.mapping-meta.json'),
  ];
  const other = await projectFile(root, 'dlo', 'Other__dll.dlo-meta.json');
  const { command: run, lines } = command(
    { metadata: [`dlo:${dlo}`, `dmo:${dmo}`, 'mapping:Map'], human: true },
    {
      createMappingSender: () => ({}),
      createMappingClient: () => ({
        get: async () => assert.fail('stubbed'),
        remove: async () => {},
      }),
      deleteMapping: async () => ({ apiName: 'Map' }),
    },
  );
  const { result, exitCode } = await inProject(root, run);
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  // Mapping first, then DMO, then DLO: the dependency order of the batch.
  assert.deepEqual(
    result.result.items.map((item) => item.removedLocalFiles),
    [
      [{ path: files[2], outcome: 'removed' }],
      [{ path: files[1], outcome: 'removed' }],
      [{ path: files[0], outcome: 'removed' }],
    ],
  );
  for (const file of files) assert.equal(await exists(file), false);
  assert.equal(await exists(other), true);
  assert.ok(lines.includes(`removed local file ${files[0]}`));
});

test('--keep-local-files reports the files kept and leaves them', async () => {
  const root = await scratch();
  const file = await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`);
  const { command: run, lines } = command({
    metadata: [`dlo:${dlo}`],
    'keep-local-files': true,
    human: true,
  });
  const { result } = await inProject(root, run);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].removedLocalFiles, [{ path: file, outcome: 'kept' }]);
  assert.equal(await exists(file), true);
  assert.ok(lines.includes(`kept local file ${file}`));
});

test('preview lists the files a deletion would remove and removes nothing', async () => {
  const root = await scratch();
  const file = await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`);
  const { command: run, lines } = command({
    metadata: [`dlo:${dlo}`, `dmo:${dmo}`],
    preview: true,
    human: true,
  });
  const { result } = await inProject(root, run);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => item.localFiles),
    [
      [{ path: path.join(root, 'data360', 'dmo', `${dmo}.dmo-meta.json`), exists: false }],
      [{ path: file, exists: true }],
    ],
  );
  assert.ok(result.result.items.every((item) => item.removedLocalFiles === undefined));
  assert.equal(await exists(file), true);
  assert.ok(lines.includes(`Planned local file removal: ${file}`));
  // With --keep-local-files a preview lists nothing.
  const kept = command({ metadata: [`dlo:${dlo}`], preview: true, 'keep-local-files': true });
  const keptResult = await inProject(root, kept.command);
  assert.equal(keptResult.result.result.items[0].localFiles, undefined);
});

test('a DLO Salesforce accepted and is still deleting counts as confirmed', async () => {
  const root = await scratch();
  const file = await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`);
  const { command: run } = command(
    { metadata: [`dlo:${dlo}`] },
    {
      deleteDlo: async (apiName, client) => {
        await client.delete('0a0000000000000AAA');
        return { apiName, dataSpace: 'default', processing: true };
      },
    },
  );
  const { result } = await inProject(root, run);
  assert.equal(result.result.items[0].outcome, 'deletion-processing');
  assert.deepEqual(result.result.items[0].removedLocalFiles, [{ path: file, outcome: 'removed' }]);
  assert.equal(await exists(file), false);
});

for (const scenario of ['unconfirmed', 'rejected', 'absent'])
  test(`a ${scenario} deletion keeps the local file`, async () => {
    const root = await scratch();
    const file = await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`);
    const { command: run } = command(
      { metadata: [`dlo:${dlo}`] },
      {
        deleteDlo: async (_apiName, client) => {
          if (scenario === 'absent') throw new DloError('DLO_HTTP_ERROR', 404);
          // A rejected DELETE throws here; an unconfirmed one is acknowledged but still readable.
          await client.delete('0a0000000000000AAA');
          throw new DloError('DLO_DELETE_NOT_CONFIRMED', 200);
        },
        createDloNativeDeleteClient: () => ({
          delete: async () => {
            if (scenario === 'rejected') throw new DloError('DLO_HTTP_ERROR', 400);
          },
          dependencies: async () => ({ dependencies: [] }),
        }),
      },
    );
    const { result } = await inProject(root, run);
    const [item] = result.result.items;
    assert.equal(
      item.outcome,
      { unconfirmed: 'deletion-unconfirmed', rejected: 'failed', absent: 'unchanged' }[scenario],
    );
    assert.equal(item.removedLocalFiles, undefined);
    assert.equal(await exists(file), true);
  });

test('a failed removal keeps the confirmed org result and exits nonzero', async () => {
  const root = await scratch();
  // A folder where the file is expected: never removed, never recursively.
  const folder = path.join(root, 'data360', 'dlo', `${dlo}.dlo-meta.json`);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'inside.json'), '{}');
  const { command: run, lines } = command({ metadata: [`dlo:${dlo}`], human: true });
  const { result, exitCode } = await inProject(root, run);
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'deleted');
  assert.equal(item.mutation, 'confirmed-deleted');
  assert.deepEqual(item.removedLocalFiles, [
    { path: folder, outcome: 'failed', code: 'UNSAFE_PATH' },
  ]);
  assert.equal(result.diagnostics.errors[0].code, 'LOCAL_FILE_REMOVAL_FAILED');
  assert.match(result.diagnostics.errors[0].message, /Do not repeat the delete/u);
  assert.equal(await exists(path.join(folder, 'inside.json')), true);
  assert.ok(lines.includes(`local file removal failed (UNSAFE_PATH): ${folder}`));
});

test('a hard-linked file and a file reached through a linked folder are refused', async () => {
  // Hard link: the second name would keep the content; nothing is removed.
  const root = await scratch();
  const file = await projectFile(root, 'dlo', `${dlo}.dlo-meta.json`);
  await link(file, path.join(root, 'twin.json'));
  const hard = await inProject(root, command({ metadata: [`dlo:${dlo}`] }).command);
  assert.deepEqual(hard.result.result.items[0].removedLocalFiles, [
    { path: file, outcome: 'failed', code: 'UNSAFE_PATH' },
  ]);
  assert.equal(await exists(file), true);
  // Linked folder: data360/dmo is a junction (a directory symlink elsewhere) to an outside folder.
  const project = await scratch();
  const outside = await scratch();
  const target = path.join(outside, `${dmo}.dmo-meta.json`);
  await writeFile(target, '{}\n');
  await mkdir(path.join(project, 'data360'), { recursive: true });
  await symlink(outside, path.join(project, 'data360', 'dmo'), 'junction');
  const linked = await inProject(project, command({ metadata: [`dmo:${dmo}`] }).command);
  assert.equal(linked.result.status, 'failed');
  assert.equal(linked.result.result.items[0].removedLocalFiles[0].code, 'UNSAFE_PATH');
  assert.equal(await exists(target), true);
});

test('removal refuses paths outside the project data360 folder or the exact source file', async () => {
  const root = await scratch();
  const boundary = path.join(root, 'data360');
  const outside = path.join(root, 'outside.json');
  await writeFile(outside, '{}');
  const source = path.join(root, 'source.json');
  await writeFile(source, '{}');
  assert.deepEqual(
    await removeLocalFiles(
      [
        { path: path.join(boundary, '..', 'outside.json'), boundary },
        { path: boundary, boundary },
        { path: source, boundary: path.join(root, 'other.json'), exact: true },
      ],
      false,
    ),
    [
      { path: outside, outcome: 'failed', code: 'UNSAFE_PATH' },
      { path: boundary, outcome: 'failed', code: 'UNSAFE_PATH' },
      { path: source, outcome: 'failed', code: 'UNSAFE_PATH' },
    ],
  );
  assert.equal(await exists(outside), true);
  assert.equal(await exists(source), true);
  assert.deepEqual(
    await removeLocalFiles([{ path: source, boundary: source, exact: true }], false),
    [{ path: source, outcome: 'removed' }],
  );
  assert.deepEqual(
    await removeLocalFiles([{ path: source, boundary: source, exact: true }], false),
    [{ path: source, outcome: 'not-present' }],
  );
});

test('a hand-written mapping file is found by the binding of the deleted mapping', async () => {
  const root = await scratch();
  const raw = {
    developerName: 'Map',
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: dmo,
    status: 'ACTIVE',
    fieldMappings: [
      { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c', developerName: 's1' },
    ],
  };
  const local = normalizeNativeMapping(raw);
  local.identity.apiName = 'MyMapping';
  const receipt = await writeNativeMappingDocument(local, root, false);
  const unrelated = await projectFile(root, 'mapping', 'Other.mapping-meta.json');
  const client = { get: async () => structuredClone(raw), remove: async () => {} };
  const { command: run } = command(
    { metadata: ['mapping:Map'] },
    {
      createMappingSender: () => ({}),
      createMappingClient: () => client,
      // Like the service, the deletion reads the mapping before removing it.
      deleteMapping: async (apiName, mappingClient) => {
        await mappingClient.get(apiName);
        await mappingClient.remove(apiName);
        return { apiName };
      },
    },
  );
  const { result } = await inProject(root, run);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].removedLocalFiles, [
    { path: receipt.path, outcome: 'removed' },
  ]);
  assert.equal(await exists(receipt.path), false);
  assert.equal(await exists(unrelated), true);
});

test('a confirmed relationship deletion removes the relationship file it read', async () => {
  const root = await scratch();
  const spec = {
    sourceObjectName: 'A__dlm',
    sourceFieldName: 'BRef__c',
    targetObjectName: 'B__dlm',
    targetFieldName: 'Id__c',
    cardinality: 'ManyToOne',
    relationshipOwner: 'DataCloud',
  };
  const name = 'A_BRef_map_B_Id_1';
  const receipt = await writeNativeRelationshipDocument(
    {
      schemaVersion: 1,
      kind: 'relationship',
      identity: { apiName: name, dataSpace: 'default' },
      spec,
    },
    root,
    false,
  );
  let state = [
    {
      cardinality: spec.cardinality,
      name,
      owner: spec.relationshipOwner,
      status: 'ACTIVE',
      sourceField: { name: spec.sourceFieldName },
      sourceObject: { name: spec.sourceObjectName },
      targetField: { name: spec.targetFieldName },
      targetObject: { name: spec.targetObjectName },
    },
  ];
  const { command: run } = command(
    { metadata: [`relationship:${name}`] },
    {
      createRelationshipSender: () => ({}),
      createRelationshipClient: () => ({
        list: async () =>
          state.length === 0 ? undefined : { relationships: state, totalSize: state.length },
        remove: async () => {
          state = [];
        },
      }),
    },
  );
  const { result } = await inProject(root, run);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].removedLocalFiles, [
    { path: receipt.path, outcome: 'removed' },
  ]);
  assert.equal(await exists(receipt.path), false);
});

test('a data stream deletion removes its file, and with --delete-dlo the linked DLO file', async () => {
  const root = await scratch();
  const stream = await projectFile(root, 'data-stream', 'Orders.data-stream-meta.json');
  const linked = await projectFile(root, 'dlo', 'Orders__dll.dlo-meta.json');
  const seams = {
    createDataStreamClients: async () => ({}),
    preflightDeleteDataStream: async () => ({
      outcome: 'delete',
      mutation: 'not-attempted',
      deleteDlo: true,
      targetDloName: 'Orders__dll',
    }),
    executeDeleteDataStream: async () => ({
      outcome: 'deleted',
      mutation: 'confirmed-deleted',
      targetApiName: 'Orders',
      targetDloName: 'Orders__dll',
      diagnostics: [],
    }),
  };
  const preview = await inProject(
    root,
    command({ metadata: ['data-stream:Orders'], 'delete-dlo': true, preview: true }, seams).command,
  );
  assert.deepEqual(preview.result.result.items[0].localFiles, [
    { path: stream, exists: true },
    { path: linked, exists: true },
  ]);
  // Without --delete-dlo the DLO is preserved and so is its file.
  const kept = await inProject(root, command({ metadata: ['data-stream:Orders'] }, seams).command);
  assert.deepEqual(kept.result.result.items[0].removedLocalFiles, [
    { path: stream, outcome: 'removed' },
  ]);
  assert.equal(await readFile(linked, 'utf8'), '{}\n');
  await projectFile(root, 'data-stream', 'Orders.data-stream-meta.json');
  const both = await inProject(
    root,
    command({ metadata: ['data-stream:Orders'], 'delete-dlo': true }, seams).command,
  );
  assert.deepEqual(both.result.result.items[0].removedLocalFiles, [
    { path: stream, outcome: 'removed' },
    { path: linked, outcome: 'removed' },
  ]);
});

test('delete help names the default removal and the keep flag', () => {
  assert.match(Delete.description, /removed by default/u);
  assert.match(Delete.description, /LOCAL_FILE_REMOVAL_FAILED/u);
  assert.equal(Delete.flags['keep-local-files'].default, false);
  assert.match(Delete.flags['keep-local-files'].summary, /no effect with --field/u);
});
