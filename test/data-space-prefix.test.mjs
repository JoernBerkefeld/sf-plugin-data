import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { NativeDmoError, standardCopyOrigins } from '../lib/artifacts/native-dmo-document.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { preflightNativeDmo } from '../lib/services/native-dmo.js';
import { hintOf } from '../lib/services/operation-diagnostic.js';
import {
  prefixMismatch,
  prefixMismatchWarning,
  prefixRuleCoversName,
  prefixRuleCoversRead,
} from '../lib/services/data-space-prefix.js';
import { dataSpaceCheckOf, dataSpaceDirectory } from '../lib/services/data-space-check.js';
import { offlineDataSpaces } from './support/offline-data-spaces.mjs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { captureDeployInputDigest, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';

// Names of custom DMOs, calculated insights, transforms and graphs are unique in the org, so each
// carries the prefix of its data space (user decision 2026-11-21; Salesforce accepts the chosen
// ds2_ names, DB entry data360:dataspace-prefixed-unique-names-api68).
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
];

test('prefixMismatch: a non-default space needs its own prefix, default no other one', () => {
  for (const type of ['dmo', 'calculated-insight', 'data-transform', 'data-graph']) {
    assert.equal(prefixMismatch('ds2_Order', type, SPACE, spaces), undefined);
    assert.equal(prefixMismatch('Order', type, 'default', spaces), undefined);
  }
  const missing = prefixMismatch('Order__dlm', 'dmo', SPACE, spaces);
  assert.equal(missing.code, 'DMO_PREFIX_MISMATCH');
  assert.equal(missing.reason, 'missing');
  assert.equal(missing.suggestion, 'ds2_Order__dlm');
  // Another space's prefix in a non-default space: replaced in the suggestion.
  const foreignHere = prefixMismatch('th_Spend__cio', 'calculated-insight', SPACE, spaces);
  assert.equal(foreignHere.code, 'CI_PREFIX_MISMATCH');
  assert.equal(foreignHere.suggestion, 'ds2_Spend__cio');
  const inDefault = prefixMismatch('ds2_Copy', 'data-transform', 'default', spaces);
  assert.equal(inDefault.code, 'TRANSFORM_PREFIX_MISMATCH');
  assert.equal(inDefault.reason, 'foreign');
  assert.equal(inDefault.owner, SPACE);
  assert.equal(inDefault.suggestion, 'Copy');
  assert.equal(
    prefixMismatch('Graph', 'data-graph', SPACE, spaces).code,
    'DATA_GRAPH_PREFIX_MISMATCH',
  );
  // A prefix needs its underscore; a space without a prefix in the list is never checked.
  assert.equal(prefixMismatch('ds2Order', 'data-graph', 'default', spaces), undefined);
  assert.equal(
    prefixMismatch('Order', 'data-graph', 'nameless', [...spaces, { name: 'nameless' }]),
    undefined,
  );
  // An org with only default never has a mismatch.
  assert.equal(
    prefixMismatch('ds2_Order__dlm', 'dmo', 'default', [{ name: 'default' }]),
    undefined,
  );
  assert.match(
    prefixMismatchWarning(inDefault),
    /^TRANSFORM_PREFIX_MISMATCH: Data transform ds2_Copy is in the data space default, but its name starts with ds2_, the prefix of the data space dataspace2\./u,
  );
});

