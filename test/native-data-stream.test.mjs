import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import { PassThrough } from 'node:stream';
import {
  createDataStreamClient,
  createDataStreamReferenceReader,
  DataStreamHttpError,
} from '../lib/transport/data-stream-rest.js';
import { ConnectClient, ConnectError } from '../lib/transport/connect-client.js';
import { dataStreamApiVersion } from '../lib/transport/api-version.js';
import {
  resolveDataStreamBinding,
  retrieveNativeDataStream,
  preflightNativeDataStreamCreate,
  createNativeDataStream,
  preflightNativeDataStreamUpdate,
  updateNativeDataStream,
  preflightNativeDataStreamDelete,
  deleteNativeDataStream,
} from '../lib/services/native-data-stream.js';

import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

test('binding drift explains event availability without exposing connection IDs', async () => {
  const { clients, schemas } = reads();
  schemas.schemas[0].availabilityStatus = 'Available';
  await assert.rejects(resolveDataStreamBinding(selection, clients), (error) => {
    assert.equal(error.code, 'STREAM_BINDING_DRIFT');
    const message = operationDiagnostic(error, 'No write attempted.');
    assert.match(
      message,
      /existing stream event availability.*SourceGeneratedName.*event.availabilityStatus: expected "In Use"; observed "Available"/u,
    );
    assert.ok(!message.includes(connectionId));
    return true;
  });
});

