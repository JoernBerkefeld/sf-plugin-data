import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { writeDataStreamDocument } from '../lib/artifacts/write-data-stream.js';
import {
  crmDataStreamWriteBody,
  validateCrmDataStreamDocument,
} from '../lib/artifacts/data-stream-document.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { streamLandingDlo } from '../lib/services/crud-plan.js';
import {
  executeDataStream,
  executeDeleteDataStream,
  preflightDataStream,
} from '../lib/services/command-native-data-stream.js';
import {
  projectCrmDataStream,
  retrieveDataStreamDocument,
} from '../lib/services/native-crm-data-stream.js';
import { createDataStreamClient, DataStreamHttpError } from '../lib/transport/data-stream-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-crm-stream-'));
const recordId = '1ds000000000003AAA';
const field = (name, label, dataType, isPrimaryKey = false) => ({
  dataType,
  isPrimaryKey,
  label,
  name,
});
// The GET of the live CRM probe on Pricebook2 (identifiers replaced), read as plain text.
const crmGet = () => ({
  advancedAttributes: {},
  capabilities: {},
  connectorInfo: {
    connectorDetails: {
      name: 'SalesforceDotCom_Home',
      sourceObject: 'Pricebook2',
      type: 'SalesforceDotCom',
    },
    connectorType: 'SalesforceDotCom',
  },
  dataAccessMode: 'INGEST',
  dataLakeObjectInfo: {
    capabilities: {},
    category: 'Other',
    columnMappingProperties: {},
    dataLakeFieldInfoRepresentation: [field('KQ_Id', 'KQ_Id', 'Text')],
    dataSpaceInfo: [{ label: 'default', name: 'default' }],
    fields: [
      field('KQ_Id', 'KQ_Id', 'Text'),
      field('Id', 'Price Book ID', 'Text', true),
      field('SfdcOrganizationId', 'SfdcOrganizationId', 'Text'),
      field('IsActive', 'Active', 'Text'),
      field('DataSource', 'Data Source', 'Text'),
      field('DataSourceObject', 'Data Source Object', 'Text'),
      field('Name', 'Price Book Name', 'Text'),
      field('SystemModstamp', 'System Modstamp', 'DateTime'),
      field('CliNameUpper', 'CliNameUpper', 'Text'),
      field('LastModifiedDate', 'Last Modified Date', 'DateTime'),
      field('cdp_sys_SourceVersion', 'cdp_sys_SourceVersion', 'Text'),
    ],
    id: '0gO000000000001AAA',
    label: 'CliCrmPb2',
    name: 'CliCrmPb2__dll',
    recordModifiedFieldName: 'SystemModstamp',
    status: 'ACTIVE',
  },
  dataSource: 'Salesforce_Home',
  dataStreamType: 'SFDC',
  isEnabled: true,
  label: 'CliCrmPb2',
  lastRunStatus: 'NONE',
  mappings: [
    { sourceFieldName: 'Id', targetFieldName: 'Id' },
    { sourceFieldName: 'IsActive', targetFieldName: 'IsActive' },
    { sourceFieldName: 'Name', targetFieldName: 'Name' },
    { formula: "UPPER(sourceField['Name'])", targetFieldName: 'CliNameUpper' },
    { formula: '"Salesforce_Home"', targetFieldName: 'DataSource' },
    { sourceFieldName: 'LastModifiedDate', targetFieldName: 'LastModifiedDate' },
    { sourceFieldName: 'SfdcOrganizationId', targetFieldName: 'SfdcOrganizationId' },
    { formula: '"Pricebook2"', targetFieldName: 'DataSourceObject' },
    { sourceFieldName: 'SystemModstamp', targetFieldName: 'SystemModstamp' },
  ],
  name: 'CliCrmPb2',
  recordId,
  refreshConfig: {
    frequency: { frequencyType: 'BATCH', hours: [], refreshDayOfMonth: [] },
    fullRefreshIntervalDays: 'DAYS_10',
    hasHeaders: false,
    isAccelerationEnabled: false,
    refreshMode: 'UPSERT',
    shouldFetchImmediately: false,
    shouldTreatMissingFilesAsFailures: false,
  },
  sourceFields: [
    { datatype: 'Text', name: 'Id' },
    { datatype: 'Text', name: 'Name' },
    { datatype: 'Text', name: 'SfdcOrganizationId' },
    { datatype: 'DateTime', format: "yyyy-MM-dd'T'HH:mm:ss", name: 'LastModifiedDate' },
    { datatype: 'DateTime', format: "yyyy-MM-dd'T'HH:mm:ss", name: 'SystemModstamp' },
    { datatype: 'Text', name: 'IsActive' },
  ],
  status: 'ACTIVE',
});
// The create body Salesforce accepted (201) for that stream.
const provenCreateBody = {
  name: 'CliCrmPb2',
  label: 'CliCrmPb2',
  datastreamType: 'SFDC',
  dataAccessMode: 'INGEST',
  connectorInfo: {
    connectorType: 'SalesforceDotCom',
    connectorDetails: { name: 'SalesforceDotCom_Home', sourceObject: 'Pricebook2' },
  },
  dataLakeObjectInfo: {
    name: 'CliCrmPb2__dll',
    label: 'CliCrmPb2',
    category: 'Other',
    dataspaceInfo: [{ name: 'default' }],
    dataLakeFieldInputRepresentations: [
      field('Id', 'Price Book ID', 'Text', true),
      field('Name', 'Price Book Name', 'Text'),
      field('SystemModstamp', 'System Modstamp', 'DateTime'),
      field('LastModifiedDate', 'Last Modified Date', 'DateTime'),
      field('IsActive', 'Active', 'Text'),
      field('CliNameUpper', 'CliNameUpper', 'Text'),
    ],
    recordModifiedFieldName: 'SystemModstamp',
  },
  mappings: [
    {
      targetFieldName: 'CliNameUpper',
      transformationFormula: "UPPER(sourceField['Name'])",
      targetFieldReturntype: 'Text',
    },
  ],
  sourceFields: [
    { name: 'Id', dataType: 'Text' },
    { name: 'Name', dataType: 'Text' },
    { name: 'LastModifiedDate', dataType: 'DateTime' },
    { name: 'SystemModstamp', dataType: 'DateTime' },
    { name: 'IsActive', dataType: 'Text' },
  ],
  refreshConfig: {
    frequency: { frequencyType: 'BATCH', hours: [], refreshDayOfMonth: [] },
    fullRefreshIntervalDays: 'DAYS_10',
    isAccelerationEnabled: false,
    refreshMode: 'UPSERT',
  },
};
const byName = (values) => values.toSorted((a, b) => String(a.name).localeCompare(String(b.name)));
const ordered = (body) => ({
  ...body,
  sourceFields: byName(body.sourceFields),
  dataLakeObjectInfo: {
    ...body.dataLakeObjectInfo,
    dataLakeFieldInputRepresentations: byName(
      body.dataLakeObjectInfo.dataLakeFieldInputRepresentations,
    ),
  },
});

