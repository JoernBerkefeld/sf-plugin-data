const fieldTypes = [
  'Number',
  'Text',
  'Date',
  'DateTime',
  'Url',
  'Phone',
  'Email',
  'Percent',
  'Boolean',
  'Currency',
  'ArrayOfFloats',
  'ArrayOfTexts',
] as const;

export type DmoField = {
  name: string;
  label: string;
  description?: string;
  dataType: (typeof fieldTypes)[number];
  category?: string;
  isPrimaryKey: boolean;
  isDynamicLookup: boolean;
};

export type DmoDocument = {
  schemaVersion: 1;
  kind: 'dmo';
  identity: { dataSpace: string; apiName: string };
  spec: {
    label: string;
    description?: string;
    category: 'Profile' | 'Other' | 'Engagement';
    eventDateTimeFieldName?: string;
    recordModifiedFieldName?: string;
    fields: DmoField[];
  };
};

/** Payload-free local contract failure; never interpolate untrusted document values. */
export class DmoDocumentError extends Error {
  public constructor() {
    super('Invalid or unsupported portable DMO document.');
    this.name = 'DmoDocumentError';
  }
}

const objectKeys = [
  'label',
  'description',
  'category',
  'eventDateTimeFieldName',
  'recordModifiedFieldName',
  'fields',
];
const fieldKeys = [
  'name',
  'label',
  'description',
  'category',
  'dataType',
  'isPrimaryKey',
  'isDynamicLookup',
];
const rawObjectConfiguration = ['name', 'dataSpaceName', ...objectKeys, 'creationType'];
const rawFieldConfiguration = [
  'category',
  'name',
  'label',
  'description',
  'type',
  'isPrimaryKey',
  'isDynamicLookup',
  'creationType',
  'keyQualifierName',
  'isDistinct',
  'usageTag',
];
const rawObjectObservations = new Set([
  'id',
  'hasExternalDataLakeObjectMappings',
  'isEditable',
  'isEnabled',
  'isSegmentable',
]);

/**
 * Classify documented raw keys only; configuration still needs lossless adapter handling.
 * @param {'object' | 'field'} level Raw response level.
 * @param {string} key Response property name.
 * @returns {'configuration' | 'observation' | 'unknown'} Unknown keys must block export.
 */
export function classifyDmoRawField(
  level: 'object' | 'field',
  key: string,
): 'configuration' | 'observation' | 'unknown' {
  if ((level === 'object' ? rawObjectConfiguration : rawFieldConfiguration).includes(key))
    return 'configuration';
  if (level === 'object' && rawObjectObservations.has(key)) return 'observation';
  return 'unknown';
}

/**
 * Fail closed with a payload-free diagnostic.
 * @param {unknown} condition Required invariant.
 */
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new DmoDocumentError();
}

/**
 * Check an ordinary JSON record without invoking accessors.
 * @param {unknown} value Candidate record.
 * @param {string[]} allowed Exact permitted keys.
 * @returns {Record<string, unknown>} Checked record.
 */
function record(value: unknown, allowed: string[]): Record<string, unknown> {
  requireValid(value && typeof value === 'object' && !Array.isArray(value));
  requireValid(
    Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
  );
  requireValid(
    Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key)),
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireValid(Object.values(descriptors).every((entry) => 'value' in entry && entry.enumerable));
  return value as Record<string, unknown>;
}

/**
 * Check a nonblank display label.
 * @param {unknown} value Candidate label.
 * @returns {boolean} Whether the label is nonblank.
 */
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check the initial non-namespaced custom API-name subset.
 * @param {unknown} value Qualified API name.
 * @param {string} suffix Required canonical suffix.
 * @returns {boolean} Whether the name belongs to the supported subset.
 */
function customName(value: unknown, suffix: '__dlm' | '__c'): value is string {
  if (typeof value !== 'string' || !value.endsWith(suffix)) return false;
  const stem = value.slice(0, -suffix.length);
  return /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/u.test(stem) && !/^ssot/iu.test(stem);
}

/**
 * Validate the initial custom-schema subset, without coercion or an API-support claim.
 * @param {unknown} value Parsed JSON document (not a raw org response).
 * @returns {DmoDocument} The validated document; no projection or field removal occurs.
 */
