import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { Org, Connection } from '@salesforce/core';
import { PassThrough } from 'node:stream';
import { ConnectClient, ConnectError } from '../lib/transport/connect-client.js';

const origin = 'https://synthetic.my.salesforce.com';
const path = '/services/data/v65.0/ssot/data-model-objects';

const latest = { requested: 'latest', restSelector: 'latest', soapNumeric: '65.0' };

test('latest detail uses literal REST alias while preserving numeric SOAP evidence', async () => {
  const calls = [];
  const selection = { ...latest };
  const client = new ConnectClient(
    {
      instanceUrl: origin,
      request: async (request) => {
        calls.push(request);
        return { name: 'Synthetic__dlm' };
      },
    },
    selection,
  );
  selection.restSelector = 'v65.0';
  await client.get('/services/data/latest/ssot/data-model-objects/Synthetic__dlm');
  assert.equal(
    calls[0].url,
    `${origin}/services/data/latest/ssot/data-model-objects/Synthetic__dlm`,
  );
});

test('latest rejects prefix switching and unsafe paths before network access', async () => {
  const client = new ConnectClient(
    { instanceUrl: origin, request: () => assert.fail('Unexpected request') },
    latest,
  );
  for (const route of [
    '/services/data/vlatest/ssot/data-model-objects',
    path,
    '/services/data/latest/ssot/data-model-objects/%2e%2e/secret',
    '/services/data/latest/ssot/data-model-objects/%252fsecret',
    'https://hostile.test/services/data/latest/ssot/data-model-objects',
  ])
    await assert.rejects(client.get(route), ConnectError);
});

test('inconsistent version selections cannot forge a numeric mutation capability', () => {
  const connection = { instanceUrl: origin, request: () => assert.fail('Unexpected request') };
  for (const selection of [
    { ...latest, soapNumeric: 'latest' },
    { ...latest, restSelector: 'v65.0' },
    { requested: '65.0', restSelector: 'latest', soapNumeric: '65.0' },
    { requested: '65.0', restSelector: 'v65.0', soapNumeric: '68.0' },
    { ...latest, restSelector: 'latest/../v65.0' },
  ])
    assert.throws(() => new ConnectClient(connection, selection), ConnectError);
});

test('latest rejects POST and PATCH without requests even with numeric API65 evidence', async () => {
  let calls = 0;
  const client = new ConnectClient(
    {
      instanceUrl: origin,
      request: async () => {
        calls += 1;
      },
    },
    latest,
  );
  await assert.rejects(client.createDataModelObject({}), ConnectError);
  await assert.rejects(client.patchDataModelObject('Synthetic__dlm', {}), ConnectError);
  assert.equal(calls, 0);
});

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

const authored = {
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Synthetic__dlm' },
  spec: {
    label: 'Synthetic',
    category: 'Other',
    fields: [
      { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, isDynamicLookup: false },
    ],
  },
};

test('guarded create refuses invalid payload/version before any request', async () => {
  const connection = { instanceUrl: origin, request: async () => assert.fail('no request') };
  await assert.rejects(new ConnectClient(connection, '66.0').createDataModelObject(authored), {
    code: 'INVALID_REQUEST',
  });
  await assert.rejects(new ConnectClient(connection, '65.0').createDataModelObject({}));
});

for (const [method, statusCode] of [
  ['POST', 401],
  ['PATCH', 401],
  ['PATCH', 503],
])
  test(`actual core request stack never refreshes/replays/retries guarded ${method} on ${statusCode}`, async () => {
    let requests = 0;
    const refresh = {
      isRefreshing: () => assert.fail('must not consult refresh delegate'),
      refresh: () => assert.fail('must not refresh'),
    };
    const connection = Object.create(Connection.prototype);
    Object.assign(connection, {
      instanceUrl: origin,
      version: '65.0',
      accessToken: 'synthetic-token',
      logger: { getRawLogger: () => ({ debug: () => {} }) },
      _refreshDelegate: refresh,
      _propagators: [],
      _transport: {
        httpRequest: (request, options) => {
          requests++;
          assert.equal(request.method, method);
          assert.equal(options.retry.maxRetries, 0);
          const response = Promise.resolve({
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify([
              {
                errorCode: statusCode === 401 ? 'INVALID_SESSION_ID' : 'SERVER_ERROR',
                message: 'secret',
              },
            ]),
          });
          response.stream = () => new PassThrough();
          return response;
        },
      },
    });
    let observed;
    const request = Connection.prototype.request;
    connection.request = function (...arguments_) {
      return request.apply(this, arguments_).catch((error) => {
        observed = error;
        throw error;
      });
    };
    const client = new ConnectClient(connection, '65.0');
    await assert.rejects(
      method === 'POST'
        ? client.createDataModelObject(authored)
        : client.patchDataModelObject('Synthetic__dlm', { label: 'Updated' }),
      { code: statusCode === 401 ? 'AUTHENTICATION_FAILED' : 'REQUEST_FAILED' },
    );
    assert.equal(
      observed?.name,
      statusCode === 401 ? 'INVALID_SESSION_ID' : 'SERVER_ERROR',
      String(observed),
    );
    assert.equal(requests, 1);
    assert.equal(connection._refreshDelegate, refresh);
  });

