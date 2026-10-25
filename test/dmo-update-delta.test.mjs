import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DmoDocumentError } from '../lib/artifacts/dmo-document.js';
import { buildDmoUpdateDelta } from '../lib/artifacts/dmo-update-delta.js';

const field = (name, dataType = 'Text') => ({
  name,
  label: name,
  dataType,
  isPrimaryKey: false,
  isDynamicLookup: false,
});
const fixture = () => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Offline_Shape__dlm' },
  spec: {
    label: 'Offline shape',
    description: 'Retained object description',
    category: 'Other',
    fields: [
      { ...field('Key__c'), isPrimaryKey: true },
      { ...field('Time__c', 'DateTime'), description: 'Retained field description' },
      field('TargetOnly__c'),
    ],
  },
});
const delta = (desired, current = fixture(), scope = 'default') =>
  buildDmoUpdateDelta(desired, current, scope);

/**
 * Freeze every child without altering authored values.
 * @param {object} value JSON value.
 * @returns {object} Frozen input.
 */
function freeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
}

test('update delta preserves omitted fields/descriptions and ignores field order', () => {
  const current = fixture();
  const desired = structuredClone(current);
  delete desired.spec.description;
  delete desired.spec.fields[1].description;
  desired.spec.fields.pop();
  desired.spec.fields.reverse();
  const result = delta(desired, current);
  assert.deepEqual(result, { status: 'unchanged', blockers: [], expected: current });
  assert.notEqual(result.expected, current);
  assert.notEqual(result.expected.spec.fields[0], current.spec.fields[0]);
});

test('update delta maps minimal candidate labels/description and overlays target', () => {
  const current = fixture();
  const desired = structuredClone(current);
  desired.spec.label = 'New object label';
  desired.spec.description = 'New object description';
  desired.spec.fields[1].label = 'New field label';
  delete desired.spec.fields[1].description;
  desired.spec.fields.pop();
  const result = delta(desired, current);
  assert.equal(result.status, 'candidate');
  assert.deepEqual(result.patch, {
    label: 'New object label',
    description: 'New object description',
    fields: [{ name: 'Time__c', label: 'New field label', dataType: 'DateTime' }],
  });
  const expected = structuredClone(current);
  expected.spec.label = desired.spec.label;
  expected.spec.description = desired.spec.description;
  expected.spec.fields[1].label = desired.spec.fields[1].label;
  assert.deepEqual(result.expected, expected);
});

test('update delta explicitly maps allowed new fields without create-only flags', () => {
  const desired = fixture();
  desired.spec.fields.push({
    ...field('Added__c', 'Number'),
    description: 'New numeric value',
    category: 'Custom classification',
  });
  const result = delta(desired);
  assert.deepEqual(result.patch, {
    fields: [
      {
        name: 'Added__c',
        label: 'Added__c',
        dataType: 'Number',
        description: 'New numeric value',
        category: 'Custom classification',
      },
    ],
  });
  assert.deepEqual(result.expected, desired);
  assert.equal(result.expected.spec.fields.at(-1).isPrimaryKey, false);
  assert.equal(result.expected.spec.fields.at(-1).isDynamicLookup, false);
});

test('update delta sorts emitted changes and additions deterministically by exact name', () => {
  const desired = fixture();
  desired.spec.fields.push(field('Zulu__c'), field('Alpha__c'));
  desired.spec.fields[1].label = 'Edited';
  const first = delta(desired);
  desired.spec.fields.reverse();
  assert.deepEqual(delta(desired), first);
  assert.deepEqual(
    first.patch.fields.map((item) => item.name),
    ['Alpha__c', 'Time__c', 'Zulu__c'],
  );
});

