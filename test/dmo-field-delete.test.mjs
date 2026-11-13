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
  // Like Salesforce, the destructive change drops the pairs of the removed fields itself; the
  // drop shows up after `dropDelay` further mapping reads, or never when `dropPairs` is false.
  org.dropPairs = true;
  org.dropDelay = 0;
  const settleDrop = () => {
    if (!org.pendingDrop) return;
    if (org.dropDelay > 0) {
      org.dropDelay--;
      return;
    }
    for (const entry of org.mappings)
      entry.fieldMappings = entry.fieldMappings.filter(
        (pair) => !org.pendingDrop.includes(pair.targetFieldDeveloperName),
      );
    org.pendingDrop = undefined;
  };
  org.remover = {
    get: async () => assert.fail('reads use the bound reader'),
    removeFields: async (name, fields) => {
      org.calls.push(`removeFields:${name}:${fields.join(',')}`);
      org.dmo.fields = org.dmo.fields.filter((entry) => !fields.includes(entry.name));
      if (org.dropPairs) org.pendingDrop = fields;
      org.onRemove?.();
    },
  };
  // Source DLO reads: a refreshed mapping file leaves out the pairs Salesforce generated.
  org.dloReader = {
    get: async (name) => {
      org.calls.push(`dlo.get:${name}`);
      return {
        name,
        label: name,
        category: 'Other',
        dataSpaceInfo: [{ name: 'default' }],
        fields: ['Id__c', 'Note__c', 'Extra__c', 'DataSource__c'].map((entry) => ({
          name: entry,
          label: entry,
          dataType: 'Text',
          isPrimaryKey: entry === 'Id__c',
        })),
      };
    },
  };
  org.mappingClient = {
    list: async (name) => {
      org.calls.push(`mapping.list:${name}`);
      settleDrop();
      return { objectSourceTargetMaps: structuredClone(org.mappings) };
    },
    get: async (name) => {
      org.calls.push(`mapping.get:${name}`);
      settleDrop();
      return structuredClone(org.mappings.find((entry) => entry.developerName === name));
    },
    deleteField: async (name, selector) => {
      org.calls.push(`deleteField:${name}:${selector}`);
      assert.fail('pairs are never removed one by one');
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
  command.createDloNativeDeleteClient = () => org.dloReader;
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

/**
 * Turn the synthetic DMO into a standard one: a standard key and field beside the custom fields,
 * and one field without a creationType.
 * @param {object} org Synthetic org.
 * @returns {object} The same org.
 */
function asStandard(org) {
  org.dmo.creationType = 'Standard';
  org.dmo.fields[0].isPrimaryKey = false;
  const base = { label: 'Standard', type: 'Text', isPrimaryKey: false };
  org.dmo.fields.push(
    { ...base, name: 'ssot__Id__c', isPrimaryKey: true, creationType: 'Standard' },
    { ...base, name: 'ssot__Name__c', creationType: 'Standard' },
    { ...base, name: 'Unmarked__c' },
  );
  return org;
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
    ...['Adg', 'Bridge', undefined].map((creationType) => ({
      code: 'UNSUPPORTED_DMO_TARGET',
      field: 'Note__c',
      prepare: (org) => {
        org.dmo.creationType = creationType;
      },
    })),
    // On a standard DMO only a field marked custom is removed.
    ...['ssot__Name__c', 'ssot__Id__c', 'Unmarked__c', 'DataSource__c'].map((field) => ({
      code: 'UNSUPPORTED_DMO_FIELD_CHANGE',
      field,
      message:
        field === 'ssot__Id__c' ? /primary-key field/u : /standard, generated or system field/u,
      prepare: (org) => asStandard(org),
    })),
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
      code: 'MAPPING_INVENTORY_UNCONFIRMED',
      field: 'Note__c',
      prepare: (org) => {
        const read = org.mappingClient.get;
        org.mappingClient.get = async (name) => {
          const detail = await read(name);
          detail.fieldMappings[0].sourceFieldDeveloperName = 'Drifted__c';
          return detail;
        };
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

test('a custom field of a standard DMO is removed with its pairs like one of a custom DMO', async () => {
  const org = asStandard(createOrg(twoMappings()));
  const preview = await run(org, { field: ['Note__c'], preview: true });
  assert.equal(preview.result.status, 'success');
  assert.deepEqual(writes(org), []);
  org.calls.length = 0;
  const { result, exitCode } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': await temporaryRoot(),
  });
  assert.equal(result.status, 'success');
  assert.equal(exitCode, undefined);
  assert.deepEqual(org.calls, [
    'resolveTarget',
    'dmo.get',
    // The mapped-field lookup is the read-only list by DMO name.
    `mapping.list:${dmoName}`,
    'mapping.get:MapA',
    'mapping.get:MapB',
    // Fresh pre-write snapshot.
    'dmo.get',
    `mapping.list:${dmoName}`,
    'mapping.get:MapA',
    'mapping.get:MapB',
    `removeFields:${dmoName}:Note__c`,
    // Readback; the read that confirms the removal is the result, no further read.
    'dmo.get',
    `mapping.list:${dmoName}`,
  ]);
  const [item] = result.result.items;
  assert.equal(item.mutation, 'confirmed-deleted');
  assert.equal(item.unmappedPairs.length, 2);
  assert.deepEqual(item.removedFields, ['Note__c']);
  // The standard fields, the standard key and the unmarked field are untouched.
  assert.deepEqual(
    org.dmo.fields.map((entry) => entry.name),
    ['Id__c', 'Extra__c', 'DataSource__c', 'ssot__Id__c', 'ssot__Name__c', 'Unmarked__c'],
  );
});

test('a failed mapping lookup does not block a field that is not mapped', async () => {
  const org = createOrg();
  const list = org.mappingClient.list;
  let failures = 1;
  org.mappingClient.list = async (name) => {
    if (failures-- > 0) {
      org.calls.push('mapping.list');
      throw new NativeMappingError('MAPPING_HTTP_ERROR', 503);
    }
    return list(name);
  };
  const { result } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': await temporaryRoot(),
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].unmappedPairs, []);
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
  // The pre-write snapshot needs the mapping inventory: a lookup that keeps failing stops there.
  const stuck = createOrg();
  stuck.mappingClient.list = async () => {
    throw new NativeMappingError('MAPPING_HTTP_ERROR', 503);
  };
  const stopped = await run(stuck, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(stopped.result.status, 'blocked');
  assert.equal(stopped.result.diagnostics.errors[0].code, 'MAPPING_HTTP_ERROR');
  assert.match(stopped.result.diagnostics.errors[0].message, /Nothing was written/u);
  assert.equal(stopped.result.result.items[0].mutation, 'not-attempted');
  assert.deepEqual(writes(stuck), []);
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
    'Planned pair drop (Salesforce removes it with the field): Note__c -> Note__c in mapping MapA.',
    'Planned pair drop (Salesforce removes it with the field): Note__c -> Note__c in mapping MapB.',
    'Planned pair drop (Salesforce removes it with the field): Extra__c -> Extra__c in mapping MapB.',
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
    `mapping.list:${dmoName}`,
    'mapping.get:MapA',
    `removeFields:${dmoName}:Note__c`,
    'dmo.get',
    `mapping.list:${dmoName}`,
  ]);
  // The mapping that keeps all its pairs is unchanged.
  assert.deepEqual(org.mappings, [mapping('MapA', 'SourceA__dll', ['Id__c'])]);
  // Mapping reads share the scoped client with the bound sender.
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

test('a field mapped by two mappings is removed once, its pairs drop from both, and existing files are refreshed', async () => {
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
    'dmo.get',
    `mapping.list:${dmoName}`,
    'mapping.get:MapA',
    'mapping.get:MapB',
    // One destructive change; no pair is removed one by one.
    `removeFields:${dmoName}:Note__c`,
    'dmo.get',
    `mapping.list:${dmoName}`,
    // Local refresh: only files that already exist are read again and overwritten; the mapping
    // file is written lean, from fresh source DLO and target DMO reads.
    'dmo.get',
    'mapping.get:MapA',
    'dlo.get:SourceA__dll',
    'dmo.get',
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
  // Refreshed files are lean like a retrieve: the System field is left out.
  assert.deepEqual(
    savedDmo.spec.fields.map((field) => field.name),
    ['Id__c', 'Extra__c'],
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
  assert.equal(
    org.calls.some((call) => call.startsWith('deleteField')),
    false,
  );
  assert.deepEqual(lines, [
    'Delete: success.',
    'dropped pair Note__c -> Note__c in mapping MapA',
    'dropped pair Note__c -> Note__c in mapping MapB',
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

/**
 * Run `change` right before the n-th DMO read, so the org moves between two steps.
 * @param {object} org Synthetic org.
 * @param {number} read 1-based DMO read before which the change happens.
 * @param {Function} change Mutation of the org state.
 */
function beforeDmoRead(org, read, change) {
  const get = org.reader.get;
  let count = 0;
  org.reader.get = async () => {
    if (++count === read) change();
    return get();
  };
}

test('a mapping pair changed between the plan and the write stops before any write', async () => {
  const root = await temporaryRoot();
  const org = createOrg(twoMappings());
  await writeNativeDmoDocument(normalizeNativeDmo(org.dmo), root, false);
  const before = await readFile(dmoFile(root), 'utf8');
  // The plan saw both pairs; the pre-write snapshot finds only the pair of MapA.
  beforeDmoRead(org, 2, () => {
    org.mappings[1].fieldMappings = org.mappings[1].fieldMappings.filter(
      (pair) => pair.targetFieldDeveloperName !== 'Note__c',
    );
  });
  const { result, lines, exitCode } = await run(
    org,
    { field: ['Note__c'], 'confirm-delete': true, 'output-dir': root },
    {},
    false,
  );
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'blocked');
  assert.equal(item.mutation, 'not-attempted');
  assert.deepEqual(item.removedFields, []);
  assert.deepEqual(item.unmappedPairs, []);
  assert.equal(item.refreshedFiles, undefined);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'MAPPING_UNMAP_PLAN_CHANGED');
  assert.match(diagnostic.message, /Nothing was written; no field or mapping pair was removed\./u);
  assert.match(diagnostic.message, /No local file was refreshed\. No retry or rollback\./u);
  assert.deepEqual(writes(org), []);
  assert.equal(await readFile(dmoFile(root), 'utf8'), before);
  assert.deepEqual(lines.slice(0, 2), [
    'Delete: blocked.',
    `Blocked: dmo:${dmoName} field Note__c; mutation: not-attempted.`,
  ]);
});

test('a pair still present after the destructive change is unconfirmed, never removed separately', async () => {
  const org = createOrg(twoMappings());
  org.dropPairs = false;
  const { result, exitCode } = await run(org, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'deletion-unconfirmed');
  assert.equal(item.mutation, 'acknowledged');
  assert.deepEqual(item.unmappedPairs, []);
  assert.deepEqual(item.removedFields, []);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
  assert.match(diagnostic.message, /exactly their mapping pairs dropped/u);
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
  assert.equal(org.calls.filter((call) => call === 'sleep').length, 2);
});

test('pairs that Salesforce drops after a delay are waited for within the readback', async () => {
  const org = createOrg(twoMappings());
  org.dropDelay = 1;
  const { result } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': await temporaryRoot(),
  });
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].unmappedPairs.length, 2);
  assert.equal(org.calls.filter((call) => call === 'sleep').length, 1);
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
});

