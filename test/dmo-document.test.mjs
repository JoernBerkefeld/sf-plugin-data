import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { writeDmoDocument } from '../lib/artifacts/write-other-dmo.js';
import {
  buildDmoCreateRequestFromDocument,
  buildOtherDmoCreateRequest,
  buildOtherDmoCreateRequestFromDocument,
  classifyDmoRawField,
  projectDmoRawFields,
  projectDmoConnectMetadata,
  projectCommonDmoConnectMetadata,
  joinDmoConnectMetadataFields,
  DmoDocumentError,
  serializeDmoDocument,
  validateDmoDocument,
} from '../lib/artifacts/dmo-document.js';

import { retrieveDmo, DmoRetrieveError } from '../lib/services/retrieve-other-dmo.js';
import { preflightDmoDeploy } from '../lib/services/preflight-dmo-deploy.js';
import { executeDmoCreate } from '../lib/services/execute-dmo-create.js';

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

// Original live-fixture shape, with independently authored object/field labels and identities.
const commonFixture = () => {
  const input = joinedFixture();
  input.connect.dataSpaceName = 'default';
  input.metadata.mktDataModelAttributes.dataSpaceName = 'default';
  const replacements = new Map([
    ['Origin__c', ['DataSource__c', 'Data Source']],
    ['OriginEntity__c', ['DataSourceObject__c', 'Data Source Object']],
    ['Tenant__c', ['InternalOrganization__c', 'Internal Organization']],
    ['Partition__c', ['KQ_Ticket__c', 'Key Qualifier Ticket']],
  ]);
  for (const field of input.connect.fields) {
    if (replacements.has(field.name)) [field.name, field.label] = replacements.get(field.name);
    if ('keyQualifierName' in field) field.keyQualifierName = 'KQ_Ticket';
  }
  for (const field of input.metadata.fields) {
    if (replacements.has(field.fullName)) {
      [field.fullName, field.label] = replacements.get(field.fullName);
      field.mktDataModelFieldAttributes.labelOverride = field.label;
      field.mktDataModelFieldAttributes.masterLabel = field.label;
    }
    if ('refAttrDeveloperName' in field.mktDataModelFieldAttributes)
      field.mktDataModelFieldAttributes.refAttrDeveloperName = 'KQ_Ticket';
  }
  return input;
};

const runCommon = ({ connect, metadata }, relationships = []) =>
  projectCommonDmoConnectMetadata(connect, metadata, relationships);

test('common projection preserves original proven Other recipe and independent expectations', () => {
  const input = commonFixture();
  const before = structuredClone(input);
  const result = runCommon(input);
  assert.equal(result.status, 'projected');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.candidate.spec.fields.length, 2);
  assert.deepEqual(result.qualifierBindings, [
    { fieldName: 'Ticket__c', qualifierFieldName: 'KQ_Ticket__c' },
  ]);
  assert.equal(result.createIdentity.name, 'Audit_Ledger');
  assert.equal(validateDmoDocument(result.candidate), result.candidate);
  result.expectations.metadata.fields[0].length = 999;
  result.expectations.relationships.push({});
  result.candidate.spec.fields[0].label = 'Changed';
  assert.deepEqual(input, before);
});

test('common projection supports varied authored counts and all twelve types with recognized generation', () => {
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
  for (const count of [1, 3, 12, 19]) {
    const input = commonFixture();
    input.connect.fields.splice(1, 1);
    input.metadata.fields = input.metadata.fields.filter(
      (field) => field.fullName !== 'Recorded__c',
    );
    for (let index = 0; index < count - 1; index++) {
      const type = types[index % types.length];
      const name = `Value${index}__c`;
      const label = `Value ${index}`;
      input.connect.fields.push({
        name,
        label,
        type,
        creationType: 'Custom',
        usageTag: 'None',
        isDistinct: false,
        description: '',
        category: 'Synthetic',
        isDynamicLookup: true,
      });
      input.metadata.fields.push({
        fullName: name,
        label,
        type,
        required: false,
        description: '',
        ...(type === 'Text' ? { length: 60 } : {}),
        mktDataModelFieldAttributes: {
          definitionCreationType: 'Custom',
          isDynamicLookup: 'true',
          usageTag: 'None',
        },
      });
    }
    const result = runCommon(input);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.status, 'projected');
    assert.equal(result.candidate.spec.fields.length, count);
    assert.deepEqual(
      result.candidate.spec.fields.map((field) => field.name),
      input.connect.fields
        .filter((field) => field.creationType === 'Custom')
        .map((field) => field.name),
    );
    if (count === 19)
      assert.ok(
        types.every((type) =>
          result.candidate.spec.fields.some((field) => field.dataType === type),
        ),
      );
  }
});

test('common projection blocks unproven generated storage taxonomy execution and relationships precisely', () => {
  for (const [mutate, blocker] of [
    [
      (index) => {
        index.connect.fields.find((f) => f.name === 'DataSource__c').label = 'Unknown';
        index.metadata.fields.find((f) => f.fullName === 'DataSource__c').label = 'Unknown';
        const a = index.metadata.fields.find(
          (f) => f.fullName === 'DataSource__c',
        ).mktDataModelFieldAttributes;
        a.labelOverride = 'Unknown';
        a.masterLabel = 'Unknown';
      },
      'GENERATED_FIELD_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.metadata.fields.find((f) => f.fullName === 'Ticket__c').length = 200;
      },
      'FIELD_LENGTH_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.metadata.mktDataModelAttributes.dataModelTaxonomy = 'Unknown';
      },
      'OBJECT_TAXONOMY_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.metadata.mktDataModelAttributes.objectCategory = 'Unknown';
      },
      'OBJECT_CATEGORY_TAXONOMY_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.connect.isEnabled = true;
        index.metadata.mktDataModelAttributes.isEnabled = 'true';
      },
      'OBJECT_EXECUTION_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.metadata.mktDataModelAttributes.isUsedForMetrics = 'true';
      },
      'OBJECT_METRICS_REPLAY_UNVERIFIED',
    ],
    [
      (index) => {
        index.metadata.fields[0].required = true;
      },
      'FIELD_REQUIRED_REPLAY_UNVERIFIED',
    ],
  ]) {
    const input = commonFixture();
    mutate(input);
    const result = runCommon(input);
    assert.equal(result.status, 'incomplete');
    assert.ok(result.blockers.includes(blocker), result.blockers.join(','));
  }
  const input = commonFixture();
  const relationships = [
    {
      name: 'SyntheticLink',
      sourceObject: { name: input.connect.name },
      targetObject: { name: 'Other__dlm' },
      sourceField: { name: 'Ticket__c' },
    },
  ];
  const result = runCommon(input, relationships);
  assert.ok(result.blockers.includes('RELATIONSHIP_REPLAY_UNSUPPORTED'));
  assert.deepEqual(result.expectations.relationships, relationships);
  assert.notEqual(result.expectations.relationships[0], relationships[0]);
  assert.throws(() => runCommon(input, {}), DmoDocumentError);
});

