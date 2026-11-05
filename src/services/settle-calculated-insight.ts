import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CalculatedInsightError,
  validateCalculatedInsightDocument,
} from '../artifacts/calculated-insight-document.js';
import { acquireExactCalculatedInsight } from './retrieve-calculated-insight.js';
import type {
  CalculatedInsightReadContext,
  ExactCalculatedInsightAcquisition,
} from './retrieve-calculated-insight.js';
import type { CalculatedInsightBinding } from './bind-calculated-insight-dependencies.js';

export type CalculatedInsightSettlement =
  | { state: 'unknown'; diagnostics: string[] }
  | { state: 'absent'; absenceProof: 'native-item-not-found+metadata-empty' }
  | {
      state: 'present';
      acquisition: Extract<ExactCalculatedInsightAcquisition, { state: 'present' }>;
      binding: CalculatedInsightBinding;
    };

/**
 * Independently settle one CI using at most twelve native GETs, never a mutation or replay.
 * All reads, binding and delays share a 120-second wall deadline; late work cannot prove success.
 * @param {CalculatedInsightReadContext} context Isolated native68/Metadata65 readers.
 * @param {unknown} expected Complete desired or source-owned document.
 * @param {'ACTIVE' | 'DRAFT' | 'absent'} expectedStatus Explicit operation settlement intent.
 * @param {object} timing Injectable clock and delay for deterministic offline tests.
 * @param {Function} timing.now Wall-clock milliseconds, nondecreasing.
 * @param {Function} timing.delay Read-only inter-poll delay.
 * @returns {Promise<CalculatedInsightSettlement>} Independent completion evidence or unknown.
 */
export async function settleCalculatedInsight(
  context: CalculatedInsightReadContext,
  expected: unknown,
  expectedStatus: 'ACTIVE' | 'DRAFT' | 'absent',
  timing: { now?: () => number; delay?: (milliseconds: number) => Promise<void> } = {},
): Promise<CalculatedInsightSettlement> {
  const now = timing.now ?? Date.now;
  const pause = timing.delay ?? delay;
  let previous = now();
  const deadline = previous + 120_000;
  const remaining = (): number => {
    const current = now();
    if (!Number.isFinite(current) || current < previous || current >= deadline)
      throw new CalculatedInsightError('CI_SETTLEMENT_TIMEOUT');
    previous = current;
    return deadline - current;
  };
  // Bound even a never-resolving SOAP read or caller-supplied dependency callback.
  const bounded = async <T>(read: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const budget = remaining();
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new CalculatedInsightError('CI_SETTLEMENT_TIMEOUT')),
          budget,
        );
      });
      const result = await Promise.race([read(), timeout]);
      remaining();
      context.check();
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    if (!Number.isFinite(previous) || !['ACTIVE', 'DRAFT', 'absent'].includes(expectedStatus))
      throw new CalculatedInsightError('INVALID_SCOPE');
    const document = validateCalculatedInsightDocument(expected);
    if (document.spec.publishScheduleInterval !== 'NOT_SCHEDULED')
      throw new CalculatedInsightError('CI_CONFIGURATION_UNQUALIFIED');
    const readers: CalculatedInsightReadContext = {
      ...context,
      check: () => {
        remaining();
        context.check();
      },
      get: (name) => bounded(() => context.get(name)),
      metadata: (name) => bounded(() => context.metadata(name)),
    };
    for (let poll = 0; poll < 12; poll++) {
      const acquired = await bounded(() =>
        acquireExactCalculatedInsight(
          readers,
          document.identity.apiName,
          expectedStatus === 'absent',
        ),
      );
      if (acquired.state === 'unknown') return acquired;
      if (acquired.state === 'absent') {
        if (expectedStatus === 'absent') return acquired;
        throw new CalculatedInsightError('CI_UNEXPECTED_ABSENCE');
      }
      if (!isDeepStrictEqual(acquired.document, document))
        throw new CalculatedInsightError('CI_SETTLEMENT_MISMATCH');
      if (acquired.status === expectedStatus) {
        const binding = await bounded(() => context.bind(document, readers.check));
        return { state: 'present', acquisition: acquired, binding };
      }
      if (
        acquired.status !== 'PROCESSING' &&
        !(expectedStatus === 'absent' && ['DELETING', 'ACTIVE', 'DRAFT'].includes(acquired.status))
      )
        throw new CalculatedInsightError('CI_UNEXPECTED_STATE');
      if (poll < 11) await bounded(() => pause(1000));
    }
    throw new CalculatedInsightError('CI_SETTLEMENT_TIMEOUT');
  } catch (error) {
    return {
      state: 'unknown',
      diagnostics: [error instanceof CalculatedInsightError ? error.code : 'CI_SETTLEMENT_FAILED'],
    };
  }
}
