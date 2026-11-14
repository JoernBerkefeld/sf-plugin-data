import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { errorCodeInfo } from '../lib/errors/registry.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

const fallback =
  'Retrieval did not complete. Check selection, authenticated org, service capability and output path.';
// A thrown error without a Salesforce answer keeps the fallback after this lead.
const unconfirmed = `Plugin verification or request completion failed; no Salesforce rejection was confirmed. ${fallback}`;

/**
 * An identity resolution candidate the command validates.
 * @param {string} apiName Exact object API name.
 * @returns {object} Candidate document.
 */
const irDocument = (apiName) => {
  const { native } = irFixture();
  native.objectApiName = apiName;
  return projectNativeIdentityResolution(native, apiName).candidate;
};

/**
 * Offline retrieve command with every family's seams mocked; `calls` records org access and reads.
 * @param {string[] | undefined} metadata Selectors.
 * @param {object} overrides Flag overrides.
 * @returns {{command: object, calls: string[], lines: string[]}} Command and observations.
 */
function invocation(metadata, overrides = {}) {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const lines = [];
  const flags = {
    metadata,
    'api-version': 'auto',
    overwrite: false,
    'target-org': 'synthetic',
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.log = (line) => lines.push(line);
  command.resolveOrg = async () => {
    calls.push('org');
    // A fresh connection per group: a version pinned by one group never reaches another.
    let pinned;
    return {
      getOrgId: () => 'synthetic-org',
      getConnection: (version) => {
        if (version) pinned ??= version;
        return { getUsername: () => 'synthetic', pinned: () => pinned };
      },
    };
  };
  command.listNativeNames = () => assert.fail('no inventory');
  command.createDmoClient = () => ({});
  command.acquireNativeDmo = async (apiName) => {
    calls.push(`dmo:${apiName}`);
    return { kind: 'dmo', identity: { dataSpace: 'default', apiName } };
  };
  command.writeNativeDmo = async (document) => ({
    path: `${document.identity.apiName}.json`,
    outcome: 'retrieved',
  });
  command.acquireSelection = async (roots) => {
    calls.push('selection');
    return roots.map((identity) => ({
      document: {
        kind: identity.kind,
        identity: { dataSpace: identity.dataSpace, apiName: identity.apiName },
      },
    }));
  };
  command.acquireIdentityResolution = async (_connection, apiName) => {
    calls.push(`identity-resolution:${apiName}`);
    return {
      identity: { dataSpace: 'default', apiName },
      candidate: irDocument(apiName),
      blockers: [],
    };
  };
  command.writeIdentityResolution = async (document) => ({
    path: `${document.identity.apiName}.json`,
    outcome: 'retrieved',
  });
  command.createDataStreamClients = (connection, target, version) => {
    assert.equal(connection.pinned(), '68.0');
    assert.equal(target, 'synthetic');
    assert.equal(version, '68.0');
    return {};
  };
  command.acquireDataStream = async (apiName) => {
    calls.push(`data-stream:${apiName}`);
    return { kind: 'data-stream', identity: { dataSpace: 'default', apiName } };
  };
  command.writeDataStream = async (document) => ({
    path: `${document.identity.apiName}.json`,
    outcome: 'retrieved',
  });
  command.createDataTransformClient = (connection) => {
    assert.equal(connection.pinned(), '68.0');
    return {};
  };
  command.acquireDataTransform = async (apiName) => {
    calls.push(`data-transform:${apiName}`);
    return { document: { definition: { name: apiName } } };
  };
  command.writeDataTransform = async (document) => ({
    path: `${document.definition.name}.json`,
    outcome: 'retrieved',
  });
  command.nativeGraphContext = async (connection) => {
    assert.equal(connection.pinned(), '68.0');
    calls.push('graph-context');
    return { orgId: 'graph-org' };
  };
  command.retrieveNativeGraph = async (apiName) => {
    calls.push(`data-graph:${apiName}`);
    return { apiName };
  };
  command.writeDataGraph = async (document) => ({
    path: `${document.apiName}.json`,
    outcome: 'retrieved',
  });
  return { command, calls, lines };
}

/**
 * Run the command without leaking its exit code into the test runner.
 * @param {object} command Offline command.
 * @returns {Promise<{result: object, exitCode: number}>} Envelope and exit code.
 */
async function run(command) {
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    return { result: await command.run(), exitCode: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
}

const label = (item) => `${item.family ?? 'dmo'}:${item.identity.apiName}`;

for (const other of ['data-transform:Alpha', 'data-stream:Alpha', 'data-graph:Alpha'])
  test(`${other} beside a DMO is read in the same run`, async () => {
    const { command, calls } = invocation([other, 'dmo:Sample__dlm']);
    command.acquireSelection = () => assert.fail('a DMO alone stays on the native route');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(exitCode, 0);
    assert.deepEqual(
      result.result.items.map((item) => label(item)),
      ['dmo:Sample__dlm', other],
    );
    assert.deepEqual(result.result.selection, ['dmo:Sample__dlm', other]);
    // The rest group runs first; every group resolves the org itself.
    assert.deepEqual(calls, [
      'org',
      'dmo:Sample__dlm',
      'org',
      ...(other.startsWith('data-graph') ? ['graph-context'] : []),
      other,
    ]);
    assert.equal(result.provenance.sourceOrgId, 'synthetic-org');
    assert.equal(result.metadata.soapApiVersion, '68.0');
  });

test('transform, stream, graph, identity resolution and DMO retrieve into one envelope', async () => {
  for (const json of [true, false]) {
    const { command, calls, lines } = invocation([
      'data-graph:Graph',
      'data-transform:Transform',
      'identity-resolution:Individual_A1b2',
      'data-stream:Stream',
      'dmo:Sample__dlm',
    ]);
    command.jsonEnabled = () => json;
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(exitCode, 0);
    assert.equal(result.contract, 'sf-data360-retrieve');
    assert.deepEqual(result.result.selection, [
      'dmo:Sample__dlm',
      'identity-resolution:Individual_A1b2',
      'data-stream:Stream',
      'data-transform:Transform',
      'data-graph:Graph',
    ]);
    assert.deepEqual(
      result.result.items.map((item) => label(item)),
      result.result.selection,
    );
    assert.deepEqual(result.diagnostics.errors, []);
    assert.equal(calls.filter((call) => call === 'org').length, 4);
    assert.deepEqual(
      calls.filter((call) => call !== 'org' && call !== 'selection' && call !== 'graph-context'),
      [
        'identity-resolution:Individual_A1b2',
        'data-stream:Stream',
        'data-transform:Transform',
        'data-graph:Graph',
      ],
    );
    if (json) {
      assert.deepEqual(lines, []);
    } else {
      assert.equal(lines[0], 'Retrieve: success.');
      for (const family of [
        'dmo',
        'identity-resolution',
        'data-stream',
        'data-transform',
        'data-graph',
      ])
        assert.ok(lines.includes(`Downloaded ${family}: 1`), lines.join('\n'));
    }
  }
});

test('several data graphs are read one after another from one org context', async () => {
  const { command, calls } = invocation(['data-graph:Zulu', 'data-graph:Alpha', 'data-graph:Zulu']);
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ['org', 'graph-context', 'data-graph:Alpha', 'data-graph:Zulu']);
  assert.deepEqual(result.result.selection, ['data-graph:Alpha', 'data-graph:Zulu']);
  assert.deepEqual(
    result.result.items.map((item) => label(item)),
    ['data-graph:Alpha', 'data-graph:Zulu'],
  );
  assert.equal(result.provenance.sourceOrgId, 'graph-org');
});

test('a failing family keeps the other families and gives a failed aggregate', async () => {
  const { command } = invocation(['data-transform:Alpha', 'data-stream:Broken', 'dmo:Sample__dlm']);
  command.acquireDataStream = async () => {
    throw new Error('private-token');
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  assert.deepEqual(
    result.result.items.map((item) => label(item)),
    ['dmo:Sample__dlm', 'data-transform:Alpha'],
  );
  assert.equal(result.diagnostics.errors.length, 1);
  assert.equal(result.diagnostics.errors[0].code, 'DATA_STREAM_RETRIEVE_FAILED');
  assert.deepEqual(result.diagnostics.errors[0].identity, {
    dataSpace: 'default',
    apiName: 'Broken',
  });
  assert.doesNotMatch(JSON.stringify(result), /private-token/u);
});

test('a failing graph is reported with its identity and the next graph still runs', async () => {
  for (const json of [true, false]) {
    const { command, calls, lines } = invocation([
      'data-graph:Alpha',
      'data-graph:Zulu',
      'dmo:Sample__dlm',
    ]);
    command.jsonEnabled = () => json;
    command.retrieveNativeGraph = async (apiName) => {
      calls.push(`data-graph:${apiName}`);
      if (apiName === 'Alpha') throw new Error('private-token');
      return { apiName };
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.ok(calls.includes('data-graph:Zulu'));
    assert.deepEqual(
      result.result.items.map((item) => label(item)),
      ['dmo:Sample__dlm', 'data-graph:Zulu'],
    );
    assert.deepEqual(result.diagnostics.errors, [
      {
        code: 'NATIVE_GRAPH_RETRIEVE_BLOCKED',
        message: unconfirmed,
        retryable: false,
        identity: { dataSpace: 'default', apiName: 'Alpha' },
        family: 'data-graph',
        hint: errorCodeInfo('NATIVE_GRAPH_RETRIEVE_BLOCKED').hint,
        docs: errorCodeInfo('NATIVE_GRAPH_RETRIEVE_BLOCKED').docs,
      },
    ]);
    if (!json) {
      assert.equal(lines[0], 'Retrieve: blocked.');
      assert.ok(
        lines.some((line) => line.startsWith('data-graph:Alpha: NATIVE_GRAPH_RETRIEVE_BLOCKED')),
      );
      assert.ok(lines.includes('Downloaded data-graph: 1'));
    }
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  }
});

test('a graph org-context failure blocks its group without identity', async () => {
  for (const metadata of [['data-graph:Alpha'], ['data-graph:Alpha', 'dmo:Sample__dlm']]) {
    const { command, lines } = invocation(metadata);
    command.jsonEnabled = () => false;
    command.nativeGraphContext = async () => {
      throw new Error('private-token');
    };
    command.retrieveNativeGraph = () => assert.fail('no graph read without a context');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    const [diagnostic] = result.diagnostics.errors;
    assert.equal(result.diagnostics.errors.length, 1);
    assert.equal(diagnostic.code, 'NATIVE_GRAPH_RETRIEVE_BLOCKED');
    assert.equal(diagnostic.identity, undefined);
    assert.equal(diagnostic.message, unconfirmed);
    if (metadata.length === 1) {
      assert.equal(diagnostic.family, undefined);
      assert.equal(lines[0], 'Retrieve: blocked (NATIVE_GRAPH_RETRIEVE_BLOCKED).');
      assert.deepEqual(result.result.selection, ['data-graph:Alpha']);
      // eslint-disable-next-line unicorn/no-null -- The envelope represents an unresolved org as null.
      assert.equal(result.provenance.sourceOrgId, null);
    } else {
      assert.equal(diagnostic.family, 'data-graph');
      assert.deepEqual(
        result.result.items.map((item) => label(item)),
        ['dmo:Sample__dlm'],
      );
      assert.deepEqual(result.result.selection, ['dmo:Sample__dlm', 'data-graph:Alpha']);
    }
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  }
});

for (const [metadata, overrides, code, family] of [
  [
    ['data-transform:Alpha', 'segment:Audience'],
    { 'api-version': '65.0' },
    'INVALID_SCOPE',
    'data-transform',
  ],
  [
    ['data-graph:Alpha', 'segment:Audience'],
    { 'api-version': '65.0' },
    'INVALID_SCOPE',
    'data-graph',
  ],
  [
    ['dmo:Sample__dlm', 'data-stream:Alpha'],
    { dataspace: 'other' },
    'INVALID_SCOPE',
    'data-stream',
  ],
  [
    ['dmo:Sample__dlm', 'data-transform:Alpha'],
    { dataspace: 'other' },
    'INVALID_SCOPE',
    'data-transform',
  ],
  [['dmo:Sample__dlm', 'data-graph:Alpha'], { dataspace: 'other' }, 'INVALID_SCOPE', 'data-graph'],
  [['data-graph', 'dmo:Sample__dlm'], {}, 'DATA_GRAPH_INVENTORY_UNQUALIFIED', 'data-graph'],
  [['data-graph:1bad', 'dmo:Sample__dlm'], {}, 'INVALID_SELECTION', 'data-graph'],
  [['data-stream:Alpha', 'segment'], {}, 'SEGMENT_INVENTORY_UNQUALIFIED', 'segment'],
  [['data-graph:Alpha', 'dlo:bad name'], {}, 'INVALID_SELECTION', 'dlo'],
])
  test(`a refused group blocks the whole run before org access ${JSON.stringify([metadata, overrides])}`, async () => {
    const { command, calls, lines } = invocation(metadata, overrides);
    command.jsonEnabled = () => false;
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
    assert.deepEqual(result.result.selection, metadata);
    assert.equal(result.diagnostics.errors.length, 1);
    const [diagnostic] = result.diagnostics.errors;
    assert.equal(diagnostic.code, code);
    assert.equal(diagnostic.family, family);
    assert.equal(diagnostic.identity, undefined);
    assert.match(diagnostic.message, new RegExp(`the ${family} selection was refused`, 'u'));
    assert.equal(lines[0], `Retrieve: blocked (${code}).`);
  });

test('a malformed data graph alone is an invalid selection', async () => {
  for (const metadata of [['data-graph:1bad'], ['data-graph:Alpha', 'data-graph:']]) {
    const { command, calls } = invocation(metadata);
    const { result } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(calls, []);
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SELECTION');
    assert.equal(result.diagnostics.errors[0].family, undefined);
  }
});

test('the removed graph selection code is no longer registered', () => {
  assert.equal(errorCodeInfo('NATIVE_GRAPH_SELECTION_UNSUPPORTED'), undefined);
});

test('single-family TARGET_ORG_REQUIRED and NATIVE_INVENTORY_FAILED envelopes are unchanged', async () => {
  for (const code of ['TARGET_ORG_REQUIRED', 'NATIVE_INVENTORY_FAILED']) {
    const { command, lines } = invocation(['dmo']);
    command.jsonEnabled = () => false;
    if (code === 'TARGET_ORG_REQUIRED')
      command.resolveOrg = async () => {
        throw new Error('no org');
      };
    else
      command.listNativeNames = async () => {
        throw new Error('private-token');
      };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(result.result.selection, ['dmo']);
    assert.deepEqual(result.diagnostics.errors, [
      {
        code,
        message: code === 'TARGET_ORG_REQUIRED' ? fallback : unconfirmed,
        retryable: false,
        hint: errorCodeInfo(code).hint,
        docs: errorCodeInfo(code).docs,
      },
    ]);
    assert.equal(lines[0], `Retrieve: blocked (${code}).`);
  }
});

test('a group-level refusal beside other groups names its family and the others still run', async () => {
  const { command, lines } = invocation(['dmo', 'data-stream:Alpha']);
  command.jsonEnabled = () => false;
  command.listNativeNames = async () => {
    throw new Error('private-token');
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.deepEqual(
    result.result.items.map((item) => label(item)),
    ['data-stream:Alpha'],
  );
  assert.deepEqual(result.result.selection, ['dmo', 'data-stream:Alpha']);
  assert.deepEqual(result.diagnostics.errors, [
    {
      code: 'NATIVE_INVENTORY_FAILED',
      message: unconfirmed,
      retryable: false,
      family: 'dmo',
      hint: errorCodeInfo('NATIVE_INVENTORY_FAILED').hint,
      docs: errorCodeInfo('NATIVE_INVENTORY_FAILED').docs,
    },
  ]);
  assert.equal(lines[0], 'Retrieve: blocked.');
  assert.ok(lines.some((line) => line.startsWith('NATIVE_INVENTORY_FAILED: ')));
  assert.doesNotMatch(JSON.stringify(result), /private-token/u);
});

test('an org failure of one group beside others leaves the other groups retrieved', async () => {
  const { command } = invocation(['data-transform:Alpha', 'data-graph:Graph']);
  let groups = 0;
  const resolve = command.resolveOrg;
  command.resolveOrg = async (...arguments_) => {
    groups += 1;
    if (groups === 1) throw new Error('no org');
    return resolve(...arguments_);
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.deepEqual(
    result.result.items.map((item) => label(item)),
    ['data-graph:Graph'],
  );
  assert.deepEqual(
    result.diagnostics.errors.map(({ code, family }) => [code, family]),
    [['TARGET_ORG_REQUIRED', 'data-transform']],
  );
  assert.equal(result.provenance.sourceOrgId, 'graph-org');
});
