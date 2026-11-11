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
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import {
  deleteNativeMapping,
  deployNativeMapping,
  preflightDeleteNativeMapping,
  preflightNativeMapping,
} from '../lib/services/native-mapping.js';
import { executeMapping, preflightMapping } from '../lib/services/command-native-mapping.js';

const DLO = 'CliDloS1_f7b3__dll';
const DMO = 'ssot__Brand__dlm';
const NAME = 'CliDloS1_f7b3_map_Brand_1794351589475';
const systemSources = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c'];
const standardName = (source) => `ssot__${source.slice(0, -3)}Id__c`;
const generatedPairs = [
  ...systemSources.map((source) => [source, standardName(source)]),
  ['KQ_Id__c', 'KQ_Id__c'],
];
const authoredPairs = [
  ['Id__c', 'ssot__Id__c'],
  ['Name__c', 'ssot__Name__c'],
];
const notePair = ['Note__c', 'Note__c'];
const pair = ([source, target]) => ({
  sourceFieldDeveloperName: source,
  targetFieldDeveloperName: target,
  developerName: `sel_${source}`,
});
const names = ([source, target]) => ({
  sourceFieldDeveloperName: source,
  targetFieldDeveloperName: target,
});
const field = (name, creationType, extra = {}) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: false,
  creationType,
  usageTag: 'None',
  ...extra,
});

/**
 * Synthetic org with one standard DMO whose first mapping activates it for good, as observed live.
 * @param {object} [options] Initial state.
 * @param {boolean} [options.active] Whether the DMO was mapped before.
 * @param {string} [options.systemType] Field creationType the DMO reports for its system fields.
 * @param {Array<{name: string, source: string, pairs: string[][]}>} [options.mappings] Existing mappings.
 * @param {string[]} [options.custom] Custom fields on the DMO.
 * @returns {object} State, write ledger and injected clients.
 */
