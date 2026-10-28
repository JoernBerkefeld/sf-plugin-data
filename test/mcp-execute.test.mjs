import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { inspect } from 'node:util';
import { Connection } from '@salesforce/core';
import { McpExecuteClient } from '../lib/transport/mcp-execute.js';

const origin = 'https://synthetic.my.salesforce.com';
const version = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };
const graphRead = {
  dataGraphName: 'Synthetic',
  includeCIDetails: true,
  includeSegmentDetails: true,
};
const ci = {
  input: {
    apiName: 'Synthetic__cio',
    displayName: 'Synthetic',
    expression: 'SELECT preserved bytes',
    definitionType: 'CalculatedMetric',
    dataSpaceName: 'default',
    draft: true,
  },
};
const graph = {
  input: {
    name: 'Synthetic',
    label: 'Synthetic',
    description: 'Synthetic',
    creationMode: 'DEFAULT',
    dataspaceName: 'default',
    primaryObjectName: 'Synthetic__dlm',
    type: 'NONE',
    fullRefreshConfig: { schedule: { frequency: 7, timeGranularity: 'Day' } },
    incrementalRefreshConfig: { enabled: false },
    sourceObject: {
      name: 'Synthetic__dlm',
      devName: 'Synthetic__dlm',
      label: 'Synthetic',
      path: [],
      relatedObjects: [],
      fields: [
        { sourceFieldName: 'ssot__Id__c', dataType: 'Text', isKeyColumn: true, isProjected: true },
        {
          sourceFieldName: 'ssot__FirstName__c',
          dataType: 'Text',
          isKeyColumn: false,
          isProjected: true,
        },
      ],
    },
  },
};
const irInput = {
  label: 'Synthetic',
  description: 'Synthetic',
  doesRunAutomatically: false,
  matchRules: {
    rules: [
      {
        label: 'Synthetic',
        criteria: {
          criteria: [
            {
              entityName: 'ssot__Individual__dlm',
              fieldName: 'ssot__FirstName__c',
              matchMethodType: 'Fuzzy',
              shouldMatchOnBlank: false,
            },
            {
              entityName: 'ssot__Individual__dlm',
              fieldName: 'ssot__LastName__c',
              matchMethodType: 'Exact',
              shouldMatchOnBlank: false,
            },
            {
              entityName: 'ssot__ContactPointEmail__dlm',
              fieldName: 'ssot__EmailAddress__c',
              matchMethodType: 'ExactNormalized',
              shouldMatchOnBlank: false,
            },
          ],
        },
      },
    ],
  },
  reconciliationRules: {
    rules: [
      {
        entityName: 'ssot__Individual__dlm',
        ruleType: 'LastUpdated',
        shouldIgnoreEmptyValue: true,
      },
    ],
  },
};
const irCreate = {
  input: {
    configurationType: 'Individual',
    dataSpaceName: 'default',
    rulesetId: 'test',
    ...irInput,
  },
};
const irUpdate = { identityResolution: 'Individual_test', input: structuredClone(irInput) };
irUpdate.input.reconciliationRules.rules[0].ruleType = 'MostFrequent';
const graphResult = {
  name: 'Synthetic',
  dataspaceName: 'default',
  id: 'synthetic',
  status: 'ready',
};
const irResult = {
  objectApiName: 'Individual_test',
  dataSpaceName: 'default',
  id: 'synthetic',
  rulesetStatus: 'PUBLISHING',
};
const ciResult = {
  apiName: 'Synthetic__cio',
  dataSpace: 'default',
  calculatedInsightStatus: 'DRAFT',
};

/**
 *
 * @param {unknown} body Synthetic wire body.
 * @param {number} statusCode Synthetic HTTP status.
 * @param {Error} failure Optional synthetic disconnect.
 * @returns {object} Actual core connection and counted transport fixture.
 */
