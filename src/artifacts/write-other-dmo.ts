import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  link,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildOtherDmoCreateRequestFromDocument,
  serializeDmoDocument,
  validateDmoDocument,
} from './dmo-document.js';

/** Payload-free filesystem refusals, including failed atomic publication. */
export class DmoWriteError extends Error {
  public constructor(public readonly code: 'UNSAFE_PATH' | 'OVERWRITE_REQUIRED' | 'OUTPUT_FAILED') {
    super(
      'Other DMO output could not be completed; inspect the selected destination before retrying.',
    );
    this.name = 'DmoWriteError';
  }
}

/**
 * Check every existing ancestor without following links, creating directories one at a time.
 * @param {string} directory Absolute directory to validate or create.
 * @returns {Promise<void>} Resolves only for a real directory chain.
 */
async function ensureDirectory(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensureDirectory(parent);
  try {
    await lstat(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (creationError: unknown) {
      if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError;
    }
  }
  const stat = await lstat(directory);
  const actual = path.resolve(await realpath(directory));
  const matches =
    process.platform === 'win32'
      ? actual.toLowerCase() === directory.toLowerCase()
      : actual === directory;
  if (stat.isSymbolicLink() || !stat.isDirectory() || !matches)
    throw new DmoWriteError('UNSAFE_PATH');
}

/**
 * Read only an existing regular file, never a directory or link.
 * @param {string} file Exact destination.
 * @returns {Promise<Buffer | undefined>} Existing bytes or explicit absence.
 */
async function existingBytes(file: string): Promise<Buffer | undefined> {
  try {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new DmoWriteError('UNSAFE_PATH');
    return await readFile(file);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Publish only independently validated authored Other/default JSON, with atomic file visibility.
 * Staging is retained in owned OS temp; cross-volume atomic publication fails closed.
 * @param {unknown} value Authored candidate, never the runtime projection.
 * @param {string} projectRoot Output project root (the CLI supplies cwd when omitted).
 * @param {boolean} overwrite Permit replacing differing existing regular-file bytes.
 * @returns {Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }>} Exact path and outcome.
 */
export async function writeOtherDmoDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  // Validate the standalone candidate independently before any filesystem side effect.
  buildOtherDmoCreateRequestFromDocument(value, 'default');
  const document = validateDmoDocument(value);
  const bytes = Buffer.from(serializeDmoDocument(document), 'utf8');
  if (!projectRoot.trim()) throw new DmoWriteError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  const destination = path.join(
    root,
    'data360',
    'default',
    'dmo',
    `${document.identity.apiName}.json`,
  );
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new DmoWriteError('UNSAFE_PATH');
  try {
    await ensureDirectory(path.dirname(destination));
    const previous = await existingBytes(destination);
    if (previous?.equals(bytes)) return { path: destination, outcome: 'unchanged' };
    if (previous && !overwrite) throw new DmoWriteError('OVERWRITE_REQUIRED');
    // Stage complete flushed bytes under the verified OS temp directory, never beside user files.
    if (process.platform === 'win32') {
      for (const value of [
        process.env.TEMP,
        os.tmpdir(),
        process.env.TMP,
        process.env.TMPDIR,
      ].filter((entry) => entry !== undefined && entry !== '')) {
        if (
          !path.isAbsolute(value!) ||
          path
            .resolve(value!)
            .replace(/[\\/]+$/u, '')
            .toLowerCase() !== String.raw`f:\temp`
        )
          throw new DmoWriteError('UNSAFE_PATH');
      }
      if (!process.env.TEMP) throw new DmoWriteError('UNSAFE_PATH');
    }
    const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'data360-output-'));
    const staged = await open(path.join(stagingRoot, 'document.json'), 'wx');
    try {
      await staged.writeFile(bytes);
      await staged.sync();
    } finally {
      await staged.close();
    }
    const marker = await open(path.join(stagingRoot, 'ownership'), 'wx');
    await marker.writeFile(randomUUID());
    await marker.close();
    // Recheck the chain and observed bytes immediately before publication; no snapshot guarantee.
    await ensureDirectory(path.dirname(destination));
    const current = await existingBytes(destination);
    if (previous === undefined ? current !== undefined : !current?.equals(previous))
      throw new DmoWriteError('OUTPUT_FAILED');
    if (previous) await rename(path.join(stagingRoot, 'document.json'), destination);
    else {
      await link(path.join(stagingRoot, 'document.json'), destination);
      // Remove only this run-created file entry so retained staging cannot alter published bytes.
      await unlink(path.join(stagingRoot, 'document.json'));
    }
    return { path: destination, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (error instanceof DmoWriteError) throw error;
    throw new DmoWriteError('OUTPUT_FAILED');
  }
}
