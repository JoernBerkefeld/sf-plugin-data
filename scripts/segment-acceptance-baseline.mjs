import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Acceptance-only implementation. Never import the installed acquisition, projection or comparator.
const baselines = new WeakMap();
const artifacts = new WeakMap();
const runtimeKeys =
  'apiName createdBy createdDate dataSpace description displayName includeCriteria includeDbt lastModifiedBy lastModifiedDate lastSegmentMemberCount lookbackPeriod marketSegmentDefinitionId marketSegmentId parameters publishInterval segmentMembershipDmo segmentOnApiName segmentOnId segmentStatus segmentType'.split(
    ' ',
  );
const dmoKeys =
  'name dataSpaceName label description category creationType eventDateTimeFieldName recordModifiedFieldName fields id hasExternalDataLakeObjectMappings isEditable isEnabled isSegmentable'.split(
    ' ',
  );
const fieldKeys =
  'category name label description type isPrimaryKey isDynamicLookup creationType keyQualifierName isDistinct usageTag'.split(
    ' ',
  );
const metadataCollections =
  'actionOverrides businessProcesses compactLayouts fieldSets indexes listViews profileSearchLayouts recordTypes sharingReasons sharingRecalculations validationRules webLinks'.split(
    ' ',
  );
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => {
  throw new Error('SEGMENT_ACCEPTANCE_REFUSED');
};
const check = (condition) => {
  if (!condition) fail();
};
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1_000_000;
const identifier = (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z\d_]*$/u.test(value);

/**
 *
 * @param {unknown} value Candidate value.
 * @param {string[]} allowed Permitted keys.
 * @param {string[]} required Required keys.
 * @returns {object} Admitted record.
 */
function record(value, allowed, required = allowed) {
  check(value && Object.getPrototypeOf(value) === Object.prototype);
  check(
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        allowed.includes(key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') &&
        Object.getOwnPropertyDescriptor(value, key).enumerable,
    ),
  );
  check(required.every((key) => Object.hasOwn(value, key)));
  return value;
}

// Plain JSON only: no accessors, prototypes, holes, nonfinite numbers or hidden fields.
/**
 *
 * @param {unknown} value Candidate value.
 * @param {number} depth Current bounded nesting depth.
 */
function json(value, depth = 0) {
  check(depth <= 32);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    check(Number.isFinite(value));
    return;
  }
  if (Array.isArray(value)) {
    check(value.length <= 4096 && Reflect.ownKeys(value).length === value.length + 1);
    for (let index = 0; index < value.length; index++) {
      check(
        Object.hasOwn(value, index) &&
          Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)), 'value'),
      );
      json(value[index], depth + 1);
    }
    return;
  }
  check(value && Object.getPrototypeOf(value) === Object.prototype);
  for (const key of Reflect.ownKeys(value)) {
    check(
      typeof key === 'string' &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') &&
        Object.getOwnPropertyDescriptor(value, key).enumerable,
    );
    json(value[key], depth + 1);
  }
}

/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function timestamp(value) {
  check(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value));
  const parsed = Date.parse(value);
  check(Number.isFinite(parsed) && new Date(parsed).toISOString() === value);
  return parsed;
}

/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function absolute(value) {
  check(text(value) && (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)));
  check(
    !value
      .replaceAll('\\', '/')
      .split('/')
      .some((part) => part === '..' || part === '.'),
  );
  return value.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase();
}

/**
 *
 * @param {unknown} value Candidate value.
 * @param {object} prior Previous same-run evidence.
 * @returns {object} Detached local provenance.
 */
