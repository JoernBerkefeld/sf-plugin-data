import { isDeepStrictEqual } from 'node:util';
import { joinCodeFields, splitCodeFields } from './code-fields.js';
import type { CodeField, CodeFile } from './code-fields.js';
import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import type { DocumentMode } from './verbatim-document.js';

export type SegmentReference = {
  kind: 'dmo';
  dataSpace: 'default';
  apiName: string;
};

/**
 * The refresh schedule in its write shape: `frequency`, `interval`, `daysOfWeek` (a plain list),
 * `startDateTime`, `endDate`, `endDateTime`, `time` (`hour`, `minute`, `timeZone`), or an hourly
 * `publishInterval`. `{frequency: None}` turns the schedule off.
 */
export type SegmentSchedule = Record<string, unknown> & {
  frequency?: string;
  publishInterval?: string;
};

type SegmentSpecBase = {
  displayName: string;
  description: string;
  segmentOn: SegmentReference;
  /** Desired schedule. Absent leaves the org schedule alone. */
  schedule?: SegmentSchedule;
};

/** A SQL (DBT) segment: each SQL model lives in its own file. */
export type DbtSegmentSpec = SegmentSpecBase & {
  segmentType: 'DBT';
  models: Array<{ name: string; sql: string }>;
  lookbackPeriod: string;
};

/** A segment built in the segment canvas (`UI`): its criteria are a JSON object in the file. */
export type UiSegmentSpec = SegmentSpecBase & {
  segmentType: 'UI';
  includeCriteria: Record<string, unknown>;
  lookbackPeriod: string;
};

/** Any other segment type Salesforce reads (for example Waterfall or Dynamic), without criteria. */
export type OtherSegmentSpec = SegmentSpecBase & {
  segmentType: string;
  lookbackPeriod?: string;
};

export type SegmentDocument = {
  schemaVersion: 1;
  kind: 'segment';
  identity: { dataSpace: 'default'; apiName: string };
  spec: DbtSegmentSpec | UiSegmentSpec | OtherSegmentSpec;
};

/** Payload-free refusal of incomplete or unsupported Segment content. */
export class SegmentError extends Error {
  public constructor(public readonly code: string) {
    super('Segment configuration could not be admitted.');
    this.name = 'SegmentError';
  }
}

export const segmentName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
const dmoName = /^[A-Za-z][A-Za-z0-9_]*__dlm$/u;
// A model name is part of its SQL file name (`<Segment>.segment.<model>.sql`), as in code-fields.
const modelFileName = /^[A-Za-z0-9][A-Za-z0-9_]*$/u;
// Keys every file of a type holds; `schedule` (and the lookback of other types) may be absent.
const specKeys = [
  'displayName',
  'description',
  'segmentType',
  'segmentOn',
  'models',
  'lookbackPeriod',
];
const uiSpecKeys = [
  'displayName',
  'description',
  'segmentType',
  'segmentOn',
  'includeCriteria',
  'lookbackPeriod',
];
const otherSpecKeys = ['displayName', 'description', 'segmentType', 'segmentOn'];
const scheduleKeys = [
  'frequency',
  'interval',
  'daysOfWeek',
  'startDateTime',
  'time',
  'endDate',
  'endDateTime',
  'publishInterval',
];

/**
 * The schedule of a segment that does not refresh. Retrieve leaves the key out for it; a file
 * states it explicitly to turn a schedule off.
 */
export const unscheduledSegment: Readonly<SegmentSchedule> = Object.freeze({ frequency: 'None' });

/**
 * Stand-in for an org schedule the file cannot hold (deploy-mode reads only): it never equals a
 * file schedule, and a file without `schedule` leaves it alone.
 */
export const opaqueSegmentSchedule: Readonly<SegmentSchedule> = Object.freeze({
  frequency: '(a schedule the segment file cannot hold)',
});

/**
 * Refuse a segment file, naming the key path that cannot be deployed.
 * @param {string} code Stable refusal code.
 * @param {string} keyPath Printable key path.
 * @param {string} problem What is wrong with it.
 * @returns {SegmentError} Refusal with an explanation.
 */
function refuse(code: string, keyPath: string, problem: string): SegmentError {
  return explainInput(
    new SegmentError(code),
    `The segment file cannot be deployed: ${keyPath} ${problem}. Correct the file, or retrieve the segment again once the plugin supports it.`,
  );
}

