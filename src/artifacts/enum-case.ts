import { isDeepStrictEqual } from 'node:util';

/*
 * Salesforce stores several enum values in its own letter case (a DLO category `other` reads
 * `Other`, a field type `text` reads `Text`, a transform `fullRunFrequency` `Daily` reads `DAILY`;
 * live API 68). Deploy sends the value as authored, and the unchanged comparison treats values
 * that differ only in letter case as equal, so a hand-written file deploys unchanged the second
 * time. Retrieve keeps Salesforce's spelling. Names, labels, SQL, formulas and free text are
 * never compared this way.
 */

/**
 * Whether two values name the same enum value: text ignoring letter case, anything else exactly.
 * @param {unknown} left One value.
 * @param {unknown} right The other value.
 * @returns {boolean} Whether both are the same value.
 */
export function sameEnum(left: unknown, right: unknown): boolean {
  return typeof left === 'string' && typeof right === 'string'
    ? left.toUpperCase() === right.toUpperCase()
    : isDeepStrictEqual(left, right);
}

/**
 * The comparison form of an enum value: text in upper case, anything else unchanged.
 * @param {unknown} value Enum value.
 * @returns {unknown} Value for comparison only, never sent.
 */
export function enumKey(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

/**
 * Whether one property holds the same value on both sides; the keys in `enumKeys` ignore case.
 * @param {string} key Property name.
 * @param {unknown} left One value.
 * @param {unknown} right The other value.
 * @param {ReadonlySet<string>} enumKeys Properties that hold enum values.
 * @returns {boolean} Whether the property is unchanged.
 */
export function sameProperty(
  key: string,
  left: unknown,
  right: unknown,
  enumKeys: ReadonlySet<string>,
): boolean {
  return enumKeys.has(key) ? sameEnum(left, right) : isDeepStrictEqual(left, right);
}

/**
 * Whether two flat records hold the same values: the union of their keys compared with
 * {@link sameProperty}.
 * @param {Record<string, unknown>} left One record.
 * @param {Record<string, unknown>} right The other record.
 * @param {ReadonlySet<string>} enumKeys Properties that hold enum values.
 * @returns {boolean} Whether both records are the same.
 */
export function sameRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  enumKeys: ReadonlySet<string>,
): boolean {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((key) =>
    sameProperty(key, left[key], right[key], enumKeys),
  );
}

/**
 * A deep copy for comparison only, in which every text value under a key in `enumKeys` (at any
 * depth) is in upper case. Other values, and keys outside `enumKeys`, stay as they are.
 * @param {unknown} value JSON value.
 * @param {ReadonlySet<string>} enumKeys Properties that hold enum values.
 * @returns {unknown} Comparison copy, never sent.
 */
export function foldEnums(value: unknown, enumKeys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => foldEnums(entry, enumKeys));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      enumKeys.has(key) && typeof entry === 'string' ? enumKey(entry) : foldEnums(entry, enumKeys),
    ]),
  );
}
