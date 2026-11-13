import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { crudPhase, planDeleteStages } from '../lib/services/crud-plan.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

// Selection: graph Graph on the unified DMO of IR Individual_A1b2; transform Copy reads
// Feed__dll; mapping Feed_map maps Feed__dll onto Person__dlm; stream Feed lands in Feed__dll.
const unified = 'UnifiedssotIndividualA1b2__dlm';
const ir = () => {
  const native = nativeIrFixture();
  native.objectApiName = 'Individual_A1b2';
  native.rulesetId = 'A1b2';
  return {
    path: 'Individual_A1b2.identityResolution.json',
    document: projectNativeIdentityResolution(native, 'Individual_A1b2').candidate,
  };
};
const graph = (root = unified) => ({
  path: 'Graph.native-dataGraph.json',
  document: {
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: { name: 'Graph', primaryObjectName: root, relatedObjects: [] },
  },
});
const transform = () => ({
  path: 'Copy.dataTransform.json',
  document: {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    definition: {
      name: 'Copy',
      label: 'Copy',
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
              dataset: { name: 'Feed__dll', type: 'dataLakeObject' },
              fields: ['Id__c'],
              sampleDetails: { sortBy: [], type: 'TopN' },
            },
            sources: [],
          },
          OUTPUT0: {
            action: 'outputD360',
            parameters: {
              name: 'Copy__dll',
              type: 'dataLakeObject',
              fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
            },
            sources: ['LOAD_DATASET0'],
          },
        },
      },
    },
  },
});
const sourceFiles = [
  'Graph.native-dataGraph.json',
  'Individual_A1b2.identityResolution.json',
  'Copy.dataTransform.json',
];
const everything = [
  'data-graph:Graph',
  'identity-resolution:Individual_A1b2',
  'data-transform:Copy',
  'mapping:Feed_map',
  'dmo:Person__dlm',
  'dlo:Copy__dll',
  'data-stream:Feed',
];
const mappingRaw = (name) => ({
  developerName: name,
  sourceEntityDeveloperName: 'Feed__dll',
  targetEntityDeveloperName: 'Person__dlm',
  status: 'ACTIVE',
  fieldMappings: [
    { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c', developerName: 'p' },
  ],
});

const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

/**
 * Delete command with every family executor mocked; calls are recorded in order.
 * @param {object[]} inputs --source-dir inputs.
 * @param {object} [flags] Flag overrides.
 * @returns {object} Command, call ledger and knobs.
 */
const harness = (inputs, flags = {}) => {
  const h = { calls: [], outcome: {}, linked: {}, lastMapping: false };
  const done = (preview, key, fallback = 'deleted') =>
    preview
      ? { outcome: 'delete', mutation: 'not-attempted' }
      : (h.outcome[key] ?? {
          outcome: fallback,
          mutation: fallback === 'deleted' ? 'confirmed-deleted' : 'not-attempted',
        });
  const command = Object.create(Delete.prototype);
  h.command = command;
  command.parse = async () => ({
    flags: {
      preview: false,
      'confirm-delete': true,
      'keep-local-files': true,
      metadata: everything,
      'source-dir': sourceFiles,
      'transform-target-id': '1dt000000000001AAA',
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.resolveConnection = async () => {
    h.calls.push('auth');
    return { getUsername: () => 'target' };
  };
  command.resolveTarget = async () => 'target';
  // P4 graphs.
  command.verifyNativeDataGraphInput = async () => {};
  command.nativeGraphContext = async () => ({});
  command.nativeGraphClient = () => ({});
  command.operateNativeGraph = async (document, _context, _client, options) => {
    h.calls.push(`graph:${document.definition.name}`);
    return done(options.preview, 'graph');
  };
  // P3 identity resolution.
  command.verifyIdentityResolutionInput = async () => {};
  command.deleteIdentityResolution = async (desired, _connection, _version, _space, options) => {
    h.calls.push(`ir:${desired.identity.apiName}`);
    return { ...done(options.preview, 'ir'), diagnostics: [] };
  };
  // P2 transform.
  command.verifyDataTransformInput = async () => {};
  command.createDataTransformClient = () => ({ delete: async () => {} });
  command.createDataTransformDloReader = () => ({});
  command.deleteDataTransform = async (_desired, _client, _reader, options) => {
    h.calls.push('transform');
    return options.preview
      ? { outcome: 'preview', mutation: 'not-attempted' }
      : done(false, 'transform');
  };
  // P1 native.
  command.createMappingSender = () => ({});
  command.createMappingClient = () => ({ get: async (name) => mappingRaw(name) });
  const mappingStep = async (kind, name, client) => {
    await client.get(name);
    if (h.lastMapping) throw new NativeMappingError('MAPPING_LAST_MAPPING_DELETE_BLOCKED');
    h.calls.push(`${kind}:${name}`);
    return { apiName: name };
  };
  command.preflightDeleteMapping = (name, client) => mappingStep('mapping-preview', name, client);
  command.deleteMapping = (name, client) => mappingStep('mapping', name, client);
  command.createDmoNativeDeleteClient = () => ({});
  command.retrieveDmo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  command.deleteDmo = async (name) => {
    h.calls.push(`dmo:${name}`);
    return h.outcome.dmo ?? { dataSpace: 'default' };
  };
  command.createDloNativeDeleteClient = () => ({
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  command.retrieveDlo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  command.deleteDlo = async (name) => {
    h.calls.push(`dlo:${name}`);
    return { dataSpace: 'default' };
  };
  // P0 streams.
  command.createDataStreamClients = async () => ({});
  command.readStreamLinkedDlo = async (name) => {
    h.calls.push(`stream-link:${name}`);
    return h.linked[name];
  };
  command.preflightDeleteDataStream = async (name, _clients, options) => {
    h.calls.push(`stream-preview:${name}:${options.deleteDlo}`);
    return { outcome: 'delete', mutation: 'not-attempted', deleteDlo: options.deleteDlo };
  };
  command.executeDeleteDataStream = async (name, _clients, options) => {
    h.calls.push(`stream:${name}:${options.deleteDlo}`);
    return {
      outcome: 'deleted',
      mutation: 'confirmed-deleted',
      ...(options.deleteDlo ? { targetDloName: h.linked[name] } : {}),
      diagnostics: [],
    };
  };
  return h;
};
const all = () => [graph(), ir(), transform()];
const byFamily = (result, family) => result.result.items.filter((item) => item.family === family);

const plan = (kind, apiName, spec = {}) => ({
  path: `${kind}:${apiName}`,
  document: { kind, identity: { apiName }, spec },
});

test('delete stages run in reverse phase order, dependents first inside P3', () => {
  const ci = plan('calculated-insight', 'Score__cio', {
    dependencies: [{ kind: 'dmo', apiName: unified }],
  });
  const segment = plan('segment', 'Audience', {
    dependencies: [{ kind: 'calculated-insight', apiName: 'Score__cio' }],
  });
  const stages = planDeleteStages([
    plan('data-stream', 'Feed'),
    plan('dlo', 'Feed__dll'),
    plan('mapping', 'Feed_map'),
    plan('dmo', 'Person__dlm'),
    transform(),
    ir(),
    ci,
    segment,
    graph(),
  ]);
  assert.deepEqual(
    stages.map((stage) => [stage.phase, stage.inputs.map((input) => input.path)]),
    [
      ['P4', ['Graph.native-dataGraph.json']],
      ['P3', ['segment:Audience']],
      ['P3', ['calculated-insight:Score__cio']],
      ['P3', ['Individual_A1b2.identityResolution.json']],
      ['P2', ['Copy.dataTransform.json']],
      ['P1', ['dlo:Feed__dll', 'mapping:Feed_map', 'dmo:Person__dlm']],
      ['P0', ['data-stream:Feed']],
    ],
  );
  assert.equal(crudPhase(graph()), 'P4');
});

test('one delete runs graph, IR, transform, native and stream phases in reverse order', async () => {
  const h = harness(all());
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    h.calls.filter((call) => call !== 'auth'),
    [
      // Read-only: is Copy__dll the landing DLO of stream Feed? (It is not.)
      'stream-link:Feed',
      'graph:Graph',
      'ir:Individual_A1b2',
      'transform',
      'mapping:Feed_map',
      'dmo:Person__dlm',
      'dlo:Copy__dll',
      'stream:Feed:false',
    ],
  );
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.identity.apiName, item.outcome]),
    [
      ['data-graph', 'Graph', 'deleted'],
      ['identity-resolution', 'Individual_A1b2', 'deleted'],
      ['data-transform', 'Copy', 'deleted'],
      ['mapping', 'Feed_map', 'deleted'],
      ['dmo', 'Person__dlm', 'deleted'],
      ['dlo', 'Copy__dll', 'deleted'],
      ['data-stream', 'Feed', 'deleted'],
    ],
  );
});

for (const [step, outcome, expected] of [
  ['graph', 'failed', ['graph:Graph']],
  ['ir', 'blocked', ['graph:Graph', 'ir:Individual_A1b2']],
  ['transform', 'deletion-unconfirmed', ['graph:Graph', 'ir:Individual_A1b2', 'transform']],
])
  test(`a ${outcome} ${step} stops every later phase`, async () => {
    const h = harness(all());
    h.outcome[step] = { outcome, mutation: outcome === 'blocked' ? 'not-attempted' : 'unknown' };
    const result = await run(h.command);
    assert.equal(result.status, outcome === 'blocked' ? 'blocked' : 'failed');
    assert.deepEqual(
      h.calls.filter((call) => call !== 'auth' && !call.startsWith('stream-link')),
      expected,
    );
    assert.ok(result.result.items.every((item) => typeof item.family === 'string'));
  });

test('a graph on the unified DMO of a selected IR is deleted before that IR', async () => {
  // The graph is listed after the IR; the IR starts only after the graph returned.
  const h = harness([ir(), graph()], {
    metadata: ['identity-resolution:Individual_A1b2', 'data-graph:Graph'],
    'source-dir': sourceFiles.slice(0, 2),
    'transform-target-id': undefined,
  });
  let graphSettled = false;
  const operate = h.command.operateNativeGraph;
  h.command.operateNativeGraph = async (...arguments_) => {
    const result = await operate(...arguments_);
    graphSettled = true;
    return result;
  };
  const deleteIr = h.command.deleteIdentityResolution;
  h.command.deleteIdentityResolution = async (...arguments_) => {
    assert.ok(graphSettled, 'IR delete started before the graph delete settled');
    return deleteIr(...arguments_);
  };
  // The IR settles as still processing: it is the last phase, so the run succeeds.
  h.outcome.ir = { outcome: 'deletion-processing', mutation: 'acknowledged-processing' };
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    h.calls.filter((call) => call !== 'auth'),
    ['graph:Graph', 'ir:Individual_A1b2'],
  );
});

test('a still-processing deletion stops the later phases', async () => {
  const h = harness([ir()], {
    metadata: ['identity-resolution:Individual_A1b2', 'dmo:Person__dlm'],
    'source-dir': [sourceFiles[1]],
    'transform-target-id': undefined,
  });
  h.outcome.ir = { outcome: 'deletion-processing', mutation: 'acknowledged-processing' };
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    h.calls.filter((call) => call !== 'auth'),
    ['ir:Individual_A1b2'],
  );
  assert.equal(result.diagnostics.errors[0].code, 'DELETE_PHASE_NOT_SETTLED');
});

