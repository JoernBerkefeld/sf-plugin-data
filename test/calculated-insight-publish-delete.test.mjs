import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { observeCalculatedInsight } from '../lib/artifacts/calculated-insight-document.js';
import { publishCalculatedInsight } from '../lib/services/publish-calculated-insight.js';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';
import { ConnectError } from '../lib/transport/connect-client.js';

// eslint-disable-next-line unicorn/no-null -- Complete synthetic wire profiles require null.
const nil = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const app = `${table}.ssot__SoftwareApplicationId__c`;
const expression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${app} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${app}`;
const runtime = (status = 'DRAFT') => ({
  apiName: 'SyntheticPublish__cio',
  dataSpace: 'default',
  calculatedInsightStatus: status,
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: nil,
  displayName: 'Synthetic publish',
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
    fullName: 'SyntheticPublish',
    creationType: 'Custom',
    expression,
    masterLabel: 'Synthetic publish',
  },
];
const selection = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
/**
 * Build independent neutral runtime/Metadata/binding readers and a single writer spy.
 * @returns {object} Mutable test inputs, counters and executable service.
 */
function harness() {
  const calls = { writes: 0, reads: 0, metadata: 0, binds: 0, verifies: 0, observations: [] };
  const desired = observeCalculatedInsight(runtime(), '68.0').document;
  const target = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    getApiVersion: () => '68.0',
  };
  const pin = { ...selection };
  const context = {
    check() {},
    async get() {
      calls.reads++;
      return runtime(calls.writes ? 'ACTIVE' : 'DRAFT');
    },
    async metadata() {
      calls.metadata++;
      return metadata();
    },
    async bind() {
      calls.binds++;
      return {
        identity: { kind: 'dmo', dataSpace: 'default', apiName: table },
        targetId: 'synthetic-local',
        fields: [],
      };
    },
  };
  let clock = 0;
  const options = {
    context,
    allowProcessing: true,
    verifyInput: async () => {
      calls.verifies++;
    },
    recordObservation: async (value) => {
      calls.observations.push(value);
    },
    nativeClient: {
      publish: async () => {
        calls.writes++;
      },
    },
    now: () => clock,
    delay: async (ms) => {
      clock += ms;
    },
  };
  return {
    calls,
    desired,
    target,
    pin,
    context,
    options,
    advance: (ms) => {
      clock += ms;
    },
    run: () => publishCalculatedInsight(desired, target, pin, 'default', options),
  };
}

test('publish empty echo requires independent ACTIVE/Metadata/dependency settlement', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.outcome, 'published');
  assert.equal(result.mutation, 'confirmed-published');
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.reads, 3);
  assert.equal(h.calls.metadata, 3);
  assert.equal(h.calls.binds, 3);
  assert.equal(h.calls.verifies, 3);
  assert.deepEqual(
    h.calls.observations.map((o) => o.phase),
    ['baseline', 'settled'],
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /SELECT|synthetic-local|SyntheticPublish|dataSource/u,
  );
});
test('publish preview and already ACTIVE are read-only without processing acknowledgement', async () => {
  for (const active of [false, true]) {
    const h = harness();
    h.options.allowProcessing = false;
    h.options.preview = true;
    if (active) h.context.get = async () => runtime('ACTIVE');
    const result = await h.run();
    assert.equal(result.outcome, active ? 'unchanged' : 'publish');
    assert.deepEqual(result.requiredEffects, active ? [] : ['processing']);
    assert.equal(h.calls.writes, 0);
    h.options.preview = false;
    const repeated = await h.run();
    assert.equal(repeated.outcome, active ? 'unchanged' : 'blocked');
    assert.equal(h.calls.writes, 0);
  }
});
for (const [name, change] of [
  [
    'paired digest mismatch',
    (h) => {
      h.options.verifyInput = async () => {
        throw new Error('Pair mismatch');
      };
    },
  ],
  [
    'missing pair verifier',
    (h) => {
      h.options.verifyInput = undefined;
    },
  ],
  [
    'missing recorder',
    (h) => {
      h.options.recordObservation = undefined;
    },
  ],
  [
    'wrong label',
    (h) => {
      h.desired.spec.displayName = 'Foreign label';
    },
  ],
  [
    'SYSTEM_MANAGED',
    (h) => {
      h.desired.spec.publishScheduleInterval = 'SYSTEM_MANAGED';
    },
  ],
  [
    'PROCESSING',
    (h) => {
      h.context.get = async () => runtime('PROCESSING');
    },
  ],
  [
    'DELETING',
    (h) => {
      h.context.get = async () => runtime('DELETING');
    },
  ],
  [
    'ran component',
    (h) => {
      h.context.get = async () => ({ ...runtime(), lastRunStatus: 'SUCCESS' });
    },
  ],
  [
    'metadata mismatch',
    (h) => {
      h.context.metadata = async () => [{ ...metadata()[0], masterLabel: 'Other' }];
    },
  ],
  [
    'metadata absence',
    (h) => {
      h.context.metadata = async () => [{}];
    },
  ],
  [
    'confirmed absence',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      };
      h.context.metadata = async () => [{}];
    },
  ],
  [
    'generic404',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404);
      };
    },
  ],
  [
    'authentication',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 401);
      };
    },
  ],
  [
    'throttle',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 429);
      };
    },
  ],
  [
    'legacy65',
    (h) => {
      h.pin.requested = '65.0';
    },
  ],
  [
    'receiver65',
    (h) => {
      h.target.getApiVersion = () => '65.0';
    },
  ],
  [
    'dependency drift',
    (h) => {
      h.context.bind = async () => ({ targetId: ++h.calls.binds });
    },
  ],
  [
    'target drift',
    (h) => {
      h.context.get = async () => runtime(++h.calls.reads > 1 ? 'ACTIVE' : 'DRAFT');
    },
  ],
  [
    'origin drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.target.instanceUrl = 'https://other.my.salesforce.com';
      };
    },
  ],
  [
    'input drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.desired.spec.displayName = 'Changed';
      };
    },
  ],
  [
    'selection drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.pin.restSelector = 'v65.0';
      };
    },
  ],
])
  test(`publish prewrite destructive guard: ${name}`, async () => {
    const h = harness();
    change(h);
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.calls.writes, 0);
  });
for (const [name, change] of [
  [
    'ambiguous write',
    (h) => {
      h.options.nativeClient.publish = async () => {
        h.calls.writes++;
        throw new Error('Uncertain');
      };
    },
  ],
  [
    'accepted but DRAFT',
    (h) => {
      h.context.get = async () => runtime();
    },
  ],
  [
    'perpetual PROCESSING',
    (h) => {
      h.context.get = async () => {
        h.calls.reads++;
        return runtime(h.calls.writes ? 'PROCESSING' : 'DRAFT');
      };
    },
  ],
  [
    'independent read failure',
    (h) => {
      h.context.get = async () => {
        if (h.calls.writes) throw new Error('Read failed');
        return runtime();
      };
    },
  ],
  [
    'final dependency drift',
    (h) => {
      h.context.bind = async () => ({ targetId: h.calls.writes ? 'changed' : 'original' });
    },
  ],
  [
    'write deadline',
    (h) => {
      h.options.nativeClient.publish = async () => {
        h.calls.writes++;
        h.advance(120_000);
      };
    },
  ],
  [
    'recorder deadline',
    (h) => {
      h.options.recordObservation = async (o) => {
        if (o.phase === 'settled') h.advance(120_000);
      };
    },
  ],
])
  test(`publish uncertain outcome never replays: ${name}`, async () => {
    const h = harness();
    change(h);
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.calls.writes, 1);
    assert.ok(h.calls.reads <= 14);
  });
test('publish never-resolving write is bounded without late read continuation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let resolveWrite;
  h.options.nativeClient.publish = () => {
    h.calls.writes++;
    return new Promise((resolve) => {
      resolveWrite = resolve;
    });
  };
  const pending = h.run();
  for (let index = 0; index < 40 && h.calls.writes === 0; index++) await Promise.resolve();
  assert.equal(h.calls.writes, 1);
  t.mock.timers.tick(120_000);
  const result = await pending;
  assert.equal(result.mutation, 'unknown');
  resolveWrite();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(h.calls.reads, 2);
  assert.equal(h.calls.writes, 1);
});
test('publish nondefault space refuses before readers and writer', async () => {
  const h = harness();
  const result = await publishCalculatedInsight(h.desired, h.target, h.pin, 'other', h.options);
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.writes, 0);
});
test('publish real single-attempt transport uses distinct explicit NotScheduled payload', async () => {
  const h = harness();
  const requests = [];
  const target = h.target;
  target.request = async (request, options) => {
    requests.push(request);
    assert.equal(options.retry.maxRetries, 0);
    h.calls.writes++;
  };
  delete h.options.nativeClient;
  const result = await publishCalculatedInsight(h.desired, target, h.pin, 'default', h.options);
  assert.equal(result.mutation, 'confirmed-published');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PATCH');
  assert.match(requests[0].url, /\/v68\.0\/ssot\/calculated-insights\/SyntheticPublish__cio$/u);
  assert.deepEqual(JSON.parse(requests[0].body), {
    displayName: 'Synthetic publish',
    draft: false,
    publishScheduleInterval: 'NotScheduled',
  });
});
test('publish PROCESSING then ACTIVE settles; independent later reconciliation does not write', async () => {
  const h = harness();
  let polls = 0;
  h.context.get = async () =>
    runtime(h.calls.writes ? (++polls === 1 ? 'PROCESSING' : 'ACTIVE') : 'DRAFT');
  const published = await h.run();
  assert.equal(published.mutation, 'confirmed-published');
  h.options.allowProcessing = false;
  const reconciled = await h.run();
  assert.equal(reconciled.outcome, 'unchanged');
  assert.equal(h.calls.writes, 1);
});

/**
 * Adapt the neutral fixture to pair-bound deletion with independent absence readers.
 * @returns {object} Deletion inputs and counters.
 */
function deleteHarness() {
  const h = harness();
  h.options.confirmDelete = true;
  h.options.nativeClient = {
    delete: async (name) => {
      assert.equal(name, h.desired.identity.apiName);
      h.calls.writes++;
    },
  };
  h.context.get = async () => {
    h.calls.reads++;
    if (h.calls.writes) throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
    return runtime();
  };
  h.context.metadata = async () => {
    h.calls.metadata++;
    return h.calls.writes ? [{}] : metadata();
  };
  h.run = () => deleteCalculatedInsight(h.desired, h.target, h.pin, 'default', h.options);
  return h;
}
test('delete empty echo needs exact native and Metadata absence; repeat is GET-only', async () => {
  const h = deleteHarness();
  const result = await h.run();
  assert.equal(result.outcome, 'deleted');
  assert.equal(result.mutation, 'confirmed-deleted');
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.reads, 3);
  assert.equal(h.calls.metadata, 3);
  assert.doesNotMatch(JSON.stringify(result), /SELECT|SyntheticPublish|synthetic-local/u);
  h.options.confirmDelete = false;
  const repeated = await h.run();
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(repeated.mutation, 'not-attempted');
  assert.equal(h.calls.writes, 1);
});
test('delete preview DRAFT and ACTIVE never writes or requires confirmation', async () => {
  for (const status of ['DRAFT', 'ACTIVE']) {
    const h = deleteHarness();
    h.context.get = async () => runtime(status);
    h.options.preview = true;
    h.options.confirmDelete = false;
    const result = await h.run();
    assert.equal(result.outcome, 'delete');
    assert.deepEqual(result.requiredEffects, ['destructive']);
    assert.equal(h.calls.writes, 0);
  }
});
test('delete confirmed absence preview is unchanged without destructive confirmation', async () => {
  const h = deleteHarness();
  h.options.preview = true;
  h.options.confirmDelete = false;
  h.context.get = async () => {
    throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
  };
  h.context.metadata = async () => [{}];
  const result = await h.run();
  assert.equal(result.outcome, 'unchanged');
  assert.equal(h.calls.writes, 0);
});
for (const [name, change] of [
  [
    'confirmation false',
    (h) => {
      h.options.confirmDelete = false;
    },
  ],
  [
    'confirmation missing',
    (h) => {
      delete h.options.confirmDelete;
    },
  ],
  [
    'confirmation string',
    (h) => {
      h.options.confirmDelete = 'true';
    },
  ],
  [
    'pair verifier missing',
    (h) => {
      delete h.options.verifyInput;
    },
  ],
  [
    'recorder missing',
    (h) => {
      delete h.options.recordObservation;
    },
  ],
  [
    'pair digest mismatch',
    (h) => {
      h.options.verifyInput = async () => {
        throw new Error('Pair');
      };
    },
  ],
  [
    'same-name foreign label',
    (h) => {
      h.desired.spec.displayName = 'Foreign';
    },
  ],
  [
    'same-name foreign SQL',
    (h) => {
      h.context.get = async () => ({
        ...runtime(),
        expression: expression.replace('1 = 0', '1 = 1'),
      });
    },
  ],
  [
    'scheduled',
    (h) => {
      h.desired.spec.publishScheduleInterval = 'SYSTEM_MANAGED';
    },
  ],
  [
    'ran',
    (h) => {
      h.context.get = async () => ({ ...runtime(), lastRunStatus: 'SUCCESS' });
    },
  ],
  [
    'PROCESSING',
    (h) => {
      h.context.get = async () => runtime('PROCESSING');
    },
  ],
  [
    'DELETING before dispatch',
    (h) => {
      h.context.get = async () => runtime('DELETING');
    },
  ],
  [
    'metadata mismatch',
    (h) => {
      h.context.metadata = async () => [{ ...metadata()[0], masterLabel: 'Foreign' }];
    },
  ],
  [
    'metadata absent only',
    (h) => {
      h.context.metadata = async () => [{}];
    },
  ],
  [
    'runtime absent only',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      };
    },
  ],
  [
    'generic404',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404);
      };
    },
  ],
  [
    'authentication',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 401);
      };
    },
  ],
  [
    'authorization',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 403);
      };
    },
  ],
  [
    'throttle',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 429);
      };
    },
  ],
  [
    'malformed missing Metadata',
    (h) => {
      h.context.get = async () => {
        throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      };
      h.context.metadata = async () => [];
    },
  ],
  [
    'dependency drift',
    (h) => {
      h.context.bind = async () => ({ targetId: ++h.calls.binds });
    },
  ],
  [
    'target state drift',
    (h) => {
      h.context.get = async () => runtime(++h.calls.reads > 1 ? 'ACTIVE' : 'DRAFT');
    },
  ],
  [
    'origin drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.target.instanceUrl = 'https://other.my.salesforce.com';
      };
    },
  ],
  [
    'selection drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.pin.soapNumeric = '65.0';
      };
    },
  ],
  [
    'input drift',
    (h) => {
      h.options.recordObservation = async () => {
        h.desired.spec.displayName = 'Changed';
      };
    },
  ],
  [
    'legacy65',
    (h) => {
      h.pin.requested = '65.0';
    },
  ],
  [
    'receiver65',
    (h) => {
      h.target.getApiVersion = () => '65.0';
    },
  ],
  [
    'malformed preview',
    (h) => {
      h.options.preview = 'true';
    },
  ],
])
  test(`delete prewrite safety guard: ${name}`, async () => {
    const h = deleteHarness();
    change(h);
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.calls.writes, 0);
  });
test('delete nondefault scope blocks before any reader or writer', async () => {
  const h = deleteHarness();
  const result = await deleteCalculatedInsight(h.desired, h.target, h.pin, 'other', h.options);
  assert.equal(result.outcome, 'blocked');
  assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.writes, 0);
});
for (const [name, change] of [
  [
    'ambiguous write',
    (h) => {
      h.options.nativeClient.delete = async () => {
        h.calls.writes++;
        throw new Error('Unknown');
      };
    },
  ],
  [
    'deletion never settles',
    (h) => {
      h.context.get = async () => {
        h.calls.reads++;
        return runtime(h.calls.writes ? 'DELETING' : 'ACTIVE');
      };
      h.context.metadata = async () => metadata();
    },
  ],
  [
    'one-sided runtime absence',
    (h) => {
      h.context.metadata = async () => metadata();
    },
  ],
  [
    'one-sided Metadata absence',
    (h) => {
      h.context.get = async () => runtime();
    },
  ],
  [
    'postwrite generic404',
    (h) => {
      h.context.get = async () => {
        if (h.calls.writes) throw new ConnectError('REQUEST_FAILED', 404);
        return runtime();
      };
    },
  ],
  [
    'postwrite foreign content',
    (h) => {
      h.context.get = async () => ({
        ...runtime('ACTIVE'),
        displayName: h.calls.writes ? 'Foreign' : 'Synthetic publish',
      });
      h.context.metadata = async () => metadata();
    },
  ],
  [
    'write deadline',
    (h) => {
      h.options.nativeClient.delete = async () => {
        h.calls.writes++;
        h.advance(120_000);
      };
    },
  ],
  [
    'late Metadata',
    (h) => {
      h.context.metadata = async () => {
        if (h.calls.writes) h.advance(120_000);
        return h.calls.writes ? [{}] : metadata();
      };
    },
  ],
])
  test(`delete uncertain outcome never replays: ${name}`, async () => {
    const h = deleteHarness();
    change(h);
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.calls.writes, 1);
    assert.ok(h.calls.reads <= 14);
  });
test('delete ACTIVE -> DELETING -> dual absence; reconciliation never repeats DELETE', async () => {
  const h = deleteHarness();
  let polls = 0;
  h.context.get = async () => {
    if (h.calls.writes && ++polls > 1)
      throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
    return runtime(h.calls.writes ? 'DELETING' : 'ACTIVE');
  };
  h.context.metadata = async () => (polls > 1 ? [{}] : metadata());
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-deleted');
  assert.equal(h.calls.writes, 1);
  const later = await h.run();
  assert.equal(later.outcome, 'unchanged');
  assert.equal(h.calls.writes, 1);
});
test('delete ambiguous write can later reconcile absence without replay', async () => {
  const h = deleteHarness();
  h.options.nativeClient.delete = async () => {
    h.calls.writes++;
    throw new Error('Uncertain');
  };
  const uncertain = await h.run();
  assert.equal(uncertain.mutation, 'unknown');
  assert.equal(h.calls.reads, 2);
  const later = await h.run();
  assert.equal(later.outcome, 'unchanged');
  assert.equal(h.calls.writes, 1);
});
test('delete never-resolving write is bounded and stops late follow-on reads', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = deleteHarness();
  let resolveWrite;
  h.options.nativeClient.delete = () => {
    h.calls.writes++;
    return new Promise((resolve) => {
      resolveWrite = resolve;
    });
  };
  const pending = h.run();
  for (let index = 0; index < 40 && h.calls.writes === 0; index++) await Promise.resolve();
  assert.equal(h.calls.writes, 1);
  t.mock.timers.tick(120_000);
  const result = await pending;
  assert.equal(result.mutation, 'unknown');
  resolveWrite();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(h.calls.reads, 2);
  assert.equal(h.calls.writes, 1);
});
test('delete real transport is one bodyless exact-name DELETE with retries disabled', async () => {
  const h = deleteHarness();
  const requests = [];
  h.target.request = async (request, options) => {
    requests.push(request);
    assert.equal(options.retry.maxRetries, 0);
    h.calls.writes++;
  };
  delete h.options.nativeClient;
  const result = await h.run();
  assert.equal(result.mutation, 'confirmed-deleted');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'DELETE');
  assert.match(requests[0].url, /\/v68\.0\/ssot\/calculated-insights\/SyntheticPublish__cio$/u);
  assert.equal(requests[0].body, undefined);
});
