import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { GitSelectionError, selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { verifySegmentInputDigest } from '../lib/artifacts/read-deploy-input.js';

const segment = async (cwd) => {
  const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
  const value = {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: 'Audience' },
    spec: {
      displayName: 'Audience',
      description: 'Description',
      segmentType: 'DBT',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
      models: [{ name: 'Audience', sql }],
      dependencies: [
        { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
      ],
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
    },
  };
  const xml = `<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;${sql}&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;</includeCriteria><masterLabel>Audience</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>`;
  return writeSegmentDocument(value, xml, cwd, false);
};

const execute = promisify(execFile);
const relative = (name) => `data360/default/dmo/${name}__dlm.json`;
const document = (name, dataSpace = 'default') => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace, apiName: `${name}__dlm` },
  spec: {
    label: name,
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
const git = async (cwd, ...arguments_) => {
  const result = await execute('git', arguments_, { cwd, windowsHide: true });
  return result.stdout.trim();
};
const put = async (cwd, file, value) => {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), typeof value === 'string' ? value : JSON.stringify(value));
};
const commit = async (cwd) => {
  await git(cwd, 'add', '--all');
  await git(cwd, 'commit', '-m', 'Synthetic selection fixture');
  return git(cwd, 'rev-parse', 'HEAD');
};
const fixture = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-git-selection-'));
  await writeFile(path.join(cwd, '.run-owner'), randomUUID());
  await git(cwd, 'init', '--initial-branch=main');
  await git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  await git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  await git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  await git(cwd, 'config', '--local', 'core.autocrlf', 'false');
  await git(cwd, 'config', '--local', 'diff.renames', 'false');
  await commit(cwd);
  return cwd;
};
const refusal = (code) => (error) => error instanceof GitSelectionError && error.code === code;

for (const member of ['path', 'companionPath', 'both']) {
  for (const phase of ['committed', 'index', 'worktree', 'untracked']) {
    test(`Segment ${member} ${phase} changes select one byte-bound pair with DMO`, async () => {
      const cwd = await fixture();
      const p = await segment(cwd);
      const base = phase === 'untracked' ? await git(cwd, 'rev-parse', 'HEAD') : await commit(cwd);
      for (const key of member === 'both' ? ['path', 'companionPath'] : [member]) {
        const { readFile } = await import('node:fs/promises');
        await writeFile(p[key], (await readFile(p[key], 'utf8')) + '\n');
      }
      if (phase === 'index' || phase === 'committed') await git(cwd, 'add', '--all');
      if (phase === 'committed') await commit(cwd);
      await put(cwd, relative('Added'), document('Added'));
      const result = await selectGitDeployInputs({ cwd, ref: base });
      assert.equal(result.paths.length, 2);
      assert.ok(result.paths.includes(p.path));
      assert.equal(result.segments.length, 1);
      assert.equal(result.segments[0].companionPath, p.companionPath);
      assert.ok(Object.isFrozen(result.segments));
      assert.ok(Object.isFrozen(result.segments[0]));
      await verifySegmentInputDigest(result.segments[0]);
      const { readFile } = await import('node:fs/promises');
      for (const key of ['path', 'companionPath']) {
        const original = await readFile(p[key]);
        await writeFile(p[key], Buffer.concat([original, Buffer.from('\n')]));
        await assert.rejects(verifySegmentInputDigest(result.segments[0]));
        await writeFile(p[key], original);
      }
    });
  }
}

for (const member of ['path', 'companionPath']) {
  for (const phase of ['committed', 'index', 'worktree']) {
    for (const action of ['delete', 'rename']) {
      test(`Segment ${member} ${phase} ${action} blocks otherwise valid DMO`, async () => {
        const cwd = await fixture();
        const p = await segment(cwd);
        const base = await commit(cwd);
        await (action === 'delete'
          ? unlink(p[member])
          : rename(p[member], path.join(cwd, 'outside.json')));
        if (phase !== 'worktree') await git(cwd, 'add', '--all');
        if (phase === 'committed') await commit(cwd);
        await put(cwd, relative('Added'), document('Added'));
        await assert.rejects(
          selectGitDeployInputs({ cwd, ref: base }),
          refusal('BLOCKED_GIT_LIFECYCLE'),
        );
      });
    }
  }
  test(`Segment missing untracked ${member} blocks otherwise valid DMO`, async () => {
    const cwd = await fixture();
    const p = await segment(cwd);
    await unlink(p[member]);
    await put(cwd, relative('Added'), document('Added'));
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: 'HEAD' }),
      refusal('INVALID_GIT_SELECTION'),
    );
  });
}

