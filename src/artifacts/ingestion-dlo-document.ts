import { isDeepStrictEqual } from 'node:util';

export type IngestionField = { name: string; label: string; dataType: 'Text' };
export type IngestionDloDocument = {
  schemaVersion: 1;
  kind: 'ingestion-dlo';
  identity: { dataSpace: 'default'; apiName: string };
  spec: {
    connectionName: string;
    event: { name: string; label: string; fields: IngestionField[] };
  };
};

/** Internal supplied intent only: not a portable document, wire payload or create authority. */
export type IngestionDloCreateIntent = {
  connectionName: string;
  event: IngestionDloDocument['spec']['event'];
  creation: {
    category: 'Other';
    dataSpace: 'default';
    dloName: string;
    dloLabel: string;
    streamName: string;
    streamLabel: string;
    primaryKey: IngestionField;
    refreshMode: 'UPSERT';
  };
};

/** Observed names are desired intent, never recovered requests or target ownership evidence. */
export type IngestionDloObservedCreateIntent = {
  namingProvenance: 'observed-runtime';
  intent: IngestionDloCreateIntent;
};

/** Payload-free refusal of unsupported source authority or configuration. */
export class IngestionDloError extends Error {
  public constructor(public readonly code = 'UNSUPPORTED_INGESTION_DLO') {
    super('Ingestion DLO configuration or source authority is unqualified.');
    this.name = 'IngestionDloError';
  }
}

/**
 * Require a bounded invariant without retaining remote data.
 * @param {unknown} condition Required invariant.
 * @param {string} [code] Diagnostic.
 */
export function ingestionRequire(condition: unknown, code?: string): asserts condition {
  if (!condition) throw new IngestionDloError(code);
}

/**
 * Admit inert bounded JSON before accessing values.
 * @param {unknown} value Candidate.
 * @param {Set<object>} [seen] Ancestors.
 * @param {number} [depth] Depth.
 */
function json(value: unknown, seen = new Set<object>(), depth = 0): void {
  ingestionRequire(depth < 20);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    ingestionRequire(Number.isFinite(value));
    return;
  }
  if (typeof value === 'string') {
    ingestionRequire(value.length <= 65_536);
    return;
  }
  ingestionRequire(value && typeof value === 'object' && !seen.has(value));
  ingestionRequire(
    Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype),
  );
  seen.add(value);
  ingestionRequire(Reflect.ownKeys(value).length <= 256);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    ingestionRequire(
      typeof key === 'string' &&
        key !== 'toJSON' &&
        descriptor?.enumerable &&
        'value' in descriptor,
    );
    json(descriptor.value, seen, depth + 1);
  }
  if (Array.isArray(value)) ingestionRequire(Object.keys(value).length === value.length);
  seen.delete(value);
}

/**
 * Validate a detached record, optionally with exact keys.
 * @param {unknown} value Candidate.
 * @param {string[]} [keys] Exact keys.
 * @returns {Record<string, unknown>} Record.
 */
export function ingestionRecord(value: unknown, keys?: string[]): Record<string, unknown> {
  json(value);
  ingestionRequire(value && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  if (keys)
    ingestionRequire(
      Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key)),
    );
  return record;
}

/**
 * Validate an API identifier without guessing returned generated identities.
 * @param {unknown} value Candidate.
 * @returns {boolean} Valid identifier.
 */
export function ingestionName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value);
}

/**
 * Canonicalize an identity collection, rejecting duplicates instead of overwriting them.
 * @param {unknown} value Collection.
 * @param {string} key Identity key.
 * @returns {Array<Record<string, unknown>>} Sorted detached records.
 */
export function ingestionCollection(value: unknown, key = 'name'): Array<Record<string, unknown>> {
  ingestionRequire(Array.isArray(value) && value.length <= 200);
  const result = value.map((item: unknown) => structuredClone(ingestionRecord(item)));
  ingestionRequire(result.every((item) => ingestionName(item[key])));
  ingestionRequire(new Set(result.map((item) => item[key])).size === result.length);
  // eslint-disable-next-line unicorn/no-array-sort -- ES2022 type target; result is a fresh detached array.
  return result.sort((a, b) => String(a[key]).localeCompare(String(b[key]), 'en'));
}

/**
 * Admit only one source event and Text fields with the proved alphanumeric label grammar.
 * @param {unknown} value Event.
 * @returns {object} Detached event.
 */