test('common projection never qualifies a missing generated recipe or malformed relationship inventory', () => {
  const input = commonFixture();
  input.connect.fields = input.connect.fields.filter((field) => field.creationType === 'Custom');
  delete input.connect.fields[0].keyQualifierName;
  input.metadata.fields = input.metadata.fields.filter(
    (field) => field.mktDataModelFieldAttributes.definitionCreationType === 'Custom',
  );
  const result = runCommon(input);
  assert.equal(result.status, 'incomplete');
  assert.ok(result.blockers.includes('GENERATED_RECIPE_REPLAY_UNVERIFIED'));
  for (const relationship of [
    { sourceObject: { name: 'Foreign__dlm' }, targetObject: { name: 'Other__dlm' } },
    {
      sourceObject: { name: input.connect.name },
      targetObject: { name: 'Other__dlm' },
      futureConfiguration: false,
    },
    {
      sourceObject: { name: input.connect.name },
      targetObject: { name: 'Other__dlm', futureConfiguration: false },
    },
  ])
    assert.throws(() => runCommon(input, [relationship]), DmoDocumentError);
});

test('common projection handles authoritative date references and never guesses Engagement event', () => {
  const input = commonFixture();
  input.connect.recordModifiedFieldName = 'Recorded__c';
  assert.equal(runCommon(input).candidate.spec.recordModifiedFieldName, 'Recorded__c');
  input.connect.category = 'ENGAGEMENT';
  const missing = runCommon(input);
  assert.ok(missing.blockers.includes('ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE'));
  assert.equal(missing.candidate, undefined);
  input.connect.eventDateTimeFieldName = 'Recorded__c';
  assert.equal(runCommon(input).candidate.spec.eventDateTimeFieldName, 'Recorded__c');
  assert.ok(!runCommon(input).blockers.includes('ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE'));
  for (const name of ['recorded__c', 'Missing__c', 'Ticket__c', 'DataSource__c']) {
    input.connect.eventDateTimeFieldName = name;
    assert.throws(() => runCommon(input), DmoDocumentError);
  }
  input.connect.category = 'PROFILE';
  delete input.connect.eventDateTimeFieldName;
  assert.equal(runCommon(input).candidate.spec.category, 'Profile');
});

test('common projection rejects unknown meaningful configuration and exact source conflicts', () => {
  for (const mutate of [
    (index) => {
      index.connect.category = 'toString';
    },
    (index) => {
      index.connect.name = 'Foreign__dlm';
    },
    (index) => {
      index.connect.dataSpaceName = 'research';
      index.metadata.mktDataModelAttributes.dataSpaceName = 'research';
    },
    (index) => {
      index.metadata.mktDataModelAttributes.dataSpaceName = 'foreign';
    },
    (index) => {
      index.metadata.mktDataModelAttributes.isEnabled = 'true';
    },
    (index) => {
      index.connect.futureConfiguration = false;
    },
    (index) => {
      index.metadata.mktDataModelAttributes.futureConfiguration = '';
    },
    (index) => {
      index.metadata.fields[0].futureConfiguration = false;
    },
    (index) => {
      index.connect.fields[2].futureConfiguration = false;
    },
    (index) => {
      index.metadata.fields[0].fullName = 'Missing__c';
    },
    (index) => {
      index.connect.fields[0].keyQualifierName = 'Missing';
    },
    (index) => {
      index.metadata.fields.find(
        (f) => f.fullName === 'KQ_Ticket__c',
      ).mktDataModelFieldAttributes.refAttrDeveloperName = 'Missing';
    },
    (index) => {
      index.metadata.indexes = [{}];
    },
    (index) => {
      Object.defineProperty(index.connect, 'label', {
        enumerable: true,
        get() {
          throw new Error('secret');
        },
      });
    },
  ]) {
    const input = commonFixture();
    mutate(input);
    assert.throws(() => runCommon(input), DmoDocumentError);
  }
});

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

const commonFields = (types) => {
  const connect = types.map((type, index) => ({
    name: `Attribute${index}__c`,
    label: `Attribute ${index}`,
    type,
    creationType: 'Custom',
    isDistinct: false,
    usageTag: 'None',
    isDynamicLookup: index % 2 === 0,
  }));
  const metadata = connect
    .map((field, index) => ({
      fullName: field.name,
      label: field.label,
      type: field.type,
      mktDataModelFieldAttributes: {
        definitionCreationType: 'Custom',
        isDynamicLookup: String(field.isDynamicLookup),
        ...(index === 0 ? { primaryIndexOrder: '1' } : {}),
      },
    }))
    .toReversed();
  return { connect, metadata };
};

