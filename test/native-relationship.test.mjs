import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NativeRelationshipError,
  normalizeNativeRelationship,
  validateNativeRelationshipDocument,
} from '../lib/artifacts/native-relationship-document.js';
import { writeNativeRelationshipDocument } from '../lib/artifacts/write-native-relationship.js';
import { readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { createRelationshipClient } from '../lib/transport/relationship-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import {
  deleteNativeRelationship,
  deployNativeRelationship,
  listNativeRelationships,
  preflightDeleteNativeRelationship,
  preflightNativeRelationship,
  retrieveNativeRelationships,
} from '../lib/services/native-relationship.js';
import { executeRelationship } from '../lib/services/command-native-relationship.js';

const spec = {
  sourceObjectName: 'A__dlm',
  sourceFieldName: 'BRef__c',
  targetObjectName: 'B__dlm',
  targetFieldName: 'Id__c',
  cardinality: 'ManyToOne',
  relationshipOwner: 'DataCloud',
};
const name = 'A_BRef_map_B_Id_1794441634124';
const document = {
  schemaVersion: 1,
  kind: 'relationship',
  identity: { apiName: name, dataSpace: 'default' },
  spec,
};
/**
 * One list entry in the live API68 shape.
 * @param {object} [overrides] Changed values.
 * @returns {object} Native entry.
 */
const wire = (overrides = {}) => {
  const value = { ...spec, name, status: 'ACTIVE', ...overrides };
  return {
    cardinality: value.cardinality,
    creationType: 'Custom',
    id: '0geSYNTHETIC',
    name: value.name,
    owner: value.relationshipOwner,
    sourceField: { label: 'BRef', name: value.sourceFieldName, type: 'MktDataModelField' },
    // eslint-disable-next-line unicorn/no-null -- The live API68 shape reports null.
    sourceObject: { keyQualifierField: null, label: 'A', name: value.sourceObjectName },
    status: value.status,
    targetField: { label: 'Id', name: value.targetFieldName, type: 'MktDataModelField' },
    // eslint-disable-next-line unicorn/no-null -- The live API68 shape reports null.
    targetObject: { keyQualifierField: null, label: 'B', name: value.targetObjectName },
  };
};
const page = (relationships, totalSize = relationships.length) => ({
  currentPageUrl: '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?offset=0',
  relationships,
  totalSize,
});
const code = (expected) => (error) => {
  assert.ok(error instanceof NativeRelationshipError, String(error));
  assert.equal(error.code, expected);
  return true;
};

test('relationship documents validate structurally and leave cardinality and owner to Salesforce', () => {
  assert.deepEqual(validateNativeRelationshipDocument(document), document);
  assert.notEqual(validateNativeRelationshipDocument(document), document);
  for (const value of [
    { ...spec, cardinality: 'OneToOne' },
    { ...spec, relationshipOwner: 'SomethingNew' },
  ])
    validateNativeRelationshipDocument({ ...document, spec: value });
  for (const broken of [
    { ...document, kind: 'mapping' },
    { ...document, schemaVersion: 2 },
    { ...document, extra: true },
    { ...document, identity: { apiName: '1bad', dataSpace: 'default' } },
    { ...document, identity: { apiName: name, dataSpace: ' default' } },
    { ...document, spec: { ...spec, sourceObjectName: 'A__dll' } },
    { ...document, spec: { ...spec, targetObjectName: 'B' } },
    { ...document, spec: { ...spec, sourceFieldName: 'BRef' } },
    { ...document, spec: { ...spec, targetFieldName: 'Id__c ' } },
    { ...document, spec: { ...spec, cardinality: '' } },
    { ...document, spec: { ...spec, relationshipOwner: 7 } },
    { ...document, spec: { ...spec, id: '0ge' } },
  ])
    assert.throws(
      () => validateNativeRelationshipDocument(broken),
      code('INVALID_RELATIONSHIP_DOCUMENT'),
    );
});

