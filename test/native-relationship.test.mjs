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
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

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
  c__dataSpace: 'default',
  identity: { apiName: name },
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
    // A CRM target (owner SObject): any object and field API name.
    { ...spec, targetObjectName: 'Account', targetFieldName: 'Id', relationshipOwner: 'SObject' },
    { ...spec, targetObjectName: 'B' },
    // The label is optional.
    { ...spec, label: 'Order to customer' },
  ])
    validateNativeRelationshipDocument({ ...document, spec: value });
  for (const broken of [
    { ...document, kind: 'mapping' },
    { ...document, schemaVersion: 2 },
    { ...document, extra: true },
    { ...document, identity: { apiName: '1bad' } },
    { ...document, spec: { ...spec, sourceObjectName: 'A__dll' } },
    { ...document, spec: { ...spec, targetObjectName: 'Acc ount' } },
    { ...document, spec: { ...spec, targetFieldName: '1Id' } },
    { ...document, spec: { ...spec, sourceFieldName: 'BRef' } },
    { ...document, spec: { ...spec, targetFieldName: 'Id__c ' } },
    { ...document, spec: { ...spec, cardinality: '' } },
    { ...document, spec: { ...spec, relationshipOwner: 7 } },
    { ...document, spec: { ...spec, id: '0ge' } },
    { ...document, spec: { ...spec, label: '' } },
    { ...document, spec: { ...spec, label: 7 } },
  ])
    assert.throws(
      () => validateNativeRelationshipDocument(broken),
      code('INVALID_RELATIONSHIP_DOCUMENT'),
    );
  // The data space is the top-level c__dataSpace; the old identity.dataSpace is refused.
  assert.throws(
    () => validateNativeRelationshipDocument({ ...document, c__dataSpace: ' default' }),
    code('INVALID_DATASPACE_FIELD'),
  );
  assert.throws(
    () =>
      validateNativeRelationshipDocument({
        ...document,
        identity: { apiName: name, dataSpace: 'default' },
      }),
    code('LEGACY_DATASPACE_KEY'),
  );
});

test('a relationship to a CRM object (owner SObject) normalizes into a valid file', () => {
  const crm = wire({
    targetObjectName: 'Account',
    targetFieldName: 'Id',
    relationshipOwner: 'SObject',
  });
  crm.targetField = { label: 'Account ID', name: 'Id', type: 'SObjectField' };
  crm.targetObject = { ...crm.targetObject, label: 'Account' };
  const normalized = normalizeNativeRelationship(crm, 'default');
  assert.deepEqual(normalized.spec, {
    ...spec,
    targetObjectName: 'Account',
    targetFieldName: 'Id',
    relationshipOwner: 'SObject',
  });
  assert.deepEqual(validateNativeRelationshipDocument(normalized), normalized);
});

test('normalization keeps the authored binding and drops id, labels, status and creation type', () => {
  assert.deepEqual(normalizeNativeRelationship(wire({ status: 'CREATING' }), 'default'), document);
  const other = normalizeNativeRelationship(wire(), 'other');
  assert.deepEqual(other.identity, { apiName: name });
  assert.equal(other.c__dataSpace, 'other');
  const missing = wire();
  delete missing.owner;
  assert.throws(
    () => normalizeNativeRelationship(missing, 'default'),
    code('INVALID_RELATIONSHIP_RESPONSE'),
  );
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
  const documents = await retrieveNativeRelationships(
    'A__dlm',
    {
      list: async () =>
        page([
          wire({ name: 'Zulu' }),
          wire({ name: 'Incoming', sourceObjectName: 'C__dlm', targetObjectName: 'A__dlm' }),
          wire({ name: 'Alpha' }),
        ]),
    },
    'default',
  );
  assert.deepEqual(
    documents.map((entry) => entry.identity.apiName),
    ['Alpha', 'Zulu'],
  );
  assert.deepEqual(documents[0].spec, spec);
});

