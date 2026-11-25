import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSpaceError, exitCodeOf, listDataSpaces } from 'sf-plugin-data/api';
import ListDataSpace from '../lib/commands/data360/list/dataspace.js';
import { connectRetry } from '../lib/transport/connect-client.js';
import { errorCodeInfo } from '../lib/errors/registry.js';

const route = '/services/data/v68.0/ssot/data-spaces';
const spaces = [
  { name: 'default', label: 'Default', id: '0vhSynthetic01', dataSpaceType: 'Default' },
  { name: 'dataspace2', label: 'Data Space 2', prefix: 'ds2', id: '0vhSynthetic02' },
  { name: 'nolabel', prefix: 'nl', status: 'Active', description: '' },
];

/**
 * A connection over a synthetic org; `answer(url)` returns a body or an Error to throw.
 * @param {(url: URL) => unknown} answer Scripted answers.
 * @param {URL[]} urls Receives every requested URL.
 * @returns {object} Connection.
 */
const orgOf = (answer, urls = []) => ({
  instanceUrl: 'https://synthetic.example',
  getUsername: () => 'synthetic@example.invalid',
  request: async (request) => {
    const url = new URL(typeof request === 'string' ? request : request.url);
    urls.push(url);
    const value = answer(url);
    if (value instanceof Error) throw value;
    return value;
  },
});

/**
 * The data space list answered page by page from `entries`.
 * @param {object[]} entries Data spaces.
 * @returns {(url: URL) => object} Answer.
 */
const paged = (entries) => (url) => {
  assert.equal(url.pathname, route);
  const size = Number(url.searchParams.get('batchSize'));
  const offset = Number(url.searchParams.get('offset'));
  return { dataSpaces: entries.slice(offset, offset + size), totalSize: entries.length };
};

const failure = (statusCode) => Object.assign(new Error('synthetic'), { statusCode });
const expired = () =>
  Object.assign(new Error('expired'), {
    name: 'INVALID_SESSION_ID',
    errorCode: 'INVALID_SESSION_ID',
  });

/**
 * Run the command on a scripted connection.
 * @param {(url: URL) => unknown} answer Scripted answers.
 * @param {import('node:test').TestContext} t Test context.
 * @param {object} [options] Switches.
 * @param {boolean} [options.json] Run as with --json.
 * @param {boolean} [options.noOrg] The target org cannot be resolved.
 * @param {boolean} [options.noTarget] Run without --target-org.
 * @returns {Promise<{envelope: object, logs: string[], exitCode: unknown, alias: unknown}>} Outcome.
 */
const run = async (answer, t, options = {}) => {
  t.mock.method(connectRetry, 'sleep', async () => {});
  t.mock.method(connectRetry, 'warn', () => {});
  const command = Object.create(ListDataSpace.prototype);
  const logs = [];
  let alias;
  command.parse = async () => ({
    flags: options.noTarget ? {} : { 'target-org': 'synthetic' },
  });
  command.jsonEnabled = () => options.json === true;
  command.log = (line) => logs.push(line);
  command.resolveConnection = async (value) => {
    alias = value;
    if (options.noOrg) throw new Error('no org');
    return orgOf(answer);
  };
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const envelope = await command.run();
    return { envelope, logs, exitCode: process.exitCode, alias };
  } finally {
    process.exitCode = previous;
  }
};

test('the reader keeps each label, the name when there is none', async () => {
  const { readOrgDataSpaceEntries } = await import('../lib/services/data-space-check.js');
  const page = {
    dataSpaces: [
      { name: 'default', label: 'Default' },
      { name: 'blank', label: '  ', prefix: 'bl' },
      { name: 'control', label: 'bad\u0007label' },
      { name: 'number', label: 7 },
    ],
    totalSize: 4,
  };
  assert.deepEqual(await readOrgDataSpaceEntries(async () => ({ request: async () => page })), [
    { name: 'default', label: 'Default' },
    { name: 'blank', label: 'blank', prefix: 'bl' },
    { name: 'control', label: 'control' },
    { name: 'number', label: 'number' },
  ]);
});

test('listDataSpaces returns every data space with name, label and prefix over pages', async (t) => {
  t.mock.method(connectRetry, 'sleep', async () => {});
  const many = Array.from({ length: 53 }, (_, index) => ({
    name: `space${index}`,
    label: `Space ${index}`,
    prefix: `sp${index}`,
  }));
  const urls = [];
  const listed = await listDataSpaces(orgOf(paged([...spaces, ...many]), urls));
  assert.equal(listed.length, 56);
  assert.deepEqual(listed.slice(0, 3), [
    { name: 'default', label: 'Default' },
    { name: 'dataspace2', label: 'Data Space 2', prefix: 'ds2' },
    { name: 'nolabel', label: 'nolabel', prefix: 'nl' },
  ]);
  assert.deepEqual(
    urls.map((url) => [url.pathname, url.search]),
    [
      [route, '?batchSize=50&offset=0'],
      [route, '?batchSize=50&offset=50'],
    ],
  );
});

