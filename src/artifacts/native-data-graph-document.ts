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
    | 'processing'
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
 * Write the API's lowercase enum spellings in their request form so a retrieved file and a
 * fresh GET compare equal, whichever case the author used (GET reads `none`, `key_qualifier`,
 * `desc`, `day`; requests send `NONE`, `KEY_QUALIFIER`, `DESC`, `Day`).
 * @param {Record<string, unknown>} node Admitted node, changed in place.
 */
function normaliseNode(node: Record<string, unknown>): void {
  for (const field of node.fields as Record<string, unknown>[])
    field.usageTag = (field.usageTag as string).toUpperCase();
  if (Object.hasOwn(node, 'topKFilterCriteria'))
    for (const order of graphRecord(node.topKFilterCriteria).orderCriteria as Record<
      string,
      unknown
    >[])
      order.sortOrder = (order.sortOrder as string).toUpperCase();
  for (const child of node.relatedObjects as Record<string, unknown>[]) normaliseNode(child);
}

/**
 * Admit the structure of a node tree: shapes, names, unique paths and parent-linked joins.
 * Object names, node types, field data types, usage tags, key columns and criteria are not
 * restricted locally; the API decides.
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
  for (const key of ['name', 'label', 'jsonPath', 'type']) graphText(n[key]);
  graphRequire(!paths.has(n.jsonPath as string));
  paths.add(n.jsonPath as string);
  for (const key of ['devName', 'fragmentDMOName', 'referenceDeveloperName', 'projectedName'])
    if (Object.hasOwn(n, key)) graphText(n[key]);
  const fields = array(n.fields).map((f) => closed(f, fieldKeys));
  graphRequire(fields.length > 0);
  const sources = new Set<string>();
  const devs = new Set<string>();
  for (const f of fields) {
    for (const key of ['sourceFieldName', 'dataType', 'usageTag']) graphText(f[key]);
    graphRequire(
      !sources.has(f.sourceFieldName as string) &&
        typeof f.isKeyColumn === 'boolean' &&
        typeof f.isProjected === 'boolean',
    );
    sources.add(f.sourceFieldName as string);
    if (Object.hasOwn(f, 'devName')) {
      graphText(f.devName);
      graphRequire(dataGraphName.test(f.devName) && !devs.has(f.devName));
      devs.add(f.devName);
    }
    if (Object.hasOwn(f, 'keyQualifierName')) graphText(f.keyQualifierName);
    if (Object.hasOwn(f, 'isDGRootKeyField')) graphRequire(typeof f.isDGRootKeyField === 'boolean');
    if (Object.hasOwn(f, 'fieldRoles')) array(f.fieldRoles);
  }
  const joins = array(n.path).map((p) => closed(p, pathKeys));
  for (const p of joins) {
    graphText(p.fieldName);
    graphText(p.parentFieldName);
    if (Object.hasOwn(p, 'devName')) graphText(p.devName);
  }
  // The tree shape is structural: a related object hangs below its parent through a join.
  if (parent)
    graphRequire(
      n.jsonPath === `${parent.jsonPath as string}.${n.name as string}` && joins.length > 0,
    );
  else graphRequire(n.jsonPath === '$' && joins.length === 0);
  for (const key of ['recencyCriteria', 'filterCriteria']) if (Object.hasOwn(n, key)) array(n[key]);
  if (Object.hasOwn(n, 'topKFilterCriteria')) {
    const top = closed(n.topKFilterCriteria, ['limit', 'orderCriteria']);
    graphRequire(Number.isSafeInteger(top.limit) && (top.limit as number) > 0);
    for (const value of array(top.orderCriteria)) {
      const order = closed(value, ['fieldApiName', 'sortOrder']);
      graphText(order.fieldApiName);
      graphText(order.sortOrder);
    }
  }
  for (const child of array(n.relatedObjects)) admitNode(child, n, paths);
  return n;
}

/**
 * Admit saved native68 definitions by structure; the API decides what it accepts.
 * @param {unknown} value Native document.
 * @returns {NativeDataGraphDocument} Detached admitted input with normalised enum spellings.
 */
