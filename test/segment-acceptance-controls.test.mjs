import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSegmentAcceptanceArgv,
  createSegmentAcceptance,
  parseSegmentReadSoap,
  SEGMENT_ACCEPTANCE_LIMITS,
  validateSegmentProcess,
  validateSegmentRead,
} from '../scripts/segment-acceptance-controls.mjs';

const profile = {
  executable: 'F:/Node/node.exe',
  cliEntry: 'F:/cli/bin/run.js',
  launcherEntry: 'F:/scratch/launcher.mjs',
  importOrigin: 'F:/installed/lib/index.js',
  cwd: 'F:/scratch/project',
  orgId: '00D000000000001AAA',
  targetOrg: 'source',
  origin: 'https://source.example',
  apiVersion: '65.0',
  segment: 'Selected',
  dmo: 'Profile__dlm',
  field: 'Id__c',
};
const namespace = 'http://soap.sforce.com/2006/04/metadata';
const jobId = '09S000000000001AAA';
const finalCost = { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 };
const phaseCost = { orgProcesses: 14, metadataJobs: 8, logicalReads: 96, milliseconds: 1_500_000 };
const read = (id = 'r1', body) => ({
  id,
  method: body ? 'POST' : 'GET',
  url: body
    ? `${profile.origin}/services/Soap/m/65.0/${profile.orgId}`
    : `${profile.origin}/services/data/v65.0/ssot/segments/${profile.segment}`,
  orgId: profile.orgId,
  apiVersion: '65.0',
  redirect: 'error',
  body,
});
const retrieve = (id = 'retrieve') =>
  read(id, {
    namespace,
    operation: 'retrieve',
    apiVersion: '65.0',
    singlePackage: true,
    types: [{ name: 'MarketSegmentDefinition', members: [profile.segment] }],
  });
const poll = (id = 'poll', operation = 'checkRetrieveStatus') =>
  read(id, { namespace, operation, jobId, includeZip: operation === 'retrieveResult' });
const processRequest = (id = 'p1', operation = 'metadata-retrieve') => ({
  id,
  operation,
  executable: profile.executable,
  argv: buildSegmentAcceptanceArgv(profile, operation),
  cwd: profile.cwd,
  importOrigin: profile.importOrigin,
  api: 'spawn',
  shell: false,
  timeoutMs: 10_000,
});
const setup = (requested = phaseCost) => {
  let time = 1000;
  const ledger = createSegmentAcceptance(profile, { now: () => time });
  ledger.beginPhase('baseline', requested, finalCost);
  return {
    ledger,
    setTime: (value) => {
      time = value;
    },
  };
};
const success = (ledger, id) => ledger.observeResult({ id, outcome: 'success' });
const completed = (ledger, id, value = jobId) =>
  ledger.observeResult({
    id,
    outcome: 'success',
    completion: {
      jobId: value,
      includeZip: true,
      done: true,
      outcome: 'success',
      zipPresent: true,
      closeJob: true,
    },
  });
const register = (ledger, id = 'retrieve', value = jobId) =>
  ledger.registerMetadataJob({
    operationId: id,
    jobId: value,
    orgId: profile.orgId,
    apiVersion: '65.0',
  });

test('known command builders use current exact CLI selectors and preview flag', () => {
  assert.deepEqual(buildSegmentAcceptanceArgv(profile, 'segment-retrieve'), [
    profile.cliEntry,
    'data360',
    'retrieve',
    '--metadata',
    'segment:Selected',
    '--target-org',
    'source',
    '--api-version',
    '65.0',
    '--json',
  ]);
  const preview = buildSegmentAcceptanceArgv(profile, 'segment-preview');
  assert.ok(preview.includes('--preview'));
  assert.ok(!preview.includes('--dry-run'));
  assert.ok(!buildSegmentAcceptanceArgv(profile, 'segment-deploy').includes('--preview'));
  assert.throws(() => buildSegmentAcceptanceArgv(profile, 'unknown'));
  assert.throws(() => createSegmentAcceptance({ ...profile, executable: 'F:/Windows/cmd.exe' }));
});

test('both parent and child dispatches share the same precharged closure', () => {
  const { ledger } = setup();
  const parent = ledger;
  const childBroker = (event) => ledger.dispatchProcess(event);
  parent.dispatchProcess(processRequest('parent', 'historical-launcher'));
  childBroker(processRequest('child'));
  assert.equal(parent.audit().used.orgProcesses, 2);
  const audit = parent.audit();
  assert.throws(() => {
    audit.used.orgProcesses = 0;
  });
  assert.throws(() => {
    audit.pending.push('forged');
  });
  parent.stop('cancel');
  assert.equal(parent.audit().used.orgProcesses, 2);
  assert.throws(() => childBroker(processRequest('retry')), /cancel/u);
});

