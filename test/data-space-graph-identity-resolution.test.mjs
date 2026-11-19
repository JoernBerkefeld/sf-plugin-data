import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  nativeDataGraphDocumentFromResponse,
  validateNativeDataGraphDocument,
} from '../lib/artifacts/native-data-graph-document.js';
import {
  buildDataGraphCreateRequest,
  createDataGraphClient,
} from '../lib/transport/data-graph-rest.js';
import {
  operateNativeDataGraph,
  retrieveNativeDataGraph,
} from '../lib/services/command-native-data-graph.js';
import { bindNativeGraphRoot } from '../lib/services/native-data-graph-crd.js';
import { listDataGraphNames } from '../lib/services/retrieve-inventory.js';
import {
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../lib/artifacts/identity-resolution-document.js';
import {
  buildNativeIdentityResolutionCreate,
  preflightNativeIdentityResolutionDeploy,
} from '../lib/services/preflight-identity-resolution-deploy.js';
import {
  listIdentityResolutionNames,
  retrieveIdentityResolution,
} from '../lib/services/retrieve-identity-resolution.js';
import { bindIdentityResolutionDependencies } from '../lib/services/bind-identity-resolution-dependencies.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import { unifiedDmoNames } from '../lib/services/crud-plan.js';
import { createVerbatimDocument } from '../lib/artifacts/verbatim-document.js';
import { dataSpaceDirectory } from '../lib/services/data-space-check.js';
import { offlineDataSpaces } from './support/offline-data-spaces.mjs';
import { nativeSelection } from './identity-resolution-fixtures.mjs';

// Live API 68 (DB data360:dataspace-identity-resolution-api68, dataspace-name-spelling-api68):
// graph names are unique in the org; a dataspace2 ruleset is ds2_Individual_<id> and uses the
// copy spelling ds2_Individual__dlm with FirstName__c.
const SPACE = 'dataspace2';
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '68.0',
  getUsername: () => 'synthetic@example.invalid',
};

// --- data graphs -------------------------------------------------------------------------

const graphFile = (space = SPACE, definition = {}) => ({
  schemaVersion: 1,
  kind: 'native-data-graph',
  apiVersion: '68.0',
  c__dataSpace: space,
  definition: {
    name: 'SpaceGraph',
    label: 'Space graph',
    dataspaceName: space,
    primaryObjectName: 'ds2_Individual__dlm',
    type: 'NONE',
    sourceObject: {
      name: 'ds2_Individual__dlm',
      label: 'Individual',
      jsonPath: '$',
      path: [],
      relatedObjects: [],
      fields: [
        {
          sourceFieldName: 'Id__c',
          dataType: 'Text',
          isKeyColumn: true,
          isProjected: true,
          usageTag: 'NONE',
        },
      ],
    },
    ...definition,
  },
});
const graphGet = (space = SPACE) => ({
  name: 'SpaceGraph',
  label: 'Space graph',
  description: '',
  dataspaceName: space,
  id: 'synthetic-graph-id',
  createdDate: '2026-11-19T09:00:00.000Z',
  primaryObjectName: 'ds2_Individual__dlm',
  kind: 'CdpDataGraphOutputRepresentation',
  type: 'none',
  status: 'ready',
  version: '0',
  extendedProperties: '',
  idDmoName: 'Space_ID__dlm',
  valuesDmoName: 'Space_VALUE__dlm',
  dayZeroMappingDevName: 'SpaceMapping',
  dayZeroTransformDevName: 'SpaceTransform',
  sourceObject: {
    fragmentDMOName: 'Space_FRAGMENT__dlm',
    name: 'ds2_Individual__dlm',
    label: 'Individual',
    projectedName: 'ds2_Individual__dlm',
    type: 'standard',
    jsonPath: '$',
    categoryDevName: 'Profile',
    referenceDeveloperName: 'Individual',
    id: 'synthetic-node-id',
    devName: 'ServerNode',
    dependency: [],
    path: [],
    recencyCriteria: [],
    relatedObjects: [],
    relatedSegments: [],
    fields: [
      {
        id: 'synthetic-field-0',
        devName: 'ServerField0',
        name: 'ServerField0',
        sourceFieldName: 'Id__c',
        dataType: 'Text',
        isKeyColumn: true,
        isProjected: true,
        usageTag: 'none',
        dependency: [],
      },
    ],
  },
});
const graphContext = (space, body) => ({
  orgId: '00D000000000001AAA',
  space,
  check() {},
  get: async () => ({ status: 200, body: structuredClone(body) }),
  root: async () => ({
    detail: {
      id: 'synthetic-root',
      name: 'ds2_Individual__dlm',
      dataSpaceName: space,
      creationType: 'Standard',
      isEnabled: true,
      fields: [{ name: 'Id__c', type: 'Text' }],
    },
  }),
  metadata: async () => assert.fail('no metadata read'),
  inventory: async () => assert.fail('no inventory read'),
  query: async () => assert.fail('no SOQL read'),
});

