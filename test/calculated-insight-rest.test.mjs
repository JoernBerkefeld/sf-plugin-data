import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { inspect } from 'node:util';
import { Connection } from '@salesforce/core';
import { createCalculatedInsightClient } from '../lib/transport/calculated-insight-rest.js';

const origin = 'https://synthetic.my.salesforce.com';
const apiName = 'SyntheticInsight__cio';
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
// eslint-disable-next-line unicorn/no-null -- Synthetic qualified document retains explicit wire nulls.
const wireNull = null;
const candidate = (edited = false) => ({
  schemaVersion: 1,
  kind: 'calculated-insight',
  identity: { dataSpace: 'default', apiName },
  spec: {
    displayName: 'Synthetic insight',
    expression: `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0${edited ? ` AND ${device} IS NOT NULL` : ''} GROUP BY ${application}`,
    creationType: 'Custom',
    definitionType: 'CALCULATED_METRIC',
    definitionStatus: 'IN_USE',
    description: wireNull,
    isEnabled: true,
    subType: wireNull,
    publishScheduleInterval: 'NOT_SCHEDULED',
    publishScheduleStartDateTime: wireNull,
    publishScheduleEndDate: wireNull,
    dimensions: [
      {
        apiName: 'app_id__c',
        creationType: 'Custom',
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
        dataType: 'Number',
        displayName: 'device_count',
        fieldAggregationType: 'NONAGGREGATABLE',
        fieldRole: 'MEASURE',
        formula: `APPROX_COUNT_DISTINCT(${device})`,
      },
    ],
    dependencies: [
      {
        kind: 'dmo',
        dataSpace: 'default',
        apiName: table,
        fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'],
      },
    ],
  },
});
const operations = {
  get: (client) => client.get(apiName),
  create: (client) => client.create(candidate()),
  update: (client) => client.update(candidate(true)),
  publish: (client) => client.publish(candidate()),
  delete: (client) => client.delete(apiName),
};
const verbs = { get: 'GET', create: 'POST', update: 'PATCH', publish: 'PATCH', delete: 'DELETE' };
const body = (value) => ({
  body: JSON.stringify(value),
  headers: { 'content-type': 'application/json' },
});

for (const version of ['64.0', '65.0', '66.0', '67.0', '68.0'])
  test(`native CI ${version} binds exact routes, minimal bodies and preserves untrusted responses`, async () => {
    const calls = [];
    const response = { calculatedInsightStatus: 'PROCESSING', unexpected: 'untrusted' };
    const connection = {
      instanceUrl: origin,
      _refreshDelegate: {},
      request: async function (request, options) {
        assert.notEqual(this, connection);
        assert.equal(this._refreshDelegate, undefined);
        assert.equal(options.retry.maxRetries, 0);
        calls.push(request);
        return request.method === 'DELETE' ? undefined : response;
      },
    };
    const client = createCalculatedInsightClient(connection, version, 'default');
    for (const [operation, execute] of Object.entries(operations))
      assert.equal(await execute(client), operation === 'delete' ? undefined : response);
    const endpoint = `${origin}/services/data/v${version}/ssot/calculated-insights`;
    assert.deepEqual(calls, [
      { method: 'GET', url: `${endpoint}/${apiName}` },
      {
        method: 'POST',
        url: endpoint,
        ...body({
          apiName,
          displayName: candidate().spec.displayName,
          expression: candidate().spec.expression,
          definitionType: 'CalculatedMetric',
          dataSpaceName: 'default',
          draft: true,
        }),
      },
      {
        method: 'PATCH',
        url: `${endpoint}/${apiName}`,
        ...body({ expression: candidate(true).spec.expression }),
      },
      {
        method: 'PATCH',
        url: `${endpoint}/${apiName}`,
        ...body({
          displayName: candidate().spec.displayName,
          draft: false,
          publishScheduleInterval: 'NotScheduled',
        }),
      },
      { method: 'DELETE', url: `${endpoint}/${apiName}` },
    ]);
  });

