import { dataTransformName } from './path-selector.js';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import { foldEnums } from './enum-case.js';
import type { DocumentMode } from './verbatim-document.js';
import { dataSpaceKey, isDataSpaceName, readSingleDataSpace } from './data-space-field.js';

/**
 * A transform file: Salesforce's create/update input in `definition`, kept as read. Its data space
 * is the top-level `c__dataSpace`. When the input names `dataSpaceName` (sent as written), the two
 * must agree; a transform whose GET names none (one built on DLOs, or with `definitions`) takes
 * its data space from the org's MktDataTransform record (SOQL), and one without any data space
 * there (a system transform) is handled in `default` only.
 */
export type DataTransformDocument = {
  schemaVersion: 1;
  kind: 'data-transform';
  apiVersion: '68.0';
  c__dataSpace: string;
  definition: Record<string, unknown>;
  /**
   * Desired schedule, sent with its own PUT. Absent leaves the org schedule alone;
   * `{ frequency: 'None' }` turns it off.
   */
  schedule?: Record<string, unknown>;
};
export type DataTransformObservation = {
  document: DataTransformDocument;
  targetId: string;
  runtime: Record<string, unknown>;
  schedule: Record<string, unknown>;
};

/** Payload-free refusal of a native data transform operation. */
export class DataTransformError extends Error {
  public constructor(public readonly code: string) {
    super(`Native Data Transform operation refused: ${code}.`);
    this.name = 'DataTransformError';
  }
}

export const dataTransformId = /^1dt[A-Za-z0-9]{15}$/u;

/** Top-level keys of the native create/update input, in the order a GET is projected. */
const inputKeys = [
  'name',
  'label',
  'description',
  'type',
  'dataSpaceName',
  'fullRunFrequency',
  'definition',
  'definitions',
  'parameters',
  'tags',
  'capabilities',
  'currencyIsoCode',
  'primarySource',
];
/**
 * Server-owned top-level keys of a GET (live API 68 GET, isolated-source 2026-11-15), plus every
 * `lastRun*` key; no create/update input takes them. Other keys outside `inputKeys` are kept on
 * retrieve, and deploy refuses them.
 */
const serverKeys = new Set([
  'actionUrls',
  'createdBy',
  'createdDate',
  'creationSource',
  'creationType',
  'id',
  'lastModifiedBy',
  'lastModifiedDate',
  'namespace',
  'status',
  'url',
]);
/** Server-owned keys of an `outputDataObjects` entry; the rest is sent as read. */
const outputServerKeys = ['id', 'createdDate', 'lastModifiedDate', 'status'];

/**
 * Reject a condition without retaining resource payloads in diagnostics.
 * @param {unknown} condition Admission condition.
 * @param {string} code Stable refusal code.
 */
function requireTransform(
  condition: unknown,
  code = 'UNSUPPORTED_TRANSFORM_INPUT',
): asserts condition {
  if (!condition) throw new DataTransformError(code);
}

/**
 * Require inert JSON before reading properties or cloning untrusted values.
 * @param {unknown} value JSON candidate.
 * @param {Set<object>} ancestors Active recursion stack.
 */
