import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import { validateSegmentDocument, segmentWriteBody } from '../lib/artifacts/segment-document.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import {
  listSegmentNames,
  projectSegment,
  retrieveSegment,
} from '../lib/services/retrieve-segment.js';
import {
  bindSegmentChildren,
  bindSegmentDependencies,
} from '../lib/services/bind-segment-dependencies.js';
import { preflightSegmentDeploy } from '../lib/services/preflight-segment-deploy.js';
import {
  dataTransformSpace,
  observeDataTransform,
  validateDataTransformDocument,
} from '../lib/artifacts/data-transform-document.js';
import { preflightDataTransformDeploy } from '../lib/services/preflight-data-transform-deploy.js';
import { retrieveDataTransform } from '../lib/services/retrieve-data-transform.js';
import {
  readDataTransformSpaces,
  resolveDataTransformSpace,
} from '../lib/services/data-transform-space.js';
import { deleteDataTransform } from '../lib/services/delete-data-transform.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Delete from '../lib/commands/data360/delete.js';
import { dataSpaceDirectory } from '../lib/services/data-space-check.js';
import { offlineDataSpaces } from './support/offline-data-spaces.mjs';

// Live API 68 (DB data360:dataspace-uniqueness-20261118-api68, dataspace-name-spelling-api68):
// a dataspace2 segment is stored as ds2_<Name>, transforms keep their plain names.
const SPACE = 'dataspace2';
const sql = 'SELECT ds2_Individual__dlm.Id__c FROM ds2_Individual__dlm WHERE 1 = 0';
const segment = (overrides = {}) => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: SPACE,
  identity: { apiName: 'ds2_Spring' },
  spec: {
    displayName: 'Spring',
    description: '',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', apiName: 'ds2_Individual__dlm' },
    models: [{ name: 'Spring', sql }],
    lookbackPeriod: 'P90D',
  },
  ...overrides,
});
const segmentGet = (overrides = {}) => ({
  apiName: 'ds2_Spring',
  dataSpace: SPACE,
  displayName: 'Spring',
  segmentType: 'DBT',
  segmentOnApiName: 'ds2_Individual__dlm',
  includeDbt: { models: [{ name: 'Spring', sql }] },
  publishInterval: 'NO_REFRESH',
  lookbackPeriod: 'P90D',
  ...overrides,
});
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '68.0',
  getUsername: () => 'synthetic@example.invalid',
};

test('a segment file carries c__dataSpace; the old identity and segmentOn keys are refused', () => {
  assert.equal(validateSegmentDocument(segment()).c__dataSpace, SPACE);
  const legacy = segment();
  legacy.identity.dataSpace = SPACE;
  assert.throws(() => validateSegmentDocument(legacy), { code: 'LEGACY_DATASPACE_KEY' });
  const onLegacy = segment();
  onLegacy.spec.segmentOn.dataSpace = SPACE;
  assert.throws(() => validateSegmentDocument(onLegacy), {
    code: 'LEGACY_DATASPACE_KEY',
    message: /spec\.segmentOn\.dataSpace/u,
  });
  const missing = segment();
  delete missing.c__dataSpace;
  assert.throws(() => validateSegmentDocument(missing), { code: 'INVALID_DATASPACE_FIELD' });
  // The stored name goes as developerName unchanged; the plugin adds and strips nothing.
  assert.equal(
    segmentWriteBody(validateSegmentDocument(segment()), true).developerName,
    'ds2_Spring',
  );
});

test('a segment node keys the segment, its DMO and its children in the segment data space', () => {
  const waterfall = segment({
    spec: {
      displayName: 'Tiers',
      description: '',
      segmentType: 'Waterfall',
      segmentOn: { kind: 'dmo', apiName: 'ds2_Individual__dlm' },
      childSegments: ['ds2_First'],
    },
  });
  assert.deepEqual(documentDependencyNode(waterfall), {
    identity: { kind: 'segment', dataSpace: SPACE, apiName: 'ds2_Spring' },
    dependencies: [
      { kind: 'dmo', dataSpace: SPACE, apiName: 'ds2_Individual__dlm' },
      { kind: 'segment', dataSpace: SPACE, apiName: 'ds2_First' },
    ],
  });
});

