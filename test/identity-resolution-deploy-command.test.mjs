import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

const ir = (name = 'Individual_A1b2') => {
  const { facade, native } = irFixture();
  facade.objectApiName = native.objectApiName = name;
  return {
    path: `${name}.json`,
    inputDigest: 'a'.repeat(64),
    document: projectIdentityResolution(facade, native, name).candidate,
  };
};
const dmo = {
  path: 'dmo.json',
  document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'Example__dlm' } },
};
const preview = (family, outcome = 'update') => ({
  ...(family === 'identity-resolution'
    ? {
        family,
        route: { apiVersion: '67.0', operation: 'd360_ir_update' },
        requiredEffects:
          outcome === 'update' ? ['publication', 'generated-output-provisioning'] : [],
      }
    : {}),
  outcome,
  target: 'present',
  absenceProof: 'none',
  diagnostics: [],
});
const setup = (overrides = {}, selected = [ir()]) => {
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const flags = {
    preview: false,
    'api-version': 'auto',
    'data-space': 'default',
    'allow-processing': true,
    'source-dir': ['synthetic'],
    ...overrides,
  };
  const connection = { getApiVersion: () => '65.0' };
  flags['target-org'] = {
    getOrgId: () => {
      calls.push('org');
      return 'synthetic';
    },
    getConnection: () => connection,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => selected;
  command.captureInput = async () => 'a'.repeat(64);
  command.verifyIdentityResolutionInput = async () => {
    calls.push('digest');
  };
  command.bindIdentityResolution = async () => {
    calls.push('binding');
    return 'stable';
  };
  command.preflightIdentityResolution = async (document, conn, selection, space) => {
    assert.equal(conn.getApiVersion(), '67.0');
    assert.equal(connection.getApiVersion(), '65.0');
    assert.deepEqual(selection, { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' });
    assert.equal(space, 'default');
    calls.push(`preview:${document.identity.apiName}`);
    return preview('identity-resolution');
  };
  command.preflight = async () => {
    calls.push('dmo-preview');
    return preview('dmo');
  };
  command.execute = async () => {
    calls.push('dmo-write');
    return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
  };
  command.executeIdentityResolution = async (document, conn, selection, space, options) => {
    await options.verifyInput();
    assert.equal(options.allowProcessing, true);
    await options.recordPoll({
      attempt: 0,
      timestamp: 1,
      statusPresent: true,
      statusType: 'string',
      statusValue: 'PUBLISHING',
    });
    calls.push(`ir-write:${document.identity.apiName}`);
    return {
      family: 'identity-resolution',
      route: { apiVersion: '67.0', operation: 'd360_ir_update' },
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
    };
  };
  return { command, calls, flags };
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

test('IR auto mixed preview is read-only and reports operation versions and publication effects', async () => {
  const { command, calls } = setup({ preview: true }, [ir(), dmo]);
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.metadata.apiVersion, 'auto');
  assert.equal(result.result.items.length, 2);
  assert.deepEqual(result.result.items[1].requiredEffects, [
    'publication',
    'generated-output-provisioning',
  ]);
  assert.deepEqual(
    result.result.items[1].routes.map(({ apiVersion }) => apiVersion),
    ['67.0', '65.0', '65.0', '67.0'],
  );
  assert.ok(!calls.some((call) => call.includes('write')));
});

test('auto mixed IR/Segment/DMO retains legacy fixed65 and whole-selection effects checks', async () => {
  const segment = {
    path: 'audience.xml',
    companionPath: 'audience.json',
    inputDigest: 'b'.repeat(64),
    document: {
      schemaVersion: 1,
      kind: 'segment',
      identity: { dataSpace: 'default', apiName: 'Audience' },
      spec: {
        displayName: 'Audience',
        description: 'Description',
        segmentType: 'DBT',
        segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
        models: [
          { name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' },
        ],
        dependencies: [
          { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
        ],
        publishInterval: 'NO_REFRESH',
        lookbackPeriod: 'P90D',
      },
    },
  };
  for (const acknowledged of [true, false]) {
    const { command, calls } = setup({ 'allow-processing': acknowledged }, [ir(), segment, dmo]);
    command.verifySegmentInput = async () => {};
    command.preflightSegment = async (_, connection, selection) => {
      assert.equal(connection.getApiVersion(), '65.0');
      assert.equal(selection.soapNumeric, '65.0');
      calls.push('segment-preview');
      return { ...preview('segment'), family: 'segment', requiredEffects: ['processing'] };
    };
    command.executeSegment = async (_, __, ___, ____, options) => {
      await options.verifyInput();
      calls.push('segment-write');
      return {
        family: 'segment',
        outcome: 'updated',
        mutation: 'confirmed-updated',
        diagnostics: [],
      };
    };
    const result = await run(command);
    assert.equal(result.status, acknowledged ? 'success' : 'blocked');
    if (acknowledged)
      assert.deepEqual(
        calls.filter((call) => call.includes('write')),
        ['dmo-write', 'ir-write:Individual_A1b2', 'segment-write'],
      );
    else assert.ok(!calls.some((call) => call.includes('write')));
  }
});

test('IR numeric65/latest/unsupported mixed numeric67 and dependency expansion block all writes before target', async () => {
  for (const [flags, selected, code] of [
    [{ 'api-version': '65.0' }, [ir()], 'INVALID_SCOPE'],
    [{ 'api-version': 'latest' }, [ir()], 'INVALID_SCOPE'],
    [{ 'api-version': '67.0' }, [ir(), dmo], 'INVALID_SCOPE'],
    [{ 'data-space': 'other' }, [ir()], 'INVALID_SCOPE'],
    [
      { 'include-dependencies': true },
      [ir()],
      'IDENTITY_RESOLUTION_DEPENDENCY_EXPANSION_UNSUPPORTED',
    ],
  ]) {
    const { command, calls } = setup(flags, selected);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.deepEqual(calls, []);
  }
});

test('IR numeric67 existing-owner execution keeps native65 reads separate and records private poll', async () => {
  const { command, calls } = setup({ 'api-version': '67.0' });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(calls.includes('ir-write:Individual_A1b2'));
  assert.equal(
    command.identityResolutionPolls.get('Individual_A1b2.json')[0].statusValue,
    'PUBLISHING',
  );
  assert.ok(!JSON.stringify(result).includes('PUBLISHING'));
  assert.equal(result.result.items[0].mutation, 'confirmed-updated');
});

test('missing processing acknowledgement or late IR binding failure prevents earlier DMO mutation', async () => {
  for (const failure of ['ack', 'binding', 'effects']) {
    const { command, calls } = setup({ 'allow-processing': failure !== 'ack' }, [dmo, ir()]);
    if (failure === 'binding')
      command.bindIdentityResolution = async () => {
        throw new Error('private binding payload');
      };
    if (failure === 'effects')
      command.preflightIdentityResolution = async () => ({
        ...preview('identity-resolution'),
        requiredEffects: [],
      });
    const result = await run(command);
    assert.notEqual(result.status, 'success');
    assert.ok(!calls.some((call) => call.includes('write')));
    assert.ok(!JSON.stringify(result).includes('private binding payload'));
    assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  }
});

test('late input or pending owner binding drift blocks before first batch write', async () => {
  for (const failure of ['input', 'binding']) {
    const { command, calls } = setup({}, [dmo, ir()]);
    let reads = 0;
    if (failure === 'input')
      command.verifyIdentityResolutionInput = async () => {
        if (++reads >= 3) throw new Error('late bytes');
      };
    else command.bindIdentityResolution = async () => (++reads === 1 ? 'first' : 'changed');
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.ok(!calls.some((call) => call.includes('write')));
  }
});

test('unknown IR outcome preserves earlier DMO and later not-attempted owners without payloads', async () => {
  const { command, calls } = setup({}, [ir('Individual_Z9y8'), dmo, ir()]);
  command.executeIdentityResolution = async () => ({
    ...preview('identity-resolution'),
    outcome: 'failed',
    mutation: 'unknown',
  });
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.result.items.map(({ outcome }) => outcome),
    ['updated', 'failed', 'not-attempted'],
  );
  assert.deepEqual(
    calls.filter((call) => call.includes('write')),
    ['dmo-write'],
  );
});

test('IR no-op batch executes no mutations or Metadata jobs and needs no effects acknowledgement', async () => {
  const { command, calls } = setup({ 'allow-processing': false });
  command.preflightIdentityResolution = async () => preview('identity-resolution', 'unchanged');
  command.executeIdentityResolution = async (_, __, ___, ____, options) => {
    await options.verifyInput();
    return {
      family: 'identity-resolution',
      route: { apiVersion: '67.0', operation: 'd360_ir_update' },
      outcome: 'unchanged',
      mutation: 'not-attempted',
      diagnostics: [],
    };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.ok(!calls.some((call) => call.includes('write')));
});

test('Git IR snapshots cannot disappear or be rebound to changed bytes before routing', async () => {
  for (const admitted of [[], [{ ...ir(), inputDigest: 'b'.repeat(64) }]]) {
    const { command, calls } = setup(
      { 'changed-since': 'HEAD', 'source-dir': undefined },
      admitted,
    );
    command.selectGitInputs = async () => ({
      paths: ['owner'],
      identityResolutions: [ir()],
      provenance: {},
    });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_GIT_SELECTION');
    assert.deepEqual(calls, []);
  }
});
