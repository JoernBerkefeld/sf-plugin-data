import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  identityResolutionEdges,
  planDeployStages,
  runCrudStages,
  unifiedDmoNames,
} from '../lib/services/crud-plan.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

const reference = (kind, apiName) => ({ kind, dataSpace: 'default', apiName });
const segmentDocument = (object, apiName = 'Audience') => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName },
  spec: {
    displayName: apiName,
    description: '',
    segmentType: 'DBT',
    segmentOn: reference('dmo', object),
    models: [{ name: apiName, sql: `SELECT ${object}.Id__c FROM ${object} WHERE 1 = 0` }],
    dependencies: [{ ...reference('dmo', object), fields: ['Id__c'] }],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const irInput = (name = 'Individual_A1b2') => {
  const native = nativeIrFixture();
  native.objectApiName = name;
  native.rulesetId = name.slice('Individual_'.length);
  return {
    path: `${name}.identityResolution.json`,
    inputDigest: 'a'.repeat(64),
    document: projectNativeIdentityResolution(native, name).candidate,
  };
};
const segmentInput = (object, apiName = 'Audience') => ({
  path: `${apiName}.segment.json`,
  inputDigest: 'b'.repeat(64),
  document: segmentDocument(object, apiName),
});
const ciInput = (object) => ({
  path: 'Spend__cio.calculatedInsight.json',
  document: {
    kind: 'calculated-insight',
    identity: { dataSpace: 'default', apiName: 'Spend__cio' },
    spec: { dependencies: [reference('dmo', object)] },
  },
});
const graphInput = (root) => ({
  path: 'Graph.native-dataGraph.json',
  document: {
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: { name: 'Graph', primaryObjectName: root, relatedObjects: [] },
  },
});
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

test('unified and link DMO names derive from the ruleset name, type and reconciliation DMOs', () => {
  const ir = irInput('Individual_5810').document;
  assert.deepEqual(unifiedDmoNames(ir).slice(0, 2), [
    'UnifiedssotIndividual5810__dlm',
    'UnifiedLinkssotIndividual5810__dlm',
  ]);
  // A default ruleset (name equals type) has no suffix; another name derives nothing.
  const base = structuredClone(ir);
  base.identity.apiName = 'Individual';
  assert.equal(unifiedDmoNames(base)[0], 'UnifiedssotIndividual__dlm');
  base.identity.apiName = 'Other_1';
  assert.deepEqual(unifiedDmoNames(base), []);
  assert.deepEqual(unifiedDmoNames({ kind: 'identity-resolution', identity: {} }), []);
});

test('graph, CI and Segment inputs on a unified DMO depend on the selected ruleset', () => {
  const ir = irInput();
  const edges = identityResolutionEdges([
    ir,
    segmentInput('UnifiedssotIndividualA1b2__dlm'),
    segmentInput('Person__dlm', 'Other'),
    ciInput('unifiedlinkssotindividuala1b2__dlm'),
    graphInput('UnifiedssotContactPointEmailA1b2__dlm'),
  ]);
  assert.deepEqual(Object.fromEntries(edges), {
    'Audience.segment.json': ['Individual_A1b2'],
    'Spend__cio.calculatedInsight.json': ['Individual_A1b2'],
    'Graph.native-dataGraph.json': ['Individual_A1b2'],
  });
  assert.equal(identityResolutionEdges([segmentInput('UnifiedssotIndividualA1b2__dlm')]).size, 0);
});

test('stages run P1 first and put IR dependents after the ruleset', async () => {
  const dmo = { path: 'Person__dlm.dmo-meta.json', document: { kind: 'dmo' } };
  const mapping = { path: 'm.mapping-meta.json', document: { kind: 'mapping' } };
  const ir = irInput();
  const dependent = segmentInput('UnifiedssotIndividualA1b2__dlm');
  const unrelated = segmentInput('Person__dlm', 'Other');
  const stages = planDeployStages([dependent, unrelated, ir, mapping, dmo], { nativeRoute: true });
  assert.deepEqual(
    stages.map((stage) => [stage.phase, stage.inputs.map((input) => input.path)]),
    [
      ['P1', ['m.mapping-meta.json', 'Person__dlm.dmo-meta.json']],
      ['P3', ['Other.segment.json', ir.path]],
      ['P3', ['Audience.segment.json']],
    ],
  );
  // Without the native route, P1 inputs stay in the first batch stage.
  assert.deepEqual(
    planDeployStages([dmo, ir, dependent], { nativeRoute: false }).map(
      (stage) => stage.inputs.length,
    ),
    [2, 1],
  );
  // The runner stops at the first non-success stage and hands planned keys onward.
  const seen = [];
  const result = await runCrudStages(stages, async (stage, planned) => {
    seen.push([stage.phase, [...planned]]);
    return seen.length === 2
      ? { status: 'blocked', code: 'X' }
      : { status: 'success', planned: ['dmo:a'] };
  });
  assert.deepEqual(result, { status: 'blocked', code: 'X' });
  // Preview runs every stage and still returns the first non-success result.
  const all = [];
  const previewResult = await runCrudStages(
    stages,
    async (stage) => {
      all.push(stage.phase);
      return all.length === 1 ? { status: 'blocked', code: 'Y' } : { status: 'success' };
    },
    { continueAfterBlocked: true },
  );
  assert.deepEqual(previewResult, { status: 'blocked', code: 'Y' });
  assert.deepEqual(all, ['P1', 'P3', 'P3']);
  assert.deepEqual(seen, [
    ['P1', []],
    ['P3', ['dmo:a']],
  ]);
});

/**
 * Mixed P1 + P3 project: DMO Person__dlm, mapping Person_map onto it, Segment Audience on it.
 * @returns {Promise<object[]>} Admitted inputs keyed by kind.
 */
const mixedProject = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'crud-plan-'));
  const fields = [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }];
  await writeNativeDmoDocument(
    {
      schemaVersion: 1,
      kind: 'dmo',
      identity: { dataSpace: 'default', apiName: 'Person__dlm' },
      spec: { label: 'Person', category: 'Other', fields },
    },
    cwd,
    false,
  );
  await writeNativeMappingDocument(
    {
      schemaVersion: 1,
      kind: 'mapping',
      identity: { dataSpace: 'default', apiName: 'Person_map' },
      spec: {
        sourceEntityDeveloperName: 'Person__dll',
        targetEntityDeveloperName: 'Person__dlm',
        fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
      },
    },
    cwd,
    false,
  );
  await writeSegmentDocument(segmentDocument('Person__dlm'), cwd, false);
  return readDeployInputs({
    cwd,
    metadata: ['dmo:Person__dlm', 'mapping:Person_map', 'segment:Audience'],
  });
};

