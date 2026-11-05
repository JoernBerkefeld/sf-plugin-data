import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { inspect } from 'node:util';
import { Connection } from '@salesforce/core';
import {
  buildDataGraphCreateRequest,
  createDataGraphClient,
} from '../lib/transport/data-graph-rest.js';

const origin = 'https://synthetic.my.salesforce.com';
const name = 'SyntheticGraph';
const endpoint = `${origin}/services/data/v68.0/ssot/data-graphs`;
const candidate = () => ({
  name,
  label: 'Synthetic graph',
  description: 'Synthetic root-only definition',
  dataspaceName: 'default',
  primaryObjectName: 'ssot__Individual__dlm',
  type: 'NONE',
  sourceObject: {
    name: 'ssot__Individual__dlm',
    devName: 'AuthoredIndividual',
    label: 'Individual',
    jsonPath: '$',
    path: [],
    type: 'standard',
    fields: ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'].map((sourceFieldName, index) => ({
      devName: `AuthoredField${index}`,
      sourceFieldName,
      dataType: 'Text',
      isKeyColumn: index === 0,
      isProjected: true,
      usageTag: index === 1 ? 'KEY_QUALIFIER' : 'NONE',
    })),
    relatedObjects: [],
  },
});
const operations = {
  get: (client) => client.get(name),
  create: (client) => client.create(candidate()),
  delete: (client) => client.delete(name),
};
const verbs = { get: 'GET', create: 'POST', delete: 'DELETE' };

test('native Graph binds raw lowercase dataspaceName and exact API68 CRD only', async () => {
  const calls = [];
  const response = { id: 'synthetic', sourceObject: { devName: 'ServerGeneratedNode' } };
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
  const client = createDataGraphClient(connection, '68.0', 'default');
  assert.deepEqual(Object.keys(client), ['get', 'create', 'delete']);
  assert.equal(client.update, undefined);
  for (const [operation, execute] of Object.entries(operations))
    assert.equal(await execute(client), operation === 'delete' ? undefined : response);
  assert.deepEqual(calls, [
    { method: 'GET', url: `${endpoint}/${name}` },
    {
      method: 'POST',
      url: endpoint,
      body: JSON.stringify(candidate()),
      headers: { 'content-type': 'application/json' },
    },
    { method: 'DELETE', url: `${endpoint}/${name}` },
  ]);
  const input = candidate();
  const detached = buildDataGraphCreateRequest(input);
  input.sourceObject.fields[0].devName = 'Changed';
  assert.equal(detached.sourceObject.fields[0].devName, 'AuthoredField0');
});

test('native Graph rejects other versions, spaces and route injection without requests', async () => {
  const connection = { instanceUrl: origin, request: () => assert.fail('unexpected request') };
  for (const version of ['64.0', '65.0', '66.0', '67.0', '69.0', 'latest', 'auto', undefined, 68])
    assert.throws(() => createDataGraphClient(connection, version, 'default'));
  for (const space of ['', 'other', undefined, 'default?x=1'])
    assert.throws(() => createDataGraphClient(connection, '68.0', space));
  const client = createDataGraphClient(connection, '68.0', 'default');
  for (const unsafe of [
    '',
    '../other',
    'Graph?x=1',
    'Graph/other',
    'Graph%2fother',
    undefined,
    42,
  ]) {
    await assert.rejects(client.get(unsafe));
    await assert.rejects(client.delete(unsafe));
  }
});

