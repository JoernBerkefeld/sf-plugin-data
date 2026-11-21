import { calculatedInsightName } from './path-selector.js';
import { sameProperty } from './enum-case.js';
import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';
import { dataSpaceKey, readSingleDataSpace } from './data-space-field.js';
import { crossSpaceSentence, explainInput } from '../services/operation-diagnostic.js';

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

/**
 * One calculated insight as the API 68 GET returns it, without the server fields. The file
 * keeps its data space in the top-level `c__dataSpace` key instead of Salesforce's `dataSpace`:
 * serialize and parse translate between the two, so `dataSpace` (sent as `dataSpaceName`)
 * always comes from `c__dataSpace`.
 */
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
 * The text without its trailing line breaks (`\n` or `\r\n`, any number). Salesforce stores a
 * calculated insight's SQL without the final line break of the `.sql` file.
 * @param {string} text SQL text.
 * @returns {string} Text without trailing line breaks.
 */
function withoutTrailingLineBreaks(text: string): string {
  return text.replace(/(?:\r?\n)+$/u, '');
}

/**
 * The JSON text and the code files of one document. The `.sql` file ends with exactly one `\n`.
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
  const file = { ...(document as Record<string, unknown>) };
  file[dataSpaceKey] = file.dataSpace;
  delete file.dataSpace;
  return {
    json: `${JSON.stringify(sorted(file), undefined, 2)}\n`,
    files: files.map((file) => ({ ...file, text: `${withoutTrailingLineBreaks(file.text)}\n` })),
  };
}

/**
 * The refusal of an insight file whose `c__dataSpace` is not the run's data space.
 * @param {object} document The insight.
 * @param {string} document.apiName Its name.
 * @param {string} document.dataSpace Its data space (the file's c__dataSpace).
 * @param {string} dataSpace The run's data space.
 * @param {boolean} [crossSpace] A deploy, which --allow-cross-dataspace can translate: say so.
 * @returns {CalculatedInsightError} CI_DATASPACE_MISMATCH with an explanation.
 */
export function calculatedInsightSpaceMismatch(
  document: { apiName: string; dataSpace: string },
  dataSpace: string,
  crossSpace = false,
): CalculatedInsightError {
  return explainInput(
    new CalculatedInsightError('CI_DATASPACE_MISMATCH'),
    `${document.apiName} names the data space ${document.dataSpace} in ${dataSpaceKey}, but the run's data space is ${dataSpace}. Run the command with --dataspace ${document.dataSpace}, or correct the file.${crossSpace ? crossSpaceSentence(dataSpace) : ''}`,
  );
}

/**
 * Refuse a calculated insight file problem, naming the key.
 * @param {string} code Refusal code.
 * @param {string} keyPath Key path.
 * @param {string} problem What is wrong with it.
 * @returns {CalculatedInsightError} Refusal with an explanation.
 */
function refuseFile(code: string, keyPath: string, problem: string): CalculatedInsightError {
  return explainInput(
    new CalculatedInsightError(code),
    `The calculated insight file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the insight again.`,
  );
}

/**
 * The parsed file with its `c__dataSpace` moved to Salesforce's `dataSpace` key. A file that still
 * carries `dataSpace` itself is refused (pre-alpha: not migrated).
 * @param {unknown} parsed Parsed JSON.
 * @returns {unknown} Document in the GET's key names.
 */
function fromFileDataSpace(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  const file = { ...(parsed as Record<string, unknown>) };
  if (Object.hasOwn(file, 'dataSpace'))
    throw refuseFile(
      'LEGACY_DATASPACE_KEY',
      'dataSpace',
      `is Salesforce's key; the file names its data space in the top-level key ${dataSpaceKey}`,
    );
  file.dataSpace = readSingleDataSpace(file, refuseFile);
  delete file[dataSpaceKey];
  return file;
}

/**
 * Read one document back from its JSON text and code files. Trailing line breaks of the `.sql`
 * file are not part of `expression`.
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
  const document = validateNativeCalculatedInsight(
    joinCodeFields(
      fromFileDataSpace(parsed),
      calculatedInsightCodeFields,
      files,
      () => new CalculatedInsightError('INVALID_CI_DOCUMENT'),
    ),
  );
  document.expression = withoutTrailingLineBreaks(document.expression);
  return document;
}

/**
 * GET keys the create/update input (`CdpCalculatedInsightInputRepresentation`) names
 * differently. Live API 68 (isolated-source, 2026-11-15): `dataSpace` and `isFromPackage`
 * are rejected as unrecognised, so the renames are required; `sourceCiDevName` follows the
 * schema, not live-tested.
 */
export const calculatedInsightInputKeys: Readonly<Record<string, string>> = {
  dataSpace: 'dataSpaceName',
  isFromPackage: 'createdFromPackage',
  sourceCiDevName: 'sourceDeveloperName',
};

/**
 * Keys whose GET value is UPPER_SNAKE (`NOT_SCHEDULED`) while the input lists PascalCase
 * (`NotScheduled`). Live API 68: `publishScheduleInterval` must be PascalCase on POST and
 * PATCH; `definitionType` and `queryDialect` are accepted in either form on POST;
 * `historyPublishScheduleInterval` follows the schema, not live-tested.
 */
export const calculatedInsightInputEnums: readonly string[] = [
  'definitionType',
  'historyPublishScheduleInterval',
  'publishScheduleInterval',
  'queryDialect',
];

