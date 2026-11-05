import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { settleNativeDataGraph } from '../lib/services/native-data-graph-crd.js';

test('standalone settlement rejects invalid intent and changed scope without polling', async () => {
  let reads = 0;
  const context = {
    check() {
      throw new Error('scope');
    },
    get: async () => {
      reads++;
    },
  };
  const result = await settleNativeDataGraph(context, {}, 'ready', async () => {});
  assert.equal(result.state, 'unknown');
  assert.equal(reads, 0);
});
