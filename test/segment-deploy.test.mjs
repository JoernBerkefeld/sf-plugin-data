import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, unlink, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import {
  readDeployInputs,
  verifySegmentInputDigest,
  captureDeployInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { preflightSegmentDeploy as preflightWithBinding } from '../lib/services/preflight-segment-deploy.js';
import { bindSegmentDependencies } from '../lib/services/bind-segment-dependencies.js';
import {
  apiDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
const dependencyMetadata = () => ({
  detail: {
    name: 'Person__dlm',
    id: 'target-local',
    dataSpaceName: 'default',
    category: 'PROFILE',
    isSegmentable: true,
    fields: [{ name: 'Id__c', type: 'Text', isPrimaryKey: true }],
  },
  metadata: [
    {
      fullName: 'Person__dlm',
      mktDataModelAttributes: { dataSpaceName: 'default', isSegmentable: 'true' },
      fields: [
        {
          fullName: 'Id__c',
          type: 'Text',
          mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
        },
      ],
    },
  ],
});
const bind = (value, connection, api, space) =>
  bindSegmentDependencies(value, connection, api, space, async () => dependencyMetadata());
const preflightSegmentDeploy = (value, connection, api, space, acquire) =>
  preflightWithBinding(value, connection, api, space, acquire, bind);
import Deploy from '../lib/commands/data360/deploy.js';
const sql = 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
const document = () => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: 'Description',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
    models: [{ name: 'Audience', sql }],
    dependencies: [
      { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm', fields: ['Id__c'] },
    ],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const pair = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-a2a-test-'));
  return { cwd, ...(await writeSegmentDocument(document(), cwd, false)) };
};
const connection = { getApiVersion: () => '65.0' };
const acquire = async () => ({
  candidate: document(),
  blockers: [],
  expectations: { runtime: { segmentStatus: 'ACTIVE' } },
});

test('Segment dependency and target acquisition retain private API evidence without absence proof', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
  ]);
  const failure = retainConnectDiagnostic(new Error('hidden'), evidence);
  const failedBind = (value, conn, api, space) =>
    bindSegmentDependencies(value, conn, api, space, async () => {
      throw failure;
    });
  await assert.rejects(failedBind(document(), connection, '65.0', 'default'), (error) => {
    assert.equal(error.code, 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED');
    assert.equal(getConnectDiagnostic(error), evidence);
    return true;
  });
  for (const mode of ['dependency', 'target', 'throw']) {
    const result = await preflightWithBinding(
      document(),
      connection,
      '65.0',
      'default',
      async () => {
        if (mode === 'throw') throw failure;
        return retainConnectDiagnostic({ blockers: ['SEGMENT_ACQUISITION_FAILED'] }, evidence);
      },
      mode === 'dependency' ? failedBind : bind,
    );
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.absenceProof, 'none');
    assert.equal(getConnectDiagnostic(result), evidence);
    assert.match(result.diagnostics[0].message, /INVALID_INPUT/u);
    assert.doesNotMatch(JSON.stringify(result), /hidden|"statusCode"/u);
  }
});

test('forward predicate is update with processing effects; reverse remains blocked', async () => {
  const desired = document();
  desired.spec.models[0].sql += ' AND Person__dlm.Id__c IS NOT NULL';
  const preview = await preflightSegmentDeploy(desired, connection, '65.0', 'default', acquire);
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.requiredEffects, ['processing']);
  const reverse = await preflightSegmentDeploy(
    document(),
    connection,
    '65.0',
    'default',
    async () => ({
      candidate: desired,
      blockers: [],
      expectations: { runtime: { segmentStatus: 'ACTIVE' } },
    }),
  );
  assert.equal(reverse.outcome, 'blocked-changes');
});