/**
 * A stream client over a bound sender that answers like Salesforce and records each write body.
 * @param {Function} getStream Current stream GET, or undefined for absent.
 * @param {Function} [answer] Status for a write.
 * @returns {object} Clients and the recorded requests.
 */
function org(getStream, answer = () => 200) {
  const requests = [];
  const sender = {
    request: async (method, url, noContent, body) => {
      requests.push({ method, url, body });
      const status = method === 'POST' ? 201 : answer(body);
      if (status >= 400)
        throw retainConnectDiagnostic(
          new ConnectError('REQUEST_FAILED', status),
          apiDiagnostic(status, [
            { errorCode: 'POST_BODY_PARSE_ERROR', message: 'invalid refresh mode' },
          ]),
        );
      return { name: 'CliCrmPb2', recordId, status: 'PROCESSING' };
    },
  };
  const reader = {
    get: async () => {
      const stream = getStream(requests);
      if (stream === undefined) throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
      return structuredClone(stream);
    },
  };
  const streams = createDataStreamClient('synthetic', reader, '68.0', sender);
  return {
    clients: { streams: { ...streams, get: reader.get } },
    requests,
  };
}
const notFound = () => new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
const options = { allowProcessing: true, verifyInput: async () => {}, wait: async () => {} };
const crmDocument = () => projectCrmDataStream(crmGet(), 'CliCrmPb2', 'retrieve', ['default']);

