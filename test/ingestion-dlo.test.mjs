import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Deploy from '../lib/commands/data360/deploy.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { writeIngestionDloDocument } from '../lib/artifacts/write-ingestion-dlo.js';
import {
  readDeployInputs,
  captureDeployInputDigest,
  verifyIngestionDloInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
import { operationApiVersion } from '../lib/transport/api-version.js';
import {
  ingestionAddition,
  validateIngestionDloDocument,
} from '../lib/artifacts/ingestion-dlo-document.js';
import {
  projectIngestionDlo,
  retrieveIngestionDlo,
} from '../lib/services/retrieve-ingestion-dlo.js';
import {
  executeIngestionDloDeploy,
  preflightIngestionDloDeploy,
  canonicalIngestionDloBaseline,
} from '../lib/services/execute-ingestion-dlo-deploy.js';

const version = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '67.0',
};
const apiName = 'ReturnedHash__dll';

/**
 * Independent synthetic full wire-schema fixture.
 * @param {number} phase Zero baseline, one source-only extension, two synced.
 * @returns {object} Private evidence.
 */
function baseline(phase = 0) {
  const source = ['ProbeId', 'ProbeValue', ...(phase === 2 ? ['ProbeExtra'] : [])];
  // eslint-disable-next-line unicorn/consistent-function-scoping -- Fixture-local definition keeps synthetic field semantics together.
  const field = (name) => ({
    name,
    label: name,
    dataType: 'Text',
    isPrimaryKey: name === 'ProbeId',
  });
  const fields = [
    ...source.map((name) => field(name)),
    ...['KQ_ProbeId', 'DataSourceObject', 'DataSource', 'cdp_sys_SourceVersion'].map((name) =>
      field(name),
    ),
  ];
  const dlo = {
    capabilities: {},
    category: 'Other',
    dataLakeFieldInfoRepresentation: fields,
    dataSpaceInfo: [{ name: 'default', label: 'default' }],
    fields,
    id: 'definition-id',
    label: 'Probe',
    name: apiName,
    status: 'ACTIVE',
  };
  return {
    connection: {
      connectorType: 'IngestApi',
      id: '1WM000000000001AAA',
      label: 'Probe',
      name: 'ReturnedConnection',
      status: 'CONNECTED',
      tenantSpecificEndpoint: 'private.invalid',
    },
    schema: {
      name: 'ProbeRecord',
      label: 'ProbeRecord',
      schemaType: 'IngestApi',
      availabilityStatus: 'In Use',
      fields: ['ProbeId', 'ProbeValue', ...(phase ? ['ProbeExtra'] : [])].map((name) => ({
        name,
        label: name,
        dataType: 'Text',
      })),
    },
    stream: {
      advancedAttributes: {},
      capabilities: {},
      connectorInfo: { connectorType: 'IngestApi' },
      dataAccessMode: 'INGEST',
      dataLakeObjectInfo: structuredClone(dlo),
      dataSource: 'ReturnedConnection',
      dataStreamType: 'INGESTAPI',
      isEnabled: true,
      label: 'Probe',
      name: 'ReturnedHash',
      recordId: 'stream-runtime-id',
      problemRecordDataLakeObjectName: 'PR_ReturnedHash__dll',
      status: 'ACTIVE',
      sourceFields: source.map((name) => ({ name, datatype: 'Text' })),
      mappings: [
        ...source.map((name) => ({ sourceFieldName: name, targetFieldName: name })),
        { formula: '&quot;ReturnedHash&quot;', targetFieldName: 'DataSourceObject' },
        { formula: '&quot;ReturnedConnection&quot;', targetFieldName: 'DataSource' },
      ],
      refreshConfig: {
        frequency: { hours: [], refreshDayOfMonth: [] },
        hasHeaders: false,
        isAccelerationEnabled: false,
        refreshMode: 'UPSERT',
        shouldFetchImmediately: false,
        shouldTreatMissingFilesAsFailures: false,
      },
    },
    dlo: {
      ...dlo,
      createdDate: 'preserved',
      id: 'runtime-id',
      namespace: '',
      fields: fields.map((item) => ({ ...item, name: `${item.name}__c` })),
      dataLakeFieldInfoRepresentation: fields.map((item) => ({ ...item, name: `${item.name}__c` })),
    },
    keyQualifiers: [],
  };
}

