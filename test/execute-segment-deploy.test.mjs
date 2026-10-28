import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import { PassThrough } from 'node:stream';
import { executeSegmentDeploy, segmentPollBudget } from '../lib/services/execute-segment-deploy.js';
import { ConnectClient } from '../lib/transport/connect-client.js';

const document = () => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    dependencies: [
      { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
    ],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const runtime = (d = document(), status = 'ACTIVE') => ({
  apiName: d.identity.apiName,
  dataSpace: 'default',
  displayName: d.spec.displayName,
  description: d.spec.description,
  segmentType: 'DBT',
  segmentOnApiName: 'Person__dlm',
  includeDbt: { models: d.spec.models },
  publishInterval: 'NO_REFRESH',
  lookbackPeriod: 'P90D',
  marketSegmentId: 'runtime-id',
  marketSegmentDefinitionId: 'definition-id',
  segmentStatus: status,
});
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '65.0',
};
const changed = () => {
  const d = document();
  d.spec.description = 'Changed';
  return d;
};
const harness = (desired = changed(), overrides = {}) => {
  let writes = 0;
  let reads = 0;
  let acquisitions = 0;
  let delays = 0;
  let verifications = 0;
  const options = {
    allowProcessing: true,
    verifyInput: async () => {
      verifications++;
    },
    bind: async () => [{ targetId: 'target-local', identity: document().spec.segmentOn }],
    acquire: async () => {
      const d = ++acquisitions <= 2 ? document() : desired;
      return { candidate: d, blockers: [], expectations: { runtime: runtime(d) } };
    },
    patch: async () => {
      writes++;
      return runtime(desired, 'PROCESSING');
    },
    read: async () => {
      reads++;
      return { segments: [runtime(desired)] };
    },
    now: () => 0,
    delay: async (milliseconds) => {
      assert.equal(milliseconds, segmentPollBudget.intervalMs);
      delays++;
    },
    ...overrides,
  };
  return {
    run: () => executeSegmentDeploy(desired, connection, '65.0', 'default', options),
    counts: () => ({ writes, reads, acquisitions, delays, verifications }),
    options,
  };
};
test('exact equality makes zero mutation/poll calls without acknowledgement', async () => {
  const h = harness(document(), { allowProcessing: false });
  const r = await h.run();
  assert.equal(r.outcome, 'unchanged');
  assert.equal(r.mutation, 'not-attempted');
  assert.equal(h.counts().writes, 0);
  assert.equal(h.counts().reads, 0);
});
test('missing processing acknowledgement blocks before any mutation', async () => {
  const h = harness(changed(), { allowProcessing: false });
  const result = await h.run();
  assert.equal(result.outcome, 'blocked');
  assert.equal(h.counts().writes, 0);
});
test('single PATCH requires independently acquired settled pair and preserved binding', async () => {
  const h = harness();
  const r = await h.run();
  assert.equal(r.outcome, 'updated');
  assert.equal(r.mutation, 'confirmed-updated');
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().acquisitions, 3);
});
test('PROCESSING then COUNTING then ACTIVE requires independent complete verification and one PATCH', async () => {
  const h = harness();
  const states = ['PROCESSING', 'COUNTING', 'ACTIVE'];
  let reads = 0;
  let bindings = 0;
  h.options.read = async () => ({ segments: [runtime(changed(), states[reads++])] });
  h.options.bind = async () => {
    bindings++;
    return [{ targetId: 'target-local', identity: document().spec.segmentOn }];
  };
  const result = await h.run();
  assert.equal(result.outcome, 'updated');
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(reads, 3);
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().acquisitions, 3);
  assert.equal(h.counts().delays, 2);
  assert.equal(bindings, 4);
});
test('persistent COUNTING exhausts the unchanged finite budget without replay or success', async () => {
  const h = harness();
  let reads = 0;
  h.options.read = async () => {
    reads++;
    return { segments: [runtime(changed(), 'COUNTING')] };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'unknown');
  assert.equal(reads, segmentPollBudget.reads);
  assert.equal(h.counts().delays, segmentPollBudget.reads - 1);
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().acquisitions, 2);
});
test('COUNTING followed by unknown, missing, error or failed reads stays unknown without replay', async () => {
  for (const state of ['UNQUALIFIED', undefined, 'ERROR', 'read-error']) {
    const h = harness();
    let reads = 0;
    h.options.read = async () => {
      if (++reads === 1) return { segments: [runtime(changed(), 'COUNTING')] };
      if (state === 'read-error') throw new Error('private');
      const value = runtime(changed());
      value.segmentStatus = state;
      return { segments: [value] };
    };
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(reads, 2);
    assert.equal(h.counts().writes, 1);
    assert.equal(h.counts().acquisitions, 2);
  }
});
test('PATCH payload is complete doubly nested DBT and omits both schedules and lookback', async () => {
  const calls = [];
  const c = {
    ...connection,
    request: async function (request, options) {
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.throws(() => options.followRedirect());
      calls.push(request);
      return {};
    },
    _refreshDelegate: {},
  };
  await new ConnectClient(c, '65.0').patchSegment(changed());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(
    calls[0].url,
    `${connection.instanceUrl}/services/data/v65.0/ssot/segments/Audience`,
  );
  assert.deepEqual(JSON.parse(calls[0].body), {
    displayName: 'Audience',
    description: 'Changed',
    segmentType: 'Dbt',
    segmentOnApiName: 'Person__dlm',
    includeDbt: { models: { models: changed().spec.models } },
  });
  for (const version of [
    '64.0',
    '66.0',
    { requested: 'latest', restSelector: 'latest', soapNumeric: '65.0' },
  ])
    await assert.rejects(new ConnectClient(c, version).patchSegment(changed()));
  const bad = changed();
  bad.identity.apiName = '../other';
  await assert.rejects(new ConnectClient(c, '65.0').patchSegment(bad));
  assert.equal(calls.length, 1);
  assert.ok(c._refreshDelegate);
});
test('auth/network errors never replay; malformed response remains unknown after successful reconciliation', async () => {
  for (const response of ['auth', 'network', 'malformed']) {
    let attempts = 0;
    const h = harness(changed(), {
      patch: async () => {
        attempts++;
        if (response === 'malformed') return {};
        throw Object.assign(new Error('private'), {
          statusCode: response === 'auth' ? 401 : undefined,
        });
      },
    });
    const r = await h.run();
    assert.equal(r.mutation, 'unknown');
    assert.equal(r.outcome, 'failed');
    assert.equal(attempts, 1);
    assert.equal(h.counts().reads, 1);
    assert.ok(!JSON.stringify(r).includes('private'));
  }
});
test('processing polls have finite read and delay budgets even with a frozen clock', async () => {
  let reads = 0;
  const h = harness(changed(), {
    read: async () => {
      reads++;
      return { segments: [runtime(changed(), 'PROCESSING')] };
    },
  });
  const result = await h.run();
  assert.equal(result.mutation, 'unknown');
  assert.equal(reads, segmentPollBudget.reads);
  assert.equal(h.counts().delays, segmentPollBudget.reads - 1);
});
test('deadline, errors, unsupported states and malformed polls fail closed', async () => {
  for (const mode of ['deadline', 'error', 'state', 'malformed']) {
    let ticks = 0;
    const h = harness(changed(), {
      now: () => (mode === 'deadline' ? ticks++ * segmentPollBudget.timeoutMs : 0),
      read: async () => {
        if (mode === 'error') throw new Error('secret');
        return mode === 'malformed' ? {} : { segments: [runtime(changed(), 'ERROR')] };
      },
    });
    const result = await h.run();
    assert.equal(result.mutation, 'unknown');
    assert.equal(h.counts().writes, 1);
  }
});
test('semantic, runtime identity and final independent readback drift remain unknown', async () => {
  for (const mode of ['sql', 'identity', 'space', 'schedule', 'lookback', 'model', 'pair']) {
    const h = harness();
    if (mode === 'pair') {
      let calls = 0;
      h.options.acquire = async () => ({
        candidate: document(),
        blockers: [],
        expectations: { runtime: runtime(++calls > 2 ? changed() : document()) },
      });
    } else {
      h.options.read = async () => {
        const raw = runtime(changed());
        if (mode === 'sql')
          raw.includeDbt = {
            models: [{ name: 'Audience', sql: document().spec.models[0].sql + ' ' }],
          };
        if (mode === 'identity') raw.marketSegmentId = 'foreign';
        if (mode === 'space') raw.dataSpace = 'other';
        if (mode === 'schedule') raw.publishInterval = 'DAILY';
        if (mode === 'lookback') raw.lookbackPeriod = 'P2Y';
        if (mode === 'model')
          raw.includeDbt = { models: [{ ...changed().spec.models[0], name: 'Other' }] };
        return { segments: [raw] };
      };
    }
    const result = await h.run();
    assert.equal(result.mutation, 'unknown', mode);
    assert.equal(h.counts().writes, 1);
  }
});
test('late input digest or prerequisite drift blocks before PATCH', async () => {
  for (const mode of ['digest', 'binding', 'missing', 'processing', 'definition']) {
    const h = harness();
    let calls = 0;
    if (mode === 'digest')
      h.options.verifyInput = async () => {
        if (++calls === 2) throw new Error('drift');
      };
    if (mode === 'binding')
      h.options.bind = async () => [{ targetId: ++calls > 2 ? 'changed' : 'original' }];
    if (['missing', 'processing', 'definition'].includes(mode))
      h.options.acquire = async () => {
        if (mode === 'missing') return { blockers: ['missing'] };
        const d = document();
        if (mode === 'definition') d.spec.models[0].sql += ' ';
        return {
          candidate: d,
          blockers: [],
          expectations: { runtime: runtime(d, mode === 'processing' ? 'PROCESSING' : 'ACTIVE') },
        };
      };
    const result = await h.run();
    assert.equal(result.mutation, 'not-attempted', mode);
    assert.equal(h.counts().writes, 0);
  }
});
for (const statusCode of [401, 503, 200])
  test(`actual core Segment PATCH never refreshes or replays ${statusCode}`, async () => {
    let attempts = 0;
    const c = Object.create(Connection.prototype);
    Object.assign(c, {
      instanceUrl: connection.instanceUrl,
      version: '65.0',
      accessToken: 'synthetic-token',
      logger: { getRawLogger: () => ({ debug: () => {} }) },
      _propagators: [],
      _refreshDelegate: {
        isRefreshing: () => assert.fail('No refresh'),
        refresh: () => assert.fail('No refresh'),
      },
      _transport: {
        httpRequest: (request, options) => {
          attempts++;
          assert.equal(request.method, 'PATCH');
          assert.equal(
            request.url,
            `${connection.instanceUrl}/services/data/v65.0/ssot/segments/Audience`,
          );
          assert.equal(options.retry.maxRetries, 0);
          const response = Promise.resolve({
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              statusCode === 200
                ? runtime(changed())
                : [
                    {
                      errorCode: statusCode === 401 ? 'INVALID_SESSION_ID' : 'SERVER_ERROR',
                      message: 'secret',
                    },
                  ],
            ),
          });
          response.stream = () => new PassThrough();
          return response;
        },
      },
    });
    const before = Object.getOwnPropertyDescriptors(c);
    const pending = new ConnectClient(c, '65.0').patchSegment(changed());
    if (statusCode === 200) assert.deepEqual(await pending, runtime(changed()));
    else await assert.rejects(pending);
    assert.equal(attempts, 1);
    assert.deepEqual(Object.getOwnPropertyDescriptors(c), before);
  });

test('fixed Segment PATCH transport sanitizes errors and attempts only once', async () => {
  for (const statusCode of [401, 403, 500, undefined]) {
    let attempts = 0;
    const client = new ConnectClient(
      {
        ...connection,
        request: async () => {
          attempts++;
          throw Object.assign(new Error('secret'), { statusCode });
        },
      },
      '65.0',
    );
    await assert.rejects(
      client.patchSegment(changed()),
      (error) => !String(error).includes('secret'),
    );
    assert.equal(attempts, 1);
  }
});
