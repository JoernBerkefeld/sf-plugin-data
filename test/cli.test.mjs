import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Config } from '@oclif/core';

// Retain run-owned isolated state; no deletion is performed by these tests.
const state = mkdtempSync(path.join(os.tmpdir(), 'data360-bootstrap-'));
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(?:SF|SFDX)_/iu.test(key)),
  ),
  USERPROFILE: state,
  HOME: state,
  SF_TARGET_ORG: 'offline-unconfigured-synthetic',
  SFDX_DEFAULTUSERNAME: 'offline-unconfigured-synthetic',
  SF_STATE_FOLDER: path.join(state, 'sf'),
  SF_DISABLE_TELEMETRY: 'true',
  SF_AUTOUPDATE_DISABLE: 'true',
  XDG_CACHE_HOME: path.join(state, 'cache'),
  XDG_CONFIG_HOME: path.join(state, 'config'),
  XDG_DATA_HOME: path.join(state, 'data'),
};

test('offline subprocess core auth directories stay under the isolated home without inherited auth overrides', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import os from 'node:os'; import { Global } from '@salesforce/core';
       console.log(JSON.stringify({ home: os.homedir(), sf: Global.SF_DIR, sfdx: Global.SFDX_DIR,
         overrides: Object.keys(process.env).filter(key => /^(?:SF|SFDX)_/iu.test(key)).sort() }));`,
    ],
    { encoding: 'utf8', env: environment },
  );
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.equal(actual.home, state);
  assert.equal(actual.sf, path.join(state, '.sf'));
  assert.equal(actual.sfdx, path.join(state, '.sfdx'));
  assert.deepEqual(actual.overrides, [
    'SFDX_DEFAULTUSERNAME',
    'SF_AUTOUPDATE_DISABLE',
    'SF_DISABLE_TELEMETRY',
    'SF_STATE_FOLDER',
    'SF_TARGET_ORG',
  ]);
});

test('package metadata points to the renamed repository without changing npm identity', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'sf-plugin-data');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.repository, {
    type: 'git',
    url: 'git+https://github.com/JoernBerkefeld/sf-plugin-data.git',
  });
  assert.equal(manifest.homepage, 'https://github.com/JoernBerkefeld/sf-plugin-data#readme');
  assert.deepEqual(manifest.bugs, {
    url: 'https://github.com/JoernBerkefeld/sf-plugin-data/issues',
  });
});

// README is the overview for functional readers; per-type contracts live in docs/types/<type>.md.
const readText = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const flatDocument = (file) => readText(file).replaceAll(/\s+/gu, ' ');
const typePage = (name) => flatDocument(`../docs/types/${name}.md`);
const typePageFiles = readdirSync(new URL('../docs/types/', import.meta.url))
  .filter((file) => file.endsWith('.md'))
  .map((file) => `../docs/types/${file}`);
// Current-behaviour docs: removed wording must not come back in any of them.
const currentDocuments = ['../README.md', ...typePageFiles];
const readmeTable = () => {
  const readme = readText('../README.md');
  return readme.slice(readme.indexOf('| Type ')).split('\n\n')[0];
};
const tableRow = (table, link) => table.split('\n').find((line) => line.includes(`](${link}`));
const ratingCells = (row) =>
  row
    .split('|')
    .slice(2, 6)
    .map((cell) => cell.trim());

test('Segment help and README describe API68-only deploy by name, sent as written', async () => {
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  const { default: Retrieve } = await import('../lib/commands/data360/retrieve.js');
  assert.match(
    Deploy.description,
    /Name\.segment\.json joined with one Name\.segment\.<model>\.sql per model; a missing or extra SQL file or SQL left in the JSON is INVALID_SOURCE\) uses auto or 68\.0/u,
  );
  assert.match(
    Retrieve.description,
    /each model as Salesforce returns it in <Name>\.segment\.<model>\.sql/u,
  );
  assert.match(
    Deploy.description,
    /sent as written and Salesforce decides; its error is reported/u,
  );
  assert.match(Deploy.description, /identical configuration is unchanged without acknowledgement/u);
  assert.match(
    Deploy.description,
    /Segment deletion is separate: sf data360 delete -m segment:Name reads the segment from the org by name and runs fresh checks/u,
  );
  assert.doesNotMatch(Deploy.description, /explicit65|IS NOT NULL|Metadata reads validate/u);
  assert.match(Retrieve.description, /Segment uses auto or 68\.0 in the run data space/u);
  assert.doesNotMatch(Retrieve.description, /explicit65|single-model DBT subset/u);
  const readme = readText('../README.md');
  assert.ok(readme.includes('`data360/segments/<Name>.segment.json`'));
  assert.ok(readme.includes('Create and update need `--allow-processing`'));
  const row = tableRow(readmeTable(), 'docs/types/segment.md)');
  assert.ok(row, 'README type overview must have a Segments row');
  assert.doesNotMatch(row, /Historical API65|single-model|icons\/cli\.svg/u);
  const segment = typePage('segment');
  for (const text of [
    '`data360/segments/<Name>.segment.json`',
    'the file is sent as written and Salesforce decides',
    'execution needs no confirmation flag',
    'Generated membership DMOs are not deleted',
  ])
    assert.ok(segment.includes(text), text);
  for (const file of currentDocuments) {
    const text = readText(file);
    assert.ok(!text.includes('`data360/segment/<name>.segment.json`'), file);
    assert.ok(!text.includes('### Live segment: standard REST API 65'), file);
  }
});

test('docs describe the native mapping lifecycle without obsolete XML-only or batch claims', () => {
  const mapping = typePage('mapping');
  for (const required of [
    'data360/mapping/<name>.mapping-meta.json',
    'explicit numeric pins are preserved',
    'planned-dependencies',
    'the desired pair set',
    'one names-only, selector-free PATCH',
    'Create and update send the pairs the file lists; Salesforce decides.',
    'the preview carries the non-blocking diagnostic `MAPPING_FIELD_TYPES_DIFFER`',
    '`MAPPING_FIELD_NOT_FOUND`, which names the pair, the missing field and its object',
    'HTTP 400 `MISSING_ARGUMENT: Unable to find Primary Key of DLO in POST request of Mapping Creation`',
    'removal is refused with `MAPPING_PROTECTED_LAYOUT_UNPROVEN` before any write',
    'one Metadata API destructive deployment',
    'type `ObjectSourceTargetMap`',
    'It does not unmap pairs first and sends no native DELETE',
    'typed selected-mapping `404`',
    'Deletion is admitted at every native API version from `61.0`',
    'zero-write repeat',
    'DMO GET has no status field',
    'The last mapping of a custom DMO is refused before any write',
    'the last mapping of a standard DMO is deleted normally',
    '`--preview` performs zero writes',
    'reports the single planned step `delete`',
    'MAPPING_DELETE_FAILED',
    'MAPPING_DELETE_SIDE_EFFECT',
    'MAPPING_DELETION_UNCONFIRMED',
    'A mapping whose own read answers `404` is already gone: it reports `unchanged`',
    'the org mapping is found the way deploy finds it, by the file',
    'reports the org name as `targetApiName`',
  ])
    assert.ok(mapping.includes(required), `missing mapping contract: ${required}`);
  for (const file of currentDocuments) {
    const text = readText(file);
    for (const obsolete of [
      'There is no public plugin Delete command',
      'An already-absent mapping is conservatively blocked without writes',
      'unchanged-on-404 handling applies only to native DLO/DMO deletion',
      'Only the `default` data space is supported.',
      'Installed creation/reconciliation acceptance is API68;',
      'Exact API65/default opaque XML export only',
      'pending public plugin integration acceptance',
      'installed public reconciliation acceptance remains separate',
      'installed mapping lifecycle acceptance is API68 only',
      'This does not claim installed API61 CLI acceptance',
      'installed deletion acceptance remains separate',
      'mixed-family deployment remain blocked',
      'The whole\nselection is preflighted before any executor call',
      'observed live at API 68 only',
      'Desired-state removal/retarget remains API68-only',
      'does not qualify installed Number removal',
      '61.0 through 68.0',
      'onto shared or occupied targets',
      'only at create)',
    ])
      assert.ok(!text.includes(obsolete), `obsolete contract in ${file}: ${obsolete}`);
  }
  assert.match(readText('../README.md'), /in the order DLO,\s+DMO,\s+mapping,\s+relationship/u);
});

test('docs describe native relationships without the removed XML export', () => {
  const section = typePage('relationship');
  for (const required of [
    'data360/relationship/<Name>.relationship-meta.json',
    'sf data360 retrieve -m relationship:Order__dlm',
    'bare `relationship` selector reads the relationships of every DMO',
    'RELATIONSHIP_INVENTORY_INCOMPLETE',
    "deploy finds the relationship by the file's name",
    'RELATIONSHIP_UPDATE_REJECTED',
    'one `updateMetadata` of the whole `FieldSrcTrgtRelationship`',
    'Deploy never deletes relationships',
    'Salesforce requires the source DMO, and a target DMO, to be mapped',
    'a CRM object such as `Account`',
    'planned-dependencies',
    'sf data360 delete -m relationship:Order__dlm:<Name>',
    'ssot/data-model-objects/relationships/{name}',
    'In a delete command relationships run first',
    'RELATIONSHIP_NAME_MISMATCH',
  ])
    assert.ok(section.includes(required), `missing relationship contract: ${required}`);
  const row = tableRow(readmeTable(), 'docs/types/relationship.md)');
  assert.ok(row, 'README type overview must have a relationships row');
  // All four operations are Available: a changed target or owner is refused by Salesforce
  // through the Metadata API, not by the plugin, so update is not Partial.
  assert.equal((row.match(/Partial/gu) ?? []).length, 0);
  assert.deepEqual(ratingCells(row), ['Available', 'Available', 'Available', 'Available']);
  assert.doesNotMatch(row, /\|\s*Unavailable\s*\|/u);
  for (const file of [
    ...currentDocuments,
    '../docs/capabilities.md',
    '../docs/artifact-format.md',
  ]) {
    const text = readText(file);
    // FieldSrcTrgtRelationship stays named: it is the Metadata API type of the update.
    for (const removed of ['fieldSrcTrgtRelationship-meta.xml', 'definitionOnly: true'])
      assert.ok(!text.includes(removed), `${file} mentions ${removed}`);
  }
});

test('README and current docs do not mention removed mapping and stream refusal codes', () => {
  const removed = [
    'CREATE_ADDITIONS_UNSUPPORTED',
    'STREAM_MAPPING_CONFLICT',
    'UNSUPPORTED_STREAM_CATEGORY',
    'UNSUPPORTED_STREAM_MAPPING_TARGET',
    'UNSUPPORTED_STREAM_REFRESH',
    'MAPPING_FIELD_TYPE_MISMATCH',
    'MAPPING_CREATE_FIELD_POLICY_UNPROVEN',
    'MAPPING_PRIMARY_KEY_PAIR_REQUIRED',
    'MAPPING_ADDITION_POLICY_UNPROVEN',
    'MAPPING_UNMAP_VERSION_UNQUALIFIED',
    'MAPPING_DELETE_VERSION_UNQUALIFIED',
  ];
  // The handover log keeps history; these files describe current behaviour only.
  for (const file of [
    ...currentDocuments,
    '../docs/capabilities.md',
    '../docs/artifact-format.md',
  ]) {
    const text = readText(file);
    for (const code of removed) assert.ok(!text.includes(code), `${file} mentions ${code}`);
  }
});

test('README describes optional scope and the type overview without changing CRUD ratings', () => {
  const readme = flatDocument('../README.md');
  for (const text of [
    'optional `--dataspace NAME`',
    '`--data-space` is a compatibility alias',
    'Neither spelling has a CLI default',
    "DLOs follow the run's data space",
    'First mapping onto a standard DMO copy',
    'Every type works in any data space of the org',
  ])
    assert.ok(readme.includes(text), text);
  assert.ok(
    typePage('mapping').includes(
      "Every mapping and relationship REST request names the run's data space",
    ),
  );
  assert.ok(typePage('dmo').includes('A DMO list entry without `dataSpaceName` stops the listing'));
  // Every type works in any data space: there is no Data space column (user decision).
  assert.match(readme, /\| Type +\| Retrieve +\| Create +\| Update +\| Delete +\| More +\|/u);
  const table = readmeTable();
  assert.doesNotMatch(table, /\| Data space \|/u);
  const rows = table
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\| (?:---|Type )/u.test(line));
  // 15 types, the Unavailable source-object and kit rows included.
  assert.equal(rows.length, 15);
  const all = ['Available', 'Available', 'Available', 'Available'];
  const none = ['Unavailable', 'Unavailable', 'Unavailable', 'Unavailable'];
  for (const link of [
    'docs/types/data-stream.md)',
    'docs/types/dlo.md)',
    'docs/types/dmo.md)',
    'docs/types/mapping.md)',
    'docs/types/relationship.md)',
    'docs/types/data-transform.md)',
    'docs/types/calculated-insight.md)',
    'docs/types/segment.md)',
    'docs/types/data-graph.md)',
    'docs/types/identity-resolution.md)',
  ]) {
    const row = tableRow(table, link);
    assert.ok(row, `missing type row ${link}`);
    assert.deepEqual(ratingCells(row), all, link);
  }
  assert.deepEqual(ratingCells(tableRow(table, 'docs/types/segment.md#export-segment-members')), [
    'Available',
    'Unavailable',
    'Available',
    'Unavailable',
  ]);
  for (const name of [
    'Source object definitions',
    'Kit templates',
    'Kit definitions',
    'Kit membership',
  ]) {
    const row = rows.find((line) => line.startsWith(`| ${name} `));
    assert.ok(row, `missing row ${name}`);
    assert.deepEqual(ratingCells(row), none, name);
  }
  // Data transforms, DMOs, mappings (pairs and label), data graphs and streams: the plugin sends
  // every write and Salesforce decides (a graph join change is refused because Salesforce ignores it).
  assert.doesNotMatch(table, /Partial/u);
  const stream = typePage('data-stream');
  for (const text of [
    'streams of every other connector in a GET-shaped file',
    'others, such as S3 or streaming apps, are untested and sent as written',
    'an additive mapping whose source label names no event field',
    'Salesforce answers 200 and keeps the old value',
  ])
    assert.ok(stream.includes(text), text);
  const graph = typePage('data-graph');
  for (const text of [
    'refuses removed fields and related objects, a root change and another related object',
    'The plugin refuses join changes',
    'A file with another name creates or addresses another graph; the old graph is not renamed',
    'DATA_GRAPH_JOIN_CHANGE',
    'DATA_GRAPH_CHANGE_NOT_APPLIED',
  ])
    assert.ok(graph.includes(text), text);
  for (const file of currentDocuments)
    assert.ok(
      !flatDocument(file).includes('Omitted fields and related objects are kept, not removed'),
      file,
    );
});

test('docs describe the transform file as native input that Salesforce decides on', () => {
  const transform = readText('../docs/types/data-transform.md');
  const section = typePage('data-transform');
  for (const text of [
    'a DCSQL definition creates the output DLOs it declares',
    "the transform's native input as Salesforce returns it",
    'everything else is sent as written and Salesforce decides',
    '`UNSUPPORTED_TRANSFORM_INPUT`',
    'An update replaces the whole transform',
    '`fullRunFrequency` to `DAILY`, `writeMode` to `OVERWRITE`',
    "The file's top-level `schedule` holds the transform schedule",
    'Without the key, the schedule is left alone',
    '`{ "frequency": "None" }` turns the schedule off',
    '`TRANSFORM_SCHEDULE_CHANGE`',
    'A definition PUT keeps the schedule',
    "Salesforce's stored definition is not compared with the file",
    'A transform of any owner is sent and Salesforce decides',
    'Writes to packaged (namespaced) transforms are untested',
  ])
    assert.ok(section.includes(text), text);
  assert.match(transform, /sf data360 deploy -m data-transform:Example --target-org/u);
  assert.match(transform, /no match sends one create POST, one match updates that record/u);
  assert.match(transform, /`--allow-processing` is not needed/u);
  assert.match(transform, /sf data360 delete -m data-transform:Name/u);
  assert.match(transform, /deletion-unconfirmed/u);
  for (const file of currentDocuments) {
    const text = flatDocument(file);
    assert.doesNotMatch(text, /--transform-operation|--transform-target-id/u, file);
    assert.doesNotMatch(
      text,
      /UNSUPPORTED_TRANSFORM_(?:SCHEDULE|FREQUENCY|DLO_STATE)|INCOMPATIBLE_TRANSFORM_DLO_FIELDS/u,
      file,
    );
  }
});

test('docs separate DLO field admission from live Text qualification', () => {
  const dlo = typePage('dlo');
  for (const text of [
    'Local validation accepts nonempty `dataType` strings rather than a Text-only allowlist',
    'UPDATE admits label changes and ordinary nonprimary field additions',
    'Salesforce decides the type of a field',
    'Create sends `spec.category` as the file states it and Salesforce decides',
    'An Engagement DLO needs `spec.eventDateTimeFieldName`',
    '`cdp_sys_PartitionDate__c`',
    'a changed category is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE`',
    'a changed event field with `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`',
    'Field removal, existing-field changes and primary-key mutation are therefore refused with `UNSUPPORTED_DLO_FIELD_CHANGE`',
  ])
    assert.ok(dlo.includes(text), text);
  for (const file of currentDocuments) {
    const text = flatDocument(file);
    for (const obsolete of [
      'Update supports a label change and new nonprimary Text fields',
      'Other-category CREATE',
      'additive-field acceptance here covers Text',
    ])
      assert.ok(!text.includes(obsolete), `${file}: ${obsolete}`);
  }
});

