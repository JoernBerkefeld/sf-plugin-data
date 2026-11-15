import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';

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

/**
 * Admit an exact plain record and reject all unknown keys.
 * @param {unknown} value Untrusted record.
 * @param {string[]} keys Complete allowed key set.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SegmentError('INVALID_SEGMENT_DOCUMENT');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw new SegmentError('UNKNOWN_SEGMENT_CONFIGURATION');
  return result;
}

/**
 * Bound text without changing SQL bytes or inventing defaults.
 * @param {unknown} value Untrusted string.
 * @param {boolean} empty Whether an empty string is meaningful.
 * @returns {string} Original text.
 */
function text(value: unknown, empty = false): string {
  if (
    typeof value !== 'string' ||
    (!empty && value.length === 0) ||
    value.length > 262_144 ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    throw new SegmentError('INVALID_SEGMENT_DOCUMENT');
  return value;
}

/**
 * Validate and detach an authored Segment/default DBT definition (structure only).
 * @param {unknown} value Untrusted authored document.
 * @returns {SegmentDocument} Independently admitted detached document.
 */
export function validateSegmentDocument(value: unknown): SegmentDocument {
  const root = record(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  const identity = record(root.identity, ['dataSpace', 'apiName']);
  const spec = record(root.spec, [
    'displayName',
    'description',
    'segmentType',
    'segmentOn',
    'models',
    'publishInterval',
    'lookbackPeriod',
  ]);
  const on = record(spec.segmentOn, ['kind', 'dataSpace', 'apiName']);
  if (
    root.schemaVersion !== 1 ||
    root.kind !== 'segment' ||
    identity.dataSpace !== 'default' ||
    !segmentName.test(text(identity.apiName)) ||
    spec.segmentType !== 'DBT' ||
    spec.publishInterval !== 'NO_REFRESH' ||
    spec.lookbackPeriod !== 'P90D' ||
    on.kind !== 'dmo' ||
    on.dataSpace !== 'default' ||
    !dmoName.test(text(on.apiName))
  )
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  text(spec.displayName);
  text(spec.description, true);
  // The models are sent as written; Salesforce decides about the SQL and the model names.
  if (!Array.isArray(spec.models)) throw new SegmentError('INVALID_SEGMENT_DOCUMENT');
  const models = spec.models.map((value) => {
    const model = record(value, ['name', 'sql']);
    return { name: text(model.name), sql: text(model.sql) };
  });
  return {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: identity.apiName as string },
    spec: {
      displayName: spec.displayName as string,
      description: spec.description as string,
      segmentType: 'DBT',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: on.apiName as string },
      models,
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
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
 * @returns {{json: string; files: CodeFile[]}} JSON with LF terminator and the SQL files in model order.
 */
export function serializeSegmentFiles(value: unknown): { json: string; files: CodeFile[] } {
  const { document, files } = splitCodeFields(
    validateSegmentDocument(value),
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
 * @returns {SegmentDocument} Complete admitted document.
 */
export function joinSegmentFiles(value: unknown, files: readonly CodeFile[]): SegmentDocument {
  return validateSegmentDocument(
    joinCodeFields(
      value,
      segmentCodeFields,
      files,
      () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
    ),
  );
}