test('normalization keeps the authored binding and drops id, labels, status and creation type', () => {
  assert.deepEqual(normalizeNativeRelationship(wire({ status: 'CREATING' })), document);
  assert.deepEqual(normalizeNativeRelationship(wire(), 'other').identity, {
    apiName: name,
    dataSpace: 'other',
  });
  const missing = wire();
  delete missing.owner;
  assert.throws(() => normalizeNativeRelationship(missing), code('INVALID_RELATIONSHIP_RESPONSE'));
});

test('listing pages by offset until totalSize and ignores the repeating nextPageUrl', async () => {
  const all = Array.from({ length: 250 }, (_, index) => wire({ name: `R${index}` }));
  const offsets = [];
  const entries = await listNativeRelationships('A__dlm', {
    list: async (dmo, offset) => {
      assert.equal(dmo, 'A__dlm');
      offsets.push(offset);
      return { ...page(all.slice(offset, offset + 200), 250), nextPageUrl: '?offset=0' };
    },
  });
  assert.deepEqual(offsets, [0, 200]);
  assert.equal(entries.length, 250);
});

test('listing answers 204 with nothing and refuses incomplete or inconsistent inventories', async () => {
  assert.deepEqual(await listNativeRelationships('A__dlm', { list: async () => {} }), []);
  const cases = {
    short: async (_dmo, offset) => (offset === 0 ? page([wire()], 3) : page([], 3)),
    shortNoContent: async (_dmo, offset) => (offset === 0 ? page([wire()], 3) : undefined),
    moving: async (_dmo, offset) => page([wire({ name: `R${offset}` })], offset === 0 ? 2 : 3),
    duplicate: async () => page([wire()], 2),
  };
  for (const [label, list] of Object.entries(cases))
    await assert.rejects(
      listNativeRelationships('A__dlm', { list }),
      code('RELATIONSHIP_INVENTORY_INCOMPLETE'),
      label,
    );
  await assert.rejects(
    listNativeRelationships('A__dlm', { list: async () => ({ relationships: [] }) }),
    code('INVALID_RELATIONSHIP_RESPONSE'),
  );
  await assert.rejects(
    listNativeRelationships('A__dll', { list: async () => assert.fail('no read') }),
    code('INVALID_RELATIONSHIP_BINDING'),
  );
});

test('retrieve keeps only relationships whose source is the DMO, ordered by name', async () => {
  const documents = await retrieveNativeRelationships('A__dlm', {
    list: async () =>
      page([
        wire({ name: 'Zulu' }),
        wire({ name: 'Incoming', sourceObjectName: 'C__dlm', targetObjectName: 'A__dlm' }),
        wire({ name: 'Alpha' }),
      ]),
  });
  assert.deepEqual(
    documents.map((entry) => entry.identity.apiName),
    ['Alpha', 'Zulu'],
  );
  assert.deepEqual(documents[0].spec, spec);
});

/**
 * A fake relationship client over a mutable inventory.
 * @param {object[]} entries Initial native entries of the source DMO.
 * @returns {object} Client and call ledger.
 */
function fakeClient(entries) {
  const calls = [];
  const client = {
    state: [...entries],
    list: async (dmo, offset) => {
      calls.push(['list', dmo, offset]);
      return client.state.length === 0 ? undefined : page(client.state);
    },
    create: async (body) => {
      calls.push(['create', body]);
      client.state.push(wire({ status: 'CREATING' }));
      return { relationships: [wire({ status: 'CREATING' })] };
    },
    remove: async (relationshipName) => {
      calls.push(['remove', relationshipName]);
      client.state = client.state.filter((entry) => entry.name !== relationshipName);
    },
  };
  return { client, calls };
}

test('deploy matches by binding: present and equal is a no-op without a write', async () => {
  const { client, calls } = fakeClient([wire({ name: 'OrgGenerated' })]);
  assert.deepEqual(await deployNativeRelationship({ ...document }, client), {
    operation: 'noop',
    apiName: 'OrgGenerated',
  });
  assert.deepEqual(calls, [['list', 'A__dlm', 0]]);
});

