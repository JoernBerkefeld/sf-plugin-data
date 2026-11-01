import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ownedProcessDeadline, runOwnedProcess } from '../scripts/segment-acceptance-process.mjs';

const windows = process.platform === 'win32';
const pipedChild = (script) =>
  `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(script)}],{windowsHide:false,stdio:['pipe','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr)`;
const options = (extra = {}) => ({
  executable: process.execPath,
  args: ['-e', 'process.exit(0)'],
  cwd: process.cwd(),
  env: { ...process.env },
  deadline: Date.now() + 30_000,
  timeoutMs: 30_000,
  onDispatch() {},
  ...extra,
});

test('deadline takes minimum remaining all-in allowance without resetting setup clock', () => {
  assert.equal(ownedProcessDeadline(1500, 1000, 1000), 1500);
  assert.equal(ownedProcessDeadline(5000, 1000, 1000), 2000);
  for (const timeoutMs of [0, -1, 600_001, Number.NaN, 1.5]) {
    assert.throws(() => ownedProcessDeadline(5000, timeoutMs, 1000));
  }
  assert.throws(() => ownedProcessDeadline(1000, 10, 1000));
});

test('unsupported platforms fail closed', { skip: windows }, async () => {
  await assert.rejects(runOwnedProcess(options()), /requires Windows/u);
});

test(
  'invalid descriptors and already cancelled work never launch',
  { skip: !windows },
  async () => {
    let dispatched = 0;
    const onDispatch = () => dispatched++;
    await assert.rejects(
      runOwnedProcess(options({ executable: 'node.exe', onDispatch })),
      /Invalid exact/u,
    );
    await assert.rejects(
      runOwnedProcess(options({ env: { Path: 'x', PATH: 'y' }, onDispatch })),
      /duplicate/u,
    );
    await assert.rejects(
      runOwnedProcess(options({ signal: AbortSignal.abort(), onDispatch })),
      /already cancelled/u,
    );
    await assert.rejects(
      runOwnedProcess(options({ maxOutputBytes: 0, onDispatch })),
      /Invalid exact/u,
    );
    await assert.rejects(
      runOwnedProcess(options({ timeoutMs: 1000, onDispatch })),
      /termination reservation/u,
    );
    assert.equal(dispatched, 0);
  },
);

test(
  'dispatch admission happens before launch and cannot extend the clock',
  { skip: !windows },
  async () => {
    let dispatched = 0;
    await assert.rejects(
      runOwnedProcess(
        options({
          onDispatch() {
            dispatched++;
            throw new Error('admission denied');
          },
        }),
      ),
      /admission denied/u,
    );
    assert.equal(dispatched, 1);
    const controller = new AbortController();
    await assert.rejects(
      runOwnedProcess(
        options({
          signal: controller.signal,
          onDispatch() {
            controller.abort();
          },
        }),
      ),
      /before launch/u,
    );
  },
);

test(
  'real suspended launch records exit and kernel zero-active evidence',
  { skip: !windows },
  async () => {
    let dispatched = 0;
    const receipt = await runOwnedProcess(
      options({
        onDispatch() {
          dispatched++;
        },
      }),
    );
    assert.equal(dispatched, 1);
    assert.equal(receipt.assignedBeforeResume, true);
    assert.equal(receipt.rootExited, true);
    assert.equal(receipt.activeProcessesZero, true);
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.totalProcesses, 1);
  },
);

