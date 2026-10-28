import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectCalculatedInsight,
  observeCalculatedInsight,
} from '../lib/artifacts/calculated-insight-document.js';
import { retrieveCalculatedInsight } from '../lib/services/retrieve-calculated-insight.js';
import { bindCalculatedInsightDependencies } from '../lib/services/bind-calculated-insight-dependencies.js';
import { preflightCalculatedInsightDeploy } from '../lib/services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../lib/services/execute-calculated-insight-deploy.js';
import { ConnectClient } from '../lib/transport/connect-client.js';

// eslint-disable-next-line unicorn/no-null -- Synthetic complete API65 fixtures require explicit wire null.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const original = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`;
const edited = original.replace('WHERE 1 = 0', `WHERE 1 = 0 AND ${device} IS NOT NULL`);
const runtime = (expression = original, status = 'ACTIVE') => ({
  apiName: 'SyntheticInsight__cio',
  dataSpace: 'default',
  calculatedInsightStatus: status,
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: wireNull,
  displayName: 'Synthetic insight',
  expression,
  isEnabled: true,
  dimensions: [
    {
      apiName: 'app_id__c',
      creationType: 'Custom',
      dataSource: wireNull,
      dataType: 'Text',
      dateGranularity: wireNull,
      displayName: 'app_id',
      fieldRole: 'DIMENSION',
      formula: application,
    },
  ],
  measures: [
    {
      apiName: 'device_count__c',
      creationType: 'Custom',
      dataSource: wireNull,
      dataType: 'Number',
      displayName: 'device_count',
      fieldAggregationType: 'NONAGGREGATABLE',
      fieldRole: 'MEASURE',
      formula: `APPROX_COUNT_DISTINCT(${device})`,
    },
  ],
  publishScheduleEndDate: wireNull,
  publishScheduleInterval: 'SYSTEM_MANAGED',
  publishScheduleStartDateTime: wireNull,
  subType: wireNull,
  lastCalcInsightStatusDateTime: '2026-10-28T10:00:00.000Z',
  lastCalcInsightStatusErrorCode: wireNull,
  lastRunDateTime: wireNull,
  lastRunStatus: wireNull,
  lastRunStatusDateTime: wireNull,
  lastRunStatusErrorCode: wireNull,
});
const metadata = (expression = original) => ({
  fullName: 'SyntheticInsight',
  creationType: 'Custom',
  expression,
  masterLabel: 'Synthetic insight',
});
const document = (expression = original) =>
  projectCalculatedInsight(runtime(expression), metadata(expression)).document;
const version = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' };
const acquisition = (expression = original) => ({
  identity: document().identity,
  candidate: document(expression),
  observations: projectCalculatedInsight(runtime(expression), metadata(expression)).observations,
  expectations: { runtime: runtime(expression), metadata: metadata(expression) },
  blockers: [],
});
const connection = (expression = original) => ({
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '65.0',
  request: async (request, options) => {
    assert.equal(request.method, 'GET');
    assert.match(request.url, /calculated-insights\/SyntheticInsight__cio$/u);
    assert.equal(options.retry.maxRetries, 0);
    return runtime(expression);
  },
  _transport: { httpRequest() {} },
  metadata: {
    async read(type, names) {
      assert.equal(type, 'MktCalcInsightObjectDef');
      assert.deepEqual(names, ['SyntheticInsight']);
      assert.notEqual(this._conn, connection);
      return [metadata(expression)];
    },
  },
});
const binding = () => ({
  identity: { kind: 'dmo', dataSpace: 'default', apiName: table },
  targetId: 'target-local',
  fields: [
    { apiName: 'ssot__DeviceId__c', dataType: 'Text' },
    { apiName: 'ssot__SoftwareApplicationId__c', dataType: 'Text' },
  ],
});
const compatible = () => ({
  detail: {
    id: 'target-local',
    name: table,
    dataSpaceName: 'default',
    category: 'ENGAGEMENT',
    creationType: 'Standard',
    isEnabled: true,
    fields: binding().fields.map(({ apiName }) => ({
      name: apiName,
      type: 'Text',
      isMapped: true,
    })),
  },
  metadata: [
    {
      fullName: table,
      mktDataModelAttributes: { dataSpaceName: 'default' },
      fields: binding().fields.map(({ apiName }) => ({ fullName: apiName, type: 'Text' })),
    },
  ],
});

