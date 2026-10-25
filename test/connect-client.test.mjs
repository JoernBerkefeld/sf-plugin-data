import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { Org } from '@salesforce/core';
import { ConnectClient, ConnectError } from '../lib/transport/connect-client.js';

const origin = 'https://synthetic.my.salesforce.com';
const path = '/services/data/v65.0/ssot/data-model-objects';

test('authenticated request preserves explicit version, query and response', async () => {
  const response = { items: [{ name: 'Synthetic__dlm' }] };
  const client = new ConnectClient(
    {
      instanceUrl: origin,
      request: async (request, options) => {
        assert.deepEqual(request, { method: 'GET', url: `${origin}${path}?limit=2` });
        assert.equal(typeof options.followRedirect, 'function');
        return response;
      },
    },
    '65.0',
  );
  assert.equal(await client.get(`${path}?limit=2`), response);
  assert.equal(await client.get(`${origin}${path}?limit=2`), response);
});

test('unsafe origin, namespace, version and normalization paths never reach connection', async () => {
  let calls = 0;
  const connection = {
    instanceUrl: origin,
    request: async () => {
      calls++;
    },
  };
  for (const version of ['', 'latest', '65', '65.1', '65.0/ssot']) {
    assert.throws(() => new ConnectClient(connection, version), ConnectError);
  }
  for (const instanceUrl of [
    'http://example.test',
    'https://user:secret@example.test',
    `${origin}/other`,
    `${origin}?token=secret`,
  ]) {
    assert.throws(() => new ConnectClient({ ...connection, instanceUrl }, '65.0'), ConnectError);
  }
  const client = new ConnectClient(connection, '65.0');
  for (const unsafe of [
    'https://other.test' + path,
    '//' + 'other.test' + path,
    '/services/data/v65.0/connect/ssot/data-model-objects',
    '/services/data/v68.0/ssot/data-model-objects',
    '/services/data/v65.0/ssot/',
    `${path}/../other`,
    `${path}/./other`,
    `${path}/%2e%2e/other`,
    `${path}/%252e/other`,
    `${path}/%2fother`,
    `${path}/%5cother`,
    `${path}#secret`,
    String.raw`${path}\other`,
    `${path}//other`,
    `${path}\n`,
    `${path}\u0000`,
    `${origin.replace('https://', 'https://user:secret@')}${path}`,
    `${path}?offset=2#secret`,
    'services/data/v65.0/ssot/data-model-objects',
  ])
    await assert.rejects(client.get(unsafe), { code: 'INVALID_REQUEST' });
  assert.equal(calls, 0);
});

test('redirect is refused rather than forwarding authentication', async () => {
  const client = new ConnectClient(
    {
      instanceUrl: origin,
      request: async (_request, options) => {
        options.followRedirect('https://other.test/secret');
        assert.fail('redirect callback must throw');
      },
    },
    '65.0',
  );
  await assert.rejects(client.get(path), { code: 'INVALID_REQUEST' });
});

test('API, authentication and network errors discard all sensitive payloads and causes', async () => {
  for (const [failure, code, statusCode] of [
    [{ statusCode: 401 }, 'AUTHENTICATION_FAILED', 401],
    [{ name: 'INVALID_SESSION_ID' }, 'AUTHENTICATION_FAILED', undefined],
    [{ statusCode: 403 }, 'REQUEST_FAILED', 403],
    [{ statusCode: 500 }, 'REQUEST_FAILED', 500],
    [{ statusCode: 'secret' }, 'REQUEST_FAILED', undefined],
    [new Error('secret'), 'REQUEST_FAILED', undefined],
  ]) {
    const client = new ConnectClient(
      {
        instanceUrl: origin,
        request: async () => {
          throw Object.assign(failure, {
            body: 'secret',
            accessToken: 'secret',
            message: 'secret',
            cause: 'secret',
          });
        },
      },
      '65.0',
    );
    await assert.rejects(client.get(path), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.cause, undefined);
      assert.ok(
        ![String(error), JSON.stringify(error), inspect(error)].some((text) =>
          text.includes('secret'),
        ),
      );
      return true;
    });
  }
});

test('factory delegates org authentication and version to Salesforce core without resource calls', async (t) => {
  t.mock.method(Org, 'create', async (options) => {
    assert.deepEqual(options, { aliasOrUsername: 'synthetic-alias' });
    return {
      getConnection: (version) => {
        assert.equal(version, '65.0');
        return { instanceUrl: origin, request: async () => assert.fail('no resource request') };
      },
    };
  });
  assert.ok((await ConnectClient.create('synthetic-alias', '65.0')) instanceof ConnectClient);
});

test('factory rejects missing inputs and redacts authentication failures', async (t) => {
  t.mock.method(Org, 'create', async () => {
    throw new Error('secret refresh token');
  });
  await assert.rejects(ConnectClient.create('', '65.0'), { code: 'INVALID_REQUEST' });
  await assert.rejects(ConnectClient.create('alias', 'latest'), { code: 'INVALID_REQUEST' });
  await assert.rejects(ConnectClient.create('alias', '65.0'), (error) => {
    assert.equal(error.code, 'AUTHENTICATION_FAILED');
    assert.ok(!inspect(error).includes('secret'));
    return true;
  });
});
