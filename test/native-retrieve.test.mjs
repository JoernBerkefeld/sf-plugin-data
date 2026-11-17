import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { nativeApiVersion } from '../lib/transport/api-version.js';
import { listNativeNames, listNativeMappingNames } from '../lib/services/select-native-retrieve.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { retrieveNativeDlo } from '../lib/services/native-dlo.js';
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
      const sender = {
        request: async (method, route) => {
          assert.ok(route.startsWith(`/services/data/v${version}/ssot/`));
          return {};
        },
      };
      const client =
        factory === createDloClient
          ? factory('synthetic', version, sender)
          : factory === createDmoClient
            ? factory('synthetic', version, undefined, sender)
            : factory('synthetic', version, undefined, undefined, sender);
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
      assert.throws(() => factory('synthetic', version));
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
  // Without totalSize the next pages are read ahead in parallel; those past the end are unused.
  assert.deepEqual(offsets.slice(0, 2), [0, 50]);
  assert.ok(offsets.length <= 5);
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

for (const shortOffsets of [[20, 40], [20], [60]])
  test(`short DLO pages keep what the API returned ${shortOffsets}`, async () => {
    const offsets = [];
    const returned = [];
    const names = await listNativeNames(
      connection(async ({ url }) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        offsets.push(offset);
        const page = dloPage(offset, 78);
        if (shortOffsets.includes(offset)) page.dataLakeObjects.splice(-2);
        if (offset === 60) delete page.nextPageUrl;
        returned.push(...page.dataLakeObjects);
        return page;
      }),
      '68.0',
      'dlo',
    );
    assert.deepEqual(offsets, [0, 20, 40, 60]);
    assert.deepEqual(
      names,
      returned
        .filter((item) => item.dataSpaceInfo[0].name === 'default')
        .map((item) => item.name)
        .toSorted(),
    );
  });

// Live shape (isolated-source, API68): totalSize 100, the page at offset 20 holds 18 entries
// and still links the next page; the last page is full and has no nextPageUrl.
test('DLO inventory lists the 98 entries of a 100-total answer with a short page', async () => {
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const page = dloPage(offset, 100);
      for (const item of page.dataLakeObjects) item.dataSpaceInfo = [{ name: 'default' }];
      if (offset === 20) page.dataLakeObjects.splice(18);
      if (offset === 80) delete page.nextPageUrl;
      return page;
    }),
    '68.0',
    'dlo',
  );
  assert.equal(names.length, 98);
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

// Lenient listing (retrieve never refuses a whole inventory over envelope details).
test('DLO listing ignores extra envelope keys and the page URL format', async () => {
  const offsets = [];
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      const page = dloPage(offset, 21);
      for (const item of page.dataLakeObjects) item.dataSpaceInfo = [{ name: 'default' }];
      return {
        ...page,
        extra: true,
        currentPageUrl: `https://synthetic.example${page.currentPageUrl}&x=1`,
        nextPageUrl: offset === 0 ? 'https://synthetic.example/absolute/next' : JSON.parse('null'),
      };
    }),
    '68.0',
    'dlo',
  );
  assert.deepEqual(offsets, [0, 20]);
  assert.equal(names.length, 21);
});

test('DLO listing follows an absolute nextPageUrl when the answer has no totalSize', async () => {
  const offsets = [];
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      const page = dloPage(offset, 25);
      delete page.totalSize;
      page.dataLakeObjects = page.dataLakeObjects.slice(0, 3);
      if (offset === 0) page.nextPageUrl = `https://synthetic.example${dloPageUrl(20)}`;
      return page;
    }),
    '68.0',
    'dlo',
  );
  assert.deepEqual(offsets.slice(0, 2), [0, 20]);
  assert.ok(Math.max(...offsets) <= 80);
  assert.deepEqual(names, ['Source0__dll', 'Source20__dll', 'Source22__dll', 'Source2__dll']);
});

test('DMO listing pages past 2000 entries until the API is exhausted', async () => {
  const offsets = [];
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      const count = offset < 2500 ? 50 : 7;
      return {
        dataModelObject: Array.from({ length: count }, (_, index) => ({
          name: `Model${offset + index}__dlm`,
          dataSpaceName: 'default',
        })),
        nextPageToken: 'ignored',
      };
    }),
    '68.0',
    'dmo',
  );
  assert.equal(names.length, 2507);
  assert.ok(offsets.includes(2500));
  assert.ok(Math.max(...offsets) <= 2650);
});

