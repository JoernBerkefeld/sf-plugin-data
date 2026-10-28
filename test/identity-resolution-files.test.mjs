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
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { writeIdentityResolutionDocument } from '../lib/artifacts/write-identity-resolution.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifyIdentityResolutionInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

const document = (name = 'Individual_A1b2') => {
  const { facade, native } = irFixture();
  facade.objectApiName = name;
  native.objectApiName = name;
  return projectIdentityResolution(facade, native, name).candidate;
};
const fixture = async (configured = false) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ir-files-'));
  await writeFile(path.join(root, 'ownership'), randomUUID());
  if (configured)
    await writeFile(
      path.join(root, 'sfdx-project.json'),
      JSON.stringify({
        packageDirectories: [{ path: 'custom', default: true }],
        sourceApiVersion: '65.0',
      }),
    );
  return root;
};
const rejects = (code) => (error) => error.code === code;
const git = (cwd, ...arguments_) =>
  execFileSync('git', arguments_, { cwd, encoding: 'utf8', windowsHide: true }).trim();

for (const configured of [false, true]) {
  test(`IR writer stable portable bytes and guarded overwrite configured=${configured}`, async () => {
    const cwd = await fixture(configured);
    const value = document();
    const receipt = await writeIdentityResolutionDocument(value, cwd, false);
    assert.equal(
      receipt.path,
      path.join(
        cwd,
        configured ? 'custom' : 'force-app',
        'main/default/data360/identityResolution/Individual_A1b2.identityResolution.json',
      ),
    );
    const bytes = await readFile(receipt.path);
    const before = await stat(receipt.path);
    const repeated = await writeIdentityResolutionDocument(value, cwd, false);
    const after = await stat(receipt.path);
    assert.equal(repeated.outcome, 'unchanged');
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(bytes.includes('synthetic-owner-id'), false);
    assert.equal(bytes.includes('Individual_A1b2'), true);
    assert.equal(JSON.parse(bytes).identity.apiName, 'Individual_A1b2');
    value.spec.label = 'Changed';
    await assert.rejects(
      writeIdentityResolutionDocument(value, cwd, false),
      rejects('OVERWRITE_REQUIRED'),
    );
    await writeIdentityResolutionDocument(value, cwd, true);
    assert.equal(JSON.parse(await readFile(receipt.path, 'utf8')).spec.label, 'Changed');
    const inputs = await readDeployInputs({
      cwd,
      metadata: ['identity-resolution:Individual_A1b2', 'identity-resolution:Individual_A1b2'],
    });
    assert.equal(inputs.length, 1);
    assert.ok(Object.isFrozen(inputs[0].document.spec.matchRules));
    assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
    await writeFile(receipt.path, (await readFile(receipt.path, 'utf8')) + '\n');
    await assert.rejects(verifyIdentityResolutionInputDigest(inputs[0]), rejects('UNSAFE_SOURCE'));
  });
}

test('IR legacy identity is refused by writer and file/Git admission without reinterpretation', async () => {
  const cwd = await fixture();
  const value = document();
  const legacy = structuredClone(value);
  legacy.identity = { dataSpace: 'default', logicalName: 'Individual_A1b2' };
  await assert.rejects(
    writeIdentityResolutionDocument(legacy, cwd, false),
    rejects('LEGACY_IDENTITY_RESOLUTION_IDENTITY_UNSUPPORTED'),
  );
  const receipt = await writeIdentityResolutionDocument(value, cwd, false);
  await writeFile(receipt.path, JSON.stringify(legacy));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    rejects('INVALID_SOURCE'),
  );
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', 'Synthetic legacy baseline');
  await writeFile(receipt.path, JSON.stringify(legacy) + '\n');
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }));
});

test('IR file admission rejects duplicate keys, mismatch, duplicate identity and hardlinks', async () => {
  const cwd = await fixture();
  const receipt = await writeIdentityResolutionDocument(document(), cwd, false);
  const bytes = await readFile(receipt.path, 'utf8');
  await writeFile(
    receipt.path,
    bytes.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'),
  );
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    rejects('INVALID_SOURCE'),
  );
  await writeFile(receipt.path, bytes.replaceAll('Individual_A1b2', 'Different'));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    rejects('INVALID_SOURCE'),
  );
  await writeFile(receipt.path, bytes);
  const other = path.join(
    cwd,
    'other/main/default/data360/identityResolution/Individual_A1b2.identityResolution.json',
  );
  await mkdir(path.dirname(other), { recursive: true });
  await writeFile(other, bytes);
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path, other] }),
    rejects('DUPLICATE_IDENTITY'),
  );
  await link(receipt.path, path.join(cwd, 'hardlink'));
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    rejects('UNSAFE_SOURCE'),
  );
  await assert.rejects(writeIdentityResolutionDocument(document(), cwd, true));
});

for (const operation of ['link', 'rename', 'unlink']) {
  test(`IR atomic ${operation} failure cannot return success`, async () => {
    const cwd = await fixture();
    const value = document();
    if (operation === 'rename') {
      await writeIdentityResolutionDocument(value, cwd, false);
      value.spec.label = 'Changed';
    }
    const publish = {
      link,
      rename,
      unlink,
      [operation]: async () => {
        throw new Error('synthetic I/O');
      },
    };
    await assert.rejects(
      writeIdentityResolutionDocument(value, cwd, true, publish),
      rejects(operation === 'unlink' ? 'PARTIAL_IDENTITY_RESOLUTION_OUTPUT' : 'OUTPUT_FAILED'),
    );
  });
}

