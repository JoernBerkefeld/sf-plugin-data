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
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

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
  creationType: 'Custom',
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
const generatedNames = names.slice(3);
const pairNames = (fields) => fields.map((field) => field.sourceFieldDeveloperName);
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

test('mapping source/target field, identity and dataspace validation fail before dispatch', async () => {
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
        fields: target().fields.filter((f) => f.name !== 'Note__c'),
      })),
  ]) {
    const deps = dependencies();
    change(deps);
    const { client, calls } = fixture();
    await assert.rejects(preflightNativeMapping(desired(), client, deps));
    assert.equal(calls.length, 0);
  }
  // A data type difference is not refused: Salesforce accepts it and the preview names it.
  const deps = dependencies();
  deps.target.get = async () => ({
    ...target(),
    fields: target().fields.map((f) => (f.name === 'Note__c' ? { ...f, type: 'Date' } : f)),
  });
  const { client, calls } = fixture();
  const plan = await preflightNativeMapping(desired(), client, deps);
  assert.equal(plan.operation, 'noop');
  assert.deepEqual(plan.typeDifferences, [
    { source: 'Note__c', target: 'Note__c', sourceType: 'Text', targetType: 'Date' },
  ]);
  assert.ok(calls.every(([kind]) => ['get', 'list'].includes(kind)));
});

