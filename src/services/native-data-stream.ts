import { isDeepStrictEqual } from 'node:util';
import { explainMismatch } from './operation-diagnostic.js';
import { setTimeout as wait } from 'node:timers/promises';
import {
  DataStreamError,
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
  validateDataStreamDocument,
} from '../artifacts/data-stream-document.js';
import { ConnectError } from '../transport/connect-client.js';
import type { DataStreamDocument, DataStreamMapping } from '../artifacts/data-stream-document.js';
import { DataStreamHttpError } from '../transport/data-stream-rest.js';
import type { DataStreamClient, DataStreamReferenceReader } from '../transport/data-stream-rest.js';

type Json = Record<string, unknown>;
export type DataStreamReadClients = {
  streams: Pick<DataStreamClient, 'get' | 'list'>;
  connections: DataStreamReferenceReader['connections'];
  dependencies: DataStreamReferenceReader['dependencies'];
  dlo: { get: (name: string) => Promise<unknown> };
};
export type DataStreamBinding = {
  connectionId: string;
  connectionName: string;
  event: string;
  availability: 'Available' | 'In Use';
  sourceFields: Array<{ name: string; label: string; dataType: 'Text' }>;
  inventory: Json[];
  target?: Json;
};
const name = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const recordId = /^[A-Za-z0-9]{18}$/u;

/**
 * Compare exact mapping multisets, consuming each match so duplicates cannot hide drift.
 * @param {unknown} left First native mapping inventory.
 * @param {unknown} right Independent native mapping inventory.
 * @returns {boolean} Whether only entry ordering differs.
 */
function sameStreamMappings(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return isDeepStrictEqual(left, right);
  if (left.length !== right.length) return false;
  const remaining: unknown[] = [...right];
  for (const entry of left) {
    const index = remaining.findIndex((candidate) => isDeepStrictEqual(entry, candidate));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
}

/**
 * Compare snapshots allowing only observed native mapping inventory permutations.
 * All other properties and arrays, including unknown fields, remain strictly compared.
 * @param {unknown} left Native stream or lifecycle plan snapshot.
 * @param {unknown} right Independent snapshot with the same shape.
 * @param {boolean} postWrite Whether isolated stream lifecycle differences may await settlement.
 * @returns {boolean} Whether protected state is unchanged.
 */
function sameStreamSnapshot(left: unknown, right: unknown, postWrite = false): boolean {
  const first = structuredClone(left);
  const second = structuredClone(right);
  // Explicit native/portable observation slots only; never normalize authored mappings.
  const paths = [
    ['mappings'],
    ['observed', 'mappings'],
    ['binding', 'target', 'mappings'],
    ['binding', 'inventory', '0', 'mappings'],
    ['target', 'observed', 'mappings'],
    ['document', 'observed', 'mappings'],
    ['patch', 'observed', 'mappings'],
  ];
  for (const path of paths) {
    const key = path.at(-1)!;
    const parent = (value: unknown): Json | undefined => {
      let current = value;
      for (const part of path.slice(0, -1)) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Json)[part];
      }
      return current && typeof current === 'object' ? (current as Json) : undefined;
    };
    const a = parent(first);
    const b = parent(second);
    if (a && b && Array.isArray(a[key]) && Array.isArray(b[key])) {
      if (!sameStreamMappings(a[key], b[key])) return false;
      b[key] = a[key];
    }
  }
  if (isDeepStrictEqual(first, second)) return true;
  // Only independent post-write reads may defer an isolated stream lifecycle transition.
  if (postWrite && first && second && typeof first === 'object' && typeof second === 'object') {
    const leftStream = first as Json;
    const rightStream = second as Json;
    if (
      leftStream.status !== rightStream.status &&
      ['ACTIVE', 'PROCESSING'].includes(leftStream.status as string) &&
      ['ACTIVE', 'PROCESSING'].includes(rightStream.status as string) &&
      isDeepStrictEqual(first, { ...rightStream, status: leftStream.status })
    )
      throw new DataStreamError('STREAM_SNAPSHOT_PENDING');
  }
  // Only the observed linked-DLO lifecycle transition can be pending, never configuration drift.
  const a = first && typeof first === 'object' ? (first as Json).dataLakeObjectInfo : undefined;
  const b = second && typeof second === 'object' ? (second as Json).dataLakeObjectInfo : undefined;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const leftInfo = a as Json;
    const rightInfo = b as Json;
    if (
      leftInfo.status !== rightInfo.status &&
      ['ACTIVE', 'PROCESSING'].includes(leftInfo.status as string) &&
      ['ACTIVE', 'PROCESSING'].includes(rightInfo.status as string)
    ) {
      rightInfo.status = leftInfo.status;
      if (isDeepStrictEqual(first, second)) throw new DataStreamError('STREAM_SNAPSHOT_PENDING');
    }
  }
  return false;
}

/**
 * Require an object without interpreting unknown response fields as authored intent.
 * @param {unknown} value Raw response.
 * @returns {Json} Checked object.
 */
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DataStreamError('INVALID_STREAM_READ');
  return value as Json;
}

/**
 * Validate the independently observed supported stream scope, not runtime settlement.
 * @param {unknown} value Native stream detail/inventory entry.
 * @returns {Json} Raw detached response preserving all inventory fields.
 */
export function inspectNativeDataStream(value: unknown): Json {
  const raw = object(value);
  const dlo = object(raw.dataLakeObjectInfo);
  const spaces = dlo.dataSpaceInfo;
  if (
    typeof raw.name !== 'string' ||
    !name.test(raw.name) ||
    typeof raw.recordId !== 'string' ||
    !recordId.test(raw.recordId) ||
    typeof raw.dataSource !== 'string' ||
    !name.test(raw.dataSource) ||
    raw.dataStreamType !== 'INGESTAPI' ||
    object(raw.connectorInfo).connectorType !== 'IngestApi' ||
    object(raw.refreshConfig).refreshMode !== 'UPSERT' ||
    dlo.category !== 'Other' ||
    typeof dlo.name !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(dlo.name) ||
    !Array.isArray(spaces) ||
    spaces.length !== 1 ||
    object(spaces[0]).name !== 'default' ||
    typeof raw.status !== 'string' ||
    typeof raw.label !== 'string' ||
    !raw.label ||
    !Array.isArray(raw.sourceFields) ||
    !Array.isArray(raw.mappings)
  )
    throw new DataStreamError('UNSUPPORTED_STREAM_READ');
  return structuredClone(raw);
}

/**
 * Resolve an exact portable connection/event independently from generated stream names.
 * A missing source name alone never authorizes creation; this read result authorizes no write.
 * @param {object} selection Portable requested name, connection/event and Text primary key.
 * @param {string} selection.apiName Portable stream name.
 * @param {string} selection.connectionName Connection developer name.
 * @param {string} selection.event Uploaded event name.
 * @param {string} selection.primaryKey Explicit Text primary key.
 * @param {string} selection.dataSpace Expected data space.
 * @param {DataStreamReadClients} clients Read-only dependency boundaries.
 * @param {boolean} postWrite Whether this read belongs to bounded create/update settlement.
 * @returns {Promise<DataStreamBinding>} Private target-local binding and complete inventory.
 */
