import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../lib/services/native-dlo.js';

const dlo = 'X__dll';
const dmo = 'X__dlm';
const id = '1dl000000000001AAA';
const runtime = {
  id,
  name: dlo,
  label: 'X',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
};
const dependent = (componentType, name) => ({ componentType, id: '0dm000000000001AAA', name });
const listed = (...entries) => ({ dependencies: entries, totalSize: entries.length });
const mapping = (developerName) => ({
  developerName,
  sourceEntityDeveloperName: dlo,
  targetEntityDeveloperName: dmo,
  fieldMappings: [
    {
      sourceFieldDeveloperName: 'Id__c',
      targetFieldDeveloperName: 'Id__c',
      developerName: `${developerName}_Id`,
    },
  ],
});

/**
 * Build one public delete over fakes that record every read and write in order.
 * @param {object} options Fixture options.
 * @param {string[]} options.metadata Selectors as the user lists them.
 * @param {boolean} [options.preview] Preview instead of execution.
 * @param {() => Promise<unknown>} options.dependencies Answers of the DLO dependency read.
 * @param {string[] | (() => string[])} [options.mappings] Mappings Salesforce lists between the DLO and the DMO.
 * @param {(id: string) => Promise<void>} [options.remove] DLO DELETE behaviour.
 * @returns {{command: object, events: unknown[][]}} Command and recorded calls.
 */
const fixture = ({ metadata, preview = false, dependencies, mappings = [], remove }) => {
  const events = [];
  let deleted = false;
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: { metadata, preview, 'api-version': '68.0', 'data-space': 'default' },
  });
  command.jsonEnabled = () => true;
  command.resolveTarget = async () => 'target';
  command.retrieveDlo = retrieveNativeDlo;
  command.deleteDlo = deleteNativeDlo;
  command.createDloNativeDeleteClient = () => ({
    get: async () => {
      if (deleted) throw new DloError('DLO_HTTP_ERROR', 404);
      return structuredClone(runtime);
    },
    delete: async (target) => {
      events.push(['delete dlo', target]);
      await remove?.(target);
      deleted = true;
    },
    dependencies: async (name) => {
      events.push(['dependencies', name]);
      return dependencies();
    },
  });
  command.createDmoNativeDeleteClient = () => ({
    get: async () => ({}),
    delete: async (name) => events.push(['delete dmo', name]),
  });
  command.retrieveDmo = async (name) => ({ identity: { dataSpace: 'default', apiName: name } });
  command.deleteDmo = async (name, client) => {
    await client.delete(name);
    return { dataSpace: 'default' };
  };
  command.createMappingSender = () => ({
    request: async () => assert.fail('fake mapping clients never reach the bound sender'),
  });
  command.createMappingClient = () => ({
    list: async (target, source) => {
      events.push(['list mappings', target, source]);
      const names = typeof mappings === 'function' ? mappings() : mappings;
      return { objectSourceTargetMaps: names.map((name) => mapping(name)) };
    },
    remove: async () => assert.fail('mapping removal is stubbed'),
  });
  command.preflightDeleteMapping = async () => {};
  command.deleteMapping = async (name) => {
    events.push(['delete mapping', name]);
  };
  return { command, events };
};
const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};
const writes = (events) => events.filter(([event]) => event.startsWith('delete'));

for (const preview of [true, false])
  test(`uncovered DataModelObject dependent blocks the DLO before any write preview=${preview}`, async () => {
    const { command, events } = fixture({
      metadata: [`dlo:${dlo}`],
      preview,
      dependencies: async () => listed(dependent('DataModelObject', dmo)),
    });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(writes(events), []);
    assert.deepEqual(result.result.items[0], {
      family: 'dlo',
      identity: { dataSpace: 'default', apiName: dlo },
      operation: preview ? 'preview' : 'delete',
      outcome: 'blocked',
      mutation: 'not-attempted',
    });
    const [error] = result.diagnostics.errors;
    assert.equal(error.code, 'DLO_DEPENDENCY_EXISTS');
    assert.match(error.message, /DataModelObject X__dlm/u);
    assert.match(error.message, /Delete them first/u);
  });

test('a dependent DMO selected in the same command is deleted first; the DLO waits for an empty list', async () => {
  let reads = 0;
  const { command, events } = fixture({
    // Listed DLO first: the command still deletes the DMO before the DLO.
    metadata: [`dlo:${dlo}`, `dmo:${dmo}`],
    dependencies: async () =>
      ++reads === 1 ? listed(dependent('DataModelObject', dmo)) : listed(),
  });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(
    result.result.items.map(({ identity, outcome, mutation }) => [
      identity.apiName,
      outcome,
      mutation,
    ]),
    [
      [dmo, 'deleted', 'confirmed-deleted'],
      [dlo, 'deleted', 'confirmed-deleted'],
    ],
  );
  // One admission read before any write, then the wait after the DMO is gone.
  assert.deepEqual(events, [
    ['dependencies', dlo],
    ['delete dmo', dmo],
    ['dependencies', dlo],
    ['delete dlo', id],
  ]);
});

