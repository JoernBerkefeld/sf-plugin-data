import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, link, unlink, rename, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCalculatedInsightPair } from '../lib/artifacts/calculated-insight-document.js';
import { writeCalculatedInsightDocument } from '../lib/artifacts/write-calculated-insight.js';
import {
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
  captureDeployInputDigest,
  isSupportedDeployInput,
} from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
// eslint-disable-next-line unicorn/no-null -- Qualified synthetic CI configuration preserves wire null.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const candidate = () => ({
  schemaVersion: 1,
  kind: 'calculated-insight',
  identity: { dataSpace: 'default', apiName: 'SyntheticInsight__cio' },
  spec: {
    displayName: 'Synthetic insight',
    expression: `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`,
    creationType: 'Custom',
    definitionType: 'CALCULATED_METRIC',
    definitionStatus: 'IN_USE',
    description: wireNull,
    isEnabled: true,
    subType: wireNull,
    publishScheduleInterval: 'SYSTEM_MANAGED',
    publishScheduleStartDateTime: wireNull,
    publishScheduleEndDate: wireNull,
    dimensions: [
      {
        apiName: 'app_id__c',
        creationType: 'Custom',
        dataType: 'Text',
        dateGranularity: wireNull,
        displayName: 'app_id',
        fieldRole: 'DIMENSION',
        formula: application,
      },
    ],
    measures: [
      {
        apiName: 'device_count__c',
        creationType: 'Custom',
        dataType: 'Number',
        displayName: 'device_count',
        fieldAggregationType: 'NONAGGREGATABLE',
        fieldRole: 'MEASURE',
        formula: `APPROX_COUNT_DISTINCT(${device})`,
      },
    ],
    dependencies: [
      {
        kind: 'dmo',
        dataSpace: 'default',
        apiName: table,
        fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'],
      },
    ],
  },
});
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xml = (value = candidate()) =>
  `<MktCalcInsightObjectDef xmlns="http://soap.sforce.com/2006/04/metadata"><creationType>Custom</creationType><expression>${escape(value.spec.expression)}</expression><masterLabel>${escape(value.spec.displayName)}</masterLabel></MktCalcInsightObjectDef>\n`;
const root = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-pair-test-'));
  await writeFile(path.join(cwd, '.run-owner'), randomUUID());
  return cwd;
};
const put = async (cwd, value = candidate(), publish) =>
  writeCalculatedInsightDocument(value, xml(value), cwd, false, publish);

test('CI pair correlates exact member SQL and label without SOAP fullName', () => {
  assert.deepEqual(
    validateCalculatedInsightPair(candidate(), xml(), 'SyntheticInsight'),
    candidate(),
  );
  for (const content of [
    xml().replace('<creationType>', '<unknown>'),
    xml().replace('</creationType>', '</creationType><creationType>Custom</creationType>'),
    xml().replace(
      '</MktCalcInsightObjectDef>',
      '<fullName>SyntheticInsight</fullName></MktCalcInsightObjectDef>',
    ),
    xml().replace('WHERE 1 = 0', 'WHERE 1 = 1'),
    xml().replace('Synthetic insight', 'Different'),
    `<!DOCTYPE x>${xml()}`,
    xml().replace('Custom', '&#0;'),
    xml().replace('Custom', '&#xD800;'),
  ])
    assert.throws(() => validateCalculatedInsightPair(candidate(), content, 'SyntheticInsight'));
  assert.throws(() => validateCalculatedInsightPair(candidate(), xml(), 'Wrong'));
  for (const character of ['\uFFFE', '\uFFFF', '\uD800', '\uDC00']) {
    const value = candidate();
    value.spec.displayName += character;
    assert.throws(() => validateCalculatedInsightPair(value, xml(value), 'SyntheticInsight'));
  }
  const value = candidate();
  value.spec.displayName = 'A & B < C';
  assert.deepEqual(validateCalculatedInsightPair(value, xml(value), 'SyntheticInsight'), value);
});

