import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { buildDmoCreateRequestFromDocument, validateDmoDocument } from './dmo-document.js';
import type { DmoDocument } from './dmo-document.js';

/** Payload-free local selection refusal. */
export class DeployInputError extends Error {
  public constructor(
    public readonly code:
      'INVALID_SELECTION' | 'UNSAFE_SOURCE' | 'INVALID_SOURCE' | 'DUPLICATE_IDENTITY',
  ) {
    super(
      'Select explicit, bounded, authored-only DMO sources without links or conflicting identities.',
    );
    this.name = 'DeployInputError';
  }
}

export type DeployInput = { path: string; document: DmoDocument };
export type DeployInputFlags = {
  cwd: string;
  sourceDir?: readonly string[];
  metadata?: readonly string[];
};
const refuse = (): never => {
  throw new DeployInputError('UNSAFE_SOURCE');
};
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
 * Resolve explicit authored files/directories or exact project-relative DMO selectors, read-only.
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
    if (!/^dmo:[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dlm$/u.test(value))
      throw new DeployInputError('INVALID_SELECTION');
    return value.slice(4);
  });
  const roots = selectors
    ? selectors.map((name) => path.join(flags.cwd, 'data360', 'default', 'dmo', `${name}.json`))
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
      if (
        !stat.isFile() ||
        path.extname(file) !== '.json' ||
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
      if (selectors && !selectors.includes(document.identity.apiName))
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
