import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isCustomNativeDmo,
  NativeDmoError,
  nativeDmoWriteScope,
  normalizeNativeDmo,
} from '../lib/artifacts/native-dmo-document.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifySegmentInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import {
  deleteNativeDmo,
  deployNativeDmo,
  nativeDmoConfirmed,
  preflightNativeDmo,
  previewDeleteNativeDmo,
  previewFieldDeleteNativeDmo,
  retrieveNativeDmo,
} from '../lib/services/native-dmo.js';

const apiName = 'ssot__Brand__dlm';
const allow = { allowFieldRemoval: true };
const fast = { attempts: 3, delayMs: 0, sleep: async () => {} };
const field = (name, creationType, extra = {}) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: false,
  creationType,
  isDistinct: false,
  usageTag: 'None',
  ...extra,
});
/**
 * Synthetic standard DMO read that was never mapped: a standard key, a standard field, one
 * system field and the named custom fields.
 * @param {string[]} [custom] Custom field names present on the target.
 * @returns {object} Direct native read.
 */
const native = (custom = ['CliProbeB1__c']) => ({
  name: apiName,
  label: 'Brand',
  category: 'UNASSIGNED',
  creationType: 'Standard',
  dataSpaceName: 'default',
  isEnabled: false,
  fields: [
    field('ssot__Id__c', 'Standard', { isPrimaryKey: true }),
    field('ssot__Name__c', 'Standard'),
    field('DataSource__c', 'System'),
    ...custom.map((name) => field(name, 'Custom')),
  ],
});
/**
 * The same DMO after its first mapping: key qualifier field and name, category OTHER, enabled,
 * and its standard fields marked as mapped.
 * @param {string[]} [custom] Custom field names present on the target.
 * @returns {object} Direct native read.
 */
const activated = (custom = ['CliProbeB1__c']) => {
  const raw = native(custom);
  raw.category = 'OTHER';
  raw.isEnabled = true;
  raw.fields[0].keyQualifierName = 'KQ_Id';
  raw.fields[0].isMapped = true;
  raw.fields[1].isMapped = true;
  raw.fields.push(field('KQ_Id__c', 'System', { usageTag: 'KeyQualifier' }));
  return raw;
};
const document = (custom) => normalizeNativeDmo(native(custom));
const authored = (name, label = name.slice(0, -3)) => ({
  name,
  label,
  dataType: 'Text',
  isPrimaryKey: false,
});
/**
 * Recording client whose reads follow the writes it has seen.
 * @param {object} [start] Initial raw read.
 * @returns {{calls: Array<unknown[]>, client: object, state: object}} Ordered calls, client and raw state.
 */
const recording = (start = native()) => {
  const calls = [];
  const state = structuredClone(start);
  const client = {
    get: async (name) => {
      calls.push(['get', name]);
      return structuredClone(state);
    },
    create: async () => assert.fail('a standard DMO is never created'),
    delete: async () => assert.fail('a standard DMO is never deleted'),
    update: async (name, body) => {
      calls.push(['update', name, body]);
      if (body.label !== undefined) state.label = body.label;
      if (body.description !== undefined) state.description = body.description;
      for (const input of body.fields ?? []) {
        const found = state.fields.find((entry) => entry.name === `${input.name}__c`);
        if (found) found.label = input.label;
        else
          state.fields.push(
            field(`${input.name}__c`, 'Custom', { label: input.label, type: input.dataType }),
          );
      }
      return structuredClone(state);
    },
    removeFields: async (name, names) => {
      calls.push(['remove', name, names]);
      state.fields = state.fields.filter((entry) => !names.includes(entry.name));
    },
  };
  return { calls, client, state };
};
const twoCustom = () => native(['Keep__c', 'CliProbeB1__c']);
const refusedTarget = (error) =>
  error instanceof NativeDmoError && error.code === 'UNSUPPORTED_DMO_TARGET';