/**
 * Command with mocked family preflight/executors; every call is recorded in order.
 * @param {object[]} inputs Admitted inputs.
 * @param {object} [flags] Flag overrides.
 * @returns {{command: object, calls: string[]}} Command and call ledger.
 */
const harness = (inputs, flags = {}) => {
  const calls = [];
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview: false,
      'api-version': 'auto',
      'allow-processing': true,
      'source-dir': ['synthetic'],
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'target',
        getConnection: () => ({ getApiVersion: () => '68.0' }),
      },
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.captureInput = async () => 'a'.repeat(64);
  command.verifySegmentInput = async () => {};
  command.verifyIdentityResolutionInput = async () => {};
  command.bindIdentityResolution = async () => 'stable';
  command.createSsotSender = () => ({ request: async () => assert.fail('no bound sender') });
  command.createDloClient = command.createDmoClient = () => ({});
  command.createMappingClient = () => ({});
  command.preflightNativeDmo = async () => {
    calls.push('dmo-preflight');
    return {
      family: 'dmo',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  };
  command.preflightMapping = async () => {
    calls.push('mapping-preflight');
    return {
      family: 'mapping',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'none',
      diagnostics: [],
    };
  };
  command.executeMapping = async () => {
    calls.push('mapping-execute');
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  command.preflightSegment = async (document) => {
    calls.push(`segment-preflight:${document.identity.apiName}`);
    return {
      family: 'segment',
      outcome: 'create',
      requiredEffects: ['processing'],
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  };
  command.executeSegment = async (document) => {
    calls.push(`segment-execute:${document.identity.apiName}`);
    return {
      family: 'segment',
      outcome: 'created',
      mutation: 'confirmed-created',
      diagnostics: [],
    };
  };
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
  command.executeIdentityResolution = async (
    document,
    _connection,
    _selection,
    _space,
    options,
  ) => {
    assert.equal(options.async, undefined);
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
  return { command, calls };
};

test('a mixed P1 + P3 selection runs the native phase before the dependency batch', async () => {
  const project = await mixedProject();
  const inputs = project.filter((input) => input.document.kind !== 'dmo');
  const { command, calls } = harness(inputs);
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(calls, [
    'mapping-execute',
    'segment-preflight:Audience',
    'segment-preflight:Audience',
    'segment-execute:Audience',
  ]);
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [
      ['mapping', 'created', 'confirmed-created'],
      ['segment', 'created', 'confirmed-created'],
    ],
  );
});

test('a failure in the native phase stops before the dependency batch', async () => {
  const project = await mixedProject();
  const inputs = project.filter((input) => input.document.kind !== 'dmo');
  const { command, calls } = harness(inputs);
  command.executeMapping = async () => {
    calls.push('mapping-execute');
    return { outcome: 'failed', mutation: 'unknown', diagnostics: [] };
  };
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.deepEqual(calls, ['mapping-execute']);
  assert.deepEqual(
    result.result.items.map((item) => item.family),
    ['mapping'],
  );
});

test('preview reports P3 items whose P1 parent is created earlier as planned', async () => {
  const inputs = await mixedProject();
  const { command, calls } = harness(inputs, { preview: true });
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => [
      item.identity.apiName,
      item.outcome,
      item.diagnostics[0]?.code,
    ]),
    [
      ['Person__dlm', 'create', undefined],
      ['Person_map', 'planned-dependencies', 'MAPPING_DEPENDENCIES_PLANNED'],
      ['Audience', 'planned-dependencies', 'DEPENDENCIES_PLANNED'],
    ],
  );
  assert.match(result.result.items[2].diagnostics[0].message, /dmo:person__dlm/u);
  assert.deepEqual(calls, ['dmo-preflight']);
  // A parent that exists already is compared as usual.
  const existing = harness(
    inputs.filter((input) => input.document.kind !== 'dmo'),
    {
      preview: true,
    },
  );
  const compared = await run(existing.command);
  assert.equal(compared.status, 'success');
  assert.deepEqual(existing.calls, ['mapping-preflight', 'segment-preflight:Audience']);
});