/**
 * Injectable independently bound acquisition.
 * @param {object} value Raw observations.
 * @param {boolean} pending Expected source-only phase.
 * @returns {object} Acquisition.
 */
function acquisition(value, pending = false) {
  return {
    identity: { dataSpace: 'default', apiName },
    candidate: projectIngestionDlo(value, apiName, pending),
    expectations: structuredClone(value),
    blockers: [],
  };
}

const scratch = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ingestion-public-'));
  await writeFile(path.join(cwd, 'ownership'), randomUUID());
  return cwd;
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};
const git = (cwd, ...arguments_) =>
  execFileSync('git', arguments_, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const current = projectIngestionDlo(baseline(), apiName);
const desired = projectIngestionDlo(baseline(2), apiName);

test('public artifact roundtrip retains canonical identity, strict JSON and immutable digest', async () => {
  const cwd = await scratch();
  const receipt = await writeIngestionDloDocument(current, cwd, false);
  assert.equal(
    receipt.path,
    path.join(cwd, 'force-app/main/default/data360/ingestionDlos', `${apiName}.ingestionDlo.json`),
  );
  const repeated = await writeIngestionDloDocument(current, cwd, false);
  assert.equal(repeated.outcome, 'unchanged');
  const inputs = await readDeployInputs({
    cwd,
    metadata: [`ingestion-dlo:${apiName}`, `ingestion-dlo:${apiName}`],
  });
  assert.equal(inputs.length, 1);
  assert.ok(Object.isFrozen(inputs[0].document.spec.event.fields));
  assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
  const bytes = await readFile(receipt.path, 'utf8');
  const alias = path.join(
    cwd,
    'other/main/default/data360/ingestionDlos',
    path.basename(receipt.path),
  );
  await mkdir(path.dirname(alias), { recursive: true });
  await writeFile(alias, bytes);
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path, alias] }),
    (error) => error.code === 'DUPLICATE_IDENTITY',
  );
  await assert.rejects(
    writeIngestionDloDocument(desired, cwd, false),
    (error) => error.code === 'OVERWRITE_REQUIRED',
  );
  await writeIngestionDloDocument(desired, cwd, true);
  await assert.rejects(
    verifyIngestionDloInputDigest(inputs[0]),
    (error) => error.code === 'UNSAFE_SOURCE',
  );
  await writeFile(
    receipt.path,
    bytes.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'),
  );
  await assert.rejects(
    readDeployInputs({ cwd, sourceDir: [receipt.path] }),
    (error) => error.code === 'INVALID_SOURCE',
  );
});

test('public Git ingestion selection binds immutable bytes and refuses rename or deletion', async () => {
  const cwd = await scratch();
  const receipt = await writeIngestionDloDocument(current, cwd, false);
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', 'Synthetic baseline');
  await writeIngestionDloDocument(desired, cwd, true);
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(selected.paths, [receipt.path]);
  assert.equal(selected.ingestionDlos.length, 1);
  await verifyIngestionDloInputDigest(selected.ingestionDlos[0]);
  const moved = receipt.path.replace(apiName, 'Different__dll');
  await rename(receipt.path, moved);
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    (error) => error.code === 'BLOCKED_GIT_LIFECYCLE',
  );
  await rename(moved, receipt.path);
  await unlink(receipt.path);
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    (error) => error.code === 'BLOCKED_GIT_LIFECYCLE',
  );
});

