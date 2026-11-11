import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { retrieveNativeDlo, deleteNativeDlo } from '../lib/services/native-dlo.js';
import { preflightDloDeploy, executeDloDeploy } from '../lib/services/command-dlo.js';
import { captureDeployInputDigest } from '../lib/artifacts/read-deploy-input.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { readDeployInputs, verifyDloInputDigest } from '../lib/artifacts/read-deploy-input.js';
import { selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';
const name = 'Example__dll';
const id = '0a0000000000000AAA';
const wire = {
  id,
  name,
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
};
const document = {
  schemaVersion: 1,
  kind: 'dlo',
  identity: { dataSpace: 'default', apiName: name },
  spec: { label: 'Example', category: 'Other', fields: wire.fields },
};
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'data360-native-command-'));
// Like Salesforce, a DLO reads as HTTP 404 once its DELETE has been acknowledged.
const client = (changes = {}) => {
  const base = {
    get: async () => structuredClone(wire),
    create: async () => structuredClone(wire),
    update: async () => structuredClone(wire),
    delete: async () => {},
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
    ...changes,
  };
  let deleted = false;
  return {
    ...base,
    get: async (...arguments_) => {
      if (deleted) throw new DloError('DLO_HTTP_ERROR', 404);
      return base.get(...arguments_);
    },
    delete: async (...arguments_) => {
      await base.delete(...arguments_);
      deleted = true;
    },
  };
};
const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};
const invocation = (Type, flags) => {
  const command = Object.create(Type.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '68.0',
      'data-space': 'default',
      metadata: [`dlo:${name}`],
      preview: false,
      ...flags,
    },
  });
  command.jsonEnabled = () => true;
  if (Type === Retrieve) {
    command.acquireDlo = retrieveNativeDlo;
    command.writeDlo = writeDloDocument;
  }
  if (Type === Delete) {
    command.retrieveDlo = retrieveNativeDlo;
    command.deleteDlo = deleteNativeDlo;
    // DLO delete uses its own bound-connection seam; tests keep overriding createDloClient.
    command.createDloNativeDeleteClient = (...arguments_) => command.createDloClient(...arguments_);
  }
  if (Type === Deploy) {
    command.preflightDlo = preflightDloDeploy;
    command.executeDlo = executeDloDeploy;
    command.verifyDloInput = verifyDloInputDigest;
    command.captureInput = captureDeployInputDigest;
  }
  return command;
};
for (const scope of [undefined, 'Team'])
  test(`public DLO commands bind optional scope to actual memberships ${scope}`, async () => {
    const actual = { ...wire, dataSpaceInfo: [{ name: scope ?? 'default' }] };
    const cwd = await scratch();
    const retrieve = invocation(Retrieve, { dataspace: scope, 'output-dir': cwd });
    retrieve.resolveOrg = async () => ({
      getOrgId: () => 'org',
      getConnection: () => ({ getUsername: () => 'target' }),
    });
    retrieve.createDloClient = () => client({ get: async () => actual });
    const acquired = await run(retrieve);
    assert.equal(acquired.status, 'success');
    assert.equal(acquired.result.items[0].identity.dataSpace, scope ?? 'default');
    const inputs = await readDeployInputs({ cwd, metadata: [`dlo:${name}`] });
    let writes = 0;
    const deploy = invocation(Deploy, {
      dataspace: scope,
      'target-org': { getOrgId: () => 'org', getUsername: () => 'target' },
    });
    deploy.resolveInputs = async () => inputs;
    deploy.createDloClient = () =>
      client({
        get: async () => actual,
        update: async () => {
          writes++;
          return actual;
        },
      });
    const deployed = await run(deploy);
    assert.equal(deployed.status, 'success');
    assert.equal(writes, 0);
    assert.equal(deployed.result.items[0].outcome, 'unchanged');
    assert.equal(deployed.result.items[0].mutation, 'not-attempted');
    let deletes = 0;
    const remove = invocation(Delete, { dataspace: scope });
    remove.resolveTarget = async () => 'target';
    remove.createDloClient = () =>
      client({
        get: async () => actual,
        delete: async (target) => {
          assert.equal(target, id);
          deletes++;
        },
      });
    const removed = await run(remove);
    assert.equal(removed.status, 'success');
    assert.equal(deletes, 1);
    const mismatch = invocation(Delete, { dataspace: 'Other' });
    mismatch.resolveTarget = remove.resolveTarget;
    mismatch.createDloClient = remove.createDloClient;
    const refused = await run(mismatch);
    assert.equal(refused.status, 'blocked');
    assert.equal(deletes, 1);
  });

