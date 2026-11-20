import { isDeepStrictEqual } from 'node:util';
import { explainInput, explainMismatch, printableKey } from './operation-diagnostic.js';
import { setTimeout as wait } from 'node:timers/promises';
import {
  DataStreamError,
  buildDataStreamCreateBody,
  buildDataStreamPatchBody,
  createSpacesRefusal,
  decodeFormula,
  validateDataStreamDocument,
} from '../artifacts/data-stream-document.js';
import { dataSpaceKey, isDataSpaceName, sortedDataSpaces } from '../artifacts/data-space-field.js';
import { ConnectError } from '../transport/connect-client.js';
import type {
  DataStreamDocument,
  DataStreamFormulaMapping,
  DataStreamMapping,
} from '../artifacts/data-stream-document.js';
import { DataStreamHttpError } from '../transport/data-stream-rest.js';
import { verbatimReason } from '../artifacts/verbatim-document.js';
import { sameEnum, sameRecord } from '../artifacts/enum-case.js';
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
  sourceFields: Array<{ name: string; label: string; dataType: string }>;
  inventory: Json[];
  target?: Json;
};
const name = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const recordId = /^[A-Za-z0-9]{18}$/u;
/** The primary-key field type is stored in Salesforce's letter case; a case-only difference is no change. */
const dloTypeKey: ReadonlySet<string> = new Set(['dataType']);
/** Retrieve reads leniently; deploy (the default) keeps every strict check. */
export type DataStreamReadMode = 'retrieve' | 'deploy';
const connectionPageSize = 200;

/**
 * Deploy-mode connection listing: the prior bare list or the observed complete first-page
 * envelope only. No continuation contract is admitted, and a full page cannot prove exhaustion.
 * @param {Json} listed Connection list response.
 * @returns {Json[]} Listed connections.
 */
function strictConnections(listed: Json): Json[] {
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
  return objects(listed.connections as unknown[]);
}

/**
 * Every listed entry as an object.
 * @param {unknown[]} values Listed entries.
 * @returns {Json[]} The entries; a non-object entry refuses the read.
 */
function objects(values: unknown[]): Json[] {
  return values.map((value) => object(value));
}

/**
 * Retrieve-mode connection listing: every page of the IngestApi connection list, following its
 * offset until `totalSize`, otherwise while a page is full or names a next page. Extra envelope
 * keys and the page URL format are ignored; a page that adds no new connection ends the listing.
 * @param {DataStreamReadClients} clients Read-only dependency boundaries.
 * @returns {Promise<unknown[]>} Every listed connection entry, once each.
 */
async function listConnectionsLeniently(clients: DataStreamReadClients): Promise<unknown[]> {
  const connections: unknown[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += connectionPageSize) {
    const page = await clients.connections.list(offset);
    if (!Array.isArray(page.connections)) throw new DataStreamError('INCOMPLETE_CONNECTION_LIST');
    let added = 0;
    for (const value of page.connections as unknown[]) {
      const id =
        value && typeof value === 'object' && typeof (value as Json).id === 'string'
          ? ((value as Json).id as string)
          : JSON.stringify(value);
      if (seen.has(id)) continue;
      seen.add(id);
      connections.push(value);
      added++;
    }
    const total = Number.isSafeInteger(page.totalSize) ? (page.totalSize as number) : undefined;
    const more =
      added > 0 &&
      (total === undefined
        ? page.connections.length >= connectionPageSize ||
          (typeof page.nextPageUrl === 'string' && page.nextPageUrl !== '')
        : offset + connectionPageSize < total);
    if (!more) return connections;
  }
}

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
 * Order a native mapping inventory by target field, then source field, then formula.
 * Comparisons stay order-insensitive (sameStreamMappings); this only makes retrieved bytes stable.
 * @param {unknown[]} mappings Native mapping inventory.
 * @returns {unknown[]} Sorted copy.
 */
export function sortedStreamMappings(mappings: unknown[]): unknown[] {
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a copied array within the existing ES2022 library target.
  return [...mappings].sort((left, right) => {
    const a = streamMappingKey(left);
    const b = streamMappingKey(right);
    for (let index = 0; index < a.length; index++)
      if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
    return 0;
  });
}

/**
 * The sort key of one native stream mapping.
 * @param {unknown} value Native mapping entry.
 * @returns {string[]} Target field, source field and formula; absent parts are empty.
 */
function streamMappingKey(value: unknown): string[] {
  const entry = (value && typeof value === 'object' ? value : {}) as Json;
  return [entry.targetFieldName, entry.sourceFieldName, entry.formula].map((part) =>
    typeof part === 'string' ? part : '',
  );
}

/**
 * Order locally derived mapping entries by target field.
 * @param {T[]} entries Derived entries.
 * @returns {T[]} The same array, sorted.
 */
