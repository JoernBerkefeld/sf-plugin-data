import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import {
  normalizeNativeMapping,
  validateNativeMappingDocument,
} from '../lib/artifacts/native-mapping-document.js';
import {
  normalizeNativeRelationship,
  validateNativeRelationshipDocument,
} from '../lib/artifacts/native-relationship-document.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeNativeRelationshipDocument } from '../lib/artifacts/write-native-relationship.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { retrieveLeanNativeMapping } from '../lib/services/native-mapping.js';
import { retrieveNativeRelationships } from '../lib/services/native-relationship.js';

// The API reports unset values as JSON null.
const jsonNull = JSON.parse('null');
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lenient-mapping-'));
const systemSources = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c'];

const sourceDlo = () => ({
  name: 'Source__dll',
  label: 'Source',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: ['Id__c', 'Note__c', ...systemSources].map((name) => ({
    name,
    label: name,
    dataType: 'Text',
    isPrimaryKey: name === 'Id__c',
  })),
});
const targetDmo = () => ({
  name: 'Target__dlm',
  label: 'Target',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  isEnabled: true,
  fields: [
    { name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true, creationType: 'Custom' },
    { name: 'Note__c', label: 'Note', type: 'Text', isPrimaryKey: false, creationType: 'Custom' },
    ...systemSources.map((name) => ({
      name,
      label: name,
      type: 'Text',
      isPrimaryKey: false,
      creationType: 'System',
    })),
  ],
});
const parents = {
  source: { get: async () => sourceDlo() },
  target: { get: async () => targetDmo() },
};
const pair = (source, target, extra = {}) => ({
  sourceFieldDeveloperName: source,
  targetFieldDeveloperName: target,
  ...extra,
});
const rawMapping = (fieldMappings, extra = {}) => ({
  developerName: 'Loose_map',
  sourceEntityDeveloperName: 'Source__dll',
  targetEntityDeveloperName: 'Target__dlm',
  status: 'ACTIVE',
  fieldMappings,
  ...extra,
});
const mappingClient = (raw) => ({ get: async () => structuredClone(raw) });

const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};

test('retrieve keeps an unknown pair key and an odd field name; deploy refuses naming it', async () => {
  const raw = rawMapping([
    pair('Id__c', 'Id__c', { futureKey: { a: 1 } }),
    pair('Note', 'Note__c', { developerName: jsonNull }),
  ]);
  // Deploy-mode normalization refuses the same read.
  assert.throws(() => normalizeNativeMapping(raw, 'default'), /INVALID_MAPPING_FIELD/u);
  const document = await retrieveLeanNativeMapping(
    'Loose_map',
    mappingClient(raw),
    'default',
    parents,
    'retrieve',
  );
  assert.deepEqual(document.spec.fieldMappings, raw.fieldMappings);
  const cwd = await scratch();
  const receipt = await writeNativeMappingDocument(document, cwd, false);
  const saved = JSON.parse(await readFile(receipt.path, 'utf8'));
  assert.equal(saved.verbatim, undefined);
  assert.deepEqual(saved.spec.fieldMappings[0].futureKey, { a: 1 });
  const repeat = await writeNativeMappingDocument(document, cwd, false);
  assert.equal(repeat.outcome, 'unchanged');
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['mapping:Loose_map'] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      /The mapping file cannot be deployed: spec\.fieldMappings\[0\]\.futureKey is not a key/u.test(
        error.message,
      ),
  );
});

test('a mapping with only generated pairs is written with an empty pair list', async () => {
  const raw = rawMapping(systemSources.map((name) => pair(name, name)));
  const document = await retrieveLeanNativeMapping(
    'Loose_map',
    mappingClient(raw),
    'default',
    parents,
    'retrieve',
  );
  assert.deepEqual(document.spec.fieldMappings, []);
  const cwd = await scratch();
  const receipt = await writeNativeMappingDocument(document, cwd, false);
  const saved = JSON.parse(await readFile(receipt.path, 'utf8'));
  assert.equal(saved.kind, 'mapping');
  assert.equal(saved.verbatim, undefined);
  assert.deepEqual(saved.spec.fieldMappings, []);
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['mapping:Loose_map'] }),
    /spec\.fieldMappings must list at least one pair/u,
  );
});

test('retrieve writes a mapping whose source is not a DLO as returned; deploy refuses it', async () => {
  const raw = rawMapping([pair('Id__c', 'Id__c')], { sourceEntityDeveloperName: 'Account' });
  assert.throws(
    () => normalizeNativeMapping(raw, 'default', 'retrieve'),
    (error) =>
      error.code === 'INVALID_MAPPING_DOCUMENT' &&
      /spec\.sourceEntityDeveloperName must be a data lake object/u.test(error.message),
  );
  const cwd = await scratch();
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '68.0',
      'target-org': 'synthetic',
      metadata: ['mapping:Loose_map'],
      'output-dir': cwd,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  command.createMappingInventoryReader = () => ({});
  command.createMappingClient = () => mappingClient(raw);
  command.acquireNativeMapping = retrieveLeanNativeMapping;
  command.writeNativeMapping = writeNativeMappingDocument;
  command.createDloClient = () => assert.fail('an unrepresentable mapping reads no parent');
  command.createDmoClient = () => assert.fail('an unrepresentable mapping reads no parent');
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'INVALID_MAPPING_DOCUMENT' });
  const file = path.join(cwd, 'data360', 'mapping', 'Loose_map.mapping-meta.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.kind, 'mapping');
  assert.equal(saved.verbatim.native.sourceEntityDeveloperName, 'Account');
  await assert.rejects(readDeployInputs({ cwd, metadata: ['mapping:Loose_map'] }), {
    code: 'VERBATIM_NOT_DEPLOYABLE',
  });
});