test('deploy creates an absent relationship once and reads back until ACTIVE', async () => {
  const { client, calls } = fakeClient([]);
  let reads = 0;
  const list = client.list;
  client.list = async (...arguments_) => {
    // The third read shows the relationship ACTIVE.
    if (++reads === 3) client.state = client.state.map((entry) => ({ ...entry, status: 'ACTIVE' }));
    return list(...arguments_);
  };
  assert.deepEqual(await deployNativeRelationship(document, client), {
    operation: 'create',
    apiName: name,
  });
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'create'),
    [['create', spec]],
  );
  assert.equal(reads, 3);
});

test('deploy refuses a changed cardinality or owner before any write', async () => {
  for (const change of [{ cardinality: 'OneToOne' }, { relationshipOwner: 'Other' }]) {
    const { client, calls } = fakeClient([wire(change)]);
    await assert.rejects(
      deployNativeRelationship(document, client),
      code('RELATIONSHIP_CHANGE_UNSUPPORTED'),
    );
    assert.ok(!calls.some(([kind]) => kind === 'create'));
  }
});

test('deploy reports an unconfirmed create when the relationship never turns ACTIVE', async () => {
  const { client, calls } = fakeClient([]);
  await assert.rejects(
    deployNativeRelationship(document, client),
    code('RELATIONSHIP_PERSISTENCE_UNCONFIRMED'),
  );
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
});

test('deploy refuses a data space other than the request scope and an ambiguous binding', async () => {
  const { client } = fakeClient([]);
  await assert.rejects(
    preflightNativeRelationship(
      { ...document, identity: { ...document.identity, dataSpace: 'other' } },
      client,
    ),
    code('UNSUPPORTED_RELATIONSHIP_DATASPACE'),
  );
  const twice = fakeClient([wire({ name: 'One' }), wire({ name: 'Two' })]);
  await assert.rejects(
    preflightNativeRelationship(document, twice.client),
    code('AMBIGUOUS_RELATIONSHIP_TARGET'),
  );
});

test('execution surfaces the Salesforce 400 of the create as a rejected write', async () => {
  const { client } = fakeClient([]);
  client.create = async () => {
    throw new NativeRelationshipError('RELATIONSHIP_HTTP_ERROR', 400);
  };
  const result = await executeRelationship(document, client);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'RELATIONSHIP_HTTP_ERROR');
  const unchanged = await executeRelationship(document, fakeClient([wire()]).client);
  assert.deepEqual(
    [unchanged.outcome, unchanged.mutation, unchanged.targetApiName],
    ['unchanged', 'not-attempted', name],
  );
  const refused = await executeRelationship(
    document,
    fakeClient([wire({ cardinality: 'X' })]).client,
  );
  assert.deepEqual([refused.outcome, refused.mutation], ['blocked', 'not-attempted']);
  assert.equal(refused.diagnostics[0].code, 'RELATIONSHIP_CHANGE_UNSUPPORTED');
});

test('delete is unchanged when absent and confirms absence after one DELETE', async () => {
  const absent = fakeClient([wire({ name: 'Other', targetFieldName: 'Other__c' })]);
  assert.deepEqual(await deleteNativeRelationship(name, document, absent.client), {
    outcome: 'unchanged',
  });
  assert.ok(!absent.calls.some(([kind]) => kind === 'remove'));
  const present = fakeClient([wire()]);
  assert.deepEqual(await deleteNativeRelationship(name, document, present.client), {
    outcome: 'deleted',
  });
  assert.deepEqual(
    present.calls.map(([kind]) => kind),
    ['list', 'remove', 'list'],
  );
});

test('delete refuses the file binding under another name and never deletes it', async () => {
  const renamed = fakeClient([wire({ name: 'Org_Generated_2' })]);
  await assert.rejects(deleteNativeRelationship(name, document, renamed.client), (error) => {
    assert.equal(error.code, 'RELATIONSHIP_NAME_MISMATCH');
    return true;
  });
  assert.ok(!renamed.calls.some(([kind]) => kind === 'remove'));
  const preview = fakeClient([wire({ name: 'Org_Generated_2' })]);
  await assert.rejects(
    preflightDeleteNativeRelationship(name, document, preview.client),
    code('RELATIONSHIP_NAME_MISMATCH'),
  );
});

