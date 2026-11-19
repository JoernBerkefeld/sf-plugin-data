import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carriesDefinition,
  opaqueSegmentSchedule,
  segmentWriteBody,
  validateSegmentDocument,
} from '../lib/artifacts/segment-document.js';
import { projectSegment, projectSegmentSchedule } from '../lib/services/retrieve-segment.js';
import { executeSegmentDeploy } from '../lib/services/execute-segment-deploy.js';
import { preflightSegmentDeploy } from '../lib/services/preflight-segment-deploy.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

// Live API 68 shapes (2026-11-18, verification DB data360:segment.variants.api68), synthetic IDs.
const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
// eslint-disable-next-line unicorn/no-null -- Salesforce reads and clears schedule keys as JSON null.
const jsonNull = null;
const weeklyRead = (day = 'Monday', interval = 1) => ({
  publishInterval: 'TWENTY_FOUR',
  publishScheduleInfo: {
    daysOfWeek: [day],
    frequency: 'Weekly',
    interval,
    nextScheduledDate: jsonNull,
    timeInfo: jsonNull,
  },
  publishScheduleStartDateTime: '2026-12-07T03:00:00.000Z',
});
const weekly = (day = 'Monday', interval = 1) => ({
  frequency: 'Weekly',
  interval,
  daysOfWeek: [day],
  startDateTime: '2026-12-07T03:00:00.000Z',
});
const raw = (type = 'DBT', extra = {}) => ({
  apiName: 'Audience',
  createdBy: { id: '005000000000001AAA' },
  createdDate: '2026-11-18T17:16:32.000Z',
  dataSpace: 'default',
  description: 'Description',
  displayName: 'Audience',
  ...(type === 'DBT'
    ? {
        includeCriteria: '&lt;DbtPipeline xmlns=&quot;&quot;&gt;&lt;/DbtPipeline&gt;',
        includeDbt: { models: [{ name: 'Audience', sql }] },
      }
    : {}),
  ...(type === 'UI' ? { includeCriteria: '{&quot;type&quot;:&quot;TextComparison&quot;}' } : {}),
  lastModifiedBy: { id: '005000000000001AAA' },
  lastModifiedDate: '2026-11-18T17:16:51.000Z',
  lastSegmentMemberCount: 0,
  ...(type === 'Waterfall' || type === 'EinsteinGptSegmentsUI' ? {} : { lookbackPeriod: 'P90D' }),
  marketSegmentDefinitionId: '3HX000000000001AAA',
  marketSegmentId: '1sg000000000001AAA',
  parameters: [],
  publishInterval: 'NO_REFRESH',
  segmentMembershipDmo: { historyTable: 'History__dlm', latestTable: 'Latest__dlm' },
  segmentOnApiName: 'Person__dlm',
  segmentOnId: 'dmo-id',
  segmentStatus: 'ACTIVE',
  segmentType: type,
  ...extra,
});
const document = (type = 'DBT', spec = {}) => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: type,
    segmentOn: { kind: 'dmo', apiName: 'Person__dlm' },
    ...(type === 'DBT' ? { models: [{ name: 'Audience', sql }] } : {}),
    ...(type === 'UI' ? { includeCriteria: { type: 'TextComparison' } } : {}),
    ...(type === 'Waterfall' || type === 'EinsteinGptSegmentsUI' ? {} : { lookbackPeriod: 'P90D' }),
    ...spec,
  },
});
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '68.0',
};
const rejected = () =>
  retainConnectDiagnostic(
    new Error('rejected'),
    apiDiagnostic(400, [
      {
        errorCode: 'ENTITY_SAVE_ERROR',
        message: 'Start Date or End Date must not be specified when no publish schedule is set.',
      },
    ]),
  );

/**
 * Apply a write body to a GET-shaped segment as Salesforce did live: the schedule reads back with
 * `publishInterval` TWENTY_FOUR, a plain `daysOfWeek` list and `timeInfo` null; a DBT schedule
 * cannot be cleared (400), a UI one can.
 * @param {object} current GET-shaped segment.
 * @param {object} body Write body.
 * @returns {object} The segment after the write.
 */
