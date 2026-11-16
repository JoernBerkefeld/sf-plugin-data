import { explainInput, printableKey } from '../services/operation-diagnostic.js';
import { foldEnums } from './enum-case.js';
import type { DocumentMode } from './verbatim-document.js';

export type DataTransformDocument = {
  schemaVersion: 1;
  kind: 'data-transform';
  apiVersion: '68.0';
  definition: Record<string, unknown>;
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

export const dataTransformName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
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
 * Admit the native transform input as authored: inert JSON, an exact name, exactly one of
 * `definition` / `definitions`, only create/update input keys and, when `dataSpaceName` is
 * present, the default data space. Salesforce validates the rest. Retrieve mode keeps keys the
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
  // A transform on DLOs applies across data spaces and has no dataSpaceName; one that names a
  // data space must name the default one.
  requireTransform(!Object.hasOwn(input, 'dataSpaceName') || input.dataSpaceName === 'default');
  return structuredClone(input);
}

/**
 * Validate the portable input-only native API68 artifact.
 * @param {unknown} value Portable candidate.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown input keys).
 * @returns {DataTransformDocument} Detached checked document.
 */
export function validateDataTransformDocument(
  value: unknown,
  mode: DocumentMode = 'deploy',
): DataTransformDocument {
  inert(value);
  const document = record(value, ['schemaVersion', 'kind', 'apiVersion', 'definition']);
  requireTransform(
    document.schemaVersion === 1 &&
      document.kind === 'data-transform' &&
      document.apiVersion === '68.0',
  );
  return {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    definition: buildDataTransformInput(document.definition, mode),
  };
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
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map((child) => canonical(child));
    if (entry && typeof entry === 'object') {
      const entries = Object.entries(entry);

      entries.sort(([left], [right]) => left.localeCompare(right, 'en'));
      return Object.fromEntries(entries.map(([key, child]) => [key, canonical(child)]));
    }
    return entry;
  };
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
 * Whether the org transform already holds the file: the same canonical document, with enum
 * values compared ignoring letter case. Names, labels, SQL and other text compare exactly.
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
  const comparable = (document: DataTransformDocument): string =>
    serializeDataTransformDocument(
      { ...document, definition: foldEnums(document.definition, transformEnumKeys) },
      mode,
    );
  return comparable(current) === comparable(desired);
}

/**
 * Project one `definition` or `definitions[]` entry as read: without its schedule and without the
 * server-owned keys of each output object. Everything else is kept.
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
 * Admit a custom, unpackaged transform GET and project its native input: the input keys present,
 * definitions without schedule and output objects without server-owned keys. Retrieve mode also
 * keeps keys that are neither input nor server-owned, and leaves out a `null` `definition` or
 * `definitions` beside the other one.
 * @param {unknown} value Native item response.
 * @param {unknown} scheduleValue Independently read native schedule, kept as an observation.
 * @param {DocumentMode} [mode] `deploy` (strict) or `retrieve` (keeps unknown keys).
 * @returns {DataTransformObservation} Portable input plus detached read-only observations.
 */
export function observeDataTransform(
  value: unknown,
  scheduleValue: unknown,
  mode: DocumentMode = 'deploy',
): DataTransformObservation {
  inert(value);
  inert(scheduleValue);
  const runtime = record(value);
  const schedule = record(scheduleValue);
  requireTransform(
    runtime.creationType === 'CUSTOM' &&
      typeof runtime.id === 'string' &&
      dataTransformId.test(runtime.id),
    'UNSUPPORTED_TRANSFORM_OWNER_OR_STATE',
  );
  requireTransform(!runtime.namespace, 'UNSUPPORTED_TRANSFORM_VARIANT');
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
  return {
    document: {
      schemaVersion: 1,
      kind: 'data-transform',
      apiVersion: '68.0',
      definition: buildDataTransformInput(projected, mode),
    },
    targetId: runtime.id as string,
    runtime: structuredClone(runtime),
    schedule: structuredClone(schedule),
  };
}
