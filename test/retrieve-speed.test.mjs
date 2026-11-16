import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readdir, rename, symlink } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { listNativeNames } from '../lib/services/select-native-retrieve.js';
import { readInOrder } from '../lib/services/bounded-reads.js';
import { createDloClient } from '../lib/transport/dlo-rest.js';
import { createDmoClient } from '../lib/transport/dmo-rest.js';
import { connectRetry } from '../lib/transport/connect-client.js';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import { inspectSegmentPath, withCheckedDirectories } from '../lib/transport/project-metadata.js';
import { nativeReadRecorder } from '../lib/artifacts/verbatim-document.js';
import { retrieveNativeDlo } from '../lib/services/native-dlo.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { NativeRelationshipError } from '../lib/artifacts/native-relationship-document.js';

const connection = (request) => ({ instanceUrl: 'https://synthetic.example', request });
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-retrieve-speed-'));
const tick = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
const dloEntry = (name, space = 'default') => ({
  capabilities: {},
  category: 'Other',
  dataLakeFieldInfoRepresentation: [
    { dataType: 'Text', isPrimaryKey: true, label: 'Id', name: 'Id__c' },
  ],
  dataSpaceInfo: [{ name: space }],
  fields: [{ dataType: 'Text', isPrimaryKey: true, label: 'Id', name: 'Id__c' }],
  id: '1dlaj00000Ae4VNAAZ',
  label: name,
  name,
});
const dmoEntry = (name, space = 'default') => ({
  category: 'PROFILE',
  creationType: 'Custom',
  dataSpaceName: space,
  fields: [{ isPrimaryKey: true, label: 'Id', name: 'Id__c', type: 'Text' }],
  label: name,
  name,
});

test('the listing keeps each selected-space entry that carries the item GET field list', async () => {
  const listed = new Map();
  const lean = { name: 'Lean__dll', dataSpaceInfo: [{ name: 'default' }] };
  const names = await listNativeNames(
    connection(async () => ({
      dataLakeObjects: [dloEntry('B__dll'), dloEntry('A__dll'), dloEntry('O__dll', 'other'), lean],
      totalSize: 4,
    })),
    '68.0',
    'dlo',
    undefined,
    [],
    listed,
  );
  assert.deepEqual(names, ['A__dll', 'B__dll', 'Lean__dll']);
  assert.deepEqual([...listed.keys()], ['B__dll', 'A__dll']);
  assert.deepEqual(listed.get('A__dll'), dloEntry('A__dll'));
  const dmos = new Map();
  await listNativeNames(
    connection(async () => ({
      dataModelObject: [dmoEntry('A__dlm'), { name: 'Lean__dlm', dataSpaceName: 'default' }],
    })),
    '68.0',
    'dmo',
    undefined,
    [],
    dmos,
  );
  assert.deepEqual([...dmos.keys()], ['A__dlm']);
});

test('a listed DLO or DMO GET answers with its entry, in the item GET shape, without a request', async () => {
  const requests = [];
  const sender = {
    request: async (method, route) => {
      requests.push(route);
      return { from: 'item' };
    },
  };
  const dlo = createDloClient(
    'synthetic',
    '68.0',
    sender,
    new Map([['A__dll', dloEntry('A__dll')]]),
  );
  const read = await dlo.get('A__dll');
  assert.equal(JSON.stringify(read), JSON.stringify({ dataLakeObjects: [dloEntry('A__dll')] }));
  read.dataLakeObjects[0].label = 'changed';
  const again = await dlo.get('A__dll');
  assert.equal(again.dataLakeObjects[0].label, 'A__dll');
  assert.deepEqual(await dlo.get('B__dll'), { from: 'item' });
  const dmo = createDmoClient(
    'synthetic',
    '68.0',
    undefined,
    sender,
    new Map([['A__dlm', dmoEntry('A__dlm')]]),
  );
  assert.equal(JSON.stringify(await dmo.get('A__dlm')), JSON.stringify(dmoEntry('A__dlm')));
  assert.deepEqual(await dmo.get('B__dlm'), { from: 'item' });
  await assert.rejects(dmo.get('bad name'), { code: 'INVALID_DMO_NAME' });
  assert.deepEqual(requests, [
    '/services/data/v68.0/ssot/data-lake-objects/B__dll',
    '/services/data/v68.0/ssot/data-model-objects/B__dlm',
  ]);
  // The recorder behind as-is files keeps the body the GET answered with.
  const recorder = nativeReadRecorder();
  await recorder.wrap(dmo).get('A__dlm');
  assert.deepEqual(recorder.nativeOf('A__dlm').native, dmoEntry('A__dlm'));
});

