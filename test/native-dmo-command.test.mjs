import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Retrieve from '../lib/commands/data360/retrieve.js';
import Deploy from '../lib/commands/data360/deploy.js';
import Delete from '../lib/commands/data360/delete.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { readDeployInputs, captureDeployInputDigest } from '../lib/artifacts/read-deploy-input.js';
import { preflightDmo, executeDmo } from '../lib/services/command-native-dmo.js';
const name = 'Example__dlm';
const fields = [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }];
const wire = {
  id: 'never-use-id',
  name,
  label: 'Example',
  category: 'Other',
  dataSpaceName: 'default',
  fields: fields.map(({ dataType, ...field }) => ({ ...field, type: dataType })),
};
const document = {
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: name },
  spec: { label: 'Example', category: 'Other', fields },
};
const scratch = () => mkdtemp(path.join(os.tmpdir(), 'native-dmo-command-'));
const client = (overrides = {}) => ({
  get: async () => structuredClone(wire),
  create: async () => structuredClone(wire),
  update: async () => structuredClone(wire),
  delete: async () => {},
  ...overrides,
});
const invocation = (Type, overrides = {}) => {
  const command = Object.create(Type.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': '65.0',
      dataspace: 'default',
      metadata: [`dmo:${name}`],
      preview: false,
      ...overrides,
    },
  });
  command.jsonEnabled = () => true;
  return command;
};
const run = async (command) => {
  const before = process.exitCode;
  try {
    return await command.run();
  } finally {
    process.exitCode = before;
  }
};
const org = {
  getOrgId: () => 'org',
  getUsername: () => 'target',
  getConnection: () => ({ getUsername: () => 'target' }),
};

test('native writer retains fields and binds canonical source bytes', async () => {
  const cwd = await scratch();
  const generated = {
    name: 'DataSource__c',
    label: 'Source',
    dataType: 'Text',
    isPrimaryKey: false,
    creationType: 'System',
  };
  const value = { ...document, spec: { ...document.spec, fields: [...fields, generated] } };
  const receipt = await writeNativeDmoDocument(value, cwd, false);
  assert.equal(receipt.path, path.join(cwd, 'data360', 'dmo', `${name}.dmo-meta.json`));
  assert.deepEqual(JSON.parse(await readFile(receipt.path, 'utf8')), value);
  const repeated = await writeNativeDmoDocument(value, cwd, false);
  assert.equal(repeated.outcome, 'unchanged');
  await assert.rejects(
    writeNativeDmoDocument({ ...value, spec: { ...value.spec, label: 'Changed' } }, cwd, false),
    { code: 'OVERWRITE_REQUIRED' },
  );
  const [input] = await readDeployInputs({ cwd, metadata: [`dmo:${name}`] });
  assert.ok(Object.isFrozen(input.document.spec.fields));
  assert.equal(await captureDeployInputDigest(input), input.inputDigest);
  await writeFile(receipt.path, JSON.stringify(document));
  await assert.rejects(captureDeployInputDigest(input), { code: 'UNSAFE_SOURCE' });
});
test('DMO wrappers forward explicit scope while retaining conservative dispatch evidence', async () => {
  const saved = structuredClone(document);
  saved.identity.dataSpace = 'other';
  saved.spec.label = 'Changed';
  const scoped = { ...wire, dataSpaceName: 'other' };
  const updated = { ...scoped, label: saved.spec.label };
  const preview = await preflightDmo(saved, client({ get: async () => scoped }), 'other');
  assert.equal(preview.outcome, 'update');
  let writes = 0;
  const target = client({
    get: async () => (writes ? updated : scoped),
    update: async (_name, body) => {
      writes++;
      assert.equal(body.dataSpaceName, 'other');
      return updated;
    },
  });
  const result = await executeDmo(saved, target, 'other');
  assert.equal(result.outcome, 'updated');
  const blocked = await executeDmo(saved, target, 'default');
  assert.equal(blocked.mutation, 'not-attempted');
  assert.equal(writes, 1);
});

test('DMO wrapper unchanged preview and execution are GET-only and not-attempted', async () => {
  const calls = [];
  const target = client({
    get: async (apiName) => {
      calls.push(['get', apiName]);
      return structuredClone(wire);
    },
    create: async () => assert.fail('no POST'),
    update: async () => assert.fail('no PATCH'),
    delete: async () => assert.fail('no DELETE'),
  });
  assert.deepEqual(await preflightDmo(document, target), {
    family: 'dmo',
    outcome: 'unchanged',
    target: 'existing',
    absenceProof: 'none',
    diagnostics: [],
  });
  assert.deepEqual(await executeDmo(document, target), {
    outcome: 'unchanged',
    mutation: 'not-attempted',
    diagnostics: [],
  });
  assert.deepEqual(calls, [
    ['get', name],
    ['get', name],
  ]);
});

