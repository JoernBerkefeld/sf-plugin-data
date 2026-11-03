import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNativeMapping,
  NativeMappingError,
} from '../lib/artifacts/native-mapping-document.js';
import {
  deleteNativeMapping,
  deployNativeMapping,
  preflightNativeMapping,
  preflightDeleteNativeMapping,
  retrieveNativeMapping,
  preflightUnmapNativeMapping,
  unmapNativeMappingFields,
} from '../lib/services/native-mapping.js';
import { executeMapping, preflightMapping } from '../lib/services/command-native-mapping.js';

const names = [
  'Id__c',
  'Name__c',
  'Note__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
  'KQ_Id__c',
];
const system = new Set(names.slice(3));
const pair = (name, selector = `target_${name}`) => ({
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
  developerName: selector,
});
const raw = (fields = names) => ({
  developerName: 'TargetGenerated_123',
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  status: 'ACTIVE',
  fieldMappings: fields.map((name) => pair(name)),
});
const desired = (fields = names) => {
  const document = normalizeNativeMapping(raw(fields));
  document.identity.apiName = 'SourceGenerated_456';
  for (const field of document.spec.fieldMappings)
    field.developerName = `source_${field.sourceFieldDeveloperName}`;
  return document;
};
const source = () => ({
  name: 'Example__dll',
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: names.map((name) => ({
    name,
    label: name,
    dataType: 'Text',
    isPrimaryKey: name === 'Id__c',
  })),
});
const target = () => ({
  name: 'Example__dlm',
  label: 'Example',
  category: 'OTHER',
  dataSpaceName: 'default',
  fields: names.map((name) => ({
    name,
    label: name,
    type: 'Text',
    isPrimaryKey: name === 'Id__c',
    creationType: system.has(name) ? 'System' : 'Custom',
    ...(name === 'Id__c' ? { keyQualifierName: 'KQ_Id' } : {}),
    ...(name === 'KQ_Id__c' ? { usageTag: 'KeyQualifier' } : {}),
  })),
});
const dependencies = () => ({
  source: { get: async () => source() },
  target: { get: async () => target() },
});
const missing = () => new NativeMappingError('MAPPING_HTTP_ERROR', 404);
/**
 * Build isolated in-memory transport state with a request ledger.
 * @param {object} initial Initial native detail.
 * @returns {object} Fake client and ledger.
 */
function fixture(initial = raw()) {
  let state = initial;
  const schema = target();
  for (const field of schema.fields)
    if (state.fieldMappings.some((pair) => pair.targetFieldDeveloperName === field.name))
      field.isMapped = true;
  const deps = {
    source: { get: async () => source() },
    target: { get: async () => structuredClone(schema) },
  };
  const calls = [];
  return {
    calls,
    deps,
    state,
    schema,
    client: {
      apiVersion: '68.0',
      deleteField: async (name, selector) => {
        calls.push(['unmap', name, selector]);
        const removed = state.fieldMappings.find((pair) => pair.developerName === selector);
        state.fieldMappings = state.fieldMappings.filter((pair) => pair !== removed);
        delete schema.fields.find((field) => field.name === removed.targetFieldDeveloperName)
          .isMapped;
      },
      list: async (dmo, dlo) => {
        calls.push(['list', dmo, dlo]);
        return { objectSourceTargetMaps: state ? [structuredClone(state)] : [] };
      },
      get: async (name) => {
        calls.push(['get', name]);
        if (!state) throw missing();
        return structuredClone(state);
      },
      create: async (body) => {
        calls.push(['create', body]);
        state = raw();
        return { ...structuredClone(state), status: 'CREATING' };
      },
      update: async (name, body) => {
        calls.push(['update', name, body]);
        for (const [index, pair] of body.fieldMapping.entries()) {
          state.fieldMappings.push({
            ...pair,
            developerName: index === 0 ? 'fresh_server_selector' : `fresh_server_selector_${index}`,
          });
          schema.fields.find((field) => field.name === pair.targetFieldDeveloperName).isMapped =
            true;
        }
        return structuredClone(state);
      },
      delete: async (name) => {
        calls.push(['delete', name]);
        state = undefined;
      },
    },
  };
}

test('mapping create projects the evidenced three authored pairs, retains seven on readback and ignores source selectors', async () => {
  const { client, calls } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  const input = desired();
  const before = structuredClone(input);
  const result = await deployNativeMapping(input, client, dependencies());
  assert.equal(result.operation, 'create');
  assert.equal(result.document.identity.apiName, 'TargetGenerated_123');
  assert.equal(result.document.spec.fieldMappings.length, 7);
  const write = calls.find(([kind]) => kind === 'create')[1];
  assert.deepEqual(write, {
    sourceEntityDeveloperName: 'Example__dll',
    targetEntityDeveloperName: 'Example__dlm',
    fieldMapping: names
      .slice(0, 3)
      .map((name) => ({ sourceFieldDeveloperName: name, targetFieldDeveloperName: name })),
  });
  assert.deepEqual(input, before);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
});

test('mapping unique pair resolution produces no-op with zero writes despite source name/selectors/order', async () => {
  const { client, calls } = fixture();
  const input = desired();
  input.spec.fieldMappings.reverse();
  const result = await deployNativeMapping(input, client, dependencies());
  assert.equal(result.operation, 'noop');
  assert.deepEqual(calls[0], ['list', 'Example__dlm', 'Example__dll']);
  assert.ok(
    calls.every(
      ([kind, name]) => ['get', 'list'].includes(kind) && name !== input.identity.apiName,
    ),
  );
  const preview = await preflightMapping(input, client, dependencies());
  assert.equal(preview.outcome, 'noop');
  assert.deepEqual(await executeMapping(input, client, dependencies()), {
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
});

test('mapping adds a never-observed pair without selectors and preserves all existing pairs independently', async () => {
  const { client, calls, deps } = fixture(raw(names.filter((name) => name !== 'Name__c')));
  const result = await deployNativeMapping(desired(), client, deps);
  assert.equal(result.operation, 'update');
  const writes = calls.filter(([kind]) => kind === 'update');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], [
    'update',
    'TargetGenerated_123',
    {
      sourceEntityDeveloperName: 'Example__dll',
      targetEntityDeveloperName: 'Example__dlm',
      fieldMapping: [{ sourceFieldDeveloperName: 'Name__c', targetFieldDeveloperName: 'Name__c' }],
    },
  ]);
  assert.equal(result.document.spec.fieldMappings.length, 7);
  assert.equal(result.document.spec.fieldMappings.at(-1).developerName, 'fresh_server_selector');
  const replay = await deployNativeMapping(desired(), client, dependencies());
  assert.equal(replay.operation, 'noop');
  assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
});

