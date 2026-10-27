export const dloAcquisitionBlockers = [
  'GENERATED_FIELD_REPLAY_UNVERIFIED',
  'EXTERNAL_BINDINGS_NOT_ACQUIRED',
  'LINEAGE_NOT_ACQUIRED',
  'DETAIL_COLLECTION_COMPLETENESS_UNVERIFIED',
] as const;

export type DloAcquisition = {
  schemaVersion: 1;
  kind: 'dlo-acquisition';
  apiVersion: '65.0';
  identity: { dataSpace: 'default'; apiName: string };
  status: 'incomplete';
  blockers: string[];
  detail: Record<string, unknown>;
};

/** Payload-free rejection of malformed internal acquisition data. */
export class DloAcquisitionError extends Error {
  public constructor() {
    super('Invalid DLO acquisition.');
    this.name = 'DloAcquisitionError';
  }
}

/**
 * Require a contract invariant without exposing acquired values.
 * @param {unknown} condition Required invariant.
 */
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new DloAcquisitionError();
}

/**
 * Copy JSON data without invoking getters or losing unknown properties.
 * @param {unknown} value Candidate JSON data.
 * @param {Set<object>} ancestors Active ancestors for cycle detection.
 * @returns {unknown} Detached JSON data.
 */
function copyJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    requireValid(Number.isFinite(value));
    return value;
  }
  requireValid(value && typeof value === 'object' && !ancestors.has(value));
  requireValid(
    Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
  );
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: Array<[string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    requireValid(typeof key === 'string');
    const descriptor = descriptors[key];
    requireValid(descriptor.enumerable && 'value' in descriptor);
    entries.push([key, copyJson(descriptor.value, ancestors)]);
  }
  ancestors.delete(value);
  if (Array.isArray(value)) {
    requireValid(entries.length === value.length);
    requireValid(entries.every(([key], index) => key === String(index)));
    return entries.map(([, item]) => item);
  }
  return Object.fromEntries(entries);
}

/**
 * Check an ordinary record after safe JSON copying.
 * @param {unknown} value Candidate record.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown): Record<string, unknown> {
  requireValid(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

const assetKeys = [
  'createdBy',
  'createdDate',
  'id',
  'label',
  'lastModifiedBy',
  'lastModifiedDate',
  'name',
  'namespace',
  'url',
];
const fieldTypes = new Set([
  'Boolean',
  'Currency',
  'Date',
  'DateTime',
  'Email',
  'Number',
  'Percent',
  'Phone',
  'Text',
  'Unsupported',
  'Url',
]);

/**
 * Validate and detach an internal snapshot, deriving conservative replay blockers.
 * Unknown detail configuration is retained, never silently projected away.
 * @param {unknown} value Internal acquisition envelope, never a deploy document.
 * @returns {DloAcquisition} Detached acquisition that is always incomplete.
 */
export function validateDloAcquisition(value: unknown): DloAcquisition {
  const acquisition = record(copyJson(value));
  requireValid(
    Object.keys(acquisition).every((key) =>
      ['schemaVersion', 'kind', 'apiVersion', 'identity', 'status', 'blockers', 'detail'].includes(
        key,
      ),
    ),
  );
  requireValid(acquisition.schemaVersion === 1 && acquisition.kind === 'dlo-acquisition');
  requireValid(acquisition.apiVersion === '65.0' && acquisition.status === 'incomplete');
  const identity = record(acquisition.identity);
  requireValid(Object.keys(identity).every((key) => ['dataSpace', 'apiName'].includes(key)));
  requireValid(identity.dataSpace === 'default');
  requireValid(
    typeof identity.apiName === 'string' &&
      /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dll$/u.test(identity.apiName) &&
      !/^ssot/iu.test(identity.apiName),
  );
  requireValid(
    Array.isArray(acquisition.blockers) &&
      acquisition.blockers.every((item: unknown) => typeof item === 'string') &&
      dloAcquisitionBlockers.every((item) => (acquisition.blockers as string[]).includes(item)),
  );
  const blockers = new Set<string>(acquisition.blockers as string[]);
  const detail = record(acquisition.detail);
  requireValid(
    detail.name === identity.apiName && typeof detail.label === 'string' && detail.label.trim(),
  );
  requireValid(
    ['Directory_Table', 'Engagement', 'Other', 'Profile'].includes(detail.category as string),
  );
  requireValid(typeof detail.status === 'string' && detail.status.trim());
  if (!['Active', 'Deleting', 'Error', 'Inactive', 'Processing'].includes(detail.status))
    blockers.add('SCHEMA_VARIANT_UNVERIFIED');
  const unknownKeys = (item: Record<string, unknown>, keys: string[]): void => {
    if (Object.keys(item).some((key) => !keys.includes(key))) blockers.add('UNKNOWN_CONFIGURATION');
  };
  unknownKeys(detail, [
    ...assetKeys,
    'category',
    'dataLakeFieldInfoRepresentation',
    'dataSpaceInfo',
    'eventDateTimeFieldName',
    'orgUnitIdentifierFieldName',
    'recordModifiedFieldName',
    'status',
  ]);
  requireValid(Array.isArray(detail.dataLakeFieldInfoRepresentation));
  const names = new Set<string>();
  for (const item of detail.dataLakeFieldInfoRepresentation) {
    const field = record(item);
    requireValid(typeof field.name === 'string' && field.name.trim() && !names.has(field.name));
    names.add(field.name);
    requireValid(typeof field.label === 'string' && typeof field.isPrimaryKey === 'boolean');
    requireValid(fieldTypes.has(field.dataType as string));
    unknownKeys(field, [...assetKeys, 'dataType', 'isPrimaryKey']);
    if (field.dataType === 'Unsupported') blockers.add('SCHEMA_VARIANT_UNVERIFIED');
  }
  if (names.size === 0) blockers.add('EMPTY_FIELD_COLLECTION');
  for (const key of [
    'eventDateTimeFieldName',
    'orgUnitIdentifierFieldName',
    'recordModifiedFieldName',
  ]) {
    if (key in detail) requireValid(typeof detail[key] === 'string');
  }
  requireValid(
    detail.category !== 'Engagement' ||
      (typeof detail.eventDateTimeFieldName === 'string' &&
        names.has(detail.eventDateTimeFieldName)),
  );
  requireValid(Array.isArray(detail.dataSpaceInfo));
  const spaces = detail.dataSpaceInfo.map((item: unknown) => record(item));
  requireValid(spaces.some((space) => space.name === 'default'));
  if (spaces.length !== 1) blockers.add('MULTIPLE_DATA_SPACES');
  for (const space of spaces) {
    requireValid(typeof space.name === 'string' && space.name.trim());
    unknownKeys(space, [...assetKeys, 'filter']);
    if ('filter' in space) blockers.add('DATA_SPACE_FILTER_REPLAY_UNVERIFIED');
  }
  return { ...acquisition, blockers: [...blockers] } as DloAcquisition;
}
