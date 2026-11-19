import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataSpaceCheck,
  dataSpaceCheckOf,
  dataSpaceDirectory,
  readOrgDataSpaces,
} from '../lib/services/data-space-check.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  readDataSpaceList,
  readSingleDataSpace,
  refuseLegacyDataSpace,
  sortedDataSpaces,
} from '../lib/artifacts/data-space-field.js';

const route = '/services/data/v68.0/ssot/data-spaces';
const space = (name) => ({ name, label: name, id: '0vh000000000000AAA', status: 'Active' });

test('the data space list is read page by page until totalSize names', async () => {
  const requests = [];
  const pages = [
    { dataSpaces: [space('default'), space('dataspace2')], totalSize: 3 },
    { dataSpaces: [space('third')], totalSize: 3 },
  ];
  const names = await readOrgDataSpaces(async () => ({
    request: async (method, url) => {
      requests.push([method, url]);
      return pages[requests.length - 1];
    },
  }));
  assert.deepEqual(names, ['default', 'dataspace2', 'third']);
  assert.deepEqual(requests, [
    ['GET', `${route}?batchSize=50&offset=0`],
    ['GET', `${route}?batchSize=50&offset=2`],
  ]);
});

test('an incomplete or failed data space list is DATASPACE_READ_FAILED', async () => {
  for (const answer of [
    { dataSpaces: [space('default')] },
    { totalSize: 1 },
    { dataSpaces: [space('default')], totalSize: 0 },
    { dataSpaces: [{ label: 'no name' }], totalSize: 1 },
    { dataSpaces: [], totalSize: 2 },
    new ConnectError('REQUEST_FAILED', 403),
  ])
    await assert.rejects(
      readOrgDataSpaces(async () => ({
        request: async () => {
          if (answer instanceof Error) throw answer;
          return answer;
        },
      })),
      { code: 'DATASPACE_READ_FAILED' },
    );
  // Opening the sender (resolving the org) fails as it is, not as a read failure.
  await assert.rejects(
    readOrgDataSpaces(async () => {
      throw new Error('no org');
    }),
    /no org/u,
  );
});

test('one check per command run reads once and refuses an unknown data space', async (t) => {
  let reads = 0;
  const original = dataSpaceDirectory.read;
  t.after(() => {
    dataSpaceDirectory.read = original;
  });
  dataSpaceDirectory.read = async (open) => {
    reads++;
    assert.equal(typeof open, 'function');
    return ['default', 'dataspace2'];
  };
  const run = {};
  const opened = [];
  const check = dataSpaceCheckOf(run, async () => {
    opened.push('sender');
    return { request: async () => assert.fail('not read through the fake') };
  });
  assert.equal(
    dataSpaceCheckOf(run, async () => assert.fail('second sender')),
    check,
  );
  await check.require(['default']);
  await check.require(['dataspace2', 'default']);
  await assert.rejects(check.require(['default', 'dataspace3']), (error) => {
    assert.equal(error.code, 'UNKNOWN_DATASPACE');
    assert.match(error.message, /dataspace3/u);
    assert.match(error.message, /dataspace2, default/u);
    return true;
  });
  assert.equal(reads, 1);
  // A new command run reads again.
  await new DataSpaceCheck(async () => ({})).require(['default']);
  assert.equal(reads, 2);
});

const refuse = (code, keyPath, problem) =>
  Object.assign(new Error(`${keyPath} ${problem}`), { code });

test('c__dataSpace parsing: single name, list, legacy key and filter entries', () => {
  assert.equal(readSingleDataSpace({ c__dataSpace: 'default' }, refuse), 'default');
  for (const value of [undefined, '', ' default', ['default'], 'a\u0007'])
    assert.throws(() => readSingleDataSpace({ c__dataSpace: value }, refuse), {
      code: 'INVALID_DATASPACE_FIELD',
    });
  assert.deepEqual(readDataSpaceList({ c__dataSpace: ['b', 'a'] }, refuse), ['b', 'a']);
  assert.throws(() => readDataSpaceList({ c__dataSpace: [{ name: 'a', filter: {} }] }, refuse), {
    code: 'UNSUPPORTED_DATASPACE_FILTER',
  });
  for (const value of [[], ['a', 'a'], 'a', [{ name: 'a' }]])
    assert.throws(() => readDataSpaceList({ c__dataSpace: value }, refuse), {
      code: 'INVALID_DATASPACE_FIELD',
    });
  assert.throws(() => refuseLegacyDataSpace({ apiName: 'X', dataSpace: 'default' }, refuse), {
    code: 'LEGACY_DATASPACE_KEY',
  });
  assert.doesNotThrow(() => refuseLegacyDataSpace({ apiName: 'X' }, refuse));
  assert.deepEqual(sortedDataSpaces(['default', 'dataspace2', 'default']), [
    'dataspace2',
    'default',
  ]);
});
