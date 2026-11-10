import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { SegmentError } from '../lib/artifacts/segment-document.js';
import { MetadataReadError } from '../lib/services/read-metadata.js';

import { RelationshipDefinitionError } from '../lib/artifacts/write-relationship-definition.js';

import { MappingDefinitionError } from '../lib/artifacts/write-mapping-definition.js';

test('human retrieval groups successful names and counts receipts for named, type and bare modes', async () => {
  for (const selection of [
    undefined,
    ['dlo', 'dmo', 'mapping'],
    ['dlo:Alpha__dll', 'dlo:Zulu__dll', 'dmo:Sample__dlm', 'mapping:Map'],
  ]) {
    for (const json of [false, true]) {
      const command = invocation({ metadata: selection, 'api-version': 'auto' });
      const lines = [];
      command.jsonEnabled = () => json;
      command.log = (line) => lines.push(line);
      command.listNativeNames = async (_connection, _version, family) =>
        family === 'dlo' ? ['Alpha__dll', 'Zulu__dll'] : ['Sample__dlm'];
      command.listNativeMappingNames = async () => ['Map'];
      command.writeMapping = async (name) => ({ path: `${name}.json`, outcome: 'retrieved' });
      command.createDloClient = () => ({});
      command.acquireDlo = async (name) => ({
        kind: 'dlo',
        identity: { dataSpace: 'default', apiName: name },
      });
      command.writeDlo = async (document) => ({
        path: `${document.identity.apiName}.json`,
        outcome: 'unchanged',
      });
      const { result } = await run(command);
      assert.equal(result.status, 'success', JSON.stringify({ result, lines }));
      assert.deepEqual(
        lines,
        json
          ? []
          : [
              'Retrieve: success.',
              'Downloaded dlo:Alpha__dll (unchanged).',
              'Downloaded dlo:Zulu__dll (unchanged).',
              'Downloaded dlo: 2',
              'Downloaded dmo:Sample__dlm (retrieved).',
              'Downloaded dmo: 1',
              'Downloaded mapping:Map (retrieved).',
              'Downloaded mapping: 1',
            ],
      );
      assert.ok(!JSON.stringify(result).includes('Downloaded'));
    }
  }
});

test('human retrieval reports empty type and excludes failed names from downloads', async () => {
  for (const empty of [false, true]) {
    const command = invocation({ metadata: ['mapping'], 'api-version': 'auto' });
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    command.listNativeNames = async () => [];
    command.listNativeMappingNames = async () => (empty ? [] : ['Alpha', 'Failed']);
    command.writeMapping = async (name) => ({ path: `${name}.json`, outcome: 'retrieved' });
    command.acquireNativeMapping = async (name) => {
      if (name === 'Failed') throw new Error('failure');
      return { kind: 'mapping', identity: { dataSpace: 'default', apiName: name } };
    };
    const { result } = await run(command);
    assert.equal(result.status, empty ? 'success' : 'failed');
    assert.equal(lines.at(-1), `Downloaded mapping: ${empty ? 0 : 1}`);
    assert.ok(!lines.some((line) => line.startsWith('Downloaded mapping:Failed')));
    if (!empty) assert.ok(lines.some((line) => line.startsWith('mapping:Failed:')));
  }
});

test('mixed DLO acquisition failure stays in its human group without changing JSON diagnostics', async () => {
  for (const json of [false, true]) {
    const command = invocation({
      metadata: ['dlo:Broken__dll', 'segment:Audience'],
      'api-version': 'auto',
    });
    const lines = [];
    command.jsonEnabled = () => json;
    command.log = (line) => lines.push(line);
    command.createDloClient = () => ({});
    command.acquireDlo = async () => {
      throw new Error('private-token');
    };
    command.writeDlo = () => assert.fail('failed acquisition must not write');
    command.selectDependencies = async () => ({
      entries: [
        {
          document: { kind: 'segment', identity: { dataSpace: 'default', apiName: 'Audience' } },
          definitionXml: '<xml/>',
        },
      ],
      reasons: new Map(),
    });
    command.writeSegment = async () => ({ path: 'Audience.xml', outcome: 'retrieved' });
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(exitCode, 1);
    assert.deepEqual(result.diagnostics.errors, [
      {
        code: 'RETRIEVE_FAILED',
        message:
          'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.',
        retryable: false,
        identity: { dataSpace: 'default', apiName: 'Broken__dll' },
      },
    ]);
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Audience'],
    );
    assert.deepEqual(
      lines,
      json
        ? []
        : [
            'Retrieve: failed.',
            `dlo:Broken__dll: RETRIEVE_FAILED: ${result.diagnostics.errors[0].message}`,
            'Downloaded dlo: 0',
            'Downloaded segment:Audience (retrieved).',
            'Downloaded segment: 1',
          ],
    );
  }
});

