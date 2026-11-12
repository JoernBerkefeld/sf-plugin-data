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
  normalizeDlo,
  validateDloDocument,
} from '../lib/artifacts/dlo-document.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import {
  deleteNativeDlo,
  deployNativeDlo,
  preflightNativeDlo,
  retrieveNativeDlo,
} from '../lib/services/native-dlo.js';

import { executeDloDeploy } from '../lib/services/command-dlo.js';

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
const document = () => normalizeDlo(native());
const systemNames = [
  'cdp_sys_SourceVersion__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
];
const absent = () => {
  throw new DloError('DLO_HTTP_ERROR', 404);
};
const http = (status, body) => ({
  exitCode: status >= 400 ? 1 : 0,
  stdout: `HTTP/1.1 ${status}\ncontent-type: application/json\nx-request-id: receipt\n${body === undefined ? '' : JSON.stringify(body)}`,
});

test('normalizes GET and write shapes, preserving all fields but not runtime/wrappers', () => {
  const raw = native();
  raw.fields = structuredClone(raw.dataLakeFieldInfoRepresentation);
  raw.dataLakeFieldInfoRepresentation[0].recordID = 'source';
  const saved = normalizeDlo({ dataLakeObjects: [raw] });
  assert.equal(saved.spec.fields.length, 7);
  assert.equal(saved.spec.fields[1].length, 200);
  assert.equal(saved.spec.fields[1].description, 'Portable definition');
  assert.equal(saved.spec.fields[0].recordID, undefined);
  assert.equal(saved.id, undefined);
  assert.equal(saved.spec.status, undefined);
  assert.deepEqual(saved, normalizeDlo(raw));
  assert.throws(() => normalizeDlo({ dataLakeObjects: [raw, raw] }), /AMBIGUOUS/);
  assert.equal(
    normalizeDlo({ ...raw, dataSpaceInfo: [{ name: 'other' }] }).identity.dataSpace,
    'other',
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
    const normalized = normalizeDlo(raw);
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
    const create = await preflightNativeDlo(saved, { get: absent });
    assert.deepEqual(
      create.body.dataLakeFieldInputRepresentations.map((f) => f.name),
      added ? ['Id', 'Note', 'UpdateNote'] : ['Id', 'Note'],
    );
    let writes = 0;
    const target = native();
    target.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
    const result = await deployNativeDlo(saved, {
      get: async () => target,
      update: async (_id, body) => {
        writes++;
        assert.equal(body.dataLakeFieldInputRepresentations?.length ?? 0, added ? 1 : 0);
        return raw;
      },
    });
    assert.equal(writes, added ? 1 : 0);
    assert.equal(result.operation, added ? 'update' : 'unchanged');
    assert.equal(result.document.spec.fields.length, added ? 8 : 7);
    const created = await deployNativeDlo(saved, { get: absent, create: async () => raw });
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
        preflightNativeDlo(missing, { get: async () => target }),
        /FIELD_CHANGE/,
      );
  }
  for (const name of ['Note__c', 'DataSource__c', 'KQ_Id__c']) {
    const changed = document();
    changed.spec.fields.find((f) => f.name === name).label = 'Changed';
    await assert.rejects(
      preflightNativeDlo(changed, { get: async () => native() }),
      /FIELD_CHANGE/,
    );
    if (name === 'KQ_Id__c') continue;
    changed.spec.fields = document().spec.fields.filter((f) => f.name !== name);
    // An omitted authored field is a removal; an omitted system field stays as the org has it.
    if (name === 'Note__c')
      await assert.rejects(
        preflightNativeDlo(changed, { get: async () => native() }),
        /FIELD_CHANGE/,
      );
    else {
      const kept = await preflightNativeDlo(changed, { get: async () => native() });
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
  const plan = await preflightNativeDlo(input, client);
  assert.equal(plan.operation, 'unchanged');
  assert.equal(plan.targetId, targetId);
  assert.equal(Object.hasOwn(plan, 'body'), false);
  const result = await deployNativeDlo(input, client);
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
  const deployed = await deployNativeDlo(added, {
    get: async () => native(),
    create: async () => assert.fail('no POST expected'),
    update: async (id, body) => {
      updates.push([id, body]);
      return after;
    },
  });
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
    const plan = await preflightNativeDlo(input, client);
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
    await assert.rejects(preflightNativeDlo(input, client), refusedChange);
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
    'omitted qualifier of a non-key field': (_input, raw) => {
      raw.dataLakeFieldInfoRepresentation.push(field('KQ_Note__c'));
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
    await assert.rejects(preflightNativeDlo(input, client), refusedChange, name);
    await assert.rejects(deployNativeDlo(input, client), refusedChange, name);
    assert.equal(writes, 0, name);
  }
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
      const plan = await preflightNativeDlo(input, { get: async () => native() });
      assert.equal(plan.operation, 'unchanged', name);
    }
  }
});