test('a listing that repeats its page (offset ignored) ends instead of looping', async () => {
  let calls = 0;
  const names = await listNativeNames(
    connection(async () => {
      calls++;
      return {
        dataModelObject: Array.from({ length: 50 }, (_, index) => ({
          name: `Model${index}__dlm`,
          dataSpaceName: 'default',
        })),
      };
    }),
    '68.0',
    'dmo',
  );
  // The repeated page ends the listing; at most three pages were read ahead of it.
  assert.ok(calls >= 2 && calls <= 5);
  assert.equal(names.length, 50);
});

test('one unusable inventory entry is skipped with a warning; the rest are listed', async () => {
  const warnings = [];
  const names = await listNativeNames(
    connection(async () => ({
      dataModelObject: [
        { name: 'Good__dlm', dataSpaceName: 'default' },
        { name: 'NoSpace__dlm' },
        { label: 'no name' },
        'not an entry',
        { name: 'Good__dlm', dataSpaceName: 'default' },
        { name: 'Other__dlm', dataSpaceName: 'other' },
      ],
    })),
    '68.0',
    'dmo',
    undefined,
    warnings,
  );
  assert.deepEqual(names, ['Good__dlm']);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /"NoSpace__dlm" because it has no usable data space/u);
  assert.match(warnings[1], /entry at position 2 because it has no usable API name/u);
  const dloWarnings = [];
  assert.deepEqual(
    await listNativeNames(
      connection(async () => ({
        dataLakeObjects: [
          { name: 'Good__dll', dataSpaceInfo: [{ name: 'default' }, { bad: true }] },
          { name: 'Bad__dll', dataSpaceInfo: [] },
        ],
      })),
      '68.0',
      'dlo',
      undefined,
      dloWarnings,
    ),
    ['Good__dll'],
  );
  assert.equal(dloWarnings.length, 1);
});

for (const page of [{}, { dataModelObject: 'x' }, [], 'text'])
  test(`a listing without its entry array still fails ${JSON.stringify(page)}`, async () => {
    await assert.rejects(
      listNativeNames(
        connection(async () => page),
        '68.0',
        'dmo',
      ),
      { code: 'NATIVE_INVENTORY_UNCONFIRMED' },
    );
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
  // Names only: the target binding is checked when the mapping itself is read.
  assert.deepEqual(
    await listNativeMappingNames(['Other__dlm'], {
      list: async () => ({ objectSourceTargetMaps: [mapping()] }),
    }),
    ['Map'],
  );
  // Extra envelope keys are ignored.
  assert.deepEqual(
    await listNativeMappingNames(['Target__dlm'], {
      list: async () => ({ objectSourceTargetMaps: [mapping()], nextPageUrl: 'more' }),
    }),
    ['Map'],
  );
  await assert.rejects(
    listNativeMappingNames(['Target__dlm'], { list: async () => ({ other: [] }) }),
    { code: 'MAPPING_INVENTORY_UNCONFIRMED' },
  );
});

test('mapping listing skips unusable entries with a warning and reports a failing DMO alone', async () => {
  const warnings = [];
  const failures = [];
  const names = await listNativeMappingNames(
    ['Broken__dlm', 'Odd__dlm', 'Target__dlm'],
    {
      list: async (dmo) => {
        if (dmo === 'Broken__dlm') throw new NativeMappingError('MAPPING_HTTP_ERROR', 500);
        if (dmo === 'Odd__dlm') return { unexpected: true };
        return {
          objectSourceTargetMaps: [
            { developerName: 'NoPairs' },
            { fieldMappings: [] },
            { ...mapping('Elsewhere'), dataSpaceName: 'other' },
            mapping(),
          ],
        };
      },
    },
    undefined,
    { warnings, failure: (dmo, error) => failures.push([dmo, error.code]) },
  );
  assert.deepEqual(names, ['Map', 'NoPairs']);
  assert.deepEqual(failures, [
    ['Broken__dlm', 'MAPPING_HTTP_ERROR'],
    ['Odd__dlm', 'MAPPING_INVENTORY_UNCONFIRMED'],
  ]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /entry at position 1 because it has no usable API name/u);
  assert.match(warnings[1], /"Elsewhere" because it belongs to another data space/u);
});

