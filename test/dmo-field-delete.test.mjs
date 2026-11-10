import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { NativeDmoError, normalizeNativeDmo } from '../lib/artifacts/native-dmo-document.js';
import {
  NativeMappingError,
  normalizeNativeMapping,
} from '../lib/artifacts/native-mapping-document.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';

const dmoName = 'Example__dlm';

/**
 * Build one raw mapping onto the example DMO with identity pairs.
 * @param {string} developerName Mapping name.
 * @param {string} source Source DLO name.
 * @param {string[]} names Field names mapped one to one.
 * @returns {object} Raw ACTIVE mapping.
 */
function mapping(developerName, source, names) {
  return {
    developerName,
    sourceEntityDeveloperName: source,
    targetEntityDeveloperName: dmoName,
    status: 'ACTIVE',
    fieldMappings: names.map((name) => ({
      sourceFieldDeveloperName: name,
      targetFieldDeveloperName: name,
      developerName: `${developerName}_${name}`,
    })),
  };
}

/**
 * Build a synthetic org: one custom DMO, its mappings, recording clients and a call log.
 * @param {object[]} mappings Raw mappings targeting the DMO.
 * @returns {object} Mutable org state, clients and ordered calls.
 */
function createOrg(mappings = []) {
  const mappedNames = new Set(
    mappings.flatMap((entry) => entry.fieldMappings.map((pair) => pair.targetFieldDeveloperName)),
  );
  const field = (name, extra = {}) => ({
    name,
    label: name,
    type: 'Text',
    isPrimaryKey: false,
    creationType: 'Custom',
    ...(mappedNames.has(name) ? { isMapped: true } : {}),
    ...extra,
  });
  const org = {
    calls: [],
    mappings: structuredClone(mappings),
    dmo: {
      id: 'never-use-id',
      name: dmoName,
      label: 'Example',
      category: 'OTHER',
      creationType: 'Custom',
      dataSpaceName: 'default',
      fields: [
        field('Id__c', { isPrimaryKey: true }),
        field('Note__c'),
        field('Extra__c'),
        field('DataSource__c', { creationType: 'System' }),
      ],
    },
  };
  org.reader = {
    get: async () => {
      org.calls.push('dmo.get');
      return structuredClone(org.dmo);
    },
    delete: async () => assert.fail('a field-level delete never deletes the DMO'),
  };
  org.remover = {
    get: async () => assert.fail('reads use the bound reader'),
    removeFields: async (name, fields) => {
      org.calls.push(`removeFields:${name}:${fields.join(',')}`);
      org.dmo.fields = org.dmo.fields.filter((entry) => !fields.includes(entry.name));
    },
  };
  org.mappingClient = {
    apiVersion: '68.0',
    list: async (name) => {
      org.calls.push(`mapping.list:${name}`);
      return { objectSourceTargetMaps: structuredClone(org.mappings) };
    },
    get: async (name) => {
      org.calls.push(`mapping.get:${name}`);
      return structuredClone(org.mappings.find((entry) => entry.developerName === name));
    },
    deleteField: async (name, selector) => {
      org.calls.push(`deleteField:${name}:${selector}`);
      const entry = org.mappings.find((candidate) => candidate.developerName === name);
      const pair = entry.fieldMappings.find((candidate) => candidate.developerName === selector);
      entry.fieldMappings = entry.fieldMappings.filter((candidate) => candidate !== pair);
      const stillMapped = org.mappings.some((candidate) =>
        candidate.fieldMappings.some(
          (other) => other.targetFieldDeveloperName === pair.targetFieldDeveloperName,
        ),
      );
      const target = org.dmo.fields.find((item) => item.name === pair.targetFieldDeveloperName);
      if (!stillMapped && target) delete target.isMapped;
    },
    create: async () => assert.fail('no mapping create'),
    update: async () => assert.fail('no mapping update'),
    delete: async () => assert.fail('a field-level delete never deletes a mapping'),
  };
  return org;
}

