import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { listNativeNames, listNativeMappingNames } from '../lib/services/select-native-retrieve.js';
import { createMappingInventoryReader } from '../lib/transport/mapping-rest.js';
import Retrieve from '../lib/commands/data360/retrieve.js';

const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};
const retrieve = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const calls = [];
  const flags = {
    metadata: ['calculated-insight:SyntheticInsight__cio'],
    'api-version': 'auto',
    dataspace: 'default',
    'target-org': 'synthetic',
    overwrite: false,
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const connection = { getApiVersion: () => '68.0' };
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic',
    getConnection: (pin) => {
      assert.equal(pin, '68.0');
      return connection;
    },
  });
  return { command, calls };
};
for (const family of ['dlo', 'dmo', 'mapping'])
  for (const status of [429, 503])
    for (const retryAfter of ['31', 'private-invalid'])
      for (const json of [false, true])
        test(`native ${family} inventory HTTP${status} ${retryAfter} in ${json ? 'JSON' : 'human'} output`, async () => {
          const h = retrieve({ metadata: [family], 'api-version': '68.0' });
          const output = [];
          const requests = [];
          h.command.listNativeNames = listNativeNames;
          h.command.listNativeMappingNames = listNativeMappingNames;
          h.command.createMappingInventoryReader = createMappingInventoryReader;
          let writes = 0;
          h.command.jsonEnabled = () => json;
          h.command.log = (line) => output.push(line);
          const connection = Object.assign(Object.create(Connection.prototype), {
            instanceUrl: 'https://synthetic.my.salesforce.com',
            version: '68.0',
            accessToken: 'private-token',
            logger: { getRawLogger: () => ({ debug() {} }) },
            _propagators: [],
            _refreshDelegate: {
              isRefreshing: () => assert.fail('no refresh'),
              refresh: () => assert.fail('no refresh'),
            },
            _transport: {
              httpRequest(request, options) {
                requests.push(request);
                assert.equal(options.retry.maxRetries, 0);
                const inventory = family === 'mapping' && requests.length === 1;
                const pending = Promise.resolve({
                  statusCode: inventory ? 200 : status,
                  headers: {
                    'retry-after': retryAfter,
                    'content-type': 'application/json',
                    authorization: 'private-header',
                  },
                  body: JSON.stringify(
                    inventory
                      ? { dataModelObject: [{ name: 'Synthetic__dlm', dataSpaceName: 'default' }] }
                      : [{ errorCode: 'INTERNAL_ERROR', message: 'Bearer private-body <html>' }],
                  ),
                });
                pending.stream = () => new PassThrough();
                return pending;
              },
            },
          });
          h.command.resolveOrg = async () => ({
            getOrgId: () => 'synthetic',
            getConnection: (pin) => {
              assert.equal(pin, '68.0');
              return connection;
            },
          });
          for (const method of ['writeDlo', 'writeNativeDmo', 'writeNativeMapping'])
            h.command[method] = async () => {
              writes++;
              assert.fail('inventory failure must not write files');
            };
          const result = await run(h.command);
          assert.equal(result.status, 'blocked');
          assert.deepEqual(result.result.items, []);
          assert.equal(result.diagnostics.errors.length, 1);
          assert.equal(result.diagnostics.errors[0].code, 'NATIVE_INVENTORY_FAILED');
          assert.equal(result.diagnostics.errors[0].retryable, false);
          const message = json ? JSON.stringify(result) : output.join('\n');
          assert.match(
            message,
            status === 429 ? /429 Too Many Requests/u : /503.*POSSIBLE Connect rate limit/u,
          );
          if (retryAfter === '31') assert.match(message, /Server Retry-After: 31/u);
          else assert.doesNotMatch(message, /Server Retry-After/u);
          assert.doesNotMatch(
            JSON.stringify(result) + output.join('\n'),
            /private-|Bearer|<html>/u,
          );
          if (json) assert.deepEqual(output, []);
          else assert.equal(output.filter((line) => line.includes(`HTTP ${status}`)).length, 1);
          // The failing GET is tried three times by the transport before the command reports it.
          assert.equal(requests.length, family === 'mapping' ? 4 : 3);
          if (family === 'mapping') assert.match(requests[1].url, /data-model-object-mappings/u);
          assert.equal(writes, 0);
        });
