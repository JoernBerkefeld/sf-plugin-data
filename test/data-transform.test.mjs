import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDataTransformInput,
  observeDataTransform,
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from '../lib/artifacts/data-transform-document.js';
import { createDataTransformClient } from '../lib/transport/data-transform-rest.js';
import {
  dataTransformArtifactPath,
  retrieveDataTransform,
} from '../lib/services/retrieve-data-transform.js';

import { preflightDataTransformDeploy } from '../lib/services/preflight-data-transform-deploy.js';
import { executeDataTransformDeploy } from '../lib/services/execute-data-transform-deploy.js';
import { resolveNativeDloTarget } from '../lib/services/native-dlo.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { mkdtemp, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeDataTransformDocument } from '../lib/artifacts/write-data-transform.js';
import {
  readDeployInputs,
  verifyDataTransformInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import {
  deleteDataTransform,
  listDataTransformInventory,
} from '../lib/services/delete-data-transform.js';

const id = '1dt000000000001AAA';
const input = () => ({
  name: 'SyntheticTransform',
  label: 'Synthetic transform',
  description: 'Synthetic definition',
  type: 'BATCH',
  dataSpaceName: 'default',
  definition: {
    type: 'STL',
    version: '56.0',
    nodes: {
      LOAD_DATASET0: {
        action: 'load',
        parameters: {
          dataset: { name: 'Source__dll', type: 'dataLakeObject' },
          fields: ['Id__c'],
          sampleDetails: { sortBy: [], type: 'TopN' },
        },
        sources: [],
      },
      OUTPUT0: {
        action: 'outputD360',
        parameters: {
          name: 'Output__dll',
          type: 'dataLakeObject',
          fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
        },
        sources: ['LOAD_DATASET0'],
      },
    },
  },
});
const schedule = () =>
  JSON.parse('{"frequency":"None","nextScheduledDate":null,"time":null,"type":"None"}');
const runtime = () => {
  const value = {
    ...input(),
    id,
    status: 'ACTIVE',
    creationType: 'CUSTOM',
    fullRunFrequency: 'DAILY',
    actionUrls: { runAction: '/not-sendable' },
  };
  Object.assign(value.definition, {
    name: value.name,
    label: value.label,
    description: value.description,
    version: '68.0',
    outputDataObjects: [
      {
        name: 'Output__dll',
        type: 'dataLakeObject',
        id: 'response-only',
        fields: [{ name: 'Id__c' }],
      },
    ],
  });
  value.definition.nodes.LOAD_DATASET0.parameters.sampleDetails.dataspace = 'default';
  Object.assign(value.definition.nodes.OUTPUT0.parameters, {
    dedupOrder: [],
    writeMode: 'OVERWRITE',
  });
  return value;
};
const document = () => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  definition: input(),
});

test('Transform projects native normalized defaults without replaying GET observations', () => {
  const value = runtime();
  const observed = observeDataTransform(value, schedule());
  assert.deepEqual(observed.document, document());
  assert.deepEqual(observed.runtime, value);
  assert.equal(observed.targetId, id);
  assert.equal(observed.runtime.fullRunFrequency, 'DAILY');
  assert.equal(observed.schedule.type, 'None');
  assert.deepEqual(buildDataTransformInput(observed.document.definition), input());
  value.definition.nodes.OUTPUT0.parameters.name = 'Changed__dll';
  assert.equal(observed.runtime.definition.nodes.OUTPUT0.parameters.name, 'Output__dll');
  assert.throws(() => buildDataTransformInput(runtime()));
  assert.throws(() =>
    validateDataTransformDocument({ ...document(), observations: observed.runtime }),
  );
  const serialized = serializeDataTransformDocument(document());
  assert.equal(serialized.endsWith('\n'), true);
  assert.equal(serialized.includes('\r'), false);
  assert.equal(
    serialized,
    serializeDataTransformDocument({
      definition: input(),
      apiVersion: '68.0',
      kind: 'data-transform',
      schemaVersion: 1,
    }),
  );
  assert.equal(
    dataTransformArtifactPath('SyntheticTransform'),
    'data360/dataTransforms/SyntheticTransform.dataTransform.json',
  );
  assert.throws(() => dataTransformArtifactPath('../escape'));
});

test('Transform rejects unsupported authored inputs rather than silently dropping logic', () => {
  const changes = [
    (v) => {
      v.creationType = 'CUSTOM';
    },
    (v) => {
      v.fullRunFrequency = 'DAILY';
    },
    (v) => {
      v.type = 'STREAMING';
    },
    (v) => {
      v.dataSpaceName = 'other';
    },
    (v) => {
      v.definitions = [v.definition];
    },
    (v) => {
      v.definition.type = 'DCSQL';
    },
    (v) => {
      v.definition.version = '68.0';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.action = 'join';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.writeMode = 'OVERWRITE';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.sources = ['unknown'];
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.name = 'Source__dll';
    },
    (v) => {
      v.definition.nodes.LOAD_DATASET0.parameters.fields.push('Extra__c');
    },
    (v) => {
      v.definition.nodes.LOAD_DATASET0.parameters.sampleDetails.sortBy.push('Id__c');
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.fieldsMappings[0].sourceField = 'Missing__c';
    },
    (v) => {
      Object.defineProperty(v, 'name', { get: () => assert.fail('getter invoked') });
    },
    (v) => {
      v.definition.nodes.loop = v;
    },
  ];
  for (const change of changes) {
    const value = input();
    change(value);
    assert.throws(() => buildDataTransformInput(value));
  }
});

