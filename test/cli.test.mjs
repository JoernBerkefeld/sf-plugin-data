import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
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

test('README documents the native mapping lifecycle without obsolete XML-only or batch claims', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const mapping = readme
    .split('### DLO-to-DMO mapping: native definition CRUD')[1]
    ?.split('### DMO field relationship:')[0]
    .replaceAll(/\s+/gu, ' ');
  assert.ok(mapping, 'native mapping workflow must be documented');
  for (const required of [
    'data360/mapping/<name>.mapping-meta.json',
    'explicit numeric pins are preserved',
    'planned-dependencies',
    'the desired pair set',
    'one names-only, selector-free PATCH',
    'installed public API68 Text reconciliation acceptance below',
    'Installed creation/reconciliation acceptance is API68',
    'passed removal of A with batch addition of D/E',
    'B-to-C same-source/new-target retargeting and F-to-D new-source/same-target retargeting',
    'sequentially on the same empty fixture',
    'Each reconciliation preview and repeat performed zero writes',
    'Exact desired pairs, retained selectors, full DLO state and DMO schema/nonflag properties',
    'allowing only expected `isMapped` changes',
    'Full raw DMO preservation is therefore not claimed across reconciliation',
    'does not qualify installed Number removal',
    'not populated-object, cross-org, arbitrary-schema or all-version qualification',
    'Installed API61 and API68 public deletion acceptance each unmapped two authored identity Text pairs',
    'exactly three DELETE responses of HTTP `204`',
    'typed selected-mapping `404`',
    'the unchanged survivor and exact fixture inventory',
    'Last-for-DMO preview and execution were both blocked with zero writes at API61/68',
    'API61 fixtures were provisioned at API68; this does not qualify API61 creation',
    'API62..67 are an explicitly accepted compatibility assumption, not live-qualified',
    'not successful public bare/type inventory retrieval acceptance',
    'Desired-state removal/retarget remains API68-only',
    'zero-write repeat',
    'DMO GET has no status field',
    'last mapping for a DMO is blocked before any unmaps',
    '`--preview` performs zero writes',
    'all five metadata-qualified protected pairs',
    'DMO `Count__c`/`Gamma__c` fields',
    'MAPPING_PARENT_CHANGED',
    'An already-absent mapping is conservatively blocked without writes',
    'unchanged-on-404 handling applies only to native DLO/DMO deletion',
    'non-last native DELETE HTTP `204`',
    'complete pre-final schema',
    'Desired-state deployment uses the same',
  ])
    assert.ok(mapping.includes(required), `missing mapping contract: ${required}`);
  for (const obsolete of [
    'There is no public plugin Delete command',
    'Exact API65/default opaque XML export only',
    'pending public plugin integration acceptance',
    'installed public reconciliation acceptance remains separate',
    'installed mapping lifecycle acceptance is API68 only',
    'This does not claim installed API61 CLI acceptance',
    'installed deletion acceptance remains separate',
    'mixed-family deployment remain blocked',
    'The whole\nselection is preflighted before any executor call',
  ])
    assert.ok(!readme.includes(obsolete), `obsolete README contract: ${obsolete}`);
  assert.match(readme, /Native batches instead\s+order DLO, DMO, mapping/u);
});

test('README describes optional scope without promoting nondefault qualification or changing CRUD ratings', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const text of [
    'optional `--dataspace NAME`',
    '`--data-space` is a compatibility alias',
    'Neither spelling has a CLI default',
    'required `dataspaceInfo` membership comes from the',
    'without injecting `dataspace=default`',
    'not live nondefault-space',
    'Legacy families and dependency',
    'ambiguous same-name inventory remains blocked',
  ])
    assert.ok(readme.includes(text), text);
  const table = readme.split('| Resource ')[1].split('The scope notes summarize')[0];
  assert.equal(
    table.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---')).length,
    14,
  );
  for (const resource of ['Data Model Objects', 'DLO-to-DMO mappings'])
    assert.match(
      table.split('\n').find((line) => line.includes(resource)),
      /Partial/u,
    );
});

test('delete help discloses guarded unmap-first deletion and bounded qualification', async () => {
  const { default: Delete } = await import('../lib/commands/data360/delete.js');
  assert.match(Delete.summary, /qualified non-last mapping/u);
  for (const text of [
    'unmapped first',
    'last mapping for a DMO is blocked before any unmaps',
    'all five metadata-qualified protected pairs',
    'empty custom fixtures',
    '--preview performs zero writes',
    'partial failure stops the batch',
    'no local deletion, parent DELETE, retries or rollback',
  ])
    assert.ok(Delete.description.includes(text), text);
  assert.ok(!Delete.description.includes('No cascade'));
});

