import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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
import {
  DataTransformScheduleError,
  executeDataTransformDeploy,
  rejectedTransformWrite,
} from '../lib/services/execute-data-transform-deploy.js';
import { resolveNativeDloTarget } from '../lib/services/native-dlo.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { mkdtemp, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeDataTransformDocument } from '../lib/artifacts/write-data-transform.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  readDeployInputs,
  verifyDataTransformInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import {
  deleteDataTransform,
  listDataTransformInventory,
} from '../lib/services/delete-data-transform.js';

/**
 * Read a raw GET from a live probe (2026-11-15), names and IDs replaced by synthetic ones.
 * @param {string} file Fixture file name.
 * @returns {object} Parsed native GET.
 */
const fixture = (file) =>
  JSON.parse(readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8'));
const stlGet = () => fixture('data-transform-stl-get.json');
const dcsqlGet = () => fixture('data-transform-dcsql-get.json');

const id = '1dt000000000001AAA';
/**
 * The create/update input of a transform, as retrieve writes it.
 * @returns {object} Native input.
 */
const input = () => ({
  name: 'SyntheticTransform',
  label: 'Synthetic transform',
  description: 'Synthetic definition',
  type: 'BATCH',
  dataSpaceName: 'default',
  fullRunFrequency: 'DAILY',
  definition: {
    name: 'SyntheticTransform',
    label: 'Synthetic transform',
    description: 'Synthetic definition',
    type: 'STL',
    version: '68.0',
    nodes: {
      LOAD_DATASET0: {
        action: 'load',
        parameters: {
          dataset: { name: 'Source__dll', type: 'dataLakeObject' },
          fields: ['Id__c'],
          sampleDetails: { dataspace: 'default', sortBy: [], type: 'TopN' },
        },
        sources: [],
      },
      OUTPUT0: {
        action: 'outputD360',
        parameters: {
          dedupOrder: [],
          name: 'Output__dll',
          type: 'dataLakeObject',
          fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
          writeMode: 'OVERWRITE',
        },
        sources: ['LOAD_DATASET0'],
      },
    },
    outputDataObjects: [
      {
        category: 'Other',
        fields: [
          {
            isPrimaryKey: true,
            keyQualifierField: 'KQ_Id',
            label: 'Id',
            name: 'Id__c',
            type: 'Text',
          },
        ],
        label: 'Output',
        name: 'Output__dll',
        type: 'dataLakeObject',
      },
    ],
  },
});
const schedule = () =>
  JSON.parse('{"frequency":"None","nextScheduledDate":null,"time":null,"type":"None"}');
/**
 * A GET of a stored input: the input plus server-owned fields, a schedule inside the definition
 * and server-owned keys on each output object.
 * @param {object} body Stored create/update input.
 * @returns {object} Native GET response.
 */
const stored = (body) => {
  const value = {
    ...structuredClone(body),
    id,
    status: 'ACTIVE',
    creationType: 'CUSTOM',
    createdDate: '2026-11-15T00:00:00.000Z',
    lastRunStatus: 'NONE',
    actionUrls: { runAction: '/not-sendable' },
  };
  if (value.definition && typeof value.definition === 'object') {
    value.definition.schedule = { frequency: 'Daily', interval: 1, type: 'Daily' };
    for (const output of value.definition.outputDataObjects ?? [])
      Object.assign(output, {
        id: '0gO000000000001AAA',
        createdDate: '2026-11-15T00:00:00.000Z',
        lastModifiedDate: '2026-11-15T00:00:00.000Z',
        status: 'active',
      });
  }
  return value;
};
const runtime = () => stored(input());
const document = () => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  c__dataSpace: 'default',
  definition: input(),
});
/**
 * The document retrieve writes for {@link runtime} and {@link schedule}: a transform without a
 * schedule has no schedule key.
 * @returns {object} Retrieved document.
 */
const observedDocument = () => document();
/**
 * The expected file definition and PUT body of a GET: input keys only, no schedule inside a
 * definition, no server-owned output object keys. Everything else as read.
 * @param {object} raw Native GET.
 * @returns {object} Projected input.
 */
const projected = (raw) => {
  const keys = [
    'name',
    'label',
    'description',
    'type',
    'dataSpaceName',
    'fullRunFrequency',
    'definition',
    'definitions',
  ];
  const result = structuredClone(
    Object.fromEntries(keys.filter((key) => key in raw).map((key) => [key, raw[key]])),
  );
  for (const definition of result.definitions ?? [result.definition]) {
    delete definition.schedule;
    for (const output of definition.outputDataObjects ?? [])
      for (const key of ['id', 'createdDate', 'lastModifiedDate', 'status']) delete output[key];
  }
  return result;
};