test('retrieve saves the Metadata API label of each kept relationship', async () => {
  const names = Array.from({ length: 12 }, (_, index) => `R${String(index).padStart(2, '0')}`);
  const asked = [];
  const documents = await retrieveNativeRelationships(
    'A__dlm',
    {
      list: async () => page(names.map((entry) => wire({ name: entry }))),
      // The client batches; the service asks once for every kept name.
      readDefinitions: async (requested) => {
        asked.push(requested);
        // R11 has no Metadata API record: its file has no label.
        return requested
          .filter((entry) => entry !== 'R11')
          .map((entry) => ({ fullName: entry, masterLabel: `Label ${entry}` }));
      },
    },
    'default',
  );
  assert.deepEqual(asked, [names]);
  assert.deepEqual(documents[0].spec, { ...spec, label: 'Label R00' });
  assert.equal(Object.hasOwn(documents[11].spec, 'label'), false);
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
    // Metadata API records by name, as readMetadata returns them.
    definitions: new Map(
      entries.map((entry) => [
        entry.name,
        {
          fullName: entry.name,
          definitionCreationType: 'Custom',
          lookupFieldName: `${entry.sourceObject.name}.rel_end__c`,
          masterLabel: entry.name,
          owner: entry.owner,
          relationshipCardinality: entry.cardinality,
          sourceFieldName: `${entry.sourceObject.name}.${entry.sourceField.name}`,
          targetEntity: { $: { 'xsi:nil': 'true' } },
          targetFieldName: `${entry.targetObject.name}.${entry.targetField.name}`,
        },
      ]),
    ),
    readDefinitions: async (requested) => {
      calls.push(['read', requested]);
      return requested.flatMap((entry) =>
        client.definitions.has(entry) ? [client.definitions.get(entry)] : [],
      );
    },
    update: async (definition) => {
      calls.push(['update', definition]);
      const [object, field] = definition.sourceFieldName.split('.');
      const [targetObject, targetField] = definition.targetFieldName.split('.');
      client.definitions.set(definition.fullName, { ...definition });
      client.state = client.state.map((entry) =>
        entry.name === definition.fullName
          ? wire({
              name: entry.name,
              status: entry.status,
              cardinality: definition.relationshipCardinality,
              relationshipOwner: definition.owner,
              sourceObjectName: object,
              sourceFieldName: field,
              targetObjectName: targetObject,
              targetFieldName: targetField,
            })
          : entry,
      );
    },
    list: async (dmo, offset) => {
      calls.push(['list', dmo, offset]);
      return client.state.length === 0 ? undefined : page(client.state);
    },
    create: async (body) => {
      calls.push(['create', body]);
      client.state.push(wire({ status: 'CREATING' }));
      client.definitions.set(name, {
        fullName: name,
        masterLabel: name,
        owner: body.relationshipOwner,
        relationshipCardinality: body.cardinality,
        sourceFieldName: `${body.sourceObjectName}.${body.sourceFieldName}`,
        targetFieldName: `${body.targetObjectName}.${body.targetFieldName}`,
      });
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
  assert.deepEqual(await deployNativeRelationship({ ...document }, client, 'default'), {
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
  assert.deepEqual(await deployNativeRelationship(document, client, 'default'), {
    operation: 'create',
    apiName: name,
  });
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'create'),
    [['create', spec]],
  );
  assert.equal(reads, 3);
});

test('deploy updates a changed relationship with one Metadata API update of the whole record', async () => {
  const { client, calls } = fakeClient([wire({ cardinality: 'OneToOne' })]);
  assert.deepEqual(await deployNativeRelationship(document, client, 'default'), {
    operation: 'update',
    apiName: name,
  });
  const updates = calls.filter(([kind]) => kind === 'update');
  assert.equal(updates.length, 1);
  // The org's record with the file's values; the explicit nil targetEntity is not sent back.
  assert.deepEqual(updates[0][1], {
    fullName: name,
    definitionCreationType: 'Custom',
    lookupFieldName: 'A__dlm.rel_end__c',
    masterLabel: name,
    owner: 'DataCloud',
    relationshipCardinality: 'ManyToOne',
    sourceFieldName: 'A__dlm.BRef__c',
    targetFieldName: 'B__dlm.Id__c',
  });
  assert.ok(!calls.some(([kind]) => kind === 'create'));
  // Read back through the relationship list: the repeat is a no-op.
  assert.deepEqual(await deployNativeRelationship(document, client, 'default'), {
    operation: 'noop',
    apiName: name,
  });
});

test('deploy finds the file by its name first, so a changed source field is an update', async () => {
  const { client, calls } = fakeClient([wire({ sourceFieldName: 'Other__c' })]);
  const plan = await preflightNativeRelationship(document, client, 'default');
  assert.deepEqual(
    [plan.operation, plan.existing, plan.changes],
    ['update', name, ['sourceFieldName']],
  );
  assert.equal(plan.definition.sourceFieldName, 'A__dlm.BRef__c');
  assert.ok(!calls.some(([kind]) => kind === 'update'), 'preview never writes');
});

test('a stated label is compared with the Metadata API label and updated when it differs', async () => {
  const labelled = { ...document, spec: { ...spec, label: 'Order to customer' } };
  const { client, calls } = fakeClient([wire()]);
  const plan = await preflightNativeRelationship(labelled, client, 'default');
  assert.deepEqual([plan.operation, plan.changes], ['update', ['label']]);
  assert.deepEqual(await deployNativeRelationship(labelled, client, 'default'), {
    operation: 'update',
    apiName: name,
  });
  assert.equal(calls.find(([kind]) => kind === 'update')[1].masterLabel, 'Order to customer');
  calls.length = 0;
  assert.deepEqual(await deployNativeRelationship(labelled, client, 'default'), {
    operation: 'noop',
    apiName: name,
  });
  assert.deepEqual(calls, [
    ['list', 'A__dlm', 0],
    ['read', [name]],
  ]);
  // Without a label the deploy never reads the Metadata API.
  calls.length = 0;
  await deployNativeRelationship(document, client, 'default');
  assert.deepEqual(calls, [['list', 'A__dlm', 0]]);
});

test('a create with a label sets it after the relationship is ACTIVE', async () => {
  const labelled = { ...document, spec: { ...spec, label: 'Order to customer' } };
  const { client, calls } = fakeClient([]);
  const list = client.list;
  client.list = async (...arguments_) => {
    client.state = client.state.map((entry) => ({ ...entry, status: 'ACTIVE' }));
    return list(...arguments_);
  };
  assert.deepEqual(await deployNativeRelationship(labelled, client, 'default'), {
    operation: 'create',
    apiName: name,
  });
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'create' || kind === 'update').map(([kind]) => kind),
    ['create', 'update'],
  );
  assert.equal(client.definitions.get(name).masterLabel, 'Order to customer');
});

