import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { nativeDataGraphReadContext } from '../lib/services/native-data-graph-context.js';
import { getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

const orgId = '00D000000000001AAA';
const origin = 'https://synthetic.my.salesforce.com';
/**
 * Use real core request parsing with a synthetic operation-local wire transport.
 * @returns {object} Mutable connection and exact request evidence.
 */
function fixture() {
  const calls = [];
  let result = { statusCode: 200, body: { synthetic: true } };
  const connection = Object.assign(
    Object.defineProperty(Object.create(Connection.prototype), 'metadata', {
      writable: true,
      value: undefined,
    }),
    {
      instanceUrl: origin,
      version: '68.0',
      accessToken: 'synthetic-token',
      getAuthInfoFields: () => ({ orgId }),
      logger: { getRawLogger: () => ({ debug() {} }) },
      _refreshDelegate: {
        isRefreshing: () => assert.fail('refresh must be masked'),
        refresh: () => assert.fail('no refresh'),
      },
      _propagators: [],
      metadata: {
        async read(type, names) {
          assert.notEqual(this._conn, connection);
          assert.equal(this._conn._refreshDelegate, undefined);
          assert.equal(type, 'CustomObject');
          assert.deepEqual(names, ['ssot__Individual__dlm']);
          return [{ fullName: names[0] }];
        },
      },
      _transport: {
        httpRequest(request, options) {
          calls.push(request);
          assert.equal(request.method, 'GET');
          assert.equal(options.retry.maxRetries, 0);
          const value = request.url.includes(encodeURIComponent('SELECT Id FROM Organization'))
            ? { statusCode: 200, body: { done: true, totalSize: 1, records: [{ Id: orgId }] } }
            : result;
          const pending = Promise.resolve({
            statusCode: value.statusCode,
            headers: { 'content-type': 'application/json', 'retry-after': '9' },
            body: value.rawBody ?? JSON.stringify(value.body),
          });
          pending.stream = () => new PassThrough();
          return pending;
        },
      },
    },
  );
  return {
    connection,
    calls,
    setResult(value) {
      result = value;
    },
  };
}

test('concrete Graph context independently verifies org then uses exact API68/default GETs', async () => {
  const f = fixture();
  const descriptors = Object.getOwnPropertyDescriptors(f.connection);
  const context = await nativeDataGraphReadContext(f.connection, 'default');
  assert.equal(context.orgId, orgId);
  await context.get('SyntheticGraph');
  await context.metadata('SyntheticGraph');
  await context.inventory();
  await context.query('SyntheticGraph');
  assert.deepEqual(await context.root(), {
    detail: { synthetic: true },
    metadata: [{ fullName: 'ssot__Individual__dlm' }],
  });
  assert.deepEqual(
    f.calls.map((r) => r.url),
    [
      `${origin}/services/data/v68.0/query?q=${encodeURIComponent('SELECT Id FROM Organization')}`,
      `${origin}/services/data/v68.0/ssot/data-graphs/SyntheticGraph`,
      `${origin}/services/data/v68.0/ssot/data-graphs/metadata?dataspace=default&dataGraphEntityName=SyntheticGraph`,
      `${origin}/services/data/v68.0/ssot/data-graphs/metadata?dataspace=default`,
      `${origin}/services/data/v68.0/query?q=${encodeURIComponent("SELECT Id, DataGraphApiName FROM DataGraph WHERE DataGraphApiName = 'SyntheticGraph'")}`,
      `${origin}/services/data/v68.0/ssot/data-model-objects/ssot__Individual__dlm?dataspace=default`,
    ],
  );
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.connection), descriptors);
});

