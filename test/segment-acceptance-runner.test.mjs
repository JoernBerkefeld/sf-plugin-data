import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  assertSegmentProcessCount,
  createSegmentAcceptanceRunner,
} from '../scripts/segment-acceptance-runner.mjs';

test('kernel process reconciliation rejects missing, invalid, excess and deficient receipts', () => {
  for (const totalProcesses of [undefined, 0, -1, 1.5, 4, 2]) {
    const evidence = { totalProcesses };
    assert.throws(
      () => assertSegmentProcessCount(evidence, 3),
      (error) => {
        assert.match(error.message, /kernel process count mismatch/u);
        assert.equal(error.evidence, evidence);
        return true;
      },
    );
  }
  assert.doesNotThrow(() => assertSegmentProcessCount({ totalProcesses: 3 }, 3));
  assert.doesNotThrow(() => assertSegmentProcessCount({ totalProcesses: 1 }, 1));
});

const observer = fileURLToPath(
  new URL('../scripts/segment-acceptance-observer.mjs', import.meta.url),
);
const require = createRequire(import.meta.url);
const cost = { orgProcesses: 4, metadataJobs: 1, logicalReads: 4, milliseconds: 600_000 };

/**
 * Create retained run-owned synthetic code, forwarding existing transport classes without installing dependencies.
 * @param {string} mode Synthetic workload outcome.
 * @returns {Promise<object>} Exact synthetic profile and retained ownership root.
 */
async function synthetic(mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'segment-runner-'));
  await writeFile(path.join(root, '.segment-acceptance-owner'), randomUUID(), { flag: 'wx' });
  // Temporary forwarding modules only expose the existing installed classes to the fixed binding inventory.
  const library = path.join(root, 'node_modules/@jsforce/jsforce-node/lib');
  await mkdir(path.join(library, 'util'), { recursive: true });
  await writeFile(
    path.join(library, '../package.json'),
    JSON.stringify({ version: '0.0.0-synthetic' }),
  );
  for (const name of ['transport.js', 'util/promise.js', 'http-api.js']) {
    await writeFile(
      path.join(library, name),
      `module.exports = require(${JSON.stringify(require.resolve(`@jsforce/jsforce-node/lib/${name}`))});\n`,
    );
  }
  const entry = path.join(root, 'entry.cjs');
  await writeFile(
    entry,
    String.raw`
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
(async () => {
  const stageFile = ${JSON.stringify(path.join(root, 'stage'))};
  let depth = 0;
  try { depth = Number(await fs.readFile(stageFile, 'utf8')); } catch {}
  await fs.writeFile(stageFile, String(depth + 1));
  process.stdout.write('stdout-' + depth + '\n');
  process.stderr.write('stderr-' + depth + '\n');
  if (depth < 2) {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'data360-metadata-'));
    await new Promise((resolve, reject) => {
      cp.execFile(process.execPath, [${JSON.stringify(entry)}, 'project', 'retrieve', 'start',
        '--metadata', 'MarketSegmentDefinition:Selected', '--target-org', 'synthetic',
        '--api-version', '65.0', '--wait', '5', '--json'], {
          cwd, timeout:330000, maxBuffer:4194304, windowsHide:true,
          env:{...process.env, SF_AUTOUPDATE_DISABLE:'true', SF_DISABLE_TELEMETRY:'true',
            SF_DISABLE_SOURCE_MEMBER_POLLING:'true'}
        }, (error, stdout, stderr) => {
          process.stdout.write(stdout); process.stderr.write(stderr);
          if(error) reject(error); else resolve();
        });
    });
  }
  if (${JSON.stringify(mode)} === 'failure' && depth === 2) process.exitCode = 7;
  if (${JSON.stringify(mode)} === 'overflow' && depth === 0) process.stdout.write('x'.repeat(100000));
  if (${JSON.stringify(mode)} === 'cancel') {
    await fs.writeFile(${JSON.stringify(path.join(root, 'waiting'))}, 'ready');
    setInterval(() => {}, 1000);
  }
})().catch((error) => { console.error(error); process.exitCode = 9; });
`,
  );
  return {
    root,
    profile: {
      executable: process.execPath,
      cliEntry: entry,
      launcherEntry: entry,
      importOrigin: observer,
      cwd: process.cwd(),
      orgId: '00D000000000001AAA',
      targetOrg: 'synthetic',
      origin: 'https://source.example',
      apiVersion: '65.0',
      segment: 'Selected',
      dmo: 'Profile__dlm',
      field: 'Id__c',
    },
  };
}

