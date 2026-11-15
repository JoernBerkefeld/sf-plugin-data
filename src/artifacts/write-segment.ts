import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codeFilePath } from './code-fields.js';
import {
  SegmentError,
  joinSegmentFiles,
  serializeSegmentFiles,
  validateSegmentDocument,
} from './segment-document.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';
import { isVerbatimDocument, serializeVerbatimDocument } from './verbatim-document.js';

const filesystemPublication = { link, rename, unlink };

/**
 * Create only missing real directories, validating each ancestor first.
 * @param {string} directory Absolute directory.
 * @returns {Promise<void>} Resolves for a real no-link chain.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const present = await inspectSegmentPath(directory);
    if (!present.isDirectory()) throw new SegmentError('UNSAFE_PATH');
    return;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await mkdir(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await inspectSegmentPath(directory);
  if (!stat.isDirectory()) throw new SegmentError('UNSAFE_PATH');
}

/**
 * Read an exact regular single-link file or distinguish ENOENT only.
 * @param {string} file Absolute path.
 * @returns {Promise<Buffer | undefined>} Original bytes or absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const stat = await inspectSegmentPath(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576)
      throw new SegmentError('UNSAFE_PATH');
    return await readFile(file);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Resolve configured package output without permitting escapes or ambiguous default packages.
 * @param {string} root Absolute selected project root.
 * @returns {Promise<string>} Configured package source root or standard force-app default.
 */
export async function segmentSourceRoot(root: string): Promise<string> {
  const config = await existing(path.join(root, 'sfdx-project.json'));
  let directory = 'force-app';
  if (config) {
    const project = JSON.parse(config.toString('utf8')) as {
      packageDirectories?: Array<{ path?: unknown; default?: unknown }>;
    };
    const packages = project.packageDirectories;
    if (!Array.isArray(packages) || packages.length === 0)
      throw new SegmentError('INVALID_PROJECT');
    const defaults = packages.filter((entry) => entry.default === true);
    const selected =
      defaults.length === 1 ? defaults[0] : packages.length === 1 ? packages[0] : undefined;
    if (
      !selected ||
      typeof selected.path !== 'string' ||
      !selected.path ||
      path.isAbsolute(selected.path) ||
      /[:*?]/u.test(selected.path) ||
      selected.path.split(/[\\/]/u).includes('..')
    )
      throw new SegmentError('INVALID_PROJECT');
    directory = selected.path;
  }
  const destination = path.resolve(root, directory, 'main', 'default');
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new SegmentError('UNSAFE_PATH');
  return destination;
}

/**
 * SQL files of a segment in its folder that are not among the files being written (a model the
 * org no longer has).
 * @param {string} directory Absolute segments folder.
 * @param {string} apiName Segment name.
 * @param {readonly string[]} files Absolute files being written.
 * @returns {Promise<string[]>} Absolute stale SQL files, sorted.
 */
async function staleSqlFiles(
  directory: string,
  apiName: string,
  files: readonly string[],
): Promise<string[]> {
  const prefix = `${apiName}.segment.`.toLowerCase();
  const own = new Set(files.map((file) => path.basename(file).toLowerCase()));
  const entries = await readdir(directory);
  const stale = entries.filter((entry) => {
    const lower = entry.toLowerCase();
    return lower.startsWith(prefix) && lower.endsWith('.sql') && !own.has(lower);
  });

  stale.sort();
  return stale.map((entry) => path.join(directory, entry));
}

/**
 * Publish one segment as `data360/segments/<apiName>.segment.json` plus one
 * `<apiName>.segment.<model>.sql` per model, with exact-byte conflict and drift admission. A SQL
 * file of a model the document no longer has is removed (it needs `overwrite`).
 * @param {unknown} value Complete authored candidate (SQL included).
 * @param {string} projectRoot Selected output project root.
 * @param {boolean} overwrite Permit differing existing files.
 * @param {object} publication Narrow filesystem seam for publication-failure regression tests.
 * @returns {Promise<{path: string; codePaths: string[]; outcome: 'retrieved' | 'unchanged'}>} JSON path, SQL paths and outcome.
 */