test('the rule covers only what users make: custom DMOs without namespace, custom insights and transforms, graphs', () => {
  assert.equal(prefixRuleCoversName('dmo', 'Order__dlm'), true);
  assert.equal(prefixRuleCoversName('dmo', 'ssot__Individual__dlm'), false);
  assert.equal(prefixRuleCoversName('dmo', 'ns__Order__dlm'), false);
  assert.equal(
    prefixRuleCoversRead('dmo', { name: 'Order__dlm', creationType: 'Custom', fields: [] }),
    true,
  );
  assert.equal(
    prefixRuleCoversRead('dmo', {
      name: 'ds2_Individual__dlm',
      creationType: 'Standard',
      fields: [],
    }),
    false,
  );
  assert.equal(
    prefixRuleCoversRead('dmo', { name: 'Dg_X_FRAGMENT__dlm', creationType: 'Adg', fields: [] }),
    false,
  );
  assert.equal(
    prefixRuleCoversRead('calculated-insight', { creationType: 'Custom', fields: [] }),
    true,
  );
  assert.equal(prefixRuleCoversRead('data-transform', { creationType: 'CUSTOM' }), true);
  assert.equal(prefixRuleCoversRead('data-transform', { creationType: 'SYSTEM' }), false);
  assert.equal(prefixRuleCoversRead('calculated-insight'), false);
  assert.equal(prefixRuleCoversRead('data-graph'), true);
});

test('a ds2_ DMO is the copy of ssot__<Name>__dlm or of <Name>__dlm, whichever is Standard in default', async () => {
  assert.deepEqual(standardCopyOrigins('ds2_StaticCurrencyRates_Home__dlm', SPACE, 'ds2'), [
    'ssot__StaticCurrencyRates_Home__dlm',
    'StaticCurrencyRates_Home__dlm',
  ]);
  assert.deepEqual(standardCopyOrigins('ds2_Order__dlm', 'default', 'ds2'), []);
  assert.deepEqual(standardCopyOrigins('Order__dlm', SPACE, 'ds2'), []);
  const file = (apiName) => ({
    schemaVersion: 1,
    kind: 'dmo',
    c__dataSpace: SPACE,
    identity: { apiName },
    spec: {
      label: apiName,
      category: 'Other',
      fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
    },
  });
  const reads = [];
  const org = (standard) => ({
    get: async (name) => {
      reads.push(name);
      if (standard[name])
        return { name, creationType: standard[name], dataSpaceName: 'default', fields: [] };
      throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    },
  });
  // The copy of a standard DMO without ssot__ is recognised and never created as custom.
  await assert.rejects(
    preflightNativeDmo(
      file('ds2_StaticCurrencyRates_Home__dlm'),
      org({ StaticCurrencyRates_Home__dlm: 'Standard' }),
      SPACE,
      { dataSpacePrefix: 'ds2' },
    ),
    (error) =>
      error.code === 'UNSUPPORTED_DMO_TARGET' &&
      /copy of the standard DMO StaticCurrencyRates_Home__dlm/u.test(error.message) &&
      // A mapping file derives only the ssot__ spelling: the mapping route is not promised.
      /The plugin cannot create this copy yet, neither from a DMO file nor from a mapping file\. It is created in Salesforce by mapping a DLO onto it in the data space dataspace2\./u.test(
        error.message,
      ) &&
      !/deploy a mapping/iu.test(error.message) &&
      !/deploy a mapping/iu.test(hintOf(error).hint ?? ''),
  );
  assert.deepEqual(reads, [
    'ds2_StaticCurrencyRates_Home__dlm',
    'ssot__StaticCurrencyRates_Home__dlm',
    'StaticCurrencyRates_Home__dlm',
  ]);
  // The copy of an ssot__ DMO still names the mapping route.
  await assert.rejects(
    preflightNativeDmo(
      file('ds2_ContactPointPhone__dlm'),
      org({ ssot__ContactPointPhone__dlm: 'Standard' }),
      SPACE,
      { dataSpacePrefix: 'ds2' },
    ),
    (error) =>
      error.code === 'UNSUPPORTED_DMO_TARGET' &&
      /deploy a mapping onto ds2_ContactPointPhone__dlm instead of the DMO file\./u.test(
        error.message,
      ),
  );
  // A custom ds2_ DMO (neither candidate is Standard in default) is created as custom.
  const plan = await preflightNativeDmo(
    file('ds2_Order__dlm'),
    org({ Order__dlm: 'Custom' }),
    SPACE,
    { dataSpacePrefix: 'ds2' },
  );
  assert.equal(plan.operation, 'create');
  assert.equal(plan.body.name, 'ds2_Order');
});

