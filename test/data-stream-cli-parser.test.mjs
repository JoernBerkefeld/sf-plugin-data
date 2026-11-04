import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createDataStreamClient } from '../lib/transport/data-stream-rest.js';

const cliRoot =
  process.env.SF_DATA_TEST_CLI_ROOT ??
  path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@salesforce', 'cli');
const restFile = path.join(
  cliRoot,
  'node_modules/@salesforce/plugin-api/lib/commands/api/request/rest.js',
);

test(
  'installed CLI parses production DELETE files into genuinely absent HTTP bodies without wire access',
  { skip: !existsSync(restFile) && 'installed Salesforce CLI unavailable' },
  async () => {
    const restUrl = pathToFileURL(restFile).href;
    const sharedUrl = new URL('../../../shared/shared.js', restUrl).href;
    const captureKey = 'sf-plugin-data-zero-wire-delete';
    const captured = [];
    // Replace only the final network sender: real oclif parsing and Rest.run remain installed code.
    globalThis[Symbol.for(captureKey)] = async (request) => {
      captured.push(request);
      return { statusCode: 204, headers: {}, body: '' };
    };
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (context.parentURL === restUrl && specifier === '../../../shared/shared.js') {
          const source = `export { includeFlag, streamToFileFlag } from ${JSON.stringify(sharedUrl)};
export const sendAndPrintRequest = (request) => globalThis[Symbol.for(${JSON.stringify(captureKey)})](request);`;
          return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    try {
      const { Rest, getBodyContents } = await import(restUrl);
      const coreUrl = pathToFileURL(path.join(cliRoot, 'node_modules/@oclif/core/lib/index.js'));
      const { Parser, Flags } = await import(coreUrl.href);
      let refreshes = 0;
      const org = {
        getField: () => 'https://zero-wire.invalid',
        refreshAuth: async () => {
          refreshes++;
        },
        getConnection: () => ({ getConnectionOptions: () => ({ accessToken: 'synthetic' }) }),
      };
      assert.throws(() => getBodyContents(), /No 'mode'/u);
      assert.equal(getBodyContents({ mode: 'raw' }), undefined);
      assert.equal(getBodyContents({ mode: 'raw', raw: '' }), '""');
      const receipts = [
        { stdout: 'HTTP/1.1 204 No Content\r\n\r\n', exitCode: 0 },
        { stdout: 'HTTP/1.1 204 No Content\n\n', exitCode: 0 },
        { stdout: 'not an HTTP receipt', exitCode: 0 },
        { stdout: 'HTTP/1.1 200 OK\n\n', exitCode: 0 },
        { stdout: 'HTTP/1.1 204 No Content\n\n{}', exitCode: 0 },
        { stdout: 'HTTP/1.1 204 No Content\n\n', exitCode: 1 },
        { stdout: 'HTTP/1.1 403 Forbidden\n\n', exitCode: 0 },
      ];
      let attempts = 0;
      let runnerError;
      const client = createDataStreamClient(
        'zero-wire',
        { get: async () => assert.fail('no reads') },
        '68.0',
        async (arguments_) => {
          try {
            const receipt = receipts[attempts++];
            assert.deepEqual(arguments_.slice(0, 3), ['api', 'request', 'rest']);
            assert.equal(arguments_.includes('--body'), false);
            assert.equal(arguments_.includes('--header'), false);
            const parsed = await Parser.parse(arguments_.slice(3), {
              args: Rest.args,
              // Only org resolution is synthetic; all other installed flag definitions are real.
              flags: { ...Rest.flags, 'target-org': Flags.string({ required: true }) },
            });
            assert.equal(parsed.flags['target-org'], 'zero-wire');
            const descriptor = JSON.parse(await readFile(parsed.flags.file, 'utf8'));
            assert.deepEqual(descriptor.body, { mode: 'raw' });
            assert.equal(Object.hasOwn(descriptor.body, 'raw'), false);
            const result = await Rest.prototype.run.call({
              parse: async () => ({ ...parsed, flags: { ...parsed.flags, 'target-org': org } }),
            });
            assert.equal(result.statusCode, 204);
            const request = captured.at(-1);
            assert.equal(request.options.method, 'DELETE');
            assert.equal(request.options.body, undefined);
            assert.equal(Object.hasOwn(descriptor, 'header'), false);
            assert.equal(request.include, true);
            assert.equal(request.url.host, 'zero-wire.invalid');
            return receipt;
          } catch (error) {
            runnerError = error;
            throw error;
          }
        },
      );
      const id = '1ds000000000001AAA';
      try {
        await client.delete(id, false);
      } catch (error) {
        throw runnerError ?? error;
      }
      await client.delete(id, true);
      for (let index = 2; index < receipts.length; index++) {
        await assert.rejects(client.delete(id, false));
        assert.equal(runnerError, undefined, 'installed parsing/request assertions must pass');
        assert.equal(attempts, index + 1, 'one attempt only, no retry/fallback');
      }
      assert.equal(captured.length, receipts.length);
      assert.equal(refreshes, receipts.length);
      assert.equal(
        captured[0].url.pathname + captured[0].url.search,
        `/services/data/v68.0/ssot/data-streams/${id}?shouldDeleteDataLakeObject=false`,
      );
      assert.equal(captured[1].url.search, '?shouldDeleteDataLakeObject=true');
      await assert.rejects(client.delete('malformed', false));
      await assert.rejects(client.delete(id, undefined));
      assert.equal(attempts, receipts.length);
    } finally {
      hooks.deregister();
      delete globalThis[Symbol.for(captureKey)];
    }
  },
);
