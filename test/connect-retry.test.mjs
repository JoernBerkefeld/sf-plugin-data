import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { ConnectClient, connectRetry } from '../lib/transport/connect-client.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import { createRelationshipClient } from '../lib/transport/relationship-rest.js';

// Only the Metadata API destructive deploys may start a CLI process; no REST write does.
const unusedRunner = async () => assert.fail('a REST write must never start a CLI process');

const origin = 'https://synthetic.my.salesforce.com';
const route = '/services/data/v68.0/ssot/data-model-objects/Synthetic__dlm';
const segment = {
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    lookbackPeriod: 'P90D',
  },
};

/**
 * Record sleeps and warnings instead of waiting or printing.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {{ waits: number[], warnings: string[] }} Recorded waits (ms) and warning lines.
 */
function observe(t) {
  const waits = [];
  const warnings = [];
  t.mock.method(connectRetry, 'sleep', async (milliseconds) => {
    waits.push(milliseconds);
  });
  t.mock.method(connectRetry, 'warn', (message) => {
    warnings.push(message);
  });
  return { waits, warnings };
}

/**
 * A fake connection answering each request with the next outcome.
 * @param {Array<object | Error>} outcomes Errors are thrown, anything else is returned.
 * @returns {{ connection: object, calls: () => number }} Connection and call counter.
 */
