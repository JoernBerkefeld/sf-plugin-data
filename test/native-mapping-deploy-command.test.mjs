import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { readDeployInputs, captureDeployInputDigest } from '../lib/artifacts/read-deploy-input.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
// Sanitized native API68 GET200 shape; identity/labels and Alpha were adapted to this scenario.
const statusAbsentDmo = JSON.parse(
  await readFile(new URL('fixtures/native-dmo-get-status-absent.json', import.meta.url), 'utf8'),
);
const names = ['Id__c', 'Note__c'];
const fields = names.map((name) => ({
  name,
  label: name,
  dataType: 'Text',
  isPrimaryKey: name === 'Id__c',
}));
const dlo = {
  schemaVersion: 1,
  kind: 'dlo',
  identity: { dataSpace: 'default', apiName: 'Example__dll' },
  spec: { label: 'Example', category: 'Other', fields },
};
const dmo = { ...dlo, kind: 'dmo', identity: { ...dlo.identity, apiName: 'Example__dlm' } };
const mapping = {
  schemaVersion: 1,
  kind: 'mapping',
  identity: { dataSpace: 'default', apiName: 'SourceGenerated' },
  spec: {
    sourceEntityDeveloperName: 'Example__dll',
    targetEntityDeveloperName: 'Example__dlm',
    fieldMappings: names.map((name) => ({
      sourceFieldDeveloperName: name,
      targetFieldDeveloperName: name,
    })),
  },
};
const wire = (kind) => ({
  name: kind === 'dlo' ? 'Example__dll' : 'Example__dlm',
  label: 'Example',
  category: 'Other',
  creationType: 'Custom',
  ...(kind === 'dlo'
    ? { status: 'ACTIVE', dataSpaceInfo: [{ name: 'default' }], fields }
    : {
        dataSpaceName: 'default',
        fields: fields.map(({ dataType, ...field }) => ({
          ...field,
          type: dataType,
          creationType: 'Custom',
        })),
      }),
});
const rawMapping = (pairs = mapping.spec.fieldMappings) => ({
  developerName: 'TargetGenerated',
  status: 'ACTIVE',
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  fieldMappings: pairs.map((pair, index) => ({ ...pair, developerName: `target_${index}` })),
});
const org = { getOrgId: () => 'org', getUsername: () => 'target' };
const run = async (command) => {
  const prior = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = prior;
  }
};
/**
 * Build isolated command inputs and independently observable fake transports.
 * @param {object} options Scenario controls.
 * @returns {Promise<object>} Command and request ledger.
 */
