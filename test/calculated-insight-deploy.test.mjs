import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCalculatedInsight } from '../lib/artifacts/calculated-insight-document.js';
import { bindCalculatedInsightDependencies } from '../lib/services/bind-calculated-insight-dependencies.js';
import { preflightCalculatedInsightDeploy } from '../lib/services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../lib/services/execute-calculated-insight-deploy.js';
import { ConnectError } from '../lib/transport/connect-client.js';

// eslint-disable-next-line unicorn/no-null -- Synthetic complete native fixtures require explicit wire null.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const original = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`;
const edited = original.replace('WHERE 1 = 0', `WHERE 1 = 0 AND ${device} IS NOT NULL`);
const runtime = (expression = original, status = 'ACTIVE', schedule = 'SYSTEM_MANAGED') => ({
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
  publishScheduleInterval: schedule,
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
const nativeRuntime = (expression = original, status = 'DRAFT') => ({
  ...runtime(expression, status, 'NOT_SCHEDULED'),
  ...(status === 'DRAFT' ? { dimensions: [], measures: [] } : {}),
  historyPublishScheduleInterval: wireNull,
  historyPublishScheduleTimeZone: wireNull,
  historyPublishTime: wireNull,
  publishScheduleTimeZone: wireNull,
  sourceCiDevName: wireNull,
  sourceCiId: wireNull,
  sourceCiName: wireNull,
  isFromPackage: false,
  queryDialect: 'ANSI_SQL',
});
const document = (expression = original, schedule = 'NOT_SCHEDULED') =>
  projectCalculatedInsight(
    { ...nativeRuntime(expression, 'ACTIVE'), publishScheduleInterval: schedule },
    metadata(expression),
    { retrieval: true },
  ).document;
// The fixed Metadata and dependency receiver of the native68 context.
const version = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' };
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

const nativeVersion = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
/**
 * Synthetic native deploy context with isolated exact reads and mutation counters.
 * @param {string} initial Initial target state or absence.
 * @param {string} desiredExpression Qualified desired expression.
 * @returns {object} Mutable offline context and service calls.
 */
function nativeHarness(initial = 'absent', desiredExpression = original) {
  let state = initial;
  let expression = original;
  const calls = { create: 0, update: 0, get: 0, options: [], observations: [] };
  const target = { ...connection(), getApiVersion: () => '68.0' };
  const context = {
    check() {},
    async get() {
      calls.get++;
      if (state === 'absent') throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      return nativeRuntime(expression, state);
    },
    async metadata() {
      return state === 'absent' ? [{}] : [metadata(expression)];
    },
    async bind() {
      return binding();
    },
  };
  const desired = document(desiredExpression, 'NOT_SCHEDULED');
  const options = {
    draft: true,
    context,
    allowProcessing: true,
    verifyInput: async () => {},
    recordObservation: async (value) => {
      calls.observations.push(value);
    },
    nativeClient: {
      async create(value) {
        calls.create++;
        state = 'DRAFT';
        expression = value.spec.expression;
      },
      async update(value, intent) {
        calls.update++;
        calls.options.push(intent);
        expression = value.spec.expression;
      },
    },
    delay: async () => {},
  };
  return {
    calls,
    context,
    options,
    desired,
    target,
    setState(value) {
      state = value;
    },
    setExpression(value) {
      expression = value;
    },
    run: () => executeCalculatedInsightDeploy(desired, target, nativeVersion, 'default', options),
    preview: () =>
      preflightCalculatedInsightDeploy(desired, target, nativeVersion, 'default', options),
  };
}

test('native68 preview confirms dual absence and POST without mutation', async () => {
  const h = nativeHarness();
  const result = await h.preview();
  assert.equal(result.outcome, 'create');
  assert.equal(result.target, 'absent');
  assert.equal(result.absenceProof, 'native-item-not-found+metadata-empty');
  assert.equal(result.route.method, 'POST');
  assert.equal(h.calls.create + h.calls.update, 0);
});
for (const initial of ['absent', 'DRAFT', 'ACTIVE'])
  test(`native68 service dispatches exact real transport for ${initial}`, async () => {
    const h = nativeHarness(initial, edited);
    if (initial === 'ACTIVE') delete h.options.draft;
    const writer = h.options.nativeClient;
    delete h.options.nativeClient;
    h.target.request = async (request, options) => {
      assert.equal(options.retry.maxRetries, 0);
      assert.match(request.url, /\/services\/data\/v68\.0\/ssot\/calculated-insights/u);
      const body = JSON.parse(request.body);
      if (initial === 'absent') {
        assert.equal(request.method, 'POST');
        assert.deepEqual(body, {
          apiName: h.desired.identity.apiName,
          displayName: h.desired.spec.displayName,
          expression: edited,
          definitionType: 'CalculatedMetric',
          dataSpaceName: 'default',
          draft: true,
        });
        await writer.create(h.desired);
      } else {
        assert.equal(request.method, 'PATCH');
        assert.deepEqual(body, {
          expression: edited,
          ...(initial === 'DRAFT' ? { draft: true } : {}),
        });
        await writer.update(h.desired, initial === 'DRAFT' ? { draft: true } : undefined);
      }
    };
    const result = await h.run();
    assert.equal(result.mutation, initial === 'absent' ? 'confirmed-created' : 'confirmed-updated');
  });
test('native68 ambiguous draft PATCH is never retried or converted to POST', async () => {
  const h = nativeHarness('DRAFT', edited);
  h.options.nativeClient.update = async () => {
    h.calls.update++;
    throw new Error('ambiguous');
  };
  const result = await h.run();
  assert.equal(result.mutation, 'unknown');
  assert.equal(h.calls.update, 1);
  assert.equal(h.calls.create, 0);
});
test('native68 accepted POST with perpetual PROCESSING exhausts twelve GETs without replay', async () => {
  const h = nativeHarness();
  const create = h.options.nativeClient.create;
  h.options.nativeClient.create = async (value) => {
    await create(value);
    h.setState('PROCESSING');
  };
  const result = await h.run();
  assert.equal(result.mutation, 'unknown');
  assert.equal(h.calls.get, 14);
  assert.equal(h.calls.create, 1);
});
test('native68 desired document mutation during input guard is blocked', async () => {
  const h = nativeHarness();
  let n = 0;
  h.options.verifyInput = async () => {
    if (++n === 3) h.desired.spec.expression = edited;
  };
  const result = await h.run();
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(h.calls.create, 0);
});
test('native68 create ignores empty echo and independently confirms retained DRAFT', async () => {
  const h = nativeHarness();
  const result = await h.run();
  assert.equal(result.outcome, 'created');
  assert.equal(result.mutation, 'confirmed-created');
  assert.equal(result.route.apiVersion, '68.0');
  assert.equal(result.route.method, 'POST');
  assert.equal(h.calls.create, 1);
  assert.equal(h.calls.update, 0);
  assert.equal(h.calls.get, 3);
  assert.equal(h.calls.observations.at(-1).status, 'DRAFT');
});
for (const status of ['DRAFT', 'ACTIVE']) {
  test(`native68 ${status} expression edit preserves exact intent and repeat is GET-only`, async () => {
    const h = nativeHarness(status, edited);
    if (status === 'ACTIVE') delete h.options.draft;
    const preview = await h.preview();
    assert.equal(preview.outcome, 'update');
    const result = await h.run();
    assert.equal(result.mutation, 'confirmed-updated');
    assert.deepEqual(h.calls.options, [status === 'DRAFT' ? { draft: true } : undefined]);
    h.options.allowProcessing = false;
    const repeat = await h.run();
    assert.equal(repeat.outcome, 'unchanged');
    assert.equal(h.calls.update, 1);
    assert.equal(h.calls.create, 0);
    const repeatedPreview = await h.preview();
    assert.equal(repeatedPreview.outcome, 'unchanged');
  });
}
for (const [name, change] of [
  [
    'absent without draft',
    (h) => {
      delete h.options.draft;
    },
  ],
  [
    'ACTIVE cannot become draft',
    (h) => {
      h.setState('ACTIVE');
    },
  ],
  [
    'PROCESSING not deployable',
    (h) => {
      h.setState('PROCESSING');
    },
  ],
  [
    'unknown generic404',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404);
      };
    },
  ],
  [
    'auth failure',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 403);
      };
    },
  ],
  [
    'throttle failure',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 429);
      };
    },
  ],
  [
    'Metadata ambiguous',
    (h) => {
      h.context.metadata = async () => [];
    },
  ],
  [
    'Metadata present while native absent',
    (h) => {
      h.context.metadata = async () => [metadata()];
    },
  ],
  [
    'label conversion',
    (h) => {
      h.setState('DRAFT');
      h.desired.spec.displayName = 'Foreign';
    },
  ],
  [
    'schedule conversion',
    (h) => {
      h.desired.spec.publishScheduleInterval = 'SYSTEM_MANAGED';
    },
  ],
  [
    'input drift',
    (h) => {
      h.options.verifyInput = async () => {
        throw new Error('drift');
      };
    },
  ],
  [
    'dependency drift',
    (h) => {
      let n = 0;
      h.context.bind = async () => ({ ...binding(), targetId: String(++n) });
    },
  ],
  [
    'state drift',
    (h) => {
      let n = 0;
      const get = h.context.get;
      h.context.get = async () => {
        if (++n === 2) h.setState('DRAFT');
        return get();
      };
    },
  ],
  [
    'selection drift',
    (h) => {
      h.options.verifyInput = async () => {
        h.target.getApiVersion = () => '65.0';
      };
    },
  ],
  [
    'missing processing acknowledgement',
    (h) => {
      h.options.allowProcessing = false;
    },
  ],
])
  test(`native68 prewrite safeguard ${name} never writes or falls back`, async () => {
    const h = nativeHarness();
    change(h);
    const result = await h.run();
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.calls.create + h.calls.update, 0);
  });
