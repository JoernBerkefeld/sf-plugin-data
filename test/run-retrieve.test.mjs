import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import * as api from '../lib/api.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { exitCodeOf, runRetrieve } from '../lib/api.js';

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-run-retrieve-'));
const dloEntry = (name) => ({
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

/**
 * A synthetic @salesforce/core Connection: the DLO listing answers from `listed`; any other
 * request fails.
 * @param {object[]} listed DLO listing entries.
 * @returns {object} Connection and the URLs it was asked for.
 */
function fakeConnection(listed) {
  let version = '62.0';
  const urls = [];
  return {
    urls,
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => version,
    // Like @salesforce/core: only a numeric version is accepted.
    setApiVersion: (value) => {
      if (!/^[1-9]\d\.0$/u.test(value)) throw new Error(`Invalid API version ${value}`);
      version = value;
    },
    getAuthInfoFields: () => ({ orgId: '00Dsynthetic' }),
    getUsername: () => 'synthetic@example.com',
    request: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      urls.push(url);
      if (/\/ssot\/data-lake-objects\?/u.test(url))
        return { dataLakeObjects: listed, totalSize: listed.length };
      throw Object.assign(new Error('synthetic failure'), { errorCode: 'NOT_FOUND' });
    },
  };
}

/**
 * Run the library call and observe what it printed and whether it set an exit code.
 * @param {object} connection Synthetic connection.
 * @param {object} options runRetrieve options.
 * @returns {Promise<object>} Envelope, printed text and the exit code after the call.
 */
async function observe(connection, options) {
  const previous = process.exitCode;
  process.exitCode = undefined;
  const printed = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk, ...rest) => {
    printed.push(String(chunk));
    return typeof rest.at(-1) === 'function' ? (rest.at(-1)(), true) : true;
  };
  try {
    const envelope = await runRetrieve(connection, options);
    return { envelope, printed: printed.join(''), exitCode: process.exitCode };
  } finally {
    process.stdout.write = write;
    process.exitCode = previous;
  }
}

test('sf-plugin-data/api exports runRetrieve beside exitCodeOf', () => {
  assert.equal(typeof api.runRetrieve, 'function');
  assert.equal(typeof api.exitCodeOf, 'function');
});

test('runRetrieve returns the success envelope, writes files and prints nothing', async () => {
  const outputDirectory = await scratch();
  const connection = fakeConnection([dloEntry('Alpha__dll')]);
  const { envelope, printed, exitCode } = await observe(connection, {
    metadata: ['dlo'],
    outputDir: outputDirectory,
  });
  assert.equal(envelope.contract, 'sf-data360-retrieve');
  assert.equal(envelope.status, 'success', JSON.stringify(envelope.diagnostics));
  assert.equal(exitCodeOf(envelope), 0);
  assert.equal(envelope.provenance.sourceOrgId, '00Dsynthetic');
  assert.equal(envelope.provenance.command, 'sf data360 retrieve');
  assert.deepEqual(envelope.result.scope, { dataSpace: 'default', outputDir: outputDirectory });
  assert.deepEqual(
    envelope.result.items.map((item) => [item.family, item.identity.apiName, item.outcome]),
    [['dlo', 'Alpha__dll', 'retrieved']],
  );
  const files = await readdir(outputDirectory, { recursive: true });
  assert.ok(files.some((file) => file.includes('Alpha')));
  assert.equal(printed, '');
  assert.equal(exitCode, undefined);
  // The caller's Connection keeps its API version.
  assert.equal(connection.getApiVersion(), '62.0');
});