test('Transform refuses generated, hidden, Graph, IR, unknown schedule and nondefault responses', () => {
  for (const creationType of ['SYSTEM', 'GRAPH', 'IR', 'Custom', undefined]) {
    const value = runtime();
    value.creationType = creationType;
    assert.throws(() => observeDataTransform(value, schedule()));
  }
  for (const change of [
    (v) => {
      v.type = 'DbtHidden';
    },
    (v) => {
      v.status = 'PROCESSING';
    },
    (v) => {
      v.namespace = 'owned';
    },
    (v) => {
      v.schedule = {};
    },
    (v) => {
      v.definitions = [];
    },
    (v) => {
      v.definition.schedules = [];
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.writeMode = 'APPEND';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.dedupOrder = ['Id__c'];
    },
    (v) => {
      v.definition.nodes.LOAD_DATASET0.parameters.sampleDetails.dataspace = 'other';
    },
    (v) => {
      v.definition.nodes.extra = { action: 'join' };
    },
    (v) => {
      v.definition.outputDataObjects[0].name = 'Other__dll';
    },
  ]) {
    const value = runtime();
    change(value);
    assert.throws(() => observeDataTransform(value, schedule()));
  }
  for (const value of [
    undefined,
    {},
    { ...schedule(), frequency: 'Daily' },
    { ...schedule(), nextScheduledDate: 'tomorrow' },
    { ...schedule(), unexpected: true },
  ])
    assert.throws(() => observeDataTransform(runtime(), value));
});

test('Transform retrieval is exact identity plus independent ID schedule GET only', async () => {
  for (const selection of [id, 'SyntheticTransform']) {
    const calls = [];
    const result = await retrieveDataTransform(selection, {
      get: async (name) => {
        calls.push(['get', name]);
        return runtime();
      },
      schedule: async (name) => {
        calls.push(['schedule', name]);
        return schedule();
      },
    });
    assert.deepEqual(result.document, document());
    assert.deepEqual(calls, [
      ['get', selection],
      ['schedule', id],
    ]);
  }
  await assert.rejects(
    retrieveDataTransform('Other', {
      get: async () => runtime(),
      schedule: () => assert.fail('mismatched schedule'),
    }),
  );
  const failure = Object.assign(new Error('read denied'), { statusCode: 404 });
  await assert.rejects(
    retrieveDataTransform('SyntheticTransform', {
      get: async () => {
        throw failure;
      },
      schedule: () => assert.fail('404 is not absence'),
    }),
    (error) => error === failure,
  );
  await assert.rejects(
    retrieveDataTransform('x?run=true', {
      get: () => assert.fail('unsafe selection'),
      schedule: () => assert.fail('unsafe selection'),
    }),
  );
});

test('Transform transport pins native68 and exposes only admitted definition writers', async () => {
  const calls = [];
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    _refreshDelegate: {},
    request: async function (request, options) {
      assert.notEqual(this, connection);
      assert.equal(this._refreshDelegate, undefined);
      assert.deepEqual(options.retry, { maxRetries: 0, methods: [] });
      calls.push(request);
      return {};
    },
  };
  const client = createDataTransformClient(connection, '68.0', 'default');
  assert.deepEqual(Object.keys(client), [
    'get',
    'schedule',
    'list',
    'validate',
    'create',
    'delete',
    'update',
  ]);
  await client.get('SyntheticTransform');
  await client.schedule(id);
  await client.list();
  await client.list(20);
  await client.validate(input());
  const prefix = 'https://synthetic.my.salesforce.com/services/data/v68.0/ssot/data-transforms';
  assert.deepEqual(
    calls.map(({ method, url }) => [method, url]),
    [
      ['GET', `${prefix}/SyntheticTransform`],
      ['GET', `${prefix}/${id}/schedule`],
      ['GET', `${prefix}?limit=20&orderBy=NameAsc`],
      ['GET', `${prefix}?limit=20&orderBy=NameAsc&offset=20`],
      ['POST', `${prefix}-validation`],
    ],
  );
  assert.deepEqual(JSON.parse(calls[4].body), input());
  for (const version of ['auto', 'latest', '67.0', '69.0', undefined])
    assert.throws(() => createDataTransformClient(connection, version, 'default'));
  assert.throws(() => createDataTransformClient(connection, '68.0', 'other'));
  for (const selection of ['', '../escape', 'Name?x=1', 'Name/actions/run'])
    await assert.rejects(client.get(selection));
  for (const offset of [-1, 1, 2020, Infinity, '20']) await assert.rejects(client.list(offset));
  await assert.rejects(client.validate(runtime()));
  assert.equal(calls.length, 5);
  await client.create(input());
  await client.update(id, input());
  assert.deepEqual(
    calls.slice(5).map(({ method, url, body }) => [method, url, JSON.parse(body)]),
    [
      ['POST', prefix, input()],
      ['PUT', `${prefix}/${id}`, input()],
    ],
  );
  await assert.rejects(client.update('SyntheticTransform', input()));
  await assert.rejects(client.create(runtime()));
  assert.equal(calls.length, 7);
  await assert.rejects(client.delete('SyntheticTransform'));
  await client.delete(id);
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[7], { method: 'DELETE', url: `${prefix}/${id}` });
  connection.instanceUrl = 'https://other.my.salesforce.com';
  await assert.rejects(client.delete(id), /TRANSFORM_CONNECTION_DRIFT/u);
  await assert.rejects(client.list());
  await assert.rejects(client.get(id));
  await assert.rejects(client.schedule(id));
  await assert.rejects(client.create(input()));
  await assert.rejects(client.validate(input()));
  await assert.rejects(client.update(id, input()));
  assert.equal(calls.length, 8);
});

const dlo = (name) => ({
  name,
  id: name === 'Source__dll' ? '1dl000000000001AAA' : '1dl000000000002AAA',
  label: name,
  category: 'Other',
  status: 'ACTIVE',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'ID', dataType: 'Text', isPrimaryKey: true }],
});
const harness = () => {
  const calls = [];
  let saved = runtime();
  const client = {
    get: async (selection) => {
      calls.push(['get', selection]);
      return structuredClone(saved);
    },
    schedule: async () => {
      calls.push(['schedule']);
      return schedule();
    },
    validate: async (body) => {
      calls.push(['validate', structuredClone(body)]);
      return { issues: [] };
    },
    create: async (body) => {
      calls.push(['create', structuredClone(body)]);
      return { id, name: body.name, status: 'PROCESSING' };
    },
    update: async (target, body) => {
      calls.push(['update', target, structuredClone(body)]);
      saved = runtime();
      saved.description = body.description;
      saved.label = body.label;
      saved.definition.description = body.description;
      saved.definition.label = body.label;
      return { id, name: body.name, status: 'PROCESSING' };
    },
  };
  return {
    calls,
    client,
    dlos: { get: async (name) => dlo(name) },
    set: (value) => {
      saved = value;
    },
  };
};

