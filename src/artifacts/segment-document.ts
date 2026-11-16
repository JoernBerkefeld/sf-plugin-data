import { isDeepStrictEqual } from 'node:util';
import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

export type SegmentReference = {
  kind: 'dmo';
  dataSpace: 'default';
  apiName: string;
};

type SegmentSpecBase = {
  displayName: string;
  description: string;
  segmentOn: SegmentReference;
  publishInterval: 'NO_REFRESH';
};

/** A SQL (DBT) segment: each SQL model lives in its own file. */
export type DbtSegmentSpec = SegmentSpecBase & {
  segmentType: 'DBT';
  models: Array<{ name: string; sql: string }>;
  lookbackPeriod: 'P90D';
};

/** A segment built in the segment canvas (`UI`): its criteria are a JSON object in the file. */
export type UiSegmentSpec = SegmentSpecBase & {
  segmentType: 'UI';
  includeCriteria: Record<string, unknown>;
  lookbackPeriod: string;
};

export type SegmentDocument = {
  schemaVersion: 1;
  kind: 'segment';
  identity: { dataSpace: 'default'; apiName: string };
  spec: DbtSegmentSpec | UiSegmentSpec;
};

/** Payload-free refusal of incomplete or unsupported Segment content. */
export class SegmentError extends Error {
  public constructor(public readonly code: string) {
    super('Segment configuration could not be admitted.');
    this.name = 'SegmentError';
  }
}

export const segmentName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const dmoName = /^[A-Za-z][A-Za-z0-9_]*__dlm$/u;
// A model name is part of its SQL file name (`<Segment>.segment.<model>.sql`), as in code-fields.
const modelFileName = /^[A-Za-z0-9][A-Za-z0-9_]*$/u;
const specKeys = [
  'displayName',
  'description',
  'segmentType',
  'segmentOn',
  'models',
  'publishInterval',
  'lookbackPeriod',
];
const uiSpecKeys = [
  'displayName',
  'description',
  'segmentType',
  'segmentOn',
  'includeCriteria',
  'publishInterval',
  'lookbackPeriod',
];

/**
 * Refuse a segment file, naming the key path that cannot be deployed.
 * @param {string} code Stable refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {SegmentError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): SegmentError {
  return explainInput(
    new SegmentError(code),
    `The segment file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the segment again once the plugin supports it.`,
  );
}

/**
 * Admit a plain record with all of its required keys. A closed record also rejects every other
 * key, naming it; an open one keeps them.
 * @param {unknown} value Untrusted record.
 * @param {string[]} keys Required (and, when closed, complete) key set.
 * @param {string} keyPath Printable path of the record.
 * @param {boolean} open Whether keys outside `keys` are kept.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(
  value: unknown,
  keys: string[],
  keyPath: string,
  open = false,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is not an object');
  const result = value as Record<string, unknown>;
  const missing = keys.find((key) => !Object.hasOwn(result, key));
  if (missing !== undefined)
    throw refuse('UNKNOWN_SEGMENT_CONFIGURATION', `${keyPath}.${missing}`, 'is missing');
  const unknown = open ? undefined : Object.keys(result).find((key) => !keys.includes(key));
  if (unknown !== undefined)
    throw refuse(
      'UNKNOWN_SEGMENT_CONFIGURATION',
      `${keyPath}.${printableKey(unknown)}`,
      'is not a key a segment file can hold',
    );
  return result;
}

/**
 * Bound text without changing SQL bytes or inventing defaults. Retrieve keeps any string.
 * @param {unknown} value Untrusted string.
 * @param {string} keyPath Printable key path.
 * @param {DocumentMode} mode Check mode.
 * @param {boolean} empty Whether an empty string is meaningful.
 * @returns {string} Original text.
 */
function text(value: unknown, keyPath: string, mode: DocumentMode, empty = false): string {
  if (typeof value !== 'string') throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is not text');
  if (mode === 'retrieve') return value;
  if (!empty && value.length === 0) throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is empty');
  if (
    value.length > 262_144 ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    throw refuse(
      'INVALID_SEGMENT_DOCUMENT',
      keyPath,
      'is longer than 262144 characters or has control characters',
    );
  return value;
}

/**
 * The UI part of `validateSegmentDocument`: the criteria must be a JSON object and the lookback
 * text; both are sent as written and Salesforce decides about them.
 * @param {string} apiName Checked identity name.
 * @param {string} segmentOn Checked source DMO name.
 * @param {Record<string, unknown>} spec Spec with its keys checked.
 * @param {DocumentMode} mode Check mode.
 * @returns {SegmentDocument} Detached document.
 */
function uiSegment(
  apiName: string,
  segmentOn: string,
  spec: Record<string, unknown>,
  mode: DocumentMode,
): SegmentDocument {
  const criteria = spec.includeCriteria;
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria))
    throw refuse('INVALID_SEGMENT_DOCUMENT', 'spec.includeCriteria', 'is not an object');
  const lookbackPeriod = text(spec.lookbackPeriod, 'spec.lookbackPeriod', mode);
  // Retrieve keeps the keys the plugin does not model after the known ones; deploy refused them.
  const extra = Object.fromEntries(
    Object.entries(spec)
      .filter(([key]) => !uiSpecKeys.includes(key))
      .map(([key, entry]) => [key, structuredClone(entry)]),
  );
  return {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName },
    spec: {
      displayName: spec.displayName as string,
      description: spec.description as string,
      segmentType: 'UI',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: segmentOn },
      includeCriteria: structuredClone(criteria) as Record<string, unknown>,
      publishInterval: 'NO_REFRESH',
      lookbackPeriod,
      ...extra,
    },
  };
}