for (const [name, change] of [
  [
    'ambiguous POST',
    (h) => {
      h.options.nativeClient.create = async () => {
        h.calls.create++;
        throw new Error('timeout');
      };
    },
  ],
  [
    'accepted POST then read failure',
    (h) => {
      const get = h.context.get;
      h.context.get = async () => {
        if (h.calls.create > 0) throw new Error('timeout');
        return get();
      };
    },
  ],
  [
    'settlement state conversion',
    (h) => {
      const create = h.options.nativeClient.create;
      h.options.nativeClient.create = async (value) => {
        await create(value);
        h.setState('ACTIVE');
      };
    },
  ],
  [
    'dependency settlement drift',
    (h) => {
      let n = 0;
      h.context.bind = async () => ({
        ...binding(),
        targetId: ++n > 2 ? 'drift' : binding().targetId,
      });
    },
  ],
  [
    'write deadline',
    (h) => {
      let clock = 0;
      h.options.now = () => clock;
      const create = h.options.nativeClient.create;
      h.options.nativeClient.create = async (value) => {
        await create(value);
        clock = 120_000;
      };
    },
  ],
])
  test(`native68 ${name} remains unknown with exactly one write`, async () => {
    const h = nativeHarness();
    change(h);
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.equal(result.outcome, 'failed');
    assert.equal(h.calls.create, 1);
    assert.equal(h.calls.update, 0);
    assert.doesNotMatch(JSON.stringify(result), /SELECT|target-local|timeout/u);
  });