const publicDeploy = async (overrides = {}, failure, mixed = false) => {
  const cwd = await scratch();
  const receipt = await writeIngestionDloDocument(desired, cwd, false);
  const inputs = await readDeployInputs({ cwd, sourceDir: [receipt.path] });
  if (mixed)
    inputs.push({
      path: 'legacy.json',
      document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'Zed__dlm' } },
    });
  const command = Object.create(Deploy.prototype);
  const calls = [];
  let phase = 0;
  let runtimeCount = 0;
  const options = {
    acquire: async (_c, _n, _v, _s, options_) => {
      const value = baseline(phase);
      if (phase === 2)
        Object.assign(value.dlo, {
          lastRefreshedDate: '2026-10-28T18:23:34.000Z',
          totalRecords: runtimeCount++,
        });
      return acquisition(value, options_.pending);
    },
    mutate: async (operation) => {
      calls.push(operation);
      if (operation === 'd360_connection_schema_put_ingestion_api') {
        phase = 1;
        if (failure === 'schema') throw new Error('private');
        return { schemas: [baseline(1).schema] };
      }
      if (failure === 'sync') throw new Error('private');
      phase = 2;
      return {
        dataLakeObjectInfo: baseline(2).stream.dataLakeObjectInfo,
        id: 'definition',
        label: 'Probe',
        name: 'ReturnedHash',
        recordId: 'stream-runtime-id',
        status: 'PROCESSING',
      };
    },
  };
  command.parse = async () => ({
    flags: {
      'source-dir': [receipt.path],
      'api-version': 'auto',
      'data-space': 'default',
      'allow-processing': true,
      preview: false,
      ...overrides,
      'target-org': { getOrgId: () => 'synthetic', getConnection: () => connection },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.captureInput = async (input) =>
    input.document.kind === 'dmo' ? 'legacy' : captureDeployInputDigest(input);
  command.verifyIngestionDloInput = verifyIngestionDloInputDigest;
  command.bindIngestionDlo = async () => {
    calls.push(`binding:${phase}`);
    return 'stable';
  };
  command.preflightIngestionDlo = async (document, conn, v, space) => {
    calls.push('preview');
    return preflightIngestionDloDeploy(document, conn, v, space, options);
  };
  command.executeIngestionDlo = async (document, conn, v, space, guards) =>
    executeIngestionDloDeploy(document, conn, v, space, { ...options, ...guards });
  command.preflight = async () => ({
    outcome: 'update',
    target: 'present',
    absenceProof: 'none',
    diagnostics: [],
  });
  command.execute = async () => {
    calls.push('legacy-write');
    return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
  };
  return { command, calls, inputs };
};

test('public two-stage deploy allows legitimate PUT with local-only verifier, preserves routes and repeat certainty', async () => {
  const d = await publicDeploy({}, undefined, true);
  const result = await run(d.command);
  assert.equal(result.status, 'success');
  const item = result.result.items.find((value) => value.family === 'ingestion-dlo');
  assert.equal(item.stage, 'settled');
  assert.equal(item.mutation, 'confirmed-updated');
  assert.deepEqual(
    item.routes.map((route) => route.operation),
    ['d360_connection_schema_put_ingestion_api', 'd360_datastream_patch_ingestion_api'],
  );
  assert.deepEqual(
    d.calls.filter((value) => value.startsWith('d360_')),
    item.routes.map((route) => route.operation),
  );
  assert.ok(!d.calls.includes('binding:1'));
  const repeated = await run(d.command);
  assert.equal(repeated.status, 'success');
  assert.equal(
    repeated.result.items.find((value) => value.family === 'ingestion-dlo').outcome,
    'unchanged',
  );
  assert.equal(d.calls.filter((value) => value.startsWith('d360_')).length, 2);
});

for (const failure of ['schema', 'sync'])
  test(`public ${failure} uncertainty retains typed stage without replay`, async () => {
    const d = await publicDeploy({}, failure);
    const result = await run(d.command);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items[0].mutation, 'unknown');
    assert.equal(
      result.result.items[0].stage,
      failure === 'schema' ? 'schema-attempted' : 'sync-attempted',
    );
    assert.ok(result.result.items[0].diagnostics.every((value) => typeof value.code === 'string'));
    assert.ok(!d.calls.includes('legacy-write'));
    assert.equal(
      d.calls.filter((value) => value.startsWith('d360_')).length,
      failure === 'schema' ? 1 : 2,
    );
  });

test('public preview, missing acknowledgement, incompatible versions and dependency expansion never mutate', async () => {
  for (const flags of [
    { preview: true },
    { 'allow-processing': false },
    { 'api-version': '65.0' },
    { 'api-version': '67.0' },
    { 'include-dependencies': true },
  ]) {
    const d = await publicDeploy(flags, undefined, true);
    const result = await run(d.command);
    assert.equal(result.status, flags.preview ? 'success' : 'blocked');
    assert.ok(!d.calls.some((value) => value.startsWith('d360_') || value === 'legacy-write'));
  }
  assert.equal(operationApiVersion('auto', 'ingestion-dlo'), '67.0');
});

test('public unknown ingestion stage stops every later selected member', async () => {
  const d = await publicDeploy({}, 'schema');
  const later = structuredClone(d.inputs[0]);
  later.path = 'later.json';
  later.document.identity.apiName = 'Zed__dll';
  d.inputs.push(later);
  d.command.captureInput = async () => 'stable';
  d.command.verifyIngestionDloInput = async () => {};
  d.command.preflightIngestionDlo = async () => ({
    family: 'ingestion-dlo',
    outcome: 'update',
    requiredEffects: ['processing'],
    diagnostics: [],
  });
  const result = await run(d.command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].stage, 'schema-attempted');
  assert.equal(result.result.items[1].outcome, 'not-attempted');
  assert.equal(result.result.items[1].mutation, 'not-attempted');
  assert.equal(d.calls.filter((value) => value.startsWith('d360_')).length, 1);
});