test('an update that never reads back is unconfirmed', async () => {
  const { client } = fakeClient([wire({ cardinality: 'OneToOne' })]);
  client.update = async () => {};
  await assert.rejects(
    deployNativeRelationship(document, client, 'default'),
    code('RELATIONSHIP_PERSISTENCE_UNCONFIRMED'),
  );
});

test('deploy reports an unconfirmed create when the relationship never turns ACTIVE', async () => {
  const { client, calls } = fakeClient([]);
  await assert.rejects(
    deployNativeRelationship(document, client, 'default'),
    code('RELATIONSHIP_PERSISTENCE_UNCONFIRMED'),
  );
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
});

test('deploy refuses a data space other than the request scope and an ambiguous binding', async () => {
  const { client } = fakeClient([]);
  await assert.rejects(
    preflightNativeRelationship({ ...document, c__dataSpace: 'other' }, client, 'default'),
    (error) =>
      error.code === 'UNSUPPORTED_RELATIONSHIP_DATASPACE' &&
      // The explanation names the file's data space and the run's.
      / names the data space other in c__dataSpace, but the run's data space is default /u.test(
        error.message,
      ),
  );
  const twice = fakeClient([wire({ name: 'One' }), wire({ name: 'Two' })]);
  await assert.rejects(
    preflightNativeRelationship(document, twice.client, 'default'),
    code('AMBIGUOUS_RELATIONSHIP_TARGET'),
  );
});

test('execution surfaces the Salesforce 400 of the create as a rejected write', async () => {
  const { client } = fakeClient([]);
  client.create = async () => {
    throw new NativeRelationshipError('RELATIONSHIP_HTTP_ERROR', 400);
  };
  const result = await executeRelationship(document, client, 'default');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'RELATIONSHIP_HTTP_ERROR');
  const unchanged = await executeRelationship(document, fakeClient([wire()]).client, 'default');
  assert.deepEqual(
    [unchanged.outcome, unchanged.mutation, unchanged.targetApiName],
    ['unchanged', 'not-attempted', name],
  );
  const updated = await executeRelationship(
    document,
    fakeClient([wire({ cardinality: 'OneToOne' })]).client,
    'default',
  );
  assert.deepEqual(
    [updated.outcome, updated.mutation, updated.targetApiName],
    ['updated', 'confirmed-updated', name],
  );
});

