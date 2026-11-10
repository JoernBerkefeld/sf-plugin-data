import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import { NativeDmoError, normalizeNativeDmo } from '../lib/artifacts/native-dmo-document.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifySegmentInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { mappedFieldRemoval, preflightNativeDmo } from '../lib/services/native-dmo.js';
import {
  executeDmo,
  mappedFieldMappings,
  preflightDmo,
} from '../lib/services/command-native-dmo.js';

const apiName = 'Example__dlm';
const first = 'CliDloM1_c9d1_map_Example_1794339464151';
const second = 'OtherDlo_map_Example_1794339464999';
const allow = { allowFieldRemoval: true };
const field = (name, extra = {}) => ({
  name,
  label: name.slice(0, -3),
  type: 'Text',
  isPrimaryKey: false,
  creationType: 'Custom',
  ...extra,
});
/**
 * Synthetic custom DMO read whose named fields carry the mapped marker.
 * @param {string[]} mapped Field names reported as mapped.
 * @returns {object} Direct native read.
 */
const native = (mapped = ['Note__c', 'Link__c']) => ({
  name: apiName,
  label: 'Example',
  category: 'OTHER',
  creationType: 'Custom',
  dataSpaceName: 'default',
  fields: [
    field('Id__c', { isPrimaryKey: true }),
    ...['Note__c', 'Link__c', 'Free__c'].map((name) =>
      field(name, mapped.includes(name) ? { isMapped: true } : {}),
    ),
  ],
});
/**
 * Authored definition: the target without the named fields.
 * @param {string[]} without Field names left out of the file.
 * @returns {object} Portable document.
 */
const authored = (without) => {
  const raw = native([]);
  raw.fields = raw.fields.filter((entry) => !without.includes(entry.name));
  return normalizeNativeDmo(raw);
};
const pair = (name) => ({
  developerName: `${name}_fieldmap_${name}`,
  sourceFieldDeveloperName: name,
  targetFieldDeveloperName: name,
});
const map = (developerName, targets, target = apiName) => ({
  developerName,
  sourceEntityDeveloperName: 'CliDloM1_c9d1__dll',
  targetEntityDeveloperName: target,
  status: 'ACTIVE',
  fieldMappings: targets.map((name) => pair(name)),
});
/**
 * Recording DMO client: reads only, every write is counted.
 * @param {string[]} [mapped] Field names reported as mapped.
 * @returns {{writes: string[], client: object}} Seen writes and the client.
 */
const target = (mapped) => {
  const writes = [];
  return {
    writes,
    client: {
      get: async () => native(mapped),
      create: async () => writes.push('create'),
      update: async () => writes.push('update'),
      delete: async () => writes.push('delete'),
      removeFields: async () => writes.push('remove'),
    },
  };
};
/**
 * Recording list-only mapping inventory; any other method is absent and would throw.
 * @param {object[] | Error} maps Inventory entries, or the failure the lookup raises.
 * @returns {{lists: Array<unknown[]>, reader: object}} Seen list calls and the reader.
 */
const inventory = (maps) => {
  const lists = [];
  return {
    lists,
    reader: {
      list: async (...arguments_) => {
        lists.push(arguments_);
        if (maps instanceof Error) throw maps;
        return { objectSourceTargetMaps: maps };
      },
    },
  };
};
const guide = (reader, extra = {}) => ({
  ...allow,
  mappedFieldGuide: { mappings: () => reader, ...extra },
});
const steps = (scope, mappings, fields, perMapping) =>
  [
    `sf data360 retrieve${scope}${mappings.map((name) => ` -m mapping:${name}`).join('')} -m dmo:${apiName} --overwrite`,
    [
      ...mappings.map(
        (name) =>
          `In data360/mapping/${name}.mapping-meta.json remove the pair(s) whose targetFieldDeveloperName is ${(perMapping?.[name] ?? fields).join(', ')}; keep all other pairs.`,
      ),
      `In data360/dmo/${apiName}.dmo-meta.json remove the field(s) ${fields.join(', ')}.`,
    ].join(' '),
    `sf data360 deploy${scope}${mappings.map((name) => ` -m mapping:${name}`).join('')} -m dmo:${apiName} --allow-field-removal`,
  ].join('\n');
