import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDataGraphDocument } from '../lib/artifacts/data-graph-document.js';
import {
  observeNativeDataGraph,
  validateNativeDataGraphDocument,
  nativeDataGraphDocumentFromResponse,
  buildNativeDataGraphUpdateRequest,
} from '../lib/artifacts/native-data-graph-document.js';
import {
  acquireNativeDataGraph,
  bindNativeGraphRoot,
  readNativeGraphReadiness,
  nativeDataGraphLifecycle,
  settleNativeDataGraph,
} from '../lib/services/native-data-graph-crd.js';

import {
  operateNativeDataGraph,
  retrieveNativeDataGraph,
} from '../lib/services/command-native-data-graph.js';
import { writeDataGraphDocument } from '../lib/artifacts/write-data-graph.js';
import {
  readDeployInputs,
  verifyNativeDataGraphInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Delete from '../lib/commands/data360/delete.js';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  apiDiagnostic,
  connectDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

const name = 'SyntheticNativeGraph';
const fields = ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'];
const document = () => ({
  schemaVersion: 1,
  kind: 'native-data-graph',
  apiVersion: '68.0',
  definition: {
    name,
    label: 'Synthetic graph',
    description: '',
    dataspaceName: 'default',
    primaryObjectName: 'ssot__Individual__dlm',
    type: 'NONE',
    sourceObject: {
      name: 'ssot__Individual__dlm',
      devName: 'AuthoredNode',
      label: 'Individual',
      jsonPath: '$',
      path: [],
      type: 'standard',
      relatedObjects: [],
      fields: fields.map((sourceFieldName, index) => ({
        devName: `Authored${index}`,
        sourceFieldName,
        dataType: 'Text',
        isKeyColumn: index === 0,
        isProjected: true,
        usageTag: index === 1 ? 'KEY_QUALIFIER' : 'NONE',
      })),
    },
  },
});
const runtime = (status = 'ready') => ({
  name,
  label: 'Synthetic graph',
  description: '',
  dataspaceName: 'default',
  id: 'synthetic-graph-id',
  createdDate: '2026-11-05T09:12:27.000Z',
  primaryObjectName: 'ssot__Individual__dlm',
  kind: 'CdpDataGraphOutputRepresentation',
  type: 'none',
  status,
  version: '0',
  extendedProperties: '',
  fullRefreshConfig: { schedule: { frequency: 1, timeGranularity: 'day' } },
  incrementalRefreshConfig: { enabled: false },
  ...(status === 'ready'
    ? {
        idDmoName: 'Synthetic_ID__dlm',
        valuesDmoName: 'Synthetic_VALUE__dlm',
        dayZeroMappingDevName: 'SyntheticMapping',
        dayZeroTransformDevName: 'SyntheticTransform',
      }
    : {}),
  sourceObject: {
    ...(status === 'ready' ? { fragmentDMOName: 'Synthetic_FRAGMENT__dlm' } : {}),
    name: 'ssot__Individual__dlm',
    label: 'Individual',
    projectedName: 'ssot__Individual__dlm',
    type: 'standard',
    jsonPath: '$',
    categoryDevName: 'Profile',
    referenceDeveloperName: 'Individual',
    id: 'synthetic-node-id',
    devName: 'ServerGeneratedNode',
    dependency: [],
    path: [],
    recencyCriteria: [],
    relatedObjects: [],
    relatedSegments: [],
    fields: fields.map((sourceFieldName, index) => ({
      id: `synthetic-field-${index}`,
      devName: `ServerGenerated${index}`,
      name: `ServerGenerated${index}`,
      sourceFieldName,
      dataType: 'Text',
      isKeyColumn: index === 0,
      isProjected: true,
      isDGRootKeyField: false,
      usageTag: index === 1 ? 'key_qualifier' : 'none',
      dependency: [],
      fieldRoles: [],
      ...(index === 0 ? { keyQualifierName: 'KQ_Id__c' } : {}),
    })),
  },
});
const root = () => ({
  detail: {
    id: 'synthetic-root-id',
    name: 'ssot__Individual__dlm',
    dataSpaceName: 'default',
    creationType: 'Standard',
    isEnabled: true,
    fields: fields.map((name, index) => ({
      name,
      type: 'Text',
      isMapped: true,
      ...(index === 0 ? { isPrimaryKey: true, keyQualifierName: 'KQ_Id' } : {}),
      usageTag: index === 1 ? 'KeyQualifier' : 'None',
    })),
  },
  metadata: [
    {
      fullName: 'ssot__Individual__dlm',
      mktDataModelAttributes: { dataSpaceName: 'default', creationType: 'Standard' },
      fields: fields.map((fullName, index) => ({
        fullName,
        type: 'Text',
        mktDataModelFieldAttributes: { primaryIndexOrder: index === 0 ? '1' : '0' },
      })),
    },
  ],
});
const missing = () => ({
  status: 400,
  body: [{ errorCode: 'INTERNAL_ERROR', message: `Data Graph not found with name ${name}` }],
});
const missingMetadata = () => ({
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
});
/**
 * Build isolated offline readers and one-attempt fake writer.
 * @returns {object} Mutable synthetic seams.
 */
function fixture() {
  let graph;
  const calls = [];
  const context = {
    orgId: '00D000000000001AAA',
    check() {},
    root: async () => root(),
    get: async () => (graph ? { status: 200, body: structuredClone(graph) } : missing()),
    metadata: async () =>
      graph
        ? {
            status: 200,
            body: {
              dataGraphMetadata: [
                {
                  developerName: name,
                  dataspaceName: 'default',
                  primaryObjectName: 'ssot__Individual__dlm',
                  status: 'Ready',
                  version: 'old',
                },
              ],
            },
          }
        : missingMetadata(),
    dataSpace: async () => ({
      status: 200,
      body: {
        done: true,
        totalSize: 1,
        records: [
          {
            Id: 'synthetic-default-space',
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
                DataSpaceId: 'synthetic-default-space',
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
      graph = runtime();
      return runtime('creating');
    },
    delete: async () => {
      calls.push('DELETE');
      graph = undefined;
    },
  };
  const guards = {
    record: async (phase) => {
      calls.push(phase);
    },
    safeToDelete: async () => true,
    pause: async () => {},
  };
  return {
    context,
    client,
    guards,
    calls,
    setGraph(value) {
      graph = value;
    },
  };
}
/**
 * Assert a property after the operation completes.
 * @param {Promise<object>} promise Operation result.
 * @param {string} key Property name.
 * @param {string} expected Required value.
 */
async function expectResult(promise, key, expected) {
  const result = await promise;
  assert.equal(result[key], expected);
}

const options = (operation = 'deploy', overrides = {}) => ({
  operation,
  preview: false,
  confirmed: true,
  verifyInput: async () => {},
  pause: async () => {},
  progress: () => {},
  ...overrides,
});

for (const reader of ['root', 'get'])
  test(`public delete deadline bounds unresolved admission ${reader} and forbids late writes`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = fixture();
    f.setGraph(runtime());
    const original = f.context[reader];
    let release;
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    f.context[reader] = () =>
      new Promise((resolve) => {
        release = async () => resolve(await original());
        entered();
      });
    const pending = operateNativeDataGraph(document(), f.context, f.client, options('delete'));
    await started;
    t.mock.timers.tick(120_000);
    assert.deepEqual(await pending, { outcome: 'blocked', mutation: 'not-attempted' });
    await release();
    // Drain late admission continuations without allowing another write or timer.
    for (let turn = 0; turn < 50; turn++) await Promise.resolve();
    assert.deepEqual(f.calls, []);
    assert.equal(t.mock.timers.tick(120_000), undefined);
  });

test('late Graph Connect evidence cannot mutate a returned failure or leak into next invocation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.context.get = () =>
    new Promise((resolve) => {
      release = () =>
        resolve(
          retainConnectDiagnostic(
            { status: 503, body: { secret: 'late-secret' } },
            connectDiagnostic(503),
          ),
        );
      entered();
    });
  const pending = operateNativeDataGraph(document(), f.context, f.client, options());
  await started;
  t.mock.timers.tick(1_800_000);
  const result = await pending;
  const message = operationDiagnostic(result, 'stopped');
  release();
  for (let turn = 0; turn < 50; turn++) await Promise.resolve();
  assert.equal(getConnectDiagnostic(result), undefined);
  assert.equal(operationDiagnostic(result, 'stopped'), message);
  const clean = fixture();
  const next = await operateNativeDataGraph(
    document(),
    clean.context,
    clean.client,
    options('deploy', { preview: true }),
  );
  assert.equal(next.outcome, 'create');
  assert.equal(getConnectDiagnostic(next), undefined);
  assert.deepEqual(f.calls, []);
});

test('public delete deadline bounds unresolved DELETE and late acknowledgement never replays', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture();
  f.setGraph(runtime());
  let release;
  let dispatched;
  const started = new Promise((resolve) => {
    dispatched = resolve;
  });
  f.client.delete = () => {
    f.calls.push('DELETE');
    dispatched();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const pending = operateNativeDataGraph(document(), f.context, f.client, options('delete'));
  await started;
  t.mock.timers.tick(120_000);
  const result = await pending;
  assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown' });
  f.setGraph(undefined);
  release();
  for (let turn = 0; turn < 50; turn++) await Promise.resolve();
  assert.deepEqual(f.calls, ['DELETE']);
  assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown' });
});

test('product Graph separate invocations create unchanged and delete without creation receipt', async () => {
  const f = fixture();
  await expectResult(
    operateNativeDataGraph(document(), f.context, f.client, options()),
    'outcome',
    'created',
  );
  const saved = await retrieveNativeDataGraph(name, f.context);
  await expectResult(
    operateNativeDataGraph(saved, f.context, f.client, options()),
    'outcome',
    'unchanged',
  );
  await expectResult(
    operateNativeDataGraph(saved, f.context, f.client, options('delete')),
    'outcome',
    'deleted',
  );
  assert.deepEqual(
    f.calls.filter((call) => ['POST', 'DELETE'].includes(call)),
    ['POST', 'DELETE'],
  );
});
for (const change of [
  (raw) => {
    delete raw.sourceObject.dependency;
  },
  (raw) => {
    raw.sourceObject.relatedSegments = ['consumer'];
  },
  (raw) => {
    raw.sourceObject.fields[0].dependency = ['consumer'];
  },
  (raw) => {
    raw.label = 'different';
  },
])
  test('product Graph mismatching or unknown dependency evidence blocks all writes', async () => {
    const f = fixture();
    const raw = runtime();
    change(raw);
    f.setGraph(raw);
    for (const operation of ['deploy', 'delete'])
      await expectResult(
        operateNativeDataGraph(document(), f.context, f.client, options(operation)),
        'outcome',
        'blocked',
      );
    assert.deepEqual(f.calls, []);
  });
test('product Graph fresh identity root and input drift block delete', async () => {
  for (const mode of ['id', 'createdDate', 'root', 'org', 'input']) {
    const f = fixture();
    f.setGraph(runtime());
    let reads = 0;
    const original = f.context.get;
    f.context.get = async () => {
      const read = await original();
      if (++reads > 1) {
        if (mode === 'id') read.body.id = 'other';
        if (mode === 'createdDate') read.body.createdDate = '2026-11-06T00:00:00Z';
        if (mode === 'org') f.context.orgId = '00D000000000002AAA';
      }
      return read;
    };
    let roots = 0;
    f.context.root = async () => {
      const r = root();
      if (++roots > 1 && mode === 'root') r.detail.id = 'other';
      return r;
    };
    const result = await operateNativeDataGraph(
      document(),
      f.context,
      f.client,
      options('delete', {
        verifyInput: async () => {
          if (mode === 'input') throw new Error('drift');
        },
      }),
    );
    assert.equal(result.outcome, 'blocked', mode);
    assert.deepEqual(f.calls, []);
  }
});
test('product Graph confirmation previews and ambiguous writes never replay', async () => {
  const f = fixture();
  f.setGraph(runtime());
  await expectResult(
    operateNativeDataGraph(
      document(),
      f.context,
      f.client,
      options('delete', { confirmed: false }),
    ),
    'outcome',
    'blocked',
  );
  await expectResult(
    operateNativeDataGraph(
      document(),
      f.context,
      f.client,
      options('delete', { preview: true, confirmed: false }),
    ),
    'outcome',
    'delete',
  );
  let writes = 0;
  f.client.delete = async () => {
    writes++;
    throw new Error('lost');
  };
  assert.deepEqual(
    await operateNativeDataGraph(document(), f.context, f.client, options('delete')),
    { outcome: 'failed', mutation: 'unknown' },
  );
  assert.equal(writes, 1);
  const c = fixture();
  c.client.create = async () => {
    writes++;
    throw new Error('lost');
  };
  await expectResult(
    operateNativeDataGraph(document(), c.context, c.client, options()),
    'mutation',
    'unknown',
  );
  assert.equal(writes, 2);
});
test('product Graph deletion waits for stale Metadata and four-source absence', async () => {
  const f = fixture();
  f.setGraph(runtime());
  let reads = 0;
  f.context.metadata = async () => (++reads < 3 ? { status: 200, body: {} } : missingMetadata());
  await expectResult(
    operateNativeDataGraph(document(), f.context, f.client, options('delete')),
    'outcome',
    'deleted',
  );
  assert.equal(reads, 3);
});

/**
 * Create a retained isolated Salesforce project for artifact/command checks.
 * @returns {Promise<string>} New OS-temp project root.
 */
async function project() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-native-graph-test-'));
  await writeFile(
    path.join(cwd, 'sfdx-project.json'),
    JSON.stringify({
      packageDirectories: [{ path: 'force-app', default: true }],
      namespace: '',
      sourceApiVersion: '68.0',
    }),
  );
  await mkdir(path.join(cwd, 'force-app', 'main', 'default'), { recursive: true });
  return cwd;
}
test('native Graph artifact roundtrip exact source selection and drift', async () => {
  const cwd = await project();
  const f = fixture();
  f.setGraph(runtime());
  const saved = await retrieveNativeDataGraph(name, f.context);
  const receipt = await writeDataGraphDocument(saved, cwd, false);
  assert.match(receipt.path, /\.native-dataGraph\.json$/u);
  const inputs = await readDeployInputs({ cwd, metadata: [`data-graph:${name}`] });
  assert.equal(inputs[0].document.kind, 'native-data-graph');
  await verifyNativeDataGraphInputDigest(inputs[0]);
  await expectResult(writeDataGraphDocument(saved, cwd, false), 'outcome', 'unchanged');
  await writeFile(receipt.path, `${JSON.stringify(saved)}\n`);
  await assert.rejects(verifyNativeDataGraphInputDigest(inputs[0]));
});
test('public native68 retrieve deploy delete route through real services with separate command invocations', async () => {
  const cwd = await project();
  const f = fixture();
  const receipt = await writeDataGraphDocument(document(), cwd, false);
  const org = {
    getConnection: (version) => {
      assert.equal(version, '68.0');
      return {};
    },
    getOrgId: () => f.context.orgId,
  };
  const run = async (Class, flags) => {
    const command = Object.create(Class.prototype);
    command.parse = async () => ({ flags });
    command.jsonEnabled = () => true;
    command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
    command.resolveTargetOrg = async () => org;
    command.resolveOrg = async () => org;
    command.resolveConnection = async () => ({});
    command.nativeGraphContext = async () => f.context;
    command.retrieveNativeGraph = retrieveNativeDataGraph;
    command.writeDataGraph = writeDataGraphDocument;
    command.nativeGraphClient = () => f.client;
    command.operateNativeGraph = (value, context, client, intent) =>
      operateNativeDataGraph(value, context, client, { ...intent, pause: async () => {} });
    return command.run();
  };
  const flags = {
    'api-version': '68.0',
    'source-dir': [receipt.path],
    preview: false,
    'allow-processing': true,
  };
  const blocked = await run(Deploy, { ...flags, 'allow-processing': false });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.result.items[0].outcome, 'blocked');
  assert.equal(blocked.result.items[0].mutation, 'not-attempted');
  const created = await run(Deploy, flags);
  assert.equal(created.status, 'success');
  assert.equal(created.result.items[0].outcome, 'created');
  assert.equal(created.result.items[0].mutation, 'confirmed-created');
  const unchanged = await run(Deploy, flags);
  assert.equal(unchanged.status, 'success');
  assert.equal(unchanged.result.items[0].outcome, 'unchanged');
  assert.equal(unchanged.result.items[0].mutation, 'not-attempted');
  for (const envelope of [blocked, created, unchanged]) {
    assert.equal(Object.hasOwn(envelope.result.items[0], 'preflight'), false);
    assert.equal(Object.hasOwn(envelope.result.items[0], 'absenceProof'), false);
  }
  const read = await run(Retrieve, {
    'api-version': '68.0',
    metadata: [`data-graph:${name}`],
    'output-dir': cwd,
    overwrite: true,
  });
  assert.equal(read.status, 'success');
  assert.equal(read.result.items[0].routes[0].transport, 'native');
  const deleted = await run(Delete, {
    'api-version': '68.0',
    metadata: [`data-graph:${name}`],
    'source-dir': receipt.path,
    'confirm-delete': true,
    preview: false,
  });
  assert.equal(deleted.status, 'success');
  assert.equal(deleted.result.items[0].mutation, 'confirmed-deleted');
  assert.match(
    deleted.diagnostics.warnings[0],
    /exhaustive external-consumer exclusion is unverified/u,
  );
  process.exitCode = 0;
});

/**
 * Build detached synthetic recursive native evidence without live org data.
 * @returns {object} Complete two-hop graph.
 */
function recursiveRuntime() {
  const graph = runtime();
  graph.version = '3';
  const address = structuredClone(graph.sourceObject);
  const account = structuredClone(graph.sourceObject);
  for (const [index, node] of [address, account].entries()) {
    node.name = index === 0 ? 'Address__dlm' : 'Account__dlm';
    node.projectedName = node.name;
    node.referenceDeveloperName = index === 0 ? 'Address' : 'Account';
    node.categoryDevName = index === 0 ? 'Related' : 'Profile';
    node.id = `node-${index}`;
    node.devName = `GeneratedNode${index}`;
    node.fragmentDMOName = `Fragment${index}__dlm`;
    node.jsonPath = `${index === 0 ? '$' : address.jsonPath}.${node.name}`;
    node.path = [
      {
        devName: `GeneratedJoin${index}`,
        fieldName: 'ssot__Id__c',
        parentFieldName: 'ssot__Id__c',
        fieldLabel: 'GET only',
        parentFieldLabel: 'GET only parent',
      },
    ];
    node.topKFilterCriteria = {
      limit: 100,
      orderCriteria: [{ fieldApiName: 'ssot__Id__c', sortOrder: 'desc' }],
    };
    for (const [fieldIndex, field] of node.fields.entries()) {
      field.id = `field-${index}-${fieldIndex}`;
      field.devName = `Generated${index}Field${fieldIndex}`;
      field.name = field.devName;
    }
  }
  address.relatedObjects = [account];
  graph.sourceObject.relatedObjects = [address];
  return graph;
}

test('recursive native document and PUT preserve full target bindings and normalize GET-only input', () => {
  const baseline = recursiveRuntime();
  const saved = nativeDataGraphDocumentFromResponse(baseline);
  assert.equal(
    saved.definition.sourceObject.relatedObjects[0].relatedObjects[0].jsonPath,
    '$.Address__dlm.Account__dlm',
  );
  const authored = structuredClone(saved);
  authored.definition.label = 'Updated label';
  authored.definition.description = 'Updated description';
  authored.definition.sourceObject.devName = 'ForeignNodeHint';
  authored.definition.sourceObject.fields[0].devName = 'ForeignFieldHint';
  authored.definition.sourceObject.relatedObjects[0].path[0].devName = 'ForeignJoinHint';
  authored.definition.sourceObject.fields.push({
    sourceFieldName: 'ssot__LastName__c',
    dataType: 'Text',
    isKeyColumn: false,
    isProjected: true,
    usageTag: 'NONE',
    devName: 'ForeignNewHint',
  });
  const request = buildNativeDataGraphUpdateRequest(baseline, authored);
  assert.equal(request.sourceObject.devName, baseline.sourceObject.devName);
  assert.equal(request.sourceObject.fields[0].devName, baseline.sourceObject.fields[0].devName);
  assert.equal(request.sourceObject.fields.at(-1).devName, undefined);
  assert.equal(request.label, 'Updated label');
  assert.equal(request.description, 'Updated description');
  assert.equal(request.fullRefreshConfig.schedule.timeGranularity, 'Day');
  const child = request.sourceObject.relatedObjects[0];
  assert.deepEqual(child.path, [
    { devName: 'GeneratedJoin0', fieldName: 'ssot__Id__c', parentFieldName: 'ssot__Id__c' },
  ]);
  assert.equal(child.topKFilterCriteria.orderCriteria[0].sortOrder, 'DESC');
  assert.equal(child.relatedObjects[0].fragmentDMOName, 'Fragment1__dlm');
  assert.equal(child.fields[0].keyQualifierName, 'KQ_Id__c');
  const omitted = structuredClone(saved);
  omitted.definition.sourceObject.fields.pop();
  omitted.definition.sourceObject.relatedObjects = [];
  assert.deepEqual(buildNativeDataGraphUpdateRequest(baseline, omitted), saved.definition);
  assert.equal(observeNativeDataGraph(baseline, saved).target.version, '3');
  assert.deepEqual(nativeDataGraphDocumentFromResponse(baseline), saved);
});

test('native PUT admits genuinely new recursive children without adopting generated hints', () => {
  const baseline = runtime();
  const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
  const request = buildNativeDataGraphUpdateRequest(baseline, desired);
  const child = request.sourceObject.relatedObjects[0];
  assert.equal(child.devName, undefined);
  assert.equal(child.fragmentDMOName, undefined);
  assert.equal(child.path[0].devName, undefined);
  assert.equal(child.relatedObjects[0].fields[0].devName, undefined);
  assert.equal(child.relatedObjects[0].path[0].parentFieldName, 'ssot__Id__c');
});

for (const [label, change] of Object.entries({
  name: (d) => {
    d.definition.name = 'Different';
  },
  root: (d) => {
    d.definition.primaryObjectName = 'Other__dlm';
  },
  qualifier: (d) => {
    d.definition.sourceObject.fields[0].keyQualifierName = 'Other';
  },
  key: (d) => {
    d.definition.sourceObject.fields[0].isKeyColumn = false;
  },
  type: (d) => {
    d.definition.sourceObject.fields[2].dataType = 'Number';
  },
  schedule: (d) => {
    d.definition.fullRefreshConfig.schedule.frequency = 7;
  },
  path: (d) => {
    d.definition.sourceObject.relatedObjects[0].path[0].parentFieldName = 'Missing';
  },
  duplicate: (d) => {
    d.definition.sourceObject.fields.push(d.definition.sourceObject.fields[2]);
  },
  setting: (d) => {
    d.definition.sourceObject.relatedObjects[0].topKFilterCriteria.limit = 101;
  },
  getter: (d) => {
    Object.defineProperty(d.definition.sourceObject, 'label', {
      enumerable: true,
      get: () => assert.fail('getter'),
    });
  },
}))
  test(`native PUT rejects unsafe ${label} before payload construction`, () => {
    const baseline = recursiveRuntime();
    const desired = nativeDataGraphDocumentFromResponse(baseline);
    change(desired);
    assert.throws(() => buildNativeDataGraphUpdateRequest(baseline, desired));
  });

for (const [label, change] of Object.entries({
  top: (g) => {
    g.unqualified = true;
  },
  duplicateId: (g) => {
    g.sourceObject.fields[1].id = g.sourceObject.fields[0].id;
  },
  node: (g) => {
    g.sourceObject.unqualified = true;
  },
  field: (g) => {
    g.sourceObject.fields[0].unqualified = true;
  },
  path: (g) => {
    g.sourceObject.relatedObjects[0].path[0].unqualified = true;
  },
  recency: (g) => {
    g.sourceObject.recencyCriteria = [{ unqualified: true }];
  },
}))
  test(`native GET stops on unknown nonvolatile ${label} rather than dropping it`, () => {
    const baseline = recursiveRuntime();
    change(baseline);
    assert.throws(() => nativeDataGraphDocumentFromResponse(baseline));
  });

/**
 * Supply fake-clock lifecycle with an independently regenerated server response.
 * @param {object} [graph] Existing target.
 * @returns {object} Offline update seams.
 */
function updateFixture(graph = recursiveRuntime()) {
  const f = fixture();
  f.setGraph(graph);
  let clock = 0;
  const waits = [];
  const progress = [];
  const payloads = [];
  const oldGet = f.context.get;
  const events = [];
  for (const key of ['get', 'metadata', 'query', 'root', 'dataSpace']) {
    const original = f.context[key];
    f.context[key] = async (...arguments_) => {
      events.push(key);
      return original(...arguments_);
    };
  }
  f.client.update = async (apiName, payload) => {
    events.push('PUT');
    f.calls.push('PUT');
    assert.equal(apiName, name);
    payloads.push(structuredClone(payload));
    const currentRead = await oldGet();
    const current = currentRead.body;
    current.label = payload.label;
    current.description = payload.description;
    current.version = String(Number(current.version) + 1);
    /**
     * Model generated properties only for new fields/nodes.
     * @param {object} request Dispatched node.
     * @param {object} actual Current server node.
     */
    function merge(request, actual) {
      for (const field of request.fields) {
        if (!actual.fields.some((entry) => entry.sourceFieldName === field.sourceFieldName)) {
          const index = actual.fields.length;
          actual.fields.push({
            ...field,
            id: `${actual.id}-new-${index}`,
            devName: `NewField${index}`,
            name: `NewField${index}`,
            dependency: [],
          });
        }
      }
      for (const child of request.relatedObjects) {
        const target = actual.relatedObjects.find((entry) => entry.jsonPath === child.jsonPath);
        if (target) merge(child, target);
      }
    }
    merge(payload.sourceObject, current.sourceObject);
    f.setGraph(current);
    return { accepted: true };
  };
  return {
    ...f,
    waits,
    progress,
    payloads,
    events,
    get clock() {
      return clock;
    },
    setClock(value) {
      clock = value;
    },
    intent: options('deploy', {
      now: () => clock,
      pause: async (milliseconds) => {
        waits.push(milliseconds);
        clock += milliseconds;
      },
      progress: (message) => progress.push(message),
    }),
  };
}

for (const json of [false, true])
  test(`public recursive Graph retrieve/edit/preview/update/repeat keeps ${json ? 'JSON' : 'human'} output truthful`, async (t) => {
    const cwd = await project();
    const f = updateFixture();
    const saved = await retrieveNativeDataGraph(name, f.context);
    assert.deepEqual(saved, nativeDataGraphDocumentFromResponse(recursiveRuntime()));
    assert.equal(saved.definition.sourceObject.devName, 'ServerGeneratedNode');
    assert.equal(saved.definition.sourceObject.relatedObjects[0].relatedObjects.length, 1);
    const receipt = await writeDataGraphDocument(saved, cwd, false);
    saved.definition.description = 'Public recursive update';
    await writeFile(receipt.path, `${JSON.stringify(saved)}\n`);
    const stdout = [];
    const stderr = [];
    t.mock.method(process.stdout, 'write', (message) => {
      stdout.push(String(message));
      return true;
    });
    t.mock.method(process.stderr, 'write', (message) => {
      stderr.push(String(message));
      return true;
    });
    const budgets = [];
    const run = async (flags = {}) => {
      const command = Object.create(Deploy.prototype);
      command.parse = async () => ({
        flags: {
          'api-version': '68.0',
          'source-dir': [receipt.path],
          preview: false,
          'allow-processing': true,
          ...flags,
        },
      });
      // Exercise inherited JSON detection and real output methods, not logger stubs.
      command.argv = json ? ['--json'] : [];
      command.config = {};
      assert.equal(command.jsonEnabled(), json);
      command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
      command.resolveTargetOrg = async () => ({ getConnection: () => ({}) });
      command.nativeGraphContext = async () => f.context;
      command.nativeGraphClient = () => f.client;
      command.operateNativeGraph = (value, context, client, intent) => {
        budgets.push(intent.waitTimeoutSeconds);
        return operateNativeDataGraph(value, context, client, {
          ...intent,
          now: f.intent.now,
          pause: f.intent.pause,
        });
      };
      const result = await command.run();
      if (command.jsonEnabled()) command.logJson(result);
      return result;
    };
    const preview = await run({ preview: true, 'allow-processing': false });
    assert.equal(preview.result.items[0].outcome, 'update');
    assert.equal(preview.result.items[0].target, 'present');
    assert.equal(f.calls.length, 0);
    const get = f.context.get;
    let reads = 0;
    f.context.get = async () => {
      if (++reads === 2)
        throw retainConnectDiagnostic(new Error('private-secret'), connectDiagnostic(429, {}));
      return get();
    };
    const updated = await run({ 'wait-timeout': 45 });
    f.context.get = get;
    assert.equal(updated.status, 'success');
    assert.equal(updated.result.items[0].outcome, 'updated');
    assert.equal(updated.result.items[0].mutation, 'confirmed-updated');
    assert.deepEqual(f.calls, ['PUT']);
    assert.deepEqual(
      f.payloads[0].sourceObject.relatedObjects,
      buildNativeDataGraphUpdateRequest(recursiveRuntime(), saved).sourceObject.relatedObjects,
    );
    const unchanged = await run({ 'allow-processing': false });
    assert.equal(unchanged.result.items[0].outcome, 'unchanged');
    assert.equal(unchanged.result.items[0].mutation, 'not-attempted');
    assert.equal(f.calls.length, 1);
    assert.deepEqual(budgets, [1800, 45, 1800]);
    assert.match(stderr[0], /seconds to many minutes, up to 30 minutes/u);
    assert.ok(stderr.some((message) => /GET HTTP429; elapsed 0s; next wait 20s/u.test(message)));
    assert.equal(stderr.join('').includes('private-secret'), false);
    assert.equal(JSON.stringify(updated).includes('confirmed-updated'), true);
    if (json) {
      assert.deepEqual(
        stdout.map((message) => JSON.parse(message)),
        [preview, updated, unchanged],
      );
      assert.equal(stdout.join('').includes('Data Graph processing'), false);
    } else {
      assert.ok(stdout.some((message) => /Planned update:/u.test(message)));
      assert.ok(stdout.some((message) => /Updated: data-graph:.*confirmed-updated/u.test(message)));
      assert.ok(stdout.some((message) => /Unchanged:/u.test(message)));
    }
  });

for (const mode of ['timeout', 'preservation', 429, 503])
  test(`public Graph ${mode} failure keeps progress and mutation evidence in JSON`, async (t) => {
    const cwd = await project();
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'Public failure check';
    const receipt = await writeDataGraphDocument(desired, cwd, false);
    if (mode === 'timeout') {
      const query = f.context.query;
      f.context.query = async () => {
        const read = await query();
        read.body.records[0].LastRunStatus = 'PROCESSING';
        return read;
      };
    } else if (mode === 'preservation') {
      const update = f.client.update;
      f.client.update = async (...arguments_) => {
        const result = await update(...arguments_);
        const read = await f.context.get();
        read.body.sourceObject.relatedObjects = [];
        f.setGraph(read.body);
        return result;
      };
    } else {
      f.client.update = async () => {
        f.calls.push('PUT');
        throw retainConnectDiagnostic(new Error('private-secret'), connectDiagnostic(mode, {}));
      };
    }
    const stderr = [];
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: {
        'api-version': '68.0',
        'source-dir': [receipt.path],
        preview: false,
        'allow-processing': true,
        'wait-timeout': 45,
      },
    });
    command.argv = ['--json'];
    command.config = {};
    assert.equal(command.jsonEnabled(), true);
    t.mock.method(process.stdout, 'write', () => assert.fail('JSON progress must not use stdout'));
    t.mock.method(process.stderr, 'write', (message) => {
      stderr.push(String(message));
      return true;
    });
    command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
    command.resolveTargetOrg = async () => ({ getConnection: () => ({}) });
    command.nativeGraphContext = async () => f.context;
    command.nativeGraphClient = () => f.client;
    command.operateNativeGraph = (value, context, client, intent) =>
      operateNativeDataGraph(value, context, client, {
        ...intent,
        now: f.intent.now,
        pause: f.intent.pause,
      });
    const result = await command.run();
    assert.equal(result.status, mode === 'timeout' ? 'blocked' : 'failed');
    assert.equal(result.result.items[0].mutation, mode === 'timeout' ? 'not-attempted' : 'unknown');
    assert.deepEqual(f.calls, mode === 'timeout' ? [] : ['PUT']);
    assert.match(stderr[0], /seconds to many minutes/u);
    if (mode === 'timeout') assert.equal(f.clock, 45_000);
    if (typeof mode === 'number')
      assert.match(result.diagnostics.errors[0].message, new RegExp(String(mode), 'u'));
    assert.equal(JSON.stringify(result).includes('private-secret'), false);
    process.exitCode = 0;
  });

