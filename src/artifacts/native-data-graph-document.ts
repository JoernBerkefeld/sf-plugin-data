import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { dataGraphName, graphRecord, graphRequire, graphText } from './data-graph-document.js';
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
  status:
    | 'creating'
    | 'ready'
    | 'deleting'
    | 'editing'
    | 'editing_no_version_update'
    | 'editing_post_sync';
  definitionFingerprint: string;
  document: NativeDataGraphDocument;
  target: Record<string, unknown>;
};

const topKeys = [
  'name',
  'label',
  'description',
  'dataspaceName',
  'primaryObjectName',
  'type',
  'sourceObject',
  'idDmoName',
  'valuesDmoName',
  'dayZeroMappingDevName',
  'dayZeroTransformDevName',
  'incrementalMappingDevName',
  'incrementalTransformDevName',
  'fullRefreshConfig',
  'incrementalRefreshConfig',
];
const nodeKeys = [
  'name',
  'devName',
  'label',
  'jsonPath',
  'path',
  'type',
  'fragmentDMOName',
  'referenceDeveloperName',
  'projectedName',
  'recencyCriteria',
  'filterCriteria',
  'topKFilterCriteria',
  'fields',
  'relatedObjects',
];
const fieldKeys = [
  'devName',
  'sourceFieldName',
  'dataType',
  'isKeyColumn',
  'isProjected',
  'usageTag',
  'keyQualifierName',
  'isDGRootKeyField',
  'fieldRoles',
];
const pathKeys = ['devName', 'fieldName', 'parentFieldName'];

/**
 * Reject executable, cyclic, sparse or accessor-bearing inputs before any reads.
 * @param {unknown} value Candidate JSON.
 * @param {Set<object>} ancestors Active ancestors.
 */
function inert(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    graphRequire(Number.isFinite(value));
    return;
  }
  graphRequire(value && typeof value === 'object' && !ancestors.has(value) && ancestors.size < 24);
  graphRequire(
    Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype),
  );
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    graphRequire(typeof key === 'string' && key !== 'toJSON' && d?.enumerable && 'value' in d);
    inert(d.value, ancestors);
  }
  if (Array.isArray(value)) graphRequire(Object.keys(value).length === value.length);
  ancestors.delete(value);
}

/**
 * Check a closed property inventory without discarding unsupported configuration.
 * @param {unknown} value Record.
 * @param {string[]} keys Allowed keys.
 * @returns {Record<string, unknown>} Checked record.
 */
function closed(value: unknown, keys: string[]): Record<string, unknown> {
  const result = graphRecord(value);
  graphRequire(Object.keys(result).every((key) => keys.includes(key)));
  return result;
}

/**
 * Require an array.
 * @param {unknown} value Candidate array.
 * @returns {unknown[]} Checked array.
 */
function array(value: unknown): unknown[] {
  graphRequire(Array.isArray(value));
  return value;
}

/**
 * Select known request properties after closed observation admission.
 * @param {Record<string, unknown>} value Record.
 * @param {string[]} keys Request inventory.
 * @returns {Record<string, unknown>} Detached selected properties.
 */
function pick(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, structuredClone(value[key])]),
  );
}

/**
 * Admit qualified recursive Text projections and unambiguous joins.
 * @param {unknown} value Node input.
 * @param {Record<string, unknown>} [parent] Parent input.
 * @param {Set<string>} paths Unique node paths.
 * @returns {Record<string, unknown>} Checked node.
 */
