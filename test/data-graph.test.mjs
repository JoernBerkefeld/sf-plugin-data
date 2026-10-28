import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import { McpExecuteClient } from '../lib/transport/mcp-execute.js';
import {
  documentDependencyNode,
  orderDependencyNodes,
} from '../lib/artifacts/dependency-selection.js';
import {
  dataGraphFields,
  projectDataGraph,
  serializeDataGraphDocument,
  validateDataGraphDocument,
} from '../lib/artifacts/data-graph-document.js';
import {
  retrieveDataGraph,
  verifyDataGraphTransform,
} from '../lib/services/retrieve-data-graph.js';
import { preflightDataGraphDeploy } from '../lib/services/preflight-data-graph-deploy.js';
import { bindDataGraphDependencies } from '../lib/services/bind-data-graph-dependencies.js';
import {
  dataGraphPollBudget,
  executeDataGraphDeploy,
} from '../lib/services/execute-data-graph-deploy.js';

import { irFixture } from './identity-resolution-fixtures.mjs';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';

const selection = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };

const outputIdentity = {
  owner: { kind: 'identity-resolution', dataSpace: 'default', apiName: 'Individual_Qualified' },
  entity: { kind: 'dmo', dataSpace: 'default', apiName: 'ssot__Individual__dlm' },
  role: 'unified',
};

test('portable Graph owner reference extracts exact IR edge without generated identity', () => {
  const document = projectDataGraph(graph(), 'SyntheticGraph').candidate;
  document.spec.primaryObjectName = structuredClone(outputIdentity);
  document.spec.sourceObject.name = structuredClone(outputIdentity);
  document.spec.sourceObject.devName = structuredClone(outputIdentity);
  const admitted = validateDataGraphDocument(document);
  const node = documentDependencyNode(admitted);
  assert.deepEqual(node.dependencies, [outputIdentity.owner]);
  const owner = { identity: outputIdentity.owner, dependencies: [] };
  const expected = [
    'identity-resolution:default:Individual_Qualified',
    'data-graph:default:SyntheticGraph',
  ];
  assert.deepEqual(orderDependencyNodes([node, owner]), expected);
  assert.deepEqual(orderDependencyNodes([owner, node]), expected);
  const text = serializeDataGraphDocument(admitted);
  assert.equal(text.includes('owner-id'), false);
  assert.equal(text.includes('UnifiedssotIndividualMkt__dlm'), false);
  document.spec.primaryObjectName.owner.apiName = 'ChangedOwner';
  assert.equal(admitted.spec.primaryObjectName.owner.apiName, 'Individual_Qualified');
});

test('portable Graph refuses unsupported owner identity, role, entity and root disagreement', () => {
  for (const modify of [
    (root) => {
      root.role = 'link';
    },
    (root) => {
      root.entity.apiName = 'ssot__ContactPointEmail__dlm';
    },
    (root) => {
      root.owner.kind = 'dmo';
    },
    (root) => {
      root.owner.dataSpace = 'other';
    },
    (root) => {
      root.owner.apiName = '';
    },
    (root) => {
      root.owner.id = 'source-id';
    },
    (root) => {
      root.sourceApiName = 'GeneratedSource__dlm';
    },
  ]) {
    const document = projectDataGraph(graph(), 'SyntheticGraph').candidate;
    const root = structuredClone(outputIdentity);
    modify(root);
    document.spec.primaryObjectName = root;
    document.spec.sourceObject.name = structuredClone(root);
    document.spec.sourceObject.devName = structuredClone(root);
    assert.throws(() => validateDataGraphDocument(document));
  }
  const document = projectDataGraph(graph(), 'SyntheticGraph').candidate;
  document.spec.primaryObjectName = structuredClone(outputIdentity);
  assert.throws(() => validateDataGraphDocument(document));
});

test('owner-qualified Graph binding refuses unavailable exact owner without guessed DMO reads', async () => {
  const document = projectDataGraph(graph(), 'SyntheticGraph').candidate;
  document.spec.primaryObjectName = structuredClone(outputIdentity);
  document.spec.sourceObject.name = structuredClone(outputIdentity);
  document.spec.sourceObject.devName = structuredClone(outputIdentity);
  let reads = 0;
  await assert.rejects(
    bindDataGraphDependencies(document, connection, selection, 'default', async () => {
      reads++;
      throw new Error('must not read a guessed name');
    }),
  );
  assert.equal(reads, 0);
});
/**
 * Build exact owner-returned outputs and independent Graph root representations.
 * @returns {object} Synthetic target-only binding harness.
 */