test('API flags opt into exact latest while preserving core numeric validation and defaults', async () => {
  const { default: Retrieve } = await import('../lib/commands/data360/retrieve.js');
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  for (const command of [Retrieve, Deploy]) {
    const flag = command.flags['api-version'];
    assert.equal(flag.default, 'auto');
    assert.equal(await flag.parse('latest', {}, {}), 'latest');
    assert.equal(await flag.parse('auto', {}, {}), 'auto');
    assert.equal(await flag.parse('65.0', {}, {}), '65.0');
    for (const invalid of ['Latest', 'v65.0', '65', 'latest ', '20.0'])
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

test('actual core initialization never discovers or saves cached versions before guarded command discovery', () => {
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
    Connection.prototype.request = async function(request, options) {
      requests.push(request);
      assert.deepEqual(request, { method: 'GET', url: '/services/data' });
      assert.equal(this.getApiVersion(), '65.0');
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      assert.throws(options.followRedirect);
      if (fields.failDiscovery) throw new Error('private-discovery-token');
      return [{ version: '65.0' }];
    };
    for (const cached of [false, true]) {
      for (const requested of ['65.0', 'latest']) {
        for (const kind of ['retrieve', 'deploy']) {
          for (const failDiscovery of [false, true]) {
            fields = { orgId: '00Dsynthetic', failDiscovery, ...(cached ? {
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
              assert.equal(org.getConnection().getApiVersion(), '65.0');
              assert.equal(requests.length, before, 'explicit auth must not discover');
            }
            command.parse = async () => ({ flags: {
              'api-version': requested, dataspace: 'default',
              'target-org': org, metadata: ['dmo'], preview: true,
            } });
            command.jsonEnabled = () => true;
            command.selectDocuments = async (connection) => {
              assert.equal(connection.getApiVersion(), '65.0');
              return [];
            };
            command.listNativeNames = async () => [];
            command.listNativeMappingNames = async () => [];
            command.resolveInputs = async () => [{ path: 'synthetic.json', document: {} }];
            command.preflight = async () => ({ outcome: 'unchanged', diagnostics: [] });
            const envelope = await command.run();
            assert.equal(requests.length - before, requested === 'latest' ? 1 : 0);
            assert.equal(envelope.status, requested === 'latest' && failDiscovery ? 'blocked' : 'success', JSON.stringify(envelope));
            assert.ok(!JSON.stringify(envelope).includes('private-discovery-token'));
            if (requested === 'latest' && failDiscovery)
              assert.equal(envelope.diagnostics.errors[0].code, 'API_VERSION_DISCOVERY_FAILED');
            process.exitCode = undefined;
          }
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
      for (const flag of ['--source-dir', '--confirm-delete', '--metadata', '--preview'])
        assert.ok(result.stdout.includes(flag), flag);
    }
    if (command.endsWith(' publish')) {
      for (const flag of [
        '--source-dir',
        '--preview',
        '--allow-processing',
        '--api-version',
        '--dataspace',
      ])
        assert.ok(result.stdout.includes(flag), flag);
      assert.ok(!result.stdout.includes('--metadata'));
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

test('CI delete parser rejects unbound or unqualified intent before authentication', () => {
  for (const [arguments_, code] of [
    [[], 'INVALID_SCOPE'],
    [['--api-version', '68.0'], 'INVALID_SELECTION'],
    [
      ['--api-version', '68.0', '-d', 'Synthetic.calculatedInsight.json', '--data-space', 'other'],
      'INVALID_SCOPE',
    ],
    [
      ['--api-version', '68.0', '-d', 'Synthetic.calculatedInsight.json', '--preview'],
      'UNSAFE_SOURCE',
    ],
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

test('publish parser blocks missing pairs and unqualified scope before authentication', () => {
  for (const [arguments_, code] of [
    [[], 'INVALID_SELECTION'],
    [['-d', 'Synthetic.calculatedInsight.json'], 'INVALID_SCOPE'],
    [
      ['-d', 'Synthetic.calculatedInsight.json', '--api-version', '68.0', '--data-space', 'other'],
      'INVALID_SCOPE',
    ],
    [
      ['-d', 'Synthetic.calculatedInsight.json', '--api-version', '68.0', '--preview'],
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

test('Git selector flag declares parser exclusivity against both existing modes', async () => {
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  assert.deepEqual(Deploy.flags['changed-since'].exclusive, ['source-dir', 'metadata']);
  assert.ok(Deploy.flags['source-dir'].exclusive.includes('changed-since'));
  assert.ok(Deploy.flags.metadata.exclusive.includes('changed-since'));
});

test('oclif discovers sixteen IDs backed by exactly four canonical implementations', async () => {
  const config = await Config.load({ root: process.cwd() });
  assert.deepEqual(
    config.commandIDs.toSorted(),
    topics
      .flatMap((topic) => [
        `${topic}:deploy`,
        `${topic}:retrieve`,
        `${topic}:delete`,
        `${topic}:publish`,
      ])
      .toSorted(),
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
        command.selectDocuments =
        command.acquire =
        command.preflight =
        command.execute =
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
  assert.equal(implementations.size, 4);
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