const unwritten = 'No write attempted; correct the reported check before another attempt.';

test('preflight collects every mapped field the file omits into one refusal', async () => {
  const { client } = target();
  let caught;
  await assert.rejects(
    preflightNativeDmo(authored(['Note__c', 'Link__c', 'Free__c']), client, undefined, allow),
    (error) => {
      caught = error;
      return error instanceof NativeDmoError && error.code === 'DMO_FIELD_REMOVAL_MAPPED';
    },
  );
  assert.deepEqual(mappedFieldRemoval(caught), { apiName, fields: ['Note__c', 'Link__c'] });
  assert.match(caught.message, /These fields are mapped: Note__c, Link__c\./u);
  // One mapped field keeps the single-field wording; unmapped omissions are not named.
  await assert.rejects(
    preflightNativeDmo(authored(['Link__c', 'Free__c']), client, undefined, allow),
    (error) => {
      assert.deepEqual(mappedFieldRemoval(error), { apiName, fields: ['Link__c'] });
      assert.match(error.message, /fields\.Link__c\.isMapped/u);
      assert.match(error.message, /This field is mapped\. Remove its pair from the mapping first/u);
      return true;
    },
  );
  // Other refusals and successful plans carry no mapped-field record.
  await assert.rejects(preflightNativeDmo(authored(['Free__c']), client), (error) => {
    assert.equal(error.code, 'UNSUPPORTED_DMO_FIELD_CHANGE');
    assert.equal(mappedFieldRemoval(error), undefined);
    return true;
  });
  const plan = await preflightNativeDmo(authored(['Free__c']), client, undefined, allow);
  assert.deepEqual(plan.removeFields, ['Free__c']);
  assert.equal(mappedFieldRemoval(new Error('other')), undefined);
  assert.equal(mappedFieldRemoval('text'), undefined);
});

test('the executor names the mapping and the exact commands, and writes nothing', async () => {
  const { writes, client } = target();
  const { lists, reader } = inventory([
    map(first, ['Id__c', 'Note__c', 'Link__c']),
    // Ignored: another target, an unsafe name, a malformed entry and a mapping without the field.
    map('Elsewhere_map', ['Note__c'], 'Other__dlm'),
    map('bad name; rm', ['Note__c']),
    // eslint-disable-next-line unicorn/no-null -- Synthetic malformed inventory entry.
    null,
    { developerName: 'NoPairs_map', targetEntityDeveloperName: apiName },
    map('Unrelated_map', ['Id__c']),
  ]);
  const outcome = await executeDmo(
    authored(['Note__c']),
    client,
    undefined,
    guide(reader, { targetOrg: 'my-org' }),
  );
  assert.deepEqual(outcome, {
    outcome: 'blocked',
    mutation: 'not-attempted',
    diagnostics: [
      {
        code: 'DMO_FIELD_REMOVAL_MAPPED',
        message: `Field removal refused for ${apiName}: Note__c is mapped by ${first}. Salesforce would drop the mapping pair(s) together with the field(s), so remove the pair(s) from the mapping file(s) and deploy the mapping(s) and the DMO in one command:\n${steps(' -o my-org', [first], ['Note__c'])}\n${unwritten}`,
        mappedFields: [{ field: 'Note__c', mappings: [first] }],
      },
    ],
  });
  assert.deepEqual(lists, [[apiName]]);
  assert.deepEqual(writes, []);
  // The message stays one string that survives JSON output unchanged.
  const { message } = outcome.diagnostics[0];
  const serialized = JSON.stringify({ message });
  assert.ok(!serialized.includes('\n'));
  assert.equal(JSON.parse(serialized).message, message);
  assert.equal(message.split('\n').length, 5);
});