function ownedRootFixture() {
  const pair = irFixture();
  const projection = projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2');
  const identity = projection.expectations.outputs[0].identity;
  const document = projectDataGraph(graph(), 'SyntheticGraph').candidate;
  document.spec.primaryObjectName = structuredClone(identity);
  document.spec.sourceObject.name = structuredClone(identity);
  document.spec.sourceObject.devName = structuredClone(identity);
  const reads = [];
  let owners = 0;
  const acquireOwner = async (_connection, name) => {
    assert.equal(name, 'Individual_A1b2');
    owners++;
    return {
      identity: projection.candidate.identity,
      ...structuredClone(projection),
      blockers: [],
    };
  };
  const acquire = async (name) => {
    reads.push(name);
    const index = projection.expectations.outputs.findIndex((item) => item.sourceApiName === name);
    assert.notEqual(index, -1);
    const role = projection.expectations.outputs[index].identity.role;
    const names =
      role === 'unified'
        ? ['ssot__Id__c', 'ssot__FirstName__c', 'ssot__LastName__c']
        : ['UnifiedRecordId__c'];
    const creationType = role === 'unified' ? 'Derived' : 'Bridge';
    return {
      detail: {
        name,
        id: `target-only-${index}`,
        dataSpaceName: 'default',
        creationType,
        fields: names.map((name) => ({ name, type: 'Text' })),
      },
      metadata: [
        {
          fullName: name,
          mktDataModelAttributes: { dataSpaceName: 'default', creationType },
          fields: names.map((fullName, index) => ({
            fullName,
            type: 'Text',
            mktDataModelFieldAttributes: { primaryIndexOrder: index === 0 ? '1' : '' },
          })),
        },
      ],
    };
  };
  return { document, projection, acquire, acquireOwner, reads, owners: () => owners };
}

test('Graph owner binding verifies all twelve outputs then independently guards exact logical root', async () => {
  const f = ownedRootFixture();
  const proof = await bindDataGraphDependencies(
    f.document,
    connection,
    selection,
    'default',
    f.acquire,
    f.acquireOwner,
  );
  assert.equal(f.reads.length, 13);
  assert.equal(f.owners(), 4);
  assert.equal(proof.root.targetApiName, f.projection.expectations.outputs[0].sourceApiName);
  assert.equal(proof.root.targetId, 'target-only-0');
  assert.deepEqual(proof.root.identity, f.document.spec.primaryObjectName);
  assert.deepEqual(
    await bindDataGraphDependencies(
      f.document,
      connection,
      selection,
      'default',
      f.acquire,
      f.acquireOwner,
    ),
    proof,
  );
  assert.equal(serializeDataGraphDocument(f.document).includes('target-only'), false);
  assert.throws(() =>
    projectDataGraph({ ...graph(), primaryObjectName: proof.root.targetApiName }, 'SyntheticGraph'),
  );
});

for (const mode of [
  'owner',
  'output',
  'field',
  'key',
  'root-id',
  'creation-type',
  'owner-drift',
  'scope-drift',
])
  test(`Graph exact owner/output/root qualification refuses ${mode}`, async () => {
    const f = ownedRootFixture();
    let owners = 0;
    const acquireOwner = async (...arguments_) => {
      const owner = await f.acquireOwner(...arguments_);
      owners++;
      if (mode === 'owner') owner.identity.apiName = 'WrongOwner';
      if (mode === 'owner-drift' && owners === 4) owner.expectations.facade.label = 'Drift';
      return owner;
    };
    const localSelection = { ...selection };
    const acquire = async (name) => {
      const resource = await f.acquire(name);
      if (mode === 'output' && f.reads.length === 12) resource.detail.id = 'target-only-0';
      if (f.reads.length === 13) {
        if (mode === 'field') resource.detail.fields[2].type = 'Number';
        if (mode === 'key')
          resource.metadata[0].fields[1].mktDataModelFieldAttributes.primaryIndexOrder = '1';
        if (mode === 'root-id') resource.detail.id = 'changed-root';
        if (mode === 'creation-type') resource.detail.creationType = 'Standard';
        if (mode === 'scope-drift') localSelection.soapNumeric = '65.0';
      }
      return resource;
    };
    await assert.rejects(
      bindDataGraphDependencies(
        f.document,
        connection,
        localSelection,
        'default',
        acquire,
        acquireOwner,
      ),
    );
  });

