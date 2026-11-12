import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DloError, isGeneratedDloField, normalizeDlo } from '../lib/artifacts/dlo-document.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { preflightNativeDlo, retrieveNativeDlo } from '../lib/services/native-dlo.js';
import { preflightNativeDmo, retrieveNativeDmo } from '../lib/services/native-dmo.js';
import {
  generatedMappingPairs,
  isGeneratedMappingPair,
  preflightNativeMapping,
  retrieveLeanNativeMapping,
} from '../lib/services/native-mapping.js';

const systemSources = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c'];
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lean-retrieve-'));
const names = (fields) => fields.map((field) => field.name);
const pairs = (document) =>
  document.spec.fieldMappings.map(
    (pair) => `${pair.sourceFieldDeveloperName}->${pair.targetFieldDeveloperName}`,
  );

/**
 * Save a definition through its writer and read it back the way deploy admits it.
 * @param {Function} write Artifact writer.
 * @param {object} document Definition as retrieved.
 * @param {string} selector Deploy selector.
 * @returns {Promise<object>} Saved document.
 */
async function roundTrip(write, document, selector) {
  const cwd = await scratch();
  const receipt = await write(document, cwd, false);
  const [input] = await readDeployInputs({ cwd, metadata: [selector] });
  assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), input.document);
  return structuredClone(input.document);
}

// --- DLO ---------------------------------------------------------------------------------

const dloField = (name, extra = {}) => ({
  name,
  label: name,
  dataType: 'Text',
  isPrimaryKey: false,
  ...extra,
});
const rawDlo = () => ({
  id: '1dlaj00000Ae4VNAAZ',
  name: 'Events__dll',
  label: 'Events',
  category: 'Engagement',
  status: 'ACTIVE',
  eventDateTimeFieldName: 'EventTime__c',
  dataSpaceInfo: [{ name: 'default' }],
  dataLakeFieldInfoRepresentation: [
    dloField('Id__c', { isPrimaryKey: true, keyQualifierName: 'KQ_Id' }),
    dloField('EventTime__c', { dataType: 'DateTime' }),
    dloField('Note__c', { creationType: 'Custom' }),
    // A custom field named like a qualifier is authored, not generated.
    dloField('KQ_Note__c', { creationType: 'Custom' }),
    dloField('KQ_Id__c'),
    dloField('cdp_sys_SourceVersion__c'),
    dloField('cdp_sys_PartitionDate__c', { dataType: 'Date' }),
    ...systemSources.map((name) => dloField(name)),
  ],
});

test('DLO retrieve stores authored fields only and the lean file deploys unchanged', async () => {
  const document = await retrieveNativeDlo('Events__dll', { get: async () => rawDlo() });
  assert.equal(document.spec.fields.length, 10);
  const saved = await roundTrip(writeDloDocument, document, 'dlo:Events__dll');
  assert.deepEqual(names(saved.spec.fields), ['Id__c', 'EventTime__c', 'Note__c', 'KQ_Note__c']);
  assert.equal(saved.spec.eventDateTimeFieldName, 'EventTime__c');
  // The predicate deploy uses names exactly the omitted fields.
  assert.deepEqual(
    names(document.spec.fields.filter((field) => isGeneratedDloField(field, document.spec.fields))),
    [
      'KQ_Id__c',
      'cdp_sys_SourceVersion__c',
      'cdp_sys_PartitionDate__c',
      'DataSource__c',
      'DataSourceObject__c',
      'InternalOrganization__c',
    ],
  );
  const plan = await preflightNativeDlo(saved, { get: async () => rawDlo() });
  assert.equal(plan.operation, 'unchanged');
});

test('DLO retrieve keeps a field the event field names, even a system-named one', async () => {
  const raw = rawDlo();
  raw.eventDateTimeFieldName = 'cdp_sys_PartitionDate__c';
  const saved = await roundTrip(writeDloDocument, normalizeDlo(raw), 'dlo:Events__dll');
  assert.ok(names(saved.spec.fields).includes('cdp_sys_PartitionDate__c'));
  const plan = await preflightNativeDlo(saved, { get: async () => raw });
  assert.equal(plan.operation, 'unchanged');
});

// --- DMO ---------------------------------------------------------------------------------

