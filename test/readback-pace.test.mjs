import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { paceReadback, readbackPace } from '../lib/services/readback-pace.js';

test('settle reads are spaced explicitly: no wait before the first read, one before each later read', async () => {
  // Bound reads return in well under a second, so the wait cannot come from per-read start-up.
  assert.ok(readbackPace.attempts * readbackPace.delayMs >= 10_000);
  const original = readbackPace.sleep;
  const waits = [];
  readbackPace.sleep = async (milliseconds) => {
    waits.push(milliseconds);
  };
  try {
    for (let attempt = 0; attempt < 3; attempt++) await paceReadback(attempt);
  } finally {
    readbackPace.sleep = original;
  }
  assert.deepEqual(waits, [readbackPace.delayMs, readbackPace.delayMs]);
});