for (const version of ['65.0', '68.0']) {
  test(`API${version} binding uses exact target-local identity and refreshes every call`, async () => {
    const desired = document();
    const before = structuredClone(desired);
    let reads = 0;
    const acquireDependency = async (name) => {
      assert.equal(name, 'Person__dlm');
      const acquired = dependencyMetadata();
      acquired.detail.id = `target-${++reads}`;
      return acquired;
    };
    for (const id of ['target-1', 'target-2']) {
      const bindings = await bindSegmentDependencies(
        desired,
        { ...connection, getApiVersion: () => version },
        version,
        'default',
        acquireDependency,
      );
      assert.equal(bindings[0].targetId, id);
      assert.deepEqual(bindings[0].identity, desired.spec.segmentOn);
    }
    assert.deepEqual(desired, before);
  });
}
test('missing, ambiguous, incompatible and failed exact dependencies block without name fallback', async () => {
  const mutations = [
    (v) => {
      v.metadata[0].mktDataModelAttributes.dataSpaceName = 'other';
    },
    (v) => {
      v.metadata[0].mktDataModelAttributes.isSegmentable = 'false';
    },
    (v) => {
      v.detail.fields = Array.from({ length: 4097 }, () => ({ name: 'Id__c' }));
    },
    (v) => {
      v.detail.name = 'Other__dlm';
    },
    (v) => {
      delete v.detail.name;
      v.detail.label = 'Person__dlm';
    },
    (v) => {
      v.detail.isSegmentable = false;
    },
    (v) => {
      v.detail.dataSpaceName = 'other';
    },
    (v) => {
      v.detail.category = 'OTHER';
    },
    (v) => {
      v.metadata = [];
    },
    (v) => {
      v.metadata.push(structuredClone(v.metadata[0]));
    },
    (v) => {
      v.detail.fields.push(structuredClone(v.detail.fields[0]));
    },
    (v) => {
      v.metadata[0].fields = [];
    },
    (v) => {
      v.metadata[0].fields[0].mktDataModelFieldAttributes.primaryIndexOrder = '2';
    },
    (v) => {
      v.detail.fields[0].type = 'Number';
    },
  ];
  for (const mutate of mutations) {
    const acquired = dependencyMetadata();
    mutate(acquired);
    let segmentReads = 0;
    const result = await preflightWithBinding(
      document(),
      connection,
      '65.0',
      'default',
      async () => {
        segmentReads++;
        return acquire();
      },
      (value, conn, api, space) =>
        bindSegmentDependencies(value, conn, api, space, async () => acquired),
    );
    assert.equal(result.outcome, 'blocked');
    assert.equal(segmentReads, 0);
    assert.match(result.diagnostics[0].code, /^SEGMENT_DEPENDENCY/u);
  }
  await assert.rejects(
    bindSegmentDependencies(document(), connection, '65.0', 'default', async () => {
      throw new Error('private');
    }),
    { code: 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' },
  );
});
test('binding rejects unsupported SQL and API before dependency reads', async () => {
  const invalid = document();
  invalid.spec.models[0].sql = 'SELECT * FROM Person__dlm';
  for (const [value, api] of [
    [invalid, '65.0'],
    [document(), 'latest'],
  ])
    await assert.rejects(
      bindSegmentDependencies(value, connection, api, 'default', () => assert.fail('No reads')),
    );
});

test('single JSON, overlapping directories and exact selector coalesce with immutable byte digest', async () => {
  const p = await pair();
  for (const options of [
    { sourceDir: [p.path] },
    { sourceDir: [p.path] },
    { sourceDir: [path.dirname(p.path), path.dirname(p.path)] },
    { metadata: ['segment:Audience', 'segment:Audience'] },
  ]) {
    const inputs = await readDeployInputs({ cwd: p.cwd, ...options });
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].path, p.path);
    assert.equal('companionPath' in inputs[0], false);
    assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
    assert.match(inputs[0].inputDigest, /^[a-f0-9]{64}$/u);
    assert.ok(Object.isFrozen(inputs[0].document.spec.models[0]));
    await verifySegmentInputDigest(inputs[0]);
  }
});
test('stale Segment XML is ignored recursively but explicit XML is rejected without rewriting it', async () => {
  const p = await pair();
  const xmlPath = path.join(
    p.cwd,
    'force-app/main/default/marketSegmentDefinitions/Audience.marketSegmentDefinition-meta.xml',
  );
  await mkdir(path.dirname(xmlPath));
  await writeFile(xmlPath, '<stale/>');
  for (const selection of [
    { metadata: ['segment:Audience'] },
    { sourceDir: [p.path] },
    { sourceDir: [path.join(p.cwd, 'force-app/main/default')] },
  ]) {
    const inputs = await readDeployInputs({ cwd: p.cwd, ...selection });
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].path, p.path);
  }
  await assert.rejects(readDeployInputs({ cwd: p.cwd, sourceDir: [xmlPath] }), {
    code: 'UNSUPPORTED_SEGMENT_XML',
  });
  assert.equal(await readFile(xmlPath, 'utf8'), '<stale/>');
});
test('selector honors configured package directory', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-a2a-config-'));
  await writeFile(
    path.join(cwd, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'custom', default: true }] }),
  );
  const p = await writeSegmentDocument(document(), cwd, false);
  const inputs = await readDeployInputs({ cwd, metadata: ['segment:Audience'] });
  assert.equal(inputs[0].path, p.path);
});
test('missing, divergent, duplicate-key, wrong-identity and invalid UTF8 companion blocks complete selection', async () => {
  for (const variant of ['missing', 'unknown', 'duplicate', 'identity', 'utf8']) {
    const p = await pair();
    switch (variant) {
      case 'missing': {
        await unlink(p.path);
        break;
      }
      case 'unknown': {
        await writeFile(
          p.path,
          JSON.stringify({ ...document(), spec: { ...document().spec, unknownField: true } }),
        );
        break;
      }
      case 'duplicate': {
        await writeFile(
          p.path,
          JSON.stringify(document()).replace(
            '"schemaVersion":1',
            '"schemaVersion":1,"schemaVersion":1',
          ),
        );
        break;
      }
      case 'identity': {
        await writeFile(
          p.path,
          JSON.stringify({ ...document(), identity: { dataSpace: 'default', apiName: 'Other' } }),
        );
        break;
      }
      default: {
        await writeFile(p.path, Buffer.from([0xff]));
      }
    }
    await assert.rejects(readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] }));
  }
});
test('modified XML or companion invalidates captured digest even when semantics remain equal', async () => {
  for (const member of ['path']) {
    const p = await pair();
    const [input] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    await writeFile(p[member], (await readFile(p[member], 'utf8')) + '\n');
    await assert.rejects(verifySegmentInputDigest(input), { code: 'UNSAFE_SOURCE' });
  }
});
test('linked and hardlinked companions are refused without following or changing them', async () => {
  for (const mode of ['junction', 'hardlink']) {
    const p = await pair();
    const outside = await pair();
    if (mode === 'junction') {
      const linked = path.join(p.cwd, 'linked');
      await symlink(outside.cwd, linked, process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(
        readDeployInputs({
          cwd: p.cwd,
          sourceDir: [path.join(linked, path.relative(outside.cwd, outside.path))],
        }),
      );
    } else {
      await unlink(p.path);
      await link(outside.path, p.path);
      await assert.rejects(readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] }));
    }
  }
});
test('preview compares exact admitted semantics, reports processing for label/description updates only', async () => {
  for (const change of ['none', 'label', 'description', 'sql']) {
    const desired = document();
    if (change === 'label') desired.spec.displayName = 'Changed';
    if (change === 'description') desired.spec.description = 'Changed';
    if (change === 'sql') desired.spec.models[0].sql += ' ';
    const result = await preflightSegmentDeploy(desired, connection, '65.0', 'default', acquire);
    assert.equal(
      result.outcome,
      change === 'none' ? 'unchanged' : change === 'sql' ? 'blocked-changes' : 'update',
    );
    assert.deepEqual(
      result.requiredEffects,
      ['label', 'description'].includes(change) ? ['processing'] : [],
    );
    assert.equal(result.absenceProof, 'none');
  }
});
test('API68 preview admits exact native404 only, with processing effects and no Metadata absence claim', async () => {
  for (const version of ['65.0', '68.0']) {
    for (const status of [404, 401, 403, 503]) {
      const result = await preflightSegmentDeploy(
        document(),
        { getApiVersion: () => version },
        version,
        'default',
        async () =>
          retainConnectDiagnostic(
            { blockers: ['SEGMENT_ACQUISITION_FAILED'] },
            apiDiagnostic(status, [
              { errorCode: status === 404 ? 'ITEM_NOT_FOUND' : 'SERVER_ERROR' },
            ]),
          ),
      );
      assert.equal(result.outcome, version === '68.0' && status === 404 ? 'create' : 'blocked');
      assert.equal(result.absenceProof, 'none');
      assert.deepEqual(result.requiredEffects, result.outcome === 'create' ? ['processing'] : []);
    }
  }
});

