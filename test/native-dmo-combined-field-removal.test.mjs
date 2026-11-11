import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { NativeDmoError, normalizeNativeDmo } from '../lib/artifacts/native-dmo-document.js';
import {
  NativeMappingError,
  normalizeNativeMapping,
} from '../lib/artifacts/native-mapping-document.js';
import { captureDeployInputDigest, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { deployNativeDmo, preflightNativeDmo } from '../lib/services/native-dmo.js';
import {
  admitDmoFieldRemoval,
  executeDmo,
  mappedFieldMappings,
} from '../lib/services/command-native-dmo.js';
import { removeFieldsChecked } from '../lib/services/delete-dmo-field.js';

const system = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c', 'KQ_Id__c'];
const custom = ['Id__c', 'Name__c', 'Note__c'];
const fast = { attempts: 2, delayMs: 0, sleep: async () => {} };
const field = (name) => ({
  name,
  label: name,
  type: 'Text',
  isPrimaryKey: name === 'Id__c',
  creationType: system.includes(name) ? 'System' : 'Custom',
  ...(name === 'Id__c' ? { keyQualifierName: 'KQ_Id' } : {}),
  ...(name === 'KQ_Id__c' ? { usageTag: 'KeyQualifier' } : {}),
});
const pair = (name) => ({
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
  developerName: `sel_${name}`,
});
const unwritten = 'No write attempted; correct the reported check before another attempt.';
const dropped = (mapping, name = 'Note__c') => ({
  mapping,
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
});

/**
 * Synthetic org: DMOs whose mapped marker follows the mappings, and an ordered event ledger.
 * @param {Record<string, string[]>} dmos Custom and system field names per DMO.
 * @param {Array<{name: string, source: string, target: string, fields: string[]}>} mappings Mappings with identity pairs.
 * @returns {object} State, ledger and the injected clients.
 */
function world(dmos, mappings) {
  const events = [];
  const state = {
    dmos: new Map(
      Object.entries(dmos).map(([name, names]) => [
        name,
        { label: 'Example', fields: names.map((entry) => field(entry)) },
      ]),
    ),
    mappings: mappings.map((entry) => ({
      developerName: entry.name,
      sourceEntityDeveloperName: entry.source,
      targetEntityDeveloperName: entry.target,
      status: 'ACTIVE',
      fieldMappings: entry.fields.map((name) => pair(name)),
    })),
  };
  const mapped = (dmo, name) =>
    state.mappings.some(
      (entry) =>
        entry.targetEntityDeveloperName === dmo &&
        entry.fieldMappings.some((item) => item.targetFieldDeveloperName === name),
    );
  const readDmo = (name) => {
    const found = state.dmos.get(name);
    if (!found) throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    return {
      name,
      label: found.label,
      category: 'OTHER',
      creationType: 'Custom',
      dataSpaceName: 'default',
      fields: found.fields.map((entry) => ({
        ...entry,
        ...(mapped(name, entry.name) ? { isMapped: true } : {}),
      })),
    };
  };
  const dmo = {
    get: async (name) => {
      events.push(`dmo:get:${name}`);
      return readDmo(name);
    },
    create: async () => assert.fail('no DMO POST'),
    delete: async () => assert.fail('no DMO DELETE'),
    update: async (name, body) => {
      events.push(`dmo:patch:${name}`);
      const found = state.dmos.get(name);
      found.label = body.label;
      for (const entry of body.fields ?? [])
        if (!found.fields.some((existing) => existing.name === `${entry.name}__c`))
          found.fields.push(field(`${entry.name}__c`));
      return readDmo(name);
    },
    removeFields: async (name, names) => {
      events.push(`dmo:remove:${name}:${names.join(',')}`);
      const found = state.dmos.get(name);
      found.fields = found.fields.filter((entry) => !names.includes(entry.name));
      // Salesforce drops the mapping pairs of a removed field together with it (live API 68).
      for (const entry of state.mappings)
        if (entry.targetEntityDeveloperName === name)
          entry.fieldMappings = entry.fieldMappings.filter(
            (item) => !names.includes(item.targetFieldDeveloperName),
          );
    },
  };
  const dlo = {
    get: async (name) => ({
      name,
      label: 'Example',
      category: 'Other',
      status: 'ACTIVE',
      dataSpaceInfo: [{ name: 'default' }],
      fields: [...custom, 'Extra__c', ...system].map((entry) => ({
        name: entry,
        label: entry,
        dataType: 'Text',
        isPrimaryKey: entry === 'Id__c',
      })),
    }),
  };
  const mapping = {
    apiVersion: '68.0',
    list: async (target, source) => {
      events.push(`mapping:list:${target}`);
      return {
        objectSourceTargetMaps: structuredClone(
          state.mappings.filter(
            (entry) =>
              entry.targetEntityDeveloperName === target &&
              (source === undefined || entry.sourceEntityDeveloperName === source),
          ),
        ),
      };
    },
    get: async (name) => {
      const found = state.mappings.find((entry) => entry.developerName === name);
      if (!found) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return structuredClone(found);
    },
    create: async () => assert.fail('no mapping POST'),
    delete: async () => assert.fail('no mapping DELETE'),
    deleteField: async (name, selector) => {
      const found = state.mappings.find((entry) => entry.developerName === name);
      const removed = found.fieldMappings.find((item) => item.developerName === selector);
      events.push(`mapping:unmap:${name}:${removed.targetFieldDeveloperName}`);
      found.fieldMappings = found.fieldMappings.filter((item) => item !== removed);
    },
    update: async (name, body) => {
      const found = state.mappings.find((entry) => entry.developerName === name);
      for (const item of body.fieldMapping) {
        events.push(`mapping:add:${name}:${item.targetFieldDeveloperName}`);
        found.fieldMappings.push({
          ...item,
          developerName: `new_${item.targetFieldDeveloperName}`,
        });
      }
      return structuredClone(found);
    },
  };
  return {
    events,
    state,
    /**
     * Events between the removal of the named DMO and the next write.
     * @param {string} name DMO full name.
     * @returns {string[]} Reads that confirm the removal.
     */
    readsAfterRemoval: (name) => {
      const start = events.findIndex((entry) => entry.startsWith(`dmo:remove:${name}`));
      const rest = events.slice(start + 1);
      const end = rest.findIndex((entry) => !/^(?:dmo:get|mapping:list):/u.test(entry));
      return end === -1 ? rest : rest.slice(0, end);
    },
    writes: () => events.filter((entry) => !/^(?:dmo:get|mapping:list):/u.test(entry)),
    services: {
      createDmoClient: () => dmo,
      createDloClient: () => dlo,
      createMappingClient: () => mapping,
    },
    clients: { dmo, dlo, mapping },
  };
}
/**
 * Authored DMO file: the named fields, never carrying the mapped marker.
 * @param {string} apiName DMO full name.
 * @param {string[]} names Field names kept in the file.
 * @param {string} [label] Authored label.
 * @returns {object} Portable document.
 */
const dmoFile = (apiName, names, label = 'Example') =>
  normalizeNativeDmo({
    name: apiName,
    label,
    category: 'OTHER',
    creationType: 'Custom',
    dataSpaceName: 'default',
    fields: names.map((name) => field(name)),
  });
/**
 * Authored mapping file with identity pairs for the named fields.
 * @param {string} name Mapping name, also its selector.
 * @param {string} source Source DLO.
 * @param {string} target Target DMO.
 * @param {string[]} names Mapped field names kept in the file.
 * @returns {object} Portable document.
 */
const mappingFile = (name, source, target, names) =>
  normalizeNativeMapping({
    developerName: name,
    sourceEntityDeveloperName: source,
    targetEntityDeveloperName: target,
    status: 'ACTIVE',
    fieldMappings: names.map((entry) => pair(entry)),
  });
const org = { getOrgId: () => 'org', getUsername: () => 'user@example.com' };
/**
 * Write the documents into a fresh project and run the deploy command on synthetic clients.
 * @param {object} options Documents, selectors, flags and injected services.
 * @param {object[]} [options.dmos] Authored DMO documents, selected by name.
 * @param {object[]} [options.mappings] Authored mapping documents, selected by name.
 * @param {object[]} [options.dlos] Authored DLO documents, selected by name.
 * @param {object} [options.flags] Flag overrides.
 * @param {object} options.services Injected clients and services.
 * @param {string} [options.cwd] Existing project to run again instead of writing a new one.
 * @returns {Promise<object>} Result envelope.
 */
async function deploy({ dmos = [], mappings = [], dlos = [], flags = {}, services, cwd }) {
  const root = cwd ?? (await mkdtemp(path.join(os.tmpdir(), 'native-dmo-combined-removal-')));
  if (!cwd) {
    for (const document of dlos) await writeDloDocument(document, root, false);
    for (const document of dmos) await writeNativeDmoDocument(document, root, false);
    for (const document of mappings) await writeNativeMappingDocument(document, root, false);
  }
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      preview: false,
      'allow-field-removal': true,
      'target-org': 'my-org',
      metadata: [
        ...mappings.map((document) => `mapping:${document.identity.apiName}`),
        ...dmos.map((document) => `dmo:${document.identity.apiName}`),
        ...dlos.map((document) => `dlo:${document.identity.apiName}`),
      ],
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.captureInput = captureDeployInputDigest;
  command.resolveTargetOrg = async () => org;
  Object.assign(command, services);
  const previousCwd = process.cwd();
  const previousExit = process.exitCode;
  process.chdir(root);
  try {
    return { result: await command.run(), cwd: root };
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
}
const D = 'Example__dlm';
const M = 'SrcA_map_Example_1';
const all = [...custom, ...system];
const keep = all.filter((name) => name !== 'Note__c');
const single = () =>
  world({ [D]: all }, [{ name: M, source: 'SrcA__dll', target: D, fields: all }]);
const command = `sf data360 deploy -o my-org -m mapping:${M} -m dmo:${D} --allow-field-removal`;
const refusal = (nextAction) =>
  `Field removal refused for ${D}: Note__c is mapped by ${M}. Salesforce would drop the mapping pair(s) together with the field(s), so remove the pair(s) from the mapping file(s) and deploy the mapping(s) and the DMO in one command:\nsf data360 retrieve -o my-org -m mapping:${M} -m dmo:${D} --overwrite\nIn data360/mapping/${M}.mapping-meta.json remove the pair(s) whose targetFieldDeveloperName is Note__c; keep all other pairs. In data360/dmo/${D}.dmo-meta.json remove the field(s) Note__c.\n${command}\n${nextAction}`;

test('one command edits the DMO, removes the field with its pair, then deploys the mapping', async () => {
  const org1 = single();
  const selection = {
    dmos: [dmoFile(D, [...keep, 'Extra__c'], 'Changed')],
    mappings: [mappingFile(M, 'SrcA__dll', D, [...keep, 'Extra__c'])],
    services: org1.services,
  };
  const { result, cwd } = await deploy(selection);
  assert.equal(result.status, 'success', JSON.stringify(result));
  // The DMO removes the field in its own position; Salesforce drops the pair with it, so the
  // mapping only adds its new pair.
  assert.deepEqual(org1.writes(), [
    `dmo:patch:${D}`,
    `dmo:remove:${D}:Note__c`,
    `mapping:add:${M}:Extra__c`,
  ]);
  // The removal is followed by the reads that confirm the DMO and its mappings.
  const reads = org1.readsAfterRemoval(D);
  assert.ok(reads.includes(`dmo:get:${D}`), JSON.stringify(reads));
  assert.ok(reads.includes(`mapping:list:${D}`), JSON.stringify(reads));
  // One item per file, in DMO then mapping order.
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[0].droppedPairs, [dropped(M)]);
  assert.deepEqual(result.result.items[0].diagnostics, []);
  assert.ok(!('pendingRemoval' in result.result.items[0]));
  assert.ok(!org1.state.dmos.get(D).fields.some((entry) => entry.name === 'Note__c'));
  assert.ok(
    !org1.state.mappings[0].fieldMappings.some(
      (item) => item.targetFieldDeveloperName === 'Note__c',
    ),
  );
  // The same command again changes nothing.
  const before = org1.writes().length;
  const repeat = await deploy({ ...selection, cwd });
  assert.equal(repeat.result.status, 'success', JSON.stringify(repeat.result));
  assert.deepEqual(
    repeat.result.result.items.map((item) => [item.outcome, item.mutation]),
    [
      ['unchanged', 'not-attempted'],
      ['unchanged', 'not-attempted'],
    ],
  );
  assert.equal(org1.writes().length, before);
});

test('a removal-only DMO sends no PATCH and a selected DLO still deploys first', async () => {
  const org1 = single();
  const dloDocument = {
    schemaVersion: 1,
    kind: 'dlo',
    identity: { dataSpace: 'default', apiName: 'SrcA__dll' },
    spec: {
      label: 'Example',
      category: 'Other',
      fields: [...custom, 'Extra__c', ...system].map((name) => ({
        name,
        label: name,
        dataType: 'Text',
        isPrimaryKey: name === 'Id__c',
      })),
    },
  };
  const { result } = await deploy({
    dlos: [dloDocument],
    dmos: [dmoFile(D, keep)],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
    services: {
      ...org1.services,
      executeDlo: async () => {
        org1.events.push('dlo:execute');
        return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
      },
    },
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), ['dlo:execute', `dmo:remove:${D}:Note__c`]);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dlo', 'unchanged', 'not-attempted'],
      ['dmo', 'updated', 'confirmed-updated'],
      // The pair is already gone, so the mapping whose only change was dropping it is unchanged.
      ['mapping', 'unchanged', 'not-attempted'],
    ],
  );
  assert.deepEqual(result.result.items[1].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[1].droppedPairs, [dropped(M)]);
  assert.deepEqual(result.result.items[1].diagnostics, []);
});