test('non-DMO output failure uses document kind and excludes failure from human counts', async () => {
  for (const json of [false, true]) {
    const command = invocation({ metadata: ['dmo:Sample__dlm', 'segment:Audience'] });
    const lines = [];
    command.jsonEnabled = () => json;
    command.log = (line) => lines.push(line);
    command.selectDependencies = async () => ({
      entries: [
        { document: candidate },
        {
          document: { kind: 'segment', identity: { dataSpace: 'default', apiName: 'Audience' } },
          definitionXml: '<xml/>',
        },
      ],
      reasons: new Map(),
    });
    command.writeSegment = async () => {
      throw new SegmentError('OUTPUT_FAILED');
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'failed');
    assert.equal(exitCode, 1);
    assert.deepEqual(result.diagnostics.errors, [
      {
        code: 'OUTPUT_FAILED',
        message:
          'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.',
        retryable: false,
        identity: { dataSpace: 'default', apiName: 'Audience' },
      },
    ]);
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Sample__dlm'],
    );
    assert.deepEqual(
      lines,
      json
        ? []
        : [
            'Retrieve: failed.',
            'Downloaded dmo:Sample__dlm (retrieved).',
            'Downloaded dmo: 1',
            `segment:Audience: OUTPUT_FAILED: ${result.diagnostics.errors[0].message}`,
            'Downloaded segment: 0',
          ],
    );
  }
});

for (const version of ['65.0', 'auto']) {
  test(`mapping export sorted unique opaque definitions at ${version}`, async () => {
    const command = invocation({
      metadata: ['mapping:Zulu', 'mapping:Alpha', 'mapping:Zulu'],
      'api-version': version,
    });
    command.listNativeNames = () => assert.fail('no DMO inventory');
    const reads = [];
    command.acquireNativeMapping = async (name) => {
      reads.push(name);
      return { kind: 'mapping', identity: { dataSpace: 'default', apiName: name } };
    };
    command.writeMapping = async (name, xml) => {
      assert.equal(xml, '<opaque/>');
      return { path: `${name}.xml`, outcome: 'retrieved' };
    };
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(result.metadata.apiVersion, version);
    assert.deepEqual(reads, ['Alpha', 'Zulu']);
    assert.deepEqual(result.result.selection, ['mapping:Alpha', 'mapping:Zulu']);
    for (const item of result.result.items) {
      assert.equal(item.family, 'mapping');
      assert.equal(item.definitionOnly, undefined);
      assert.equal(item.deployable, undefined);
      assert.deepEqual(item.routes, [
        {
          operation: 'mapping.get',
          apiVersion: version === 'auto' ? '68.0' : version,
          transport: 'native',
        },
      ]);
    }
  });
}
for (const override of [
  { 'api-version': '60.0' },
  { 'api-version': 'latest' },
  { 'api-version': '59.0' },
  { metadata: ['mapping:../escape'] },
  { metadata: ['mapping:'] },
  { 'include-dependencies': true },
  { metadata: ['mapping:Alpha', 'data-graph:Graph'], 'api-version': '65.0' },
])
  test(`mapping refusal before auth ${JSON.stringify(override)}`, async () => {
    const command = invocation({ metadata: ['mapping:Alpha'], ...override });
    command.resolveOrg = () => assert.fail('before auth');
    const { result } = await run(command);
    assert.equal(result.status, 'blocked');
  });