test('retrieve writes a CRM stream as its GET without server-owned keys and system fields', async () => {
  const stream = crmGet();
  const calls = [];
  const clients = {
    streams: {
      get: async (name) => {
        calls.push(`streams.get:${name}`);
        return structuredClone(stream);
      },
    },
  };
  const document = await retrieveDataStreamDocument(
    'CliCrmPb2',
    clients,
    'default',
    false,
    'retrieve',
  );
  assert.deepEqual(calls, ['streams.get:CliCrmPb2']);
  const { spec } = document;
  for (const key of [
    'recordId',
    'status',
    'lastRunStatus',
    'isEnabled',
    'dataSource',
    'advancedAttributes',
    'capabilities',
  ])
    assert.equal(Object.hasOwn(spec, key), false, key);
  assert.deepEqual(Object.keys(spec.dataLakeObjectInfo).toSorted(), [
    'category',
    'dataSpaceInfo',
    'fields',
    'label',
    'name',
    'recordModifiedFieldName',
  ]);
  assert.deepEqual(
    spec.dataLakeObjectInfo.fields.map((entry) => entry.name),
    ['CliNameUpper', 'Id', 'IsActive', 'LastModifiedDate', 'Name', 'SystemModstamp'],
  );
  assert.deepEqual(spec.sourceFields[0], { datatype: 'Text', name: 'Id' });
  assert.equal(
    spec.sourceFields.some((entry) => entry.name === 'SfdcOrganizationId' || entry.format),
    false,
  );
  assert.deepEqual(spec.mappings[0], {
    formula: "UPPER(sourceField['Name'])",
    targetFieldName: 'CliNameUpper',
  });
  assert.equal(spec.mappings.length, 6);
  assert.deepEqual(spec.connectorInfo.connectorDetails, {
    name: 'SalesforceDotCom_Home',
    sourceObject: 'Pricebook2',
  });
  assert.deepEqual(Object.keys(spec.refreshConfig).toSorted(), [
    'frequency',
    'fullRefreshIntervalDays',
    'isAccelerationEnabled',
    'refreshMode',
  ]);

  // Through the command and the real writer: one normal file that deploy reads back.
  const cwd = await scratch();
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '68.0',
      'target-org': 'synthetic',
      metadata: ['data-stream:CliCrmPb2'],
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
  let result;
  try {
    result = await command.run();
  } finally {
    process.exitCode = before;
  }
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  assert.deepEqual(result.diagnostics.warnings, []);
  const saved = JSON.parse(
    await readFile(
      path.join(cwd, 'data360', 'data-stream', 'CliCrmPb2.data-stream-meta.json'),
      'utf8',
    ),
  );
  assert.deepEqual(saved, structuredClone(document));
  const [input] = await readDeployInputs({ cwd, metadata: ['data-stream:CliCrmPb2'] });
  assert.equal(streamLandingDlo(input), 'CliCrmPb2__dll');
});

test('create sends the proven create body, and needs --allow-processing', async () => {
  let stream;
  const { clients, requests } = org(() => stream);
  const preview = await preflightDataStream(crmDocument(), clients);
  assert.equal(preview.outcome, 'create');
  const blocked = await executeDataStream(crmDocument(), clients, {
    ...options,
    allowProcessing: false,
  });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.diagnostics[0].code, 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  assert.equal(requests.length, 0);
  const { clients: live, requests: sent } = org((done) => (done.length > 0 ? crmGet() : undefined));
  const result = await executeDataStream(crmDocument(), live, options);
  assert.equal(result.outcome, 'created', JSON.stringify(result.diagnostics));
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(result.targetDloName, 'CliCrmPb2__dll');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.deepEqual(ordered(sent[0].body), ordered(provenCreateBody));
});

test('a repeated deploy of the retrieved file is unchanged and sends nothing', async () => {
  const { clients, requests } = org(() => crmGet());
  const preview = await preflightDataStream(crmDocument(), clients);
  assert.equal(preview.outcome, 'unchanged');
  const result = await executeDataStream(crmDocument(), clients, {
    ...options,
    allowProcessing: false,
  });
  assert.equal(result.outcome, 'unchanged');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(requests.length, 0);
});

test('a formula added to the file is one PATCH of datastreamType and that mapping', async () => {
  const document = structuredClone(crmDocument());
  document.spec.mappings.push({
    formula: "LOWER(sourceField['Name'])",
    targetFieldName: 'CliLower',
  });
  document.spec.dataLakeObjectInfo.fields.push(field('CliLower', 'CliLower', 'Text'));
  const after = crmGet();
  after.mappings.push({
    formula: "LOWER(sourceField['Name'])",
    targetFieldName: 'CliLower',
  });
  after.dataLakeObjectInfo.fields.push(field('CliLower', 'CliLower', 'Text'));
  const { clients, requests } = org((done) => (done.length > 0 ? after : crmGet()));
  const preview = await preflightDataStream(document, clients);
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.changes, ['mappings']);
  const result = await executeDataStream(document, clients, options);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PATCH');
  assert.match(requests[0].url, new RegExp(`/ssot/data-streams/${recordId}$`, 'u'));
  assert.deepEqual(requests[0].body, {
    datastreamType: 'SFDC',
    mappings: [
      {
        targetFieldName: 'CliLower',
        transformationFormula: "LOWER(sourceField['Name'])",
        targetFieldReturntype: 'Text',
      },
    ],
  });
});

test('a removed formula is sent empty; a refresh interval change sends only that setting', async () => {
  const document = structuredClone(crmDocument());
  document.spec.mappings = document.spec.mappings.filter((entry) => !entry.formula);
  document.spec.refreshConfig.fullRefreshIntervalDays = 'DAYS_30';
  const { clients, requests } = org(() => crmGet());
  await executeDataStream(document, clients, options);
  assert.deepEqual(requests[0].body, {
    datastreamType: 'SFDC',
    mappings: [{ targetFieldName: 'CliNameUpper', transformationFormula: '' }],
    refreshConfig: { fullRefreshIntervalDays: 'DAYS_30' },
  });
});