function inert(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    requireTransform(Number.isFinite(value));
    return;
  }
  requireTransform(value && typeof value === 'object' && !ancestors.has(value));
  requireTransform(
    Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype),
  );
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) requireTransform(keys.length === value.length + 1);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    requireTransform(typeof key === 'string');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireTransform(descriptor?.enumerable && 'value' in descriptor);
    inert(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

/**
 * Check an exact object key inventory after inert JSON admission.
 * @param {unknown} value Candidate record.
 * @param {string[]} [keys] Exact accepted properties.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, keys?: string[]): Record<string, unknown> {
  requireTransform(value && typeof value === 'object' && !Array.isArray(value));
  if (keys)
    requireTransform(
      Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    );
  return value as Record<string, unknown>;
}

/**
 * Refuse a transform file, naming the key path that cannot be deployed.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {DataTransformError} UNSUPPORTED_TRANSFORM_INPUT with an explanation.
 */
function refuseKey(keyPath: string, problem: string): DataTransformError {
  return explainInput(
    new DataTransformError('UNSUPPORTED_TRANSFORM_INPUT'),
    `The data transform file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the transform again once the plugin supports it.`,
  );
}

/**
 * The data space a transform input names itself (`dataSpaceName`), or undefined when it names
 * none (its data space then comes from the org's MktDataTransform record).
 * @param {Record<string, unknown>} input Admitted transform input.
 * @returns {string | undefined} Data space.
 */
export function dataTransformSpace(input: Record<string, unknown>): string | undefined {
  return typeof input.dataSpaceName === 'string' ? input.dataSpaceName : undefined;
}

/**
 * The refusal of a transform file whose `c__dataSpace` is not the run's data space.
 * @param {string} name Transform name.
 * @param {string} fileSpace The file's c__dataSpace.
 * @param {string} dataSpace The run's data space.
 * @returns {DataTransformError} TRANSFORM_DATASPACE_MISMATCH with an explanation.
 */
export function dataTransformSpaceMismatch(
  name: string,
  fileSpace: string,
  dataSpace: string,
): DataTransformError {
  return explainInput(
    new DataTransformError('TRANSFORM_DATASPACE_MISMATCH'),
    `Data transform ${name} is in the data space ${printableKey(fileSpace)} (${dataSpaceKey}, or the org's transform; one without any data space is handled in default), but the run's data space is ${printableKey(dataSpace)}. Run the command with --dataspace ${printableKey(fileSpace)}.`,
  );
}

/**
 * Admit the native transform input as authored: inert JSON, an exact name, exactly one of
 * `definition` / `definitions`, only create/update input keys and, when `dataSpaceName` is
 * present, a data space name. Salesforce validates the rest. Retrieve mode keeps keys the
 * input does not take; deploy then refuses them, naming the key.
 * @param {unknown} value Complete native input.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {Record<string, unknown>} Detached input, sent as written.
 */
export function buildDataTransformInput(
  value: unknown,
  mode: DocumentMode = 'deploy',
): Record<string, unknown> {
  inert(value);
  const input = record(value);
  requireTransform(typeof input.name === 'string' && dataTransformName.test(input.name));
  if (Object.hasOwn(input, 'definition') && Object.hasOwn(input, 'definitions'))
    throw refuseKey('definition.definitions', 'is present beside definition.definition');
  requireTransform(Object.hasOwn(input, 'definition') || Object.hasOwn(input, 'definitions'));
  if (mode === 'deploy')
    for (const key of Object.keys(input))
      if (!inputKeys.includes(key))
        throw refuseKey(
          `definition.${printableKey(key)}`,
          'is not a key the data transform create/update input takes',
        );
  // A transform on DLOs has no dataSpaceName; one on DMOs names its data space.
  requireTransform(!Object.hasOwn(input, 'dataSpaceName') || isDataSpaceName(input.dataSpaceName));
  return structuredClone(input);
}

/**
 * Refuse a transform file problem, naming the key.
 * @param {string} code Refusal code.
 * @param {string} keyPath Key path.
 * @param {string} problem What is wrong with it.
 * @returns {DataTransformError} Refusal with an explanation.
 */
function refuseFile(code: string, keyPath: string, problem: string): DataTransformError {
  return explainInput(
    new DataTransformError(code),
    `The data transform file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the transform again.`,
  );
}

/**
 * Validate the portable input-only native API68 artifact. Its `c__dataSpace` must equal
 * `definition.dataSpaceName` when the definition names one.
 * @param {unknown} value Portable candidate.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown input keys).
 * @returns {DataTransformDocument} Detached checked document.
 */
export function validateDataTransformDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): DataTransformDocument {
  inert(value);
  const scheduled = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'schedule'));
  const dataSpace = readSingleDataSpace(record(value), refuseFile);
  const document = record(
    value,
    scheduled
      ? ['schemaVersion', 'kind', 'apiVersion', dataSpaceKey, 'definition', 'schedule']
      : ['schemaVersion', 'kind', 'apiVersion', dataSpaceKey, 'definition'],
  );
  requireTransform(
    document.schemaVersion === 1 &&
      document.kind === 'data-transform' &&
      document.apiVersion === '68.0',
  );
  if (
    scheduled &&
    (!document.schedule ||
      typeof document.schedule !== 'object' ||
      Array.isArray(document.schedule))
  )
    throw refuseKey('schedule', 'is not an object');
  const definition = buildDataTransformInput(document.definition, mode);
  const named = dataTransformSpace(definition);
  if (named !== undefined && named !== dataSpace)
    throw refuseFile(
      'INVALID_DATASPACE_FIELD',
      dataSpaceKey,
      'must name the data space of definition.dataSpaceName',
    );
  return {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    c__dataSpace: dataSpace,
    definition,
    ...(scheduled
      ? { schedule: structuredClone(document.schedule as Record<string, unknown>) }
      : {}),
  };
}

