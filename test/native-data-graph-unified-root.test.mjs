import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { operateNativeDataGraph } from '../lib/services/command-native-data-graph.js';

// Sanitized copies of a live API68 create on a unified DMO root (2026-11-13): the authored file
// and the file retrieved afterwards. Salesforce replaced the root devName and label and the
// field devNames, and added fragmentDMOName, referenceDeveloperName, projectedName,
// isDGRootKeyField and fieldRoles.
const load = (file) =>
  JSON.parse(readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8'));
const authored = () => load('native-data-graph-unified-authored.json');
const readback = () => load('native-data-graph-unified-readback.json');
const name = 'CliGraphCP_6419';
const rootName = 'UnifiedssotIndividual6419__dlm';

/**
 * Turn a retrieved document into the GET shape the API answers with.
 * @param {object} saved Retrieved native document.
 * @param {string} status Graph status.
 * @returns {object} GET-shaped graph.
 */
function serverGraph(saved, status) {
  const d = structuredClone(saved.definition);
  const graph = {
    ...d,
    id: 'synthetic-graph-id',
    createdDate: '2026-11-13T17:16:04.000Z',
    kind: 'CdpDataGraphOutputRepresentation',
    status,
    version: '0',
    extendedProperties: '',
    type: d.type.toLowerCase(),
    fullRefreshConfig: { schedule: { frequency: 7, timeGranularity: 'day' } },
  };
  const node = graph.sourceObject;
  Object.assign(node, {
    id: 'synthetic-node-id',
    categoryDevName: 'Profile',
    dependency: [],
    relatedSegments: [],
  });
  node.fields = node.fields.map((field, index) => ({
    ...field,
    id: `synthetic-field-${index}`,
    name: field.devName,
    usageTag: field.usageTag.toLowerCase(),
    dependency: [],
  }));
  if (status !== 'ready') {
    for (const key of [
      'idDmoName',
      'valuesDmoName',
      'dayZeroMappingDevName',
      'dayZeroTransformDevName',
    ])
      delete graph[key];
    delete node.fragmentDMOName;
  }
  return graph;
}

const root = () => {
  const fields = ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c'];
  return {
    detail: {
      id: 'synthetic-root-id',
      name: rootName,
      dataSpaceName: 'default',
      creationType: 'Derived',
      isEnabled: true,
      fields: fields.map((field) => ({ name: field, type: 'Text' })),
    },
    metadata: [
      {
        fullName: rootName,
        mktDataModelAttributes: { dataSpaceName: 'default', creationType: 'Derived' },
        fields: fields.map((fullName) => ({ fullName, type: 'Text' })),
      },
    ],
  };
};

/**
 * Offline readers and writer; the POST stores `stored` and answers with its creating echo.
 * @param {(graph: object) => void} [change] Edits both the stored graph and the echo.
 * @returns {object} Context, client and recorded writes.
 */
function fixture(change = () => {}) {
  let graph;
  const calls = [];
  const missing = {
    status: 400,
    body: [{ errorCode: 'INTERNAL_ERROR', message: `Data Graph not found with name ${name}` }],
  };
  const context = {
    orgId: '00D000000000001AAA',
    check() {},
    root: async () => root(),
    get: async () => (graph ? { status: 200, body: structuredClone(graph) } : missing),
    metadata: async () =>
      graph
        ? {
            status: 200,
            body: {
              dataGraphMetadata: [
                {
                  developerName: name,
                  dataspaceName: 'default',
                  primaryObjectName: rootName,
                  status: 'Ready',
                },
              ],
            },
          }
        : {
            status: 404,
            body: [
              {
                errorCode: 'INTERNAL_ERROR',
                message: JSON.stringify({
                  error: '404 NOT_FOUND',
                  internalErrorCode: 'METADATA_ERROR_ENTITY_NOTFOUND',
                  message: `NOT_FOUND: DaoEntity with daoId = ${name} and tenantId = synthetic is not found`,
                }),
              },
            ],
          },
    dataSpace: async () => ({
      status: 200,
      body: {
        done: true,
        totalSize: 1,
        records: [
          {
            Id: 'synthetic-space',
            DataSpaceApiName: 'default',
            Status: 'ACTIVE',
            IsDeleted: false,
          },
        ],
      },
    }),
    inventory: async () => ({ status: 200, body: { dataGraphMetadata: [] } }),
    query: async () => ({
      status: 200,
      body: {
        done: true,
        totalSize: graph ? 1 : 0,
        records: graph
          ? [
              {
                Id: graph.id,
                DataGraphApiName: name,
                Status: 'READY',
                LastRunStatus: 'ACTIVE',
                Version: graph.version,
                DataSpaceId: 'synthetic-space',
              },
            ]
          : [],
      },
    }),
  };
  const client = {
    get: async () => assert.fail('use independent reader'),
    create: async () => {
      calls.push('POST');
      graph = serverGraph(readback(), 'ready');
      change(graph);
      const echo = serverGraph(readback(), 'creating');
      change(echo);
      return echo;
    },
    update: async () => {
      calls.push('PUT');
    },
    delete: async () => assert.fail('no delete'),
  };
  return { context, client, calls };
}

const options = () => ({
  operation: 'deploy',
  preview: false,
  confirmed: true,
  verifyInput: async () => {},
  pause: async () => {},
  progress: () => {},
});

test('a unified DMO root create is confirmed although Salesforce renames the root and fields', async () => {
  const f = fixture();
  const result = await operateNativeDataGraph(authored(), f.context, f.client, options());
  assert.deepEqual(result, { outcome: 'created', mutation: 'confirmed-created' });
  assert.deepEqual(f.calls, ['POST']);
  // The retrieved file deploys again as unchanged, without a write.
  const again = await operateNativeDataGraph(readback(), f.context, f.client, options());
  assert.deepEqual(again, { outcome: 'unchanged', mutation: 'not-attempted' });
  assert.deepEqual(f.calls, ['POST']);
});

for (const [label, change] of Object.entries({
  'a missing field': (graph) => {
    graph.sourceObject.fields.pop();
  },
  'a different field setting': (graph) => {
    graph.sourceObject.fields[1].isProjected = false;
  },
  'a different graph label': (graph) => {
    graph.label = 'Other';
  },
}))
  test(`a unified DMO root create with ${label} is not confirmed`, async () => {
    const f = fixture(change);
    const result = await operateNativeDataGraph(authored(), f.context, f.client, options());
    assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown', failedCheck: 'response' });
    assert.deepEqual(f.calls, ['POST']);
  });

test('a non-unified root keeps the exact node label comparison', async () => {
  const f = fixture((graph) => {
    graph.sourceObject.type = 'standard';
  });
  const input = authored();
  input.definition.sourceObject.type = 'standard';
  const result = await operateNativeDataGraph(input, f.context, f.client, options());
  assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown', failedCheck: 'response' });
});
