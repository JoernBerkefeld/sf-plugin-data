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
import { executeMapping } from '../lib/services/command-native-mapping.js';

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
const unremoved =
  'No field was removed, and earlier writes of this deployment stay in place; correct the reported check before another attempt.';

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
      // Salesforce would silently drop the pair; the plugin must never get that far.
      for (const entry of names) assert.equal(mapped(name, entry), false, `${entry} still mapped`);
      const found = state.dmos.get(name);
      found.fields = found.fields.filter((entry) => !names.includes(entry.name));
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
  const root = cwd ?? (await mkdtemp(path.join(os.tmpdir(), 'native-dmo-staged-removal-')));
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

test('one command edits the DMO, reconciles the mapping, then removes the field', async () => {
  const org1 = single();
  const selection = {
    dmos: [dmoFile(D, [...keep, 'Extra__c'], 'Changed')],
    mappings: [mappingFile(M, 'SrcA__dll', D, [...keep, 'Extra__c'])],
    services: org1.services,
  };
  const { result, cwd } = await deploy(selection);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [
    `dmo:patch:${D}`,
    `mapping:unmap:${M}:Note__c`,
    `mapping:add:${M}:Extra__c`,
    `dmo:remove:${D}:Note__c`,
  ]);
  // The removal is followed by the readback that confirms absence and definition.
  assert.equal(org1.events.at(-1), `dmo:get:${D}`);
  assert.ok(org1.events.lastIndexOf(`dmo:remove:${D}:Note__c`) < org1.events.length - 1);
  // One item per file, in DMO then mapping order.
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[0].diagnostics, []);
  assert.ok(!('pendingRemoval' in result.result.items[0]));
  assert.ok(!org1.state.dmos.get(D).fields.some((entry) => entry.name === 'Note__c'));
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
  assert.deepEqual(org1.writes(), [
    'dlo:execute',
    `mapping:unmap:${M}:Note__c`,
    `dmo:remove:${D}:Note__c`,
  ]);
  assert.equal(org1.events.at(-1), `dmo:get:${D}`);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dlo', 'unchanged', 'not-attempted'],
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[1].removedFields, ['Note__c']);
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
  test(`removal stage re-checks the mapped marker, edit stage wrote=${edited}`, async () => {
    const org1 = single();
    const { result } = await deploy({
      dmos: [dmoFile(D, keep, edited ? 'Changed' : 'Example')],
      mappings: [mappingFile(M, 'SrcA__dll', D, keep)],
      services: {
        ...org1.services,
        // Another actor maps the field again right after the mapping deployment settled.
        executeMapping: async (...arguments_) => {
          const outcome = await executeMapping(...arguments_);
          org1.state.mappings[0].fieldMappings.push(pair('Note__c'));
          return outcome;
        },
      },
    });
    assert.equal(result.status, edited ? 'failed' : 'blocked', JSON.stringify(result));
    assert.deepEqual(org1.writes(), [
      ...(edited ? [`dmo:patch:${D}`] : []),
      `mapping:unmap:${M}:Note__c`,
    ]);
    const [item, mapping] = result.result.items;
    assert.equal(item.family, 'dmo');
    // The confirmed PATCH stays reported; no removal was dispatched.
    assert.equal(item.outcome, edited ? 'failed' : 'blocked');
    assert.equal(item.mutation, edited ? 'confirmed-updated' : 'not-attempted');
    assert.equal(item.removedFields, undefined);
    assert.equal(item.diagnostics.length, 1);
    assert.equal(item.diagnostics[0].code, 'DMO_FIELD_REMOVAL_MAPPED');
    assert.equal(item.diagnostics[0].message, refusal(unremoved));
    assert.equal(mapping.outcome, 'updated');
    assert.ok(org1.state.dmos.get(D).fields.some((entry) => entry.name === 'Note__c'));
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
  assert.deepEqual(org1.writes(), [
    `dmo:patch:${D}`,
    `mapping:unmap:${M}:Note__c`,
    `dmo:remove:${D}`,
  ]);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'unknown');
  assert.equal(item.removedFields, undefined);
  assert.deepEqual(
    item.diagnostics.map(({ code }) => code),
    ['DMO_FIELD_REMOVAL_FAILED'],
  );
});