for (const preview of [true, false])
  for (const dataspace of [undefined, 'Other'])
    test(`public DLO delete reports observed Team scope, requested=${dataspace} preview=${preview}`, async () => {
      const reads = [];
      const writes = [];
      const command = invocation(Delete, { dataspace, preview });
      command.resolveTarget = async () => 'target';
      command.createDloClient = (...arguments_) => {
        assert.deepEqual(arguments_, ['target', '68.0']);
        return client({
          get: async (...arguments_) => {
            reads.push(arguments_);
            return { ...wire, dataSpaceInfo: [{ name: 'Team' }] };
          },
          delete: async (...arguments_) => {
            writes.push(arguments_);
          },
        });
      };
      const result = await run(command);
      assert.deepEqual(reads, [[name]]);
      assert.deepEqual(writes, preview || dataspace ? [] : [[id]]);
      assert.equal(result.status, dataspace ? 'blocked' : 'success');
      assert.deepEqual(result.result.items[0], {
        identity: { dataSpace: dataspace ?? 'Team', apiName: name },
        operation: preview ? 'preview' : 'delete',
        outcome: dataspace ? 'blocked' : preview ? 'delete' : 'deleted',
        mutation: !dataspace && !preview ? 'confirmed-deleted' : 'not-attempted',
      });
      assert.deepEqual(
        result.diagnostics.errors.map(({ code }) => code),
        dataspace ? ['UNSUPPORTED_DLO_DATASPACE'] : [],
      );
    });