/**
 * Run the public delete command against the synthetic org.
 * @param {object} org Synthetic org.
 * @param {object} flags Flags merged over the defaults.
 * @param {object} [overrides] Command seams replaced for this run.
 * @param {boolean} [json] Whether JSON output is enabled.
 * @returns {Promise<{result: object, lines: string[], exitCode: unknown}>} Envelope, printed lines and exit code.
 */
async function run(org, flags, overrides = {}, json = true) {
  const lines = [];
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: { metadata: [`dmo:${dmoName}`], preview: false, ...flags },
  });
  command.jsonEnabled = () => json;
  command.log = (line) => lines.push(line);
  command.resolveTarget = async () => {
    org.calls.push('resolveTarget');
    return 'target';
  };
  command.createDmoNativeDeleteClient = () => org.reader;
  command.createDmoClient = () => org.remover;
  command.createMappingClient = (...arguments_) => {
    org.mappingArguments = arguments_;
    return org.mappingClient;
  };
  command.createMappingSender = () => ({
    request: async () => assert.fail('fake mapping clients never reach the bound sender'),
  });
  command.fieldRemovalSettle = {
    attempts: 3,
    delayMs: 0,
    sleep: async () => {
      org.calls.push('sleep');
    },
  };
  Object.assign(command, overrides);
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    const result = await command.run();
    return { result, lines, exitCode: process.exitCode };
  } finally {
    process.exitCode = before;
  }
}

const temporaryRoot = async () => mkdtemp(path.join(os.tmpdir(), 'dmo-field-delete-'));
const writes = (org) =>
  org.calls.filter((call) => call.startsWith('deleteField') || call.startsWith('removeFields'));
const dmoFile = (root) => path.join(root, 'data360', 'dmo', `${dmoName}.dmo-meta.json`);
const mappingFile = (root, name) =>
  path.join(root, 'data360', 'mapping', `${name}.mapping-meta.json`);
const twoMappings = () => [
  mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c']),
  mapping('MapB', 'SourceB__dll', ['Id__c', 'Note__c', 'Extra__c']),
];

test('field delete flag combinations are refused before any org call', async () => {
  for (const flags of [
    { field: ['Note__c'], metadata: [`dmo:${dmoName}`, 'dmo:Other__dlm'] },
    { field: ['Note__c'], metadata: ['mapping:MapA'] },
    { field: ['Note__c'], metadata: ['dlo:Example__dll'] },
    { field: ['Note__c'], metadata: ['dmo:Example'] },
    { field: ['Note__c'], metadata: ['data-transform:Example'], 'transform-target-id': 'x' },
    { field: ['Note__c'], 'source-dir': 'data360' },
    { field: ['Note__c'], 'delete-dlo': true },
    { field: ['Note__c'], 'transform-target-id': '1dtxx0000000001AAA' },
    { 'output-dir': 'project' },
    { 'output-dir': 'project', field: [] },
  ]) {
    const org = createOrg();
    const { result, exitCode } = await run(org, { 'confirm-delete': true, ...flags });
    assert.equal(result.status, 'blocked', JSON.stringify(flags));
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_FIELD_DELETE_SELECTION');
    assert.deepEqual(result.result.items, []);
    assert.deepEqual(org.calls, []);
    assert.equal(exitCode, 1);
  }
  for (const name of ['Note', 'Note__dlm', '1Note__c', 'Example__dlm.Note__c', '']) {
    const org = createOrg();
    const { result } = await run(org, { 'confirm-delete': true, field: ['Note__c', name] });
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_DMO_FIELD', name);
    assert.deepEqual(org.calls, []);
  }
  const org = createOrg();
  const { result } = await run(org, {
    'confirm-delete': true,
    field: ['Note__c'],
    'api-version': '60.0',
  });
  assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
  assert.deepEqual(org.calls, []);
});