/**
 * Run the public command with native offline adapters and real immutable input admission.
 * @param {object} flags Flag overrides.
 * @param {object} h Native service harness.
 * @param {Function} [configure] Optional command seam changes.
 * @returns {Promise<object>} Result, calls and retained input path.
 */
async function deployTransform(flags = {}, h = harness(), configure = () => {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-deploy-command-'));
  const published = await writeDataTransformDocument(document(), cwd, false);
  const inputs = await readDeployInputs({ cwd, sourceDir: [published.path] });
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['data-transform:SyntheticTransform'],
      'api-version': 'auto',
      'transform-operation': 'create',
      'allow-processing': true,
      preview: false,
      ...flags,
    },
  });
  command.resolveInputs = async () => inputs;
  command.verifyDataTransformInput = verifyDataTransformInputDigest;
  command.preflightDataTransform = preflightDataTransformDeploy;
  command.executeDataTransform = executeDataTransformDeploy;
  command.resolveTargetOrg = async () => {
    h.calls.push(['auth']);
    return {
      getUsername: () => 'offline',
      getOrgId: () => 'offline-org',
      getConnection: (version) => {
        assert.equal(version, '68.0');
        return {};
      },
    };
  };
  command.createDataTransformClient = (_connection, version, scope) => {
    assert.equal(version, '68.0');
    assert.equal(scope, 'default');
    return h.client;
  };
  command.createDloClient = () => assert.fail('Transform must not spawn general DLO CLI');
  command.createDataTransformDloReader = () => h.dlos;
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.selectGitInputs = () => assert.fail('Git must not expand a Transform request');
  configure(command, published.path);
  const exit = process.exitCode;
  try {
    return { result: await command.run(), h, file: published.path };
  } finally {
    process.exitCode = exit;
  }
}

for (const flags of [
  { 'transform-operation': undefined },
  { 'transform-operation': 'upsert' },
  { 'transform-target-id': id },
  { 'transform-operation': 'update' },
  { 'transform-operation': 'update', 'transform-target-id': '1dtBAD' },
  { 'transform-operation': 'update', 'transform-target-id': '1dl000000000001AAA' },
  { dataspace: 'other' },
  { 'api-version': '67.0' },
  { 'api-version': '69.0' },
  { 'api-version': 'latest' },
  { draft: true },
  { 'wait-timeout': 1 },
  { 'changed-since': 'HEAD' },
  { metadata: ['data-transform:SyntheticTransform', 'data-transform:Other'] },
  { 'source-dir': ['data360/dataTransforms'] },
])
  test(`public Transform rejects before auth ${JSON.stringify(flags)}`, async () => {
    const { result, h } = await deployTransform(flags);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(h.calls, []);
  });

for (const kind of ['dlo', 'dmo', 'segment', 'mapping', 'data-stream', 'native-data-graph'])
  test(`Transform flags rejected on ${kind}`, async () => {
    const { result, h } = await deployTransform({}, harness(), (command) => {
      command.resolveInputs = async () => [{ path: 'other.json', document: { kind } }];
    });
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_TRANSFORM_FLAG_SCOPE');
    assert.deepEqual(h.calls, []);
  });

for (const operation of ['create', 'update'])
  for (const version of ['auto', '68.0'])
    test(`public Transform GET-only preview ${operation}/${version}`, async () => {
      const h = harness();
      const current = runtime();
      current.description = 'Old';
      current.definition.description = 'Old';
      h.set(current);
      const { result } = await deployTransform(
        {
          preview: true,
          'allow-processing': false,
          'api-version': version,
          'transform-operation': operation,
          ...(operation === 'update' ? { 'transform-target-id': id } : {}),
        },
        h,
      );
      assert.equal(result.status, 'success');
      assert.equal(result.result.items[0].outcome, operation);
      assert.match(result.result.items[0].diagnostics[0].message, /server validation pending/u);
      assert.ok(h.calls.every(([op]) => ['auth', 'get', 'schedule'].includes(op)));
    });

test('public Transform confirms create, exact-ID update, unchanged and processing evidence', async () => {
  const created = await deployTransform();
  assert.equal(created.result.result.items[0].mutation, 'confirmed-created');
  assert.equal(created.result.result.items[0].serverProcessing, true);
  assert.equal(created.h.calls.filter(([op]) => op === 'create').length, 1);
  assert.match(created.result.result.items[0].diagnostics[0].message, /not established/u);
  const h = harness();
  const current = runtime();
  current.description = 'Old';
  current.definition.description = 'Old';
  h.set(current);
  const flags = { 'transform-operation': 'update', 'transform-target-id': id };
  const updated = await deployTransform(flags, h);
  assert.equal(updated.result.result.items[0].mutation, 'confirmed-updated');
  assert.equal(h.calls.find(([op]) => op === 'update')[1], id);
  h.calls.length = 0;
  const repeat = await deployTransform({ ...flags, 'allow-processing': false }, h);
  assert.equal(repeat.result.result.items[0].outcome, 'unchanged');
  assert.ok(h.calls.every(([op]) => ['auth', 'get', 'schedule'].includes(op)));
});

test('public Transform processing refusal and pre/post dispatch failures stay truthful', async () => {
  const denied = await deployTransform({ 'allow-processing': false });
  assert.equal(denied.result.result.items[0].mutation, 'not-attempted');
  assert.equal(
    denied.h.calls.some(([op]) => op === 'create'),
    false,
  );
  for (const phase of ['validate', 'create', 'get', 'schedule']) {
    const h = harness();
    h.client[phase] = async () => {
      h.calls.push([phase]);
      throw new Error('offline failure');
    };
    const { result } = await deployTransform({}, h);
    assert.notEqual(result.status, 'success');
    assert.equal(
      result.result.items[0].mutation,
      phase === 'validate' ? 'not-attempted' : 'unknown',
    );
    assert.equal(h.calls.filter(([op]) => op === 'create').length, phase === 'validate' ? 0 : 1);
  }
  const h = harness();
  h.client.get = async () => {
    throw Object.assign(new Error('404'), { statusCode: 404 });
  };
  const missing = await deployTransform(
    { 'transform-operation': 'update', 'transform-target-id': id },
    h,
  );
  assert.equal(missing.result.result.items[0].mutation, 'not-attempted');
  assert.equal(
    h.calls.some(([op]) => op === 'create' || op === 'update'),
    false,
  );
  for (const receipt of [undefined, {}, { id, name: 'Wrong' }]) {
    const bad = harness();
    bad.client.create = async () => receipt;
    const { result } = await deployTransform({}, bad);
    assert.equal(result.result.items[0].mutation, 'unknown');
  }
});

