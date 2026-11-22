import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import test from 'node:test';
import {
  DloError,
  dloName,
  leanDloDocument,
  normalizeDlo,
  validateDloDocument,
} from '../lib/artifacts/dlo-document.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  deleteNativeDlo,
  deployNativeDlo,
  preflightNativeDlo,
  retrieveNativeDlo,
} from '../lib/services/native-dlo.js';

import { executeDloDeploy, preflightDloDeploy } from '../lib/services/command-dlo.js';

const apiName = 'Example__dll';
const targetId = '1dlaj00000Ae4VNAAZ';
const field = (name, primary = false) => ({
  name,
  label: name,
  dataType: 'Text',
  isPrimaryKey: primary,
});
const native = () => ({
  name: apiName,
  id: targetId,
  label: 'Example',
  category: 'Other',
  status: 'ACTIVE',
  createdDate: 'runtime',
  dataSpaceInfo: [{ name: 'default', label: 'default' }],
  dataLakeFieldInfoRepresentation: [
    field('Id__c', true),
    { ...field('Note__c'), length: 200, description: 'Portable definition' },
    ...[
      'KQ_Id__c',
      'cdp_sys_SourceVersion__c',
      'DataSource__c',
      'DataSourceObject__c',
      'InternalOrganization__c',
    ].map((name) => field(name)),
  ],
});
const document = () => normalizeDlo(native(), 'default');
const systemNames = [
  'cdp_sys_SourceVersion__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
];
const absent = () => {
  throw new DloError('DLO_HTTP_ERROR', 404);
};

test('normalizes GET and write shapes, preserving all fields but not runtime/wrappers', () => {
  const raw = native();
  raw.fields = structuredClone(raw.dataLakeFieldInfoRepresentation);
  raw.dataLakeFieldInfoRepresentation[0].recordID = 'source';
  const saved = normalizeDlo({ dataLakeObjects: [raw] }, 'default');
  assert.equal(saved.spec.fields.length, 7);
  assert.equal(saved.spec.fields[1].length, 200);
  assert.equal(saved.spec.fields[1].description, 'Portable definition');
  assert.equal(saved.spec.fields[0].recordID, undefined);
  assert.equal(saved.id, undefined);
  assert.equal(saved.spec.status, undefined);
  assert.deepEqual(saved, normalizeDlo(raw, 'default'));
  assert.throws(() => normalizeDlo({ dataLakeObjects: [raw, raw] }, 'default'), /AMBIGUOUS/);
  assert.deepEqual(
    normalizeDlo({ ...raw, dataSpaceInfo: [{ name: 'other' }] }, 'other').c__dataSpace,
    ['other'],
  );
  assert.ok(dloName.test(apiName));
  assert.ok(!dloName.test('../Example__dll'));
});

test('DLO save keeps authored fields only (no KQ_Id or system fields) and roundtrips seven/eight raw fields', async () => {
  for (const added of [false, true]) {
    const raw = native();
    raw.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
    if (added) raw.dataLakeFieldInfoRepresentation.push(field('UpdateNote__c'));
    const before = structuredClone(raw);
    const normalized = normalizeDlo(raw, 'default');
    const snapshot = structuredClone(normalized);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dlo-save-policy-'));
    const receipt = await writeDloDocument(normalized, cwd, false);
    const [input] = await readDeployInputs({ cwd, metadata: [`dlo:${apiName}`] });
    const saved = input.document;
    assert.equal(raw.dataLakeFieldInfoRepresentation.length, added ? 8 : 7);
    assert.equal(normalized.spec.fields.length, added ? 8 : 7);
    assert.equal(saved.spec.fields.length, added ? 3 : 2);
    assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), saved);
    assert.deepEqual(
      saved.spec.fields,
      snapshot.spec.fields.filter((f) => !['KQ_Id__c', ...systemNames].includes(f.name)),
    );
    assert.equal(saved.spec.fields[0].keyQualifierName, 'KQ_Id');
    assert.deepEqual(raw, before);
    assert.deepEqual(normalized, snapshot);
    const create = await preflightNativeDlo(saved, { get: absent }, 'default');
    assert.deepEqual(
      create.body.dataLakeFieldInputRepresentations.map((f) => f.name),
      added ? ['Id', 'Note', 'UpdateNote'] : ['Id', 'Note'],
    );
    let writes = 0;
    const target = native();
    target.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
    const result = await deployNativeDlo(
      saved,
      {
        get: async () => target,
        update: async (_id, body) => {
          writes++;
          assert.equal(body.dataLakeFieldInputRepresentations?.length ?? 0, added ? 1 : 0);
          return raw;
        },
      },
      'default',
    );
    assert.equal(writes, added ? 1 : 0);
    assert.equal(result.operation, added ? 'update' : 'unchanged');
    assert.equal(result.document.spec.fields.length, added ? 8 : 7);
    const created = await deployNativeDlo(
      saved,
      { get: absent, create: async () => raw },
      'default',
    );
    assert.equal(created.operation, 'create');
    assert.equal(created.document.spec.fields.length, added ? 8 : 7);
    assert.deepEqual(input.document, saved);
  }
});