for (const selection of ['other-family', 'git'])
  test(`public Graph wait budget rejects ${selection} before auth or Git work`, async () => {
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: {
        'api-version': '68.0',
        preview: true,
        'wait-timeout': 45,
        ...(selection === 'git' ? { 'changed-since': 'HEAD' } : {}),
      },
    });
    command.jsonEnabled = () => true;
    command.resolveInputs = async () => [{ path: 'synthetic', document: { kind: 'dmo' } }];
    command.selectGitInputs = async () => assert.fail('unsupported wait flag precedes Git work');
    command.resolveTargetOrg = async () => assert.fail('unsupported wait flag precedes auth');
    const result = await command.run();
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_WAIT_TIMEOUT_SCOPE');
    process.exitCode = 0;
  });

for (const budget of [0, -1, 1.5, Number.POSITIVE_INFINITY])
  test(`public Graph invalid wait budget ${budget} blocks before auth`, async () => {
    const cwd = await project();
    const receipt = await writeDataGraphDocument(document(), cwd, false);
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: {
        'api-version': '68.0',
        'source-dir': [receipt.path],
        preview: true,
        'wait-timeout': budget,
      },
    });
    command.jsonEnabled = () => true;
    command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
    command.resolveTargetOrg = async () => assert.fail('local admission must precede auth');
    const result = await command.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_WAIT_TIMEOUT_SCOPE');
    process.exitCode = 0;
  });

