import { setTimeout as delay } from 'node:timers/promises';
import {
  CalculatedInsightError,
  calculatedInsightMatches,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import { acquireCalculatedInsight } from './native-calculated-insight.js';
import type { CalculatedInsightReadContext } from './native-calculated-insight.js';

export const calculatedInsightPollBudget = Object.freeze({
  reads: 12,
  intervalMs: 1000,
  timeoutMs: 120_000,
});

export type CalculatedInsightTiming = {
  now?: () => number;
  delay?: (milliseconds: number) => Promise<unknown>;
};

/**
 * Read the insight again after a write, at most twelve GETs one second apart within 120
 * seconds, never writing. `present`: it reads with every key of the document and is not
 * PROCESSING; `ACTIVE`: the same and ACTIVE; `absent`: it reads 404.
 * @param {CalculatedInsightReadContext} context Read context of the write.
 * @param {NativeCalculatedInsight} desired Document that was sent (or deleted).
 * @param {'present' | 'ACTIVE' | 'absent'} target Expected end state.
 * @param {CalculatedInsightTiming} timing Injectable clock and delay for tests.
 * @returns {Promise<string>} Final status (`absent` after a delete).
 */
export async function settleCalculatedInsight(
  context: CalculatedInsightReadContext,
  desired: Pick<NativeCalculatedInsight, 'apiName'> & Partial<NativeCalculatedInsight>,
  target: 'present' | 'ACTIVE' | 'absent',
  timing: CalculatedInsightTiming = {},
): Promise<string> {
  const now = timing.now ?? Date.now;
  const pause = timing.delay ?? delay;
  const deadline = now() + calculatedInsightPollBudget.timeoutMs;
  let last = 'CI_SETTLEMENT_TIMEOUT';
  for (let read = 0; read < calculatedInsightPollBudget.reads; read++) {
    if (read > 0) await pause(calculatedInsightPollBudget.intervalMs);
    if (now() >= deadline) break;
    context.check();
    const acquired = await acquireCalculatedInsight(context, desired.apiName);
    if (acquired.state === 'absent') {
      if (target === 'absent') return 'absent';
      throw new CalculatedInsightError('CI_UNEXPECTED_ABSENCE');
    }
    if (target === 'absent' || acquired.status === 'PROCESSING') continue;
    if (!calculatedInsightMatches(desired as NativeCalculatedInsight, acquired.document)) {
      last = 'CI_SETTLEMENT_MISMATCH';
      continue;
    }
    if (target === 'ACTIVE' && acquired.status !== 'ACTIVE') {
      last = 'CI_UNEXPECTED_STATE';
      continue;
    }
    return acquired.status;
  }
  throw new CalculatedInsightError(last);
}
