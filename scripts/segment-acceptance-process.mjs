import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Calculate the all-in absolute deadline, including helper setup.
 * @param {number} deadline Outer absolute epoch deadline.
 * @param {number} timeoutMs Local all-in budget.
 * @param {number} now Current epoch time.
 * @returns {number} Effective deadline.
 */
export function ownedProcessDeadline(deadline, timeoutMs, now) {
  if (
    !Number.isSafeInteger(deadline) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 600_000 ||
    !Number.isSafeInteger(now) ||
    deadline <= now
  ) {
    throw new Error('Invalid or exhausted owned process deadline');
  }
  return Math.min(deadline, now + timeoutMs);
}

/**
 * Run one exact caller-admitted executable within a Windows kernel job.
 * @param {object} options Caller-admitted launch descriptor and budget.
 * @param {string} options.executable Absolute caller-validated executable.
 * @param {string[]} options.args Exact caller-validated arguments.
 * @param {string} options.cwd Absolute working directory.
 * @param {object} options.env Complete explicit workload environment.
 * @param {number} options.deadline Absolute epoch deadline including setup.
 * @param {number} options.timeoutMs All-in budget, at most ten minutes.
 * @param {number} [options.maxOutputBytes] Combined stdout/stderr byte cap (default 1 MiB, maximum 8 MiB).
 * @param {AbortSignal} [options.signal] Optional cancellation signal.
 * @param {Function} options.onDispatch Synchronous admission callback before helper launch.
 * @returns {Promise<object>} Kernel-backed exit receipt; errors carry evidence.
 */
