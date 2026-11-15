import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { retrieveNativeDataGraph } from '../lib/services/command-native-data-graph.js';
import { writeDataGraphDocument } from '../lib/artifacts/write-data-graph.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import {
  nativeDataGraphDocumentFromResponse,
  validateNativeDataGraphDocument,
} from '../lib/artifacts/native-data-graph-document.js';
import { sortKeysDeep } from '../lib/artifacts/verbatim-document.js';

// eslint-disable-next-line unicorn/no-null -- The API 68 GET reports unset values as JSON null.
const unset = null;
const name = 'LenientGraph';
const fields = ['ssot__Id__c', 'ssot__FirstName__c'];

/**
 * A ready native API68 graph GET with one related object.
 * @param {string} status Graph status.
 * @returns {object} GET body.
 */
const graph = (status = 'ready') => ({
  name,
  label: 'Lenient graph',
  description: '',
  dataspaceName: 'default',
  id: 'graph-id',
  createdDate: '2026-11-15T09:00:00.000Z',
  primaryObjectName: 'ssot__Individual__dlm',
  kind: 'CdpDataGraphOutputRepresentation',
  type: 'none',
  status,
  version: '3',
  extendedProperties: '',
  fullRefreshConfig: { schedule: { frequency: 1, timeGranularity: 'day' } },
  incrementalRefreshConfig: { enabled: false },
  idDmoName: 'Lenient_ID__dlm',
  valuesDmoName: 'Lenient_VALUE__dlm',
  dayZeroMappingDevName: 'LenientMapping',
  dayZeroTransformDevName: 'LenientTransform',
  sourceObject: {
    fragmentDMOName: 'Lenient_FRAGMENT__dlm',
    name: 'ssot__Individual__dlm',
    label: 'Individual',
    projectedName: 'ssot__Individual__dlm',
    type: 'standard',
    jsonPath: '$',
    categoryDevName: 'Profile',
    referenceDeveloperName: 'Individual',
    id: 'node-id',
    devName: 'RootNode',
    dependency: [],
    path: [],
    recencyCriteria: [],
    relatedSegments: [],
    fields: fields.map((sourceFieldName, index) => ({
      id: `field-${index}`,
      devName: `Field${index}`,
      name: `Field${index}`,
      sourceFieldName,
      dataType: 'Text',
      isKeyColumn: index === 0,
      isProjected: true,
      usageTag: 'none',
      dependency: [],
      fieldRoles: [],
    })),
    relatedObjects: [
      {
        name: 'ssot__ContactPointEmail__dlm',
        label: 'Email',
        projectedName: 'ssot__ContactPointEmail__dlm',
        type: 'standard',
        jsonPath: '$.ssot__ContactPointEmail__dlm',
        categoryDevName: 'Profile',
        referenceDeveloperName: 'ContactPointEmail',
        id: 'child-id',
        devName: 'ChildNode',
        dependency: [],
        relatedSegments: [],
        path: [{ devName: 'Join0', fieldName: 'ssot__PartyId__c', parentFieldName: 'ssot__Id__c' }],
        recencyCriteria: [],
        topKFilterCriteria: {
          limit: 5,
          orderCriteria: [{ fieldApiName: 'ssot__Id__c', sortOrder: 'desc' }],
        },
        fields: [
          {
            id: 'child-field',
            devName: 'ChildField',
            name: 'ChildField',
            sourceFieldName: 'ssot__Id__c',
            dataType: 'Text',
            isKeyColumn: true,
            isProjected: true,
            usageTag: 'none',
            dependency: [],
            fieldRoles: [],
          },
        ],
        relatedObjects: [],
      },
    ],
  },
});

/**
 * Offline graph readers over one GET body; the root DMO must never be read on retrieve.
 * @param {object} body Graph GET body.
 * @returns {object} Read context.
 */
const context = (body) => ({
  orgId: '00D000000000001AAA',
  check() {},
  get: async () => ({ status: 200, body: structuredClone(body) }),
  root: async () => assert.fail('retrieve reads no root DMO'),
  metadata: async () => assert.fail('no metadata read'),
  inventory: async () => assert.fail('no inventory read'),
  query: async () => assert.fail('no query'),
});

