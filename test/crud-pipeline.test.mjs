import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import {
  crudPhase,
  planDeployStages,
  streamDloCollisions,
  transformDloNames,
} from '../lib/services/crud-plan.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { bindSegmentChildren } from '../lib/services/bind-segment-dependencies.js';

// Mixed selection: stream Feed lands in Feed__dll; mapping Feed_map maps Feed__dll onto
// Person__dlm; transform Copy reads Feed__dll into Copy__dll; IR Individual_A1b2 creates
// UnifiedssotIndividualA1b2__dlm, the root of graph Graph.
const unified = 'UnifiedssotIndividualA1b2__dlm';
const stream = (dlo = 'Feed__dll') => ({
  path: 'data360/data-stream/Feed.data-stream-meta.json',
  inputDigest: 'c'.repeat(64),
  document: {
    schemaVersion: 1,
    kind: 'data-stream',
    identity: { apiName: 'Feed', dataSpace: 'default' },
    spec: { newDlo: { name: dlo }, additiveFieldMappings: [] },
  },
});
const dlo = (name) => ({
  path: `data360/dlo/${name}.dlo-meta.json`,
  document: {
    schemaVersion: 1,
    kind: 'dlo',
    c__dataSpace: ['default'],
    identity: { apiName: name },
  },
});
// The native stage re-reads its files from disk, so the mapping is a real file.
const cwd = await mkdtemp(path.join(os.tmpdir(), 'crud-pipeline-'));
await writeNativeMappingDocument(
  {
    schemaVersion: 1,
    kind: 'mapping',
    c__dataSpace: 'default',
    identity: { apiName: 'Feed_map' },
    spec: {
      sourceEntityDeveloperName: 'Feed__dll',
      targetEntityDeveloperName: 'Person__dlm',
      fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
    },
  },
  cwd,
  false,
);
const [mapping] = await readDeployInputs({ cwd, metadata: ['mapping:Feed_map'] });
// The landing DLO of stream Feed as a retrieved project holds it beside the stream file.
await writeDloDocument(
  {
    schemaVersion: 1,
    kind: 'dlo',
    c__dataSpace: ['default'],
    identity: { apiName: 'Feed__dll' },
    spec: {
      label: 'Feed',
      category: 'Other',
      fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
    },
  },
  cwd,
  false,
);
const [landingDlo] = await readDeployInputs({ cwd, metadata: ['dlo:Feed__dll'] });
const transform = (name = 'Copy') => ({
  path: `data360/dataTransforms/${name}.dataTransform.json`,
  document: {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    definition: {
      name,
      definition: {
        nodes: {
          Load: { action: 'load', parameters: { dataset: { name: 'Feed__dll' } }, sources: [] },
          Out: { action: 'outputD360', parameters: { name: `${name}__dll` }, sources: ['Load'] },
        },
      },
    },
  },
});
const ir = () => {
  const native = nativeIrFixture();
  native.objectApiName = 'Individual_A1b2';
  native.rulesetId = 'A1b2';
  return {
    path: 'Individual_A1b2.identityResolution.json',
    inputDigest: 'a'.repeat(64),
    document: projectNativeIdentityResolution(native, 'Individual_A1b2').candidate,
  };
};
const graph = {
  path: 'Graph.native-dataGraph.json',
  document: {
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: { name: 'Graph', primaryObjectName: unified, relatedObjects: [] },
  },
};
const all = () => [graph, ir(), transform(), mapping, stream()];
const pair = () => [graph, ir()];

const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

/**
 * Command with every family preflight/executor mocked; calls are recorded in order.
 * @param {object[]} inputs Admitted inputs.
 * @param {object} [flags] Flag overrides.
 * @returns {{command: object, calls: string[]}} Command and call ledger.
 */
