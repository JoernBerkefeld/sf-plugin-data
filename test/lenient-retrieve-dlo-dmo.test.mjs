import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import { normalizeDlo, validateDloDocument } from '../lib/artifacts/dlo-document.js';
import {
  normalizeNativeDmo,
  validateNativeDmoDocument,
} from '../lib/artifacts/native-dmo-document.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { retrieveNativeDlo } from '../lib/services/native-dlo.js';
import { retrieveNativeDmo } from '../lib/services/native-dmo.js';

const dloName = 'Loose__dll';
const dmoName = 'Loose__dlm';
// The API reports unset values as JSON null.
const jsonNull = JSON.parse('null');
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lenient-retrieve-'));

// A DLO the strict document refuses in seven ways: label over 40 characters, empty category,
// a non-__c event field, a non-__c field, an empty label, a non-boolean key and two primary keys.
const looseDlo = () => ({
  id: '1dlaj00000Ae4VN',
  name: dloName,
  label: 'A data lake object label longer than forty characters',
  category: '',
  eventDateTimeFieldName: 'EventTime',
  status: 'ACTIVE',
  dataSpaceInfo: [{ name: 'default' }],
  dataLakeFieldInfoRepresentation: [
    { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, futureKey: { a: 1 } },
    { name: 'Region__c', label: '', dataType: 'Text', isPrimaryKey: true },
    { name: 'EventTime', label: 'Event', dataType: 'DateTime', isPrimaryKey: jsonNull },
    { name: 'Note__c', label: 'Note', dataType: '', recordId: 'runtime' },
  ],
});

// A DMO the strict normalizer refuses: a field without `type`, a `dataType` that differs from
// `type`, a non-boolean key, a null category, an empty label and no dataSpaceName.
const looseDmo = () => ({
  id: 'runtime',
  name: dmoName,
  label: '',
  category: jsonNull,
  creationType: 'Custom',
  fields: [
    { name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true, futureKey: [1, 2] },
    { name: 'Score__c', label: 'Score', type: 'Number', dataType: 'Decimal' },
    { name: 'Raw__c', label: 'Raw', dataType: 'Text', isPrimaryKey: 'yes' },
    { name: 'Odd', label: '', type: 'Text', status: 'ACTIVE' },
  ],
});

const validDlo = () => ({
  schemaVersion: 1,
  kind: 'dlo',
  c__dataSpace: ['default'],
  identity: { apiName: dloName },
  spec: {
    label: 'Loose',
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});
const validDmo = () => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { apiName: dmoName, dataSpace: 'default' },
  spec: {
    label: 'Loose',
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});

const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};

const command = (Type, flags) => {
  const value = Object.create(Type.prototype);
  value.parse = async () => ({
    flags: { 'api-version': '68.0', preview: false, ...flags },
  });
  value.jsonEnabled = () => true;
  return value;
};

test('strict DLO and DMO normalizers still refuse what retrieve mode keeps', () => {
  assert.throws(() => normalizeDlo(looseDlo(), 'default'), /INVALID_DLO_DOCUMENT/u);
  assert.throws(() => normalizeNativeDmo(looseDmo(), 'default'), /UNSUPPORTED_DMO_DATASPACE/u);
  assert.throws(
    () => normalizeNativeDmo({ ...looseDmo(), dataSpaceName: 'default' }),
    /INVALID_DMO_FIELD/u,
  );
});

test('retrieve mode keeps a DLO the plugin cannot deploy as returned', () => {
  const document = normalizeDlo(looseDlo(), 'default', 'retrieve');
  assert.equal(document.kind, 'dlo');
  assert.deepEqual(document.identity, { apiName: dloName });
  assert.deepEqual(document.c__dataSpace, ['default']);
  assert.equal(document.spec.label, looseDlo().label);
  assert.equal(document.spec.category, '');
  assert.equal(document.spec.eventDateTimeFieldName, 'EventTime');
  assert.deepEqual(document.spec.fields[0].futureKey, { a: 1 });
  assert.equal(document.spec.fields.filter((field) => field.isPrimaryKey === true).length, 2);
  assert.equal(document.spec.fields[2].isPrimaryKey, jsonNull);
  // Runtime keys are still not part of the definition.
  assert.equal(document.spec.fields[3].recordId, undefined);
  assert.equal(document.id, undefined);
  assert.equal(document.spec.status, undefined);
});