test('Transform projects the GET onto its native input, keeping what a full PUT would reset', () => {
  const value = runtime();
  const observed = observeDataTransform(value, schedule());
  assert.deepEqual(observed.document, observedDocument());
  assert.deepEqual(observed.runtime, value);
  assert.equal(observed.targetId, id);
  assert.deepEqual(observed.schedule, schedule());
  assert.deepEqual(buildDataTransformInput(observed.document.definition), input());
  value.definition.nodes.OUTPUT0.parameters.name = 'Changed__dll';
  assert.equal(observed.runtime.definition.nodes.OUTPUT0.parameters.name, 'Output__dll');
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
      c__dataSpace: 'default',
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

for (const [kind, read] of [
  ['STL with a schedule', stlGet],
  ['DCSQL definitions[]', dcsqlGet],
  [
    'on DLOs without dataSpaceName',
    () => {
      // A transform built in the UI on DLOs has no dataSpaceName; its data space comes from its
      // MktDataTransform record (resolved by the caller, here default).
      const raw = stlGet();
      delete raw.dataSpaceName;
      return raw;
    },
  ],
])
  test(`Transform ${kind} GET round-trips to a file and back to the exact PUT body`, async () => {
    const raw = read();
    const expected = projected(raw);
    const observed = observeDataTransform(raw, schedule(), 'deploy', 'default');
    assert.deepEqual(observed.document.definition, expected);
    assert.equal(
      Object.hasOwn(observed.document.definition, 'dataSpaceName'),
      Object.hasOwn(raw, 'dataSpaceName'),
    );
    const definitions = expected.definitions ?? [expected.definition];
    for (const definition of definitions) {
      assert.equal(Object.hasOwn(definition, 'schedule'), false);
      assert.equal(definition.outputDataObjects[0].fields[0].keyQualifierField, 'KQ_Id');
      assert.equal(Object.hasOwn(definition.outputDataObjects[0], 'id'), false);
    }
    assert.equal(expected.fullRunFrequency, 'DAILY');
    if (expected.definition) {
      assert.equal(expected.definition.version, '68.0');
      assert.equal(expected.definition.nodes.OUT0.parameters.writeMode, 'OVERWRITE');
      assert.deepEqual(expected.definition.nodes.OUT0.parameters.dedupOrder, []);
      assert.equal(expected.definition.nodes.LOAD0.parameters.sampleDetails.dataspace, 'default');
    } else assert.deepEqual(expected.definitions[0].manifest.macros, {});
    // Through the file and its admission, into the PUT body.
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-round-trip-'));
    const published = await writeDataTransformDocument(observed.document, cwd, false);
    const [admitted] = await readDeployInputs({ cwd, sourceDir: [published.path] });
    assert.deepEqual(admitted.document, observed.document);
    const calls = [];
    const client = createDataTransformClient(
      {
        instanceUrl: 'https://synthetic.my.salesforce.com',
        request: async (request) => {
          calls.push(request);
          return {};
        },
      },
      '68.0',
      'default',
    );
    await client.update(raw.id, admitted.document.definition);
    assert.equal(calls[0].method, 'PUT');
    assert.deepEqual(JSON.parse(calls[0].body), expected);
  });

test('Transform admission refuses only non-inert JSON, a bad name, both/neither definitions and an unusable data space name', () => {
  const refused = [
    (v) => {
      v.dataSpaceName = '';
    },
    (v) => {
      v.dataSpaceName = 7;
    },
    (v) => {
      v.definitions = [v.definition];
    },
    (v) => {
      delete v.definition;
    },
    (v) => {
      v.name = 'Bad-Name';
    },
    (v) => {
      v.name = 7;
    },
    (v) => {
      Object.defineProperty(v, 'name', { get: () => assert.fail('getter invoked') });
    },
    (v) => {
      v.definition.nodes.loop = v;
    },
    (v) => {
      v.definition.version = Number.NaN;
    },
  ];
  for (const change of refused) {
    const value = input();
    change(value);
    assert.throws(() => buildDataTransformInput(value), /UNSUPPORTED_TRANSFORM_INPUT/u);
  }
  assert.throws(() => buildDataTransformInput([input()]), /UNSUPPORTED_TRANSFORM_INPUT/u);
  // Everything else is Salesforce's decision and is sent as written.
  const accepted = [
    (v) => {
      v.type = 'STREAMING';
    },
    (v) => {
      v.fullRunFrequency = 'Weekly';
    },
    (v) => {
      v.definition.type = 'DCSQL';
      v.definition.version = '56.0';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.writeMode = 'APPEND';
      v.definition.nodes.OUTPUT0.parameters.dedupOrder = ['Id__c'];
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.name = 'Source__dll';
      v.definition.nodes.LOAD_DATASET0.parameters.fields.push('Name__c');
    },
    (v) => {
      v.definition.nodes.extra = { action: 'join' };
      v.tags = { team: 'synthetic' };
    },
    (v) => {
      v.definitions = [v.definition];
      delete v.definition;
    },
    (v) => {
      // A transform on DLOs has no data space.
      delete v.dataSpaceName;
    },
    (v) => {
      // A transform on DMOs of another data space names it.
      v.dataSpaceName = 'dataspace2';
    },
  ];
  for (const change of accepted) {
    const value = input();
    change(value);
    assert.deepEqual(buildDataTransformInput(value), value);
  }
});

test('Transform admits every owner; owner, namespace, status, schedule and frequency are not gates', () => {
  for (const creationType of ['SYSTEM', 'GRAPH', 'IR', 'Custom', undefined]) {
    const value = runtime();
    if (creationType === undefined) delete value.creationType;
    else value.creationType = creationType;
    assert.deepEqual(observeDataTransform(value, schedule()).document, observedDocument());
  }
  const badId = runtime();
  badId.id = 'not-an-id';
  assert.throws(() => observeDataTransform(badId, schedule()), /INVALID_TRANSFORM_RESPONSE/u);
  const packaged = runtime();
  packaged.namespace = 'owned';
  assert.deepEqual(observeDataTransform(packaged, schedule()).document, observedDocument());
  for (const change of [
    (v) => {
      v.status = 'PROCESSING';
    },
    (v) => {
      v.fullRunFrequency = 'WEEKLY';
    },
    (v) => {
      v.definition.nodes.OUTPUT0.parameters.writeMode = 'APPEND';
    },
  ]) {
    const value = runtime();
    change(value);
    assert.doesNotThrow(() => observeDataTransform(value, schedule()));
  }
  assert.doesNotThrow(() =>
    observeDataTransform(runtime(), { ...schedule(), frequency: 'Daily', type: 'Daily' }),
  );
  for (const value of [undefined, [], 'none'])
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
    assert.deepEqual(result.document, observedDocument());
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
    'dataSpaces',
    'setSchedule',
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
  // Any data space name: transform routes take none (names are unique in the org).
  createDataTransformClient(connection, '68.0', 'dataspace2');
  for (const scope of ['', ' padded', undefined])
    assert.throws(() => createDataTransformClient(connection, '68.0', scope));
  for (const selection of ['', '../escape', 'Name?x=1', 'Name/actions/run'])
    await assert.rejects(client.get(selection));
  for (const offset of [-1, 1, 2020, Infinity, '20']) await assert.rejects(client.list(offset));
  const both = { ...input(), definitions: [] };
  await assert.rejects(client.validate(both));
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
  await assert.rejects(client.create({ ...input(), dataSpaceName: '' }));
  assert.equal(calls.length, 7);
  await assert.rejects(client.delete('SyntheticTransform'));
  await client.delete(id);
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[7], {
    method: 'DELETE',
    url: `${prefix}/${id}`,
    headers: { 'X-Chatter-Entity-Encoding': 'false' },
  });
  connection.instanceUrl = 'https://other.my.salesforce.com';
  await assert.rejects(client.delete(id), /TRANSFORM_CONNECTION_DRIFT/u);
  await assert.rejects(client.list());
  await assert.rejects(client.get(id));
  await assert.rejects(client.schedule(id));
  await assert.rejects(client.create(input()));
  await assert.rejects(client.validate(input()));
  await assert.rejects(client.update(id, input()));
  await assert.rejects(client.setSchedule(id, { frequency: 'None' }));
  assert.equal(calls.length, 8);
});

test('Transform schedule PUT sends the schedule as written to the schedule route of an ID', async () => {
  const calls = [];
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    request: async (request) => {
      calls.push(request);
      return {};
    },
  };
  const client = createDataTransformClient(connection, '68.0', 'default');
  const body = {
    frequency: 'Daily',
    interval: 1,
    time: { hour: 3, minute: 15, timeZone: 'GMT' },
    shouldForceSpecifiedMinutes: true,
  };
  await client.setSchedule(id, body);
  assert.deepEqual(
    calls.map(({ method, url, body: sent }) => [method, url, JSON.parse(sent)]),
    [
      [
        'PUT',
        `https://synthetic.my.salesforce.com/services/data/v68.0/ssot/data-transforms/${id}/schedule`,
        body,
      ],
    ],
  );
  await assert.rejects(
    client.setSchedule('SyntheticTransform', body),
    /INVALID_TRANSFORM_TARGET_ID/u,
  );
  for (const bad of [undefined, [], 'Daily'])
    await assert.rejects(client.setSchedule(id, bad), /UNSUPPORTED_TRANSFORM_INPUT/u);
  assert.equal(calls.length, 1);
});

const harness = () => {
  const calls = [];
  let saved = runtime();
  // The org's transform list: empty until a test sets an existing transform.
  let listed = [];
  const client = {
    list: async (offset = 0) => {
      calls.push(['list', offset]);
      return { totalSize: listed.length, dataTransforms: structuredClone(listed) };
    },
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
      saved = stored(body);
      return { id, name: body.name, status: 'PROCESSING' };
    },
    update: async (target, body) => {
      calls.push(['update', target, structuredClone(body)]);
      saved = stored(body);
      return { id, name: body.name, status: 'PROCESSING' };
    },
  };
  return {
    calls,
    client,
    set: (value) => {
      saved = value;
      listed = [{ id, name: value.name }];
    },
    list: (rows) => {
      listed = rows;
    },
  };
};

/**
 * Run the public command with native offline adapters and real immutable input admission.
 * @param {object} flags Flag overrides.
 * @param {object} h Native service harness.
 * @param {Function} [configure] Optional command seam changes.
 * @param {object} [file] Transform document written as the deployed file.
 * @returns {Promise<object>} Result, calls and retained input path.
 */
async function deployTransform(flags = {}, h = harness(), configure = () => {}, file = document()) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-deploy-command-'));
  const published = await writeDataTransformDocument(file, cwd, false);
  const inputs = await readDeployInputs({ cwd, sourceDir: [published.path] });
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['data-transform:SyntheticTransform'],
      'api-version': 'auto',
      // Transforms never need --allow-processing.
      'allow-processing': false,
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
  { dataspace: 'other' },
  { 'api-version': '67.0' },
  { 'api-version': '69.0' },
  { 'api-version': 'latest' },
  { draft: true },
  { 'wait-timeout': 1 },
])
  test(`public Transform rejects before auth ${JSON.stringify(flags)}`, async () => {
    const { result, h } = await deployTransform(flags);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(h.calls, []);
  });

test('the removed transform flags are not deploy flags', () => {
  assert.equal(Deploy.flags['transform-operation'], undefined);
  assert.equal(Deploy.flags['transform-target-id'], undefined);
});

for (const existing of [false, true])
  for (const version of ['auto', '68.0'])
    test(`public Transform GET-only preview ${existing ? 'update' : 'create'}/${version}`, async () => {
      const h = harness();
      if (existing) {
        const current = runtime();
        current.description = 'Old';
        current.definition.description = 'Old';
        h.set(current);
      }
      const { result } = await deployTransform({ preview: true, 'api-version': version }, h);
      assert.equal(result.status, 'success');
      assert.equal(result.result.items[0].outcome, existing ? 'update' : 'create');
      assert.match(result.result.items[0].diagnostics[0].message, /server validation pending/u);
      assert.ok(h.calls.every(([op]) => ['auth', 'list', 'get', 'schedule'].includes(op)));
    });

test('public Transform deploys by name: create, update, unchanged, without --allow-processing', async () => {
  const created = await deployTransform();
  assert.equal(created.result.status, 'success', JSON.stringify(created.result.diagnostics));
  assert.equal(created.result.result.items[0].outcome, 'created');
  assert.equal(created.result.result.items[0].mutation, 'confirmed-created');
  assert.equal(created.result.result.items[0].serverProcessing, true);
  assert.deepEqual(
    created.result.result.items[0].routes.map(({ operation }) => operation),
    ['data-transform.deploy'],
  );
  assert.equal(created.h.calls.filter(([op]) => op === 'create').length, 1);
  assert.equal(created.h.calls.filter(([op]) => op === 'update').length, 0);
  assert.match(created.result.result.items[0].diagnostics[0].message, /not established/u);
  // The name is listed in the org (ignoring case): the deploy updates that target.
  const h = harness();
  const current = runtime();
  current.description = 'Old';
  current.definition.description = 'Old';
  h.set(current);
  h.list([{ id, name: 'SYNTHETICTRANSFORM' }]);
  const updated = await deployTransform({}, h);
  assert.equal(updated.result.status, 'success');
  assert.equal(updated.result.result.items[0].outcome, 'updated');
  assert.equal(updated.result.result.items[0].mutation, 'confirmed-updated');
  assert.equal(h.calls.find(([op]) => op === 'update')[1], id);
  assert.equal(h.calls.filter(([op]) => op === 'create').length, 0);
  h.calls.length = 0;
  const repeat = await deployTransform({}, h);
  assert.equal(repeat.result.result.items[0].outcome, 'unchanged');
  assert.equal(repeat.result.result.items[0].mutation, 'not-attempted');
  assert.ok(h.calls.every(([op]) => ['auth', 'list', 'get', 'schedule'].includes(op)));
});

