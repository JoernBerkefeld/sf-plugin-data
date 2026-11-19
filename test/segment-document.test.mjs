import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  symlink,
  link,
  rename,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  joinSegmentFiles,
  serializeSegmentFiles,
  validateSegmentDocument,
} from '../lib/artifacts/segment-document.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { retrieveSegment, projectSegment } from '../lib/services/retrieve-segment.js';
import { apiDiagnostic, getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
const candidate = () => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'Audience' },
  spec: {
    displayName: 'Audience label',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql }],
    lookbackPeriod: 'P90D',
  },
});
const root = () => mkdtemp(path.join(os.tmpdir(), 'data360-segment-test-'));
const raw = () => ({
  segments: [
    {
      apiName: 'Audience',
      displayName: 'Audience label',
      description: 'Description',
      dataSpace: 'default',
      segmentType: 'DBT',
      segmentOnApiName: 'Person__dlm',
      includeDbt: { models: [{ name: 'Audience', sql }] },
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
      segmentStatus: 'ACTIVE',
      marketSegmentId: 'private-id',
    },
  ],
});

test('observed DBT audit/generated fields stay private; criteria is not correlated', () => {
  const response = raw();
  Object.assign(response.segments[0], {
    createdBy: { id: 'private-user' },
    lastModifiedBy: { id: 'private-user' },
    createdDate: '2026-10-28T00:00:00Z',
    lastModifiedDate: '2026-10-28T00:00:00Z',
    segmentOnId: 'private-on',
    segmentMembershipDmo: { historyTable: 'private-history', latestTable: 'private-latest' },
    parameters: [],
    includeCriteria: '&lt;DbtPipeline xmlns=""&gt;rendered by Salesforce&lt;/DbtPipeline&gt;',
  });
  assert.deepEqual(projectSegment(response, 'Audience').candidate, candidate());
  assert.doesNotMatch(
    JSON.stringify(serializeSegmentFiles(projectSegment(response, 'Audience').candidate)),
    /private|rendered/u,
  );
  for (const [key, value] of Object.entries({
    parameters: [{ name: 'meaningful' }],
    createdBy: { id: 'x', extra: true },
    segmentMembershipDmo: { latestTable: 'x' },
    segmentOnId: undefined,
  })) {
    const changed = structuredClone(response);
    changed.segments[0][key] = value;
    assert.throws(() => projectSegment(changed, 'Audience'), key);
  }
});

test('a GET without description (Salesforce omits an empty one) reads as an empty description', () => {
  const response = raw();
  delete response.segments[0].description;
  const expected = candidate();
  expected.spec.description = '';
  assert.deepEqual(projectSegment(response, 'Audience').candidate, expected);
  response.segments[0].description = '';
  assert.deepEqual(projectSegment(response, 'Audience').candidate, expected);
  response.segments[0].description = 5;
  assert.throws(() => projectSegment(response, 'Audience'), { code: 'INVALID_SEGMENT_DOCUMENT' });
});

test('any SQL shape, several models and any model name are kept as written', () => {
  for (const models of [
    [{ name: 'Audience', sql: 'SELECT * FROM Person__dlm' }],
    [
      {
        name: 'audience model 1',
        sql: 'SELECT p.Id__c FROM Person__dlm p JOIN Other__dlm o ON 1=1',
      },
    ],
    [
      { name: 'First', sql: 'SELECT Id__c FROM Person__dlm' },
      { name: 'Second', sql: 'SELECT Id__c FROM {{ ref("First") }} WHERE Id__c IS NOT NULL' },
    ],
    [],
  ]) {
    const value = candidate();
    value.spec.models = models;
    assert.deepEqual(validateSegmentDocument(value).spec.models, models);
    const response = raw();
    response.segments[0].includeDbt.models = models;
    assert.deepEqual(projectSegment(response, 'Audience').candidate.spec.models, models);
  }
});

test('typed document detached stable serialization', () => {
  const original = candidate();
  const admitted = validateSegmentDocument(original);
  original.spec.displayName = 'changed';
  assert.equal(admitted.spec.displayName, 'Audience label');
  assert.deepEqual(serializeSegmentFiles(candidate()), serializeSegmentFiles(admitted));
  assert.doesNotMatch(serializeSegmentFiles(admitted).json, /private-id|segmentStatus|SELECT/u);
});