const dmo = (apiName, space = SPACE) => ({
  path: `data360/dmo/${apiName}.dmo-meta.json`,
  document: {
    schemaVersion: 1,
    kind: 'dmo',
    c__dataSpace: space,
    identity: { apiName },
    spec: {
      label: apiName,
      category: 'Other',
      fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
    },
  },
});
const insight = (apiName, space = SPACE) => ({
  path: `data360/calculatedInsights/${apiName}.calculatedInsight-meta.json`,
  companionPath: `data360/calculatedInsights/${apiName}.calculatedInsight-meta.sql`,
  native: { apiName, dataSpace: space, expression: 'SELECT 1' },
  document: { kind: 'calculated-insight', identity: { dataSpace: space, apiName } },
});
const graph = (name, space = SPACE) => ({
  path: `data360/dataGraphs/${name}.native-dataGraph.json`,
  document: {
    schemaVersion: 1,
    kind: 'native-data-graph',
    c__dataSpace: space,
    definition: { name },
  },
});
const transform = (name, space = SPACE) => ({
  path: `data360/dataTransforms/${name}.dataTransform.json`,
  document: { schemaVersion: 1, kind: 'data-transform', c__dataSpace: space, definition: { name } },
});

/**
 * Deploy with synthetic native DMO services; every other family is stopped before its stage.
 * @param {object[]} inputs Resolved inputs.
 * @param {Record<string, unknown>} existing Raw reads of components that exist, by name.
 * @param {object} [flags] Flag overrides.
 * @returns {Promise<{result: object, calls: string[], logs: string[]}>} Envelope and calls.
 */
const deploy = async (inputs, existing, flags = {}) => {
  const calls = [];
  const logs = [];
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview: false,
      'api-version': 'auto',
      dataspace: SPACE,
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'target',
        getConnection: () => ({ getApiVersion: () => '68.0' }),
      },
      ...flags,
    },
  });
  command.jsonEnabled = () => false;
  command.log = (line) => logs.push(line);
  command.resolveInputs = async () => inputs;
  command.captureInput = async () => 'a'.repeat(64);
  command.createSsotSender = () => ({ request: async () => assert.fail('no bound sender') });
  command.createDmoClient = () => ({});
  command.readPrefixTarget = async (type, name, space) => {
    calls.push(`read:${type}:${name}:${space}`);
    return name in existing ? { native: existing[name] } : undefined;
  };
  command.preflightNativeDmo = async (document) => {
    calls.push(`preflight:${document.identity.apiName}`);
    return { family: 'dmo', outcome: 'update', target: 'present', diagnostics: [] };
  };
  command.executeNativeDmo = async (document) => {
    calls.push(`execute:${document.identity.apiName}`);
    return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
  };
  // DMO files are read from disk: the native stage checks their bytes before every write.
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-prefix-'));
  const written = new Map();
  for (const input of inputs)
    if (input.document.kind === 'dmo') {
      const receipt = await writeNativeDmoDocument(input.document, cwd, false);
      written.set(input, receipt.path);
    }
  command.resolveInputs = async () => {
    const files = await readDeployInputs({ cwd, sourceDir: [...written.values()] });
    return inputs.map((input) => {
      const file = written.get(input);
      return file ? files.find((entry) => entry.path === file) : input;
    });
  };
  command.captureInput = captureDeployInputDigest;
  const previous = process.exitCode;
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return { result: await command.run(), calls, logs };
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previous;
  }
};