function byTarget<T extends { targetFieldName: string }>(entries: T[]): T[] {
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a locally derived array within the existing ES2022 library target.
  return entries.sort((a, b) =>
    a.targetFieldName < b.targetFieldName ? -1 : a.targetFieldName > b.targetFieldName ? 1 : 0,
  );
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
      // After a write the stream and its DLO can move between PROCESSING and ACTIVE together.
      const leftStream = first as Json;
      const rightStream = second as Json;
      if (
        postWrite &&
        leftStream.status !== rightStream.status &&
        ['ACTIVE', 'PROCESSING'].includes(leftStream.status as string) &&
        ['ACTIVE', 'PROCESSING'].includes(rightStream.status as string) &&
        isDeepStrictEqual(first, { ...rightStream, status: leftStream.status })
      )
        throw new DataStreamError('STREAM_SNAPSHOT_PENDING');
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
    typeof object(raw.refreshConfig).refreshMode !== 'string' ||
    !object(raw.refreshConfig).refreshMode ||
    (dlo.category !== undefined && (typeof dlo.category !== 'string' || !dlo.category)) ||
    typeof dlo.name !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(dlo.name) ||
    !Array.isArray(spaces) ||
    spaces.length === 0 ||
    !spaces.every((entry) => isDataSpaceName(object(entry).name)) ||
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
 * The item checks of a retrieved stream GET: a stream of another name, or one whose DLO does not
 * belong to the run's data space (selection is per data space), stays an item failure.
 * @param {unknown} value Stream GET response.
 * @param {string} apiName Requested stream name.
 * @param {string} dataSpace The run's data space.
 * @returns {Json} The GET.
 */
export function checkRetrievedStreamScope(
  value: unknown,
  apiName: string,
  dataSpace: string,
): Json {
  const raw = object(value);
  if (raw.name !== apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
  const bag = (entry: unknown): Json =>
    entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Json) : {};
  const dlo = bag(raw.dataLakeObjectInfo);
  const spaces = Array.isArray(dlo.dataSpaceInfo)
    ? (dlo.dataSpaceInfo as unknown[]).map((entry) => bag(entry).name)
    : [];
  if (spaces.length > 0 && !spaces.includes(dataSpace))
    throw outsideRunSpace(String(raw.name), dataSpace);
  return raw;
}

/**
 * The refusal of a stream whose landing DLO does not belong to the run's data space.
 * @param {string} apiName Stream name.
 * @param {string} dataSpace The run's data space.
 * @returns {DataStreamError} UNSUPPORTED_STREAM_DATASPACE with an explanation.
 */
function outsideRunSpace(apiName: string, dataSpace: string): DataStreamError {
  return explainInput(
    new DataStreamError('UNSUPPORTED_STREAM_DATASPACE'),
    `The landing DLO of ${printableKey(apiName)} does not belong to the data space ${printableKey(dataSpace)}. Run the command with --dataspace set to one of its DLO's data spaces.`,
  );
}

/**
 * The data spaces of a native DLO read, sorted; an entry without a usable name, or a name listed
 * twice, is INVALID_STREAM_DLO.
 * @param {Json} dlo Native DLO object.
 * @returns {string[]} Its data spaces.
 */
function streamDloSpaces(dlo: Json): string[] {
  const names = Array.isArray(dlo.dataSpaceInfo)
    ? dlo.dataSpaceInfo.map((entry) => bag(entry).name)
    : [];
  if (
    names.length === 0 ||
    !names.every((name) => isDataSpaceName(name)) ||
    new Set(names).size !== names.length
  )
    throw new DataStreamError('INVALID_STREAM_DLO');
  return sortedDataSpaces(names as string[]);
}

/**
 * The data spaces of a stream's landing DLO, sorted: the names the stream GET lists, or, when it
 * names none, the DLO's own `dataSpaceInfo` read by name. A GET that names no space is never taken
 * as the run's. The run's data space must be among them (UNSUPPORTED_STREAM_DATASPACE otherwise).
 * @param {unknown} value Stream GET response.
 * @param {string} apiName Stream name.
 * @param {string} dataSpace The run's data space.
 * @param {Pick<DataStreamReadClients, 'dlo'>} [clients] DLO reader, needed when the GET names no
 * data space (INVALID_STREAM_DLO without one).
 * @returns {Promise<string[]>} The data spaces.
 */
export async function streamSpaces(
  value: unknown,
  apiName: string,
  dataSpace: string,
  clients?: Partial<Pick<DataStreamReadClients, 'dlo'>>,
): Promise<string[]> {
  const info = bag(bag(value).dataLakeObjectInfo);
  const listed = Array.isArray(info.dataSpaceInfo)
    ? info.dataSpaceInfo.map((entry) => bag(entry).name)
    : [];
  let spaces: string[];
  if (listed.length > 0) {
    if (!listed.every((name) => isDataSpaceName(name)))
      throw new DataStreamError('UNSUPPORTED_STREAM_READ');
    spaces = sortedDataSpaces(listed as string[]);
  } else {
    if (
      !clients?.dlo ||
      typeof info.name !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(info.name)
    )
      throw new DataStreamError('INVALID_STREAM_DLO');
    const wrapper = object(await clients.dlo.get(info.name));
    if (Array.isArray(wrapper.dataLakeObjects) && wrapper.dataLakeObjects.length !== 1)
      throw new DataStreamError('INVALID_STREAM_DLO');
    spaces = streamDloSpaces(
      Array.isArray(wrapper.dataLakeObjects) ? object(wrapper.dataLakeObjects[0]) : wrapper,
    );
  }
  if (!spaces.includes(dataSpace)) throw outsideRunSpace(apiName, dataSpace);
  return spaces;
}

/**
 * Whether two data space lists name the same spaces.
 * @param {readonly string[]} left One list.
 * @param {readonly string[]} right The other list.
 * @returns {boolean} Same spaces.
 */
export function sameSpaces(left: readonly string[], right: readonly string[]): boolean {
  return isDeepStrictEqual(sortedDataSpaces(left), sortedDataSpaces(right));
}

/**
 * The refusal of a stream file whose c__dataSpace list differs from its DLO's data spaces.
 * @param {string} apiName Stream name.
 * @param {readonly string[]} file The file's list.
 * @param {readonly string[]} org The DLO's data spaces.
 * @returns {DataStreamError} STREAM_DATASPACE_MISMATCH with an explanation.
 */
export function spacesDiffer(
  apiName: string,
  file: readonly string[],
  org: readonly string[],
): DataStreamError {
  return explainInput(
    new DataStreamError('STREAM_DATASPACE_MISMATCH'),
    `The ${dataSpaceKey} list of ${printableKey(apiName)} (${file.map((space) => printableKey(space)).join(', ')}) differs from the data spaces of its DLO (${org.map((space) => printableKey(space)).join(', ')}). A stream file only mirrors its DLO: change the spaces with the DLO file, or retrieve the stream again.`,
  );
}

/**
 * An object, or an empty one for anything else.
 * @param {unknown} entry Candidate.
 * @returns {Json} The object or {}.
 */
function bag(entry: unknown): Json {
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Json) : {};
}

/**
 * Field names with their types, sorted, as one comparable string.
 * @param {unknown} values Field list.
 * @param {string} typeKey Key of the type (`dataType` in a schema, `datatype` in a stream GET).
 * @returns {string} Comparable text.
 */
function fieldsOf(values: unknown, typeKey: string): string {
  return JSON.stringify(
    (Array.isArray(values) ? values : [])
      .map((value) => {
        const field = object(value);
        return `${String(field.name)}:${String(field[typeKey])}`;
      })
      // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh array within the existing ES2022 library target.
      .sort(),
  );
}

/**
 * Retrieve-mode triage of a stream GET, before any connection or schema read: a stream of another
 * name stays an item failure, as does one whose DLO is in another data space (selection is per
 * data space). Streams of other connectors never reach this projection (they use the GET-shaped
 * file); a GET that names no connector type, or the Ingestion API connector with another stream
 * type, fits neither file shape and is refused, so retrieve writes the GET as-is.
 * @param {unknown} value Stream GET response.
 * @param {string} apiName Requested stream name.
 * @param {string} dataSpace The run's data space.
 */
function triageRetrievedStream(value: unknown, apiName: string, dataSpace: string): void {
  const raw = checkRetrievedStreamScope(value, apiName, dataSpace);
  if (raw.dataStreamType !== 'INGESTAPI' || bag(raw.connectorInfo).connectorType !== 'IngestApi')
    throw new DataStreamError('UNSUPPORTED_STREAM_CONNECTOR');
}

/**
 * The event of a connection a stream reads. The stream GET does not name it; Salesforce names an
 * Ingestion API stream `<connection>_<event>_<hash>` and labels it `<connection>-<event>`. A
 * connection with one event needs no match. When several events fit the name or label, the one
 * whose fields equal the stream's source fields is taken.
 * @param {Json} stream Stream GET.
 * @param {unknown[]} events Event schemas of the stream's connection.
 * @returns {string} Event name.
 */
export function streamEvent(stream: Json, events: unknown[]): string {
  const schemas = events.map((value) => object(value));
  if (schemas.length === 1 && typeof schemas[0].name === 'string') return schemas[0].name;
  const fits = (event: string): boolean =>
    (typeof stream.name === 'string' &&
      new RegExp(`_${event}_[0-9A-Fa-f]{8}$`, 'u').test(stream.name)) ||
    (typeof stream.label === 'string' && stream.label.endsWith(`-${event}`));
  let candidates = schemas.filter(
    (schema) => typeof schema.name === 'string' && name.test(schema.name) && fits(schema.name),
  );
  if (candidates.length > 1)
    candidates = candidates.filter(
      (schema) => fieldsOf(schema.fields, 'dataType') === fieldsOf(stream.sourceFields, 'datatype'),
    );
  if (candidates.length !== 1) throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  return candidates[0].name as string;
}

/**
 * Resolve an exact portable connection/event independently from generated stream names.
 * A missing source name alone never authorizes creation; this read result authorizes no write.
 * @param {object} selection Portable requested name, connection/event and Text primary key.
 * @param {string} selection.apiName Portable stream name.
 * @param {string} selection.connectionName Connection developer name.
 * @param {string} selection.event Uploaded event name.
 * @param {string} selection.primaryKey Explicit Text primary key.
 * @param {DataStreamReadClients} clients Read-only dependency boundaries.
 * @param {boolean} postWrite Whether this read belongs to bounded create/update settlement.
 * @param {DataStreamReadMode} mode `retrieve` lists connections leniently (every page, extra
 * envelope keys ignored); `deploy` keeps the strict single-page envelope check.
 * @returns {Promise<DataStreamBinding>} Private target-local binding and complete inventory.
 */