for (const preview of [false, true])
  for (const scenario of ['not-selected', 'pair-kept', 'lookup-failed'])
    test(`admission refuses before any write: ${scenario}, preview=${preview}`, async () => {
      const org1 = single();
      const services = { ...org1.services };
      const calls = [];
      services.executeDlo = async () => {
        calls.push('dlo');
        return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
      };
      services.preflightDlo = async () => {
        calls.push('dlo-preview');
        return { family: 'dlo', outcome: 'unchanged', diagnostics: [] };
      };
      if (scenario === 'lookup-failed')
        services.createMappingClient = () => ({
          ...org1.clients.mapping,
          list: async () => {
            throw new Error('inventory unavailable');
          },
        });
      const { result } = await deploy({
        dlos: [
          {
            schemaVersion: 1,
            kind: 'dlo',
            identity: { dataSpace: 'default', apiName: 'SrcA__dll' },
            spec: {
              label: 'Example',
              category: 'Other',
              fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
            },
          },
        ],
        dmos: [dmoFile(D, keep, 'Changed')],
        mappings:
          scenario === 'not-selected'
            ? []
            : [mappingFile(M, 'SrcA__dll', D, scenario === 'pair-kept' ? all : keep)],
        flags: { preview },
        services,
      });
      assert.equal(result.status, 'blocked', JSON.stringify(result));
      // Nothing was written and no earlier item ran, not even the DLO that sorts first.
      assert.deepEqual(org1.writes(), []);
      assert.deepEqual(calls, []);
      const diagnostic = preview
        ? result.diagnostics.errors[0]
        : result.result.items[0].diagnostics[0];
      assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
      if (preview) assert.deepEqual(result.result.items, []);
      else {
        assert.equal(result.result.items.length, 1);
        assert.equal(result.result.items[0].family, 'dmo');
        assert.equal(result.result.items[0].outcome, 'blocked');
        assert.equal(result.result.items[0].mutation, 'not-attempted');
      }
      if (scenario === 'lookup-failed') {
        assert.deepEqual(diagnostic.mappedFields, [{ field: 'Note__c', mappings: [] }]);
        assert.match(diagnostic.message, /could not be identified \(the mapping lookup failed\)/u);
        assert.match(
          diagnostic.message,
          /then deploy the mapping and this DMO in one command with --allow-field-removal\./u,
        );
      } else {
        assert.deepEqual(diagnostic.mappedFields, [{ field: 'Note__c', mappings: [M] }]);
        assert.equal(
          diagnostic.message,
          refusal(
            preview
              ? 'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.'
              : unwritten,
          ),
        );
        // The single command is the only deploy line.
        assert.equal(diagnostic.message.split('\n').filter((line) => line === command).length, 1);
        assert.equal(diagnostic.message.match(/sf data360 deploy/gu).length, 1);
      }
    });

