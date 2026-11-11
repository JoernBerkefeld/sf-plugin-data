/**
 * Spacing of the settle reads after a native DLO, DMO or mapping write. Reads go over one bound
 * connection and return in well under a second, so the reads are spaced explicitly instead of
 * relying on per-read process start-up. A read that already shows the settled state ends the wait.
 */
export const readbackPace = {
  attempts: 6,
  delayMs: 3000,
  sleep: async (milliseconds: number): Promise<void> => {
    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },
};

/**
 * Wait before every settle read except the first.
 * @param {number} attempt Zero-based read number.
 * @returns {Promise<void>} Resolves when the next read may be sent.
 */
export async function paceReadback(attempt: number): Promise<void> {
  if (attempt > 0) await readbackPace.sleep(readbackPace.delayMs);
}
