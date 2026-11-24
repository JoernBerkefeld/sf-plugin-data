import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import Publish from '../lib/commands/data360/publish.js';
import { publishSegment, segmentPublishWait } from '../lib/services/publish-segment.js';
import { projectSegment } from '../lib/services/retrieve-segment.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { readDeployInputs, verifySegmentInputDigest } from '../lib/artifacts/read-deploy-input.js';
import {
  createVerbatimDocument,
  serializeVerbatimDocument,
} from '../lib/artifacts/verbatim-document.js';
import { ConnectClient, ConnectError } from '../lib/transport/connect-client.js';
import {
  apiDiagnostic,
  connectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
import { errorCodeInfo } from '../lib/errors/registry.js';

const origin = 'https://synthetic.my.salesforce.com';
const id = '1sgaj000000e5PBAAY';
const sql =
  'SELECT UnifiedssotIndividualMkt__dlm.ssot__Id__c FROM UnifiedssotIndividualMkt__dlm WHERE 1 = 0';
const runtime = (overrides = {}) => ({
  apiName: 'CliPub',
  createdBy: { id: '005aj00000aIu5SAAS' },
  createdDate: '2026-11-17T10:00:00.000Z',
  dataSpace: 'default',
  description: 'Synthetic publish',
  displayName: 'Cli Pub',
  includeCriteria: 'rendered',
  includeDbt: { models: [{ name: 'CliPub', sql }] },
  lastModifiedBy: { id: '005aj00000aIu5SAAS' },
  lastModifiedDate: '2026-11-17T10:00:00.000Z',
  lastSegmentMemberCount: 0,
  lookbackPeriod: 'P90D',
  marketSegmentDefinitionId: '3HXaj0000005nXxGAI',
  marketSegmentId: id,
  parameters: [],
  publishInterval: 'NO_REFRESH',
  segmentMembershipDmo: { historyTable: 'History__dlm', latestTable: 'Latest__dlm' },
  segmentOnApiName: 'UnifiedssotIndividualMkt__dlm',
  segmentOnId: '0gjaj00000I4NEzAAN',
  segmentStatus: 'ACTIVE',
  segmentType: 'DBT',
  ...overrides,
});

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

// Command with a scripted segment read sequence and a publish answer. `reads` is called with
// the read count (0 = admission read) and returns a runtime or an error to throw.
const harness = (flags, { reads, publish } = {}) => {
  let clock = 1_000_000;
  const calls = { auth: 0, gets: [], posts: [], waits: [], progress: [] };
  const command = Object.create(Publish.prototype);
  command.parse = async () => ({ flags: { preview: false, ...flags } });
  command.jsonEnabled = () => true;
  command.resolveInputs = readDeployInputs;
  command.verifySegmentInput = verifySegmentInputDigest;
  command.segmentProgress = (line) => calls.progress.push(line);
  const connection = { instanceUrl: origin, getApiVersion: () => '68.0' };
  command.resolveConnection = async () => {
    calls.auth++;
    return connection;
  };
  const client = {
    get: async (route) => {
      calls.gets.push(route);
      const value = (reads ?? (() => runtime()))(calls.gets.length - 1, calls);
      if (value instanceof Error) throw value;
      return { segments: [value] };
    },
    publishSegment: async (marketSegmentId) => {
      calls.posts.push(marketSegmentId);
      if (publish) return publish();
      return {
        errors: [{}],
        jobId: 'job-1',
        partitionId: 'partition',
        publishStatus: 'PUBLISHING',
        segmentId: marketSegmentId,
        success: true,
      };
    },
  };
  command.publishSegment = (apiName, conn, selection, options) => {
    calls.waitTimeoutSeconds = options.waitTimeoutSeconds;
    return publishSegment(apiName, conn, selection, {
      ...options,
      client,
      now: () => clock,
      delay: async (milliseconds) => {
        calls.waits.push(milliseconds);
        clock += milliseconds;
      },
    });
  };
  return { command, calls };
};
const notFound = () => {
  const error = new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
  return error;
};
const segmentFile = async (value = runtime()) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-segment-publish-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const { candidate } = projectSegment({ segments: [value] }, 'CliPub', 'retrieve');
  return writeSegmentDocument(candidate, root, false);
};