test('public Transform name matching two transforms is refused before any write', async () => {
  const h = harness();
  h.list([
    { id, name: 'SyntheticTransform' },
    { id: '1dt000000000002AAA', name: 'syntheticTransform' },
  ]);
  const { result } = await deployTransform({}, h);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_NOT_RESOLVED');
  assert.match(result.diagnostics.errors[0].message, /Nothing was changed/u);
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.ok(h.calls.every(([op]) => ['auth', 'list'].includes(op)));
  // Preview reports the same refusal.
  const preview = await deployTransform({ preview: true }, h);
  assert.equal(preview.result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_NOT_RESOLVED');
});

test('public Transform deploys several transforms one after another', async () => {
  const h = harness();
  const { result } = await deployTransform(
    { metadata: ['data-transform:SyntheticTransform', 'data-transform:SecondTransform'] },
    h,
    (command) => {
      const resolve = command.resolveInputs;
      command.resolveInputs = async () => {
        const inputs = await resolve();
        const second = structuredClone(inputs[0]);
        second.document.definition.name = 'SecondTransform';
        second.path = 'second';
        return [...inputs, second];
      };
      command.verifyDataTransformInput = async () => {};
    },
  );
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome]),
    [
      ['SyntheticTransform', 'created'],
      ['SecondTransform', 'created'],
    ],
  );
  assert.deepEqual(
    h.calls.filter(([op]) => op === 'create').map(([, body]) => body.name),
    ['SyntheticTransform', 'SecondTransform'],
  );
  // The first that does not succeed stops the later ones.
  const stopped = harness();
  stopped.client.validate = async () => {
    stopped.calls.push(['validate']);
    return { issues: [{ message: 'refused' }] };
  };
  const blocked = await deployTransform({}, stopped, (command) => {
    const resolve = command.resolveInputs;
    command.resolveInputs = async () => {
      const inputs = await resolve();
      return [...inputs, { ...inputs[0], path: 'second' }];
    };
  });
  assert.equal(blocked.result.status, 'blocked');
  assert.equal(blocked.result.result.items.length, 1);
  assert.equal(stopped.calls.filter(([op]) => op === 'validate').length, 1);
});

test('public Transform deploys a transform selected by --changed-since', async () => {
  const h = harness();
  const { result } = await deployTransform(
    { metadata: undefined, 'changed-since': 'main' },
    h,
    (command, file) => {
      command.selectGitInputs = async ({ ref }) => {
        assert.equal(ref, 'main');
        return command.resolveInputs().then((inputs) => ({
          provenance: { mergeBase: 'synthetic' },
          paths: [file],
          capturedInputs: inputs,
        }));
      };
    },
  );
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.selection.changedSince, 'main');
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome]),
    [['data-transform', 'created']],
  );
});