test('mapping explicit context threads through create, no-op, additive readback and command callbacks', async () => {
  const scope = 'Team / +&?=ü';
  for (const operation of ['create', 'noop', 'update']) {
    const f = fixture(
      operation === 'update' ? raw(names.filter((name) => name !== 'Name__c')) : raw(),
    );
    const input = desired();
    input.identity.dataSpace = scope;
    const deps = scopedDependencies(f.deps, scope);
    if (operation === 'create') f.client.list = async () => ({ objectSourceTargetMaps: [] });
    const before = structuredClone(input);
    await assert.rejects(preflightNativeMapping(input, f.client, deps), /DATASPACE/);
    assert.deepEqual(f.calls, []);
    const preview = await preflightMapping(input, f.client, deps, scope);
    assert.equal(preview.outcome, operation);
    const updates = [];
    const result = await deployNativeMapping(
      input,
      f.client,
      deps,
      (change) => updates.push(change),
      scope,
    );
    assert.equal(result.operation, operation);
    assert.equal(result.document.identity.dataSpace, scope);
    assert.equal(updates.length, operation === 'update' ? 1 : 0);
    assert.deepEqual(input, before);
    const receipt = await executeMapping(input, f.client, deps, undefined, scope);
    assert.equal(receipt.outcome, operation === 'create' ? 'created' : 'unchanged');
    const retrieved = await retrieveNativeMapping('TargetGenerated_123', f.client, scope);
    assert.equal(retrieved.identity.dataSpace, scope);
  }
});

/**
 * Supply fresh scoped parent representations without changing transport signatures.
 * @param {object} deps Existing parent readers.
 * @param {string} scope Observed scope.
 * @returns {object} Scoped readers.
 */
function scopedDependencies(deps, scope) {
  return {
    source: {
      get: async (name) => ({ ...(await deps.source.get(name)), dataSpaceInfo: [{ name: scope }] }),
    },
    target: { get: async (name) => ({ ...(await deps.target.get(name)), dataSpaceName: scope }) },
  };
}

test('mapping scope mismatch rejects explicit mapping responses and fresh parents before dispatch', async () => {
  const scope = 'Team';
  for (const mode of ['source', 'target', 'inventory', 'detail', 'desired']) {
    const f = fixture();
    const input = desired();
    input.identity.dataSpace = mode === 'desired' ? 'Wrong' : scope;
    const deps = scopedDependencies(f.deps, scope);
    if (mode === 'source') deps.source = f.deps.source;
    if (mode === 'target') deps.target = f.deps.target;
    if (mode === 'inventory')
      f.client.list = async () => ({
        objectSourceTargetMaps: [{ ...raw(), dataSpaceName: 'Wrong' }],
      });
    if (mode === 'detail') f.client.get = async () => ({ ...raw(), dataSpaceName: 'Wrong' });
    await assert.rejects(deployNativeMapping(input, f.client, deps, undefined, scope), /DATASPACE/);
    assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  }
});

test('mapping creation accepts confirmed filtered 404 but not authentication or generic failures', async () => {
  const { client } = fixture();
  client.list = async () => {
    throw missing();
  };
  const plan = await preflightNativeMapping(desired(), client, dependencies());
  assert.equal(plan.operation, 'create');
  for (const error of [
    new NativeMappingError('MAPPING_HTTP_ERROR', 401),
    new NativeMappingError('MAPPING_HTTP_ERROR', 403),
    new Error('404'),
    new NativeMappingError('OTHER', 404),
  ]) {
    client.list = async () => {
      throw error;
    };
    await assert.rejects(
      preflightNativeMapping(desired(), client, dependencies()),
      (actual) => actual === error,
    );
  }
});

test('mapping malformed, paginated, ambiguous or wrong-binding inventory never permits a write', async () => {
  for (const inventory of [
    undefined,
    [],
    {},
    { objectSourceTargetMaps: [], nextPageUrl: '/next' },
    { objectSourceTargetMaps: [raw(), raw()] },
    { objectSourceTargetMaps: [{ ...raw(), sourceEntityDeveloperName: 'Other__dll' }] },
    { objectSourceTargetMaps: [{}] },
  ]) {
    const { client, calls } = fixture();
    client.list = async () => inventory;
    await assert.rejects(preflightNativeMapping(desired(), client, dependencies()));
    assert.ok(!calls.some(([kind]) => kind === 'create' || kind === 'update'));
  }
  const { client } = fixture();
  client.get = async () => ({ ...raw(), developerName: 'Other' });
  await assert.rejects(preflightNativeMapping(desired(), client, dependencies()), /IDENTITY/);
  client.get = async () => ({ ...raw(), status: 'CREATING' });
  await assert.rejects(preflightNativeMapping(desired(), client, dependencies()), /NOT_SETTLED/);
  client.get = async () => {
    throw missing();
  };
  await assert.rejects(preflightNativeMapping(desired(), client, dependencies()), /HTTP_ERROR/);
});