test('runRetrieve replaces a differing local file and leaves an identical one unchanged', async () => {
  const outputDirectory = await scratch();
  const options = { metadata: ['dlo'], outputDir: outputDirectory };
  const first = await observe(fakeConnection([dloEntry('Alpha__dll')]), options);
  assert.equal(first.envelope.status, 'success', JSON.stringify(first.envelope.diagnostics));
  const [{ path: file }] = first.envelope.result.items;
  const retrieved = await readFile(file, 'utf8');

  const repeat = await observe(fakeConnection([dloEntry('Alpha__dll')]), options);
  assert.deepEqual(
    repeat.envelope.result.items.map((item) => item.outcome),
    ['unchanged'],
  );

  await writeFile(file, '{"local": "edit"}\n');
  const replaced = await observe(fakeConnection([dloEntry('Alpha__dll')]), options);
  assert.equal(replaced.envelope.status, 'success', JSON.stringify(replaced.envelope.diagnostics));
  assert.deepEqual(
    replaced.envelope.result.items.map((item) => [item.path, item.outcome]),
    [[file, 'retrieved']],
  );
  assert.equal(await readFile(file, 'utf8'), retrieved);
});

test('runRetrieve returns partial without setting process.exitCode', async () => {
  const outputDirectory = await scratch();
  const connection = fakeConnection([
    dloEntry('Alpha__dll'),
    { name: 'Broken__dll', dataSpaceInfo: [{ name: 'default' }] },
  ]);
  const { envelope, printed, exitCode } = await observe(connection, {
    metadata: ['dlo'],
    outputDir: outputDirectory,
  });
  assert.equal(envelope.status, 'partial', JSON.stringify(envelope.diagnostics));
  assert.equal(exitCodeOf(envelope), 68);
  assert.deepEqual(
    envelope.result.items.map((item) => item.identity.apiName),
    ['Alpha__dll'],
  );
  assert.deepEqual(
    envelope.diagnostics.errors.map((error) => error.identity?.apiName),
    ['Broken__dll'],
  );
  assert.equal(printed, '');
  assert.equal(exitCode, undefined);
});

/**
 * An actual @salesforce/core Connection (its own setApiVersion) over a synthetic transport: the
 * org has one DLO and no component of any other family.
 * @param {string[]} paths Receives every requested path.
 * @returns {Connection} Connection.
 */