/**
 * New OS-temp Salesforce project.
 * @returns {Promise<string>} Project root.
 */
async function project() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-lenient-graph-'));
  await writeFile(
    path.join(cwd, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }),
  );
  await mkdir(path.join(cwd, 'force-app', 'main', 'default'), { recursive: true });
  return cwd;
}

/**
 * Retrieve one graph through the command with offline readers and the real writer.
 * @param {object} body Graph GET body.
 * @param {string} [cwd] Existing project.
 * @returns {Promise<{result: object, cwd: string}>} Envelope and project.
 */
async function retrieveCommand(body, cwd) {
  const root = cwd ?? (await project());
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '68.0',
      metadata: [`data-graph:${name}`],
      'output-dir': root,
      overwrite: false,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getConnection: () => ({}), getOrgId: () => 'org' });
  command.nativeGraphContext = async () => context(body);
  command.retrieveNativeGraph = retrieveNativeDataGraph;
  command.writeDataGraph = writeDataGraphDocument;
  const before = process.exitCode;
  try {
    return { result: await command.run(), cwd: root };
  } finally {
    process.exitCode = before;
  }
}

const graphFile = (cwd) =>
  path.join(
    cwd,
    'force-app',
    'main',
    'default',
    'data360',
    'dataGraphs',
    `${name}.native-dataGraph.json`,
  );

/**
 * Assert that deploy refuses the file and names the key path.
 * @param {string} cwd Project.
 * @param {string} keyPath Expected key path.
 */
async function deployNames(cwd, keyPath) {
  await assert.rejects(
    readDeployInputs({ cwd, metadata: [`data-graph:${name}`] }),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      error.message.includes(`The data graph cannot be deployed: ${keyPath} `),
  );
}

test('retrieve takes unknown settings nested deeper than deploy admits', () => {
  const body = graph();
  let deep = { leaf: true };
  for (let level = 0; level < 30; level++) deep = { level: deep };
  body.futureSetting = deep;
  assert.deepEqual(
    nativeDataGraphDocumentFromResponse(body, 'retrieve').definition.futureSetting,
    deep,
  );
  assert.throws(() => nativeDataGraphDocumentFromResponse(body), {
    code: 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION',
  });
});

test('retrieve keeps unknown top-level, node and field keys; deploy names the key', async () => {
  const body = graph();
  const deep = { nested: [1, { leaf: true }] };
  body.futureSetting = deep;
  body.sourceObject.futureNodeKey = 'node';
  body.sourceObject.relatedObjects[0].fields[0].futureFieldKey = 7;
  body.sourceObject.relatedObjects[0].path[0].futureJoinKey = unset;
  const { result, cwd } = await retrieveCommand(body);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(graphFile(cwd), 'utf8'));
  const d = saved.definition;
  assert.deepEqual(d.futureSetting, deep);
  assert.equal(d.sourceObject.futureNodeKey, 'node');
  assert.equal(d.sourceObject.relatedObjects[0].fields[0].futureFieldKey, 7);
  assert.equal(d.sourceObject.relatedObjects[0].path[0].futureJoinKey, unset);
  // Server facts are still left out.
  for (const key of ['id', 'status', 'version', 'kind', 'extendedProperties', 'createdDate'])
    assert.equal(Object.hasOwn(d, key), false, key);
  assert.equal(Object.hasOwn(d.sourceObject, 'categoryDevName'), false);
  await deployNames(cwd, 'definition.futureSetting');
  delete saved.definition.futureSetting;
  assert.throws(
    () => validateNativeDataGraphDocument(saved),
    (error) => error.message.includes('definition.sourceObject.futureNodeKey is not a setting'),
  );
  delete saved.definition.sourceObject.futureNodeKey;
  assert.throws(
    () => validateNativeDataGraphDocument(saved),
    (error) =>
      error.message.includes(
        'definition.sourceObject.relatedObjects[0].fields[0].futureFieldKey is not a setting',
      ),
  );
});

