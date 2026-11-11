import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  NativeMappingError,
  normalizeNativeMapping,
  unwrapNativeMapping,
  unwrapNativeMappingCollection,
  validateNativeMappingDocument,
} from '../lib/artifacts/native-mapping-document.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';

const mappingName = 'Example_map_Example_1793097786690';
const pair = (source, target = source) => ({
  developerName: `${source}_fieldmap_${target}`,
  sourceFieldDeveloperName: source,
  targetFieldDeveloperName: target,
});
const native = () => ({
  developerName: mappingName,
  fieldMappings: [
    pair('Id__c'),
    pair('Name__c'),
    pair('Note__c'),
    pair('DataSource__c'),
    pair('DataSourceObject__c'),
    pair('InternalOrganization__c'),
    pair('KQ_Id__c'),
  ],
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  status: 'ACTIVE',
  id: 'source-runtime-id',
});
const document = () => normalizeNativeMapping(native());
const body = () => ({
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  fieldMapping: ['Id__c', 'Name__c', 'Note__c'].map((name) => ({
    sourceFieldDeveloperName: name,
    targetFieldDeveloperName: name,
  })),
});
const http = (status, value, exitCode = status >= 400 ? 1 : 0) => ({
  exitCode,
  stdout: `HTTP/1.1 ${status}\r\ncontent-type: application/json\r\nx-request-id: synthetic\r\n\r\n${value === undefined ? '' : JSON.stringify(value)}`,
});

// Seven-pair output and three-pair input mirror the retained API65 create evidence.
test('mapping save retains generated KQ/system pairs and observed selectors, not runtime identity', () => {
  const raw = native();
  const before = structuredClone(raw);
  const saved = document();
  assert.equal(saved.kind, 'mapping');
  assert.equal(saved.identity.apiName, mappingName);
  assert.equal(saved.spec.fieldMappings.length, 7);
  assert.deepEqual(saved.spec.fieldMappings, raw.fieldMappings);
  assert.deepEqual(Object.keys(saved.spec), [
    'sourceEntityDeveloperName',
    'targetEntityDeveloperName',
    'fieldMappings',
  ]);
  assert.equal(saved.status, undefined);
  assert.equal(saved.id, undefined);
  saved.spec.fieldMappings[0].sourceFieldDeveloperName = 'Different__c';
  assert.deepEqual(raw, before);
  assert.deepEqual(unwrapNativeMapping(raw), raw);
  assert.deepEqual(unwrapNativeMappingCollection({ objectSourceTargetMaps: [raw] }), [raw]);
  assert.deepEqual(unwrapNativeMappingCollection({ objectSourceTargetMaps: [] }), []);
  assert.throws(() => unwrapNativeMapping({ objectSourceTargetMaps: [raw] }), /RESPONSE/);
  assert.throws(() => unwrapNativeMappingCollection([raw]), /DOCUMENT/);
  assert.throws(() => unwrapNativeMappingCollection({ fieldMappings: [] }), /RESPONSE/);
  assert.throws(() => unwrapNativeMappingCollection({ objectSourceTargetMaps: [{}] }), /RESPONSE/);
  assert.equal(normalizeNativeMapping(raw, 'other').identity.dataSpace, 'other');
  assert.equal(
    normalizeNativeMapping({ ...raw, dataSpaceName: 'other' }, 'other').identity.dataSpace,
    'other',
  );
  assert.throws(
    () => normalizeNativeMapping({ ...raw, dataSpaceName: 'wrong' }, 'other'),
    /DATASPACE/,
  );
  assert.deepEqual(
    unwrapNativeMappingCollection(
      { objectSourceTargetMaps: [{ ...raw, dataSpaceName: 'other' }] },
      'other',
    ),
    [{ ...raw, dataSpaceName: 'other' }],
  );
  assert.throws(() => normalizeNativeMapping({ ...raw, dataSpaceName: 'other' }), /DATASPACE/);
});