test('wrong job, duplicate result, changed descriptors and missing phase fail closed', () => {
  const unstarted = createSegmentAcceptance(profile);
  assert.throws(() => unstarted.dispatchRead(read()), /missing phase/u);
  const { ledger } = setup();
  const request = retrieve();
  ledger.dispatchRead(request);
  request.body.operation = 'deleteMetadata';
  register(ledger);
  const wrong = poll();
  wrong.body.jobId = '09S000000000002AAA';
  assert.throws(() => ledger.dispatchRead(wrong), /inactive/u);
  const other = setup().ledger;
  other.dispatchRead(read());
  success(other, 'r1');
  assert.throws(() => success(other, 'r1'), /unknown result/u);
  const duplicate = setup().ledger;
  duplicate.dispatchRead(retrieve());
  register(duplicate);
  duplicate.dispatchRead(poll('done', 'retrieveResult'));
  completed(duplicate, 'done');
  duplicate.dispatchRead(retrieve('again'));
  assert.throws(() => register(duplicate, 'again'), /registration refused/u);
});

test('fixed immutable maxima and constructor starts all-in clock before setup', () => {
  let time = 0;
  const ledger = createSegmentAcceptance(profile, { now: () => time });
  time = 1_500_001;
  assert.throws(() => ledger.beginPhase('setup', phaseCost, finalCost), /preserve milliseconds/u);
  assert.equal(ledger.audit().startedAt, 0);
  assert.deepEqual(SEGMENT_ACCEPTANCE_LIMITS, {
    orgProcesses: 16,
    metadataJobs: 9,
    logicalReads: 100,
    milliseconds: 1_800_000,
    subprocessMilliseconds: 600_000,
  });
  assert.ok(Object.isFrozen(SEGMENT_ACCEPTANCE_LIMITS));
  assert.equal(ledger.audit().wireRequests, 'UNKNOWN');
  assert.equal(ledger.audit().authRequests, 'UNKNOWN');
});

test('precharges all 14 nonfinal processes, preserves final launcher+child, refuses 17th', () => {
  const { ledger } = setup();
  for (let index = 0; index < 14; index++) {
    const id = `p${index}`;
    ledger.dispatchProcess(processRequest(id));
    success(ledger, id);
  }
  ledger.beginPhase('final', finalCost, finalCost);
  ledger.dispatchProcess(processRequest('launcher', 'historical-launcher'));
  success(ledger, 'launcher');
  ledger.dispatchProcess(processRequest('child'));
  success(ledger, 'child');
  assert.equal(ledger.audit().used.orgProcesses, 16);
  assert.throws(() => ledger.dispatchProcess(processRequest('extra')), /exhausted orgProcesses/u);
});

test('each poll/result charges a logical read, exact registered jobs cannot replay', () => {
  const { ledger } = setup();
  ledger.dispatchRead(retrieve());
  register(ledger);
  for (let index = 0; index < 3; index++) {
    ledger.dispatchRead(poll(`poll${index}`));
    success(ledger, `poll${index}`);
  }
  ledger.dispatchRead(poll('result', 'retrieveResult'));
  completed(ledger, 'result');
  assert.deepEqual(ledger.audit().used, { orgProcesses: 0, metadataJobs: 1, logicalReads: 5 });
  assert.throws(() => ledger.dispatchRead(poll('late')), /inactive or unknown/u);
  assert.ok(ledger.audit().stopped);
});