test('native update fresh tuple binds default once and retains complete recursive target identities', async () => {
  const graph = recursiveRuntime();
  const f = updateFixture(graph);
  const desired = nativeDataGraphDocumentFromResponse(graph);
  desired.definition.description = 'New description';
  desired.definition.sourceObject.fields.push({
    sourceFieldName: 'ssot__LastName__c',
    dataType: 'Text',
    isKeyColumn: false,
    isProjected: true,
    usageTag: 'NONE',
  });
  const result = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
  assert.deepEqual(result, { outcome: 'updated', mutation: 'confirmed-updated' });
  assert.deepEqual(f.calls, ['PUT']);
  assert.deepEqual(f.events.slice(f.events.indexOf('PUT') - 3, f.events.indexOf('PUT')), [
    'get',
    'metadata',
    'query',
  ]);
  assert.equal(f.events.filter((event) => event === 'dataSpace').length, 1);
  assert.deepEqual(f.waits, [20_000]);
  assert.match(
    f.progress[0],
    /seconds to many minutes, up to 30 minutes.*objects, fields, data volume and service load/u,
  );
  assert.equal(f.payloads[0].sourceObject.relatedObjects[0].path[0].devName, 'GeneratedJoin0');
  assert.equal(
    f.payloads[0].sourceObject.relatedObjects[0].relatedObjects[0].fragmentDMOName,
    'Fragment1__dlm',
  );
  const repeat = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
  assert.deepEqual(repeat, { outcome: 'unchanged', mutation: 'not-attempted' });
  assert.equal(f.calls.length, 1);
});

