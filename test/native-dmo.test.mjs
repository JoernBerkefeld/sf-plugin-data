import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import test from 'node:test';
import {
  NativeDmoError,
  nativeDmoName,
  normalizeNativeDmo,
  unwrapNativeDmo,
  validateNativeDmoDocument,
} from '../lib/artifacts/native-dmo-document.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import {
  deleteNativeDmo,
  previewDeleteNativeDmo,
  deployNativeDmo,
  preflightNativeDmo,
  retrieveNativeDmo,
} from '../lib/services/native-dmo.js';

const apiName = 'Example__dlm';
const resourceId = '0gjaj00000JWkxdAAD';
const field = (name, primary = false) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: primary,
});
const native = () => ({
  name: apiName,
  id: resourceId,
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  isEnabled: false,
  isEditable: true,
  hasExternalDataLakeObjectMappings: false,
  fields: [
    {
      ...field('Id__c', true),
      creationType: 'Custom',
      isDistinct: false,
      usageTag: 'None',
      keyQualifierName: 'KQ_Id',
    },
    { ...field('Note__c'), creationType: 'Custom', isDistinct: false, usageTag: 'None' },
    ...['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c', 'KQ_Id__c'].map(
      (name) => ({
        ...field(name),
        creationType: 'System',
        usageTag: name.startsWith('KQ_') ? 'KeyQualifier' : 'None',
      }),
    ),
  ],
});
const document = () => normalizeNativeDmo(native());
const authored = (name) => ({
  name,
  label: name.slice(0, -3),
  dataType: 'Text',
  isPrimaryKey: false,
});
const absent = async () => {
  throw new NativeDmoError('DMO_HTTP_ERROR', 404);
};
const http = (status, body) => ({
  exitCode: status >= 400 ? 1 : 0,
  stdout: `HTTP/1.1 ${status}\ncontent-type: application/json\nx-request-id: synthetic\n${body === undefined ? '' : JSON.stringify(body)}`,
});

const planOperation = async (...arguments_) => {
  const plan = await preflightNativeDmo(...arguments_);
  return plan.operation;
};
const planBody = async (...arguments_) => {
  const plan = await preflightNativeDmo(...arguments_);
  return plan.body;
};
const described = () => ({ ...native(), description: 'Existing' });
const getDescribed = async () => described();
// Readback spacing is injected so exhausted-readback cases do not wait.
const fast = { attempts: 3, delayMs: 0, sleep: async () => {} };

test('native DMO saves all six fields and their definitions, maps type/category and strips observations', () => {
  const raw = native();
  delete raw.fields[1].isPrimaryKey;
  raw.fields[1].id = 'source';
  raw.fields[1].recordID = 'source';
  raw.fields[1].description = 'Retain definition';
  raw.fields[1].length = 200;
  raw.fields[1].isEnabled = false;
  const saved = normalizeNativeDmo(raw);
  assert.equal(saved.spec.category, 'Other');
  assert.equal(saved.spec.fields.length, 6);
  assert.equal(saved.spec.fields[1].dataType, 'Text');
  assert.equal(saved.spec.fields[1].isPrimaryKey, false);
  assert.equal(saved.spec.fields[1].description, 'Retain definition');
  assert.equal(saved.spec.fields[1].length, 200);
  assert.equal(saved.spec.fields[1].type, undefined);
  assert.equal(saved.spec.fields[1].id, undefined);
  assert.equal(saved.spec.fields[1].recordID, undefined);
  assert.equal(saved.spec.fields[1].isEnabled, undefined);
  assert.deepEqual(Object.keys(saved), ['schemaVersion', 'kind', 'identity', 'spec']);
  assert.deepEqual(Object.keys(saved.spec), ['label', 'category', 'fields']);
  assert.equal(saved.spec.fields[0].keyQualifierName, 'KQ_Id');
  assert.ok(!saved.spec.fields.some((f) => f.name === 'cdp_sys_SourceVersion__c'));
  assert.deepEqual(unwrapNativeDmo(raw), raw);
  assert.throws(() => unwrapNativeDmo({ dataModelObjects: [raw] }), /RESPONSE/);
  assert.ok(nativeDmoName.test(apiName));
  assert.ok(!nativeDmoName.test('../Example__dlm'));
  assert.deepEqual(normalizeNativeDmo({ ...native(), category: 'Other' }), document());
});

