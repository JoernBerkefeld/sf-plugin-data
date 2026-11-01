import './check-temporary.mjs';
import { randomUUID } from 'node:crypto';
import {
  buildSegmentAcceptanceArgv,
  createSegmentAcceptance,
  validateSegmentAcceptanceProfile,
} from './segment-acceptance-controls.mjs';
import { createSegmentAcceptanceBroker } from './segment-acceptance-observer.mjs';
import { runOwnedProcess } from './segment-acceptance-process.mjs';

/**
 * Reconcile one owned tree with its same-ledger admission delta.
 * @param {object} evidence Kernel receipt retained by the runner.
 * @param {number} admissions Root plus child admissions for this serial tree.
 * @returns {void} Throws on absent, invalid or unexplained process counts.
 */
export function assertSegmentProcessCount(evidence, admissions) {
  if (
    !Number.isSafeInteger(evidence.totalProcesses) ||
    evidence.totalProcesses < 1 ||
    evidence.totalProcesses !== admissions
  )
    throw Object.assign(new Error('SEGMENT_ACCEPTANCE: kernel process count mismatch'), {
      evidence,
    });
}

/**
 * Start one parent ledger and broker; every serial root owns its entire inherited Job tree.
 * @param {object} input Exact pinned profile (no caller argv or preload override).
 * @param {object} [clock] Shared monotonic ledger clock options.
 * @returns {Promise<object>} Phase, root, audit, stop and close interfaces.
 */
export async function createSegmentAcceptanceRunner(input, clock = {}) {
  const profile = validateSegmentAcceptanceProfile(input);
  const ledger = createSegmentAcceptance(profile, clock);
  const controller = new AbortController();
  let active;
  let closed = false;
  const stop = (reason = 'runner cancelled') => {
    ledger.stop(reason);
    controller.abort();
  };
  const broker = await createSegmentAcceptanceBroker({
    ledger,
    profile,
    onStop: () => controller.abort(),
  });
  const preload = `--import=${new URL('segment-acceptance-observer.mjs', import.meta.url).href}`;
  const privateConfig = JSON.stringify({ endpoint: broker.endpoint, token: broker.token });
  return Object.freeze({
    beginPhase: (...arguments_) => ledger.beginPhase(...arguments_),
    audit: () => ledger.audit(),
    stop,
    /**
     * Precharge one complete fixed root invocation and await native teardown proof.
     * @param {object} options Root operation and bounded launch budget.
     * @param {string} options.operation Fixed builder operation.
     * @param {number} options.timeoutMs Root budget including teardown.
     * @param {number} options.deadline Outer absolute deadline.
     * @param {number} [options.maxOutputBytes] Combined bounded root output.
     * @returns {Promise<object>} Drained output, kernel evidence and settled ledger audit.
     */
    async runRoot({ operation, timeoutMs, deadline, maxOutputBytes }) {
      if (active || closed || controller.signal.aborted || ledger.audit().stopped) {
        stop('root unavailable');
        throw new Error('SEGMENT_ACCEPTANCE: root unavailable');
      }
      const id = randomUUID();
      let charged = false;
      let capturing = false;
      let receipt;
      const processesBeforeRoot = ledger.audit().used.orgProcesses;
      const work = (async () => {
        try {
          const argv = buildSegmentAcceptanceArgv(profile, operation);
          // NODE_OPTIONS carries only the fixed observer import; argv remains the exact builder output.
          const environment = Object.fromEntries(
            Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
          );
          environment.NODE_OPTIONS = preload;
          environment.SEGMENT_ACCEPTANCE_PRELOAD = privateConfig;
          environment.SF_AUTOUPDATE_DISABLE = 'true';
          environment.SF_DISABLE_TELEMETRY = 'true';
          environment.SF_DISABLE_SOURCE_MEMBER_POLLING = 'true';
          broker.beginCapture();
          capturing = true;
          const evidence = await runOwnedProcess({
            executable: profile.executable,
            args: argv,
            cwd: profile.cwd,
            env: environment,
            deadline,
            timeoutMs,
            maxOutputBytes,
            signal: controller.signal,
            onDispatch: ({ executable, args, cwd }) => {
              ledger.dispatchProcess({
                id,
                operation,
                executable,
                argv: args,
                cwd,
                importOrigin: profile.importOrigin,
                api: 'spawn',
                shell: false,
                timeoutMs,
              });
              charged = true;
            },
          });
          receipt = evidence;
          assertSegmentProcessCount(
            evidence,
            ledger.audit().used.orgProcesses - processesBeforeRoot,
          );
          // The launcher already enforces these receipts; retain a fail-closed orchestration boundary.
          if (
            evidence.assignedBeforeResume !== true ||
            evidence.rootExited !== true ||
            evidence.activeProcessesZero !== true ||
            evidence.outputDrained !== true ||
            evidence.outputTruncated !== false ||
            ledger.audit().pending.some((pending) => pending !== id)
          )
            throw Object.assign(new Error('SEGMENT_ACCEPTANCE: incomplete root/tree proof'), {
              evidence,
            });
          // Captured response bodies are not safe to expose in a receipt or logs.
          broker.endCapture();
          capturing = false;
          const audit = ledger.observeResult({ id, outcome: 'success' });
          return Object.freeze({ id, evidence, audit });
        } catch (error) {
          if (capturing) {
            try {
              broker.endCapture();
            } catch {
              // Preserve the original failure; closing the broker also clears its capture.
            }
          }
          if (charged && !ledger.audit().stopped) {
            try {
              ledger.observeResult({ id, outcome: 'uncertain' });
            } catch {
              // Failure latches the ledger and deliberately retains all charged counters.
            }
          }
          stop(error.message);
          if (receipt && !error.evidence) error.evidence = receipt;
          error.audit = ledger.audit();
          throw error;
        }
      })();
      active = work;
      try {
        return await work;
      } finally {
        active = undefined;
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (active) {
        stop('runner closed during root');
        await active.catch(() => {});
      }
      await broker.close();
    },
  });
}
