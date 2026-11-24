import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { sortKeysDeep } from '../lib/artifacts/verbatim-document.js';
import {
  observeDataTransform,
  validateDataTransformDocument,
} from '../lib/artifacts/data-transform-document.js';
import { retrieveDataTransform } from '../lib/services/retrieve-data-transform.js';
import { writeDataTransformDocument } from '../lib/artifacts/write-data-transform.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import {
  retrieveNativeCalculatedInsight,
  visualDraftPlaceholder,
} from '../lib/services/native-calculated-insight.js';

// Synthetic project roots under the verified OS temp directory.
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lenient-ci-transform-'));

/**
 * Offline retrieve command over synthetic clients; the real projections and writers run.
 * @param {string[]} metadata Selectors.
 * @param {string} cwd Project root.
 * @returns {object} Command.
 */
function command(metadata, cwd) {
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
  // Object.create skips the class fields: set the real readers and writers.
  instance.acquireCalculatedInsight = retrieveNativeCalculatedInsight;
  instance.writeCalculatedInsight = writeNativeCalculatedInsightDocument;
  instance.acquireDataTransform = retrieveDataTransform;
  instance.writeDataTransform = writeDataTransformDocument;
  instance.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => ({ getUsername: () => 'synthetic' }),
  });
  return instance;
}
const run = async (instance) => {
  const previous = process.exitCode;
  try {
    return await instance.run();
  } finally {
    process.exitCode = previous;
  }
};

const ciName = 'Draft__cio';
const ciGet = (expression) => ({
  apiName: ciName,
  calculatedInsightStatus: 'DRAFT',
  creationType: 'Custom',
  dataSpace: 'default',
  definitionType: 'CALCULATED_METRIC',
  displayName: 'Draft',
  expression,
  isFromPackage: false,
  publishScheduleInterval: 'NOT_SCHEDULED',
});

for (const [label, expression, reason] of [
  ['a Visual Builder draft', visualDraftPlaceholder, 'CI_VISUAL_DRAFT_WITHOUT_SQL'],
  // eslint-disable-next-line unicorn/no-null -- The GET answers a missing SQL as JSON null.
  ['a null expression', null, 'INVALID_CI_DOCUMENT'],
  ['an empty expression', '', 'INVALID_CI_DOCUMENT'],
])
  test(`retrieve writes a calculated insight with ${label} verbatim; deploy refuses it`, async () => {
    const cwd = await scratch();
    const raw = ciGet(expression);
    const instance = command([`calculated-insight:${ciName}`], cwd);
    instance.createCalculatedInsightClient = () => ({ get: async () => structuredClone(raw) });
    const result = await run(instance);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.errors, []);
    const [item] = result.result.items;
    assert.equal(item.family, 'calculated-insight');
    assert.deepEqual(item.verbatim, { reason });
    assert.match(result.diagnostics.warnings.join('\n'), new RegExp(`reason ${reason}`, 'u'));
    const saved = JSON.parse(await readFile(item.path, 'utf8'));
    assert.equal(saved.verbatim.reason, reason);
    assert.deepEqual(saved.verbatim.native, sortKeysDeep(raw));
    await assert.rejects(readDeployInputs({ cwd, metadata: [`calculated-insight:${ciName}`] }), {
      code: 'VERBATIM_NOT_DEPLOYABLE',
    });
  });

const id = '1dt000000000001AAA';
const transformName = 'SyntheticTransform';
const definition = () => ({
  type: 'STL',
  version: '56.0',
  nodes: { LOAD: { action: 'load', parameters: {}, sources: [] } },
});
const transformGet = () => ({
  name: transformName,
  label: 'Synthetic transform',
  type: 'BATCH',
  dataSpaceName: 'default',
  fullRunFrequency: 'DAILY',
  definition: definition(),
  id,
  status: 'ACTIVE',
  creationType: 'CUSTOM',
  createdDate: '2026-11-15T00:00:00.000Z',
  lastRunStatus: 'NONE',
  lastRunDate: '2026-11-15T00:00:00.000Z',
  actionUrls: { runAction: '/not-sendable' },
  url: '/services/data/v68.0/ssot/data-transforms/SyntheticTransform',
});
const schedule = () => ({ frequency: 'None', type: 'None' });

/**
 * Retrieve one transform through the command with the real projection and writer.
 * @param {object} raw Transform GET.
 * @param {() => Promise<unknown>} [readSchedule] Schedule read.
 * @returns {Promise<{result: object, cwd: string}>} Envelope and project root.
 */
async function retrieveTransform(raw, readSchedule = async () => schedule()) {
  const cwd = await scratch();
  const instance = command([`data-transform:${transformName}`], cwd);
  instance.createDataTransformClient = () => ({
    get: async () => structuredClone(raw),
    schedule: readSchedule,
  });
  return { result: await run(instance), cwd };
}
const transformFile = (cwd) =>
  path.join(cwd, 'data360', 'dataTransforms', `${transformName}.dataTransform.json`);