test('mapping inventory reader is list-only, version-pinned and disables replay/redirect', async () => {
  const calls = [];
  const owner = connection(async function (request, options) {
    calls.push(request);
    assert.equal(this._refreshDelegate, undefined);
    assert.deepEqual(options.retry, { maxRetries: 0, methods: [] });
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

test('mapping inventory queries every confirmed parent in DMO order with typed 404 and conflict checks', async () => {
  const parents = ['ssot__Standard__dlm', 'Other__dlm', 'Target__dlm'];
  const calls = [];
  const reader = createMappingInventoryReader(
    connection(async ({ url }) => {
      const dmo = new URL(url).searchParams.get('dmoDeveloperName');
      calls.push(dmo);
      await Promise.resolve();
      if (dmo !== 'Target__dlm') throw { statusCode: 404 };
      return { objectSourceTargetMaps: [mapping('Zed'), mapping('Alpha'), mapping('Zed')] };
    }),
    '68.0',
  );
  assert.deepEqual(await listNativeMappingNames(parents, reader), ['Alpha', 'Zed']);
  assert.deepEqual(calls, parents);
  // The same name twice is listed once; each mapping is checked when it is read.
  assert.deepEqual(
    await listNativeMappingNames(['Target__dlm'], {
      list: async () => ({
        objectSourceTargetMaps: [
          mapping(),
          { ...mapping(), sourceEntityDeveloperName: 'Other__dll' },
        ],
      }),
    }),
    ['Map'],
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
    assert.ok(result.result.items.every((item) => item.routes[0].transport === 'native'));
  });

for (const metadata of [['dlo'], undefined])
  test(`${metadata ? 'bare dlo' : 'omitted selectors'} retrieve every listed DLO; a failing one is its own diagnostic`, async () => {
    const command = invocation({ metadata });
    const listed = ['Zeta_Home__dll', 'Account_Home__dll', 'Broken__dll', 'Probe__dll'];
    command.listNativeNames = async (_, version, family, scope) => {
      assert.equal(version, '68.0');
      assert.equal(scope, 'default');
      return family === 'dlo' ? listed : ['Target__dlm'];
    };
    const reads = [];
    command.acquireDlo = async (apiName) => {
      reads.push(apiName);
      if (apiName === 'Broken__dll') throw new DloError('INVALID_DLO_DOCUMENT');
      return { kind: 'dlo', identity: { dataSpace: 'default', apiName } };
    };
    const result = await run(command);
    assert.deepEqual(reads, listed.toSorted());
    assert.deepEqual(
      result.result.items
        .filter((item) => item.family === 'dlo')
        .map((item) => item.identity.apiName),
      ['Account_Home__dll', 'Probe__dll', 'Zeta_Home__dll'],
    );
    assert.deepEqual(
      result.diagnostics.errors.map((error) => [error.code, error.identity.apiName]),
      [['INVALID_DLO_DOCUMENT', 'Broken__dll']],
    );
    assert.equal(result.status, 'failed');
    assert.deepEqual(
      result.result.selection.filter((value) => value.startsWith('dlo:')),
      listed.toSorted().map((name) => `dlo:${name}`),
    );
    if (!metadata) assert.equal(result.result.items.length, 5);
  });

for (const metadata of [['dlo'], ['dlo:Rates_Home__dll'], undefined])
  test(`a DLO in two data spaces retrieves under default ${JSON.stringify(metadata)}`, async () => {
    // No --dataspace: the run reads in default, which binds one of the two memberships.
    const command = invocation({ metadata, dataspace: undefined });
    command.listNativeNames = async (_, __, family) =>
      family === 'dlo' ? ['Rates_Home__dll'] : ['Target__dlm'];
    command.acquireDlo = retrieveNativeDlo;
    command.createDloClient = () => ({
      get: async () => ({
        name: 'Rates_Home__dll',
        id: '1dlaj00000Ae4VNAAZ',
        label: 'Rates',
        category: 'Other',
        dataSpaceInfo: [{ name: 'default' }, { name: 'dataspace2' }],
        dataLakeFieldInfoRepresentation: [
          { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true },
        ],
      }),
    });
    const result = await run(command);
    assert.deepEqual(result.diagnostics.errors, []);
    const dlo = result.result.items.find((item) => item.family === 'dlo');
    assert.deepEqual(dlo.identity, { dataSpace: 'default', apiName: 'Rates_Home__dll' });
  });

test('public mapping inventory uses owned connection; artifact acquisition gets a bound sender', async () => {
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
  const sender = { request: () => assert.fail('stubbed client') };
  command.createSsotSender = (target, version) => {
    assert.deepEqual([target, version], ['synthetic', '61.0']);
    return sender;
  };
  command.createMappingClient = (target, version, runner, scope, bound) => {
    assert.equal(runner, undefined);
    assert.equal(scope, 'default');
    assert.equal(target, 'synthetic');
    assert.equal(version, '61.0');
    assert.equal(bound, sender);
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

test('retrieve reads DLOs, DMOs, mappings and mapping parents through one shared bound sender', async () => {
  const command = invocation({ metadata: ['dlo', 'dmo', 'mapping'] });
  const opened = [];
  command.createSsotSender = (target, version) => {
    const sender = { request: () => assert.fail('stubbed client') };
    opened.push([target, version, sender]);
    return sender;
  };
  const senders = [];
  // The DLO client has no runner; the DMO client's runner serves only field removal.
  command.createDloClient = (_target, _version, sender) => {
    senders.push(sender);
    return { get: async (name) => ({ name }) };
  };
  command.createDmoClient = (_target, _version, runner, sender) => {
    assert.equal(runner, undefined);
    senders.push(sender);
    return { get: async (name) => ({ name }) };
  };
  command.createMappingClient = (_target, _version, runner, _scope, sender) => {
    assert.equal(runner, undefined);
    senders.push(sender);
    return {};
  };
  command.acquireNativeMapping = async (apiName, _client, _scope, parents) => {
    await parents.source.get('Source__dll');
    await parents.target.get('Target__dlm');
    return { kind: 'mapping', identity: { dataSpace: 'default', apiName } };
  };
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].slice(0, 2), ['synthetic', '68.0']);
  // DLO, DMO, mapping, and the mapping's source DLO and target DMO reads.
  assert.equal(senders.length, 5);
  assert.ok(senders.every((sender) => sender === opened[0][2]));
});

test('a listed mapping that reads 404 was deleted during the retrieve: skipped with a warning', async () => {
  const command = invocation({ metadata: ['mapping'] });
  command.listNativeMappingNames = async () => ['Gone', 'Kept'];
  command.acquireNativeMapping = async (apiName) => {
    if (apiName === 'Gone') throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
    return { kind: 'mapping', identity: { dataSpace: 'default', apiName } };
  };
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    ['Kept'],
  );
  assert.deepEqual(result.diagnostics.errors, []);
  assert.deepEqual(result.diagnostics.warnings, [
    'mapping:Gone: listed by Salesforce but not found when read (404), so it was deleted during the retrieve; skipped.',
  ]);
  // Named exactly, or another failure: still an item failure.
  for (const [metadata, error] of [
    [['mapping', 'mapping:Gone'], new NativeMappingError('MAPPING_HTTP_ERROR', 404)],
    [['mapping'], new NativeMappingError('MAPPING_HTTP_ERROR', 403)],
  ]) {
    const failing = invocation({ metadata });
    failing.listNativeMappingNames = async () => ['Gone'];
    failing.acquireNativeMapping = async () => {
      throw error;
    };
    const failed = await run(failing);
    assert.equal(failed.status, 'failed', metadata.join(' '));
    assert.equal(failed.diagnostics.errors[0].code, 'MAPPING_HTTP_ERROR');
    assert.deepEqual(failed.diagnostics.warnings, []);
  }
});

test('public mapping inventory transport failure leaves the mapping family empty', async () => {
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
        // A DLO is always read in the effective scope, binding one of several memberships.
        assert.equal(actual, kind === 'dlo' ? (scope ?? 'default') : scope);
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
  const warnings = [];
  assert.deepEqual(
    await listNativeMappingNames(
      ['Target__dlm'],
      {
        list: async () => ({ objectSourceTargetMaps: [{ ...mapping(), dataSpaceName: 'Other' }] }),
      },
      'Team',
      { warnings },
    ),
    [],
  );
  assert.equal(warnings.length, 1);
});

test('a failing inventory fails its family only; low version refuses before auth', async () => {
  const command = invocation();
  command.listNativeMappingNames = async () => {
    throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
  };
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    ['Source__dll', 'Target__dlm'],
  );
  assert.deepEqual(
    result.diagnostics.errors.map(({ code, family }) => [code, family]),
    [['MAPPING_INVENTORY_UNCONFIRMED', 'mapping']],
  );
  // A failing DLO inventory leaves the DMO and mapping inventories (and their items) alone.
  const dlo = invocation();
  dlo.listNativeNames = async (_, __, family) => {
    if (family === 'dlo') throw new ConnectError('REQUEST_FAILED', 500);
    return ['Target__dlm'];
  };
  const partial = await run(dlo);
  assert.equal(partial.status, 'blocked');
  assert.deepEqual(
    partial.result.items.map((item) => item.identity.apiName),
    ['Target__dlm', 'Map'],
  );
  assert.deepEqual(
    partial.diagnostics.errors.map(({ code, family }) => [code, family]),
    [['NATIVE_INVENTORY_FAILED', 'dlo']],
  );
  const old = invocation({ 'api-version': '60.0' });
  old.resolveOrg = () => assert.fail('No auth');
  const refused = await run(old);
  assert.equal(refused.status, 'blocked');
});
