import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { writeDataStreamDocument } from '../lib/artifacts/write-data-stream.js';
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

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-crm-stream-'));
const recordId = '1ds000000000003AAA';
const field = (name, label, dataType, isPrimaryKey = false) => ({
  dataType,
  isPrimaryKey,
  label,
  name,
});
// The GET of the live CRM probe on Pricebook2 (identifiers replaced), formula HTML-escaped.
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
    { formula: 'UPPER(sourceField[&#39;Name&#39;])', targetFieldName: 'CliNameUpper' },
    { formula: '&quot;Salesforce_Home&quot;', targetFieldName: 'DataSource' },
    { sourceFieldName: 'LastModifiedDate', targetFieldName: 'LastModifiedDate' },
    { sourceFieldName: 'SfdcOrganizationId', targetFieldName: 'SfdcOrganizationId' },
    { formula: '&quot;Pricebook2&quot;', targetFieldName: 'DataSourceObject' },
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
    { datatype: 'DateTime', format: 'yyyy-MM-dd&#39;T&#39;HH:mm:ss', name: 'LastModifiedDate' },
    { datatype: 'DateTime', format: 'yyyy-MM-dd&#39;T&#39;HH:mm:ss', name: 'SystemModstamp' },
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
 * A stream client over a runner that answers like Salesforce and records each write body.
 * @param {Function} getStream Current stream GET, or undefined for absent.
 * @param {Function} [answer] Status for a write.
 * @returns {object} Clients and the recorded requests.
 */
function org(getStream, answer = () => 200) {
  const requests = [];
  const runner = async (arguments_) => {
    const method = arguments_[arguments_.indexOf('--method') + 1];
    const body = JSON.parse(
      await readFile(arguments_[arguments_.indexOf('--body') + 1].slice(1), 'utf8'),
    );
    requests.push({ method, url: arguments_[3], body });
    const status = method === 'POST' ? 201 : answer(body);
    return status >= 400
      ? {
          exitCode: 1,
          stdout: `HTTP/1.1 ${status} Bad Request\nContent-Type: application/json\n\n[{"errorCode":"POST_BODY_PARSE_ERROR","message":"invalid refresh mode"}]`,
        }
      : {
          exitCode: 0,
          stdout: `HTTP/1.1 ${status} OK\nContent-Type: application/json\n\n{"name":"CliCrmPb2","recordId":"${recordId}","status":"PROCESSING"}`,
        };
  };
  const reader = {
    get: async () => {
      const stream = getStream(requests);
      if (stream === undefined) throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
      return structuredClone(stream);
    },
  };
  const streams = createDataStreamClient('synthetic', reader, '68.0', runner);
  return {
    clients: { streams: { ...streams, get: reader.get } },
    requests,
  };
}
const notFound = () => new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
const options = { allowProcessing: true, verifyInput: async () => {}, wait: async () => {} };
const crmDocument = () => projectCrmDataStream(crmGet(), 'CliCrmPb2', 'retrieve');

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
    formula: 'LOWER(sourceField[&#39;Name&#39;])',
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

test('a plain mapping or formula return type change is refused before any write', async () => {
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
    [
      (spec) => {
        spec.mappings.find(
          (entry) => entry.targetFieldName === 'CliNameUpper',
        ).targetFieldReturntype = 'Number';
      },
      /mappings\[CliNameUpper\]\.targetFieldReturntype/u,
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
      get: async () => {
        if (deleted) throw notFound();
        return crmGet();
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
        return { dataLakeObjects: [{ name: 'CliCrmPb2__dll' }] };
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