for (const mode of ['read', 'output', 'overwrite'])
  test(`mapping ${mode} failure between successes preserves results and labels`, async () => {
    const command = invocation({ metadata: ['mapping:Zulu', 'mapping:Middle', 'mapping:Alpha'] });
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    command.acquireNativeMapping = async (name) => {
      if (mode === 'read' && name === 'Middle') throw new Error('private-token');
      return { kind: 'mapping', identity: { dataSpace: 'default', apiName: name } };
    };
    command.writeMapping = async (name) => {
      if (mode !== 'read' && name === 'Middle')
        throw new MappingDefinitionError(
          mode === 'overwrite' ? 'OVERWRITE_REQUIRED' : 'OUTPUT_FAILED',
        );
      return { path: `${name}.xml`, outcome: 'retrieved' };
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, mode === 'overwrite' ? 'blocked' : 'failed');
    assert.equal(exitCode, 1);
    assert.deepEqual(
      result.result.items.map((x) => x.identity.apiName),
      ['Alpha', 'Zulu'],
    );
    assert.equal(result.diagnostics.errors[0].family, 'mapping');
    assert.ok(lines.some((x) => x.startsWith('mapping:Middle:')));
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  });
test('mixed mapping relationship and DMO auto preserves routes and outputs', async () => {
  const command = invocation({
    metadata: ['mapping:Alpha', 'relationship:Link', 'dmo:Sample__dlm'],
    'api-version': 'auto',
  });
  command.acquireMappingXml = command.acquireRelationshipXml = async () => '<opaque/>';
  command.writeMapping = command.writeRelationship = async (name) => ({
    path: `${name}.xml`,
    outcome: 'retrieved',
  });
  command.selectDependencies = async (identities, conn, selection) => {
    assert.equal(selection.soapNumeric, '65.0');
    assert.deepEqual(
      identities.map((x) => x.kind),
      ['dmo'],
    );
    return {
      entries: [{ document: candidate, reason: { explicit: true, chains: [] } }],
      reasons: new Map(),
    };
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items.length, 3);
  assert.equal(result.metadata.apiVersion, 'auto');
});
test('mixed mapping Graph auto retains Graph67 and mapping65 pins', async () => {
  const command = invocation({
    metadata: ['mapping:Alpha', 'data-graph:Graph'],
    'api-version': 'auto',
  });
  const pins = [];
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: (version) => {
      pins.push(version);
      return connection;
    },
  });
  command.acquireMappingXml = async () => '<opaque/>';
  command.writeMapping = async () => ({ path: 'Alpha.xml', outcome: 'retrieved' });
  command.readRawDataGraph = async () => {
    throw new Error('synthetic');
  };
  const { result } = await run(command);
  assert.equal(result.metadata.soapApiVersion, '67.0');
  assert.ok(pins.includes('67.0'));
  assert.equal(result.result.items[0].routes[0].apiVersion, '68.0');
});

const candidate = {
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: 'Sample__dlm' },
  spec: { arbitrary: 'service-owned' },
};
const connection = {};
const invocation = (overrides = {}) => {
  const command = Object.create(Retrieve.prototype);
  const flags = {
    metadata: ['dmo'],
    'api-version': '65.0',
    dataspace: 'default',
    overwrite: false,
    'target-org': 'synthetic',
    ...overrides,
  };
  command.resolveOrg = async () => {
    if (!flags['target-org']) throw new Error('no org');
    return { getOrgId: () => 'synthetic-org', getConnection: () => connection };
  };
  command.listNativeNames = async (_connection, _version, family) =>
    family === 'dmo' ? ['Sample__dlm'] : [];
  command.listNativeMappingNames = async () => [];
  command.createMappingInventoryReader = command.createMappingClient = () => ({});
  command.acquireNativeMapping = async (name) => ({
    kind: 'mapping',
    identity: { dataSpace: 'default', apiName: name },
  });
  command.writeNativeMapping = async (document, ...arguments_) =>
    command.writeMapping(document.identity.apiName, '<opaque/>', ...arguments_);
  const client = {};
  command.createDmoClient = (target, version) => {
    assert.equal(target, 'synthetic');
    assert.equal(version, flags['api-version'] === 'auto' ? '68.0' : flags['api-version']);
    return client;
  };
  command.config = { pjson: { version: '2.151.7' } };
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.acquireNativeDmo = async (...arguments_) => {
    assert.deepEqual(arguments_, ['Sample__dlm', client, flags.dataspace]);
    return candidate;
  };
  command.writeNativeDmo = async (...arguments_) => {
    assert.deepEqual(arguments_, [
      candidate,
      flags['output-dir'] ?? process.cwd(),
      flags.overwrite,
    ]);
    return { path: 'synthetic-output.json', outcome: 'retrieved' };
  };
  return command;
};