function world({
  active = false,
  systemType = 'Standard',
  mappings = [],
  custom = ['Note__c'],
} = {}) {
  const writes = [];
  const state = {
    active: active || mappings.length > 0,
    custom: [...custom],
    mappings: mappings.map((entry) => ({
      developerName: entry.name,
      sourceEntityDeveloperName: entry.source,
      targetEntityDeveloperName: DMO,
      status: 'ACTIVE',
      fieldMappings: entry.pairs.map((value) => pair(value)),
    })),
  };
  const mapped = (name) =>
    state.mappings.some((entry) =>
      entry.fieldMappings.some((item) => item.targetFieldDeveloperName === name),
    );
  const readDmo = () => ({
    name: DMO,
    label: 'Brand',
    category: state.active ? 'OTHER' : 'UNASSIGNED',
    creationType: 'Standard',
    dataSpaceName: 'default',
    isEnabled: state.active,
    fields: [
      field('ssot__Id__c', 'Standard', {
        isPrimaryKey: true,
        ...(state.active ? { keyQualifierName: 'KQ_Id' } : {}),
      }),
      field('ssot__Name__c', 'Standard'),
      ...systemSources.map((source) => field(standardName(source), systemType)),
      ...state.custom.map((name) => field(name, 'Custom')),
      ...(state.active ? [field('KQ_Id__c', 'System', { usageTag: 'KeyQualifier' })] : []),
    ].map((entry) => ({ ...entry, ...(mapped(entry.name) ? { isMapped: true } : {}) })),
  });
  const dmo = {
    get: async (name) => {
      if (name !== DMO) throw new NativeDmoError('DMO_HTTP_ERROR', 404);
      return readDmo();
    },
    create: async () => assert.fail('a standard DMO is never created'),
    delete: async () => assert.fail('a standard DMO is never deleted'),
    update: async () => assert.fail('no DMO PATCH expected'),
    removeFields: async (name, fields) => {
      writes.push(['dmo:remove', name, fields]);
      state.custom = state.custom.filter((entry) => !fields.includes(entry));
      // Salesforce drops the mapping pairs of a removed field together with it (live API 68).
      for (const entry of state.mappings)
        entry.fieldMappings = entry.fieldMappings.filter(
          (item) => !fields.includes(item.targetFieldDeveloperName),
        );
    },
  };
  const dlo = {
    get: async (name) => ({
      name,
      label: 'Source',
      category: 'Other',
      status: 'ACTIVE',
      dataSpaceInfo: [{ name: 'default' }],
      fields: ['Id__c', 'Name__c', 'Note__c', 'Extra__c', ...systemSources, 'KQ_Id__c'].map(
        (entry) => ({
          name: entry,
          label: entry,
          dataType: 'Text',
          isPrimaryKey: entry === 'Id__c',
        }),
      ),
    }),
  };
  const find = (name) => {
    const found = state.mappings.find((entry) => entry.developerName === name);
    if (!found) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
    return found;
  };
  const mapping = {
    apiVersion: '68.0',
    list: async (target, source) => {
      const entries = state.mappings.filter(
        (entry) =>
          entry.targetEntityDeveloperName === target &&
          (source === undefined || entry.sourceEntityDeveloperName === source),
      );
      // A DMO that was never mapped answers the mapping list with HTTP 404.
      if (!state.active) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return { objectSourceTargetMaps: structuredClone(entries) };
    },
    get: async (name) => structuredClone(find(name)),
    create: async (body) => {
      writes.push(['mapping:create', body]);
      state.active = true;
      state.mappings.push({
        developerName: NAME,
        sourceEntityDeveloperName: body.sourceEntityDeveloperName,
        targetEntityDeveloperName: body.targetEntityDeveloperName,
        status: 'ACTIVE',
        fieldMappings: [
          ...body.fieldMapping.map((item) => ({
            ...item,
            developerName: `sel_${item.sourceFieldDeveloperName}`,
          })),
          ...generatedPairs.map((value) => pair(value)),
        ],
      });
      return { ...structuredClone(state.mappings.at(-1)), status: 'CREATING' };
    },
    update: async (name, body) => {
      writes.push(['mapping:add', name, body]);
      const found = find(name);
      for (const item of body.fieldMapping)
        found.fieldMappings.push({
          ...item,
          developerName: `new_${item.sourceFieldDeveloperName}`,
        });
      return structuredClone(found);
    },
    deleteField: async (name, selector) => {
      const found = find(name);
      const removed = found.fieldMappings.find((item) => item.developerName === selector);
      writes.push(['mapping:unmap', name, removed.targetFieldDeveloperName]);
      found.fieldMappings = found.fieldMappings.filter((item) => item !== removed);
    },
    delete: async () => assert.fail('no mapping DELETE expected'),
    // The DMO stays active after its mappings are gone.
    remove: async (name) => {
      find(name);
      writes.push(['mapping:remove', name]);
      state.mappings = state.mappings.filter((entry) => entry.developerName !== name);
    },
  };
  return { writes, state, readDmo, dmo, dlo, mapping, deps: { source: dlo, target: dmo } };
}
/**
 * Authored mapping file onto the standard DMO.
 * @param {string[][]} pairs Source and target field names per pair.
 * @param {string} [source] Source DLO.
 * @returns {object} Portable document under a source-side name.
 */
const file = (pairs, source = DLO) =>
  normalizeNativeMapping({
    developerName: 'AuthoredElsewhere_1',
    sourceEntityDeveloperName: source,
    targetEntityDeveloperName: DMO,
    status: 'ACTIVE',
    fieldMappings: pairs.map((value) => pair(value)),
  });
const complete = [...authoredPairs, ...generatedPairs];
const liveBody = {
  sourceEntityDeveloperName: DLO,
  targetEntityDeveloperName: DMO,
  fieldMapping: authoredPairs.map((value) => names(value)),
};
const notice = (diagnostics) => {
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'MAPPING_ACTIVATES_STANDARD_DMO');
  assert.match(diagnostics[0].message, /ssot__Brand__dlm activates it permanently/u);
  assert.match(diagnostics[0].message, /enabled, gets a category and a generated key qualifier/u);
  assert.match(diagnostics[0].message, /Deleting the mapping does not undo this/u);
};