export function validateDmoDocument(value: unknown): DmoDocument {
  const document = record(value, ['schemaVersion', 'kind', 'identity', 'spec']);
  requireValid(document.schemaVersion === 1 && document.kind === 'dmo');
  const identity = record(document.identity, ['dataSpace', 'apiName']);
  requireValid(
    typeof identity.dataSpace === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/u.test(identity.dataSpace),
  );
  requireValid(customName(identity.apiName, '__dlm'));
  const spec = record(document.spec, objectKeys);
  requireValid(text(spec.label));
  requireValid(!('description' in spec) || typeof spec.description === 'string');
  requireValid(['Profile', 'Other', 'Engagement'].includes(spec.category as string));
  requireValid(Array.isArray(spec.fields) && spec.fields.length > 0);
  const names = new Set<string>();
  let primaryKeys = 0;
  for (const item of spec.fields) {
    const field = record(item, fieldKeys);
    requireValid(customName(field.name, '__c') && text(field.label));
    requireValid(!('description' in field) || typeof field.description === 'string');
    requireValid(fieldTypes.includes(field.dataType as DmoField['dataType']));
    requireValid(!('category' in field) || typeof field.category === 'string');
    requireValid(
      typeof field.isPrimaryKey === 'boolean' && typeof field.isDynamicLookup === 'boolean',
    );
    requireValid(!names.has(field.name.toLowerCase()));
    names.add(field.name.toLowerCase());
    if (field.isPrimaryKey) primaryKeys++;
  }
  requireValid(primaryKeys === 1);
  for (const key of ['eventDateTimeFieldName', 'recordModifiedFieldName']) {
    if (key in spec) {
      requireValid(
        spec.fields.some(
          (item: DmoField) => item.name === spec[key] && item.dataType === 'DateTime',
        ),
      );
    }
  }
  requireValid(spec.category !== 'Engagement' || 'eventDateTimeFieldName' in spec);
  return value as DmoDocument;
}

export type DmoFieldProjection = {
  status: 'incomplete';
  blockers: string[];
  candidate: DmoDocument;
  /** All raw configuration, including generated fields; never a deploy input. */
  configuration: Record<string, unknown>;
};

/**
 * Project custom fields while retaining every raw configuration value in an incomplete result.
 * @param {unknown} value Raw custom DMO detail, not a list or a portable document.
 * @returns {DmoFieldProjection} Diagnostic candidate only; relationship acquisition is still required.
 */
export function projectDmoRawFields(value: unknown): DmoFieldProjection {
  const raw = record(value, [...rawObjectConfiguration, ...rawObjectObservations]);
  requireValid(raw.creationType === 'Custom' && Array.isArray(raw.fields));
  const configuration: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (key === 'fields') continue;
    requireValid(item === null || ['string', 'boolean'].includes(typeof item));
    if (classifyDmoRawField('object', key) === 'configuration') configuration[key] = item;
  }
  const fields: DmoField[] = [];
  const retained: Array<Record<string, unknown>> = [];
  const blockers = ['RELATIONSHIPS_NOT_ACQUIRED'];
  const names = new Set<string>();
  for (const item of raw.fields) {
    const field = record(item, rawFieldConfiguration);
    requireValid(customName(field.name, '__c') && !names.has(field.name.toLowerCase()));
    names.add(field.name.toLowerCase());
    requireValid(
      Object.values(field).every(
        (entry) => entry === null || ['string', 'boolean'].includes(typeof entry),
      ),
    );
    requireValid(['Custom', 'System'].includes(field.creationType as string));
    retained.push({ ...field });
    if (field.creationType === 'System') {
      blockers.push('GENERATED_FIELD_REPLAY_UNVERIFIED');
      continue;
    }
    const projected: Record<string, unknown> = {};
    for (const key of ['name', 'label', 'description', 'category'])
      if (key in field) projected[key] = field[key];
    projected.dataType = field.type;
    // The documented response omits false flags; keep original presence in configuration.
    projected.isPrimaryKey = field.isPrimaryKey ?? false;
    projected.isDynamicLookup = field.isDynamicLookup ?? false;
    requireValid(!('isPrimaryKey' in field) || typeof field.isPrimaryKey === 'boolean');
    requireValid(!('isDynamicLookup' in field) || typeof field.isDynamicLookup === 'boolean');
    fields.push(projected as DmoField);
    if (['keyQualifierName', 'isDistinct', 'usageTag'].some((key) => key in field))
      blockers.push('FIELD_SEMANTICS_REPLAY_UNVERIFIED');
  }
  configuration.fields = retained;
  const spec: Record<string, unknown> = { fields };
  for (const key of objectKeys) {
    if (key !== 'fields' && key in raw) spec[key] = raw[key];
  }
  const categories: Record<string, string> = {
    PROFILE: 'Profile',
    OTHER: 'Other',
    ENGAGEMENT: 'Engagement',
  };
  if (typeof spec.category === 'string' && Object.hasOwn(categories, spec.category))
    spec.category = categories[spec.category];
  const candidate = validateDmoDocument({
    schemaVersion: 1,
    kind: 'dmo',
    identity: { dataSpace: raw.dataSpaceName, apiName: raw.name },
    spec,
  });
  return { status: 'incomplete', blockers: [...new Set(blockers)], candidate, configuration };
}

