import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { errorCodeInfo } from '../lib/errors/registry.js';
import Delete from '../lib/commands/data360/delete.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { deleteNativeMapping } from '../lib/services/native-mapping.js';
import { dataSpaceDirectory } from '../lib/services/data-space-check.js';

const invocation = (flags = {}) => {
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: {
      metadata: ['mapping:Generated_123'],
      'data-space': 'default',
      preview: false,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveTarget = async () => 'target';
  command.createDloClient = command.createDmoClient = () => ({ get: async () => ({}) });
  // DLO/DMO delete use their own bound-connection seams; tests keep overriding the old factories.
  // Unless a test says otherwise, Salesforce lists no dependents of the DLO.
  command.createDloNativeDeleteClient = (...arguments_) => ({
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
    ...command.createDloClient(...arguments_),
  });
  command.createDmoNativeDeleteClient = (...arguments_) => command.createDmoClient(...arguments_);
  // Every selected DLO is read once before any phase (it must belong to the run's data space
  // only); unless a test says otherwise, Salesforce lists it in default alone.
  command.retrieveDlo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  // Mapping GET/DELETE get a bound sender; the fake mapping clients below never use it.
  command.createMappingSender = () => ({
    request: async () => assert.fail('fake mapping clients must not reach the bound sender'),
  });
  return command;
};
const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};

for (const scope of ['default', 'Team'])
  for (const preview of [false, true])
    test(`public mapping delete passes scope without moving injection positions ${scope}/${preview}`, async () => {
      const command = invocation({ dataspace: scope, preview });
      const client = { remove: async () => {} };
      command.createMappingClient = (_target, _version, runner, actual) => {
        assert.equal(runner, undefined);
        assert.equal(actual, scope);
        return client;
      };
      let calls = 0;
      command.preflightDeleteMapping = command.deleteMapping = async (
        name,
        actualClient,
        dependencies,
        actual,
      ) => {
        calls++;
        assert.equal(name, 'Generated_123');
        assert.equal(typeof actualClient.remove, 'function');
        assert.deepEqual(Object.keys(dependencies), ['target']);
        assert.equal(actual, scope);
        return { selected: {}, others: [], targetFields: [] };
      };
      const result = await run(command);
      assert.equal(result.status, 'success');
      assert.equal(calls, 1);
      assert.equal(result.result.items[0].identity.dataSpace, scope ?? 'default');
    });

test('mapping delete passes the run data space prefix from the data space list', async (t) => {
  const offline = dataSpaceDirectory.read;
  t.after(() => {
    dataSpaceDirectory.read = offline;
  });
  // The org's list names dataspace2 with its prefix ds2.
  dataSpaceDirectory.read = async () => [
    { name: 'default' },
    { name: 'dataspace2', prefix: 'ds2' },
  ];
  for (const [scope, prefix] of [
    ['dataspace2', 'ds2'],
    ['default', undefined],
  ])
    for (const preview of [false, true]) {
      const command = invocation({ dataspace: scope, preview });
      command.createDataSpaceSender = () => ({
        request: async () => assert.fail('the stubbed list is read instead'),
      });
      command.createMappingClient = () => ({ remove: async () => {} });
      const received = [];
      command.preflightDeleteMapping = command.deleteMapping = async (
        _name,
        _client,
        dependencies,
      ) => {
        received.push(dependencies.dataSpacePrefix);
        assert.equal('dataSpacePrefix' in dependencies, prefix !== undefined);
        return { selected: {}, others: [], targetFields: [] };
      };
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
      assert.deepEqual(received, [prefix], `${scope}/${preview}`);
    }
  // A data space list that cannot be read stops the run before any mapping read or delete.
  dataSpaceDirectory.read = async () => {
    throw new Error('private-list-failure');
  };
  const command = invocation({ dataspace: 'dataspace2' });
  command.createDataSpaceSender = () => ({ request: async () => assert.fail('not reached') });
  command.createMappingClient = () => ({ remove: async () => assert.fail('no delete') });
  command.preflightDeleteMapping = command.deleteMapping = async () =>
    assert.fail('no mapping delete without the data space list');
  const result = await run(command);
  assert.notEqual(result.status, 'success');
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
});