test('user docs no longer name the removed DLO create-category refusal', () => {
  for (const file of [...currentDocuments, '../docs/capabilities.md', '../docs/artifact-format.md'])
    assert.ok(!readText(file).includes('UNSUPPORTED_DLO_CREATE_CATEGORY'), file);
});

test('delete help discloses whole-mapping deletion and bounded qualification', async () => {
  const { default: Delete } = await import('../lib/commands/data360/delete.js');
  assert.match(Delete.summary, /fields or mappings.$/u);
  for (const text of [
    'one Metadata API destructive deployment (ObjectSourceTargetMap)',
    'The last mapping of a custom DMO is refused before any write',
    'delete the DMO instead',
    'empty custom fixtures',
    '--preview performs zero writes and reports the planned step',
    'partial failure stops the batch',
    'no retries or rollback',
  ])
    assert.ok(Delete.description.includes(text), text);
  for (const stale of [
    'No cascade',
    'Full parent schemas and survivor content',
    'reports the ordered plan',
    'parent DELETE',
  ])
    assert.ok(!Delete.description.includes(stale), stale);
});

test('API flags admit auto and core numeric versions only; latest is no longer accepted', async () => {
  const { default: Retrieve } = await import('../lib/commands/data360/retrieve.js');
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  for (const command of [Retrieve, Deploy]) {
    const flag = command.flags['api-version'];
    assert.equal(flag.default, 'auto');
    assert.equal(await flag.parse('auto', {}, {}), 'auto');
    assert.equal(await flag.parse('65.0', {}, {}), '65.0');
    for (const invalid of ['latest', 'Latest', 'v65.0', '65', 'latest ', '20.0'])
      await assert.rejects(flag.parse(invalid, {}, {}));
  }
});