test('a label Salesforce keeps is reported; a refused refresh mode is reported as rejected', async () => {
  const relabelled = structuredClone(crmDocument());
  relabelled.spec.label = 'New label';
  const { clients, requests } = org(() => crmGet());
  const result = await executeDataStream(relabelled, clients, options);
  assert.deepEqual(requests[0].body, { datastreamType: 'SFDC', label: 'New label' });
  assert.equal(result.outcome, 'updated');
  assert.equal(result.diagnostics[0].code, 'STREAM_CHANGE_NOT_APPLIED');
  assert.match(result.diagnostics[0].message, /kept the old label/u);

  const remoded = structuredClone(crmDocument());
  remoded.spec.refreshConfig.refreshMode = 'FULL_REFRESH';
  const refused = org(
    () => crmGet(),
    () => 400,
  );
  const failure = await executeDataStream(remoded, refused.clients, options);
  assert.deepEqual(refused.requests[0].body, {
    datastreamType: 'SFDC',
    refreshConfig: { refreshMode: 'FULL_REFRESH' },
  });
  assert.equal(failure.outcome, 'failed');
  assert.equal(failure.mutation, 'rejected');
  assert.equal(failure.diagnostics[0].code, 'STREAM_HTTP_ERROR');
  assert.match(failure.diagnostics[0].message, /invalid refresh mode/u);
});

test('a plain mapping change is refused before any write', async () => {
  const cases = [
    [
      (spec) => {
        spec.mappings.find((entry) => entry.targetFieldName === 'Name').sourceFieldName = 'Id';
      },
      /mappings\[Name\]/u,
    ],
    [
      (spec) => {
        spec.mappings = spec.mappings.filter((entry) => entry.targetFieldName !== 'IsActive');
      },
      /mappings\[IsActive\]/u,
    ],
  ];
  for (const [edit, named] of cases) {
    const document = structuredClone(crmDocument());
    edit(document.spec);
    const { clients, requests } = org(() => crmGet());
    await assert.rejects(preflightDataStream(document, clients), (error) => {
      assert.equal(error.code, 'UNSUPPORTED_STREAM_SETTINGS_CHANGE');
      assert.match(error.message, named);
      return true;
    });
    const result = await executeDataStream(document, clients, options);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(result.diagnostics[0].code, 'UNSUPPORTED_STREAM_SETTINGS_CHANGE');
    assert.equal(requests.length, 0);
  }
});

test('a formula return type change is sent with the formula and Salesforce decides', async () => {
  const document = structuredClone(crmDocument());
  document.spec.mappings.find(
    (entry) => entry.targetFieldName === 'CliNameUpper',
  ).targetFieldReturntype = 'Number';
  const preview = await preflightDataStream(document, org(() => crmGet()).clients);
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.changes, ['mappings']);
  const { clients, requests } = org(
    () => crmGet(),
    () => 400,
  );
  const result = await executeDataStream(document, clients, options);
  assert.deepEqual(requests[0].body, {
    datastreamType: 'SFDC',
    mappings: [
      {
        targetFieldName: 'CliNameUpper',
        transformationFormula: "UPPER(sourceField['Name'])",
        targetFieldReturntype: 'Number',
      },
    ],
  });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'STREAM_HTTP_ERROR');
});

test('a stream of another connector uses the same file and is created as written', async () => {
  // Other connectors are untested live; the file is sent as written and Salesforce decides.
  const s3 = {
    ...crmGet(),
    name: 'Orders_S3',
    dataStreamType: 'S3',
    connectorInfo: { connectorType: 'S3', connectorDetails: { name: 'AmazonS3_Home', type: 'S3' } },
    refreshConfig: { ...crmGet().refreshConfig, refreshMode: 'FULL_REFRESH' },
  };
  const document = projectCrmDataStream(s3, 'Orders_S3', 'retrieve', ['default']);
  assert.deepEqual(document.spec.connectorInfo, {
    connectorType: 'S3',
    connectorDetails: { name: 'AmazonS3_Home' },
  });
  const { clients, requests } = org((done) => (done.length > 0 ? s3 : undefined));
  const result = await executeDataStream(document, clients, options);
  assert.equal(result.outcome, 'created', JSON.stringify(result.diagnostics));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.datastreamType, 'S3');
  assert.deepEqual(requests[0].body.connectorInfo, document.spec.connectorInfo);
  assert.equal(requests[0].body.refreshConfig.refreshMode, 'FULL_REFRESH');
  // An Ingestion API stream of the same name is another object and is never overwritten.
  const ingest = { ...s3, connectorInfo: { connectorType: 'IngestApi' } };
  const other = org(() => ingest);
  const refused = await executeDataStream(document, other.clients, options);
  assert.equal(refused.diagnostics[0].code, 'STREAM_TARGET_MISMATCH');
  assert.equal(other.requests.length, 0);
});