export async function resolveDataStreamBinding(
  selection: {
    apiName: string;
    connectionName: string;
    event: string;
    primaryKey: string;
    dataSpace: string;
  },
  clients: DataStreamReadClients,
  postWrite = false,
): Promise<DataStreamBinding> {
  if (
    selection.dataSpace !== 'default' ||
    ![selection.apiName, selection.connectionName, selection.event, selection.primaryKey].every(
      (value) => name.test(value),
    )
  )
    throw new DataStreamError('INVALID_STREAM_BINDING');
  const listed = await clients.connections.list();
  // Admit the prior bare list or the observed complete first-page envelope only.
  // No continuation contract is admitted, and a full page cannot prove exhaustion.
  const keys = Object.keys(listed);
  const bare = keys.length === 1 && keys[0] === 'connections';
  const completePage =
    keys.length === 3 &&
    keys.every((key) => ['connections', 'currentPageUrl', 'totalSize'].includes(key)) &&
    listed.currentPageUrl ===
      '/services/data/v68.0/ssot/connections?connectorType=IngestApi&limit=200&offset=0' &&
    Number.isSafeInteger(listed.totalSize) &&
    listed.totalSize === (Array.isArray(listed.connections) ? listed.connections.length : -1);
  if (
    !Array.isArray(listed.connections) ||
    listed.connections.length >= 200 ||
    (!bare && !completePage)
  )
    throw new DataStreamError('INCOMPLETE_CONNECTION_LIST');
  const connections = listed.connections.map((value) => object(value));
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const connection of connections) {
    if (
      typeof connection.name !== 'string' ||
      !name.test(connection.name) ||
      typeof connection.id !== 'string' ||
      !recordId.test(connection.id) ||
      connection.connectorType !== 'IngestApi' ||
      seen.has(connection.name.toLowerCase()) ||
      ids.has(connection.id)
    )
      throw new DataStreamError('AMBIGUOUS_STREAM_CONNECTION');
    seen.add(connection.name.toLowerCase());
    ids.add(connection.id);
  }
  const selected = connections.filter((connection) => connection.name === selection.connectionName);
  if (selected.length !== 1) throw new DataStreamError('AMBIGUOUS_STREAM_CONNECTION');
  const connectionId = selected[0].id as string;
  const detail = await clients.connections.get(connectionId);
  if (
    detail.id !== connectionId ||
    detail.name !== selection.connectionName ||
    detail.connectorType !== 'IngestApi' ||
    detail.status !== 'CONNECTED'
  )
    throw new DataStreamError('STREAM_CONNECTION_MISMATCH');
  const schemas = await clients.connections.schema(connectionId);
  // GET lacks event identity. Initial scope accepts only a sole independently uploaded event.
  if (!Array.isArray(schemas.schemas) || schemas.schemas.length !== 1)
    throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  const event = object(schemas.schemas[0]);
  if (
    event.name !== selection.event ||
    event.schemaType !== 'IngestApi' ||
    !['Available', 'In Use'].includes(event.availabilityStatus as string) ||
    !Array.isArray(event.fields) ||
    event.fields.length === 0
  )
    throw new DataStreamError('INVALID_STREAM_SCHEMA');
  const fieldNames = new Set<string>();
  const sourceFields = event.fields.map((value) => {
    const field = object(value);
    if (
      typeof field.name !== 'string' ||
      !name.test(field.name) ||
      field.dataType !== 'Text' ||
      typeof field.label !== 'string' ||
      !field.label ||
      fieldNames.has(field.name.toLowerCase())
    )
      throw new DataStreamError('INVALID_STREAM_SCHEMA');
    fieldNames.add(field.name.toLowerCase());
    return { name: field.name, label: field.label, dataType: 'Text' as const };
  });
  if (!sourceFields.some((field) => field.name === selection.primaryKey))
    throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  const listedStreams = await clients.streams.list(selection.connectionName);
  const inventory = listedStreams.map((value) => inspectNativeDataStream(value));
  if (
    inventory.some((stream) => stream.dataSource !== selection.connectionName) ||
    inventory.length > 1
  )
    throw new DataStreamError('AMBIGUOUS_STREAM_BINDING');
  let named: Json | undefined;
  try {
    named = inspectNativeDataStream(await clients.streams.get(selection.apiName));
    if (named.name !== selection.apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
  } catch (error) {
    if (
      !(error instanceof DataStreamHttpError) ||
      error.status !== 404 ||
      !['REQUEST_FAILED', 'STREAM_HTTP_ERROR'].includes(error.code)
    )
      throw error;
  }
  const target = inventory[0];
  if (
    named &&
    (!target ||
      named.recordId !== target.recordId ||
      named.name !== target.name ||
      named.dataSource !== selection.connectionName)
  )
    throw new DataStreamError('STREAM_TARGET_MISMATCH');
  if (target) {
    if (event.availabilityStatus !== 'In Use')
      throw explainMismatch(
        new DataStreamError('STREAM_BINDING_DRIFT'),
        'resolve existing stream event availability',
        selection.apiName,
        'In Use',
        event.availabilityStatus,
        'event.availabilityStatus',
      );
    const read = inspectNativeDataStream(await clients.streams.get(target.name as string));
    if (!sameStreamSnapshot(read, target, postWrite))
      throw explainMismatch(
        new DataStreamError('STREAM_BINDING_DRIFT'),
        'stream inventory/detail agreement',
        target.name,
        target,
        read,
      );
    // eslint-disable-next-line unicorn/no-array-sort -- Sort fresh arrays within the existing ES2022 library target.
    const expected = sourceFields.map((field) => [field.name, field.dataType]).sort();
    const observed = (read.sourceFields as unknown[])
      .map((value) => {
        const field = object(value);
        return [field.name, field.datatype];
      })
      // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh array within the existing ES2022 library target.
      .sort();
    if (!isDeepStrictEqual(expected, observed))
      throw explainMismatch(
        new DataStreamError('STREAM_SOURCE_DRIFT'),
        'connection/stream source field agreement',
        target.name,
        expected,
        observed,
        'sourceFields',
      );
    const fields = object(read.dataLakeObjectInfo).fields;
    if (!Array.isArray(fields)) throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
    const keys = fields
      .map((value) => object(value))
      .filter((field) => field.isPrimaryKey === true);
    if (keys.length !== 1 || keys[0].name !== selection.primaryKey || keys[0].dataType !== 'Text')
      throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  } else if (event.availabilityStatus !== 'Available' || named)
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'resolve absent stream binding',
      selection.apiName,
      { availabilityStatus: 'Available', target: undefined },
      { availabilityStatus: event.availabilityStatus, target: named },
    );
  return structuredClone({
    connectionId,
    connectionName: selection.connectionName,
    event: selection.event,
    availability: event.availabilityStatus as 'Available' | 'In Use',
    sourceFields,
    inventory,
    ...(target ? { target } : {}),
  });
}

/**
 * Retrieve exact supported native state as a portable document, retaining generated inventory.
 * Unsupported mappings block projection rather than silently dropping authored intent.
 * @param {string} apiName Exact server-generated stream name.
 * @param {DataStreamReadClients} clients Internal read clients.
 * @param {string} dataSpace Explicit observed-scope constraint.
 * @param {boolean} postWrite Whether this read belongs to bounded create/update settlement.
 * @returns {Promise<DataStreamDocument>} Detached validated portable document without runtime IDs.
 */
