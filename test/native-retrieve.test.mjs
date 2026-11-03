import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { nativeApiVersion } from '../lib/transport/api-version.js';
import { listNativeNames, listNativeMappingNames } from '../lib/services/select-native-retrieve.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import {
  createMappingClient,
  createMappingInventoryReader,
} from '../lib/transport/mapping-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { readFile } from 'node:fs/promises';
import { Connection } from '@salesforce/core';
import { PassThrough } from 'node:stream';

const mapping = (name = 'Map') => ({
  developerName: name,
  sourceEntityDeveloperName: 'Source__dll',
  targetEntityDeveloperName: 'Target__dlm',
  fieldMappings: [
    {
      sourceFieldDeveloperName: 'Id__c',
      targetFieldDeveloperName: 'Id__c',
      developerName: 'Observed',
    },
  ],
});
const connection = (request) => ({ instanceUrl: 'https://synthetic.example', request });

test('native versions default/auto to68, preserve >=61 and reject old/malformed/latest before calls', async () => {
  assert.equal(nativeApiVersion(), '68.0');
  assert.equal(nativeApiVersion('auto'), '68.0');
  for (const version of ['61.0', '65.0', '68.0', '99.0']) {
    assert.equal(nativeApiVersion(version), version);
    for (const factory of [createDloClient, createDmoClient, createMappingClient]) {
      const client = factory('synthetic', version, async (arguments_) => {
        assert.ok(arguments_[3].startsWith(`/services/data/v${version}/ssot/`));
        return { exitCode: 0, stdout: 'HTTP/1.1 200\n{}' };
      });
      await client.get(
        factory === createMappingClient
          ? 'Map'
          : factory === createDloClient
            ? 'Source__dll'
            : 'Target__dlm',
      );
    }
  }
  for (const version of ['60.0', '59.0', 'latest', '61', 'v68.0', '68.1'])
    for (const factory of [createDloClient, createDmoClient, createMappingClient])
      assert.throws(() => factory('synthetic', version, () => assert.fail('no call')));
});

test('DMO inventory paginates documented offsets, includes standard names and filters explicit spaces', async () => {
  const offsets = [];
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      return {
        dataModelObject:
          offset === 0
            ? Array.from({ length: 50 }, (_, index) => ({
                name: `ssot__Model${index}__dlm`,
                dataSpaceName: 'default',
              }))
            : [{ name: 'Other__dlm', dataSpaceName: 'other' }],
      };
    }),
    '61.0',
    'dmo',
  );
  assert.deepEqual(offsets, [0, 50]);
  assert.equal(names.length, 50);
});

const dloPageUrl = (offset) =>
  `/services/data/v68.0/ssot/data-lake-objects?limit=20&offset=${offset}&orderBy=ASC`;
const dloPage = (offset, totalSize) => ({
  currentPageUrl: dloPageUrl(offset),
  dataLakeObjects: Array.from({ length: Math.min(20, totalSize - offset) }, (_, index) => ({
    name: `Source${offset + index}__dll`,
    dataSpaceInfo: [{ name: (offset + index) % 2 === 0 ? 'default' : 'other' }],
  })),
  nextPageUrl: offset + 20 < totalSize ? dloPageUrl(offset + 20) : JSON.parse('null'),
  totalSize,
});

for (const totalSize of [0, 20, 21, 78])
  test(`DLO pagination wrapper confirms complete inventory of ${totalSize}`, async () => {
    const offsets = [];
    const names = await listNativeNames(
      connection(async ({ url }) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        return dloPage(offset, totalSize);
      }),
      '68.0',
      'dlo',
    );
    assert.deepEqual(
      offsets,
      Array.from({ length: Math.max(1, Math.ceil(totalSize / 20)) }, (_, index) => index * 20),
    );
    assert.deepEqual(
      names,
      Array.from(
        { length: Math.ceil(totalSize / 2) },
        (_, index) => `Source${index * 2}__dll`,
      ).toSorted(),
    );
  });

