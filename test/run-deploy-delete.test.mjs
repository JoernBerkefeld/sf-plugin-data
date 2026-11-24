import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Parser } from '@oclif/core';
import * as api from '../lib/api.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { exitCodeOf, runDelete, runDeploy, runRetrieve } from '../lib/api.js';
import { connectRetry } from '../lib/transport/connect-client.js';

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-run-deploy-delete-'));
const name = 'Alpha__dll';
const dloEntry = () => ({
  capabilities: {},
  category: 'Other',
  dataLakeFieldInfoRepresentation: [
    { dataType: 'Text', isPrimaryKey: true, label: 'Id', name: 'Id__c' },
  ],
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ dataType: 'Text', isPrimaryKey: true, label: 'Id', name: 'Id__c' }],
  id: '1dlaj00000Ae4VNAAZ',
  label: name,
  name,
});

const notFound = () =>
  Object.assign(new Error('synthetic absent'), {
    statusCode: 404,
    errorCode: 'NOT_FOUND',
    data: { errorCode: 'NOT_FOUND', message: 'synthetic' },
  });

/**
 * A synthetic @salesforce/core Connection over an org holding at most one DLO: GET answers it or
 * 404, POST creates it, DELETE removes it. The data space list names only default.
 * @param {boolean} present Whether the org holds the DLO at the start.
 * @returns {object} Connection, its requests and the versions it was set to.
 */
function fakeConnection(present) {
  let version = '62.0';
  let stored = present ? dloEntry() : undefined;
  const requests = [];
  const versions = [];
  return {
    requests,
    versions,
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => version,
    // Like @salesforce/core: only a numeric version is accepted.
    setApiVersion: (value) => {
      if (!/^[1-9]\d\.0$/u.test(value)) throw new Error(`Invalid API version ${value}`);
      versions.push(value);
      version = value;
    },
    getAuthInfoFields: () => ({ orgId: '00Dsynthetic' }),
    getUsername: () => 'synthetic@example.com',
    request: async (request, options) => {
      const method = typeof request === 'string' ? 'GET' : (request.method ?? 'GET');
      const url = typeof request === 'string' ? request : request.url;
      const route = url
        .replace(/^https:\/\/synthetic\.example/u, '')
        .replace(/^\/services\/data\/v\d+\.0/u, '');
      requests.push(`${method} ${route}`);
      if (method === 'GET' && route.startsWith('/ssot/data-spaces?'))
        return { dataSpaces: [{ name: 'default' }], totalSize: 1 };
      if (method === 'GET' && route === `/ssot/data-lake-objects/${name}/dependencies`)
        return { dependencies: [], totalSize: 0 };
      if (method === 'GET' && route === `/ssot/data-lake-objects/${name}`) {
        if (!stored) throw notFound();
        return structuredClone(stored);
      }
      if (method === 'POST' && route === '/ssot/data-lake-objects') {
        stored = dloEntry();
        return structuredClone(stored);
      }
      if (method === 'DELETE' && route === `/ssot/data-lake-objects/${dloEntry().id}`) {
        stored = undefined;
        return options?.noContentResponse;
      }
      throw Object.assign(new Error(`unexpected ${method} ${route}`), { statusCode: 500 });
    },
  };
}

/**
 * Run a library call and observe what it printed or asked and whether it set an exit code.
 * @param {Function} call The library call.
 * @returns {Promise<object>} Envelope, printed text and the exit code after the call.
 */
async function observe(call) {
  const previous = process.exitCode;
  process.exitCode = 7;
  const printed = [];
  const writes = [process.stdout.write, process.stderr.write];
  const capture = (chunk, ...rest) => {
    printed.push(String(chunk));
    return typeof rest.at(-1) === 'function' ? (rest.at(-1)(), true) : true;
  };
  process.stdout.write = capture;
  process.stderr.write = capture;
  // No terminal: the CLI would refuse a delete without --no-prompt here.
  const tty = [process.stdin.isTTY, process.stdout.isTTY];
  process.stdin.isTTY = false;
  process.stdout.isTTY = false;
  try {
    const envelope = await call();
    return { envelope, printed: printed.join(''), exitCode: process.exitCode };
  } finally {
    [process.stdout.write, process.stderr.write] = writes;
    [process.stdin.isTTY, process.stdout.isTTY] = tty;
    process.exitCode = previous;
  }
}

/**
 * A project holding the DLO file as retrieve writes it.
 * @returns {Promise<string>} Project root.
 */
async function project() {
  const root = await scratch();
  const { envelope } = await observe(() =>
    runRetrieve(fakeConnection(true), { metadata: [`dlo:${name}`], outputDir: root }),
  );
  assert.equal(envelope.status, 'success', JSON.stringify(envelope.diagnostics));
  return root;
}

/**
 * The envelope without its run time, for comparisons.
 * @param {object} envelope Envelope.
 * @returns {object} Envelope without provenance.generatedAt.
 */
const timeless = (envelope) => {
  const copy = structuredClone(envelope);
  delete copy.provenance.generatedAt;
  return copy;
};