test('DLO save preserves other/custom/primary qualifiers and update refuses their removal or changes', async () => {
  for (const qualifier of [
    field('KQ_Other__c'),
    { ...field('KQ_Id__c'), creationType: 'Custom' },
    { ...field('KQ_Id__c'), isPrimaryKey: true },
  ]) {
    const value = document();
    value.spec.fields = value.spec.fields.filter((f) => f.name !== 'KQ_Id__c');
    if (qualifier.isPrimaryKey) value.spec.fields[0].isPrimaryKey = false;
    value.spec.fields.push(qualifier);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dlo-preserve-qualifier-'));
    const receipt = await writeDloDocument(value, cwd, false);
    // Only the generated system fields are left out; these qualifiers are not generated.
    const authored = structuredClone(value);
    authored.spec.fields = authored.spec.fields.filter((f) => !systemNames.includes(f.name));
    assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), authored);
    const target = native();
    target.dataLakeFieldInfoRepresentation = value.spec.fields;
    const missing = structuredClone(value);
    missing.spec.fields = missing.spec.fields.filter((f) => f.name !== qualifier.name);
    if (!qualifier.isPrimaryKey)
      await assert.rejects(
        preflightNativeDlo(missing, { get: async () => target }, 'default'),
        /FIELD_CHANGE/,
      );
  }
  for (const name of ['Note__c', 'DataSource__c', 'KQ_Id__c']) {
    const changed = document();
    changed.spec.fields.find((f) => f.name === name).label = 'Changed';
    await assert.rejects(
      preflightNativeDlo(changed, { get: async () => native() }, 'default'),
      /FIELD_CHANGE/,
    );
    if (name === 'KQ_Id__c') continue;
    changed.spec.fields = document().spec.fields.filter((f) => f.name !== name);
    // An omitted authored field is a removal; an omitted system field stays as the org has it.
    if (name === 'Note__c')
      await assert.rejects(
        preflightNativeDlo(changed, { get: async () => native() }, 'default'),
        /FIELD_CHANGE/,
      );
    else {
      const kept = await preflightNativeDlo(changed, { get: async () => native() }, 'default');
      assert.equal(kept.operation, 'unchanged');
    }
  }
});

/**
 * Hand-written file: the authored fields only, nothing Salesforce generated.
 * @param {object[]} [extra] Further authored fields.
 * @returns {object} Portable document.
 */
const handWritten = (extra = []) => {
  const value = document();
  value.spec.fields = [...value.spec.fields.slice(0, 2), ...extra];
  return value;
};
const refusedChange = (error) =>
  error instanceof DloError && error.code === 'UNSUPPORTED_DLO_FIELD_CHANGE';

test('hand-written DLO file without generated fields is unchanged and adds only its new field', async () => {
  const input = handWritten();
  assert.deepEqual(
    input.spec.fields.map((f) => f.name),
    ['Id__c', 'Note__c'],
  );
  const before = structuredClone(input);
  let writes = 0;
  const client = {
    get: async () => native(),
    create: async () => assert.fail('no POST expected'),
    update: async () => {
      writes++;
      return native();
    },
  };
  const plan = await preflightNativeDlo(input, client, 'default');
  assert.equal(plan.operation, 'unchanged');
  assert.equal(plan.targetId, targetId);
  assert.equal(Object.hasOwn(plan, 'body'), false);
  const result = await deployNativeDlo(input, client, 'default');
  assert.equal(result.operation, 'unchanged');
  // The org copy keeps all seven fields.
  assert.deepEqual(result.document, document());
  assert.equal(writes, 0);
  assert.deepEqual(input, before);

  const added = handWritten([field('Extra__c')]);
  const addedBefore = structuredClone(added);
  const updates = [];
  const after = native();
  after.dataLakeFieldInfoRepresentation.push(field('Extra__c'));
  const deployed = await deployNativeDlo(
    added,
    {
      get: async () => native(),
      create: async () => assert.fail('no POST expected'),
      update: async (id, body) => {
        updates.push([id, body]);
        return after;
      },
    },
    'default',
  );
  assert.equal(deployed.operation, 'update');
  assert.deepEqual(updates, [
    [
      targetId,
      {
        label: 'Example',
        dataLakeFieldInputRepresentations: [{ ...field('Extra__c'), name: 'Extra' }],
      },
    ],
  ]);
  assert.equal(deployed.document.spec.fields.length, 8);
  assert.deepEqual(added, addedBefore);
});

test('a listed DLO field is compared on the keys the file states only', async () => {
  const raw = native();
  raw.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
  raw.dataLakeFieldInfoRepresentation[1].creationType = 'Custom';
  const client = { get: async () => raw };
  for (const input of [handWritten(), document()]) {
    assert.equal(Object.hasOwn(input.spec.fields[0], 'keyQualifierName'), false);
    const plan = await preflightNativeDlo(input, client, 'default');
    assert.equal(plan.operation, 'unchanged');
  }
  // A stated key that differs, or that the org copy does not have, is still a change.
  for (const mutate of [
    (d) => {
      d.spec.fields[0].keyQualifierName = 'KQ_Other';
    },
    (d) => {
      d.spec.fields[1].length = 100;
    },
    (d) => {
      d.spec.fields[0].description = 'Only in the file';
    },
  ]) {
    const input = handWritten();
    mutate(input);
    await assert.rejects(preflightNativeDlo(input, client, 'default'), refusedChange);
  }
});

