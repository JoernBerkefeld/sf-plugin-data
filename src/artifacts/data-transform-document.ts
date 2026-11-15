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
 * Admit the native transform input as authored: inert JSON, an exact name, exactly one of
 * `definition` / `definitions` and the default data space. Salesforce validates the rest.
 * @param {unknown} value Complete native input.
 * @returns {Record<string, unknown>} Detached input, sent as written.
 */
export function buildDataTransformInput(value: unknown): Record<string, unknown> {
  inert(value);
  const input = record(value);
  requireTransform(typeof input.name === 'string' && dataTransformName.test(input.name));
  requireTransform(Object.hasOwn(input, 'definition') !== Object.hasOwn(input, 'definitions'));
  requireTransform(input.dataSpaceName === 'default');
  return structuredClone(input);
}

/**
 * Validate the portable input-only native API68 artifact.
 * @param {unknown} value Portable candidate.
 * @returns {DataTransformDocument} Detached checked document.
 */
export function validateDataTransformDocument(value: unknown): DataTransformDocument {
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
    definition: buildDataTransformInput(document.definition),
  };
}

/**
 * Produce stable portable bytes independent of response property ordering.
 * @param {unknown} value Checked artifact candidate.
 * @returns {string} Deterministic JSON with final LF.
 */
export function serializeDataTransformDocument(value: unknown): string {
  const document = validateDataTransformDocument(value);
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
 * definitions without schedule and output objects without server-owned keys.
 * @param {unknown} value Native item response.
 * @param {unknown} scheduleValue Independently read native schedule, kept as an observation.
 * @returns {DataTransformObservation} Portable input plus detached read-only observations.
 */
export function observeDataTransform(
  value: unknown,
  scheduleValue: unknown,
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
  for (const key of inputKeys) {
    if (!Object.hasOwn(runtime, key)) continue;
    const entry = runtime[key];
    projected[key] =
      key === 'definition'
        ? projectDefinition(entry)
        : key === 'definitions' && Array.isArray(entry)
          ? entry.map((item) => projectDefinition(item))
          : structuredClone(entry);
  }
  return {
    document: {
      schemaVersion: 1,
      kind: 'data-transform',
      apiVersion: '68.0',
      definition: buildDataTransformInput(projected),
    },
    targetId: runtime.id as string,
    runtime: structuredClone(runtime),
    schedule: structuredClone(schedule),
  };
}