const mappingFixture = (command) => {
  const names = [
    'Id__c',
    'Name__c',
    'Note__c',
    'DataSource__c',
    'DataSourceObject__c',
    'InternalOrganization__c',
    'KQ_Id__c',
  ];
  const pairs = names.map((name) => ({
    sourceFieldDeveloperName: name,
    targetFieldDeveloperName: name,
    developerName: `observed_${name}`,
  }));
  const selected = {
    developerName: 'Generated_123',
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: 'Target__dlm',
    status: 'ACTIVE',
    fieldMappings: pairs,
  };
  const survivor = {
    ...selected,
    developerName: 'Other_456',
    sourceEntityDeveloperName: 'Other__dll',
    fieldMappings: pairs.filter(
      (pair) => !['Name__c', 'Note__c'].includes(pair.sourceFieldDeveloperName),
    ),
  };
  const schema = {
    name: 'Target__dlm',
    label: 'Target',
    category: 'OTHER',
    creationType: 'Custom',
    dataSpaceName: 'default',
    fields: names.map((name, index) => ({
      name,
      label: name,
      type: 'Text',
      isPrimaryKey: index === 0,
      creationType: index >= 3 ? 'System' : 'Custom',
      isMapped: true,
      ...(index === 0 ? { keyQualifierName: 'KQ_Id' } : {}),
      ...(name === 'KQ_Id__c' ? { usageTag: 'KeyQualifier' } : {}),
    })),
  };
  const calls = [];
  let deleted = false;
  const client = {
    apiVersion: '68.0',
    list: async () => ({
      objectSourceTargetMaps: structuredClone(deleted ? [survivor] : [selected, survivor]),
    }),
    get: async (name) => {
      if (deleted && name === selected.developerName)
        throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return structuredClone(name === selected.developerName ? selected : survivor);
    },
    deleteField: async () => assert.fail('mapping deletion never unmaps'),
    remove: async (name) => {
      calls.push(['remove', name]);
      deleted = true;
    },
  };
  command.createMappingClient = () => client;
  command.createDloClient = () => assert.fail('mapping deletion reads no DLO');
  command.createDmoClient = () => ({ get: async () => structuredClone(schema) });
  return { calls, client, selected, survivor, schema };
};

for (const preview of [true, false]) {
  for (const json of [true, false]) {
    test(`public mapping deletion is one removal preview=${preview} json=${json}`, async () => {
      const command = invocation({ preview });
      const f = mappingFixture(command);
      const lines = [];
      command.jsonEnabled = () => json;
      command.log = (line) => lines.push(line);
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      const item = result.result.items[0];
      assert.equal(item.mutation, preview ? 'not-attempted' : 'confirmed-deleted');
      if (preview) {
        assert.deepEqual(f.calls, []);
        assert.deepEqual(item.plan, [{ operation: 'delete', apiName: 'Generated_123' }]);
        assert.ok(!JSON.stringify(item).includes('fieldMappings'));
      } else {
        assert.deepEqual(f.calls, [['remove', 'Generated_123']]);
        assert.ok(!('plan' in item));
      }
      if (json) assert.deepEqual(lines, []);
      else
        assert.ok(
          lines.includes(
            preview
              ? `Planned delete: mapping:Generated_123; mutation: ${item.mutation}.`
              : 'deleted mapping Generated_123',
          ),
        );
    });
  }
}

test('human deletion prints one identified action for each item, DMOs before DLOs, and stops at failure', async () => {
  for (const failure of [false, true]) {
    const command = invocation({
      metadata: ['dlo:First__dll', 'dmo:Second__dlm', 'dlo:Third__dll'],
    });
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    command.createDloClient = command.createDmoClient = () => ({ delete: async () => {} });
    command.deleteDlo = async (name, client) => {
      await client.delete(name);
      if (failure) throw new Error('readback failed');
      return { dataSpace: 'default' };
    };
    command.deleteDmo = async (name, client) => {
      await client.delete(name);
      return { dataSpace: 'default' };
    };
    const result = await run(command);
    assert.equal(result.status, failure ? 'failed' : 'success');
    assert.deepEqual(
      lines.slice(1),
      failure
        ? [
            'deleted dmo Second__dlm',
            'Failed: dlo:First__dll; mutation: unknown.',
            // Human output names the stop reason, not only rate-limit diagnostics.
            `DELETE_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: ${errorCodeInfo('DELETE_FAILED').hint}
Docs: ${errorCodeInfo('DELETE_FAILED').docs}`,
          ]
        : ['deleted dmo Second__dlm', 'deleted dlo First__dll', 'deleted dlo Third__dll'],
    );
  }
});

