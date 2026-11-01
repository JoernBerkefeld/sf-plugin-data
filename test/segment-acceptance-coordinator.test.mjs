import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  coordinateSegmentAcceptance,
  SEGMENT_ACCEPTANCE_SCHEDULE,
} from '../scripts/segment-acceptance-coordinator.mjs';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const owner = {
  apiName: 'Audience',
  marketSegmentId: 'segment-original',
  marketSegmentDefinitionId: 'definition-original',
  createdBy: { id: 'creator-original' },
  createdDate: '2026-01-01T00:00:00.000Z',
};
const expected = {
  apiName: 'Audience',
  dmoApiName: 'Person__dlm',
  fieldApiName: 'Id__c',
  displayName: 'Audience forward',
  description: 'Synthetic coordinator only',
};
/**
 * Build isolated synthetic raw state, never live org evidence.
 * @returns {object} Complete raw shape.
 */
function raw() {
  const sql =
    'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0 AND Person__dlm.Id__c IS NOT NULL';
  const criteria =
    `<DbtPipeline xmlns=""><models><model><name>Audience</name><sql>${sql}</sql></model></models></DbtPipeline>`
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  return {
    runtime: {
      segments: [
        {
          ...owner,
          dataSpace: 'default',
          description: expected.description,
          displayName: expected.displayName,
          includeCriteria: criteria,
          includeDbt: { models: [{ name: 'Audience', sql }] },
          lastModifiedBy: { id: 'editor-forward' },
          lastModifiedDate: '2026-01-02T00:00:00.000Z',
          lastSegmentMemberCount: 0,
          lookbackPeriod: 'P90D',
          parameters: [],
          publishInterval: 'NO_REFRESH',
          segmentMembershipDmo: {
            historyTable: 'PersonHistory__dlm',
            latestTable: 'PersonLatest__dlm',
          },
          segmentOnApiName: 'Person__dlm',
          segmentOnId: 'person-local',
          segmentStatus: 'ACTIVE',
          segmentType: 'DBT',
        },
      ],
    },
    definitionXml: `<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>${criteria}</includeCriteria><masterLabel>Audience forward</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>`,
    dependency: {
      detail: {
        name: 'Person__dlm',
        id: 'person-local',
        dataSpaceName: 'default',
        category: 'PROFILE',
        label: 'Person',
        isSegmentable: true,
        fields: [{ name: 'Id__c', type: 'Text', isPrimaryKey: true, label: 'Person identifier' }],
      },
      metadata: [
        {
          fullName: 'Person__dlm',
          label: 'Person',
          mktDataModelAttributes: { dataSpaceName: 'default', isSegmentable: 'true' },
          fields: [
            {
              fullName: 'Id__c',
              type: 'Text',
              label: 'Person identifier',
              mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
            },
          ],
        },
      ],
    },
    bindings: [
      {
        identity: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
        targetId: 'person-local',
        fields: [{ apiName: 'Id__c', dataType: 'Text', isPrimaryKey: true }],
      },
    ],
  };
}
/**
 * Build tiny complete synthetic ustar binding evidence without disk fixtures.
 * @returns {object} Artifact evidence.
 */