test('a graph in editing status without its generated names is retrieved', async () => {
  const body = graph('editing');
  for (const key of [
    'idDmoName',
    'valuesDmoName',
    'dayZeroMappingDevName',
    'dayZeroTransformDevName',
  ])
    delete body[key];
  delete body.sourceObject.fragmentDMOName;
  const { result, cwd } = await retrieveCommand(body);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(graphFile(cwd), 'utf8'));
  assert.equal(saved.definition.idDmoName, undefined);
  // A file with nothing unknown still deploys.
  const [input] = await readDeployInputs({ cwd, metadata: [`data-graph:${name}`] });
  assert.equal(input.document.definition.name, name);
});

test('empty or null generated names of a ready graph are dropped on retrieve only', () => {
  const body = graph();
  body.valuesDmoName = '';
  body.dayZeroTransformDevName = unset;
  const document = nativeDataGraphDocumentFromResponse(body, 'retrieve');
  assert.equal(Object.hasOwn(document.definition, 'valuesDmoName'), false);
  assert.equal(Object.hasOwn(document.definition, 'dayZeroTransformDevName'), false);
  assert.equal(document.definition.idDmoName, 'Lenient_ID__dlm');
  assert.throws(() => nativeDataGraphDocumentFromResponse(body), {
    code: 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION',
  });
});

test('null for unset values is retrieved; deploy names the key', async () => {
  const body = graph();
  body.description = unset;
  body.incrementalRefreshConfig = unset;
  body.sourceObject.recencyCriteria = unset;
  body.sourceObject.fields[1].fieldRoles = unset;
  body.sourceObject.fields[1].usageTag = unset;
  const child = body.sourceObject.relatedObjects[0];
  child.topKFilterCriteria.limit = unset;
  child.filterCriteria = unset;
  const { result, cwd } = await retrieveCommand(body);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(graphFile(cwd), 'utf8'));
  const d = saved.definition;
  assert.equal(d.description, unset);
  assert.equal(d.incrementalRefreshConfig, unset);
  assert.equal(d.sourceObject.recencyCriteria, unset);
  assert.equal(d.sourceObject.fields[1].fieldRoles, unset);
  assert.equal(d.sourceObject.fields[1].usageTag, unset);
  assert.equal(d.sourceObject.relatedObjects[0].topKFilterCriteria.limit, unset);
  assert.equal(d.sourceObject.relatedObjects[0].filterCriteria, unset);
  await deployNames(cwd, 'definition.description');
});

for (const [label, change] of [
  ['a schedule of another shape', (b) => (b.fullRefreshConfig = { cron: '0 0 * * *' })],
  ['a schedule with an extra key', (b) => (b.fullRefreshConfig.schedule.startTime = '00:00')],
  ['a jsonPath of another form', (b) => (b.sourceObject.relatedObjects[0].jsonPath = '$.other')],
])
  test(`${label} is written verbatim with the graph GET`, async () => {
    const body = graph();
    change(body);
    const { result, cwd } = await retrieveCommand(body);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.result.items[0].verbatim, {
      reason: 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION',
    });
    const saved = JSON.parse(await readFile(graphFile(cwd), 'utf8'));
    assert.equal(saved.kind, 'native-data-graph');
    assert.deepEqual(saved.verbatim.native, sortKeysDeep(body));
    await assert.rejects(readDeployInputs({ cwd, metadata: [`data-graph:${name}`] }), {
      code: 'VERBATIM_NOT_DEPLOYABLE',
    });
  });

test('the item failure names the code behind NATIVE_GRAPH_RETRIEVE_BLOCKED', async () => {
  const cwd = await project();
  await mkdir(path.dirname(graphFile(cwd)), { recursive: true });
  await writeFile(graphFile(cwd), '{}\n');
  const { result } = await retrieveCommand(graph(), cwd);
  assert.notEqual(result.status, 'success');
  const [diagnostic] = result.diagnostics.errors;
  assert.equal(diagnostic.code, 'NATIVE_GRAPH_RETRIEVE_BLOCKED');
  assert.match(diagnostic.message, /Cause: OVERWRITE_REQUIRED\.$/u);
});
