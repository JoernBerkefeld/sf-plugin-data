import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  dependencyKey,
  documentDependencyNode,
  orderDependencyNodes,
} from '../lib/artifacts/dependency-selection.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import Deploy from '../lib/commands/data360/deploy.js';
const identity = (kind, apiName) => ({ kind, dataSpace: 'default', apiName });
const dmo = (apiName = 'Person__dlm') => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName },
  spec: {
    label: apiName,
    category: 'Other',
    fields: [
      { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, isDynamicLookup: false },
    ],
  },
});
const segment = (apiName = 'Audience') => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName },
  spec: {
    displayName: apiName,
    description: '',
    segmentType: 'DBT',
    segmentOn: identity('dmo', 'Person__dlm'),
    models: [{ name: apiName, sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    dependencies: [{ ...identity('dmo', 'Person__dlm'), fields: ['Id__c'] }],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const fixture = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-dependencies-'));
  await mkdir(path.join(cwd, 'data360/dmo'), { recursive: true });
  const file = path.join(cwd, 'data360/dmo/Person__dlm.dmo-meta.json');
  await writeFile(file, JSON.stringify(dmo()));
  const document = segment();
  await writeSegmentDocument(document, cwd, false);
  return { cwd };
};
test('ready-node tie-break retains reverse-order, same-family edges and isolated roots', () => {
  const a = identity('segment', 'A');
  const b = identity('segment', 'B');
  const isolated = identity('dmo', 'Isolated__dlm');
  const nodes = [
    { identity: a, dependencies: [b] },
    { identity: isolated, dependencies: [] },
    { identity: b, dependencies: [] },
  ];
  const expected = [isolated, b, a].map((value) => dependencyKey(value));
  assert.deepEqual(orderDependencyNodes(nodes), expected);
  assert.deepEqual(orderDependencyNodes(nodes.toReversed()), expected);
});
test('cycles, duplicate identities, unknown family/closure and finite node/edge limits block', () => {
  const a = identity('segment', 'A');
  const b = identity('segment', 'B');
  assert.throws(
    () =>
      orderDependencyNodes([
        { identity: a, dependencies: [b] },
        { identity: b, dependencies: [a] },
      ]),
    { code: 'DEPENDENCY_CYCLE' },
  );
  assert.throws(() => orderDependencyNodes([{ identity: a, dependencies: [a] }]), {
    code: 'DEPENDENCY_CYCLE',
  });
  assert.throws(
    () =>
      orderDependencyNodes([
        { identity: a, dependencies: [] },
        { identity: a, dependencies: [] },
      ]),
    { code: 'DEPENDENCY_DUPLICATE_IDENTITY' },
  );
  assert.throws(() => dependencyKey(identity('graph', 'A')), {
    code: 'DEPENDENCY_IDENTITY_UNSUPPORTED',
  });
  assert.throws(() => documentDependencyNode({ kind: 'graph' }), {
    code: 'DEPENDENCY_CLOSURE_UNSUPPORTED',
  });
  assert.throws(
    () =>
      orderDependencyNodes(
        Array.from({ length: 257 }, (_, index) => ({
          identity: identity('segment', `N${index}`),
          dependencies: [],
        })),
      ),
    { code: 'DEPENDENCY_LIMIT_EXCEEDED' },
  );
  assert.throws(
    () =>
      orderDependencyNodes([
        {
          identity: a,
          dependencies: Array.from({ length: 513 }, (_, index) =>
            identity('dmo', `N${index}__dlm`),
          ),
        },
      ]),
    { code: 'DEPENDENCY_LIMIT_EXCEEDED' },
  );
});
test('a Git-selected Segment keeps its provenance, is never expanded and blocks without acknowledgement', async () => {
  const { cwd } = await fixture();
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  const previousExit = process.exitCode;
  try {
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: {
        'changed-since': 'main',
        'api-version': '65.0',
        'data-space': 'default',
        preview: false,
        'target-org': { getOrgId: () => 'synthetic', getConnection: () => ({}) },
      },
    });
    command.jsonEnabled = () => true;
    command.selectGitInputs = async () => ({
      paths: [roots[0].path],
      segments: roots,
      provenance: { requestedRef: 'main' },
    });
    command.resolveInputs = async () => roots;
    command.verifySegmentInput = async () => {};
    command.preflightNativeDmo = () =>
      assert.fail('the local DMO file is not part of the selection');
    command.preflightSegment = async () => ({
      outcome: 'update',
      requiredEffects: ['processing'],
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
    });
    command.execute = async () => assert.fail('Segment selection must block writes');
    const result = await command.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.provenance.git.requestedRef, 'main');
    assert.equal(result.result.items.length, 1);
    assert.equal('dependencies' in result.result.selection, false);
  } finally {
    process.exitCode = previousExit;
  }
});