for (const systemType of ['Standard', 'System'])
  for (const authored of ['two authored pairs', 'retrieved file with generated pairs'])
    test(`standard target create sends only the authored pairs: ${authored}, system fields read as ${systemType}`, async () => {
      const org = world({ systemType });
      const input = file(authored === 'two authored pairs' ? authoredPairs : complete);
      const before = structuredClone(input);
      const preview = await preflightMapping(input, org.mapping, org.deps);
      assert.equal(preview.outcome, 'create');
      assert.deepEqual(
        preview.plan,
        authoredPairs.map((value) => ({ operation: 'create', ...names(value) })),
      );
      notice(preview.diagnostics);
      assert.deepEqual(org.writes, []);
      const result = await executeMapping(input, org.mapping, org.deps);
      assert.equal(result.outcome, 'created');
      assert.equal(result.mutation, 'confirmed-created');
      notice(result.diagnostics);
      assert.deepEqual(org.writes, [['mapping:create', liveBody]]);
      assert.deepEqual(input, before);
      // The generated pairs come back and the same file, retrieved, deploys as unchanged.
      const retrieved = normalizeNativeMapping(await org.mapping.get(NAME));
      assert.deepEqual(
        retrieved.spec.fieldMappings.map((item) => [
          item.sourceFieldDeveloperName,
          item.targetFieldDeveloperName,
        ]),
        complete,
      );
      const again = await preflightMapping(retrieved, org.mapping, org.deps);
      assert.equal(again.outcome, 'noop');
      assert.deepEqual(again.diagnostics, []);
      assert.deepEqual(await executeMapping(retrieved, org.mapping, org.deps), {
        outcome: 'unchanged',
        mutation: 'not-attempted',
        diagnostics: [],
      });
      assert.equal(org.writes.length, 1);
    });

test('no activation notice when the standard DMO is already enabled', async () => {
  // Activated by an earlier mapping that no longer exists: enabled, key qualifier present.
  const org = world({ active: true });
  const preview = await preflightMapping(file(complete), org.mapping, org.deps);
  assert.equal(preview.outcome, 'create');
  assert.deepEqual(preview.diagnostics, []);
  const result = await executeMapping(file(complete), org.mapping, org.deps);
  assert.deepEqual(result, {
    outcome: 'created',
    mutation: 'confirmed-created',
    diagnostics: [],
  });
  assert.deepEqual(org.writes, [['mapping:create', liveBody]]);
  // isEnabled missing from the read counts as not active.
  const unread = world();
  const read = unread.dmo.get;
  unread.dmo.get = async (name) => {
    const { isEnabled, ...rest } = await read(name);
    assert.equal(isEnabled, false);
    return rest;
  };
  const plan = await preflightNativeMapping(file(authoredPairs), unread.mapping, unread.deps);
  assert.equal(plan.activatesStandardDmo, true);
});

test('standard target update adds a pair for a custom field with one names-only PATCH', async () => {
  const org = world({ mappings: [{ name: NAME, source: DLO, pairs: complete }] });
  const input = file([...complete, notePair]);
  const preview = await preflightMapping(input, org.mapping, org.deps);
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.diagnostics, []);
  assert.deepEqual(preview.plan, [{ operation: 'add', apiName: NAME, ...names(notePair) }]);
  const result = await executeMapping(input, org.mapping, org.deps);
  assert.deepEqual(result, {
    outcome: 'updated',
    mutation: 'confirmed-updated',
    diagnostics: [],
  });
  assert.deepEqual(org.writes, [
    [
      'mapping:add',
      NAME,
      {
        sourceEntityDeveloperName: DLO,
        targetEntityDeveloperName: DMO,
        fieldMapping: [names(notePair)],
      },
    ],
  ]);
  assert.equal(org.readDmo().fields.find((entry) => entry.name === 'Note__c').isMapped, true);
});

