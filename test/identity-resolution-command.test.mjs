import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import {
  IdentityResolutionError,
  projectIdentityResolution,
} from '../lib/artifacts/identity-resolution-document.js';
import { operationApiVersion } from '../lib/transport/api-version.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

const document = (apiName) => {
  const { facade, native } = irFixture();
  facade.objectApiName = apiName;
  native.objectApiName = apiName;
  return projectIdentityResolution(facade, native, apiName).candidate;
};
const invocation = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const flags = {
    metadata: ['identity-resolution:Individual_A1b2'],
    'api-version': 'auto',
    'data-space': 'default',
    'output-dir': 'synthetic-project',
    overwrite: true,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const calls = [];
  const connection = { getApiVersion: () => '67.0' };
  command.resolveOrg = async () => {
    calls.push('org');
    return {
      getOrgId: () => 'synthetic',
      getConnection: (version) => {
        calls.push(`pin:${version}`);
        return connection;
      },
    };
  };
  command.selectDocuments = async () => {
    calls.push('dmos');
    return ['Sample__dlm'];
  };
  command.selectDependencies = async (roots, conn, version) => {
    assert.equal(conn, connection);
    assert.deepEqual(version, { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' });
    calls.push('legacy-admit');
    return {
      entries: roots.map((identity) => ({
        document: {
          kind: identity.kind,
          identity: { dataSpace: identity.dataSpace, apiName: identity.apiName },
        },
        ...(identity.kind === 'segment' ? { definitionXml: '<independent/>' } : {}),
      })),
      reasons: new Map(),
    };
  };
  command.acquireIdentityResolution = async (conn, apiName, version, space) => {
    assert.equal(conn, connection);
    assert.equal(space, 'default');
    assert.deepEqual(version, { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' });
    calls.push(`ir:${apiName}`);
    return {
      identity: { dataSpace: 'default', apiName },
      candidate: document(apiName),
      blockers: [],
    };
  };
  const writer = async (value, root, overwrite) => {
    assert.equal(root, flags['output-dir']);
    assert.equal(overwrite, flags.overwrite);
    calls.push(`write:${value.identity.apiName}`);
    return { path: `${value.identity.apiName}.json`, outcome: 'unchanged' };
  };
  command.writeIdentityResolution = writer;
  command.writeDocument = writer;
  command.writeSegment = (value, xml, root, overwrite) => {
    assert.equal(xml, '<independent/>');
    return writer(value, root, overwrite);
  };
  return { command, calls };
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

test('fixed per-family auto routes never discover or reinterpret numeric/latest pins', () => {
  for (const family of ['dmo', 'segment', 'identity-resolution'])
    assert.equal(
      operationApiVersion('auto', family),
      family === 'identity-resolution' ? '67.0' : '65.0',
    );
  assert.equal(operationApiVersion('latest', 'dmo'), 'latest');
  assert.equal(operationApiVersion('67.0', 'identity-resolution'), '67.0');
  for (const [requested, family] of [
    ['65.0', 'identity-resolution'],
    ['latest', 'identity-resolution'],
    ['latest', 'segment'],
    ['67.0', 'dmo'],
    ['67.0', 'segment'],
    ['68.0', 'identity-resolution'],
  ])
    assert.throws(() => operationApiVersion(requested, family), /INVALID_SCOPE/u);
});

test('IR explicit65/latest, unsupported numeric mixed routes and expansion block before org/output', async () => {
  for (const overrides of [
    { 'api-version': '65.0' },
    { 'api-version': 'latest' },
    { 'api-version': '68.0' },
    { metadata: ['identity-resolution'] },
    { metadata: ['identity-resolution:../unsafe'] },
    { 'data-space': 'other' },
    { 'include-dependencies': true },
    { 'api-version': '67.0', metadata: ['identity-resolution:Individual_A1b2', 'dmo:Sample__dlm'] },
    {
      'api-version': '67.0',
      metadata: ['identity-resolution:Individual_A1b2', 'segment:Audience'],
    },
  ]) {
    const { command, calls } = invocation(overrides);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
  }
});

test('one/two repeated exact IR names use existing writer with exact identity and per-operation evidence', async () => {
  for (const requested of ['auto', '67.0']) {
    for (const names of [
      ['Individual_A1b2'],
      ['Individual_Z9y8', 'Individual_A1b2', 'Individual_Z9y8'],
    ]) {
      const { command, calls } = invocation({
        'api-version': requested,
        metadata: names.map((name) => `identity-resolution:${name}`),
      });
      const result = await run(command);
      assert.equal(result.status, 'success');
      assert.equal(result.metadata.apiVersion, requested);
      const expected = [...new Set(names)].toSorted();
      assert.deepEqual(
        result.result.selection,
        expected.map((name) => `identity-resolution:${name}`),
      );
      assert.ok(!calls.includes('dmos'));
      assert.deepEqual(
        calls.filter((call) => call.startsWith('write:')),
        expected.map((name) => `write:${name}`),
      );
      for (const item of result.result.items) {
        assert.equal(item.family, 'identity-resolution');
        assert.deepEqual(item.routes, [
          { operation: 'd360_ir_get', apiVersion: '67.0', transport: 'facade' },
          { operation: 'identity-resolutions.get', apiVersion: '65.0', transport: 'native' },
        ]);
      }
    }
  }
});

test('auto mixed DMO/Segment/IR acquires every family before first publication', async () => {
  const { command, calls } = invocation({
    metadata: ['identity-resolution:Individual_A1b2', 'segment:Audience', 'dmo:Sample__dlm'],
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(calls.indexOf('legacy-admit') < calls.indexOf('write:Sample__dlm'));
  assert.ok(calls.indexOf('ir:Individual_A1b2') < calls.indexOf('write:Sample__dlm'));
  assert.deepEqual(
    result.result.items.map((item) => item.routes.map((route) => route.apiVersion)),
    [
      ['65.0', '65.0'],
      ['65.0', '65.0'],
      ['67.0', '65.0'],
    ],
  );
});

test('IR missing/mismatched/incomplete candidate blocks entire mixed publication', async () => {
  for (const acquired of [
    {
      identity: { dataSpace: 'default', apiName: 'Individual_A1b2' },
      blockers: ['OWNER_UNREADABLE'],
    },
    {
      identity: { dataSpace: 'other', apiName: 'Individual_A1b2' },
      blockers: [],
      candidate: document('Individual_A1b2'),
    },
    {
      identity: { dataSpace: 'default', apiName: 'Individual_A1b2' },
      blockers: [],
      candidate: document('Individual_Z9y8'),
    },
    { identity: { dataSpace: 'default', apiName: 'Individual_A1b2' }, blockers: [], candidate: {} },
  ]) {
    const { command, calls } = invocation({
      metadata: ['dmo:Sample__dlm', 'identity-resolution:Individual_A1b2'],
    });
    command.acquireIdentityResolution = async () => acquired;
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.ok(!calls.some((call) => call.startsWith('write:')));
  }
});

test('IR writer failure retains earlier output and does not publish later owners or leak errors', async () => {
  const { command, calls } = invocation({
    metadata: [
      'dmo:Sample__dlm',
      'identity-resolution:Individual_A1b2',
      'identity-resolution:Individual_Z9y8',
    ],
  });
  command.writeIdentityResolution = async () => {
    throw new IdentityResolutionError('OUTPUT_FAILED');
  };
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.errors[0].code, 'OUTPUT_FAILED');
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    ['Sample__dlm'],
  );
  assert.deepEqual(
    calls.filter((call) => call.startsWith('write:')),
    ['write:Sample__dlm'],
  );
});