export type DmoConnectMetadataProjection = {
  status: 'projected';
  blockers: [];
  candidate: DmoDocument;
  createIdentity: { status: 'verified'; name: string; sourceApiName: string };
  qualifierBindings: Array<{ fieldName: string; qualifierFieldName: string }>;
  /** Complete admitted readback contracts, not writable Metadata API input. */
  expectations: { connect: Record<string, unknown>; metadata: Record<string, unknown> };
};

/**
 * Join the proven relationship-free Other shape and invert its documented custom DMO suffix.
 * @param {unknown} connect Connect DMO detail.
 * @param {unknown} metadata Matching Metadata API CustomObject.
 * @param {unknown} relationships Complete separately acquired relationship inventory.
 * @returns {DmoConnectMetadataProjection} Offline projection, verified create identity and exact readback expectations.
 */
export function projectDmoConnectMetadata(
  connect: unknown,
  metadata: unknown,
  relationships: unknown,
): DmoConnectMetadataProjection {
  requireValid(Array.isArray(relationships) && relationships.length === 0);
  const raw = record(connect, [...rawObjectConfiguration, ...rawObjectObservations]);
  const emptyCollections = [
    'actionOverrides',
    'businessProcesses',
    'compactLayouts',
    'fieldSets',
    'indexes',
    'listViews',
    'profileSearchLayouts',
    'recordTypes',
    'sharingReasons',
    'sharingRecalculations',
    'validationRules',
    'webLinks',
  ];
  const meta = record(metadata, [
    'fullName',
    'fields',
    'label',
    'mktDataModelAttributes',
    ...emptyCollections,
  ]);
  requireValid(raw.category === 'OTHER' && raw.creationType === 'Custom');
  requireValid(!('eventDateTimeFieldName' in raw) && !('recordModifiedFieldName' in raw));
  requireValid(meta.fullName === raw.name && meta.label === raw.label);
  for (const key of emptyCollections)
    requireValid(Array.isArray(meta[key]) && meta[key].length === 0);
  const attributes = record(meta.mktDataModelAttributes, [
    'creationType',
    'dataModelTaxonomy',
    'dataSpaceName',
    'description',
    'isEnabled',
    'isSegmentable',
    'isUsedForMetrics',
    'labelOverride',
    'masterLabel',
    'objectCategory',
  ]);
  requireValid(
    attributes.creationType === 'Custom' && attributes.dataSpaceName === raw.dataSpaceName,
  );
  requireValid(attributes.description === raw.description);
  requireValid(attributes.labelOverride === raw.label && attributes.masterLabel === raw.label);
  requireValid(attributes.dataModelTaxonomy === 'Salesforce_SFDCReferenceModel_0_93');
  requireValid(attributes.objectCategory === 'Salesforce_SFDCReferenceModel_0_93.Related');
  requireValid(attributes.isUsedForMetrics === 'false');
  for (const key of ['isEnabled', 'isSegmentable'])
    requireValid(raw[key] === false && attributes[key] === 'false');
  requireValid(raw.hasExternalDataLakeObjectMappings === false && raw.isEditable === true);
  requireValid(Array.isArray(raw.fields) && raw.fields.length === 6);
  requireValid(Array.isArray(meta.fields) && meta.fields.length === raw.fields.length);
  const joined = new Map<
    string,
    { field: Record<string, unknown>; attributes: Record<string, unknown> }
  >();
  const references = new Map<string, string>();
  for (const item of meta.fields) {
    const field = record(item, [
      'fullName',
      'label',
      'length',
      'required',
      'type',
      'summaryFilterItems',
      'mktDataModelFieldAttributes',
    ]);
    requireValid(customName(field.fullName, '__c') && !joined.has(field.fullName));
    requireValid(field.required === false);
    requireValid(Array.isArray(field.summaryFilterItems) && field.summaryFilterItems.length === 0);
    requireValid(
      field.type === 'Text'
        ? field.length === 60
        : field.type === 'DateTime' && !('length' in field),
    );
    const detail = record(field.mktDataModelFieldAttributes, [
      'definitionCreationType',
      'isDynamicLookup',
      'labelOverride',
      'masterLabel',
      'primaryIndexOrder',
      'usageTag',
      'refAttrDeveloperName',
    ]);
    requireValid(detail.isDynamicLookup === 'false');
    requireValid(!('primaryIndexOrder' in detail) || detail.primaryIndexOrder === '1');
    requireValid(detail.labelOverride === field.label && detail.masterLabel === field.label);
    if ('refAttrDeveloperName' in detail) {
      requireValid(
        text(detail.refAttrDeveloperName) && !references.has(detail.refAttrDeveloperName),
      );
      requireValid(
        detail.definitionCreationType === 'System' && detail.usageTag === 'KeyQualifier',
      );
      references.set(detail.refAttrDeveloperName, field.fullName);
    }
    joined.set(field.fullName, { field, attributes: detail });
  }
  const qualifierBindings: DmoConnectMetadataProjection['qualifierBindings'] = [];
  let generated = 0;
  const checkedFields = raw.fields.map((item: unknown) => {
    const field = record(item, rawFieldConfiguration);
    requireValid(typeof field.name === 'string');
    const match = joined.get(field.name);
    requireValid(match);
    joined.delete(field.name);
    requireValid(field.label === match.field.label && field.type === match.field.type);
    requireValid(field.creationType === match.attributes.definitionCreationType);
    requireValid(field.usageTag === match.attributes.usageTag && field.isDistinct === false);
    requireValid(!('description' in field) && !('category' in field));
    const primary = match.attributes.primaryIndexOrder === '1';
    requireValid(!('isPrimaryKey' in field) || field.isPrimaryKey === primary);
    requireValid(!('isDynamicLookup' in field) || field.isDynamicLookup === false);
    if (field.creationType === 'Custom') {
      requireValid(field.usageTag === 'None');
      requireValid(primary ? field.type === 'Text' : field.type === 'DateTime');
      if (primary) {
        requireValid(typeof field.keyQualifierName === 'string');
        const qualifierFieldName = references.get(field.keyQualifierName);
        requireValid(qualifierFieldName);
        qualifierBindings.push({ fieldName: field.name, qualifierFieldName });
      } else requireValid(!('keyQualifierName' in field));
      requireValid(!('refAttrDeveloperName' in match.attributes));
    } else {
      requireValid(field.creationType === 'System' && field.type === 'Text' && !primary);
      requireValid(!('keyQualifierName' in field));
      requireValid(
        field.usageTag === ('refAttrDeveloperName' in match.attributes ? 'KeyQualifier' : 'None'),
      );
      generated++;
    }
    return { ...field, isPrimaryKey: primary, isDynamicLookup: false };
  });
  requireValid(
    joined.size === 0 && generated === 4 && references.size === 1 && qualifierBindings.length === 1,
  );
  const { candidate } = projectDmoRawFields({ ...raw, fields: checkedFields });
  requireValid(candidate.spec.fields.length === 2);
  // Validation above admits JSON scalars/records only; retain all presence and generated metadata.
  const expectations = structuredClone({ connect: raw, metadata: meta });
  return {
    status: 'projected',
    blockers: [],
    candidate,
    // Candidate validation proves the non-namespaced base; remove only the terminal suffix.
    createIdentity: {
      status: 'verified',
      name: candidate.identity.apiName.slice(0, -'__dlm'.length),
      sourceApiName: candidate.identity.apiName,
    },
    qualifierBindings,
    expectations,
  };
}

