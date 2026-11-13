import { dloName } from './dlo-document.js';
import type { DloDeployInput, DeployInput, DeletedArtifactKind } from './read-deploy-input.js';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { admitDeletedArtifact, readDeployInputs } from './read-deploy-input.js';
import { nativeDmoName } from './native-dmo-document.js';
import { identityResolutionName } from './identity-resolution-document.js';
import type { IdentityResolutionDeployInput, SegmentDeployInput } from './read-deploy-input.js';
import { segmentSourceRoot } from './write-segment.js';
import { segmentName } from './segment-document.js';
import { calculatedInsightName } from './calculated-insight-document.js';
import type { CalculatedInsightDeployInput } from './read-deploy-input.js';
import { nativeMappingName } from './native-mapping-document.js';
import { nativeRelationshipName } from './native-relationship-document.js';
import { dataTransformName } from './data-transform-document.js';
import { dataGraphName } from './data-graph-document.js';

const execute = promisify(execFile);

/** Payload-free refusal of unsafe or unsupported Git selections. */
export class GitSelectionError extends Error {
  public constructor(public readonly code: 'INVALID_GIT_SELECTION' | 'BLOCKED_GIT_LIFECYCLE') {
    super(
      'Select a valid Git reference and current canonical files; renames, unknown deleted files and ambiguous deletions block deployment.',
    );
    this.name = 'GitSelectionError';
  }
}

/** A file present at the merge base and absent now: a delete in the org, identified from base content. */
export type GitDeleteCandidate = Readonly<{
  family: DeletedArtifactKind;
  /** Absolute path the file had (the XML member for a calculated insight). */
  path: string;
  identity: Readonly<{ dataSpace: string; apiName: string }>;
  /** Relationship source DMO, from the base content. */
  sourceObjectName?: string;
  /** SHA-256 of the base bytes. */
  baseDigest: string;
}>;