test('document validation refuses invalid identity, fields, labels and primary-key inventory', () => {
  for (const mutate of [
    (d) => {
      d.identity.dataSpace = ' ';
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
  const plan = await preflightNativeDlo(document(), { get: absent });
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
      preflightNativeDlo(document(), {
        get: async () => {
          throw error;
        },
      }),
      (actual) => actual === error,
    );
  }
});

test('unchanged compares fields by name and retains target generated qualifiers without writes', async () => {
  for (const omitQualifier of [false, true]) {
    const raw = native();
    raw.dataLakeFieldInfoRepresentation[0].keyQualifierName = 'KQ_Id';
    const saved = normalizeDlo(raw);
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
    const plan = await preflightNativeDlo(saved, client);
    assert.equal(plan.operation, 'unchanged');
    assert.equal(plan.targetId, targetId);
    assert.equal(Object.hasOwn(plan, 'body'), false);
    const result = await deployNativeDlo(saved, client);
    assert.equal(result.operation, 'unchanged');
    assert.deepEqual(result.document, normalizeDlo(raw));
    assert.deepEqual(saved, before);
    assert.equal(writes, 0);
  }
});

test('update uses target ID, label and ordinary additions only; mutation/removal/category/PK changes refuse', async () => {
  const client = { get: async () => ({ dataLakeObjects: [native()] }) };
  const saved = document();
  saved.spec.label = 'Updated';
  saved.spec.fields.push(field('CustomerId__c'));
  const plan = await preflightNativeDlo(saved, client);
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
    await assert.rejects(preflightNativeDlo(saved, client), DloError);
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
  assert.deepEqual(await retrieveNativeDlo(apiName, client), document());
  const changed = document();
  changed.spec.label = 'Updated';
  const deployed = await deployNativeDlo(changed, client);
  assert.equal(deployed.operation, 'update');
  assert.deepEqual(await deleteNativeDlo(apiName, client), {
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
    retrieveNativeDlo(apiName, { get: async () => ({ ...native(), name: 'Other__dll' }) }),
    /IDENTITY/,
  );
  let writes = 0;
  deleted = false;
  await assert.rejects(
    deleteNativeDlo(apiName, {
      ...client,
      delete: async () => {
        writes++;
        throw new Error('timeout');
      },
    }),
    /timeout/,
  );
  assert.equal(writes, 1);
  const result = await deployNativeDlo(document(), { get: absent, create: async () => native() });
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
        const result = await deployNativeDlo(desired, client);
        const execution = await executeDloDeploy(desired, client);
        assert.equal(result.serverProcessing, status === 'PROCESSING' ? true : undefined);
        assert.equal(execution.serverProcessing, result.serverProcessing);
        assert.equal(execution.outcome, operation === 'create' ? 'created' : 'updated');
        assert.equal(result.document.spec.status, undefined);
      }
  const unchanged = await executeDloDeploy(document(), {
    get: async () => ({ ...native(), status: 'PROCESSING' }),
  });
  assert.equal(unchanged.outcome, 'unchanged');
  assert.equal(unchanged.serverProcessing, undefined);
  const failed = await executeDloDeploy(document(), {
    get: absent,
    create: async () => ({ ...native(), status: 'PROCESSING', name: 'Other__dll' }),
  });
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.serverProcessing, undefined);
});