for (const mode of ['inactive', 'metadata', 'editing'])
  test(`native update GET-only ${mode} waits beyond legacy limits with progress every retry`, async () => {
    const graph = runtime();
    const f = updateFixture(graph);
    const desired = document();
    desired.definition.description = 'change';
    const query = f.context.query;
    const metadata = f.context.metadata;
    const get = f.context.get;
    f.context.query = async () => {
      const r = await query();
      if (mode === 'inactive' && f.clock < 400_000)
        r.body.records[0].LastRunStatus = 'ACTIVE_VERSION_REFRESH';
      return r;
    };
    f.context.metadata = async () => {
      const r = await metadata();
      if (mode === 'metadata' && f.clock < 400_000)
        r.body.dataGraphMetadata[0].status = 'Processing';
      return r;
    };
    f.context.get = async () => {
      const r = await get();
      if (mode === 'editing' && f.clock < 400_000) r.body.status = 'editing_post_sync';
      return r;
    };
    const result = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
    assert.equal(result.outcome, 'updated');
    assert.equal(f.clock, 420_000);
    assert.equal(f.calls.length, 1);
    assert.equal(f.waits.length, 21);
    assert.ok(f.waits.every((wait) => wait === 20_000));
    assert.equal(f.progress.length, 22);
  });