test('private qualified binding does not open unsupported owner Graph preview or execution', async () => {
  const f = ownedRootFixture();
  let writes = 0;
  const options = {
    verifyDependencies: (value, conn, version, space) =>
      bindDataGraphDependencies(value, conn, version, space, f.acquire, f.acquireOwner),
    readGraph: async () => {
      const raw = graph();
      const name = f.projection.expectations.outputs[0].sourceApiName;
      raw.primaryObjectName = name;
      raw.sourceObject.name = name;
      raw.sourceObject.projectedName = name;
      return raw;
    },
    readTransform: async () => transform(),
    allowProcessing: true,
    verifyInput: async () => {},
    recordObservation: async () => {},
    mutate: async () => {
      writes++;
      throw new Error('must not write');
    },
  };
  const preview = await preflightDataGraphDeploy(
    f.document,
    connection,
    selection,
    'default',
    options,
  );
  assert.equal(preview.outcome, 'blocked');
  const execution = await executeDataGraphDeploy(
    f.document,
    connection,
    selection,
    'default',
    options,
  );
  assert.equal(execution.mutation, 'not-attempted');
  assert.equal(writes, 0);
});

test('Graph owner binding fingerprints root configuration drift without exposing IDs in document', async () => {
  const f = ownedRootFixture();
  const first = await bindDataGraphDependencies(
    f.document,
    connection,
    selection,
    'default',
    f.acquire,
    f.acquireOwner,
  );
  const next = await bindDataGraphDependencies(
    f.document,
    connection,
    selection,
    'default',
    async (name) => {
      const raw = await f.acquire(name);
      raw.detail.unrelatedConfiguration = 'changed';
      return raw;
    },
    f.acquireOwner,
  );
  assert.notEqual(first.fingerprint, next.fingerprint);
});

const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '67.0',
};
const intent = {
  apiName: 'SyntheticGraph',
  ownerId: 'owner-id',
  dataSpace: 'default',
  creationMode: 'DEFAULT',
};

/**
 * Independently authored observed-schema fixture without private identities.
 * @param {boolean} updated Appended field.
 * @returns {object} Graph.
 */
function graph(updated = false) {
  return {
    createdBy: 'synthetic-user',
    createdDate: 'Thu Jan 01 09:00:00 GMT 2026',
    dataspaceName: 'default',
    dayZeroMappingDevName: 'ReturnedMapping',
    dayZeroTransformDevName: 'ReturnedTransform',
    description: 'Preserved description',
    extendedProperties: '',
    fullRefreshConfig: { schedule: { frequency: 7, timeGranularity: 'day' } },
    id: 'owner-id',
    idDmoLabel: 'Synthetic Id',
    idDmoName: 'SyntheticId__dlm',
    incrementalRefreshConfig: { enabled: false },
    kind: 'CdpDataGraphOutputRepresentation',
    label: 'Synthetic Graph',
    modifiedDate: updated ? 'Changed date' : 'Original date',
    name: 'SyntheticGraph',
    primaryObjectLabel: 'Unified Individual',
    primaryObjectName: 'UnifiedssotIndividualMkt__dlm',
    sourceObject: {
      categoryDevName: 'Profile',
      dependency: [],
      devName: 'OwnerGeneratedNode',
      fields: dataGraphFields(updated).map((field, index) => ({
        ...field,
        dependency: [],
        devName: `GeneratedField${index}`,
        fieldRoles: [],
        id: `field-id-${index}`,
        isDGRootKeyField: false,
        name: `GeneratedField${index}`,
        sourceFieldLabel: `Field ${index}`,
        usageTag: 'none',
      })),
      fragmentDMOLabel: 'Synthetic Fragment',
      fragmentDMOName: 'SyntheticFragment__dlm',
      id: 'node-id',
      jsonPath: '$',
      label: 'Unified Individual',
      name: 'UnifiedssotIndividualMkt__dlm',
      path: [],
      projectedName: 'UnifiedssotIndividualMkt__dlm',
      recencyCriteria: [],
      referenceDeveloperName: 'UnifiedIndividual',
      relatedObjects: [],
      relatedSegments: [],
      type: 'derived',
    },
    status: 'ready',
    type: 'none',
    valuesDmoLabel: 'Synthetic Value',
    valuesDmoName: 'SyntheticValue__dlm',
    version: updated ? '1' : '0',
  };
}

/**
 * Owner transform synthetic lineage.
 * @param {boolean} updated Appended field.
 * @returns {object} Transform.
 */
