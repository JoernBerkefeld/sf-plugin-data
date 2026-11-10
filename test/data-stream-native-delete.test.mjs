import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createDataStreamClient, DataStreamHttpError } from '../lib/transport/data-stream-rest.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import { getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

// Resolve the actual runtime dependencies alongside the transport.
const require = createRequire(new URL('../lib/transport/bound-ssot.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const streamId = '1dsaj00000000001AA';

/**
 * Send one stream DELETE through real JSforce against a mocked wire; the CLI runner must stay unused.
 * @param {number|string} response Status code, or 'network' for a socket failure.
 * @param {boolean} deleteDlo Cascade flag forwarded to the route.
 * @returns {Promise<{attempts: number, paths: string[], outcome: unknown}>} Attempts and settled outcome.
 */
async function wire(response, deleteDlo = false) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  requestModule.setDispatcher(agent);
  let attempts = 0;
  const paths = [];
  agent
    .get(origin)
    .intercept({ path: /./u, method: 'DELETE' })
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
          response === 204
            ? ''
            : JSON.stringify([{ errorCode: 'INVALID_INPUT', message: 'synthetic' }]),
        responseOptions: { headers: { 'content-type': 'application/json', 'retry-after': '7' } },
      };
    })
    .persist();
  const connection = new Connection({
    instanceUrl: origin,
    accessToken: 'synthetic-token',
    version: '68.0',
  });
  const refresh = { refresh: () => assert.fail('refresh must never run') };
  connection._refreshDelegate = refresh;
  const client = createDataStreamClient(
    'target',
    { get: async () => assert.fail('no read in this test') },
    '68.0',
    async () => assert.fail('the child CLI runner must never run'),
    openBoundSsot('target', '68.0', async () => connection),
  );
  try {
    const outcome = await client.delete(streamId, deleteDlo).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    assert.equal(connection._refreshDelegate, refresh);
    return { attempts, paths, outcome };
  } finally {
    requestModule.setDispatcher();
    await agent.close();
  }
}

for (const response of [420, 429, 500, 503, 'network', 401])
  test(`bound stream DELETE ${response} is sent once without refresh, replay or runner`, async () => {
    const { attempts, outcome } = await wire(response);
    assert.equal(attempts, 1);
    assert.ok(outcome.error instanceof DataStreamHttpError);
    if (response === 'network') assert.equal(outcome.error.code, 'STREAM_REQUEST_UNCONFIRMED');
    else {
      assert.equal(outcome.error.code, 'STREAM_HTTP_ERROR');
      assert.equal(outcome.error.status, response);
      assert.equal(getConnectDiagnostic(outcome.error)?.statusCode, response);
    }
  });

test('bound stream DELETE 204 resolves once and forwards the DLO cascade flag', async () => {
  for (const deleteDlo of [false, true]) {
    const { attempts, paths, outcome } = await wire(204, deleteDlo);
    assert.equal(attempts, 1);
    assert.deepEqual(paths, [
      `/services/data/v68.0/ssot/data-streams/${streamId}?shouldDeleteDataLakeObject=${deleteDlo}`,
    ]);
    assert.deepEqual(outcome, { value: undefined });
  }
});

test('bound stream DELETE without HTTP 204 is unconfirmed', async () => {
  const { attempts, outcome } = await wire(200);
  assert.equal(attempts, 1);
  assert.equal(outcome.error.code, 'STREAM_DELETE_UNCONFIRMED');
});
