import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import {
  acquireExactCalculatedInsight,
  calculatedInsightReadContext,
} from '../lib/services/retrieve-calculated-insight.js';
import { settleCalculatedInsight } from '../lib/services/settle-calculated-insight.js';
import { observeCalculatedInsight } from '../lib/artifacts/calculated-insight-document.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  connectDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';

for (const status of [429, 503]) {
  test(`swallowed CI HTTP ${status} acquisition and settlement retain only safe evidence`, async () => {
    const h = harness();
    const evidence = connectDiagnostic(status, { 'Retry-After': '42' });
    h.context.get = async () => {
      throw retainConnectDiagnostic(new Error('Bearer secret <html>'), evidence);
    };
    const acquired = await acquire(h.context);
    assert.equal(acquired.state, 'unknown');
    assert.deepEqual(acquired.diagnostics, ['CI_RUNTIME_UNKNOWN']);
    assert.deepEqual(getConnectDiagnostic(acquired), evidence);
    const settled = await settle(h);
    assert.equal(settled.state, 'unknown');
    assert.deepEqual(getConnectDiagnostic(settled), evidence);
    assert.doesNotMatch(JSON.stringify({ acquired, settled }), /secret|html|Retry-After/u);
    assert.equal(h.counts.metadata, 0);
    const healthy = await acquire(harness().context);
    assert.equal(healthy.state, 'present');
    assert.equal(getConnectDiagnostic(healthy), undefined);
  });
}