test('execution surfaces Salesforce refusing the update as rejected, nothing written', async () => {
  const refusing = fakeClient([wire({ cardinality: 'OneToOne' })]).client;
  refusing.update = async () => {
    throw new NativeRelationshipError('RELATIONSHIP_UPDATE_REJECTED');
  };
  const refused = await executeRelationship(document, refusing, 'default');
  assert.deepEqual([refused.outcome, refused.mutation], ['failed', 'rejected']);
  assert.equal(refused.diagnostics[0].code, 'RELATIONSHIP_UPDATE_REJECTED');
  assert.match(refused.diagnostics[0].message, /nothing was written/u);
  // After a create, a refused label leaves the outcome unknown: the relationship exists.
  const labelled = { ...document, spec: { ...spec, label: 'Order to customer' } };
  const created = fakeClient([]).client;
  const list = created.list;
  created.list = async (...arguments_) => {
    created.state = created.state.map((entry) => ({ ...entry, status: 'ACTIVE' }));
    return list(...arguments_);
  };
  created.update = refusing.update;
  const partial = await executeRelationship(labelled, created, 'default');
  assert.deepEqual([partial.outcome, partial.mutation], ['failed', 'unknown']);
  assert.match(partial.diagnostics[0].message, /was created, but its label was not set/u);
});

test('delete is unchanged when absent and confirms absence after one DELETE', async () => {
  const absent = fakeClient([wire({ name: 'Other', targetFieldName: 'Other__c' })]);
  assert.deepEqual(await deleteNativeRelationship(name, document, absent.client, 'default'), {
    outcome: 'unchanged',
  });
  assert.ok(!absent.calls.some(([kind]) => kind === 'remove'));
  const present = fakeClient([wire()]);
  assert.deepEqual(await deleteNativeRelationship(name, document, present.client, 'default'), {
    outcome: 'deleted',
  });
  assert.deepEqual(
    present.calls.map(([kind]) => kind),
    ['list', 'remove', 'list'],
  );
});

test('delete refuses the file binding under another name and never deletes it', async () => {
  const renamed = fakeClient([wire({ name: 'Org_Generated_2' })]);
  await assert.rejects(
    deleteNativeRelationship(name, document, renamed.client, 'default'),
    (error) => {
      assert.equal(error.code, 'RELATIONSHIP_NAME_MISMATCH');
      return true;
    },
  );
  assert.ok(!renamed.calls.some(([kind]) => kind === 'remove'));
  const preview = fakeClient([wire({ name: 'Org_Generated_2' })]);
  await assert.rejects(
    preflightDeleteNativeRelationship(name, document, preview.client, 'default'),
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
    deployNativeRelationship(document, client, 'default'),
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
    preflightDeleteNativeRelationship(name, document, other.client, 'default'),
    code('RELATIONSHIP_TARGET_BINDING_MISMATCH'),
  );
  await assert.rejects(
    preflightDeleteNativeRelationship('Different', document, other.client, 'default'),
    code('RELATIONSHIP_FILE_IDENTITY_MISMATCH'),
  );
  const stuck = fakeClient([wire()]);
  stuck.client.remove = async () => {};
  await assert.rejects(
    deleteNativeRelationship(name, document, stuck.client, 'default'),
    code('RELATIONSHIP_DELETION_UNCONFIRMED'),
  );
});