test('DLO update keeps only omitted generated fields; other omissions and listed differences refuse', async () => {
  const cases = {
    'omitted authored field': (input) => {
      input.spec.fields = input.spec.fields.filter((f) => f.name !== 'Note__c');
    },
    'omitted qualifier of another field': (_input, raw) => {
      raw.dataLakeFieldInfoRepresentation.push(field('KQ_Other__c'));
    },
    'omitted system field reported as Custom': (_input, raw) => {
      raw.dataLakeFieldInfoRepresentation.find((f) => f.name === 'DataSource__c').creationType =
        'Custom';
    },
    'omitted key qualifier reported as Custom': (_input, raw) => {
      raw.dataLakeFieldInfoRepresentation.find((f) => f.name === 'KQ_Id__c').creationType =
        'Custom';
    },
    'listed system field that differs': (input) => {
      input.spec.fields.push({ ...field('DataSource__c'), label: 'Changed' });
    },
    'listed key qualifier that differs': (input) => {
      input.spec.fields.push({ ...field('KQ_Id__c'), dataType: 'Number' });
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const input = handWritten();
    const raw = native();
    mutate(input, raw);
    let writes = 0;
    const client = {
      get: async () => raw,
      create: async () => {
        writes++;
      },
      update: async () => {
        writes++;
      },
    };
    await assert.rejects(preflightNativeDlo(input, client, 'default'), refusedChange, name);
    await assert.rejects(deployNativeDlo(input, client, 'default'), refusedChange, name);
    assert.equal(writes, 0, name);
  }
  // Each generated field may be left out on its own, or listed exactly as the org has it. Salesforce
  // also adds the key qualifier of a non-key field (KQ_RefId__c for a relationship source field,
  // live API 68), so the qualifier of any field of the DLO counts as generated.
  const qualified = native();
  qualified.dataLakeFieldInfoRepresentation.push(field('KQ_Note__c'));
  for (const input of [handWritten(), document()]) {
    const plan = await preflightNativeDlo(input, { get: async () => qualified }, 'default');
    assert.equal(plan.operation, 'unchanged');
  }
  assert.equal(
    leanDloDocument(normalizeDlo(qualified, 'default')).spec.fields.some(
      (f) => f.name === 'KQ_Note__c',
    ),
    false,
  );
  // Each generated field may be left out on its own, or listed exactly as the org has it.
  for (const name of [
    'cdp_sys_SourceVersion__c',
    'DataSource__c',
    'DataSourceObject__c',
    'InternalOrganization__c',
    'KQ_Id__c',
  ]) {
    const without = document();
    without.spec.fields = without.spec.fields.filter((f) => f.name !== name);
    const only = handWritten([field(name)]);
    for (const input of [without, only]) {
      const plan = await preflightNativeDlo(input, { get: async () => native() }, 'default');
      assert.equal(plan.operation, 'unchanged', name);
    }
  }
});

test('document validation refuses invalid identity, fields, labels and primary-key inventory', () => {
  for (const mutate of [
    (d) => {
      d.c__dataSpace = [' '];
    },
    (d) => {
      d.identity.apiName = 'Example';
    },
    (d) => {
      d.spec.label = 'x'.repeat(41);
    },
    (d) => {
      d.spec.fields.push(structuredClone(d.spec.fields[0]));
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
    },
    (d) => {
      d.spec.fields[1].recordId = 'source';
    },
    (d) => {
      d.id = 'source';
    },
  ]) {
    const saved = document();
    mutate(saved);
    assert.throws(() => validateDloDocument(saved), DloError);
  }
});

test('create selects only authoritative 404, omits generated fields and keeps Id and custom definitions', async () => {
  const plan = await preflightNativeDlo(document(), { get: absent }, 'default');
  assert.equal(plan.operation, 'create');
  assert.equal(plan.targetId, undefined);
  assert.deepEqual(plan.body.dataspaceInfo, [{ name: 'default' }]);
  assert.equal(plan.body.name, 'Example');
  assert.deepEqual(
    plan.body.dataLakeFieldInputRepresentations.map((f) => f.name),
    ['Id', 'Note'],
  );
  assert.equal(plan.body.dataLakeFieldInputRepresentations[1].length, 200);
  for (const error of [
    new Error('404'),
    new DloError('DLO_HTTP_ERROR', 401),
    new DloError('DLO_HTTP_ERROR', 403),
    new DloError('DLO_HTTP_ERROR', 500),
    new DloError('DLO_REQUEST_UNCONFIRMED', 404),
  ]) {
    await assert.rejects(
      preflightNativeDlo(
        document(),
        {
          get: async () => {
            throw error;
          },
        },
        'default',
      ),
      (actual) => actual === error,
    );
  }
});

test('unchanged compares fields by name and retains target generated qualifiers without writes', async () => {
  for (const omitQualifier of [false, true]) {
    const raw = native();
    raw.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
    const saved = normalizeDlo(raw, 'default');
    if (omitQualifier) saved.spec.fields = saved.spec.fields.filter((f) => f.name !== 'KQ_Id__c');
    saved.spec.fields.reverse();
    const before = structuredClone(saved);
    let writes = 0;
    const client = {
      get: async () => raw,
      create: async () => {
        writes++;
        return raw;
      },
      update: async () => {
        writes++;
        return raw;
      },
    };
    const plan = await preflightNativeDlo(saved, client, 'default');
    assert.equal(plan.operation, 'unchanged');
    assert.equal(plan.targetId, targetId);
    assert.equal(Object.hasOwn(plan, 'body'), false);
    const result = await deployNativeDlo(saved, client, 'default');
    assert.equal(result.operation, 'unchanged');
    assert.deepEqual(result.document, normalizeDlo(raw, 'default'));
    assert.deepEqual(saved, before);
    assert.equal(writes, 0);
  }
});

test('update uses target ID, label and ordinary additions only; mutation/removal/category/PK changes refuse', async () => {
  const client = { get: async () => ({ dataLakeObjects: [native()] }) };
  const saved = document();
  saved.spec.label = 'Updated';
  saved.spec.fields.push(field('CustomerId__c'));
  const plan = await preflightNativeDlo(saved, client, 'default');
  assert.equal(plan.targetId, targetId);
  assert.deepEqual(plan.body, {
    label: 'Updated',
    dataLakeFieldInputRepresentations: [{ ...field('CustomerId__c'), name: 'CustomerId' }],
  });
  for (const mutate of [
    (d) => {
      d.spec.fields.splice(1, 1);
    },
    (d) => {
      d.spec.fields[1].label = 'changed';
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
      d.spec.fields[1].isPrimaryKey = true;
    },
    (d) => {
      d.spec.category = 'Profile';
    },
    (d) => {
      d.spec.fields.push(field('KQ_New__c'));
    },
  ]) {
    const saved = document();
    mutate(saved);
    await assert.rejects(preflightNativeDlo(saved, client, 'default'), DloError);
  }
});

test('retrieve/deploy/delete bind exact names and fresh IDs with one write and no retry', async () => {
  const calls = [];
  let deleted = false;
  const client = {
    get: async (name) => {
      calls.push(['get', name]);
      if (deleted) throw new DloError('DLO_HTTP_ERROR', 404);
      return { dataLakeObjects: [native()] };
    },
    update: async (id, body) => {
      calls.push(['update', id, body]);
      return native();
    },
    delete: async (id) => {
      calls.push(['delete', id]);
      deleted = true;
    },
  };
  assert.deepEqual(await retrieveNativeDlo(apiName, client, 'default'), document());
  const changed = document();
  changed.spec.label = 'Updated';
  const deployed = await deployNativeDlo(changed, client, 'default');
  assert.equal(deployed.operation, 'update');
  assert.deepEqual(await deleteNativeDlo(apiName, client, 'default'), {
    apiName,
    targetId,
    dataSpace: 'default',
  });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['get', 'get', 'update', 'get', 'delete', 'get'],
  );
  assert.equal(calls[2][1], targetId);
  await assert.rejects(
    retrieveNativeDlo(
      apiName,
      { get: async () => ({ ...native(), name: 'Other__dll' }) },
      'default',
    ),
    /IDENTITY/,
  );
  let writes = 0;
  deleted = false;
  await assert.rejects(
    deleteNativeDlo(
      apiName,
      {
        ...client,
        delete: async () => {
          writes++;
          throw new Error('timeout');
        },
      },
      'default',
    ),
    /timeout/,
  );
  assert.equal(writes, 1);
  const result = await deployNativeDlo(
    document(),
    { get: absent, create: async () => native() },
    'default',
  );
  assert.equal(result.operation, 'create');
});