for (const phase of ['validation', 'final-prerequisite', 'preview', 'unchanged'])
  test(`public Transform real byte drift during ${phase} prevents dispatch`, async () => {
    const h = harness();
    const flags =
      phase === 'preview'
        ? { preview: true }
        : phase === 'unchanged'
          ? { 'transform-operation': 'update', 'transform-target-id': id }
          : {};
    const { result } = await deployTransform(flags, h, (_command, file) => {
      const drift = async () => appendFile(file, ' ');
      if (phase === 'validation')
        h.client.validate = async () => {
          await drift();
          return { issues: [] };
        };
      else {
        let reads = 0;
        h.dlos.get = async (name) => {
          reads++;
          if (reads === (phase === 'final-prerequisite' ? 4 : 2)) await drift();
          return dlo(name);
        };
      }
    });
    assert.notEqual(result.status, 'success');
    assert.equal(
      h.calls.some(([op]) => op === 'create' || op === 'update'),
      false,
    );
    if (phase !== 'preview') assert.equal(result.result.items[0].mutation, 'not-attempted');
  });

for (const mode of ['mixed', 'multiple'])
  test(`public Transform refuses ${mode} admitted inputs before auth`, async () => {
    const { result, h } = await deployTransform({}, harness(), (command) => {
      const resolve = command.resolveInputs;
      command.resolveInputs = async () => {
        const inputs = await resolve();
        return [
          ...inputs,
          mode === 'mixed'
            ? { path: 'other', document: { kind: 'dlo' } }
            : { ...inputs[0], path: 'other' },
        ];
      };
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(h.calls, []);
  });

test('public Transform post-dispatch prerequisite failure is unknown and human evidence is honest', async () => {
  const h = harness();
  let reads = 0;
  h.dlos.get = async (name) => {
    if (++reads === 5) throw new Error('readback prerequisite unavailable');
    return dlo(name);
  };
  const failed = await deployTransform({}, h);
  assert.equal(failed.result.result.items[0].mutation, 'unknown');
  const lines = [];
  const confirmed = await deployTransform({}, harness(), (command) => {
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
  });
  assert.equal(confirmed.result.status, 'success');
  assert.ok(lines.some((line) => /server is still processing/u.test(line)));
  assert.ok(lines.some((line) => /Computation completion is not established/u.test(line)));
});

for (const field of ['label', 'description', 'schedule'])
  test(`public Transform refuses late ${field} drift during final prerequisite GET`, async () => {
    const h = harness();
    const current = runtime();
    current.description = 'Original';
    current.definition.description = 'Original';
    h.set(current);
    let reads = 0;
    let scheduleChanged = false;
    h.dlos.get = async (name) => {
      if (++reads === 4) {
        if (field === 'schedule') scheduleChanged = true;
        else {
          current[field] = 'Concurrent edit';
          current.definition[field] = 'Concurrent edit';
          h.set(current);
        }
      }
      return dlo(name);
    };
    if (field === 'schedule')
      h.client.schedule = async () =>
        scheduleChanged ? { ...schedule(), type: 'Daily', frequency: 'DAILY' } : schedule();
    const { result } = await deployTransform(
      {
        'transform-operation': 'update',
        'transform-target-id': id,
      },
      h,
    );
    assert.equal(reads, 4);
    assert.equal(result.status, 'blocked');
    assert.equal(result.result.items[0].mutation, 'not-attempted');
    if (field !== 'schedule')
      assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_DRIFT');
    assert.equal(
      h.calls.some(([op]) => op === 'update' || op === 'create'),
      false,
    );
  });

test('public Transform refuses target drift during awaited final input verification', async () => {
  const h = harness();
  const current = runtime();
  current.description = 'Original';
  current.definition.description = 'Original';
  h.set(current);
  let verifications = 0;
  const { result } = await deployTransform(
    {
      'transform-operation': 'update',
      'transform-target-id': id,
    },
    h,
    (command) => {
      command.verifyDataTransformInput = async (input) => {
        await verifyDataTransformInputDigest(input);
        if (++verifications === 2) {
          await Promise.resolve();
          current.label = 'Concurrent edit';
          current.definition.label = 'Concurrent edit';
          h.set(current);
        }
      };
    },
  );
  assert.equal(verifications, 2);
  assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_DRIFT');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.equal(
    h.calls.some(([op]) => op === 'update' || op === 'create'),
    false,
  );
});

test('Transform executor notifies dispatch only after awaited byte verification', async () => {
  const h = harness();
  const order = [];
  await executeDataTransformDeploy(document(), { operation: 'create' }, h.client, h.dlos, {
    verifyInput: async () => {
      await Promise.resolve();
      order.push('verify');
    },
    onDispatch: () => {
      order.push('dispatch');
    },
  });
  assert.deepEqual(order, ['verify', 'dispatch']);
});

test('Transform shared DLO resolution returns detached identity and complete definition', async () => {
  const value = dlo('Source__dll');
  const resolved = await resolveNativeDloTarget(
    'Source__dll',
    { get: async () => value },
    'default',
  );
  assert.equal(resolved.targetId, value.id);
  assert.equal(resolved.document.spec.fields[0].isPrimaryKey, true);
  value.fields[0].dataType = 'Number';
  assert.equal(resolved.runtime.fields[0].dataType, 'Text');
  await assert.rejects(resolveNativeDloTarget('Other__dll', { get: async () => value }, 'default'));
});

test('Transform explicit create is one POST with independent readback, never an absence lookup', async () => {
  const h = harness();
  const result = await executeDataTransformDeploy(
    document(),
    { operation: 'create' },
    h.client,
    h.dlos,
  );
  assert.equal(result.operation, 'create');
  assert.equal(result.serverProcessing, true);
  assert.deepEqual(
    h.calls.map(([op]) => op),
    ['validate', 'create', 'get', 'schedule'],
  );
  assert.deepEqual(h.calls[1][1], input());
  for (const statusCode of [400, 409, 503, undefined]) {
    const failure = Object.assign(new Error('native duplicate or unknown'), { statusCode });
    const bad = harness();
    bad.client.create = async () => {
      bad.calls.push(['create']);
      throw failure;
    };
    await assert.rejects(
      executeDataTransformDeploy(document(), { operation: 'create' }, bad.client, bad.dlos),
      (error) => error === failure,
    );
    assert.deepEqual(
      bad.calls.map(([op]) => op),
      ['validate', 'create'],
    );
  }
});

test('Transform full-input PUT preserves settings and canonical repeat is GET-only', async () => {
  const h = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  const result = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
    h.dlos,
  );
  assert.equal(result.operation, 'update');
  const write = h.calls.find(([op]) => op === 'update');
  assert.deepEqual(write, ['update', id, desired.definition]);
  h.calls.length = 0;
  const repeat = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
    h.dlos,
  );
  assert.equal(repeat.operation, 'unchanged');
  assert.deepEqual(
    h.calls.map(([op]) => op),
    ['get', 'schedule'],
  );
});

