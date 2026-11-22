import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
  dataStreamTargetFieldName,
  validateDataStreamDocument,
} from '../lib/artifacts/data-stream-document.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

// Sanitized API68 C receipts: generated defaults remain evidence, not create input.
const document = () => ({
  schemaVersion: 1,
  kind: 'data-stream',
  c__dataSpace: ['default'],
  identity: { apiName: 'Example_ProbeRecord_43F5E7F5' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: 'Example_Connection',
    event: 'ProbeRecord',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Example-ProbeRecord',
    newDlo: {
      name: 'Example_ProbeRecord_43F5E7F5__dll',
      label: 'Requested stream',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
  observed: {
    actualDloName: 'Example_ProbeRecord_43F5E7F5__dll',
    mappings: [
      { sourceFieldName: 'ProbeExtra', targetFieldName: 'ProbeExtra' },
      { formula: '"Example_ProbeRecord_43F5E7F5"', targetFieldName: 'DataSourceObject' },
      { sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' },
      { sourceFieldName: 'ProbeValue', targetFieldName: 'ProbeValue' },
      { formula: '"Example_Connection"', targetFieldName: 'DataSource' },
      { formula: 'ProbeValue', targetFieldName: 'QualificationValue' },
    ],
    sourceFields: ['ProbeExtra', 'ProbeId', 'ProbeValue'].map((name) => ({
      name,
      datatype: 'Text',
    })),
    dloFields: [
      'KQ_ProbeId',
      'DataSource',
      'ProbeExtra',
      'ProbeId',
      'ProbeValue',
      'DataSourceObject',
      'cdp_sys_SourceVersion',
      'QualificationValue',
    ].map((name) => ({
      name: `${name}__c`,
      label: name,
      dataType: 'Text',
      isPrimaryKey: name === 'ProbeId',
    })),
  },
});
const addition = () => ({
  sourceFieldLabel: 'ProbeValue',
  targetFieldName: 'QualificationValue',
  targetFieldReturntype: 'Text',
});

test('portable stream retains all observed mappings/source/DLO fields, detached and deeply frozen', () => {
  const input = document();
  const saved = validateDataStreamDocument(input);
  assert.deepEqual(saved, input);
  input.observed.dloFields[0].label = 'changed';
  assert.equal(saved.observed.dloFields[0].label, 'KQ_ProbeId');
  for (const value of [
    saved,
    saved.spec,
    saved.spec.newDlo.primaryKey,
    saved.observed.mappings,
    saved.observed.mappings[0],
  ])
    assert.equal(Object.isFrozen(value), true);
  assert.throws(() => {
    saved.spec.label = 'changed';
  }, TypeError);
  assert.equal(JSON.stringify(saved).includes('recordId'), false);
  const authored = document();
  delete authored.observed;
  assert.deepEqual(validateDataStreamDocument(authored), authored);
});

test('proven create body uses object DLO, PK only and empty arrays, never observed inventory', () => {
  const input = document();
  const body = buildDataStreamCreateBody(input);
  assert.deepEqual(body, {
    name: input.identity.apiName,
    label: input.spec.label,
    datastreamType: 'INGEST_API',
    connectorInfo: {
      connectorType: 'IngestApi',
      connectorDetails: { name: 'Example_Connection', events: ['ProbeRecord'] },
    },
    dataLakeObjectInfo: {
      name: input.spec.newDlo.name,
      label: 'Requested stream',
      category: 'Other',
      dataspaceInfo: [{ name: 'default' }],
      dataLakeFieldInputRepresentations: [
        { name: 'ProbeId', label: 'ProbeId', dataType: 'Text', isPrimaryKey: true },
      ],
    },
    mappings: [],
    sourceFields: [],
    refreshConfig: { refreshMode: 'UPSERT' },
  });
  assert.equal(Array.isArray(body.dataLakeObjectInfo), false);
  assert.equal(Object.isFrozen(body.dataLakeObjectInfo.dataLakeFieldInputRepresentations[0]), true);
  // Additive mappings go into the create in their source-label shape (live API 68: 201).
  input.spec.additiveFieldMappings.push({ ...addition(), targetFieldReturntype: 'Number' });
  assert.deepEqual(buildDataStreamCreateBody(input).mappings, [
    { ...addition(), targetFieldReturntype: 'Number' },
  ]);
  assert.deepEqual(buildDataStreamCreateBody(input).sourceFields, []);
  // A DLO without category is created without one; Salesforce decides.
  delete input.spec.newDlo.category;
  assert.equal(
    Object.hasOwn(buildDataStreamCreateBody(input).dataLakeObjectInfo, 'category'),
    false,
  );
});

test('an Engagement stream with a formula creates with the PK field only, its event time and typed source fields', () => {
  const input = document();
  input.spec.newDlo.category = 'Engagement';
  input.spec.newDlo.eventDateTimeFieldName = 'EventTime';
  input.spec.formulaMappings = [
    {
      targetFieldName: 'ScoreX2',
      formula: "sourceField['Score'] * 2",
      targetFieldReturntype: 'Number',
    },
  ];
  const sourceFields = [
    { name: 'ProbeId', dataType: 'Text' },
    { name: 'EventTime', dataType: 'DateTime' },
    { name: 'Score', dataType: 'Number' },
  ];
  const body = buildDataStreamCreateBody(input, sourceFields);
  // The proven create (research probe c15): only the key as DLO field; Salesforce adds the rest.
  assert.deepEqual(body.dataLakeObjectInfo, {
    name: input.spec.newDlo.name,
    label: 'Requested stream',
    category: 'Engagement',
    eventDateTimeFieldName: 'EventTime',
    dataspaceInfo: [{ name: 'default' }],
    dataLakeFieldInputRepresentations: [
      { name: 'ProbeId', label: 'ProbeId', dataType: 'Text', isPrimaryKey: true },
    ],
  });
  assert.deepEqual(body.mappings, [
    {
      targetFieldName: 'ScoreX2',
      transformationFormula: "sourceField['Score'] * 2",
      targetFieldReturntype: 'Number',
    },
  ]);
  assert.deepEqual(body.sourceFields, sourceFields);
  // Without formulas the source fields stay empty (the proven create without formulas).
  delete input.spec.formulaMappings;
  assert.deepEqual(buildDataStreamCreateBody(input, sourceFields).sourceFields, []);
});

test('PATCH serializes sourceFieldLabel Text additions only, target normalizes to DLO __c', () => {
  const input = document();
  assert.throws(() => buildDataStreamPatchBody(input), /EMPTY_STREAM_PATCH/);
  input.spec.additiveFieldMappings.push(addition());
  assert.deepEqual(buildDataStreamPatchBody(input), {
    datastreamType: 'INGEST_API',
    mappings: [addition()],
  });
  assert.equal(dataStreamTargetFieldName('QualificationValue'), 'QualificationValue__c');
  assert.throws(() => dataStreamTargetFieldName('QualificationValue__c'), /INVALID_STREAM_MAPPING/);
  assert.throws(() => dataStreamTargetFieldName('../escape'), /INVALID_STREAM_NAME/);
  // The create puts the landing DLO into one data space, the one the file names.
  const single = document();
  single.c__dataSpace = ['dataspace2'];
  assert.deepEqual(buildDataStreamCreateBody(single).dataLakeObjectInfo.dataspaceInfo, [
    { name: 'dataspace2' },
  ]);
  input.c__dataSpace = ['dataspace2', 'default'];
  assert.throws(() => buildDataStreamCreateBody(input), /STREAM_DATASPACE_MISMATCH/);
  // A PATCH carries no data space: the spaces only mirror the DLO.
  assert.ok(!JSON.stringify(buildDataStreamPatchBody(input)).includes('dataspace'));
  const legacy = document();
  legacy.identity.dataSpace = 'default';
  assert.throws(() => buildDataStreamCreateBody(legacy), /LEGACY_DATASPACE_KEY/);
});

test('the c__dataSpace list of a stream file is checked like a DLO list', () => {
  for (const [value, code] of [
    [undefined, /INVALID_STREAM_DOCUMENT/],
    ['default', /INVALID_DATASPACE_FIELD/],
    [[], /INVALID_DATASPACE_FIELD/],
    [['default', 'default'], /INVALID_DATASPACE_FIELD/],
    [[' bad'], /INVALID_DATASPACE_FIELD/],
    [[{ name: 'default', filter: 'x' }], /UNSUPPORTED_DATASPACE_FILTER/],
  ]) {
    const input = document();
    if (value === undefined) delete input.c__dataSpace;
    else input.c__dataSpace = value;
    assert.throws(() => validateDataStreamDocument(input), code, JSON.stringify(value));
  }
  const listed = document();
  listed.c__dataSpace = ['dataspace2', 'default'];
  assert.deepEqual(validateDataStreamDocument(listed).c__dataSpace, ['dataspace2', 'default']);
});

test('stream validation rejects malformed intent, IDs, status, duplicate/conflicting mappings and formula intent', () => {
  for (const change of [
    (d) => {
      d.identity.apiName = '../escape';
    },
    (d) => {
      d.c__dataSpace = [' bad'];
    },
    (d) => {
      d.recordId = 'source-runtime';
    },
    (d) => {
      d.status = 'ACTIVE';
    },
    (d) => {
      d.spec.connectionId = 'source-runtime';
    },
    (d) => {
      d.spec.connectorType = 'Other';
    },
    (d) => {
      d.spec.refreshMode = '';
    },
    // Any category and key type is Salesforce's to decide; only an empty or non-text one is refused.
    (d) => {
      d.spec.newDlo.category = '';
    },
    (d) => {
      d.spec.newDlo.primaryKey.dataType = 7;
    },
    (d) => {
      d.spec.newDlo.eventDateTimeFieldName = '../escape';
    },
    (d) => {
      d.spec.formulaMappings = {};
    },
    (d) => {
      d.spec.formulaMappings = [
        { targetFieldName: 'Score2', formula: '', targetFieldReturntype: 'Number' },
      ];
    },
    (d) => {
      d.spec.formulaMappings = [
        { targetFieldName: 'Score2', formula: 'x', targetFieldReturntype: 'Number', extra: 1 },
      ];
    },
    (d) => {
      d.spec.additiveFieldMappings = [addition()];
      d.spec.formulaMappings = [
        {
          targetFieldName: addition().targetFieldName,
          formula: 'x',
          targetFieldReturntype: 'Text',
        },
      ];
    },
    (d) => {
      d.spec.newDlo = [d.spec.newDlo];
    },
    (d) => {
      d.spec.newDlo.label = 'x'.repeat(41);
    },
    (d) => {
      d.spec.additiveFieldMappings = [addition(), addition()];
    },
    (d) => {
      d.spec.additiveFieldMappings = [
        addition(),
        { ...addition(), sourceFieldLabel: 'ProbeExtra' },
      ];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldReturntype: 7 }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), sourceFieldLabel: ' Probe' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldName: 'QualificationValue__c' }];
    },
    (d) => {
      d.observed.mappings[0].formula = 'ambiguous';
    },
    (d) => {
      d.observed.mappings = {};
    },
    (d) => {
      d.observed.mappings.push({ ...d.observed.mappings[0] });
    },
    (d) => {
      d.observed.sourceFields.push({ ...d.observed.sourceFields[0] });
    },
    (d) => {
      d.observed.dloFields.push({ ...d.observed.dloFields[0] });
    },
  ]) {
    const input = document();
    change(input);
    assert.throws(() => validateDataStreamDocument(input));
  }
  for (const input of [undefined, false, [], {}, { ...document(), schemaVersion: 2 }])
    assert.throws(() => validateDataStreamDocument(input));
});

