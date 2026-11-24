import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as api from '../lib/api.js';
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
    setApiVersion: (value) => {
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
