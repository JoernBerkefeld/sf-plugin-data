import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  carriesDefinition,
  decodeSegmentCriteria,
  joinSegmentFiles,
  serializeSegmentFiles,
  validateSegmentDocument,
} from '../lib/artifacts/segment-document.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { projectSegment } from '../lib/services/retrieve-segment.js';
import { executeSegmentDeploy } from '../lib/services/execute-segment-deploy.js';
import { preflightSegmentDeploy } from '../lib/services/preflight-segment-deploy.js';
import { deleteSegment } from '../lib/services/delete-segment.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

// The criteria as written by hand (proven create payload) and as Salesforce stores them.
const authored = (value = 'CliNoMatchZZ') => ({
  type: 'TextComparison',
  subject: { objectApiName: 'Person__dlm', fieldApiName: 'FirstName__c' },
  operator: 'equal',
  values: [value],
});
const normalized = (value = 'CliNoMatchZZ') => ({
  selfReference: false,
  subjectFieldDataType: 'TEXT',
  subject: { fieldApiName: 'FirstName__c', objectApiName: 'Person__dlm' },
  subjectFieldSourceType: 'DIRECT',
  values: [value],
  type: 'TextComparison',
  operator: 'equal',
  subjectFieldBusinessType: 'TEXT',
});
const encode = (criteria) => JSON.stringify(criteria).replaceAll('"', '&quot;');
const document = (criteria = normalized(), lookbackPeriod = 'P90D') => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'Audience' },
  spec: {
    displayName: 'Audience label',
    description: 'Description',
    segmentType: 'UI',
    segmentOn: { kind: 'dmo', apiName: 'Person__dlm' },
    includeCriteria: criteria,
    lookbackPeriod,
  },
});
// Shape of a live GET (2026-11-16, API68), with synthetic IDs.
const runtime = (criteria = normalized(), lookbackPeriod = 'P90D', status = 'ACTIVE') => ({
  apiName: 'Audience',
  createdBy: { id: '005000000000001AAA' },
  createdDate: '2026-11-16T05:10:22.000Z',
  dataSpace: 'default',
  description: 'Description',
  displayName: 'Audience label',
  includeCriteria: encode(criteria),
  lastModifiedBy: { id: '005000000000001AAA' },
  lastModifiedDate: '2026-11-16T05:10:37.000Z',
  lastSegmentMemberCount: 0,
  lookbackPeriod,
  marketSegmentDefinitionId: '3HX000000000001AAA',
  marketSegmentId: '1sg000000000001AAA',
  parameters: [],
  publishInterval: 'NO_REFRESH',
  segmentMembershipDmo: { historyTable: 'History__dlm', latestTable: 'Latest__dlm' },
  segmentOnApiName: 'Person__dlm',
  segmentOnId: 'dmo-id',
  segmentStatus: status,
  segmentType: 'UI',
});
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '68.0',
};

test('retrieve of a UI segment GET writes a normal document with decoded criteria', async () => {
  const projected = projectSegment({ segments: [runtime()] }, 'Audience', 'retrieve');
  assert.deepEqual(projected.candidate, document());
  // Deploy mode reads the same GET the same way.
  assert.deepEqual(projectSegment({ segments: [runtime()] }, 'Audience').candidate, document());
  const { json, files } = serializeSegmentFiles(projected.candidate, 'retrieve');
  assert.deepEqual(files, []);
  assert.doesNotMatch(json, /&quot;|marketSegment|segmentOnId|createdBy|parameters/u);
  assert.deepEqual(joinSegmentFiles(JSON.parse(json), []), document());
  assert.throws(
    () => joinSegmentFiles(JSON.parse(json), [{ extension: 'sql', name: 'X', text: 'x' }]),
    { code: 'INVALID_SEGMENT_DOCUMENT' },
  );
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-ui-segment-test-'));
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    '{"packageDirectories":[{"path":"force-app","default":true}]}',
  );
  const written = await writeSegmentDocument(projected.candidate, root, false);
  assert.deepEqual(written.codePaths, []);
  assert.deepEqual(await readdir(path.dirname(written.path)), ['Audience.segment.json']);
  assert.deepEqual(
    JSON.parse(await readFile(written.path, 'utf8')).spec.includeCriteria,
    normalized(),
  );
  assert.equal(decodeSegmentCriteria('&amp;quot;&#65;&#x42;&lt;'), '&quot;AB<');
});

test('a UI segment GET with server-owned segmentMembershipTable is a normal document', () => {
  const read = { ...runtime(), segmentMembershipTable: 'Audience_Membership__dlm' };
  const projected = projectSegment({ segments: [read] }, 'Audience', 'retrieve');
  assert.deepEqual(projected.candidate, document());
});