test('Transform preflight blocks unsupported current targets, schedules, validation and prerequisites', async () => {
  for (const mutate of [
    (h) => {
      h.client.get = async () => {
        throw Object.assign(new Error('access ambiguous'), { statusCode: 404 });
      };
    },
    (h) => {
      h.client.schedule = async () => ({ ...schedule(), frequency: 'Daily' });
    },
    (h) => {
      const value = runtime();
      value.creationType = 'GRAPH';
      h.set(value);
    },
    (h) => {
      const value = runtime();
      value.name = 'Other';
      h.set(value);
    },
    (h) => {
      const value = runtime();
      value.definition.nodes.OUTPUT0.parameters.writeMode = 'APPEND';
      h.set(value);
    },
    (h) => {
      h.dlos.get = async () => {
        throw new Error('missing prerequisite');
      };
    },
    (h) => {
      h.dlos.get = async (name) => ({ ...dlo(name), status: 'PROCESSING' });
    },
    (h) => {
      h.dlos.get = async (name) => ({ ...dlo(name), dataSpaceInfo: [{ name: 'other' }] });
    },
    (h) => {
      h.dlos.get = async (name) => {
        const value = dlo(name);
        if (name === 'Output__dll') value.fields[0].dataType = 'Number';
        return value;
      };
    },
    (h) => {
      h.dlos.get = async (name) => {
        const value = dlo(name);
        value.fields[0].name = 'Missing__c';
        return value;
      };
    },
  ]) {
    const h = harness();
    mutate(h);
    const desired = document();
    desired.definition.description = 'changed';
    await assert.rejects(
      executeDataTransformDeploy(desired, { operation: 'update', targetId: id }, h.client, h.dlos),
    );
    assert.equal(
      h.calls.some(([op]) => ['create', 'update'].includes(op)),
      false,
    );
  }
  for (const response of [undefined, {}, { issues: [{}] }]) {
    const h = harness();
    h.client.validate = async () => response;
    await assert.rejects(
      preflightDataTransformDeploy(document(), { operation: 'create' }, h.client, h.dlos),
    );
    assert.equal(h.calls.length, 0);
  }
});

test('Transform execution detects validation-time target drift and independent readback mismatch', async () => {
  const h = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  const verifyInput = async () => {
    const value = runtime();
    value.label = 'Drift';
    value.definition.label = 'Drift';
    h.set(value);
  };
  await assert.rejects(
    executeDataTransformDeploy(desired, { operation: 'update', targetId: id }, h.client, h.dlos, {
      verifyInput,
    }),
    /TRANSFORM_TARGET_DRIFT/u,
  );
  assert.equal(
    h.calls.some(([op]) => op === 'update'),
    false,
  );
  const bad = harness();
  bad.client.get = async () => {
    const value = runtime();
    value.description = 'wrong';
    value.definition.description = 'wrong';
    return value;
  };
  await assert.rejects(
    executeDataTransformDeploy(document(), { operation: 'create' }, bad.client, bad.dlos),
    /TRANSFORM_READBACK_MISMATCH/u,
  );
  const processing = harness();
  const value = runtime();
  value.status = 'PROCESSING';
  processing.set(value);
  const result = await executeDataTransformDeploy(
    document(),
    { operation: 'create' },
    processing.client,
    processing.dlos,
  );
  assert.equal(result.serverProcessing, true);
});

test('Transform deploy refuses logic replacement and incomplete mapped primary keys', async () => {
  const h = harness();
  const changed = document();
  changed.definition.definition.nodes.OUTPUT0.parameters.name = 'OtherOutput__dll';
  await assert.rejects(
    executeDataTransformDeploy(changed, { operation: 'update', targetId: id }, h.client, h.dlos),
    /UNSUPPORTED_TRANSFORM_LOGIC_CHANGE/u,
  );
  for (const selection of [
    {},
    { operation: 'upsert' },
    { operation: 'update', targetId: 'SyntheticTransform' },
    { operation: 'create', targetId: id },
  ])
    await assert.rejects(preflightDataTransformDeploy(document(), selection, h.client, h.dlos));
  const missingKey = harness();
  missingKey.dlos.get = async (name) => {
    const value = dlo(name);
    value.fields[0].isPrimaryKey = false;
    value.fields.push({ name: 'Other__c', label: 'Other', dataType: 'Text', isPrimaryKey: true });
    return value;
  };
  await assert.rejects(
    executeDataTransformDeploy(
      document(),
      { operation: 'create' },
      missingKey.client,
      missingKey.dlos,
    ),
    /INCOMPATIBLE_TRANSFORM_DLO_FIELDS/u,
  );
});

