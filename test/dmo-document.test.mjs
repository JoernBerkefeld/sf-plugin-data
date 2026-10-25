import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOtherDmoCreateRequest,
  classifyDmoRawField,
  projectDmoRawFields,
  projectDmoConnectMetadata,
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

test('Engagement detail without an event reference blocks instead of guessing its DateTime field', () => {
  const raw = rawFixture();
  raw.category = 'ENGAGEMENT';
  raw.fields[1].type = 'DateTime';
  assert.throws(() => projectDmoRawFields(raw), DmoDocumentError);
  raw.eventDateTimeFieldName = 'Weight__c';
  assert.equal(projectDmoRawFields(raw).candidate.spec.eventDateTimeFieldName, 'Weight__c');
});

// Independently authored schema: the qualifier's exact identity deliberately has no suffix relationship.
const joinedFixture = () => {
  const fields = [
    ['Ticket__c', 'Ticket', 'Text', 'Custom', 'None'],
    ['Recorded__c', 'Recorded', 'DateTime', 'Custom', 'None'],
    ['Origin__c', 'Origin', 'Text', 'System', 'None'],
    ['OriginEntity__c', 'Origin entity', 'Text', 'System', 'None'],
    ['Tenant__c', 'Tenant', 'Text', 'System', 'None'],
    ['Partition__c', 'Partition', 'Text', 'System', 'KeyQualifier'],
  ];
  const connect = {
    name: 'Audit_Ledger__dlm',
    dataSpaceName: 'research',
    label: 'Audit ledger',
    description: 'Independent synthetic schema',
    category: 'OTHER',
    creationType: 'Custom',
    id: 'synthetic-observation',
    isEditable: true,
    isEnabled: false,
    isSegmentable: false,
    hasExternalDataLakeObjectMappings: false,
    fields: fields.map(([name, label, type, creationType, usageTag], index) => ({
      name,
      label,
      type,
      creationType,
      usageTag,
      isDistinct: false,
      ...(index === 0 ? { keyQualifierName: 'ExplicitPartitionReference' } : {}),
    })),
  };
  const metadata = {
    fullName: connect.name,
    label: connect.label,
    mktDataModelAttributes: {
      creationType: 'Custom',
      dataModelTaxonomy: 'Salesforce_SFDCReferenceModel_0_93',
      dataSpaceName: 'research',
      description: connect.description,
      isEnabled: 'false',
      isSegmentable: 'false',
      isUsedForMetrics: 'false',
      labelOverride: connect.label,
      masterLabel: connect.label,
      objectCategory: 'Salesforce_SFDCReferenceModel_0_93.Related',
    },
    fields: fields
      .map(([fullName, label, type, definitionCreationType, usageTag], index) => ({
        fullName,
        label,
        type,
        required: false,
        summaryFilterItems: [],
        ...(type === 'Text' ? { length: 60 } : {}),
        mktDataModelFieldAttributes: {
          definitionCreationType,
          usageTag,
          isDynamicLookup: 'false',
          labelOverride: label,
          masterLabel: label,
          ...(index === 0 ? { primaryIndexOrder: '1' } : {}),
          ...(index === 5 ? { refAttrDeveloperName: 'ExplicitPartitionReference' } : {}),
        },
      }))
      .toReversed(),
    ...Object.fromEntries(
      [
        'actionOverrides',
        'businessProcesses',
        'compactLayouts',
        'fieldSets',
        'indexes',
        'listViews',
        'profileSearchLayouts',
        'recordTypes',
        'sharingReasons',
        'sharingRecalculations',
        'validationRules',
        'webLinks',
      ].map((key) => [key, []]),
    ),
  };
  return { connect, metadata };
};

test('strict joined Other projection binds exact identities and flags with verified create identity', () => {
  const input = joinedFixture();
  const before = structuredClone(input);
  const result = projectDmoConnectMetadata(input.connect, input.metadata, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.status, 'projected');
  assert.deepEqual(result.createIdentity, {
    status: 'verified',
    name: 'Audit_Ledger',
    sourceApiName: input.connect.name,
  });
  assert.deepEqual(result.qualifierBindings, [
    { fieldName: 'Ticket__c', qualifierFieldName: 'Partition__c' },
  ]);
  assert.equal(result.candidate.spec.fields.length, 2);
  assert.equal(result.candidate.spec.fields[0].isPrimaryKey, true);
  assert.equal(result.candidate.spec.fields[1].isPrimaryKey, false);
  assert.ok(result.candidate.spec.fields.every((field) => field.isDynamicLookup === false));
  assert.deepEqual(result.expectations, input);
  assert.deepEqual(input, before);
  result.expectations.metadata.fields[0].required = true;
  assert.deepEqual(input, before);
  assert.throws(() => validateDmoDocument(result), DmoDocumentError);
});