for (const [mode, change] of Object.entries({
  missing: (r) => {
    r.body.records = [];
    r.body.totalSize = 0;
  },
  ambiguous: (r) => {
    r.body.records.push(r.body.records[0]);
    r.body.totalSize = 2;
  },
  incomplete: (r) => {
    r.body.done = false;
  },
  name: (r) => {
    r.body.records[0].DataSpaceApiName = 'other';
  },
  inactive: (r) => {
    r.body.records[0].Status = 'INACTIVE';
  },
  deleted: (r) => {
    r.body.records[0].IsDeleted = true;
  },
  error: (r) => {
    r.status = 403;
  },
}))
  test(`native update authoritative dataspace ${mode} blocks before PUT`, async () => {
    const f = updateFixture();
    const original = f.context.dataSpace;
    f.context.dataSpace = async () => {
      const r = await original();
      change(r);
      return r;
    };
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, f.intent), {
      outcome: 'blocked',
      mutation: 'not-attempted',
    });
    assert.deepEqual(f.calls, []);
  });

for (const mode of [
  'id',
  'createdDate',
  'baseline',
  'space',
  'org',
  'root',
  'input',
  'queryVersion',
  'metadataName',
])
  test(`native update final ${mode} drift prevents write`, async () => {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    const get = f.context.get;
    let reads = 0;
    f.context.get = async () => {
      const r = await get();
      if (++reads > 1) {
        if (mode === 'id') r.body.id = 'other';
        if (mode === 'createdDate') r.body.createdDate = '2026-11-06T00:00:00Z';
        if (mode === 'baseline') r.body.description = 'concurrent edit';
        if (mode === 'org') f.context.orgId = '00D000000000002AAA';
      }
      return r;
    };
    const query = f.context.query;
    f.context.query = async () => {
      const r = await query();
      if (mode === 'space') r.body.records[0].DataSpaceId = 'other';
      if (mode === 'queryVersion') r.body.records[0].Version = '9';
      return r;
    };
    const metadata = f.context.metadata;
    f.context.metadata = async () => {
      const r = await metadata();
      if (mode === 'metadataName') r.body.dataGraphMetadata[0].developerName = 'other';
      return r;
    };
    const rootRead = f.context.root;
    let roots = 0;
    f.context.root = async () => {
      const r = await rootRead();
      if (++roots > 1 && mode === 'root') r.detail.id = 'other';
      return r;
    };
    let verifies = 0;
    const intent = {
      ...f.intent,
      verifyInput: async () => {
        if (++verifies > 1 && mode === 'input') throw new Error('changed');
      },
    };
    assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, intent), {
      outcome: 'blocked',
      mutation: 'not-attempted',
    });
    assert.deepEqual(f.calls, []);
  });

for (const seconds of [45, 1800])
  test(`native update ${seconds}s invocation budget is paced and never dispatches at deadline`, async () => {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    const query = f.context.query;
    f.context.query = async () => {
      const r = await query();
      r.body.records[0].LastRunStatus = 'PROCESSING';
      return r;
    };
    const intent = seconds === 1800 ? f.intent : { ...f.intent, waitTimeoutSeconds: seconds };
    assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, intent), {
      outcome: 'blocked',
      mutation: 'not-attempted',
    });
    assert.equal(f.clock, seconds * 1000);
    assert.ok(f.waits.slice(0, -1).every((wait) => wait === 20_000));
    assert.deepEqual(f.calls, []);
  });