test('DMO save/load omits only System nonprimary KQ_Id with six/seven raw fields', async () => {
  for (const added of [false, true]) {
    const raw = native();
    if (added) raw.fields.push(field('UpdateNote__c'));
    const before = structuredClone(raw);
    const normalized = normalizeNativeDmo(raw);
    const snapshot = structuredClone(normalized);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dmo-save-policy-'));
    const receipt = await writeNativeDmoDocument(normalized, cwd, false);
    const [input] = await readDeployInputs({ cwd, metadata: [`dmo:${apiName}`] });
    const saved = input.document;
    assert.equal(raw.fields.length, added ? 7 : 6);
    assert.equal(normalized.spec.fields.length, added ? 7 : 6);
    assert.equal(saved.spec.fields.length, added ? 6 : 5);
    assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), saved);
    assert.deepEqual(
      saved.spec.fields,
      snapshot.spec.fields.filter((f) => f.name !== 'KQ_Id__c'),
    );
    assert.equal(saved.spec.fields[0].keyQualifierName, 'KQ_Id');
    assert.deepEqual(raw, before);
    assert.deepEqual(normalized, snapshot);
    const create = await preflightNativeDmo(saved, { get: absent });
    assert.deepEqual(
      create.body.fields.map((f) => f.name),
      added ? ['Id', 'Note', 'UpdateNote'] : ['Id', 'Note'],
    );
    let reads = 0;
    let writes = 0;
    const result = await deployNativeDmo(saved, {
      get: async () => (++reads === 1 ? native() : raw),
      update: async (_name, body) => {
        writes++;
        assert.equal(body.fields?.length ?? 0, added ? 1 : 0);
        return native();
      },
    });
    assert.equal(reads, added ? 2 : 1);
    assert.equal(writes, added ? 1 : 0);
    assert.equal(result.operation, added ? 'update' : 'unchanged');
    assert.equal(result.document.spec.fields.length, added ? 7 : 6);
    assert.deepEqual(input.document, saved);
    let createReads = 0;
    const created = await deployNativeDmo(saved, {
      get: async () => (++createReads === 1 ? absent() : raw),
      create: async () => raw,
    });
    assert.equal(created.operation, 'create');
    assert.equal(created.document.spec.fields.length, added ? 7 : 6);
  }
});

test('DMO save preserves qualifiers; a definition may omit generated fields but not custom ones', async () => {
  for (const qualifier of [
    { ...authored('KQ_Other__c'), creationType: 'System', usageTag: 'KeyQualifier' },
    { ...authored('KQ_Id__c'), creationType: 'Custom' },
    authored('KQ_Id__c'),
    { ...authored('KQ_Id__c'), creationType: 'System', isPrimaryKey: true },
  ]) {
    const value = document();
    value.spec.fields = value.spec.fields.filter((f) => f.name !== 'KQ_Id__c');
    if (qualifier.isPrimaryKey) value.spec.fields[0].isPrimaryKey = false;
    value.spec.fields.push(qualifier);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dmo-preserve-qualifier-'));
    const receipt = await writeNativeDmoDocument(value, cwd, false);
    assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), value);
    const target = native();
    target.fields = value.spec.fields.map(({ dataType, ...f }) => ({ ...f, type: dataType }));
    const missing = structuredClone(value);
    missing.spec.fields = missing.spec.fields.filter((f) => f.name !== qualifier.name);
    // The API cannot remove fields, so leaving a generated one out changes nothing.
    assert.equal(await planOperation(missing, { get: async () => target }), 'unchanged');
  }
});