test('DLO create/update retain only explicit PROCESSING after validated write responses', async () => {
  for (const operation of ['create', 'update'])
    for (const wrapped of [false, true])
      for (const status of ['PROCESSING', 'ACTIVE', undefined, 'DELETING_OFFCORE', 'processing']) {
        const desired = document();
        desired.spec.label = 'Changed';
        const raw = { ...native(), label: 'Changed', status };
        const response = wrapped ? { dataLakeObjects: [raw] } : raw;
        const client = {
          get: operation === 'create' ? absent : async () => native(),
          create: async () => response,
          update: async () => response,
        };
        const result = await deployNativeDlo(desired, client, 'default');
        const execution = await executeDloDeploy(desired, client, 'default');
        assert.equal(result.serverProcessing, status === 'PROCESSING' ? true : undefined);
        assert.equal(execution.serverProcessing, result.serverProcessing);
        assert.equal(execution.outcome, operation === 'create' ? 'created' : 'updated');
        assert.equal(result.document.spec.status, undefined);
      }
  const unchanged = await executeDloDeploy(
    document(),
    {
      get: async () => ({ ...native(), status: 'PROCESSING' }),
    },
    'default',
  );
  assert.equal(unchanged.outcome, 'unchanged');
  assert.equal(unchanged.serverProcessing, undefined);
  const failed = await executeDloDeploy(
    document(),
    {
      get: absent,
      create: async () => ({ ...native(), status: 'PROCESSING', name: 'Other__dll' }),
    },
    'default',
  );
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.serverProcessing, undefined);
});

test('DLO file lists every data space; the run data space selects, binds create and refuses', async () => {
  const raw = { ...native(), dataSpaceInfo: [{ name: 'other' }] };
  assert.throws(() => normalizeDlo(raw, 'default'), { code: 'UNSUPPORTED_DLO_DATASPACE' });
  const saved = normalizeDlo(raw, 'other');
  assert.deepEqual(saved.c__dataSpace, ['other']);
  const multiple = { ...raw, dataSpaceInfo: [{ name: 'other' }, { name: 'default' }] };
  // Sorted by name, whatever order the org lists them in, read in any of its data spaces.
  assert.deepEqual(normalizeDlo(multiple, 'other').c__dataSpace, ['default', 'other']);
  assert.deepEqual(normalizeDlo(multiple, 'default').c__dataSpace, ['default', 'other']);
  assert.throws(() => normalizeDlo(multiple, 'missing'), /DATASPACE/);
  assert.throws(() => normalizeDlo({ ...raw, dataSpaceInfo: [] }, 'other'), /DATASPACE/);
  const plan = await preflightNativeDlo(saved, { get: absent }, 'other');
  assert.deepEqual(plan.body.dataspaceInfo, [{ name: 'other' }]);
  assert.ok(!Object.hasOwn(plan.body, 'dataSpaceName'));
  const result = await deployNativeDlo(saved, { get: absent, create: async () => raw }, 'other');
  assert.deepEqual(result.document.c__dataSpace, ['other']);
  let writes = 0;
  const client = {
    get: async () => native(),
    update: async () => {
      writes++;
      return raw;
    },
    delete: async () => {
      writes++;
    },
    create: async () => {
      writes++;
      return raw;
    },
  };
  // A file that does not list the run's data space is refused, never filtered out.
  await assert.rejects(deployNativeDlo(saved, client, 'default'), {
    code: 'DLO_DATASPACE_MISMATCH',
  });
  await assert.rejects(deleteNativeDlo(apiName, client, 'other'), {
    code: 'UNSUPPORTED_DLO_DATASPACE',
  });
  await assert.rejects(retrieveNativeDlo(apiName, client, 'other'), {
    code: 'UNSUPPORTED_DLO_DATASPACE',
  });
  assert.equal(writes, 0);
  // The org also lists default, which the file leaves out: removing it needs the flag.
  await assert.rejects(preflightNativeDlo(saved, { get: async () => multiple }, 'other'), {
    code: 'DLO_DATASPACE_REMOVAL_NOT_ALLOWED',
  });
  // A DELETE would remove a DLO from every data space: one in several is never deleted.
  await assert.rejects(
    deleteNativeDlo(apiName, { ...client, get: async () => multiple }, 'other'),
    (error) =>
      error.code === 'DLO_DELETE_OTHER_DATASPACES' &&
      /also belongs to the data space default,/u.test(error.message),
  );
  const three = { ...raw, dataSpaceInfo: [...multiple.dataSpaceInfo, { name: 'third' }] };
  await assert.rejects(
    deleteNativeDlo(apiName, { ...client, get: async () => three }, 'other'),
    (error) => /also belongs to the data spaces default, third,/u.test(error.message),
  );
  assert.equal(writes, 0);
});