for (const shortOffsets of [[20, 40], [20]])
  test(`short DLO pages traverse continuations but cannot claim complete78 ${shortOffsets}`, async () => {
    const offsets = [];
    await assert.rejects(
      listNativeNames(
        connection(async ({ url }) => {
          const offset = Number(new URL(url).searchParams.get('offset'));
          offsets.push(offset);
          const page = dloPage(offset, 78);
          if (shortOffsets.includes(offset)) page.dataLakeObjects.splice(18);
          if (offset === 60) delete page.nextPageUrl;
          return page;
        }),
        '68.0',
        'dlo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
    assert.deepEqual(offsets, [0, 20, 40, 60]);
  });

for (const total of [0, 1, 20, 21, 78])
  for (const terminal of ['omitted', 'empty', 'null'])
    test(`DLO terminal ${terminal} reconciles ${total} entries before space filtering`, async () => {
      const names = await listNativeNames(
        connection(async ({ url }) => {
          const offset = Number(new URL(url).searchParams.get('offset'));
          const page = dloPage(offset, total);
          if (offset + page.dataLakeObjects.length === total) {
            if (terminal === 'omitted') delete page.nextPageUrl;
            if (terminal === 'empty') page.nextPageUrl = '';
          }
          return page;
        }),
        '68.0',
        'dlo',
      );
      assert.equal(names.length, Math.ceil(total / 2));
    });

for (const [total, field, value] of [
  [1, 'nextPageUrl', undefined],
  [1, 'nextPageUrl', false],
  [1, 'nextPageUrl', {}],
  [1, 'extra', true],
  [21, 'nextPageUrl', 'omit'],
  [1, 'currentPageUrl', 'omit'],
  [1, 'totalSize', 'omit'],
  [1, 'dataLakeObjects', 'omit'],
])
  test(`DLO terminal shape refuses ${total}/${field}/${JSON.stringify(value)}`, async () => {
    const page = dloPage(0, total);
    if (value === 'omit') delete page[field];
    else page[field] = value;
    await assert.rejects(
      listNativeNames(
        connection(async () => page),
        '68.0',
        'dlo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
  });

for (const change of [
  { dataLakeObjects: [] },
  { nextPageUrl: dloPageUrl(40) },
  { nextPageUrl: dloPageUrl(20).replace('limit=20', 'limit=10') },
  { nextPageUrl: dloPageUrl(20).replace('v68.0', 'v67.0') },
  { nextPageUrl: dloPageUrl(20).replace('ASC', 'DESC') },
  { totalSize: Number.MAX_SAFE_INTEGER + 1 },
])
  test(`DLO invalid continuation remains blocked ${JSON.stringify(change)}`, async () => {
    await assert.rejects(
      listNativeNames(
        connection(async () => ({ ...dloPage(0, 78), ...change })),
        '68.0',
        'dlo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
  });

test('short continuation does not waive contradictory terminal total checks', async () => {
  const offsets = [];
  await assert.rejects(
    listNativeNames(
      connection(async ({ url }) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        const page = dloPage(offset, 78);
        if (offset === 20) page.dataLakeObjects.splice(18);
        if (offset === 40) page.nextPageUrl = '';
        return page;
      }),
      '68.0',
      'dlo',
    ),
    { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
  );
  assert.deepEqual(offsets, [0, 20, 40]);
});

test('DLO explicit continuation at offset ceiling cannot publish partial inventory', async () => {
  let calls = 0;
  await assert.rejects(
    listNativeNames(
      connection(async ({ url }) => {
        calls++;
        return dloPage(Number(new URL(url).searchParams.get('offset')), 2040);
      }),
      '68.0',
      'dlo',
    ),
    { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
  );
  assert.equal(calls, 101);
});

test('legacy single-key DLO wrapper remains supported', async () => {
  assert.deepEqual(
    await listNativeNames(
      connection(async () => ({ dataLakeObjects: dloPage(0, 1).dataLakeObjects })),
      '68.0',
      'dlo',
    ),
    ['Source0__dll'],
  );
});

for (const change of [
  { totalSize: -1 },
  { totalSize: '21' },
  { totalSize: 1.5 },
  { currentPageUrl: dloPageUrl(20) },
  { nextPageUrl: 'https://outside.example/inventory' },
  { nextPageUrl: JSON.parse('null') },
  { nextPageUrl: dloPageUrl(0) },
  { extra: true },
  { dataLakeObjects: dloPage(0, 1).dataLakeObjects, nextPageUrl: '' },
])
  test(`DLO contradictory pagination blocks ${JSON.stringify(change)}`, async () => {
    await assert.rejects(
      listNativeNames(
        connection(async () => ({ ...dloPage(0, 21), ...change })),
        '68.0',
        'dlo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
  });

for (const second of [
  { ...dloPage(20, 21), totalSize: 22 },
  { ...dloPage(20, 21), nextPageUrl: dloPageUrl(40) },
  { dataLakeObjects: dloPage(20, 21).dataLakeObjects },
  { ...dloPage(20, 21), dataLakeObjects: dloPage(0, 1).dataLakeObjects },
])
  test(`DLO inconsistent later page blocks ${JSON.stringify(second)}`, async () => {
    let calls = 0;
    await assert.rejects(
      listNativeNames(
        connection(async () => (calls++ === 0 ? dloPage(0, 21) : second)),
        '68.0',
        'dlo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
    assert.equal(calls, 2);
  });

for (const page of [
  {},
  { dataModelObject: [], nextPageToken: 'secret' },
  { dataModelObject: [{ name: 'A__dlm' }] },
  {
    dataModelObject: [
      { name: 'A__dlm', dataSpaceName: 'default' },
      { name: 'A__dlm', dataSpaceName: 'default' },
    ],
  },
])
  test(`invalid or ambiguous inventory blocks ${JSON.stringify(page)}`, async () => {
    await assert.rejects(
      listNativeNames(
        connection(async () => page),
        '68.0',
        'dmo',
      ),
    );
  });

test('full offset2000 page cannot claim complete inventory', async () => {
  let calls = 0;
  await assert.rejects(
    listNativeNames(
      connection(async () => ({
        dataModelObject: Array.from({ length: 50 }, (_, index) => ({
          name: `Model${calls++}_${index}__dlm`,
          dataSpaceName: 'default',
        })),
      })),
      '68.0',
      'dmo',
    ),
  );
  assert.equal(calls, 2050);
});

test('mapping inventory filters every DMO and accepts only typed no-map404, never auth', async () => {
  const calls = [];
  const names = await listNativeMappingNames(['Empty__dlm', 'Target__dlm'], {
    list: async (dmo) => {
      calls.push(dmo);
      if (dmo === 'Empty__dlm') throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return { objectSourceTargetMaps: [mapping(), mapping()] };
    },
  });
  assert.deepEqual(calls, ['Empty__dlm', 'Target__dlm']);
  assert.deepEqual(names, ['Map']);
  for (const status of [401, 403, 500])
    await assert.rejects(
      listNativeMappingNames(['Target__dlm'], {
        list: async () => {
          throw new NativeMappingError('MAPPING_HTTP_ERROR', status);
        },
      }),
    );
  await assert.rejects(
    listNativeMappingNames(['Other__dlm'], {
      list: async () => ({ objectSourceTargetMaps: [mapping()] }),
    }),
  );
  await assert.rejects(
    listNativeMappingNames(['Target__dlm'], {
      list: async () => ({ objectSourceTargetMaps: [], nextPageUrl: 'more' }),
    }),
  );
});

test('mapping inventory reader is list-only, version-pinned and disables replay/redirect', async () => {
  const calls = [];
  const owner = connection(async function (request, options) {
    calls.push(request);
    assert.equal(this._refreshDelegate, undefined);
    assert.deepEqual(options.retry, { maxRetries: 0 });
    assert.throws(() => options.followRedirect(), { code: 'INVALID_REQUEST' });
    return { objectSourceTargetMaps: [] };
  });
  owner._refreshDelegate = () => assert.fail('no refresh');
  const reader = createMappingInventoryReader(owner, '61.0');
  assert.deepEqual(Object.keys(reader), ['list']);
  await reader.list('ssot__Target__dlm', 'Source__dll');
  assert.deepEqual(calls, [
    {
      method: 'GET',
      url: 'https://synthetic.example/services/data/v61.0/ssot/data-model-object-mappings?dmoDeveloperName=ssot__Target__dlm&dloDeveloperName=Source__dll',
    },
  ]);
  for (const [dmo, dlo] of [
    ['bad&name', undefined],
    ['Target__dlm', 'bad?name'],
  ])
    await assert.rejects(reader.list(dmo, dlo), { code: 'INVALID_MAPPING_BINDING' });
  assert.equal(calls.length, 1);
  for (const version of ['60.0', 'latest', 'v68.0'])
    assert.throws(() => createMappingInventoryReader(owner, version));
  const source = await readFile(
    new URL('../src/transport/mapping-rest.ts', import.meta.url),
    'utf8',
  );
  const inventorySource = source.slice(
    source.indexOf('export function createMappingInventoryReader'),
    source.indexOf('function validateBody'),
  );
  assert.doesNotMatch(inventorySource, /runProjectMetadata|mkdtemp|writeFile/u);
});

test('mapping inventory reader encodes explicit third-argument dataspace with existing filters', async () => {
  const calls = [];
  const reader = createMappingInventoryReader(
    connection(async ({ url }) => {
      calls.push(url);
      return { objectSourceTargetMaps: [] };
    }),
    '68.0',
    'Team +&?=ü',
  );
  await reader.list('ssot__Target__dlm');
  await reader.list('ssot__Target__dlm', 'Source__dll');
  const prefix = 'https://synthetic.example/services/data/v68.0/ssot/data-model-object-mappings';
  const query = '?dataspace=Team+%2B%26%3F%3D%C3%BC&dmoDeveloperName=ssot__Target__dlm';
  assert.deepEqual(calls, [`${prefix}${query}`, `${prefix}${query}&dloDeveloperName=Source__dll`]);
});

for (const failure of [
  { statusCode: 401 },
  { statusCode: 403 },
  { statusCode: 500 },
  { statusCode: '404' },
  { message: 'HTTP 404 NOT_FOUND' },
  new Error('unknown'),
  new ConnectError('INVALID_REQUEST', 404),
  new ConnectError('AUTHENTICATION_FAILED', 404),
])
  test(`mapping inventory does not guess absence from ${JSON.stringify(failure)}`, async () => {
    const reader = createMappingInventoryReader(
      connection(async () => {
        throw failure;
      }),
      '68.0',
    );
    await assert.rejects(
      listNativeMappingNames(['Target__dlm'], reader),
      (error) => error instanceof ConnectError && !(error instanceof NativeMappingError),
    );
  });

test('mapping inventory queries every confirmed parent serially with typed 404 and conflict checks', async () => {
  const parents = ['ssot__Standard__dlm', 'Other__dlm', 'Target__dlm'];
  const calls = [];
  let active = false;
  const reader = createMappingInventoryReader(
    connection(async ({ url }) => {
      assert.equal(active, false);
      active = true;
      const dmo = new URL(url).searchParams.get('dmoDeveloperName');
      calls.push(dmo);
      await Promise.resolve();
      active = false;
      if (dmo !== 'Target__dlm') throw { statusCode: 404 };
      return { objectSourceTargetMaps: [mapping('Zed'), mapping('Alpha'), mapping('Zed')] };
    }),
    '68.0',
  );
  assert.deepEqual(await listNativeMappingNames(parents, reader), ['Alpha', 'Zed']);
  assert.deepEqual(calls, parents);
  await assert.rejects(
    listNativeMappingNames(['Target__dlm'], {
      list: async () => ({
        objectSourceTargetMaps: [
          mapping(),
          { ...mapping(), sourceEntityDeveloperName: 'Other__dll' },
        ],
      }),
    }),
    { code: 'AMBIGUOUS_MAPPING_TARGET' },
  );
});

test('actual core mapping GET404 becomes typed absence and continues to later confirmed parents', async () => {
  const calls = [];
  const owner = Object.assign(Object.create(Connection.prototype), {
    instanceUrl: 'https://synthetic.example',
    version: '68.0',
    accessToken: 'synthetic-token',
    logger: { getRawLogger: () => ({ debug() {} }) },
    _refreshDelegate: { refresh: () => assert.fail('no refresh') },
    _propagators: [],
    _transport: {
      httpRequest(request, options) {
        const parent = new URL(request.url).searchParams.get('dmoDeveloperName');
        calls.push(parent);
        assert.equal(options.retry.maxRetries, 0);
        const pending = Promise.resolve({
          statusCode: parent === 'Empty__dlm' ? 404 : 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            parent === 'Empty__dlm'
              ? [{ errorCode: 'NOT_FOUND', message: 'secret' }]
              : { objectSourceTargetMaps: [mapping()] },
          ),
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  const reader = createMappingInventoryReader(owner, '68.0');
  await assert.rejects(reader.list('Empty__dlm'), (error) => {
    assert.ok(error instanceof NativeMappingError);
    assert.equal(error.code, 'MAPPING_HTTP_ERROR');
    assert.equal(error.status, 404);
    assert.ok(!JSON.stringify(error).includes('secret'));
    return true;
  });
  calls.length = 0;
  assert.deepEqual(await listNativeMappingNames(['Empty__dlm', 'Target__dlm'], reader), ['Map']);
  assert.deepEqual(calls, ['Empty__dlm', 'Target__dlm']);
});

const invocation = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const flags = {
    'api-version': 'auto',
    'target-org': 'synthetic',
    dataspace: 'default',
    ...overrides,
  };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  command.acquireMappingXml = command.writeMapping = () => assert.fail('No Metadata fallback');
  command.listNativeNames = async (_, __, family) =>
    family === 'dlo' ? ['Source__dll'] : ['Target__dlm'];
  command.listNativeMappingNames = async () => ['Map'];
  command.createMappingInventoryReader = () => ({ list: () => assert.fail('stub inventory') });
  command.createMappingClient =
    command.createDloClient =
    command.createDmoClient =
      (_, version) => {
        assert.equal(version, '68.0');
        return {};
      };
  command.acquireNativeMapping = async (apiName) => ({
    kind: 'mapping',
    identity: { dataSpace: 'default', apiName },
  });
  command.acquireNativeDmo = async (apiName) => ({
    kind: 'dmo',
    identity: { dataSpace: 'default', apiName },
  });
  command.acquireDlo = async (apiName) => ({
    kind: 'dlo',
    identity: { dataSpace: 'default', apiName },
  });
  command.writeNativeMapping =
    command.writeNativeDmo =
    command.writeDlo =
      async (document) => ({ path: `${document.identity.apiName}.json`, outcome: 'retrieved' });
  return command;
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

for (const metadata of [
  undefined,
  [],
  ['dlo', 'dmo', 'mapping'],
  ['mapping:Map', 'mapping:Map', 'dlo:Source__dll', 'dmo:Target__dlm'],
])
  test(`native public bare/type/exact selection ${JSON.stringify(metadata)}`, async () => {
    const result = await run(invocation({ metadata }));
    assert.equal(result.status, 'success');
    assert.deepEqual(result.result.selection, [
      'dlo:Source__dll',
      'dmo:Target__dlm',
      'mapping:Map',
    ]);
    assert.equal(result.result.items.length, 3);
    assert.ok(
      result.result.items.every(
        (item) => item.routes[0].transport === 'native' && !item.definitionOnly,
      ),
    );
  });

test('public mapping inventory uses owned connection while artifact acquisition retains CLI client', async () => {
  const command = invocation({ metadata: ['mapping'], 'api-version': '61.0' });
  const requests = [];
  const owner = connection(async ({ url }) => {
    requests.push(url);
    return { objectSourceTargetMaps: [mapping()] };
  });
  command.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: (version) => {
      assert.equal(version, '61.0');
      return owner;
    },
  });
  command.createMappingInventoryReader = createMappingInventoryReader;
  command.listNativeMappingNames = listNativeMappingNames;
  let acquired = 0;
  const cliClient = {};
  command.createMappingClient = (target, version, runner, scope) => {
    assert.equal(runner, undefined);
    assert.equal(scope, 'default');
    assert.equal(target, 'synthetic');
    assert.equal(version, '61.0');
    acquired++;
    return cliClient;
  };
  command.acquireNativeMapping = async (apiName, client) => {
    assert.equal(client, cliClient);
    return { kind: 'mapping', identity: { dataSpace: 'default', apiName } };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(acquired, 1);
  assert.deepEqual(requests, [
    'https://synthetic.example/services/data/v61.0/ssot/data-model-object-mappings?dataspace=default&dmoDeveloperName=Target__dlm',
  ]);
});

test('public mapping inventory transport failure prevents artifact acquisition and publication', async () => {
  const command = invocation({ metadata: ['mapping'] });
  command.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () =>
      connection(async () => {
        throw { statusCode: 403 };
      }),
  });
  command.createMappingInventoryReader = createMappingInventoryReader;
  command.listNativeMappingNames = listNativeMappingNames;
  command.createMappingClient = () => assert.fail('no artifact acquisition');
  command.writeNativeMapping = () => assert.fail('no publication');
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.result.items, []);
});

for (const scope of [undefined, 'Team'])
  test(`native retrieval threads optional request scope unchanged ${scope}`, async () => {
    const command = invocation({ dataspace: scope });
    command.listNativeNames = async (_connection, _version, family, actual) => {
      assert.equal(actual, scope);
      return family === 'dlo' ? ['Source__dll'] : ['ssot__Target__dlm'];
    };
    command.createMappingInventoryReader = (_connection, _version, actual) => {
      assert.equal(actual, scope);
      return {};
    };
    command.listNativeMappingNames = async (parents, _reader, actual) => {
      assert.deepEqual(parents, ['ssot__Target__dlm']);
      assert.equal(actual, scope);
      return ['Map'];
    };
    command.createMappingClient = (_target, _version, runner, actual) => {
      assert.equal(runner, undefined);
      assert.equal(actual, scope);
      return {};
    };
    for (const [method, kind] of [
      ['acquireDlo', 'dlo'],
      ['acquireNativeDmo', 'dmo'],
      ['acquireNativeMapping', 'mapping'],
    ])
      command[method] = async (apiName, _client, actual) => {
        assert.equal(actual, scope);
        return { kind, identity: { dataSpace: scope ?? 'default', apiName } };
      };
    const result = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(result.result.items.length, 3);
    assert.ok(
      result.result.items.every((item) => item.identity.dataSpace === (scope ?? 'default')),
    );
  });

for (const family of ['dlo', 'dmo'])
  test(`explicit ${family} inventory filters actual memberships without a query filter`, async () => {
    const names = await listNativeNames(
      connection(async ({ url }) => {
        assert.deepEqual([...new URL(url).searchParams.keys()], ['limit', 'offset', 'orderBy']);
        return family === 'dlo'
          ? {
              dataLakeObjects: [
                { name: 'Source__dll', dataSpaceInfo: [{ name: 'default' }, { name: 'Team' }] },
              ],
            }
          : { dataModelObject: [{ name: 'ssot__Target__dlm', dataSpaceName: 'Team' }] };
      }),
      '68.0',
      family,
      'Team',
    );
    assert.deepEqual(names, [family === 'dlo' ? 'Source__dll' : 'ssot__Target__dlm']);
  });

test('scoped mapping inventory normalizes omitted response scope in request context', async () => {
  assert.deepEqual(
    await listNativeMappingNames(
      ['Target__dlm'],
      {
        list: async () => ({ objectSourceTargetMaps: [mapping()] }),
      },
      'Team',
    ),
    ['Map'],
  );
  await assert.rejects(
    listNativeMappingNames(
      ['Target__dlm'],
      {
        list: async () => ({ objectSourceTargetMaps: [{ ...mapping(), dataSpaceName: 'Other' }] }),
      },
      'Team',
    ),
  );
});

test('inventory failure prevents all publication; low version refuses before auth', async () => {
  const command = invocation();
  command.listNativeMappingNames = async () => {
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  };
  command.writeDlo = () => assert.fail('No partial inventory publication');
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  const old = invocation({ 'api-version': '60.0' });
  old.resolveOrg = () => assert.fail('No auth');
  const refused = await run(old);
  assert.equal(refused.status, 'blocked');
});
