import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Delete from '../lib/commands/data360/delete.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  readDeployInputs,
  verifyIdentityResolutionInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { deleteIdentityResolution } from '../lib/services/delete-identity-resolution.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return { result: await command.run(), exit: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};
const harness = async (overrides = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ir-delete-command-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const raw = { ...nativeIrFixture(), id: '1ir000000000001AAA' };
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const directory = path.join(root, 'main', 'default', 'data360', 'identityResolution');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${desired.identity.apiName}.identityResolution.json`);
  await writeFile(file, `${JSON.stringify(desired)}\n`);
  const flags = {
    metadata: [`identity-resolution:${desired.identity.apiName}`],
    'source-dir': file,
    preview: false,
    'confirm-delete': true,
    ...overrides,
  };
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.verifyIdentityResolutionInput = verifyIdentityResolutionInputDigest;
  const calls = { auth: 0, writes: 0, reads: 0 };
  const h = { command, flags, calls, raw, file, absent: false, logs: [] };
  command.log = (line) => h.logs.push(line);
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    request: async (request, options) => {
      if (request.method === 'DELETE') {
        calls.writes++;
        if (h.failWrite)
          throw { statusCode: 503, data: [{ errorCode: 'UNAVAILABLE', message: 'private' }] };
        h.absent = !h.processing;
        h.afterWrite = true;
        return options.noContentResponse;
      }
      assert.equal(request.method, 'GET');
      calls.reads++;
      if (calls.reads === 4 && request.url.endsWith(`/${raw.id}`) && h.onFinalIdRead)
        await h.onFinalIdRead();
      if (h.absent)
        throw {
          statusCode: 404,
          name: 'ITEM_NOT_FOUND',
          errorCode: 'ITEM_NOT_FOUND',
          data: { errorCode: 'ITEM_NOT_FOUND', message: 'Absent' },
        };
      return h.afterWrite && h.processing
        ? { ...structuredClone(raw), rulesetStatus: 'DELETING', reconciliationRules: [] }
        : structuredClone(raw);
    },
  };
  command.resolveConnection = async () => {
    calls.auth++;
    if (h.onAuth) await h.onAuth();
    return connection;
  };
  command.deleteIdentityResolution = (...arguments_) =>
    deleteIdentityResolution(...arguments_.slice(0, 4), {
      ...arguments_[4],
      verifyDependencies: async () => {
        if (h.bind) await h.bind();
        return { fingerprint: 'a'.repeat(64) };
      },
      verifyOutputs: async (_owner, outputs) =>
        outputs.map((output, index) => ({
          ...output,
          targetId: `output-${index}`,
          creationType: output.identity.role === 'unified' ? 'Derived' : 'Bridge',
          fields: [
            {
              apiName: output.identity.role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c',
              dataType: 'Text',
            },
          ],
        })),
      delay: async () => {},
    });
  return h;
};
for (const version of [undefined, 'auto', '68.0'])
  test(`public IR delete resolves ${version} to native68 and repeat is unchanged`, async () => {
    // --keep-local-files leaves the source file, so the repeat reads it again.
    const h = await harness({ 'api-version': version, 'keep-local-files': true });
    const { result, exit } = await run(h.command);
    assert.deepEqual(
      result.result.items[0].removedLocalFiles.map((file) => file.outcome),
      ['kept'],
    );
    assert.equal(result.status, 'success');
    assert.equal(exit, undefined);
    assert.equal(result.metadata.apiVersion, '68.0');
    assert.equal(result.result.items[0].mutation, 'confirmed-deleted');
    assert.equal(h.calls.writes, 1);
    h.flags['confirm-delete'] = false;
    const repeat = await run(h.command);
    assert.equal(repeat.result.result.items[0].outcome, 'unchanged');
    assert.equal(h.calls.writes, 1);
    assert.match(result.diagnostics.warnings[0], /physical.*unverified/u);
  });
for (const mode of ['preview', 'absent', 'unconfirmed'])
  test(`public IR ${mode} confirmation behavior`, async () => {
    const h = await harness({ preview: mode === 'preview', 'confirm-delete': false });
    h.absent = mode === 'absent';
    const { result, exit } = await run(h.command);
    assert.equal(result.status, mode === 'unconfirmed' ? 'blocked' : 'success');
    assert.equal(exit, mode === 'unconfirmed' ? 1 : undefined);
    assert.equal(h.calls.writes, 0);
    assert.equal(
      result.result.items[0].outcome,
      mode === 'preview' ? 'delete' : mode === 'absent' ? 'unchanged' : 'blocked',
    );
  });
for (const pin of ['65.0', '67.0', '69.0', 'latest'])
  test(`public IR rejects ${pin} before auth`, async () => {
    const h = await harness({ 'api-version': pin });
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
  });
for (const overrides of [
  { dataspace: 'other' },
  { 'source-dir': undefined },
  { 'source-dir': 'folder' },
  { metadata: ['identity-resolution'] },
  { metadata: ['identity-resolution:*'] },
  { metadata: ['identity-resolution:Individual_ABCDE'] },
  { metadata: ['identity-resolution:Individual_B'] },
  { metadata: ['identity-resolution:Individual_A1b2', 'dlo:Other__dll'] },
  { metadata: ['identity-resolution:Individual_A1b2', 'identity-resolution:Individual_A1b2'] },
  { 'delete-dlo': true },
])
  test(`public IR rejects unsafe intent ${JSON.stringify(overrides)}`, async () => {
    const h = await harness(overrides);
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.auth, 0);
    assert.equal(h.calls.writes, 0);
  });
for (const drift of ['bytes', 'confirmation', 'both'])
  test(`public IR final ID read ${drift} drift blocks before DELETE`, async () => {
    const h = await harness();
    let finalIdReads = 0;
    h.onFinalIdRead = async () => {
      finalIdReads++;
      if (drift !== 'confirmation') await writeFile(h.file, 'changed');
      if (drift !== 'bytes') h.flags['confirm-delete'] = false;
    };
    const { result, exit } = await run(h.command);
    assert.equal(finalIdReads, 1);
    assert.equal(h.calls.reads, 4);
    assert.equal(result.status, 'blocked');
    assert.equal(exit, 1);
    assert.equal(result.result.items[0].outcome, 'blocked');
    assert.equal(result.result.items[0].mutation, 'not-attempted');
    assert.equal(h.calls.writes, 0);
  });
for (const drift of ['bytes', 'flags', 'source', 'target'])
  test(`public IR ${drift} drift is zero-write`, async () => {
    const h = await harness();
    if (drift === 'bytes') h.bind = () => writeFile(h.file, 'changed');
    if (drift === 'flags')
      h.onAuth = () => {
        h.flags['confirm-delete'] = false;
      };
    if (drift === 'source')
      h.bind = () => {
        h.flags['source-dir'] = 'other.identityResolution.json';
      };
    if (drift === 'target')
      h.bind = () => {
        h.raw.description = 'Concurrent';
      };
    const { result } = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(h.calls.writes, 0);
  });
test('public IR unknown write diagnostics, text and exit status preserve native evidence without payload', async () => {
  const h = await harness();
  h.failWrite = true;
  h.command.jsonEnabled = () => false;
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'failed');
  assert.equal(exit, 1);
  assert.equal(h.calls.writes, 1);
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.match(result.diagnostics.errors[0].message, /HTTP 503.*UNAVAILABLE/u);
  assert.equal(result.diagnostics.errors[0].retryable, false);
  assert.ok(
    h.logs.some((line) =>
      /Failed: identity-resolution:Individual_A1b2; mutation: unknown/u.test(line),
    ),
  );
  assert.ok(h.logs.some((line) => line.includes('HTTP 503')));
  assert.doesNotMatch(JSON.stringify(result), /private|1ir000/u);
});
for (const processing of [false, true])
  test(`public IR exact human deletion action, processing=${processing}`, async () => {
    const h = await harness();
    h.processing = processing;
    h.command.jsonEnabled = () => false;
    const { result, exit } = await run(h.command);
    assert.equal(result.status, 'success');
    assert.equal(exit, undefined);
    assert.equal(h.calls.writes, 1);
    assert.equal(result.result.items[0].outcome, processing ? 'deletion-processing' : 'deleted');
    assert.equal(
      result.result.items[0].mutation,
      processing ? 'acknowledged-processing' : 'confirmed-deleted',
    );
    assert.deepEqual(h.logs, [
      'Delete: success.',
      `deleted identity-resolution Individual_A1b2${processing ? ' (server is still processing)' : ''}`,
      // Accepted and still processing counts as confirmed: the source file is removed.
      `removed local file ${result.result.items[0].removedLocalFiles[0].path}`,
    ]);
    assert.equal(result.result.items[0].removedLocalFiles[0].outcome, 'removed');
  });
test('IR delete help retains aliases and describes owner-only native68 behavior', () => {
  assert.deepEqual(Delete.aliases, ['datacloud:delete', 'd360:delete', 'dc:delete']);
  assert.match(Delete.description, /identity-resolution:Individual_suffix/u);
  assert.match(Delete.description, /ID\/name absence/u);
  assert.match(Delete.description, /physical profile\/output cleanup remain unverified/u);
});