function apply(current, body) {
  const next = structuredClone(current);
  for (const key of ['displayName', 'description', 'lookbackPeriod'])
    if (Object.hasOwn(body, key)) next[key] = body[key];
  if (body.publishScheduleInfo === jsonNull) {
    if (next.segmentType === 'DBT') throw rejected();
    next.publishInterval = 'NO_REFRESH';
    delete next.publishScheduleInfo;
    delete next.publishScheduleStartDateTime;
  } else if (body.publishScheduleInfo) {
    const info = body.publishScheduleInfo;
    next.publishInterval = 'TWENTY_FOUR';
    next.publishScheduleInfo = {
      daysOfWeek: info.daysOfWeek.daysOfWeek,
      frequency: info.frequency,
      interval: info.interval,
      nextScheduledDate: jsonNull,
      timeInfo: jsonNull,
    };
    if (body.publishScheduleStartDateTime)
      next.publishScheduleStartDateTime = body.publishScheduleStartDateTime;
  }
  return next;
}

/**
 * A synthetic org with one segment and the write seams of the deploy.
 * @param {object | undefined} current GET-shaped segment, or none.
 * @returns {object} Org state, recorded write bodies and deploy options.
 */
function org(current) {
  const state = { current, writes: [] };
  state.options = {
    allowProcessing: true,
    verifyInput: async () => {},
    bind: async () => [{ targetId: 'dmo-id' }],
    acquire: async () => {
      if (!state.current)
        return retainConnectDiagnostic(
          { blockers: ['SEGMENT_ACQUISITION_FAILED'] },
          apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND' }]),
        );
      const projected = projectSegment({ segments: [state.current] }, 'Audience');
      return { candidate: projected.candidate, blockers: [], expectations: projected };
    },
    create: async (desired) => {
      const body = segmentWriteBody(validateSegmentDocument(desired), true);
      state.writes.push(['POST', body]);
      state.current = apply({ ...raw(desired.spec.segmentType), ...body }, body);
      delete state.current.developerName;
      delete state.current.publishSchedule;
      delete state.current.segmentCreationFlow;
      state.current.segmentType = desired.spec.segmentType;
      if (desired.spec.segmentType === 'DBT') {
        state.current.includeDbt = { models: desired.spec.models };
        state.current.includeCriteria = raw().includeCriteria;
      }
      return { ...state.current, segmentStatus: 'PROCESSING' };
    },
    patch: async (desired, schedule) => {
      const body = segmentWriteBody(validateSegmentDocument(desired), false, schedule);
      state.writes.push(['PATCH', body]);
      state.current = apply(state.current, body);
      return { ...state.current, segmentStatus: 'PROCESSING' };
    },
    read: async () => ({ segments: [state.current] }),
    now: () => 0,
    delay: async () => {},
  };
  return state;
}
const off = (type) => document(type, { schedule: { frequency: 'None' } });
const deploy = (desired, state) =>
  executeSegmentDeploy(desired, connection, '68.0', 'default', state.options);
const preview = (desired, state) =>
  preflightSegmentDeploy(
    desired,
    connection,
    '68.0',
    'default',
    state.options.acquire,
    state.options.bind,
  );
const codes = (result) => result.diagnostics.map((diagnostic) => diagnostic.code);

