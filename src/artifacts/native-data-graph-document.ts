import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { graphRecord, graphRequire, graphText } from './data-graph-document.js';
import { buildDataGraphCreateRequest } from '../transport/data-graph-rest.js';
import { graphCanonicalObject } from '../services/retrieve-data-graph.js';

export type NativeDataGraphDocument = {
  schemaVersion: 1;
  kind: 'native-data-graph';
  apiVersion: '68.0';
  definition: Record<string, unknown>;
};
export type NativeDataGraphObservation = {
  id: string;
  createdDate: string;
  status: 'creating' | 'ready' | 'deleting';
  definitionFingerprint: string;
  document: NativeDataGraphDocument;
  target: Record<string, unknown>;
};

/**
 * Admit a distinct native68 authored document, never the API67 facade format.
 * @param {unknown} value Native document.
 * @returns {NativeDataGraphDocument} Detached admitted input.
 */
export function validateNativeDataGraphDocument(value: unknown): NativeDataGraphDocument {
  graphRequire(
    value &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Reflect.ownKeys(value).length === 4,
  );
  for (const key of ['schemaVersion', 'kind', 'apiVersion', 'definition']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    graphRequire(descriptor?.enumerable && 'value' in descriptor);
  }
  const raw = graphRecord(value, ['schemaVersion', 'kind', 'apiVersion', 'definition']);
  graphRequire(
    raw.schemaVersion === 1 && raw.kind === 'native-data-graph' && raw.apiVersion === '68.0',
  );
  return {
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: buildDataGraphCreateRequest(raw.definition),
  };
}

/**
 * Hash detached JSON with stable object keys while retaining every array order.
 * @param {unknown} value JSON evidence.
 * @returns {string} SHA256 evidence digest.
 */
export function nativeGraphFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(graphCanonicalObject(value)))
    .digest('hex');
}

/**
 * Bind independently read native source projection and generated target identities.
 * Readiness proves definition state only, not successful computation or resource cleanup.
 * @param {unknown} value Native GET response.
 * @param {NativeDataGraphDocument} expected Admitted authored intent.
 * @returns {NativeDataGraphObservation} Detached nonvolatile identity and definition evidence.
 */
export function observeNativeDataGraph(
  value: unknown,
  expected: NativeDataGraphDocument,
): NativeDataGraphObservation {
  const document = validateNativeDataGraphDocument(expected);
  // A detached clone prevents callers changing the captured baseline after acquisition.
  const raw = graphRecord(structuredClone(value));
  const definition = document.definition;
  graphRequire(
    raw.name === definition.name &&
      raw.dataspaceName === 'default' &&
      raw.primaryObjectName === definition.primaryObjectName &&
      raw.kind === 'CdpDataGraphOutputRepresentation' &&
      raw.type === 'none' &&
      ['creating', 'ready', 'deleting'].includes(raw.status as string) &&
      raw.label === definition.label &&
      raw.description === definition.description &&
      raw.extendedProperties === '' &&
      raw.version === '0',
  );
  graphText(raw.id);
  graphText(raw.createdDate);
  graphRequire(Number.isFinite(Date.parse(raw.createdDate)));
  graphRequire(
    isDeepStrictEqual(raw.fullRefreshConfig, {
      schedule: { frequency: 1, timeGranularity: 'day' },
    }) && isDeepStrictEqual(raw.incrementalRefreshConfig, { enabled: false }),
  );
  if (raw.status === 'ready') {
    for (const key of [
      'idDmoName',
      'valuesDmoName',
      'dayZeroMappingDevName',
      'dayZeroTransformDevName',
    ])
      graphText(raw[key]);
  }
  const node = graphRecord(raw.sourceObject);
  if (raw.status === 'ready') graphText(node.fragmentDMOName);
  const authored = graphRecord(definition.sourceObject);
  graphRequire(
    node.name === authored.name &&
      node.label === authored.label &&
      node.projectedName === authored.name &&
      node.type === 'standard' &&
      node.jsonPath === '$' &&
      node.categoryDevName === 'Profile' &&
      node.referenceDeveloperName === 'Individual',
  );
  for (const key of ['dependency', 'path', 'recencyCriteria', 'relatedObjects', 'relatedSegments'])
    graphRequire(isDeepStrictEqual(node[key], []));
  graphText(node.id);
  graphText(node.devName);
  graphRequire(Array.isArray(node.fields) && node.fields.length === 3);
  const ids = new Set<string>();
  const names = new Set<string>();
  const fields = node.fields.map((value, index) => {
    const field = graphRecord(value);
    const source = graphRecord((authored.fields as unknown[])[index]);
    graphText(field.id);
    graphText(field.devName);
    graphRequire(
      !ids.has(field.id) &&
        !names.has(field.devName) &&
        field.name === field.devName &&
        field.sourceFieldName === source.sourceFieldName &&
        field.dataType === 'Text' &&
        field.isKeyColumn === (index === 0) &&
        field.isProjected === true &&
        field.isDGRootKeyField === false &&
        field.usageTag === (index === 1 ? 'key_qualifier' : 'none') &&
        isDeepStrictEqual(field.dependency, []) &&
        isDeepStrictEqual(field.fieldRoles, []) &&
        (index === 0
          ? field.keyQualifierName === 'KQ_Id__c'
          : !Object.hasOwn(field, 'keyQualifierName')),
    );
    ids.add(field.id);
    names.add(field.devName);
    return field;
  });
  // Include unknown nonvolatile properties rather than silently discarding dependency/identity drift.
  const target: Record<string, unknown> = { ...raw, sourceObject: { ...node, fields } };
  for (const key of ['status', 'modifiedDate', 'lastRefreshedDate']) delete target[key];
  return {
    id: raw.id,
    createdDate: new Date(raw.createdDate).toISOString(),
    status: raw.status as NativeDataGraphObservation['status'],
    definitionFingerprint: nativeGraphFingerprint(target),
    document,
    target,
  };
}
