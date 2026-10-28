import { isDeepStrictEqual } from 'node:util';

// eslint-disable-next-line unicorn/no-null -- API65 explicitly distinguishes wire null from omitted fields.
const wireNull = null;
export const calculatedInsightName = /^[A-Za-z][A-Za-z0-9_]{0,194}__cio$/u;
const objectName = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${objectName}.ssot__DeviceId__c`;
const application = `${objectName}.ssot__SoftwareApplicationId__c`;
const originalExpression = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${objectName} WHERE 1 = 0 GROUP BY ${application}`;
const editedExpression = originalExpression.replace(
  'WHERE 1 = 0',
  `WHERE 1 = 0 AND ${device} IS NOT NULL`,
);

type Attribution = null | {
  sourceApiName: 'ssot__DeviceId__c' | 'ssot__SoftwareApplicationId__c';
  type: 'STREAMING_DATA_MODEL';
};

type Dimension = {
  apiName: 'app_id__c';
  creationType: 'Custom';
  dataType: 'Text';
  dateGranularity: null;
  displayName: 'app_id';
  fieldRole: 'DIMENSION';
  formula: string;
};
type Measure = {
  apiName: 'device_count__c';
  creationType: 'Custom';
  dataType: 'Number';
  displayName: 'device_count';
  fieldAggregationType: 'NONAGGREGATABLE';
  fieldRole: 'MEASURE';
  formula: string;
};

export type CalculatedInsightDocument = {
  schemaVersion: 1;
  kind: 'calculated-insight';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    displayName: string;
    expression: string;
    creationType: 'Custom';
    definitionType: 'CALCULATED_METRIC';
    definitionStatus: 'IN_USE';
    description: null;
    isEnabled: true;
    subType: null;
    publishScheduleInterval: 'SYSTEM_MANAGED';
    publishScheduleStartDateTime: null;
    publishScheduleEndDate: null;
    dimensions: [Dimension];
    measures: [Measure];
    dependencies: [
      {
        kind: 'dmo';
        dataSpace: 'default';
        apiName: string;
        fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'];
      },
    ];
  };
};

export type CalculatedInsightProjection = {
  document: CalculatedInsightDocument;
  observations: {
    derivedAttribution: { dimensions: [Attribution]; measures: [Attribution] };
  };
};

export type CalculatedInsightUpdateDelta =
  | { status: 'blocked'; blockers: string[] }
  | {
      status: 'unchanged';
      blockers: [];
      expected: CalculatedInsightDocument;
      observations: CalculatedInsightProjection['observations'];
    }
  | {
      status: 'candidate';
      blockers: [];
      patch: { expression: string };
      expected: CalculatedInsightDocument;
      observations: CalculatedInsightProjection['observations'];
    };

/** Payload-free refusal; never include SQL or response content in diagnostics. */
export class CalculatedInsightError extends Error {
  public constructor(public readonly code: string) {
    super('Calculated insight configuration could not be admitted.');
    this.name = 'CalculatedInsightError';
  }
}

/**
 * Admit exactly the recorded keys, refusing incomplete or unknown configuration.
 * @param {unknown} value Untrusted record.
 * @param {string[]} keys Complete key inventory.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw new CalculatedInsightError('UNKNOWN_CI_CONFIGURATION');
  return result;
}

/**
 * Check bounded nonempty text without normalization.
 * @param {unknown} value Untrusted text.
 * @returns {string} Original bytes.
 */
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 262_144 ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  return value;
}

/**
 * Construct the complete fixed semantic profile from qualified SQL, never a SQL parser.
 * @param {string} displayName Preserved authored label.
 * @param {string} expression Exact one of the two qualified expressions.
 * @returns {object} Complete preservation baseline.
 */
