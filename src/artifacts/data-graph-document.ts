import { isDeepStrictEqual } from 'node:util';

export const dataGraphName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

export type DataGraphField = {
  sourceFieldName: string;
  dataType: 'Text';
  isKeyColumn: boolean;
  isProjected: true;
};
export type DataGraphDocument = {
  schemaVersion: 1;
  kind: 'data-graph';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    label: string;
    description: string;
    primaryObjectName: 'UnifiedssotIndividualMkt__dlm';
    type: 'NONE';
    fullRefreshConfig: { schedule: { frequency: 7; timeGranularity: 'Day' } };
    incrementalRefreshConfig: { enabled: false };
    sourceObject: {
      name: string;
      devName: string;
      label: string;
      path: [];
      fields: DataGraphField[];
      relatedObjects: [];
    };
  };
};
/** Private creation-time knowledge bound to one actual returned owner, never portable provenance. */
export type DataGraphCreationIntent = {
  apiName: string;
  ownerId: string;
  dataSpace: 'default';
  creationMode: 'DEFAULT';
};
export type DataGraphProjection = {
  candidate: DataGraphDocument;
  expectations: { graph: Record<string, unknown>; intent?: DataGraphCreationIntent };
};

/** Payload-free failure for unqualified Graph configuration. */
export class DataGraphError extends Error {
  public constructor(public readonly code = 'UNSUPPORTED_DATA_GRAPH_CONFIGURATION') {
    super('Data graph configuration could not be admitted.');
    this.name = 'DataGraphError';
  }
}

/**
 * Require a qualified invariant without retaining raw data.
 * @param {unknown} value Required invariant.
 */
export function graphRequire(value: unknown): asserts value {
  if (!value) throw new DataGraphError();
}

/**
 * Admit inert bounded JSON before accessing properties.
 * @param {unknown} value Candidate.
 * @param {Set<object>} seen Ancestors.
 * @param {number} depth Depth.
 */
function json(value: unknown, seen = new Set<object>(), depth = 0): void {
  graphRequire(depth < 24);
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (typeof value === 'string') {
    graphRequire(value.length <= 262_144);
    return;
  }
  graphRequire(value && typeof value === 'object' && !seen.has(value));
  graphRequire(
    Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype),
  );
  seen.add(value);
  graphRequire(Reflect.ownKeys(value).length <= 256);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    graphRequire(
      typeof key === 'string' &&
        key !== 'toJSON' &&
        descriptor?.enumerable &&
        'value' in descriptor,
    );
    json(descriptor.value, seen, depth + 1);
  }
  if (Array.isArray(value)) graphRequire(Object.keys(value).length === value.length);
  seen.delete(value);
}

/**
 * Validate an exact record.
 * @param {unknown} value Candidate.
 * @param {string[]} keys Inventory.
 * @returns {Record<string, unknown>} Checked record.
 */
export function graphRecord(value: unknown, keys?: string[]): Record<string, unknown> {
  graphRequire(value && typeof value === 'object' && !Array.isArray(value));
  if (keys)
    graphRequire(
      Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    );
  return value as Record<string, unknown>;
}

/**
 * Validate nonblank private identity/display text.
 * @param {unknown} value Candidate.
 */
export function graphText(value: unknown): asserts value is string {
  graphRequire(typeof value === 'string' && value.trim().length > 0);
}

/**
 * Return qualified ordered projection fields.
 * @param {boolean} lastName Include appended field.
 * @returns {DataGraphField[]} Fields.
 */
export function dataGraphFields(lastName: boolean): DataGraphField[] {
  return ['ssot__Id__c', 'ssot__FirstName__c', ...(lastName ? ['ssot__LastName__c'] : [])].map(
    (sourceFieldName, index) => ({
      sourceFieldName,
      dataType: 'Text',
      isKeyColumn: index === 0,
      isProjected: true,
    }),
  );
}