test('common field join supports varied counts and all documented types without fixture snapshots', () => {
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
  for (const count of [1, 3, 12, 19]) {
    const input = commonFields(
      Array.from({ length: count }, (_, index) => types[index % types.length]),
    );
    input.connect[0].description = '';
    input.connect[0].category = 'Independent category';
    const before = structuredClone(input);
    const result = joinDmoConnectMetadataFields(input.connect, input.metadata);
    assert.equal(result.fields.length, count);
    assert.deepEqual(
      result.fields.map((field) => field.dataType),
      input.connect.map((field) => field.type),
    );
    assert.equal(result.fields[0].isPrimaryKey, true);
    assert.equal(result.fields[0].description, '');
    assert.equal(result.fields[0].category, 'Independent category');
    assert.deepEqual(result.blockers, []);
    result.expectations.connect[0].label = 'changed';
    result.fields[0].label = 'changed';
    assert.deepEqual(input, before);
  }
});

test('common join resolves complete explicit qualifiers and classifies generated semantics', () => {
  const { connect, metadata } = joinedFixture();
  const result = joinDmoConnectMetadataFields(connect.fields, metadata.fields);
  assert.equal(result.fields.length, 2);
  assert.deepEqual(result.qualifierBindings, [
    { fieldName: 'Ticket__c', qualifierFieldName: 'Partition__c' },
  ]);
  assert.ok(result.blockers.includes('GENERATED_FIELD_REPLAY_UNVERIFIED'));
  assert.ok(result.blockers.includes('FIELD_LENGTH_REPLAY_UNVERIFIED'));
  const input = commonFields(['Text', 'Date']);
  input.metadata[1].length = 247;
  input.metadata[1].required = true;
  input.connect[1].isDistinct = true;
  assert.deepEqual(
    new Set(joinDmoConnectMetadataFields(input.connect, input.metadata).blockers),
    new Set([
      'FIELD_LENGTH_REPLAY_UNVERIFIED',
      'FIELD_REQUIRED_REPLAY_UNVERIFIED',
      'FIELD_DISTINCT_REPLAY_UNVERIFIED',
    ]),
  );
});

test('common join resolves multiple independent qualifiers without fixed generated counts', () => {
  const { connect, metadata } = joinedFixture();
  const second = structuredClone(connect.fields[5]);
  second.name = 'SeparateQualifier__c';
  connect.fields.push(second);
  connect.fields[1].keyQualifierName = 'SecondReference';
  const secondMeta = structuredClone(metadata.fields[0]);
  secondMeta.fullName = second.name;
  secondMeta.mktDataModelFieldAttributes.refAttrDeveloperName = 'SecondReference';
  metadata.fields.push(secondMeta);
  const result = joinDmoConnectMetadataFields(connect.fields, metadata.fields);
  assert.deepEqual(result.qualifierBindings, [
    { fieldName: 'Ticket__c', qualifierFieldName: 'Partition__c' },
    { fieldName: 'Recorded__c', qualifierFieldName: 'SeparateQualifier__c' },
  ]);
  assert.equal(result.fields.length, 2);
  assert.ok(result.blockers.includes('GENERATED_QUALIFIER_REPLAY_UNVERIFIED'));
  secondMeta.mktDataModelFieldAttributes.refAttrDeveloperName = 'ExplicitPartitionReference';
  assert.throws(
    () => joinDmoConnectMetadataFields(connect.fields, metadata.fields),
    DmoDocumentError,
  );
});

test('common join reconciles supplied dynamic flags and refuses unknown absence or conflict', () => {
  const input = commonFields(['Text', 'Date']);
  delete input.metadata[1].mktDataModelFieldAttributes.isDynamicLookup;
  delete input.connect[1].isDynamicLookup;
  assert.deepEqual(
    joinDmoConnectMetadataFields(input.connect, input.metadata).fields.map(
      (f) => f.isDynamicLookup,
    ),
    [true, false],
  );
  delete input.connect[0].isDynamicLookup;
  assert.throws(
    () => joinDmoConnectMetadataFields(input.connect, input.metadata),
    DmoDocumentError,
  );
});

test('common join rejects incomplete identities, conflicting sources and unsupported semantics', () => {
  for (const mutate of [
    (c, m) => {
      m.pop();
    },
    (c, m) => {
      m[0].fullName = m[1].fullName;
    },
    (c, m) => {
      m[0].fullName = 'attribute1__c';
    },
    (c) => {
      c[0].isPrimaryKey = false;
    },
    (c, m) => {
      m[0].mktDataModelFieldAttributes.isDynamicLookup = 'true';
    },
    (c, m) => {
      delete m[1].mktDataModelFieldAttributes.primaryIndexOrder;
    },
    (c, m) => {
      m[0].mktDataModelFieldAttributes.definitionCreationType = 'System';
    },
    (c) => {
      c[0].keyQualifierName = 'Unresolved';
    },
    (c) => {
      c[1].usageTag = 'UnsupportedMeaning';
    },
    (c) => {
      c[1].relationship = {};
    },
    (c, m) => {
      m[0].precision = 12;
    },
    (c, m) => {
      m[0].summaryFilterItems = [{}];
    },
  ]) {
    const input = commonFields(['Text', 'Date']);
    mutate(input.connect, input.metadata);
    assert.throws(
      () => joinDmoConnectMetadataFields(input.connect, input.metadata),
      DmoDocumentError,
    );
  }
  for (const mutate of [
    (c) => {
      delete c[0].keyQualifierName;
    },
    (c, m) => {
      m[0].mktDataModelFieldAttributes.refAttrDeveloperName = 'Wrong';
    },
    (c) => {
      c[2].futureMeaning = false;
    },
  ]) {
    const { connect, metadata } = joinedFixture();
    mutate(connect.fields, metadata.fields);
    assert.throws(
      () => joinDmoConnectMetadataFields(connect.fields, metadata.fields),
      DmoDocumentError,
    );
  }
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

// Standalone authored JSON: no source response, generated fields or projection needed.
const authoredFixture = () => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'aUdIt_Entry2__dlm' },
  spec: {
    label: '  Café entry  ',
    description: 'Authored\r\nnotes',
    category: 'Other',
    fields: [
      {
        name: 'Recorded_AT__c',
        label: 'Recorded at',
        dataType: 'DateTime',
        isPrimaryKey: false,
        isDynamicLookup: false,
      },
      {
        name: 'Case_Sensitive2__c',
        label: '  Entry key  ',
        dataType: 'Text',
        isPrimaryKey: true,
        isDynamicLookup: false,
      },
    ],
  },
});