test('a bare retrieve reads listed DLOs and DMOs from the listing, never item by item', async () => {
  const command = Object.create(Retrieve.prototype);
  const flags = { 'api-version': 'auto', 'target-org': 'synthetic', metadata: ['dlo', 'dmo'] };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  const listings = [];
  const owner = connection(async ({ url }) => {
    listings.push(new URL(url).pathname);
    return url.includes('data-lake-objects')
      ? { dataLakeObjects: [dloEntry('A__dll')], totalSize: 1 }
      : { dataModelObject: [dmoEntry('A__dlm')] };
  });
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => owner });
  // Class fields are skipped by Object.create; the real seams are set explicitly.
  command.listNativeNames = listNativeNames;
  command.createDloClient = createDloClient;
  command.createDmoClient = createDmoClient;
  command.createSsotSender = () => ({
    request: async (method, route) => assert.fail(`no item GET expected: ${route}`),
  });
  const bodies = [];
  command.acquireDlo = retrieveNativeDlo;
  command.acquireNativeDmo = async (apiName, client) => {
    bodies.push(await client.get(apiName));
    return { kind: 'dmo', identity: { dataSpace: 'default', apiName } };
  };
  const documents = [];
  command.writeDlo = command.writeNativeDmo = async (document) => {
    documents.push(document);
    return { path: `${document.identity.apiName}.json`, outcome: 'retrieved' };
  };
  const previous = process.exitCode;
  let result;
  try {
    result = await command.run();
  } finally {
    process.exitCode = previous;
  }
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(bodies, [dmoEntry('A__dlm')]);
  assert.equal(documents[0].identity.apiName, 'A__dll');
  assert.equal(listings.length, 2);
});

/**
 * A DMO listing without totalSize whose pages answer after a delay, recording concurrency.
 * @param {number} count Number of DMOs.
 * @param {(offset: number) => Error | undefined} [fail] Failure of a page's first attempt.
 * @returns {object} Connection, offsets requested and the highest number in flight.
 */
function slowDmoListing(count, fail = () => {}) {
  const offsets = [];
  const failed = new Set();
  let inFlight = 0;
  let most = 0;
  const owner = connection(async ({ url }) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    offsets.push(offset);
    inFlight++;
    most = Math.max(most, inFlight);
    try {
      // Later pages answer first.
      await tick(Math.max(1, 40 - offset / 10));
      const error = failed.has(offset) ? undefined : fail(offset);
      if (error) {
        failed.add(offset);
        throw error;
      }
      return {
        dataModelObject: Array.from(
          { length: Math.max(0, Math.min(50, count - offset)) },
          (_, index) => dmoEntry(`Model${String(offset + index).padStart(4, '0')}__dlm`),
        ),
      };
    } finally {
      inFlight--;
    }
  });
  return { owner, offsets, most: () => most };
}

test('listing pages are read up to four at a time and used in offset order', async () => {
  const listing = slowDmoListing(420);
  const warnings = [];
  const listed = new Map();
  const names = await listNativeNames(listing.owner, '68.0', 'dmo', undefined, warnings, listed);
  assert.deepEqual(
    names,
    Array.from({ length: 420 }, (_, index) => `Model${String(index).padStart(4, '0')}__dlm`),
  );
  assert.deepEqual([...listed.keys()], names);
  assert.ok(listing.most() > 1 && listing.most() <= 4, `in flight ${listing.most()}`);
  // Every page up to the short last one, plus at most three read past the end and unused.
  assert.ok(listing.offsets.includes(400));
  assert.ok(Math.max(...listing.offsets) <= 550);
  assert.deepEqual(warnings, []);
});