test('latest is refused for every DMO selection before authentication or discovery', async () => {
  for (const overrides of [
    { metadata: undefined },
    { metadata: ['dmo'] },
    { metadata: ['dmo:Sample__dlm'] },
    { metadata: ['dmo:Sample__dlm'], 'include-dependencies': true },
    { metadata: ['dmo:Sample__dlm', 'relationship:Link'] },
    { metadata: ['dmo', 'segment:Audience'] },
  ]) {
    const command = invocation({ ...overrides, 'api-version': 'latest' });
    command.resolveOrg = () => assert.fail('latest must be refused before authentication');
    command.listNativeNames =
      command.acquireNativeDmo =
      command.writeNativeDmo =
        () => assert.fail('no DMO or file work');
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
    assert.deepEqual(result.result.items, []);
  }
});

test('explicit numeric DMO beside a relationship now reads and writes the native format', async () => {
  for (const metadata of [
    ['relationship:Link', 'dmo:Sample__dlm'],
    ['relationship:Link', 'dmo'],
  ]) {
    const command = invocation({ metadata, 'api-version': '65.0', 'output-dir': 'project' });
    command.acquireRelationshipXml = async () => '<opaque/>';
    command.writeRelationship = async (name) => ({ path: `${name}.xml`, outcome: 'retrieved' });
    const inventories = [];
    command.listNativeNames = async (actualConnection, version, family, scope) => {
      assert.equal(actualConnection, connection);
      inventories.push([version, family, scope]);
      return ['Sample__dlm'];
    };
    const selections = [];
    command.selectDependencies = async (identities, actualConnection, selection, include) => {
      assert.equal(actualConnection, connection);
      assert.deepEqual(selection, {
        requested: '65.0',
        restSelector: 'v65.0',
        soapNumeric: '65.0',
      });
      assert.equal(include, false);
      selections.push(identities);
      return { entries: [{ document: candidate }], reasons: new Map() };
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(exitCode, undefined);
    assert.deepEqual(inventories, metadata.includes('dmo') ? [['65.0', 'dmo', 'default']] : []);
    assert.deepEqual(selections, [[{ kind: 'dmo', dataSpace: 'default', apiName: 'Sample__dlm' }]]);
    assert.deepEqual(result.result.selection, ['relationship:Link', 'dmo:Sample__dlm']);
    const item = result.result.items.find((entry) => entry.identity.apiName === 'Sample__dlm');
    assert.equal(item.path, 'synthetic-output.json');
    assert.deepEqual(item.routes, [
      { operation: 'dmo.get', apiVersion: '65.0', transport: 'native' },
    ]);
    // The API65 metadata adapter route evidence must not reappear.
    assert.ok(!JSON.stringify(result).includes('dmo.metadata'));
  }
});

test('the removed API65 DMO adapter seams are absent from the retrieve command', () => {
  const defaults = new Retrieve([], {});
  for (const seam of ['acquire', 'selectDocuments', 'writeDocument'])
    assert.equal(seam in defaults, false, seam);
  assert.equal(typeof defaults.acquireNativeDmo, 'function');
  assert.equal(typeof defaults.writeNativeDmo, 'function');
});

for (const apiVersion of ['65.0', '68.0', 'auto']) {
  test(`exact Segment ${apiVersion} repeat selection deduplicates and writes pairs without DMO inventory`, async () => {
    const command = invocation({
      metadata: ['segment:Zulu', 'segment:Alpha', 'segment:Zulu'],
      'api-version': apiVersion,
      'output-dir': 'custom-root',
    });
    command.listNativeNames = () => assert.fail('Segment exact must not list DMOs');
    const acquired = [];
    command.selectDependencies = async (roots, conn, version) => {
      const entries = [];
      for (const root of roots) {
        const acquired = await command.acquireSegment(conn, root.apiName, version, root.dataSpace);
        entries.push({ document: acquired.candidate });
      }
      return { entries, reasons: new Map() };
    };
    command.acquireSegment = async (conn, name, version, space) => {
      assert.equal(conn, connection);
      assert.equal(version.requested, apiVersion === 'auto' ? '68.0' : apiVersion);
      assert.equal(space, 'default');
      acquired.push(name);
      return {
        candidate: { kind: 'segment', identity: { dataSpace: 'default', apiName: name } },
        definitionXml: '<independent/>',
        blockers: [],
      };
    };
    command.writeSegment = async (document, root, overwrite) => {
      assert.equal(root, 'custom-root');
      assert.equal(overwrite, false);
      return {
        path: `${document.identity.apiName}.segment.json`,
        outcome: 'unchanged',
      };
    };
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.deepEqual(acquired, ['Alpha', 'Zulu']);
    assert.deepEqual(result.result.selection, ['segment:Alpha', 'segment:Zulu']);
    assert.ok(
      result.result.items.every(
        (item) =>
          item.family === 'segment' &&
          !('companionPath' in item) &&
          item.path.endsWith('.segment.json') &&
          item.outcome === 'unchanged',
      ),
    );
    for (const item of result.result.items) {
      assert.deepEqual(
        item.routes.map((route) => route.apiVersion),
        [apiVersion === 'auto' ? '68.0' : apiVersion],
      );
    }
  });
}
test('Segment bare inventory/latest/invalid identity refuse before auth', async () => {
  for (const flags of [
    { metadata: ['segment'] },
    { metadata: ['segment:../unsafe'] },
    { metadata: ['segment:Audience'], 'api-version': 'latest' },
  ]) {
    const command = invocation(flags);
    command.resolveOrg = () => assert.fail('scope before auth');
    const { result } = await run(command);
    assert.equal(result.status, 'blocked');
  }
});
test('blocked Segment dependency selection prevents complete-selection publication', async () => {
  const command = invocation({ metadata: ['dmo:Sample__dlm', 'segment:Audience'] });
  command.selectDependencies = async () => {
    throw new MetadataReadError('UNKNOWN_SEGMENT_CONFIGURATION');
  };
  command.writeSegment = () => assert.fail('must not publish');
  const { result } = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(result.result.items.length, 0);
});

// Restore process exit state after checking envelope failures, not an actual CLI process.
const run = async (command) => {
  const previous = process.exitCode;
  try {
    const result = await command.run();
    return { result, exitCode: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};

test('command delegates acquisition and authored-only output without duplicating schema checks', async () => {
  const { result } = await run(invocation());
  assert.equal(result.contract, 'sf-data360-retrieve');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.status, 'success');
  assert.deepEqual(result.metadata.plugin, {
    name: 'sf-plugin-data',
    version: '0.1.0',
  });
  assert.equal(result.provenance.pluginVersion, '0.1.0');
  assert.equal(result.metadata.apiVersion, '65.0');
  assert.equal(result.provenance.sourceOrgId, 'synthetic-org');
  assert.equal(result.result.items[0].outcome, 'retrieved');
  assert.ok(!JSON.stringify(result).includes('never persisted'));
});

test('output root and changed-only overwrite flow unchanged to the writer', async () => {
  const command = invocation({
    'output-dir': 'project',
    overwrite: true,
  });
  command.writeNativeDmo = async (value, root, overwrite) => {
    assert.equal(value, candidate);
    assert.equal(root, 'project');
    assert.equal(overwrite, true);
    return { path: 'synthetic-output.json', outcome: 'unchanged' };
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].outcome, 'unchanged');
});

test('invalid selectors refuse before authentication, acquisition or filesystem work', async () => {
  for (const metadata of [
    ['dlo:Sample'],
    ['dmo:A', 'dmo:B'],
    ['dmo:'],
    ['dmo:A:B'],
    ['dmo:../A__dlm'],
  ]) {
    const command = invocation({ metadata });
    command.resolveOrg = () => assert.fail('must not authenticate');
    command.acquireNativeDmo = () => assert.fail('must not acquire');
    command.writeNativeDmo = () => assert.fail('must not write');
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SELECTION');
    assert.equal(exitCode, 1);
  }
});

test('real selector expansion writes each exact/type/all member once in sorted order', async () => {
  for (const metadata of [
    undefined,
    ['dmo'],
    ['dmo', 'dmo:Zeta__dlm', 'dmo:Alpha__dlm', 'dmo:Zeta__dlm'],
    ['dmo', 'dmo:Alpha__dlm'],
  ]) {
    const command = invocation({ metadata, 'output-dir': 'project', overwrite: true });
    let inventories = 0;
    command.listNativeNames = async (actualConnection, version, family, scope) => {
      assert.equal(actualConnection, connection);
      assert.equal(version, '65.0');
      assert.equal(scope, 'default');
      if (family !== 'dmo') return [];
      inventories++;
      return ['Zeta__dlm', 'Alpha__dlm'];
    };
    command.acquireNativeDmo = async (name) => ({
      ...candidate,
      identity: { dataSpace: 'default', apiName: name },
    });
    const written = [];
    command.writeNativeDmo = async (document, root, overwrite) => {
      assert.equal(root, 'project');
      assert.equal(overwrite, true);
      written.push(document.identity.apiName);
      return { path: `${document.identity.apiName}.json`, outcome: 'unchanged' };
    };
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Alpha__dlm', 'Zeta__dlm']);
    assert.deepEqual(result.result.selection, ['dmo:Alpha__dlm', 'dmo:Zeta__dlm']);
    assert.equal(inventories, metadata?.every((value) => value !== 'dmo') ? 0 : 1);
  }
});

test('human output includes per-object diagnostic identity and code', async () => {
  const command = invocation();
  command.jsonEnabled = () => false;
  const lines = [];
  command.log = (line) => lines.push(line);
  command.acquireNativeDmo = async () => {
    throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
  };
  const { result, exitCode } = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(exitCode, 1);
  assert.match(lines.join('\n'), /dmo:Sample__dlm: UNSUPPORTED_DMO_TARGET/u);
});

test('type, omitted and repeated selectors reach selection and retain per-object partial outcomes', async () => {
  for (const metadata of [undefined, [], ['dmo'], ['dmo', 'dmo:Sample__dlm', 'dmo:Sample__dlm']]) {
    const command = invocation({ metadata });
    command.listNativeNames = async (actualConnection, version, family, space) => {
      assert.equal(actualConnection, connection);
      assert.equal(version, '65.0');
      assert.equal(space, 'default');
      return family === 'dmo' ? ['Alpha__dlm', 'Broken__dlm', 'Unsupported__dlm', 'Zeta__dlm'] : [];
    };
    const acquired = [];
    command.acquireNativeDmo = async (name) => {
      acquired.push(name);
      if (name === 'Broken__dlm') throw new Error('private remote body');
      if (name === 'Unsupported__dlm') throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
      return { ...candidate, identity: { dataSpace: 'default', apiName: name } };
    };
    command.writeNativeDmo = async (document) => ({
      path: `${document.identity.apiName}.json`,
      outcome: 'retrieved',
    });
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.equal(result.status, 'failed');
    const exactAdded = metadata?.includes('dmo:Sample__dlm');
    assert.deepEqual(acquired, [
      'Alpha__dlm',
      'Broken__dlm',
      ...(exactAdded ? ['Sample__dlm'] : []),
      'Unsupported__dlm',
      'Zeta__dlm',
    ]);
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Alpha__dlm', ...(exactAdded ? ['Sample__dlm'] : []), 'Zeta__dlm'],
    );
    assert.deepEqual(
      result.diagnostics.errors.map((error) => [error.identity.apiName, error.code]),
      [
        ['Broken__dlm', 'NATIVE_RETRIEVE_FAILED'],
        ['Unsupported__dlm', 'UNSUPPORTED_DMO_TARGET'],
      ],
    );
    assert.ok(!JSON.stringify(result).includes('private remote body'));
  }
});