test('authored mapper maps standalone serialized JSON to the exact ordered request', () => {
  const document = JSON.parse(serializeDmoDocument(authoredFixture()));
  const before = structuredClone(document);
  Object.freeze(document.identity);
  for (const field of document.spec.fields) Object.freeze(field);
  Object.freeze(document.spec.fields);
  Object.freeze(document.spec);
  Object.freeze(document);
  const request = buildOtherDmoCreateRequestFromDocument(document, 'default');
  assert.deepEqual(request, {
    name: 'aUdIt_Entry2',
    label: '  Café entry  ',
    description: 'Authored\r\nnotes',
    dataSpaceName: 'default',
    category: 'Other',
    fields: [
      {
        name: 'Recorded_AT__c',
        label: 'Recorded at',
        dataType: 'DateTime',
        isPrimaryKey: false,
        isDynamicLookup: false,
      },
      {
        name: 'Case_Sensitive2__c',
        label: '  Entry key  ',
        dataType: 'Text',
        isPrimaryKey: true,
        isDynamicLookup: false,
      },
    ],
  });
  assert.deepEqual(document, before);
  const second = buildOtherDmoCreateRequestFromDocument(document, 'default');
  assert.notEqual(request, second);
  assert.notEqual(request.fields, second.fields);
  assert.notEqual(request.fields[0], second.fields[0]);
  request.fields[0].label = 'changed';
  request.fields.reverse();
  assert.deepEqual(document, before);
  assert.deepEqual(second.fields, before.spec.fields);
});

test('authored mapper preserves optional description presence including empty text', () => {
  for (const description of [undefined, '', 'Independent description']) {
    const document = authoredFixture();
    if (description === undefined) delete document.spec.description;
    else document.spec.description = description;
    const bytes = JSON.stringify(document);
    const request = buildOtherDmoCreateRequestFromDocument(JSON.parse(bytes), 'default');
    assert.equal(Object.hasOwn(request, 'description'), description !== undefined);
    assert.equal(request.description, description);
  }
});

const unsupportedAuthoredMutations = [
  [
    'source space',
    (d) => {
      d.identity.dataSpace = 'research';
    },
  ],
  [
    'source space case',
    (d) => {
      d.identity.dataSpace = 'Default';
    },
  ],
  [
    'Profile category',
    (d) => {
      d.spec.category = 'Profile';
    },
  ],
  [
    'Engagement category',
    (d) => {
      d.spec.category = 'Engagement';
      d.spec.eventDateTimeFieldName = 'Recorded_AT__c';
    },
  ],
  [
    'extra field',
    (d) => {
      d.spec.fields.push({ ...d.spec.fields[0], name: 'Extra__c' });
    },
  ],
  [
    'missing field',
    (d) => {
      d.spec.fields.shift();
    },
  ],
  [
    'primary type',
    (d) => {
      d.spec.fields[1].dataType = 'Date';
    },
  ],
  [
    'nonprimary type',
    (d) => {
      d.spec.fields[0].dataType = 'Text';
    },
  ],
  [
    'primary dynamic lookup',
    (d) => {
      d.spec.fields[1].isDynamicLookup = true;
    },
  ],
  [
    'nonprimary dynamic lookup',
    (d) => {
      d.spec.fields[0].isDynamicLookup = true;
    },
  ],
  [
    'field description',
    (d) => {
      d.spec.fields[0].description = '';
    },
  ],
  [
    'field category',
    (d) => {
      d.spec.fields[1].category = '';
    },
  ],
  [
    'event reference',
    (d) => {
      d.spec.eventDateTimeFieldName = 'Recorded_AT__c';
    },
  ],
  [
    'modified reference',
    (d) => {
      d.spec.recordModifiedFieldName = 'Recorded_AT__c';
    },
  ],
  [
    'unknown root',
    (d) => {
      d.future = false;
    },
  ],
  [
    'unknown identity',
    (d) => {
      d.identity.future = false;
    },
  ],
  [
    'unknown spec',
    (d) => {
      d.spec.future = false;
    },
  ],
  [
    'unknown field',
    (d) => {
      d.spec.fields[0].future = false;
    },
  ],
  [
    'relationships',
    (d) => {
      d.spec.relationships = [];
    },
  ],
  [
    'runtime expectations',
    (d) => {
      d.expectations = {};
    },
  ],
  [
    'runtime identity',
    (d) => {
      d.createIdentity = {};
    },
  ],
  [
    'runtime qualifiers',
    (d) => {
      d.qualifierBindings = [];
    },
  ],
  [
    'runtime status',
    (d) => {
      d.status = 'projected';
    },
  ],
  [
    'runtime blockers',
    (d) => {
      d.blockers = [];
    },
  ],
  [
    'runtime field metadata',
    (d) => {
      d.spec.fields[1].keyQualifierName = 'Qualifier';
    },
  ],
  [
    'object suffix case',
    (d) => {
      d.identity.apiName = 'Entry__DLM';
    },
  ],
  [
    'repeated suffix',
    (d) => {
      d.identity.apiName = 'Entry__dlm__dlm';
    },
  ],
  [
    'namespaced object',
    (d) => {
      d.identity.apiName = 'ns__Entry__dlm';
    },
  ],
  [
    'reserved prefix',
    (d) => {
      d.identity.apiName = 'SSOTEntry__dlm';
    },
  ],
  [
    'duplicate field',
    (d) => {
      d.spec.fields[0].name = 'case_sensitive2__c';
    },
  ],
  [
    'missing primary',
    (d) => {
      d.spec.fields[1].isPrimaryKey = false;
    },
  ],
  [
    'extra primary',
    (d) => {
      d.spec.fields[0].isPrimaryKey = true;
    },
  ],
];
for (const [name, mutate] of unsupportedAuthoredMutations) {
  test(`authored mapper rejects ${name}`, () => {
    const document = authoredFixture();
    mutate(document);
    const bytes = JSON.stringify(document);
    assert.throws(
      () => buildOtherDmoCreateRequestFromDocument(JSON.parse(bytes), 'default'),
      DmoDocumentError,
    );
  });
}