/**
 * Create isolated synthetic service spies.
 * @param {object} overrides Bounded injected readers and guards.
 * @param {object} desired Complete desired document.
 * @returns {object} Calls and executable fixture.
 */
function harness(overrides = {}, desired = document(edited)) {
  const calls = { writes: 0, reads: 0, captures: 0, bindings: 0, inputs: 0, observations: [] };
  const options = {
    allowProcessing: true,
    verifyInput: async () => {
      calls.inputs++;
    },
    recordObservation: async (value) => {
      calls.observations.push(value);
    },
    bind: async () => {
      calls.bindings++;
      return binding();
    },
    acquire: async () => {
      calls.captures++;
      return acquisition(calls.writes > 0 ? edited : original);
    },
    patch: async () => {
      calls.writes++;
      return runtime(edited, 'PROCESSING');
    },
    read: async () => {
      calls.reads++;
      return runtime(edited);
    },
    delay: async () => {},
    ...overrides,
  };
  return {
    calls,
    run: () => executeCalculatedInsightDeploy(desired, connection(), version, 'default', options),
  };
}

test('CI independent acquisition uses exact API65 runtime and guarded SOAP definition', async () => {
  const result = await retrieveCalculatedInsight(
    connection(),
    'SyntheticInsight__cio',
    version,
    'default',
  );
  assert.deepEqual(result.candidate, document());
  assert.deepEqual(result.blockers, []);
});
for (const mutation of [
  (value) => {
    value.metadata.read = async () => [];
  },
  (value) => {
    value.request = async () => runtime(edited);
  },
  (value) => {
    value.request = async () => {
      throw new Error('private remote content');
    };
  },
])
  test('CI incomplete/404/mismatched independent acquisition blocks without absence claim', async () => {
    const target = connection();
    mutation(target);
    const result = await retrieveCalculatedInsight(
      target,
      'SyntheticInsight__cio',
      version,
      'default',
    );
    assert.equal(result.candidate, undefined);
    assert.equal(result.blockers.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private remote/u);
  });

test('CI pending runtime validation does not weaken ACTIVE Metadata projection', () => {
  const pending = runtime(edited, 'PROCESSING');
  assert.equal(observeCalculatedInsight(pending).status, 'PROCESSING');
  assert.throws(() => projectCalculatedInsight(pending, metadata(edited)));
  pending.lastCalcInsightStatusErrorCode = 'FAILED';
  assert.throws(() => observeCalculatedInsight(pending));
});

test('CI target dependencies bind exact mapped Text fields independently', async () => {
  assert.deepEqual(
    await bindCalculatedInsightDependencies(
      document(),
      connection(),
      version,
      'default',
      async () => compatible(),
    ),
    binding(),
  );
});
for (const [name, change] of [
  [
    'wrong space',
    (value) => {
      value.detail.dataSpaceName = 'other';
    },
  ],
  [
    'wrong category',
    (value) => {
      value.detail.category = 'PROFILE';
    },
  ],
  [
    'disabled',
    (value) => {
      value.detail.isEnabled = false;
    },
  ],
  [
    'unmapped',
    (value) => {
      delete value.detail.fields[0].isMapped;
    },
  ],
  [
    'type mismatch',
    (value) => {
      value.metadata[0].fields[0].type = 'Number';
    },
  ],
  [
    'duplicate runtime fields',
    (value) => {
      value.detail.fields.push({ ...value.detail.fields[0] });
    },
  ],
  [
    'duplicate metadata fields',
    (value) => {
      value.metadata[0].fields.push({ ...value.metadata[0].fields[0] });
    },
  ],
  [
    'missing field',
    (value) => {
      value.detail.fields.pop();
    },
  ],
  [
    'ambiguous metadata',
    (value) => {
      value.metadata.push({ ...value.metadata[0] });
    },
  ],
])
  test(`CI dependency refusal: ${name}`, async () => {
    const data = compatible();
    change(data);
    await assert.rejects(
      bindCalculatedInsightDependencies(
        document(),
        connection(),
        version,
        'default',
        async () => data,
      ),
    );
  });

