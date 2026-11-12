import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeNativeRelationshipDocument } from '../lib/artifacts/write-native-relationship.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { NativeRelationshipError } from '../lib/artifacts/native-relationship-document.js';

const spec = {
  sourceObjectName: 'A__dlm',
  sourceFieldName: 'BRef__c',
  targetObjectName: 'B__dlm',
  targetFieldName: 'Id__c',
  cardinality: 'ManyToOne',
  relationshipOwner: 'DataCloud',
};
const name = 'A_BRef_map_B_Id_1';
const relationship = {
  schemaVersion: 1,
  kind: 'relationship',
  identity: { apiName: name, dataSpace: 'default' },
  spec,
};
const dmo = {
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'A__dlm' },
  spec: {
    label: 'A',
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
};
/**
 * One list entry in the live API68 shape.
 * @param {object} [overrides] Changed values.
 * @returns {object} Native entry.
 */
const wire = (overrides = {}) => {
  const value = { ...spec, name, status: 'ACTIVE', ...overrides };
  return {
    cardinality: value.cardinality,
    name: value.name,
    owner: value.relationshipOwner,
    status: value.status,
    sourceField: { name: value.sourceFieldName },
    sourceObject: { name: value.sourceObjectName },
    targetField: { name: value.targetFieldName },
    targetObject: { name: value.targetObjectName },
  };
};
/**
 * A fake relationship transport over a mutable inventory.
 * @param {object[]} entries Initial entries.
 * @returns {object} Client with a call ledger.
 */
const fakeClient = (entries) => {
  const client = {
    calls: [],
    state: [...entries],
    list: async (dmoName, offset) => {
      client.calls.push(`list:${dmoName}:${offset}`);
      return client.state.length === 0
        ? undefined
        : { relationships: client.state, totalSize: client.state.length };
    },
    create: async (body) => {
      client.calls.push(`create:${body.sourceObjectName}`);
      client.state.push(wire({ name: 'Generated_9' }));
    },
    remove: async (relationshipName) => {
      client.calls.push(`remove:${relationshipName}`);
      client.state = client.state.filter((entry) => entry.name !== relationshipName);
    },
  };
  return client;
};
const run = async (command) => {
  const prior = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = prior;
  }
};

/**
 * A deploy command over real admitted files and a fake relationship transport.
 * @param {object} options Scenario controls.
 * @returns {Promise<object>} Command, client and call ledger.
 */
async function deployFixture(options = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'relationship-deploy-'));
  await writeNativeRelationshipDocument(relationship, cwd, false);
  const metadata = [`relationship:${name}`];
  if (options.withDmo) {
    await writeNativeDmoDocument(dmo, cwd, false);
    metadata.push('dmo:A__dlm');
  }
  const inputs = await readDeployInputs({ cwd, metadata });
  const client = fakeClient(options.entries ?? []);
  const order = [];
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'data-space': 'default',
      preview: options.preview ?? false,
      'target-org': 'target',
      metadata,
    },
  });
  command.jsonEnabled = () => true;
  // Present the relationship first: the command must still order the DMO before it.
  command.resolveInputs = async () => inputs.toReversed();
  command.resolveTargetOrg = async () => ({ getOrgId: () => 'org', getUsername: () => 'target' });
  command.createSsotSender = () => ({
    request: async () => assert.fail('the fake transport never reaches the bound sender'),
  });
  command.createDloClient = command.createDmoClient = () => ({});
  command.preflightNativeDmo = async () => {
    order.push('dmo');
    return {
      family: 'dmo',
      outcome: options.dmoOutcome ?? 'noop',
      target: 'existing',
      absenceProof: 'none',
      diagnostics: [],
    };
  };
  command.createRelationshipClient = (target, version, runner, scope) => {
    assert.deepEqual([target, version, runner, scope], ['target', '68.0', undefined, undefined]);
    order.push('relationship');
    return client;
  };
  return { command, client, order };
}

test('deploy preview orders DMOs before relationships and stays read-only', async () => {
  const { command, client, order } = await deployFixture({ preview: true, withDmo: true });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(order, ['dmo', 'relationship']);
  assert.deepEqual(client.calls, ['list:A__dlm:0']);
  const item = result.result.items.at(-1);
  assert.deepEqual(
    [item.family, item.outcome, item.target, item.operation],
    ['relationship', 'create', 'absent', 'preview'],
  );
});

test('deploy preview reports planned dependencies when the source DMO is created', async () => {
  const { command, client } = await deployFixture({
    preview: true,
    withDmo: true,
    dmoOutcome: 'create',
  });
  const result = await run(command);
  assert.equal(result.result.items.at(-1).outcome, 'planned-dependencies');
  assert.deepEqual(client.calls, []);
});