test('mapping source/target field, identity, dataspace and type validation fail before dispatch', async () => {
  for (const change of [
    (d) => (d.source.get = async () => ({ ...source(), name: 'Other__dll' })),
    (d) => (d.target.get = async () => ({ ...target(), name: 'Other__dlm' })),
    (d) => (d.target.get = async () => ({ ...target(), dataSpaceName: 'other' })),
    (d) => (d.source.get = async () => ({ ...source(), dataSpaceInfo: [{ name: 'other' }] })),
    (d) =>
      (d.source.get = async () => ({
        ...source(),
        fields: source().fields.filter((f) => f.name !== 'Note__c'),
      })),
    (d) =>
      (d.target.get = async () => ({
        ...target(),
        fields: target().fields.map((f) => (f.name === 'Note__c' ? { ...f, type: 'Date' } : f)),
      })),
  ]) {
    const deps = dependencies();
    change(deps);
    const { client, calls } = fixture();
    await assert.rejects(preflightNativeMapping(desired(), client, deps));
    assert.equal(calls.length, 0);
  }
});

test('mapping create fails closed for unknown generated policy and missing primary key without dropping user fields', async () => {
  const { client } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  const deps = dependencies();
  deps.target.get = async () => ({
    ...target(),
    fields: target().fields.map((f) => (f.name === 'KQ_Id__c' ? { ...f, usageTag: 'Unknown' } : f)),
  });
  await assert.rejects(preflightNativeMapping(desired(), client, deps), /POLICY_UNPROVEN/);
  await assert.rejects(
    preflightNativeMapping(desired(['Name__c']), client, dependencies()),
    /PRIMARY_KEY/,
  );
  const input = desired(['Id__c', 'Name__c', 'Note__c']);
  const plan = await preflightNativeMapping(input, client, dependencies());
  assert.equal(plan.writes[0].body.fieldMapping.length, 3);
});

test('mapping removal and replacement fail closed without qualified metadata', async () => {
  const full = fixture().client;
  await assert.rejects(
    preflightNativeMapping(
      desired(names.filter((name) => name !== 'Name__c')),
      full,
      dependencies(),
    ),
    /UNPROVEN/,
  );
  const collision = raw();
  collision.fieldMappings = collision.fieldMappings.filter(
    (f) => f.sourceFieldDeveloperName !== 'Name__c',
  );
  collision.fieldMappings.push({ ...pair('Name__c'), targetFieldDeveloperName: 'Note__c' });
  await assert.rejects(
    preflightNativeMapping(desired(), fixture(collision).client, dependencies()),
    /UNPROVEN/,
  );
});

test('mapping bounded settlement rejects echoes, loss of omitted pairs, selector drift and failed readback without retrying writes', async () => {
  for (const returned of [
    raw(names.filter((name) => name !== 'Name__c')),
    raw(names.filter((name) => name !== 'KQ_Id__c')),
    { ...raw(), status: 'CREATING' },
    {
      ...raw(),
      fieldMappings: raw().fieldMappings.map((p) => ({
        ...p,
        developerName: `changed_${p.sourceFieldDeveloperName}`,
      })),
    },
  ]) {
    const { client, calls, deps } = fixture(raw(names.filter((name) => name !== 'Name__c')));
    const original = client.get;
    client.get = async (name) =>
      calls.some(([kind]) => kind === 'update') ? returned : original(name);
    await assert.rejects(deployNativeMapping(desired(), client, deps), /PERSISTENCE/);
    assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
  }
  const { client, calls } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  client.get = async () => {
    throw new NativeMappingError('MAPPING_HTTP_ERROR', 403);
  };
  await assert.rejects(deployNativeMapping(desired(), client, dependencies()), /HTTP_ERROR/);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
});

test('mapping create settles transient GET404 only, verifies bindings and never trusts write response as persistence', async () => {
  const { client, calls } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  const original = client.get;
  let count = 0;
  client.get = async (name) => {
    if (++count === 1) throw missing();
    return original(name);
  };
  const result = await deployNativeMapping(desired(), client, dependencies());
  assert.equal(result.operation, 'create');
  assert.equal(count, 2);
  client.get = async () => ({ ...raw(), targetEntityDeveloperName: 'Other__dlm' });
  await assert.rejects(deployNativeMapping(desired(), client, dependencies()), /BINDING/);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 2);
});

test('mapping create preserves every server-returned generated pair even for an authored-only input', async () => {
  const { client, calls } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  client.get = async () => raw(names.slice(0, 3));
  await assert.rejects(
    deployNativeMapping(desired(names.slice(0, 3)), client, dependencies()),
    /PERSISTENCE/,
  );
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
});

const deleteFixture = () => {
  const selected = raw();
  const survivor = {
    ...raw(names.filter((name) => !['Name__c', 'Note__c'].includes(name))),
    developerName: 'OtherGenerated_456',
    sourceEntityDeveloperName: 'Other__dll',
  };
  const schema = target();
  for (const field of schema.fields) field.isMapped = true;
  const calls = [];
  let deleted = false;
  let survivorReads = 0;
  const deps = dependencies();
  deps.source.get = async (name) => ({ ...source(), name });
  deps.target.get = async () => structuredClone(schema);
  const client = {
    apiVersion: '68.0',
    deleteField: async (name, selector) => {
      calls.push(['unmap', name, selector]);
      const field = selected.fieldMappings.find((pair) => pair.developerName === selector);
      selected.fieldMappings = selected.fieldMappings.filter((pair) => pair !== field);
      delete schema.fields.find((value) => value.name === field.targetFieldDeveloperName).isMapped;
    },
    list: async (...arguments_) => {
      calls.push(['list', ...arguments_]);
      return {
        objectSourceTargetMaps: structuredClone(deleted ? [survivor] : [selected, survivor]),
      };
    },
    get: async (name) => {
      calls.push(['get', name]);
      if (name === selected.developerName) {
        if (deleted) throw missing();
        return structuredClone(selected);
      }
      survivorReads++;
      return {
        ...structuredClone(survivor),
        status: deleted && survivorReads === 2 ? 'CREATING' : 'ACTIVE',
      };
    },
    delete: async (name) => {
      calls.push(['delete', name]);
      deleted = true;
    },
  };
  return { client, deps, calls, selected, survivor, schema };
};