test('the schedule of a GET is projected onto the write shape; none gives no key', () => {
  assert.deepEqual(projectSegmentSchedule(raw('DBT', weeklyRead())), weekly());
  assert.equal(projectSegmentSchedule(raw('DBT')), undefined);
  // A time read back is kept; nextScheduledDate and publishInterval are left out.
  const timed = raw('UI', weeklyRead('Wednesday'));
  timed.publishScheduleInfo.timeInfo = { hour: 5, minute: 0, timeZone: 'UTC' };
  timed.publishScheduleInfo.nextScheduledDate = '2026-12-09T05:00:00.000Z';
  assert.deepEqual(projectSegmentSchedule(timed), {
    ...weekly('Wednesday'),
    time: { hour: 5, minute: 0, timeZone: 'UTC' },
  });
  for (const type of ['DBT', 'UI']) {
    const projected = projectSegment({ segments: [raw(type, weeklyRead())] }, 'Audience');
    assert.deepEqual(projected.candidate, document(type, { schedule: weekly() }));
    assert.deepEqual(
      projectSegment({ segments: [raw(type, weeklyRead())] }, 'Audience', 'retrieve').candidate,
      document(type, { schedule: weekly() }),
    );
  }
  // End dates and an hourly interval are kept as read; an empty day list is left out.
  assert.deepEqual(
    projectSegmentSchedule(
      raw('DBT', { ...weeklyRead(), publishScheduleEndDateTime: '2027-01-01T00:00:00.000Z' }),
    ),
    { ...weekly(), endDateTime: '2027-01-01T00:00:00.000Z' },
  );
  assert.deepEqual(projectSegmentSchedule(raw('DBT', { publishInterval: 'TWELVE' })), {
    publishInterval: 'TWELVE',
  });
  const empty = raw('DBT', weeklyRead());
  empty.publishScheduleInfo.daysOfWeek = [];
  assert.equal(Object.hasOwn(projectSegmentSchedule(empty), 'daysOfWeek'), false);
  // Schedule details the plugin does not know: as-is on retrieve, opaque on a deploy read.
  for (const change of [
    { publishScheduleInfo: { frequency: 'Weekly', futureKey: 1 } },
    { publishScheduleInfo: { frequency: 'Weekly', daysOfWeek: { daysOfWeek: ['Monday'] } } },
    { publishInterval: 7 },
  ]) {
    assert.throws(
      () => projectSegment({ segments: [raw('DBT', change)] }, 'Audience', 'retrieve'),
      { code: 'UNSUPPORTED_SEGMENT_VARIANT' },
      JSON.stringify(change),
    );
    assert.deepEqual(projectSegmentSchedule(raw('DBT', change)), opaqueSegmentSchedule);
  }
});

test('only the schedule keys the file states are compared, normalised', async () => {
  const state = org(raw('DBT', weeklyRead()));
  for (const schedule of [
    // No start date: Salesforce keeps the stored one.
    { frequency: 'Weekly', interval: 1, daysOfWeek: ['Monday'] },
    // The same instant without milliseconds, other letter case, interval as text.
    { ...weekly(), startDateTime: '2026-12-07T03:00:00Z' },
    { ...weekly(), frequency: 'weekly', interval: '1' },
    { frequency: 'Weekly' },
  ]) {
    const desired = document('DBT', { schedule });
    const planned = await preview(desired, state);
    assert.equal(planned.outcome, 'unchanged', JSON.stringify(schedule));
    const result = await deploy(desired, state);
    assert.equal(result.outcome, 'unchanged', JSON.stringify(schedule));
  }
  assert.equal(state.writes.length, 0);
  // A stated key that differs is a change; the keys the file leaves out are not sent.
  const result = await deploy(
    document('DBT', { schedule: { frequency: 'Weekly', daysOfWeek: ['Friday'] } }),
    state,
  );
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.deepEqual(state.writes[0][1].publishScheduleInfo, {
    frequency: 'Weekly',
    daysOfWeek: { daysOfWeek: ['Friday'] },
  });
  assert.equal(Object.hasOwn(state.writes[0][1], 'publishScheduleStartDateTime'), false);
});

test('a file without schedule updates a segment whose schedule the file cannot hold', async () => {
  for (const extra of [
    { ...weeklyRead(), publishScheduleEndDateTime: '2027-01-01T00:00:00.000Z' },
    { publishInterval: 'TWELVE' },
    { ...weeklyRead(), publishScheduleInfo: { ...weeklyRead().publishScheduleInfo, futureKey: 1 } },
  ]) {
    const state = org(raw('DBT', extra));
    const desired = document('DBT', { description: 'Changed' });
    const planned = await preview(desired, state);
    assert.equal(planned.outcome, 'update', JSON.stringify(planned.diagnostics));
    assert.deepEqual(codes(planned), []);
    const result = await deploy(desired, state);
    assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
    const [[method, body]] = state.writes;
    assert.equal(method, 'PATCH');
    assert.equal(
      Object.keys(body).some((key) => key.startsWith('publishSchedule')),
      false,
      JSON.stringify(extra),
    );
  }
  // A file schedule never equals one the file cannot hold.
  const opaque = org(
    raw('DBT', { ...weeklyRead(), publishScheduleInfo: { frequency: 'Weekly', futureKey: 1 } }),
  );
  const planned = await preview(document('DBT', { schedule: weekly() }), opaque);
  assert.equal(planned.outcome, 'update');
  assert.deepEqual(codes(planned), ['SEGMENT_SCHEDULE_CHANGE']);
});