test('deploy refuses a new component without the prefix before the first write of the run', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => spaces;
  try {
    for (const [input, code] of [
      [dmo('Order__dlm'), 'DMO_PREFIX_MISMATCH'],
      [insight('Spend__cio'), 'CI_PREFIX_MISMATCH'],
      [transform('Copy'), 'TRANSFORM_PREFIX_MISMATCH'],
      [graph('Graph'), 'DATA_GRAPH_PREFIX_MISMATCH'],
    ]) {
      // A correctly named DMO sorts first and would be written first; nothing is written.
      const { result, calls } = await deploy([dmo('ds2_First__dlm'), input], {});
      assert.equal(result.status, 'blocked', code);
      assert.equal(result.diagnostics.errors[0].code, code);
      assert.match(
        result.diagnostics.errors[0].message,
        /Deployment was refused before any write/u,
      );
      assert.ok(
        calls.every((call) => call.startsWith('read:')),
        `${code}: ${calls.join(', ')}`,
      );
      // Only the mismatching name was read.
      assert.equal(calls.length, 1);
    }
    // In default, another space's prefix is refused the same way.
    const { result } = await deploy(
      [dmo('ds2_Order__dlm', 'default')],
      {},
      { dataspace: 'default' },
    );
    assert.equal(result.diagnostics.errors[0].code, 'DMO_PREFIX_MISMATCH');
    assert.match(
      result.diagnostics.errors[0].message,
      /the prefix of the data space dataspace2\. Name it Order__dlm/u,
    );
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('deploy update of an existing component without the prefix warns and goes ahead', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => spaces;
  try {
    const { result, calls, logs } = await deploy([dmo('Order__dlm')], {
      Order__dlm: { name: 'Order__dlm', creationType: 'Custom', dataSpaceName: SPACE, fields: [] },
    });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(calls, [`read:dmo:Order__dlm:${SPACE}`, 'execute:Order__dlm']);
    assert.equal(result.diagnostics.warnings.length, 1);
    assert.match(
      result.diagnostics.warnings[0],
      /^DMO_PREFIX_MISMATCH: DMO Order__dlm is in the data space dataspace2/u,
    );
    assert.ok(logs.includes(`Warning: ${result.diagnostics.warnings[0]}`));
    // An existing component the rule does not cover (not Custom) gets no warning.
    const standard = await deploy([dmo('Order__dlm')], {
      Order__dlm: {
        name: 'Order__dlm',
        creationType: 'Standard',
        dataSpaceName: SPACE,
        fields: [],
      },
    });
    assert.equal(standard.result.status, 'success');
    assert.deepEqual(standard.result.diagnostics.warnings, []);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('an org with only default gets no warning and no extra request', async () => {
  const restore = dataSpaceDirectory.read;
  let listReads = 0;
  dataSpaceDirectory.read = async () => {
    listReads++;
    return [{ name: 'default' }];
  };
  try {
    const { result, calls } = await deploy(
      [dmo('ds2_Order__dlm', 'default'), dmo('Plain__dlm', 'default')],
      {},
      { dataspace: 'default' },
    );
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics.warnings, []);
    assert.ok(
      calls.every((call) => !call.startsWith('read:')),
      calls.join(', '),
    );
    assert.equal(listReads, 1);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('retrieve warns for every retrieved custom component that breaks the prefix rule', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => spaces;
  const command = Object.create(Retrieve.prototype);
  const warnings = [];
  try {
    // The run's one data space check exists before any item is read.
    await assert.doesNotReject(dataSpaceCheckOf(command, async () => ({})).require([SPACE]));
    const note = (type, name, native) =>
      command.notePrefixMismatch(type, name, native, SPACE, warnings);
    await note('dmo', 'Order__dlm', { name: 'Order__dlm', creationType: 'Custom', fields: [] });
    await note('dmo', 'ds2_Order__dlm', {
      name: 'ds2_Order__dlm',
      creationType: 'Custom',
      fields: [],
    });
    await note('dmo', 'Other__dlm', { name: 'Other__dlm', creationType: 'Standard', fields: [] });
    await note('calculated-insight', 'Spend__cio', { creationType: 'Custom', fields: [] });
    await note('data-transform', 'Dg_Graph_1', { creationType: 'SYSTEM' });
    await note('data-graph', 'Graph', { name: 'Graph' });
    assert.deepEqual(
      warnings.map((warning) => warning.split(':')[0]),
      ['DMO_PREFIX_MISMATCH', 'CI_PREFIX_MISMATCH', 'DATA_GRAPH_PREFIX_MISMATCH'],
    );
  } finally {
    dataSpaceDirectory.read = restore;
  }
  // Offline spaces name no prefix: nothing is reported.
  dataSpaceDirectory.read = async () => [...offlineDataSpaces];
  const plain = Object.create(Retrieve.prototype);
  const none = [];
  await plain.notePrefixMismatch(
    'dmo',
    'Order__dlm',
    { name: 'Order__dlm', creationType: 'Custom', fields: [] },
    SPACE,
    none,
  );
  assert.deepEqual(none, []);
});

test('deploy update of an existing insight, transform or graph without the prefix warns', async () => {
  const restore = dataSpaceDirectory.read;
  dataSpaceDirectory.read = async () => spaces;
  try {
    for (const [input, name, native, code] of [
      [insight('Spend__cio'), 'Spend__cio', { creationType: 'Custom' }, 'CI_PREFIX_MISMATCH'],
      [transform('Copy'), 'Copy', { creationType: 'CUSTOM' }, 'TRANSFORM_PREFIX_MISMATCH'],
      [graph('Graph'), 'Graph', { name: 'Graph' }, 'DATA_GRAPH_PREFIX_MISMATCH'],
    ]) {
      // The warning is made before any write; each family's own stage is stopped later.
      const { result, calls } = await deploy([dmo('ds2_First__dlm'), input], { [name]: native });
      assert.equal(
        calls[0],
        `read:${input.document.kind === 'native-data-graph' ? 'data-graph' : input.document.kind}:${name}:${SPACE}`,
      );
      assert.notEqual(result.diagnostics.errors[0]?.code, code);
      assert.equal(result.diagnostics.warnings.length, 1, code);
      assert.match(result.diagnostics.warnings[0], new RegExp(`^${code}: `, 'u'));
    }
    // A generated transform (creationType SYSTEM) is not the user's: no warning.
    const system = await deploy([dmo('ds2_First__dlm'), transform('Dg_Graph_1')], {
      Dg_Graph_1: { creationType: 'SYSTEM' },
    });
    assert.equal(system.calls[0], `read:data-transform:Dg_Graph_1:${SPACE}`);
    assert.deepEqual(system.result.diagnostics.warnings, []);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

/**
 * Deploy whose prefix-check read runs for real against fake clients.
 * @param {Record<string, unknown>} seams Client seams.
 * @returns {object} Command.
 */
const reader = (seams) => {
  const command = Object.create(Deploy.prototype);
  command.ssotSender = () => ({});
  Object.assign(command, seams);
  return command;
};
const org = { getConnection: () => ({}), getUsername: () => 'target' };
const failure = new Error('connection reset');
const dmoReader = (get) => reader({ createDmoClient: () => ({ get }) });
const graphReader = (read) =>
  reader({ nativeGraphContext: async () => ({ get: async () => read }) });

test('the prefix check reads a DMO by its GET: 404 is absent, any other failure stops the run', async () => {
  assert.equal(
    await dmoReader(async () => {
      throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    }).readPrefixTarget('dmo', 'Order__dlm', SPACE, org),
    undefined,
  );
  const present = { name: 'Order__dlm', creationType: 'Custom', fields: [] };
  assert.deepEqual(
    await dmoReader(async () => present).readPrefixTarget('dmo', 'Order__dlm', SPACE, org),
    { native: present },
  );
  for (const error of [new NativeDmoError('DMO_HTTP_ERROR', 500), failure])
    await assert.rejects(
      dmoReader(async () => {
        throw error;
      }).readPrefixTarget('dmo', 'Order__dlm', SPACE, org),
      (thrown) => thrown === error,
    );
});

test('the prefix check reads an insight like its stage: only a 404 with a Salesforce code is absent', async () => {
  const ciReader = (get) => reader({ calculatedInsightContext: () => ({ dataSpace: SPACE, get }) });
  for (const nativeCode of ['ITEM_NOT_FOUND', 'ENTITY_IS_DELETED'])
    assert.equal(
      await ciReader(async () => {
        throw new ConnectError('REQUEST_FAILED', 404, nativeCode);
      }).readPrefixTarget('calculated-insight', 'Spend__cio', SPACE, org),
      undefined,
    );
  const present = { apiName: 'Spend__cio', creationType: 'Custom' };
  assert.deepEqual(
    await ciReader(async () => present).readPrefixTarget(
      'calculated-insight',
      'Spend__cio',
      SPACE,
      org,
    ),
    { native: present },
  );
  // A bare 404 (no Salesforce code) or any other failure is a read failure, never absence.
  for (const error of [
    new ConnectError('REQUEST_FAILED', 404),
    new ConnectError('REQUEST_FAILED', 500),
    failure,
  ])
    await assert.rejects(
      ciReader(async () => {
        throw error;
      }).readPrefixTarget('calculated-insight', 'Spend__cio', SPACE, org),
      (thrown) => thrown.code === 'CI_RUNTIME_UNKNOWN',
    );
});

test('the prefix check finds a transform like its stage: by the complete inventory, ignoring case', async () => {
  const id = '1dtAAAAAAAAAAAAAAA';
  const gets = [];
  const transformReader = (rows, list) =>
    reader({
      createDataTransformClient: () => ({
        list: list ?? (async () => ({ totalSize: rows.length, dataTransforms: rows })),
        get: async (nameOrId) => {
          gets.push(nameOrId);
          // A GET by name would answer 404: the inventory, never the GET, decides absence.
          if (nameOrId !== id) throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
          return { id, name: 'copy', creationType: 'Custom' };
        },
      }),
    });
  assert.equal(
    await transformReader([{ id, name: 'Other' }]).readPrefixTarget(
      'data-transform',
      'Copy',
      SPACE,
      org,
    ),
    undefined,
  );
  assert.deepEqual(gets, []);
  assert.deepEqual(
    await transformReader([{ id, name: 'copy' }]).readPrefixTarget(
      'data-transform',
      'Copy',
      SPACE,
      org,
    ),
    { native: { id, name: 'copy', creationType: 'Custom' } },
  );
  assert.deepEqual(gets, [id]);
  // An inventory read failure stops the run.
  await assert.rejects(
    transformReader([], async () => {
      throw failure;
    }).readPrefixTarget('data-transform', 'Copy', SPACE, org),
    (thrown) => thrown === failure,
  );
  await assert.rejects(
    transformReader([], async () => ({ totalSize: 1, dataTransforms: [] })).readPrefixTarget(
      'data-transform',
      'Copy',
      SPACE,
      org,
    ),
    (thrown) => thrown.code === 'INCOMPLETE_TRANSFORM_INVENTORY',
  );
});

test('the prefix check reads a graph: only its exact not-found answer is absent', async () => {
  assert.equal(
    await graphReader({
      status: 400,
      body: [{ errorCode: 'INTERNAL_ERROR', message: 'Data Graph not found with name Graph' }],
    }).readPrefixTarget('data-graph', 'Graph', SPACE, org),
    undefined,
  );
  assert.deepEqual(
    await graphReader({ status: 200, body: { name: 'Graph' } }).readPrefixTarget(
      'data-graph',
      'Graph',
      SPACE,
      org,
    ),
    { native: { name: 'Graph' } },
  );
  for (const read of [
    { status: 404, body: [] },
    { status: 400, body: [{ errorCode: 'INTERNAL_ERROR', message: 'Something else' }] },
  ])
    await assert.rejects(
      graphReader(read).readPrefixTarget('data-graph', 'Graph', SPACE, org),
      /Data graph read failed/u,
    );
});