function fixture(body, statusCode = 201, failure) {
  if (body === undefined) body = { result: graphResult };
  const calls = [];
  const connection = Object.create(Connection.prototype);
  const refresh = {
    isRefreshing: () => assert.fail('refresh consulted'),
    refresh: () => assert.fail('refresh attempted'),
  };
  Object.assign(connection, {
    instanceUrl: origin,
    version: '67.0',
    accessToken: 'synthetic-token',
    _refreshDelegate: refresh,
    _propagators: [],
    logger: { getRawLogger: () => ({ debug: () => {} }) },
    _transport: {
      httpRequest: (request, options) => {
        calls.push({ request, options });
        assert.equal(options.retry.maxRetries, 0);
        assert.equal(request.headers.Authorization, 'Bearer synthetic-token');
        const pending = failure
          ? Promise.reject(failure)
          : Promise.resolve({
              statusCode,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  return { calls, connection, client: new McpExecuteClient(connection, version), refresh };
}

const transformRead = { dataTransformNameOrId: 'OwnerReturnedTransform' };
const transformResult = {
  name: 'OwnerReturnedTransform',
  id: 'synthetic-transform-id',
  dataSpaceName: 'default',
  creationSource: 'Data Graph',
  status: 'ACTIVE',
  lastRunStatus: 'SUCCESS',
  lastRunDate: '2026-10-01T10:00:00.000Z',
};

const operations = [
  ['d360_transform_get', transformRead, transformResult],
  ['d360_ci_create', ci, ciResult],
  ['d360_data_graph_create', graph, graphResult],
  ['d360_data_graph_get', graphRead, graphResult],
  ['d360_data_graph_update', { ...graph, editScheduleOnly: false }, graphResult],
  ['d360_data_graph_delete', { dataGraphName: 'Synthetic' }, { success: true }],
  ['d360_ir_create', irCreate, irResult],
  ['d360_ir_get', { identityResolution: 'Individual_test' }, irResult],
  ['d360_ir_update', irUpdate, irResult],
  ['d360_ir_delete', { identityResolution: 'Individual_test' }, { success: true }],
];

for (const [operation, parameters, resource] of operations) {
  test(`core facade ${operation} sends one fixed-route authenticated POST with one params serialization`, async () => {
    const { calls, client, connection, refresh } = fixture({ result: resource });
    const before = Object.getOwnPropertyDescriptors(connection);
    const output = await client[operation.endsWith('_get') ? 'read' : 'mutate'](
      operation,
      parameters,
    );
    assert.deepEqual(output, resource);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].request.method, 'POST');
    assert.equal(calls[0].request.url, `${origin}/services/data/v67.0/ssot/mcp/execute`);
    const envelope = JSON.parse(calls[0].request.body);
    assert.equal(envelope.toolName, operation);
    assert.equal(typeof envelope.paramsJson, 'string');
    assert.deepEqual(JSON.parse(envelope.paramsJson), parameters);
    assert.deepEqual(Object.getOwnPropertyDescriptors(connection), before);
    assert.equal(connection._refreshDelegate, refresh);
  });
}

for (const operation of ['d360_ci_create', 'd360_data_graph_get']) {
  for (const failure of [401, 503, 'disconnect']) {
    test(`actual core ${operation} never refreshes/retries/replays ${failure}`, async () => {
      const { client, calls } = fixture(
        [{ errorCode: failure === 401 ? 'INVALID_SESSION_ID' : 'SERVER_ERROR', message: 'secret' }],
        typeof failure === 'number' ? failure : 200,
        failure === 'disconnect' ? new Error('secret') : undefined,
      );
      await assert.rejects(
        operation.endsWith('_get')
          ? client.read(operation, graphRead)
          : client.mutate(operation, ci),
        (error) => {
          assert.equal(error.code, failure === 401 ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED');
          assert.equal(inspect(error).includes('secret'), false);
          return true;
        },
      );
      assert.equal(calls.length, 1);
    });
  }
}

for (const statusCode of [200, 201, 204, 202, 301, 302, 307, 308]) {
  test(`HTTP ${statusCode} is independently validated before application success`, async () => {
    const { client, calls } = fixture({ result: graphResult }, statusCode);
    await (statusCode === 200 || statusCode === 201
      ? client.read('d360_data_graph_get', graphRead)
      : assert.rejects(client.read('d360_data_graph_get', graphRead), { code: 'REQUEST_FAILED' }));
    assert.equal(calls.length, 1);
  });
}

for (const [index, body] of [
  undefined,
  JSON.parse('null'),
  [],
  '',
  {},
  { result: JSON.parse('null') },
  { result: [] },
  { error: 'secret' },
  { result: graphResult, error: 'secret' },
  { body: { result: graphResult } },
  { statusCode: 201, body: { error: 'secret' } },
  { responseCode: 201, defaultExc: JSON.stringify({ result: graphResult }) },
  { result: { ...graphResult, success: false } },
  { result: { ...graphResult, error: 'secret' } },
  { result: { ...graphResult, errors: [] } },
  { result: { ...graphResult, errorCode: 'secret' } },
  { result: { ...graphResult, result: {} } },
  { result: { ...graphResult, body: { error: 'secret' } } },
  { result: { ...graphResult, name: 'Other' } },
  { result: { ...graphResult, dataspaceName: 'other' } },
  { result: { ...graphResult, status: 'unrecognized' } },
  { result: { name: 'Synthetic' } },
].entries()) {
  test(`malformed/error/contradictory HTTP201 application outcome ${index} fails closed`, async () => {
    const { client, calls } = fixture(body === undefined ? 'invalid' : body);
    await assert.rejects(client.read('d360_data_graph_get', graphRead), { code: 'REQUEST_FAILED' });
    assert.equal(calls.length, 1);
  });
}

for (const [operation, parameters, resource] of operations) {
  test(`${operation} rejects operation-specific identity or missing success`, async () => {
    const { client } = fixture({
      result: {
        ...resource,
        ...(operation.endsWith('_delete')
          ? { success: false }
          : operation.startsWith('d360_ir_')
            ? { objectApiName: 'Wrong' }
            : operation === 'd360_ci_create'
              ? { apiName: 'Wrong__cio' }
              : { name: 'Wrong' }),
      },
    });
    await assert.rejects(
      client[operation.endsWith('_get') ? 'read' : 'mutate'](operation, parameters),
      { code: 'REQUEST_FAILED' },
    );
  });
}

test('explicit API67 selection only; numeric/default/latest meanings are never upgraded', () => {
  const { connection } = fixture();
  for (const candidate of [
    undefined,
    '67.0',
    { ...version, requested: '65.0' },
    { ...version, soapNumeric: '65.0' },
    { ...version, restSelector: 'latest' },
    { requested: 'latest', restSelector: 'latest', soapNumeric: '67.0' },
  ])
    assert.throws(() => new McpExecuteClient(connection, candidate), { code: 'INVALID_REQUEST' });
  for (const instanceUrl of [
    'http://example.test',
    `${origin}/other`,
    `${origin}?secret`,
    'https://user:secret@example.test',
  ])
    assert.throws(() => new McpExecuteClient({ ...connection, instanceUrl }, version), {
      code: 'INVALID_REQUEST',
    });
});

test('semantic operations and unknown tools cannot cross read/mutation boundary', async () => {
  const { client, calls } = fixture();
  for (const operation of [
    'd360_ir_create',
    'd360_ci_create',
    'unknown',
    'toString',
    'd360_ir_run',
  ])
    await assert.rejects(client.read(operation, {}), { code: 'INVALID_REQUEST' });
  for (const operation of ['d360_ir_get', 'unknown', 'd360_ci_update', 'd360_data_graph_get'])
    await assert.rejects(client.mutate(operation, {}), { code: 'INVALID_REQUEST' });
  assert.equal(calls.length, 0);
});

test('operation-specific inputs reject malformed, extra, sparse and unqualified structures before network', async () => {
  const { client, calls } = fixture();
  for (const [operation, parameters] of operations) {
    for (const bad of [
      JSON.parse('null'),
      {},
      JSON.stringify(parameters),
      { ...parameters, url: '/other' },
      ...Object.keys(parameters).map((key) => {
        const copy = structuredClone(parameters);
        delete copy[key];
        return copy;
      }),
    ])
      await assert.rejects(client[operation.endsWith('_get') ? 'read' : 'mutate'](operation, bad), {
        code: 'INVALID_REQUEST',
      });
  }
  const badGraph = structuredClone(graph);
  badGraph.input.incrementalRefreshConfig.enabled = true;
  const badIr = structuredClone(irCreate);
  badIr.input.doesRunAutomatically = true;
  for (const [operation, parameters] of [
    ['d360_data_graph_create', badGraph],
    ['d360_ir_create', badIr],
    ['d360_ci_create', { input: { ...ci.input, draft: false } }],
  ])
    await assert.rejects(client.mutate(operation, parameters), { code: 'INVALID_REQUEST' });
  assert.equal(calls.length, 0);
});

test('accessors, cycles, custom serializers and non-JSON values cannot change validated outgoing bytes', async () => {
  const { client, calls } = fixture();
  const cycle = {};
  cycle.self = cycle;
  const accessor = {
    get input() {
      throw new Error('accessor evaluated');
    },
  };
  for (const parameters of [
    cycle,
    accessor,
    {
      input: {
        ...ci.input,
        toJSON() {
          assert.fail('toJSON evaluated');
        },
      },
    },
    { input: { ...ci.input, extra: undefined } },
    { input: { ...ci.input, extra: Number.NaN } },
  ])
    await assert.rejects(client.mutate('d360_ci_create', parameters), { code: 'INVALID_REQUEST' });
  assert.equal(calls.length, 0);
});

test('transform reads bind exact returned name or id, not a derived name or current invocation time', async () => {
  const { client, calls } = fixture({ result: transformResult });
  assert.deepEqual(await client.read('d360_transform_get', transformRead), transformResult);
  await assert.rejects(
    client.read('d360_transform_get', { dataTransformNameOrId: 'UnrelatedTransform' }),
    { code: 'REQUEST_FAILED' },
  );
  const byId = fixture({ result: { ...transformResult, id: 'SyntheticTransformId' } });
  const idRead = await byId.client.read('d360_transform_get', {
    dataTransformNameOrId: 'SyntheticTransformId',
  });
  assert.equal(idRead.name, transformResult.name);
  assert.equal(calls.length, 2);
});

for (const change of [
  { dataSpaceName: 'other' },
  { creationSource: 'Other' },
  { id: '' },
  { name: 'Wrong' },
  { status: undefined },
  { lastRunStatus: undefined },
  { lastRunDate: undefined },
  { lastRunDate: 'yesterday' },
  { error: { message: 'private' } },
  { success: false },
]) {
  test(`transform rejects incomplete or contradictory read ${JSON.stringify(change)}`, async () => {
    const { client, calls } = fixture({ result: { ...transformResult, ...change } });
    await assert.rejects(client.read('d360_transform_get', transformRead), {
      code: 'REQUEST_FAILED',
    });
    assert.equal(calls.length, 1);
  });
}

test('transform pending observations do not manufacture completion or allow mutation', async () => {
  for (const lastRunStatus of ['PENDING', 'IN_PROGRESS', 'FAILED']) {
    const resource = { ...transformResult, lastRunStatus, lastRunDate: JSON.parse('null') };
    const { client } = fixture({ result: resource });
    assert.deepEqual(await client.read('d360_transform_get', transformRead), resource);
    await assert.rejects(client.mutate('d360_transform_get', transformRead), {
      code: 'INVALID_REQUEST',
    });
  }
});

test('private observer records actual unknown status and nested errors before rejection', async () => {
  for (const resource of [
    { ...graphResult, status: 'unknown_state' },
    { ...graphResult, status: 42 },
    { ...graphResult, status: undefined },
    { ...graphResult, error: { message: 'private diagnostic' } },
  ]) {
    const body = { result: structuredClone(resource) };
    if (body.result.status === undefined) delete body.result.status;
    const { client, calls } = fixture(body);
    const observations = [];
    await assert.rejects(
      client.read('d360_data_graph_get', graphRead, async (value) => {
        observations.push(structuredClone(value));
        value.result.status = 'ready';
        delete value.result.error;
      }),
      { code: 'REQUEST_FAILED' },
    );
    assert.deepEqual(observations, [body]);
    assert.equal(calls.length, 1);
  }
});

test('read observer is awaited, detached and fail-closed, never a mutation authorization', async () => {
  const { client, calls } = fixture({ result: graphResult });
  let recorded = false;
  const output = await client.read('d360_data_graph_get', graphRead, async (value) => {
    await Promise.resolve();
    value.result.name = 'tampered';
    recorded = true;
  });
  assert.equal(recorded, true);
  assert.deepEqual(output, graphResult);
  await assert.rejects(
    client.read('d360_data_graph_get', graphRead, async () => {
      throw new Error('private recorder failure');
    }),
    { code: 'REQUEST_FAILED' },
  );
  await assert.rejects(client.read('d360_data_graph_get', graphRead, true), {
    code: 'INVALID_REQUEST',
  });
  assert.equal(calls.length, 2);
});

test('core transport redirect callback never follows any origin', async () => {
  for (const destination of [`${origin}/other`, 'https://other.test/secret']) {
    const { client, connection } = fixture();
    let attempts = 0;
    connection._transport.httpRequest = (_request, options) => {
      attempts++;
      options.followRedirect(destination);
      assert.fail('redirect followed');
    };
    await assert.rejects(client.mutate('d360_ci_create', ci), { code: 'REQUEST_FAILED' });
    assert.equal(attempts, 1);
  }
});