export async function retrieveNativeDataStream(
  apiName: string,
  clients: DataStreamReadClients,
  dataSpace = 'default',
  postWrite = false,
): Promise<DataStreamDocument> {
  if (!name.test(apiName) || dataSpace !== 'default')
    throw new DataStreamError('INVALID_STREAM_BINDING');
  const raw = inspectNativeDataStream(await clients.streams.get(apiName));
  if (raw.name !== apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
  const connectionIdList = await clients.connections.list();
  if (!Array.isArray(connectionIdList.connections))
    throw new DataStreamError('INCOMPLETE_CONNECTION_LIST');
  const matches = connectionIdList.connections
    .map((value) => object(value))
    .filter((item) => item.name === raw.dataSource);
  if (matches.length !== 1 || typeof matches[0].id !== 'string' || !recordId.test(matches[0].id))
    throw new DataStreamError('AMBIGUOUS_STREAM_CONNECTION');
  const schema = await clients.connections.schema(matches[0].id);
  if (!Array.isArray(schema.schemas) || schema.schemas.length !== 1)
    throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  const info = object(raw.dataLakeObjectInfo);
  if (!Array.isArray(info.fields)) throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  const keys = info.fields
    .map((value) => object(value))
    .filter((field) => field.isPrimaryKey === true);
  if (keys.length !== 1 || typeof keys[0].name !== 'string')
    throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  const binding = await resolveDataStreamBinding(
    {
      apiName,
      connectionName: raw.dataSource as string,
      event: object(schema.schemas[0]).name as string,
      primaryKey: keys[0].name,
      dataSpace,
    },
    clients,
    postWrite,
  );
  if (!binding.target || !sameStreamSnapshot(raw, binding.target, postWrite))
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'retrieve binding agreement',
      apiName,
      raw,
      binding.target,
    );
  const wrapper = object(await clients.dlo.get(info.name as string));
  if (!Array.isArray(wrapper.dataLakeObjects) || wrapper.dataLakeObjects.length !== 1)
    throw new DataStreamError('INVALID_STREAM_DLO');
  const dlo = object(wrapper.dataLakeObjects[0]);
  if (
    dlo.name !== info.name ||
    typeof dlo.id !== 'string' ||
    !recordId.test(dlo.id) ||
    dlo.category !== 'Other' ||
    !Array.isArray(dlo.dataSpaceInfo) ||
    dlo.dataSpaceInfo.length !== 1 ||
    object(dlo.dataSpaceInfo[0]).name !== dataSpace ||
    !Array.isArray(dlo.fields)
  )
    throw new DataStreamError('INVALID_STREAM_DLO');
  const dloFields = dlo.fields.map((value) => {
    const field = object(value);
    return {
      name: field.name,
      label: field.label,
      dataType: field.dataType,
      isPrimaryKey: field.isPrimaryKey,
    };
  });
  const expectedFields = info.fields.map((value) => {
    const field = object(value);
    return {
      name: `${String(field.name)}__c`,
      label: field.label,
      dataType: field.dataType,
      isPrimaryKey: field.isPrimaryKey,
    };
  });
  const sorted = (fields: typeof dloFields): typeof dloFields =>
    // eslint-disable-next-line unicorn/no-array-sort -- Sort a copied array within the existing ES2022 library target.
    [...fields].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!isDeepStrictEqual(sorted(dloFields), sorted(expectedFields)))
    throw explainMismatch(
      new DataStreamError('STREAM_DLO_DRIFT'),
      'retrieve linked DLO field agreement',
      info.name,
      sorted(expectedFields),
      sorted(dloFields),
      'fields',
    );
  const additions: DataStreamMapping[] = [];
  for (const value of raw.mappings as unknown[]) {
    const mapping = object(value);
    const source = binding.sourceFields.find((field) => field.name === mapping.sourceFieldName);
    if (source && mapping.targetFieldName === source.name && mapping.formula === undefined)
      continue;
    if (
      (mapping.targetFieldName === 'DataSource' &&
        mapping.formula === `&quot;${binding.connectionName}&quot;`) ||
      (mapping.targetFieldName === 'DataSourceObject' &&
        mapping.formula === `&quot;${apiName}&quot;`)
    )
      continue;
    const formulaSource = binding.sourceFields.find((field) => field.label === mapping.formula);
    const target = info.fields
      .map((value) => object(value))
      .find((field) => field.name === mapping.targetFieldName);
    if (
      !formulaSource ||
      mapping.sourceFieldName !== undefined ||
      !target ||
      target.dataType !== 'Text' ||
      target.isPrimaryKey !== false ||
      binding.sourceFields.some((field) => field.name === target.name)
    )
      throw new DataStreamError('UNSUPPORTED_STREAM_PROJECTION');
    additions.push({
      sourceFieldLabel: formulaSource.label,
      targetFieldName: target.name as string,
      targetFieldReturntype: 'Text',
    });
  }
  return validateDataStreamDocument({
    schemaVersion: 1,
    kind: 'data-stream',
    identity: { apiName, dataSpace },
    spec: {
      connectorType: 'IngestApi',
      connectionName: binding.connectionName,
      event: binding.event,
      datastreamType: 'INGEST_API',
      refreshMode: 'UPSERT',
      label: raw.label,
      newDlo: {
        name: dlo.name,
        label: dlo.label,
        category: 'Other',
        primaryKey: { name: keys[0].name, label: keys[0].label, dataType: 'Text' },
      },
      // Canonicalize only projections derived here; caller-authored mapping order stays strict.
      // eslint-disable-next-line unicorn/no-array-sort -- Sort this locally derived array within the existing ES2022 library target.
      additiveFieldMappings: additions.sort((a, b) =>
        a.targetFieldName < b.targetFieldName ? -1 : a.targetFieldName > b.targetFieldName ? 1 : 0,
      ),
    },
    observed: {
      mappings: raw.mappings,
      sourceFields: raw.sourceFields,
      dloFields,
      actualDloName: dlo.name,
    },
  });
}

export type DataStreamDeployClients = DataStreamReadClients & {
  streams: DataStreamReadClients['streams'] & Pick<DataStreamClient, 'create' | 'update'>;
};
export type DataStreamCreatePlan = {
  operation: 'create';
  document: DataStreamDocument;
  binding: DataStreamBinding;
};
export type DataStreamUpdatePlan = {
  operation: 'update' | 'noop';
  document: DataStreamDocument;
  patch: DataStreamDocument;
  binding: DataStreamBinding;
  target: DataStreamDocument;
  dlo: Json;
  additions: DataStreamMapping[];
};
export type DataStreamDeployOptions = {
  allowProcessing: boolean;
  verifyInput: () => Promise<void>;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<unknown>;
};

/**
 * Prove proposed parent absence separately from the logical stream binding.
 * @param {string} apiName Exact proposed DLO name.
 * @param {DataStreamReadClients} clients Independent native readers.
 * @returns {Promise<void>} Resolves only on a genuine native HTTP404.
 */
async function requireAbsentStreamDlo(
  apiName: string,
  clients: DataStreamReadClients,
): Promise<void> {
  try {
    await clients.dlo.get(apiName);
  } catch (error) {
    if (
      (error instanceof ConnectError &&
        error.code === 'REQUEST_FAILED' &&
        error.statusCode === 404) ||
      (error instanceof DataStreamHttpError &&
        ['REQUEST_FAILED', 'STREAM_HTTP_ERROR'].includes(error.code) &&
        error.status === 404)
    )
      return;
    throw error;
  }
  throw new DataStreamError('STREAM_PROPOSED_DLO_EXISTS');
}

