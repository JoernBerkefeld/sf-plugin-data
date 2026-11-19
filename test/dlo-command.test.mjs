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
import { dataSpaceDirectory } from '../lib/services/data-space-check.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  retrieveNativeDlo,
  deleteNativeDlo,
  previewDeleteNativeDlo,
} from '../lib/services/native-dlo.js';
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
  c__dataSpace: ['default'],
  identity: { apiName: name },
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
    command.retrieveDlo = previewDeleteNativeDlo;
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
  for (const dataspace of [undefined, 'Other', 'Team'])
    test(`public DLO delete runs in the run's data space only, requested=${dataspace} preview=${preview}`, async () => {
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
      const localFile = path.join(process.cwd(), 'data360', 'dlo', `${name}.dlo-meta.json`);
      // Omitted --dataspace is default, never "the DLO's own space": only Team deletes.
      const deletes = dataspace === 'Team';
      assert.equal(result.result.scope.dataSpace, dataspace ?? 'default');
      // The membership check before any phase reads once; the phase reads again.
      assert.deepEqual(reads, deletes ? [[name], [name]] : [[name]]);
      assert.deepEqual(writes, deletes && !preview ? [[id]] : []);
      assert.equal(result.status, deletes ? 'success' : 'blocked');
      assert.deepEqual(result.result.items[0], {
        family: 'dlo',
        identity: { dataSpace: dataspace ?? 'default', apiName: name },
        operation: preview ? 'preview' : 'delete',
        outcome: deletes ? (preview ? 'delete' : 'deleted') : 'blocked',
        mutation: deletes && !preview ? 'confirmed-deleted' : 'not-attempted',
        // The project's own DLO file is listed by a preview and, absent here, reported not present.
        ...(deletes
          ? preview
            ? { localFiles: [{ path: localFile, exists: false }] }
            : { removedLocalFiles: [{ path: localFile, outcome: 'not-present' }] }
          : {}),
      });
      assert.deepEqual(
        result.diagnostics.errors.map(({ code }) => code),
        deletes ? [] : ['UNSUPPORTED_DLO_DATASPACE'],
      );
    });

for (const preview of [true, false])
  test(`a DLO that also belongs to another data space is not deleted, preview=${preview}`, async () => {
    const writes = [];
    const command = invocation(Delete, { preview });
    command.resolveTarget = async () => 'target';
    command.createDloClient = () =>
      client({
        get: async () => ({
          ...wire,
          dataSpaceInfo: [{ name: 'default' }, { name: 'dataspace2' }],
        }),
        delete: async (target) => {
          writes.push(target);
        },
      });
    const result = await run(command);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(writes, []);
    assert.equal(result.result.items[0].outcome, 'blocked');
    assert.deepEqual(
      result.diagnostics.errors.map(({ code }) => code),
      ['DLO_DELETE_OTHER_DATASPACES'],
    );
    assert.match(result.diagnostics.errors[0].message, /dataspace2/u);
  });

test('an unknown run data space is refused before any DLO read', async () => {
  let reads = 0;
  const command = invocation(Delete, { dataspace: 'Nowhere' });
  command.resolveTarget = async () => 'target';
  command.createDloClient = () =>
    client({
      get: async () => {
        reads++;
        return wire;
      },
    });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(reads, 0);
  assert.deepEqual(
    result.diagnostics.errors.map(({ code }) => code),
    ['UNKNOWN_DATASPACE'],
  );
  assert.equal(result.result.scope.dataSpace, 'Nowhere');
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
  saved.c__dataSpace = ['other'];
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
  assert.deepEqual(await preflightDloDeploy(saved, target, 'default'), {
    family: 'dlo',
    outcome: 'unchanged',
    target: 'existing',
    absenceProof: 'none',
    dataSpaces: ['default'],
    diagnostics: [],
  });
  assert.deepEqual(await executeDloDeploy(saved, target, 'default'), {
    family: 'dlo',
    outcome: 'unchanged',
    mutation: 'not-attempted',
    dataSpaces: ['default'],
    diagnostics: [],
  });
  assert.deepEqual(calls, []);
});

