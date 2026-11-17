import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import SegmentMembersExport from '../lib/commands/data360/segment/members/export.js';
import { detailQueryWait } from '../lib/services/segment-members.js';
import {
  formatMemberValue,
  memberColumnHeaders,
  memberDelimiter,
  memberFileName,
} from '../lib/artifacts/write-member-export.js';
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
      'column-headers': 'label',
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

test('default output is data/default/<display name>-<timestamp>.csv; an unpublished empty segment warns', async (t) => {
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
    /^data[/\\]default[/\\]Members-Seg-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/u,
  );
  assert.equal(await readFile(result.result.outputFile, 'utf8'), '');
  assert.match(result.diagnostics.warnings[0], /only after a publish finished/u);
});

test('the default file name is the file-safe display name, else the API name', async (t) => {
  for (const [displayName, stem] of [
    ['MCNEXT Pagination Fixture 20261016', 'MCNEXT-Pagination-Fixture-20261016'],
    ['spider-man', 'spider-man'],
    ['Annual: Promo / West?', 'Annual-Promo-West'],
    [undefined, 'Members_Seg'],
  ]) {
    const { command, cwd } = await harness(
      { metadata: 'segment:Members_Seg', 'result-format': 'json' },
      (request, url) =>
        url.pathname.endsWith('/members')
          ? page([member(0)], 1)
          : { segments: [segment({ displayName })] },
      t,
    );
    const { result } = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    const file = path.relative(cwd, result.result.outputFile);
    assert.equal(path.dirname(file), path.join('data', 'default'));
    assert.match(path.basename(file), /^(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/u);
    assert.equal(path.basename(file).slice(0, -'-YYYY-MM-DD_HH-mm-ss.json'.length), stem);
  }
});

test('memberFileName makes a display name file-safe like the mcnext export', () => {
  // The three assertions of mcnext's sanitizeFilename test.
  assert.equal(memberFileName('Annual: Promo / West?'), 'Annual-Promo-West');
  assert.equal(memberFileName('CON'), 'segment-CON');
  assert.equal(memberFileName('   ... '), 'segment-members');
  // Display names of the live rename probe and the pagination fixture.
  assert.equal(memberFileName('Peter Parker$'), 'Peter-Parker$');
  assert.equal(memberFileName('spider-man'), 'spider-man');
  assert.equal(
    memberFileName('MCNEXT Pagination Fixture 20261016'),
    'MCNEXT-Pagination-Fixture-20261016',
  );
  // Separators of both platforms, control characters, dots and device names.
  assert.equal(memberFileName(String.raw`a/b\c|d*e"f<g>h`), 'a-b-c-d-e-f-g-h');
  assert.equal(memberFileName('tab\there\u0001x'), 'tab-here-x');
  assert.equal(memberFileName('..hidden.'), 'hidden');
  assert.equal(memberFileName('lpt1.txt'), 'segment-lpt1.txt');
  assert.equal(memberFileName('Console'), 'Console');
});

test('an absent segment is SEGMENT_MEMBERS_NOT_FOUND before any member read', async (t) => {
  const { command, calls } = await harness(
    { metadata: 'segment:Members_Seg' },
    (request, url) => (url.pathname === `${base}/segments` ? { segments: [] } : notFound()),
    t,
  );
  const { result, exit } = await run(command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_NOT_FOUND');
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    [`${base}/segments/Members_Seg`, `${base}/segments`],
  );
});

test('selection, scope and detail-mode flag refusals happen before auth', async (t) => {
  for (const [flags, code] of [
    [{}, 'INVALID_SELECTION'],
    [{ metadata: 'segment' }, 'INVALID_SELECTION'],
    [{ metadata: 'dmo:X__dlm' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:   ' }, 'INVALID_SELECTION'],
    [{ metadata: 'segment:a\nb' }, 'INVALID_SELECTION'],
    [{ metadata: `segment:${'x'.repeat(256)}` }, 'INVALID_SELECTION'],
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
 * @param {object[]} [options.fields] Fields of the segment DMO instead of the default.
 * @returns {(request: object, url: URL) => unknown} Scripted answers.
 */
const details = ({ total = 3, statuses = ['Running', 'Finished'], rows, post, fields } = {}) => {
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
                fields: fields ?? [
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
  assert.equal(result.result.columnHeaders, 'label');
  assert.deepEqual(result.result.columns, [
    { name: 'ssot__Id__c', label: 'Id', header: 'Id' },
    { name: 'ssot__FirstName__c', label: 'First Name', header: 'First Name' },
  ]);
  assert.equal(
    await readFile(path.join(cwd, 'd.csv'), 'utf8'),
    'Id,First Name\np0,N0\np1,N1\np2,N2\n',
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

// eslint-disable-next-line unicorn/no-null -- query-sql rows report an empty field as null.
const wireNull = null;

test('formatMemberValue formats DATE and DATE_TIME as the mcnext export intends', () => {
  // The four assertions of mcnext's normalizeFieldValue test.
  assert.equal(formatMemberValue('1982-12-16T00:00:00+00:00', 'DATE'), '1982-12-16');
  assert.equal(
    formatMemberValue('2026-10-01T13:15:16.123+02:00', 'DateTime'),
    '2026-10-01 13:15:16.123+02:00',
  );
  assert.equal(formatMemberValue(wireNull, 'DATE'), wireNull);
  assert.equal(formatMemberValue('not-a-date', 'DATE'), 'not-a-date');
  assert.equal(formatMemberValue('2026-10-01T13:15:16Z', 'Text'), '2026-10-01T13:15:16Z');
  assert.equal(formatMemberValue(42, 'DATE'), 42);
  // /ssot/metadata returns DATE and DATE_TIME (live); mcnext's check missed DATE_TIME.
  for (const type of ['DATE_TIME', 'DATETIME', 'date_time', 'Date Time'])
    assert.equal(
      formatMemberValue('2026-10-16T19:19:51+00:00', type),
      '2026-10-16 19:19:51+00:00',
      type,
    );
  assert.equal(formatMemberValue('2026-08-01', 'DATE'), '2026-08-01');
  assert.equal(
    formatMemberValue('2026-10-16T19:19:51+00:00', 'STRING'),
    '2026-10-16T19:19:51+00:00',
  );
  assert.equal(formatMemberValue('2026-10-16T19:19:51+00:00'), '2026-10-16T19:19:51+00:00');
});

test('--include-details formats DATE and DATE_TIME values in CSV and JSON', async (t) => {
  const fields = [
    { name: 'Birth__c', displayName: 'Birth', type: 'DATE' },
    { name: 'Seen__c', displayName: 'Seen', type: 'DATE_TIME' },
  ];
  const rows = [
    ['1982-12-16T00:00:00+00:00', '2026-10-01T13:15:16.123+02:00', 'p0', 1],
    [wireNull, wireNull, 'p1', 0],
  ];
  for (const format of ['csv', 'json']) {
    const { command, cwd } = await harness(
      {
        metadata: 'segment:Members_Seg',
        'include-details': true,
        'result-format': format,
        'output-file': `dates.${format}`,
      },
      details({ fields, rows, total: 2 }),
      t,
    );
    const { result } = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(
      result.result.columns.map(({ dataType }) => dataType),
      ['DATE', 'DATE_TIME'],
    );
    const written = await readFile(path.join(cwd, `dates.${format}`), 'utf8');
    if (format === 'csv')
      assert.equal(written, 'Birth,Seen\n1982-12-16,2026-10-01 13:15:16.123+02:00\n,\n');
    else
      assert.deepEqual(JSON.parse(written), [
        { Birth: '1982-12-16', Seen: '2026-10-01 13:15:16.123+02:00' },
        { Birth: wireNull, Seen: wireNull },
      ]);
  }
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

/**
 * Segment list and reads for selection tests: the list answers `entries` in pages of
 * `batchSize`, a read by API name answers that entry, anything else 404.
 * @param {object[]} entries List entries.
 * @param {object} [options] Overrides.
 * @param {boolean} [options.totalSize] The list reports totalSize.
 * @returns {(request: object, url: URL) => unknown} Scripted answers.
 */
const listed =
  (entries, { totalSize = true } = {}) =>
  (request, url) => {
    if (url.pathname === `${base}/segments`) {
      const size = Number(url.searchParams.get('batchSize'));
      const offset = Number(url.searchParams.get('offset'));
      return {
        segments: entries.slice(offset, offset + size),
        ...(totalSize ? { totalSize: entries.length } : {}),
      };
    }
    const name = url.pathname.slice(`${base}/segments/`.length);
    if (name.endsWith('/members')) return members(2)(url);
    const found = entries.find((entry) => entry.apiName === name);
    return found ? { segments: [segment(found)] } : notFound();
  };

const twin = (apiName, marketSegmentId) => ({
  apiName,
  displayName: 'Shared Name',
  marketSegmentId,
  dataSpace: 'default',
});

test('a display name is found through the segment list, then read by its API name', async (t) => {
  const { command, calls, cwd } = await harness(
    { metadata: 'segment:Members Seg', 'output-file': 'n.csv' },
    listed([twin('Other_Seg', '1sgaj000000AAAAAAA'), { ...segment(), displayName: 'Members Seg' }]),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.segment.apiName, 'Members_Seg');
  assert.equal(result.result.rowsWritten, 2);
  assert.deepEqual(
    calls.map(({ url }) => url.pathname + url.search),
    [
      `${base}/segments?batchSize=200&offset=0`,
      `${base}/segments/Members_Seg`,
      `${base}/segments/Members_Seg/members?limit=1000&offset=0`,
    ],
    'a value that cannot be an API name is never put into the URL path',
  );
  assert.deepEqual(
    result.result.routes.map(({ operation }) => operation),
    ['segments.get', 'segments.list', 'segments.members'],
  );
  assert.equal(
    await readFile(path.join(cwd, 'n.csv'), 'utf8'),
    'deltaType,id,snapshotType\nnew,m0,F\nnew,m1,F\n',
  );
});

test('a record ID is found through the segment list, never put into the URL path', async (t) => {
  const { command, calls } = await harness(
    { metadata: 'segment:1sgaj000000XmQrAAK' },
    listed([twin('Shared_A', '1sgaj000000AAAAAAA'), segment()]),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.segment.apiName, 'Members_Seg');
  assert.equal(result.result.segment.marketSegmentId, '1sgaj000000XmQrAAK');
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    [`${base}/segments`, `${base}/segments/Members_Seg`, `${base}/segments/Members_Seg/members`],
  );
});

test('the search is exact, case-sensitive and covers only the default data space', async (t) => {
  for (const selection of ['members seg', 'Other Space Seg', '1sgaj000000XmQr']) {
    const { command, calls } = await harness(
      { metadata: `segment:${selection}` },
      listed([
        { ...segment(), displayName: 'Members Seg' },
        {
          apiName: 'Other_Seg',
          displayName: 'Other Space Seg',
          marketSegmentId: '1sgaj000000CCCCCCC',
          dataSpace: 'other',
        },
      ]),
      t,
    );
    const { result, exit } = await run(command);
    assert.equal(exit, 1);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_MEMBERS_NOT_FOUND', selection);
    assert.ok(!calls.some(({ url }) => url.pathname.endsWith('/members')));
  }
});

test('the segment list is read page by page until totalSize, or a short page without it', async (t) => {
  const many = Array.from({ length: 201 }, (_, index) => ({
    apiName: `Seg_${index}`,
    displayName: `Seg ${index}`,
    marketSegmentId: `1sgaj00000${String(index).padStart(5, '0')}AAA`,
    dataSpace: 'default',
  }));
  for (const totalSize of [true, false]) {
    const { command, calls } = await harness(
      { metadata: 'segment:Seg 200' },
      listed(many, { totalSize }),
      t,
    );
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(result.result.segment.apiName, 'Seg_200');
    assert.deepEqual(
      calls.filter(({ url }) => url.pathname === `${base}/segments`).map(({ url }) => url.search),
      ['?batchSize=200&offset=0', '?batchSize=200&offset=200'],
    );
  }
  const malformed = await harness({ metadata: 'segment:Seg 1' }, () => ({ items: [] }), t);
  const malformedRun = await run(malformed.command);
  assert.equal(
    malformedRun.result.diagnostics.errors[0].code,
    'SEGMENT_MEMBERS_UNEXPECTED_RESPONSE',
  );
});

test('a shared display name without a terminal stops with the candidates', async (t) => {
  const { command, calls, cwd } = await harness(
    { metadata: 'segment:Shared Name' },
    listed([twin('Shared_A', '1sgaj000000AAAAAAA'), twin('Shared_B', '1sgaj000000BBBBBBB')]),
    t,
  );
  command.chooseSegment = () => assert.fail('no prompt with --json');
  const { result, exit } = await run(command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'blocked');
  const [error] = result.diagnostics.errors;
  assert.equal(error.code, 'SEGMENT_SELECTION_AMBIGUOUS');
  assert.match(error.message, /"Shared Name" matches 2 segments in the default data space:/u);
  assert.match(error.message, /- "Shared Name" \(API name Shared_A, ID 1sgaj000000AAAAAAA\)/u);
  assert.match(error.message, /- "Shared Name" \(API name Shared_B, ID 1sgaj000000BBBBBBB\)/u);
  assert.equal(error.hint, errorCodeInfo('SEGMENT_SELECTION_AMBIGUOUS').hint);
  assert.equal(calls.length, 1, 'only the list was read');
  assert.deepEqual(await readdir(cwd), []);
});

test('a shared display name in a terminal asks which segment to export', async (t) => {
  const entries = [twin('Shared_A', '1sgaj000000AAAAAAA'), twin('Shared_B', '1sgaj000000BBBBBBB')];
  const asked = [];
  const { command } = await harness({ metadata: 'segment:Shared Name' }, listed(entries), t);
  command.interactive = () => true;
  command.chooseSegment = async (candidates) => {
    asked.push(candidates);
    return candidates[1];
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.segment.apiName, 'Shared_B');
  assert.deepEqual(asked, [
    entries.map(({ apiName, marketSegmentId, displayName }) => ({
      apiName,
      marketSegmentId,
      displayName,
    })),
  ]);

  const cancelled = await harness({ metadata: 'segment:Shared Name' }, listed(entries), t);
  cancelled.command.interactive = () => true;
  cancelled.command.chooseSegment = async () => {
    throw new Error('User force closed the prompt');
  };
  const cancelledRun = await run(cancelled.command);
  assert.equal(cancelledRun.result.diagnostics.errors[0].code, 'SEGMENT_SELECTION_AMBIGUOUS');
  assert.match(cancelledRun.result.diagnostics.errors[0].message, /none was chosen/u);
});

test('an API name wins over another segment with that display name, without a list read', async (t) => {
  const { command, calls } = await harness(
    { metadata: 'segment:Shared_A' },
    listed([
      twin('Shared_A', '1sgaj000000AAAAAAA'),
      { ...twin('Shared_B', '1sgaj000000BBBBBBB'), displayName: 'Shared_A' },
    ]),
    t,
  );
  const { result } = await run(command);
  assert.equal(result.result.segment.apiName, 'Shared_A');
  assert.ok(!calls.some(({ url }) => url.pathname === `${base}/segments`));
});

test('--column-headers: labels by default, API names on request, stable suffixes', async (t) => {
  const fields = [
    { name: 'ssot__Id__c', displayName: '  ' },
    { name: 'ssot__FirstName__c', displayName: 'ssot__Id__c' },
  ];
  const labels = await harness(
    {
      metadata: 'segment:Members_Seg',
      'include-details': true,
      'result-format': 'json',
      'output-file': 'l.json',
    },
    details({ fields, total: 1 }),
    t,
  );
  const labelRun = await run(labels.command);
  assert.equal(labelRun.result.status, 'success', JSON.stringify(labelRun.result.diagnostics));
  assert.deepEqual(
    labelRun.result.result.columns.map(({ header }) => header),
    ['ssot__Id__c', 'ssot__Id__c_2'],
  );
  assert.deepEqual(JSON.parse(await readFile(path.join(labels.cwd, 'l.json'), 'utf8')), [
    { ssot__Id__c: 'p0', ssot__Id__c_2: 'N0' },
  ]);

  const names = await harness(
    {
      metadata: 'segment:Members_Seg',
      'include-details': true,
      'column-headers': 'api-name',
      'column-delimiter': ';',
      'output-file': 'a.csv',
    },
    details({ total: 1 }),
    t,
  );
  const nameRun = await run(names.command);
  assert.equal(nameRun.result.result.columnHeaders, 'api-name');
  assert.equal(
    await readFile(path.join(names.cwd, 'a.csv'), 'utf8'),
    'ssot__Id__c;ssot__FirstName__c\np0;N0\n',
  );

  assert.deepEqual(
    memberColumnHeaders(
      [
        { name: 'A__c', label: 'Name' },
        { name: 'B__c', label: 'Name' },
        { name: 'C__c', label: 'Name_2' },
        { name: 'D__c', label: '' },
        { name: 'E__c', label: 'Name' },
      ],
      'label',
    ),
    ['Name', 'Name_2', 'Name_2_2', 'D__c', 'Name_3'],
  );
});

test('--column-delimiter takes a name or the character itself', async (t) => {
  assert.deepEqual(
    ['COMMA', ',', 'SEMICOLON', ';', 'TAB', 'PIPE', '|', 'CARET', '^', 'BACKQUOTE', '`'].map(
      (value) => memberDelimiter(value),
    ),
    [',', ',', ';', ';', '\t', '|', '|', '^', '^', '`', '`'],
  );
  assert.deepEqual(SegmentMembersExport.flags['column-delimiter'].options, [
    'COMMA',
    'SEMICOLON',
    'TAB',
    'PIPE',
    'CARET',
    'BACKQUOTE',
    ',',
    ';',
    '|',
    '^',
    '`',
  ]);
  const { command, cwd } = await harness(
    { metadata: 'segment:Members_Seg', 'column-delimiter': ';', 'output-file': 's.csv' },
    basic(1),
    t,
  );
  await run(command);
  assert.equal(
    await readFile(path.join(cwd, 's.csv'), 'utf8'),
    'deltaType;id;snapshotType\nnew;m0;F\n',
  );
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