/**
 * Admit a plain record with all of its required keys. A closed record also rejects every other
 * key outside `optional`, naming it; an open one keeps them.
 * @param {unknown} value Untrusted record.
 * @param {string[]} keys Required key set.
 * @param {string} keyPath Printable path of the record.
 * @param {boolean} open Whether keys outside `keys` and `optional` are kept.
 * @param {string[]} optional Keys a closed record may also hold.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(
  value: unknown,
  keys: string[],
  keyPath: string,
  open = false,
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is not an object');
  const result = value as Record<string, unknown>;
  const missing = keys.find((key) => !Object.hasOwn(result, key));
  if (missing !== undefined)
    throw refuse('UNKNOWN_SEGMENT_CONFIGURATION', `${keyPath}.${missing}`, 'is missing');
  const unknown = open
    ? undefined
    : Object.keys(result).find((key) => !keys.includes(key) && !optional.includes(key));
  if (unknown !== undefined)
    throw refuse(
      'UNKNOWN_SEGMENT_CONFIGURATION',
      `${keyPath}.${printableKey(unknown)}`,
      'is not a key a segment file can hold',
    );
  return result;
}

/**
 * Bound text without changing SQL bytes or inventing defaults. Retrieve keeps any string.
 * @param {unknown} value Untrusted string.
 * @param {string} keyPath Printable key path.
 * @param {DocumentMode} mode Check mode.
 * @param {boolean} empty Whether an empty string is meaningful.
 * @returns {string} Original text.
 */