test('what the UI segment write cannot carry stays as-is', () => {
  // An unknown key is kept on retrieve and refused on deploy, as for DBT.
  const unknown = { ...runtime(), excludeCriteria: '{}' };
  assert.equal(
    projectSegment({ segments: [unknown] }, 'Audience', 'retrieve').candidate.spec.excludeCriteria,
    '{}',
  );
  assert.throws(() => projectSegment({ segments: [unknown] }, 'Audience'), {
    code: 'UNKNOWN_SEGMENT_CONFIGURATION',
  });
  for (const change of [
    { parameters: [{ name: 'p' }] },
    { publishScheduleInfo: { frequency: 'Weekly', futureKey: 1 } },
    { includeCriteria: '{not json' },
    { includeCriteria: '[1]' },
    { includeCriteria: undefined },
  ]) {
    const raw = { ...runtime(), ...change };
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete raw[key];
    assert.throws(
      () => projectSegment({ segments: [raw] }, 'Audience', 'retrieve'),
      { code: 'UNSUPPORTED_SEGMENT_VARIANT' },
      JSON.stringify(change),
    );
  }
  // A file refuses an unknown key and criteria that are not an object; the lookback is free text.
  assert.throws(
    () => validateSegmentDocument({ ...document(), spec: { ...document().spec, x: 1 } }),
    {
      code: 'UNKNOWN_SEGMENT_CONFIGURATION',
    },
  );
  assert.throws(() => validateSegmentDocument(document('{"a":1}')), {
    code: 'INVALID_SEGMENT_DOCUMENT',
  });
  assert.equal(validateSegmentDocument(document(authored(), 'P7D')).spec.lookbackPeriod, 'P7D');
});

test('UI segment write bodies match the proven create and PATCH payloads', async () => {
  const calls = [];
  const c = {
    ...connection,
    request: async (request) => {
      calls.push(request);
      return {};
    },
  };
  await new ConnectClient(c, '68.0').createSegment(document(authored()));
  await new ConnectClient(c, '68.0').patchSegment(document(normalized('CliNoMatchYY'), 'P30D'));
  assert.equal(calls[0].method, 'POST');
  assert.equal(
    calls[0].url,
    `${connection.instanceUrl}/services/data/v68.0/ssot/segments?dataspace=default`,
  );
  assert.deepEqual(JSON.parse(calls[0].body), {
    developerName: 'Audience',
    displayName: 'Audience label',
    description: 'Description',
    segmentOnApiName: 'Person__dlm',
    segmentType: 'UI',
    includeCriteria: JSON.stringify(authored()),
    lookbackPeriod: 'P90D',
    publishSchedule: 'NoRefresh',
    segmentCreationFlow: 'Headless',
  });
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(
    calls[1].url,
    `${connection.instanceUrl}/services/data/v68.0/ssot/segments/Audience`,
  );
  // A PATCH without publishSchedule (NoRefresh there answers 400) and without developerName.
  assert.deepEqual(JSON.parse(calls[1].body), {
    displayName: 'Audience label',
    description: 'Description',
    segmentOnApiName: 'Person__dlm',
    segmentType: 'UI',
    includeCriteria: JSON.stringify(normalized('CliNoMatchYY')),
    lookbackPeriod: 'P30D',
    segmentCreationFlow: 'Headless',
  });
});

const absent = () =>
  retainConnectDiagnostic(
    { blockers: ['SEGMENT_ACQUISITION_FAILED'] },
    apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND' }]),
  );
const options = (org, writes) => ({
  allowProcessing: true,
  verifyInput: async () => {},
  bind: async () => [{ targetId: 'dmo-id', identity: document().spec.segmentOn }],
  acquire: async () => {
    if (!org.current) return absent();
    const projected = projectSegment({ segments: [org.current] }, 'Audience');
    return { candidate: projected.candidate, blockers: [], expectations: projected };
  },
  create: async (body) => {
    writes.push(['POST', body]);
    org.current = runtime(normalized(), body.spec.lookbackPeriod);
    // The create echo omits audit and membership keys.
    const echo = { ...org.current, segmentStatus: 'PROCESSING' };
    for (const key of ['createdBy', 'lastModifiedBy', 'segmentMembershipDmo']) delete echo[key];
    return echo;
  },
  patch: async (body) => {
    writes.push(['PATCH', body]);
    org.current = runtime(normalized('CliNoMatchYY'), body.spec.lookbackPeriod);
    // The PATCH echo omits segmentOnApiName and the membership tables.
    const echo = { ...org.current, segmentStatus: 'PROCESSING' };
    for (const key of ['segmentOnApiName', 'segmentMembershipDmo']) delete echo[key];
    return echo;
  },
  read: async () => ({ segments: [org.current] }),
  now: () => 0,
  delay: async () => {},
});

