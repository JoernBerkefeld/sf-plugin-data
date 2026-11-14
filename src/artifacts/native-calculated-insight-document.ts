import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';

export const calculatedInsightName = /^[A-Za-z][A-Za-z0-9_]{0,194}__cio$/u;

/** Payload-free refusal; never include SQL or response content in diagnostics. */
export class CalculatedInsightError extends Error {
  public constructor(public readonly code: string) {
    super('Calculated insight configuration could not be admitted.');
    this.name = 'CalculatedInsightError';
  }
}

/**
 * Fields of the API 68 GET that the file leaves out: the org sets them, no create/update input
 * takes them, or Salesforce derives them from the SQL.
 * - Status and run history: `calculatedInsightStatus`, `definitionStatus`, `isEnabled`,
 *   `lastCalcInsightStatus*`, `lastRun*`.
 * - `dimensions`, `measures`: derived from the SELECT list (no separate input).
 * - `sourceCiId`, `sourceCiName`: org record links (`sourceCiDevName` is kept; the input names
 *   the source by developer name).
 * - `creationType`, `subType`: set by how the insight was created; no input field.
 */
export const calculatedInsightServerFields: readonly string[] = [
  'calculatedInsightStatus',
  'creationType',
  'definitionStatus',
  'dimensions',
  'isEnabled',
  'lastCalcInsightStatusDateTime',
  'lastCalcInsightStatusErrorCode',
  'lastRunDateTime',
  'lastRunStatus',
  'lastRunStatusDateTime',
  'lastRunStatusErrorCode',
  'measures',
  'sourceCiId',
  'sourceCiName',
  'subType',
];

/** The SQL lives in `<apiName>.calculatedInsight-meta.sql` next to the JSON. */
export const calculatedInsightCodeFields: readonly CodeField[] = [
  { path: ['expression'], extension: 'sql' },
];

/** One calculated insight as the API 68 GET returns it, without the server fields. */
export type NativeCalculatedInsight = Record<string, unknown> & {
  apiName: string;
  dataSpace: string;
  expression: string;
};

const entities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

/**
 * Undo the HTML escaping of the API 68 GET (`&gt;`, `&#39;`, …) in one pass, so `&amp;lt;`
 * becomes `&lt;`. Unknown or invalid references stay as they are.
 * @param {string} text Escaped text.
 * @returns {string} Plain text.
 */
export function unescapeSalesforceHtml(text: string): string {
  return text.replaceAll(
    /&(?:(amp|apos|gt|lt|quot)|#(\d{1,7})|#[Xx]([\dA-Fa-f]{1,6}));/gu,
    (match, name: string | undefined, decimal: string | undefined, hex: string | undefined) => {
      if (name) return entities[name];
      const code = decimal === undefined ? Number.parseInt(hex!, 16) : Number(decimal);
      return code > 0x10_ff_ff || (code >= 0xd8_00 && code <= 0xdf_ff)
        ? match
        : String.fromCodePoint(code);
    },
  );
}

/**
 * The same keys, sorted, so a repeat retrieve writes identical bytes.
 * @param {Record<string, unknown>} value Top-level object.
 * @returns {Record<string, unknown>} Sorted copy.
 */
function sorted(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new key array.
      .sort()
      .map((key) => [key, value[key]]),
  );
}

/**
 * Structural check only: what to send and whether it works is Salesforce's decision.
 * @param {unknown} value Complete document (JSON with the SQL joined back).
 * @returns {NativeCalculatedInsight} Checked copy.
 */
export function validateNativeCalculatedInsight(value: unknown): NativeCalculatedInsight {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  const document = structuredClone(value) as Record<string, unknown>;
  if (typeof document.apiName !== 'string' || !calculatedInsightName.test(document.apiName))
    throw new CalculatedInsightError('INVALID_CI_NAME');
  if (
    typeof document.dataSpace !== 'string' ||
    !document.dataSpace ||
    typeof document.expression !== 'string' ||
    !document.expression.trim()
  )
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  return document as NativeCalculatedInsight;
}

/**
 * Project an API 68 GET body to the file form: server fields dropped, SQL unescaped.
 * @param {unknown} raw GET response.
 * @returns {NativeCalculatedInsight} Retrievable document.
 */
export function observeNativeCalculatedInsight(raw: unknown): NativeCalculatedInsight {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  const body = { ...(raw as Record<string, unknown>) };
  for (const key of calculatedInsightServerFields) delete body[key];
  if (typeof body.expression === 'string')
    body.expression = unescapeSalesforceHtml(body.expression);
  return validateNativeCalculatedInsight(sorted(body));
}

/**
 * The JSON text and the code files of one document.
 * @param {unknown} value Complete document.
 * @returns {{json: string; files: CodeFile[]}} JSON (sorted keys, LF) and the SQL file.
 */
export function serializeNativeCalculatedInsight(value: unknown): {
  json: string;
  files: CodeFile[];
} {
  const { document, files } = splitCodeFields(
    validateNativeCalculatedInsight(value),
    calculatedInsightCodeFields,
    () => new CalculatedInsightError('INVALID_CI_DOCUMENT'),
  );
  return { json: `${JSON.stringify(sorted(document), undefined, 2)}\n`, files };
}

/**
 * Read one document back from its JSON text and code files.
 * @param {string} json JSON file text.
 * @param {readonly CodeFile[]} files Code file contents.
 * @returns {NativeCalculatedInsight} Complete document.
 */
export function parseNativeCalculatedInsight(
  json: string,
  files: readonly CodeFile[],
): NativeCalculatedInsight {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  }
  return validateNativeCalculatedInsight(
    joinCodeFields(
      parsed,
      calculatedInsightCodeFields,
      files,
      () => new CalculatedInsightError('INVALID_CI_DOCUMENT'),
    ),
  );
}
