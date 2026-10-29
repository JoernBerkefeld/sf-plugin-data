import { createHash } from 'node:crypto';

export const mappingName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]*__c$/u;
export type MappingPair = { developerName: string; sourceField: string; targetField: string };
export type MappingDocument = {
  schemaVersion: 1;
  kind: 'mapping';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    displayName: string;
    sourceObject: string;
    targetObject: string;
    pairs: MappingPair[];
    metadataPairs: Array<{ sourceField: string; targetField: string; creationType: string }>;
    runtimeOnlyPairs: MappingPair[];
    definitionDigest: string;
  };
};

/** Payload-free refusal; never expose untrusted configuration in diagnostics. */
export class MappingError extends Error {
  public constructor(public readonly code: string) {
    super('Mapping configuration could not be admitted.');
    this.name = 'MappingError';
  }
}

/**
 * Require the complete known key inventory without dropping unfamiliar semantics.
 * @param {unknown} value Untrusted record.
 * @param {string[]} keys Exact expected keys.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MappingError('INVALID_MAPPING_CONFIGURATION');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw new MappingError('UNKNOWN_MAPPING_CONFIGURATION');
  return result;
}

/**
 * Read a strict flat XML fragment; this is admission, not an XML serializer.
 * @param {string} xml Standard XML fragment.
 * @param {string[]} keys Expected flat element names.
 * @returns {Record<string, string>} Checked values.
 */
function flat(xml: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let remainder = xml;
  for (const match of xml.matchAll(/<([A-Za-z]+)>([^<]*)<\/\1>/gu)) {
    if (!keys.includes(match[1]) || Object.hasOwn(result, match[1]))
      throw new MappingError('UNKNOWN_MAPPING_XML');
    // Names and fixed literals require no entity expansion. Labels admit the five named entities.
    if (/&(?!(?:amp|lt|gt|quot|apos);)/u.test(match[2]))
      throw new MappingError('INVALID_MAPPING_XML');
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };
    result[match[1]] = match[2].replaceAll(
      /&(?:amp|lt|gt|quot|apos);/gu,
      (entity) => entities[entity],
    );
    remainder = remainder.replace(match[0], '');
  }
  if (remainder.trim() || keys.some((key) => !Object.hasOwn(result, key)))
    throw new MappingError('UNKNOWN_MAPPING_XML');
  return result;
}

/**
 * Correlate complete API65 runtime pairs with retained standard XML without assuming equality.
 * Runtime-only pairs remain explicit, unqualified preservation requirements, not inferred keys.
 * This foundation does not admit prerequisite schemas or authorize a public preview/write.
 * @param {unknown} value Exact API65 mapping detail.
 * @param {string} definitionXml Independently retrieved standard XML bytes.
 * @param {string} apiName Exact requested Metadata/runtime identity.
 * @returns {MappingDocument} Complete correlated candidate including byte digest and runtime extras.
 */
