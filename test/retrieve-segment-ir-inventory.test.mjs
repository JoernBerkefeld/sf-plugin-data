import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { writeIdentityResolutionDocument } from '../lib/artifacts/write-identity-resolution.js';
import {
  listIdentityResolutionNames,
  retrieveIdentityResolution,
} from '../lib/services/retrieve-identity-resolution.js';
import { listSegmentNames } from '../lib/services/retrieve-segment.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

// Synthetic project roots under the verified OS temp directory.
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-segment-ir-inventory-'));
const instanceUrl = 'https://synthetic.example';

/**
 * A connection whose GETs are answered by `answer`; a thrown answer is a failed request.
 * @param {(url: string) => unknown} answer Response of one GET.
 * @param {string[]} [urls] Receives every requested URL.
 * @returns {object} Connection.
 */
const connectionOf = (answer, urls = []) => ({
  instanceUrl,
  getApiVersion: () => '68.0',
  getUsername: () => 'synthetic',
  request: async (request) => {
    const url = typeof request === 'string' ? request : request.url;
    urls.push(url);
    return structuredClone(answer(url));
  },
});

const segment = (apiName, extra = {}) => ({
  apiName,
  displayName: apiName,
  dataSpace: 'default',
  segmentType: 'DBT',
  segmentOnApiName: 'Person__dlm',
  includeDbt: { models: [{ name: apiName, sql: 'SELECT Person__dlm.Id__c FROM Person__dlm' }] },
  publishInterval: 'NO_REFRESH',
  lookbackPeriod: 'P90D',
  ...extra,
});

test('segment inventory: follows batchSize/offset pages until totalSize', async () => {
  const urls = [];
  const all = ['Charlie', 'Alpha', 'Bravo'];
  const answer = (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return {
      batchSize: 200,
      offset,
      orderByExpression: '[Name asc]',
      totalSize: all.length,
      // Two per page, to see paging with a short server page.
      segments: all.slice(offset, offset + 2).map((name) => segment(name)),
    };
  };
  assert.deepEqual(await listSegmentNames(connectionOf(answer, urls)), [
    'Alpha',
    'Bravo',
    'Charlie',
  ]);
  assert.deepEqual(
    urls.map((url) => new URL(url).search),
    ['?batchSize=200&offset=0', '?batchSize=200&offset=2'],
  );
  assert.ok(urls.every((url) => new URL(url).pathname === '/services/data/v68.0/ssot/segments'));
});

test('segment inventory: unusable entries are skipped with a warning, another space is left out', async () => {
  const warnings = [];
  const names = await listSegmentNames(
    connectionOf(() => ({
      totalSize: 5,
      segments: [
        segment('Good'),
        { displayName: 'no name' },
        segment('bad name'),
        segment('NoSpace', { dataSpace: undefined }),
        segment('Elsewhere', { dataSpace: 'other' }),
      ],
    })),
    warnings,
  );
  assert.deepEqual(names, ['Good']);
  assert.deepEqual(warnings, [
    'segment inventory: skipped the entry at position 1 because it has no usable API name.',
    'segment inventory: skipped "bad name" because it has no usable API name.',
    'segment inventory: skipped "NoSpace" because it has no usable data space.',
  ]);
  // A malformed page stops the listing.
  await assert.rejects(listSegmentNames(connectionOf(() => ({ totalSize: 1 }))), {
    code: 'SEGMENT_ACQUISITION_FAILED',
  });
  // A server ignoring the offset ends the listing on the repeated page.
  let calls = 0;
  const repeated = await listSegmentNames(
    connectionOf(() => {
      calls++;
      return { totalSize: 99, segments: [segment('Same')] };
    }),
  );
  assert.deepEqual([repeated, calls], [['Same'], 2]);
});

test('identity resolution inventory: one unpaged read by owner name', async () => {
  const urls = [];
  const warnings = [];
  const names = await listIdentityResolutionNames(
    connectionOf(
      () => ({
        identityResolutions: [
          { objectApiName: 'Individual_B', dataSpaceName: 'default' },
          { objectApiName: 'Individual_A', dataSpaceName: 'default' },
          { label: 'no owner', dataSpaceName: 'default' },
          { objectApiName: 'Individual_Other', dataSpaceName: 'other' },
          { objectApiName: 'Individual_A', dataSpaceName: 'default' },
        ],
      }),
      urls,
    ),
    warnings,
  );
  assert.deepEqual(names, ['Individual_A', 'Individual_B']);
  assert.deepEqual(urls, [`${instanceUrl}/services/data/v68.0/ssot/identity-resolutions`]);
  assert.deepEqual(warnings, [
    'identity-resolution inventory: skipped the entry at position 2 because it has no usable API name.',
  ]);
  await assert.rejects(listIdentityResolutionNames(connectionOf(() => ({}))), {
    code: 'IDENTITY_RESOLUTION_ACQUISITION_FAILED',
  });
});

/**
 * Offline retrieve command whose GETs are answered by `answer`; the real listings, projections,
 * binder and writers run.
 * @param {string[]} metadata Selectors.
 * @param {string} cwd Project root.
 * @param {(url: string) => unknown} answer Response of one GET.
 * @returns {object} Command.
 */