test('the client publishes by record ID with one bodiless POST and never resends it', async () => {
  for (const statusCode of [201, 503, 'reset']) {
    let requests = 0;
    const connection = Object.create(Connection.prototype);
    Object.assign(connection, {
      instanceUrl: origin,
      version: '68.0',
      accessToken: 'synthetic-token',
      logger: { getRawLogger: () => ({ debug: () => {} }) },
      _refreshDelegate: { isRefreshing: () => false, refresh: () => assert.fail('no refresh') },
      _propagators: [],
      _transport: {
        httpRequest: (request, options) => {
          requests++;
          assert.equal(request.method, 'POST');
          assert.equal(
            request.url,
            `${origin}/services/data/v68.0/ssot/segments/${id}/actions/publish`,
          );
          // An undefined body is never sent by JSforce; the empty body goes out as Content-Length 0.
          assert.equal(request.body, '');
          assert.equal(options.retry.maxRetries, 0);
          const response =
            statusCode === 'reset'
              ? Promise.reject(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
              : Promise.resolve({
                  statusCode,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(
                    statusCode === 201
                      ? { publishStatus: 'PUBLISHING', success: true, jobId: 'job-1' }
                      : [{ errorCode: 'SERVER_UNAVAILABLE', message: 'Try later' }],
                  ),
                });
          response.stream = () => new PassThrough();
          return response;
        },
      },
    });
    const operation = new ConnectClient(connection, '68.0').publishSegment(id);
    if (statusCode === 201)
      assert.deepEqual(await operation, {
        publishStatus: 'PUBLISHING',
        success: true,
        jobId: 'job-1',
      });
    else await assert.rejects(operation, ConnectError);
    assert.equal(requests, 1, String(statusCode));
  }
  const unused = { instanceUrl: origin, request: () => assert.fail('Unexpected request') };
  for (const bad of ['CliPub', '0gjaj00000I4NEzAAN', `${id}/x`])
    await assert.rejects(new ConnectClient(unused, '68.0').publishSegment(bad), {
      code: 'INVALID_REQUEST',
    });
  await assert.rejects(new ConnectClient(unused, '65.0').publishSegment(id), {
    code: 'INVALID_REQUEST',
  });
});

test('-m segment:Name reads by name, posts once and waits for SUCCESS', async () => {
  const h = harness(
    { metadata: 'segment:CliPub' },
    {
      reads: (index) =>
        index < 3
          ? runtime(index === 0 ? {} : { publishStatus: 'PUBLISHING' })
          : runtime({
              publishStatus: 'SUCCESS',
              lastPublishedEndDateTime: '2026-11-17T10:15:00.000Z',
            }),
    },
  );
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(exit, undefined);
  assert.deepEqual(h.calls.posts, [id]);
  assert.ok(h.calls.gets.every((route) => route === '/services/data/v68.0/ssot/segments/CliPub'));
  assert.equal(h.calls.gets.length, 4);
  assert.deepEqual(h.calls.waits, [30_000, 30_000]);
  assert.equal(h.calls.progress.length, 2);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'published');
  assert.equal(item.mutation, 'confirmed-published');
  assert.equal(item.waitedSeconds, 60);
  assert.deepEqual(item.segment, {
    marketSegmentId: id,
    segmentStatus: 'ACTIVE',
    publishStatus: 'SUCCESS',
    lastPublishedEndDateTime: '2026-11-17T10:15:00.000Z',
    jobId: 'job-1',
  });
  assert.deepEqual(item.route, {
    apiVersion: '68.0',
    method: 'POST',
    resource: 'segments/{id}/actions/publish',
  });
  assert.deepEqual(
    item.routes.map((route) => route.operation),
    ['segments.get', 'segments.publish'],
  );
  assert.doesNotMatch(JSON.stringify(result), /SELECT/u);
});

test('a republish waits past the earlier SUCCESS until this publish ends', async () => {
  const old = { publishStatus: 'SUCCESS', lastPublishedEndDateTime: '2026-11-16T10:00:00.000Z' };
  const h = harness(
    { metadata: 'segment:CliPub' },
    {
      reads: (index) =>
        index <= 1
          ? runtime(old)
          : index === 2
            ? runtime({ ...old, publishStatus: 'PUBLISHING' })
            : runtime({
                publishStatus: 'SUCCESS',
                lastPublishedEndDateTime: '2026-11-17T11:00:00.000Z',
              }),
    },
  );
  const { result } = await run(h.command);
  assert.equal(result.result.items[0].outcome, 'published');
  assert.equal(h.calls.gets.length, 4);
  assert.equal(h.calls.posts.length, 1);
});