for (const [name, mutate, code] of [
  [
    'category',
    (d) => {
      d.spec.category = 'Profile';
    },
    'CATEGORY_CHANGED',
  ],
  [
    'event designation',
    (d) => {
      d.spec.eventDateTimeFieldName = 'Time__c';
    },
    'DATE_DESIGNATION_CHANGED',
  ],
  [
    'modified designation',
    (d) => {
      d.spec.recordModifiedFieldName = 'Time__c';
    },
    'DATE_DESIGNATION_CHANGED',
  ],
  [
    'empty description',
    (d) => {
      d.spec.description = '';
    },
    'DESCRIPTION_CLEAR_UNPROVEN',
  ],
  [
    'blank description',
    (d) => {
      d.spec.description = '  ';
    },
    'DESCRIPTION_CLEAR_UNPROVEN',
  ],
  [
    'type',
    (d) => {
      d.spec.fields[1].dataType = 'Date';
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'dynamic',
    (d) => {
      d.spec.fields[1].isDynamicLookup = true;
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'primary',
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
      d.spec.fields[1].isPrimaryKey = true;
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'field description',
    (d) => {
      d.spec.fields[1].description = 'Changed';
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'field description clearing',
    (d) => {
      d.spec.fields[1].description = '';
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'field category',
    (d) => {
      d.spec.fields[1].category = '';
    },
    'FIELD_CONFIGURATION_UNSUPPORTED',
  ],
  [
    'case-only identity',
    (d) => {
      d.spec.fields[1].name = 'time__c';
    },
    'FIELD_IDENTITY_CHANGED',
  ],
  [
    'new dynamic',
    (d) => {
      d.spec.fields.push({ ...field('Added__c'), isDynamicLookup: true });
    },
    'NEW_FIELD_FLAGS_UNSUPPORTED',
  ],
  [
    'new empty description',
    (d) => {
      d.spec.fields.push({ ...field('Added__c'), description: '' });
    },
    'DESCRIPTION_CLEAR_UNPROVEN',
  ],
]) {
  test(`update delta atomically blocks ${name} alongside admitted label edits`, () => {
    const desired = fixture();
    desired.spec.label = 'Otherwise admitted';
    mutate(desired);
    const result = delta(desired);
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.includes(code));
    assert.deepEqual(Object.keys(result), ['status', 'blockers']);
    assert.ok(!JSON.stringify(result).includes('Otherwise admitted'));
  });
}

test('update delta blocks optional category/date removal but preserves omitted descriptions', () => {
  const current = fixture();
  current.spec.recordModifiedFieldName = 'Time__c';
  current.spec.fields[1].category = 'Existing';
  const desired = fixture();
  assert.deepEqual(delta(desired, current), {
    status: 'blocked',
    blockers: ['DATE_DESIGNATION_CHANGED', 'FIELD_CONFIGURATION_UNSUPPORTED'],
  });
});

test('update delta validates both documents, unknown status/relationships and explicit default scope', () => {
  for (const key of ['status', 'relationships', 'name', 'expectations']) {
    for (const side of ['desired', 'current']) {
      const desired = fixture();
      const current = fixture();
      (side === 'desired' ? desired : current).spec[key] = false;
      assert.throws(() => delta(desired, current), DmoDocumentError);
    }
  }
  for (const scope of [undefined, '', 'Default', 'another', false]) {
    assert.deepEqual(buildDmoUpdateDelta(fixture(), fixture(), scope), {
      status: 'blocked',
      blockers: ['INVALID_SCOPE'],
    });
  }
  for (const side of ['desired', 'current']) {
    const desired = fixture();
    const current = fixture();
    (side === 'desired' ? desired : current).identity.dataSpace = 'another';
    assert.deepEqual(delta(desired, current), { status: 'blocked', blockers: ['INVALID_SCOPE'] });
  }
  const desired = fixture();
  desired.identity.apiName = 'Different__dlm';
  assert.deepEqual(delta(desired), { status: 'blocked', blockers: ['OBJECT_IDENTITY_CHANGED'] });
});

test('update delta does not infer rename/deletion intent from missing target fields', () => {
  const desired = fixture();
  desired.spec.fields[2].name = 'Different__c';
  const result = delta(desired);
  assert.equal(result.status, 'candidate');
  assert.ok(result.expected.spec.fields.some((item) => item.name === 'TargetOnly__c'));
  assert.ok(result.expected.spec.fields.some((item) => item.name === 'Different__c'));
});

test('update delta refuses moving primary identity to a new field', () => {
  const desired = fixture();
  desired.spec.fields[0].isPrimaryKey = false;
  desired.spec.fields.push({ ...field('NewKey__c'), isPrimaryKey: true });
  assert.deepEqual(delta(desired), {
    status: 'blocked',
    blockers: ['FIELD_CONFIGURATION_UNSUPPORTED', 'NEW_FIELD_FLAGS_UNSUPPORTED'],
  });
});

test('update delta treats identical empty descriptions as no change and minimal label omits fields', () => {
  const current = fixture();
  current.spec.description = '';
  current.spec.fields[1].description = '';
  const desired = structuredClone(current);
  assert.equal(delta(desired, current).status, 'unchanged');
  desired.spec.label = 'Object label only';
  assert.deepEqual(delta(desired, current).patch, { label: 'Object label only' });
});

test('update delta adds each validated authored type without broadening runtime acceptance', () => {
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
    const desired = fixture();
    desired.spec.fields.push(field('Added__c', type));
    const result = delta(desired);
    assert.deepEqual(result.patch, {
      fields: [{ name: 'Added__c', label: 'Added__c', dataType: type }],
    });
    assert.equal(result.expected.spec.fields.at(-1).dataType, type);
  }
});

test('update delta never mutates or aliases inputs or separate returned values', () => {
  const current = freeze(fixture());
  const desired = fixture();
  desired.spec.label = 'Changed';
  desired.spec.fields.push(field('Added__c'));
  freeze(desired);
  const before = JSON.stringify({ desired, current });
  const first = delta(desired, current);
  const second = delta(desired, current);
  first.patch.fields[0].label = 'Patch mutation';
  first.expected.spec.fields[0].label = 'Overlay mutation';
  assert.equal(first.expected.spec.fields.at(-1).label, 'Added__c');
  assert.equal(second.patch.fields[0].label, 'Added__c');
  assert.equal(JSON.stringify({ desired, current }), before);
});