test('native68 drift check ignores alternating derived attribution between reads', async () => {
  for (const [initial, desiredExpression, outcome] of [
    ['ACTIVE', original, 'unchanged'],
    ['ACTIVE', edited, 'updated'],
  ]) {
    const h = nativeHarness(initial, desiredExpression);
    delete h.options.draft;
    const get = h.context.get;
    let reads = 0;
    // Recorded live: consecutive GETs of one unchanged CI alternate the attributed field.
    h.context.get = async () => {
      const raw = await get();
      const sourceApiName =
        ++reads % 2 === 0 ? 'ssot__DeviceId__c' : 'ssot__SoftwareApplicationId__c';
      for (const role of ['dimensions', 'measures'])
        raw[role][0].dataSource = { sourceApiName, type: 'STREAMING_DATA_MODEL' };
      raw.lastCalcInsightStatusDateTime = `2026-11-12T07:0${reads % 10}:00.000Z`;
      return raw;
    };
    const result = await h.run();
    assert.equal(result.outcome, outcome, JSON.stringify(result));
    assert.equal(h.calls.update, outcome === 'updated' ? 1 : 0);
  }
});

for (const [name, drift] of [
  ['expression', (h) => h.setExpression(edited)],
  ['status', (h) => h.setState('DRAFT')],
])
  test(`native68 real ${name} drift between baseline and fresh plan still refuses`, async () => {
    const h = nativeHarness('ACTIVE', original);
    delete h.options.draft;
    let n = 0;
    const get = h.context.get;
    h.context.get = async () => {
      if (++n === 2) drift(h);
      return get();
    };
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(result.diagnostics[0].code, 'CI_ADMISSION_FAILED');
    assert.equal(h.calls.create + h.calls.update, 0);
  });