function scripted(outcomes) {
  let calls = 0;
  return {
    connection: {
      instanceUrl: origin,
      request: async () => {
        const outcome = outcomes[Math.min(calls++, outcomes.length - 1)];
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
    calls: () => calls,
  };
}

const unavailable = () => Object.assign(new Error('x'), { statusCode: 503 });
const network = (code) => Object.assign(new Error('synthetic network failure'), { code });

test('a GET is retried after a network error and then succeeds', async (t) => {
  const { waits, warnings } = observe(t);
  const fake = scripted([
    network('ETIMEDOUT'),
    new TypeError('fetch failed', { cause: network('ECONNRESET') }),
    { name: 'Synthetic__dlm' },
  ]);
  assert.deepEqual(await new ConnectClient(fake.connection, '68.0').get(route), {
    name: 'Synthetic__dlm',
  });
  assert.equal(fake.calls(), 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(warnings.length, 2);
  assert.match(
    warnings[0],
    /GET .*Synthetic__dlm failed \(ETIMEDOUT\); retrying in 1 s \(attempt 2 of 3\)/u,
  );
  assert.match(warnings[1], /ECONNRESET.*attempt 3 of 3/u);
});

test('a GET gives up after three attempts with the original error', async (t) => {
  const { waits, warnings } = observe(t);
  const fake = scripted([network('ECONNRESET')]);
  await assert.rejects(new ConnectClient(fake.connection, '68.0').get(route), {
    name: 'ConnectError',
    code: 'REQUEST_FAILED',
  });
  assert.equal(fake.calls(), 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(warnings.length, 2);
});

test('a GET is not retried after an unrelated failure', async (t) => {
  const { waits } = observe(t);
  for (const failure of [
    network('EPIPE'),
    Object.assign(new Error('x'), { statusCode: 500 }),
    Object.assign(new Error('x'), { statusCode: 404 }),
  ]) {
    const fake = scripted([failure]);
    await assert.rejects(new ConnectClient(fake.connection, '68.0').get(route));
    assert.equal(fake.calls(), 1);
  }
  assert.deepEqual(waits, []);
});

test('a POST is not retried after a reset, a timeout, 429 or 503', async (t) => {
  const { waits, warnings } = observe(t);
  for (const failure of [
    network('ECONNRESET'),
    network('ETIMEDOUT'),
    network('ECONNABORTED'),
    Object.assign(new Error('x'), { statusCode: 429 }),
    Object.assign(new Error('x'), { statusCode: 503 }),
  ]) {
    const fake = scripted([failure, { id: 'created' }]);
    await assert.rejects(new ConnectClient(fake.connection, '68.0').createSegment(segment), {
      code: 'REQUEST_FAILED',
    });
    assert.equal(fake.calls(), 1);
  }
  assert.deepEqual(waits, []);
  assert.deepEqual(warnings, []);
});

test('a POST is retried when the request never reached Salesforce', async (t) => {
  const { waits, warnings } = observe(t);
  for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN']) {
    const fake = scripted([network(code), { id: 'created' }]);
    assert.deepEqual(
      await new ConnectClient(fake.connection, '68.0').createSegment(segment),
      { id: 'created' },
      code,
    );
    assert.equal(fake.calls(), 2);
  }
  assert.deepEqual(waits, [1000, 1000, 1000, 1000]);
  assert.match(warnings[0], /^POST .*segments failed \(ECONNREFUSED\)/u);
});

test('a 503 is retried for GET only', async (t) => {
  const { waits } = observe(t);
  const read = scripted([unavailable(), { name: 'Synthetic__dlm' }]);
  assert.deepEqual(await new ConnectClient(read.connection, '68.0').get(route), {
    name: 'Synthetic__dlm',
  });
  assert.equal(read.calls(), 2);
  const write = scripted([unavailable(), {}]);
  await assert.rejects(new ConnectClient(write.connection, '68.0').patchSegment(segment), {
    statusCode: 503,
  });
  assert.equal(write.calls(), 1);
  const remove = scripted([unavailable()]);
  await assert.rejects(new ConnectClient(remove.connection, '68.0').deleteSegment('Audience'), {
    statusCode: 503,
  });
  assert.equal(remove.calls(), 1);
  assert.deepEqual(waits, [1000]);
});

/**
 * A real core Connection whose wire answers with scripted status and headers.
 * @param {Array<{ statusCode: number, headers?: object }>} responses Wire responses in order.
 * @returns {{ connection: Connection, calls: () => number }} Connection and call counter.
 */
function wire(responses) {
  let calls = 0;
  const connection = Object.create(Connection.prototype);
  Object.assign(connection, {
    instanceUrl: origin,
    version: '68.0',
    accessToken: 'synthetic-token',
    logger: { getRawLogger: () => ({ debug: () => {} }) },
    _refreshDelegate: undefined,
    _propagators: [],
    _transport: {
      httpRequest: () => {
        const { statusCode, headers = {} } = responses[Math.min(calls++, responses.length - 1)];
        const response = Promise.resolve({
          statusCode,
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(
            statusCode === 200
              ? { name: 'Synthetic__dlm' }
              : [{ errorCode: 'LIMIT', message: 'x' }],
          ),
        });
        response.stream = () => new PassThrough();
        return response;
      },
    },
  });
  return { connection, calls: () => calls };
}

test('a 429 honours Retry-After, capped at 60 s', async (t) => {
  const { waits, warnings } = observe(t);
  const fake = wire([
    { statusCode: 429, headers: { 'retry-after': '7' } },
    { statusCode: 429, headers: { 'Retry-After': '3600' } },
    { statusCode: 200 },
  ]);
  assert.deepEqual(await new ConnectClient(fake.connection, '68.0').get(route), {
    name: 'Synthetic__dlm',
  });
  assert.equal(fake.calls(), 3);
  assert.deepEqual(waits, [7000, 60_000]);
  assert.match(warnings[0], /\(HTTP 429\); retrying in 7 s/u);
});

test('a 429 without Retry-After uses the backoff and gives up after three attempts', async (t) => {
  const { waits } = observe(t);
  const fake = wire([{ statusCode: 429 }]);
  await assert.rejects(new ConnectClient(fake.connection, '68.0').get(route), {
    statusCode: 429,
  });
  assert.equal(fake.calls(), 3);
  assert.deepEqual(waits, [1000, 2000]);
});

/**
 * A scripted fake connection that also records each request it receives.
 * @param {Array<object | Error>} outcomes Errors are thrown, anything else is returned.
 * @returns {{ connection: object, calls: () => number, requests: object[] }} Recorder.
 */
function recorded(outcomes) {
  const fake = scripted(outcomes);
  const requests = [];
  const request = fake.connection.request;
  fake.connection.request = async (input, options) => {
    requests.push(input);
    return request(input, options);
  };
  return { ...fake, requests };
}

const writeMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];

test('a bound write carries its JSON body and is not resent after a reset, a timeout, 429, 503 or an expired session', async (t) => {
  const { waits, warnings } = observe(t);
  for (const method of writeMethods)
    for (const failure of [
      network('ECONNRESET'),
      network('ETIMEDOUT'),
      network('ECONNABORTED'),
      Object.assign(new Error('x'), { statusCode: 429 }),
      Object.assign(new Error('x'), { statusCode: 503 }),
      Object.assign(new Error('expired'), { name: 'INVALID_SESSION_ID', statusCode: 401 }),
    ]) {
      const fake = recorded([failure, { id: 'written' }]);
      let refreshes = 0;
      fake.connection.refreshAuth = async () => {
        refreshes++;
      };
      const sender = openBoundSsot('target', '68.0', async () => fake.connection);
      await assert.rejects(sender.request(method, route, undefined, { label: 'Synthetic' }));
      assert.equal(fake.calls(), 1, `${method} ${failure.code ?? failure.statusCode}`);
      assert.equal(refreshes, 0);
      assert.equal(fake.requests[0].method, method);
      assert.equal(fake.requests[0].body, '{"label":"Synthetic"}');
      assert.equal(fake.requests[0].headers['content-type'], 'application/json');
    }
  assert.deepEqual(waits, []);
  assert.deepEqual(warnings, []);
});

test('a bound write is resent only when it never reached Salesforce', async (t) => {
  const { waits } = observe(t);
  for (const method of writeMethods)
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN']) {
      const fake = recorded([network(code), { id: 'written' }]);
      const sender = openBoundSsot('target', '68.0', async () => fake.connection);
      assert.deepEqual(await sender.request(method, route, undefined, { label: 'Synthetic' }), {
        id: 'written',
      });
      assert.equal(fake.calls(), 2);
      assert.deepEqual(fake.requests[0], fake.requests[1]);
    }
  assert.equal(waits.length, 16);
});

test('family writes go over the bound sender once, never through a child CLI process', async (t) => {
  observe(t);
  const fake = recorded([network('ECONNRESET')]);
  const sender = openBoundSsot('target', '68.0', async () => fake.connection);
  const mappingBody = {
    sourceEntityDeveloperName: 'Synthetic__dll',
    targetEntityDeveloperName: 'Synthetic__dlm',
    fieldMapping: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
  };
  const writes = [
    () => createDloClient('target', '68.0', sender).create({ name: 'Synthetic__dll' }),
    () => createDloClient('target', '68.0', sender).update('0dl000000000001AAA', {}),
    () =>
      createDmoClient('target', '68.0', unusedRunner, sender).create({ name: 'Synthetic__dlm' }),
    () => createDmoClient('target', '68.0', unusedRunner, sender).update('Synthetic__dlm', {}),
    () => createDmoClient('target', '68.0', unusedRunner, sender).delete('Synthetic__dlm'),
    () =>
      createMappingClient('target', '68.0', unusedRunner, undefined, sender).create(mappingBody),
    () =>
      createMappingClient('target', '68.0', unusedRunner, undefined, sender).update(
        'Synthetic',
        mappingBody,
      ),
    () =>
      createRelationshipClient('target', '68.0', undefined, sender).create({
        sourceObjectName: 'Source__dlm',
        sourceFieldName: 'RefId__c',
        targetObjectName: 'Target__dlm',
        targetFieldName: 'Id__c',
        cardinality: 'ManyToOne',
        relationshipOwner: 'DataCloud',
      }),
  ];
  for (const write of writes) await assert.rejects(write(), /UNCONFIRMED/u);
  assert.equal(fake.calls(), writes.length);
  assert.deepEqual(
    fake.requests.map(({ method }) => method),
    ['POST', 'PATCH', 'POST', 'PATCH', 'DELETE', 'POST', 'PATCH', 'POST'],
  );
  assert.ok(
    fake.requests.every(({ method, body }) => method === 'DELETE' || typeof body === 'string'),
  );
});