/**
 * Admit only the qualified empty-additions create with independent name and binding absence.
 * Existing bindings deliberately stop here until additive-update orchestration is implemented.
 * @param {unknown} value Portable authored stream.
 * @param {DataStreamReadClients} clients Independent read boundaries.
 * @returns {Promise<DataStreamCreatePlan>} Private read-only create admission, never dispatch authority.
 */
export async function preflightNativeDataStreamCreate(
  value: unknown,
  clients: DataStreamReadClients,
): Promise<DataStreamCreatePlan> {
  const document = validateDataStreamDocument(value);
  buildDataStreamCreateBody(document);
  const binding = await resolveDataStreamBinding(
    {
      ...document.identity,
      connectionName: document.spec.connectionName,
      event: document.spec.event,
      primaryKey: document.spec.newDlo.primaryKey.name,
    },
    clients,
  );
  if (binding.target) throw new DataStreamError('STREAM_EXISTING_BINDING_REQUIRES_UPDATE');
  const key = binding.sourceFields.find(
    (field) => field.name === document.spec.newDlo.primaryKey.name,
  );
  if (key?.label !== document.spec.newDlo.primaryKey.label)
    throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  await requireAbsentStreamDlo(document.spec.newDlo.name, clients);
  return { operation: 'create', document, binding };
}

/**
 * Reconcile case-sensitive persisted identifiers, never definition identifiers.
 * @param {string} echoed Native create recordId, 15 or 18 characters.
 * @param {string} persisted Independently read 18-character recordId.
 * @returns {boolean} Whether the exact corresponding Salesforce ID was observed.
 */
function sameStreamRecordId(echoed: string, persisted: string): boolean {
  if (echoed.length === 18) return echoed === persisted;
  if (!/^[A-Za-z0-9]{15}$/u.test(echoed)) return false;
  let suffix = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  for (let group = 0; group < 3; group++) {
    let bits = 0;
    for (let index = 0; index < 5; index++)
      if (/[A-Z]/u.test(echoed[group * 5 + index])) bits |= 1 << index;
    suffix += alphabet[bits];
  }
  return persisted === echoed + suffix;
}

/**
 * Dispatch one freshly guarded create and independently settle generated stream and DLO identities.
 * No public command calls this create-only subchunk; errors after dispatch must remain unknown.
 * @param {unknown} value Portable authored stream.
 * @param {DataStreamDeployClients} clients Internal read/write boundaries.
 * @param {DataStreamDeployOptions} options Explicit processing acknowledgement and immutable input guard.
 * @returns {Promise<object>} Confirmed generated identities and portable independent readback.
 */
export async function createNativeDataStream(
  value: unknown,
  clients: DataStreamDeployClients,
  options: DataStreamDeployOptions,
): Promise<{
  operation: 'create';
  targetApiName: string;
  targetDloName: string;
  document: DataStreamDocument;
}> {
  const document = validateDataStreamDocument(value);
  if (options.allowProcessing !== true)
    throw new DataStreamError('PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  await options.verifyInput();
  const plan = await preflightNativeDataStreamCreate(document, clients);
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamCreate(document, clients);
  if (!sameStreamSnapshot(plan, fresh))
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'pre-dispatch plan recheck',
      document.identity.apiName,
      plan,
      fresh,
    );
  await options.verifyInput();
  const now = options.now ?? Date.now;
  const pause = options.wait ?? wait;
  const deadline = now() + 15 * 60 * 1000;
  const echo = object(await clients.streams.create(document));
  if (
    typeof echo.name !== 'string' ||
    !name.test(echo.name) ||
    typeof echo.recordId !== 'string' ||
    !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u.test(echo.recordId)
  )
    throw new DataStreamError('STREAM_CREATE_UNCONFIRMED');
  let settledDloId: string | undefined;
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    try {
      const binding = await resolveDataStreamBinding(
        {
          apiName: echo.name,
          dataSpace: document.identity.dataSpace,
          connectionName: document.spec.connectionName,
          event: document.spec.event,
          primaryKey: document.spec.newDlo.primaryKey.name,
        },
        clients,
        true,
      );
      const target = binding.target;
      if (
        !target ||
        target.name !== echo.name ||
        !sameStreamRecordId(echo.recordId, target.recordId as string) ||
        binding.connectionId !== plan.binding.connectionId ||
        !isDeepStrictEqual(binding.sourceFields, plan.binding.sourceFields)
      )
        throw new DataStreamError('STREAM_CREATE_IDENTITY_UNCONFIRMED');
      const byId = inspectNativeDataStream(await clients.streams.get(target.recordId as string));
      if (!sameStreamSnapshot(target, byId, true))
        throw explainMismatch(
          new DataStreamError('STREAM_BINDING_DRIFT'),
          'created stream name/ID readback agreement',
          target.name,
          target,
          byId,
        );
      const actual = await retrieveNativeDataStream(
        echo.name,
        clients,
        document.identity.dataSpace,
        true,
      );
      if (
        actual.spec.newDlo.label !== document.spec.newDlo.label ||
        !isDeepStrictEqual(actual.spec.newDlo.primaryKey, document.spec.newDlo.primaryKey) ||
        actual.spec.additiveFieldMappings.length > 0 ||
        plan.binding.sourceFields.some(
          (field) =>
            !actual.observed?.mappings.some(
              (mapping) =>
                mapping.sourceFieldName === field.name &&
                mapping.targetFieldName === field.name &&
                mapping.formula === undefined,
            ),
        )
      )
        throw new DataStreamError('STREAM_CREATE_PERSISTENCE_UNCONFIRMED');
      const wrapper = object(await clients.dlo.get(actual.spec.newDlo.name));
      if (!Array.isArray(wrapper.dataLakeObjects) || wrapper.dataLakeObjects.length !== 1)
        throw new DataStreamError('INVALID_STREAM_DLO');
      const dlo = object(wrapper.dataLakeObjects[0]);
      if (
        dlo.name !== actual.spec.newDlo.name ||
        typeof dlo.id !== 'string' ||
        !recordId.test(dlo.id) ||
        dlo.category !== 'Other' ||
        !Array.isArray(dlo.dataSpaceInfo) ||
        dlo.dataSpaceInfo.length !== 1 ||
        object(dlo.dataSpaceInfo[0]).name !== 'default' ||
        !Array.isArray(dlo.fields) ||
        !isDeepStrictEqual(
          dlo.fields.map((value) => {
            const field = object(value);
            return {
              name: field.name,
              label: field.label,
              dataType: field.dataType,
              isPrimaryKey: field.isPrimaryKey,
            };
          }),
          actual.observed?.dloFields,
        )
      )
        throw explainMismatch(
          new DataStreamError('STREAM_DLO_DRIFT'),
          'create linked parent verification',
          actual.spec.newDlo.name,
          {
            name: actual.spec.newDlo.name,
            category: 'Other',
            dataSpaceInfo: [{ name: 'default' }],
            fields: actual.observed?.dloFields,
            id: true,
          },
          {
            name: dlo.name,
            category: dlo.category,
            dataSpaceInfo: Array.isArray(dlo.dataSpaceInfo)
              ? dlo.dataSpaceInfo.map((entry) => ({ name: (entry as Json | null)?.name }))
              : dlo.dataSpaceInfo,
            fields: Array.isArray(dlo.fields)
              ? dlo.fields.map((entry) => {
                  const field = entry as Json | null;
                  return {
                    name: field?.name,
                    label: field?.label,
                    dataType: field?.dataType,
                    isPrimaryKey: field?.isPrimaryKey,
                  };
                })
              : dlo.fields,
            id: typeof dlo.id === 'string' && recordId.test(dlo.id),
          },
        );
      if (settledDloId !== undefined && settledDloId !== dlo.id)
        throw explainMismatch(
          new DataStreamError('STREAM_DLO_DRIFT'),
          'create settled parent identity preservation',
          dlo.name,
          settledDloId,
          dlo.id,
          'recordId',
        );
      settledDloId = dlo.id;
      if (now() >= deadline) break;
      const linkedStatus = object(target.dataLakeObjectInfo).status;
      if (
        target.status === 'ACTIVE' &&
        dlo.status === 'ACTIVE' &&
        (linkedStatus === undefined || linkedStatus === 'ACTIVE')
      ) {
        await options.verifyInput();
        if (now() >= deadline) break;
        return {
          operation: 'create',
          targetApiName: echo.name,
          targetDloName: actual.spec.newDlo.name,
          document: actual,
        };
      }
      if (
        !['ACTIVE', 'PROCESSING'].includes(target.status as string) ||
        !['ACTIVE', 'PROCESSING'].includes(dlo.status as string) ||
        (linkedStatus !== undefined && !['ACTIVE', 'PROCESSING'].includes(linkedStatus as string))
      )
        throw new DataStreamError('STREAM_CREATE_SETTLEMENT_UNCONFIRMED');
    } catch (error) {
      if (!(error instanceof DataStreamError) || error.code !== 'STREAM_SNAPSHOT_PENDING')
        throw error;
    }
    if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
  }
  throw new DataStreamError('STREAM_CREATE_SETTLEMENT_UNCONFIRMED');
}

