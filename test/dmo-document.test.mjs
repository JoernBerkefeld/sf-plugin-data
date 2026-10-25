import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDmoRawField,
  projectDmoRawFields,
  DmoDocumentError,
  serializeDmoDocument,
  validateDmoDocument,
} from '../lib/artifacts/dmo-document.js';

const fixture = () => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'research', apiName: 'Calendar_Record__dlm' },
  spec: {
    label: 'Calendar record',
    description: 'Synthetic café\r\nrecord',
    category: 'Other',
    fields: [
      {
        name: 'Day__c',
        label: 'Day',
        dataType: 'Date',
        isPrimaryKey: true,
        isDynamicLookup: false,
      },
      {
        name: 'Observed__c',
        label: 'Observed',
        dataType: 'DateTime',
        isPrimaryKey: false,
        isDynamicLookup: false,
      },
    ],
    recordModifiedFieldName: 'Observed__c',
  },
});

test('validates qualified custom identity and independently authored writable subset', () => {
  const document = fixture();
  assert.equal(validateDmoDocument(document), document);
  document.spec.category = 'Engagement';
  document.spec.eventDateTimeFieldName = 'Observed__c';
  assert.equal(validateDmoDocument(document), document);
});

test('canonical JSON sorts object keys recursively but preserves field order and text', () => {
  const document = fixture();
  const reordered = Object.fromEntries(Object.entries(document).toReversed());
  reordered.spec = Object.fromEntries(Object.entries(document.spec).toReversed());
  const bytes = serializeDmoDocument(document);
  assert.equal(bytes, serializeDmoDocument(reordered));
  assert.equal(bytes, serializeDmoDocument(JSON.parse(bytes)));
  assert.ok(bytes.endsWith('\n'));
  assert.ok(!bytes.includes('\r'));
  assert.deepEqual(JSON.parse(bytes), document);
  assert.notEqual(
    bytes,
    serializeDmoDocument({
      ...document,
      spec: { ...document.spec, fields: [...document.spec.fields].toReversed() },
    }),
  );
});

test('rejects unsupported versions, identities, categories and missing structure', () => {
  for (const change of [
    (d) => {
      d.schemaVersion = 2;
    },
    (d) => {
      d.kind = 'dlo';
    },
    (d) => {
      d.identity.apiName = 'ssot__Example__dlm';
    },
    (d) => {
      d.identity.apiName = 'Bad__Stem__dlm';
    },
    (d) => {
      d.identity.dataSpace = '../escape';
    },
    (d) => {
      d.spec.category = 'PROFILE';
    },
    (d) => {
      d.spec.category = 'Engagement';
    },
    (d) => {
      d.spec.fields = [];
    },
    (d) => {
      delete d.spec.label;
    },
  ]) {
    const document = fixture();
    change(document);
    assert.throws(() => serializeDmoDocument(document), DmoDocumentError);
  }
});

test('rejects meaningful unknown fields at every level instead of stripping them', () => {
  for (const select of [(d) => d, (d) => d.identity, (d) => d.spec, (d) => d.spec.fields[0]]) {
    const document = fixture();
    select(document).futureConfiguration = false;
    assert.throws(() => validateDmoDocument(document), DmoDocumentError);
  }
  for (const key of ['keyQualifierName', 'isDistinct', 'usageTag', 'id', 'type']) {
    const document = fixture();
    document.spec.fields[0][key] = 'meaningful';
    assert.throws(() => validateDmoDocument(document), DmoDocumentError);
  }
});

test('rejects invalid fields, ambiguous keys, unsupported types and dangling references', () => {
  for (const change of [
    (d) => {
      d.spec.fields[1].name = 'day__c';
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
    },
    (d) => {
      d.spec.fields[1].isPrimaryKey = true;
    },
    (d) => {
      d.spec.fields[0].dataType = 'UnknownType';
    },
    (d) => {
      d.spec.fields[0].isDynamicLookup = 'true';
    },
    (d) => {
      d.spec.fields[0].label = undefined;
    },
    (d) => {
      d.spec.recordModifiedFieldName = 'Day__c';
    },
    (d) => {
      d.spec.eventDateTimeFieldName = 'Missing__c';
    },
  ]) {
    const document = fixture();
    change(document);
    assert.throws(() => validateDmoDocument(document), DmoDocumentError);
  }
});

test('does not invoke accessors or JSON conversion hooks or leak invalid payload values', () => {
  const document = fixture();
  Object.defineProperty(document.spec, 'label', {
    get() {
      throw new Error('secret');
    },
    enumerable: true,
  });
  assert.throws(() => serializeDmoDocument(document), DmoDocumentError);
  const hooked = fixture();
  hooked.toJSON = () => {
    throw new Error('secret');
  };
  assert.throws(() => serializeDmoDocument(hooked), DmoDocumentError);
  const symbolic = fixture();
  symbolic[Symbol('hidden')] = 1;
  assert.throws(() => validateDmoDocument(symbolic), DmoDocumentError);
});

