import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import {
  apiDiagnostic,
  apiReceiptDiagnostic,
  connectDiagnostic,
  connectReceiptDiagnostic,
  retainConnectDiagnostic,
  getConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import { createDataStreamClient } from '../lib/transport/data-stream-rest.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';

const origin = 'https://synthetic.my.salesforce.com';

test('failed CLI receipt admission excludes successful, malformed, duplicate and unsafe evidence', () => {
  for (const receipt of [
    '{"status":400,"message":"secret"}',
    'HTTP/1.1 200 OK\n\n{"errorCode":"INVALID_INPUT","message":"Reduce count."}',
    'HTTP/1.1 302 Redirect\n\nsecret',
  ])
    assert.equal(apiReceiptDiagnostic(receipt), undefined);
  for (const body of [
    'Internal Server Error',
    '<html>private</html>',
    '{bad',
    JSON.stringify({ errorCode: 'INVALID_INPUT', message: 'password=private' }),
  ]) {
    const diagnostic = apiReceiptDiagnostic(
      `HTTP/1.1 500 Error\nX-Request-ID: req-12345678\n\n${body}`,
    );
    assert.equal(diagnostic.statusCode, 500);
    assert.equal(diagnostic.requestId, 'req-12345678');
    assert.doesNotMatch(JSON.stringify(diagnostic), /private|password|Internal Server Error/u);
  }
  const duplicate = apiReceiptDiagnostic(
    'HTTP/1.1 503 Unavailable\nRetry-After: 7\nretry-after: 8\nX-Request-ID: req-12345678\nx-request-id: req-87654321\n\n{}',
  );
  assert.equal(duplicate.retryAfter, undefined);
  assert.equal(duplicate.requestId, undefined);
  assert.equal(apiReceiptDiagnostic(`HTTP/1.1 500 Error\n\n${'x'.repeat(40_000)}`).statusCode, 500);
});

test('value-shaped prose falls back while unfamiliar actionable explanations survive', () => {
  for (const message of [
    "Invalid API key 'sk_live_1234567890'.",
    "Invalid value 'Alice' for FirstName.",
    'Rejected customer Alice Smith.',
    "Unknown column 'Alice' near 'Person__dlm'.",
  ]) {
    const evidence = apiDiagnostic(
      400,
      { errorCode: 'NEW_REASON', message },
      undefined,
      'req-12345678',
    );
    assert.deepEqual(evidence, {
      statusCode: 400,
      kind: 'api-error',
      errors: [{ code: 'NEW_REASON' }],
      requestId: 'req-12345678',
    });
    assert.doesNotMatch(JSON.stringify(evidence), /sk_live|Alice|Smith/u);
  }
  for (const message of [
    'The matching stage requires fewer partitions. Reduce the partition count.',
    'The indexing stage is warming. Wait for index readiness before retrying.',
    'Field FirstName is case-sensitive; use the exact schema field name.',
    "Expected a fully qualified column name (in the form - table.column) for column: 'ssot__Id__c'",
    "Unknown field 'Person__dlm.Id__c' in the model.",
  ])
    assert.equal(
      apiDiagnostic(400, { errorCode: 'NEW_REASON', message }).errors[0].message,
      message,
    );
});

test('API display evidence is bounded, detached and never alters errors or JSON envelopes', () => {
  const body = [{ errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' }];
  const diagnostic = apiDiagnostic(
    400,
    body,
    { authorization: 'Bearer synthetic-secret' },
    'req-12345678',
  );
  const target = new Error('fixed');
  assert.equal(retainConnectDiagnostic(target, diagnostic), target);
  body[0].message = 'private replacement';
  assert.equal(getConnectDiagnostic(target).errors[0].message, 'Reduce the ruleset count to 10.');
  assert.equal(JSON.stringify(target), '{}');
  assert.doesNotMatch(
    inspect(target),
    /INVALID_INPUT|ruleset|synthetic-secret|private replacement/u,
  );
  const detached = retainConnectDiagnostic({ state: 'unknown' }, getConnectDiagnostic(target));
  assert.deepEqual(detached, { state: 'unknown' });
  assert.equal(getConnectDiagnostic(detached), diagnostic);
  assert.ok(Object.isFrozen(diagnostic));
  const long = 'Reduce the partition count. '.repeat(14);
  const bounded = apiDiagnostic(
    500,
    Array.from({ length: 3 }, () => ({ errorCode: 'CAPACITY_ERROR', message: long })),
  );
  assert.ok(JSON.stringify(bounded).length < 1500);
});

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
 * @param {unknown} [body] Synthetic response body.
 * @param {string} [requestId] Synthetic correlation header.
 * @returns {object} Connection and wire count.
 */
function core(statusCode, body = [{ errorCode: 'INTERNAL_ERROR', message: 'secret' }], requestId) {
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
          headers: {
            'retry-after': '7',
            'content-type': 'application/json',
            ...(requestId ? { 'x-sfdc-request-id': requestId } : {}),
          },
          body: JSON.stringify(body),
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  return { connection, count: () => calls };
}

test('displayable ITEM_NOT_FOUND never broadens exact absence qualification', async () => {
  for (const body of [
    [{ errorCode: 'ITEM_NOT_FOUND', message: 'The requested resource does not exist.' }],
    [
      { errorCode: 'ITEM_NOT_FOUND', message: 'The requested resource does not exist.' },
      { errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count.' },
    ],
  ]) {
    const f = core(404, body);
    await assert.rejects(
      new ConnectClient(f.connection, '65.0').get('/services/data/v65.0/ssot/data-model-objects'),
      (error) => {
        assert.match(operationDiagnostic(error, 'Stop.'), /ITEM_NOT_FOUND/u);
        assert.equal(error.nativeCode, body.length === 1 ? 'ITEM_NOT_FOUND' : undefined);
        return true;
      },
    );
    assert.equal(f.count(), 1);
  }
});

for (const status of [400, 500]) {
  for (const message of [
    'Reduce the ruleset count to 10.',
    'Private payload: customer-value',
    'Internal Server Error',
  ]) {
    test(`actual Connect HTTP${status} retains only admitted explanation: ${message}`, async () => {
      const f = core(status, [{ errorCode: 'INVALID_INPUT', message }], 'req-12345678');
      await assert.rejects(
        new ConnectClient(f.connection, '65.0').get('/services/data/v65.0/ssot/data-model-objects'),
        (error) => {
          assert.equal(error.code, 'REQUEST_FAILED');
          assert.equal(error.statusCode, status);
          const rendered = operationDiagnostic(error, 'Inspect target; outcome remains unknown.');
          assert.match(rendered, /INVALID_INPUT/u);
          assert.match(rendered, /Request ID: req-12345678/u);
          assert.equal(rendered.includes(message), message.startsWith('Reduce'));
          assert.doesNotMatch(inspect(error), /ruleset|customer-value/u);
          return true;
        },
      );
      assert.equal(f.count(), 1);
    });
  }
}

/**
 * The four family clients on one bound sender over the synthetic core wire.
 * @param {object} connection Synthetic core Connection.
 * @returns {object} Family client factories.
 */
function boundClients(connection) {
  const sender = () => openBoundSsot('synthetic', '68.0', async () => connection);
  return {
    dlo: () => createDloClient('synthetic', '68.0', sender()),
    dmo: () => createDmoClient('synthetic', '68.0', undefined, sender()),
    mapping: () => createMappingClient('synthetic', '68.0', undefined, undefined, sender()),
    stream: () => createDataStreamClient('synthetic', {}, '68.0', sender()),
  };
}

for (const family of ['dlo', 'dmo', 'mapping', 'stream']) {
  test(`bound ${family} actual HTTP failure preserves code, safe reason and request ID once`, async () => {
    const f = core(
      400,
      [{ errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' }],
      'req-12345678',
    );
    const make = boundClients(f.connection);
    const clients = {
      dlo: () => make.dlo().get('Synthetic__dll'),
      dmo: () => make.dmo().get('Synthetic__dlm'),
      mapping: () => make.mapping().get('Synthetic'),
      stream: () => make.stream().delete('0dk000000000001AAA', false),
    };
    await assert.rejects(clients[family](), (error) => {
      assert.equal(getConnectDiagnostic(error).statusCode, 400);
      const rendered = operationDiagnostic(error, 'No automatic replay.');
      assert.match(rendered, /INVALID_INPUT: Reduce the ruleset count to 10/u);
      assert.match(rendered, /Request ID: req-12345678/u);
      assert.doesNotMatch(rendered + inspect(error) + JSON.stringify(error), /synthetic-token/u);
      return true;
    });
    assert.equal(f.count(), 1);
  });
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
          apiDiagnostic(status, [{ errorCode: 'INTERNAL_ERROR', message: 'secret' }], {
            'retry-after': '7',
          }),
        );
        assert.ok(!inspect(error).includes('secret'));
        return true;
      });
      // The transport retries a throttled GET (three attempts); writes go once.
      assert.equal(f.count(), method === 'GET' ? 3 : 1);
    });
  for (const family of ['dlo', 'dmo', 'mapping', 'stream'])
    for (const method of family === 'stream' ? ['DELETE'] : ['GET', 'POST', 'PATCH', 'DELETE'])
      test(`bound ${family} ${method} HTTP${status} retains only safe evidence; a write goes once`, async () => {
        const f = core(status);
        const make = boundClients(f.connection);
        const mappingBody = {
          sourceEntityDeveloperName: 'Synthetic__dll',
          targetEntityDeveloperName: 'Synthetic__dlm',
          fieldMapping: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
        };
        const clients = {
          dlo: () => native(make.dlo(), 'Synthetic__dll', '0dl000000000001AAA', {}, method),
          dmo: () => native(make.dmo(), 'Synthetic__dlm', 'Synthetic__dlm', {}, method),
          // The mapping REST DELETE route is the field-pair delete.
          mapping: () =>
            method === 'DELETE'
              ? make.mapping().deleteField('Synthetic', 'observed_selector_123')
              : native(make.mapping(), 'Synthetic', 'Synthetic', mappingBody, method),
          stream: () => make.stream().delete('0dk000000000001AAA', false),
        };
        await assert.rejects(clients[family](), (error) => {
          assert.deepEqual(
            getConnectDiagnostic(error),
            apiDiagnostic(status, [{ errorCode: 'INTERNAL_ERROR', message: 'secret' }], {
              'retry-after': '7',
            }),
          );
          assert.ok(
            ![inspect(error), JSON.stringify(error)].some((text) => text.includes('secret')),
          );
          return true;
        });
        // A throttled read is retried; a throttled write is never resent.
        assert.equal(f.count(), method === 'GET' ? 3 : 1);
      });
}

test('a 403 save refusal keeps Salesforce text; access and 401 answers show their codes only', () => {
  const saving = retainConnectDiagnostic(
    new Error('refused'),
    apiDiagnostic(403, [
      {
        errorCode: 'ENTITY_SAVE_ERROR',
        message: 'Segment cannot be updated when it is in PROCESSING state',
      },
    ]),
  );
  assert.deepEqual(getConnectDiagnostic(saving).errors, [
    {
      code: 'ENTITY_SAVE_ERROR',
      message: 'Segment cannot be updated when it is in PROCESSING state',
    },
  ]);
  const shown = operationDiagnostic(saving, 'Next.');
  assert.match(shown, /rejected the request \(HTTP 403\)/u);
  assert.match(
    shown,
    /ENTITY_SAVE_ERROR: Segment cannot be updated when it is in PROCESSING state/u,
  );
  assert.doesNotMatch(shown, /authentication or authorization/u);
  for (const [status, code] of [
    [403, 'INSUFFICIENT_ACCESS'],
    [403, 'API_DISABLED_FOR_ORG'],
    [401, 'ENTITY_SAVE_ERROR'],
  ]) {
    const error = retainConnectDiagnostic(
      new Error('refused'),
      apiDiagnostic(status, [{ errorCode: code, message: 'Some server prose here' }]),
    );
    assert.deepEqual(getConnectDiagnostic(error).errors, [{ code }]);
    assert.match(operationDiagnostic(error, 'Next.'), /authentication or authorization failed/u);
  }
});
