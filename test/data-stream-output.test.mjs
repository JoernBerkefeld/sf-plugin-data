import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeDataStreamDocument } from '../lib/artifacts/write-data-stream.js';

const document = () => ({
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'ExampleStream', dataSpace: 'default' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: 'ExampleConnection',
    event: 'ProbeRecord',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Example stream',
    newDlo: {
      name: 'Example__dll',
      label: 'Example',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
});
const directory = (root) => path.join(root, 'data360', 'data-stream');
const filename = 'ExampleStream.data-stream-meta.json';

test('stream publication emits LF, round trips, handles unchanged and explicit overwrite without mutating input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stream-output-'));
  const input = document();
  const before = structuredClone(input);
  const saved = await writeDataStreamDocument(input, root, false);
  assert.deepEqual(saved, { path: path.join(directory(root), filename), outcome: 'retrieved' });
  const bytes = await readFile(saved.path, 'utf8');
  assert.deepEqual(JSON.parse(bytes), input);
  assert.ok(bytes.endsWith('\n'));
  assert.ok(!bytes.includes('\r'));
  assert.deepEqual(input, before);
  const unchanged = await writeDataStreamDocument(input, root, false);
  assert.equal(unchanged.outcome, 'unchanged');
  input.spec.label = 'Different';
  await assert.rejects(writeDataStreamDocument(input, root, false), /OVERWRITE_REQUIRED/);
  assert.equal(await readFile(saved.path, 'utf8'), bytes);
  const overwritten = await writeDataStreamDocument(input, root, true);
  assert.equal(overwritten.outcome, 'retrieved');
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), input);
  assert.deepEqual(await readdir(directory(root)), [filename]);
  input.identity.dataSpace = 'other';
  for (const overwrite of [false, true])
    await assert.rejects(writeDataStreamDocument(input, root, overwrite), /DATASPACE_COLLISION/);
});

test('stream publication refuses unsafe roots, malformed filenames and oversized evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stream-paths-'));
  for (const unsafe of [
    'relative',
    path.parse(root).root,
    `${root}/../escape`,
    `${root}/*`,
    `${root} `,
  ])
    await assert.rejects(writeDataStreamDocument(document(), unsafe, false), /UNSAFE_PATH/);
  const input = document();
  input.identity.apiName = '../escape';
  await assert.rejects(writeDataStreamDocument(input, root, false), /INVALID_STREAM_NAME/);
  const huge = document();
  huge.spec.additiveFieldMappings = Array.from({ length: 10_000 }, (_, index) => ({
    sourceFieldLabel: 'ProbeValue',
    targetFieldName: `Field${index}`,
    targetFieldReturntype: 'Text',
  }));
  await assert.rejects(writeDataStreamDocument(huge, root, false), /UNSAFE_PATH/);
});

test('stream publication refuses identity/filename, case and trailing-space aliases, even with overwrite', async () => {
  for (const alias of [filename.toLowerCase(), `${filename} `, filename]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stream-alias-'));
    await mkdir(directory(root), { recursive: true });
    const input = document();
    input.identity.apiName = 'DifferentStream';
    const original = JSON.stringify(input);
    await writeFile(path.join(directory(root), alias), original);
    for (const overwrite of [false, true])
      await assert.rejects(
        writeDataStreamDocument(document(), root, overwrite),
        /FILENAME_COLLISION/,
      );
    assert.equal(await readFile(path.join(directory(root), alias), 'utf8'), original);
  }
});

test('stream publication refuses junction ancestors, linked destinations and non-files without touching sentinels', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stream-links-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stream-outside-'));
  await symlink(
    outside,
    path.join(root, 'data360'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeDataStreamDocument(document(), root, false), /OUTPUT_FAILED/);
  assert.deepEqual(await readdir(outside), []);
  const regular = await mkdtemp(path.join(os.tmpdir(), 'stream-hardlink-'));
  await mkdir(directory(regular), { recursive: true });
  const sentinel = path.join(regular, 'sentinel.json');
  await writeFile(sentinel, 'sentinel');
  await link(sentinel, path.join(directory(regular), filename));
  await assert.rejects(writeDataStreamDocument(document(), regular, true), /UNSAFE_PATH/);
  assert.equal(await readFile(sentinel, 'utf8'), 'sentinel');
  const nonfile = await mkdtemp(path.join(os.tmpdir(), 'stream-nonfile-'));
  await mkdir(path.join(directory(nonfile), filename), { recursive: true });
  await assert.rejects(writeDataStreamDocument(document(), nonfile, true), /UNSAFE_PATH/);
});
