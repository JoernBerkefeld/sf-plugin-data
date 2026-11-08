import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import { PassThrough } from 'node:stream';
import { executeSegmentDeploy, segmentPollBudget } from '../lib/services/execute-segment-deploy.js';
import { ConnectClient } from '../lib/transport/connect-client.js';
import {
  apiDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';

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
const criteria = (d) =>
  `&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;${d.spec.models[0].sql}&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;`;
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '65.0',
};
const changed = () => {
  const d = document();
  d.spec.description = 'Changed';
  return d;
};
const harness = (desired = changed(), overrides = {}, version = '65.0') => {
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
    run: () =>
      executeSegmentDeploy(
        desired,
        { ...connection, getApiVersion: () => version },
        version,
        'default',
        options,
      ),
    counts: () => ({ writes, reads, acquisitions, delays, verifications }),
    options,
  };
};
const absent = () =>
  retainConnectDiagnostic(
    { blockers: ['SEGMENT_ACQUISITION_FAILED'] },
    apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND' }]),
  );

test('API68 CREATE requires fresh absence, one POST and independent identity/configuration', async () => {
  for (const mode of [
    'active',
    'processing',
    'no-ack',
    'conflict',
    'uncertain',
    'malformed',
    'input',
    'binding',
    'target',
    'identity',
    'sql',
    'membership',
  ]) {
    let posts = 0;
    let patches = 0;
    let acquisitions = 0;
    let checks = 0;
    let binds = 0;
    let reads = 0;
    const desired = document();
    const before = structuredClone(desired);
    const full = () => ({
      ...runtime(desired, mode === 'processing' ? 'PROCESSING' : 'ACTIVE'),
      segmentOnId: 'target-local',
      segmentMembershipDmo: { historyTable: 'history', latestTable: 'latest' },
    });
    const result = await executeSegmentDeploy(
      desired,
      { ...connection, getApiVersion: () => '68.0' },
      '68.0',
      'default',
      {
        allowProcessing: mode !== 'no-ack',
        verifyInput: async () => {
          if (++checks === 3 && mode === 'input') throw new Error('drift');
        },
        bind: async () => [
          {
            targetId: mode === 'binding' && ++binds >= 4 ? 'drift' : 'target-local',
            identity: desired.spec.segmentOn,
          },
        ],
        acquire: async () => {
          acquisitions++;
          if (acquisitions <= 2 && !(mode === 'target' && acquisitions === 2)) return absent();
          return { candidate: desired, blockers: [], expectations: { runtime: full() } };
        },
        create: async () => {
          posts++;
          if (mode === 'conflict')
            throw retainConnectDiagnostic(
              new Error('conflict'),
              apiDiagnostic(409, [{ errorCode: 'ENTITY_SAVE_ERROR' }]),
            );
          if (mode === 'uncertain') throw new Error('lost-response');
          if (mode === 'malformed') return {};
          return { ...runtime(desired, 'PROCESSING'), segmentOnId: 'target-local' };
        },
        patch: async () => {
          patches++;
          assert.fail('No PATCH fallback');
        },
        read: async () => {
          reads++;
          const raw = full();
          if (mode === 'identity') raw.marketSegmentId = 'foreign';
          if (mode === 'sql') raw.description = 'not-desired';
          if (mode === 'membership') delete raw.segmentMembershipDmo;
          return { segments: [raw] };
        },
        now: () => 0,
        delay: async () => {},
      },
    );
    const blocked = ['no-ack', 'input', 'binding', 'target'].includes(mode);
    const success = ['active', 'processing'].includes(mode);
    assert.equal(posts, blocked ? 0 : 1, mode);
    assert.equal(patches, 0, mode);
    assert.equal(result.outcome, success ? 'created' : blocked ? 'blocked' : 'failed', mode);
    assert.equal(
      result.mutation,
      success ? 'confirmed-created' : blocked ? 'not-attempted' : 'unknown',
      mode,
    );
    assert.equal(result.route.method, 'POST');
    assert.equal(result.serverProcessing, mode === 'processing' ? true : undefined);
    if (mode === 'conflict') assert.equal(result.diagnostics[0].code, 'SEGMENT_CREATE_CONFLICT');
    if (!blocked) assert.equal(reads, 1);
    assert.deepEqual(desired, before);
  }
});