test('CI writer publishes canonical configured pair byte-stably and refuses clobber', async () => {
  const cwd = await root();
  await writeFile(
    path.join(cwd, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const receipt = await put(cwd);
  assert.equal(
    receipt.path,
    path.join(
      cwd,
      'custom/main/default/mktCalcInsightObjectDefs/SyntheticInsight.mktCalcInsightObjectDef-meta.xml',
    ),
  );
  assert.equal(await readFile(receipt.path, 'utf8'), xml());
  const repeated = await put(cwd);
  assert.equal(repeated.outcome, 'unchanged');
  const changed = candidate();
  changed.spec.displayName = 'Changed';
  await assert.rejects(put(cwd, changed), { code: 'OVERWRITE_REQUIRED' });
  const updated = await writeCalculatedInsightDocument(changed, xml(changed), cwd, true);
  assert.equal(updated.outcome, 'retrieved');
});

for (const member of ['path', 'companionPath']) {
  test(`CI reader accepts ${member}, freezes complete digest and detects byte drift`, async () => {
    const cwd = await root();
    const receipt = await put(cwd);
    const [input] = await readDeployInputs({ cwd, sourceDir: [receipt[member]] });
    assert.equal(input.document.kind, 'calculated-insight');
    assert.equal(isSupportedDeployInput(input), true);
    assert.ok(Object.isFrozen(input.document.spec.dimensions[0]));
    assert.equal(await captureDeployInputDigest(input), input.inputDigest);
    const both = await readDeployInputs({ cwd, sourceDir: [receipt.path, receipt.companionPath] });
    assert.equal(both.length, 1);
    const selected = await readDeployInputs({
      cwd,
      metadata: ['calculated-insight:SyntheticInsight__cio'],
    });
    assert.equal(selected[0].inputDigest, input.inputDigest);
    await writeFile(receipt[member], `${await readFile(receipt[member], 'utf8')}\n`);
    await assert.rejects(verifyCalculatedInsightInputDigest(input), { code: 'UNSAFE_SOURCE' });
  });
  test(`CI ${member} missing or hard-linked blocks admission and writer`, async () => {
    const cwd = await root();
    const receipt = await put(cwd);
    await link(receipt[member], path.join(cwd, 'linked'));
    await assert.rejects(readDeployInputs({ cwd, sourceDir: [receipt.path] }));
    await assert.rejects(put(cwd));
    await unlink(path.join(cwd, 'linked'));
    await unlink(receipt[member]);
    await assert.rejects(
      readDeployInputs({ cwd, sourceDir: [receipt[member === 'path' ? 'companionPath' : 'path']] }),
    );
  });
}

test('CI duplicate JSON keys and mismatched pairs never admit', async () => {
  const cwd = await root();
  const receipt = await put(cwd);
  const text = await readFile(receipt.companionPath, 'utf8');
  await writeFile(
    receipt.companionPath,
    text.replace('"kind":', '"kind":"calculated-insight","kind":'),
  );
  await assert.rejects(readDeployInputs({ cwd, sourceDir: [receipt.path] }), {
    code: 'INVALID_SOURCE',
  });
});

test('CI publication failure and changed first member report partial output', async () => {
  for (const drift of [false, true]) {
    const cwd = await root();
    let calls = 0;
    await assert.rejects(
      put(cwd, candidate(), {
        rename,
        unlink,
        link: async (from, to) => {
          calls++;
          if (calls === 2) {
            if (!drift) throw new Error('synthetic');
            await writeFile(
              path.join(
                path.dirname(path.dirname(path.dirname(to))),
                'mktCalcInsightObjectDefs/SyntheticInsight.mktCalcInsightObjectDef-meta.xml',
              ),
              'changed',
            );
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
  await git(cwd, 'add', '--all');
  await git(cwd, 'commit', '-m', 'Synthetic fixture');
  return cwd;
};
for (const member of ['path', 'companionPath']) {
  test(`Git captures CI ${member} changes as one pair, never Segment`, async () => {
    const cwd = await gitRoot();
    const receipt = await put(cwd);
    await git(cwd, 'add', '--all');
    await git(cwd, 'commit', '-m', 'Synthetic pair');
    await writeFile(receipt[member], `${await readFile(receipt[member], 'utf8')}\n`);
    const result = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
    assert.deepEqual(result.paths, [receipt.path]);
    assert.equal(result.segments, undefined);
    assert.equal(result.calculatedInsights.length, 1);
    await verifyCalculatedInsightInputDigest(result.calculatedInsights[0]);
    await unlink(receipt[member]);
    await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), {
      code: 'BLOCKED_GIT_LIFECYCLE',
    });
  });
}
test('Git refuses noncanonical CI location and rename lifecycle', async () => {
  const cwd = await gitRoot();
  const receipt = await put(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.equal(selected.calculatedInsights.length, 1);
  await git(cwd, 'add', '--all');
  await git(cwd, 'commit', '-m', 'Synthetic pair');
  await mkdir(path.join(cwd, 'outside'));
  await rename(
    receipt.companionPath,
    path.join(cwd, 'outside/SyntheticInsight__cio.calculatedInsight.json'),
  );
  await git(cwd, 'add', '--all');
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), {
    code: 'BLOCKED_GIT_LIFECYCLE',
  });
});