/**
 * Decode the HTML entities Salesforce puts into a UI segment's criteria string on read
 * (`&quot;` and the like); the write takes the plain JSON string.
 * @param {string} value Criteria string as returned.
 * @returns {string} Plain JSON text.
 */
export function decodeSegmentCriteria(value: string): string {
  const named: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
  return value.replaceAll(
    /&(?:(quot|amp|lt|gt|apos)|#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6}));/gu,
    (match, name?: string, decimal?: string, hex?: string) => {
      if (name) return named[name];
      const point = decimal ? Number(decimal) : Number.parseInt(hex!, 16);
      return point <= 0x10_ff_ff ? String.fromCodePoint(point) : match;
    },
  );
}

/**
 * The request body of a UI segment write. Create names the segment (`developerName`) and sends
 * `publishSchedule: NoRefresh`; a PATCH takes the full definition without the schedule (Salesforce
 * answers 400 when NoRefresh is sent on PATCH). The criteria travel as a JSON string, and
 * `segmentCreationFlow: Headless` is what lets the API write a UI segment at all.
 * @param {SegmentDocument} document Admitted UI segment.
 * @param {boolean} create Whether this is the create POST.
 * @returns {Record<string, unknown>} Request body.
 */
export function uiSegmentWriteBody(
  document: SegmentDocument,
  create: boolean,
): Record<string, unknown> {
  const spec = document.spec as UiSegmentSpec;
  return {
    ...(create ? { developerName: document.identity.apiName } : {}),
    displayName: spec.displayName,
    description: spec.description,
    segmentOnApiName: spec.segmentOn.apiName,
    segmentType: spec.segmentType,
    includeCriteria: JSON.stringify(spec.includeCriteria),
    lookbackPeriod: spec.lookbackPeriod,
    ...(create ? { publishSchedule: 'NoRefresh' } : {}),
    segmentCreationFlow: 'Headless',
  };
}

/**
 * Validate and detach an authored Segment/default DBT or UI definition (structure only). A UI
 * segment (`segmentType: UI`) holds `includeCriteria` as a JSON object instead of SQL models and
 * any lookback text; its schedule must still be NO_REFRESH. Retrieve mode
 * keeps unknown `spec` and model keys and lifts the text limits, but still refuses what the file
 * cannot represent: another segment type, refresh, lookback or source kind, and a model name
 * that cannot be a file name or repeats one (ignoring case). Deploy refuses unknown keys and
 * names the key path.
 * @param {unknown} value Untrusted authored document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {SegmentDocument} Independently admitted detached document.
 */
export function validateSegmentDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): SegmentDocument {
  const lenient = mode === 'retrieve';
  const root = record(value, ['schemaVersion', 'kind', 'identity', 'spec'], '[document]');
  const identity = record(root.identity, ['dataSpace', 'apiName'], 'identity');
  const ui = (root.spec as Record<string, unknown> | null)?.segmentType === 'UI';
  const spec = record(root.spec, ui ? uiSpecKeys : specKeys, 'spec', lenient);
  const on = record(spec.segmentOn, ['kind', 'dataSpace', 'apiName'], 'spec.segmentOn');
  if (root.schemaVersion !== 1 || root.kind !== 'segment')
    throw refuse('UNSUPPORTED_SEGMENT_VARIANT', 'kind', 'is not a schemaVersion 1 segment');
  if (
    identity.dataSpace !== 'default' ||
    !segmentName.test(text(identity.apiName, 'identity.apiName', mode))
  )
    throw refuse(
      'UNSUPPORTED_SEGMENT_VARIANT',
      'identity',
      'is not an API name in the default data space',
    );
  for (const [key, expected] of ui
    ? [['publishInterval', 'NO_REFRESH']]
    : [
        ['segmentType', 'DBT'],
        ['publishInterval', 'NO_REFRESH'],
        ['lookbackPeriod', 'P90D'],
      ])
    if (spec[key] !== expected)
      throw refuse('UNSUPPORTED_SEGMENT_VARIANT', `spec.${key}`, `is not ${expected}`);
  if (
    on.kind !== 'dmo' ||
    on.dataSpace !== 'default' ||
    !dmoName.test(text(on.apiName, 'spec.segmentOn.apiName', mode))
  )
    throw refuse(
      'UNSUPPORTED_SEGMENT_VARIANT',
      'spec.segmentOn',
      'is not a DMO (__dlm) in the default data space',
    );
  text(spec.displayName, 'spec.displayName', mode);
  text(spec.description, 'spec.description', mode, true);
  if (ui) return uiSegment(identity.apiName as string, on.apiName as string, spec, mode);
  // The models are sent as written; Salesforce decides about the SQL and the model names.
  if (!Array.isArray(spec.models))
    throw refuse('INVALID_SEGMENT_DOCUMENT', 'spec.models', 'is not a list');
  const names = new Set<string>();
  const models = spec.models.map((value: unknown, index) => {
    const keyPath = `spec.models[${index}]`;
    const model = record(value, ['name', 'sql'], keyPath, lenient);
    const name = text(model.name, `${keyPath}.name`, mode);
    const sql = text(model.sql, `${keyPath}.sql`, mode);
    if (!lenient) return { name, sql };
    // Retrieve writes each model's SQL to a file named by the model.
    if (!modelFileName.test(name) || names.has(name.toLowerCase()))
      throw refuse(
        'INVALID_SEGMENT_DOCUMENT',
        `${keyPath}.name`,
        'cannot be a SQL file name or repeats another model name',
      );
    names.add(name.toLowerCase());
    return { ...(structuredClone(model) as Record<string, unknown>), name, sql };
  });
  // Retrieve keeps the keys the plugin does not model after the known ones; deploy refused them.
  const extra = Object.fromEntries(
    Object.entries(spec)
      .filter(([key]) => !specKeys.includes(key))
      .map(([key, entry]) => [key, structuredClone(entry)]),
  );
  return {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: identity.apiName as string },
    spec: {
      displayName: spec.displayName as string,
      description: spec.description as string,
      segmentType: 'DBT',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: on.apiName as string },
      models: models as DbtSegmentSpec['models'],
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
      ...extra,
    },
  };
}

