import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatedInsightScope } from '../lib/services/retrieve-calculated-insight.js';

const connection = { getApiVersion: () => '65.0' };
const selection = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' };
for (const [name, version, space, apiName] of [
  [
    'facade numeric',
    { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' },
    'default',
    'Synthetic__cio',
  ],
  [
    'latest alias',
    { requested: 'latest', restSelector: 'latest', soapNumeric: '65.0' },
    'default',
    'Synthetic__cio',
  ],
  ['wrong SOAP', { ...selection, soapNumeric: '67.0' }, 'default', 'Synthetic__cio'],
  ['wrong REST', { ...selection, restSelector: 'v67.0' }, 'default', 'Synthetic__cio'],
  ['nondefault space', selection, 'other', 'Synthetic__cio'],
  ['wrong suffix', selection, 'default', 'Synthetic__dlm'],
  ['unsafe route', selection, 'default', '../Synthetic__cio'],
])
  test(`CI fixed scope refuses ${name}`, () => {
    assert.throws(() => calculatedInsightScope(connection, version, space, apiName));
  });
test('CI fixed scope refuses connection version disagreement', () => {
  assert.throws(() =>
    calculatedInsightScope({ getApiVersion: () => '67.0' }, selection, 'default', 'Synthetic__cio'),
  );
});
