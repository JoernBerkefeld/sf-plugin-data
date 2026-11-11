import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { getMetadataProblems } from '../lib/transport/connect-diagnostic.js';
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

test('bound mapping field DELETE accepts documented 200 and observed 204 on the exact route', async () => {
  const field = await wire('DELETE', 204, operations.deleteField.run);
  assert.deepEqual(field.outcome, { value: undefined });
  assert.deepEqual(field.paths, [`${endpoint}/${name}/field-mappings/observed_selector_123`]);
  const documented = await wire('DELETE', 200, operations.deleteField.run, '{}');
  assert.equal(documented.attempts, 1);
  assert.deepEqual(documented.outcome, { value: undefined });
});

test('mapping delete command builds one bound sender per selector and a bound DMO read', async () => {
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
    return { remove: async () => {} };
  };
  const target = { get: async () => ({}) };
  command.createDloNativeDeleteClient = () => assert.fail('mapping delete reads no DLO');
  command.createDmoNativeDeleteClient = () => target;
  command.createDloClient = command.createDmoClient = () =>
    assert.fail('the mapping DMO read must use the bound DMO client');
  command.preflightDeleteMapping = async (_name, _client, dependencies) => {
    assert.deepEqual(Object.keys(dependencies), ['target']);
    assert.equal(dependencies.target, target);
    return { selected: {}, others: [], targetFields: [] };
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

const scratchPrefix = 'data360-mapping-delete-';
const memberType = 'ObjectSourceTargetMap';
/**
 * Count the retained removal scratch directories under the OS temp directory.
 * @returns {Promise<number>} Number of directories this transport has created so far.
 */
const scratchCount = async () => {
  const entries = await readdir(os.tmpdir());
  return entries.filter((entry) => entry.startsWith(scratchPrefix)).length;
};
/**
 * Synthetic successful Metadata deployment receipt.
 * @param {Array<object>|object} members Component successes besides the manifest entry.
 * @param {object} [overrides] Result overrides.
 * @returns {{exitCode: number, stdout: string}} Runner receipt.
 */
const deployed = (members, overrides = {}) => ({
  exitCode: 0,
  stdout: JSON.stringify({
    status: 0,
    result: {
      success: true,
      status: 'Succeeded',
      details: {
        componentSuccesses: Array.isArray(members)
          ? [{ fullName: 'destructiveChanges.xml', componentType: '', deleted: false }, ...members]
          : members,
      },
      ...overrides,
    },
  }),
});
const member = (fullName = name, extra = {}) => ({
  fullName,
  componentType: memberType,
  deleted: true,
  ...extra,
});
/**
 * Synthetic failed Metadata deployment receipt.
 * @param {unknown} componentFailures Failure entries as the CLI reports them.
 * @param {object} [extra] Further result properties.
 * @returns {{exitCode: number, stdout: string}} Runner receipt.
 */
const failure = (componentFailures, extra = {}) => ({
  exitCode: 1,
  stdout: JSON.stringify({
    status: 1,
    result: { success: false, status: 'Failed', details: { componentFailures }, ...extra },
  }),
});

test('mapping removal transport sends one argument-array Metadata destructive deployment', async () => {
  const runs = [];
  // A bound sender is present in the command; the removal still goes through the CLI runner only.
  const sender = { request: async () => assert.fail('removal must not use the bound sender') };
  const client = createMappingClient(
    'target',
    '68.0',
    async (arguments_, cwd) => {
      runs.push({ arguments_, cwd });
      return deployed([member()]);
    },
    undefined,
    sender,
  );
  assert.equal(await client.remove(name), undefined);
  assert.equal(runs.length, 1);
  const [{ arguments_, cwd }] = runs;
  assert.equal(path.dirname(cwd).toLowerCase(), String.raw`f:\temp`);
  assert.ok(path.basename(cwd).startsWith(scratchPrefix));
  assert.deepEqual(arguments_, [
    'project',
    'deploy',
    'start',
    '--metadata-dir',
    cwd,
    '--target-org',
    'target',
    '--wait',
    '10',
    '--json',
  ]);
  // The scratch directory is retained and holds exactly the two manifests.
  const retained = await readdir(cwd);
  assert.deepEqual(retained.toSorted(), ['destructiveChanges.xml', 'package.xml']);
  assert.equal(
    await readFile(path.join(cwd, 'package.xml'), 'utf8'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
      '    <version>68.0</version>',
      '</Package>',
      '',
    ].join('\n'),
  );
  assert.equal(
    await readFile(path.join(cwd, 'destructiveChanges.xml'), 'utf8'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
      '    <types>',
      '        <members>Generated_123</members>',
      '        <name>ObjectSourceTargetMap</name>',
      '    </types>',
      '    <version>68.0</version>',
      '</Package>',
      '',
    ].join('\n'),
  );
  // The manifest version follows the client's native API version; a lone success entry may
  // arrive as an object instead of an array.
  const pinned = [];
  await createMappingClient('target', '65.0', async (_arguments, root) => {
    pinned.push(root);
    return deployed(member());
  }).remove(name);
  for (const manifest of ['package.xml', 'destructiveChanges.xml'])
    assert.match(
      await readFile(path.join(pinned[0], manifest), 'utf8'),
      /<version>65\.0<\/version>/u,
    );
});

test('mapping removal transport rejects invalid names before any file or CLI call', async () => {
  let runs = 0;
  const client = createMappingClient('target', '68.0', async () => {
    runs++;
    return deployed([member()]);
  });
  const before = await scratchCount();
  for (const invalid of [
    '',
    '*',
    '../escape',
    '1Generated',
    'Generated 123',
    'Generated-123',
    'Example__dlm.Generated_123',
    'Generated_123</members><members>Other_456',
    `G${'a'.repeat(240)}`,
    5,
  ])
    await assert.rejects(
      client.remove(invalid),
      (error) => error instanceof NativeMappingError && error.code === 'INVALID_MAPPING_NAME',
      String(invalid),
    );
  assert.equal(runs, 0);
  assert.equal(await scratchCount(), before);
});

test('an unconfirmed mapping removal fails with MAPPING_DELETE_FAILED, safe problem texts and no retry', async () => {
  const problem = 'This mapping is referenced elsewhere in Salesforce. Remove the usage first.';
  for (const [receipt, expected] of [
    [failure([{ fullName: name, componentType: memberType, problem }]), [problem]],
    // A single failure may arrive as an object instead of an array.
    [failure({ fullName: name, problem }), [problem]],
    // Deployment-level and envelope-level messages are retained too, without duplicates.
    [failure([{ problem }], { errorMessage: problem }), [problem]],
    [{ exitCode: 1, stdout: JSON.stringify({ status: 1, message: problem }) }, [problem]],
    // Text that fails the display filter is never retained.
    [failure([{ fullName: name, problem: 'Value "secret" at <tag>' }]), []],
    // Reported success that does not list this mapping as a deleted member confirms nothing.
    [deployed([]), []],
    [deployed([member('Other_456')]), []],
    [deployed([member(name.toLowerCase())]), []],
    [deployed([member(name, { componentType: 'CustomField' })]), []],
    [deployed([member(name, { deleted: false })]), []],
    [deployed([member(name, { deleted: 'true' })]), []],
    [deployed([member()], { status: 'SucceededPartial' }), []],
    [deployed([member()], { success: false }), []],
    [{ ...deployed([member()]), exitCode: 1 }, []],
    [{ exitCode: 0, stdout: JSON.stringify({ status: 1, result: {} }) }, []],
    [{ exitCode: 0, stdout: 'not JSON' }, []],
    [{ exitCode: 0, stdout: 'null' }, []],
    [{ exitCode: 0, stdout: '[]' }, []],
  ]) {
    let runs = 0;
    const transport = createMappingClient('target', '68.0', async () => {
      runs++;
      return receipt;
    });
    await assert.rejects(
      transport.remove(name),
      (error) => {
        assert.ok(error instanceof NativeMappingError, receipt.stdout);
        assert.equal(error.code, 'MAPPING_DELETE_FAILED', receipt.stdout);
        assert.deepEqual([...getMetadataProblems(error)], expected, receipt.stdout);
        return true;
      },
      receipt.stdout,
    );
    assert.equal(runs, 1);
  }
});

test('mapping delete command reports a failed removal once, as unknown, with the Metadata problem', async () => {
  const problem = 'This mapping is referenced elsewhere in Salesforce. Remove the usage first.';
  const pairs = ['Id__c', 'Name__c'].map((field) => ({
    sourceFieldDeveloperName: field,
    targetFieldDeveloperName: field,
    developerName: `observed_${field}`,
  }));
  const selected = {
    developerName: name,
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: 'Target__dlm',
    status: 'ACTIVE',
    fieldMappings: pairs,
  };
  const other = { ...selected, developerName: 'Other_456', sourceEntityDeveloperName: 'O__dll' };
  let runs = 0;
  let reads = 0;
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: { metadata: [`mapping:${name}`], 'data-space': 'default', preview: false },
  });
  command.jsonEnabled = () => true;
  command.resolveTarget = async () => 'target';
  command.createMappingSender = () => ({ request: async () => assert.fail('fake reads only') });
  command.createMappingClient = (target, version) => ({
    apiVersion: version,
    list: async () => ({ objectSourceTargetMaps: structuredClone([selected, other]) }),
    get: async (mapping) => {
      reads++;
      return structuredClone(mapping === name ? selected : other);
    },
    delete: async () => assert.fail('no REST DELETE'),
    deleteField: async () => assert.fail('no unmap'),
    remove: createMappingClient(target, version, async () => {
      runs++;
      return failure([{ fullName: name, componentType: memberType, problem }]);
    }).remove,
  });
  command.createDloNativeDeleteClient = () => ({ get: async () => assert.fail('no DLO read') });
  command.createDmoNativeDeleteClient = () => ({
    get: async () => ({
      name: 'Target__dlm',
      label: 'Target',
      creationType: 'Custom',
      dataSpaceName: 'default',
      fields: [{ name: 'Id__c' }, { name: 'Name__c' }],
    }),
  });
  const before = process.exitCode;
  let result;
  try {
    result = await command.run();
  } finally {
    process.exitCode = before;
  }
  assert.equal(result.status, 'failed', JSON.stringify(result));
  assert.equal(result.result.items[0].outcome, 'failed');
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.equal(result.diagnostics.errors.length, 1);
  assert.equal(result.diagnostics.errors[0].code, 'MAPPING_DELETE_FAILED');
  assert.ok(result.diagnostics.errors[0].message.includes(problem), JSON.stringify(result));
  // One deployment attempt and no readback after the failed removal.
  assert.equal(runs, 1);
  assert.equal(reads, 1);
});
