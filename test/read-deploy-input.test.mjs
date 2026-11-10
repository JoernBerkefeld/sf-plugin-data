import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  captureDeployInputDigest,
  DeployInputError,
  readDeployInputs,
  verifyDataTransformInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { writeDataTransformDocument } from '../lib/artifacts/write-data-transform.js';

const fixture = (apiName = 'Preview_Item__dlm') => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: 'Preview item',
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
const root = () => mkdtemp(path.join(os.tmpdir(), 'data360-input-test-'));
const put = async (cwd, relative, value = fixture()) => {
  const file = path.join(cwd, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
};
const refusal = (code) => (error) => error instanceof DeployInputError && error.code === code;

const transform = (name = 'SyntheticTransform') => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  definition: {
    name,
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
});

test('Transform publisher roundtrips through exact metadata and source admission with frozen digest', async () => {
  const cwd = await root();
  const { path: file } = await writeDataTransformDocument(transform(), cwd, false);
  const [input] = await readDeployInputs({
    cwd,
    metadata: ['data-transform:SyntheticTransform', 'data-transform:SyntheticTransform'],
  });
  assert.equal(input.path, file);
  assert.deepEqual(input.document, transform());
  assert.ok(Object.isFrozen(input));
  assert.ok(
    Object.isFrozen(input.document.definition.definition.nodes.LOAD_DATASET0.parameters.fields),
  );
  assert.match(input.inputDigest, /^[a-f0-9]{64}$/u);
  assert.equal(await captureDeployInputDigest(input), input.inputDigest);
  assert.deepEqual(await readDeployInputs({ cwd, sourceDir: [file, path.dirname(file)] }), [input]);
  await writeFile(file, `${await readFile(file, 'utf8')}\n`);
  await assert.rejects(verifyDataTransformInputDigest(input), refusal('UNSAFE_SOURCE'));
  await assert.rejects(captureDeployInputDigest(input), refusal('UNSAFE_SOURCE'));
});

test('Transform admission rejects wrong location, filename identity, raw runtime and duplicate keys', async () => {
  const cwd = await root();
  const canonical = 'data360/dataTransforms/SyntheticTransform.dataTransform.json';
  for (const relative of [
    'SyntheticTransform.dataTransform.json',
    'data360/wrong/SyntheticTransform.dataTransform.json',
  ]) {
    const file = await put(cwd, relative, transform());
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: [file] }),
      refusal('INVALID_SELECTION'),
    );
  }
  const json = JSON.stringify(transform());
  for (const value of [
    transform('Different'),
    { ...transform(), runtime: {} },
    json.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    `\uFEFF${json}`,
  ]) {
    await put(cwd, canonical, value);
    await assert.rejects(
      readDeployInputs({ cwd, metadata: ['data-transform:SyntheticTransform'] }),
      refusal('INVALID_SOURCE'),
    );
  }
  for (const selector of [
    'data-transform',
    'data-transform:',
    'data-transform:../SyntheticTransform',
    'data-transform:SyntheticTransform:extra',
  ])
    await assert.rejects(
      readDeployInputs({ cwd, metadata: [selector] }),
      refusal('INVALID_SELECTION'),
    );
});

test('Transform duplicate identities and hardlinked canonical files fail closed', async () => {
  const cwd = await root();
  const file = await put(
    cwd,
    'data360/dataTransforms/SyntheticTransform.dataTransform.json',
    transform(),
  );
  await put(cwd, 'other/data360/dataTransforms/SyntheticTransform.dataTransform.json', transform());
  await assert.rejects(readDeployInputs({ cwd, sourceDir: [cwd] }), refusal('DUPLICATE_IDENTITY'));
  await link(file, path.join(cwd, 'linked.json'));
  await assert.rejects(readDeployInputs({ cwd, sourceDir: [file] }), refusal('UNSAFE_SOURCE'));
});

test('Transform source admission requires explicit operation before authentication', async () => {
  const cwd = await root();
  await writeDataTransformDocument(transform(), cwd, false);
  const inputs = await readDeployInputs({ cwd, metadata: ['data-transform:SyntheticTransform'] });
  for (const preview of [true, false]) {
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: { metadata: ['data-transform:SyntheticTransform'], 'api-version': 'auto', preview },
    });
    command.jsonEnabled = () => true;
    command.log = () => {};
    command.resolveInputs = async () => inputs;
    command.resolveTargetOrg = async () => {
      assert.fail('Authentication must not occur');
    };
    const previousExitCode = process.exitCode;
    let result;
    try {
      result = await command.run();
    } finally {
      process.exitCode = previousExitCode;
    }
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_TRANSFORM_DEPLOY_SELECTION');
    assert.deepEqual(result.result.items, []);
  }
});

