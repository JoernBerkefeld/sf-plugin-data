import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import {
  connectDiagnostic,
  connectReceiptDiagnostic,
  retainConnectDiagnostic,
  getConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import { createDataStreamClient } from '../lib/transport/data-stream-rest.js';
import { McpExecuteClient } from '../lib/transport/mcp-execute.js';

const origin = 'https://synthetic.my.salesforce.com';

/**
 * Dispatch one existing native CLI operation.
 * @param {object} client Family transport.
 * @param {string} name Read name.
 * @param {string} target Write target.
 * @param {object} body Write input.
 * @param {string} verb HTTP method.
 * @returns {Promise<unknown>} Existing operation promise.
 */
const native = (client, name, target, body, verb) =>
  ({
    GET: () => client.get(name),
    POST: () => client.create(body),
    PATCH: () => client.update(target, body),
    DELETE: () => client.delete(target),
  })[verb]();

test('classification admits only actual 429/503 and bounded unique server Retry-After', () => {
  for (const status of [undefined, '503', 500, 200])
    assert.equal(connectDiagnostic(status), undefined);
  assert.deepEqual(connectDiagnostic(503), { statusCode: 503, kind: 'service-unavailable' });
  assert.deepEqual(connectDiagnostic(429, { 'Retry-After': '15' }), {
    statusCode: 429,
    kind: 'rate-limit',
    retryAfter: '15',
  });
  const date = 'Thu, 05 Nov 2026 12:30:00 GMT';
  assert.equal(connectDiagnostic(503, { 'retry-after': date }).retryAfter, date);
  for (const value of [
    'secret',
    '-1',
    '1.5',
    '01',
    '1\nsecret',
    '9'.repeat(100),
    ['15'],
    'Fri, 05 Nov 2026 12:30:00 GMT',
  ])
    assert.equal(connectDiagnostic(503, { 'retry-after': value }).retryAfter, undefined);
  assert.equal(
    connectDiagnostic(503, { 'Retry-After': '1', 'retry-after': '2' }).retryAfter,
    undefined,
  );
  assert.equal(
    connectReceiptDiagnostic(
      'HTTP/1.1 503 Unavailable\nRetry-After: 7\nContent-Type: text/html\n<html>secret</html>',
    ).retryAfter,
    '7',
  );
  assert.equal(
    connectReceiptDiagnostic('HTTP/1.1 503 Unavailable\nRetry-After: 7\nretry-after: 8\n{}')
      .retryAfter,
    undefined,
  );
  assert.equal(
    connectReceiptDiagnostic('HTTP/1.1 503 Unavailable\n\nRetry-After: 99').retryAfter,
    undefined,
  );
  const error = retainConnectDiagnostic(
    new Error('safe'),
    connectDiagnostic(503, { 'retry-after': '7', authorization: 'secret' }),
  );
  assert.equal(Object.isFrozen(getConnectDiagnostic(error)), true);
  assert.ok(
    ![inspect(error), JSON.stringify(error), String(error)].some((text) => text.includes('secret')),
  );
  assert.equal(getConnectDiagnostic(new Error('rate limit 503')), undefined);
});

/**
 * Build actual core parsing with one synthetic wire response.
 * @param {number} statusCode HTTP failure.
 * @returns {object} Connection and wire count.
 */
function core(statusCode) {
  let calls = 0;
  const connection = Object.assign(Object.create(Connection.prototype), {
    instanceUrl: origin,
    version: '65.0',
    accessToken: 'synthetic-token',
    logger: { getRawLogger: () => ({ debug() {} }) },
    _propagators: [],
    _refreshDelegate: {
      isRefreshing: () => assert.fail('no refresh'),
      refresh: () => assert.fail('no refresh'),
    },
    _transport: {
      httpRequest(_request, options) {
        calls++;
        assert.equal(options.retry.maxRetries, 0);
        const pending = Promise.resolve({
          statusCode,
          headers: { 'retry-after': '7', 'content-type': 'application/json' },
          body: JSON.stringify([{ errorCode: 'INTERNAL_ERROR', message: 'secret' }]),
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  return { connection, count: () => calls };
}

for (const status of [429, 503]) {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'])
    test(`shared core ${method} HTTP${status} retains safe wire evidence once`, async () => {
      const f = core(status);
      class Transport extends ConnectClient {
        execute() {
          return this.send(
            { method, url: this.safeUrl('/services/data/v65.0/ssot/data-model-objects') },
            this.noRefreshReceiver(),
          );
        }
      }
      await assert.rejects(new Transport(f.connection, '65.0').execute(), (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(error.code, 'REQUEST_FAILED');
        assert.deepEqual(
          getConnectDiagnostic(error),
          connectDiagnostic(status, { 'retry-after': '7' }),
        );
        assert.ok(!inspect(error).includes('secret'));
        return true;
      });
      assert.equal(f.count(), 1);
    });
  test(`facade POST mutation HTTP${status} preserves wire status without replay`, async () => {
    const f = core(status);
    const client = new McpExecuteClient(f.connection, {
      requested: '67.0',
      restSelector: 'v67.0',
      soapNumeric: '67.0',
    });
    await assert.rejects(
      client.mutate('d360_data_graph_delete', { dataGraphName: 'Synthetic' }),
      (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(getConnectDiagnostic(error).retryAfter, '7');
        return true;
      },
    );
    assert.equal(f.count(), 1);
  });
  test(`semantic facade POST read HTTP${status} preserves wire status without replay`, async () => {
    const f = core(status);
    const client = new McpExecuteClient(f.connection, {
      requested: '67.0',
      restSelector: 'v67.0',
      soapNumeric: '67.0',
    });
    await assert.rejects(
      client.read('d360_data_graph_get', {
        dataGraphName: 'Synthetic',
        includeCIDetails: true,
        includeSegmentDetails: true,
      }),
      (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(getConnectDiagnostic(error).retryAfter, '7');
        return true;
      },
    );
    assert.equal(f.count(), 1);
  });
  for (const family of ['dlo', 'dmo', 'mapping', 'stream'])
    for (const method of family === 'stream' ? ['DELETE'] : ['GET', 'POST', 'PATCH', 'DELETE'])
      test(`CLI ${family} ${method} HTTP${status} retains only safe header evidence`, async () => {
        let calls = 0;
        const runner = async () => {
          calls++;
          return {
            stdout: `HTTP/1.1 ${status} Unavailable\nRetry-After: 7\nAuthorization: secret\n[{"message":"secret"}]`,
            stderr: 'secret',
            exitCode: 1,
          };
        };
        const mappingBody = {
          sourceEntityDeveloperName: 'Synthetic__dll',
          targetEntityDeveloperName: 'Synthetic__dlm',
          fieldMapping: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
        };
        const clients = {
          dlo: () =>
            native(
              createDloClient('synthetic', '68.0', runner),
              'Synthetic__dll',
              '0dl000000000001AAA',
              {},
              method,
            ),
          dmo: () =>
            native(
              createDmoClient('synthetic', '68.0', runner),
              'Synthetic__dlm',
              'Synthetic__dlm',
              {},
              method,
            ),
          mapping: () =>
            native(
              createMappingClient('synthetic', '68.0', runner),
              'Synthetic',
              'Synthetic',
              mappingBody,
              method,
            ),
          stream: () =>
            createDataStreamClient('synthetic', {}, '68.0', runner).delete(
              '0dk000000000001AAA',
              false,
            ),
        };
        await assert.rejects(clients[family](), (error) => {
          assert.deepEqual(
            getConnectDiagnostic(error),
            connectDiagnostic(status, { 'retry-after': '7' }),
          );
          assert.ok(
            ![inspect(error), JSON.stringify(error)].some((text) => text.includes('secret')),
          );
          return true;
        });
        assert.equal(calls, 1);
      });
}