test('Transform write acknowledgment never substitutes for ID, schedule or prerequisite readback', async () => {
  for (const receipt of [undefined, {}, { id: '1dt000000000002AAA', name: 'Other' }]) {
    const h = harness();
    h.client.create = async () => {
      h.calls.push(['create']);
      return receipt;
    };
    await assert.rejects(
      executeDataTransformDeploy(document(), { operation: 'create' }, h.client, h.dlos),
    );
    assert.deepEqual(
      h.calls.map(([op]) => op),
      ['validate', 'create'],
    );
  }
  for (const mutate of [
    (h) => {
      h.client.schedule = async () => ({ ...schedule(), type: 'Daily' });
    },
    (h) => {
      h.client.get = async () => {
        throw Object.assign(new Error('readback access denied'), { statusCode: 404 });
      };
    },
    (h) => {
      h.client.get = async () => ({ ...runtime(), id: '1dt000000000002AAA' });
    },
    (h) => {
      let reads = 0;
      h.dlos.get = async (name) => {
        const value = dlo(name);
        if (++reads > 4)
          value.fields.push({
            name: 'Added__c',
            label: 'Added',
            dataType: 'Text',
            isPrimaryKey: false,
          });
        return value;
      };
    },
    (h) => {
      let reads = 0;
      h.dlos.get = async (name) => {
        const value = dlo(name);
        if (++reads > 4) value.dataSpaceInfo.push({ name: 'other' });
        return value;
      };
    },
  ]) {
    const h = harness();
    mutate(h);
    await assert.rejects(
      executeDataTransformDeploy(document(), { operation: 'create' }, h.client, h.dlos),
    );
    assert.equal(h.calls.filter(([op]) => op === 'create').length, 1);
    assert.equal(
      h.calls.some(([op]) => op === 'update'),
      false,
    );
  }
  const before = harness();
  let reads = 0;
  before.dlos.get = async (name) => {
    const value = dlo(name);
    if (++reads > 2) value.label = 'Drift';
    return value;
  };
  await assert.rejects(
    executeDataTransformDeploy(document(), { operation: 'create' }, before.client, before.dlos),
    /TRANSFORM_PREREQUISITE_DRIFT/u,
  );
  assert.equal(
    before.calls.some(([op]) => op === 'create'),
    false,
  );
  const update = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  const failure = new Error('unknown PUT outcome');
  update.client.update = async () => {
    update.calls.push(['update']);
    throw failure;
  };
  await assert.rejects(
    executeDataTransformDeploy(
      desired,
      { operation: 'update', targetId: id },
      update.client,
      update.dlos,
    ),
    (error) => error === failure,
  );
  assert.equal(update.calls.filter(([op]) => op === 'update').length, 1);
  assert.equal(
    update.calls.some(([op]) => op === 'create'),
    false,
  );
});

test('Transform transport never retries 400, 404, permission or unknown failures', async () => {
  for (const statusCode of [400, 401, 403, 404, 409, 503, undefined]) {
    let calls = 0;
    const connection = {
      instanceUrl: 'https://synthetic.my.salesforce.com',
      request: async () => {
        calls++;
        throw Object.assign(new Error('private body'), { statusCode });
      },
    };
    const client = createDataTransformClient(connection, '68.0', 'default');
    await assert.rejects(client.get('SyntheticTransform'));
    assert.equal(calls, 1);
    await assert.rejects(client.delete(id));
    assert.equal(calls, 2);
  }
});

const deleteHarness = () => {
  const h = harness();
  let deleted = false;
  h.client.list = async () => {
    h.calls.push(['list']);
    return {
      totalSize: deleted ? 0 : 1,
      dataTransforms: deleted ? [] : [{ id, name: input().name }],
    };
  };
  h.client.delete = async (targetId) => {
    h.calls.push(['delete', targetId]);
    deleted = true;
  };
  h.options = { targetId: id, confirmDelete: true, verifyInput: async () => {} };
  return h;
};

test('Transform deletion previews zero writes, requires confirmation and independently settles one DELETE', async () => {
  for (const [options, outcome, writes] of [
    [{ preview: true }, 'preview', 0],
    [{ confirmDelete: false }, 'blocked', 0],
    [{}, 'deleted', 1],
  ]) {
    const h = deleteHarness();
    Object.assign(h.options, options);
    const result = await deleteDataTransform(document(), h.client, h.dlos, h.options);
    assert.equal(result.outcome, outcome);
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, writes);
    assert.equal(
      h.calls.some(([op]) => ['create', 'update', 'validate'].includes(op)),
      false,
    );
    if (writes) {
      assert.equal(result.mutation, 'confirmed-deleted');
      assert.equal(result.prerequisitesPreserved, true);
      assert.deepEqual(
        h.calls.find(([op]) => op === 'delete'),
        ['delete', id],
      );
    }
  }
});

test('Transform deletion rejects ambiguous absence, unsupported targets and fresh drift before writes', async () => {
  for (const mutate of [
    (h) => {
      h.client.get = async () => {
        throw Object.assign(new Error('ambiguous'), { statusCode: 404 });
      };
    },
    (h) => {
      h.options.targetId = 'SyntheticTransform';
    },
    (h) => {
      h.client.list = async () => ({ totalSize: 0, dataTransforms: [] });
    },
    (h) => {
      h.client.schedule = async () => ({ ...schedule(), type: 'Daily' });
    },
    (h) => {
      const raw = runtime();
      raw.creationType = 'SYSTEM';
      h.set(raw);
    },
    (h) => {
      const raw = runtime();
      raw.definitions = [];
      h.set(raw);
    },
    (h) => {
      const raw = runtime();
      raw.type = 'STREAMING';
      h.set(raw);
    },
    (h) => {
      const raw = runtime();
      raw.id = '1dt000000000002AAA';
      h.set(raw);
    },
    (h) => {
      let reads = 0;
      h.dlos.get = async (name) => ({ ...dlo(name), label: ++reads > 2 ? 'Drift' : name });
    },
    (h) => {
      let reads = 0;
      h.dlos.get = async (name) => ({
        ...dlo(name),
        id: ++reads > 2 ? '1dl000000000003AAA' : dlo(name).id,
      });
    },
    (h) => {
      let checks = 0;
      h.options.verifyInput = async () => {
        if (++checks === 2) h.options.confirmDelete = false;
      };
    },
    (h) => {
      let checks = 0;
      h.options.verifyInput = async () => {
        if (++checks === 2) {
          const raw = runtime();
          raw.label = 'Changed';
          raw.definition.label = 'Changed';
          h.set(raw);
        }
      };
    },
  ]) {
    const h = deleteHarness();
    mutate(h);
    await assert.rejects(deleteDataTransform(document(), h.client, h.dlos, h.options));
    assert.equal(
      h.calls.some(([op]) => op === 'delete'),
      false,
    );
  }
  const h = deleteHarness();
  const desired = document();
  h.options.verifyInput = async () => {
    desired.definition.label = 'Changed';
  };
  await assert.rejects(deleteDataTransform(desired, h.client, h.dlos, h.options));
  assert.equal(
    h.calls.some(([op]) => op === 'delete'),
    false,
  );
});