test('empty inventory succeeds with no files; incomplete inventory blocks before writes', async () => {
  const command = invocation({ metadata: [] });
  command.acquireNativeDmo = () => assert.fail('must not acquire');
  command.writeNativeDmo = () => assert.fail('must not write');
  command.listNativeNames = async () => [];
  const empty = await run(command);
  assert.equal(empty.result.status, 'success');
  assert.deepEqual(empty.result.result.items, []);
  assert.deepEqual(empty.result.result.selection, []);
  command.listNativeNames = async () => {
    throw new NativeMappingError('NATIVE_INVENTORY_UNCONFIRMED');
  };
  const incomplete = await run(command);
  assert.equal(incomplete.exitCode, 1);
  assert.equal(incomplete.result.status, 'blocked');
  assert.equal(incomplete.result.diagnostics.errors[0].code, 'NATIVE_INVENTORY_UNCONFIRMED');
});

test('unsupported scope validates before authentication', async () => {
  for (const overrides of [{ 'api-version': '60.0' }]) {
    const command = invocation(overrides);
    command.resolveOrg = () => assert.fail('must not authenticate');
    const { result } = await run(command);
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SCOPE');
  }
});

test('missing default org is an explicit blocked envelope', async () => {
  const { result, exitCode } = await run(invocation({ 'target-org': undefined }));
  assert.equal(result.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
  assert.equal(exitCode, 1);
});

test('service refusals and remote failures never publish candidates or leak error payloads', async () => {
  for (const error of [new NativeDmoError('INVALID_SCOPE'), new Error('private remote body')]) {
    const command = invocation();
    command.acquireNativeDmo = async () => {
      throw error;
    };
    command.writeNativeDmo = () => assert.fail('must not write');
    const { result, exitCode } = await run(command);
    assert.equal(exitCode, 1);
    assert.ok(!JSON.stringify(result).includes('private remote body'));
    assert.deepEqual(result.result.items, []);
    assert.equal(result.status, 'failed');
    assert.equal(
      result.diagnostics.errors[0].code,
      error instanceof NativeDmoError ? 'INVALID_SCOPE' : 'NATIVE_RETRIEVE_FAILED',
    );
  }
});

for (const version of ['65.0', 'auto']) {
  test(`relationship exact export is sorted unique and definition-only at ${version}`, async () => {
    const command = invocation({
      metadata: ['relationship:Zulu', 'relationship:Alpha', 'relationship:Zulu'],
      'api-version': version,
    });
    command.listNativeNames = () => assert.fail('relationship must not select DMOs');
    const reads = [];
    command.acquireRelationshipXml = async (org, name) => {
      assert.equal(org, 'synthetic');
      reads.push(name);
      return `<${name}/>`;
    };
    command.writeRelationship = async (name, xml) => {
      assert.equal(xml, `<${name}/>`);
      return { path: `${name}.xml`, outcome: 'retrieved' };
    };
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(result.metadata.apiVersion, version);
    assert.deepEqual(reads, ['Alpha', 'Zulu']);
    assert.deepEqual(result.result.selection, ['relationship:Alpha', 'relationship:Zulu']);
    for (const item of result.result.items) {
      assert.equal(item.family, 'relationship');
      assert.equal(item.definitionOnly, true);
      assert.equal(item.deployable, false);
      assert.deepEqual(item.routes, [
        { operation: 'relationship.metadata', apiVersion: '65.0', transport: 'metadata' },
      ]);
    }
  });
}

for (const override of [
  { 'api-version': '60.0' },
  { 'api-version': 'latest' },
  { 'api-version': '59.0' },
  { dataspace: 'other' },
  { metadata: ['relationship:../escape'] },
  { metadata: ['relationship'] },
  { 'include-dependencies': true },
  { metadata: ['relationship:Alpha', 'data-graph:Graph'], 'api-version': '65.0' },
]) {
  test(`relationship selection refuses before auth ${JSON.stringify(override)}`, async () => {
    const command = invocation({ metadata: ['relationship:Alpha'], ...override });
    command.resolveOrg = () => assert.fail('invalid scope must precede auth');
    const { result } = await run(command);
    assert.equal(result.status, 'blocked');
  });
}

for (const mode of ['read', 'output', 'overwrite']) {
  test(`relationship ${mode} failure between successes continues with truthful human labels`, async () => {
    const command = invocation({
      metadata: ['relationship:Zulu', 'relationship:Middle', 'relationship:Alpha'],
    });
    const lines = [];
    command.jsonEnabled = () => false;
    command.log = (line) => lines.push(line);
    command.acquireRelationshipXml = async (org, name) => {
      if (mode === 'read' && name === 'Middle') throw new Error('private-token');
      return '<xml/>';
    };
    command.writeRelationship = async (name) => {
      if (mode !== 'read' && name === 'Middle')
        throw new RelationshipDefinitionError(
          mode === 'overwrite' ? 'OVERWRITE_REQUIRED' : 'OUTPUT_FAILED',
        );
      return { path: `${name}.xml`, outcome: 'retrieved' };
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, mode === 'overwrite' ? 'blocked' : 'failed');
    assert.equal(exitCode, 1);
    assert.deepEqual(
      result.result.items.map((item) => item.identity.apiName),
      ['Alpha', 'Zulu'],
    );
    assert.equal(result.diagnostics.errors[0].family, 'relationship');
    assert.ok(lines.some((line) => line.startsWith('relationship:Middle:')));
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  });
}

test('auto mixed relationship and DMO selection preserves DMO route and both outputs', async () => {
  const command = invocation({
    metadata: ['relationship:Alpha', 'dmo:Sample__dlm'],
    'api-version': 'auto',
  });
  command.acquireRelationshipXml = async () => '<xml/>';
  command.writeRelationship = async () => ({ path: 'Alpha.xml', outcome: 'retrieved' });
  command.selectDependencies = async (identities, conn, selection) => {
    assert.equal(selection.soapNumeric, '65.0');
    assert.deepEqual(
      identities.map((identity) => identity.kind),
      ['dmo'],
    );
    return {
      entries: [{ document: candidate, reason: { explicit: true, chains: [] } }],
      reasons: new Map(),
    };
  };
  const { result } = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.metadata.apiVersion, 'auto');
  assert.equal(result.result.items.length, 2);
});