for (const preview of [true, false])
  test(`public native DMO identical deploy reports unchanged preview=${preview}`, async () => {
    const cwd = await scratch();
    await writeNativeDmoDocument(document, cwd, false);
    const inputs = await readDeployInputs({ cwd, metadata: [`dmo:${name}`] });
    const calls = [];
    const command = invocation(Deploy, { preview, 'target-org': org });
    command.resolveInputs = async () => inputs;
    command.createDmoClient = () =>
      client({
        get: async (apiName) => {
          calls.push(['get', apiName]);
          return structuredClone(wire);
        },
        create: async () => assert.fail('no POST'),
        update: async () => assert.fail('no PATCH'),
        delete: async () => assert.fail('no DELETE'),
      });
    const result = await run(command);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(result.result.items[0].outcome, 'unchanged');
    assert.equal(result.result.items[0].mutation, preview ? undefined : 'not-attempted');
    assert.ok(calls.length > 0);
    assert.ok(calls.every(([method, apiName]) => method === 'get' && apiName === name));
  });

test('canonical exact selection accepts native DMO names with consecutive underscores', async () => {
  const cwd = await scratch();
  const apiName = 'Example__Part__dlm';
  const value = { ...document, identity: { ...document.identity, apiName } };
  const receipt = await writeNativeDmoDocument(value, cwd, false);
  assert.equal(receipt.path, path.join(cwd, 'data360', 'dmo', `${apiName}.dmo-meta.json`));
  const inputs = await readDeployInputs({ cwd, metadata: [`dmo:${apiName}`] });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].path, receipt.path);
  assert.deepEqual(inputs[0].document, value);
  assert.equal(await captureDeployInputDigest(inputs[0]), inputs[0].inputDigest);
});
test('exact retrieve routes native65 rather than legacy projection', async () => {
  const cwd = await scratch();
  const command = invocation(Retrieve, { 'output-dir': cwd });
  command.resolveOrg = async () => org;
  command.createDmoClient = (_target, version) => {
    assert.equal(version, '65.0');
    return client();
  };
  const result = await run(command);
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.deepEqual(JSON.parse(await readFile(result.result.items[0].path, 'utf8')), document);
});
for (const preview of [false, true]) {
  test(`native delete full-name preview=${preview}, omitted version defaults auto68`, async () => {
    let writes = 0;
    const command = invocation(Delete, { preview, 'api-version': undefined });
    command.resolveTarget = async () => 'target';
    command.createDmoClient = () =>
      client({
        delete: async (target) => {
          assert.equal(target, name);
          writes++;
        },
      });
    const result = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(result.metadata.apiVersion, 'auto');
    assert.equal(writes, preview ? 0 : 1);
    assert.equal(Delete.flags.yes, undefined);
    assert.equal(Delete.flags.cascade, undefined);
  });
  test(`native deploy PATCH or confirmed404 POST preview=${preview}`, async () => {
    for (const existing of [true, false]) {
      const cwd = await scratch();
      const desired = structuredClone(document);
      desired.spec.label = 'Changed';
      await writeNativeDmoDocument(desired, cwd, false);
      const inputs = await readDeployInputs({ cwd, metadata: [`dmo:${name}`] });
      let writes = 0;
      const command = invocation(Deploy, { preview, 'target-org': org });
      command.resolveInputs = async () => inputs;
      command.createDmoClient = () =>
        client({
          get: async () => {
            if (!existing && writes === 0) throw new NativeDmoError('DMO_HTTP_ERROR', 404);
            return writes ? { ...wire, label: desired.spec.label } : wire;
          },
          create: async () => {
            assert.equal(existing, false);
            writes++;
            return wire;
          },
          update: async (target) => {
            assert.equal(target, name);
            assert.equal(existing, true);
            writes++;
            return wire;
          },
        });
      const result = await run(command);
      assert.equal(result.status, 'success', JSON.stringify(result));
      assert.equal(writes, preview ? 0 : 1);
    }
  });
}
test('native deploy permission failure and dependency expansion never write', async () => {
  const cwd = await scratch();
  await writeNativeDmoDocument(document, cwd, false);
  const inputs = await readDeployInputs({ cwd, metadata: [`dmo:${name}`] });
  for (const dependency of [false, true]) {
    let writes = 0;
    let auth = 0;
    const command = invocation(Deploy, {
      'target-org': 'target',
      'include-dependencies': dependency,
    });
    command.resolveInputs = async () => inputs;
    command.resolveTargetOrg = async () => {
      auth++;
      return org;
    };
    command.createDmoClient = () =>
      client({
        get: async () => {
          throw new NativeDmoError('DMO_HTTP_ERROR', 403);
        },
        create: async () => {
          writes++;
          return wire;
        },
        update: async () => {
          writes++;
          return wire;
        },
      });
    const result = await run(command);
    assert.notEqual(result.status, 'success');
    assert.equal(writes, 0);
    assert.equal(auth, dependency ? 0 : 1);
  }
});
for (const scope of [undefined, 'Team'])
  for (const preview of [true, false])
    test(`public native DMO deploy/delete optional scope ${scope} preview=${preview}`, async () => {
      const cwd = await scratch();
      const desired = structuredClone(document);
      desired.identity.dataSpace = scope ?? 'default';
      desired.spec.label = 'Changed';
      await writeNativeDmoDocument(desired, cwd, false);
      const inputs = await readDeployInputs({ cwd, metadata: [`dmo:${name}`] });
      const actual = { ...wire, dataSpaceName: desired.identity.dataSpace };
      let updates = 0;
      const deploy = invocation(Deploy, { dataspace: scope, preview, 'target-org': org });
      deploy.resolveInputs = async () => inputs;
      deploy.createDmoClient = () =>
        client({
          get: async () => (updates ? { ...actual, label: desired.spec.label } : actual),
          update: async (_name, body) => {
            updates++;
            assert.equal(Object.hasOwn(body, 'dataSpaceName'), scope !== undefined);
            if (scope !== undefined) assert.equal(body.dataSpaceName, scope);
            return actual;
          },
        });
      const deployed = await run(deploy);
      assert.equal(deployed.status, 'success');
      assert.equal(updates, preview ? 0 : 1);
      let deletes = 0;
      const remove = invocation(Delete, { dataspace: scope, preview });
      remove.resolveTarget = async () => 'target';
      remove.createDmoClient = () =>
        client({
          get: async () => actual,
          delete: async () => {
            deletes++;
          },
        });
      const result = await run(remove);
      assert.equal(result.status, 'success');
      assert.equal(result.result.items[0].identity.dataSpace, scope ?? 'default');
      assert.equal(deletes, preview ? 0 : 1);
      const mismatch = invocation(Delete, { dataspace: 'Other', preview: false });
      mismatch.resolveTarget = async () => 'target';
      mismatch.createDmoClient = remove.createDmoClient;
      const refused = await run(mismatch);
      assert.equal(refused.status, 'blocked');
      assert.equal(deletes, preview ? 0 : 1);
    });

