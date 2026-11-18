import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { validateDataStreamDocument } from '../lib/artifacts/data-stream-document.js';
import { writeDataStreamDocument } from '../lib/artifacts/write-data-stream.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { sortKeysDeep } from '../lib/artifacts/verbatim-document.js';
import {
  retrieveNativeDataStream,
  sortedStreamMappings,
} from '../lib/services/native-data-stream.js';
import { retrieveDataStreamDocument } from '../lib/services/native-crm-data-stream.js';
import { DataStreamHttpError } from '../lib/transport/data-stream-rest.js';

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lenient-stream-'));
const connection = {
  name: 'SyntheticConnection',
  id: '1WM000000000001AAA',
  connectorType: 'IngestApi',
  status: 'CONNECTED',
};
const fields = ['ProbeId', 'ProbeValue'].map((name) => ({ name, label: name, dataType: 'Text' }));
const ingestStream = () => ({
  name: 'GeneratedStream',
  recordId: '1ds000000000001AAA',
  label: 'Generated label',
  dataSource: connection.name,
  dataStreamType: 'INGESTAPI',
  connectorInfo: { connectorType: 'IngestApi' },
  status: 'ACTIVE',
  refreshConfig: { refreshMode: 'UPSERT' },
  sourceFields: fields.map(({ name }) => ({ name, datatype: 'Text' })),
  mappings: [
    { sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' },
    { sourceFieldName: 'ProbeValue', targetFieldName: 'ProbeValue' },
    { formula: '&quot;SyntheticConnection&quot;', targetFieldName: 'DataSource' },
    { formula: '&quot;GeneratedStream&quot;', targetFieldName: 'DataSourceObject' },
  ],
  dataLakeObjectInfo: {
    name: 'ActualDlo__dll',
    label: 'Actual DLO',
    category: 'Other',
    dataSpaceInfo: [{ name: 'default' }],
    fields: [
      ...fields.map((field) => ({ ...field, isPrimaryKey: field.name === 'ProbeId' })),
      ...['KQ_ProbeId', 'DataSource', 'DataSourceObject'].map((name) => ({
        name,
        label: name,
        dataType: 'Text',
        isPrimaryKey: false,
      })),
    ],
  },
});
// A stream of another connector than the Ingestion API: written as the GET-shaped file.
const s3Stream = () => ({
  name: 'Account_Home',
  recordId: '1ds000000000002AAA',
  label: 'Account Home',
  dataSource: 'AmazonS3_Home',
  dataStreamType: 'S3',
  connectorInfo: { connectorType: 'S3', connectorDetails: { object: 'Account' } },
  status: 'ACTIVE',
  refreshConfig: { refreshMode: 'FULL_REFRESH', frequency: { frequencyType: 'Daily' } },
  sourceFields: [{ name: 'AnnualRevenue', datatype: 'Number' }],
  mappings: [{ sourceFieldName: 'AnnualRevenue', targetFieldName: 'AnnualRevenue' }],
  dataLakeObjectInfo: {
    name: 'Account_Home__dll',
    label: 'Account Home',
    category: 'Profile',
    dataSpaceInfo: [{ name: 'default' }],
    fields: [],
  },
});

// A stream GET that names no connector type: no stream file can hold it.
const untyped = () => ({ ...s3Stream(), connectorInfo: {} });

/**
 * Offline read clients over one stream; every read is recorded.
 * @param {object} stream Stream GET response.
 * @param {object} [connectionDetail] Connection read by ID.
 * @returns {{clients: object, calls: string[]}} Clients and observed reads.
 */
function reads(stream, connectionDetail = connection) {
  const calls = [];
  const schemas = {
    schemas: [
      {
        name: 'ProbeEvent',
        schemaType: 'IngestApi',
        availabilityStatus: 'In Use',
        fields: structuredClone(fields),
      },
    ],
  };
  const clients = {
    streams: {
      list: async () => {
        calls.push('streams.list');
        return [structuredClone(stream)];
      },
      get: async (name) => {
        calls.push('streams.get');
        if (name === stream.name) return structuredClone(stream);
        throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
      },
    },
    connections: {
      list: async () => {
        calls.push('connections.list');
        return { connections: [structuredClone(connection)] };
      },
      get: async () => {
        calls.push('connections.get');
        return structuredClone(connectionDetail);
      },
      schema: async () => {
        calls.push('connections.schema');
        return structuredClone(schemas);
      },
    },
    dependencies: {},
    dlo: {
      get: async () => {
        calls.push('dlo.get');
        return {
          dataLakeObjects: [
            {
              ...structuredClone(stream.dataLakeObjectInfo),
              id: '1dl000000000001AAA',
              fields: stream.dataLakeObjectInfo.fields.map((field) => ({
                ...field,
                name: `${field.name}__c`,
              })),
            },
          ],
        };
      },
    },
  };
  return { clients, calls };
}

/**
 * Retrieve one stream through the command with offline clients and the real writer.
 * @param {object} stream Stream GET response.
 * @param {object} [connectionDetail] Connection read by ID.
 * @returns {Promise<object>} Envelope, output root and observed reads.
 */
async function retrieveCommand(stream, connectionDetail) {
  const cwd = await scratch();
  const { clients, calls } = reads(stream, connectionDetail);
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '68.0',
      'target-org': 'synthetic',
      metadata: [`data-stream:${stream.name}`],
      'output-dir': cwd,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'synthetic' }),
  });
  command.createDataStreamClients = () => clients;
  command.acquireDataStream = retrieveDataStreamDocument;
  command.writeDataStream = writeDataStreamDocument;
  const before = process.exitCode;
  try {
    const result = await command.run();
    return { result, cwd, calls };
  } finally {
    process.exitCode = before;
  }
}

