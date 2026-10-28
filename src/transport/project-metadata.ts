import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SegmentError, segmentName } from '../artifacts/segment-document.js';
import { calculatedInsightName } from '../artifacts/calculated-insight-document.js';

const normalize = (value: string): string =>
  process.platform === 'win32' ? value.toLowerCase() : value;

export type MetadataRunner = (
  arguments_: string[],
  cwd: string,
) => Promise<{ exitCode: number; stdout: string }>;

/**
 * Refuse unsafe temporary placement before creating any scratch roots.
 * @returns {void} Nothing when the current process has safe OS temporary placement.
 */
export function verifyTemporaryDirectory(): void {
  if (process.platform !== 'win32') return;
  for (const [key, value] of Object.entries({
    TEMP: process.env.TEMP,
    node: os.tmpdir(),
    TMP: process.env.TMP,
    TMPDIR: process.env.TMPDIR,
  })) {
    if (
      (key === 'TEMP' || key === 'node' || value) &&
      (!value ||
        !path.isAbsolute(value) ||
        path
          .resolve(value)
          .replace(/[\\/]+$/u, '')
          .toLowerCase() !== String.raw`f:\temp`)
    )
      throw new SegmentError('UNSAFE_TEMP');
  }
}

/**
 * Inspect the exact ancestor chain without following filesystem aliases or links.
 * @param {string} file Absolute path to inspect.
 * @returns {Promise<import('node:fs').Stats>} Checked entry.
 */
export async function inspectSegmentPath(file: string): Promise<import('node:fs').Stats> {
  const parent = path.dirname(file);
  if (parent !== file) {
    const ancestor = await inspectSegmentPath(parent);
    if (!ancestor.isDirectory()) throw new SegmentError('UNSAFE_PATH');
  }
  const stat = await lstat(file);
  if (stat.isSymbolicLink() || normalize(await realpath(file)) !== normalize(file))
    throw new SegmentError('UNSAFE_PATH');
  return stat;
}

/**
 * Run the installed CLI using argument arrays only, with finite output and elapsed bounds.
 * Windows invokes the installed JS entry through Node, never shell-interpolated arguments.
 * @param {string[]} arguments_ Exact CLI arguments.
 * @param {string} cwd Owned scratch project.
 * @returns {Promise<{exitCode: number; stdout: string}>} Structured stdout and actual exit status.
 */
export async function runProjectMetadata(
  arguments_: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string }> {
  const executable = process.platform === 'win32' ? process.execPath : 'sf';
  let parameters = arguments_;
  if (process.platform === 'win32') {
    // Standard npm global Windows installation; absence blocks rather than installing or invoking cmd.exe.
    const entry = path.join(
      process.env.APPDATA ?? '',
      'npm',
      'node_modules',
      '@salesforce',
      'cli',
      'bin',
      'run.js',
    );
    const stat = await inspectSegmentPath(entry);
    if (!process.env.APPDATA || !stat.isFile()) throw new SegmentError('STANDARD_CLI_UNAVAILABLE');
    parameters = [entry, ...arguments_];
  }
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      parameters,
      {
        cwd,
        timeout: 330_000,
        maxBuffer: 4_194_304,
        windowsHide: true,
        env: {
          ...process.env,
          SF_AUTOUPDATE_DISABLE: 'true',
          SF_DISABLE_TELEMETRY: 'true',
          SF_DISABLE_SOURCE_MEMBER_POLLING: 'true',
        },
      },
      (error, stdout) => {
        if (error && (!('code' in error) || typeof error.code !== 'number')) {
          reject(new SegmentError('STANDARD_RETRIEVE_UNKNOWN'));
          return;
        }
        resolve({ exitCode: error ? Number(error.code) : 0, stdout });
      },
    );
  });
}

/**
 * Retrieve exactly one standard Segment definition into a newly owned isolated DX project.
 * Nonterminal jobs, warnings, unexpected members and ambiguous results fail closed.
 * Scratch is retained; this boundary performs no recursive cleanup or org writes.
 * @param {string} targetOrg Explicit authenticated username or alias.
 * @param {string} apiName Exact Segment API name.
 * @param {MetadataRunner} runner Optional synthetic runner seam.
 * @returns {Promise<string>} Standard source XML bytes as UTF-8 text.
 */