for (const phase of ['untracked', 'index', 'committed', 'worktree']) {
  test(`IR Git ${phase} selection binds exact bytes and blocks deletion`, async () => {
    const cwd = await fixture(true);
    git(cwd, 'init', '--initial-branch=main');
    git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
    git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
    git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
    git(cwd, 'config', '--local', 'core.autocrlf', 'false');
    git(cwd, 'add', '--all');
    git(cwd, 'commit', '-m', 'Synthetic baseline');
    const receipt = await writeIdentityResolutionDocument(document(), cwd, false);
    if (phase === 'worktree') {
      git(cwd, 'add', '--all');
      git(cwd, 'commit', '-m', 'Synthetic file');
    }
    const base = git(cwd, 'rev-parse', 'HEAD');
    await writeFile(receipt.path, (await readFile(receipt.path, 'utf8')) + '\n');
    if (phase === 'index' || phase === 'committed') git(cwd, 'add', '--all');
    if (phase === 'committed') git(cwd, 'commit', '-m', 'Synthetic edit');
    const selected = await selectGitDeployInputs({ cwd, ref: base });
    assert.deepEqual(selected.paths, [receipt.path]);
    assert.equal(selected.identityResolutions.length, 1);
    await verifyIdentityResolutionInputDigest(selected.identityResolutions[0]);
    git(cwd, 'add', '--all');
    git(cwd, 'commit', '--allow-empty', '-m', 'Synthetic tracked');
    await unlink(receipt.path);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: base }),
      rejects('BLOCKED_GIT_LIFECYCLE'),
    );
  });
}

for (const preview of [true, false]) {
  for (const disappear of [true, false]) {
    test(`IR public deploy blocked before org reads preview=${preview} dropped=${disappear}`, async () => {
      const command = Object.create(Deploy.prototype);
      command.parse = async () => ({
        flags: {
          preview,
          'changed-since': 'HEAD',
          'api-version': '65.0',
          'data-space': 'default',
          'target-org': {
            getOrgId: () => {
              throw new Error('must not read org');
            },
          },
        },
      });
      command.jsonEnabled = () => true;
      const input = { path: 'ir', document: document(), inputDigest: 'a'.repeat(64) };
      command.selectGitInputs = async () => ({
        paths: ['ir'],
        identityResolutions: [input],
        provenance: {},
      });
      command.resolveInputs = async () => (disappear ? [] : [input]);
      const previous = process.exitCode;
      try {
        const result = await command.run();
        assert.equal(result.status, 'blocked');
        assert.equal(result.diagnostics.errors[0].code, 'IDENTITY_RESOLUTION_ROUTE_UNSUPPORTED');
      } finally {
        process.exitCode = previous;
      }
    });
  }
}

test('IR rejects linked ancestors, unsafe roots, directory targets and configured escapes', async () => {
  const cwd = await fixture();
  const elsewhere = await fixture();
  await symlink(
    elsewhere,
    path.join(cwd, 'force-app'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeIdentityResolutionDocument(document(), cwd, false));
  for (const root of ['', '.', path.parse(cwd).root, `${cwd}/../escape`, `${cwd}/*`])
    await assert.rejects(writeIdentityResolutionDocument(document(), root, false));
  const configured = await fixture();
  await writeFile(
    path.join(configured, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: '../escape', default: true }] }),
  );
  await assert.rejects(writeIdentityResolutionDocument(document(), configured, false));
  const clean = await fixture();
  const receipt = await writeIdentityResolutionDocument(document(), clean, false);
  await unlink(receipt.path);
  await mkdir(receipt.path);
  await assert.rejects(writeIdentityResolutionDocument(document(), clean, true));
});

test('IR Git renamed and noncanonical members cannot vanish', async () => {
  const cwd = await fixture();
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  const receipt = await writeIdentityResolutionDocument(document(), cwd, false);
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', 'Synthetic baseline');
  const base = git(cwd, 'rev-parse', 'HEAD');
  await rename(
    receipt.path,
    path.join(path.dirname(receipt.path), 'Renamed.identityResolution.json'),
  );
  git(cwd, 'add', '--all');
  await assert.rejects(selectGitDeployInputs({ cwd, ref: base }), rejects('BLOCKED_GIT_LIFECYCLE'));
  const other = await fixture();
  git(other, 'init', '--initial-branch=main');
  git(other, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  git(other, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git(other, 'config', '--local', 'commit.gpgsign', 'false');
  git(other, 'add', '--all');
  git(other, 'commit', '-m', 'Synthetic baseline');
  await writeFile(
    path.join(other, 'Unexpected.identityResolution.json'),
    JSON.stringify(document()),
  );
  await assert.rejects(
    selectGitDeployInputs({ cwd: other, ref: 'HEAD' }),
    rejects('INVALID_GIT_SELECTION'),
  );
});

test('IR public retrieve selector blocked before resolving org', async () => {
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['identity-resolution:Individual_A1b2'],
      'api-version': '65.0',
      'data-space': 'default',
    },
  });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => {
    throw new Error('must not resolve org');
  };
  const previous = process.exitCode;
  try {
    const result = await command.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'IDENTITY_RESOLUTION_ROUTE_UNSUPPORTED');
  } finally {
    process.exitCode = previous;
  }
});