test('guarded PATCH preserves exact qualified route, method, body and untrusted response', async () => {
  const patch = { label: 'Updated', fields: [{ name: 'Id__c', label: 'Key', dataType: 'Text' }] };
  const response = { label: 'Old state' };
  const refresh = {};
  const connection = {
    instanceUrl: origin,
    _refreshDelegate: refresh,
    request: async function (request, options) {
      assert.notEqual(this, connection);
      assert.equal(this._refreshDelegate, undefined);
      assert.deepEqual(request, {
        method: 'PATCH',
        url: `${origin}${path}/Synthetic__dlm`,
        body: JSON.stringify(patch),
        headers: { 'content-type': 'application/json' },
      });
      assert.equal(options.retry.maxRetries, 0);
      return response;
    },
  };
  assert.equal(
    await new ConnectClient(connection, '65.0').patchDataModelObject('Synthetic__dlm', patch),
    response,
  );
  assert.equal(connection._refreshDelegate, refresh);
  assert.deepEqual(patch, {
    label: 'Updated',
    fields: [{ name: 'Id__c', label: 'Key', dataType: 'Text' }],
  });
});

test('guarded PATCH rejects version and route injection before any request', async () => {
  let calls = 0;
  const connection = {
    instanceUrl: origin,
    request: async () => {
      calls++;
    },
  };
  for (const name of [
    '',
    'Synthetic',
    '../Synthetic__dlm',
    'Synthetic__dlm/other',
    'Synthetic__dlm?secret',
    'Synthetic__dlm#secret',
    'Synthetic%2f__dlm',
    String.raw`Synthetic\\__dlm`,
    'Synthetic__dlm\n',
    `${origin}${path}/Synthetic__dlm`,
  ])
    await assert.rejects(new ConnectClient(connection, '65.0').patchDataModelObject(name, {}), {
      code: 'INVALID_REQUEST',
    });
  await assert.rejects(
    new ConnectClient(connection, '66.0').patchDataModelObject('Synthetic__dlm', {}),
    { code: 'INVALID_REQUEST' },
  );
  assert.equal(calls, 0);
});

test('guarded PATCH refuses same-origin and cross-origin redirects', async () => {
  for (const redirect of [`${origin}${path}/Other__dlm`, `https://other.test${path}`]) {
    let calls = 0;
    const client = new ConnectClient(
      {
        instanceUrl: origin,
        request: async (_request, options) => {
          calls++;
          options.followRedirect(redirect);
          assert.fail('redirect must throw');
        },
      },
      '65.0',
    );
    await assert.rejects(client.patchDataModelObject('Synthetic__dlm', { label: 'secret' }), {
      code: 'INVALID_REQUEST',
    });
    assert.equal(calls, 1);
  }
});

test('guarded PATCH errors discard request payload, credentials, response and causes', async () => {
  for (const [failure, code, statusCode] of [
    [{ statusCode: 401 }, 'AUTHENTICATION_FAILED', 401],
    [{ name: 'INVALID_SESSION_ID' }, 'AUTHENTICATION_FAILED', undefined],
    [{ statusCode: 403 }, 'REQUEST_FAILED', 403],
    [{ statusCode: 503 }, 'REQUEST_FAILED', 503],
    [{ statusCode: 'secret' }, 'REQUEST_FAILED', undefined],
    [new Error('secret'), 'REQUEST_FAILED', undefined],
  ]) {
    let calls = 0;
    const client = new ConnectClient(
      {
        instanceUrl: origin,
        request: async () => {
          calls++;
          throw Object.assign(failure, {
            message: 'secret',
            body: 'secret',
            accessToken: 'secret',
            cause: 'secret',
          });
        },
      },
      '65.0',
    );
    await assert.rejects(
      client.patchDataModelObject('Synthetic__dlm', { label: 'secret' }),
      (error) => {
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        assert.equal(error.cause, undefined);
        for (const text of [String(error), JSON.stringify(error), inspect(error)])
          assert.ok(!text.includes('secret'));
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test('guarded PATCH serialization errors are payload-free and never request', async () => {
  const patch = {
    toJSON() {
      throw new Error('secret');
    },
  };
  const client = new ConnectClient(
    { instanceUrl: origin, request: async () => assert.fail('no request') },
    '65.0',
  );
  await assert.rejects(client.patchDataModelObject('Synthetic__dlm', patch), (error) => {
    assert.equal(error.code, 'INVALID_REQUEST');
    assert.ok(!inspect(error).includes('secret'));
    return true;
  });
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