test('deploy creates an absent relationship once and confirms it ACTIVE', async () => {
  const { command, client } = await deployFixture();
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(client.calls, ['list:A__dlm:0', 'create:A__dlm', 'list:A__dlm:0']);
  const item = result.result.items[0];
  assert.deepEqual(
    [item.family, item.outcome, item.mutation, item.targetApiName],
    ['relationship', 'created', 'confirmed-created', 'Generated_9'],
  );
});

test('deploy leaves a present relationship unchanged and refuses a changed one', async () => {
  const present = await deployFixture({ entries: [wire({ name: 'Org_1' })] });
  const unchanged = await run(present.command);
  assert.equal(unchanged.status, 'success');
  assert.deepEqual(
    [unchanged.result.items[0].outcome, unchanged.result.items[0].mutation],
    ['unchanged', 'not-attempted'],
  );
  const changed = await deployFixture({ entries: [wire({ cardinality: 'OneToOne' })] });
  const refused = await run(changed.command);
  assert.equal(refused.status, 'blocked');
  assert.equal(refused.result.items[0].diagnostics[0].code, 'RELATIONSHIP_CHANGE_UNSUPPORTED');
  assert.ok(!changed.client.calls.some((call) => call.startsWith('create')));
});

/**
 * A delete command run in a project directory holding the relationship file.
 * @param {object} options Scenario controls.
 * @returns {Promise<object>} Command, client and call order.
 */
async function deleteFixture(options = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'relationship-delete-'));
  if (options.file !== false) await writeNativeRelationshipDocument(relationship, cwd, false);
  const client = fakeClient(options.entries ?? [wire()]);
  const order = [];
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({
    flags: {
      metadata: options.metadata ?? [`relationship:${name}`],
      preview: options.preview ?? false,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveTarget = async () => 'target';
  command.createRelationshipSender = () => ({
    request: async () => assert.fail('the fake transport never reaches the bound sender'),
  });
  command.createRelationshipClient = () => {
    order.push('relationship');
    return client;
  };
  command.createMappingSender = () => ({});
  command.createMappingClient = () => ({ remove: async () => {} });
  command.createDmoNativeDeleteClient = () => ({});
  command.deleteMapping = async () => {
    order.push('mapping');
  };
  return { command, client, order, cwd };
}

/**
 * Run a command with the project directory as the working directory.
 * @param {object} fixture Delete fixture.
 * @returns {Promise<object>} Envelope.
 */
async function inProject(fixture) {
  const before = process.cwd();
  process.chdir(fixture.cwd);
  try {
    return await run(fixture.command);
  } finally {
    process.chdir(before);
  }
}

test('delete refuses a relationship without its local file and names the expected path', async () => {
  const fixture = await deleteFixture({ file: false });
  const result = await inProject(fixture);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'RELATIONSHIP_FILE_REQUIRED');
  assert.ok(
    result.diagnostics.errors[0].message.includes(
      path.join(fixture.cwd, 'data360', 'relationship', `${name}.relationship-meta.json`),
    ),
  );
  assert.deepEqual(fixture.client.calls, []);
});

test('delete is unchanged when the relationship is absent and previews read-only', async () => {
  const absent = await deleteFixture({ entries: [] });
  const result = await inProject(absent);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    [result.result.items[0].outcome, result.result.items[0].mutation],
    ['unchanged', 'not-attempted'],
  );
  assert.deepEqual(absent.client.calls, ['list:A__dlm:0']);
  const preview = await deleteFixture({ preview: true });
  const planned = await inProject(preview);
  assert.equal(planned.result.items[0].outcome, 'delete');
  assert.deepEqual(preview.client.calls, ['list:A__dlm:0']);
});

test('delete sends one DELETE, confirms absence and runs before mappings', async () => {
  const fixture = await deleteFixture({ metadata: ['mapping:Map_1', `relationship:${name}`] });
  const result = await inProject(fixture);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(fixture.order, ['relationship', 'mapping']);
  assert.deepEqual(fixture.client.calls, ['list:A__dlm:0', `remove:${name}`, 'list:A__dlm:0']);
  assert.deepEqual(
    [result.result.items[0].outcome, result.result.items[0].mutation],
    ['deleted', 'confirmed-deleted'],
  );
});

test('a 4xx answer to the DELETE is a rejected mutation and stops the batch', async () => {
  const fixture = await deleteFixture({ metadata: [`relationship:${name}`, 'mapping:Map_1'] });
  fixture.client.remove = async () => {
    fixture.client.calls.push('remove');
    throw new NativeRelationshipError('RELATIONSHIP_HTTP_ERROR', 400);
  };
  const result = await inProject(fixture);
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    [result.result.items[0].outcome, result.result.items[0].mutation],
    ['failed', 'rejected'],
  );
  assert.equal(result.diagnostics.errors[0].code, 'RELATIONSHIP_HTTP_ERROR');
  assert.deepEqual(fixture.order, ['relationship']);
});