test('DLO concrete membership binding, required create scope and collision refusal', async () => {
  const raw = { ...native(), dataSpaceInfo: [{ name: 'other' }] };
  const saved = normalizeDlo(raw);
  assert.equal(saved.identity.dataSpace, 'other');
  const multiple = { ...raw, dataSpaceInfo: [{ name: 'default' }, { name: 'other' }] };
  assert.throws(() => normalizeDlo(multiple), /DATASPACE/);
  assert.equal(normalizeDlo(multiple, 'other').identity.dataSpace, 'other');
  assert.throws(() => normalizeDlo(multiple, 'missing'), /DATASPACE/);
  assert.throws(() => normalizeDlo({ ...raw, dataSpaceInfo: [] }), /DATASPACE/);
  for (const scope of [undefined, 'other']) {
    const plan = await preflightNativeDlo(saved, { get: absent }, scope);
    assert.deepEqual(plan.body.dataspaceInfo, [{ name: 'other' }]);
    assert.ok(!Object.hasOwn(plan.body, 'dataSpaceName'));
    const result = await deployNativeDlo(saved, { get: absent, create: async () => raw }, scope);
    assert.equal(result.document.identity.dataSpace, 'other');
  }
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
  await assert.rejects(deployNativeDlo(saved, client), /DATASPACE/);
  await assert.rejects(deployNativeDlo(saved, client, 'default'), /DATASPACE/);
  await assert.rejects(deleteNativeDlo(apiName, client, 'other'), /DATASPACE/);
  await assert.rejects(retrieveNativeDlo(apiName, client, 'other'), /DATASPACE/);
  assert.equal(writes, 0);
  const multiplePlan = await preflightNativeDlo(saved, { get: async () => multiple }, 'other');
  assert.equal(multiplePlan.operation, 'unchanged');
  await assert.rejects(
    deployNativeDlo(saved, { get: absent, create: async () => native() }, 'other'),
    /DATASPACE/,
  );
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dlo-space-collision-'));
  const receipt = await writeDloDocument(document(), cwd, false);
  const bytes = await readFile(receipt.path);
  for (const overwrite of [false, true])
    await assert.rejects(writeDloDocument(saved, cwd, overwrite), /DATASPACE_COLLISION/);
  assert.deepEqual(await readFile(receipt.path), bytes);
});

test('REST parses receipt-proven raw status/body shapes and corrected empty DELETE request', async () => {
  const requests = [];
  const client = createDloClient('target', '68.0', async (arguments_, cwd) => {
    assert.ok(arguments_.includes('--include'));
    assert.ok(!arguments_.includes('--json'));
    assert.equal(arguments_[arguments_.indexOf('--target-org') + 1], 'target');
    const file = arguments_.indexOf('--file');
    if (file !== -1) {
      const request = JSON.parse(await readFile(arguments_[file + 1], 'utf8'));
      requests.push(request);
      assert.deepEqual(request, {
        url: `/services/data/v68.0/ssot/data-lake-objects/${targetId}`,
        method: 'DELETE',
        body: { mode: 'raw', raw: '' },
      });
      return http(204);
    }
    const method = arguments_[arguments_.indexOf('--method') + 1];
    const body = arguments_.indexOf('--body');
    if (body !== -1)
      requests.push(JSON.parse(await readFile(arguments_[body + 1].slice(1), 'utf8')));
    assert.ok(cwd.toLowerCase().startsWith(String.raw`f:\temp\data360-native-dlo-`));
    return http(
      method === 'POST' ? 201 : 200,
      method === 'GET' ? { dataLakeObjects: [native()] } : native(),
    );
  });
  assert.deepEqual(await client.get(apiName), { dataLakeObjects: [native()] });
  await client.create({ name: 'Example' });
  await client.update(targetId, { label: 'Changed' });
  await client.delete(targetId);
  assert.equal(requests.length, 3);
  assert.doesNotThrow(() => createDloClient('target', '67.0'));
  assert.throws(() => createDloClient('target', '60.0'), /INVALID_SCOPE/);
  await assert.rejects(client.delete('../unsafe'), /TARGET_ID/);
});