test('public Git snapshot drift blocks before target reads', async () => {
  const d = await publicDeploy({ 'source-dir': undefined, 'changed-since': 'HEAD' });
  d.command.selectGitInputs = async () => ({
    paths: [d.inputs[0].path],
    ingestionDlos: [{ ...d.inputs[0], inputDigest: 'different' }],
    provenance: {},
  });
  const result = await run(d.command);
  assert.equal(result.status, 'blocked');
  assert.ok(!d.calls.includes('preview'));
});

test('public fresh ingestion binding drift blocks earlier legacy writes', async () => {
  const d = await publicDeploy({}, undefined, true);
  d.inputs[1].document.identity.apiName = 'Aaa__dlm';
  let checks = 0;
  d.command.bindIngestionDlo = async () => (++checks > 1 ? 'changed' : 'stable');
  const result = await run(d.command);
  assert.equal(result.status, 'blocked');
  assert.ok(!d.calls.some((value) => value.startsWith('d360_') || value === 'legacy-write'));
});

test('public retrieve routes exact ingestion selector and blocks all output for unsupported binding', async () => {
  for (const blocked of [false, true]) {
    const command = Object.create(Retrieve.prototype);
    const writes = [];
    command.parse = async () => ({
      flags: {
        metadata: [`ingestion-dlo:${apiName}`],
        'api-version': 'auto',
        'data-space': 'default',
        overwrite: false,
      },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic',
      getConnection: () => connection,
    });
    command.selectDocuments = async () => [];
    command.selectDependencies = async () => ({ entries: [], reasons: new Map() });
    command.acquireIngestionDlo = async (conn, name, v) => {
      assert.equal(conn.getApiVersion(), '67.0');
      assert.equal(v.soapNumeric, '67.0');
      assert.equal(name, apiName);
      return blocked ? { blockers: ['SHARED_SOURCE'] } : acquisition(baseline());
    };
    command.writeIngestionDlo = async (document) => {
      writes.push(document);
      return { path: 'synthetic', outcome: 'retrieved' };
    };
    const result = await run(command);
    assert.equal(result.status, blocked ? 'blocked' : 'success');
    assert.equal(writes.length, blocked ? 0 : 1);
  }
});

test('document retains returned identities, strict labels and unsuffixed source fields', () => {
  assert.equal(desired.identity.apiName, apiName);
  assert.equal(ingestionAddition(current, desired).name, 'ProbeExtra');
  for (const edit of [
    (x) => {
      x.spec.event.label = 'Probe Record';
    },
    (x) => {
      x.spec.event.fields[0].name = 'ProbeId__c';
    },
    (x) => {
      x.spec.event.fields[0].dataType = 'Number';
    },
    (x) => {
      x.spec.event.fields[0].unknown = true;
    },
    (x) => {
      x.spec.event.fields.push(x.spec.event.fields[0]);
    },
  ]) {
    const copy = structuredClone(desired);
    edit(copy);
    assert.throws(() => validateIngestionDloDocument(copy));
  }
});