for (const status of [429, 503])
  test(`native update PUT HTTP${status} is single-attempt unknown with private diagnostics`, async () => {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    const evidence = connectDiagnostic(status, { 'retry-after': '31' });
    f.client.update = async () => {
      f.calls.push('PUT');
      throw retainConnectDiagnostic(new Error('private-secret'), evidence);
    };
    const result = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
    assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown' });
    assert.deepEqual(getConnectDiagnostic(result), evidence);
    assert.deepEqual(f.calls, ['PUT']);
    assert.equal(JSON.stringify(result).includes('private-secret'), false);
  });

test('native update safe GET retry honors Retry-After without retrying PUT', async () => {
  const f = updateFixture();
  const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
  desired.definition.description = 'change';
  const get = f.context.get;
  let reads = 0;
  f.context.get = async () =>
    ++reads === 2
      ? retainConnectDiagnostic(
          { status: 429, body: [] },
          connectDiagnostic(429, { 'retry-after': '31' }),
        )
      : get();
  const result = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
  assert.equal(result.outcome, 'updated');
  assert.equal(f.waits[0], 31_000);
  assert.deepEqual(f.calls, ['PUT']);
});

for (const stage of ['get', 'PUT'])
  test(`native update deadline during unresolved ${stage} blocks late continuation and replay`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    let entered;
    let release;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    if (stage === 'get') {
      const get = f.context.get;
      let reads = 0;
      f.context.get = async () => {
        const response = await get();
        if (++reads === 2)
          return new Promise((resolve) => {
            release = () => resolve(response);
            entered();
          });
        return response;
      };
    } else {
      f.client.update = () => {
        f.calls.push('PUT');
        entered();
        return new Promise((resolve) => {
          release = resolve;
        });
      };
    }
    const pending = operateNativeDataGraph(desired, f.context, f.client, {
      ...f.intent,
      waitTimeoutSeconds: 40,
    });
    await started;
    f.setClock(40_000);
    t.mock.timers.tick(40_000);
    const result = await pending;
    assert.deepEqual(
      result,
      stage === 'get'
        ? { outcome: 'blocked', mutation: 'not-attempted' }
        : { outcome: 'failed', mutation: 'unknown' },
    );
    release();
    for (let turn = 0; turn < 50; turn++) await Promise.resolve();
    assert.deepEqual(f.calls, stage === 'get' ? [] : ['PUT']);
    assert.equal(getConnectDiagnostic(result), undefined);
  });

test('native update revalidation accepts reordered root field inventories without losing properties', async () => {
  const f = updateFixture();
  const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
  desired.definition.description = 'change';
  let reads = 0;
  f.context.root = async () => {
    const value = root();
    value.detail.fields.push(
      { name: 'ssot__BirthDate__c', type: 'DateTime', isMapped: true },
      { name: 'ssot__BirthDt__c', type: 'Date' },
    );
    value.metadata[0].fields.push(
      { fullName: 'ssot__BirthDate__c', type: 'DateTime' },
      { fullName: 'ssot__BirthDt__c', type: 'Date' },
    );
    if (++reads > 1) {
      value.detail.fields.reverse();
      value.metadata[0].fields.reverse();
    }
    return value;
  };
  assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, f.intent), {
    outcome: 'updated',
    mutation: 'confirmed-updated',
  });
  assert.deepEqual(f.calls, ['PUT']);
});

for (const mode of ['property', 'duplicate'])
  test(`native update root inventory ${mode} still blocks revalidation`, async () => {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    let reads = 0;
    f.context.root = async () => {
      const value = root();
      value.detail.fields.push({ name: 'ssot__BirthDt__c', type: 'Date' });
      if (++reads > 1) {
        value.detail.fields.reverse();
        if (mode === 'property') value.detail.fields[0].unqualified = true;
        else value.detail.fields.push({ name: 'ssot__BirthDt__c', type: 'Date' });
      }
      return value;
    };
    assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, f.intent), {
      outcome: 'blocked',
      mutation: 'not-attempted',
    });
    assert.deepEqual(f.calls, []);
  });

for (const stage of ['root', 'get'])
  test(`native update long deadline chunks unresolved admission ${stage} without late PUT`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    let entered;
    let release;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const original = f.context[stage];
    f.context[stage] = async (...arguments_) => {
      const response = await original(...arguments_);
      return new Promise((resolve) => {
        release = () => resolve(response);
        entered();
      });
    };
    let settled = false;
    const pending = operateNativeDataGraph(desired, f.context, f.client, {
      ...f.intent,
      waitTimeoutSeconds: 2_147_484,
    }).then((result) => {
      settled = true;
      return result;
    });
    await started;
    const tick = async (milliseconds) => {
      f.setClock(f.clock + milliseconds);
      t.mock.timers.tick(milliseconds);
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    };
    await tick(1);
    assert.equal(settled, false);
    await tick(2_147_483_646);
    assert.equal(settled, false);
    await tick(352);
    assert.equal(settled, false);
    await tick(1);
    assert.deepEqual(await pending, { outcome: 'blocked', mutation: 'not-attempted' });
    release();
    for (let turn = 0; turn < 50; turn++) await Promise.resolve();
    await tick(2_147_484_000);
    assert.deepEqual(f.calls, []);
  });

test('native update settlement admits six-minute editing and confirms only preserved independent bindings', async () => {
  const f = updateFixture();
  const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
  desired.definition.description = 'change';
  const get = f.context.get;
  f.context.get = async () => {
    const r = await get();
    if (f.calls.length > 0 && f.clock < 400_000) r.body.status = 'editing_no_version_update';
    return r;
  };
  const result = await operateNativeDataGraph(desired, f.context, f.client, f.intent);
  assert.deepEqual(result, { outcome: 'updated', mutation: 'confirmed-updated' });
  assert.equal(f.clock, 400_000);
  assert.equal(f.calls.length, 1);
});

for (const mode of ['top', 'field', 'path', 'identity', 'malformed'])
  test(`native update independently rejects postPUT ${mode} drift with one write`, async () => {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    const get = f.context.get;
    f.context.get = async () => {
      const r = await get();
      if (f.calls.length > 0) {
        if (mode === 'top') r.body.idDmoName = 'Different__dlm';
        if (mode === 'identity') r.body.id = 'different';
        if (mode === 'malformed') r.body.unknown = 'unqualified';
        if (mode === 'path')
          r.body.sourceObject.relatedObjects[0].path[0].devName = 'DifferentJoin';
        if (mode === 'field') {
          r.body.sourceObject.fields[0].devName = 'DifferentField';
          r.body.sourceObject.fields[0].name = 'DifferentField';
        }
      }
      return r;
    };
    assert.deepEqual(await operateNativeDataGraph(desired, f.context, f.client, f.intent), {
      outcome: 'failed',
      mutation: 'unknown',
    });
    assert.deepEqual(f.calls, ['PUT']);
  });

test('native update preview and missing acknowledgement never dispatch', async () => {
  for (const preview of [false, true]) {
    const f = updateFixture();
    const desired = nativeDataGraphDocumentFromResponse(recursiveRuntime());
    desired.definition.description = 'change';
    const result = await operateNativeDataGraph(desired, f.context, f.client, {
      ...f.intent,
      preview,
      confirmed: false,
    });
    assert.equal(result.outcome, preview ? 'update' : 'blocked');
    assert.deepEqual(f.calls, []);
  }
});

test('native artifact is distinct, detached and binds generated names', () => {
  const input = document();
  const checked = validateNativeDataGraphDocument(input);
  input.definition.label = 'changed';
  assert.equal(checked.definition.label, 'Synthetic graph');
  assert.throws(() => validateDataGraphDocument(checked));
  for (const change of [
    (d) => {
      d.kind = 'data-graph';
    },
    (d) => {
      d.apiVersion = '67.0';
    },
    (d) => {
      d.definition.dataSpaceName = 'default';
    },
  ]) {
    const d = document();
    change(d);
    assert.throws(() => validateNativeDataGraphDocument(d));
  }
  const hostile = document();
  Object.defineProperty(hostile, 'definition', {
    enumerable: true,
    get() {
      return assert.fail('getter invoked');
    },
  });
  assert.throws(() => validateNativeDataGraphDocument(hostile));
  const observed = observeNativeDataGraph(runtime(), checked);
  assert.equal(observed.target.sourceObject.devName, 'ServerGeneratedNode');
});
for (const [label, change] of Object.entries({
  qualifier: (g) => {
    g.sourceObject.fields[0].keyQualifierName = 'Other';
  },
  order: (g) => {
    g.sourceObject.fields.reverse();
  },
  dependency: (g) => {
    g.sourceObject.dependency = ['external'];
  },
  segment: (g) => {
    g.sourceObject.relatedSegments = ['external'];
  },
  projection: (g) => {
    g.sourceObject.fields[2].isProjected = false;
  },
  schedule: (g) => {
    g.fullRefreshConfig.schedule.frequency = 7;
  },
}))
  test(`native observation rejects ${label}`, () => {
    const g = runtime();
    change(g);
    assert.throws(() => observeNativeDataGraph(g, document()));
  });