function admitNode(
  value: unknown,
  parent?: Record<string, unknown>,
  paths = new Set<string>(),
): Record<string, unknown> {
  const n = closed(value, nodeKeys);
  for (const key of ['name', 'label', 'jsonPath']) graphText(n[key]);
  graphRequire(n.type === 'standard' && !paths.has(n.jsonPath as string));
  paths.add(n.jsonPath as string);
  for (const key of ['devName', 'fragmentDMOName', 'referenceDeveloperName', 'projectedName'])
    if (Object.hasOwn(n, key)) graphText(n[key]);
  const fields = array(n.fields).map((f) => closed(f, fieldKeys));
  graphRequire(fields.length >= 2);
  const sources = new Set<string>();
  const devs = new Set<string>();
  for (const f of fields) {
    graphText(f.sourceFieldName);
    graphRequire(
      !sources.has(f.sourceFieldName) &&
        f.dataType === 'Text' &&
        typeof f.isKeyColumn === 'boolean' &&
        f.isProjected === true &&
        ['NONE', 'KEY_QUALIFIER'].includes(f.usageTag as string),
    );
    sources.add(f.sourceFieldName);
    if (Object.hasOwn(f, 'devName')) {
      graphText(f.devName);
      graphRequire(dataGraphName.test(f.devName) && !devs.has(f.devName));
      devs.add(f.devName);
    }
    if (Object.hasOwn(f, 'isDGRootKeyField')) graphRequire(f.isDGRootKeyField === false);
    if (Object.hasOwn(f, 'fieldRoles')) graphRequire(array(f.fieldRoles).length === 0);
  }
  graphRequire(fields.filter((f) => f.isKeyColumn).length === 1);
  for (const f of fields)
    if (Object.hasOwn(f, 'keyQualifierName')) {
      graphText(f.keyQualifierName);
      graphRequire(
        fields.some(
          (q) => q.sourceFieldName === f.keyQualifierName && q.usageTag === 'KEY_QUALIFIER',
        ),
      );
    }
  const joins = array(n.path).map((p) => closed(p, pathKeys));
  if (parent) {
    graphRequire(
      n.jsonPath === `${parent.jsonPath as string}.${n.name as string}` && joins.length === 1,
    );
    for (const p of joins) {
      graphText(p.fieldName);
      graphText(p.parentFieldName);
      if (Object.hasOwn(p, 'devName')) graphText(p.devName);
      graphRequire(
        sources.has(p.fieldName) &&
          (parent.fields as Record<string, unknown>[]).some(
            (f) => f.sourceFieldName === p.parentFieldName,
          ),
      );
    }
  } else {
    graphRequire(n.name === 'ssot__Individual__dlm' && n.jsonPath === '$' && joins.length === 0);
    graphRequire(
      fields[0].sourceFieldName === 'ssot__Id__c' &&
        fields[0].isKeyColumn &&
        fields[1].sourceFieldName === 'KQ_Id__c' &&
        fields[1].usageTag === 'KEY_QUALIFIER',
    );
  }
  // Only empty recency/filter settings and the empirically qualified topK are admitted.
  for (const key of ['recencyCriteria', 'filterCriteria'])
    if (Object.hasOwn(n, key)) graphRequire(array(n[key]).length === 0);
  if (Object.hasOwn(n, 'topKFilterCriteria')) {
    const top = closed(n.topKFilterCriteria, ['limit', 'orderCriteria']);
    graphRequire(top.limit === 100 && array(top.orderCriteria).length === 1);
    const order = closed((top.orderCriteria as unknown[])[0], ['fieldApiName', 'sortOrder']);
    graphRequire(
      order.fieldApiName === 'ssot__Id__c' &&
        order.sortOrder === 'DESC' &&
        sources.has('ssot__Id__c'),
    );
  }
  for (const child of array(n.relatedObjects)) admitNode(child, n, paths);
  return n;
}

/**
 * Admit saved native68 definitions separately from the narrower CREATE-send contract.
 * @param {unknown} value Native document.
 * @returns {NativeDataGraphDocument} Detached admitted input.
 */