test('Graph HTML503 keeps safe wire evidence but SOQL503 is not Connect evidence', async () => {
  const f = fixture();
  const context = await nativeDataGraphReadContext(f.connection, 'default');
  f.setResult({ statusCode: 503, rawBody: '<html>secret</html>' });
  await assert.rejects(context.get('SyntheticGraph'), (error) => {
    assert.deepEqual(getConnectDiagnostic(error), {
      statusCode: 503,
      kind: 'service-unavailable',
      retryAfter: '9',
    });
    assert.equal(String(error).includes('secret'), false);
    return true;
  });
  await assert.rejects(context.query('SyntheticGraph'), (error) => {
    assert.equal(getConnectDiagnostic(error), undefined);
    return true;
  });
  f.setResult({ statusCode: 503, body: [{ errorCode: 'INTERNAL_ERROR', message: 'secret' }] });
  const result = await context.get('SyntheticGraph');
  assert.equal(result.status, 503);
  assert.equal(getConnectDiagnostic(result).kind, 'service-unavailable');
  assert.equal(getConnectDiagnostic(await context.query('SyntheticGraph')), undefined);
});

for (const statusCode of [429, 503])
  for (const html of [false, true])
    test(`root HTTP${statusCode} html=${html} retains safe evidence before Metadata`, async () => {
      const f = fixture();
      const context = await nativeDataGraphReadContext(f.connection, 'default');
      f.connection.metadata.read = async () => assert.fail('no Metadata after rejected root');
      f.setResult({
        statusCode,
        ...(html
          ? { rawBody: '<html>private-secret</html>' }
          : { body: [{ message: 'private-secret' }] }),
      });
      await assert.rejects(context.root(), (error) => {
        assert.equal(getConnectDiagnostic(error).statusCode, statusCode);
        assert.equal(String(error).includes('private-secret'), false);
        return true;
      });
      assert.equal(f.calls.length, 2);
    });

for (const statusCode of [400, 401, 403, 404, 429, 500, 503])
  test(`concrete Graph HTTP${statusCode} retains detached exact evidence without replay`, async () => {
    const f = fixture();
    const context = await nativeDataGraphReadContext(f.connection, 'default');
    const body = [{ errorCode: 'INTERNAL_ERROR', message: 'synthetic-not-absence' }];
    f.setResult({ statusCode, body });
    const result = await context.get('SyntheticGraph');
    assert.deepEqual(result, { status: statusCode, body });
    result.body[0].message = 'changed';
    assert.equal(body[0].message, 'synthetic-not-absence');
    assert.equal(f.calls.length, 2);
  });

test('concrete Graph rejects invalid names and connection drift before further requests', async () => {
  const f = fixture();
  const context = await nativeDataGraphReadContext(f.connection, 'default');
  for (const value of ['../escape', "Graph' OR Id != ''", 'Graph?dataspace=other', '']) {
    assert.throws(() => context.get(value));
    assert.throws(() => context.metadata(value));
    assert.throws(() => context.query(value));
  }
  f.connection.version = '67.0';
  await assert.rejects(context.inventory());
  assert.equal(f.calls.length, 1);
});

test('concrete Graph refuses incorrect scope/auth identity and unavailable wire evidence', async () => {
  for (const change of [
    (c) => {
      c.version = '67.0';
    },
    (c) => {
      c.instanceUrl = 'https://synthetic.test/path';
    },
    (c) => {
      c.getAuthInfoFields = () => ({ orgId: 'invalid' });
    },
    (c) => {
      c._transport = {};
    },
  ]) {
    const f = fixture();
    change(f.connection);
    await assert.rejects(nativeDataGraphReadContext(f.connection, 'default'));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(nativeDataGraphReadContext(f.connection, 'other'));
  assert.equal(f.calls.length, 0);
  f.connection.request = async () => ({ done: true, totalSize: 1, records: [{ Id: orgId }] });
  await assert.rejects(nativeDataGraphReadContext(f.connection, 'default'));
});

test('concrete Graph rejects nonmatching authoritative org and network failure, never retries', async () => {
  const f = fixture();
  const transport = f.connection._transport.httpRequest;
  f.connection._transport.httpRequest = function (request, options) {
    const pending = transport.call(this, { ...request, url: `${origin}/not-identity` }, options);
    return pending;
  };
  await assert.rejects(nativeDataGraphReadContext(f.connection, 'default'));
  const g = fixture();
  const context = await nativeDataGraphReadContext(g.connection, 'default');
  g.connection._transport.httpRequest = () => {
    throw new Error('synthetic-network-secret');
  };
  await assert.rejects(context.get('SyntheticGraph'), (error) => !error.message.includes('secret'));
  assert.equal(g.calls.length, 1);
});
