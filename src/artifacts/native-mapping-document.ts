import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

export type NativeMappingField = {
  sourceFieldDeveloperName: string;
  targetFieldDeveloperName: string;
  developerName?: string;
};

export type NativeMappingDocument = {
  schemaVersion: 1;
  kind: 'mapping';
  identity: { apiName: string; dataSpace: string };
  spec: {
    sourceEntityDeveloperName: string;
    targetEntityDeveloperName: string;
    fieldMappings: NativeMappingField[];
    /** Optional label (Metadata API masterLabel); absent leaves the org's label as it is. */
    label?: string;
  };
};

/** Payload-free refusal for the isolated mapping boundary. */
export class NativeMappingError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Native mapping operation refused: ${code}.`);
    this.name = 'NativeMappingError';
  }
}

export const nativeMappingName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
export const mappingDloName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dll$/u;
export const mappingDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;
const fieldSelector = /^[A-Za-z][A-Za-z0-9_]{0,499}$/u;

/**
 * Require an object at the mapping boundary.
 * @param {unknown} value Untrusted input.
 * @returns {Record<string, unknown>} Object content.
 */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeMappingError('INVALID_MAPPING_DOCUMENT');
  return value as Record<string, unknown>;
}

/**
 * Refuse an authored mapping file, naming the key path that cannot be deployed.
 * @param {string} code Refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {NativeMappingError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): NativeMappingError {
  return explainInput(
    new NativeMappingError(code),
    `The mapping file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the mapping again once the plugin supports it.`,
  );
}

/**
 * Require a JSON object at a key path of the file.
 * @param {unknown} value Untrusted input.
 * @param {string} keyPath Printable key path.
 * @returns {Record<string, unknown>} Object content.
 */
function objectAt(value: unknown, keyPath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse('INVALID_MAPPING_DOCUMENT', keyPath, 'must be an object');
  return value as Record<string, unknown>;
}

/**
 * Refuse a key outside the given set and a missing required key.
 * @param {Record<string, unknown>} value Object of the file.
 * @param {string} prefix Key path of the object, with a trailing dot (empty at the top).
 * @param {string[]} required Keys it must hold.
 * @param {string[]} [optional] Keys it may hold.
 * @param {string} [code] Refusal code.
 */
function closedKeys(
  value: Record<string, unknown>,
  prefix: string,
  required: string[],
  optional: string[] = [],
  code = 'INVALID_MAPPING_DOCUMENT',
): void {
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key))
      throw refuse(code, `${prefix}${printableKey(key)}`, 'is not a key a mapping file can hold');
  for (const key of required)
    if (!Object.hasOwn(value, key)) throw refuse(code, `${prefix}${key}`, 'is missing');
}

/**
 * Validate portable bindings and retain every pair and observed field selector.
 * Saved mapping names identify source artifacts, not a recreated target mapping. Deploy mode (the
 * default) admits only what a deploy can send and names the first offending key path; retrieve
 * mode keeps what the org returned (unknown keys, any field names, no pairs at all) and checks
 * only what names and places the file and the DLO-to-DMO binding the document represents.
 * @param {unknown} value Portable input.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (lenient).
 * @returns {NativeMappingDocument} Checked independent copy.
 */
export function validateNativeMappingDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): NativeMappingDocument {
  const document = objectAt(value, 'the document');
  const identity = objectAt(document.identity, 'identity');
  const spec = objectAt(document.spec, 'spec');
  if (document.schemaVersion !== 1)
    throw refuse('INVALID_MAPPING_DOCUMENT', 'schemaVersion', 'must be 1');
  if (document.kind !== 'mapping')
    throw refuse('INVALID_MAPPING_DOCUMENT', 'kind', 'must be "mapping"');
  if (typeof identity.apiName !== 'string' || !nativeMappingName.test(identity.apiName))
    throw refuse('INVALID_MAPPING_DOCUMENT', 'identity.apiName', 'must be a mapping API name');
  if (
    typeof identity.dataSpace !== 'string' ||
    !identity.dataSpace.trim() ||
    identity.dataSpace !== identity.dataSpace.trim() ||
    [...identity.dataSpace].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    )
  )
    throw refuse('INVALID_MAPPING_DOCUMENT', 'identity.dataSpace', 'must be a data space name');
  // The document represents a DLO-to-DMO mapping only; retrieve writes any other as returned.
  if (
    typeof spec.sourceEntityDeveloperName !== 'string' ||
    !mappingDloName.test(spec.sourceEntityDeveloperName)
  )
    throw refuse(
      'INVALID_MAPPING_DOCUMENT',
      'spec.sourceEntityDeveloperName',
      'must be a data lake object API name ending in __dll',
    );
  if (
    typeof spec.targetEntityDeveloperName !== 'string' ||
    !mappingDmoName.test(spec.targetEntityDeveloperName)
  )
    throw refuse(
      'INVALID_MAPPING_DOCUMENT',
      'spec.targetEntityDeveloperName',
      'must be a data model object API name ending in __dlm',
    );
  if (!Array.isArray(spec.fieldMappings))
    throw refuse('INVALID_MAPPING_DOCUMENT', 'spec.fieldMappings', 'must be a list of pairs');
  const fields = spec.fieldMappings.map((field, index) =>
    objectAt(field, `spec.fieldMappings[${index}]`),
  );
  if (mode === 'retrieve') return structuredClone(value) as NativeMappingDocument;
  closedKeys(document, '', ['identity', 'kind', 'schemaVersion', 'spec']);
  closedKeys(identity, 'identity.', ['apiName', 'dataSpace']);
  closedKeys(
    spec,
    'spec.',
    ['fieldMappings', 'sourceEntityDeveloperName', 'targetEntityDeveloperName'],
    ['label'],
  );
  if (
    Object.hasOwn(spec, 'label') &&
    (typeof spec.label !== 'string' ||
      spec.label.trim() === '' ||
      spec.label !== spec.label.trim() ||
      [...spec.label].some(
        (character) => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
      ))
  )
    throw refuse('INVALID_MAPPING_DOCUMENT', 'spec.label', 'must be a non-empty text');
  if (fields.length === 0)
    throw refuse('INVALID_MAPPING_DOCUMENT', 'spec.fieldMappings', 'must list at least one pair');
  const pairs = new Set<string>();
  const selectors = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const at = `spec.fieldMappings[${index}]`;
    closedKeys(
      field,
      `${at}.`,
      ['sourceFieldDeveloperName', 'targetFieldDeveloperName'],
      ['developerName'],
      'INVALID_MAPPING_FIELD',
    );
    for (const side of ['sourceFieldDeveloperName', 'targetFieldDeveloperName'])
      if (typeof field[side] !== 'string' || !fieldName.test(field[side]))
        throw refuse(
          'INVALID_MAPPING_FIELD',
          `${at}.${side}`,
          'must be a field API name ending in __c',
        );
    const pair =
      `${String(field.sourceFieldDeveloperName)}:${String(field.targetFieldDeveloperName)}`.toLowerCase();
    if (pairs.has(pair)) throw refuse('INVALID_MAPPING_FIELD', at, 'repeats another pair');
    pairs.add(pair);
    if (field.developerName === undefined) continue;
    if (typeof field.developerName !== 'string' || !fieldSelector.test(field.developerName))
      throw refuse('INVALID_MAPPING_FIELD', `${at}.developerName`, 'must be a field selector');
    if (selectors.has(field.developerName.toLowerCase()))
      throw refuse(
        'INVALID_MAPPING_FIELD',
        `${at}.developerName`,
        'repeats the selector of another pair',
      );
    selectors.add(field.developerName.toLowerCase());
  }
  return structuredClone(value) as NativeMappingDocument;
}

/**
 * Unwrap a detail response without accepting collection or CLI envelopes.
 * @param {unknown} value Native detail response.
 * @returns {Record<string, unknown>} Direct representation.
 */
export function unwrapNativeMapping(value: unknown): Record<string, unknown> {
  const object = record(value);
  if (typeof object.developerName !== 'string' || !Array.isArray(object.fieldMappings))
    throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
  return object;
}

/**
 * Save logical bindings and every returned pair, without runtime mapping status or IDs.
 * @param {unknown} value Direct native response.
 * @param {string} [dataSpace] Local effective context; omitted native scope means default, not HTTP injection.
 * @param {DocumentMode} [mode] `retrieve` keeps pairs the plugin cannot deploy as returned.
 * @returns {NativeMappingDocument} Portable definition, not a write payload.
 */
export function normalizeNativeMapping(
  value: unknown,
  dataSpace = 'default',
  mode: DocumentMode = 'deploy',
): NativeMappingDocument {
  const object = unwrapNativeMapping(value);
  if (object.dataSpaceName !== undefined && object.dataSpaceName !== dataSpace)
    throw new NativeMappingError('UNSUPPORTED_MAPPING_DATASPACE');
  return validateNativeMappingDocument(
    {
      schemaVersion: 1,
      kind: 'mapping',
      identity: { apiName: object.developerName, dataSpace },
      spec: {
        sourceEntityDeveloperName: object.sourceEntityDeveloperName,
        targetEntityDeveloperName: object.targetEntityDeveloperName,
        fieldMappings: object.fieldMappings,
      },
    },
    mode,
  );
}

/**
 * Unwrap only the documented collection wrapper; do not infer pagination completeness.
 * @param {unknown} value Native collection response.
 * @param {string} [dataSpace] Local effective scope for every entry.
 * @returns {Record<string, unknown>[]} Checked detail representations.
 */
export function unwrapNativeMappingCollection(
  value: unknown,
  dataSpace = 'default',
): Record<string, unknown>[] {
  const object = record(value);
  if (!Array.isArray(object.objectSourceTargetMaps))
    throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
  return object.objectSourceTargetMaps.map((entry) => {
    const detail = unwrapNativeMapping(entry);
    normalizeNativeMapping(detail, dataSpace);
    return detail;
  });
}