test('field delete without --confirm-delete is blocked before any org call; preview needs none', async () => {
  const org = createOrg(twoMappings());
  const { result, exitCode } = await run(org, { field: ['Note__c'] });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'DMO_FIELD_DELETE_CONFIRMATION_REQUIRED');
  assert.match(result.diagnostics.errors[0].message, /nothing was changed/u);
  assert.equal(result.result.items[0].outcome, 'blocked');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.deepEqual(org.calls, []);
  assert.equal(exitCode, 1);
  const preview = await run(org, { field: ['Note__c'], preview: true });
  assert.equal(preview.result.status, 'success');
});

test('field delete admission refuses unsupported targets and fields with reads only', async () => {
  const cases = [
    {
      code: 'UNSUPPORTED_DMO_TARGET',
      field: 'Note__c',
      prepare: (org) => {
        org.dmo.creationType = 'Standard';
      },
    },
    { code: 'UNSUPPORTED_DMO_FIELD_CHANGE', field: 'Id__c', message: /primary-key field/u },
    {
      code: 'UNSUPPORTED_DMO_FIELD_CHANGE',
      field: 'DataSource__c',
      message: /generated or system field/u,
    },
    { code: 'DMO_FIELD_NOT_FOUND', field: 'Missing__c', message: /Missing__c does not exist/u },
    {
      code: 'DMO_FIELD_REMOVAL_MAPPED',
      field: 'Note__c',
      message: /mapping lookup failed/u,
      prepare: (org) => {
        org.mappingClient.list = async () => {
          org.calls.push('mapping.list');
          throw new NativeMappingError('MAPPING_HTTP_ERROR', 503);
        };
      },
    },
    {
      code: 'DMO_FIELD_REMOVAL_MAPPED',
      field: 'Note__c',
      message: /no mapping targeting this DMO lists a pair/u,
      prepare: (org) => {
        org.mappingClient.list = async () => {
          throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
        };
      },
    },
    {
      code: 'MAPPING_UNMAP_VERSION_UNQUALIFIED',
      field: 'Note__c',
      flags: { 'api-version': '69.0' },
      message: /API 61\.0 to 68\.0/u,
      prepare: (org) => {
        org.mappingClient.apiVersion = '69.0';
      },
    },
    {
      code: 'MAPPING_TARGET_NOT_SETTLED',
      field: 'Note__c',
      prepare: (org) => {
        org.mappings[0].status = 'CREATING';
      },
    },
    {
      code: 'MAPPING_SELECTOR_REQUIRED',
      field: 'Note__c',
      prepare: (org) => {
        delete org.mappings[0].fieldMappings[1].developerName;
      },
    },
    {
      code: 'DMO_FIELD_REMOVAL_UNAVAILABLE',
      field: 'Extra__c',
      prepare: (org) => {
        delete org.remover.removeFields;
      },
    },
  ];
  for (const { code, field, message, prepare, flags } of cases) {
    const org = createOrg(twoMappings());
    prepare?.(org);
    const { result, exitCode } = await run(org, {
      field: [field],
      'confirm-delete': true,
      ...flags,
    });
    const [diagnostic] = result.diagnostics.errors;
    assert.equal(diagnostic.code, code);
    if (message) assert.match(diagnostic.message, message);
    assert.match(diagnostic.message, /No write attempted/u);
    assert.equal(result.status, 'blocked', code);
    assert.equal(result.result.items[0].outcome, 'blocked');
    assert.equal(result.result.items[0].mutation, 'not-attempted');
    assert.deepEqual(writes(org), [], code);
    assert.equal(exitCode, 1);
  }
});

test('a failed mapping lookup does not block a field that is not mapped', async () => {
  const org = createOrg();
  org.mappingClient.list = async () => {
    org.calls.push('mapping.list');
    throw new NativeMappingError('MAPPING_HTTP_ERROR', 503);
  };
  const { result } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': await temporaryRoot(),
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].unmappedPairs, []);
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
});

