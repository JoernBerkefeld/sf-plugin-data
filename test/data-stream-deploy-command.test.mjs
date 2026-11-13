import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Config } from '@oclif/core';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  readDeployInputs,
  verifyDataStreamInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import {
  executeDataStream,
  preflightDataStream,
} from '../lib/services/command-native-data-stream.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { DataStreamHttpError } from '../lib/transport/data-stream-rest.js';

const authored = {
  schemaVersion: 1,
  kind: 'data-stream',
  identity: { apiName: 'Proposed', dataSpace: 'default' },
  spec: {
    connectorType: 'IngestApi',
    connectionName: 'SyntheticConnection',
    event: 'ProbeEvent',
    datastreamType: 'INGEST_API',
    refreshMode: 'UPSERT',
    label: 'Proposed',
    newDlo: {
      name: 'Proposed__dll',
      label: 'Proposed',
      category: 'Other',
      primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
    },
    additiveFieldMappings: [],
  },
};

/**
 * Capture offline command output, auth and whole-selection guard calls.
 * @param {object} flags Flag overrides.
 * @returns {object} Instrumented command.
 */
function invocation(flags = {}) {
  const command = Object.create(Deploy.prototype);
  const calls = [];
  const lines = [];
  command.parse = async () => ({
    flags: {
      metadata: ['data-stream:Proposed'],
      'api-version': 'auto',
      'target-org': 'synthetic',
      preview: false,
      'allow-processing': true,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  command.log = (line) => lines.push(line);
  const input = {
    path: 'Proposed.data-stream-meta.json',
    document: structuredClone(authored),
    inputDigest: 'captured',
  };
  command.resolveInputs = async () => [input];
  command.verifyDataStreamInput = async (selected) => {
    assert.equal(selected, input);
    calls.push('verify');
  };
  command.resolveTargetOrg = async () => {
    calls.push('auth');
    return {
      getUsername: () => 'synthetic',
      getOrgId: () => 'synthetic-org',
      getConnection: (version) => {
        assert.equal(version, '68.0');
        return {};
      },
    };
  };
  command.createDataStreamClients = (_connection, target, version) => {
    assert.equal(target, 'synthetic');
    assert.equal(version, '68.0');
    return {};
  };
  command.preflightDataStream = async () => {
    calls.push('preview');
    return {
      family: 'data-stream',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'independent',
      requiredEffects: ['processing'],
      diagnostics: [],
    };
  };
  command.executeDataStream = async (_document, _clients, options) => {
    calls.push('execute');
    assert.equal(options.allowProcessing, true);
    await options.verifyInput();
    return {
      family: 'data-stream',
      outcome: 'created',
      mutation: 'confirmed-created',
      targetApiName: 'GeneratedStream',
      targetDloName: 'ActualDlo__dll',
      diagnostics: [],
    };
  };
  command.createDloClient =
    command.createDmoClient =
    command.createMappingClient =
      () => assert.fail('no other-family fallback');
  return { command, calls, lines, input };
}

/**
 * Preserve test process exit status while observing command failures.
 * @param {object} command Command instance.
 * @returns {Promise<object>} Envelope and exit status.
 */
async function run(command) {
  const prior = process.exitCode;
  process.exitCode = 0;
  try {
    const result = await command.run();
    return { result, code: process.exitCode };
  } finally {
    process.exitCode = prior;
  }
}

for (const preview of [true, false])
  for (const json of [true, false])
    test(`stream public routing and human/json counts ${preview}/${json}`, async () => {
      const { command, calls, lines } = invocation({ preview });
      command.jsonEnabled = () => json;
      const { result, code } = await run(command);
      assert.equal(code, 0);
      assert.equal(result.status, 'success');
      assert.equal(result.metadata.soapApiVersion, '68.0');
      assert.deepEqual(
        result.result.items[0].routes.map((route) => route.apiVersion),
        ['68.0', '68.0', '68.0'],
      );
      assert.ok(result.result.items[0].routes.every(({ transport }) => transport === 'native'));
      assert.ok(calls.includes(preview ? 'preview' : 'execute'));
      assert.ok(!calls.includes(preview ? 'execute' : 'preview'));
      if (json) assert.deepEqual(lines, []);
      else if (!preview) {
        assert.ok(lines.includes('created data-stream GeneratedStream'));
        assert.equal(lines.at(-1), 'Deployed: 1 (1 created / 0 updated / 0 failed)');
      }
    });

for (const flags of [
  { dataspace: 'other' },
  ...['latest', '61.0', '67.0', '69.0'].map((version) => ({ 'api-version': version })),
])
  test(`stream unsupported options block before auth ${JSON.stringify(flags)}`, async () => {
    const { command, calls } = invocation(flags);
    const { result, code } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(code, 1);
    assert.deepEqual(calls, []);
  });

test('new-stream landing-DLO collision, Git, nondefault document and digest drift stop before writes', async () => {
  for (const mode of ['mixed', 'git', 'space', 'digest']) {
    const { command, calls, input } = invocation(
      mode === 'git' ? { metadata: undefined, 'changed-since': 'HEAD' } : {},
    );
    // A DLO file naming a new stream's landing DLO is refused before any write (M2 collision).
    if (mode === 'mixed')
      command.resolveInputs = async () => [
        input,
        { path: 'other', document: { kind: 'dlo', identity: { apiName: 'proposed__dll' } } },
      ];
    if (mode === 'git')
      command.selectGitInputs = async () => ({ paths: ['stream'], provenance: {} });
    if (mode === 'space') input.document.identity.dataSpace = 'other';
    if (mode === 'digest')
      command.verifyDataStreamInput = async () => {
        throw new Error('private-token');
      };
    const { result, code } = await run(command);
    assert.equal(code, 1);
    assert.notEqual(result.status, 'success');
    assert.ok(!calls.includes('execute'));
    if (mode === 'mixed') {
      // The check follows the stream's read-only preflight (create), before any write.
      assert.equal(result.diagnostics.errors[0].code, 'DATA_STREAM_DLO_COLLISION');
      assert.deepEqual(calls, ['verify', 'auth', 'verify', 'preview']);
    } else assert.ok(!calls.includes('auth'));
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  }
});

test('post-preview input drift blocks; unknown write stops next item and preserves named success counts', async () => {
  const preview = invocation({ preview: true });
  preview.command.preflightDataStream = async () => {
    preview.command.verifyDataStreamInput = async () => {
      throw new Error('changed');
    };
    return { outcome: 'create' };
  };
  const previewRun = await run(preview.command);
  assert.notEqual(previewRun.result.status, 'success');
  const execution = invocation();
  execution.command.resolveInputs = async () => [
    execution.input,
    {
      ...execution.input,
      path: 'next',
      document: { ...authored, identity: { apiName: 'Zulu', dataSpace: 'default' } },
    },
  ];
  execution.command.verifyDataStreamInput = async () => {};
  let writes = 0;
  execution.command.executeDataStream = async () => {
    writes++;
    return { family: 'data-stream', outcome: 'failed', mutation: 'unknown', diagnostics: [] };
  };
  const { result } = await run(execution.command);
  assert.equal(writes, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items.length, 1);
});

test('updated/unchanged use existing conventions and do not count noop as deployed', async () => {
  for (const outcome of ['updated', 'unchanged']) {
    const { command, lines } = invocation({ 'allow-processing': false });
    command.jsonEnabled = () => false;
    command.executeDataStream = async () => ({
      family: 'data-stream',
      outcome,
      mutation: outcome === 'updated' ? 'confirmed-updated' : 'not-attempted',
      targetApiName: 'GeneratedStream',
      diagnostics: [],
    });
    const { result } = await run(command);
    assert.equal(result.status, 'success');
    assert.ok(
      lines.some((line) =>
        line.startsWith(
          outcome === 'updated'
            ? 'updated data-stream GeneratedStream'
            : 'Unchanged: data-stream:GeneratedStream',
        ),
      ),
    );
    assert.equal(
      lines.at(-1),
      outcome === 'updated'
        ? 'Deployed: 1 (0 created / 1 updated / 0 failed)'
        : 'Deployed: 0 (0 created / 0 updated / 0 failed)',
    );
  }
});

test('all aliases parse stream deploy selection; production factory pins native68', async () => {
  const config = await Config.load({ root: process.cwd() });
  for (const topic of ['data360', 'datacloud', 'd360', 'dc']) {
    const Command = await config.findCommand(`${topic}:deploy`, { must: true }).load();
    assert.equal(Command, Deploy);
    const command = new Command(
      ['-m', 'data-stream:Proposed', '--data-space', 'default', '--preview', '--json'],
      config,
    );
    const { flags } = await command.parse(Command);
    assert.deepEqual(flags.metadata, ['data-stream:Proposed']);
    assert.equal(flags.dataspace, 'default');
    assert.equal(flags.preview, true);
  }
  const command = new Deploy([], config);
  const clients = command.createDataStreamClients(
    {
      instanceUrl: 'https://synthetic.example',
      request: () => assert.fail('factory never requests'),
    },
    'synthetic',
    '68.0',
  );
  assert.equal(typeof clients.streams.update, 'function');
  assert.equal(typeof clients.connections.schema, 'function');
  assert.equal(typeof clients.dependencies.stream, 'function');
  assert.equal(clients.facade, undefined);
  assert.equal(typeof clients.dlo.get, 'function');
});

/**
 * Create only retained OS-temp synthetic source fixtures, without recursive cleanup.
 * @param {object} document Portable intent.
 * @returns {Promise<object>} Exact file and newly created root.
 */
async function source(document = authored) {
  const root = await mkdtemp(path.join(tmpdir(), 'stream-deploy-'));
  const directory = path.join(root, 'data360', 'data-stream');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${document.identity.apiName}.data-stream-meta.json`);
  await writeFile(file, JSON.stringify(document), 'utf8');
  return { root, file };
}

test('strict stream input selectors/directories coalesce freeze and bind exact bytes', async () => {
  const { root, file } = await source();
  const selected = await readDeployInputs({
    cwd: root,
    metadata: ['data-stream:Proposed', 'data-stream:Proposed'],
  });
  assert.equal(selected.length, 1);
  assert.ok(Object.isFrozen(selected[0].document.spec.newDlo.primaryKey));
  assert.equal(selected[0].inputDigest.length, 64);
  await verifyDataStreamInputDigest(selected[0]);
  const directory = await readDeployInputs({ cwd: root, sourceDir: [path.dirname(file), file] });
  assert.equal(directory.length, 1);
  await writeFile(file, `${JSON.stringify(authored)}\n`, 'utf8');
  await assert.rejects(verifyDataStreamInputDigest(selected[0]));
});

test('strict stream inputs reject duplicate keys identities malformed selectors and filename mismatch', async () => {
  const { root, file } = await source();
  for (const selector of [
    'data-stream',
    'data-stream:*',
    'data-stream:../Proposed',
    'data-stream:Proposed:Other',
  ])
    await assert.rejects(readDeployInputs({ cwd: root, metadata: [selector] }));
  for (const text of [
    JSON.stringify(authored).replace(
      '"kind":"data-stream"',
      '"kind":"data-stream","kind":"data-stream"',
    ),
    JSON.stringify({ ...authored, identity: { apiName: 'Different', dataSpace: 'default' } }),
    '{bad',
  ]) {
    await writeFile(file, text, 'utf8');
    await assert.rejects(readDeployInputs({ cwd: root, sourceDir: [file] }));
  }
  await writeFile(file, JSON.stringify(authored), 'utf8');
  const second = await source();
  await assert.rejects(readDeployInputs({ cwd: root, sourceDir: [file, second.file] }), {
    code: 'DUPLICATE_IDENTITY',
  });
});

/**
 * Independent native lifecycle fixture for public adapter (no command service stub).
 * @param {object} controls Mutation failure controls.
 * @returns {object} Native clients and read state.
 */
function lifecycle(controls = {}) {
  let exists = false;
  let writes = 0;
  const fields = ['ProbeId', 'ProbeValue'].map((name) => ({ name, label: name, dataType: 'Text' }));
  const target = {
    name: 'GeneratedStream',
    recordId: '1ds000000000001AAA',
    label: 'Proposed',
    dataSource: 'SyntheticConnection',
    dataStreamType: 'INGESTAPI',
    connectorInfo: { connectorType: 'IngestApi' },
    status: 'ACTIVE',
    refreshConfig: { refreshMode: 'UPSERT' },
    sourceFields: fields.map(({ name }) => ({ name, datatype: 'Text' })),
    mappings: fields.map(({ name }) => ({ sourceFieldName: name, targetFieldName: name })),
    dataLakeObjectInfo: {
      name: 'ActualDlo__dll',
      label: 'Proposed',
      category: 'Other',
      dataSpaceInfo: [{ name: 'default' }],
      fields: fields.map((field) => ({ ...field, isPrimaryKey: field.name === 'ProbeId' })),
    },
  };
  const connection = {
    id: '1WM000000000001AAA',
    name: 'SyntheticConnection',
    connectorType: 'IngestApi',
    status: 'CONNECTED',
  };
  const clients = {
    streams: {
      get: async (name) => {
        if (controls.readError && exists) throw new Error('private-token');
        if (exists && [target.name, target.recordId].includes(name)) return structuredClone(target);
        throw new DataStreamHttpError('STREAM_HTTP_ERROR', 404);
      },
      list: async () => (exists ? [structuredClone(target)] : []),
      create: async () => {
        writes++;
        exists = true;
        if (controls.throwWrite) throw new Error('private-token');
        return { name: target.name, recordId: target.recordId };
      },
      update: async (_id, document) => {
        writes++;
        for (const entry of document.spec.additiveFieldMappings) {
          target.mappings.push({
            formula: entry.sourceFieldLabel,
            targetFieldName: entry.targetFieldName,
          });
          target.dataLakeObjectInfo.fields.push({
            name: entry.targetFieldName,
            label: entry.targetFieldName,
            dataType: 'Text',
            isPrimaryKey: false,
          });
        }
        return { name: target.name, recordId: target.recordId };
      },
    },
    connections: {
      list: async () => ({ connections: [structuredClone(connection)] }),
      get: async () => structuredClone(connection),
      schema: async () => ({
        schemas: [
          {
            name: 'ProbeEvent',
            schemaType: 'IngestApi',
            availabilityStatus: exists ? 'In Use' : 'Available',
            fields: structuredClone(fields),
          },
        ],
      }),
    },
    dependencies: {
      stream: async () => assert.fail('No dependency read during deploy'),
      dlo: async () => assert.fail('No dependency read during deploy'),
    },
    dlo: {
      get: async () => {
        if (!exists) throw new ConnectError('REQUEST_FAILED', 404);
        return {
          dataLakeObjects: [
            {
              ...structuredClone(target.dataLakeObjectInfo),
              id: '1dl000000000001AAA',
              status: 'ACTIVE',
              fields: target.dataLakeObjectInfo.fields.map((field) => ({
                ...field,
                name: `${field.name}__c`,
              })),
            },
          ],
        };
      },
    },
  };
  return { clients, counts: () => writes };
}

test('real adapter create/update/noop independently confirms and classifies unknown only after dispatch', async () => {
  const fixture = lifecycle();
  const options = { allowProcessing: true, verifyInput: async () => {}, wait: async () => {} };
  const preview = await preflightDataStream(authored, fixture.clients);
  assert.equal(preview.outcome, 'create');
  assert.equal(fixture.counts(), 0);
  const created = await executeDataStream(authored, fixture.clients, options);
  assert.equal(created.outcome, 'created');
  assert.equal(created.targetApiName, 'GeneratedStream');
  const updatedIntent = structuredClone(authored);
  updatedIntent.spec.additiveFieldMappings = [
    {
      sourceFieldLabel: 'ProbeValue',
      targetFieldName: 'ExtraValue',
      targetFieldReturntype: 'Text',
    },
  ];
  const updatePreview = await preflightDataStream(updatedIntent, fixture.clients);
  assert.equal(updatePreview.outcome, 'update');
  const updated = await executeDataStream(updatedIntent, fixture.clients, options);
  assert.equal(updated.outcome, 'updated');
  const noop = await executeDataStream(updatedIntent, fixture.clients, {
    ...options,
    allowProcessing: false,
  });
  assert.equal(noop.outcome, 'unchanged');
  assert.equal(noop.mutation, 'not-attempted');
  assert.equal(fixture.counts(), 2);
  const missingAck = lifecycle();
  const blocked = await executeDataStream(authored, missingAck.clients, {
    ...options,
    allowProcessing: false,
  });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(missingAck.counts(), 0);
  for (const controls of [{ throwWrite: true }, { readError: true }]) {
    const failed = lifecycle(controls);
    const result = await executeDataStream(authored, failed.clients, options);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.mutation, 'unknown');
    assert.equal(failed.counts(), 1);
    assert.doesNotMatch(JSON.stringify(result), /private-token/u);
  }
});

test('real byte drift immediately before dispatch blocks the public adapter with zero writes', async () => {
  const local = await source();
  const [input] = await readDeployInputs({ cwd: local.root, metadata: ['data-stream:Proposed'] });
  const fixture = lifecycle();
  let checks = 0;
  const result = await executeDataStream(input.document, fixture.clients, {
    allowProcessing: true,
    verifyInput: async () => {
      if (++checks === 4) await writeFile(local.file, `${JSON.stringify(authored)}\n`, 'utf8');
      await verifyDataStreamInputDigest(input);
    },
  });
  assert.equal(checks, 4);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(fixture.counts(), 0);
});

test('public command plus real strict inputs and lifecycle verifies repeat without auth/network shortcuts', async () => {
  const local = await source();
  const fixture = lifecycle();
  const { command } = invocation();
  command.resolveInputs = () =>
    readDeployInputs({ cwd: local.root, metadata: ['data-stream:Proposed'] });
  command.verifyDataStreamInput = verifyDataStreamInputDigest;
  command.createDataStreamClients = () => fixture.clients;
  command.executeDataStream = executeDataStream;
  command.preflightDataStream = preflightDataStream;
  const created = await run(command);
  assert.equal(created.result.result.items[0].outcome, 'created');
  assert.equal(created.code, 0);
  const repeated = await run(command);
  assert.equal(repeated.result.result.items[0].outcome, 'unchanged');
  assert.equal(fixture.counts(), 1);
  const addition = structuredClone(authored);
  addition.spec.additiveFieldMappings = [
    {
      sourceFieldLabel: 'ProbeValue',
      targetFieldName: 'ExtraValue',
      targetFieldReturntype: 'Text',
    },
  ];
  await writeFile(local.file, JSON.stringify(addition), 'utf8');
  const updated = await run(command);
  assert.equal(updated.result.result.items[0].outcome, 'updated');
  assert.equal(updated.result.result.items[0].mutation, 'confirmed-updated');
  assert.equal(fixture.counts(), 2);
});

test('a Git selection holding only a stream reaches the stream route with its captured bytes', async () => {
  const { command, calls, input } = invocation({
    metadata: undefined,
    'changed-since': 'HEAD',
    preview: true,
  });
  command.selectGitInputs = async () => ({
    paths: [input.path],
    provenance: {},
    capturedInputs: [structuredClone(input)],
  });
  const { result, code } = await run(command);
  assert.equal(code, 0);
  assert.equal(result.status, 'success');
  assert.ok(calls.includes('auth'));
  assert.ok(calls.includes('preview'));
  assert.equal(result.result.items[0].identity.apiName, 'Proposed');
});
