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

const segment = async (
  cwd,
  models = [{ name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
) => {
  const value = {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: 'Audience' },
    spec: {
      displayName: 'Audience',
      description: 'Description',
      segmentType: 'DBT',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
      models,
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
    },
  };
  return writeSegmentDocument(value, cwd, false);
};

const execute = promisify(execFile);
const relative = (name) => `data360/dmo/${name}__dlm.dmo-meta.json`;
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
const commit = async (cwd, ...files) => {
  if (files.length > 0) await git(cwd, 'add', '--', ...files);
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
  await commit(cwd, '.run-owner');
  return cwd;
};
const refusal = (code) => (error) => error instanceof GitSelectionError && error.code === code;

test('mapping XML is not admitted from mapping-only or mixed Git changes', async () => {
  const cwd = await fixture();
  const base = await git(cwd, 'rev-parse', 'HEAD');
  const mapping =
    'force-app/main/default/objectSourceTargetMaps/ExactMap.objectSourceTargetMap-meta.xml';
  await put(cwd, mapping, '<ObjectSourceTargetMap/>');
  const alone = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(alone.paths, []);
  await put(cwd, relative('Added'), document('Added'));
  const mixed = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(mixed.paths, [path.join(cwd, relative('Added'))]);
  assert.ok(!mixed.paths.some((file) => file.endsWith('.objectSourceTargetMap-meta.xml')));
});

for (const member of ['json', 'sql']) {
  for (const phase of ['committed', 'index', 'worktree', 'untracked']) {
    test(`Segment ${member} ${phase} changes select one byte-bound segment with DMO`, async () => {
      const cwd = await fixture();
      const p = await segment(cwd);
      const files = [p.path, ...p.codePaths];
      const base =
        phase === 'untracked' ? await git(cwd, 'rev-parse', 'HEAD') : await commit(cwd, ...files);
      const changed = member === 'json' ? p.path : p.codePaths[0];
      const { readFile } = await import('node:fs/promises');
      await writeFile(changed, (await readFile(changed, 'utf8')) + '\n');
      if (phase === 'index' || phase === 'committed') await git(cwd, 'add', '--', ...files);
      if (phase === 'committed') await commit(cwd);
      await put(cwd, relative('Added'), document('Added'));
      const result = await selectGitDeployInputs({ cwd, ref: base });
      assert.equal(result.paths.length, 2);
      assert.ok(result.paths.includes(p.path));
      assert.equal(result.segments.length, 1);
      assert.deepEqual(result.segments[0].codePaths, p.codePaths);
      assert.equal('companionPath' in result.segments[0], false);
      assert.ok(Object.isFrozen(result.segments));
      assert.ok(Object.isFrozen(result.segments[0]));
      if (member === 'sql')
        assert.ok(result.segments[0].document.spec.models[0].sql.endsWith('WHERE 1 = 0\n'));
      await verifySegmentInputDigest(result.segments[0]);
      for (const file of files) {
        const original = await readFile(file);
        await writeFile(file, Buffer.concat([original, Buffer.from('\n')]));
        await assert.rejects(verifySegmentInputDigest(result.segments[0]));
        await writeFile(file, original);
      }
    });
  }
}

test('a segment SQL file deleted with its model removed from the JSON is a change, not a delete', async () => {
  const cwd = await fixture();
  const p = await segment(cwd, [
    { name: 'First', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm' },
    { name: 'Second', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' },
  ]);
  const base = await commit(cwd, p.path, ...p.codePaths);
  const { readFile } = await import('node:fs/promises');
  const json = JSON.parse(await readFile(p.path, 'utf8'));
  json.spec.models.pop();
  await writeFile(p.path, `${JSON.stringify(json, undefined, 2)}\n`);
  await unlink(p.codePaths[1]);
  await git(cwd, 'add', '--', p.path, p.codePaths[1]);
  const result = await selectGitDeployInputs({ cwd, ref: base });
  assert.equal(result.deletions, undefined);
  assert.deepEqual(result.paths, [p.path]);
  assert.deepEqual(result.segments[0].codePaths, [p.codePaths[0]]);
});

for (const member of ['json', 'sql']) {
  for (const phase of ['committed', 'index', 'worktree']) {
    for (const action of ['delete', 'rename']) {
      // A committed or staged deletion is a delete candidate; a worktree deletion beside an
      // untracked addition and every rename still block.
      const blocks = action === 'rename' || phase === 'worktree';
      test(`Segment ${member} ${phase} ${action} ${blocks ? 'blocks' : 'is a delete candidate beside'} otherwise valid DMO`, async () => {
        const cwd = await fixture();
        const p = await segment(cwd);
        const files = [p.path, ...p.codePaths];
        const base = await commit(cwd, ...files);
        const moved = member === 'json' ? p.path : p.codePaths[0];
        // The whole set is deleted; a rename moves one of its files away.
        for (const file of files)
          await (action === 'delete' || file !== moved
            ? unlink(file)
            : rename(file, path.join(cwd, 'outside.json')));
        if (phase !== 'worktree')
          await git(
            cwd,
            'add',
            '--',
            ...files,
            ...(action === 'rename' ? [path.join(cwd, 'outside.json')] : []),
          );
        if (phase === 'committed') await commit(cwd);
        await put(cwd, relative('Added'), document('Added'));
        if (!blocks) {
          const selected = await selectGitDeployInputs({ cwd, ref: base });
          assert.deepEqual(selected.paths, [path.join(cwd, relative('Added'))]);
          assert.deepEqual(
            selected.deletions.map((deletion) => [
              deletion.family,
              deletion.identity.apiName,
              deletion.path,
              deletion.codePaths,
            ]),
            [['segment', 'Audience', p.path, p.codePaths]],
          );
          assert.equal(
            selected.deletions[0].document.spec.models[0].sql,
            'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0',
          );
          return;
        }
        await assert.rejects(
          selectGitDeployInputs({ cwd, ref: base }),
          refusal('BLOCKED_GIT_LIFECYCLE'),
        );
      });
    }
  }
}

for (const member of ['json', 'sql']) {
  test(`a segment with only its ${member} file deleted blocks`, async () => {
    const cwd = await fixture();
    const p = await segment(cwd);
    const base = await commit(cwd, p.path, ...p.codePaths);
    const gone = member === 'json' ? p.path : p.codePaths[0];
    await unlink(gone);
    if (member === 'json') {
      await git(cwd, 'add', '--', gone);
      await assert.rejects(
        selectGitDeployInputs({ cwd, ref: base }),
        refusal('BLOCKED_GIT_LIFECYCLE'),
      );
      return;
    }
    // The JSON still names the model, so its SQL file is missing: the segment is refused.
    await git(cwd, 'add', '--', gone);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: base }),
      refusal('INVALID_GIT_SELECTION'),
    );
  });
}