test('DMO readback does not require omitted generated fields; generated fields cannot be edited', async () => {
  const saved = document();
  saved.spec.label = 'Changed';
  saved.spec.fields = saved.spec.fields.filter((f) => f.name !== 'KQ_Id__c');
  let reads = 0;
  let writes = 0;
  const result = await deployNativeDmo(
    saved,
    {
      get: async () => {
        if (++reads === 1) return native();
        const actual = native();
        actual.label = saved.spec.label;
        actual.fields = actual.fields.filter((f) => f.name !== 'KQ_Id__c');
        return actual;
      },
      update: async () => {
        writes++;
        return native();
      },
    },
    undefined,
    fast,
  );
  assert.equal(result.operation, 'update');
  assert.equal(reads, 2);
  assert.equal(writes, 1);
  assert.equal(saved.spec.fields.length, 5);
  for (const name of ['DataSource__c', 'KQ_Id__c']) {
    const changed = document();
    changed.spec.fields.find((f) => f.name === name).label = 'Changed';
    await assert.rejects(
      preflightNativeDmo(changed, { get: async () => native() }),
      /FIELD_CHANGE/,
    );
  }
  // A custom field missing from the definition would be a removal, which the API cannot do.
  const removed = document();
  removed.spec.fields = removed.spec.fields.filter((f) => f.name !== 'Note__c');
  await assert.rejects(preflightNativeDmo(removed, { get: async () => native() }), /FIELD_CHANGE/);
  const withoutSystem = document();
  withoutSystem.spec.fields = withoutSystem.spec.fields.filter((f) => f.name !== 'DataSource__c');
  assert.equal(await planOperation(withoutSystem, { get: async () => native() }), 'unchanged');
});

test('native DMO validation checks shape only and leaves category, label length and keys to the API', () => {
  for (const mutate of [
    (d) => {
      d.id = 'source';
    },
    (d) => {
      d.identity.apiName = resourceId;
    },
    (d) => {
      d.identity.dataSpace = ' ';
    },
    (d) => {
      d.spec.label = ' ';
    },
    (d) => {
      d.spec.category = '';
    },
    (d) => {
      d.spec.description = 5;
    },
    (d) => {
      d.spec.fields.push(structuredClone(d.spec.fields[0]));
    },
    (d) => {
      d.spec.fields[1].recordId = 'source';
    },
    (d) => {
      d.spec.fields[1].type = 'Text';
    },
  ]) {
    const saved = document();
    mutate(saved);
    assert.throws(() => validateNativeDmoDocument(saved), NativeDmoError);
  }
  for (const mutate of [
    (d) => {
      d.spec.label = 'x'.repeat(41);
    },
    (d) => {
      d.spec.category = 'Engagement';
    },
    (d) => {
      d.spec.category = 'NotACategory';
    },
    (d) => {
      d.spec.description = 'Described';
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
    },
    (d) => {
      d.spec.fields[1].dataType = 'Currency';
    },
    (d) => {
      d.spec.futureKey = { any: 'value' };
    },
  ]) {
    const saved = document();
    mutate(saved);
    assert.deepEqual(validateNativeDmoDocument(saved), saved);
  }
  for (const raw of [
    { ...native(), dataSpaceName: '' },
    { ...native(), fields: [{ ...field('Id__c', true), type: undefined }] },
    { ...native(), fields: [{ ...field('Id__c', true), dataType: 'Number' }] },
    { ...native(), fields: [{ ...field('Id__c', true), isPrimaryKey: 'true' }] },
  ])
    assert.throws(() => normalizeNativeDmo(raw), NativeDmoError);
});

test('native DMO retrieve saves any category, description and long labels, upper-case reads included', () => {
  for (const [wire, saved] of [
    ['OTHER', 'Other'],
    ['PROFILE', 'Profile'],
    ['ENGAGEMENT', 'Engagement'],
    ['SEGMENT_MEMBERSHIP', 'Segment_Membership'],
    ['Profile', 'Profile'],
  ]) {
    const raw = { ...native(), category: wire, description: 'Described', label: 'L'.repeat(60) };
    const normalized = normalizeNativeDmo(raw);
    assert.equal(normalized.spec.category, saved);
    assert.equal(normalized.spec.description, 'Described');
    assert.equal(normalized.spec.label.length, 60);
    assert.deepEqual(Object.keys(normalized.spec), ['label', 'category', 'description', 'fields']);
  }
  assert.equal(normalizeNativeDmo({ ...native(), description: '' }).spec.description, undefined);
});

