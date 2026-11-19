import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { preflightNativeDmo } from '../lib/services/native-dmo.js';
import { createMappingClient } from '../lib/transport/mapping-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { apiDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { NativeMappingError } from '../lib/artifacts/native-mapping-document.js';
import { deployNativeMapping, preflightNativeMapping } from '../lib/services/native-mapping.js';
import { executeMapping } from '../lib/services/command-native-mapping.js';
import {
  DataSpaceCheck,
  dataSpaceDirectory,
  readOrgDataSpaceEntries,
  readOrgDataSpaces,
} from '../lib/services/data-space-check.js';
import {
  createVerbatimDocument,
  isVerbatimDocument,
  parseVerbatimDocument,
  serializeVerbatimDocument,
  verbatimIdentity,
} from '../lib/artifacts/verbatim-document.js';

// D1b: DMOs, mappings and relationships carry c__dataSpace, every request names the run's data
// space, and the first mapping onto a standard DMO copy in another data space is sent once more
// in the default spelling when the copy does not exist yet (live API 68, DB entry
// data360:dataspace-identity-resolution-api68).

const SPACE = 'dataspace2';
const COPY = 'ds2_ContactPointEmail__dlm';
const ORIGINAL = 'ssot__ContactPointEmail__dlm';
const DLO = 'CliEmail__dll';
const systemSources = ['DataSource__c', 'DataSourceObject__c', 'InternalOrganization__c'];

const field = (name, creationType, extra = {}) => ({
  name,
  label: name,
  type: 'Text',
  isPrimaryKey: false,
  creationType,
  ...extra,
});

/**
 * The default-space standard DMO the copy is made from.
 * @returns {object} Native read.
 */
const original = () => ({
  name: ORIGINAL,
  label: 'Contact Point Email',
  category: 'UNASSIGNED',
  creationType: 'Standard',
  dataSpaceName: 'default',
  isEnabled: true,
  fields: [
    field('ssot__Id__c', 'Standard', { isPrimaryKey: true }),
    field('ssot__EmailAddress__c', 'Standard'),
    field('ssot__PartyId__c', 'Standard'),
    ...systemSources.map((source) => field(`ssot__${source.slice(0, -3)}Id__c`, 'Standard')),
  ],
});

/**
 * The copy in the data space, as its first mapping creates it.
 * @returns {object} Native read.
 */
const copy = () => ({
  name: COPY,
  label: 'Contact Point Email',
  category: 'OTHER',
  creationType: 'Standard',
  dataSpaceName: SPACE,
  isEnabled: true,
  fields: [
    field('Id__c', 'Standard', { isPrimaryKey: true, keyQualifierName: 'KQ_Id' }),
    field('EmailAddress__c', 'Standard'),
    field('PartyId__c', 'Standard'),
    ...systemSources.map((source) => field(`${source.slice(0, -3)}Id__c`, 'Standard')),
    field('KQ_Id__c', 'System', { usageTag: 'KeyQualifier' }),
  ],
});

/**
 * The mapping Salesforce stores for a create body: under the copy, with its field names and the
 * generated pairs added.
 * @param {object} body Create body.
 * @returns {object} Native mapping.
 */
const stored = (body) => ({
  developerName: 'CliEmail_map_ds2_ContactPointEmail_1',
  sourceEntityDeveloperName: body.sourceEntityDeveloperName,
  targetEntityDeveloperName: COPY,
  dataSpaceName: SPACE,
  status: 'ACTIVE',
  // Salesforce stores the pairs under the copy's field names and adds the generated ones.
  fieldMappings: [
    ...body.fieldMapping.map((pair) => ({
      sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
      targetFieldDeveloperName: pair.targetFieldDeveloperName.replace(/^ssot__/u, ''),
      developerName: `sel_${pair.sourceFieldDeveloperName}`,
    })),
    ...systemSources.map((source) => ({
      sourceFieldDeveloperName: source,
      targetFieldDeveloperName: `${source.slice(0, -3)}Id__c`,
      developerName: `sel_${source}`,
    })),
    {
      sourceFieldDeveloperName: 'KQ_Id__c',
      targetFieldDeveloperName: 'KQ_Id__c',
      developerName: 'sel_KQ_Id__c',
    },
  ],
});
/**
 * Salesforce's answer as the transport keeps it: status and text.
 * @param {Error} error Typed failure.
 * @param {number} status HTTP status.
 * @param {string} message Salesforce's text.
 * @returns {Error} The same error with the answer retained.
 */