test('end dates and an hourly interval are sent as written', () => {
  const body = segmentWriteBody(
    document('DBT', {
      schedule: { ...weekly(), endDate: '2027-01-01', endDateTime: '2027-01-01T00:00:00.000Z' },
    }),
    false,
    true,
  );
  assert.equal(body.publishScheduleEndDate, '2027-01-01');
  assert.equal(body.publishScheduleEndDateTime, '2027-01-01T00:00:00.000Z');
  const hourly = segmentWriteBody(
    document('DBT', { schedule: { publishInterval: 'TWELVE' } }),
    true,
  );
  assert.equal(hourly.publishSchedule, 'TWELVE');
  assert.equal(Object.hasOwn(hourly, 'publishScheduleInfo'), false);
});

test('the schedule goes into the write body in the write shape, never with publishSchedule', async () => {
  const timed = document('DBT', {
    schedule: { ...weekly(), time: { hour: 3, minute: 0, timeZone: 'UTC' } },
  });
  const scheduleKeys = {
    publishScheduleInfo: {
      frequency: 'Weekly',
      interval: 1,
      daysOfWeek: { daysOfWeek: ['Monday'] },
      timeInfo: { hour: 3, minute: 0, timeZone: 'UTC' },
    },
    publishScheduleStartDateTime: '2026-12-07T03:00:00.000Z',
  };
  const calls = [];
  const c = {
    ...connection,
    request: async (request) => {
      calls.push(request);
      return {};
    },
  };
  await new ConnectClient(c, '68.0').createSegment(timed);
  await new ConnectClient(c, '68.0').patchSegment(timed, true);
  await new ConnectClient(c, '68.0').patchSegment(timed);
  const base = {
    displayName: 'Audience',
    description: 'Description',
    segmentOnApiName: 'Person__dlm',
    segmentType: 'Dbt',
    includeDbt: { models: { models: [{ name: 'Audience', sql }] } },
    lookbackPeriod: 'P90D',
  };
  assert.deepEqual(JSON.parse(calls[0].body), {
    developerName: 'Audience',
    ...base,
    ...scheduleKeys,
  });
  assert.deepEqual(JSON.parse(calls[1].body), { ...base, ...scheduleKeys });
  // A PATCH without a schedule change sends no schedule key: the org schedule stays.
  assert.deepEqual(JSON.parse(calls[2].body), base);
  // Off: create does not refresh; an update sends the clearing body.
  assert.equal(segmentWriteBody(off('UI'), true).publishSchedule, 'NoRefresh');
  assert.deepEqual(segmentWriteBody(off('UI'), false, true), {
    displayName: 'Audience',
    description: 'Description',
    segmentOnApiName: 'Person__dlm',
    segmentType: 'UI',
    includeCriteria: '{"type":"TextComparison"}',
    lookbackPeriod: 'P90D',
    publishSchedule: 'NoRefresh',
    publishScheduleInfo: jsonNull,
    publishScheduleStartDateTime: jsonNull,
    publishScheduleEndDate: jsonNull,
    publishScheduleEndDateTime: jsonNull,
    segmentCreationFlow: 'Headless',
  });
});

test('a file without a schedule leaves the org schedule alone', async () => {
  const state = org(raw('DBT', weeklyRead()));
  const repeat = await preview(document(), state);
  assert.equal(repeat.outcome, 'unchanged');
  const result = await deploy(document('DBT', { description: 'Changed' }), state);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.deepEqual(codes(result), []);
  const [[method, body]] = state.writes;
  assert.equal(method, 'PATCH');
  assert.equal(
    Object.keys(body).some((key) => key.startsWith('publishSchedule')),
    false,
  );
  assert.deepEqual(state.current.publishScheduleInfo, weeklyRead().publishScheduleInfo);
});

