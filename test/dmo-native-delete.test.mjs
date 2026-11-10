import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createNativeDmoDeleteClient } from '../lib/transport/dmo-native-rest.js';
import Delete from '../lib/commands/data360/delete.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { deleteNativeDmo, retrieveNativeDmo } from '../lib/services/native-dmo.js';

// Resolve the actual runtime dependencies alongside the transport.
const require = createRequire(new URL('../lib/transport/bound-ssot.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const name = 'Example__dlm';

/**
 * Run one real-JSforce request against a mocked wire and count attempts.
 * @param {string} method HTTP method intercepted.
 * @param {number|string} response Status code, or 'network' for a socket failure.
 * @param {(client: object) => Promise<unknown>} operation Client call under test.
 * @returns {Promise<{attempts: number, paths: string[], outcome: unknown}>} Attempts and settled outcome.
 */
async function wire(method, response, operation) {
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
          response === 204
            ? ''
            : JSON.stringify([{ errorCode: 'INVALID_INPUT', message: 'synthetic' }]),
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
  const client = createNativeDmoDeleteClient('target', '68.0', async () => connection);
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

for (const response of [420, 429, 500, 503, 'network', 401])
  for (const method of ['GET', 'DELETE'])
    test(`bound DMO ${method} ${response} is sent once without refresh or replay`, async () => {
      const { attempts, outcome } = await wire(method, response, (client) =>
        method === 'GET' ? client.get(name) : client.delete(name),
      );
      assert.equal(attempts, 1);
      assert.ok(outcome.error instanceof NativeDmoError);
      if (response === 'network') assert.equal(outcome.error.code, 'DMO_REQUEST_UNCONFIRMED');
      else {
        assert.equal(outcome.error.code, 'DMO_HTTP_ERROR');
        assert.equal(outcome.error.status, response);
      }
    });

test('bound DMO DELETE 204 resolves once by name; any GET 404 maps to absence', async () => {
  const deleted = await wire('DELETE', 204, (client) => client.delete(name));
  assert.equal(deleted.attempts, 1);
  assert.deepEqual(deleted.paths, [`/services/data/v68.0/ssot/data-model-objects/${name}`]);
  assert.deepEqual(deleted.outcome, { value: undefined });
  const missing = await wire('GET', 404, (client) => client.get(name));
  assert.equal(missing.attempts, 1);
  assert.equal(missing.outcome.error.code, 'DMO_HTTP_ERROR');
  assert.equal(missing.outcome.error.status, 404);
});

test('bound DMO DELETE without HTTP 204 is unconfirmed', async () => {
  const { attempts, outcome } = await wire('DELETE', 200, (client) => client.delete(name));
  assert.equal(attempts, 1);
  assert.equal(outcome.error.code, 'DMO_DELETE_UNCONFIRMED');
});

test('bound DMO client rejects unsafe names before any request', async () => {
  const client = createNativeDmoDeleteClient('target', '68.0', async () =>
    assert.fail('no connection for invalid input'),
  );
  await assert.rejects(client.get('../Bad__dlm'), /INVALID_DMO_NAME/);
  await assert.rejects(client.delete('0gjaj00000JWkxdAAD'), /INVALID_DMO_NAME/);
});

const runtime = {
  id: 'never-use-id',
  name,
  label: 'Example',
  category: 'Other',
  creationType: 'Custom',
  dataSpaceName: 'default',
  fields: [{ name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true }],
};

/**
 * Run one public DMO delete whose post-DELETE read is supplied by the caller.
 * @param {() => Promise<unknown>} readback Second GET behaviour.
 * @param {boolean} json Whether JSON output is enabled.
 * @returns {Promise<{result: object, lines: string[], deletes: number}>} Envelope and printed lines.
 */
async function deleteWithReadback(readback, json) {
  let deletes = 0;
  let reads = 0;
  const lines = [];
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags: { metadata: [`dmo:${name}`], preview: false } });
  command.jsonEnabled = () => json;
  command.log = (line) => lines.push(line);
  command.resolveTarget = async () => 'target';
  command.retrieveDmo = retrieveNativeDmo;
  command.deleteDmo = deleteNativeDmo;
  command.createDmoNativeDeleteClient = () => ({
    get: async () => (++reads === 1 ? structuredClone(runtime) : readback()),
    delete: async () => {
      deletes++;
    },
  });
  const before = process.exitCode;
  try {
    return { result: await command.run(), lines, deletes };
  } finally {
    process.exitCode = before;
  }
}

test('DMO absent after DELETE is confirmed deleted', async () => {
  const { result, lines, deletes } = await deleteWithReadback(async () => {
    throw new NativeDmoError('DMO_HTTP_ERROR', 404);
  }, false);
  assert.equal(deletes, 1);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].mutation, 'confirmed-deleted');
  assert.deepEqual(lines, ['Delete: success.', `deleted dmo ${name}`]);
});

test('DMO read back in a DELETING state is acknowledged-processing, not a failure', async () => {
  for (const json of [true, false]) {
    const { result, lines, deletes } = await deleteWithReadback(
      async () => ({ ...structuredClone(runtime), status: 'DELETING' }),
      json,
    );
    assert.equal(deletes, 1);
    assert.equal(result.status, 'success');
    assert.equal(result.result.items[0].outcome, 'deletion-processing');
    assert.equal(result.result.items[0].mutation, 'acknowledged-processing');
    if (!json)
      assert.deepEqual(lines, [
        'Delete: success.',
        `deleted dmo ${name} (server is still processing)`,
      ]);
  }
  // A DELETING read of a different name does not count as this deletion.
  const other = await deleteWithReadback(
    async () => ({ ...structuredClone(runtime), name: 'Other__dlm', status: 'DELETING' }),
    true,
  );
  assert.equal(other.result.result.items[0].outcome, 'deletion-unconfirmed');
});

test('DMO still readable after acknowledged DELETE is deletion-unconfirmed, never replayed', async () => {
  for (const json of [true, false]) {
    const { result, lines, deletes } = await deleteWithReadback(
      async () => structuredClone(runtime),
      json,
    );
    assert.equal(deletes, 1);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
    assert.equal(result.result.items[0].mutation, 'acknowledged');
    const [diagnostic] = result.diagnostics.errors;
    assert.equal(diagnostic.code, 'DMO_DELETE_NOT_CONFIRMED');
    assert.match(diagnostic.message, /DMO was still readable/u);
    if (!json) {
      assert.equal(lines[0], 'Delete: failed.');
      assert.ok(lines.some((line) => line.startsWith('DMO_DELETE_NOT_CONFIRMED: ')));
    }
  }
});

test('failed DMO read after DELETE is unconfirmed and keeps the API detail', async () => {
  const { result, deletes } = await deleteWithReadback(async () => {
    throw retainConnectDiagnostic(
      new NativeDmoError('DMO_HTTP_ERROR', 503),
      connectDiagnostic(503),
    );
  }, true);
  assert.equal(deletes, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_DELETE_NOT_CONFIRMED');
  assert.match(diagnostic.message, /HTTP 503/u);
  assert.match(diagnostic.message, /absence could not be confirmed/u);
  assert.doesNotMatch(diagnostic.message, /still readable/u);
});