test('mapping scoped deletion retains non-last survivor and full-parent guards across admitted versions', async () => {
  const scope = 'Team / +&?=ü';
  for (const apiVersion of ['61.0', '68.0']) {
    const f = deleteFixture();
    f.client.apiVersion = apiVersion;
    const deps = scopedDependencies(f.deps, scope);
    const plan = await preflightDeleteNativeMapping('TargetGenerated_123', f.client, deps, scope);
    assert.equal(plan.selected.identity.dataSpace, scope);
    assert.equal(plan.removals.length, 2);
    assert.deepEqual(await deleteNativeMapping('TargetGenerated_123', f.client, deps, scope), {
      apiName: 'TargetGenerated_123',
    });
    assert.deepEqual(
      f.calls.filter(([kind]) => ['unmap', 'delete'].includes(kind)),
      [
        ['unmap', 'TargetGenerated_123', 'target_Name__c'],
        ['unmap', 'TargetGenerated_123', 'target_Note__c'],
        ['delete', 'TargetGenerated_123'],
      ],
    );
  }
});

test('mapping deletion checks every survivor DLO scope before unmap or delete', async () => {
  const f = deleteFixture();
  const read = f.deps.source.get;
  f.deps.source.get = async (name) => ({
    ...(await read(name)),
    dataSpaceInfo: [{ name: name === 'Other__dll' ? 'Wrong' : 'default' }],
  });
  await assert.rejects(deleteNativeMapping('TargetGenerated_123', f.client, f.deps), /DATASPACE/);
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
});

test('mapping scoped desired-state removal threads context through unmap settlement', async () => {
  const f = fixture();
  const scope = 'Team';
  const deps = scopedDependencies(f.deps, scope);
  const input = desired(names.filter((name) => name !== 'Note__c'));
  input.identity.dataSpace = scope;
  const result = await deployNativeMapping(input, f.client, deps, undefined, scope);
  assert.equal(result.operation, 'update');
  assert.equal(result.document.identity.dataSpace, scope);
  assert.equal(result.document.spec.fieldMappings.length, 6);
  assert.equal(f.calls.filter(([kind]) => kind === 'unmap').length, 1);
});

// API62..67 cases are synthetic compatibility checks, not live qualification.
for (const version of ['61.0', '62.0', '63.0', '64.0', '65.0', '66.0', '67.0', '68.0']) {
  test(`deletion compatibility ${version} preserves legacy raw parents and exact None tags`, async () => {
    const f = deleteFixture();
    f.client.apiVersion = version;
    const parents = new Map();
    for (const name of ['Example__dll', 'Other__dll']) {
      const value = { ...source(), name, runtimeSentinel: { retained: true } };
      value.fields.find((field) => field.name === 'Note__c').dataType = 'Number';
      parents.set(name, {
        dataLakeObjects: [{ ...value, dataLakeFieldInfoRepresentation: value.fields }],
      });
      delete parents.get(name).dataLakeObjects[0].fields;
    }
    f.deps.source.get = async (name) => structuredClone(parents.get(name));
    f.schema.creationType = 'Custom';
    f.schema.runtimeSentinel = { retained: true };
    for (const field of f.schema.fields) {
      if (field.name !== 'KQ_Id__c') field.usageTag = 'None';
      if (!field.isPrimaryKey) delete field.isPrimaryKey;
      if (field.name === 'Note__c') field.type = 'Number';
    }
    const beforeParents = structuredClone(parents);
    const expected = structuredClone(f.schema);
    for (const field of expected.fields)
      if (['Name__c', 'Note__c'].includes(field.name)) delete field.isMapped;
    const survivor = structuredClone(f.survivor);
    const plan = await preflightDeleteNativeMapping('TargetGenerated_123', f.client, f.deps);
    assert.equal(plan.protectedPairs.length, 5);
    await deleteNativeMapping('TargetGenerated_123', f.client, f.deps);
    assert.deepEqual(
      f.calls.filter(([kind]) => ['unmap', 'delete'].includes(kind)),
      [
        ['unmap', 'TargetGenerated_123', 'target_Name__c'],
        ['unmap', 'TargetGenerated_123', 'target_Note__c'],
        ['delete', 'TargetGenerated_123'],
      ],
    );
    assert.deepEqual(parents, beforeParents);
    assert.deepEqual(f.schema, expected);
    assert.deepEqual(f.survivor, survivor);
  });
}

test('deletion and shared unmap reject unnormalized or outside versions before reads', async () => {
  for (const version of ['60.0', '69.0', '61', 'v61.0', '61.1', 'auto', '', undefined]) {
    const f = deleteFixture();
    f.client.apiVersion = version;
    await assert.rejects(
      preflightDeleteNativeMapping('TargetGenerated_123', f.client, f.deps),
      /VERSION_UNQUALIFIED/,
    );
    await assert.rejects(
      preflightUnmapNativeMapping(normalizeNativeMapping(f.selected), f.client, f.deps),
      /VERSION_UNQUALIFIED/,
    );
    await assert.rejects(
      unmapNativeMappingFields({}, f.client, f.deps, () => assert.fail()),
      /VERSION_UNQUALIFIED/,
    );
    assert.deepEqual(f.calls, []);
  }
});

test('deletion refuses special usage and qualifiers and detects raw None metadata drift', async () => {
  // eslint-disable-next-line unicorn/no-null -- Explicit raw API null must not qualify as absent metadata.
  for (const tag of ['KeyQualifier', 'Unknown', '', null]) {
    const f = deleteFixture();
    f.client.apiVersion = '61.0';
    f.schema.fields[1].usageTag = tag;
    await assert.rejects(
      deleteNativeMapping('TargetGenerated_123', f.client, f.deps),
      /POLICY_UNPROVEN/,
    );
    assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  }
  for (const mode of ['qualifier', 'drift']) {
    const f = deleteFixture();
    f.client.apiVersion = '61.0';
    f.schema.fields[1].usageTag = 'None';
    if (mode === 'qualifier') f.schema.fields[1].keyQualifierName = 'Unexpected';
    else {
      const remove = f.client.deleteField;
      f.client.deleteField = async (...arguments_) => {
        await remove(...arguments_);
        f.schema.fields[2].usageTag = 'None';
      };
    }
    await assert.rejects(deleteNativeMapping('TargetGenerated_123', f.client, f.deps));
    assert.equal(f.calls.filter(([kind]) => kind === 'unmap').length, mode === 'drift' ? 1 : 0);
    assert.equal(f.calls.filter(([kind]) => kind === 'delete').length, 0);
  }
});

