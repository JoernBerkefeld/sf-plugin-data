import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  apiDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';

test('native IR binding preview wrapper reaches human and JSON diagnostics without changing admission', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' },
  ]);
  for (const human of [true, false]) {
    const { command, calls } = setup();
    const logs = [];
    command.jsonEnabled = () => !human;
    command.log = (line) => logs.push(line);
    command.bindIdentityResolution = Deploy.prototype.bindIdentityResolution;
    let previews = 0;
    command.preflightIdentityResolution = async () =>
      ++previews === 1
        ? preview('identity-resolution')
        : retainConnectDiagnostic(preview('identity-resolution', 'blocked'), evidence);
    previews = 1;
    await assert.rejects(command.bindIdentityResolution(ir(), {}, {}), (error) => {
      assert.equal(error.message, 'IR target binding unavailable');
      assert.equal(getConnectDiagnostic(error), evidence);
      assert.deepEqual(Object.keys(error), []);
      return true;
    });
    previews = 0;
    const result = await run(command);
    assert.equal(result.status, 'failed');
    const diagnostic = result.result.items[0].preflight.diagnostics.find((item) =>
      item.message.includes('INVALID_INPUT'),
    );
    assert.ok(diagnostic, JSON.stringify(result));
    assert.match(diagnostic.message, /HTTP 400.*INVALID_INPUT/u);
    assert.match(diagnostic.message, /Reduce the ruleset count to 10/u);
    assert.equal(logs.filter((line) => line.includes(diagnostic.message)).length, human ? 1 : 0);
    assert.ok(!calls.some((call) => call.includes('write')));
    assert.doesNotMatch(JSON.stringify(result), /statusCode/u);
  }
});
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { preflightNativeIdentityResolutionDeploy } from '../lib/services/preflight-identity-resolution-deploy.js';
import { expandedNativeIrFixture, nativeIrFixture } from './identity-resolution-fixtures.mjs';

