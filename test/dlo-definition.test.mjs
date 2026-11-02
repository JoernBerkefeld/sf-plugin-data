import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  link,
  rename,
  copyFile,
  readdir,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { retrieveDloSourceMetadata } from '../lib/transport/project-metadata.js';
import { writeDloDefinition } from '../lib/artifacts/write-dlo-definition.js';

const apiName = 'Probe__dll';
const files = [
  { path: `${apiName}.object-meta.xml`, xml: '<CustomObject />\n' },
  { path: 'fields/Id__c.field-meta.xml', xml: '<CustomField />\n' },
];
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-dlo-test-'));
const rejects = (code) => (error) => error.code === code;

/**
 * Simulate standard CLI decomposition in the isolated project.
 * @param {string[]} arguments_ Standard CLI arguments.
 * @param {string} cwd Owned project.
 * @returns {Promise<object>} Terminal standard receipt.
 */
async function standard(arguments_, cwd) {
  assert.equal(arguments_[4], `CustomObject:${apiName}`);
  const members = [];
  for (const file of files) {
    const filePath = path.join(cwd, 'force-app/main/default/objects', apiName, file.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.xml);
    members.push({
      type: file.path.startsWith('fields/') ? 'CustomField' : 'CustomObject',
      fullName: file.path.startsWith('fields/') ? `${apiName}.Id__c` : apiName,
      state: 'Created',
      filePath,
    });
  }
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      status: 0,
      result: { done: true, success: true, status: 'Succeeded', messages: [], files: members },
      warnings: [],
    }),
  };
}

test('DLO transport passes every numeric API65–68 unchanged and preserves object plus fields', async () => {
  for (const version of ['65.0', '66.0', '67.0', '68.0']) {
    const actual = await retrieveDloSourceMetadata(
      'source',
      apiName,
      version,
      async (arguments_, cwd) => {
        assert.equal(arguments_[arguments_.indexOf('--api-version') + 1], version);
        assert.equal(
          JSON.parse(await readFile(path.join(cwd, 'sfdx-project.json'), 'utf8')).sourceApiVersion,
          version,
        );
        return standard(arguments_, cwd);
      },
    );
    assert.deepEqual(actual, files);
  }
});

test('DLO transport rejects unrelated members, failed receipts, and invalid names before invocation', async () => {
  for (const change of ['member', 'status', 'path', 'duplicate', 'missing-object', 'warning']) {
    await assert.rejects(
      retrieveDloSourceMetadata('source', apiName, '68.0', async (arguments_, cwd) => {
        const receipt = await standard(arguments_, cwd);
        const envelope = JSON.parse(receipt.stdout);
        if (change === 'member') envelope.result.files[0].fullName = 'Other__dll';
        if (change === 'status') envelope.result.success = false;
        if (change === 'path') envelope.result.files[0].filePath = path.join(cwd, 'outside.xml');
        if (change === 'duplicate') envelope.result.files.push(envelope.result.files[0]);
        if (change === 'missing-object') envelope.result.files.shift();
        if (change === 'warning') envelope.warnings.push('incomplete');
        return { ...receipt, stdout: JSON.stringify(envelope) };
      }),
    );
  }
  for (const name of ['Probe__dlm', '../Probe__dll', '*__dll', ''])
    await assert.rejects(
      retrieveDloSourceMetadata('source', name, '68.0', () => assert.fail('must not invoke')),
    );
});

test('DLO writer honors configured source, unchanged, all-file replacement preflight and unsafe paths', async () => {
  const root = await scratch();
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const receipt = await writeDloDefinition(apiName, files, root, false);
  assert.equal(receipt.paths.length, 2);
  assert.ok(receipt.path.includes(`${path.sep}custom${path.sep}`));
  const repeated = await writeDloDefinition(apiName, files, root, false);
  assert.equal(repeated.outcome, 'unchanged');
  const changed = files.map((file) => ({ ...file, xml: `${file.xml}changed` }));
  await assert.rejects(
    writeDloDefinition(apiName, changed, root, false),
    rejects('OVERWRITE_REQUIRED'),
  );
  assert.equal(await readFile(receipt.path, 'utf8'), files[0].xml);
  await writeDloDefinition(apiName, changed, root, true);
  assert.equal(await readFile(receipt.paths[1], 'utf8'), changed[1].xml);
  await assert.rejects(
    writeDloDefinition(apiName, [{ ...files[0], path: '../outside.xml' }], root, true),
  );
  const linked = await scratch();
  await symlink(
    root,
    path.join(linked, 'force-app'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeDloDefinition(apiName, files, linked, false), rejects('UNSAFE_PATH'));
});

test('DLO cross-device publication retains no-clobber creation and replacement', async () => {
  const root = await scratch();
  const crossDevice = {
    copyFile,
    link: async (source, destination) => {
      if (path.dirname(source) !== path.dirname(destination))
        throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      return link(source, destination);
    },
    rename: async (source, destination) => {
      if (path.dirname(source) !== path.dirname(destination))
        throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      return rename(source, destination);
    },
  };
  const first = await writeDloDefinition(apiName, files, root, false, crossDevice);
  const changed = files.map((file) => ({ ...file, xml: `${file.xml}replacement` }));
  await writeDloDefinition(apiName, changed, root, true, crossDevice);
  assert.equal(await readFile(first.path, 'utf8'), changed[0].xml);
  const entries = await readdir(path.dirname(first.path));
  assert.ok(entries.every((name) => !name.endsWith('.tmp')));
});

test('public DLO route bypasses DMO and ingestion services, deduplicates and retains requested pin', async () => {
  for (const version of ['65.0', '66.0', '67.0', '68.0']) {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: {
        metadata: [`dlo:${apiName}`, `dlo:${apiName}`],
        'api-version': version,
        'data-space': 'default',
        'target-org': 'source',
        'output-dir': await scratch(),
        overwrite: false,
      },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'source-id', getConnection: () => ({}) });
    command.acquire =
      command.acquireIngestionDlo =
      command.selectDocuments =
        () => assert.fail('unrelated service');
    command.writeDlo = writeDloDefinition;
    let calls = 0;
    command.acquireDloXml = async (target, name, pin) => {
      calls++;
      assert.equal(pin, version);
      assert.equal(name, apiName);
      assert.equal(target, 'source');
      return files;
    };
    const envelope = await command.run();
    assert.equal(envelope.status, 'success');
    assert.equal(calls, 1);
    assert.deepEqual(envelope.result.selection, [`dlo:${apiName}`]);
    assert.equal(envelope.result.items[0].routes[0].apiVersion, version);
    assert.equal(envelope.result.items[0].paths.length, 2);
  }
});

test('public DLO rejects unsupported inventory, dependencies, scopes and pins before auth', async () => {
  for (const flags of [
    { metadata: ['dlo'] },
    { metadata: ['dlo:../Probe__dll'] },
    { 'api-version': 'auto' },
    { 'api-version': 'latest' },
    { 'api-version': '64.0' },
    { 'include-dependencies': true },
    { 'data-space': 'other' },
  ]) {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: {
        metadata: [`dlo:${apiName}`],
        'api-version': '68.0',
        'data-space': 'default',
        ...flags,
      },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = () => assert.fail('must block before auth');
    const envelope = await command.run();
    assert.equal(envelope.status, 'blocked');
    process.exitCode = 0;
  }
});