test('preview reports items whose selected dependents an earlier phase deletes as planned', async () => {
  const h = harness([graph(), ir()], {
    preview: true,
    'confirm-delete': false,
    metadata: ['data-graph:Graph', 'identity-resolution:Individual_A1b2', `dmo:${unified}`],
    'source-dir': sourceFiles.slice(0, 2),
    'transform-target-id': undefined,
  });
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  // No IR or DMO read: both wait for the graph that needs them.
  assert.deepEqual(
    h.calls.filter((call) => call !== 'auth'),
    ['graph:Graph'],
  );
  const [graphItem, irItem, dmoItem] = result.result.items;
  assert.deepEqual([graphItem.family, graphItem.outcome], ['data-graph', 'delete']);
  for (const item of [irItem, dmoItem]) {
    assert.equal(item.outcome, 'planned-dependencies');
    assert.equal(item.operation, 'preview');
    assert.equal(item.diagnostics[0].code, 'DEPENDENCIES_PLANNED');
    assert.match(item.diagnostics[0].message, /native-data-graph:graph/u);
  }
  assert.deepEqual([irItem.family, dmoItem.family], ['identity-resolution', 'dmo']);
});

test('a blocked graph preview leaves the IR to its own preview check', async () => {
  const h = harness([graph(), ir()], {
    preview: true,
    metadata: ['data-graph:Graph', 'identity-resolution:Individual_A1b2'],
    'source-dir': sourceFiles.slice(0, 2),
    'transform-target-id': undefined,
  });
  const operate = h.command.operateNativeGraph;
  h.command.operateNativeGraph = async (...arguments_) => ({
    ...(await operate(...arguments_)),
    outcome: 'blocked',
  });
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    h.calls.filter((call) => call !== 'auth'),
    ['graph:Graph', 'ir:Individual_A1b2'],
  );
  assert.equal(result.result.items[1].outcome, 'delete');
});