test('DLO file key c__dataSpace: legacy key, filter entries, empty and repeated lists are refused', () => {
  const legacy = { ...document(), identity: { apiName, dataSpace: 'default' } };
  delete legacy.c__dataSpace;
  for (const mode of ['deploy', 'retrieve'])
    assert.throws(() => validateDloDocument(legacy, mode), { code: 'LEGACY_DATASPACE_KEY' });
  for (const [list, code] of [
    [
      ['default', { name: 'dataspace2', filter: { conditions: [] } }],
      'UNSUPPORTED_DATASPACE_FILTER',
    ],
    [[], 'INVALID_DATASPACE_FIELD'],
    [['default', 'default'], 'INVALID_DATASPACE_FIELD'],
    ['default', 'INVALID_DATASPACE_FIELD'],
    [[{ name: 'default' }], 'INVALID_DATASPACE_FIELD'],
  ])
    assert.throws(() => validateDloDocument({ ...document(), c__dataSpace: list }), { code });
  const missing = document();
  delete missing.c__dataSpace;
  assert.throws(() => validateDloDocument(missing), { code: 'INVALID_DATASPACE_FIELD' });
});

/**
 * A DLO client whose org membership changes with the member writes it receives.
 * @param {string[]} spaces Data spaces the DLO belongs to at first.
 * @param {object} [options] Overrides (`stuck`: the DLO never lists a changed space).
 * @returns {object} Client plus the recorded writes.
 */
const memberClient = (spaces, options = {}) => {
  const current = new Set(spaces);
  const writes = [];
  const client = {
    get: async () => ({
      ...native(),
      dataSpaceInfo: [...(options.stuck ? spaces : current)].map((name) => ({ name })),
    }),
    create: async (body) => {
      writes.push(['POST', body.dataspaceInfo]);
      for (const { name } of body.dataspaceInfo) current.add(name);
      return { ...native(), status: 'PROCESSING', dataSpaceInfo: body.dataspaceInfo };
    },
    update: async (id, body) => {
      writes.push(['PATCH', body]);
      return native();
    },
    putMembers: async (space, names) => {
      writes.push(['PUT', space, names]);
      current.add(space);
      return { success: 'true', errors: [], dataSpaceMembers: { members: [] } };
    },
    removeMember: async (space, name) => {
      writes.push(['DELETE', space, name]);
      current.delete(space);
      return { results: [{ dataSpaceMemberName: name, errors: {}, success: true }] };
    },
  };
  return { client, writes };
};

test('a data space the file adds gets one PUT naming only this DLO, then settles', async () => {
  const file = { ...document(), c__dataSpace: ['default', 'dataspace2'] };
  const { client, writes } = memberClient(['default']);
  const plan = await preflightNativeDlo(file, client, 'default');
  assert.equal(plan.operation, 'update');
  assert.equal(plan.body, undefined);
  assert.deepEqual(plan.membership, { add: ['dataspace2'], remove: [] });
  assert.deepEqual(writes, []);
  const result = await executeDloDeploy(file, client, 'default');
  assert.equal(result.outcome, 'updated');
  assert.equal(result.mutation, 'confirmed-updated');
  assert.deepEqual(result.dataSpaces, ['dataspace2', 'default']);
  // The executed item names the data space changes like the preview item.
  assert.deepEqual(result.dataSpaceChanges, { add: ['dataspace2'], remove: [] });
  assert.deepEqual(writes, [['PUT', 'dataspace2', [apiName]]]);
  // Once added, the same file is unchanged.
  const again = memberClient(['default', 'dataspace2']);
  const unchanged = await executeDloDeploy(file, again.client, 'default');
  assert.equal(unchanged.outcome, 'unchanged');
  assert.equal(unchanged.dataSpaceChanges, undefined);
  assert.deepEqual(again.writes, []);
});

test('a DLO created with several data spaces is created in the run data space, then added', async () => {
  const file = { ...document(), c__dataSpace: ['dataspace2', 'default'] };
  const { client, writes } = memberClient([]);
  client.get = (() => {
    let created = false;
    const read = client.get;
    return async () => {
      if (!created && !writes.some(([method]) => method === 'POST'))
        throw new DloError('DLO_HTTP_ERROR', 404);
      created = true;
      return read();
    };
  })();
  const preview = await preflightDloDeploy(file, client, 'default');
  assert.equal(preview.outcome, 'create');
  assert.deepEqual(preview.dataSpaceChanges, { add: ['dataspace2'], remove: [] });
  const result = await executeDloDeploy(file, client, 'default');
  assert.equal(result.outcome, 'created');
  assert.deepEqual(result.dataSpaces, ['dataspace2', 'default']);
  assert.deepEqual(writes, [
    ['POST', [{ name: 'default' }]],
    ['PUT', 'dataspace2', [apiName]],
  ]);
});