test('native DLO Git selection uses root JSON and reports a staged deletion', async () => {
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
  const deleted = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
  assert.deepEqual(deleted.paths, []);
  assert.deepEqual(
    deleted.deletions.map((deletion) => [
      deletion.family,
      deletion.identity.apiName,
      deletion.path,
    ]),
    [['dlo', name, receipt.path]],
  );
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
      get: async (apiName) => ({ ...wire, name: apiName }),
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

test('retrieve and deploy refuse an unknown data space before any read', async () => {
  const cwd = await scratch();
  let reads = 0;
  const counting = () =>
    client({
      get: async () => {
        reads++;
        return wire;
      },
    });
  const retrieve = invocation(Retrieve, { dataspace: 'Nowhere', 'output-dir': cwd });
  retrieve.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'target' }),
  });
  retrieve.createDloClient = counting;
  const retrieved = await run(retrieve);
  assert.equal(retrieved.status, 'blocked');
  assert.equal(retrieved.result.scope.dataSpace, 'Nowhere');
  assert.deepEqual(
    retrieved.diagnostics.errors.map(({ code }) => code),
    ['UNKNOWN_DATASPACE'],
  );
  const receipt = await writeDloDocument(
    { ...document, c__dataSpace: ['default', 'dataspace9'] },
    cwd,
    false,
  );
  const deploy = invocation(Deploy, {
    preview: true,
    'source-dir': [receipt.path],
    metadata: undefined,
    'target-org': { getOrgId: () => 'org', getUsername: () => 'target' },
  });
  deploy.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
  deploy.createDloClient = counting;
  const deployed = await run(deploy);
  assert.equal(deployed.status, 'blocked');
  assert.deepEqual(
    deployed.diagnostics.errors.map(({ code }) => code),
    ['UNKNOWN_DATASPACE'],
  );
  assert.equal(reads, 0);
});

test('retrieve writes every data space of a DLO; deploy lists and applies a removal only with the flag', async () => {
  const cwd = await scratch();
  const both = { ...wire, dataSpaceInfo: [{ name: 'default' }, { name: 'dataspace2' }] };
  const retrieve = invocation(Retrieve, { dataspace: 'dataspace2', 'output-dir': cwd });
  retrieve.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'target' }),
  });
  retrieve.createDloClient = () => client({ get: async () => both });
  const retrieved = await run(retrieve);
  assert.equal(retrieved.status, 'success');
  assert.deepEqual(retrieved.result.items[0].identity, { dataSpace: 'dataspace2', apiName: name });
  assert.deepEqual(retrieved.result.items[0].dataSpaces, ['dataspace2', 'default']);
  const saved = JSON.parse(await readFile(retrieved.result.items[0].path, 'utf8'));
  assert.deepEqual(saved.c__dataSpace, ['dataspace2', 'default']);
  // The file drops dataspace2: preview and deploy need --allow-dataspace-removal.
  const receipt = await writeDloDocument(document, cwd, true);
  for (const [preview, allow] of [
    [true, false],
    [true, true],
    [false, true],
  ]) {
    const removed = [];
    const deploy = invocation(Deploy, {
      preview,
      'allow-dataspace-removal': allow,
      'source-dir': [receipt.path],
      metadata: undefined,
      'target-org': { getOrgId: () => 'org', getUsername: () => 'target' },
    });
    deploy.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: [receipt.path] });
    deploy.createDloClient = () =>
      client({
        get: async () => (removed.length > 0 ? wire : both),
        removeMember: async (space, member) => {
          removed.push([space, member]);
          return { results: [{ dataSpaceMemberName: member, errors: {}, success: true }] };
        },
      });
    const result = await run(deploy);
    const item = result.result.items[0];
    if (!allow) {
      assert.equal(result.status, 'blocked');
      assert.equal(item.outcome, 'blocked');
      assert.match(JSON.stringify(result), /DLO_DATASPACE_REMOVAL_NOT_ALLOWED/u);
    } else if (preview) {
      assert.equal(result.status, 'success');
      assert.deepEqual(item.dataSpaceChanges, { add: [], remove: ['dataspace2'] });
    } else {
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(item.outcome, 'updated');
      assert.deepEqual(item.dataSpaces, ['default']);
    }
    assert.deepEqual(removed, preview || !allow ? [] : [['dataspace2', name]]);
  }
});