test('several fields and mappings, no org and a data space are all reflected', async () => {
  const { writes, client } = target();
  const { reader } = inventory([map(first, ['Note__c', 'Link__c']), map(second, ['Link__c'])]);
  const withoutOrg = await executeDmo(
    authored(['Note__c', 'Link__c']),
    client,
    undefined,
    guide(reader),
  );
  const [diagnostic] = withoutOrg.diagnostics;
  assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
  assert.deepEqual(diagnostic.mappedFields, [
    { field: 'Note__c', mappings: [first] },
    { field: 'Link__c', mappings: [first, second] },
  ]);
  assert.ok(
    diagnostic.message.startsWith(
      `Field removal refused for ${apiName}: Note__c is mapped by ${first}; Link__c is mapped by ${first}, ${second}. `,
    ),
  );
  assert.ok(
    diagnostic.message.includes(
      `\n${steps('', [first, second], ['Note__c', 'Link__c'], { [second]: ['Link__c'] })}\n`,
    ),
    diagnostic.message,
  );
  assert.ok(!diagnostic.message.includes(' -o '));
  assert.ok(!diagnostic.message.includes('--dataspace'));
  // The data space and org are repeated as passed; a value with a space is quoted.
  let caught;
  await assert.rejects(
    preflightDmo(
      authored(['Link__c']),
      client,
      undefined,
      guide(reader, { targetOrg: 'user@example.com', dataspace: 'Team Space' }),
    ),
    (error) => {
      caught = error;
      return error.code === 'DMO_FIELD_REMOVAL_MAPPED';
    },
  );
  assert.deepEqual(mappedFieldMappings(caught), [{ field: 'Link__c', mappings: [first, second] }]);
  const scoped = await executeDmo(
    authored(['Link__c']),
    client,
    undefined,
    guide(reader, { targetOrg: 'user@example.com', dataspace: 'Team Space' }),
  );
  assert.ok(
    scoped.diagnostics[0].message.includes(
      `\n${steps(' -o user@example.com --dataspace "Team Space"', [first, second], ['Link__c'])}\n`,
    ),
    scoped.diagnostics[0].message,
  );
  // A value a shell could expand is never echoed into a command.
  const unsafe = await executeDmo(
    authored(['Link__c']),
    client,
    undefined,
    guide(reader, { targetOrg: '$(whoami)' }),
  );
  assert.ok(unsafe.diagnostics[0].message.includes('sf data360 retrieve -o <value> -m mapping:'));
  assert.ok(!unsafe.diagnostics[0].message.includes('whoami'));
  assert.deepEqual(writes, []);
});

test('a field without an identified mapping is named beside the identified ones', async () => {
  const { client } = target();
  const { reader } = inventory([map(first, ['Note__c'])]);
  const outcome = await executeDmo(
    authored(['Note__c', 'Link__c']),
    client,
    undefined,
    guide(reader),
  );
  const [diagnostic] = outcome.diagnostics;
  assert.deepEqual(diagnostic.mappedFields, [
    { field: 'Note__c', mappings: [first] },
    { field: 'Link__c', mappings: [] },
  ]);
  assert.match(diagnostic.message, /Link__c is mapped by a mapping that could not be identified/u);
  assert.ok(
    diagnostic.message.includes(
      `In data360/mapping/${first}.mapping-meta.json remove the pair(s) whose targetFieldDeveloperName is Note__c; keep all other pairs. In data360/dmo/${apiName}.dmo-meta.json remove the field(s) Note__c, Link__c. Remove the pair(s) for Link__c from the mapping that holds them in the same way.`,
    ),
  );
});

const generic = (reason, fields = 'Note__c', verb = 'is') =>
  `Field removal refused for ${apiName}: ${fields} ${verb} mapped, and Salesforce would drop the mapping pair(s) together with the field(s). The mapping could not be identified (${reason}). Retrieve the mapping, remove the pair(s) whose targetFieldDeveloperName is ${fields} from its file, then deploy the mapping and this DMO in one command with --allow-field-removal. ${unwritten}`;