test('a file of one connector never updates an org stream of another connector', async () => {
  const s3 = {
    ...crmGet(),
    dataStreamType: 'S3',
    connectorInfo: { connectorType: 'S3', connectorDetails: { name: 'AmazonS3_Home' } },
  };
  const document = projectCrmDataStream(s3, 'CliCrmPb2', 'retrieve', ['default']);
  const { clients, requests } = org(() => crmGet());
  await assert.rejects(preflightDataStream(document, clients), { code: 'STREAM_TARGET_MISMATCH' });
  const result = await executeDataStream(document, clients, options);
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(result.diagnostics[0].code, 'STREAM_TARGET_MISMATCH');
  assert.equal(requests.length, 0);
  // The connector type ignores letter case like other stream enums.
  const cased = structuredClone(crmDocument());
  cased.spec.connectorInfo.connectorType = 'salesforcedotcom';
  const casedPreview = await preflightDataStream(cased, org(() => crmGet()).clients);
  assert.equal(casedPreview.outcome, 'unchanged');
});

test('file-import refresh keys are user settings of non-CRM connectors and are sent as written', () => {
  const refresh = {
    refreshMode: 'FULL_REFRESH',
    hasHeaders: true,
    shouldFetchImmediately: false,
    shouldTreatMissingFilesAsFailures: true,
  };
  const s3 = {
    ...crmGet(),
    dataStreamType: 'S3',
    connectorInfo: { connectorType: 'S3', connectorDetails: { name: 'AmazonS3_Home' } },
    refreshConfig: refresh,
  };
  const document = projectCrmDataStream(s3, 'CliCrmPb2', 'retrieve', ['default']);
  assert.deepEqual(document.spec.refreshConfig, refresh);
  assert.deepEqual(crmDataStreamWriteBody(document.spec).refreshConfig, refresh);
  const crm = projectCrmDataStream(
    { ...crmGet(), refreshConfig: refresh },
    'CliCrmPb2',
    'retrieve',
    ['default'],
  );
  assert.deepEqual(crm.spec.refreshConfig, { refreshMode: 'FULL_REFRESH' });
});

test('create reports plain mappings Salesforce mapped otherwise than the file', async () => {
  const document = structuredClone(crmDocument());
  document.spec.mappings.find((entry) => entry.targetFieldName === 'Name').sourceFieldName = 'Id';
  const { clients, requests } = org((done) => (done.length > 0 ? crmGet() : undefined));
  const result = await executeDataStream(document, clients, options);
  assert.equal(result.outcome, 'created', JSON.stringify(result.diagnostics));
  assert.equal(requests.length, 1);
  assert.deepEqual(
    result.diagnostics.map((entry) => entry.code),
    ['STREAM_CHANGE_NOT_APPLIED'],
  );
  assert.match(result.diagnostics[0].message, /mappings\[Name\]/u);
});

test('delete removes a CRM stream and, with --delete-dlo, its DLO by the stream record ID', async () => {
  let deleted = false;
  const sent = [];
  const clients = {
    streams: {
      // Relabelled through the Metadata API: the DLO's entry keeps the old label (live API68).
      get: async () => {
        if (deleted) throw notFound();
        return { ...crmGet(), label: 'Relabelled' };
      },
      list: async () => [],
      delete: async (id, cascade) => {
        sent.push([id, cascade]);
        deleted = true;
      },
    },
    connections: {},
    dependencies: {
      stream: async () => ({ dependencies: [], totalSize: 0 }),
      dlo: async () => ({
        dependencies: [{ componentType: 'DataStream', id: recordId, name: 'CliCrmPb2' }],
        totalSize: 1,
      }),
    },
    dlo: {
      get: async () => {
        if (deleted) throw notFound();
        // Deleting the DLO with the stream needs it in the default data space alone.
        return {
          dataLakeObjects: [{ name: 'CliCrmPb2__dll', dataSpaceInfo: [{ name: 'default' }] }],
        };
      },
    },
  };
  const result = await executeDeleteDataStream('CliCrmPb2', clients, {
    deleteDlo: true,
    verifyInput: async () => {},
    wait: async () => {},
  });
  assert.equal(result.outcome, 'deleted', JSON.stringify(result.diagnostics));
  assert.equal(result.targetDloName, 'CliCrmPb2__dll');
  assert.deepEqual(sent, [[recordId, true]]);
});

/**
 * A stream client whose bound sender also has the Metadata API: the DataStreamDefinition label
 * update changes the label the stream GET shows (live API68).
 * @param {object} [refusal] Metadata API update answer instead of success.
 * @param {Error} [readFailure] Error thrown by the Metadata API read instead of the record.
 * @returns {object} Clients, REST requests and Metadata API calls.
 */