export function validateNativeDataGraphDocument(value: unknown): NativeDataGraphDocument {
  inert(value);
  const raw = graphRecord(structuredClone(value), [
    'schemaVersion',
    'kind',
    'apiVersion',
    'definition',
  ]);
  graphRequire(
    raw.schemaVersion === 1 && raw.kind === 'native-data-graph' && raw.apiVersion === '68.0',
  );
  const d = closed(raw.definition, topKeys);
  graphRequire(typeof d.name === 'string' && dataGraphName.test(d.name));
  graphText(d.label);
  if (Object.hasOwn(d, 'description')) graphRequire(typeof d.description === 'string');
  // Native graph reads and writes are bound to the default data space only.
  graphRequire(d.dataspaceName === 'default');
  graphText(d.primaryObjectName);
  graphText(d.type);
  for (const key of topKeys.slice(7, 13)) if (Object.hasOwn(d, key)) graphText(d[key]);
  if (Object.hasOwn(d, 'fullRefreshConfig')) {
    const schedule = closed(closed(d.fullRefreshConfig, ['schedule']).schedule, [
      'frequency',
      'timeGranularity',
    ]);
    graphRequire(Number.isSafeInteger(schedule.frequency) && (schedule.frequency as number) > 0);
    graphText(schedule.timeGranularity);
    schedule.timeGranularity =
      schedule.timeGranularity.charAt(0).toUpperCase() +
      schedule.timeGranularity.slice(1).toLowerCase();
  }
  if (Object.hasOwn(d, 'incrementalRefreshConfig')) graphRecord(d.incrementalRefreshConfig);
  const root = admitNode(d.sourceObject);
  // The root node is the primary object; root binding reads exactly this object.
  graphRequire(root.name === d.primaryObjectName);
  d.type = d.type.toUpperCase();
  normaliseNode(root);
  return raw as NativeDataGraphDocument;
}

/**
 * Whether no node or field of a native GET reports dependencies or related segments.
 * Delete requires this; retrieve and update do not.
 * @param {unknown} value Native GET response (or its observed target).
 * @returns {boolean} True when every dependency and related-segment array is empty.
 */
export function nativeDataGraphUnreferenced(value: unknown): boolean {
  const node = graphRecord(value);
  return (
    isDeepStrictEqual(node.dependency, []) &&
    isDeepStrictEqual(node.relatedSegments, []) &&
    array(node.fields).every((f) => isDeepStrictEqual(graphRecord(f).dependency, [])) &&
    array(node.relatedObjects).every((child) => nativeDataGraphUnreferenced(child))
  );
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
  // Dependencies and related segments are server facts, not authored configuration; delete
  // checks them separately (nativeDataGraphUnreferenced).
  for (const key of ['dependency', 'relatedSegments']) array(n[key]);
  graphText(n.categoryDevName);
  const result = pick(n, nodeKeys);
  result.fields = array(n.fields).map((value) => {
    const f = closed(value, [...fieldKeys, 'id', 'name', 'dependency', 'sourceFieldLabel']);
    graphText(f.id);
    graphRequire(!identities.has(f.id));
    identities.add(f.id);
    graphText(f.devName);
    graphRequire(f.name === f.devName);
    array(f.dependency);
    return pick(f, fieldKeys);
  });
  result.path = array(n.path).map((value) => {
    const p = closed(value, [...pathKeys, 'fieldLabel', 'parentFieldLabel']);
    graphText(p.devName);
    return pick(p, pathKeys);
  });
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
      raw.extendedProperties === '' &&
      typeof raw.version === 'string' &&
      /^\d+$/u.test(raw.version),
  );
  const definition = pick(raw, topKeys);
  // A graph that is still being created carries empty generated names (`valuesDmoName: ""`
  // in the API68 create echo, recorded live 2026-11-12); they are not authored values.
  if (raw.status !== 'ready')
    for (const key of topKeys.slice(7, 13)) if (definition[key] === '') delete definition[key];
  definition.sourceObject = observedNode(raw.sourceObject);
  // Lowercase enum spellings (type, usageTag, sortOrder, timeGranularity) are normalised there.
  return validateNativeDataGraphDocument({
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition,
  });
}

/**
 * Remove server-generated names from a node tree: node fragment DMOs, join and field developer
 * names. They belong to one graph instance and are never authored configuration.
 * @param {Record<string, unknown>} n Node, changed in place.
 */
function unbind(n: Record<string, unknown>): void {
  delete n.fragmentDMOName;
  for (const p of n.path as Record<string, unknown>[]) delete p.devName;
  for (const f of n.fields as Record<string, unknown>[]) delete f.devName;
  for (const c of n.relatedObjects as Record<string, unknown>[]) unbind(c);
}