/**
 * Independently bind the persisted parent identity and raw field inventory to the portable readback.
 * @param {DataStreamDocument} document Independently retrieved target.
 * @param {DataStreamReadClients} clients Native DLO reader.
 * @returns {Promise<Json>} Detached parent observation, including protected runtime identity.
 */
async function readUpdateStreamDlo(
  document: DataStreamDocument,
  clients: DataStreamReadClients,
): Promise<Json> {
  const wrapper = object(await clients.dlo.get(document.spec.newDlo.name));
  if (!Array.isArray(wrapper.dataLakeObjects) || wrapper.dataLakeObjects.length !== 1)
    throw new DataStreamError('INVALID_STREAM_DLO');
  const dlo = object(wrapper.dataLakeObjects[0]);
  if (
    dlo.name !== document.spec.newDlo.name ||
    typeof dlo.id !== 'string' ||
    !recordId.test(dlo.id) ||
    dlo.category !== 'Other' ||
    !Array.isArray(dlo.dataSpaceInfo) ||
    dlo.dataSpaceInfo.length !== 1 ||
    object(dlo.dataSpaceInfo[0]).name !== 'default' ||
    !Array.isArray(dlo.fields) ||
    !isDeepStrictEqual(
      dlo.fields.map((value) => {
        const field = object(value);
        return {
          name: field.name,
          label: field.label,
          dataType: field.dataType,
          isPrimaryKey: field.isPrimaryKey,
        };
      }),
      document.observed?.dloFields,
    )
  )
    throw explainMismatch(
      new DataStreamError('STREAM_DLO_DRIFT'),
      'update linked parent verification',
      document.spec.newDlo.name,
      {
        name: document.spec.newDlo.name,
        category: 'Other',
        dataSpaceInfo: [{ name: 'default' }],
        fields: document.observed?.dloFields,
        id: true,
      },
      {
        name: dlo.name,
        category: dlo.category,
        dataSpaceInfo: Array.isArray(dlo.dataSpaceInfo)
          ? dlo.dataSpaceInfo.map((entry) => ({ name: (entry as Json | null)?.name }))
          : dlo.dataSpaceInfo,
        fields: Array.isArray(dlo.fields)
          ? dlo.fields.map((entry) => {
              const field = entry as Json | null;
              return {
                name: field?.name,
                label: field?.label,
                dataType: field?.dataType,
                isPrimaryKey: field?.isPrimaryKey,
              };
            })
          : dlo.fields,
        id: typeof dlo.id === 'string' && recordId.test(dlo.id),
      },
    );
  return structuredClone(dlo);
}

/**
 * Admit only missing ordinary Text mappings; omitted additions never remove existing target state.
 * @param {unknown} value Explicit additive intent, not desired-state reconciliation.
 * @param {DataStreamReadClients} clients Independent binding, source and parent readers.
 * @returns {Promise<DataStreamUpdatePlan>} Private update/noop comparison without dispatch.
 */
export async function preflightNativeDataStreamUpdate(
  value: unknown,
  clients: DataStreamReadClients,
): Promise<DataStreamUpdatePlan> {
  const document = validateDataStreamDocument(value);
  const binding = await resolveDataStreamBinding(
    {
      ...document.identity,
      connectionName: document.spec.connectionName,
      event: document.spec.event,
      primaryKey: document.spec.newDlo.primaryKey.name,
    },
    clients,
  );
  if (!binding.target) throw new DataStreamError('STREAM_UPDATE_TARGET_ABSENT');
  const target = await retrieveNativeDataStream(binding.target.name as string, clients);
  const confirmation = inspectNativeDataStream(
    await clients.streams.get(binding.target.recordId as string),
  );
  if (!sameStreamSnapshot(confirmation, binding.target))
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'update name/ID readback agreement',
      binding.target.name,
      binding.target,
      confirmation,
    );
  if (
    document.spec.label !== target.spec.label ||
    document.spec.newDlo.label !== target.spec.newDlo.label ||
    !isDeepStrictEqual(document.spec.newDlo.primaryKey, target.spec.newDlo.primaryKey)
  )
    throw new DataStreamError('UNSUPPORTED_STREAM_SETTINGS_CHANGE');
  const dlo = await readUpdateStreamDlo(target, clients);
  if (
    binding.target.status !== 'ACTIVE' ||
    dlo.status !== 'ACTIVE' ||
    (object(binding.target.dataLakeObjectInfo).status !== undefined &&
      object(binding.target.dataLakeObjectInfo).status !== 'ACTIVE')
  )
    throw new DataStreamError('STREAM_NOT_READY');
  const additions: DataStreamMapping[] = [];
  const fields = object(binding.target.dataLakeObjectInfo).fields as unknown[];
  const mappings = binding.target.mappings as unknown[];
  for (const desired of document.spec.additiveFieldMappings) {
    const sources = binding.sourceFields.filter(
      (field) => field.label === desired.sourceFieldLabel,
    );
    if (sources.length !== 1 || sources[0].name === document.spec.newDlo.primaryKey.name)
      throw new DataStreamError('UNSUPPORTED_STREAM_MAPPING_SOURCE');
    const lower = desired.targetFieldName.toLowerCase();
    if (
      binding.sourceFields.some((field) => field.name.toLowerCase() === lower) ||
      ['datasource', 'datasourceobject', 'cdp_sys_sourceversion', 'internalorganization'].includes(
        lower,
      ) ||
      lower.startsWith('kq_')
    )
      throw new DataStreamError('UNSUPPORTED_STREAM_MAPPING_TARGET');
    const existingFields = fields
      .map((value) => object(value))
      .filter((field) => String(field.name).toLowerCase() === lower);
    const existingMappings = mappings
      .map((value) => object(value))
      .filter((mapping) => String(mapping.targetFieldName).toLowerCase() === lower);
    if (existingFields.length > 0 || existingMappings.length > 0) {
      if (
        existingFields.length !== 1 ||
        existingMappings.length !== 1 ||
        existingFields[0].name !== desired.targetFieldName ||
        existingFields[0].dataType !== 'Text' ||
        existingFields[0].isPrimaryKey !== false ||
        existingMappings[0].targetFieldName !== desired.targetFieldName ||
        existingMappings[0].formula !== desired.sourceFieldLabel ||
        existingMappings[0].sourceFieldName !== undefined
      )
        throw new DataStreamError('STREAM_MAPPING_CONFLICT');
    } else additions.push(desired);
  }
  const patch = validateDataStreamDocument({
    ...document,
    spec: { ...document.spec, additiveFieldMappings: additions },
  });
  if (additions.length > 0) buildDataStreamPatchBody(patch);
  return {
    operation: additions.length > 0 ? 'update' : 'noop',
    document,
    patch,
    binding,
    target,
    dlo,
    additions,
  };
}