test('public Transform pre/post dispatch failures stay truthful', async () => {
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
  h.list([{ id, name: 'SyntheticTransform' }]);
  const missing = await deployTransform({}, h);
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

for (const phase of ['validation', 'update-read', 'preview', 'unchanged'])
  test(`public Transform real byte drift during ${phase} prevents dispatch`, async () => {
    const h = harness();
    if (phase === 'unchanged') h.set(runtime());
    if (phase === 'update-read') {
      const current = runtime();
      current.description = 'Old';
      h.set(current);
    }
    const flags = phase === 'preview' ? { preview: true } : {};
    const { result } = await deployTransform(flags, h, (_command, file) => {
      const drift = async () => appendFile(file, ' ');
      if (phase === 'validation')
        h.client.validate = async () => {
          await drift();
          return { issues: [] };
        };
      else if (phase === 'preview') {
        const list = h.client.list;
        h.client.list = async (offset) => {
          await drift();
          return list(offset);
        };
      } else
        h.client.schedule = async () => {
          await drift();
          return schedule();
        };
    });
    assert.notEqual(result.status, 'success');
    assert.equal(
      h.calls.some(([op]) => op === 'create' || op === 'update'),
      false,
    );
    if (phase !== 'preview') assert.equal(result.result.items[0].mutation, 'not-attempted');
  });

test('public Transform human output reports server processing honestly', async () => {
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
  test(`public Transform refuses late ${field} drift during awaited final input verification`, async () => {
    const h = harness();
    const current = runtime();
    current.description = 'Original';
    current.definition.description = 'Original';
    h.set(current);
    let verifications = 0;
    let scheduleChanged = false;
    h.client.schedule = async () =>
      scheduleChanged ? { ...schedule(), type: 'Daily', frequency: 'DAILY' } : schedule();
    const { result } = await deployTransform({}, h, (command) => {
      command.verifyDataTransformInput = async (input) => {
        await verifyDataTransformInputDigest(input);
        if (++verifications === 2) {
          await Promise.resolve();
          if (field === 'schedule') scheduleChanged = true;
          else {
            current[field] = 'Concurrent edit';
            current.definition[field] = 'Concurrent edit';
            h.set(current);
          }
        }
      };
    });
    assert.equal(verifications, 2);
    assert.equal(result.status, 'blocked');
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
  await executeDataTransformDeploy(document(), { operation: 'create' }, h.client, {
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

const dlo = (name) => ({
  name,
  id: name === 'Source__dll' ? '1dl000000000001AAA' : '1dl000000000002AAA',
  label: name,
  category: 'Other',
  status: 'ACTIVE',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'ID', dataType: 'Text', isPrimaryKey: true }],
});

test('Shared DLO resolution returns detached identity and complete definition', async () => {
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
  const result = await executeDataTransformDeploy(document(), { operation: 'create' }, h.client);
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
      executeDataTransformDeploy(document(), { operation: 'create' }, bad.client),
      (error) => error === failure,
    );
    assert.deepEqual(
      bad.calls.map(([op]) => op),
      ['validate', 'create'],
    );
  }
});

test('Transform create reads back the normalized stored form and reports created, not a mismatch', async () => {
  // Hand-written DCSQL with a mixed-case frequency; Salesforce stores WEEKLY, drops the version
  // and adds manifest macros/sources and output field key qualifiers.
  const raw = dcsqlGet();
  raw.fullRunFrequency = 'WEEKLY';
  const authored = {
    name: raw.name,
    label: raw.label,
    description: raw.description,
    type: 'BATCH',
    dataSpaceName: 'default',
    fullRunFrequency: 'Weekly',
    definitions: [
      {
        type: 'DCSQL',
        version: '68.0',
        manifest: {
          nodes: structuredClone(raw.definitions[0].manifest.nodes),
        },
        outputDataObjects: [
          {
            name: 'SyntheticNew__dll',
            type: 'dataLakeObject',
            category: 'Other',
            label: 'Synthetic New',
            fields: [{ name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true }],
          },
        ],
      },
    ],
  };
  const calls = [];
  const client = {
    validate: async () => ({ issues: [] }),
    create: async (body) => {
      calls.push(['create', structuredClone(body)]);
      return { id: raw.id, name: raw.name, status: 'ACTIVE' };
    },
    get: async () => structuredClone(raw),
    schedule: async () => schedule(),
  };
  const result = await executeDataTransformDeploy(
    {
      schemaVersion: 1,
      kind: 'data-transform',
      apiVersion: '68.0',
      c__dataSpace: 'default',
      definition: authored,
    },
    { operation: 'create' },
    client,
  );
  assert.equal(result.operation, 'create');
  assert.equal(result.serverProcessing, undefined);
  assert.deepEqual(calls, [['create', authored]]);
  assert.deepEqual(result.observation.document.definition, projected(raw));
});

test('Transform full-input PUT preserves settings and canonical repeat is GET-only', async () => {
  const h = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  desired.definition.fullRunFrequency = 'WEEKLY';
  desired.definition.definition.nodes.OUTPUT0.parameters.writeMode = 'APPEND';
  const result = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(result.operation, 'update');
  const write = h.calls.find(([op]) => op === 'update');
  assert.deepEqual(write, ['update', id, desired.definition]);
  h.calls.length = 0;
  const repeat = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(repeat.operation, 'unchanged');
  assert.deepEqual(
    h.calls.map(([op]) => op),
    ['get', 'schedule'],
  );
});

test('Transform preflight blocks unreadable or renamed targets and failed validation', async () => {
  for (const [mutate, code] of [
    [
      (h) => {
        h.client.get = async () => {
          throw Object.assign(new Error('access ambiguous'), { statusCode: 404 });
        };
      },
      /access ambiguous/u,
    ],
    [
      (h) => {
        const value = runtime();
        value.name = 'Other';
        h.set(value);
      },
      /TRANSFORM_IDENTITY_MISMATCH/u,
    ],
  ]) {
    const h = harness();
    mutate(h);
    const desired = document();
    desired.definition.description = 'changed';
    await assert.rejects(
      executeDataTransformDeploy(desired, { operation: 'update', targetId: id }, h.client),
      code,
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
      preflightDataTransformDeploy(document(), { operation: 'create' }, h.client),
      /TRANSFORM_VALIDATION_FAILED/u,
    );
    assert.equal(h.calls.length, 0);
  }
});

test('Transform execution detects validation-time target drift and readback identity mismatch', async () => {
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
    executeDataTransformDeploy(desired, { operation: 'update', targetId: id }, h.client, {
      verifyInput,
    }),
    /TRANSFORM_TARGET_DRIFT/u,
  );
  assert.equal(
    h.calls.some(([op]) => op === 'update'),
    false,
  );
  for (const change of [
    (value) => {
      value.id = 'not-an-id';
    },
    (value) => {
      value.name = 'OtherTransform';
      value.definition.name = 'OtherTransform';
    },
  ]) {
    const bad = harness();
    bad.client.get = async () => {
      const value = runtime();
      change(value);
      return value;
    };
    await assert.rejects(
      executeDataTransformDeploy(document(), { operation: 'create' }, bad.client),
      /TRANSFORM_READBACK_MISMATCH/u,
    );
  }
  // A readback that differs only in the stored definition is the stored form, not a mismatch.
  const normalized = harness();
  normalized.client.get = async () => {
    const value = runtime();
    value.description = 'stored differently';
    value.fullRunFrequency = 'WEEKLY';
    return value;
  };
  const created = await executeDataTransformDeploy(
    document(),
    { operation: 'create' },
    normalized.client,
  );
  assert.equal(created.operation, 'create');
  const processing = harness();
  const value = runtime();
  value.status = 'PROCESSING';
  processing.set(value);
  const result = await executeDataTransformDeploy(
    document(),
    { operation: 'create' },
    processing.client,
  );
  assert.equal(result.serverProcessing, true);
});

test('Transform update sends changed logic as written and surfaces Salesforce refusal', async () => {
  const h = harness();
  const changed = document();
  changed.definition.definition.nodes.OUTPUT0.parameters.name = 'OtherOutput__dll';
  h.client.update = async (target, body) => {
    h.calls.push(['update', target, structuredClone(body)]);
    throw new Error('Salesforce: output object cannot be changed');
  };
  await assert.rejects(
    executeDataTransformDeploy(changed, { operation: 'update', targetId: id }, h.client),
    /output object cannot be changed/u,
  );
  const sent = h.calls.filter(([op]) => op === 'update');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0][2], changed.definition);
});

test('Transform write acknowledgment never substitutes for the ID readback', async () => {
  for (const receipt of [undefined, {}, { id: '1dt000000000002AAA', name: 'Other' }]) {
    const h = harness();
    h.client.create = async () => {
      h.calls.push(['create']);
      return receipt;
    };
    await assert.rejects(executeDataTransformDeploy(document(), { operation: 'create' }, h.client));
    assert.deepEqual(
      h.calls.map(([op]) => op),
      ['validate', 'create'],
    );
  }
  for (const mutate of [
    (h) => {
      h.client.get = async () => {
        throw Object.assign(new Error('readback access denied'), { statusCode: 404 });
      };
    },
    (h) => {
      h.client.get = async () => ({ ...runtime(), id: '1dt000000000002AAA' });
    },
  ]) {
    const h = harness();
    mutate(h);
    await assert.rejects(executeDataTransformDeploy(document(), { operation: 'create' }, h.client));
    assert.equal(h.calls.filter(([op]) => op === 'create').length, 1);
    assert.equal(
      h.calls.some(([op]) => op === 'update'),
      false,
    );
  }
  const update = harness();
  const desired = document();
  desired.definition.description = 'Changed';
  const failure = new Error('unknown PUT outcome');
  update.client.update = async () => {
    update.calls.push(['update']);
    throw failure;
  };
  await assert.rejects(
    executeDataTransformDeploy(desired, { operation: 'update', targetId: id }, update.client),
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
    // A 503 read is retried by the shared transport (three attempts); the DELETE never is.
    const reads = statusCode === 503 ? 3 : 1;
    assert.equal(calls, reads);
    await assert.rejects(client.delete(id));
    assert.equal(calls, reads + 1);
  }
});

const deleteHarness = (raw = runtime()) => {
  const h = harness();
  h.set(raw);
  let deleted = false;
  h.client.list = async () => {
    h.calls.push(['list']);
    return {
      totalSize: deleted ? 0 : 1,
      dataTransforms: deleted ? [] : [{ id: raw.id, name: raw.name }],
    };
  };
  h.client.delete = async (targetId) => {
    h.calls.push(['delete', targetId]);
    deleted = true;
  };
  // Virtual clock: the settlement poll sleeps without real waiting.
  let clock = 0;
  h.sleeps = [];
  h.options = {
    targetId: raw.id,
    confirmDelete: true,
    verifyInput: async () => {},
    now: () => clock,
    delay: async (milliseconds) => {
      h.sleeps.push(milliseconds);
      clock += milliseconds;
    },
  };
  return h;
};

test('Transform deletion of a PROCESSING transform is refused before the DELETE, preview too', async () => {
  for (const status of ['PROCESSING', 'processing'])
    for (const preview of [false, true]) {
      const value = runtime();
      value.status = status;
      const h = deleteHarness(value);
      await assert.rejects(deleteDataTransform(document(), h.client, { ...h.options, preview }), {
        code: 'TRANSFORM_DELETE_PROCESSING',
      });
      assert.deepEqual(
        h.calls.filter(([op]) => op === 'delete'),
        [],
      );
    }
  // Other states are Salesforce's to decide.
  for (const status of ['ACTIVE', 'ERROR']) {
    const value = runtime();
    value.status = status;
    const h = deleteHarness(value);
    const result = await deleteDataTransform(document(), h.client, h.options);
    assert.equal(result.outcome, 'deleted', status);
  }
});

test('Transform deletion polls the list until the transform is gone, within a bound', async () => {
  // Listed for two reads after the DELETE (as Salesforce does for ~10-25 s), then absent.
  const lagging = deleteHarness();
  let reads = 0;
  let deleted = false;
  lagging.client.delete = async (targetId) => {
    lagging.calls.push(['delete', targetId]);
    deleted = true;
  };
  lagging.client.list = async () => {
    lagging.calls.push(['list']);
    const gone = deleted && ++reads > 2;
    return { totalSize: gone ? 0 : 1, dataTransforms: gone ? [] : [{ id, name: input().name }] };
  };
  const confirmed = await deleteDataTransform(document(), lagging.client, lagging.options);
  assert.equal(confirmed.outcome, 'deleted');
  assert.equal(confirmed.mutation, 'confirmed-deleted');
  assert.deepEqual(lagging.sleeps, [5000, 5000]);
  assert.equal(lagging.calls.filter(([op]) => op === 'delete').length, 1);
  // Still listed after the bound: unconfirmed, never replayed.
  const stuck = deleteHarness();
  stuck.client.delete = async (targetId) => {
    stuck.calls.push(['delete', targetId]);
  };
  const unconfirmed = await deleteDataTransform(document(), stuck.client, stuck.options);
  assert.equal(unconfirmed.outcome, 'deletion-unconfirmed');
  assert.equal(unconfirmed.mutation, 'acknowledged');
  assert.equal(
    stuck.sleeps.reduce((sum, value) => sum + value, 0),
    60_000,
  );
  assert.equal(stuck.calls.filter(([op]) => op === 'delete').length, 1);
});

test('Transform delete accepts a base file whose enums differ only in letter case', async () => {
  // A hand-written file (`Daily`, `batch`) against the stored `DAILY` / `BATCH` is no drift.
  const cased = document();
  cased.definition.fullRunFrequency = 'Daily';
  cased.definition.type = 'batch';
  const h = deleteHarness();
  const result = await deleteDataTransform(cased, h.client, h.options);
  assert.equal(result.outcome, 'deleted');
  const relabelled = document();
  relabelled.definition.label = 'synthetic transform';
  const drift = deleteHarness();
  await assert.rejects(
    deleteDataTransform(relabelled, drift.client, drift.options),
    /TRANSFORM_TARGET_DRIFT/u,
  );
  assert.equal(drift.calls.filter(([op]) => op === 'delete').length, 0);
});

test('Transform deletion previews zero writes, requires confirmation and independently settles one DELETE', async () => {
  for (const [options, outcome, writes] of [
    [{ preview: true }, 'preview', 0],
    [{ confirmDelete: false }, 'blocked', 0],
    [{}, 'deleted', 1],
  ]) {
    const h = deleteHarness();
    Object.assign(h.options, options);
    const result = await deleteDataTransform(document(), h.client, h.options);
    assert.equal(result.outcome, outcome);
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, writes);
    assert.equal(
      h.calls.some(([op]) => ['create', 'update', 'validate'].includes(op)),
      false,
    );
    if (writes) {
      assert.equal(result.mutation, 'confirmed-deleted');
      assert.deepEqual(
        h.calls.find(([op]) => op === 'delete'),
        ['delete', id],
      );
    }
  }
});

