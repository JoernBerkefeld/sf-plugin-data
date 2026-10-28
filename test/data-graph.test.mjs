import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
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

const selection = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };
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
  assert.equal(projected.candidate.spec.creationMode, 'DEFAULT');
  assert.equal(projected.candidate.spec.sourceObject.devName, 'UnifiedssotIndividualMkt__dlm');
  assert.equal(projected.expectations.graph.sourceObject.devName, 'OwnerGeneratedNode');
  const bytes = serializeDataGraphDocument(projected.candidate);
  assert.equal(bytes.includes('owner-id'), false);
  assert.equal(bytes.includes('OwnerGeneratedNode'), false);
  assert.deepEqual(validateDataGraphDocument(JSON.parse(bytes)), projected.candidate);
  assert.throws(() => projectDataGraph(graph(), intent.apiName), {
    code: 'DATA_GRAPH_CREATION_INTENT_REQUIRED',
  });
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

test('Graph preview admits only exact forward append or unchanged, requires API67 and intent', async () => {
  const f = fixture();
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
  const f = fixture({ allowProcessing: false, recordObservation: undefined });
  const current = projectDataGraph(graph(), intent.apiName, intent).candidate;
  const result = await executeDataGraphDeploy(current, connection, selection, 'default', f.options);
  assert.equal(result.outcome, 'unchanged');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(f.writes.length, 0);
});

test('Graph one full update preserves root/config and waits thirty virtual minutes despite transform SUCCESS', async () => {
  const f = fixture();
  const result = await executeDataGraphDeploy(desired, connection, selection, 'default', f.options);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.mutation, 'confirmed-updated');
  assert.equal(f.time(), 1_800_000);
  assert.equal(f.writes.length, 1);
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
  { creationIntent: undefined },
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
