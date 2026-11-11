import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createNativeDloDeleteClient } from '../lib/transport/dlo-native-rest.js';
import Delete from '../lib/commands/data360/delete.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../lib/services/native-dlo.js';

// Resolve the actual runtime dependencies alongside the transport.
const require = createRequire(new URL('../lib/transport/dlo-native-rest.js', import.meta.url));
const { Connection } = require('@jsforce/jsforce-node');
const requestModule = require('@jsforce/jsforce-node/lib/request.js');
const { MockAgent } = require('undici');
const origin = 'https://synthetic.my.salesforce.com';
const id = '1dl000000000001AAA';
const name = 'Example__dll';

/**
 * Run one real-JSforce request against a mocked wire and count attempts.
 * @param {string} method HTTP method intercepted.
 * @param {number|string} response Status code, or 'network' for a socket failure.
 * @param {(client: object) => Promise<unknown>} operation Client call under test.
 * @param {unknown} [body] JSON answer for a successful response.
 * @returns {Promise<{attempts: number, outcome: unknown, paths: string[]}>} Attempts, outcome and requested paths.
 */
async function wire(method, response, operation, body) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  requestModule.setDispatcher(agent);
  let attempts = 0;
  const paths = [];
  const intercept = agent.get(origin).intercept({ path: /./u, method });
  intercept
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
            : body === undefined
              ? JSON.stringify([{ errorCode: 'INVALID_INPUT', message: 'synthetic' }])
              : JSON.stringify(body),
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
  const client = createNativeDloDeleteClient('target', '68.0', async () => connection);
  try {
    const outcome = await operation(client).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    assert.equal(connection._refreshDelegate, refresh);
    return { attempts, outcome, paths };
  } finally {
    requestModule.setDispatcher();
    await agent.close();
  }
}

for (const response of [420, 429, 500, 503, 'network', 401])
  for (const method of ['GET', 'DELETE'])
    test(`bound DLO ${method} ${response} is sent once without refresh or replay`, async () => {
      const { attempts, outcome } = await wire(method, response, (client) =>
        method === 'GET' ? client.get(name) : client.delete(id),
      );
      assert.equal(attempts, 1);
      assert.ok(outcome.error instanceof DloError);
    });

test('bound DLO DELETE 204 resolves once; any GET 404 maps to absence', async () => {
  const deleted = await wire('DELETE', 204, (client) => client.delete(id));
  assert.equal(deleted.attempts, 1);
  assert.deepEqual(deleted.outcome, { value: undefined });
  // Live DLO 404 bodies carry INVALID_INPUT, so absence must not depend on ITEM_NOT_FOUND.
  const missing = await wire('GET', 404, (client) => client.get(name));
  assert.equal(missing.attempts, 1);
  assert.equal(missing.outcome.error.code, 'DLO_HTTP_ERROR');
  assert.equal(missing.outcome.error.status, 404);
});

test('bound DLO dependencies GET reads the dependency route once; 404 is DLO_HTTP_ERROR', async () => {
  const listed = {
    dependencies: [{ componentType: 'DataModelObject', id: '0dm000000000001AAA', name: 'X__dlm' }],
    totalSize: 1,
  };
  const read = await wire('GET', 200, (client) => client.dependencies('X__dll'), listed);
  assert.equal(read.attempts, 1);
  assert.deepEqual(read.paths, ['/services/data/v68.0/ssot/data-lake-objects/X__dll/dependencies']);
  assert.deepEqual(read.outcome, { value: listed });
  const missing = await wire('GET', 404, (client) => client.dependencies('X__dll'));
  assert.equal(missing.attempts, 1);
  assert.ok(missing.outcome.error instanceof DloError);
  assert.equal(missing.outcome.error.code, 'DLO_HTTP_ERROR');
  assert.equal(missing.outcome.error.status, 404);
  for (const status of [500, 'network']) {
    const failed = await wire('GET', status, (client) => client.dependencies('X__dll'));
    assert.equal(failed.attempts, 1);
    assert.ok(failed.outcome.error instanceof DloError);
  }
});

test('bound DLO client rejects unsafe names and IDs before any request', async () => {
  const client = createNativeDloDeleteClient('target', '68.0', async () =>
    assert.fail('no connection for invalid input'),
  );
  await assert.rejects(client.get('../Bad__dll'), /INVALID_DLO_NAME/);
  await assert.rejects(client.dependencies('../Bad__dll'), /INVALID_DLO_NAME/);
  await assert.rejects(client.delete('../1dl'), /INVALID_DLO_TARGET_ID/);
});