test('the default data space takes a DLO: no member list is read, only the DLO is sent', async () => {
  // Live, default states 99 members and lists 98; the PUT only adds (proven on a custom data
  // space), so nothing is read first and default is not refused.
  const file = { ...document(), c__dataSpace: ['dataspace2', 'default'] };
  const { client, writes } = memberClient(['dataspace2']);
  assert.equal(client.members, undefined);
  const result = await executeDloDeploy(file, client, 'dataspace2');
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(writes, [['PUT', 'default', [apiName]]]);
});

test('a member write Salesforce answers without success is rejected', async () => {
  const file = { ...document(), c__dataSpace: ['default', 'dataspace2'] };
  const { client } = memberClient(['default']);
  client.putMembers = async () => {
    throw new DloError('DLO_MEMBERSHIP_UPDATE_REJECTED');
  };
  const result = await executeDloDeploy(file, client, 'default');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'DLO_MEMBERSHIP_UPDATE_REJECTED');
  for (const [method, answer] of [
    ['PUT', { success: 'false', errors: [{ message: 'no' }] }],
    ['PUT', { success: 'true', errors: [{ message: 'no' }] }],
    ['PUT', {}],
    ['DELETE', { results: [{ success: false, errors: { message: 'no' } }] }],
    ['DELETE', { results: [] }],
  ]) {
    const rest = createDloClient('target', '68.0', { request: async () => answer });
    await assert.rejects(
      method === 'PUT'
        ? rest.putMembers('dataspace2', [apiName])
        : rest.removeMember('dataspace2', apiName),
      { code: 'DLO_MEMBERSHIP_UPDATE_REJECTED' },
    );
  }
});

test('a membership with more than a name and label is not modelled', () => {
  const raw = {
    ...native(),
    dataSpaceInfo: [{ name: 'default', label: 'default', filter: { conditions: [] } }],
  };
  assert.throws(() => normalizeDlo(raw, 'default', 'retrieve'), {
    code: 'UNSUPPORTED_DLO_MEMBERSHIP',
  });
});

test('a data space the file drops is removed only with allowDataspaceRemoval', async () => {
  const file = document();
  const blocked = memberClient(['default', 'dataspace2']);
  const refused = await executeDloDeploy(file, blocked.client, 'default');
  assert.equal(refused.outcome, 'blocked');
  assert.equal(refused.diagnostics[0].code, 'DLO_DATASPACE_REMOVAL_NOT_ALLOWED');
  assert.match(refused.diagnostics[0].message, /dataspace2/u);
  assert.deepEqual(blocked.writes, []);
  const allowed = memberClient(['default', 'dataspace2']);
  const preview = await preflightDloDeploy(file, allowed.client, 'default', {
    allowDataspaceRemoval: true,
  });
  assert.deepEqual(preview.dataSpaceChanges, { add: [], remove: ['dataspace2'] });
  const result = await executeDloDeploy(file, allowed.client, 'default', {
    allowDataspaceRemoval: true,
  });
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(result.dataSpaces, ['default']);
  assert.deepEqual(result.dataSpaceChanges, { add: [], remove: ['dataspace2'] });
  assert.deepEqual(allowed.writes, [['DELETE', 'dataspace2', apiName]]);
});

test('a data space change the DLO never reflects is unconfirmed, not success', async () => {
  const file = { ...document(), c__dataSpace: ['default', 'dataspace2'] };
  const { client, writes } = memberClient(['default'], { stuck: true });
  const result = await executeDloDeploy(file, client, 'default');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'DLO_DATASPACE_NOT_SETTLED');
  assert.equal(writes.length, 1);
});

test('REST sends the data space member routes with the proven shapes', async () => {
  const requests = [];
  const client = createDloClient('target', '61.0', {
    request: async (method, route, noContent, body) => {
      requests.push({ method, route, body });
      return method === 'PUT'
        ? { success: 'true', errors: [] }
        : method === 'DELETE'
          ? { results: [{ success: true, errors: {} }] }
          : {};
    },
  });
  assert.equal(client.members, undefined);
  await client.putMembers('dataspace2', ['A__dll', apiName]);
  await client.removeMember('dataspace2', apiName);
  const endpoint = '/services/data/v68.0/ssot/data-spaces/dataspace2/members';
  assert.deepEqual(requests, [
    {
      method: 'PUT',
      route: endpoint,
      body: { members: { members: [{ memberName: 'A__dll' }, { memberName: apiName }] } },
    },
    { method: 'DELETE', route: `${endpoint}?memberNames=${apiName}`, body: undefined },
  ]);
  await assert.rejects(client.putMembers('dataspace2', []), { code: 'INVALID_DLO_NAME' });
  await assert.rejects(client.putMembers(' bad', [apiName]), { code: 'UNSUPPORTED_DLO_DATASPACE' });
});