for (const [label, change] of Object.entries({
  disabled: (r) => {
    r.detail.isEnabled = false;
  },
  unmapped: (r) => {
    r.detail.fields[2].isMapped = false;
  },
  qualifier: (r) => {
    r.detail.fields[0].keyQualifierName = 'Wrong';
  },
  primary: (r) => {
    r.metadata[0].fields[1].mktDataModelFieldAttributes.primaryIndexOrder = '1';
  },
  scope: (r) => {
    r.metadata[0].mktDataModelAttributes.dataSpaceName = 'other';
  },
  duplicate: (r) => {
    r.detail.fields.push(r.detail.fields[0]);
  },
}))
  test(`native root rejects ${label}`, async () => {
    const f = fixture();
    const r = root();
    change(r);
    f.context.root = async () => r;
    await assert.rejects(bindNativeGraphRoot(f.context));
  });

test('absence requires all four independent checks; permission errors never prove absence', async () => {
  const f = fixture();
  await expectResult(acquireNativeDataGraph(f.context, document()), 'state', 'absent');
  for (const status of [400, 401, 403, 404, 429, 500])
    await expectResult(
      acquireNativeDataGraph({ ...f.context, get: async () => ({ status, body: [] }) }, document()),
      'state',
      'unknown',
    );
  for (const reader of ['metadata', 'inventory', 'query'])
    await expectResult(
      acquireNativeDataGraph(
        { ...f.context, [reader]: async () => ({ status: 403, body: {} }) },
        document(),
      ),
      'state',
      'unknown',
    );
  await expectResult(
    acquireNativeDataGraph(
      { ...f.context, metadata: async () => ({ status: 200, body: {} }) },
      document(),
    ),
    'state',
    'pending',
  );
  await expectResult(
    acquireNativeDataGraph(
      {
        ...f.context,
        inventory: async () => ({
          status: 200,
          body: { dataGraphMetadata: [{ developerName: name, dataspaceName: 'default' }] },
        }),
      },
      document(),
    ),
    'state',
    'pending',
  );
});
test('creating metadata404 is not absence; settlement waits for ready and stale deletion metadata', async () => {
  const f = fixture();
  f.setGraph(runtime('creating'));
  await expectResult(acquireNativeDataGraph(f.context, document()), 'state', 'present');
  let reads = 0;
  f.context.get = async () => ({
    status: 200,
    body: runtime(++reads === 3 ? 'ready' : 'creating'),
  });
  await expectResult(
    settleNativeDataGraph(f.context, document(), 'ready', async () => {}),
    'state',
    'present',
  );
  assert.equal(reads, 3);
  reads = 0;
  f.setGraph(undefined);
  f.context.get = async () => missing();
  f.context.metadata = async () => (++reads < 3 ? { status: 200, body: {} } : missingMetadata());
  await expectResult(
    settleNativeDataGraph(f.context, document(), 'absent', async () => {}),
    'state',
    'absent',
  );
  f.context.get = async () => ({ status: 200, body: runtime('creating') });
  reads = 0;
  await expectResult(
    settleNativeDataGraph(f.context, document(), 'ready', async () => {
      reads++;
    }),
    'state',
    'unknown',
  );
  assert.equal(reads, 11);
  assert.deepEqual(f.calls, []);
});
test('run-owned CRD journals one POST/DELETE; cannot adopt names or replay', async () => {
  const f = fixture();
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  assert.equal(lifecycle.update, undefined);
  await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
  await expectResult(lifecycle.create(false), 'mutation', 'not-attempted');
  const created = await lifecycle.create(true);
  assert.equal(created.outcome, 'created');
  assert.equal(created.receipt.rootId, 'synthetic-root-id');
  created.receipt.id = 'tampered';
  await expectResult(lifecycle.create(true), 'outcome', 'blocked');
  await expectResult(lifecycle.delete(true), 'outcome', 'deleted');
  await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
  assert.deepEqual(f.calls, ['create-attempt', 'POST', 'created', 'delete-attempt', 'DELETE']);
});
for (const [label, change] of Object.entries({
  identity: (f) => {
    const g = runtime();
    g.id = 'other';
    f.setGraph(g);
  },
  content: (f) => {
    const g = runtime();
    g.extraDependency = ['external'];
    f.setGraph(g);
  },
  generatedName: (f) => {
    const g = runtime();
    g.sourceObject.devName = 'Other';
    f.setGraph(g);
  },
  root: (f) => {
    f.context.root = async () => {
      const r = root();
      r.detail.id = 'other';
      return r;
    };
  },
  org: (f) => {
    f.context.orgId = '00D000000000002AAA';
  },
  unsafe: (f) => {
    f.guards.safeToDelete = async () => false;
  },
}))
  test(`owned deletion blocks ${label} drift`, async () => {
    const f = fixture();
    const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
    await expectResult(lifecycle.create(true), 'outcome', 'created');
    change(f);
    await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
    assert.equal(f.calls.includes('DELETE'), false);
  });
test('create refuses independent target binding mismatch and deadline overrun', async () => {
  const f = fixture();
  f.client.create = async () => {
    f.calls.push('POST');
    const graph = runtime();
    graph.sourceObject.fields[2].devName = 'DifferentGeneratedName';
    graph.sourceObject.fields[2].name = 'DifferentGeneratedName';
    f.setGraph(graph);
    return runtime('creating');
  };
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  await expectResult(lifecycle.create(true), 'outcome', 'unknown');
  await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
  const late = fixture();
  let clock = 0;
  late.guards.now = () => clock;
  late.guards.record = async () => {
    clock = 120_001;
  };
  await expectResult(
    nativeDataGraphLifecycle(document(), late.context, late.client, late.guards).create(true),
    'outcome',
    'blocked',
  );
  assert.deepEqual(late.calls, []);
});

for (const status of [429, 503]) {
  const evidence = connectDiagnostic(status, { 'retry-after': '11' });
  for (const reader of ['get', 'metadata', 'inventory'])
    for (const thrown of [false, true])
      test(`Graph acquisition ${reader} HTTP${status} thrown=${thrown} retains safe evidence without writes`, async () => {
        const f = fixture();
        f.context[reader] = async () => {
          if (thrown) throw retainConnectDiagnostic(new Error('private-secret'), evidence);
          return retainConnectDiagnostic({ status, body: { secret: 'private-secret' } }, evidence);
        };
        const acquired = await acquireNativeDataGraph(f.context, document());
        assert.equal(acquired.state, 'unknown');
        assert.deepEqual(getConnectDiagnostic(acquired), evidence);
        const settled = await settleNativeDataGraph(f.context, document(), 'ready', async () => {});
        assert.deepEqual(getConnectDiagnostic(settled), evidence);
        const result = await operateNativeDataGraph(document(), f.context, f.client, options());
        assert.deepEqual(result, { outcome: 'blocked', mutation: 'not-attempted' });
        assert.deepEqual(getConnectDiagnostic(result), evidence);
        assert.equal(operationDiagnostic(result, '').includes('private-secret'), false);
        assert.deepEqual(f.calls, []);
        const clean = fixture();
        assert.equal(
          getConnectDiagnostic(await acquireNativeDataGraph(clean.context, document())),
          undefined,
        );
      });
  for (const operation of ['deploy', 'delete'])
    test(`Graph ${operation} HTTP${status} swallowed write retains evidence only on failure`, async () => {
      for (const succeeds of [false, true]) {
        const f = fixture();
        if (operation === 'delete') f.setGraph(runtime());
        let writes = 0;
        f.client[operation === 'deploy' ? 'create' : 'delete'] = async () => {
          writes++;
          if (succeeds) f.setGraph(operation === 'deploy' ? runtime() : undefined);
          throw retainConnectDiagnostic(new Error('private-secret'), evidence);
        };
        const result = await operateNativeDataGraph(
          document(),
          f.context,
          f.client,
          options(operation),
        );
        assert.equal(writes, 1);
        if (operation === 'delete' && succeeds) {
          assert.deepEqual(result, { outcome: 'deleted', mutation: 'confirmed-deleted' });
          assert.equal(getConnectDiagnostic(result), undefined);
        } else {
          assert.deepEqual(result, { outcome: 'failed', mutation: 'unknown' });
          assert.deepEqual(getConnectDiagnostic(result), evidence);
          assert.match(
            operationDiagnostic(result, ''),
            status === 429 ? /429 Too Many Requests/u : /POSSIBLE Connect rate limit/u,
          );
        }
        assert.equal(JSON.stringify(result).includes('private-secret'), false);
      }
    });
}

