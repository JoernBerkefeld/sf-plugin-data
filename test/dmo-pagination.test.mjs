import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { ConnectClient } from '../lib/transport/connect-client.js';

const jsonNull = JSON.parse('null');
const origin = 'https://synthetic.my.salesforce.com';
const path = '/services/data/v65.0/ssot/data-model-objects';
const item = (index, dataSpaceName = 'default') => ({
  name: `Synthetic${index}__dlm`,
  dataSpaceName,
  fields: [{ name: 'SyntheticKey__c', type: 'Text' }],
});
const full = (start = 0) => Array.from({ length: 50 }, (_, index) => item(start + index));
const clientFor = (request) => new ConnectClient({ instanceUrl: origin, request }, '65.0');

test('DMO list completes with raw entries, fixed offsets and explicit version', async () => {
  const pages = [full(), [item(50), item(0, 'other-space')]];
  const requests = [];
  const client = clientFor(async (request) => {
    requests.push(request);
    return { dataModelObject: pages[requests.length - 1] };
  });
  const result = await client.listDataModelObjects();
  assert.deepEqual(result, pages.flat());
  assert.equal(result[0], pages[0][0]);
  assert.deepEqual(
    requests,
    [0, 50].map((offset) => ({
      method: 'GET',
      url: `${origin}${path}?limit=50&offset=${offset}&orderBy=ASC`,
    })),
  );
});

test('empty inventory and exact multiples require an explicit short terminal page', async () => {
  for (const pages of [[[]], [full(), []]]) {
    let calls = 0;
    const client = clientFor(async () => ({ dataModelObject: pages[calls++] }));
    assert.deepEqual(await client.listDataModelObjects(), pages.flat());
    assert.equal(calls, pages.length);
  }
});

test('malformed envelopes and entries fail without returning a partial inventory', async () => {
  for (const page of [
    jsonNull,
    [],
    {},
    { items: [] },
    { dataModelObject: jsonNull },
    { dataModelObject: 'secret' },
    { dataModelObject: [...full(), item(50)] },
    ...[
      jsonNull,
      [],
      {},
      { name: 'Synthetic__dlm' },
      { ...item(0), name: '' },
      { ...item(0), dataSpaceName: ' ' },
    ].map((entry) => ({ dataModelObject: [entry] })),
  ]) {
    let calls = 0;
    const client = clientFor(async () => (++calls === 1 ? { dataModelObject: full() } : page));
    await assert.rejects(client.listDataModelObjects(), { code: 'INVALID_PAGE' });
    assert.equal(calls, 2);
  }
});

test('unexpected next links or tokens are never followed, including otherwise safe links', async () => {
  for (const link of [
    'https://outside.test/secret',
    `${origin}${path}?offset=50`,
    `${path}?offset=50`,
    '/services/data/v68.0/ssot/data-model-objects',
    `${path}/../other`,
    `${path}?secret=credential`,
    '',
    7,
  ]) {
    for (const key of ['nextPageUrl', 'nextPageToken']) {
      let calls = 0;
      const client = clientFor(async () => {
        calls++;
        return { dataModelObject: [], [key]: link };
      });
      await assert.rejects(client.listDataModelObjects(), (error) => {
        assert.equal(error.code, 'INVALID_PAGE');
        assert.ok(!inspect(error).includes('secret'));
        return true;
      });
      assert.equal(calls, 1);
    }
  }
});

test('repeated pages and overlapping identities fail as incomplete, even on a short page', async () => {
  for (const second of [full(), [item(0)]]) {
    let calls = 0;
    const client = clientFor(async () => ({ dataModelObject: ++calls === 1 ? full() : second }));
    await assert.rejects(client.listDataModelObjects(), { code: 'INCOMPLETE_LIST' });
    assert.equal(calls, 2);
  }
  const client = clientFor(async () => ({ dataModelObject: [item(0), item(0)] }));
  await assert.rejects(client.listDataModelObjects(), { code: 'INCOMPLETE_LIST' });
});

test('offset ceiling blocks truncation and never requests offset greater than 2000', async () => {
  let calls = 0;
  const client = clientFor(async ({ url }) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    assert.equal(offset, calls++ * 50);
    assert.ok(offset <= 2000);
    return { dataModelObject: full(offset) };
  });
  await assert.rejects(client.listDataModelObjects(), { code: 'INCOMPLETE_LIST' });
  assert.equal(calls, 41);
});

test('a short page at the ceiling completes and mid-list request errors stay redacted', async () => {
  let calls = 0;
  const client = clientFor(async () => {
    const offset = calls++ * 50;
    return { dataModelObject: offset === 2000 ? [item(offset)] : full(offset) };
  });
  const result = await client.listDataModelObjects();
  assert.equal(result.length, 2001);
  assert.equal(calls, 41);
  calls = 0;
  const failing = clientFor(async () => {
    if (++calls === 1) return { dataModelObject: full() };
    throw new Error('secret');
  });
  await assert.rejects(failing.listDataModelObjects(), { code: 'REQUEST_FAILED' });
  assert.equal(calls, 2);
});
