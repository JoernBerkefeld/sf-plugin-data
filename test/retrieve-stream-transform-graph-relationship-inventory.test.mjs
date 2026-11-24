import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import {
  listDataGraphNames,
  listDataStreamNames,
  listDataTransformNames,
} from '../lib/services/retrieve-inventory.js';

// Synthetic project roots under the verified OS temp directory.
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-stg-rel-inventory-'));
const instanceUrl = 'https://synthetic.example';

/**
 * A connection whose GETs are answered by `answer`; a thrown answer is a failed request.
 * @param {(url: string) => unknown} answer Response of one GET.
 * @param {string[]} [urls] Receives every requested URL.
 * @returns {object} Connection.
 */
const connectionOf = (answer, urls = []) => ({
  instanceUrl,
  getApiVersion: () => '68.0',
  getUsername: () => 'synthetic',
  request: async (request) => {
    const url = typeof request === 'string' ? request : request.url;
    urls.push(url);
    return structuredClone(answer(url));
  },
});

const stream = (name, space = 'default') => ({
  name,
  dataLakeObjectInfo: { dataSpaceInfo: space ? [{ name: space }] : [] },
});

test('stream inventory: follows limit/offset pages until totalSize', async () => {
  const urls = [];
  const all = ['Charlie', 'Alpha', 'Bravo'];
  const answer = (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    // Two per page, to see paging with a short server page.
    return {
      totalSize: all.length,
      dataStreams: all.slice(offset, offset + 2).map((name) => stream(name)),
    };
  };
  assert.deepEqual(await listDataStreamNames(connectionOf(answer, urls), '68.0'), [
    'Alpha',
    'Bravo',
    'Charlie',
  ]);
  assert.deepEqual(
    urls.map((url) => new URL(url).search),
    ['?limit=200&offset=0', '?limit=200&offset=2'],
  );
  assert.ok(
    urls.every((url) => new URL(url).pathname === '/services/data/v68.0/ssot/data-streams'),
  );
});

test('stream inventory: unusable entries are skipped with a warning, another space is left out', async () => {
  const warnings = [];
  const names = await listDataStreamNames(
    connectionOf(() => ({
      totalSize: 5,
      dataStreams: [
        stream('Good'),
        { label: 'no name' },
        stream('bad name'),
        stream('NoSpace', ''),
        stream('Elsewhere', 'other'),
      ],
    })),
    '68.0',
    warnings,
  );
  // A stream whose DLO names no data space is left to its own read.
  assert.deepEqual(names, ['Good', 'NoSpace']);
  assert.deepEqual(warnings, [
    'data-stream inventory: skipped the entry at position 1 because it has no usable API name.',
    'data-stream inventory: skipped "bad name" because it has no usable API name.',
  ]);
  // A malformed page stops the listing.
  await assert.rejects(
    listDataStreamNames(
      connectionOf(() => ({ totalSize: 1 })),
      '68.0',
    ),
    {
      code: 'NATIVE_INVENTORY_UNCONFIRMED',
    },
  );
  // A server ignoring the offset ends the listing on the repeated page.
  let calls = 0;
  const repeated = await listDataStreamNames(
    connectionOf(() => {
      calls++;
      return { totalSize: 99, dataStreams: [stream('Same')] };
    }),
    '68.0',
  );
  assert.deepEqual([repeated, calls], [['Same'], 2]);
});

test('transform inventory pages by 20; graph inventory is one unpaged read', async () => {
  const urls = [];
  const transforms = Array.from({ length: 21 }, (_, index) => ({
    name: `T${String(index).padStart(2, '0')}`,
    dataSpaceName: 'default',
  }));
  transforms.push({ name: 'Other', dataSpaceName: 'other' });
  const names = await listDataTransformNames(
    connectionOf((url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      return {
        totalSize: transforms.length,
        dataTransforms: transforms.slice(offset, offset + 20),
      };
    }, urls),
  );
  assert.equal(names.length, 21);
  assert.deepEqual(
    urls.map((url) => new URL(url).search),
    ['?limit=20&offset=0', '?limit=20&offset=20'],
  );
  const graphUrls = [];
  const warnings = [];
  const graphs = await listDataGraphNames(
    connectionOf(
      () => ({
        dataGraphMetadata: [
          { developerName: 'Zulu', dataspaceName: 'default' },
          { developerName: 'Alpha', dataspaceName: 'default' },
          { description: 'no name' },
        ],
      }),
      graphUrls,
    ),
    warnings,
  );
  assert.deepEqual(graphs, ['Alpha', 'Zulu']);
  assert.deepEqual(graphUrls, [
    `${instanceUrl}/services/data/v68.0/ssot/data-graphs/metadata?dataspace=default`,
  ]);
  assert.equal(warnings.length, 1);
});

