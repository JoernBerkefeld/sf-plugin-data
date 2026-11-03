import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { nativeApiVersion } from '../lib/transport/api-version.js';
import { listNativeNames, listNativeMappingNames } from '../lib/services/select-native-retrieve.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';

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

for (const scope of [undefined, 'Team'])
  test(`native retrieval threads optional request scope unchanged ${scope}`, async () => {
    const command = invocation({ dataspace: scope });
    command.listNativeNames = async (_connection, _version, family, actual) => {
      assert.equal(actual, scope);
      return family === 'dlo' ? ['Source__dll'] : ['ssot__Target__dlm'];
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