function metadataOrg(refusal, readFailure) {
  const requests = [];
  const metadata = [];
  let label = crmGet().label;
  const sender = {
    request: async (method, url, noContent, body) => {
      requests.push({ method, url, body });
      return { name: 'CliCrmPb2', recordId, status: 'ACTIVE' };
    },
    metadata: async () => ({
      read: async (type, names) => {
        metadata.push(['read', type, names]);
        if (readFailure) throw readFailure;
        return { fullName: names[0], masterLabel: label, dataConnectorType: 'SalesforceDotCom' };
      },
      update: async (type, record) => {
        metadata.push(['update', type, record]);
        if (refusal instanceof Error) throw refusal;
        if (refusal) return refusal;
        label = record.masterLabel;
        return { fullName: record.fullName, success: true, errors: [] };
      },
    }),
  };
  const reader = { get: async () => ({ ...crmGet(), label }) };
  const streams = createDataStreamClient('synthetic', reader, '68.0', sender);
  return { clients: { streams: { ...streams, get: reader.get } }, requests, metadata };
}

test('a stream label change goes through the Metadata API stream definition, not the PATCH', async () => {
  const relabelled = structuredClone(crmDocument());
  relabelled.spec.label = 'New label';
  const only = metadataOrg();
  const result = await executeDataStream(relabelled, only.clients, options);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(only.requests, []);
  assert.deepEqual(only.metadata, [
    ['read', 'DataStreamDefinition', ['CliCrmPb2']],
    [
      'update',
      'DataStreamDefinition',
      { fullName: 'CliCrmPb2', masterLabel: 'New label', dataConnectorType: 'SalesforceDotCom' },
    ],
  ]);
  // With a formula change too: the label first, then one PATCH without the label.
  relabelled.spec.mappings = relabelled.spec.mappings.filter((entry) => !entry.formula);
  const both = metadataOrg();
  await executeDataStream(relabelled, both.clients, options);
  assert.equal(both.metadata.at(-1)[0], 'update');
  assert.deepEqual(both.requests[0].body, {
    datastreamType: 'SFDC',
    mappings: [{ targetFieldName: 'CliNameUpper', transformationFormula: '' }],
  });
});

test('a refused stream label update is rejected with Salesforce text and sends nothing else', async () => {
  const relabelled = structuredClone(crmDocument());
  relabelled.spec.label = 'New label';
  relabelled.spec.mappings = relabelled.spec.mappings.filter((entry) => !entry.formula);
  const refused = metadataOrg({
    fullName: 'CliCrmPb2',
    success: false,
    errors: { statusCode: 'FIELD_INTEGRITY_EXCEPTION', message: 'Label is too long.' },
  });
  const result = await executeDataStream(relabelled, refused.clients, options);
  assert.deepEqual([result.outcome, result.mutation], ['failed', 'rejected']);
  assert.equal(result.diagnostics[0].code, 'STREAM_LABEL_UPDATE_REJECTED');
  assert.match(
    result.diagnostics[0].message,
    /DataStreamDefinition CliCrmPb2: FIELD_INTEGRITY_EXCEPTION: Label is too long\. The label was not changed/u,
  );
  assert.deepEqual(refused.requests, []);
});

test('a server fault on the stream label update is unconfirmed, not rejected, and sends nothing else', async () => {
  const relabelled = structuredClone(crmDocument());
  relabelled.spec.label = 'New label';
  const faulted = metadataOrg(
    Object.assign(new Error('An unexpected error occurred.'), { name: 'sf:UNKNOWN_EXCEPTION' }),
  );
  const result = await executeDataStream(relabelled, faulted.clients, options);
  assert.deepEqual([result.outcome, result.mutation], ['failed', 'unknown']);
  assert.equal(result.diagnostics[0].code, 'STREAM_REQUEST_UNCONFIRMED');
  // One update, no resend and no PATCH afterwards.
  assert.deepEqual(faulted.metadata.filter(([kind]) => kind === 'update').length, 1);
  assert.deepEqual(faulted.requests, []);
});

test('a failed read before the stream label update is not a write: blocked, nothing sent', async () => {
  const relabelled = structuredClone(crmDocument());
  relabelled.spec.label = 'New label';
  const failed = metadataOrg(undefined, new Error('socket hang up'));
  const result = await executeDataStream(relabelled, failed.clients, options);
  assert.deepEqual([result.outcome, result.mutation], ['blocked', 'not-attempted']);
  assert.equal(result.diagnostics[0].code, 'STREAM_LABEL_READ_FAILED');
  assert.deepEqual(
    failed.metadata.map(([kind]) => kind),
    ['read'],
  );
  assert.deepEqual(failed.requests, []);
});