test('lower-version deletion admission never widens desired-state removals or Text retarget', async () => {
  for (const version of ['61.0', '62.0', '63.0', '64.0', '65.0', '66.0', '67.0']) {
    for (const retarget of [false, true]) {
      const f = fixture(raw(names.filter((name) => name !== 'Note__c')));
      f.client.apiVersion = version;
      const input = desired(names.filter((name) => !['Name__c', 'Note__c'].includes(name)));
      if (retarget)
        input.spec.fieldMappings.push({
          sourceFieldDeveloperName: 'Name__c',
          targetFieldDeveloperName: 'Note__c',
        });
      await assert.rejects(deployNativeMapping(input, f.client, f.deps), /VERSION_UNQUALIFIED/);
      assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
    }
  }
});

test('mapping preview qualifies the complete ordered unmap plan without writes', async () => {
  const f = deleteFixture();
  const plan = await preflightDeleteNativeMapping('TargetGenerated_123', f.client, f.deps);
  assert.deepEqual(
    plan.removals.map((pair) => pair.developerName),
    ['target_Name__c', 'target_Note__c'],
  );
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
});

test('mapping survivor requires independently qualified protected metadata before unmaps', async () => {
  for (const mode of ['coverage', 'key', 'selector', 'version']) {
    const f = deleteFixture();
    if (mode === 'coverage') f.survivor.fieldMappings.shift();
    if (mode === 'selector') delete f.survivor.fieldMappings[0].developerName;
    if (mode === 'version') f.client.apiVersion = '69.0';
    if (mode === 'key')
      f.deps.source.get = async (name) => ({
        ...source(),
        name,
        fields: source().fields.map((field) =>
          name === 'Other__dll' ? { ...field, isPrimaryKey: false } : field,
        ),
      });
    await assert.rejects(deleteNativeMapping('TargetGenerated_123', f.client, f.deps));
    assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  }
});

test('production unmap-first deletion verifies ordered writes, absence and full raw survivor/parent preservation', async () => {
  const f = deleteFixture();
  assert.deepEqual(await deleteNativeMapping('TargetGenerated_123', f.client, f.deps), {
    apiName: 'TargetGenerated_123',
  });
  assert.deepEqual(
    f.calls.filter(([kind]) => ['unmap', 'delete'].includes(kind)),
    [
      ['unmap', 'TargetGenerated_123', 'target_Name__c'],
      ['unmap', 'TargetGenerated_123', 'target_Note__c'],
      ['delete', 'TargetGenerated_123'],
    ],
  );
  assert.deepEqual(await f.deps.target.get(), f.schema);
});

test('mapping last-for-DMO guard precedes authored unmap classification', async () => {
  const f = deleteFixture();
  f.client.list = async () => ({ objectSourceTargetMaps: [f.selected] });
  f.deps.target.get = async () => assert.fail('last guard must precede dependency classification');
  await assert.rejects(
    deleteNativeMapping('TargetGenerated_123', f.client, f.deps),
    /LAST_MAPPING_DELETE_BLOCKED/,
  );
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
});

test('mapping last/incomplete/ambiguous/inactive inventory blocks preview and execution before deletion', async () => {
  for (const inventory of [
    (f) => ({ objectSourceTargetMaps: [f.selected] }),
    (f) => ({ objectSourceTargetMaps: [f.selected, f.survivor], nextPageUrl: '/next' }),
    (f) => ({ objectSourceTargetMaps: [f.selected, f.survivor, f.survivor] }),
    (f) => ({
      objectSourceTargetMaps: [
        f.selected,
        { ...f.survivor, sourceEntityDeveloperName: 'Example__dll' },
      ],
    }),
    (f) => ({ objectSourceTargetMaps: [f.selected, { ...f.survivor, status: 'CREATING' }] }),
    (f) => ({
      objectSourceTargetMaps: [
        f.selected,
        { ...f.survivor, targetEntityDeveloperName: 'Wrong__dlm' },
      ],
    }),
  ]) {
    for (const operation of [preflightDeleteNativeMapping, deleteNativeMapping]) {
      const f = deleteFixture();
      f.client.list = async () => inventory(f);
      await assert.rejects(operation('TargetGenerated_123', f.client, f.deps));
      assert.equal(
        f.calls.some(([kind]) => kind === 'delete'),
        false,
      );
    }
  }
});

test('mapping final deletion settles CREATING survivor status but rejects concurrent content drift', async () => {
  for (const drift of [false, true]) {
    const f = deleteFixture();
    const remove = f.client.delete;
    const get = f.client.get;
    const list = f.client.list;
    let deleted = false;
    let passes = 0;
    f.client.delete = async (name) => {
      await remove(name);
      deleted = true;
    };
    f.client.list = async () => {
      const value = await list();
      if (deleted && passes++ === 0) {
        value.objectSourceTargetMaps[0].status = 'CREATING';
        if (drift) value.objectSourceTargetMaps[0].fieldMappings[0].developerName = 'drift';
      }
      return value;
    };
    f.client.get = async (name) => {
      const value = await get(name);
      if (deleted && passes === 1) value.status = 'CREATING';
      return value;
    };
    await (drift
      ? assert.rejects(
          deleteNativeMapping('TargetGenerated_123', f.client, f.deps),
          /PERSISTENCE_UNCONFIRMED/,
        )
      : deleteNativeMapping('TargetGenerated_123', f.client, f.deps));
    assert.equal(f.calls.filter(([kind]) => kind === 'delete').length, 1);
  }
});