test('full preserved source, field, key, formula and refresh admission rejects lossy candidates', () => {
  for (const edit of [
    (x) => {
      x.stream.mappings.pop();
    },
    (x) => {
      x.stream.refreshConfig.shouldFetchImmediately = true;
    },
    (x) => {
      x.dlo.fields[0].isPrimaryKey = false;
    },
    (x) => {
      x.stream.unqualified = {};
    },
    (x) => {
      x.keyQualifiers.push({ name: 'Custom' });
    },
    (x) => {
      x.schema.fields.push({ name: 'Unrelated', label: 'Unrelated', dataType: 'Text' });
    },
  ]) {
    const value = baseline();
    edit(value);
    assert.throws(() => projectIngestionDlo(value, apiName));
  }
  const reordered = baseline();
  for (const object of [reordered.dlo, reordered.stream.dataLakeObjectInfo]) {
    object.fields.reverse();
    object.dataLakeFieldInfoRepresentation.reverse();
  }
  reordered.schema.fields.reverse();
  reordered.stream.mappings.reverse();
  reordered.stream.sourceFields.reverse();
  assert.deepEqual(projectIngestionDlo(reordered, apiName), current);
});

test('observed postprocessing DLO runtime values preserve projection and configuration fingerprint', async () => {
  // Retained SOURCE receipt: absent initially, then this timestamp and numeric zero.
  const runtime = { lastRefreshedDate: '2026-10-28T18:23:34.000Z', totalRecords: 0 };
  const original = baseline();
  const canonical = canonicalIngestionDloBaseline(original);
  for (const observations of [
    { lastRefreshedDate: runtime.lastRefreshedDate },
    { totalRecords: 0 },
    runtime,
    { lastRefreshedDate: '2026-10-28T19:00:00.000Z', totalRecords: 17 },
  ]) {
    const value = baseline();
    Object.assign(value.dlo, observations);
    const snapshot = structuredClone(value);
    assert.deepEqual(projectIngestionDlo(value, apiName), current);
    assert.deepEqual(canonicalIngestionDloBaseline(value), canonical);
    assert.deepEqual(value, snapshot, 'canonicalization must not mutate acquired evidence');
    const options = {
      acquire: async () => acquisition(value),
      verifyInput: async () => {},
      recordObservation: async () => {},
      allowProcessing: false,
      mutate: async () => assert.fail('runtime observation must never trigger a write'),
    };
    const preview = await preflightIngestionDloDeploy(
      current,
      connection,
      version,
      'default',
      options,
    );
    assert.equal(preview.outcome, 'unchanged');
    const repeat = await executeIngestionDloDeploy(
      current,
      connection,
      version,
      'default',
      options,
    );
    assert.equal(repeat.outcome, 'unchanged');
  }
});