export function validateNativeDataGraphDocument(value: unknown): NativeDataGraphDocument {
  inert(value);
  const raw = graphRecord(value, ['schemaVersion', 'kind', 'apiVersion', 'definition']);
  graphRequire(
    raw.schemaVersion === 1 && raw.kind === 'native-data-graph' && raw.apiVersion === '68.0',
  );
  const d = closed(raw.definition, topKeys);
  graphRequire(typeof d.name === 'string' && dataGraphName.test(d.name));
  graphText(d.label);
  graphRequire(typeof d.description === 'string' && d.description.length <= 1024);
  graphRequire(
    d.dataspaceName === 'default' &&
      d.primaryObjectName === 'ssot__Individual__dlm' &&
      d.type === 'NONE',
  );
  for (const key of topKeys.slice(7, 13)) if (Object.hasOwn(d, key)) graphText(d[key]);
  if (Object.hasOwn(d, 'fullRefreshConfig'))
    graphRequire(
      isDeepStrictEqual(d.fullRefreshConfig, {
        schedule: { frequency: 1, timeGranularity: 'Day' },
      }),
    );
  if (Object.hasOwn(d, 'incrementalRefreshConfig'))
    graphRequire(isDeepStrictEqual(d.incrementalRefreshConfig, { enabled: false }));
  admitNode(d.sourceObject);
  return structuredClone(raw) as NativeDataGraphDocument;
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
 * Convert an admitted GET node to the exact qualified PUT inventory.
 * @param {unknown} value GET node.
 * @param {Set<string>} identities Already observed record identities.
 * @returns {Record<string, unknown>} Request node.
 */
function observedNode(value: unknown, identities = new Set<string>()): Record<string, unknown> {
  const n = closed(value, [
    ...nodeKeys,
    'id',
    'categoryDevName',
    'dependency',
    'relatedSegments',
    'fragmentDMOLabel',
  ]);
  graphText(n.id);
  graphRequire(!identities.has(n.id));
  identities.add(n.id);
  graphText(n.devName);
  for (const key of ['dependency', 'relatedSegments']) graphRequire(isDeepStrictEqual(n[key], []));
  graphRequire(['Profile', 'Related'].includes(n.categoryDevName as string));
  const result = pick(n, nodeKeys);
  result.fields = array(n.fields).map((value) => {
    const f = closed(value, [...fieldKeys, 'id', 'name', 'dependency', 'sourceFieldLabel']);
    graphText(f.id);
    graphRequire(!identities.has(f.id));
    identities.add(f.id);
    graphText(f.devName);
    graphRequire(f.name === f.devName && isDeepStrictEqual(f.dependency, []));
    const field = pick(f, fieldKeys);
    graphRequire(typeof f.usageTag === 'string');
    field.usageTag = f.usageTag.toUpperCase();
    return field;
  });
  result.path = array(n.path).map((value) => {
    const p = closed(value, [...pathKeys, 'fieldLabel', 'parentFieldLabel']);
    graphText(p.devName);
    return pick(p, pathKeys);
  });
  if (result.topKFilterCriteria) {
    const top = graphRecord(result.topKFilterCriteria);
    for (const value of array(top.orderCriteria)) {
      const order = graphRecord(value);
      graphRequire(typeof order.sortOrder === 'string');
      order.sortOrder = order.sortOrder.toUpperCase();
    }
  }
  result.relatedObjects = array(n.relatedObjects).map((child) => observedNode(child, identities));
  return result;
}

/**
 * Roundtrip qualified native GET data without treating record IDs as portable authority.
 * @param {unknown} value Native GET response.
 * @returns {NativeDataGraphDocument} Complete authored request representation.
 */
export function nativeDataGraphDocumentFromResponse(value: unknown): NativeDataGraphDocument {
  inert(value);
  const raw = closed(value, [
    ...topKeys,
    'id',
    'createdDate',
    'createdBy',
    'modifiedDate',
    'lastRefreshedDate',
    'kind',
    'status',
    'version',
    'extendedProperties',
    'idDmoLabel',
    'valuesDmoLabel',
    'primaryObjectLabel',
  ]);
  graphRequire(
    raw.kind === 'CdpDataGraphOutputRepresentation' &&
      raw.type === 'none' &&
      raw.extendedProperties === '' &&
      typeof raw.version === 'string' &&
      /^\d+$/u.test(raw.version),
  );
  const definition = pick(raw, topKeys);
  // A graph that is still being created carries empty generated names (`valuesDmoName: ""`
  // in the API68 create echo, recorded live 2026-11-12); they are not authored values.
  if (raw.status !== 'ready')
    for (const key of topKeys.slice(7, 13)) if (definition[key] === '') delete definition[key];
  definition.type = 'NONE';
  definition.sourceObject = observedNode(raw.sourceObject);
  graphRequire(
    isDeepStrictEqual(raw.fullRefreshConfig, {
      schedule: { frequency: 1, timeGranularity: 'day' },
    }),
  );
  definition.fullRefreshConfig = { schedule: { frequency: 1, timeGranularity: 'Day' } };
  return validateNativeDataGraphDocument({
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition,
  });
}

/**
 * Preserve baseline bindings while applying display and additive projection changes only.
 * Omitted existing fields/branches are retained, never interpreted as removals.
 * @param {unknown} baseline Fresh independently bound native GET.
 * @param {NativeDataGraphDocument} desired Authored intent, not target authority.
 * @returns {Record<string, unknown>} Complete target-bound PUT payload.
 */
export function buildNativeDataGraphUpdateRequest(
  baseline: unknown,
  desired: NativeDataGraphDocument,
): Record<string, unknown> {
  const target = nativeDataGraphDocumentFromResponse(baseline).definition;
  const wanted = validateNativeDataGraphDocument(desired).definition;
  for (const key of ['name', 'dataspaceName', 'primaryObjectName', 'type'])
    graphRequire(target[key] === wanted[key]);
  for (const key of topKeys.slice(7))
    if (Object.hasOwn(wanted, key)) graphRequire(isDeepStrictEqual(target[key], wanted[key]));
  target.label = wanted.label;
  target.description = wanted.description;
  /**
   * Merge only source-identified additions, retaining every generated target binding.
   * @param {Record<string, unknown>} current Target node.
   * @param {Record<string, unknown>} next Authored node.
   */
  function merge(current: Record<string, unknown>, next: Record<string, unknown>): void {
    for (const key of nodeKeys.filter(
      (k) => !['fields', 'relatedObjects', 'devName', 'fragmentDMOName', 'path'].includes(k),
    ))
      if (Object.hasOwn(next, key)) graphRequire(isDeepStrictEqual(current[key], next[key]));
    graphRequire(
      isDeepStrictEqual(
        (current.path as Record<string, unknown>[]).map((p) =>
          pick(p, ['fieldName', 'parentFieldName']),
        ),
        (next.path as Record<string, unknown>[]).map((p) =>
          pick(p, ['fieldName', 'parentFieldName']),
        ),
      ),
    );
    for (const f of next.fields as Record<string, unknown>[]) {
      const existing = (current.fields as Record<string, unknown>[]).find(
        (entry) => entry.sourceFieldName === f.sourceFieldName,
      );
      if (existing) {
        for (const key of fieldKeys.filter((k) => k !== 'devName'))
          if (Object.hasOwn(f, key)) graphRequire(isDeepStrictEqual(existing[key], f[key]));
      } else {
        graphRequire(!f.isKeyColumn && f.usageTag === 'NONE' && !f.keyQualifierName);
        const added = pick(
          f,
          fieldKeys.filter((k) => k !== 'devName'),
        );
        (current.fields as unknown[]).push(added);
      }
    }
    for (const child of next.relatedObjects as Record<string, unknown>[]) {
      const existing = (current.relatedObjects as Record<string, unknown>[]).find(
        (entry) => entry.jsonPath === child.jsonPath,
      );
      if (existing) merge(existing, child);
      else {
        // New nodes may not import foreign generated bindings or reparent retained nodes.
        const allPaths = new Set<string>();
        /**
         * Collect existing source node identities.
         * @param {Record<string, unknown>} n Existing node.
         */
        function collect(n: Record<string, unknown>): void {
          allPaths.add(n.name as string);
          for (const c of n.relatedObjects as Record<string, unknown>[]) collect(c);
        }
        collect(graphRecord(target.sourceObject));
        /**
         * Reject moving any retained source node beneath a new ancestor.
         * @param {Record<string, unknown>} n Candidate subtree.
         */
        function fresh(n: Record<string, unknown>): void {
          graphRequire(!allPaths.has(n.name as string));
          allPaths.add(n.name as string);
          for (const nested of n.relatedObjects as Record<string, unknown>[]) fresh(nested);
        }
        fresh(child);
        /**
         * Remove authored generated hints only from genuinely new nodes.
         * @param {Record<string, unknown>} n New node.
         */
        function unbind(n: Record<string, unknown>): void {
          delete n.devName;
          delete n.fragmentDMOName;
          for (const p of n.path as Record<string, unknown>[]) delete p.devName;
          for (const f of n.fields as Record<string, unknown>[]) delete f.devName;
          for (const c of n.relatedObjects as Record<string, unknown>[]) unbind(c);
        }
        const added = structuredClone(child);
        unbind(added);
        (current.relatedObjects as unknown[]).push(added);
      }
    }
  }
  merge(graphRecord(target.sourceObject), graphRecord(wanted.sourceObject));
  return validateNativeDataGraphDocument({
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: target,
  }).definition;
}

/**
 * Bind independently read projection and generated identities; readiness is not computation proof.
 * @param {unknown} value Native GET response.
 * @param {NativeDataGraphDocument} expected Authored intent.
 * @returns {NativeDataGraphObservation} Detached nonvolatile evidence.
 */
export function observeNativeDataGraph(
  value: unknown,
  expected: NativeDataGraphDocument,
): NativeDataGraphObservation {
  const document = validateNativeDataGraphDocument(expected);
  const actual = nativeDataGraphDocumentFromResponse(value);
  const raw = graphRecord(structuredClone(value));
  graphText(raw.id);
  graphText(raw.createdDate);
  graphRequire(Number.isFinite(Date.parse(raw.createdDate)));
  graphRequire(
    [
      'creating',
      'ready',
      'deleting',
      'editing',
      'editing_no_version_update',
      'editing_post_sync',
    ].includes(raw.status as string),
  );
  const request = buildNativeDataGraphUpdateRequest(raw, document);
  graphRequire(isDeepStrictEqual(request, actual.definition));
  // CREATE's minimal authored fields omit the server-generated key qualifier annotation.
  const authoredFields = graphRecord(document.definition.sourceObject).fields as Record<
    string,
    unknown
  >[];
  const actualFields = graphRecord(actual.definition.sourceObject).fields as Record<
    string,
    unknown
  >[];
  graphRequire(
    authoredFields.every((f, index) => f.sourceFieldName === actualFields[index]?.sourceFieldName),
  );
  if (raw.status === 'ready') {
    for (const key of [
      'idDmoName',
      'valuesDmoName',
      'dayZeroMappingDevName',
      'dayZeroTransformDevName',
    ])
      graphText(raw[key]);
    graphText(graphRecord(raw.sourceObject).fragmentDMOName);
  }
  const target = { ...raw };
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
