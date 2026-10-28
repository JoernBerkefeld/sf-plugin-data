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
    dependencies: Array<SegmentReference & { fields: string[] }>;
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
const fieldName = /^[A-Za-z][A-Za-z0-9_]*__c$/u;

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
 * Extract only the independently qualified single-object, empty-audience SQL variant.
 * No alias/CTE parsing, SQL rewriting, or guessed dependency closure is attempted.
 * @param {string} sql Original SQL.
 * @returns {Array<SegmentReference & {fields: string[]}>} Typed object and field dependency.
 */
export function segmentSqlDependencies(sql: string): SegmentDocument['spec']['dependencies'] {
  const match =
    /^SELECT\s+([A-Za-z][A-Za-z0-9_]*__dlm)\.([A-Za-z][A-Za-z0-9_]*__c)\s+FROM\s+([A-Za-z][A-Za-z0-9_]*__dlm)\s+WHERE\s+1\s*=\s*0\s*;?\s*$/iu.exec(
      sql,
    );
  if (!match || match[1] !== match[3]) throw new SegmentError('SQL_DEPENDENCIES_UNQUALIFIED');
  return [{ kind: 'dmo', dataSpace: 'default', apiName: match[1], fields: [match[2]] }];
}

/**
 * Validate and detach the complete authored Segment/default fixed DBT variant.
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
    'dependencies',
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
  if (!Array.isArray(spec.models) || spec.models.length !== 1)
    throw new SegmentError('UNSUPPORTED_SEGMENT_VARIANT');
  const model = record(spec.models[0], ['name', 'sql']);
  if (!segmentName.test(text(model.name))) throw new SegmentError('INVALID_SEGMENT_DOCUMENT');
  const dependencies = segmentSqlDependencies(text(model.sql));
  if (
    dependencies[0].apiName !== on.apiName ||
    !Array.isArray(spec.dependencies) ||
    spec.dependencies.length !== 1
  )
    throw new SegmentError('INVALID_SEGMENT_DEPENDENCIES');
  const dependency = record(spec.dependencies[0], ['kind', 'dataSpace', 'apiName', 'fields']);
  if (
    dependency.kind !== 'dmo' ||
    dependency.dataSpace !== 'default' ||
    dependency.apiName !== on.apiName ||
    !Array.isArray(dependency.fields) ||
    dependency.fields.length !== 1 ||
    !fieldName.test(text(dependency.fields[0])) ||
    dependency.fields[0] !== dependencies[0].fields[0]
  )
    throw new SegmentError('INVALID_SEGMENT_DEPENDENCIES');
  return {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: identity.apiName as string },
    spec: {
      displayName: spec.displayName as string,
      description: spec.description as string,
      segmentType: 'DBT',
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: on.apiName as string },
      models: [{ name: model.name as string, sql: model.sql as string }],
      dependencies,
      publishInterval: 'NO_REFRESH',
      lookbackPeriod: 'P90D',
    },
  };
}

/**
 * Decode XML text entities only, rejecting unknown or malformed entities and markup.
 * @param {string} value XML text content.
 * @returns {string} Decoded content, without trimming SQL.
 */
function decode(value: string): string {
  if (value.includes('<') || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\dA-Fa-f]+;)/u.test(value))
    throw new SegmentError('INVALID_SEGMENT_XML');
  return value.replaceAll(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\dA-Fa-f]+);/gu, (entity) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };
    if (Object.hasOwn(named, entity)) return named[entity];
    const code = entity.startsWith('&#x')
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number(entity.slice(2, -1));
    if (
      !Number.isInteger(code) ||
      (code < 32 && ![9, 10, 13].includes(code)) ||
      code > 0x10_ff_ff ||
      (code >= 0xd8_00 && code <= 0xdf_ff)
    )
      throw new SegmentError('INVALID_SEGMENT_XML');
    return String.fromCodePoint(code);
  });
}

/**
 * Correlate the fixed standard XML grammar against independently acquired runtime semantics.
 * This is admission, not a Salesforce serializer; unknown XML is never reduced or rewritten.
 * @param {unknown} value Authored runtime companion.
 * @param {string} xml Independently retrieved standard source XML.
 * @returns {SegmentDocument} Admitted companion when every meaningful XML field agrees.
 */
export function validateSegmentPair(value: unknown, xml: string): SegmentDocument {
  const document = validateSegmentDocument(value);
  if (typeof xml !== 'string' || xml.length > 1_048_576 || /<!|\r/u.test(xml))
    throw new SegmentError('INVALID_SEGMENT_XML');
  const root =
    /^\s*(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<MarketSegmentDefinition xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">([\s\S]*)<\/MarketSegmentDefinition>\s*$/u.exec(
      xml,
    );
  if (!root) throw new SegmentError('INVALID_SEGMENT_XML');
  const properties = new Map<string, string>();
  let remainder = root[1];
  for (const element of root[1].matchAll(
    /<(includeCriteria|masterLabel|segmentType)>([^<]*)<\/\1>/gu,
  )) {
    if (properties.has(element[1])) throw new SegmentError('INVALID_SEGMENT_XML');
    properties.set(element[1], decode(element[2]));
    remainder = remainder.replace(element[0], '');
  }
  if (
    remainder.trim() ||
    properties.size !== 3 ||
    properties.get('masterLabel') !== document.spec.displayName ||
    properties.get('segmentType') !== 'DBT'
  )
    throw new SegmentError('SEGMENT_PAIR_MISMATCH');
  validateSegmentCriteria(document, properties.get('includeCriteria')!, false);
  return document;
}

/**
 * Correlate the runtime's redundant escaped DBT criteria, never discard divergent SQL.
 * @param {SegmentDocument} document Independently admitted typed content.
 * @param {string} criteria Escaped runtime or decoded Metadata criteria.
 * @param {boolean} escaped Whether one XML entity layer must be decoded.
 * @returns {void} Nothing when the exact ordered model agrees.
 */
export function validateSegmentCriteria(
  document: SegmentDocument,
  criteria: string,
  escaped = true,
): void {
  if (typeof criteria !== 'string') throw new SegmentError('INVALID_SEGMENT_XML');
  const pipeline =
    /^<DbtPipeline xmlns="">\s*<models>\s*<model>\s*<name>([^<]*)<\/name>\s*<sql>([^<]*)<\/sql>\s*<\/model>\s*<\/models>\s*<\/DbtPipeline>$/u.exec(
      escaped ? decode(criteria) : criteria,
    );
  if (
    !pipeline ||
    decode(pipeline[1]) !== document.spec.models[0].name ||
    decode(pipeline[2]) !== document.spec.models[0].sql
  )
    throw new SegmentError('SEGMENT_PAIR_MISMATCH');
}

/**
 * Serialize only admitted authored fields in stable key order.
 * @param {unknown} value Authored document.
 * @returns {string} Canonical JSON with LF terminator.
 */
export function serializeSegmentDocument(value: unknown): string {
  return `${JSON.stringify(validateSegmentDocument(value), undefined, 2)}\n`;
}