const streamFile = (cwd, name) =>
  path.join(cwd, 'data360', 'data-stream', `${name}.data-stream-meta.json`);
// An as-is stream file keeps the GET with its mappings in a stable order.
const asIs = (stream) =>
  sortKeysDeep({ ...stream, mappings: sortedStreamMappings(stream.mappings) });
const savedBytes = (run) => readFile(streamFile(run.cwd, 'Account_Home'), 'utf8');

test('an S3-connector stream is written as a deployable GET-shaped file without connection or schema reads', async () => {
  const stream = s3Stream();
  const { result, cwd, calls } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(calls, ['streams.get']);
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'Account_Home'), 'utf8'));
  assert.equal(saved.kind, 'data-stream');
  assert.deepEqual(saved.identity, { dataSpace: 'default', apiName: 'Account_Home' });
  assert.equal(saved.spec.connectorInfo.connectorType, 'S3');
  assert.equal(saved.spec.refreshConfig.refreshMode, 'FULL_REFRESH');
  assert.equal(saved.spec.recordId, undefined);
  const inputs = await readDeployInputs({ cwd, metadata: ['data-stream:Account_Home'] });
  assert.equal(inputs.length, 1);
});

test('a stream GET that names no connector type is written as-is', async () => {
  const stream = s3Stream();
  stream.connectorInfo = {};
  const { result, cwd, calls } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(calls, ['streams.get']);
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNSUPPORTED_STREAM_CONNECTOR' });
  assert.match(result.diagnostics.warnings.join('\n'), /UNSUPPORTED_STREAM_CONNECTOR/u);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'Account_Home'), 'utf8'));
  assert.deepEqual(saved.verbatim.native, asIs(stream));
  await assert.rejects(readDeployInputs({ cwd, metadata: ['data-stream:Account_Home'] }), {
    code: 'VERBATIM_NOT_DEPLOYABLE',
  });
});

test('an as-is stream file does not change when Salesforce reorders its mappings', async () => {
  const pairs = [
    { sourceFieldName: 'Name', targetFieldName: 'Name' },
    { sourceFieldName: 'AnnualRevenue', targetFieldName: 'AnnualRevenue' },
    { sourceFieldName: 'Id', targetFieldName: 'Id' },
  ];
  const first = await retrieveCommand({ ...untyped(), mappings: pairs });
  const second = await retrieveCommand({ ...untyped(), mappings: pairs.toReversed() });
  assert.equal(await savedBytes(first), await savedBytes(second));
  const saved = JSON.parse(await savedBytes(first));
  assert.deepEqual(
    saved.verbatim.native.mappings.map((mapping) => mapping.targetFieldName),
    ['AnnualRevenue', 'Id', 'Name'],
  );
});