test('absent never-tracked Segment does not manufacture a Git selection', async () => {
  const cwd = await fixture();
  const p = await segment(cwd);
  for (const file of [p.path, ...p.codePaths]) await unlink(file);
  await put(cwd, relative('Added'), document('Added'));
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.equal(selected.segments, undefined);
  assert.deepEqual(selected.paths, [path.join(cwd, relative('Added'))]);
});

test('legacy Segment XML Git selection refuses rather than discovering or rewriting JSON', async () => {
  const cwd = await fixture();
  await segment(cwd);
  await put(
    cwd,
    'force-app/main/default/marketSegmentDefinitions/Audience.marketSegmentDefinition-meta.xml',
    '<stale/>',
  );
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});

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
    await readFile(p.path, 'utf8'),
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
    const text = await readFile(p.path, 'utf8');
    if (mode === 'identity') await writeFile(p.path, text.replace('"Audience"', '"Other"'));
    if (mode === 'duplicate-key')
      await writeFile(
        p.path,
        text.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'),
      );
    if (mode === 'nested') {
      await put(cwd, 'force-app/main/default/data360/segments/nested/Audience.segment.json', text);
    }
    if (mode === 'suffix-case')
      await rename(p.path, p.path.replace('.segment.json', '.SEGMENT.JSON'));
    if (mode === 'junction') {
      const directory = path.dirname(p.path);
      await rename(directory, path.join(cwd, 'outside'));
      await symlink(path.join(cwd, 'outside'), directory, 'junction');
    }
    if (mode === 'hardlink') await link(p.path, path.join(cwd, 'alias.json'));
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
  await commit(cwd, relative('Committed'));
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
  const other = await commit(cwd, relative('Other'));
  await git(cwd, 'checkout', 'main');
  await put(cwd, relative('Main'), document('Main'));
  await commit(cwd, relative('Main'));
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
  await commit(cwd, 'D');
  await put(cwd, 'D', 'modified');
  await put(cwd, relative('Added'), document('Added'));
  const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(result.paths, [path.join(cwd, relative('Added'))]);
});

test('Git selection admits a namespaced native DMO and never falls back to a legacy file', async () => {
  const cwd = await fixture();
  const standard = 'data360/dmo/ssot__Individual__dlm.dmo-meta.json';
  await put(cwd, standard, {
    ...document('Individual'),
    identity: { dataSpace: 'default', apiName: 'ssot__Individual__dlm' },
  });
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(selected.paths, [path.join(cwd, ...standard.split('/'))]);
  assert.equal(selected.paths[0].endsWith('.dmo-meta.json'), true);
});

test('genuine unrelated tracked deletion still blocks an untracked DMO addition', async () => {
  const cwd = await fixture();
  await put(cwd, 'unrelated.txt', 'before');
  await commit(cwd, 'unrelated.txt');
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
      const base = await commit(cwd, source);
      await mkdir(path.dirname(path.join(cwd, target)), { recursive: true });
      await rename(path.join(cwd, source), path.join(cwd, target));
      if (phase !== 'worktree') await git(cwd, 'add', '--', source, target);
      if (phase === 'committed') await commit(cwd);
      await assert.rejects(
        selectGitDeployInputs({ cwd, ref: base }),
        refusal('BLOCKED_GIT_LIFECYCLE'),
      );
    });
  }
}