/** Every `spec.models[].sql` lives in its own `<Name>.segment.<model>.sql` file. */
export const segmentCodeFields: readonly CodeField[] = Object.freeze([
  { path: ['spec', 'models'], each: 'sql', key: 'name', extension: 'sql' },
]);

/**
 * The code fields of one segment: a UI segment has no SQL files.
 * @param {unknown} value Segment document (complete or without its code).
 * @returns {readonly CodeField[]} Code fields.
 */
function codeFieldsOf(value: unknown): readonly CodeField[] {
  const spec = (value as { spec?: { segmentType?: unknown } } | null)?.spec;
  return spec?.segmentType === 'UI' ? [] : segmentCodeFields;
}

/**
 * The JSON text (admitted fields, stable key order, models without SQL) and one SQL file per model.
 * @param {unknown} value Complete authored document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {{json: string; files: CodeFile[]}} JSON with LF terminator and the SQL files in model order.
 */
export function serializeSegmentFiles(
  value: unknown,
  mode: DocumentMode = 'deploy',
): { json: string; files: CodeFile[] } {
  const { document, files } = splitCodeFields(
    validateSegmentDocument(value, mode),
    codeFieldsOf(value),
    () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
  );
  return { json: `${JSON.stringify(document, undefined, 2)}\n`, files };
}

/**
 * Join a parsed segment JSON with its SQL files; a missing or extra SQL file, or SQL left in the
 * JSON, is INVALID_SEGMENT_DOCUMENT.
 * @param {unknown} value Parsed JSON file content.
 * @param {readonly CodeFile[]} files SQL file contents.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {SegmentDocument} Complete admitted document.
 */
export function joinSegmentFiles(
  value: unknown,
  files: readonly CodeFile[],
  mode: DocumentMode = 'deploy',
): SegmentDocument {
  return validateSegmentDocument(
    joinCodeFields(
      value,
      codeFieldsOf(value),
      files,
      () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
    ),
    mode,
  );
}

/**
 * Whether a segment read from the org carries the desired definition. A UI segment's criteria
 * match when every authored key holds the same value in the org: Salesforce adds keys of its own
 * (`selfReference`, `subjectField*`) to the criteria it stores. Everything else must be equal.
 * @param {unknown} observed Projected candidate from a read or write response.
 * @param {SegmentDocument} desired Admitted requested definition.
 * @returns {boolean} Whether the org holds the desired definition.
 */
export function carriesDefinition(observed: unknown, desired: SegmentDocument): boolean {
  if (desired.spec.segmentType !== 'UI') return isDeepStrictEqual(observed, desired);
  const other = observed as SegmentDocument | undefined;
  if (other?.spec?.segmentType !== 'UI') return false;
  const covers = (wanted: unknown, found: unknown): boolean =>
    wanted && typeof wanted === 'object' && found && typeof found === 'object'
      ? Array.isArray(wanted)
        ? Array.isArray(found) &&
          wanted.length === found.length &&
          wanted.every((entry, index) => covers(entry, found[index]))
        : !Array.isArray(found) &&
          Object.entries(wanted).every(
            ([key, entry]) =>
              Object.hasOwn(found, key) && covers(entry, (found as Record<string, unknown>)[key]),
          )
      : isDeepStrictEqual(wanted, found);
  const rest = (document: SegmentDocument): unknown => ({
    ...document,
    spec: { ...document.spec, includeCriteria: undefined },
  });
  return (
    isDeepStrictEqual(rest(other), rest(desired)) &&
    covers(desired.spec.includeCriteria, other.spec.includeCriteria)
  );
}
