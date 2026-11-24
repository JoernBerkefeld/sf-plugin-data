import assert from 'node:assert/strict';
import test from 'node:test';
import { exitCodeOf } from 'sf-plugin-data/api';

test('exitCodeOf maps each envelope status to its Salesforce CLI exit code', () => {
  for (const [status, code] of [
    ['success', 0],
    ['accepted', 0],
    ['partial', 68],
    ['processing', 69],
    ['blocked', 1],
    ['failed', 1],
  ])
    assert.equal(exitCodeOf({ status }), code, status);
});

test('exitCodeOf treats any unknown status as a failure', () => {
  for (const status of ['', 'unknown', 'SUCCESS', 'Processing'])
    assert.equal(exitCodeOf({ status }), 1, status);
});
