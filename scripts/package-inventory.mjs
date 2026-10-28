import assert from 'node:assert/strict';

/**
 * Require the complete publication inventory derived from authored TypeScript sources.
 * Noncompiled files stay explicitly allowlisted, never inferred from arbitrary output.
 * @param {string[]} sources Repository-relative TypeScript source paths.
 * @param {object} artifact Parsed npm pack receipt.
 * @returns {void} Throws for missing, unexpected or substituted package entries.
 */
export function verifyPackageInventory(sources, artifact) {
  const expected = [
    'LICENSE',
    'README.md',
    'package.json',
    'bin/run.js',
    'docs/artifact-format.md',
    'docs/capabilities.md',
    'docs/git-workflow.md',
    'docs/handover.md',
  ];
  for (const source of sources) {
    assert.match(source, /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/u);
    const base = source.slice(4, -3);
    expected.push(`lib/${base}.js`, `lib/${base}.d.ts`);
  }
  assert.equal(new Set(expected).size, expected.length, 'Duplicate expected package entry.');
  const actual = artifact.files.map((file) => file.path);
  assert.equal(artifact.entryCount, expected.length, 'Unexpected package entry count.');

  assert.deepEqual(
    actual.toSorted(),
    expected.toSorted(),
    'Package inventory differs from authored source inventory.',
  );
}