test('Transform inventory uses bounded complete fixed pages, never partial/error absence or server links', async () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    id: `1dt${String(index).padStart(12, '0')}AAA`,
    name: `Synthetic${index}`,
  }));
  const offsets = [];
  const inventory = await listDataTransformInventory({
    list: async (offset) => {
      offsets.push(offset);
      return {
        totalSize: 21,
        dataTransforms: rows.slice(offset, offset + 20),
        nextPageUrl: 'https://untrusted.invalid',
      };
    },
  });
  assert.equal(inventory.length, 21);
  assert.deepEqual(offsets, [0, 20]);
  for (const page of [
    undefined,
    {},
    { totalSize: 1, dataTransforms: [] },
    { totalSize: 2021, dataTransforms: [] },
    { totalSize: -1, dataTransforms: [] },
    { totalSize: 2, dataTransforms: [rows[0], rows[0]] },
    { totalSize: 1, dataTransforms: [{ id: 'bad', name: 'Synthetic' }] },
  ])
    await assert.rejects(listDataTransformInventory({ list: async () => page }));
  await assert.rejects(
    listDataTransformInventory({
      list: async (offset) => ({
        totalSize: offset === 0 ? 21 : 20,
        dataTransforms: rows.slice(offset, offset + 20),
      }),
    }),
  );
});

test('Transform delete acknowledgment is not settlement and never authorizes mutation replay or DLO cleanup', async () => {
  for (const mode of [
    'present',
    'same-name',
    'partial',
    'read404',
    'output-drift',
    'source-missing',
    'delete-error',
  ]) {
    const h = deleteHarness();
    let dispatched = false;
    h.client.delete = async () => {
      h.calls.push(['delete']);
      dispatched = true;
      if (mode === 'delete-error') throw new Error('uncertain');
    };
    h.client.list = async () => {
      if (!dispatched) return { totalSize: 1, dataTransforms: [{ id, name: input().name }] };
      if (mode === 'read404') throw Object.assign(new Error('access'), { statusCode: 404 });
      if (mode === 'partial') return { totalSize: 2, dataTransforms: [] };
      if (mode === 'present' || mode === 'same-name')
        return {
          totalSize: 1,
          dataTransforms: [
            { id: mode === 'present' ? id : '1dt000000000002AAA', name: input().name },
          ],
        };
      return { totalSize: 0, dataTransforms: [] };
    };
    h.dlos.get = async (name) => {
      if (dispatched && mode === 'source-missing' && name === 'Source__dll')
        throw new Error('missing');
      const raw = dlo(name);
      if (dispatched && mode === 'output-drift' && name === 'Output__dll')
        raw.fields.push({
          name: 'Extra__c',
          label: 'Extra',
          dataType: 'Text',
          isPrimaryKey: false,
        });
      return raw;
    };
    h.dlos.delete = () => assert.fail('never delete a DLO');
    const result = await deleteDataTransform(document(), h.client, h.dlos, h.options);
    assert.equal(result.outcome, 'deletion-unconfirmed', mode);
    assert.equal(result.mutation, mode === 'delete-error' ? 'unknown' : 'acknowledged', mode);
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  }
});

/**
 * Run the public delete command with offline native adapters and real immutable input admission.
 * @param {object} flags Flag overrides.
 * @param {object} h Delete harness.
 * @param {Function} configure Optional command/input fault injection.
 * @returns {Promise<object>} Result and harness.
 */
async function deleteTransformCommand(flags = {}, h = deleteHarness(), configure = () => {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-delete-command-'));
  const published = await writeDataTransformDocument(document(), cwd, false);
  const inputs = await readDeployInputs({ cwd, sourceDir: [published.path] });
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['data-transform:SyntheticTransform'],
      'source-dir': published.path,
      'transform-target-id': id,
      'confirm-delete': true,
      'delete-dlo': false,
      preview: false,
      ...flags,
    },
  });
  command.resolveInputs = async (request) => {
    h.calls.push(['resolve']);
    return request.sourceDir.length === 1 ? inputs : [];
  };
  command.verifyDataTransformInput = verifyDataTransformInputDigest;
  command.deleteDataTransform = deleteDataTransform;
  command.resolveConnection = async () => {
    h.calls.push(['auth']);
    return { getUsername: () => 'offline' };
  };
  command.createDataTransformClient = (_connection, version, scope) => {
    assert.equal(version, '68.0');
    assert.equal(scope, 'default');
    return h.client;
  };
  command.createDloClient = () => assert.fail('Transform must not spawn general DLO CLI');
  command.createDataTransformDloReader = () => h.dlos;
  command.jsonEnabled = () => true;
  command.log = () => {};
  configure(command, published.path);
  const exit = process.exitCode;
  try {
    return { result: await command.run(), h };
  } finally {
    process.exitCode = exit;
  }
}

