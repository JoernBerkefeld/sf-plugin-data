import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Config } from '@oclif/core';
import Delete from '../lib/commands/data360/delete.js';
import {
  executeDeleteDataStream,
  preflightDeleteDataStream,
} from '../lib/services/command-native-data-stream.js';
import { DataStreamError } from '../lib/artifacts/data-stream-document.js';
import { DataStreamHttpError } from '../lib/transport/data-stream-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';

/**
 * Construct an offline command with observable routing boundaries.
 * @param {object} overrides Flag overrides.
 * @returns {object} Command, flags, calls and human output.
 */
function invocation(overrides = {}) {
  const command = Object.create(Delete.prototype);
  const flags = {
    metadata: ['data-stream:Selected'],
    preview: false,
    'delete-dlo': false,
    'target-org': 'synthetic',
    ...overrides,
  };
  const calls = [];
  const lines = [];
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.log = (line) => lines.push(line);
  command.resolveTarget = async () => {
    calls.push('auth');
    return 'synthetic';
  };
  command.createDataStreamClients = async (target, version) => {
    assert.equal(target, 'synthetic');
    assert.equal(version, '68.0');
    return {};
  };
  command.preflightDeleteDataStream = async (name, _clients, options) => {
    calls.push(['preview', name, options.deleteDlo]);
    await options.verifyInput();
    return { outcome: 'delete', mutation: 'not-attempted', deleteDlo: options.deleteDlo };
  };
  command.executeDeleteDataStream = async (name, _clients, options) => {
    calls.push(['delete', name, options.deleteDlo]);
    await options.verifyInput();
    return {
      outcome: 'deleted',
      mutation: 'confirmed-deleted',
      targetApiName: name,
      targetDloName: 'Linked__dll',
      diagnostics: [],
    };
  };
  command.createDloClient =
    command.createDloNativeDeleteClient =
    command.createDmoClient =
    command.createDmoNativeDeleteClient =
    command.createMappingClient =
    command.createMappingSender =
      () => assert.fail('No other family fallback');
  return { command, flags, calls, lines };
}

/**
 * Observe envelope failures without contaminating the test process exit status.
 * @param {object} command Offline command.
 * @returns {Promise<object>} Envelope and exit code.
 */
async function run(command) {
  const prior = process.exitCode;
  process.exitCode = 0;
  try {
    return { result: await command.run(), code: process.exitCode };
  } finally {
    process.exitCode = prior;
  }
}

for (const preview of [false, true])
  for (const cascade of [false, true])
    for (const json of [false, true])
      test(`stream delete public preview/cascade/json ${preview}/${cascade}/${json}`, async () => {
        const fixture = invocation({
          preview,
          'delete-dlo': cascade,
          metadata: ['data-stream:Zed', 'data-stream:Selected', 'data-stream:Selected'],
        });
        fixture.command.jsonEnabled = () => json;
        const { result, code } = await run(fixture.command);
        assert.equal(code, 0);
        assert.equal(result.status, 'success');
        assert.equal(result.metadata.apiVersion, '68.0');
        assert.deepEqual(
          result.result.items.map((item) => item.identity.apiName),
          ['Selected', 'Zed'],
        );
        for (const item of result.result.items) {
          assert.equal(item.deleteDlo, cascade);
          assert.equal(item.outcome, preview ? 'delete' : 'deleted');
          assert.equal(item.mutation, preview ? 'not-attempted' : 'confirmed-deleted');
          assert.deepEqual(
            item.routes.map((route) => route.apiVersion),
            ['68.0', '68.0', '68.0'],
          );
          assert.ok(item.routes.every(({ transport }) => transport === 'native'));
        }
        assert.equal(fixture.calls.filter((call) => Array.isArray(call)).length, 2);
        assert.ok(
          fixture.calls
            .filter((call) => Array.isArray(call))
            .every((call) => call[0] === (preview ? 'preview' : 'delete') && call[2] === cascade),
        );
        if (json) assert.deepEqual(fixture.lines, []);
        else
          assert.ok(
            fixture.lines.includes(
              preview
                ? 'Planned delete: data-stream:Selected; mutation: not-attempted.'
                : 'deleted data-stream Selected',
            ),
          );
      });