test('a failed or empty lookup keeps the refusal and falls back to the generic instruction', async () => {
  const failed = 'the mapping lookup failed';
  for (const [options, reason] of [
    [guide(inventory(new Error('lookup "secret" failed')).reader, { targetOrg: 'my-org' }), failed],
    [guide(inventory('not a list').reader), failed],
    [
      {
        ...allow,
        mappedFieldGuide: {
          mappings: () => {
            throw new Error('no client');
          },
        },
      },
      failed,
    ],
    // No guide at all: the wrappers still refuse with the generic instruction.
    [allow, failed],
    [guide(inventory([]).reader), 'no mapping targeting this DMO lists a pair for the field(s)'],
    [
      guide(inventory([map(first, ['Id__c'])]).reader),
      'no mapping targeting this DMO lists a pair for the field(s)',
    ],
  ]) {
    const { writes, client } = target();
    const outcome = await executeDmo(authored(['Note__c']), client, undefined, options);
    assert.deepEqual(outcome, {
      outcome: 'blocked',
      mutation: 'not-attempted',
      diagnostics: [
        {
          code: 'DMO_FIELD_REMOVAL_MAPPED',
          message: generic(reason),
          mappedFields: [{ field: 'Note__c', mappings: [] }],
        },
      ],
    });
    await assert.rejects(
      preflightDmo(authored(['Note__c']), client, undefined, options),
      (error) =>
        error instanceof NativeDmoError &&
        error.code === 'DMO_FIELD_REMOVAL_MAPPED' &&
        mappedFieldMappings(error)[0].mappings.length === 0,
    );
    assert.deepEqual(writes, []);
  }
  const { client } = target();
  const several = await executeDmo(authored(['Note__c', 'Link__c']), client, undefined, allow);
  assert.equal(several.diagnostics[0].message, generic(failed, 'Note__c, Link__c', 'are'));
  // Other refusals are untouched and trigger no lookup.
  const { lists, reader } = inventory([map(first, ['Note__c'])]);
  const other = await executeDmo(authored(['Free__c']), client, undefined, {
    mappedFieldGuide: { mappings: () => reader },
  });
  assert.equal(other.diagnostics[0].code, 'UNSUPPORTED_DMO_FIELD_CHANGE');
  assert.equal(other.diagnostics[0].mappedFields, undefined);
  assert.deepEqual(lists, []);
  assert.equal(mappedFieldMappings(new Error('other')), undefined);
});

const scratch = () => mkdtemp(path.join(os.tmpdir(), 'native-dmo-mapped-removal-'));
const org = {
  getOrgId: () => 'org',
  getUsername: () => 'user@example.com',
  getConnection: () => ({}),
};
/**
 * Run the deploy command against synthetic clients.
 * @param {string} cwd Synthetic project root.
 * @param {object} flags Command flags.
 * @param {object} services Injected clients and services.
 * @param {boolean} [json] Whether JSON output is enabled.
 * @returns {Promise<{result: object, lines: string[]}>} Envelope and human output lines.
 */
const deploy = async (cwd, flags, services, json = true) => {
  const lines = [];
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      'api-version': 'auto',
      preview: false,
      'allow-field-removal': true,
      'allow-processing': true,
      ...flags,
    },
  });
  command.jsonEnabled = () => json;
  command.log = (line) => lines.push(line);
  command.resolveInputs = readDeployInputs;
  command.captureInput = captureDeployInputDigest;
  command.verifySegmentInput = verifySegmentInputDigest;
  command.resolveTargetOrg = async () => org;
  Object.assign(command, services);
  const previousCwd = process.cwd();
  const previousExit = process.exitCode;
  process.chdir(cwd);
  try {
    return { result: await command.run(), lines };
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExit;
  }
};
/**
 * Injected clients: a DMO target with mapped fields and a list-only mapping inventory.
 * @param {object[] | Error} maps Inventory entries or the lookup failure.
 * @returns {object} Services plus the recorded writes, lists and mapping client arguments.
 */
