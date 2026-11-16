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
import { retrieveNativeDataStream } from '../lib/services/native-data-stream.js';
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
const crmStream = () => ({
  name: 'Account_Home',
  recordId: '1ds000000000002AAA',
  label: 'Account Home',
  dataSource: 'Salesforce_Home',
  dataStreamType: 'SFDC',
  connectorInfo: { connectorType: 'SalesforceDotCom', connectorDetails: { object: 'Account' } },
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
  command.acquireDataStream = retrieveNativeDataStream;
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

test('a CRM-connector stream is written as its GET without connection or schema reads', async () => {
  const stream = crmStream();
  const { result, cwd, calls } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(calls, ['streams.get']);
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNSUPPORTED_STREAM_CONNECTOR' });
  assert.match(result.diagnostics.warnings.join('\n'), /UNSUPPORTED_STREAM_CONNECTOR/u);
  const saved = JSON.parse(await readFile(streamFile(cwd, 'Account_Home'), 'utf8'));
  assert.equal(saved.kind, 'data-stream');
  assert.deepEqual(saved.identity, { dataSpace: 'default', apiName: 'Account_Home' });
  assert.deepEqual(saved.verbatim.native, sortKeysDeep(stream));
  await assert.rejects(readDeployInputs({ cwd, metadata: ['data-stream:Account_Home'] }), {
    code: 'VERBATIM_NOT_DEPLOYABLE',
  });
});

test('each IngestApi variant the file cannot hold is named from the stream GET alone', async () => {
  const cases = [
    [(s) => (s.refreshConfig.refreshMode = 'FULL_REFRESH'), 'UNSUPPORTED_STREAM_REFRESH'],
    [(s) => (s.dataLakeObjectInfo.category = 'Engagement'), 'UNSUPPORTED_STREAM_CATEGORY'],
    [(s) => (s.sourceFields[1].datatype = 'Number'), 'UNSUPPORTED_STREAM_FIELD_TYPE'],
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

test('a stream whose DLO is in another data space stays an item failure', async () => {
  const stream = crmStream();
  stream.dataLakeObjectInfo.dataSpaceInfo = [{ name: 'Europe' }];
  const { result, cwd, calls } = await retrieveCommand(stream);
  assert.equal(result.status, 'failed');
  assert.deepEqual(calls, ['streams.get']);
  assert.equal(result.diagnostics.errors[0].code, 'UNSUPPORTED_STREAM_DATASPACE');
  assert.equal(result.result.items.length, 0);
  await assert.rejects(stat(streamFile(cwd, 'Account_Home')), { code: 'ENOENT' });
});

test('an IngestApi stream with a real formula is written as its GET', async () => {
  const stream = ingestStream();
  stream.mappings.push({ formula: 'UPPER(ProbeValue)', targetFieldName: 'Upper' });
  stream.dataLakeObjectInfo.fields.push({
    name: 'Upper',
    label: 'Upper',
    dataType: 'Text',
    isPrimaryKey: false,
  });
  const { result, cwd } = await retrieveCommand(stream);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNSUPPORTED_STREAM_PROJECTION' });
  const saved = JSON.parse(await readFile(streamFile(cwd, 'GeneratedStream'), 'utf8'));
  assert.deepEqual(saved.verbatim.native, sortKeysDeep(stream));
  await assert.rejects(readDeployInputs({ cwd, metadata: ['data-stream:GeneratedStream'] }), {
    code: 'VERBATIM_NOT_DEPLOYABLE',
  });
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
  assert.deepEqual(saved.verbatim.native, sortKeysDeep(ingestStream()));
});