for (const preview of [false, true])
  test(`a stream and its landing DLO are one stream delete with its DLO preview=${preview}`, async () => {
    const h = harness([], {
      preview,
      metadata: ['dlo:Feed__dll', 'data-stream:Feed', 'dlo:Other__dll'],
      'source-dir': undefined,
      'transform-target-id': undefined,
    });
    h.linked.Feed = 'Feed__dll';
    const result = await run(h.command);
    assert.equal(result.status, 'success');
    // The landing DLO is never deleted on its own; the unrelated DLO still is.
    assert.deepEqual(h.calls, [
      'stream-link:Feed',
      ...(preview ? [] : ['dlo:Other__dll']),
      preview ? 'stream-preview:Feed:true' : 'stream:Feed:true',
    ]);
    const owned = byFamily(result, 'dlo').find((item) => item.identity.apiName === 'Feed__dll');
    assert.equal(owned.removedWith, 'data-stream:Feed');
    assert.equal(owned.outcome, preview ? 'delete' : 'deleted');
    assert.equal(byFamily(result, 'data-stream')[0].deleteDlo, true);
  });

test('a stream whose landing DLO is not selected keeps it', async () => {
  const h = harness([], {
    metadata: ['dlo:Other__dll', 'data-stream:Feed'],
    'source-dir': undefined,
    'transform-target-id': undefined,
  });
  h.linked.Feed = 'Feed__dll';
  const result = await run(h.command);
  assert.equal(result.status, 'success');
  assert.deepEqual(h.calls, ['stream-link:Feed', 'dlo:Other__dll', 'stream:Feed:false']);
});