const harness = (inputs, flags = {}) => {
  const calls = [];
  const org = {
    getOrgId: () => 'synthetic',
    getUsername: () => 'target',
    getConnection: () => ({ getApiVersion: () => '68.0' }),
  };
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview: false,
      'api-version': 'auto',
      'allow-processing': true,
      metadata: ['data-transform:Copy', 'data-stream:Feed'],
      'target-org': org,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.resolveTargetOrg = async () => {
    calls.push('auth');
    return org;
  };
  command.captureInput = async () => 'a'.repeat(64);
  // P0 streams.
  command.verifyDataStreamInput = async () => {};
  command.createDataStreamClients = () => ({});
  command.preflightDataStream = async () => {
    calls.push('stream-preflight');
    return {
      family: 'data-stream',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'complete-binding-inventory-and-dlo-404',
      requiredEffects: ['processing'],
      diagnostics: [],
    };
  };
  command.executeDataStream = async () => {
    calls.push('stream-execute');
    return {
      family: 'data-stream',
      outcome: 'created',
      mutation: 'confirmed-created',
      diagnostics: [],
    };
  };
  // P1 native.
  command.createSsotSender = () => ({ request: async () => assert.fail('no bound sender') });
  command.createDloClient = command.createDmoClient = () => ({});
  command.createMappingClient = () => ({});
  command.preflightMapping = async () => {
    calls.push('mapping-preflight');
    return { family: 'mapping', outcome: 'create', target: 'absent', diagnostics: [] };
  };
  command.executeMapping = async () => {
    calls.push('mapping-execute');
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  // P2 transform.
  command.verifyDataTransformInput = async () => {};
  command.createDataTransformClient = () => ({});
  // No transform of that name exists in the org: create.
  command.resolveDataTransformTarget = async () => {};
  command.preflightDataTransform = async () => {
    calls.push('transform-preflight');
    return { operation: 'create' };
  };
  command.executeDataTransform = async (_document, selection) => {
    assert.deepEqual(selection, { operation: 'create' });
    calls.push('transform-execute');
    return { operation: 'create' };
  };
  // P3 identity resolution.
  command.verifyIdentityResolutionInput = async () => {};
  command.bindIdentityResolution = async () => 'stable';
  command.preflightIdentityResolution = async (document) => {
    calls.push('ir-preflight');
    return {
      family: 'identity-resolution',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.post' },
      requiredEffects: ['processing', 'generated-output-provisioning'],
      outcome: 'create',
      target: 'absent',
      absenceProof: 'exact-item-not-found',
      diagnostics: [],
      identity: document.identity,
    };
  };
  command.executeIdentityResolution = async () => {
    calls.push('ir-execute');
    // The default executor returns only once the ruleset reads PUBLISHED.
    await new Promise((resolve) => setImmediate(resolve));
    calls.push('ir-published');
    return {
      family: 'identity-resolution',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.post' },
      outcome: 'created',
      mutation: 'confirmed-created',
      diagnostics: [],
    };
  };
  // P4 graph.
  command.verifyNativeDataGraphInput = async () => {};
  command.nativeGraphContext = async () => ({ orgId: 'synthetic' });
  command.nativeGraphClient = () => ({});
  command.operateNativeGraph = async (document, _context, _client, options) => {
    calls.push(`graph-${options.preview ? 'preview' : 'deploy'}:${options.waitTimeoutSeconds}`);
    return options.preview
      ? { outcome: 'create', diagnostics: [] }
      : { outcome: 'created', mutation: 'confirmed-created' };
  };
  return { command, calls };
};

test('stages: P0 stream, P1 native, P2 transform, P3 batch levels, P4 graph', () => {
  const inputs = all();
  assert.deepEqual(
    inputs.map((input) => crudPhase(input)),
    ['P4', 'P3', 'P2', 'P1', 'P0'],
  );
  assert.deepEqual(
    planDeployStages(inputs, { nativeRoute: true }).map((stage) => [
      stage.phase,
      stage.inputs.map((input) => input.document.kind),
    ]),
    [
      ['P0', ['data-stream']],
      ['P1', ['mapping']],
      ['P2', ['data-transform']],
      ['P3', ['identity-resolution']],
      ['P4', ['native-data-graph']],
    ],
  );
  assert.deepEqual(transformDloNames(transform()), ['Feed__dll', 'Copy__dll']);
  assert.deepEqual(transformDloNames({ document: { kind: 'data-transform' } }), []);
  assert.deepEqual(streamDloCollisions([stream(), dlo('FEED__dll'), dlo('Other__dll')]), [
    'FEED__dll',
  ]);
  assert.deepEqual(streamDloCollisions([dlo('Feed__dll')]), []);
});

test('a mixed deploy runs stream, mapping, transform, IR and graph in phase order', async () => {
  const { command, calls } = harness(all(), { 'wait-timeout': 60 });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(calls, [
    'stream-execute',
    'mapping-execute',
    'transform-execute',
    'ir-preflight',
    'ir-preflight',
    'ir-execute',
    'ir-published',
    'auth',
    'graph-deploy:60',
  ]);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome]),
    [
      ['data-stream', 'created'],
      ['mapping', 'created'],
      ['data-transform', 'created'],
      ['identity-resolution', 'created'],
      ['data-graph', 'created'],
    ],
  );
});