test('the stream label transport refuses a missing record and leaves other failures unconfirmed', async () => {
  let answer;
  let record = {
    fullName: 'CliCrmPb2',
    masterLabel: 'Old',
    dataSource: { $: { 'xsi:nil': 'true' } },
  };
  const sent = [];
  const sender = {
    request: async () => assert.fail('no REST call'),
    metadata: async () => ({
      read: async () => record,
      update: async (_type, value) => {
        sent.push(value);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    }),
  };
  const { relabel } = createDataStreamClient(
    'synthetic',
    { get: async () => ({}) },
    '68.0',
    sender,
  );
  answer = { fullName: 'CliCrmPb2', success: true };
  await relabel('CliCrmPb2', 'New');
  // An explicit nil is not sent back.
  assert.deepEqual(sent[0], { fullName: 'CliCrmPb2', masterLabel: 'New' });
  // Client faults are refusals; server faults may follow an applied update.
  for (const [name, code] of [
    ['soapenv:Client', 'STREAM_LABEL_UPDATE_REJECTED'],
    ['sf:INVALID_TYPE', 'STREAM_LABEL_UPDATE_REJECTED'],
    ['sf:REQUEST_LIMIT_EXCEEDED', 'STREAM_LABEL_UPDATE_REJECTED'],
    ['soapenv:Server', 'STREAM_REQUEST_UNCONFIRMED'],
    ['sf:UNKNOWN_EXCEPTION', 'STREAM_REQUEST_UNCONFIRMED'],
  ]) {
    answer = Object.assign(new Error('fault'), { name });
    const before = sent.length;
    await assert.rejects(relabel('CliCrmPb2', 'New'), { code }, name);
    assert.equal(sent.length, before + 1, `${name} is sent once`);
  }
  answer = new Error('socket hang up');
  await assert.rejects(relabel('CliCrmPb2', 'New'), { code: 'STREAM_REQUEST_UNCONFIRMED' });
  // Only the update goes through the caller's send; a failed read sends nothing.
  const wrapped = [];
  answer = { fullName: 'CliCrmPb2', success: true };
  await relabel('CliCrmPb2', 'New', async (write) => {
    wrapped.push('send');
    await write();
  });
  assert.deepEqual(wrapped, ['send']);
  const sentBefore = sent.length;
  const { relabel: failingRead } = createDataStreamClient(
    'synthetic',
    { get: async () => ({}) },
    '68.0',
    {
      request: async () => assert.fail('no REST call'),
      metadata: async () => ({
        read: async () => {
          throw new Error('socket hang up');
        },
        update: async () => assert.fail('no update after a failed read'),
      }),
    },
  );
  await assert.rejects(
    failingRead('CliCrmPb2', 'New', async () => assert.fail('no send after a failed read')),
    { code: 'STREAM_LABEL_READ_FAILED' },
  );
  assert.equal(sent.length, sentBefore);
  record = {};
  await assert.rejects(relabel('CliCrmPb2', 'New'), { code: 'STREAM_LABEL_UPDATE_REJECTED' });
  await assert.rejects(relabel('bad/name', 'New'), { code: 'INVALID_STREAM_NAME' });
  const plain = createDataStreamClient('synthetic', { get: async () => ({}) }, '68.0', {
    request: async () => ({}),
  });
  assert.equal(plain.relabel, undefined);
});

// Data spaces (D2): the GET-shaped file keeps Salesforce's dataSpaceInfo beside c__dataSpace.
const inSpaces = (...names) => {
  const stream = crmGet();
  stream.dataLakeObjectInfo.dataSpaceInfo = names.map((name) => ({ label: name, name }));
  return stream;
};

test('a CRM stream file lists the data spaces of its DLO, and both lists must agree', () => {
  const document = projectCrmDataStream(
    inSpaces('default', 'dataspace2'),
    'CliCrmPb2',
    'retrieve',
    ['default', 'dataspace2'],
  );
  assert.deepEqual(document.c__dataSpace, ['dataspace2', 'default']);
  assert.deepEqual(document.identity, { apiName: 'CliCrmPb2' });
  const differing = structuredClone(document);
  differing.c__dataSpace = ['default'];
  assert.throws(() => validateCrmDataStreamDocument(differing), {
    code: 'STREAM_DATASPACE_MISMATCH',
  });
  const legacy = structuredClone(document);
  legacy.identity.dataSpace = 'default';
  assert.throws(() => validateCrmDataStreamDocument(legacy), { code: 'LEGACY_DATASPACE_KEY' });
});

test('a CRM stream outside the run data space stays an item failure on retrieve', async () => {
  const clients = { streams: { get: async () => inSpaces('dataspace2') } };
  await assert.rejects(
    retrieveDataStreamDocument('CliCrmPb2', clients, 'default', false, 'retrieve'),
    { code: 'UNSUPPORTED_STREAM_DATASPACE' },
  );
  const document = await retrieveDataStreamDocument(
    'CliCrmPb2',
    clients,
    'dataspace2',
    false,
    'retrieve',
  );
  assert.deepEqual(document.c__dataSpace, ['dataspace2']);
});

test('a new CRM stream is created in the run data space, filled from c__dataSpace', async () => {
  const document = structuredClone(
    projectCrmDataStream(inSpaces('dataspace2'), 'CliCrmPb2', 'retrieve', ['dataspace2']),
  );
  delete document.spec.dataLakeObjectInfo.dataSpaceInfo;
  const { clients: live, requests: sent } = org((done) =>
    done.length > 0 ? inSpaces('dataspace2') : undefined,
  );
  const result = await executeDataStream(document, live, { ...options, dataSpace: 'dataspace2' });
  assert.equal(result.outcome, 'created', JSON.stringify(result.diagnostics));
  assert.deepEqual(sent[0].body.dataLakeObjectInfo.dataspaceInfo, [{ name: 'dataspace2' }]);
  // Another run data space, or several spaces for a new stream, are refused before any write.
  for (const [listed, run] of [
    [['dataspace2'], 'default'],
    [['dataspace2', 'default'], 'dataspace2'],
  ]) {
    const { clients, requests } = org(() => {});
    const blocked = await executeDataStream({ ...document, c__dataSpace: listed }, clients, {
      ...options,
      dataSpace: run,
    });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.diagnostics[0].code, 'STREAM_DATASPACE_MISMATCH');
    assert.equal(requests.length, 0);
  }
});

