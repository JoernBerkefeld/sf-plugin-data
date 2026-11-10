import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { NativeDmoError, normalizeNativeDmo } from '../lib/artifacts/native-dmo-document.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { deployNativeDmo, preflightNativeDmo } from '../lib/services/native-dmo.js';
import { executeDmo, preflightDmo } from '../lib/services/command-native-dmo.js';

const apiName = 'Example__dlm';
const allow = { allowFieldRemoval: true };
const fast = { attempts: 3, delayMs: 0, sleep: async () => {} };
const field = (name, primary = false, creationType = 'Custom') => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: primary,
  creationType,
});
/**
 * Synthetic custom DMO read: a key, two custom fields and the generated fields.
 * @param {string[]} [without] Custom field names already removed from the target.
 * @returns {object} Direct native read.
 */
const native = (without = []) => ({
  name: apiName,
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  fields: [
    { ...field('Id__c', true), keyQualifierName: 'KQ_Id' },
    field('Note__c'),
    field('Link__c'),
    field('DataSource__c', false, 'System'),
    field('KQ_Id__c', false, 'System'),
  ].filter((entry) => !without.includes(entry.name)),
});
/**
 * Authored definition: the target without the named fields.
 * @param {string[]} [without] Field names left out of the file.
 * @returns {object} Portable document.
 */
const authored = (without = []) => normalizeNativeDmo(native(without));

/**
 * Recording client whose reads follow the writes it has seen.
 * @param {object} [overrides] Method overrides.
 * @returns {{calls: Array<unknown[]>, client: object}} Ordered calls and the client.
 */
const recording = (overrides = {}) => {
  const calls = [];
  const state = { label: 'Example', removed: [] };
  const read = () => ({ ...native(state.removed), label: state.label });
  const client = {
    get: async (name) => {
      calls.push(['get', name]);
      return read();
    },
    create: async () => assert.fail('no POST'),
    update: async (name, body) => {
      calls.push(['update', name, body]);
      state.label = body.label;
      return read();
    },
    delete: async () => assert.fail('no DELETE'),
    removeFields: async (name, names) => {
      calls.push(['remove', name, names]);
      state.removed = names;
    },
    ...overrides,
  };
  return { calls, client };
};
const get = async () => native();
/**
 * The same target with every non-qualifier field mapped.
 * @returns {object} Direct native read carrying the mapped marker.
 */
const mapped = () => {
  const raw = native();
  for (const entry of raw.fields) if (entry.name !== 'KQ_Id__c') entry.isMapped = true;
  return raw;
};
/**
 * Synthetic failed Metadata deployment receipt.
 * @param {unknown} componentFailures Failure entries as the CLI reports them.
 * @returns {{exitCode: number, stdout: string}} Runner receipt.
 */
const failure = (componentFailures) => ({
  exitCode: 1,
  stdout: JSON.stringify({
    status: 1,
    result: { success: false, status: 'Failed', details: { componentFailures } },
  }),
});
const writes = (calls) => calls.filter(([method]) => method !== 'get').map(([method]) => method);

test('a custom field missing from the file is refused without the flag and planned with it', async () => {
  await assert.rejects(
    preflightNativeDmo(authored(['Note__c']), { get }),
    (error) =>
      error instanceof NativeDmoError &&
      error.code === 'UNSUPPORTED_DMO_FIELD_CHANGE' &&
      error.message.includes('--allow-field-removal') &&
      error.message.includes('fields.Note__c'),
  );
  await assert.rejects(
    preflightNativeDmo(authored(['Note__c']), { get }, undefined, { allowFieldRemoval: false }),
    /UNSUPPORTED_DMO_FIELD_CHANGE/,
  );
  // Removal only: no PATCH body is planned.
  assert.deepEqual(
    await preflightNativeDmo(authored(['Note__c', 'Link__c']), { get }, undefined, allow),
    {
      operation: 'update',
      apiName,
      targetApiName: apiName,
      removeFields: ['Note__c', 'Link__c'],
    },
  );
  const relabelled = authored(['Link__c']);
  relabelled.spec.label = 'Changed';
  assert.deepEqual(await preflightNativeDmo(relabelled, { get }, undefined, allow), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    body: { label: 'Changed' },
    removeFields: ['Link__c'],
  });
  // The flag changes nothing when no custom field is missing.
  const same = await preflightNativeDmo(authored(), { get }, undefined, allow);
  assert.equal(same.operation, 'unchanged');
});