export function ingestionEvent(value: unknown): IngestionDloDocument['spec']['event'] {
  const event = ingestionRecord(value, ['name', 'label', 'fields']);
  for (const item of [event.name, event.label])
    ingestionRequire(typeof item === 'string' && /^[A-Za-z][A-Za-z0-9]{0,79}$/u.test(item));
  const fields = ingestionCollection(event.fields);
  ingestionRequire(fields.length > 0 && fields.length <= 100);
  for (const field of fields) {
    ingestionRecord(field, ['name', 'label', 'dataType']);
    for (const item of [field.name, field.label])
      ingestionRequire(typeof item === 'string' && /^[A-Za-z][A-Za-z0-9]{0,79}$/u.test(item));
    ingestionRequire(field.dataType === 'Text');
    ingestionRequire(!/^(?:KQ_|DataSource|cdp_sys_)/u.test(field.name as string));
  }
  return {
    name: event.name as string,
    label: event.label as string,
    fields: fields as IngestionField[],
  };
}

/**
 * Validate the internal portable configuration, never a raw receipt or creation request.
 * @param {unknown} value Candidate.
 * @returns {IngestionDloDocument} Detached canonical document.
 */
export function validateIngestionDloDocument(value: unknown): IngestionDloDocument {
  const root = ingestionRecord(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  ingestionRequire(root.schemaVersion === 1 && root.kind === 'ingestion-dlo');
  const identity = ingestionRecord(root.identity, ['dataSpace', 'apiName']);
  ingestionRequire(
    identity.dataSpace === 'default' &&
      ingestionName(identity.apiName) &&
      identity.apiName.endsWith('__dll'),
  );
  const spec = ingestionRecord(root.spec, ['connectionName', 'event']);
  ingestionRequire(ingestionName(spec.connectionName));
  return {
    schemaVersion: 1,
    kind: 'ingestion-dlo',
    identity: { dataSpace: 'default', apiName: identity.apiName },
    spec: { connectionName: spec.connectionName, event: ingestionEvent(spec.event) },
  };
}

/**
 * Validate explicit internal intent without inferring runtime identity or authorizing CREATE.
 * @param {unknown} value Supplied intent, never a retrieved v1 document.
 * @returns {IngestionDloCreateIntent} Detached intent with canonical event fields.
 */
export function validateIngestionDloCreateIntent(value: unknown): IngestionDloCreateIntent {
  const root = ingestionRecord(value, ['connectionName', 'event', 'creation']);
  ingestionRequire(ingestionName(root.connectionName));
  const event = ingestionEvent(root.event);
  ingestionRequire(
    new Set(event.fields.map((field) => field.name.toLowerCase())).size === event.fields.length,
  );
  const creation = ingestionRecord(root.creation, [
    'category',
    'dataSpace',
    'dloName',
    'dloLabel',
    'streamName',
    'streamLabel',
    'primaryKey',
    'refreshMode',
  ]);
  ingestionRequire(
    creation.category === 'Other' &&
      creation.dataSpace === 'default' &&
      creation.refreshMode === 'UPSERT',
  );
  ingestionRequire(
    ingestionName(creation.dloName) &&
      creation.dloName.endsWith('__dll') &&
      ingestionName(creation.streamName),
  );
  for (const label of [creation.dloLabel, creation.streamLabel])
    ingestionRequire(typeof label === 'string' && label.trim().length > 0 && label.length <= 200);
  const primaryKey = ingestionRecord(creation.primaryKey, ['name', 'label', 'dataType']);
  const field = event.fields.find((candidate) => candidate.name === primaryKey.name);
  ingestionRequire(
    field && field.label === primaryKey.label && field.dataType === primaryKey.dataType,
  );
  return {
    connectionName: root.connectionName,
    event,
    creation: {
      category: 'Other',
      dataSpace: 'default',
      dloName: creation.dloName,
      dloLabel: creation.dloLabel as string,
      streamName: creation.streamName,
      streamLabel: creation.streamLabel as string,
      primaryKey: { ...field },
      refreshMode: 'UPSERT',
    },
  };
}

/**
 * Compare complete desired source definitions with exactly one forward Text addition.
 * @param {IngestionDloDocument} before Current.
 * @param {IngestionDloDocument} after Desired.
 * @returns {IngestionField | undefined} Added field, or undefined for unsupported changes/equality.
 */
export function ingestionAddition(
  before: IngestionDloDocument,
  after: IngestionDloDocument,
): IngestionField | undefined {
  const prior = validateIngestionDloDocument(before);
  const next = validateIngestionDloDocument(after);
  const additions = next.spec.event.fields.filter(
    (field) => !prior.spec.event.fields.some((old) => old.name === field.name),
  );
  if (additions.length !== 1) return undefined;
  next.spec.event.fields = next.spec.event.fields.filter(
    (field) => field.name !== additions[0].name,
  );
  return isDeepStrictEqual(prior, next) ? additions[0] : undefined;
}