test('a page read past the end may fail without failing the listing', async () => {
  const listing = slowDmoListing(120, (offset) =>
    offset >= 150 ? Object.assign(new Error('x'), { statusCode: 400 }) : undefined,
  );
  const names = await listNativeNames(listing.owner, '68.0', 'dmo');
  assert.equal(names.length, 120);
});

test('a failing page that is needed still fails the listing', async () => {
  const failure = Object.assign(new Error('synthetic'), { statusCode: 400 });
  const listing = slowDmoListing(300, (offset) => (offset === 100 ? failure : undefined));
  await assert.rejects(listNativeNames(listing.owner, '68.0', 'dmo'), (error) => {
    assert.notEqual(error, undefined);
    return true;
  });
});

test('a 429 on a parallel page is retried as before', async (t) => {
  const waits = [];
  t.mock.method(connectRetry, 'sleep', async (milliseconds) => {
    waits.push(milliseconds);
  });
  t.mock.method(connectRetry, 'warn', () => {});
  const listing = slowDmoListing(260, (offset) =>
    offset === 100 || offset === 150
      ? Object.assign(new Error('x'), { statusCode: 429 })
      : undefined,
  );
  const names = await listNativeNames(listing.owner, '68.0', 'dmo');
  assert.equal(names.length, 260);
  assert.deepEqual(waits, [1000, 1000]);
  assert.equal(listing.offsets.filter((offset) => offset === 100).length, 2);
});

test('with totalSize no page at or past the total is requested', async () => {
  const offsets = [];
  const names = await listNativeNames(
    connection(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      await tick(5);
      return {
        dataLakeObjects: Array.from({ length: Math.min(20, 98 - offset) }, (_, index) =>
          dloEntry(`D${String(offset + index).padStart(3, '0')}__dll`),
        ),
        totalSize: 98,
      };
    }),
    '68.0',
    'dlo',
  );
  assert.equal(names.length, 98);
  assert.deepEqual(
    offsets.toSorted((a, b) => a - b),
    [0, 20, 40, 60, 80],
  );
});

test('readInOrder bounds concurrent reads and returns outcomes in item order', async () => {
  let inFlight = 0;
  let most = 0;
  const outcomes = await Promise.all(
    readInOrder([5, 1, 4, 2, 3, 0, 6, 7], 3, async (value) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await tick(value * 3);
      inFlight--;
      if (value === 4) throw new Error('four');
      return value * 10;
    }),
  );
  assert.equal(most, 3);
  assert.deepEqual(
    outcomes.map((outcome) => ('error' in outcome ? outcome.error.message : outcome.value)),
    [50, 10, 'four', 20, 30, 0, 60, 70],
  );
});

test('bare relationship reads DMOs in parallel; files and diagnostics keep the DMO order', async () => {
  const command = Object.create(Retrieve.prototype);
  const flags = { 'api-version': 'auto', 'target-org': 'synthetic', metadata: ['relationship'] };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  const dmos = Array.from({ length: 20 }, (_, index) => `D${String(index).padStart(2, '0')}__dlm`);
  command.listNativeNames = async () => dmos.toReversed();
  command.createRelationshipClient = () => ({});
  let inFlight = 0;
  let most = 0;
  command.acquireRelationships = async (dmo) => {
    inFlight++;
    most = Math.max(most, inFlight);
    await tick(30 - Number(dmo.slice(1, 3)));
    inFlight--;
    if (dmo === 'D07__dlm') throw new NativeRelationshipError('RELATIONSHIP_HTTP_ERROR');
    return [`${dmo}_A`, `${dmo}_B`].map((apiName) => ({
      kind: 'relationship',
      identity: { dataSpace: 'default', apiName },
    }));
  };
  const written = [];
  command.writeRelationship = async (document) => {
    written.push(document.identity.apiName);
    return { path: `${document.identity.apiName}.json`, outcome: 'retrieved' };
  };
  const previous = process.exitCode;
  let result;
  try {
    result = await command.run();
  } finally {
    process.exitCode = previous;
  }
  assert.ok(most > 1 && most <= 6, `in flight ${most}`);
  const expected = dmos
    .filter((dmo) => dmo !== 'D07__dlm')
    .flatMap((dmo) => [`${dmo}_A`, `${dmo}_B`]);
  assert.deepEqual(written, expected);
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    expected,
  );
  assert.deepEqual(
    result.diagnostics.errors.map((error) => [error.code, error.identity.apiName]),
    [['RELATIONSHIP_HTTP_ERROR', 'D07__dlm']],
  );
});