test('REST sends each call once over the bound sender with exact routes and JSON bodies', async () => {
  const requests = [];
  const client = createDloClient('target', '68.0', {
    request: async (method, route, noContent, body) => {
      requests.push({ method, route, body });
      if (method === 'DELETE') return noContent;
      return method === 'GET' ? { dataLakeObjects: [native()] } : native();
    },
  });
  assert.deepEqual(await client.get(apiName), { dataLakeObjects: [native()] });
  await client.create({ name: 'Example' });
  await client.update(targetId, { label: 'Changed' });
  await client.delete(targetId);
  const endpoint = '/services/data/v68.0/ssot/data-lake-objects';
  assert.deepEqual(requests, [
    { method: 'GET', route: `${endpoint}/${apiName}`, body: undefined },
    { method: 'POST', route: endpoint, body: { name: 'Example' } },
    { method: 'PATCH', route: `${endpoint}/${targetId}`, body: { label: 'Changed' } },
    { method: 'DELETE', route: `${endpoint}/${targetId}`, body: undefined },
  ]);
  assert.doesNotThrow(() => createDloClient('target', '67.0'));
  assert.throws(() => createDloClient('target', '60.0'), /INVALID_SCOPE/);
  await assert.rejects(client.delete('../unsafe'), /TARGET_ID/);
});

test('REST never treats an unconfirmed or malformed answer as absence', async () => {
  const empty = Symbol('empty');
  for (const answer of [new ConnectError('REQUEST_FAILED'), 'invalid', [], empty]) {
    const client = createDloClient('target', '68.0', {
      request: async (method, route, noContent) => {
        if (answer instanceof Error) throw answer;
        return answer === empty ? noContent : answer;
      },
    });
    await assert.rejects(
      preflightNativeDlo(document(), client, 'default'),
      (error) => error instanceof DloError && error.code !== 'DLO_HTTP_ERROR',
    );
  }
  // A DELETE answered with a body is not the HTTP 204 acknowledgement.
  await assert.rejects(
    createDloClient('target', '68.0', { request: async () => ({}) }).delete(targetId),
    { code: 'DLO_DELETE_UNCONFIRMED' },
  );
  const client = createDloClient('target', '68.0', {
    request: async () => {
      throw new ConnectError('REQUEST_FAILED', 404);
    },
  });
  const plan = await preflightNativeDlo(document(), client, 'default');
  assert.equal(plan.operation, 'create');
  await assert.rejects(
    client.get(apiName),
    (error) => error.status === 404 && error.code === 'DLO_HTTP_ERROR',
  );
});

// Engagement DLOs carry an event field; Salesforce adds cdp_sys_PartitionDate__c with it.
const engagement = () => {
  const raw = native();
  raw.category = 'Engagement';
  raw.eventDateTimeFieldName = 'EventAt__c';
  raw.dataLakeFieldInfoRepresentation.push(
    { ...field('EventAt__c'), dataType: 'DateTime' },
    { ...field('cdp_sys_PartitionDate__c'), dataType: 'DateTime' },
  );
  return raw;
};

test('create sends any category as authored, and the event field of an Engagement DLO', async () => {
  for (const category of ['Profile', 'Insights', 'Content']) {
    const file = document();
    file.spec.category = category;
    const plan = await preflightNativeDlo(file, { get: absent }, 'default');
    assert.equal(plan.body.category, category);
    assert.equal(plan.body.eventDateTimeFieldName, undefined);
  }
  const file = normalizeDlo(engagement(), 'default');
  assert.equal(file.spec.eventDateTimeFieldName, 'EventAt__c');
  const plan = await preflightNativeDlo(file, { get: absent }, 'default');
  assert.equal(plan.body.category, 'Engagement');
  assert.equal(plan.body.eventDateTimeFieldName, 'EventAt');
  // The generated partition field is never sent.
  assert.deepEqual(
    plan.body.dataLakeFieldInputRepresentations.map((entry) => entry.name),
    ['Id', 'Note', 'EventAt'],
  );
});

test('the event field must be a listed field and cannot change after create', async () => {
  const file = normalizeDlo(engagement(), 'default');
  assert.throws(
    () =>
      validateDloDocument({
        ...file,
        spec: { ...file.spec, eventDateTimeFieldName: 'Missing__c' },
      }),
    /INVALID_DLO_DOCUMENT/u,
  );
  assert.throws(
    () =>
      validateDloDocument({ ...file, spec: { ...file.spec, eventDateTimeFieldName: 'bad name' } }),
    /INVALID_DLO_DOCUMENT/u,
  );
  const target = { get: async () => engagement() };
  // Unchanged, also when the file omits the generated partition field.
  const omitted = structuredClone(file);
  omitted.spec.fields = omitted.spec.fields.filter(
    (entry) => entry.name !== 'cdp_sys_PartitionDate__c',
  );
  const unchanged = await preflightNativeDlo(omitted, target, 'default');
  assert.equal(unchanged.operation, 'unchanged');
  const moved = structuredClone(file);
  moved.spec.fields.push({ ...field('OtherAt__c'), dataType: 'DateTime' });
  moved.spec.eventDateTimeFieldName = 'OtherAt__c';
  await assert.rejects(
    preflightNativeDlo(moved, target, 'default'),
    (error) => error.code === 'UNSUPPORTED_DLO_EVENT_FIELD_CHANGE',
  );
});