const notFound = (error, status, message) =>
  retainConnectDiagnostic(error, apiDiagnostic(status, [{ errorCode: 'NOT_FOUND', message }]));

/**
 * A data space whose standard DMO copy does not exist until its first mapping.
 * @param {object} [options] Behaviour.
 * @param {boolean} [options.copyExists] The copy is already active in the data space.
 * @param {boolean} [options.echoDefault] The create answers in the default spelling.
 * @param {number} [options.copyStatus] HTTP status Salesforce answers the copy spelling with.
 * @param {string} [options.copyText] Salesforce's text with that answer.
 * @returns {object} Clients and the write ledger.
 */
function world({
  copyExists = false,
  echoDefault = false,
  copyStatus = 404,
  copyText = 'DMO not found for the given developer name',
} = {}) {
  const writes = [];
  const state = { active: copyExists, mapping: undefined };
  const dmo = {
    get: async (name) => {
      if (name === ORIGINAL) return original();
      if (name === COPY && state.active) return copy();
      throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    },
  };
  const dlo = {
    get: async (name) => ({
      name,
      label: 'Email source',
      category: 'Profile',
      status: 'ACTIVE',
      dataSpaceInfo: [{ name: SPACE }],
      fields: ['Id__c', 'Email__c', 'Party__c', ...systemSources, 'KQ_Id__c'].map((entry) => ({
        name: entry,
        label: entry,
        dataType: 'Text',
        isPrimaryKey: entry === 'Id__c',
      })),
    }),
  };
  const mapping = {
    apiVersion: '68.0',
    list: async () => {
      // Before activation the space-filtered list does not know the copy (404 DMO not found).
      if (!state.mapping) throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return { objectSourceTargetMaps: [structuredClone(state.mapping)] };
    },
    get: async (name) => {
      if (state.mapping?.developerName !== name)
        throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
      return structuredClone(state.mapping);
    },
    create: async (body) => {
      writes.push(body);
      if (body.targetEntityDeveloperName === COPY && !state.active)
        throw notFound(
          new NativeMappingError('MAPPING_HTTP_ERROR', copyStatus),
          copyStatus,
          copyText,
        );
      state.active = true;
      state.mapping = stored(body);
      const echo = structuredClone(state.mapping);
      if (echoDefault) {
        echo.targetEntityDeveloperName = body.targetEntityDeveloperName;
        echo.fieldMappings = echo.fieldMappings.map((pair) => {
          const sent = body.fieldMapping.find(
            (item) => item.sourceFieldDeveloperName === pair.sourceFieldDeveloperName,
          );
          return sent ? { ...pair, targetFieldDeveloperName: sent.targetFieldDeveloperName } : pair;
        });
      }
      return { ...echo, status: 'CREATING' };
    },
    update: async () => assert.fail('no mapping update expected'),
    deleteField: async () => assert.fail('no unmap expected'),
  };
  return { writes, state, mapping, deps: { source: dlo, target: dmo, dataSpacePrefix: 'ds2' } };
}

/**
 * The mapping file onto the copy, as a user writes it: the names stored in the data space.
 * @returns {object} Mapping document.
 */