test('field delete preview reports the plan and writes nothing to the org or to disk', async () => {
  const root = await temporaryRoot();
  const org = createOrg(twoMappings());
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c', 'Extra__c', 'Note__c'], preview: true, 'output-dir': root },
    {
      writeNativeDmo: async () => assert.fail('preview never writes'),
      writeNativeMapping: async () => assert.fail('preview never writes'),
    },
    false,
  );
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  const [item] = result.result.items;
  assert.equal(item.operation, 'preview');
  assert.equal(item.outcome, 'delete');
  assert.equal(item.mutation, 'not-attempted');
  assert.deepEqual(item.fields, ['Note__c', 'Extra__c']);
  assert.deepEqual(item.plan, [
    {
      operation: 'unmap',
      apiName: 'MapA',
      sourceFieldDeveloperName: 'Note__c',
      targetFieldDeveloperName: 'Note__c',
      developerName: 'MapA_Note__c',
    },
    {
      operation: 'unmap',
      apiName: 'MapB',
      sourceFieldDeveloperName: 'Note__c',
      targetFieldDeveloperName: 'Note__c',
      developerName: 'MapB_Note__c',
    },
    {
      operation: 'unmap',
      apiName: 'MapB',
      sourceFieldDeveloperName: 'Extra__c',
      targetFieldDeveloperName: 'Extra__c',
      developerName: 'MapB_Extra__c',
    },
    { operation: 'delete-field', apiName: dmoName, fieldName: 'Note__c' },
    { operation: 'delete-field', apiName: dmoName, fieldName: 'Extra__c' },
  ]);
  assert.deepEqual(item.localFiles, [
    { path: dmoFile(root), exists: true },
    { path: mappingFile(root, 'MapA'), exists: false },
    { path: mappingFile(root, 'MapB'), exists: false },
  ]);
  assert.deepEqual(writes(org), []);
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
  assert.deepEqual(await readdir(path.join(root, 'data360')), ['dmo']);
  assert.deepEqual(lines, [
    'Delete preview: success.',
    'Planned field unmap: Note__c -> Note__c in mapping MapA.',
    'Planned field unmap: Note__c -> Note__c in mapping MapB.',
    'Planned field unmap: Extra__c -> Extra__c in mapping MapB.',
    `Planned field delete: Note__c from dmo ${dmoName}.`,
    `Planned field delete: Extra__c from dmo ${dmoName}.`,
    `Planned file refresh: ${dmoFile(root)}`,
    `Not present locally, not created: ${mappingFile(root, 'MapA')}`,
    `Not present locally, not created: ${mappingFile(root, 'MapB')}`,
  ]);
});

test('an unmapped field is removed with one destructive change and no mapping write', async () => {
  const root = await temporaryRoot();
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c'])]);
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root, dataspace: 'default' },
    {},
    false,
  );
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  assert.deepEqual(org.calls, [
    'resolveTarget',
    'dmo.get',
    `mapping.list:${dmoName}`,
    'dmo.get',
    `removeFields:${dmoName}:Note__c`,
    'dmo.get',
  ]);
  // Mapping reads and pair removals share the scoped client with the bound sender.
  assert.deepEqual(org.mappingArguments.slice(0, 4), ['target', '68.0', undefined, 'default']);
  assert.equal(typeof org.mappingArguments[4].request, 'function');
  const [item] = result.result.items;
  assert.equal(item.operation, 'delete-field');
  assert.equal(item.outcome, 'deleted');
  assert.equal(item.mutation, 'confirmed-deleted');
  assert.deepEqual(item.removedFields, ['Note__c']);
  assert.deepEqual(item.unmappedPairs, []);
  assert.deepEqual(item.refreshedFiles, [{ path: dmoFile(root), outcome: 'not-present' }]);
  assert.deepEqual(await readdir(root), []);
  assert.deepEqual(lines, [
    'Delete: success.',
    `deleted field Note__c from dmo ${dmoName}`,
    `not present locally, not created: ${dmoFile(root)}`,
  ]);
});