const deployTransform = (cwd) =>
  readDeployInputs({ cwd, metadata: [`data-transform:${transformName}`] });

for (const [label, change] of [
  ['a system-generated', (raw) => (raw.creationType = 'SYSTEM')],
  ['a packaged', (raw) => (raw.namespace = 'owned')],
])
  test(`retrieve writes ${label} transform as a deployable file`, async () => {
    const raw = transformGet();
    change(raw);
    const { result, cwd } = await retrieveTransform(raw);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.result.items[0].verbatim, undefined);
    const saved = JSON.parse(await readFile(transformFile(cwd), 'utf8'));
    assert.deepEqual(saved.definition.definition, definition());
    assert.equal(Object.hasOwn(saved, 'schedule'), false);
    for (const key of ['creationType', 'namespace'])
      assert.equal(Object.hasOwn(saved.definition, key), false, key);
    const [input] = await deployTransform(cwd);
    assert.equal(input.document.definition.name, transformName);
  });

for (const [label, change, reason] of [
  [
    'a definition and definitions',
    (raw) => (raw.definitions = [definition()]),
    'UNSUPPORTED_TRANSFORM_INPUT',
  ],
])
  test(`retrieve writes ${label} transform verbatim; deploy refuses it`, async () => {
    const raw = transformGet();
    change(raw);
    const { result, cwd } = await retrieveTransform(raw);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.result.items[0].verbatim, { reason });
    const saved = JSON.parse(await readFile(transformFile(cwd), 'utf8'));
    assert.equal(saved.kind, 'data-transform');
    assert.equal(saved.c__dataSpace, 'default');
    assert.deepEqual(saved.identity, { apiName: transformName });
    assert.deepEqual(saved.verbatim.native, sortKeysDeep(raw));
    await assert.rejects(deployTransform(cwd), { code: 'VERBATIM_NOT_DEPLOYABLE' });
  });

test('retrieve leaves out a null definition beside definitions; deploy mode refuses both', async () => {
  const raw = transformGet();
  raw.definitions = [definition()];
  // eslint-disable-next-line unicorn/no-null -- The GET answers the unused one as JSON null.
  raw.definition = null;
  const { result, cwd } = await retrieveTransform(raw);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(transformFile(cwd), 'utf8'));
  assert.deepEqual(saved.definition.definitions, [definition()]);
  assert.equal(Object.hasOwn(saved.definition, 'definition'), false);
  validateDataTransformDocument(saved);
  // Deploy mode keeps both and refuses, naming the key.
  assert.throws(
    () => observeDataTransform(raw, schedule()),
    (error) =>
      error.code === 'UNSUPPORTED_TRANSFORM_INPUT' &&
      error.message.includes('definition.definitions is present beside definition.definition'),
  );
});

for (const [label, readSchedule] of [
  [
    'fails',
    async () => {
      throw Object.assign(new Error('read denied'), { statusCode: 500 });
    },
  ],
  ['is not an object', async () => 'none'],
])
  test(`a transform whose schedule read ${label} is still written, with a warning`, async () => {
    const { result, cwd } = await retrieveTransform(transformGet(), readSchedule);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.result.items[0].verbatim, undefined);
    assert.match(
      result.diagnostics.warnings.join('\n'),
      /data-transform:SyntheticTransform: its schedule could not be read/u,
    );
    const saved = JSON.parse(await readFile(transformFile(cwd), 'utf8'));
    assert.deepEqual(saved.definition.definition, definition());
    // Deploy reads the schedule strictly.
    await assert.rejects(
      retrieveDataTransform(transformName, {
        get: async () => transformGet(),
        schedule: readSchedule,
      }),
    );
  });

test('retrieve keeps an unknown transform key; deploy refuses it, naming the key', async () => {
  const raw = transformGet();
  raw.futureKey = { nested: true };
  const { result, cwd } = await retrieveTransform(raw);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(transformFile(cwd), 'utf8'));
  assert.deepEqual(saved.definition.futureKey, { nested: true });
  // Server-owned keys, lastRun* included, stay out of the file.
  for (const key of ['id', 'status', 'creationType', 'lastRunStatus', 'lastRunDate', 'url'])
    assert.equal(Object.hasOwn(saved.definition, key), false, key);
  // Deploy mode still leaves the key out of its projection.
  assert.equal(
    Object.hasOwn(observeDataTransform(raw, schedule()).document.definition, 'futureKey'),
    false,
  );
  await assert.rejects(
    deployTransform(cwd),
    (error) =>
      error instanceof DeployInputError &&
      error.code === 'INVALID_SOURCE' &&
      error.message.includes(
        'The data transform file cannot be deployed: definition.futureKey is not a key',
      ),
  );
});