test('native DMO create uses bare names and passes category, types and optional keys through', async () => {
  const plan = await preflightNativeDmo(document(), { get: absent });
  assert.deepEqual(plan, {
    operation: 'create',
    apiName,
    body: {
      name: 'Example',
      label: 'Example',
      category: 'Other',
      fields: [
        { name: 'Id', label: 'Id', dataType: 'Text', isPrimaryKey: true },
        { name: 'Note', label: 'Note', dataType: 'Text', isPrimaryKey: false },
      ],
    },
  });
  assert.ok(!JSON.stringify(plan).includes(resourceId));
  const saved = document();
  saved.spec.fields.push(authored('cdp_sys_SourceVersion__c'));
  const sourceVersionPlan = await preflightNativeDmo(saved, { get: absent });
  assert.ok(sourceVersionPlan.body.fields.some((f) => f.name === 'cdp_sys_SourceVersion'));
  // No local allowlists: whatever is authored is sent and the API decides.
  const wide = document();
  wide.spec.category = 'Engagement';
  wide.spec.label = 'L'.repeat(80);
  wide.spec.description = 'Object description';
  wide.spec.futureKey = 'kept';
  wide.spec.fields[1].dataType = 'Currency';
  wide.spec.fields[1].description = 'Field description';
  wide.spec.fields[1].isDynamicLookup = true;
  wide.spec.fields[1].length = 200;
  wide.spec.fields.push({ ...authored('When__c'), dataType: 'DateTime' });
  const widePlan = await preflightNativeDmo(wide, { get: absent });
  assert.deepEqual(widePlan.body, {
    futureKey: 'kept',
    name: 'Example',
    label: 'L'.repeat(80),
    category: 'Engagement',
    description: 'Object description',
    fields: [
      { name: 'Id', label: 'Id', dataType: 'Text', isPrimaryKey: true },
      {
        name: 'Note',
        label: 'Note',
        dataType: 'Currency',
        isPrimaryKey: false,
        description: 'Field description',
        isDynamicLookup: true,
        length: 200,
      },
      { name: 'When', label: 'When', dataType: 'DateTime', isPrimaryKey: false },
    ],
  });
  // Keys the API only returns are never sent, whatever their authored value.
  const readOnly = document();
  readOnly.spec.fields[1].isDistinct = true;
  readOnly.spec.fields[1].usageTag = 'Other';
  readOnly.spec.fields[0].keyQualifierName = 'Other';
  const readOnlyPlan = await preflightNativeDmo(readOnly, { get: absent });
  assert.deepEqual(readOnlyPlan.body.fields, plan.body.fields);
  // No primary-key count rule here either.
  const noKey = document();
  noKey.spec.fields[0].isPrimaryKey = false;
  assert.equal(await planOperation(noKey, { get: absent }), 'create');
});

test('native DMO API rejection is surfaced once without retry or readback', async () => {
  const rejection = new NativeDmoError('DMO_HTTP_ERROR', 400);
  const saved = document();
  saved.spec.category = 'Insights';
  let reads = 0;
  let creates = 0;
  await assert.rejects(
    deployNativeDmo(
      saved,
      {
        get: async () => {
          reads++;
          return absent();
        },
        create: async () => {
          creates++;
          throw rejection;
        },
      },
      undefined,
      fast,
    ),
    (actual) => actual === rejection,
  );
  assert.equal(reads, 1);
  assert.equal(creates, 1);
});

test('native DMO only confirmed HTTP404 permits create, all other lookup failures stop before mutation', async () => {
  for (const error of [
    new Error('404'),
    new NativeDmoError('DMO_HTTP_ERROR', 401),
    new NativeDmoError('DMO_HTTP_ERROR', 403),
    new NativeDmoError('DMO_HTTP_ERROR', 500),
    new NativeDmoError('DMO_REQUEST_UNCONFIRMED', 404),
  ]) {
    let writes = 0;
    await assert.rejects(
      deployNativeDmo(document(), {
        get: async () => {
          throw error;
        },
        create: async () => {
          writes++;
        },
        update: async () => {
          writes++;
        },
      }),
      (actual) => actual === error,
    );
    assert.equal(writes, 0);
  }
});