/**
 * Sort object keys recursively, so equal JSON compares equal whatever the property order.
 * @param {unknown} entry JSON value.
 * @returns {unknown} Detached value with sorted keys.
 */
function canonical(entry: unknown): unknown {
  if (Array.isArray(entry)) return entry.map((child) => canonical(child));
  if (entry && typeof entry === 'object') {
    const entries = Object.entries(entry);

    entries.sort(([left], [right]) => left.localeCompare(right, 'en'));
    return Object.fromEntries(entries.map(([key, child]) => [key, canonical(child)]));
  }
  return entry;
}

/**
 * Produce stable portable bytes independent of response property ordering.
 * @param {unknown} value Checked artifact candidate.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown input keys).
 * @returns {string} Deterministic JSON with final LF.
 */
export function serializeDataTransformDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): string {
  const document = validateDataTransformDocument(value, mode);
  // eslint-disable-next-line unicorn/no-null -- JSON indentation requires a null replacer, not a field policy.
  return `${JSON.stringify(canonical(document), null, 2)}\n`;
}

/**
 * Transform keys whose values are enums Salesforce stores in its own letter case
 * (`fullRunFrequency` `Weekly` reads `WEEKLY`, live API 68): the transform, definition, output
 * object and field `type`, the output `category` and an output node's `writeMode`.
 */
const transformEnumKeys: ReadonlySet<string> = new Set([
  'category',
  'fullRunFrequency',
  'type',
  'writeMode',
]);

/**
 * The schedule of a transform that does not run on a schedule. Retrieve leaves the key out for
 * it; a file states it explicitly to turn a schedule off.
 */
export const unscheduled: Readonly<Record<string, unknown>> = Object.freeze({ frequency: 'None' });

/** Schedule keys whose values Salesforce may store in its own letter case. */
const scheduleEnumKeys: ReadonlySet<string> = new Set(['frequency']);

/**
 * Whether the org transform already holds the definition of the file: the same canonical input,
 * with enum values compared ignoring letter case. Names, labels, SQL and other text compare
 * exactly. The schedule is not compared.
 * @param {DataTransformDocument} current Org document as projected.
 * @param {DataTransformDocument} desired Document from the file.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown input keys).
 * @returns {boolean} True when the definition would not change.
 */
export function sameDataTransformDefinition(
  current: DataTransformDocument,
  desired: DataTransformDocument,
  mode: DocumentMode = 'deploy',
): boolean {
  const comparable = (document: DataTransformDocument): string =>
    serializeDataTransformDocument(
      {
        schemaVersion: 1,
        kind: 'data-transform',
        apiVersion: '68.0',
        c__dataSpace: document.c__dataSpace,
        definition: foldEnums(document.definition, transformEnumKeys),
      },
      mode,
    );
  return comparable(current) === comparable(desired);
}

/**
 * A schedule without the write-only `shouldForceSpecifiedMinutes` (a schedule PUT takes it; the
 * GET never returns it, live API 68), at the top level and in each per-definition entry.
 * @param {unknown} schedule Schedule or part of one.
 * @returns {unknown} Detached copy without the key.
 */