test('pending include-ZIP evidence keeps job open; missing or inconsistent completion stops', () => {
  const { ledger } = setup();
  ledger.dispatchRead(retrieve());
  register(ledger);
  for (const id of ['pending1', 'pending2']) {
    ledger.dispatchRead(poll(id, 'retrieveResult'));
    ledger.observeResult({
      id,
      outcome: 'success',
      completion: {
        jobId,
        includeZip: true,
        done: false,
        outcome: 'success',
        zipPresent: false,
        closeJob: false,
      },
    });
    assert.deepEqual(ledger.audit().activeJobs, [jobId]);
  }
  ledger.dispatchRead(poll('terminal', 'retrieveResult'));
  completed(ledger, 'terminal');
  assert.deepEqual(ledger.audit().activeJobs, []);
  assert.deepEqual(ledger.audit().seenJobs, [jobId]);
  for (const completion of [
    undefined,
    { jobId, includeZip: true, done: false, outcome: 'success', zipPresent: false, closeJob: true },
  ]) {
    const other = setup().ledger;
    other.dispatchRead(retrieve());
    register(other);
    other.dispatchRead(poll('bad', 'retrieveResult'));
    assert.throws(
      () =>
        other.observeResult({
          id: 'bad',
          outcome: 'success',
          ...(completion ? { completion } : {}),
        }),
      /completion/u,
    );
    assert.equal(other.audit().used.logicalReads, 2);
    assert.deepEqual(other.audit().activeJobs, [jobId]);
    assert.ok(other.audit().stopped);
  }
});

test('read limit is 100 including separate final reads and no refund', () => {
  const { ledger } = setup();
  for (let index = 0; index < 96; index++) {
    ledger.dispatchRead(read(`r${index}`));
    success(ledger, `r${index}`);
  }
  ledger.beginPhase('final', finalCost, finalCost);
  for (let index = 96; index < 100; index++) {
    ledger.dispatchRead(read(`r${index}`));
    success(ledger, `r${index}`);
  }
  assert.equal(ledger.audit().used.logicalReads, 100);
  assert.throws(() => ledger.dispatchRead(read('overflow')), /exhausted logicalReads/u);
});

test('retrieve attempts consume all nine jobs independently of process count', () => {
  const { ledger } = setup();
  for (let index = 0; index < 9; index++) {
    if (index === 8) ledger.beginPhase('final', finalCost, finalCost);
    ledger.dispatchRead(retrieve(`retrieve${index}`));
    const id = `09S00000000000${index}AAA`;
    register(ledger, `retrieve${index}`, id);
    const result = poll(`result${index}`, 'retrieveResult');
    result.body.jobId = id;
    ledger.dispatchRead(result);
    completed(ledger, `result${index}`, id);
  }
  assert.equal(ledger.audit().used.metadataJobs, 9);
  assert.throws(() => ledger.dispatchRead(retrieve('extra')), /exhausted metadataJobs/u);
});

for (const outcome of ['failure', 'uncertain']) {
  test(`${outcome} launch stops globally, stays charged, cannot retry or register more work`, () => {
    const { ledger } = setup();
    ledger.dispatchProcess(processRequest());
    assert.throws(() => ledger.observeResult({ id: 'p1', outcome }), new RegExp(outcome, 'u'));
    assert.equal(ledger.audit().used.orgProcesses, 1);
    assert.throws(() => ledger.dispatchProcess(processRequest('fresh')), new RegExp(outcome, 'u'));
    assert.throws(() => ledger.beginPhase('other', finalCost, finalCost));
  });
}

test('logical read failures remain charged and successful IDs cannot replay', () => {
  const { ledger } = setup();
  ledger.dispatchRead(read());
  success(ledger, 'r1');
  assert.throws(() => ledger.dispatchRead(read()), /replay/u);
  assert.equal(ledger.audit().used.logicalReads, 1);
  const second = setup().ledger;
  second.dispatchRead(retrieve());
  assert.throws(() => second.observeResult({ id: 'retrieve', outcome: 'failure' }), /failure/u);
  assert.equal(second.audit().used.metadataJobs, 1);
});

test('reserve is componentwise max of minima and complete actual final cost', () => {
  for (const [key, value] of Object.entries({
    orgProcesses: 3,
    metadataJobs: 2,
    logicalReads: 5,
    milliseconds: 300_001,
  })) {
    const ledger = createSegmentAcceptance(profile);
    assert.throws(
      () => ledger.beginPhase('baseline', phaseCost, { ...finalCost, [key]: value }),
      /preserve/u,
    );
  }
  const ledger = createSegmentAcceptance(profile);
  assert.throws(
    () => ledger.beginPhase('baseline', phaseCost, { ...finalCost, orgProcesses: 1 }),
    /launcher and child/u,
  );
  const other = createSegmentAcceptance(profile);
  assert.throws(
    () => other.beginPhase('deploy', { ...finalCost, metadataJobs: 3, orgProcesses: 4 }, finalCost),
    /deploy cost/u,
  );
  const enough = createSegmentAcceptance(profile);
  enough.beginPhase('deploy', { ...finalCost, metadataJobs: 4, orgProcesses: 5 }, finalCost);
});