/**
 * Fail the read of any item named `Broken…`.
 * @param {string} name Item name.
 */
const fail = (name) => {
  if (name.startsWith('Broken')) throw new Error('synthetic failure');
};
/**
 * A stub writer receipt.
 * @param {object} document Document.
 * @returns {Promise<object>} Receipt.
 */
const written = async (document) => ({
  path: `${document.identity?.apiName ?? document.definition.name}.json`,
  outcome: 'retrieved',
});

/**
 * Offline retrieve command: the real listings read `answer`, item reads and writers are stubs
 * that fail for any item named `Broken…`.
 * @param {string[]} metadata Selectors.
 * @param {string} cwd Project root.
 * @param {(url: string) => unknown} answer Response of one GET.
 * @returns {object} Command and the opened shared senders.
 */
function command(metadata, cwd, answer) {
  const instance = Object.create(Retrieve.prototype);
  instance.parse = async () => ({
    flags: {
      metadata,
      'api-version': 'auto',
      'target-org': 'synthetic',
      'output-dir': cwd,
    },
  });
  instance.jsonEnabled = () => true;
  instance.log = () => {};
  const connection = connectionOf(answer);
  instance.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => connection,
  });
  instance.createDataStreamClients = () => ({});
  instance.acquireDataStream = async (name) => {
    fail(name);
    return { kind: 'data-stream', identity: { apiName: name, dataSpace: 'default' } };
  };
  instance.createDataTransformClient = () => ({});
  instance.acquireDataTransform = async (name) => {
    fail(name);
    return { document: { c__dataSpace: 'default', definition: { name } } };
  };
  instance.nativeGraphContext = async () => ({ orgId: 'synthetic-org' });
  instance.retrieveNativeGraph = async (name) => {
    fail(name);
    return { kind: 'native-data-graph', identity: { apiName: name, dataSpace: 'default' } };
  };
  instance.writeDataStream = instance.writeDataTransform = instance.writeDataGraph = written;
  instance.writeRelationship = written;
  instance.listNativeNames = async (_connection, _version, family) => {
    assert.equal(family, 'dmo');
    return ['Alpha__dlm', 'Broken__dlm'];
  };
  const opened = [];
  instance.createSsotSender = () => {
    const sender = {
      routes: [],
      request: async (_method, route) => {
        sender.routes.push(route);
        return {};
      },
    };
    opened.push(sender);
    return sender;
  };
  instance.acquireRelationships = async (dmo, client) => {
    fail(dmo);
    await client.list(dmo, 0);
    return [{ kind: 'relationship', identity: { apiName: `${dmo}_Rel`, dataSpace: 'default' } }];
  };
  return { instance, opened };
}
const run = async (instance) => {
  const previous = process.exitCode;
  try {
    return await instance.run();
  } finally {
    process.exitCode = previous;
  }
};

/**
 * List answers with one broken item per family.
 * @param {string} url Requested URL.
 * @returns {unknown} Response.
 */
const listings = (url) => {
  const { pathname } = new URL(url);
  if (pathname.endsWith('/ssot/data-streams'))
    return { totalSize: 3, dataStreams: [stream('Alpha'), stream('Broken'), { label: 'x' }] };
  if (pathname.endsWith('/ssot/data-transforms'))
    return {
      totalSize: 2,
      dataTransforms: [
        { name: 'Alpha', dataSpaceName: 'default' },
        { name: 'Broken', dataSpaceName: 'default' },
      ],
    };
  if (pathname.endsWith('/ssot/data-graphs/metadata'))
    return { dataGraphMetadata: [{ developerName: 'Alpha' }, { developerName: 'Broken' }] };
  throw new Error(`unexpected ${url}`);
};

/**
 * A synthetic transform record ID.
 * @param {number} n Digit.
 * @returns {string} 18-character ID.
 */
const id = (n) => `1dt00000000000${n}AAA`;