test('deploy readback stops at a terminal non-ACTIVE status without waiting out the budget', async () => {
  const { client } = fakeClient([]);
  let reads = 0;
  const list = client.list;
  client.list = async (...arguments_) => {
    reads++;
    client.state = client.state.map((entry) => ({ ...entry, status: 'FAILED' }));
    return list(...arguments_);
  };
  await assert.rejects(
    deployNativeRelationship(document, client),
    code('RELATIONSHIP_PERSISTENCE_UNCONFIRMED'),
  );
  assert.equal(reads, 2);
});

test('two relationship files with one binding are a duplicate identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'relationship-duplicate-'));
  await writeNativeRelationshipDocument(document, root, false);
  await writeNativeRelationshipDocument(
    { ...document, identity: { ...document.identity, apiName: 'Other_Name_1' } },
    root,
    false,
  );
  await assert.rejects(
    readDeployInputs({ cwd: root, sourceDir: ['data360/relationship'] }),
    (error) => {
      assert.equal(error.code, 'DUPLICATE_IDENTITY');
      return true;
    },
  );
});

test('delete refuses a name carrying another binding and an unconfirmed absence', async () => {
  const other = fakeClient([wire({ targetFieldName: 'Other__c' })]);
  await assert.rejects(
    preflightDeleteNativeRelationship(name, document, other.client),
    code('RELATIONSHIP_TARGET_BINDING_MISMATCH'),
  );
  await assert.rejects(
    preflightDeleteNativeRelationship('Different', document, other.client),
    code('RELATIONSHIP_FILE_IDENTITY_MISMATCH'),
  );
  const stuck = fakeClient([wire()]);
  stuck.client.remove = async () => {};
  await assert.rejects(
    deleteNativeRelationship(name, document, stuck.client),
    code('RELATIONSHIP_DELETION_UNCONFIRMED'),
  );
});

/**
 * A CLI receipt with an HTTP status line.
 * @param {number} status HTTP status.
 * @param {unknown} [value] JSON body.
 * @returns {{exitCode: number, stdout: string}} Receipt.
 */
const receipt = (status, value) => ({
  exitCode: 0,
  stdout: `HTTP/1.1 ${status}\r\ncontent-type: application/json\r\n\r\n${value === undefined ? '' : JSON.stringify(value)}`,
});

test('bound sender carries GET and DELETE on the exact routes, once each', async () => {
  const requests = [];
  const sender = {
    request: async (method, route, noContent) => {
      requests.push([method, route]);
      return method === 'GET' && route.includes('Empty__dlm') ? noContent : page([wire()]);
    },
  };
  const runner = async () => assert.fail('GET and DELETE never start a CLI process');
  const client = createRelationshipClient('target', 'auto', runner, undefined, sender);
  assert.equal(client.apiVersion, '68.0');
  assert.deepEqual(await client.list('A__dlm', 0), page([wire()]));
  assert.equal(await client.list('Empty__dlm', 200), undefined);
  await client.remove(name);
  const scoped = createRelationshipClient('target', '68.0', runner, 'other', sender);
  await scoped.list('A__dlm', 0);
  assert.deepEqual(requests, [
    ['GET', '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?limit=200&offset=0'],
    [
      'GET',
      '/services/data/v68.0/ssot/data-model-objects/Empty__dlm/relationships?limit=200&offset=200',
    ],
    ['DELETE', `/services/data/v68.0/ssot/data-model-objects/relationships/${name}`],
    [
      'GET',
      '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?dataspace=other&limit=200&offset=0',
    ],
  ]);
  await assert.rejects(client.remove('bad/name'), code('INVALID_RELATIONSHIP_NAME'));
  await assert.rejects(client.list('A__dll', 0), code('INVALID_RELATIONSHIP_BINDING'));
});

