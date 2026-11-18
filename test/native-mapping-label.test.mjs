import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNativeMapping,
  validateNativeMappingDocument,
} from '../lib/artifacts/native-mapping-document.js';
import { deployNativeMapping, labelRetrievedMappings } from '../lib/services/native-mapping.js';
import { executeMapping, preflightMapping } from '../lib/services/command-native-mapping.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import Retrieve from '../lib/commands/data360/retrieve.js';

const names = [
  'Id__c',
  'Name__c',
  'DataSource__c',
  'DataSourceObject__c',
  'InternalOrganization__c',
  'KQ_Id__c',
];
const system = new Set(names.slice(2));
const pair = (name) => ({
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
  developerName: `target_${name}`,
});
const raw = (fields = names) => ({
  developerName: 'TargetGenerated_123',
  sourceEntityDeveloperName: 'Example__dll',
  targetEntityDeveloperName: 'Example__dlm',
  status: 'ACTIVE',
  fieldMappings: fields.map((name) => pair(name)),
});
const desired = (label, fields = names) => {
  const document = normalizeNativeMapping(raw(fields));
  document.identity.apiName = 'SourceGenerated_456';
  for (const field of document.spec.fieldMappings) delete field.developerName;
  if (label !== undefined) document.spec.label = label;
  return document;
};
const source = () => ({
  name: 'Example__dll',
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: names.map((name) => ({
    name,
    label: name,
    dataType: 'Text',
    isPrimaryKey: name === 'Id__c',
  })),
});
const target = () => ({
  name: 'Example__dlm',
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  fields: names.map((name) => ({
    name,
    label: name,
    type: 'Text',
    isPrimaryKey: name === 'Id__c',
    creationType: system.has(name) ? 'System' : 'Custom',
    isMapped: true,
    ...(name === 'Id__c' ? { keyQualifierName: 'KQ_Id' } : {}),
    ...(name === 'KQ_Id__c' ? { usageTag: 'KeyQualifier' } : {}),
  })),
});
const dependencies = () => ({
  source: { get: async () => source() },
  target: { get: async () => target() },
});
/**
 * One pair as readMetadata returns it: booleans as text (it also leaves out the KQ pair).
 * @param {string} name Field name on both sides.
 * @returns {object} Metadata API pair.
 */
const metadataPair = (name) => ({
  creationType: system.has(name) ? 'System' : 'Custom',
  filterApplied: 'false',
  filterOperationType: 'Equal',
  isSourceFormula: 'false',
  sourceField: `Example__dll.${name}`,
  targetField: `Example__dlm.${name}`,
});

/**
 * In-memory mapping transport with a Metadata API record and a call ledger.
 * @param {object} options Initial state.
 * @param {boolean} [options.exists] Whether the mapping exists.
 * @param {string} [options.label] Its Metadata API label.
 * @param {string[]} [options.fields] Its pairs.
 * @returns {object} Client, calls and record.
 */
function fixture({ exists = true, label = 'TargetGenerated_123', fields = names } = {}) {
  let state = exists ? raw(fields) : undefined;
  const calls = [];
  const schema = target();
  const record = {
    fullName: 'TargetGenerated_123',
    creationType: 'Custom',
    // A key the plugin does not model and an explicit nil, as readMetadata may return them.
    extraSetting: 'as read',
    description: { $: { 'xsi:nil': 'true' } },
    masterLabel: label,
    sourceObjectName: 'Example__dll',
    targetObjectName: 'Example__dlm',
    fieldSourceTargetMaps: fields
      .filter((name) => name !== 'KQ_Id__c')
      .map((name) => metadataPair(name)),
  };
  const client = {
    apiVersion: '68.0',
    deleteField: async (name, selector) => {
      calls.push(['unmap', name, selector]);
      const removed = state.fieldMappings.find((entry) => entry.developerName === selector);
      state.fieldMappings = state.fieldMappings.filter((entry) => entry !== removed);
      delete schema.fields.find((field) => field.name === removed.targetFieldDeveloperName)
        .isMapped;
      // readMetadata keeps listing the removed pair (the stale record the label update reads).
    },
    list: async (dmo, dlo) => {
      calls.push(['list', dmo, dlo]);
      return { objectSourceTargetMaps: state ? [structuredClone(state)] : [] };
    },
    get: async (name) => {
      calls.push(['get', name]);
      return structuredClone(state);
    },
    create: async (body) => {
      calls.push(['create', body]);
      state = raw();
      return { ...structuredClone(state), status: 'CREATING' };
    },
    update: async (name, body) => {
      calls.push(['update', name, body]);
      for (const added of body.fieldMapping) {
        state.fieldMappings.push({
          ...added,
          developerName: `fresh_${added.sourceFieldDeveloperName}`,
        });
        record.fieldSourceTargetMaps.push(metadataPair(added.sourceFieldDeveloperName));
      }
      return structuredClone(state);
    },
    remove: async () => {
      throw new Error('no delete expected');
    },
    readDefinitions: async (requested) => {
      calls.push(['readMetadata', requested]);
      return requested.includes(record.fullName) && state ? [structuredClone(record)] : [];
    },
    updateDefinition: async (definition) => {
      calls.push(['updateMetadata', structuredClone(definition)]);
      record.masterLabel = definition.masterLabel;
    },
  };
  const deps = {
    source: { get: async () => source() },
    target: { get: async () => structuredClone(schema) },
  };
  return { client, calls, record, deps };
}
const writes = (calls) =>
  calls.filter(([kind]) => ['create', 'update', 'updateMetadata', 'unmap'].includes(kind));