const file = () => ({
  schemaVersion: 1,
  kind: 'mapping',
  c__dataSpace: SPACE,
  identity: { apiName: 'CliEmail_map_ds2_ContactPointEmail' },
  spec: {
    sourceEntityDeveloperName: DLO,
    targetEntityDeveloperName: COPY,
    fieldMappings: [
      { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' },
      { sourceFieldDeveloperName: 'Email__c', targetFieldDeveloperName: 'EmailAddress__c' },
      { sourceFieldDeveloperName: 'Party__c', targetFieldDeveloperName: 'PartyId__c' },
    ],
  },
});
const copyBody = {
  sourceEntityDeveloperName: DLO,
  targetEntityDeveloperName: COPY,
  fieldMapping: [
    { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' },
    { sourceFieldDeveloperName: 'Email__c', targetFieldDeveloperName: 'EmailAddress__c' },
    { sourceFieldDeveloperName: 'Party__c', targetFieldDeveloperName: 'PartyId__c' },
  ],
};
const defaultBody = {
  sourceEntityDeveloperName: DLO,
  targetEntityDeveloperName: ORIGINAL,
  fieldMapping: [
    { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'ssot__Id__c' },
    { sourceFieldDeveloperName: 'Email__c', targetFieldDeveloperName: 'ssot__EmailAddress__c' },
    { sourceFieldDeveloperName: 'Party__c', targetFieldDeveloperName: 'ssot__PartyId__c' },
  ],
};

test('a mapping onto a copy that does not exist yet plans the default spelling as its retry', async () => {
  const { mapping, deps, writes } = world();
  const plan = await preflightNativeMapping(file(), mapping, deps, SPACE);
  assert.equal(plan.operation, 'create');
  assert.equal(plan.activatesStandardDmo, true);
  // The create is planned as the file names it; the retry carries the default spelling.
  assert.deepEqual(plan.writes, [{ body: copyBody }]);
  assert.deepEqual(plan.activationRetry.body, defaultBody);
  assert.deepEqual(writes, []);
});

for (const echoDefault of [false, true])
  test(`the create answered 404 is sent once more in the default spelling and read back under the copy, echo default=${echoDefault}`, async () => {
    const { mapping, deps, writes, state } = world({ echoDefault });
    const result = await deployNativeMapping(file(), mapping, deps, undefined, SPACE);
    assert.equal(result.operation, 'create');
    assert.equal(result.activatesStandardDmo, true);
    assert.deepEqual(writes, [copyBody, defaultBody]);
    // Salesforce stores the mapping under the copy, and the plugin reads it back there.
    assert.equal(result.document.spec.targetEntityDeveloperName, COPY);
    assert.equal(result.document.c__dataSpace, SPACE);
    assert.equal(result.document.identity.apiName, state.mapping.developerName);
  });

test('the command reports the activated copy as created after the retry', async () => {
  const { mapping, deps, writes } = world();
  const receipt = await executeMapping(file(), mapping, deps, undefined, SPACE);
  assert.equal(receipt.outcome, 'created');
  assert.equal(receipt.mutation, 'confirmed-created');
  assert.equal(receipt.diagnostics[0].code, 'MAPPING_ACTIVATES_STANDARD_DMO');
  assert.equal(writes.length, 2);
});

test('nothing is guessed: no retry without the prefix, in default, for an existing copy or another answer', async () => {
  // Without the data space prefix the copy's 404 stands, before any write.
  const unprefixed = world();
  delete unprefixed.deps.dataSpacePrefix;
  await assert.rejects(
    preflightNativeMapping(file(), unprefixed.mapping, unprefixed.deps, SPACE),
    (error) => error instanceof NativeDmoError && error.status === 404,
  );
  // A target that does not start with the prefix is never translated.
  const other = world();
  const foreign = file();
  foreign.spec.targetEntityDeveloperName = 'ds3_ContactPointEmail__dlm';
  await assert.rejects(
    preflightNativeMapping(foreign, other.mapping, other.deps, SPACE),
    (error) => error instanceof NativeDmoError && error.status === 404,
  );
  // An existing copy is mapped as the file names it, once.
  const active = world({ copyExists: true });
  const plan = await preflightNativeMapping(file(), active.mapping, active.deps, SPACE);
  assert.equal(plan.activationRetry, undefined);
  // Another answer than 404 to the copy spelling is reported, never retried.
  const refused = world({ copyStatus: 400 });
  await assert.rejects(
    deployNativeMapping(file(), refused.mapping, refused.deps, undefined, SPACE),
    (error) => error instanceof NativeMappingError && error.status === 400,
  );
  assert.deepEqual(refused.writes, [copyBody]);
  // Without the default spelling in the org, the copy's own 404 stands.
  const missing = world();
  missing.deps.target = {
    get: async () => {
      throw new NativeDmoError('DMO_HTTP_ERROR', 404);
    },
  };
  await assert.rejects(
    preflightNativeMapping(file(), missing.mapping, missing.deps, SPACE),
    (error) => error instanceof NativeDmoError && error.status === 404,
  );
});

test('a mapping file of another data space than the run is refused before any read', async () => {
  const { mapping, deps, writes } = world();
  await assert.rejects(preflightNativeMapping(file(), mapping, deps, 'default'), {
    code: 'MAPPING_DATASPACE_MISMATCH',
  });
  assert.deepEqual(writes, []);
});

test('the data space read keeps each prefix; the check answers it from the same single read', async (t) => {
  const page = {
    dataSpaces: [
      { name: 'default', label: 'Default' },
      { name: SPACE, label: 'Space 2', prefix: 'ds2' },
      { name: 'odd', prefix: 'not a prefix!' },
    ],
    totalSize: 3,
  };
  const open = async () => ({ request: async () => structuredClone(page) });
  assert.deepEqual(await readOrgDataSpaceEntries(open), [
    { name: 'default' },
    { name: SPACE, prefix: 'ds2' },
    { name: 'odd' },
  ]);
  assert.deepEqual(await readOrgDataSpaces(open), ['default', SPACE, 'odd']);
  const original = dataSpaceDirectory.read;
  t.after(() => {
    dataSpaceDirectory.read = original;
  });
  let reads = 0;
  dataSpaceDirectory.read = async (sender) => {
    reads++;
    return readOrgDataSpaceEntries(sender);
  };
  const check = new DataSpaceCheck(open);
  await check.require([SPACE]);
  assert.equal(await check.prefixOf(SPACE), 'ds2');
  assert.equal(await check.prefixOf('default'), undefined);
  assert.equal(reads, 1);
  // A fake that answers plain names (as the offline tests do) has no prefixes.
  dataSpaceDirectory.read = async () => ['default', SPACE];
  assert.equal(await new DataSpaceCheck(open).prefixOf(SPACE), undefined);
});

test('a verbatim DMO, mapping or relationship carries c__dataSpace like its normal file', () => {
  for (const kind of ['dmo', 'mapping', 'relationship']) {
    const document = createVerbatimDocument(
      kind,
      { dataSpace: SPACE, apiName: 'Name_1' },
      'UNMODELLED_RESPONSE',
      { b: 1, a: 2 },
    );
    assert.deepEqual(Object.keys(document), [
      'schemaVersion',
      'kind',
      'c__dataSpace',
      'identity',
      'verbatim',
    ]);
    assert.deepEqual(document.identity, { apiName: 'Name_1' });
    assert.deepEqual(verbatimIdentity(document), { dataSpace: SPACE, apiName: 'Name_1' });
    const text = serializeVerbatimDocument(document);
    assert.deepEqual(parseVerbatimDocument(text), document);
    assert.ok(isVerbatimDocument(JSON.parse(text), kind));
    // The old place of the data space is not a verbatim file of these kinds.
    assert.ok(
      !isVerbatimDocument({
        schemaVersion: 1,
        kind,
        identity: { dataSpace: SPACE, apiName: 'Name_1' },
        verbatim: document.verbatim,
      }),
    );
  }
  // The kinds not converted yet keep identity.dataSpace.
  const stream = createVerbatimDocument(
    'data-stream',
    { dataSpace: 'default', apiName: 'Stream_1' },
    'UNMODELLED_RESPONSE',
  );
  assert.deepEqual(stream.identity, { dataSpace: 'default', apiName: 'Stream_1' });
  assert.equal(Object.hasOwn(stream, 'c__dataSpace'), false);
});

test('only Salesforce\'s "DMO not found" 404 triggers the default-spelling retry', async () => {
  const other = world({ copyText: 'Something else was not found' });
  await assert.rejects(
    deployNativeMapping(file(), other.mapping, other.deps, undefined, SPACE),
    (error) => error instanceof NativeMappingError && error.status === 404,
  );
  assert.deepEqual(other.writes, [copyBody]);
});

test('a field the existing copy does not have yet is taken from the default object', async () => {
  // A copy holds only mapped fields; Salesforce adds a field when a mapping names it (live: the
  // Individual copy went from 7 to 8 fields with MiddleName__c).
  for (const prefix of ['ds2', undefined]) {
    const { mapping, deps } = world({ copyExists: true });
    const read = deps.target.get;
    deps.target.get = async (name) => {
      const raw = await read(name);
      if (name === COPY) raw.fields = raw.fields.filter((entry) => entry.name !== 'PartyId__c');
      return raw;
    };
    if (prefix === undefined) delete deps.dataSpacePrefix;
    if (prefix) {
      const plan = await preflightNativeMapping(file(), mapping, deps, SPACE);
      assert.equal(plan.operation, 'create');
      assert.equal(plan.activationRetry, undefined);
      assert.deepEqual(plan.writes, [{ body: copyBody }]);
    } else
      await assert.rejects(preflightNativeMapping(file(), mapping, deps, SPACE), {
        code: 'MAPPING_FIELD_NOT_FOUND',
      });
  }
});

test('a DMO file for a standard copy that does not exist yet is refused; its first mapping creates it', async () => {
  const { deps } = world();
  const dmo = {
    schemaVersion: 1,
    kind: 'dmo',
    c__dataSpace: SPACE,
    identity: { apiName: COPY },
    spec: {
      label: 'Contact Point Email',
      category: 'Other',
      fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
    },
  };
  await assert.rejects(
    preflightNativeDmo(dmo, deps.target, SPACE, { dataSpacePrefix: 'ds2' }),
    (error) =>
      error.code === 'UNSUPPORTED_DMO_TARGET' &&
      /created by its first mapping: deploy a mapping onto ds2_ContactPointEmail__dlm/u.test(
        error.message,
      ),
  );
  // Without the prefix, or when the default spelling is not a standard DMO, it is a custom create.
  const unprefixed = await preflightNativeDmo(dmo, deps.target, SPACE);
  assert.equal(unprefixed.operation, 'create');
  const custom = {
    get: async (name) => {
      if (name === ORIGINAL) return { ...(await deps.target.get(name)), creationType: 'Custom' };
      return deps.target.get(name);
    },
  };
  const plan = await preflightNativeDmo(dmo, custom, SPACE, { dataSpacePrefix: 'ds2' });
  assert.equal(plan.operation, 'create');
  assert.equal(plan.body.dataSpaceName, SPACE);
  // A failed read of the default spelling (anything but 404) stops the preflight: no create.
  const failing = {
    get: async (name) => {
      if (name === ORIGINAL) throw new NativeDmoError('DMO_HTTP_ERROR', 500);
      return deps.target.get(name);
    },
  };
  await assert.rejects(preflightNativeDmo(dmo, failing, SPACE, { dataSpacePrefix: 'ds2' }), {
    code: 'DMO_HTTP_ERROR',
  });
});

test('both creates of the activation retry carry ?dataspace= on the wire', async () => {
  const { deps, state } = world();
  const requests = [];
  const sender = {
    request: async (method, route, noContent, body) => {
      requests.push(`${method} ${route}`);
      if (method === 'GET' && route.includes('?dataspace=dataspace2&dmoDeveloperName='))
        throw notFound(new ConnectError('REQUEST_FAILED', 404), 404, 'DMO not found');
      if (method === 'POST' && body.targetEntityDeveloperName === COPY)
        throw notFound(
          new ConnectError('REQUEST_FAILED', 404),
          404,
          'DMO not found for the given developer name',
        );
      if (method === 'POST') {
        state.mapping = stored(body);
        return { ...structuredClone(state.mapping), status: 'CREATING' };
      }
      return structuredClone(state.mapping);
    },
  };
  const client = createMappingClient(
    'target',
    '68.0',
    async () => assert.fail('no CLI'),
    SPACE,
    sender,
  );
  const result = await deployNativeMapping(file(), client, deps, undefined, SPACE);
  assert.equal(result.operation, 'create');
  const route = '/services/data/v68.0/ssot/data-model-object-mappings';
  assert.deepEqual(
    requests.filter((entry) => entry.startsWith('POST')),
    [`POST ${route}?dataspace=dataspace2`, `POST ${route}?dataspace=dataspace2`],
  );
  assert.ok(
    requests.every((entry) => entry.includes('dataspace=dataspace2')),
    requests.join(', '),
  );
});