test('mapping create leaves unknown system fields and a missing primary key to Salesforce without dropping user fields', async () => {
  const { client } = fixture();
  client.list = async () => ({ objectSourceTargetMaps: [] });
  const deps = dependencies();
  deps.target.get = async () => ({
    ...target(),
    fields: target().fields.map((f) => (f.name === 'KQ_Id__c' ? { ...f, usageTag: 'Unknown' } : f)),
  });
  // An unrecognised qualifier is no generated pair, so it is sent as authored.
  const unknown = await preflightNativeMapping(desired(), client, deps);
  assert.deepEqual(pairNames(unknown.writes[0].body.fieldMapping), [
    'Id__c',
    'Name__c',
    'Note__c',
    'KQ_Id__c',
  ]);
  const keyless = await preflightNativeMapping(desired(['Name__c']), client, dependencies());
  assert.deepEqual(keyless.writes[0].body.fieldMapping, [
    { sourceFieldDeveloperName: 'Name__c', targetFieldDeveloperName: 'Name__c' },
  ]);
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

const mappingName = 'TargetGenerated_123';
/**
 * Fast injected readback budget that records every requested delay.
 * @returns {{sleeps: number[], settle: object}} Recorded delays and the budget.
 */
const fast = () => {
  const sleeps = [];
  return {
    sleeps,
    settle: {
      attempts: 3,
      delayMs: 7,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  };
};
const writes = (calls) => calls.filter(([kind]) => !['get', 'list', 'dmo'].includes(kind));

/**
 * One custom DMO with the selected mapping and, unless alone, a second one.
 * `remove` deletes the selected mapping from the fake state; no other write route exists.
 * @param {object} [options] Initial state.
 * @param {boolean} [options.alone] Whether the selected mapping is the only one of the DMO.
 * @returns {object} Fake client, parent readers, mutable state and the call ledger.
 */
const deleteFixture = ({ alone = false } = {}) => {
  const selected = raw();
  const survivor = {
    ...raw(names.filter((name) => !['Name__c', 'Note__c'].includes(name))),
    developerName: 'OtherGenerated_456',
    sourceEntityDeveloperName: 'Other__dll',
  };
  const schema = target();
  for (const field of schema.fields) field.isMapped = true;
  const calls = [];
  // staleReads: how many reads after the removal still return the mapping.
  const state = { removed: false, staleReads: 0, others: alone ? [] : [survivor] };
  const deps = dependencies();
  deps.source.get = async (name) => ({ ...source(), name });
  deps.target.get = async (name) => {
    calls.push(['dmo', name]);
    return structuredClone(schema);
  };
  const client = {
    apiVersion: '68.0',
    deleteField: async () => assert.fail('mapping deletion never unmaps'),
    list: async (...arguments_) => {
      calls.push(['list', ...arguments_]);
      return {
        objectSourceTargetMaps: structuredClone([
          ...state.others,
          ...(state.removed ? [] : [selected]),
        ]),
      };
    },
    get: async (name) => {
      calls.push(['get', name]);
      if (name !== selected.developerName)
        return structuredClone(state.others.find((entry) => entry.developerName === name));
      if (state.removed && state.staleReads-- <= 0) throw missing();
      return structuredClone(selected);
    },
    remove: async (name) => {
      calls.push(['remove', name]);
      state.removed = true;
    },
  };
  return { client, deps, calls, selected, survivor, schema, state };
};

test('mapping deletion sends one Metadata removal, then confirms absence and untouched surroundings', async () => {
  const f = deleteFixture();
  const schema = structuredClone(f.schema);
  const survivor = structuredClone(f.survivor);
  const { sleeps, settle } = fast();
  assert.deepEqual(await deleteNativeMapping(mappingName, f.client, f.deps, undefined, settle), {
    apiName: mappingName,
  });
  const at = f.calls.findIndex(([kind]) => kind === 'remove');
  assert.deepEqual(writes(f.calls.slice(0, at)), []);
  // One removal, one absence read, then the other mappings and the DMO fields.
  assert.deepEqual(f.calls.slice(at), [
    ['remove', mappingName],
    ['get', mappingName],
    ['list', 'Example__dlm'],
    ['dmo', 'Example__dlm'],
  ]);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(f.schema, schema);
  assert.deepEqual(f.survivor, survivor);
});

// API62..67 cases are synthetic compatibility checks, not live qualification.
for (const version of ['61.0', '62.0', '63.0', '64.0', '65.0', '66.0', '67.0', '68.0'])
  for (const scope of [undefined, 'Team / +&?=ü'])
    test(`deletion on admitted version ${version} removes once in context ${scope}`, async () => {
      const f = deleteFixture();
      f.client.apiVersion = version;
      const deps = scope === undefined ? f.deps : scopedDependencies(f.deps, scope);
      const plan = await preflightDeleteNativeMapping(mappingName, f.client, deps, scope);
      assert.equal(plan.selected.identity.dataSpace, scope ?? 'default');
      assert.equal(plan.others[0].identity.dataSpace, scope ?? 'default');
      assert.deepEqual(writes(f.calls), []);
      assert.deepEqual(
        await deleteNativeMapping(mappingName, f.client, deps, scope, fast().settle),
        { apiName: mappingName },
      );
      assert.deepEqual(writes(f.calls), [['remove', mappingName]]);
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

test('deletion and shared unmap carry no own version gate; the command admits native versions', async () => {
  for (const version of ['61.0', '64.0', '69.0']) {
    const f = deleteFixture();
    f.client.apiVersion = version;
    await preflightDeleteNativeMapping(mappingName, f.client, f.deps);
    assert.deepEqual(writes(f.calls), [], version);
    const plan = await preflightUnmapNativeMapping(
      normalizeNativeMapping(f.selected),
      f.client,
      f.deps,
      normalizeNativeMapping(f.selected).spec.fieldMappings,
    );
    assert.deepEqual(pairNames(plan.protectedPairs), ['Id__c', ...generatedNames], version);
    assert.deepEqual(pairNames(plan.removals), ['Name__c', 'Note__c'], version);
    assert.deepEqual(writes(f.calls), [], version);
  }
});

test('desired-state removal and retarget work at lower native versions without a version refusal', async () => {
  for (const version of ['61.0', '64.0', '67.0']) {
    for (const retarget of [false, true]) {
      const f = fixture(raw(names.filter((name) => name !== 'Note__c')));
      f.client.apiVersion = version;
      const input = desired(names.filter((name) => !['Name__c', 'Note__c'].includes(name)));
      if (retarget)
        input.spec.fieldMappings.push({
          sourceFieldDeveloperName: 'Name__c',
          targetFieldDeveloperName: 'Note__c',
        });
      const result = await deployNativeMapping(input, f.client, f.deps);
      assert.equal(result.operation, 'update', version);
      assert.deepEqual(
        writes(f.calls).map(([kind]) => kind),
        retarget ? ['unmap', 'update'] : ['unmap'],
        version,
      );
      assert.equal(f.calls.find(([kind]) => kind === 'unmap')[2], 'target_Name__c', version);
    }
  }
});

test('mapping delete preview returns what must stay unchanged, ordered, without writes', async () => {
  const f = deleteFixture();
  const first = { ...f.survivor, developerName: 'Another_1', sourceEntityDeveloperName: 'A__dll' };
  f.state.others = [f.survivor, first];
  const plan = await preflightDeleteNativeMapping(mappingName, f.client, f.deps);
  assert.deepEqual(plan, {
    selected: normalizeNativeMapping(f.selected),
    others: [normalizeNativeMapping(first), normalizeNativeMapping(f.survivor)],
    targetFields: names.toSorted(),
  });
  assert.ok(!('removals' in plan));
  assert.deepEqual(writes(f.calls), []);
  assert.deepEqual(f.calls, [
    ['get', mappingName],
    ['list', 'Example__dlm'],
    ['dmo', 'Example__dlm'],
  ]);
});

test('deletion leaves field usage, qualifiers and the other mappings to Salesforce', async () => {
  // None of these is classified any more: the whole mapping goes in one deployment.
  for (const change of [
    (f) => (f.schema.fields[1].usageTag = 'KeyQualifier'),
    (f) => (f.schema.fields[1].keyQualifierName = 'Unexpected'),
    (f) => (f.schema.fields[1].type = 'Date'),
    (f) => delete f.schema.fields[1].isMapped,
    (f) => f.survivor.fieldMappings.shift(),
    (f) => delete f.survivor.fieldMappings[0].developerName,
    (f) => (f.survivor.status = 'CREATING'),
    (f) => (f.selected.status = 'CREATING'),
    (f) => f.state.others.push({ ...f.survivor, developerName: 'Twin_789' }),
  ]) {
    const f = deleteFixture();
    change(f);
    await preflightDeleteNativeMapping(mappingName, f.client, f.deps);
    assert.deepEqual(writes(f.calls), []);
    assert.deepEqual(
      await deleteNativeMapping(mappingName, f.client, f.deps, undefined, fast().settle),
      { apiName: mappingName },
    );
    assert.deepEqual(writes(f.calls), [['remove', mappingName]]);
  }
});

test('the last mapping of a custom DMO is refused in preview and execution without a write', async () => {
  for (const operation of [preflightDeleteNativeMapping, deleteNativeMapping]) {
    const f = deleteFixture({ alone: true });
    await assert.rejects(
      operation(mappingName, f.client, f.deps),
      (error) =>
        error instanceof NativeMappingError && error.code === 'MAPPING_LAST_MAPPING_DELETE_BLOCKED',
    );
    assert.deepEqual(writes(f.calls), []);
    // The DMO kind decides, so its read is part of the refusal.
    assert.deepEqual(f.calls.at(-1), ['dmo', 'Example__dlm']);
  }
});

test('the last mapping of a namespaced custom DMO gets the same refusal', async () => {
  const f = deleteFixture({ alone: true });
  f.schema.name = 'ns__Example__dlm';
  await assert.rejects(
    preflightDeleteNativeMapping(mappingName, f.client, f.deps),
    (error) =>
      error instanceof NativeMappingError &&
      error.code === 'MAPPING_LAST_MAPPING_DELETE_BLOCKED' &&
      /only mapping of the custom DMO Example__dlm/u.test(operationDiagnostic(error, '')),
  );
  assert.deepEqual(writes(f.calls), []);
});

test('mapping malformed, incomplete or stale inventory blocks preview and execution before deletion', async () => {
  for (const [inventory, expected] of [
    [(f) => ({ objectSourceTargetMaps: [f.selected, f.survivor], nextPageUrl: '/next' }), /INV/],
    [() => {}, /INVENTORY_UNCONFIRMED/],
    [() => ({}), /INVENTORY_UNCONFIRMED/],
    // The selected mapping must be listed exactly as it was read.
    [(f) => ({ objectSourceTargetMaps: [f.survivor] }), /INVENTORY_UNCONFIRMED/],
    [
      (f) => ({
        objectSourceTargetMaps: [
          { ...f.selected, fieldMappings: f.selected.fieldMappings.slice(1) },
          f.survivor,
        ],
      }),
      /INVENTORY_UNCONFIRMED/,
    ],
    // A typed 404 means no mapping at all, which contradicts the mapping just read.
    [
      () => {
        throw missing();
      },
      /INVENTORY_UNCONFIRMED/,
    ],
    [
      () => {
        throw new NativeMappingError('MAPPING_HTTP_ERROR', 403);
      },
      /MAPPING_HTTP_ERROR/,
    ],
    [
      (f) => ({
        objectSourceTargetMaps: [f.selected, { ...f.survivor, dataSpaceName: 'Wrong' }],
      }),
      /DATASPACE/,
    ],
  ]) {
    for (const operation of [preflightDeleteNativeMapping, deleteNativeMapping]) {
      const f = deleteFixture();
      f.client.list = async () => inventory(f);
      await assert.rejects(operation(mappingName, f.client, f.deps), expected);
      assert.deepEqual(writes(f.calls), []);
    }
  }
});

test('mapping deletion waits for delayed absence through the injected sleep, bounded', async () => {
  const delayed = deleteFixture();
  delayed.state.staleReads = 2;
  const first = fast();
  assert.deepEqual(
    await deleteNativeMapping(mappingName, delayed.client, delayed.deps, undefined, first.settle),
    { apiName: mappingName },
  );
  assert.deepEqual(first.sleeps, [7, 7]);
  assert.deepEqual(writes(delayed.calls), [['remove', mappingName]]);
  // Never absent: the budget ends, the removal is not repeated and nothing else is read.
  const stuck = deleteFixture();
  stuck.state.staleReads = Infinity;
  const second = fast();
  await assert.rejects(
    deleteNativeMapping(mappingName, stuck.client, stuck.deps, undefined, second.settle),
    (error) => error instanceof NativeMappingError && error.code === 'MAPPING_DELETION_UNCONFIRMED',
  );
  assert.deepEqual(second.sleeps, [7, 7]);
  const at = stuck.calls.findIndex(([kind]) => kind === 'remove');
  assert.deepEqual(stuck.calls.slice(at), [
    ['remove', mappingName],
    ['get', mappingName],
    ['get', mappingName],
    ['get', mappingName],
  ]);
});

test('mapping deletion reports a changed other mapping or DMO field list as a side effect', async () => {
  for (const [mode, change, sideEffect] of [
    // Status, order, and DMO properties other than the field names are not compared.
    ['status', (f) => (f.survivor.status = 'CREATING'), false],
    ['label', (f) => (f.schema.label = 'Changed'), false],
    ['marker', (f) => delete f.schema.fields[1].isMapped, false],
    ['field-order', (f) => (f.schema.fields = f.schema.fields.toReversed()), false],
    ['pair-lost', (f) => f.survivor.fieldMappings.pop(), true],
    ['selector', (f) => (f.survivor.fieldMappings[0].developerName = 'drift'), true],
    ['mapping-lost', (f) => f.state.others.pop(), true],
    [
      'mapping-added',
      (f) =>
        f.state.others.push({
          ...f.survivor,
          developerName: 'New_789',
          sourceEntityDeveloperName: 'New__dll',
        }),
      true,
    ],
    ['field-lost', (f) => f.schema.fields.splice(2, 1), true],
    ['field-added', (f) => f.schema.fields.push({ ...f.schema.fields[2], name: 'New__c' }), true],
  ]) {
    const f = deleteFixture();
    const remove = f.client.remove;
    f.client.remove = async (name) => {
      await remove(name);
      change(f);
    };
    const { sleeps, settle } = fast();
    const run = deleteNativeMapping(mappingName, f.client, f.deps, undefined, settle);
    if (sideEffect)
      await assert.rejects(
        run,
        (error) =>
          error instanceof NativeMappingError &&
          error.code === 'MAPPING_DELETE_SIDE_EFFECT' &&
          error.message.includes('mapping deletion readback'),
        mode,
      );
    else assert.deepEqual(await run, { apiName: mappingName }, mode);
    assert.deepEqual(writes(f.calls), [['remove', mappingName]], mode);
    assert.deepEqual(sleeps, [], mode);
  }
  // Two other mappings read back in another order are the same mappings.
  const f = deleteFixture();
  f.state.others.push({
    ...f.survivor,
    developerName: 'Zeta_1',
    sourceEntityDeveloperName: 'Z__dll',
  });
  const remove = f.client.remove;
  f.client.remove = async (name) => {
    await remove(name);
    f.state.others = f.state.others.toReversed();
  };
  await deleteNativeMapping(mappingName, f.client, f.deps, undefined, fast().settle);
});

test('mapping delete stops on a failed removal or failed absence read without another write', async () => {
  const failed = new NativeMappingError('MAPPING_DELETE_FAILED');
  const lost = new Error('response lost');
  const denied = new NativeMappingError('MAPPING_HTTP_ERROR', 403);
  for (const [mode, expected] of [
    ['rejected', failed],
    ['lost', lost],
    ['auth', denied],
    ['identity', /IDENTITY/],
  ]) {
    const f = deleteFixture();
    const remove = f.client.remove;
    const get = f.client.get;
    f.client.remove = async (name) => {
      if (mode === 'rejected') {
        f.calls.push(['remove', name]);
        throw failed;
      }
      await remove(name);
      if (mode === 'lost') throw lost;
    };
    f.client.get = async (name) => {
      if (f.state.removed && mode === 'auth') throw denied;
      if (f.state.removed && mode === 'identity') return structuredClone(f.survivor);
      return get(name);
    };
    const { sleeps, settle } = fast();
    await assert.rejects(
      deleteNativeMapping(mappingName, f.client, f.deps, undefined, settle),
      expected instanceof Error ? (error) => error === expected : expected,
      mode,
    );
    assert.deepEqual(writes(f.calls), [['remove', mappingName]], mode);
    assert.deepEqual(sleeps, [], mode);
    // A failed removal is followed by no read at all.
    if (['rejected', 'lost'].includes(mode)) assert.equal(f.calls.at(-1)[0], 'remove', mode);
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
  const plan = await preflightUnmapNativeMapping(
    normalizeNativeMapping(f.state),
    f.client,
    f.deps,
    normalizeNativeMapping(f.state).spec.fieldMappings,
  );
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
  const plan = await preflightUnmapNativeMapping(
    normalizeNativeMapping(f.state),
    f.client,
    f.deps,
    normalizeNativeMapping(f.state).spec.fieldMappings,
  );
  await unmapNativeMappingFields(plan, f.client, f.deps, () => {});
  assert.equal(f.calls.length, 2);
});

/**
 * Two mappings of one DMO that both map every field; the mapped marker follows both.
 * @returns {object} Fake client, parent readers, raw states and the unmap ledger.
 */
const sharedFixture = () => {
  const states = new Map([
    ['TargetGenerated_123', raw()],
    ['Other', { ...raw(), developerName: 'Other', sourceEntityDeveloperName: 'Other__dll' }],
  ]);
  const calls = [];
  const read = () => {
    const schema = target();
    for (const field of schema.fields)
      if (
        [...states.values()].some((state) =>
          state.fieldMappings.some((entry) => entry.targetFieldDeveloperName === field.name),
        )
      )
        field.isMapped = true;
    return schema;
  };
  const client = {
    apiVersion: '68.0',
    list: async (dmo, dlo) => ({
      objectSourceTargetMaps: structuredClone(
        [...states.values()].filter(
          (state) => dlo === undefined || state.sourceEntityDeveloperName === dlo,
        ),
      ),
    }),
    get: async (name) => structuredClone(states.get(name)),
    deleteField: async (name, selector) => {
      calls.push([name, selector]);
      const state = states.get(name);
      state.fieldMappings = state.fieldMappings.filter((entry) => entry.developerName !== selector);
    },
    update: async () => assert.fail('no PATCH'),
    create: async () => assert.fail('no POST'),
    delete: async () => assert.fail('no DELETE'),
  };
  const deps = {
    source: { get: async (name) => ({ ...source(), name }) },
    target: { get: async () => read() },
  };
  return { states, client, deps, calls, read };
};

test('guarded unmap removes a pair whose field another mapping also targets; the field stays mapped', async () => {
  const f = sharedFixture();
  const plan = await preflightUnmapNativeMapping(
    normalizeNativeMapping(f.states.get('TargetGenerated_123')),
    f.client,
    f.deps,
    [pair('Note__c')],
  );
  assert.deepEqual(plan.removals, [pair('Note__c')]);
  const result = await unmapNativeMappingFields(plan, f.client, f.deps, () => {});
  assert.deepEqual(f.calls, [['TargetGenerated_123', 'target_Note__c']]);
  assert.equal(result.target.fields.find((field) => field.name === 'Note__c').isMapped, true);
  assert.equal(f.states.get('Other').fieldMappings.length, 7);
  assert.equal(f.states.get('TargetGenerated_123').fieldMappings.length, 6);
});

test('desired-state removal on a shared field reconciles each mapping; the field is unmapped after the last', async () => {
  const f = sharedFixture();
  const without = names.filter((name) => name !== 'Note__c');
  const first = await deployNativeMapping(desired(without), f.client, f.deps);
  assert.equal(first.operation, 'update');
  assert.equal(first.document.spec.fieldMappings.length, 6);
  assert.equal(f.read().fields.find((field) => field.name === 'Note__c').isMapped, true);
  const second = desired(without);
  second.spec.sourceEntityDeveloperName = 'Other__dll';
  const last = await deployNativeMapping(second, f.client, f.deps);
  assert.equal(last.operation, 'update');
  assert.equal(last.document.identity.apiName, 'Other');
  assert.ok(!('isMapped' in f.read().fields.find((field) => field.name === 'Note__c')));
  assert.deepEqual(f.calls, [
    ['TargetGenerated_123', 'target_Note__c'],
    ['Other', 'target_Note__c'],
  ]);
  // Both mappings kept every other pair and nothing is left to do.
  const replay = await deployNativeMapping(desired(without), f.client, f.deps);
  assert.equal(replay.operation, 'noop');
  assert.equal(f.calls.length, 2);
});

test('shared-field removal keeps the other unmap protections and verifies the mapped marker', async () => {
  // The primary-key pair stays required beside a second mapping; an omitted generated or
  // key-qualifier pair is kept as the org has it.
  for (const omitted of ['Id__c', 'DataSource__c', 'KQ_Id__c']) {
    const f = sharedFixture();
    const input = desired(names.filter((name) => name !== omitted));
    if (omitted === 'Id__c')
      await assert.rejects(deployNativeMapping(input, f.client, f.deps), /PROTECTED_PAIR_REQUIRED/);
    else {
      const result = await deployNativeMapping(input, f.client, f.deps);
      assert.equal(result.operation, 'noop', omitted);
      assert.equal(result.document.spec.fieldMappings.length, 7);
    }
    assert.deepEqual(f.calls, []);
    assert.equal(f.states.get('TargetGenerated_123').fieldMappings.length, 7);
  }
  // A missing observed selector still blocks before any unmap.
  const unselected = sharedFixture();
  delete unselected.states.get('TargetGenerated_123').fieldMappings[2].developerName;
  await assert.rejects(
    deployNativeMapping(
      desired(names.filter((name) => name !== 'Note__c')),
      unselected.client,
      unselected.deps,
    ),
    /SELECTOR_REQUIRED/,
  );
  assert.deepEqual(unselected.calls, []);
  // A lower pin and a retarget onto a field another mapping targets are left to Salesforce.
  for (const mode of ['version', 'retarget']) {
    const f = sharedFixture();
    const input = desired(names.filter((name) => name !== 'Note__c'));
    if (mode === 'version') f.client.apiVersion = '64.0';
    if (mode === 'retarget') {
      input.spec.fieldMappings = input.spec.fieldMappings.filter(
        (entry) => entry.sourceFieldDeveloperName !== 'Name__c',
      );
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: 'Name__c',
        targetFieldDeveloperName: 'Note__c',
      });
    }
    const plan = await preflightNativeMapping(input, f.client, f.deps);
    assert.equal(plan.operation, 'update', mode);
    assert.deepEqual(
      pairNames(plan.removals),
      mode === 'retarget' ? ['Name__c', 'Note__c'] : ['Note__c'],
      mode,
    );
    assert.equal(plan.writes.length, mode === 'retarget' ? 1 : 0, mode);
    assert.deepEqual(f.calls, [], mode);
  }
  // Salesforce clearing the marker while another mapping still targets the field is drift.
  const f = sharedFixture();
  const remove = f.client.deleteField;
  let cleared = false;
  f.client.deleteField = async (...arguments_) => {
    await remove(...arguments_);
    cleared = true;
  };
  const read = f.deps.target.get;
  f.deps.target.get = async () => {
    const schema = await read();
    if (cleared) delete schema.fields.find((field) => field.name === 'Note__c').isMapped;
    return schema;
  };
  await assert.rejects(
    deployNativeMapping(desired(names.filter((name) => name !== 'Note__c')), f.client, f.deps),
    /PARENT_CHANGED/,
  );
  assert.equal(f.calls.length, 1);
});

test('guarded unmap refuses an unidentified key pair, unknown metadata and missing selectors before writes', async () => {
  for (const [mode, expected] of [
    // Without a source and target primary key nothing proves which pair must survive.
    ['target-key', /PROTECTED_LAYOUT_UNPROVEN/],
    // A protected pair whose target field is not marked mapped is not the known layout.
    ['flag', /PROTECTED_LAYOUT_UNPROVEN/],
    ['source-key', /PROTECTED_LAYOUT_UNPROVEN/],
    ['selector', /SELECTOR_REQUIRED/],
  ]) {
    const f = unmapFixture();
    if (mode === 'target-key') f.schema.fields[0].isPrimaryKey = false;
    if (mode === 'flag') delete f.schema.fields[0].isMapped;
    if (mode === 'source-key')
      f.deps.source.get = async () => ({
        ...source(),
        // The source key feeds an ordinary target field, so no pair joins the two keys.
        fields: source().fields.map((field) => ({
          ...field,
          isPrimaryKey: field.name === 'Name__c',
        })),
      });
    if (mode === 'selector') delete f.state.fieldMappings[1].developerName;
    await assert.rejects(
      preflightUnmapNativeMapping(
        normalizeNativeMapping(f.state),
        f.client,
        f.deps,
        normalizeNativeMapping(f.state).spec.fieldMappings,
      ),
      expected,
      mode,
    );
    assert.deepEqual(f.calls, []);
  }
});

test('guarded unmap removes any pair that is not protected; the earlier field policy is gone', async () => {
  // Pairs with different names, other types, usage tags or key qualifiers are removable.
  for (const mode of ['names', 'type', 'usage', 'qualifier', 'unmarked']) {
    const f = unmapFixture();
    const source = f.deps.source.get;
    const removed = pair('Name__c');
    if (mode === 'names') {
      // Name__c feeds Note__c instead of the field of the same name.
      f.state.fieldMappings = f.state.fieldMappings.filter(
        (entry) => !['Name__c', 'Note__c'].includes(entry.sourceFieldDeveloperName),
      );
      removed.targetFieldDeveloperName = 'Note__c';
      removed.developerName = 'target_Name_to_Note';
      f.state.fieldMappings.push(removed);
      delete f.schema.fields[1].isMapped;
    }
    if (mode === 'type') {
      f.schema.fields[1].type = 'Date';
      f.deps.source.get = async () => {
        const definition = await source();
        definition.fields[1].dataType = 'Date';
        return definition;
      };
    }
    if (mode === 'usage') f.schema.fields[1].usageTag = 'Email';
    if (mode === 'qualifier') f.schema.fields[1].keyQualifierName = 'Unexpected';
    if (mode === 'unmarked') delete f.schema.fields[1].isMapped;
    const plan = await preflightUnmapNativeMapping(
      normalizeNativeMapping(f.state),
      f.client,
      f.deps,
      [removed],
    );
    assert.deepEqual(plan.removals, [removed], mode);
    assert.equal(plan.protectedPairs.length, 5, mode);
    assert.deepEqual(f.calls, [], mode);
    const result = await unmapNativeMappingFields(plan, f.client, f.deps, () => {});
    assert.deepEqual(f.calls, [['TargetGenerated_123', removed.developerName]], mode);
    assert.ok(
      !result.selected.spec.fieldMappings.some(
        (entry) => entry.developerName === removed.developerName,
      ),
      mode,
    );
    assert.equal(f.state.fieldMappings.length, mode === 'names' ? 5 : 6, mode);
  }
});

test('guarded unmap stops after lost response, ignored removal, schema drift or CREATING content drift', async () => {
  for (const mode of ['lost', 'ignored', 'schema', 'creating', 'selector']) {
    const f = unmapFixture();
    const plan = await preflightUnmapNativeMapping(
      normalizeNativeMapping(f.state),
      f.client,
      f.deps,
      normalizeNativeMapping(f.state).spec.fieldMappings,
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
    normalizeNativeMapping(stale.state).spec.fieldMappings,
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
    normalizeNativeMapping(f.state).spec.fieldMappings,
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

/**
 * Hand-written mapping file: authored pairs only, no generated pairs and no selectors.
 * @param {string[]} fields Authored field names, mapped onto their namesakes.
 * @returns {object} Portable document under a source-side name.
 */
const handWritten = (fields) => {
  const document = desired(fields);
  for (const field of document.spec.fieldMappings) delete field.developerName;
  return document;
};

test('hand-written mapping without generated pairs is a no-op against the existing mapping', async () => {
  const f = fixture(raw(['Id__c', 'Name__c', ...generatedNames]));
  const input = handWritten(['Id__c', 'Name__c']);
  assert.deepEqual(input.spec.fieldMappings, [
    { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' },
    { sourceFieldDeveloperName: 'Name__c', targetFieldDeveloperName: 'Name__c' },
  ]);
  const before = structuredClone(input);
  const plan = await preflightNativeMapping(input, f.client, f.deps);
  assert.equal(plan.operation, 'noop');
  assert.deepEqual(plan.writes, []);
  // The plan carries the merged document: the authored pairs, then the org's generated pairs.
  assert.deepEqual(plan.desired.spec.fieldMappings, [
    ...before.spec.fieldMappings,
    ...generatedNames.map((name) => pair(name)),
  ]);
  assert.notEqual(plan.desired, input);
  assert.deepEqual(input, before);
  const preview = await preflightMapping(input, f.client, f.deps);
  assert.equal(preview.outcome, 'noop');
  const result = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(result.operation, 'noop');
  assert.equal(result.document.spec.fieldMappings.length, 6);
  assert.deepEqual(await executeMapping(input, f.client, f.deps), {
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  assert.deepEqual(input, before);
});

test('hand-written mapping adds one authored pair with a single names-only PATCH', async () => {
  const f = fixture(raw(['Id__c', 'Name__c', ...generatedNames]));
  const input = handWritten(['Id__c', 'Name__c', 'Note__c']);
  const before = structuredClone(input);
  const plan = await preflightNativeMapping(input, f.client, f.deps);
  assert.equal(plan.operation, 'update');
  assert.equal(plan.removals, undefined);
  assert.equal(plan.evidence, undefined);
  assert.deepEqual(pairNames(plan.retained), ['Id__c', 'Name__c', ...generatedNames]);
  const preview = await preflightMapping(input, f.client, f.deps);
  assert.deepEqual(preview.plan, [
    {
      operation: 'add',
      apiName: 'TargetGenerated_123',
      sourceFieldDeveloperName: 'Note__c',
      targetFieldDeveloperName: 'Note__c',
    },
  ]);
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  const result = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(result.operation, 'update');
  assert.deepEqual(
    f.calls.filter(([kind]) => !['get', 'list'].includes(kind)),
    [
      [
        'update',
        'TargetGenerated_123',
        {
          sourceEntityDeveloperName: 'Example__dll',
          targetEntityDeveloperName: 'Example__dlm',
          fieldMapping: [
            { sourceFieldDeveloperName: 'Note__c', targetFieldDeveloperName: 'Note__c' },
          ],
        },
      ],
    ],
  );
  assert.deepEqual(pairNames(result.document.spec.fieldMappings).toSorted(), names.toSorted());
  assert.deepEqual(input, before);
  // The same file is unchanged afterwards.
  const replay = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(replay.operation, 'noop');
  assert.equal(f.calls.filter(([kind]) => kind === 'update').length, 1);
});

test('hand-written mapping removes only its omitted authored pair and keeps the generated pairs', async () => {
  const f = fixture();
  const input = handWritten(['Id__c', 'Name__c']);
  const before = structuredClone(input);
  const plan = await preflightNativeMapping(input, f.client, f.deps);
  assert.equal(plan.operation, 'update');
  assert.deepEqual(plan.removals, [pair('Note__c')]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(pairNames(plan.retained), ['Id__c', 'Name__c', ...generatedNames]);
  assert.deepEqual(pairNames(plan.evidence.protectedPairs), ['Id__c', ...generatedNames]);
  const preview = await preflightMapping(input, f.client, f.deps);
  assert.deepEqual(preview.plan, [
    { operation: 'unmap', apiName: 'TargetGenerated_123', ...pair('Note__c') },
  ]);
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  const changes = [];
  const result = await deployNativeMapping(input, f.client, f.deps, (change) =>
    changes.push(change),
  );
  assert.deepEqual(changes, [{ deleted: [pair('Note__c')], added: [] }]);
  assert.equal(result.operation, 'update');
  assert.deepEqual(
    result.document.spec.fieldMappings,
    raw().fieldMappings.filter((entry) => entry.sourceFieldDeveloperName !== 'Note__c'),
  );
  assert.deepEqual(
    f.calls.filter(([kind]) => !['get', 'list'].includes(kind)),
    [['unmap', 'TargetGenerated_123', 'target_Note__c']],
  );
  assert.deepEqual(input, before);
  const replay = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(replay.operation, 'noop');
});

test('hand-written mapping without the key pair is refused; generated pairs are not authored removals', async () => {
  const f = fixture();
  const input = handWritten(['Name__c', 'Note__c']);
  const before = structuredClone(input);
  await assert.rejects(
    preflightNativeMapping(input, f.client, f.deps),
    (error) => error.code === 'MAPPING_PROTECTED_PAIR_REQUIRED',
  );
  const blocked = await executeMapping(input, f.client, f.deps);
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.mutation, 'not-attempted');
  assert.equal(blocked.diagnostics[0].code, 'MAPPING_PROTECTED_PAIR_REQUIRED');
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  assert.deepEqual(input, before);
  // A system-named pair onto a field the org does not report as System is not merged: the
  // omission stays an ordinary removal beside the protected key pair.
  const authored = fixture();
  authored.schema.fields.find((field) => field.name === 'DataSource__c').creationType = 'Custom';
  const plan = await preflightNativeMapping(
    handWritten(['Id__c', 'Name__c', 'Note__c']),
    authored.client,
    authored.deps,
  );
  assert.deepEqual(plan.removals, [pair('DataSource__c')]);
  assert.deepEqual(pairNames(plan.evidence.protectedPairs), [
    'Id__c',
    ...generatedNames.filter((name) => name !== 'DataSource__c'),
  ]);
  assert.ok(authored.calls.every(([kind]) => ['get', 'list'].includes(kind)));
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

test('desired-state protected omission blocks before any unmap; other additions are left to Salesforce', async () => {
  const blocked = fixture();
  await assert.rejects(
    deployNativeMapping(
      desired(names.filter((name) => name !== 'Id__c')),
      blocked.client,
      blocked.deps,
    ),
    /PROTECTED_PAIR_REQUIRED/,
  );
  assert.ok(blocked.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  for (const mode of ['version', 'key-target', 'occupied']) {
    const f = fixture();
    const input = desired(names.filter((name) => name !== 'Name__c'));
    if (mode === 'version') f.client.apiVersion = '67.0';
    if (mode === 'key-target')
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: 'Name__c',
        targetFieldDeveloperName: 'Id__c',
      });
    if (mode === 'occupied')
      input.spec.fieldMappings.push({
        sourceFieldDeveloperName: 'Name__c',
        targetFieldDeveloperName: 'Note__c',
      });
    const plan = await preflightNativeMapping(input, f.client, f.deps);
    assert.equal(plan.operation, 'update', mode);
    assert.deepEqual(plan.removals, [pair('Name__c')], mode);
    assert.equal(plan.writes.length, mode === 'version' ? 0 : 1, mode);
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
  test(`desired-state ${mode} drift after the evidence read blocks all writes; a stable state is left to Salesforce`, async () => {
    // Read 1 admits the file, read 2 is the unmap evidence, read 3 the pre-dispatch recheck.
    for (const driftFrom of [2, 3]) {
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
        if (
          ++sourceReads >= driftFrom &&
          ['source-type', 'both-types', 'target-retarget-type'].includes(mode)
        )
          definition.fields.find((field) => field.name === 'Note__c').dataType = 'Number';
        return definition;
      };
      f.deps.target.get = async () => {
        const definition = await readTarget();
        if (++targetReads >= driftFrom) {
          const field = definition.fields.find((field) => field.name === 'Note__c');
          if (mode === 'occupied') field.isMapped = true;
          if (mode === 'special-usage') field.usageTag = 'Email';
          if (['target-type', 'both-types', 'source-retarget-type'].includes(mode))
            field.type = 'Number';
        }
        return definition;
      };
      const result = await executeMapping(input, f.client, f.deps);
      const dispatched = f.calls.filter(([kind]) =>
        ['unmap', 'update', 'create', 'delete'].includes(kind),
      );
      if (driftFrom === 2) {
        // The evidence snapshot already holds the changed state and stays stable.
        assert.equal(result.mutation, 'confirmed-updated', JSON.stringify(result));
        assert.deepEqual(
          dispatched.map(([kind]) => kind),
          ['unmap', 'update'],
        );
        continue;
      }
      assert.equal(result.outcome, 'blocked', JSON.stringify(result));
      assert.equal(result.mutation, 'not-attempted');
      assert.equal(result.diagnostics[0].code, 'MAPPING_UNMAP_PLAN_CHANGED');
      assert.ok(sourceReads >= 3);
      assert.ok(targetReads >= 3);
      assert.deepEqual(dispatched, []);
    }
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

// API61 single-add admission does not qualify lower-pin destructive reconciliation.
test('API61 omitted context preserves create, retrieve, single addition and no-op boundaries', async () => {
  const created = fixture();
  created.client.apiVersion = '61.0';
  created.client.list = async () => ({ objectSourceTargetMaps: [] });
  const create = await deployNativeMapping(desired(), created.client, dependencies());
  assert.equal(create.operation, 'create');
  assert.equal(created.calls.filter(([kind]) => kind === 'create').length, 1);
  const f = fixture(raw(names.filter((name) => name !== 'Name__c')));
  f.client.apiVersion = '61.0';
  const input = desired();
  const before = structuredClone(input);
  const preview = await preflightMapping(input, f.client, f.deps);
  assert.equal(preview.outcome, 'update');
  assert.ok(f.calls.every(([kind]) => ['get', 'list'].includes(kind)));
  const result = await deployNativeMapping(input, f.client, f.deps);
  assert.equal(result.operation, 'update');
  assert.equal(f.calls.filter(([kind]) => kind === 'update').length, 1);
  const retrieved = await retrieveNativeMapping('TargetGenerated_123', f.client);
  assert.equal(retrieved.identity.dataSpace, 'default');
  assert.equal(retrieved.spec.fieldMappings.length, 7);
  const repeat = await executeMapping(input, f.client, f.deps);
  assert.equal(repeat.outcome, 'unchanged');
  assert.equal(repeat.mutation, 'not-attempted');
  assert.equal(f.calls.filter(([kind]) => kind === 'update').length, 1);
  assert.ok(f.calls.every(([kind]) => !['unmap', 'delete'].includes(kind)));
  assert.deepEqual(input, before);
});