const planOperation = async (...arguments_) => {
  const plan = await preflightNativeDmo(...arguments_);
  return plan.operation;
};
const writes = (calls) => calls.filter(([method]) => method !== 'get');
const readOnly = (raw) => ({
  get: async () => raw,
  create: async () => assert.fail('no POST'),
  update: async () => assert.fail('no PATCH'),
  delete: async () => assert.fail('no DELETE'),
  removeFields: async () => assert.fail('no field removal'),
});
/**
 * Save a raw read the way retrieve does and load it the way deploy does.
 * @param {object} raw Direct native read.
 * @returns {Promise<object>} Portable document as read from the project file.
 */
const roundTrip = async (raw) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dmo-standard-round-trip-'));
  await writeNativeDmoDocument(normalizeNativeDmo(raw), cwd, false);
  const [input] = await readDeployInputs({ cwd, metadata: [`dmo:${apiName}`] });
  return input.document;
};

test('write scope classifies custom, standard and every other DMO read', () => {
  const custom = { name: 'Example__dlm', creationType: 'Custom', fields: [] };
  assert.equal(nativeDmoWriteScope(custom), 'custom');
  assert.equal(nativeDmoWriteScope(native()), 'standard');
  assert.equal(nativeDmoWriteScope({ ...custom, creationType: 'Standard' }), 'standard');
  for (const raw of [
    { ...custom, name: 'ssot__Example__dlm' },
    { ...custom, creationType: undefined },
    { ...custom, name: undefined },
    ...['Adg', 'Bridge', 'Derived', 'Segment_Membership', 'System', 'standard', ''].map(
      (creationType) => ({ ...native(), creationType }),
    ),
  ])
    assert.equal(nativeDmoWriteScope(raw), 'refused', JSON.stringify(raw.creationType));
  assert.equal(isCustomNativeDmo(custom), true);
  assert.equal(isCustomNativeDmo(native()), false);
});

test('standard DMO: adding a custom field sends only that field and confirms it by readback', async () => {
  const saved = document([]);
  saved.spec.fields.push(authored('CliProbeB1__c'));
  const body = {
    fields: [{ name: 'CliProbeB1', label: 'CliProbeB1', dataType: 'Text', isPrimaryKey: false }],
  };
  assert.deepEqual(await preflightNativeDmo(saved, readOnly(native([]))), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    body,
    standard: true,
  });
  // An explicit data space is the only other key of the body.
  const scoped = await preflightNativeDmo(saved, readOnly(native([])), 'default');
  assert.deepEqual(scoped.body, { dataSpaceName: 'default', ...body });
  const { calls, client } = recording(native([]));
  const result = await deployNativeDmo(saved, client, undefined, fast);
  assert.equal(result.operation, 'update');
  assert.deepEqual(calls, [
    ['get', apiName],
    ['update', apiName, body],
    ['get', apiName],
  ]);
  assert.equal(
    result.document.spec.fields.find((entry) => entry.name === 'CliProbeB1__c').creationType,
    'Custom',
  );
  // A file that lists only the new custom field is enough.
  const minimal = document([]);
  minimal.spec.fields = [authored('CliProbeB1__c')];
  const minimalPlan = await preflightNativeDmo(minimal, readOnly(native([])));
  assert.deepEqual(minimalPlan.body, body);
  // The single PATCH is never repeated when the field does not appear.
  let patches = 0;
  await assert.rejects(
    deployNativeDmo(
      saved,
      {
        get: async () => native([]),
        update: async () => {
          patches++;
          return native([]);
        },
      },
      undefined,
      fast,
    ),
    /DMO_PERSISTENCE_UNCONFIRMED/,
  );
  assert.equal(patches, 1);
});