test('create identity removes one exact terminal suffix and preserves ordinary mixed-case bases', () => {
  for (const name of ['Ledger__dlm', 'aUdIt_Ledger2__dlm', 'A_B_C__dlm']) {
    const { connect, metadata } = joinedFixture();
    connect.name = name;
    metadata.fullName = name;
    const result = projectDmoConnectMetadata(connect, metadata, []);
    assert.deepEqual(result.createIdentity, {
      status: 'verified',
      name: name.slice(0, -5),
      sourceApiName: name,
    });
    assert.equal(result.candidate.identity.apiName, name);
    assert.equal(result.expectations.connect.name, name);
    assert.equal(result.expectations.metadata.fullName, name);
    assert.deepEqual(result.qualifierBindings, [
      { fieldName: 'Ticket__c', qualifierFieldName: 'Partition__c' },
    ]);
  }
});

test('create identity rejects unsupported suffixes, namespaces and invalid bases without repair', () => {
  for (const name of [
    'Ledger',
    'Ledger__DLM',
    'Ledger__dlM',
    'Ledger__dlm__dlm',
    '__dlm',
    'ns__Ledger__dlm',
    'Ledger__Part__dlm',
    'Ledger___dlm',
    'Ledger-Row__dlm',
    'Ledger Row__dlm',
    'Lédger__dlm',
    'Ledger.__dlm',
    '1Ledger__dlm',
    '_Ledger__dlm',
    'SSOTLedger__dlm',
    'ssotLedger__dlm',
    'SsOt_Ledger__dlm',
    'Ledger__dlm\n',
  ]) {
    const { connect, metadata } = joinedFixture();
    connect.name = name;
    metadata.fullName = name;
    assert.throws(() => projectDmoConnectMetadata(connect, metadata, []), DmoDocumentError);
  }
});

test('strict joined projection rejects mismatched joins and unsupported semantics rather than dropping them', () => {
  for (const change of [
    (c, m) => {
      m.fullName = 'Foreign__dlm';
    },
    (c, m) => {
      m.fields[0].fullName = 'partition__c';
    },
    (c, m) => {
      m.fields[0].fullName = m.fields[1].fullName;
    },
    (c, m) => {
      m.fields.pop();
    },
    (c, m) => {
      m.fields[0].mktDataModelFieldAttributes.refAttrDeveloperName = 'Ticket';
    },
    (c) => {
      delete c.fields[0].keyQualifierName;
    },
    (c) => {
      c.fields[0].isPrimaryKey = false;
    },
    (c, m) => {
      m.fields[5].mktDataModelFieldAttributes.primaryIndexOrder = '2';
    },
    (c, m) => {
      delete m.fields[5].mktDataModelFieldAttributes.primaryIndexOrder;
    },
    (c, m) => {
      m.fields[1].mktDataModelFieldAttributes.isDynamicLookup = 'true';
    },
    (c, m) => {
      m.fields[1].required = true;
    },
    (c, m) => {
      delete m.fields[1].required;
    },
    (c, m) => {
      m.fields[1].length = 61;
    },
    (c, m) => {
      m.fields[1].precision = 8;
    },
    (c, m) => {
      m.validationRules = [{}];
    },
    (c) => {
      c.category = 'PROFILE';
    },
    (c) => {
      c.category = 'ENGAGEMENT';
    },
    (c) => {
      c.fields[0].isDistinct = true;
    },
    (c, m) => {
      m.fields[0].mktDataModelFieldAttributes.usageTag = 'None';
    },
    (c, m) => {
      Object.defineProperty(m.fields[0], 'label', {
        enumerable: true,
        get() {
          throw new Error('secret');
        },
      });
    },
  ]) {
    const { connect, metadata } = joinedFixture();
    change(connect, metadata);
    assert.throws(() => projectDmoConnectMetadata(connect, metadata, []), DmoDocumentError);
  }
  const { connect, metadata } = joinedFixture();
  assert.throws(() => projectDmoConnectMetadata(connect, metadata, [{}]), DmoDocumentError);
  assert.throws(() => projectDmoConnectMetadata(connect, metadata), DmoDocumentError);
});

