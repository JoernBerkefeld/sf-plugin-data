import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, link, unlink, rename, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import {
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
  captureDeployInputDigest,
  isSupportedDeployInput,
} from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
// eslint-disable-next-line unicorn/no-null -- The file form keeps the wire null as returned.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`;
const root = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-input-test-'));
  await writeFile(path.join(cwd, '.run-owner'), randomUUID());
  return cwd;
};
/**
 * The JSON-plus-SQL file form of the qualified test insight.
 * @returns {object} File document.
 */
const native = () => ({
  apiName: 'SyntheticInsight__cio',
  dataSpace: 'default',
  definitionType: 'CALCULATED_METRIC',
  description: wireNull,
  displayName: 'Synthetic insight',
  expression,
  publishScheduleInterval: 'SYSTEM_MANAGED',
});
const put = async (cwd, value = native(), publication) =>
  writeNativeCalculatedInsightDocument(value, cwd, false, publication);
const json = (cwd) =>
  path.join(
    cwd,
    'data360',
    'calculatedInsights',
    'SyntheticInsight__cio.calculatedInsight-meta.json',
  );
const sql = (cwd) =>
  path.join(
    cwd,
    'data360',
    'calculatedInsights',
    'SyntheticInsight__cio.calculatedInsight-meta.sql',
  );

for (const member of ['path', 'companionPath']) {
  const label = member === 'path' ? 'JSON' : 'SQL';
  test(`CI reader accepts the ${label} file, joins both and detects byte drift`, async () => {
    const cwd = await root();
    const receipt = await put(cwd);
    const [input] = await readDeployInputs({ cwd, sourceDir: [receipt[member]] });
    assert.equal(input.path, json(cwd));
    assert.equal(input.companionPath, sql(cwd));
    assert.equal(input.native.expression, native().expression);
    assert.equal(await readFile(sql(cwd), 'utf8'), `${native().expression}\n`);
    // The planning view: identity and the DMO the SQL reads.
    assert.deepEqual(input.document, {
      kind: 'calculated-insight',
      identity: { dataSpace: 'default', apiName: 'SyntheticInsight__cio' },
      spec: { dependencies: [{ kind: 'dmo', dataSpace: 'default', apiName: table }] },
    });
    assert.equal(isSupportedDeployInput(input), true);
    assert.ok(Object.isFrozen(input.native));
    assert.ok(Object.isFrozen(input.document.spec.dependencies[0]));
    assert.equal(await captureDeployInputDigest(input), input.inputDigest);
    const both = await readDeployInputs({ cwd, sourceDir: [receipt.path, receipt.companionPath] });
    assert.equal(both.length, 1);
    const folder = await readDeployInputs({ cwd, sourceDir: ['data360'] });
    assert.equal(folder.length, 1);
    const selected = await readDeployInputs({
      cwd,
      metadata: ['calculated-insight:SyntheticInsight__cio'],
    });
    assert.equal(selected[0].inputDigest, input.inputDigest);
    await writeFile(receipt[member], `${await readFile(receipt[member], 'utf8')} `);
    await assert.rejects(verifyCalculatedInsightInputDigest(input), { code: 'UNSAFE_SOURCE' });
  });
  test(`CI ${label} file hard-linked blocks, missing is structural`, async () => {
    const cwd = await root();
    const receipt = await put(cwd);
    await link(receipt[member], path.join(cwd, 'linked'));
    await assert.rejects(readDeployInputs({ cwd, sourceDir: [receipt.path] }), {
      code: 'UNSAFE_SOURCE',
    });
    await unlink(path.join(cwd, 'linked'));
    await unlink(receipt[member]);
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: [receipt[member === 'path' ? 'companionPath' : 'path']] }),
      { code: 'INVALID_SOURCE' },
    );
  });
}

test('CI extra code file, SQL in the JSON, duplicate keys and identity mismatch never admit', async () => {
  const cwd = await root();
  await put(cwd);
  const extra = path.join(
    cwd,
    'data360',
    'calculatedInsights',
    'SyntheticInsight__cio.calculatedInsight-meta.other.sql',
  );
  await writeFile(extra, 'SELECT 1');
  for (const selection of [[json(cwd)], [sql(cwd)], ['data360']])
    await assert.rejects(readDeployInputs({ cwd, sourceDir: selection }), {
      code: 'INVALID_SOURCE',
    });
  await unlink(extra);
  const text = await readFile(json(cwd), 'utf8');
  for (const content of [
    text.replace('"apiName":', '"apiName":"SyntheticInsight__cio","apiName":'),
    text.replace('"apiName":', '"expression":"SELECT 1","apiName":'),
    text.replace('"SyntheticInsight__cio"', '"Other__cio"'),
    'not json',
  ]) {
    await writeFile(json(cwd), content);
    await assert.rejects(readDeployInputs({ cwd, sourceDir: [json(cwd)] }), {
      code: 'INVALID_SOURCE',
    });
  }
  await writeFile(json(cwd), text);
  // Any SQL is admitted: whether it works is Salesforce's decision.
  await writeFile(sql(cwd), 'SELECT 1 AS one__c FROM Other__dlm');
  const [input] = await readDeployInputs({ cwd, sourceDir: [json(cwd)] });
  assert.equal(input.native.expression, 'SELECT 1 AS one__c FROM Other__dlm');
  assert.deepEqual(input.document.spec.dependencies, [
    { kind: 'dmo', dataSpace: 'default', apiName: 'Other__dlm' },
  ]);
});

