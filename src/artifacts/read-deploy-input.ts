import { dataTransformName, validateDataTransformDocument } from './data-transform-document.js';
import type { DataTransformDocument } from './data-transform-document.js';
import { validateNativeDataGraphDocument } from './native-data-graph-document.js';
import type { NativeDataGraphDocument } from './native-data-graph-document.js';
import { validateAnyDataStreamDocument } from './data-stream-document.js';
import type { CrmDataStreamDocument, DataStreamDocument } from './data-stream-document.js';
import { nativeMappingName, validateNativeMappingDocument } from './native-mapping-document.js';
import type { NativeMappingDocument } from './native-mapping-document.js';
import {
  nativeRelationshipName,
  relationshipDmoName,
  validateNativeRelationshipDocument,
} from './native-relationship-document.js';
import type { NativeRelationshipDocument } from './native-relationship-document.js';
import { nativeDmoName, validateNativeDmoDocument } from './native-dmo-document.js';
import type { NativeDmoDocument } from './native-dmo-document.js';
import { dloName, validateDloDocument } from './dlo-document.js';
import type { DloDocument } from './dlo-document.js';
import { dataGraphName } from './data-graph-document.js';
import type { DeletedArtifactKind } from './path-selector.js';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { joinSegmentFiles, segmentName } from './segment-document.js';
import type { DbtSegmentSpec, SegmentDocument } from './segment-document.js';
import {
  identityResolutionName,
  validateIdentityResolutionDocument,
} from './identity-resolution-document.js';
import type { IdentityResolutionDocument } from './identity-resolution-document.js';
import {
  calculatedInsightName,
  calculatedInsightReference as calculatedInsightReference,
  parseNativeCalculatedInsight,
} from './native-calculated-insight-document.js';
import type {
  CalculatedInsightReference as CalculatedInsightReference,
  NativeCalculatedInsight,
} from './native-calculated-insight-document.js';

import {
  isVerbatimDocument,
  parseVerbatimDocument,
  verbatimRefusalMessage,
  verbatimIdentity,
  verbatimSkipWarning,
} from './verbatim-document.js';
import type { VerbatimDocument, VerbatimKind } from './verbatim-document.js';
import { explanationOf, replaceExplanation } from '../services/operation-diagnostic.js';

/** Refusals of the c__dataSpace key that a selected file keeps instead of INVALID_SOURCE. */
const dataSpaceFieldCodes = [
  'LEGACY_DATASPACE_KEY',
  'INVALID_DATASPACE_FIELD',
  'UNSUPPORTED_DATASPACE_FILTER',
] as const;
type DataSpaceFieldCode = (typeof dataSpaceFieldCodes)[number];

const ciMemberInfix = '.calculatedInsight-meta.';
const ciJsonSuffix = '.calculatedInsight-meta.json';
/**
 * A calculated insight file: its JSON, its SQL or any other file of that name stem.
 * @param {string} file Path.
 * @returns {boolean} Whether the base name holds `.calculatedInsight-meta.`.
 */
const isCalculatedInsightMember = (file: string): boolean =>
  path.basename(file).includes(ciMemberInfix);

const segmentMemberInfix = '.segment.';
const segmentJsonSuffix = '.segment.json';
/**
 * A segment file: its JSON or one of its SQL files.
 * @param {string} file Path.
 * @returns {boolean} Whether the base name is `X.segment.json` or `X.segment.*.sql`.
 */
export const isSegmentMember = (file: string): boolean => {
  const entry = path.basename(file).toLowerCase();
  return (
    entry.endsWith(segmentJsonSuffix) ||
    (entry.includes(segmentMemberInfix) && entry.endsWith('.sql'))
  );
};

/** Payload-free local selection refusal. */
export class DeployInputError extends Error {
  public constructor(
    public readonly code:
      | 'INVALID_SELECTION'
      | 'UNSAFE_SOURCE'
      | 'INVALID_SOURCE'
      | 'DUPLICATE_IDENTITY'
      | 'UNSUPPORTED_SEGMENT_XML'
      | 'VERBATIM_NOT_DEPLOYABLE'
      | DataSpaceFieldCode,
    message?: string,
  ) {
    super(
      message ??
        (code === 'UNSUPPORTED_SEGMENT_XML'
          ? 'Select the single .segment.json artifact; legacy Segment XML is not supported.'
          : 'Select explicit, bounded, authored-only sources without links or conflicting identities.'),
    );
    this.name = 'DeployInputError';
  }
}

/**
 * Refuse an unusable DLO, DMO, mapping, relationship, data stream, data transform, segment or identity resolution file, keeping the validator's explanation of the offending key.
 * @param {unknown} error Validator refusal.
 * @returns {DeployInputError} INVALID_SOURCE refusal.
 */
function invalidSource(error: unknown): DeployInputError {
  const explanation = explanationOf(error);
  // A refused c__dataSpace key keeps its own code; every other refusal is INVALID_SOURCE.
  const code = (error as { code?: unknown } | null)?.code;
  const refusal = new DeployInputError(
    dataSpaceFieldCodes.find((known) => known === code) ?? 'INVALID_SOURCE',
    explanation,
  );
  if (explanation !== undefined) replaceExplanation(refusal, explanation);
  return refusal;
}

/**
 * Refuse an explicitly named verbatim file before any API call.
 * @param {VerbatimDocument} document Verbatim document.
 * @returns {DeployInputError} Refusal naming kind, name and reason.
 */
function verbatimRefusal(document: VerbatimDocument): DeployInputError {
  const message = verbatimRefusalMessage(document);
  const error = new DeployInputError('VERBATIM_NOT_DEPLOYABLE', message);
  replaceExplanation(error, message);
  return error;
}