/**
 * Remove only runtime settlement status when comparing preserved native configuration.
 * @param {Json} value Detached raw native object.
 * @param {string[]} omitted Explicit mutable collections/status keys.
 * @returns {Json} Protected configuration, retaining unknown fields conservatively.
 */
function streamProtected(value: Json, omitted: string[]): Json {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.includes(key)));
}

/**
 * Require all prior entries byte-equivalent in meaning, and only the requested extra targets.
 * @param {unknown[]} before Original entries.
 * @param {unknown[]} after Current entries.
 * @param {string} key Exact identity field.
 * @param {string[]} added Allowed new identities.
 * @returns {boolean} Whether no prior entry was changed or removed and no other entry appeared.
 */
function streamEntriesPreserved(
  before: unknown[],
  after: unknown[],
  key: string,
  added: string[],
): boolean {
  return (
    after.length === before.length + added.length &&
    before.every((entry) => after.some((current) => isDeepStrictEqual(entry, current))) &&
    after.every(
      (entry) =>
        before.some((prior) => isDeepStrictEqual(prior, entry)) ||
        added.includes(object(entry)[key] as string),
    )
  );
}

/**
 * Execute one guarded additive PATCH or return accurate zero-write noop, then settle independently.
 * @param {unknown} value Portable additive intent.
 * @param {DataStreamDeployClients} clients Independent read/write boundaries.
 * @param {DataStreamDeployOptions} options Processing acknowledgement and exact local input guards.
 * @returns {Promise<object>} Independently confirmed operation and actual target identities.
 */
export async function updateNativeDataStream(
  value: unknown,
  clients: DataStreamDeployClients,
  options: DataStreamDeployOptions,
): Promise<{
  operation: 'update' | 'noop';
  targetApiName: string;
  targetDloName: string;
  document: DataStreamDocument;
}> {
  const document = validateDataStreamDocument(value);
  await options.verifyInput();
  const plan = await preflightNativeDataStreamUpdate(document, clients);
  if (plan.operation === 'update' && options.allowProcessing !== true)
    throw new DataStreamError('PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamUpdate(document, clients);
  if (!sameStreamSnapshot(plan, fresh))
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'pre-dispatch plan recheck',
      document.identity.apiName,
      plan,
      fresh,
    );
  await options.verifyInput();
  const apiName = plan.binding.target!.name as string;
  if (plan.operation === 'noop')
    return {
      operation: 'noop',
      targetApiName: apiName,
      targetDloName: plan.target.spec.newDlo.name,
      document: plan.target,
    };
  const now = options.now ?? Date.now;
  const pause = options.wait ?? wait;
  const deadline = now() + 15 * 60 * 1000;
  await clients.streams.update(plan.binding.target!.recordId as string, plan.patch);
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    try {
      const actual = await retrieveNativeDataStream(apiName, clients, 'default', true);
      const binding = await resolveDataStreamBinding(
        {
          apiName,
          dataSpace: 'default',
          connectionName: plan.document.spec.connectionName,
          event: plan.document.spec.event,
          primaryKey: plan.document.spec.newDlo.primaryKey.name,
        },
        clients,
        true,
      );
      const raw = binding.target;
      if (
        !raw ||
        binding.connectionId !== plan.binding.connectionId ||
        !isDeepStrictEqual(binding.sourceFields, plan.binding.sourceFields)
      )
        throw explainMismatch(
          new DataStreamError('STREAM_BINDING_DRIFT'),
          'update connection/source preservation',
          apiName,
          {
            connectionId: plan.binding.connectionId,
            sourceFields: plan.binding.sourceFields,
            target: true,
          },
          {
            connectionId: binding.connectionId,
            sourceFields: binding.sourceFields,
            target: Boolean(raw),
          },
        );
      const old = plan.binding.target!;
      const dlo = await readUpdateStreamDlo(actual, clients);
      const oldInfo = object(old.dataLakeObjectInfo);
      const info = object(raw.dataLakeObjectInfo);
      const added = plan.additions.map((entry) => entry.targetFieldName);
      if (
        !isDeepStrictEqual(
          streamProtected(old, ['status', 'mappings', 'dataLakeObjectInfo']),
          streamProtected(raw, ['status', 'mappings', 'dataLakeObjectInfo']),
        ) ||
        !isDeepStrictEqual(
          streamProtected(oldInfo, ['status', 'fields', 'dataLakeFieldInfoRepresentation']),
          streamProtected(info, ['status', 'fields', 'dataLakeFieldInfoRepresentation']),
        ) ||
        !isDeepStrictEqual(
          streamProtected(plan.dlo, ['status', 'fields', 'dataLakeFieldInfoRepresentation']),
          streamProtected(dlo, ['status', 'fields', 'dataLakeFieldInfoRepresentation']),
        )
      )
        throw new DataStreamError('STREAM_UPDATE_PRESERVATION_FAILED');
      const byId = inspectNativeDataStream(await clients.streams.get(raw.recordId as string));
      if (
        !sameStreamSnapshot(byId, raw, true) ||
        !sameStreamMappings(actual.observed?.mappings, raw.mappings) ||
        actual.identity.apiName !== raw.name ||
        actual.spec.newDlo.name !== info.name
      )
        throw explainMismatch(
          new DataStreamError('STREAM_BINDING_DRIFT'),
          'update independent readback agreement',
          apiName,
          { target: raw, mappings: actual.observed?.mappings, name: raw.name, apiName: info.name },
          {
            target: byId,
            mappings: raw.mappings,
            name: actual.identity.apiName,
            apiName: actual.spec.newDlo.name,
          },
        );
      const newMappings = raw.mappings as unknown[];
      const newFields = info.fields as unknown[];
      if (
        !(old.mappings as unknown[]).every((entry) =>
          newMappings.some((current) => isDeepStrictEqual(entry, current)),
        ) ||
        !(oldInfo.fields as unknown[]).every((entry) =>
          newFields.some((current) => isDeepStrictEqual(entry, current)),
        ) ||
        !(plan.dlo.fields as unknown[]).every((entry) =>
          (dlo.fields as unknown[]).some((current) => isDeepStrictEqual(entry, current)),
        )
      )
        throw new DataStreamError('STREAM_UPDATE_PRESERVATION_FAILED');
      const mappingsReady = plan.additions.every((entry) =>
        newMappings.some((value) => {
          const mapping = object(value);
          return (
            mapping.targetFieldName === entry.targetFieldName &&
            mapping.formula === entry.sourceFieldLabel &&
            mapping.sourceFieldName === undefined
          );
        }),
      );
      const fieldsReady = plan.additions.every((entry) =>
        newFields.some((value) => {
          const field = object(value);
          return (
            field.name === entry.targetFieldName &&
            field.label === entry.targetFieldName &&
            field.dataType === 'Text' &&
            field.isPrimaryKey === false
          );
        }),
      );
      if (mappingsReady && fieldsReady) {
        if (
          !streamEntriesPreserved(
            old.mappings as unknown[],
            newMappings,
            'targetFieldName',
            added,
          ) ||
          !streamEntriesPreserved(oldInfo.fields as unknown[], newFields, 'name', added) ||
          ((oldInfo.dataLakeFieldInfoRepresentation !== undefined ||
            info.dataLakeFieldInfoRepresentation !== undefined) &&
            (!Array.isArray(oldInfo.dataLakeFieldInfoRepresentation) ||
              !Array.isArray(info.dataLakeFieldInfoRepresentation) ||
              !streamEntriesPreserved(
                oldInfo.dataLakeFieldInfoRepresentation,
                info.dataLakeFieldInfoRepresentation,
                'name',
                added,
              ) ||
              !plan.additions.every((entry) =>
                (info.dataLakeFieldInfoRepresentation as unknown[]).some((field) =>
                  isDeepStrictEqual(
                    field,
                    newFields.find((value) => object(value).name === entry.targetFieldName),
                  ),
                ),
              ))) ||
          !streamEntriesPreserved(
            plan.dlo.fields as unknown[],
            dlo.fields as unknown[],
            'name',
            added.map((field) => `${field}__c`),
          ) ||
          (plan.dlo.dataLakeFieldInfoRepresentation !== undefined &&
            (!Array.isArray(dlo.dataLakeFieldInfoRepresentation) ||
              !streamEntriesPreserved(
                plan.dlo.dataLakeFieldInfoRepresentation as unknown[],
                dlo.dataLakeFieldInfoRepresentation,
                'name',
                added.map((field) => `${field}__c`),
              )))
        )
          throw new DataStreamError('STREAM_UPDATE_PRESERVATION_FAILED');
        if (
          raw.status === 'ACTIVE' &&
          dlo.status === 'ACTIVE' &&
          ((oldInfo.status === undefined && info.status === undefined) ||
            info.status === 'ACTIVE') &&
          now() < deadline
        ) {
          await options.verifyInput();
          if (now() >= deadline) break;
          return {
            operation: 'update',
            targetApiName: apiName,
            targetDloName: actual.spec.newDlo.name,
            document: actual,
          };
        }
      }
      if (
        !['ACTIVE', 'PROCESSING'].includes(raw.status as string) ||
        !['ACTIVE', 'PROCESSING'].includes(dlo.status as string) ||
        ((oldInfo.status !== undefined || info.status !== undefined) &&
          !['ACTIVE', 'PROCESSING'].includes(info.status as string))
      )
        throw new DataStreamError('STREAM_UPDATE_SETTLEMENT_UNCONFIRMED');
    } catch (error) {
      if (!(error instanceof DataStreamError) || error.code !== 'STREAM_SNAPSHOT_PENDING')
        throw error;
    }
    if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
  }
  throw new DataStreamError('STREAM_UPDATE_SETTLEMENT_UNCONFIRMED');
}