function provenance(value, prior) {
  record(value, ['runId', 'runStartedAt', 'observedAt', 'now', 'acquisition', 'installedServices']);
  check(text(value.runId));
  const start = timestamp(value.runStartedAt);
  const observed = timestamp(value.observedAt);
  const now = timestamp(value.now);
  check(start <= observed && observed <= now && now <= Date.now());
  const seam = record(value.acquisition, ['implementation', 'sourcePath', 'sourceSha256']);
  check(typeof seam.implementation === 'function' && /^[a-f\d]{64}$/u.test(seam.sourceSha256));
  const source = absolute(seam.sourcePath);
  check(!/(?:^|\/)(?:src|lib)\/(?:services|artifacts|transport)\//u.test(source));
  check(Array.isArray(value.installedServices) && value.installedServices.length >= 3);
  const identities = new Set();
  for (const service of value.installedServices) {
    record(service, ['implementation', 'sourcePath', 'sourceSha256']);
    const location = absolute(service.sourcePath);
    check(
      typeof service.implementation === 'function' && /^[a-f\d]{64}$/u.test(service.sourceSha256),
    );
    check(
      service.implementation !== seam.implementation &&
        service.sourceSha256 !== seam.sourceSha256 &&
        location !== source &&
        !identities.has(location),
    );
    check(
      Function.prototype.toString.call(service.implementation) !==
        Function.prototype.toString.call(seam.implementation),
    );
    identities.add(location);
  }
  const result = {
    runId: value.runId,
    runStartedAt: value.runStartedAt,
    observedAt: value.observedAt,
    sourcePath: source,
    sourceSha256: seam.sourceSha256,
    implementationDigest: digest(Function.prototype.toString.call(seam.implementation)),
  };
  if (prior)
    check(
      result.runId === prior.runId &&
        result.runStartedAt === prior.runStartedAt &&
        observed > timestamp(prior.observedAt) &&
        result.sourcePath === prior.sourcePath &&
        result.sourceSha256 === prior.sourceSha256 &&
        result.implementationDigest === prior.implementationDigest,
    );
  return result;
}

// A deliberately bounded exact XML grammar, not a general-purpose XML parser.
// Only the three known Metadata leaves and one DbtPipeline model are admissible.
/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function unescapeXml(value) {
  check(!value.includes('<') && !/&(?!(?:amp|lt|gt|quot|apos);)/u.test(value));
  return value.replaceAll(
    /&(amp|lt|gt|quot|apos);/gu,
    (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity],
  );
}

/**
 *
 * @param {object} raw Complete acquisition.
 * @param {object} expected Forward selection.
 * @returns {object} Admitted runtime segment.
 */
function validateRaw(raw, expected) {
  json(raw);
  record(raw, ['runtime', 'definitionXml', 'dependency', 'bindings']);
  record(expected, ['apiName', 'dmoApiName', 'fieldApiName', 'displayName', 'description']);
  check(
    [expected.apiName, expected.dmoApiName, expected.fieldApiName].every((name) =>
      identifier(name),
    ),
  );
  check(
    expected.dmoApiName.endsWith('__dlm') &&
      expected.fieldApiName.endsWith('__c') &&
      text(expected.displayName) &&
      typeof expected.description === 'string',
  );
  record(raw.runtime, ['segments']);
  check(Array.isArray(raw.runtime.segments) && raw.runtime.segments.length === 1);
  const segment = record(raw.runtime.segments[0], runtimeKeys);
  check(
    segment.apiName === expected.apiName &&
      segment.segmentOnApiName === expected.dmoApiName &&
      segment.displayName === expected.displayName &&
      segment.description === expected.description,
  );
  for (const [key, value] of Object.entries({
    dataSpace: 'default',
    segmentType: 'DBT',
    segmentStatus: 'ACTIVE',
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  }))
    check(segment[key] === value);
  for (const key of ['marketSegmentDefinitionId', 'marketSegmentId', 'segmentOnId'])
    check(text(segment[key]));
  for (const key of ['createdBy', 'lastModifiedBy']) {
    record(segment[key], ['id']);
    check(text(segment[key].id));
  }
  check(timestamp(segment.createdDate) <= timestamp(segment.lastModifiedDate));
  check(
    segment.lastSegmentMemberCount === 0 &&
      Array.isArray(segment.parameters) &&
      segment.parameters.length === 0,
  );
  record(segment.segmentMembershipDmo, ['historyTable', 'latestTable']);
  check(
    Object.values(segment.segmentMembershipDmo).every((value) => identifier(value)) &&
      segment.segmentMembershipDmo.historyTable !== segment.segmentMembershipDmo.latestTable,
  );
  record(segment.includeDbt, ['models']);
  check(Array.isArray(segment.includeDbt.models) && segment.includeDbt.models.length === 1);
  const model = record(segment.includeDbt.models[0], ['name', 'sql']);
  const sql = `SELECT ${expected.dmoApiName}.${expected.fieldApiName} FROM ${expected.dmoApiName} WHERE 1 = 0 AND ${expected.dmoApiName}.${expected.fieldApiName} IS NOT NULL`;
  check(model.name === expected.apiName && model.sql === sql);
  const pipeline = `<DbtPipeline xmlns=""><models><model><name>${expected.apiName}</name><sql>${sql}</sql></model></models></DbtPipeline>`;
  check(text(segment.includeCriteria) && unescapeXml(segment.includeCriteria) === pipeline);
  check(text(raw.definitionXml) && raw.definitionXml.length <= 1_000_000);
  const match =
    /^(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<MarketSegmentDefinition xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">\s*<includeCriteria>([^<]*)<\/includeCriteria>\s*<masterLabel>([^<]*)<\/masterLabel>\s*<segmentType>DBT<\/segmentType>\s*<\/MarketSegmentDefinition>\s*$/u.exec(
      raw.definitionXml,
    );
  check(
    match && unescapeXml(match[1]) === pipeline && unescapeXml(match[2]) === segment.displayName,
  );
  validateDependency(raw.dependency, raw.bindings, segment, expected);
  return segment;
}

/**
 *
 * @param {object[]} items Named fields.
 * @param {string} key Name property.
 */
function unique(items, key) {
  check(Array.isArray(items) && items.length > 0 && items.length <= 4096);
  const names = items.map((item) => {
    check(item && identifier(item[key]));
    return item[key].toLowerCase();
  });
  check(new Set(names).size === names.length);
}

/**
 *
 * @param {object} dependency Raw dependency pair.
 * @param {object[]} bindings Complete binding.
 * @param {object} segment Runtime identity.
 * @param {object} expected Forward selection.
 */
function validateDependency(dependency, bindings, segment, expected) {
  record(dependency, ['detail', 'metadata']);
  const detail = record(dependency.detail, dmoKeys, [
    'id',
    'name',
    'dataSpaceName',
    'category',
    'isSegmentable',
    'fields',
  ]);
  check(
    detail.id === segment.segmentOnId &&
      detail.name === expected.dmoApiName &&
      detail.dataSpaceName === 'default' &&
      detail.category === 'PROFILE' &&
      detail.isSegmentable === true,
  );
  check(Array.isArray(dependency.metadata) && dependency.metadata.length === 1);
  const meta = record(
    dependency.metadata[0],
    ['fullName', 'label', 'fields', 'mktDataModelAttributes', ...metadataCollections],
    ['fullName', 'fields', 'mktDataModelAttributes'],
  );
  check(meta.fullName === detail.name);
  for (const [key, value] of Object.entries(detail)) {
    if (key === 'fields') continue;
    check(
      value === null ||
        (['hasExternalDataLakeObjectMappings', 'isEditable', 'isEnabled', 'isSegmentable'].includes(
          key,
        )
          ? typeof value === 'boolean'
          : typeof value === 'string'),
    );
  }
  const attributes = record(
    meta.mktDataModelAttributes,
    'creationType dataModelTaxonomy dataSpaceName description isEnabled isSegmentable isUsedForMetrics labelOverride masterLabel objectCategory'.split(
      ' ',
    ),
    ['dataSpaceName', 'isSegmentable'],
  );
  check(attributes.dataSpaceName === 'default' && attributes.isSegmentable === 'true');
  for (const value of Object.values(attributes)) check(typeof value === 'string');
  if (Object.hasOwn(detail, 'description') || Object.hasOwn(attributes, 'description'))
    check(detail.description === attributes.description);
  if (Object.hasOwn(attributes, 'labelOverride')) check(attributes.labelOverride === detail.label);
  if (Object.hasOwn(attributes, 'masterLabel')) check(attributes.masterLabel === meta.label);
  for (const key of metadataCollections)
    if (Object.hasOwn(meta, key)) check(Array.isArray(meta[key]) && meta[key].length === 0);
  if (Object.hasOwn(detail, 'label') || Object.hasOwn(meta, 'label'))
    check(text(detail.label) && detail.label === meta.label);
  unique(detail.fields, 'name');
  unique(meta.fields, 'fullName');
  check(detail.fields.length === meta.fields.length);
  for (const field of detail.fields) {
    record(field, fieldKeys, ['name', 'type']);
    const metadata = meta.fields.find((entry) => entry.fullName === field.name);
    record(
      metadata,
      'fullName label description length required type summaryFilterItems mktDataModelFieldAttributes'.split(
        ' ',
      ),
      ['fullName', 'type', 'mktDataModelFieldAttributes'],
    );
    const fieldAttributes = record(
      metadata.mktDataModelFieldAttributes,
      'definitionCreationType isDynamicLookup labelOverride masterLabel primaryIndexOrder usageTag refAttrDeveloperName'.split(
        ' ',
      ),
      [],
    );
    check(metadata.type === field.type);
    if (Object.hasOwn(metadata, 'length'))
      check(Number.isSafeInteger(metadata.length) && metadata.length > 0);
    if (Object.hasOwn(metadata, 'required')) check(typeof metadata.required === 'boolean');
    if (Object.hasOwn(metadata, 'summaryFilterItems'))
      check(Array.isArray(metadata.summaryFilterItems) && metadata.summaryFilterItems.length === 0);
    for (const key of ['label', 'description']) {
      if (Object.hasOwn(field, key) || Object.hasOwn(metadata, key))
        check(typeof field[key] === 'string' && field[key] === metadata[key]);
    }
    for (const [key, value] of Object.entries(field))
      check(
        value === null ||
          (['isPrimaryKey', 'isDynamicLookup', 'isDistinct'].includes(key)
            ? typeof value === 'boolean'
            : typeof value === 'string'),
      );
    for (const value of Object.values(fieldAttributes)) check(typeof value === 'string');
    if (field.name === expected.fieldApiName)
      check(
        field.type === 'Text' &&
          field.isPrimaryKey === true &&
          fieldAttributes.primaryIndexOrder === '1' &&
          field.isDynamicLookup !== true &&
          fieldAttributes.isDynamicLookup !== 'true',
      );
    else check(field.isPrimaryKey !== true && fieldAttributes.primaryIndexOrder !== '1');
  }
  check(detail.fields.some((field) => field.name === expected.fieldApiName));
  check(
    isDeepStrictEqual(bindings, [
      {
        identity: { kind: 'dmo', dataSpace: 'default', apiName: expected.dmoApiName },
        targetId: detail.id,
        fields: [{ apiName: expected.fieldApiName, dataType: 'Text', isPrimaryKey: true }],
      },
    ]),
  );
}

/**
 * Admit detached full raw forward state correlated with historical original ownership.
 * Provenance validates a supplied function identity, NOT that it performed a live read.
 * @param {object} originalOwner Exact apiName/marketSegmentId/marketSegmentDefinitionId/createdBy/createdDate.
 * @param {object} currentRaw Full runtime/definitionXml/dependency(detail,metadata)/bindings.
 * @param {object} expectedForward Exact apiName/dmoApiName/fieldApiName/displayName/description.
 * @param {object} observationProvenance Run timestamps, acquisition function/source and installed service identities.
 * @returns {object} Opaque frozen {kind,digest,raw,originalOwner,expectedForward,provenance,liveAcquisitionProven:false}.
 */
export function admitOriginalOwner(
  originalOwner,
  currentRaw,
  expectedForward,
  observationProvenance,
) {
  json(originalOwner);
  json(expectedForward);
  record(originalOwner, [
    'apiName',
    'marketSegmentId',
    'marketSegmentDefinitionId',
    'createdBy',
    'createdDate',
  ]);
  const segment = validateRaw(currentRaw, expectedForward);
  for (const key of Object.keys(originalOwner))
    check(isDeepStrictEqual(originalOwner[key], segment[key]));
  const evidence = provenance(observationProvenance);
  check(timestamp(segment.lastModifiedDate) <= timestamp(evidence.observedAt));
  const content = structuredClone({
    raw: currentRaw,
    originalOwner,
    expectedForward,
    provenance: evidence,
  });
  const result = freeze({
    kind: 'segment-acceptance-baseline-v1',
    digest: digest(canonical(content)),
    ...content,
    liveAcquisitionProven: false,
  });
  baselines.set(result, {
    content,
    implementation: observationProvenance.acquisition.implementation,
  });
  return result;
}

/**
 * Require fresh same-run final evidence and lossless full raw equality, including observations.
 * @param {object} baseline Actual opaque return from admitOriginalOwner; copies are refused.
 * @param {object} finalRaw Same full raw shape as currentRaw.
 * @param {object} observationProvenance Same independent seam and run, fresh observedAt.
 * @returns {object} Frozen {equal:true,baselineDigest,finalDigest,provenance,liveAcquisitionProven:false}.
 */
export function compareFinal(baseline, finalRaw, observationProvenance) {
  const admitted = baselines.get(baseline);
  check(admitted && observationProvenance?.acquisition?.implementation === admitted.implementation);
  const { content } = admitted;
  check(baseline.digest === digest(canonical(content)));
  validateRaw(finalRaw, content.expectedForward);
  const evidence = provenance(observationProvenance, content.provenance);
  check(timestamp(finalRaw.runtime.segments[0].lastModifiedDate) <= timestamp(evidence.observedAt));
  check(isDeepStrictEqual(content.raw, finalRaw));
  return freeze({
    equal: true,
    baselineDigest: baseline.digest,
    finalDigest: digest(canonical(finalRaw)),
    provenance: evidence,
    liveAcquisitionProven: false,
  });
}

/**
 *
 * @param {unknown} value Candidate value.
 * @returns {unknown} Checked or transformed value.
 */
function relative(value) {
  check(
    text(value) &&
      /^[A-Za-z\d_.@/-]+$/u.test(value) &&
      !value.startsWith('/') &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
  );
  return value;
}

// Strict regular-file ustar subset. Reject links, extensions, ambiguous/duplicate paths and trailing data.
/**
 *
 * @param {Buffer} bytes Compressed synthetic tarball.
 * @returns {object} Contained package manifest.
 */
function tarPackage(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 16_777_216);
  const tar = gunzipSync(bytes, { maxOutputLength: 33_554_432 });
  check(tar.length % 512 === 0);
  const files = new Map();
  let offset = 0;
  for (; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const string = (start, length) => {
      const field = header.subarray(start, start + length);
      const zero = field.indexOf(0);
      check(zero === -1 || field.subarray(zero).every((byte) => byte === 0));
      return field.subarray(0, zero === -1 ? field.length : zero).toString('utf8');
    };
    check(
      string(257, 6) === 'ustar' &&
        string(345, 155) === '' &&
        string(157, 100) === '' &&
        [0, 48].includes(header[156]),
    );
    const octal = (start, length) => {
      const value = header
        .subarray(start, start + length)
        .toString('ascii')
        .replace(/[\0 ]+$/u, '')
        .trim();
      check(/^[0-7]+$/u.test(value));
      return Number.parseInt(value, 8);
    };
    const checksum = [...header].reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    check(checksum === octal(148, 8));
    const name = relative(string(0, 100));
    check(name.startsWith('package/') && !files.has(name));
    const size = octal(124, 12);
    const end = offset + 512 + size;
    check(Number.isSafeInteger(size) && end <= tar.length);
    files.set(name, tar.subarray(offset + 512, end));
    offset += 512 + Math.ceil(size / 512) * 512;
    check(tar.subarray(end, offset).every((byte) => byte === 0));
  }
  check(
    tar.length - offset >= 1024 &&
      tar.subarray(offset).every((byte) => byte === 0) &&
      files.has('package/package.json'),
  );
  const packageBytes = files.get('package/package.json');
  return {
    manifest: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packageBytes)),
    packageSha256: digest(packageBytes),
    files,
  };
}