test('runtime fields remain strictly typed and unknown or configuration changes fail closed', async () => {
  const jsonNull = JSON.parse('null');
  const edits = [
    ...['0', jsonNull, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(
      (count) => (x) => {
        x.dlo.totalRecords = count;
      },
    ),
    ...[jsonNull, 0, '', 'tomorrow', '2026-02-30T18:23:34.000Z', '2026-10-28T18:23:34+00:00'].map(
      (timestamp) => (x) => {
        x.dlo.lastRefreshedDate = timestamp;
      },
    ),
    (x) => {
      x.dlo.unknownRuntime = 0;
    },
    (x) => {
      x.stream.dataLakeObjectInfo.totalRecords = 0;
    },
    (x) => {
      x.stream.dataLakeObjectInfo.lastRefreshedDate = '2026-10-28T18:23:34.000Z';
    },
    (x) => {
      x.dlo.fields[0].isPrimaryKey = false;
    },
    (x) => {
      x.keyQualifiers.push({ name: 'Custom' });
    },
    (x) => {
      x.stream.refreshConfig.shouldFetchImmediately = true;
    },
    (x) => {
      x.stream.mappings.pop();
    },
  ];
  for (const edit of edits) {
    const value = baseline();
    Object.assign(value.dlo, { lastRefreshedDate: '2026-10-28T18:23:34.000Z', totalRecords: 0 });
    edit(value);
    assert.throws(() => projectIngestionDlo(value, apiName));
    const result = await executeIngestionDloDeploy(current, connection, version, 'default', {
      acquire: async () => acquisition(value),
      verifyInput: async () => {},
      recordObservation: async () => {},
      allowProcessing: true,
      mutate: async () => assert.fail('malformed observation must not permit mutation'),
    });
    assert.equal(result.outcome, 'blocked');
  }
});

test('runtime observations can appear and change during guarded additive settlement', async () => {
  let phase = 0;
  let reads = 0;
  const writes = [];
  const options = {
    allowProcessing: true,
    verifyInput: async () => {},
    recordObservation: async () => {},
    acquire: async (_c, _n, _v, _s, options_) => {
      const value = baseline(phase);
      if (reads++ > 0)
        Object.assign(value.dlo, {
          lastRefreshedDate: '2026-10-28T18:23:34.000Z',
          totalRecords: reads,
        });
      return acquisition(value, options_.pending);
    },
    mutate: async (operation) => {
      writes.push(operation);
      if (phase++ === 0) return { schemas: [baseline(1).schema] };
      return {
        dataLakeObjectInfo: baseline(2).stream.dataLakeObjectInfo,
        id: 'definition',
        label: 'Probe',
        name: 'ReturnedHash',
        recordId: 'stream-runtime-id',
        status: 'PROCESSING',
      };
    },
  };
  const result = await executeIngestionDloDeploy(desired, connection, version, 'default', options);
  assert.equal(result.outcome, 'updated');
  options.allowProcessing = false;
  const repeated = await executeIngestionDloDeploy(
    desired,
    connection,
    version,
    'default',
    options,
  );
  assert.equal(repeated.outcome, 'unchanged');
  assert.deepEqual(writes, [
    'd360_connection_schema_put_ingestion_api',
    'd360_datastream_patch_ingestion_api',
  ]);
});

test('source-only partial state refuses reentry instead of replaying schema or sync', async () => {
  let writes = 0;
  const result = await executeIngestionDloDeploy(desired, connection, version, 'default', {
    acquire: async () => acquisition(baseline(1)),
    verifyInput: async () => {},
    recordObservation: async () => {},
    allowProcessing: true,
    mutate: async () => {
      writes++;
    },
  });
  assert.equal(result.outcome, 'blocked');
  assert.equal(writes, 0);
});

test('complete equality makes zero mutations and requires no processing acknowledgement', async () => {
  const options = {
    acquire: async () => acquisition(baseline()),
    verifyInput: async () => {},
    recordObservation: async () => {},
    allowProcessing: false,
    mutate: async () => assert.fail('write'),
  };
  assert.equal(
    await preflightIngestionDloDeploy(current, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
  assert.equal(
    await executeIngestionDloDeploy(current, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
});

test('two-stage source PUT then sync preserves all independent definitions and zero-write repeat', async () => {
  let phase = 0;
  const writes = [];
  const observations = [];
  const options = {
    allowProcessing: true,
    verifyInput: async () => {},
    recordObservation: async (value) => observations.push(value),
    acquire: async (_c, _n, _v, _s, options_) => acquisition(baseline(phase), options_.pending),
    mutate: async (operation, parameters) => {
      writes.push({ operation, parameters });
      if (operation === 'd360_connection_schema_put_ingestion_api') {
        phase = 1;
        return { schemas: [baseline(1).schema] };
      }
      phase = 2;
      return {
        dataLakeObjectInfo: baseline(2).stream.dataLakeObjectInfo,
        id: 'definition',
        label: 'Probe',
        name: 'ReturnedHash',
        recordId: 'stream-runtime-id',
        status: 'PROCESSING',
      };
    },
  };
  const result = await executeIngestionDloDeploy(desired, connection, version, 'default', options);
  assert.deepEqual(
    [result.outcome, result.stage, result.mutation],
    ['updated', 'settled', 'confirmed-updated'],
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].parameters.objects, [desired.spec.event]);
  assert.deepEqual(writes[1].parameters, {
    recordIdOrDeveloperName: 'ReturnedHash',
    syncSchema: true,
  });
  assert.ok(observations.length >= 3);
  assert.equal(
    await executeIngestionDloDeploy(desired, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
  assert.equal(writes.length, 2);
});

for (const failure of ['schema-error', 'sync-error', 'input-drift', 'source-drift']) {
  test(`partial failure ${failure} never retries or rolls back`, async () => {
    let phase = 0;
    let writes = 0;
    let inputChecks = 0;
    const result = await executeIngestionDloDeploy(desired, connection, version, 'default', {
      allowProcessing: true,
      verifyInput: async () => {
        inputChecks++;
        if (failure === 'input-drift' && inputChecks > 3) throw new Error('drift');
      },
      recordObservation: async () => {},
      acquire: async (_c, _n, _v, _s, options) => {
        const value = baseline(phase);
        if (failure === 'source-drift' && phase) value.connection.label = 'changed';
        return acquisition(value, options.pending);
      },
      mutate: async (operation) => {
        writes++;
        if (operation === 'd360_connection_schema_put_ingestion_api') {
          phase = 1;
          if (failure === 'schema-error') return { error: 'nested despite201' };
          return { schemas: [baseline(1).schema] };
        }
        throw new Error('sync disconnect');
      },
    });
    assert.equal(result.mutation, 'unknown');
    assert.equal(writes, failure === 'sync-error' ? 2 : 1);
  });
}

test('no acknowledgement and changed type/removal block before writes', async () => {
  const options = {
    allowProcessing: false,
    verifyInput: async () => {},
    recordObservation: async () => {},
    acquire: async () => acquisition(baseline()),
    mutate: async () => assert.fail('write'),
  };
  assert.equal(
    await executeIngestionDloDeploy(desired, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'blocked',
  );
  const removed = structuredClone(current);
  removed.spec.event.fields.pop();
  assert.equal(
    await preflightIngestionDloDeploy(removed, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'blocked',
  );
});

test('actual acquisition binds returned DLO owner to complete connection inventory, never generated-name parsing', async () => {
  const raw = baseline();
  const calls = [];
  const read = async (operation, parameters) => {
    calls.push({ operation, params: parameters });
    switch (operation) {
      case 'd360_connection_list': {
        return { connections: [raw.connection], totalSize: 1 };
      }
      case 'd360_datastream_list': {
        return { dataStreams: [raw.stream], totalSize: 1 };
      }
      case 'd360_datastream_get': {
        return raw.stream;
      }
      case 'd360_connection_get': {
        return raw.connection;
      }
      case 'd360_connection_schema_get': {
        return { schemas: [raw.schema] };
      }
      case 'd360_dlo_get': {
        return { dataLakeObjects: [raw.dlo] };
      }
      default: {
        return { keyQualifiers: [] };
      }
    }
  };
  const acquired = await retrieveIngestionDlo(connection, apiName, version, 'default', { read });
  assert.deepEqual(acquired.candidate, current);
  assert.equal(calls.length, 8);
  assert.equal(calls[2].params.connectionName, 'ReturnedConnection');
  for (const defect of ['shared', 'multiple-events', 'truncated']) {
    const bad = async (op, parameters) => {
      const value = structuredClone(await read(op, parameters));
      if (defect === 'shared' && op === 'd360_datastream_list' && parameters.connectionName) {
        value.dataStreams.push({ ...raw.stream, name: 'OtherStream' });
        value.totalSize = 2;
      }
      if (defect === 'multiple-events' && op === 'd360_connection_schema_get')
        value.schemas.push({ ...raw.schema, name: 'Other' });
      if (defect === 'truncated' && op === 'd360_connection_list') value.nextPageUrl = '/more';
      return value;
    };
    assert.ok(
      await retrieveIngestionDlo(connection, apiName, version, 'default', { read: bad }).then(
        (value) => value.blockers.length,
      ),
    );
  }
});
