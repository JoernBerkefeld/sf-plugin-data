import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carriesDefinition,
  segmentWriteBody,
  unnamedChildSegment,
  validateSegmentDocument,
  waterfallChildIds,
} from '../lib/artifacts/segment-document.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import { projectSegment, retrieveSegment } from '../lib/services/retrieve-segment.js';
import { bindSegmentChildren } from '../lib/services/bind-segment-dependencies.js';
import { executeSegmentDeploy } from '../lib/services/execute-segment-deploy.js';
import { preflightSegmentDeploy } from '../lib/services/preflight-segment-deploy.js';
import { planDeleteStages, planDeployStages } from '../lib/services/crud-plan.js';
import Delete from '../lib/commands/data360/delete.js';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

// Live API 68 shapes (2026-11-18, verification DB data360:segment.other-type-update.api68),
// synthetic IDs: a Waterfall reads its children in includeCriteria (plain text: the client asks
// for it).
const childIds = { First: '3HX000000000011AAA', Second: '3HX000000000012AAA' };
const targetIds = { First: '3HX000000000021AAA', Second: '3HX000000000022AAA' };
const criteria = (ids) =>
  JSON.stringify({
    type: 'Waterfall',
    segments: ids.map((segmentId) => ({ type: 'NestedSegment', segmentId })),
  });
const raw = (ids = [childIds.First, childIds.Second], extra = {}) => ({
  apiName: 'Tiers',
  createdBy: { id: '005000000000001AAA' },
  createdDate: '2026-11-18T19:33:36.000Z',
  dataSpace: 'default',
  description: 'Description',
  displayName: 'Tiers',
  ...(ids ? { includeCriteria: criteria(ids) } : {}),
  lastModifiedBy: { id: '005000000000001AAA' },
  lastModifiedDate: '2026-11-18T19:33:36.000Z',
  marketSegmentDefinitionId: '3HX000000000001AAA',
  marketSegmentId: '1sg000000000001AAA',
  parameters: [],
  publishInterval: 'NO_REFRESH',
  segmentMembershipDmo: { historyTable: 'History__dlm', latestTable: 'Latest__dlm' },
  segmentOnApiName: 'Person__dlm',
  segmentOnId: 'dmo-id',
  segmentStatus: 'ACTIVE',
  segmentType: 'Waterfall',
  ...extra,
});
const document = (spec) => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'Tiers' },
  spec: {
    displayName: 'Tiers',
    description: 'Description',
    segmentType: 'Waterfall',
    segmentOn: { kind: 'dmo', apiName: 'Person__dlm' },
    ...(spec ?? { childSegments: ['First', 'Second'] }),
  },
});
/**
 * A selected segment input named `apiName`.
 * @param {string} apiName Segment API name.
 * @param {object} [spec] Spec keys (default: the two children).
 * @returns {object} Deploy input.
 */
const input = (apiName, spec) => ({
  path: `${apiName}.segment.json`,
  document: { ...document(spec), identity: { apiName } },
});
const sourceNames = new Map([
  [childIds.First, 'First'],
  [childIds.Second, 'Second'],
]);
const code = (error) => error?.code;

test('a Waterfall reads its child segments by name; unnamed children stay as read', () => {
  assert.deepEqual(waterfallChildIds(criteria([childIds.First])), [childIds.First]);
  for (const other of [
    '{"type":"Waterfall"}',
    '{"type":"Waterfall","segments":[]}',
    '{"type":"Waterfall","segments":[{"type":"Other","segmentId":"3HX000000000011AAA"}]}',
    '{"type":"Waterfall","segments":[{"type":"NestedSegment"}]}',
    '{"type":"Waterfall","segments":[],"extra":1}',
    'not json',
  ])
    assert.equal(waterfallChildIds(other), undefined, other);
  // Retrieve names each child through the source org's definition IDs.
  const named = projectSegment({ segments: [raw()] }, 'Tiers', 'retrieve', sourceNames);
  assert.deepEqual(named.candidate, document());
  // A child retrieve cannot name keeps the criteria as read (deploy refuses that file).
  const kept = projectSegment({ segments: [raw()] }, 'Tiers', 'retrieve');
  assert.equal(kept.candidate.spec.childSegments, undefined);
  assert.equal(kept.candidate.spec.includeCriteria, criteria([childIds.First, childIds.Second]));
  assert.throws(() => validateSegmentDocument(kept.candidate), {
    code: 'UNKNOWN_SEGMENT_CONFIGURATION',
  });
  // A deploy-mode read names what it can and marks the rest; the marker equals no file name.
  const target = projectSegment(
    { segments: [raw()] },
    'Tiers',
    'deploy',
    new Map([[childIds.First, 'First']]),
  );
  assert.deepEqual(target.candidate.spec.childSegments, ['First', unnamedChildSegment]);
  assert.equal(carriesDefinition(target.candidate, document()), false);
  // A file without childSegments leaves the children alone and out of the comparison.
  assert.equal(carriesDefinition(target.candidate, document({})), true);
  // Order is priority: the same children in another order differ.
  assert.equal(
    carriesDefinition(
      projectSegment({ segments: [raw()] }, 'Tiers', 'deploy', sourceNames).candidate,
      document({ childSegments: ['Second', 'First'] }),
    ),
    false,
  );
  // A childless Waterfall reads without includeCriteria and has no childSegments key.
  assert.deepEqual(
    projectSegment({ segments: [raw(false)] }, 'Tiers', 'retrieve').candidate,
    document({}),
  );
});