function text(value: unknown, keyPath: string, mode: DocumentMode, empty = false): string {
  if (typeof value !== 'string') throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is not text');
  if (mode === 'retrieve') return value;
  if (!empty && value.length === 0) throw refuse('INVALID_SEGMENT_DOCUMENT', keyPath, 'is empty');
  if (
    value.length > 262_144 ||
    [...value].some(
      (character) => character.codePointAt(0)! < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    throw refuse(
      'INVALID_SEGMENT_DOCUMENT',
      keyPath,
      'is longer than 262144 characters or has control characters',
    );
  return value;
}

/**
 * Admit the optional schedule: an object with at least one write key, whose values are sent as
 * written (Salesforce decides about them). `frequency` and `publishInterval` are text.
 * `{frequency: None}` stands alone.
 * @param {unknown} value Untrusted schedule.
 * @param {DocumentMode} mode Check mode.
 * @returns {SegmentSchedule} Detached schedule.
 */
function scheduleOf(value: unknown, mode: DocumentMode): SegmentSchedule {
  const schedule = record(value, [], 'spec.schedule', mode === 'retrieve', scheduleKeys);
  if (Object.keys(schedule).length === 0)
    throw refuse('INVALID_SEGMENT_DOCUMENT', 'spec.schedule', 'holds no schedule key');
  const empty = Object.keys(schedule).find((key) => schedule[key] === null);
  if (empty !== undefined)
    throw refuse(
      'INVALID_SEGMENT_DOCUMENT',
      `spec.schedule.${printableKey(empty)}`,
      'is null; leave the key out to keep the org value, or turn the schedule off with {"frequency": "None"}',
    );
  for (const key of ['frequency', 'publishInterval'])
    if (Object.hasOwn(schedule, key)) text(schedule[key], `spec.schedule.${key}`, mode);
  if (isOff(schedule as SegmentSchedule) && Object.keys(schedule).length > 1)
    throw refuse(
      'INVALID_SEGMENT_DOCUMENT',
      'spec.schedule',
      'turns the schedule off (frequency None) and cannot hold other keys',
    );
  return structuredClone(schedule) as SegmentSchedule;
}

/**
 * Validate and detach an authored Segment/default definition (structure only). A DBT segment
 * holds SQL models, a UI segment (`segmentType: UI`) its `includeCriteria` as a JSON object, and
 * any other type neither; the lookback (any text; optional for other types) and the optional
 * schedule are sent as written and Salesforce decides about them. Retrieve mode keeps unknown
 * `spec`, schedule and model keys and lifts the text limits, but still refuses what the file
 * cannot represent: another source kind or data space, and a model name that cannot be a file
 * name or repeats one (ignoring case). Deploy refuses unknown keys and names the key path.
 * @param {unknown} value Untrusted authored document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {SegmentDocument} Independently admitted detached document.
 */
export function validateSegmentDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): SegmentDocument {
  const lenient = mode === 'retrieve';
  const root = record(value, ['schemaVersion', 'kind', 'identity', 'spec'], '[document]');
  const identity = record(root.identity, ['dataSpace', 'apiName'], 'identity');
  const type = (root.spec as Record<string, unknown> | null)?.segmentType;
  const keys = type === 'UI' ? uiSpecKeys : type === 'DBT' ? specKeys : otherSpecKeys;
  const spec = record(
    root.spec,
    keys,
    'spec',
    lenient,
    keys === otherSpecKeys ? ['lookbackPeriod', 'schedule'] : ['schedule'],
  );
  const on = record(spec.segmentOn, ['kind', 'dataSpace', 'apiName'], 'spec.segmentOn');
  if (root.schemaVersion !== 1 || root.kind !== 'segment')
    throw refuse('UNSUPPORTED_SEGMENT_VARIANT', 'kind', 'is not a schemaVersion 1 segment');
  if (
    identity.dataSpace !== 'default' ||
    !segmentName.test(text(identity.apiName, 'identity.apiName', mode))
  )
    throw refuse(
      'UNSUPPORTED_SEGMENT_VARIANT',
      'identity',
      'is not an API name in the default data space',
    );
  if (
    on.kind !== 'dmo' ||
    on.dataSpace !== 'default' ||
    !dmoName.test(text(on.apiName, 'spec.segmentOn.apiName', mode))
  )
    throw refuse(
      'UNSUPPORTED_SEGMENT_VARIANT',
      'spec.segmentOn',
      'is not a DMO (__dlm) in the default data space',
    );
  const segmentType = text(spec.segmentType, 'spec.segmentType', mode);
  text(spec.displayName, 'spec.displayName', mode);
  text(spec.description, 'spec.description', mode, true);
  const lookbackPeriod = Object.hasOwn(spec, 'lookbackPeriod')
    ? text(spec.lookbackPeriod, 'spec.lookbackPeriod', mode)
    : undefined;
  const schedule = Object.hasOwn(spec, 'schedule') ? scheduleOf(spec.schedule, mode) : undefined;
  let content: Record<string, unknown> = {};
  if (segmentType === 'UI') {
    const criteria = spec.includeCriteria;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria))
      throw refuse('INVALID_SEGMENT_DOCUMENT', 'spec.includeCriteria', 'is not an object');
    content = { includeCriteria: structuredClone(criteria) };
  } else if (segmentType === 'DBT') {
    // The models are sent as written; Salesforce decides about the SQL and the model names.
    if (!Array.isArray(spec.models))
      throw refuse('INVALID_SEGMENT_DOCUMENT', 'spec.models', 'is not a list');
    const names = new Set<string>();
    const models = spec.models.map((entry: unknown, index) => {
      const keyPath = `spec.models[${index}]`;
      const model = record(entry, ['name', 'sql'], keyPath, lenient);
      const name = text(model.name, `${keyPath}.name`, mode);
      const sql = text(model.sql, `${keyPath}.sql`, mode);
      if (!lenient) return { name, sql };
      // Retrieve writes each model's SQL to a file named by the model.
      if (!modelFileName.test(name) || names.has(name.toLowerCase()))
        throw refuse(
          'INVALID_SEGMENT_DOCUMENT',
          `${keyPath}.name`,
          'cannot be a SQL file name or repeats another model name',
        );
      names.add(name.toLowerCase());
      return { ...(structuredClone(model) as Record<string, unknown>), name, sql };
    });
    content = { models };
  }
  // Retrieve keeps the keys the plugin does not model after the known ones; deploy refused them.
  const extra = Object.fromEntries(
    Object.entries(spec)
      .filter(([key]) => !keys.includes(key) && !['lookbackPeriod', 'schedule'].includes(key))
      .map(([key, entry]) => [key, structuredClone(entry)]),
  );
  return {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: identity.apiName as string },
    spec: {
      displayName: spec.displayName as string,
      description: spec.description as string,
      segmentType,
      segmentOn: { kind: 'dmo', dataSpace: 'default', apiName: on.apiName as string },
      ...content,
      ...(lookbackPeriod === undefined ? {} : { lookbackPeriod }),
      ...(schedule ? { schedule } : {}),
      ...extra,
    } as SegmentDocument['spec'],
  };
}

/**
 * Whether a schedule turns refresh off (`frequency` None, in any letter case).
 * @param {SegmentSchedule} schedule Schedule.
 * @returns {boolean} Off.
 */
function isOff(schedule: SegmentSchedule): boolean {
  return (
    typeof schedule.frequency === 'string' &&
    schedule.frequency.toLowerCase() === unscheduledSegment.frequency!.toLowerCase()
  );
}