test('actual deploy cannot bypass complete minimum phase costs by renaming its phase', () => {
  const { ledger } = setup(finalCost);
  assert.throws(
    () => ledger.dispatchProcess(processRequest('deploy', 'segment-deploy')),
    /deploy cost/u,
  );
  assert.equal(ledger.audit().used.orgProcesses, 0);
});

test('malformed/negative/fractional/overflow/extra costs cannot alter fixed caps', () => {
  for (const invalid of [-1, 0.5, Infinity, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '2']) {
    const ledger = createSegmentAcceptance(profile);
    assert.throws(
      () => ledger.beginPhase('x', { ...finalCost, logicalReads: invalid }, finalCost),
      /invalid cost/u,
    );
  }
  assert.throws(() => createSegmentAcceptance({ ...profile, maxReads: 1000 }), /fields/u);
  assert.throws(() => setup({ ...finalCost, extra: 1 }), /fields/u);
  assert.throws(() => setup({ ...phaseCost, orgProcesses: Number.MAX_SAFE_INTEGER }), /preserve/u);
});

test('deadline, backwards/invalid clock, per-process deadline and 10 minute maximum fail closed', () => {
  for (const time of [0, Number.NaN, Infinity, -1, 1_801_000]) {
    const { ledger, setTime } = setup();
    setTime(time);
    assert.throws(() => ledger.dispatchRead(read()), /clock|deadline/u);
  }
  const { ledger, setTime } = setup();
  ledger.dispatchProcess(processRequest());
  setTime(11_000);
  assert.throws(() => success(ledger, 'p1'), /subprocess deadline/u);
  const next = setup().ledger;
  assert.throws(
    () => next.dispatchProcess({ ...processRequest(), timeoutMs: 600_001 }),
    /exactly admitted/u,
  );
  const phase = setup({ ...finalCost, milliseconds: 1 });
  phase.setTime(1001);
  assert.throws(() => phase.ledger.dispatchRead(read()), /phase deadline/u);
  const short = setup({ ...finalCost, milliseconds: 100 });
  assert.throws(() => short.ledger.dispatchProcess(processRequest()), /remaining time/u);
});

test('final declaration cannot shrink or expand, pending work cannot change phase', () => {
  const { ledger } = setup();
  assert.throws(
    () => ledger.beginPhase('next', finalCost, { ...finalCost, logicalReads: 5 }),
    /changed/u,
  );
  const second = setup().ledger;
  second.dispatchRead(read());
  assert.throws(() => second.beginPhase('next', finalCost, finalCost), /transition/u);
  const third = setup().ledger;
  assert.throws(
    () => third.beginPhase('final', { ...finalCost, logicalReads: 3 }, finalCost),
    /incomplete/u,
  );
});

test('exact executable/full argv/api/org/origin and bypass refusal', () => {
  validateSegmentProcess(profile, processRequest());
  for (const patch of [
    { executable: 'F:/Node/cmd.exe' },
    { argv: [...processRequest().argv, '--help'] },
    { argv: ['--eval', 'process.exit()'] },
    { shell: true },
    { api: 'execFile', operation: 'segment-retrieve' },
    { api: 'fork' },
    { api: 'worker' },
    { importOrigin: 'F:/other/index.js' },
    { cwd: 'F:/other' },
    { env: {} },
    { timeoutMs: -1 },
    { argv: processRequest().argv.map((v) => (v === '65.0' ? '66.0' : v)) },
    { argv: processRequest().argv.map((v) => (v === 'source' ? 'target' : v)) },
  ])
    assert.throws(() => validateSegmentProcess(profile, { ...processRequest(), ...patch }));
  for (const patch of [
    { executable: 'node' },
    { apiVersion: '66.0' },
    { origin: 'http://source.example' },
    { origin: 'https://source.example/' },
    { targetOrg: '-help' },
  ])
    assert.throws(() => createSegmentAcceptance({ ...profile, ...patch }));
  const mutable = { ...profile };
  const ledger = createSegmentAcceptance(mutable);
  mutable.origin = 'https://evil.example';
  ledger.beginPhase('x', finalCost, finalCost);
  ledger.dispatchRead(read());
});