for (const systemType of ['Standard', 'System'])
  test(`standard target update removes an ordinary pair and keeps the five protected ones, system fields read as ${systemType}`, async () => {
    const org = world({
      systemType,
      mappings: [{ name: NAME, source: DLO, pairs: [...complete, notePair] }],
    });
    const plan = await preflightNativeMapping(file(complete), org.mapping, org.deps);
    assert.equal(plan.operation, 'update');
    assert.deepEqual(plan.removals, [pair(notePair)]);
    assert.deepEqual(
      plan.evidence.protectedPairs.map((item) => item.sourceFieldDeveloperName),
      ['Id__c', ...systemSources, 'KQ_Id__c'],
    );
    const result = await deployNativeMapping(file(complete), org.mapping, org.deps);
    assert.equal(result.operation, 'update');
    assert.equal(result.document.spec.fieldMappings.length, 6);
    assert.deepEqual(org.writes, [['mapping:unmap', NAME, 'Note__c']]);
    assert.ok(!('isMapped' in org.readDmo().fields.find((entry) => entry.name === 'Note__c')));
  });

for (const systemType of ['Standard', 'System'])
  test(`standard target update removes a pair onto a standard field, system fields read as ${systemType}`, async () => {
    // Source and target names differ and the target is a standard field: removable all the same.
    const namePair = authoredPairs[1];
    const org = world({
      systemType,
      mappings: [{ name: NAME, source: DLO, pairs: [...complete, notePair] }],
    });
    const input = file([...complete.filter((value) => value !== namePair), notePair]);
    const plan = await preflightNativeMapping(input, org.mapping, org.deps);
    assert.equal(plan.operation, 'update');
    assert.deepEqual(plan.removals, [pair(namePair)]);
    assert.equal(plan.evidence.protectedPairs.length, 5);
    assert.deepEqual(org.writes, []);
    const preview = await preflightMapping(input, org.mapping, org.deps);
    assert.deepEqual(preview.plan, [{ operation: 'unmap', apiName: NAME, ...pair(namePair) }]);
    const result = await executeMapping(input, org.mapping, org.deps);
    assert.deepEqual(result, {
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
    });
    assert.deepEqual(org.writes, [['mapping:unmap', NAME, 'ssot__Name__c']]);
    const after = normalizeNativeMapping(await org.mapping.get(NAME));
    assert.deepEqual(
      after.spec.fieldMappings.map((item) => item.sourceFieldDeveloperName).toSorted(),
      ['Id__c', 'Note__c', ...systemSources, 'KQ_Id__c'].toSorted(),
    );
    assert.ok(
      !('isMapped' in org.readDmo().fields.find((entry) => entry.name === 'ssot__Name__c')),
    );
    // The same file is unchanged afterwards.
    const again = await preflightMapping(input, org.mapping, org.deps);
    assert.equal(again.outcome, 'noop');
  });

test('standard target keeps the protected-pair refusal and sends authored create pairs as written', async () => {
  const mappings = [{ name: NAME, source: DLO, pairs: [...complete, notePair] }];
  // The key pair cannot be left out of a reconciliation; an omitted generated pair is kept.
  for (const omitted of ['Id__c', 'DataSource__c', 'KQ_Id__c']) {
    const org = world({ mappings });
    const input = file(complete.filter(([source]) => source !== omitted));
    if (omitted === 'Id__c')
      await assert.rejects(
        preflightNativeMapping(input, org.mapping, org.deps),
        (error) => error.code === 'MAPPING_PROTECTED_PAIR_REQUIRED',
        omitted,
      );
    else {
      const plan = await preflightNativeMapping(input, org.mapping, org.deps);
      assert.equal(plan.operation, 'update', omitted);
      assert.deepEqual(plan.removals, [pair(notePair)], omitted);
      assert.equal(plan.evidence.protectedPairs.length, 5, omitted);
    }
    assert.deepEqual(org.writes, []);
  }
  // An authored pair onto a system field of the DMO is sent as written; Salesforce decides.
  const unknown = world({ systemType: 'System' });
  const created = await preflightNativeMapping(
    file([...authoredPairs, ['Extra__c', 'ssot__DataSourceId__c']]),
    unknown.mapping,
    unknown.deps,
  );
  assert.equal(created.operation, 'create');
  assert.deepEqual(created.writes[0].body.fieldMapping.at(-1), {
    sourceFieldDeveloperName: 'Extra__c',
    targetFieldDeveloperName: 'ssot__DataSourceId__c',
  });
  assert.deepEqual(unknown.writes, []);
  // The key qualifier pair is only expected ahead of activation.
  const active = world({ active: true });
  const read = active.dmo.get;
  active.dmo.get = async (name) => {
    const raw = await read(name);
    return { ...raw, fields: raw.fields.filter((entry) => entry.name !== 'KQ_Id__c') };
  };
  await assert.rejects(
    preflightNativeMapping(file(complete), active.mapping, active.deps),
    (error) => error.code === 'MAPPING_FIELD_NOT_FOUND',
  );
});