test('the primary key and generated fields are never planned for removal', async () => {
  for (const options of [undefined, allow])
    await assert.rejects(
      preflightNativeDmo(authored(['Id__c']), { get }, undefined, options),
      (error) =>
        error.code === 'UNSUPPORTED_DMO_FIELD_CHANGE' &&
        error.message.includes('primary-key field is never removed'),
    );
  // A missing key blocks even when other removable fields are missing too.
  await assert.rejects(
    preflightNativeDmo(authored(['Id__c', 'Note__c']), { get }, undefined, allow),
    /UNSUPPORTED_DMO_FIELD_CHANGE/,
  );
  const withoutGenerated = await preflightNativeDmo(
    authored(['DataSource__c', 'KQ_Id__c']),
    { get },
    undefined,
    allow,
  );
  assert.equal(withoutGenerated.operation, 'unchanged');
  const mixed = await preflightNativeDmo(
    authored(['DataSource__c', 'Note__c']),
    { get },
    undefined,
    allow,
  );
  assert.deepEqual(mixed.removeFields, ['Note__c']);
});

test('a mapped field is never removed, and the mapped marker is not treated as a definition change', async () => {
  // Removal of a mapped field is refused before any write, even with the flag.
  let writesSeen = 0;
  await assert.rejects(
    deployNativeDmo(
      authored(['Link__c']),
      {
        get: async () => mapped(),
        update: async () => {
          writesSeen++;
        },
        removeFields: async () => {
          writesSeen++;
        },
      },
      undefined,
      fast,
      { allowFieldRemoval: true },
    ),
    (error) => {
      assert.equal(error.code, 'DMO_FIELD_REMOVAL_MAPPED');
      assert.match(error.message, /Remove its pair from the mapping first/u);
      return true;
    },
  );
  assert.equal(writesSeen, 0);
  // A file retrieved from an unmapped copy deploys unchanged onto a mapped target and back.
  const unmappedFile = await preflightNativeDmo(authored(), { get: async () => mapped() });
  assert.equal(unmappedFile.operation, 'unchanged');
  const mappedFile = await preflightNativeDmo(normalizeNativeDmo(mapped()), { get });
  assert.equal(mappedFile.operation, 'unchanged');
  // The marker is never sent, on create or in a field edit.
  const created = await preflightNativeDmo(normalizeNativeDmo(mapped()), {
    get: async () => {
      throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    },
  });
  assert.ok(created.body.fields.every((entry) => !('isMapped' in entry)));
  const relabelled = normalizeNativeDmo(mapped());
  relabelled.spec.fields.find((entry) => entry.name === 'Note__c').label = 'Renamed';
  const edit = await preflightNativeDmo(relabelled, { get });
  assert.deepEqual(edit.body.fields, [
    { name: 'Note', label: 'Renamed', dataType: 'Text', isPrimaryKey: false },
  ]);
});

test('the custom-only target guard applies before any planned removal', async () => {
  for (const raw of [
    { ...native(), creationType: 'Standard' },
    { ...native(), name: 'ssot__Example__dlm' },
  ]) {
    const saved = authored(['Note__c']);
    saved.identity.apiName = raw.name;
    const { calls, client } = recording({ get: async () => raw });
    await assert.rejects(
      deployNativeDmo(saved, client, undefined, fast, allow),
      /UNSUPPORTED_DMO_TARGET/,
    );
    assert.deepEqual(calls, []);
  }
});