test('native DMO update sends edits and additions of any type, refuses what the API cannot do', async () => {
  const saved = document();
  saved.spec.label = 'Changed';
  saved.spec.fields.push(authored('Extra__c'));
  assert.deepEqual(await preflightNativeDmo(saved, { get: async () => native() }), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    body: {
      label: 'Changed',
      fields: [{ name: 'Extra', label: 'Extra', dataType: 'Text', isPrimaryKey: false }],
    },
  });
  // Existing field label edit plus a non-Text addition travel in one PATCH.
  const edited = document();
  edited.spec.fields[1].label = 'Note renamed';
  edited.spec.fields[1].description = 'Now described';
  edited.spec.fields.push({ ...authored('Amount__c'), dataType: 'Number', isDynamicLookup: true });
  assert.deepEqual(await planBody(edited, { get: async () => native() }), {
    label: 'Example',
    fields: [
      {
        name: 'Note',
        label: 'Note renamed',
        dataType: 'Text',
        isPrimaryKey: false,
        description: 'Now described',
      },
      {
        name: 'Amount',
        label: 'Amount',
        dataType: 'Number',
        isPrimaryKey: false,
        isDynamicLookup: true,
      },
    ],
  });
  // A hand-authored definition need not repeat keys the API only returns.
  const bare = document();
  for (const f of bare.spec.fields)
    for (const key of ['creationType', 'isDistinct', 'usageTag', 'keyQualifierName']) delete f[key];
  assert.equal(await planOperation(bare, { get: async () => native() }), 'unchanged');
  // Write-only keys cannot be read back, so on their own they are not a detectable change.
  const described = document();
  described.spec.fields[1].description = 'Only this';
  described.spec.fields[1].isDynamicLookup = false;
  assert.equal(await planOperation(described, { get: async () => native() }), 'unchanged');
  for (const mutate of [
    (d) => {
      d.spec.fields.splice(1, 1);
    },
    (d) => {
      d.spec.fields[1].dataType = 'Number';
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
      d.spec.fields[1].isPrimaryKey = true;
    },
    (d) => {
      d.spec.fields.push(authored('KQ_New__c'));
    },
    (d) => {
      d.spec.fields.push({ ...authored('Extra__c'), isPrimaryKey: true });
    },
    (d) => {
      d.spec.fields.push({ ...authored('Extra__c'), creationType: 'System' });
    },
    (d) => {
      d.spec.fields[0].keyQualifierName = 'Other';
    },
  ]) {
    const saved = document();
    mutate(saved);
    let writes = 0;
    await assert.rejects(
      deployNativeDmo(saved, {
        get: async () => native(),
        update: async () => {
          writes++;
        },
      }),
      /UNSUPPORTED_DMO_FIELD_(CHANGE|ADDITION)/,
    );
    assert.equal(writes, 0);
  }
});

test('native DMO description is unmanaged when absent, set or cleared when authored; category change is sent', async () => {
  assert.equal(await planOperation(document(), { get: getDescribed }), 'unchanged');
  const same = document();
  same.spec.description = 'Existing';
  assert.equal(await planOperation(same, { get: getDescribed }), 'unchanged');
  const changed = document();
  changed.spec.description = 'New text';
  assert.deepEqual(await planBody(changed, { get: getDescribed }), {
    label: 'Example',
    description: 'New text',
  });
  const cleared = document();
  cleared.spec.description = '';
  assert.deepEqual(await planBody(cleared, { get: getDescribed }), {
    label: 'Example',
    description: '',
  });
  assert.equal(await planOperation(cleared, { get: async () => native() }), 'unchanged');
  // Cleared description confirms against a read that no longer returns one.
  let reads = 0;
  const result = await deployNativeDmo(
    cleared,
    { get: async () => (++reads === 1 ? described() : native()), update: async () => described() },
    undefined,
    fast,
  );
  assert.equal(result.operation, 'update');
  // Same category in another spelling is no change; a different one is sent for the API to refuse.
  for (const spelling of ['other', 'OTHER', 'Other']) {
    const respelled = document();
    respelled.spec.category = spelling;
    assert.equal(await planOperation(respelled, { get: async () => native() }), 'unchanged');
  }
  const recategorised = document();
  recategorised.spec.category = 'Profile';
  assert.deepEqual(await planBody(recategorised, { get: async () => native() }), {
    label: 'Example',
    category: 'Profile',
  });
});

test('native DMO writes and deletes are refused for standard, namespaced and generated targets', async () => {
  for (const raw of [
    { ...native(), creationType: 'Standard' },
    { ...native(), creationType: 'Adg' },
    { ...native(), creationType: undefined },
    { ...native(), name: 'ssot__Individual__dlm' },
  ]) {
    const name = raw.name;
    const saved = normalizeNativeDmo(raw);
    saved.spec.label = 'Changed';
    await assert.rejects(
      deployNativeDmo(saved, {
        get: async () => raw,
        update: async () => assert.fail('guarded target must not PATCH'),
      }),
      /UNSUPPORTED_DMO_TARGET/,
    );
    await assert.rejects(
      deleteNativeDmo(name, {
        get: async () => raw,
        delete: async () => assert.fail('guarded target must not DELETE'),
      }),
      /UNSUPPORTED_DMO_TARGET/,
    );
    await assert.rejects(
      previewDeleteNativeDmo(name, { get: async () => raw }),
      /UNSUPPORTED_DMO_TARGET/,
    );
    // Reading stays possible.
    const retrieved = await retrieveNativeDmo(name, { get: async () => raw });
    assert.equal(retrieved.identity.apiName, name);
  }
});

