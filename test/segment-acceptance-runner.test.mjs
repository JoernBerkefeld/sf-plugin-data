import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import test from 'node:test';

const runnerUrl = new URL('../scripts/segment-acceptance-runner.mjs', import.meta.url);
const source = await readFile(runnerUrl, 'utf8');
const stubUrl = (sourceText) => `data:text/javascript,${encodeURIComponent(sourceText)}`;
let fixtureNumber = 0;

/**
 * Create an isolated runner with offline dependencies.
 * @param {boolean} failProcess Whether the process fails.
 * @param {boolean} failEnd Whether capture disposal fails.
 * @param {boolean} holdClose Whether broker shutdown waits on a test gate.
 * @returns {Promise<object>} Runner and observer stub.
 */
async function runnerFixture(failProcess = false, failEnd = false, holdClose = false) {
  const controls = stubUrl(`
    export const validateSegmentAcceptanceProfile = (input) => input;
    export const buildSegmentAcceptanceArgv = () => [];
    export const createSegmentAcceptance = () => ({
      beginPhase() {}, stop() {},
      audit: () => ({ used: { orgProcesses: 1 }, pending: [] }),
      dispatchProcess() {}, observeResult: () => ({ stopped: false })
    });
  `);
  const observer = stubUrl(`
    // Unique module state per fixture.
    // fixture ${fixtureNumber++}
    export let ended = 0;
    export let closeCalls = 0;
    export let releaseClose;
    export let rejectClose;
    export const closeGate = new Promise((resolve, reject) => { releaseClose = resolve; rejectClose = reject; });
    export async function createSegmentAcceptanceBroker() {
      return { endpoint: 'offline', token: 'test', beginCapture() {},
        endCapture() { ended++; ${failEnd ? "throw new Error('capture failure');" : "return [{ body: 'PRIVATE_RECORD_SENTINEL' }];"} },
        async close() { closeCalls++; ${holdClose ? 'await closeGate;' : ''} } };
    }
  `);
  const processStub = stubUrl(`
    export async function runOwnedProcess(options) {
      options.onDispatch({ executable: 'node', args: [], cwd: 'test' });
      ${failProcess ? "throw new Error('original failure');" : ''}
      return { totalProcesses: 1, assignedBeforeResume: true, rootExited: true,
        activeProcessesZero: true, outputDrained: true, outputTruncated: false,
        stdout: '{}', stderr: '' };
    }
  `);
  const imports = {
    "'./check-temporary.mjs'": JSON.stringify(
      new URL('../scripts/check-temporary.mjs', import.meta.url).href,
    ),
    "'./segment-acceptance-controls.mjs'": JSON.stringify(controls),
    "'./segment-acceptance-observer.mjs'": JSON.stringify(observer),
    "'./segment-acceptance-process.mjs'": JSON.stringify(processStub),
  };
  let modified = source.replace('ledger.audit().used.orgProcesses - processesBeforeRoot', '1');
  for (const [specifier, replacement] of Object.entries(imports)) {
    assert.equal(modified.split(specifier).length, 2);
    modified = modified.replace(specifier, replacement);
  }
  // import.meta.url is a data URL in this isolated module; the preload is not executed by the stub.
  modified = modified.replace(
    "new URL('segment-acceptance-observer.mjs', import.meta.url).href",
    "'file:///offline-observer.mjs'",
  );
  const module = await import(stubUrl(modified));
  return {
    runner: await module.createSegmentAcceptanceRunner({}),
    observer: await import(observer),
  };
}

test('runner discards captured bodies from serializable and logged receipts', async () => {
  const { runner, observer } = await runnerFixture();
  try {
    const receipt = await runner.runRoot({ operation: 'baseline', timeoutMs: 100, deadline: 100 });
    assert.deepEqual(Object.keys(receipt), ['id', 'evidence', 'audit']);
    assert.equal(receipt.evidence.assignedBeforeResume, true);
    assert.equal(receipt.evidence.outputDrained, true);
    assert.equal(observer.ended, 1);
    assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_RECORD_SENTINEL|observedRecords/u);
    assert.doesNotMatch(inspect(receipt), /PRIVATE_RECORD_SENTINEL|observedRecords/u);
  } finally {
    await runner.close();
  }
});

test('concurrent and later close calls share broker settlement', async () => {
  const { runner, observer } = await runnerFixture(false, false, true);
  const first = runner.close();
  const second = runner.close();
  assert.equal(first, second);
  let settled = false;
  void second.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(observer.closeCalls, 1);
  observer.releaseClose();
  await first;
  assert.equal(runner.close(), first);
  assert.equal(observer.closeCalls, 1);
});

test('close failure remains visible to concurrent and later callers', async () => {
  const { runner, observer } = await runnerFixture(false, false, true);
  const first = runner.close();
  const second = runner.close();
  const failure = new Error('broker shutdown failed');
  const results = Promise.allSettled([first, second]);
  observer.rejectClose(failure);
  assert.deepEqual(await results, [
    { status: 'rejected', reason: failure },
    { status: 'rejected', reason: failure },
  ]);
  await assert.rejects(runner.close(), (error) => error === failure);
  assert.equal(observer.closeCalls, 1);
});

test('runner attempts capture disposal on failure without masking the error', async () => {
  const { runner, observer } = await runnerFixture(true, true);
  try {
    await assert.rejects(runner.runRoot({ operation: 'baseline' }), /original failure/u);
    assert.equal(observer.ended, 1);
  } finally {
    await runner.close();
  }
});