export type DataStreamDeleteClients = DataStreamReadClients & {
  streams: DataStreamReadClients['streams'] & Pick<DataStreamClient, 'delete'>;
};
export type DataStreamDeleteOptions = {
  deleteDlo: boolean;
  verifyInput: () => Promise<void>;
  survivorDloNames: readonly string[];
  now?: () => number;
  wait?: (milliseconds: number) => Promise<unknown>;
};
export type DataStreamDeletePlan = {
  operation: 'delete';
  apiName: string;
  deleteDlo: boolean;
  document: DataStreamDocument;
  binding: DataStreamBinding;
  dlo: Json;
  streamDependencies: Json;
  dloDependencies: Json;
  survivors: Json[];
};

/**
 * Admit only the observed complete dependency response, never a transport-success shortcut.
 * @param {unknown} value Independent native dependency result.
 * @returns {Json} Complete dependency inventory with exact observed shape.
 */
function streamDeleteDependencies(value: unknown): Json {
  const result = object(value);
  if (
    Object.keys(result).some((key) => !['dependencies', 'totalSize'].includes(key)) ||
    !Array.isArray(result.dependencies) ||
    !Number.isSafeInteger(result.totalSize) ||
    result.totalSize !== result.dependencies.length
  )
    throw new DataStreamError('INCOMPLETE_STREAM_DEPENDENCIES');
  return structuredClone(result);
}

/**
 * Snapshot exact selected target, source, linked parent and explicitly protected survivors.
 * @param {string} apiName Exact selected target developer name, never a portable proposal.
 * @param {DataStreamReadClients} clients Independent native readers.
 * @param {object} options Explicit cascade choice and protected unrelated parent names.
 * @param {boolean} options.deleteDlo Explicit acknowledgement of linked-parent deletion.
 * @param {readonly string[]} options.survivorDloNames Unselected parents to preserve independently.
 * @returns {Promise<DataStreamDeletePlan>} Private guarded plan, not dispatch authority.
 */
export async function preflightNativeDataStreamDelete(
  apiName: string,
  clients: DataStreamReadClients,
  options: Pick<DataStreamDeleteOptions, 'deleteDlo' | 'survivorDloNames'>,
): Promise<DataStreamDeletePlan> {
  if (!name.test(apiName) || typeof options.deleteDlo !== 'boolean')
    throw new DataStreamError('INVALID_STREAM_DELETE_SELECTION');
  const document = await retrieveNativeDataStream(apiName, clients);
  const binding = await resolveDataStreamBinding(
    {
      ...document.identity,
      connectionName: document.spec.connectionName,
      event: document.spec.event,
      primaryKey: document.spec.newDlo.primaryKey.name,
    },
    clients,
  );
  const target = binding.target;
  let confirmation: Json | undefined;
  if (
    !target ||
    target.name !== apiName ||
    !sameStreamSnapshot(
      target,
      (confirmation = inspectNativeDataStream(
        await clients.streams.get(target.recordId as string),
      )),
    )
  )
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'delete stream identity/readback agreement',
      apiName,
      target?.name === apiName ? target : { name: apiName },
      confirmation ?? target,
    );
  const dlo = await readUpdateStreamDlo(document, clients);
  if (target.status !== 'ACTIVE' || dlo.status !== 'ACTIVE')
    throw new DataStreamError('STREAM_NOT_READY');
  const parentById = object(await clients.dlo.get(dlo.id as string));
  if (!isDeepStrictEqual(parentById.dataLakeObjects, [dlo]))
    throw explainMismatch(
      new DataStreamError('STREAM_DLO_DRIFT'),
      'delete parent name/ID agreement',
      dlo.name,
      [dlo],
      parentById.dataLakeObjects,
      'parents',
    );
  const streamDependencies = streamDeleteDependencies(
    await clients.dependencies.stream(target.recordId as string),
  );
  const dloDependencies = streamDeleteDependencies(
    await clients.dependencies.dlo(dlo.name as string),
  );
  const dependencies = dloDependencies.dependencies as unknown[];
  // Both modes refuse unknown/shared dependencies; cascade additionally has an explicit opt-in.
  if (
    streamDependencies.totalSize !== 0 ||
    dependencies.length !== 1 ||
    object(dependencies[0]).componentType !== 'DataStream' ||
    object(dependencies[0]).id !== target.recordId ||
    object(dependencies[0]).name !== target.label ||
    Object.keys(object(dependencies[0])).some(
      (key) => !['id', 'name', 'componentType'].includes(key),
    )
  )
    throw new DataStreamError('STREAM_DELETE_DEPENDENCIES_BLOCKED');
  const survivors: Json[] = [];
  const seen = new Set<string>();
  for (const survivor of options.survivorDloNames) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(survivor) ||
      survivor.toLowerCase() === String(dlo.name).toLowerCase() ||
      seen.has(survivor.toLowerCase())
    )
      throw new DataStreamError('INVALID_STREAM_DELETE_SURVIVOR');
    seen.add(survivor.toLowerCase());
    const wrapper = object(await clients.dlo.get(survivor));
    if (!Array.isArray(wrapper.dataLakeObjects) || wrapper.dataLakeObjects.length !== 1)
      throw new DataStreamError('INVALID_STREAM_DELETE_SURVIVOR');
    const value = object(wrapper.dataLakeObjects[0]);
    if (
      value.name !== survivor ||
      !recordId.test(String(value.id)) ||
      value.id === dlo.id ||
      value.status !== 'ACTIVE'
    )
      throw new DataStreamError('INVALID_STREAM_DELETE_SURVIVOR');
    survivors.push(structuredClone(value));
  }
  return {
    operation: 'delete',
    apiName,
    deleteDlo: options.deleteDlo,
    document,
    binding,
    dlo,
    streamDependencies,
    dloDependencies,
    survivors,
  };
}