export async function writeSegmentDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
  publication = filesystemPublication,
): Promise<{ path: string; codePaths: string[]; outcome: 'retrieved' | 'unchanged' }> {
  // A verbatim segment is its JSON alone; every SQL file of that segment is then stale.
  const verbatim = isVerbatimDocument(value, 'segment') ? value : undefined;
  const strict = verbatim ? undefined : validateSegmentDocument(value);
  const document = verbatim ?? strict!;
  const { json, files: code } = verbatim
    ? { json: serializeVerbatimDocument(verbatim), files: [] }
    : serializeSegmentFiles(strict!);
  if (!projectRoot.trim()) throw new SegmentError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  let published = 0;
  try {
    const base = await segmentSourceRoot(root);
    const jsonPath = path.join(
      base,
      'data360',
      'segments',
      `${document.identity.apiName}.segment.json`,
    );
    const files = [jsonPath, ...code.map((file) => codeFilePath(jsonPath, file))];
    const codePaths = files.slice(1);
    const bytes = [Buffer.from(json), ...code.map((file) => Buffer.from(file.text))];
    if (bytes.some((content) => content.length > 1_048_576)) throw new SegmentError('UNSAFE_PATH');
    for (const file of files) await ensure(path.dirname(file));
    const previous = await Promise.all(files.map((file) => existing(file)));
    const stale = await staleSqlFiles(path.dirname(jsonPath), document.identity.apiName, files);
    for (const file of stale) await existing(file);
    const changed = files.map((_, index) => !previous[index]?.equals(bytes[index]));
    if (!changed.some(Boolean) && stale.length === 0)
      return { path: files[0], codePaths, outcome: 'unchanged' };
    if (
      !overwrite &&
      (stale.length > 0 || previous.some((value, index) => value && changed[index]))
    )
      throw new SegmentError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-segment-output-'));
    const marker = await open(path.join(staging, 'ownership'), 'wx');
    await marker.writeFile(randomUUID());
    await marker.close();
    for (const [index, content] of bytes.entries()) {
      const handle = await open(path.join(staging, `${index}`), 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    // Bind the observed destination again before publication.
    for (const [index, file] of files.entries()) {
      await ensure(path.dirname(file));
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new SegmentError('OUTPUT_CHANGED');
    }
    for (const [index, file] of files.entries()) {
      if (!changed[index]) continue;
      const staged = path.join(staging, `${index}`);
      await ensure(path.dirname(file));
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new SegmentError('OUTPUT_CHANGED');
      if (previous[index]) await publication.rename(staged, file);
      else {
        await publication.link(staged, file);
        // The destination exists even when removing the staging link fails.
        published++;
        await publication.unlink(staged);
        continue;
      }
      published++;
    }
    for (const file of stale) {
      await existing(file);
      published++;
      await publication.unlink(file);
    }
    const completed = await Promise.all(files.map((file) => existing(file)));
    if (completed.some((value, index) => !value?.equals(bytes[index])))
      throw new SegmentError('OUTPUT_CHANGED');
    const left = await staleSqlFiles(path.dirname(jsonPath), document.identity.apiName, files);
    if (left.length > 0) throw new SegmentError('OUTPUT_CHANGED');
    if (!verbatim)
      joinSegmentFiles(
        JSON.parse(completed[0]!.toString('utf8')),
        code.map((file, index) => ({ ...file, text: completed[index + 1]!.toString('utf8') })),
      );
    return { path: files[0], codePaths, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new SegmentError('PARTIAL_SEGMENT_OUTPUT');
    if (error instanceof SegmentError) throw error;
    throw new SegmentError('OUTPUT_FAILED');
  }
}
