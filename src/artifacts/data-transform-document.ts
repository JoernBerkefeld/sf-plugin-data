import { isDeepStrictEqual } from 'node:util';
import { dloName } from './dlo-document.js';

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

/** Payload-free refusal for the qualified native authored BATCH subset. */
export class DataTransformError extends Error {
  public constructor(public readonly code: string) {
    super(`Native Data Transform operation refused: ${code}.`);
    this.name = 'DataTransformError';
  }
}

export const dataTransformName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
export const dataTransformId = /^1dt[A-Za-z0-9]{15}$/u;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,239}__c$/u;

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
 * Admit bounded display text without coercion.
 * @param {unknown} value Text candidate.
 * @param {boolean} empty Permit an empty description.
 */
function text(value: unknown, empty = false): void {
  requireTransform(
    typeof value === 'string' && value.length <= 1024 && (empty || value.trim().length > 0),
  );
}

/**
 * Validate only singular STL load-to-existing-DLO output with one field mapping.
 * Request version 56.0 is canonical; response normalization to 68.0 is not authored input.
 * @param {unknown} value Complete native input, never a GET response.
 * @returns {Record<string, unknown>} Detached operation-appropriate input.
 */
export function buildDataTransformInput(value: unknown): Record<string, unknown> {
  inert(value);
  const input = record(value, [
    'name',
    'label',
    'description',
    'type',
    'dataSpaceName',
    'definition',
  ]);
  requireTransform(typeof input.name === 'string' && dataTransformName.test(input.name));
  text(input.label);
  text(input.description, true);
  requireTransform(input.type === 'BATCH' && input.dataSpaceName === 'default');
  const definition = record(input.definition, ['type', 'version', 'nodes']);
  requireTransform(definition.type === 'STL' && definition.version === '56.0');
  const nodes = record(definition.nodes);
  const names = Object.keys(nodes);
  requireTransform(names.length === 2 && names.every((name) => dataTransformName.test(name)));
  const loadNames = names.filter((name) => record(nodes[name]).action === 'load');
  const outputNames = names.filter((name) => record(nodes[name]).action === 'outputD360');
  requireTransform(loadNames.length === 1 && outputNames.length === 1);
  const load = record(nodes[loadNames[0]], ['action', 'parameters', 'sources']);
  const output = record(nodes[outputNames[0]], ['action', 'parameters', 'sources']);
  requireTransform(
    isDeepStrictEqual(load.sources, []) && isDeepStrictEqual(output.sources, loadNames),
  );
  const source = record(load.parameters, ['dataset', 'fields', 'sampleDetails']);
  const dataset = record(source.dataset, ['name', 'type']);
  requireTransform(
    typeof dataset.name === 'string' &&
      dloName.test(dataset.name) &&
      dataset.type === 'dataLakeObject',
  );
  requireTransform(
    Array.isArray(source.fields) &&
      source.fields.length === 1 &&
      typeof source.fields[0] === 'string' &&
      fieldName.test(source.fields[0]),
  );
  requireTransform(isDeepStrictEqual(source.sampleDetails, { sortBy: [], type: 'TopN' }));
  const destination = record(output.parameters, ['name', 'type', 'fieldsMappings']);
  requireTransform(
    typeof destination.name === 'string' &&
      dloName.test(destination.name) &&
      destination.name !== dataset.name &&
      destination.type === 'dataLakeObject',
  );
  requireTransform(
    Array.isArray(destination.fieldsMappings) && destination.fieldsMappings.length === 1,
  );
  const mapping = record(destination.fieldsMappings[0], ['sourceField', 'targetField']);
  requireTransform(
    mapping.sourceField === source.fields[0] &&
      typeof mapping.targetField === 'string' &&
      fieldName.test(mapping.targetField),
  );
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
 * Project only the qualified GET defaults; retain the full raw observation separately.
 * Unknown nested logic/defaults, generated owners and schedules never become sendable input.
 * @param {unknown} value Native item response.
 * @param {unknown} scheduleValue Independently read native schedule.
 * @param {boolean} [allowProcessing] Admit an acknowledged definition still settling after a write.
 * @returns {DataTransformObservation} Portable input plus detached read-only observations.
 */
export function observeDataTransform(
  value: unknown,
  scheduleValue: unknown,
  allowProcessing = false,
): DataTransformObservation {
  inert(value);
  inert(scheduleValue);
  const runtime = record(value);
  const schedule = record(scheduleValue, ['frequency', 'nextScheduledDate', 'time', 'type']);
  requireTransform(
    isDeepStrictEqual(
      schedule,
      JSON.parse('{"frequency":"None","nextScheduledDate":null,"time":null,"type":"None"}'),
    ),
    'UNSUPPORTED_TRANSFORM_SCHEDULE',
  );
  requireTransform(
    runtime.creationType === 'CUSTOM' &&
      runtime.type === 'BATCH' &&
      runtime.dataSpaceName === 'default' &&
      (runtime.status === 'ACTIVE' || (allowProcessing && runtime.status === 'PROCESSING')) &&
      typeof runtime.id === 'string' &&
      dataTransformId.test(runtime.id),
    'UNSUPPORTED_TRANSFORM_OWNER_OR_STATE',
  );
  requireTransform(
    !Object.hasOwn(runtime, 'definitions') &&
      !Object.hasOwn(runtime, 'schedule') &&
      !Object.hasOwn(runtime, 'schedules') &&
      !runtime.namespace,
    'UNSUPPORTED_TRANSFORM_VARIANT',
  );
  requireTransform(runtime.fullRunFrequency === 'DAILY', 'UNSUPPORTED_TRANSFORM_FREQUENCY');
  const definition = structuredClone(record(runtime.definition));
  requireTransform(definition.version === '68.0');
  for (const key of ['name', 'label', 'description']) {
    requireTransform(definition[key] === runtime[key]);
    delete definition[key];
  }
  requireTransform(
    !Object.hasOwn(definition, 'schedule') && !Object.hasOwn(definition, 'schedules'),
    'UNSUPPORTED_TRANSFORM_SCHEDULE',
  );
  const outputs = definition.outputDataObjects;
  requireTransform(Array.isArray(outputs) && outputs.length === 1);
  delete definition.outputDataObjects;
  definition.version = '56.0';
  const nodes = record(definition.nodes);
  for (const nodeValue of Object.values(nodes)) {
    const node = record(nodeValue);
    const parameters = record(node.parameters);
    if (node.action === 'load') {
      const sample = record(parameters.sampleDetails);
      requireTransform(sample.dataspace === 'default');
      delete sample.dataspace;
    } else if (node.action === 'outputD360') {
      requireTransform(
        isDeepStrictEqual(parameters.dedupOrder, []) && parameters.writeMode === 'OVERWRITE',
      );
      delete parameters.dedupOrder;
      delete parameters.writeMode;
      const output = record(outputs[0]);
      requireTransform(output.name === parameters.name && output.type === 'dataLakeObject');
    }
  }
  const input = buildDataTransformInput({
    name: runtime.name,
    label: runtime.label,
    description: runtime.description,
    type: runtime.type,
    dataSpaceName: runtime.dataSpaceName,
    definition,
  });
  return {
    document: { schemaVersion: 1, kind: 'data-transform', apiVersion: '68.0', definition: input },
    targetId: runtime.id as string,
    runtime: structuredClone(runtime),
    schedule: structuredClone(schedule),
  };
}
