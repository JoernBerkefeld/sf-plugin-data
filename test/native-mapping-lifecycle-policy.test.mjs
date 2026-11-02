import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { preflightNativeMapping } from '../lib/services/native-mapping.js';

const pair = (name) => ({
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
  developerName: `observed_${name}`,
});
const names = ['Id__c', 'Optional__c', 'Another__c'];
const raw = (fields = names) => ({
  developerName: 'TargetMapping',
  sourceEntityDeveloperName: 'Test__dll',
  targetEntityDeveloperName: 'Test__dlm',
  status: 'ACTIVE',
  fieldMappings: fields.map((name) => pair(name)),
});
const desired = () => ({
  schemaVersion: 1,
  kind: 'mapping',
  identity: { apiName: 'SourceMapping', dataSpace: 'default' },
  spec: {
    sourceEntityDeveloperName: 'Test__dll',
    targetEntityDeveloperName: 'Test__dlm',
    fieldMappings: raw().fieldMappings,
  },
});
const dependencies = (fields = names) => ({
  source: {
    get: async () => ({
      name: 'Test__dll',
      label: 'Test',
      category: 'Other',
      dataSpaceInfo: [{ name: 'default' }],
      fields: fields.map((name) => ({
        name,
        label: name,
        dataType: 'Text',
        isPrimaryKey: name === 'Id__c',
      })),
    }),
  },
  target: {
    get: async () => ({
      name: 'Test__dlm',
      label: 'Test',
      category: 'OTHER',
      dataSpaceName: 'default',
      fields: fields.map((name) => ({
        name,
        label: name,
        type: 'Text',
        creationType: 'Custom',
        isPrimaryKey: name === 'Id__c',
      })),
    }),
  },
});
const client = (fields) => ({
  list: async () => ({ objectSourceTargetMaps: fields ? [raw(fields)] : [] }),
  get: async () => raw(fields),
});

test('mapping create preserves arbitrary custom Id/system-looking fields rather than blanket stripping', async () => {
  const extras = ['ExternalId__c', 'DataSource__c'];
  const fields = [...names, ...extras];
  const document = desired();
  document.spec.fieldMappings = fields.map((name) => pair(name));
  const plan = await preflightNativeMapping(document, client(), dependencies(fields));
  assert.deepEqual(
    plan.writes[0].body.fieldMapping.map((field) => field.sourceFieldDeveloperName),
    fields,
  );
});

test('mapping unqualified multi-pair delta is blocked before any write', async () => {
  await assert.rejects(
    preflightNativeMapping(desired(), client(['Id__c']), dependencies()),
    /MULTI_PAIR_UPDATE/,
  );
});

test('mapping single compatible addition has no arbitrary Text or primary-key restriction', async () => {
  const deps = dependencies();
  for (const side of ['source', 'target']) {
    const read = deps[side].get;
    deps[side].get = async () => {
      const definition = await read();
      definition.fields = definition.fields.map((field) => ({
        ...field,
        ...(side === 'source' ? { dataType: 'Number' } : { type: 'Number' }),
      }));
      return definition;
    };
  }
  const plan = await preflightNativeMapping(desired(), client(['Optional__c', 'Another__c']), deps);
  assert.deepEqual(plan.writes[0].body.fieldMapping, [
    {
      sourceFieldDeveloperName: 'Id__c',
      targetFieldDeveloperName: 'Id__c',
    },
  ]);
});

test('mapping same-target replacement and source retarget additions are blocked', async () => {
  for (const [sourceFieldDeveloperName, targetFieldDeveloperName] of [
    ['Optional__c', 'Id__c'],
    ['Id__c', 'Optional__c'],
  ]) {
    const input = desired();
    input.spec.fieldMappings = [
      ...raw(['Id__c', 'Another__c']).fieldMappings,
      {
        sourceFieldDeveloperName,
        targetFieldDeveloperName,
      },
    ];
    await assert.rejects(
      preflightNativeMapping(input, client(['Id__c', 'Another__c']), dependencies()),
      /RETARGET/,
    );
  }
});
