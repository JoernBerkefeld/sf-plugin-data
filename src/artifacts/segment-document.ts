import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

export type SegmentReference = {
  kind: 'dmo';
  dataSpace: 'default';
  apiName: string;
};

export type SegmentDocument = {
  schemaVersion: 1;
  kind: 'segment';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    displayName: string;
    description: string;
    segmentType: 'DBT';
    segmentOn: SegmentReference;
    models: Array<{ name: string; sql: string }>;
    publishInterval: 'NO_REFRESH';
    lookbackPeriod: 'P90D';
  };
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
 * Validate and detach an authored Segment/default DBT definition (structure only). Retrieve mode
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
  const spec = record(root.spec, specKeys, 'spec', lenient);
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
  for (const [key, expected] of [
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
      models: models as SegmentDocument['spec']['models'],
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
    segmentCodeFields,
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
      segmentCodeFields,
      files,
      () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
    ),
    mode,
  );
}