test('the event field matches a listed field exactly, round-trips through the writer, and is managed only when listed', async () => {
  const file = normalizeDlo(engagement(), 'default');
  assert.throws(
    () =>
      validateDloDocument({
        ...file,
        spec: { ...file.spec, eventDateTimeFieldName: 'eventat__c' },
      }),
    /INVALID_DLO_DOCUMENT/u,
  );
  // The writer saves the key and the deploy reader admits it unchanged.
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-dlo-event-'));
  const saved = await writeDloDocument(normalizeDlo(engagement(), 'default'), root, false);
  const reread = JSON.parse(await readFile(saved.path, 'utf8'));
  assert.equal(reread.spec.eventDateTimeFieldName, 'EventAt__c');
  assert.deepEqual(validateDloDocument(reread), reread);
  // A file without the key does not manage it: the target's event field stays as it is.
  const unmanaged = structuredClone(file);
  delete unmanaged.spec.eventDateTimeFieldName;
  const plan = await preflightNativeDlo(unmanaged, { get: async () => engagement() }, 'default');
  assert.equal(plan.operation, 'unchanged');
  // Create without the key sends none, whatever the category; with it, any category sends it.
  const bare = structuredClone(unmanaged);
  const create = await preflightNativeDlo(bare, { get: absent }, 'default');
  assert.equal(create.body.category, 'Engagement');
  assert.equal(Object.hasOwn(create.body, 'eventDateTimeFieldName'), false);
  const other = structuredClone(file);
  other.spec.category = 'Other';
  const sent = await preflightNativeDlo(other, { get: absent }, 'default');
  assert.equal(sent.body.eventDateTimeFieldName, 'EventAt');
});

// The record-modified field (live API 68): POST and a PATCH of a DLO without one set it; a PATCH
// naming any value while the DLO has one is answered with HTTP 400.
const recordModified = () => {
  const raw = native();
  raw.recordModifiedFieldName = 'ModAt__c';
  raw.dataLakeFieldInfoRepresentation.push({ ...field('ModAt__c'), dataType: 'DateTime' });
  return raw;
};

test('the record-modified field is retrieved, created, compared and sent only when it differs', async () => {
  // Retrieve keeps it, and keeps the field it names; the writer and the deploy reader agree.
  const file = normalizeDlo(recordModified(), 'default');
  assert.equal(file.spec.recordModifiedFieldName, 'ModAt__c');
  assert.equal(
    leanDloDocument(file).spec.fields.some((f) => f.name === 'ModAt__c'),
    true,
  );
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-dlo-modified-'));
  const saved = await writeDloDocument(file, root, false);
  const reread = JSON.parse(await readFile(saved.path, 'utf8'));
  assert.equal(reread.spec.recordModifiedFieldName, 'ModAt__c');
  assert.deepEqual(validateDloDocument(reread), reread);
  for (const bad of ['ModAt', 'bad name', 7])
    assert.throws(
      () => validateDloDocument({ ...file, spec: { ...file.spec, recordModifiedFieldName: bad } }),
      (error) =>
        error.code === 'INVALID_DLO_DOCUMENT' &&
        /spec.recordModifiedFieldName/u.test(error.message),
    );
  // Create sends the bare name.
  const create = await preflightNativeDlo(reread, { get: absent }, 'default');
  assert.equal(create.body.recordModifiedFieldName, 'ModAt');
  // The same value is unchanged; a file without the key leaves the org's value alone.
  const same = await preflightNativeDlo(reread, { get: async () => recordModified() }, 'default');
  assert.equal(same.operation, 'unchanged');
  const unmanaged = structuredClone(reread);
  delete unmanaged.spec.recordModifiedFieldName;
  const left = await preflightNativeDlo(
    unmanaged,
    { get: async () => recordModified() },
    'default',
  );
  assert.equal(left.operation, 'unchanged');
  // A DLO without one gets it by PATCH; a different value is sent too, for Salesforce to answer.
  const without = native();
  without.dataLakeFieldInfoRepresentation.push({ ...field('ModAt__c'), dataType: 'DateTime' });
  const set = await preflightNativeDlo(reread, { get: async () => without }, 'default');
  assert.deepEqual(set.body, { label: 'Example', recordModifiedFieldName: 'ModAt' });
  const moved = structuredClone(reread);
  moved.spec.fields.push({ ...field('ModAt2__c'), dataType: 'DateTime' });
  moved.spec.recordModifiedFieldName = 'ModAt2__c';
  const changed = await preflightNativeDlo(moved, { get: async () => recordModified() }, 'default');
  assert.equal(changed.operation, 'update');
  assert.equal(changed.body.recordModifiedFieldName, 'ModAt2');
  // Server-owned keys of the read stay out of the file and are refused in it.
  const raw = recordModified();
  raw.capabilities = {};
  raw.columnMappingProperties = {};
  raw.totalRecords = 3;
  assert.equal(Object.hasOwn(normalizeDlo(raw, 'default').spec, 'capabilities'), false);
  assert.throws(
    () => validateDloDocument({ ...file, spec: { ...file.spec, capabilities: {} } }),
    /INVALID_DLO_DOCUMENT/u,
  );
});

test('a file holding an HTML-escaped copy of the org text is refused before any write', async () => {
  const target = native();
  target.label = `Example & "quoted"`;
  target.dataLakeFieldInfoRepresentation[1].description = "Portable & 'definition'";
  const escaped = normalizeDlo(target, 'default');
  escaped.spec.fields.find((f) => f.name === 'Note__c').description =
    'Portable &amp; &#39;definition&#39;';
  await assert.rejects(
    preflightNativeDlo(escaped, { get: async () => target }, 'default'),
    (error) => {
      assert.equal(error.code, 'HTML_ESCAPED_FILE');
      assert.match(error.message, /HTML-escaped text at spec\.fields\[\d+\]\.description/u);
      return true;
    },
  );
  const label = normalizeDlo(target, 'default');
  label.spec.label = 'Example &amp; &quot;quoted&quot;';
  await assert.rejects(
    preflightNativeDlo(label, { get: async () => target }, 'default'),
    /HTML_ESCAPED_FILE/u,
  );
  // An entity Salesforce stores itself reads back as stored and compares equal.
  const literal = native();
  literal.label = 'AT&amp;T';
  const plan = await preflightNativeDlo(
    normalizeDlo(literal, 'default'),
    { get: async () => literal },
    'default',
  );
  assert.equal(plan.operation, 'unchanged');
});
