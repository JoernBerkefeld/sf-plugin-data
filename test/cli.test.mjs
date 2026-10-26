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

test('API flags opt into exact latest while preserving core numeric validation and defaults', async () => {
  const { default: Retrieve } = await import('../lib/commands/data360/retrieve.js');
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  for (const command of [Retrieve, Deploy]) {
    const flag = command.flags['api-version'];
    assert.equal(flag.default, '65.0');
    assert.equal(await flag.parse('latest', {}, {}), 'latest');
    assert.equal(await flag.parse('65.0', {}, {}), '65.0');
    for (const invalid of ['Latest', 'v65.0', '65', 'latest ', '20.0'])
      await assert.rejects(flag.parse(invalid, {}, {}));
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
              org = cached ? await flag.parse('offline-unconfigured-synthetic', {}, {}) : await flag.default();
              assert.equal(org.getConnection().getApiVersion(), '65.0');
              assert.equal(requests.length, before, 'parse-time auth must not discover');
              assert.equal(await flag.defaultHelp(), 'offline-unconfigured-synthetic');
            }
            command.parse = async () => ({ flags: {
              'api-version': requested, 'data-space': 'default',
              'target-org': org, metadata: ['dmo:Sample__dlm'], preview: true,
            } });
            command.jsonEnabled = () => true;
            command.selectDocuments = async (connection) => {
              assert.equal(connection.getApiVersion(), '65.0');
              return [];
            };
            command.resolveInputs = async () => [{ path: 'synthetic.json', document: {} }];
            command.preflight = async () => ({ outcome: 'unchanged', diagnostics: [] });
            const envelope = await command.run();
            assert.equal(requests.length - before, requested === 'latest' ? 1 : 0);
            assert.equal(envelope.status, requested === 'latest' && failDiscovery ? 'blocked' : 'success');
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
for (const command of topics.flatMap((topic) => [topic, `${topic} retrieve`, `${topic} deploy`])) {
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
        '--preview',
        '--target-org',
        '--api-version',
        '--data-space',
      ])
        assert.ok(result.stdout.includes(flag), flag);
    }
    if (command.endsWith(' retrieve')) {
      for (const flag of [
        '--metadata',
        '--output-dir',
        '--overwrite',
        '--target-org',
        '--api-version',
        '--data-space',
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
  assert.equal(JSON.parse(invalid.stdout).result.diagnostics.errors[0].code, 'INVALID_SELECTION');
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
    assert.equal(output.result.metadata.apiVersion, '65.0');
    assert.equal(output.result.result.scope.dataSpace, 'default');
    assert.equal(output.result.status, 'blocked');
    assert.ok(
      ['INVALID_SELECTION', 'UNSAFE_SOURCE'].includes(output.result.diagnostics.errors[0].code),
    );
    assert.deepEqual(output.result.result.items, []);
  }
});

test('Git selector flag declares parser exclusivity against both existing modes', async () => {
  const { default: Deploy } = await import('../lib/commands/data360/deploy.js');
  assert.deepEqual(Deploy.flags['changed-since'].exclusive, ['source-dir', 'metadata']);
  assert.ok(Deploy.flags['source-dir'].exclusive.includes('changed-since'));
  assert.ok(Deploy.flags.metadata.exclusive.includes('changed-since'));
});

test('oclif discovers eight IDs backed by exactly two canonical implementations', async () => {
  const config = await Config.load({ root: process.cwd() });
  assert.deepEqual(
    config.commandIDs.toSorted(),
    topics.flatMap((topic) => [`${topic}:deploy`, `${topic}:retrieve`]).toSorted(),
  );
  const implementations = new Set();
  for (const operation of ['retrieve', 'deploy']) {
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
        flags: { metadata: ['invalid'], 'api-version': '65.0', 'data-space': 'default' },
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
  assert.equal(implementations.size, 2);
});

for (const topic of topics) {
  for (const operation of ['retrieve', 'deploy']) {
    test(`${topic} ${operation} preserves canonical validation and JSON identity`, async () => {
      const result = spawnSync(
        process.execPath,
        ['bin/run.js', topic, operation, '-m', 'invalid', '--json'],
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
