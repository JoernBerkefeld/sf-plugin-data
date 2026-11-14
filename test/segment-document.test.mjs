import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, symlink, link, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  validateSegmentDocument,
  serializeSegmentDocument,
} from '../lib/artifacts/segment-document.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { retrieveSegment, projectSegment } from '../lib/services/retrieve-segment.js';
import { apiDiagnostic, getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
const candidate = () => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience label',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql }],
    publishInterval: 'NO_REFRESH',
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
    serializeSegmentDocument(projectSegment(response, 'Audience').candidate),
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
  assert.equal(serializeSegmentDocument(candidate()), serializeSegmentDocument(admitted));
  assert.doesNotMatch(serializeSegmentDocument(admitted), /private-id|segmentStatus/u);
});
for (const [label, change] of Object.entries({
  unknown: (d) => (d.spec.extra = true),
  missing: (d) => delete d.spec.description,
  schedule: (d) => (d.spec.publishInterval = 'DAILY'),
  lookback: (d) => (d.spec.lookbackPeriod = 'P2Y'),
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
          const companion = path.join(
            directory,
            'force-app/main/default/data360/segments/Audience.segment.json',
          );
          await writeFile(companion, 'racing author');
        }
      },
    }),
    { code: 'PARTIAL_SEGMENT_OUTPUT' },
  );
  assert.equal(
    await readFile(
      path.join(directory, 'force-app/main/default/data360/segments/Audience.segment.json'),
      'utf8',
    ),
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

test('writer honors configured package and refuses junction output', async () => {
  const directory = await root();
  await writeFile(
    path.join(directory, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const receipt = await writeSegmentDocument(candidate(), directory, false);
  assert.ok(receipt.path.includes(`${path.sep}custom${path.sep}`));
  const outside = await root();
  const linked = await root();
  await symlink(
    outside,
    path.join(linked, 'force-app'),
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