test('mapping validation rejects malformed identities, duplicate pairs/selectors and unsupported shapes', () => {
  for (const change of [
    (d) => (d.identity.apiName = '../escape'),
    (d) => (d.identity.apiName = 'source-id/route'),
    ...['', ' ', ' other', 'other ', 'bad\u0000scope', undefined, 42].map(
      (scope) => (d) => (d.identity.dataSpace = scope),
    ),
    (d) => (d.spec.sourceEntityDeveloperName = 'Example__dlm'),
    (d) => (d.spec.targetEntityDeveloperName = 'Example__dll'),
    (d) => (d.spec.fieldMappings = []),
    (d) => d.spec.fieldMappings.push({ ...d.spec.fieldMappings[0] }),
    (d) => (d.spec.fieldMappings[1].developerName = d.spec.fieldMappings[0].developerName),
    (d) => (d.spec.fieldMappings[0].sourceFieldDeveloperName = '../Id__c'),
    (d) => (d.spec.fieldMappings[0].developerName = 'bad/selector'),
    (d) => (d.spec.fieldMappings[0].id = 'runtime'),
    (d) => (d.spec.fieldMapping = d.spec.fieldMappings),
    (d) => (d.status = 'ACTIVE'),
  ]) {
    const value = document();
    change(value);
    assert.throws(() => validateNativeMappingDocument(value), NativeMappingError);
  }
  const authored = document();
  for (const field of authored.spec.fieldMappings) delete field.developerName;
  assert.deepEqual(validateNativeMappingDocument(authored), authored);
});

test('mapping publication round trips all seven pairs, refuses overwrite, emits LF and preserves input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mapping-save-'));
  const value = document();
  const before = structuredClone(value);
  const saved = await writeNativeMappingDocument(value, root, false);
  assert.equal(
    saved.path,
    path.join(root, 'data360', 'mapping', `${mappingName}.mapping-meta.json`),
  );
  assert.equal(saved.outcome, 'retrieved');
  const bytes = await readFile(saved.path, 'utf8');
  assert.deepEqual(JSON.parse(bytes), value);
  assert.ok(bytes.endsWith('\n'));
  assert.ok(!bytes.includes('\r'));
  assert.deepEqual(value, before);
  const unchanged = await writeNativeMappingDocument(value, root, false);
  assert.equal(unchanged.outcome, 'unchanged');
  const changed = document();
  changed.spec.fieldMappings = changed.spec.fieldMappings.slice(0, 1);
  await assert.rejects(writeNativeMappingDocument(changed, root, false), /OVERWRITE_REQUIRED/);
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), value);
  const overwritten = await writeNativeMappingDocument(changed, root, true);
  assert.equal(overwritten.outcome, 'retrieved');
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), changed);
  const otherSpace = structuredClone(changed);
  otherSpace.identity.dataSpace = 'Team / +&?=ü';
  for (const overwrite of [false, true]) {
    await assert.rejects(
      writeNativeMappingDocument(otherSpace, root, overwrite),
      /DATASPACE_COLLISION/,
    );
    assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), changed);
  }
  const otherRoot = await mkdtemp(path.join(os.tmpdir(), 'mapping-scoped-save-'));
  const scoped = await writeNativeMappingDocument(otherSpace, otherRoot, false);
  assert.deepEqual(JSON.parse(await readFile(scoped.path, 'utf8')), otherSpace);
  for (const unsafe of ['relative', path.parse(root).root, `${root}/../escape`, `${root}/*`])
    await assert.rejects(writeNativeMappingDocument(value, unsafe, false), /UNSAFE_PATH/);
});

test('mapping publication rejects linked ancestors and hardlinked destinations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mapping-links-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'mapping-outside-'));
  await symlink(
    outside,
    path.join(root, 'data360'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeNativeMappingDocument(document(), root, false), /OUTPUT_FAILED/);
  const regular = await mkdtemp(path.join(os.tmpdir(), 'mapping-hardlink-'));
  const directory = path.join(regular, 'data360', 'mapping');
  await mkdir(directory, { recursive: true });
  const sentinel = path.join(regular, 'sentinel.json');
  await writeFile(sentinel, 'sentinel');
  await link(sentinel, path.join(directory, `${mappingName}.mapping-meta.json`));
  await assert.rejects(writeNativeMappingDocument(document(), regular, true), /UNSAFE_PATH/);
  assert.equal(await readFile(sentinel, 'utf8'), 'sentinel');
});

