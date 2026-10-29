import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeMappingDefinition } from '../lib/artifacts/write-mapping-definition.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
const xml =
  '<ObjectSourceTargetMap>\n  <unknown>opaque &amp; unchanged</unknown>\n</ObjectSourceTargetMap>\n';
/**
 * Create an owned retained temporary fixture.
 * @returns {Promise<string>} Fixture root.
 */
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mapping-output-test-'));
  await writeFile(path.join(root, 'ownership'), randomUUID(), { flag: 'wx' });
  return root;
}
test('mapping definition configured root exact bytes repeat overwrite and local deploy refusal before target use', async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const first = await writeMappingDefinition('ExactMap', xml, root, false);
  assert.equal(
    first.path,
    path.join(
      root,
      'custom/main/default/objectSourceTargetMaps/ExactMap.objectSourceTargetMap-meta.xml',
    ),
  );
  assert.equal(await readFile(first.path, 'utf8'), xml);
  const repeat = await writeMappingDefinition('ExactMap', xml, root, false);
  assert.equal(repeat.outcome, 'unchanged');
  await assert.rejects(writeMappingDefinition('ExactMap', xml + '\n', root, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  assert.equal(await readFile(first.path, 'utf8'), xml);
  const replacement = await writeMappingDefinition('ExactMap', xml + '\n', root, true);
  assert.equal(replacement.outcome, 'retrieved');
  assert.equal(await readFile(first.path, 'utf8'), xml + '\n');
  await assert.rejects(readDeployInputs({ sourceDir: [first.path], cwd: root }));
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'source-dir': [first.path],
      'api-version': '65.0',
      'data-space': 'default',
      preview: false,
      'target-org': { getOrgId: () => assert.fail('no target use') },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.execute = () => assert.fail('no mutation');
  const old = process.exitCode;
  try {
    const result = await command.run();
    assert.equal(result.status, 'blocked');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = old;
  }
});
for (const mode of ['directory', 'hardlink', 'junction'])
  test(`mapping writer refuses ${mode}`, async () => {
    const root = await fixture();
    const directory = path.join(root, 'force-app/main/default/objectSourceTargetMaps');
    const file = path.join(directory, 'ExactMap.objectSourceTargetMap-meta.xml');
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
    await assert.rejects(writeMappingDefinition('ExactMap', xml, root, true), {
      code: 'UNSAFE_PATH',
    });
    if (mode === 'hardlink') assert.equal(await readFile(file, 'utf8'), 'original');
  });
test('mapping writer rejects invalid names bounded bytes and escaped config', async () => {
  const root = await fixture();
  await assert.rejects(writeMappingDefinition('../escape', xml, root, false), {
    code: 'INVALID_SELECTION',
  });
  for (const value of ['', 'x'.repeat(1_048_577)])
    await assert.rejects(writeMappingDefinition('ExactMap', value, root, false), {
      code: 'INVALID_DEFINITION',
    });
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: '../escape' }] }),
  );
  await assert.rejects(writeMappingDefinition('ExactMap', xml, root, false));
});