test('a graph file carries c__dataSpace; definition.dataspaceName must agree or is filled', () => {
  const document = validateNativeDataGraphDocument(graphFile());
  assert.equal(document.c__dataSpace, SPACE);
  assert.deepEqual(Object.keys(document), [
    'schemaVersion',
    'kind',
    'apiVersion',
    'c__dataSpace',
    'definition',
  ]);
  const without = graphFile();
  delete without.definition.dataspaceName;
  assert.equal(validateNativeDataGraphDocument(without).definition.dataspaceName, SPACE);
  // The create body names the file's data space.
  assert.equal(buildDataGraphCreateRequest(document.definition).dataspaceName, SPACE);
  assert.throws(
    () => validateNativeDataGraphDocument(graphFile(SPACE, { dataspaceName: 'default' })),
    {
      code: 'INVALID_DATASPACE_FIELD',
      message: /c__dataSpace must name the data space of definition\.dataspaceName/u,
    },
  );
  const missing = graphFile();
  delete missing.c__dataSpace;
  assert.throws(() => validateNativeDataGraphDocument(missing), {
    code: 'INVALID_DATASPACE_FIELD',
  });
});

test('a graph GET gives the file its data space; a GET without one is unreadable', () => {
  const document = nativeDataGraphDocumentFromResponse(graphGet(), 'retrieve');
  assert.equal(document.c__dataSpace, SPACE);
  assert.equal(document.definition.dataspaceName, SPACE);
  const blank = graphGet();
  delete blank.dataspaceName;
  assert.throws(() => nativeDataGraphDocumentFromResponse(blank, 'retrieve'), {
    code: 'DATA_GRAPH_DATASPACE_UNREADABLE',
  });
});