/**
 * Whether one insight key holds the same value in the file and the org; the enum keys above
 * ignore letter case (`not_scheduled` equals `NOT_SCHEDULED`).
 * @param {string} key Document key.
 * @param {unknown} left One value.
 * @param {unknown} right The other value.
 * @returns {boolean} Whether the key is unchanged.
 */
function sameCalculatedInsightValue(key: string, left: unknown, right: unknown): boolean {
  return sameProperty(key, left, right, calculatedInsightEnumKeys);
}

const calculatedInsightEnumKeys: ReadonlySet<string> = new Set(calculatedInsightInputEnums);

/**
 * `NOT_SCHEDULED` → `NotScheduled`; any other value stays as authored.
 * @param {unknown} value Authored value.
 * @returns {unknown} Input form.
 */
function inputEnum(value: unknown): unknown {
  return typeof value === 'string' && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(value)
    ? value
        .split('_')
        .map((part) => part[0] + part.slice(1).toLowerCase())
        .join('')
    : value;
}

/**
 * Keys an update leaves out while they equal the org value. Salesforce refuses any
 * `definitionType` on PATCH, and any schedule field on a streaming insight ("You can't
 * schedule the calculated insight because it's streaming"), even an unchanged one (live
 * API 68). A changed value is sent, so the refusal stays Salesforce's answer.
 */
const unchangedOnUpdate: ReadonlySet<string> = new Set([
  'definitionType',
  'historyPublishScheduleInterval',
  'historyPublishScheduleTimeZone',
  'historyPublishTime',
  'publishScheduleEndDate',
  'publishScheduleInterval',
  'publishScheduleStartDateTime',
  'publishScheduleTimeZone',
]);

/**
 * The create/update body of one document: every key as authored, with the input names and
 * enum forms of the two tables above. A null value is left out (the GET reports an unset
 * field as null; the input documents that some unset fields must be omitted). The PATCH body
 * leaves out `apiName`, which is in the route, and the definition type and schedule fields
 * while they equal the org value (see `unchangedOnUpdate`).
 * @param {NativeCalculatedInsight} document Complete document (SQL joined).
 * @param {'create' | 'update'} operation POST or PATCH.
 * @param {NativeCalculatedInsight} [observed] Org document an update is based on.
 * @returns {Record<string, unknown>} Request body.
 */
export function calculatedInsightInputBody(
  document: NativeCalculatedInsight,
  operation: 'create' | 'update',
  observed?: NativeCalculatedInsight,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validateNativeCalculatedInsight(document))) {
    if (
      operation === 'update' &&
      unchangedOnUpdate.has(key) &&
      observed &&
      sameCalculatedInsightValue(key, value, observed[key])
    )
      continue;
    if (value === null || (operation === 'update' && key === 'apiName')) continue;
    body[calculatedInsightInputKeys[key] ?? key] = calculatedInsightInputEnums.includes(key)
      ? inputEnum(value)
      : value;
  }
  return body;
}

/**
 * Whether the org insight already holds the document: every key of the document equals the
 * org GET projected with {@link observeNativeCalculatedInsight}. Keys the file leaves out are
 * not compared, so a retrieved file deploys back unchanged and a shorter authored file too.
 * @param {NativeCalculatedInsight} desired Document from the files.
 * @param {NativeCalculatedInsight} observed Projected org document.
 * @returns {boolean} True when nothing would change.
 */
export function calculatedInsightMatches(
  desired: NativeCalculatedInsight,
  observed: NativeCalculatedInsight,
): boolean {
  return Object.keys(desired).every((key) =>
    sameCalculatedInsightValue(key, desired[key], observed[key]),
  );
}

/** The planning view of one insight: kind, identity and what its SQL reads (ordering only). */
export type CalculatedInsightReference = {
  kind: 'calculated-insight';
  identity: { dataSpace: string; apiName: string };
  spec: {
    dependencies: Array<{
      kind: 'dmo' | 'calculated-insight';
      dataSpace: string;
      apiName: string;
    }>;
  };
};

/**
 * The planning view of one document. Dependencies are every distinct `<Name>__dlm` and other
 * `<Name>__cio` token in the SQL: a deploy orders the insight after the selected DMOs, IRs
 * (through their unified DMOs) and insights it names. No SQL is parsed; a name in a comment
 * or string only adds an ordering edge, and a missing object is Salesforce's answer.
 * @param {NativeCalculatedInsight} document Complete document.
 * @returns {CalculatedInsightReference} Planning view.
 */
export function calculatedInsightReference(
  document: NativeCalculatedInsight,
): CalculatedInsightReference {
  const names = new Map<string, 'dmo' | 'calculated-insight'>();
  for (const match of document.expression.matchAll(/\b[A-Za-z][A-Za-z0-9_]*__(dlm|cio)\b/gu))
    if (match[0] !== document.apiName)
      names.set(match[0], match[1] === 'dlm' ? 'dmo' : 'calculated-insight');
  return {
    kind: 'calculated-insight',
    identity: { dataSpace: document.dataSpace, apiName: document.apiName },
    spec: {
      dependencies: [...names]
        // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([apiName, kind]) => ({ kind, dataSpace: document.dataSpace, apiName })),
    },
  };
}

export { calculatedInsightName } from './path-selector.js';
