import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { deleteSegment } from '../lib/services/delete-segment.js';
import { deleteIdentityResolution } from '../lib/services/delete-identity-resolution.js';
import { deleteDataTransform } from '../lib/services/delete-data-transform.js';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';
import { operateNativeDataGraph } from '../lib/services/command-native-data-graph.js';
import { deleteNativeDlo, previewDeleteNativeDlo } from '../lib/services/native-dlo.js';
import { deleteNativeDmo, previewDeleteNativeDmo } from '../lib/services/native-dmo.js';
import { deleteNativeRelationship } from '../lib/services/native-relationship.js';
import { deleteNativeDataStream } from '../lib/services/native-data-stream.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { DataStreamHttpError } from '../lib/transport/data-stream-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';

// Deleting a file retrieved as-is (verbatim) goes by type and name: the GET is never projected
// into the plugin's model, while identity, scope, protection and dependents are still checked.

const verbatim = (kind, apiName) => ({
  schemaVersion: 1,
  kind,
  ...([
    'dmo',
    'mapping',
    'relationship',
    'calculated-insight',
    'segment',
    'data-transform',
    'native-data-graph',
    'identity-resolution',
  ].includes(kind)
    ? { c__dataSpace: 'default', identity: { apiName } }
    : { identity: { dataSpace: 'default', apiName } }),
  verbatim: { reason: 'UNMODELLED_RESPONSE', native: {} },
});
const jsonNull = JSON.parse('null');
const selection = () => ({ requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' });
const notFound = () =>
  Object.assign(new Error('not found'), {
    name: 'ITEM_NOT_FOUND',
    errorCode: 'ITEM_NOT_FOUND',
    statusCode: 404,
    data: { errorCode: 'ITEM_NOT_FOUND', message: 'not found' },
  });

/**
 * Connect connection over one GET answer; after the DELETE every GET reads 404.
 * @param {Function} answer Raw GET answer by call count.
 * @returns {object} Connection and its call ledger.
 */
function connection(answer) {
  const calls = [];
  let deleted = false;
  let reads = 0;
  return {
    calls,
    value: {
      instanceUrl: 'https://synthetic.my.salesforce.com',
      getApiVersion: () => '68.0',
      getUsername: () => 'target',
      request: async (request, options) => {
        calls.push(`${request.method} ${request.url.replace(/^https:\/\/[^/]+/u, '')}`);
        if (request.method === 'DELETE') {
          deleted = true;
          return options.noContentResponse;
        }
        if (deleted) throw notFound();
        return answer(++reads);
      },
    },
  };
}
const guards = (preview = false) => ({
  preview,
  confirmDelete: true,
  verifyInput: async () => {},
  now: () => 0,
  delay: async () => {},
});

// A segment built in the UI: no includeDbt, an unknown criteria shape.
const uiSegment = (change = {}) => ({
  segments: [
    {
      apiName: 'Audience',
      dataSpace: 'default',
      displayName: 'Audience',
      segmentType: 'UI',
      includeCriteria: { filter: { futureOperator: 'x' } },
      marketSegmentId: '1sg000000000001AAA',
      segmentStatus: 'ACTIVE',
      ...change,
    },
  ],
});

test('a verbatim UI segment is deleted by name; identity and status still refuse', async () => {
  const ok = connection(() => uiSegment());
  const preview = await deleteSegment(
    verbatim('segment', 'Audience'),
    ok.value,
    selection(),
    'default',
    guards(true),
  );
  assert.equal(preview.outcome, 'delete', JSON.stringify(preview.diagnostics));
  const deleted = await deleteSegment(
    verbatim('segment', 'Audience'),
    ok.value,
    selection(),
    'default',
    guards(),
  );
  assert.equal(deleted.outcome, 'deleted', JSON.stringify(deleted.diagnostics));
  assert.ok(ok.calls.includes('DELETE /services/data/v68.0/ssot/segments/Audience'));
  for (const change of [
    { apiName: 'Other' },
    { dataSpace: 'Other' },
    { segmentStatus: 'DELETING' },
  ]) {
    const refused = connection(() => uiSegment(change));
    const result = await deleteSegment(
      verbatim('segment', 'Audience'),
      refused.value,
      selection(),
      'default',
      guards(),
    );
    assert.equal(result.outcome, 'blocked', JSON.stringify(change));
    assert.ok(!refused.calls.some((call) => call.startsWith('DELETE')));
  }
  // The segment changing between the reads is drift, never a delete.
  const drift = connection((reads) => uiSegment(reads > 1 ? { displayName: 'Changed' } : {}));
  const drifted = await deleteSegment(
    verbatim('segment', 'Audience'),
    drift.value,
    selection(),
    'default',
    guards(),
  );
  assert.equal(drifted.outcome, 'blocked');
  assert.ok(!drift.calls.some((call) => call.startsWith('DELETE')));
});

const owner = (change = {}) => ({
  id: '1ir000000000001AAA',
  objectApiName: 'Individual_A1b2',
  dataSpaceName: 'default',
  configurationType: 'Individual',
  rulesetStatus: 'PUBLISHED',
  // Null sources: the dependency binder cannot read them.
  reconciliationRules: [{ entity: 'ssot__Individual__dlm', sources: jsonNull }],
  matchRules: jsonNull,
  ...change,
});

test('a verbatim identity resolution with null sources is deleted by name; guards still refuse', async () => {
  const ok = connection(() => owner());
  const result = await deleteIdentityResolution(
    verbatim('identity-resolution', 'Individual_A1b2'),
    ok.value,
    selection(),
    'default',
    guards(),
  );
  assert.equal(result.outcome, 'deleted', JSON.stringify(result.diagnostics));
  assert.ok(
    ok.calls.includes('DELETE /services/data/v68.0/ssot/identity-resolutions/1ir000000000001AAA'),
  );
  for (const [change, outcome] of [
    [{ objectApiName: 'Other' }, 'blocked'],
    [{ dataSpaceName: 'Other' }, 'blocked'],
    [{ id: 'not-an-id' }, 'blocked'],
  ]) {
    const refused = connection(() => owner(change));
    const blocked = await deleteIdentityResolution(
      verbatim('identity-resolution', 'Individual_A1b2'),
      refused.value,
      selection(),
      'default',
      guards(),
    );
    assert.equal(blocked.outcome, outcome, JSON.stringify(change));
    assert.ok(!refused.calls.some((call) => call.startsWith('DELETE')));
  }
  const pending = connection(() => owner({ rulesetStatus: 'PUBLISHING' }));
  const notSettled = await deleteIdentityResolution(
    verbatim('identity-resolution', 'Individual_A1b2'),
    pending.value,
    selection(),
    'default',
    guards(),
  );
  assert.deepEqual(
    notSettled.diagnostics.map((entry) => entry.code),
    ['IDENTITY_RESOLUTION_NOT_SETTLED'],
  );
});

const transformId = '1dt000000000001AAA';
const transformClient = (raw, ledger, space = 'default') => {
  let deleted = false;
  return {
    // The MktDataTransform records (SOQL): the GET above names no dataSpaceName.
    dataSpaces: async () => new Map([[transformId, space]]),
    list: async () =>
      deleted
        ? { totalSize: 0, dataTransforms: [] }
        : { totalSize: 1, dataTransforms: [{ id: transformId, name: 'SyntheticTransform' }] },
    get: async () => structuredClone(raw),
    schedule: async () => ({}),
    delete: async (id) => {
      ledger.push(`delete:${id}`);
      deleted = true;
    },
  };
};
const rawTransform = (change = {}) => ({
  id: transformId,
  name: 'SyntheticTransform',
  creationType: 'CUSTOM',
  definition: { futureEngine: { nodes: 'not modelled' } },
  ...change,
});

test('a verbatim transform of any owner is deleted by name; renamed and processing ones stay refused', async () => {
  for (const change of [{}, { creationType: 'SYSTEM' }, { namespace: 'pkg' }]) {
    const ledger = [];
    const result = await deleteDataTransform(
      verbatim('data-transform', 'SyntheticTransform'),
      transformClient(rawTransform(change), ledger),
      { targetId: transformId, confirmDelete: true, verifyInput: async () => {}, now: () => 0 },
    );
    assert.equal(result.outcome, 'deleted');
    assert.deepEqual(ledger, [`delete:${transformId}`]);
  }
  for (const [change, code] of [
    [{ name: 'OtherTransform' }, 'TRANSFORM_DELETE_IDENTITY_MISMATCH'],
    [{ status: 'PROCESSING' }, 'TRANSFORM_DELETE_PROCESSING'],
  ]) {
    const refused = [];
    await assert.rejects(
      deleteDataTransform(
        verbatim('data-transform', 'SyntheticTransform'),
        transformClient(rawTransform(change), refused),
        { targetId: transformId, confirmDelete: true, verifyInput: async () => {} },
      ),
      { code },
    );
    assert.deepEqual(refused, []);
  }
  // The org transform is resolved to its data space before any DELETE: its MktDataTransform
  // record, or the dataSpaceName of its GET.
  for (const [raw, space] of [
    [rawTransform(), 'dataspace2'],
    [rawTransform({ dataSpaceName: 'dataspace2' }), 'default'],
  ]) {
    const refused = [];
    await assert.rejects(
      deleteDataTransform(
        verbatim('data-transform', 'SyntheticTransform'),
        transformClient(raw, refused, space),
        { targetId: transformId, confirmDelete: true, verifyInput: async () => {} },
      ),
      { code: 'TRANSFORM_DATASPACE_MISMATCH', message: /in the data space dataspace2/u },
    );
    assert.deepEqual(refused, []);
  }
});

const rawGraph = (change = {}, node = {}) => ({
  name: 'SyntheticGraph',
  dataspaceName: 'default',
  status: 'ready',
  id: '0gd000000000001AAA',
  createdDate: '2026-11-01T00:00:00.000Z',
  idDmoName: 'Id__dlm',
  valuesDmoName: 'Values__dlm',
  dayZeroMappingDevName: 'Mapping',
  dayZeroTransformDevName: 'Transform',
  futureSchedule: { cron: 'not modelled' },
  sourceObject: {
    fragmentDMOName: 'Fragment__dlm',
    dependency: [],
    relatedSegments: [],
    fields: [{ name: 'Id__c', dependency: [] }],
    relatedObjects: [],
    ...node,
  },
  ...change,
});
const graphContext = (body) => ({
  orgId: '00D000000000001AAA',
  space: 'default',
  check() {},
  get: async () => ({ status: 200, body: structuredClone(body) }),
});

test('a verbatim graph is deleted by name; another name, dependents or segments still refuse', async () => {
  const run = async (body) => {
    const ledger = [];
    const result = await operateNativeDataGraph(
      verbatim('native-data-graph', 'SyntheticGraph'),
      graphContext(body),
      {
        get: async () => ({ status: 200, body }),
        create: async () => assert.fail('no create'),
        delete: async (name) => {
          ledger.push(`delete:${name}`);
          return { status: 204 };
        },
      },
      { operation: 'delete', preview: false, confirmed: true, verifyInput: async () => {} },
    );
    return { result, ledger };
  };
  const ok = await run(rawGraph());
  assert.deepEqual(ok.result, { outcome: 'deleted', mutation: 'confirmed-deleted' });
  assert.deepEqual(ok.ledger, ['delete:SyntheticGraph']);
  for (const body of [
    rawGraph({ name: 'OtherGraph' }),
    rawGraph({ status: 'editing' }),
    rawGraph({}, { dependency: [{ name: 'Consumer' }] }),
    rawGraph({}, { relatedSegments: [{ name: 'Audience' }] }),
  ]) {
    const refused = await run(body);
    assert.equal(refused.result.outcome, 'blocked');
    assert.deepEqual(refused.ledger, []);
  }
});

/**
 * Delete one calculated insight through the service over one GET answer.
 * @param {object} raw Insight GET.
 * @returns {Promise<{result: object, ledger: string[]}>} Result and DELETE ledger.
 */
const deleteInsight = async (raw) => {
  const ledger = [];
  let deleted = false;
  const result = await deleteCalculatedInsight(
    { apiName: 'Draft__cio', dataSpace: 'default' },
    {},
    selection(),
    'default',
    {
      context: {
        dataSpace: 'default',
        check() {},
        get: async () => {
          if (deleted) throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
          return structuredClone(raw);
        },
      },
      nativeClient: {
        delete: async (name) => {
          ledger.push(`delete:${name}`);
          deleted = true;
        },
      },
      confirmDelete: true,
      verifyInput: async () => {},
      now: () => 0,
      delay: async () => {},
    },
  );
  return { result, ledger };
};

test('a calculated insight without SQL is deleted by name; another name still refuses', async () => {
  // A Visual Builder draft without SQL: the plugin cannot project it.
  const draft = { apiName: 'Draft__cio', dataSpace: 'default', calculatedInsightStatus: 'DRAFT' };
  const ok = await deleteInsight(draft);
  assert.equal(ok.result.outcome, 'deleted', JSON.stringify(ok.result.diagnostics));
  assert.deepEqual(ok.ledger, ['delete:Draft__cio']);
  const other = await deleteInsight({ ...draft, apiName: 'Other__cio' });
  assert.equal(other.result.outcome, 'blocked');
  assert.deepEqual(other.ledger, []);
});

const dloName = 'Loose__dll';
const rawDlo = (change = {}) => ({
  id: '1dl000000000001AAA',
  name: dloName,
  label: 'A data lake object label well beyond forty characters',
  category: '',
  dataSpaceInfo: [{ name: 'default' }],
  futureKey: { kept: true },
  ...change,
});

test('a DLO whose GET the plugin cannot model is deleted; name, data space and ID still refuse', async () => {
  const ledger = [];
  let deleted = false;
  const client = (raw) => ({
    get: async () => {
      if (deleted) throw new DloError('DLO_HTTP_ERROR', 404);
      return structuredClone(raw);
    },
    delete: async (id) => {
      ledger.push(`delete:${id}`);
      deleted = true;
    },
  });
  assert.deepEqual(await previewDeleteNativeDlo(dloName, client(rawDlo()), 'default'), {
    identity: { apiName: dloName, dataSpace: 'default' },
  });
  const receipt = await deleteNativeDlo(dloName, client(rawDlo()), 'default');
  assert.equal(receipt.targetId, '1dl000000000001AAA');
  assert.deepEqual(ledger, ['delete:1dl000000000001AAA']);
  deleted = false;
  ledger.length = 0;
  for (const [change, code] of [
    [{ name: 'Other__dll' }, 'DLO_TARGET_IDENTITY_MISMATCH'],
    [{ dataSpaceInfo: [{ name: 'Other' }] }, 'UNSUPPORTED_DLO_DATASPACE'],
    [{ id: '1dl000000000001' }, 'INVALID_DLO_TARGET_ID'],
  ])
    await assert.rejects(deleteNativeDlo(dloName, client(rawDlo(change)), 'default'), { code });
  assert.deepEqual(ledger, []);
});

const dmoName = 'Loose__dlm';
const rawDmo = (change = {}) => ({
  name: dmoName,
  creationType: 'Custom',
  dataSpaceName: 'default',
  label: '',
  category: JSON.parse('null'),
  fields: [{ name: 'Odd', futureKey: [1] }],
  ...change,
});

test('a DMO whose GET the plugin cannot model is deleted; identity and scope still refuse', async () => {
  const ledger = [];
  let deleted = false;
  const client = (raw) => ({
    get: async () => {
      if (deleted) throw new NativeDmoError('DMO_HTTP_ERROR', 404);
      return structuredClone(raw);
    },
    delete: async (name) => {
      ledger.push(`delete:${name}`);
      deleted = true;
    },
  });
  assert.deepEqual(await previewDeleteNativeDmo(dmoName, client(rawDmo()), 'default'), {
    identity: { apiName: dmoName, dataSpace: 'default' },
  });
  await deleteNativeDmo(dmoName, client(rawDmo({ fields: 'not a list' })), 'default');
  assert.deepEqual(ledger, [`delete:${dmoName}`]);
  deleted = false;
  ledger.length = 0;
  for (const [change, code] of [
    [{ name: 'Other__dlm' }, 'DMO_TARGET_IDENTITY_MISMATCH'],
    [{ name: undefined }, 'DMO_TARGET_IDENTITY_MISMATCH'],
    [{ dataSpaceName: 'Other' }, 'UNSUPPORTED_DMO_DATASPACE'],
  ])
    await assert.rejects(deleteNativeDmo(dmoName, client(rawDmo(change)), 'default'), { code });
  assert.deepEqual(ledger, []);
});

const relationshipEntry = (change = {}) => ({
  name: 'A_BRef_map_B_Id',
  status: 'ACTIVE',
  cardinality: JSON.parse('null'),
  owner: 'FutureOwner',
  sourceObject: { name: 'A__dlm' },
  sourceField: { name: 'BRef__c' },
  targetObject: { name: 'B__dlm' },
  targetField: { name: 'Id__c' },
  ...change,
});

test('a relationship whose values the plugin cannot model is deleted; another binding refuses', async () => {
  const file = {
    schemaVersion: 1,
    kind: 'relationship',
    c__dataSpace: 'default',
    identity: { apiName: 'A_BRef_map_B_Id' },
    spec: {
      sourceObjectName: 'A__dlm',
      sourceFieldName: 'BRef__c',
      targetObjectName: 'B__dlm',
      targetFieldName: 'Id__c',
      cardinality: JSON.parse('null'),
      relationshipOwner: 'FutureOwner',
    },
  };
  const run = async (entry) => {
    const ledger = [];
    let removed = false;
    const result = await deleteNativeRelationship(
      'A_BRef_map_B_Id',
      file,
      {
        list: async () =>
          removed ? { relationships: [], totalSize: 0 } : { relationships: [entry], totalSize: 1 },
        remove: async (name) => {
          ledger.push(`remove:${name}`);
          removed = true;
        },
      },
      'default',
    );
    return { result, ledger };
  };
  const ok = await run(relationshipEntry());
  assert.deepEqual(ok.result, { outcome: 'deleted' });
  assert.deepEqual(ok.ledger, ['remove:A_BRef_map_B_Id']);
  await assert.rejects(run(relationshipEntry({ targetObject: { name: 'C__dlm' } })), {
    code: 'RELATIONSHIP_TARGET_BINDING_MISMATCH',
  });
});

const crmStream = (change = {}) => ({
  name: 'Account_Home',
  recordId: '1ds000000000002AAA',
  label: 'Account Home',
  dataSource: 'Salesforce_Home',
  dataStreamType: 'SFDC',
  connectorInfo: { connectorType: 'SalesforceDotCom' },
  status: 'ACTIVE',
  dataLakeObjectInfo: { name: 'Account_Home__dll', dataSpaceInfo: [{ name: 'default' }] },
  ...change,
});
const ownEntry = { componentType: 'DataStream', id: '1ds000000000002AAA', name: 'Account Home' };

const gone = () => new DataStreamHttpError('STREAM_HTTP_ERROR', 404);

/**
 * Stream delete clients over one CRM stream; after the DELETE the stream (and DLO) read 404.
 * @param {object} raw Stream GET.
 * @param {object[]} dloDependents DLO dependents before the DELETE.
 * @param {string[]} dloSpaces Data spaces the landing DLO reads in.
 * @returns {object} Clients and the call ledger.
 */
function streamClients(raw, dloDependents = [ownEntry], dloSpaces = ['default']) {
  const ledger = [];
  let deleted = false;
  return {
    ledger,
    clients: {
      streams: {
        get: async () => {
          if (deleted) throw gone();
          return structuredClone(raw);
        },
        list: async () => assert.fail('no list'),
        delete: async (id, cascade) => {
          ledger.push(`delete:${id}:${cascade}`);
          deleted = true;
        },
      },
      connections: {},
      dependencies: {
        stream: async () => ({ dependencies: [], totalSize: 0 }),
        dlo: async () =>
          deleted
            ? { dependencies: [], totalSize: 0 }
            : { dependencies: dloDependents, totalSize: dloDependents.length },
      },
      dlo: {
        get: async (name) => {
          if (deleted) throw gone();
          return {
            dataLakeObjects: [{ name, dataSpaceInfo: dloSpaces.map((space) => ({ name: space })) }],
          };
        },
      },
    },
  };
}

test('a stream the plugin cannot model is deleted by name; dependents and status still refuse', async () => {
  for (const deleteDlo of [false, true]) {
    const { clients, ledger } = streamClients(crmStream());
    const receipt = await deleteNativeDataStream('Account_Home', clients, {
      deleteDlo,
      survivorDloNames: [],
      verifyInput: async () => {},
      now: () => 0,
      wait: async () => {},
    });
    assert.deepEqual(receipt, {
      operation: 'delete',
      targetApiName: 'Account_Home',
      targetDloName: 'Account_Home__dll',
    });
    assert.deepEqual(ledger, [`delete:1ds000000000002AAA:${deleteDlo}`]);
  }
  for (const [raw, dependents, code] of [
    [
      crmStream(),
      [ownEntry, { componentType: 'Mapping', name: 'Other' }],
      'STREAM_DELETE_DEPENDENCIES_BLOCKED',
    ],
    [crmStream({ status: 'PROCESSING' }), [ownEntry], 'STREAM_NOT_READY'],
    [
      crmStream({ dataLakeObjectInfo: { name: 'X__dll', dataSpaceInfo: [{ name: 'Other' }] } }),
      [ownEntry],
      'UNSUPPORTED_STREAM_DATASPACE',
    ],
  ]) {
    const { clients, ledger } = streamClients(raw, dependents);
    await assert.rejects(
      deleteNativeDataStream('Account_Home', clients, {
        deleteDlo: false,
        survivorDloNames: [],
        verifyInput: async () => {},
      }),
      { code },
    );
    assert.deepEqual(ledger, []);
  }
});

test('an unmodelled stream is not deleted with a landing DLO that belongs to other data spaces too', async () => {
  const { clients, ledger } = streamClients(crmStream(), [ownEntry], ['default', 'dataspace2']);
  await assert.rejects(
    deleteNativeDataStream('Account_Home', clients, {
      deleteDlo: true,
      survivorDloNames: [],
      verifyInput: async () => {},
    }),
    { code: 'DLO_DELETE_OTHER_DATASPACES' },
  );
  assert.deepEqual(ledger, []);
  // Without --delete-dlo the DLO stays, so its data spaces do not matter.
  const kept = streamClients(crmStream(), [ownEntry], ['default', 'dataspace2']);
  await deleteNativeDataStream('Account_Home', kept.clients, {
    deleteDlo: false,
    survivorDloNames: [],
    verifyInput: async () => {},
    now: () => 0,
    wait: async () => {},
  });
  assert.deepEqual(kept.ledger, ['delete:1ds000000000002AAA:false']);
  // A DLO read that holds no DLO, or several, says nothing about its data spaces: refused.
  for (const dataLakeObjects of [[], [{ name: 'A__dll' }, { name: 'B__dll' }]]) {
    const odd = streamClients(crmStream(), [ownEntry]);
    odd.clients.dlo.get = async () => ({ dataLakeObjects });
    await assert.rejects(
      deleteNativeDataStream('Account_Home', odd.clients, {
        deleteDlo: true,
        survivorDloNames: [],
        verifyInput: async () => {},
      }),
      { code: 'INVALID_STREAM_DLO' },
    );
    assert.deepEqual(odd.ledger, []);
  }
});

test('-m delete of a GET the plugin cannot model goes by name; a graph of another name refuses', async () => {
  const command = Object.create(Delete.prototype);
  // A graph with a shape the projection refuses still has a by-name definition.
  const unprojectable = rawGraph({ sourceObject: 'not a node' });
  command.nativeGraphContext = async () => graphContext(unprojectable);
  const admitted = await command.readDeleteSource('data-graph', 'SyntheticGraph', {});
  assert.equal(admitted.desired.kind, 'native-data-graph');
  assert.equal(admitted.desired.c__dataSpace, 'default');
  assert.deepEqual(admitted.desired.identity, { apiName: 'SyntheticGraph' });
  for (const body of [
    rawGraph({ name: 'OtherGraph' }),
    rawGraph({ sourceObject: 'x', name: 'Other' }),
  ]) {
    command.nativeGraphContext = async () => graphContext(body);
    await assert.rejects(command.readDeleteSource('data-graph', 'SyntheticGraph', {}), {
      code: 'DATA_GRAPH_IDENTITY_MISMATCH',
    });
  }
  // A UI segment read with -m is a by-name definition too.
  const segment = connection(() => uiSegment());
  const ui = await command.readDeleteSource('segment', 'Audience', segment.value);
  assert.equal(ui.desired.kind, 'segment');
  assert.equal(ui.desired.verbatim.reason, 'UNSUPPORTED_SEGMENT_VARIANT');
  // A segment answering with another name is not.
  const other = connection(() => uiSegment({ apiName: 'Other' }));
  await assert.rejects(command.readDeleteSource('segment', 'Audience', other.value), {
    code: 'SEGMENT_IDENTITY_MISMATCH',
  });
});

test('a draft graph (no ID or created date) is deleted by name, from its file or with -m', async () => {
  // A draft GET in the live API68 shape: status draft, no id, createdDate or generated names.
  const draft = {
    name: 'SyntheticGraph',
    dataspaceName: 'default',
    status: 'draft',
    type: 'none',
    lastRunStatus: 'none',
    primaryObjectName: 'Root__dlm',
    sourceObject: {
      name: 'Root__dlm',
      dependency: [],
      relatedSegments: [],
      fields: [{ sourceFieldName: 'Id__c', dependency: [] }],
      relatedObjects: [],
    },
  };
  const run = async (body, preview = false) => {
    const ledger = [];
    const result = await operateNativeDataGraph(
      verbatim('native-data-graph', 'SyntheticGraph'),
      graphContext(body),
      {
        get: async () => ({ status: 200, body }),
        create: async () => assert.fail('no create'),
        delete: async (name) => {
          ledger.push(`delete:${name}`);
          return { status: 204 };
        },
      },
      { operation: 'delete', preview, confirmed: true, verifyInput: async () => {} },
    );
    return { result, ledger };
  };
  const previewed = await run(draft, true);
  assert.deepEqual(previewed.result, {
    outcome: 'delete',
    mutation: 'not-attempted',
  });
  const ok = await run(draft);
  assert.deepEqual(ok.result, { outcome: 'deleted', mutation: 'confirmed-deleted' });
  assert.deepEqual(ok.ledger, ['delete:SyntheticGraph']);
  // The delete safeguards still apply to a draft.
  for (const body of [
    { ...draft, dataspaceName: 'other' },
    { ...draft, sourceObject: { ...draft.sourceObject, relatedSegments: [{ name: 'Audience' }] } },
    // A ready graph still needs its ID and created date.
    { ...draft, status: 'ready' },
  ]) {
    const refused = await run(body);
    assert.equal(refused.result.outcome, 'blocked');
    assert.deepEqual(refused.ledger, []);
  }
  // -m reads the draft by name and deletes it like its verbatim file.
  const command = Object.create(Delete.prototype);
  command.nativeGraphContext = async () => graphContext(draft);
  const admitted = await command.readDeleteSource('data-graph', 'SyntheticGraph', {});
  assert.equal(admitted.desired.kind, 'native-data-graph');
  assert.equal(admitted.desired.c__dataSpace, 'default');
  assert.deepEqual(admitted.desired.identity, { apiName: 'SyntheticGraph' });
  assert.equal(admitted.desired.verbatim.reason, 'DATA_GRAPH_DRAFT');
});
