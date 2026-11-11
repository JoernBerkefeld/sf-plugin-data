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
      creationType: 'Custom',
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
/**
 * Mark the target fields the org reports as mapped, as a fresh DMO read does.
 * @param {string[]} mapped Mapped target field names.
 * @returns {object} Parent readers.
 */
const mappedDependencies = (mapped) => {
  const deps = dependencies();
  const read = deps.target.get;
  deps.target.get = async () => {
    const definition = await read();
    for (const field of definition.fields) if (mapped.includes(field.name)) field.isMapped = true;
    return definition;
  };
  return deps;
};
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

test('mapping targets other than custom and standard DMOs are refused', async () => {
  for (const change of [
    { creationType: 'Standard' },
    { creationType: 'Standard', name: 'ssot__Test__dlm' },
  ]) {
    const deps = dependencies();
    const read = deps.target.get;
    deps.target.get = async () => ({ ...(await read()), ...change });
    const document = desired();
    if (change.name) document.spec.targetEntityDeveloperName = change.name;
    const plan = await preflightNativeMapping(document, client(), deps);
    assert.equal(plan.operation, 'create', JSON.stringify(change));
    assert.equal(plan.activatesStandardDmo, true);
  }
  for (const change of [
    { creationType: 'Adg' },
    { creationType: 'Bridge' },
    { creationType: undefined },
    { name: 'ssot__Test__dlm' },
  ]) {
    const deps = dependencies();
    const read = deps.target.get;
    deps.target.get = async () => ({ ...(await read()), ...change });
    const document = desired();
    if (change.name) document.spec.targetEntityDeveloperName = change.name;
    await assert.rejects(
      preflightNativeMapping(document, client(), deps),
      (error) => error.code === 'MAPPING_TARGET_UNSUPPORTED',
      JSON.stringify(change),
    );
  }
  const plan = await preflightNativeMapping(desired(), client(), dependencies());
  assert.equal(plan.writes.length, 1);
  assert.ok(!('activatesStandardDmo' in plan));
});

test('mapping multi-pair delta needs the mapped key pair as evidence, not an API version', async () => {
  // Without the org's mapped marker on the key pair nothing proves the layout: no write.
  await assert.rejects(
    preflightNativeMapping(desired(), client(['Id__c']), dependencies()),
    /PROTECTED_LAYOUT_UNPROVEN/,
  );
  const deps = mappedDependencies(['Id__c']);
  for (const apiVersion of ['61.0', '64.0', '68.0']) {
    const plan = await preflightNativeMapping(
      desired(),
      { ...client(['Id__c']), apiVersion },
      deps,
    );
    assert.equal(plan.operation, 'update', apiVersion);
    assert.deepEqual(
      plan.writes[0].body.fieldMapping.map((field) => field.sourceFieldDeveloperName),
      ['Optional__c', 'Another__c'],
    );
  }
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

test('mapping same-target replacement and source retarget additions are left to Salesforce', async () => {
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
    // Salesforce decides about shared sources/targets; the plugin only keeps the key pair.
    const plan = await preflightNativeMapping(
      input,
      client(['Id__c', 'Another__c']),
      mappedDependencies(['Id__c', 'Another__c']),
    );
    assert.equal(plan.operation, 'update');
    assert.deepEqual(plan.removals, []);
    assert.deepEqual(plan.writes[0].body.fieldMapping, [
      { sourceFieldDeveloperName, targetFieldDeveloperName },
    ]);
  }
});
