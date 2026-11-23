import assert from 'node:assert/strict';
import test from 'node:test';
import { listSegments, resolveSegment, SegmentError } from 'sf-plugin-data/api';

const instanceUrl = 'https://synthetic.example';

/**
 * A connection over a synthetic org: segments per data space, and the data space list.
 * @param {Record<string, object[]>} bySpace Segment list entries per data space.
 * @param {string[]} [urls] Receives every requested URL.
 * @returns {object} Connection.
 */
const orgOf = (bySpace, urls = []) => ({
  instanceUrl,
  request: async (request) => {
    const url = new URL(typeof request === 'string' ? request : request.url);
    urls.push(url.pathname + url.search);
    if (url.pathname === '/services/data/v68.0/ssot/data-spaces')
      return {
        totalSize: Object.keys(bySpace).length,
        dataSpaces: Object.keys(bySpace).map((name) =>
          name === 'default' ? { name } : { name, prefix: 'ds2' },
        ),
      };
    assert.equal(url.pathname, '/services/data/v68.0/ssot/segments');
    const space = url.searchParams.get('dataspace');
    const offset = Number(url.searchParams.get('offset'));
    const all = bySpace[space] ?? [];
    return { totalSize: all.length, segments: structuredClone(all.slice(offset, offset + 2)) };
  },
});

const row = (apiName, marketSegmentId, dataSpace = 'default', extra = {}) => ({
  apiName,
  marketSegmentId,
  dataSpace,
  displayName: apiName,
  segmentOnApiName: 'UnifiedssotIndividualMkt__dlm',
  segmentStatus: 'ACTIVE',
  publishStatus: 'SUCCESS',
  segmentType: 'Dbt',
  ...extra,
});

const spring = row('Spring', '1sgaj000000PveDAAS');
const summer = row('Summer', '1sgaj000000PveEAAS', 'default', { publishStatus: '' });
const autumn = row('Autumn', '1sgaj000000PveFAAS');

test('listSegments pages the list of one data space with ?dataspace= and shapes the rows', async () => {
  const urls = [];
  const rows = await listSegments(orgOf({ default: [spring, summer, autumn] }, urls), {
    dataSpace: 'default',
  });
  assert.deepEqual(urls, [
    '/services/data/v68.0/ssot/segments?batchSize=200&offset=0&dataspace=default',
    '/services/data/v68.0/ssot/segments?batchSize=200&offset=2&dataspace=default',
  ]);
  assert.deepEqual(rows, [
    {
      apiName: 'Spring',
      marketSegmentId: '1sgaj000000PveDAAS',
      dataSpace: 'default',
      segmentOnApiName: 'UnifiedssotIndividualMkt__dlm',
      segmentStatus: 'ACTIVE',
      publishStatus: 'SUCCESS',
    },
    {
      apiName: 'Summer',
      marketSegmentId: '1sgaj000000PveEAAS',
      dataSpace: 'default',
      segmentOnApiName: 'UnifiedssotIndividualMkt__dlm',
      segmentStatus: 'ACTIVE',
    },
    {
      apiName: 'Autumn',
      marketSegmentId: '1sgaj000000PveFAAS',
      dataSpace: 'default',
      segmentOnApiName: 'UnifiedssotIndividualMkt__dlm',
      segmentStatus: 'ACTIVE',
      publishStatus: 'SUCCESS',
    },
  ]);
});

test('listSegments keeps only entries of the data space even if the server sends others', async () => {
  const rows = await listSegments(
    orgOf({ dataspace2: [row('ds2_A', '1sgaj000000PveGAAS', 'dataspace2'), spring] }),
    { dataSpace: 'dataspace2' },
  );
  assert.deepEqual(
    rows.map((entry) => entry.apiName),
    ['ds2_A'],
  );
});

test('listSegments fails instead of skipping an entry without record ID or API name', async () => {
  for (const broken of [
    row('NoId'),
    row('BadId', 'xyz'),
    { marketSegmentId: '1sgaj000000PveHAAS', dataSpace: 'default' },
  ])
    await assert.rejects(
      listSegments(orgOf({ default: [spring, broken] }), { dataSpace: 'default' }),
      (error) => error instanceof SegmentError && error.code === 'SEGMENT_ACQUISITION_FAILED',
    );
});

test('resolveSegment finds a segment by API name or by record ID without reading other spaces', async () => {
  const urls = [];
  const org = orgOf({ default: [spring, autumn] }, urls);
  const byName = await resolveSegment(org, { dataSpace: 'default', apiName: 'Autumn' });
  assert.equal(byName.marketSegmentId, '1sgaj000000PveFAAS');
  const byId = await resolveSegment(org, {
    dataSpace: 'default',
    marketSegmentId: '1sgaj000000PveDAAS',
  });
  assert.equal(byId.apiName, 'Spring');
  assert.ok(urls.every((url) => !url.includes('data-spaces')));
});

test('resolveSegment refuses a segment of another data space, by ID and by name', async () => {
  const org = orgOf({ default: [spring], dataspace2: [] });
  for (const lookup of [
    { dataSpace: 'dataspace2', marketSegmentId: '1sgaj000000PveDAAS' },
    { dataSpace: 'dataspace2', apiName: 'Spring' },
  ])
    await assert.rejects(resolveSegment(org, lookup), (error) => {
      assert.ok(error instanceof SegmentError);
      assert.equal(error.code, 'SEGMENT_OTHER_DATASPACE');
      assert.match(error.message, /in the data space default, not in dataspace2/u);
      return true;
    });
});

test('resolveSegment answers SEGMENT_NOT_FOUND when no data space has the segment', async () => {
  await assert.rejects(
    resolveSegment(orgOf({ default: [spring], dataspace2: [] }), {
      dataSpace: 'default',
      apiName: 'Winter',
    }),
    (error) => {
      assert.equal(error.code, 'SEGMENT_NOT_FOUND');
      assert.match(error.message, /API name Winter/u);
      return true;
    },
  );
});