test('mapping delete stops on dispatch error or failed absence/survivor/parent checks without write retry', async () => {
  for (const mode of ['write', 'auth', 'present', 'survivor', 'pending', 'parent', 'field-loss']) {
    const f = deleteFixture();
    let dispatched = false;
    const get = f.client.get;
    const del = f.client.delete;
    f.client.delete = async (name) => {
      dispatched = true;
      await del(name);
      if (mode === 'write') throw new Error('response lost');
    };
    f.client.get = async (name) => {
      if (dispatched && name === 'TargetGenerated_123') {
        if (mode === 'auth') throw new NativeMappingError('MAPPING_HTTP_ERROR', 403);
        if (mode === 'present') return structuredClone(f.selected);
      }
      if (dispatched && name === 'OtherGenerated_456') {
        if (mode === 'survivor')
          return { ...f.survivor, fieldMappings: f.survivor.fieldMappings.slice(1) };
        if (mode === 'pending') return { ...f.survivor, status: 'CREATING' };
      }
      return get(name);
    };
    const targetGet = f.deps.target.get;
    f.deps.target.get = async () => ({
      ...(await targetGet()),
      ...(dispatched && mode === 'parent' ? { label: 'Changed' } : {}),
      ...(dispatched && mode === 'field-loss' ? { fields: target().fields.slice(1) } : {}),
    });
    await assert.rejects(deleteNativeMapping('TargetGenerated_123', f.client, f.deps));
    assert.equal(f.calls.filter(([kind]) => kind === 'delete').length, 1);
  }
  await assert.rejects(
    retrieveNativeMapping('../escape', fixture().client),
    /INVALID_MAPPING_NAME/,
  );
  await assert.rejects(
    deleteNativeMapping(
      'SourceGenerated_456',
      { ...fixture().client, apiVersion: '68.0' },
      dependencies(),
    ),
    /IDENTITY/,
  );
});

const unmapFixture = () => {
  const state = raw();
  const schema = target();
  for (const field of schema.fields) field.isMapped = true;
  const calls = [];
  const client = {
    apiVersion: '68.0',
    list: async () => ({ objectSourceTargetMaps: [structuredClone(state)] }),
    get: async () => structuredClone(state),
    deleteField: async (name, selector) => {
      calls.push([name, selector]);
      const pair = state.fieldMappings.find((field) => field.developerName === selector);
      state.fieldMappings = state.fieldMappings.filter((field) => field !== pair);
      delete schema.fields.find((field) => field.name === pair.targetFieldDeveloperName).isMapped;
    },
  };
  const deps = {
    source: { get: async () => source() },
    target: { get: async () => structuredClone(schema) },
  };
  return { state, schema, client, deps, calls };
};

test('guarded unmap uses fresh observed selectors, preserves five protected pairs and exact schema', async () => {
  const f = unmapFixture();
  const plan = await preflightUnmapNativeMapping(normalizeNativeMapping(f.state), f.client, f.deps);
  assert.equal(plan.protectedPairs.length, 5);
  assert.deepEqual(
    plan.removals.map((pair) => pair.sourceFieldDeveloperName),
    ['Name__c', 'Note__c'],
  );
  let dispatched = 0;
  const result = await unmapNativeMappingFields(plan, f.client, f.deps, () => dispatched++);
  assert.equal(dispatched, 2);
  assert.deepEqual(f.calls, [
    ['TargetGenerated_123', 'target_Name__c'],
    ['TargetGenerated_123', 'target_Note__c'],
  ]);
  assert.deepEqual(result.selected.spec.fieldMappings, plan.protectedPairs);
  assert.equal(result.removals.length, 0);
  assert.deepEqual(f.schema, result.target);
  assert.equal(plan.removals.length, 2, 'caller evidence is immutable');
});

test('guarded unmap accepts Number identity fields and checks CREATING snapshots before settling', async () => {
  const f = unmapFixture();
  f.schema.fields[1].type = 'Number';
  f.deps.source.get = async () => ({
    ...source(),
    fields: source().fields.map((field) =>
      field.name === 'Name__c' ? { ...field, dataType: 'Number' } : field,
    ),
  });
  let remaining = 0;
  const get = f.client.get;
  const list = f.client.list;
  f.client.get = async () => ({ ...(await get()), status: remaining > 0 ? 'CREATING' : 'ACTIVE' });
  f.client.list = async () => {
    const value = await list();
    if (remaining-- > 0) value.objectSourceTargetMaps[0].status = 'CREATING';
    return value;
  };
  const remove = f.client.deleteField;
  f.client.deleteField = async (...arguments_) => {
    await remove(...arguments_);
    remaining = 1;
  };
  const plan = await preflightUnmapNativeMapping(normalizeNativeMapping(f.state), f.client, f.deps);
  await unmapNativeMappingFields(plan, f.client, f.deps, () => {});
  assert.equal(f.calls.length, 2);
});

test('guarded unmap refuses authored fields also covered by another inventory mapping', async () => {
  const f = unmapFixture();
  const other = { ...raw(), developerName: 'Other', sourceEntityDeveloperName: 'Other__dll' };
  f.client.list = async () => ({ objectSourceTargetMaps: [f.state, other] });
  f.deps.source.get = async (name) => ({ ...source(), name });
  await assert.rejects(
    preflightUnmapNativeMapping(normalizeNativeMapping(f.state), f.client, f.deps),
    /POLICY_UNPROVEN/,
  );
  assert.deepEqual(f.calls, []);
});

test('guarded unmap refuses unknown metadata, missing selectors and nonqualified versions before writes', async () => {
  for (const mode of ['version', 'flag', 'key', 'type', 'selector', 'qualifier']) {
    const f = unmapFixture();
    if (mode === 'version') f.client.apiVersion = '69.0';
    if (mode === 'flag') delete f.schema.fields[1].isMapped;
    if (mode === 'key') f.schema.fields[0].keyQualifierName = 'Unknown';
    if (mode === 'type') f.schema.fields[1].type = 'Date';
    if (mode === 'selector') delete f.state.fieldMappings[1].developerName;
    if (mode === 'qualifier') f.schema.fields[6].usageTag = 'Unknown';
    await assert.rejects(
      preflightUnmapNativeMapping(normalizeNativeMapping(f.state), f.client, f.deps),
    );
    assert.deepEqual(f.calls, []);
  }
});