// All newly created OS-temp fixtures are retained; no recursive cleanup.
test('directory depth, file count and non-JSON directory members are bounded', async () => {
  const cwd = await root();
  await put(cwd, `${'nested/'.repeat(17)}item.json`);
  await assert.rejects(readDeployInputs({ cwd, sourceDir: ['nested'] }), refusal('UNSAFE_SOURCE'));
  const many = await root();
  for (let index = 0; index < 257; index++)
    await put(many, `${index}.json`, fixture(`Item${index}__dlm`));
  await assert.rejects(
    readDeployInputs({ cwd: many, sourceDir: [many] }),
    refusal('UNSAFE_SOURCE'),
  );
  const mixed = await root();
  await put(mixed, 'item.json');
  await put(mixed, 'notes.txt');
  await assert.rejects(
    readDeployInputs({ cwd: mixed, sourceDir: [mixed] }),
    refusal('UNSAFE_SOURCE'),
  );
});
test('explicit file and repeated paths coalesce without modifying files or adding reports', async () => {
  const cwd = await root();
  const file = await put(cwd, 'item.json');
  const before = await readFile(file);
  const selected = await readDeployInputs({ cwd, sourceDir: ['item.json', file] });
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], { path: file, document: fixture() });
  assert.deepEqual(await readFile(file), before);
  assert.deepEqual(await readdir(cwd), ['item.json']);
});

test('explicit directories recurse deterministically and overlapping selections coalesce', async () => {
  const cwd = await root();
  await put(cwd, 'selected/z.json', fixture('Zulu__dlm'));
  await put(cwd, 'selected/nested/a.json', fixture('Alpha__dlm'));
  const selected = await readDeployInputs({ cwd, sourceDir: ['selected', 'selected/z.json'] });
  assert.deepEqual(
    selected.map((item) => item.document.identity.apiName),
    ['Alpha__dlm', 'Zulu__dlm'],
  );
});

test('repeated exact metadata selectors resolve only conventional project files', async () => {
  const cwd = await root();
  await put(cwd, 'data360/default/dmo/Preview_Item__dlm.json');
  await put(cwd, 'unselected.json', '{invalid');
  const selected = await readDeployInputs({
    cwd,
    metadata: ['dmo:Preview_Item__dlm', 'dmo:Preview_Item__dlm'],
  });
  assert.equal(selected.length, 1);
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['dmo:Missing__dlm'] }),
    refusal('UNSAFE_SOURCE'),
  );
  await put(cwd, 'data360/default/dmo/Preview_Item__dlm.json', fixture('Different__dlm'));
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['dmo:Preview_Item__dlm'] }),
    refusal('INVALID_SELECTION'),
  );
});

test('no implicit deploy-all, bare type, mixed modes, malformed selectors or path escapes', async () => {
  const cwd = await root();
  for (const flags of [
    {},
    { sourceDir: [] },
    { metadata: [] },
    { sourceDir: ['x'], metadata: ['dmo:X__dlm'] },
    ...['dmo', 'dmo:', 'dmo:X__dlm:extra', 'dmo:../X__dlm', 'dlo:X__dlm', 'dmo:X__dlm '].map(
      (value) => ({ metadata: [value] }),
    ),
    ...['', ' ', '../x.json', '*.json', 'F:relative.json'].map((value) => ({ sourceDir: [value] })),
  ]) {
    await assert.rejects(readDeployInputs({ cwd, ...flags }), refusal('INVALID_SELECTION'));
  }
});

test('strict authored JSON rejects raw projections, unknown keys, duplicate keys, BOM and invalid UTF8', async () => {
  const cwd = await root();
  const json = JSON.stringify(fixture());
  for (const value of [
    '{',
    JSON.stringify({ candidate: fixture() }),
    JSON.stringify({ ...fixture(), id: 'private' }),
    json.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    json.replace('"schemaVersion":1', String.raw`"schemaVersion":1,"schema\u0056ersion":1`),
    `\uFEFF${json}`,
    JSON.stringify({
      ...fixture(),
      identity: { dataSpace: 'other', apiName: 'Preview_Item__dlm' },
    }),
  ]) {
    await put(cwd, 'item.json', value);
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: ['item.json'] }),
      refusal('INVALID_SOURCE'),
    );
  }
  await writeFile(path.join(cwd, 'item.json'), Buffer.from([0xff]));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: ['item.json'] }),
    refusal('UNSAFE_SOURCE'),
  );
});

test('different files with duplicate or case-conflicting identities are rejected', async () => {
  const cwd = await root();
  await put(cwd, 'a.json');
  for (const name of ['Preview_Item__dlm', 'preview_Item__dlm']) {
    await put(cwd, 'b.json', fixture(name));
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: [cwd] }),
      refusal('DUPLICATE_IDENTITY'),
    );
  }
});

test('links, junction ancestors, hardlinks, missing files, non-JSON and size limits fail closed', async () => {
  const cwd = await root();
  const outside = await root();
  const file = await put(outside, 'item.json');
  await symlink(
    outside,
    path.join(cwd, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: ['linked/item.json'] }),
    refusal('UNSAFE_SOURCE'),
  );
  await link(file, path.join(cwd, 'hard.json'));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: ['hard.json'] }),
    refusal('UNSAFE_SOURCE'),
  );
  for (const name of ['missing.json', 'notes.txt', 'large.json']) {
    if (name !== 'missing.json')
      await put(cwd, name, name === 'large.json' ? ' '.repeat(1_048_577) : '{}');
    await assert.rejects(readDeployInputs({ cwd, sourceDir: [name] }), refusal('UNSAFE_SOURCE'));
  }
  await mkdir(path.join(cwd, 'empty'));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: ['empty'] }),
    refusal('INVALID_SELECTION'),
  );
});