test('native DMO identical definitions are GET-only after preservation checks, independent of field order', async () => {
  for (const omitQualifier of [false, true]) {
    const saved = document();
    if (omitQualifier) saved.spec.fields = saved.spec.fields.filter((f) => f.name !== 'KQ_Id__c');
    saved.spec.fields.reverse();
    const before = structuredClone(saved);
    const calls = [];
    const target = {
      get: async (name) => {
        calls.push(['get', name]);
        return native();
      },
      create: async () => assert.fail('unchanged must not POST'),
      update: async () => assert.fail('unchanged must not PATCH'),
      delete: async () => assert.fail('unchanged must not DELETE'),
    };
    const plan = await preflightNativeDmo(saved, target, 'default');
    assert.equal(plan.operation, 'unchanged');
    assert.deepEqual(plan.document, document());
    const result = await deployNativeDmo(saved, target, 'default');
    assert.equal(result.operation, 'unchanged');
    assert.deepEqual(result.document, document());
    assert.deepEqual(calls, [
      ['get', apiName],
      ['get', apiName],
    ]);
    assert.deepEqual(saved, before);
  }
});

test('native DMO unchanged label does not bypass added-field or target safety checks', async () => {
  for (const field of [
    { ...authored('Extra__c'), creationType: 'System' },
    { ...authored('Extra__c'), isPrimaryKey: true },
    authored('KQ_Extra__c'),
  ]) {
    const saved = document();
    saved.spec.fields.push(field);
    await assert.rejects(
      deployNativeDmo(saved, {
        get: async () => native(),
        update: async () => assert.fail('unsafe input must not PATCH'),
      }),
      /UNSUPPORTED_DMO_FIELD_ADDITION/,
    );
  }
  for (const raw of [
    { ...native(), name: 'Other__dlm' },
    { ...native(), dataSpaceName: 'other' },
  ])
    await assert.rejects(
      deployNativeDmo(document(), {
        get: async () => raw,
        update: async () => assert.fail('unsafe target must not PATCH'),
      }),
      /IDENTITY_MISMATCH|DATASPACE_MISMATCH/,
    );
});

test('native DMO stale PATCH is not persistence proof, independent GET confirms disabled object', async () => {
  const saved = document();
  saved.spec.label = 'Changed';
  saved.spec.fields.push(authored('Extra__c'));
  const changed = native();
  changed.label = 'Changed';
  changed.fields.push(field('Extra__c'));
  const calls = [];
  let reads = 0;
  const result = await deployNativeDmo(
    saved,
    {
      get: async (name) => {
        calls.push(['get', name]);
        return ++reads < 3 ? native() : changed;
      },
      update: async (name, body) => {
        calls.push(['update', name, body]);
        return native();
      },
    },
    undefined,
    fast,
  );
  assert.equal(result.operation, 'update');
  assert.equal(result.document.spec.label, 'Changed');
  assert.equal(calls.filter((c) => c[0] === 'update').length, 1);
  assert.equal(calls[1][1], apiName);
  assert.equal(reads, 3);
});

test('native DMO stale forever, dropped old fields, changed PK and read failures fail without write retry', async () => {
  for (const mode of ['stale', 'removed', 'key', 'read-error', 'wrong-name', 'wrong-space']) {
    const saved = document();
    saved.spec.label = 'Changed';
    let reads = 0;
    let writes = 0;
    await assert.rejects(
      deployNativeDmo(
        saved,
        {
          get: async () => {
            reads++;
            if (reads === 1) return native();
            if (mode === 'read-error') throw new Error('Read failed');
            const actual = native();
            if (mode !== 'stale') actual.label = 'Changed';
            if (mode === 'removed') actual.fields.splice(1, 1);
            if (mode === 'key') {
              actual.fields[0].isPrimaryKey = false;
              actual.fields[1].isPrimaryKey = true;
            }
            if (mode === 'wrong-name') actual.name = 'Other__dlm';
            if (mode === 'wrong-space') actual.dataSpaceName = 'other';
            return actual;
          },
          update: async () => {
            writes++;
            return native();
          },
        },
        undefined,
        fast,
      ),
    );
    assert.equal(writes, 1);
    assert.ok(reads <= 4);
    if (mode === 'stale' || mode === 'removed' || mode === 'key') assert.equal(reads, 4);
    else assert.equal(reads, 2);
  }
});

