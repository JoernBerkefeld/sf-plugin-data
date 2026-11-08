import { validateNativeDataGraphDocument } from './native-data-graph-document.js';
import type { NativeDataGraphDocument } from './native-data-graph-document.js';
import { validateDataStreamDocument } from './data-stream-document.js';
import type { DataStreamDocument } from './data-stream-document.js';
import { nativeMappingName, validateNativeMappingDocument } from './native-mapping-document.js';
import type { NativeMappingDocument } from './native-mapping-document.js';
import { nativeDmoName, validateNativeDmoDocument } from './native-dmo-document.js';
import type { NativeDmoDocument } from './native-dmo-document.js';
import { dloName, validateDloDocument } from './dlo-document.js';
import type { DloDocument } from './dlo-document.js';
import { dataGraphName, validateDataGraphDocument } from './data-graph-document.js';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { segmentName, validateSegmentDocument } from './segment-document.js';
import type { SegmentDocument } from './segment-document.js';
import { segmentSourceRoot } from './write-segment.js';
import { buildDmoCreateRequestFromDocument, validateDmoDocument } from './dmo-document.js';
import type { DmoDocument } from './dmo-document.js';
import {
  identityResolutionName,
  validateIdentityResolutionDocument,
} from './identity-resolution-document.js';
import type { IdentityResolutionDocument } from './identity-resolution-document.js';
import {
  calculatedInsightName,
  validateCalculatedInsightPair,
} from './calculated-insight-document.js';
import type { CalculatedInsightDocument } from './calculated-insight-document.js';

/** Payload-free local selection refusal. */
export class DeployInputError extends Error {
  public constructor(
    public readonly code:
      | 'INVALID_SELECTION'
      | 'UNSAFE_SOURCE'
      | 'INVALID_SOURCE'
      | 'DUPLICATE_IDENTITY'
      | 'UNSUPPORTED_SEGMENT_XML',
  ) {
    super(
      code === 'UNSUPPORTED_SEGMENT_XML'
        ? 'Select the single .segment.json artifact; legacy Segment XML is not supported.'
        : 'Select explicit, bounded, authored-only sources without links or conflicting identities.',
    );
    this.name = 'DeployInputError';
  }
}