test('a batch that stops at the mapping leaves the open removal named on the DMO item', async () => {
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
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`]);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'updated');
  assert.equal(item.mutation, 'confirmed-updated');
  assert.equal(item.removedFields, undefined);
  assert.deepEqual(item.diagnostics, [
    {
      code: 'DMO_FIELD_REMOVAL_PENDING',
      message: `Not removed: Note__c. The removal runs after the selected mapping(s) ${M} are deployed.`,
    },
  ]);
});

test('preview names the removal and its mappings and writes nothing', async () => {
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
      message: `Fields missing from the file are removed with one Metadata API destructive change, after the selected mapping(s) ${M} are deployed: Note__c.`,
    },
  ]);
  assert.equal(mapping.family, 'mapping');
  assert.equal(mapping.outcome, 'update');
  assert.deepEqual(
    mapping.plan.map((step) => [step.operation, step.targetFieldDeveloperName]),
    [['unmap', 'Note__c']],
  );
});

test('only the DMO with removals is staged; its removal follows its own last mapping', async () => {
  const A = 'ExampleA__dlm';
  const B = 'ExampleB__dlm';
  const org1 = world({ [A]: all, [B]: all }, [
    { name: 'SrcA_map_A', source: 'SrcA__dll', target: A, fields: all },
    { name: 'SrcB_map_B', source: 'SrcB__dll', target: B, fields: keep },
  ]);
  const stages = [];
  const { result } = await deploy({
    dmos: [dmoFile(A, keep), dmoFile(B, all, 'Changed')],
    mappings: [
      mappingFile('SrcA_map_A', 'SrcA__dll', A, keep),
      mappingFile('SrcB_map_B', 'SrcB__dll', B, all),
    ],
    services: {
      ...org1.services,
      executeNativeDmo: async (document, client, scope, options) => {
        stages.push([document.identity.apiName, options.stage, options.coveredMappedFields]);
        return executeDmo(document, client, scope, options);
      },
    },
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(org1.writes(), [
    `dmo:patch:${B}`,
    'mapping:unmap:SrcA_map_A:Note__c',
    `dmo:remove:${A}:Note__c`,
    'mapping:add:SrcB_map_B:Note__c',
  ]);
  assert.deepEqual(stages, [
    [A, 'edits', ['Note__c']],
    [B, undefined, undefined],
    [A, 'removal', undefined],
  ]);
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [
      [A, 'updated', 'confirmed-updated'],
      [B, 'updated', 'confirmed-updated'],
      ['SrcA_map_A', 'updated', 'confirmed-updated'],
      ['SrcB_map_B', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.equal(result.result.items[1].removedFields, undefined);
});

test('a DMO without planned removals keeps the single-stage DMO then mapping order', async () => {
  for (const allowed of [true, false]) {
    const org1 = world({ [D]: all }, [{ name: M, source: 'SrcA__dll', target: D, fields: keep }]);
    const stages = [];
    const { result } = await deploy({
      dmos: [dmoFile(D, all, 'Changed')],
      mappings: [mappingFile(M, 'SrcA__dll', D, all)],
      flags: { 'allow-field-removal': allowed },
      services: {
        ...org1.services,
        executeNativeDmo: async (document, client, scope, options) => {
          stages.push(options?.stage);
          return executeDmo(document, client, scope, options);
        },
      },
    });
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `mapping:add:${M}:Note__c`]);
    assert.deepEqual(stages, [undefined]);
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

test('an unmapped removal without a selected mapping on the DMO stays single-stage', async () => {
  const org1 = world({ [D]: all }, []);
  const stages = [];
  const { result } = await deploy({
    dmos: [dmoFile(D, keep, 'Changed')],
    services: {
      ...org1.services,
      executeNativeDmo: async (document, client, scope, options) => {
        stages.push(options.stage);
        return executeDmo(document, client, scope, options);
      },
    },
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(stages, [undefined]);
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
});

test('two mappings sharing the field each drop their pair, then the DMO removes the field', async () => {
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
  // The field stays mapped after the first mapping and is only removed once both let go of it.
  assert.deepEqual(org1.writes(), [
    `mapping:unmap:${M}:Note__c`,
    `mapping:unmap:${second}:Note__c`,
    `dmo:remove:${D}:Note__c`,
  ]);
  assert.equal(org1.events.at(-1), `dmo:get:${D}`);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'updated', 'confirmed-updated'],
      ['mapping', 'updated', 'confirmed-updated'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
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
    staged: true,
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
    { staged: true, coveredMappedFields: ['Note__c'] },
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
  // Unmapped removals stage only beside a selected mapping on the DMO; other refusals are left
  // to the item's own preflight.
  const free = world({ [D]: all }, []);
  assert.deepEqual(
    await admitDmoFieldRemoval(dmoFile(D, keep), free.clients.dmo, undefined, undefined, []),
    { staged: false, coveredMappedFields: [] },
  );
  assert.deepEqual(
    await admitDmoFieldRemoval(dmoFile(D, keep), free.clients.dmo, undefined, undefined, [
      selected('SrcA__dll', keep),
    ]),
    { staged: true, coveredMappedFields: [] },
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
    { staged: false, coveredMappedFields: [] },
  );
  assert.deepEqual(free.writes(), []);
});

test('the service stages keep the mapped guard and never send an edit twice', async () => {
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
  // The removal stage ignores the coverage and refuses the still mapped field before any write.
  await assert.rejects(
    deployNativeDmo(file, dmo, undefined, fast, {
      ...allow,
      coveredMappedFields: ['Note__c'],
      stage: 'removal',
    }),
    (error) => error.code === 'DMO_FIELD_REMOVAL_MAPPED',
  );
  assert.deepEqual(org1.writes(), []);
  // The edit stage sends the PATCH only and reports the removal as pending.
  const edits = await deployNativeDmo(file, dmo, undefined, fast, {
    ...allow,
    coveredMappedFields: ['Note__c'],
    stage: 'edits',
  });
  assert.equal(edits.operation, 'update');
  assert.deepEqual(edits.pendingRemoval, ['Note__c']);
  assert.equal(edits.removedFields, undefined);
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`]);
  // Without anything to PATCH the edit stage writes nothing and still reports the removal.
  const idle = await deployNativeDmo(file, dmo, undefined, fast, {
    ...allow,
    coveredMappedFields: ['Note__c'],
    stage: 'edits',
  });
  assert.equal(idle.operation, 'unchanged');
  assert.deepEqual(idle.pendingRemoval, ['Note__c']);
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`]);
  // A definition that differs again at the removal stage is not patched a second time.
  org1.state.mappings[0].fieldMappings = org1.state.mappings[0].fieldMappings.filter(
    (item) => item.targetFieldDeveloperName !== 'Note__c',
  );
  org1.state.dmos.get(D).label = 'Drifted';
  const stale = await executeDmo(file, dmo, undefined, { ...allow, stage: 'removal' });
  assert.equal(stale.outcome, 'blocked');
  assert.equal(stale.mutation, 'not-attempted');
  assert.equal(stale.diagnostics[0].code, 'DMO_PERSISTENCE_UNCONFIRMED');
  assert.equal(
    stale.diagnostics[0].message,
    `Field removal stopped for ${D}: the target definition no longer matches the file after the edit stage, and an edit is never sent twice. ${unremoved}`,
  );
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`]);
  // With the definition in place the removal stage removes once and confirms absence.
  org1.state.dmos.get(D).label = 'Changed';
  const removed = await deployNativeDmo(file, dmo, undefined, fast, { ...allow, stage: 'removal' });
  assert.equal(removed.operation, 'update');
  assert.deepEqual(removed.removedFields, ['Note__c']);
  assert.deepEqual(org1.writes(), [`dmo:patch:${D}`, `dmo:remove:${D}:Note__c`]);
  const again = await deployNativeDmo(file, dmo, undefined, fast, { ...allow, stage: 'removal' });
  assert.equal(again.operation, 'unchanged');
});