test('standard DMO: relabelling a custom field sends that field; immutable edits stay refused', async () => {
  const saved = document();
  saved.spec.fields.find((entry) => entry.name === 'CliProbeB1__c').label = 'Renamed';
  const { calls, client } = recording();
  const result = await deployNativeDmo(saved, client, undefined, fast);
  assert.equal(result.operation, 'update');
  assert.deepEqual(writes(calls), [
    [
      'update',
      apiName,
      { fields: [{ name: 'CliProbeB1', label: 'Renamed', dataType: 'Text', isPrimaryKey: false }] },
    ],
  ]);
  for (const mutate of [
    (entry) => {
      entry.dataType = 'Number';
    },
    (entry) => {
      entry.isPrimaryKey = true;
    },
    (entry) => {
      entry.creationType = 'Standard';
    },
  ]) {
    const changed = document();
    mutate(changed.spec.fields.find((entry) => entry.name === 'CliProbeB1__c'));
    await assert.rejects(
      deployNativeDmo(changed, readOnly(native()), undefined, fast),
      /UNSUPPORTED_DMO_FIELD_CHANGE/,
    );
  }
});

test('standard DMO: a custom field missing from the file is removed only with the flag, after the PATCH', async () => {
  const saved = document(['Keep__c']);
  await assert.rejects(
    preflightNativeDmo(saved, readOnly(twoCustom())),
    (error) =>
      error.code === 'UNSUPPORTED_DMO_FIELD_CHANGE' &&
      error.message.includes('--allow-field-removal') &&
      error.message.includes('fields.CliProbeB1__c'),
  );
  assert.deepEqual(await preflightNativeDmo(saved, readOnly(twoCustom()), undefined, allow), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    removeFields: ['CliProbeB1__c'],
    standard: true,
  });
  // Removal only: no PATCH, one destructive change, absence read back.
  const only = recording(twoCustom());
  const removed = await deployNativeDmo(saved, only.client, undefined, fast, allow);
  assert.deepEqual(removed.removedFields, ['CliProbeB1__c']);
  assert.deepEqual(only.calls, [
    ['get', apiName],
    ['remove', apiName, ['CliProbeB1__c']],
    ['get', apiName],
  ]);
  // With a label change the PATCH goes first and carries no field.
  const relabelled = document(['Keep__c']);
  relabelled.spec.label = 'Changed';
  const both = recording(twoCustom());
  const result = await deployNativeDmo(relabelled, both.client, undefined, fast, allow);
  assert.deepEqual(writes(both.calls), [
    ['update', apiName, { label: 'Changed' }],
    ['remove', apiName, ['CliProbeB1__c']],
  ]);
  assert.equal(result.document.spec.label, 'Changed');
  assert.ok(!result.document.spec.fields.some((entry) => entry.name === 'CliProbeB1__c'));
  // The standard key, standard fields and system fields are never planned for removal.
  const customOnly = document(['Keep__c']);
  customOnly.spec.fields = customOnly.spec.fields.filter((entry) => entry.name === 'Keep__c');
  const plan = await preflightNativeDmo(customOnly, readOnly(twoCustom()), undefined, allow);
  assert.deepEqual(plan.removeFields, ['CliProbeB1__c']);
  // A lingering field is reported and the removal is not sent twice.
  let removals = 0;
  await assert.rejects(
    deployNativeDmo(
      saved,
      {
        get: async () => twoCustom(),
        removeFields: async () => {
          removals++;
        },
      },
      undefined,
      fast,
      allow,
    ),
    /DMO_PERSISTENCE_UNCONFIRMED/,
  );
  assert.equal(removals, 1);
  // Without a Metadata route nothing is written.
  const noRoute = recording(twoCustom()).client;
  delete noRoute.removeFields;
  await assert.rejects(
    deployNativeDmo(relabelled, noRoute, undefined, fast, allow),
    /DMO_FIELD_REMOVAL_UNAVAILABLE/,
  );
});