/**
 * One schedule value in comparable form: enum text folded to lower case, the interval as a
 * number and ISO timestamps normalised (`…T03:00:00Z` equals `…T03:00:00.000Z`).
 * @param {string} key Schedule key.
 * @param {unknown} value Value.
 * @returns {unknown} Comparable value.
 */
function comparableScheduleValue(key: string, value: unknown): unknown {
  if (['frequency', 'publishInterval'].includes(key) && typeof value === 'string')
    return value.toLowerCase();
  if (key === 'interval' && (typeof value === 'number' || typeof value === 'string'))
    return Number(value);
  if (['startDateTime', 'endDate', 'endDateTime'].includes(key) && typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? value : new Date(time).toISOString();
  }
  return value;
}

/**
 * Whether the org schedule (as projected; none is unscheduled) already holds the schedule of the
 * file. Only the keys the file states are compared: a key the file leaves out keeps its org
 * value, because a write without it keeps the stored value. Salesforce does not read the time
 * back, so a `time` the org does not show is not compared. A schedule the file cannot hold
 * (`opaqueSegmentSchedule`) never equals a file schedule.
 * @param {SegmentSchedule | undefined} current Projected org schedule.
 * @param {SegmentSchedule} desired Schedule of the file.
 * @returns {boolean} True when the schedule would not change.
 */
export function sameSegmentSchedule(
  current: SegmentSchedule | undefined,
  desired: SegmentSchedule,
): boolean {
  const found = current ?? unscheduledSegment;
  if (found.frequency === opaqueSegmentSchedule.frequency) return false;
  if (isOff(desired)) return isOff(found);
  if (isOff(found)) return false;
  return Object.entries(desired).every(
    ([key, value]) =>
      (key === 'time' && !Object.hasOwn(found, 'time')) ||
      (Object.hasOwn(found, key) &&
        isDeepStrictEqual(
          comparableScheduleValue(key, found[key]),
          comparableScheduleValue(key, value),
        )),
  );
}

/**
 * The schedule keys of a segment write. Create sends `publishSchedule: NoRefresh` unless the file
 * has a schedule; an update sends schedule keys only when `send` (the schedule changes). The
 * file keys go out in the write shape, each only when the file has it: `frequency`, `interval`,
 * `daysOfWeek` (wrapped) and `time` (as `timeInfo`) in `publishScheduleInfo`, `startDateTime`,
 * `endDate` and `endDateTime` as `publishScheduleStartDateTime`, `publishScheduleEndDate` and
 * `publishScheduleEndDateTime`, and an hourly `publishInterval` as `publishSchedule`. For
 * `{frequency: None}` the clearing body goes out, which Salesforce takes for UI segments (it
 * refuses every clearing body for DBT segments; that answer is reported).
 * @param {SegmentSchedule | undefined} schedule Schedule of the file.
 * @param {boolean} create Whether this is the create POST.
 * @param {boolean} send Whether an update sends the schedule.
 * @returns {Record<string, unknown>} Schedule keys of the body.
 */
function scheduleBody(
  schedule: SegmentSchedule | undefined,
  create: boolean,
  send: boolean,
): Record<string, unknown> {
  const off = !schedule || isOff(schedule);
  if (create && off) return { publishSchedule: 'NoRefresh' };
  if (!create && (!send || !schedule)) return {};
  if (off) {
    // eslint-disable-next-line unicorn/no-null -- Salesforce clears a schedule only with explicit JSON nulls.
    const cleared = null;
    return {
      publishSchedule: 'NoRefresh',
      publishScheduleInfo: cleared,
      publishScheduleStartDateTime: cleared,
      publishScheduleEndDate: cleared,
      publishScheduleEndDateTime: cleared,
    };
  }
  const has = (key: string): boolean => Object.hasOwn(schedule, key);
  const info = {
    ...(has('frequency') ? { frequency: schedule.frequency } : {}),
    ...(has('interval') ? { interval: schedule.interval } : {}),
    ...(has('daysOfWeek') ? { daysOfWeek: { daysOfWeek: schedule.daysOfWeek } } : {}),
    ...(has('time') ? { timeInfo: schedule.time } : {}),
  };
  return {
    ...(has('publishInterval') ? { publishSchedule: schedule.publishInterval } : {}),
    ...(Object.keys(info).length > 0 ? { publishScheduleInfo: info } : {}),
    ...(has('startDateTime') ? { publishScheduleStartDateTime: schedule.startDateTime } : {}),
    ...(has('endDate') ? { publishScheduleEndDate: schedule.endDate } : {}),
    ...(has('endDateTime') ? { publishScheduleEndDateTime: schedule.endDateTime } : {}),
  };
}