const runtime = {
  id,
  name,
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
};

test('DLO still readable after acknowledged DELETE is deletion-unconfirmed, never replayed', async () => {
  for (const json of [true, false]) {
    let deletes = 0;
    const lines = [];
    const command = Object.create(Delete.prototype);
    command.parse = async () => ({ flags: { metadata: [`dlo:${name}`], preview: false } });
    command.jsonEnabled = () => json;
    command.log = (line) => lines.push(line);
    command.resolveTarget = async () => 'target';
    command.retrieveDlo = retrieveNativeDlo;
    command.deleteDlo = deleteNativeDlo;
    command.createDloNativeDeleteClient = () => ({
      get: async () => structuredClone(runtime),
      delete: async () => {
        deletes++;
      },
      dependencies: async () => ({ dependencies: [], totalSize: 0 }),
    });
    const before = process.exitCode;
    let result;
    try {
      result = await command.run();
    } finally {
      process.exitCode = before;
    }
    assert.equal(deletes, 1);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
    assert.equal(result.result.items[0].mutation, 'acknowledged');
    assert.deepEqual(
      result.diagnostics.errors.map(({ code }) => code),
      ['DLO_DELETE_NOT_CONFIRMED'],
    );
    if (!json) {
      assert.equal(lines[0], 'Delete: failed.');
      assert.ok(lines.some((line) => line.startsWith('DLO_DELETE_NOT_CONFIRMED: ')));
    }
  }
});

test('human output names the reason when a DLO delete is blocked before any write', async () => {
  const lines = [];
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags: { metadata: [`dlo:${name}`], preview: true } });
  command.jsonEnabled = () => false;
  command.log = (line) => lines.push(line);
  command.resolveTarget = async () => 'target';
  command.retrieveDlo = retrieveNativeDlo;
  command.createDloNativeDeleteClient = () => ({
    get: async () => {
      throw new DloError('DLO_HTTP_ERROR', 403);
    },
    delete: async () => assert.fail('preview never deletes'),
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  const before = process.exitCode;
  try {
    await command.run();
  } finally {
    process.exitCode = before;
  }
  assert.equal(lines[0], 'Delete preview: blocked.');
  assert.ok(lines.some((line) => line.startsWith('DLO_HTTP_ERROR: ')));
});

/**
 * Run one public DLO delete whose post-DELETE read is supplied by the caller.
 * @param {() => Promise<unknown>} readback Second GET behaviour.
 * @param {boolean} json Whether JSON output is enabled.
 * @returns {Promise<{result: object, lines: string[], deletes: number}>} Envelope and printed lines.
 */
async function deleteWithReadback(readback, json) {
  let deletes = 0;
  let reads = 0;
  const lines = [];
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags: { metadata: [`dlo:${name}`], preview: false } });
  command.jsonEnabled = () => json;
  command.log = (line) => lines.push(line);
  command.resolveTarget = async () => 'target';
  command.retrieveDlo = retrieveNativeDlo;
  command.deleteDlo = deleteNativeDlo;
  command.createDloNativeDeleteClient = () => ({
    get: async () => (++reads === 1 ? structuredClone(runtime) : readback()),
    delete: async () => {
      deletes++;
    },
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  const before = process.exitCode;
  try {
    return { result: await command.run(), lines, deletes };
  } finally {
    process.exitCode = before;
  }
}

test('DLO read back in a DELETING state is acknowledged-processing, not a failure', async () => {
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
        `deleted dlo ${name} (server is still processing)`,
      ]);
  }
  // A DELETING read of a different record ID does not count as this deletion.
  const other = await deleteWithReadback(
    async () => ({ ...structuredClone(runtime), id: '1dl000000000009AAA', status: 'DELETING' }),
    true,
  );
  assert.equal(other.result.result.items[0].outcome, 'deletion-unconfirmed');
});

test('failed read after DELETE is unconfirmed and keeps the API detail', async () => {
  const { result, lines, deletes } = await deleteWithReadback(async () => {
    throw retainConnectDiagnostic(new DloError('DLO_HTTP_ERROR', 503), connectDiagnostic(503));
  }, false);
  assert.equal(deletes, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
  assert.equal(result.result.items[0].mutation, 'acknowledged');
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DLO_DELETE_NOT_CONFIRMED');
  assert.match(diagnostic.message, /HTTP 503/u);
  assert.match(diagnostic.message, /absence could not be confirmed/u);
  assert.doesNotMatch(diagnostic.message, /still readable/u);
  assert.ok(lines.some((line) => line.startsWith('DLO_DELETE_NOT_CONFIRMED: ')));
});