test('a removal-only deploy sends no PATCH, removes once and confirms absence by readback', async () => {
  let reads = 0;
  const { calls, client } = recording();
  const base = client.get;
  // The first read after the removal is stale; the write is not repeated.
  client.get = async (name) => {
    const current = await base(name);
    return ++reads === 2 ? native() : current;
  };
  const result = await deployNativeDmo(authored(['Note__c']), client, undefined, fast, allow);
  assert.equal(result.operation, 'update');
  assert.deepEqual(result.removedFields, ['Note__c']);
  assert.ok(!result.document.spec.fields.some((entry) => entry.name === 'Note__c'));
  assert.deepEqual(
    calls.map(([method]) => method),
    ['get', 'remove', 'get', 'get'],
  );
  assert.deepEqual(calls[1], ['remove', apiName, ['Note__c']]);
  // The same file against the changed target is unchanged and writes nothing.
  const before = calls.length;
  const repeat = await deployNativeDmo(authored(['Note__c']), client, undefined, fast, allow);
  assert.equal(repeat.operation, 'unchanged');
  assert.equal(repeat.removedFields, undefined);
  assert.deepEqual(writes(calls.slice(before)), []);
});

test('edits travel in one PATCH before the single removal, and readback checks both', async () => {
  const saved = authored(['Note__c', 'Link__c']);
  saved.spec.label = 'Changed';
  const { calls, client } = recording();
  const result = await deployNativeDmo(saved, client, undefined, fast, allow);
  assert.deepEqual(
    calls.map(([method]) => method),
    ['get', 'update', 'remove', 'get'],
  );
  assert.deepEqual(calls[1][2], { label: 'Changed' });
  assert.deepEqual(calls[2], ['remove', apiName, ['Note__c', 'Link__c']]);
  assert.equal(result.document.spec.label, 'Changed');
  assert.deepEqual(result.removedFields, ['Note__c', 'Link__c']);
  // A removed field alone does not confirm the deploy when the requested label is missing.
  const stale = recording({
    update: async (name, body) => {
      stale.calls.push(['update', name, body]);
      return native();
    },
  });
  await assert.rejects(
    deployNativeDmo(saved, stale.client, undefined, fast, allow),
    /DMO_PERSISTENCE_UNCONFIRMED/,
  );
  assert.deepEqual(writes(stale.calls), ['update', 'remove']);
});

test('a removed field that is still present fails readback without another write', async () => {
  const { calls, client } = recording({
    removeFields: async (name, names) => {
      calls.push(['remove', name, names]);
    },
  });
  await assert.rejects(
    deployNativeDmo(authored(['Note__c']), client, undefined, fast, allow),
    (error) =>
      error.code === 'DMO_PERSISTENCE_UNCONFIRMED' &&
      error.message.includes('post-removal field absence readback') &&
      error.message.includes('fields.Note__c'),
  );
  assert.deepEqual(
    calls.map(([method]) => method),
    ['get', 'remove', 'get', 'get', 'get'],
  );
});

test('a client without a removal route blocks before any write', async () => {
  const saved = authored(['Note__c']);
  saved.spec.label = 'Changed';
  const { calls, client } = recording({ removeFields: undefined });
  await assert.rejects(
    deployNativeDmo(saved, client, undefined, fast, allow),
    /DMO_FIELD_REMOVAL_UNAVAILABLE/,
  );
  assert.deepEqual(writes(calls), []);
  const outcome = await executeDmo(saved, client, undefined, allow);
  assert.equal(outcome.outcome, 'blocked');
  assert.equal(outcome.mutation, 'not-attempted');
  assert.equal(outcome.diagnostics[0].code, 'DMO_FIELD_REMOVAL_UNAVAILABLE');
  assert.deepEqual(writes(calls), []);
});

