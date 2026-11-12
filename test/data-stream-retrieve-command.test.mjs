import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Config } from '@oclif/core';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DataStreamError } from '../lib/artifacts/data-stream-document.js';

/**
 * Build offline command boundaries without authentication or network access.
 * @param {object} flags Parsed flag overrides.
 * @returns {object} Command and captured observations.
 */
function invocation(flags = {}) {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const lines = [];
  command.parse = async () => ({
    flags: {
      metadata: ['data-stream:Zulu', 'data-stream:Alpha', 'data-stream:Alpha'],
      'api-version': 'auto',
      'target-org': 'synthetic',
      overwrite: false,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.log = (line) => lines.push(line);
  command.resolveOrg = async () => {
    calls.push('auth');
    return {
      getOrgId: () => 'synthetic-org',
      getConnection: (version) => {
        assert.equal(version, '68.0');
        return { instanceUrl: 'https://synthetic.example', getUsername: () => 'synthetic' };
      },
    };
  };
  command.createDataStreamClients = (_connection, target, version) => {
    assert.equal(target, 'synthetic');
    assert.equal(version, '68.0');
    return { offline: true };
  };
  command.acquireDataStream = async (name, clients, scope) => {
    calls.push(name);
    assert.deepEqual(clients, { offline: true });
    assert.equal(scope, 'default');
    return { kind: 'data-stream', identity: { apiName: name, dataSpace: scope } };
  };
  command.writeDataStream = async (document, root, overwrite) => {
    calls.push({ root, overwrite });
    return { path: `${document.identity.apiName}.json`, outcome: 'retrieved' };
  };
  command.listNativeNames = () => assert.fail('no inventory fallback');
  return { command, calls, lines };
}

/**
 * Capture command failure status without contaminating the test runner.
 * @param {object} command Offline command.
 * @returns {Promise<object>} Envelope and exit code.
 */
async function run(command) {
  const original = process.exitCode;
  process.exitCode = 0;
  try {
    const result = await command.run();
    return { result, exitCode: process.exitCode };
  } finally {
    process.exitCode = original;
  }
}

for (const json of [true, false])
  for (const version of ['auto', '68.0'])
    test(`exact streams sort/dedupe and preserve output, overwrite and routes ${json}/${version}`, async () => {
      const { command, calls, lines } = invocation({
        'api-version': version,
        overwrite: true,
        'output-dir': 'chosen-root',
      });
      command.jsonEnabled = () => json;
      command.writeDataStream = async (document, root, overwrite) => {
        assert.equal(root, path.resolve('chosen-root'));
        assert.equal(overwrite, true);
        return {
          path: `${document.identity.apiName}.json`,
          outcome: document.identity.apiName === 'Alpha' ? 'unchanged' : 'retrieved',
        };
      };
      const { result, exitCode } = await run(command);
      assert.equal(exitCode, 0);
      assert.equal(result.status, 'success');
      assert.deepEqual(calls, ['auth', 'Alpha', 'Zulu']);
      assert.deepEqual(result.result.selection, ['data-stream:Alpha', 'data-stream:Zulu']);
      assert.equal(result.metadata.soapApiVersion, '68.0');
      assert.deepEqual(
        result.result.items[0].routes.map(({ apiVersion }) => apiVersion),
        ['68.0', '68.0', '68.0'],
      );
      assert.ok(result.result.items[0].routes.every(({ transport }) => transport === 'native'));
      assert.equal(result.result.items[0].family, 'data-stream');
      assert.deepEqual(
        lines,
        json
          ? []
          : [
              'Retrieve: success.',
              'Downloaded data-stream:Alpha (unchanged).',
              'Downloaded data-stream:Zulu (retrieved).',
              'Downloaded data-stream: 2',
            ],
      );
    });

for (const flags of [
  { metadata: ['data-stream'] },
  { metadata: ['data-stream:'] },
  { metadata: ['data-stream:*'] },
  { metadata: ['data-stream:Alpha:Other'] },
  { metadata: ['data-stream:../Alpha'] },
  { metadata: ['data-stream:Alpha', 'dlo:Other__dll'] },
  { dataspace: 'other' },
  ...['61.0', '65.0', '67.0', '69.0', 'latest'].map((version) => ({ 'api-version': version })),
])
  test(`stream selectors/options refuse before auth ${JSON.stringify(flags)}`, async () => {
    const { command, calls } = invocation(flags);
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
  });

for (const code of [
  'UNSUPPORTED_STREAM_PROJECTION',
  'OVERWRITE_REQUIRED',
  'UNSAFE_PATH',
  'OUTPUT_FAILED',
  'unknown',
])
  test(`per-item stream failure preserves successes and sanitizes ${code}`, async () => {
    const { command, lines } = invocation();
    command.jsonEnabled = () => false;
    command.acquireDataStream = async (name) => {
      if (name === 'Alpha') {
        if (code === 'unknown') throw new Error('private-token');
        throw new DataStreamError(code);
      }
      return { identity: { apiName: name, dataSpace: 'default' } };
    };
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.equal(
      result.status,
      ['OVERWRITE_REQUIRED', 'UNSAFE_PATH'].includes(code) ? 'blocked' : 'failed',
    );
    assert.deepEqual(
      result.result.items.map(({ identity }) => identity.apiName),
      ['Zulu'],
    );
    assert.ok(lines.some((line) => line.startsWith('data-stream:Alpha:')));
    assert.equal(lines.at(-1), 'Downloaded data-stream: 1');
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  });

test('all four aliases parse stream selection and reject unknown options without auth', async () => {
  const config = await Config.load({ root: process.cwd() });
  for (const topic of ['data360', 'datacloud', 'd360', 'dc']) {
    const Command = await config.findCommand(`${topic}:retrieve`, { must: true }).load();
    assert.equal(Command, Retrieve);
    const command = new Command(['-m', 'data-stream:Alpha', '--json'], config);
    const parsed = await command.parse(Command);
    assert.deepEqual(parsed.flags.metadata, ['data-stream:Alpha']);
    for (const option of ['--all', '--changed-since=2026-01-01']) {
      const invalid = new Command(['-m', 'data-stream:Alpha', option], config);
      invalid.resolveOrg = () => assert.fail('no authentication');
      await assert.rejects(invalid.run());
    }
  }
});

test('production stream client factory pins native68 without requests', async () => {
  const command = new Retrieve([], await Config.load({ root: process.cwd() }));
  const clients = command.createDataStreamClients(
    {
      instanceUrl: 'https://synthetic.example',
      request: () => assert.fail('factory makes no requests'),
    },
    'synthetic',
    '68.0',
  );
  assert.equal(typeof clients.streams.get, 'function');
  assert.equal(typeof clients.connections.list, 'function');
  assert.equal(typeof clients.dependencies.dlo, 'function');
  assert.equal(clients.facade, undefined);
  assert.equal(typeof clients.dlo.get, 'function');
});
