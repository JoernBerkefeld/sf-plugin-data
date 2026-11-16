import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';

// Resolve the actual runtime dependencies alongside the transport.
const require = createRequire(new URL('../lib/transport/bound-ssot.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const runner = async () => assert.fail('a bound GET must never start a CLI process');

const families = {
  dlo: {
    create: (sender) => createDloClient('target', '68.0', runner, sender),
    name: 'Example__dll',
    route: '/services/data/v68.0/ssot/data-lake-objects/Example__dll',
    Error: DloError,
    prefix: 'DLO',
  },
  dmo: {
    create: (sender) => createDmoClient('target', '68.0', runner, sender),
    name: 'Example__dlm',
    route: '/services/data/v68.0/ssot/data-model-objects/Example__dlm',
    Error: NativeDmoError,
    prefix: 'DMO',
  },
};

/**
 * Send one GET through a deploy client with a bound sender against a mocked wire.
 * @param {object} family Family under test.
 * @param {number|string} response Status code, or 'network' for a socket failure.
 * @param {string} [body] Response body override.
 * @returns {Promise<{attempts: number, paths: string[], outcome: object}>} Attempts and settled outcome.
 */
async function wire(family, response, body) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  requestModule.setDispatcher(agent);
  let attempts = 0;
  const paths = [];
  agent
    .get(origin)
    .intercept({ path: /./u, method: 'GET' })
    .reply((options) => {
      attempts++;
      paths.push(options.path);
      if (response === 'network')
        throw Object.assign(new TypeError('synthetic network error'), {
          cause: { code: 'ECONNRESET' },
        });
      return {
        statusCode: response,
        data:
          body ??
          (response === 204
            ? ''
            : JSON.stringify([{ errorCode: 'NOT_FOUND', message: 'synthetic' }])),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    })
    .persist();
  const connection = new Connection({
    instanceUrl: origin,
    accessToken: 'synthetic-token',
    version: '68.0',
  });
  connection._refreshDelegate = { refresh: () => assert.fail('refresh must never run') };
  const client = family.create(openBoundSsot('target', '68.0', async () => connection));
  try {
    const outcome = await client.get(family.name).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    return { attempts, paths, outcome };
  } finally {
    requestModule.setDispatcher();
    await agent.close();
  }
}

for (const [label, family] of Object.entries(families)) {
  test(`bound ${label} GET returns the parsed object on the exact route, once`, async () => {
    const item = { name: family.name, fields: [] };
    const { attempts, paths, outcome } = await wire(family, 200, JSON.stringify(item));
    assert.equal(attempts, 1);
    assert.deepEqual(paths, [family.route]);
    assert.deepEqual(outcome, { value: item });
  });

  // Absence decisions (create versus update, deletion readback) depend on these exact codes.
  for (const status of [404, 401, 503])
    test(`bound ${label} GET ${status} keeps the ${family.prefix} HTTP error code`, async () => {
      const { attempts, outcome } = await wire(family, status);
      // A 503 read is retried by the transport (three attempts in all); others are sent once.
      assert.equal(attempts, status === 503 ? 3 : 1);
      assert.ok(outcome.error instanceof family.Error);
      assert.equal(outcome.error.code, `${family.prefix}_HTTP_ERROR`);
      assert.equal(outcome.error.status, status);
    });

  test(`bound ${label} GET network failure, 204 and array body are unconfirmed or invalid`, async () => {
    const network = await wire(family, 'network');
    assert.equal(network.outcome.error.code, `${family.prefix}_REQUEST_UNCONFIRMED`);
    // The real fetch failure carries ECONNRESET as its cause; the read is retried twice.
    assert.equal(network.attempts, 3);
    const empty = await wire(family, 204);
    assert.equal(empty.outcome.error.code, `${family.prefix}_REQUEST_UNCONFIRMED`);
    assert.equal(empty.outcome.error.status, 204);
    const array = await wire(family, 200, '[]');
    assert.equal(array.outcome.error.code, `INVALID_${family.prefix}_RESPONSE`);
  });
}

/**
 * Send one request through a bound sender whose wire answers each attempt from a list; the
 * connection's core refresh is a counted stub.
 * @param {'GET'|'DELETE'} method Request method.
 * @param {number[]} statuses Status of each attempt in order.
 * @param {boolean} [refreshFails] Whether the refresh itself fails.
 * @returns {Promise<{attempts: number, refreshes: number, tokens: string[], outcome: object}>} Result.
 */
async function expiring(method, statuses, refreshFails = false) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  requestModule.setDispatcher(agent);
  let attempts = 0;
  let refreshes = 0;
  const tokens = [];
  agent
    .get(origin)
    .intercept({ path: /./u, method })
    .reply((options) => {
      tokens.push(options.headers.authorization ?? options.headers.Authorization);
      const status = statuses[attempts++];
      return {
        statusCode: status,
        data:
          status === 401
            ? JSON.stringify([{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired' }])
            : status === 204
              ? ''
              : JSON.stringify({ name: 'Example__dll', fields: [] }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    })
    .persist();
  const connection = new Connection({
    instanceUrl: origin,
    accessToken: 'stale-token',
    version: '68.0',
  });
  connection._refreshDelegate = { refresh: () => assert.fail('JSforce refresh must never run') };
  connection.refreshAuth = async () => {
    refreshes++;
    if (refreshFails) throw new Error('synthetic refresh failure');
    connection.accessToken = 'fresh-token';
  };
  const sender = openBoundSsot('target', '68.0', async () => connection);
  try {
    const noContent = Symbol('deleted');
    const outcome = await sender
      .request(method, '/services/data/v68.0/ssot/data-lake-objects/Example__dll', noContent)
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    return { attempts, refreshes, tokens, outcome };
  } finally {
    requestModule.setDispatcher();
    await agent.close();
  }
}

test('a bound GET answered 401 INVALID_SESSION_ID refreshes once and is sent once more', async () => {
  const { attempts, refreshes, tokens, outcome } = await expiring('GET', [401, 200]);
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);
  assert.deepEqual(tokens, ['Bearer stale-token', 'Bearer fresh-token']);
  assert.deepEqual(outcome, { value: { name: 'Example__dll', fields: [] } });
  // Still expired after the refresh: no second refresh or resend.
  const again = await expiring('GET', [401, 401, 200]);
  assert.equal(again.attempts, 2);
  assert.equal(again.refreshes, 1);
  assert.equal(again.outcome.error.code, 'AUTHENTICATION_FAILED');
  // A failed refresh reports the original authentication failure and sends nothing more.
  const failed = await expiring('GET', [401, 200], true);
  assert.equal(failed.attempts, 1);
  assert.equal(failed.refreshes, 1);
  assert.equal(failed.outcome.error.code, 'AUTHENTICATION_FAILED');
});

test('a bound DELETE answered 401 INVALID_SESSION_ID is neither refreshed nor resent', async () => {
  const { attempts, refreshes, outcome } = await expiring('DELETE', [401, 204]);
  assert.equal(attempts, 1);
  assert.equal(refreshes, 0);
  assert.equal(outcome.error.code, 'AUTHENTICATION_FAILED');
});