const mapped = () => {
  const raw = activated();
  raw.fields.find((entry) => entry.name === 'CliProbeB1__c').isMapped = true;
  return raw;
};
test('standard DMO: a mapped custom field follows the mapped-field and combined-removal rules', async () => {
  const saved = document([]);
  // Not covered by a selected mapping file: refused before any write.
  await assert.rejects(
    deployNativeDmo(saved, readOnly(mapped()), undefined, fast, allow),
    /DMO_FIELD_REMOVAL_MAPPED/,
  );
  await assert.rejects(
    deployNativeDmo(saved, readOnly(mapped()), undefined, fast, {
      ...allow,
      coveredMappedFields: ['Other__c'],
    }),
    /DMO_FIELD_REMOVAL_MAPPED/,
  );
  // Covered: the label PATCH, then the one checked removal that reports the dropped pair.
  const pair = {
    mapping: 'Src_map_Standard',
    sourceFieldDeveloperName: 'Probe__c',
    targetFieldDeveloperName: 'CliProbeB1__c',
  };
  const relabelled = document([]);
  relabelled.spec.label = 'Changed';
  const { calls, client } = recording(mapped());
  const checked = [];
  const result = await deployNativeDmo(relabelled, client, undefined, fast, {
    ...allow,
    coveredMappedFields: ['CliProbeB1__c'],
    removeChecked: async (target, fields, remove) => {
      checked.push([target, fields]);
      await remove();
      return [pair];
    },
  });
  assert.deepEqual(checked, [[apiName, ['CliProbeB1__c']]]);
  assert.deepEqual(result.removedFields, ['CliProbeB1__c']);
  assert.deepEqual(result.droppedPairs, [pair]);
  assert.deepEqual(writes(calls), [
    ['update', apiName, { label: 'Changed' }],
    ['remove', apiName, ['CliProbeB1__c']],
  ]);
});

test('standard DMO: a label change sends the label alone', async () => {
  const saved = document();
  saved.spec.label = 'Changed';
  assert.deepEqual(await preflightNativeDmo(saved, readOnly(native())), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    body: { label: 'Changed' },
    standard: true,
  });
  const { calls, client } = recording();
  const result = await deployNativeDmo(saved, client, undefined, fast);
  assert.equal(result.document.spec.label, 'Changed');
  assert.deepEqual(writes(calls), [['update', apiName, { label: 'Changed' }]]);
});

test('standard DMO: description is unmanaged when absent, set or cleared when authored', async () => {
  const described = () => ({ ...native(), description: 'Existing' });
  assert.equal(await planOperation(document(), readOnly(described())), 'unchanged');
  const same = document();
  same.spec.description = 'Existing';
  assert.equal(await planOperation(same, readOnly(described())), 'unchanged');
  const set = document();
  set.spec.description = 'New text';
  const setRun = recording();
  const setResult = await deployNativeDmo(set, setRun.client, undefined, fast);
  assert.equal(setResult.operation, 'update');
  assert.deepEqual(writes(setRun.calls), [['update', apiName, { description: 'New text' }]]);
  const cleared = document();
  cleared.spec.description = '';
  const plan = await preflightNativeDmo(cleared, readOnly(described()));
  assert.deepEqual(plan.body, { description: '' });
  assert.equal(await planOperation(cleared, readOnly(native())), 'unchanged');
  // A cleared description confirms against a read that no longer returns one.
  let reads = 0;
  const result = await deployNativeDmo(
    cleared,
    { get: async () => (++reads === 1 ? described() : native()), update: async () => described() },
    undefined,
    fast,
  );
  assert.equal(result.operation, 'update');
});

