import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectClient } from '../lib/transport/connect-client.js';

const dmo = 'Demo__dlm';
const jsonNull = JSON.parse('null');
const relationship = (index, incoming = false) => ({
  name: `Synthetic_${index}`,
  sourceObject: { name: incoming ? 'Other__dlm' : dmo, keyQualifierField: 'KQ__c' },
  targetObject: { name: incoming ? dmo : 'Other__dlm' },
  sourceField: { name: 'Reference__c' },
  cardinality: 'ManyToOne',
  status: 'INACTIVE',
  unknownFutureMetadata: { preserved: true },
});
const page = (relationships, totalSize = relationships.length, extra = {}) => ({
  relationships,
  totalSize,
  ...extra,
});
const clientFor = (pages, version = '65.0') => {
  const urls = [];
  const client = new ConnectClient(
    {
      instanceUrl: 'https://synthetic.my.salesforce.com',
      request: async ({ method, url }, options) => {
        assert.equal(method, 'GET');
        urls.push(new URL(url));
        const response = pages[urls.length - 1];
        if (response instanceof Error) throw response;
        if (response === 204) return options.noContentResponse;
        return response;
      },
    },
    version,
  );
  return { client, urls };
};

test('latest relationship pages keep literal alias despite hostile continuation URLs', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => relationship(index));
  const { client, urls } = clientFor(
    [page(rows, 21, { nextPageUrl: 'https://hostile.test/secret' }), page([relationship(20)], 21)],
    { requested: 'latest', restSelector: 'latest', soapNumeric: '68.0' },
  );
  const result = await client.listDataModelObjectRelationships(dmo, 'default');
  assert.equal(result.length, 21);
  for (const url of urls)
    assert.equal(
      url.pathname,
      `/services/data/latest/ssot/data-model-objects/${dmo}/relationships`,
    );
  assert.deepEqual(
    urls.map((url) => url.searchParams.get('offset')),
    ['0', '20'],
  );
});

test('latest numeric evidence below relationship endpoint minimum blocks before requests', async () => {
  const { client, urls } = clientFor([], {
    requested: 'latest',
    restSelector: 'latest',
    soapNumeric: '63.0',
  });
  await assert.rejects(client.listDataModelObjectRelationships(dmo, 'default'));
  assert.deepEqual(urls, []);
});

test('relationship acquisition covers both directions, explicit scope and lossless raw metadata', async () => {
  const rows = [relationship(1), relationship(2, true)];
  const { client, urls } = clientFor([page(rows)]);
  assert.deepEqual(await client.listDataModelObjectRelationships(dmo, 'Space_A'), rows);
  assert.equal(
    urls[0].pathname,
    `/services/data/v65.0/ssot/data-model-objects/${dmo}/relationships`,
  );
  assert.deepEqual(Object.fromEntries(urls[0].searchParams), {
    dataspace: 'Space_A',
    limit: '20',
    offset: '0',
    orderBy: 'ASC',
    sortBy: 'DeveloperName',
  });
});

test('offset pagination uses total evidence without following legacy or hostile links', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => relationship(index));
  const { client, urls } = clientFor([
    page(rows, 21, { nextPageUrl: 'https://hostile.test/secret', nextPageToken: 'opaque' }),
    page([relationship(20, true)], 21, { nextPageUrl: jsonNull, nextPageToken: jsonNull }),
  ]);
  const result = await client.listDataModelObjectRelationships(dmo, 'default');
  assert.equal(result.length, 21);
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('offset'), '20');
  assert.ok(urls.every((url) => url.hostname === 'synthetic.my.salesforce.com'));
  assert.ok(urls.every((url) => !url.searchParams.has('pageToken')));
});

test('empty and exactly full terminal pages require consistent exhaustion evidence', async () => {
  for (const rows of [[], Array.from({ length: 20 }, (_, index) => relationship(index))]) {
    const { client, urls } = clientFor([page(rows)]);
    const result = await client.listDataModelObjectRelationships(dmo, 'default');
    assert.equal(result.length, rows.length);
    assert.equal(urls.length, 1);
  }
});

test('HTTP 204 establishes an empty initial list, never a missing JSON or truncated later page', async () => {
  const { client } = clientFor([204]);
  assert.deepEqual(await client.listDataModelObjectRelationships(dmo, 'default'), []);
  const missing = clientFor([undefined]).client;
  await assert.rejects(missing.listDataModelObjectRelationships(dmo, 'default'), {
    code: 'INVALID_PAGE',
  });
  const rows = Array.from({ length: 20 }, (_, index) => relationship(index));
  const truncated = clientFor([page(rows, 21), 204]).client;
  await assert.rejects(truncated.listDataModelObjectRelationships(dmo, 'default'), {
    code: 'INCOMPLETE_LIST',
  });
});

test('malformed, unknown or contradictory envelopes and out-of-scope records block', async () => {
  for (const response of [
    jsonNull,
    [],
    {},
    page([], 0, { futureContinuation: 'unknown' }),
    page([], 0, { count: 1 }),
    page([], -1),
    page([], 1.5),
    page([], 0, { nextPageUrl: {} }),
    page([], 0, { sortBy: 'Other' }),
    page([jsonNull]),
    page([{}]),
    page([relationship(1)], 0),
    page([
      { ...relationship(1), sourceObject: { name: 'A__dlm' }, targetObject: { name: 'B__dlm' } },
    ]),
  ]) {
    const { client } = clientFor([response]);
    await assert.rejects(client.listDataModelObjectRelationships(dmo, 'default'), {
      code: 'INVALID_PAGE',
    });
  }
  for (const response of [
    page([], 1),
    page([], 0, { nextPageToken: 'more' }),
    page([relationship(1), relationship(1)]),
  ]) {
    const { client } = clientFor([response]);
    await assert.rejects(client.listDataModelObjectRelationships(dmo, 'default'), {
      code: 'INCOMPLETE_LIST',
    });
  }
});

test('overlap, changing totals, local budget and transport failure never return partial lists', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => relationship(index));
  for (const [pages, code] of [
    [[page(rows, 21), page([relationship(0)], 21)], 'INCOMPLETE_LIST'],
    [[page(rows, 21), page([relationship(20)], 22)], 'INCOMPLETE_LIST'],
    [[page(rows, 21), new Error('secret')], 'REQUEST_FAILED'],
    [
      Array.from({ length: 101 }, (_, offset) =>
        page(
          Array.from({ length: 20 }, (_, index) => relationship(offset * 20 + index)),
          2021,
        ),
      ),
      'INCOMPLETE_LIST',
    ],
  ]) {
    const { client, urls } = clientFor(pages);
    await assert.rejects(client.listDataModelObjectRelationships(dmo, 'default'), { code });
    assert.ok(urls.length <= 101);
  }
});

test('unsupported versions and unsafe or implicit scope fail before network access', async () => {
  for (const [name, space, version] of [
    [dmo, 'default', '63.0'],
    [dmo, '', '65.0'],
    ['../Demo__dlm', 'default', '65.0'],
    [dmo, 'default&status=Active', '65.0'],
    ['Demo', 'default', '65.0'],
  ]) {
    const { client, urls } = clientFor([], version);
    await assert.rejects(client.listDataModelObjectRelationships(name, space), {
      code: 'INVALID_REQUEST',
    });
    assert.equal(urls.length, 0);
  }
});
