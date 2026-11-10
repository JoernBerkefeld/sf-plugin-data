import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readdir, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DataTransformError,
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from './data-transform-document.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';
import { dataTransformArtifactPath } from '../services/retrieve-data-transform.js';

/**
 * Create missing real directories without accepting linked ancestors.
 * @param {string} directory Exact destination directory.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new DataTransformError('UNSAFE_PATH');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new DataTransformError('UNSAFE_PATH');
  }
}

/**
 * Read bounded bytes bound to an unchanged regular single-link destination.
 * @param {string} file Exact destination.
 * @returns {Promise<Buffer | undefined>} Existing bytes or confirmed absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const before = await inspectSegmentPath(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576)
      throw new DataTransformError('UNSAFE_PATH');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
        throw new DataTransformError('OUTPUT_CHANGED');
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
        throw new DataTransformError('OUTPUT_CHANGED');
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
 * Refuse case and trailing-space filename aliases across platforms.
 * @param {string} directory Publication directory.
 * @param {string} filename Exact artifact filename.
 */
async function checkFilename(directory: string, filename: string): Promise<void> {
  for (const entry of await readdir(directory))
    if (entry.replace(/[ .]+$/u, '').toLowerCase() === filename.toLowerCase() && entry !== filename)
      throw new DataTransformError('TRANSFORM_FILENAME_COLLISION');
}

/**
 * Publish authored Transform input separately from runtime observations.
 * @param {unknown} value Qualified portable document.
 * @param {string} projectRoot Absolute output root.
 * @param {boolean} overwrite Permit differing existing bytes.
 * @returns {Promise<{path: string; outcome: 'retrieved' | 'unchanged'}>} Exact publication receipt.
 */
export async function writeDataTransformDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  const document = validateDataTransformDocument(value);
  const bytes = Buffer.from(serializeDataTransformDocument(document));
  if (
    !path.isAbsolute(projectRoot) ||
    projectRoot !== projectRoot.trim() ||
    /[*?\0]/u.test(projectRoot) ||
    projectRoot.split(/[\\/]/u).includes('..') ||
    bytes.length > 1_048_576
  )
    throw new DataTransformError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  if (path.dirname(root) === root) throw new DataTransformError('UNSAFE_PATH');
  const destination = path.join(
    root,
    dataTransformArtifactPath(document.definition.name as string),
  );
  const directory = path.dirname(destination);
  const filename = path.basename(destination);
  let published = false;
  try {
    await ensure(directory);
    await checkFilename(directory, filename);
    const previous = await existing(destination);
    if (previous?.equals(bytes)) return { path: destination, outcome: 'unchanged' };
    if (previous) {
      const saved = validateDataTransformDocument(JSON.parse(previous.toString('utf8')));
      if (saved.definition.name !== document.definition.name)
        throw new DataTransformError('TRANSFORM_FILENAME_COLLISION');
      if (!overwrite) throw new DataTransformError('OVERWRITE_REQUIRED');
    }
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-transform-output-'));
    const marker = await open(path.join(staging, 'ownership'), 'wx');
    try {
      await marker.writeFile(randomUUID());
    } finally {
      await marker.close();
    }
    const staged = path.join(staging, 'document.json');
    const handle = await open(staged, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await ensure(directory);
    await checkFilename(directory, filename);
    const current = await existing(destination);
    if (previous === undefined ? current !== undefined : !current?.equals(previous))
      throw new DataTransformError('OUTPUT_CHANGED');
    if (previous) await rename(staged, destination);
    else {
      await link(staged, destination);
      published = true;
      await unlink(staged);
    }
    published = true;
    const completed = await existing(destination);
    if (!completed?.equals(bytes)) throw new DataTransformError('OUTPUT_CHANGED');
    return { path: destination, outcome: 'retrieved' };
  } catch (error) {
    if (published) throw new DataTransformError('PARTIAL_TRANSFORM_OUTPUT');
    if (error instanceof DataTransformError) throw error;
    throw new DataTransformError('OUTPUT_FAILED');
  }
}