test('each IngestApi variant the file cannot hold is named from the stream GET alone', async () => {
  const cases = [
    [(s) => (s.dataStreamType = 'EVENTS'), 'UNSUPPORTED_STREAM_CONNECTOR'],
    [(s) => (s.connectorInfo.connectorType = 'S3'), 'UNSUPPORTED_STREAM_CONNECTOR'],
  ];
  for (const [change, code] of cases) {
    const stream = ingestStream();
    change(stream);
    const { clients, calls } = reads(stream);
    await assert.rejects(
      retrieveNativeDataStream(stream.name, clients, 'default', false, 'retrieve'),
      { code },
    );
    assert.deepEqual(calls, ['streams.get'], code);
  }
});

test('an Ingestion API stream with another refresh mode, no DLO category and additive mappings of both read shapes retrieves to a deployable file', async () => {
  const stream = ingestStream();
  stream.refreshConfig.refreshMode = 'PARTIAL_UPDATE';
  delete stream.dataLakeObjectInfo.category;
  // A create-time addition reads back as a plain source mapping, a PATCH-added one as its label.
  stream.mappings.push(
    { sourceFieldName: 'ProbeValue', targetFieldName: 'ValueCopy' },
    { formula: 'ProbeValue', targetFieldName: 'ValueNumber' },
  );
  stream.dataLakeObjectInfo.fields.push(
    { name: 'ValueCopy', label: 'ValueCopy', dataType: 'Text', isPrimaryKey: false },
    { name: 'ValueNumber', label: 'ValueNumber', dataType: 'Number', isPrimaryKey: false },
  );
  const { result, cwd } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'GeneratedStream'), 'utf8'));
  assert.equal(saved.spec.refreshMode, 'PARTIAL_UPDATE');
  assert.equal(Object.hasOwn(saved.spec.newDlo, 'category'), false);
  assert.deepEqual(saved.spec.additiveFieldMappings, [
    { sourceFieldLabel: 'ProbeValue', targetFieldName: 'ValueCopy', targetFieldReturntype: 'Text' },
    {
      sourceFieldLabel: 'ProbeValue',
      targetFieldName: 'ValueNumber',
      targetFieldReturntype: 'Number',
    },
  ]);
  assert.equal(saved.spec.formulaMappings, undefined);
  assert.deepEqual(validateDataStreamDocument(saved), saved);
});

test('an additive mapping from a label several event fields share is not projected into a file', async () => {
  const stream = ingestStream();
  stream.mappings.push({ sourceFieldName: 'ProbeValue', targetFieldName: 'ValueCopy' });
  stream.dataLakeObjectInfo.fields.push({
    name: 'ValueCopy',
    label: 'ValueCopy',
    dataType: 'Text',
    isPrimaryKey: false,
  });
  const { clients } = reads(stream);
  const schema = clients.connections.schema;
  clients.connections.schema = async () => {
    const answer = await schema();
    for (const field of answer.schemas[0].fields) field.label = 'Shared';
    return answer;
  };
  await assert.rejects(
    retrieveNativeDataStream(stream.name, clients, 'default', false, 'retrieve'),
    { code: 'UNSUPPORTED_STREAM_PROJECTION' },
  );
});

test('a stream whose DLO is in another data space stays an item failure', async () => {
  const stream = s3Stream();
  stream.dataLakeObjectInfo.dataSpaceInfo = [{ name: 'Europe' }];
  const { result, cwd, calls } = await retrieveCommand(stream);
  assert.equal(result.status, 'failed');
  assert.deepEqual(calls, ['streams.get']);
  assert.equal(result.diagnostics.errors[0].code, 'UNSUPPORTED_STREAM_DATASPACE');
  assert.equal(result.result.items.length, 0);
  await assert.rejects(stat(streamFile(cwd, 'Account_Home')), { code: 'ENOENT' });
});

test('an IngestApi stream with a real formula is written as a stream file that deploys', async () => {
  const stream = ingestStream();
  stream.mappings.push({
    formula: 'UPPER(sourceField[&#39;ProbeValue&#39;])',
    targetFieldName: 'Upper',
  });
  stream.dataLakeObjectInfo.fields.push({
    name: 'Upper',
    label: 'Upper',
    dataType: 'Text',
    isPrimaryKey: false,
  });
  const { result, cwd } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'GeneratedStream'), 'utf8'));
  assert.deepEqual(saved.spec.formulaMappings, [
    {
      targetFieldName: 'Upper',
      formula: "UPPER(sourceField['ProbeValue'])",
      targetFieldReturntype: 'Text',
    },
  ]);
  const inputs = await readDeployInputs({ cwd, metadata: ['data-stream:GeneratedStream'] });
  assert.ok(inputs);
});

