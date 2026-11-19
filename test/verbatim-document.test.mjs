import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Publish from '../lib/commands/data360/publish.js';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  carriedNativeResponse,
  carryNativeResponse,
  createVerbatimDocument,
  isVerbatimDocument,
  previousIdentity,
  recordNativeReads,
  serializeVerbatimDocument,
  sortKeysDeep,
  verbatimReason,
} from '../lib/artifacts/verbatim-document.js';
import {
  admitDeletedArtifact,
  DeployInputError,
  readDeployInputs,
  skippedVerbatimWarnings,
} from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import { normalizeNativeDmo, NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { CalculatedInsightError } from '../lib/artifacts/native-calculated-insight-document.js';
import { retrieveNativeRelationships } from '../lib/services/native-relationship.js';
import { acquireRetrieveSelection } from '../lib/services/acquire-retrieve-selection.js';

// Synthetic project roots under the verified OS temp directory; owned evidence is retained.
const root = (purpose) => mkdtemp(path.join(os.tmpdir(), `data360-verbatim-${purpose}-`));

const dmoName = 'Example__dlm';
const dmoNative = () => ({
  name: dmoName,
  id: '0gjaj00000JWkxdAAD',
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  isEnabled: false,
  isEditable: true,
  hasExternalDataLakeObjectMappings: false,
  fields: [
    {
      name: 'Id__c',
      label: 'Id',
      type: 'Text',
      isPrimaryKey: true,
      creationType: 'Custom',
      isDistinct: false,
      usageTag: 'None',
      keyQualifierName: 'KQ_Id',
    },
  ],
});
// A field that is not an object: even the lenient projection refuses (INVALID_DMO_DOCUMENT).
const unmodelledDmo = () => {
  const raw = dmoNative();
  raw.fields[0] = 'unmodelled';
  return raw;
};
const segment = () => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    lookbackPeriod: 'P90D',
  },
});
const verbatimDmo = (reason = 'INVALID_DMO_FIELD') =>
  createVerbatimDocument('dmo', { dataSpace: 'default', apiName: dmoName }, reason, {
    name: dmoName,
  });

/**
 * Offline retrieve command; the org and every client are synthetic.
 * @param {string[]} metadata Selectors.
 * @param {string} outputDirectory Project root.
 * @param {boolean} overwrite Permit replacing differing files.
 * @returns {object} Command.
 */
const retrieveCommand = (metadata, outputDirectory, overwrite) => {
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: {
      metadata,
      'api-version': 'auto',
      overwrite,
      'target-org': 'synthetic',
      'output-dir': outputDirectory,
    },
  });
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => ({ getUsername: () => 'synthetic' }),
  });
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