test('bound sender carries GET and DELETE on the exact routes, once each', async () => {
  const requests = [];
  const sender = {
    request: async (method, route, noContent) => {
      requests.push([method, route]);
      return method === 'GET' && route.includes('Empty__dlm') ? noContent : page([wire()]);
    },
  };
  const client = createRelationshipClient('target', 'auto', 'default', sender);
  assert.equal(client.apiVersion, '68.0');
  assert.deepEqual(await client.list('A__dlm', 0), page([wire()]));
  assert.equal(await client.list('Empty__dlm', 200), undefined);
  await client.remove(name);
  const scoped = createRelationshipClient('target', '68.0', 'other', sender);
  await scoped.list('A__dlm', 0);
  assert.deepEqual(requests, [
    // Every request names the run's data space, default too.
    [
      'GET',
      '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?dataspace=default&limit=200&offset=0',
    ],
    [
      'GET',
      '/services/data/v68.0/ssot/data-model-objects/Empty__dlm/relationships?dataspace=default&limit=200&offset=200',
    ],
    [
      'DELETE',
      `/services/data/v68.0/ssot/data-model-objects/relationships/${name}?dataspace=default`,
    ],
    [
      'GET',
      '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?dataspace=other&limit=200&offset=0',
    ],
  ]);
  await assert.rejects(client.remove('bad/name'), code('INVALID_RELATIONSHIP_NAME'));
  await assert.rejects(client.list('A__dll', 0), code('INVALID_RELATIONSHIP_BINDING'));
});