export type SegmentDeployInput = {
  path: string;
  document: SegmentDocument;
  inputDigest: string;
};
export type SupportedDeployInput = { path: string; document: DmoDocument } | SegmentDeployInput;
export type IdentityResolutionDeployInput = {
  path: string;
  document: IdentityResolutionDocument;
  inputDigest: string;
};
export type CalculatedInsightDeployInput = {
  path: string;
  companionPath: string;
  document: CalculatedInsightDocument;
  inputDigest: string;
};
export type DataGraphDeployInput = {
  path: string;
  document: import('./data-graph-document.js').DataGraphDocument;
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
 * Identify the canonical native path rather than interpreting legacy DMO fields.
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
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
  document: DataStreamDocument;
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
  let document: DataStreamDocument;
  try {
    document = validateDataStreamDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
      JSON.stringify(current.document) !== JSON.stringify(input.document)
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
  const base = path.dirname(path.dirname(directory));
  if (
    !dataGraphName.test(name) ||
    path.basename(directory) !== 'dataGraphs' ||
    path.basename(path.dirname(directory)) !== 'data360' ||
    path.basename(base) !== 'default' ||
    path.basename(path.dirname(base)) !== 'main'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: NativeDataGraphDocument;
  try {
    document = validateNativeDataGraphDocument(strictJson(decode(bytes)));
    if (document.definition.name !== name) throw new Error('Identity mismatch');
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
    JSON.stringify(fresh.document) !== JSON.stringify(input.document)
  )
    refuse();
}

export type DeployInput =
  | NativeDataGraphDeployInput
  | DataStreamDeployInput
  | MappingDeployInput
  | NativeDmoDeployInput
  | SupportedDeployInput
  | IdentityResolutionDeployInput
  | CalculatedInsightDeployInput
  | DataGraphDeployInput
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
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
      JSON.stringify(current.document) !== JSON.stringify(input.document)
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
  return (
    input.document.kind === 'dmo' ||
    input.document.kind === 'segment' ||
    input.document.kind === 'calculated-insight'
  );
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
  const base = path.dirname(path.dirname(directory));
  if (
    !file.endsWith(suffix) ||
    !identityResolutionName.test(name) ||
    path.basename(directory) !== 'identityResolution' ||
    path.basename(path.dirname(directory)) !== 'data360' ||
    path.basename(base) !== 'default' ||
    path.basename(path.dirname(base)) !== 'main'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: IdentityResolutionDocument;
  try {
    document = validateIdentityResolutionDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
      JSON.stringify(current.document) !== JSON.stringify(input.document)
    )
      refuse();
  } catch {
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}
/**
 * Admit one canonical Graph file and freeze its exact authored content.
 * @param {string} file Absolute selected file.
 * @returns {Promise<DataGraphDeployInput>} Immutable input.
 */
async function readDataGraphInput(file: string): Promise<DataGraphDeployInput> {
  const suffix = '.dataGraph.json';
  const name = path.basename(file).slice(0, -suffix.length);
  const directory = path.dirname(file);
  const base = path.dirname(path.dirname(directory));
  if (
    !file.endsWith(suffix) ||
    !dataGraphName.test(name) ||
    path.basename(directory) !== 'dataGraphs' ||
    path.basename(path.dirname(directory)) !== 'data360' ||
    path.basename(base) !== 'default' ||
    path.basename(path.dirname(base)) !== 'main'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: DataGraphDeployInput['document'];
  try {
    document = validateDataGraphDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
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
 * Re-admit captured Graph bytes and logical identity before use.
 * @param {DataGraphDeployInput} input Immutable admission.
 * @returns {Promise<void>} Resolves only without drift.
 */
export async function verifyDataGraphInputDigest(input: DataGraphDeployInput): Promise<void> {
  try {
    const current = await readDataGraphInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(input.document)
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
};
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

/**
 * Admit one canonical Segment JSON and bind its exact bytes.
 * @param {string} file Absolute selected member.
 * @returns {Promise<SegmentDeployInput>} Detached immutable JSON admission.
 */
async function readSegmentDeployInput(file: string): Promise<SegmentDeployInput> {
  const suffix = '.segment.json';
  const name = path.basename(file).slice(0, -suffix.length);
  if (!segmentName.test(name)) throw new DeployInputError('INVALID_SOURCE');
  const directory = path.dirname(file);
  const base = path.dirname(path.dirname(directory));
  if (
    !file.endsWith(suffix) ||
    path.basename(base) !== 'default' ||
    path.basename(path.dirname(base)) !== 'main' ||
    path.basename(directory) !== 'segments' ||
    path.basename(path.dirname(directory)) !== 'data360'
  )
    throw new DeployInputError('INVALID_SELECTION');
  const bytes = await memberBytes(file);
  let document: SegmentDocument;
  try {
    document = validateSegmentDocument(strictJson(decode(bytes)));
    if (document.identity.apiName !== name) throw new Error('Identity mismatch');
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
  }
  const after = await memberBytes(file);
  if (!after.equals(bytes)) refuse();
  const inputDigest = createHash('sha256').update(bytes).digest('hex');
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({ path: file, document, inputDigest });
}

/**
 * Admit either canonical CI member and freeze both exact byte sets as one component.
 * @param {string} file Absolute selected member.
 * @returns {Promise<CalculatedInsightDeployInput>} Complete immutable pair admission.
 */
async function readCalculatedInsightInput(file: string): Promise<CalculatedInsightDeployInput> {
  const xmlSuffix = '.mktCalcInsightObjectDef-meta.xml';
  const jsonSuffix = '.calculatedInsight.json';
  const xml = file.endsWith(xmlSuffix);
  const stem = path.basename(file).slice(0, -(xml ? xmlSuffix.length : jsonSuffix.length));
  const apiName = xml ? `${stem}__cio` : stem;
  if (!calculatedInsightName.test(apiName)) throw new DeployInputError('INVALID_SOURCE');
  const member = apiName.slice(0, -5);
  const directory = path.dirname(file);
  const base = xml ? path.dirname(directory) : path.dirname(path.dirname(directory));
  if (
    path.basename(base) !== 'default' ||
    path.basename(path.dirname(base)) !== 'main' ||
    (xml
      ? path.basename(directory) !== 'mktCalcInsightObjectDefs'
      : path.basename(directory) !== 'calculatedInsights' ||
        path.basename(path.dirname(directory)) !== 'data360')
  )
    throw new DeployInputError('INVALID_SELECTION');
  const xmlPath = path.join(base, 'mktCalcInsightObjectDefs', `${member}${xmlSuffix}`);
  const companionPath = path.join(base, 'data360', 'calculatedInsights', `${apiName}${jsonSuffix}`);
  const xmlBytes = await memberBytes(xmlPath);
  const jsonBytes = await memberBytes(companionPath);
  let document: CalculatedInsightDocument;
  try {
    document = validateCalculatedInsightPair(
      strictJson(decode(jsonBytes)),
      decode(xmlBytes),
      member,
    );
  } catch {
    throw new DeployInputError('INVALID_SOURCE');
  }
  const xmlAfter = await memberBytes(xmlPath);
  const jsonAfter = await memberBytes(companionPath);
  if (!xmlAfter.equals(xmlBytes) || !jsonAfter.equals(jsonBytes)) refuse();
  const inputDigest = createHash('sha256')
    .update(String(xmlBytes.length))
    .update(':')
    .update(xmlBytes)
    .update(String(jsonBytes.length))
    .update(':')
    .update(jsonBytes)
    .digest('hex');
  const freeze = (value: object): void => {
    for (const child of Object.values(value))
      if (child && typeof child === 'object') freeze(child as object);
    Object.freeze(value);
  };
  freeze(document);
  return Object.freeze({ path: xmlPath, companionPath, document, inputDigest });
}

/**
 * Re-admit both CI members before relying on captured logical content or bytes.
 * @param {CalculatedInsightDeployInput} input Original immutable admission.
 * @returns {Promise<void>} Resolves only for unchanged original pair bytes.
 */
export async function verifyCalculatedInsightInputDigest(
  input: CalculatedInsightDeployInput,
): Promise<void> {
  try {
    const current = await readCalculatedInsightInput(input.path);
    if (
      current.companionPath !== input.companionPath ||
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(input.document)
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
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(input.document)
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
      JSON.stringify(current.document) !== JSON.stringify(input.document)
    )
      refuse();
    return current.inputDigest;
  }
  if (isNativeDmoInput(input)) {
    const current = await readNativeDmoInput(input.path);
    if (
      current.inputDigest !== input.inputDigest ||
      JSON.stringify(current.document) !== JSON.stringify(input.document)
    )
      refuse();
    return current.inputDigest;
  }
  if (input.document.kind === 'dlo') {
    await verifyDloInputDigest(input as DloDeployInput);
    return (input as DloDeployInput).inputDigest;
  }
  if (input.document.kind === 'data-graph') {
    await verifyDataGraphInputDigest(input as DataGraphDeployInput);
    return (input as DataGraphDeployInput).inputDigest;
  }
  if (input.document.kind === 'identity-resolution') {
    await verifyIdentityResolutionInputDigest(input as IdentityResolutionDeployInput);
    return (input as IdentityResolutionDeployInput).inputDigest;
  }
  if (input.document.kind === 'calculated-insight') {
    await verifyCalculatedInsightInputDigest(input as CalculatedInsightDeployInput);
    return (input as CalculatedInsightDeployInput).inputDigest;
  }
  if (input.document.kind === 'segment') {
    await verifySegmentInputDigest(input as SegmentDeployInput);
    return (input as SegmentDeployInput).inputDigest;
  }
  const bytes = await memberBytes(input.path);
  const document = validateDmoDocument(strictJson(decode(bytes)));
  buildDmoCreateRequestFromDocument(document, 'default');
  if (JSON.stringify(document) !== JSON.stringify(input.document))
    throw new DeployInputError('UNSAFE_SOURCE');
  return createHash('sha256').update(bytes).digest('hex');
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
    if (/^data-stream:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value))
      return { kind: 'data-stream', name: value.slice(12) };
    if (value.startsWith('mapping:') && nativeMappingName.test(value.slice(8)))
      return { kind: 'mapping', name: value.slice(8) };
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
  const base = selectors?.some(
    (item) =>
      item.kind !== 'dmo' &&
      item.kind !== 'dlo' &&
      item.kind !== 'mapping' &&
      item.kind !== 'data-stream',
  )
    ? await segmentSourceRoot(flags.cwd)
    : undefined;
  // Explicit legacy adapter for inventories/dependency consumers and existing saved projects.
  const legacyDmos = new Set<string>();
  for (const selector of selectors ?? []) {
    if (selector.kind !== 'dmo') continue;
    try {
      await lstat(path.join(flags.cwd, 'data360', 'dmo', `${selector.name}.dmo-meta.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      legacyDmos.add(selector.name);
    }
  }
  const nativeGraphs = new Set<string>();
  for (const selector of selectors ?? []) {
    if (selector.kind !== 'data-graph') continue;
    try {
      await lstat(
        path.join(base!, 'data360', 'dataGraphs', `${selector.name}.native-dataGraph.json`),
      );
      nativeGraphs.add(selector.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const roots = selectors
    ? selectors.map(({ kind, name }) =>
        kind === 'dmo'
          ? legacyDmos.has(name)
            ? path.join(flags.cwd, 'data360', 'default', 'dmo', `${name}.json`)
            : path.join(flags.cwd, 'data360', 'dmo', `${name}.dmo-meta.json`)
          : kind === 'data-stream'
            ? path.join(flags.cwd, 'data360', 'data-stream', `${name}.data-stream-meta.json`)
            : kind === 'mapping'
              ? path.join(flags.cwd, 'data360', 'mapping', `${name}.mapping-meta.json`)
              : kind === 'dlo'
                ? path.join(flags.cwd, 'data360', 'dlo', `${name}.dlo-meta.json`)
                : kind === 'data-graph'
                  ? path.join(
                      base!,
                      'data360',
                      'dataGraphs',
                      `${name}${nativeGraphs.has(name) ? '.native-dataGraph.json' : '.dataGraph.json'}`,
                    )
                  : kind === 'calculated-insight'
                    ? path.join(
                        base!,
                        'data360',
                        'calculatedInsights',
                        `${name}.calculatedInsight.json`,
                      )
                    : kind === 'identity-resolution'
                      ? path.join(
                          base!,
                          'data360',
                          'identityResolution',
                          `${name}.identityResolution.json`,
                        )
                      : path.join(base!, 'data360', 'segments', `${name}.segment.json`),
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
  let visited = 0;
  const walk = async (file: string, depth: number): Promise<void> => {
    if (++visited > 1024 || depth > 16) refuse();
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
        (path.extname(file) !== '.json' && !file.endsWith('.mktCalcInsightObjectDef-meta.xml')) ||
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
    // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh candidate array within the existing TypeScript library target.
    for (const file of [...candidates.values()].sort()) {
      if (
        file.endsWith('.calculatedInsight.json') ||
        file.endsWith('.mktCalcInsightObjectDef-meta.xml')
      ) {
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
      if (file.endsWith('.data-stream-meta.json')) {
        const input = await readDataStreamInput(file);
        const key =
          `data-stream:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
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
          `mapping:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
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
      if (file.endsWith('.dmo-meta.json')) {
        const input = await readNativeDmoInput(file);
        const key =
          `dmo:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
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
        const key =
          `dlo:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
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
        const key = `data-graph:default:${name}`.toLowerCase();
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
      if (file.endsWith('.dataGraph.json')) {
        const input = await readDataGraphInput(file);
        const key =
          `data-graph:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
        if (identities.has(key)) throw new DeployInputError('DUPLICATE_IDENTITY');
        if (
          selectors &&
          !selectors.some(
            (item) => item.kind === 'data-graph' && item.name === input.document.identity.apiName,
          )
        )
          throw new DeployInputError('INVALID_SELECTION');
        identities.add(key);
        inputs.push(input);
        continue;
      }
      if (file.endsWith('.identityResolution.json')) {
        const input = await readIdentityResolutionInput(file);
        const key =
          `identity-resolution:${input.document.identity.dataSpace}:${input.document.identity.apiName}`.toLowerCase();
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
      if (file.endsWith('.segment.json')) {
        const paired = await readSegmentDeployInput(file);
        const key =
          `segment:${paired.document.identity.dataSpace}:${paired.document.identity.apiName}`.toLowerCase();
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
      const before = await inspect(file);
      const handle = await open(file, 'r');
      let text: string;
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.nlink !== 1 ||
          opened.dev !== before.dev ||
          opened.ino !== before.ino ||
          opened.size !== before.size
        )
          refuse();
        const buffer = Buffer.alloc(1_048_577);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
          if (bytesRead === 0) break;
          length += bytesRead;
        }
        const after = await handle.stat();
        if (
          length > 1_048_576 ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs
        )
          refuse();
        await inspect(file);
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          buffer.subarray(0, length),
        );
      } finally {
        await handle.close();
      }
      let document: DmoDocument;
      try {
        const parsed = strictJson(text);
        buildDmoCreateRequestFromDocument(parsed, 'default');
        document = validateDmoDocument(parsed);
      } catch {
        throw new DeployInputError('INVALID_SOURCE');
      }
      if (
        selectors &&
        !selectors.some((item) => item.kind === 'dmo' && item.name === document.identity.apiName)
      )
        throw new DeployInputError('INVALID_SELECTION');
      if (selectors && path.basename(file) !== `${document.identity.apiName}.json`)
        throw new DeployInputError('INVALID_SELECTION');
      const identity = `${document.identity.dataSpace}:${document.identity.apiName}`.toLowerCase();
      if (identities.has(identity)) throw new DeployInputError('DUPLICATE_IDENTITY');
      identities.add(identity);
      inputs.push({ path: file, document });
    }
    return inputs;
  } catch (error: unknown) {
    if (error instanceof DeployInputError) throw error;
    throw new DeployInputError('UNSAFE_SOURCE');
  }
}
