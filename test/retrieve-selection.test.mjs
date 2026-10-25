import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDmos, validateDmoSelection } from '../lib/services/retrieve-other-dmo.js';

const connection = (request) => ({
  instanceUrl: 'https://synthetic.example',
  getApiVersion: () => '65.0',
  request,
});

test('exact selectors deduplicate and sort without inventory acquisition', async () => {
  const names = await selectDmos(
    connection(() => assert.fail('must not list')),
    ['dmo:Zeta__dlm', 'dmo:Alpha__dlm', 'dmo:Zeta__dlm'],
    '65.0',
    'default',
  );
  assert.deepEqual(names, ['Alpha__dlm', 'Zeta__dlm']);
});

test('type and omitted selectors consume complete inventory and scope default without hiding unsupported names', async () => {
  for (const selectors of [[], ['dmo'], ['dmo', 'dmo:Alpha__dlm', 'dmo']]) {
    const calls = [];
    const first = Array.from({ length: 50 }, (_, index) => ({
      name: `Object${index}__dlm`,
      dataSpaceName: 'elsewhere',
    }));
    const names = await selectDmos(
      connection(async (request) => {
        calls.push(request.url);
        return {
          dataModelObject:
            calls.length === 1
              ? first
              : [
                  { name: 'Zeta__dlm', dataSpaceName: 'default' },
                  { name: 'ssot__Individual__dlm', dataSpaceName: 'default' },
                  { name: 'Alpha__dlm', dataSpaceName: 'default' },
                ],
        };
      }),
      selectors,
      '65.0',
      'default',
    );
    assert.deepEqual(names, ['Alpha__dlm', 'Zeta__dlm', 'ssot__Individual__dlm']);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /offset=50/u);
  }
});

test('empty inventory is an honest empty selection', async () => {
  assert.deepEqual(
    await selectDmos(
      connection(async () => ({ dataModelObject: [] })),
      [],
      '65.0',
      'default',
    ),
    [],
  );
});

test('invalid scope or selection refuses before inventory reads', async () => {
  for (const [selectors, version, space] of [
    [['dlo'], '65.0', 'default'],
    [['dmo:A__dlm', 'dmo:'], '65.0', 'default'],
    [[], '66.0', 'default'],
    [[], '65.0', 'other'],
  ]) {
    assert.throws(() => validateDmoSelection(selectors, version, space));
    await assert.rejects(
      selectDmos(
        connection(() => assert.fail('must not read')),
        selectors,
        version,
        space,
      ),
    );
  }
});

test('incomplete or malformed inventory never becomes a partial selection', async () => {
  for (const page of [
    { dataModelObject: [], nextPageToken: 'unhandled' },
    { dataModelObject: [{ name: '../Bad', dataSpaceName: 'default' }] },
    {
      dataModelObject: [
        { name: 'Alpha__dlm', dataSpaceName: 'default' },
        { name: 'Alpha__dlm', dataSpaceName: 'default' },
      ],
    },
  ]) {
    await assert.rejects(
      selectDmos(
        connection(async () => page),
        ['dmo'],
        '65.0',
        'default',
      ),
    );
  }
});