test('retrieve reads a dataspace2 segment by its stored name and refuses one of another space', async () => {
  const urls = [];
  const reader = (body) => ({
    ...connection,
    request: async (request) => {
      urls.push(request.url);
      return { segments: [body] };
    },
  });
  const read = await retrieveSegment(reader(segmentGet()), 'ds2_Spring', '68.0', SPACE, 'retrieve');
  assert.deepEqual(read.blockers, []);
  assert.equal(read.candidate.c__dataSpace, SPACE);
  assert.deepEqual(read.candidate.identity, { apiName: 'ds2_Spring' });
  assert.deepEqual(read.identity, { dataSpace: SPACE, apiName: 'ds2_Spring' });
  // The item GET takes no data space: the stored name is unique in the org.
  assert.ok(urls.every((url) => url.endsWith('/ssot/segments/ds2_Spring')));
  const other = await retrieveSegment(
    reader(segmentGet({ apiName: 'Spring', dataSpace: 'default' })),
    'Spring',
    '68.0',
    SPACE,
    'retrieve',
  );
  assert.deepEqual(other.blockers, ['SEGMENT_DATASPACE_MISMATCH']);
  assert.match(
    other.explanation,
    /Spring is in the data space default, but the run's data space is dataspace2/u,
  );
  assert.equal(
    projectSegment({ segments: [segmentGet()] }, 'ds2_Spring', 'retrieve').candidate.c__dataSpace,
    SPACE,
  );
});

test('the segment list is filtered by each entry data space, not by a query parameter', async () => {
  const urls = [];
  const lister = {
    instanceUrl: connection.instanceUrl,
    request: async (request) => {
      urls.push(request.url);
      return {
        totalSize: 3,
        segments: [
          { apiName: 'Spring', dataSpace: 'default' },
          { apiName: 'ds2_Spring', dataSpace: SPACE },
          { apiName: 'ds2_Autumn', dataSpace: SPACE },
        ],
      };
    },
  };
  assert.deepEqual(await listSegmentNames(lister, [], SPACE), ['ds2_Autumn', 'ds2_Spring']);
  assert.deepEqual(await listSegmentNames(lister, []), ['Spring']);
  assert.ok(urls.every((url) => !url.includes('dataspace')));
});

/**
 * A DMO read naming a data space.
 * @param {string} dataSpaceName Data space of the read.
 * @returns {Function} The read.
 */
const dmo = (dataSpaceName) => async () => ({
  name: 'ds2_Individual__dlm',
  id: 'dmo-id',
  dataSpaceName,
});
/**
 * A child segment read naming a data space.
 * @param {string} dataSpace Data space of the read.
 * @returns {Function} The read.
 */
const child = (dataSpace) => async (name) => ({
  segments: [{ apiName: name, dataSpace, marketSegmentDefinitionId: '3HX000000000001AAA' }],
});

test('a segmentOn DMO or Waterfall child of another data space is refused before any write', async () => {
  const [binding] = await bindSegmentDependencies(segment(), connection, '68.0', SPACE, dmo(SPACE));
  assert.equal(binding.targetId, 'dmo-id');
  await assert.rejects(
    bindSegmentDependencies(segment(), connection, '68.0', SPACE, dmo('default')),
    {
      code: 'SEGMENT_DEPENDENCY_OTHER_DATASPACE',
      message: /its DMO ds2_Individual__dlm, which is in the data space default/u,
    },
  );
  const waterfall = segment({
    spec: {
      displayName: 'Tiers',
      description: '',
      segmentType: 'Waterfall',
      segmentOn: { kind: 'dmo', apiName: 'ds2_Individual__dlm' },
      childSegments: ['Child'],
    },
  });
  const [bound] = await bindSegmentChildren(waterfall, connection, '68.0', child(SPACE));
  assert.deepEqual(bound.identity, { kind: 'segment', dataSpace: SPACE, apiName: 'Child' });
  await assert.rejects(bindSegmentChildren(waterfall, connection, '68.0', child('default')), {
    code: 'SEGMENT_DEPENDENCY_OTHER_DATASPACE',
    message:
      /the child segment Child, which is in the data space default, not in the segment's data space dataspace2/u,
  });
});

test('segment preflight refuses a file of another data space than the run', async () => {
  const preview = await preflightSegmentDeploy(segment(), connection, '68.0', 'default', async () =>
    assert.fail('no read'),
  );
  assert.equal(preview.outcome, 'blocked');
  assert.equal(preview.diagnostics[0].code, 'SEGMENT_DATASPACE_MISMATCH');
});