export async function retrieveSegmentMetadata(
  targetOrg: string,
  apiName: string,
  runner: MetadataRunner = runProjectMetadata,
): Promise<string> {
  return retrieveExactMetadata(targetOrg, apiName, 'segment', runner);
}

/**
 * Retrieve exact standard CI source XML independently of runtime/SOAP acquisition.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiName Exact runtime identity including __cio.
 * @param {MetadataRunner} runner Synthetic standard CLI seam.
 * @returns {Promise<string>} Independently retrieved source XML bytes.
 */
export async function retrieveCalculatedInsightSourceMetadata(
  targetOrg: string,
  apiName: string,
  runner: MetadataRunner = runProjectMetadata,
): Promise<string> {
  if (!calculatedInsightName.test(apiName)) throw new SegmentError('INVALID_SELECTION');
  return retrieveExactMetadata(targetOrg, apiName.slice(0, -5), 'calculated-insight', runner);
}

/**
 * Execute one allowlisted standard Metadata retrieve and validate its terminal member receipt.
 * @param {string} targetOrg Explicit authenticated target.
 * @param {string} apiName Exact standard member name.
 * @param {'segment' | 'calculated-insight'} family Allowlisted source family.
 * @param {MetadataRunner} runner Installed CLI or synthetic seam.
 * @returns {Promise<string>} Exact bounded XML.
 */
async function retrieveExactMetadata(
  targetOrg: string,
  apiName: string,
  family: 'segment' | 'calculated-insight',
  runner: MetadataRunner,
): Promise<string> {
  const type = family === 'segment' ? 'MarketSegmentDefinition' : 'MktCalcInsightObjectDef';
  const directory = family === 'segment' ? 'marketSegmentDefinitions' : 'mktCalcInsightObjectDefs';
  const suffix =
    family === 'segment'
      ? '.marketSegmentDefinition-meta.xml'
      : '.mktCalcInsightObjectDef-meta.xml';
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32) ||
    !segmentName.test(apiName)
  )
    throw new SegmentError('INVALID_SELECTION');
  verifyTemporaryDirectory();
  const root = await mkdtemp(path.join(os.tmpdir(), 'data360-metadata-'));
  await writeFile(path.join(root, 'ownership'), randomUUID(), { flag: 'wx' });
  await mkdir(path.join(root, 'force-app'));
  await writeFile(
    path.join(root, 'sfdx-project.json'),
    `${JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }], namespace: '', sourceApiVersion: '65.0' })}\n`,
    { flag: 'wx' },
  );
  const receipt = await runner(
    [
      'project',
      'retrieve',
      'start',
      '--metadata',
      `${type}:${apiName}`,
      '--target-org',
      targetOrg,
      '--api-version',
      '65.0',
      '--wait',
      '5',
      '--json',
    ],
    root,
  );
  let envelope: { status?: unknown; result?: Record<string, unknown>; warnings?: unknown };
  try {
    envelope = JSON.parse(receipt.stdout) as typeof envelope;
  } catch {
    throw new SegmentError('INVALID_STANDARD_RETRIEVE');
  }
  const result = envelope?.result;
  if (
    receipt.exitCode !== 0 ||
    envelope.status !== 0 ||
    !result ||
    result.done !== true ||
    result.success !== true ||
    result.status !== 'Succeeded' ||
    (result.messages && (!Array.isArray(result.messages) || result.messages.length > 0)) ||
    (envelope.warnings && (!Array.isArray(envelope.warnings) || envelope.warnings.length > 0))
  )
    throw new SegmentError('STANDARD_RETRIEVE_UNCONFIRMED');
  if (!Array.isArray(result.files) || result.files.length !== 1)
    throw new SegmentError('UNEXPECTED_METADATA_MEMBERS');
  const member = result.files[0] as Record<string, unknown>;
  if (member.type !== type || member.fullName !== apiName || member.state !== 'Created')
    throw new SegmentError('UNEXPECTED_METADATA_MEMBERS');
  const file = path.join(root, 'force-app', 'main', 'default', directory, `${apiName}${suffix}`);
  const stat = await inspectSegmentPath(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576)
    throw new SegmentError('INVALID_STANDARD_RETRIEVE');
  return readFile(file, 'utf8');
}