test('the mapping file takes an optional non-empty spec.label', () => {
  assert.equal(validateNativeMappingDocument(desired('Customer map')).spec.label, 'Customer map');
  for (const label of ['', ' padded', 7])
    assert.throws(() => validateNativeMappingDocument(desired(label)), {
      code: 'INVALID_MAPPING_DOCUMENT',
    });
});

test('retrieve adds the org label in reads of up to 10 names and leaves out the default label', async () => {
  const reads = [];
  const documents = Array.from({ length: 12 }, (_, index) => {
    const document = normalizeNativeMapping({ ...raw(), developerName: `M${index}` });
    return document;
  });
  const warnings = await labelRetrievedMappings(documents, {
    readDefinitions: async (requested) => {
      reads.push(requested);
      return requested.map((fullName) => ({
        fullName,
        // M0 still has the label Salesforce gives a mapping created without one: its own name.
        masterLabel: fullName === 'M0' ? 'M0' : `Label ${fullName}`,
      }));
    },
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    reads.map((batch) => batch.length),
    [10, 2],
  );
  assert.equal(documents[0].spec.label, undefined);
  assert.equal(documents[1].spec.label, 'Label M1');
  assert.equal(documents[11].spec.label, 'Label M11');
});

test('a failed label read leaves the label out with a warning, never failing the retrieve', async () => {
  const document = normalizeNativeMapping(raw());
  const warnings = await labelRetrievedMappings([document], {
    readDefinitions: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(document.spec.label, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^mapping:TargetGenerated_123: the label could not be read/u);
  // One warning per failed batch, naming its mappings.
  const other = normalizeNativeMapping({ ...raw(), developerName: 'Other' });
  const batch = await labelRetrievedMappings([document, other], {
    readDefinitions: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(batch.length, 1);
  assert.match(batch[0], /^mapping:TargetGenerated_123, mapping:Other: /u);
  // Without a Metadata API reader nothing is read and nothing is warned.
  assert.deepEqual(await labelRetrievedMappings([document], {}), []);
});

test('a bare mapping retrieve writes the label, and warns without failing when its read fails', async () => {
  for (const failing of [false, true]) {
    const command = Object.create(Retrieve.prototype);
    const flags = { 'api-version': 'auto', 'target-org': 'synthetic', metadata: ['mapping'] };
    command.parse = async () => ({ flags });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'org', getConnection: () => ({}) });
    command.listNativeNames = async () => ['Example__dlm'];
    command.createMappingInventoryReader = () => ({});
    command.listNativeMappingNames = async () => ['TargetGenerated_123'];
    command.createSsotSender = () => ({});
    const reads = [];
    command.createMappingClient = () => ({
      readDefinitions: async (requested) => {
        reads.push(requested);
        if (failing) throw new Error('offline');
        return [{ fullName: 'TargetGenerated_123', masterLabel: 'Customer map' }];
      },
    });
    command.createDloClient = () => ({ get: async (name) => ({ name }) });
    command.createDmoClient = () => ({ get: async (name) => ({ name }) });
    command.acquireNativeMapping = async () => normalizeNativeMapping(raw());
    const written = [];
    command.writeNativeMapping = async (document) => {
      written.push(document);
      return { path: 'TargetGenerated_123.mapping-meta.json', outcome: 'retrieved' };
    };
    const previous = process.exitCode;
    let result;
    try {
      result = await command.run();
    } finally {
      process.exitCode = previous;
    }
    assert.deepEqual(reads, [['TargetGenerated_123']]);
    assert.equal(written.length, 1);
    assert.equal(written[0].spec.label, failing ? undefined : 'Customer map');
    assert.equal(result.status, 'success');
    assert.deepEqual(result.diagnostics.errors, []);
    assert.equal(
      result.diagnostics.warnings.some((warning) => warning.includes('label could not be read')),
      failing,
    );
  }
});

test('an unchanged label sends no Metadata API update', async () => {
  const { client, calls } = fixture({ label: 'Customer map' });
  const result = await deployNativeMapping(desired('Customer map'), client, dependencies());
  assert.equal(result.operation, 'noop');
  assert.deepEqual(writes(calls), []);
  // A file without a label never reads or changes the org's label.
  const plain = fixture({ label: 'Customer map' });
  const unlabelled = await deployNativeMapping(desired(), plain.client, dependencies());
  assert.equal(unlabelled.operation, 'noop');
  assert.equal(plain.calls.filter(([kind]) => kind === 'readMetadata').length, 0);
});

test('a changed label is one updateMetadata with every pair the mapping has, then read back', async () => {
  const { client, calls, record } = fixture();
  const changes = [];
  const result = await deployNativeMapping(
    desired('Customer map'),
    client,
    dependencies(),
    (change) => changes.push(change),
  );
  assert.equal(result.operation, 'update');
  const sent = writes(calls);
  assert.equal(sent.length, 1);
  // The record as read (nil left out, unknown keys kept), with the new label.
  assert.deepEqual(sent[0][1], {
    fullName: 'TargetGenerated_123',
    creationType: 'Custom',
    extraSetting: 'as read',
    masterLabel: 'Customer map',
    sourceObjectName: 'Example__dll',
    targetObjectName: 'Example__dlm',
    fieldSourceTargetMaps: names
      .filter((name) => name !== 'KQ_Id__c')
      .map((name) => ({
        ...metadataPair(name),
        filterApplied: false,
        isSourceFormula: false,
      })),
  });
  // The System pairs go along: every pair the mapping has is sent, and no other, because a
  // pair left out of the update is kept and a pair in it is added.
  assert.ok(sent[0][1].fieldSourceTargetMaps.some((entry) => entry.creationType === 'System'));
  // Planning read, fresh read right before the update, and the readback after it.
  assert.equal(calls.filter(([kind]) => kind === 'readMetadata').length, 3);
  assert.equal(calls.at(-1)[0], 'readMetadata');
  assert.equal(record.masterLabel, 'Customer map');
  assert.deepEqual(changes, [{ deleted: [], added: [], label: 'Customer map' }]);
  // The command reports a confirmed update.
  const again = fixture();
  assert.deepEqual(await executeMapping(desired('New'), again.client, dependencies()), {
    outcome: 'updated',
    mutation: 'confirmed-updated',
    diagnostics: [],
  });
});

test('a label that does not read back is unconfirmed; a refused label-only update is rejected', async () => {
  const lost = fixture();
  lost.client.updateDefinition = async () => {};
  const unconfirmed = await executeMapping(desired('Customer map'), lost.client, dependencies());
  assert.equal(unconfirmed.mutation, 'unknown');
  assert.equal(unconfirmed.diagnostics[0].code, 'MAPPING_PERSISTENCE_UNCONFIRMED');
  const refused = createMappingClient('synthetic', '68.0', undefined, undefined, {
    request: async () => {
      throw new Error('no REST expected');
    },
    metadata: async () => ({
      read: async () => ({}),
      update: async () => ({
        success: false,
        errors: { statusCode: 'FIELD_INTEGRITY_EXCEPTION', message: 'Label too long.' },
      }),
    }),
  });
  const { client } = fixture();
  client.updateDefinition = refused.updateDefinition;
  const result = await executeMapping(desired('Customer map'), client, dependencies());
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'MAPPING_LABEL_UPDATE_REJECTED');
  assert.match(result.diagnostics[0].message, /FIELD_INTEGRITY_EXCEPTION: Label too long/u);
});

test('a pair removed in the same deploy is not sent back with the label, although readMetadata still lists it', async () => {
  const { client, calls, deps, record } = fixture();
  const result = await deployNativeMapping(
    desired(
      'Customer map',
      names.filter((name) => name !== 'Name__c'),
    ),
    client,
    deps,
  );
  assert.equal(result.operation, 'update');
  assert.deepEqual(
    writes(calls).map(([kind]) => kind),
    ['unmap', 'updateMetadata'],
  );
  const sentPairs = writes(calls)[1][1].fieldSourceTargetMaps.map((entry) => entry.sourceField);
  assert.ok(record.fieldSourceTargetMaps.some((entry) => entry.sourceField.endsWith('.Name__c')));
  assert.ok(!sentPairs.includes('Example__dll.Name__c'));
  assert.deepEqual(
    sentPairs,
    names
      .filter((name) => !['Name__c', 'KQ_Id__c'].includes(name))
      .map((name) => `Example__dll.${name}`),
  );
  assert.equal(record.masterLabel, 'Customer map');
});

test('a label update that changes the pairs read back is unconfirmed', async () => {
  const { client, record } = fixture();
  client.updateDefinition = async (definition) => {
    record.masterLabel = definition.masterLabel;
    record.fieldSourceTargetMaps.push(metadataPair('Extra__c'));
  };
  const result = await executeMapping(desired('Customer map'), client, dependencies());
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'MAPPING_PERSISTENCE_UNCONFIRMED');
});

test('a used-up request limit is not a label refusal and asks for no file change', async () => {
  const limited = createMappingClient('synthetic', '68.0', undefined, undefined, {
    request: async () => ({}),
    metadata: async () => ({
      read: async () => ({}),
      update: async () => {
        throw Object.assign(new Error('limit'), { name: 'sf:REQUEST_LIMIT_EXCEEDED' });
      },
    }),
  });
  const { client } = fixture();
  client.updateDefinition = limited.updateDefinition;
  const result = await executeMapping(desired('Customer map'), client, dependencies());
  assert.equal(result.diagnostics[0].code, 'MAPPING_REQUEST_UNCONFIRMED');
  assert.match(result.diagnostics[0].message, /REQUEST_LIMIT_EXCEEDED/u);
  assert.doesNotMatch(result.diagnostics[0].message, /spec\.label/u);
});

test('a label refused after a pair write is reported with its code and an unknown mutation', async () => {
  const { client, calls } = fixture({ fields: names.filter((name) => name !== 'Name__c') });
  client.updateDefinition = async () => {
    const { NativeMappingError } = await import('../lib/artifacts/native-mapping-document.js');
    throw new NativeMappingError('MAPPING_LABEL_UPDATE_REJECTED');
  };
  const result = await executeMapping(desired('Customer map'), client, dependencies());
  assert.equal(calls.filter(([kind]) => kind === 'update').length, 1);
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'MAPPING_LABEL_UPDATE_REJECTED');
});

