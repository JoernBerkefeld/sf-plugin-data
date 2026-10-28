import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CalculatedInsightError,
  serializeCalculatedInsightDocument,
  validateCalculatedInsightDocument,
  validateCalculatedInsightPair,
} from './calculated-insight-document.js';
import { segmentSourceRoot } from './write-segment.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';

const filesystemPublication = { link, rename, unlink };

/**
 * Create missing directories only after checking every real ancestor.
 * @param {string} directory Absolute output directory.
 * @returns {Promise<void>} Checked real directory chain.
 */
async function ensure(directory: string): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await ensure(parent);
  try {
    const present = await inspectSegmentPath(directory);
    if (!present.isDirectory()) throw new CalculatedInsightError('UNSAFE_PATH');
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
  if (!stat.isDirectory()) throw new CalculatedInsightError('UNSAFE_PATH');
}

/**
 * Read only bounded single-link regular output, distinguishing exact absence.
 * @param {string} file Absolute output member.
 * @returns {Promise<Buffer | undefined>} Existing bytes or absence.
 */
async function existing(file: string): Promise<Buffer | undefined> {
  try {
    const before = await inspectSegmentPath(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > 1_048_576)
      throw new CalculatedInsightError('UNSAFE_PATH');
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat();
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1)
        throw new CalculatedInsightError('OUTPUT_CHANGED');
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
        throw new CalculatedInsightError('OUTPUT_CHANGED');
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
 * Publish correlated standard CI XML and portable JSON without a Metadata deployment.
 * Partial publication is explicit: two filesystem members are not one atomic rename.
 * @param {unknown} value Complete authored candidate.
 * @param {string} definitionXml Independently retrieved standard XML bytes.
 * @param {string} projectRoot Selected output project root.
 * @param {boolean} overwrite Permit replacement of differing existing bytes.
 * @param {object} publication Narrow filesystem publication seam for synthetic tests.
 * @returns {Promise<{path: string; companionPath: string; outcome: 'retrieved' | 'unchanged'}>} Validated pair receipt.
 */
export async function writeCalculatedInsightDocument(
  value: unknown,
  definitionXml: string,
  projectRoot: string,
  overwrite: boolean,
  publication = filesystemPublication,
): Promise<{ path: string; companionPath: string; outcome: 'retrieved' | 'unchanged' }> {
  const candidate = validateCalculatedInsightDocument(value);
  const member = candidate.identity.apiName.slice(0, -5);
  const document = validateCalculatedInsightPair(candidate, definitionXml, member);
  if (!projectRoot.trim()) throw new CalculatedInsightError('UNSAFE_PATH');
  let published = 0;
  try {
    const base = await segmentSourceRoot(path.resolve(projectRoot));
    const files = [
      path.join(base, 'mktCalcInsightObjectDefs', `${member}.mktCalcInsightObjectDef-meta.xml`),
      path.join(
        base,
        'data360',
        'calculatedInsights',
        `${document.identity.apiName}.calculatedInsight.json`,
      ),
    ];
    const bytes = [
      Buffer.from(definitionXml),
      Buffer.from(serializeCalculatedInsightDocument(document)),
    ];
    for (const file of files) await ensure(path.dirname(file));
    const previous = await Promise.all(files.map((file) => existing(file)));
    const changed = files.map((_, index) => !previous[index]?.equals(bytes[index]));
    if (!changed.some(Boolean))
      return { path: files[0], companionPath: files[1], outcome: 'unchanged' };
    if (!overwrite && previous.some((value, index) => value && changed[index]))
      throw new CalculatedInsightError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-output-'));
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
    for (const [index, file] of files.entries()) {
      await ensure(path.dirname(file));
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new CalculatedInsightError('OUTPUT_CHANGED');
    }
    for (const [index, file] of files.entries()) {
      if (!changed[index]) continue;
      await ensure(path.dirname(file));
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new CalculatedInsightError('OUTPUT_CHANGED');
      const staged = path.join(staging, `${index}`);
      if (previous[index]) await publication.rename(staged, file);
      else {
        await publication.link(staged, file);
        published++;
        await publication.unlink(staged);
        continue;
      }
      published++;
    }
    const completed = await Promise.all(files.map((file) => existing(file)));
    if (completed.some((value, index) => !value?.equals(bytes[index])))
      throw new CalculatedInsightError('OUTPUT_CHANGED');
    validateCalculatedInsightPair(
      JSON.parse(completed[1]!.toString('utf8')),
      completed[0]!.toString('utf8'),
      member,
    );
    return { path: files[0], companionPath: files[1], outcome: 'retrieved' };
  } catch (error: unknown) {
    if (published) throw new CalculatedInsightError('PARTIAL_CI_OUTPUT');
    if (error instanceof CalculatedInsightError) throw error;
    throw new CalculatedInsightError('OUTPUT_FAILED');
  }
}