function withoutWriteOnly(schedule: unknown): unknown {
  if (Array.isArray(schedule)) return schedule.map((entry) => withoutWriteOnly(entry));
  if (!schedule || typeof schedule !== 'object') return schedule;
  return Object.fromEntries(
    Object.entries(schedule)
      .filter(([key]) => key !== 'shouldForceSpecifiedMinutes')
      .map(([key, entry]) => [key, withoutWriteOnly(entry)]),
  );
}

/**
 * Whether the org schedule (as retrieve projects it) equals the schedule of the file; the
 * frequency is compared ignoring letter case, the write-only `shouldForceSpecifiedMinutes` is not
 * compared, everything else exactly.
 * @param {Record<string, unknown> | undefined} current Projected org schedule; none is unscheduled.
 * @param {Record<string, unknown>} desired Schedule from the file.
 * @returns {boolean} True when the schedule would not change.
 */
export function sameDataTransformSchedule(
  current: Record<string, unknown> | undefined,
  desired: Record<string, unknown>,
): boolean {
  const comparable = (schedule: Record<string, unknown>): string =>
    JSON.stringify(canonical(foldEnums(withoutWriteOnly(schedule), scheduleEnumKeys)));
  return comparable(current ?? unscheduled) === comparable(desired);
}

/**
 * Whether the org transform already holds the file: the same definition and, when the file has
 * a schedule, the same schedule. A file without a schedule leaves the schedule alone.
 * @param {DataTransformDocument} current Org document as projected.
 * @param {DataTransformDocument} desired Document from the file.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown input keys).
 * @returns {boolean} True when nothing would change.
 */
export function sameDataTransformDocument(
  current: DataTransformDocument,
  desired: DataTransformDocument,
  mode: DocumentMode = 'deploy',
): boolean {
  return (
    sameDataTransformDefinition(current, desired, mode) &&
    (desired.schedule === undefined ||
      sameDataTransformSchedule(current.schedule, desired.schedule))
  );
}

/**
 * Project a schedule GET onto the keys the schedule PUT takes (live API 68, 2026-11-18):
 * `frequency`, `interval`, `daysOfWeek`, `shouldForceSpecifiedMinutes` and `time` with
 * `hour`, `minute` and `timeZone` (the GET's `time.timezone.zoneId`); the server-set
 * `nextScheduledDate` and `type` are left out. A transform without a schedule (`frequency`
 * `None`, or an empty `schedule` object) gives no schedule, so retrieve leaves the key out and
 * a deploy of that file leaves the schedule alone. The per-definition
 * `schedule` map of a system transform keeps its map, each entry projected the same way and the
 * outer `type` left out; Salesforce refuses a schedule PUT on a system transform (403). Any other
 * shape is kept as read. An empty answer (a schedule read that failed on retrieve) gives no
 * schedule.
 * @param {Record<string, unknown>} raw Schedule GET.
 * @returns {Record<string, unknown> | undefined} Projected schedule, or undefined for none read.
 */
export function projectDataTransformSchedule(
  raw: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const object = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (typeof raw.frequency === 'string') {
    if (raw.frequency.toLowerCase() === 'none') return undefined;
    const projected: Record<string, unknown> = { frequency: raw.frequency };
    for (const key of ['interval', 'daysOfWeek', 'shouldForceSpecifiedMinutes'])
      if (raw[key] !== undefined && raw[key] !== null) projected[key] = structuredClone(raw[key]);
    if (object(raw.time)) {
      const time: Record<string, unknown> = {};
      for (const key of ['hour', 'minute'])
        if (raw.time[key] !== undefined && raw.time[key] !== null) time[key] = raw.time[key];
      const zone = object(raw.time.timezone) ? raw.time.timezone.zoneId : raw.time.timeZone;
      if (zone !== undefined && zone !== null) time.timeZone = zone;
      projected.time = time;
    }
    return projected;
  }
  if (Object.keys(raw).length === 0) return undefined;
  if (
    object(raw.schedule) &&
    Object.keys(raw).every((key) => key === 'schedule' || key === 'type')
  ) {
    const entries = Object.entries(raw.schedule);
    if (entries.length === 0) return undefined;
    // A system transform: one schedule per definition, each projected the same way.
    if (entries.every(([, entry]) => object(entry) && typeof entry.frequency === 'string'))
      return {
        schedule: Object.fromEntries(
          entries.map(([key, entry]) => [
            key,
            projectDataTransformSchedule(entry as Record<string, unknown>),
          ]),
        ),
      };
  }
  return structuredClone(raw);
}