test('CI files outside data360/calculatedInsights and the old XML/JSON pair are not admitted', async () => {
  const cwd = await root();
  await put(cwd);
  await mkdir(path.join(cwd, 'data360', 'elsewhere'));
  const moved = path.join(
    cwd,
    'data360',
    'elsewhere',
    'SyntheticInsight__cio.calculatedInsight-meta.json',
  );
  await rename(json(cwd), moved);
  await assert.rejects(readDeployInputs({ cwd, sourceDir: [moved] }), {
    code: 'INVALID_SELECTION',
  });
  // The retired XML plus JSON form is recognised nowhere.
  const old = await root();
  const retired = [
    path.join(
      old,
      'force-app/main/default/mktCalcInsightObjectDefs/SyntheticInsight.mktCalcInsightObjectDef-meta.xml',
    ),
    path.join(old, 'data360/calculatedInsights/SyntheticInsight__cio.calculatedInsight.json'),
  ];
  for (const file of retired) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, file.endsWith('.xml') ? '<MktCalcInsightObjectDef/>' : '{}');
  }
  for (const file of retired)
    await assert.rejects(readDeployInputs({ cwd: old, sourceDir: [file] }));
  await assert.rejects(
    readDeployInputs({ cwd: old, metadata: ['calculated-insight:SyntheticInsight__cio'] }),
  );
});

test('CI publication failure and changed first member report partial output', async () => {
  for (const drift of [false, true]) {
    const cwd = await root();
    let calls = 0;
    await assert.rejects(
      put(cwd, native(), {
        rename,
        unlink,
        link: async (from, to) => {
          calls++;
          if (calls === 2) {
            if (!drift) throw new Error('synthetic');
            await writeFile(json(cwd), 'changed');
          }
          await link(from, to);
        },
      }),
      { code: 'PARTIAL_CI_OUTPUT' },
    );
  }
});

const execute = promisify(execFile);
const git = async (cwd, ...arguments_) => {
  const result = await execute('git', arguments_, { cwd, windowsHide: true });
  return result.stdout.trim();
};
const gitRoot = async () => {
  const cwd = await root();
  await git(cwd, 'init', '--initial-branch=main');
  await git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  await git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  await git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  await git(cwd, 'config', '--local', 'core.autocrlf', 'false');
  await git(cwd, 'add', '--', '.run-owner');
  await git(cwd, 'commit', '-m', 'Synthetic fixture');
  return cwd;
};
for (const member of ['path', 'companionPath']) {
  const label = member === 'path' ? 'JSON' : 'SQL';
  test(`Git selects the CI when only its ${label} file changed`, async () => {
    const cwd = await gitRoot();
    const receipt = await put(cwd);
    await git(cwd, 'add', '--', receipt.path, receipt.companionPath);
    await git(cwd, 'commit', '-m', 'Synthetic insight');
    const text = await readFile(receipt[member], 'utf8');
    await writeFile(
      receipt[member],
      member === 'path'
        ? `${text} `
        : text.replace('WHERE 1 = 0', `WHERE 1 = 0 AND ${device} IS NOT NULL`),
    );
    const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
    assert.deepEqual(result.paths, [receipt.path]);
    assert.equal(result.segments, undefined);
    assert.equal(result.calculatedInsights.length, 1);
    assert.equal(result.calculatedInsights[0].companionPath, receipt.companionPath);
    await verifyCalculatedInsightInputDigest(result.calculatedInsights[0]);
    await unlink(receipt[member]);
    await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), {
      code: 'BLOCKED_GIT_LIFECYCLE',
    });
  });
}
test('Git turns a deleted JSON and SQL pair into one delete candidate; one file alone blocks', async () => {
  const cwd = await gitRoot();
  const receipt = await put(cwd);
  await git(cwd, 'add', '--', receipt.path, receipt.companionPath);
  await git(cwd, 'commit', '-m', 'Synthetic insight');
  const base = await git(cwd, 'rev-parse', 'HEAD');
  await git(cwd, 'rm', '-q', '--', receipt.companionPath);
  await git(cwd, 'commit', '-m', 'SQL only');
  await assert.rejects(selectGitDeployInputs({ cwd, ref: base }), {
    code: 'BLOCKED_GIT_LIFECYCLE',
  });
  await git(cwd, 'rm', '-q', '--', receipt.path);
  await git(cwd, 'commit', '-m', 'Both');
  const result = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(result.paths, []);
  assert.equal(result.deletions.length, 1);
  const [deletion] = result.deletions;
  assert.equal(deletion.family, 'calculated-insight');
  assert.equal(deletion.path, receipt.path);
  assert.equal(deletion.companionPath, receipt.companionPath);
  assert.deepEqual(deletion.identity, { dataSpace: 'default', apiName: 'SyntheticInsight__cio' });
  assert.deepEqual(deletion.document.identity, deletion.identity);
  assert.deepEqual(deletion.document.spec.dependencies, [
    { kind: 'dmo', dataSpace: 'default', apiName: table },
  ]);
  assert.match(deletion.baseDigest, /^[a-f0-9]{64}$/u);
});
test('Git refuses noncanonical CI location and rename lifecycle', async () => {
  const cwd = await gitRoot();
  const receipt = await put(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.equal(selected.calculatedInsights.length, 1);
  await git(cwd, 'add', '--', receipt.path, receipt.companionPath);
  await git(cwd, 'commit', '-m', 'Synthetic insight');
  await mkdir(path.join(cwd, 'outside'));
  const moved = path.join(cwd, 'outside/SyntheticInsight__cio.calculatedInsight-meta.sql');
  await rename(receipt.companionPath, moved);
  await git(cwd, 'add', '--', receipt.companionPath, moved);
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), {
    code: 'BLOCKED_GIT_LIFECYCLE',
  });
});