export type OtherDmoCreateRequest = {
  name: string;
  label: string;
  description?: string;
  dataSpaceName: 'default';
  category: 'Other';
  fields: Array<Pick<DmoField, 'name' | 'label' | 'dataType' | 'isPrimaryKey' | 'isDynamicLookup'>>;
};

/**
 * Construct only the evidenced default-space Other request, rechecking the complete projection.
 * @param {unknown} value Joined projection, including its independent readback expectations.
 * @param {unknown} targetDataSpace Explicit target binding; only default has replay evidence.
 * @returns {OtherDmoCreateRequest} Fresh authored-only request; no transport or generated-field replay.
 */
export function buildOtherDmoCreateRequest(
  value: unknown,
  targetDataSpace: unknown,
): OtherDmoCreateRequest {
  requireValid(targetDataSpace === 'default');
  const projection = record(value, [
    'status',
    'blockers',
    'candidate',
    'createIdentity',
    'qualifierBindings',
    'expectations',
  ]);
  requireValid(projection.status === 'projected');
  requireValid(Array.isArray(projection.blockers) && projection.blockers.length === 0);
  const expectations = record(projection.expectations, ['connect', 'metadata']);
  // Reapply every strict join/profile check; a portable candidate alone is not authority.
  const checked = projectDmoConnectMetadata(expectations.connect, expectations.metadata, []);
  requireValid(checked.candidate.identity.dataSpace === 'default');
  requireValid(
    serializeDmoDocument(projection.candidate) === serializeDmoDocument(checked.candidate),
  );
  const identity = record(projection.createIdentity, ['status', 'name', 'sourceApiName']);
  for (const key of ['status', 'name', 'sourceApiName'] as const)
    requireValid(identity[key] === checked.createIdentity[key]);
  requireValid(
    Array.isArray(projection.qualifierBindings) && projection.qualifierBindings.length === 1,
  );
  const binding = record(projection.qualifierBindings[0], ['fieldName', 'qualifierFieldName']);
  requireValid(binding.fieldName === checked.qualifierBindings[0].fieldName);
  requireValid(binding.qualifierFieldName === checked.qualifierBindings[0].qualifierFieldName);
  const { spec } = checked.candidate;
  return {
    name: checked.createIdentity.name,
    label: spec.label,
    ...('description' in spec ? { description: spec.description } : {}),
    dataSpaceName: targetDataSpace,
    category: 'Other',
    // API 65 replay preserves these exact authored __c names; do not invert them.
    fields: spec.fields.map(({ name, label, dataType, isPrimaryKey, isDynamicLookup }) => ({
      name,
      label,
      dataType,
      isPrimaryKey,
      isDynamicLookup,
    })),
  };
}