test('Metadata API read and update go over the bound sender, ten names per read', async () => {
  const calls = [];
  let answer = { fullName: name, success: true, errors: [] };
  const sender = {
    request: async () => assert.fail('no REST call'),
    metadata: async () => ({
      read: async (type, names) => {
        calls.push(['read', type, names]);
        // One record answers as an object; an unknown name as an empty record.
        return names.length === 1
          ? { fullName: names[0] }
          : [...names.map((entry) => ({ fullName: entry })), {}];
      },
      update: async (type, definition) => {
        calls.push(['update', type, definition.fullName]);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    }),
  };
  const client = createRelationshipClient('target', '68.0', 'default', sender);
  const names = Array.from({ length: 11 }, (_, index) => `R${index}`);
  const definitions = await client.readDefinitions(names);
  assert.equal(definitions.length, 11);
  assert.deepEqual(
    calls.map(([kind, type, value]) => [kind, type, value.length]),
    [
      ['read', 'FieldSrcTrgtRelationship', 10],
      ['read', 'FieldSrcTrgtRelationship', 1],
    ],
  );
  await client.update({ fullName: name });
  answer = {
    fullName: name,
    success: false,
    errors: { statusCode: 'UNKNOWN_EXCEPTION', message: 'An unexpected error occurred.' },
  };
  await assert.rejects(client.update({ fullName: name }), (error) => {
    assert.equal(error.code, 'RELATIONSHIP_UPDATE_REJECTED');
    return true;
  });
  const refused = await client.update({ fullName: name }).catch((error) => error);
  assert.match(
    operationDiagnostic(refused, ''),
    /refused the Metadata API update of the relationship .*UNKNOWN_EXCEPTION: An unexpected error occurred\..*Nothing was changed/u,
  );
  // Client faults are refusals; server and other faults may follow an applied update.
  for (const [fault, expected] of [
    ['soapenv:Client', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:INVALID_CROSS_REFERENCE_KEY', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:MALFORMED_ID', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:REQUEST_LIMIT_EXCEEDED', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:INSUFFICIENT_ACCESS', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:API_DISABLED_FOR_ORG', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['sf:UNSUPPORTED_API_VERSION', 'RELATIONSHIP_UPDATE_REJECTED'],
    ['soapenv:Server', 'RELATIONSHIP_REQUEST_UNCONFIRMED'],
    ['sf:UNKNOWN_EXCEPTION', 'RELATIONSHIP_REQUEST_UNCONFIRMED'],
    ['sf:SOME_OTHER_FAULT', 'RELATIONSHIP_REQUEST_UNCONFIRMED'],
  ]) {
    answer = Object.assign(new Error('fault'), { name: fault });
    const before = calls.length;
    await assert.rejects(client.update({ fullName: name }), code(expected), fault);
    assert.equal(calls.length, before + 1, `${fault} is sent once`);
  }
  // A success:false validation answer is a refusal.
  answer = {
    fullName: name,
    success: false,
    errors: { statusCode: 'FIELD_INTEGRITY_EXCEPTION', message: 'Not a valid field.' },
  };
  await assert.rejects(client.update({ fullName: name }), code('RELATIONSHIP_UPDATE_REJECTED'));
  answer = new Error('socket hang up');
  await assert.rejects(client.update({ fullName: name }), code('RELATIONSHIP_REQUEST_UNCONFIRMED'));
  await assert.rejects(client.update({ fullName: 'bad/name' }), code('INVALID_RELATIONSHIP_NAME'));
  // Without a bound sender, there are no Metadata API calls.
  assert.equal(createRelationshipClient('target', '68.0', 'default').update, undefined);
});

test('bound failures map to typed HTTP errors without a retry', async () => {
  for (const [error, expected, status] of [
    [new ConnectError('REQUEST_FAILED', 400), 'RELATIONSHIP_HTTP_ERROR', 400],
    [new ConnectError('AUTHENTICATION_FAILED'), 'RELATIONSHIP_HTTP_ERROR', 401],
    [new ConnectError('REQUEST_FAILED'), 'RELATIONSHIP_REQUEST_UNCONFIRMED', undefined],
  ]) {
    let attempts = 0;
    const client = createRelationshipClient('target', '68.0', 'default', {
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

test('create posts one body to the source DMO over the bound sender, once, and surfaces a 400', async () => {
  const sent = [];
  const sender = {
    request: async (method, route, noContent, body) => {
      sent.push({ route, method, body });
      if (sent.length === 1) return { relationships: [wire({ status: 'CREATING' })] };
      throw new ConnectError('REQUEST_FAILED', 400);
    },
  };
  const client = createRelationshipClient('target', '68.0', 'default', sender);
  assert.deepEqual(await client.create(spec), { relationships: [wire({ status: 'CREATING' })] });
  await assert.rejects(client.create(spec), (error) => {
    assert.equal(error.code, 'RELATIONSHIP_HTTP_ERROR');
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], {
    route: '/services/data/v68.0/ssot/data-model-objects/A__dlm/relationships?dataspace=default',
    method: 'POST',
    body: { relationships: [spec] },
  });
  await assert.rejects(
    client.create({ ...spec, sourceObjectName: 'A' }),
    code('INVALID_RELATIONSHIP_DOCUMENT'),
  );
  assert.equal(sent.length, 2);
  assert.throws(
    () => createRelationshipClient('-target', undefined, 'default'),
    code('UNSUPPORTED_RELATIONSHIP_SELECTION'),
  );
});

test('a create answered 204 is empty; a malformed answer is invalid', async () => {
  const answers = [undefined, []];
  const client = createRelationshipClient('target', '68.0', 'default', {
    request: async (method, route, noContent) => answers.shift() ?? noContent,
  });
  assert.equal(await client.create(spec), undefined);
  await assert.rejects(client.create(spec), code('INVALID_RELATIONSHIP_RESPONSE'));
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

/**
 * A fake client whose update goes through the real Metadata API transport: each answer in turn
 * (`ok` applies the update to the fake org).
 * @param {string[]} answers `ok`, `unexpected`, `refused`, or a `server`/`client` SOAP fault per
 *   update call.
 * @returns {object} Client, calls and update count.
 */
const metadataAnswers = (answers) => {
  const { client, calls } = fakeClient([wire({ cardinality: 'OneToOne' })]);
  const apply = client.update;
  let sent = 0;
  const sender = {
    request: async () => assert.fail('no REST call'),
    metadata: async () => ({
      read: async () => assert.fail('reads go through the fake client'),
      update: async (_type, definition) => {
        const answer = answers[sent++];
        if (answer === 'server' || answer === 'client')
          throw Object.assign(new Error('fault'), {
            name: answer === 'server' ? 'soapenv:Server' : 'soapenv:Client',
          });
        if (answer === 'ok') {
          await apply(definition);
          return { fullName: definition.fullName, success: true, errors: [] };
        }
        return {
          fullName: definition.fullName,
          success: false,
          errors:
            answer === 'unexpected'
              ? {
                  statusCode: 'UNKNOWN_EXCEPTION',
                  message:
                    'An unexpected error occurred. Please include this ErrorId if you contact support: 1-2 (3)',
                }
              : { statusCode: 'FIELD_INTEGRITY_EXCEPTION', message: 'Not a valid field.' },
        };
      },
    }),
  };
  client.update = createRelationshipClient('target', '68.0', 'default', sender).update;
  return { client, calls, sent: () => sent };
};

test('an unexpected-error update on an unchanged org is sent once more and then succeeds', async () => {
  const { client, sent } = metadataAnswers(['unexpected', 'ok']);
  assert.deepEqual(await deployNativeRelationship(document, client, 'default'), {
    operation: 'update',
    apiName: name,
  });
  assert.equal(sent(), 2);
  const result = await executeRelationship(
    document,
    metadataAnswers(['unexpected', 'ok']).client,
    'default',
  );
  assert.deepEqual([result.outcome, result.mutation], ['updated', 'confirmed-updated']);
});

test('a second unexpected error is rejected; other refusals and a changed org are never resent', async () => {
  const twice = metadataAnswers(['unexpected', 'unexpected', 'ok']);
  const rejected = await executeRelationship(document, twice.client, 'default');
  assert.deepEqual([rejected.outcome, rejected.mutation], ['failed', 'rejected']);
  assert.equal(rejected.diagnostics[0].code, 'RELATIONSHIP_UPDATE_REJECTED');
  // Salesforce's internal-error text keeps its ErrorId for a support case.
  assert.match(
    rejected.diagnostics[0].message,
    /UNKNOWN_EXCEPTION: An unexpected error occurred\. Please include this ErrorId if you contact support: 1-2 \(3\)\. Nothing was changed/u,
  );
  assert.equal(twice.sent(), 2);
  const other = metadataAnswers(['refused', 'ok']);
  await assert.rejects(
    deployNativeRelationship(document, other.client, 'default'),
    code('RELATIONSHIP_UPDATE_REJECTED'),
  );
  assert.equal(other.sent(), 1);
  // The org changed between the refusal and the re-read: no resend, outcome unknown.
  const changed = metadataAnswers(['unexpected', 'ok']);
  const read = changed.client.readDefinitions;
  let reads = 0;
  changed.client.readDefinitions = async (names) => {
    const found = await read(names);
    return found.map((entry) =>
      ++reads > 1 ? { ...entry, masterLabel: 'Changed elsewhere' } : entry,
    );
  };
  const unknown = await executeRelationship(document, changed.client, 'default');
  assert.deepEqual([unknown.outcome, unknown.mutation], ['failed', 'unknown']);
  assert.equal(unknown.diagnostics[0].code, 'RELATIONSHIP_PERSISTENCE_UNCONFIRMED');
  assert.match(unknown.diagnostics[0].message, /unexpected error, but the relationship changed/u);
  assert.equal(changed.sent(), 1);
});

test('a server fault on update is unconfirmed and never resent; a client fault is rejected', async () => {
  const server = metadataAnswers(['server', 'ok']);
  const unknown = await executeRelationship(document, server.client, 'default');
  assert.deepEqual([unknown.outcome, unknown.mutation], ['failed', 'unknown']);
  assert.equal(unknown.diagnostics[0].code, 'RELATIONSHIP_REQUEST_UNCONFIRMED');
  assert.equal(server.sent(), 1);
  const client = metadataAnswers(['client', 'ok']);
  const rejected = await executeRelationship(document, client.client, 'default');
  assert.deepEqual([rejected.outcome, rejected.mutation], ['failed', 'rejected']);
  assert.equal(rejected.diagnostics[0].code, 'RELATIONSHIP_UPDATE_REJECTED');
  assert.equal(client.sent(), 1);
  // The one resend after an unexpected error on an unchanged org ends in a server fault: unknown.
  const resent = metadataAnswers(['unexpected', 'server', 'ok']);
  const afterResend = await executeRelationship(document, resent.client, 'default');
  assert.deepEqual([afterResend.outcome, afterResend.mutation], ['failed', 'unknown']);
  assert.equal(afterResend.diagnostics[0].code, 'RELATIONSHIP_REQUEST_UNCONFIRMED');
  assert.equal(resent.sent(), 2);
});

test('cardinality and owner that differ only in letter case are no change', async () => {
  const cased = {
    ...document,
    spec: { ...spec, cardinality: 'manytoone', relationshipOwner: 'DATACLOUD' },
  };
  const { client, calls } = fakeClient([wire()]);
  const plan = await preflightNativeRelationship(cased, client, 'default');
  assert.deepEqual([plan.operation, plan.changes ?? []], ['noop', []]);
  assert.ok(!calls.some(([kind]) => kind === 'update'));
  const other = { ...document, spec: { ...spec, cardinality: 'OneToOne' } };
  const changed = await preflightNativeRelationship(other, fakeClient([wire()]).client, 'default');
  assert.deepEqual(changed.changes, ['cardinality']);
});
