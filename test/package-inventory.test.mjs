import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPackageInventory } from '../scripts/package-inventory.mjs';

const sources = ['src/plugin.ts', 'src/services/nested/qualified.ts'];
const paths = [
  'LICENSE',
  'README.md',
  'package.json',
  'bin/run.js',
  'docs/artifact-format.md',
  'docs/capabilities.md',
  'docs/git-workflow.md',
  'docs/handover.md',
  'lib/plugin.js',
  'lib/plugin.d.ts',
  'lib/services/nested/qualified.js',
  'lib/services/nested/qualified.d.ts',
];
const artifact = (entries = paths) => ({
  entryCount: entries.length,
  files: entries.map((path) => ({ path })),
});
test('package inventory derives exact nested runtime/declaration pairs from sources', () => {
  verifyPackageInventory(sources, artifact());
});
for (const [name, entries] of [
  ['missing output', paths.slice(0, -1)],
  ['unexpected output', [...paths, 'lib/stale.js']],
  ['same-count secret substitution', [...paths.slice(0, -1), 'docs/credentials.json']],
  ['duplicate packed entry', [...paths.slice(0, -1), paths[0]]],
])
  test(`package inventory refuses ${name}`, () => {
    assert.throws(() => verifyPackageInventory(sources, artifact(entries)));
  });
test('package inventory refuses forged count and source escapes', () => {
  assert.throws(() => verifyPackageInventory(sources, { ...artifact(), entryCount: 32 }));
  assert.throws(() => verifyPackageInventory(['src/../secret.ts'], artifact()));
});