/**
 * Map an authored document independently of internal source-readback expectations.
 * @param {unknown} value Parsed authored document, never a runtime projection.
 * @param {unknown} targetDataSpace Explicit target binding; only default has replay evidence.
 * @returns {OtherDmoCreateRequest} Fresh request for the evidenced two-field Other subset.
 */
export function buildOtherDmoCreateRequestFromDocument(
  value: unknown,
  targetDataSpace: unknown,
): OtherDmoCreateRequest {
  const document = validateDmoDocument(value);
  requireValid(document.identity.dataSpace === 'default' && targetDataSpace === 'default');
  const { spec } = document;
  requireValid(spec.category === 'Other' && spec.fields.length === 2);
  requireValid(!('eventDateTimeFieldName' in spec) && !('recordModifiedFieldName' in spec));
  for (const field of spec.fields) {
    requireValid(!('description' in field) && !('category' in field));
    requireValid(field.isDynamicLookup === false);
    requireValid(field.isPrimaryKey ? field.dataType === 'Text' : field.dataType === 'DateTime');
  }
  return {
    // Document validation proves the local base; remove only the terminal suffix.
    name: document.identity.apiName.slice(0, -'__dlm'.length),
    label: spec.label,
    ...('description' in spec ? { description: spec.description } : {}),
    dataSpaceName: targetDataSpace,
    category: 'Other',
    fields: spec.fields.map(({ name, label, dataType, isPrimaryKey, isDynamicLookup }) => ({
      name,
      label,
      dataType,
      isPrimaryKey,
      isDynamicLookup,
    })),
  };
}

/**
 * Sort only object keys; all arrays and string contents retain their order.
 * @param {unknown} value Validated JSON value.
 * @returns {unknown} Canonical JSON value.
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => stable(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh entries array within the existing TypeScript library target.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

/**
 * Serialize validated DMO JSON with sorted object keys, original arrays and a final LF.
 * @param {unknown} value Parsed portable document.
 * @returns {string} Deterministic JSON text; UTF-8 encoding belongs to the future writer.
 */
export function serializeDmoDocument(value: unknown): string {
  return `${JSON.stringify(stable(validateDmoDocument(value)), undefined, 2)}\n`;
}