export async function resolveDataStreamBinding(
  selection: {
    apiName: string;
    connectionName: string;
    event: string;
    primaryKey: string;
  },
  clients: DataStreamReadClients,
  postWrite = false,
  mode: DataStreamReadMode = 'deploy',
): Promise<DataStreamBinding> {
  if (
    ![selection.apiName, selection.connectionName, selection.event, selection.primaryKey].every(
      (value) => name.test(value),
    )
  )
    throw new DataStreamError('INVALID_STREAM_BINDING');
  const connections =
    mode === 'retrieve'
      ? objects(await listConnectionsLeniently(clients))
      : strictConnections(await clients.connections.list());
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
  // The connection may hold several events, one stream each; the selected event is named.
  if (!Array.isArray(schemas.schemas) || schemas.schemas.length === 0)
    throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  const events = schemas.schemas as unknown[];
  const named = events
    .map((value) => object(value))
    .filter((value) => value.name === selection.event);
  if (named.length > 1) throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  const event = named[0] ?? {};
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
      typeof field.dataType !== 'string' ||
      !field.dataType ||
      typeof field.label !== 'string' ||
      !field.label ||
      fieldNames.has(field.name.toLowerCase())
    )
      throw new DataStreamError('INVALID_STREAM_SCHEMA');
    fieldNames.add(field.name.toLowerCase());
    return { name: field.name, label: field.label, dataType: field.dataType as string };
  });
  if (!sourceFields.some((field) => field.name === selection.primaryKey))
    throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  const listed = await clients.streams.list(selection.connectionName);
  const listedStreams = listed.map((value) => object(value));
  if (listedStreams.some((stream) => stream.dataSource !== selection.connectionName))
    throw new DataStreamError('AMBIGUOUS_STREAM_BINDING');
  // Only the streams of the selected event; the connection's other events have their own.
  const inventory = listedStreams
    .filter((stream) => streamEvent(stream, events) === selection.event)
    .map((value) => inspectNativeDataStream(value));
  if (inventory.length > 1) throw new DataStreamError('AMBIGUOUS_STREAM_BINDING');
  let existing: Json | undefined;
  try {
    existing = inspectNativeDataStream(await clients.streams.get(selection.apiName));
    if (existing.name !== selection.apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
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
    existing &&
    (!target ||
      existing.recordId !== target.recordId ||
      existing.name !== target.name ||
      existing.dataSource !== selection.connectionName)
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
    if (keys.length !== 1 || keys[0].name !== selection.primaryKey)
      throw new DataStreamError('INVALID_STREAM_PRIMARY_KEY');
  } else if (event.availabilityStatus !== 'Available' || existing)
    throw explainMismatch(
      new DataStreamError('STREAM_BINDING_DRIFT'),
      'resolve absent stream binding',
      selection.apiName,
      { availabilityStatus: 'Available', target: undefined },
      { availabilityStatus: event.availabilityStatus, target: existing },
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
 * @param {string} dataSpace The run's data space: the stream's DLO must belong to it.
 * @param {boolean} postWrite Whether this read belongs to bounded create/update settlement.
 * @param {DataStreamReadMode} mode `retrieve` lists connections leniently; `deploy` strictly.
 * @returns {Promise<DataStreamDocument>} Detached validated portable document without runtime IDs.
 */
export async function retrieveNativeDataStream(
  apiName: string,
  clients: DataStreamReadClients,
  dataSpace = 'default',
  postWrite = false,
  mode: DataStreamReadMode = 'deploy',
): Promise<DataStreamDocument> {
  if (!name.test(apiName) || !isDataSpaceName(dataSpace))
    throw new DataStreamError('INVALID_STREAM_BINDING');
  return projectNativeDataStream(
    await clients.streams.get(apiName),
    apiName,
    clients,
    dataSpace,
    postWrite,
    mode,
  );
}

/**
 * Project an Ingestion API stream GET into its portable document (see retrieveNativeDataStream).
 * @param {unknown} read Stream GET response.
 * @param {string} apiName Exact stream name.
 * @param {DataStreamReadClients} clients Internal read clients.
 * @param {string} dataSpace The run's data space: the stream's DLO must belong to it.
 * @param {boolean} postWrite Whether this read belongs to bounded create/update settlement.
 * @param {DataStreamReadMode} mode `retrieve` lists connections leniently; `deploy` strictly.
 * @returns {Promise<DataStreamDocument>} Detached validated portable document; its c__dataSpace
 * lists every data space of the DLO.
 */
export async function projectNativeDataStream(
  read: unknown,
  apiName: string,
  clients: DataStreamReadClients,
  dataSpace = 'default',
  postWrite = false,
  mode: DataStreamReadMode = 'deploy',
): Promise<DataStreamDocument> {
  // Decide from the stream GET alone whether the plugin can model it, before connection reads.
  if (mode === 'retrieve') triageRetrievedStream(read, apiName, dataSpace);
  const raw = inspectNativeDataStream(read);
  if (raw.name !== apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
  let listed: unknown[];
  if (mode === 'retrieve') listed = await listConnectionsLeniently(clients);
  else {
    const connectionIdList = await clients.connections.list();
    if (!Array.isArray(connectionIdList.connections))
      throw new DataStreamError('INCOMPLETE_CONNECTION_LIST');
    listed = connectionIdList.connections;
  }
  const matches = listed
    .map((value) => object(value))
    .filter((item) => item.name === raw.dataSource);
  if (matches.length !== 1 || typeof matches[0].id !== 'string' || !recordId.test(matches[0].id))
    throw new DataStreamError('AMBIGUOUS_STREAM_CONNECTION');
  const schema = await clients.connections.schema(matches[0].id);
  if (!Array.isArray(schema.schemas) || schema.schemas.length === 0)
    throw new DataStreamError('AMBIGUOUS_STREAM_EVENT');
  const eventName = streamEvent(raw, schema.schemas as unknown[]);
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
      event: eventName,
      primaryKey: keys[0].name,
    },
    clients,
    postWrite,
    mode,
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
    dlo.category !== info.category ||
    !Array.isArray(dlo.fields)
  )
    throw new DataStreamError('INVALID_STREAM_DLO');
  // The DLO read names every data space it belongs to; the stream file mirrors that list.
  const spaces = streamDloSpaces(dlo);
  if (!spaces.includes(dataSpace)) throw outsideRunSpace(apiName, dataSpace);
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
  const formulas: DataStreamFormulaMapping[] = [];
  for (const value of raw.mappings as unknown[]) {
    const mapping = object(value);
    const source = binding.sourceFields.find((field) => field.name === mapping.sourceFieldName);
    if (source && mapping.targetFieldName === source.name && mapping.formula === undefined)
      continue;
    if (
      (mapping.targetFieldName === 'DataSource' &&
        mapping.formula === `&quot;${binding.connectionName}&quot;`) ||
      (mapping.targetFieldName === 'DataSourceObject' &&
        mapping.formula === `&quot;${apiName}&quot;`) ||
      // Salesforce adds the partition-date formula of an Engagement DLO itself.
      (typeof mapping.targetFieldName === 'string' &&
        mapping.targetFieldName.startsWith('cdp_sys_') &&
        typeof mapping.formula === 'string')
    )
      continue;
    const target = info.fields
      .map((value) => object(value))
      .find((field) => field.name === mapping.targetFieldName);
    // An additive mapping reads back as its source label in `formula` when a PATCH added it, and
    // as a plain source mapping onto another target when the create carried it (live, API 68).
    const additiveSource =
      typeof mapping.formula === 'string' && mapping.sourceFieldName === undefined
        ? binding.sourceFields.find(
            (field) => field.label === decodeFormula(mapping.formula as string),
          )
        : mapping.formula === undefined
          ? binding.sourceFields.find((field) => field.name === mapping.sourceFieldName)
          : undefined;
    // The file names an additive source by its label; a label several event fields share cannot
    // say which one, so such a stream is written as-is rather than as a file deploy refuses.
    if (
      additiveSource &&
      binding.sourceFields.filter((field) => field.label === additiveSource.label).length !== 1
    )
      throw new DataStreamError('UNSUPPORTED_STREAM_PROJECTION');
    if (
      !target ||
      typeof target.dataType !== 'string' ||
      (mapping.formula !== undefined && mapping.sourceFieldName !== undefined) ||
      (typeof mapping.formula !== 'string' && !additiveSource)
    )
      throw new DataStreamError('UNSUPPORTED_STREAM_PROJECTION');
    if (additiveSource)
      additions.push({
        sourceFieldLabel: additiveSource.label,
        targetFieldName: target.name as string,
        targetFieldReturntype: target.dataType,
      });
    else
      formulas.push({
        targetFieldName: target.name as string,
        formula: decodeFormula(mapping.formula as string),
        targetFieldReturntype: target.dataType,
      });
  }
  return validateDataStreamDocument(
    {
      schemaVersion: 1,
      kind: 'data-stream',
      [dataSpaceKey]: spaces,
      identity: { apiName },
      spec: {
        connectorType: 'IngestApi',
        connectionName: binding.connectionName,
        event: binding.event,
        datastreamType: 'INGEST_API',
        refreshMode: object(raw.refreshConfig).refreshMode,
        label: raw.label,
        newDlo: {
          name: dlo.name,
          label: dlo.label,
          ...(info.category === undefined ? {} : { category: info.category }),
          ...(typeof info.eventDateTimeFieldName === 'string'
            ? { eventDateTimeFieldName: info.eventDateTimeFieldName }
            : {}),
          primaryKey: { name: keys[0].name, label: keys[0].label, dataType: keys[0].dataType },
        },
        // Canonicalize only projections derived here; caller-authored mapping order stays strict.
        additiveFieldMappings: byTarget(additions),
        ...(formulas.length > 0 ? { formulaMappings: byTarget(formulas) } : {}),
      },
      observed: {
        // Salesforce lists stream mappings in varying order; sort so one org state writes one file.
        mappings: sortedStreamMappings(raw.mappings as unknown[]),
        sourceFields: raw.sourceFields,
        dloFields,
        actualDloName: dlo.name,
      },
    },
    mode,
  );
}

export type DataStreamDeployClients = DataStreamReadClients & {
  streams: DataStreamReadClients['streams'] &
    Pick<DataStreamClient, 'create' | 'update' | 'patch' | 'relabel'>;
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
  /** Formula mappings to send: added or changed formulas, and removed ones with an empty formula. */
  formulaChanges: Array<{
    targetFieldName: string;
    transformationFormula: string;
    targetFieldReturntype?: string;
  }>;
  /** Whether the file's stream label differs from the org's (sent; Salesforce keeps its own). */
  labelChange: boolean;
};
/** A part of the file Salesforce accepted but did not apply. */
export type DataStreamNotice = { code: string; message: string };
export type DataStreamDeployOptions = {
  allowProcessing: boolean;
  /** The run's data space (default when absent): the file's c__dataSpace must list it. */
  dataSpace?: string;
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
  if (!(await streamDloAbsent(apiName, clients)))
    throw new DataStreamError('STREAM_PROPOSED_DLO_EXISTS');
}

/**
 * Observe DLO absence by name or ID: true only on a genuine native HTTP 404.
 * @param {string} identity DLO name or ID.
 * @param {DataStreamReadClients} clients Native DLO reader.
 * @returns {Promise<boolean>} True when the DLO reads 404; false while it still reads.
 */
async function streamDloAbsent(identity: string, clients: DataStreamReadClients): Promise<boolean> {
  try {
    await clients.dlo.get(identity);
  } catch (error) {
    if (
      (error instanceof ConnectError &&
        error.code === 'REQUEST_FAILED' &&
        error.statusCode === 404) ||
      (error instanceof DataStreamHttpError &&
        ['REQUEST_FAILED', 'STREAM_HTTP_ERROR'].includes(error.code) &&
        error.status === 404)
    )
      return true;
    throw error;
  }
  return false;
}

const failureCauses = new WeakMap<object, unknown>();

/**
 * Keep the error behind a failed stream deploy result, so the command can report its explanation.
 * @template {object} T
 * @param {T} result The item result built from the error.
 * @param {unknown} error The caught error.
 * @returns {T} The same result.
 */
export function retainStreamFailure<T extends object>(result: T, error: unknown): T {
  failureCauses.set(result, error);
  return result;
}

/**
 * The error behind a failed stream deploy result, when the executor kept it.
 * @param {object} result Item result.
 * @returns {unknown} The caught error, or undefined.
 */
export function streamFailureCause(result: object): unknown {
  return failureCauses.get(result);
}

/**
 * Refuse a stream file whose c__dataSpace list does not name the run's data space.
 * @param {DataStreamDocument} document Stream file.
 * @param {string} dataSpace The run's data space.
 */
export function requireRunSpace(
  document: Pick<DataStreamDocument, 'c__dataSpace' | 'identity'>,
  dataSpace: string,
): void {
  if (!document.c__dataSpace.includes(dataSpace))
    throw explainInput(
      new DataStreamError('STREAM_DATASPACE_MISMATCH'),
      `The ${dataSpaceKey} list of ${printableKey(document.identity.apiName)} (${document.c__dataSpace.map((space) => printableKey(space)).join(', ')}) does not name the run's data space ${printableKey(dataSpace)}. Deploy it with --dataspace set to one of its data spaces.`,
    );
}

/**
 * Every additive mapping's source label must name exactly one field of the event: Salesforce stores
 * an unknown label without checking it, as a mapping that never carries data (live, API 68).
 * @param {DataStreamMapping[]} additions Additive mappings of the file.
 * @param {Array<{name: string; label: string; dataType: string}>} sourceFields Event fields.
 * @returns {Array<{name: string; label: string}>} The source field of each mapping, in order.
 */
function additiveSources(
  additions: readonly DataStreamMapping[],
  sourceFields: DataStreamBinding['sourceFields'],
): Array<{ name: string; label: string }> {
  return additions.map((desired, index) => {
    const sources = sourceFields.filter((field) => field.label === desired.sourceFieldLabel);
    if (sources.length !== 1)
      throw explainInput(
        new DataStreamError('UNSUPPORTED_STREAM_MAPPING_SOURCE'),
        `spec.additiveFieldMappings[${index}].sourceFieldLabel ${sources.length === 0 ? 'names no' : 'names more than one'} field of the event. Salesforce would store the mapping without checking it, and it would never carry data. Use the exact label of one source field.`,
      );
    return sources[0];
  });
}

/**
 * Admit a create with independent name and binding absence; its additive mappings must name
 * source fields of the event. The file must list the run's data space alone: the create puts
 * the landing DLO into it.
 * @param {unknown} value Portable authored stream.
 * @param {DataStreamReadClients} clients Independent read boundaries.
 * @param {string} [dataSpace] The run's data space.
 * @returns {Promise<DataStreamCreatePlan>} Private read-only create admission, never dispatch authority.
 */
export async function preflightNativeDataStreamCreate(
  value: unknown,
  clients: DataStreamReadClients,
  dataSpace = 'default',
): Promise<DataStreamCreatePlan> {
  const document = validateDataStreamDocument(value);
  requireRunSpace(document, dataSpace);
  if (document.c__dataSpace.length !== 1) throw createSpacesRefusal(document.c__dataSpace);
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
  additiveSources(document.spec.additiveFieldMappings, binding.sourceFields);
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
  notices: DataStreamNotice[];
}> {
  const document = validateDataStreamDocument(value);
  const dataSpace = options.dataSpace ?? 'default';
  if (options.allowProcessing !== true)
    throw new DataStreamError('PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  await options.verifyInput();
  const plan = await preflightNativeDataStreamCreate(document, clients, dataSpace);
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamCreate(document, clients, dataSpace);
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
  const echo = object(
    await clients.streams.create(
      document,
      plan.binding.sourceFields.map((field) => ({ name: field.name, dataType: field.dataType })),
    ),
  );
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
      const actual = await retrieveNativeDataStream(echo.name, clients, dataSpace, true);
      if (
        actual.spec.newDlo.label !== document.spec.newDlo.label ||
        !isDeepStrictEqual(actual.spec.newDlo.primaryKey, document.spec.newDlo.primaryKey) ||
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
        dlo.category !== actual.spec.newDlo.category ||
        !sameSpaces(streamDloSpaces(dlo), document.c__dataSpace) ||
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
            category: actual.spec.newDlo.category,
            dataSpaceInfo: document.c__dataSpace.map((space) => ({ name: space })),
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
        const formulasOf = (entries: DataStreamFormulaMapping[] | undefined): string[] =>
          (entries ?? []).map((entry) =>
            JSON.stringify([
              entry.targetFieldName,
              entry.formula,
              entry.targetFieldReturntype.toUpperCase(),
            ]),
          );
        const additionsOf = (entries: readonly DataStreamMapping[]): string[] =>
          entries.map((entry) =>
            JSON.stringify([
              entry.sourceFieldLabel,
              entry.targetFieldName,
              entry.targetFieldReturntype.toUpperCase(),
            ]),
          );
        const missing = [
          ...formulasOf(document.spec.formulaMappings).filter(
            (entry) => !formulasOf(actual.spec.formulaMappings).includes(entry),
          ),
          ...additionsOf(document.spec.additiveFieldMappings).filter(
            (entry) => !additionsOf(actual.spec.additiveFieldMappings).includes(entry),
          ),
        ];
        return {
          operation: 'create',
          targetApiName: echo.name,
          targetDloName: actual.spec.newDlo.name,
          document: actual,
          notices:
            missing.length > 0
              ? [
                  {
                    code: 'STREAM_CHANGE_NOT_APPLIED',
                    message:
                      'Salesforce created the stream but it does not hold every formula or additive mapping of the file. Retrieve the stream to see what it holds.',
                  },
                ]
              : [],
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
    dlo.category !== document.spec.newDlo.category ||
    !sameSpaces(streamDloSpaces(dlo), document.c__dataSpace) ||
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
        category: document.spec.newDlo.category,
        dataSpaceInfo: document.c__dataSpace.map((space) => ({ name: space })),
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
 * Compare the file with the stream. Mapping changes are sent as the file holds them and Salesforce
 * decides (live, API 68, it refuses any change or removal of an existing mapping on an Ingestion
 * API stream); settings Salesforce answers with 200 but ignores are refused before any write.
 * The file's c__dataSpace list must name the run's data space and equal the DLO's data spaces
 * (check only: spaces change through the DLO file).
 * @param {unknown} value The stream file (desired state of its mappings).
 * @param {DataStreamReadClients} clients Independent binding, source and parent readers.
 * @param {string} [dataSpace] The run's data space.
 * @returns {Promise<DataStreamUpdatePlan>} Private update/noop comparison without dispatch.
 */
export async function preflightNativeDataStreamUpdate(
  value: unknown,
  clients: DataStreamReadClients,
  dataSpace = 'default',
): Promise<DataStreamUpdatePlan> {
  const document = validateDataStreamDocument(value);
  requireRunSpace(document, dataSpace);
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
  const target = await retrieveNativeDataStream(binding.target.name as string, clients, dataSpace);
  if (!sameSpaces(document.c__dataSpace, target.c__dataSpace))
    throw spacesDiffer(document.identity.apiName, document.c__dataSpace, target.c__dataSpace);
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
  // A PATCH of these answers 200 and changes nothing, so it would report a change that did not
  // happen; the primary key and refresh mode have no write at all (live, API 68).
  const settings = [
    ...(sameEnum(document.spec.refreshMode, target.spec.refreshMode) ? [] : ['spec.refreshMode']),
    ...(document.spec.newDlo.label === target.spec.newDlo.label ? [] : ['spec.newDlo.label']),
    ...(sameEnum(document.spec.newDlo.category, target.spec.newDlo.category)
      ? []
      : ['spec.newDlo.category']),
    ...(document.spec.newDlo.eventDateTimeFieldName === target.spec.newDlo.eventDateTimeFieldName
      ? []
      : ['spec.newDlo.eventDateTimeFieldName']),
    ...(sameRecord(document.spec.newDlo.primaryKey, target.spec.newDlo.primaryKey, dloTypeKey)
      ? []
      : ['spec.newDlo.primaryKey']),
  ];
  if (settings.length > 0)
    throw explainInput(
      new DataStreamError('UNSUPPORTED_STREAM_SETTINGS_CHANGE'),
      `The file differs from the stream in ${settings.join(', ')}, which no stream update changes (Salesforce ignores them or has no write for them). Use the values from a freshly retrieved file, or change them in Salesforce.`,
    );
  const dlo = await readUpdateStreamDlo(target, clients);
  if (
    binding.target.status !== 'ACTIVE' ||
    dlo.status !== 'ACTIVE' ||
    (object(binding.target.dataLakeObjectInfo).status !== undefined &&
      object(binding.target.dataLakeObjectInfo).status !== 'ACTIVE')
  )
    throw new DataStreamError('STREAM_NOT_READY');
  additiveSources(document.spec.additiveFieldMappings, binding.sourceFields);
  // An additive mapping the stream already holds unchanged is not sent; any other is.
  const additions = document.spec.additiveFieldMappings.filter((desired) => {
    const existing = target.spec.additiveFieldMappings.find(
      (entry) => entry.targetFieldName === desired.targetFieldName,
    );
    return !(
      existing &&
      existing.sourceFieldLabel === desired.sourceFieldLabel &&
      sameEnum(existing.targetFieldReturntype, desired.targetFieldReturntype)
    );
  });
  const patch = validateDataStreamDocument({
    ...document,
    spec: { ...document.spec, additiveFieldMappings: additions },
  });
  if (additions.length > 0) buildDataStreamPatchBody(patch);
  // Formulas are sent as the file holds them; Salesforce decides (it refuses a removal).
  const wanted = document.spec.formulaMappings ?? [];
  const have = target.spec.formulaMappings ?? [];
  const formulaChanges: DataStreamUpdatePlan['formulaChanges'] = [];
  for (const mapping of wanted) {
    const existing = have.find((entry) => entry.targetFieldName === mapping.targetFieldName);
    if (
      existing?.formula !== mapping.formula ||
      !sameEnum(existing?.targetFieldReturntype, mapping.targetFieldReturntype)
    )
      formulaChanges.push({
        targetFieldName: mapping.targetFieldName,
        transformationFormula: mapping.formula,
        targetFieldReturntype: mapping.targetFieldReturntype,
      });
  }
  // A mapping the file leaves out is sent as a removal (an empty formula); Salesforce decides.
  const kept = new Set(
    [...wanted, ...document.spec.additiveFieldMappings].map((entry) => entry.targetFieldName),
  );
  for (const mapping of [...have, ...target.spec.additiveFieldMappings])
    if (!kept.has(mapping.targetFieldName))
      formulaChanges.push({ targetFieldName: mapping.targetFieldName, transformationFormula: '' });
  const labelChange = document.spec.label !== target.spec.label;
  return {
    operation: additions.length > 0 || formulaChanges.length > 0 || labelChange ? 'update' : 'noop',
    document,
    patch,
    binding,
    target,
    dlo,
    additions,
    formulaChanges,
    labelChange,
  };
}

/**
 * The PATCH of an update with formula or label parts: `datastreamType` plus the mappings to add,
 * change or remove and, when it is not sent through the Metadata API, the label.
 * @param {DataStreamUpdatePlan} plan Update plan.
 * @param {boolean} [withLabel] Whether the PATCH carries the label change.
 * @returns {Json} PATCH body.
 */
export function ingestDataStreamPatchBody(plan: DataStreamUpdatePlan, withLabel = true): Json {
  const mappings = [...plan.additions, ...plan.formulaChanges];
  return {
    datastreamType: plan.document.spec.datastreamType,
    ...(mappings.length > 0 ? { mappings: structuredClone(mappings) } : {}),
    ...(plan.labelChange && withLabel ? { label: plan.document.spec.label } : {}),
  };
}

/**
 * The notice for a label Salesforce accepted but did not apply.
 * @param {boolean} kept Whether the stream still has another label than the file.
 * @returns {DataStreamNotice[]} Notices.
 */
function labelNotApplied(kept: boolean): DataStreamNotice[] {
  return kept
    ? [
        {
          code: 'STREAM_CHANGE_NOT_APPLIED',
          message:
            'Salesforce accepted the label change but kept the old label; change it in Salesforce. Retrieve the stream to see what it holds.',
        },
      ]
    : [];
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
  notices: DataStreamNotice[];
}> {
  const document = validateDataStreamDocument(value);
  const dataSpace = options.dataSpace ?? 'default';
  await options.verifyInput();
  const plan = await preflightNativeDataStreamUpdate(document, clients, dataSpace);
  if (plan.operation === 'update' && options.allowProcessing !== true)
    throw new DataStreamError('PROCESSING_ACKNOWLEDGEMENT_REQUIRED');
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamUpdate(document, clients, dataSpace);
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
      notices: [],
    };
  const now = options.now ?? Date.now;
  const pause = options.wait ?? wait;
  const deadline = now() + 15 * 60 * 1000;
  const targetId = plan.binding.target!.recordId as string;
  // Salesforce ignores a label in a stream PATCH; the Metadata API update of the stream
  // definition changes it (live, API 68). It is sent first, while the stream is ACTIVE.
  const relabel = plan.labelChange ? clients.streams.relabel : undefined;
  if (relabel) await relabel(apiName, plan.document.spec.label);
  if (plan.formulaChanges.length === 0 && (!plan.labelChange || relabel)) {
    if (plan.additions.length > 0) await clients.streams.update(targetId, plan.patch);
  } else await clients.streams.patch(targetId, ingestDataStreamPatchBody(plan, !relabel));
  let labelReads = 0;
  // Targets whose existing field or mapping the PATCH changes or removes, and new targets.
  const existingTargets = new Set([
    ...(object(plan.binding.target!.dataLakeObjectInfo).fields as unknown[]).map(
      (entry) => object(entry).name as string,
    ),
    ...(plan.binding.target!.mappings as unknown[]).map(
      (entry) => object(entry).targetFieldName as string,
    ),
  ]);
  const changed = new Set(
    [...plan.additions, ...plan.formulaChanges]
      .map((entry) => entry.targetFieldName)
      .filter((target) => existingTargets.has(target)),
  );
  const newAdditions = plan.additions.filter((entry) => !changed.has(entry.targetFieldName));
  const newFormulas = plan.formulaChanges.filter((entry) => !changed.has(entry.targetFieldName));
  // A removal leaves the DLO field in place (Salesforce drops only the mapping), so the fields
  // of removal targets stay protected; only added and changed targets may change their field.
  const fieldChanged = new Set(
    [
      ...plan.additions,
      ...plan.formulaChanges.filter((entry) => entry.transformationFormula !== ''),
    ]
      .map((entry) => entry.targetFieldName)
      .filter((target) => changed.has(target)),
  );
  const unchanged = (
    entries: unknown[],
    key: string,
    suffix = '',
    targets: ReadonlySet<string> = changed,
  ): unknown[] =>
    entries.filter(
      (entry) => ![...targets].some((target) => `${target}${suffix}` === object(entry)[key]),
    );
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    try {
      const actual = await retrieveNativeDataStream(apiName, clients, dataSpace, true);
      const binding = await resolveDataStreamBinding(
        {
          apiName,
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
      const added = [
        ...newAdditions.map((entry) => entry.targetFieldName),
        ...newFormulas.map((entry) => entry.targetFieldName),
      ];
      const mutable = [
        'status',
        'mappings',
        'dataLakeObjectInfo',
        ...(plan.labelChange ? ['label'] : []),
      ];
      if (
        !isDeepStrictEqual(streamProtected(old, mutable), streamProtected(raw, mutable)) ||
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
        !unchanged(old.mappings as unknown[], 'targetFieldName').every((entry) =>
          newMappings.some((current) => isDeepStrictEqual(entry, current)),
        ) ||
        !unchanged(oldInfo.fields as unknown[], 'name', '', fieldChanged).every((entry) =>
          newFields.some((current) => isDeepStrictEqual(entry, current)),
        ) ||
        !unchanged(plan.dlo.fields as unknown[], 'name', '__c', fieldChanged).every((entry) =>
          (dlo.fields as unknown[]).some((current) => isDeepStrictEqual(entry, current)),
        )
      )
        throw new DataStreamError('STREAM_UPDATE_PRESERVATION_FAILED');
      const mappingsReady =
        plan.additions.every((entry) =>
          newMappings.some((value) => {
            const mapping = object(value);
            const source = plan.binding.sourceFields.find(
              (field) => field.label === entry.sourceFieldLabel,
            );
            return (
              mapping.targetFieldName === entry.targetFieldName &&
              ((typeof mapping.formula === 'string' &&
                decodeFormula(mapping.formula) === entry.sourceFieldLabel &&
                mapping.sourceFieldName === undefined) ||
                (mapping.formula === undefined && mapping.sourceFieldName === source?.name))
            );
          }),
        ) &&
        plan.formulaChanges.every((entry) => {
          const onTarget = newMappings
            .map((value) => object(value))
            .filter((mapping) => mapping.targetFieldName === entry.targetFieldName);
          // A removal is applied only when nothing maps onto the target any more: a plain-shaped
          // additive mapping has no formula, so a missing formula alone proves nothing.
          if (entry.transformationFormula === '')
            return onTarget.every(
              (mapping) => mapping.formula === undefined && mapping.sourceFieldName === undefined,
            );
          const formula = onTarget[0]?.formula;
          return (
            typeof formula === 'string' && decodeFormula(formula) === entry.transformationFormula
          );
        });
      const fieldsReady =
        plan.additions.every((entry) =>
          newFields.some((value) => {
            const field = object(value);
            return (
              field.name === entry.targetFieldName &&
              sameEnum(field.dataType, entry.targetFieldReturntype) &&
              (changed.has(entry.targetFieldName) ||
                (field.label === entry.targetFieldName && field.isPrimaryKey === false))
            );
          }),
        ) &&
        newFormulas.every((entry) =>
          newFields.some((value) => {
            const field = object(value);
            return field.name === entry.targetFieldName && field.isPrimaryKey === false;
          }),
        );
      if (mappingsReady && fieldsReady) {
        if (
          !streamEntriesPreserved(
            unchanged(old.mappings as unknown[], 'targetFieldName'),
            unchanged(newMappings, 'targetFieldName'),
            'targetFieldName',
            added,
          ) ||
          !streamEntriesPreserved(
            unchanged(oldInfo.fields as unknown[], 'name', '', fieldChanged),
            unchanged(newFields, 'name', '', fieldChanged),
            'name',
            added,
          ) ||
          ((oldInfo.dataLakeFieldInfoRepresentation !== undefined ||
            info.dataLakeFieldInfoRepresentation !== undefined) &&
            (!Array.isArray(oldInfo.dataLakeFieldInfoRepresentation) ||
              !Array.isArray(info.dataLakeFieldInfoRepresentation) ||
              !streamEntriesPreserved(
                unchanged(oldInfo.dataLakeFieldInfoRepresentation, 'name', '', fieldChanged),
                unchanged(info.dataLakeFieldInfoRepresentation, 'name', '', fieldChanged),
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
            unchanged(plan.dlo.fields as unknown[], 'name', '__c', fieldChanged),
            unchanged(dlo.fields as unknown[], 'name', '__c', fieldChanged),
            'name',
            added.map((field) => `${field}__c`),
          ) ||
          (plan.dlo.dataLakeFieldInfoRepresentation !== undefined &&
            (!Array.isArray(dlo.dataLakeFieldInfoRepresentation) ||
              !streamEntriesPreserved(
                unchanged(
                  plan.dlo.dataLakeFieldInfoRepresentation as unknown[],
                  'name',
                  '__c',
                  fieldChanged,
                ),
                unchanged(dlo.dataLakeFieldInfoRepresentation, 'name', '__c', fieldChanged),
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
          const labelKept = plan.labelChange && raw.label !== plan.document.spec.label;
          // A label set through the Metadata API may show a read later; wait up to 3 reads.
          if (!labelKept || ++labelReads >= 3) {
            await options.verifyInput();
            if (now() >= deadline) break;
            return {
              operation: 'update',
              targetApiName: apiName,
              targetDloName: actual.spec.newDlo.name,
              document: actual,
              notices: labelNotApplied(labelKept),
            };
          }
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
  /** The run's data space (default when absent): the stream's DLO must belong to it. */
  dataSpace?: string;
  verifyInput: () => Promise<void>;
  survivorDloNames: readonly string[];
  /**
   * Preview only: whether the same delete deletes this dependent in an earlier phase. Without
   * it every dependent other than the DLO's own stream entry blocks.
   */
  covered?: (dependent: StreamDependent, dloName: string) => Promise<boolean>;
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
  /** Preview only: dependents of the stream or its DLO that the same delete deletes earlier. */
  plannedDependencies?: StreamDependent[];
};
/**
 * Delete plan of a stream the plugin cannot model (any connector, any settings): it is deleted
 * by name from its raw GET. Name, record ID, data space, ACTIVE status and the stream's and its
 * DLO's dependents are still checked; the IngestApi connection and schema are not read.
 */
export type UnmodelledDataStreamDeletePlan = {
  operation: 'delete';
  unmodelled: true;
  apiName: string;
  deleteDlo: boolean;
  recordId: string;
  label: unknown;
  /** The landing DLO named in the GET. */
  dlo: Json;
  streamDependencies: Json;
  dloDependencies: Json;
  plannedDependencies?: StreamDependent[];
};
/** One dependent of a stream or its DLO, by type and name. */
export type StreamDependent = { componentType: string; name: string };

/**
 * A stream read answered by Salesforce with HTTP 404: that stream does not exist.
 * @param {unknown} error Error of a native stream read.
 * @returns {boolean} True only for a genuine HTTP 404 of the stream route.
 */
export function isStreamNotFound(error: unknown): boolean {
  return (
    error instanceof DataStreamHttpError &&
    error.status === 404 &&
    ['REQUEST_FAILED', 'STREAM_HTTP_ERROR'].includes(error.code)
  );
}

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
 * Check the dependents of a stream and its DLO: only the DLO's own entry for this stream may be
 * listed. In a preview, `covered` admits dependents the same delete deletes earlier.
 * @param {Json} streamDependencies Stream dependents.
 * @param {Json} dloDependencies DLO dependents.
 * @param {object} target The stream.
 * @param {unknown} target.recordId Its record ID.
 * @param {unknown} target.label Its label (not compared: the entry may keep an older label).
 * @param {string} dloName Landing DLO name.
 * @param {Function} [covered] Preview only: a dependent the same delete deletes earlier.
 * @returns {Promise<StreamDependent[] | undefined>} Planned dependents, or undefined when none.
 */
async function checkStreamDeleteDependents(
  streamDependencies: Json,
  dloDependencies: Json,
  target: { recordId: unknown; label: unknown },
  dloName: string,
  covered: DataStreamDeleteOptions['covered'],
): Promise<StreamDependent[] | undefined> {
  const dependencies = dloDependencies.dependencies as unknown[];
  // The DLO's own entry for this stream, by record ID: after a label change through the
  // Metadata API the entry still carries the old label (live, API 68).
  const ownEntry = (value: unknown): boolean =>
    object(value).componentType === 'DataStream' &&
    object(value).id === target.recordId &&
    typeof object(value).name === 'string' &&
    !Object.keys(object(value)).some((key) => !['id', 'name', 'componentType'].includes(key));
  // Both modes refuse unknown/shared dependencies; cascade additionally has an explicit opt-in.
  if (streamDependencies.totalSize === 0 && dependencies.length === 1 && ownEntry(dependencies[0]))
    return undefined;
  // Preview only: dependents an earlier phase of the same delete plans to delete.
  if (covered === undefined || dependencies.filter((entry) => ownEntry(entry)).length > 1)
    throw new DataStreamError('STREAM_DELETE_DEPENDENCIES_BLOCKED');
  const planned: StreamDependent[] = [];
  for (const entry of [
    ...(streamDependencies.dependencies as unknown[]),
    ...dependencies.filter((value) => !ownEntry(value)),
  ]) {
    const { componentType, name: dependent } = object(entry);
    if (
      typeof componentType !== 'string' ||
      typeof dependent !== 'string' ||
      !(await covered({ componentType, name: dependent }, dloName))
    )
      throw new DataStreamError('STREAM_DELETE_DEPENDENCIES_BLOCKED');
    planned.push({ componentType, name: dependent });
  }
  return planned;
}

/**
 * The refusal of a stream delete with --delete-dlo whose landing DLO belongs to other data spaces
 * than the run's: deleting the DLO would remove it from all of them.
 * @param {string} dloName Landing DLO.
 * @param {string} apiName Stream name.
 * @param {string} dataSpace The run's data space.
 * @returns {DataStreamError} DLO_DELETE_OTHER_DATASPACES with an explanation.
 */
function otherSpacesRefusal(dloName: string, apiName: string, dataSpace: string): DataStreamError {
  return explainInput(
    new DataStreamError('DLO_DELETE_OTHER_DATASPACES'),
    `The landing DLO ${dloName} of ${apiName} does not belong to the data space ${dataSpace} alone, and deleting it with the stream would remove it from every data space. Delete the stream without --delete-dlo, or take the DLO out of the other data spaces first.`,
  );
}

/**
 * Plan the by-name delete of a stream the plugin cannot model, from its raw GET only.
 * @param {string} apiName Exact selected stream name.
 * @param {DataStreamReadClients} clients Native readers.
 * @param {object} options Cascade choice, survivors and preview planning.
 * @param {boolean} options.deleteDlo Whether the landing DLO is deleted too.
 * @param {readonly string[]} options.survivorDloNames Must be empty on this path.
 * @param {Function} [options.covered] Preview only: a dependent the same delete deletes earlier.
 * @returns {Promise<UnmodelledDataStreamDeletePlan>} Guarded plan.
 */
async function preflightUnmodelledDataStreamDelete(
  apiName: string,
  clients: DataStreamReadClients,
  options: Pick<
    DataStreamDeleteOptions,
    'deleteDlo' | 'survivorDloNames' | 'covered' | 'dataSpace'
  >,
): Promise<UnmodelledDataStreamDeletePlan> {
  const dataSpace = options.dataSpace ?? 'default';
  const raw = object(await clients.streams.get(apiName));
  if (raw.name !== apiName) throw new DataStreamError('STREAM_TARGET_MISMATCH');
  if (typeof raw.recordId !== 'string' || !recordId.test(raw.recordId))
    throw new DataStreamError('INVALID_STREAM_TARGET_ID');
  const info =
    raw.dataLakeObjectInfo && typeof raw.dataLakeObjectInfo === 'object'
      ? (raw.dataLakeObjectInfo as Json)
      : {};
  // The stream's data spaces (from the GET, or from its DLO when the GET names none) must hold
  // the run's.
  await streamSpaces(raw, apiName, dataSpace, clients);
  if (raw.status !== 'ACTIVE') throw new DataStreamError('STREAM_NOT_READY');
  if (typeof info.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*__dll$/u.test(info.name))
    throw new DataStreamError('INVALID_STREAM_DLO');
  const dloName = info.name;
  if (options.survivorDloNames.length > 0)
    throw new DataStreamError('INVALID_STREAM_DELETE_SURVIVOR');
  // Deleting the landing DLO removes it from every data space it belongs to: it must belong to
  // the run's data space alone, read from the DLO itself.
  if (options.deleteDlo) {
    const wrapper = object(await clients.dlo.get(dloName));
    // A wrapped read must hold exactly the one DLO; another count says nothing about its spaces.
    if (Array.isArray(wrapper.dataLakeObjects) && wrapper.dataLakeObjects.length !== 1)
      throw new DataStreamError('INVALID_STREAM_DLO');
    const dlo = Array.isArray(wrapper.dataLakeObjects)
      ? object(wrapper.dataLakeObjects[0])
      : wrapper;
    const memberships = Array.isArray(dlo.dataSpaceInfo)
      ? dlo.dataSpaceInfo.map((entry) => object(entry).name)
      : [];
    if (memberships.length !== 1 || memberships[0] !== dataSpace)
      throw otherSpacesRefusal(dloName, apiName, dataSpace);
  }
  const streamDependencies = streamDeleteDependencies(
    await clients.dependencies.stream(raw.recordId),
  );
  const dloDependencies = streamDeleteDependencies(await clients.dependencies.dlo(dloName));
  const plannedDependencies = await checkStreamDeleteDependents(
    streamDependencies,
    dloDependencies,
    { recordId: raw.recordId, label: raw.label },
    dloName,
    options.covered,
  );
  return {
    operation: 'delete',
    unmodelled: true,
    apiName,
    deleteDlo: options.deleteDlo,
    recordId: raw.recordId,
    label: raw.label,
    dlo: { name: dloName },
    streamDependencies,
    dloDependencies,
    ...(plannedDependencies === undefined ? {} : { plannedDependencies }),
  };
}

/**
 * Snapshot exact selected target, source, linked parent and explicitly protected survivors.
 * @param {string} apiName Exact selected target developer name, never a portable proposal.
 * @param {DataStreamReadClients} clients Independent native readers.
 * @param {object} options Explicit cascade choice and protected unrelated parent names.
 * @param {boolean} options.deleteDlo Explicit acknowledgement of linked-parent deletion.
 * @param {readonly string[]} options.survivorDloNames Unselected parents to preserve independently.
 * @param {Function} [options.covered] Preview only: a dependent the same delete deletes earlier.
 * @returns {Promise<DataStreamDeletePlan>} Private guarded plan, not dispatch authority.
 */
export async function preflightNativeDataStreamDelete(
  apiName: string,
  clients: DataStreamReadClients,
  options: Pick<
    DataStreamDeleteOptions,
    'deleteDlo' | 'survivorDloNames' | 'covered' | 'dataSpace'
  >,
): Promise<DataStreamDeletePlan | UnmodelledDataStreamDeletePlan> {
  if (!name.test(apiName) || typeof options.deleteDlo !== 'boolean')
    throw new DataStreamError('INVALID_STREAM_DELETE_SELECTION');
  const dataSpace = options.dataSpace ?? 'default';
  let document: DataStreamDocument;
  try {
    document = await retrieveNativeDataStream(apiName, clients, dataSpace);
  } catch (error) {
    // A stream the plugin cannot model (another connector, settings it does not know) is
    // deleted by name from its raw GET. Read failures, absence and identity stay refusals.
    if (verbatimReason(error) === undefined) throw error;
    return preflightUnmodelledDataStreamDelete(apiName, clients, options);
  }
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
  // Deleting the landing DLO removes it from every data space it belongs to.
  if (
    options.deleteDlo &&
    (document.c__dataSpace.length !== 1 || document.c__dataSpace[0] !== dataSpace)
  )
    throw otherSpacesRefusal(String(dlo.name), apiName, dataSpace);
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
  const plannedDependencies = await checkStreamDeleteDependents(
    streamDependencies,
    dloDependencies,
    { recordId: target.recordId, label: target.label },
    String(dlo.name),
    options.covered,
  );
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
    ...(plannedDependencies === undefined ? {} : { plannedDependencies }),
  };
}

/**
 * Observe typed native stream absence without interpreting arbitrary errors as missing state.
 * While deletion runs the stream may still read with any status; only its identity is checked.
 * @param {string} apiName Previously proven exact selected name.
 * @param {string} streamId Record ID of the deleted stream.
 * @param {DataStreamReadClients} clients Native stream reader.
 * @returns {Promise<boolean>} True only for genuine HTTP404; existing DELETING remains pending.
 */
async function deletedStreamAbsent(
  apiName: string,
  streamId: string,
  clients: DataStreamReadClients,
): Promise<boolean> {
  try {
    const current = object(await clients.streams.get(apiName));
    if (current.name !== apiName || current.recordId !== streamId)
      throw explainMismatch(
        new DataStreamError('STREAM_DELETE_GUARD_DRIFT'),
        'delete remaining stream identity check',
        apiName,
        { name: apiName, recordId: streamId },
        { name: current.name, recordId: current.recordId },
      );
    return false;
  } catch (error) {
    if (isStreamNotFound(error)) return true;
    throw error;
  }
}

/**
 * Delete a stream the plugin cannot model by its record ID once both guarded plans agree, then
 * wait (bounded) until the stream reads 404 and, with --delete-dlo, its DLO too; without it the
 * DLO must no longer list dependents.
 * @param {DataStreamDeletePlan | UnmodelledDataStreamDeletePlan} plan First plan.
 * @param {DataStreamDeletePlan | UnmodelledDataStreamDeletePlan} fresh Plan read right before the DELETE.
 * @param {DataStreamDeleteClients} clients Native DELETE and readers.
 * @param {DataStreamDeleteOptions} options Cascade, input guard and read bounds.
 * @returns {Promise<object>} Confirmed deletion.
 */
async function deleteUnmodelledDataStream(
  plan: DataStreamDeletePlan | UnmodelledDataStreamDeletePlan,
  fresh: DataStreamDeletePlan | UnmodelledDataStreamDeletePlan,
  clients: DataStreamDeleteClients,
  options: DataStreamDeleteOptions,
): Promise<{ operation: 'delete'; targetApiName: string; targetDloName: string }> {
  if (!('unmodelled' in plan) || !isDeepStrictEqual(plan, fresh))
    throw explainMismatch(
      new DataStreamError('STREAM_DELETE_GUARD_DRIFT'),
      'delete pre-dispatch guard recheck',
      plan.apiName,
      plan,
      fresh,
    );
  await options.verifyInput();
  const now = options.now ?? Date.now;
  const pause = options.wait ?? wait;
  const deadline = now() + 15 * 60 * 1000;
  const dloName = plan.dlo.name as string;
  await clients.streams.delete(plan.recordId, plan.deleteDlo);
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    let absent = false;
    try {
      const current = object(await clients.streams.get(plan.apiName));
      if (current.name !== plan.apiName || current.recordId !== plan.recordId)
        throw new DataStreamError('STREAM_DELETE_GUARD_DRIFT');
    } catch (error) {
      if (!isStreamNotFound(error)) throw error;
      absent = true;
    }
    // With --delete-dlo the DLO can still read for a while after its stream answers 404.
    if (absent && (!plan.deleteDlo || (await streamDloAbsent(dloName, clients)))) {
      if (!plan.deleteDlo) {
        const released = streamDeleteDependencies(await clients.dependencies.dlo(dloName));
        if (released.totalSize !== 0)
          throw new DataStreamError('STREAM_DELETE_DEPENDENCIES_BLOCKED');
      }
      await options.verifyInput();
      return { operation: 'delete', targetApiName: plan.apiName, targetDloName: dloName };
    }
    if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
  }
  throw new DataStreamError('STREAM_DELETE_SETTLEMENT_UNCONFIRMED');
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
    dataSpace: options.dataSpace ?? 'default',
  });
  await options.verifyInput();
  const plan = await preflightNativeDataStreamDelete(apiName, clients, selection);
  await options.verifyInput();
  const fresh = await preflightNativeDataStreamDelete(apiName, clients, selection);
  if ('unmodelled' in plan || 'unmodelled' in fresh)
    return deleteUnmodelledDataStream(plan, fresh, clients, options);
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
  const streamId = plan.binding.target!.recordId as string;
  await clients.streams.delete(streamId, selection.deleteDlo);
  for (let attempt = 0; attempt < 20 && now() < deadline; attempt++) {
    const next = async (): Promise<void> => {
      if (attempt < 19 && now() < deadline) await pause(Math.min(5000, deadline - now()));
    };
    // While the stream still reads (any status, e.g. DELETING) its deletion is running: wait.
    if (!(await deletedStreamAbsent(apiName, streamId, clients))) {
      await next();
      continue;
    }
    let binding: DataStreamBinding;
    try {
      binding = await resolveDataStreamBinding(
        {
          ...plan.document.identity,
          connectionName: plan.binding.connectionName,
          event: plan.binding.event,
          primaryKey: plan.document.spec.newDlo.primaryKey.name,
        },
        clients,
      );
    } catch (error) {
      // After its 404 the list can still name the stream, list and detail can disagree, the
      // list's total can still count it (INCOMPLETE_STREAM_LIST, seen live after a successful
      // --delete-dlo delete) and the event can still be In Use for a while: pending, never drift
      // of the deleted stream. The DELETE is never sent again.
      if (
        !isStreamNotFound(error) &&
        !(
          error instanceof DataStreamError &&
          [
            'INCOMPLETE_STREAM_LIST',
            'STREAM_BINDING_DRIFT',
            'STREAM_SNAPSHOT_PENDING',
            'STREAM_TARGET_MISMATCH',
            'UNSUPPORTED_STREAM_READ',
          ].includes(error.code)
        )
      )
        throw error;
      await next();
      continue;
    }
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
    if (!binding.target && binding.inventory.length === 0 && binding.availability === 'Available') {
      let settled = true;
      if (selection.deleteDlo) {
        // The DLO can still read (e.g. DELETING) after its stream answers 404: pending.
        settled =
          (await streamDloAbsent(plan.dlo.name as string, clients)) &&
          (await streamDloAbsent(plan.dlo.id as string, clients));
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
      if (settled) {
        await options.verifyInput();
        if (now() >= deadline) break;
        return {
          operation: 'delete',
          targetApiName: apiName,
          targetDloName: plan.dlo.name as string,
        };
      }
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
    await next();
  }
  throw new DataStreamError('STREAM_DELETE_SETTLEMENT_UNCONFIRMED');
}