function specification(displayName: string, expression: string): CalculatedInsightDocument['spec'] {
  if (![originalExpression, editedExpression].includes(expression))
    throw new CalculatedInsightError('CI_EXPRESSION_UNQUALIFIED');
  return {
    displayName,
    expression,
    creationType: 'Custom',
    definitionType: 'CALCULATED_METRIC',
    definitionStatus: 'IN_USE',
    description: wireNull,
    isEnabled: true,
    subType: wireNull,
    publishScheduleInterval: 'SYSTEM_MANAGED',
    publishScheduleStartDateTime: wireNull,
    publishScheduleEndDate: wireNull,
    dimensions: [
      {
        apiName: 'app_id__c',
        creationType: 'Custom',
        dataType: 'Text',
        dateGranularity: wireNull,
        displayName: 'app_id',
        fieldRole: 'DIMENSION',
        formula: application,
      },
    ],
    measures: [
      {
        apiName: 'device_count__c',
        creationType: 'Custom',
        dataType: 'Number',
        displayName: 'device_count',
        fieldAggregationType: 'NONAGGREGATABLE',
        fieldRole: 'MEASURE',
        formula: `APPROX_COUNT_DISTINCT(${device})`,
      },
    ],
    dependencies: [
      {
        kind: 'dmo',
        dataSpace: 'default',
        apiName: objectName,
        fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'],
      },
    ],
  };
}

/**
 * Validate and detach the fixed default-space CI document; unknown fields never disappear.
 * @param {unknown} value Authored content.
 * @returns {CalculatedInsightDocument} Complete detached document.
 */
export function validateCalculatedInsightDocument(value: unknown): CalculatedInsightDocument {
  const root = record(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  const identity = record(root.identity, ['dataSpace', 'apiName']);
  const apiName = text(identity.apiName);
  if (
    root.schemaVersion !== 1 ||
    root.kind !== 'calculated-insight' ||
    identity.dataSpace !== 'default' ||
    !calculatedInsightName.test(apiName)
  )
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  if (!root.spec || typeof root.spec !== 'object' || Array.isArray(root.spec))
    throw new CalculatedInsightError('INVALID_CI_DOCUMENT');
  const spec = root.spec as Record<string, unknown>;
  const expected = specification(text(spec.displayName), text(spec.expression));
  if (!isDeepStrictEqual(spec, expected))
    throw new CalculatedInsightError('CI_CONFIGURATION_UNQUALIFIED');
  return {
    schemaVersion: 1,
    kind: 'calculated-insight',
    identity: { dataSpace: 'default', apiName },
    spec: expected,
  };
}

/**
 * Decode only XML text entities; reject markup and invalid XML code points.
 * @param {string} value Encoded element text.
 * @returns {string} Exact decoded content.
 */
function decodeXml(value: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\dA-Fa-f]+;)/u.test(value))
    throw new CalculatedInsightError('INVALID_CI_XML');
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
      (code >= 0xd8_00 && code <= 0xdf_ff) ||
      code === 0xff_fe ||
      code === 0xff_ff
    )
      throw new CalculatedInsightError('INVALID_CI_XML');
    return String.fromCodePoint(code);
  });
}

/**
 * Correlate standard three-field source XML with the companion and canonical member name.
 * SOAP readMetadata retains its separate four-field contract including fullName.
 * @param {unknown} value Complete portable companion.
 * @param {string} xml Independently retrieved standard XML, never synthesized here.
 * @param {string} memberName Canonical filename/member name without __cio.
 * @returns {CalculatedInsightDocument} Detached admitted pair.
 */