test('native API68 CREATE payload is minimal and create-only with no refresh/replay', async () => {
  const calls = [];
  const c = {
    ...connection,
    request: async (request, options) => {
      assert.equal(options.retry.maxRetries, 0);
      assert.throws(() => options.followRedirect());
      calls.push(request);
      return {};
    },
  };
  await new ConnectClient(c, '68.0').createSegment(document());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${connection.instanceUrl}/services/data/v68.0/ssot/segments`);
  assert.deepEqual(JSON.parse(calls[0].body), {
    developerName: 'Audience',
    displayName: 'Audience',
    description: 'Description',
    segmentOnApiName: 'Person__dlm',
    segmentType: 'Dbt',
    includeDbt: { models: { models: document().spec.models } },
    publishSchedule: 'NoRefresh',
  });
  await assert.rejects(new ConnectClient(c, '65.0').createSegment(document()));
  assert.equal(calls.length, 1);
});

test('API68 bounded update, no-op, no-ack and COUNTING exhaustion never replay', async () => {
  for (const mode of ['update', 'unchanged', 'no-ack', 'counting', 'unknown']) {
    const h = harness(
      mode === 'unchanged' ? document() : changed(),
      mode === 'no-ack'
        ? { allowProcessing: false }
        : mode === 'counting'
          ? {
              patch: async () => runtime(changed(), 'COUNTING'),
              read: async () => ({ segments: [runtime(changed(), 'COUNTING')] }),
            }
          : mode === 'unknown'
            ? {
                patch: async () => {
                  throw new Error('uncertain');
                },
              }
            : {},
      '68.0',
    );
    const result = await h.run();
    assert.equal(result.route.apiVersion, '68.0');
    assert.equal(
      result.outcome,
      mode === 'update'
        ? 'updated'
        : mode === 'unchanged'
          ? 'unchanged'
          : mode === 'no-ack'
            ? 'blocked'
            : 'failed',
    );
    assert.equal(
      result.mutation,
      ['counting', 'unknown'].includes(mode)
        ? 'unknown'
        : mode === 'update'
          ? 'confirmed-updated'
          : 'not-attempted',
    );
    assert.ok(h.counts().writes <= 1);
  }
});

test('API68 default native JSON acquisition updates and repeats without Segment Metadata', async () => {
  let current = runtime();
  current.segmentMembershipDmo = { historyTable: 'private-history', latestTable: 'private-latest' };
  const original = structuredClone(current);
  const requests = [];
  const target = {
    instanceUrl: connection.instanceUrl,
    getApiVersion: () => '68.0',
    request: async (request) => {
      requests.push({ method: request.method, url: request.url });
      assert.match(request.url, /\/services\/data\/v68\.0\/ssot\/segments\/Audience$/u);
      if (request.method === 'PATCH') {
        const body = JSON.parse(request.body);
        assert.deepEqual(body.includeDbt.models.models, changed().spec.models);
        assert.equal(body.description, changed().spec.description);
        current = { ...current, description: body.description };
        return { ...current, segmentStatus: 'PROCESSING' };
      }
      assert.equal(request.method, 'GET');
      return { segments: [structuredClone(current)] };
    },
  };
  const options = {
    allowProcessing: true,
    verifyInput: async () => {},
    bind: async () => [{ targetId: 'target-local', identity: document().spec.segmentOn }],
  };
  const updated = await executeSegmentDeploy(changed(), target, '68.0', 'default', options);
  assert.equal(updated.outcome, 'updated');
  assert.equal(updated.mutation, 'confirmed-updated');
  assert.deepEqual(current, { ...original, description: changed().spec.description });
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, 1);
  const beforeRepeat = requests.length;
  const repeated = await executeSegmentDeploy(changed(), target, '68.0', 'default', {
    ...options,
    allowProcessing: false,
  });
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(repeated.mutation, 'not-attempted');
  assert.ok(requests.slice(beforeRepeat).every((request) => request.method === 'GET'));
});

test('only PATCH may omit association and membership; independent full GET stays strict', async () => {
  for (const status of ['PROCESSING', 'COUNTING', 'ACTIVE']) {
    const h = harness(
      changed(),
      {
        patch: async () => {
          const raw = runtime(changed(), 'PROCESSING');
          delete raw.segmentOnApiName;
          return raw;
        },
        read: async () => ({ segments: [runtime(changed(), status)] }),
      },
      '68.0',
    );
    const result = await h.run();
    assert.equal(result.outcome, 'updated');
    assert.equal(result.serverProcessing, status === 'ACTIVE' ? undefined : true);
  }
  for (const corrupt of [
    'association',
    'membership',
    'id',
    'unknown',
    'sql',
    'settings',
    'missing-id',
  ]) {
    const h = harness();
    h.options.patch = async () => {
      const raw = runtime(changed(), 'PROCESSING');
      delete raw.segmentOnApiName;
      if (corrupt === 'association') raw.segmentOnApiName = 'Other__dlm';
      if (corrupt === 'membership')
        raw.segmentMembershipDmo = { historyTable: 'other', latestTable: 'other' };
      if (corrupt === 'id') raw.marketSegmentDefinitionId = 'foreign';
      if (corrupt === 'unknown') raw.unrecognized = true;
      if (corrupt === 'sql') raw.includeDbt.models[0].sql += ' ';
      if (corrupt === 'settings') raw.lookbackPeriod = 'P2Y';
      if (corrupt === 'missing-id') delete raw.marketSegmentId;
      return raw;
    };
    const result = await h.run();
    assert.equal(result.mutation, 'unknown', corrupt);
    assert.equal(result.serverProcessing, undefined);
  }
  for (const omitted of ['segmentOnApiName', 'segmentMembershipDmo']) {
    const membership = { historyTable: 'private-history', latestTable: 'private-latest' };
    const h = harness(changed(), {
      acquire: async () => ({
        candidate: document(),
        blockers: [],
        expectations: { runtime: { ...runtime(), segmentMembershipDmo: membership } },
      }),
      patch: async () => {
        const raw = runtime(changed(), 'PROCESSING');
        delete raw.segmentOnApiName;
        return raw;
      },
      read: async () => {
        const raw = { ...runtime(changed(), 'PROCESSING'), segmentMembershipDmo: membership };
        delete raw[omitted];
        return { segments: [raw] };
      },
    });
    const result = await h.run();
    assert.equal(result.mutation, 'unknown', omitted);
  }
});

test('partial PATCH accepts omitted membership only with independently preserved generated references', async () => {
  const membership = { historyTable: 'private-history', latestTable: 'private-latest' };
  for (const drift of [false, true]) {
    const h = harness(changed(), {
      acquire: async () => ({
        candidate: document(),
        blockers: [],
        expectations: { runtime: { ...runtime(), segmentMembershipDmo: membership } },
      }),
      patch: async () => {
        const raw = runtime(changed(), 'PROCESSING');
        delete raw.segmentOnApiName;
        return raw;
      },
      read: async () => ({
        segments: [
          {
            ...runtime(changed(), 'PROCESSING'),
            segmentMembershipDmo: { ...membership, ...(drift ? { latestTable: 'foreign' } : {}) },
          },
        ],
      }),
    });
    const result = await h.run();
    assert.equal(result.mutation, drift ? 'unknown' : 'confirmed-updated');
    assert.equal(result.serverProcessing, drift ? undefined : true);
  }
});

test('Segment retains primary PATCH evidence over secondary poll failure with one dispatch', async () => {
  const primary = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'A maximum of 10 rulesets is supported.' },
  ]);
  const secondary = apiDiagnostic(503, []);
  for (const writeFails of [true, false]) {
    let writes = 0;
    let reads = 0;
    const h = harness(changed(), {
      patch: async () => {
        writes++;
        if (writeFails) throw retainConnectDiagnostic(new Error('hidden-write'), primary);
        return runtime(changed(), 'PROCESSING');
      },
      read: async () => {
        reads++;
        throw retainConnectDiagnostic(new Error('hidden-read'), secondary);
      },
    });
    const result = await h.run();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.equal(getConnectDiagnostic(result), writeFails ? primary : secondary);
    assert.match(
      result.diagnostics[0].message,
      writeFails ? /INVALID_INPUT.*10 rulesets/u : /HTTP 503/u,
    );
    assert.doesNotMatch(JSON.stringify(result), /hidden-|"statusCode"|"errors"/u);
  }
});

test('Segment preview and fresh acquisition block with retained evidence before dispatch', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
  ]);
  for (const failAt of [1, 2]) {
    let acquisitions = 0;
    const h = harness(changed(), {
      acquire: async () =>
        ++acquisitions === failAt
          ? retainConnectDiagnostic({ blockers: ['SEGMENT_ACQUISITION_FAILED'] }, evidence)
          : { candidate: document(), blockers: [], expectations: { runtime: runtime() } },
    });
    const result = await h.run();
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(h.counts().writes, 0);
    assert.equal(getConnectDiagnostic(result), evidence);
    assert.match(result.diagnostics[0].message, /INVALID_INPUT/u);
  }
});

test('Segment late binding and independent pair failures retain evidence at existing stop points', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
  ]);
  for (const mode of ['binding', 'pair', 'reconciled', 'bounded']) {
    let bindings = 0;
    let acquisitions = 0;
    let writes = 0;
    let reads = 0;
    const h = harness(changed(), {
      bind: async () => {
        if (++bindings === 2 && mode === 'binding')
          throw retainConnectDiagnostic(new Error('hidden'), evidence);
        return [];
      },
      acquire: async () => {
        acquisitions++;
        if (acquisitions === 3 && mode === 'pair')
          return retainConnectDiagnostic({ blockers: ['SEGMENT_ACQUISITION_FAILED'] }, evidence);
        const d = acquisitions <= 2 ? document() : changed();
        return { candidate: d, blockers: [], expectations: { runtime: runtime(d) } };
      },
      patch: async () => {
        writes++;
        if (mode !== 'pair') throw retainConnectDiagnostic(new Error('hidden'), evidence);
        return runtime(changed(), 'PROCESSING');
      },
      read: async () => {
        reads++;
        return { segments: [runtime(changed(), mode === 'bounded' ? 'PROCESSING' : 'ACTIVE')] };
      },
    });
    const result = await h.run();
    assert.equal(result.mutation, mode === 'binding' ? 'not-attempted' : 'unknown');
    assert.equal(result.outcome, mode === 'binding' ? 'blocked' : 'failed');
    assert.equal(writes, mode === 'binding' ? 0 : 1);
    assert.equal(reads, mode === 'binding' ? 0 : mode === 'bounded' ? segmentPollBudget.reads : 1);
    assert.equal(getConnectDiagnostic(result), evidence);
    assert.match(result.diagnostics[0].message, /INVALID_INPUT/u);
  }
});

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
test('forward predicate update settles independently and redundant criteria cannot diverge', async () => {
  const desired = document();
  desired.spec.models[0].sql += ' AND Person__dlm.Id__c IS NOT NULL';
  const h = harness(desired);
  const updated = await h.run();
  assert.equal(updated.mutation, 'confirmed-updated');
  assert.equal(h.counts().writes, 1);
  const unchanged = harness(desired, {
    allowProcessing: false,
    acquire: async () => ({
      candidate: desired,
      blockers: [],
      expectations: { runtime: runtime(desired) },
    }),
  });
  const repeated = await unchanged.run();
  assert.equal(repeated.outcome, 'unchanged');
  assert.equal(unchanged.counts().writes, 0);
  for (const corrupt of ['sql', 'criteria', 'schedule']) {
    const mismatch = harness(desired);
    mismatch.options.read = async () => {
      const r = runtime(desired);
      if (corrupt === 'sql') r.includeDbt = runtime().includeDbt;
      if (corrupt === 'criteria')
        r.includeCriteria =
          '&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;wrong&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;';
      if (corrupt === 'schedule') r.lookbackPeriod = 'P2Y';
      return { segments: [r] };
    };
    const rejected = await mismatch.run();
    assert.equal(rejected.mutation, 'unknown');
    assert.equal(mismatch.counts().writes, 1);
  }
  const criteriaPresent = harness(desired);
  let acquisitions = 0;
  criteriaPresent.options.acquire = async () => {
    const d = ++acquisitions <= 2 ? document() : desired;
    return {
      candidate: d,
      blockers: [],
      expectations: { runtime: { ...runtime(d), includeCriteria: criteria(d) } },
    };
  };
  criteriaPresent.options.patch = async () => ({
    ...runtime(desired, 'PROCESSING'),
    includeCriteria: criteria(desired),
  });
  const missingCriteria = await criteriaPresent.run();
  assert.equal(missingCriteria.mutation, 'unknown');
  const reverse = harness(document(), {
    acquire: async () => ({
      candidate: desired,
      blockers: [],
      expectations: { runtime: runtime(desired) },
    }),
  });
  const reversed = await reverse.run();
  assert.equal(reversed.outcome, 'blocked');
  assert.equal(reverse.counts().writes, 0);
});

test('positive PATCH and independent PROCESSING confirm queued configuration with one PATCH', async () => {
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
  assert.equal(result.serverProcessing, true);
  assert.equal(reads, 1);
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().acquisitions, 2);
  assert.equal(h.counts().delays, 0);
  assert.equal(bindings, 4);
});
test('unacknowledged COUNTING exhausts the unchanged finite budget without replay or success', async () => {
  const h = harness();
  const patch = h.options.patch;
  h.options.patch = async () => {
    await patch();
    return {};
  };
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
    const patch = h.options.patch;
    h.options.patch = async () => {
      await patch();
      return {};
    };
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
for (const version of ['65.0', '68.0']) {
  test(`API${version} PATCH payload is complete doubly nested DBT without schedules or lookback`, async () => {
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
    await new ConnectClient(c, version).patchSegment(changed());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(
      calls[0].url,
      `${connection.instanceUrl}/services/data/v${version}/ssot/segments/Audience`,
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
}
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
test('unacknowledged processing polls have finite read and delay budgets even with a frozen clock', async () => {
  let reads = 0;
  const h = harness(changed(), {
    patch: async () => ({}),
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
