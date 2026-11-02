import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('native DMO validation fails closed on identity, runtime fields, primary keys and malformed output', () => {
  for (const mutate of [
    (d) => {
      d.id = 'source';
    },
    (d) => {
      d.identity.apiName = resourceId;
    },
    (d) => {
      d.identity.dataSpace = 'other';
    },
    (d) => {
      d.spec.label = 'x'.repeat(41);
    },
    (d) => {
      d.spec.category = 'OTHER';
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
      d.spec.fields[1].type = 'Text';
    },
  ]) {
    const saved = document();
    mutate(saved);
    assert.throws(() => validateNativeDmoDocument(saved), NativeDmoError);
  }
  for (const raw of [
    { ...native(), dataSpaceName: 'other' },
    { ...native(), fields: [{ ...field('Id__c', true), type: undefined }] },
    { ...native(), fields: [{ ...field('Id__c', true), dataType: 'Number' }] },
    { ...native(), fields: [{ ...field('Id__c', true), isPrimaryKey: 'true' }] },
  ])
    assert.throws(() => normalizeNativeDmo(raw), NativeDmoError);
});

test('native DMO create uses bare names, Other, default and only authored Text input', async () => {
  const plan = await preflightNativeDmo(document(), { get: absent });
  assert.deepEqual(plan, {
    operation: 'create',
    apiName,
    body: {
      name: 'Example',
      label: 'Example',
      category: 'Other',
      dataSpaceName: 'default',
      fields: [
        { name: 'Id', label: 'Id', dataType: 'Text', isPrimaryKey: true, isDynamicLookup: false },
        {
          name: 'Note',
          label: 'Note',
          dataType: 'Text',
          isPrimaryKey: false,
          isDynamicLookup: false,
        },
      ],
    },
  });
  assert.ok(!JSON.stringify(plan).includes(resourceId));
  const saved = document();
  saved.spec.fields.push(authored('cdp_sys_SourceVersion__c'));
  const sourceVersionPlan = await preflightNativeDmo(saved, { get: absent });
  assert.ok(sourceVersionPlan.body.fields.some((f) => f.name === 'cdp_sys_SourceVersion'));
  for (const change of [
    (d) => {
      d.spec.fields[1].dataType = 'Number';
    },
    (d) => {
      d.spec.fields[1].isDynamicLookup = true;
    },
    (d) => {
      d.spec.fields[1].length = 200;
    },
    (d) => {
      d.spec.fields[1].isDistinct = true;
    },
    (d) => {
      d.spec.fields[0].keyQualifierName = 'Other';
    },
  ]) {
    const saved = document();
    change(saved);
    await assert.rejects(preflightNativeDmo(saved, { get: absent }), /FIELD_INPUT/);
  }
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

test('native DMO update preserves every old field and key and admits only label/new nonprimary Text', async () => {
  const saved = document();
  saved.spec.label = 'Changed';
  saved.spec.fields.push(authored('Extra__c'));
  assert.deepEqual(await preflightNativeDmo(saved, { get: async () => native() }), {
    operation: 'update',
    apiName,
    targetApiName: apiName,
    body: {
      label: 'Changed',
      fields: [
        {
          name: 'Extra',
          label: 'Extra',
          dataType: 'Text',
          isPrimaryKey: false,
          isDynamicLookup: false,
        },
      ],
    },
  });
  for (const mutate of [
    (d) => {
      d.spec.fields.splice(1, 1);
    },
    (d) => {
      d.spec.fields[1].label = 'Changed';
    },
    (d) => {
      d.spec.fields[0].isPrimaryKey = false;
      d.spec.fields[1].isPrimaryKey = true;
    },
    (d) => {
      d.spec.fields.push(authored('KQ_New__c'));
    },
    (d) => {
      d.spec.fields.push({ ...authored('Extra__c'), dataType: 'Number' });
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
      NativeDmoError,
    );
    assert.equal(writes, 0);
  }
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
  const result = await deployNativeDmo(saved, {
    get: async (name) => {
      calls.push(['get', name]);
      return ++reads < 3 ? native() : changed;
    },
    update: async (name, body) => {
      calls.push(['update', name, body]);
      return native();
    },
  });
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
      deployNativeDmo(saved, {
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
      }),
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
        return native();
      },
      delete: async (name) => {
        calls.push(['delete', name]);
      },
    }),
    { apiName, targetApiName: apiName },
  );
  assert.deepEqual(calls, [
    ['get', apiName],
    ['delete', apiName],
  ]);
  let writes = 0;
  for (const raw of [
    { ...native(), name: 'Other__dlm' },
    { ...native(), dataSpaceName: 'other' },
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

test('native DMO transport uses API65 full-name GET/PATCH/DELETE URLs, retained FTemp bodies and no IDs', async () => {
  const requests = [];
  const client = createDmoClient('target', undefined, async (arguments_, cwd) => {
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
  for (const version of ['60.0', '61.0', '68.0'])
    assert.throws(() => createDmoClient('target', version), /SELECTION/);
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
