import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeRelationshipDefinition } from '../lib/artifacts/write-relationship-definition.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';

const xml =
  '<FieldSrcTrgtRelationship>\n  <masterLabel>Exact &amp; opaque</masterLabel>\n</FieldSrcTrgtRelationship>\n';
/**
 * Create an owned isolated fixture, retained without recursive cleanup.
 * @returns {Promise<string>} New fixture root.
 */
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'relationship-output-test-'));
  await writeFile(path.join(root, 'ownership'), randomUUID(), { flag: 'wx' });
  return root;
}

test('definition writer uses configured package, exact bytes, repeat and overwrite consent', async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const first = await writeRelationshipDefinition('ParentLink', xml, root, false);
  assert.equal(
    first.path,
    path.join(
      root,
      'custom/main/default/fieldSrcTrgtRelationships/ParentLink.fieldSrcTrgtRelationship-meta.xml',
    ),
  );
  assert.equal(await readFile(first.path, 'utf8'), xml);
  const repeat = await writeRelationshipDefinition('ParentLink', xml, root, false);
  assert.equal(repeat.outcome, 'unchanged');
  await assert.rejects(writeRelationshipDefinition('ParentLink', xml + '\n', root, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  assert.equal(await readFile(first.path, 'utf8'), xml);
  const replacement = await writeRelationshipDefinition('ParentLink', xml + '\n', root, true);
  assert.equal(replacement.outcome, 'retrieved');
  // Standard XML remains outside the unchanged operational deploy input allowlist.
  await assert.rejects(readDeployInputs({ sourceDir: [first.path], cwd: root }));
  const deploy = Object.create(Deploy.prototype);
  deploy.parse = async () => ({
    flags: {
      'source-dir': [first.path],
      'api-version': '65.0',
      'data-space': 'default',
      preview: false,
      'target-org': {
        getOrgId: () => assert.fail('definition-only input must fail before org use'),
      },
    },
  });
  deploy.jsonEnabled = () => true;
  deploy.resolveInputs = readDeployInputs;
  deploy.execute = () => assert.fail('definition-only input must never mutate');
  const previousExit = process.exitCode;
  try {
    const result = await deploy.run();
    assert.equal(result.status, 'blocked');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExit;
  }
});

for (const mode of ['directory', 'hardlink', 'junction']) {
  test(`definition writer refuses ${mode} without replacing existing entries`, async () => {
    const root = await fixture();
    const directory = path.join(root, 'force-app/main/default/fieldSrcTrgtRelationships');
    const file = path.join(directory, 'ParentLink.fieldSrcTrgtRelationship-meta.xml');
    if (mode === 'junction') {
      const outside = path.join(root, 'outside');
      await mkdir(outside);
      await symlink(
        outside,
        path.join(root, 'force-app'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } else {
      await mkdir(directory, { recursive: true });
      if (mode === 'directory') await mkdir(file);
      else {
        await writeFile(file, 'original');
        await link(file, path.join(directory, 'alias'));
      }
    }
    await assert.rejects(writeRelationshipDefinition('ParentLink', xml, root, true), {
      code: 'UNSAFE_PATH',
    });
    if (mode === 'hardlink') assert.equal(await readFile(file, 'utf8'), 'original');
  });
}

test('definition writer rejects invalid identity, empty/oversize content and escaping project config', async () => {
  const root = await fixture();
  await assert.rejects(writeRelationshipDefinition('../escape', xml, root, false), {
    code: 'INVALID_SELECTION',
  });
  for (const value of ['', 'x'.repeat(1_048_577)])
    await assert.rejects(writeRelationshipDefinition('ParentLink', value, root, false), {
      code: 'INVALID_DEFINITION',
    });
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: '../escape' }] }),
  );
  await assert.rejects(writeRelationshipDefinition('ParentLink', xml, root, false));
});
