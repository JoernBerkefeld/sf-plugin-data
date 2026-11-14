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

/**
 * Serialize only admitted authored fields in stable key order.
 * @param {unknown} value Authored document.
 * @returns {string} Canonical JSON with LF terminator.
 */
export function serializeSegmentDocument(value: unknown): string {
  return `${JSON.stringify(validateSegmentDocument(value), undefined, 2)}\n`;
}
