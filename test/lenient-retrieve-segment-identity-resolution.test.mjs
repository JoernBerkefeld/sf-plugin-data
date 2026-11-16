import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DeployInputError, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { sortKeysDeep } from '../lib/artifacts/verbatim-document.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { writeIdentityResolutionDocument } from '../lib/artifacts/write-identity-resolution.js';
import { retrieveIdentityResolution } from '../lib/services/retrieve-identity-resolution.js';
import { validateIdentityResolutionDocument } from '../lib/artifacts/identity-resolution-document.js';
import { projectSegment } from '../lib/services/retrieve-segment.js';
import { nativeIrFixture } from './identity-resolution-fixtures.mjs';

// Synthetic project roots under the verified OS temp directory.
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-lenient-segment-ir-'));

/**
 * Offline retrieve command; every GET is answered by `answer`, and the real projections, binder
 * and writers run.
 * @param {string[]} metadata Selectors.
 * @param {string} cwd Project root.
 * @param {(url: string) => unknown} answer Response of one GET.
 * @returns {object} Command.
 */
function command(metadata, cwd, answer) {
  const instance = Object.create(Retrieve.prototype);
  instance.parse = async () => ({
    flags: {
      metadata,
      'api-version': 'auto',
      overwrite: false,
      'target-org': 'synthetic',
      'output-dir': cwd,
    },
  });
  instance.jsonEnabled = () => true;
  instance.log = () => {};
  // Object.create skips the class fields: set the real readers and writers.
  instance.acquireIdentityResolution = retrieveIdentityResolution;
  instance.writeIdentityResolution = writeIdentityResolutionDocument;
  instance.writeSegment = writeSegmentDocument;
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '68.0',
    getUsername: () => 'synthetic',
    request: async (request) =>
      structuredClone(answer(typeof request === 'string' ? request : request.url)),
  };
  instance.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: () => connection,
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

const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm';
const segmentGet = () => ({
  segments: [
    {
      apiName: 'Audience',
      displayName: 'Audience',
      dataSpace: 'default',
      segmentType: 'DBT',
      segmentOnApiName: 'Person__dlm',
      includeDbt: { models: [{ name: 'Audience', sql }] },
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
      segmentStatus: 'ACTIVE',
    },
  ],
});
const segmentDirectory = (cwd) => path.join(cwd, 'data360', 'segments');

/**
 * Retrieve the Audience segment through the command.
 * @param {object} raw Segment GET.
 * @param {object} dmo DMO detail read for the binding.
 * @returns {Promise<{result: object, cwd: string}>} Envelope and project root.
 */
async function retrieveSegment(raw, dmo) {
  const cwd = await scratch();
  const instance = command(['segment:Audience'], cwd, (url) =>
    url.includes('/ssot/segments/') ? raw : dmo,
  );
  return { result: await run(instance), cwd };
}
const deploySegment = (cwd) => readDeployInputs({ cwd, metadata: ['segment:Audience'] });
/**
 * Whether a deploy refusal is INVALID_SOURCE naming this key path and problem.
 * @param {string} family File family in the message.
 * @param {string} keyPath Key path.
 * @param {string} problem Problem text.
 * @returns {(error: unknown) => boolean} Matcher.
 */
const refusal = (family, keyPath, problem) => (error) =>
  error instanceof DeployInputError &&
  error.code === 'INVALID_SOURCE' &&
  error.message.includes(`The ${family} file cannot be deployed: ${keyPath} ${problem}`);