async function fixture(options = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'mapping-deploy-'));
  await writeDloDocument(dlo, cwd, false);
  await writeNativeDmoDocument(dmo, cwd, false);
  const receipt = await writeNativeMappingDocument(mapping, cwd, false);
  const inputs = await readDeployInputs({
    cwd,
    metadata: ['mapping:SourceGenerated', 'dmo:Example__dlm', 'dlo:Example__dll'],
  });
  const calls = [];
  const ready = new Set();
  let state =
    options.existing === 'noop'
      ? rawMapping()
      : options.existing === 'update'
        ? rawMapping(mapping.spec.fieldMappings.slice(0, 1))
        : undefined;
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'data-space': 'default',
      'api-version': options.version,
      preview: options.preview ?? false,
      'target-org': 'target',
      metadata: ['mapping:SourceGenerated'],
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () =>
    options.order
      ? options.order.map((kind) => inputs.find((input) => input.document.kind === kind))
      : inputs;
  command.resolveTargetOrg = async () => {
    calls.push('auth');
    return org;
  };
  command.createDloClient = command.createDmoClient = (_target, version) => {
    assert.equal(version, options.version ?? '68.0');
    return {};
  };
  for (const kind of ['dlo', 'dmo']) {
    command[kind === 'dlo' ? 'preflightDlo' : 'preflightNativeDmo'] = async () => ({
      family: kind,
      outcome: options.parentsExisting ? 'update' : 'create',
      target: options.parentsExisting ? 'existing' : 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    });
    command[kind === 'dlo' ? 'executeDlo' : 'executeNativeDmo'] = async () => {
      calls.push(`${kind}:execute`);
      if (options.failure === kind)
        return { outcome: 'failed', mutation: 'unknown', diagnostics: [] };
      ready.add(kind);
      calls.push(`${kind}:settled`);
      return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
    };
  }
  const dependency = (kind) => ({
    get: async () => {
      calls.push(`${kind}:dependency`);
      assert.ok(
        ready.has(kind) || options.parentsExisting,
        'dependency checked before selected parent settlement',
      );
      if (options.readFailure === kind) throw new Error('HTTP 503 independent GET failed');
      const response = structuredClone(
        kind === 'dmo' && options.realDmo ? statusAbsentDmo : wire(kind),
      );
      if (options.pending === kind) response.status = 'PROCESSING';
      if (options.readback?.kind === kind) options.readback.change(response);
      return response;
    },
  });
  command.createDloClient = (_target, version) => {
    assert.equal(version, options.version ?? '68.0');
    return dependency('dlo');
  };
  command.createDmoClient = (_target, version) => {
    assert.equal(version, options.version ?? '68.0');
    return dependency('dmo');
  };
  command.createMappingClient = () => ({
    list: async (target, source) => {
      calls.push('mapping:list');
      assert.equal(target, 'Example__dlm');
      assert.equal(source, 'Example__dll');
      return { objectSourceTargetMaps: state ? [structuredClone(state)] : [] };
    },
    get: async (name) => {
      assert.equal(name, 'TargetGenerated');
      if (!state) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return structuredClone(state);
    },
    create: async () => {
      calls.push('mapping:create');
      state = rawMapping();
      return state;
    },
    update: async (name, body) => {
      calls.push('mapping:update');
      assert.equal(name, 'TargetGenerated');
      assert.equal(body.fieldMapping.length, 1);
      state.fieldMappings.push({ ...body.fieldMapping[0], developerName: 'new_server_selector' });
      return state;
    },
    delete: async () => assert.fail('deploy must not delete'),
  });
  return { command, calls, cwd, inputs, receipt };
}
for (const scope of [undefined, 'Team'])
  for (const preview of [false, true])
    test(`public mapping deploy passes final scope preserving callbacks ${scope}/${preview}`, async () => {
      const { command, inputs } = await fixture({ preview });
      command.parse = async () => ({
        flags: { dataspace: scope, preview, 'target-org': 'target' },
      });
      command.resolveInputs = async () =>
        inputs.filter((input) => input.document.kind === 'mapping');
      command.createMappingClient = (_target, _version, runner, actual) => {
        assert.equal(runner, undefined);
        assert.equal(actual, scope);
        return {};
      };
      let calls = 0;
      command.preflightMapping = async (_value, _client, dependencies, actual) => {
        calls++;
        assert.ok(dependencies.source);
        assert.equal(actual, scope);
        return { outcome: 'unchanged', diagnostics: [] };
      };
      command.executeMapping = async (_value, _client, dependencies, callback, actual) => {
        calls++;
        assert.ok(dependencies.target);
        assert.equal(typeof callback, 'function');
        assert.equal(actual, scope);
        return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
      };
      const result = await run(command);
      assert.equal(result.status, 'success');
      assert.equal(calls, 1);
    });

test('human deployment identifies each created component and keeps JSON unchanged', async () => {
  for (const json of [false, true]) {
    const { command } = await fixture();
    const lines = [];
    command.jsonEnabled = () => json;
    command.log = (line) => lines.push(line);
    const result = await run(command);
    assert.equal(result.status, 'success');
    assert.deepEqual(
      lines.filter((line) => line.startsWith('created ')),
      json
        ? []
        : [
            'created dlo Example__dll',
            'created dmo Example__dlm',
            'created mapping TargetGenerated',
          ],
    );
    assert.ok(!JSON.stringify(result).includes('deleted'));
    if (!json) assert.equal(lines.at(-1), 'Deployed: 3 (3 created / 0 updated / 0 failed)');
  }
});

test('DLO processing evidence is private and cleared only by existing parent settlement', async () => {
  for (const withMapping of [false, true])
    for (const pending of [false, true]) {
      const { command, inputs } = await fixture({ pending: pending ? 'dlo' : undefined });
      command.resolveInputs = async () =>
        withMapping ? inputs : inputs.filter((input) => input.document.kind === 'dlo');
      command.executeDlo = async () => ({
        outcome: 'created',
        mutation: 'confirmed-created',
        serverProcessing: true,
        diagnostics: [],
      });
      const lines = [];
      command.jsonEnabled = () => false;
      command.log = (line) => lines.push(line);
      // The synthetic executor admits the DLO; independent reads still enforce settlement.
      command.createDloClient = () => ({
        get: async () => ({ ...wire('dlo'), status: pending ? 'PROCESSING' : 'ACTIVE' }),
      });
      const result = await run(command);
      if (withMapping && pending) {
        assert.equal(result.status, 'failed');
        assert.ok(!lines.some((line) => line.includes('(server is still processing)')));
      } else {
        assert.equal(result.status, 'success', JSON.stringify(result));
        assert.ok(
          lines.includes(
            `created dlo Example__dll${withMapping ? '' : ' (server is still processing)'}`,
          ),
        );
      }
      assert.ok(!JSON.stringify(result).includes('serverProcessing'));
    }
});

