import './check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Keep the inspected artifact and isolated installation for audit; never recursively clean them.
const root = mkdtempSync(path.join(os.tmpdir(), 'data360-package-'));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this script through npm run smoke:package.');
const environment = {
  ...process.env,
  SF_STATE_FOLDER: path.join(root, 'sf'),
  SF_DISABLE_TELEMETRY: 'true',
  SF_AUTOUPDATE_DISABLE: 'true',
  XDG_CACHE_HOME: path.join(root, 'cache'),
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'),
};
const packed = spawnSync(process.execPath, [npm, 'pack', '--pack-destination', root, '--json'], {
  encoding: 'utf8',
  env: environment,
  timeout: 60_000,
});
assert.equal(packed.status, 0, packed.stderr);
// Lifecycle output precedes npm's JSON result.
const [artifact] = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('[\n')));
assert.equal(artifact.name, '@joernberkefeld/sf-plugin-data360');
assert.equal(artifact.entryCount, 18);
assert.ok(artifact.files.some((file) => file.path === 'lib/services/retrieve-other-dmo.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/retrieve-other-dmo.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/dmo-document.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/dmo-document.d.ts'));
const installation = path.join(root, 'installation');
const installed = spawnSync(
  process.execPath,
  [
    npm,
    'install',
    '--prefix',
    installation,
    path.join(root, artifact.filename),
    '--no-workspaces',
    '--ignore-scripts',
  ],
  { encoding: 'utf8', env: environment, timeout: 180_000 },
);
assert.equal(installed.status, 0, installed.stderr);
const runner = path.join(
  installation,
  'node_modules',
  '@joernberkefeld',
  'sf-plugin-data360',
  'bin',
  'run.js',
);
for (const command of [[], ['retrieve'], ['deploy']]) {
  const result = spawnSync(process.execPath, [runner, 'data360', ...command, '--help'], {
    cwd: root,
    encoding: 'utf8',
    env: environment,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Data360/u);
}
process.stdout.write(`${JSON.stringify({ root, artifact, helpChecks: 3 }, undefined, 2)}\n`);