export type GitDeploySelection = {
  paths: string[];
  /** Every input admitted from the current files, byte-bound for later re-admission. */
  capturedInputs?: readonly DeployInput[];
  dlos?: readonly DloDeployInput[];
  segments?: readonly SegmentDeployInput[];
  calculatedInsights?: readonly CalculatedInsightDeployInput[];
  identityResolutions?: readonly IdentityResolutionDeployInput[];
  /** Files deleted in the range. Carried for the caller; selection never deletes. */
  deletions?: readonly GitDeleteCandidate[];
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
 * @returns {Promise<Buffer>} Exact output bytes.
 */
async function gitBytes(cwd: string, arguments_: string[]): Promise<Buffer> {
  const { stdout } = await execute('git', ['--literal-pathspecs', ...arguments_], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 4_194_304,
    timeout: 30_000,
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout;
}

/**
 * Execute a Git read and decode strict UTF-8.
 * @param {string} cwd Absolute working directory.
 * @param {string[]} arguments_ Git arguments.
 * @returns {Promise<string>} Strict UTF-8 output.
 */
async function git(cwd: string, arguments_: string[]): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(await gitBytes(cwd, arguments_));
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

const ciXmlSuffix = '.mktCalcInsightObjectDef-meta.xml';
const ciJsonSuffix = '.calculatedInsight.json';

/** Family by file suffix; `package` families live under the sfdx package directory. */
const families: ReadonlyArray<{
  kind: DeletedArtifactKind;
  suffix: string;
  directory: readonly string[];
  base: 'root' | 'package';
  name: (value: string) => boolean;
}> = [
  {
    kind: 'dmo',
    suffix: '.dmo-meta.json',
    directory: ['data360', 'dmo'],
    base: 'root',
    name: (value) => nativeDmoName.test(value),
  },
  {
    kind: 'dlo',
    suffix: '.dlo-meta.json',
    directory: ['data360', 'dlo'],
    base: 'root',
    name: (value) => dloName.test(value) && value.endsWith('__dll'),
  },
  {
    kind: 'mapping',
    suffix: '.mapping-meta.json',
    directory: ['data360', 'mapping'],
    base: 'root',
    name: (value) => nativeMappingName.test(value),
  },
  {
    kind: 'relationship',
    suffix: '.relationship-meta.json',
    directory: ['data360', 'relationship'],
    base: 'root',
    name: (value) => nativeRelationshipName.test(value),
  },
  {
    kind: 'data-stream',
    suffix: '.data-stream-meta.json',
    directory: ['data360', 'data-stream'],
    base: 'root',
    name: (value) => /^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value),
  },
  {
    kind: 'data-transform',
    suffix: '.dataTransform.json',
    directory: ['data360', 'dataTransforms'],
    base: 'root',
    name: (value) => dataTransformName.test(value),
  },
  {
    kind: 'data-graph',
    suffix: '.native-dataGraph.json',
    directory: ['data360', 'dataGraphs'],
    base: 'package',
    name: (value) => dataGraphName.test(value),
  },
  {
    kind: 'identity-resolution',
    suffix: '.identityResolution.json',
    directory: ['data360', 'identityResolution'],
    base: 'package',
    name: (value) => identityResolutionName.test(value),
  },
  {
    kind: 'calculated-insight',
    suffix: ciJsonSuffix,
    directory: ['data360', 'calculatedInsights'],
    base: 'package',
    name: (value) => calculatedInsightName.test(value),
  },
  {
    kind: 'segment',
    suffix: '.segment.json',
    directory: ['data360', 'segments'],
    base: 'package',
    name: (value) => segmentName.test(value),
  },
];

const segmentXml = (file: string): boolean => /\.marketSegmentDefinition-meta\.xml$/iu.test(file);
const ciXml = (file: string): boolean => /\.mktCalcInsightObjectDef-meta\.xml$/iu.test(file);
const relevant = (file: string): boolean =>
  segmentXml(file) ||
  ciXml(file) ||
  families.some(({ suffix }) => file.toLowerCase().endsWith(suffix.toLowerCase()));
// A deleted path in a plugin folder must resolve to a known family.
const watched = (file: string): boolean => relevant(file) || file.split('/').includes('data360');
const needsPackage = (file: string): boolean =>
  ciXml(file) ||
  segmentXml(file) ||
  families.some(
    ({ suffix, base }) => base === 'package' && file.toLowerCase().endsWith(suffix.toLowerCase()),
  );

/**
 * Map one repository-relative path to its family and canonical name, or refuse it.
 * @param {string} file Repository-relative POSIX path.
 * @param {string} repositoryRoot Absolute repository root.
 * @param {string | undefined} packageBase Absolute sfdx package directory.
 * @returns {object} Family and canonical name (`__cio` included for calculated insights).
 */
function classify(
  file: string,
  repositoryRoot: string,
  packageBase: string | undefined,
): { kind: DeletedArtifactKind; name: string } {
  const relative = (absolute: string): string =>
    path.relative(repositoryRoot, absolute).split(path.sep).join('/');
  if (ciXml(file)) {
    const stem = path.posix.basename(file).slice(0, -ciXmlSuffix.length);
    const expected = path.join(packageBase!, 'mktCalcInsightObjectDefs', `${stem}${ciXmlSuffix}`);
    if (!calculatedInsightName.test(`${stem}__cio`) || file !== relative(expected))
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    return { kind: 'calculated-insight', name: `${stem}__cio` };
  }
  const family = families.find(({ suffix }) => file.toLowerCase().endsWith(suffix.toLowerCase()));
  if (!family) throw new GitSelectionError('INVALID_GIT_SELECTION');
  const name = path.posix.basename(file).slice(0, -family.suffix.length);
  const expected = path.join(
    family.base === 'root' ? repositoryRoot : packageBase!,
    ...family.directory,
    `${name}${family.suffix}`,
  );
  if (!family.name(name) || file !== relative(expected))
    throw new GitSelectionError('INVALID_GIT_SELECTION');
  return { kind: family.kind, name };
}

/**
 * Collect changed paths and deleted watched paths; renames, copies and conflicts block.
 * @param {string} output NUL-delimited name-status diff, including both rename paths.
 * @param {Set<string>} paths Deduplicated changed relevant paths.
 * @param {Set<string>} deleted Deduplicated deleted watched paths.
 * @param {boolean} [unstaged] Working-tree diff: an unstaged deletion of a watched file blocks,
 * because Git cannot see where an unstaged file moved.
 * @returns {boolean} Whether an actual deletion status occurred, including unrelated paths.
 */
function collect(
  output: string,
  paths: Set<string>,
  deleted: Set<string>,
  unstaged = false,
): boolean {
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
    if (status === 'D') {
      hasDeletion = true;
      if (watched(first) && unstaged) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
      if (watched(first)) deleted.add(first);
      continue;
    }
    if (!relevant(first) && !(second && relevant(second))) continue;
    if (/^[RCU]/u.test(status)) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    paths.add(first);
  }
  return hasDeletion;
}