test('unproven404, permission failure and malformed target never admit create', async () => {
  for (const acquisition of [
    async () => {
      throw { statusCode: 404 };
    },
    async () => {
      throw { statusCode: 403 };
    },
    async () => ({ blockers: ['SEGMENT_ACQUISITION_FAILED'] }),
    async () => ({
      ...(await acquire()),
      expectations: { runtime: { segmentStatus: 'PROCESSING' } },
    }),
    async () => ({
      ...(await acquire()),
      candidate: { ...document(), identity: { dataSpace: 'default', apiName: 'Other' } },
    }),
  ]) {
    const result = await preflightSegmentDeploy(
      document(),
      connection,
      '65.0',
      'default',
      acquisition,
    );
    assert.equal(result.outcome, 'blocked');
    assert.notEqual(result.target, 'absent');
    assert.equal(result.absenceProof, 'none');
  }
});
test('unsupported API/latest/space/input fail before any target read', async () => {
  for (const [value, version, space] of [
    [document(), 'latest', 'default'],
    [document(), '66.0', 'default'],
    [document(), '65.0', 'other'],
    [{}, '65.0', 'default'],
  ]) {
    const result = await preflightSegmentDeploy(value, connection, version, space, () =>
      assert.fail('No read'),
    );
    assert.equal(result.outcome, 'blocked');
  }
});
const commandSetup = (inputs, preview, version = '65.0') => {
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview,
      'source-dir': ['synthetic'],
      'api-version': version,
      'data-space': 'default',
      'target-org': { getOrgId: () => 'synthetic', getConnection: () => connection },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  command.verifySegmentInput = verifySegmentInputDigest;
  command.preflight = async () => ({
    outcome: 'create',
    target: 'absent',
    absenceProof: 'complete-inventory',
    diagnostics: [],
  });
  command.preflightSegment = (value, conn, api, space) =>
    preflightSegmentDeploy(value, conn, api, space, acquire);
  command.execute = () => assert.fail('Entire selection must block before any DMO writes');
  return command;
};
const run = async (command) => {
  const previous = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = previous;
  }
};
test('public API68 CREATE preview is read-only and execution requires processing acknowledgement', async () => {
  const p = await pair();
  const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
  for (const [preview, acknowledge] of [
    [true, false],
    [false, false],
    [false, true],
  ]) {
    const command = commandSetup(inputs, preview, '68.0');
    const parse = command.parse;
    command.parse = async () => {
      const parsed = await parse();
      parsed.flags['allow-processing'] = acknowledge;
      return parsed;
    };
    command.preflightSegment = async () => ({
      family: 'segment',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'none',
      requiredEffects: ['processing'],
      diagnostics: [],
    });
    let writes = 0;
    command.executeSegment = async (value, conn, api, space, options) => {
      assert.equal(options.allowProcessing, true);
      await options.verifyInput();
      writes++;
      return {
        family: 'segment',
        route: { apiVersion: '68.0', method: 'POST', resource: 'segments' },
        outcome: 'created',
        mutation: 'confirmed-created',
        serverProcessing: true,
        diagnostics: [],
      };
    };
    const result = await run(command);
    assert.equal(writes, !preview && acknowledge ? 1 : 0);
    assert.equal(result.status, !preview && !acknowledge ? 'blocked' : 'success');
    if (writes) {
      assert.equal(result.result.items[0].outcome, 'created');
      assert.equal(result.result.items[0].route.method, 'POST');
    }
  }
});