for (const [kind, raw] of [
  ['DCSQL definitions[]', dcsqlGet],
  [
    'non-key STL mapping',
    () => {
      const value = stlGet();
      value.definition.nodes.OUT0.parameters.fieldsMappings = [
        { sourceField: 'Name__c', targetField: 'Name__c' },
      ];
      return value;
    },
  ],
])
  test(`Transform deletion of a ${kind} transform reaches DELETE and settles on absence`, async () => {
    const value = raw();
    const h = deleteHarness(value);
    const desired = observeDataTransform(value, schedule()).document;
    const result = await deleteDataTransform(desired, h.client, h.options);
    assert.equal(result.outcome, 'deleted');
    assert.equal(result.mutation, 'confirmed-deleted');
    assert.deepEqual(
      h.calls.filter(([op]) => op === 'delete'),
      [['delete', value.id]],
    );
  });

test('Transform deletion rejects ambiguous absence, unresolved targets and fresh drift before writes', async () => {
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
      const raw = runtime();
      raw.id = '1dt000000000002AAA';
      h.set(raw);
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
    await assert.rejects(deleteDataTransform(document(), h.client, h.options));
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
  await assert.rejects(deleteDataTransform(desired, h.client, h.options));
  assert.equal(
    h.calls.some(([op]) => op === 'delete'),
    false,
  );
});

// Lenient retrieve step 6b: delete reads the file and the GET as retrieve writes them.
const lenientRuntime = () => ({ ...runtime(), futureTransformSetting: 'kept' });
test('a retrieved transform file with a key the plugin does not model is deleted', async () => {
  const h = deleteHarness(lenientRuntime());
  const desired = observeDataTransform(lenientRuntime(), schedule(), 'retrieve').document;
  assert.equal(desired.definition.futureTransformSetting, 'kept');
  const result = await deleteDataTransform(desired, h.client, h.options);
  assert.equal(result.outcome, 'deleted');
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
});
test('-m data-transform:Name reads a GET with keys the plugin does not model as retrieve does', async () => {
  const h = deleteHarness(lenientRuntime());
  const command = Object.create(Delete.prototype);
  command.createDataTransformClient = () => h.client;
  const source = await command.readDeleteSource('data-transform', lenientRuntime().name, {});
  assert.equal(source.desired.definition.futureTransformSetting, 'kept');
  const result = await deleteDataTransform(source.desired, h.client, h.options);
  assert.equal(result.outcome, 'deleted');
});
test('a lenient transform delete still refuses another definition', async () => {
  const desired = observeDataTransform(lenientRuntime(), schedule(), 'retrieve').document;
  for (const change of [
    (raw) => {
      raw.futureTransformSetting = 'changed in the org';
    },
  ]) {
    const raw = lenientRuntime();
    change(raw);
    const h = deleteHarness(raw);
    await assert.rejects(deleteDataTransform(desired, h.client, h.options));
    assert.equal(
      h.calls.some(([op]) => op === 'delete'),
      false,
    );
  }
  const h = deleteHarness(lenientRuntime());
  h.options.confirmDelete = false;
  const result = await deleteDataTransform(desired, h.client, h.options);
  assert.equal(result.outcome, 'blocked');
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

test('Transform delete acknowledgment is not settlement and never authorizes mutation replay', async () => {
  for (const mode of ['present', 'same-name', 'partial', 'read404', 'delete-error']) {
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
      return {
        totalSize: 1,
        dataTransforms: [
          { id: mode === 'present' ? id : '1dt000000000002AAA', name: input().name },
        ],
      };
    };
    const result = await deleteDataTransform(document(), h.client, h.options);
    assert.equal(result.outcome, 'deletion-unconfirmed', mode);
    assert.equal(result.mutation, mode === 'delete-error' ? 'unknown' : 'acknowledged', mode);
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  }
});

/**
 * Run the public delete command with offline native adapters, inside a project holding the
 * transform's canonical local file. The definition and target ID are read from the org by name.
 * @param {object} flags Flag overrides.
 * @param {object} h Delete harness.
 * @param {Function} configure Optional command/input fault injection.
 * @returns {Promise<object>} Result and harness.
 */
async function deleteTransformCommand(flags = {}, h = deleteHarness(), configure = () => {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-delete-command-'));
  const published = await writeDataTransformDocument(document(), cwd, false);
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['data-transform:SyntheticTransform'],
      'delete-dlo': false,
      preview: false,
      ...flags,
    },
  });
  // The settlement poll uses the harness's virtual clock.
  command.deleteDataTransform = async (value, client, options) =>
    deleteDataTransform(value, client, {
      ...options,
      now: h.options.now,
      delay: h.options.delay,
    });
  command.resolveConnection = async () => {
    h.calls.push(['auth']);
    return { getUsername: () => 'offline' };
  };
  command.createDataTransformClient = (_connection, version, scope) => {
    assert.equal(version, '68.0');
    assert.equal(scope, flags.dataspace ?? 'default');
    return h.client;
  };
  command.createDloClient = () => assert.fail('Transform must not spawn general DLO CLI');
  command.jsonEnabled = () => true;
  command.log = () => {};
  configure(command, published.path);
  const exit = process.exitCode;
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return { result: await command.run(), h, file: published.path };
  } finally {
    process.chdir(previous);
    process.exitCode = exit;
  }
}

for (const flags of [
  { 'delete-dlo': true },
  { 'api-version': '67.0' },
  { 'api-version': 'latest' },
  { metadata: ['data-transform'] },
  { metadata: ['data-transform:SyntheticTransform', 'data-transform:SyntheticTransform'] },
])
  test(`public Transform delete rejects before auth ${JSON.stringify(flags)}`, async () => {
    const { result, h } = await deleteTransformCommand(flags);
    assert.equal(result.status, 'blocked');
    assert.equal(
      h.calls.some(([op]) => ['auth', 'delete'].includes(op)),
      false,
    );
  });

test('public Transform delete refuses a transform of another data space than the run before any DELETE', async () => {
  const { result, h } = await deleteTransformCommand({ dataspace: 'dataspace2' });
  assert.equal(result.status, 'blocked');
  assert.equal(
    h.calls.some(([op]) => op === 'delete'),
    false,
  );
  const [error] = result.diagnostics.errors;
  assert.equal(error.code, 'TRANSFORM_DATASPACE_MISMATCH');
  assert.match(error.message, /in the data space default .*run's data space is dataspace2/u);
});

test('public Transform delete by name: preview GET-only, then one DELETE without --confirm-delete', async () => {
  const preview = await deleteTransformCommand({ preview: true });
  assert.equal(preview.result.status, 'success');
  assert.equal(preview.result.result.items[0].outcome, 'delete');
  assert.equal(preview.result.result.items[0].operation, 'preview');
  assert.deepEqual(
    preview.result.result.items[0].routes.map(({ operation }) => operation),
    ['data-transform.get'],
  );
  assert.equal(
    preview.h.calls.some(([op]) => op === 'delete'),
    false,
  );
  assert.deepEqual(preview.result.result.items[0].localFiles, [
    { path: preview.file, exists: true },
  ]);
  const done = await deleteTransformCommand();
  assert.equal(done.result.status, 'success');
  assert.equal(done.result.result.items[0].outcome, 'deleted');
  assert.equal(done.result.result.items[0].mutation, 'confirmed-deleted');
  assert.equal(done.h.calls.filter(([op]) => op === 'delete').length, 1);
  // The target ID came from the transform list; the canonical local file is removed.
  assert.ok(done.h.calls.some((call) => call[0] === 'delete' && call[1] === id));
  assert.deepEqual(done.result.result.items[0].removedLocalFiles, [
    { path: done.file, outcome: 'removed' },
  ]);
});

test('public Transform delete of a name the org does not have is unchanged, also beside another', async () => {
  const { result, h } = await deleteTransformCommand({
    metadata: ['data-transform:SyntheticTransform', 'data-transform:Other'],
  });
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [
      ['SyntheticTransform', 'deleted', 'confirmed-deleted'],
      ['Other', 'unchanged', 'not-attempted'],
    ],
  );
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
});

test('public Transform delete refuses a name two transforms share ignoring case', async () => {
  const h = deleteHarness();
  h.client.list = async () => ({
    totalSize: 2,
    dataTransforms: [
      { id, name: input().name },
      { id: '1dt000000000002AAA', name: input().name.toUpperCase() },
    ],
  });
  const { result } = await deleteTransformCommand({}, h);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_NOT_RESOLVED');
  assert.deepEqual(result.result.items, []);
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 0);
});