test('mapping transport uses filtered collection, detail, singular input and selector-free PATCH', async () => {
  const calls = [];
  const client = createMappingClient('target', '65.0', async (arguments_) => {
    calls.push(arguments_);
    if (arguments_.includes('--body')) {
      const sent = JSON.parse(
        await readFile(arguments_[arguments_.indexOf('--body') + 1].slice(1), 'utf8'),
      );
      assert.deepEqual(sent, body());
      assert.equal(sent.fieldMappings, undefined);
      assert.equal(sent.name, undefined);
      assert.equal(sent.replaceSource, undefined);
    }
    return http(
      arguments_.includes('POST') ? 201 : 200,
      arguments_.includes('POST') ? { ...native(), status: 'CREATING' } : native(),
    );
  });
  await client.list('Example__dlm');
  await client.list('Example__dlm', 'Example__dll');
  assert.deepEqual(await client.get(mappingName), native());
  const created = await client.create(body());
  assert.equal(created.status, 'CREATING');
  await client.update(mappingName, body());
  const prefix = '/services/data/v65.0/ssot/data-model-object-mappings';
  assert.equal(calls[0][3], `${prefix}?dmoDeveloperName=Example__dlm`);
  assert.equal(
    calls[1][3],
    `${prefix}?dmoDeveloperName=Example__dlm&dloDeveloperName=Example__dll`,
  );
  assert.equal(calls[2][3], `${prefix}/${mappingName}`);
  assert.equal(calls[3][3], `${prefix}`);
  assert.ok(calls[3].includes('POST'));
  assert.equal(calls[4][3], `${prefix}/${mappingName}/field-mappings`);
  assert.ok(calls[4].includes('PATCH'));
  assert.ok(
    calls.every((arguments_) => arguments_.includes('--include') && arguments_.includes('target')),
  );
});

test('mapping transport encodes explicit dataspace on every operation without changing routes or bodies', async () => {
  const calls = [];
  const dataSpace = 'Team / +&?=ü';
  const query = '?dataspace=Team+%2F+%2B%26%3F%3D%C3%BC';
  const prefix = '/services/data/v68.0/ssot/data-model-object-mappings';
  const client = createMappingClient(
    'target',
    '68.0',
    async (arguments_) => {
      if (arguments_.includes('--file')) {
        const request = JSON.parse(
          await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8'),
        );
        assert.deepEqual(request.body, { mode: 'raw', raw: '' });
        calls.push([request.method, request.url]);
        return http(204);
      }
      if (arguments_.includes('--body'))
        assert.deepEqual(
          JSON.parse(await readFile(arguments_[arguments_.indexOf('--body') + 1].slice(1), 'utf8')),
          body(),
        );
      const method = arguments_[arguments_.indexOf('--method') + 1];
      calls.push([method, arguments_[3]]);
      return http(method === 'POST' ? 201 : 200, native());
    },
    dataSpace,
  );
  await client.list('Example__dlm');
  await client.list('Example__dlm', 'Example__dll');
  await client.get(mappingName);
  await client.create(body());
  await client.update(mappingName, body());
  await client.deleteField(mappingName, 'observed_selector_123');
  assert.deepEqual(calls, [
    ['GET', `${prefix}${query}&dmoDeveloperName=Example__dlm`],
    ['GET', `${prefix}${query}&dmoDeveloperName=Example__dlm&dloDeveloperName=Example__dll`],
    ['GET', `${prefix}/${mappingName}${query}`],
    ['POST', `${prefix}${query}`],
    ['PATCH', `${prefix}/${mappingName}/field-mappings${query}`],
    ['DELETE', `${prefix}/${mappingName}/field-mappings/observed_selector_123${query}`],
  ]);
});