const validMapping = () => ({
  schemaVersion: 1,
  kind: 'mapping',
  c__dataSpace: 'default',
  identity: { apiName: 'Loose_map' },
  spec: {
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: 'Target__dlm',
    fieldMappings: [pair('Id__c', 'Id__c', { developerName: 'sel' })],
  },
});

test('deploy validation names each mapping key path it refuses', () => {
  const valid = validMapping;
  validateNativeMappingDocument(valid());
  const cases = [
    [(d) => (d.extra = 1), 'INVALID_MAPPING_DOCUMENT', /: extra is not a key/u],
    [(d) => (d.spec.status = 1), 'INVALID_MAPPING_DOCUMENT', /spec\.status is not a key/u],
    [(d) => (d.spec.fieldMappings = []), 'INVALID_MAPPING_DOCUMENT', /must list at least/u],
    [
      (d) => (d.spec.fieldMappings[0].id = 'x'),
      'INVALID_MAPPING_FIELD',
      /spec\.fieldMappings\[0\]\.id is not a key/u,
    ],
    [
      (d) => (d.spec.fieldMappings[0].sourceFieldDeveloperName = 'Id'),
      'INVALID_MAPPING_FIELD',
      /spec\.fieldMappings\[0\]\.sourceFieldDeveloperName must be/u,
    ],
    [
      (d) => d.spec.fieldMappings.push(pair('Id__c', 'Id__c')),
      'INVALID_MAPPING_FIELD',
      /spec\.fieldMappings\[1\] repeats another pair/u,
    ],
  ];
  for (const [change, code, message] of cases) {
    const document = valid();
    change(document);
    assert.throws(
      () => validateNativeMappingDocument(document),
      (error) => error.code === code && message.test(error.message),
    );
    // Retrieve mode admits each of them.
    validateNativeMappingDocument(document, 'retrieve');
  }
  // A target that is not a DMO is unrepresentable in both modes.
  const other = valid();
  other.spec.targetEntityDeveloperName = 'Account';
  assert.throws(() => validateNativeMappingDocument(other, 'retrieve'), /__dlm/u);
});

const entry = (name, extra = {}) => ({
  name,
  status: 'ACTIVE',
  cardinality: 'ManyToOne',
  owner: 'DataCloud',
  sourceObject: { name: 'A__dlm' },
  sourceField: { name: 'BRef__c' },
  targetObject: { name: 'B__dlm' },
  targetField: { name: 'Id__c' },
  ...extra,
});

test('one relationship with null values does not fail the other relationships of the DMO', async () => {
  const relationships = [
    entry('Good'),
    entry('Loose', { status: jsonNull, cardinality: jsonNull, sourceField: { name: 'BRef' } }),
    // Listed for A__dlm as target only: never kept, so never checked.
    entry('Inbound', {
      name: jsonNull,
      sourceObject: { name: 'C__dlm' },
      owner: jsonNull,
    }),
  ];
  const client = { list: async () => ({ relationships, totalSize: 3 }) };
  // Deploy mode refuses the whole inventory.
  await assert.rejects(retrieveNativeRelationships('A__dlm', client, 'default'), {
    code: 'INVALID_RELATIONSHIP_RESPONSE',
  });
  const documents = await retrieveNativeRelationships('A__dlm', client, 'default', 'retrieve');
  assert.deepEqual(
    documents.map((document) => [document.identity.apiName, document.verbatim === undefined]),
    [
      ['Good', true],
      ['Loose', true],
    ],
  );
  const loose = documents[1];
  assert.equal(loose.spec.cardinality, jsonNull);
  assert.equal(loose.spec.sourceFieldName, 'BRef');

  const cwd = await scratch();
  const receipt = await writeNativeRelationshipDocument(loose, cwd, false);
  const saved = JSON.parse(await readFile(receipt.path, 'utf8'));
  assert.equal(saved.verbatim, undefined);
  assert.equal(saved.spec.cardinality, jsonNull);
  await assert.rejects(
    readDeployInputs({ cwd, metadata: ['relationship:Loose'] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      /The relationship file cannot be deployed: spec\.sourceFieldName must be/u.test(
        error.message,
      ),
  );
});

const validRelationship = () => normalizeNativeRelationship(entry('Good'), 'default');

test('deploy validation names each relationship key path it refuses', () => {
  const valid = validRelationship;
  validateNativeRelationshipDocument(valid());
  const cases = [
    [(d) => (d.extra = 1), /: extra is not a key/u],
    [(d) => (d.spec.status = 'ACTIVE'), /spec\.status is not a key/u],
    [(d) => delete d.spec.relationshipOwner, /spec\.relationshipOwner is missing/u],
    [(d) => (d.spec.cardinality = jsonNull), /spec\.cardinality must be/u],
    [(d) => (d.spec.sourceObjectName = 'Account'), /spec\.sourceObjectName must be/u],
  ];
  for (const [change, message] of cases) {
    const document = valid();
    change(document);
    assert.throws(
      () => validateNativeRelationshipDocument(document),
      (error) => error.code === 'INVALID_RELATIONSHIP_DOCUMENT' && message.test(error.message),
    );
    validateNativeRelationshipDocument(document, 'retrieve');
  }
});