test('the wait ends as still processing: exit 69, not failed, never resent', async () => {
  const h = harness(
    { metadata: 'segment:CliPub', wait: 2 },
    { reads: (index) => runtime(index === 0 ? {} : { publishStatus: 'PUBLISHING' }) },
  );
  const output = [];
  h.command.jsonEnabled = () => false;
  h.command.log = (line) => output.push(line);
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'processing');
  assert.equal(exit, 69);
  assert.deepEqual(h.calls.posts, [id]);
  // --wait 2 is two minutes: 120 seconds reach the service.
  assert.equal(h.calls.waitTimeoutSeconds, 120);
  assert.deepEqual(h.calls.waits, [30_000, 30_000, 30_000, 30_000]);
  assert.deepEqual(result.diagnostics.errors, []);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'publishing');
  assert.equal(item.mutation, 'acknowledged-processing');
  assert.equal(item.diagnostics[0].code, 'SEGMENT_PUBLISH_STILL_PROCESSING');
  assert.match(item.diagnostics[0].message, /still processing it after 120 s/u);
  assert.equal(output[0], 'Publish: processing.');
  assert.equal(output[1], 'publishing: CliPub; mutation: acknowledged-processing.');
  assert.equal(output[2], 'publishStatus: PUBLISHING after 120 s.');
  assert.match(output[3], /^SEGMENT_PUBLISH_STILL_PROCESSING: /u);
  assert.ok(output[3].includes(errorCodeInfo('SEGMENT_PUBLISH_STILL_PROCESSING').docs));
});

test('the default wait is 30 minutes', async () => {
  assert.equal(segmentPublishWait.timeoutSeconds, 1800);
  assert.equal(segmentPublishWait.intervalMs, 30_000);
  assert.match(Publish.flags.wait.summary, /whole minutes .*default 30\)/u);
  assert.equal(Publish.flags.wait.char, 'w');
  assert.equal(Publish.flags.wait.min, 1);
  assert.equal(Publish.flags['wait-timeout'], undefined);
  const h = harness(
    { metadata: 'segment:CliPub' },
    { reads: (index) => runtime(index === 0 ? {} : { publishStatus: 'SUCCESS' }) },
  );
  await run(h.command);
  assert.equal(h.calls.waitTimeoutSeconds, 1800);
});

test('publishStatus FAILED is reported as failed', async () => {
  const h = harness(
    { metadata: 'segment:CliPub' },
    { reads: (index) => runtime(index === 0 ? {} : { publishStatus: 'FAILED' }) },
  );
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'failed');
  assert.equal(exit, 1);
  assert.equal(result.result.items[0].mutation, 'publish-failed');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_FAILED');
});

test('--preview reads the segment and publishes nothing', async () => {
  const h = harness({ metadata: 'segment:CliPub', preview: true });
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'success');
  assert.equal(exit, undefined);
  assert.equal(result.metadata.preview, true);
  assert.deepEqual(h.calls.posts, []);
  assert.equal(h.calls.gets.length, 1);
  assert.equal(result.result.items[0].outcome, 'publish');
  assert.equal(result.result.items[0].operation, 'preview');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
});

test('a PROCESSING or COUNTING segment is sent: Salesforce decides', async () => {
  for (const segmentStatus of ['PROCESSING', 'COUNTING']) {
    const h = harness(
      { metadata: 'segment:CliPub' },
      {
        reads: (index) =>
          runtime(index === 0 ? { segmentStatus } : { publishStatus: 'SUCCESS', segmentStatus }),
      },
    );
    const { result } = await run(h.command);
    assert.equal(result.result.items[0].outcome, 'published');
    assert.deepEqual(h.calls.posts, [id]);
  }
});

test('a 4xx refusal is reported with its text and not resent', async () => {
  const h = harness(
    { metadata: 'segment:CliPub' },
    {
      publish: () => {
        throw retainConnectDiagnostic(
          new ConnectError('REQUEST_FAILED', 400),
          apiDiagnostic(400, [
            { errorCode: 'INVALID_INPUT', message: 'Segment is being processed' },
          ]),
        );
      },
    },
  );
  const { result, exit } = await run(h.command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].mutation, 'rejected');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_REJECTED');
  assert.match(
    result.diagnostics.errors[0].message,
    /HTTP 400.*INVALID_INPUT: Segment is being processed/u,
  );
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.calls.gets.length, 1);
});

