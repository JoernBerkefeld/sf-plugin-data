import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import Delete from '../lib/commands/data360/delete.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';

// Resolve the actual runtime dependencies alongside the transport.
const require = createRequire(new URL('../lib/transport/bound-ssot.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const name = 'Generated_123';
const endpoint = '/services/data/v68.0/ssot/data-model-object-mappings';
const runner = async () => assert.fail('bound mapping GET/DELETE must never use the CLI runner');

const operations = {
  get: { method: 'GET', run: (client) => client.get(name) },
  list: { method: 'GET', run: (client) => client.list('Target__dlm', 'Source__dll') },
  delete: { method: 'DELETE', run: (client) => client.delete(name) },
  deleteField: {
    method: 'DELETE',
    run: (client) => client.deleteField(name, 'observed_selector_123'),
  },
};

/**
 * Run one real-JSforce mapping request against a mocked wire and count attempts.
 * @param {string} method HTTP method intercepted.
 * @param {number|string} response Status code, or 'network' for a socket failure.
 * @param {(client: object) => Promise<unknown>} operation Client call under test.
 * @param {string} [body] Response body override.
 * @returns {Promise<{attempts: number, paths: string[], outcome: unknown}>} Attempts and settled outcome.
 */
async function wire(method, response, operation, body) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  requestModule.setDispatcher(agent);
  let attempts = 0;
  const paths = [];
  agent
    .get(origin)
    .intercept({ path: /./u, method })
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
            : JSON.stringify([{ errorCode: 'INVALID_INPUT', message: 'synthetic' }])),
        responseOptions: { headers: { 'content-type': 'application/json' } },
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
  const sender = openBoundSsot('target', '68.0', async () => connection);
  const client = createMappingClient('target', '68.0', runner, undefined, sender);
  try {
    const outcome = await operation(client).then(
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

for (const response of [420, 429, 503, 'network', 401])
  for (const [label, { method, run }] of Object.entries(operations))
    test(`bound mapping ${label} ${response} is sent once without refresh or replay`, async () => {
      const { attempts, outcome } = await wire(method, response, run);
      assert.equal(attempts, 1);
      assert.ok(outcome.error instanceof NativeMappingError);
      if (response === 'network') assert.equal(outcome.error.code, 'MAPPING_REQUEST_UNCONFIRMED');
      else {
        assert.equal(outcome.error.code, 'MAPPING_HTTP_ERROR');
        assert.equal(outcome.error.status, response);
      }
    });

test('bound mapping GET 404 maps to MAPPING_HTTP_ERROR 404 for absence', async () => {
  const { attempts, outcome } = await wire('GET', 404, operations.get.run);
  assert.equal(attempts, 1);
  assert.equal(outcome.error.code, 'MAPPING_HTTP_ERROR');
  assert.equal(outcome.error.status, 404);
});

test('bound mapping GET returns the parsed object on the exact routes', async () => {
  const item = { developerName: name, fieldMappings: [] };
  const got = await wire('GET', 200, operations.get.run, JSON.stringify(item));
  assert.deepEqual(got.outcome, { value: item });
  assert.deepEqual(got.paths, [`${endpoint}/${name}`]);
  const listed = await wire('GET', 200, operations.list.run, JSON.stringify({ items: [] }));
  assert.deepEqual(listed.outcome, { value: { items: [] } });
  assert.deepEqual(listed.paths, [
    `${endpoint}?dmoDeveloperName=Target__dlm&dloDeveloperName=Source__dll`,
  ]);
});

test('bound mapping GET rejects array bodies and HTTP 204', async () => {
  const array = await wire('GET', 200, operations.get.run, '[]');
  assert.equal(array.outcome.error.code, 'INVALID_MAPPING_RESPONSE');
  const empty = await wire('GET', 204, operations.get.run);
  assert.equal(empty.attempts, 1);
  assert.equal(empty.outcome.error.code, 'MAPPING_REQUEST_UNCONFIRMED');
});

test('bound mapping DELETE accepts documented 200 and observed 204 on exact routes', async () => {
  const deleted = await wire('DELETE', 204, operations.delete.run);
  assert.deepEqual(deleted.outcome, { value: undefined });
  assert.deepEqual(deleted.paths, [`${endpoint}/${name}`]);
  const field = await wire('DELETE', 204, operations.deleteField.run);
  assert.deepEqual(field.outcome, { value: undefined });
  assert.deepEqual(field.paths, [`${endpoint}/${name}/field-mappings/observed_selector_123`]);
  // Same contract as the runner path (native-mapping.test.mjs "accepts documented200 and observed204").
  for (const run of [operations.delete.run, operations.deleteField.run]) {
    const documented = await wire('DELETE', 200, run, '{}');
    assert.equal(documented.attempts, 1);
    assert.deepEqual(documented.outcome, { value: undefined });
  }
});

test('mapping delete command builds one bound sender per selector and bound parent reads', async () => {
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: { metadata: ['mapping:Generated_123'], 'data-space': 'default', preview: true },
  });
  command.jsonEnabled = () => true;
  command.resolveTarget = async () => 'target';
  const sender = { request: async () => assert.fail('fake mapping client only') };
  const calls = [];
  command.createMappingSender = (target, version) => {
    calls.push(['sender', target, version]);
    return sender;
  };
  command.createMappingClient = (_target, _version, actualRunner, _scope, actualSender) => {
    assert.equal(actualRunner, undefined);
    assert.equal(actualSender, sender);
    return { delete: async () => {} };
  };
  const source = { get: async () => ({}) };
  const target = { get: async () => ({}) };
  command.createDloNativeDeleteClient = () => source;
  command.createDmoNativeDeleteClient = () => target;
  command.createDloClient = command.createDmoClient = () =>
    assert.fail('mapping parent reads must use the bound DLO/DMO clients');
  command.preflightDeleteMapping = async (_name, _client, dependencies) => {
    assert.equal(dependencies.source, source);
    assert.equal(dependencies.target, target);
    return { removals: [] };
  };
  const before = process.exitCode;
  try {
    const result = await command.run();
    assert.equal(result.status, 'success');
  } finally {
    process.exitCode = before;
  }
  assert.deepEqual(calls, [['sender', 'target', '68.0']]);
});