// API62..67 exercise assumed compatibility only, not live qualification.
for (const version of [
  '61.0',
  '62.0',
  '63.0',
  '64.0',
  '65.0',
  '66.0',
  '67.0',
  '68.0',
  'auto',
  undefined,
]) {
  for (const preview of [true, false]) {
    test(`mapping delete compatibility ${version} preview=${preview} pins all clients`, async () => {
      const command = invocation({ 'api-version': version, preview });
      const f = mappingFixture(command);
      const pin = version === 'auto' || version === undefined ? '68.0' : version;
      f.client.apiVersion = pin;
      const factories = [];
      for (const method of ['createMappingClient', 'createDloClient', 'createDmoClient']) {
        const factory = command[method];
        command[method] = (target, requested) => {
          factories.push([method, target, requested]);
          return factory(target, requested);
        };
      }
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.deepEqual(factories, [
        ['createMappingClient', 'target', pin],
        ['createDmoClient', 'target', pin],
      ]);
      assert.deepEqual(f.calls, preview ? [] : [['remove', 'Generated_123']]);
      if (preview)
        assert.deepEqual(result.result.items[0].plan, [
          { operation: 'delete', apiName: 'Generated_123' },
        ]);
    });
  }
}

const expectedCodes = {
  rejected: 'MAPPING_DELETE_FAILED',
  refused: 'MAPPING_DELETE_FAILED',
  lost: 'DELETE_FAILED',
  ignored: 'MAPPING_DELETION_UNCONFIRMED',
  'side-effect': 'MAPPING_DELETE_SIDE_EFFECT',
  last: 'MAPPING_LAST_MAPPING_DELETE_BLOCKED',
  stale: 'MAPPING_INVENTORY_UNCONFIRMED',
};
for (const [mode, code] of Object.entries(expectedCodes)) {
  test(`public mapping ${mode} stops batch with honest mutation bookkeeping`, async () => {
    const command = invocation({ metadata: ['mapping:Generated_123', 'dlo:Later__dll'] });
    const f = mappingFixture(command);
    const remove = f.client.remove;
    f.client.remove = async (name) => {
      if (['rejected', 'refused', 'ignored'].includes(mode)) f.calls.push(['remove', name]);
      if (mode === 'rejected') throw new NativeMappingError('MAPPING_DELETE_FAILED');
      // A Failed destructive deployment with component failures applied nothing.
      if (mode === 'refused')
        throw new NativeMappingError('MAPPING_DELETE_FAILED', undefined, true);
      if (mode === 'ignored') return;
      await remove(name);
      if (mode === 'lost') throw new Error('response lost');
      if (mode === 'side-effect') f.survivor.fieldMappings.pop();
    };
    if (mode === 'last')
      f.client.list = async () => ({ objectSourceTargetMaps: [structuredClone(f.selected)] });
    if (mode === 'stale')
      f.client.list = async () => ({ objectSourceTargetMaps: [structuredClone(f.survivor)] });
    // The command's own budget waits in real time; the injected one keeps the same service path.
    command.deleteMapping = (name, client, dependencies, scope) =>
      deleteNativeMapping(name, client, dependencies, scope, {
        attempts: 2,
        delayMs: 0,
        sleep: async () => {},
      });
    command.deleteDlo = async () => assert.fail('later batch member dispatched');
    // The DLO's dependency list is read before the first write; it lists nothing here.
    command.createDloNativeDeleteClient = () => ({
      dependencies: async () => ({ dependencies: [], totalSize: 0 }),
      get: async () => assert.fail('later batch member read'),
      delete: async () => assert.fail('later batch member dispatched'),
    });
    const result = await run(command);
    const blocked = ['last', 'stale'].includes(mode);
    assert.equal(result.status, blocked ? 'blocked' : 'failed', JSON.stringify(result));
    assert.equal(result.result.items.length, 1);
    assert.equal(
      result.result.items[0].mutation,
      blocked ? 'not-attempted' : mode === 'refused' ? 'rejected' : 'unknown',
    );
    // Exactly one removal once dispatched, none when blocked.
    assert.deepEqual(f.calls, blocked ? [] : [['remove', 'Generated_123']]);
    assert.equal(result.diagnostics.errors.length, 1);
    assert.equal(result.diagnostics.errors[0].code, code);
    if (mode === 'last') {
      // The refusal names the way out: delete the DMO, which takes its mapping with it.
      assert.match(result.diagnostics.errors[0].message, /only mapping of the custom DMO/u);
      assert.match(
        result.diagnostics.errors[0].message,
        /sf data360 delete --metadata dmo:Target__dlm/u,
      );
    }
  });
}