test('listDataSpaces throws DataSpaceError DATASPACE_READ_FAILED on an incomplete or refused list', async (t) => {
  t.mock.method(connectRetry, 'sleep', async () => {});
  t.mock.method(connectRetry, 'warn', () => {});
  for (const answer of [
    // Fewer entries than totalSize: the next page is empty.
    (url) => ({
      dataSpaces: url.searchParams.get('offset') === '0' ? [{ name: 'default' }] : [],
      totalSize: 2,
    }),
    () => ({ totalSize: 1 }),
    () => ({ dataSpaces: [{ label: 'No name' }], totalSize: 1 }),
    () => failure(500),
  ])
    await assert.rejects(listDataSpaces(orgOf(answer)), (error) => {
      assert.ok(error instanceof DataSpaceError);
      assert.equal(error.code, 'DATASPACE_READ_FAILED');
      return true;
    });
});

test('listDataSpaces reports a refused session as DataSpaceError AUTHENTICATION_FAILED', async (t) => {
  t.mock.method(connectRetry, 'sleep', async () => {});
  t.mock.method(connectRetry, 'warn', () => {});
  await assert.rejects(listDataSpaces(orgOf(expired)), (error) => {
    assert.ok(error instanceof DataSpaceError);
    assert.equal(error.code, 'AUTHENTICATION_FAILED');
    return true;
  });
});

test('list dataspace prints the list and exits 0 when it is complete', async (t) => {
  const { envelope, logs, exitCode, alias } = await run(paged(spaces), t);
  assert.equal(alias, 'synthetic');
  assert.equal(envelope.status, 'success');
  assert.equal(exitCode, undefined);
  assert.equal(exitCodeOf(envelope), 0);
  assert.deepEqual(logs, [
    'Name        Label         Prefix',
    'default     Default',
    'dataspace2  Data Space 2  ds2',
    'nolabel     nolabel       nl',
  ]);
});

test('list dataspace --json returns the envelope with result.items', async (t) => {
  const { envelope, logs } = await run(paged(spaces), t, { json: true });
  assert.deepEqual(logs, []);
  assert.equal(envelope.contract, 'sf-data360-list-dataspace');
  assert.equal(envelope.contractVersion, '1.0.0');
  assert.deepEqual(envelope.metadata.plugin.name, 'sf-plugin-data');
  assert.equal(envelope.metadata.operation, 'list-dataspace');
  assert.equal(envelope.metadata.apiVersion, '68.0');
  assert.equal(envelope.provenance.command, 'sf data360 list dataspace');
  assert.ok(!Number.isNaN(Date.parse(envelope.provenance.generatedAt)));
  assert.deepEqual(envelope.diagnostics, { warnings: [], errors: [] });
  assert.deepEqual(envelope.result, {
    items: [
      { name: 'default', label: 'Default' },
      { name: 'dataspace2', label: 'Data Space 2', prefix: 'ds2' },
      { name: 'nolabel', label: 'nolabel', prefix: 'nl' },
    ],
  });
});

test('list dataspace fails with DATASPACE_READ_FAILED and exit 1 when the list cannot be read', async (t) => {
  const { envelope, logs, exitCode } = await run(() => failure(500), t);
  assert.equal(envelope.status, 'failed');
  assert.equal(exitCode, 1);
  assert.deepEqual(envelope.result.items, []);
  const [diagnostic] = envelope.diagnostics.errors;
  assert.equal(diagnostic.code, 'DATASPACE_READ_FAILED');
  assert.ok(errorCodeInfo('DATASPACE_READ_FAILED'));
  assert.equal(diagnostic.docs, errorCodeInfo('DATASPACE_READ_FAILED').docs);
  assert.match(diagnostic.message, /Nothing in the org changed/u);
  assert.equal(logs[0], 'List data spaces: failed.');
  assert.match(logs[1], /^DATASPACE_READ_FAILED: /u);
});

test('list dataspace keeps AUTHENTICATION_FAILED for a refused session, exit 1', async (t) => {
  const { envelope, exitCode } = await run(expired, t, { json: true });
  assert.equal(envelope.status, 'failed');
  assert.equal(exitCode, 1);
  assert.equal(envelope.diagnostics.errors[0].code, 'AUTHENTICATION_FAILED');
});

test('list dataspace without a usable org is blocked with TARGET_ORG_REQUIRED, exit 1', async (t) => {
  const { envelope, exitCode } = await run(() => assert.fail('no read'), t, {
    json: true,
    noOrg: true,
    noTarget: true,
  });
  assert.equal(envelope.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.equal(envelope.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
  assert.deepEqual(envelope.result.items, []);
});

test('list dataspace with an unusable --target-org is blocked with AUTHENTICATION_FAILED, exit 1', async (t) => {
  const { envelope, exitCode } = await run(() => assert.fail('no read'), t, {
    json: true,
    noOrg: true,
  });
  assert.equal(envelope.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.equal(envelope.diagnostics.errors[0].code, 'AUTHENTICATION_FAILED');
  assert.deepEqual(envelope.result.items, []);
});
