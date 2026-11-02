import { randomUUID } from 'node:crypto';
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SegmentError } from './segment-document.js';
import { segmentSourceRoot } from './write-segment.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

const publication = { link, rename, copyFile };

export const dloName = /^[A-Za-z][A-Za-z0-9_]*__dll$/u;
export type DloSourceFile = { path: string; xml: string };

/**
 * Admit only the selected decomposed object definition and its exact field files.
 * @param {string} apiName Exact DLO API name.
 * @param {string} relative Relative component path.
 * @returns {boolean} Whether the path belongs to this selected object.
 */
export function isDloSourcePath(apiName: string, relative: string): boolean {
  if (!dloName.test(apiName)) return false;
  return (
    relative === `${apiName}.object-meta.xml` ||
    /^fields\/[A-Za-z][A-Za-z0-9_]*\.field-meta\.xml$/u.test(relative)
  );
}

/**
 * Create and validate real destination directories without following links.
 * @param {string} directory Absolute directory.
 * @returns {Promise<void>} Safe directory chain.
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
 * Read only a bounded regular single-link destination, or report absence.
 * @param {string} file Absolute file.
 * @returns {Promise<Buffer | undefined>} Previous bytes.
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
 * Remove only the exact exclusively created destination-side staging file.
 * @param {string} file Registered local staging path.
 * @returns {Promise<void>} Removed file or already-renamed absence.
 */
async function removeStagingFile(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Preserve standard decomposed XML bytes, preflighting every replacement before publication.
 * @param {string} apiName Exact selected DLO.
 * @param {DloSourceFile[]} files Independently retrieved object and fields.
 * @param {string} projectRoot Output project.
 * @param {boolean} overwrite Permit differing existing files.
 * @param {object} filesystem Narrow publication seam for cross-device regression coverage.
 * @returns {Promise<{path: string; paths: string[]; outcome: 'retrieved' | 'unchanged'}>} Published paths.
 */
export async function writeDloDefinition(
  apiName: string,
  files: DloSourceFile[],
  projectRoot: string,
  overwrite: boolean,
  filesystem = publication,
): Promise<{ path: string; paths: string[]; outcome: 'retrieved' | 'unchanged' }> {
  if (
    !projectRoot.trim() ||
    !dloName.test(apiName) ||
    files.length === 0 ||
    files.filter((file) => file.path === `${apiName}.object-meta.xml`).length !== 1 ||
    new Set(files.map((file) => file.path)).size !== files.length ||
    files.some(
      (file) =>
        !isDloSourcePath(apiName, file.path) ||
        !file.xml ||
        Buffer.byteLength(file.xml) > 1_048_576,
    )
  )
    throw new SegmentError('INVALID_DEFINITION');
  const base = path.join(await segmentSourceRoot(path.resolve(projectRoot)), 'objects', apiName);
  const paths = files.map((file) => path.join(base, file.path));
  const bytes = files.map((file) => Buffer.from(file.xml));
  const previous = await Promise.all(paths.map((file) => existing(file)));
  const changed = bytes.map((value, index) => !previous[index]?.equals(value));
  const receipt = { path: path.join(base, `${apiName}.object-meta.xml`), paths };
  if (!changed.some(Boolean)) return { ...receipt, outcome: 'unchanged' };
  if (!overwrite && previous.some((value, index) => value && changed[index]))
    throw new SegmentError('OVERWRITE_REQUIRED');
  verifyTemporaryDirectory();
  const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-dlo-output-'));
  await writeFile(path.join(staging, 'ownership'), randomUUID(), { flag: 'wx' });
  for (const [index, value] of bytes.entries())
    await writeFile(path.join(staging, String(index)), value, { flag: 'wx' });
  let published = 0;
  try {
    for (const [index, file] of paths.entries()) {
      await ensure(path.dirname(file));
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new SegmentError('OUTPUT_CHANGED');
    }
    for (const [index, file] of paths.entries()) {
      if (!changed[index]) continue;
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new SegmentError('OUTPUT_CHANGED');
      const staged = path.join(staging, String(index));
      let local: string | undefined;
      try {
        let source = staged;
        try {
          await (previous[index] ? filesystem.rename(source, file) : filesystem.link(source, file));
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
          // Copy exclusively to a destination-side file, then retain same-volume atomic publication.
          local = path.join(path.dirname(file), `.data360-${randomUUID()}.tmp`);
          await filesystem.copyFile(staged, local, constants.COPYFILE_EXCL);
          source = local;
          await ensure(path.dirname(file));
          const fresh = await existing(file);
          if (
            previous[index] === undefined ? fresh !== undefined : !fresh?.equals(previous[index]!)
          )
            throw new SegmentError('OUTPUT_CHANGED');
          await (previous[index] ? filesystem.rename(source, file) : filesystem.link(source, file));
        }
        published++;
        if (!previous[index]) await unlink(source);
        local = undefined;
      } finally {
        if (local) await removeStagingFile(local);
      }
    }
    const completed = await Promise.all(paths.map((file) => existing(file)));
    if (completed.some((value, index) => !value?.equals(bytes[index])))
      throw new SegmentError('OUTPUT_CHANGED');
    return { ...receipt, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new SegmentError('PARTIAL_DLO_OUTPUT');
    throw error;
  }
}
