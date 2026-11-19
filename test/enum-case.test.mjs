import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { foldEnums, sameEnum, sameRecord } from '../lib/artifacts/enum-case.js';
import { sameDataTransformDocument } from '../lib/artifacts/data-transform-document.js';
import { crmDataStreamPatch } from '../lib/artifacts/data-stream-document.js';
import {
  calculatedInsightMatches,
  observeNativeCalculatedInsight,
} from '../lib/artifacts/native-calculated-insight-document.js';
import { preflightDataTransformDeploy } from '../lib/services/preflight-data-transform-deploy.js';
import { preflightNativeDlo } from '../lib/services/native-dlo.js';
import { nativeDmoConfirmed, preflightNativeDmo } from '../lib/services/native-dmo.js';

/*
 * Salesforce stores some enum values in its own letter case (live API 68, isolated-source
 * 2026-11-16: a DLO created with category `other` and field type `text` reads `Other`/`Text`;
 * a transform `fullRunFrequency` `Daily` reads `DAILY`). A hand-written file with another case
 * deploys unchanged the second time; names, labels and code still compare exactly.
 */

const dloField = (name, primary = false) => ({
  name,
  label: name,
  dataType: 'Text',
  isPrimaryKey: primary,
});
const dmoField = (name, creationType, extra = {}) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: false,
  creationType,
  usageTag: 'None',
  ...extra,
});
const dmoFile = (type) => ({
  schemaVersion: 1,
  kind: 'dmo',
  c__dataSpace: 'default',
  identity: { apiName: 'CliEnum__dlm' },
  spec: {
    label: 'Cli Enum',
    category: 'other',
    fields: [
      { name: 'Id__c', label: 'Id', dataType: 'text', isPrimaryKey: true },
      { name: 'Note__c', label: 'Note', dataType: type, isPrimaryKey: false },
    ],
  },
});
const crmSpec = (category, type, mode, returntype) => ({
  dataStreamType: 'SFDC',
  refreshConfig: { refreshMode: mode, frequency: { frequencyType: 'BATCH' } },
  dataLakeObjectInfo: {
    name: 'CliEnum_Home__dll',
    label: 'CliEnum Home',
    category,
    fields: [{ name: 'Id', label: 'Id', dataType: type, isPrimaryKey: true }],
  },
  mappings: [
    { targetFieldName: 'Id', sourceFieldName: 'Id' },
    { targetFieldName: 'F', formula: 'sourceField["Name"]', targetFieldReturntype: returntype },
  ],
});

const dloNative = () => ({
  name: 'CliA5Src__dll',
  id: '1dlaj00000ArYgvAAF',
  label: 'CliA5 Src',
  category: 'Other',
  status: 'ACTIVE',
  dataSpaceInfo: [{ name: 'default', label: 'default' }],
  dataLakeFieldInfoRepresentation: [
    dloField('KQ_Id__c'),
    dloField('Id__c', true),
    dloField('Name__c'),
    dloField('cdp_sys_SourceVersion__c'),
    dloField('DataSource__c'),
    dloField('DataSourceObject__c'),
    dloField('InternalOrganization__c'),
  ],
});
const dmoNative = () => ({
  name: 'CliEnum__dlm',
  label: 'Cli Enum',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  isEnabled: true,
  fields: [
    dmoField('Id__c', 'Custom', { isPrimaryKey: true, keyQualifierName: 'KQ_Id' }),
    dmoField('Note__c', 'Custom'),
    dmoField('KQ_Id__c', 'System', { usageTag: 'KeyQualifier' }),
  ],
});