test('standard DMO: a changed standard or system field is refused before any write, naming field and property', async () => {
  for (const [name, property, value] of [
    ['ssot__Name__c', 'label', 'Renamed'],
    ['ssot__Name__c', 'dataType', 'Number'],
    ['ssot__Name__c', 'creationType', 'Custom'],
    ['ssot__Name__c', 'usageTag', 'Other'],
    ['ssot__Name__c', 'length', 80],
    ['ssot__Id__c', 'isPrimaryKey', false],
    ['DataSource__c', 'label', 'Renamed'],
  ]) {
    const saved = document();
    // The refusal does not depend on a valid change elsewhere in the file.
    saved.spec.label = 'Changed';
    saved.spec.fields.find((entry) => entry.name === name)[property] = value;
    await assert.rejects(
      deployNativeDmo(saved, readOnly(native()), undefined, fast, allow),
      (error) => {
        assert.ok(error instanceof NativeDmoError);
        assert.equal(error.code, 'UNSUPPORTED_DMO_FIELD_CHANGE');
        assert.ok(error.message.includes(`fields.${name}.${property}`), error.message);
        return true;
      },
    );
  }
  // Keys the API does not return, and read-only keys left out of the file, are not comparable.
  const bare = document();
  for (const entry of bare.spec.fields) {
    for (const key of ['creationType', 'isDistinct', 'usageTag']) delete entry[key];
    entry.description = 'Not returned by reads';
  }
  assert.equal(await planOperation(bare, readOnly(native())), 'unchanged');
});

test('standard DMO: standard and system fields may be absent from the file', async () => {
  for (const options of [undefined, allow]) {
    const saved = document();
    saved.spec.fields = saved.spec.fields.filter((entry) => entry.name === 'CliProbeB1__c');
    const plan = await preflightNativeDmo(saved, readOnly(native()), undefined, options);
    assert.equal(plan.operation, 'unchanged');
    const result = await deployNativeDmo(saved, readOnly(native()), undefined, fast, options);
    assert.equal(result.operation, 'unchanged');
  }
});

test('standard DMO: a new field that is not a plain custom field is refused before any write', async () => {
  for (const added of [
    authored('ssot__New__c'),
    authored('ns__New__c'),
    { ...authored('Other__c'), creationType: 'Standard' },
    { ...authored('Other__c'), creationType: 'System' },
    authored('KQ_New__c'),
    { ...authored('Other__c'), isPrimaryKey: true },
  ]) {
    const saved = document();
    saved.spec.fields.push(added);
    await assert.rejects(
      deployNativeDmo(saved, readOnly(native()), undefined, fast, allow),
      (error) => error instanceof NativeDmoError && error.code === 'UNSUPPORTED_DMO_FIELD_ADDITION',
      added.name,
    );
  }
  const named = document();
  named.spec.fields.push(authored('ssot__New__c'));
  await assert.rejects(preflightNativeDmo(named, readOnly(native())), /fields\.ssot__New__c/u);
});

test('standard DMO: a category difference is neither sent nor refused nor required at readback', async () => {
  const saved = document();
  saved.spec.category = 'Profile';
  assert.equal(await planOperation(saved, readOnly(native())), 'unchanged');
  saved.spec.label = 'Changed';
  const { calls, client } = recording();
  const result = await deployNativeDmo(saved, client, undefined, fast);
  assert.equal(result.operation, 'update');
  assert.deepEqual(writes(calls), [['update', apiName, { label: 'Changed' }]]);
  assert.equal(result.document.spec.category, 'Unassigned');
  // The custom-DMO comparison still requires the category.
  const actual = normalizeNativeDmo({ ...native(), label: 'Changed' });
  assert.equal(nativeDmoConfirmed(saved, actual, [], true), true);
  assert.equal(nativeDmoConfirmed(saved, actual), false);
});

