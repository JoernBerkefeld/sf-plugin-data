import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readdir, rename, symlink } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import {
  listNativeMappingNames,
  listNativeNames,
  mappingListReads,
} from '../lib/services/select-native-retrieve.js';
import {
  createMappingClient,
  createMappingInventoryReader,
} from '../lib/transport/mapping-rest.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
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
    'default',
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
    'default',
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
    return { kind: 'dmo', c__dataSpace: 'default', identity: { apiName } };
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
  const names = await listNativeNames(listing.owner, '68.0', 'dmo', 'default', warnings, listed);
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
  const names = await listNativeNames(listing.owner, '68.0', 'dmo', 'default');
  assert.equal(names.length, 120);
});

test('a failing page that is needed still fails the listing', async () => {
  const failure = Object.assign(new Error('synthetic'), { statusCode: 400 });
  const listing = slowDmoListing(300, (offset) => (offset === 100 ? failure : undefined));
  await assert.rejects(listNativeNames(listing.owner, '68.0', 'dmo', 'default'), (error) => {
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
  const names = await listNativeNames(listing.owner, '68.0', 'dmo', 'default');
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
    'default',
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
      c__dataSpace: 'default',
      identity: { apiName },
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
  c__dataSpace: ['default'],
  identity: { apiName },
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

/**
 * A relationship list entry of the source DMO in the live API68 shape.
 * @param {string} dmo Source DMO.
 * @param {string} name Relationship name.
 * @returns {object} Native entry.
 */
const relationshipEntry = (dmo, name) => ({
  cardinality: 'ManyToOne',
  creationType: 'Custom',
  id: '0geSYNTHETIC',
  name,
  owner: 'DataCloud',
  sourceField: { label: 'Ref', name: 'Ref__c', type: 'MktDataModelField' },
  sourceObject: { label: dmo, name: dmo },
  status: 'ACTIVE',
  targetField: { label: 'Id', name: 'Id__c', type: 'MktDataModelField' },
  targetObject: { label: 'T', name: 'T__dlm' },
});

/**
 * Run a bare relationship retrieve over synthetic DMOs with a fake Metadata API label reader.
 * @param {string[]} dmos DMO names, as listed.
 * @param {Function} readDefinitions Label reader.
 * @returns {Promise<{result: object, written: object[]}>} Envelope and written documents.
 */
async function bareRelationshipRun(dmos, readDefinitions) {
  const command = Object.create(Retrieve.prototype);
  const flags = { 'api-version': 'auto', 'target-org': 'synthetic', metadata: ['relationship'] };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  command.listNativeNames = async () => dmos;
  // Three relationships per DMO; a DMO ending in 0 has none (204).
  command.createRelationshipClient = () => ({
    list: async (dmo) =>
      dmo.endsWith('0__dlm')
        ? undefined
        : {
            relationships: ['A', 'B', 'C'].map((suffix) =>
              relationshipEntry(dmo, `${dmo.slice(0, -5)}_${suffix}`),
            ),
            totalSize: 3,
          },
    readDefinitions,
  });
  const written = [];
  command.writeRelationship = async (document) => {
    written.push(structuredClone(document));
    return { path: `${document.identity.apiName}.json`, outcome: 'retrieved' };
  };
  const previous = process.exitCode;
  try {
    return { result: await command.run(), written };
  } finally {
    process.exitCode = previous;
  }
}

test('bare relationship reads the labels of all DMOs together, 10 names per Metadata API read', async () => {
  const { retrieveNativeRelationships } = await import('../lib/services/native-relationship.js');
  const dmos = Array.from({ length: 30 }, (_, index) => `D${String(index).padStart(2, '0')}__dlm`);
  const asked = [];
  const readDefinitions = async (names) => {
    asked.push(names);
    // The last name has no Metadata API record: its file has no label.
    return names
      .filter((name) => name !== 'D29_C')
      .map((name) => ({ fullName: name, masterLabel: `Label ${name}` }));
  };
  const { result, written } = await bareRelationshipRun(dmos, readDefinitions);
  assert.equal(result.status, 'success');
  // 27 DMOs with 3 relationships: 81 names in 9 reads instead of one or more per DMO (27).
  assert.equal(asked.length, 9);
  assert.ok(asked.every((names) => names.length <= 10));
  assert.equal(asked.flat().length, 81);
  // Output equals the per-DMO read with its own label read.
  const expected = [];
  for (const dmo of dmos)
    expected.push(
      ...(await retrieveNativeRelationships(
        dmo,
        {
          list: async () =>
            dmo.endsWith('0__dlm')
              ? undefined
              : {
                  relationships: ['A', 'B', 'C'].map((suffix) =>
                    relationshipEntry(dmo, `${dmo.slice(0, -5)}_${suffix}`),
                  ),
                  totalSize: 3,
                },
          readDefinitions,
        },
        'default',
        'retrieve',
      )),
    );
  assert.deepEqual(written, structuredClone(expected));
  assert.equal(written[0].spec.label, 'Label D01_A');
  assert.equal(Object.hasOwn(written.at(-1).spec, 'label'), false);
});

test('a failed label read fails only the DMOs whose names it carried, in DMO order', async () => {
  const dmos = Array.from({ length: 9 }, (_, index) => `E${index + 1}__dlm`);
  let reads = 0;
  const { result, written } = await bareRelationshipRun(dmos, async (names) => {
    // The second read (names 11-20: E4_B .. E7_A) fails.
    if (++reads === 2) throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
    return names.map((name) => ({ fullName: name, masterLabel: name }));
  });
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.diagnostics.errors.map((error) => [error.code, error.identity.apiName]),
    [
      ['RELATIONSHIP_REQUEST_UNCONFIRMED', 'E4__dlm'],
      ['RELATIONSHIP_REQUEST_UNCONFIRMED', 'E5__dlm'],
      ['RELATIONSHIP_REQUEST_UNCONFIRMED', 'E6__dlm'],
      ['RELATIONSHIP_REQUEST_UNCONFIRMED', 'E7__dlm'],
    ],
  );
  assert.deepEqual(
    [...new Set(written.map((document) => document.identity.apiName.slice(0, 2)))],
    ['E1', 'E2', 'E3', 'E8', 'E9'],
  );
});

const mappingEntry = (name, dmo, dlo = 'Source__dll') => ({
  developerName: name,
  fieldMappings: [
    {
      developerName: `${name}_Id`,
      sourceFieldDeveloperName: 'Id__c',
      targetFieldDeveloperName: 'Id__c',
    },
  ],
  sourceEntityDeveloperName: dlo,
  status: 'ACTIVE',
  targetEntityDeveloperName: dmo,
});
const dmoNames = (count) =>
  Array.from({ length: count }, (_, index) => `D${String(index).padStart(2, '0')}__dlm`);

test('mapping lists are read up to 6 DMOs at once; names, entries, warnings and failures keep DMO order', async () => {
  const dmos = dmoNames(20);
  let inFlight = 0;
  let most = 0;
  const listed = new Map();
  const warnings = [];
  const failures = [];
  const names = await listNativeMappingNames(
    dmos,
    {
      list: async (dmo) => {
        inFlight++;
        most = Math.max(most, inFlight);
        const index = Number(dmo.slice(1, 3));
        await tick(40 - index * 2);
        inFlight--;
        if (index === 3) throw Object.assign(new Error('x'), { statusCode: 400 });
        if (index === 4) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
        return {
          objectSourceTargetMaps: [
            mappingEntry(`M${index}`, dmo),
            { developerName: `bad name ${index}` },
            // Listed under several DMOs: kept once, from the first DMO.
            mappingEntry('Shared', dmo, `S${index}__dll`),
          ],
        };
      },
    },
    'default',
    { warnings, failure: (dmo) => failures.push(dmo), listed },
  );
  assert.equal(mappingListReads, 6);
  assert.equal(most, mappingListReads);
  assert.deepEqual(failures, ['D03__dlm']);
  assert.equal(names.length, 19);
  assert.deepEqual(names, names.toSorted());
  assert.equal(listed.get('Shared').sourceEntityDeveloperName, 'S0__dll');
  assert.deepEqual(listed.get('M7'), mappingEntry('M7', 'D07__dlm'));
  assert.equal(listed.has('M3'), false);
  assert.deepEqual(
    warnings.map((warning) => warning.split(':')[0]),
    dmos
      .filter((_, index) => index !== 3 && index !== 4)
      .map((dmo) => `mapping inventory of ${dmo}`),
  );
});

test('a mapping list failure without a failure receiver stops the listing', async () => {
  const started = [];
  await assert.rejects(
    listNativeMappingNames(
      dmoNames(30),
      {
        list: async (dmo) => {
          started.push(dmo);
          await tick(5);
          if (dmo === 'D00__dlm') throw new NativeMappingError('MAPPING_INVENTORY_UNCONFIRMED');
          return { objectSourceTargetMaps: [] };
        },
      },
      'default',
    ),
    { code: 'MAPPING_INVENTORY_UNCONFIRMED' },
  );
  await tick(60);
  assert.ok(started.length < 30, `${started.length} lists started`);
});

test('a 429 on one parallel mapping list is retried for that request only', async (t) => {
  const waits = [];
  t.mock.method(connectRetry, 'sleep', async (milliseconds) => {
    waits.push(milliseconds);
  });
  t.mock.method(connectRetry, 'warn', () => {});
  const requested = [];
  const reader = createMappingInventoryReader(
    connection(async ({ url }) => {
      const dmo = new URL(url).searchParams.get('dmoDeveloperName');
      requested.push(dmo);
      await tick(5);
      if (dmo === 'D05__dlm' && requested.filter((name) => name === dmo).length === 1)
        throw Object.assign(new Error('x'), { statusCode: 429 });
      return { objectSourceTargetMaps: [mappingEntry(`M_${dmo}`, dmo)] };
    }),
    '68.0',
    'default',
  );
  const names = await listNativeMappingNames(dmoNames(12), reader, 'default');
  assert.equal(names.length, 12);
  assert.deepEqual(waits, [1000]);
  assert.equal(requested.length, 13);
});

test('a listed mapping GET answers with a copy of its entry, without a request', async () => {
  const entry = mappingEntry('Listed', 'Target__dlm');
  const requests = [];
  const client = createMappingClient(
    'synthetic',
    '68.0',
    undefined,
    'default',
    {
      request: async (method, route) => {
        requests.push(`${method} ${route}`);
        return mappingEntry('Other', 'Target__dlm');
      },
    },
    new Map([['Listed', entry]]),
  );
  const read = await client.get('Listed');
  assert.deepEqual(read, entry);
  read.fieldMappings.length = 0;
  assert.equal(entry.fieldMappings.length, 1);
  assert.deepEqual(requests, []);
  await client.get('Other');
  assert.deepEqual(requests, [
    'GET /services/data/v68.0/ssot/data-model-object-mappings/Other?dataspace=default',
  ]);
  await assert.rejects(client.get('bad/name'), { code: 'INVALID_MAPPING_NAME' });
});

test('mappings are read up to 6 at once, parents once per run, files and errors in name order', async () => {
  const command = Object.create(Retrieve.prototype);
  const flags = { 'api-version': 'auto', 'target-org': 'synthetic', metadata: ['mapping'] };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
  const names = Array.from({ length: 20 }, (_, index) => `M${String(index).padStart(2, '0')}`);
  command.listNativeNames = async () => ['Target__dlm'];
  command.createMappingInventoryReader = () => ({});
  command.listNativeMappingNames = async () => names;
  command.createSsotSender = () => ({});
  command.createMappingClient = () => ({});
  const parentGets = [];
  let failParent = true;
  command.createDloClient = () => ({
    get: async (name) => {
      parentGets.push(name);
      await tick(5);
      // The first read of Flaky__dll fails; a failed read is not kept for the next mapping.
      if (name === 'Flaky__dll' && failParent) {
        failParent = false;
        throw new Error('flaky');
      }
      return { name, fields: [] };
    },
  });
  command.createDmoClient = () => ({ get: async (name) => ({ name }) });
  let inFlight = 0;
  let most = 0;
  command.acquireNativeMapping = async (apiName, _client, _scope, parents) => {
    inFlight++;
    most = Math.max(most, inFlight);
    const index = Number(apiName.slice(1));
    try {
      // M00 starts first and reads Flaky__dll first.
      if (index > 0) await tick(40 - index);
      const source = index < 2 ? 'Flaky__dll' : index % 2 ? 'Odd__dll' : 'Even__dll';
      const read = await parents.source.get(source);
      // Each mapping gets its own copy of a shared parent read.
      assert.deepEqual(read.fields, []);
      read.fields.push('changed');
      await parents.target.get('Target__dlm');
    } finally {
      inFlight--;
    }
    if (index === 7) throw new NativeMappingError('MAPPING_HTTP_ERROR', 403);
    return { kind: 'mapping', c__dataSpace: 'default', identity: { apiName } };
  };
  const written = [];
  command.writeNativeMapping = async (document) => {
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
  assert.equal(most, 6);
  assert.deepEqual(
    written,
    names.filter((name) => !['M00', 'M07'].includes(name)),
  );
  assert.deepEqual(
    result.result.items.map((item) => item.identity.apiName),
    written,
  );
  assert.deepEqual(
    result.diagnostics.errors.map((error) => [error.identity.apiName, error.code]),
    [
      ['M00', 'NATIVE_RETRIEVE_FAILED'],
      ['M07', 'MAPPING_HTTP_ERROR'],
    ],
  );
  // Odd and Even once each; Flaky twice (the failed read was not kept).
  assert.deepEqual(parentGets.toSorted(), ['Even__dll', 'Flaky__dll', 'Flaky__dll', 'Odd__dll']);
});
