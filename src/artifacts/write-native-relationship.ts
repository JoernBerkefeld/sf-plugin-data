import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NativeRelationshipError,
  validateNativeRelationshipDocument,
} from './native-relationship-document.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

/**
 * Validate real ancestors before publication.
 * @param {string} directory Destination directory.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new NativeRelationshipError('UNSAFE_PATH');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new NativeRelationshipError('UNSAFE_PATH');
  }
}

/**
 * Bind existing bytes to one unchanged regular file.
 * @param {string} file Exact destination.
 * @returns {Promise<Buffer | undefined>} Existing bytes or confirmed absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const before = await inspectSegmentPath(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576)
      throw new NativeRelationshipError('UNSAFE_PATH');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
        throw new NativeRelationshipError('OUTPUT_CHANGED');
      const buffer = Buffer.alloc(1_048_577);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const after = await handle.stat();
      const current = await inspectSegmentPath(file);
      if (
        length !== before.size ||
        length > 1_048_576 ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        current.dev !== before.dev ||
        current.ino !== before.ino ||
        current.nlink !== 1 ||
        current.mtimeMs !== before.mtimeMs ||
        current.ctimeMs !== before.ctimeMs
      )
        throw new NativeRelationshipError('OUTPUT_CHANGED');
      return buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Publish one saved relationship; the name is the generated source name, not a send key.
 * @param {unknown} value Portable relationship definition.
 * @param {string} projectRoot Explicit project root.
 * @param {boolean} overwrite Permit replacing differing bytes.
 * @returns {Promise<{path: string; outcome: 'retrieved' | 'unchanged'}>} Publication receipt.
 */
export async function writeNativeRelationshipDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  const document = validateNativeRelationshipDocument(value);
  const bytes = Buffer.from(`${JSON.stringify(document, undefined, 2)}\n`);
  if (
    !path.isAbsolute(projectRoot) ||
    projectRoot !== projectRoot.trim() ||
    /[*?\0]/u.test(projectRoot) ||
    projectRoot.split(/[\\/]/u).includes('..') ||
    bytes.length > 1_048_576
  )
    throw new NativeRelationshipError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  if (path.dirname(root) === root) throw new NativeRelationshipError('UNSAFE_PATH');
  const destination = path.join(
    root,
    'data360',
    'relationship',
    `${document.identity.apiName}.relationship-meta.json`,
  );
  let published = false;
  try {
    await ensure(path.dirname(destination));
    const previous = await existing(destination);
    if (previous?.equals(bytes)) return { path: destination, outcome: 'unchanged' };
    if (previous) {
      const saved = validateNativeRelationshipDocument(JSON.parse(previous.toString('utf8')));
      if (saved.identity.dataSpace !== document.identity.dataSpace)
        throw new NativeRelationshipError('RELATIONSHIP_DATASPACE_COLLISION');
      if (!overwrite) throw new NativeRelationshipError('OVERWRITE_REQUIRED');
    }
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-relationship-output-'));
    const marker = await open(path.join(staging, 'ownership'), 'wx');
    try {
      await marker.writeFile(randomUUID());
    } finally {
      await marker.close();
    }
    const stagedPath = path.join(staging, 'document.json');
    const handle = await open(stagedPath, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await ensure(path.dirname(destination));
    const current = await existing(destination);
    if (previous === undefined ? current !== undefined : !current?.equals(previous))
      throw new NativeRelationshipError('OUTPUT_CHANGED');
    if (previous) await rename(stagedPath, destination);
    else {
      await link(stagedPath, destination);
      published = true;
      await unlink(stagedPath);
    }
    published = true;
    const completed = await existing(destination);
    if (!completed?.equals(bytes)) throw new NativeRelationshipError('OUTPUT_CHANGED');
    return { path: destination, outcome: 'retrieved' };
  } catch (error) {
    if (published) throw new NativeRelationshipError('PARTIAL_RELATIONSHIP_OUTPUT');
    if (error instanceof NativeRelationshipError) throw error;
    throw new NativeRelationshipError('OUTPUT_FAILED');
  }
}