const dmoField = (name, creationType, extra = {}) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: false,
  creationType,
  usageTag: 'None',
  ...extra,
});
const customDmo = () => ({
  name: 'Target__dlm',
  label: 'Target',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  isEnabled: true,
  fields: [
    dmoField('Id__c', 'Custom', { isPrimaryKey: true, keyQualifierName: 'KQ_Id', isMapped: true }),
    dmoField('Note__c', 'Custom', { isMapped: true }),
    ...systemSources.map((name) => dmoField(name, 'System', { isMapped: true })),
    dmoField('KQ_Id__c', 'System', { usageTag: 'KeyQualifier', isMapped: true }),
  ],
});
const standardDmo = () => ({
  name: 'ssot__Brand__dlm',
  label: 'Brand',
  category: 'OTHER',
  creationType: 'Standard',
  dataSpaceName: 'default',
  isEnabled: true,
  fields: [
    dmoField('ssot__Id__c', 'Standard', {
      isPrimaryKey: true,
      keyQualifierName: 'KQ_Id',
      isMapped: true,
    }),
    dmoField('ssot__Name__c', 'Standard', { isMapped: true }),
    ...systemSources.map((name) =>
      dmoField(`ssot__${name.slice(0, -3)}Id__c`, 'Standard', { isMapped: true }),
    ),
    dmoField('ssot__CreatedById__c', 'System'),
    dmoField('Note__c', 'Custom', { isMapped: true }),
    dmoField('KQ_Id__c', 'System', { usageTag: 'KeyQualifier', isMapped: true }),
  ],
});

test('custom DMO retrieve leaves out generated fields and the lean file deploys unchanged', async () => {
  const document = await retrieveNativeDmo('Target__dlm', { get: async () => customDmo() });
  const saved = await roundTrip(writeNativeDmoDocument, document, 'dmo:Target__dlm');
  assert.deepEqual(names(saved.spec.fields), ['Id__c', 'Note__c']);
  const plan = await preflightNativeDmo(saved, { get: async () => customDmo() });
  assert.equal(plan.operation, 'unchanged');
});

test('standard DMO retrieve keeps standard fields, leaves out System ones, deploys unchanged', async () => {
  const document = await retrieveNativeDmo('ssot__Brand__dlm', { get: async () => standardDmo() });
  const saved = await roundTrip(writeNativeDmoDocument, document, 'dmo:ssot__Brand__dlm');
  // Standard fields are compared by deploy when listed and keep the definition non-empty.
  assert.deepEqual(names(saved.spec.fields), [
    'ssot__Id__c',
    'ssot__Name__c',
    'ssot__DataSourceId__c',
    'ssot__DataSourceObjectId__c',
    'ssot__InternalOrganizationId__c',
    'Note__c',
  ]);
  const plan = await preflightNativeDmo(saved, { get: async () => standardDmo() });
  assert.equal(plan.operation, 'unchanged');
});

// --- Mapping -----------------------------------------------------------------------------

const sourceDlo = () => ({
  name: 'Source__dll',
  label: 'Source',
  category: 'Other',
  status: 'ACTIVE',
  dataSpaceInfo: [{ name: 'default' }],
  fields: ['Id__c', 'Name__c', 'Note__c', ...systemSources, 'KQ_Id__c'].map((name) =>
    dloField(name, { isPrimaryKey: name === 'Id__c' }),
  ),
});
const pair = ([source, target]) => ({
  sourceFieldDeveloperName: source,
  targetFieldDeveloperName: target,
  developerName: `sel_${source}`,
});
const scenarios = {
  custom: {
    dmo: customDmo,
    authored: [
      ['Id__c', 'Id__c'],
      ['Note__c', 'Note__c'],
    ],
    generated: [...systemSources.map((name) => [name, name]), ['KQ_Id__c', 'KQ_Id__c']],
  },
  standard: {
    dmo: standardDmo,
    authored: [
      ['Id__c', 'ssot__Id__c'],
      ['Name__c', 'ssot__Name__c'],
      ['Note__c', 'Note__c'],
    ],
    generated: [
      ...systemSources.map((name) => [name, `ssot__${name.slice(0, -3)}Id__c`]),
      ['KQ_Id__c', 'KQ_Id__c'],
    ],
  },
};

/**
 * A mapping org over one DLO and one DMO; every read returns a fresh copy.
 * @param {'custom' | 'standard'} kind Target DMO kind.
 * @returns {object} Mapping client, parent readers and the raw mapping.
 */
function mappingOrg(kind) {
  const scenario = scenarios[kind];
  const target = scenario.dmo();
  const raw = {
    developerName: `Source_map_${kind}`,
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: target.name,
    status: 'ACTIVE',
    fieldMappings: [...scenario.authored, ...scenario.generated].map((value) => pair(value)),
  };
  const reads = [];
  return {
    raw,
    reads,
    scenario,
    client: {
      list: async () => ({ objectSourceTargetMaps: [structuredClone(raw)] }),
      get: async () => structuredClone(raw),
      create: async () => assert.fail('no mapping write'),
      update: async () => assert.fail('no mapping write'),
    },
    dependencies: {
      source: {
        get: async (name) => {
          reads.push(`dlo:${name}`);
          return sourceDlo();
        },
      },
      target: {
        get: async (name) => {
          reads.push(`dmo:${name}`);
          return scenario.dmo();
        },
      },
    },
  };
}

