import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { readDeployInputs } from './read-deploy-input.js';

const execute = promisify(execFile);

/** Payload-free refusal of unsafe or unsupported Git selections. */
export class GitSelectionError extends Error {
  public constructor(public readonly code: 'INVALID_GIT_SELECTION' | 'BLOCKED_GIT_LIFECYCLE') {
    super(
      'Select a valid Git reference and current canonical DMO files; renames and deletions block deployment.',
    );
    this.name = 'GitSelectionError';
  }
}

export type GitDeploySelection = {
  paths: string[];
  provenance: {
    repositoryRoot: string;
    requestedRef: string;
    referenceCommit: string;
    headCommit: string;
    mergeBase: string;
  };
};

/**
 * Execute bounded local Git reads with argument arrays, never through a shell.
 * @param {string} cwd Absolute working directory.
 * @param {string[]} arguments_ Git arguments, with user references separated from options.
 * @returns {Promise<string>} Strict UTF-8 output.
 */
async function git(cwd: string, arguments_: string[]): Promise<string> {
  const { stdout } = await execute('git', arguments_, {
    cwd,
    encoding: 'buffer',
    maxBuffer: 4_194_304,
    timeout: 30_000,
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return new TextDecoder('utf-8', { fatal: true }).decode(stdout);
}

/**
 * Split a complete NUL-delimited response without losing embedded whitespace.
 * @param {string} output Git output.
 * @returns {string[]} Complete nonempty tokens.
 */
function tokens(output: string): string[] {
  if (!output) return [];
  if (!output.endsWith('\0')) throw new GitSelectionError('INVALID_GIT_SELECTION');
  const values = output.slice(0, -1).split('\0');
  if (values.some((value) => !value)) throw new GitSelectionError('INVALID_GIT_SELECTION');
  return values;
}

const relevant = (file: string): boolean =>
  file.startsWith('data360/default/dmo/') && file.endsWith('.json');

/**
 * Collect current canonical DMO paths while rejecting either endpoint of a lifecycle change.
 * @param {string} output NUL-delimited name-status diff, including both rename paths.
 * @param {Set<string>} paths Deduplicated current paths.
 * @returns {boolean} Whether an actual deletion status occurred, including unrelated paths.
 */
function collect(output: string, paths: Set<string>): boolean {
  const values = tokens(output);
  let hasDeletion = false;
  for (let index = 0; index < values.length;) {
    const status = values[index++];
    if (!/^(?:[AMDTU]|[RC]\d{1,3})$/u.test(status))
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    const first = values[index++];
    const second = /^[RC]/u.test(status) ? values[index++] : undefined;
    if (!first || (/^[RC]/u.test(status) && !second))
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    if (status === 'D') hasDeletion = true;
    if (!relevant(first) && !(second && relevant(second))) continue;
    if (/^[DRCU]/u.test(status)) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    paths.add(first);
  }
  return hasDeletion;
}

/**
 * Resolve merge-base/HEAD plus index, working-tree and untracked DMO changes locally.
 * Git-inferred renames are blocked, not a guarantee of historical rename intent.
 * Canonical current files are admitted by the existing authored-input parser only.
 * @param {object} options Requested reference and absolute invocation directory.
 * @param {string} options.cwd Invocation directory, including nested repository directories.
 * @param {string} options.ref Requested Git revision resolving to a commit.
 * @returns {Promise<GitDeploySelection>} Validated absolute paths and resolved commit provenance.
 */
export async function selectGitDeployInputs(options: {
  cwd: string;
  ref: string;
}): Promise<GitDeploySelection> {
  try {
    if (
      !path.isAbsolute(options.cwd) ||
      !options.ref ||
      options.ref !== options.ref.trim() ||
      options.ref.startsWith('-') ||
      /[\0\r\n]/u.test(options.ref)
    )
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    const rootOutput = await git(options.cwd, ['rev-parse', '--show-toplevel']);
    const repositoryRoot = rootOutput.trimEnd();
    if (!path.isAbsolute(repositoryRoot)) throw new GitSelectionError('INVALID_GIT_SELECTION');
    const resolve = async (reference: string): Promise<string> => {
      const output = await git(repositoryRoot, [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${reference}^{commit}`,
      ]);
      const commit = output.trim();
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit))
        throw new GitSelectionError('INVALID_GIT_SELECTION');
      return commit;
    };
    const referenceCommit = await resolve(options.ref);
    const headCommit = await resolve('HEAD');
    const baseOutput = await git(repositoryRoot, [
      'merge-base',
      '--all',
      referenceCommit,
      headCommit,
    ]);
    const mergeBase = baseOutput.trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(mergeBase))
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    const paths = new Set<string>();
    const diff = [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '-l0',
      '--no-ext-diff',
      '--no-textconv',
    ];
    collect(await git(repositoryRoot, [...diff, mergeBase, headCommit, '--']), paths);
    collect(await git(repositoryRoot, [...diff, '--cached', headCommit, '--']), paths);
    const worktree = await git(repositoryRoot, [...diff, '--']);
    const hasWorktreeDeletion = collect(worktree, paths);
    const untracked = tokens(
      await git(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
    );
    // Git cannot infer worktree renames to untracked destinations: refuse ambiguous inbound moves.
    if (untracked.some((file) => relevant(file)) && hasWorktreeDeletion)
      throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    for (const file of untracked) if (relevant(file)) paths.add(file);
    const metadata = [...paths].map((file) => {
      const match =
        /^data360\/default\/dmo\/([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__dlm)\.json$/u.exec(file);
      if (!match) throw new GitSelectionError('INVALID_GIT_SELECTION');
      return `dmo:${match[1]}`;
    });
    // Existing admission checks canonical filename, document identity and no-link regular files.
    const inputs =
      metadata.length > 0 ? await readDeployInputs({ cwd: repositoryRoot, metadata }) : [];
    return {
      paths: inputs.map((input) => input.path),
      provenance: {
        repositoryRoot,
        requestedRef: options.ref,
        referenceCommit,
        headCommit,
        mergeBase,
      },
    };
  } catch (error: unknown) {
    if (error instanceof GitSelectionError) throw error;
    throw new GitSelectionError('INVALID_GIT_SELECTION');
  }
}