/**
 * Project one `definition` or `definitions[]` entry as read: without its schedule (a PUT ignores
 * it; the schedule has its own route) and without the server-owned keys of each output object.
 * Everything else is kept.
 * @param {unknown} definition Entry from a GET.
 * @returns {unknown} Detached projected entry.
 */
function projectDefinition(definition: unknown): unknown {
  const projected = structuredClone(definition);
  if (!projected || typeof projected !== 'object' || Array.isArray(projected)) return projected;
  const entry = projected as Record<string, unknown>;
  delete entry.schedule;
  if (Array.isArray(entry.outputDataObjects))
    for (const output of entry.outputDataObjects as unknown[])
      if (output && typeof output === 'object' && !Array.isArray(output))
        for (const key of outputServerKeys) delete (output as Record<string, unknown>)[key];
  return entry;
}

/**
 * Admit a transform GET of any owner (custom, system or packaged; Salesforce decides about
 * writes) and project its native input: the input keys present, definitions without schedule and
 * output objects without server-owned keys, plus the schedule as projected from its own GET.
 * Retrieve mode also keeps keys that are neither input nor server-owned, and leaves out a `null`
 * `definition` or `definitions` beside the other one.
 * @param {unknown} value Native item response.
 * @param {unknown} scheduleValue Independently read native schedule; also kept as read.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @param {string} [dataSpace] The transform's resolved data space (from `dataSpaceName`, or the
 * org's MktDataTransform record); required when the GET names none.
 * @returns {DataTransformObservation} Portable input plus detached read-only observations.
 */
export function observeDataTransform(
  value: unknown,
  scheduleValue: unknown,
  mode: DocumentMode = 'deploy',
  dataSpace?: string,
): DataTransformObservation {
  inert(value);
  inert(scheduleValue);
  const runtime = record(value);
  const schedule = record(scheduleValue);
  requireTransform(
    typeof runtime.id === 'string' && dataTransformId.test(runtime.id),
    'INVALID_TRANSFORM_RESPONSE',
  );
  const projected: Record<string, unknown> = {};
  // On retrieve, a null definition or definitions beside the other one is the unused one.
  const unused = (key: string): boolean =>
    mode === 'retrieve' &&
    (key === 'definition' || key === 'definitions') &&
    runtime[key] === null &&
    Object.hasOwn(runtime, key === 'definition' ? 'definitions' : 'definition');
  for (const key of inputKeys) {
    if (!Object.hasOwn(runtime, key) || unused(key)) continue;
    const entry = runtime[key];
    projected[key] =
      key === 'definition'
        ? projectDefinition(entry)
        : key === 'definitions' && Array.isArray(entry)
          ? entry.map((item) => projectDefinition(item))
          : structuredClone(entry);
  }
  if (mode === 'retrieve')
    for (const key of Object.keys(runtime))
      if (!inputKeys.includes(key) && !serverKeys.has(key) && !key.startsWith('lastRun'))
        projected[key] = structuredClone(runtime[key]);
  const projectedSchedule = projectDataTransformSchedule(schedule);
  const definition = buildDataTransformInput(projected, mode);
  const space = dataTransformSpace(definition) ?? dataSpace;
  requireTransform(space !== undefined, 'INVALID_TRANSFORM_RESPONSE');
  // A resolved data space that differs from the one the GET names is not this transform.
  requireTransform(dataSpace === undefined || dataSpace === space, 'INVALID_TRANSFORM_RESPONSE');
  return {
    document: {
      schemaVersion: 1,
      kind: 'data-transform',
      apiVersion: '68.0',
      c__dataSpace: space,
      definition,
      ...(projectedSchedule === undefined ? {} : { schedule: projectedSchedule }),
    },
    targetId: runtime.id as string,
    runtime: structuredClone(runtime),
    schedule: structuredClone(schedule),
  };
}

export { dataTransformName } from './path-selector.js';