test('targets, field types and refresh modes Salesforce decides on are not refused by the file', () => {
  for (const change of [
    (d) => {
      d.spec.refreshMode = 'FULL_REFRESH';
    },
    (d) => {
      delete d.spec.newDlo.category;
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldName: 'ProbeId' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldReturntype: 'Number' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldName: 'KQ_ProbeId' }];
    },
    (d) => {
      d.spec.formulaMappings = [
        { targetFieldName: 'ProbeId', formula: 'x', targetFieldReturntype: 'Text' },
      ];
    },
  ]) {
    const input = document();
    change(input);
    assert.deepEqual(validateDataStreamDocument(input), input);
  }
});

test('stream enum constants ignore letter case, are sent as written and name a wrong key', () => {
  const cased = document();
  cased.spec.refreshMode = 'Upsert';
  cased.spec.datastreamType = 'ingest_api';
  cased.spec.connectorType = 'ingestapi';
  const body = buildDataStreamCreateBody(cased);
  assert.equal(body.refreshConfig.refreshMode, 'Upsert');
  assert.equal(body.datastreamType, 'ingest_api');
  assert.equal(body.connectorInfo.connectorType, 'ingestapi');
  const wrong = document();
  wrong.spec.connectorType = 'S3';
  assert.throws(
    () => validateDataStreamDocument(wrong),
    (error) =>
      error.code === 'UNSUPPORTED_STREAM_SPEC' &&
      /spec\.connectorType.*spec\.connectorInfo/u.test(operationDiagnostic(error, '')),
  );
});