const endpoint = '/services/data/v68.0/ssot/data-streams';
const connectionId = '1WM000000000001AAA';
const streamId = '1ds000000000001AAA';
const dloId = '1dl000000000001AAA';
const connection = {
  name: 'SyntheticConnection',
  id: connectionId,
  connectorType: 'IngestApi',
  status: 'CONNECTED',
};
const fields = ['ProbeId', 'ProbeValue'].map((name) => ({ name, label: name, dataType: 'Text' }));
const stream = {
  name: 'GeneratedStream',
  recordId: streamId,
  label: 'Generated label',
  dataSource: connection.name,
  dataStreamType: 'INGESTAPI',
  connectorInfo: { connectorType: 'IngestApi' },
  status: 'PROCESSING',
  refreshConfig: { refreshMode: 'UPSERT' },
  sourceFields: fields.map(({ name }) => ({ name, datatype: 'Text' })),
  mappings: [
    { sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' },
    { sourceFieldName: 'ProbeValue', targetFieldName: 'ProbeValue' },
    { formula: '&quot;SyntheticConnection&quot;', targetFieldName: 'DataSource' },
    { formula: '&quot;GeneratedStream&quot;', targetFieldName: 'DataSourceObject' },
    { formula: 'ProbeValue', targetFieldName: 'AddedValue' },
  ],
  dataLakeObjectInfo: {
    name: 'ActualDlo__dll',
    label: 'Actual DLO',
    category: 'Other',
    dataSpaceInfo: [{ name: 'default' }],
    fields: [
      ...fields.map((field) => ({ ...field, isPrimaryKey: field.name === 'ProbeId' })),
      ...['KQ_ProbeId', 'DataSource', 'DataSourceObject', 'AddedValue'].map((name) => ({
        name,
        label: name,
        dataType: 'Text',
        isPrimaryKey: false,
      })),
    ],
  },
};
const authored = {
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'Proposed', dataSpace: 'default' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: connection.name,
    event: 'ProbeEvent',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Proposed',
    newDlo: {
      name: 'Proposed__dll',
      label: 'Proposed',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
};
const selection = {
  apiName: 'SourceGeneratedName',
  connectionName: connection.name,
  event: 'ProbeEvent',
  primaryKey: 'ProbeId',
  dataSpace: 'default',
};

/**
 * Route the native connection/dependency reader through one replaceable synthetic dispatcher.
 * @param {object} holder Object whose `reference.read(operation, identity)` answers each read.
 * @returns {object} Native `connections` and `dependencies` readers.
 */
function nativeReferences(holder) {
  const read = (...arguments_) => holder.reference.read(...arguments_);
  return {
    connections: {
      list: async () => read('connections.list'),
      get: async (id) => read('connections.get', id),
      schema: async (id) => read('connections.schema', id),
    },
    dependencies: {
      stream: async (identity) => read('dependencies.stream', identity),
      dlo: async (identity) => read('dependencies.dlo', identity),
    },
  };
}

/**
 * Build independent synthetic read boundaries without real org calls.
 * @param {object} options Fixture overrides.
 * @returns {object} Mutable synthetic observations and clients.
 */
function reads(options = {}) {
  const target = structuredClone(options.stream ?? stream);
  const schemas = {
    schemas: [
      {
        name: 'ProbeEvent',
        schemaType: 'IngestApi',
        availabilityStatus: options.absent ? 'Available' : 'In Use',
        fields: structuredClone(fields),
      },
    ],
  };
  const calls = [];
  const clients = {
    streams: {
      list: async (name) => {
        assert.equal(name, connection.name);
        return options.absent ? [] : [structuredClone(target)];
      },
      get: async (name) => {
        calls.push(name);
        if (name === target.name && !options.absent) return structuredClone(target);
        throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
      },
    },
    reference: {
      read: async (operation, identity) => {
        calls.push(operation);
        if (operation === 'connections.list') return { connections: [structuredClone(connection)] };
        assert.equal(identity, connectionId);
        if (operation === 'connections.get') return structuredClone(connection);
        if (operation === 'connections.schema') return structuredClone(schemas);
        assert.fail('Unexpected native reference read');
      },
    },
    dlo: {
      get: async (name) => {
        assert.equal(name, target.dataLakeObjectInfo.name);
        return {
          dataLakeObjects: [
            {
              ...structuredClone(target.dataLakeObjectInfo),
              id: dloId,
              fields: target.dataLakeObjectInfo.fields.map((field) => ({
                ...field,
                name: `${field.name}__c`,
              })),
            },
          ],
        };
      },
    },
  };
  Object.assign(clients, nativeReferences(clients));
  return { clients, target, schemas, calls };
}

test('native GET admits exact Salesforce record IDs separately without widening name selectors', async () => {
  const calls = [];
  const client = createDataStreamClient('synthetic', {
    get: async (url) => {
      calls.push(url);
      return stream;
    },
  });
  for (const identity of ['GeneratedStream', streamId, streamId.slice(0, 15)])
    await client.get(identity);
  assert.deepEqual(
    calls,
    ['GeneratedStream', streamId, streamId.slice(0, 15)].map(
      (identity) => `${endpoint}/${identity}?includeMappings=true`,
    ),
  );
  for (const identity of [
    '1ds00000000001',
    '1ds0000000000010',
    `${streamId}X`,
    '../GeneratedStream',
    `${streamId}?x=1`,
    '1InvalidName',
    'Generated/Stream',
  ]) {
    await assert.rejects(client.get(identity), { code: 'INVALID_STREAM_NAME' });
    await assert.rejects(client.list(identity), { code: 'INVALID_STREAM_CONNECTION' });
  }
  await assert.rejects(client.list(streamId), { code: 'INVALID_STREAM_CONNECTION' });
  assert.equal(calls.length, 3);
});

/**
 * Compose lifecycle fixtures with the production native transport, including real request receipts.
 * @param {object} scenario Independent lifecycle boundaries.
 * @param {object} document Portable mutation intent.
 * @returns {string[]} Observed native GET paths.
 */
function useProductionTransport(scenario, document) {
  const original = scenario.clients.streams;
  const calls = [];
  scenario.clients.streams = createDataStreamClient(
    'synthetic',
    {
      get: async (url) => {
        calls.push(url);
        const parsed = new URL(url, 'https://synthetic.invalid');
        if (parsed.pathname === endpoint) {
          const entries = await original.list(parsed.searchParams.get('connectionName'));
          return {
            currentPageUrl: `${endpoint}?limit=200&offset=1`,
            totalSize: entries.length,
            dataStreams: entries,
          };
        }
        try {
          return await original.get(parsed.pathname.slice(endpoint.length + 1));
        } catch (error) {
          if (error instanceof DataStreamHttpError)
            throw new ConnectError('REQUEST_FAILED', error.status);
          throw error;
        }
      },
    },
    '68.0',
    async (arguments_) => {
      let result;
      let status;
      if (arguments_.includes('--file')) {
        const request = JSON.parse(
          await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8'),
        );
        const parsed = new URL(request.url, 'https://synthetic.invalid');
        await original.delete(
          parsed.pathname.slice(endpoint.length + 1),
          parsed.searchParams.get('shouldDeleteDataLakeObject') === 'true',
        );
        status = 204;
      } else if (arguments_[arguments_.indexOf('--method') + 1] === 'POST') {
        result = await original.create(document);
        status = 201;
      } else {
        result = await original.update(arguments_[3].slice(endpoint.length + 1), {
          ...document,
          spec: {
            ...document.spec,
            additiveFieldMappings: document.spec.additiveFieldMappings.slice(-1),
          },
        });
        status = 200;
      }
      return {
        exitCode: 0,
        stdout: `HTTP/1.1 ${status} Synthetic\r\n\r\n${result === undefined ? '' : JSON.stringify(result)}`,
        stderr: '',
      };
    },
  );
  return calls;
}

test('production transport composes with create, update and delete persisted-ID lifecycle reads', async () => {
  const create = createLifecycle();
  const createdCalls = useProductionTransport(create, authored);
  const created = await createNativeDataStream(authored, create.clients, create.options);
  assert.equal(created.operation, 'create');
  const update = await updateLifecycle();
  const updatedCalls = useProductionTransport(update, update.desired);
  const updated = await updateNativeDataStream(update.desired, update.clients, update.options);
  assert.equal(updated.operation, 'update');
  const deletion = await deleteLifecycle();
  const deletedCalls = useProductionTransport(deletion);
  await deleteNativeDataStream('GeneratedStream', deletion.clients, deletion.options);
  for (const calls of [createdCalls, updatedCalls, deletedCalls])
    assert.ok(calls.includes(`${endpoint}/${streamId}?includeMappings=true`));
  assert.equal(create.counts().writes, 1);
  assert.equal(update.counts().writes, 1);
  assert.equal(deletion.state.writes, 1);
});

/**
 * Reproduce the five native list/detail mappings and protected response properties observed live.
 * @returns {object} Independent production-shaped synthetic read boundaries.
 */
function reorderedMappingReads() {
  const scenario = reads();
  scenario.schemas.schemas[0].fields.push({
    name: 'ProbeExtra',
    label: 'ProbeExtra',
    dataType: 'Text',
  });
  const target = scenario.target;
  target.status = 'ACTIVE';
  target.lastRunStatus = 'NONE';
  target.advancedAttributes = {};
  target.capabilities = {};
  target.dataAccessMode = 'INGEST';
  target.isEnabled = true;
  target.refreshConfig = {
    frequency: { hours: [], refreshDayOfMonth: [] },
    hasHeaders: false,
    isAccelerationEnabled: false,
    refreshMode: 'UPSERT',
    shouldFetchImmediately: false,
    shouldTreatMissingFilesAsFailures: false,
  };
  target.sourceFields = ['ProbeExtra', 'ProbeId', 'ProbeValue'].map((name) => ({
    name,
    datatype: 'Text',
  }));
  target.mappings = [
    { sourceFieldName: 'ProbeValue', targetFieldName: 'ProbeValue' },
    { formula: '&quot;SyntheticConnection&quot;', targetFieldName: 'DataSource' },
    { sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' },
    { sourceFieldName: 'ProbeExtra', targetFieldName: 'ProbeExtra' },
    { formula: '&quot;GeneratedStream&quot;', targetFieldName: 'DataSourceObject' },
  ];
  target.dataLakeObjectInfo.fields = target.dataLakeObjectInfo.fields.filter(
    (field) => field.name !== 'AddedValue',
  );
  target.dataLakeObjectInfo.fields.push({
    name: 'ProbeExtra',
    label: 'ProbeExtra',
    dataType: 'Text',
    isPrimaryKey: false,
  });
  target.dataLakeObjectInfo.dataSpaceInfo = [{ name: 'default', label: 'default' }];
  target.dataLakeObjectInfo.dataLakeFieldInfoRepresentation = structuredClone(
    target.dataLakeObjectInfo.fields,
  );
  const detail = structuredClone(target);
  detail.mappings = [3, 2, 0, 1, 4].map((index) => detail.mappings[index]);
  scenario.clients.streams.get = async (name) => {
    assert.ok([target.name, streamId].includes(name));
    return structuredClone(detail);
  };
  useProductionTransport(scenario);
  return { ...scenario, detail };
}

test('production binding and retrieve accept only the observed five-mapping permutation', async () => {
  const scenario = reorderedMappingReads();
  const selected = { ...selection, apiName: scenario.target.name };
  const before = structuredClone(scenario.target);
  const bound = await resolveDataStreamBinding(selected, scenario.clients);
  assert.deepEqual(bound.target, before);
  const document = await retrieveNativeDataStream(scenario.target.name, scenario.clients);
  assert.deepEqual(document.observed.mappings, scenario.detail.mappings);
  assert.deepEqual(document.spec.additiveFieldMappings, []);
  assert.deepEqual(scenario.target, before);
});

for (const [label, mutate] of Object.entries({
  changed: (value) => {
    value.mappings[0].sourceFieldName = 'Changed';
  },
  missing: (value) => {
    value.mappings.pop();
  },
  extra: (value) => {
    value.mappings.push({ sourceFieldName: 'Extra', targetFieldName: 'Extra' });
  },
  duplicate: (value) => {
    value.mappings[0] = structuredClone(value.mappings[1]);
  },
  duplicateExtra: (value) => {
    value.mappings.push(structuredClone(value.mappings[0]));
  },
  unknownMappingProperty: (value) => {
    value.mappings[0].unknown = true;
  },
  identity: (value) => {
    value.recordId = '1ds000000000002AAA';
  },
  config: (value) => {
    value.refreshConfig.shouldFetchImmediately = true;
  },
  unknownConfig: (value) => {
    value.unknown = true;
  },
  otherArrayOrder: (value) => {
    value.sourceFields.reverse();
  },
})) {
  test(`production binding rejects ${label} drift despite reordered mappings`, async () => {
    const scenario = reorderedMappingReads();
    mutate(scenario.detail);
    await assert.rejects(
      resolveDataStreamBinding({ ...selection, apiName: scenario.target.name }, scenario.clients),
      { code: label === 'identity' ? 'STREAM_TARGET_MISMATCH' : 'STREAM_BINDING_DRIFT' },
    );
  });
}

/**
 * Vary only native mapping order on every independent synthetic lifecycle read.
 * @param {object} scenario Instrumented lifecycle fixture.
 */
function permuteLifecycleMappings(scenario) {
  let count = 0;
  const streams = scenario.clients.streams;
  for (const method of ['list', 'get']) {
    const original = streams[method];
    streams[method] = async (...arguments_) => {
      const result = structuredClone(await original(...arguments_));
      for (const value of Array.isArray(result) ? result : [result]) {
        if (value.mappings.length > 0) {
          const offset = count++ % value.mappings.length;
          value.mappings = [...value.mappings.slice(offset), ...value.mappings.slice(0, offset)];
        }
      }
      return result;
    };
  }
}

test('production create/update/noop/delete compare native mapping multisets across all guards', async () => {
  const create = createLifecycle();
  permuteLifecycleMappings(create);
  useProductionTransport(create, authored);
  const created = await createNativeDataStream(authored, create.clients, create.options);
  assert.equal(created.operation, 'create');
  const update = await updateLifecycle();
  permuteLifecycleMappings(update);
  useProductionTransport(update, update.desired);
  const updated = await updateNativeDataStream(update.desired, update.clients, update.options);
  assert.equal(updated.operation, 'update');
  const noop = await updateNativeDataStream(update.desired, update.clients, update.options);
  assert.equal(noop.operation, 'noop');
  const deletion = await deleteLifecycle();
  permuteLifecycleMappings(deletion);
  useProductionTransport(deletion);
  const deleted = await deleteNativeDataStream(
    'GeneratedStream',
    deletion.clients,
    deletion.options,
  );
  assert.equal(deleted.operation, 'delete');
  assert.equal(create.counts().writes, 1);
  assert.equal(update.counts().writes, 1);
  assert.equal(deletion.state.writes, 1);
});

/**
 * Add a second existing projection and alternate order between guarded preflight snapshots.
 * @param {object} scenario Existing update or delete lifecycle fixture.
 * @param {boolean} changed Whether the fresh snapshot also changes protected mapping content.
 */
function alternateDerivedAdditions(scenario, changed = false) {
  const mapping = {
    sourceFieldLabel: 'ProbeValue',
    targetFieldName: 'ZZExisting',
    targetFieldReturntype: 'Text',
  };
  scenario.target.mappings.push({ formula: 'ProbeValue', targetFieldName: 'ZZExisting' });
  const field = { name: 'ZZExisting', label: 'ZZExisting', dataType: 'Text', isPrimaryKey: false };
  scenario.target.dataLakeObjectInfo.fields.push(field);
  if (scenario.parent) scenario.parent.fields.push({ ...field, name: 'ZZExisting__c' });
  if (scenario.desired) scenario.desired.spec.additiveFieldMappings.unshift(mapping);
  let reverse = false;
  const verify = scenario.options.verifyInput;
  scenario.options.verifyInput = async () => {
    await verify();
    reverse = !reverse;
    if (changed && !reverse) scenario.target.mappings.at(-1).unknown = true;
  };
  for (const method of ['list', 'get']) {
    const original = scenario.clients.streams[method];
    scenario.clients.streams[method] = async (...arguments_) => {
      const result = structuredClone(await original(...arguments_));
      if (reverse)
        for (const value of Array.isArray(result) ? result : [result]) value.mappings.reverse();
      return result;
    };
  }
}

for (const operation of ['noop', 'update']) {
  test(`two existing derived additions tolerate alternating native order during ${operation}`, async () => {
    const scenario = await updateLifecycle();
    alternateDerivedAdditions(scenario);
    if (operation === 'noop') scenario.desired.spec.additiveFieldMappings.pop();
    const authoredOrder = structuredClone(scenario.desired);
    useProductionTransport(scenario, scenario.desired);
    const preview = await preflightNativeDataStreamUpdate(scenario.desired, scenario.clients);
    assert.deepEqual(
      preview.document.spec.additiveFieldMappings,
      authoredOrder.spec.additiveFieldMappings,
    );
    const result = await updateNativeDataStream(
      scenario.desired,
      scenario.clients,
      scenario.options,
    );
    assert.equal(result.operation, operation);
    assert.equal(scenario.counts().writes, operation === 'noop' ? 0 : 1);
    assert.deepEqual(scenario.desired, authoredOrder);
    assert.deepEqual(
      result.document.spec.additiveFieldMappings.map((mapping) => mapping.targetFieldName),
      operation === 'noop'
        ? ['AddedValue', 'ZZExisting']
        : ['AddedValue', 'NextValue', 'ZZExisting'],
    );
  });
}

test('two existing derived additions tolerate alternating native order during preserve-DLO delete', async () => {
  const scenario = await deleteLifecycle();
  alternateDerivedAdditions(scenario);
  useProductionTransport(scenario);
  const result = await deleteNativeDataStream(
    'GeneratedStream',
    scenario.clients,
    scenario.options,
  );
  assert.equal(result.operation, 'delete');
  assert.equal(scenario.state.writes, 1);
});

for (const operation of ['noop', 'update', 'delete']) {
  test(`two existing derived additions still reject changed content during ${operation}`, async () => {
    const scenario = operation === 'delete' ? await deleteLifecycle() : await updateLifecycle();
    alternateDerivedAdditions(scenario, true);
    if (operation === 'noop') scenario.desired.spec.additiveFieldMappings.pop();
    useProductionTransport(scenario, scenario.desired);
    await assert.rejects(
      operation === 'delete'
        ? deleteNativeDataStream('GeneratedStream', scenario.clients, scenario.options)
        : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
      { code: 'INVALID_STREAM_DOCUMENT' },
    );
    assert.equal(operation === 'delete' ? scenario.state.writes : scenario.counts().writes, 0);
  });
}

test('stream admission remains exactly auto/API68, independent of lower campaign', () => {
  assert.equal(dataStreamApiVersion(), '68.0');
  assert.equal(dataStreamApiVersion('68.0'), '68.0');
  for (const pin of ['60.0', '65.0', '66.0', '67.0', '69.0', 'latest', '68', ''])
    assert.throws(() => dataStreamApiVersion(pin));
});

test('native inventory accepts observed offset1 echo without following omitted filters', async () => {
  const calls = [];
  const client = createDataStreamClient('synthetic', {
    get: async (url) => {
      calls.push(url);
      return {
        currentPageUrl: `${endpoint}?limit=200&offset=1`,
        totalSize: 1,
        dataStreams: [stream],
      };
    },
  });
  const result = await client.list(connection.name);
  assert.deepEqual(result, [stream]);
  result[0].name = 'Changed';
  assert.equal(stream.name, 'GeneratedStream');
  assert.deepEqual(calls, [
    `${endpoint}?connectionName=SyntheticConnection&includeMappings=true&limit=200&offset=0`,
  ]);
});

test('inventory continuation preserves resource, version and filters; duplicates/loops/unknown totals block', async () => {
  const second = { ...stream, name: 'Second', recordId: '1ds000000000002AAA' };
  const next = `${endpoint}?connectionName=SyntheticConnection&includeMappings=true&limit=200&offset=200`;
  let calls = 0;
  const pages = [
    {
      currentPageUrl: `${endpoint}?limit=200&offset=1`,
      nextPageUrl: next,
      totalSize: 2,
      dataStreams: [stream],
    },
    { currentPageUrl: `${endpoint}?limit=200&offset=200`, totalSize: 2, dataStreams: [second] },
  ];
  const client = createDataStreamClient('synthetic', {
    get: async () => structuredClone(pages[calls++]),
  });
  const inventory = await client.list(connection.name);
  assert.equal(inventory.length, 2);
  assert.equal(calls, 2);
  for (const nextPageUrl of [
    next.replace('v68.0', 'v67.0'),
    next.replace('SyntheticConnection', 'Other'),
    next.replace('data-streams', 'data-lake-objects'),
    `https://hostile.test${next}`,
    next.replace('offset=200', 'offset=0'),
    `${next}&offset=201`,
    next.replace('&includeMappings=true', ''),
    next.replace('offset=200', 'offset=400'),
  ]) {
    let count = 0;
    await assert.rejects(
      createDataStreamClient('synthetic', {
        get: async () => {
          count++;
          return { ...pages[0], nextPageUrl };
        },
      }).list(connection.name),
    );
    assert.equal(count, 1);
  }
  for (const page of [
    { ...pages[0], totalSize: 0 },
    { ...pages[0], totalSize: undefined },
    { ...pages[0], dataStreams: [] },
    { ...pages[0], dataStreams: [stream, stream] },
    { ...pages[0], currentPageUrl: `${endpoint}?limit=200&offset=2` },
    { ...pages[0], dataStreams: [{ ...stream, dataSource: 'Other' }] },
  ])
    await assert.rejects(
      createDataStreamClient('synthetic', { get: async () => page }).list(connection.name),
    );
});

test('native mutations use exact builders, target record IDs and explicit boolean with no DELETE body', async () => {
  const requests = [];
  const runner = async (arguments_) => {
    assert.equal(arguments_.includes('--include'), true);
    assert.equal(arguments_.includes('--json'), false);
    const request = arguments_.includes('--file')
      ? JSON.parse(await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8'))
      : {
          url: arguments_[3],
          method: arguments_[arguments_.indexOf('--method') + 1],
          body: JSON.parse(
            await readFile(arguments_[arguments_.indexOf('--body') + 1].slice(1), 'utf8'),
          ),
        };
    requests.push(request);
    const status = request.method === 'POST' ? 201 : request.method === 'PATCH' ? 200 : 204;
    return {
      exitCode: 0,
      stdout: `HTTP/1.1 ${status} Synthetic\nContent-Type: application/json\n${status === 204 ? '' : '{"name":"UntrustedEcho"}'}`,
    };
  };
  const client = createDataStreamClient(
    'synthetic',
    { get: async () => assert.fail('no GET') },
    '68.0',
    runner,
  );
  await client.create(authored);
  const patch = structuredClone(authored);
  patch.spec.additiveFieldMappings = [
    { sourceFieldLabel: 'ProbeValue', targetFieldName: 'Added', targetFieldReturntype: 'Text' },
  ];
  await client.update(streamId, patch);
  await client.delete(streamId, false);
  await client.delete(streamId, true);
  assert.equal(requests[0].body.dataLakeObjectInfo.name, 'Proposed__dll');
  assert.deepEqual(requests[1].body, {
    datastreamType: 'INGEST_API',
    mappings: patch.spec.additiveFieldMappings,
  });
  assert.equal(requests[2].url, `${endpoint}/${streamId}?shouldDeleteDataLakeObject=false`);
  assert.equal(requests[3].url, `${endpoint}/${streamId}?shouldDeleteDataLakeObject=true`);
  assert.deepEqual(requests[2].body, { mode: 'raw' });
  assert.deepEqual(requests[3].body, { mode: 'raw' });
  await assert.rejects(client.delete('DefinitionId', false));
  await assert.rejects(client.delete(streamId, undefined));
  assert.equal(requests.length, 4);
});

test('HTTP status is not CLI exit status; malformed/success echoes never imply settlement or absence', async () => {
  for (const [stdout, exitCode, expectedStatus] of [
    ['{"status":404}', 0, undefined],
    ['HTTP/1.1 404 Not Found\n[]', 0, 404],
    ['HTTP/1.1 201 Created\n{}', 1, 201],
    ['HTTP/1.1 200 OK\n{}', 0, 200],
    ['HTTP/1.1 201 Created\n[]', 0, 201],
    ['HTTP/1.1 201 Created\nsecret', 0, 201],
    ['HTTP/1.1 302 Redirect\nLocation: https://hostile.test\n', 0, 302],
  ]) {
    let calls = 0;
    const client = createDataStreamClient(
      'synthetic',
      { get: async () => {} },
      '68.0',
      async () => {
        calls++;
        return { stdout, exitCode };
      },
    );
    await assert.rejects(client.create(authored), (error) => {
      assert.equal(error.status, expectedStatus);
      assert.equal(String(error).includes('secret'), false);
      return true;
    });
    assert.equal(calls, 1);
  }
  const client = createDataStreamClient('synthetic', {
    get: async () => {
      throw new ConnectError('REQUEST_FAILED', 404);
    },
  });
  await assert.rejects(client.get('GeneratedStream'), { status: 404 });
});

test('binding uses independent connection/sole event and actual generated identity, never source-name404 create', async () => {
  const { clients, calls } = reads();
  const binding = await resolveDataStreamBinding(selection, clients);
  assert.equal(binding.target.name, 'GeneratedStream');
  assert.equal(binding.target.recordId, streamId);
  assert.equal(binding.event, 'ProbeEvent');
  assert.ok(calls.includes('GeneratedStream'));
  const absent = reads({ absent: true });
  const result = await resolveDataStreamBinding(selection, absent.clients);
  assert.equal(result.target, undefined);
  assert.equal(result.availability, 'Available');
});

/**
 * Reproduce the observed native API68 connection-list envelope.
 * @returns {object} Complete first-page response with ten independently named connections.
 */
function connectionPage() {
  return {
    connections: [
      structuredClone(connection),
      ...Array.from({ length: 9 }, (_, index) => ({
        ...connection,
        name: `OtherConnection${index}`,
        id: `1WM${String(index + 2).padStart(12, '0')}AAA`,
      })),
    ],
    currentPageUrl:
      '/services/data/v68.0/ssot/connections?connectorType=IngestApi&limit=200&offset=0',
    totalSize: 10,
  };
}

test('binding admits observed complete connection envelope and preserves independent exact identity reads', async () => {
  const fixture = reads();
  const original = fixture.clients.reference.read;
  fixture.clients.reference.read = async (operation, parameters) => {
    if (operation === 'connections.list') {
      assert.equal(parameters, undefined);
      return connectionPage();
    }
    return original(operation, parameters);
  };
  const result = await resolveDataStreamBinding(selection, fixture.clients);
  assert.equal(result.connectionId, connectionId);
  assert.equal(result.target.recordId, streamId);
  assert.deepEqual(fixture.calls, [
    'connections.get',
    'connections.schema',
    selection.apiName,
    'GeneratedStream',
  ]);
});

test('connection envelopes reject incomplete, malformed, unknown and ambiguous observations before further reads', async () => {
  const page = connectionPage();
  for (const listed of [
    { ...page, totalSize: 11 },
    { ...page, totalSize: 9 },
    { ...page, totalSize: '10' },
    { ...page, totalSize: -1 },
    { ...page, totalSize: 10.5 },
    { ...page, totalSize: Number.NaN },
    { connections: page.connections, totalSize: 10 },
    { connections: page.connections, currentPageUrl: page.currentPageUrl },
    // eslint-disable-next-line unicorn/no-null -- Exercise a literal malformed JSON response.
    { ...page, connections: null },
    { ...page, nextPageUrl: '/next' },
    // eslint-disable-next-line unicorn/no-null -- Even an empty unknown continuation key must fail closed.
    { ...page, nextPageUrl: null },
    { ...page, done: true },
    ...[
      page.currentPageUrl.replace('offset=0', 'offset=200'),
      page.currentPageUrl.replace('limit=200', 'limit=10'),
      page.currentPageUrl.replace('IngestApi', 'Other'),
      page.currentPageUrl.replace('v68.0', 'v67.0'),
      page.currentPageUrl.replace('connections?', 'data-streams?'),
      `https://hostile.test${page.currentPageUrl}`,
      `${page.currentPageUrl}&offset=0`,
      `${page.currentPageUrl}#fragment`,
      // eslint-disable-next-line unicorn/no-null -- Exercise a malformed JSON pagination echo.
      null,
    ].map((currentPageUrl) => ({ ...page, currentPageUrl })),
    { ...page, connections: Array.from({ length: 200 }, () => connection), totalSize: 200 },
    { connections: Array.from({ length: 200 }, () => connection) },
  ]) {
    const fixture = reads();
    fixture.clients.reference.read = async (operation) => {
      assert.equal(operation, 'connections.list');
      return listed;
    };
    await assert.rejects(resolveDataStreamBinding(selection, fixture.clients), {
      code: 'INCOMPLETE_CONNECTION_LIST',
    });
    assert.deepEqual(fixture.calls, []);
  }
  for (const connections of [
    [connection, connection],
    [connection, { ...connection, id: '1WM000000000002AAA', name: 'syntheticconnection' }],
    [connection, { ...connection, name: 'OtherConnection' }],
    [{ ...connection, name: 'syntheticconnection' }],
    [{ ...connection, connectorType: 'Other' }],
    [],
  ]) {
    const fixture = reads();
    fixture.clients.reference.read = async (operation) => {
      assert.equal(operation, 'connections.list');
      return { ...page, connections, totalSize: connections.length };
    };
    await assert.rejects(resolveDataStreamBinding(selection, fixture.clients), {
      code: 'AMBIGUOUS_STREAM_CONNECTION',
    });
    assert.deepEqual(fixture.calls, []);
  }
});

/**
 * Build a synthetic core Connection whose GETs answer from one route table (no refresh/replay).
 * @param {(url: URL) => {statusCode?: number, body: unknown}} answer Response per parsed URL.
 * @param {object[]} requests Sink receiving every wire request.
 * @returns {Connection} Synthetic owner Connection.
 */
function syntheticOwner(answer, requests) {
  const owner = Object.assign(Object.create(Connection.prototype), {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    version: '68.0',
    accessToken: 'synthetic-token',
    _propagators: [],
    logger: { getRawLogger: () => ({ debug() {} }) },
    _refreshDelegate: { refresh: () => assert.fail('no refresh') },
    _transport: {
      httpRequest: (request, options) => {
        requests.push(request);
        assert.equal(options.retry.maxRetries, 0);
        assert.equal(request.method, 'GET');
        const parsed = new URL(request.url);
        assert.equal(parsed.origin, owner.instanceUrl);
        assert.ok(!parsed.pathname.includes('/mcp/'));
        const { statusCode = 200, body } = answer(parsed);
        const pending = Promise.resolve({
          statusCode,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  return owner;
}

const ssot = '/services/data/v68.0/ssot';

test('production native API68 connection reads reach create preview with the observed envelope', async () => {
  const requests = [];
  const fixture = reads({ absent: true });
  // Native detail carries label/tenant endpoint beyond the admitted identity fields.
  const detail = {
    ...connection,
    label: 'Synthetic',
    tenantSpecificEndpoint: 'synthetic.c360a.salesforce.com',
  };
  const owner = syntheticOwner((parsed) => {
    const route = parsed.pathname + parsed.search;
    if (route === `${ssot}/connections?connectorType=IngestApi&limit=200&offset=0`)
      return { body: connectionPage() };
    if (route === `${ssot}/connections/${connectionId}`) {
      fixture.calls.push('connections.get');
      return { body: detail };
    }
    if (route === `${ssot}/connections/${connectionId}/schema`) {
      fixture.calls.push('connections.schema');
      return { body: structuredClone(fixture.schemas) };
    }
    if (parsed.pathname === endpoint)
      return {
        body: { currentPageUrl: `${endpoint}?limit=200&offset=1`, totalSize: 0, dataStreams: [] },
      };
    assert.equal(parsed.pathname, `${endpoint}/Proposed`);
    return { statusCode: 404, body: [{ errorCode: 'NOT_FOUND', message: 'Synthetic absence' }] };
  }, requests);
  const reader = new ConnectClient(owner, '68.0');
  Object.assign(fixture.clients, createDataStreamReferenceReader(reader, '68.0'));
  fixture.clients.streams = createDataStreamClient('synthetic', reader, '68.0', async () =>
    assert.fail('preview must not dispatch mutations'),
  );
  fixture.clients.dlo.get = async (name) => {
    fixture.calls.push(name);
    assert.equal(name, 'Proposed__dll');
    throw new ConnectError('REQUEST_FAILED', 404);
  };
  const plan = await preflightNativeDataStreamCreate(authored, fixture.clients);
  assert.equal(plan.operation, 'create');
  assert.deepEqual(fixture.calls, ['connections.get', 'connections.schema', 'Proposed__dll']);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(({ method }) => method === 'GET'));
});

test('failed, ambiguous and drifting binding reads fail closed without mutations', async () => {
  for (const status of [401, 403, 400, 500]) {
    const { clients } = reads();
    clients.streams.get = async () => {
      throw new DataStreamHttpError('STREAM_HTTP_ERROR', status);
    };
    await assert.rejects(resolveDataStreamBinding(selection, clients), { status });
  }
  for (const mutate of [
    (r) => r.schemas.schemas.push(structuredClone(r.schemas.schemas[0])),
    (r) => {
      r.schemas.schemas[0].availabilityStatus = 'Available';
    },
    (r) => {
      r.schemas.schemas[0].fields[0].dataType = 'Number';
    },
    (r) => {
      r.target.sourceFields[0].name = 'Changed';
    },
    (r) => {
      r.target.dataLakeObjectInfo.dataSpaceInfo = [{ name: 'Other' }];
    },
    (r) => {
      r.target.dataLakeObjectInfo.fields[0].isPrimaryKey = false;
    },
    (r) => {
      r.clients.streams.list = async () => [stream, stream];
    },
    (r) => {
      r.clients.streams.get = async () => ({
        ...stream,
        name: selection.apiName,
        recordId: '1ds000000000002AAA',
      });
    },
    (r) => {
      r.clients.reference.read = async () => ({ connections: [connection, connection] });
    },
  ]) {
    const r = reads();
    mutate(r);
    await assert.rejects(resolveDataStreamBinding(selection, r.clients));
  }
});

test('retrieval retains generated inventory, classifies only proven source Text additions, strips runtime IDs', async () => {
  const { clients } = reads();
  const result = await retrieveNativeDataStream('GeneratedStream', clients);
  assert.equal(result.identity.apiName, 'GeneratedStream');
  assert.equal(result.spec.newDlo.name, 'ActualDlo__dll');
  assert.equal(result.spec.label, 'Generated label');
  assert.equal(result.observed.dloFields.length, 6);
  assert.deepEqual(result.spec.additiveFieldMappings, [
    {
      sourceFieldLabel: 'ProbeValue',
      targetFieldName: 'AddedValue',
      targetFieldReturntype: 'Text',
    },
  ]);
  assert.equal(result.observed.mappings.length, 5);
  for (const id of [streamId, connectionId, dloId])
    assert.equal(JSON.stringify(result).includes(id), false);
  assert.ok(Object.isFrozen(result.observed.mappings));
  const broken = reads();
  broken.target.mappings.at(-1).formula = 'UPPER(ProbeValue)';
  await assert.rejects(retrieveNativeDataStream('GeneratedStream', broken.clients), {
    code: 'UNSUPPORTED_STREAM_PROJECTION',
  });
  const changedDlo = reads();
  changedDlo.clients.dlo.get = async () => ({
    dataLakeObjects: [{ ...stream.dataLakeObjectInfo, id: dloId, fields: [] }],
  });
  await assert.rejects(retrieveNativeDataStream('GeneratedStream', changedDlo.clients), {
    code: 'STREAM_DLO_DRIFT',
  });
});

for (const [family, collection] of [
  ['stream', 'data-streams'],
  ['dlo', 'data-lake-objects'],
])
  test(`native ${family} dependency reader admits only exact name or record ID routes`, async () => {
    const urls = [];
    const reader = createDataStreamReferenceReader({
      get: async (url) => {
        urls.push(url);
        return { dependencies: [], totalSize: 0 };
      },
    });
    const accepted = [
      'GeneratedStream',
      'ActualDlo__dll',
      'PublicIngestion1793211653953_ProbeRecord_E8A1BD6C',
      '1dsaj0000023rrR',
      '1dsaj0000023rrRAAQ',
      '1dlaj00000AexI9',
      '1dlaj00000AexI9AAJ',
    ];
    for (const identity of accepted)
      assert.deepEqual(await reader.dependencies[family](identity), {
        dependencies: [],
        totalSize: 0,
      });
    assert.deepEqual(
      urls,
      accepted.map((identity) => `${ssot}/${collection}/${identity}/dependencies`),
    );
    for (const identity of [
      '',
      '1dsaj0000023rr',
      '1dsaj0000023rrRA',
      '1dsaj0000023rrRAA',
      '1dsaj0000023rrRAAQx',
      '../Other',
      '/Other',
      'Other?cascade=true',
      'Other#fragment',
      'Other%2fescape',
      ' Other',
      'Other ',
      'Other\n',
      'Other-name',
      undefined,
      123,
    ])
      await assert.rejects(reader.dependencies[family](identity), { code: 'INVALID_REQUEST' });
    assert.equal(urls.length, accepted.length);
  });

test('native connection reader pins API68 routes, validates IDs and rejects error-shaped bodies', async () => {
  const urls = [];
  let body = { connections: [] };
  const reader = createDataStreamReferenceReader({
    get: async (url) => {
      urls.push(url);
      return body;
    },
  });
  await reader.connections.list();
  await reader.connections.get(connectionId);
  await reader.connections.schema(connectionId.slice(0, 15));
  assert.deepEqual(urls, [
    `${ssot}/connections?connectorType=IngestApi&limit=200&offset=0`,
    `${ssot}/connections/${connectionId}`,
    `${ssot}/connections/${connectionId.slice(0, 15)}/schema`,
  ]);
  for (const identity of ['', '1WM00000000000', `${connectionId}x`, '../x', 'Name', undefined]) {
    await assert.rejects(reader.connections.get(identity), { code: 'INVALID_REQUEST' });
    await assert.rejects(reader.connections.schema(identity), { code: 'INVALID_REQUEST' });
  }
  assert.equal(urls.length, 3);
  // eslint-disable-next-line unicorn/no-null -- Exercise a literal malformed JSON response.
  for (const malformed of [null, [], 'text', {}, { result: { connections: [] } }, { errors: [] }]) {
    body = malformed;
    await assert.rejects(reader.connections.list(), { code: 'REQUEST_FAILED' });
  }
  for (const version of ['67.0', '69.0', 'latest'])
    assert.throws(() => createDataStreamReferenceReader({ get: async () => ({}) }, version));
});

/**
 * Model independent pre/post-dispatch reads with generated names, never an echo-as-read shortcut.
 * @param {object} options Synthetic settlement controls.
 * @returns {object} Instrumented lifecycle clients and counters.
 */
function createLifecycle(options = {}) {
  const before = reads({ absent: true });
  const after = reads();
  after.target.status = options.processing ? 'PROCESSING' : 'ACTIVE';
  after.target.mappings.pop();
  after.target.dataLakeObjectInfo.fields.pop();
  after.target.dataLakeObjectInfo.label = authored.spec.newDlo.label;
  let dispatched = false;
  let writes = 0;
  let guards = 0;
  let clock = 0;
  let pauses = 0;
  const clients = {
    streams: {
      list: async (...arguments_) =>
        (dispatched ? after : before).clients.streams.list(...arguments_),
      get: async (name) => {
        if (dispatched && name === streamId) return structuredClone(after.target);
        return (dispatched ? after : before).clients.streams.get(name);
      },
      create: async (document) => {
        assert.deepEqual(document, authored);
        writes++;
        dispatched = true;
        return options.echo ?? { name: after.target.name, recordId: streamId.slice(0, 15) };
      },
      update: async () => assert.fail('No PATCH in create subchunk'),
    },
    reference: {
      read: async (...arguments_) =>
        (dispatched ? after : before).clients.reference.read(...arguments_),
    },
    dlo: {
      get: async (name) => {
        if (!dispatched) throw new ConnectError('REQUEST_FAILED', 404);
        const value = await after.clients.dlo.get(name);
        value.dataLakeObjects[0].status = options.processing ? 'PROCESSING' : 'ACTIVE';
        return value;
      },
    },
  };
  Object.assign(clients, nativeReferences(clients));
  return {
    clients,
    before,
    after,
    counts: () => ({ writes, guards, pauses }),
    options: {
      allowProcessing: true,
      verifyInput: async () => {
        guards++;
      },
      now: () => clock,
      wait: async () => {
        pauses++;
        clock += options.expire ? 900_000 : 5000;
      },
    },
  };
}

test('create-only preflight requires full binding absence and independent genuine DLO404', async () => {
  const scenario = createLifecycle();
  const plan = await preflightNativeDataStreamCreate(authored, scenario.clients);
  assert.equal(plan.operation, 'create');
  assert.equal(scenario.counts().writes, 0);
  for (const failure of [
    new ConnectError('REQUEST_FAILED', 401),
    new Error('secret'),
    { status: 404 },
  ]) {
    const blocked = createLifecycle();
    blocked.clients.dlo.get = async () => {
      throw failure;
    };
    await assert.rejects(preflightNativeDataStreamCreate(authored, blocked.clients));
    assert.equal(blocked.counts().writes, 0);
  }
  const exists = createLifecycle();
  exists.clients.dlo.get = async () => ({});
  await assert.rejects(preflightNativeDataStreamCreate(authored, exists.clients), {
    code: 'STREAM_PROPOSED_DLO_EXISTS',
  });
  await assert.rejects(preflightNativeDataStreamCreate(authored, reads().clients), {
    code: 'STREAM_EXISTING_BINDING_REQUIRES_UPDATE',
  });
});

test('create independently reconciles generated names and checksum-corresponding 15/18 record IDs', async () => {
  const scenario = createLifecycle();
  const result = await createNativeDataStream(authored, scenario.clients, scenario.options);
  assert.equal(result.targetApiName, 'GeneratedStream');
  assert.equal(result.targetDloName, 'ActualDlo__dll');
  assert.equal(result.document.spec.label, 'Generated label');
  assert.equal(scenario.counts().writes, 1);
  assert.equal(scenario.counts().guards, 4);
  assert.ok(scenario.after.calls.includes('GeneratedStream'));
  for (const recordId of ['1sd000000000001AAA', '1ds000000000001AAZ']) {
    const wrong = createLifecycle({ echo: { name: 'GeneratedStream', recordId } });
    await assert.rejects(createNativeDataStream(authored, wrong.clients, wrong.options), {
      code: 'STREAM_CREATE_IDENTITY_UNCONFIRMED',
    });
    assert.equal(wrong.counts().writes, 1);
  }
});

test('create accepts observed label-bearing default dataspace but rejects wrong or multiple scopes', async () => {
  const scenario = createLifecycle();
  scenario.after.target.dataLakeObjectInfo.dataSpaceInfo = [{ label: 'default', name: 'default' }];
  const result = await createNativeDataStream(authored, scenario.clients, scenario.options);
  assert.equal(result.operation, 'create');
  for (const dataSpaceInfo of [
    [{ label: 'Other', name: 'Other' }],
    [{ name: 'default' }, { name: 'default' }],
    [],
  ]) {
    const blocked = createLifecycle();
    const get = blocked.clients.dlo.get;
    blocked.clients.dlo.get = async (...arguments_) => {
      const result = await get(...arguments_);
      result.dataLakeObjects[0].dataSpaceInfo = dataSpaceInfo;
      return result;
    };
    await assert.rejects(createNativeDataStream(authored, blocked.clients, blocked.options));
    assert.equal(blocked.counts().writes, 1);
  }
});

test('create refuses acknowledgement, input drift and binding drift before dispatch', async () => {
  const missing = createLifecycle();
  await assert.rejects(
    createNativeDataStream(authored, missing.clients, {
      ...missing.options,
      allowProcessing: false,
    }),
    { code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED' },
  );
  assert.equal(missing.counts().writes, 0);
  const drift = createLifecycle();
  let checks = 0;
  await assert.rejects(
    createNativeDataStream(authored, drift.clients, {
      ...drift.options,
      verifyInput: async () => {
        if (++checks === 3) throw new Error('changed bytes');
      },
    }),
  );
  assert.equal(drift.counts().writes, 0);
  const binding = createLifecycle();
  let reads_ = 0;
  const original = binding.clients.reference.read;
  binding.clients.reference.read = async (...arguments_) => {
    const value = await original(...arguments_);
    if (arguments_[0] === 'connections.schema' && ++reads_ === 2)
      value.schemas[0].fields[1].label = 'Changed';
    return value;
  };
  await assert.rejects(createNativeDataStream(authored, binding.clients, binding.options), {
    code: 'STREAM_BINDING_DRIFT',
  });
  assert.equal(binding.counts().writes, 0);
});

test('create stale success, pending processing, time bounds and read errors never replay writes', async () => {
  for (const options of [{ processing: true }, { processing: true, expire: true }, { echo: {} }]) {
    const scenario = createLifecycle(options);
    await assert.rejects(createNativeDataStream(authored, scenario.clients, scenario.options));
    assert.equal(scenario.counts().writes, 1);
    assert.equal(scenario.counts().pauses, options.echo ? 0 : options.expire ? 1 : 19);
  }
  const mismatch = createLifecycle();
  mismatch.after.target.dataLakeObjectInfo.label = 'Stale label';
  await assert.rejects(createNativeDataStream(authored, mismatch.clients, mismatch.options), {
    code: 'STREAM_CREATE_PERSISTENCE_UNCONFIRMED',
  });
  assert.equal(mismatch.counts().writes, 1);
  const missingDefault = createLifecycle();
  missingDefault.after.target.mappings.shift();
  await assert.rejects(
    createNativeDataStream(authored, missingDefault.clients, missingDefault.options),
    { code: 'STREAM_CREATE_PERSISTENCE_UNCONFIRMED' },
  );
  assert.equal(missingDefault.counts().writes, 1);
  const failedRead = createLifecycle();
  failedRead.after.clients.streams.get = async () => {
    throw new DataStreamHttpError('STREAM_HTTP_ERROR', 500);
  };
  await assert.rejects(createNativeDataStream(authored, failedRead.clients, failedRead.options));
  assert.equal(failedRead.counts().writes, 1);
});

/**
 * Build an existing bound stream with a real independent DLO read and observable single PATCH.
 * @param {object} controls Synthetic post-dispatch behavior.
 * @returns {object} Update client fixture and counters.
 */
async function updateLifecycle(controls = {}) {
  const fixture = reads();
  fixture.target.status = 'ACTIVE';
  if (controls.nativeShape) {
    fixture.target.dataLakeObjectInfo.status = 'ACTIVE';
    fixture.target.dataLakeObjectInfo.dataSpaceInfo = [{ label: 'default', name: 'default' }];
    fixture.target.dataLakeObjectInfo.dataLakeFieldInfoRepresentation = structuredClone(
      fixture.target.dataLakeObjectInfo.fields,
    );
  }
  const dloRead = fixture.clients.dlo.get;
  fixture.clients.dlo.get = async (...arguments_) => {
    const response = await dloRead(...arguments_);
    response.dataLakeObjects[0].status = controls.processing && writes ? 'PROCESSING' : 'ACTIVE';
    if (controls.nativeShape)
      response.dataLakeObjects[0].dataLakeFieldInfoRepresentation =
        response.dataLakeObjects[0].fields.map((field) => ({ ...field }));
    return response;
  };
  const get = fixture.clients.streams.get;
  fixture.clients.streams.get = async (name) =>
    name === streamId ? structuredClone(fixture.target) : get(name);
  let writes = 0;
  let pauses = 0;
  let guards = 0;
  let time = 0;
  const original = await retrieveNativeDataStream('GeneratedStream', fixture.clients);
  const desired = structuredClone(original);
  desired.identity.apiName = 'SourceGeneratedName';
  desired.spec.additiveFieldMappings.push({
    sourceFieldLabel: 'ProbeValue',
    targetFieldName: 'NextValue',
    targetFieldReturntype: 'Text',
  });
  fixture.clients.streams.create = async () => assert.fail('Existing binding must not POST');
  fixture.clients.streams.update = async (id, document) => {
    assert.equal(id, streamId);
    assert.deepEqual(document.spec.additiveFieldMappings, [
      desired.spec.additiveFieldMappings.at(-1),
    ]);
    writes++;
    if (!controls.stale) {
      fixture.target.mappings.push({ formula: 'ProbeValue', targetFieldName: 'NextValue' });
      fixture.target.dataLakeObjectInfo.fields.push({
        name: 'NextValue',
        label: 'NextValue',
        dataType: 'Text',
        isPrimaryKey: false,
      });
    }
    if (controls.nativeShape && !controls.stale)
      fixture.target.dataLakeObjectInfo.dataLakeFieldInfoRepresentation.push(
        structuredClone(fixture.target.dataLakeObjectInfo.fields.at(-1)),
      );
    if (controls.processing) fixture.target.status = 'PROCESSING';
    controls.afterWrite?.(fixture);
    return { name: 'UNTRUSTED', recordId: 'DefinitionId', status: 'ACTIVE' };
  };
  return {
    ...fixture,
    original,
    desired,
    counts: () => ({ writes, pauses, guards }),
    options: {
      allowProcessing: true,
      verifyInput: async () => {
        guards++;
      },
      now: () => time,
      wait: async () => {
        pauses++;
        time += controls.expire ? 900_000 : 5000;
        controls.afterWait?.(fixture);
      },
    },
  };
}

test('update preview selects only missing exact Text pairs and noop omits nothing destructive', async () => {
  const scenario = await updateLifecycle();
  const plan = await preflightNativeDataStreamUpdate(scenario.desired, scenario.clients);
  assert.equal(plan.operation, 'update');
  assert.deepEqual(plan.patch.spec.additiveFieldMappings, [
    scenario.desired.spec.additiveFieldMappings.at(-1),
  ]);
  assert.equal(scenario.counts().writes, 0);
  const omitted = structuredClone(scenario.original);
  omitted.spec.additiveFieldMappings = [];
  const noop = await updateNativeDataStream(omitted, scenario.clients, {
    ...scenario.options,
    allowProcessing: false,
  });
  assert.equal(noop.operation, 'noop');
  assert.equal(noop.document.spec.additiveFieldMappings.length, 1);
  assert.equal(scenario.counts().writes, 0);
});

test('additive PATCH preserves prior mapping/schema and resolves actual target; exact repeat is zero-write noop', async () => {
  const scenario = await updateLifecycle();
  const result = await updateNativeDataStream(scenario.desired, scenario.clients, scenario.options);
  assert.equal(result.operation, 'update');
  assert.equal(result.targetApiName, 'GeneratedStream');
  assert.equal(result.targetDloName, 'ActualDlo__dll');
  assert.equal(result.document.spec.additiveFieldMappings.length, 2);
  assert.equal(scenario.counts().writes, 1);
  const repeat = await updateNativeDataStream(scenario.desired, scenario.clients, {
    ...scenario.options,
    allowProcessing: false,
  });
  assert.equal(repeat.operation, 'noop');
  assert.equal(scenario.counts().writes, 1);
});

test('update rejects unsupported label/key/retarget/system/source intents and nonready state without writes', async () => {
  for (const mutate of [
    (s) => {
      s.desired.spec.refreshMode = 'FULL';
    },
    (s) => {
      s.desired.spec.label = 'Edited';
    },
    (s) => {
      s.schemas.schemas[0].fields[0].label = 'ProbeValue';
    },
    (s) => {
      s.desired.spec.newDlo.label = 'Edited';
    },
    (s) => {
      s.desired.spec.newDlo.primaryKey.label = 'Edited';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings[0].sourceFieldLabel = 'ProbeId';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings.at(-1).targetFieldName = 'ProbeValue';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings[0].sourceFieldLabel = 'OtherSource';
      s.schemas.schemas[0].fields.push({
        name: 'OtherSource',
        label: 'OtherSource',
        dataType: 'Text',
      });
      s.target.sourceFields.push({ name: 'OtherSource', datatype: 'Text' });
    },
    (s) => {
      s.desired.spec.additiveFieldMappings.at(-1).targetFieldName = 'KQ_New';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings.at(-1).targetFieldName = 'DataSource';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings.at(-1).sourceFieldLabel = 'Missing';
    },
    (s) => {
      s.desired.spec.additiveFieldMappings.at(-1).targetFieldName = 'addedvalue';
    },
    (s) => {
      s.target.status = 'PROCESSING';
    },
    (s) => {
      s.schemas.schemas[0].fields[1].label = 'Different';
    },
  ]) {
    const scenario = await updateLifecycle();
    mutate(scenario);
    await assert.rejects(
      updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
    );
    assert.equal(scenario.counts().writes, 0);
  }
});

test('update acknowledgement, input guards and repeated binding snapshots stop before PATCH', async () => {
  const ack = await updateLifecycle();
  await assert.rejects(
    updateNativeDataStream(ack.desired, ack.clients, { ...ack.options, allowProcessing: false }),
    { code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED' },
  );
  assert.equal(ack.counts().writes, 0);
  for (const at of [1, 2, 3]) {
    const scenario = await updateLifecycle();
    let guards = 0;
    await assert.rejects(
      updateNativeDataStream(scenario.desired, scenario.clients, {
        ...scenario.options,
        verifyInput: async () => {
          if (++guards === at) throw new Error('Input changed');
        },
      }),
    );
    assert.equal(scenario.counts().writes, 0);
  }
  const drift = await updateLifecycle();
  let guards = 0;
  await assert.rejects(
    updateNativeDataStream(drift.desired, drift.clients, {
      ...drift.options,
      verifyInput: async () => {
        if (++guards === 2) drift.target.label = 'Drift';
      },
    }),
  );
  assert.equal(drift.counts().writes, 0);
});

test('update ignores success echoes and stops unknown on stale/pending/read failures or protected-state loss', async () => {
  for (const controls of [
    { stale: true },
    { processing: true },
    { processing: true, expire: true },
    {
      afterWrite: (s) => {
        s.target.mappings.shift();
      },
    },
    {
      afterWrite: (s) => {
        s.target.dataLakeObjectInfo.fields[0].label = 'Drift';
      },
    },
    {
      afterWrite: (s) => {
        s.target.label = 'Drift';
      },
    },
    {
      afterWrite: (s) => {
        s.target.mappings.push({ formula: 'ProbeValue', targetFieldName: 'Unexpected' });
        s.target.dataLakeObjectInfo.fields.push({
          name: 'Unexpected',
          label: 'Unexpected',
          dataType: 'Text',
          isPrimaryKey: false,
        });
      },
    },
    {
      afterWrite: (s) => {
        const read = s.clients.dlo.get;
        s.clients.dlo.get = async (...arguments_) => {
          const response = await read(...arguments_);
          response.dataLakeObjects[0].id = '1dl000000000002AAA';
          return response;
        };
      },
    },
    {
      afterWrite: (s) => {
        s.target.recordId = '1ds000000000002AAA';
      },
    },
    {
      afterWrite: (s) => {
        s.clients.streams.get = async () => {
          throw new DataStreamHttpError('STREAM_HTTP_ERROR', 500);
        };
      },
    },
  ]) {
    const scenario = await updateLifecycle(controls);
    await assert.rejects(
      updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
    );
    assert.equal(scenario.counts().writes, 1);
    if (controls.stale || (controls.processing && !controls.expire))
      assert.equal(scenario.counts().pauses, 19);
    if (controls.expire) assert.equal(scenario.counts().pauses, 1);
  }
  const settledControls = {
    processing: true,
    afterWait: (s) => {
      settledControls.processing = false;
      s.target.status = 'ACTIVE';
    },
  };
  const settled = await updateLifecycle(settledControls);
  const confirmed = await updateNativeDataStream(settled.desired, settled.clients, settled.options);
  assert.equal(confirmed.operation, 'update');
  assert.equal(settled.counts().writes, 1);
  assert.equal(settled.counts().pauses, 1);
  const pending = await updateLifecycle({
    processing: true,
    afterWait: (s) => {
      s.target.status = 'ACTIVE';
    },
  });
  // Parent must independently become ACTIVE too; stream-only readiness is not confirmation.
  await assert.rejects(updateNativeDataStream(pending.desired, pending.clients, pending.options));
  assert.equal(pending.counts().writes, 1);
});

/**
 * Change only the first retrieve snapshot; subsequent binding list/detail reads agree.
 * @param {object} scenario Synthetic read fixture.
 * @param {string} status Initial linked-DLO status.
 * @param {Function} mutate Optional additional protected drift.
 */
function mismatchRetrieveStatus(scenario, status, mutate = () => {}) {
  const get = scenario.clients.streams.get;
  let first = true;
  scenario.clients.streams.get = async (...arguments_) => {
    const value = await get(...arguments_);
    if (first) {
      first = false;
      value.dataLakeObjectInfo.status = status;
      mutate(value);
    }
    return value;
  };
}

for (const [initial, later] of [
  ['ACTIVE', 'PROCESSING'],
  ['PROCESSING', 'ACTIVE'],
]) {
  test(`retrieve classifies only linked-DLO ${initial}/${later} snapshot transition as pending`, async () => {
    const scenario = reads();
    scenario.target.dataLakeObjectInfo.status = later;
    const before = structuredClone(scenario.target);
    mismatchRetrieveStatus(scenario, initial);
    await assert.rejects(retrieveNativeDataStream('GeneratedStream', scenario.clients), {
      code: 'STREAM_SNAPSHOT_PENDING',
    });
    assert.deepEqual(scenario.target, before);
  });
}

for (const [label, mutate] of Object.entries({
  identity: (value) => {
    value.recordId = '1ds000000000002AAA';
  },
  schema: (value) => {
    value.dataLakeObjectInfo.fields[0].label = 'Changed';
  },
  binding: (value) => {
    value.dataLakeObjectInfo.name = 'Changed__dll';
  },
  mapping: (value) => {
    value.mappings[0].targetFieldName = 'Changed';
  },
  config: (value) => {
    value.refreshConfig.unknownSetting = true;
  },
  unknown: (value) => {
    value.dataLakeObjectInfo.unknownSetting = true;
  },
})) {
  test(`retrieve does not hide ${label} drift behind pending linked-DLO status`, async () => {
    const scenario = reads();
    scenario.target.dataLakeObjectInfo.status = 'ACTIVE';
    mismatchRetrieveStatus(scenario, 'PROCESSING', mutate);
    await assert.rejects(retrieveNativeDataStream('GeneratedStream', scenario.clients), {
      code: 'STREAM_BINDING_DRIFT',
    });
  });
}

for (const status of ['ERROR', undefined]) {
  test(`retrieve keeps unrecognized linked-DLO status ${status} strict`, async () => {
    const scenario = reads();
    scenario.target.dataLakeObjectInfo.status = 'ACTIVE';
    mismatchRetrieveStatus(scenario, status);
    await assert.rejects(retrieveNativeDataStream('GeneratedStream', scenario.clients), {
      code: 'STREAM_BINDING_DRIFT',
    });
  });
}

for (const operation of ['create', 'update']) {
  for (const ending of ['settled', 'pending', 'expired']) {
    test(`${operation} revalidates linked-DLO snapshot transitions until ${ending} without replay`, async () => {
      const scenario =
        operation === 'create' ? createLifecycle() : await updateLifecycle({ nativeShape: true });
      const target = operation === 'create' ? scenario.after.target : scenario.target;
      target.dataLakeObjectInfo.status = 'ACTIVE';
      let pending = true;
      const get = scenario.clients.streams.get;
      scenario.clients.streams.get = async (...arguments_) => {
        const value = await get(...arguments_);
        if (scenario.counts().writes && pending) value.dataLakeObjectInfo.status = 'PROCESSING';
        return value;
      };
      const pause = scenario.options.wait;
      scenario.options.wait = async (...arguments_) => {
        await pause(...arguments_);
        if (ending === 'settled') pending = false;
      };
      if (ending === 'expired')
        scenario.options.now = () => (scenario.counts().pauses ? 900_000 : 0);
      useProductionTransport(scenario, operation === 'create' ? authored : scenario.desired);
      const run =
        operation === 'create'
          ? createNativeDataStream(authored, scenario.clients, scenario.options)
          : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options);
      if (ending === 'settled') {
        const result = await run;
        assert.equal(result.operation, operation);
      } else
        await assert.rejects(run, {
          code: `STREAM_${operation.toUpperCase()}_SETTLEMENT_UNCONFIRMED`,
        });
      assert.equal(scenario.counts().writes, 1);
      assert.equal(scenario.counts().pauses, ending === 'pending' ? 19 : 1);
    });
  }
}

for (const operation of ['create', 'update']) {
  for (const [initial, later] of [
    ['PROCESSING', 'ACTIVE'],
    ['ACTIVE', 'PROCESSING'],
  ]) {
    for (const ending of ['settled', 'pending', 'expired']) {
      test(`${operation} bounds isolated stream ${initial}/${later} readback until ${ending}`, async () => {
        const scenario =
          operation === 'create' ? createLifecycle() : await updateLifecycle({ nativeShape: true });
        const target = operation === 'create' ? scenario.after.target : scenario.target;
        target.dataLakeObjectInfo.status = 'ACTIVE';
        let pending = true;
        const write = scenario.clients.streams[operation];
        scenario.clients.streams[operation] = async (...arguments_) => {
          const result = await write(...arguments_);
          target.status = initial;
          return result;
        };
        const get = scenario.clients.streams.get;
        scenario.clients.streams.get = async (identity) => {
          const value = await get(identity);
          if (scenario.counts().writes && pending) {
            value.status = identity === streamId ? later : initial;
            // Existing mapping normalization remains in effect at the exact failing comparison.
            if (identity === streamId) value.mappings.reverse();
          }
          return value;
        };
        const pause = scenario.options.wait;
        scenario.options.wait = async (...arguments_) => {
          await pause(...arguments_);
          if (ending === 'settled') {
            pending = false;
            target.status = 'ACTIVE';
          }
        };
        if (ending === 'expired')
          scenario.options.now = () => (scenario.counts().pauses ? 900_000 : 0);
        useProductionTransport(scenario, operation === 'create' ? authored : scenario.desired);
        const run =
          operation === 'create'
            ? createNativeDataStream(authored, scenario.clients, scenario.options)
            : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options);
        if (ending === 'settled') {
          const result = await run;
          assert.equal(result.operation, operation);
        } else
          await assert.rejects(run, {
            code: `STREAM_${operation.toUpperCase()}_SETTLEMENT_UNCONFIRMED`,
          });
        assert.equal(scenario.counts().writes, 1);
        assert.equal(scenario.counts().pauses, ending === 'pending' ? 19 : 1);
      });
    }
  }
  for (const [label, mutate] of Object.entries({
    identity: (value) => {
      value.recordId = '1ds000000000002AAA';
    },
    configuration: (value) => {
      value.refreshConfig.unknownSetting = true;
    },
    mapping: (value) => {
      value.mappings[0].unknownSetting = true;
    },
    unknown: (value) => {
      value.unknownSetting = true;
    },
    linked: (value) => {
      value.dataLakeObjectInfo.status = 'PROCESSING';
    },
    unsupported: (value) => {
      value.status = 'ERROR';
    },
  })) {
    test(`${operation} rejects ${label} drift alongside post-write stream lifecycle mismatch`, async () => {
      const scenario =
        operation === 'create' ? createLifecycle() : await updateLifecycle({ nativeShape: true });
      const target = operation === 'create' ? scenario.after.target : scenario.target;
      target.dataLakeObjectInfo.status = 'ACTIVE';
      const get = scenario.clients.streams.get;
      scenario.clients.streams.get = async (identity) => {
        const value = await get(identity);
        if (scenario.counts().writes && identity === streamId) {
          value.status = 'PROCESSING';
          mutate(value);
        }
        return value;
      };
      await assert.rejects(
        operation === 'create'
          ? createNativeDataStream(authored, scenario.clients, scenario.options)
          : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
        { code: 'STREAM_BINDING_DRIFT' },
      );
      assert.equal(scenario.counts().writes, 1);
      assert.equal(scenario.counts().pauses, 0);
    });
  }
}

/**
 * Inject a lifecycle mismatch at one real resolver/retrieve comparison.
 * @param {object} scenario Lifecycle fixture.
 * @param {string} operation Single dispatched operation.
 * @param {string} boundary Comparison to exercise.
 * @param {string} later Independent status.
 * @param {Function} mutate Additional drift.
 * @returns {Function} Stop injecting mismatches.
 */
function settlementMismatch(scenario, operation, boundary, later, mutate = () => {}) {
  let pending = true;
  let reads = 0;
  const write = scenario.clients.streams[operation];
  scenario.clients.streams[operation] = async (...arguments_) => {
    const result = await write(...arguments_);
    reads = 0;
    return result;
  };
  const pause = scenario.options.wait;
  scenario.options.wait = async (...arguments_) => {
    await pause(...arguments_);
    reads = 0;
  };
  const list = scenario.clients.streams.list;
  scenario.clients.streams.list = async (...arguments_) => {
    const value = await list(...arguments_);
    if (scenario.counts().writes && boundary === 'binding') reads = 0;
    return value;
  };
  const get = scenario.clients.streams.get;
  scenario.clients.streams.get = async (identity) => {
    const value = await get(identity);
    if (!scenario.counts().writes || !pending) return value;
    reads++;
    const inject =
      boundary === 'binding'
        ? reads === 2
        : boundary === 'late-binding'
          ? reads === (operation === 'create' ? 6 : 5)
          : reads === (operation === 'create' ? 4 : 1);
    if (inject) {
      value.status = later;
      value.mappings.reverse();
      mutate(value);
    }
    return value;
  };
  return () => {
    pending = false;
  };
}

for (const operation of ['create', 'update']) {
  for (const boundary of ['binding', 'retrieve', 'late-binding']) {
    for (const initial of ['ACTIVE', 'PROCESSING']) {
      for (const ending of ['settled', 'pending', 'expired']) {
        test(`${operation} ${boundary} isolates ${initial} lifecycle mismatch until ${ending}`, async () => {
          const scenario =
            operation === 'create'
              ? createLifecycle()
              : await updateLifecycle({ nativeShape: true });
          const target = operation === 'create' ? scenario.after.target : scenario.target;
          const write = scenario.clients.streams[operation];
          scenario.clients.streams[operation] = async (...arguments_) => {
            const result = await write(...arguments_);
            target.status = initial;
            return result;
          };
          const settle = settlementMismatch(
            scenario,
            operation,
            boundary,
            initial === 'ACTIVE' ? 'PROCESSING' : 'ACTIVE',
          );
          const pause = scenario.options.wait;
          scenario.options.wait = async () => {
            await pause();
            if (ending === 'settled') {
              settle();
              target.status = 'ACTIVE';
            }
          };
          if (ending === 'expired')
            scenario.options.now = () => (scenario.counts().pauses ? 900_000 : 0);
          useProductionTransport(scenario, operation === 'create' ? authored : scenario.desired);
          const run =
            operation === 'create'
              ? createNativeDataStream(authored, scenario.clients, scenario.options)
              : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options);
          if (ending === 'settled') {
            const result = await run;
            assert.equal(result.operation, operation);
          } else
            await assert.rejects(run, {
              code: `STREAM_${operation.toUpperCase()}_SETTLEMENT_UNCONFIRMED`,
            });
          assert.equal(scenario.counts().writes, 1);
          assert.equal(scenario.counts().pauses, ending === 'pending' ? 19 : 1);
        });
      }
    }
    for (const [label, mutate] of Object.entries({
      identity: (value) => {
        value.recordId = '1ds000000000002AAA';
      },
      configuration: (value) => {
        value.refreshConfig.unknownSetting = true;
      },
      schema: (value) => {
        value.dataLakeObjectInfo.fields[0].label = 'Changed';
      },
      mapping: (value) => {
        value.mappings[0].unknownSetting = true;
      },
      unknown: (value) => {
        value.unknownSetting = true;
      },
      linked: (value) => {
        value.dataLakeObjectInfo.status = 'PROCESSING';
      },
      unsupported: (value) => {
        value.status = 'ERROR';
      },
    })) {
      test(`${operation} ${boundary} refuses combined ${label} drift immediately`, async () => {
        const scenario =
          operation === 'create' ? createLifecycle() : await updateLifecycle({ nativeShape: true });
        const target = operation === 'create' ? scenario.after.target : scenario.target;
        target.dataLakeObjectInfo.status = 'ACTIVE';
        settlementMismatch(scenario, operation, boundary, 'PROCESSING', mutate);
        useProductionTransport(scenario, operation === 'create' ? authored : scenario.desired);
        await assert.rejects(
          operation === 'create'
            ? createNativeDataStream(authored, scenario.clients, scenario.options)
            : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
          { code: 'STREAM_BINDING_DRIFT' },
        );
        assert.equal(scenario.counts().writes, 1);
        assert.equal(scenario.counts().pauses, 0);
      });
    }
  }
}

test('top-level stream lifecycle mismatch remains strict during retrieve and update preflight', async () => {
  for (const operation of [
    'binding',
    'retrieve',
    'create-preflight',
    'update',
    'delete-preflight',
  ]) {
    const scenario = await updateLifecycle({ nativeShape: true });
    const get = scenario.clients.streams.get;
    scenario.clients.streams.get = async (...arguments_) => {
      const value = await get(...arguments_);
      value.status = 'PROCESSING';
      return value;
    };
    await assert.rejects(
      operation === 'binding'
        ? resolveDataStreamBinding(selection, scenario.clients)
        : operation === 'retrieve'
          ? retrieveNativeDataStream('GeneratedStream', scenario.clients)
          : operation === 'create-preflight'
            ? preflightNativeDataStreamCreate(authored, scenario.clients)
            : operation === 'delete-preflight'
              ? preflightNativeDataStreamDelete('GeneratedStream', scenario.clients, {
                  deleteDlo: true,
                  survivorDloNames: [],
                })
              : updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
      { code: 'STREAM_BINDING_DRIFT' },
    );
    assert.equal(scenario.counts().writes, 0);
    assert.equal(scenario.counts().pauses, 0);
  }
});

test('create requires independently ACTIVE linked DLO status when supplied', async () => {
  for (const settles of [true, false]) {
    const scenario = createLifecycle();
    scenario.after.target.dataLakeObjectInfo.status = 'PROCESSING';
    const pause = scenario.options.wait;
    scenario.options.wait = async () => {
      await pause();
      if (settles) scenario.after.target.dataLakeObjectInfo.status = 'ACTIVE';
    };
    const run = createNativeDataStream(authored, scenario.clients, scenario.options);
    if (settles) {
      const result = await run;
      assert.equal(result.operation, 'create');
    } else await assert.rejects(run, { code: 'STREAM_CREATE_SETTLEMENT_UNCONFIRMED' });
    assert.equal(scenario.counts().writes, 1);
    assert.equal(scenario.counts().pauses, settles ? 1 : 19);
  }
});

test('pending linked-DLO snapshot cannot authorize preflight writes or noop', async () => {
  const scenario = await updateLifecycle({ nativeShape: true });
  const get = scenario.clients.streams.get;
  scenario.clients.streams.get = async (...arguments_) => {
    const value = await get(...arguments_);
    value.dataLakeObjectInfo.status = 'PROCESSING';
    return value;
  };
  await assert.rejects(
    updateNativeDataStream(scenario.desired, scenario.clients, scenario.options),
    {
      code: 'STREAM_SNAPSHOT_PENDING',
    },
  );
  assert.equal(scenario.counts().writes, 0);
});

test('native double field collections preserve prior entries and settle nested DLO processing independently', async () => {
  const scenario = await updateLifecycle({
    nativeShape: true,
    afterWrite: (s) => {
      s.target.dataLakeObjectInfo.status = 'PROCESSING';
    },
    afterWait: (s) => {
      s.target.dataLakeObjectInfo.status = 'ACTIVE';
    },
  });
  const result = await updateNativeDataStream(scenario.desired, scenario.clients, scenario.options);
  assert.equal(result.operation, 'update');
  assert.equal(scenario.counts().pauses, 1);
  assert.equal(scenario.counts().writes, 1);
  const pending = await updateLifecycle({
    nativeShape: true,
    afterWrite: (s) => {
      s.target.dataLakeObjectInfo.status = 'PROCESSING';
    },
  });
  await assert.rejects(updateNativeDataStream(pending.desired, pending.clients, pending.options), {
    code: 'STREAM_UPDATE_SETTLEMENT_UNCONFIRMED',
  });
  assert.equal(pending.counts().pauses, 19);
  for (const change of [
    (info) => {
      info.dataLakeFieldInfoRepresentation.shift();
    },
    (info) => {
      info.dataLakeFieldInfoRepresentation[0].label = 'Drift';
    },
    (info) => {
      info.dataLakeFieldInfoRepresentation.push({
        name: 'Unexpected',
        label: 'Unexpected',
        dataType: 'Text',
        isPrimaryKey: false,
      });
    },
    (info) => {
      info.dataLakeFieldInfoRepresentation.at(-1).dataType = 'Number';
    },
    (info) => {
      delete info.dataLakeFieldInfoRepresentation;
    },
    (info) => {
      info.category = 'Changed';
    },
    (info) => {
      info.unknownSetting = 'Changed';
    },
    (info) => {
      info.status = 'ERROR';
    },
    (info) => {
      delete info.status;
    },
  ]) {
    const blocked = await updateLifecycle({
      nativeShape: true,
      afterWrite: (s) => change(s.target.dataLakeObjectInfo),
    });
    await assert.rejects(updateNativeDataStream(blocked.desired, blocked.clients, blocked.options));
    assert.equal(blocked.counts().writes, 1);
  }
});

test('actual Connect GET stack preserves native status and refuses refresh/replay for stream reads', async () => {
  for (const statusCode of [401, 403, 404, 500, 200]) {
    let calls = 0;
    const owner = Object.assign(Object.create(Connection.prototype), {
      instanceUrl: 'https://synthetic.my.salesforce.com',
      version: '68.0',
      accessToken: 'synthetic-token',
      _propagators: [],
      logger: { getRawLogger: () => ({ debug() {} }) },
      _refreshDelegate: { refresh: () => assert.fail('no refresh') },
      _transport: {
        httpRequest: (_request, options) => {
          calls++;
          assert.equal(options.retry.maxRetries, 0);
          const pending = Promise.resolve({
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              statusCode === 200
                ? stream
                : [
                    {
                      errorCode: statusCode === 401 ? 'INVALID_SESSION_ID' : 'NOT_FOUND',
                      message: 'secret',
                    },
                  ],
            ),
          });
          pending.stream = () => new PassThrough();
          return pending;
        },
      },
    });
    const client = createDataStreamClient('synthetic', new ConnectClient(owner, '68.0'));
    if (statusCode === 200) assert.deepEqual(await client.get('GeneratedStream'), stream);
    else await assert.rejects(client.get('GeneratedStream'), { status: statusCode });
    assert.equal(calls, 1);
  }
});

/**
 * Model exact owned deletion and a permanent unrelated DLO with independent read boundaries.
 * @param {object} controls Post-dispatch pending/errors/drift.
 * @returns {Promise<object>} Guarded synthetic clients and counters.
 */
async function deleteLifecycle(controls = {}) {
  const fixture = reads();
  fixture.target.status = 'ACTIVE';
  const readParent = fixture.clients.dlo.get;
  const parentResponse = await readParent(fixture.target.dataLakeObjectInfo.name);
  const parent = parentResponse.dataLakeObjects[0];
  parent.status = 'ACTIVE';
  const survivor = {
    ...structuredClone(parent),
    name: 'PermanentBaseline__dll',
    id: '1dl000000000002AAA',
  };
  const state = { writes: 0, guards: 0, pauses: 0, clock: 0 };
  const dependencies = {
    dependencies: [{ componentType: 'DataStream', id: streamId, name: fixture.target.label }],
    totalSize: 1,
  };
  const originalRead = fixture.clients.reference.read;
  fixture.clients.reference.read = async (operation, parameters) => {
    if (operation === 'dependencies.stream') return { dependencies: [], totalSize: 0 };
    if (operation === 'dependencies.dlo')
      return state.writes && !controls.pending
        ? { dependencies: [], totalSize: 0 }
        : structuredClone(dependencies);
    return originalRead(operation, parameters);
  };
  fixture.clients.streams.list = async () =>
    state.writes && !controls.pending ? [] : [structuredClone(fixture.target)];
  fixture.clients.streams.get = async (identity) => {
    if (state.writes && controls.readError) throw controls.readError;
    if (state.writes && !controls.pending) throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
    assert.ok([fixture.target.name, streamId].includes(identity));
    return structuredClone(fixture.target);
  };
  fixture.clients.dlo.get = async (identity) => {
    if ([survivor.name, survivor.id].includes(identity))
      return {
        dataLakeObjects: [
          {
            ...structuredClone(survivor),
            ...(state.writes && controls.survivorDrift ? { label: 'Changed' } : {}),
          },
        ],
      };
    assert.ok([parent.name, parent.id].includes(identity));
    if (state.writes && controls.deleteDlo)
      throw controls.parentError ?? new ConnectError('REQUEST_FAILED', 404);
    return {
      dataLakeObjects: [
        {
          ...structuredClone(parent),
          ...(state.writes && controls.parentDrift ? { fields: [] } : {}),
        },
      ],
    };
  };
  fixture.clients.streams.delete = async (id, deleteDlo) => {
    assert.equal(id, streamId);
    assert.equal(deleteDlo, controls.deleteDlo === true);
    state.writes++;
    if (!controls.pending) fixture.schemas.schemas[0].availabilityStatus = 'Available';
  };
  return {
    ...fixture,
    state,
    parent,
    survivor,
    dependencies,
    options: {
      deleteDlo: controls.deleteDlo === true,
      survivorDloNames: [survivor.name],
      verifyInput: async () => {
        state.guards++;
      },
      now: () => state.clock,
      wait: async () => {
        state.pauses++;
        state.clock += controls.expire ? 900_000 : 5000;
      },
    },
  };
}

test('delete preflight composes production native API68 dependency routes with exact numeric-leading IDs', async () => {
  const fixture = await deleteLifecycle();
  const originalRead = fixture.clients.reference.read;
  const requests = [];
  const answers = new Map([
    [`${ssot}/data-streams/${streamId}/dependencies`, 'dependencies.stream'],
    [`${ssot}/data-lake-objects/${fixture.parent.name}/dependencies`, 'dependencies.dlo'],
  ]);
  const pendingBodies = [];
  const owner = syntheticOwner((parsed) => {
    const operation = answers.get(parsed.pathname);
    assert.ok(operation, parsed.pathname);
    assert.equal(parsed.search, '');
    return { body: pendingBodies.shift() };
  }, requests);
  const native = createDataStreamReferenceReader(new ConnectClient(owner, '68.0'), '68.0');
  // Synthetic bodies still come from the lifecycle model; only the dependency wire is native.
  fixture.clients.dependencies = {
    stream: async (identity) => {
      pendingBodies.push(await originalRead('dependencies.stream', identity));
      return native.dependencies.stream(identity);
    },
    dlo: async (identity) => {
      pendingBodies.push(await originalRead('dependencies.dlo', identity));
      return native.dependencies.dlo(identity);
    },
  };
  const plan = await preflightNativeDataStreamDelete(
    'GeneratedStream',
    fixture.clients,
    fixture.options,
  );
  assert.equal(plan.deleteDlo, false);
  assert.equal(fixture.state.writes, 0);
  assert.deepEqual(
    requests.map(({ url }) => new URL(url).pathname),
    [...answers.keys()],
  );
  for (const identity of ['GeneratedStream/Other', streamId, '../GeneratedStream'])
    await assert.rejects(
      preflightNativeDataStreamDelete(identity, fixture.clients, fixture.options),
      {
        code: 'INVALID_STREAM_DELETE_SELECTION',
      },
    );
  assert.equal(fixture.state.writes, 0);
});

test('delete preflight is zero-write and requires complete exclusive observed dependencies', async () => {
  const fixture = await deleteLifecycle();
  const plan = await preflightNativeDataStreamDelete(
    'GeneratedStream',
    fixture.clients,
    fixture.options,
  );
  assert.equal(plan.deleteDlo, false);
  assert.equal(plan.survivors[0].name, 'PermanentBaseline__dll');
  assert.equal(fixture.state.writes, 0);
  for (const dependencies of [
    { dependencies: [] },
    { dependencies: [], totalSize: 1 },
    { dependencies: [], totalSize: 0, nextPageUrl: 'unknown' },
    {
      dependencies: [{ componentType: 'Unknown', id: streamId, name: 'Generated label' }],
      totalSize: 1,
    },
    {
      dependencies: [
        { componentType: 'DataStream', id: '1ds000000000002AAA', name: 'Generated label' },
      ],
      totalSize: 1,
    },
    {
      dependencies: [
        { componentType: 'DataStream', id: streamId, name: 'Generated label' },
        { componentType: 'Mapping', id: dloId },
      ],
      totalSize: 2,
    },
  ]) {
    const blocked = await deleteLifecycle({ deleteDlo: true });
    Object.assign(blocked.dependencies, dependencies);
    for (const key of Object.keys(blocked.dependencies))
      if (!(key in dependencies)) delete blocked.dependencies[key];
    await assert.rejects(
      preflightNativeDataStreamDelete('GeneratedStream', blocked.clients, blocked.options),
    );
    assert.equal(blocked.state.writes, 0);
  }
});

test('delete false preserves full parent and permanent survivor; true checks linked name and ID absence', async () => {
  for (const deleteDlo of [false, true]) {
    const fixture = await deleteLifecycle({ deleteDlo });
    const result = await deleteNativeDataStream(
      'GeneratedStream',
      fixture.clients,
      fixture.options,
    );
    assert.equal(result.targetApiName, 'GeneratedStream');
    assert.equal(result.targetDloName, 'ActualDlo__dll');
    assert.deepEqual(fixture.state, { writes: 1, guards: 4, pauses: 0, clock: 0 });
  }
});

test('delete fails closed on input, binding, ownership, status and dependency drift before dispatch', async () => {
  for (const checkpoint of [1, 2, 3]) {
    const fixture = await deleteLifecycle();
    fixture.options.verifyInput = async () => {
      if (++fixture.state.guards === checkpoint) throw new Error('Input changed');
    };
    await assert.rejects(
      deleteNativeDataStream('GeneratedStream', fixture.clients, fixture.options),
    );
    assert.equal(fixture.state.writes, 0);
  }
  const drift = await deleteLifecycle();
  drift.options.verifyInput = async () => {
    if (++drift.state.guards === 2) drift.target.label = 'Changed';
  };
  await assert.rejects(deleteNativeDataStream('GeneratedStream', drift.clients, drift.options));
  assert.equal(drift.state.writes, 0);
  const pending = await deleteLifecycle();
  pending.target.status = 'PROCESSING';
  await assert.rejects(
    deleteNativeDataStream('GeneratedStream', pending.clients, pending.options),
    { code: 'STREAM_NOT_READY' },
  );
  assert.equal(pending.state.writes, 0);
  const survivorSelected = await deleteLifecycle();
  survivorSelected.options.survivorDloNames = [survivorSelected.parent.name];
  await assert.rejects(
    deleteNativeDataStream('GeneratedStream', survivorSelected.clients, survivorSelected.options),
    { code: 'INVALID_STREAM_DELETE_SURVIVOR' },
  );
  assert.equal(survivorSelected.state.writes, 0);
});

test('delete stale204, read400/500, pending, timeout and preservation drift never replay or directly delete parents', async () => {
  for (const controls of [
    { pending: true },
    { pending: true, expire: true },
    { parentDrift: true },
    { survivorDrift: true },
    { readError: new DataStreamHttpError('STREAM_HTTP_ERROR', 400) },
    { readError: new DataStreamHttpError('STREAM_HTTP_ERROR', 500) },
    { deleteDlo: true, parentError: new ConnectError('REQUEST_FAILED', 400) },
    { deleteDlo: true, parentError: new ConnectError('REQUEST_FAILED', 500) },
    { deleteDlo: true, parentError: { status: 404 } },
  ]) {
    const fixture = await deleteLifecycle(controls);
    await assert.rejects(
      deleteNativeDataStream('GeneratedStream', fixture.clients, fixture.options),
    );
    assert.equal(fixture.state.writes, 1);
    if (controls.pending) assert.equal(fixture.state.pauses, controls.expire ? 1 : 19);
  }
});
