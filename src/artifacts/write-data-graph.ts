import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DataGraphError,
  serializeDataGraphDocument,
  validateDataGraphDocument,
} from './data-graph-document.js';
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
    if (!stat.isDirectory()) throw new DataGraphError('UNSAFE_PATH');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (error_: unknown) {
      if ((error_ as NodeJS.ErrnoException).code !== 'EEXIST') throw error_;
    }
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new DataGraphError('UNSAFE_PATH');
  }
}

/**
 * Read bounded single-link bytes bound to the inspected path and handle.
 * @param {string} file Absolute file.
 * @returns {Promise<Buffer | undefined>} Exact bytes or explicit absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const before = await inspectSegmentPath(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576)
      throw new DataGraphError('UNSAFE_PATH');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
        throw new DataGraphError('OUTPUT_CHANGED');
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
        throw new DataGraphError('OUTPUT_CHANGED');
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
 * Publish portable Graph JSON only, with owned OS-temp staging and no-clobber publication.
 * @param {unknown} value Complete portable document.
 * @param {string} projectRoot Absolute output project root.
 * @param {boolean} overwrite Permit differing existing bytes.
 * @param {object} publish Native publication seam for offline failure tests.
 * @returns {Promise<{path: string; outcome: 'retrieved' | 'unchanged'}>} Receipt.
 */
export async function writeDataGraphDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
  publish = publication,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  const document = validateDataGraphDocument(value);
  const bytes = Buffer.from(serializeDataGraphDocument(document));
  if (
    !path.isAbsolute(projectRoot) ||
    projectRoot !== projectRoot.trim() ||
    /[*?\0]/u.test(projectRoot) ||
    projectRoot.split(/[\\/]/u).includes('..') ||
    bytes.length > 1_048_576
  )
    throw new DataGraphError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  if (path.dirname(root) === root) throw new DataGraphError('UNSAFE_PATH');
  let published = false;
  try {
    const base = await segmentSourceRoot(root);
    const destination = path.join(
      base,
      'data360',
      'dataGraphs',
      `${document.identity.apiName}.dataGraph.json`,
    );
    await ensure(path.dirname(destination));
    const previous = await existing(destination);
    if (previous?.equals(bytes)) return { path: destination, outcome: 'unchanged' };
    if (previous && !overwrite) throw new DataGraphError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-graph-output-'));
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
      throw new DataGraphError('OUTPUT_CHANGED');
    if (previous) await publish.rename(stagedPath, destination);
    else {
      await publish.link(stagedPath, destination);
      published = true;
      // Unlink only the exact run-created staging entry, never recursively clean its root.
      await publish.unlink(stagedPath);
    }
    published = true;
    const completed = await existing(destination);
    if (!completed?.equals(bytes)) throw new DataGraphError('OUTPUT_CHANGED');
    validateDataGraphDocument(JSON.parse(completed.toString('utf8')));
    return { path: destination, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new DataGraphError('PARTIAL_DATA_GRAPH_OUTPUT');
    if (error instanceof DataGraphError) throw error;
    throw new DataGraphError('OUTPUT_FAILED');
  }
}
