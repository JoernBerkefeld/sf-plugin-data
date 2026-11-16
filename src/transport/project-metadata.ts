import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SegmentError } from '../artifacts/segment-document.js';
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
  // Never retried: the child's network error is not visible, so a retry could write twice.
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