function transform(updated = false) {
  return {
    name: 'ReturnedTransform',
    id: 'transform-id',
    dataSpaceName: 'default',
    creationSource: 'Data Graph',
    creationType: 'SYSTEM',
    status: 'ACTIVE',
    lastRunStatus: 'SUCCESS',
    lastRunDate: updated ? '2026-01-01T11:00:00.000Z' : '2026-01-01T10:00:00.000Z',
    definitions: [
      {
        nodes: {
          load: {
            action: 'load',
            parameters: {
              dataset: { name: 'UnifiedssotIndividualMkt__dlm', type: 'dataModelObject' },
              fields: dataGraphFields(updated).map((field) => field.sourceFieldName),
            },
          },
          aggregate: {
            action: 'jsonAggregate',
            parameters: {
              jsonAggregate: {
                jsonAggregateParameters: [
                  { groupings: ['ssot__Id__c'], levelName: 'UnifiedssotIndividualMkt__dlm' },
                ],
              },
            },
          },
          output: {
            action: 'outputD360',
            parameters: {
              name: 'SyntheticValue__dlm',
              type: 'dataModelObject',
              writeMode: 'OVERWRITE',
              fieldsMappings: [
                { sourceField: 'ssot__Id__c', targetField: 'Id__c' },
                { sourceField: 'UnifiedssotIndividualMkt__dlm', targetField: 'json_blob__c' },
                { sourceField: 'version', targetField: 'version__c' },
              ],
            },
          },
        },
      },
    ],
  };
}

/**
 * Synthetic execution with virtual clock and counted independent reads/writes.
 * @param {object} changes Options overrides.
 * @returns {object} Harness.
 */
function fixture(changes = {}) {
  let updated = false;
  let time = 0;
  let reads = 0;
  const writes = [];
  const observations = [];
  const options = {
    creationIntent: intent,
    verifyInput: async () => {},
    allowProcessing: true,
    verifyDependencies: async () => ({ fingerprint: 'stable-target-root' }),
    recordObservation: async (value) => observations.push(value),
    readGraph: async () => {
      reads++;
      const value = graph(updated);
      if (updated && time < 1_800_000)
        value.status = time < 60_000 ? 'processing' : 'editing_post_sync';
      return value;
    },
    readTransform: async () => transform(updated),
    mutate: async (parameters) => {
      writes.push(parameters);
      updated = true;
      return {
        id: intent.ownerId,
        name: intent.apiName,
        dataspaceName: 'default',
        status: 'processing',
      };
    },
    now: () => time,
    delay: async (milliseconds) => {
      time += milliseconds;
    },
    ...changes,
  };
  return { options, writes, observations, reads: () => reads, time: () => time };
}
const desired = projectDataGraph(graph(true), intent.apiName, intent).candidate;

/**
 * Change only evidenced unordered inventories and JSON property insertion order.
 * @param {number} turn Response ordinal.
 * @returns {object} Complete synthetic transform.
 */
function shuffledTransform(turn) {
  const raw = transform();
  const fields = [
    { name: 'Id__c', type: 'Text', extra: { keep: true } },
    { name: 'Value__c', type: 'Text' },
  ];
  raw.definitions[0].outputDataObjects = [
    { name: 'SyntheticValue__dlm', fields: turn % 2 ? fields.toReversed() : fields },
    { name: 'SyntheticId__dlm', fields: [{ name: 'Key__c', type: 'Text' }] },
  ];
  if (turn % 2)
    raw.definitions[0].outputDataObjects = raw.definitions[0].outputDataObjects.toReversed();
  return turn % 3 ? Object.fromEntries(Object.entries(raw).toReversed()) : raw;
}

test('Graph acquisition canonicalizes only unique output inventories, preserving properties and ordered arrays', () => {
  const projection = projectDataGraph(graph(), intent.apiName, intent);
  const baseline = verifyDataGraphTransform(projection, shuffledTransform(0));
  assert.equal(
    JSON.stringify(baseline),
    JSON.stringify(verifyDataGraphTransform(projection, shuffledTransform(1))),
  );
  for (const mode of [
    'duplicate-output',
    'duplicate-field',
    'missing-name',
    'real-property',
    'load-order',
    'mapping-order',
  ]) {
    const raw = shuffledTransform(2);
    const definition = raw.definitions[0];
    if (mode === 'duplicate-output')
      definition.outputDataObjects.push(structuredClone(definition.outputDataObjects[0]));
    if (mode === 'duplicate-field')
      definition.outputDataObjects[0].fields.push(
        structuredClone(definition.outputDataObjects[0].fields[0]),
      );
    if (mode === 'missing-name') delete definition.outputDataObjects[0].name;
    if (mode === 'real-property') definition.outputDataObjects[0].fields[0].extra.keep = false;
    if (mode === 'load-order') definition.nodes.load.parameters.fields.reverse();
    if (mode === 'mapping-order') definition.nodes.output.parameters.fieldsMappings.reverse();
    if (mode === 'real-property')
      assert.notDeepEqual(verifyDataGraphTransform(projection, raw), baseline);
    else assert.throws(() => verifyDataGraphTransform(projection, raw));
  }
  const reordered = graph();
  reordered.sourceObject.fields.reverse();
  assert.throws(() => projectDataGraph(reordered, intent.apiName, intent));
});