test('a failed or blocked stage stops every later stage', async () => {
  const failedStream = harness(all());
  failedStream.command.executeDataStream = async () => {
    failedStream.calls.push('stream-execute');
    return { family: 'data-stream', outcome: 'failed', mutation: 'unknown', diagnostics: [] };
  };
  const first = await run(failedStream.command);
  assert.equal(first.status, 'failed');
  assert.deepEqual(failedStream.calls, ['stream-execute']);
  const blockedTransform = harness(all());
  blockedTransform.command.executeDataTransform = async () => {
    blockedTransform.calls.push('transform-execute');
    throw new Error('refused before dispatch');
  };
  const second = await run(blockedTransform.command);
  assert.equal(second.status, 'blocked');
  assert.deepEqual(blockedTransform.calls, [
    'stream-execute',
    'mapping-execute',
    'transform-execute',
  ]);
  assert.equal(second.result.items.at(-1).family, 'data-transform');
});

test('preview reports items whose earlier-phase parent is created as planned', async () => {
  const { command, calls } = harness(all(), { preview: true });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  // The mapping and transform read the stream's landing DLO; the graph roots on the IR output.
  assert.deepEqual(calls, ['stream-preflight', 'ir-preflight']);
  assert.deepEqual(
    result.result.items.map((item) => [
      item.family,
      item.outcome,
      item.diagnostics[0]?.code,
      item.operation,
    ]),
    [
      ['data-stream', 'create', undefined, 'preview'],
      ['mapping', 'planned-dependencies', 'MAPPING_DEPENDENCIES_PLANNED', 'preview'],
      ['data-transform', 'planned-dependencies', 'DEPENDENCIES_PLANNED', 'preview'],
      ['identity-resolution', 'create', undefined, 'preview'],
      ['data-graph', 'planned-dependencies', 'DEPENDENCIES_PLANNED', 'preview'],
    ],
  );
  assert.match(result.result.items[2].diagnostics[0].message, /dlo:feed__dll/u);
  assert.match(
    result.result.items[4].diagnostics[0].message,
    /identity-resolution:individual_a1b2/u,
  );
  // Existing parents: everything is compared against the target.
  const existing = harness(all(), { preview: true });
  existing.command.preflightDataStream = async () => {
    existing.calls.push('stream-preflight');
    return { family: 'data-stream', outcome: 'unchanged', diagnostics: [] };
  };
  existing.command.preflightIdentityResolution = async (document) => {
    existing.calls.push('ir-preflight');
    return {
      family: 'identity-resolution',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.get' },
      requiredEffects: [],
      outcome: 'unchanged',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
      identity: document.identity,
    };
  };
  const compared = await run(existing.command);
  assert.equal(compared.status, 'success', JSON.stringify(compared.diagnostics));
  assert.deepEqual(existing.calls, [
    'stream-preflight',
    'mapping-preflight',
    'transform-preflight',
    'ir-preflight',
    'auth',
    'graph-preview:1800',
  ]);
});