test('childSegments is a Waterfall-only list of segment API names', () => {
  for (const [value, expected] of [
    [[], 'INVALID_SEGMENT_DOCUMENT'],
    ['First', 'INVALID_SEGMENT_DOCUMENT'],
    [['First', 'first'], 'INVALID_SEGMENT_DOCUMENT'],
    [['1st'], 'INVALID_SEGMENT_DOCUMENT'],
  ])
    assert.throws(
      () => validateSegmentDocument(document({ childSegments: value })),
      (error) => code(error) === expected && /spec\.childSegments/u.test(error.message),
      JSON.stringify(value),
    );
  const dynamic = document({ childSegments: ['First'] });
  dynamic.spec.segmentType = 'Dynamic';
  assert.throws(() => validateSegmentDocument(dynamic), {
    code: 'UNKNOWN_SEGMENT_CONFIGURATION',
  });
  // The Waterfall runs after the children it names.
  assert.deepEqual(documentDependencyNode(document()).dependencies, [
    { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    { kind: 'segment', dataSpace: 'default', apiName: 'First' },
    { kind: 'segment', dataSpace: 'default', apiName: 'Second' },
  ]);
});

test('the write sends the children by their definition IDs in the target', () => {
  const ids = new Map([
    ['First', targetIds.First],
    ['Second', targetIds.Second],
  ]);
  const body = segmentWriteBody(validateSegmentDocument(document()), true, false, ids);
  assert.equal(body.includeCriteria, criteria([targetIds.First, targetIds.Second]));
  assert.equal(body.segmentType, 'Waterfall');
  assert.equal(body.publishSchedule, 'NoRefresh');
  assert.equal(
    segmentWriteBody(validateSegmentDocument(document({})), false).includeCriteria,
    undefined,
  );
  assert.throws(() => segmentWriteBody(validateSegmentDocument(document()), false), {
    code: 'SEGMENT_CHILD_NOT_FOUND',
  });
});

test('retrieve names the children with one segment list read', async () => {
  const urls = [];
  const list = {
    totalSize: 3,
    segments: [
      { apiName: 'First', dataSpace: 'default', marketSegmentDefinitionId: childIds.First },
      { apiName: 'Second', dataSpace: 'default', marketSegmentDefinitionId: childIds.Second },
      { apiName: 'Tiers', dataSpace: 'default', marketSegmentDefinitionId: '3HX000000000001AAA' },
    ],
  };
  const connection = (listing) => ({
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '68.0',
    getUsername: () => 'synthetic',
    request: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      urls.push(url);
      if (url.includes('/ssot/segments?')) return listing();
      return { segments: [raw()] };
    },
  });
  const result = await retrieveSegment(
    connection(() => structuredClone(list)),
    'Tiers',
    '68.0',
    'default',
    'retrieve',
  );
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.candidate, document());
  assert.equal(urls.filter((url) => url.includes('/ssot/segments?')).length, 1);
  // A failed list read names nothing: the criteria stay as read.
  const failed = await retrieveSegment(
    connection(() => {
      throw new Error('list failed');
    }),
    'Tiers',
    '68.0',
    'default',
    'retrieve',
  );
  assert.equal(failed.candidate.spec.childSegments, undefined);
  assert.equal(typeof failed.candidate.spec.includeCriteria, 'string');
});

