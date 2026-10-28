import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, unlink, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { readDeployInputs, verifySegmentInputDigest } from '../lib/artifacts/read-deploy-input.js';
import { preflightSegmentDeploy } from '../lib/services/preflight-segment-deploy.js';
import Deploy from '../lib/commands/data360/deploy.js';
const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
const document = () => ({
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
});
const xml = () =>
  `<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;${sql}&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;</includeCriteria><masterLabel>Audience</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>`;
const pair = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-a2a-test-'));
  return { cwd, ...(await writeSegmentDocument(document(), xml(), cwd, false)) };
};
const connection = { getApiVersion: () => '65.0' };
const acquire = async () => ({
  candidate: document(),
  blockers: [],
  expectations: { runtime: { segmentStatus: 'ACTIVE' } },
});

test('either pair member, overlapping directories and exact selector coalesce with immutable byte digest', async () => {
  const p = await pair();
  for (const options of [
    { sourceDir: [p.path] },
    { sourceDir: [p.companionPath] },
    { sourceDir: [path.dirname(p.path), path.dirname(p.companionPath)] },
    { metadata: ['segment:Audience', 'segment:Audience'] },
  ]) {
    const inputs = await readDeployInputs({ cwd: p.cwd, ...options });
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].path, p.path);
    assert.equal(inputs[0].companionPath, p.companionPath);
    assert.match(inputs[0].inputDigest, /^[a-f0-9]{64}$/u);
    assert.ok(Object.isFrozen(inputs[0].document.spec.models[0]));
    await verifySegmentInputDigest(inputs[0]);
  }
});
test('selector honors configured package directory', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-a2a-config-'));
  await writeFile(
    path.join(cwd, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const p = await writeSegmentDocument(document(), xml(), cwd, false);
  const inputs = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  assert.equal(inputs[0].path, p.path);
});
test('missing, divergent, duplicate-key, wrong-identity and invalid UTF8 companion blocks complete selection', async () => {
  for (const variant of ['missing', 'divergent', 'duplicate', 'identity', 'utf8']) {
    const p = await pair();
    switch (variant) {
      case 'missing': {
        await unlink(p.companionPath);
        break;
      }
      case 'divergent': {
        await writeFile(
          p.companionPath,
          JSON.stringify({ ...document(), spec: { ...document().spec, displayName: 'Different' } }),
        );
        break;
      }
      case 'duplicate': {
        await writeFile(
          p.companionPath,
          JSON.stringify(document()).replace(
            '"schemaVersion":1',
            '"schemaVersion":1,"schemaVersion":1',
          ),
        );
        break;
      }
      case 'identity': {
        await writeFile(
          p.companionPath,
          JSON.stringify({ ...document(), identity: { dataSpace: 'default', apiName: 'Other' } }),
        );
        break;
      }
      default: {
        await writeFile(p.companionPath, Buffer.from([0xff]));
      }
    }
    await assert.rejects(readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] }));
  }
});
test('modified XML or companion invalidates captured digest even when semantics remain equal', async () => {
  for (const member of ['path', 'companionPath']) {
    const p = await pair();
    const [input] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    await writeFile(p[member], (await readFile(p[member], 'utf8')) + '\n');
    await assert.rejects(verifySegmentInputDigest(input), { code: 'UNSAFE_SOURCE' });
  }
});
test('linked and hardlinked companions are refused without following or changing them', async () => {
  for (const mode of ['junction', 'hardlink']) {
    const p = await pair();
    const outside = await pair();
    if (mode === 'junction') {
      const linked = path.join(p.cwd, 'linked');
      await symlink(outside.cwd, linked, process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(
        readDeployInputs({
          cwd: p.cwd,
          sourceDir: [path.join(linked, path.relative(outside.cwd, outside.companionPath))],
        }),
      );
    } else {
      await unlink(p.companionPath);
      await link(outside.companionPath, p.companionPath);
      await assert.rejects(readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] }));
    }
  }
});
test('preview compares exact admitted semantics, reports processing for label/description updates only', async () => {
  for (const change of ['none', 'label', 'description', 'sql']) {
    const desired = document();
    if (change === 'label') desired.spec.displayName = 'Changed';
    if (change === 'description') desired.spec.description = 'Changed';
    if (change === 'sql') desired.spec.models[0].sql += ' ';
    const result = await preflightSegmentDeploy(desired, connection, '65.0', 'default', acquire);
    assert.equal(
      result.outcome,
      change === 'none' ? 'unchanged' : change === 'sql' ? 'blocked-changes' : 'update',
    );
    assert.deepEqual(
      result.requiredEffects,
      ['label', 'description'].includes(change) ? ['processing'] : [],
    );
    assert.equal(result.absenceProof, 'none');
  }
});
test('404, permission failure, metadata-shell ambiguity and malformed target never admit create', async () => {
  for (const acquisition of [
    async () => {
      throw { statusCode: 404 };
    },
    async () => {
      throw { statusCode: 403 };
    },
    async () => ({ blockers: ['SEGMENT_ACQUISITION_FAILED'] }),
    async () => ({
      ...(await acquire()),
      expectations: { runtime: { segmentStatus: 'PROCESSING' } },
    }),
    async () => ({
      ...(await acquire()),
      candidate: { ...document(), identity: { dataSpace: 'default', apiName: 'Other' } },
    }),
  ]) {
    const result = await preflightSegmentDeploy(
      document(),
      connection,
      '65.0',
      'default',
      acquisition,
    );
    assert.equal(result.outcome, 'blocked');
    assert.notEqual(result.target, 'absent');
    assert.equal(result.absenceProof, 'none');
  }
});
test('unsupported API/latest/space/input fail before any target read', async () => {
  for (const [value, version, space] of [
    [document(), 'latest', 'default'],
    [document(), '66.0', 'default'],
    [document(), '65.0', 'other'],
    [{}, '65.0', 'default'],
  ]) {
    const result = await preflightSegmentDeploy(value, connection, version, space, () =>
      assert.fail('No read'),
    );
    assert.equal(result.outcome, 'blocked');
  }
});
const commandSetup = (inputs, preview) => {
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview,
      'source-dir': ['synthetic'],
      'api-version': '65.0',
      'data-space': 'default',
      'target-org': { getOrgId: () => 'synthetic', getConnection: () => connection },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.verifySegmentInput = verifySegmentInputDigest;
  command.preflight = async () => ({
    outcome: 'create',
    target: 'absent',
    absenceProof: 'complete-inventory',
    diagnostics: [],
  });
  command.preflightSegment = (value, conn, api, space) =>
    preflightSegmentDeploy(value, conn, api, space, acquire);
  command.execute = () => assert.fail('Entire selection must block before any DMO writes');
  return command;
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};
test('mixed DMO plus Segment execution remains whole-selection blocked including unchanged Segment', async () => {
  const p = await pair();
  const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
  const command = commandSetup(
    [
      {
        path: 'dmo.json',
        document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'First__dlm' } },
      },
      ...inputs,
    ],
    false,
  );
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  assert.equal(
    result.result.items[1].preflight.diagnostics[0].code,
    'SEGMENT_EXECUTION_NOT_IMPLEMENTED',
  );
});
test('public Segment preview is read-only; drift during target acquisition prevents success', async () => {
  for (const drift of [false, true]) {
    const p = await pair();
    const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const command = commandSetup(inputs, true);
    if (drift)
      command.preflightSegment = async () => {
        await writeFile(p.companionPath, (await readFile(p.companionPath, 'utf8')) + '\n');
        return preflightSegmentDeploy(document(), connection, '65.0', 'default', acquire);
      };
    const result = await run(command);
    assert.equal(result.status, drift ? 'failed' : 'success');
    if (!drift) {
      assert.equal(result.result.items[0].family, 'segment');
      assert.equal(result.result.items[0].outcome, 'unchanged');
    }
  }
});
