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
    command.createDmoClient =
    command.createMappingClient =
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
            ['68.0', '68.0', '67.0'],
          );
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
              `${preview ? 'Planned delete' : 'Deleted'}: data-stream:Selected; mutation: ${preview ? 'not-attempted' : 'confirmed-deleted'}.`,
            ),
          );
      });

for (const overrides of [
  { metadata: ['data-stream'] },
  { metadata: ['data-stream:*'] },
  { metadata: ['data-stream:../Other'] },
  { metadata: ['data-stream:Selected', 'dlo:Other__dll'] },
  { metadata: ['dlo:Other__dll'], 'delete-dlo': true },
  { dataspace: 'Other' },
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
    facade: { read: async () => assert.fail('No dependency read after failed exact target') },
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
    facade: {
      read: async (operation) => {
        if (operation === 'd360_connection_list')
          return { connections: [{ name: 'Connection', id: cid, connectorType: 'IngestApi' }] };
        if (operation === 'd360_connection_get')
          return { name: 'Connection', id: cid, connectorType: 'IngestApi', status: 'CONNECTED' };
        if (operation === 'd360_connection_schema_get')
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
        if (operation === 'd360_datastream_dependencies_list')
          return { dependencies: [], totalSize: 0 };
        if (operation === 'd360_dlo_dependencies_list')
          return writes
            ? { dependencies: [], totalSize: 0 }
            : {
                dependencies: [
                  {
                    componentType: 'DataStream',
                    id: controls.wrongOwner ? '1ds000000000002AAA' : sid,
                    name: stream.label,
                  },
                ],
                totalSize: 1,
              };
        assert.fail('Unexpected facade operation');
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