test('a field mapped by two mappings is unmapped from both, removed, and existing files are refreshed', async () => {
  const root = await temporaryRoot();
  const org = createOrg(twoMappings());
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  await writeNativeMappingDocument(normalizeNativeMapping(org.mappings[0]), root, false);
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root },
    {},
    false,
  );
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  assert.deepEqual(org.calls, [
    'resolveTarget',
    'dmo.get',
    `mapping.list:${dmoName}`,
    'mapping.get:MapA',
    'mapping.get:MapB',
    'deleteField:MapA:MapA_Note__c',
    'mapping.get:MapA',
    'deleteField:MapB:MapB_Note__c',
    'mapping.get:MapB',
    'dmo.get',
    `removeFields:${dmoName}:Note__c`,
    'dmo.get',
    // Local refresh: only files that already exist are read again and overwritten.
    'dmo.get',
    'mapping.get:MapA',
  ]);
  const [item] = result.result.items;
  assert.deepEqual(item.removedFields, ['Note__c']);
  assert.deepEqual(item.unmappedPairs, [
    { mapping: 'MapA', sourceFieldDeveloperName: 'Note__c', targetFieldDeveloperName: 'Note__c' },
    { mapping: 'MapB', sourceFieldDeveloperName: 'Note__c', targetFieldDeveloperName: 'Note__c' },
  ]);
  assert.deepEqual(item.refreshedFiles, [
    { path: dmoFile(root), outcome: 'refreshed' },
    { path: mappingFile(root, 'MapA'), outcome: 'refreshed' },
    { path: mappingFile(root, 'MapB'), outcome: 'not-present' },
  ]);
  const savedDmo = JSON.parse(await readFile(dmoFile(root), 'utf8'));
  assert.deepEqual(
    savedDmo.spec.fields.map((field) => field.name),
    ['Id__c', 'Extra__c', 'DataSource__c'],
  );
  const savedMapping = JSON.parse(await readFile(mappingFile(root, 'MapA'), 'utf8'));
  assert.deepEqual(
    savedMapping.spec.fieldMappings.map((pair) => pair.targetFieldDeveloperName),
    ['Id__c'],
  );
  assert.deepEqual(await readdir(path.join(root, 'data360', 'mapping')), [
    'MapA.mapping-meta.json',
  ]);
  // The other pairs of both mappings are untouched.
  assert.deepEqual(
    org.mappings[1].fieldMappings.map((pair) => pair.targetFieldDeveloperName),
    ['Id__c', 'Extra__c'],
  );
  assert.deepEqual(lines, [
    'Delete: success.',
    'unmapped Note__c -> Note__c in mapping MapA',
    'unmapped Note__c -> Note__c in mapping MapB',
    `deleted field Note__c from dmo ${dmoName}`,
    `refreshed ${dmoFile(root)}`,
    `refreshed ${mappingFile(root, 'MapA')}`,
    `not present locally, not created: ${mappingFile(root, 'MapB')}`,
  ]);
  // A repeat finds no such field and writes nothing.
  org.calls.length = 0;
  const repeat = await run(org, { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root });
  assert.equal(repeat.result.status, 'blocked');
  assert.equal(repeat.result.diagnostics.errors[0].code, 'DMO_FIELD_NOT_FOUND');
  assert.deepEqual(org.calls, ['resolveTarget', 'dmo.get']);
});