test('sameEnum ignores letter case of text only; foldEnums touches only the named keys', () => {
  assert.equal(sameEnum('Daily', 'DAILY'), true);
  assert.equal(sameEnum('other', 'Other'), true);
  assert.equal(sameEnum('Daily', 'Weekly'), false);
  assert.equal(sameEnum(1, 1), true);
  assert.equal(sameEnum('1', 1), false);
  assert.equal(sameEnum(undefined, 'Text'), false);
  assert.equal(
    sameRecord(
      { name: 'Id__c', dataType: 'text' },
      { name: 'Id__c', dataType: 'Text' },
      new Set(['dataType']),
    ),
    true,
  );
  assert.equal(
    sameRecord(
      { name: 'id__c', dataType: 'Text' },
      { name: 'Id__c', dataType: 'Text' },
      new Set(['dataType']),
    ),
    false,
  );
  const value = { type: 'Batch', label: 'Mixed Case', nested: [{ type: 'stl', sql: 'select a' }] };
  assert.deepEqual(foldEnums(value, new Set(['type'])), {
    type: 'BATCH',
    label: 'Mixed Case',
    nested: [{ type: 'STL', sql: 'select a' }],
  });
  // The input is never changed: the folded form is for comparison only.
  assert.equal(value.type, 'Batch');
});

const transformInput = (overrides = {}) => ({
  name: 'CliEnumT',
  label: 'Cli Enum T',
  type: 'BATCH',
  dataSpaceName: 'default',
  fullRunFrequency: 'DAILY',
  definitions: [
    {
      type: 'DCSQL',
      manifest: {
        macros: {},
        nodes: { 'model.input1': { compiled_code: 'SELECT Id__c FROM S__dll' } },
        sources: {},
      },
      outputDataObjects: [
        {
          name: 'Out__dll',
          label: 'Out',
          type: 'dataLakeObject',
          category: 'Other',
          fields: [{ name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true }],
        },
      ],
    },
  ],
  ...overrides,
});
const transform = (definition) => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  c__dataSpace: 'default',
  definition,
});

test('a hand-written transform with other enum casing is unchanged; text changes are not', () => {
  const org = transform(transformInput());
  const authored = transformInput({ type: 'Batch', fullRunFrequency: 'Daily' });
  authored.definitions[0].type = 'DcSql';
  authored.definitions[0].outputDataObjects[0].category = 'other';
  authored.definitions[0].outputDataObjects[0].type = 'DataLakeObject';
  authored.definitions[0].outputDataObjects[0].fields[0].type = 'text';
  assert.equal(sameDataTransformDocument(org, transform(authored)), true);
  for (const change of [
    (v) => {
      v.fullRunFrequency = 'Weekly';
    },
    (v) => {
      v.label = 'cli enum t';
    },
    (v) => {
      v.definitions[0].manifest.nodes['model.input1'].compiled_code = 'select Id__c from S__dll';
    },
    (v) => {
      v.definitions[0].outputDataObjects[0].fields[0].name = 'id__c';
    },
  ]) {
    const changed = structuredClone(authored);
    change(changed);
    assert.equal(sameDataTransformDocument(org, transform(changed)), false);
  }
});

test('transform preflight: the repeat deploy of a mixed-case file is unchanged, GET-only', async () => {
  const stored = {
    ...transformInput(),
    id: '1dt000000000001AAA',
    status: 'ACTIVE',
    creationType: 'CUSTOM',
  };
  const calls = [];
  const client = {
    get: async () => {
      calls.push('get');
      return structuredClone(stored);
    },
    schedule: async () => {
      calls.push('schedule');
      return { frequency: 'None', type: 'None' };
    },
    validate: async () => {
      calls.push('validate');
      return { issues: [] };
    },
  };
  const plan = await preflightDataTransformDeploy(
    transform(transformInput({ fullRunFrequency: 'Daily', type: 'batch' })),
    { operation: 'update', targetId: stored.id },
    client,
  );
  assert.equal(plan.operation, 'unchanged');
  assert.deepEqual(calls, ['get', 'schedule']);
  // A real change is still sent as authored, in the authored case.
  const changed = await preflightDataTransformDeploy(
    transform(transformInput({ fullRunFrequency: 'Weekly' })),
    { operation: 'update', targetId: stored.id },
    client,
  );
  assert.equal(changed.operation, 'update');
  assert.equal(changed.document.definition.fullRunFrequency, 'Weekly');
});

