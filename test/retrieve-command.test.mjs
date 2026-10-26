import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DmoWriteError } from '../lib/artifacts/write-other-dmo.js';
import { DmoRetrieveError, selectDmos } from '../lib/services/retrieve-other-dmo.js';

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
    'target-org': 'synthetic',
    ...overrides,
  };
  command.resolveOrg = async () => {
    if (!flags['target-org']) throw new Error('no org');
    return { getOrgId: () => 'synthetic-org', getConnection: () => connection };
  };
  command.selectDocuments = async () => ['Sample__dlm'];
  command.config = { pjson: { version: '2.151.7' } };
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
  assert.deepEqual(result.metadata.plugin, {
    name: 'sf-plugin-data360',
    version: '0.1.0',
  });
  assert.equal(result.provenance.pluginVersion, '0.1.0');
  assert.equal(result.metadata.apiVersion, '65.0');
  assert.equal(result.provenance.sourceOrgId, 'synthetic-org');
  assert.equal(result.result.items[0].outcome, 'retrieved');
  assert.ok(!JSON.stringify(result).includes('never persisted'));
});

test('output root and changed-only overwrite flow unchanged to the writer', async () => {
  const command = invocation({
    'output-dir': 'project',
    overwrite: true,
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

test('invalid selectors refuse before authentication, acquisition or filesystem work', async () => {
  for (const metadata of [
    ['dlo:Sample'],
    ['dmo:A', 'dmo:B'],
    ['dmo:'],
    ['dmo:A:B'],
    ['dmo:../A__dlm'],
  ]) {
    const command = invocation({ metadata });
    command.resolveOrg = () => assert.fail('must not authenticate');
    command.acquire = () => assert.fail('must not acquire');
    command.writeDocument = () => assert.fail('must not write');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SELECTION');
    assert.equal(exitCode, 1);
  }
});

test('real selector expansion writes each exact/type/all member once in sorted order', async () => {
  for (const metadata of [
    undefined,
    ['dmo'],
    ['dmo:Zeta__dlm', 'dmo:Alpha__dlm', 'dmo:Zeta__dlm'],
    ['dmo', 'dmo:Alpha__dlm'],
  ]) {
    const command = invocation({ metadata, 'output-dir': 'project', overwrite: true });
    let inventories = 0;
    const actualConnection = {
      instanceUrl: 'https://synthetic.example',
      getApiVersion: () => '65.0',
      request: async () => {
        inventories++;
        return {
          dataModelObject: ['Zeta__dlm', 'Alpha__dlm'].map((name) => ({
            name,
            dataSpaceName: 'default',
          })),
        };
      },
    };
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic-org',
      getConnection: () => actualConnection,
    });
    command.selectDocuments = selectDmos;
    command.acquire = async (_, name) => ({
      status: 'projected',
      blockers: [],
      candidate: { ...candidate, identity: { dataSpace: 'default', apiName: name } },
    });
    const written = [];
    command.writeDocument = async (document, root, overwrite) => {
      assert.equal(root, 'project');
      assert.equal(overwrite, true);
      written.push(document.identity.apiName);
      return { path: `${document.identity.apiName}.json`, outcome: 'unchanged' };
    };
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Alpha__dlm', 'Zeta__dlm']);
    assert.deepEqual(result.result.selection, ['dmo:Alpha__dlm', 'dmo:Zeta__dlm']);
    assert.equal(inventories, metadata?.every((value) => value !== 'dmo') ? 0 : 1);
  }
});

test('human output includes per-object diagnostic identity and code', async () => {
  const command = invocation();
  command.jsonEnabled = () => false;
  const lines = [];
  command.log = (line) => lines.push(line);
  command.acquire = async () => {
    throw new DmoRetrieveError('ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE');
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.match(lines.join('\n'), /dmo:Sample__dlm: ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE/u);
});

test('type, omitted and repeated selectors reach selection and retain per-object partial outcomes', async () => {
  for (const metadata of [undefined, [], ['dmo'], ['dmo:Sample__dlm', 'dmo:Sample__dlm']]) {
    const command = invocation({ metadata });
    command.selectDocuments = async (actualConnection, selectors, version, space) => {
      assert.equal(actualConnection, connection);
      assert.deepEqual(selectors, metadata ?? []);
      assert.equal(version, '65.0');
      assert.equal(space, 'default');
      return ['Alpha__dlm', 'Broken__dlm', 'Unsupported__dlm', 'Zeta__dlm'];
    };
    const acquired = [];
    command.acquire = async (_, name) => {
      acquired.push(name);
      if (name === 'Broken__dlm') throw new Error('private remote body');
      if (name === 'Unsupported__dlm')
        throw new DmoRetrieveError('ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE');
      return {
        status: 'projected',
        blockers: [],
        candidate: { ...candidate, identity: { dataSpace: 'default', apiName: name } },
      };
    };
    command.writeDocument = async (document) => ({
      path: `${document.identity.apiName}.json`,
      outcome: 'retrieved',
    });
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.equal(result.status, 'failed');
    assert.deepEqual(acquired, ['Alpha__dlm', 'Broken__dlm', 'Unsupported__dlm', 'Zeta__dlm']);
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Alpha__dlm', 'Zeta__dlm'],
    );
    assert.deepEqual(
      result.diagnostics.errors.map((error) => [error.identity.apiName, error.code]),
      [
        ['Broken__dlm', 'RETRIEVE_FAILED'],
        ['Unsupported__dlm', 'ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE'],
      ],
    );
    assert.ok(!JSON.stringify(result).includes('private remote body'));
  }
});

test('empty inventory succeeds with no files; incomplete inventory blocks before writes', async () => {
  const command = invocation({ metadata: [] });
  command.acquire = () => assert.fail('must not acquire');
  command.writeDocument = () => assert.fail('must not write');
  command.selectDocuments = async () => [];
  const empty = await run(command);
  assert.equal(empty.result.status, 'success');
  assert.deepEqual(empty.result.result.items, []);
  assert.deepEqual(empty.result.result.selection, []);
  command.selectDocuments = async () => {
    throw new DmoRetrieveError('INVALID_INVENTORY');
  };
  const incomplete = await run(command);
  assert.equal(incomplete.exitCode, 1);
  assert.equal(incomplete.result.status, 'blocked');
  assert.equal(incomplete.result.diagnostics.errors[0].code, 'INVALID_INVENTORY');
});

test('unsupported scope validates before authentication', async () => {
  for (const overrides of [{ 'api-version': '66.0' }, { 'data-space': 'other' }]) {
    const command = invocation(overrides);
    command.resolveOrg = () => assert.fail('must not authenticate');
    const { result } = await run(command);
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
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