test('an IR is published before a Segment on its unified DMO is preflighted', async () => {
  const unified = 'UnifiedssotIndividualA1b2__dlm';
  const inputs = [segmentInput(unified), irInput()];
  const { command, calls } = harness(inputs);
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(calls, [
    'ir-preflight',
    'ir-preflight',
    'ir-execute',
    'ir-published',
    'segment-preflight:Audience',
    'segment-preflight:Audience',
    'segment-execute:Audience',
  ]);
  assert.deepEqual(
    result.result.items.map((item) => item.family),
    ['identity-resolution', 'segment'],
  );
  // Preview: an IR create leaves its dependent planned; an existing IR lets it be compared.
  const preview = harness(inputs, { preview: true });
  const planned = await run(preview.command);
  assert.equal(planned.status, 'success');
  assert.deepEqual(preview.calls, ['ir-preflight']);
  assert.equal(planned.result.items[1].outcome, 'planned-dependencies');
  assert.match(
    planned.result.items[1].diagnostics[0].message,
    /identity-resolution:individual_a1b2/u,
  );
  const settled = harness(inputs, { preview: true });
  const original = settled.command.preflightIdentityResolution;
  settled.command.preflightIdentityResolution = async (...arguments_) => ({
    ...(await original(...arguments_)),
    outcome: 'unchanged',
    requiredEffects: [],
  });
  const compared = await run(settled.command);
  assert.equal(compared.status, 'success');
  assert.deepEqual(settled.calls, ['ir-preflight', 'segment-preflight:Audience']);
});

test('--async is refused when the selection holds a dependent of the IR', async () => {
  const unified = 'UnifiedssotIndividualA1b2__dlm';
  for (const dependent of [segmentInput(unified), ciInput(unified), graphInput(unified)]) {
    const { command, calls } = harness([irInput(), dependent], { async: true });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'IDENTITY_RESOLUTION_ASYNC_DEPENDENTS');
    assert.deepEqual(calls, []);
  }
  // A Segment on another DMO is no dependent: --async reaches the IR executor.
  const { command, calls } = harness([irInput(), segmentInput('Person__dlm')], { async: true });
  command.executeIdentityResolution = async (_d, _c, _s, _p, options) => {
    assert.equal(options.async, true);
    calls.push('ir-execute');
    return {
      family: 'identity-resolution',
      outcome: 'creation-processing',
      mutation: 'acknowledged-processing',
      diagnostics: [],
    };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(calls.includes('ir-execute'));
});

test('a P3 input refusing the version blocks before any P1 read or write', async () => {
  const project = await mixedProject();
  const mapping = project.filter((input) => input.document.kind === 'mapping');
  for (const p3 of [irInput(), ciInput('Person__dlm')]) {
    const { command, calls } = harness([...mapping, p3], { 'api-version': '65.0' });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
  }
});

test('an invalid IR or CI file beside a mapping blocks before any native read or write', async () => {
  const project = await mixedProject();
  const mapping = project.filter((input) => input.document.kind === 'mapping');
  const brokenIr = irInput();
  brokenIr.document = structuredClone(brokenIr.document);
  delete brokenIr.document.spec.matchRules;
  const brokenCi = ciInput('Person__dlm');
  for (const [p3, code] of [
    [brokenIr, 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION'],
    [brokenCi, 'UNKNOWN_CI_CONFIGURATION'],
  ]) {
    const { command, calls } = harness([...mapping, p3]);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.deepEqual(calls, []);
    assert.deepEqual(result.result.items, []);
  }
});

const blockedDmoPreview = async () => ({
  family: 'dmo',
  outcome: 'blocked',
  target: 'unknown',
  absenceProof: 'none',
  diagnostics: [{ code: 'UNSUPPORTED_DMO_TARGET', message: 'refused' }],
});

test('preview runs later stages after a blocked native item; execution stops there', async () => {
  const inputs = await mixedProject();
  const preview = harness(inputs, { preview: true });
  preview.command.preflightNativeDmo = blockedDmoPreview;
  const result = await run(preview.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome]),
    [
      ['Person__dlm', 'blocked'],
      ['Audience', 'create'],
    ],
  );
  assert.deepEqual(preview.calls, ['segment-preflight:Audience']);
  // Without --preview a failed native item still stops before the batch.
  const execution = harness(inputs.filter((input) => input.document.kind !== 'dmo'));
  execution.command.executeMapping = async () => ({
    outcome: 'blocked',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  const stopped = await run(execution.command);
  assert.equal(stopped.status, 'blocked');
  assert.deepEqual(execution.calls, []);
});