const notFound = () =>
  retainConnectDiagnostic(
    new Error('not found'),
    apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND', message: 'not found' }]),
  );
const connection = { instanceUrl: 'https://synthetic.example', getApiVersion: () => '68.0' };
const childRead = (present) => async (name) => {
  if (!present.includes(name)) throw notFound();
  return {
    segments: [{ apiName: name, dataSpace: 'default', marketSegmentDefinitionId: targetIds[name] }],
  };
};

test('each child is bound in the target before any write; a missing one is refused', async () => {
  assert.deepEqual(
    await bindSegmentChildren(document(), connection, '68.0', childRead(['First', 'Second'])),
    [
      {
        identity: { kind: 'segment', dataSpace: 'default', apiName: 'First' },
        targetId: targetIds.First,
      },
      {
        identity: { kind: 'segment', dataSpace: 'default', apiName: 'Second' },
        targetId: targetIds.Second,
      },
    ],
  );
  assert.deepEqual(await bindSegmentChildren(document({}), connection, '68.0', assert.fail), []);
  await assert.rejects(
    bindSegmentChildren(document(), connection, '68.0', childRead(['First'])),
    (error) => code(error) === 'SEGMENT_CHILD_NOT_FOUND' && /Second/u.test(error.message),
  );
  await assert.rejects(
    bindSegmentChildren(
      document({ childSegments: [unnamedChildSegment] }),
      connection,
      '68.0',
      assert.fail,
    ),
    { code: 'SEGMENT_CHILD_NOT_FOUND' },
  );
  await assert.rejects(
    bindSegmentChildren(document(), connection, '68.0', async () => ({ segments: [] })),
    { code: 'SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING' },
  );
  await assert.rejects(
    bindSegmentChildren(document(), connection, '68.0', async () => {
      throw new Error('offline');
    }),
    { code: 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' },
  );
});

/**
 * A synthetic target org with the Waterfall (or none) and the write seams of the deploy. Writes
 * store the criteria as sent; reads return it as stored.
 * @param {object | undefined} current GET-shaped Waterfall, or none.
 * @param {string[]} [present] Child segments that exist in the target.
 * @returns {object} State with recorded writes and deploy options.
 */
function org(current, present = ['First', 'Second']) {
  const state = { current, writes: [] };
  const store = (body) => {
    state.current = raw(false, {
      ...(body.includeCriteria
        ? { includeCriteria: body.includeCriteria }
        : state.current?.includeCriteria
          ? { includeCriteria: state.current.includeCriteria }
          : {}),
      description: body.description,
    });
    return { ...state.current, segmentStatus: 'PROCESSING' };
  };
  state.options = {
    allowProcessing: true,
    verifyInput: async () => {},
    bind: async () => [{ identity: { kind: 'dmo' }, targetId: 'dmo-id' }],
    children: (value, target, version) =>
      bindSegmentChildren(value, target, version, childRead(present)),
    acquire: async (_connection, _name, _version, _space, _mode, names) => {
      if (!state.current)
        return retainConnectDiagnostic(
          { blockers: ['SEGMENT_ACQUISITION_FAILED'] },
          apiDiagnostic(404, [{ errorCode: 'ITEM_NOT_FOUND' }]),
        );
      const projected = projectSegment({ segments: [state.current] }, 'Tiers', 'deploy', names);
      return { candidate: projected.candidate, blockers: [], expectations: projected };
    },
    create: async (desired, ids) => {
      const body = segmentWriteBody(validateSegmentDocument(desired), true, false, ids);
      state.writes.push(['POST', body]);
      return store(body);
    },
    patch: async (desired, schedule, ids) => {
      const body = segmentWriteBody(validateSegmentDocument(desired), false, schedule, ids);
      state.writes.push(['PATCH', body]);
      return store(body);
    },
    read: async () => ({ segments: [state.current] }),
    now: () => 0,
    delay: async () => {},
  };
  return state;
}
const deploy = (desired, state) =>
  executeSegmentDeploy(desired, connection, '68.0', 'default', state.options);
const preview = (desired, state) =>
  preflightSegmentDeploy(
    desired,
    connection,
    '68.0',
    'default',
    state.options.acquire,
    state.options.bind,
    state.options.children,
  );
const targetRaw = () => raw([targetIds.First, targetIds.Second]);

test('deploy creates a Waterfall with its children and reads them back by name', async () => {
  const state = org();
  const previewed = await preview(document(), state);
  assert.equal(previewed.outcome, 'create');
  const created = await deploy(document(), state);
  assert.equal(created.outcome, 'created', JSON.stringify(created.diagnostics));
  assert.deepEqual(state.writes, [
    [
      'POST',
      {
        developerName: 'Tiers',
        displayName: 'Tiers',
        description: 'Description',
        segmentOnApiName: 'Person__dlm',
        segmentType: 'Waterfall',
        includeCriteria: criteria([targetIds.First, targetIds.Second]),
        publishSchedule: 'NoRefresh',
      },
    ],
  ]);
  // The same file against the result is unchanged.
  const again = await deploy(document(), state);
  assert.equal(again.outcome, 'unchanged');
});

test('deploy updates the children; a file without them keeps the org children', async () => {
  const state = org(targetRaw());
  const reordered = document({ childSegments: ['Second', 'First'] });
  const previewed = await preview(reordered, state);
  assert.equal(previewed.outcome, 'update');
  const updated = await deploy(reordered, state);
  assert.equal(updated.outcome, 'updated', JSON.stringify(updated.diagnostics));
  assert.equal(state.writes[0][1].includeCriteria, criteria([targetIds.Second, targetIds.First]));
  // Description only: the PATCH carries no criteria and the children stay (live API 68).
  const kept = org(targetRaw());
  const described = document({});
  described.spec.description = 'Changed';
  const result = await deploy(described, kept);
  assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
  assert.equal(kept.writes[0][1].includeCriteria, undefined);
  assert.equal(kept.current.includeCriteria, targetRaw().includeCriteria);
});

test('a child missing from the target is refused before any write', async () => {
  const state = org(undefined, ['First']);
  const previewed = await preview(document(), state);
  assert.equal(previewed.outcome, 'blocked');
  assert.equal(previewed.diagnostics[0].code, 'SEGMENT_CHILD_NOT_FOUND');
  assert.match(previewed.diagnostics[0].message, /child segment Second of spec\.childSegments/u);
  const result = await deploy(document(), state);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.deepEqual(state.writes, []);
});

test('a Waterfall deploys in a later stage than the selected children it names', () => {
  const stages = planDeployStages([input('Tiers'), input('First', {}), input('Second', {})], {
    nativeRoute: false,
  });
  assert.deepEqual(
    stages.map((stage) => stage.inputs.map((item) => item.document.identity.apiName)),
    [['First', 'Second'], ['Tiers']],
  );
});

test('a selector delete names the children, so the Waterfall goes before its selected child', async () => {
  const child = raw(false, {
    apiName: 'First',
    displayName: 'First',
    marketSegmentDefinitionId: childIds.First,
  });
  const lists = [];
  const connection = {
    instanceUrl: 'https://synthetic.example',
    getApiVersion: () => '68.0',
    getUsername: () => 'synthetic',
    request: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      if (url.includes('/ssot/segments?')) {
        lists.push(url);
        return {
          totalSize: 2,
          segments: [
            { apiName: 'First', dataSpace: 'default', marketSegmentDefinitionId: childIds.First },
            { apiName: 'Second', dataSpace: 'default', marketSegmentDefinitionId: childIds.Second },
          ],
        };
      }
      return { segments: [url.endsWith('/First') ? child : raw()] };
    },
  };
  const command = Object.create(Delete.prototype);
  const read = async (name) => {
    const source = await command.readDeleteSource('segment', name, connection);
    return source.desired;
  };
  const tiers = await read('Tiers');
  assert.deepEqual(tiers.spec.childSegments, ['First', 'Second']);
  const first = await read('First');
  // -m segment:Tiers -m segment:First: the Waterfall is deleted in an earlier stage.
  const stages = planDeleteStages([
    { path: 'segment:First', document: first },
    { path: 'segment:Tiers', document: tiers },
  ]);
  assert.deepEqual(
    stages.map((stage) => stage.inputs.map((item) => item.document.identity.apiName)),
    [['Tiers'], ['First']],
  );
  // One list read for the whole run.
  await read('Tiers');
  assert.equal(lists.length, 1);
});