const changes = [
  (value) => {
    value.dataSpaceName = value.dataspaceName;
    delete value.dataspaceName;
  },
  (value) => {
    value.dataspaceName = 'other';
  },
  (value) => {
    value.id = 'source-id';
  },
  (value) => {
    value.creationMode = 'DEFAULT';
  },
  (value) => {
    value.fullRefreshConfig = { schedule: { frequency: 1 } };
  },
  (value) => {
    value.primaryObjectName = 'UnifiedIndividual__dlm';
  },
  (value) => {
    value.sourceObject.name = 'Other__dlm';
  },
  (value) => {
    value.sourceObject.id = 'source-node-id';
  },
  (value) => {
    value.sourceObject.type = 'derived';
  },
  (value) => {
    value.sourceObject.path.push('nested');
  },
  (value) => {
    value.sourceObject.relatedObjects.push({ name: 'Other__dlm' });
  },
  (value) => {
    value.sourceObject.fields.reverse();
  },
  (value) => {
    value.sourceObject.fields[0].isKeyColumn = false;
  },
  (value) => {
    value.sourceObject.fields[1].usageTag = 'NONE';
  },
  (value) => {
    value.sourceObject.fields[2].dataType = 'Number';
  },
  (value) => {
    value.sourceObject.fields[2].isProjected = false;
  },
  (value) => {
    value.sourceObject.fields[2].devName = value.sourceObject.fields[0].devName;
  },
  (value) => {
    value.sourceObject.fields[2].id = 'source-field-id';
  },
  (value) => {
    value.sourceObject.fields.pop();
  },
  (value) => {
    value.toJSON = () => assert.fail('must not invoke serializer');
  },
  (value) => {
    Object.defineProperty(value, 'label', { enumerable: true, get: () => assert.fail('getter') });
  },
  (value) => {
    Object.defineProperty(value.sourceObject.fields, '0', {
      enumerable: true,
      get: () => assert.fail('field getter'),
    });
  },
];
for (const [index, change] of changes.entries())
  test(`native Graph malformed or unqualified create ${index} stops before dispatch`, async () => {
    const client = createDataGraphClient(
      { instanceUrl: origin, request: () => assert.fail('unexpected request') },
      '68.0',
      'default',
    );
    const value = candidate();
    change(value);
    await assert.rejects(client.create(value));
    await assert.rejects(client.create({ input: candidate() }));
  });

for (const [operation, execute] of Object.entries(operations)) {
  for (const statusCode of [operation === 'create' ? 201 : 200, 204, 400, 401, 403, 429, 500, 503])
    test(`actual core Graph ${operation} HTTP${statusCode} has no refresh or replay`, async () => {
      let calls = 0;
      const connection = Object.assign(Object.create(Connection.prototype), {
        instanceUrl: origin,
        version: '68.0',
        accessToken: 'synthetic-token',
        logger: { getRawLogger: () => ({ debug() {} }) },
        _refreshDelegate: {
          isRefreshing: () => assert.fail('must not consult refresh'),
          refresh: () => assert.fail('must not refresh'),
        },
        _propagators: [],
        _transport: {
          httpRequest: (request, options) => {
            calls++;
            assert.equal(request.method, verbs[operation]);
            assert.equal(options.retry.maxRetries, 0);
            if (operation !== 'create') assert.equal(request.body, undefined);
            const pending = Promise.resolve({
              statusCode,
              headers: { 'content-type': 'application/json' },
              body:
                statusCode === 204
                  ? ''
                  : JSON.stringify(
                      statusCode < 400
                        ? { unexpected: true }
                        : [
                            {
                              errorCode:
                                statusCode === 401 ? 'INVALID_SESSION_ID' : 'INTERNAL_ERROR',
                              message: `Data Graph not found with name ${name}; secret detail`,
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
      const pending = execute(createDataGraphClient(connection, '68.0', 'default'));
      if (statusCode < 400)
        assert.deepEqual(await pending, statusCode === 204 ? undefined : { unexpected: true });
      else
        await assert.rejects(pending, (error) => {
          assert.equal(error.code, statusCode === 401 ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED');
          assert.equal(error.nativeCode, undefined);
          assert.equal(inspect(error).includes('secret detail'), false);
          return true;
        });
      assert.equal(calls, 1);
      assert.deepEqual(Object.getOwnPropertyDescriptors(connection), descriptors);
    });
  test(`native Graph ${operation} redirect/network failures never replay`, async () => {
    for (const redirect of [false, true]) {
      let calls = 0;
      const client = createDataGraphClient(
        {
          instanceUrl: origin,
          request: async (_request, options) => {
            calls++;
            if (redirect) options.followRedirect('https://other.test/secret');
            throw new Error('secret network detail');
          },
        },
        '68.0',
        'default',
      );
      await assert.rejects(execute(client), (error) => {
        assert.equal(error.code, redirect ? 'INVALID_REQUEST' : 'REQUEST_FAILED');
        assert.equal(inspect(error).includes('secret network detail'), false);
        return true;
      });
      assert.equal(calls, 1);
    }
  });
}