for (const mode of ['success', 'failure', 'overflow', 'cancel']) {
  test(
    `Windows preloaded root/child/grandchild ${mode}`,
    { skip: process.platform !== 'win32' },
    async () => {
      const { profile, root } = await synthetic(mode);
      const runner = await createSegmentAcceptanceRunner(profile);
      runner.beginPhase('baseline', cost, cost);
      let poll;
      try {
        if (mode === 'cancel') {
          poll = setInterval(() => {
            void readFile(path.join(root, 'waiting'), 'utf8').then(
              () => runner.stop('synthetic external cancellation'),
              () => {},
            );
          }, 50);
        }
        const operation = runner.runRoot({
          operation: 'historical-launcher',
          timeoutMs: 30_000,
          deadline: Date.now() + 30_000,
          maxOutputBytes: mode === 'overflow' ? 1024 : 65_536,
        });
        if (mode === 'success') {
          const result = await operation;
          assert.equal(Boolean(result.audit.stopped), false);
          assert.equal(result.audit.used.orgProcesses, 3);
          assert.deepEqual(result.audit.pending, []);
          assert.equal(result.evidence.stdout.toString(), 'stdout-0\nstdout-1\nstdout-2\n');
          assert.equal(result.evidence.stderr.toString(), 'stderr-0\nstderr-1\nstderr-2\n');
          assert.equal(result.evidence.outputDrained, true);
          assert.equal(result.evidence.rootExited, true);
          assert.equal(result.evidence.activeProcessesZero, true);
          assert.equal(result.evidence.totalProcesses, 3);
          // A second distinct builder root must get the same preload, ledger and fresh owned Job.
          const second = await runner.runRoot({
            operation: 'segment-preview',
            timeoutMs: 30_000,
            deadline: Date.now() + 30_000,
          });
          assert.equal(second.audit.used.orgProcesses, 4);
          assert.equal(second.evidence.totalProcesses, 1);
          assert.deepEqual(second.audit.pending, []);
          assert.equal(second.evidence.stdout.toString(), 'stdout-3\n');
          assert.equal(second.evidence.outputDrained, true);
          assert.equal(second.evidence.activeProcessesZero, true);
        } else {
          await assert.rejects(operation, (error) => {
            assert.ok(error.audit.stopped);
            assert.equal(error.audit.used.orgProcesses, 3);
            assert.equal(error.evidence.assignedBeforeResume, true);
            assert.equal(error.evidence.rootExited, true);
            assert.equal(error.evidence.activeProcessesZero, true);
            assert.equal(error.evidence.outputDrained, true);
            assert.ok(error.evidence.stdout.toString().includes('stdout-0'));
            assert.ok(error.evidence.stderr.toString().includes('stderr-0'));
            if (mode === 'overflow') assert.equal(error.evidence.outputTruncated, true);
            return true;
          });
        }
      } finally {
        clearInterval(poll);
        await runner.close();
      }
    },
  );
}

test('root operation outside fixed builder stops before any debit', async () => {
  const { profile } = await synthetic('success');
  const runner = await createSegmentAcceptanceRunner(profile);
  try {
    runner.beginPhase('baseline', cost, cost);
    await assert.rejects(
      runner.runRoot({ operation: 'arbitrary', timeoutMs: 5000, deadline: Date.now() + 5000 }),
    );
    assert.equal(runner.audit().used.orgProcesses, 0);
    assert.ok(runner.audit().stopped);
  } finally {
    await runner.close();
  }
});
