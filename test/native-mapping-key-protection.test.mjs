import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNativeMapping,
  NativeMappingError,
} from '../lib/artifacts/native-mapping-document.js';
import {
  deployNativeMapping,
  preflightNativeMapping,
  retrieveNativeMapping,
} from '../lib/services/native-mapping.js';
import { executeMapping, preflightMapping } from '../lib/services/command-native-mapping.js';

// A custom DMO keyed on a Number field with another name than the source key.
const keyPair = ['Num__c', 'Code__c'];
const numberPair = ['Num__c', 'Num__c'];
const renamedPair = ['Note__c', 'Other__c'];
const textPair = ['Num__c', 'NumT__c'];
const authored = [keyPair, numberPair, renamedPair, textPair];
const systemNames = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c'];
const generated = [...systemNames, 'KQ_Code__c'].map((name) => [name, name]);
const MAPPING = 'TargetGenerated_123';

const pair = ([from, to]) => ({
  sourceFieldDeveloperName: from,
  targetFieldDeveloperName: to,
  developerName: `target_${from}_${to}`,
});
const names = ([from, to]) => ({ sourceFieldDeveloperName: from, targetFieldDeveloperName: to });
const raw = (pairs = [...authored, ...generated]) => ({
  developerName: MAPPING,
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  status: 'ACTIVE',
  fieldMappings: pairs.map((value) => pair(value)),
});
/**
 * Portable file under a source-side name, without selectors.
 * @param {string[][]} pairs Pairs as [source, target].
 * @returns {object} Mapping document.
 */
const file = (pairs) => {
  const document = normalizeNativeMapping(raw(pairs));
  document.identity.apiName = 'SourceGenerated_456';
  for (const field of document.spec.fieldMappings) delete field.developerName;
  return document;
};
const source = (primaryKey = 'Num__c') => ({
  name: 'Example__dll',
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: ['Num__c', 'Note__c', ...systemNames, 'KQ_Code__c'].map((name) => ({
    name,
    label: name,
    dataType: name === 'Num__c' ? 'Number' : 'Text',
    isPrimaryKey: name === primaryKey,
  })),
});
const target = ({ keyed = true } = {}) => ({
  name: 'Example__dlm',
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  fields: [
    {
      name: 'Code__c',
      type: 'Number',
      creationType: 'Custom',
      isPrimaryKey: keyed,
      ...(keyed ? { keyQualifierName: 'KQ_Code' } : {}),
    },
    { name: 'Num__c', type: 'Number', creationType: 'Custom', isPrimaryKey: false },
    { name: 'Other__c', type: 'Text', creationType: 'Custom', isPrimaryKey: false },
    { name: 'NumT__c', type: 'Text', creationType: 'Custom', isPrimaryKey: false },
    ...systemNames.map((name) => ({
      name,
      type: 'Text',
      creationType: 'System',
      isPrimaryKey: false,
    })),
    {
      name: 'KQ_Code__c',
      type: 'Text',
      creationType: 'System',
      isPrimaryKey: false,
      usageTag: 'KeyQualifier',
    },
  ].map((field) => ({ label: field.name, ...field })),
});

/**
 * In-memory org holding one mapping, with the mapped marker following its pairs.
 * @param {object} [options] Initial state.
 * @param {object} [options.initial] Native mapping detail.
 * @param {boolean} [options.absent] Whether the org has no mapping yet.
 * @param {boolean} [options.keyed] Whether the target reports its primary key.
 * @param {string} [options.primaryKey] Source primary key.
 * @returns {object} Fake client, parent readers and the write ledger.
 */
function world({ initial = raw(), absent = false, keyed = true, primaryKey = 'Num__c' } = {}) {
  let state = absent ? undefined : structuredClone(initial);
  const schema = target({ keyed });
  const mark = () => {
    for (const field of schema.fields)
      if (state?.fieldMappings.some((entry) => entry.targetFieldDeveloperName === field.name))
        field.isMapped = true;
      else delete field.isMapped;
  };
  mark();
  const writes = [];
  const client = {
    apiVersion: '68.0',
    list: async () => ({ objectSourceTargetMaps: state ? [structuredClone(state)] : [] }),
    get: async () => {
      if (!state) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return structuredClone(state);
    },
    create: async (body) => {
      writes.push(['create', body]);
      state = raw([
        ...body.fieldMapping.map((entry) => [
          entry.sourceFieldDeveloperName,
          entry.targetFieldDeveloperName,
        ]),
        ...generated,
      ]);
      mark();
      return { ...structuredClone(state), status: 'CREATING' };
    },
    update: async (name, body) => {
      writes.push(['update', name, body]);
      for (const entry of body.fieldMapping)
        state.fieldMappings.push({
          ...entry,
          developerName: `fresh_${entry.targetFieldDeveloperName}`,
        });
      mark();
      return structuredClone(state);
    },
    deleteField: async (name, selector) => {
      writes.push(['unmap', name, selector]);
      state.fieldMappings = state.fieldMappings.filter((entry) => entry.developerName !== selector);
      mark();
    },
  };
  const deps = {
    source: { get: async () => source(primaryKey) },
    target: { get: async () => structuredClone(schema) },
  };
  return { client, deps, writes, read: () => state };
}

