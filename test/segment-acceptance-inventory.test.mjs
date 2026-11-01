import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindCollectedArtifact,
  collectArtifactEvidence,
} from '../scripts/segment-acceptance-inventory.mjs';

for (const collect of [collectArtifactEvidence, bindCollectedArtifact]) {
  test(`${collect.name} refuses unsupported traversal on Windows and other platforms`, () => {
    assert.throws(
      () =>
        collect({
          sourceRoot: String.raw`C:\untrusted`,
          installRoot: String.raw`C:\untrusted`,
          tarballPath: String.raw`C:\untrusted`,
        }),
      {
        message: 'SEGMENT_INVENTORY_REFUSED',
      },
    );
  });

  test(`${collect.name} refuses without reading inputs or allocating file contents`, () => {
    const options = new Proxy(
      {},
      {
        get() {
          throw new Error('unexpected input access');
        },
      },
    );
    assert.throws(() => collect(options), { message: 'SEGMENT_INVENTORY_REFUSED' });
    assert.throws(
      () => collect({ sourceRoot: 'x'.repeat(100_000), tarballPath: 'x'.repeat(100_000) }),
      {
        message: 'SEGMENT_INVENTORY_REFUSED',
      },
    );
  });
}
