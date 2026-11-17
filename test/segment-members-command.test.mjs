import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import SegmentMembersExport from '../lib/commands/data360/segment/members/export.js';
import { detailQueryWait } from '../lib/services/segment-members.js';
import { connectRetry } from '../lib/transport/connect-client.js';
import { errorCodeInfo } from '../lib/errors/registry.js';

const origin = 'https://synthetic.my.salesforce.com';
const base = '/services/data/v68.0/ssot';
const segment = (overrides = {}) => ({
  apiName: 'Members_Seg',
  dataSpace: 'default',
  displayName: 'Members Seg',
  marketSegmentId: '1sgaj000000XmQrAAK',
  publishStatus: 'SUCCESS',
  lastPublishedEndDateTime: '2026-11-17T10:00:00.000Z',
  lastSegmentMemberCount: 3,
  segmentMembershipDmo: { latestTable: 'Seg_SM_1__dlm', historyTable: 'Seg_SMH_1__dlm' },
  segmentOnApiName: 'Person__dlm',
  ...overrides,
});
const member = (index) => ({ deltaType: 'new', id: `m${index}`, snapshotType: 'F' });
const page = (rows, totalCount) => ({ data: rows, totalCount, rowCount: rows.length });
const httpError = (statusCode) => Object.assign(new Error('synthetic'), { statusCode });
const notFound = () =>
  Object.assign(new Error('not found'), {
    statusCode: 404,
    name: 'ITEM_NOT_FOUND',
    errorCode: 'ITEM_NOT_FOUND',
    data: { errorCode: 'ITEM_NOT_FOUND', message: 'not found' },
  });

/**
 * Members of a synthetic segment, answered by limit and offset.
 * @param {number} total Member count.
 * @returns {(url: URL) => object} Members route answer.
 */
const members = (total) => (url) => {
  const limit = Number(url.searchParams.get('limit'));
  const offset = Number(url.searchParams.get('offset'));
  return page(
    Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) =>
      member(offset + index),
    ),
    total,
  );
};

/**
 * Command on a scripted JSforce connection: `answer(request, url, count)` returns a body or
 * an Error to throw; the real bound transport (retries, 404 mapping) sits in between.
 * @param {object} flags Parsed flags.
 * @param {(request: object, url: URL, count: number) => unknown} answer Scripted answers.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {Promise<{ command: object, calls: object[], progress: string[], waits: number[], cwd: string }>} Harness.
 */