test('guarded unmap stops after lost response, ignored removal, schema drift or CREATING content drift', async () => {
  for (const mode of ['lost', 'ignored', 'schema', 'creating', 'selector']) {
    const f = unmapFixture();
    const plan = await preflightUnmapNativeMapping(
      normalizeNativeMapping(f.state),
      f.client,
      f.deps,
    );
    const remove = f.client.deleteField;
    f.client.deleteField = async (...arguments_) => {
      if (mode === 'ignored') {
        f.calls.push(arguments_);
        return;
      }
      await remove(...arguments_);
      if (mode === 'lost') throw new Error('lost response');
      if (mode === 'schema') f.schema.fields[0].label = 'drift';
      if (mode === 'creating') {
        f.state.status = 'CREATING';
        f.state.fieldMappings[0].developerName = 'drift';
      }
      if (mode === 'selector') f.state.fieldMappings[0].developerName = 'drift';
    };
    let dispatched = 0;
    await assert.rejects(unmapNativeMappingFields(plan, f.client, f.deps, () => dispatched++));
    assert.equal(dispatched, 1);
    assert.equal(f.calls.length, 1);
  }
});

test('guarded unmap revalidates stale evidence and accepts only flag absence, never false', async () => {
  const stale = unmapFixture();
  const plan = await preflightUnmapNativeMapping(
    normalizeNativeMapping(stale.state),
    stale.client,
    stale.deps,
  );
  stale.schema.label = 'changed';
  await assert.rejects(
    unmapNativeMappingFields(plan, stale.client, stale.deps, () => assert.fail()),
    /PLAN_CHANGED/,
  );
  const f = unmapFixture();
  const fresh = await preflightUnmapNativeMapping(
    normalizeNativeMapping(f.state),
    f.client,
    f.deps,
  );
  const remove = f.client.deleteField;
  f.client.deleteField = async (...arguments_) => {
    await remove(...arguments_);
    f.schema.fields[1].isMapped = false;
  };
  await assert.rejects(
    unmapNativeMappingFields(fresh, f.client, f.deps, () => {}),
    /PARENT_CHANGED/,
  );
  assert.equal(f.calls.length, 1);
});

test('mapping HTTP200 ignored addition is failed/unknown, with bounded reads and no write retry', async () => {
  const current = raw(names.filter((name) => name !== 'Name__c'));
  const { client, calls, deps } = fixture(current);
  client.update = async (name, body) => {
    calls.push(['update', name, body]);
    return raw(); // A convincing response echo is not independent persistence.
  };
  const beforeSource = await deps.source.get();
  const beforeTarget = await deps.target.get();
  const result = await executeMapping(desired(), client, deps);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'MAPPING_PERSISTENCE_UNCONFIRMED');
  assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
  assert.deepEqual(await deps.source.get(), beforeSource);
  assert.deepEqual(await deps.target.get(), beforeTarget);
});

test('desired-state removal preserves retained selectors and previews observed target selectors', async () => {
  const f = fixture();
  const input = desired(names.filter((name) => name !== 'Name__c'));
  const before = structuredClone(input);
  const preview = await preflightMapping(input, f.client, f.deps);
  assert.deepEqual(preview.plan, [
    { operation: 'unmap', apiName: 'TargetGenerated_123', ...pair('Name__c') },
  ]);
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  const changes = [];
  const result = await deployNativeMapping(input, f.client, f.deps, (change) =>
    changes.push(change),
  );
  assert.deepEqual(changes, [{ deleted: [pair('Name__c')], added: [] }]);
  assert.equal(result.operation, 'update');
  assert.deepEqual(
    result.document.spec.fieldMappings,
    raw().fieldMappings.filter((pair) => pair.sourceFieldDeveloperName !== 'Name__c'),
  );
  assert.equal(f.calls.filter(([kind]) => kind === 'unmap').length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === 'update').length, 0);
  assert.deepEqual(input, before);
});

test('desired-state batch additions and both qualified retarget directions use one names-only PATCH after unmap', async () => {
  for (const mode of ['batch', 'source', 'target']) {
    const f = fixture(
      raw(
        names.filter((name) =>
          mode === 'batch' ? !['Name__c', 'Note__c'].includes(name) : name !== 'Note__c',
        ),
      ),
    );
    for (const field of f.schema.fields)
      if (!['KeyQualifier'].includes(field.usageTag) && field.creationType === 'Custom')
        field.usageTag = 'None';
    const input = desired();
    if (mode !== 'batch') {
      input.spec.fieldMappings = input.spec.fieldMappings.filter(
        (pair) => !['Name__c', 'Note__c'].includes(pair.sourceFieldDeveloperName),
      );
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: mode === 'source' ? 'Name__c' : 'Note__c',
        targetFieldDeveloperName: mode === 'source' ? 'Note__c' : 'Name__c',
        developerName: 'source_not_target',
      });
    }
    const changes = [];
    const result = await deployNativeMapping(input, f.client, f.deps, (change) =>
      changes.push(change),
    );
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].deleted, mode === 'batch' ? [] : [pair('Name__c')]);
    assert.deepEqual(
      changes[0].added,
      mode === 'batch'
        ? ['Name__c', 'Note__c'].map((name) => ({
            sourceFieldDeveloperName: name,
            targetFieldDeveloperName: name,
          }))
        : [
            {
              sourceFieldDeveloperName: mode === 'source' ? 'Name__c' : 'Note__c',
              targetFieldDeveloperName: mode === 'source' ? 'Note__c' : 'Name__c',
            },
          ],
    );
    assert.deepEqual(
      new Set(
        result.document.spec.fieldMappings.map(
          (pair) => `${pair.sourceFieldDeveloperName}:${pair.targetFieldDeveloperName}`,
        ),
      ),
      new Set(
        input.spec.fieldMappings.map(
          (pair) => `${pair.sourceFieldDeveloperName}:${pair.targetFieldDeveloperName}`,
        ),
      ),
    );
    const writes = f.calls.filter(([kind]) => ['unmap', 'update'].includes(kind));
    assert.deepEqual(
      writes.map(([kind]) => kind),
      mode === 'batch' ? ['update'] : ['unmap', 'update'],
    );
    assert.equal(writes.at(-1)[2].fieldMapping.length, mode === 'batch' ? 2 : 1);
    assert.ok(writes.at(-1)[2].fieldMapping.every((pair) => !('developerName' in pair)));
  }
});