test('dataspace parser has no default, accepts the compatibility alias and refuses dual spellings', async () => {
  const { Parser } = await import('@oclif/core');
  for (const operation of ['retrieve', 'deploy', 'delete', 'publish']) {
    const { default: Command } = await import(`../lib/commands/data360/${operation}.js`);
    assert.equal(Command.flags.dataspace.default, undefined);
    assert.deepEqual(Command.flags.dataspace.aliases, ['data-space']);
    const flags = { dataspace: Command.flags.dataspace };
    const omitted = await Parser.parse([], { flags });
    assert.equal(omitted.flags.dataspace, undefined);
    for (const spelling of ['--dataspace', '--data-space']) {
      const parsed = await Parser.parse([spelling, 'Team'], { flags });
      assert.equal(parsed.flags.dataspace, 'Team');
    }
    for (const pair of [
      ['Team', 'Other'],
      ['Team', 'Team'],
    ])
      await assert.rejects(
        Parser.parse(['--dataspace', pair[0], '--data-space', pair[1]], { flags }),
        /can only be specified once/u,
      );
  }
});

test('actual core initialization and fixed command routes never discover or save cached versions', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { AuthInfo, ConfigAggregator, Connection } from '@salesforce/core';
    import Retrieve from './lib/commands/data360/retrieve.js';
    import Deploy from './lib/commands/data360/deploy.js';
    import { dataSpaceDirectory } from './lib/services/data-space-check.js';
    // The once-per-command data space read is a real request, not version discovery.
    dataSpaceDirectory.read = async () => ['default'];
    const config = await ConfigAggregator.create();
    assert.equal(config.getPropertyValue('org-api-version'), undefined);
    let fields;
    const usernames = [];
    AuthInfo.create = async ({ username }) => {
      usernames.push(username);
      assert.equal(username, 'offline-unconfigured-synthetic');
      return {
        getUsername: () => username,
        getConnectionOptions: () => ({ instanceUrl: 'https://synthetic.example', accessToken: 'offline-token' }),
        getFields: () => fields,
        save: () => assert.fail('must not save discovered version cache'),
      };
    };
    Connection.prototype.isResolvable = () => assert.fail('no initialization DNS');
    const requests = [];
    Connection.prototype.request = async function(request) {
      requests.push(request);
      assert.fail('Fixed routes must not request version discovery.');
    };
    for (const cached of [false, true]) {
      for (const requested of ['68.0', 'auto']) {
        for (const kind of ['retrieve', 'deploy']) {
            fields = { orgId: '00Dsynthetic', ...(cached ? {
              instanceApiVersion: '68.0', instanceApiVersionLastRetrieved: '2000-01-01',
            } : {}) };
            const before = requests.length;
            const command = kind === 'retrieve' ? new Retrieve([], {}) : new Deploy([], {});
            let org;
            if (kind === 'deploy') {
              const flag = Deploy.flags['target-org'];
              assert.equal(await flag.parse('offline-unconfigured-synthetic', {}, {}), 'offline-unconfigured-synthetic');
              assert.equal(requests.length, before, 'inert target flag must not authenticate');
              org = await command.resolveTargetOrg('offline-unconfigured-synthetic');
              assert.equal(org.getConnection().getApiVersion(), '68.0');
              assert.equal(requests.length, before, 'explicit auth must not discover');
            }
            command.parse = async () => ({ flags: {
              'api-version': requested, dataspace: 'default',
              'target-org': org, metadata: ['dmo'], preview: true,
            } });
            command.jsonEnabled = () => true;
            command.listNativeNames = async () => [];
            command.listNativeMappingNames = async () => [];
            command.resolveInputs = async () => [{
              path: 'Synthetic.segment.json',
              document: {
                schemaVersion: 1, kind: 'segment', c__dataSpace: 'default',
                identity: { apiName: 'Synthetic' },
                spec: {
                  displayName: 'Synthetic', description: '', segmentType: 'DBT',
                  segmentOn: { kind: 'dmo', apiName: 'Person__dlm' },
                  models: [{ name: 'Synthetic', sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
                  lookbackPeriod: 'P90D',
                },
              },
            }];
            command.verifySegmentInput = async () => {};
            command.preflightSegment = async () => ({
              family: 'segment', outcome: 'unchanged', target: 'present', absenceProof: 'none',
              requiredEffects: [], diagnostics: [],
            });
            const envelope = await command.run();
            assert.equal(requests.length, before, 'commands must not discover versions');
            assert.equal(envelope.status, 'success', JSON.stringify(envelope));
            process.exitCode = undefined;
        }
      }
    }
    assert.ok(usernames.length > 0);
    console.log('core bootstrap cases passed');
  `,
    ],
    { encoding: 'utf8', env: environment },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /core bootstrap cases passed/u);
});

const topics = ['data360', 'datacloud', 'd360', 'dc'];
for (const command of topics.flatMap((topic) => [
  topic,
  `${topic} retrieve`,
  `${topic} deploy`,
  `${topic} delete`,
  `${topic} publish`,
])) {
  test(`${command} help loads without org authentication`, () => {
    const result = spawnSync(process.execPath, ['bin/run.js', ...command.split(' '), '--help'], {
      encoding: 'utf8',
      env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Data360/u);
    if (command.includes(' ')) {
      assert.match(result.stdout, /ALIASES/u);
      for (const topic of topics.slice(1)) assert.ok(result.stdout.includes(topic), topic);
    } else {
      assert.match(result.stdout, /retrieve/u);
      assert.match(result.stdout, /deploy/u);
    }
    if (command.endsWith(' deploy')) {
      for (const flag of [
        '--metadata',
        '--source-dir',
        '--changed-since',
        '--wait-timeout',
        '--preview',
        '--target-org',
        '--api-version',
        '--dataspace',
      ])
        assert.ok(result.stdout.includes(flag), flag);
    }
    if (command.endsWith(' delete')) {
      for (const flag of ['--changed-since', '--confirm-delete', '--metadata', '--preview'])
        assert.ok(result.stdout.includes(flag), flag);
      for (const flag of ['--source-dir', '--transform-target-id'])
        assert.ok(!result.stdout.includes(flag), flag);
    }
    if (command.endsWith(' deploy'))
      for (const flag of ['--transform-operation', '--transform-target-id'])
        assert.ok(!result.stdout.includes(flag), flag);
    if (command.endsWith(' publish')) {
      for (const flag of [
        '--source-dir',
        '--metadata',
        '--wait-timeout',
        '--async',
        '--preview',
        '--api-version',
        '--dataspace',
      ])
        assert.ok(result.stdout.includes(flag), flag);
      for (const flag of ['--allow-processing']) assert.ok(!result.stdout.includes(flag), flag);
    }
    if (command.endsWith(' retrieve')) {
      for (const flag of [
        '--metadata',
        '--output-dir',
        '--overwrite',
        '--target-org',
        '--api-version',
        '--dataspace',
      ])
        assert.ok(result.stdout.includes(flag), flag);
    }
  });
}

for (const command of ['retrieve', 'deploy']) {
  test(`${command} refuses execution instead of claiming support`, () => {
    const result = spawnSync(process.execPath, ['bin/run.js', 'data360', command, '--json'], {
      encoding: 'utf8',
      env: environment,
    });
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    if (command === 'deploy') {
      assert.equal(output.result.status, 'blocked');
      assert.equal(output.result.diagnostics.errors[0].code, 'INVALID_SELECTION');
    } else {
      assert.equal(output.result.status, 'blocked');
      assert.equal(output.result.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
    }
  });
}

test('retrieve parser accepts repeatable exact, type and omitted selectors without eager auth parsing', () => {
  for (const selectors of [
    [],
    ['-m', 'dmo'],
    ['-m', 'dmo:A__dlm', '-m', 'dmo:B__dlm'],
    ['-m', 'dmo:A__dlm', '-m', 'dmo:A__dlm'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'retrieve', ...selectors, '--json'],
      {
        encoding: 'utf8',
        env: environment,
      },
    );
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout).result;
    assert.equal(output.contract, 'sf-data360-retrieve');
    assert.equal(output.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
  }
  const invalid = spawnSync(
    process.execPath,
    ['bin/run.js', 'data360', 'retrieve', '-m', 'dlo', '-o', 'unresolved-synthetic', '--json'],
    {
      encoding: 'utf8',
      env: environment,
    },
  );
  assert.equal(JSON.parse(invalid.stdout).result.diagnostics.errors[0].code, 'TARGET_ORG_REQUIRED');
});

test('deploy wait-timeout parser requires positive integer seconds and help describes native Graph scope', async () => {
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  assert.equal(Deploy.flags['wait-timeout'].min, 1);
  assert.match(Deploy.description, /default 1800.*at least 20 seconds with stderr progress/u);
  assert.equal(Deploy.description.includes('native UPDATE is deferred'), false);
  for (const value of ['0', '-1', '1.5', 'Infinity']) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'deploy', '--wait-timeout', value, '--json'],
      {
        encoding: 'utf8',
        env: environment,
      },
    );
    assert.equal(result.status, 2, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(Object.hasOwn(output, 'result'), false);
  }
});

test('docs and deploy help describe mapped-field removal as one destructive change in the DMO position', async () => {
  const dmo = typePage('dmo');
  const capabilities = flatDocument('../docs/capabilities.md');
  const artifact = flatDocument('../docs/artifact-format.md');
  for (const text of [
    "Salesforce drops the field's mapping pairs itself",
    'The DMO then deploys in its normal position (data lake objects, DMOs, mappings)',
    'a removal that would be refused stops the item as `blocked`/`not-attempted` with nothing written',
    'find the pairs already gone',
    '`droppedPairs`',
    'DMO_FIELD_REMOVAL_SIDE_EFFECT',
    'MAPPING_UNMAP_PLAN_CHANGED',
    'MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED',
    'Planned pair drop (Salesforce removes it with the field)',
  ])
    assert.ok(dmo.includes(text), `missing DMO field-removal contract: ${text}`);
  for (const text of ['DMO_FIELD_REMOVAL_SIDE_EFFECT', 'does not delete pairs one by one'])
    assert.ok(capabilities.includes(text), `missing capabilities contract: ${text}`);
  assert.ok(artifact.includes("Salesforce drops the field's pairs with it"));
  for (const file of [
    ...currentDocuments,
    '../docs/capabilities.md',
    '../docs/artifact-format.md',
  ]) {
    const document = flatDocument(file);
    for (const obsolete of [
      'DMO_FIELD_REMOVAL_PENDING',
      'two stages',
      'two-stage DMO',
      'removal stage',
      'separate CLI process',
      'its own CLI process',
      'about 11 minutes',
    ])
      assert.ok(
        !document.includes(obsolete),
        `obsolete field-removal wording in ${file}: ${obsolete}`,
      );
  }
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  assert.match(
    Deploy.description,
    /remove the field in the DMO position with one Metadata API destructive change\. Salesforce drops the .*DMO_FIELD_REMOVAL_SIDE_EFFECT otherwise\), and the mappings deployed afterwards find the pairs already gone/u,
  );
});

test('docs describe lean retrieved files and local file removal on delete', async () => {
  const readme = flatDocument('../README.md');
  const capabilities = flatDocument('../docs/capabilities.md');
  const artifact = flatDocument('../docs/artifact-format.md');
  for (const document of [capabilities, artifact])
    for (const text of [
      'MAPPING_GENERATED_PAIRS_UNPROVEN',
      'LOCAL_FILE_REMOVAL_FAILED',
      '--keep-local-files',
      '`removedLocalFiles`',
      '`localFiles`',
    ])
      assert.ok(document.includes(text), text);
  assert.ok(readme.includes('--keep-local-files'));
  assert.ok(typePage('mapping').includes('MAPPING_GENERATED_PAIRS_UNPROVEN'));
  const deletePage = typePage('delete');
  for (const text of ['LOCAL_FILE_REMOVAL_FAILED', '`removedLocalFiles`', '`localFiles`'])
    assert.ok(deletePage.includes(text), text);
  for (const file of [
    ...currentDocuments,
    '../docs/capabilities.md',
    '../docs/artifact-format.md',
  ]) {
    const document = flatDocument(file);
    for (const obsolete of [
      'Generated pairs are saved by retrieve',
      'A retrieved file, which lists the generated pairs',
      'never removes the file',
      'never cascades or removes the local pair',
      'needs no local file and never touches one',
      'no local file read or written',
      'other system fields remain saved',
      'and the local file is kept',
      'local-file deletion is performed',
    ])
      assert.ok(!document.includes(obsolete), `obsolete wording in ${file}: ${obsolete}`);
  }
  assert.ok(readText('../README.md').includes('### Local files after delete'));
  assert.ok(artifact.includes('## Local files after delete'));
  const { default: Delete } = await import('../lib/commands/data360/delete.js');
  assert.ok(Delete.flags['keep-local-files']);
  assert.ok(Delete.description.includes('LOCAL_FILE_REMOVAL_FAILED'));
});

test('deploy parser admits repeated non-greedy explicit flags but blocks invalid selections before org work', () => {
  for (const arguments_ of [
    [],
    ['-m', 'dmo'],
    ['-m', 'dmo:A__dlm', '-m', 'dmo:B__dlm', '-d', 'x.json'],
    ['-d', 'missing-one.json', '-d', 'missing-two.json'],
    ['-m', 'dmo:MissingOne__dlm', '-m', 'dmo:MissingTwo__dlm'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'deploy', '--preview', ...arguments_, '--json'],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.result.contract, 'sf-data360-deploy');
    assert.equal(output.result.metadata.apiVersion, 'auto');
    assert.equal(output.result.result.scope.dataSpace, 'default');
    assert.equal(output.result.status, 'blocked');
    assert.ok(
      ['INVALID_SELECTION', 'UNSAFE_SOURCE'].includes(output.result.diagnostics.errors[0].code),
    );
    assert.deepEqual(output.result.result.items, []);
  }
});

test('delete parser refuses --source-dir, --transform-target-id and a -m --confirm-delete', () => {
  for (const arguments_ of [
    ['-d', 'Synthetic__cio.calculatedInsight-meta.json'],
    ['--source-dir', 'Synthetic__cio.calculatedInsight-meta.json'],
    ['--transform-target-id', '1dt000000000001AAA'],
    ['--confirm-delete'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'delete', '-m', 'dmo:Synthetic__dlm', ...arguments_, '--json'],
      { encoding: 'utf8', env: environment },
    );
    assert.notEqual(result.status, 0, arguments_.join(' '));
    assert.match(
      `${result.stdout}${result.stderr}`,
      arguments_[0] === '--confirm-delete' ? /changed-since/u : /Nonexistent flag/u,
      arguments_.join(' '),
    );
  }
});

test('delete without a usable org reports TARGET_ORG_REQUIRED like publish', () => {
  for (const arguments_ of [
    ['-m', 'calculated-insight:Synthetic__cio'],
    ['-m', 'data-transform:Synthetic', '--preview'],
    ['-m', 'dmo:Synthetic__dlm', '--preview'],
    ['-m', 'dmo:Synthetic__dlm', '--field', 'Name__c', '--preview'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'delete', ...arguments_, '--json'],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(result.status, 1, result.stderr);
    const envelope = JSON.parse(result.stdout).result;
    assert.equal(envelope.status, 'blocked', arguments_.join(' '));
    assert.deepEqual(
      envelope.diagnostics.errors.map(({ code }) => code),
      ['TARGET_ORG_REQUIRED'],
      arguments_.join(' '),
    );
  }
});

test('CI delete parser rejects unqualified scope before authentication', () => {
  for (const [arguments_, code] of [
    [['--api-version', '65.0'], 'INVALID_SCOPE'],
    // A calculated insight is deleted in any data space: the run stops at the missing org.
    [['--api-version', '68.0', '--data-space', 'other'], 'TARGET_ORG_REQUIRED'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        'bin/run.js',
        'data360',
        'delete',
        '-m',
        'calculated-insight:Synthetic__cio',
        ...arguments_,
        '--json',
      ],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(result.status, 1, result.stderr);
    const envelope = JSON.parse(result.stdout).result;
    assert.equal(envelope.contract, 'sf-data360-delete');
    assert.equal(envelope.status, 'blocked');
    assert.equal(envelope.diagnostics.errors[0].code, code);
    assert.deepEqual(envelope.result.items, []);
  }
});

test('publish parser blocks a missing source and unqualified scope before authentication', () => {
  for (const [arguments_, code] of [
    [[], 'INVALID_SELECTION'],
    [['-d', 'Synthetic__cio.calculatedInsight-meta.json'], 'UNSAFE_SOURCE'],
    [
      ['-d', 'Synthetic__cio.calculatedInsight-meta.json', '--api-version', '65.0'],
      'INVALID_SCOPE',
    ],
    [
      [
        '-d',
        'Synthetic__cio.calculatedInsight-meta.json',
        '--api-version',
        '68.0',
        '--data-space',
        'other',
      ],
      // A calculated insight is published in the run's data space; the file is read first.
      'UNSAFE_SOURCE',
    ],
    // A segment is published in the run's data space at API 68 only.
    [['-m', 'segment:Synthetic', '--api-version', '65.0'], 'INVALID_SCOPE'],
    [
      ['-d', 'Synthetic__cio.calculatedInsight-meta.json', '--api-version', '68.0', '--preview'],
      'UNSAFE_SOURCE',
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['bin/run.js', 'data360', 'publish', ...arguments_, '--json'],
      { encoding: 'utf8', env: environment },
    );
    assert.equal(result.status, 1, result.stderr);
    const envelope = JSON.parse(result.stdout).result;
    assert.equal(envelope.contract, 'sf-data360-publish');
    assert.equal(envelope.status, 'blocked');
    assert.equal(envelope.diagnostics.errors[0].code, code);
    assert.deepEqual(envelope.result.items, []);
  }
});

test('publish parser refuses --async with --wait-timeout before authentication', () => {
  const result = spawnSync(
    process.execPath,
    [
      'bin/run.js',
      'data360',
      'publish',
      '-m',
      'segment:Synthetic',
      '--async',
      '--wait-timeout',
      '60',
      '--json',
    ],
    { encoding: 'utf8', env: environment },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /cannot also be provided when using --async/u);
});

test('Git selector flag declares parser exclusivity against both existing modes', async () => {
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  assert.deepEqual(Deploy.flags['changed-since'].exclusive, ['source-dir', 'metadata']);
  assert.ok(Deploy.flags['source-dir'].exclusive.includes('changed-since'));
  assert.ok(Deploy.flags.metadata.exclusive.includes('changed-since'));
});

test('oclif discovers twenty IDs backed by exactly five canonical implementations', async () => {
  const config = await Config.load({ root: process.cwd() });
  assert.deepEqual(
    config.commandIDs.toSorted(),
    topics
      .flatMap((topic) => [
        `${topic}:deploy`,
        `${topic}:retrieve`,
        `${topic}:delete`,
        `${topic}:publish`,
        `${topic}:segment:members:export`,
      ])
      .toSorted(),
  );
  const members = await config.findCommand('data360:segment:members:export', { must: true }).load();
  assert.deepEqual(
    members.aliases,
    topics.slice(1).map((topic) => `${topic}:segment:members:export`),
  );
  for (const topic of topics.slice(1))
    assert.equal(
      await config.findCommand(`${topic}:segment:members:export`, { must: true }).load(),
      members,
    );
  const implementations = new Set();
  for (const operation of ['retrieve', 'deploy', 'delete', 'publish']) {
    const canonical = await config.findCommand(`data360:${operation}`, { must: true }).load();
    assert.deepEqual(
      canonical.aliases,
      topics.slice(1).map((topic) => `${topic}:${operation}`),
    );
    for (const topic of topics) {
      const implementation = await config
        .findCommand(`${topic}:${operation}`, { must: true })
        .load();
      assert.equal(implementation, canonical);
      assert.equal(implementation.flags, canonical.flags);
      const command = Object.create(implementation.prototype);
      command.config = { pjson: { version: '2.151.7' } };
      command.parse = async () => ({
        flags: { metadata: ['invalid'], 'api-version': '65.0', dataspace: 'default' },
      });
      command.jsonEnabled = () => true;
      command.resolveInputs = async () => [];
      command.resolveOrg =
        command.resolveTargetOrg =
        command.acquireNativeDmo =
        command.preflightNativeDmo =
        command.executeNativeDmo =
          () => assert.fail('Invalid alias input must not reach org resolution or services.');
      const previous = process.exitCode;
      try {
        const envelope = await command.run();
        assert.equal(process.exitCode, 1);
        assert.equal(envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
        assert.equal(envelope.metadata.plugin.name, 'sf-plugin-data');
        assert.equal(envelope.provenance.command, `sf data360 ${operation}`);
      } finally {
        process.exitCode = previous;
      }
      implementations.add(implementation);
    }
  }
  implementations.add(members);
  assert.equal(implementations.size, 5);
});

for (const topic of topics) {
  for (const operation of ['retrieve', 'deploy', 'delete', 'publish']) {
    test(`${topic} ${operation} preserves canonical validation and JSON identity`, async () => {
      const result = spawnSync(
        process.execPath,
        [
          'bin/run.js',
          topic,
          operation,
          ...(operation === 'publish' ? [] : ['-m', 'invalid']),
          '--json',
        ],
        { encoding: 'utf8', env: environment },
      );
      assert.equal(result.status, 1, result.stderr);
      const envelope = JSON.parse(result.stdout).result;
      assert.equal(envelope.contract, `sf-data360-${operation}`);
      assert.equal(envelope.provenance.command, `sf data360 ${operation}`);
      assert.equal(envelope.metadata.plugin.name, 'sf-plugin-data');
      assert.equal(envelope.status, 'blocked');
      assert.equal(envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
      assert.deepEqual(envelope.result.items, []);
    });
  }
}

test('segment members export refuses an invalid selection in a subprocess before auth', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/run.js', 'data360', 'segment', 'members', 'export', '-m', 'invalid', '--json'],
    { encoding: 'utf8', env: environment },
  );
  assert.equal(result.status, 1, result.stderr);
  const envelope = JSON.parse(result.stdout).result;
  assert.equal(envelope.contract, 'sf-data360-segment-members');
  assert.equal(envelope.provenance.command, 'sf data360 segment members export');
  assert.equal(envelope.status, 'blocked');
  assert.equal(envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
  assert.equal(envelope.result.rowsWritten, 0);
});