for (const selector of ['dlo:Source__dll', 'dmo:Target__dlm']) {
  for (const preview of [true, false]) {
    test(`public delete human output preserves ${selector} preview=${preview}`, async () => {
      const command = invocation({ metadata: [selector], preview });
      const lines = [];
      let writes = 0;
      command.jsonEnabled = () => false;
      command.log = (line) => lines.push(line);
      command.createDloClient = command.createDmoClient = () => ({
        get: async () => ({}),
        delete: async () => {
          writes++;
        },
      });
      command.retrieveDlo = command.retrieveDmo = async (name) => ({
        identity: { dataSpace: 'default', apiName: name },
      });
      command.deleteDlo = command.deleteDmo = async (name, client) => {
        await client.delete(name);
        return { dataSpace: 'default' };
      };
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(writes, preview ? 0 : 1);
      assert.deepEqual(lines, [
        `Delete${preview ? ' preview' : ''}: success.`,
        preview
          ? `Planned delete: ${selector}; mutation: not-attempted.`
          : `deleted ${selector.replace(':', ' ')}`,
      ]);
      assert.deepEqual(result.result.items[0].identity, {
        dataSpace: 'default',
        apiName: selector.slice(selector.indexOf(':') + 1),
      });
    });
  }
}

test('public delete rejects type-wide, malformed selectors and non-native versions before auth', async () => {
  for (const flags of [
    { metadata: ['mapping'] },
    { metadata: ['mapping:'] },
    { metadata: ['mapping:../escape'] },
    { metadata: ['dlo'] },
    { metadata: ['dmo'] },
    { 'api-version': '60.0' },
    { 'api-version': '61.1' },
    { 'api-version': 'latest' },
  ]) {
    const command = invocation(flags);
    let auth = 0;
    command.resolveTarget = async () => {
      auth++;
      return 'target';
    };
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(auth, 0);
  }
  // Mapping deletion has no own version gate any more: any native numeric pin reaches the org.
  for (const version of ['61.0', '64.0', '69.0']) {
    const command = invocation({ 'api-version': version });
    let auth = 0;
    command.resolveTarget = async () => {
      auth++;
      throw new Error('stop after auth');
    };
    await run(command);
    assert.equal(auth, 1, version);
  }
});

test('public delete transport failure remains unknown and stops a non-mapping batch without retry', async () => {
  const command = invocation({ metadata: ['dlo:Source__dll', 'dlo:Other__dll'] });
  let writes = 0;
  command.createDloClient = () => ({
    delete: async () => {
      writes++;
      throw new Error('response lost');
    },
  });
  command.deleteDlo = async (name, client) => client.delete(name);
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items.length, 1);
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.equal(writes, 1);
});

