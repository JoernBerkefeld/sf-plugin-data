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
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

test('IR retrieve terminal and JSON share safe API explanations with unchanged failure control flow', async () => {
  for (const human of [true, false]) {
    for (const [status, message] of [
      [400, 'Reduce the ruleset count to 10.'],
      [500, 'Internal Server Error'],
      [400, 'password=never-display-this'],
    ]) {
      const { command, calls } = invocation();
      const logs = [];
      command.jsonEnabled = () => !human;
      command.log = (line) => logs.push(line);
      command.acquireIdentityResolution = async () =>
        retainConnectDiagnostic(
          {
            identity: { dataSpace: 'default', apiName: 'Individual_A1b2' },
            blockers: ['IDENTITY_RESOLUTION_ACQUISITION_FAILED'],
          },
          apiDiagnostic(status, [{ errorCode: 'INVALID_INPUT', message }]),
        );
      const previous = process.exitCode;
      let result;
      let exitCode;
      try {
        result = await command.run();
        exitCode = process.exitCode;
      } finally {
        process.exitCode = previous;
      }
      assert.equal(result.status, 'failed');
      assert.equal(exitCode, 1);
      assert.deepEqual(result.result.items, []);
      assert.equal(
        calls.some((call) => call.startsWith('write:')),
        false,
      );
      const diagnostic = result.diagnostics.errors[0];
      assert.equal(diagnostic.code, 'IDENTITY_RESOLUTION_ACQUISITION_FAILED');
      assert.equal(diagnostic.retryable, false);
      assert.match(diagnostic.message, new RegExp(`HTTP ${status}.*INVALID_INPUT`, 'u'));
      assert.match(diagnostic.message, /no files were written/u);
      if (message.startsWith('Reduce')) assert.ok(diagnostic.message.includes(message));
      else assert.ok(!JSON.stringify(result).includes(message));
      assert.equal(logs.filter((line) => line.includes(diagnostic.message)).length, human ? 1 : 0);
      assert.doesNotMatch(logs.join('\n'), /never-display-this|Internal Server Error/u);
    }
  }
});

test('IR retrieve help describes native68 routing without claiming installed lifecycle acceptance', () => {
  assert.match(Retrieve.description, /IR uses native API68 exact owner reads in default space/u);
  assert.match(Retrieve.description, /auto and explicit numeric68 are supported/u);
  assert.match(Retrieve.description, /numeric67 is rejected/u);
  assert.doesNotMatch(Retrieve.description, /IR requires auto or numeric67/u);
});

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
    dataspace: 'default',
    'output-dir': 'synthetic-project',
    overwrite: true,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const calls = [];
  const connection = { getApiVersion: () => '68.0' };
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
  command.listNativeNames = async () => {
    calls.push('dmos');
    return ['Sample__dlm'];
  };
  command.acquireSelection = async (roots, conn, version) => {
    assert.equal(conn, connection);
    // The co-selected families decide the shared version; a DMO never pins it.
    assert.deepEqual(version, { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' });
    calls.push('selection-admit');
    return roots.map((identity) => ({
      document: {
        kind: identity.kind,
        identity: { dataSpace: identity.dataSpace, apiName: identity.apiName },
      },
      ...(identity.kind === 'segment' ? { definitionXml: '<independent/>' } : {}),
    }));
  };
  command.acquireIdentityResolution = async (conn, apiName, version, space) => {
    assert.equal(conn, connection);
    assert.equal(space, 'default');
    assert.deepEqual(version, { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' });
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
  command.writeNativeDmo = writer;
  command.writeSegment = writer;
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

test('fixed per-family auto routes never reinterpret numeric pins and refuse latest', () => {
  for (const family of ['segment', 'identity-resolution'])
    assert.equal(operationApiVersion('auto', family), '68.0');
  assert.equal(operationApiVersion('auto', 'data-graph'), '67.0');
  assert.equal(operationApiVersion('67.0', 'data-graph'), '67.0');
  assert.throws(() => operationApiVersion('68.0', 'data-graph'), /INVALID_SCOPE/u);
  assert.equal(operationApiVersion('68.0', 'identity-resolution'), '68.0');
  for (const [requested, family] of [
    ['65.0', 'identity-resolution'],
    ['latest', 'identity-resolution'],
    ['latest', 'segment'],
    ['auto', 'dmo'],
    ['65.0', 'dmo'],
    ['67.0', 'segment'],
    ['67.0', 'identity-resolution'],
  ])
    assert.throws(() => operationApiVersion(requested, family), /INVALID_SCOPE/u);
});

test('IR explicit65/latest and unsupported numeric mixed routes block before org/output', async () => {
  for (const overrides of [
    { 'api-version': '65.0' },
    { 'api-version': 'latest' },
    { 'api-version': '67.0' },
    { metadata: ['identity-resolution'] },
    { metadata: ['identity-resolution:../unsafe'] },
    { dataspace: 'other' },
    { 'api-version': '65.0', metadata: ['identity-resolution:Individual_A1b2', 'dmo:Sample__dlm'] },
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
  for (const requested of ['auto', '68.0']) {
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
          { operation: 'identity-resolutions.get', apiVersion: '68.0', transport: 'native' },
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
  assert.ok(calls.indexOf('selection-admit') < calls.indexOf('write:Sample__dlm'));
  assert.ok(calls.indexOf('ir:Individual_A1b2') < calls.indexOf('write:Sample__dlm'));
  assert.deepEqual(
    result.result.items.map((item) => item.routes.map((route) => route.apiVersion)),
    [['68.0'], ['68.0'], ['68.0']],
  );
});

test('explicit 68.0 serves an IR owner beside a DMO, each on its own route', async () => {
  const { command } = invocation({
    'api-version': '68.0',
    metadata: ['identity-resolution:Individual_A1b2', 'dmo:Sample__dlm'],
  });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.routes[0].apiVersion]),
    [
      ['Sample__dlm', '68.0'],
      ['Individual_A1b2', '68.0'],
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