for (const [label, change, reason] of [
  [
    'a refresh schedule',
    (segment) => (segment.publishInterval = 'TWELVE_HOURS'),
    'UNSUPPORTED_SEGMENT_VARIANT',
  ],
  [
    'a 30-day lookback',
    (segment) => (segment.lookbackPeriod = 'P30D'),
    'UNSUPPORTED_SEGMENT_VARIANT',
  ],
  [
    'parameters',
    (segment) => (segment.parameters = [{ name: 'Region' }]),
    'UNSUPPORTED_SEGMENT_VARIANT',
  ],
  [
    'no DBT configuration (a UI segment)',
    (segment) => {
      segment.segmentType = 'UI';
      delete segment.includeDbt;
      segment.includeCriteria = { filter: 'any' };
    },
    'UNSUPPORTED_SEGMENT_VARIANT',
  ],
  [
    'a model name that cannot be a file name',
    (segment) => (segment.includeDbt.models[0].name = 'audience model 1'),
    'INVALID_SEGMENT_DOCUMENT',
  ],
  [
    'two model names differing only in case',
    (segment) => segment.includeDbt.models.push({ name: 'AUDIENCE', sql }),
    'INVALID_SEGMENT_DOCUMENT',
  ],
])
  test(`retrieve writes a segment with ${label} verbatim; deploy refuses it`, async () => {
    const raw = segmentGet();
    change(raw.segments[0]);
    const { result, cwd } = await retrieveSegment(raw, { name: 'Person__dlm', id: 'source-local' });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.errors, []);
    const [item] = result.result.items;
    assert.equal(item.family, 'segment');
    assert.deepEqual(item.verbatim, { reason });
    assert.match(result.diagnostics.warnings.join('\n'), new RegExp(`reason ${reason}`, 'u'));
    const saved = JSON.parse(await readFile(item.path, 'utf8'));
    assert.equal(saved.kind, 'segment');
    assert.deepEqual(saved.identity, { dataSpace: 'default', apiName: 'Audience' });
    assert.deepEqual(saved.verbatim.native, sortKeysDeep(raw));
    assert.deepEqual(await readdir(segmentDirectory(cwd)), ['Audience.segment.json']);
    await assert.rejects(deploySegment(cwd), { code: 'VERBATIM_NOT_DEPLOYABLE' });
  });

test('retrieve keeps unknown DBT segment keys and warns about an unbound DMO; deploy refuses, naming the key', async () => {
  const raw = segmentGet();
  // A wrapper with more than one segment and an extra key: only segments[0] is read.
  raw.nextPageUrl = '';
  raw.segments.push({ apiName: 'Other' });
  const [segment] = raw.segments;
  segment.futureSetting = { nested: [1, 2] };
  segment.includeDbt.futureDbtKey = 'kept';
  segment.includeDbt.models[0].futureModelKey = true;
  // Observed fields are not checked on retrieve.
  segment.createdBy = { id: 'x', name: 'extra' };
  segment.parameters = [];
  const { result, cwd } = await retrieveSegment(raw, { name: 'Other__dlm', id: 'x' });
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics.errors, []);
  assert.equal(result.result.items[0].verbatim, undefined);
  assert.match(
    result.diagnostics.warnings.join('\n'),
    /segment:Audience: its DMO Person__dlm could not be checked \(SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING\)/u,
  );
  const directory = segmentDirectory(cwd);
  const file = path.join(directory, 'Audience.segment.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(saved.spec).slice(-2), ['includeDbt', 'futureSetting']);
  assert.deepEqual(saved.spec.includeDbt, { futureDbtKey: 'kept' });
  assert.deepEqual(saved.spec.futureSetting, { nested: [1, 2] });
  assert.deepEqual(saved.spec.models, [{ name: 'Audience', futureModelKey: true }]);
  assert.equal(await readFile(path.join(directory, 'Audience.segment.Audience.sql'), 'utf8'), sql);
  // Deploy mode still refuses the response, unchanged.
  assert.throws(() => projectSegment(raw, 'Audience'), { code: 'INVALID_SEGMENT_RESPONSE' });
  await assert.rejects(deploySegment(cwd), refusal('segment', 'spec.includeDbt', 'is not a key'));
  delete saved.spec.includeDbt;
  delete saved.spec.futureSetting;
  await writeFile(file, `${JSON.stringify(saved, undefined, 2)}\n`);
  await assert.rejects(
    deploySegment(cwd),
    refusal('segment', 'spec.models[0].futureModelKey', 'is not a key'),
  );
});

const irName = 'Individual_A1b2';
const irFile = (cwd) =>
  path.join(cwd, 'data360', 'identityResolution', `${irName}.identityResolution.json`);

/**
 * Retrieve the synthetic identity resolution through the command.
 * @param {object} native Owner GET.
 * @returns {Promise<{result: object, cwd: string}>} Envelope and project root.
 */