test(
  'real root child grandchild counts exactly three processes without console hosts',
  { skip: !windows },
  async () => {
    const grandchild = "process.stdout.write('grandchild');process.stderr.write('grand-error')";
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']})`;
    const root = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:['ignore','inherit','inherit']})`;
    const receipt = await runOwnedProcess(options({ args: ['-e', root] }));
    assert.equal(receipt.totalProcesses, 3);
    assert.equal(receipt.stdout.toString(), 'grandchild');
    assert.equal(receipt.stderr.toString(), 'grand-error');
    assert.equal(receipt.assignedBeforeResume, true);
    assert.equal(receipt.rootExited, true);
    assert.equal(receipt.activeProcessesZero, true);
    assert.equal(receipt.outputDrained, true);
  },
);

test(
  'all-pipe descendants share the hidden helper console when windowsHide is false',
  { skip: !windows },
  async () => {
    const grandchild = "process.stdout.write('out');process.stderr.write('err')";
    const receipt = await runOwnedProcess(
      options({ args: ['-e', pipedChild(pipedChild(grandchild))] }),
    );
    assert.equal(receipt.totalProcesses, 3);
    assert.equal(receipt.stdout.toString(), 'out');
    assert.equal(receipt.stderr.toString(), 'err');
    assert.equal(receipt.outputDrained, true);
    assert.equal(receipt.activeProcessesZero, true);
  },
);

test('nonzero exit throws with verified tree-exit evidence', { skip: !windows }, async () => {
  await assert.rejects(runOwnedProcess(options({ args: ['-e', 'process.exit(7)'] })), (error) => {
    assert.equal(error.evidence.exitCode, 7);
    assert.equal(error.evidence.rootExited, true);
    assert.equal(error.evidence.activeProcessesZero, true);
    return true;
  });
});

test(
  'failed executable creation is charged and has no resumed workload',
  { skip: !windows },
  async () => {
    let dispatched = 0;
    await assert.rejects(
      runOwnedProcess(
        options({
          executable: path.join(process.cwd(), 'does-not-exist.exe'),
          onDispatch() {
            dispatched++;
          },
        }),
      ),
      (error) => {
        assert.equal(dispatched, 1);
        assert.equal(error.evidence.resumed, false);
        assert.equal(error.evidence.activeProcessesZero, true);
        return true;
      },
    );
  },
);

test(
  'real owned child/grandchild timeout proves the entire kernel job empty',
  { skip: !windows },
  async () => {
    // Retained run-owned fixtures only: no network, org, installation, or deletion.
    const root = await mkdtemp(path.join(os.tmpdir(), 'segment-owned-process-'));
    const owner = randomUUID();
    await writeFile(path.join(root, 'ownership.txt'), owner);
    const marker = path.join(root, 'grandchild-ready.txt');
    const grandchild = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(owner)});setInterval(()=>{},1000)`;
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
    await assert.rejects(
      runOwnedProcess(
        options({ args: ['-e', child], timeoutMs: 8000, deadline: Date.now() + 8000 }),
      ),
      (error) => {
        assert.equal(error.evidence.reason, 'timeout');
        assert.equal(error.evidence.assignedBeforeResume, true, JSON.stringify(error.evidence));
        assert.equal(error.evidence.rootExited, true);
        assert.equal(error.evidence.activeProcessesZero, true);
        assert.ok(error.evidence.totalProcesses >= 2);
        return true;
      },
    );
    assert.equal(await readFile(marker, 'utf8'), owner);
  },
);

test(
  'cancellation after admission terminates a real owned workload',
  { skip: !windows },
  async () => {
    const controller = new AbortController();
    const deadline = Date.now() + 10_000;
    const grandchild =
      "process.stdout.write('cancel-out');process.stderr.write('cancel-err');setInterval(()=>{},1000)";
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000)`;
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      await assert.rejects(
        runOwnedProcess(options({ args: ['-e', child], signal: controller.signal, deadline })),
        (error) => {
          assert.equal(error.evidence.reason, 'cancelled');
          assert.equal(error.evidence.stdout.toString(), 'cancel-out');
          assert.equal(error.evidence.stderr.toString(), 'cancel-err');
          assert.equal(error.evidence.outputDrained, true);
          assert.ok(error.evidence.totalProcesses >= 2);
          assert.ok(error.evidence.finishedAt <= deadline);
          assert.equal(error.evidence.rootExited, true);
          assert.equal(error.evidence.activeProcessesZero, true);
          return true;
        },
      );
    } finally {
      clearTimeout(timer);
    }
  },
);

test(
  'Windows argv quoting preserves literal spaces, quotes and trailing backslashes',
  { skip: !windows },
  async () => {
    const values = ['', 'space here', 'quote"here', 'trailing\\\\', String.raw`before\\"quote`];
    const script = `require('node:assert/strict').deepEqual(process.argv.slice(1),${JSON.stringify(values)})`;
    const receipt = await runOwnedProcess(options({ args: ['-e', script, ...values] }));
    assert.equal(receipt.exitCode, 0);
  },
);