for (const edited of [true, false])
  test(`a side effect of the removal fails the DMO item before the mappings, PATCH=${edited}`, async () => {
    const org1 = single();
    const { dmo } = org1.clients;
    const { result } = await deploy({
      dmos: [dmoFile(D, keep, edited ? 'Changed' : 'Example')],
      mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
      services: {
        ...org1.services,
        // Salesforce also drops a pair of a field that stays on the DMO.
        createDmoClient: () => ({
          ...dmo,
          removeFields: async (name, names) => {
            await dmo.removeFields(name, names);
            org1.state.mappings[0].fieldMappings = org1.state.mappings[0].fieldMappings.filter(
              (item) => item.targetFieldDeveloperName !== 'Name__c',
            );
          },
        }),
      },
    });
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.deepEqual(org1.writes(), [
      ...(edited ? [`dmo:patch:${D}`] : []),
      `dmo:remove:${D}:Note__c`,
    ]);
    // The batch stops at the DMO; no mapping is deployed over the unexpected state.
    assert.equal(result.result.items.length, 1);
    const [item] = result.result.items;
    assert.equal(item.family, 'dmo');
    assert.equal(item.outcome, 'failed');
    assert.equal(item.mutation, 'unknown');
    assert.equal(item.removedFields, undefined);
    assert.equal(item.droppedPairs, undefined);
    assert.deepEqual(
      item.diagnostics.map(({ code }) => code),
      ['DMO_FIELD_REMOVAL_SIDE_EFFECT'],
    );
  });

