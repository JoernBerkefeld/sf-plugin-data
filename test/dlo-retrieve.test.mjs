import assert from 'node:assert/strict';
import test from 'node:test';
import { retrieveDlo, DloRetrieveError } from '../lib/services/retrieve-dlo.js';
import { ConnectError } from '../lib/transport/connect-client.js';

/**
 * Construct a synthetic DLO detail.
 * @returns {object} Acquired detail fixture.
 */
function detail() {
  return {
    name: 'Example__dll',
    label: 'Example',
    category: 'Other',
    status: 'Active',
    dataLakeFieldInfoRepresentation: [
      { name: 'Id__c', label: 'ID', dataType: 'Text', isPrimaryKey: true },
    ],
    dataSpaceInfo: [{ name: 'default' }],
    future: { retained: true },
  };
}
/**
 * Build a request-recording connection without network access.
 * @param {unknown} response Returned data or thrown error.
 * @returns {object} Connection and request evidence.
 */
function connection(response = detail()) {
  const calls = [];
  let refreshes = 0;
  const conn = {
    instanceUrl: 'https://example.my.salesforce.com',
    getApiVersion: () => '65.0',
    _refreshDelegate: () => {
      refreshes++;
    },
    async request(request, options) {
      calls.push({ request, options, refreshDelegate: this._refreshDelegate });
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return { conn, calls, refreshes: () => refreshes };
}

test('exact DLO acquisition performs only one guarded GET and retains unknown configuration', async () => {
  const source = detail();
  const { conn, calls, refreshes } = connection(source);
  const original = conn._refreshDelegate;
  const result = await retrieveDlo(conn, 'Example__dll', '65.0', 'default');
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.detail, source);
  source.future.retained = false;
  assert.equal(result.detail.future.retained, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].request, {
    method: 'GET',
    url: 'https://example.my.salesforce.com/services/data/v65.0/ssot/data-lake-objects/Example__dll',
  });
  assert.equal(calls[0].refreshDelegate, undefined);
  assert.equal(conn._refreshDelegate, original);
  assert.equal(refreshes(), 0);
  assert.equal(calls[0].options.retry.maxRetries, 0);
  assert.throws(() => calls[0].options.followRedirect(), ConnectError);
});

for (const [name, apiName, version, space, connVersion] of [
  ['latest', 'Example__dll', 'latest', 'default', '65.0'],
  ['newer API', 'Example__dll', '67.0', 'default', '65.0'],
  ['nondefault', 'Example__dll', '65.0', 'other', '65.0'],
  ['wrong connection', 'Example__dll', '65.0', 'default', '67.0'],
  ['namespace', 'ns__Example__dll', '65.0', 'default', '65.0'],
  ['path escape', '../Example__dll', '65.0', 'default', '65.0'],
  ['standard', 'ssotExample__dll', '65.0', 'default', '65.0'],
  ['wrong kind', 'Example__dlm', '65.0', 'default', '65.0'],
]) {
  test(`DLO acquisition rejects ${name} before HTTP`, async () => {
    const { conn, calls } = connection();
    conn.getApiVersion = () => connVersion;
    await assert.rejects(retrieveDlo(conn, apiName, version, space), DloRetrieveError);
    assert.equal(calls.length, 0);
  });
}
for (const [name, response] of [
  ['wrong identity', { ...detail(), name: 'Wrong__dll' }],
  ['malformed', {}],
  ['missing', undefined],
  [
    'string boolean',
    {
      ...detail(),
      dataLakeFieldInfoRepresentation: [
        { name: 'Id__c', label: 'ID', dataType: 'Text', isPrimaryKey: 'true' },
      ],
    },
  ],
]) {
  test(`DLO acquisition sanitizes ${name} without further requests`, async () => {
    const { conn, calls } = connection(response);
    // Pass missing through explicitly; the fixture helper otherwise defaults its argument.
    if (name === 'missing')
      conn.request = async () => {
        calls.push({});
        return;
      };
    await assert.rejects(retrieveDlo(conn, 'Example__dll', '65.0', 'default'), (error) => {
      assert.ok(error instanceof DloRetrieveError);
      assert.equal(error.code, 'ACQUISITION_FAILED');
      assert.equal(error.message, 'DLO acquisition failed.');
      return true;
    });
    assert.equal(calls.length, 1);
  });
}
for (const statusCode of [401, 503]) {
  test(`DLO acquisition sanitizes HTTP ${statusCode} without retry or refresh`, async () => {
    const { conn, calls, refreshes } = connection(
      Object.assign(new Error('secret payload'), { statusCode }),
    );
    await assert.rejects(retrieveDlo(conn, 'Example__dll', '65.0', 'default'), (error) => {
      assert.ok(error instanceof ConnectError);
      assert.equal(error.statusCode, statusCode);
      assert.ok(!error.message.includes('secret'));
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(refreshes(), 0);
  });
}