/**
 * Validate portable root-only content without generated ids or creation provenance.
 * @param {unknown} value Candidate.
 * @returns {DataGraphDocument} Detached document.
 */
export function validateDataGraphDocument(value: unknown): DataGraphDocument {
  json(value);
  const root = graphRecord(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  const identity = graphRecord(root.identity, ['dataSpace', 'apiName']);
  graphRequire(
    root.schemaVersion === 1 &&
      root.kind === 'data-graph' &&
      identity.dataSpace === 'default' &&
      typeof identity.apiName === 'string' &&
      dataGraphName.test(identity.apiName),
  );
  const spec = graphRecord(root.spec, [
    'label',
    'description',
    'primaryObjectName',
    'type',
    'fullRefreshConfig',
    'incrementalRefreshConfig',
    'sourceObject',
  ]);
  graphText(spec.label);
  graphRequire(
    typeof spec.description === 'string' &&
      spec.primaryObjectName === 'UnifiedssotIndividualMkt__dlm' &&
      spec.type === 'NONE',
  );
  graphRequire(
    isDeepStrictEqual(spec.fullRefreshConfig, {
      schedule: { frequency: 7, timeGranularity: 'Day' },
    }) && isDeepStrictEqual(spec.incrementalRefreshConfig, { enabled: false }),
  );
  const source = graphRecord(spec.sourceObject, [
    'name',
    'devName',
    'label',
    'path',
    'fields',
    'relatedObjects',
  ]);
  graphText(source.label);
  graphRequire(
    source.name === spec.primaryObjectName &&
      source.devName === source.name &&
      isDeepStrictEqual(source.path, []) &&
      isDeepStrictEqual(source.relatedObjects, []),
  );
  graphRequire(
    isDeepStrictEqual(source.fields, dataGraphFields(false)) ||
      isDeepStrictEqual(source.fields, dataGraphFields(true)),
  );
  return structuredClone(value) as DataGraphDocument;
}

const graphKeys = [
  'createdBy',
  'createdDate',
  'dataspaceName',
  'dayZeroMappingDevName',
  'dayZeroTransformDevName',
  'description',
  'extendedProperties',
  'fullRefreshConfig',
  'id',
  'idDmoLabel',
  'idDmoName',
  'incrementalRefreshConfig',
  'kind',
  'label',
  'modifiedDate',
  'name',
  'primaryObjectLabel',
  'primaryObjectName',
  'sourceObject',
  'status',
  'type',
  'valuesDmoLabel',
  'valuesDmoName',
  'version',
];
const nodeKeys = [
  'categoryDevName',
  'dependency',
  'devName',
  'fields',
  'fragmentDMOLabel',
  'fragmentDMOName',
  'id',
  'jsonPath',
  'label',
  'name',
  'path',
  'projectedName',
  'recencyCriteria',
  'referenceDeveloperName',
  'relatedObjects',
  'relatedSegments',
  'type',
];
const fieldKeys = [
  'dataType',
  'dependency',
  'devName',
  'fieldRoles',
  'id',
  'isDGRootKeyField',
  'isKeyColumn',
  'isProjected',
  'name',
  'sourceFieldLabel',
  'sourceFieldName',
  'usageTag',
];

/**
 * Project strict GET without inventing historical request-only creation mode.
 * @param {unknown} value Exact GET result.
 * @param {string} apiName Expected owner.
 * @param {DataGraphCreationIntent} intent Private associated creation knowledge.
 * @returns {DataGraphProjection} Portable and full private baseline.
 */
export function projectDataGraph(
  value: unknown,
  apiName: string,
  intent?: DataGraphCreationIntent,
): DataGraphProjection {
  json(value);
  const raw = graphRecord(value, [
    ...graphKeys,
    ...(Object.hasOwn(graphRecord(value), 'creationMode') ? ['creationMode'] : []),
  ]);
  graphRequire(
    raw.name === apiName &&
      raw.dataspaceName === 'default' &&
      raw.status === 'ready' &&
      raw.kind === 'CdpDataGraphOutputRepresentation',
  );
  for (const key of [
    'id',
    'createdBy',
    'createdDate',
    'modifiedDate',
    'dayZeroMappingDevName',
    'dayZeroTransformDevName',
    'idDmoLabel',
    'idDmoName',
    'valuesDmoLabel',
    'valuesDmoName',
    'version',
    'primaryObjectLabel',
  ])
    graphText(raw[key]);
  graphRequire(raw.extendedProperties === '' && (raw.type === 'none' || raw.type === 'NONE'));
  if (
    intent &&
    (intent.apiName !== apiName ||
      intent.ownerId !== raw.id ||
      intent.dataSpace !== 'default' ||
      intent.creationMode !== 'DEFAULT')
  )
    throw new DataGraphError('DATA_GRAPH_CREATION_INTENT_REQUIRED');
  if (Object.hasOwn(raw, 'creationMode')) graphRequire(raw.creationMode === 'DEFAULT');
  const node = graphRecord(raw.sourceObject, nodeKeys);
  graphRequire(
    node.name === raw.primaryObjectName &&
      node.projectedName === node.name &&
      node.label === raw.primaryObjectLabel &&
      node.categoryDevName === 'Profile' &&
      node.jsonPath === '$' &&
      node.type === 'derived' &&
      node.referenceDeveloperName === 'UnifiedIndividual',
  );
  for (const key of ['devName', 'fragmentDMOLabel', 'fragmentDMOName', 'id', 'label'])
    graphText(node[key]);
  for (const key of ['dependency', 'path', 'recencyCriteria', 'relatedObjects', 'relatedSegments'])
    graphRequire(isDeepStrictEqual(node[key], []));
  graphRequire(
    Array.isArray(node.fields) && (node.fields.length === 2 || node.fields.length === 3),
  );
  const ids = new Set<string>();
  const fields = node.fields.map((value) => {
    const field = graphRecord(value, fieldKeys);
    for (const key of ['devName', 'id', 'name', 'sourceFieldLabel']) graphText(field[key]);
    graphRequire(
      field.name === field.devName &&
        !ids.has(field.id as string) &&
        field.isDGRootKeyField === false &&
        field.usageTag === 'none' &&
        isDeepStrictEqual(field.dependency, []) &&
        isDeepStrictEqual(field.fieldRoles, []),
    );
    ids.add(field.id as string);
    return {
      sourceFieldName: field.sourceFieldName,
      dataType: field.dataType,
      isKeyColumn: field.isKeyColumn,
      isProjected: field.isProjected,
    };
  });
  const refresh = graphRecord(raw.fullRefreshConfig, ['schedule']);
  const schedule = graphRecord(refresh.schedule, ['frequency', 'timeGranularity']);
  graphRequire(
    schedule.frequency === 7 && ['day', 'Day'].includes(schedule.timeGranularity as string),
  );
  const candidate = validateDataGraphDocument({
    schemaVersion: 1,
    kind: 'data-graph',
    identity: { dataSpace: 'default', apiName },
    spec: {
      label: raw.label,
      description: raw.description,
      primaryObjectName: raw.primaryObjectName,
      type: 'NONE',
      fullRefreshConfig: { schedule: { frequency: 7, timeGranularity: 'Day' } },
      incrementalRefreshConfig: raw.incrementalRefreshConfig,
      sourceObject: {
        name: node.name,
        devName: node.name,
        label: node.label,
        path: node.path,
        fields,
        relatedObjects: node.relatedObjects,
      },
    },
  });
  return {
    candidate,
    expectations: {
      graph: structuredClone(raw),
      ...(intent ? { intent: structuredClone(intent) } : {}),
    },
  };
}

/**
 * Serialize admitted portable content only.
 * @param {unknown} value Candidate.
 * @returns {string} Stable JSON.
 */
export function serializeDataGraphDocument(value: unknown): string {
  return `${JSON.stringify(validateDataGraphDocument(value), undefined, 2)}\n`;
}