export async function runOwnedProcess({
  executable,
  args,
  cwd,
  env,
  deadline,
  timeoutMs,
  maxOutputBytes = 1_048_576,
  signal,
  onDispatch,
}) {
  const startedAt = Date.now();
  let effectiveDeadline;
  try {
    effectiveDeadline = ownedProcessDeadline(deadline, timeoutMs, startedAt);
  } catch (error) {
    throw Object.assign(error, {
      evidence: Object.freeze({ startedAt, reason: 'not-launched', activeProcessesZero: true }),
    });
  }
  const evidence = {
    startedAt,
    deadline: effectiveDeadline,
    assignedBeforeResume: false,
    rootExited: false,
    activeProcessesZero: 'UNKNOWN',
    reason: 'not-launched',
  };
  const fail = (message) =>
    Object.assign(new Error(message), { evidence: Object.freeze({ ...evidence }) });
  if (process.platform !== 'win32') throw fail('Owned process containment requires Windows');
  if (
    typeof executable !== 'string' ||
    !path.isAbsolute(executable) ||
    !executable.toLowerCase().endsWith('.exe') ||
    executable.includes('\0') ||
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== 'string' || argument.includes('\0')) ||
    typeof cwd !== 'string' ||
    !path.isAbsolute(cwd) ||
    cwd.includes('\0') ||
    !env ||
    typeof env !== 'object' ||
    Array.isArray(env) ||
    typeof onDispatch !== 'function' ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    maxOutputBytes > 8_388_608
  ) {
    throw fail('Invalid exact owned process descriptor');
  }
  const names = new Set();
  const environment = Object.entries(env).map(([name, value]) => {
    const key = name.toLowerCase();
    if (
      !name ||
      /[=\0]/u.test(name) ||
      typeof value !== 'string' ||
      value.includes('\0') ||
      names.has(key)
    ) {
      throw fail('Invalid or duplicate environment key');
    }
    names.add(key);
    return `${name}=${value}`;
  });
  environment.sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase(), 'en'));
  const workDeadline = effectiveDeadline - 1500;
  if (workDeadline <= Date.now()) throw fail('Owned process budget lacks termination reservation');
  if (signal?.aborted) throw fail('Owned process already cancelled');
  const helper = fileURLToPath(new URL('segment-acceptance-job.ps1', import.meta.url));
  const host = path.join(
    process.env.SystemRoot ?? String.raw`C:\Windows`,
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  // Charge before any helper/workload launch, including failed launches.
  args = Object.freeze([...args]);
  try {
    const admission = onDispatch(Object.freeze({ executable, args, cwd }));
    if (admission && typeof admission.then === 'function') {
      throw new Error('Dispatch admission must be synchronous');
    }
  } catch (error) {
    throw fail(error.message);
  }
  if (signal?.aborted || Date.now() >= workDeadline)
    throw fail('Owned process budget exhausted before launch');
  return new Promise((resolve, reject) => {
    let receipt;
    let ready = false;
    let buffer = '';
    let diagnostic = '';
    let stopped = false;
    const output = { stdout: [], stderr: [] };
    let capturedBytes = 0;
    const child = spawn(host, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stop = (reason) => {
      if (stopped) return;
      stopped = true;
      evidence.reason = reason;
      child.stdin.end();
    };
    const cancel = () => stop('cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    // The watchdog bounds compilation too. Killing the helper uses its owned handle;
    // absent a kernel receipt, descendant exit remains UNKNOWN rather than success.
    const timer = setTimeout(() => stop('timeout'), Math.max(1, workDeadline - Date.now()));
    const watchdog = setTimeout(
      () => {
        stop('timeout');
        child.kill();
      },
      Math.max(1, effectiveDeadline - Date.now()),
    );
    child.stdin.on('error', () => stop('helper-input-failure'));
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-8192);
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (
            event.event === 'output' &&
            ready &&
            !receipt &&
            (event.stream === 'stdout' || event.stream === 'stderr') &&
            typeof event.base64 === 'string' &&
            event.base64.length <= 4096 &&
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(event.base64)
          ) {
            const bytes = Buffer.from(event.base64, 'base64');
            if (
              bytes.toString('base64') !== event.base64 ||
              capturedBytes + bytes.length > maxOutputBytes
            ) {
              stop('invalid-helper-output');
            } else {
              capturedBytes += bytes.length;
              output[event.stream].push(bytes);
            }
          } else if (event.event === 'ready' && !ready) {
            ready = true;
            if (stopped || signal?.aborted || Date.now() >= workDeadline) {
              stop(signal?.aborted ? 'cancelled' : 'timeout');
            } else {
              child.stdin.write(
                JSON.stringify({
                  executable,
                  args,
                  cwd,
                  environment,
                  deadline: effectiveDeadline,
                  workDeadline,
                  maxOutputBytes,
                }) + '\n',
              );
            }
          } else if (event.event === 'receipt' && !receipt) {
            receipt = event;
          } else if (event.event !== 'resumed') {
            stop('invalid-helper-protocol');
          }
        } catch {
          stop('invalid-helper-protocol');
        }
      }
      if (buffer.length > 8192) {
        buffer = '';
        stop('invalid-helper-output');
      }
    });
    child.once('error', (error) => {
      diagnostic = error.message;
      stop('helper-launch-failure');
    });
    child.once('close', (code, helperSignal) => {
      clearTimeout(timer);
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', cancel);
      const stopReason = evidence.reason;
      if (receipt) Object.assign(evidence, receipt);
      Object.assign(evidence, {
        helperExitCode: code,
        helperSignal,
        finishedAt: Date.now(),
        diagnostic,
        stdout: Buffer.concat(output.stdout),
        stderr: Buffer.concat(output.stderr),
      });
      if (
        stopped ||
        code !== 0 ||
        !receipt ||
        receipt.assignedBeforeResume !== true ||
        receipt.rootExited !== true ||
        receipt.activeProcessesZero !== true ||
        receipt.reason !== 'exit' ||
        receipt.exitCode !== 0 ||
        receipt.failureBase64 !== '' ||
        receipt.outputDrained !== true ||
        receipt.outputTruncated !== false ||
        receipt.capturedBytes !== capturedBytes ||
        buffer.trim() !== '' ||
        Date.now() > effectiveDeadline
      ) {
        if (stopped) evidence.reason = stopReason;
        reject(fail('Owned process failed or termination could not be proven'));
      } else {
        resolve(Object.freeze({ ...evidence }));
      }
    });
    // Cover an abort occurring between the initial check and listener registration.
    if (signal?.aborted) cancel();
  });
}