test('standard DMO: a retrieved file deploys back unchanged, across the differences its first mapping causes', async () => {
  for (const [source, target] of [
    [native(), native()],
    [activated(), activated()],
    [activated(), native()],
    [native(), activated()],
  ]) {
    const saved = await roundTrip(source);
    assert.ok(!saved.spec.fields.some((entry) => entry.name === 'KQ_Id__c'));
    const calls = [];
    const client = {
      ...readOnly(target),
      get: async (name) => {
        calls.push(['get', name]);
        return structuredClone(target);
      },
    };
    for (const options of [undefined, allow]) {
      const plan = await preflightNativeDmo(saved, client, 'default', options);
      assert.equal(plan.operation, 'unchanged');
      const result = await deployNativeDmo(saved, client, 'default', fast, options);
      assert.equal(result.operation, 'unchanged');
    }
    assert.ok(calls.every(([method]) => method === 'get'));
  }
  // The same differences do not disturb the confirmation of a real change.
  const saved = structuredClone(await roundTrip(activated()));
  saved.spec.label = 'Changed';
  const { calls, client } = recording(native());
  const result = await deployNativeDmo(saved, client, undefined, fast);
  assert.equal(result.operation, 'update');
  assert.deepEqual(writes(calls), [['update', apiName, { label: 'Changed' }]]);
});

test('standard DMO: deleting the object and its delete preview stay refused; reads stay possible', async () => {
  for (const raw of [native(), activated()]) {
    await assert.rejects(
      deleteNativeDmo(apiName, readOnly(raw)),
      (error) => error instanceof NativeDmoError && error.code === 'UNSUPPORTED_DMO_TARGET',
    );
    await assert.rejects(previewDeleteNativeDmo(apiName, readOnly(raw)), /UNSUPPORTED_DMO_TARGET/);
    const retrieved = await retrieveNativeDmo(apiName, readOnly(raw));
    assert.equal(retrieved.identity.apiName, apiName);
    const admitted = await previewFieldDeleteNativeDmo(apiName, readOnly(raw));
    assert.equal(admitted.scope, 'standard');
  }
  // A custom creationType under a namespaced name stays refused for a field delete as well.
  const namespaced = { ...native(), creationType: 'Custom' };
  await assert.rejects(
    previewFieldDeleteNativeDmo(apiName, readOnly(namespaced)),
    /UNSUPPORTED_DMO_TARGET/,
  );
  await assert.rejects(
    deployNativeDmo(document(), readOnly(namespaced), undefined, fast),
    /UNSUPPORTED_DMO_TARGET/,
  );
  // A standard DMO is never created either.
  await assert.rejects(
    deployNativeDmo(document(), {
      get: async () => {
        throw new NativeDmoError('DMO_HTTP_ERROR', 404);
      },
      create: async () => assert.fail('no POST'),
    }),
    /UNSUPPORTED_DMO_TARGET/,
  );
});

test('generated DMOs and reads without a creationType are refused for every write, delete and field delete', async () => {
  for (const creationType of ['Adg', 'Bridge', 'Derived', 'Segment_Membership', undefined]) {
    for (const name of [apiName, 'Example__dlm']) {
      const raw = { ...native(), name, creationType };
      const saved = normalizeNativeDmo(raw);
      saved.spec.label = 'Changed';
      saved.spec.fields.push(authored('New__c'));
      await assert.rejects(
        preflightNativeDmo(saved, readOnly(raw), undefined, allow),
        refusedTarget,
      );
      await assert.rejects(
        deployNativeDmo(saved, readOnly(raw), undefined, fast, allow),
        refusedTarget,
      );
      await assert.rejects(deleteNativeDmo(name, readOnly(raw)), refusedTarget);
      await assert.rejects(previewDeleteNativeDmo(name, readOnly(raw)), refusedTarget);
      await assert.rejects(previewFieldDeleteNativeDmo(name, readOnly(raw)), refusedTarget);
      const retrieved = await retrieveNativeDmo(name, readOnly(raw));
      assert.equal(retrieved.identity.apiName, name);
    }
  }
});

/**
 * Run the public deploy command on a project holding the standard DMO file, with the real DMO
 * services and a synthetic DMO client. With `segment` the batch takes the mixed-family route.
 * @param {object} saved Portable DMO document written to the project.
 * @param {object} client Synthetic DMO client.
 * @param {{preview?: boolean, segment?: boolean}} [mode] Preview and route.
 * @returns {Promise<object>} Command envelope.
 */
