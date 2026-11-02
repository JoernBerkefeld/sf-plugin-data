import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';

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

const guard = async () => {
  throw new NativeMappingError('MAPPING_LAST_MAPPING_DELETE_BLOCKED');
};

for (const preview of [true, false]) {
  test(`public mapping delete exact canonical selection preview=${preview} has zero preview writes`, async () => {
    const command = invocation({
      preview,
      metadata: ['mapping:Generated_123', 'mapping:Generated_123'],
    });
    let writes = 0;
    let preflights = 0;
    command.createMappingClient = (target, version) => {
      assert.equal(target, 'target');
      assert.equal(version, '68.0');
      return {
        delete: async (name) => {
          assert.equal(name, 'Generated_123');
          writes++;
        },
      };
    };
    command.preflightDeleteMapping = async (name, _client, deps) => {
      assert.equal(name, 'Generated_123');
      assert.equal(typeof deps.source.get, 'function');
      assert.equal(typeof deps.target.get, 'function');
      preflights++;
    };
    command.deleteMapping = async (name, client) => {
      await client.delete(name);
    };
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.result.items.length, 1);
    assert.equal(writes, preview ? 0 : 1);
    assert.equal(preflights, preview ? 1 : 0);
    assert.equal(result.result.items[0].mutation, preview ? 'not-attempted' : 'confirmed-deleted');
  });
  test(`public last mapping delete blocks preview/execution without dispatch preview=${preview}`, async () => {
    const command = invocation({ preview });
    let writes = 0;
    command.createMappingClient = () => ({
      delete: async () => {
        writes++;
      },
    });
    command.preflightDeleteMapping = command.deleteMapping = guard;
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'MAPPING_LAST_MAPPING_DELETE_BLOCKED');
    assert.equal(writes, 0);
  });
}

for (const selector of ['dlo:Source__dll', 'dmo:Target__dlm', 'mapping:Generated_123']) {
  for (const preview of [true, false]) {
    test(`public delete human output preserves ${selector} preview=${preview}`, async () => {
      const command = invocation({ metadata: [selector], preview });
      const lines = [];
      let writes = 0;
      command.jsonEnabled = () => false;
      command.log = (line) => lines.push(line);
      command.createDloClient =
        command.createDmoClient =
        command.createMappingClient =
          () => ({
            get: async () => ({}),
            delete: async () => {
              writes++;
            },
          });
      command.retrieveDlo = command.retrieveDmo = command.preflightDeleteMapping = async () => ({});
      command.deleteDlo =
        command.deleteDmo =
        command.deleteMapping =
          async (name, client) => client.delete(name);
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(writes, preview ? 0 : 1);
      assert.deepEqual(lines, [
        `Delete${preview ? ' preview' : ''}: success.`,
        `${selector}: ${preview ? 'delete' : 'deleted'}; mutation: ${preview ? 'not-attempted' : 'confirmed-deleted'}.`,
      ]);
      assert.deepEqual(result.result.items[0].identity, {
        dataSpace: 'default',
        apiName: selector.slice(selector.indexOf(':') + 1),
      });
    });
  }
}

test('public delete rejects type-wide, malformed selectors and unqualified mapping versions before auth', async () => {
  for (const flags of [
    { metadata: ['mapping'] },
    { metadata: ['mapping:'] },
    { metadata: ['mapping:../escape'] },
    { metadata: ['dlo'] },
    { metadata: ['dmo'] },
    { 'api-version': '67.0' },
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
});

test('public mapping deletion dispatch failure is unknown and stops the batch without retry', async () => {
  const command = invocation({ metadata: ['mapping:Generated_123', 'mapping:Other_456'] });
  let writes = 0;
  command.createMappingClient = () => ({
    delete: async () => {
      writes++;
      throw new Error('response lost');
    },
  });
  command.deleteMapping = async (name, client) => client.delete(name);
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items.length, 1);
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.equal(writes, 1);
});