/**
 * A deploy command on resolved segment or transform inputs, preview only.
 * @param {object[]} inputs Resolved inputs.
 * @param {object} flags Flag overrides.
 * @returns {object} Command and observed calls.
 */
function deployOf(inputs, flags = {}) {
  const calls = [];
  const command = Object.create(Deploy.prototype);
  command.config = { pjson: { version: '2.151.7' } };
  command.parse = async () => ({
    flags: {
      preview: true,
      'api-version': 'auto',
      dataspace: SPACE,
      metadata: ['segment:ds2_Spring'],
      'target-org': {
        getOrgId: () => 'synthetic-target',
        getUsername: () => 'synthetic@example.invalid',
        getConnection: () => ({ ...connection }),
      },
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.resolveInputs = async () => inputs;
  command.captureInput = async () => 'same';
  command.verifySegmentInput = async () => {};
  command.preflightSegment = async (value, _connection, _version, space) => {
    calls.push(['preflight', value.identity.apiName, space]);
    return {
      family: 'segment',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: ['processing'],
    };
  };
  return { command, calls };
}

const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};

test('deploy previews a dataspace2 segment with its stored ds2_ name in that data space', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => [{ name: 'default' }, { name: SPACE, prefix: 'ds2' }];
  try {
    const ok = deployOf([{ path: 'ds2_Spring.segment.json', document: segment() }]);
    const result = await run(ok.command);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(ok.calls, [['preflight', 'ds2_Spring', SPACE]]);
    assert.deepEqual(result.result.items[0].identity, { dataSpace: SPACE, apiName: 'ds2_Spring' });
    // A name without the prefix would be stored as ds2_<Name>: refused before any read.
    const plain = deployOf([
      { path: 'Spring.segment.json', document: segment({ identity: { apiName: 'Spring' } }) },
    ]);
    const refused = await run(plain.command);
    assert.equal(refused.status, 'blocked');
    assert.deepEqual(plain.calls, []);
    assert.equal(refused.diagnostics.errors[0].code, 'SEGMENT_NAME_NOT_STORED');
    assert.match(refused.diagnostics.errors[0].message, /would be created as ds2_Spring/u);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('deploy refuses a segment or transform file of another data space before any read', async () => {
  dataSpaceDirectory.read = async () => [...offlineDataSpaces];
  const other = deployOf([
    {
      path: 'Spring.segment.json',
      document: segment({ c__dataSpace: 'default', identity: { apiName: 'Spring' } }),
    },
  ]);
  const result = await run(other.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(other.calls, []);
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_DATASPACE_MISMATCH');
  assert.match(
    result.diagnostics.errors[0].message,
    /names the data space default in c__dataSpace, but the run's data space is dataspace2/u,
  );
  const transform = deployOf(
    [{ path: 'T.dataTransform.json', document: transformFile('default') }],
    { metadata: ['data-transform:T'] },
  );
  transform.command.createDataTransformClient = () => assert.fail('no transform read');
  const refused = await run(transform.command);
  assert.equal(refused.status, 'blocked');
  assert.equal(refused.diagnostics.errors[0].code, 'TRANSFORM_DATASPACE_MISMATCH');
});

/**
 * A transform file on DMOs of a data space, or on DLOs (no dataSpaceName).
 * @param {string} space c__dataSpace.
 * @param {string | false} [dataSpaceName] definition.dataSpaceName; false for a transform on DLOs.
 * @returns {object} Transform document.
 */
function transformFile(space, dataSpaceName = space) {
  return {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    c__dataSpace: space,
    definition: {
      name: 'T',
      type: 'BATCH',
      ...(dataSpaceName === false ? {} : { dataSpaceName }),
      definition: { type: 'DCSQL', manifest: {} },
    },
  };
}

test('a transform file names its data space; dataSpaceName, when present, must agree', () => {
  const onDmos = validateDataTransformDocument(transformFile(SPACE));
  assert.equal(onDmos.c__dataSpace, SPACE);
  assert.equal(onDmos.definition.dataSpaceName, SPACE);
  // Without dataSpaceName the file's c__dataSpace stands; the org record decides on writes.
  const unnamed = validateDataTransformDocument(transformFile(SPACE, false));
  assert.equal(Object.hasOwn(unnamed.definition, 'dataSpaceName'), false);
  assert.equal(dataTransformSpace(unnamed.definition), undefined);
  assert.throws(() => validateDataTransformDocument(transformFile(SPACE, 'default')), {
    code: 'INVALID_DATASPACE_FIELD',
    message: /c__dataSpace must name the data space of definition\.dataSpaceName/u,
  });
  const missing = transformFile(SPACE);
  delete missing.c__dataSpace;
  assert.throws(() => validateDataTransformDocument(missing), { code: 'INVALID_DATASPACE_FIELD' });
  const id = '1dt000000000001AAA';
  assert.equal(
    observeDataTransform({ id, ...transformFile(SPACE).definition }, {}).document.c__dataSpace,
    SPACE,
  );
  // A GET without dataSpaceName needs the resolved data space.
  assert.throws(() => observeDataTransform({ id, ...transformFile(SPACE, false).definition }, {}), {
    code: 'INVALID_TRANSFORM_RESPONSE',
  });
  assert.equal(
    observeDataTransform({ id, ...transformFile(SPACE, false).definition }, {}, 'deploy', SPACE)
      .document.c__dataSpace,
    SPACE,
  );
});

const transformId = '1dt000000000001AAA';
// The MktDataTransform record of a transform without any data space (a system transform).
const noSpace = JSON.parse('null');
/**
 * A transform client over one GET and the org's MktDataTransform records.
 * @param {object} raw The transform GET.
 * @param {string | null} space The data space its record names (null: none).
 * @param {string[]} [ledger] Receives the DELETEs.
 * @returns {object} Client.
 */
const orgTransform = (raw, space, ledger = []) => ({
  list: async () => ({ totalSize: 1, dataTransforms: [{ id: transformId, name: raw.name }] }),
  get: async () => structuredClone(raw),
  schedule: async () => ({}),
  dataSpaces: async () => new Map([[transformId, space]]),
  validate: async () => ({ issues: [] }),
  delete: async (id) => {
    ledger.push(id);
  },
});

test('a GET without dataSpaceName takes its data space from the MktDataTransform record', async () => {
  const raw = { id: transformId, ...transformFile(SPACE, false).definition };
  const read = await retrieveDataTransform(transformId, orgTransform(raw, SPACE), 'retrieve');
  assert.equal(read.document.c__dataSpace, SPACE);
  // A transform without any data space (a system transform) is handled in default only.
  const system = await retrieveDataTransform(transformId, orgTransform(raw, noSpace), 'retrieve');
  assert.equal(system.document.c__dataSpace, 'default');
  await assert.rejects(
    retrieveDataTransform(transformId, orgTransform(raw, noSpace), 'retrieve', [], SPACE),
    { code: 'TRANSFORM_DATASPACE_MISMATCH' },
  );
  // The record must be there: never a guess.
  const unknown = { ...orgTransform(raw, SPACE), dataSpaces: async () => new Map() };
  await assert.rejects(retrieveDataTransform(transformId, unknown, 'retrieve'), {
    code: 'TRANSFORM_DATASPACE_UNREADABLE',
  });
});

test('the MktDataTransform record is found by record ID only, never by its Name (a label)', async () => {
  const other = '1dt000000000002AAA';
  // Live API 68: Name is the label (spaces and all); one record's label is T, the API name below.
  const records = {
    done: true,
    totalSize: 2,
    records: [
      { Id: transformId, Name: 'Public acceptance transform', DataSpace: { Name: SPACE } },
      { Id: other, Name: 'T', DataSpace: { Name: 'default' } },
    ],
  };
  const spaces = await readDataTransformSpaces(async (query) => {
    assert.equal(query, 'SELECT Id, DataSpace.Name FROM MktDataTransform');
    return records;
  });
  assert.equal(spaces.has('T'), false);
  assert.equal(spaces.get(transformId.slice(0, 15)), SPACE);
  const raw = { id: transformId, ...transformFile(SPACE, false).definition };
  assert.equal(await resolveDataTransformSpace(raw, async () => spaces), SPACE);
  // Without an ID, or with one the records lack, nothing is guessed from the name.
  for (const value of [
    { ...raw, id: undefined },
    { ...raw, id: '1dt000000000009AAA' },
  ])
    await assert.rejects(
      resolveDataTransformSpace(value, async () => spaces),
      {
        code: 'TRANSFORM_DATASPACE_UNREADABLE',
      },
    );
});

test('the space is resolved before projection: an unmodellable transform of another space is never verbatim', async () => {
  // definition and definitions together cannot be modelled (a verbatim file in its own space).
  const raw = {
    id: transformId,
    ...transformFile(SPACE, false).definition,
    definitions: [{ type: 'DCSQL' }],
  };
  await assert.rejects(
    retrieveDataTransform(transformId, orgTransform(raw, SPACE), 'retrieve', [], 'default'),
    { code: 'TRANSFORM_DATASPACE_MISMATCH' },
  );
  // Retrieve: an item failure, no file.
  const written = [];
  const command = Object.create(Retrieve.prototype);
  command.parse = async () => ({
    flags: { metadata: ['data-transform:T'], 'api-version': 'auto', overwrite: false },
  });
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => ({ ...connection }),
  });
  command.createDataTransformClient = () => orgTransform(raw, SPACE);
  // Object.create skips the class fields: the real acquisition, as the command runs it.
  command.acquireDataTransform = retrieveDataTransform;
  command.writeDataTransform = async (value) => {
    written.push(value);
    return { path: 'x', outcome: 'retrieved' };
  };
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.deepEqual(written, []);
  assert.deepEqual(result.result.items, []);
  assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_DATASPACE_MISMATCH');
});

test('delete -m refuses an org transform of another data space before any DELETE, also an unmodellable one', async () => {
  for (const raw of [
    { id: transformId, ...transformFile(SPACE, false).definition },
    {
      id: transformId,
      ...transformFile(SPACE, false).definition,
      definitions: [{ type: 'DCSQL' }],
    },
  ]) {
    const ledger = [];
    const command = Object.create(Delete.prototype);
    command.parse = async () => ({
      flags: { metadata: ['data-transform:T'], 'delete-dlo': false, preview: false },
    });
    command.jsonEnabled = () => true;
    command.log = () => {};
    command.resolveConnection = async () => ({ getUsername: () => 'offline' });
    command.resolveTarget = async () => 'offline';
    command.createDataTransformClient = () => orgTransform(raw, SPACE, ledger);
    const result = await run(command);
    assert.equal(result.status, 'blocked', JSON.stringify(result.diagnostics));
    assert.deepEqual(ledger, []);
    assert.equal(result.diagnostics.errors[0].code, 'TRANSFORM_DATASPACE_MISMATCH');
  }
});

test('a Git-deleted transform file is deleted only when the org transform is in its data space', async () => {
  // The base content of a deleted file of default; the org transform's record names dataspace2.
  const raw = { id: transformId, ...transformFile('default', false).definition };
  const ledger = [];
  await assert.rejects(
    deleteDataTransform(transformFile('default', false), orgTransform(raw, SPACE, ledger), {
      targetId: transformId,
      confirmDelete: true,
      verifyInput: async () => {},
    }),
    { code: 'TRANSFORM_DATASPACE_MISMATCH' },
  );
  assert.deepEqual(ledger, []);
});

test('a create outside default needs dataSpaceName in the definition', async () => {
  await assert.rejects(
    preflightDataTransformDeploy(
      transformFile(SPACE, false),
      { operation: 'create' },
      orgTransform({ name: 'T' }, SPACE),
    ),
    { code: 'TRANSFORM_DATASPACE_MISMATCH', message: /names no dataSpaceName/u },
  );
  const plan = await preflightDataTransformDeploy(
    transformFile(SPACE),
    { operation: 'create' },
    orgTransform({ name: 'T' }, SPACE),
  );
  assert.equal(plan.operation, 'create');
});

test('a segment deploy outside default is refused when the org names no prefix for the data space', async () => {
  dataSpaceDirectory.read = async () => [...offlineDataSpaces];
  const plain = deployOf([{ path: 'ds2_Spring.segment.json', document: segment() }]);
  const result = await run(plain.command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(plain.calls, []);
  assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_NAME_NOT_STORED');
  assert.match(
    result.diagnostics.errors[0].message,
    /names no prefix for the data space dataspace2/u,
  );
});

test('a transform update is refused when the org transform of that name is in another data space', async () => {
  const id = '1dt000000000001AAA';
  const client = orgTransform({ id, ...transformFile('default').definition }, 'default');
  await assert.rejects(
    preflightDataTransformDeploy(
      transformFile(SPACE),
      { operation: 'update', targetId: id },
      client,
    ),
    {
      code: 'TRANSFORM_DATASPACE_MISMATCH',
      message:
        /The org's data transform T is in the data space default, but the file names dataspace2/u,
    },
  );
});