test('a failed pair removal stops the delete and reports the pairs already removed', async () => {
  const root = await temporaryRoot();
  const org = createOrg(twoMappings());
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  const removePair = org.mappingClient.deleteField;
  org.mappingClient.deleteField = async (name, selector) => {
    if (name === 'MapB') {
      org.calls.push(`deleteField:${name}:${selector}`);
      throw new NativeMappingError('MAPPING_HTTP_ERROR', 500);
    }
    return removePair(name, selector);
  };
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root },
    {},
    false,
  );
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'unknown');
  assert.deepEqual(item.removedFields, []);
  assert.deepEqual(item.unmappedPairs, [
    { mapping: 'MapA', sourceFieldDeveloperName: 'Note__c', targetFieldDeveloperName: 'Note__c' },
  ]);
  assert.equal(item.refreshedFiles, undefined);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'MAPPING_HTTP_ERROR');
  assert.match(diagnostic.message, /HTTP 500/u);
  assert.match(diagnostic.message, /already removed and confirmed: Note__c -> Note__c in MapA\./u);
  assert.match(diagnostic.message, /from mapping MapB was sent once and is not confirmed/u);
  assert.match(diagnostic.message, /No field was removed\. No local file was refreshed\./u);
  assert.deepEqual(writes(org), ['deleteField:MapA:MapA_Note__c', 'deleteField:MapB:MapB_Note__c']);
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
  assert.deepEqual(lines.slice(0, 3), [
    'Delete: failed.',
    'unmapped Note__c -> Note__c in mapping MapA',
    `Failed: dmo:${dmoName} field Note__c; mutation: unknown.`,
  ]);
});

test('a pair still present after its DELETE is unconfirmed and stops before the next write', async () => {
  const org = createOrg(twoMappings());
  org.mappingClient.deleteField = async (name, selector) => {
    org.calls.push(`deleteField:${name}:${selector}`);
  };
  const { result } = await run(org, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.errors[0].code, 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.deepEqual(result.result.items[0].unmappedPairs, []);
  assert.deepEqual(writes(org), ['deleteField:MapA:MapA_Note__c']);
});

test('a mapping that leaves ACTIVE after the pair removal is not settled', async () => {
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  const removePair = org.mappingClient.deleteField;
  org.mappingClient.deleteField = async (name, selector) => {
    await removePair(name, selector);
    org.mappings[0].status = 'CREATING';
  };
  const creating = await run(org, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(creating.result.diagnostics.errors[0].code, 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
  assert.equal(org.calls.filter((call) => call === 'mapping.get:MapA').length, 4);
  assert.deepEqual(writes(org), ['deleteField:MapA:MapA_Note__c']);
});

test('a field still shown as mapped after the pair removals is never removed', async () => {
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  const removePair = org.mappingClient.deleteField;
  org.mappingClient.deleteField = async (name, selector) => {
    await removePair(name, selector);
    org.dmo.fields.find((field) => field.name === 'Note__c').isMapped = true;
  };
  const { result, exitCode } = await run(org, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'partially-applied');
  assert.deepEqual(item.removedFields, []);
  assert.equal(item.unmappedPairs.length, 1);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
  assert.match(diagnostic.message, /Note__c still shows as mapped/u);
  assert.match(diagnostic.message, /already removed and confirmed: Note__c -> Note__c in MapA\./u);
  assert.match(diagnostic.message, /No field was removed\./u);
  assert.deepEqual(writes(org), ['deleteField:MapA:MapA_Note__c']);
});

test('a failed destructive change is sent once and reported with the pairs already removed', async () => {
  const root = await temporaryRoot();
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  org.remover.removeFields = async (name, fields) => {
    org.calls.push(`removeFields:${name}:${fields.join(',')}`);
    throw new NativeDmoError('DMO_FIELD_REMOVAL_FAILED');
  };
  const { result, exitCode } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': root,
  });
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'unknown');
  assert.deepEqual(item.removedFields, []);
  assert.equal(item.unmappedPairs.length, 1);
  assert.equal(item.refreshedFiles, undefined);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_FAILED');
  assert.match(diagnostic.message, /destructive change for Note__c was sent once/u);
  assert.match(diagnostic.message, /already removed and confirmed/u);
  assert.deepEqual(writes(org), [
    'deleteField:MapA:MapA_Note__c',
    `removeFields:${dmoName}:Note__c`,
  ]);
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
});