/**
 * Observe typed native stream absence without interpreting arbitrary errors as missing state.
 * @param {string} apiName Previously proven exact selected name.
 * @param {DataStreamReadClients} clients Native stream reader.
 * @returns {Promise<boolean>} True only for genuine HTTP404; existing DELETING remains pending.
 */
async function deletedStreamAbsent(
  apiName: string,
  clients: DataStreamReadClients,
): Promise<boolean> {
  try {
    const current = inspectNativeDataStream(await clients.streams.get(apiName));
    if (current.name !== apiName)
      throw explainMismatch(
        new DataStreamError('STREAM_BINDING_DRIFT'),
        'delete absence identity check',
        apiName,
        apiName,
        current.name,
        'name',
      );
    return false;
  } catch (error) {
    if (
      error instanceof DataStreamHttpError &&
      error.status === 404 &&
      ['REQUEST_FAILED', 'STREAM_HTTP_ERROR'].includes(error.code)
    )
      return true;
    throw error;
  }
}

/**
 * Delete once after fresh complete guards; HTTP204 never substitutes for independent settlement.
 * @param {string} apiName Exact target developer name.
 * @param {DataStreamDeleteClients} clients Native single-attempt DELETE and independent readers.
 * @param {DataStreamDeleteOptions} options Cascade acknowledgement, immutable input and read bounds.
 * @returns {Promise<object>} Confirmed deletion only after binding release and parent/survivor checks.
 */
export async function deleteNativeDataStream(
  apiName: string,
  clients: DataStreamDeleteClients,
  options: DataStreamDeleteOptions,
): Promise<{ operation: 'delete'; targetApiName: string; targetDloName: string }> {
  // Freeze caller-owned selection before the first asynchronous boundary.
  const selection = Object.freeze({
    deleteDlo: options.deleteDlo,
    survivorDloNames: Object.freeze([...options.survivorDloNames]),
  });
  await options.verifyInput();
  const plan = await preflightNativeDataStreamDelete(apiName, clients, selection);
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamDelete(apiName, clients, selection);
  if (!sameStreamSnapshot(plan, fresh))
    throw explainMismatch(
      new DataStreamError('STREAM_DELETE_GUARD_DRIFT'),
      'delete pre-dispatch guard recheck',
      apiName,
      plan,
      fresh,
    );
  await options.verifyInput();
  const now = options.now ?? Date.now;
  const pause = options.wait ?? wait;
  const deadline = now() + 15 * 60 * 1000;
  await clients.streams.delete(plan.binding.target!.recordId as string, selection.deleteDlo);
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    const absent = await deletedStreamAbsent(apiName, clients);
    const binding = await resolveDataStreamBinding(
      {
        ...plan.document.identity,
        connectionName: plan.binding.connectionName,
        event: plan.binding.event,
        primaryKey: plan.document.spec.newDlo.primaryKey.name,
      },
      clients,
    );
    if (
      binding.connectionId !== plan.binding.connectionId ||
      !isDeepStrictEqual(binding.sourceFields, plan.binding.sourceFields)
    )
      throw explainMismatch(
        new DataStreamError('STREAM_DELETE_GUARD_DRIFT'),
        'delete connection/source preservation',
        apiName,
        { connectionId: plan.binding.connectionId, sourceFields: plan.binding.sourceFields },
        { connectionId: binding.connectionId, sourceFields: binding.sourceFields },
      );
    for (const survivor of plan.survivors) {
      for (const identity of [survivor.name, survivor.id]) {
        const wrapper = object(await clients.dlo.get(identity as string));
        if (!isDeepStrictEqual(wrapper.dataLakeObjects, [survivor]))
          throw explainMismatch(
            new DataStreamError('STREAM_DELETE_SURVIVOR_DRIFT'),
            'delete survivor preservation',
            survivor.name,
            [survivor],
            wrapper.dataLakeObjects,
            'parents',
          );
      }
    }
    if (
      absent &&
      !binding.target &&
      binding.inventory.length === 0 &&
      binding.availability === 'Available'
    ) {
      if (selection.deleteDlo) {
        await requireAbsentStreamDlo(plan.dlo.name as string, clients);
        await requireAbsentStreamDlo(plan.dlo.id as string, clients);
      } else {
        for (const identity of [plan.dlo.name, plan.dlo.id]) {
          const wrapper = object(await clients.dlo.get(identity as string));
          if (!isDeepStrictEqual(wrapper.dataLakeObjects, [plan.dlo]))
            throw explainMismatch(
              new DataStreamError('STREAM_DELETE_PARENT_DRIFT'),
              'delete retained parent preservation',
              plan.dlo.name,
              [plan.dlo],
              wrapper.dataLakeObjects,
              'parents',
            );
        }
        const released = streamDeleteDependencies(
          await clients.dependencies.dlo(plan.dlo.name as string),
        );
        if (released.totalSize !== 0)
          throw new DataStreamError('STREAM_DELETE_DEPENDENCIES_BLOCKED');
      }
      await options.verifyInput();
      if (now() >= deadline) break;
      return {
        operation: 'delete',
        targetApiName: apiName,
        targetDloName: plan.dlo.name as string,
      };
    }
    if (
      binding.target &&
      (binding.target.name !== apiName || binding.target.recordId !== plan.binding.target!.recordId)
    )
      throw explainMismatch(
        new DataStreamError('STREAM_DELETE_GUARD_DRIFT'),
        'delete remaining stream identity check',
        apiName,
        { name: apiName, recordId: plan.binding.target!.recordId },
        { name: binding.target.name, recordId: binding.target.recordId },
      );
    if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
  }
  throw new DataStreamError('STREAM_DELETE_SETTLEMENT_UNCONFIRMED');
}
