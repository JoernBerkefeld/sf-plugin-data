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
  const calls = [];
  return {
    calls,
    client: {
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
        state.fieldMappings.push({
          ...body.fieldMapping[0],
          developerName: 'fresh_server_selector',
        });
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
  const { client, calls } = fixture(raw(names.filter((name) => name !== 'Name__c')));
  const result = await deployNativeMapping(desired(), client, dependencies());
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

test('mapping removal and replacement remain blocked without reusing source selectors', async () => {
  const full = fixture().client;
  await assert.rejects(
    preflightNativeMapping(
      desired(names.filter((name) => name !== 'Name__c')),
      full,
      dependencies(),
    ),
    /REMOVAL_OR_RETARGET/,
  );
  const collision = raw();
  collision.fieldMappings = collision.fieldMappings.filter(
    (f) => f.sourceFieldDeveloperName !== 'Name__c',
  );
  collision.fieldMappings.push({ ...pair('Name__c'), targetFieldDeveloperName: 'Note__c' });
  await assert.rejects(
    preflightNativeMapping(desired(), fixture(collision).client, dependencies()),
    /REMOVAL_OR_RETARGET/,
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
    const { client, calls } = fixture(raw(names.filter((name) => name !== 'Name__c')));
    const original = client.get;
    let reads = 0;
    client.get = async (name) => (++reads === 1 ? original(name) : returned);
    await assert.rejects(deployNativeMapping(desired(), client, dependencies()), /PERSISTENCE/);
    assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
    assert.equal(reads, 4);
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
    ...raw(),
    developerName: 'OtherGenerated_456',
    sourceEntityDeveloperName: 'Other__dll',
  };
  const calls = [];
  let deleted = false;
  let survivorReads = 0;
  const deps = dependencies();
  deps.source.get = async (name) => ({ ...source(), name });
  const client = {
    list: async (...arguments_) => {
      calls.push(['list', ...arguments_]);
      return { objectSourceTargetMaps: [selected, survivor] };
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
  return { client, deps, calls, selected, survivor };
};

test('mapping non-last delete uses DMO-only complete inventory, typed absence and bounded survivor settlement', async () => {
  const f = deleteFixture();
  const before = structuredClone(await f.deps.target.get());
  const preview = await preflightDeleteNativeMapping('TargetGenerated_123', f.client, f.deps);
  assert.equal(preview.selected.identity.apiName, 'TargetGenerated_123');
  assert.equal(
    f.calls.some(([kind]) => kind === 'delete'),
    false,
  );
  const g = deleteFixture();
  assert.deepEqual(await deleteNativeMapping('TargetGenerated_123', g.client, g.deps), {
    apiName: 'TargetGenerated_123',
  });
  assert.deepEqual(
    g.calls.find(([kind]) => kind === 'list'),
    ['list', 'Example__dlm'],
  );
  assert.equal(g.calls.filter(([kind]) => kind === 'delete').length, 1);
  assert.equal(
    g.calls.filter(([kind, name]) => kind === 'get' && name === 'OtherGenerated_456').length,
    3,
  );
  assert.deepEqual(await g.deps.target.get(), before);
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

test('mapping delete stops on dispatch error or failed absence/survivor/parent checks without write retry', async () => {
  for (const mode of ['write', 'auth', 'present', 'survivor', 'pending', 'parent']) {
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
    });
    await assert.rejects(deleteNativeMapping('TargetGenerated_123', f.client, f.deps));
    assert.equal(f.calls.filter(([kind]) => kind === 'delete').length, 1);
  }
  await assert.rejects(
    retrieveNativeMapping('../escape', fixture().client),
    /INVALID_MAPPING_NAME/,
  );
  await assert.rejects(
    deleteNativeMapping('SourceGenerated_456', fixture().client, dependencies()),
    /IDENTITY/,
  );
});

test('mapping HTTP200 ignored addition is failed/unknown, with bounded reads and no write retry', async () => {
  const current = raw(names.filter((name) => name !== 'Name__c'));
  const { client, calls } = fixture(current);
  client.update = async (name, body) => {
    calls.push(['update', name, body]);
    return raw(); // A convincing response echo is not independent persistence.
  };
  const deps = dependencies();
  const beforeSource = await deps.source.get();
  const beforeTarget = await deps.target.get();
  const result = await executeMapping(desired(), client, deps);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'MAPPING_PERSISTENCE_UNCONFIRMED');
  assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'get').length, 4);
  assert.deepEqual(await deps.source.get(), beforeSource);
  assert.deepEqual(await deps.target.get(), beforeTarget);
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
  const failed = await executeMapping(desired(), client, dependencies());
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.mutation, 'unknown');
  assert.equal(failed.diagnostics[0].code, 'MAPPING_REQUEST_UNCONFIRMED');
  const created = fixture();
  created.client.list = async () => ({ objectSourceTargetMaps: [] });
  const createResult = await executeMapping(desired(), created.client, dependencies());
  assert.equal(createResult.mutation, 'confirmed-created');
  const update = fixture(raw(names.filter((n) => n !== 'Name__c')));
  const updateResult = await executeMapping(desired(), update.client, dependencies());
  assert.equal(updateResult.mutation, 'confirmed-updated');
});