test('transform inventory keeps the transforms of the run data space; one without dataSpaceName takes it from SOQL by record ID', async () => {
  const transforms = [
    { id: id(1), name: 'OnDlos' },
    { id: id(2), name: 'UiSecond' },
    { id: id(3), name: 'SystemOne' },
    { id: id(4), name: 'InDefault', dataSpaceName: 'default' },
    { id: id(5), name: 'InSecond', dataSpaceName: 'dataspace2' },
  ];
  // MktDataTransform records (live API 68): Name is the label, not the API name; only the record
  // ID matches a transform. A label equal to another transform's API name never decides its space.
  const records = [
    { Id: id(1), Name: 'UiSecond', DataSpace: { Name: 'default' } },
    { Id: id(2), Name: 'A label with spaces', DataSpace: { Name: 'dataspace2' } },
    // eslint-disable-next-line unicorn/no-null -- SOQL answers a missing lookup as null.
    { Id: id(3), Name: 'OnDlos', DataSpace: null },
    { Id: id(4), Name: 'In default', DataSpace: { Name: 'default' } },
    { Id: id(5), Name: 'In second', DataSpace: { Name: 'dataspace2' } },
  ];
  const urls = [];
  const connection = connectionOf(
    (url) =>
      url.includes('/query?q=')
        ? { done: true, totalSize: records.length, records }
        : { totalSize: transforms.length, dataTransforms: transforms },
    urls,
  );
  assert.deepEqual(await listDataTransformNames(connection), ['InDefault', 'OnDlos', 'SystemOne']);
  assert.deepEqual(await listDataTransformNames(connection, [], 'dataspace2'), [
    'InSecond',
    'UiSecond',
  ]);
  const query = urls.find((url) => url.includes('/query?q='));
  assert.equal(
    new URL(query).searchParams.get('q'),
    'SELECT Id, DataSpace.Name FROM MktDataTransform',
  );
  // An incomplete SOQL answer, or an entry whose ID the records lack, never lists by guess.
  for (const [answer, list] of [
    [{ done: false, totalSize: 5, records: [] }, transforms],
    [{ done: true, totalSize: records.length, records }, [{ id: id(9), name: 'Unknown' }]],
    [{ done: true, totalSize: records.length, records }, [{ name: 'NoId' }]],
  ])
    await assert.rejects(
      listDataTransformNames(
        connectionOf((url) =>
          url.includes('/query?q=') ? answer : { totalSize: list.length, dataTransforms: list },
        ),
      ),
      { code: 'TRANSFORM_DATASPACE_UNREADABLE' },
    );
});

test('bare stream, transform, graph and relationship retrieve every listed item; one failing item never blocks the others', async () => {
  const cwd = await scratch();
  const { instance, opened } = command(
    ['data-stream', 'data-transform', 'data-graph', 'relationship'],
    cwd,
    listings,
  );
  const result = await run(instance);
  assert.equal(result.status, 'partial', JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.result.items.map(({ family, identity }) => [family, identity.apiName]),
    [
      ['relationship', 'Alpha__dlm_Rel'],
      ['data-stream', 'Alpha'],
      ['data-transform', 'Alpha'],
      ['data-graph', 'Alpha'],
    ],
  );
  assert.deepEqual(result.diagnostics.errors.map(({ identity }) => identity?.apiName).toSorted(), [
    'Broken',
    'Broken',
    'Broken',
    'Broken__dlm',
  ]);
  assert.match(
    result.diagnostics.warnings.join('\n'),
    /data-stream inventory: skipped the entry at position 2 because it has no usable API name/u,
  );
  // Every DMO's relationship reads share one in-process sender.
  assert.equal(opened.length, 1);
  assert.equal(opened[0].routes.length, 1);
  assert.match(opened[0].routes[0], /data-model-objects\/Alpha__dlm\/relationships/u);
});

test('a failing stream listing fails that inventory only; a named stream is still retrieved', async () => {
  const cwd = await scratch();
  const { instance } = command(['data-stream', 'data-stream:Named'], cwd, () => ({
    unexpected: true,
  }));
  const result = await run(instance);
  assert.deepEqual(
    result.diagnostics.errors.map(({ code, family }) => [code, family]),
    [['NATIVE_INVENTORY_UNCONFIRMED', 'data-stream']],
  );
  assert.deepEqual(
    result.result.items.map(({ identity }) => identity.apiName),
    ['Named'],
  );
});

const unnamedSpace = () => ({
  totalSize: 2,
  dataStreams: [stream('Second', 'dataspace2'), stream('Unnamed', '')],
});
const listedSpaces = () => ({
  totalSize: 3,
  dataStreams: [
    {
      name: 'Both',
      dataLakeObjectInfo: { dataSpaceInfo: [{ name: 'default' }, { name: 'dataspace2' }] },
    },
    stream('Second', 'dataspace2'),
    stream('First'),
  ],
});

test('stream inventory keeps the streams whose DLO lists the run data space', async () => {
  const both = listedSpaces;
  assert.deepEqual(await listDataStreamNames(connectionOf(both), '68.0', [], 'dataspace2'), [
    'Both',
    'Second',
  ]);
  assert.deepEqual(await listDataStreamNames(connectionOf(both), '68.0', [], 'default'), [
    'Both',
    'First',
  ]);
  // An entry that names no data space is left to the item's own read.
  const names = await listDataStreamNames(connectionOf(unnamedSpace), '68.0', [], 'dataspace2');
  assert.ok(names.includes('Unnamed'));
});