test('retrieve mode keeps a DMO the plugin cannot deploy as returned', () => {
  const document = normalizeNativeDmo(looseDmo(), 'default', 'retrieve');
  assert.deepEqual(document.identity, { apiName: dmoName, dataSpace: 'default' });
  assert.equal(document.spec.label, '');
  assert.equal(document.spec.category, jsonNull);
  const [id, score, raw, odd] = document.spec.fields;
  assert.deepEqual(id, {
    name: 'Id__c',
    label: 'Id',
    futureKey: [1, 2],
    dataType: 'Text',
    isPrimaryKey: true,
  });
  // Both keys stay when they disagree; nothing is guessed.
  assert.equal(score.type, 'Number');
  assert.equal(score.dataType, 'Decimal');
  assert.equal(score.isPrimaryKey, false);
  assert.equal(raw.isPrimaryKey, 'yes');
  assert.equal(raw.type, undefined);
  assert.equal(odd.status, undefined);
  // Without a data space in the read and without a requested one, none is invented.
  assert.deepEqual(normalizeNativeDmo(looseDmo(), undefined, 'retrieve').identity, {
    apiName: dmoName,
  });
  // A differing data space stays a refusal.
  assert.throws(
    () => normalizeNativeDmo({ ...looseDmo(), dataSpaceName: 'Other' }, 'default', 'retrieve'),
    /UNSUPPORTED_DMO_DATASPACE/u,
  );
});

test('a normal DLO and DMO read the same in both modes', () => {
  const dlo = {
    id: '1dlaj00000Ae4VNAAZ',
    name: dloName,
    label: 'Loose',
    category: 'Other',
    dataSpaceInfo: [{ name: 'default' }],
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  };
  assert.deepEqual(normalizeDlo(dlo, 'default', 'retrieve'), normalizeDlo(dlo, 'default'));
  const dmo = {
    name: dmoName,
    label: 'Loose',
    category: 'PROFILE',
    dataSpaceName: 'default',
    fields: [{ name: 'Id__c', label: 'Id', type: 'Text', dataType: 'Text', isPrimaryKey: true }],
  };
  assert.deepEqual(
    JSON.stringify(normalizeNativeDmo(dmo, 'default', 'retrieve')),
    JSON.stringify(normalizeNativeDmo(dmo, 'default')),
  );
});

test('retrieve writes a normal DLO file; deploy of it refuses naming the key', async () => {
  const cwd = await scratch();
  const retrieve = command(Retrieve, { metadata: [`dlo:${dloName}`], 'output-dir': cwd });
  retrieve.acquireDlo = retrieveNativeDlo;
  retrieve.writeDlo = writeDloDocument;
  retrieve.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'target' }),
  });
  retrieve.createDloClient = () => ({ get: async () => looseDlo() });
  const retrieved = await run(retrieve);
  assert.equal(retrieved.status, 'success', JSON.stringify(retrieved.diagnostics));
  assert.equal(retrieved.result.items[0].verbatim, undefined);
  const file = path.join(cwd, 'data360', 'dlo', `${dloName}.dlo-meta.json`);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.kind, 'dlo');
  assert.equal(saved.verbatim, undefined);
  assert.equal(saved.spec.label, looseDlo().label);
  assert.deepEqual(saved.spec.fields[0].futureKey, { a: 1 });
  assert.equal(saved.spec.fields.length, 4);

  await assert.rejects(
    readDeployInputs({ cwd, metadata: [`dlo:${dloName}`] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      /spec\.eventDateTimeFieldName must be a field API name/u.test(error.message),
  );
  const deploy = command(Deploy, {
    metadata: [`dlo:${dloName}`],
    'target-org': { getOrgId: () => 'org', getUsername: () => 'target' },
  });
  deploy.resolveInputs = () => readDeployInputs({ cwd, metadata: [`dlo:${dloName}`] });
  deploy.createDloClient = () => assert.fail('a refused file reaches no API');
  const blocked = await run(deploy);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostics.errors[0].code, 'INVALID_SOURCE');
  assert.match(
    blocked.diagnostics.errors[0].message,
    /The DLO file cannot be deployed: spec\.eventDateTimeFieldName/u,
  );
});