test('only selected exact GET routes, identity query, no redirects/body/unknown fields', () => {
  validateSegmentRead(profile, read());
  validateSegmentRead(profile, {
    ...read(),
    url: `${profile.origin}/services/data/v65.0/ssot/data-model-objects/${profile.dmo}`,
  });
  validateSegmentRead(profile, {
    ...read(),
    url: `${profile.origin}/services/data/v65.0/query?q=${encodeURIComponent(`SELECT Id FROM Organization WHERE Id = '${profile.orgId}'`)}`,
  });
  for (const patch of [
    { method: 'DELETE' },
    { method: 'get' },
    { redirect: 'follow' },
    { orgId: '00D000000000002AAA' },
    { apiVersion: '64.0' },
    { body: {} },
    { url: `${read().url}?extra=1` },
    { url: read().url.replace('source.example', 'evil.example') },
    { url: read().url.replace('Selected', 'Other') },
    { headers: {} },
    { url: read().url.replace('/v65.0/', '/v66.0/') },
    { url: read().url.replace('https:', 'http:') },
  ])
    assert.throws(() => validateSegmentRead(profile, { ...read(), ...patch }));
});

test('semantic POST permits selected readMetadata/retrieve only, rejects namespace/type/member/version/extras', () => {
  const selected = read('metadata', {
    namespace,
    operation: 'readMetadata',
    type: 'CustomObject',
    fullNames: [profile.dmo],
  });
  validateSegmentRead(profile, selected);
  validateSegmentRead(profile, retrieve());
  for (const patch of [
    { namespace: 'evil' },
    { operation: 'deleteMetadata' },
    { type: 'ApexClass' },
    { fullNames: [profile.dmo, 'Other'] },
    { extra: true },
  ])
    assert.throws(() =>
      validateSegmentRead(profile, { ...selected, body: { ...selected.body, ...patch } }),
    );
  for (const patch of [
    { apiVersion: '66.0' },
    { singlePackage: false },
    { types: [{ name: 'CustomObject', members: [profile.dmo] }] },
    { unpackaged: {} },
  ])
    assert.throws(() =>
      validateSegmentRead(profile, { ...retrieve(), body: { ...retrieve().body, ...patch } }),
    );
  assert.throws(() => validateSegmentRead(profile, poll()));
  validateSegmentRead(profile, poll(), new Set([jobId]));
  assert.throws(() =>
    validateSegmentRead(
      profile,
      { ...poll(), body: { ...poll().body, includeZip: true } },
      new Set([jobId]),
    ),
  );
});

test('job registration binds successful retrieve dispatch, exact job/org/version, uniqueness and phase', () => {
  for (const patch of [
    { jobId: 'wrong' },
    { orgId: '00D000000000002AAA' },
    { apiVersion: '66.0' },
    { operationId: 'missing' },
    { extra: 1 },
  ]) {
    const { ledger } = setup();
    ledger.dispatchRead(retrieve());
    assert.throws(() =>
      ledger.registerMetadataJob({
        operationId: 'retrieve',
        jobId,
        orgId: profile.orgId,
        apiVersion: '65.0',
        ...patch,
      }),
    );
  }
  const { ledger } = setup();
  ledger.dispatchRead(retrieve());
  register(ledger);
  assert.throws(() => ledger.beginPhase('next', finalCost, finalCost), /transition/u);
});

test('strict SOAP adapter matches entire canonical envelope, never substrings or unknown namespaces', () => {
  const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="${namespace}"><soapenv:Body><met:readMetadata><met:type>CustomObject</met:type><met:fullNames>${profile.dmo}</met:fullNames></met:readMetadata></soapenv:Body></soapenv:Envelope>`;
  assert.equal(parseSegmentReadSoap(profile, xml).operation, 'readMetadata');
  for (const bad of [
    xml + ' ',
    `<!DOCTYPE x>${xml}`,
    xml.replace(namespace, 'evil'),
    xml.replace(profile.dmo, 'Other'),
    xml.replace('</met:readMetadata>', '<met:extra>1</met:extra></met:readMetadata>'),
    xml.replace('<soapenv:Body>', '<soapenv:Header/><soapenv:Body>'),
    `<wrapper>${xml}</wrapper>`,
    'x'.repeat(16_385),
  ])
    assert.throws(() => parseSegmentReadSoap(profile, bad));
  const status = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="${namespace}"><soapenv:Body><met:checkRetrieveStatus><met:asyncProcessId>${jobId}</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus></soapenv:Body></soapenv:Envelope>`;
  assert.equal(parseSegmentReadSoap(profile, status, new Set([jobId])).operation, 'retrieveResult');
  assert.throws(() => parseSegmentReadSoap(profile, status));
});