for (const systemType of ['Standard', 'System'])
  test(`hand-written standard mapping without generated pairs is a no-op, system fields read as ${systemType}`, async () => {
    const org = world({ systemType, mappings: [{ name: NAME, source: DLO, pairs: complete }] });
    // Authored pairs only, no selectors.
    const input = file(authoredPairs);
    for (const item of input.spec.fieldMappings) delete item.developerName;
    assert.deepEqual(
      input.spec.fieldMappings,
      authoredPairs.map((value) => names(value)),
    );
    const before = structuredClone(input);
    const plan = await preflightNativeMapping(input, org.mapping, org.deps);
    assert.equal(plan.operation, 'noop');
    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.desired.spec.fieldMappings, [
      ...authoredPairs.map((value) => names(value)),
      ...generatedPairs.map((value) => pair(value)),
    ]);
    assert.deepEqual(input, before);
    const preview = await preflightMapping(input, org.mapping, org.deps);
    assert.equal(preview.outcome, 'noop');
    assert.deepEqual(preview.diagnostics, []);
    assert.deepEqual(await executeMapping(input, org.mapping, org.deps), {
      outcome: 'unchanged',
      mutation: 'not-attempted',
      diagnostics: [],
    });
    assert.deepEqual(org.writes, []);
    assert.equal(org.state.mappings[0].fieldMappings.length, 6);
    assert.deepEqual(input, before);
  });

test('refused DMO kinds stay MAPPING_TARGET_UNSUPPORTED under a standard name', async () => {
  for (const creationType of ['Adg', 'Bridge', undefined, 'Custom']) {
    const org = world();
    const read = org.dmo.get;
    org.dmo.get = async (name) => ({ ...(await read(name)), creationType });
    await assert.rejects(
      preflightNativeMapping(file(authoredPairs), org.mapping, org.deps),
      (error) => error.code === 'MAPPING_TARGET_UNSUPPORTED',
      String(creationType),
    );
    const blocked = await executeMapping(file(authoredPairs), org.mapping, org.deps);
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.diagnostics[0].code, 'MAPPING_TARGET_UNSUPPORTED');
    assert.deepEqual(org.writes, []);
  }
});

test('the last mapping of a standard DMO is deleted with one removal', async () => {
  const settle = { attempts: 3, delayMs: 0, sleep: async () => assert.fail('no wait expected') };
  // absent: the DMO answers the mapping list with HTTP 404 once its last mapping is gone.
  for (const absent of [false, true]) {
    const last = world({ mappings: [{ name: NAME, source: DLO, pairs: [...complete, notePair] }] });
    const list = last.mapping.list;
    last.mapping.list = async (...arguments_) => {
      if (absent && last.state.mappings.length === 0)
        throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return list(...arguments_);
    };
    const fieldNames = last.readDmo().fields.map((entry) => entry.name);
    const plan = await preflightDeleteNativeMapping(NAME, last.mapping, last.deps);
    assert.deepEqual(plan, {
      selected: normalizeNativeMapping(await last.mapping.get(NAME)),
      others: [],
      targetFields: fieldNames.toSorted(),
    });
    assert.deepEqual(last.writes, []);
    assert.deepEqual(await deleteNativeMapping(NAME, last.mapping, last.deps, undefined, settle), {
      apiName: NAME,
    });
    assert.deepEqual(last.writes, [['mapping:remove', NAME]]);
    // Deleting the mapping does not undo the activation or remove a field.
    assert.equal(last.readDmo().isEnabled, true);
    assert.deepEqual(
      last.readDmo().fields.map((entry) => entry.name),
      fieldNames,
    );
  }
});

