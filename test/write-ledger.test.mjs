import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plugin } from '../lib/plugin.js';
import { WriteLedger } from '../lib/services/deploy-result.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { DloError } from '../lib/artifacts/dlo-document.js';

const rejectedBy = (status) => new NativeMappingError('MAPPING_HTTP_ERROR', status);

test('command results name the plugin by name and version only', () => {
  assert.deepEqual(Object.keys(plugin), ['name', 'version']);
  assert.equal(plugin.name, 'sf-plugin-data');
});

test('only a 4xx answer to the first write of an item is reported as rejected', async () => {
  // Nothing sent.
  assert.deepEqual(new WriteLedger().failure(new Error('read failed')), {
    outcome: 'blocked',
    mutation: 'not-attempted',
  });
  for (const status of [400, 401, 404, 409, 429]) {
    const ledger = new WriteLedger();
    const error = rejectedBy(status);
    await assert.rejects(
      ledger.run(async () => {
        throw error;
      }),
    );
    assert.deepEqual(
      ledger.failure(error),
      { outcome: 'failed', mutation: 'rejected' },
      String(status),
    );
  }
  for (const error of [
    rejectedBy(500),
    rejectedBy(503),
    new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED'),
  ]) {
    const ledger = new WriteLedger();
    await assert.rejects(
      ledger.run(async () => {
        throw error;
      }),
    );
    assert.deepEqual(ledger.failure(error), { outcome: 'failed', mutation: 'unknown' });
  }
  // A rejection after an earlier write of the same item completed leaves the item unknown.
  const ledger = new WriteLedger();
  await ledger.run(async () => 'first');
  const later = new DloError('DLO_HTTP_ERROR', 400);
  await assert.rejects(
    ledger.run(async () => {
      throw later;
    }),
  );
  assert.deepEqual(ledger.failure(later), { outcome: 'failed', mutation: 'unknown' });
  // A failure after the rejected write (for example a later read) is not the rejection.
  const reread = new WriteLedger();
  await assert.rejects(
    reread.run(async () => {
      throw rejectedBy(400);
    }),
  );
  assert.deepEqual(reread.failure(new Error('readback')), {
    outcome: 'failed',
    mutation: 'unknown',
  });
});
