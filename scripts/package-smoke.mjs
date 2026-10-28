import './check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyPackageInventory } from './package-inventory.mjs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
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
assert.equal(artifact.name, 'sf-plugin-data');
const sha256 = createHash('sha256')
  .update(readFileSync(path.join(root, artifact.filename)))
  .digest('hex');
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const sources = readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
  .map(
    (entry) =>
      `src/${path.relative(sourceRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`,
  );
verifyPackageInventory(sources, artifact);
assert.ok(artifact.files.some((file) => file.path === 'lib/services/execute-dmo-deploy.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/services/execute-dmo-deploy.d.ts'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/dmo-update-delta.js'));
assert.ok(artifact.files.some((file) => file.path === 'lib/artifacts/dmo-update-delta.d.ts'));
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
const runner = path.join(installation, 'node_modules', 'sf-plugin-data', 'bin', 'run.js');
let helpChecks = 0;
for (const command of ['data360', 'datacloud', 'd360', 'dc'].flatMap((topic) => [
  [topic],
  [topic, 'retrieve'],
  [topic, 'deploy'],
])) {
  const result = spawnSync(process.execPath, [runner, ...command, '--help'], {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Data360/u);
  if (command.length === 1) {
    assert.match(result.stdout, /retrieve/u);
    assert.match(result.stdout, /deploy/u);
  } else {
    assert.match(result.stdout, /ALIASES/u);
    for (const flag of [
      '--metadata',
      '--target-org',
      '--api-version',
      '--data-space',
      ...(command[1] === 'retrieve'
        ? ['--output-dir', '--overwrite']
        : ['--source-dir', '--preview']),
    ])
      assert.ok(result.stdout.includes(flag), flag);
  }
  helpChecks++;
}
// Exercise the installed command implementation, not only help or the source tree.
// Parsing and service boundaries are injected: no org resolution or remote work is reachable.
const packageRoot = path.dirname(path.dirname(runner));
const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'sf-plugin-data');
assert.equal(artifact.filename, `sf-plugin-data-${metadata.version}.tgz`);
assert.equal(metadata.version, '0.1.0');
const { Config } = await import(
  pathToFileURL(createRequire(path.join(packageRoot, 'package.json')).resolve('@oclif/core')).href
);
const config = await Config.load({ root: packageRoot });
assert.deepEqual(
  config.commandIDs.toSorted(),
  ['data360', 'datacloud', 'd360', 'dc']
    .flatMap((topic) => [`${topic}:deploy`, `${topic}:retrieve`])
    .toSorted(),
);
const implementations = new Set();
for (const operation of ['retrieve', 'deploy']) {
  const canonical = await config.findCommand(`data360:${operation}`, { must: true }).load();
  for (const topic of ['data360', 'datacloud', 'd360', 'dc']) {
    const implementation = await config.findCommand(`${topic}:${operation}`, { must: true }).load();
    assert.equal(implementation, canonical);
    implementations.add(implementation);
    const result = spawnSync(
      process.execPath,
      [runner, topic, operation, '-m', 'invalid', '--json'],
      {
        cwd: root,
        encoding: 'utf8',
        env: environment,
      },
    );
    assert.equal(result.status, 1, result.stderr);
    const envelope = JSON.parse(result.stdout).result;
    assert.equal(envelope.contract, `sf-data360-${operation}`);
    assert.equal(envelope.metadata.plugin.name, metadata.name);
    assert.equal(envelope.provenance.command, `sf data360 ${operation}`);
    assert.equal(envelope.status, 'blocked');
    assert.deepEqual(envelope.result.items, []);
    assert.equal(envelope.diagnostics.errors[0].code, 'INVALID_SELECTION');
  }
}
assert.equal(implementations.size, 2);
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
const { default: Deploy } = await import(
  pathToFileURL(path.join(packageRoot, 'lib', 'commands', 'data360', 'deploy.js')).href
);
const { executeDmoDeploy } = await import(
  pathToFileURL(path.join(packageRoot, 'lib', 'services', 'execute-dmo-deploy.js')).href
);
assert.equal(new Deploy([], {}).execute, executeDmoDeploy);
for (const scenario of ['preview-update', 'updated-noop', 'blocked-mixed', 'unknown']) {
  const command = Object.create(Deploy.prototype);
  const preview = scenario === 'preview-update';
  const inputs = ['First__dlm', 'Second__dlm', 'Third__dlm'].map((apiName) => ({
    path: `${apiName}.json`,
    document: { kind: 'dmo', identity: { apiName, dataSpace: 'default' } },
  }));
  const connection = {};
  command.parse = async () => ({
    flags: {
      preview,
      'source-dir': ['synthetic.json'],
      'api-version': '65.0',
      'data-space': 'default',
      'target-org': { getOrgId: () => 'synthetic-target', getConnection: () => connection },
    },
  });
  command.jsonEnabled = () => true;
  command.resolveInputs = async () => inputs;
  let admissions = 0;
  let executions = 0;
  command.preflight = async (_document, target, api, space, allowLabelUpdates) => {
    assert.equal(target, connection);
    assert.deepEqual(api, { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' });
    assert.equal(space, 'default');
    assert.equal(allowLabelUpdates, true);
    return {
      outcome: scenario === 'blocked-mixed' && ++admissions === 2 ? 'blocked-changes' : 'update',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
    };
  };
  command.execute = async () => {
    assert.equal(preview, false);
    executions++;
    if (scenario === 'unknown') throw new Error('private-update-response');
    return executions === 1
      ? { outcome: 'updated', mutation: 'confirmed-updated', diagnostics: [] }
      : { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const envelope = await command.run();
    const blocked = scenario === 'blocked-mixed';
    const unknown = scenario === 'unknown';
    assert.equal(envelope.status, blocked ? 'blocked' : unknown ? 'failed' : 'success');
    assert.equal(process.exitCode, blocked || unknown ? 1 : undefined);
    assert.equal(executions, preview || blocked ? 0 : unknown ? 1 : 3);
    assert.equal(
      envelope.result.items[0].outcome,
      preview ? 'update' : blocked ? 'not-attempted' : unknown ? 'failed' : 'updated',
    );
    if (!preview) {
      assert.equal(
        envelope.result.items[0].mutation,
        blocked ? 'not-attempted' : unknown ? 'unknown' : 'confirmed-updated',
      );
      assert.equal(
        envelope.result.items[2].outcome,
        blocked || unknown ? 'not-attempted' : 'unchanged',
      );
    }
    if (unknown)
      assert.match(envelope.diagnostics.errors[0].message, /Mutation may have occurred/u);
    assert.ok(!JSON.stringify(envelope).includes('private-update-response'));
  } finally {
    process.exitCode = previous;
  }
}
process.stdout.write(
  `${JSON.stringify({ root, artifact, sha256, helpChecks, aliasValidationChecks: 8, implementations: implementations.size, installedEnvelopeChecks: 6, hostVersion: '2.151.7', pluginVersion: metadata.version }, undefined, 2)}\n`,
);