test('draft retention is explicit, expression-only by default, and never publishes implicitly', async () => {
  const calls = [];
  const client = createCalculatedInsightClient(
    { instanceUrl: origin, request: async (request) => calls.push(request) },
    '68.0',
    'default',
  );
  for (const options of [undefined, {}]) {
    await client.update(candidate(true), options);
    assert.deepEqual(JSON.parse(calls.at(-1).body), {
      expression: candidate(true).spec.expression,
    });
  }
  await client.update(candidate(true), { draft: true });
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    expression: candidate(true).spec.expression,
    draft: true,
  });
  for (const options of [
    false,
    true,
    wireNull,
    [],
    'draft',
    { draft: false },
    { draft: undefined },
    { draft: 'true' },
    { extra: true },
    { draft: true, extra: true },
  ])
    await assert.rejects(client.update(candidate(), options), { code: 'INVALID_CI_SCOPE' });
  const managed = candidate();
  managed.spec.publishScheduleInterval = 'SYSTEM_MANAGED';
  await assert.rejects(client.publish(managed), { code: 'CI_CONFIGURATION_UNQUALIFIED' });
  assert.equal(calls.length, 3);
  // Legacy system-managed expression edits still carry no lifecycle or schedule fields.
  await client.update(managed);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { expression: managed.spec.expression });
});

test('invalid versions, scope, name and documents stop before any transport call', async () => {
  const connection = { instanceUrl: origin, request: () => assert.fail('unexpected request') };
  for (const version of ['63.0', '69.0', 'latest', 'auto', '65', '65.1', '', undefined, 65])
    assert.throws(() => createCalculatedInsightClient(connection, version, 'default'), {
      code: 'INVALID_CI_SCOPE',
    });
  for (const space of ['', 'other', 'default?x=1', undefined])
    assert.throws(() => createCalculatedInsightClient(connection, '65.0', space), {
      code: 'INVALID_CI_SCOPE',
    });
  const client = createCalculatedInsightClient(connection, '65.0', 'default');
  for (const name of [
    '',
    '0abc',
    '../Synthetic__cio',
    'Synthetic__cio?x=1',
    'Synthetic__cio/other',
    undefined,
    {},
    42,
  ]) {
    await assert.rejects(client.get(name), { code: 'INVALID_CI_NAME' });
    await assert.rejects(client.delete(name), { code: 'INVALID_CI_NAME' });
  }
  for (const mutate of [
    (value) => {
      value.identity.dataSpace = 'other';
    },
    (value) => {
      value.identity.apiName = '../Synthetic__cio';
    },
    (value) => {
      value.spec.expression = 'SELECT secret';
    },
    (value) => {
      value.spec.extra = 'secret';
    },
    (value) => {
      value.extra = 'secret';
    },
    (value) => {
      value.spec.dimensions = [];
    },
    (value) => {
      value.spec.publishScheduleInterval = 'NotScheduled';
    },
  ]) {
    const value = candidate();
    mutate(value);
    for (const operation of ['create', 'update', 'publish'])
      await assert.rejects(client[operation](value), (error) => {
        assert.equal(inspect(error).includes('SELECT secret'), false);
        assert.match(error.code, /CI/u);
        return true;
      });
  }
  for (const operation of ['create', 'update', 'publish'])
    await assert.rejects(client[operation]());
});