test('a mapping that reads 404 is unchanged and the delete continues', async () => {
  for (const preview of [false, true]) {
    const command = invocation({ metadata: ['mapping:Generated_123', 'dlo:Later__dll'], preview });
    const f = mappingFixture(command);
    f.client.get = async () => {
      throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
    };
    const dlos = [];
    command.createDloNativeDeleteClient = () => ({
      dependencies: async () => ({ dependencies: [], totalSize: 0 }),
    });
    command.retrieveDlo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
    command.deleteDlo = async (name) => {
      dlos.push(name);
      return { dataSpace: 'default' };
    };
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(f.calls, []);
    assert.deepEqual(
      result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
      [
        ['mapping', 'unchanged', 'not-attempted'],
        ['dlo', preview ? 'delete' : 'deleted', preview ? 'not-attempted' : 'confirmed-deleted'],
      ],
    );
    assert.deepEqual(dlos, preview ? [] : ['Later__dll']);
    assert.deepEqual(result.diagnostics.errors, []);
  }
});

test('a mapping read failing with another status still stops the delete', async () => {
  const command = invocation({ metadata: ['mapping:Generated_123'] });
  const f = mappingFixture(command);
  f.client.get = async () => {
    throw new NativeMappingError('MAPPING_HTTP_ERROR', 403);
  };
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'MAPPING_HTTP_ERROR');
  assert.deepEqual(f.calls, []);
});

/**
 * Run a delete inside a fresh project under the verified OS temp directory.
 * @param {object} command Delete command.
 * @param {Record<string, object>} mappings Authored mapping files by name.
 * @returns {Promise<{result: object, root: string}>} Result and project root.
 */
const runInProject = async (command, mappings) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-mapping-authored-'));
  await writeFile(path.join(root, '.run-owner'), randomUUID());
  await mkdir(path.join(root, 'data360', 'mapping'), { recursive: true });
  for (const [name, document] of Object.entries(mappings))
    await writeFile(
      path.join(root, 'data360', 'mapping', `${name}.mapping-meta.json`),
      JSON.stringify(document),
    );
  const cwd = process.cwd();
  process.chdir(root);
  try {
    return { result: await run(command), root };
  } finally {
    process.chdir(cwd);
  }
};
const authored = (apiName) => ({
  schemaVersion: 1,
  kind: 'mapping',
  c__dataSpace: 'default',
  identity: { apiName },
  spec: {
    sourceEntityDeveloperName: 'Source__dll',
    targetEntityDeveloperName: 'Target__dlm',
    fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
  },
});

for (const preview of [false, true])
  test(`an authored mapping name resolves to the org mapping by its binding preview=${preview}`, async () => {
    const command = invocation({ metadata: ['mapping:Authored_1'], preview });
    const f = mappingFixture(command);
    const lists = [];
    const list = f.client.list;
    f.client.list = async (dmo, dlo) => {
      lists.push([dmo, dlo]);
      // The binding lookup filters by DLO; the surroundings read lists the whole DMO.
      return dlo === undefined ? list() : { objectSourceTargetMaps: [structuredClone(f.selected)] };
    };
    const { result, root } = await runInProject(command, { Authored_1: authored('Authored_1') });
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(lists[0], ['Target__dlm', 'Source__dll']);
    const [item] = result.result.items;
    assert.equal(item.identity.apiName, 'Authored_1');
    assert.equal(item.targetApiName, 'Generated_123');
    assert.deepEqual(f.calls, preview ? [] : [['remove', 'Generated_123']]);
    const file = path.join(root, 'data360', 'mapping', 'Authored_1.mapping-meta.json');
    if (preview) {
      assert.deepEqual(item.plan, [{ operation: 'delete', apiName: 'Generated_123' }]);
      assert.deepEqual(item.localFiles, [{ path: file, exists: true }]);
    } else {
      assert.equal(item.mutation, 'confirmed-deleted');
      assert.deepEqual(item.removedLocalFiles, [{ path: file, outcome: 'removed' }]);
    }
  });