test('a changed schedule is previewed and sent with the update; the same schedule is unchanged', async () => {
  const state = org(raw('DBT', weeklyRead()));
  const friday = document('DBT', { schedule: weekly('Friday', 2) });
  const planned = await preview(friday, state);
  assert.equal(planned.outcome, 'update');
  assert.deepEqual(codes(planned), ['SEGMENT_SCHEDULE_CHANGE']);
  assert.match(planned.diagnostics[0].message, /Weekly.*publishes on it there/u);
  assert.equal(state.writes.length, 0);
  const result = await deploy(friday, state);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.deepEqual(codes(result), ['SEGMENT_SCHEDULE_CHANGE']);
  assert.deepEqual(state.writes[0][1].publishScheduleInfo, {
    frequency: 'Weekly',
    interval: 2,
    daysOfWeek: { daysOfWeek: ['Friday'] },
  });
  // Repeat: unchanged. A time Salesforce does not read back is not compared.
  const timed = document('DBT', {
    schedule: { ...weekly('Friday', 2), time: { hour: 3, minute: 0, timeZone: 'UTC' } },
  });
  const again = await preview(timed, state);
  assert.equal(again.outcome, 'unchanged');
  const kept = await deploy(timed, state);
  assert.equal(kept.outcome, 'unchanged');
  assert.equal(state.writes.length, 1);
  // The schedule only differs: only then are its keys sent.
  assert.equal(
    carriesDefinition(projectSegment({ segments: [state.current] }, 'Audience').candidate, friday),
    true,
  );
});

test('a create sends the schedule of the file and reports it', async () => {
  const state = org();
  const desired = document('UI', { schedule: weekly('Wednesday') });
  const planned = await preview(desired, state);
  assert.equal(planned.outcome, 'create');
  assert.deepEqual(codes(planned), ['SEGMENT_SCHEDULE_CHANGE']);
  const result = await deploy(desired, state);
  assert.equal(result.outcome, 'created', JSON.stringify(result.diagnostics));
  assert.deepEqual(codes(result), ['SEGMENT_SCHEDULE_CHANGE']);
  assert.equal(Object.hasOwn(state.writes[0][1], 'publishSchedule'), false);
  // Off on a create is the default: no notice.
  const plain = org();
  const quiet = await preview(off('DBT'), plain);
  assert.deepEqual(codes(quiet), []);
});

test('turning a UI schedule off sends the clearing body; a DBT one is sent and its 400 reported', async () => {
  const ui = org(raw('UI', weeklyRead('Wednesday')));
  const planned = await preview(off('UI'), ui);
  assert.equal(planned.outcome, 'update');
  assert.match(planned.diagnostics[0].message, /turns the segment refresh schedule off/u);
  const cleared = await deploy(off('UI'), ui);
  assert.equal(cleared.outcome, 'updated', JSON.stringify(cleared.diagnostics));
  assert.equal(ui.writes[0][1].publishScheduleInfo, jsonNull);
  assert.equal(ui.current.publishInterval, 'NO_REFRESH');
  const still = await deploy(off('UI'), ui);
  assert.equal(still.outcome, 'unchanged');
  const dbt = org(raw('DBT', weeklyRead()));
  const refused = await deploy(off('DBT'), dbt);
  assert.equal(refused.outcome, 'failed');
  assert.equal(refused.mutation, 'rejected');
  assert.deepEqual(codes(refused), ['REQUEST_FAILED']);
  assert.match(refused.diagnostics[0].message, /no publish schedule is set/u);
  assert.equal(dbt.writes[0][1].publishSchedule, 'NoRefresh');
  assert.deepEqual(dbt.current.publishScheduleInfo, weeklyRead().publishScheduleInfo);
});

test('any lookback is sent as written; Salesforce decides', async () => {
  for (const lookbackPeriod of ['P30D', 'P45D', 'P1Y', 'P7D', 'P0D', '30', 'P400D']) {
    const desired = document('DBT', { lookbackPeriod });
    assert.equal(validateSegmentDocument(desired).spec.lookbackPeriod, lookbackPeriod);
    assert.equal(segmentWriteBody(desired, true).lookbackPeriod, lookbackPeriod);
    assert.equal(segmentWriteBody(desired, false).lookbackPeriod, lookbackPeriod);
  }
  const state = org(raw('DBT'));
  const result = await deploy(document('DBT', { lookbackPeriod: 'P7D' }), state);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.equal(state.current.lookbackPeriod, 'P7D');
  // A GET with another lookback is a normal file.
  assert.equal(
    projectSegment({ segments: [raw('DBT', { lookbackPeriod: 'P30D' })] }, 'Audience').candidate
      .spec.lookbackPeriod,
    'P30D',
  );
});