for (const overrides of [
  { metadata: ['data-stream'] },
  { metadata: ['data-stream:*'] },
  { metadata: ['data-stream:../Other'] },
  { metadata: ['dlo:Other__dll'], 'delete-dlo': true },
  { dataspace: 'Unknown' },
  ...['latest', '67.0', '69.0', '68', ''].map((pin) => ({ 'api-version': pin })),
])
  test(`stream delete refuses local scope before auth ${JSON.stringify(overrides)}`, async () => {
    const fixture = invocation(overrides);
    const { result, code } = await run(fixture.command);
    assert.equal(result.status, 'blocked');
    assert.equal(code, 1);
    assert.deepEqual(fixture.calls, []);
  });

test('delete auto and explicit68 default-space aliases preserve strict admission', async () => {
  for (const pin of ['auto', '68.0']) {
    const fixture = invocation({ 'api-version': pin, dataspace: 'default' });
    const observed = await run(fixture.command);
    assert.equal(observed.result.status, 'success');
  }
  const config = await Config.load({ root: process.cwd() });
  for (const id of ['data360:delete', 'datacloud:delete', 'd360:delete', 'dc:delete']) {
    const resolved = config.findCommand(id);
    assert.ok(resolved);
    const command = new Delete(
      ['-m', 'data-stream:Selected', '--data-space', 'default', '--delete-dlo', '--preview'],
      config,
    );
    const parsed = await command.parse(Delete);
    assert.equal(parsed.flags['delete-dlo'], true);
    assert.equal(parsed.flags.dataspace, 'default');
  }
  assert.equal('allow-processing' in Delete.flags, false);
});

test('unknown first item stops batch with accurate payload-free per-item failure', async () => {
  const fixture = invocation({ metadata: ['data-stream:A', 'data-stream:B'] });
  fixture.command.executeDeleteDataStream = async (name) => {
    fixture.calls.push(name);
    return {
      outcome: 'failed',
      mutation: 'unknown',
      diagnostics: [
        {
          code: 'STREAM_DELETE_UNCONFIRMED',
          message: 'Inspect unknown outcome.',
          retryable: false,
        },
      ],
    };
  };
  const { result } = await run(fixture.command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items.length, 1);
  assert.equal(result.result.items[0].identity.apiName, 'A');
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.ok(!fixture.calls.includes('B'));
});

test('selection drift after authentication blocks before preview or dispatch', async () => {
  const fixture = invocation();
  fixture.command.resolveTarget = async () => {
    fixture.flags['delete-dlo'] = true;
    return 'synthetic';
  };
  const { result } = await run(fixture.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'STREAM_DELETE_INPUT_DRIFT');
  assert.equal(fixture.calls.length, 0);
});

test('real delete adapters reject unbound target and sanitize before actual mutation', async () => {
  let writes = 0;
  const clients = {
    streams: {
      get: async () => {
        throw new Error('private-secret');
      },
      list: async () => [],
      delete: async () => {
        writes++;
      },
    },
    connections: {
      list: async () => assert.fail('No connection read after failed exact target'),
      get: async () => assert.fail('No connection read after failed exact target'),
      schema: async () => assert.fail('No connection read after failed exact target'),
    },
    dependencies: {
      stream: async () => assert.fail('No dependency read after failed exact target'),
      dlo: async () => assert.fail('No dependency read after failed exact target'),
    },
    dlo: { get: async () => assert.fail('No parent read') },
  };
  const options = { deleteDlo: false, verifyInput: async () => {} };
  const result = await executeDeleteDataStream('Selected', clients, options);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(writes, 0);
  assert.ok(!JSON.stringify(result).includes('private-secret'));
  await assert.rejects(preflightDeleteDataStream('Selected', clients, options));
  const drift = await executeDeleteDataStream('Selected', clients, {
    ...options,
    verifyInput: async () => {
      throw new DataStreamError('STREAM_DELETE_INPUT_DRIFT');
    },
  });
  assert.equal(drift.diagnostics[0].code, 'STREAM_DELETE_INPUT_DRIFT');
});