test('root normal exit cannot leave its owned descendants alive', { skip: !windows }, async () => {
  const child =
    "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref()";
  const receipt = await runOwnedProcess(options({ args: ['-e', child] }));
  assert.equal(receipt.rootExited, true);
  assert.equal(receipt.activeProcessesZero, true);
});

test(
  'concurrent child and grandchild streams preserve binary bytes and drain',
  { skip: !windows },
  async () => {
    const bytes = Buffer.from([0, 255, 128, 13, 10]);
    const grandchild = `process.stdout.write(Buffer.from([0,255,128,13,10]));process.stderr.write('grand-error');`;
    const child = `process.stdout.write('root-out');process.stderr.write('root-error');require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']});`;
    const receipt = await runOwnedProcess(options({ args: ['-e', child] }));
    assert.deepEqual(receipt.stdout, Buffer.concat([Buffer.from('root-out'), bytes]));
    assert.equal(receipt.stderr.toString(), 'root-errorgrand-error');
    assert.equal(receipt.outputDrained, true);
    assert.equal(receipt.outputTruncated, false);
    assert.ok(receipt.totalProcesses >= 2);
  },
);

test(
  'simultaneous large streams do not block each other or exceed protocol framing',
  { skip: !windows },
  async () => {
    const receipt = await runOwnedProcess(
      options({
        args: [
          '-e',
          'process.stdout.write(Buffer.alloc(200000,65));process.stderr.write(Buffer.alloc(200000,66))',
        ],
        maxOutputBytes: 400_000,
      }),
    );
    assert.deepEqual(receipt.stdout, Buffer.alloc(200_000, 65));
    assert.deepEqual(receipt.stderr, Buffer.alloc(200_000, 66));
    assert.equal(receipt.capturedBytes, 400_000);
  },
);

test(
  'output overflow stops a real tree and retains bounded partial streams',
  { skip: !windows },
  async () => {
    const grandchild =
      'process.stdout.write(Buffer.alloc(9000,71));process.stderr.write(Buffer.alloc(9000,72));setInterval(()=>{},1000)';
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000)`;
    await assert.rejects(
      runOwnedProcess(options({ args: ['-e', child], maxOutputBytes: 10_000 })),
      (error) => {
        assert.equal(error.evidence.reason, 'output-overflow');
        assert.equal(error.evidence.stdout.length + error.evidence.stderr.length, 10_000);
        assert.equal(error.evidence.outputTruncated, true);
        assert.equal(error.evidence.outputDrained, true);
        assert.equal(error.evidence.rootExited, true);
        assert.equal(error.evidence.activeProcessesZero, true);
        assert.ok(error.evidence.totalProcesses >= 2);
        return true;
      },
    );
  },
);

test(
  'root exit drains inherited streams after terminating lingering grandchild',
  { skip: !windows },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'segment-owned-process-'));
    await writeFile(path.join(root, 'ownership.txt'), randomUUID());
    const marker = path.join(root, 'ready');
    const grandchild = `process.stdout.write('grand-out');process.stderr.write('grand-err');require('node:fs').writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000)`;
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']}).unref();const timer=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(marker)})){clearInterval(timer);process.exit(0)}},10)`;
    const receipt = await runOwnedProcess(options({ args: ['-e', child] }));
    assert.equal(receipt.stdout.toString(), 'grand-out');
    assert.equal(receipt.stderr.toString(), 'grand-err');
    assert.equal(receipt.outputDrained, true);
    assert.equal(receipt.activeProcessesZero, true);
  },
);

test(
  'timeout reserves teardown inside absolute deadline and preserves both streams',
  { skip: !windows },
  async () => {
    const deadline = Date.now() + 6000;
    const grandchild =
      "process.stdout.write('out');process.stderr.write('err');setInterval(()=>{},1000)";
    const child = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000)`;
    await assert.rejects(
      runOwnedProcess(options({ args: ['-e', child], deadline, timeoutMs: 6000 })),
      (error) => {
        assert.equal(error.evidence.reason, 'timeout');
        assert.equal(error.evidence.stdout.toString(), 'out');
        assert.equal(error.evidence.stderr.toString(), 'err');
        assert.equal(error.evidence.outputDrained, true);
        assert.equal(error.evidence.activeProcessesZero, true);
        assert.ok(error.evidence.finishedAt <= deadline, JSON.stringify(error.evidence));
        return true;
      },
    );
  },
);