test('an unknown publish answer or a failed status read is unconfirmed, never resent', async () => {
  for (const failure of ['503', 'no-success', 'read']) {
    const h = harness(
      { metadata: 'segment:CliPub' },
      {
        reads: (index) => (failure === 'read' && index > 0 ? new Error('private') : runtime()),
        publish:
          failure === 'read'
            ? undefined
            : () => {
                if (failure === 'no-success') return { errors: [{}] };
                throw retainConnectDiagnostic(
                  new ConnectError('REQUEST_FAILED', 503),
                  connectDiagnostic(503, {}),
                );
              },
      },
    );
    const { result, exit } = await run(h.command);
    assert.equal(exit, 1, failure);
    assert.equal(result.result.items[0].mutation, 'unknown', failure);
    assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_UNCONFIRMED', failure);
    assert.match(result.diagnostics.errors[0].message, /nothing was resent/u);
    assert.doesNotMatch(JSON.stringify(result), /private/u);
    assert.equal(h.calls.posts.length, 1, failure);
  }
});

test('an absent segment is refused before any write', async () => {
  const h = harness({ metadata: 'segment:CliPub' }, { reads: () => notFound() });
  const { result, exit } = await run(h.command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_ADMISSION_FAILED');
  assert.match(result.diagnostics.errors[0].message, /does not exist/u);
  assert.deepEqual(h.calls.posts, []);
});

test('-d publishes when the org holds the file, and refuses another definition', async () => {
  const file = await segmentFile();
  for (const source of [file.path, file.codePaths[0]]) {
    const h = harness(
      { 'source-dir': source },
      { reads: (index) => runtime(index === 0 ? {} : { publishStatus: 'SUCCESS' }) },
    );
    const { result } = await run(h.command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(h.calls.posts, [id]);
  }
  const h = harness(
    { 'source-dir': file.path },
    { reads: () => runtime({ displayName: 'Changed in org' }) },
  );
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_DEFINITION_MISMATCH');
  assert.deepEqual(h.calls.posts, []);
});

test('a segment file retrieved as-is (verbatim) is refused before auth', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-segment-publish-verbatim-'));
  await writeFile(path.join(root, '.owner'), randomUUID());
  const directory = path.join(root, 'data360', 'segments');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'CliPub.segment.json');
  await writeFile(
    file,
    serializeVerbatimDocument(
      createVerbatimDocument(
        'segment',
        { dataSpace: 'default', apiName: 'CliPub' },
        'UNSUPPORTED_SEGMENT_VARIANT',
        { segments: [runtime()] },
      ),
    ),
  );
  const h = harness({ 'source-dir': file });
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'VERBATIM_NOT_DEPLOYABLE');
  assert.equal(h.calls.auth, 0);
});

for (const [flags, code] of [
  [{ metadata: 'dmo:Thing__dlm' }, 'INVALID_SELECTION'],
  [{ metadata: 'segment:' }, 'INVALID_SELECTION'],
  [{ metadata: 'calculated-insight:Name__cio' }, 'INVALID_SELECTION'],
  [{ metadata: 'segment:CliPub', 'source-dir': 'x.segment.json' }, 'INVALID_SELECTION'],
  [{ metadata: 'segment:CliPub', wait: 0 }, 'INVALID_WAIT_SCOPE'],
  [{ 'source-dir': 'Name__cio.calculatedInsight-meta.json', wait: 60 }, 'INVALID_WAIT_SCOPE'],
  [{ metadata: 'segment:CliPub', 'api-version': '65.0' }, 'INVALID_SCOPE'],
])
  test(`publish refuses ${JSON.stringify(flags)} with ${code} before auth`, async () => {
    const h = harness(flags);
    const { result, exit } = await run(h.command);
    assert.equal(exit, 1);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.equal(h.calls.auth, 0);
  });

test('publish runs in the run data space: a ds2_ segment of dataspace2 is published there', async () => {
  const h = harness(
    { metadata: 'segment:ds2_CliPub', dataspace: 'dataspace2' },
    {
      reads: (index) =>
        runtime({
          apiName: 'ds2_CliPub',
          dataSpace: 'dataspace2',
          ...(index > 0 ? { publishStatus: 'SUCCESS' } : {}),
        }),
    },
  );
  const { result } = await run(h.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items[0].identity, {
    apiName: 'ds2_CliPub',
    dataSpace: 'dataspace2',
  });
  assert.deepEqual(h.calls.posts, [id]);
  assert.ok(h.calls.gets.every((route) => route.endsWith('/ssot/segments/ds2_CliPub')));
});