/**
 * Whether anything exists at a path now (a re-added file is not a deletion).
 * @param {string} file Absolute path.
 * @returns {Promise<boolean>} Presence of any entry, link or not.
 */
async function present(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Read one regular file of a commit, or undefined when the commit has no entry at that path.
 * @param {string} repositoryRoot Absolute repository root.
 * @param {string} commit Resolved commit.
 * @param {string} file Repository-relative POSIX path.
 * @returns {Promise<Buffer | undefined>} Exact bytes, at most 1 MiB.
 */
async function revisionBytes(
  repositoryRoot: string,
  commit: string,
  file: string,
): Promise<Buffer | undefined> {
  const listing = tokens(
    await git(repositoryRoot, ['ls-tree', '-z', '-l', '--full-tree', commit, '--', file]),
  );
  if (listing.length === 0) return undefined;
  const match = /^100(?:644|755) blob ([a-f0-9]{40}|[a-f0-9]{64}) +(\d+)\t([\s\S]+)$/u.exec(
    listing[0],
  );
  if (listing.length !== 1 || !match || match[3] !== file || Number(match[2]) > 1_048_576)
    throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
  const bytes = await gitBytes(repositoryRoot, ['cat-file', 'blob', match[1]]);
  if (bytes.length !== Number(match[2])) throw new GitSelectionError('INVALID_GIT_SELECTION');
  return bytes;
}

/**
 * Turn deleted paths into delete candidates identified from merge-base content.
 * @param {object} context Repository, merge base and package directory.
 * @param {string} context.repositoryRoot Absolute repository root.
 * @param {string} context.mergeBase Resolved merge base.
 * @param {string | undefined} context.packageBase Absolute sfdx package directory.
 * @param {string[]} removed Deleted watched paths absent from the worktree.
 * @returns {Promise<GitDeleteCandidate[]>} Candidates sorted by path.
 */
async function deleteCandidates(
  context: { repositoryRoot: string; mergeBase: string; packageBase: string | undefined },
  removed: string[],
): Promise<GitDeleteCandidate[]> {
  const { repositoryRoot, mergeBase, packageBase } = context;
  const absolute = (file: string): string => path.join(repositoryRoot, ...file.split('/'));
  const candidates = new Map<string, GitDeleteCandidate>();
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh array within the existing TypeScript library target.
  for (const file of [...removed].sort()) {
    let kind: DeletedArtifactKind;
    let name: string;
    try {
      ({ kind, name } = classify(file, repositoryRoot, packageBase));
    } catch {
      // A deleted file of no known family cannot be turned into an org delete.
      throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    }
    const key = `${kind}:${name}`;
    if (candidates.has(key)) continue;
    let members = [file];
    if (kind === 'calculated-insight') {
      const relative = (value: string): string =>
        path.relative(repositoryRoot, value).split(path.sep).join('/');
      const stem = name.slice(0, -5);
      members = [
        relative(path.join(packageBase!, 'mktCalcInsightObjectDefs', `${stem}${ciXmlSuffix}`)),
        relative(
          path.join(packageBase!, 'data360', 'calculatedInsights', `${name}${ciJsonSuffix}`),
        ),
      ];
      // Both pair members go together; one left behind is not a complete deletion.
      for (const member of members)
        if (await present(absolute(member))) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    }
    const bytes = await Promise.all(
      members.map(async (member) => revisionBytes(repositoryRoot, mergeBase, member)),
    );
    // Added after the merge base and removed again: nothing changed in the range.
    if (bytes.every((value) => value === undefined)) continue;
    if (bytes.includes(undefined)) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    const [first, second] = bytes as Buffer[];
    let admitted: ReturnType<typeof admitDeletedArtifact>;
    try {
      admitted =
        kind === 'calculated-insight'
          ? admitDeletedArtifact(kind, name, second, first)
          : admitDeletedArtifact(kind, name, first);
    } catch {
      throw new GitSelectionError('INVALID_GIT_SELECTION');
    }
    const hash = createHash('sha256');
    if (kind === 'calculated-insight')
      hash
        .update(String(first.length))
        .update(':')
        .update(first)
        .update(String(second.length))
        .update(':')
        .update(second);
    else hash.update(first);
    candidates.set(
      key,
      Object.freeze({
        family: kind,
        path: absolute(members[0]),
        identity: Object.freeze(admitted.identity),
        ...(admitted.sourceObjectName === undefined
          ? {}
          : { sourceObjectName: admitted.sourceObjectName }),
        baseDigest: hash.digest('hex'),
      }),
    );
  }
  return [...candidates.values()];
}

/**
 * Resolve merge-base/HEAD plus index, working-tree and untracked changes locally.
 * Changed files of every family are admitted by the existing authored-input parser.
 * Files deleted in the range become delete candidates read from the merge base; they are
 * carried, never executed here. Git-inferred renames block; they are not a guarantee of
 * historical rename intent.
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
    const deleted = new Set<string>();
    const diff = [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '-l0',
      '--no-ext-diff',
      '--no-textconv',
    ];
    collect(await git(repositoryRoot, [...diff, mergeBase, headCommit, '--']), paths, deleted);
    collect(await git(repositoryRoot, [...diff, '--cached', headCommit, '--']), paths, deleted);
    const worktree = await git(repositoryRoot, [...diff, '--']);
    const hasWorktreeDeletion = collect(worktree, paths, deleted, true);
    const untracked = tokens(
      await git(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
    );
    // Git cannot infer worktree renames to untracked destinations: refuse ambiguous inbound moves.
    if (untracked.some((file) => relevant(file)) && hasWorktreeDeletion)
      throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
    for (const file of untracked) if (relevant(file)) paths.add(file);
    // The current tree decides: a path deleted at some stage but present now is not a delete.
    const removed: string[] = [];
    for (const file of deleted) {
      if (await present(path.join(repositoryRoot, ...file.split('/')))) {
        if (!paths.has(file)) throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
        continue;
      }
      paths.delete(file);
      removed.push(file);
    }
    const packageBase = [...paths, ...removed].some((file) => needsPackage(file))
      ? await segmentSourceRoot(repositoryRoot)
      : undefined;
    const metadata = [...paths].map((file) => {
      if (segmentXml(file)) throw new GitSelectionError('INVALID_GIT_SELECTION');
      const { kind, name } = classify(file, repositoryRoot, packageBase);
      return `${kind}:${name}`;
    });
    const deletions = await deleteCandidates({ repositoryRoot, mergeBase, packageBase }, removed);
    // Existing admission checks canonical filename, document identity and no-link regular files.
    const inputs =
      metadata.length > 0 ? await readDeployInputs({ cwd: repositoryRoot, metadata }) : [];
    const segments = inputs.filter(
      (input): input is SegmentDeployInput => input.document.kind === 'segment',
    );
    const identityResolutions = inputs.filter(
      (input): input is IdentityResolutionDeployInput =>
        input.document.kind === 'identity-resolution',
    );
    const calculatedInsights = inputs.filter(
      (input): input is CalculatedInsightDeployInput =>
        input.document.kind === 'calculated-insight',
    );
    const dlos = inputs.filter((input): input is DloDeployInput => input.document.kind === 'dlo');
    return {
      ...(dlos.length > 0 ? { dlos: Object.freeze(dlos) } : {}),
      ...(calculatedInsights.length > 0
        ? { calculatedInsights: Object.freeze(calculatedInsights) }
        : {}),
      ...(identityResolutions.length > 0
        ? { identityResolutions: Object.freeze(identityResolutions) }
        : {}),
      paths: inputs.map((input) => input.path),
      ...(inputs.length > 0 ? { capturedInputs: Object.freeze(inputs) } : {}),
      ...(segments.length > 0 ? { segments: Object.freeze(segments) } : {}),
      ...(deletions.length > 0 ? { deletions: Object.freeze(deletions) } : {}),
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