/**
 * Count lstat and realpath calls of node:fs/promises while work runs.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {() => number} Calls so far.
 */
function countPathCalls(t) {
  let calls = 0;
  for (const name of ['lstat', 'realpath']) {
    const original = fs.promises[name];
    fs.promises[name] = async (...values) => {
      calls++;
      return original(...values);
    };
    t.after(() => {
      fs.promises[name] = original;
      syncBuiltinESMExports();
    });
  }
  syncBuiltinESMExports();
  return () => calls;
}

const dloDocument = (apiName) => ({
  schemaVersion: 1,
  kind: 'dlo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: apiName,
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});

test('within one run each directory chain is checked once; every file still is', async (t) => {
  const plain = await scratch();
  const cached = await scratch();
  const calls = countPathCalls(t);
  const write = async (root, count) => {
    const before = calls();
    for (let index = 0; index < count; index++)
      await writeDloDocument(dloDocument(`P${index}__dll`), root, false);
    return calls() - before;
  };
  await write(plain, 1);
  const uncached = await write(plain, 5);
  let perRun = 0;
  await withCheckedDirectories(async () => {
    await write(cached, 1);
    perRun = await write(cached, 5);
  });
  assert.ok(perRun * 3 < uncached, `${perRun} vs ${uncached}`);
  // Two calls (lstat and realpath) per check of each file, at most four checks per write.
  assert.ok(perRun <= 5 * 8 + 5, `${perRun}`);
  const files = await readdir(path.join(cached, 'data360', 'dlo'));
  assert.equal(files.length, 5);
});

test('a checked directory that becomes a junction is still refused for new and existing files', async () => {
  const project = await scratch();
  const outside = await scratch();
  await withCheckedDirectories(async () => {
    await writeDloDocument(dloDocument('Before__dll'), project, false);
    const folder = path.join(project, 'data360', 'dlo');
    await rename(folder, path.join(project, 'moved'));
    await mkdir(path.join(outside, 'dlo'));
    await symlink(
      path.join(outside, 'dlo'),
      folder,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    // The writer reports the refused path as an output failure, as it always has.
    await assert.rejects(writeDloDocument(dloDocument('After__dll'), project, false), {
      code: 'OUTPUT_FAILED',
    });
    await assert.rejects(inspectSegmentPath(path.join(folder, 'Missing.json')), {
      code: 'UNSAFE_PATH',
    });
  });
  assert.deepEqual(await readdir(path.join(outside, 'dlo')), []);
});

test('outside a run nothing is remembered', async () => {
  const project = await scratch();
  const folder = path.join(project, 'data360');
  await mkdir(folder);
  const checked = await inspectSegmentPath(folder);
  assert.ok(checked.isDirectory());
  const outside = await scratch();
  await rename(folder, path.join(project, 'moved'));
  await symlink(outside, folder, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(inspectSegmentPath(folder), { code: 'UNSAFE_PATH' });
});

test('Metadata API calls on one bound sender go one at a time, also after a failure', async () => {
  let inFlight = 0;
  let most = 0;
  const order = [];
  const metadata = {
    read: async (_type, names) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await tick(5);
      inFlight--;
      order.push(names[0]);
      if (names[0] === 'B') throw new Error('REQUEST_LIMIT_EXCEEDED');
      return [{ fullName: names[0] }];
    },
    update: async () => ({ success: true }),
  };
  const sender = openBoundSsot('synthetic', '68.0', async () => ({
    instanceUrl: 'https://synthetic.example',
    request: async () => ({}),
    metadata,
  }));
  const api = await sender.metadata();
  const outcomes = await Promise.allSettled(
    ['A', 'B', 'C', 'D'].map((name) => api.read('T', [name])),
  );
  assert.equal(most, 1);
  assert.deepEqual(order, ['A', 'B', 'C', 'D']);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.status),
    ['fulfilled', 'rejected', 'fulfilled', 'fulfilled'],
  );
});
