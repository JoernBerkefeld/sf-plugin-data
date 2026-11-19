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
import { ConnectError } from '../lib/transport/connect-client.js';

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
const document = () => normalizeNativeMapping(native(), 'default');
const body = () => ({
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  fieldMapping: ['Id__c', 'Name__c', 'Note__c'].map((name) => ({
    sourceFieldDeveloperName: name,
    targetFieldDeveloperName: name,
  })),
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
  assert.deepEqual(unwrapNativeMappingCollection({ objectSourceTargetMaps: [raw] }, 'default'), [
    raw,
  ]);
  assert.deepEqual(unwrapNativeMappingCollection({ objectSourceTargetMaps: [] }, 'default'), []);
  assert.throws(() => unwrapNativeMapping({ objectSourceTargetMaps: [raw] }), /RESPONSE/);
  assert.throws(() => unwrapNativeMappingCollection([raw], 'default'), /DOCUMENT/);
  assert.throws(() => unwrapNativeMappingCollection({ fieldMappings: [] }, 'default'), /RESPONSE/);
  assert.throws(
    () => unwrapNativeMappingCollection({ objectSourceTargetMaps: [{}] }, 'default'),
    /RESPONSE/,
  );
  assert.equal(normalizeNativeMapping(raw, 'other').c__dataSpace, 'other');
  assert.equal(
    normalizeNativeMapping({ ...raw, dataSpaceName: 'other' }, 'other').c__dataSpace,
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
  assert.throws(
    () => normalizeNativeMapping({ ...raw, dataSpaceName: 'other' }, 'default'),
    /DATASPACE/,
  );
});

test('mapping validation rejects malformed identities, duplicate pairs/selectors and unsupported shapes', () => {
  for (const change of [
    (d) => (d.identity.apiName = '../escape'),
    (d) => (d.identity.apiName = 'source-id/route'),
    ...['', ' ', ' other', 'other ', 'bad\u0000scope', undefined, 42].map(
      (scope) => (d) => (d.c__dataSpace = scope),
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
  // Mapping names are unique in the org: a file of another data space is the same mapping, so
  // it is replaced only with overwrite, like any other difference.
  const otherSpace = structuredClone(changed);
  otherSpace.c__dataSpace = 'Team / +&?=ü';
  await assert.rejects(writeNativeMappingDocument(otherSpace, root, false), /OVERWRITE_REQUIRED/);
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), changed);
  await writeNativeMappingDocument(otherSpace, root, true);
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), otherSpace);
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

const noRunner = async () => assert.fail('a REST call must never start a CLI process');
/**
 * A bound sender that records each call and answers through the handler.
 * @param {Function} answer Returns the response for (method, route, body), or throws.
 * @returns {{ sender: object, calls: Array<[string, string, unknown]> }} Sender and calls.
 */
const recording = (answer = () => native()) => {
  const calls = [];
  return {
    calls,
    sender: {
      request: async (method, route, noContent, sent) => {
        calls.push([method, route, sent]);
        const value = await answer(method, route, sent);
        return value === undefined ? noContent : value;
      },
    },
  };
};
const client = (version, sender, dataSpace = 'default') =>
  createMappingClient('target', version, noRunner, dataSpace, sender);

test('mapping transport uses filtered collection, detail, singular input and selector-free PATCH', async () => {
  const { calls, sender } = recording((method) =>
    method === 'POST' ? { ...native(), status: 'CREATING' } : native(),
  );
  const mapping = client('65.0', sender);
  await mapping.list('Example__dlm');
  await mapping.list('Example__dlm', 'Example__dll');
  assert.deepEqual(await mapping.get(mappingName), native());
  const created = await mapping.create(body());
  assert.equal(created.status, 'CREATING');
  await mapping.update(mappingName, body());
  const prefix = '/services/data/v65.0/ssot/data-model-object-mappings';
  // The run's data space is named on every request, default too.
  const query = '?dataspace=default';
  assert.deepEqual(calls, [
    ['GET', `${prefix}${query}&dmoDeveloperName=Example__dlm`, undefined],
    [
      'GET',
      `${prefix}${query}&dmoDeveloperName=Example__dlm&dloDeveloperName=Example__dll`,
      undefined,
    ],
    ['GET', `${prefix}/${mappingName}${query}`, undefined],
    ['POST', `${prefix}${query}`, body()],
    ['PATCH', `${prefix}/${mappingName}/field-mappings${query}`, body()],
  ]);
  for (const sent of calls.slice(3).map((call) => call[2])) {
    assert.equal(sent.fieldMappings, undefined);
    assert.equal(sent.name, undefined);
    assert.equal(sent.replaceSource, undefined);
  }
});

test('mapping transport encodes explicit dataspace on every operation without changing routes or bodies', async () => {
  const dataSpace = 'Team / +&?=ü';
  const query = '?dataspace=Team+%2F+%2B%26%3F%3D%C3%BC';
  const prefix = '/services/data/v68.0/ssot/data-model-object-mappings';
  const { calls, sender } = recording((method) => (method === 'DELETE' ? undefined : native()));
  const mapping = client('68.0', sender, dataSpace);
  await mapping.list('Example__dlm');
  await mapping.list('Example__dlm', 'Example__dll');
  await mapping.get(mappingName);
  await mapping.create(body());
  await mapping.update(mappingName, body());
  await mapping.deleteField(mappingName, 'observed_selector_123');
  assert.deepEqual(calls, [
    ['GET', `${prefix}${query}&dmoDeveloperName=Example__dlm`, undefined],
    [
      'GET',
      `${prefix}${query}&dmoDeveloperName=Example__dlm&dloDeveloperName=Example__dll`,
      undefined,
    ],
    ['GET', `${prefix}/${mappingName}${query}`, undefined],
    ['POST', `${prefix}${query}`, body()],
    ['PATCH', `${prefix}/${mappingName}/field-mappings${query}`, body()],
    ['DELETE', `${prefix}/${mappingName}/field-mappings/observed_selector_123${query}`, undefined],
  ]);
});

test('mapping field DELETE uses exact observed selector once and rejects unsafe inputs', async () => {
  const { calls, sender } = recording(() => {});
  const mapping = client('68.0', sender);
  assert.equal(mapping.apiVersion, '68.0');
  await mapping.deleteField(mappingName, 'observed_selector_123');
  assert.deepEqual(calls, [
    [
      'DELETE',
      `/services/data/v68.0/ssot/data-model-object-mappings/${mappingName}/field-mappings/observed_selector_123?dataspace=default`,
      undefined,
    ],
  ]);
  for (const selector of ['', '../escape', 'a/b', 'a?dataspace=other', undefined])
    await assert.rejects(mapping.deleteField(mappingName, selector));
  assert.equal(calls.length, 1);
  // The client keeps a newer numeric pin as given; the field DELETE has no version gate.
  await client('69.0', sender).deleteField(mappingName, 'observed');
  assert.equal(calls.length, 2);
  assert.match(calls[1][1], /^\/services\/data\/v69\.0\//u);
  const failing = recording(() => {
    throw new ConnectError('REQUEST_FAILED', 500);
  });
  await assert.rejects(
    client('68.0', failing.sender).deleteField(mappingName, 'observed'),
    /HTTP_ERROR/,
  );
  assert.equal(failing.calls.length, 1);
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
    const { calls, sender } = recording(() => {});
    await client(version, sender).deleteField(mappingName, 'observed_selector_123');
    assert.deepEqual(calls, [
      [
        'DELETE',
        `/services/data/v${version === 'auto' || version === undefined ? '68.0' : version}/ssot/data-model-object-mappings/${mappingName}/field-mappings/observed_selector_123?dataspace=default`,
        undefined,
      ],
    ]);
  }
});

test('mapping version guard admits explicit >=61 and default/auto68 before calls, preserving pins', async () => {
  const { calls, sender } = recording((method, route) => ({ route }));
  for (const version of ['60.0', '59.0', '0.0', 'latest', 'v65.0', '65', '../68.0', '68.1'])
    assert.throws(() => client(version, sender), /INVALID_SCOPE/);
  assert.throws(
    () => createMappingClient('-target', '68.0', noRunner, 'default', sender),
    /UNSUPPORTED/,
  );
  assert.equal(calls.length, 0);
  for (const version of ['61.0', '65.0', '66.0', '67.0', '68.0', '69.0', 'auto', undefined]) {
    const result = await client(version, sender).get(mappingName);
    assert.ok(result.route.includes(`/v${!version || version === 'auto' ? '68.0' : version}/`));
  }
});

test('mapping transport rejects unsafe selection and read documents as write payloads with zero calls', async () => {
  const { calls, sender } = recording();
  const mapping = client('68.0', sender);
  for (const operation of [
    () => mapping.list(''),
    () => mapping.list('Example__dlm', '../escape'),
    () => mapping.get('../escape'),
    () => mapping.remove('../escape'),
    () => mapping.update('../escape', body()),
    () => mapping.update(mappingName, { ...body(), fieldMapping: document().spec.fieldMappings }),
    () => mapping.create(document()),
    () => mapping.create({ ...body(), replaceSource: true }),
    () => mapping.create({ ...body(), fieldMapping: document().spec.fieldMappings }),
    () => mapping.create({ ...body(), fieldMapping: [] }),
  ])
    await assert.rejects(operation(), NativeMappingError);
  assert.equal(calls.length, 0);
});

test('mapping transport distinguishes confirmed HTTP errors and refuses unconfirmed or malformed answers once', async () => {
  for (const [answer, code, status] of [
    [new ConnectError('REQUEST_FAILED', 404), 'MAPPING_HTTP_ERROR', 404],
    [new ConnectError('REQUEST_FAILED', 403), 'MAPPING_HTTP_ERROR', 403],
    [new ConnectError('REQUEST_FAILED', 500), 'MAPPING_HTTP_ERROR', 500],
    [new ConnectError('REQUEST_FAILED'), 'MAPPING_REQUEST_UNCONFIRMED', undefined],
    [undefined, 'MAPPING_REQUEST_UNCONFIRMED', 204],
    ['not-json', 'INVALID_MAPPING_RESPONSE', undefined],
    [[], 'INVALID_MAPPING_RESPONSE', undefined],
  ]) {
    const { calls, sender } = recording(() => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    await assert.rejects(client('68.0', sender).create(body()), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('secret'));
      return true;
    });
    assert.equal(calls.length, 1);
  }
});