test('other segment types are retrieved and sent as written', async () => {
  for (const type of ['Waterfall', 'Dynamic', 'EinsteinGptSegmentsUI']) {
    const projected = projectSegment({ segments: [raw(type)] }, 'Audience', 'retrieve');
    assert.deepEqual(projected.candidate, document(type), type);
    assert.deepEqual(
      projectSegment({ segments: [raw(type)] }, 'Audience').candidate,
      document(type),
    );
    const body = segmentWriteBody(document(type), true);
    assert.deepEqual(body, {
      developerName: 'Audience',
      displayName: 'Audience',
      description: 'Description',
      segmentOnApiName: 'Person__dlm',
      segmentType: type,
      ...(type === 'Dynamic' ? { lookbackPeriod: 'P90D' } : {}),
      publishSchedule: 'NoRefresh',
    });
    const state = org();
    const created = await deploy(document(type), state);
    assert.equal(created.outcome, 'created', `${type} ${JSON.stringify(created.diagnostics)}`);
  }
  // Salesforce's refusal of a type (for example a lookalike without its seed) is reported.
  const state = org();
  state.options.create = async () => {
    throw rejected();
  };
  const refused = await deploy(document('Lookalike'), state);
  assert.equal(refused.mutation, 'rejected');
});

test('a file cannot hold parameters, unknown schedule keys or keys beside frequency None', () => {
  for (const [spec, code] of [
    [{ parameters: [] }, 'UNKNOWN_SEGMENT_CONFIGURATION'],
    [{ schedule: { ...weekly(), every: 1 } }, 'UNKNOWN_SEGMENT_CONFIGURATION'],
    [{ schedule: { frequency: 'None', interval: 1 } }, 'INVALID_SEGMENT_DOCUMENT'],
    [{ schedule: 'Weekly' }, 'INVALID_SEGMENT_DOCUMENT'],
    [{ schedule: {} }, 'INVALID_SEGMENT_DOCUMENT'],
    [{ schedule: { ...weekly(), endDateTime: jsonNull } }, 'INVALID_SEGMENT_DOCUMENT'],
    [{ schedule: { frequency: 7 } }, 'INVALID_SEGMENT_DOCUMENT'],
  ])
    assert.throws(
      () => validateSegmentDocument(document('DBT', spec)),
      { code },
      JSON.stringify(spec),
    );
  // Salesforce reads parameters [] on every segment and has no write for them; others stay as-is.
  assert.throws(
    () =>
      projectSegment(
        { segments: [raw('UI', { parameters: [{ name: 'p' }] })] },
        'Audience',
        'retrieve',
      ),
    { code: 'UNSUPPORTED_SEGMENT_VARIANT' },
  );
});

test('criteria of another type are kept on retrieve and refused on deploy', () => {
  const read = raw('Dynamic', { includeCriteria: '{&quot;type&quot;:&quot;Any&quot;}' });
  const kept = projectSegment({ segments: [read] }, 'Audience', 'retrieve').candidate;
  assert.equal(kept.spec.includeCriteria, read.includeCriteria);
  assert.throws(() => validateSegmentDocument(kept), { code: 'UNKNOWN_SEGMENT_CONFIGURATION' });
});

test('a date the file schedule leaves out is kept; a write that resets it is a mismatch', async () => {
  const ended = { ...weeklyRead(), publishScheduleEndDateTime: '2027-01-01T00:00:00.000Z' };
  const desired = document('DBT', { schedule: { frequency: 'Weekly', daysOfWeek: ['Friday'] } });
  const kept = org(raw('DBT', ended));
  const result = await deploy(desired, kept);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.equal(kept.current.publishScheduleEndDateTime, '2027-01-01T00:00:00.000Z');
  const reset = org(raw('DBT', ended));
  const patch = reset.options.patch;
  reset.options.patch = async (document, schedule) => {
    const echo = await patch(document, schedule);
    delete reset.current.publishScheduleEndDateTime;
    delete echo.publishScheduleEndDateTime;
    return echo;
  };
  const mismatch = await deploy(desired, reset);
  assert.equal(mismatch.mutation, 'unknown');
  assert.deepEqual(codes(mismatch), ['SEGMENT_READBACK_MISMATCH']);
});