/**
 *
 * @param {object} input Complete supplied artifact evidence.
 * @returns {object} Detached immutable content.
 */
function artifactContent(input) {
  record(input, [
    'manifestBytes',
    'entries',
    'tarballBytes',
    'packageIdentity',
    'inventory',
    'commandOrigins',
  ]);
  check(Buffer.isBuffer(input.manifestBytes) && input.manifestBytes.length <= 4_194_304);
  const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(input.manifestBytes);
  const manifest = JSON.parse(manifestText);
  check(manifestText === JSON.stringify(manifest));
  record(manifest, ['schemaVersion', 'files']);
  check(manifest.schemaVersion === 1);
  check(
    Array.isArray(manifest.files) &&
      manifest.files.length > 0 &&
      manifest.files.length <= 4096 &&
      Array.isArray(input.entries) &&
      manifest.files.length === input.entries.length,
  );
  const names = [];
  const entries = manifest.files.map((file, index) => {
    record(file, ['path', 'sha256', 'size']);
    relative(file.path);
    record(input.entries[index], ['path', 'bytes']);
    const entry = input.entries[index];
    check(
      entry.path === file.path &&
        Buffer.isBuffer(entry.bytes) &&
        entry.bytes.length === file.size &&
        digest(entry.bytes) === file.sha256,
    );
    names.push(file.path);
    return { path: file.path, sha256: file.sha256, size: file.size };
  });
  check(
    new Set(names.map((name) => name.toLowerCase())).size === names.length &&
      isDeepStrictEqual(names, [...names].toSorted()),
  );
  record(input.packageIdentity, ['name', 'version']);
  check(
    input.packageIdentity.name === 'sf-plugin-data' &&
      /^\d+\.\d+\.\d+$/u.test(input.packageIdentity.version),
  );
  const packaged = tarPackage(input.tarballBytes);
  check(
    packaged.manifest.name === input.packageIdentity.name &&
      packaged.manifest.version === input.packageIdentity.version,
  );
  for (const entry of entries) {
    const member = packaged.files.get(`package/${entry.path}`);
    check(member && member.length === entry.size && digest(member) === entry.sha256);
  }
  // package.json alone is packaging-only; its exact bytes are independently bound below.
  const manifestedMembers = new Set(entries.map((entry) => `package/${entry.path}`));
  for (const member of packaged.files.keys())
    check(member === 'package/package.json' || manifestedMembers.has(member));
  json(input.inventory);
  check(Array.isArray(input.inventory) && input.inventory.length > 0);
  const inventory = input.inventory.map((item) => {
    record(item, ['name', 'version', 'root', 'packageSha256']);
    check(text(item.name) && text(item.version) && /^[a-f\d]{64}$/u.test(item.packageSha256));
    return { ...item, root: absolute(item.root) };
  });
  check(new Set(inventory.map((item) => item.root)).size === inventory.length);
  const selected = inventory.filter(
    (item) =>
      item.name === input.packageIdentity.name && item.version === input.packageIdentity.version,
  );
  check(selected.length === 1 && selected[0].packageSha256 === packaged.packageSha256);
  record(input.commandOrigins, ['retrieve', 'deploy']);
  const origins = {};
  for (const command of ['retrieve', 'deploy']) {
    const origin = record(input.commandOrigins[command], ['packageRoot', 'resolvedPath', 'sha256']);
    const root = absolute(origin.packageRoot);
    const resolved = absolute(origin.resolvedPath);
    check(
      root === selected[0].root &&
        resolved === `${root}/lib/commands/data360/${command}.js` &&
        /^[a-f\d]{64}$/u.test(origin.sha256),
    );
    check(
      entries.some(
        (entry) =>
          entry.path === `lib/commands/data360/${command}.js` && entry.sha256 === origin.sha256,
      ),
    );
    origins[command] = { packageRoot: root, resolvedPath: resolved, sha256: origin.sha256 };
  }
  return {
    manifestSha256: digest(input.manifestBytes),
    entries,
    tarballSha256: digest(input.tarballBytes),
    packageIdentity: { ...input.packageIdentity },
    inventory,
    commandOrigins: origins,
  };
}