for (const flags of [
  { 'transform-target-id': undefined },
  { 'transform-target-id': '1dtBAD' },
  { 'transform-target-id': '1dl000000000001AAA' },
  { 'source-dir': undefined },
  { 'source-dir': 'data360/dataTransforms' },
  { 'delete-dlo': true },
  { dataspace: 'other' },
  { 'api-version': '67.0' },
  { 'api-version': 'latest' },
  { metadata: ['data-transform'] },
  { metadata: ['data-transform:SyntheticTransform', 'data-transform:SyntheticTransform'] },
  { metadata: ['data-transform:SyntheticTransform', 'data-transform:Other'] },
  { metadata: ['data-transform:SyntheticTransform', 'dlo:Source__dll'] },
  { metadata: ['data-transform:Other'] },
])
  test(`public Transform delete rejects before auth ${JSON.stringify(flags)}`, async () => {
    const { result, h } = await deleteTransformCommand(flags);
    assert.equal(result.status, 'blocked');
    assert.equal(
      h.calls.some(([op]) => ['auth', 'delete'].includes(op)),
      false,
    );
  });

test('public Transform delete: preview GET-only, unconfirmed blocked, confirmed one DELETE', async () => {
  const preview = await deleteTransformCommand({ preview: true, 'confirm-delete': false });
  assert.equal(preview.result.status, 'success');
  assert.equal(preview.result.result.items[0].outcome, 'delete');
  assert.equal(preview.result.result.items[0].operation, 'preview');
  assert.equal(
    preview.h.calls.some(([op]) => op === 'delete'),
    false,
  );
  const blocked = await deleteTransformCommand({ 'confirm-delete': false });
  assert.equal(blocked.result.status, 'blocked');
  assert.equal(blocked.result.result.items[0].mutation, 'not-attempted');
  assert.equal(
    blocked.h.calls.some(([op]) => op === 'delete'),
    false,
  );
  const done = await deleteTransformCommand();
  assert.equal(done.result.status, 'success');
  assert.equal(done.result.result.items[0].outcome, 'deleted');
  assert.equal(done.result.result.items[0].mutation, 'confirmed-deleted');
  assert.equal(done.result.result.items[0].prerequisitesPreserved, true);
  assert.equal(done.h.calls.filter(([op]) => op === 'delete').length, 1);
});

test('public Transform delete reports unconfirmed settlement and unknown HTTP outcome nonzero without replay', async () => {
  for (const mode of ['present', 'error']) {
    const h = deleteHarness();
    let dispatched = false;
    h.client.delete = async () => {
      h.calls.push(['delete']);
      dispatched = true;
      if (mode === 'error') throw new Error('uncertain');
    };
    h.client.list = async () => ({
      totalSize: 1,
      dataTransforms: [{ id, name: input().name }],
    });
    void dispatched;
    const { result } = await deleteTransformCommand({}, h);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
    assert.equal(result.result.items[0].mutation, mode === 'error' ? 'unknown' : 'acknowledged');
    assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_DELETE_UNCONFIRMED');
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  }
});

test('Transform delete service refuses target or schedule changed during final awaited input check', async () => {
  for (const mutate of ['target', 'schedule']) {
    const h = deleteHarness();
    let checks = 0;
    h.options.verifyInput = async () => {
      if (++checks < 3) return;
      if (mutate === 'schedule') h.client.schedule = async () => ({ ...schedule(), type: 'Daily' });
      else {
        const raw = runtime();
        raw.label = 'Changed';
        raw.definition.label = 'Changed';
        h.set(raw);
      }
    };
    await assert.rejects(deleteDataTransform(document(), h.client, h.dlos, h.options));
    assert.equal(
      h.calls.some(([op]) => op === 'delete'),
      false,
    );
  }
});

test('Transform flags are rejected on other delete families', async () => {
  const { result, h } = await deleteTransformCommand({ metadata: ['dlo:Source__dll'] });
  assert.equal(result.status, 'blocked');
  assert.equal(
    h.calls.some(([op]) => ['auth', 'delete'].includes(op)),
    false,
  );
});

test('Transform delete leaves still-visible inventory unconfirmed without polling or re-deleting', async () => {
  const h = deleteHarness();
  let reads = 0;
  let sent = false;
  h.client.delete = async () => {
    h.calls.push(['delete']);
    sent = true;
  };
  h.client.list = async () => {
    const present = !sent || ++reads < 3;
    return {
      totalSize: present ? 1 : 0,
      dataTransforms: present ? [{ id, name: input().name }] : [],
    };
  };
  const result = await deleteDataTransform(document(), h.client, h.dlos, h.options);
  assert.equal(result.outcome, 'deletion-unconfirmed');
  assert.equal(result.mutation, 'acknowledged');
  assert.equal(reads, 1);
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
});

test('public Transform delete refuses real byte drift during final prerequisite reads', async () => {
  const h = deleteHarness();
  let file;
  let reads = 0;
  h.dlos.get = async (name) => {
    if (++reads === 4) await appendFile(file, ' ');
    return dlo(name);
  };
  const { result } = await deleteTransformCommand({}, h, (_command, source) => {
    file = source;
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 0);
});

test('public Transform delete preserves post-dispatch exceptions as unknown and truthful human output', async () => {
  const h = deleteHarness();
  const logs = [];
  const { result } = await deleteTransformCommand({}, h, (command) => {
    command.jsonEnabled = () => false;
    command.log = (line) => logs.push(line);
    command.deleteDataTransform = async (_desired, client) => {
      await client.delete(id);
      throw new Error('post-dispatch failure');
    };
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  assert.equal(
    logs.some((line) => line.startsWith('deleted ')),
    false,
  );
});

test('Transform delete final read compares the complete admitted None schedule', async () => {
  const h = deleteHarness();
  let reads = 0;
  h.client.schedule = async () => ({ ...schedule(), ...(++reads > 1 ? { time: '12:00' } : {}) });
  await assert.rejects(deleteDataTransform(document(), h.client, h.dlos, h.options));
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 0);
});

test('Transform update never posts to the validation endpoint (live: it rejects the owner own output)', async () => {
  const h = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  const current = runtime();
  current.description = 'Old';
  current.definition.description = 'Old';
  h.set(current);
  h.client.validate = async () => assert.fail('no validation POST on update');
  const result = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
    h.dlos,
  );
  assert.equal(result.operation, 'update');
});