test('authored mapper requires explicit exact target and refuses projections or malformed documents', () => {
  for (const target of [undefined, '', 'Default', 'research', '../default', {}, 1])
    assert.throws(
      () => buildOtherDmoCreateRequestFromDocument(authoredFixture(), target),
      DmoDocumentError,
    );
  for (const value of [undefined, {}, [], defaultProjection()])
    assert.throws(() => buildOtherDmoCreateRequestFromDocument(value, 'default'), DmoDocumentError);
  const document = authoredFixture();
  Object.defineProperty(document.spec.fields[0], 'label', {
    enumerable: true,
    get() {
      throw new Error('secret');
    },
  });
  assert.throws(
    () => buildOtherDmoCreateRequestFromDocument(document, 'default'),
    DmoDocumentError,
  );
});

// Exercise the production adapter against the same independent joined schema, never an org.
const retrievalFixture = () => {
  const input = commonFixture();
  input.connect.dataSpaceName = 'default';
  input.metadata.mktDataModelAttributes.dataSpaceName = 'default';
  const calls = [];
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '65.0',
    _transport: { httpRequest: () => assert.fail('synthetic Metadata read must not use HTTP') },
    metadata: {
      read: async (type, names) => {
        calls.push({ type, names });
        return [input.metadata];
      },
    },
    request: async (request) => {
      calls.push(request);
      return request.url.includes('/relationships?')
        ? { relationships: [], totalSize: 0 }
        : input.connect;
    },
  };
  const objectApiName = input.connect.name;
  const run = () => retrieveDmo(connection, objectApiName, '65.0', 'default');
  return { input, calls, connection, run };
};

const preflightFixture = () => {
  const fixture = retrievalFixture();
  const source = projectCommonDmoConnectMetadata(
    fixture.input.connect,
    fixture.input.metadata,
    [],
  ).candidate;
  const request = fixture.connection.request;
  fixture.connection.request = async (options) => {
    if (options.url.includes('data-model-objects?')) {
      fixture.calls.push(options);
      return {
        dataModelObject: [{ name: source.identity.apiName, dataSpaceName: 'default' }],
      };
    }
    return request(options);
  };
  return {
    ...fixture,
    source,
    preview: () => preflightDmoDeploy(source, fixture.connection, '65.0', 'default'),
  };
};