// eslint-disable-next-line unicorn/no-null -- Synthetic native wire profiles require explicit null.
const nil = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const app = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${app} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${app}`;
const runtime = (status = 'ACTIVE') => ({
  apiName: 'SyntheticLifecycle__cio',
  dataSpace: 'default',
  calculatedInsightStatus: status,
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: nil,
  displayName: 'Synthetic lifecycle',
  expression,
  isEnabled: true,
  dimensions:
    status === 'DRAFT'
      ? []
      : [
          {
            apiName: 'app_id__c',
            creationType: 'Custom',
            dataSource: nil,
            dataType: 'Text',
            dateGranularity: nil,
            displayName: 'app_id',
            fieldRole: 'DIMENSION',
            formula: app,
          },
        ],
  measures:
    status === 'DRAFT'
      ? []
      : [
          {
            apiName: 'device_count__c',
            creationType: 'Custom',
            dataSource: nil,
            dataType: 'Number',
            displayName: 'device_count',
            fieldAggregationType: 'NONAGGREGATABLE',
            fieldRole: 'MEASURE',
            formula: `APPROX_COUNT_DISTINCT(${device})`,
          },
        ],
  publishScheduleEndDate: nil,
  publishScheduleInterval: 'NOT_SCHEDULED',
  publishScheduleStartDateTime: nil,
  subType: nil,
  lastCalcInsightStatusDateTime: '2026-11-01T00:00:00.000Z',
  lastCalcInsightStatusErrorCode: nil,
  lastRunDateTime: nil,
  lastRunStatus: nil,
  lastRunStatusDateTime: nil,
  lastRunStatusErrorCode: nil,
  historyPublishScheduleInterval: nil,
  historyPublishScheduleTimeZone: nil,
  historyPublishTime: nil,
  publishScheduleTimeZone: nil,
  sourceCiDevName: nil,
  sourceCiId: nil,
  sourceCiName: nil,
  isFromPackage: false,
  queryDialect: 'ANSI_SQL',
});
const metadata = () => [
  {
    fullName: 'SyntheticLifecycle',
    creationType: 'Custom',
    expression,
    masterLabel: 'Synthetic lifecycle',
  },
];
const document = observeCalculatedInsight(runtime(), '68.0').document;
const missing = () => {
  throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
};
/**
 * Build neutral independent read counters with a deterministic clock.
 * @param {string[]} states Successive native states.
 * @returns {object} Read context, clock and counters.
 */
function harness(states = ['ACTIVE']) {
  const counts = { get: 0, metadata: 0, bind: 0 };
  const context = {
    check() {},
    async get() {
      const status = states[Math.min(counts.get++, states.length - 1)];
      return status === 'absent' ? missing() : runtime(status);
    },
    async metadata() {
      counts.metadata++;
      return states[Math.min(counts.get - 1, states.length - 1)] === 'absent' ? [{}] : metadata();
    },
    async bind() {
      counts.bind++;
      return {
        identity: { kind: 'dmo', dataSpace: 'default', apiName: table },
        targetId: 'synthetic-local-id',
        fields: [
          { apiName: 'ssot__DeviceId__c', dataType: 'Text' },
          { apiName: 'ssot__SoftwareApplicationId__c', dataType: 'Text' },
        ],
      };
    },
  };
  let clock = 0;
  const timing = {
    now: () => clock,
    delay: async (ms) => {
      clock += ms;
    },
  };
  return {
    context,
    counts,
    timing,
    advance: (ms) => {
      clock += ms;
    },
  };
}
const acquire = (context, deleting = false) =>
  acquireExactCalculatedInsight(context, document.identity.apiName, deleting);
const settle = (h, status = 'ACTIVE') =>
  settleCalculatedInsight(h.context, document, status, h.timing);
const state = async (promise) => {
  const result = await promise;
  return result.state;
};

for (const status of ['ACTIVE', 'DRAFT', 'PROCESSING'])
  test(`exact ${status} acquisition preserves observation without claiming settlement`, async () => {
    const h = harness([status]);
    const result = await acquire(h.context);
    assert.equal(result.state, 'present');
    assert.equal(result.status, status);
    assert.deepEqual(result.document, document);
    assert.equal(h.counts.bind, 0);
  });
test('absence requires independent core single empty record and native discriminator', async () => {
  const h = harness(['absent']);
  assert.deepEqual(await acquire(h.context), {
    state: 'absent',
    absenceProof: 'native-item-not-found+metadata-empty',
  });
  assert.equal(h.counts.metadata, 1);
});
for (const records of [
  undefined,
  nil,
  {},
  [],
  [nil],
  [{ fullName: '' }],
  [{ fullName: 'SyntheticLifecycle' }],
  [{}, {}],
  metadata(),
])
  test(`missing runtime with malformed/present Metadata ${JSON.stringify(records)} is unknown`, async () => {
    const h = harness(['absent']);
    h.context.metadata = async () => records;
    assert.equal(await state(acquire(h.context)), 'unknown');
  });
for (const error of [
  new ConnectError('REQUEST_FAILED', 404),
  new ConnectError('REQUEST_FAILED', 403, 'ITEM_NOT_FOUND'),
  new ConnectError('AUTHENTICATION_FAILED', 401),
  new ConnectError('REQUEST_FAILED', 429),
  new ConnectError('REQUEST_FAILED', 500),
  new Error('private response'),
])
  test(`runtime ${error.code ?? 'raw'} ${error.statusCode} never proves absence`, async () => {
    const h = harness();
    h.context.get = async () => {
      throw error;
    };
    const result = await acquire(h.context);
    assert.equal(result.state, 'unknown');
    assert.doesNotMatch(JSON.stringify(result), /private response/u);
  });
for (const change of [
  (r) => {
    r.apiName = 'Other__cio';
  },
  (r) => {
    r.publishScheduleInterval = 'SYSTEM_MANAGED';
  },
  (r) => {
    r.lastRunStatus = 'SUCCESS';
  },
  (r) => {
    r.measures[0].formula = 'different';
  },
  (r) => {
    r.extra = true;
  },
])
  test('incomplete or foreign runtime fails closed', async () => {
    const h = harness();
    h.context.get = async () => {
      const r = runtime();
      change(r);
      return r;
    };
    assert.equal(await state(acquire(h.context)), 'unknown');
  });
test('runtime present and Metadata absent or mismatched is unknown', async () => {
  for (const records of [[{}], [{ ...metadata()[0], expression: 'different' }]]) {
    const h = harness();
    h.context.metadata = async () => records;
    assert.equal(await state(acquire(h.context)), 'unknown');
  }
});
for (const status of ['ACTIVE', 'DRAFT'])
  test(`PROCESSING settles only to expected ${status} after independent Metadata and binding`, async () => {
    const h = harness(['PROCESSING', status]);
    const result = await settle(h, status);
    assert.equal(result.state, 'present');
    assert.equal(result.acquisition.status, status);
    assert.deepEqual(h.counts, { get: 2, metadata: 2, bind: 1 });
  });
test('DELETING never enters normal acquisition; delete settlement ends only in dual absence', async () => {
  assert.equal(await state(acquire(harness(['DELETING']).context)), 'unknown');
  const h = harness(['DELETING', 'ACTIVE', 'absent']);
  assert.equal(await state(settle(h, 'absent')), 'absent');
  assert.deepEqual(h.counts, { get: 3, metadata: 3, bind: 0 });
});
for (const status of ['DRAFT', 'ERROR', 'UNRECOGNIZED', 'absent'])
  test(`unexpected ${status} cannot settle ACTIVE`, async () => {
    const h = harness([status]);
    assert.equal(await state(settle(h)), 'unknown');
    assert.equal(h.counts.get, 1);
  });
test('processing read budget is exactly twelve with no mutation-capable reader', async () => {
  const h = harness(['PROCESSING']);
  assert.equal(await state(settle(h)), 'unknown');
  assert.deepEqual(h.counts, { get: 12, metadata: 12, bind: 0 });
});
for (const phase of ['get', 'metadata', 'bind'])
  test(`late ${phase} response cannot claim completion or dispatch later reads`, async () => {
    const h = harness();
    const original = h.context[phase];
    h.context[phase] = async (...arguments_) => {
      const result = await original(...arguments_);
      h.advance(120_000);
      return result;
    };
    assert.equal(await state(settle(h)), 'unknown');
    if (phase === 'get') assert.equal(h.counts.metadata, 0);
    if (phase !== 'bind') assert.equal(h.counts.bind, 0);
  });
test('backward clock and excessive delay fail closed', async () => {
  for (const advance of [-1, 120_000]) {
    const h = harness(['PROCESSING']);
    h.timing.delay = async () => h.advance(advance);
    assert.equal(await state(settle(h)), 'unknown');
    assert.equal(h.counts.get, 1);
  }
});
test('stable content mismatch or binding failure is unknown', async () => {
  const h = harness();
  h.context.get = async () => ({ ...runtime(), displayName: 'Other label' });
  h.context.metadata = async () => [{ ...metadata()[0], masterLabel: 'Other label' }];
  assert.equal(await state(settle(h)), 'unknown');
  assert.equal(h.counts.bind, 0);
  const b = harness();
  b.context.bind = async () => {
    throw new Error('private binding');
  };
  assert.equal(await state(settle(b)), 'unknown');
});
test('never-resolving runtime is bounded by a real deadline timer with no later reads', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.context.get = () => new Promise(() => {});
  const pending = settle(h);
  t.mock.timers.tick(120_000);
  assert.equal(await state(pending), 'unknown');
  assert.equal(h.counts.metadata, 0);
});
test('invalid scope and Metadata failures fail before candidate admission', async () => {
  const h = harness();
  assert.equal(await state(acquireExactCalculatedInsight(h.context, '../foreign')), 'unknown');
  assert.equal(h.counts.get, 0);
  h.context.metadata = async () => {
    throw new Error('private SOAP');
  };
  assert.equal(await state(acquire(h.context)), 'unknown');
  for (const version of ['65.0', '67.0', 'latest'])
    assert.throws(() => calculatedInsightReadContext({ getApiVersion: () => version }, 'default'));
});
test('operation context uses native68 and isolated SOAP65 without mutating core receiver', async () => {
  const routes = [];
  const receiver = {
    instanceUrl: 'https://synthetic.example',
    version: '68.0',
    getApiVersion: Connection.prototype.getApiVersion,
    async request(request) {
      routes.push(request.url);
      return runtime();
    },
    _transport: { httpRequest() {} },
    metadata: {
      async read(type, names) {
        assert.equal(this._conn.getApiVersion(), '65.0');
        assert.equal(this._conn.version, '65.0');
        assert.equal(type, 'MktCalcInsightObjectDef');
        assert.deepEqual(names, ['SyntheticLifecycle']);
        return metadata();
      },
    },
  };
  const context = calculatedInsightReadContext(receiver, 'default');
  assert.equal(await state(acquire(context)), 'present');
  assert.match(routes[0], /\/v68\.0\/ssot\/calculated-insights\/SyntheticLifecycle__cio$/u);
  assert.equal(receiver.version, '68.0');
  assert.equal(receiver.metadata._conn, undefined);
  let checkpointCalls = 0;
  const originalRequest = receiver.request;
  receiver.request = async (request) => {
    routes.push(request.url);
    return {};
  };
  await assert.rejects(
    context.bind(document, () => {
      if (++checkpointCalls === 2) throw new Error('deadline exhausted after dependency GET');
    }),
  );
  assert.equal(checkpointCalls, 2);
  assert.match(routes[1], /\/v65\.0\/ssot\/data-model-objects\//u);
  receiver.request = originalRequest;
  receiver.version = '65.0';
  assert.equal(await state(acquire(context)), 'unknown');
});