test('native DMO create independently confirms GET, exact retrieve/delete ignore raw IDs', async () => {
  let reads = 0;
  let creates = 0;
  const result = await deployNativeDmo(document(), {
    get: async () => {
      if (++reads === 1) return absent();
      return native();
    },
    create: async () => {
      creates++;
      return native();
    },
  });
  assert.equal(result.operation, 'create');
  assert.equal(reads, 2);
  assert.equal(creates, 1);
  const raw = native();
  delete raw.id;
  assert.deepEqual(await retrieveNativeDmo(apiName, { get: async () => raw }), document());
  const calls = [];
  assert.deepEqual(
    await deleteNativeDmo(apiName, {
      get: async (name) => {
        calls.push(['get', name]);
        if (calls.length > 1) return absent();
        return native();
      },
      delete: async (name) => {
        calls.push(['delete', name]);
      },
    }),
    { apiName, targetApiName: apiName, dataSpace: 'default' },
  );
  assert.deepEqual(calls, [
    ['get', apiName],
    ['delete', apiName],
    ['get', apiName],
  ]);
  let writes = 0;
  for (const raw of [
    { ...native(), name: 'Other__dlm' },
    { ...native(), dataSpaceName: '' },
  ]) {
    await assert.rejects(
      deleteNativeDmo(apiName, {
        get: async () => raw,
        delete: async () => {
          writes++;
        },
      }),
    );
  }
  assert.equal(writes, 0);
  await assert.rejects(
    deleteNativeDmo(resourceId, {
      get: async () => {
        throw new Error('Must not read');
      },
    }),
    /NAME/,
  );
});

test('DMO authoritative scope, conditional body projection and collision refusal', async () => {
  const raw = { ...native(), dataSpaceName: 'other' };
  const saved = normalizeNativeDmo(raw);
  assert.equal(saved.identity.dataSpace, 'other');
  assert.throws(() => normalizeNativeDmo(raw, 'default'), /DATASPACE/);
  assert.equal(normalizeNativeDmo(raw, 'other').identity.dataSpace, 'other');
  const omittedCreate = await preflightNativeDmo(document(), { get: absent });
  const defaultCreate = await preflightNativeDmo(document(), { get: absent }, 'default');
  const scopedCreate = await preflightNativeDmo(saved, { get: absent }, 'other');
  saved.spec.label = 'Changed';
  const omittedPatch = await preflightNativeDmo(saved, { get: async () => raw });
  const scopedPatch = await preflightNativeDmo(saved, { get: async () => raw }, 'other');
  assert.ok(!Object.hasOwn(omittedCreate.body, 'dataSpaceName'));
  assert.equal(defaultCreate.body.dataSpaceName, 'default');
  assert.equal(scopedCreate.body.dataSpaceName, 'other');
  assert.ok(!Object.hasOwn(omittedPatch.body, 'dataSpaceName'));
  assert.equal(scopedPatch.body.dataSpaceName, 'other');
  let writes = 0;
  const client = {
    get: absent,
    create: async () => {
      writes++;
      return raw;
    },
  };
  await assert.rejects(deployNativeDmo(saved, client), /DATASPACE/);
  await assert.rejects(deployNativeDmo(saved, client, 'default'), /DATASPACE/);
  const target = {
    get: async () => native(),
    update: async () => {
      writes++;
      return raw;
    },
    delete: async () => {
      writes++;
    },
  };
  await assert.rejects(deployNativeDmo(saved, target), /DATASPACE/);
  await assert.rejects(deleteNativeDmo(apiName, target, 'other'), /DATASPACE/);
  await assert.rejects(retrieveNativeDmo(apiName, target, 'other'), /DATASPACE/);
  assert.equal(writes, 0);
  let reads = 0;
  const created = await deployNativeDmo(
    saved,
    {
      get: async () => (++reads === 1 ? absent() : { ...raw, label: saved.spec.label }),
      create: async (body) => {
        assert.equal(body.dataSpaceName, 'other');
        return { ...raw, label: saved.spec.label };
      },
    },
    'other',
  );
  assert.equal(created.document.identity.dataSpace, 'other');
  await assert.rejects(
    deployNativeDmo(saved, { get: async () => raw, update: async () => native() }, 'other'),
    /DATASPACE/,
  );
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dmo-space-collision-'));
  const receipt = await writeNativeDmoDocument(document(), cwd, false);
  const bytes = await readFile(receipt.path);
  for (const overwrite of [false, true])
    await assert.rejects(writeNativeDmoDocument(saved, cwd, overwrite), /DATASPACE_COLLISION/);
  assert.deepEqual(await readFile(receipt.path), bytes);
});