/**
 * Project an authored native document into its API68 create body: the authored definition as
 * written (any root, related objects with their joins, field settings, schedules), without the
 * graph-level generated DMO/mapping/transform names, fragment DMOs and join/field developer names.
 * The node `devName` is kept: both recorded API68 creates sent one and the server replaced it.
 * @param {unknown} value Native document.
 * @returns {Record<string, unknown>} Detached create body.
 */
export function nativeDataGraphCreateDefinition(value: unknown): Record<string, unknown> {
  const definition = validateNativeDataGraphDocument(value).definition;
  for (const key of topKeys.slice(7, 13)) delete definition[key];
  unbind(graphRecord(definition.sourceObject));
  return definition;
}

/**
 * Apply the authored definition to the fresh target while keeping every generated binding.
 * Authored configuration (label, description, graph type, schedules, node labels, criteria,
 * joins, field settings, new fields and related objects) is sent as written; the API decides.
 * Omitted existing fields/branches are retained, never interpreted as removals.
 * Refused: a different name, data space or root object (they identify the target graph), and a
 * different node object, path, type, reference or projected name for a retained node. The node
 * type is assigned by the API: a recorded API68 create sent `standard` for a unified root and
 * read `derived` back (2026-11-12), so a differing node type would be silently replaced.
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
  for (const key of ['name', 'dataspaceName', 'primaryObjectName'])
    graphRequire(target[key] === wanted[key]);
  // Generated DMO, mapping and transform names stay the target's; authored ones are ignored.
  for (const key of ['label', 'type', 'fullRefreshConfig', 'incrementalRefreshConfig'])
    if (Object.hasOwn(wanted, key)) target[key] = wanted[key];
  // An omitted description keeps the target's, like any other omitted property.
  if (Object.hasOwn(wanted, 'description')) target.description = wanted.description;
  /**
   * Apply one authored node to its retained target node, keeping generated bindings.
   * @param {Record<string, unknown>} current Target node.
   * @param {Record<string, unknown>} next Authored node.
   */
  function merge(current: Record<string, unknown>, next: Record<string, unknown>): void {
    for (const key of ['name', 'jsonPath', 'type', 'referenceDeveloperName', 'projectedName'])
      if (Object.hasOwn(next, key)) graphRequire(isDeepStrictEqual(current[key], next[key]));
    for (const key of ['label', 'recencyCriteria', 'filterCriteria', 'topKFilterCriteria'])
      if (Object.hasOwn(next, key)) current[key] = next[key];
    const joins = (path: unknown): unknown[] =>
      (path as Record<string, unknown>[]).map((p) => pick(p, ['fieldName', 'parentFieldName']));
    // A changed join is sent as authored, without the old generated join names.
    if (!isDeepStrictEqual(joins(current.path), joins(next.path))) current.path = joins(next.path);
    for (const f of next.fields as Record<string, unknown>[]) {
      const settings = pick(
        f,
        fieldKeys.filter((k) => k !== 'devName'),
      );
      const existing = (current.fields as Record<string, unknown>[]).find(
        (entry) => entry.sourceFieldName === f.sourceFieldName,
      );
      if (existing) Object.assign(existing, settings);
      else (current.fields as unknown[]).push(settings);
    }
    for (const child of next.relatedObjects as Record<string, unknown>[]) {
      const existing = (current.relatedObjects as Record<string, unknown>[]).find(
        (entry) => entry.jsonPath === child.jsonPath,
      );
      if (existing) merge(existing, child);
      else {
        // A new node carries no generated names, including authored hints from another graph.
        const added = structuredClone(child);
        /**
         * Drop node developer names throughout the new subtree.
         * @param {Record<string, unknown>} n New node.
         */
        const anonymous = (n: Record<string, unknown>): void => {
          delete n.devName;
          for (const c of n.relatedObjects as Record<string, unknown>[]) anonymous(c);
        };
        anonymous(added);
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
      // Read for about 9 s between creating and ready during a live API68 create (2026-11-12).
      'processing',
      'ready',
      'deleting',
      'editing',
      'editing_no_version_update',
      'editing_post_sync',
    ].includes(raw.status as string),
  );
  // Every authored setting must already hold. Field order is the server's: it reordered the
  // fields of a related object added by PUT (recorded live at API68, 2026-11-12).
  const request = buildNativeDataGraphUpdateRequest(raw, document);
  graphRequire(isDeepStrictEqual(request, actual.definition));
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
