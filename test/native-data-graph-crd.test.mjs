import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDataGraphDocument } from '../lib/artifacts/data-graph-document.js';
import {
  observeNativeDataGraph,
  validateNativeDataGraphDocument,
} from '../lib/artifacts/native-data-graph-document.js';
import {
  acquireNativeDataGraph,
  bindNativeGraphRoot,
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
    metadata: async () => missingMetadata(),
    inventory: async () => ({ status: 200, body: { dataGraphMetadata: [] } }),
    query: async () => ({ status: 200, body: { done: true, totalSize: 0, records: [] } }),
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
  ...overrides,
});

for (const reader of ['root', 'get'])
  test(`public delete deadline bounds unresolved admission ${reader} and forbids late writes`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
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

test('public delete deadline bounds unresolved DELETE and late acknowledgement never replays', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
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