test('bound failures map to typed HTTP errors without a retry', async () => {
  for (const [error, expected, status] of [
    [new ConnectError('REQUEST_FAILED', 400), 'RELATIONSHIP_HTTP_ERROR', 400],
    [new ConnectError('AUTHENTICATION_FAILED'), 'RELATIONSHIP_HTTP_ERROR', 401],
    [new ConnectError('REQUEST_FAILED'), 'RELATIONSHIP_REQUEST_UNCONFIRMED', undefined],
  ]) {
    let attempts = 0;
    const client = createRelationshipClient('target', '68.0', undefined, undefined, {
      request: async () => {
        attempts++;
        throw error;
      },
    });
    await assert.rejects(client.remove(name), (thrown) => {
      assert.equal(thrown.code, expected);
      assert.equal(thrown.status, status);
      return true;
    });
    assert.equal(attempts, 1);
  }
});

test('create posts one body to the source DMO through the CLI runner and surfaces a 400', async () => {
  const sent = [];
  const runner = async (arguments_) => {
    const body = JSON.parse(await readFile(arguments_[arguments_.indexOf('--body') + 1].slice(1)));
    sent.push({ route: arguments_[3], method: arguments_[5], body });
    return sent.length === 1
      ? receipt(201, { relationships: [wire({ status: 'CREATING' })] })
      : receipt(400, [
          {
            errorCode: 'INVALID_INPUT',
            message:
              'No ObjectSourceTargetMaps were found for the DMOs in the relationships. Make sure that the DMOs are mapped.',
          },
        ]);
  };
  const sender = { request: async () => assert.fail('POST never uses the bound sender') };
  const client = createRelationshipClient('target', '68.0', runner, undefined, sender);
  assert.deepEqual(await client.create(spec), { relationships: [wire({ status: 'CREATING' })] });
  await assert.rejects(client.create(spec), (error) => {
    assert.equal(error.code, 'RELATIONSHIP_HTTP_ERROR');
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], {
    route: '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships',
    method: 'POST',
    body: { relationships: [spec] },
  });
  await assert.rejects(
    client.create({ ...spec, sourceObjectName: 'A' }),
    code('INVALID_RELATIONSHIP_DOCUMENT'),
  );
  assert.equal(sent.length, 2);
  assert.throws(
    () => createRelationshipClient('-target'),
    code('UNSUPPORTED_RELATIONSHIP_SELECTION'),
  );
});

test('runner GET reads 204 as empty and DELETE uses a request file', async () => {
  const seen = [];
  const client = createRelationshipClient('target', '68.0', async (arguments_) => {
    seen.push(arguments_);
    if (arguments_.includes('--file')) {
      const request = JSON.parse(await readFile(arguments_[arguments_.indexOf('--file') + 1]));
      assert.deepEqual(request, {
        url: `/services/data/v68.0/ssot/data-model-objects/relationships/${name}`,
        method: 'DELETE',
        body: { mode: 'raw', raw: '' },
      });
      return receipt(204);
    }
    return receipt(204);
  });
  assert.equal(await client.list('A__dlm', 0), undefined);
  await client.remove(name);
  assert.equal(seen.length, 2);
});

test('writer publishes data360/relationship/<Name>.relationship-meta.json and guards overwrite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'relationship-writer-'));
  const first = await writeNativeRelationshipDocument(document, root, false);
  assert.equal(
    first.path,
    path.join(root, 'data360', 'relationship', `${name}.relationship-meta.json`),
  );
  assert.equal(first.outcome, 'retrieved');
  assert.deepEqual(JSON.parse(await readFile(first.path, 'utf8')), document);
  const repeat = await writeNativeRelationshipDocument(document, root, false);
  assert.equal(repeat.outcome, 'unchanged');
  const changed = { ...document, spec: { ...spec, cardinality: 'OneToOne' } };
  await assert.rejects(
    writeNativeRelationshipDocument(changed, root, false),
    code('OVERWRITE_REQUIRED'),
  );
  const replaced = await writeNativeRelationshipDocument(changed, root, true);
  assert.equal(replaced.outcome, 'retrieved');
  const inputs = await readDeployInputs({ cwd: root, metadata: [`relationship:${name}`] });
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].document, changed);
});