test('the verbatim document keeps the raw response with sorted keys and an exact shape', () => {
  assert.deepEqual(
    JSON.stringify(sortKeysDeep({ b: [{ d: 1, c: 2 }], a: 0 })),
    '{"a":0,"b":[{"c":2,"d":1}]}',
  );
  const document = createVerbatimDocument(
    'native-data-graph',
    { dataSpace: 'default', apiName: 'Graph' },
    'UNSUPPORTED_DATA_GRAPH_CONFIGURATION',
    { z: 1, a: { y: 2, b: 3 } },
  );
  assert.ok(isVerbatimDocument(document, 'native-data-graph'));
  assert.ok(!isVerbatimDocument(document, 'dmo'));
  assert.equal(
    serializeVerbatimDocument(document),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'native-data-graph',
        identity: { dataSpace: 'default', apiName: 'Graph' },
        verbatim: {
          reason: 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION',
          native: { a: { b: 3, y: 2 }, z: 1 },
        },
      },
      undefined,
      2,
    )}\n`,
  );
  // A name that is no safe file name, or an unusable reason, stays an item failure.
  assert.equal(
    createVerbatimDocument('dmo', { dataSpace: 'default', apiName: '../x' }, 'A_B', {}),
    undefined,
  );
  assert.equal(
    createVerbatimDocument('dmo', { dataSpace: 'default', apiName: 'X' }, 'lower', {}),
    undefined,
  );
  assert.ok(!isVerbatimDocument({ ...document, extra: true }));
  assert.ok(!isVerbatimDocument({ ...document, verbatim: { reason: 'A_B' } }));
});

test('only projection and validation errors with a code are written verbatim', () => {
  assert.equal(verbatimReason(new NativeDmoError('INVALID_DMO_FIELD')), 'INVALID_DMO_FIELD');
  assert.equal(verbatimReason(new CalculatedInsightError('CI_NOT_FOUND')), undefined);
  assert.equal(verbatimReason(new CalculatedInsightError('CI_IDENTITY_CHANGED')), undefined);
  assert.equal(verbatimReason(new NativeDmoError('DMO_TARGET_IDENTITY_MISMATCH')), undefined);
  // Read state, not content: an incomplete inventory, a pending snapshot or a change between reads.
  for (const code of [
    'INCOMPLETE_CONNECTION_LIST',
    'INCOMPLETE_STREAM_DEPENDENCIES',
    'STREAM_SNAPSHOT_PENDING',
    'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
    'STREAM_BINDING_DRIFT',
    'STREAM_DELETE_GUARD_DRIFT',
    'TRANSFORM_TARGET_DRIFT',
  ])
    assert.equal(verbatimReason(Object.assign(new Error(code), { code })), undefined, code);
  // A DLO whose fields differ from its stream's is content: written verbatim.
  const dloDrift = Object.assign(new Error('drift'), { code: 'STREAM_DLO_DRIFT' });
  assert.equal(verbatimReason(dloDrift), 'STREAM_DLO_DRIFT');
  // Source fields that differ from the event schema are lasting content too.
  const sourceDrift = Object.assign(new Error('drift'), { code: 'STREAM_SOURCE_DRIFT' });
  assert.equal(verbatimReason(sourceDrift), 'STREAM_SOURCE_DRIFT');
  assert.equal(verbatimReason(new NativeDmoError('OVERWRITE_REQUIRED')), undefined);
  assert.equal(
    verbatimReason(Object.assign(new Error('x'), { code: 'SOME_CODE', status: 500 })),
    undefined,
  );
  const connect = Object.assign(new Error('x'), { code: 'SOME_CODE' });
  connect.name = 'ConnectError';
  assert.equal(verbatimReason(connect), undefined);
  // No usable code: the generic reason. A local system error stays a failure.
  assert.equal(verbatimReason(new Error('no code')), 'UNMODELLED_RESPONSE');
  assert.equal(verbatimReason(new TypeError('shape')), 'UNMODELLED_RESPONSE');
  assert.equal(
    verbatimReason(Object.assign(new Error('x'), { code: 'lower' })),
    'UNMODELLED_RESPONSE',
  );
  assert.equal(verbatimReason('thrown text'), 'UNMODELLED_RESPONSE');
  assert.equal(
    verbatimReason(Object.assign(new Error('x'), { code: 'EPERM', syscall: 'open' })),
    undefined,
  );
  // Variant checks named *MISMATCH are verbatim reasons; identity and scope stay failures.
  for (const code of ['STREAM_CONNECTION_MISMATCH', 'INVALID_DLO_TARGET_ID'])
    assert.equal(verbatimReason(Object.assign(new Error('x'), { code })), code);
  for (const code of [
    'DLO_TARGET_IDENTITY_MISMATCH',
    'STREAM_TARGET_MISMATCH',
    'DATA_GRAPH_IDENTITY_MISMATCH',
    'DMO_DATASPACE_MISMATCH',
    'RELATIONSHIP_NAME_MISMATCH',
    'UNSUPPORTED_STREAM_DATASPACE',
  ])
    assert.equal(verbatimReason(Object.assign(new Error('x'), { code })), undefined, code);
});

test('read recording keeps the first successful get per name and carries responses', async () => {
  let call = 0;
  const client = { get: async (name) => ({ name, call: ++call }), other: () => 'kept' };
  const reads = recordNativeReads(client);
  await reads.client.get('A');
  await reads.client.get('A');
  assert.deepEqual(reads.nativeOf('A'), { native: { name: 'A', call: 1 } });
  assert.equal(reads.nativeOf('B'), undefined);
  assert.equal(reads.client.other(), 'kept');
  assert.deepEqual(recordNativeReads({}).client, {});
  const graph = recordNativeReads({ get: async () => ({ status: 400 }) }, (response) =>
    response.status === 200 ? { native: response.body } : undefined,
  );
  await graph.client.get('G');
  assert.equal(graph.nativeOf('G'), undefined);
  const carrier = carryNativeResponse({}, { raw: true });
  assert.deepEqual(carriedNativeResponse(carrier), { native: { raw: true } });
  assert.equal(carriedNativeResponse('text'), undefined);
});

test('writers replace a verbatim or non-strict previous file only with overwrite', async () => {
  assert.deepEqual(
    previousIdentity(serializeVerbatimDocument(verbatimDmo()), () => {
      throw new Error('strict');
    }),
    // A verbatim DMO keeps its data space in c__dataSpace, not in identity.
    { apiName: dmoName },
  );
  assert.deepEqual(
    previousIdentity('{"other":1}', () => assert.fail('strict')),
    {},
  );
  assert.throws(
    () =>
      previousIdentity('[1]', () => {
        throw new Error('strict');
      }),
    /strict/u,
  );
  const cwd = await root('writer');
  const normal = normalizeNativeDmo(dmoNative(), 'default');
  const first = await writeNativeDmoDocument(normal, cwd, false);
  await assert.rejects(writeNativeDmoDocument(verbatimDmo(), cwd, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  const replaced = await writeNativeDmoDocument(verbatimDmo(), cwd, true);
  assert.equal(replaced.outcome, 'retrieved');
  const again = await writeNativeDmoDocument(verbatimDmo(), cwd, false);
  assert.equal(again.outcome, 'unchanged');
  // DMO names are unique in the org: a verbatim file of another data space is the same DMO and
  // is replaced only with overwrite, like any other difference.
  await writeFile(
    first.path,
    serializeVerbatimDocument(
      createVerbatimDocument('dmo', { dataSpace: 'other', apiName: dmoName }, 'A_B', {}),
    ),
  );
  await assert.rejects(writeNativeDmoDocument(normal, cwd, false), {
    code: 'OVERWRITE_REQUIRED',
  });
  const replacedOther = await writeNativeDmoDocument(normal, cwd, true);
  assert.equal(replacedOther.outcome, 'retrieved');
  await writeFile(first.path, '{"legacy":true}\n');
  const restored = await writeNativeDmoDocument(normal, cwd, true);
  assert.equal(restored.outcome, 'retrieved');
});

test('a segment turning verbatim removes its owned SQL files and gets them back after', async () => {
  const cwd = await root('segment');
  const normal = await writeSegmentDocument(segment(), cwd, false);
  const folder = path.dirname(normal.path);
  assert.deepEqual(await readdir(folder), [
    'Audience.segment.Audience.sql',
    'Audience.segment.json',
  ]);
  const verbatim = createVerbatimDocument(
    'segment',
    { dataSpace: 'default', apiName: 'Audience' },
    'UNSUPPORTED_SEGMENT_TYPE',
    { name: 'Audience', segmentType: 'UI' },
  );
  await assert.rejects(writeSegmentDocument(verbatim, cwd, false), { code: 'OVERWRITE_REQUIRED' });
  const written = await writeSegmentDocument(verbatim, cwd, true);
  assert.deepEqual(written.codePaths, []);
  assert.deepEqual(await readdir(folder), ['Audience.segment.json']);
  assert.ok(isVerbatimDocument(JSON.parse(await readFile(written.path, 'utf8')), 'segment'));
  await writeSegmentDocument(segment(), cwd, true);
  assert.deepEqual(await readdir(folder), [
    'Audience.segment.Audience.sql',
    'Audience.segment.json',
  ]);
});

test('retrieve twice: normal, then verbatim, then normal again at the same path', async () => {
  const cwd = await root('retrieve');
  let raw = dmoNative();
  const reads = [];
  const command = (overwrite) => {
    const value = retrieveCommand([`dmo:${dmoName}`], cwd, overwrite);
    value.createDmoClient = () => ({
      get: async (name) => {
        reads.push(name);
        return structuredClone(raw);
      },
    });
    return value;
  };
  const first = await run(command(false));
  assert.equal(first.status, 'success', JSON.stringify(first.diagnostics));
  const file = first.result.items[0].path;
  assert.equal(JSON.parse(await readFile(file, 'utf8')).kind, 'dmo');
  assert.equal(first.result.items[0].verbatim, undefined);

  raw = unmodelledDmo();
  const refused = await run(command(false));
  assert.equal(refused.status, 'blocked');
  assert.deepEqual(
    refused.diagnostics.errors.map((error) => error.code),
    ['OVERWRITE_REQUIRED'],
  );
  const second = await run(command(true));
  assert.equal(second.status, 'success', JSON.stringify(second.diagnostics));
  assert.deepEqual(second.result.items[0].verbatim, { reason: 'INVALID_DMO_DOCUMENT' });
  assert.equal(second.result.items[0].path, file);
  assert.equal(second.diagnostics.errors.length, 0);
  assert.match(
    second.diagnostics.warnings[0],
    /^dmo:Example__dlm: retrieved as-is \(verbatim, reason INVALID_DMO_DOCUMENT\)/u,
  );
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(isVerbatimDocument(saved, 'dmo'));
  assert.deepEqual(saved.verbatim.native, sortKeysDeep(unmodelledDmo()));
  assert.equal(await readFile(file, 'utf8'), serializeVerbatimDocument(saved));

  raw = dmoNative();
  const third = await run(command(true));
  assert.equal(third.status, 'success', JSON.stringify(third.diagnostics));
  assert.equal(third.result.items[0].verbatim, undefined);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).kind, 'dmo');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).verbatim, undefined);
  assert.deepEqual(third.diagnostics.warnings, []);
  assert.ok(reads.every((name) => name === dmoName));
});

test('an HTTP failure or a missing object stays an item failure and writes nothing', async () => {
  const cwd = await root('http');
  const command = retrieveCommand([`dmo:${dmoName}`], cwd, true);
  command.createDmoClient = () => ({
    get: async () => {
      throw Object.assign(new NativeDmoError('DMO_HTTP_ERROR'), { status: 404 });
    },
  });
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.result.items, []);
  assert.deepEqual(result.diagnostics.warnings, []);
  await assert.rejects(readdir(path.join(cwd, 'data360', 'dmo')), { code: 'ENOENT' });
});

test('a calculated insight read but not represented is written verbatim and its old SQL reported', async () => {
  const cwd = await root('ci');
  const name = 'Draft__cio';
  const folder = path.join(cwd, 'data360', 'calculatedInsights');
  await mkdir(folder, { recursive: true });
  const sql = path.join(folder, `${name}.calculatedInsight-meta.sql`);
  await writeFile(sql, 'SELECT 1\n');
  const command = retrieveCommand([`calculated-insight:${name}`], cwd, true);
  command.createCalculatedInsightClient = () => ({
    get: async (apiName) => ({ apiName, draft: true }),
  });
  command.acquireCalculatedInsight = async (client, apiName) => {
    await client.get(apiName);
    throw new CalculatedInsightError('CI_DRAFT_WITHOUT_SQL');
  };
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  const [item] = result.result.items;
  assert.equal(item.family, 'calculated-insight');
  assert.deepEqual(item.verbatim, { reason: 'CI_DRAFT_WITHOUT_SQL' });
  assert.equal(item.companionPath, undefined);
  assert.match(result.diagnostics.warnings[0], /left in place/u);
  assert.equal(await readFile(sql, 'utf8'), 'SELECT 1\n');
  const saved = JSON.parse(await readFile(item.path, 'utf8'));
  assert.deepEqual(saved.verbatim.native, { apiName: name, draft: true });
});

test('a selection entry, segment or DMO, that is verbatim is written and reported', async () => {
  const selected = await acquireRetrieveSelection(
    [{ kind: 'segment', dataSpace: 'default', apiName: 'Audience' }],
    {},
    { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
    {
      segment: async (_connection, apiName) =>
        carryNativeResponse(
          { identity: { dataSpace: 'default', apiName }, blockers: ['UNSUPPORTED_SEGMENT_TYPE'] },
          { name: apiName, segmentType: 'UI' },
        ),
    },
  );
  assert.equal(selected.length, 1);
  assert.ok(isVerbatimDocument(selected[0].document, 'segment'));
  assert.equal(selected[0].document.verbatim.reason, 'UNSUPPORTED_SEGMENT_TYPE');
  // An acquisition that read nothing (an HTTP failure) stays a refusal of the selection.
  await assert.rejects(
    acquireRetrieveSelection(
      [{ kind: 'segment', dataSpace: 'default', apiName: 'Audience' }],
      {},
      { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
      {
        segment: async (_connection, apiName) => ({
          identity: { dataSpace: 'default', apiName },
          blockers: ['SEGMENT_ACQUISITION_FAILED'],
        }),
      },
    ),
    { code: 'SEGMENT_ACQUISITION_FAILED' },
  );

  const cwd = await root('selection');
  const command = retrieveCommand(['segment:Audience'], cwd, false);
  command.acquireSelection = async () => selected;
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].family, 'segment');
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNSUPPORTED_SEGMENT_TYPE' });
  assert.match(result.diagnostics.warnings[0], /^segment:Audience: retrieved as-is/u);
});

const entry = (name, field = 'BRef__c') => ({
  name,
  status: 'ACTIVE',
  cardinality: 'ManyToOne',
  owner: 'DataCloud',
  sourceObject: { name: 'A__dlm' },
  sourceField: { name: field },
  targetObject: { name: 'B__dlm' },
  targetField: { name: 'Id__c' },
});

test('a relationship the document cannot represent is returned verbatim with its raw entry', async () => {
  const documents = await retrieveNativeRelationships(
    'A__dlm',
    {
      list: async () => ({
        relationships: [entry('Good'), entry('Odd', 'Bad Field')],
        totalSize: 2,
      }),
    },
    'default',
  );
  assert.equal(documents[0].kind, 'relationship');
  assert.deepEqual(carriedNativeResponse(documents[0]), { native: entry('Good') });
  assert.ok(isVerbatimDocument(documents[1], 'relationship'));
  assert.equal(documents[1].identity.apiName, 'Odd');
  assert.deepEqual(documents[1].verbatim.native, sortKeysDeep(entry('Odd', 'Bad Field')));
});

/**
 * A project with one normal DMO, one verbatim DMO and a verbatim CI with a leftover SQL file.
 * @returns {Promise<string>} Project root.
 */
const project = async () => {
  const cwd = await root('deploy');
  await writeNativeDmoDocument(
    normalizeNativeDmo({ ...dmoNative(), name: 'Normal__dlm' }, 'default'),
    cwd,
    false,
  );
  await writeNativeDmoDocument(verbatimDmo(), cwd, false);
  const ci = createVerbatimDocument(
    'calculated-insight',
    { dataSpace: 'default', apiName: 'Draft__cio' },
    'CI_DRAFT_WITHOUT_SQL',
    { apiName: 'Draft__cio' },
  );
  const written = await writeNativeCalculatedInsightDocument(ci, cwd, false);
  await writeFile(written.path.replace(/\.json$/u, '.sql'), 'SELECT 1\n');
  return cwd;
};

test('deploy inputs skip verbatim files in a folder with one warning each', async () => {
  const cwd = await project();
  const inputs = await readDeployInputs({ cwd, sourceDir: ['data360'] });
  assert.deepEqual(
    inputs.map((input) => input.document.identity.apiName),
    ['Normal__dlm'],
  );
  const warnings = skippedVerbatimWarnings(inputs);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /calculated-insight Draft__cio .*reason CI_DRAFT_WITHOUT_SQL/u);
  assert.match(warnings[1], /dmo Example__dlm .*reason INVALID_DMO_FIELD/u);
  assert.deepEqual(skippedVerbatimWarnings([]), []);
  // A Git range names every changed file and still skips them.
  const git = await readDeployInputs({ cwd, metadata: [`dmo:${dmoName}`], verbatim: 'skip' });
  assert.deepEqual(git, []);
  assert.equal(skippedVerbatimWarnings(git).length, 1);
});

for (const [label, flags] of [
  ['an exact file', { sourceDir: [`data360/dmo/${dmoName}.dmo-meta.json`] }],
  ['a selector', { metadata: [`dmo:${dmoName}`] }],
  [
    'the SQL file of a verbatim insight',
    { sourceDir: ['data360/calculatedInsights/Draft__cio.calculatedInsight-meta.sql'] },
  ],
])
  test(`a verbatim file named as ${label} is refused before any call`, async () => {
    const cwd = await project();
    await assert.rejects(readDeployInputs({ cwd, ...flags }), (error) => {
      assert.ok(error instanceof DeployInputError);
      assert.equal(error.code, 'VERBATIM_NOT_DEPLOYABLE');
      assert.match(error.message, /retrieved as-is \(verbatim, reason [A-Z_]+\)/u);
      assert.match(
        error.message,
        flags.metadata ? /dmo Example__dlm/u : /(dmo Example__dlm|calculated-insight Draft__cio)/u,
      );
      return true;
    });
  });

test('publish refuses a verbatim calculated insight with its kind, name and reason', async () => {
  const cwd = await project();
  const command = Object.create(Publish.prototype);
  command.parse = async () => ({
    flags: {
      'source-dir': 'data360/calculatedInsights/Draft__cio.calculatedInsight-meta.json',
      preview: true,
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = (flags) => readDeployInputs({ ...flags, cwd });
  command.resolveConnection = async () => assert.fail('no org access');
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.errors[0].code, 'VERBATIM_NOT_DEPLOYABLE');
  assert.match(
    result.diagnostics.errors[0].message,
    /calculated-insight Draft__cio was retrieved as-is \(verbatim, reason CI_DRAFT_WITHOUT_SQL\)/u,
  );
});

/**
 * Offline deploy command reading the inputs of a synthetic project; any org access fails.
 * @param {string} cwd Project root.
 * @param {object} flags Flag overrides.
 * @returns {object} Command.
 */
const deployCommand = (cwd, flags) => {
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({ flags: { preview: false, 'api-version': 'auto', ...flags } });
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.resolveInputs = (options) => readDeployInputs({ ...options, cwd });
  return command;
};

test('deploy refuses a named verbatim file before any org call, naming kind, name and reason', async () => {
  const cwd = await project();
  const result = await run(
    deployCommand(cwd, { 'source-dir': [`data360/dmo/${dmoName}.dmo-meta.json`] }),
  );
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.diagnostics.errors.map((error) => error.code),
    ['VERBATIM_NOT_DEPLOYABLE'],
  );
  assert.match(
    result.diagnostics.errors[0].message,
    /^The dmo Example__dlm was retrieved as-is \(verbatim, reason INVALID_DMO_FIELD\)/u,
  );
});

test('a deployed folder holding only verbatim files deploys nothing and warns', async () => {
  const cwd = await root('deploy-only');
  await writeNativeDmoDocument(verbatimDmo(), cwd, false);
  const result = await run(deployCommand(cwd, { 'source-dir': ['data360/dmo'] }));
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.items, []);
  assert.equal(result.diagnostics.warnings.length, 1);
  assert.match(result.diagnostics.warnings[0], /^Skipped .*Example__dlm\.dmo-meta\.json: the dmo/u);
});

test('a deleted verbatim file is admitted by family and name, without SQL or spec', () => {
  const bytes = Buffer.from(serializeVerbatimDocument(verbatimDmo()));
  const admitted = admitDeletedArtifact('dmo', dmoName, bytes);
  assert.deepEqual(admitted.identity, { dataSpace: 'default', apiName: dmoName });
  assert.ok(isVerbatimDocument(admitted.document, 'dmo'));
  assert.ok(Object.isFrozen(admitted.document));
  assert.throws(() => admitDeletedArtifact('dmo', 'Other__dlm', bytes), { code: 'INVALID_SOURCE' });
  const ci = createVerbatimDocument(
    'calculated-insight',
    { dataSpace: 'default', apiName: 'Draft__cio' },
    'CI_DRAFT_WITHOUT_SQL',
    {},
  );
  assert.equal(
    admitDeletedArtifact(
      'calculated-insight',
      'Draft__cio',
      Buffer.from(serializeVerbatimDocument(ci)),
    ).identity.apiName,
    'Draft__cio',
  );
  const relationship = (native) =>
    Buffer.from(
      serializeVerbatimDocument(
        createVerbatimDocument(
          'relationship',
          { dataSpace: 'default', apiName: 'Odd' },
          'A_B',
          native,
        ),
      ),
    );
  assert.equal(
    admitDeletedArtifact('relationship', 'Odd', relationship({ sourceObject: { name: 'A__dlm' } }))
      .sourceObjectName,
    'A__dlm',
  );
  // Without its source DMO a relationship cannot be found by name.
  assert.throws(() => admitDeletedArtifact('relationship', 'Odd', relationship({})), {
    code: 'INVALID_SOURCE',
  });
});