test('mixed batch deployment carries DLO processing without changing JSON', async () => {
  const { command, inputs } = await fixture({ version: 'auto' });
  command.resolveInputs = async () => [
    inputs.find((input) => input.document.kind === 'dlo'),
    {
      path: 'Audience.segment.json',
      inputDigest: 'b'.repeat(64),
      document: {
        schemaVersion: 1,
        kind: 'segment',
        identity: { dataSpace: 'default', apiName: 'Audience' },
        spec: {
          displayName: 'Audience',
          description: 'Description',
          segmentType: 'DBT',
          segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
          models: [
            { name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' },
          ],
          dependencies: [
            { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
          ],
          publishInterval: 'NO_REFRESH',
          lookbackPeriod: 'P90D',
        },
      },
    },
  ];
  command.resolveTargetOrg = async () => ({ ...org, getConnection: () => ({}) });
  command.captureInput = async () => 'unchanged';
  command.createDloClient = () => ({});
  command.verifyDloInput = async () => {};
  command.preflightDlo = async () => ({
    outcome: 'create',
    target: 'absent',
    absenceProof: 'confirmed-404',
    diagnostics: [],
  });
  command.verifySegmentInput = async () => {};
  command.preflightSegment = async () => ({
    family: 'segment',
    outcome: 'unchanged',
    target: 'present',
    absenceProof: 'none',
    requiredEffects: [],
    diagnostics: [],
  });
  command.executeDlo = async () => ({
    outcome: 'created',
    mutation: 'confirmed-created',
    serverProcessing: true,
    diagnostics: [],
  });
  command.executeSegment = async () => ({
    family: 'segment',
    route: { apiVersion: '68.0', method: 'PATCH', resource: 'segments' },
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  const lines = [];
  command.jsonEnabled = () => false;
  command.log = (line) => lines.push(line);
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.ok(lines.includes('created dlo Example__dll (server is still processing)'));
  assert.ok(lines.includes('Unchanged: segment:Audience; mutation: not-attempted.'));
  assert.ok(!JSON.stringify(result).includes('serverProcessing'));
});

test('mapping update human name is independently resolved, not the authored alias', async () => {
  const { command } = await fixture({
    parentsExisting: true,
    existing: 'update',
    order: ['mapping'],
  });
  const lines = [];
  command.jsonEnabled = () => false;
  command.log = (line) => lines.push(line);
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.ok(lines.includes('updated mapping TargetGenerated'));
  assert.ok(!lines.some((line) => line.includes('(server is still processing)')));
});

test('deployment totals mix created, updated, unchanged and failed components without double counting', async () => {
  const { command, inputs, cwd } = await fixture();
  const lines = [];
  command.jsonEnabled = () => false;
  command.log = (line) => lines.push(line);
  const extras = [];
  for (const name of ['Unchanged', 'ZFailed']) {
    await writeNativeMappingDocument(
      { ...mapping, identity: { ...mapping.identity, apiName: name } },
      cwd,
      false,
    );
    extras.push(...(await readDeployInputs({ cwd, metadata: [`mapping:${name}`] })));
  }
  command.resolveInputs = async () => [...inputs, ...extras];
  let index = 0;
  command.executeMapping = async () => {
    const outcome = ['updated', 'unchanged', 'failed'][index++];
    return {
      outcome,
      mutation:
        outcome === 'updated'
          ? 'confirmed-updated'
          : outcome === 'unchanged'
            ? 'not-attempted'
            : 'unknown',
      diagnostics: [],
    };
  };
  await run(command);
  assert.equal(lines.at(-1), 'Deployed: 3 (2 created / 1 updated / 1 failed)');
});

test('human mapping update lists confirmed removed and added pairs only', async () => {
  for (const outcome of ['updated', 'unchanged', 'failed']) {
    for (const json of [false, true]) {
      const { command } = await fixture({ parentsExisting: true, order: ['mapping'] });
      const lines = [];
      command.jsonEnabled = () => json;
      command.log = (line) => lines.push(line);
      command.executeMapping = async (_document, _client, _dependencies, report) => {
        report({
          deleted: [{ sourceFieldDeveloperName: 'Old__c', targetFieldDeveloperName: 'Value__c' }],
          added: [
            { sourceFieldDeveloperName: 'New__c', targetFieldDeveloperName: 'Value__c' },
            { sourceFieldDeveloperName: 'Extra__c', targetFieldDeveloperName: 'Extra__c' },
          ],
        });
        return {
          outcome,
          mutation:
            outcome === 'updated'
              ? 'confirmed-updated'
              : outcome === 'failed'
                ? 'unknown'
                : 'not-attempted',
          diagnostics: [],
        };
      };
      const result = await run(command);
      const changes = lines.filter((line) => line.includes('field mappings:'));
      assert.deepEqual(
        changes,
        !json && outcome === 'updated'
          ? [
              'Deleted field mappings: Old__c -> Value__c.',
              'Added field mappings: New__c -> Value__c, Extra__c -> Extra__c.',
            ]
          : [],
      );
      assert.ok(!JSON.stringify(result).includes('Old__c'));
      if (!json)
        assert.equal(
          lines.at(-1),
          `Deployed: ${outcome === 'updated' ? 1 : 0} (0 created / ${outcome === 'updated' ? 1 : 0} updated / ${outcome === 'failed' ? 1 : 0} failed)`,
        );
      if (!json && outcome !== 'updated')
        assert.ok(!lines.some((line) => line.startsWith('updated ')));
    }
  }
});

test('human additive update omits empty deletion list and preview uses planned labels', async () => {
  for (const preview of [false, true]) {
    const { command } = await fixture({
      parentsExisting: true,
      existing: 'update',
      order: ['mapping'],
      preview,
    });
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.ok(!lines.some((line) => line.startsWith('Deleted field mappings:')));
    if (preview) {
      assert.ok(lines.includes('Planned update: mapping:SourceGenerated.'));
      assert.ok(!lines.some((line) => /^(Updated|Added field mappings):/u.test(line)));
    } else assert.ok(lines.includes('Added field mappings: Note__c -> Note__c.'));
  }
});

test('canonical mapping admission coalesces exact selectors, freezes shape and binds original bytes', async () => {
  const { cwd, receipt } = await fixture();
  const inputs = await readDeployInputs({
    cwd,
    metadata: ['mapping:SourceGenerated', 'mapping:SourceGenerated'],
  });
  assert.equal(inputs.length, 1);
  assert.ok(Object.isFrozen(inputs[0].document.spec.fieldMappings));
  assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
  await writeFile(
    receipt.path,
    JSON.stringify({
      ...mapping,
      spec: { ...mapping.spec, targetEntityDeveloperName: 'Other__dlm' },
    }),
  );
  await assert.rejects(captureDeployInputDigest(inputs[0]), { code: 'UNSAFE_SOURCE' });
});
for (const order of [
  ['mapping', 'dmo', 'dlo'],
  ['dmo', 'mapping', 'dlo'],
  ['dlo', 'mapping', 'dmo'],
  ['mapping', 'dlo', 'dmo'],
  ['dmo', 'dlo', 'mapping'],
  ['dlo', 'dmo', 'mapping'],
]) {
  test(`mixed deployment settles parents before mapping: ${order}`, async () => {
    const { command, calls } = await fixture({ order });
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(
      result.result.items.map((item) => item.family),
      ['dlo', 'dmo', 'mapping'],
    );
    assert.ok(calls.indexOf('dlo:settled') < calls.indexOf('dlo:dependency'));
    assert.ok(calls.indexOf('dmo:settled') < calls.indexOf('mapping:list'));
    assert.equal(calls.filter((call) => call === 'mapping:create').length, 1);
  });
}
for (const existing of ['update', 'noop'])
  test(`mixed public mapping ${existing} resolves server target name`, async () => {
    const { command, calls } = await fixture({ existing });
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.result.items.at(-1).outcome, existing === 'noop' ? 'unchanged' : 'updated');
    assert.equal(
      calls.filter((call) => call === 'mapping:update').length,
      existing === 'noop' ? 0 : 1,
    );
    assert.equal(calls.includes('mapping:create'), false);
  });
for (const failure of ['dlo', 'dmo'])
  test(`failed parent ${failure} stops before mapping validation`, async () => {
    const { command, calls } = await fixture({ failure });
    const result = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(calls.includes('mapping:list'), false);
    assert.equal(calls.includes('dlo:dependency'), failure !== 'dlo');
    if (failure === 'dlo') assert.equal(calls.includes('dmo:execute'), false);
  });
for (const pending of ['dlo'])
  test(`independent ${pending} PROCESSING readback stops mapping despite successful write echo`, async () => {
    const { command, calls } = await fixture({ pending });
    const result = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items.at(-1).mutation, 'unknown');
    assert.equal(calls.includes('mapping:list'), false);
    if (pending === 'dlo') assert.equal(calls.includes('dmo:execute'), false);
  });
test('native DMO GET200 without status and isEnabled false confirms definition before mapping', async () => {
  assert.equal(Object.hasOwn(statusAbsentDmo, 'status'), false);
  assert.equal(statusAbsentDmo.isEnabled, false);
  const { command, calls } = await fixture({ realDmo: true });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.ok(calls.indexOf('dlo:dependency') < calls.indexOf('dmo:execute'));
  assert.ok(calls.indexOf('dmo:dependency') < calls.indexOf('mapping:list'));
  assert.equal(calls.filter((call) => call === 'mapping:create').length, 1);
});
for (const kind of ['dlo', 'dmo']) {
  for (const [scenario, change] of [
    ['wrong identity', (response) => (response.name = `Wrong__${kind === 'dlo' ? 'dll' : 'dlm'}`)],
    ['wrong label', (response) => (response.label = 'Wrong')],
    ['wrong category', (response) => (response.category = 'Profile')],
    ['missing requested field', (response) => (response.fields = response.fields.slice(1))],
    [
      'lost primary key',
      (response) => (response.fields.find((field) => field.name === 'Id__c').isPrimaryKey = false),
    ],
    [
      'wrong field type',
      (response) => (response.fields[0][kind === 'dlo' ? 'dataType' : 'type'] = 'Number'),
    ],
    ['malformed fields', (response) => (response.fields = {})],
    [
      'wrong dataspace',
      (response) => {
        if (kind === 'dlo') response.dataSpaceInfo = [{ name: 'wrong' }];
        else response.dataSpaceName = 'wrong';
      },
    ],
    ...(kind === 'dlo' ? [['missing status', (response) => delete response.status]] : []),
  ]) {
    test(`independent ${kind} ${scenario} stops dependent writes`, async () => {
      const { command, calls } = await fixture({ realDmo: true, readback: { kind, change } });
      const result = await run(command);
      assert.equal(result.status, 'failed');
      assert.equal(
        result.result.items.at(-1).diagnostics[0].code,
        'NATIVE_PARENT_SETTLEMENT_UNCONFIRMED',
      );
      assert.equal(calls.includes('mapping:list'), false);
      assert.equal(calls.includes('mapping:create'), false);
      if (kind === 'dlo') assert.equal(calls.includes('dmo:execute'), false);
    });
  }
  test(`independent ${kind} failed GET stops dependent writes`, async () => {
    const { command, calls } = await fixture({ readFailure: kind });
    const result = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items.at(-1).mutation, 'unknown');
    assert.equal(calls.filter((call) => call === `${kind}:dependency`).length, 1);
    assert.equal(calls.includes('mapping:list'), false);
    if (kind === 'dlo') assert.equal(calls.includes('dmo:execute'), false);
  });
}
test('preview with planned new parents never writes or falsely validates mapping dependencies', async () => {
  const { command, calls } = await fixture({ preview: true });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.result.items.at(-1).outcome, 'planned-dependencies');
  assert.deepEqual(calls, ['auth']);
});
for (const existing of ['update', 'noop'])
  test(`preview existing parents mapping ${existing} never writes`, async () => {
    const { command, calls } = await fixture({ preview: true, parentsExisting: true, existing });
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.result.items.at(-1).outcome, existing);
    assert.ok(calls.includes('mapping:list'));
    assert.ok(
      !calls.some(
        (call) =>
          call.includes('execute') || call === 'mapping:create' || call === 'mapping:update',
      ),
    );
  });
test('local mapping selection and shape errors refuse before authentication', async () => {
  const { command, cwd, receipt, calls } = await fixture();
  for (const selector of [
    'mapping',
    'mapping:',
    'mapping:../Bad',
    'mapping:*',
    'SourceGenerated',
  ]) {
    command.resolveInputs = () => readDeployInputs({ cwd, metadata: [selector] });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
  }
  await writeFile(receipt.path, JSON.stringify({ ...mapping, extra: true }));
  command.resolveInputs = () => readDeployInputs({ cwd, metadata: ['mapping:SourceGenerated'] });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(calls, []);
});
for (const version of ['61.0', '67.0', '68.0'])
  test(`native deploy retains explicit numeric ${version}`, async () => {
    const { command } = await fixture({ version });
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.metadata.soapApiVersion, version);
  });