export function validateCalculatedInsightPair(
  value: unknown,
  xml: string,
  memberName: string,
): CalculatedInsightDocument {
  const document = validateCalculatedInsightDocument(value);
  if (memberName !== document.identity.apiName.slice(0, -5))
    throw new CalculatedInsightError('CI_PAIR_MISMATCH');
  if (
    typeof xml !== 'string' ||
    xml.length > 1_048_576 ||
    /<!|\r/u.test(xml) ||
    [...xml].some((character) => {
      const code = character.codePointAt(0)!;
      return (
        (code < 32 && ![9, 10, 13].includes(code)) ||
        (code >= 0xd8_00 && code <= 0xdf_ff) ||
        code === 0xff_fe ||
        code === 0xff_ff
      );
    })
  )
    throw new CalculatedInsightError('INVALID_CI_XML');
  const root =
    /^\s*(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<MktCalcInsightObjectDef xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">([\s\S]*)<\/MktCalcInsightObjectDef>\s*$/u.exec(
      xml,
    );
  if (!root) throw new CalculatedInsightError('INVALID_CI_XML');
  const properties = new Map<string, string>();
  let remainder = root[1];
  for (const element of root[1].matchAll(
    /<(creationType|expression|masterLabel)>([^<]*)<\/\1>/gu,
  )) {
    if (properties.has(element[1])) throw new CalculatedInsightError('INVALID_CI_XML');
    properties.set(element[1], decodeXml(element[2]));
    remainder = remainder.replace(element[0], '');
  }
  if (
    remainder.trim() ||
    properties.size !== 3 ||
    properties.get('creationType') !== document.spec.creationType ||
    properties.get('expression') !== document.spec.expression ||
    properties.get('masterLabel') !== document.spec.displayName
  )
    throw new CalculatedInsightError('CI_PAIR_MISMATCH');
  return document;
}

/**
 * Serialize only portable semantics; acquisition observations are deliberately separate.
 * @param {unknown} value Authored document.
 * @returns {string} Stable JSON with final LF.
 */
export function serializeCalculatedInsightDocument(value: unknown): string {
  return `${JSON.stringify(validateCalculatedInsightDocument(value), undefined, 2)}\n`;
}

/**
 * Retain observed derived attribution explicitly, never as a dependency identity.
 * @param {unknown} value Untrusted runtime attribution.
 * @returns {Attribution} Detached observation.
 */
function attribution(value: unknown): Attribution {
  if (value === wireNull) return wireNull;
  const source = record(value, ['sourceApiName', 'type']);
  if (
    source.type !== 'STREAMING_DATA_MODEL' ||
    !['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'].includes(
      source.sourceApiName as string,
    )
  )
    throw new CalculatedInsightError('CI_ATTRIBUTION_UNQUALIFIED');
  return structuredClone(source) as Exclude<Attribution, null>;
}

/**
 * Validate a complete runtime observation without fabricating Metadata correlation.
 * Pending observations are usable only for echo/poll preservation, never settled admission.
 * @param {unknown} runtimeDetail Exact API65 response body.
 * @returns {CalculatedInsightProjection & {status: 'ACTIVE' | 'PROCESSING'}} Detached runtime observation.
 */
export function observeCalculatedInsight(
  runtimeDetail: unknown,
): CalculatedInsightProjection & { status: 'ACTIVE' | 'PROCESSING' } {
  const semanticKeys = Object.keys(specification('label', originalExpression)).filter(
    (key) => key !== 'dependencies',
  );
  const transientKeys = [
    'lastCalcInsightStatusDateTime',
    'lastCalcInsightStatusErrorCode',
    'lastRunDateTime',
    'lastRunStatus',
    'lastRunStatusDateTime',
    'lastRunStatusErrorCode',
  ];
  const raw = record(runtimeDetail, [
    'apiName',
    'dataSpace',
    'calculatedInsightStatus',
    ...semanticKeys,
    ...transientKeys,
  ]);
  if (raw.calculatedInsightStatus !== 'ACTIVE' && raw.calculatedInsightStatus !== 'PROCESSING')
    throw new CalculatedInsightError('CI_NOT_SETTLED');
  // Only the recorded never-run, error-free profile is qualified. Timestamps are observations.
  if (
    transientKeys.some((key) => key !== 'lastCalcInsightStatusDateTime' && raw[key] !== wireNull) ||
    typeof raw.lastCalcInsightStatusDateTime !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(raw.lastCalcInsightStatusDateTime) ||
    !Number.isFinite(Date.parse(raw.lastCalcInsightStatusDateTime))
  )
    throw new CalculatedInsightError('CI_RUNTIME_PROFILE_UNQUALIFIED');
  const observations: CalculatedInsightProjection['observations'] = {
    derivedAttribution: { dimensions: [wireNull], measures: [wireNull] },
  };
  const spec = Object.fromEntries(semanticKeys.map((key) => [key, structuredClone(raw[key])]));
  for (const role of ['dimensions', 'measures'] as const) {
    const fields = spec[role];
    if (!Array.isArray(fields) || fields.length !== 1)
      throw new CalculatedInsightError('CI_SCHEMA_UNQUALIFIED');
    const expectedField = specification('label', originalExpression)[role][0];
    const field = record(fields[0], [...Object.keys(expectedField), 'dataSource']);
    observations.derivedAttribution[role] = [attribution(field.dataSource)];
    spec[role] = [Object.fromEntries(Object.keys(expectedField).map((key) => [key, field[key]]))];
  }
  spec.dependencies = specification('label', originalExpression).dependencies;
  const document = validateCalculatedInsightDocument({
    schemaVersion: 1,
    kind: 'calculated-insight',
    identity: { dataSpace: raw.dataSpace, apiName: raw.apiName },
    spec,
  });
  return { document, observations, status: raw.calculatedInsightStatus };
}