/**
 * An Engagement stream with non-Text fields and a formula, one of two streams on its connection.
 * @param {string} event Event name.
 * @param {string} hash Generated name suffix.
 * @returns {object} Stream GET.
 */
function engagementStream(event, hash) {
  const name = `CliConn_${event}_${hash}`;
  const typed = [
    ['EventId', 'Text'],
    ['EventTime', 'DateTime'],
    ['Score', 'Number'],
  ];
  return {
    ...ingestStream(),
    name,
    label: `CliConn-${event}`,
    sourceFields: typed.map(([field, datatype]) => ({ name: field, datatype })),
    mappings: [
      ...typed.map(([field]) => ({ sourceFieldName: field, targetFieldName: field })),
      { formula: '&quot;SyntheticConnection&quot;', targetFieldName: 'DataSource' },
      { formula: `&quot;${name}&quot;`, targetFieldName: 'DataSourceObject' },
      {
        formula:
          'if(ISEMPTY(formulaField[&#39;EventTime__c&#39;])) { null; } else { DAYPRECISION(formulaField[&#39;EventTime__c&#39;]); }',
        targetFieldName: 'cdp_sys_PartitionDate',
      },
      { formula: 'sourceField[&#39;Score&#39;] * 2', targetFieldName: 'ScoreX2' },
    ],
    dataLakeObjectInfo: {
      name: `${name}__dll`,
      label: event,
      category: 'Engagement',
      eventDateTimeFieldName: 'EventTime',
      dataSpaceInfo: [{ name: 'default' }],
      fields: [
        ...typed.map(([field, dataType]) => ({
          name: field,
          label: field,
          dataType,
          isPrimaryKey: field === 'EventId',
        })),
        ...[
          ['KQ_EventId', 'Text'],
          ['DataSource', 'Text'],
          ['DataSourceObject', 'Text'],
          ['cdp_sys_PartitionDate', 'DateTime'],
          ['cdp_sys_SourceVersion', 'Text'],
          ['ScoreX2', 'Number'],
        ].map(([field, dataType]) => ({
          name: field,
          label: field,
          dataType,
          isPrimaryKey: false,
        })),
      ],
    },
  };
}

test('an Engagement stream with typed fields and a formula, one of two on its connection, retrieves to a stream file', async () => {
  const first = engagementStream('CliEvA', '1A2B3C4D');
  const second = engagementStream('CliEvB', '5E6F7A8B');
  const { clients } = reads(first);
  const schema = (event) => ({
    name: event,
    schemaType: 'IngestApi',
    availabilityStatus: 'In Use',
    fields: first.sourceFields.map((field) => ({
      name: field.name,
      label: field.name,
      dataType: field.datatype,
    })),
  });
  // Both events have the same fields: the stream is matched to its event by its generated name.
  clients.connections.schema = async () => ({ schemas: [schema('CliEvA'), schema('CliEvB')] });
  clients.streams.list = async () => [structuredClone(second), structuredClone(first)];
  const document = await retrieveNativeDataStream(
    first.name,
    clients,
    'default',
    false,
    'retrieve',
  );
  assert.equal(document.spec.event, 'CliEvA');
  assert.deepEqual(document.spec.newDlo, {
    name: first.dataLakeObjectInfo.name,
    label: 'CliEvA',
    category: 'Engagement',
    eventDateTimeFieldName: 'EventTime',
    primaryKey: { name: 'EventId', label: 'EventId', dataType: 'Text' },
  });
  assert.deepEqual(document.spec.additiveFieldMappings, []);
  assert.deepEqual(document.spec.formulaMappings, [
    {
      targetFieldName: 'ScoreX2',
      formula: "sourceField['Score'] * 2",
      targetFieldReturntype: 'Number',
    },
  ]);
  // The same deploy-mode read admits it, so the file deploys.
  const strict = await retrieveNativeDataStream(first.name, clients);
  assert.deepEqual(strict.spec, document.spec);
  // A stream no event name or label fits stays as-is with the event reason.
  const unmatched = engagementStream('Other', '00000000');
  unmatched.label = 'Renamed';
  const { clients: other } = reads(unmatched);
  other.connections.schema = clients.connections.schema;
  await assert.rejects(
    retrieveNativeDataStream(unmatched.name, other, 'default', false, 'retrieve'),
    { code: 'AMBIGUOUS_STREAM_EVENT' },
  );
});