test('deploy preflight proves absence only from complete inventory in the explicit scope', async () => {
  const { connection, source, calls } = preflightFixture();
  connection.request = async (request) => {
    calls.push(request);
    return { dataModelObject: [{ name: source.identity.apiName, dataSpaceName: 'foreign' }] };
  };
  const result = await preflightDmoDeploy(source, connection, '65.0', 'default');
  assert.deepEqual(result, {
    outcome: 'create',
    target: 'absent',
    absenceProof: 'complete-inventory',
    diagnostics: [],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('deploy preflight never mistakes 404, 403, network, malformed or incomplete reads for absence', async () => {
  for (const response of [
    Object.assign(new Error('secret-token'), { statusCode: 404 }),
    Object.assign(new Error('secret-token'), { statusCode: 403 }),
    Object.assign(new Error('secret-token'), { statusCode: 401 }),
    new Error('secret-token'),
    undefined,
    {},
    { dataModelObject: [], nextPageToken: 'secret-token' },
    { dataModelObject: [{ name: 'secret-token' }] },
  ]) {
    const { connection, source } = preflightFixture();
    connection.request = async () => {
      if (response instanceof Error) throw response;
      return response;
    };
    const result = await preflightDmoDeploy(source, connection, '65.0', 'default');
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.target, 'unknown');
    assert.equal(result.absenceProof, 'none');
    assert.ok(!JSON.stringify(result).includes('secret-token'));
  }
  const { connection, source } = preflightFixture();
  connection.request = async ({ url }) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return {
      dataModelObject: Array.from({ length: 50 }, (_, index) => ({
        name: `Other${offset + index}__dlm`,
        dataSpaceName: 'default',
      })),
    };
  };
  const result = await preflightDmoDeploy(source, connection, '65.0', 'default');
  assert.equal(result.outcome, 'blocked');
});

test('deploy preflight validates source and explicit scope before target reads', async () => {
  for (const arguments_ of [
    [{}, '65.0', 'default'],
    [undefined, '65.0', 'default'],
  ]) {
    const { connection, calls } = preflightFixture();
    const result = await preflightDmoDeploy(
      arguments_[0],
      connection,
      arguments_[1],
      arguments_[2],
    );
    assert.equal(result.outcome, 'blocked');
    assert.deepEqual(calls, []);
  }
  for (const [version, space] of [
    [undefined, 'default'],
    ['66.0', 'default'],
    ['65.0', undefined],
    ['65.0', 'other'],
  ]) {
    const { connection, source, calls } = preflightFixture();
    const result = await preflightDmoDeploy(source, connection, version, space);
    assert.equal(result.diagnostics[0].code, 'INVALID_SCOPE');
    assert.deepEqual(calls, []);
  }
  const { connection, source, calls } = preflightFixture();
  source.expectations = { token: 'secret' };
  const result = await preflightDmoDeploy(source, connection, '65.0', 'default');
  assert.equal(result.diagnostics[0].code, 'INVALID_SOURCE');
  assert.deepEqual(calls, []);
});

test('deploy preflight qualifies full target and treats reordered identity-keyed fields as unchanged', async () => {
  const { source, input, calls, preview } = preflightFixture();
  source.spec.fields.reverse();
  input.connect.fields.reverse();
  input.metadata.fields.reverse();
  assert.deepEqual(await preview(), {
    outcome: 'unchanged',
    target: 'present',
    absenceProof: 'none',
    diagnostics: [],
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.filter((call) => call.url).every((call) => call.method === 'GET'));
});

for (const [code, mutate] of [
  [
    'OBJECT_CHANGED',
    (d) => {
      d.spec.label = 'Changed';
    },
  ],
  [
    'OBJECT_CHANGED',
    (d) => {
      d.spec.description = '';
    },
  ],
  [
    'CATEGORY_CHANGED',
    (d) => {
      d.spec.category = 'Profile';
    },
  ],
  [
    'FIELD_SET_CHANGED',
    (d) => {
      d.spec.fields[1].name = 'Renamed__c';
    },
  ],
  [
    'FIELD_SET_CHANGED',
    (d) => {
      d.spec.fields.pop();
    },
  ],
  [
    'FIELD_CHANGED',
    (d) => {
      d.spec.fields[1].label = 'Changed';
    },
  ],
  [
    'FIELD_CHANGED',
    (d) => {
      d.spec.fields[1].category = 'Changed';
    },
  ],
  [
    'FIELD_CHANGED',
    (d) => {
      d.spec.fields[1].isDynamicLookup = true;
    },
  ],
  [
    'IMMUTABLE_FIELD_CHANGED',
    (d) => {
      d.spec.fields[1].dataType = 'Number';
    },
  ],
  [
    'IMMUTABLE_FIELD_CHANGED',
    (d) => {
      for (const field of d.spec.fields) field.isPrimaryKey = !field.isPrimaryKey;
    },
  ],
]) {
  test(`deploy preflight blocks changes with ${code}`, async () => {
    const { source, preview } = preflightFixture();
    mutate(source);
    const result = await preview();
    const primary = source.spec.fields.find((field) => field.isPrimaryKey);
    if (
      source.spec.category !== 'Other' ||
      primary.dataType !== 'Text' ||
      primary.isDynamicLookup
    ) {
      assert.equal(result.outcome, 'blocked');
      assert.equal(result.diagnostics[0].code, 'SOURCE_EXECUTION_UNSUPPORTED');
      return;
    }
    assert.equal(result.outcome, 'blocked-changes');
    assert.equal(result.target, 'present');
    assert.ok(result.diagnostics.some((item) => item.code === code));
    assert.equal(result.diagnostics.at(-1).code, 'UPDATE_UNSUPPORTED');
    assert.ok(!JSON.stringify(result).includes(source.identity.apiName));
  });
}

test('deploy preflight refuses false no-op when generated target projection or acquisition is unsupported', async () => {
  for (const mutate of [
    ({ input }) => {
      input.connect.fields.find((field) => field.creationType === 'System').label = 'Unknown';
    },
    ({ input }) => {
      input.metadata.mktDataModelAttributes.dataModelTaxonomy = 'Unknown';
    },
    ({ input }) => {
      input.connect.unknown = 'secret-token';
    },
    ({ connection }) => {
      connection.metadata.read = async () => [];
    },
    ({ connection }) => {
      connection.metadata.read = async () => {
        throw new Error('secret-token');
      };
    },
    ({ input }) => {
      input.connect.category = 'PROFILE';
    },
  ]) {
    const fixture = preflightFixture();
    mutate(fixture);
    const result = await fixture.preview();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.target, 'present');
    assert.equal(result.diagnostics[0].code, 'TARGET_UNQUALIFIED');
    assert.ok(!JSON.stringify(result).includes('secret-token'));
  }
});

test('retrieval uses real core Metadata read and Connect adapters and retains validated expectations', async () => {
  const { input, calls, run } = retrievalFixture();
  const result = await run();
  assert.deepEqual(result, projectCommonDmoConnectMetadata(input.connect, input.metadata, []));
  assert.equal(result.candidate.spec.fields.length, 2);
  assert.deepEqual(calls[1], { type: 'CustomObject', names: ['Audit_Ledger__dlm'] });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'GET');
  assert.equal(
    calls[0].url,
    'https://synthetic.example/services/data/v65.0/ssot/data-model-objects/Audit_Ledger__dlm',
  );
  assert.match(calls[2].url, /relationships\?dataspace=default&limit=20&offset=0/u);
  assert.equal(calls[2].method, 'GET');
  result.expectations.metadata.fields[0].required = true;
  assert.equal(input.metadata.fields[0].required, false);
  assert.throws(() => buildOtherDmoCreateRequest(result, 'default'), DmoDocumentError);
});

test('retrieval rejects unsupported explicit scope and mismatched core version before acquisition', async () => {
  for (const arguments_ of [
    ['Audit_Ledger__dlm', '64.0', 'default'],
    ['Audit_Ledger__dlm', '66.0', 'default'],
    ['Audit_Ledger__dlm', undefined, 'default'],
    ['Audit_Ledger__dlm', '65.0', 'research'],
    ['Audit_Ledger__dlm', '65.0', undefined],
    ['Audit_Ledger__dlm', '65.0', 'Default'],
    ['ns__Ledger__dlm', '65.0', 'default'],
    ['SSOTLedger__dlm', '65.0', 'default'],
    ['Ledger__dlm/escape', '65.0', 'default'],
    ['Ledger', '65.0', 'default'],
  ]) {
    const { connection, calls } = retrievalFixture();
    await assert.rejects(retrieveDmo(connection, ...arguments_), {
      code:
        arguments_[1] === '65.0' && arguments_[2] === 'default'
          ? 'UNSUPPORTED_DMO_IDENTITY'
          : 'INVALID_SCOPE',
    });
    assert.deepEqual(calls, []);
  }
  const { connection, calls, run } = retrievalFixture();
  connection.getApiVersion = () => '66.0';
  await assert.rejects(run(), { code: 'INVALID_SCOPE' });
  assert.deepEqual(calls, []);
});

test('retrieval rejects missing ambiguous and wrapped Metadata records without partial success', async () => {
  for (const response of [
    undefined,
    [],
    [{}],
    [{ fields: [] }],
    [{ fullName: 'Foreign__dlm' }],
    [[], []],
    { records: [] },
  ]) {
    const { connection, run } = retrievalFixture();
    connection.metadata.read = async () => response;
    await assert.rejects(run(), { code: 'INVALID_METADATA' });
  }
  const { connection, input, run } = retrievalFixture();
  connection.metadata.read = async () => [input.metadata, input.metadata];
  await assert.rejects(run(), { code: 'INVALID_METADATA' });
});

test('retrieval validates exact joins category default binding and complete relationship absence', async () => {
  for (const change of [
    (index) => {
      index.connect.name = 'Foreign__dlm';
    },
    (index) => {
      index.metadata.fields[0].fullName = 'Foreign__c';
    },
    (index) => {
      index.connect.dataSpaceName = 'research';
      index.metadata.mktDataModelAttributes.dataSpaceName = 'research';
    },
  ]) {
    const { input, run } = retrievalFixture();
    change(input);
    await assert.rejects(run(), DmoDocumentError);
  }
  for (const page of [
    { relationships: [], totalSize: 1 },
    { relationships: [] },
    {
      relationships: [
        {
          name: 'Link',
          sourceObject: { name: 'Audit_Ledger__dlm' },
          targetObject: { name: 'Foreign__dlm' },
        },
      ],
      totalSize: 1,
    },
  ]) {
    const { connection, input, run } = retrievalFixture();
    connection.request = async (request) =>
      request.url.includes('/relationships?') ? page : input.connect;
    await assert.rejects(run());
  }
});

test('common service through command and writer publishes varied authored types only', async () => {
  for (const count of [1, 12]) {
    const { input, connection } = retrievalFixture();
    input.connect.fields = input.connect.fields.filter((field) => field.name !== 'Recorded__c');
    input.metadata.fields = input.metadata.fields.filter(
      (field) => field.fullName !== 'Recorded__c',
    );
    const types = [
      'Number',
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
    for (let index = 0; index < count - 1; index++) {
      const name = `Metric${index}__c`;
      const type = types[index];
      input.connect.fields.push({
        name,
        label: name,
        type,
        creationType: 'Custom',
        usageTag: 'None',
        isDistinct: false,
        isDynamicLookup: true,
        category: 'Synthetic',
        description: '',
      });
      input.metadata.fields.push({
        fullName: name,
        label: name,
        type,
        required: false,
        description: '',
        mktDataModelFieldAttributes: {
          definitionCreationType: 'Custom',
          usageTag: 'None',
          isDynamicLookup: 'true',
        },
      });
    }
    const directory = await mkdtemp(path.join(os.tmpdir(), 'data360-integration-'));
    const command = Object.create(Retrieve.prototype);
    command.config = { pjson: { version: '0.1.0' } };
    command.parse = async () => ({
      flags: {
        metadata: ['dmo:Audit_Ledger__dlm'],
        'api-version': '65.0',
        'data-space': 'default',
        'output-dir': directory,
        overwrite: false,
        'target-org': { getOrgId: () => 'synthetic-org', getConnection: () => connection },
      },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic-org',
      getConnection: () => connection,
    });
    command.selectDocuments = async () => ['Audit_Ledger__dlm'];
    command.acquire = retrieveDmo;
    command.writeDocument = writeDmoDocument;
    const result = await command.run();
    assert.equal(result.status, 'success');
    const file = result.result.items[0].path;
    assert.equal(file, path.join(directory, 'data360', 'default', 'dmo', 'Audit_Ledger__dlm.json'));
    const document = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(document.spec.fields.length, count);
    assert.deepEqual(Object.keys(document).toSorted(), [
      'identity',
      'kind',
      'schemaVersion',
      'spec',
    ]);
    assert.ok(!JSON.stringify(document).includes('synthetic-org'));
    const unchanged = await command.run();
    assert.equal(unchanged.result.items[0].outcome, 'unchanged');
  }
});

test('incomplete common service variants expose specific diagnostics and never publish', async () => {
  for (const [change, code] of [
    [
      (input) => {
        input.connect.category = 'PROFILE';
      },
      'OBJECT_CATEGORY_TAXONOMY_REPLAY_UNVERIFIED',
    ],
    [
      (input) => {
        input.connect.category = 'ENGAGEMENT';
      },
      'ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE',
    ],
    [
      (input) => {
        input.metadata.mktDataModelAttributes.dataModelTaxonomy = 'Unknown';
      },
      'OBJECT_TAXONOMY_REPLAY_UNVERIFIED',
    ],
    [
      (input) => {
        input.metadata.fields.find((field) => field.fullName === 'Ticket__c').required = true;
      },
      'FIELD_REQUIRED_REPLAY_UNVERIFIED',
    ],
  ]) {
    const { input, run } = retrievalFixture();
    change(input);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'data360-blocked-'));
    const output = path.join(directory, 'absent');
    await assert.rejects(
      async () => {
        const projection = await run();
        await writeDmoDocument(projection.candidate, output, false);
      },
      { code },
    );
    await assert.rejects(lstat(output), { code: 'ENOENT' });
  }
});

