import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifySegmentInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { executeDmo, preflightDmo } from '../lib/services/command-native-dmo.js';
import { selectDeployDependencies } from '../lib/services/select-deploy-dependencies.js';

const identity = (kind, apiName) => ({ kind, dataSpace: 'default', apiName });
const dmo = (apiName) => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: apiName,
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});
const segment = (object = 'Person__dlm') => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: '',
    segmentType: 'DBT',
    segmentOn: identity('dmo', object),
    models: [{ name: 'Audience', sql: `SELECT ${object}.Id__c FROM ${object} WHERE 1 = 0` }],
    dependencies: [{ ...identity('dmo', object), fields: ['Id__c'] }],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const project = async (object = 'Person__dlm') => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-dmo-dependency-'));
  await writeNativeDmoDocument(dmo(object), cwd, false);
  await writeSegmentDocument(segment(object), cwd, false);
  return cwd;
};

/**
 * Run the command from a project directory with synthetic native DMO and Segment services.
 * @param {string} cwd Synthetic project root.
 * @param {object} flags Command flags.
 * @param {object} [services] Service overrides.
 * @returns {Promise<{result: object, calls: string[]}>} Envelope and ordered service calls.
 */
const deploy = async (cwd, flags, services = {}) => {
  const calls = [];
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      preview: false,
      'allow-processing': true,
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'target',
        getConnection: () => ({}),
      },
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  // Object.create skips class field initializers; restore the real local readers.
  command.resolveInputs = readDeployInputs;
  command.captureInput = captureDeployInputDigest;
  command.verifySegmentInput = verifySegmentInputDigest;
  command.createDmoClient = (target, version) => {
    calls.push(`client:${target}:${version}`);
    return { marker: 'dmo-client' };
  };
  command.preflightNativeDmo = async (document, client, scope) => {
    assert.equal(client.marker, 'dmo-client');
    assert.equal(scope, undefined);
    calls.push(`preflight:${document.identity.apiName}`);
    return {
      family: 'dmo',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  };
  command.executeNativeDmo = async (document, client) => {
    assert.equal(client.marker, 'dmo-client');
    calls.push(`execute:${document.identity.apiName}`);
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  command.preflightSegment = async (document, connection, selection) => {
    calls.push(`segment-preflight:${selection.soapNumeric}`);
    return {
      outcome: 'create',
      requiredEffects: ['processing'],
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  };
  command.executeSegment = async () => {
    calls.push('segment-execute');
    return {
      family: 'segment',
      outcome: 'created',
      mutation: 'confirmed-created',
      diagnostics: [],
    };
  };
  Object.assign(command, services);
  const previousCwd = process.cwd();
  const previousExit = process.exitCode;
  process.chdir(cwd);
  try {
    return { result: await command.run(), calls };
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
};

test('a Segment prerequisite DMO is read from the native artifact and deployed first on the native route', async () => {
  const cwd = await project();
  const { result, calls } = await deploy(cwd, {
    metadata: ['segment:Audience'],
    'include-dependencies': true,
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [
      ['Person__dlm', 'created', 'confirmed-created'],
      ['Audience', 'created', 'confirmed-created'],
    ],
  );
  assert.equal(
    result.result.items[0].path,
    path.join(cwd, 'data360', 'dmo', 'Person__dlm.dmo-meta.json'),
  );
  // Automatic selection uses the native DMO version, not the replaced API 65 pin.
  assert.deepEqual(result.result.items[0].routes, [
    { operation: 'dmo.deploy', apiVersion: '68.0', transport: 'native' },
  ]);
  assert.ok(calls.includes('client:target:68.0'));
  assert.ok(calls.indexOf('execute:Person__dlm') < calls.indexOf('segment-execute'));
  assert.ok(calls.includes('segment-preflight:68.0'));
  assert.deepEqual(
    result.result.selection.dependencies.map(({ identity: id, reason }) => [
      id.kind,
      reason.explicit,
    ]),
    [
      ['dmo', false],
      ['segment', true],
    ],
  );
  const preview = await deploy(cwd, {
    metadata: ['segment:Audience'],
    'include-dependencies': true,
    preview: true,
    'api-version': '65.0',
  });
  assert.equal(preview.result.status, 'success');
  assert.deepEqual(
    preview.result.result.items.map((item) => [
      item.identity.apiName,
      item.operation,
      item.outcome,
    ]),
    [
      ['Person__dlm', 'preview', 'create'],
      ['Audience', 'preview', 'create'],
    ],
  );
  // An explicit numeric pin is kept for the native route as well.
  assert.ok(preview.calls.includes('client:target:65.0'));
  assert.ok(!preview.calls.some((call) => call.includes('execute')));
});

test('a standard or generated DMO pulled in only as a prerequisite is reported and never written', async () => {
  const cwd = await project();
  const refuse = {
    preflightNativeDmo: async () => {
      throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
    },
  };
  const { result, calls } = await deploy(
    cwd,
    { metadata: ['segment:Audience'], 'include-dependencies': true },
    refuse,
  );
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [
      ['Person__dlm', 'unchanged', 'not-attempted'],
      ['Audience', 'created', 'confirmed-created'],
    ],
  );
  assert.equal(result.result.items[0].preflight.target, 'existing');
  assert.equal(
    result.result.items[0].preflight.diagnostics[0].code,
    'DMO_PREREQUISITE_NOT_DEPLOYED',
  );
  assert.ok(!calls.includes('execute:Person__dlm'));
  // The same refusal for an explicitly selected DMO still blocks the whole batch before writes.
  const explicit = await deploy(
    cwd,
    { metadata: ['segment:Audience', 'dmo:Person__dlm'], 'include-dependencies': true },
    refuse,
  );
  assert.notEqual(explicit.result.status, 'success');
  assert.equal(
    explicit.result.result.items[0].preflight.diagnostics[0].code,
    'UNSUPPORTED_DMO_TARGET',
  );
  assert.ok(explicit.result.result.items.every((item) => item.mutation === 'not-attempted'));
  assert.ok(!explicit.calls.some((call) => call.includes('execute')));
  // Any other preflight refusal of a prerequisite blocks as well.
  const other = await deploy(
    cwd,
    { metadata: ['segment:Audience'], 'include-dependencies': true },
    {
      preflightNativeDmo: async () => {
        throw new NativeDmoError('UNSUPPORTED_DMO_FIELD_CHANGE');
      },
    },
  );
  assert.notEqual(other.result.status, 'success');
  assert.ok(!other.calls.some((call) => call.includes('execute')));
});

test('namespaced and legacy-only DMO prerequisites stay external target bindings', async () => {
  const cwd = await project('ssot__Individual__dlm');
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  const selected = await selectDeployDependencies(roots, cwd);
  // The saved standard definition exists but is never selected as a deployable input.
  assert.deepEqual(selected.inputs, roots);
  assert.equal(selected.reasons.has('dmo:default:ssot__Individual__dlm'), false);
  const { result, calls } = await deploy(cwd, {
    metadata: ['segment:Audience'],
    'include-dependencies': true,
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    ['Audience'],
  );
  assert.ok(!calls.some((call) => call.startsWith('preflight:') || call.startsWith('execute:')));

  const legacy = await mkdtemp(path.join(os.tmpdir(), 'data360-dmo-dependency-legacy-'));
  await writeSegmentDocument(segment(), legacy, false);
  await mkdir(path.join(legacy, 'data360', 'default', 'dmo'), { recursive: true });
  await writeFile(
    path.join(legacy, 'data360', 'default', 'dmo', 'Person__dlm.json'),
    JSON.stringify({
      ...dmo('Person__dlm'),
      spec: {
        ...dmo('Person__dlm').spec,
        fields: [{ ...dmo('Person__dlm').spec.fields[0], isDynamicLookup: false }],
      },
    }),
  );
  const legacyRoots = await readDeployInputs({ cwd: legacy, metadata: ['segment:Audience'] });
  const unexpanded = await selectDeployDependencies(legacyRoots, legacy);
  assert.deepEqual(unexpanded.inputs, legacyRoots);
});

test('a native DMO changed since a Git reference joins the ordered batch with its Segment', async () => {
  const cwd = await project();
  const inputs = await readDeployInputs({ cwd, metadata: ['segment:Audience', 'dmo:Person__dlm'] });
  const segments = inputs.filter((input) => input.document.kind === 'segment');
  const { result, calls } = await deploy(
    cwd,
    { 'changed-since': 'main' },
    {
      selectGitInputs: async () => ({
        paths: inputs.map((input) => input.path),
        segments,
        provenance: { requestedRef: 'main' },
      }),
    },
  );
  assert.equal(result.status, 'success');
  assert.equal(result.provenance.git.requestedRef, 'main');
  assert.deepEqual(
    result.result.items.map((item) => [item.identity.apiName, item.outcome]),
    [
      ['Person__dlm', 'created'],
      ['Audience', 'created'],
    ],
  );
  assert.ok(calls.indexOf('execute:Person__dlm') < calls.indexOf('segment-execute'));
  // A Git selection of only native DMOs uses the same route.
  const alone = await deploy(
    cwd,
    { 'changed-since': 'main' },
    {
      selectGitInputs: async () => ({
        paths: inputs.filter((input) => input.document.kind === 'dmo').map((input) => input.path),
        provenance: { requestedRef: 'main' },
      }),
    },
  );
  assert.equal(alone.result.status, 'success');
  assert.deepEqual(
    alone.result.result.items.map((item) => [item.identity.apiName, item.outcome, item.mutation]),
    [['Person__dlm', 'created', 'confirmed-created']],
  );
  assert.deepEqual(alone.result.result.items[0].routes, [
    { operation: 'dmo.deploy', apiVersion: '68.0', transport: 'native' },
  ]);
});

for (const preview of [true, false])
  test(`--allow-field-removal reaches a native DMO in the ordered batch preview=${preview}`, async () => {
    const cwd = await project();
    const writes = [];
    let removed = false;
    const read = () => ({
      name: 'Person__dlm',
      label: 'Person__dlm',
      category: 'OTHER',
      creationType: 'Custom',
      dataSpaceName: 'default',
      fields: [
        { name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true },
        ...(removed ? [] : [{ name: 'Note__c', label: 'Note', type: 'Text', isPrimaryKey: false }]),
      ],
    });
    const services = {
      createDmoClient: () => ({
        get: async () => read(),
        create: async () => assert.fail('no POST'),
        update: async () => assert.fail('no PATCH'),
        delete: async () => assert.fail('no DELETE'),
        removeFields: async (target, names) => {
          writes.push([target, names]);
          removed = true;
        },
      }),
      preflightNativeDmo: preflightDmo,
      executeNativeDmo: executeDmo,
    };
    const selection = { metadata: ['segment:Audience'], 'include-dependencies': true, preview };
    // Without the flag the missing field blocks the whole batch before any write.
    const refused = await deploy(cwd, selection, services);
    assert.notEqual(refused.result.status, 'success');
    assert.ok(JSON.stringify(refused.result).includes('UNSUPPORTED_DMO_FIELD_CHANGE'));
    assert.ok(!refused.calls.includes('segment-execute'));
    assert.deepEqual(writes, []);
    const { result, calls } = await deploy(
      cwd,
      { ...selection, 'allow-field-removal': true },
      services,
    );
    assert.equal(result.status, 'success', JSON.stringify(result));
    const [item] = result.result.items;
    assert.equal(item.identity.apiName, 'Person__dlm');
    if (preview) {
      assert.equal(item.outcome, 'update');
      assert.deepEqual(item.removeFields, ['Note__c']);
      assert.equal(item.diagnostics[0].code, 'DMO_FIELD_REMOVAL_PLANNED');
      assert.deepEqual(writes, []);
      return;
    }
    // Removal only: no PATCH, one removal, before the dependent Segment write.
    assert.deepEqual(writes, [['Person__dlm', ['Note__c']]]);
    assert.equal(item.outcome, 'updated');
    assert.equal(item.mutation, 'confirmed-updated');
    assert.deepEqual(item.removedFields, ['Note__c']);
    assert.equal(item.preflight.diagnostics[0].code, 'DMO_FIELD_REMOVAL_PLANNED');
    assert.ok(calls.includes('segment-execute'));
  });