for (const phase of ['committed', 'index', 'worktree']) {
  test(`Git selector ${phase === 'worktree' ? 'blocks' : 'carries'} ${phase} relevant deletion beside another valid addition`, async () => {
    const cwd = await fixture();
    await put(cwd, relative('Removed'), document('Removed'));
    const base = await commit(cwd, relative('Removed'));
    await unlink(path.join(cwd, relative('Removed')));
    await put(cwd, relative('Added'), document('Added'));
    if (phase !== 'worktree') await git(cwd, 'add', '--', relative('Removed'), relative('Added'));
    if (phase === 'committed') await commit(cwd);
    if (phase === 'worktree') {
      // An untracked addition beside a worktree deletion may be an undetected rename.
      await assert.rejects(
        selectGitDeployInputs({ cwd, ref: base }),
        refusal('BLOCKED_GIT_LIFECYCLE'),
      );
      return;
    }
    const selected = await selectGitDeployInputs({ cwd, ref: base });
    assert.deepEqual(selected.paths, [path.join(cwd, relative('Added'))]);
    assert.deepEqual(
      selected.deletions.map((deletion) => [deletion.family, deletion.identity.apiName]),
      [['dmo', 'Removed__dlm']],
    );
  });
}

for (const [file, value] of [
  [relative('Expected'), document('Different')],
  [
    relative('Expected'),
    { ...document('Expected'), spec: { label: 'Expected', category: 'Other' } },
  ],
  ['data360/dmo/nested/Expected__dlm.dmo-meta.json', document('Expected')],
  ['data360/dmo/invalid space ü.dmo-meta.json', document('Expected')],
  ['force-app/data360/dmo/Expected__dlm.dmo-meta.json', document('Expected')],
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

test('Git selector ignores a changed JSON file in the former default/dmo folder', async () => {
  const cwd = await fixture();
  const former = 'data360/default/dmo/Expected__dlm.json';
  await put(cwd, former, document('Expected'));
  const untracked = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(untracked.paths, []);
  await commit(cwd, former);
  await put(cwd, former, { ...document('Expected'), changed: true });
  await put(cwd, relative('Other'), document('Other'));
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(selected.paths, [path.join(cwd, relative('Other'))]);
});

test('Git selector refuses tracked directory link replacement before deployment', async () => {
  const cwd = await fixture();
  await put(cwd, relative('Linked'), document('Linked'));
  await commit(cwd, relative('Linked'));
  await rename(path.join(cwd, 'data360', 'dmo'), path.join(cwd, 'linked'));
  await symlink(path.join(cwd, 'linked'), path.join(cwd, 'data360', 'dmo'), 'junction');
  await put(cwd, 'linked/Linked__dlm.dmo-meta.json', {
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

const verbatimFile = (kind, apiName, reason, native) => ({
  schemaVersion: 1,
  kind,
  identity: { dataSpace: 'default', apiName },
  verbatim: { reason, native },
});
const ciJson = 'data360/calculatedInsights/Draft__cio.calculatedInsight-meta.json';
const ciSql = 'data360/calculatedInsights/Draft__cio.calculatedInsight-meta.sql';
const draft = verbatimFile('calculated-insight', 'Draft__cio', 'CI_DRAFT_WITHOUT_SQL', {});

test('a changed verbatim file in the range is skipped with a warning', async () => {
  const cwd = await fixture();
  const base = await git(cwd, 'rev-parse', 'HEAD');
  await put(cwd, relative('Raw'), verbatimFile('dmo', 'Raw__dlm', 'INVALID_DMO_FIELD', {}));
  await put(cwd, relative('Added'), document('Added'));
  const result = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(result.paths, [path.join(cwd, relative('Added'))]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /dmo Raw__dlm .*reason INVALID_DMO_FIELD/u);
});

test('a deleted verbatim insight needs no SQL file and is deleted by name', async () => {
  const cwd = await fixture();
  await put(cwd, ciJson, draft);
  // An SQL file left from an earlier normal retrieve may stay.
  await put(cwd, ciSql, 'SELECT 1\n');
  const base = await commit(cwd, ciJson, ciSql);
  await git(cwd, 'rm', '-q', '--', ciJson);
  await commit(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(
    selected.deletions.map((deletion) => [deletion.family, deletion.identity.apiName]),
    [['calculated-insight', 'Draft__cio']],
  );
  assert.equal(selected.deletions[0].companionPath, undefined);
  assert.equal(selected.deletions[0].document.verbatim.reason, 'CI_DRAFT_WITHOUT_SQL');
});

test('removing the leftover SQL file beside a verbatim insight is no deletion', async () => {
  const cwd = await fixture();
  await put(cwd, ciJson, draft);
  await put(cwd, ciSql, 'SELECT 1\n');
  const base = await commit(cwd, ciJson, ciSql);
  await git(cwd, 'rm', '-q', '--', ciSql);
  await commit(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.equal(selected.deletions, undefined);
  assert.deepEqual(selected.paths, []);
  assert.equal(selected.warnings.length, 1);
});