test('preview checks a covered dependent once and plans DMO then DLO without writes', async () => {
  const { command, events } = fixture({
    metadata: [`dlo:${dlo}`, `dmo:${dmo}`],
    preview: true,
    dependencies: async () => listed(dependent('DataModelObject', dmo)),
  });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(
    result.result.items.map(({ identity, outcome }) => [identity.apiName, outcome]),
    [
      [dmo, 'delete'],
      [dlo, 'delete'],
    ],
  );
  assert.deepEqual(events, [['dependencies', dlo]]);
});

test('a dependent DMO is covered when every mapping between it and the DLO is selected', async () => {
  let reads = 0;
  const { command, events } = fixture({
    metadata: [`dlo:${dlo}`, 'mapping:First_1', 'mapping:Second_2'],
    mappings: ['First_1', 'Second_2'],
    dependencies: async () =>
      ++reads === 1 ? listed(dependent('DataModelObject', dmo)) : listed(),
  });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(
    result.result.items.map(({ identity }) => identity.apiName),
    ['First_1', 'Second_2', dlo],
  );
  assert.deepEqual(events, [
    ['dependencies', dlo],
    ['list mappings', dmo, dlo],
    ['delete mapping', 'First_1'],
    ['delete mapping', 'Second_2'],
    ['dependencies', dlo],
    ['delete dlo', id],
  ]);
});

for (const [label, mappings] of [
  ['only some mappings are selected', ['First_1', 'Other_3']],
  ['no mapping is listed', []],
])
  test(`a dependent DMO stays uncovered when ${label}`, async () => {
    const { command, events } = fixture({
      metadata: [`dlo:${dlo}`, 'mapping:First_1'],
      mappings,
      dependencies: async () => listed(dependent('DataModelObject', dmo)),
    });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCY_EXISTS');
    assert.deepEqual(
      events.filter(([event]) => event === 'delete dlo'),
      [],
    );
  });

test('a covered dependent that never clears is DLO_DEPENDENCY_PENDING, never deleted', async () => {
  const { command, events } = fixture({
    metadata: [`dmo:${dmo}`, `dlo:${dlo}`],
    dependencies: async () => listed(dependent('DataModelObject', dmo)),
  });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items[1].outcome, 'blocked');
  assert.equal(result.result.items[1].mutation, 'not-attempted');
  assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCY_PENDING');
  // One admission read, then six bounded waits.
  assert.equal(events.filter(([event]) => event === 'dependencies').length, 7);
  assert.deepEqual(writes(events), [['delete dmo', dmo]]);
});

for (const malformed of [
  undefined,
  {},
  { dependencies: 'none' },
  { dependencies: [{ componentType: 'DataModelObject' }] },
  { dependencies: [{ componentType: 1, name: dmo }] },
])
  test(`malformed dependency list ${JSON.stringify(malformed)} is DLO_DEPENDENCIES_UNCONFIRMED`, async () => {
    const { command, events } = fixture({
      metadata: [`dlo:${dlo}`],
      dependencies: async () => malformed,
    });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.result.items[0].mutation, 'not-attempted');
    assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCIES_UNCONFIRMED');
    assert.deepEqual(writes(events), []);
  });

for (const [status, mutation] of [
  [412, 'rejected'],
  [400, 'rejected'],
  [500, 'unknown'],
])
  test(`DLO DELETE answered with HTTP ${status} reports mutation ${mutation}`, async () => {
    const { command, events } = fixture({
      metadata: [`dlo:${dlo}`, 'dlo:Later__dll'],
      dependencies: async () => listed(),
      remove: async () => {
        throw new DloError('DLO_HTTP_ERROR', status);
      },
    });
    const result = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(result.result.items.length, 1);
    assert.equal(result.result.items[0].outcome, 'failed');
    assert.equal(result.result.items[0].mutation, mutation);
    assert.equal(result.diagnostics.errors[0].code, 'DLO_HTTP_ERROR');
    assert.deepEqual(writes(events), [['delete dlo', id]]);
  });

test('a DELETE failing without an HTTP status stays unknown', async () => {
  const { command } = fixture({
    metadata: [`dlo:${dlo}`],
    dependencies: async () => listed(),
    remove: async () => {
      throw new DloError('DLO_HTTP_ERROR');
    },
  });
  const result = await run(command);
  assert.equal(result.result.items[0].mutation, 'unknown');
});