for (const preview of [true, false])
  for (const dataspace of [undefined, 'Other'])
    test(`public DMO delete reports observed Team scope, requested=${dataspace} preview=${preview}`, async () => {
      const reads = [];
      const writes = [];
      const command = invocation(Delete, { dataspace, preview });
      command.resolveTarget = async () => 'target';
      command.createDmoClient = (...arguments_) => {
        assert.deepEqual(arguments_, ['target', '65.0']);
        return client({
          get: async (...arguments_) => {
            reads.push(arguments_);
            return { ...wire, dataSpaceName: 'Team' };
          },
          delete: async (...arguments_) => {
            writes.push(arguments_);
          },
        });
      };
      const result = await run(command);
      assert.deepEqual(reads, [[name]]);
      assert.deepEqual(writes, preview || dataspace ? [] : [[name]]);
      assert.equal(result.status, dataspace ? 'blocked' : 'success');
      assert.deepEqual(result.result.items[0], {
        identity: { dataSpace: dataspace ?? 'Team', apiName: name },
        operation: preview ? 'preview' : 'delete',
        outcome: dataspace ? 'blocked' : preview ? 'delete' : 'deleted',
        mutation: !dataspace && !preview ? 'confirmed-deleted' : 'not-attempted',
      });
      assert.deepEqual(
        result.diagnostics.errors.map(({ code }) => code),
        dataspace ? ['UNSUPPORTED_DMO_DATASPACE'] : [],
      );
    });

test('invalid native selections/scope are rejected before authentication', async () => {
  for (const Type of [Retrieve, Delete]) {
    for (const metadata of [['dmo'], ['dmo:Bad'], ['dmo:../Bad__dlm']]) {
      const command = invocation(Type, { metadata });
      command.resolveOrg = command.resolveTarget = () => {
        throw new Error('auth must not run');
      };
      const result = await run(command);
      assert.equal(result.status, 'blocked');
    }
  }
  const command = invocation(Delete, {
    metadata: [`dmo:${name}`, 'dlo:Example__dll'],
    'api-version': undefined,
  });
  let auth = 0;
  command.resolveTarget = async () => {
    auth++;
    return 'target';
  };
  command.createDmoClient = () => client();
  command.deleteDmo = async () => ({ dataSpace: 'default' });
  command.createDloClient = () => ({
    get: async () => {
      throw new Error('stop before mutation');
    },
  });
  const result = await run(command);
  assert.equal(result.status, 'blocked');
  assert.equal(auth, 1);
  assert.equal(result.result.items.length, 2);
});
