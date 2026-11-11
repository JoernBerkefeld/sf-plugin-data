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
      assert.equal(attempts, 1);
      assert.ok(outcome.error instanceof family.Error);
      assert.equal(outcome.error.code, `${family.prefix}_HTTP_ERROR`);
      assert.equal(outcome.error.status, status);
    });

  test(`bound ${label} GET network failure, 204 and array body are unconfirmed or invalid`, async () => {
    const network = await wire(family, 'network');
    assert.equal(network.outcome.error.code, `${family.prefix}_REQUEST_UNCONFIRMED`);
    const empty = await wire(family, 204);
    assert.equal(empty.outcome.error.code, `${family.prefix}_REQUEST_UNCONFIRMED`);
    assert.equal(empty.outcome.error.status, 204);
    const array = await wire(family, 200, '[]');
    assert.equal(array.outcome.error.code, `INVALID_${family.prefix}_RESPONSE`);
  });
}