test('a failed removal fails the one DMO item without another write', async () => {
  const org1 = single();
  const { dmo } = org1.clients;
  const { result } = await deploy({
    dmos: [dmoFile(D, keep, 'Changed')],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
    services: {
      ...org1.services,
      createDmoClient: () => ({
        ...dmo,
        removeFields: async (name) => {
          org1.events.push(`dmo:remove:${name}`);
          throw new NativeDmoError('DMO_FIELD_REMOVAL_FAILED');
        },
      }),
    },
  });
  assert.equal(result.status, 'failed', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}`]);
  assert.equal(result.result.items.length, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'unknown');
  assert.equal(item.removedFields, undefined);
  assert.deepEqual(
    item.diagnostics.map(({ code }) => code),
    ['DMO_FIELD_REMOVAL_FAILED'],
  );
});

test('a batch that stops at the mapping keeps the completed removal on the DMO item', async () => {
  const org1 = single();
  const { result } = await deploy({
    dmos: [dmoFile(D, keep, 'Changed')],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
    services: {
      ...org1.services,
      executeMapping: async () => ({
        outcome: 'blocked',
        mutation: 'not-attempted',
        diagnostics: [],
      }),
    },
  });
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  const [item, mapping] = result.result.items;
  assert.equal(item.outcome, 'updated');
  assert.equal(item.mutation, 'confirmed-updated');
  assert.deepEqual(item.removedFields, ['Note__c']);
  assert.deepEqual(item.droppedPairs, [dropped(M)]);
  assert.deepEqual(item.diagnostics, []);
  assert.equal(mapping.outcome, 'blocked');
});

test('preview names the removal and its dropped pairs and writes nothing', async () => {
  const org1 = single();
  const { result } = await deploy({
    dmos: [dmoFile(D, keep, 'Changed')],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
    flags: { preview: true },
    services: org1.services,
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), []);
  const [item, mapping] = result.result.items;
  assert.equal(item.operation, 'preview');
  assert.equal(item.outcome, 'update');
  assert.deepEqual(item.removeFields, ['Note__c']);
  assert.deepEqual(item.diagnostics, [
    {
      code: 'DMO_FIELD_REMOVAL_PLANNED',
      message:
        'Fields missing from the file are removed with one Metadata API destructive change: Note__c. Salesforce drops the mapping pairs of Note__c together with the field(s), so the selected mapping files find them already gone.',
    },
  ]);
  // Preview reads the target as it is now, where the pair still exists.
  assert.equal(mapping.family, 'mapping');
  assert.equal(mapping.outcome, 'update');
  assert.deepEqual(
    mapping.plan.map((step) => [step.operation, step.targetFieldDeveloperName]),
    [['unmap', 'Note__c']],
  );
});

test('each DMO removes only its own fields in DMO position; the mappings follow', async () => {
  const A = 'ExampleA__dlm';
  const B = 'ExampleB__dlm';
  const org1 = world({ [A]: all, [B]: all }, [
    { name: 'SrcA_map_A', source: 'SrcA__dll', target: A, fields: all },
    { name: 'SrcB_map_B', source: 'SrcB__dll', target: B, fields: keep },
  ]);
  const calls = [];
  const { result } = await deploy({
    dmos: [dmoFile(A, keep), dmoFile(B, all, 'Changed')],
    mappings: [
      mappingFile('SrcA_map_A', 'SrcA__dll', A, keep),
      mappingFile('SrcB_map_B', 'SrcB__dll', B, all),
    ],
    services: {
      ...org1.services,
      executeNativeDmo: async (document, client, scope, options) => {
        calls.push([
          document.identity.apiName,
          options.coveredMappedFields,
          typeof options.removeChecked,
        ]);
        return executeDmo(document, client, scope, options);
      },
    },
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [
    `dmo:remove:${A}:Note__c`,
    `dmo:patch:${B}`,
    'mapping:add:SrcB_map_B:Note__c',
  ]);
  assert.deepEqual(calls, [
    [A, ['Note__c'], 'function'],
    [B, [], 'function'],
  ]);
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [
      [A, 'updated', 'confirmed-updated'],
      [B, 'updated', 'confirmed-updated'],
      ['SrcA_map_A', 'unchanged', 'not-attempted'],
      ['SrcB_map_B', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[0].droppedPairs, [dropped('SrcA_map_A')]);
  assert.equal(result.result.items[1].removedFields, undefined);
  assert.equal(result.result.items[1].droppedPairs, undefined);
});

test('a DMO without planned removals keeps the DMO then mapping order', async () => {
  for (const allowed of [true, false]) {
    const org1 = world({ [D]: all }, [{ name: M, source: 'SrcA__dll', target: D, fields: keep }]);
    const covered = [];
    const { result } = await deploy({
      dmos: [dmoFile(D, all, 'Changed')],
      mappings: [mappingFile(M, 'SrcA__dll', D, all)],
      flags: { 'allow-field-removal': allowed },
      services: {
        ...org1.services,
        executeNativeDmo: async (document, client, scope, options) => {
          covered.push(options?.coveredMappedFields);
          return executeDmo(document, client, scope, options);
        },
      },
    });
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `mapping:add:${M}:Note__c`]);
    assert.deepEqual(covered, [allowed ? [] : undefined]);
    // Without the flag no admission read precedes the DMO item.
    if (!allowed) assert.equal(org1.events[0], `dmo:get:${D}`);
  }
  // Without the flag an omitted field is still the plain refusal, mapped or not.
  const org1 = single();
  const { result } = await deploy({
    dmos: [dmoFile(D, keep)],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
    flags: { 'allow-field-removal': false },
    services: org1.services,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].diagnostics[0].code, 'UNSUPPORTED_DMO_FIELD_CHANGE');
  assert.deepEqual(org1.writes(), []);
});

test('an unmapped removal on a DMO without mappings is checked and drops no pair', async () => {
  const org1 = world({ [D]: all }, []);
  const { result } = await deploy({
    dmos: [dmoFile(D, keep, 'Changed')],
    services: org1.services,
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  assert.ok(org1.readsAfterRemoval(D).includes(`mapping:list:${D}`));
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.equal(result.result.items[0].droppedPairs, undefined);
});

test('two mappings sharing the field both lose their pair with the one removal', async () => {
  const second = 'SrcB_map_Example_2';
  const org1 = world({ [D]: all }, [
    { name: M, source: 'SrcA__dll', target: D, fields: all },
    { name: second, source: 'SrcB__dll', target: D, fields: all },
  ]);
  const selection = {
    dmos: [dmoFile(D, keep)],
    mappings: [mappingFile(M, 'SrcA__dll', D, keep), mappingFile(second, 'SrcB__dll', D, keep)],
    services: org1.services,
  };
  const { result, cwd } = await deploy(selection);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [`dmo:remove:${D}:Note__c`]);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'unchanged', 'not-attempted'],
      ['mapping', 'unchanged', 'not-attempted'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[0].droppedPairs, [dropped(M), dropped(second)]);
  assert.deepEqual(result.result.items[0].diagnostics, []);
  for (const entry of org1.state.mappings) assert.equal(entry.fieldMappings.length, keep.length);
  assert.ok(!org1.state.dmos.get(D).fields.some((entry) => entry.name === 'Note__c'));
  const before = org1.writes().length;
  const repeat = await deploy({ ...selection, cwd });
  assert.equal(repeat.result.status, 'success', JSON.stringify(repeat.result));
  assert.ok(repeat.result.result.items.every((item) => item.outcome === 'unchanged'));
  assert.equal(org1.writes().length, before);
});

test('admission covers a field only when every holding mapping is selected without its pair', async () => {
  const { clients } = world({ [D]: all }, [
    { name: M, source: 'SrcA__dll', target: D, fields: all },
    { name: 'SrcB_map_Example_2', source: 'SrcB__dll', target: D, fields: ['Note__c'] },
  ]);
  const guide = { mappings: () => clients.mapping, targetOrg: 'my-org' };
  const selected = (source, targetFields, target = D) => ({ source, target, targetFields });
  const admit = (mappings, value = dmoFile(D, keep)) =>
    admitDmoFieldRemoval(value, clients.dmo, undefined, guide, mappings);
  assert.deepEqual(await admit([selected('SrcA__dll', keep), selected('SrcB__dll', [])]), {
    coveredMappedFields: ['Note__c'],
  });
  for (const mappings of [
    // The second holder is not selected, keeps the pair, or binds another DMO.
    [selected('SrcA__dll', keep)],
    [selected('SrcA__dll', keep), selected('SrcB__dll', ['Note__c'])],
    [selected('SrcA__dll', keep), selected('SrcB__dll', [], 'Other__dlm')],
    [],
  ])
    await assert.rejects(admit(mappings), (error) => {
      assert.equal(error.code, 'DMO_FIELD_REMOVAL_MAPPED');
      assert.deepEqual(mappedFieldMappings(error), [
        { field: 'Note__c', mappings: [M, 'SrcB_map_Example_2'] },
      ]);
      return true;
    });
  // A holder whose name cannot be echoed still has to be covered by its binding.
  const unnamed = world({ [D]: all }, [
    { name: 'bad name', source: 'SrcA__dll', target: D, fields: all },
  ]);
  const unnamedGuide = { mappings: () => unnamed.clients.mapping };
  await assert.rejects(
    admitDmoFieldRemoval(dmoFile(D, keep), unnamed.clients.dmo, undefined, unnamedGuide, []),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  assert.deepEqual(
    await admitDmoFieldRemoval(dmoFile(D, keep), unnamed.clients.dmo, undefined, unnamedGuide, [
      selected('SrcA__dll', keep),
    ]),
    { coveredMappedFields: ['Note__c'] },
  );
  // No guide, a mapped marker without any holder, and other refusals.
  await assert.rejects(
    admitDmoFieldRemoval(dmoFile(D, keep), clients.dmo, undefined, undefined, [
      selected('SrcA__dll', keep),
      selected('SrcB__dll', []),
    ]),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  const orphan = world({ [D]: all }, []);
  await assert.rejects(
    admitDmoFieldRemoval(
      dmoFile(D, keep),
      {
        ...orphan.clients.dmo,
        get: async () => {
          const raw = await clients.dmo.get(D);
          return raw;
        },
      },
      undefined,
      { mappings: () => orphan.clients.mapping },
      [selected('SrcA__dll', keep)],
    ),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  // Unmapped removals cover nothing, with or without a selected mapping; other refusals are left
  // to the item's own preflight.
  const free = world({ [D]: all }, []);
  assert.deepEqual(
    await admitDmoFieldRemoval(dmoFile(D, keep), free.clients.dmo, undefined, undefined, []),
    { coveredMappedFields: [] },
  );
  assert.deepEqual(
    await admitDmoFieldRemoval(dmoFile(D, keep), free.clients.dmo, undefined, undefined, [
      selected('SrcA__dll', keep),
    ]),
    { coveredMappedFields: [] },
  );
  assert.deepEqual(
    await admitDmoFieldRemoval(
      dmoFile(
        D,
        all.filter((name) => name !== 'Id__c'),
      ),
      free.clients.dmo,
      undefined,
      undefined,
      [selected('SrcA__dll', keep)],
    ),
    { coveredMappedFields: [] },
  );
  assert.deepEqual(free.writes(), []);
});

test('the service removes a covered field once through the checked removal and keeps the mapped guard', async () => {
  const org1 = single();
  const { dmo } = org1.clients;
  const file = dmoFile(D, keep, 'Changed');
  const allow = { allowFieldRemoval: true };
  // A covered field is planned; one that is not covered is still refused.
  const plan = await preflightNativeDmo(file, dmo, undefined, {
    ...allow,
    coveredMappedFields: ['Note__c'],
  });
  assert.deepEqual(plan.removeFields, ['Note__c']);
  await assert.rejects(
    preflightNativeDmo(file, dmo, undefined, { ...allow, coveredMappedFields: ['Name__c'] }),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  await assert.rejects(
    deployNativeDmo(file, dmo, undefined, fast, allow),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  assert.deepEqual(org1.writes(), []);
  // The PATCH lands first, then the one removal runs inside the checked wrapper.
  const calls = [];
  const removed = await deployNativeDmo(file, dmo, undefined, fast, {
    ...allow,
    coveredMappedFields: ['Note__c'],
    removeChecked: async (target, fields, remove) => {
      calls.push([target, fields, [...org1.writes()]]);
      await remove();
      return [dropped(M)];
    },
  });
  assert.equal(removed.operation, 'update');
  assert.deepEqual(removed.removedFields, ['Note__c']);
  assert.deepEqual(removed.droppedPairs, [dropped(M)]);
  assert.deepEqual(calls, [[D, ['Note__c'], [`dmo:patch:${D}`]]]);
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  const again = await deployNativeDmo(file, dmo, undefined, fast, {
    ...allow,
    removeChecked: async () => assert.fail('nothing left to remove'),
  });
  assert.equal(again.operation, 'unchanged');
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  // Without the wrapper the removal is sent unwrapped and reports no pairs.
  const free = world({ [D]: all }, []);
  const plain = await deployNativeDmo(dmoFile(D, keep), free.clients.dmo, undefined, fast, allow);
  assert.deepEqual(plain.removedFields, ['Note__c']);
  assert.equal(plain.droppedPairs, undefined);
  assert.deepEqual(free.writes(), [`dmo:remove:${D}:Note__c`]);
  // A mapping failure inside the checked removal keeps its own code on the deploy item.
  const third = single();
  const failed = await executeDmo(dmoFile(D, keep), third.clients.dmo, undefined, {
    ...allow,
    coveredMappedFields: ['Note__c'],
    removeChecked: async (_target, _fields, remove) => {
      await remove();
      throw new NativeMappingError('MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
    },
  });
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.mutation, 'unknown');
  assert.equal(failed.diagnostics[0].code, 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
});

const readers = (org) => ({ dmo: org.clients.dmo, mappings: org.clients.mapping });
// What the admission allowed: Note__c, held by the selected mapping from SrcA__dll.
const cover = { fields: ['Note__c'], sources: ['SrcA__dll'] };
test('the checked removal confirms dropped pairs and stops on whatever it cannot confirm', async () => {
  // Salesforce drops the pair with the field.
  const org1 = single();
  assert.deepEqual(
    await removeFieldsChecked(
      D,
      ['Note__c'],
      readers(org1),
      async () => org1.clients.dmo.removeFields(D, ['Note__c']),
      cover,
      undefined,
      fast,
    ),
    [{ ...dropped(M), developerName: 'sel_Note__c' }],
  );
  // A pair that never goes away is unconfirmed after the bounded reads.
  const org2 = single();
  await assert.rejects(
    removeFieldsChecked(
      D,
      ['Note__c'],
      readers(org2),
      async () => {
        org2.events.push(`dmo:remove:${D}:Note__c`);
        const found = org2.state.dmos.get(D);
        found.fields = found.fields.filter((entry) => entry.name !== 'Note__c');
      },
      cover,
      undefined,
      fast,
    ),
    (error) => error.code === 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED',
  );
  // A field that never goes away is unconfirmed too.
  const org3 = single();
  await assert.rejects(
    removeFieldsChecked(D, ['Note__c'], readers(org3), async () => {}, cover, undefined, fast),
    (error) => error.code === 'DMO_PERSISTENCE_UNCONFIRMED',
  );
  // A DMO whose mapping list answers 404 has no mappings, so no pair is dropped.
  const org4 = world({ [D]: all }, []);
  const notFound = {
    ...org4.clients.mapping,
    list: async () => {
      throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
    },
  };
  assert.deepEqual(
    await removeFieldsChecked(
      D,
      ['Note__c'],
      { dmo: org4.clients.dmo, mappings: notFound },
      async () => org4.clients.dmo.removeFields(D, ['Note__c']),
      cover,
      undefined,
      fast,
    ),
    [],
  );
  // A mapped field without an identified pair is refused before the write.
  const org5 = world({ [D]: all }, []);
  const marked = {
    get: async (name) => {
      const raw = await org5.clients.dmo.get(name);
      for (const entry of raw.fields) if (entry.name === 'Note__c') entry.isMapped = true;
      return raw;
    },
  };
  await assert.rejects(
    removeFieldsChecked(
      D,
      ['Note__c'],
      { dmo: marked, mappings: org5.clients.mapping },
      async () => assert.fail('no removal'),
      cover,
      undefined,
      fast,
    ),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
});

test('the checked removal refuses before the write when the snapshot disagrees with the admission', async () => {
  for (const coverage of [
    // The pair sits in a mapping whose file is not part of the selection.
    { fields: ['Note__c'], sources: ['OtherSource__dll'] },
    // The field was not mapped when the batch was admitted.
    { fields: [], sources: ['SrcA__dll'] },
  ]) {
    const org = single();
    await assert.rejects(
      removeFieldsChecked(
        D,
        ['Note__c'],
        readers(org),
        async () => assert.fail('nothing may be removed'),
        coverage,
        undefined,
        fast,
      ),
      (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
    );
    assert.deepEqual(org.writes(), []);
  }
});