test('a Number key pair with other names is never unmapped when the file drops authored pairs', async () => {
  // The file omits the key pair: refused before any write.
  const omitted = world();
  await assert.rejects(
    preflightNativeMapping(file([renamedPair]), omitted.client, omitted.deps),
    (error) => error.code === 'MAPPING_PROTECTED_PAIR_REQUIRED',
  );
  const blocked = await executeMapping(file([renamedPair]), omitted.client, omitted.deps);
  assert.equal(blocked.mutation, 'not-attempted');
  assert.deepEqual(omitted.writes, []);
  // Keeping only the key pair removes every other authored pair and nothing protected.
  const kept = world();
  const plan = await preflightNativeMapping(file([keyPair]), kept.client, kept.deps);
  assert.deepEqual(
    plan.removals,
    [numberPair, renamedPair, textPair].map((value) => pair(value)),
  );
  assert.deepEqual(
    plan.evidence.protectedPairs,
    [keyPair, ...generated].map((value) => pair(value)),
  );
  const result = await deployNativeMapping(file([keyPair]), kept.client, kept.deps);
  assert.equal(result.operation, 'update');
  assert.deepEqual(
    kept.writes,
    [numberPair, renamedPair, textPair].map((value) => [
      'unmap',
      MAPPING,
      pair(value).developerName,
    ]),
  );
  assert.deepEqual(
    kept.read().fieldMappings,
    [keyPair, ...generated].map((value) => pair(value)),
  );
});

for (const [label, options] of [
  ['the target reports no primary key', { keyed: false }],
  ['the source key feeds an ordinary target field', { primaryKey: 'Note__c' }],
])
  test(`removals refuse with an unproven layout before any write when ${label}`, async () => {
    const f = world(options);
    await assert.rejects(
      preflightNativeMapping(file([keyPair, numberPair]), f.client, f.deps),
      (error) => error.code === 'MAPPING_PROTECTED_LAYOUT_UNPROVEN',
    );
    const result = await executeMapping(file([keyPair, numberPair]), f.client, f.deps);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.deepEqual(f.writes, []);
  });

test('a retrieved mapping with Number, renamed and shared-source pairs round-trips as noop', async () => {
  const f = world();
  const retrieved = await retrieveNativeMapping(MAPPING, f.client);
  const plan = await preflightNativeMapping(retrieved, f.client, f.deps);
  assert.equal(plan.operation, 'noop');
  const result = await deployNativeMapping(retrieved, f.client, f.deps);
  assert.equal(result.operation, 'noop');
  // The hand-written form of the same file is a noop as well.
  const handWritten = await deployNativeMapping(file(authored), f.client, f.deps);
  assert.equal(handWritten.operation, 'noop');
  const preview = await preflightMapping(retrieved, f.client, f.deps);
  assert.equal(preview.outcome, 'noop');
  assert.deepEqual(preview.diagnostics, [
    {
      code: 'MAPPING_FIELD_TYPES_DIFFER',
      message:
        'These pairs map fields of different data types; Salesforce accepts them: Num__c (Number) -> NumT__c (Text).',
    },
  ]);
  assert.deepEqual(f.writes, []);
});

test('create with a Number pair and a renamed pair sends one POST without the generated pairs', async () => {
  const f = world({ absent: true });
  const input = file([...authored, ...generated]);
  const result = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(result.operation, 'create');
  assert.deepEqual(f.writes, [
    [
      'create',
      {
        sourceEntityDeveloperName: 'Example__dll',
        targetEntityDeveloperName: 'Example__dlm',
        fieldMapping: authored.map((value) => names(value)),
      },
    ],
  ]);
  assert.equal(result.document.spec.fieldMappings.length, authored.length + generated.length);
});

for (const apiVersion of ['61.0', '64.0'])
  test(`pair removal at API ${apiVersion} unmaps without a version refusal`, async () => {
    const f = world();
    f.client.apiVersion = apiVersion;
    const input = file(authored.filter((value) => value !== renamedPair));
    const result = await deployNativeMapping(input, f.client, f.deps);
    assert.equal(result.operation, 'update');
    assert.deepEqual(f.writes, [['unmap', MAPPING, pair(renamedPair).developerName]]);
    assert.ok(
      !f.read().fieldMappings.some((entry) => entry.targetFieldDeveloperName === 'Other__c'),
    );
  });

test('an unrecognised system or key-qualifier pair is never unmapped by a deploy', async () => {
  for (const change of [
    // The qualifier field carries an unknown usage tag, so it is not recognised as generated.
    (schema) => {
      schema.fields.find((field) => field.name === 'KQ_Code__c').usageTag = 'Other';
    },
    // The target key names a different qualifier.
    (schema) => {
      schema.fields.find((field) => field.name === 'Code__c').keyQualifierName = 'KQ_Else';
    },
  ]) {
    const f = world();
    const read = f.deps.target.get;
    f.deps.target.get = async () => {
      const schema = await read();
      change(schema);
      return schema;
    };
    await assert.rejects(
      preflightNativeMapping(file([keyPair, numberPair, renamedPair, textPair]), f.client, f.deps),
      (error) => error.code === 'MAPPING_PROTECTED_LAYOUT_UNPROVEN',
    );
    assert.deepEqual(f.writes, []);
  }
});