for (const preview of [false, true])
  test(`the last mapping of a selected DMO is removed with the DMO preview=${preview}`, async () => {
    const h = harness([], {
      preview,
      metadata: ['mapping:Feed_map', 'dmo:Person__dlm'],
      'source-dir': undefined,
      'transform-target-id': undefined,
    });
    h.lastMapping = true;
    const result = await run(h.command);
    assert.equal(result.status, 'success');
    // No mapping request beyond the guard's reads; only the DMO is deleted.
    assert.deepEqual(h.calls, preview ? [] : ['dmo:Person__dlm']);
    const [mapping, dmo] = result.result.items;
    assert.equal(mapping.family, 'mapping');
    assert.equal(mapping.removedWith, 'dmo:Person__dlm');
    assert.equal(mapping.outcome, dmo.outcome);
    assert.equal(mapping.mutation, dmo.mutation);
    assert.equal(mapping.outcome, preview ? 'delete' : 'deleted');
  });

test('the last mapping of a DMO that is not selected stays refused', async () => {
  const h = harness([], {
    metadata: ['mapping:Feed_map'],
    'source-dir': undefined,
    'transform-target-id': undefined,
  });
  h.lastMapping = true;
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[0].outcome, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'MAPPING_LAST_MAPPING_DELETE_BLOCKED');
});

test('a delete spanning more than one phase needs --confirm-delete before any org call', async () => {
  const h = harness([], {
    'confirm-delete': false,
    metadata: ['dmo:Person__dlm', 'data-stream:Feed'],
    'source-dir': undefined,
    'transform-target-id': undefined,
  });
  const result = await run(h.command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
  assert.deepEqual(h.calls, []);
  assert.deepEqual(result.result.items, []);
});

for (const [name, flags, code] of [
  [
    'a source family without its file',
    { metadata: ['identity-resolution:Individual_A1b2', 'dmo:Person__dlm'], 'source-dir': [] },
    'INVALID_SELECTION',
  ],
  [
    'a source file no selector names',
    { metadata: ['data-graph:Graph', 'dmo:Person__dlm'], 'source-dir': sourceFiles.slice(0, 2) },
    'INVALID_SELECTION',
  ],
  [
    '--delete-dlo without a stream',
    { 'delete-dlo': true },
    'STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION',
  ],
])
  test(`mixed delete refuses ${name} before any org call`, async () => {
    const h = harness([graph(), ir()], {
      'transform-target-id': undefined,
      metadata: ['data-graph:Graph', 'identity-resolution:Individual_A1b2'],
      'source-dir': sourceFiles.slice(0, 2),
      ...flags,
    });
    const result = await run(h.command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.deepEqual(h.calls, []);
  });
