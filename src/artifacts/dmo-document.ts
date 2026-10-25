export type DmoField = {
  name: string;
  label: string;
  description?: string;
  dataType: 'Date' | 'DateTime';
  isPrimaryKey: boolean;
  isDynamicLookup: false;
};

export type DmoDocument = {
  schemaVersion: 1;
  kind: 'dmo';
  identity: { dataSpace: string; apiName: string };
  spec: {
    label: string;
    description?: string;
    category: 'Profile' | 'Other' | 'Engagement';
    eventDateTimeFieldName?: string;
    recordModifiedFieldName?: string;
    fields: DmoField[];
  };
};

/** Payload-free local contract failure; never interpolate untrusted document values. */
export class DmoDocumentError extends Error {
  public constructor() {
    super('Invalid or unsupported portable DMO document.');
    this.name = 'DmoDocumentError';
  }
}

const objectKeys = [
  'label',
  'description',
  'category',
  'eventDateTimeFieldName',
  'recordModifiedFieldName',
  'fields',
];
const fieldKeys = ['name', 'label', 'description', 'dataType', 'isPrimaryKey', 'isDynamicLookup'];
const rawObjectConfiguration = ['name', 'dataSpaceName', ...objectKeys, 'creationType'];
const rawFieldConfiguration = [
  'name',
  'label',
  'description',
  'type',
  'isPrimaryKey',
  'isDynamicLookup',
  'creationType',
  'keyQualifierName',
  'isDistinct',
  'usageTag',
];
const rawObjectObservations = new Set([
  'id',
  'hasExternalDataLakeObjectMappings',
  'isEditable',
  'isEnabled',
  'isSegmentable',
]);

/**
 * Classify documented raw keys only; configuration still needs lossless adapter handling.
 * @param {'object' | 'field'} level Raw response level.
 * @param {string} key Response property name.
 * @returns {'configuration' | 'observation' | 'unknown'} Unknown keys must block export.
 */
export function classifyDmoRawField(
  level: 'object' | 'field',
  key: string,
): 'configuration' | 'observation' | 'unknown' {
  if ((level === 'object' ? rawObjectConfiguration : rawFieldConfiguration).includes(key))
    return 'configuration';
  if (level === 'object' && rawObjectObservations.has(key)) return 'observation';
  return 'unknown';
}

/**
 * Fail closed with a payload-free diagnostic.
 * @param {unknown} condition Required invariant.
 */
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new DmoDocumentError();
}

/**
 * Check an ordinary JSON record without invoking accessors.
 * @param {unknown} value Candidate record.
 * @param {string[]} allowed Exact permitted keys.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, allowed: string[]): Record<string, unknown> {
  requireValid(value && typeof value === 'object' && !Array.isArray(value));
  requireValid(
    Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
  );
  requireValid(
    Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key)),
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireValid(Object.values(descriptors).every((entry) => 'value' in entry && entry.enumerable));
  return value as Record<string, unknown>;
}

/**
 * Check a nonblank display label.
 * @param {unknown} value Candidate label.
 * @returns {boolean} Whether the label is nonblank.
 */
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check the initial non-namespaced custom API-name subset.
 * @param {unknown} value Qualified API name.
 * @param {string} suffix Required canonical suffix.
 * @returns {boolean} Whether the name belongs to the supported subset.
 */
function customName(value: unknown, suffix: '__dlm' | '__c'): value is string {
  if (typeof value !== 'string' || !value.endsWith(suffix)) return false;
  const stem = value.slice(0, -suffix.length);
  return /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/u.test(stem) && !/^ssot/iu.test(stem);
}

/**
 * Validate the initial custom-schema subset, without coercion or an API-support claim.
 * @param {unknown} value Parsed JSON document (not a raw org response).
 * @returns {DmoDocument} The validated document; no projection or field removal occurs.
 */
export function validateDmoDocument(value: unknown): DmoDocument {
  const document = record(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  requireValid(document.schemaVersion === 1 && document.kind === 'dmo');
  const identity = record(document.identity, ['dataSpace', 'apiName']);
  requireValid(
    typeof identity.dataSpace === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/u.test(identity.dataSpace),
  );
  requireValid(customName(identity.apiName, '__dlm'));
  const spec = record(document.spec, objectKeys);
  requireValid(text(spec.label));
  requireValid(!('description' in spec) || typeof spec.description === 'string');
  requireValid(['Profile', 'Other', 'Engagement'].includes(spec.category as string));
  requireValid(Array.isArray(spec.fields) && spec.fields.length > 0);
  const names = new Set<string>();
  let primaryKeys = 0;
  for (const item of spec.fields) {
    const field = record(item, fieldKeys);
    requireValid(customName(field.name, '__c') && text(field.label));
    requireValid(!('description' in field) || typeof field.description === 'string');
    requireValid(['Date', 'DateTime'].includes(field.dataType as string));
    requireValid(typeof field.isPrimaryKey === 'boolean' && field.isDynamicLookup === false);
    requireValid(!names.has(field.name.toLowerCase()));
    names.add(field.name.toLowerCase());
    if (field.isPrimaryKey) primaryKeys++;
  }
  requireValid(primaryKeys === 1);
  for (const key of ['eventDateTimeFieldName', 'recordModifiedFieldName']) {
    if (key in spec) {
      requireValid(
        spec.fields.some(
          (item: DmoField) => item.name === spec[key] && item.dataType === 'DateTime',
        ),
      );
    }
  }
  requireValid(spec.category !== 'Engagement' || 'eventDateTimeFieldName' in spec);
  return value as DmoDocument;
}

/**
 * Sort only object keys; all arrays and string contents retain their order.
 * @param {unknown} value Validated JSON value.
 * @returns {unknown} Canonical JSON value.
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => stable(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh entries array within the existing TypeScript library target.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

/**
 * Serialize validated DMO JSON with sorted object keys, original arrays and a final LF.
 * @param {unknown} value Parsed portable document.
 * @returns {string} Deterministic JSON text; UTF-8 encoding belongs to the future writer.
 */
export function serializeDmoDocument(value: unknown): string {
  return `${JSON.stringify(stable(validateDmoDocument(value)), undefined, 2)}\n`;
}