for (const componentType of ['DataStream', 'CalculatedInsight'])
  test(`a ${componentType} dependent is never covered by the selection`, async () => {
    const { command, events } = fixture({
      metadata: [`dlo:${dlo}`, `dmo:${dmo}`, 'mapping:First_1'],
      mappings: ['First_1'],
      dependencies: async () => listed(dependent(componentType, dmo)),
    });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCY_EXISTS');
    assert.match(result.diagnostics.errors[0].message, new RegExp(`${componentType} X__dlm`, 'u'));
    assert.deepEqual(
      events.filter(([event]) => event === 'delete dlo' || event === 'list mappings'),
      [],
    );
  });

test('an uncovered dependent of a later DLO blocks the whole command before any write', async () => {
  const { command, events } = fixture({
    metadata: ['dmo:Other__dlm', `dlo:${dlo}`],
    dependencies: async () => listed(dependent('DataModelObject', dmo)),
  });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(writes(events), []);
  assert.deepEqual(result.result.items, [
    {
      family: 'dlo',
      identity: { dataSpace: 'default', apiName: dlo },
      operation: 'delete',
      outcome: 'blocked',
      mutation: 'not-attempted',
    },
  ]);
  assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCY_EXISTS');
});

test('mapping coverage is decided before the mappings are deleted; the DLO waits for the list to clear', async () => {
  let reads = 0;
  let removed = false;
  const { command, events } = fixture({
    metadata: [`dlo:${dlo}`, 'mapping:First_1'],
    // Salesforce no longer lists the mapping once it is deleted.
    mappings: () => (removed ? [] : ['First_1']),
    // The dependency list still shows the DMO for one read after the mapping is gone.
    dependencies: async () => (++reads <= 2 ? listed(dependent('DataModelObject', dmo)) : listed()),
  });
  const deleteMapping = command.deleteMapping;
  command.deleteMapping = async (name) => {
    await deleteMapping(name);
    removed = true;
  };
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(events, [
    ['dependencies', dlo],
    ['list mappings', dmo, dlo],
    ['delete mapping', 'First_1'],
    ['dependencies', dlo],
    ['dependencies', dlo],
    ['delete dlo', id],
  ]);
});

test('a dependent that appears while waiting refuses the DLO without its DELETE', async () => {
  let reads = 0;
  const { command, events } = fixture({
    metadata: [`dlo:${dlo}`, `dmo:${dmo}`],
    dependencies: async () =>
      ++reads === 1
        ? listed(dependent('DataModelObject', dmo))
        : listed(dependent('DataModelObject', dmo), dependent('DataStream', 'Late_Stream')),
  });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(writes(events), [['delete dmo', dmo]]);
  assert.deepEqual(
    result.result.items.map(({ identity, outcome, mutation }) => [
      identity.apiName,
      outcome,
      mutation,
    ]),
    [
      [dmo, 'deleted', 'confirmed-deleted'],
      [dlo, 'blocked', 'not-attempted'],
    ],
  );
  assert.equal(result.diagnostics.errors[0].code, 'DLO_DEPENDENCY_EXISTS');
  assert.match(result.diagnostics.errors[0].message, /DataStream Late_Stream/u);
  assert.doesNotMatch(result.diagnostics.errors[0].message, /DataModelObject/u);
});

test('an absent DLO stays unchanged and does not stop the other selections', async () => {
  for (const preview of [true, false]) {
    const events = [];
    const command = Object.create(Delete.prototype);
    command.parse = async () => ({
      flags: {
        metadata: ['dlo:Absent__dll', `dlo:${dlo}`],
        preview,
        'api-version': '68.0',
        'data-space': 'default',
      },
    });
    command.jsonEnabled = () => true;
    command.resolveTarget = async () => 'target';
    command.retrieveDlo = retrieveNativeDlo;
    command.deleteDlo = deleteNativeDlo;
    let deleted = false;
    command.createDloNativeDeleteClient = () => ({
      get: async (name) => {
        if (name === 'Absent__dll' || deleted) throw new DloError('DLO_HTTP_ERROR', 404);
        return structuredClone(runtime);
      },
      delete: async (target) => {
        events.push(['delete dlo', target]);
        deleted = true;
      },
      dependencies: async (name) => {
        events.push(['dependencies', name]);
        if (name === 'Absent__dll') throw new DloError('DLO_HTTP_ERROR', 404);
        return listed();
      },
    });
    command.createMappingSender = () => ({ request: async () => assert.fail('no mapping read') });
    const before = process.exitCode;
    let result;
    try {
      result = await command.run();
    } finally {
      process.exitCode = before;
    }
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(
      result.result.items.map((item) => [item.identity.apiName, item.outcome]),
      [
        ['Absent__dll', 'unchanged'],
        [dlo, preview ? 'delete' : 'deleted'],
      ],
    );
    assert.deepEqual(
      events.filter(([kind]) => kind === 'delete dlo'),
      preview ? [] : [['delete dlo', id]],
    );
  }
});