test('an existing CRM stream file must list exactly the data spaces of its DLO', async () => {
  const document = projectCrmDataStream(inSpaces('default'), 'CliCrmPb2', 'retrieve', ['default']);
  const { clients, requests } = org(() => inSpaces('dataspace2', 'default'));
  await assert.rejects(preflightDataStream(document, clients, 'default'), {
    code: 'STREAM_DATASPACE_MISMATCH',
  });
  assert.equal(requests.length, 0);
  const listed = projectCrmDataStream(inSpaces('dataspace2', 'default'), 'CliCrmPb2', 'retrieve', [
    'dataspace2',
    'default',
  ]);
  const preview = await preflightDataStream(listed, clients, 'dataspace2');
  assert.equal(preview.outcome, 'unchanged');
});

test('a CRM stream GET that names no data space takes the spaces of its DLO, never the run', async () => {
  const unnamed = crmGet();
  delete unnamed.dataLakeObjectInfo.dataSpaceInfo;
  const dlo = (space) => ({
    get: async (name) => {
      assert.equal(name, 'CliCrmPb2__dll');
      return { dataLakeObjects: [{ name, dataSpaceInfo: [{ name: space }] }] };
    },
  });
  const read = { get: async () => structuredClone(unnamed) };
  // Retrieve: the DLO is in another data space than the run.
  await assert.rejects(
    retrieveDataStreamDocument(
      'CliCrmPb2',
      { streams: read, dlo: dlo('dataspace2') },
      'default',
      false,
      'retrieve',
    ),
    { code: 'UNSUPPORTED_STREAM_DATASPACE' },
  );
  const retrieved = await retrieveDataStreamDocument(
    'CliCrmPb2',
    { streams: read, dlo: dlo('dataspace2') },
    'dataspace2',
    false,
    'retrieve',
  );
  assert.deepEqual(retrieved.c__dataSpace, ['dataspace2']);
  // Deploy plan: the existing stream's spaces come from its DLO too.
  const document = crmDocument();
  const { clients, requests } = org(() => unnamed);
  await assert.rejects(
    preflightDataStream(document, { ...clients, dlo: dlo('dataspace2') }, 'default'),
    { code: 'UNSUPPORTED_STREAM_DATASPACE' },
  );
  const same = await preflightDataStream(document, { ...clients, dlo: dlo('default') }, 'default');
  assert.equal(same.outcome, 'unchanged');
  assert.equal(requests.length, 0);
});

test('a CRM stream file holding an HTML-escaped copy of an org formula is blocked before any write', async () => {
  const document = structuredClone(crmDocument());
  const mapping = document.spec.mappings.find((entry) => entry.targetFieldName === 'CliNameUpper');
  mapping.formula = 'UPPER(sourceField[&#39;Name&#39;])';
  const { clients, requests } = org(() => crmGet());
  await assert.rejects(preflightDataStream(document, clients), (error) => {
    assert.equal(error.code, 'HTML_ESCAPED_FILE');
    return true;
  });
  const result = await executeDataStream(document, clients, options);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.diagnostics[0].code, 'HTML_ESCAPED_FILE');
  assert.match(result.diagnostics[0].message, /HTML-escaped text at mappings\[\d+\]\.formula/u);
  assert.equal(requests.length, 0);
});
