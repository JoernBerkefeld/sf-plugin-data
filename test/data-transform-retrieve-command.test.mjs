import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, link } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Config } from '@oclif/core';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DataTransformError } from '../lib/artifacts/data-transform-document.js';
import { writeDataTransformDocument } from '../lib/artifacts/write-data-transform.js';
import { operationApiVersion } from '../lib/transport/api-version.js';

const document = () => ({
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
});

/**
 * Construct offline command seams.
 * @param {object} flags Flag overrides.
 * @returns {object} Command, calls and human lines.
 */
function invocation(flags = {}) {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const lines = [];
  command.parse = async () => ({
    flags: {
      metadata: ['data-transform:Zulu', 'data-transform:Alpha', 'data-transform:Alpha'],
      'api-version': 'auto',
      overwrite: false,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.log = (line) => lines.push(line);
  command.resolveOrg = async () => {
    calls.push('auth');
    return {
      getOrgId: () => 'synthetic-org',
      getConnection: (version) => {
        assert.equal(version, '68.0');
        return { offline: true };
      },
    };
  };
  command.createDataTransformClient = (connection, version, scope) => {
    assert.deepEqual(connection, { offline: true });
    assert.equal(version, '68.0');
    assert.equal(scope, 'default');
    return { offline: true };
  };
  command.acquireDataTransform = async (name) => {
    calls.push(name);
    return { document: { definition: { name } }, runtime: { secret: 'not-artifact' } };
  };
  command.writeDataTransform = async (value, root, overwrite) => {
    assert.deepEqual(Object.keys(value), ['definition']);
    assert.equal(path.isAbsolute(root), true);
    assert.equal(overwrite, false);
    return { path: `${value.definition.name}.json`, outcome: 'retrieved' };
  };
  command.listNativeNames = () => assert.fail('no inventory fallback');
  return { command, calls, lines };
}

/**
 * Isolate command exit status from runner status.
 * @param {object} command Offline command.
 * @returns {Promise<object>} Result and exit code.
 */
async function run(command) {
  const original = process.exitCode;
  process.exitCode = 0;
  try {
    return { result: await command.run(), exitCode: process.exitCode };
  } finally {
    process.exitCode = original;
  }
}

for (const version of ['auto', '68.0'])
  for (const json of [true, false])
    test(`Transform retrieve exact-only routing ${version}/${json}`, async () => {
      const { command, calls, lines } = invocation({ 'api-version': version });
      command.jsonEnabled = () => json;
      const { result, exitCode } = await run(command);
      assert.equal(exitCode, 0);
      assert.equal(result.status, 'success');
      assert.deepEqual(calls, ['auth', 'Alpha', 'Zulu']);
      assert.deepEqual(result.result.selection, ['data-transform:Alpha', 'data-transform:Zulu']);
      assert.equal(result.result.items[0].family, 'data-transform');
      assert.deepEqual(
        result.result.items[0].routes.map((route) => route.apiVersion),
        ['68.0', '68.0'],
      );
      assert.doesNotMatch(JSON.stringify(result), /not-artifact/u);
      if (!json) assert.equal(lines.at(-1), 'Downloaded data-transform: 2');
      assert.equal(operationApiVersion(version, 'data-transform'), '68.0');
    });

for (const flags of [
  { metadata: ['data-transform'] },
  { metadata: ['data-transform:'] },
  { metadata: ['data-transform:*'] },
  { metadata: ['data-transform:../Escape'] },
  { metadata: ['data-transform:Alpha:Beta'] },
  { metadata: ['data-transform:Alpha', 'dlo:Other__dll'] },
  { 'include-dependencies': true },
  { dataspace: 'other' },
  ...['61.0', '65.0', '67.0', '69.0', 'latest'].map((version) => ({ 'api-version': version })),
])
  test(`Transform refuses before authentication ${JSON.stringify(flags)}`, async () => {
    const { command, calls } = invocation(flags);
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
  });

for (const code of [
  'OVERWRITE_REQUIRED',
  'UNSAFE_PATH',
  'OUTPUT_FAILED',
  'unknown',
  'TRANSFORM_IDENTITY_MISMATCH',
])
  test(`Transform retrieval retains other successes on ${code}`, async () => {
    const { command } = invocation();
    command.acquireDataTransform = async (name) => {
      if (name === 'Alpha') {
        if (code === 'unknown') throw new Error('private-token');
        if (code === 'TRANSFORM_IDENTITY_MISMATCH')
          return { document: { definition: { name: 'Other' } } };
        throw new DataTransformError(code);
      }
      return { document: { definition: { name } } };
    };
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.equal(
      result.status,
      ['OVERWRITE_REQUIRED', 'UNSAFE_PATH'].includes(code) ? 'blocked' : 'failed',
    );
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Zulu'],
    );
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  });

test('Transform retrieval aliases parse the exact public selector', async () => {
  const config = await Config.load({ root: process.cwd() });
  for (const topic of ['data360', 'datacloud', 'd360', 'dc']) {
    const Command = await config.findCommand(`${topic}:retrieve`, { must: true }).load();
    assert.equal(Command, Retrieve);
    const command = new Command(
      ['-m', 'data-transform:SyntheticTransform', '--api-version', '68.0', '--json'],
      config,
    );
    const parsed = await command.parse(Command);
    assert.deepEqual(parsed.flags.metadata, ['data-transform:SyntheticTransform']);
  }
});

test('Transform publisher keeps authored input at canonical root, unchanged and explicit overwrite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-transform-publish-test-'));
  const value = document();
  const receipt = await writeDataTransformDocument(value, root, false);
  assert.equal(
    receipt.path,
    path.join(root, 'data360', 'dataTransforms', 'SyntheticTransform.dataTransform.json'),
  );
  assert.equal(receipt.outcome, 'retrieved');
  assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), value);
  const repeated = await writeDataTransformDocument(value, root, false);
  assert.equal(repeated.outcome, 'unchanged');
  value.definition.label = 'Changed label';
  await assert.rejects(writeDataTransformDocument(value, root, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  const replaced = await writeDataTransformDocument(value, root, true);
  assert.equal(replaced.outcome, 'retrieved');
  await link(receipt.path, path.join(root, 'hardlink.json'));
  await assert.rejects(writeDataTransformDocument(value, root, true), { code: 'UNSAFE_PATH' });
  for (const invalid of ['', '.', path.parse(root).root, `${root}/../escape`])
    await assert.rejects(writeDataTransformDocument(value, invalid, true), { code: 'UNSAFE_PATH' });
});

test('Transform publisher refuses filename aliases and malformed saved input even with overwrite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-transform-alias-test-'));
  const value = document();
  const receipt = await writeDataTransformDocument(value, root, false);
  await writeFile(receipt.path, '{"invalid":true}');
  await assert.rejects(writeDataTransformDocument(value, root, true));
  if (process.platform !== 'win32') {
    await writeFile(
      path.join(path.dirname(receipt.path), 'synthetictransform.dataTransform.json'),
      '{}',
    );
    await assert.rejects(writeDataTransformDocument(value, root, true), {
      code: 'TRANSFORM_FILENAME_COLLISION',
    });
  }
});