const command = async (saved, client, mode = {}) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dmo-standard-command-'));
  await writeNativeDmoDocument(saved, cwd, false);
  if (mode.segment)
    await writeSegmentDocument(
      {
        schemaVersion: 1,
        kind: 'segment',
        identity: { dataSpace: 'default', apiName: 'Audience' },
        spec: {
          displayName: 'Audience',
          description: '',
          segmentType: 'DBT',
          segmentOn: { kind: 'dmo', dataSpace: 'default', apiName },
          models: [
            { name: 'Audience', sql: `SELECT ${apiName}.ssot__Id__c FROM ${apiName} WHERE 1 = 0` },
          ],
          dependencies: [{ kind: 'dmo', dataSpace: 'default', apiName, fields: ['ssot__Id__c'] }],
          publishInterval: 'NO_REFRESH',
          lookbackPeriod: 'P90D',
        },
      },
      cwd,
      false,
    );
  const deploy = Object.create(Deploy.prototype);
  deploy.parse = async () => ({
    flags: {
      'api-version': 'auto',
      preview: mode.preview === true,
      'allow-processing': true,
      metadata: [...(mode.segment ? ['segment:Audience'] : []), `dmo:${apiName}`],
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'target',
        getConnection: () => ({ getUsername: () => 'target' }),
      },
    },
  });
  deploy.jsonEnabled = () => true;
  // Object.create skips class field initializers; restore the real local readers.
  deploy.resolveInputs = readDeployInputs;
  deploy.captureInput = captureDeployInputDigest;
  deploy.verifySegmentInput = verifySegmentInputDigest;
  deploy.createDmoClient = () => client;
  deploy.preflightSegment = async () => ({
    outcome: 'unchanged',
    requiredEffects: [],
    target: 'existing',
    absenceProof: 'none',
    diagnostics: [],
  });
  deploy.executeSegment = async () => ({
    family: 'segment',
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  const previousCwd = process.cwd();
  const previousExit = process.exitCode;
  process.chdir(cwd);
  try {
    return await deploy.run();
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
};

for (const segment of [false, true])
  test(`public deploy writes a standard DMO within its scope on the ${segment ? 'mixed-family' : 'all-native'} route`, async () => {
    const saved = document([]);
    saved.spec.fields.push(authored('CliProbeB1__c'));
    const item = (result) =>
      result.result.items.find((entry) => entry.identity.apiName === apiName);
    const preview = recording(native([]));
    const planned = await command(saved, preview.client, { preview: true, segment });
    assert.equal(planned.status, 'success', JSON.stringify(planned));
    assert.equal(item(planned).outcome, 'update');
    assert.deepEqual(writes(preview.calls), []);
    const run = recording(native([]));
    const executed = await command(saved, run.client, { segment });
    assert.equal(executed.status, 'success', JSON.stringify(executed));
    assert.equal(item(executed).outcome, 'updated');
    assert.equal(item(executed).mutation, 'confirmed-updated');
    assert.deepEqual(writes(run.calls), [
      [
        'update',
        apiName,
        {
          fields: [
            { name: 'CliProbeB1', label: 'CliProbeB1', dataType: 'Text', isPrimaryKey: false },
          ],
        },
      ],
    ]);
    // A changed standard field and a generated target block the item before any write.
    const changed = document();
    changed.spec.fields.find((entry) => entry.name === 'ssot__Name__c').label = 'Renamed';
    for (const [file, raw, code] of [
      [changed, native(), 'UNSUPPORTED_DMO_FIELD_CHANGE'],
      [saved, { ...native([]), creationType: 'Adg' }, 'UNSUPPORTED_DMO_TARGET'],
    ]) {
      const refused = recording(raw);
      const blocked = await command(file, refused.client, { segment });
      assert.notEqual(blocked.status, 'success');
      assert.ok(JSON.stringify(item(blocked)).includes(code), JSON.stringify(item(blocked)));
      assert.deepEqual(writes(refused.calls), []);
    }
  });