test('Graph executor admits shuffled unchanged responses with zero writes and blocks real freshness drift', async () => {
  const unchanged = projectDataGraph(graph(), intent.apiName, intent).candidate;
  for (const drift of [false, true]) {
    let turn = 0;
    const f = fixture({
      readGraph: async () => graph(),
      readTransform: async () => {
        const raw = shuffledTransform(turn++);
        if (drift && turn > 1) raw.definitions[0].outputDataObjects[0].fields[0].type = 'Changed';
        return raw;
      },
    });
    const result = await executeDataGraphDeploy(
      unchanged,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.outcome, drift ? 'blocked' : 'unchanged');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(f.writes.length, 0);
  }
});

test('Graph real public binding is stable across shuffled responses and retains meaningful drift', async () => {
  let turn = 0;
  let drift = false;
  let driftAfter = Number.POSITIVE_INFINITY;
  const name = desired.spec.primaryObjectName;
  const fields = dataGraphFields(true).map((field) => ({
    name: field.sourceFieldName,
    type: 'Text',
    isPrimaryKey: field.isKeyColumn,
  }));
  const detail = { id: 'root-id', name, dataSpaceName: 'default', fields };
  const metadata = [
    {
      fullName: name,
      mktDataModelAttributes: { dataSpaceName: 'default' },
      fields: fields.map((field) => ({
        fullName: field.name,
        type: field.type,
        mktDataModelFieldAttributes: { primaryIndexOrder: field.isPrimaryKey ? '1' : '' },
      })),
    },
  ];
  const conn = {
    ...connection,
    _transport: { httpRequest() {} },
    version: '67.0',
    getApiVersion() {
      return this.version;
    },
    metadata: { read: async () => metadata },
    request: async (request) => {
      if (request.method === 'GET') return detail;
      const operation = JSON.parse(request.body).toolName;
      if (operation === 'd360_data_graph_get') return { result: graph() };
      assert.equal(operation, 'd360_transform_get');
      const raw = shuffledTransform(turn++);
      if (drift || turn > driftAfter) raw.id = 'changed-transform';
      return { result: raw };
    },
  };
  const command = Object.create(Deploy.prototype);
  const input = { document: desired };
  const baseline = await command.bindDataGraph(input, conn, selection);
  assert.equal(await command.bindDataGraph(input, conn, selection), baseline);
  assert.equal(await command.bindDataGraph(input, conn, selection), baseline);
  drift = true;
  assert.notEqual(await command.bindDataGraph(input, conn, selection), baseline);
  drift = false;
  input.document = projectDataGraph(graph(), intent.apiName, intent).candidate;
  input.path = 'synthetic-graph.json';
  input.inputDigest = 'a'.repeat(64);
  command.parse = async () => ({
    flags: {
      'source-dir': ['synthetic'],
      'api-version': 'auto',
      'data-space': 'default',
      'allow-processing': false,
      preview: false,
      'target-org': { getOrgId: () => 'synthetic', getConnection: () => conn },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => [input];
  command.captureInput = async () => input.inputDigest;
  command.verifyDataGraphInput = async () => {};
  command.preflightDataGraph = preflightDataGraphDeploy;
  command.executeDataGraph = executeDataGraphDeploy;
  const previous = process.exitCode;
  try {
    const result = await command.run();
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(JSON.stringify(result).includes('DEPLOY_FRESH_ADMISSION_BLOCKED'), false);
    // First preflight and initial binding succeed; only fresh binding changes.
    turn = 0;
    driftAfter = 2;
    const blocked = await command.run();
    assert.equal(blocked.status, 'blocked', JSON.stringify(blocked));
    assert.equal(JSON.stringify(blocked).includes('DEPLOY_FRESH_ADMISSION_BLOCKED'), true);
    assert.ok(blocked.result.items.every((item) => item.mutation === 'not-attempted'));
  } finally {
    process.exitCode = previous;
  }
});

test('Graph executor uses actual facade transport validation with omitted update creationMode', async () => {
  let updated = false;
  const requests = [];
  const conn = {
    ...connection,
    _transport: { httpRequest() {} },
    request: async (request) => {
      const envelope = JSON.parse(request.body);
      const parameters = JSON.parse(envelope.paramsJson);
      requests.push({ operation: envelope.toolName, parameters });
      assert.equal(envelope.toolName, 'd360_data_graph_update');
      assert.equal(Object.hasOwn(parameters.input, 'creationMode'), false);
      updated = true;
      return {
        result: {
          id: intent.ownerId,
          name: intent.apiName,
          dataspaceName: 'default',
          status: 'ready',
        },
      };
    },
  };
  const f = fixture({
    mutate: undefined,
    readGraph: async () => graph(updated),
    readTransform: async () => transform(updated),
  });
  const result = await executeDataGraphDeploy(desired, conn, selection, 'default', f.options);
  assert.equal(requests.length, 1, JSON.stringify(result));
  assert.equal(result.outcome, 'updated', JSON.stringify(requests));
  const client = new McpExecuteClient(conn, selection);
  const input = { name: intent.apiName, dataspaceName: 'default', ...desired.spec };
  for (const mode of [JSON.parse('null'), '', 'OTHER'])
    await assert.rejects(
      client.mutate('d360_data_graph_update', {
        input: { ...input, creationMode: mode },
        editScheduleOnly: false,
      }),
      { code: 'INVALID_REQUEST' },
    );
  await assert.rejects(client.mutate('d360_data_graph_create', { input }), {
    code: 'INVALID_REQUEST',
  });
  assert.equal(requests.length, 1);
});

test('Graph binds independent DMO identity, field types and explicit key without generated provisioning', async () => {
  const name = desired.spec.primaryObjectName;
  const detail = {
    name,
    id: 'root-id',
    dataSpaceName: 'default',
    fields: dataGraphFields(true).map((field) => ({
      name: field.sourceFieldName,
      type: 'Text',
      isPrimaryKey: field.isKeyColumn,
    })),
  };
  const metadata = [
    {
      fullName: name,
      mktDataModelAttributes: { dataSpaceName: 'default' },
      fields: dataGraphFields(true).map((field) => ({
        fullName: field.sourceFieldName,
        type: 'Text',
        mktDataModelFieldAttributes: { primaryIndexOrder: field.isKeyColumn ? '1' : '' },
      })),
    },
  ];
  const binding = await bindDataGraphDependencies(
    desired,
    connection,
    selection,
    'default',
    async () => ({ detail, metadata }),
  );
  assert.match(binding.fingerprint, /^[a-f0-9]{64}$/u);
  for (const mode of [
    'duplicate',
    'wrong-type',
    'wrong-key',
    'contradictory-key',
    'missing-attributes',
    'wrong-id',
  ]) {
    const d = structuredClone(detail);
    const m = structuredClone(metadata);
    if (mode === 'duplicate') d.fields.push(d.fields[0]);
    if (mode === 'wrong-type') d.fields[2].type = 'Number';
    if (mode === 'wrong-key') m[0].fields[1].mktDataModelFieldAttributes.primaryIndexOrder = '1';
    if (mode === 'contradictory-key') d.fields[0].isPrimaryKey = false;
    if (mode === 'missing-attributes') delete m[0].fields[1].mktDataModelFieldAttributes;
    if (mode === 'wrong-id') d.name = 'Other__dlm';
    await assert.rejects(
      bindDataGraphDependencies(desired, connection, selection, 'default', async () => ({
        detail: d,
        metadata: m,
      })),
    );
  }
});

test('Graph projects complete observed schema with known exact-owner intent, never generated node binding', () => {
  const projected = projectDataGraph(graph(), intent.apiName, intent);
  assert.equal(Object.hasOwn(projected.candidate.spec, 'creationMode'), false);
  assert.equal(projected.candidate.spec.sourceObject.devName, 'UnifiedssotIndividualMkt__dlm');
  assert.equal(projected.expectations.graph.sourceObject.devName, 'OwnerGeneratedNode');
  const bytes = serializeDataGraphDocument(projected.candidate);
  assert.equal(bytes.includes('owner-id'), false);
  assert.equal(bytes.includes('OwnerGeneratedNode'), false);
  assert.deepEqual(validateDataGraphDocument(JSON.parse(bytes)), projected.candidate);
  assert.deepEqual(projectDataGraph(graph(), intent.apiName).candidate, projected.candidate);
  assert.equal(
    Object.hasOwn(projectDataGraph(graph(), intent.apiName).expectations, 'intent'),
    false,
  );
  // eslint-disable-next-line unicorn/no-null -- Explicit returned JSON null must not mean omitted mode.
  for (const creationMode of ['DRAFT', 'OTHER', null, false])
    assert.throws(() => projectDataGraph({ ...graph(), creationMode }, intent.apiName));
  assert.deepEqual(
    projectDataGraph({ ...graph(), creationMode: 'DEFAULT' }, intent.apiName).candidate,
    projected.candidate,
  );
  assert.throws(() => projectDataGraph(graph(), intent.apiName, { ...intent, ownerId: 'wrong' }));
  assert.throws(() =>
    projectDataGraph({ ...graph(), creationMode: 'OTHER' }, intent.apiName, intent),
  );
});

for (const edit of [
  (raw) => {
    raw.unqualified = true;
  },
  (raw) => {
    raw.sourceObject.unqualified = true;
  },
  (raw) => {
    raw.sourceObject.fields[0].unqualified = true;
  },
  (raw) => {
    raw.sourceObject.recencyCriteria.push({ limit: 1 });
  },
  (raw) => {
    raw.sourceObject.relatedObjects.push({ name: 'Nested' });
  },
  (raw) => {
    raw.sourceObject.fields.reverse();
  },
  (raw) => {
    raw.sourceObject.fields[0].isKeyColumn = false;
  },
  (raw) => {
    raw.incrementalRefreshConfig.enabled = true;
  },
  (raw) => {
    raw.fullRefreshConfig.schedule.frequency = 1;
  },
  (raw) => {
    raw.sourceObject.fields[0].usageTag = 'other';
  },
  (raw) => {
    raw.sourceObject.fields[0].fieldRoles.push('other');
  },
]) {
  test(`Graph refuses lossy unsupported shape ${edit.toString()}`, () => {
    const raw = graph();
    edit(raw);
    assert.throws(() => projectDataGraph(raw, intent.apiName, intent));
  });
}

test('Graph acquisition follows returned transform and fresh identical owner with old completed run', async () => {
  const calls = [];
  const acquired = await retrieveDataGraph(connection, intent.apiName, selection, 'default', {
    creationIntent: intent,
    readGraph: async (name) => {
      calls.push(name);
      return graph();
    },
    readTransform: async (name) => {
      calls.push(name);
      return transform();
    },
  });
  assert.deepEqual(acquired.blockers, []);
  assert.deepEqual(calls, [intent.apiName, 'ReturnedTransform', intent.apiName]);
});

for (const edit of [
  (raw) => {
    raw.name = 'Other';
  },
  (raw) => {
    raw.dataSpaceName = 'other';
  },
  (raw) => {
    raw.creationSource = 'Other';
  },
  (raw) => {
    raw.lastRunStatus = 'IN_PROGRESS';
  },
  (raw) => {
    raw.lastRunDate = '';
  },
  (raw) => {
    raw.lastRunDate = '2025-12-31T10:00:00.000Z';
  },
  (raw) => {
    raw.error = 'nested';
  },
  (raw) => {
    raw.definitions[0].nodes.load.parameters.fields.reverse();
  },
  (raw) => {
    raw.definitions[0].nodes.output.parameters.name = 'OtherOutput';
  },
  (raw) => {
    raw.definitions[0].nodes.aggregate.parameters.jsonAggregate.jsonAggregateParameters[0].groupings =
      [];
  },
]) {
  test(`Graph refuses unqualified transform ${edit.toString()}`, () => {
    const raw = transform();
    edit(raw);
    assert.throws(() =>
      verifyDataGraphTransform(projectDataGraph(graph(), intent.apiName, intent), raw),
    );
  });
}

test('Graph preview admits exact forward append or unchanged without historical intent, requires API67', async () => {
  const f = fixture({ creationIntent: undefined });
  const update = await preflightDataGraphDeploy(
    desired,
    connection,
    selection,
    'default',
    f.options,
  );
  assert.equal(update.outcome, 'update');
  const current = projectDataGraph(graph(), intent.apiName, intent).candidate;
  const unchanged = await preflightDataGraphDeploy(
    current,
    connection,
    selection,
    'default',
    f.options,
  );
  assert.equal(unchanged.outcome, 'unchanged');
  const changed = structuredClone(desired);
  changed.spec.label = 'Other';
  const blockedChanges = await preflightDataGraphDeploy(
    changed,
    connection,
    selection,
    'default',
    f.options,
  );
  assert.equal(blockedChanges.outcome, 'blocked-changes');
  const blocked = await preflightDataGraphDeploy(
    desired,
    connection,
    { ...selection, requested: '65.0' },
    'default',
    f.options,
  );
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(f.writes.length, 0);
});

test('Graph equality makes zero mutations and needs no processing acknowledgement or poll recorder', async () => {
  const f = fixture({
    creationIntent: undefined,
    allowProcessing: false,
    recordObservation: undefined,
  });
  const current = projectDataGraph(graph(), intent.apiName, intent).candidate;
  const result = await executeDataGraphDeploy(current, connection, selection, 'default', f.options);
  assert.equal(result.outcome, 'unchanged');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(f.writes.length, 0);
});

test('Graph one full mode-omitted update without intent preserves root/config and waits thirty virtual minutes despite transform SUCCESS', async () => {
  const f = fixture({ creationIntent: undefined });
  const result = await executeDataGraphDeploy(desired, connection, selection, 'default', f.options);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(f.time(), 1_800_000);
  assert.equal(f.writes.length, 1);
  assert.equal(Object.hasOwn(f.writes[0].input, 'creationMode'), false);
  assert.deepEqual(f.writes[0], {
    input: { name: intent.apiName, dataspaceName: 'default', ...desired.spec },
    editScheduleOnly: false,
  });
  assert.equal(f.observations.length, 31);
  assert.equal(f.observations[1].body.result.status, 'editing_post_sync');
  assert.ok(dataGraphPollBudget.timeoutMs > 1_800_000);
});

for (const status of ['unknown', 42, undefined, 'failed']) {
  test(`Graph records unknown status ${status} before uncertain stop and never replays`, async () => {
    const f = fixture();
    let writes = 0;
    f.options.mutate = async () => {
      writes++;
      return {
        id: intent.ownerId,
        name: intent.apiName,
        dataspaceName: 'default',
        status: 'processing',
      };
    };
    f.options.readGraph = async () => ({
      ...graph(writes > 0),
      status: writes > 0 ? status : 'ready',
    });
    const result = await executeDataGraphDeploy(
      desired,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.mutation, 'unknown');
    assert.equal(writes, 1);
    assert.equal(f.observations.length, 1);
    assert.equal(f.observations[0].body.result.status, status);
  });
}

for (const changes of [
  { allowProcessing: false },
  { creationIntent: { ...intent, ownerId: 'wrong' } },
  {
    verifyInput: async () => {
      throw new Error('input drift');
    },
  },
  {
    verifyDependencies: async () => {
      throw new Error('binding failed');
    },
  },
]) {
  test(`Graph admission prevents mutation ${Object.keys(changes)}`, async () => {
    const f = fixture(changes);
    const result = await executeDataGraphDeploy(
      desired,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(f.writes.length, 0);
  });
}

test('Graph stale post-update run and missing independent readback cannot confirm update', async () => {
  for (const mode of ['stale-run', 'independent-owner', 'mutation-error']) {
    const f = fixture();
    let written = false;
    let postReads = 0;
    f.options.mutate = async () => {
      written = true;
      return mode === 'mutation-error'
        ? { error: 'nested' }
        : {
            id: intent.ownerId,
            name: intent.apiName,
            dataspaceName: 'default',
            status: 'processing',
          };
    };
    f.options.readGraph = async () => {
      const raw = graph(written);
      if (written) postReads++;
      if (mode === 'independent-owner' && postReads > 1) raw.id = 'other-owner';
      return raw;
    };
    f.options.readTransform = async () => {
      const raw = transform(written);
      if (mode === 'stale-run') raw.lastRunDate = transform().lastRunDate;
      return raw;
    };
    const result = await executeDataGraphDeploy(
      desired,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.mutation, 'unknown');
  }
});

test('Graph timeout and mutation disconnect remain unknown with one attempt only', async () => {
  for (const disconnect of [false, true]) {
    const f = fixture({ pollWindow: { reads: 2, intervalMs: 60_000, timeoutMs: 120_000 } });
    if (disconnect)
      f.options.mutate = async (parameters) => {
        f.writes.push(parameters);
        throw new Error('disconnect');
      };
    const result = await executeDataGraphDeploy(
      desired,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.mutation, 'unknown');
    assert.equal(f.writes.length, 1);
  }
});

test('Graph nested poll error, preserved binding drift and failed recorder cannot confirm update', async () => {
  for (const mode of ['error', 'binding', 'recorder']) {
    const f = fixture();
    let writes = 0;
    f.options.mutate = async () => {
      writes++;
      return {
        id: intent.ownerId,
        name: intent.apiName,
        dataspaceName: 'default',
        status: 'processing',
      };
    };
    f.options.readGraph = async () => {
      const raw = graph(writes > 0);
      if (writes && mode === 'error') raw.error = { message: 'private' };
      if (writes && mode === 'binding') raw.sourceObject.fields[0].id = 'other-id';
      return raw;
    };
    if (mode === 'recorder')
      f.options.recordObservation = async () => {
        throw new Error('record failed');
      };
    const result = await executeDataGraphDeploy(
      desired,
      connection,
      selection,
      'default',
      f.options,
    );
    assert.equal(result.mutation, 'unknown');
    assert.equal(writes, 1);
  }
});