export type SegmentDeployInput = {
  /** `data360/segments/<apiName>.segment.json` under the project root. */
  path: string;
  /** The SQL file of each model next to it, `<apiName>.segment.<model>.sql`, in model order. */
  codePaths: readonly string[];
  /** The JSON with every model's SQL joined back. */
  document: SegmentDocument;
  inputDigest: string;
};
export type SupportedDeployInput = SegmentDeployInput;
export type IdentityResolutionDeployInput = {
  path: string;
  document: IdentityResolutionDocument;
  inputDigest: string;
};
export type CalculatedInsightDeployInput = {
  /** `data360/calculatedInsights/<apiName>.calculatedInsight-meta.json`. */
  path: string;
  /** The SQL file next to it, `<apiName>.calculatedInsight-meta.sql`. */
  companionPath: string;
  /** The JSON with its SQL joined back. */
  native: NativeCalculatedInsight;
  /** Kind, identity and the objects the SQL names, for selection and ordering. */
  document: CalculatedInsightReference;
  inputDigest: string;
};
export type DloDeployInput = {
  path: string;
  document: DloDocument;
  inputDigest: string;
};
export type NativeDmoDeployInput = {
  path: string;
  document: NativeDmoDocument;
  inputDigest: string;
};

/**
 * Identify a native DMO input by its canonical path.
 * @param {object} input Captured input.
 * @param {string} input.path Selected path.
 * @returns {boolean} Native canonical path.
 */
export function isNativeDmoInput(input: { path: string }): input is NativeDmoDeployInput {
  return input.path.endsWith('.dmo-meta.json');
}

/**
 * Admit canonical native DMO content with immutable byte binding.
 * @param {string} file Absolute selected member.
 * @returns {Promise<NativeDmoDeployInput>} Frozen source input.
 */