/**
 * Bind already supplied bytes/inventory; performs no installation, acquisition or filesystem reads.
 * @param {object} input Manifest JSON bytes {schemaVersion:1,files:[{path,sha256,size}]}, sorted entries [{path,bytes}], gzip ustar tarballBytes, packageIdentity {name,version}, exact inventory [{name,version,root,packageSha256}], commandOrigins {retrieve,deploy:{packageRoot,resolvedPath,sha256}}.
 * @returns {object} Opaque immutable artifact binding; inventory includes every installed package, not a filtered subset.
 */
export function bindArtifact(input) {
  const content = artifactContent(input);
  const binding = freeze({
    kind: 'segment-acceptance-artifact-v1',
    digest: digest(canonical(content)),
    ...content,
  });
  artifacts.set(binding, content);
  return binding;
}

/**
 * Reject any byte, manifest, tarball, inventory (including extra packages) or origin drift.
 * @param {object} binding Original opaque bindArtifact result.
 * @param {object} current Same complete input shape as bindArtifact.
 * @returns {boolean} True only for identical supplied evidence, never proof of actual installation.
 */
export function assertArtifactUnchanged(binding, current) {
  const content = artifacts.get(binding);
  check(
    content &&
      binding.digest === digest(canonical(content)) &&
      isDeepStrictEqual(content, artifactContent(current)),
  );
  return true;
}
