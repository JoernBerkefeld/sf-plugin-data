import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readFile, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mappingName } from './mapping-document.js';
import { segmentSourceRoot } from './write-segment.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

/** Payload-free mapping definition selection, acquisition and publication refusal. */
export class MappingDefinitionError extends Error {
  public constructor(public readonly code: string) {
    super('Mapping definition export did not complete.');
    this.name = 'MappingDefinitionError';
  }
}

/**
 * Validate or create a real destination directory chain without following aliases.
 * @param {string} directory Exact absolute directory.
 * @returns {Promise<void>} Resolves for a safe directory chain.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new MappingDefinitionError('UNSAFE_PATH');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      await mkdir(directory);
    } catch (creationError: unknown) {
      if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError;
    }
    const stat = await inspectSegmentPath(directory);
    if (!stat.isDirectory()) throw new MappingDefinitionError('UNSAFE_PATH');
  }
}

/**
 * Read an existing bounded regular single-link definition, distinguishing absence only.
 * @param {string} file Exact destination.
 * @returns {Promise<Buffer | undefined>} Observed bytes or absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const stat = await inspectSegmentPath(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576)
      throw new MappingDefinitionError('UNSAFE_PATH');
    return await readFile(file);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Publish exact acquired standard XML, not an operational plugin deploy document.
 * @param {string} apiName Exact mapping developer name.
 * @param {string} definitionXml Acquired opaque XML bytes as UTF-8 text.
 * @param {string} projectRoot Selected output project root.
 * @param {boolean} overwrite Permit replacing differing existing regular bytes.
 * @returns {Promise<{path: string; outcome: 'retrieved' | 'unchanged'}>} Exact publication receipt.
 */
export async function writeMappingDefinition(
  apiName: string,
  definitionXml: string,
  projectRoot: string,
  overwrite: boolean,
): Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }> {
  if (!mappingName.test(apiName) || !projectRoot.trim())
    throw new MappingDefinitionError('INVALID_SELECTION');
  const bytes = Buffer.from(definitionXml);
  if (bytes.length === 0 || bytes.length > 1_048_576)
    throw new MappingDefinitionError('INVALID_DEFINITION');
  try {
    const base = await segmentSourceRoot(path.resolve(projectRoot));
    const file = path.join(
      base,
      'objectSourceTargetMaps',
      `${apiName}.objectSourceTargetMap-meta.xml`,
    );
    await ensure(path.dirname(file));
    const previous = await existing(file);
    if (previous?.equals(bytes)) return { path: file, outcome: 'unchanged' };
    if (previous && !overwrite) throw new MappingDefinitionError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-mapping-output-'));
    const marker = await open(path.join(staging, 'ownership'), 'wx');
    await marker.writeFile(randomUUID());
    await marker.close();
    const staged = path.join(staging, 'definition.xml');
    const handle = await open(staged, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await ensure(path.dirname(file));
    const current = await existing(file);
    if (previous === undefined ? current !== undefined : !current?.equals(previous))
      throw new MappingDefinitionError('OUTPUT_CHANGED');
    if (previous) await rename(staged, file);
    else {
      await link(staged, file);
      await unlink(staged);
    }
    const completed = await existing(file);
    if (!completed?.equals(bytes)) throw new MappingDefinitionError('OUTPUT_CHANGED');
    return { path: file, outcome: 'retrieved' };
  } catch (error: unknown) {
    if (error instanceof MappingDefinitionError) throw error;
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'UNSAFE_PATH') throw new MappingDefinitionError('UNSAFE_PATH');
      if (error.code === 'INVALID_PROJECT') throw new MappingDefinitionError('INVALID_SELECTION');
    }
    throw new MappingDefinitionError('OUTPUT_FAILED');
  }
}