/**
 * The request body of a segment write, sent as written. Create names the segment
 * (`developerName`); a PATCH takes the full definition. A DBT segment sends its models
 * (`segmentType: Dbt`), a UI segment its criteria as a JSON string with
 * `segmentCreationFlow: Headless` (what lets the API write a UI segment at all), any other type
 * its type as read; the lookback goes along when the file has one.
 * @param {SegmentDocument} document Admitted segment.
 * @param {boolean} create Whether this is the create POST.
 * @param {boolean} [schedule] Whether an update sends the schedule (it changes).
 * @returns {Record<string, unknown>} Request body.
 */
export function segmentWriteBody(
  document: SegmentDocument,
  create: boolean,
  schedule = false,
): Record<string, unknown> {
  const spec = document.spec;
  const ui = spec.segmentType === 'UI';
  return {
    ...(create ? { developerName: document.identity.apiName } : {}),
    displayName: spec.displayName,
    description: spec.description,
    segmentOnApiName: spec.segmentOn.apiName,
    segmentType: spec.segmentType === 'DBT' ? 'Dbt' : spec.segmentType,
    ...(spec.segmentType === 'DBT'
      ? { includeDbt: { models: { models: (spec as DbtSegmentSpec).models } } }
      : {}),
    ...(ui ? { includeCriteria: JSON.stringify((spec as UiSegmentSpec).includeCriteria) } : {}),
    ...(spec.lookbackPeriod === undefined ? {} : { lookbackPeriod: spec.lookbackPeriod }),
    ...scheduleBody(spec.schedule, create, schedule),
    ...(ui ? { segmentCreationFlow: 'Headless' } : {}),
  };
}

/**
 * The notice for a schedule the write sends: a schedule copied from another org makes the
 * segment publish on it in this one. None when the schedule is absent, unchanged, or off on a
 * create (a new segment does not refresh).
 * @param {SegmentDocument} desired Admitted segment.
 * @param {SegmentDocument | undefined} current Projected org segment; none on create.
 * @returns {{code: string; message: string} | undefined} SEGMENT_SCHEDULE_CHANGE notice.
 */
export function segmentScheduleNotice(
  desired: SegmentDocument,
  current: SegmentDocument | undefined,
): { code: string; message: string } | undefined {
  const schedule = desired.spec.schedule;
  if (!schedule || sameSegmentSchedule(current?.spec.schedule, schedule)) return undefined;
  const name = String(schedule.frequency ?? schedule.publishInterval ?? 'as written');
  return {
    code: 'SEGMENT_SCHEDULE_CHANGE',
    message: isOff(schedule)
      ? desired.spec.segmentType === 'DBT'
        ? 'The schedule of the file turns the segment refresh schedule off; Salesforce refuses to clear the schedule of a DBT segment, so it answers the write with an error (only deleting the segment removes the schedule).'
        : 'The schedule of the file turns the segment refresh schedule off in this org.'
      : `The schedule of the file (${name}) replaces the segment refresh schedule in this org; the segment then publishes on it there.`,
  };
}

/**
 * Decode the HTML entities Salesforce puts into a UI segment's criteria string on read
 * (`&quot;` and the like); the write takes the plain JSON string.
 * @param {string} value Criteria string as returned.
 * @returns {string} Plain JSON text.
 */