test('retrieve keeps unknown mapping and source field keys and a long DLO label; deploy names the key', async () => {
  const stream = ingestStream();
  stream.mappings[0].futureKey = { nested: true };
  stream.sourceFields[0].label = 'Probe Id';
  stream.dataLakeObjectInfo.label = 'A landing DLO label well beyond forty characters';
  // Deploy mode refuses the same reads.
  await assert.rejects(retrieveNativeDataStream(stream.name, reads(stream).clients), {
    code: 'INVALID_STREAM_LABEL',
  });
  const { result, cwd } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'GeneratedStream'), 'utf8'));
  assert.equal(saved.verbatim, undefined);
  const kept = saved.observed.mappings.find((entry) => entry.targetFieldName === 'ProbeId');
  assert.deepEqual(kept.futureKey, { nested: true });
  assert.equal(saved.observed.sourceFields[0].label, 'Probe Id');
  assert.equal(saved.spec.newDlo.label, stream.dataLakeObjectInfo.label);
  const index = saved.observed.mappings.indexOf(kept);
  // Deploy names the first key path it refuses: the label, then the unknown mapping key.
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['data-stream:GeneratedStream'] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      error.message.includes(
        'The data stream file cannot be deployed: spec.newDlo.label is longer than 40 characters',
      ),
  );
  // Deploy never sends `observed`, so the kept mapping key does not block it.
  saved.spec.newDlo.label = 'Actual DLO';
  assert.deepEqual(validateDataStreamDocument(saved).observed.mappings[index].futureKey, {
    nested: true,
  });
});

const validStream = () => ({
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'GeneratedStream', dataSpace: 'default' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: 'SyntheticConnection',
    event: 'ProbeEvent',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Generated label',
    newDlo: {
      name: 'ActualDlo__dll',
      label: 'Actual DLO',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
  observed: {
    mappings: [{ formula: 'ProbeValue', targetFieldName: 'AddedValue' }],
    sourceFields: [{ name: 'ProbeId', datatype: 'Text' }],
    dloFields: [],
    actualDloName: 'ActualDlo__dll',
  },
});

test('deploy validation names the key path of each limit retrieve lifts', () => {
  validateDataStreamDocument(validStream());
  const long = `Label ${'x'.repeat(600)}`;
  const cases = [
    [
      (d) => (d.observed.mappings[0].formula = long),
      'INVALID_STREAM_DOCUMENT',
      /observed\.mappings\[0\]\.formula is longer than 500/u,
    ],
    [
      (d) => (d.spec.newDlo.label = 'x'.repeat(41)),
      'INVALID_STREAM_LABEL',
      /spec\.newDlo\.label is longer than 40/u,
    ],
    [(d) => (d.spec.label = long), 'INVALID_STREAM_DOCUMENT', /spec\.label is longer than 500/u],
  ];
  for (const [change, code, message] of cases) {
    const document = validStream();
    change(document);
    assert.throws(
      () => validateDataStreamDocument(document),
      (error) => error.code === code && message.test(error.message),
    );
    // Retrieve mode keeps each of them.
    assert.deepEqual(validateDataStreamDocument(document, 'retrieve'), document);
  }
  // Deploy ignores `observed`: unknown keys anywhere inside it are kept in both modes.
  const observed = validStream();
  observed.observed.mappings[0].extra = 1;
  observed.observed.sourceFields[0].label = 'x';
  observed.observed.dloFields.push({
    name: 'ProbeId',
    label: 'ProbeId',
    dataType: 'Text',
    isPrimaryKey: true,
    status: 'ACTIVE',
  });
  observed.observed.futureSection = { kept: true };
  for (const mode of ['deploy', 'retrieve'])
    assert.deepEqual(validateDataStreamDocument(observed, mode), observed);
  // An unknown key outside `observed` stays refused in both modes.
  const other = validStream();
  other.spec.extra = 1;
  assert.throws(() => validateDataStreamDocument(other, 'retrieve'), /spec\.extra is not a key/u);
});

test('a stream whose connection is not CONNECTED is written verbatim, not refused', async () => {
  const { result, cwd } = await retrieveCommand(ingestStream(), {
    ...connection,
    status: 'DISCONNECTED',
  });
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'STREAM_CONNECTION_MISMATCH' });
  const saved = JSON.parse(await readFile(streamFile(cwd, 'GeneratedStream'), 'utf8'));
  assert.deepEqual(saved.verbatim.native, asIs(ingestStream()));
});