test('DMO wrappers expose planned and executed removals', async () => {
  const { calls, client } = recording();
  assert.deepEqual(await preflightDmo(authored(['Note__c']), client, undefined, allow), {
    family: 'dmo',
    outcome: 'update',
    target: 'existing',
    absenceProof: 'none',
    removeFields: ['Note__c'],
    diagnostics: [
      {
        code: 'DMO_FIELD_REMOVAL_PLANNED',
        message:
          'Fields missing from the file are removed with one Metadata API destructive change: Note__c.',
      },
    ],
  });
  assert.deepEqual(writes(calls), []);
  // Without the flag the wrapper refuses and the executor reports a blocked, unwritten item.
  await assert.rejects(preflightDmo(authored(['Note__c']), client), /UNSUPPORTED_DMO_FIELD_CHANGE/);
  const blocked = await executeDmo(authored(['Note__c']), client);
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.mutation, 'not-attempted');
  assert.equal(blocked.diagnostics[0].code, 'UNSUPPORTED_DMO_FIELD_CHANGE');
  assert.match(blocked.diagnostics[0].message, /--allow-field-removal/u);
  assert.deepEqual(writes(calls), []);
  // The executor awaits readback; the injected client confirms on the first read.
  assert.deepEqual(await executeDmo(authored(['Note__c']), client, undefined, allow), {
    outcome: 'updated',
    mutation: 'confirmed-updated',
    removedFields: ['Note__c'],
    diagnostics: [],
  });
  assert.deepEqual(writes(calls), ['remove']);
  assert.deepEqual(await executeDmo(authored(['Note__c']), client, undefined, allow), {
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  assert.deepEqual(writes(calls), ['remove']);
});

const deployed = (members, overrides = {}) => ({
  exitCode: 0,
  stdout: JSON.stringify({
    status: 0,
    result: {
      success: true,
      status: 'Succeeded',
      details: {
        componentSuccesses: [
          { fullName: 'destructiveChanges.xml', componentType: '', deleted: false },
          ...members.map((fullName) => ({ fullName, componentType: 'CustomField', deleted: true })),
        ],
      },
      ...overrides,
    },
  }),
});

test('field removal transport sends one argument-array Metadata destructive deployment', async () => {
  const runs = [];
  const client = createDmoClient('target', '68.0', async (arguments_, cwd) => {
    runs.push({ arguments_, cwd });
    return deployed([`${apiName}.Note__c`, `${apiName}.Link__c`]);
  });
  await client.removeFields(apiName, ['Note__c', 'Link__c']);
  assert.equal(runs.length, 1);
  const [{ arguments_, cwd }] = runs;
  assert.ok(cwd.toLowerCase().startsWith(String.raw`f:\temp\data360-dmo-field-removal-`));
  assert.deepEqual(arguments_, [
    'project',
    'deploy',
    'start',
    '--metadata-dir',
    cwd,
    '--target-org',
    'target',
    '--wait',
    '10',
    '--json',
  ]);
  // The scratch directory is retained and holds exactly the two manifests.
  const retained = await readdir(cwd);
  assert.deepEqual(retained.toSorted(), ['destructiveChanges.xml', 'package.xml']);
  assert.equal(
    await readFile(path.join(cwd, 'package.xml'), 'utf8'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
      '    <version>68.0</version>',
      '</Package>',
      '',
    ].join('\n'),
  );
  assert.equal(
    await readFile(path.join(cwd, 'destructiveChanges.xml'), 'utf8'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
      '    <types>',
      '        <members>Example__dlm.Note__c</members>',
      '        <members>Example__dlm.Link__c</members>',
      '        <name>CustomField</name>',
      '    </types>',
      '    <version>68.0</version>',
      '</Package>',
      '',
    ].join('\n'),
  );
  // The manifest version follows the client's native API version.
  const pinned = [];
  await createDmoClient('target', '65.0', async (_arguments, root) => {
    pinned.push(root);
    return deployed([`${apiName}.Note__c`]);
  }).removeFields(apiName, ['Note__c']);
  assert.match(
    await readFile(path.join(pinned[0], 'destructiveChanges.xml'), 'utf8'),
    /<version>65\.0<\/version>/u,
  );
});

test('field removal transport rejects invalid names before any file or CLI call', async () => {
  let runs = 0;
  const client = createDmoClient('target', '68.0', async () => {
    runs++;
    return deployed([]);
  });
  for (const [target, names] of [
    ['Example', ['Note__c']],
    ['../Example__dlm', ['Note__c']],
    ['Example__dlm</members>', ['Note__c']],
    [apiName, []],
    [apiName, ['Note']],
    [apiName, ['Note__c', 'Note__c']],
    [apiName, ['Note__c</members><members>Other__dlm.Id__c']],
    [apiName, ['Note__c', '*']],
    [apiName, ['Example__dlm.Note__c']],
    [apiName, [5]],
  ])
    await assert.rejects(
      client.removeFields(target, names),
      (error) => error instanceof NativeDmoError && /INVALID_DMO_(NAME|FIELD)/u.test(error.code),
    );
  assert.equal(runs, 0);
});

test('an unconfirmed removal fails with DMO_FIELD_REMOVAL_FAILED, safe problem text and no retry', async () => {
  const problem =
    'This custom field is referenced elsewhere in Salesforce. Remove the usage and try again.';
  const member = `${apiName}.Note__c`;
  for (const [receipt, expected] of [
    [failure([{ fullName: member, componentType: 'CustomField', problem }]), problem],
    // A single failure may arrive as an object instead of an array.
    [failure({ fullName: member, problem }), problem],
    // Text that fails the display filter is never echoed.
    [failure([{ fullName: member, problem: 'Value "secret" at <tag>' }]), 'no problem text'],
    // Reported success that does not list every member as deleted confirms nothing.
    [deployed([`${apiName}.Other__c`]), 'no problem text'],
    [deployed([member].map((name) => name.toLowerCase())), 'no problem text'],
    [deployed([member], { status: 'SucceededPartial' }), 'no problem text'],
    [{ ...deployed([member]), exitCode: 1 }, 'no problem text'],
    [{ exitCode: 0, stdout: 'not JSON' }, 'no problem text'],
    [{ exitCode: 0, stdout: 'null' }, 'no problem text'],
  ]) {
    let runs = 0;
    const transport = createDmoClient('target', '68.0', async () => {
      runs++;
      return receipt;
    });
    await assert.rejects(
      transport.removeFields(apiName, ['Note__c']),
      (error) => error instanceof NativeDmoError && error.code === 'DMO_FIELD_REMOVAL_FAILED',
    );
    assert.equal(runs, 1);
    const { calls, client } = recording({ removeFields: transport.removeFields });
    const saved = authored(['Note__c']);
    saved.spec.label = 'Changed';
    const outcome = await executeDmo(saved, client, undefined, allow);
    assert.equal(outcome.outcome, 'failed');
    assert.equal(outcome.mutation, 'unknown');
    assert.equal(outcome.diagnostics.length, 1);
    assert.equal(outcome.diagnostics[0].code, 'DMO_FIELD_REMOVAL_FAILED');
    assert.ok(outcome.diagnostics[0].message.includes(expected), outcome.diagnostics[0].message);
    assert.ok(!outcome.diagnostics[0].message.includes('secret'));
    assert.ok(outcome.diagnostics[0].message.length < 1500);
    assert.match(outcome.diagnostics[0].message, /No automatic retry/u);
    // One PATCH, one removal attempt, and no readback after the failed removal.
    assert.equal(runs, 2);
    assert.deepEqual(
      calls.map(([method]) => method),
      ['get', 'update'],
    );
  }
});

test('problem texts are bounded to three safe entries', async () => {
  const transport = createDmoClient('target', '68.0', async () => ({
    exitCode: 1,
    stdout: JSON.stringify({
      status: 1,
      result: {
        success: false,
        status: 'Failed',
        details: {
          componentFailures: ['One', 'Two', 'Three', 'Four', 'Five'].map((word) => ({
            problem: `Field ${word} is still in use by a mapping.`,
          })),
        },
      },
    }),
  }));
  const { client } = recording({ removeFields: transport.removeFields });
  const outcome = await executeDmo(authored(['Note__c']), client, undefined, allow);
  const { message } = outcome.diagnostics[0];
  assert.ok(message.includes('Field Three is still in use by a mapping.'));
  assert.ok(!message.includes('Field Four'));
});