function command(metadata, cwd, answer) {
  const instance = Object.create(Retrieve.prototype);
  instance.parse = async () => ({
    flags: {
      metadata,
      'api-version': 'auto',
      overwrite: false,
      'target-org': 'synthetic',
      'output-dir': cwd,
    },
  });
  instance.jsonEnabled = () => true;
  instance.log = () => {};
  // Object.create skips the class fields: set the real readers and writers.
  instance.acquireIdentityResolution = retrieveIdentityResolution;
  instance.writeIdentityResolution = writeIdentityResolutionDocument;
  instance.writeSegment = writeSegmentDocument;
  const connection = connectionOf(answer);
  instance.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => connection,
  });
  return instance;
}
const run = async (instance) => {
  const previous = process.exitCode;
  try {
    return await instance.run();
  } finally {
    process.exitCode = previous;
  }
};

test('bare segment and identity-resolution retrieve every listed item; one failing item never blocks the others', async () => {
  const cwd = await scratch();
  const ir = nativeIrFixture();
  const answer = (url) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname.endsWith('/ssot/segments')) {
      const offset = Number(searchParams.get('offset'));
      const listed = [segment('Alpha'), segment('Broken'), { displayName: 'unusable' }];
      return { totalSize: 3, batchSize: 200, offset, segments: listed.slice(offset, offset + 2) };
    }
    if (pathname.endsWith('/ssot/segments/Broken')) throw new Error('synthetic failure');
    if (pathname.includes('/ssot/segments/'))
      return { segments: [segment(pathname.split('/').at(-1))] };
    if (pathname.endsWith('/ssot/identity-resolutions'))
      return {
        identityResolutions: [
          { objectApiName: ir.objectApiName, dataSpaceName: 'default' },
          { objectApiName: 'Individual_Gone', dataSpaceName: 'default' },
        ],
      };
    if (pathname.endsWith(`/ssot/identity-resolutions/${ir.objectApiName}`)) return ir;
    if (pathname.includes('/ssot/identity-resolutions/')) throw new Error('synthetic failure');
    // The DMO a segment is built on.
    return { name: 'Person__dlm', id: 'source-local' };
  };
  const result = await run(command(['segment', 'identity-resolution'], cwd, answer));
  assert.equal(result.status, 'failed', JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.result.items.map(({ family, identity, outcome }) => [family, identity.apiName, outcome]),
    [
      ['segment', 'Alpha', 'retrieved'],
      ['identity-resolution', ir.objectApiName, 'retrieved'],
    ],
  );
  assert.deepEqual(result.diagnostics.errors.map(({ identity }) => identity?.apiName).toSorted(), [
    'Broken',
    'Individual_Gone',
  ]);
  assert.match(
    result.diagnostics.warnings.join('\n'),
    /segment inventory: skipped the entry at position 2 because it has no usable API name/u,
  );
  const root = path.join(cwd, 'force-app', 'main', 'default', 'data360');
  const segmentFiles = await readdir(path.join(root, 'segments'));
  assert.deepEqual(segmentFiles.toSorted(), ['Alpha.segment.Alpha.sql', 'Alpha.segment.json']);
  assert.deepEqual(await readdir(path.join(root, 'identityResolution')), [
    `${ir.objectApiName}.identityResolution.json`,
  ]);
});

/**
 * A malformed segment listing; the named segment and its DMO still read.
 * @param {string} url Requested URL.
 * @returns {unknown} Response.
 */
const brokenListing = (url) => {
  const { pathname } = new URL(url);
  if (pathname.endsWith('/ssot/segments')) return { unexpected: true };
  if (pathname.includes('/ssot/segments/')) return { segments: [segment('Alpha')] };
  return { name: 'Person__dlm', id: 'source-local' };
};

test('a failing segment listing fails that inventory only; a named segment is still retrieved', async () => {
  const cwd = await scratch();
  const result = await run(command(['segment', 'segment:Alpha'], cwd, brokenListing));
  assert.deepEqual(
    result.diagnostics.errors.map(({ code, family }) => [code, family]),
    [['SEGMENT_ACQUISITION_FAILED', 'segment']],
  );
  assert.deepEqual(
    result.result.items.map(({ identity }) => identity.apiName),
    ['Alpha'],
  );
});

test('retrieve help keeps the other inventory statements', () => {
  for (const text of [
    'Transform inventory is unsupported.',
    'Stream inventory is unsupported.',
    'bare relationship inventory is unavailable.',
    'Graph inventory is blocked.',
    'bare -m calculated-insight every insight the API lists',
    'bare -m segment every default-space segment the API lists',
    'a UI segment (built in the segment canvas) is written as a normal <Name>.segment.json',
    'exclusion criteria or the Waterfall, Real-Time or Lookalike type',
  ])
    assert.ok(Retrieve.description.includes(text), text);
  assert.doesNotMatch(
    Retrieve.description,
    /Segment inventory is not available|IR inventory is blocked/u,
  );
  assert.match(
    Retrieve.flags.metadata.summary,
    /data-stream:ApiName, data-transform:Name and data-graph:ApiName are exact-only; .*bare segment, identity-resolution or calculated-insight/u,
  );
});