test('auto mixed Graph and relationship preserves Graph67 and Metadata65 routes', async () => {
  const command = invocation({
    metadata: ['relationship:Alpha', 'data-graph:Graph'],
    'api-version': 'auto',
  });
  const pins = [];
  command.resolveOrg = async () => ({
    getOrgId: () => 'synthetic-org',
    getConnection: (version) => {
      pins.push(version);
      return connection;
    },
  });
  command.acquireRelationshipXml = async () => '<xml/>';
  command.writeRelationship = async () => ({ path: 'Alpha.xml', outcome: 'retrieved' });
  command.readRawDataGraph = async () => {
    throw new Error('synthetic graph read failure');
  };
  const { result } = await run(command);
  assert.equal(result.metadata.apiVersion, 'auto');
  assert.equal(result.metadata.soapApiVersion, '67.0');
  assert.ok(pins.includes('67.0'));
  assert.equal(result.result.items[0].routes[0].apiVersion, '65.0');
});

test('writer refusal and ambiguous publication failure return nonzero without silent success', async () => {
  for (const code of ['UNSAFE_PATH', 'OVERWRITE_REQUIRED', 'OUTPUT_FAILED']) {
    const command = invocation();
    command.writeNativeDmo = async () => {
      throw new NativeDmoError(code);
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, code === 'OUTPUT_FAILED' ? 'failed' : 'blocked');
    assert.equal(result.diagnostics.errors[0].code, code);
    assert.equal(exitCode, 1);
    assert.deepEqual(result.result.items, []);
  }
});