test('public Transform delete reports unconfirmed settlement and unknown HTTP outcome nonzero without replay', async () => {
  for (const mode of ['present', 'error']) {
    const h = deleteHarness();
    h.client.delete = async () => {
      h.calls.push(['delete']);
      if (mode === 'error') throw new Error('uncertain');
    };
    h.client.list = async () => ({
      totalSize: 1,
      dataTransforms: [{ id, name: input().name }],
    });
    const { result } = await deleteTransformCommand({}, h);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items[0].outcome, 'deletion-unconfirmed');
    assert.equal(result.result.items[0].mutation, mode === 'error' ? 'unknown' : 'acknowledged');
    assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_DELETE_UNCONFIRMED');
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  }
});

test('Transform delete service refuses a target changed during the final awaited input check', async () => {
  const h = deleteHarness();
  let checks = 0;
  h.options.verifyInput = async () => {
    // The second check is the last one before the final read.
    if (++checks < 2) return;
    const raw = runtime();
    raw.label = 'Changed';
    raw.definition.label = 'Changed';
    h.set(raw);
  };
  await assert.rejects(
    deleteDataTransform(document(), h.client, h.options),
    /TRANSFORM_TARGET_DRIFT/u,
  );
  assert.equal(
    h.calls.some(([op]) => op === 'delete'),
    false,
  );
});

test('public Transform delete refuses an org definition changed during the inventory check', async () => {
  const h = deleteHarness();
  const list = h.client.list;
  let lists = 0;
  h.client.list = async (offset) => {
    // The first list resolves the name; the second is the delete's own inventory check.
    if (++lists === 2) {
      const raw = runtime();
      raw.label = 'Changed';
      raw.definition.label = 'Changed';
      h.set(raw);
    }
    return list(offset);
  };
  const { result } = await deleteTransformCommand({}, h);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_TARGET_DRIFT');
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
  );
  assert.equal(result.operation, 'update');
});

// System and packaged transforms: the plugin sends the write and Salesforce decides (live API 68,
// 2026-11-18: a system Dg_ transform answers 400 JSON_PARSER_ERROR to an update, 403 to a schedule
// PUT and to a DELETE). Packaged (namespaced) transforms are untested live.
/**
 * A GET of a system transform made by a data graph, as read live: the definition hidden.
 * @returns {object} Native GET.
 */
const systemRuntime = () => ({
  actionUrls: {
    action: 'BatchAction',
    cancelAction: `/services/data/v68.0/ssot/data-transforms/SyntheticTransform/actions/cancel`,
    refreshStatusAction: `/services/data/v68.0/ssot/data-transforms/SyntheticTransform/actions/refresh-status`,
    retryAction: `/services/data/v68.0/ssot/data-transforms/SyntheticTransform/actions/retry`,
    runAction: `/services/data/v68.0/ssot/data-transforms/SyntheticTransform/actions/run`,
  },
  createdBy: { id: '005000000000001AAA', name: 'Automated Process', profilePhotoUrl: '/photo' },
  createdDate: '2026-11-18T15:23:19.000Z',
  creationSource: 'Data Graph',
  creationType: 'SYSTEM',
  dataSpaceName: 'default',
  definitions: [{ type: 'STL_HIDDEN', version: '68.0' }],
  fullRunFrequency: 'DAILY',
  id,
  label: 'SyntheticTransform',
  lastModifiedBy: {
    id: '005000000000001AAA',
    name: 'Automated Process',
    profilePhotoUrl: '/photo',
  },
  lastModifiedDate: '2026-11-18T15:25:05.000Z',
  lastRunDate: '2026-11-18T15:25:04.000Z',
  lastRunStatus: 'IN_PROGRESS',
  name: 'SyntheticTransform',
  status: 'ACTIVE',
  type: 'BATCH',
  url: '/services/data/v68.0/ssot/data-transforms/SyntheticTransform',
});
const refusal = (status) => new ConnectError('REQUEST_FAILED', status);

for (const [kind, raw] of [
  ['system', systemRuntime],
  [
    'packaged',
    () => {
      const value = runtime();
      value.namespace = 'owned';
      return value;
    },
  ],
])
  test(`Transform update of a ${kind} transform sends the PUT and reports Salesforce's 4xx as rejected`, async () => {
    const h = harness();
    h.set(raw());
    const desired = observeDataTransform(raw(), schedule()).document;
    desired.definition.label = 'Changed';
    const answer = refusal(400);
    h.client.update = async (target, body) => {
      h.calls.push(['update', target, structuredClone(body)]);
      throw answer;
    };
    const error = await executeDataTransformDeploy(
      desired,
      { operation: 'update', targetId: id },
      h.client,
    ).catch((error_) => error_);
    assert.equal(error, answer);
    assert.equal(rejectedTransformWrite(error), true);
    assert.deepEqual(
      h.calls.filter(([op]) => op === 'update'),
      [['update', id, desired.definition]],
    );
  });

test('public Transform deploy of a system transform Salesforce refuses is failed, mutation rejected', async () => {
  const h = harness();
  h.set(systemRuntime());
  h.client.update = async (target, body) => {
    h.calls.push(['update', target, structuredClone(body)]);
    throw refusal(400);
  };
  const file = observeDataTransform(systemRuntime(), schedule()).document;
  file.definition.label = 'Changed';
  const { result } = await deployTransform({}, h, () => {}, file);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].outcome, 'failed');
  assert.equal(result.result.items[0].mutation, 'rejected');
  assert.equal(h.calls.filter(([op]) => op === 'update').length, 1);
  assert.match(result.diagnostics.errors.at(-1).message, /rejected the request \(HTTP 400\)/u);
});

for (const [kind, raw] of [
  ['system', systemRuntime],
  [
    'packaged',
    () => {
      const value = runtime();
      value.namespace = 'owned';
      return value;
    },
  ],
]) {
  test(`Transform delete of a ${kind} transform sends the DELETE`, async () => {
    const value = raw();
    const h = deleteHarness(value);
    const desired = observeDataTransform(value, schedule()).document;
    const result = await deleteDataTransform(desired, h.client, h.options);
    assert.equal(result.outcome, 'deleted');
    assert.deepEqual(
      h.calls.filter(([op]) => op === 'delete'),
      [['delete', id]],
    );
  });
  test(`Transform delete of a ${kind} transform reports Salesforce's 403 as rejected`, async () => {
    const value = raw();
    const h = deleteHarness(value);
    const answer = refusal(403);
    h.client.delete = async (targetId) => {
      h.calls.push(['delete', targetId]);
      throw answer;
    };
    const desired = observeDataTransform(value, schedule()).document;
    const result = await deleteDataTransform(desired, h.client, h.options);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'rejected');
    assert.equal(result.error, answer);
    assert.equal(h.calls.filter(([op]) => op === 'delete').length, 1);
  });
}

test('Transform delete keeps a 404 or a non-HTTP DELETE error unconfirmed', async () => {
  for (const answer of [refusal(404), refusal(500), new Error('socket closed')]) {
    const h = deleteHarness();
    h.client.delete = async () => {
      throw answer;
    };
    const result = await deleteDataTransform(document(), h.client, h.options);
    assert.equal(result.outcome, 'deletion-unconfirmed');
    assert.equal(result.mutation, 'unknown');
  }
});

// Schedule: retrieve writes it projected, deploy sends it with its own PUT when it differs.
const dailyRead = () => ({
  frequency: 'Daily',
  interval: 1,
  nextScheduledDate: '2026-11-19T03:15:00.000Z',
  time: { hour: 3, minute: 15, timezone: { gmtOffset: 0, name: 'GMT', zoneId: 'GMT' } },
  type: 'Daily',
});
const daily = () => ({
  frequency: 'Daily',
  interval: 1,
  time: { hour: 3, minute: 15, timeZone: 'GMT' },
});