const missing = { errorCode: 'ITEM_NOT_FOUND', message: 'private synthetic detail' };
const nativeErrorCases = [
  ['single error array', 404, [missing], true],
  ['single error object', 404, missing, true],
  ['generic 404', 404, [{ errorCode: 'ERROR', message: 'ITEM_NOT_FOUND' }], false],
  ['raw string', 404, 'ITEM_NOT_FOUND', false],
  ['serialized body string', 404, JSON.stringify([missing]), false],
  ['missing message', 404, { errorCode: 'ITEM_NOT_FOUND' }, false],
  ['nonstring message', 404, { ...missing, message: 42 }, false],
  [
    'mixed error array',
    404,
    [missing, { errorCode: 'INVALID_SESSION_ID', message: 'private' }],
    false,
  ],
  ['duplicate errors', 404, [missing, missing], false],
  ['unknown fields', 404, { ...missing, unexpected: true }, false],
  ['auth error', 401, [missing], false],
  ['forbidden error', 403, [missing], false],
  ['throttled error', 429, [missing], false],
  ['server error', 500, [missing], false],
  ['unavailable error', 503, [missing], false],
];
for (const [label, statusCode, payload, qualifies] of nativeErrorCases)
  test(`actual core native absence discriminator: ${label}`, async () => {
    let calls = 0;
    const connection = Object.assign(Object.create(Connection.prototype), {
      instanceUrl: origin,
      version: '68.0',
      accessToken: 'synthetic-token',
      logger: { getRawLogger: () => ({ debug() {} }) },
      _refreshDelegate: {
        isRefreshing: () => assert.fail('must not consult refresh delegate'),
        refresh: () => assert.fail('must not refresh'),
      },
      _propagators: [],
      _transport: {
        httpRequest: (_request, options) => {
          calls++;
          assert.equal(options.retry.maxRetries, 0);
          const pending = Promise.resolve({
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          pending.stream = () => new PassThrough();
          return pending;
        },
      },
    });
    const client = createCalculatedInsightClient(connection, '68.0', 'default');
    await assert.rejects(client.get(apiName), (error) => {
      assert.equal(error.code, statusCode === 401 ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED');
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.nativeCode, qualifies ? 'ITEM_NOT_FOUND' : undefined);
      for (const secret of ['private', 'synthetic-token', 'message', 'headers', 'body'])
        assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
    assert.equal(calls, 1);
  });

test('machine error names without the validated core data shape are not absence', async () => {
  for (const failure of [
    { name: 'ITEM_NOT_FOUND', statusCode: 404 },
    { name: 'ITEM_NOT_FOUND', errorCode: 'ITEM_NOT_FOUND', statusCode: 404, data: [missing] },
    { name: 'INVALID_SESSION_ID', errorCode: 'ITEM_NOT_FOUND', statusCode: 404, data: missing },
  ]) {
    let calls = 0;
    const client = createCalculatedInsightClient(
      {
        instanceUrl: origin,
        request: async () => {
          calls++;
          throw failure;
        },
      },
      '68.0',
      'default',
    );
    await assert.rejects(client.get(apiName), (error) => {
      assert.equal(error.nativeCode, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

for (const [operation, execute] of Object.entries(operations)) {
  for (const statusCode of [200, 204, 401, 403, 404, 429, 500, 503])
    test(`actual core CI ${operation} ${statusCode} is single-attempt, no refresh and payload-free`, async () => {
      let calls = 0;
      const refresh = {
        isRefreshing: () => assert.fail('must not consult refresh delegate'),
        refresh: () => assert.fail('must not refresh'),
      };
      const connection = Object.assign(Object.create(Connection.prototype), {
        instanceUrl: origin,
        version: '65.0',
        accessToken: 'synthetic-token',
        logger: { getRawLogger: () => ({ debug() {} }) },
        _refreshDelegate: refresh,
        _propagators: [],
        _transport: {
          httpRequest: (request, options) => {
            calls++;
            assert.equal(request.method, verbs[operation]);
            assert.equal(options.retry.maxRetries, 0);
            if (operation === 'delete') assert.equal(request.body, undefined);
            const pending = Promise.resolve({
              statusCode,
              headers: { 'content-type': 'application/json' },
              body:
                statusCode === 204
                  ? ''
                  : JSON.stringify(
                      statusCode === 200
                        ? { unexpected: true }
                        : [
                            {
                              errorCode:
                                statusCode === 401
                                  ? 'INVALID_SESSION_ID'
                                  : statusCode === 404
                                    ? 'ITEM_NOT_FOUND'
                                    : 'ERROR',
                              message: 'secret SQL payload',
                            },
                          ],
                    ),
            });
            pending.stream = () => new PassThrough();
            return pending;
          },
        },
      });
      const descriptors = Object.getOwnPropertyDescriptors(connection);
      const pending = execute(createCalculatedInsightClient(connection, '65.0', 'default'));
      if (statusCode < 400)
        assert.deepEqual(await pending, statusCode === 204 ? undefined : { unexpected: true });
      else
        await assert.rejects(pending, (error) => {
          assert.equal(error.code, statusCode === 401 ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED');
          assert.equal(inspect(error).includes('secret SQL payload'), false);
          assert.equal(
            error.nativeCode,
            operation === 'get' && statusCode === 404 ? 'ITEM_NOT_FOUND' : undefined,
          );
          return true;
        });
      assert.equal(calls, 1);
      assert.deepEqual(Object.getOwnPropertyDescriptors(connection), descriptors);
    });

  test(`CI ${operation} refuses redirects and network errors without replay`, async () => {
    for (const failure of ['network', `${origin}/other`, 'https://other.test/secret']) {
      let calls = 0;
      const client = createCalculatedInsightClient(
        {
          instanceUrl: origin,
          request: async (_request, options) => {
            calls++;
            if (failure !== 'network') options.followRedirect(failure);
            throw new Error('secret SQL payload');
          },
        },
        '67.0',
        'default',
      );
      await assert.rejects(execute(client), (error) => {
        assert.equal(error.code, failure === 'network' ? 'REQUEST_FAILED' : 'INVALID_REQUEST');
        assert.equal(inspect(error).includes('secret SQL payload'), false);
        return true;
      });
      assert.equal(calls, 1);
    }
  });
}