// Lenient retrieve step 6b: a retrieved mapping file keeps keys the plugin does not model.
const lenient = (apiName) => {
  const document = authored(apiName);
  document.spec.futureSpec = 'kept';
  document.spec.fieldMappings[0].futurePair = 1;
  return document;
};
test('a retrieved mapping file with keys the plugin does not model names the org mapping by its binding', async () => {
  const command = invocation({ metadata: ['mapping:Authored_1'] });
  const f = mappingFixture(command);
  const list = f.client.list;
  f.client.list = async (dmo, dlo) =>
    dlo === undefined ? list() : { objectSourceTargetMaps: [structuredClone(f.selected)] };
  const { result } = await runInProject(command, { Authored_1: lenient('Authored_1') });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.result.items[0].targetApiName, 'Generated_123');
  assert.deepEqual(f.calls, [['remove', 'Generated_123']]);
});
test('a retrieved mapping file of another name is still refused before any read', async () => {
  const command = invocation({ metadata: ['mapping:Generated_123'] });
  const f = mappingFixture(command);
  f.client.list = f.client.get = async () => assert.fail('no mapping read');
  const { result } = await runInProject(command, { Generated_123: lenient('Other_1') });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(
    result.diagnostics.errors.map((error) => error.code),
    ['INVALID_SOURCE'],
  );
});

test('an authored mapping whose binding the org does not have is unchanged', async () => {
  const command = invocation({ metadata: ['mapping:Authored_1'] });
  const f = mappingFixture(command);
  f.client.list = async (_dmo, dlo) => {
    assert.equal(dlo, 'Source__dll');
    throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
  };
  f.client.get = async () => assert.fail('no exact-name read for an authored mapping');
  const { result } = await runInProject(command, { Authored_1: authored('Authored_1') });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(f.calls, []);
  const [item] = result.result.items;
  assert.deepEqual([item.outcome, item.mutation], ['unchanged', 'not-attempted']);
  assert.equal(item.removedLocalFiles, undefined);
});

test('an authored mapping whose binding matches two org mappings is refused before any write', async () => {
  const command = invocation({
    metadata: ['dmo:Other__dlm', 'mapping:Authored_1', 'dlo:Later__dll'],
  });
  const f = mappingFixture(command);
  f.client.list = async () => ({
    objectSourceTargetMaps: [
      structuredClone(f.selected),
      { ...structuredClone(f.selected), developerName: 'Generated_456' },
    ],
  });
  command.deleteDmo = command.deleteDlo = async () => assert.fail('nothing is deleted');
  command.createDloNativeDeleteClient = () => ({
    dependencies: async () => assert.fail('the mapping is resolved before the DLO is admitted'),
  });
  const { result } = await runInProject(command, { Authored_1: authored('Authored_1') });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(
    result.diagnostics.errors.map((error) => error.code),
    ['AMBIGUOUS_MAPPING_TARGET'],
  );
  assert.deepEqual(
    result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
    [['mapping', 'blocked', 'not-attempted']],
  );
});

for (const [label, document] of [
  ['an invalid mapping', { ...authored('Generated_123'), kind: 'dmo' }],
  ['a mapping of another name', authored('Other_1')],
  ['a mapping differing in letter case', authored('generated_123')],
])
  test(`a mapping file holding ${label} is refused before any read`, async () => {
    const command = invocation({ metadata: ['mapping:Generated_123'] });
    const f = mappingFixture(command);
    f.client.list = f.client.get = async () => assert.fail('no mapping read');
    const { result } = await runInProject(command, { Generated_123: document });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.calls, []);
    assert.deepEqual(
      result.diagnostics.errors.map((error) => error.code),
      ['INVALID_SOURCE'],
    );
    assert.match(result.diagnostics.errors[0].message, /identity\.apiName is Generated_123/u);
    assert.deepEqual(
      result.result.items.map((item) => [item.family, item.outcome, item.mutation]),
      [['mapping', 'blocked', 'not-attempted']],
    );
  });

test('without a mapping file of that name the exact org name is used', async () => {
  const command = invocation({ metadata: ['mapping:Generated_123'], 'keep-local-files': true });
  const f = mappingFixture(command);
  const lists = [];
  const list = f.client.list;
  f.client.list = async (dmo, dlo) => {
    lists.push(dlo);
    return list();
  };
  const { result } = await runInProject(command, { Other_1: authored('Other_1') });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(f.calls, [['remove', 'Generated_123']]);
  // No binding lookup: only the DMO's own mapping lists of the deletion.
  assert.ok(lists.every((dlo) => dlo === undefined));
  assert.equal(result.result.items[0].targetApiName, undefined);
});