const clients = (maps) => {
  const { writes, client } = target();
  const { lists, reader } = inventory(maps);
  const created = [];
  return {
    writes,
    lists,
    created,
    services: {
      createDmoClient: () => client,
      createMappingClient: (...arguments_) => {
        created.push(arguments_);
        return reader;
      },
    },
  };
};
const expected = (scope, nextAction) =>
  `Field removal refused for ${apiName}: Note__c is mapped by ${first}. Salesforce would drop the mapping pair(s) together with the field(s), so remove the pair(s) from the mapping file(s) and deploy the mapping(s) and the DMO in one command:\n${steps(scope, [first], ['Note__c'])}\n${nextAction}`;
const mappedFields = [{ field: 'Note__c', mappings: [first] }];

for (const preview of [true, false])
  test(`all-native route names mapping and commands, preview=${preview}`, async () => {
    const cwd = await scratch();
    await writeNativeDmoDocument(authored(['Note__c']), cwd, false);
    for (const [passed, dataspace, scope] of [
      ['my-org', undefined, ' -o my-org'],
      [undefined, undefined, ''],
      // An injected org object is not something the user passed.
      [org, undefined, ''],
    ]) {
      const { writes, lists, created, services } = clients([map(first, ['Id__c', 'Note__c'])]);
      const { result } = await deploy(
        cwd,
        { metadata: [`dmo:${apiName}`], preview, 'target-org': passed, dataspace },
        services,
      );
      assert.equal(result.status, 'blocked', JSON.stringify(result));
      const diagnostic = preview
        ? result.diagnostics.errors[0]
        : result.result.items[0].diagnostics[0];
      assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
      assert.deepEqual(diagnostic.mappedFields, mappedFields);
      assert.equal(
        diagnostic.message,
        expected(
          scope,
          preview
            ? 'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.'
            : unwritten,
        ),
      );
      if (!preview) {
        assert.equal(result.result.items[0].outcome, 'blocked');
        assert.equal(result.result.items[0].mutation, 'not-attempted');
      }
      assert.deepEqual(created, [['user@example.com', '68.0', undefined, dataspace]]);
      assert.deepEqual(lists, [[apiName]]);
      assert.deepEqual(writes, []);
      const serialized = JSON.stringify(result);
      assert.equal(JSON.parse(serialized).status, 'blocked');
    }
  });

test('all-native route repeats the data space and prints commands on their own lines', async () => {
  const cwd = await scratch();
  const saved = authored(['Note__c']);
  saved.identity.dataSpace = 'Team';
  await writeNativeDmoDocument(saved, cwd, false);
  const { writes, client } = target();
  const { reader } = inventory([map(first, ['Note__c'])]);
  const created = [];
  const { result, lines } = await deploy(
    cwd,
    { metadata: [`dmo:${apiName}`], 'target-org': 'my-org', dataspace: 'Team' },
    {
      createDmoClient: () => ({
        ...client,
        get: async () => ({ ...native(), dataSpaceName: 'Team' }),
      }),
      createMappingClient: (...arguments_) => {
        created.push(arguments_);
        return reader;
      },
    },
    false,
  );
  assert.equal(result.status, 'blocked');
  assert.deepEqual(created, [['user@example.com', '68.0', undefined, 'Team']]);
  assert.equal(
    result.result.items[0].diagnostics[0].message,
    expected(' -o my-org --dataspace Team', unwritten),
  );
  const printed = lines.join('\n').split('\n');
  for (const line of steps(' -o my-org --dataspace Team', [first], ['Note__c']).split('\n'))
    assert.ok(printed.includes(line), line);
  assert.ok(printed.some((line) => line.startsWith('DMO_FIELD_REMOVAL_MAPPED: Field removal')));
  assert.deepEqual(writes, []);
});

const segment = {
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: 'Audience' },
  spec: {
    displayName: 'Audience',
    description: '',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', dataSpace: 'default', apiName },
    models: [{ name: 'Audience', sql: `SELECT ${apiName}.Id__c FROM ${apiName} WHERE 1 = 0` }],
    dependencies: [{ kind: 'dmo', dataSpace: 'default', apiName, fields: ['Id__c'] }],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
};
/**
 * Synthetic Segment services for the mixed batch route.
 * @param {string[]} calls Ordered service calls.
 * @returns {object} Segment preflight and execution stubs.
 */
