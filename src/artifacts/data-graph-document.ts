export const dataGraphName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

/** Payload-free failure for unqualified Graph configuration. */
export class DataGraphError extends Error {
  public constructor(public readonly code = 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION') {
    super('Data graph configuration could not be admitted.');
    this.name = 'DataGraphError';
  }
}

/**
 * Require a qualified invariant without retaining raw data.
 * @param {unknown} value Required invariant.
 */
export function graphRequire(value: unknown): asserts value {
  if (!value) throw new DataGraphError();
}

/**
 * Validate an exact record.
 * @param {unknown} value Candidate.
 * @param {string[]} keys Inventory.
 * @returns {Record<string, unknown>} Checked record.
 */
export function graphRecord(value: unknown, keys?: string[]): Record<string, unknown> {
  graphRequire(value && typeof value === 'object' && !Array.isArray(value));
  if (keys)
    graphRequire(
      Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    );
  return value as Record<string, unknown>;
}

/**
 * Validate nonblank private identity/display text.
 * @param {unknown} value Candidate.
 */
export function graphText(value: unknown): asserts value is string {
  graphRequire(typeof value === 'string' && value.trim().length > 0);
}

/**
 * Stabilize JSON object keys without changing any array order.
 * @param {unknown} value Detached JSON.
 * @returns {unknown} Stable JSON.
 */
export function graphCanonicalObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => graphCanonicalObject(item));
  if (value && typeof value === 'object') {
    // eslint-disable-next-line unicorn/no-array-sort -- ES2022 library target; keys is a new array.
    const keys = Object.keys(value).sort();
    return Object.fromEntries(
      keys.map((key) => [key, graphCanonicalObject(graphRecord(value)[key])]),
    );
  }
  return value;
}
