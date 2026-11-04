import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
  dataStreamTargetFieldName,
  validateDataStreamDocument,
} from '../lib/artifacts/data-stream-document.js';

// Sanitized API68 C receipts: generated defaults remain evidence, not create input.
const document = () => ({
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'Example_ProbeRecord_43F5E7F5', dataSpace: 'default' },
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
      { formula: '&quot;Example_ProbeRecord_43F5E7F5&quot;', targetFieldName: 'DataSourceObject' },
      { sourceFieldName: 'ProbeId', targetFieldName: 'ProbeId' },
      { sourceFieldName: 'ProbeValue', targetFieldName: 'ProbeValue' },
      { formula: '&quot;Example_Connection&quot;', targetFieldName: 'DataSource' },
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
  input.spec.additiveFieldMappings.push(addition());
  assert.throws(() => buildDataStreamCreateBody(input), /CREATE_ADDITIONS_UNSUPPORTED/);
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
  for (const builder of [buildDataStreamCreateBody, buildDataStreamPatchBody]) {
    input.identity.dataSpace = 'other';
    assert.throws(() => builder(input), /UNSUPPORTED_STREAM_DATASPACE/);
  }
});

test('stream validation rejects malformed intent, IDs, status, duplicate/conflicting mappings and formula intent', () => {
  for (const change of [
    (d) => {
      d.identity.apiName = '../escape';
    },
    (d) => {
      d.identity.dataSpace = ' bad';
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
      d.spec.refreshMode = 'FULL_REFRESH';
    },
    (d) => {
      d.spec.newDlo.category = 'Profile';
    },
    (d) => {
      d.spec.newDlo.primaryKey.dataType = 'Number';
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
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldName: 'ProbeId' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldReturntype: 'Number' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), sourceFieldLabel: 'UPPER(ProbeValue)' }];
    },
    (d) => {
      d.spec.additiveFieldMappings = [{ ...addition(), targetFieldName: 'QualificationValue__c' }];
    },
    (d) => {
      d.observed.sourceFields[0].id = 'source-runtime';
    },
    (d) => {
      d.observed.dloFields[0].status = 'ACTIVE';
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