test('desired-state protected omission and unsupported additions block before any unmap', async () => {
  for (const mode of ['protected', 'version', 'type', 'occupied']) {
    const f = fixture();
    const input = desired(
      names.filter((name) => name !== (mode === 'protected' ? 'Id__c' : 'Name__c')),
    );
    if (mode === 'version') f.client.apiVersion = '67.0';
    if (mode === 'type')
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: 'Name__c',
        targetFieldDeveloperName: 'Id__c',
      });
    if (mode === 'occupied')
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: 'Name__c',
        targetFieldDeveloperName: 'Note__c',
      });
    await assert.rejects(deployNativeMapping(input, f.client, f.deps));
    assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  }
});

for (const mode of [
  'occupied',
  'special-usage',
  'source-type',
  'target-type',
  'both-types',
  'source-retarget-type',
  'target-retarget-type',
]) {
  test(`desired-state ${mode} drift at evidence read blocks all writes even when subsequently stable`, async () => {
    const f = fixture(raw(names.filter((name) => name !== 'Note__c')));
    const input = desired(names.filter((name) => !['Name__c', 'Note__c'].includes(name)));
    input.spec.fieldMappings.push({
      sourceFieldDeveloperName: mode === 'source-retarget-type' ? 'Name__c' : 'Note__c',
      targetFieldDeveloperName: mode === 'target-retarget-type' ? 'Name__c' : 'Note__c',
    });
    const readSource = f.deps.source.get;
    const readTarget = f.deps.target.get;
    let sourceReads = 0;
    let targetReads = 0;
    f.deps.source.get = async () => {
      const definition = await readSource();
      if (++sourceReads > 1 && ['source-type', 'both-types', 'target-retarget-type'].includes(mode))
        definition.fields.find((field) => field.name === 'Note__c').dataType = 'Number';
      return definition;
    };
    f.deps.target.get = async () => {
      const definition = await readTarget();
      if (++targetReads > 1) {
        const field = definition.fields.find((field) => field.name === 'Note__c');
        if (mode === 'occupied') field.isMapped = true;
        if (mode === 'special-usage') field.usageTag = 'Email';
        if (['target-type', 'both-types', 'source-retarget-type'].includes(mode))
          field.type = 'Number';
      }
      return definition;
    };
    const result = await executeMapping(input, f.client, f.deps);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.match(
      result.diagnostics[0].code,
      /MAPPING_(?:ADDITION_POLICY_UNPROVEN|FIELD_TYPE_MISMATCH)/,
    );
    assert.ok(sourceReads >= 2);
    assert.ok(targetReads >= 2);
    assert.deepEqual(
      f.calls.filter(([kind]) => ['unmap', 'update', 'create', 'delete'].includes(kind)),
      [],
    );
    // Subsequent reads retain the evidence state, not the initially admitted definitions.
    assert.deepEqual(await f.deps.source.get(), await f.deps.source.get());
    assert.deepEqual(await f.deps.target.get(), await f.deps.target.get());
  });
}

test('desired-state lost unmap, patch failure and exact final-set drift are failed/unknown without retry', async () => {
  for (const mode of ['unmap', 'patch', 'extra', 'parent', 'creating']) {
    const f = fixture(raw(names.filter((name) => name !== 'Note__c')));
    const input = desired(names.filter((name) => !['Name__c', 'Note__c'].includes(name)));
    input.spec.fieldMappings.push({
      sourceFieldDeveloperName: 'Name__c',
      targetFieldDeveloperName: 'Note__c',
    });
    const remove = f.client.deleteField;
    const update = f.client.update;
    f.client.deleteField = async (...arguments_) => {
      await remove(...arguments_);
      if (mode === 'unmap') throw new Error('lost');
    };
    f.client.update = async (...arguments_) => {
      const value = await update(...arguments_);
      if (mode === 'patch') throw new Error('lost');
      if (mode === 'parent') f.schema.label = 'drift';
      if (mode === 'extra' || mode === 'creating') {
        f.state.fieldMappings.push(pair('Name__c'));
        if (mode === 'creating') f.state.status = 'CREATING';
      }
      if (mode === 'parent') {
        const get = f.deps.target.get;
        f.deps.target.get = async () => ({ ...(await get()), label: 'drift' });
      }
      return value;
    };
    const result = await executeMapping(input, f.client, f.deps);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(f.calls.filter(([kind]) => kind === 'unmap').length, 1);
    assert.equal(f.calls.filter(([kind]) => kind === 'update').length, mode === 'unmap' ? 0 : 1);
  }
});

test('mapping command outcomes distinguish blocked, unknown write result and independently confirmed success', async () => {
  const blocked = await executeMapping({}, fixture().client, dependencies());
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.mutation, 'not-attempted');
  const { client } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  client.create = async () => {
    throw new Error('request dispatched but response lost');
  };
  const reported = [];
  const failed = await executeMapping(desired(), client, dependencies(), (change) =>
    reported.push(change),
  );
  assert.deepEqual(reported, []);
  const unchanged = fixture();
  await executeMapping(desired(), unchanged.client, unchanged.deps, (change) =>
    reported.push(change),
  );
  assert.deepEqual(reported, []);
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.mutation, 'unknown');
  assert.equal(failed.diagnostics[0].code, 'MAPPING_REQUEST_UNCONFIRMED');
  const created = fixture();
  created.client.list = async () => ({ objectSourceTargetMaps: [] });
  const createResult = await executeMapping(desired(), created.client, dependencies());
  assert.equal(createResult.mutation, 'confirmed-created');
  const update = fixture(raw(names.filter((n) => n !== 'Name__c')));
  const updateResult = await executeMapping(desired(), update.client, update.deps);
  assert.equal(updateResult.mutation, 'confirmed-updated');
});