test('UI segment deploy: create from hand-written criteria, repeat is a noop, then update', async () => {
  const org = {};
  const writes = [];
  const run = (desired) =>
    executeSegmentDeploy(desired, connection, '68.0', 'default', options(org, writes));
  // Salesforce adds its own criteria keys; the authored ones are what the readback must carry.
  const created = await run(document(authored()));
  assert.equal(created.outcome, 'created', JSON.stringify(created.diagnostics));
  assert.equal(created.route.method, 'POST');
  // The retrieved file (normalized criteria) deploys as unchanged, without a write.
  const repeat = await run(
    projectSegment({ segments: [org.current] }, 'Audience', 'retrieve').candidate,
  );
  assert.equal(repeat.outcome, 'unchanged');
  assert.equal(writes.length, 1);
  const updated = await run(document(normalized('CliNoMatchYY'), 'P30D'));
  assert.equal(updated.outcome, 'updated', JSON.stringify(updated.diagnostics));
  assert.equal(updated.route.method, 'PATCH');
  assert.deepEqual(
    writes.map(([method]) => method),
    ['POST', 'PATCH'],
  );
  assert.equal(org.current.lookbackPeriod, 'P30D');
  // A readback that drops an authored criteria value is not a confirmation.
  org.current = runtime(normalized('Other'), 'P30D');
  const drift = await executeSegmentDeploy(
    document(normalized('CliNoMatchYY'), 'P30D'),
    connection,
    '68.0',
    'default',
    {
      ...options(org, writes),
      patch: async () => runtime(normalized('Other'), 'P30D', 'PROCESSING'),
    },
  );
  assert.equal(drift.mutation, 'unknown');
});

// UI criteria with one logical group around the given filters.
const logical = (filters, extra = {}) => ({
  type: 'LogicalComparison',
  operator: 'and',
  filters,
  ...extra,
});

test('UI criteria tolerate only the keys Salesforce adds beside subject', async () => {
  const stored = (criteria) => validateSegmentDocument(document(criteria));
  const desired = validateSegmentDocument(document(authored()));
  assert.equal(carriesDefinition(stored(normalized()), desired), true);
  // Any other extra key differs, also one of the known keys where there is no subject.
  assert.equal(carriesDefinition(stored({ ...normalized(), caseSensitive: true }), desired), false);
  const nested = validateSegmentDocument(document(logical([authored()])));
  assert.equal(carriesDefinition(stored(logical([normalized()])), nested), true);
  assert.equal(
    carriesDefinition(stored(logical([normalized()], { selfReference: false })), nested),
    false,
  );
  // A key the file holds must be stored.
  assert.equal(
    carriesDefinition(stored(authored()), validateSegmentDocument(document(normalized()))),
    false,
  );

  // Preflight and execute use the same comparison: the hand-written file is a noop.
  const org = { current: runtime() };
  const writes = [];
  const run = options(org, writes);
  const preview = await preflightSegmentDeploy(
    document(authored()),
    connection,
    '68.0',
    'default',
    run.acquire,
    run.bind,
  );
  assert.equal(preview.outcome, 'unchanged', JSON.stringify(preview.diagnostics));
  const repeat = await executeSegmentDeploy(
    document(authored()),
    connection,
    '68.0',
    'default',
    run,
  );
  assert.equal(repeat.outcome, 'unchanged', JSON.stringify(repeat.diagnostics));
  assert.equal(writes.length, 0);
});

test('a user key removed from the file but kept by Salesforce fails settlement', async () => {
  const kept = { ...normalized('CliNoMatchYY'), caseSensitive: true };
  const org = { current: runtime({ ...normalized(), caseSensitive: true }) };
  const writes = [];
  const run = {
    ...options(org, writes),
    patch: async (body) => {
      writes.push(['PATCH', body]);
      org.current = runtime(kept);
      return { ...org.current, segmentStatus: 'PROCESSING' };
    },
  };
  const desired = document(authored('CliNoMatchYY'));
  const preview = await preflightSegmentDeploy(
    desired,
    connection,
    '68.0',
    'default',
    run.acquire,
    run.bind,
  );
  assert.equal(preview.outcome, 'update');
  const result = await executeSegmentDeploy(desired, connection, '68.0', 'default', run);
  assert.equal(writes.length, 1);
  assert.notEqual(result.outcome, 'updated', JSON.stringify(result));
  assert.equal(result.mutation, 'unknown');
});

test('UI segment delete by its file confirms absence', async () => {
  let deleted = false;
  const requests = [];
  const result = await deleteSegment(
    document(),
    {
      ...connection,
      request: async (request, requestOptions) => {
        requests.push(request.method);
        if (request.method === 'DELETE') {
          deleted = true;
          return requestOptions.noContentResponse;
        }
        if (deleted)
          throw Object.assign(new Error('not found'), {
            name: 'ITEM_NOT_FOUND',
            errorCode: 'ITEM_NOT_FOUND',
            statusCode: 404,
            data: { errorCode: 'ITEM_NOT_FOUND', message: 'not found' },
          });
        return { segments: [runtime()] };
      },
    },
    { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
    'default',
    {
      confirmDelete: true,
      verifyInput: async () => {},
      bind: async () => [{ targetId: 'dmo-id', identity: document().spec.segmentOn }],
      now: () => 0,
      delay: async () => {},
    },
  );
  assert.equal(result.outcome, 'deleted', JSON.stringify(result.diagnostics));
  assert.deepEqual(requests, ['GET', 'GET', 'DELETE', 'GET']);
});
