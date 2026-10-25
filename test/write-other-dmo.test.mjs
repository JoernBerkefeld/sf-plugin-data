import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { serializeDmoDocument } from '../lib/artifacts/dmo-document.js';
import { DmoWriteError, writeOtherDmoDocument } from '../lib/artifacts/write-other-dmo.js';

const fixture = () => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Archive_Item__dlm' },
  spec: {
    category: 'Other',
    label: 'Archive item',
    fields: [
      {
        name: 'Key__c',
        label: 'Key',
        dataType: 'Text',
        isPrimaryKey: true,
        isDynamicLookup: false,
      },
      {
        name: 'Seen__c',
        label: 'Seen',
        dataType: 'DateTime',
        isPrimaryKey: false,
        isDynamicLookup: false,
      },
    ],
  },
});
const root = () => mkdtemp(path.join(os.tmpdir(), 'data360-writer-test-'));
const target = (directory) =>
  path.join(directory, 'data360', 'default', 'dmo', 'Archive_Item__dlm.json');
const refusal = (code) => (error) => error instanceof DmoWriteError && error.code === code;

// All isolated roots are retained; no recursive deletion or reusable fixture trees.
test('writes canonical authored-only bytes to the approved project-relative family path', async () => {
  const directory = await root();
  const document = fixture();
  const result = await writeOtherDmoDocument(document, path.join(directory, 'project'), false);
  assert.deepEqual(result, { path: target(path.join(directory, 'project')), outcome: 'retrieved' });
  const published = await lstat(result.path);
  assert.equal(published.nlink, 1);
  const bytes = await readFile(result.path, 'utf8');
  assert.equal(bytes, serializeDmoDocument(document));
  assert.deepEqual(Object.keys(JSON.parse(bytes)).toSorted(), [
    'identity',
    'kind',
    'schemaVersion',
    'spec',
  ]);
});

test('identical bytes are a true no-op; differing bytes need explicit overwrite', async () => {
  const directory = await root();
  const document = fixture();
  const { path: file } = await writeOtherDmoDocument(document, directory, false);
  const before = await lstat(file);
  const unchanged = await writeOtherDmoDocument(document, directory, false);
  const after = await lstat(file);
  assert.equal(unchanged.outcome, 'unchanged');
  assert.equal(after.mtimeMs, before.mtimeMs);
  document.spec.label = 'Changed';
  await assert.rejects(
    writeOtherDmoDocument(document, directory, false),
    refusal('OVERWRITE_REQUIRED'),
  );
  assert.equal(await readFile(file, 'utf8'), serializeDmoDocument(fixture()));
  const replaced = await writeOtherDmoDocument(document, directory, true);
  assert.equal(replaced.outcome, 'retrieved');
  assert.equal(await readFile(file, 'utf8'), serializeDmoDocument(document));
});

test('independent mapper blocks persisted unsupported candidates before creating output', async () => {
  const directory = await root();
  const document = fixture();
  document.spec.category = 'Profile';
  await assert.rejects(writeOtherDmoDocument(document, path.join(directory, 'absent'), true));
  await assert.rejects(lstat(path.join(directory, 'absent')), { code: 'ENOENT' });
  await assert.rejects(
    writeOtherDmoDocument({ candidate: fixture(), expectations: {} }, directory, true),
  );
  await assert.rejects(writeOtherDmoDocument(fixture(), ' ', true), refusal('UNSAFE_PATH'));
});

test('directories and ordinary files cannot be overwritten as path components', async () => {
  const directory = await root();
  await mkdir(target(directory), { recursive: true });
  await assert.rejects(writeOtherDmoDocument(fixture(), directory, true), refusal('UNSAFE_PATH'));
  const other = await root();
  await writeFile(path.join(other, 'data360'), 'sentinel');
  await assert.rejects(writeOtherDmoDocument(fixture(), other, true), refusal('UNSAFE_PATH'));
  assert.equal(await readFile(path.join(other, 'data360'), 'utf8'), 'sentinel');
});

test('junctions at the root or any output ancestor never escape to an outside tree', async () => {
  for (const ancestor of [
    '',
    'data360',
    path.join('data360', 'default'),
    path.join('data360', 'default', 'dmo'),
  ]) {
    const directory = await root();
    const outside = await root();
    const project = path.join(directory, 'project');
    const linked = path.join(project, ancestor);
    await mkdir(path.dirname(linked), { recursive: true });
    await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(writeOtherDmoDocument(fixture(), project, true), refusal('UNSAFE_PATH'));
    await assert.rejects(lstat(path.join(outside, 'Archive_Item__dlm.json')), { code: 'ENOENT' });
  }
});

test('a destination link is refused rather than replaced or followed', async () => {
  const directory = await root();
  const outside = await root();
  await mkdir(path.dirname(target(directory)), { recursive: true });
  await symlink(outside, target(directory), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(writeOtherDmoDocument(fixture(), directory, true), refusal('UNSAFE_PATH'));
  const stat = await lstat(target(directory));
  assert.ok(stat.isSymbolicLink());
});