test('deploy validation names each DLO key path it refuses', () => {
  validateDloDocument(validDlo());
  const cases = [
    [(d) => (d.extra = 1), 'INVALID_DLO_DOCUMENT', /: extra is not a key/u],
    [(d) => (d.spec.observed = 1), 'INVALID_DLO_DOCUMENT', /spec\.observed is not a key/u],
    [(d) => (d.spec.label = 'x'.repeat(41)), 'INVALID_DLO_DOCUMENT', /spec\.label/u],
    [(d) => (d.spec.category = ''), 'INVALID_DLO_DOCUMENT', /spec\.category/u],
    [(d) => (d.spec.fields = []), 'INVALID_DLO_DOCUMENT', /spec\.fields must list/u],
    [(d) => (d.spec.fields[0].name = 'Id'), 'INVALID_DLO_FIELD', /spec\.fields\[0\]\.name/u],
    [(d) => (d.spec.fields[0].id = 'x'), 'INVALID_DLO_FIELD', /spec\.fields\[0\]\.id is not/u],
    [
      (d) => delete d.spec.fields[0].isPrimaryKey,
      'INVALID_DLO_FIELD',
      /spec\.fields\[0\]\.isPrimaryKey/u,
    ],
    [
      (d) => d.spec.fields.push({ ...d.spec.fields[0], name: 'Two__c' }),
      'INVALID_DLO_PRIMARY_KEY',
      /marks 2 fields as isPrimaryKey/u,
    ],
  ];
  for (const [change, code, message] of cases) {
    const document = validDlo();
    change(document);
    assert.throws(
      () => validateDloDocument(document),
      (error) => error.code === code && message.test(error.message),
    );
    // Retrieve mode admits each of them.
    validateDloDocument(document, 'retrieve');
  }
});