test('a mapping still CREATING after the removal is waited for; it must return to ACTIVE', async () => {
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  let creatingReads = 0;
  org.onRemove = () => {
    org.mappings[0].status = 'CREATING';
  };
  const list = org.mappingClient.list;
  org.mappingClient.list = async (name) => {
    const answer = await list(name);
    if (org.mappings[0].status === 'CREATING' && creatingReads-- <= 0)
      org.mappings[0].status = 'ACTIVE';
    return answer;
  };
  const settled = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': await temporaryRoot(),
  });
  assert.equal(settled.result.status, 'success');
  assert.equal(org.calls.filter((call) => call === 'sleep').length, 1);
  // A mapping that never returns to ACTIVE leaves the removal unconfirmed.
  const stuck = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  stuck.onRemove = () => {
    stuck.mappings[0].status = 'CREATING';
  };
  const { result } = await run(stuck, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
  assert.equal(result.result.items[0].mutation, 'acknowledged');
  // The field is gone, so the open question is the mapping, not the field.
  assert.equal(result.diagnostics.errors[0].code, 'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED');
  assert.equal(stuck.calls.filter((call) => call === `mapping.list:${dmoName}`).length, 5);
  assert.deepEqual(writes(stuck), [`removeFields:${dmoName}:Note__c`]);
});