for (const [kind, read, expected] of [
  ['never scheduled', schedule, undefined],
  ['turned off', () => ({ schedule: {}, type: 'Transform' }), undefined],
  ['daily', dailyRead, daily()],
  [
    'hourly',
    () => ({
      daysOfWeek: ['Monday', 'Friday'],
      frequency: 'Hourly',
      interval: 6,
      nextScheduledDate: '2026-11-19T06:00:00.000Z',
      time: {
        hour: 0,
        minute: 30,
        timezone: { gmtOffset: 1, name: 'CET', zoneId: 'Europe/Berlin' },
      },
      type: 'Hourly',
    }),
    {
      daysOfWeek: ['Monday', 'Friday'],
      frequency: 'Hourly',
      interval: 6,
      time: { hour: 0, minute: 30, timeZone: 'Europe/Berlin' },
    },
  ],
  [
    'system (per definition)',
    () => ({
      schedule: {
        Dg_Synthetic_Day0_1: {
          daysOfWeek: ['Wednesday'],
          frequency: 'Weekly',
          nextScheduledDate: '2026-11-25T15:04:00.000Z',
          time: { hour: 15, minute: 4, timezone: { gmtOffset: 0, name: 'GMT', zoneId: 'GMT' } },
          type: 'Weekly',
        },
      },
      type: 'Transform',
    }),
    {
      schedule: {
        Dg_Synthetic_Day0_1: {
          daysOfWeek: ['Wednesday'],
          frequency: 'Weekly',
          time: { hour: 15, minute: 4, timeZone: 'GMT' },
        },
      },
    },
  ],
])
  test(`Transform retrieve writes the ${kind} schedule projected onto the schedule PUT keys`, async () => {
    const observed = await retrieveDataTransform(
      id,
      { get: async () => runtime(), schedule: async () => read() },
      'retrieve',
    );
    assert.deepEqual(observed.document.schedule, expected);
    assert.equal(Object.hasOwn(observed.document, 'schedule'), expected !== undefined);
    assert.deepEqual(observed.schedule, read());
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-schedule-retrieve-'));
    const written = await writeDataTransformDocument(observed.document, cwd, false);
    const saved = JSON.parse(readFileSync(written.path, 'utf8'));
    assert.deepEqual(saved.schedule, expected);
    // The written file deploys unchanged: no definition or schedule write.
    const h = harness();
    h.client.schedule = async () => read();
    const plan = await preflightDataTransformDeploy(
      saved,
      { operation: 'update', targetId: id },
      h.client,
    );
    assert.equal(plan.operation, 'unchanged');
  });

test('Transform retrieve leaves the schedule out when its read fails, with a warning', async () => {
  const warnings = [];
  const observed = await retrieveDataTransform(
    id,
    {
      get: async () => runtime(),
      schedule: async () => {
        throw refusal(500);
      },
    },
    'retrieve',
    warnings,
  );
  assert.equal(Object.hasOwn(observed.document, 'schedule'), false);
  assert.match(warnings[0], /leaves the schedule alone/u);
});

/**
 * A harness whose schedule is read and written like the org's.
 * @param {object} [read] Schedule GET of the org.
 * @returns {object} Harness with schedule calls recorded.
 */
const scheduleHarness = (read = schedule()) => {
  const h = harness();
  h.set(runtime());
  let current = read;
  h.client.schedule = async () => {
    h.calls.push(['schedule']);
    return structuredClone(current);
  };
  h.client.setSchedule = async (target, body) => {
    h.calls.push(['setSchedule', target, structuredClone(body)]);
    current =
      body.frequency === 'None'
        ? schedule()
        : {
            ...structuredClone(body),
            nextScheduledDate: '2026-11-19T03:15:00.000Z',
            time: {
              hour: body.time.hour,
              minute: body.time.minute,
              timezone: { gmtOffset: 0, name: 'GMT', zoneId: body.time.timeZone },
            },
            type: body.frequency,
          };
    return {};
  };
  return h;
};