test('retrieve writes a normal DMO file; deploy of it refuses naming the key', async () => {
  const cwd = await scratch();
  const document = await retrieveNativeDmo(
    dmoName,
    { get: async () => looseDmo() },
    'default',
    'retrieve',
  );
  const receipt = await writeNativeDmoDocument(document, cwd, false);
  const saved = JSON.parse(await readFile(receipt.path, 'utf8'));
  assert.equal(saved.kind, 'dmo');
  assert.equal(saved.verbatim, undefined);
  assert.equal(saved.spec.category, jsonNull);
  // Fields are saved sorted by name: Id__c, Odd, Raw__c, Score__c.
  assert.deepEqual(
    saved.spec.fields.map((field) => field.name),
    ['Id__c', 'Odd', 'Raw__c', 'Score__c'],
  );
  assert.deepEqual(saved.spec.fields[0].futureKey, [1, 2]);
  assert.equal(saved.spec.fields[3].type, 'Number');
  // A repeat retrieve of the same lenient document is unchanged.
  const repeat = await writeNativeDmoDocument(document, cwd, false);
  assert.equal(repeat.outcome, 'unchanged');
  await assert.rejects(
    readDeployInputs({ cwd, metadata: [`dmo:${dmoName}`] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      /The DMO file cannot be deployed: spec\.label/u.test(error.message),
  );
  // With label and category fixed, the next refusal names the first field it cannot deploy.
  saved.spec.label = 'Loose';
  saved.spec.category = 'Other';
  await writeFile(receipt.path, `${JSON.stringify(saved, undefined, 2)}\n`);
  await assert.rejects(
    readDeployInputs({ cwd, metadata: [`dmo:${dmoName}`] }),
    /spec\.fields\[1\]\.name must be a field API name ending in __c/u,
  );
});

test('deploy validation names each DMO key path it refuses', () => {
  validateNativeDmoDocument(validDmo());
  const cases = [
    [(d) => (d.extra = 1), 'INVALID_DMO_DOCUMENT', /: extra is not a key/u],
    [(d) => (d.identity.id = 1), 'INVALID_DMO_DOCUMENT', /identity\.id is not a key/u],
    [(d) => delete d.identity.dataSpace, 'INVALID_DMO_DOCUMENT', /identity\.dataSpace/u],
    [(d) => (d.spec.status = 'x'), 'INVALID_DMO_DOCUMENT', /spec\.status is not a key/u],
    [(d) => (d.spec.category = jsonNull), 'INVALID_DMO_DOCUMENT', /spec\.category/u],
    [(d) => (d.spec.fields[0].type = 'Text'), 'INVALID_DMO_FIELD', /fields\[0\]\.type/u],
    [(d) => (d.spec.fields[0].name = 'Id'), 'INVALID_DMO_FIELD', /fields\[0\]\.name/u],
    [(d) => (d.spec.fields[0].isPrimaryKey = 'y'), 'INVALID_DMO_FIELD', /isPrimaryKey/u],
  ];
  for (const [change, code, message] of cases) {
    const document = validDmo();
    change(document);
    assert.throws(
      () => validateNativeDmoDocument(document),
      (error) => error.code === code && message.test(error.message),
    );
    validateNativeDmoDocument(document, 'retrieve');
  }
});

test('an unprintable key is not echoed', () => {
  const document = {
    schemaVersion: 1,
    kind: 'dmo',
    identity: { apiName: dmoName, dataSpace: 'default' },
    spec: { label: 'L', category: 'Other', fields: [] },
    'secret value here': 1,
  };
  assert.throws(
    () => validateNativeDmoDocument(document),
    (error) =>
      /\[unnamed key\] is not a key/u.test(error.message) && !/secret/u.test(error.message),
  );
});

/**
 * Retrieve one DLO through the command with an offline client.
 * @param {object} raw DLO GET response.
 * @param {Function} [acquire] Acquisition seam (default: the real one).
 * @returns {Promise<{result: object, file: string}>} Envelope and the DLO's file path.
 */
async function retrieveDlo(raw, acquire = retrieveNativeDlo) {
  const cwd = await scratch();
  const retrieve = command(Retrieve, { metadata: [`dlo:${dloName}`], 'output-dir': cwd });
  retrieve.acquireDlo = acquire;
  retrieve.writeDlo = writeDloDocument;
  retrieve.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'target' }),
  });
  retrieve.createDloClient = () => ({ get: async () => structuredClone(raw) });
  return {
    result: await run(retrieve),
    file: path.join(cwd, 'data360', 'dlo', `${dloName}.dlo-meta.json`),
  };
}

test('a DLO without a usable ID is written verbatim; a DLO of another name stays a failure', async () => {
  for (const id of [undefined, '1dlaj00000Ae4VNAA']) {
    const raw = { ...looseDlo(), id };
    const { result, file } = await retrieveDlo(raw);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.result.items[0].verbatim, { reason: 'INVALID_DLO_TARGET_ID' });
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.verbatim.reason, 'INVALID_DLO_TARGET_ID');
  }
  const other = await retrieveDlo({ ...looseDlo(), name: 'Other__dll' });
  assert.notEqual(other.result.status, 'success');
  assert.equal(other.result.result.items.length, 0);
  assert.match(JSON.stringify(other.result.diagnostics.errors), /DLO_TARGET_IDENTITY_MISMATCH/u);
  await assert.rejects(readFile(other.file, 'utf8'), { code: 'ENOENT' });
});

test('a projection that fails without an error code is written verbatim as UNMODELLED_RESPONSE', async () => {
  const { result, file } = await retrieveDlo(looseDlo(), async (name, client) => {
    await client.get(name);
    throw new TypeError('unexpected shape');
  });
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNMODELLED_RESPONSE' });
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.verbatim.reason, 'UNMODELLED_RESPONSE');
  assert.equal(saved.verbatim.native.name, dloName);
  // Without a read, the same failure stays an item failure.
  const unread = await retrieveDlo(looseDlo(), async () => {
    throw new TypeError('before any read');
  });
  assert.notEqual(unread.result.status, 'success');
  assert.equal(unread.result.result.items.length, 0);
});
