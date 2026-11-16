/** The outcome of one read: its value, or what it threw. */
export type SettledRead<T> = { value: T } | { error: unknown };

/**
 * Start a read per item with at most `limit` running at once, in item order. Each returned
 * promise settles with its own read's outcome and never rejects, so the caller can consume the
 * results strictly in item order while later reads are still running.
 * @template I, T
 * @param {I[]} items Items to read.
 * @param {number} limit Maximum concurrent reads (at least 1).
 * @param {(item: I) => Promise<T>} read One read.
 * @returns {Array<Promise<SettledRead<T>>>} One outcome per item, in item order.
 */
export function readInOrder<I, T>(
  items: I[],
  limit: number,
  read: (item: I) => Promise<T>,
): Array<Promise<SettledRead<T>>> {
  const waiting: Array<() => void> = [];
  let running = 0;
  const slot = async (): Promise<void> => {
    if (running < Math.max(1, limit)) {
      running++;
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };
  return items.map(async (item): Promise<SettledRead<T>> => {
    await slot();
    try {
      return { value: await read(item) };
    } catch (error) {
      return { error };
    } finally {
      release();
    }
  });
}
