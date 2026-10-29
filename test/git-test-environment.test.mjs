import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../scripts/run-tests.mjs', import.meta.url));

test('test runner isolates foreign hook repository state without changing its parent', async () => {
  const parentEnvironment = { ...process.env };
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-git-environment-'));
  await writeFile(path.join(root, '.run-owner'), randomUUID());
  const foreign = path.join(root, 'foreign');
  const child = path.join(root, 'child');
  await mkdir(foreign);
  await mkdir(child);
  const git = (...arguments_) =>
    execFileSync('git', arguments_, { cwd: foreign, encoding: 'utf8', windowsHide: true });
  git('init', '--initial-branch=main');
  await writeFile(path.join(foreign, 'foreign.txt'), 'foreign index blob\n');
  git('add', 'foreign.txt');
  const index = path.join(foreign, '.git', 'index');
  const indexBefore = await readFile(index);
  const fixture = path.join(root, 'fixture.test.mjs');
  await writeFile(
    fixture,
    `import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
test('synthetic repository commits use only their own index', () => {
  assert.equal(process.env.GIT_INDEX_FILE, undefined);
  assert.equal(process.env.GIT_DIR, undefined);
  assert.equal(process.env.GIT_WORK_TREE, undefined);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--initial-branch=main');
  git('config', '--local', 'user.name', 'Jörn Berkefeld');
  git('config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git('config', '--local', 'commit.gpgsign', 'false');
  writeFileSync('child.txt', 'child repository blob');
  git('add', 'child.txt');
  git('commit', '-m', 'Synthetic child fixture');
  assert.equal(git('ls-tree', '--name-only', 'HEAD'), 'child.txt');
  assert.equal(git('show', 'HEAD:child.txt'), 'child repository blob');
});
`,
  );
  const poisonedEnvironment = {
    ...process.env,
    GIT_INDEX_FILE: index,
    GIT_DIR: path.join(foreign, '.git'),
    GIT_WORK_TREE: foreign,
  };
  delete poisonedEnvironment.NODE_TEST_CONTEXT;
  delete poisonedEnvironment.NODE_TEST_WORKER_ID;
  const poisonedBefore = { ...poisonedEnvironment };
  const result = spawnSync(process.execPath, [runner, fixture], {
    cwd: child,
    env: poisonedEnvironment,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(await readFile(index), indexBefore);
  assert.deepEqual(poisonedEnvironment, poisonedBefore);
  assert.deepEqual({ ...process.env }, parentEnvironment);
  // Retain owned OS-temp evidence; no recursive deletion or outside-path cleanup.
});