export function decodeSegmentCriteria(value: string): string {
  const named: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
  return value.replaceAll(
    /&(?:(quot|amp|lt|gt|apos)|#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6}));/gu,
    (match, name?: string, decimal?: string, hex?: string) => {
      if (name) return named[name];
      const point = decimal ? Number(decimal) : Number.parseInt(hex!, 16);
      return point <= 0x10_ff_ff ? String.fromCodePoint(point) : match;
    },
  );
}

/** Every `spec.models[].sql` lives in its own `<Name>.segment.<model>.sql` file. */
export const segmentCodeFields: readonly CodeField[] = Object.freeze([
  { path: ['spec', 'models'], each: 'sql', key: 'name', extension: 'sql' },
]);

/**
 * The code fields of one segment: only a DBT segment has SQL files.
 * @param {unknown} value Segment document (complete or without its code).
 * @returns {readonly CodeField[]} Code fields.
 */
function codeFieldsOf(value: unknown): readonly CodeField[] {
  const spec = (value as { spec?: { segmentType?: unknown } } | null)?.spec;
  return spec?.segmentType === 'DBT' ? segmentCodeFields : [];
}

/**
 * The JSON text (admitted fields, stable key order, models without SQL) and one SQL file per model.
 * @param {unknown} value Complete authored document.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {{json: string; files: CodeFile[]}} JSON with LF terminator and the SQL files in model order.
 */
export function serializeSegmentFiles(
  value: unknown,
  mode: DocumentMode = 'deploy',
): { json: string; files: CodeFile[] } {
  const { document, files } = splitCodeFields(
    validateSegmentDocument(value, mode),
    codeFieldsOf(value),
    () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
  );
  return { json: `${JSON.stringify(document, undefined, 2)}\n`, files };
}

/**
 * Join a parsed segment JSON with its SQL files; a missing or extra SQL file, or SQL left in the
 * JSON, is INVALID_SEGMENT_DOCUMENT.
 * @param {unknown} value Parsed JSON file content.
 * @param {readonly CodeFile[]} files SQL file contents.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {SegmentDocument} Complete admitted document.
 */
export function joinSegmentFiles(
  value: unknown,
  files: readonly CodeFile[],
  mode: DocumentMode = 'deploy',
): SegmentDocument {
  return validateSegmentDocument(
    joinCodeFields(
      value,
      codeFieldsOf(value),
      files,
      () => new SegmentError('INVALID_SEGMENT_DOCUMENT'),
    ),
    mode,
  );
}

/** Keys Salesforce adds to each comparison (an object with `subject`) of UI criteria it stores. */
const serverCriteriaKeys = new Set([
  'selfReference',
  'subjectFieldBusinessType',
  'subjectFieldDataType',
  'subjectFieldSourceType',
]);

/**
 * Whether stored UI criteria equal the authored ones. Equal except that a comparison (an object
 * with `subject`) may carry the keys Salesforce adds to it; any other extra key differs.
 * @param {unknown} wanted Authored criteria value.
 * @param {unknown} found Stored criteria value.
 * @returns {boolean} Equal.
 */
function sameCriteria(wanted: unknown, found: unknown): boolean {
  if (Array.isArray(wanted))
    return (
      Array.isArray(found) &&
      wanted.length === found.length &&
      wanted.every((entry, index) => sameCriteria(entry, found[index]))
    );
  if (!wanted || typeof wanted !== 'object') return isDeepStrictEqual(wanted, found);
  if (!found || typeof found !== 'object' || Array.isArray(found)) return false;
  const stored = found as Record<string, unknown>;
  const added = Object.hasOwn(stored, 'subject');
  return (
    Object.keys(stored).every(
      (key) => Object.hasOwn(wanted, key) || (added && serverCriteriaKeys.has(key)),
    ) &&
    Object.entries(wanted).every(
      ([key, entry]) => Object.hasOwn(stored, key) && sameCriteria(entry, stored[key]),
    )
  );
}

/**
 * Whether a segment read from the org carries the desired definition: the one comparison that
 * preflight, execute and delete use. A UI segment's criteria match when they are equal except
 * for the keys Salesforce adds to each comparison it stores (`selfReference`, `subjectField*`
 * beside `subject`). A file without a schedule leaves the schedule out of the comparison; one
 * with a schedule compares it as `sameSegmentSchedule` does. Everything else must be equal.
 * @param {unknown} observed Projected candidate from a read or write response.
 * @param {SegmentDocument} desired Admitted requested definition.
 * @returns {boolean} Whether the org holds the desired definition.
 */
export function carriesDefinition(observed: unknown, desired: SegmentDocument): boolean {
  const other = observed as SegmentDocument | undefined;
  if (!other?.spec || typeof other.spec !== 'object') return false;
  const schedule = desired.spec.schedule;
  if (schedule !== undefined && !sameSegmentSchedule(other.spec.schedule, schedule)) return false;
  const ui = desired.spec.segmentType === 'UI';
  if (ui && other.spec.segmentType !== 'UI') return false;
  const rest = (document: SegmentDocument): unknown => ({
    ...document,
    spec: { ...document.spec, schedule: undefined, ...(ui ? { includeCriteria: undefined } : {}) },
  });
  return (
    isDeepStrictEqual(rest(other), rest(desired)) &&
    (!ui ||
      sameCriteria(
        (desired.spec as UiSegmentSpec).includeCriteria,
        (other.spec as UiSegmentSpec).includeCriteria,
      ))
  );
}
