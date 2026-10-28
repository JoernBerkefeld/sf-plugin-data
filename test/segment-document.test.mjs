import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdir,
  mkdtemp,
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
  validateSegmentDocument,
  validateSegmentPair,
  serializeSegmentDocument,
} from '../lib/artifacts/segment-document.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { retrieveSegment, projectSegment } from '../lib/services/retrieve-segment.js';
import { retrieveSegmentMetadata } from '../lib/transport/project-metadata.js';
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
    dependencies: [
      { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
    ],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xml = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata">\n<includeCriteria>${escape(`<DbtPipeline xmlns=""><models><model><name>Audience</name><sql>${sql}</sql></model></models></DbtPipeline>`)}</includeCriteria>\n<masterLabel>Audience label</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>\n`;
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

test('observed DBT audit/generated fields stay private and redundant criteria must agree', () => {
  const response = raw();
  Object.assign(response.segments[0], {
    createdBy: { id: 'private-user' },
    lastModifiedBy: { id: 'private-user' },
    createdDate: '2026-10-28T00:00:00Z',
    lastModifiedDate: '2026-10-28T00:00:00Z',
    segmentOnId: 'private-on',
    segmentMembershipDmo: { historyTable: 'private-history', latestTable: 'private-latest' },
    parameters: [],
    includeCriteria: escape(
      `<DbtPipeline xmlns=""><models><model><name>Audience</name><sql>${sql}</sql></model></models></DbtPipeline>`,
    ),
  });
  assert.deepEqual(projectSegment(response, 'Audience').candidate, candidate());
  assert.doesNotMatch(
    serializeSegmentDocument(projectSegment(response, 'Audience').candidate),
    /private/u,
  );
  for (const [key, value] of Object.entries({
    parameters: [{ name: 'meaningful' }],
    includeCriteria: response.segments[0].includeCriteria.replace('WHERE 1 = 0', 'WHERE 1 = 1'),
    createdBy: { id: 'x', extra: true },
    segmentMembershipDmo: { latestTable: 'x' },
    segmentOnId: undefined,
  })) {
    const changed = structuredClone(response);
    changed.segments[0][key] = value;
    assert.throws(() => projectSegment(changed, 'Audience'), key);
  }
});

test('typed document detached stable serialization and paired XML correlation', () => {
  const original = candidate();
  const admitted = validateSegmentPair(original, xml());
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
  dependency: (d) => (d.spec.dependencies[0].apiName = 'Other__dlm'),
  sql: (d) => (d.spec.models[0].sql = 'SELECT * FROM Person__dlm'),
  multiple: (d) => d.spec.models.push(d.spec.models[0]),
})) {
  test(`document rejects ${label}`, () => {
    const value = candidate();
    change(value);
    assert.throws(() => validateSegmentDocument(value));
  });
}
for (const [label, change] of Object.entries({
  label: (x) => x.replace('Audience label', 'Other'),
  sql: (x) => x.replace('WHERE 1 = 0', 'WHERE 1 = 1'),
  unknown: (x) =>
    x.replace('</MarketSegmentDefinition>', '<segmentOn>Id</segmentOn></MarketSegmentDefinition>'),
  duplicate: (x) =>
    x.replace(
      '<segmentType>DBT</segmentType>',
      '<segmentType>DBT</segmentType><segmentType>DBT</segmentType>',
    ),
  entity: (x) => x.replace('Audience label', '&unknown;'),
  doctype: (x) => '<!DOCTYPE x>' + x,
})) {
  test(`pair rejects ${label}`, () =>
    assert.throws(() => validateSegmentPair(candidate(), change(xml()))));
}
test('pair writer creates both, repeats byte-stably and refuses differing bytes before changing either', async () => {
  const directory = await root();
  const first = await writeSegmentDocument(candidate(), xml(), directory, false);
  assert.equal(first.outcome, 'retrieved');
  const repeat = await writeSegmentDocument(candidate(), xml(), directory, false);
  assert.equal(repeat.outcome, 'unchanged');
  const before = await readFile(first.path);
  await writeFile(first.companionPath, 'different');
  await assert.rejects(writeSegmentDocument(candidate(), xml(), directory, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  assert.deepEqual(await readFile(first.path), before);
  const overwritten = await writeSegmentDocument(candidate(), xml(), directory, true);
  assert.equal(overwritten.outcome, 'retrieved');
});
test('writer reports first-publication staging-unlink failure as partial output', async () => {
  const directory = await root();
  await assert.rejects(
    writeSegmentDocument(candidate(), xml(), directory, false, {
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
    writeSegmentDocument(candidate(), xml(), directory, false, {
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
          await writeFile(companion, 'racing author', { flag: 'wx' });
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
    writeSegmentDocument(candidate(), xml(), directory, false, {
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
  const receipt = await writeSegmentDocument(candidate(), xml(), directory, false);
  assert.ok(receipt.path.includes(`${path.sep}custom${path.sep}`));
  const outside = await root();
  const linked = await root();
  await symlink(
    outside,
    path.join(linked, 'force-app'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeSegmentDocument(candidate(), xml(), linked, true));
});
test('retrieve exact route, no replay and independently correlated metadata, without private projection publication', async () => {
  let calls = 0;
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '65.0',
    getUsername: () => 'synthetic',
    _refreshDelegate: () => assert.fail(),
    request: async function (request, options) {
      calls++;
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.match(request.url, /\/v65\.0\/ssot\/segments\/Audience$/u);
      return raw();
    },
  };
  const result = await retrieveSegment(
    connection,
    'Audience',
    '65.0',
    'default',
    async (org, name) => {
      assert.equal(org, 'synthetic');
      assert.equal(name, 'Audience');
      return xml();
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.candidate, candidate());
  assert.equal(result.expectations.runtime.marketSegmentId, 'private-id');
});
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
        getApiVersion: () => '65.0',
        getUsername: () => 'synthetic',
        request: async () => response,
      },
      'Audience',
      '65.0',
      'default',
      async () => assert.fail(),
    );
    assert.equal(result.candidate, undefined);
    assert.ok(result.blockers.length);
  });
}
test('generic404 is not absence proof and latest refuses before request', async () => {
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '65.0',
    getUsername: () => 'synthetic',
    request: async () => {
      throw { statusCode: 404 };
    },
  };
  const result = await retrieveSegment(connection, 'Audience', '65.0', 'default');
  assert.deepEqual(result.blockers, ['SEGMENT_ACQUISITION_FAILED']);
  assert.equal(result.candidate, undefined);
  await assert.rejects(retrieveSegment(connection, 'Audience', 'latest', 'default'));
});
test('standard CLI boundary owns scratch and exact args, validates terminal result and decomposed member', async () => {
  const output = await retrieveSegmentMetadata('synthetic', 'Audience', async (arguments_, cwd) => {
    assert.deepEqual(arguments_, [
      'project',
      'retrieve',
      'start',
      '--metadata',
      'MarketSegmentDefinition:Audience',
      '--target-org',
      'synthetic',
      '--api-version',
      '65.0',
      '--wait',
      '5',
      '--json',
    ]);
    assert.equal(path.dirname(cwd), os.tmpdir());
    const directory = path.join(cwd, 'force-app', 'main', 'default', 'marketSegmentDefinitions');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'Audience.marketSegmentDefinition-meta.xml'), xml());
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        status: 0,
        result: {
          done: true,
          success: true,
          status: 'Succeeded',
          files: [{ type: 'MarketSegmentDefinition', fullName: 'Audience', state: 'Created' }],
        },
      }),
    };
  });
  assert.equal(output, xml());
});
for (const result of [
  { done: false, success: true, status: 'InProgress' },
  { done: true, success: false, status: 'Failed' },
  { done: true, success: true, status: 'Succeeded', files: [] },
  { done: true, success: true, status: 'Succeeded', messages: ['warning'] },
]) {
  test(`standard transport refuses unsupported result ${JSON.stringify(result)}`, async () =>
    assert.rejects(
      retrieveSegmentMetadata('synthetic', 'Audience', async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ status: 0, result }),
      })),
    ));
}