test('sf-plugin-data/api exports runDeploy and runDelete', () => {
  assert.equal(typeof api.runDeploy, 'function');
  assert.equal(typeof api.runDelete, 'function');
});

test('runDeploy previews, then deploys over the caller connection without printing', async () => {
  const root = await project();
  const connection = fakeConnection(false);
  const options = { metadata: [`dlo:${name}`], projectDir: root };

  const preview = await observe(() => runDeploy(connection, { ...options, preview: true }));
  assert.equal(preview.envelope.contract, 'sf-data360-deploy');
  assert.equal(preview.envelope.status, 'success', JSON.stringify(preview.envelope.diagnostics));
  assert.equal(preview.envelope.metadata.preview, true);
  assert.deepEqual(
    preview.envelope.result.items.map((item) => [
      item.family,
      item.identity.apiName,
      item.operation,
      item.outcome,
    ]),
    [['dlo', name, 'preview', 'create']],
  );
  assert.ok(!connection.requests.some((request) => !request.startsWith('GET ')));
  assert.equal(preview.printed, '');
  assert.equal(preview.exitCode, 7);

  const run = await observe(() => runDeploy(connection, options));
  assert.equal(run.envelope.status, 'success', JSON.stringify(run.envelope.diagnostics));
  assert.equal(exitCodeOf(run.envelope), 0);
  assert.equal(run.envelope.provenance.targetOrgId, '00Dsynthetic');
  assert.deepEqual(
    run.envelope.result.items.map((item) => [
      item.identity.apiName,
      item.operation,
      item.outcome,
      item.mutation,
    ]),
    [[name, 'execute', 'created', 'confirmed-created']],
  );
  assert.ok(connection.requests.includes('POST /ssot/data-lake-objects'));
  assert.equal(run.printed, '');
  assert.equal(run.exitCode, 7);
  assert.equal(connection.getApiVersion(), '62.0');
});

test('runDelete previews, then deletes without asking, also without a terminal', async () => {
  const root = await project();
  const file = path.join(root, 'data360', 'dlo', `${name}.dlo-meta.json`);
  await readFile(file);
  const connection = fakeConnection(true);
  const options = { metadata: [`dlo:${name}`], projectDir: root };

  const preview = await observe(() => runDelete(connection, { ...options, preview: true }));
  assert.equal(preview.envelope.contract, 'sf-data360-delete');
  assert.equal(preview.envelope.status, 'success', JSON.stringify(preview.envelope.diagnostics));
  assert.deepEqual(
    preview.envelope.result.items.map((item) => [
      item.family,
      item.identity.apiName,
      item.operation,
      item.outcome,
      item.mutation,
    ]),
    [['dlo', name, 'preview', 'delete', 'not-attempted']],
  );
  // projectDir: the local file the delete would remove is the project's.
  assert.deepEqual(preview.envelope.result.items[0].localFiles, [{ path: file, exists: true }]);
  assert.ok(!connection.requests.some((request) => request.startsWith('DELETE ')));
  assert.equal(preview.printed, '');

  const run = await observe(() => runDelete(connection, options));
  assert.equal(run.envelope.status, 'success', JSON.stringify(run.envelope.diagnostics));
  assert.equal(exitCodeOf(run.envelope), 0);
  assert.equal(run.envelope.metadata.preview, false);
  assert.deepEqual(
    run.envelope.result.items.map((item) => [item.operation, item.outcome, item.mutation]),
    [['delete', 'deleted', 'confirmed-deleted']],
  );
  assert.deepEqual(run.envelope.result.items[0].removedLocalFiles, [
    { path: file, outcome: 'removed' },
  ]);
  assert.deepEqual(await readdir(path.dirname(file)), []);
  assert.equal(run.printed, '');
  assert.equal(run.exitCode, 7);
  // The delete ran at 68.0 on the caller's Connection; its own version is back.
  assert.ok(connection.versions.includes('68.0'));
  assert.equal(connection.getApiVersion(), '62.0');
});

/**
 * The connection answering the first GET of the DLO with HTTP 503, as an overloaded org does.
 * @param {object} connection Synthetic connection.
 * @returns {object} The same connection; `failures` counts the 503 answers.
 */
function unavailableOnce(connection) {
  const request = connection.request;
  connection.failures = 0;
  connection.request = async (input, options) => {
    if (
      connection.failures === 0 &&
      typeof input === 'object' &&
      (input.method ?? 'GET') === 'GET' &&
      input.url.endsWith(`/ssot/data-lake-objects/${name}`)
    ) {
      connection.failures++;
      throw Object.assign(new Error('synthetic unavailable'), { statusCode: 503 });
    }
    return request(input, options);
  };
  return connection;
}