async function retrieveIr(native) {
  const cwd = await scratch();
  const instance = command([`identity-resolution:${irName}`], cwd, () => native);
  return { result: await run(instance), cwd };
}
const deployIr = (cwd) => readDeployInputs({ cwd, metadata: [`identity-resolution:${irName}`] });

test('retrieve keeps unknown identity resolution keys and nulls; deploy refuses, naming the key', async () => {
  const native = nativeIrFixture();
  native.futureOwnerKey = 'kept';
  // The GET answers unset values as JSON null.
  Object.assign(
    native,
    JSON.parse('{"doesRunAutomatically":null,"description":null,"rulesetId":null}'),
  );
  native.matchRules[0].futureRuleKey = 1;
  native.matchRules[0].criteria[0].futureCriterionKey = 'x';
  native.matchRules[0].criteria[1].partyIdentificationInfo = JSON.parse('null');
  native.matchRules.push(structuredClone(native.matchRules[0]));
  native.reconciliationRules[0].futureReconciliationKey = [];
  native.reconciliationRules[0].sources = [{ name: 'Lead__dll', priority: 1 }];
  native.reconciliationRules[1].sources = JSON.parse('null');
  native.reconciliationRules[1].unifiedDmoName = 'not a DMO name';
  native.reconciliationRules[2].ruleType = JSON.parse('null');
  const { result, cwd } = await retrieveIr(native);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics.errors, []);
  assert.equal(result.result.items[0].verbatim, undefined);
  const saved = JSON.parse(await readFile(irFile(cwd), 'utf8'));
  const { spec } = saved;
  assert.equal(spec.futureOwnerKey, 'kept');
  assert.equal(Object.keys(spec).at(-1), 'futureOwnerKey');
  assert.ok(spec.doesRunAutomatically === null && spec.description === null);
  assert.equal(spec.matchRules[0].futureRuleKey, 1);
  assert.equal(spec.matchRules[0].criteria[0].futureCriterionKey, 'x');
  assert.ok(spec.matchRules[0].criteria[1].partyIdentificationInfo === null);
  assert.equal(spec.matchRules.length, 2);
  assert.deepEqual(spec.reconciliationRules[0].futureReconciliationKey, []);
  assert.deepEqual(spec.reconciliationRules[0].sources, [
    { kind: 'dlo', dataSpace: 'default', apiName: 'Lead__dll', priority: 1 },
  ]);
  assert.ok(spec.reconciliationRules[1].sources === null);
  assert.ok(spec.reconciliationRules[2].ruleType === null);
  // Run statistics and server identities stay out of the file.
  for (const key of ['id', 'rulesetId', 'rulesetStatus', 'objectApiName', 'dataSpaceName'])
    assert.equal(Object.hasOwn(spec, key), false, key);
  await assert.rejects(
    deployIr(cwd),
    refusal('identity resolution', 'spec.futureOwnerKey', 'is not a key'),
  );
  delete saved.spec.futureOwnerKey;
  await writeFile(irFile(cwd), `${JSON.stringify(saved, undefined, 2)}\n`);
  await assert.rejects(
    deployIr(cwd),
    refusal('identity resolution', 'spec.doesRunAutomatically', 'is not true or false'),
  );
  saved.spec.doesRunAutomatically = false;
  saved.spec.description = '';
  assert.throws(
    () => validateIdentityResolutionDocument(saved),
    (error) => error.message.includes('spec.matchRules[0].futureRuleKey is not a key'),
  );
});

for (const key of ['label', 'reconciliationRules', 'secondaryDmo'])
  test(`retrieve writes an identity resolution without ${key} verbatim; deploy refuses it`, async () => {
    const native = nativeIrFixture();
    delete native[key];
    const { result, cwd } = await retrieveIr(native);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.errors, []);
    const [item] = result.result.items;
    assert.deepEqual(item.verbatim, { reason: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION' });
    const saved = JSON.parse(await readFile(irFile(cwd), 'utf8'));
    assert.deepEqual(saved.verbatim.native, sortKeysDeep(native));
    await assert.rejects(deployIr(cwd), { code: 'VERBATIM_NOT_DEPLOYABLE' });
  });