test('Segment Git selection honors configured package and refuses aliased or duplicate pair paths', async () => {
  const cwd = await fixture();
  await put(cwd, 'sfdx-project.json', {
    packageDirectories: [{ path: 'custom space', default: true }],
  });
  const p = await segment(cwd);
  const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(result.paths, [p.path]);
  const { readFile } = await import('node:fs/promises');
  await put(
    cwd,
    'other/main/default/data360/segments/Audience.segment.json',
    await readFile(p.companionPath, 'utf8'),
  );
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});

for (const mode of ['identity', 'duplicate-key', 'nested', 'suffix-case', 'junction', 'hardlink']) {
  test(`Segment Git pair admission rejects ${mode} without dropping it`, async () => {
    const cwd = await fixture();
    const p = await segment(cwd);
    const { readFile, link } = await import('node:fs/promises');
    const text = await readFile(p.companionPath, 'utf8');
    if (mode === 'identity')
      await writeFile(p.companionPath, text.replace('"Audience"', '"Other"'));
    if (mode === 'duplicate-key')
      await writeFile(
        p.companionPath,
        text.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'),
      );
    if (mode === 'nested') {
      await put(cwd, 'force-app/main/default/data360/segments/nested/Audience.segment.json', text);
    }
    if (mode === 'suffix-case')
      await rename(p.companionPath, p.companionPath.replace('.segment.json', '.SEGMENT.JSON'));
    if (mode === 'junction') {
      const directory = path.dirname(p.companionPath);
      await rename(directory, path.join(cwd, 'outside'));
      await symlink(path.join(cwd, 'outside'), directory, 'junction');
    }
    if (mode === 'hardlink') await link(p.companionPath, path.join(cwd, 'alias.json'));
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: 'HEAD' }),
      refusal('INVALID_GIT_SELECTION'),
    );
  });
}

test('Git selector combines committed, index, worktree and untracked paths from nested cwd', async () => {
  const cwd = await fixture();
  const base = await git(cwd, 'rev-parse', 'HEAD');
  await put(cwd, relative('Committed'), document('Committed'));
  await commit(cwd);
  await put(cwd, relative('Staged'), document('Staged'));
  await git(cwd, 'add', '--', relative('Staged'));
  await put(cwd, relative('Committed'), {
    ...document('Committed'),
    spec: { ...document('Committed').spec, label: 'Changed' },
  });
  await put(cwd, relative('Untracked'), document('Untracked'));
  await put(cwd, 'unrelated space ü.txt', 'ignored');
  const nested = path.join(cwd, 'nested space ü');
  await mkdir(nested);
  const result = await selectGitDeployInputs({ cwd: nested, ref: base });
  assert.deepEqual(
    result.paths,
    ['Committed', 'Staged', 'Untracked'].map((name) => path.join(cwd, relative(name))),
  );
  assert.equal(path.resolve(result.provenance.repositoryRoot), cwd);
  assert.equal(result.provenance.referenceCommit, base);
  assert.equal(result.provenance.mergeBase, base);
  assert.equal(result.provenance.headCommit, await git(cwd, 'rev-parse', 'HEAD'));
});

test('Git selector uses a unique merge base rather than the requested branch tip', async () => {
  const cwd = await fixture();
  const base = await git(cwd, 'rev-parse', 'HEAD');
  await git(cwd, 'checkout', '-b', 'other');
  await put(cwd, relative('Other'), document('Other'));
  const other = await commit(cwd);
  await git(cwd, 'checkout', 'main');
  await put(cwd, relative('Main'), document('Main'));
  await commit(cwd);
  const result = await selectGitDeployInputs({ cwd, ref: 'other' });
  assert.equal(result.provenance.referenceCommit, other);
  assert.equal(result.provenance.mergeBase, base);
  assert.deepEqual(result.paths, [path.join(cwd, relative('Main'))]);
});

test('empty valid Git selection succeeds and unrelated Unicode changes are ignored', async () => {
  const cwd = await fixture();
  await put(cwd, 'space ü.txt', 'new');
  const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(result.paths, []);
});

test('modified unrelated tracked pathname D is not a deletion status', async () => {
  const cwd = await fixture();
  await put(cwd, 'D', 'before');
  await commit(cwd);
  await put(cwd, 'D', 'modified');
  await put(cwd, relative('Added'), document('Added'));
  const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(result.paths, [path.join(cwd, relative('Added'))]);
});

