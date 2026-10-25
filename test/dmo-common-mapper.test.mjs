import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDmoCreateRequestFromDocument,
  DmoDocumentError,
} from '../lib/artifacts/dmo-document.js';

const types = [
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
];
const fixture = (count = 1, category = 'Other') => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Workshop_Record__dlm' },
  spec: {
    label: 'Workshop record',
    category,
    fields: Array.from({ length: count }, (_, index) => ({
      name: `Column${index}__c`,
      label: `Column ${index}`,
      dataType: types[index % types.length],
      isPrimaryKey: index === 0,
      isDynamicLookup: index % 2 === 0,
    })),
  },
});

for (const category of ['Other', 'Profile', 'Engagement']) {
  for (const count of category === 'Engagement' ? [4, 12, 17] : [1, 3, 12, 17]) {
    test(`common mapper preserves ${category} with ${count} authored fields`, () => {
      const document = fixture(count, category);
      if (category === 'Engagement') document.spec.eventDateTimeFieldName = 'Column3__c';
      const request = buildDmoCreateRequestFromDocument(document, 'default');
      assert.deepEqual(request, {
        name: 'Workshop_Record',
        label: document.spec.label,
        dataSpaceName: 'default',
        category,
        ...(category === 'Engagement' ? { eventDateTimeFieldName: 'Column3__c' } : {}),
        fields: document.spec.fields,
      });
      if (count >= 12)
        assert.deepEqual(
          request.fields.slice(0, 12).map((f) => f.dataType),
          types,
        );
    });
  }
}

test('common mapper preserves absent versus empty optional strings and both explicit references', () => {
  const document = fixture(4, 'Engagement');
  document.spec.eventDateTimeFieldName = 'Column3__c';
  document.spec.recordModifiedFieldName = 'Column3__c';
  let request = buildDmoCreateRequestFromDocument(document, 'default');
  assert.ok(!Object.hasOwn(request, 'description'));
  assert.ok(!Object.hasOwn(request.fields[0], 'description'));
  assert.ok(!Object.hasOwn(request.fields[0], 'category'));
  document.spec.description = '';
  document.spec.fields[0].description = '';
  document.spec.fields[0].category = '';
  document.spec.fields[1].description = 'Independently authored description';
  document.spec.fields[1].category = 'Custom classification';
  request = buildDmoCreateRequestFromDocument(document, 'default');
  assert.equal(request.description, '');
  assert.equal(request.fields[0].description, '');
  assert.equal(request.fields[0].category, '');
  assert.equal(request.fields[1].description, document.spec.fields[1].description);
  assert.equal(request.fields[1].category, document.spec.fields[1].category);
  assert.equal(request.eventDateTimeFieldName, 'Column3__c');
  assert.equal(request.recordModifiedFieldName, 'Column3__c');
});

test('common mapper accepts each date-time reference independently on non-Engagement categories', () => {
  for (const category of ['Other', 'Profile']) {
    for (const key of ['eventDateTimeFieldName', 'recordModifiedFieldName']) {
      const document = fixture(4, category);
      document.spec[key] = 'Column3__c';
      assert.equal(buildDmoCreateRequestFromDocument(document, 'default')[key], 'Column3__c');
    }
  }
});

test('common mapper never mutates or aliases frozen authored JSON', () => {
  const document = fixture(12);
  const before = JSON.stringify(document);
  for (const field of document.spec.fields) Object.freeze(field);
  Object.freeze(document.spec.fields);
  Object.freeze(document.spec);
  Object.freeze(document.identity);
  Object.freeze(document);
  const first = buildDmoCreateRequestFromDocument(document, 'default');
  const second = buildDmoCreateRequestFromDocument(document, 'default');
  first.fields[0].label = 'Changed output';
  first.fields.push({ ...first.fields[1] });
  assert.equal(JSON.stringify(document), before);
  assert.equal(second.fields.length, 12);
  assert.equal(second.fields[0].label, 'Column 0');
  assert.notEqual(first.fields, second.fields);
});

test('common mapper enforces exact references, one primary, names, JSON-only and unknown-key refusal', () => {
  const mutations = [
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
    },
    (d) => {
      d.spec.fields[1].isPrimaryKey = true;
    },
    (d) => {
      d.spec.fields[1].name = 'column0__c';
    },
    (d) => {
      d.identity.apiName = 'ssot_Forbidden__dlm';
    },
    (d) => {
      d.spec.fields[0].name = 'Bad__Stem__c';
    },
    (d) => {
      d.spec.eventDateTimeFieldName = 'column3__c';
    },
    (d) => {
      d.spec.recordModifiedFieldName = 'Column0__c';
    },
    (d) => {
      d.spec.eventDateTimeFieldName = '';
    },
    (d) => {
      d.spec.recordModifiedFieldName = '';
    },
    (d) => {
      d.spec.category = 'Engagement';
    },
    (d) => {
      d.spec.relationships = [];
    },
    (d) => {
      d.expectations = {};
    },
    (d) => {
      d.spec.fields[0].usageTag = 'None';
    },
    (d) => {
      d.spec.fields[0].dataType = 'Unsupported';
    },
    (d) => {
      d.spec.fields[0].isDynamicLookup = 'true';
    },
    (d) => {
      d.spec.fields[0].category = undefined;
    },
    (d) => {
      d.spec.description = undefined;
    },
    (d) => {
      d.spec.fields[0].description = undefined;
    },
    (d) => {
      Object.defineProperty(d.spec, 'label', {
        enumerable: true,
        get() {
          throw new Error('must not run');
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const document = fixture(4);
    mutate(document);
    assert.throws(() => buildDmoCreateRequestFromDocument(document, 'default'), DmoDocumentError);
  }
  for (const value of [
    undefined,
    false,
    [],
    new Date(),
    { status: 'projected', candidate: fixture() },
  ]) {
    assert.throws(() => buildDmoCreateRequestFromDocument(value, 'default'), DmoDocumentError);
  }
});

test('common mapper requires explicit source and target default with property-specific safe errors', () => {
  for (const target of [undefined, '', 'Default', 'another', {}, false]) {
    assert.throws(
      () => buildDmoCreateRequestFromDocument(fixture(), target),
      /targetDataSpace must be explicit default/u,
    );
  }
  const document = fixture();
  document.identity.dataSpace = 'another';
  assert.throws(
    () => buildDmoCreateRequestFromDocument(document, 'default'),
    /identity.dataSpace must be default/u,
  );
});
