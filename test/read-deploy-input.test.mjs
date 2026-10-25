import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';

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