test('standard target mapping delete keeps the other mapping and needs no pair qualification', async () => {
  const other = 'Other_map_Brand_2';
  // Pairs onto standard fields travel with the mapping; nothing is unmapped first.
  const org = world({
    mappings: [
      { name: NAME, source: DLO, pairs: [...complete, notePair] },
      { name: other, source: 'Other__dll', pairs: complete },
    ],
  });
  const plan = await preflightDeleteNativeMapping(NAME, org.mapping, org.deps);
  assert.deepEqual(plan.others, [normalizeNativeMapping(await org.mapping.get(other))]);
  assert.ok(!('removals' in plan));
  assert.deepEqual(org.writes, []);
  assert.deepEqual(
    await deleteNativeMapping(NAME, org.mapping, org.deps, undefined, {
      attempts: 1,
      delayMs: 0,
      sleep: async () => {},
    }),
    { apiName: NAME },
  );
  assert.deepEqual(org.writes, [['mapping:remove', NAME]]);
  assert.deepEqual(
    org.state.mappings.map((entry) => entry.developerName),
    [other],
  );
  // A removal that takes another mapping's pair with it is reported.
  const drift = world({
    mappings: [
      { name: NAME, source: DLO, pairs: [...complete, notePair] },
      { name: other, source: 'Other__dll', pairs: complete },
    ],
  });
  const remove = drift.mapping.remove;
  drift.mapping.remove = async (name) => {
    await remove(name);
    drift.state.mappings[0].fieldMappings.pop();
  };
  await assert.rejects(
    deleteNativeMapping(NAME, drift.mapping, drift.deps, undefined, {
      attempts: 1,
      delayMs: 0,
      sleep: async () => {},
    }),
    (error) => error.code === 'MAPPING_DELETE_SIDE_EFFECT',
  );
  assert.deepEqual(drift.writes, [['mapping:remove', NAME]]);
});

test('one command removes a custom field of a standard DMO and Salesforce drops its pair', async () => {
  const org = world({ mappings: [{ name: NAME, source: DLO, pairs: [...complete, notePair] }] });
  const dmoFile = normalizeNativeDmo(org.readDmo());
  dmoFile.spec.fields = dmoFile.spec.fields
    .filter((entry) => entry.name !== 'Note__c')
    .map(({ isMapped, ...entry }) => {
      assert.ok(isMapped === undefined || isMapped === true);
      return entry;
    });
  const mappingFile = normalizeNativeMapping(await org.mapping.get(NAME));
  mappingFile.spec.fieldMappings = mappingFile.spec.fieldMappings.filter(
    (item) => item.targetFieldDeveloperName !== 'Note__c',
  );
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-mapping-standard-'));
  await writeNativeDmoDocument(dmoFile, root, false);
  await writeNativeMappingDocument(mappingFile, root, false);
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      preview: false,
      'allow-field-removal': true,
      'target-org': 'my-org',
      metadata: [`mapping:${NAME}`, `dmo:${DMO}`],
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.captureInput = captureDeployInputDigest;
  command.resolveTargetOrg = async () => ({
    getOrgId: () => 'org',
    getUsername: () => 'user@example.com',
  });
  command.createDmoClient = () => org.dmo;
  command.createDloClient = () => org.dlo;
  command.createMappingClient = () => org.mapping;
  command.createSsotSender = () => ({
    request: async () => assert.fail('fake clients must not reach the bound sender'),
  });
  const previousCwd = process.cwd();
  const previousExit = process.exitCode;
  process.chdir(root);
  let result;
  try {
    result = await command.run();
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
  assert.equal(result.status, 'success', JSON.stringify(result));
  // One removal in the DMO position; the mapping file then finds the pair already gone.
  assert.deepEqual(org.writes, [['dmo:remove', DMO, ['Note__c']]]);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['dmo', 'updated', 'confirmed-updated'],
      ['mapping', 'unchanged', 'not-attempted'],
    ],
  );
  assert.deepEqual(result.result.items[0].removedFields, ['Note__c']);
  assert.deepEqual(result.result.items[0].droppedPairs, [{ mapping: NAME, ...names(notePair) }]);
  assert.deepEqual(org.state.custom, []);
  assert.ok(
    !org.state.mappings[0].fieldMappings.some(
      (item) => item.targetFieldDeveloperName === 'Note__c',
    ),
  );
});
