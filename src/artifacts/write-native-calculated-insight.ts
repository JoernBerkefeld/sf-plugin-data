import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codeFilePath } from './code-fields.js';
import {
  CalculatedInsightError,
  parseNativeCalculatedInsight,
  serializeNativeCalculatedInsight,
  validateNativeCalculatedInsight,
} from './native-calculated-insight-document.js';
import { inspectSegmentPath, verifyTemporaryDirectory } from '../transport/project-metadata.js';
import { isVerbatimDocument, serializeVerbatimDocument } from './verbatim-document.js';

const filesystemPublication = { link, rename, unlink };

/**
 * Create missing directories only after checking every real ancestor.
 * @param {string} directory Absolute output directory.
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
      if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
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
 * Publish one calculated insight as `data360/calculatedInsights/<apiName>.calculatedInsight-meta.json`
 * plus its SQL in `<apiName>.calculatedInsight-meta.sql`. Identical bytes are `unchanged`;
 * differing files need `overwrite`. Two files are not one atomic rename, so a partial write is
 * reported as such.
 * @param {unknown} value Complete document (SQL included).
 * @param {string} projectRoot Absolute project root.
 * @param {boolean} overwrite Permit replacing differing files.
 * @param {object} publication Filesystem seam for synthetic tests.
 * @returns {Promise<{path: string; companionPath: string; outcome: 'retrieved' | 'unchanged'}>} JSON path, SQL path and outcome.
 */
export async function writeNativeCalculatedInsightDocument(
  value: unknown,
  projectRoot: string,
  overwrite: boolean,
  publication = filesystemPublication,
): Promise<{ path: string; companionPath?: string; outcome: 'retrieved' | 'unchanged' }> {
  // A verbatim insight is its JSON alone. The writer owns no stale-file removal, so an earlier
  // SQL file is left where it is; the command reports it.
  const verbatim = isVerbatimDocument(value, 'calculated-insight') ? value : undefined;
  const document = verbatim ? undefined : validateNativeCalculatedInsight(value);
  const apiName = verbatim ? verbatim.identity.apiName : document!.apiName;
  const { json, files: code } = verbatim
    ? { json: serializeVerbatimDocument(verbatim), files: [] }
    : serializeNativeCalculatedInsight(document!);
  if (
    !path.isAbsolute(projectRoot) ||
    projectRoot !== projectRoot.trim() ||
    /[*?\0]/u.test(projectRoot) ||
    projectRoot.split(/[\\/]/u).includes('..')
  )
    throw new CalculatedInsightError('UNSAFE_PATH');
  const root = path.resolve(projectRoot);
  if (path.dirname(root) === root) throw new CalculatedInsightError('UNSAFE_PATH');
  const jsonPath = path.join(
    root,
    'data360',
    'calculatedInsights',
    `${apiName}.calculatedInsight-meta.json`,
  );
  const files = [jsonPath, ...code.map((file) => codeFilePath(jsonPath, file))];
  const bytes = [Buffer.from(json), ...code.map((file) => Buffer.from(file.text))];
  if (bytes.some((content) => content.length > 1_048_576))
    throw new CalculatedInsightError('UNSAFE_PATH');
  let published = 0;
  try {
    await ensure(path.dirname(jsonPath));
    const previous = await Promise.all(files.map((file) => existing(file)));
    const changed = files.map((_, index) => !previous[index]?.equals(bytes[index]));
    const receipt = (
      outcome: 'retrieved' | 'unchanged',
    ): Awaited<ReturnType<typeof writeNativeCalculatedInsightDocument>> => ({
      path: files[0],
      ...(files[1] === undefined ? {} : { companionPath: files[1] }),
      outcome,
    });
    if (!changed.some(Boolean)) return receipt('unchanged');
    if (!overwrite && previous.some((content, index) => content && changed[index]))
      throw new CalculatedInsightError('OVERWRITE_REQUIRED');
    verifyTemporaryDirectory();
    const staging = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-output-'));
    const marker = await open(path.join(staging, 'ownership'), 'wx');
    try {
      await marker.writeFile(randomUUID());
    } finally {
      await marker.close();
    }
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
      const current = await existing(file);
      if (
        previous[index] === undefined ? current !== undefined : !current?.equals(previous[index]!)
      )
        throw new CalculatedInsightError('OUTPUT_CHANGED');
    }
    for (const [index, file] of files.entries()) {
      if (!changed[index]) continue;
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
    if (completed.some((content, index) => !content?.equals(bytes[index])))
      throw new CalculatedInsightError('OUTPUT_CHANGED');
    if (!verbatim)
      parseNativeCalculatedInsight(
        completed[0]!.toString('utf8'),
        code.map((file, index) => ({ ...file, text: completed[index + 1]!.toString('utf8') })),
      );
    return receipt('retrieved');
  } catch (error: unknown) {
    if (published) throw new CalculatedInsightError('PARTIAL_CI_OUTPUT');
    if (error instanceof CalculatedInsightError) throw error;
    throw new CalculatedInsightError('OUTPUT_FAILED');
  }
}