test('native IR binding preserves acquired owner diagnostics after successful independent dependency reads', async () => {
  const input = ir();
  const { command } = setup();
  command.preflightIdentityResolution = async () => preview('identity-resolution');
  const names = new Map(
    input.document.spec.reconciliationRules.map((rule, index) => [rule.entity.apiName, index]),
  );
  const fields = (name) => [
    ...new Set([
      'ssot__Id__c',
      ...input.document.spec.matchRules
        .flatMap((rule) => rule.criteria)
        .filter((item) => item.field.parentApiName === name)
        .map((item) => item.field.apiName),
    ]),
  ];
  let ownerReads = 0;
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '68.0',
    _transport: { httpRequest: () => assert.fail('No actual HTTP') },
    metadata: {
      read: async (_type, [name]) => [
        {
          fullName: name,
          mktDataModelAttributes: { dataSpaceName: 'default' },
          fields: fields(name).map((fullName) => ({
            fullName,
            type: 'Text',
            mktDataModelFieldAttributes: {
              primaryIndexOrder: fullName === 'ssot__Id__c' ? '1' : '',
            },
          })),
        },
      ],
    },
    request: async (request) => {
      const name = request.url.split('/').at(-1);
      if (request.url.includes('/identity-resolutions/')) {
        ownerReads++;
        throw {
          statusCode: 400,
          data: [{ errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' }],
        };
      }
      assert.ok(names.has(name));
      return {
        name,
        id: `target-${names.get(name)}`,
        dataSpaceName: 'default',
        fields: fields(name).map((name) => ({ name, type: 'Text' })),
      };
    },
  };
  await assert.rejects(
    Deploy.prototype.bindIdentityResolution.call(command, input, connection, {
      requested: '68.0',
      restSelector: 'v68.0',
      soapNumeric: '68.0',
    }),
    (error) => {
      assert.equal(error.message, 'IR target binding unavailable');
      assert.equal(getConnectDiagnostic(error).statusCode, 400);
      assert.equal(getConnectDiagnostic(error).errors[0].code, 'INVALID_INPUT');
      assert.deepEqual(Object.keys(error), []);
      return true;
    },
  );
  assert.equal(ownerReads, 1);
});

const ir = (name = 'Individual_A1b2') => {
  const native = nativeIrFixture();
  native.objectApiName = name;
  native.rulesetId = name.slice('Individual_'.length);
  return {
    path: `${name}.json`,
    inputDigest: 'a'.repeat(64),
    document: projectNativeIdentityResolution(native, name).candidate,
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
        route: { apiVersion: '68.0', operation: 'identity-resolutions.patch' },
        requiredEffects: outcome === 'update' ? ['processing'] : [],
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
    dataspace: 'default',
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
    assert.equal(conn.getApiVersion(), '68.0');
    assert.equal(connection.getApiVersion(), '65.0');
    assert.deepEqual(selection, { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' });
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
    assert.equal(options.allowGeneratedOutputProvisioning, true);
    calls.push(`ir-write:${document.identity.apiName}`);
    return {
      family: 'identity-resolution',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.patch' },
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
  assert.deepEqual(result.result.items[1].requiredEffects, ['processing']);
  assert.deepEqual(
    result.result.items[1].routes.map(({ apiVersion }) => apiVersion),
    ['68.0', '68.0', '68.0', '68.0'],
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
    [{ 'api-version': '67.0' }, [ir()], 'INVALID_SCOPE'],
    [{ 'api-version': '69.0' }, [ir()], 'INVALID_SCOPE'],
    [{ 'api-version': '68.0' }, [ir(), dmo], 'INVALID_SCOPE'],
    [{ dataspace: 'other' }, [ir()], 'INVALID_SCOPE'],
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

test('IR auto/API68 existing-owner execution uses only native68 and processing effects', async () => {
  for (const requested of ['auto', '68.0']) {
    const { command, calls } = setup({ 'api-version': requested });
    const result = await run(command);
    assert.equal(result.status, 'success');
    assert.ok(calls.includes('ir-write:Individual_A1b2'));
    assert.equal(result.result.items[0].route.apiVersion, '68.0');
    assert.equal(result.result.items[0].mutation, 'confirmed-updated');
  }
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
      route: { apiVersion: '68.0', operation: 'identity-resolutions.patch' },
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

const createPreview = () => ({
  ...preview('identity-resolution', 'create'),
  target: 'absent',
  absenceProof: 'exact-item-not-found',
  route: { apiVersion: '68.0', operation: 'identity-resolutions.post' },
  requiredEffects: ['processing', 'generated-output-provisioning'],
  precreateBinding: { phase: 'precreate', fingerprint: 'a'.repeat(64) },
});

test('public native CREATE preview and execution acknowledge generated provisioning with existing flag', async () => {
  for (const requested of ['auto', '68.0'])
    for (const previewOnly of [true, false])
      for (const acknowledged of [true, false]) {
        const { command, calls } = setup({
          'api-version': requested,
          preview: previewOnly,
          'allow-processing': acknowledged,
        });
        command.preflightIdentityResolution = async () => createPreview();
        command.executeIdentityResolution = async (_, conn, selection, space, options) => {
          assert.equal(conn.getApiVersion(), '68.0');
          assert.equal(selection.soapNumeric, '68.0');
          assert.equal(space, 'default');
          assert.equal(options.allowProcessing, true);
          assert.equal(options.allowGeneratedOutputProvisioning, true);
          await options.verifyInput();
          calls.push('create');
          return {
            family: 'identity-resolution',
            route: createPreview().route,
            outcome: 'created',
            mutation: 'confirmed-created',
            diagnostics: [],
          };
        };
        const result = await run(command);
        assert.equal(result.status, previewOnly || acknowledged ? 'success' : 'blocked');
        assert.equal(calls.includes('create'), !previewOnly && acknowledged);
        assert.deepEqual(result.result.items[0].requiredEffects, [
          'processing',
          'generated-output-provisioning',
        ]);
        assert.equal(result.result.items[0].route.operation, 'identity-resolutions.post');
      }
});

test('CREATE target appearance or input binding drift prevents earlier mixed batch mutation', async () => {
  for (const drift of ['owner', 'input']) {
    const { command, calls } = setup({}, [dmo, ir()]);
    let previews = 0;
    command.preflightIdentityResolution = async () =>
      ++previews === 1 || drift !== 'owner'
        ? createPreview()
        : preview('identity-resolution', 'unchanged');
    let bindings = 0;
    command.bindIdentityResolution = async () =>
      ++bindings === 1 ? 'precreate' : drift === 'owner' ? 'precreate' : `${drift}-changed`;
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.ok(!calls.some((call) => call.includes('write')));
    assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  }
});

test('public CREATE binding hashes absence and current inputs without enumeration or output lookup', async () => {
  const { command } = setup();
  command.preflightIdentityResolution = async () => createPreview();
  const bind = () =>
    Deploy.prototype.bindIdentityResolution.call(
      command,
      ir(),
      { getApiVersion: () => '68.0', request: () => assert.fail('No predicted output reads') },
      { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
    );
  const first = await bind();
  assert.equal(await bind(), first);
  command.preflightIdentityResolution = async () => ({
    ...createPreview(),
    precreateBinding: { ...createPreview().precreateBinding, fingerprint: 'b'.repeat(64) },
  });
  assert.notEqual(await bind(), first);
});

test('public CREATE binding succeeds with exact absence and compatible inputs but no enumeration', async () => {
  const { command } = setup();
  let gets = 0;
  command.preflightIdentityResolution = (document, connection, selection, space) =>
    preflightNativeIdentityResolutionDeploy(document, connection, selection, space, {
      verifyDependencies: async () => {},
      verifyPrecreateInputs: async () => ({ fingerprint: 'a'.repeat(64) }),
    });
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    request: async (request) => {
      gets++;
      assert.equal(request.method, 'GET');
      assert.equal(request.url.endsWith('/identity-resolutions/Individual_A1b2'), true);
      throw {
        statusCode: 404,
        name: 'ITEM_NOT_FOUND',
        errorCode: 'ITEM_NOT_FOUND',
        data: { errorCode: 'ITEM_NOT_FOUND', message: 'No owner' },
      };
    },
  };
  const fingerprint = await Deploy.prototype.bindIdentityResolution.call(
    command,
    ir(),
    connection,
    {
      requested: '68.0',
      restSelector: 'v68.0',
      soapNumeric: '68.0',
    },
  );
  assert.match(fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(gets, 1);
});

test('legacy IR documents require explicit migration before any target access', async () => {
  const input = ir();
  delete input.document.spec.trustedSources;
  const { command, calls } = setup({}, [input]);
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(
    result.diagnostics.errors[0].code,
    'IDENTITY_RESOLUTION_TRUSTED_SOURCES_MIGRATION_REQUIRED',
  );
  assert.deepEqual(calls, []);
});

test('public FirstName case-sensitive matching rejects before any target access or mutation', async () => {
  const input = ir();
  input.document.spec.matchRules[0].criteria[0].caseSensitiveMatch = true;
  const { command, calls } = setup({}, [input]);
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(calls, []);
});

test('public rich IR admission retains complete supported settings and existing argv', async () => {
  const input = ir();
  input.document = projectNativeIdentityResolution(
    expandedNativeIrFixture(),
    input.document.identity.apiName,
  ).candidate;
  const { command, calls } = setup({}, [input]);
  command.preflightIdentityResolution = async (document) => {
    assert.deepEqual(document, input.document);
    return preview('identity-resolution');
  };
  command.executeIdentityResolution = async (document, _connection, selection, space, options) => {
    assert.deepEqual(document, input.document);
    assert.equal(selection.requested, '68.0');
    assert.equal(space, 'default');
    assert.equal(options.allowProcessing, true);
    await options.verifyInput();
    calls.push('rich-write');
    return {
      family: 'identity-resolution',
      route: preview('identity-resolution').route,
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
    };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(calls.includes('rich-write'), true);
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