export function projectMapping(
  value: unknown,
  definitionXml: string,
  apiName: string,
): MappingDocument {
  if (!mappingName.test(apiName)) throw new MappingError('INVALID_SELECTION');
  const runtime = record(value, [
    'developerName',
    'fieldMappings',
    'sourceEntityDeveloperName',
    'status',
    'targetEntityDeveloperName',
  ]);
  if (
    runtime.developerName !== apiName ||
    runtime.status !== 'ACTIVE' ||
    typeof runtime.sourceEntityDeveloperName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(runtime.sourceEntityDeveloperName) ||
    typeof runtime.targetEntityDeveloperName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]*__dlm$/u.test(runtime.targetEntityDeveloperName) ||
    !Array.isArray(runtime.fieldMappings) ||
    runtime.fieldMappings.length === 0 ||
    runtime.fieldMappings.length > 1000
  )
    throw new MappingError('INVALID_MAPPING_RUNTIME');
  const names = new Set<string>();
  const sources = new Set<string>();
  const targets = new Set<string>();
  const pairs = runtime.fieldMappings.map((raw): MappingPair => {
    const pair = record(raw, [
      'developerName',
      'sourceFieldDeveloperName',
      'targetFieldDeveloperName',
    ]);
    if (
      typeof pair.developerName !== 'string' ||
      !mappingName.test(pair.developerName) ||
      typeof pair.sourceFieldDeveloperName !== 'string' ||
      !fieldName.test(pair.sourceFieldDeveloperName) ||
      typeof pair.targetFieldDeveloperName !== 'string' ||
      !fieldName.test(pair.targetFieldDeveloperName) ||
      names.has(pair.developerName) ||
      sources.has(pair.sourceFieldDeveloperName) ||
      targets.has(pair.targetFieldDeveloperName)
    )
      throw new MappingError('AMBIGUOUS_MAPPING_PAIRS');
    names.add(pair.developerName);
    sources.add(pair.sourceFieldDeveloperName);
    targets.add(pair.targetFieldDeveloperName);
    return {
      developerName: pair.developerName,
      sourceField: pair.sourceFieldDeveloperName,
      targetField: pair.targetFieldDeveloperName,
    };
  });
  if (
    typeof definitionXml !== 'string' ||
    Buffer.byteLength(definitionXml) > 1_048_576 ||
    /<!|\r/u.test(definitionXml)
  )
    throw new MappingError('INVALID_MAPPING_XML');
  const root =
    /^\s*(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<ObjectSourceTargetMap xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">([\s\S]*)<\/ObjectSourceTargetMap>\s*$/u.exec(
      definitionXml,
    );
  if (!root) throw new MappingError('INVALID_MAPPING_XML');
  let remainder = root[1];
  const metadataPairs: MappingDocument['spec']['metadataPairs'] = [];
  const matched = new Set<string>();
  for (const element of root[1].matchAll(
    /<fieldSourceTargetMaps>([\s\S]*?)<\/fieldSourceTargetMaps>/gu,
  )) {
    const entry = flat(element[1], [
      'creationType',
      'filterApplied',
      'filterOperationType',
      'isSourceFormula',
      'sourceField',
      'targetField',
    ]);
    if (
      !['Custom', 'System'].includes(entry.creationType) ||
      entry.filterApplied !== 'false' ||
      entry.filterOperationType !== 'Equal' ||
      entry.isSourceFormula !== 'false'
    )
      throw new MappingError('UNSUPPORTED_MAPPING_SEMANTICS');
    const pair = pairs.find(
      (candidate) =>
        `${runtime.sourceEntityDeveloperName}.${candidate.sourceField}` === entry.sourceField &&
        `${runtime.targetEntityDeveloperName}.${candidate.targetField}` === entry.targetField,
    );
    if (!pair || matched.has(pair.developerName)) throw new MappingError('MAPPING_PAIR_MISMATCH');
    matched.add(pair.developerName);
    metadataPairs.push({
      sourceField: pair.sourceField,
      targetField: pair.targetField,
      creationType: entry.creationType,
    });
    remainder = remainder.replace(element[0], '');
  }
  const header = flat(remainder, [
    'creationType',
    'masterLabel',
    'sourceObjectName',
    'targetObjectName',
  ]);
  if (
    header.creationType !== 'Custom' ||
    !header.masterLabel.trim() ||
    header.masterLabel.length > 255 ||
    header.sourceObjectName !== runtime.sourceEntityDeveloperName ||
    header.targetObjectName !== runtime.targetEntityDeveloperName ||
    metadataPairs.length === 0
  )
    throw new MappingError('MAPPING_PAIR_MISMATCH');
  return {
    schemaVersion: 1,
    kind: 'mapping',
    identity: { dataSpace: 'default', apiName },
    spec: {
      displayName: header.masterLabel,
      sourceObject: runtime.sourceEntityDeveloperName,
      targetObject: runtime.targetEntityDeveloperName,
      pairs,
      metadataPairs,
      runtimeOnlyPairs: pairs.filter((pair) => !matched.has(pair.developerName)),
      definitionDigest: createHash('sha256').update(definitionXml).digest('hex'),
    },
  };
}
