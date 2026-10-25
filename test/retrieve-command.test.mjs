import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DmoWriteError } from '../lib/artifacts/write-other-dmo.js';
import { DmoRetrieveError } from '../lib/services/retrieve-other-dmo.js';

const candidate = {
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Sample__dlm' },
  spec: { arbitrary: 'service-owned' },
};
const connection = {};
const invocation = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const flags = {
    metadata: ['dmo:Sample__dlm'],
    'api-version': '65.0',
    'data-space': 'default',
    overwrite: false,
    'target-org': {
      getOrgId: () => 'synthetic-org',
      getConnection: (version) => {
        assert.equal(version, flags['api-version']);
        return connection;
      },
    },
    ...overrides,
  };
  command.config = { pjson: { version: '0.1.0' } };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.acquire = async (...arguments_) => {
    assert.deepEqual(arguments_, [
      connection,
      'Sample__dlm',
      flags['api-version'],
      flags['data-space'],
    ]);
    return {
      status: 'projected',
      blockers: [],
      candidate,
      expectations: { secret: 'never persisted' },
    };
  };
  command.writeDocument = async (...arguments_) => {
    assert.deepEqual(arguments_, [
      candidate,
      flags['output-dir'] ?? process.cwd(),
      flags.overwrite,
    ]);
    return { path: 'synthetic-output.json', outcome: 'retrieved' };
  };
  return command;
};

// Restore process exit state after checking envelope failures, not an actual CLI process.
const run = async (command) => {
  const previous = process.exitCode;
  try {
    const result = await command.run();
    return { result, exitCode: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};

test('command delegates acquisition and authored-only output without duplicating schema checks', async () => {
  const { result } = await run(invocation());
  assert.equal(result.contract, 'sf-data360-retrieve');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.status, 'success');
  assert.equal(result.metadata.apiVersion, '65.0');
  assert.equal(result.provenance.sourceOrgId, 'synthetic-org');
  assert.equal(result.result.items[0].outcome, 'retrieved');
  assert.ok(!JSON.stringify(result).includes('never persisted'));
});

test('output root, overwrite, space and API flow unchanged to their owning boundaries', async () => {
  const command = invocation({
    'output-dir': 'project',
    overwrite: true,
    'api-version': '66.0',
    'data-space': 'future',
  });
  command.writeDocument = async (value, root, overwrite) => {
    assert.equal(value, candidate);
    assert.equal(root, 'project');
    assert.equal(overwrite, true);
    return { path: 'synthetic-output.json', outcome: 'unchanged' };
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'unchanged');
});

test('temporary selector subset refuses before any acquisition or filesystem work', async () => {
  for (const metadata of [
    undefined,
    [],
    ['dmo'],
    ['dlo:Sample'],
    ['dmo:A', 'dmo:B'],
    ['dmo:'],
    ['dmo:A:B'],
  ]) {
    const command = invocation({ metadata });
    command.acquire = () => assert.fail('must not acquire');
    command.writeDocument = () => assert.fail('must not write');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'RETRIEVE_SELECTION_NOT_IMPLEMENTED');
    assert.equal(exitCode, 1);
  }
});

test('missing default org is an explicit blocked envelope', async () => {
  const { result, exitCode } = await run(invocation({ 'target-org': undefined }));
  assert.equal(result.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
  assert.equal(exitCode, 1);
});

test('service refusals and remote failures never publish candidates or leak error payloads', async () => {
  for (const error of [new DmoRetrieveError('INVALID_SCOPE'), new Error('private remote body')]) {
    const command = invocation();
    command.acquire = async () => {
      throw error;
    };
    command.writeDocument = () => assert.fail('must not write');
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.ok(!JSON.stringify(result).includes('private remote body'));
    assert.deepEqual(result.result.items, []);
    assert.equal(result.status, error instanceof DmoRetrieveError ? 'blocked' : 'failed');
  }
});

test('incomplete or absent service candidates never reach publication', async () => {
  for (const projection of [
    { status: 'incomplete', blockers: ['GENERATED_RECIPE_REPLAY_UNVERIFIED'], candidate },
    { status: 'projected', blockers: ['RELATIONSHIP_REPLAY_UNSUPPORTED'], candidate },
    { status: 'projected', blockers: [] },
    { status: 'incomplete', blockers: ['ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE'] },
  ]) {
    const command = invocation();
    command.acquire = async () => projection;
    command.writeDocument = () => assert.fail('must not publish');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.equal(
      result.diagnostics.errors[0].code,
      projection.blockers[0] ?? 'INCOMPLETE_DMO_PROJECTION',
    );
    assert.deepEqual(result.result.items, []);
  }
});

test('writer refusal and ambiguous publication failure return nonzero without silent success', async () => {
  for (const code of ['UNSAFE_PATH', 'OVERWRITE_REQUIRED', 'OUTPUT_FAILED']) {
    const command = invocation();
    command.writeDocument = async () => {
      throw new DmoWriteError(code);
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, code === 'OUTPUT_FAILED' ? 'failed' : 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.equal(exitCode, 1);
    assert.deepEqual(result.result.items, []);
  }
});
