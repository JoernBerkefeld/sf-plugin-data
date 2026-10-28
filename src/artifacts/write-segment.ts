import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readFile, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SegmentError, serializeSegmentDocument, validateSegmentPair } from './segment-document.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

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
async function sourceRoot(root: string): Promise<string> {
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
 * Publish independently correlated XML/JSON as one selectable component.
 * Both destinations and previous bytes are admitted before any publication. Two files cannot
 * be atomically renamed as a unit: any failure after the first change is explicit partial output.
 * @param {unknown} value Authored candidate.
 * @param {string} definitionXml Independently retrieved standard XML, retained byte-for-byte.
 * @param {string} projectRoot Selected output project root.
 * @param {boolean} overwrite Permit differing existing files.
 * @param {object} publication Narrow filesystem seam for publication-failure regression tests.
 * @returns {Promise<{path: string; companionPath: string; outcome: 'retrieved' | 'unchanged'}>} Complete validated pair receipt.
 */
export async function writeSegmentDocument(
  value: unknown,
  definitionXml: string,
  projectRoot: string,
  overwrite: boolean,
  publication = filesystemPublication,
): Promise<{ path: string; companionPath: string; outcome: 'retrieved' | 'unchanged' }> {
  const document = validateSegmentPair(value, definitionXml);
  if (!projectRoot.trim()) throw new SegmentError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  let published = 0;
  try {
    const base = await sourceRoot(root);
    const files = [
      path.join(
        base,
        'marketSegmentDefinitions',
        `${document.identity.apiName}.marketSegmentDefinition-meta.xml`,
      ),
      path.join(base, 'data360', 'segments', `${document.identity.apiName}.segment.json`),
    ];
    const bytes = [Buffer.from(definitionXml), Buffer.from(serializeSegmentDocument(document))];
    for (const file of files) await ensure(path.dirname(file));
    const previous = await Promise.all(files.map((file) => existing(file)));
    const changed = files.map((_, index) => !previous[index]?.equals(bytes[index]));
    if (!changed.some(Boolean))
      return { path: files[0], companionPath: files[1], outcome: 'unchanged' };
    if (!overwrite && previous.some((value, index) => value && changed[index]))
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
    // Bind both observed destinations before changing either member.
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
    const completed = await Promise.all(files.map((file) => existing(file)));
    if (completed.some((value, index) => !value?.equals(bytes[index])))
      throw new SegmentError('OUTPUT_CHANGED');
    validateSegmentPair(JSON.parse(completed[1]!.toString('utf8')), completed[0]!.toString('utf8'));
    return { path: files[0], companionPath: files[1], outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new SegmentError('PARTIAL_SEGMENT_OUTPUT');
    if (error instanceof SegmentError) throw error;
    throw new SegmentError('OUTPUT_FAILED');
  }
}