test('a graph on the unified DMO of a selected IR waits for that IR to publish', async () => {
  // The chunk C live shape: one IR and one graph rooted on its unified DMO, graph listed first.
  const flags = {
    metadata: ['native-data-graph:Graph', 'identity-resolution:Individual_A1b2'],
  };
  assert.deepEqual(
    planDeployStages(pair(), { nativeRoute: false }).map((stage) => stage.phase),
    ['P3', 'P4'],
  );
  const deployed = harness(pair(), flags);
  const result = await run(deployed.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(deployed.calls.slice(-4), [
    'ir-execute',
    'ir-published',
    'auth',
    'graph-deploy:1800',
  ]);
  // An IR that does not reach PUBLISHED stops the graph before any graph call.
  const unsettled = harness(pair(), flags);
  unsettled.command.executeIdentityResolution = async () => {
    unsettled.calls.push('ir-execute');
    return {
      family: 'identity-resolution',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.post' },
      outcome: 'failed',
      mutation: 'unknown',
      diagnostics: [],
    };
  };
  const stopped = await run(unsettled.command);
  assert.notEqual(stopped.status, 'success');
  assert.equal(unsettled.calls.at(-1), 'ir-execute');
  assert.ok(!unsettled.calls.some((call) => call.startsWith('graph-')));
  // Preview: a new IR makes the graph's parent (the unified DMO) planned; no graph read.
  const previewed = harness(pair(), { ...flags, preview: true });
  const preview = await run(previewed.command);
  assert.equal(preview.status, 'success', JSON.stringify(preview.diagnostics));
  assert.deepEqual(previewed.calls, ['ir-preflight']);
  const graphItem = preview.result.items.find((item) => item.family === 'data-graph');
  assert.equal(graphItem.outcome, 'planned-dependencies');
  assert.equal(graphItem.diagnostics[0].code, 'DEPENDENCIES_PLANNED');
  assert.match(graphItem.diagnostics[0].message, /identity-resolution:individual_a1b2/u);
});

test('a DLO file naming the landing DLO of a new stream is refused before any write', async () => {
  const flags = {
    metadata: ['data-stream:Feed', 'dlo:Feed__dll'],
  };
  for (const preview of [false, true]) {
    const { command, calls } = harness([stream('FEED__dll'), landingDlo], { ...flags, preview });
    // Preview runs later stages read-only after the blocked stream stage.
    command.preflightDlo = async () => {
      calls.push('dlo-preflight');
      return { family: 'dlo', outcome: 'unchanged', target: 'existing', diagnostics: [] };
    };
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'DATA_STREAM_DLO_COLLISION');
    assert.match(result.diagnostics.warnings[0], /FEED__dll/u);
    assert.deepEqual(calls, preview ? ['stream-preflight', 'dlo-preflight'] : ['stream-preflight']);
  }
  // An existing stream's landing DLO file is a normal sibling: both deploy, Salesforce decides.
  const existing = harness([stream(), landingDlo], flags);
  existing.command.preflightDataStream = async () => {
    existing.calls.push('stream-preflight');
    return { family: 'data-stream', outcome: 'unchanged', diagnostics: [] };
  };
  existing.command.executeDataStream = async () => {
    existing.calls.push('stream-execute');
    return {
      family: 'data-stream',
      outcome: 'unchanged',
      mutation: 'not-attempted',
      diagnostics: [],
    };
  };
  existing.command.executeDlo = async () => {
    existing.calls.push('dlo-execute');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  const result = await run(existing.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(existing.calls, ['stream-preflight', 'stream-execute', 'dlo-execute']);
});

test('several transforms, by member or directory, run one after another in P2', async () => {
  for (const flags of [
    { metadata: ['data-transform:Copy', 'data-transform:Other'] },
    { metadata: undefined, 'source-dir': ['data360'] },
  ]) {
    const { command, calls } = harness([transform(), transform('Other'), mapping], flags);
    const names = [];
    command.resolveDataTransformTarget = async (_client, name) => {
      names.push(name);
      return name === 'Other' ? '1dt000000000001AAA' : undefined;
    };
    command.executeDataTransform = async (document, selection) => {
      calls.push(`transform-execute:${document.definition.name}:${selection.operation}`);
      return { operation: selection.operation };
    };
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(names, ['Copy', 'Other']);
    assert.deepEqual(calls, [
      'mapping-execute',
      'transform-execute:Copy:create',
      'transform-execute:Other:update',
    ]);
    assert.deepEqual(
      result.result.items.map((item) => item.outcome),
      ['created', 'created', 'updated'],
    );
  }
  // --wait-timeout needs a graph in the selection, explicit or Git.
  const { command, calls } = harness([transform(), mapping], { 'wait-timeout': 60 });
  const result = await run(command);
  assert.equal(result.diagnostics.errors[0].code, 'INVALID_WAIT_TIMEOUT_SCOPE');
  assert.deepEqual(calls, []);
});

test('a graph block reads as a block in preview; a rejected PUT names no unknown mutation', async () => {
  // Join change: refused before any write, in preview the same way as in deploy.
  const join = {
    outcome: 'blocked',
    mutation: 'not-attempted',
    target: 'present',
    diagnostics: [
      { code: 'DATA_GRAPH_JOIN_CHANGE', message: 'Join differs. Nothing was written.' },
    ],
  };
  const preview = harness([graph], { preview: true });
  preview.command.operateNativeGraph = async () => join;
  const previewed = await run(preview.command);
  assert.equal(previewed.status, 'blocked');
  assert.equal(previewed.diagnostics.errors[0].code, 'DEPLOY_PREVIEW_BLOCKED');
  assert.match(
    previewed.diagnostics.errors[0].message,
    /^Preview found an item the deploy would refuse or could not check/u,
  );
  assert.equal(previewed.result.items[0].target, 'present');
  assert.equal(previewed.result.items[0].diagnostics[0].code, 'DATA_GRAPH_JOIN_CHANGE');
  const blocked = harness([graph]);
  blocked.command.operateNativeGraph = async () => join;
  const executed = await run(blocked.command);
  assert.equal(executed.diagnostics.errors[0].code, 'DEPLOY_EXECUTION_BLOCKED');
  // A rejected PUT: Salesforce's answer on the item, no unknown-mutation warning, one period.
  const rejected = harness([graph]);
  rejected.command.operateNativeGraph = async () =>
    retainConnectDiagnostic(
      {
        outcome: 'failed',
        mutation: 'rejected',
        diagnostics: [{ code: 'REQUEST_FAILED', message: 'Removing fields is not allowed.' }],
      },
      apiDiagnostic(400, [
        { errorCode: 'INTERNAL_ERROR', message: 'Removing fields is not allowed.' },
      ]),
    );
  const result = await run(rejected.command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].mutation, 'rejected');
  assert.equal(result.result.items[0].diagnostics[0].code, 'REQUEST_FAILED');
  const message = result.diagnostics.errors[0].message;
  assert.equal(result.diagnostics.errors[0].code, 'DEPLOY_EXECUTION_FAILED');
  assert.match(
    message,
    /INTERNAL_ERROR: Removing fields is not allowed\. Deployment did not complete: Salesforce rejected a write/u,
  );
  assert.doesNotMatch(message, /\.\.|unknown mutations/u);
});

/**
 * A Waterfall segment deploy input.
 * @param {string} apiName Segment API name.
 * @param {object} [spec] Extra spec keys.
 * @returns {object} Input.
 */
const waterfall = (apiName, spec = {}) => ({
  path: `data360/segments/${apiName}.segment.json`,
  document: {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName },
    spec: {
      displayName: apiName,
      description: '',
      segmentType: 'Waterfall',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
      ...spec,
    },
  },
});