test('a DLO file with the old identity.dataSpace key is refused with its own code', async () => {
  const cwd = await scratch();
  const receipt = await writeDloDocument(document, cwd, false);
  const legacy = { ...document, identity: { dataSpace: 'default', apiName: name } };
  delete legacy.c__dataSpace;
  await writeFile(receipt.path, `${JSON.stringify(legacy, undefined, 2)}\n`);
  await assert.rejects(readDeployInputs({ cwd, metadata: [`dlo:${name}`] }), {
    code: 'LEGACY_DATASPACE_KEY',
  });
  await writeFile(
    receipt.path,
    `${JSON.stringify({ ...document, c__dataSpace: [{ name: 'default', filter: {} }] }, undefined, 2)}\n`,
  );
  await assert.rejects(readDeployInputs({ cwd, metadata: [`dlo:${name}`] }), {
    code: 'UNSUPPORTED_DATASPACE_FILTER',
  });
});

test('retrieve writes a DLO whose membership carries a filter as-is, with a warning', async () => {
  const cwd = await scratch();
  const retrieve = invocation(Retrieve, { 'output-dir': cwd });
  retrieve.resolveOrg = async () => ({
    getOrgId: () => 'org',
    getConnection: () => ({ getUsername: () => 'target' }),
  });
  retrieve.createDloClient = () =>
    client({
      get: async () => ({
        ...wire,
        dataSpaceInfo: [{ name: 'default', filter: { conditions: [] } }],
      }),
    });
  const result = await run(retrieve);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(result.result.items[0].verbatim, { reason: 'UNSUPPORTED_DLO_MEMBERSHIP' });
  assert.ok(result.diagnostics.warnings.some((text) => /UNSUPPORTED_DLO_MEMBERSHIP/u.test(text)));
  const saved = JSON.parse(await readFile(result.result.items[0].path, 'utf8'));
  // The filter is kept, never dropped.
  assert.match(JSON.stringify(saved.verbatim.native), /"filter":\{"conditions":\[\]\}/u);
});

test('a session failure of the data space check keeps its own code', async (t) => {
  const original = dataSpaceDirectory.read;
  t.after(() => {
    dataSpaceDirectory.read = original;
  });
  dataSpaceDirectory.read = async () => {
    throw new ConnectError('AUTHENTICATION_FAILED', 401);
  };
  const retrieve = invocation(Retrieve, { 'output-dir': await scratch() });
  retrieve.resolveOrg = async () => assert.fail('the fake read opens no sender');
  const retrieved = await run(retrieve);
  assert.deepEqual(
    retrieved.diagnostics.errors.map(({ code }) => code),
    ['AUTHENTICATION_FAILED'],
  );
  const deploy = invocation(Deploy, {
    preview: true,
    'target-org': { getOrgId: () => 'org', getUsername: () => 'target' },
  });
  deploy.resolveInputs = async () => [
    { path: 'x', document: structuredClone(document), inputDigest: 'a'.repeat(64) },
  ];
  const deployed = await run(deploy);
  assert.deepEqual(
    deployed.diagnostics.errors.map(({ code }) => code),
    ['AUTHENTICATION_FAILED'],
  );
});

test('delete --field checks the run data space before any read', async () => {
  const command = invocation(Delete, {
    metadata: ['dmo:Example__dlm'],
    field: ['Note__c'],
    dataspace: 'Nowhere',
  });
  command.resolveTarget = async () => 'target';
  command.createDmoNativeDeleteClient = () => ({
    get: async () => assert.fail('no DMO read before the data space check'),
  });
  command.createDmoClient = () => ({});
  command.createMappingClient = () => ({});
  command.createMappingSender = () => ({});
  command.createDloNativeDeleteClient = () => ({});
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.diagnostics.errors.map(({ code }) => code),
    ['UNKNOWN_DATASPACE'],
  );
  assert.equal(result.result.items[0].identity.dataSpace, 'Nowhere');
});