const harness = async (flags, answer, t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-segment-members-'));
  const calls = [];
  const progress = [];
  const waits = [];
  t.mock.method(connectRetry, 'sleep', async (milliseconds) => {
    waits.push(milliseconds);
  });
  t.mock.method(connectRetry, 'warn', () => {});
  const connection = {
    instanceUrl: origin,
    getUsername: () => 'synthetic@example.invalid',
    request: async (request) => {
      const url = new URL(request.url);
      calls.push({ method: request.method, url, body: request.body });
      const value = answer(request, url, calls.length);
      if (value instanceof Error) throw value;
      return value;
    },
  };
  const command = Object.create(SegmentMembersExport.prototype);
  command.parse = async () => ({
    flags: {
      'result-format': 'csv',
      'include-details': false,
      limit: 1000,
      offset: 0,
      'column-delimiter': 'COMMA',
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveConnection = async () => connection;
  command.reportProgress = (line) => progress.push(line);
  command.pause = async (milliseconds) => {
    waits.push(milliseconds);
  };
  command.cwd = () => cwd;
  return { command, calls, progress, waits, cwd };
};

const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const result = await command.run();
    return { result, exit: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};

const basic = (total, extra) => (request, url, count) => {
  if (url.pathname === `${base}/segments/Members_Seg`) return { segments: [segment()] };
  if (url.pathname === `${base}/segments/Members_Seg/members`)
    return extra?.(url, count) ?? members(total)(url);
  return assert.fail(`unexpected ${url.pathname}`);
};

test('pages through the members route with limit and offset and writes CSV', async (t) => {
  const { command, calls, progress, cwd } = await harness(
    { metadata: 'segment:Members_Seg', limit: 2, 'output-file': 'out.csv' },
    basic(5),
    t,
  );
  const { result, exit } = await run(command);
  assert.equal(exit, undefined);
  assert.equal(result.status, 'success');
  assert.equal(result.result.rowsWritten, 5);
  assert.equal(result.result.totalCount, 5);
  assert.equal(result.result.pages, 3);
  assert.deepEqual(
    calls.slice(1).map(({ method, url }) => `${method} ${url.search}`),
    ['GET ?limit=2&offset=0', 'GET ?limit=2&offset=2', 'GET ?limit=2&offset=4'],
  );
  assert.equal(result.result.outputFile, path.join(cwd, 'out.csv'));
  assert.equal(
    await readFile(path.join(cwd, 'out.csv'), 'utf8'),
    'deltaType,id,snapshotType\nnew,m0,F\nnew,m1,F\nnew,m2,F\nnew,m3,F\nnew,m4,F\n',
  );
  assert.deepEqual(progress, [
    'Segment Members_Seg: 2 of 5 members read.',
    'Segment Members_Seg: 4 of 5 members read.',
    'Segment Members_Seg: 5 of 5 members read.',
  ]);
  assert.deepEqual(result.result.segment, {
    apiName: 'Members_Seg',
    marketSegmentId: '1sgaj000000XmQrAAK',
    dataSpace: 'default',
    publishStatus: 'SUCCESS',
    lastPublishedEndDateTime: '2026-11-17T10:00:00.000Z',
    lastSegmentMemberCount: 3,
  });
});

test('JSON output, query parameters sent as given and a delimiter that needs quoting', async (t) => {
  const { command, calls, cwd } = await harness(
    {
      metadata: 'segment:Members_Seg',
      'result-format': 'json',
      fields: 'Id__c, Delta_Type__c',
      filters: "Delta_Type__c in ('new')",
      'order-by': 'Id__c desc',
      'output-file': 'out.json',
    },
    basic(2),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams), {
    fields: 'Id__c, Delta_Type__c',
    filters: "Delta_Type__c in ('new')",
    orderBy: 'Id__c desc',
    limit: '1000',
    offset: '0',
  });
  assert.deepEqual(JSON.parse(await readFile(path.join(cwd, 'out.json'), 'utf8')), [
    member(0),
    member(1),
  ]);
  const semicolon = await harness(
    { metadata: 'segment:Members_Seg', 'column-delimiter': 'SEMICOLON', 'output-file': 'x.csv' },
    basic(1, () => page([{ id: 'a;b', note: 'say "hi"', count: 2, missing: undefined }], 1)),
    t,
  );
  await run(semicolon.command);
  assert.equal(
    await readFile(path.join(semicolon.cwd, 'x.csv'), 'utf8'),
    'id;note;count;missing\n"a;b";"say ""hi""";2;\n',
  );
});

test('ends at totalCount or an empty page; an offset past the end writes no rows', async (t) => {
  const exact = await harness({ metadata: 'segment:Members_Seg', limit: 3 }, basic(3), t);
  const { result } = await run(exact.command);
  assert.equal(result.result.rowsWritten, 3);
  assert.equal(exact.calls.length, 2, 'no read past totalCount');

  const past = await harness(
    { metadata: 'segment:Members_Seg', offset: 2000, 'output-file': 'past.csv' },
    basic(1100),
    t,
  );
  const empty = await run(past.command);
  assert.equal(empty.result.status, 'success');
  assert.equal(empty.result.result.rowsWritten, 0);
  assert.equal(empty.result.result.totalCount, 1100);
  assert.equal(past.calls.length, 2);
  assert.deepEqual(empty.result.diagnostics.warnings, []);

  // A page shorter than the limit before totalCount: the read continues from the new offset.
  const short = await harness(
    { metadata: 'segment:Members_Seg', limit: 4 },
    basic(5, (url) =>
      url.searchParams.get('offset') === '0'
        ? page([member(0), member(1)], 5)
        : url.searchParams.get('offset') === '2'
          ? page([member(2), member(3), member(4)], 5)
          : assert.fail('read past the end'),
    ),
    t,
  );
  const shortRun = await run(short.command);
  assert.equal(shortRun.result.result.rowsWritten, 5);

  // An empty page ends the read even when totalCount promised more.
  const stops = await harness(
    { metadata: 'segment:Members_Seg', limit: 2 },
    basic(5, (url) =>
      url.searchParams.get('offset') === '0' ? page([member(0)], 5) : page([], 5),
    ),
    t,
  );
  const stopped = await run(stops.command);
  assert.equal(stopped.result.result.rowsWritten, 1);
  assert.equal(stops.calls.length, 3);
});

test('an HTTP 400 (offset refused) is reported, not retried, and leaves no file', async (t) => {
  const { command, calls, cwd } = await harness(
    { metadata: 'segment:Members_Seg', 'output-file': 'out.csv', limit: 2 },
    basic(5, (url) => (url.searchParams.get('offset') === '2' ? httpError(400) : undefined)),
    t,
  );
  const { result, exit } = await run(command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_READ_FAILED');
  assert.match(result.diagnostics.errors[0].message, /HTTP 400/u);
  assert.equal(
    result.diagnostics.errors[0].hint,
    errorCodeInfo('SEGMENT_MEMBERS_READ_FAILED').hint,
  );
  assert.equal(calls.length, 3);
  assert.equal(result.result.outputFile, undefined);
  assert.deepEqual(await readdir(cwd), []);
});

test('reads are retried after HTTP 503, 429 and a reset, then complete', async (t) => {
  const failures = [httpError(503), httpError(429)];
  const { command, waits } = await harness(
    { metadata: 'segment:Members_Seg', limit: 2 },
    basic(3, (url, count) => {
      if (count === 2) return failures[0];
      if (count === 3) return failures[1];
      if (count === 5) return Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      return;
    }),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.rowsWritten, 3);
  assert.deepEqual(waits, [1000, 2000, 1000]);
});

test('a member count that changes during the read stops it and leaves no file', async (t) => {
  const { command, cwd } = await harness(
    { metadata: 'segment:Members_Seg', limit: 2 },
    basic(5, (url) => (url.searchParams.get('offset') === '2' ? page([member(2)], 6) : undefined)),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_CHANGED');
  assert.deepEqual(await readdir(path.join(cwd, 'data', 'default')), []);
});

test('an answer without data and totalCount is unexpected', async (t) => {
  const { command } = await harness(
    { metadata: 'segment:Members_Seg' },
    basic(1, () => ({ rows: [] })),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE');
});

test('default output is data/default/<Name>-<timestamp>.csv; an unpublished empty segment warns', async (t) => {
  const { command, cwd } = await harness(
    { metadata: 'segment:Members_Seg' },
    (request, url) =>
      url.pathname.endsWith('/members')
        ? page([], 0)
        : { segments: [segment({ publishStatus: undefined, lastSegmentMemberCount: 1 })] },
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.match(
    path.relative(cwd, result.result.outputFile),
    /^data[/\\]default[/\\]Members_Seg-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/u,
  );
  assert.equal(await readFile(result.result.outputFile, 'utf8'), '');
  assert.match(result.diagnostics.warnings[0], /only after a publish finished/u);
});

test('an absent segment is SEGMENT_MEMBERS_NOT_FOUND before any member read', async (t) => {
  const { command, calls } = await harness(
    { metadata: 'segment:Members_Seg' },
    () => notFound(),
    t,
  );
  const { result, exit } = await run(command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_NOT_FOUND');
  assert.equal(calls.length, 1);
});

test('selection, scope and detail-mode flag refusals happen before auth', async (t) => {
  for (const [flags, code] of [
    [{}, 'INVALID_SELECTION'],
    [{ metadata: 'segment' }, 'INVALID_SELECTION'],
    [{ metadata: 'dmo:X__dlm' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:Bad-Name' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:S', 'include-details': true, filters: 'x' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:S', 'include-details': true, offset: 5 }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:S', 'api-version': '66.0' }, 'INVALID_SCOPE'],
    [{ metadata: 'segment:S', dataspace: 'other' }, 'INVALID_SCOPE'],
  ]) {
    const { command } = await harness(flags, () => assert.fail('no request'), t);
    command.resolveConnection = () => assert.fail('no auth');
    const { result, exit } = await run(command);
    assert.equal(exit, 1);
    assert.equal(result.diagnostics.errors[0].code, code, JSON.stringify(flags));
  }
  const v67 = await harness(
    { metadata: 'segment:Members_Seg', 'api-version': '67.0' },
    (request, url) => {
      assert.match(url.pathname, /^\/services\/data\/v67\.0\//u);
      return url.pathname.endsWith('/members') ? page([member(0)], 1) : { segments: [segment()] };
    },
    t,
  );
  const v67Run = await run(v67.command);
  assert.equal(v67Run.result.status, 'success');
});

/**
 * Detail mode: metadata of both DMOs, one query-sql POST, status reads, row pages.
 * @param {object} [options] Overrides.
 * @param {number} [options.total] Row count of the query.
 * @param {string[]} [options.statuses] completionStatus of the POST answer, then of each status read.
 * @param {unknown[][]} [options.rows] Rows instead of the generated ones.
 * @param {() => unknown} [options.post] Answer of the POST instead of the default.
 * @returns {(request: object, url: URL) => unknown} Scripted answers.
 */
const details = ({ total = 3, statuses = ['Running', 'Finished'], rows, post } = {}) => {
  let status = 0;
  const metadata = [
    { name: 'ssot__Id__c' },
    { name: 'ssot__FirstName__c' },
    { name: 'membership_key_internal' },
    { name: 'detail_match_count_internal' },
  ];
  return (request, url) => {
    if (url.pathname === `${base}/segments/Members_Seg`) return { segments: [segment()] };
    if (url.pathname === `${base}/metadata`) {
      const name = url.searchParams.get('entityName');
      return name === 'Seg_SM_1__dlm'
        ? {
            metadata: [
              {
                name,
                fields: [{ name: 'Id__c' }, { name: 'Segment_Id__c' }],
                relationships: [
                  {
                    fromEntity: name,
                    toEntity: 'Person__dlm',
                    fromEntityAttribute: 'Id__c',
                    toEntityAttribute: 'ssot__Id__c',
                    cardinality: 'NTOONE',
                  },
                ],
              },
            ],
          }
        : {
            metadata: [
              {
                name,
                fields: [
                  { name: 'ssot__Id__c', displayName: 'Id' },
                  { name: 'ssot__FirstName__c', displayName: 'First Name' },
                ],
              },
            ],
          };
    }
    if (url.pathname === `${base}/query-sql` && request.method === 'POST')
      return (
        post?.() ?? {
          data: [],
          metadata,
          status: { queryId: 'q_1', completionStatus: statuses[0] },
        }
      );
    if (url.pathname === `${base}/query-sql/q_1`)
      return {
        queryId: 'q_1',
        completionStatus: statuses[++status] ?? 'Finished',
        rowCount: total,
      };
    if (url.pathname === `${base}/query-sql/q_1/rows`) {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('rowLimit'));
      if (offset >= total) return httpError(400);
      return {
        data: (
          rows ??
          Array.from({ length: total }, (_, index) => [`p${index}`, `N${index}`, `p${index}`, 1])
        ).slice(offset, offset + limit),
        metadata,
        returnedRows: Math.min(limit, total - offset),
      };
    }
    return assert.fail(`unexpected ${request.method} ${url.pathname}`);
  };
};

test('--include-details joins the membership DMO to the segment DMO through one SQL query', async (t) => {
  const { command, calls, waits, cwd } = await harness(
    { metadata: 'segment:Members_Seg', 'include-details': true, limit: 2, 'output-file': 'd.csv' },
    details(),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.rowsWritten, 3);
  assert.deepEqual(result.result.columns, [
    { name: 'ssot__Id__c', label: 'Id' },
    { name: 'ssot__FirstName__c', label: 'First Name' },
  ]);
  assert.equal(
    await readFile(path.join(cwd, 'd.csv'), 'utf8'),
    'ssot__Id__c,ssot__FirstName__c\np0,N0\np1,N1\np2,N2\n',
  );
  const post = calls.find(({ method }) => method === 'POST');
  assert.equal(post.url.search, '?dataspace=default');
  const { sql, rowLimit } = JSON.parse(post.body);
  assert.equal(rowLimit, 2);
  assert.match(
    sql,
    /FROM "Seg_SM_1__dlm" m\n {2}LEFT JOIN "Person__dlm" d ON m\."Id__c" IS NOT DISTINCT FROM d\."ssot__Id__c"/u,
  );
  assert.match(sql, /WHERE m\."Segment_Id__c" = '1sgaj000000XmQr'/u);
  assert.deepEqual(
    calls
      .filter(({ url }) => url.pathname.endsWith('/rows'))
      .map(({ url }) => url.searchParams.get('offset')),
    ['0', '2'],
    'never past the end',
  );
  assert.deepEqual(waits, [detailQueryWait.intervalMs]);
});

test('detail mode: duplicate matches, missing relationship and the POST rule', async (t) => {
  const ambiguous = await harness(
    { metadata: 'segment:Members_Seg', 'include-details': true },
    details({ total: 1, rows: [['p0', 'N0', 'p0', 2]] }),
    t,
  );
  const ambiguousRun = await run(ambiguous.command);
  assert.equal(ambiguousRun.result.diagnostics.errors[0].code, 'SEGMENT_MEMBER_DETAILS_AMBIGUOUS');

  const unavailable = await harness(
    { metadata: 'segment:Members_Seg', 'include-details': true },
    (request, url) =>
      url.pathname.endsWith('/Members_Seg')
        ? { segments: [segment({ segmentMembershipDmo: undefined })] }
        : assert.fail('no further read'),
    t,
  );
  const unavailableRun = await run(unavailable.command);
  assert.equal(
    unavailableRun.result.diagnostics.errors[0].code,
    'SEGMENT_MEMBER_DETAILS_UNAVAILABLE',
  );

  let posts = 0;
  const unsent = await harness(
    { metadata: 'segment:Members_Seg', 'include-details': true },
    details({
      post: () => {
        posts++;
        return httpError(503);
      },
    }),
    t,
  );
  const failed = await run(unsent.command);
  assert.equal(failed.result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_READ_FAILED');
  assert.equal(posts, 1, 'a POST that may have left is never resent');

  const queryFailed = await harness(
    { metadata: 'segment:Members_Seg', 'include-details': true },
    details({ statuses: ['Running', 'Failed'] }),
    t,
  );
  const stopped = await run(queryFailed.command);
  assert.equal(stopped.result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_READ_FAILED');
  assert.match(stopped.result.diagnostics.errors[0].message, /Failed/u);
});

test('help names the route, paging, output and detail mode', () => {
  assert.match(SegmentMembersExport.description, /GET \/ssot\/segments\/\{Name\}\/members/u);
  assert.match(SegmentMembersExport.description, /never a data360\/ definition folder/u);
  assert.match(SegmentMembersExport.description, /POST \/ssot\/query-sql/u);
  assert.deepEqual(SegmentMembersExport.aliases, [
    'datacloud:segment:members:export',
    'd360:segment:members:export',
    'dc:segment:members:export',
  ]);
});