test('DLO: lower-case category and field type deploy unchanged against the stored spelling', async () => {
  // dloNative() has the shape of the live GET of CliA5Src__dll (created with `other` / `text`).
  const authored = {
    schemaVersion: 1,
    kind: 'dlo',
    c__dataSpace: ['default'],
    identity: { apiName: 'CliA5Src__dll' },
    spec: {
      label: 'CliA5 Src',
      category: 'other',
      fields: [
        { name: 'Id__c', label: 'Id__c', dataType: 'text', isPrimaryKey: true },
        { name: 'Name__c', label: 'Name__c', dataType: 'Text', isPrimaryKey: false },
      ],
    },
  };
  const plan = await preflightNativeDlo(authored, { get: async () => dloNative() }, 'default');
  assert.equal(plan.operation, 'unchanged');
  // Another category or type is still refused; a label differing only in case is an update.
  await assert.rejects(
    preflightNativeDlo(
      { ...authored, spec: { ...authored.spec, category: 'Profile' } },
      { get: async () => dloNative() },
      'default',
    ),
    /UNSUPPORTED_DLO_CATEGORY_CHANGE/u,
  );
  const typed = structuredClone(authored);
  typed.spec.fields[1].dataType = 'Number';
  await assert.rejects(
    preflightNativeDlo(typed, { get: async () => dloNative() }, 'default'),
    /FIELD_CHANGE/u,
  );
  const relabelled = { ...authored, spec: { ...authored.spec, label: 'clia5 src' } };
  const relabel = await preflightNativeDlo(relabelled, { get: async () => dloNative() }, 'default');
  assert.equal(relabel.operation, 'update');
});

test('DMO: a field type differing only in case is no change; another type stays blocked', async () => {
  const plan = await preflightNativeDmo(
    dmoFile('TEXT'),
    { get: async () => dmoNative() },
    'default',
  );
  assert.equal(plan.operation, 'unchanged');
  await assert.rejects(
    preflightNativeDmo(dmoFile('Number'), { get: async () => dmoNative() }, 'default'),
    /UNSUPPORTED_DMO_FIELD_CHANGE/u,
  );
  const actual = structuredClone(dmoFile('Text'));
  actual.spec.category = 'OTHER';
  assert.equal(nativeDmoConfirmed(dmoFile('text'), actual), true);
});

test('calculated insight: enum keys ignore case, the SQL and name do not', () => {
  const observed = observeNativeCalculatedInsight({
    apiName: 'CliEnum__cio',
    dataSpace: 'default',
    displayName: 'Cli Enum',
    expression: 'SELECT 1',
    definitionType: 'CALCULATED_METRIC',
    publishScheduleInterval: 'NOT_SCHEDULED',
  });
  const file = (overrides) => ({ ...observed, ...overrides });
  assert.equal(
    calculatedInsightMatches(file({ publishScheduleInterval: 'not_scheduled' }), observed),
    true,
  );
  assert.equal(
    calculatedInsightMatches(file({ definitionType: 'Calculated_Metric' }), observed),
    true,
  );
  assert.equal(calculatedInsightMatches(file({ publishScheduleInterval: 'ONE' }), observed), false);
  assert.equal(calculatedInsightMatches(file({ displayName: 'cli enum' }), observed), false);
  assert.equal(calculatedInsightMatches(file({ expression: 'select 1' }), observed), false);
});

test('CRM stream: enum casing in the DLO, refresh mode and return type is no change', () => {
  const org = crmSpec('Other', 'Text', 'UPSERT', 'Text');
  assert.deepEqual(crmDataStreamPatch(crmSpec('other', 'text', 'Upsert', 'TEXT'), org).parts, []);
  assert.deepEqual(
    crmDataStreamPatch(crmSpec('other', 'text', 'Upsert', 'TEXT'), org).unsupported,
    [],
  );
  assert.deepEqual(crmDataStreamPatch(crmSpec('Profile', 'Text', 'UPSERT', 'Text'), org).parts, [
    'dataLakeObjectInfo',
  ]);
  const relabelled = crmSpec('Other', 'Text', 'UPSERT', 'Text');
  relabelled.dataLakeObjectInfo.label = 'clienum home';
  assert.deepEqual(crmDataStreamPatch(relabelled, org).parts, ['dataLakeObjectInfo']);
});