test('anything else Salesforce changes with the removal is a side effect, never retried', async () => {
  const cases = {
    'an unrelated pair dropped': (org) => {
      org.mappings[1].fieldMappings = org.mappings[1].fieldMappings.filter(
        (pair) => pair.targetFieldDeveloperName !== 'Extra__c',
      );
    },
    'another field changed': (org) => {
      org.dmo.fields.find((field) => field.name === 'Extra__c').label = 'Changed';
    },
    'a DMO property changed': (org) => {
      org.dmo.label = 'Changed';
    },
    'a mapping no longer ACTIVE': (org) => {
      org.mappings[0].status = 'ERROR';
    },
    'a mapping gone': (org) => {
      org.mappings.pop();
    },
  };
  for (const [name, change] of Object.entries(cases)) {
    const org = createOrg(twoMappings());
    org.onRemove = () => change(org);
    const { result, exitCode } = await run(org, { field: ['Note__c'], 'confirm-delete': true });
    assert.equal(result.status, 'failed', name);
    assert.equal(exitCode, 1);
    const [item] = result.result.items;
    assert.equal(item.outcome, 'deletion-unconfirmed', name);
    assert.equal(item.mutation, 'acknowledged', name);
    assert.deepEqual(item.unmappedPairs, [], name);
    assert.equal(result.diagnostics.errors[0].code, 'DMO_FIELD_REMOVAL_SIDE_EFFECT', name);
    assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`], name);
    assert.equal(org.calls.filter((call) => call === 'sleep').length, 0, name);
  }
});

test('a field still shown as mapped without a pair at the pre-write recheck is never removed', async () => {
  const org = createOrg([mapping('MapA', 'SourceA__dll', ['Id__c', 'Note__c'])]);
  beforeDmoRead(org, 2, () => {
    org.mappings[0].fieldMappings = org.mappings[0].fieldMappings.filter(
      (pair) => pair.targetFieldDeveloperName !== 'Note__c',
    );
  });
  const { result, exitCode } = await run(org, { field: ['Note__c'], 'confirm-delete': true });
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'blocked');
  assert.equal(item.mutation, 'not-attempted');
  assert.deepEqual(item.removedFields, []);
  assert.deepEqual(item.unmappedPairs, []);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
  assert.match(diagnostic.message, /no mapping targeting this DMO lists a pair/u);
  assert.match(diagnostic.message, /Nothing was written/u);
  assert.deepEqual(writes(org), []);
});

test('a failed destructive change is sent once and reported as unknown', async () => {
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
  assert.deepEqual(item.unmappedPairs, []);
  assert.equal(item.refreshedFiles, undefined);
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_FAILED');
  assert.match(diagnostic.message, /destructive change for Note__c was sent once/u);
  assert.deepEqual(writes(org), [`removeFields:${dmoName}:Note__c`]);
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
    /acknowledged, but the result was not confirmed: the field\(s\) gone/u,
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
    'dropped pair Note__c -> Note__c in mapping MapA',
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
  // --confirm-delete is accepted (and not needed) for a whole native selection.
  const confirmed = await run(org, { 'confirm-delete': true }, seams);
  assert.equal(confirmed.result.status, 'success');
});

test('a hand-written mapping file is found by its binding and refreshed under its own name', async () => {
  const root = await temporaryRoot();
  const org = createOrg(twoMappings());
  // The file is named after the source-side mapping, not after the org mapping MapB.
  const local = normalizeNativeMapping(org.mappings[1]);
  local.identity.apiName = 'MyMapping';
  await writeNativeMappingDocument(local, root, false);
  const preview = await run(org, { field: ['Note__c'], preview: true, 'output-dir': root });
  assert.deepEqual(
    preview.result.result.items[0].localFiles.map((file) => [
      path.basename(file.path),
      file.exists,
    ]),
    [
      ['Example__dlm.dmo-meta.json', false],
      ['MapA.mapping-meta.json', false],
      ['MyMapping.mapping-meta.json', true],
    ],
  );
  const { result } = await run(org, {
    field: ['Note__c'],
    'confirm-delete': true,
    'output-dir': root,
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.result.items[0].refreshedFiles.at(-1), {
    path: path.join(root, 'data360', 'mapping', 'MyMapping.mapping-meta.json'),
    outcome: 'refreshed',
  });
  const saved = JSON.parse(
    await readFile(path.join(root, 'data360', 'mapping', 'MyMapping.mapping-meta.json'), 'utf8'),
  );
  assert.equal(saved.identity.apiName, 'MyMapping');
  assert.deepEqual(
    saved.spec.fieldMappings.map((pair) => pair.targetFieldDeveloperName),
    ['Id__c', 'Extra__c'],
  );
  // No file under the org name was created.
  assert.deepEqual(await readdir(path.join(root, 'data360', 'mapping')), [
    'MyMapping.mapping-meta.json',
  ]);
});