async function readNativeDmoInput(file: string): Promise<NativeDmoDeployInput> {
  const name = path.basename(file).slice(0, -'.dmo-meta.json'.length);
  const directory = path.dirname(file);
  if (
    !nativeDmoName.test(name) ||
    path.basename(directory) !== 'dmo' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: NativeDmoDocument;
  try {
    document = validateNativeDmoDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

export type MappingDeployInput = {
  path: string;
  document: NativeMappingDocument;
  inputDigest: string;
};

/**
 * Admit canonical mapping JSON without a Metadata XML fallback.
 * @param {string} file Exact local mapping member.
 * @returns {Promise<MappingDeployInput>} Immutable content and byte binding.
 */
async function readMappingInput(file: string): Promise<MappingDeployInput> {
  const name = path.basename(file).slice(0, -'.mapping-meta.json'.length);
  const directory = path.dirname(file);
  if (
    !nativeMappingName.test(name) ||
    path.basename(directory) !== 'mapping' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: NativeMappingDocument;
  try {
    document = validateNativeMappingDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

export type DataStreamDeployInput = {
  path: string;
  document: DataStreamDocument | CrmDataStreamDocument;
  inputDigest: string;
};

/**
 * Admit only canonical stream JSON using the existing bounded no-link exact-byte reader.
 * @param {string} file Absolute selected member.
 * @returns {Promise<DataStreamDeployInput>} Detached frozen intent and byte binding.
 */
async function readDataStreamInput(file: string): Promise<DataStreamDeployInput> {
  const suffix = '.data-stream-meta.json';
  const name = path.basename(file).slice(0, -suffix.length);
  const directory = path.dirname(file);
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(name) ||
    path.basename(directory) !== 'data-stream' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: DataStreamDocument | CrmDataStreamDocument;
  try {
    document = validateAnyDataStreamDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Re-admit every exact local byte and immutable logical input before relying on it.
 * @param {DataStreamDeployInput} input Captured stream admission.
 * @returns {Promise<void>} Resolves only without local drift.
 */
export async function verifyDataStreamInputDigest(input: DataStreamDeployInput): Promise<void> {
  try {
    const current = await readDataStreamInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

export type NativeDataGraphDeployInput = {
  path: string;
  document: NativeDataGraphDocument;
  inputDigest: string;
};

/**
 * Admit native Graph bytes using the existing bounded no-link reader.
 * @param {string} file Exact native artifact.
 * @returns {Promise<NativeDataGraphDeployInput>} Byte-bound source.
 */
async function readNativeDataGraphInput(file: string): Promise<NativeDataGraphDeployInput> {
  const name = path.basename(file).slice(0, -'.native-dataGraph.json'.length);
  const directory = path.dirname(file);
  if (
    !dataGraphName.test(name) ||
    path.basename(directory) !== 'dataGraphs' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: NativeDataGraphDocument;
  try {
    document = validateNativeDataGraphDocument(strictJson(decode(bytes)));
    if (document.definition.name !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Re-admit native Graph exact bytes and logical intent before mutation.
 * @param {NativeDataGraphDeployInput} input Captured source.
 */
export async function verifyNativeDataGraphInputDigest(
  input: NativeDataGraphDeployInput,
): Promise<void> {
  const fresh = await readNativeDataGraphInput(input.path);
  if (
    fresh.inputDigest !== input.inputDigest ||
    JSON.stringify(fresh.document) !== JSON.stringify(authoredDocument(input))
  )
    refuse();
}

export type DataTransformDeployInput = {
  path: string;
  document: DataTransformDocument;
  inputDigest: string;
};

/**
 * Admit only canonical input-shaped Transform JSON with exact name and byte binding.
 * @param {string} file Absolute selected member.
 * @returns {Promise<DataTransformDeployInput>} Immutable admitted input.
 */
async function readDataTransformInput(file: string): Promise<DataTransformDeployInput> {
  const suffix = '.dataTransform.json';
  const name = path.basename(file).slice(0, -suffix.length);
  const directory = path.dirname(file);
  if (
    !file.endsWith(suffix) ||
    !dataTransformName.test(name) ||
    path.basename(directory) !== 'dataTransforms' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: DataTransformDocument;
  try {
    document = validateDataTransformDocument(strictJson(decode(bytes)));
    if (document.definition.name !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Re-admit exact Transform bytes and logical intent immediately before mutation.
 * @param {DataTransformDeployInput} input Captured immutable admission.
 * @returns {Promise<void>} Resolves only without local drift.
 */
export async function verifyDataTransformInputDigest(
  input: DataTransformDeployInput,
): Promise<void> {
  try {
    const current = await readDataTransformInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

export type RelationshipDeployInput = {
  path: string;
  document: NativeRelationshipDocument;
  inputDigest: string;
};

/**
 * Admit canonical relationship JSON whose file name is the relationship name.
 * @param {string} file Exact local relationship member.
 * @returns {Promise<RelationshipDeployInput>} Immutable content and byte binding.
 */
export async function readRelationshipInput(file: string): Promise<RelationshipDeployInput> {
  const name = path.basename(file).slice(0, -'.relationship-meta.json'.length);
  const directory = path.dirname(file);
  if (
    !file.endsWith('.relationship-meta.json') ||
    !nativeRelationshipName.test(name) ||
    path.basename(directory) !== 'relationship' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: NativeRelationshipDocument;
  try {
    document = validateNativeRelationshipDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

// The file's own content of an input whose document a cross-data-space deploy translated in
// memory: every re-check of the file's bytes compares against this, never the translation.
const authoredDocuments = new WeakMap<object, unknown>();

/**
 * The document the file holds: for an input translated into another data space, the original.
 * @param {{document: unknown}} input Admitted input.
 * @param {unknown} input.document Its document, translated or as read.
 * @returns {unknown} The file's document.
 */
export function authoredDocument(input: { document: unknown }): unknown {
  return authoredDocuments.has(input) ? authoredDocuments.get(input) : input.document;
}

// The same for the insight document (JSON with SQL) of a translated calculated insight.
const authoredNatives = new WeakMap<object, unknown>();

/**
 * The insight document the files hold: for an insight translated into another data space, the
 * original.
 * @param {{native: unknown}} input Admitted calculated insight input.
 * @param {unknown} input.native Its insight document, translated or as read.
 * @returns {unknown} The files' insight document.
 */
export function authoredNative(input: { native: unknown }): unknown {
  return authoredNatives.has(input) ? authoredNatives.get(input) : input.native;
}

/**
 * A frozen copy of an admitted input that carries a translated document (and for a calculated
 * insight its translated insight document); its file checks still compare against what the
 * files hold.
 * @param {T} input Admitted input.
 * @param {unknown} document Translated document.
 * @param {unknown} [native] Translated insight document of a calculated insight.
 * @returns {T} The translated input.
 * @template T
 */
export function translatedDeployInput<T extends { document: unknown }>(
  input: T,
  document: unknown,
  native?: unknown,
): T {
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(document);
  freeze(native);
  const translated = Object.freeze({
    ...input,
    document,
    ...(native === undefined ? {} : { native }),
  });
  authoredDocuments.set(translated, authoredDocument(input));
  if (native !== undefined)
    authoredNatives.set(translated, authoredNative(input as unknown as { native: unknown }));
  return translated;
}

export type DeployInput =
  | DataTransformDeployInput
  | NativeDataGraphDeployInput
  | DataStreamDeployInput
  | MappingDeployInput
  | RelationshipDeployInput
  | NativeDmoDeployInput
  | SupportedDeployInput
  | IdentityResolutionDeployInput
  | CalculatedInsightDeployInput
  | DloDeployInput;

/**
 * Admit strict single-file source-backed DLO content and freeze its exact bytes.
 * @param {string} file Absolute selected member.
 * @returns {Promise<DloDeployInput>} Immutable local input.
 */
async function readDloInput(file: string): Promise<DloDeployInput> {
  const suffix = '.dlo-meta.json';
  const name = path.basename(file).slice(0, -suffix.length);
  const directory = path.dirname(file);
  if (
    !file.endsWith(suffix) ||
    !dloName.test(name) ||
    path.basename(directory) !== 'dlo' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: DloDocument;
  try {
    document = validateDloDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Verify only immutable local bytes and identity, independent of legitimate remote stage changes.
 * @param {DloDeployInput} input Original input.
 * @returns {Promise<void>} Resolves only without local drift.
 */
export async function verifyDloInputDigest(input: DloDeployInput): Promise<void> {
  try {
    const current = await readDloInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

/**
 * Narrow executable families; IR admission does not authorize public routing.
 * @param {DeployInput} input Admitted input.
 * @returns {boolean} Whether an existing public route supports this family.
 */
export function isSupportedDeployInput(
  input: DeployInput,
): input is SupportedDeployInput | CalculatedInsightDeployInput {
  return input.document.kind === 'segment' || input.document.kind === 'calculated-insight';
}

/**
 * Admit one canonical IR file with immutable logical content and exact byte digest.
 * @param {string} file Exact absolute member.
 * @returns {Promise<IdentityResolutionDeployInput>} Detached frozen admission.
 */
async function readIdentityResolutionInput(file: string): Promise<IdentityResolutionDeployInput> {
  const suffix = '.identityResolution.json';
  const name = path.basename(file).slice(0, -suffix.length);
  const directory = path.dirname(file);
  if (
    !file.endsWith(suffix) ||
    !identityResolutionName.test(name) ||
    path.basename(directory) !== 'identityResolution' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: IdentityResolutionDocument;
  try {
    document = validateIdentityResolutionDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error: unknown) {
    throw invalidSource(error);
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({
    path: file,
    document,
    inputDigest: createHash('sha256').update(bytes).digest('hex'),
  });
}

/**
 * Re-admit an IR snapshot before relying on the original immutable bytes.
 * @param {IdentityResolutionDeployInput} input Captured admission.
 * @returns {Promise<void>} Resolves only for unchanged exact bytes.
 */
export async function verifyIdentityResolutionInputDigest(
  input: IdentityResolutionDeployInput,
): Promise<void> {
  try {
    const current = await readIdentityResolutionInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}
export type DeployInputFlags = {
  cwd: string;
  sourceDir?: readonly string[];
  metadata?: readonly string[];
  /**
   * Verbatim files (retrieved as-is) are skipped with a warning inside a selected folder and
   * refused (VERBATIM_NOT_DEPLOYABLE) when named directly. `skip` also skips named ones: a Git
   * range names every changed file.
   */
  verbatim?: 'skip';
};

const skippedWarnings = new WeakMap<object, readonly string[]>();

/**
 * The warnings of the verbatim files a {@link readDeployInputs} call skipped, one per file.
 * @param {readonly unknown[]} inputs Array that call returned.
 * @returns {readonly string[]} Warnings; empty for any other array.
 */
export function skippedVerbatimWarnings(inputs: readonly unknown[]): readonly string[] {
  return skippedWarnings.get(inputs) ?? [];
}
const refuse = (): never => {
  throw new DeployInputError('UNSAFE_SOURCE');
};
const decode = (bytes: Buffer): string =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const canonical = (value: string): string =>
  process.platform === 'win32' ? value.toLowerCase() : value;

/**
 * Inspect every path component without admitting symlinks, junctions or canonical aliases.
 * @param {string} file Absolute selected path.
 * @returns {Promise<import('node:fs').Stats>} Checked filesystem entry.
 */
async function inspect(file: string): Promise<import('node:fs').Stats> {
  const parent = path.dirname(file);
  if (parent !== file) {
    const ancestor = await inspect(parent);
    if (!ancestor.isDirectory()) refuse();
  }
  const stat = await lstat(file);
  if (stat.isSymbolicLink() || canonical(await realpath(file)) !== canonical(file)) refuse();
  return stat;
}

/**
 * Parse JSON without silently accepting duplicate or escaped-equivalent object keys.
 * @param {string} text Complete UTF-8 source.
 * @returns {unknown} Parsed JSON value.
 */
function strictJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const stack: Array<Set<string> | undefined> = [];
  const tokens = /"(?:[^"\\]|\\.)*"|[{}[\]]/gu;
  for (const token of text.matchAll(tokens)) {
    switch (token[0]) {
      case '{': {
        stack.push(new Set());
        break;
      }
      case '[': {
        stack.push(undefined);
        break;
      }
      case '}':
      case ']': {
        stack.pop();
        break;
      }
      default: {
        if (/^\s*:/u.test(text.slice(token.index + token[0].length))) {
          const key = JSON.parse(token[0]) as string;
          const keys = stack.at(-1)!;
          if (keys.has(key)) throw new DeployInputError('INVALID_SOURCE');
          keys.add(key);
        }
      }
    }
  }
  return value;
}

/**
 * Read bounded exact bytes while binding the open handle and no-link path before and after.
 * @param {string} file Absolute member path.
 * @returns {Promise<Buffer>} Admitted original bytes.
 */
async function memberBytes(file: string): Promise<Buffer> {
  const before = await inspect(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576) refuse();
  const handle = await open(file, 'r');
  try {
    const opened = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1) refuse();
    const buffer = Buffer.alloc(1_048_577);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    const current = await inspect(file);
    if (
      length > 1_048_576 ||
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.dev !== before.dev ||
      current.ino !== before.ino ||
      current.nlink !== 1 ||
      current.mtimeMs !== before.mtimeMs ||
      current.ctimeMs !== before.ctimeMs
    )
      refuse();
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

/** The kind a verbatim file must carry, by the suffix of its canonical file name. */
const verbatimSuffixes: ReadonlyArray<[string, VerbatimKind]> = [
  ['.dmo-meta.json', 'dmo'],
  ['.dlo-meta.json', 'dlo'],
  ['.mapping-meta.json', 'mapping'],
  ['.relationship-meta.json', 'relationship'],
  ['.data-stream-meta.json', 'data-stream'],
  ['.dataTransform.json', 'data-transform'],
  ['.native-dataGraph.json', 'native-data-graph'],
  ['.identityResolution.json', 'identity-resolution'],
  [ciJsonSuffix, 'calculated-insight'],
  [segmentJsonSuffix, 'segment'],
];

/**
 * The verbatim document a selected file belongs to: the file itself, or the JSON of the
 * calculated insight or segment whose SQL file it is. Its kind and name must match the file name.
 * @param {string} file Absolute selected file.
 * @returns {Promise<{path: string; document: VerbatimDocument} | undefined>} JSON path and
 * verbatim document, or undefined for anything else (the family reader then decides).
 */
async function verbatimMember(
  file: string,
): Promise<{ path: string; document: VerbatimDocument } | undefined> {
  const entry = path.basename(file);
  const directory = path.dirname(file);
  let json = file;
  if (isCalculatedInsightMember(file))
    json = path.join(directory, `${entry.slice(0, entry.indexOf(ciMemberInfix))}${ciJsonSuffix}`);
  else if (isSegmentMember(file) && entry.includes(segmentMemberInfix))
    json = path.join(
      directory,
      `${entry.slice(0, entry.indexOf(segmentMemberInfix))}${segmentJsonSuffix}`,
    );
  const suffix = verbatimSuffixes.find(([ending]) => json.endsWith(ending));
  if (!suffix) return undefined;
  let document: VerbatimDocument | undefined;
  try {
    document = parseVerbatimDocument(decode(await memberBytes(json)));
  } catch {
    return undefined;
  }
  return document &&
    document.kind === suffix[1] &&
    path.basename(json) === `${document.identity.apiName}${suffix[0]}`
    ? { path: json, document }
    : undefined;
}

/**
 * Admit a segment from its JSON or one of its SQL files: the JSON joined with exactly one
 * `<apiName>.segment.<model>.sql` per model, every byte bound as one component. A missing JSON or
 * SQL file, SQL left in the JSON, or any other `<apiName>.segment.*` file beside them is
 * INVALID_SOURCE.
 * @param {string} file Absolute selected JSON or SQL file.
 * @returns {Promise<SegmentDeployInput>} Detached immutable admission.
 */
async function readSegmentDeployInput(file: string): Promise<SegmentDeployInput> {
  const entry = path.basename(file);
  const marker = entry.indexOf(segmentMemberInfix);
  const name = marker > 0 ? entry.slice(0, marker) : '';
  const directory = path.dirname(file);
  if (
    path.basename(directory) !== 'segments' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  if (!segmentName.test(name)) throw new DeployInputError('INVALID_SOURCE');
  const jsonName = `${name}${segmentJsonSuffix}`;
  const jsonPath = path.join(directory, jsonName);
  await inspect(directory);
  const prefix = `${name}${segmentMemberInfix}`;
  const codeFiles: Array<{ path: string; name: string }> = [];
  let hasJson = false;
  const entries = await readdir(directory);
  // eslint-disable-next-line unicorn/no-array-sort -- Sort the fresh directory listing within the existing TypeScript library target.
  for (const member of entries.sort()) {
    if (!member.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    if (member === jsonName) {
      hasJson = true;
      continue;
    }
    const match = /^([A-Za-z0-9][A-Za-z0-9_]*)\.sql$/u.exec(member.slice(prefix.length));
    if (!member.startsWith(prefix) || !match) throw new DeployInputError('INVALID_SOURCE');
    codeFiles.push({ path: path.join(directory, member), name: match[1] });
  }
  if (!hasJson || codeFiles.length > 64) throw new DeployInputError('INVALID_SOURCE');
  const members = [jsonPath, ...codeFiles.map((code) => code.path)];
  const bytes: Buffer[] = [];
  for (const member of members) bytes.push(await memberBytes(member));
  let document: SegmentDocument;
  try {
    document = joinSegmentFiles(
      strictJson(decode(bytes[0])),
      codeFiles.map((code, index) => ({
        extension: 'sql',
        name: code.name,
        text: decode(bytes[index + 1]),
      })),
    );
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch (error: unknown) {
    throw invalidSource(error);
  }
  for (const [index, member] of members.entries()) {
    const after = await memberBytes(member);
    if (!after.equals(bytes[index])) refuse();
  }
  const hash = createHash('sha256');
  for (const content of bytes) hash.update(String(content.length)).update(':').update(content);
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  // The files as found on disk, in model order.
  const byModel = new Map(codeFiles.map((code) => [code.name.toLowerCase(), code.path]));
  const models =
    document.spec.segmentType === 'DBT' ? (document.spec as DbtSegmentSpec).models : [];
  const codePaths = models.map((model) => byModel.get(model.name.toLowerCase())!);
  return Object.freeze({
    path: jsonPath,
    codePaths: Object.freeze(codePaths),
    document,
    inputDigest: hash.digest('hex'),
  });
}

/**
 * Admit a calculated insight from its JSON or its SQL file: the JSON joined with exactly its
 * declared code files (`<apiName>.calculatedInsight-meta.sql`), every byte bound as one component.
 * A missing JSON or SQL file, or any other `<apiName>.calculatedInsight-meta.*` file beside them,
 * is INVALID_SOURCE.
 * @param {string} file Absolute selected JSON or code file.
 * @returns {Promise<CalculatedInsightDeployInput>} Complete immutable admission.
 */
async function readCalculatedInsightInput(file: string): Promise<CalculatedInsightDeployInput> {
  const base = path.basename(file);
  const marker = base.indexOf(ciMemberInfix);
  const apiName = marker > 0 ? base.slice(0, marker) : '';
  const directory = path.dirname(file);
  if (
    path.basename(directory) !== 'calculatedInsights' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  if (!calculatedInsightName.test(apiName)) throw new DeployInputError('INVALID_SOURCE');
  const jsonName = `${apiName}${ciJsonSuffix}`;
  const jsonPath = path.join(directory, jsonName);
  await inspect(directory);
  const prefix = `${apiName}${ciMemberInfix}`;
  const codeFiles: Array<{ path: string; extension: string; name?: string }> = [];
  let hasJson = false;
  const entries = await readdir(directory);
  // eslint-disable-next-line unicorn/no-array-sort -- Sort the fresh directory listing within the existing TypeScript library target.
  for (const entry of entries.sort()) {
    if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    if (entry === jsonName) {
      hasJson = true;
      continue;
    }
    const match = /^(?:([A-Za-z0-9][A-Za-z0-9_]*)\.)?([a-z]+)$/u.exec(entry.slice(prefix.length));
    if (!entry.startsWith(prefix) || !match || match[2] === 'json')
      throw new DeployInputError('INVALID_SOURCE');
    codeFiles.push({
      path: path.join(directory, entry),
      extension: match[2],
      ...(match[1] === undefined ? {} : { name: match[1] }),
    });
  }
  if (!hasJson || codeFiles.length > 16) throw new DeployInputError('INVALID_SOURCE');
  const members = [jsonPath, ...codeFiles.map((code) => code.path)];
  const bytes: Buffer[] = [];
  for (const member of members) bytes.push(await memberBytes(member));
  let native: NativeCalculatedInsight;
  let document: CalculatedInsightReference;
  try {
    const json = decode(bytes[0]);
    strictJson(json);
    native = parseNativeCalculatedInsight(
      json,
      codeFiles.map((code, index) => ({
        extension: code.extension,
        ...(code.name === undefined ? {} : { name: code.name }),
        text: decode(bytes[index + 1]),
      })),
    );
    if (native.apiName !== apiName) throw new Error('Identity mismatch');
    document = calculatedInsightReference(native);
  } catch (error) {
    throw invalidSource(error);
  }
  for (const [index, member] of members.entries()) {
    const after = await memberBytes(member);
    if (!after.equals(bytes[index])) refuse();
  }
  const hash = createHash('sha256');
  for (const content of bytes) hash.update(String(content.length)).update(':').update(content);
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(native);
  freeze(document);
  return Object.freeze({
    path: jsonPath,
    companionPath: codeFiles[0].path,
    native,
    document,
    inputDigest: hash.digest('hex'),
  });
}

/**
 * Re-admit the JSON and SQL files before relying on captured logical content or bytes.
 * @param {CalculatedInsightDeployInput} input Original immutable admission.
 * @returns {Promise<void>} Resolves only for unchanged original bytes.
 */
export async function verifyCalculatedInsightInputDigest(
  input: CalculatedInsightDeployInput,
): Promise<void> {
  try {
    const current = await readCalculatedInsightInput(input.path);
    if (
      current.companionPath !== input.companionPath ||
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.native) !== JSON.stringify(authoredNative(input)) ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

/**
 * Revalidate JSON bytes and logical intent before relying on captured admission.
 * @param {SegmentDeployInput} input Previously admitted JSON.
 * @returns {Promise<void>} Resolves only if original bytes and content remain unchanged.
 */
export async function verifySegmentInputDigest(input: SegmentDeployInput): Promise<void> {
  try {
    const current = await readSegmentDeployInput(input.path);
    if (
      JSON.stringify(current.codePaths) !== JSON.stringify(input.codePaths) ||
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

/**
 * Capture admitted exact bytes without changing the existing input shape or Segment JSON digest.
 * @param {DeployInput} input Previously admitted local input.
 * @returns {Promise<string>} Exact byte digest after identity/content re-admission.
 */
export async function captureDeployInputDigest(input: DeployInput): Promise<string> {
  if (input.document.kind === 'data-transform') {
    await verifyDataTransformInputDigest(input as DataTransformDeployInput);
    return (input as DataTransformDeployInput).inputDigest;
  }
  if (input.document.kind === 'native-data-graph') {
    await verifyNativeDataGraphInputDigest(input as NativeDataGraphDeployInput);
    return (input as NativeDataGraphDeployInput).inputDigest;
  }
  if (input.document.kind === 'data-stream') {
    await verifyDataStreamInputDigest(input as DataStreamDeployInput);
    return (input as DataStreamDeployInput).inputDigest;
  }
  if (input.document.kind === 'mapping') {
    const current = await readMappingInput(input.path);
    if (
      current.inputDigest !== (input as MappingDeployInput).inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
    return current.inputDigest;
  }
  if (input.document.kind === 'relationship') {
    const current = await readRelationshipInput(input.path);
    if (
      current.inputDigest !== (input as RelationshipDeployInput).inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
    return current.inputDigest;
  }
  if (isNativeDmoInput(input)) {
    const current = await readNativeDmoInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(authoredDocument(input))
    )
      refuse();
    return current.inputDigest;
  }
  if (input.document.kind === 'dlo') {
    await verifyDloInputDigest(input as DloDeployInput);
    return (input as DloDeployInput).inputDigest;
  }
  if (input.document.kind === 'identity-resolution') {
    await verifyIdentityResolutionInputDigest(input as IdentityResolutionDeployInput);
    return (input as IdentityResolutionDeployInput).inputDigest;
  }
  if (input.document.kind === 'calculated-insight') {
    await verifyCalculatedInsightInputDigest(input as CalculatedInsightDeployInput);
    return (input as CalculatedInsightDeployInput).inputDigest;
  }
  await verifySegmentInputDigest(input as SegmentDeployInput);
  return (input as SegmentDeployInput).inputDigest;
}

/**
 * Resolve explicit authored files/directories or exact project-relative DMO/Segment selectors, read-only.
 * Limits are 256 files, 1 MiB per file, 1024 visited entries and 16 directory levels.
 * Repeated identical selections coalesce; different files claiming one identity fail closed.
 * @param {DeployInputFlags} flags Explicit mutually exclusive source modes and captured cwd.
 * @returns {Promise<DeployInput[]>} Sorted, independently validated authored inputs.
 */
export async function readDeployInputs(flags: DeployInputFlags): Promise<DeployInput[]> {
  const { sourceDir, metadata } = flags;
  const values = sourceDir ?? metadata;
  if (
    (sourceDir === undefined) === (metadata === undefined) ||
    !values?.length ||
    values.some((value) => typeof value !== 'string' || !value.trim() || value !== value.trim())
  )
    throw new DeployInputError('INVALID_SELECTION');
  if (!path.isAbsolute(flags.cwd)) throw new DeployInputError('INVALID_SELECTION');
  const selectors = metadata?.map((value) => {
    if (value.startsWith('data-transform:') && dataTransformName.test(value.slice(15)))
      return { kind: 'data-transform', name: value.slice(15) };
    if (/^data-stream:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value))
      return { kind: 'data-stream', name: value.slice(12) };
    if (value.startsWith('mapping:') && nativeMappingName.test(value.slice(8)))
      return { kind: 'mapping', name: value.slice(8) };
    if (value.startsWith('relationship:') && nativeRelationshipName.test(value.slice(13)))
      return { kind: 'relationship', name: value.slice(13) };
    if (value.startsWith('dmo:') && nativeDmoName.test(value.slice(4)))
      return { kind: 'dmo', name: value.slice(4) };
    if (value.startsWith('dlo:') && dloName.test(value.slice(4)) && value.endsWith('__dll'))
      return { kind: 'dlo', name: value.slice(4) };
    if (value.startsWith('data-graph:') && dataGraphName.test(value.slice(11)))
      return { kind: 'data-graph', name: value.slice(11) };
    if (value.startsWith('identity-resolution:') && identityResolutionName.test(value.slice(20)))
      return { kind: 'identity-resolution', name: value.slice(20) };
    if (value.startsWith('calculated-insight:') && calculatedInsightName.test(value.slice(19)))
      return { kind: 'calculated-insight', name: value.slice(19) };
    if (value.startsWith('segment:') && segmentName.test(value.slice(8)))
      return { kind: 'segment', name: value.slice(8) };
    throw new DeployInputError('INVALID_SELECTION');
  });
  const roots = selectors
    ? selectors.map(({ kind, name }) =>
        kind === 'data-transform'
          ? path.join(flags.cwd, 'data360', 'dataTransforms', `${name}.dataTransform.json`)
          : kind === 'dmo'
            ? path.join(flags.cwd, 'data360', 'dmo', `${name}.dmo-meta.json`)
            : kind === 'data-stream'
              ? path.join(flags.cwd, 'data360', 'data-stream', `${name}.data-stream-meta.json`)
              : kind === 'mapping'
                ? path.join(flags.cwd, 'data360', 'mapping', `${name}.mapping-meta.json`)
                : kind === 'relationship'
                  ? path.join(
                      flags.cwd,
                      'data360',
                      'relationship',
                      `${name}.relationship-meta.json`,
                    )
                  : kind === 'dlo'
                    ? path.join(flags.cwd, 'data360', 'dlo', `${name}.dlo-meta.json`)
                    : kind === 'data-graph'
                      ? path.join(
                          flags.cwd,
                          'data360',
                          'dataGraphs',
                          `${name}.native-dataGraph.json`,
                        )
                      : kind === 'calculated-insight'
                        ? path.join(
                            flags.cwd,
                            'data360',
                            'calculatedInsights',
                            `${name}${ciJsonSuffix}`,
                          )
                        : kind === 'identity-resolution'
                          ? path.join(
                              flags.cwd,
                              'data360',
                              'identityResolution',
                              `${name}.identityResolution.json`,
                            )
                          : path.join(flags.cwd, 'data360', 'segments', `${name}.segment.json`),
      )
    : sourceDir!.map((value) => {
        if (
          value.includes(String.fromCodePoint(0)) ||
          /[*?]/u.test(value) ||
          value.split(/[\\/]/u).includes('..') ||
          /^[A-Za-z]:[^\\/]/u.test(value)
        )
          throw new DeployInputError('INVALID_SELECTION');
        return path.resolve(flags.cwd, value);
      });
  const candidates = new Map<string, string>();
  // Files named directly (a selector or an exact --source-dir file), not found in a folder.
  const named = new Set<string>();
  let visited = 0;
  const walk = async (file: string, depth: number): Promise<void> => {
    if (++visited > 1024 || depth > 16) refuse();
    if (depth === 0) named.add(canonical(file));
    const stat = await inspect(file);
    if (stat.isDirectory()) {
      if (path.dirname(file) === file) refuse();
      const entries = await readdir(file);
      // eslint-disable-next-line unicorn/no-array-sort -- Sort the fresh directory listing within the existing TypeScript library target.
      for (const entry of entries.sort()) await walk(path.join(file, entry), depth + 1);
    } else {
      if (file.endsWith('.marketSegmentDefinition-meta.xml')) {
        if (depth === 0) throw new DeployInputError('UNSUPPORTED_SEGMENT_XML');
        return;
      }
      if (
        !stat.isFile() ||
        (path.extname(file) !== '.json' &&
          !isCalculatedInsightMember(file) &&
          !isSegmentMember(file)) ||
        stat.nlink !== 1 ||
        stat.size > 1_048_576
      )
        refuse();
      candidates.set(canonical(file), file);
      if (candidates.size > 256) refuse();
    }
  };
  try {
    for (const root of new Set(roots)) {
      if (selectors) {
        const selected = await lstat(root);
        if (!selected.isFile()) refuse();
      }
      await walk(root, 0);
    }
    if (candidates.size === 0) throw new DeployInputError('INVALID_SELECTION');
    const inputs: DeployInput[] = [];
    const identities = new Set<string>();
    const skipped = new Set<string>();
    const warnings: string[] = [];
    // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh candidate array within the existing TypeScript library target.
    for (const file of [...candidates.values()].sort()) {
      // A file retrieved as-is is never sent: refused when named, otherwise skipped with a warning.
      const verbatim = await verbatimMember(file);
      if (verbatim) {
        if (flags.verbatim !== 'skip' && named.has(canonical(file)))
          throw verbatimRefusal(verbatim.document);
        if (!skipped.has(canonical(verbatim.path))) {
          skipped.add(canonical(verbatim.path));
          warnings.push(verbatimSkipWarning(verbatim.document, verbatim.path));
        }
        continue;
      }
      if (isCalculatedInsightMember(file)) {
        const input = await readCalculatedInsightInput(file);
        const key =
          `calculated-insight:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        if (
          inputs.some(
            (prior) =>
              prior.document.kind === 'calculated-insight' &&
              canonical(prior.path) === canonical(input.path),
          )
        )
          continue;
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) =>
              item.kind === 'calculated-insight' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.dataTransform.json')) {
        const input = await readDataTransformInput(file);
        const name = input.document.definition.name;
        const key = `data-transform:default:${name}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some((item) => item.kind === 'data-transform' && item.name === name)
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.data-stream-meta.json')) {
        const input = await readDataStreamInput(file);
        const key =
          // A stream name is unique in the org, whatever data spaces its DLO belongs to.
          `data-stream:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'data-stream' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.mapping-meta.json')) {
        const input = await readMappingInput(file);
        const key =
          `mapping:${input.document.c__dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'mapping' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.relationship-meta.json')) {
        const input = await readRelationshipInput(file);
        const key =
          `relationship:${input.document.c__dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        // Deploy matches relationships by binding, so two files with one binding are one identity.
        const { sourceObjectName, sourceFieldName, targetObjectName, targetFieldName } =
          input.document.spec;
        const binding =
          `relationship-binding:${input.document.c__dataSpace}:${sourceObjectName}:${sourceFieldName}:${targetObjectName}:${targetFieldName}`.toLowerCase();
        if (identities.has(key) || identities.has(binding))
          throw new DeployInputError('DUPLICATE_IDENTITY');
        identities.add(binding);
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'relationship' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.dmo-meta.json')) {
        const input = await readNativeDmoInput(file);
        const key =
          `dmo:${input.document.c__dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'dmo' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.dlo-meta.json')) {
        const input = await readDloInput(file);
        // A DLO name is unique in the org, whatever data spaces it belongs to.
        const key = `dlo:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'dlo' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.native-dataGraph.json')) {
        const input = await readNativeDataGraphInput(file);
        const name = input.document.definition.name as string;
        // A graph name is unique in the org, whatever data space it is in.
        const key = `data-graph:${name}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some((item) => item.kind === 'data-graph' && item.name === name)
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.identityResolution.json')) {
        const input = await readIdentityResolutionInput(file);
        const key =
          `identity-resolution:${input.document.c__dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) =>
              item.kind === 'identity-resolution' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (isSegmentMember(file)) {
        const paired = await readSegmentDeployInput(file);
        const key =
          `segment:${paired.document.c__dataSpace}:${paired.document.identity.apiName}`.toLowerCase();
        const prior = inputs.find(
          (input) =>
            input.document.kind === 'segment' && canonical(input.path) === canonical(paired.path),
        );
        if (prior) continue;
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'segment' && item.name === paired.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(paired);
        continue;
      }
      throw new DeployInputError('INVALID_SOURCE');
    }
    if (warnings.length > 0) skippedWarnings.set(inputs, Object.freeze(warnings));
    return inputs;
  } catch (error: unknown) {
    if (error instanceof DeployInputError) throw error;
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}

/**
 * Admit a deleted verbatim file (retrieved as-is): it is deleted by family and name, needs no SQL
 * file and no spec. A relationship's source DMO comes from the raw list entry it keeps.
 * @param {DeletedArtifactKind} kind Family derived from the canonical path.
 * @param {string} name Canonical name derived from the path.
 * @param {Buffer} bytes Exact revision bytes (the JSON file).
 * @returns {object | undefined} Identity, the frozen verbatim document and a relationship's
 * source DMO; undefined when the bytes are not a verbatim document of that family.
 */
function admitDeletedVerbatim(
  kind: DeletedArtifactKind,
  name: string,
  bytes: Buffer,
):
  | {
      identity: { dataSpace: string; apiName: string };
      document: VerbatimDocument;
      sourceObjectName?: string;
    }
  | undefined {
  let value: unknown;
  try {
    value = strictJson(decode(bytes));
  } catch {
    return undefined;
  }
  if (!isVerbatimDocument(value, kind === 'data-graph' ? 'native-data-graph' : kind))
    return undefined;
  const source = (value.verbatim.native as { sourceObject?: { name?: unknown } } | null)
    ?.sourceObject?.name;
  if (
    value.identity.apiName !== name ||
    (kind === 'relationship' && (typeof source !== 'string' || !relationshipDmoName.test(source)))
  )
    throw new DeployInputError('INVALID_SOURCE');
  return {
    identity: verbatimIdentity(value),
    document: Object.freeze(value),
    ...(kind === 'relationship' ? { sourceObjectName: source as string } : {}),
  };
}

/**
 * Admit bytes of a file read from a Git revision (no worktree file exists) by the family
 * validator, and take the identity from the content, which must agree with the canonical name.
 * The file is read as retrieve writes it (retrieve mode): a delete needs its family, identity
 * and what the delete itself uses, not a deployable definition.
 * @param {DeletedArtifactKind} kind Family derived from the canonical path.
 * @param {string} name Canonical name derived from the path.
 * @param {Buffer} bytes Exact revision bytes (the JSON file).
 * @param {Array<{name?: string; bytes: Buffer}>} [code] SQL file bytes from the same revision: the
 * calculated insight's one SQL file, or one per segment model (`name` is the model).
 * @returns {object} Content identity and the validated base document (deeply frozen), plus the
 * source DMO of a relationship.
 */
export function admitDeletedArtifact(
  kind: DeletedArtifactKind,
  name: string,
  bytes: Buffer,
  code?: ReadonlyArray<{ name?: string; bytes: Buffer }>,
): {
  /** No single data space for a DLO: its spaces are the document's c__dataSpace list. */
  identity: { dataSpace?: string; apiName: string };
  document: DeployInput['document'] | VerbatimDocument;
  sourceObjectName?: string;
} {
  const verbatim = admitDeletedVerbatim(kind, name, bytes);
  if (verbatim) return verbatim;
  try {
    const value = strictJson(decode(bytes));
    let identity: { dataSpace?: string; apiName: string };
    let document: DeployInput['document'];
    let sourceObjectName: string | undefined;
    switch (kind) {
      case 'dmo': {
        const dmo = validateNativeDmoDocument(value, 'retrieve');
        document = dmo;
        identity = { dataSpace: dmo.c__dataSpace, apiName: dmo.identity.apiName };
        break;
      }
      case 'dlo': {
        document = validateDloDocument(value, 'retrieve');
        ({ identity } = document);
        break;
      }
      case 'mapping': {
        const mapping = validateNativeMappingDocument(value, 'retrieve');
        document = mapping;
        identity = { dataSpace: mapping.c__dataSpace, apiName: mapping.identity.apiName };
        break;
      }
      case 'relationship': {
        const relationship = validateNativeRelationshipDocument(value, 'retrieve');
        document = relationship;
        identity = { dataSpace: relationship.c__dataSpace, apiName: relationship.identity.apiName };
        sourceObjectName = relationship.spec.sourceObjectName;
        break;
      }
      case 'data-stream': {
        document = validateAnyDataStreamDocument(value, 'retrieve');
        ({ identity } = document);
        break;
      }
      case 'data-transform': {
        const transform = validateDataTransformDocument(value, 'retrieve');
        document = transform;
        identity = {
          dataSpace: transform.c__dataSpace,
          apiName: transform.definition.name as string,
        };
        break;
      }
      case 'data-graph': {
        const graph = validateNativeDataGraphDocument(value, 'retrieve');
        document = graph;
        identity = { dataSpace: graph.c__dataSpace, apiName: graph.definition.name as string };
        break;
      }
      case 'identity-resolution': {
        const ruleset = validateIdentityResolutionDocument(value, 'retrieve');
        document = ruleset;
        identity = { dataSpace: ruleset.c__dataSpace, apiName: ruleset.identity.apiName };
        break;
      }
      case 'calculated-insight': {
        if (code?.length !== 1 || code[0].name !== undefined) throw new Error('Missing SQL');
        const native = parseNativeCalculatedInsight(decode(bytes), [
          { extension: 'sql', text: decode(code[0].bytes) },
        ]);
        document = calculatedInsightReference(native);
        identity = { dataSpace: native.dataSpace, apiName: native.apiName };
        break;
      }
      case 'segment': {
        document = joinSegmentFiles(
          value,
          (code ?? []).map((file) => ({
            extension: 'sql',
            ...(file.name === undefined ? {} : { name: file.name }),
            text: decode(file.bytes),
          })),
          'retrieve',
        );
        identity = { dataSpace: document.c__dataSpace, apiName: document.identity.apiName };
        break;
      }
    }
    if (identity.apiName !== name) throw new Error('Identity mismatch');
    const freeze = (target: object): void => {
      for (const child of Object.values(target))
        if (child && typeof child === 'object') freeze(child as object);
      Object.freeze(target);
    };
    freeze(document);
    return {
      identity:
        identity.dataSpace === undefined
          ? { apiName: identity.apiName }
          : { dataSpace: identity.dataSpace, apiName: identity.apiName },
      document,
      ...(sourceObjectName === undefined ? {} : { sourceObjectName }),
    };
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
  }
}

export { type DeletedArtifactKind } from './path-selector.js';
