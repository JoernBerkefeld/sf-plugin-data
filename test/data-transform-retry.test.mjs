import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  createDataTransformClient,
  createDataTransformDloReader,
} from '../lib/transport/data-transform-rest.js';

// Resolve the actual runtime dependencies alongside the transport, including in installed qualification.
const require = createRequire(new URL('../lib/transport/data-transform-rest.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const id = '1dt000000000001AAA';

for (const method of ['GET', 'PUT', 'DELETE']) {
  for (const response of [420, 429, 503, 'network', 401]) {
    test(`real JSforce ${method} ${response} dispatches once without refresh or replay`, async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      requestModule.setDispatcher(agent);
      let attempts = 0;
      const pool = agent.get(origin);
      const intercept = pool.intercept({ path: /./u, method });
      if (response === 'network') {
        intercept
          .reply(() => {
            attempts++;
            throw Object.assign(new TypeError('synthetic network error'), {
              cause: { code: 'ECONNRESET' },
            });
          })
          .persist();
      } else {
        intercept
          .reply(() => {
            attempts++;
            return {
              statusCode: response,
              data: JSON.stringify([
                {
                  errorCode: response === 401 ? 'INVALID_SESSION_ID' : 'SYNTHETIC_FAILURE',
                  message: 'synthetic',
                },
              ]),
              responseOptions: { headers: { 'content-type': 'application/json' } },
            };
          })
          .persist();
      }
      const connection = new Connection({
        instanceUrl: origin,
        accessToken: 'synthetic-token',
        version: '68.0',
      });
      const refresh = { refresh: () => assert.fail('refresh must never run') };
      connection._refreshDelegate = refresh;
      const client = createDataTransformClient(connection, '68.0', 'default');
      try {
        const operation =
          method === 'GET'
            ? client.get(id)
            : method === 'DELETE'
              ? client.delete(id)
              : client.update(id, input());
        await assert.rejects(operation);
        assert.equal(attempts, 1);
        assert.equal(connection._refreshDelegate, refresh);
      } finally {
        requestModule.setDispatcher();
        await agent.close();
      }
    });
  }
}

/**
 * Build the admitted synthetic definition for a real PUT dispatch.
 * @returns {object} Minimal source/output mapping.
 */
function input() {
  return {
    name: 'SyntheticTransform',
    label: 'Synthetic',
    description: 'Synthetic',
    type: 'BATCH',
    dataSpaceName: 'default',
    definition: {
      type: 'STL',
      version: '56.0',
      nodes: {
        LOAD_DATASET0: {
          action: 'load',
          parameters: {
            dataset: { name: 'SyntheticSource__dll', type: 'dataLakeObject' },
            fields: ['Id__c'],
            sampleDetails: { sortBy: [], type: 'TopN' },
          },
          sources: [],
        },
        OUTPUT0: {
          action: 'outputD360',
          parameters: {
            name: 'SyntheticOutput__dll',
            type: 'dataLakeObject',
            fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
          },
          sources: ['LOAD_DATASET0'],
        },
      },
    },
  };
}

test('Transform DLO reader exposes GET only on the bound API68 receiver', async () => {
  let calls = 0;
  const connection = {
    instanceUrl: origin,
    _refreshDelegate: {},
    request: async function (request, options) {
      calls++;
      assert.notEqual(this, connection);
      assert.equal(this._refreshDelegate, undefined);
      assert.deepEqual(options.retry, { maxRetries: 0, methods: [] });
      assert.throws(() => options.followRedirect(origin));
      assert.deepEqual(request, {
        method: 'GET',
        url: `${origin}/services/data/v68.0/ssot/data-lake-objects/SyntheticSource__dll`,
      });
      return { name: 'SyntheticSource__dll' };
    },
  };
  const reader = createDataTransformDloReader(connection);
  assert.deepEqual(Object.keys(reader), ['get']);
  assert.deepEqual(await reader.get('SyntheticSource__dll'), { name: 'SyntheticSource__dll' });
  for (const name of ['', '../escape', 'Other__dll?x=1', id])
    await assert.rejects(reader.get(name));
  connection.instanceUrl = 'https://other.my.salesforce.com';
  await assert.rejects(reader.get('SyntheticSource__dll'));
  assert.equal(calls, 1);
});