test('native DMO transport uses API65 full-name GET/PATCH/DELETE URLs, retained FTemp bodies and no IDs', async () => {
  const requests = [];
  const client = createDmoClient('target', '65.0', async (arguments_, cwd) => {
    assert.ok(arguments_.includes('--include'));
    assert.ok(!arguments_.includes('--json'));
    assert.equal(arguments_[arguments_.indexOf('--target-org') + 1], 'target');
    assert.ok(cwd.toLowerCase().startsWith(String.raw`f:\temp\data360-native-dmo-`));
    if (arguments_.includes('--file')) {
      const request = JSON.parse(
        await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8'),
      );
      requests.push(request);
      return http(204);
    }
    const method = arguments_[arguments_.indexOf('--method') + 1];
    const body = arguments_.indexOf('--body');
    requests.push({
      method,
      url: arguments_[3],
      ...(body === -1
        ? {}
        : { body: JSON.parse(await readFile(arguments_[body + 1].slice(1), 'utf8')) }),
    });
    return http(method === 'POST' ? 201 : 200, native());
  });
  await client.get(apiName);
  await client.create({ name: 'Example' });
  await client.update(apiName, { label: 'Changed' });
  await client.delete(apiName);
  const base = '/services/data/v65.0/ssot/data-model-objects';
  assert.deepEqual(requests, [
    { method: 'GET', url: `${base}/${apiName}` },
    { method: 'POST', url: base, body: { name: 'Example' } },
    { method: 'PATCH', url: `${base}/${apiName}`, body: { label: 'Changed' } },
    { method: 'DELETE', url: `${base}/${apiName}`, body: { mode: 'raw', raw: '' } },
  ]);
  assert.ok(!JSON.stringify(requests).includes(resourceId));
  for (const name of [resourceId, '../unsafe', 'Example']) {
    await assert.rejects(client.update(name, {}), /NAME/);
    await assert.rejects(client.delete(name), /NAME/);
    await assert.rejects(client.get(name), /NAME/);
  }
  assert.equal(requests.length, 4);
  assert.throws(() => createDmoClient('target', '60.0'), /INVALID_SCOPE/);
  for (const version of ['61.0', '68.0'])
    assert.doesNotThrow(() => createDmoClient('target', version));
  assert.throws(() => createDmoClient('-target'), /SELECTION/);
});

test('native DMO transport refuses malformed HTTP success and only authentic HTTP404 is absence', async () => {
  for (const receipt of [
    { exitCode: 1, stdout: JSON.stringify({ status: 1, message: '404' }) },
    { exitCode: 0, stdout: 'not HTTP' },
    { exitCode: 0, stdout: 'HTTP/1.1 200\ncontent-type: application/json\ninvalid' },
    { ...http(200, native()), exitCode: 1 },
    http(202, native()),
  ]) {
    const client = createDmoClient('target', '65.0', async () => receipt);
    await assert.rejects(
      preflightNativeDmo(document(), client),
      (error) => error instanceof NativeDmoError && error.code !== 'DMO_HTTP_ERROR',
    );
  }
  const client = createDmoClient('target', '65.0', async () =>
    http(404, [{ errorCode: 'NOT_FOUND' }]),
  );
  const plan = await preflightNativeDmo(document(), client);
  assert.equal(plan.operation, 'create');
  for (const receipt of [http(200), http(204, { unexpected: true })]) {
    await assert.rejects(
      createDmoClient('target', '65.0', async () => receipt).delete(apiName),
      /DELETE_UNCONFIRMED/,
    );
  }
});