test('a create with a label sets it on the created mapping after the pairs settle', async () => {
  const { client, calls, record } = fixture({ exists: false });
  const result = await deployNativeMapping(desired('Customer map'), client, dependencies());
  assert.equal(result.operation, 'create');
  const sent = writes(calls);
  assert.deepEqual(
    sent.map(([kind]) => kind),
    ['create', 'updateMetadata'],
  );
  // The create body carries no label; Salesforce ignores one there.
  assert.equal('label' in sent[0][1], false);
  assert.equal(sent[1][1].fullName, 'TargetGenerated_123');
  assert.equal(record.masterLabel, 'Customer map');
});

test('preview shows the planned label change and writes nothing', async () => {
  const existing = fixture({ label: 'Old label' });
  const preview = await preflightMapping(desired('Customer map'), existing.client, dependencies());
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.labelChange, { from: 'Old label', to: 'Customer map' });
  assert.deepEqual(preview.plan, []);
  assert.deepEqual(writes(existing.calls), []);
  const absent = fixture({ exists: false });
  const created = await preflightMapping(desired('Customer map'), absent.client, dependencies());
  assert.equal(created.outcome, 'create');
  assert.deepEqual(created.labelChange, { to: 'Customer map' });
  assert.deepEqual(writes(absent.calls), []);
  assert.equal(absent.calls.filter(([kind]) => kind === 'readMetadata').length, 0);
  const same = fixture({ label: 'Customer map' });
  const unchanged = await preflightMapping(desired('Customer map'), same.client, dependencies());
  assert.equal(unchanged.outcome, 'unchanged');
  assert.equal('labelChange' in unchanged, false);
});

test('the mapping client reads ObjectSourceTargetMap 10 names at a time on the bound Connection', async () => {
  const reads = [];
  const client = createMappingClient('synthetic', '68.0', undefined, undefined, {
    request: async () => ({}),
    metadata: async () => ({
      read: async (type, requested) => {
        reads.push([type, requested.length]);
        return requested.map((fullName) => ({ fullName, masterLabel: fullName }));
      },
      update: async () => ({ success: true }),
    }),
  });
  const found = await client.readDefinitions(Array.from({ length: 11 }, (_, index) => `M${index}`));
  assert.equal(found.length, 11);
  assert.deepEqual(reads, [
    ['ObjectSourceTargetMap', 10],
    ['ObjectSourceTargetMap', 1],
  ]);
  await client.updateDefinition({ fullName: 'M0', masterLabel: 'x' });
  await assert.rejects(client.readDefinitions(['bad name']), { code: 'INVALID_MAPPING_NAME' });
});