const fail = () => {
  throw new Error('secret remote payload');
};

test('retrieval propagates payload-free acquisition failure and never returns a partial result', async () => {
  for (const phase of ['detail', 'metadata', 'relationships']) {
    const { connection, input, run } = retrievalFixture();
    if (phase === 'metadata') connection.metadata.read = fail;
    else
      connection.request = async (request) => {
        if (phase === 'detail' || request.url.includes('/relationships?')) fail();
        return input.connect;
      };
    await assert.rejects(run(), (error) => {
      assert.ok(error instanceof DmoRetrieveError || error.name === 'ConnectError');
      assert.ok(!JSON.stringify(error).includes('secret'));
      assert.ok(!error.message.includes('secret'));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

const executionFixture = () => {
  const fixture = preflightFixture();
  const read = fixture.connection.request;
  const posts = [];
  fixture.connection.request = async function (request, options) {
    if (request.method === 'POST') {
      posts.push(request);
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.throws(() => options.followRedirect('https://foreign.example'), {
        code: 'INVALID_REQUEST',
      });
      return; // Even malformed/empty HTTP success requires independent verification.
    }
    if (request.url.includes('data-model-objects?')) {
      fixture.calls.push(request);
      return { dataModelObject: [] };
    }
    return read(request, options);
  };
  return {
    ...fixture,
    posts,
    execute: () => executeDmoCreate(fixture.source, fixture.connection, '65.0', 'default'),
  };
};

test('executor re-preflights, creates once and independently qualifies readback, not POST response', async () => {
  const f = executionFixture();
  f.source.spec.fields.reverse();
  const result = await f.execute();
  assert.equal(result.outcome, 'created');
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(f.posts.length, 1);
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(
    f.posts[0].url,
    'https://synthetic.example/services/data/v65.0/ssot/data-model-objects',
  );
  const body = JSON.parse(f.posts[0].body);
  assert.equal(body.name, f.source.identity.apiName.slice(0, -5));
  assert.equal(body.fields.length, f.source.spec.fields.length);
  assert.ok(f.calls.some((call) => call.type === 'CustomObject'));
  assert.ok(f.calls.some((call) => call.url?.includes('/relationships?')));
});

test('executor fresh existing target is noop or blocked differences with no POST', async () => {
  for (const different of [false, true]) {
    const f = preflightFixture();
    if (different) f.source.spec.label += ' changed';
    const result = await executeDmoCreate(f.source, f.connection, '65.0', 'default');
    assert.equal(result.outcome, different ? 'blocked' : 'unchanged');
    assert.equal(result.mutation, 'not-attempted');
    assert.ok(f.calls.every((call) => !call.method || call.method === 'GET'));
  }
});

test('executor input and scope failures never POST; preview objects are not authorization', async () => {
  for (const [document, api, space] of [
    [{}, '65.0', 'default'],
    [{ outcome: 'create' }, '65.0', 'default'],
    [undefined, '66.0', 'default'],
    [undefined, '65.0', 'foreign'],
  ]) {
    const f = executionFixture();
    const result = await executeDmoCreate(document ?? f.source, f.connection, api, space);
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(f.posts.length, 0);
    assert.equal(f.calls.length, 0);
  }
  const f = executionFixture();
  f.connection.request = async () => {
    throw new Error('secret');
  };
  const result = await f.execute();
  assert.equal(result.mutation, 'not-attempted');
});

test('preview and executor reject known unqualifiable authored properties before target reads', async () => {
  for (const variant of ['Profile', 'Engagement', 'Number', 'dynamic']) {
    const f = executionFixture();
    const primary = f.source.spec.fields.find((field) => field.isPrimaryKey);
    if (variant === 'Profile' || variant === 'Engagement') {
      f.source.spec.category = variant;
      if (variant === 'Engagement')
        f.source.spec.eventDateTimeFieldName = f.source.spec.fields.find(
          (field) => field.dataType === 'DateTime',
        ).name;
    } else if (variant === 'Number') primary.dataType = variant;
    else primary.isDynamicLookup = true;
    // These remain valid portable/offline requests, not execution capabilities.
    assert.doesNotThrow(() => buildDmoCreateRequestFromDocument(f.source, 'default'));
    const preview = await f.preview();
    assert.equal(preview.outcome, 'blocked');
    assert.equal(preview.diagnostics[0].code, 'SOURCE_EXECUTION_UNSUPPORTED');
    const result = await f.execute();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(f.posts.length, 0);
    assert.equal(f.calls.length, 0);
  }
});

test('executor binds detached document before asynchronous preflight caller mutation', async () => {
  const f = executionFixture();
  const original = JSON.stringify(f.source);
  const read = f.connection.request;
  f.connection.request = async function (request, options) {
    if (request.method === 'GET' && request.url.includes('data-model-objects?')) {
      f.source.spec.label = 'changed during await';
      f.source.spec.fields[0].label = 'changed field';
      f.source.identity.apiName = 'Different__dlm';
    }
    return read.call(this, request, options);
  };
  const result = await f.execute();
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(JSON.parse(f.posts[0].body).label, JSON.parse(original).spec.label);
});

test('executor POST errors retain unknown possible mutation, redact payloads and never retry', async () => {
  for (const statusCode of [undefined, 401, 403, 409, 500]) {
    const f = executionFixture();
    const read = f.connection.request;
    f.connection.request = async function (request, options) {
      if (request.method === 'POST') {
        f.posts.push(request);
        throw Object.assign(new Error('secret-token'), { statusCode });
      }
      return read.call(this, request, options);
    };
    const result = await f.execute();
    assert.equal(result.mutation, 'unknown');
    assert.equal(result.outcome, 'failed');
    assert.equal(result.diagnostics[0].code, 'CREATE_UNCONFIRMED');
    assert.match(result.diagnostics[0].message, /may have occurred/u);
    assert.ok(!JSON.stringify(result).includes('secret-token'));
    assert.equal(f.posts.length, 1);
    assert.equal(f.calls.length, 1);
  }
});

for (const failure of ['read', 'mismatch', 'generated', 'qualifier', 'malformed']) {
  test(`executor ${failure} readback never reports verified success or retries`, async () => {
    const f = executionFixture();
    if (failure === 'mismatch') f.source.spec.label += ' changed';
    if (failure === 'generated')
      f.input.connect.fields.find((field) => field.creationType === 'System').label = 'unknown';
    if (failure === 'qualifier')
      f.input.connect.fields.find((field) => field.keyQualifierName).keyQualifierName = 'missing';
    const read = f.connection.request;
    f.connection.request = async function (request, options) {
      if (request.method === 'GET' && !request.url.includes('data-model-objects?')) {
        if (failure === 'read') throw new Error('secret-token');
        if (failure === 'malformed') return {};
      }
      return read.call(this, request, options);
    };
    const result = await f.execute();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(
      result.diagnostics[0].code,
      failure === 'mismatch' ? 'READBACK_MISMATCH' : 'READBACK_UNQUALIFIED',
    );
    assert.equal(f.posts.length, 1);
    assert.ok(!JSON.stringify(result).includes('secret-token'));
  });
}

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