test('native DLO writer and strict admission roundtrip canonical JSON without source ID', async () => {
  const cwd = await scratch();
  const receipt = await writeDloDocument(document, cwd, false);
  assert.equal(receipt.path, path.join(cwd, 'data360/dlo', `${name}.dlo-meta.json`));
  const repeated = await writeDloDocument(document, cwd, false);
  assert.equal(repeated.outcome, 'unchanged');
  const saved = await readFile(receipt.path, 'utf8');
  assert.ok(!saved.includes(id));
  const inputs = await readDeployInputs({ cwd, metadata: [`dlo:${name}`, `dlo:${name}`] });
  assert.equal(inputs.length, 1);
  assert.ok(Object.isFrozen(inputs[0].document.spec.fields));
  await assert.rejects(
    writeDloDocument({ ...document, spec: { ...document.spec, label: 'Changed' } }, cwd, false),
    { code: 'OVERWRITE_REQUIRED' },
  );
  await writeFile(receipt.path, saved.replace('Example', 'Changed'));
  await assert.rejects(verifyDloInputDigest(inputs[0]), { code: 'UNSAFE_SOURCE' });
  const linked = await scratch();
  await symlink(
    cwd,
    path.join(linked, 'data360'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(writeDloDocument(document, linked, false));
  await assert.rejects(readDeployInputs({ cwd, metadata: [`ingestion-dlo:${name}`] }), {
    code: 'INVALID_SELECTION',
  });
});
test('DLO wrappers preserve optional explicit scope and block mismatch before dispatch', async () => {
  const saved = structuredClone(document);
  saved.identity.dataSpace = 'other';
  const scoped = { ...wire, dataSpaceInfo: [{ name: 'other' }] };
  const preview = await preflightDloDeploy(saved, client({ get: async () => scoped }), 'other');
  assert.equal(preview.outcome, 'unchanged');
  let writes = 0;
  const target = client({
    get: async () => scoped,
    update: async () => {
      writes++;
      return scoped;
    },
  });
  const result = await executeDloDeploy(saved, target, 'other');
  assert.equal(result.outcome, 'unchanged');
  assert.equal(result.mutation, 'not-attempted');
  const blocked = await executeDloDeploy(saved, target, 'default');
  assert.equal(blocked.mutation, 'not-attempted');
  assert.equal(writes, 0);
});

test('DLO preview and execution report portable reordered fields unchanged with zero mutations', async () => {
  const qualifier = { name: 'KQ_Id__c', label: 'Qualifier', dataType: 'Text', isPrimaryKey: false };
  const ordinary = { name: 'Note__c', label: 'Note', dataType: 'Text', isPrimaryKey: false };
  const saved = structuredClone(document);
  saved.spec.fields = [ordinary, { ...saved.spec.fields[0], keyQualifierName: 'KQ_Id' }];
  const actual = {
    ...wire,
    fields: [saved.spec.fields[1], qualifier, ordinary],
  };
  const calls = [];
  const target = client({
    get: async () => actual,
    create: async () => {
      calls.push('create');
      return actual;
    },
    update: async () => {
      calls.push('update');
      return actual;
    },
  });
  assert.deepEqual(await preflightDloDeploy(saved, target), {
    family: 'dlo',
    outcome: 'unchanged',
    target: 'existing',
    absenceProof: 'none',
    diagnostics: [],
  });
  assert.deepEqual(await executeDloDeploy(saved, target), {
    family: 'dlo',
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  assert.deepEqual(calls, []);
});

test('native DLO Git selection uses root JSON and blocks deletion', async () => {
  const cwd = await scratch();
  const receipt = await writeDloDocument(document, cwd, false);
  const git = (...arguments_) =>
    execFileSync('git', arguments_, { cwd, encoding: 'utf8', windowsHide: true });
  git('init', '--initial-branch=main');
  git('config', '--local', 'user.name', 'Jörn Berkefeld');
  git('config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  git('add', '.');
  git('-c', 'core.hooksPath=NUL', 'commit', '-m', 'fixture');
  await writeDloDocument({ ...document, spec: { ...document.spec, label: 'Changed' } }, cwd, true);
  const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(selected.paths, [receipt.path]);
  assert.equal(selected.dlos.length, 1);
  git('rm', '-f', path.relative(cwd, receipt.path));
  await assert.rejects(selectGitDeployInputs({ cwd, ref: 'HEAD' }), {
    code: 'BLOCKED_GIT_LIFECYCLE',
  });
});
test('retrieve saves native DLO file through public command and reports native68 route', async () => {
  const cwd = await scratch();
  const command = invocation(Retrieve, { 'target-org': 'source', 'output-dir': cwd });
  command.resolveOrg = async () => ({
    getOrgId: () => 'source-id',
    getConnection: () => ({ getUsername: () => 'source' }),
  });
  command.createDloClient = () => client();
  const result = await run(command);
  assert.equal(result.status, 'success');
  assert.equal(result.result.items[0].family, 'dlo');
  assert.equal(result.result.items[0].routes[0].apiVersion, '68.0');
  assert.deepEqual(JSON.parse(await readFile(result.result.items[0].path, 'utf8')), document);
});
for (const preview of [false, true])
  test(`delete default execution / preview=${preview} has exact mutation count`, async () => {
    let deletes = 0;
    const command = invocation(Delete, { preview });
    command.resolveTarget = async () => 'target';
    command.createDloClient = () =>
      client({
        delete: async (targetId) => {
          assert.equal(targetId, id);
          deletes++;
        },
      });
    const result = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(deletes, preview ? 0 : 1);
    assert.equal(result.result.items[0].outcome, preview ? 'delete' : 'deleted');
    assert.equal(Delete.flags.yes, undefined);
    assert.equal(Delete.flags.execute, undefined);
  });
for (const preview of [false, true])
  test(`delete absent unchanged and permission errors stop preview=${preview}`, async () => {
    for (const status of [404, 401, 403, 500]) {
      let deletes = 0;
      const command = invocation(Delete, { preview });
      command.resolveTarget = async () => 'target';
      command.createDloClient = () =>
        client({
          get: async () => {
            throw new DloError('DLO_HTTP_ERROR', status);
          },
          delete: async () => {
            deletes++;
          },
        });
      const result = await run(command);
      assert.equal(result.status, status === 404 ? 'success' : 'blocked');
      assert.equal(deletes, 0);
      assert.equal(result.result.items[0].outcome, status === 404 ? 'unchanged' : 'blocked');
    }
  });
test('delete ambiguous write is unknown and stops batch without retry', async () => {
  let deletes = 0;
  const command = invocation(Delete, { metadata: [`dlo:${name}`, 'dlo:Second__dll'] });
  command.resolveTarget = async () => 'target';
  command.createDloClient = () =>
    client({
      delete: async () => {
        deletes++;
        throw new Error('ambiguous');
      },
    });
  const result = await run(command);
  assert.equal(result.status, 'failed');
  assert.equal(result.result.items[0].mutation, 'unknown');
  assert.equal(deletes, 1);
  assert.equal(result.result.items.length, 1);
});
for (const preview of [true, false])
  for (const existing of [true, false])
    test(`deploy auto target ${existing ? 'PATCH' : 'POST'} preview=${preview}`, async () => {
      const cwd = await scratch();
      const changed = structuredClone(document);
      changed.spec.label = 'Updated';
      const receipt = await writeDloDocument(changed, cwd, false);
      const inputs = await readDeployInputs({ cwd, sourceDir: [receipt.path] });
      const writes = [];
      const command = invocation(Deploy, {
        preview,
        'source-dir': [receipt.path],
        metadata: undefined,
        'target-org': {
          getOrgId: () => 'target-id',
          getUsername: () => 'target',
          getConnection: () => ({}),
        },
      });
      command.resolveInputs = async () => inputs;
      command.createDloClient = () =>
        client({
          get: async () => {
            if (!existing) throw new DloError('DLO_HTTP_ERROR', 404);
            return wire;
          },
          create: async (body) => {
            writes.push(['POST', body]);
            return wire;
          },
          update: async (targetId, body) => {
            writes.push(['PATCH', targetId, body]);
            return wire;
          },
        });
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(writes.length, preview ? 0 : 1);
      assert.equal(
        result.result.items[0].outcome,
        preview ? (existing ? 'update' : 'create') : existing ? 'updated' : 'created',
      );
      if (!preview) assert.equal(writes[0][0], existing ? 'PATCH' : 'POST');
    });
test('mixed auto DLO and DMO deploy together on their native68 routes, DLO first', async () => {
  const cwd = await scratch();
  const receipt = await writeDloDocument(document, cwd, false);
  const dmoReceipt = await writeNativeDmoDocument(
    {
      schemaVersion: 1,
      kind: 'dmo',
      identity: { dataSpace: 'default', apiName: 'Synthetic__dlm' },
      spec: {
        label: 'Synthetic',
        category: 'Other',
        fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
      },
    },
    cwd,
    false,
  );
  const inputs = await readDeployInputs({ cwd, sourceDir: [dmoReceipt.path, receipt.path] });
  const versions = [];
  const command = invocation(Deploy, {
    'api-version': 'auto',
    metadata: undefined,
    'source-dir': [dmoReceipt.path, receipt.path],
    preview: true,
    'target-org': {
      getOrgId: () => 'target',
      getUsername: () => 'target',
      getConnection: () => assert.fail('Native routes own their connection'),
    },
  });
  command.resolveInputs = async () => inputs;
  command.createDloClient = (_target, version) => {
    versions.push(`dlo:${version}`);
    return client();
  };
  command.createDmoClient = (_target, version) => {
    versions.push(`dmo:${version}`);
    return {};
  };
  command.preflightNativeDmo = async () => ({
    family: 'dmo',
    outcome: 'unchanged',
    target: 'existing',
    absenceProof: 'none',
    diagnostics: [],
  });
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(versions, ['dlo:68.0', 'dmo:68.0']);
  assert.deepEqual(
    result.result.items.map((item) => item.family),
    ['dlo', 'dmo'],
  );
});