test('genuine unrelated tracked deletion still blocks an untracked DMO addition', async () => {
  const cwd = await fixture();
  await put(cwd, 'unrelated.txt', 'before');
  await commit(cwd);
  await unlink(path.join(cwd, 'unrelated.txt'));
  await put(cwd, relative('Added'), document('Added'));
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('BLOCKED_GIT_LIFECYCLE'),
  );
});

for (const phase of ['committed', 'index', 'worktree']) {
  for (const direction of ['inbound', 'outbound', 'within']) {
    test(`Git selector blocks ${phase} ${direction} rename with diff.renames=false`, async () => {
      const cwd = await fixture();
      const source = direction === 'inbound' ? 'outside space ü.json' : relative('Before');
      const target = direction === 'outbound' ? 'outside space ü.json' : relative('After');
      await put(cwd, source, document(direction === 'inbound' ? 'After' : 'Before'));
      const base = await commit(cwd);
      await mkdir(path.dirname(path.join(cwd, target)), { recursive: true });
      await rename(path.join(cwd, source), path.join(cwd, target));
      if (phase !== 'worktree') await git(cwd, 'add', '--all');
      if (phase === 'committed') await commit(cwd);
      await assert.rejects(
        selectGitDeployInputs({ cwd, ref: base }),
        refusal('BLOCKED_GIT_LIFECYCLE'),
      );
    });
  }
}

for (const phase of ['committed', 'index', 'worktree']) {
  test(`Git selector blocks ${phase} relevant deletion despite another valid addition`, async () => {
    const cwd = await fixture();
    await put(cwd, relative('Removed'), document('Removed'));
    const base = await commit(cwd);
    await unlink(path.join(cwd, relative('Removed')));
    await put(cwd, relative('Added'), document('Added'));
    if (phase !== 'worktree') await git(cwd, 'add', '--all');
    if (phase === 'committed') await commit(cwd);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: base }),
      refusal('BLOCKED_GIT_LIFECYCLE'),
    );
  });
}

for (const [file, value] of [
  [relative('Expected'), document('Different')],
  [relative('Expected'), document('Expected', 'other')],
  ['data360/default/dmo/nested/Expected__dlm.json', document('Expected')],
  ['data360/default/dmo/invalid space ü.json', document('Expected')],
  [relative('Expected'), '{"kind":"dmo","kind":"dmo"}'],
]) {
  test(`Git selector refuses noncanonical or invalid authored input ${file} ${JSON.stringify(value)}`, async () => {
    const cwd = await fixture();
    await put(cwd, file, value);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: 'HEAD' }),
      refusal('INVALID_GIT_SELECTION'),
    );
  });
}

test('Git selector refuses tracked directory link replacement before deployment', async () => {
  const cwd = await fixture();
  await put(cwd, relative('Linked'), document('Linked'));
  await commit(cwd);
  await rename(path.join(cwd, 'data360', 'default', 'dmo'), path.join(cwd, 'linked'));
  await symlink(path.join(cwd, 'linked'), path.join(cwd, 'data360', 'default', 'dmo'), 'junction');
  await put(cwd, 'linked/Linked__dlm.json', {
    ...document('Linked'),
    spec: { ...document('Linked').spec, label: 'Changed' },
  });
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), (error) => {
    // Linux Git reports the tracked child as deleted before no-link admission; Windows
    // can reach no-link admission first. Both exact refusals prevent deployment.
    assert.ok(refusal('BLOCKED_GIT_LIFECYCLE')(error) || refusal('INVALID_GIT_SELECTION')(error));
    return true;
  });
});

test('Git selector rejects a Git-visible untracked file link through no-link admission', async () => {
  const cwd = await fixture();
  await put(cwd, 'linked/Linked__dlm.json', document('Linked'));
  await mkdir(path.dirname(path.join(cwd, relative('Linked'))), { recursive: true });
  const target = path.join(cwd, 'linked/Linked__dlm.json');
  const member = path.join(cwd, relative('Linked'));
  // Windows file symlinks need privileges unavailable to normal developer processes.
  // A real hard link exercises the same strict no-link admission (nlink !== 1).
  await (process.platform === 'win32' ? link(target, member) : symlink(target, member, 'file'));
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});

test('Git selector rejects invalid refs without payload leakage', async () => {
  const cwd = await fixture();
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: '--output=secret' }),
    refusal('INVALID_GIT_SELECTION'),
  );
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'missing-private-ref' }), (error) => {
    assert.ok(refusal('INVALID_GIT_SELECTION')(error));
    assert.ok(!error.message.includes('missing-private-ref'));
    return true;
  });
  await assert.rejects(
    selectGitDeployInputs({ cwd: 'relative', ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});