test('the graph client works in any data space and sends only its own', async () => {
  const sent = [];
  const client = createDataGraphClient(
    {
      instanceUrl: connection.instanceUrl,
      getApiVersion: () => '68.0',
      request: async (request) => {
        sent.push(request);
        return {};
      },
    },
    '68.0',
    SPACE,
  );
  await client.create(validateNativeDataGraphDocument(graphFile()).definition);
  assert.equal(JSON.parse(sent[0].body).dataspaceName, SPACE);
  await assert.rejects(
    client.create(validateNativeDataGraphDocument(graphFile('default')).definition),
    { code: 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION' },
  );
  assert.equal(sent.length, 1);
  assert.throws(() => createDataGraphClient(connection, '67.0', SPACE), {
    code: 'INVALID_NATIVE_DATA_GRAPH_SCOPE',
  });
});

test('retrieve refuses a graph of another data space before it projects anything', async () => {
  await assert.rejects(
    retrieveNativeDataGraph('SpaceGraph', graphContext(SPACE, graphGet('default'))),
    {
      code: 'DATA_GRAPH_DATASPACE_MISMATCH',
      message:
        /SpaceGraph is in the data space "?default"? in the org, but the run's data space is "?dataspace2"?/u,
    },
  );
});

const options = (operation) => ({
  operation,
  preview: false,
  confirmed: true,
  verifyInput: async () => {},
  pause: async () => {},
  progress: () => {},
});

test('deploy and delete of a graph refuse a file or org graph of another data space unwritten', async () => {
  const writes = [];
  const client = {
    get: async () => assert.fail('no client read'),
    create: async () => writes.push('POST'),
    update: async () => writes.push('PUT'),
    delete: async () => writes.push('DELETE'),
  };
  // The file names default, the run is dataspace2.
  const file = await operateNativeDataGraph(
    graphFile('default'),
    graphContext(SPACE, graphGet()),
    client,
    options('deploy'),
  );
  assert.equal(file.outcome, 'blocked');
  assert.equal(file.mutation, 'not-attempted');
  assert.equal(file.diagnostics[0].code, 'DATA_GRAPH_DATASPACE_MISMATCH');
  // The file and run are dataspace2, the org graph of that name is in default.
  const org = await operateNativeDataGraph(
    graphFile(),
    graphContext(SPACE, graphGet('default')),
    client,
    options('delete'),
  );
  assert.equal(org.outcome, 'blocked');
  assert.equal(org.diagnostics[0].code, 'DATA_GRAPH_DATASPACE_MISMATCH');
  // A verbatim file is checked the same way.
  const verbatim = createVerbatimDocument(
    'native-data-graph',
    { dataSpace: 'default', apiName: 'SpaceGraph' },
    'DATA_GRAPH_DRAFT',
  );
  assert.equal(verbatim.c__dataSpace, 'default');
  const stand = await operateNativeDataGraph(
    verbatim,
    graphContext(SPACE, graphGet()),
    client,
    options('delete'),
  );
  assert.equal(stand.diagnostics[0].code, 'DATA_GRAPH_DATASPACE_MISMATCH');
  assert.deepEqual(writes, []);
});

test('a confirmed graph deploy in dataspace2 refuses a graph of that name in default unwritten', async () => {
  const writes = [];
  const client = {
    get: async () => assert.fail('no client read'),
    create: async () => writes.push('POST'),
    update: async () => writes.push('PUT'),
    delete: async () => writes.push('DELETE'),
  };
  const result = await operateNativeDataGraph(
    graphFile(),
    graphContext(SPACE, graphGet('default')),
    client,
    options('deploy'),
  );
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(result.diagnostics[0].code, 'DATA_GRAPH_DATASPACE_MISMATCH');
  assert.deepEqual(writes, []);
});

test('a graph root of another data space is DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE', async () => {
  const context = graphContext(SPACE, graphGet());
  context.root = async () => ({
    detail: {
      id: 'synthetic-root',
      name: 'ds2_Individual__dlm',
      dataSpaceName: 'default',
      creationType: 'Standard',
      isEnabled: true,
      fields: [],
    },
  });
  await assert.rejects(bindNativeGraphRoot(context, 'ds2_Individual__dlm'), {
    code: 'DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE',
    message: /in the data space default, not in the graph's data space dataspace2/u,
  });
});

test('the graph list is read with the run data space', async () => {
  const urls = [];
  const names = await listDataGraphNames(
    {
      instanceUrl: connection.instanceUrl,
      request: async (request) => {
        urls.push(request.url);
        return {
          dataGraphMetadata: [
            { developerName: 'SpaceGraph', dataspaceName: SPACE },
            { developerName: 'DefaultGraph', dataspaceName: 'default' },
          ],
        };
      },
    },
    [],
    SPACE,
  );
  assert.deepEqual(names, ['SpaceGraph']);
  assert.match(urls[0], /\/ssot\/data-graphs\/metadata\?dataspace=dataspace2$/u);
});

// --- identity resolution ------------------------------------------------------------------

const irNative = (space = SPACE) => ({
  configurationType: 'individual',
  dataSpaceName: space,
  description: '',
  doesRunAutomatically: false,
  filters: [],
  trustedSources: [],
  id: '1irSYNTHETIC0000AAA',
  isCaseSensitive: false,
  label: 'Space ruleset',
  objectApiName: space === 'default' ? 'Individual_cx2a' : 'ds2_Individual_cx2a',
  rulesetId: 'cx2a',
  rulesetStatus: 'PUBLISHED',
  secondaryDmo: 'ds2_Individual__dlm',
  matchRules: [
    {
      label: 'Name',
      criteria: [
        {
          caseSensitiveMatch: false,
          entityName: 'ds2_Individual__dlm',
          fieldName: 'FirstName__c',
          matchMethodType: 'fuzzy',
          shouldMatchOnBlank: false,
        },
      ],
    },
  ],
  reconciliationRules: [
    {
      entityName: 'ds2_Individual__dlm',
      fields: [],
      sources: [{ name: 'CliX2Ind__dll' }],
      ruleType: 'mostfrequent',
      shouldIgnoreEmptyValue: true,
      unifiedDmoName: 'ds2_UnifiedIndividualCx2a__dlm',
      linkDmoName: 'ds2_UnifiedLinkIndividualCx2a__dlm',
    },
  ],
});
const irFile = () => projectNativeIdentityResolution(irNative(), 'ds2_Individual_cx2a').candidate;

test('a ruleset file carries c__dataSpace and references without a data space', () => {
  const document = irFile();
  assert.equal(document.c__dataSpace, SPACE);
  assert.deepEqual(document.identity, { apiName: 'ds2_Individual_cx2a' });
  assert.deepEqual(document.spec.secondaryDmo, { kind: 'dmo', apiName: 'ds2_Individual__dlm' });
  assert.deepEqual(document.spec.reconciliationRules[0].sources, [
    { kind: 'dlo', apiName: 'CliX2Ind__dll' },
  ]);
  assert.deepEqual(document.spec.reconciliationRules[0].outputs[0], {
    owner: { kind: 'identity-resolution', apiName: 'ds2_Individual_cx2a' },
    entity: { kind: 'dmo', apiName: 'ds2_Individual__dlm' },
    role: 'unified',
  });
  assert.deepEqual(validateIdentityResolutionDocument(document), document);
  const legacy = structuredClone(document);
  legacy.identity.dataSpace = SPACE;
  assert.throws(() => validateIdentityResolutionDocument(legacy), {
    code: 'LEGACY_DATASPACE_KEY',
    message: /identity\.dataSpace/u,
  });
  const reference = structuredClone(document);
  reference.spec.matchRules[0].criteria[0].field.dataSpace = SPACE;
  assert.throws(() => validateIdentityResolutionDocument(reference), {
    code: 'LEGACY_DATASPACE_KEY',
    message: /spec\.matchRules\[0\]\.criteria\[0\]\.field\.dataSpace/u,
  });
  const missing = structuredClone(document);
  delete missing.c__dataSpace;
  assert.throws(() => validateIdentityResolutionDocument(missing), {
    code: 'INVALID_DATASPACE_FIELD',
  });
  const blank = irNative();
  delete blank.dataSpaceName;
  assert.throws(() => projectNativeIdentityResolution(blank, 'ds2_Individual_cx2a'), {
    code: 'IDENTITY_RESOLUTION_DATASPACE_UNREADABLE',
  });
});

test('a dataspace2 ruleset creates with its ruleset ID and data space; nodes and outputs stay in it', () => {
  const body = buildNativeIdentityResolutionCreate(irFile(), 'ds2');
  assert.equal(body.rulesetId, 'cx2a');
  // The prefix is the one the org names, never guessed: without it, or another one, no body.
  for (const prefix of [undefined, 'ds3'])
    assert.throws(() => buildNativeIdentityResolutionCreate(irFile(), prefix), {
      message: 'IDENTITY_RESOLUTION_NAME_NOT_STORED',
    });
  assert.equal(body.dataSpaceName, SPACE);
  assert.equal(body.secondaryDmo, 'ds2_Individual__dlm');
  assert.deepEqual(documentDependencyNode(irFile()), {
    identity: { kind: 'identity-resolution', dataSpace: SPACE, apiName: 'ds2_Individual_cx2a' },
    dependencies: [{ kind: 'dmo', dataSpace: SPACE, apiName: 'ds2_Individual__dlm' }],
  });
  // Live: the prefix replaces the ssot infix (names compared ignoring case).
  assert.deepEqual(
    unifiedDmoNames(irFile()).map((name) => name.toLowerCase()),
    ['ds2_unifiedindividualcx2a__dlm', 'ds2_unifiedlinkindividualcx2a__dlm'],
  );
});

const answering = (body) => ({
  ...connection,
  request: async () => structuredClone(body),
});

test('retrieve and the list keep a ruleset of the run data space only', async () => {
  const reader = answering;
  const read = await retrieveIdentityResolution(
    reader(irNative()),
    'ds2_Individual_cx2a',
    nativeSelection,
    SPACE,
    'retrieve',
  );
  assert.deepEqual(read.blockers, []);
  assert.equal(read.candidate.c__dataSpace, SPACE);
  const other = await retrieveIdentityResolution(
    reader(irNative('default')),
    'Individual_cx2a',
    nativeSelection,
    SPACE,
    'retrieve',
  );
  assert.deepEqual(other.blockers, ['IDENTITY_RESOLUTION_DATASPACE_MISMATCH']);
  assert.equal(other.candidate, undefined);
  // The list answers every data space whatever ?dataspace= says.
  const names = await listIdentityResolutionNames(
    reader({
      identityResolutions: [
        { objectApiName: 'ds2_Individual_cx2a', dataSpaceName: SPACE },
        { objectApiName: 'Individual_mce', dataSpaceName: 'default' },
      ],
    }),
    [],
    SPACE,
  );
  assert.deepEqual(names, ['ds2_Individual_cx2a']);
});

test('ruleset preflight refuses a file or org ruleset of another data space', async () => {
  const file = await preflightNativeIdentityResolutionDeploy(
    irFile(),
    { ...connection, request: async () => assert.fail('no read') },
    nativeSelection,
    'default',
    { verifyDependencies: async () => assert.fail('no dependency read') },
  );
  assert.equal(file.outcome, 'blocked');
  assert.equal(file.diagnostics[0].code, 'IDENTITY_RESOLUTION_DATASPACE_MISMATCH');
  assert.match(file.diagnostics[0].message, /names the data space "?dataspace2"? in c__dataSpace/u);
  const org = await preflightNativeIdentityResolutionDeploy(
    irFile(),
    {
      ...connection,
      request: async () => ({ ...irNative('default'), objectApiName: 'ds2_Individual_cx2a' }),
    },
    nativeSelection,
    SPACE,
    { verifyDependencies: async () => {} },
  );
  assert.equal(org.diagnostics[0].code, 'IDENTITY_RESOLUTION_DATASPACE_MISMATCH');
  assert.match(org.diagnostics[0].message, /is in the data space "?default"? in the org/u);
});

const dmoDetail = (space) => ({
  name: 'ds2_Individual__dlm',
  dataSpaceName: space,
  id: 'synthetic-dmo',
  fields: [{ name: 'FirstName__c', type: 'Text', isPrimaryKey: true }],
});
const dloDetail = (spaces) => ({
  name: 'CliX2Ind__dll',
  id: 'synthetic-dlo',
  status: 'ACTIVE',
  label: 'Cli',
  category: 'Profile',
  dataSpaceInfo: spaces.map((name) => ({ name })),
  fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
});

test('ruleset dependencies are read in its data space; another one is refused', async () => {
  const urls = [];
  const dmo = dmoDetail;
  const dlo = dloDetail;
  const reader = (dmoSpace, dloSpaces) => ({
    ...connection,
    request: async (request) => {
      urls.push(request.url);
      return request.url.includes('data-lake-objects') ? dlo(dloSpaces) : dmo(dmoSpace);
    },
  });
  const proof = await bindIdentityResolutionDependencies(
    irFile(),
    reader(SPACE, ['default', SPACE]),
    nativeSelection,
    SPACE,
  );
  assert.match(proof.fingerprint, /^[a-f0-9]{64}$/u);
  assert.ok(
    urls.some((url) =>
      url.endsWith('/data-model-objects/ds2_Individual__dlm?dataspace=dataspace2'),
    ),
  );
  await assert.rejects(
    bindIdentityResolutionDependencies(
      irFile(),
      reader('default', [SPACE]),
      nativeSelection,
      SPACE,
    ),
    {
      code: 'IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE',
      message: /the DMO ds2_Individual__dlm, which is in the data space default/u,
    },
  );
  await assert.rejects(
    bindIdentityResolutionDependencies(
      irFile(),
      reader(SPACE, ['default']),
      nativeSelection,
      SPACE,
    ),
    { code: 'IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE', message: /the DLO CliX2Ind__dll/u },
  );
});

// --- deploy command -----------------------------------------------------------------------

/**
 * A deploy preview command on resolved inputs whose family seams record their calls.
 * @param {object[]} inputs Resolved inputs.
 * @returns {object} Command and observed calls.
 */
function deployOf(inputs) {
  const calls = [];
  const command = Object.create(Deploy.prototype);
  command.config = { pjson: { version: '2.151.7' } };
  command.parse = async () => ({
    flags: {
      preview: true,
      'api-version': 'auto',
      dataspace: SPACE,
      metadata: undefined,
      'target-org': {
        getOrgId: () => 'synthetic-target',
        getUsername: () => 'synthetic@example.invalid',
        getConnection: () => ({ ...connection }),
      },
    },
  });
  command.jsonEnabled = () => true;
  command.log = () => {};
  command.resolveInputs = async () => inputs;
  command.captureInput = async () => 'same';
  command.verifyIdentityResolutionInput = async () => {};
  command.preflightIdentityResolution = async (value, _connection, _selection, space) => {
    calls.push(['preflight', value.identity.apiName, space]);
    return {
      family: 'identity-resolution',
      outcome: 'unchanged',
      target: 'present',
      absenceProof: 'none',
      route: { apiVersion: '68.0', operation: 'identity-resolutions.patch' },
      requiredEffects: [],
      diagnostics: [],
    };
  };
  command.nativeGraphContext = async () => {
    calls.push(['graph-context']);
    throw new Error('no graph read');
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

test('deploy refuses a ruleset name without the data space prefix, and files of another space', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => [{ name: 'default' }, { name: SPACE, prefix: 'ds2' }];
  try {
    const ir = (document) => ({
      path: `${document.identity.apiName}.identityResolution.json`,
      document,
      inputDigest: 'same',
    });
    const ok = deployOf([ir(irFile())]);
    // The dependency binding is covered by its own tests; here only the name check matters.
    ok.command.bindIdentityResolution = async () => 'synthetic-binding';
    const passed = await run(ok.command);
    assert.equal(passed.status, 'success');
    assert.deepEqual(passed.diagnostics.errors, []);
    assert.deepEqual(ok.calls[0], ['preflight', 'ds2_Individual_cx2a', SPACE]);
    const plain = deployOf([ir({ ...irFile(), identity: { apiName: 'Individual_cx2a' } })]);
    const refused = await run(plain.command);
    assert.equal(refused.status, 'blocked');
    assert.deepEqual(plain.calls, []);
    assert.equal(refused.diagnostics.errors[0].code, 'IDENTITY_RESOLUTION_NAME_NOT_STORED');
    assert.match(refused.diagnostics.errors[0].message, /would be stored as ds2_Individual_cx2a/u);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('deploy refuses ruleset and graph files of another data space', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => [...offlineDataSpaces];
  try {
    await refuseOtherSpaceFiles();
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

/**
 * Deploy files of default in a dataspace2 run: each is refused before any family seam runs.
 * @returns {Promise<void>} Resolves when every refusal is asserted.
 */
async function refuseOtherSpaceFiles() {
  const otherIr = deployOf([
    {
      path: 'Individual_cx2a.identityResolution.json',
      document: { ...irFile(), c__dataSpace: 'default' },
      inputDigest: 'same',
    },
  ]);
  const irResult = await run(otherIr.command);
  assert.equal(irResult.status, 'blocked');
  assert.deepEqual(otherIr.calls, []);
  assert.equal(irResult.diagnostics.errors[0].code, 'IDENTITY_RESOLUTION_DATASPACE_MISMATCH');
  const graph = deployOf([
    {
      path: 'SpaceGraph.native-dataGraph.json',
      document: validateNativeDataGraphDocument(graphFile('default')),
      inputDigest: 'same',
    },
  ]);
  const graphResult = await run(graph.command);
  assert.equal(graphResult.status, 'blocked');
  assert.deepEqual(graph.calls, []);
  assert.equal(graphResult.diagnostics.errors[0].code, 'DATA_GRAPH_DATASPACE_MISMATCH');
  assert.match(
    graphResult.diagnostics.errors[0].message,
    /names the data space "?default"? in c__dataSpace, but the run's data space is "?dataspace2"?/u,
  );
}
