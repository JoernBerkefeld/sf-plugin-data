import { unescapeSalesforceHtml } from '../artifacts/native-calculated-insight-document.js';
import { explainInput, printableKey } from './operation-diagnostic.js';

/** The code of {@link refuseEscapedCopy}; documented in docs/errors/general. */
export const escapedCopyCode = 'HTML_ESCAPED_FILE';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Keys that name an array entry, in order of preference. */
const entryKeys = [
  'name',
  'apiName',
  'developerName',
  'targetFieldName',
  'targetFieldDeveloperName',
];

/**
 * The org entry an array entry of the file is compared with: the one of the same name (the first
 * naming key the entry has) when there is one, otherwise the one at the same position.
 * @param {unknown[]} org Org array.
 * @param {unknown} entry File entry.
 * @param {number} index Position of the entry in the file.
 * @returns {unknown} Org entry, or undefined.
 */
function counterpart(org: unknown[], entry: unknown, index: number): unknown {
  const key = isRecord(entry)
    ? entryKeys.find((name) => typeof entry[name] === 'string')
    : undefined;
  if (key !== undefined) {
    const named = org.find(
      (other) => isRecord(other) && other[key] === (entry as Record<string, unknown>)[key],
    );
    if (named !== undefined) return named;
  }
  return org[index];
}

/**
 * The path of the first string of a file that differs from the org's value only by HTML
 * escaping: decoding it once gives exactly the org's value. Without the plain-text request
 * header Connect REST returns every string so, and Salesforce stores what a write sends as is,
 * so deploying such a file would store the entities literally. A string that equals the org's
 * (also one holding an entity Salesforce stores) or decodes to anything else is never matched.
 * @param {unknown} file Value from the file.
 * @param {unknown} org The org's value in the same file form.
 * @param {string} [at] JSON path of `file`.
 * @param {number} [depth] Nesting depth.
 * @returns {string | undefined} JSON path, or none.
 */
export function escapedCopyPath(
  file: unknown,
  org: unknown,
  at = '',
  depth = 0,
): string | undefined {
  if (typeof file === 'string')
    return typeof org === 'string' &&
      file !== org &&
      file.includes('&') &&
      unescapeSalesforceHtml(file) === org
      ? at || '(document)'
      : undefined;
  if (depth > 40) return undefined;
  if (Array.isArray(file)) {
    if (!Array.isArray(org)) return undefined;
    for (const [index, entry] of file.entries()) {
      const found = escapedCopyPath(
        entry,
        counterpart(org, entry, index),
        `${at}[${index}]`,
        depth + 1,
      );
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(file) || !isRecord(org)) return undefined;
  for (const [key, entry] of Object.entries(file)) {
    if (!Object.hasOwn(org, key)) continue;
    const path = at ? `${at}.${printableKey(key)}` : printableKey(key);
    const found = escapedCopyPath(entry, org[key], path, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Refuse a file that holds HTML-escaped copies of the org's text before any write: Salesforce
 * would store the entities literally.
 * @param {unknown} file Document from the file.
 * @param {unknown} org The org's document in the same form.
 * @param {(code: string) => Error} refusal The item type's error for a code.
 */
export function refuseEscapedCopy(
  file: unknown,
  org: unknown,
  refusal: (code: string) => Error,
): void {
  const at = escapedCopyPath(file, org);
  if (at !== undefined)
    throw explainInput(
      refusal(escapedCopyCode),
      `The file holds HTML-escaped text at ${at} (an entity such as &amp; or &#39; where the org holds the character itself) that Salesforce would store literally, since it never decodes entities it is sent. Retrieve it again, or write the characters themselves; nothing was written.`,
    );
}
