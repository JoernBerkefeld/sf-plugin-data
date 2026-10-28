import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  IdentityResolutionError,
  serializeIdentityResolutionDocument,
  validateIdentityResolutionDocument,
} from './identity-resolution-document.js';
import { segmentSourceRoot } from './write-segment.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

const publication = { link, rename, unlink };

/**
 * Validate or create only a real directory chain.
 * @param {string} directory Absolute directory.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new IdentityResolutionError('UNSAFE_PATH');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (error_: unknown) {
      if ((error_ as NodeJS.ErrnoException).code !== 'EEXIST') throw error_;
    }
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new IdentityResolutionError('UNSAFE_PATH');
  }
}

/**
 * Read bounded single-link bytes while binding the handle to the inspected path.
 * @param {string} file Absolute file.
 * @returns {Promise<Buffer | undefined>} Exact bytes or explicit absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const before = await inspectSegmentPath(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576)
      throw new IdentityResolutionError('UNSAFE_PATH');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
        throw new IdentityResolutionError('OUTPUT_CHANGED');
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
        throw new IdentityResolutionError('OUTPUT_CHANGED');
      return buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Publish only complete portable IR JSON; runtime expectations never enter the file.
 * Staging stays in owned OS temp; cross-volume atomic operations fail closed.
 * @param {unknown} value Complete portable document.
 * @param {string} projectRoot Absolute output project root.
 * @param {boolean} overwrite Permit differing existing bytes.
 * @param {object} publish Native publication seam for offline race/failure tests.
 * @returns {Promise<{path: string; outcome: 'retrieved' | 'unchanged'}>} Validated receipt.
 */
export async function writeIdentityResolutionDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
  publish = publication,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  const document = validateIdentityResolutionDocument(value);
  const bytes = Buffer.from(serializeIdentityResolutionDocument(document));
  if (
    !path.isAbsolute(projectRoot) ||
    projectRoot !== projectRoot.trim() ||
    /[*?\0]/u.test(projectRoot) ||
    projectRoot.split(/[\\/]/u).includes('..') ||
    bytes.length > 1_048_576
  )
    throw new IdentityResolutionError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  if (path.dirname(root) === root) throw new IdentityResolutionError('UNSAFE_PATH');
  let published = false;
  try {
    const base = await segmentSourceRoot(root);
    const destination = path.join(
      base,
      'data360',
      'identityResolution',
      `${document.identity.logicalName}.identityResolution.json`,
    );
    await ensure(path.dirname(destination));
    const previous = await existing(destination);
    if (previous?.equals(bytes)) return { path: destination, outcome: 'unchanged' };
    if (previous && !overwrite) throw new IdentityResolutionError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-ir-output-'));
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
      throw new IdentityResolutionError('OUTPUT_CHANGED');
    if (previous) await publish.rename(stagedPath, destination);
    else {
      await publish.link(stagedPath, destination);
      published = true;
      // Remove only the exact run-created staging entry, never recursively clean the run root.
      await publish.unlink(stagedPath);
    }
    published = true;
    const completed = await existing(destination);
    if (!completed?.equals(bytes)) throw new IdentityResolutionError('OUTPUT_CHANGED');
    validateIdentityResolutionDocument(JSON.parse(completed.toString('utf8')));
    return { path: destination, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new IdentityResolutionError('PARTIAL_IDENTITY_RESOLUTION_OUTPUT');
    if (error instanceof IdentityResolutionError) throw error;
    throw new IdentityResolutionError('OUTPUT_FAILED');
  }
}