test('a field still readable after the destructive change is unconfirmed, never replayed', async () => {
  const root = await temporaryRoot();
  const org = createOrg();
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  org.remover.removeFields = async (name, fields) => {
    org.calls.push(`removeFields:${name}:${fields.join(',')}`);
  };
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root },
    {},
    false,
  );
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'deletion-unconfirmed');
  assert.equal(item.mutation, 'acknowledged');
  assert.deepEqual(item.removedFields, []);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_PERSISTENCE_UNCONFIRMED');
  assert.match(
    diagnostic.message,
    /acknowledged, but the absence of the field\(s\) is not confirmed/u,
  );
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
  // Three bounded readbacks with injected spacing between them.
  assert.equal(org.calls.filter((call) => call === 'sleep').length, 2);
  assert.equal(org.calls.filter((call) => call === 'dmo.get').length, 5);
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
  assert.equal(lines[1], `Unconfirmed: dmo:${dmoName} field Note__c; mutation: acknowledged.`);
});

test('a failed local refresh never hides the confirmed org change', async () => {
  const root = await temporaryRoot();
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  await writeNativeMappingDocument(normalizeNativeMapping(org.mappings[0]), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root },
    {
      writeNativeDmo: async () => {
        throw new NativeDmoError('OUTPUT_CHANGED');
      },
    },
    false,
  );
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'deleted');
  assert.equal(item.mutation, 'confirmed-deleted');
  assert.deepEqual(item.removedFields, ['Note__c']);
  assert.deepEqual(item.refreshedFiles, [
    { path: dmoFile(root), outcome: 'failed', code: 'OUTPUT_CHANGED' },
    { path: mappingFile(root, 'MapA'), outcome: 'refreshed' },
  ]);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'LOCAL_REFRESH_FAILED');
  assert.match(diagnostic.message, /were deleted from Example__dlm in the org/u);
  assert.match(diagnostic.message, /Do not repeat the delete/u);
  assert.ok(diagnostic.message.includes(`${dmoFile(root)} (OUTPUT_CHANGED)`));
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
  assert.deepEqual(lines.slice(0, 5), [
    'Delete: failed.',
    'unmapped Note__c -> Note__c in mapping MapA',
    `deleted field Note__c from dmo ${dmoName}`,
    `refresh failed (OUTPUT_CHANGED): ${dmoFile(root)}`,
    `refreshed ${mappingFile(root, 'MapA')}`,
  ]);
});

test('an existing file that already matches the target is reported unchanged', async () => {
  const root = await temporaryRoot();
  const org = createOrg();
  const after = structuredClone(org.dmo);
  after.fields = after.fields.filter((field) => field.name !== 'Note__c');
  await writeNativeDmoDocument(normalizeNativeDmo(after), root, false);
  const { result } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': root,
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].refreshedFiles, [
    { path: dmoFile(root), outcome: 'unchanged' },
  ]);
});

test('whole-DMO delete without --field keeps its behaviour and never touches the field seams', async () => {
  const org = createOrg(twoMappings());
  let deleted = 0;
  const seams = {
    createDmoClient: () => assert.fail('no Metadata client without --field'),
    createMappingClient: () => assert.fail('no mapping client for a DMO delete'),
    writeNativeDmo: async () => assert.fail('no local write without --field'),
    deleteDmo: async (name) => {
      deleted++;
      return { apiName: name, targetApiName: name, dataSpace: 'default' };
    },
  };
  const { result, lines } = await run(org, {}, seams, false);
  assert.equal(result.status, 'success');
  assert.equal(deleted, 1);
  assert.equal(result.result.items[0].operation, 'delete');
  assert.equal(result.result.items[0].fields, undefined);
  assert.deepEqual(lines, ['Delete: success.', `deleted dmo ${dmoName}`]);
  // --confirm-delete stays refused for a whole native selection.
  const confirmed = await run(org, { 'confirm-delete': true }, seams);
  assert.equal(confirmed.result.diagnostics.errors[0].code, 'INVALID_SELECTION');
});