test('queued Segment uses concise processing suffix and existing machine success semantics', async () => {
  const p = await pair();
  const [segment] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
  for (const json of [false, true]) {
    const command = commandSetup([segment], false, '68.0');
    const parse = command.parse;
    command.parse = async () => {
      const parsed = await parse();
      parsed.flags['allow-processing'] = true;
      return parsed;
    };
    command.preflightSegment = async () => ({
      family: 'segment',
      outcome: 'update',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: ['processing'],
    });
    command.executeSegment = async () => ({
      family: 'segment',
      route: { apiVersion: '68.0', method: 'PATCH', resource: 'segments' },
      outcome: 'updated',
      mutation: 'confirmed-updated',
      diagnostics: [],
      serverProcessing: true,
    });
    const lines = [];
    command.jsonEnabled = () => json;
    command.log = (line) => lines.push(line);
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.result.items[0].mutation, 'confirmed-updated');
    assert.ok(!JSON.stringify(result).includes('serverProcessing'));
    assert.deepEqual(
      lines,
      json
        ? []
        : [
            'Deploy execution: success. No automatic retry or rollback performed.',
            `updated segment ${segment.document.identity.apiName} (server is still processing)`,
            'Deployed: 1 (0 created / 1 updated / 0 failed)',
          ],
    );
  }
});