/**
 * Correlate a settled runtime observation with separately acquired Metadata.
 * @param {unknown} runtimeDetail Independent API65 detail body.
 * @param {unknown} metadataDefinition Independent Metadata definition.
 * @returns {CalculatedInsightProjection} Complete admitted semantics and observations.
 */
export function projectCalculatedInsight(
  runtimeDetail: unknown,
  metadataDefinition: unknown,
): CalculatedInsightProjection {
  const { document, observations, status } = observeCalculatedInsight(runtimeDetail);
  if (status !== 'ACTIVE') throw new CalculatedInsightError('CI_NOT_SETTLED');
  const metadata = record(metadataDefinition, [
    'fullName',
    'creationType',
    'expression',
    'masterLabel',
  ]);
  if (
    metadata.fullName !== document.identity.apiName.slice(0, -5) ||
    metadata.creationType !== document.spec.creationType ||
    metadata.expression !== document.spec.expression ||
    metadata.masterLabel !== document.spec.displayName
  )
    throw new CalculatedInsightError('CI_METADATA_MISMATCH');
  return { document, observations };
}

/**
 * Build an offline candidate only; no transport, polling, or mutation dispatch exists here.
 * Equality is complete for admitted semantics; derived attribution is returned, not hidden.
 * Callers must acquire fresh independent reads and bind compatible target dependencies.
 * @param {unknown} desired Authored desired document.
 * @param {unknown} runtimeDetail Independently read current runtime body.
 * @param {unknown} metadataDefinition Independently read current Metadata definition.
 * @param {unknown} targetDataSpace Explicit target binding.
 * @returns {CalculatedInsightUpdateDelta} Unchanged, forward expression candidate, or blockers.
 */
export function buildCalculatedInsightUpdateDelta(
  desired: unknown,
  runtimeDetail: unknown,
  metadataDefinition: unknown,
  targetDataSpace: unknown,
): CalculatedInsightUpdateDelta {
  try {
    if (targetDataSpace !== 'default') throw new CalculatedInsightError('INVALID_SCOPE');
    const source = validateCalculatedInsightDocument(desired);
    const { document: current, observations } = projectCalculatedInsight(
      runtimeDetail,
      metadataDefinition,
    );
    if (!isDeepStrictEqual(source.identity, current.identity))
      throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
    if (!isDeepStrictEqual({ ...source.spec, expression: current.spec.expression }, current.spec))
      throw new CalculatedInsightError('CI_NON_EXPRESSION_CHANGE');
    if (source.spec.expression === current.spec.expression)
      return { status: 'unchanged', blockers: [], expected: source, observations };
    if (
      current.spec.expression !== originalExpression ||
      source.spec.expression !== editedExpression
    )
      throw new CalculatedInsightError('CI_EXPRESSION_DIRECTION_UNQUALIFIED');
    return {
      status: 'candidate',
      blockers: [],
      patch: { expression: source.spec.expression },
      expected: source,
      observations,
    };
  } catch (error) {
    if (!(error instanceof CalculatedInsightError)) throw error;
    return { status: 'blocked', blockers: [error.code] };
  }
}