test('accepts every nested official input type and preserves dynamic lookup and category', () => {
  for (const type of [
    'Number',
    'Text',
    'Date',
    'DateTime',
    'Url',
    'Phone',
    'Email',
    'Percent',
    'Boolean',
    'Currency',
    'ArrayOfFloats',
    'ArrayOfTexts',
  ]) {
    const document = fixture();
    document.spec.fields[0].dataType = type;
    document.spec.fields[0].category = 'Independent semantic category';
    document.spec.fields[0].isDynamicLookup = true;
    assert.deepEqual(JSON.parse(serializeDmoDocument(document)), document);
  }
});

const rawFixture = () => ({
  name: 'Research_Log__dlm',
  dataSpaceName: 'research',
  label: 'Research log',
  category: 'OTHER',
  creationType: 'Custom',
  id: 'not-portable',
  fields: [
    {
      name: 'Reference__c',
      label: 'Reference',
      type: 'Text',
      creationType: 'Custom',
      isPrimaryKey: true,
      keyQualifierName: 'KQ_Reference',
      isDistinct: true,
      usageTag: 'None',
    },
    {
      name: 'Weight__c',
      label: 'Weight',
      type: 'Number',
      creationType: 'Custom',
      isDynamicLookup: true,
      category: 'Synthetic',
    },
    {
      name: 'KQ_Reference__c',
      label: 'Qualifier',
      type: 'Text',
      creationType: 'System',
      usageTag: 'KeyQualifier',
      isDistinct: false,
    },
  ],
});

test('raw projection preserves qualifier and generated configuration with explicit incomplete status', () => {
  const raw = rawFixture();
  const before = structuredClone(raw);
  const result = projectDmoRawFields(raw);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.blockers, [
    'RELATIONSHIPS_NOT_ACQUIRED',
    'FIELD_SEMANTICS_REPLAY_UNVERIFIED',
    'GENERATED_FIELD_REPLAY_UNVERIFIED',
  ]);
  assert.deepEqual(result.configuration.fields, raw.fields);
  assert.ok(!('id' in result.configuration));
  assert.equal(result.candidate.spec.category, 'Other');
  assert.equal(result.candidate.spec.fields[1].dataType, 'Number');
  assert.equal(result.candidate.spec.fields[1].isDynamicLookup, true);
  assert.equal(result.candidate.spec.fields.length, 2);
  assert.deepEqual(raw, before);
  result.configuration.fields[0].keyQualifierName = 'changed';
  assert.deepEqual(raw, before);
  assert.throws(() => validateDmoDocument(result), DmoDocumentError);
});

test('raw projection blocks unknown data, malformed flags, duplicate and non-custom variants', () => {
  for (const change of [
    (r) => {
      r.fields[0].precision = 18;
    },
    (r) => {
      r.relationships = [];
    },
    (r) => {
      r.creationType = 'Derived';
    },
    (r) => {
      r.fields[0].isPrimaryKey = undefined;
    },
    (r) => {
      r.fields[1].name = 'reference__c';
    },
    (r) => {
      r.fields[0].keyQualifierName = { value: 'secret' };
    },
    (r) => {
      Object.defineProperty(r.fields[0], 'type', {
        enumerable: true,
        get() {
          throw new Error('must not execute');
        },
      });
    },
  ]) {
    const raw = rawFixture();
    change(raw);
    assert.throws(() => projectDmoRawFields(raw), DmoDocumentError);
  }
  const raw = rawFixture();
  raw.fields = raw.fields.slice(0, 2);
  delete raw.fields[0].keyQualifierName;
  delete raw.fields[0].isDistinct;
  delete raw.fields[0].usageTag;
  assert.deepEqual(projectDmoRawFields(raw).blockers, ['RELATIONSHIPS_NOT_ACQUIRED']);
});

test('raw classification keeps qualifier and semantic metadata meaningful and unknowns blocked', () => {
  for (const key of ['keyQualifierName', 'isDistinct', 'usageTag', 'creationType', 'type'])
    assert.equal(classifyDmoRawField('field', key), 'configuration');
  for (const key of [
    'id',
    'isEditable',
    'isEnabled',
    'isSegmentable',
    'hasExternalDataLakeObjectMappings',
  ])
    assert.equal(classifyDmoRawField('object', key), 'observation');
  assert.equal(classifyDmoRawField('object', 'category'), 'configuration');
  assert.equal(classifyDmoRawField('field', 'precision'), 'unknown');
  assert.equal(classifyDmoRawField('object', 'relationships'), 'unknown');
  assert.equal(classifyDmoRawField('field', 'id'), 'unknown');
});