for (const kind of ['custom', 'standard'])
  test(`${kind} DMO mapping retrieve leaves out generated pairs and the lean file deploys noop`, async () => {
    const org = mappingOrg(kind);
    const document = await retrieveLeanNativeMapping(
      org.raw.developerName,
      org.client,
      undefined,
      org.dependencies,
    );
    // Fresh parent reads decide the generated pairs.
    assert.deepEqual(org.reads, ['dlo:Source__dll', `dmo:${org.raw.targetEntityDeveloperName}`]);
    const saved = await roundTrip(
      writeNativeMappingDocument,
      document,
      `mapping:${org.raw.developerName}`,
    );
    // The authored key pair (source primary key onto target primary key) stays in the file.
    assert.deepEqual(
      pairs(saved),
      org.scenario.authored.map(([source, target]) => `${source}->${target}`),
    );
    const plan = await preflightNativeMapping(saved, org.client, org.dependencies);
    assert.equal(plan.operation, 'noop');
  });

test('retrieve and deploy share one generated-pair predicate', async () => {
  for (const kind of ['custom', 'standard']) {
    const org = mappingOrg(kind);
    const retrieved = await retrieveLeanNativeMapping(
      org.raw.developerName,
      org.client,
      undefined,
      org.dependencies,
    );
    const generated = await generatedMappingPairs(
      { ...retrieved, spec: { ...retrieved.spec, fieldMappings: org.raw.fieldMappings } },
      org.dependencies,
    );
    assert.deepEqual(
      generated.map((value) => [value.sourceFieldDeveloperName, value.targetFieldDeveloperName]),
      org.scenario.generated,
    );
    // The exported predicate is the one deploy merges with: every generated pair qualifies,
    // no authored one does.
    const target = await retrieveNativeDmo(
      org.raw.targetEntityDeveloperName,
      org.dependencies.target,
    );
    const context = {
      sources: new Map(normalizeDlo(sourceDlo()).spec.fields.map((field) => [field.name, field])),
      targets: new Map(target.spec.fields.map((field) => [field.name, field])),
      standard: kind === 'standard',
    };
    for (const value of org.raw.fieldMappings)
      assert.equal(
        isGeneratedMappingPair(value, context),
        org.scenario.generated.some(
          ([source, target]) =>
            source === value.sourceFieldDeveloperName && target === value.targetFieldDeveloperName,
        ),
      );
    // An omitted authored pair is never mistaken for a generated one: deploy plans its removal.
    const lean = structuredClone(retrieved);
    lean.spec.fieldMappings = lean.spec.fieldMappings.filter(
      (value) => value.sourceFieldDeveloperName !== 'Note__c',
    );
    const plan = await preflightNativeMapping(lean, org.client, org.dependencies);
    assert.deepEqual(
      plan.removals.map((value) => value.sourceFieldDeveloperName),
      ['Note__c'],
    );
  }
});

for (const failure of ['source', 'target', 'missing'])
  test(`mapping retrieve refuses when the ${failure} parent cannot be read`, async () => {
    const org = mappingOrg('custom');
    const dependencies =
      failure === 'missing'
        ? undefined
        : {
            ...org.dependencies,
            [failure]: {
              get: async () => {
                throw failure === 'source'
                  ? new DloError('DLO_HTTP_ERROR', 503)
                  : new NativeDmoError('DMO_HTTP_ERROR', 503);
              },
            },
          };
    await assert.rejects(
      retrieveLeanNativeMapping(org.raw.developerName, org.client, undefined, dependencies),
      (error) =>
        error instanceof NativeMappingError &&
        error.code === 'MAPPING_GENERATED_PAIRS_UNPROVEN' &&
        /Nothing was written for it/u.test(operationDiagnostic(error, '')),
    );
  });

test('a mapping onto a DMO this plugin never writes is stored with all its pairs', async () => {
  const org = mappingOrg('custom');
  org.dependencies.target.get = async () => ({ ...customDmo(), creationType: 'Generated' });
  const document = await retrieveLeanNativeMapping(
    org.raw.developerName,
    org.client,
    undefined,
    org.dependencies,
  );
  assert.equal(document.spec.fieldMappings.length, org.raw.fieldMappings.length);
});

test('retrieve command passes lazy source and target readers to the mapping acquisition', async () => {
  const org = mappingOrg('custom');
  const written = [];
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      'target-org': 'synthetic',
      dataspace: 'default',
      metadata: [`mapping:${org.raw.developerName}`],
    },
  });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  command.createMappingInventoryReader = () => ({});
  command.createMappingClient = () => org.client;
  command.createDloClient = (target, version) => {
    assert.deepEqual([target, version], ['synthetic', '68.0']);
    return org.dependencies.source;
  };
  command.createDmoClient = (target, version) => {
    assert.deepEqual([target, version], ['synthetic', '68.0']);
    return org.dependencies.target;
  };
  command.acquireNativeMapping = retrieveLeanNativeMapping;
  command.writeNativeMapping = async (document) => {
    written.push(document);
    return { path: 'mapping.json', outcome: 'retrieved' };
  };
  const previous = process.exitCode;
  let result;
  try {
    result = await command.run();
  } finally {
    process.exitCode = previous;
  }
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(pairs(written[0]), ['Id__c->Id__c', 'Note__c->Note__c']);
});