test('a Waterfall child neither selected nor in the target stops the run before any write', async () => {
  for (const preview of [false, true]) {
    // Gold is selected (its own earlier stage); Silver is neither selected nor in the target.
    const { command, calls } = harness(
      [mapping, waterfall('Tiers', { childSegments: ['Gold', 'Silver'] }), waterfall('Gold')],
      { preview, metadata: ['segment:Tiers'] },
    );
    const read = [];
    command.bindChildSegments = (document, connection, version) =>
      bindSegmentChildren(document, connection, version, async (name) => {
        read.push(name);
        throw retainConnectDiagnostic(
          new Error('not found'),
          apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND', message: 'not found' }]),
        );
      });
    const result = await run(command);
    assert.deepEqual(read, ['Silver']);
    assert.deepEqual(calls, ['auth']);
    assert.equal(result.status, 'blocked');
    assert.equal(
      result.diagnostics.errors[0].code,
      preview ? 'DEPLOY_PREVIEW_BLOCKED' : 'DEPLOY_EXECUTION_BLOCKED',
    );
    const [item] = result.result.items;
    assert.equal(item.diagnostics[0].code, 'SEGMENT_CHILD_NOT_FOUND');
    assert.match(item.diagnostics[0].message, /child segment Silver/u);
  }
});