test('publish refuses a segment of another data space than the run without a POST', async () => {
  const h = harness({ metadata: 'segment:CliPub', dataspace: 'dataspace2' });
  const { result, exit } = await run(h.command);
  assert.equal(exit, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_DATASPACE_MISMATCH');
  assert.match(
    result.diagnostics.errors[0].message,
    /CliPub is in the data space default, but the run's data space is dataspace2/u,
  );
  assert.deepEqual(h.calls.posts, []);
});

test('publish refuses a segment file of another data space than the run before auth', async () => {
  const file = await segmentFile();
  const h = harness({ 'source-dir': file.path, dataspace: 'dataspace2' });
  const { result } = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_DATASPACE_MISMATCH');
  assert.match(
    result.diagnostics.errors[0].message,
    /names the data space default in c__dataSpace/u,
  );
  assert.equal(h.calls.auth, 0);
});

test('publish help names the segment route, the wait and the unchanged CI path', () => {
  assert.equal(Publish.flags.metadata.char, 'm');
  assert.match(
    Publish.description,
    /POST \/ssot\/segments\/\{marketSegmentId\}\/actions\/publish/u,
  );
  assert.match(Publish.description, /--wait \(-w\) sets that wait in whole minutes \(default 30;/u);
  assert.match(Publish.description, /VERBATIM_NOT_DEPLOYABLE/u);
  assert.match(Publish.description, /draft: false/u);
  assert.doesNotMatch(Publish.description, /allow-processing/u);
});

test('--async posts once after the admission read and returns started: no reads, no waits', async () => {
  const h = harness(
    { metadata: 'segment:CliPub', async: true },
    // The admission read reports an earlier publish; it must not appear as this one's status.
    {
      reads: () =>
        runtime({ publishStatus: 'SUCCESS', lastPublishedEndDateTime: '2026-11-17T09:00:00.000Z' }),
    },
  );
  const output = [];
  h.command.jsonEnabled = () => false;
  h.command.log = (line) => output.push(line);
  const { result, exit } = await run(h.command);
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  assert.equal(exit, undefined);
  assert.deepEqual(h.calls.posts, [id]);
  assert.equal(h.calls.gets.length, 1);
  assert.deepEqual(h.calls.waits, []);
  assert.deepEqual(h.calls.progress, []);
  assert.deepEqual(result.diagnostics.errors, []);
  const [item] = result.result.items;
  assert.equal(item.outcome, 'publishing');
  assert.equal(item.mutation, 'acknowledged-processing');
  assert.equal(item.waitedSeconds, undefined);
  assert.deepEqual(item.segment, {
    marketSegmentId: id,
    segmentStatus: 'ACTIVE',
    publishStatus: 'PUBLISHING',
    jobId: 'job-1',
  });
  assert.equal(item.diagnostics[0].code, 'SEGMENT_PUBLISH_STARTED');
  assert.match(item.diagnostics[0].message, /without waiting \(--async\)/u);
  assert.deepEqual(output.slice(0, 3), [
    'Publish: accepted.',
    'publishing: CliPub; mutation: acknowledged-processing.',
    'publishStatus: PUBLISHING.',
  ]);
  assert.match(output[3], /^SEGMENT_PUBLISH_STARTED: /u);
  assert.ok(output[3].includes(errorCodeInfo('SEGMENT_PUBLISH_STARTED').docs));
});

test('--async reports a 4xx refusal as without it, and --preview stays read-only', async () => {
  const rejected = harness(
    { metadata: 'segment:CliPub', async: true },
    {
      publish: () => {
        throw new ConnectError('REQUEST_FAILED', 400);
      },
    },
  );
  const refusal = await run(rejected.command);
  assert.equal(refusal.exit, 1);
  assert.equal(refusal.result.status, 'failed');
  assert.equal(refusal.result.diagnostics.errors[0].code, 'SEGMENT_PUBLISH_REJECTED');
  assert.equal(rejected.calls.posts.length, 1);
  assert.equal(rejected.calls.gets.length, 1);
  const preview = harness({ metadata: 'segment:CliPub', async: true, preview: true });
  const read = await run(preview.command);
  assert.equal(read.result.status, 'success');
  assert.equal(read.result.result.items[0].outcome, 'publish');
  assert.deepEqual(preview.calls.posts, []);
});

test('--async and --wait are mutually exclusive flags', () => {
  assert.deepEqual(Publish.flags.async.exclusive, ['wait']);
  assert.deepEqual(Publish.flags.wait.exclusive, ['async']);
  assert.equal(Publish.flags.async.default, false);
  assert.match(Publish.description, /--async/u);
  assert.match(Publish.description, /SEGMENT_PUBLISH_STARTED/u);
  assert.match(Publish.description, /CI_PUBLISH_STARTED/u);
});