test('mapping field DELETE uses exact observed selector once and rejects unsafe or unqualified inputs', async () => {
  const calls = [];
  const client = createMappingClient('target', '68.0', async (arguments_) => {
    calls.push(JSON.parse(await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8')));
    return http(204);
  });
  assert.equal(client.apiVersion, '68.0');
  await client.deleteField(mappingName, 'observed_selector_123');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `/services/data/v68.0/ssot/data-model-object-mappings/${mappingName}/field-mappings/observed_selector_123`,
  );
  assert.deepEqual(calls[0].body, { mode: 'raw', raw: '' });
  for (const selector of ['', '../escape', 'a/b', 'a?dataspace=other', undefined])
    await assert.rejects(client.deleteField(mappingName, selector));
  for (const version of ['69.0'])
    await assert.rejects(
      createMappingClient('target', version, async () => assert.fail()).deleteField(
        mappingName,
        'observed',
      ),
      /VERSION_UNQUALIFIED/,
    );
  assert.equal(calls.length, 1);
  let attempts = 0;
  await assert.rejects(
    createMappingClient('target', '68.0', async () => {
      attempts++;
      return http(500);
    }).deleteField(mappingName, 'observed'),
    /HTTP_ERROR/,
  );
  assert.equal(attempts, 1);
});

test('mapping field DELETE preserves every admitted compatibility pin and normalizes default/auto', async () => {
  for (const version of [
    '61.0',
    '62.0',
    '63.0',
    '64.0',
    '65.0',
    '66.0',
    '67.0',
    '68.0',
    'auto',
    undefined,
  ]) {
    const calls = [];
    const client = createMappingClient('target', version, async (arguments_) => {
      calls.push(JSON.parse(await readFile(arguments_[arguments_.indexOf('--file') + 1], 'utf8')));
      return http(204);
    });
    await client.deleteField(mappingName, 'observed_selector_123');
    assert.deepEqual(calls, [
      {
        url: `/services/data/v${version === 'auto' || version === undefined ? '68.0' : version}/ssot/data-model-object-mappings/${mappingName}/field-mappings/observed_selector_123`,
        method: 'DELETE',
        body: { mode: 'raw', raw: '' },
      },
    ]);
  }
});

test('mapping version guard admits explicit >=61 and default/auto68 before calls, preserving pins', async () => {
  let calls = 0;
  const runner = async (arguments_) => {
    calls++;
    return http(200, { route: arguments_[3] });
  };
  for (const version of ['60.0', '59.0', '0.0', 'latest', 'v65.0', '65', '../68.0', '68.1'])
    assert.throws(() => createMappingClient('target', version, runner), /INVALID_SCOPE/);
  assert.throws(() => createMappingClient('-target', '68.0', runner), /UNSUPPORTED/);
  assert.equal(calls, 0);
  for (const version of ['61.0', '65.0', '66.0', '67.0', '68.0', '69.0', 'auto', undefined]) {
    const result = await createMappingClient('target', version, runner).get(mappingName);
    assert.ok(result.route.includes(`/v${!version || version === 'auto' ? '68.0' : version}/`));
  }
});

test('mapping transport rejects unsafe selection and read documents as write payloads with zero calls', async () => {
  let calls = 0;
  const client = createMappingClient('target', '68.0', async () => {
    calls++;
    return http(200, native());
  });
  for (const operation of [
    () => client.list(''),
    () => client.list('Example__dlm', '../escape'),
    () => client.get('../escape'),
    () => client.remove('../escape'),
    () => client.update('../escape', body()),
    () => client.update(mappingName, { ...body(), fieldMapping: document().spec.fieldMappings }),
    () => client.create(document()),
    () => client.create({ ...body(), replaceSource: true }),
    () => client.create({ ...body(), fieldMapping: document().spec.fieldMappings }),
    () => client.create({ ...body(), fieldMapping: [] }),
  ])
    await assert.rejects(operation(), NativeMappingError);
  assert.equal(calls, 0);
});

test('mapping transport distinguishes confirmed HTTP errors and refuses malformed receipts without retries', async () => {
  for (const [receipt, code, status] of [
    [http(404, { message: 'secret' }), 'MAPPING_HTTP_ERROR', 404],
    [http(403, { message: 'secret' }), 'MAPPING_HTTP_ERROR', 403],
    [http(500, {}), 'MAPPING_HTTP_ERROR', 500],
    [http(202, native()), 'MAPPING_REQUEST_UNCONFIRMED', 202],
    [http(200, native(), 1), 'MAPPING_REQUEST_UNCONFIRMED', 200],
    [{ exitCode: 0, stdout: JSON.stringify(native()) }, 'MAPPING_REQUEST_UNCONFIRMED', undefined],
    [{ exitCode: 0, stdout: 'HTTP/1.1 200\n\nnot-json' }, 'INVALID_MAPPING_RESPONSE', 200],
  ]) {
    let calls = 0;
    const client = createMappingClient('target', '68.0', async () => {
      calls++;
      return receipt;
    });
    await assert.rejects(client.create(body()), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('secret'));
      return true;
    });
    assert.equal(calls, 1);
  }
});
