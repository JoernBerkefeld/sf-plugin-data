import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  dependencyKey,
  documentDependencyNode,
  orderDependencyNodes,
} from '../lib/artifacts/dependency-selection.js';
import { selectDeployDependencies } from '../lib/services/select-deploy-dependencies.js';
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
  await mkdir(path.join(cwd, 'data360/default/dmo'), { recursive: true });
  const file = path.join(cwd, 'data360/default/dmo/Person__dlm.json');
  await writeFile(file, JSON.stringify(dmo()));
  const document = segment();
  const sql = document.spec.models[0].sql;
  const xml = `<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;${sql}&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;</includeCriteria><masterLabel>Audience</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>`;
  await writeSegmentDocument(document, xml, cwd, false);
  return { cwd, file };
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
test('local opt-in expands once, keeps immutable Git pair roots and exact byte guards', async () => {
  const { cwd, file } = await fixture();
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  const root = roots[0];
  const selected = await selectDeployDependencies([...roots, ...roots], cwd);
  assert.deepEqual(
    selected.inputs.map((input) => input.document.kind),
    ['dmo', 'segment'],
  );
  assert.equal(selected.inputs[1], root);
  assert.equal(selected.inputs[1].inputDigest, root.inputDigest);
  assert.equal(selected.reasons.get('segment:default:Audience').explicit, true);
  assert.deepEqual(selected.reasons.get('dmo:default:Person__dlm'), {
    explicit: false,
    chains: [[identity('segment', 'Audience'), identity('dmo', 'Person__dlm')]],
  });
  await selected.verify();
  await writeFile(file, `${await readFile(file, 'utf8')} `);
  await assert.rejects(selected.verify(), { code: 'DEPENDENCY_INPUT_CHANGED' });
});
test('explicit prerequisite dedupes independent of selector order and preserves isolated roots', async () => {
  const { cwd } = await fixture();
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience', 'dmo:Person__dlm'] });
  for (const ordered of [roots, roots.toReversed()]) {
    const selected = await selectDeployDependencies(ordered, cwd);
    assert.equal(selected.inputs.length, 2);
    assert.equal(selected.inputs[0].document.kind, 'dmo');
    assert.equal(selected.reasons.get('dmo:default:Person__dlm').explicit, true);
  }
});
test('missing local prerequisites stay external; malformed existing artifact never falls back', async () => {
  const { cwd, file } = await fixture();
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  const empty = await mkdtemp(path.join(os.tmpdir(), 'data360-dependencies-empty-'));
  const selected = await selectDeployDependencies(roots, empty);
  assert.deepEqual(selected.inputs, roots);
  await writeFile(file, '{"kind":"profile-name-only"}');
  await assert.rejects(selectDeployDependencies(roots, cwd), { code: 'INVALID_SOURCE' });
});
test('opt-in command retains Git root provenance; default never expands; Segment blocks every write', async () => {
  const { cwd } = await fixture();
  const roots = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  const previousExit = process.exitCode;
  try {
    for (const include of [false, true]) {
      const command = Object.create(Deploy.prototype);
      command.parse = async () => ({
        flags: {
          'include-dependencies': include,
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
      command.preflightSegment = async () => ({
        outcome: 'unchanged',
        target: 'present',
        absenceProof: 'none',
        diagnostics: [],
      });
      command.execute = async () => assert.fail('Segment selection must block writes');
      const result = await command.run();
      assert.equal(result.status, 'blocked');
      assert.equal(result.provenance.git.requestedRef, 'main');
      assert.equal(result.result.items.length, 1);
      assert.equal(
        result.result.selection.dependencies?.[0].reason.explicit,
        include ? true : undefined,
      );
      process.exitCode = undefined;
    }
  } finally {
    process.exitCode = previousExit;
  }
});
