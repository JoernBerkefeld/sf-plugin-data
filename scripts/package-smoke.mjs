import './check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

// Keep the inspected artifact and isolated installation for audit; never recursively clean them.
const root = mkdtempSync(path.join(os.tmpdir(), 'data360-package-'));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this script through npm run smoke:package.');
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(?:SF|SFDX)_/iu.test(key)),
  ),
  USERPROFILE: root,
  HOME: root,
  SF_TARGET_ORG: 'offline-unconfigured-synthetic',
  SFDX_DEFAULTUSERNAME: 'offline-unconfigured-synthetic',
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
});
assert.equal(packed.status, 0, packed.stderr);
// Lifecycle output precedes npm's JSON result.
const [artifact] = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('[\n')));
assert.equal(artifact.name, '@joernberkefeld/sf-plugin-data360');
assert.equal(artifact.entryCount, 28);
assert.ok(artifact.files.some((file) => file.path === 'lib/plugin.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/plugin.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/execute-dmo-create.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/execute-dmo-create.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/read-deploy-input.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/read-deploy-input.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/preflight-dmo-deploy.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/preflight-dmo-deploy.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/write-other-dmo.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/write-other-dmo.d.ts'));
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
  { encoding: 'utf8', env: environment },
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
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Data360/u);
}
// Exercise the installed command implementation, not only help or the source tree.
// Parsing and service boundaries are injected: no org resolution or remote work is reachable.
const packageRoot = path.dirname(path.dirname(runner));
const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.equal(metadata.version, '0.1.0');
for (const operation of ['retrieve', 'deploy']) {
  const { default: Command } = await import(
    pathToFileURL(path.join(packageRoot, 'lib', 'commands', 'data360', `${operation}.js`)).href
  );
  const command = Object.create(Command.prototype);
  command.config = { pjson: { version: '2.151.7' } };
  command.parse = async () => ({
    flags: { 'api-version': '65.0', 'data-space': 'default', preview: true, metadata: ['invalid'] },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => [];
  command.resolveOrg = command.selectDocuments = () =>
    assert.fail('Must validate before auth or inventory.');
  command.acquire =
    command.writeDocument =
    command.preflight =
    command.execute =
      () => assert.fail('Offline installed provenance check must not reach any service.');
  const previous = process.exitCode;
  try {
    const envelope = await command.run();
    assert.equal(process.exitCode, 1);
    assert.equal(envelope.contract, `sf-data360-${operation}`);
    assert.equal(envelope.status, 'blocked');
    assert.deepEqual(envelope.metadata.plugin, {
      name: metadata.name,
      version: metadata.version,
    });
    assert.equal(envelope.provenance.pluginVersion, metadata.version);
    assert.equal(envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
    assert.deepEqual(envelope.result.items, []);
  } finally {
    process.exitCode = previous;
  }
}
process.stdout.write(
  `${JSON.stringify({ root, artifact, helpChecks: 3, installedEnvelopeChecks: 2, hostVersion: '2.151.7', pluginVersion: metadata.version }, undefined, 2)}\n`,
);