const defaultProjection = () => {
  const { connect, metadata } = joinedFixture();
  connect.dataSpaceName = 'default';
  metadata.mktDataModelAttributes.dataSpaceName = 'default';
  return projectDmoConnectMetadata(connect, metadata, []);
};

test('Other mapper returns exactly the minimal authored request with explicit default binding', () => {
  const projection = defaultProjection();
  const before = structuredClone(projection);
  const request = buildOtherDmoCreateRequest(projection, 'default');
  assert.deepEqual(request, {
    name: 'Audit_Ledger',
    label: 'Audit ledger',
    description: 'Independent synthetic schema',
    dataSpaceName: 'default',
    category: 'Other',
    fields: [
      {
        name: 'Ticket__c',
        label: 'Ticket',
        dataType: 'Text',
        isPrimaryKey: true,
        isDynamicLookup: false,
      },
      {
        name: 'Recorded__c',
        label: 'Recorded',
        dataType: 'DateTime',
        isPrimaryKey: false,
        isDynamicLookup: false,
      },
    ],
  });
  assert.deepEqual(projection, before);
  request.fields[0].label = 'Changed';
  assert.deepEqual(projection, before);
  assert.equal(request.fields.length, 2);
  assert.ok(!JSON.stringify(request).includes('Partition__c'));
  assert.ok(!JSON.stringify(request).includes('synthetic-observation'));
});

test('Other mapper rejects absent, malformed and unproven source/target data-space bindings', () => {
  for (const target of [undefined, '', 'research', 'Default', '../default', {}, 1])
    assert.throws(() => buildOtherDmoCreateRequest(defaultProjection(), target), DmoDocumentError);
  const { connect, metadata } = joinedFixture();
  assert.throws(
    () => buildOtherDmoCreateRequest(projectDmoConnectMetadata(connect, metadata, []), 'default'),
    DmoDocumentError,
  );
});

test('Other mapper cannot accept a detached candidate or bypass strict profile through a forged projection', () => {
  assert.throws(
    () => buildOtherDmoCreateRequest(defaultProjection().candidate, 'default'),
    DmoDocumentError,
  );
  for (const change of [
    (p) => {
      p.status = 'incomplete';
    },
    (p) => {
      p.blockers.push('UNKNOWN');
    },
    (p) => {
      p.createIdentity.name = 'Foreign';
    },
    (p) => {
      p.createIdentity.sourceApiName = 'Foreign__dlm';
    },
    (p) => {
      p.candidate.spec.category = 'Profile';
    },
    (p) => {
      p.candidate.spec.fields[0].name = 'Foreign__c';
    },
    (p) => {
      p.candidate.spec.fields.push({ ...p.candidate.spec.fields[1], name: 'Generated__c' });
    },
    (p) => {
      p.qualifierBindings[0].qualifierFieldName = 'Foreign__c';
    },
    (p) => {
      p.expectations.connect.isEnabled = true;
    },
    (p) => {
      p.expectations.connect.category = 'ENGAGEMENT';
    },
    (p) => {
      p.expectations.connect.fields[0].isDistinct = true;
    },
    (p) => {
      p.expectations.metadata.fields.pop();
    },
    (p) => {
      p.expectations.metadata.validationRules.push({});
    },
    (p) => {
      p.expectations.relationships = [{}];
    },
    (p) => {
      p.futureConfiguration = true;
    },
    (p) => {
      Object.defineProperty(p.createIdentity, 'name', {
        enumerable: true,
        get() {
          throw new Error('secret');
        },
      });
    },
  ]) {
    const projection = defaultProjection();
    change(projection);
    assert.throws(() => buildOtherDmoCreateRequest(projection, 'default'), DmoDocumentError);
  }
});

test('Other mapper preserves exact authored names and omits absent optional description', () => {
  const { connect, metadata } = joinedFixture();
  connect.dataSpaceName = 'default';
  metadata.mktDataModelAttributes.dataSpaceName = 'default';
  delete connect.description;
  delete metadata.mktDataModelAttributes.description;
  for (const [prior, next] of [
    ['Ticket__c', 'Case_Sensitive2__c'],
    ['Recorded__c', 'Recorded_AT__c'],
  ]) {
    connect.fields.find((f) => f.name === prior).name = next;
    metadata.fields.find((f) => f.fullName === prior).fullName = next;
  }
  const request = buildOtherDmoCreateRequest(
    projectDmoConnectMetadata(connect, metadata, []),
    'default',
  );
  assert.deepEqual(
    request.fields.map((f) => f.name),
    ['Case_Sensitive2__c', 'Recorded_AT__c'],
  );
  assert.ok(!('description' in request));
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
