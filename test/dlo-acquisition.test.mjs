import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dloAcquisitionBlockers,
  validateDloAcquisition,
  DloAcquisitionError,
} from '../lib/artifacts/dlo-acquisition.js';
import { validateDmoDocument } from '../lib/artifacts/dmo-document.js';

/**
 * Construct a synthetic internal snapshot.
 * @returns {object} Valid incomplete acquisition.
 */
function fixture() {
  return {
    schemaVersion: 1,
    kind: 'dlo-acquisition',
    apiVersion: '65.0',
    identity: { dataSpace: 'default', apiName: 'Example__dll' },
    status: 'incomplete',
    blockers: [...dloAcquisitionBlockers],
    detail: {
      name: 'Example__dll',
      label: 'Example',
      category: 'Other',
      status: 'Active',
      dataLakeFieldInfoRepresentation: [
        { name: 'Id__c', label: 'ID', dataType: 'Text', isPrimaryKey: true },
        { name: 'KQ_Id__c', label: 'Qualifier', dataType: 'Text', isPrimaryKey: false },
      ],
      dataSpaceInfo: [{ name: 'default' }],
    },
  };
}

test('DLO acquisition retains generated fields and remains non-deployable and detached', () => {
  const source = fixture();
  const result = validateDloAcquisition(source);
  assert.deepEqual(result, source);
  source.detail.dataLakeFieldInfoRepresentation[0].label = 'Changed';
  assert.equal(result.detail.dataLakeFieldInfoRepresentation[0].label, 'ID');
  assert.throws(() => validateDmoDocument(result));
});

test('DLO acquisition retains unknown nested configuration, aliases and uppercase status', () => {
  const source = fixture();
  source.detail.capabilities = { LockedForEdit: true };
  source.detail.fields = structuredClone(source.detail.dataLakeFieldInfoRepresentation);
  // eslint-disable-next-line unicorn/no-null -- Verify lossless preservation of JSON null.
  source.detail.future = { nested: [false, null, 3] };
  source.detail.dataLakeFieldInfoRepresentation[0].future = 'retained';
  source.detail.status = 'ACTIVE';
  const result = validateDloAcquisition(source);
  assert.deepEqual(result.detail, source.detail);
  assert.ok(result.blockers.includes('UNKNOWN_CONFIGURATION'));
  assert.ok(result.blockers.includes('SCHEMA_VARIANT_UNVERIFIED'));
});

test('DLO acquisition keeps filtered and multiple spaces without claiming portability', () => {
  const source = fixture();
  source.detail.dataSpaceInfo = [
    { name: 'default', filter: { conditions: [] } },
    { name: 'other' },
  ];
  const result = validateDloAcquisition(source);
  assert.deepEqual(result.detail.dataSpaceInfo, source.detail.dataSpaceInfo);
  assert.ok(result.blockers.includes('MULTIPLE_DATA_SPACES'));
  assert.ok(result.blockers.includes('DATA_SPACE_FILTER_REPLAY_UNVERIFIED'));
});

test('empty DLO fields remain incomplete, not proof of an empty portable table', () => {
  const source = fixture();
  source.detail.dataLakeFieldInfoRepresentation = [];
  const result = validateDloAcquisition(source);
  assert.equal(result.status, 'incomplete');
  assert.ok(result.blockers.includes('EMPTY_FIELD_COLLECTION'));
  assert.ok(dloAcquisitionBlockers.every((item) => result.blockers.includes(item)));
});

for (const [name, change] of [
  [
    'wrong name',
    (x) => {
      x.detail.name = 'Other__dll';
    },
  ],
  [
    'missing space',
    (x) => {
      delete x.detail.dataSpaceInfo;
    },
  ],
  [
    'empty spaces',
    (x) => {
      x.detail.dataSpaceInfo = [];
    },
  ],
  [
    'other space',
    (x) => {
      x.detail.dataSpaceInfo = [{ name: 'other' }];
    },
  ],
  [
    'string boolean',
    (x) => {
      x.detail.dataLakeFieldInfoRepresentation[0].isPrimaryKey = 'true';
    },
  ],
  [
    'missing fields',
    (x) => {
      delete x.detail.dataLakeFieldInfoRepresentation;
    },
  ],
  [
    'duplicate field',
    (x) => {
      x.detail.dataLakeFieldInfoRepresentation.push(x.detail.dataLakeFieldInfoRepresentation[0]);
    },
  ],
  [
    'missing event',
    (x) => {
      x.detail.category = 'Engagement';
    },
  ],
  [
    'portable status',
    (x) => {
      x.status = 'projected';
    },
  ],
  [
    'missing blockers',
    (x) => {
      x.blockers = [];
    },
  ],
  [
    'non-JSON value',
    (x) => {
      x.detail.future = undefined;
    },
  ],
  [
    'cycle',
    (x) => {
      x.detail.future = x.detail;
    },
  ],
  [
    'accessor',
    (x) => {
      Object.defineProperty(x.detail, 'secret', {
        enumerable: true,
        get() {
          throw new Error('secret');
        },
      });
    },
  ],
]) {
  test(`DLO acquisition rejects ${name} without exposing payloads`, () => {
    const source = fixture();
    change(source);
    assert.throws(
      () => validateDloAcquisition(source),
      (error) => {
        assert.ok(error instanceof DloAcquisitionError);
        assert.equal(error.message, 'Invalid DLO acquisition.');
        return true;
      },
    );
  });
}

test('Engagement event designation is preserved with all observation metadata', () => {
  const source = fixture();
  Object.assign(source.detail, {
    category: 'Engagement',
    eventDateTimeFieldName: 'Event__c',
    createdBy: { id: 'observation', name: 'Creator' },
    id: 'asset',
    url: '/observation',
  });
  source.detail.dataLakeFieldInfoRepresentation.push({
    name: 'Event__c',
    label: 'Event',
    dataType: 'DateTime',
    isPrimaryKey: false,
  });
  assert.deepEqual(validateDloAcquisition(source).detail, source.detail);
});