test('runDeploy and runDelete retry a 503 without printing the retry warning', async (t) => {
  // The CLI default: one stderr line per retry (the test support silences it for other tests).
  t.mock.method(connectRetry, 'warn', (message) => {
    process.stderr.write(`Warning: ${message}\n`);
  });
  const root = await project();
  const options = { metadata: [`dlo:${name}`], projectDir: root, preview: true };
  for (const [run, present] of [
    [runDeploy, false],
    [runDelete, true],
  ]) {
    const connection = unavailableOnce(fakeConnection(present));
    const result = await observe(() => run(connection, options));
    assert.equal(result.envelope.status, 'success', JSON.stringify(result.envelope.diagnostics));
    assert.equal(connection.failures, 1);
    // The retry reached the org.
    assert.ok(connection.requests.includes(`GET /ssot/data-lake-objects/${name}`));
    assert.equal(result.printed, '');
  }
});

test('a refusal is returned as an envelope with the exit code left alone', async () => {
  const connection = fakeConnection(false);
  const projectDirectory = await scratch();
  const deploy = await observe(() => runDeploy(connection, { projectDir: projectDirectory }));
  assert.equal(deploy.envelope.status, 'blocked');
  assert.equal(deploy.envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
  assert.equal(exitCodeOf(deploy.envelope), 1);
  assert.equal(deploy.exitCode, 7);
  const remove = await observe(() => runDelete(connection, { metadata: ['dlo:Missing'] }));
  assert.equal(remove.envelope.status, 'blocked');
  assert.equal(exitCodeOf(remove.envelope), 1);
  assert.equal(remove.exitCode, 7);
  assert.equal(remove.printed, '');
  assert.deepEqual(connection.requests, []);
});

/**
 * Run a command as the CLI parses these arguments, over the same synthetic org seams.
 * @param {Function} Command Deploy or Delete.
 * @param {string[]} argv Arguments.
 * @param {object} connection Synthetic connection.
 * @param {string} root Project root.
 * @returns {Promise<object>} The command's envelope.
 */
async function cli(Command, argv, connection, root) {
  const { flags } = await Parser.parse(argv, { flags: Command.flags, strict: true });
  const command = new Command([], {});
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.projectDirectory = () => root;
  const org = {
    getOrgId: () => '00Dsynthetic',
    getUsername: () => connection.getUsername(),
    getConnection: () => connection,
  };
  command.resolveTargetOrg = async () => org;
  command.resolveConnection = async () => connection;
  command.streamConnection = async () => connection;
  const { openBoundSsot } = await import('../lib/transport/bound-ssot.js');
  const { createNativeDloDeleteClient } = await import('../lib/transport/dlo-native-rest.js');
  command.createSsotSender = command.createDataSpaceSender = (target, version) =>
    openBoundSsot(target, version, async () => connection);
  command.createDloNativeDeleteClient = (target, version) =>
    createNativeDloDeleteClient(target, version, async () => connection);
  const { envelope } = await observe(() => command.run());
  return envelope;
}

/**
 * The envelope of a library call, observed.
 * @param {Function} run runDeploy or runDelete.
 * @param {object} connection Synthetic connection.
 * @param {object} options Library options.
 * @returns {Promise<object>} Envelope.
 */
async function library(run, connection, options) {
  const { envelope } = await observe(() => run(connection, options));
  return envelope;
}

test('the envelopes equal the commands --json envelopes for the same flags', async () => {
  const root = await project();
  const options = { metadata: [`dlo:${name}`], preview: true, projectDir: root };
  assert.deepEqual(
    timeless(await library(runDeploy, fakeConnection(false), options)),
    timeless(await cli(Deploy, ['-m', `dlo:${name}`, '--preview'], fakeConnection(false), root)),
  );
  assert.deepEqual(
    timeless(await library(runDelete, fakeConnection(true), options)),
    timeless(await cli(Delete, ['-m', `dlo:${name}`, '--preview'], fakeConnection(true), root)),
  );
});

test('options the CLI refuses while parsing throw OptionError with exit code 2', async () => {
  const connection = fakeConnection(false);
  for (const [call, message] of [
    [
      () => runDeploy(connection, { changedSince: 'HEAD', metadata: [`dlo:${name}`] }),
      /--changed-since=HEAD cannot also be provided when using --metadata/u,
    ],
    [
      () => runDeploy(connection, { changedSince: 'HEAD', sourceDir: ['data360'] }),
      /--changed-since=HEAD cannot also be provided when using --source-dir/u,
    ],
    [() => runDeploy(connection, { metadata: [`dlo:${name}`], wait: 0 }), /--wait=0/u],
    [
      () => runDeploy(connection, { metadata: [`dlo:${name}`], apiVersion: 'latest' }),
      /--api-version=latest/u,
    ],
    [
      () => runDelete(connection, { changedSince: 'HEAD', metadata: [`dlo:${name}`] }),
      /--changed-since=HEAD cannot also be provided when using --metadata/u,
    ],
  ])
    await assert.rejects(call, (error) => {
      assert.equal(error.name, 'OptionError');
      assert.equal(error.code, 'INVALID_OPTION');
      assert.equal(error.exitCode, 2);
      assert.match(error.message, message);
      return true;
    });
  assert.deepEqual(connection.requests, []);
});