test('several models split into one SQL file each and join back exactly', () => {
  const value = candidate();
  value.spec.models = [
    { name: 'First', sql: 'SELECT Person__dlm.Id__c\r\nFROM Person__dlm\n' },
    { name: 'second_2', sql: "SELECT 1 FROM {{ ref('First') }} WHERE x >= 'a&b'" },
  ];
  const { json, files } = serializeSegmentFiles(value);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.spec.models, [{ name: 'First' }, { name: 'second_2' }]);
  assert.deepEqual(files, [
    { extension: 'sql', name: 'First', text: value.spec.models[0].sql },
    { extension: 'sql', name: 'second_2', text: value.spec.models[1].sql },
  ]);
  assert.deepEqual(joinSegmentFiles(parsed, files.toReversed()), value);
  const refused = { code: 'INVALID_SEGMENT_DOCUMENT' };
  assert.throws(() => joinSegmentFiles(parsed, files.slice(1)), refused, 'missing SQL file');
  assert.throws(
    () => joinSegmentFiles(parsed, [...files, { extension: 'sql', name: 'Third', text: 'x' }]),
    refused,
    'extra SQL file',
  );
  const inline = structuredClone(parsed);
  inline.spec.models[0].sql = 'SELECT 1';
  assert.throws(() => joinSegmentFiles(inline, files), refused, 'SQL left in the JSON');
  for (const models of [
    [{ name: 'audience model 1', sql: 'SELECT 1' }],
    [
      { name: 'Same', sql: 'SELECT 1' },
      { name: 'same', sql: 'SELECT 2' },
    ],
  ]) {
    const unsafe = candidate();
    unsafe.spec.models = models;
    assert.throws(() => serializeSegmentFiles(unsafe), refused, 'not a file name');
  }
});
for (const [label, change] of Object.entries({
  unknown: (d) => (d.spec.extra = true),
  missing: (d) => delete d.spec.description,
  'publishInterval (the schedule key replaced it)': (d) => (d.spec.publishInterval = 'NO_REFRESH'),
  'lookback that is not text': (d) => (d.spec.lookbackPeriod = 90),
  space: (d) => (d.identity.dataSpace = 'other'),
  'old dependencies key': (d) => (d.spec.dependencies = []),
  'model keys': (d) => (d.spec.models[0].extra = true),
  'models shape': (d) => (d.spec.models = { name: 'Audience', sql }),
  'empty sql': (d) => (d.spec.models[0].sql = ''),
})) {
  test(`document rejects ${label}`, () => {
    const value = candidate();
    change(value);
    assert.throws(() => validateSegmentDocument(value));
  });
}
test('JSON writer emits no XML, repeats byte-stably and refuses conflicts', async () => {
  const directory = await root();
  const first = await writeSegmentDocument(candidate(), directory, false);
  assert.equal(first.outcome, 'retrieved');
  assert.deepEqual(first.codePaths, [first.path.replace(/json$/u, 'Audience.sql')]);
  assert.equal(await readFile(first.codePaths[0], 'utf8'), sql);
  assert.doesNotMatch(await readFile(first.path, 'utf8'), /SELECT/u);
  const repeat = await writeSegmentDocument(candidate(), directory, false);
  assert.equal(repeat.outcome, 'unchanged');
  await assert.rejects(
    readFile(
      path.join(
        directory,
        'force-app/main/default/marketSegmentDefinitions/Audience.marketSegmentDefinition-meta.xml',
      ),
    ),
    { code: 'ENOENT' },
  );
  await writeFile(first.path, 'different');
  const before = await readFile(first.path);
  await assert.rejects(writeSegmentDocument(candidate(), directory, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  assert.deepEqual(await readFile(first.path), before);
  const overwritten = await writeSegmentDocument(candidate(), directory, true);
  assert.equal(overwritten.outcome, 'retrieved');
});
test('writer writes one SQL file per model, repeats unchanged and removes a dropped model', async () => {
  const directory = await root();
  const value = candidate();
  value.spec.models = [
    { name: 'First', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm\r\n' },
    { name: 'Second', sql: 'SELECT 2' },
  ];
  const first = await writeSegmentDocument(value, directory, false);
  const folder = path.dirname(first.path);
  // Directory order differs between file systems; compare sorted names.
  const written = await readdir(folder);
  assert.deepEqual(written.toSorted(), [
    'Audience.segment.First.sql',
    'Audience.segment.Second.sql',
    'Audience.segment.json',
  ]);
  assert.deepEqual(await readFile(first.codePaths[0]), Buffer.from(value.spec.models[0].sql));
  const bytes = await Promise.all([first.path, ...first.codePaths].map((file) => readFile(file)));
  const repeat = await writeSegmentDocument(value, directory, false);
  assert.equal(repeat.outcome, 'unchanged');
  assert.deepEqual(
    await Promise.all([first.path, ...first.codePaths].map((file) => readFile(file))),
    bytes,
  );
  value.spec.models.pop();
  await assert.rejects(writeSegmentDocument(value, directory, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  const kept = await readdir(folder);
  assert.equal(kept.length, 3);
  const overwritten = await writeSegmentDocument(value, directory, true);
  assert.equal(overwritten.outcome, 'retrieved');
  const remaining = await readdir(folder);
  assert.deepEqual(remaining.toSorted(), ['Audience.segment.First.sql', 'Audience.segment.json']);
  const settled = await writeSegmentDocument(value, directory, false);
  assert.equal(settled.outcome, 'unchanged');
});
test('deploy reads the JSON and its SQL files back; missing, extra or inline SQL is refused', async () => {
  const directory = await root();
  const value = candidate();
  value.spec.models = [
    { name: 'First', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm\r\n' },
    { name: 'Second', sql: "SELECT 2 WHERE x >= 'a'" },
  ];
  const written = await writeSegmentDocument(value, directory, false);
  const folder = path.dirname(written.path);
  const read = (flags) => readDeployInputs({ cwd: directory, ...flags });
  for (const flags of [
    { metadata: ['segment:Audience'] },
    { sourceDir: [written.codePaths[1]] },
    { sourceDir: [folder] },
  ]) {
    const inputs = await read(flags);
    assert.equal(inputs.length, 1, JSON.stringify(flags));
    assert.equal(inputs[0].path, written.path);
    assert.deepEqual(inputs[0].codePaths, written.codePaths);
    assert.deepEqual(inputs[0].document, value);
  }
  const refused = { code: 'INVALID_SOURCE' };
  const extra = path.join(folder, 'Audience.segment.Third.sql');
  await writeFile(extra, 'SELECT 3');
  await assert.rejects(read({ metadata: ['segment:Audience'] }), refused, 'extra SQL file');
  await unlink(extra);
  const misnamed = path.join(folder, 'Audience.segment.bad-name.sql');
  await writeFile(misnamed, 'SELECT 3');
  await assert.rejects(read({ sourceDir: [folder] }), refused, 'misnamed SQL file');
  await unlink(misnamed);
  const second = await readFile(written.codePaths[1]);
  await unlink(written.codePaths[1]);
  await assert.rejects(read({ metadata: ['segment:Audience'] }), refused, 'missing SQL file');
  await writeFile(written.codePaths[1], second);
  const json = await readFile(written.path, 'utf8');
  // The single-file form with the SQL inside the JSON is not read.
  await writeFile(written.path, `${JSON.stringify(value, undefined, 2)}\n`);
  await assert.rejects(read({ metadata: ['segment:Audience'] }), refused, 'inline SQL');
  for (const file of written.codePaths) await unlink(file);
  await assert.rejects(read({ metadata: ['segment:Audience'] }), refused, 'old single file');
  await writeFile(written.path, json);
  await unlink(written.path);
  await writeFile(written.codePaths[0], 'SELECT 1');
  await assert.rejects(read({ sourceDir: [written.codePaths[0]] }), refused, 'SQL without JSON');
});
test('writer reports first-publication staging-unlink failure as partial output', async () => {
  const directory = await root();
  await assert.rejects(
    writeSegmentDocument(candidate(), directory, false, {
      link,
      rename,
      unlink: async () => {
        throw new Error('synthetic I/O failure');
      },
    }),
    { code: 'PARTIAL_SEGMENT_OUTPUT' },
  );
});
test('writer preserves a racing companion and reports incomplete pair rather than success', async () => {
  const directory = await root();
  let calls = 0;
  await assert.rejects(
    writeSegmentDocument(candidate(), directory, false, {
      rename,
      unlink,
      link: async (from, to) => {
        calls++;
        await link(from, to);
        if (calls === 1) {
          const companion = path.join(directory, 'data360/segments/Audience.segment.json');
          await writeFile(companion, 'racing author');
        }
      },
    }),
    { code: 'PARTIAL_SEGMENT_OUTPUT' },
  );
  assert.equal(
    await readFile(path.join(directory, 'data360/segments/Audience.segment.json'), 'utf8'),
    'racing author',
  );
});
test('writer fails before publication when the first filesystem publication fails', async () => {
  const directory = await root();
  await assert.rejects(
    writeSegmentDocument(candidate(), directory, false, {
      rename,
      unlink,
      link: async () => {
        throw new Error('synthetic denied');
      },
    }),
    { code: 'OUTPUT_FAILED' },
  );
  await assert.rejects(
    readFile(
      path.join(
        directory,
        'force-app/main/default/marketSegmentDefinitions/Audience.marketSegmentDefinition-meta.xml',
      ),
    ),
    { code: 'ENOENT' },
  );
});

test('writer ignores the configured package and refuses junction output', async () => {
  const directory = await root();
  await writeFile(
    path.join(directory, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const receipt = await writeSegmentDocument(candidate(), directory, false);
  assert.equal(receipt.path, path.join(directory, 'data360', 'segments', 'Audience.segment.json'));
  const outside = await root();
  const linked = await root();
  await symlink(
    outside,
    path.join(linked, 'data360'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeSegmentDocument(candidate(), linked, true));
});
for (const version of ['68.0']) {
  test(`retrieve API${version} makes only one exact native request without Segment Metadata`, async () => {
    let calls = 0;
    const connection = {
      instanceUrl: 'https://synthetic.example',
      getApiVersion: () => version,
      getUsername: () => assert.fail('JSON acquisition must not need Metadata target identity'),
      _refreshDelegate: () => assert.fail(),
      request: async function (request, options) {
        calls++;
        assert.equal(this._refreshDelegate, undefined);
        assert.equal(options.retry.maxRetries, 0);
        assert.ok(request.url.endsWith(`/v${version}/ssot/segments/Audience`));
        return raw();
      },
    };
    const result = await retrieveSegment(connection, 'Audience', version, 'default');
    assert.equal(calls, 1);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.candidate, candidate());
    assert.equal(result.expectations.runtime.marketSegmentId, 'private-id');
  });
}
for (const [label, change] of Object.entries({
  unknown: (r) => (r.segments[0].futureMeaningful = true),
  wrong: (r) => (r.segments[0].apiName = 'Other'),
  duplicate: (r) => r.segments.push(r.segments[0]),
  missing: (r) => delete r.segments[0].lookbackPeriod,
})) {
  test(`retrieve blocks ${label} before metadata publication`, async () => {
    const response = raw();
    change(response);
    const result = await retrieveSegment(
      {
        instanceUrl: 'https://synthetic.example',
        getApiVersion: () => '68.0',
        getUsername: () => 'synthetic',
        request: async () => response,
      },
      'Audience',
      '68.0',
      'default',
    );
    assert.equal(result.candidate, undefined);
    assert.ok(result.blockers.length);
  });
}
test('Segment acquisition retains normalized evidence without publishing remote error properties', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
  ]);
  let reads = 0;
  const result = await retrieveSegment(
    {
      instanceUrl: 'https://synthetic.example',
      getApiVersion: () => '68.0',
      getUsername: () => 'synthetic',
      request: async () => {
        reads++;
        throw {
          statusCode: 400,
          data: [
            { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
          ],
        };
      },
    },
    'Audience',
    '68.0',
    'default',
  );
  assert.equal(reads, 1);
  assert.deepEqual(result.blockers, ['SEGMENT_ACQUISITION_FAILED']);
  assert.deepEqual(getConnectDiagnostic(result), evidence);
  assert.doesNotMatch(JSON.stringify(result), /hidden|INVALID_INPUT|statusCode/u);
});

test('generic404 is not absence proof; latest and API65 refuse before request', async () => {
  let requests = 0;
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '68.0',
    getUsername: () => 'synthetic',
    request: async () => {
      requests++;
      throw { statusCode: 404 };
    },
  };
  const result = await retrieveSegment(connection, 'Audience', '68.0', 'default');
  assert.deepEqual(result.blockers, ['SEGMENT_ACQUISITION_FAILED']);
  assert.equal(result.candidate, undefined);
  await assert.rejects(retrieveSegment(connection, 'Audience', 'latest', 'default'));
  await assert.rejects(
    retrieveSegment({ ...connection, getApiVersion: () => '65.0' }, 'Audience', '65.0', 'default'),
  );
  assert.equal(requests, 1);
});