test('CI preflight classifies update/unchanged with exact effects and blocks shell/absence', async () => {
  for (const [expression, outcome] of [
    [original, 'unchanged'],
    [edited, 'update'],
  ]) {
    const preview = await preflightCalculatedInsightDeploy(
      document(expression),
      connection(),
      version,
      'default',
      async () => acquisition(),
      async () => binding(),
    );
    assert.equal(preview.outcome, outcome);
    assert.deepEqual(preview.requiredEffects, outcome === 'update' ? ['processing'] : []);
  }
  const preview = await preflightCalculatedInsightDeploy(
    document(),
    connection(),
    version,
    'default',
    async () => ({ identity: document().identity, blockers: ['CI_ACQUISITION_FAILED'] }),
    async () => binding(),
  );
  assert.equal(preview.outcome, 'blocked');
  assert.equal(preview.absenceProof, 'none');
});

test('CI unchanged makes zero mutation/job dispatches without acknowledgement', async () => {
  const fixture = harness({ allowProcessing: false }, document());
  const result = await fixture.run();
  assert.equal(result.outcome, 'unchanged');
  assert.equal(fixture.calls.writes, 0);
  assert.equal(fixture.calls.reads, 0);
  assert.equal(fixture.calls.bindings, 2);
});
test('CI update without processing acknowledgement performs zero writes', async () => {
  const fixture = harness({ allowProcessing: false });
  const result = await fixture.run();
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(result.diagnostics[0].code, 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  assert.equal(fixture.calls.writes, 0);
});
test('CI one PATCH settles independently with detached attribution observations', async () => {
  const echo = runtime(edited, 'PROCESSING');
  echo.measures[0].dataSource = {
    sourceApiName: 'ssot__DeviceId__c',
    type: 'STREAMING_DATA_MODEL',
  };
  const fixture = harness();
  let sent = false;
  const result = await executeCalculatedInsightDeploy(
    document(edited),
    connection(),
    version,
    'default',
    {
      allowProcessing: true,
      verifyInput: async () => {},
      recordObservation: async (value) => fixture.calls.observations.push(value),
      bind: async () => binding(),
      acquire: async () => {
        const data = acquisition(sent ? edited : original);
        if (sent)
          data.expectations.runtime.measures[0].dataSource = {
            sourceApiName: 'ssot__SoftwareApplicationId__c',
            type: 'STREAMING_DATA_MODEL',
          };
        return data;
      },
      patch: async () => {
        fixture.calls.writes++;
        sent = true;
        return echo;
      },
      read: async () => runtime(edited),
    },
  );
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(fixture.calls.writes, 1);
  assert.deepEqual(
    fixture.calls.observations.map((value) => value.phase),
    ['baseline', 'echo', 'poll', 'settled'],
  );
  assert.equal(
    fixture.calls.observations.at(-1).observations.derivedAttribution.measures[0].sourceApiName,
    'ssot__SoftwareApplicationId__c',
  );
  assert.doesNotMatch(JSON.stringify(result), /dataSource|SELECT|target-local/u);
});
for (const [name, override] of [
  [
    'input drift',
    {
      verifyInput: async () => {
        throw new Error('drift');
      },
    },
  ],
  ['missing observation recorder', { recordObservation: undefined }],
  [
    'dependency missing',
    {
      bind: async () => {
        throw new Error('missing');
      },
    },
  ],
  [
    'acquisition mismatch',
    { acquire: async () => ({ ...acquisition(), candidate: document(edited) }) },
  ],
])
  test(`CI prewrite guard zero mutations: ${name}`, async () => {
    const fixture = harness(override);
    const result = await fixture.run();
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(fixture.calls.writes, 0);
  });
for (const [name, override] of [
  ['unknown state', { read: async () => runtime(edited, 'ERROR') }],
  [
    'read failure',
    {
      read: async () => {
        throw new Error('read failed');
      },
    },
  ],
  ['schema drift', { read: async () => ({ ...runtime(edited), isEnabled: false }) }],
  ['Metadata readback drift', { acquire: async () => acquisition() }],
  ['never settles', { read: async () => runtime(edited, 'PROCESSING') }],
  [
    'failed mutation',
    {
      patch: async () => {
        throw new Error('timeout');
      },
    },
  ],
])
  test(`CI mutation uncertainty never replays: ${name}`, async () => {
    const fixture = harness(override);
    const result = await fixture.run();
    assert.equal(result.mutation, 'unknown');
    assert.ok(fixture.calls.writes <= 1);
  });
test('CI deadline includes PATCH latency and refuses late success', async () => {
  let clock = 0;
  const fixture = harness({
    now: () => clock,
    patch: async () => {
      clock = 120_000;
      return runtime(edited, 'PROCESSING');
    },
  });
  const result = await fixture.run();
  assert.equal(result.mutation, 'unknown');
  assert.equal(fixture.calls.reads, 0);
});
test('CI dependency binding drift before dispatch blocks without mutation', async () => {
  let calls = 0;
  const fixture = harness({ bind: async () => ({ ...binding(), targetId: String(++calls) }) });
  const result = await fixture.run();
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(fixture.calls.writes, 0);
});
test('CI deadline includes final independent Metadata and compatibility reads', async () => {
  let clock = 0;
  let captures = 0;
  const fixture = harness({
    now: () => clock,
    acquire: async () => {
      captures++;
      if (captures === 3) clock = 120_000;
      return acquisition(captures === 3 ? edited : original);
    },
  });
  const result = await fixture.run();
  assert.equal(result.mutation, 'unknown');
  assert.equal(fixture.calls.writes, 1);
});
test('CI PROCESSING poll then ACTIVE requires final independent acquisition', async () => {
  let polls = 0;
  const fixture = harness({
    read: async () => runtime(edited, ++polls === 1 ? 'PROCESSING' : 'ACTIVE'),
  });
  const result = await fixture.run();
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(fixture.calls.captures, 3);
  assert.equal(fixture.calls.writes, 1);
  assert.equal(polls, 2);
});
test('CI transport sends exactly expression and disables replay/redirect', async () => {
  let calls = 0;
  const client = new ConnectClient(
    {
      instanceUrl: connection().instanceUrl,
      _refreshDelegate: {},
      async request(request, options) {
        calls++;
        assert.equal(this._refreshDelegate, undefined);
        assert.equal(request.method, 'PATCH');
        assert.equal(
          request.url,
          `${connection().instanceUrl}/services/data/v65.0/ssot/calculated-insights/SyntheticInsight__cio`,
        );
        assert.deepEqual(JSON.parse(request.body), { expression: edited });
        assert.equal(options.retry.maxRetries, 0);
        assert.throws(() => options.followRedirect());
        return runtime(edited, 'PROCESSING');
      },
    },
    version,
  );
  await client.patchCalculatedInsight(document(edited));
  assert.equal(calls, 1);
  await assert.rejects(
    new ConnectClient(connection(), '67.0').patchCalculatedInsight(document(edited)),
  );
});