test('REST never treats generic CLI errors or malformed success as absence', async () => {
  for (const receipt of [
    { exitCode: 1, stdout: JSON.stringify({ status: 1, message: '404' }) },
    { exitCode: 0, stdout: 'not HTTP' },
    { exitCode: 0, stdout: 'HTTP/1.1 200\ncontent-type: application/json\ninvalid' },
    { ...http(200, native()), exitCode: 1 },
  ]) {
    const client = createDloClient('target', '68.0', async () => receipt);
    await assert.rejects(
      preflightNativeDlo(document(), client),
      (error) => error instanceof DloError && error.code !== 'DLO_HTTP_ERROR',
    );
  }
  const client = createDloClient('target', '68.0', async () =>
    http(404, [
      { errorCode: 'INVALID_INPUT', message: 'valid recordId or developerName required' },
    ]),
  );
  const plan = await preflightNativeDlo(document(), client);
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
    const plan = await preflightNativeDlo(file, { get: absent });
    assert.equal(plan.body.category, category);
    assert.equal(plan.body.eventDateTimeFieldName, undefined);
  }
  const file = normalizeDlo(engagement());
  assert.equal(file.spec.eventDateTimeFieldName, 'EventAt__c');
  const plan = await preflightNativeDlo(file, { get: absent });
  assert.equal(plan.body.category, 'Engagement');
  assert.equal(plan.body.eventDateTimeFieldName, 'EventAt');
  // The generated partition field is never sent.
  assert.deepEqual(
    plan.body.dataLakeFieldInputRepresentations.map((entry) => entry.name),
    ['Id', 'Note', 'EventAt'],
  );
});

test('the event field must be a listed field and cannot change after create', async () => {
  const file = normalizeDlo(engagement());
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
  const unchanged = await preflightNativeDlo(omitted, target);
  assert.equal(unchanged.operation, 'unchanged');
  const moved = structuredClone(file);
  moved.spec.fields.push({ ...field('OtherAt__c'), dataType: 'DateTime' });
  moved.spec.eventDateTimeFieldName = 'OtherAt__c';
  await assert.rejects(
    preflightNativeDlo(moved, target),
    (error) => error.code === 'UNSUPPORTED_DLO_EVENT_FIELD_CHANGE',
  );
});

test('the event field matches a listed field exactly, round-trips through the writer, and is managed only when listed', async () => {
  const file = normalizeDlo(engagement());
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
  const saved = await writeDloDocument(normalizeDlo(engagement()), root, false);
  const reread = JSON.parse(await readFile(saved.path, 'utf8'));
  assert.equal(reread.spec.eventDateTimeFieldName, 'EventAt__c');
  assert.deepEqual(validateDloDocument(reread), reread);
  // A file without the key does not manage it: the target's event field stays as it is.
  const unmanaged = structuredClone(file);
  delete unmanaged.spec.eventDateTimeFieldName;
  const plan = await preflightNativeDlo(unmanaged, { get: async () => engagement() });
  assert.equal(plan.operation, 'unchanged');
  // Create without the key sends none, whatever the category; with it, any category sends it.
  const bare = structuredClone(unmanaged);
  const create = await preflightNativeDlo(bare, { get: absent });
  assert.equal(create.body.category, 'Engagement');
  assert.equal(Object.hasOwn(create.body, 'eventDateTimeFieldName'), false);
  const other = structuredClone(file);
  other.spec.category = 'Other';
  const sent = await preflightNativeDlo(other, { get: absent });
  assert.equal(sent.body.eventDateTimeFieldName, 'EventAt');
});