/**
 * Supply independent selected-stream and linked-DLO evidence for real adapter execution.
 * @param {object} controls Synthetic cascade and post-write fault controls.
 * @returns {object} Clients and single-attempt counters.
 */
function lifecycle(controls = {}) {
  const sid = '1ds000000000001AAA';
  const did = '1dl000000000001AAA';
  const cid = '1WM000000000001AAA';
  const field = { name: 'ProbeId', label: 'ProbeId', dataType: 'Text', isPrimaryKey: true };
  const parent = {
    name: 'Linked__dll',
    label: 'Linked',
    id: did,
    status: 'ACTIVE',
    category: 'Other',
    dataSpaceInfo: [{ name: 'default' }],
    fields: [{ ...field, name: 'ProbeId__c' }],
  };
  const stream = {
    name: 'Selected',
    recordId: sid,
    label: 'Selected label',
    status: 'ACTIVE',
    dataSource: 'Connection',
    dataStreamType: 'INGESTAPI',
    connectorInfo: { connectorType: 'IngestApi' },
    refreshConfig: { refreshMode: 'UPSERT' },
    sourceFields: [{ name: 'ProbeId', datatype: 'Text' }],
    mappings: [{ sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' }],
    dataLakeObjectInfo: {
      name: parent.name,
      label: parent.label,
      category: 'Other',
      dataSpaceInfo: [{ name: 'default' }],
      fields: [field],
    },
  };
  let writes = 0;
  const clients = {
    streams: {
      get: async () => {
        if (controls.absent) throw controls.absent;
        if (writes) {
          if (controls.readError) throw controls.readError;
          throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
        }
        return structuredClone(stream);
      },
      list: async () => (writes ? [] : [structuredClone(stream)]),
      delete: async (identity, cascade) => {
        assert.equal(identity, sid);
        assert.equal(cascade, controls.cascade === true);
        writes++;
      },
    },
    connections: {
      list: async () => ({
        connections: [{ name: 'Connection', id: cid, connectorType: 'IngestApi' }],
      }),
      get: async (identity) => {
        assert.equal(identity, cid);
        return { name: 'Connection', id: cid, connectorType: 'IngestApi', status: 'CONNECTED' };
      },
      schema: async (identity) => {
        assert.equal(identity, cid);
        return {
          schemas: [
            {
              name: 'Event',
              schemaType: 'IngestApi',
              availabilityStatus: writes ? 'Available' : 'In Use',
              fields: [{ name: 'ProbeId', label: 'ProbeId', dataType: 'Text' }],
            },
          ],
        };
      },
    },
    dependencies: {
      stream: async (identity) => {
        assert.equal(identity, sid);
        return { dependencies: [], totalSize: 0 };
      },
      dlo: async (identity) => {
        assert.equal(identity, parent.name);
        return writes
          ? { dependencies: [], totalSize: 0 }
          : {
              dependencies: [
                {
                  componentType: 'DataStream',
                  id: controls.wrongOwner ? '1ds000000000002AAA' : sid,
                  name: stream.label,
                },
                ...(controls.dloDependents ?? []),
              ],
              totalSize: 1 + (controls.dloDependents ?? []).length,
            };
      },
    },
    dlo: {
      get: async (identity) => {
        assert.ok([parent.name, did].includes(identity));
        if (writes && controls.cascade) throw new ConnectError('REQUEST_FAILED', 404);
        return { dataLakeObjects: [structuredClone(parent)] };
      },
    },
  };
  return { clients, writes: () => writes };
}

test('real adapter and command settle default-preserve and explicit-cascade with independent reads', async () => {
  for (const cascade of [false, true]) {
    const native = lifecycle({ cascade });
    const fixture = invocation({ 'delete-dlo': cascade });
    fixture.command.createDataStreamClients = async () => native.clients;
    fixture.command.executeDeleteDataStream = executeDeleteDataStream;
    const { result } = await run(fixture.command);
    assert.equal(result.status, 'success');
    assert.equal(native.writes(), 1);
    assert.equal(result.result.items[0].targetDloName, 'Linked__dll');
    assert.equal(result.result.items[0].mutation, 'confirmed-deleted');
  }
});

test('real adapter preview has zero writes; wrong dependency owner blocks and postdispatch400/500 remain unknown', async () => {
  const preview = lifecycle();
  const options = { deleteDlo: false, verifyInput: async () => {} };
  const plan = await preflightDeleteDataStream('Selected', preview.clients, options);
  assert.equal(plan.outcome, 'delete');
  assert.equal(preview.writes(), 0);
  const wrong = lifecycle({ wrongOwner: true });
  const blocked = await executeDeleteDataStream('Selected', wrong.clients, options);
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(wrong.writes(), 0);
  for (const status of [400, 500]) {
    const unknown = lifecycle({ readError: new DataStreamHttpError('STREAM_HTTP_ERROR', status) });
    const result = await executeDeleteDataStream('Selected', unknown.clients, options);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(unknown.writes(), 1);
  }
});

test('a stream whose first read answers 404 is unchanged in preview and real delete, with or without --delete-dlo', async () => {
  for (const deleteDlo of [false, true]) {
    const options = { deleteDlo, verifyInput: async () => {} };
    for (const absent of [
      new DataStreamHttpError('REQUEST_FAILED', 404),
      new DataStreamHttpError('STREAM_HTTP_ERROR', 404),
    ]) {
      const gone = lifecycle({ absent });
      const plan = await preflightDeleteDataStream('Selected', gone.clients, options);
      assert.deepEqual([plan.outcome, plan.mutation], ['unchanged', 'not-attempted']);
      const result = await executeDeleteDataStream('Selected', gone.clients, options);
      assert.deepEqual(
        [result.outcome, result.mutation, result.diagnostics],
        ['unchanged', 'not-attempted', []],
      );
      assert.equal(gone.writes(), 0);
    }
    // Any other answer of the first read still blocks.
    const refused = lifecycle({ absent: new DataStreamHttpError('REQUEST_FAILED', 403) });
    await assert.rejects(preflightDeleteDataStream('Selected', refused.clients, options));
    const blocked = await executeDeleteDataStream('Selected', refused.clients, options);
    assert.deepEqual([blocked.outcome, blocked.mutation], ['blocked', 'not-attempted']);
  }
});

for (const metadata of [
  ['data-stream:Selected'],
  ['mapping:M_1', 'data-stream:Selected', 'dmo:Target__dlm'],
])
  test(`a rerun of a delete whose stream is already gone succeeds ${metadata.join(' ')}`, async () => {
    for (const deleteDlo of [false, true]) {
      const native = lifecycle({ absent: new DataStreamHttpError('REQUEST_FAILED', 404) });
      const fixture = invocation({ metadata, 'delete-dlo': deleteDlo });
      fixture.command.createDataStreamClients = async () => native.clients;
      fixture.command.executeDeleteDataStream = executeDeleteDataStream;
      // The mapping and DMO are gone too.
      fixture.command.createMappingClient = () => ({
        get: async () => {
          throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
        },
      });
      fixture.command.createMappingSender = () => ({});
      fixture.command.deleteMapping = async (name, client) => client.get(name);
      fixture.command.createDmoNativeDeleteClient = () => ({});
      fixture.command.deleteDmo = async () => {
        throw new NativeDmoError('DMO_HTTP_ERROR', 404);
      };
      const { result, code } = await run(fixture.command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(code, 0);
      assert.ok(result.result.items.every((item) => item.outcome === 'unchanged'));
      assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
      assert.equal(native.writes(), 0);
    }
  });

test('stream preview: dependents that the same delete plans to delete are planned-dependencies', async () => {
  const dmo = { componentType: 'DataModelObject', id: '0dm000000000001AAA', name: 'Target__dlm' };
  const options = { deleteDlo: true, verifyInput: async () => {} };
  const covered = lifecycle({ dloDependents: [dmo] });
  const seen = [];
  const plan = await preflightDeleteDataStream('Selected', covered.clients, {
    ...options,
    covered: async (dependent, dlo) => {
      seen.push([dependent, dlo]);
      return true;
    },
  });
  assert.equal(plan.outcome, 'planned-dependencies');
  assert.deepEqual(plan.plannedDependencies, [
    { componentType: 'DataModelObject', name: 'Target__dlm' },
  ]);
  assert.deepEqual(seen, [
    [{ componentType: 'DataModelObject', name: 'Target__dlm' }, 'Linked__dll'],
  ]);
  // Not covered, or no coverage at all (the real run): blocked.
  await assert.rejects(
    preflightDeleteDataStream('Selected', covered.clients, {
      ...options,
      covered: async () => false,
    }),
    (error) => error.code === 'STREAM_DELETE_DEPENDENCIES_BLOCKED',
  );
  await assert.rejects(
    preflightDeleteDataStream('Selected', covered.clients, options),
    (error) => error.code === 'STREAM_DELETE_DEPENDENCIES_BLOCKED',
  );
  const real = await executeDeleteDataStream('Selected', covered.clients, {
    ...options,
    covered: async () => true,
  });
  assert.equal(real.outcome, 'blocked');
  assert.equal(real.diagnostics[0].code, 'STREAM_DELETE_DEPENDENCIES_BLOCKED');
  assert.equal(covered.writes(), 0);
});

/**
 * One full org mapping from the stream's landing DLO to Target__dlm.
 * @param {string} developerName Org mapping name.
 * @returns {object} Native mapping.
 */
const landingMapping = (developerName) => ({
  developerName,
  sourceEntityDeveloperName: 'Linked__dll',
  targetEntityDeveloperName: 'Target__dlm',
  status: 'ACTIVE',
  fieldMappings: [
    {
      sourceFieldDeveloperName: 'ProbeId__c',
      targetFieldDeveloperName: 'Id__c',
      developerName: 'observed_Id',
    },
  ],
});

for (const [selection, expected] of [
  [['dmo:Target__dlm'], 'planned-dependencies'],
  [['mapping:M_1'], 'planned-dependencies'],
  [['mapping:M_1', 'dmo:Target__dlm'], 'planned-dependencies'],
  [[], 'blocked'],
  [['dmo:Other__dlm'], 'blocked'],
  [['mapping:M_2'], 'blocked'],
])
  test(`stream delete preview with selected ${selection.join(' ') || 'nothing else'} is ${expected}`, async () => {
    const native = lifecycle({
      dloDependents: [
        { componentType: 'DataModelObject', id: '0dm000000000001AAA', name: 'Target__dlm' },
      ],
    });
    const fixture = invocation({
      preview: true,
      'delete-dlo': true,
      metadata: [...selection, 'data-stream:Selected'],
    });
    fixture.command.createDataStreamClients = async () => native.clients;
    fixture.command.preflightDeleteDataStream = preflightDeleteDataStream;
    fixture.command.createDmoNativeDeleteClient = () => ({});
    fixture.command.retrieveDmo = async (name) => ({
      identity: { apiName: name, dataSpace: 'default' },
    });
    fixture.command.createMappingSender = () => ({});
    fixture.command.createMappingClient = () => ({
      get: async (name) => landingMapping(name),
      // Between the landing DLO and Target__dlm there is exactly the mapping M_1.
      list: async () => ({ objectSourceTargetMaps: [landingMapping('M_1')] }),
    });
    fixture.command.preflightDeleteMapping = async () => {};
    const { result, code } = await run(fixture.command);
    const stream = result.result.items.find((item) => item.family === 'data-stream');
    assert.equal(stream.outcome, expected, JSON.stringify(result));
    assert.equal(stream.mutation, 'not-attempted');
    assert.equal(native.writes(), 0);
    if (expected === 'blocked') {
      assert.equal(result.status, 'blocked');
      assert.equal(code, 1);
      assert.ok(
        result.diagnostics.errors.some(
          (error) => error.code === 'STREAM_DELETE_DEPENDENCIES_BLOCKED',
        ),
      );
    } else {
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(code, 0);
      assert.equal(stream.diagnostics[0].code, 'DEPENDENCIES_PLANNED');
      assert.match(stream.diagnostics[0].message, /DataModelObject Target__dlm/u);
    }
  });
test('a stream already gone pairs no selected DLO: the DLO is checked on its own', async () => {
  const native = lifecycle({ absent: new DataStreamHttpError('REQUEST_FAILED', 404) });
  const fixture = invocation({
    preview: true,
    metadata: ['dlo:Linked__dll', 'data-stream:Selected'],
  });
  fixture.command.createDataStreamClients = async () => native.clients;
  fixture.command.preflightDeleteDataStream = preflightDeleteDataStream;
  fixture.command.createDloNativeDeleteClient = () => ({
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  fixture.command.retrieveDlo = async (name) => ({
    identity: { apiName: name, dataSpace: 'default' },
  });
  const { result } = await run(fixture.command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.removedWith]),
    [
      ['dlo', 'delete', undefined],
      ['data-stream', 'unchanged', undefined],
    ],
  );
});

/**
 * A stream delete seam that records the data space it was given.
 * @param {string[]} spaces Receives each data space.
 * @param {string} outcome Reported outcome.
 * @returns {Function} Seam.
 */
const recordSpace = (spaces, outcome) => async (name, _clients, options) => {
  spaces.push(options.dataSpace);
  await options.verifyInput();
  return {
    outcome,
    mutation: outcome === 'delete' ? 'not-attempted' : 'confirmed-deleted',
    deleteDlo: options.deleteDlo,
    targetApiName: name,
    targetDloName: 'Linked__dll',
    diagnostics: [],
  };
};

test('a stream is deleted in another data space, which reaches preview and delete', async () => {
  for (const preview of [true, false]) {
    const fixture = invocation({ dataspace: 'dataspace2', preview });
    const spaces = [];
    fixture.command.preflightDeleteDataStream = recordSpace(spaces, 'delete');
    fixture.command.executeDeleteDataStream = recordSpace(spaces, 'deleted');
    const { result } = await run(fixture.command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(spaces, ['dataspace2']);
    assert.equal(result.result.scope.dataSpace, 'dataspace2');
    assert.deepEqual(result.result.items[0].identity, {
      apiName: 'Selected',
      dataSpace: 'dataspace2',
    });
  }
});

test('a --delete-dlo refusal for a DLO of other data spaces is named on the item and the command', async () => {
  const refusal = {
    code: 'DLO_DELETE_OTHER_DATASPACES',
    message:
      'The landing DLO Linked__dll of Selected does not belong to the data space default alone.',
    retryable: false,
  };
  for (const preview of [false, true]) {
    const fixture = invocation({ 'delete-dlo': true, preview });
    fixture.command.executeDeleteDataStream = async () => ({
      outcome: 'blocked',
      mutation: 'not-attempted',
      diagnostics: [refusal],
    });
    fixture.command.preflightDeleteDataStream = async () => {
      throw new DataStreamError('DLO_DELETE_OTHER_DATASPACES');
    };
    const { result, code } = await run(fixture.command);
    assert.equal(code, 1);
    assert.equal(result.status, 'blocked');
    const [item] = result.result.items;
    assert.equal(item.family, 'data-stream');
    assert.equal(item.outcome, 'blocked');
    assert.equal(item.diagnostics[0].code, 'DLO_DELETE_OTHER_DATASPACES');
    assert.equal(result.diagnostics.errors[0].code, 'DLO_DELETE_OTHER_DATASPACES');
    if (preview) {
      assert.match(item.diagnostics[0].message, /Preview stopped; nothing was deleted/u);
    } else {
      assert.equal(item.diagnostics[0].message, refusal.message);
    }
  }
});
