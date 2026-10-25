import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Config } from '@oclif/core';

// Retain run-owned isolated state; no deletion is performed by these tests.
const state = mkdtempSync(path.join(os.tmpdir(), 'data360-bootstrap-'));
const environment = {
  ...process.env,
  SF_STATE_FOLDER: path.join(state, 'sf'),
  SF_DISABLE_TELEMETRY: 'true',
  SF_AUTOUPDATE_DISABLE: 'true',
  XDG_CACHE_HOME: path.join(state, 'cache'),
  XDG_CONFIG_HOME: path.join(state, 'config'),
  XDG_DATA_HOME: path.join(state, 'data'),
};

for (const command of ['data360', 'data360 retrieve', 'data360 deploy']) {
  test(`${command} help loads without org authentication`, () => {
    const result = spawnSync(process.execPath, ['bin/run.js', ...command.split(' '), '--help'], {
      encoding: 'utf8',
      env: environment,
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Data360/u);
    if (command === 'data360 deploy') {
      for (const flag of [
        '--metadata',
        '--source-dir',
        '--preview',
        '--target-org',
        '--api-version',
        '--data-space',
      ])
        assert.ok(result.stdout.includes(flag), flag);
    }
    if (command === 'data360 retrieve') {
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
      timeout: 30_000,
    });
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    if (command === 'deploy') {
      assert.equal(output.result.status, 'blocked');
      assert.equal(output.result.diagnostics.errors[0].code, 'INVALID_SELECTION');
    } else {
      assert.equal(output.result.status, 'blocked');
      assert.equal(output.result.diagnostics.errors[0].code, 'RETRIEVE_SELECTION_NOT_IMPLEMENTED');
    }
  });
}

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
      { encoding: 'utf8', env: environment, timeout: 30_000 },
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

test('oclif discovers exactly the two approved command entry points', async () => {
  const config = await Config.load({ root: process.cwd() });
  assert.deepEqual(config.commandIDs.toSorted(), ['data360:deploy', 'data360:retrieve']);
});