test('Transform deploy of a file without schedule never sends a schedule PUT', async () => {
  const h = scheduleHarness(dailyRead());
  const changed = document();
  changed.definition.description = 'Changed';
  const result = await executeDataTransformDeploy(
    changed,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(result.operation, 'update');
  assert.equal(result.scheduleWritten, undefined);
  assert.equal(h.calls.filter(([op]) => op === 'setSchedule').length, 0);
  const unchanged = scheduleHarness(dailyRead());
  const repeat = await executeDataTransformDeploy(
    document(),
    { operation: 'update', targetId: id },
    unchanged.client,
  );
  assert.equal(repeat.operation, 'unchanged');
  assert.equal(unchanged.calls.filter(([op]) => op === 'setSchedule').length, 0);
});

test('Transform deploy sends a changed schedule with its own PUT after the definition, then reads it back', async () => {
  const h = scheduleHarness();
  const desired = { ...document(), schedule: { ...daily(), shouldForceSpecifiedMinutes: true } };
  desired.definition.description = 'Changed';
  const result = await executeDataTransformDeploy(
    desired,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(result.operation, 'update');
  assert.equal(result.scheduleWritten, true);
  const writes = h.calls.filter(([op]) => ['update', 'setSchedule'].includes(op));
  assert.deepEqual(
    writes.map(([op]) => op),
    ['update', 'setSchedule'],
  );
  assert.deepEqual(writes[1], ['setSchedule', id, desired.schedule]);
  // Read back after the schedule PUT.
  assert.deepEqual(
    h.calls.slice(h.calls.indexOf(writes[1]) + 1).map(([op]) => op),
    ['get', 'schedule'],
  );
  assert.equal(result.observation.document.schedule.frequency, 'Daily');
  // Only the schedule differs: one schedule PUT, no definition PUT.
  const only = scheduleHarness();
  const scheduled = await executeDataTransformDeploy(
    { ...document(), schedule: daily() },
    { operation: 'update', targetId: id },
    only.client,
  );
  assert.equal(scheduled.operation, 'update');
  assert.deepEqual(
    only.calls.filter(([op]) => ['update', 'setSchedule'].includes(op)).map(([op]) => op),
    ['setSchedule'],
  );
});

test('Transform deploy of { frequency: None } turns the schedule off; an equal schedule is unchanged', async () => {
  const h = scheduleHarness(dailyRead());
  const off = await executeDataTransformDeploy(
    { ...document(), schedule: { frequency: 'None' } },
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(off.operation, 'update');
  assert.deepEqual(
    h.calls.filter(([op]) => op === 'setSchedule'),
    [['setSchedule', id, { frequency: 'None' }]],
  );
  for (const [read, file] of [
    [dailyRead(), daily()],
    [dailyRead(), { ...daily(), frequency: 'DAILY' }],
    [schedule(), { frequency: 'None' }],
    [{ schedule: {}, type: 'Transform' }, { frequency: 'None' }],
  ]) {
    const same = scheduleHarness(read);
    const result = await executeDataTransformDeploy(
      { ...document(), schedule: file },
      { operation: 'update', targetId: id },
      same.client,
    );
    assert.equal(result.operation, 'unchanged');
    assert.equal(same.calls.filter(([op]) => op === 'setSchedule').length, 0);
  }
});

test('Transform create sends a schedule other than None after the POST; None needs no PUT', async () => {
  const h = scheduleHarness();
  const created = await executeDataTransformDeploy(
    { ...document(), schedule: daily() },
    { operation: 'create' },
    h.client,
  );
  assert.equal(created.operation, 'create');
  assert.deepEqual(
    h.calls.filter(([op]) => ['create', 'setSchedule'].includes(op)).map(([op]) => op),
    ['create', 'setSchedule'],
  );
  const none = scheduleHarness();
  await executeDataTransformDeploy(
    { ...document(), schedule: { frequency: 'None' } },
    { operation: 'create' },
    none.client,
  );
  assert.equal(none.calls.filter(([op]) => op === 'setSchedule').length, 0);
});

test('Transform schedule PUT refused as the first write is rejected; a readback with another frequency is a mismatch', async () => {
  const h = scheduleHarness();
  const answer = refusal(403);
  h.client.setSchedule = async () => {
    throw answer;
  };
  const error = await executeDataTransformDeploy(
    { ...document(), schedule: daily() },
    { operation: 'update', targetId: id },
    h.client,
  ).catch((error_) => error_);
  assert.equal(error, answer);
  assert.equal(rejectedTransformWrite(error), true);
  // After a definition PUT the schedule refusal is its own outcome: definition written.
  const second = scheduleHarness();
  const late = refusal(400);
  second.client.setSchedule = async () => {
    throw late;
  };
  const changed = { ...document(), schedule: daily() };
  changed.definition.description = 'Changed';
  const lateError = await executeDataTransformDeploy(
    changed,
    { operation: 'update', targetId: id },
    second.client,
  ).catch((error_) => error_);
  assert.ok(lateError instanceof DataTransformScheduleError);
  assert.equal(lateError.code, 'TRANSFORM_SCHEDULE_REJECTED');
  assert.equal(lateError.definition, 'update');
  assert.equal(lateError.cause, late);
  assert.equal(rejectedTransformWrite(lateError), false);
  const ignored = scheduleHarness();
  ignored.client.setSchedule = async () => ({});
  await assert.rejects(
    executeDataTransformDeploy(
      { ...document(), schedule: daily() },
      { operation: 'update', targetId: id },
      ignored.client,
    ),
    /TRANSFORM_READBACK_MISMATCH/u,
  );
});

test('Transform deploy re-read before the writes compares the schedule as projected', async () => {
  const h = scheduleHarness(dailyRead());
  let reads = 0;
  // A moved next run time between the reads is no drift.
  h.client.schedule = async () => {
    h.calls.push(['schedule']);
    reads++;
    return { ...dailyRead(), nextScheduledDate: `2026-11-${19 + reads}T03:15:00.000Z` };
  };
  const changed = document();
  changed.definition.description = 'Changed';
  const result = await executeDataTransformDeploy(
    changed,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(result.operation, 'update');
  // A schedule changed between the reads is drift: nothing is written.
  const drift = scheduleHarness(dailyRead());
  await assert.rejects(
    executeDataTransformDeploy(
      { ...document(), schedule: { frequency: 'None' } },
      { operation: 'update', targetId: id },
      drift.client,
      {
        verifyInput: async () => {
          drift.client.schedule = async () => ({ ...dailyRead(), interval: 2 });
        },
      },
    ),
    /TRANSFORM_TARGET_DRIFT/u,
  );
  assert.equal(
    drift.calls.some(([op]) => ['update', 'setSchedule'].includes(op)),
    false,
  );
});

test('public Transform preview shows a planned schedule change without writing', async () => {
  const h = scheduleHarness();
  const { result } = await deployTransform({ preview: true }, h, () => {}, {
    ...document(),
    schedule: daily(),
  });
  assert.equal(result.status, 'success');
  const item = result.result.items[0];
  assert.equal(item.outcome, 'update');
  assert.deepEqual(
    item.diagnostics.map(({ code }) => code),
    ['TRANSFORM_PREVIEW_LIMITATIONS', 'TRANSFORM_SCHEDULE_CHANGE'],
  );
  assert.match(item.diagnostics[1].message, /runs on it there/u);
  assert.ok(h.calls.every(([op]) => ['auth', 'list', 'get', 'schedule'].includes(op)));
  const executed = await deployTransform({}, scheduleHarness(), () => {}, {
    ...document(),
    schedule: { frequency: 'None' },
  });
  assert.equal(executed.result.result.items[0].outcome, 'unchanged');
  const turnedOff = scheduleHarness(dailyRead());
  const off = await deployTransform({}, turnedOff, () => {}, {
    ...document(),
    schedule: { frequency: 'None' },
  });
  assert.equal(off.result.result.items[0].outcome, 'updated');
  assert.match(
    off.result.result.items[0].diagnostics[0].message,
    /turns the transform schedule off/u,
  );
});

test('a schedule that is not an object is refused, naming the key', () => {
  // eslint-disable-next-line unicorn/no-null -- A JSON file can hold null.
  for (const value of [[], 'Daily', null])
    assert.throws(
      () => validateDataTransformDocument({ ...document(), schedule: value }),
      /UNSUPPORTED_TRANSFORM_INPUT/u,
    );
});

/**
 * The schedule GET of a system transform: the graph's weekly slot per definition.
 * @returns {object} Native schedule GET.
 */
const systemSchedule = () => ({
  schedule: {
    Dg_Synthetic_Day0_1: {
      daysOfWeek: ['Wednesday'],
      frequency: 'Weekly',
      nextScheduledDate: '2026-11-25T15:23:00.000Z',
      time: { hour: 15, minute: 23, timezone: { gmtOffset: 0, name: 'GMT', zoneId: 'GMT' } },
      type: 'Weekly',
    },
  },
  type: 'Transform',
});

test('a retrieved system transform file deploys: the PUT is sent and Salesforce decides', async () => {
  const observed = await retrieveDataTransform(
    id,
    { get: async () => systemRuntime(), schedule: async () => systemSchedule() },
    'retrieve',
  );
  assert.equal(Object.hasOwn(observed.document.definition, 'creationSource'), false);
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-system-retrieve-'));
  const written = await writeDataTransformDocument(observed.document, cwd, false);
  const [input] = await readDeployInputs({ cwd, sourceDir: [written.path] });
  // The strict deploy read admits the file; the deploy sends a changed label.
  const file = structuredClone(input.document);
  file.definition.label = 'Changed';
  const h = harness();
  h.set(systemRuntime());
  h.client.schedule = async () => systemSchedule();
  h.client.update = async (target, body) => {
    h.calls.push(['update', target, structuredClone(body)]);
    throw refusal(400);
  };
  const error = await executeDataTransformDeploy(
    file,
    { operation: 'update', targetId: id },
    h.client,
  ).catch((error_) => error_);
  assert.equal(rejectedTransformWrite(error), true);
  assert.deepEqual(
    h.calls.filter(([op]) => op === 'update').map((call) => call[2]),
    [file.definition],
  );
});

test('Transform deploy sends shouldForceSpecifiedMinutes, the GET never returns it: the repeat is unchanged', async () => {
  const h = scheduleHarness();
  const file = { ...document(), schedule: { ...daily(), shouldForceSpecifiedMinutes: true } };
  const first = await executeDataTransformDeploy(
    file,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(first.operation, 'update');
  // The harness answers the GET without the write-only key, like Salesforce.
  const repeat = await executeDataTransformDeploy(
    file,
    { operation: 'update', targetId: id },
    h.client,
  );
  assert.equal(repeat.operation, 'unchanged');
  assert.equal(h.calls.filter(([op]) => op === 'setSchedule').length, 1);
  // Delete of that file finds no drift.
  const d = deleteHarness();
  d.client.schedule = h.client.schedule;
  const deleted = await deleteDataTransform(file, d.client, d.options);
  assert.equal(deleted.outcome, 'deleted');
});

/**
 * A harness whose transform reads PROCESSING for a number of reads after a definition write.
 * @param {number} processingReads Reads that answer PROCESSING.
 * @returns {object} Harness with a fake clock.
 */
const processingHarness = (processingReads) => {
  const h = scheduleHarness();
  const get = h.client.get;
  let written = false;
  let left = processingReads;
  for (const op of ['create', 'update']) {
    const send = h.client[op];
    h.client[op] = async (...arguments_) => {
      written = true;
      return send(...arguments_);
    };
  }
  h.client.get = async (selection) => {
    const value = await get(selection);
    if (written && left > 0) {
      left--;
      value.status = 'PROCESSING';
    }
    return value;
  };
  let clock = 0;
  h.sleeps = [];
  h.timing = {
    now: () => clock,
    delay: async (milliseconds) => {
      h.sleeps.push(milliseconds);
      clock += milliseconds;
    },
  };
  return h;
};

test('Transform deploy waits until a written transform is no longer processing before the schedule PUT', async () => {
  for (const selection of [{ operation: 'create' }, { operation: 'update', targetId: id }]) {
    const h = processingHarness(3);
    const file = { ...document(), schedule: daily() };
    file.definition.description = 'Changed';
    const result = await executeDataTransformDeploy(file, selection, h.client, h.timing);
    assert.equal(result.scheduleWritten, true);
    assert.deepEqual(h.sleeps, [5000, 5000, 5000]);
    const ops = h.calls.map(([op]) => op);
    const put = ops.indexOf('setSchedule');
    assert.deepEqual(ops.slice(put - 4, put), ['get', 'get', 'get', 'get']);
  }
});

test('Transform deploy does not send the schedule when the written transform never settles', async () => {
  const h = processingHarness(Number.POSITIVE_INFINITY);
  const file = { ...document(), schedule: daily() };
  file.definition.description = 'Changed';
  const error = await executeDataTransformDeploy(
    file,
    { operation: 'update', targetId: id },
    h.client,
    h.timing,
  ).catch((error_) => error_);
  assert.ok(error instanceof DataTransformScheduleError);
  assert.equal(error.code, 'TRANSFORM_SCHEDULE_NOT_SENT');
  assert.equal(error.definition, 'update');
  assert.equal(h.calls.filter(([op]) => op === 'setSchedule').length, 0);
  assert.equal(
    h.sleeps.reduce((sum, milliseconds) => sum + milliseconds, 0),
    300_000,
  );
});

test('public Transform deploy: a schedule rejected after the definition write is its own outcome', async () => {
  const h = scheduleHarness();
  h.client.setSchedule = async () => {
    throw refusal(400);
  };
  const file = { ...document(), schedule: daily() };
  file.definition.description = 'Changed';
  const { result } = await deployTransform({}, h, () => {}, file);
  assert.equal(result.status, 'failed');
  const item = result.result.items[0];
  assert.equal(item.outcome, 'failed');
  assert.equal(item.mutation, 'confirmed-updated');
  assert.equal(item.diagnostics[0].code, 'TRANSFORM_SCHEDULE_REJECTED');
  assert.match(
    item.diagnostics[0].message,
    /definition was updated; Salesforce rejected the schedule/u,
  );
  assert.equal(result.diagnostics.errors.at(-1).code, 'TRANSFORM_SCHEDULE_REJECTED');
  assert.match(result.diagnostics.errors.at(-1).message, /HTTP 400/u);
});

test('an unscheduled transform retrieved and deployed into an org with a schedule leaves that schedule alone', async () => {
  const observed = await retrieveDataTransform(
    id,
    { get: async () => runtime(), schedule: async () => schedule() },
    'retrieve',
  );
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'transform-unscheduled-roundtrip-'));
  const written = await writeDataTransformDocument(observed.document, cwd, false);
  const saved = JSON.parse(readFileSync(written.path, 'utf8'));
  assert.equal(Object.hasOwn(saved, 'schedule'), false);
  const target = scheduleHarness(dailyRead());
  const changed = structuredClone(saved);
  changed.definition.description = 'Changed';
  for (const file of [saved, changed]) {
    await executeDataTransformDeploy(file, { operation: 'update', targetId: id }, target.client);
    assert.equal(target.calls.filter(([op]) => op === 'setSchedule').length, 0);
  }
});