function coreConnection(paths) {
  const origin = 'https://synthetic.my.salesforce.com';
  const orgId = '00D000000000001AAA';
  const empty = [
    [/\/ssot\/data-spaces\?/u, { totalSize: 1, dataSpaces: [{ name: 'default' }] }],
    [/\/ssot\/data-lake-objects\?/u, { totalSize: 1, dataLakeObjects: [dloEntry('Alpha__dll')] }],
    [/\/ssot\/data-model-objects\?/u, { totalSize: 0, dataModelObject: [] }],
    [/\/ssot\/segments\?/u, { totalSize: 0, segments: [] }],
    [/\/ssot\/calculated-insights\?/u, { collection: { total: 0, items: [] } }],
    [/\/ssot\/identity-resolutions$/u, { identityResolutions: [] }],
    [/\/ssot\/data-streams\?/u, { totalSize: 0, dataStreams: [] }],
    [/\/ssot\/data-transforms\?/u, { totalSize: 0, dataTransforms: [] }],
    [/\/ssot\/data-graphs\/metadata\?/u, { dataGraphMetadata: [] }],
    [
      /\/query\?q=SELECT%20Id%20FROM%20Organization$/u,
      {
        done: true,
        totalSize: 1,
        records: [{ Id: orgId }],
      },
    ],
  ];
  return Object.assign(Object.create(Connection.prototype), {
    instanceUrl: origin,
    version: '62.0',
    accessToken: 'synthetic-token',
    logger: { getRawLogger: () => ({ debug() {} }), debug() {}, warn() {} },
    getAuthInfoFields: () => ({ orgId, username: 'synthetic@example.com' }),
    getUsername: () => 'synthetic@example.com',
    _refreshDelegate: {
      isRefreshing: () => false,
      refresh: () => assert.fail('must not refresh'),
    },
    _propagators: [],
    _transport: {
      httpRequest: (request) => {
        const url = new URL(request.url);
        paths.push(`${url.pathname}${url.search}`);
        const match = empty.find(([pattern]) => pattern.test(`${url.pathname}${url.search}`));
        const pending = Promise.resolve(
          match
            ? {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(match[1]),
              }
            : {
                statusCode: 404,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify([{ errorCode: 'NOT_FOUND', message: 'synthetic' }]),
              },
        );
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
}

test('runRetrieve over an actual core Connection retrieves every family with the default auto version', async () => {
  const outputDirectory = await scratch();
  const paths = [];
  const connection = coreConnection(paths);
  // The real setApiVersion refuses `auto`; the default run must never hand it over.
  assert.throws(() => connection.setApiVersion('auto'));
  const { envelope, printed, exitCode } = await observe(connection, { outputDir: outputDirectory });
  assert.equal(envelope.status, 'success', JSON.stringify(envelope.diagnostics));
  assert.equal(exitCodeOf(envelope), 0);
  assert.deepEqual(
    envelope.result.items.map((item) => [item.family, item.identity.apiName, item.outcome]),
    [['dlo', 'Alpha__dll', 'retrieved']],
  );
  assert.ok(paths.some((value) => value.includes('/ssot/data-lake-objects?')));
  assert.equal(printed, '');
  assert.equal(exitCode, undefined);
  assert.equal(connection.getApiVersion(), '62.0');
});

test('runRetrieve reads DLOs beside segments over an actual core Connection with the auto version', async () => {
  // DLOs selected with an operational family share its group; their reads stay pinned at 68.0.
  const connection = coreConnection([]);
  const { envelope } = await observe(connection, {
    metadata: ['dlo', 'segment'],
    outputDir: await scratch(),
  });
  assert.equal(envelope.status, 'success', JSON.stringify(envelope.diagnostics));
  assert.deepEqual(
    envelope.result.items.map((item) => [item.family, item.identity.apiName, item.outcome]),
    [['dlo', 'Alpha__dll', 'retrieved']],
  );
  assert.equal(connection.getApiVersion(), '62.0');
});

test('sf data360 retrieve without -o and --api-version never asks the connection for auto', async () => {
  const connection = coreConnection([]);
  const command = new Retrieve([], {});
  // The flag defaults when neither -o nor --api-version is given.
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      metadata: ['dlo', 'segment'],
      'output-dir': await scratch(),
    },
  });
  command.jsonEnabled = () => true;
  // Like @salesforce/core, every version the command asks for reaches setApiVersion.
  command.resolveOrg = async () => ({
    getOrgId: () => connection.getAuthInfoFields().orgId,
    getConnection: (version) => {
      if (version) connection.setApiVersion(version);
      return connection;
    },
  });
  const before = process.exitCode;
  let envelope;
  try {
    envelope = await command.run();
  } finally {
    process.exitCode = before;
  }
  assert.equal(envelope.status, 'success', JSON.stringify(envelope.diagnostics));
  assert.deepEqual(
    envelope.result.items.map((item) => [item.family, item.identity.apiName]),
    [['dlo', 'Alpha__dll']],
  );
});

test('runRetrieve returns blocked envelopes before any request', async () => {
  for (const [options, code] of [
    [{ dataspace: 'Missing' }, 'UNKNOWN_DATASPACE'],
    [{ metadata: ['dmo'], apiVersion: 'latest' }, 'INVALID_SCOPE'],
  ]) {
    const connection = fakeConnection([]);
    const { envelope, printed, exitCode } = await observe(connection, {
      outputDir: await scratch(),
      ...options,
    });
    assert.equal(envelope.status, 'blocked');
    assert.equal(exitCodeOf(envelope), 1);
    assert.equal(envelope.diagnostics.errors[0].code, code);
    assert.deepEqual(envelope.result.items, []);
    assert.deepEqual(connection.urls, []);
    assert.equal(printed, '');
    assert.equal(exitCode, undefined);
  }
});