const segments = (calls) => ({
  preflightSegment: async () => {
    calls.push('segment-preflight');
    return {
      outcome: 'create',
      requiredEffects: ['processing'],
      target: 'absent',
      absenceProof: 'confirmed-404',
      diagnostics: [],
    };
  },
  executeSegment: async () => {
    calls.push('segment-execute');
    return {
      family: 'segment',
      outcome: 'created',
      mutation: 'confirmed-created',
      diagnostics: [],
    };
  },
});
const mixed = async () => {
  const cwd = await scratch();
  await writeNativeDmoDocument(authored(['Note__c']), cwd, false);
  await writeSegmentDocument(segment, cwd, false);
  return cwd;
};
const selection = { metadata: ['segment:Audience', `dmo:${apiName}`] };

for (const preview of [true, false])
  for (const lookup of ['found', 'failed'])
    test(`mixed batch route refuses in preflight, preview=${preview} lookup=${lookup}`, async () => {
      const cwd = await mixed();
      const calls = [];
      const { writes, lists, created, services } = clients(
        lookup === 'found' ? [map(first, ['Note__c'])] : new Error('lookup failed'),
      );
      const { result } = await deploy(
        cwd,
        { ...selection, preview, 'target-org': 'my-org' },
        { ...services, ...segments(calls) },
      );
      assert.notEqual(result.status, 'success', JSON.stringify(result));
      const item = result.result.items.find((entry) => entry.identity.apiName === apiName);
      const [diagnostic] = preview ? item.diagnostics : item.preflight.diagnostics;
      assert.equal(preview ? item.outcome : item.preflight.outcome, 'blocked');
      if (!preview) {
        assert.equal(item.outcome, 'not-attempted');
        assert.equal(item.mutation, 'not-attempted');
      }
      assert.equal(diagnostic.code, 'DMO_FIELD_REMOVAL_MAPPED');
      const nextAction = 'Target preview failed; no deployment was executed.';
      if (lookup === 'found') {
        assert.deepEqual(diagnostic.mappedFields, mappedFields);
        assert.equal(diagnostic.message, expected(' -o my-org', nextAction));
      } else {
        assert.deepEqual(diagnostic.mappedFields, [{ field: 'Note__c', mappings: [] }]);
        assert.match(diagnostic.message, /could not be identified \(the mapping lookup failed\)/u);
        assert.ok(diagnostic.message.endsWith(` ${nextAction}`));
        assert.ok(!diagnostic.message.includes('\n'));
      }
      assert.deepEqual(created, [['user@example.com', '68.0', undefined, undefined]]);
      assert.deepEqual(lists, [[apiName]]);
      assert.deepEqual(writes, []);
      assert.ok(!calls.includes('segment-execute'));
    });

test('mixed batch route executor refusal after a passed preflight names the commands', async () => {
  const cwd = await mixed();
  const calls = [];
  const { writes, lists, services } = clients([map(first, ['Note__c'])]);
  const { result } = await deploy(
    cwd,
    { ...selection },
    {
      ...services,
      ...segments(calls),
      // The target gained its mapping between admission and execution.
      preflightNativeDmo: async () => ({
        family: 'dmo',
        outcome: 'update',
        target: 'existing',
        absenceProof: 'none',
        removeFields: ['Note__c'],
        diagnostics: [],
      }),
    },
  );
  assert.equal(result.status, 'blocked', JSON.stringify(result));
  const item = result.result.items.find((entry) => entry.identity.apiName === apiName);
  assert.equal(item.outcome, 'blocked');
  assert.equal(item.mutation, 'not-attempted');
  assert.equal(item.diagnostics[0].code, 'DMO_FIELD_REMOVAL_MAPPED');
  assert.deepEqual(item.diagnostics[0].mappedFields, mappedFields);
  // No target org was passed, so the commands carry none.
  assert.equal(item.diagnostics[0].message, expected('', unwritten));
  assert.deepEqual(lists, [[apiName]]);
  assert.deepEqual(writes, []);
  assert.ok(!calls.includes('segment-execute'));
});