test('Graph command diagnostics render JSON and human failures including before context exists', async () => {
  const cwd = await project();
  const receipt = await writeDataGraphDocument(document(), cwd, false);
  for (const Class of [Retrieve, Deploy, Delete])
    for (const json of [false, true])
      for (const phase of ['context', 'acquisition'])
        for (const status of [429, 503]) {
          const f = fixture();
          const evidence = connectDiagnostic(status, { 'retry-after': '13' });
          const command = Object.create(Class.prototype);
          const logs = [];
          const flags = {
            'api-version': '68.0',
            metadata: [`data-graph:${name}`],
            'source-dir': Class === Delete ? receipt.path : [receipt.path],
            'output-dir': cwd,
            preview: false,
            'allow-processing': true,
            'confirm-delete': true,
          };
          command.parse = async () => ({ flags });
          command.jsonEnabled = () => json;
          command.log = (message) => logs.push(message);
          const org = { getConnection: () => ({}), getOrgId: () => f.context.orgId };
          command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
          command.resolveTargetOrg = async () => org;
          command.resolveOrg = async () => org;
          command.resolveConnection = async () => ({});
          command.nativeGraphContext = async () => {
            if (phase === 'context')
              throw retainConnectDiagnostic(new Error('private-secret'), evidence);
            return f.context;
          };
          f.context.get = async () =>
            retainConnectDiagnostic({ status, body: { secret: 'private-secret' } }, evidence);
          command.retrieveNativeGraph = retrieveNativeDataGraph;
          command.nativeGraphClient = () => f.client;
          command.operateNativeGraph = (value, context, client, intent) =>
            operateNativeDataGraph(value, context, client, { ...intent, pause: async () => {} });
          const prior = process.exitCode;
          let result;
          try {
            result = await command.run();
          } finally {
            process.exitCode = prior;
          }
          assert.notEqual(result.status, 'success');
          assert.equal(result.diagnostics.errors.length, 1);
          assert.equal(result.diagnostics.errors[0].retryable, false);
          const message = result.diagnostics.errors[0].message;
          assert.match(
            message,
            status === 429 ? /429 Too Many Requests/u : /POSSIBLE Connect rate limit/u,
          );
          assert.match(message, /Retry-After: 13/u);
          assert.equal(JSON.stringify(result).includes('private-secret'), false);
          assert.equal(logs.join('\n').includes('private-secret'), false);
          if (!json) assert.ok(logs.some((line) => line.includes(message)));
          assert.deepEqual(f.calls, []);
        }
});

test('ambiguous POST grants no receipt, retry or deletion authority', async () => {
  const f = fixture();
  f.client.create = async () => {
    f.calls.push('POST');
    f.setGraph(runtime());
    throw new Error('network');
  };
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  await expectResult(lifecycle.create(true), 'outcome', 'unknown');
  await expectResult(lifecycle.create(true), 'outcome', 'blocked');
  await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
  assert.equal(f.calls.filter((c) => c === 'POST').length, 1);
});
test('exclusive journal and concurrent calls fail closed before writes', async () => {
  const f = fixture();
  f.guards.record = async () => {
    throw new Error('already owned');
  };
  await expectResult(
    nativeDataGraphLifecycle(document(), f.context, f.client, f.guards).create(true),
    'outcome',
    'blocked',
  );
  assert.deepEqual(f.calls, []);
  let release;
  f.guards.record = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  const pending = lifecycle.create(true);
  while (!release) await Promise.resolve();
  await expectResult(lifecycle.create(true), 'outcome', 'blocked');
  f.context.check = () => {
    throw new Error('scope drift');
  };
  release();
  await expectResult(pending, 'outcome', 'blocked');
  assert.deepEqual(f.calls, []);
});
test('run-owned DELETE preserves primary API rejection over failed settlement diagnostic', async () => {
  const f = fixture();
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  await expectResult(lifecycle.create(true), 'outcome', 'created');
  const primary = apiDiagnostic(400, {
    errorCode: 'INVALID_INPUT',
    message: 'Reduce the ruleset count to 10.',
  });
  const secondary = apiDiagnostic(500, {
    errorCode: 'INTERNAL_ERROR',
    message: 'Metadata unavailable.',
  });
  f.client.delete = async () => {
    f.calls.push('DELETE');
    f.context.get = async () => retainConnectDiagnostic({ status: 500, body: [] }, secondary);
    throw retainConnectDiagnostic(new Error('Deletion unavailable'), primary);
  };
  const result = await lifecycle.delete(true);
  assert.deepEqual(result, { outcome: 'unknown', mutation: 'attempted' });
  assert.equal(getConnectDiagnostic(result), primary);
  assert.match(
    operationDiagnostic(result, 'No replay.'),
    /INVALID_INPUT: Reduce the ruleset count to 10/u,
  );
  assert.equal(f.calls.filter((c) => c === 'DELETE').length, 1);
});

test('Graph existence and readiness query failures retain HTTP evidence without absence or writes', async () => {
  const evidence = apiDiagnostic(500, {
    errorCode: 'QUERY_ERROR',
    message: 'The indexing stage is warming. Wait for index readiness before retrying.',
  });
  const f = fixture();
  let queries = 0;
  f.context.query = async () => {
    queries++;
    return retainConnectDiagnostic({ status: 500, body: [{ errorCode: 'QUERY_ERROR' }] }, evidence);
  };
  const acquired = await acquireNativeDataGraph(f.context, document());
  assert.deepEqual(acquired, { state: 'unknown' });
  assert.equal(getConnectDiagnostic(acquired), evidence);
  f.setGraph(runtime());
  await assert.rejects(
    readNativeGraphReadiness(f.context, document(), 'synthetic-default-space'),
    (error) => {
      assert.equal(getConnectDiagnostic(error), evidence);
      assert.match(operationDiagnostic(error, 'No replay.'), /HTTP 500.*QUERY_ERROR/u);
      return true;
    },
  );
  assert.equal(queries, 2);
  assert.deepEqual(f.calls, []);
});

test('acquisition carries private API diagnostics without weakening raw absence checks', async () => {
  const evidence = apiDiagnostic(400, {
    errorCode: 'INVALID_INPUT',
    message: 'Reduce the ruleset count to 10.',
  });
  const f = fixture();
  f.context.get = async () =>
    retainConnectDiagnostic(
      {
        status: 400,
        body: [{ errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' }],
      },
      evidence,
    );
  const acquired = await acquireNativeDataGraph(f.context, document());
  assert.deepEqual(acquired, { state: 'unknown' });
  assert.equal(getConnectDiagnostic(acquired), evidence);
  assert.deepEqual(f.calls, []);
});

test('ambiguous DELETE settles reads only and cannot replay after stale metadata timeout', async () => {
  const f = fixture();
  const lifecycle = nativeDataGraphLifecycle(document(), f.context, f.client, f.guards);
  await expectResult(lifecycle.create(true), 'outcome', 'created');
  f.client.delete = async () => {
    f.calls.push('DELETE');
    f.setGraph(undefined);
    throw new Error('network');
  };
  f.context.metadata = async () => ({ status: 200, body: {} });
  await expectResult(lifecycle.delete(true), 'outcome', 'unknown');
  await expectResult(lifecycle.delete(true), 'outcome', 'blocked');
  assert.equal(f.calls.filter((c) => c === 'DELETE').length, 1);
});