test('mixed DMO plus Segment update without acknowledgement blocks whole selection', async () => {
  const p = await pair();
  const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
  const command = commandSetup(
    [
      {
        path: 'dmo.json',
        document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'First__dlm' } },
      },
      ...inputs,
    ],
    false,
  );
  command.captureInput = async () => 'synthetic-dmo-digest';
  command.preflightSegment = async () => ({
    family: 'segment',
    outcome: 'update',
    target: 'present',
    absenceProof: 'none',
    diagnostics: [],
    requiredEffects: ['processing'],
  });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  assert.equal(
    result.result.items[1].preflight.diagnostics[0].code,
    'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
  );
});
for (const version of ['65.0', '68.0', 'auto']) {
  test(`Segment ${version} no-op dispatches real executor without ack or mutations`, async () => {
    const { executeSegmentDeploy } = await import('../lib/services/execute-segment-deploy.js');
    const p = await pair();
    const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const command = commandSetup(inputs, false, version);
    let dispatched = 0;
    command.executeSegment = async (value, conn, api, space, options) => {
      dispatched++;
      assert.equal(options.allowProcessing, false);
      return executeSegmentDeploy(value, conn, api, space, {
        ...options,
        acquire: async () => ({
          candidate: value,
          blockers: [],
          expectations: {
            runtime: {
              apiName: value.identity.apiName,
              dataSpace: 'default',
              displayName: value.spec.displayName,
              description: value.spec.description,
              segmentType: 'DBT',
              segmentOnApiName: value.spec.segmentOn.apiName,
              includeDbt: { models: value.spec.models },
              publishInterval: 'NO_REFRESH',
              lookbackPeriod: 'P90D',
              marketSegmentId: 'synthetic-runtime',
              marketSegmentDefinitionId: 'synthetic-definition',
              segmentStatus: 'ACTIVE',
            },
          },
        }),
        bind: async () => [],
        patch: () => assert.fail('No-op must not mutate'),
        read: () => assert.fail('No-op must not poll'),
      });
    };
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(dispatched, 1);
    assert.equal(result.result.items[0].outcome, 'unchanged');
    assert.equal(result.result.items[0].mutation, 'not-attempted');
    assert.deepEqual(result.result.items[0].route, {
      apiVersion: version === 'auto' ? '68.0' : version,
      method: 'PATCH',
      resource: 'segments',
    });
  });
}
test('reverse mixed selection orders prerequisites first and retains partial/unknown/unattempted outcomes', async () => {
  for (const stop of ['success', 'blocked', 'failed', 'unknown', 'throw']) {
    const p = await pair();
    const [segment] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const dmo = {
      path: 'synthetic-dmo',
      document: { kind: 'dmo', identity: { ...segment.document.spec.segmentOn } },
    };
    const later = {
      ...segment,
      document: { ...segment.document, identity: { dataSpace: 'default', apiName: 'ZZTail' } },
    };
    const command = commandSetup([later, segment, dmo], false);
    const parse = command.parse;
    command.parse = async () => {
      const parsed = await parse();
      parsed.flags['allow-processing'] = true;
      return parsed;
    };
    command.captureInput = async () => 'same';
    command.verifySegmentInput = async () => {};
    command.preflightSegment = async () => ({
      family: 'segment',
      outcome: 'update',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: ['processing'],
    });
    const calls = [];
    command.execute = async () => {
      calls.push('dmo');
      return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
    };
    command.executeSegment = async (value, conn, api, space, options) => {
      calls.push(value.identity.apiName);
      assert.equal(options.allowProcessing, true);
      await options.verifyInput();
      if (stop === 'throw') throw new Error('private');
      return {
        family: 'segment',
        route: { apiVersion: '65.0', method: 'PATCH', resource: 'segments' },
        outcome: stop === 'success' ? 'updated' : stop === 'blocked' ? 'blocked' : 'failed',
        mutation:
          stop === 'success'
            ? 'confirmed-updated'
            : stop === 'unknown'
              ? 'unknown'
              : 'not-attempted',
        diagnostics: [],
      };
    };
    const result = await run(command);
    assert.equal(
      result.status,
      stop === 'success' ? 'success' : stop === 'blocked' ? 'blocked' : 'failed',
    );
    assert.deepEqual(calls, [
      'dmo',
      segment.document.identity.apiName,
      ...(stop === 'success' ? ['ZZTail'] : []),
    ]);
    assert.equal(result.result.items[0].mutation, 'confirmed-updated');
    assert.equal(result.result.items[2].outcome, stop === 'success' ? 'updated' : 'not-attempted');
    assert.equal(
      result.result.items[1].mutation,
      ['throw', 'unknown'].includes(stop)
        ? 'unknown'
        : stop === 'success'
          ? 'confirmed-updated'
          : 'not-attempted',
    );
  }
});
test('fresh dependency or late pair admission blocks before DMO dispatch and retains unattempted tail', async () => {
  for (const drift of ['prerequisite', 'pair', 'git', 'expanded']) {
    const p = await pair();
    const [segment] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const dmo = {
      path: 'synthetic-dmo',
      document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'First__dlm' } },
    };
    const command = commandSetup([dmo, segment], false);
    command.captureInput = async () => 'same';
    command.executeSegment = () => assert.fail('No dependent dispatch');
    let admissions = 0;
    command.preflightSegment = async () => {
      const fresh = ++admissions > 1;
      if (drift !== 'prerequisite' && !fresh)
        await writeFile(p.path, `${await readFile(p.path, 'utf8')}\n`);
      return {
        family: 'segment',
        outcome: drift === 'prerequisite' && fresh ? 'blocked' : 'unchanged',
        target: 'present',
        absenceProof: 'none',
        diagnostics: [],
        requiredEffects: [],
      };
    };
    if (drift === 'git') {
      const parse = command.parse;
      command.parse = async () => {
        const parsed = await parse();
        delete parsed.flags['source-dir'];
        parsed.flags['changed-since'] = 'main';
        return parsed;
      };
      command.selectGitInputs = async () => ({
        paths: [segment.path],
        segments: [segment],
        provenance: { requestedRef: 'main' },
      });
    }
    if (drift === 'expanded') {
      command.resolveInputs = async () => [segment];
      const parse = command.parse;
      command.parse = async () => {
        const parsed = await parse();
        parsed.flags['include-dependencies'] = true;
        return parsed;
      };
    }
    const result = await run(command);
    assert.notEqual(result.status, 'success');
    assert.ok(result.result.items.every((item) => item.mutation === 'not-attempted'));
  }
});
test('late pair or prerequisite drift preserves earlier completed DMO and unattempted tail', async () => {
  for (const drift of ['pair', 'prerequisite']) {
    const p = await pair();
    const [segment] = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const dmo = {
      path: 'synthetic-dmo',
      document: { kind: 'dmo', identity: { dataSpace: 'default', apiName: 'First__dlm' } },
    };
    const tail = {
      ...segment,
      document: { ...segment.document, identity: { dataSpace: 'default', apiName: 'ZZTail' } },
    };
    const command = commandSetup([tail, segment, dmo], false);
    command.captureInput = async () => 'same';
    let completed = false;
    command.preflightSegment = async () => ({
      family: 'segment',
      outcome: completed && drift === 'prerequisite' ? 'blocked' : 'unchanged',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: [],
    });
    command.execute = async () => {
      completed = true;
      if (drift === 'pair') await writeFile(p.path, `${await readFile(p.path, 'utf8')}\n`);
      return { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] };
    };
    command.executeSegment = () => assert.fail('Late drift forbids dependent dispatch');
    // Tail uses a synthetic logical identity, but the pair verifier must retain its captured bytes.
    const verify = command.verifySegmentInput;
    command.verifySegmentInput = (input) => verify(input === tail ? segment : input);
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(result.result.items[0].mutation, 'confirmed-updated');
    assert.equal(result.result.items[1].outcome, 'blocked');
    assert.equal(result.result.items[1].mutation, 'not-attempted');
    assert.equal(result.result.items[2].outcome, 'not-attempted');
  }
});
test('public Segment preview is read-only; drift during target acquisition prevents success', async () => {
  for (const drift of [false, true]) {
    const p = await pair();
    const inputs = await readDeployInputs({ cwd: p.cwd, sourceDir: [p.path] });
    const command = commandSetup(inputs, true);
    if (drift)
      command.preflightSegment = async () => {
        await writeFile(p.path, (await readFile(p.path, 'utf8')) + '\n');
        return preflightSegmentDeploy(document(), connection, '65.0', 'default', acquire);
      };
    const result = await run(command);
    assert.equal(result.status, drift ? 'failed' : 'success');
    if (!drift) {
      assert.equal(result.result.items[0].family, 'segment');
      assert.equal(result.result.items[0].outcome, 'unchanged');
    }
  }
});