function artifact() {
  const packageIdentity = { name: 'sf-plugin-data', version: '0.1.0' };
  const root = 'F:/Temp/synthetic-coordinator/plugin';
  const entries = [
    ...['deploy', 'retrieve'].map((command) => ({
      path: `lib/commands/data360/${command}.js`,
      bytes: Buffer.from(`synthetic ${command}`),
    })),
    { path: 'package.json', bytes: Buffer.from(JSON.stringify(packageIdentity)) },
  ];
  const members = entries;
  const blocks = members.map(({ path, bytes }) => {
    const header = Buffer.alloc(512);
    header.write(`package/${path}`);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(
      `${[...header]
        .reduce((a, b) => a + b, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
  });
  return {
    packageIdentity,
    entries,
    manifestBytes: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        files: entries.map(({ path, bytes }) => ({ path, sha256: sha(bytes), size: bytes.length })),
      }),
    ),
    tarballBytes: gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])),
    installedFiles: entries.map(({ path, bytes }) => ({ path, bytes: Buffer.from(bytes) })),
    inventory: [{ ...packageIdentity, root, packageSha256: sha(JSON.stringify(packageIdentity)) }],
    commandOrigins: Object.fromEntries(
      ['retrieve', 'deploy'].map((command) => [
        command,
        {
          packageRoot: root,
          resolvedPath: `${root}/lib/commands/data360/${command}.js`,
          sha256: sha(`synthetic ${command}`),
        },
      ]),
    ),
  };
}
const project = String.raw`F:\Temp\synthetic-coordinator\project`;
const xmlPath = String.raw`${project}\force-app\main\default\marketSegmentDefinitions\Audience.marketSegmentDefinition-meta.xml`;
const jsonPath = String.raw`${project}\force-app\main\default\data360\segments\Audience.segment.json`;
/**
 * Hand-authored public pair fixture from the documented authored schema, not production projection.
 * @returns {object} Synthetic bytes only.
 */
function pair() {
  return {
    xmlBytes: Buffer.from(raw().definitionXml),
    jsonBytes: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'segment',
        identity: { dataSpace: 'default', apiName: 'Audience' },
        spec: {
          displayName: expected.displayName,
          description: expected.description,
          segmentType: 'DBT',
          segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
          models: [
            {
              name: 'Audience',
              sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0 AND Person__dlm.Id__c IS NOT NULL',
            },
          ],
          dependencies: [
            { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
          ],
          publishInterval: 'NO_REFRESH',
          lookbackPeriod: 'P90D',
        },
      }),
    ),
  };
}
/**
 * Actual public command envelope shape in an oclif JSON wrapper; synthetic, never live proof.
 * @param {string} phase Fixed public phase.
 * @returns {object} Envelope fixture.
 */
function publicOutput(phase) {
  const retrieve = phase === 'retrieve' || phase === 'repeat';
  const operation = retrieve ? 'retrieve' : 'deploy';
  const preview = {
    outcome: 'unchanged',
    target: 'present',
    absenceProof: 'none',
    diagnostics: [],
  };
  return {
    status: 0,
    warnings: [],
    result: {
      contract: `sf-data360-${operation}`,
      contractVersion: '1.0.0',
      status: 'success',
      metadata: {
        operation,
        ...(retrieve ? {} : { preview: phase === 'preview' }),
        plugin: { name: 'sf-plugin-data', version: '0.1.0' },
        apiVersion: '65.0',
        soapApiVersion: '65.0',
      },
      diagnostics: { warnings: [], errors: [] },
      provenance: {
        producer: 'sf-plugin-data',
        pluginVersion: '0.1.0',
        command: `sf data360 ${operation}`,
        generatedAt: '2026-01-03T00:01:00.000Z',
        [retrieve ? 'sourceOrgId' : 'targetOrgId']: '00D000000000001',
      },
      result: {
        scope: { dataSpace: 'default', ...(retrieve ? { outputDir: project } : {}) },
        selection: retrieve
          ? ['segment:Audience']
          : { sourceDir: [], metadata: ['segment:Audience'] },
        items: [
          {
            identity: { dataSpace: 'default', apiName: 'Audience' },
            family: 'segment',
            operation: retrieve ? 'retrieve' : phase === 'preview' ? 'preview' : 'execute',
            path: xmlPath,
            ...(retrieve
              ? { companionPath: jsonPath, outcome: phase === 'repeat' ? 'unchanged' : 'retrieved' }
              : {
                  outcome: 'unchanged',
                  requiredEffects: [],
                  diagnostics: [],
                  route: {
                    apiVersion: '65.0',
                    method: phase === 'preview' ? 'GET' : 'PATCH',
                    resource: 'segments',
                  },
                  ...(phase === 'preview'
                    ? { target: 'present', absenceProof: 'none' }
                    : { mutation: 'not-attempted', preflight: preview }),
                }),
          },
        ],
      },
    },
  };
}
const installed = [
  function installedRead() {},
  function installedProject() {},
  function installedCompare() {},
];
/**
 * Supply an explicitly synthetic process runner and independent evidence adapter.
 * @param {string} fault Optional failure scenario.
 * @returns {object} Inputs, seams and captured ordered events.
 */
function scenario(fault) {
  let time = 0;
  let current;
  let stopped;
  let closed = false;
  const used = { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 };
  const events = [];
  const audit = () => ({
    stopped,
    used: { ...used },
    pending: fault === 'pendingfinal' && current === 'final' ? ['pending-read'] : [],
    activeJobs: fault === 'activefinaljob' && current === 'final' ? ['active-job'] : [],
  });
  const acquire = async function independentSyntheticAcquire({ phase }) {
    events.push(`acquire:${phase}`);
    if (fault === 'missingbaseline' && phase === 'baseline') return {};
    const provenance = {
      runId: 'synthetic-coordinator',
      runStartedAt: '2026-01-03T00:00:00.000Z',
      observedAt: phase === 'final' ? '2026-01-03T00:02:00.000Z' : '2026-01-03T00:01:00.000Z',
      now: '2026-01-03T00:03:00.000Z',
      acquisition: {
        implementation: acquire,
        sourcePath: 'F:/Temp/synthetic-coordinator/independent.mjs',
        sourceSha256: sha('independent'),
      },
      installedServices: installed.map((implementation, index) => ({
        implementation,
        sourcePath: `F:/Temp/synthetic-coordinator/plugin/lib/services/${index}.js`,
        sourceSha256: sha(`installed-${index}`),
      })),
    };
    if (fault === 'reversedbaseline' && phase === 'baseline')
      provenance.observedAt = '2026-01-04T00:00:00.000Z';
    if (fault === 'finalauditdeadline' && phase === 'final') time = 1_800_000;
    if (fault === 'finalphasedeadline' && phase === 'final') time += 370_000;
    const state = raw();
    if (fault === 'finaldrift' && phase === 'final')
      state.runtime.segments[0].description = 'drift';
    return { raw: state, provenance };
  };
  const runner = {
    audit,
    stop(reason) {
      stopped = reason;
    },
    async close() {
      closed = true;
    },
    beginPhase(name, cost, finalCost) {
      events.push(`phase:${name}`);
      current = name;
      assert.deepEqual(cost, SEGMENT_ACCEPTANCE_SCHEDULE.find((step) => step.name === name).cost);
      assert.deepEqual(finalCost, SEGMENT_ACCEPTANCE_SCHEDULE.at(-1).cost);
    },
    async runRoot({ operation }) {
      events.push(`root:${operation}`);
      if (fault === 'skippedfinal' && current === 'final') return;
      if (fault === 'skippedrepeat' && current === 'repeat') return;
      const complete = current === 'baseline' || current === 'final';
      used.orgProcesses += complete ? 2 : 1;
      used.metadataJobs += complete ? 1 : 0;
      used.logicalReads += complete ? 6 : 0;
      if (current === 'final' && fault === 'emptyfinal') {
        used.orgProcesses -= 2;
        used.metadataJobs -= 1;
        used.logicalReads -= 6;
      }
      if (current === 'final' && fault === 'underdeclaredfinal') used.logicalReads -= 1;
      const output = complete ? undefined : publicOutput(current);
      if (fault?.startsWith(`${current}:`)) {
        const change = fault.split(':')[1];
        const item = output.result.result.items[0];
        if (change === 'selection') output.result.result.selection = [];
        if (change === 'missingselection') delete output.result.result.selection;
        if (change === 'missingenvelope') delete output.result;
        if (change === 'missingresult') delete output.result.result;
        if (change === 'warnings') output.warnings = ['unexpected warning'];
        if (change === 'extraeffect') item.processing = 'attempted';
        if (change === 'missingeffects') delete item.requiredEffects;
        if (change === 'identity') item.identity.apiName = 'Other';
        if (change === 'items') output.result.result.items = [];
        if (change === 'org')
          output.result.provenance[
            complete
              ? 'unused'
              : current === 'retrieve' || current === 'repeat'
                ? 'sourceOrgId'
                : 'targetOrgId'
          ] = 'other';
        if (change === 'plugin') output.result.metadata.plugin.version = '9.0.0';
        if (change === 'api') output.result.metadata.apiVersion = '67.0';
        if (change === 'outcome') item.outcome = 'update';
        if (change === 'effects') item.requiredEffects = ['processing'];
        if (change === 'mutation') item.mutation = 'confirmed-updated';
        if (change === 'missingmutation') delete item.mutation;
        if (change === 'preflight') item.preflight.outcome = 'update';
      }
      return {
        id: `synthetic-${current}`,
        evidence: {
          stdout:
            fault === `${current}:missing`
              ? undefined
              : fault === `${current}:malformed`
                ? '{'
                : JSON.stringify(output),
          assignedBeforeResume: true,
          rootExited: true,
          activeProcessesZero: true,
          outputDrained: true,
          outputTruncated: fault === 'badkernel',
        },
      };
    },
  };
  let bindings = 0;
  return {
    events,
    closed: () => closed,
    stopped: () => stopped,
    input: {
      profile: {
        segment: 'Audience',
        dmo: 'Person__dlm',
        field: 'Id__c',
        orgId: '00D000000000001',
        cwd: project,
      },
      originalOwner: owner,
      expectedForward: expected,
      acquire,
      readPair: async ({ phase, item, receipt }) => {
        events.push(`pair:${phase}`);
        assert.equal(item.path, xmlPath);
        assert.equal(item.companionPath, jsonPath);
        assert.equal(receipt.id, `synthetic-${phase}`);
        if (fault === `${phase}:missingpair`) return;
        const value = pair();
        if (fault === `${phase}:jsonbytes`)
          value.jsonBytes = Buffer.from(
            value.jsonBytes.toString().replace('Audience forward', 'Wrong label'),
          );
        if (fault === `${phase}:xmlbytes`)
          value.xmlBytes = Buffer.from(
            value.xmlBytes.toString().replace('Audience forward', 'Wrong label'),
          );
        if (fault === 'repeat:jsonformat' && phase === 'repeat')
          value.jsonBytes = Buffer.concat([value.jsonBytes, Buffer.from('\n')]);
        if (fault === 'repeat:xmlformat' && phase === 'repeat')
          value.xmlBytes = Buffer.concat([value.xmlBytes, Buffer.from('\n')]);
        return value;
      },
      artifactEvidence: async () => {
        events.push('artifact');
        bindings++;
        if (fault === 'finalbindingdeadline' && bindings === 8) time += 370_000;
        if (fault === 'setupdeadline') time = 1_800_000;
        if (fault === 'missingbinding') return;
        const value = artifact();
        if (fault === 'driftedbinding' && bindings > 1) value.entries[0].bytes[0] = 0;
        return value;
      },
    },
    seams: {
      createRunner: async (_profile, clock) => {
        assert.equal(clock.startedAt, 0);
        assert.equal(clock.now(), time);
        return runner;
      },
      now: () => time,
      wallNow: () => 10_000,
    },
  };
}

test('declared worst-case schedule is refused before setup', async () => {
  const s = scenario();
  await assert.rejects(coordinateSegmentAcceptance(s.input, s.seams), /acceptance refused/);
  assert.deepEqual(s.events, []);
  assert.equal(s.closed(), false);
  assert.equal(s.stopped(), undefined);
  assert.equal(
    SEGMENT_ACCEPTANCE_SCHEDULE.reduce((total, step) => total + step.cost.milliseconds, 0),
    2_450_000,
  );
  assert.deepEqual(
    SEGMENT_ACCEPTANCE_SCHEDULE.map(({ name }) => name),
    ['baseline', 'retrieve', 'repeat', 'preview', 'deploy', 'final'],
  );
  const total = { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 };
  for (const { cost } of SEGMENT_ACCEPTANCE_SCHEDULE)
    for (const key of Object.keys(total)) total[key] += cost[key];
  assert.deepEqual(total, { orgProcesses: 15, metadataJobs: 9, logicalReads: 90 });
  assert.ok(Object.isFrozen(SEGMENT_ACCEPTANCE_SCHEDULE.at(-1).cost));
});

test('coordinator does not expose sensitive input errors', async () => {
  const s = scenario();
  Object.defineProperty(s.input, 'profile', {
    get() {
      throw Object.assign(new Error('secret response body'), { stdout: 'secret stdout' });
    },
  });
  await assert.rejects(coordinateSegmentAcceptance(s.input, s.seams), (error) => {
    assert.equal(error.message, 'SEGMENT_ACCEPTANCE_COORDINATOR: acceptance refused');
    assert.equal(error.stdout, undefined);
    assert.equal(error.cause, undefined);
    return true;
  });
});

// Replace only the default runner in this synthetic copy; injected seams and callbacks are not sandboxed.
const coordinatorUrl = new URL('../scripts/segment-acceptance-coordinator.mjs', import.meta.url);
const coordinatorSource = await readFile(coordinatorUrl, 'utf8');
const runnerImport = "'./segment-acceptance-runner.mjs'";
assert.equal(coordinatorSource.split(runnerImport).length, 2);
const stubUrl = `data:text/javascript,${encodeURIComponent('export let calls = 0; export function createSegmentAcceptanceRunner() { calls++; throw new Error("stub invoked"); }')}`;
const runnerStub = await import(stubUrl);
const syntheticSource = coordinatorSource
  .replace("import './check-temporary.mjs';", '')
  .replace(runnerImport, JSON.stringify(stubUrl))
  .replace(
    "'./segment-acceptance-baseline.mjs'",
    JSON.stringify(new URL('../scripts/segment-acceptance-baseline.mjs', import.meta.url).href),
  )
  .replace('if (worstCase > 1_800_000)', 'if (worstCase > 2_450_000)');
const synthetic = await import(
  `data:text/javascript;base64,${Buffer.from(syntheticSource).toString('base64')}`
);
assert.equal(coordinatorSource.split('if (worstCase > 1_800_000)').length, 2);
assert.notEqual(syntheticSource, coordinatorSource);
test('synthetic coordinator invokes the substituted default runner stub', async () => {
  const s = scenario();
  const before = runnerStub.calls;
  await assert.rejects(synthetic.coordinateSegmentAcceptance(s.input, {}), /acceptance refused/);
  assert.equal(runnerStub.calls, before + 1);
  assert.deepEqual(s.events, []);
});
assert.equal(
  synthetic.SEGMENT_ACCEPTANCE_SCHEDULE.reduce((sum, step) => sum + step.cost.milliseconds, 0),
  2_450_000,
);
test('fixed ordered outcome binds before baseline, admits baseline before public phases, audits final', async () => {
  const s = scenario();
  const result = await synthetic.coordinateSegmentAcceptance(s.input, s.seams);
  assert.equal(result.success, true);
  assert.equal(result.liveAcquisitionProven, false);
  assert.equal(result.comparison.equal, true);
  assert.equal(result.receipts.length, 6);
  assert.deepEqual(
    SEGMENT_ACCEPTANCE_SCHEDULE.map(({ name }) => name),
    ['baseline', 'retrieve', 'repeat', 'preview', 'deploy', 'final'],
  );
  assert.ok(s.events.indexOf('pair:repeat') < s.events.indexOf('phase:preview'));
  const total = { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 };
  for (const { cost } of SEGMENT_ACCEPTANCE_SCHEDULE)
    for (const key of Object.keys(total)) total[key] += cost[key];
  assert.deepEqual(total, { orgProcesses: 15, metadataJobs: 9, logicalReads: 90 });
  assert.ok(s.events.indexOf('artifact') < s.events.indexOf('phase:baseline'));
  assert.ok(s.events.indexOf('acquire:baseline') < s.events.indexOf('phase:retrieve'));
  assert.equal(s.events.at(-1), 'artifact');
  assert.ok(s.closed());
  assert.ok(Object.isFrozen(SEGMENT_ACCEPTANCE_SCHEDULE.at(-1).cost));
});
for (const fault of [
  'missingbaseline',
  'reversedbaseline',
  'missingbinding',
  'driftedbinding',
  'emptyfinal',
  'underdeclaredfinal',
  'activefinaljob',
  'pendingfinal',
  'finalbindingdeadline',
  'skippedfinal',
  'finalauditdeadline',
  'finalphasedeadline',
  'finaldrift',
  'badkernel',
  'setupdeadline',
]) {
  test(`coordinator refuses ${fault} without an outcome receipt`, async () => {
    const s = scenario(fault);
    await assert.rejects(synthetic.coordinateSegmentAcceptance(s.input, s.seams));
    assert.ok(s.stopped());
    assert.ok(s.closed());
    if (
      [
        'missingbaseline',
        'reversedbaseline',
        'missingbinding',
        'driftedbinding',
        'setupdeadline',
      ].includes(fault)
    )
      assert.ok(!s.events.includes('phase:retrieve'));
  });
}
for (const phase of ['retrieve', 'repeat', 'preview', 'deploy']) {
  for (const change of [
    'missing',
    'malformed',
    'selection',
    'missingselection',
    'missingenvelope',
    'missingresult',
    'warnings',
    'extraeffect',
    'identity',
    'items',
    'org',
    'plugin',
    'api',
    'outcome',
    ...(phase === 'retrieve' || phase === 'repeat'
      ? ['missingpair', 'jsonbytes', 'xmlbytes']
      : ['effects', 'missingeffects']),
    ...(phase === 'repeat' ? ['jsonformat', 'xmlformat'] : []),
    ...(phase === 'deploy' ? ['missingmutation', 'mutation', 'preflight'] : []),
  ]) {
    test(`public ${phase} refuses ${change} before later phases or outcome success`, async () => {
      const s = scenario(`${phase}:${change}`);
      await assert.rejects(synthetic.coordinateSegmentAcceptance(s.input, s.seams));
      assert.ok(s.stopped());
      assert.ok(s.closed());
      const next = { retrieve: 'repeat', repeat: 'preview', preview: 'deploy', deploy: 'final' }[
        phase
      ];
      assert.ok(!s.events.includes(`phase:${next}`));
    });
  }
}
test('missing second public retrieve receipt refuses before preview without outcome success', async () => {
  const s = scenario('skippedrepeat');
  await assert.rejects(synthetic.coordinateSegmentAcceptance(s.input, s.seams));
  assert.ok(!s.events.includes('phase:preview'));
});
test('caller cannot reverse phases, skip final or underdeclare its fixed cost', async () => {
  for (const overrides of [
    { schedule: [] },
    { finalCost: {} },
    { phases: ['final', 'baseline'] },
  ]) {
    const s = scenario();
    await assert.rejects(coordinateSegmentAcceptance({ ...s.input, ...overrides }, s.seams));
    assert.deepEqual(s.events, []);
  }
});
