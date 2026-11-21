import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeployInput } from '../artifacts/read-deploy-input.js';
import { translatedDeployInput } from '../artifacts/read-deploy-input.js';
import {
  leanNativeDmoDocument,
  validateNativeDmoDocument,
} from '../artifacts/native-dmo-document.js';
import { serializeSegmentFiles } from '../artifacts/segment-document.js';
import { writeNativeDmoDocument } from '../artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../artifacts/write-native-mapping.js';
import { writeNativeRelationshipDocument } from '../artifacts/write-native-relationship.js';
import { writeSegmentDocument } from '../artifacts/write-segment.js';
import type { OrgDataSpace } from './data-space-check.js';
import type { CrossSpaceRewrite, CrossSpaceUnresolved } from './cross-dataspace-rename.js';
import { customDmosOf, translateDocument } from './cross-dataspace-rename.js';
import { explainInput } from './operation-diagnostic.js';

/** One file of another data space, translated into the run's data space. */
export type CrossSpaceFile = {
  path: string;
  family: string;
  from: string;
  rewrites: CrossSpaceRewrite[];
  unresolved: CrossSpaceUnresolved[];
};

/** A file of a kind the translation does not cover yet. */
export type CrossSpaceRefusedFile = { path: string; family: string; from: string; reason: string };

/** The translated selection of a cross-data-space deploy. */
export type CrossSpacePlan = {
  /** The selection with every translated input replaced. */
  inputs: DeployInput[];
  files: CrossSpaceFile[];
  unsupported: CrossSpaceRefusedFile[];
};

/** Payload-free refusal of a cross-data-space deploy. */
export class CrossSpaceError extends Error {
  public constructor(public readonly code: string) {
    super(`Cross-data-space deploy refused: ${code}.`);
    this.name = 'CrossSpaceError';
  }
}

/**
 * The data spaces a file names: a list for a DLO or data stream, one name otherwise (a
 * calculated insight in its identity).
 * @param {Record<string, unknown>} document Admitted file.
 * @returns {string[]} Data space names.
 */
export function fileDataSpaces(document: Record<string, unknown>): string[] {
  const named = document.c__dataSpace;
  if (Array.isArray(named)) return named as string[];
  if (typeof named === 'string') return [named];
  if (document.kind === 'calculated-insight') {
    const space = (document.identity as { dataSpace?: unknown } | undefined)?.dataSpace;
    return typeof space === 'string' ? [space] : [];
  }
  return [];
}

/**
 * The data space a file comes from when it is not the run's: the one it names, or for a DLO or
 * stream whose list lacks the run's data space, its first listed space.
 * @param {Record<string, unknown>} document Admitted file.
 * @param {string} run The run's data space.
 * @returns {string | undefined} Source data space, or undefined for a file of the run's space.
 */
export function crossSpaceSource(
  document: Record<string, unknown>,
  run: string,
): string | undefined {
  const spaces = fileDataSpaces(document);
  if (spaces.length === 0 || spaces.includes(run)) return undefined;
  return spaces[0];
}

/**
 * The family name deploy reports for a file.
 * @param {Record<string, unknown>} document Admitted file.
 * @returns {string} Family.
 */
function familyOf(document: Record<string, unknown>): string {
  return document.kind === 'native-data-graph' ? 'data-graph' : String(document.kind);
}

/**
 * Translate every selected file of another data space into the run's data space, in memory. The
 * files on disk never change; each translated input still checks the file's own bytes.
 * @param {readonly DeployInput[]} inputs The admitted selection.
 * @param {string} run The run's data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces with their prefixes.
 * @returns {CrossSpacePlan} The translated selection and its report.
 */
export function planCrossSpaceInputs(
  inputs: readonly DeployInput[],
  run: string,
  spaces: readonly OrgDataSpace[],
): CrossSpacePlan {
  const documents = inputs.map((input) => input.document as unknown as Record<string, unknown>);
  const customDmos = customDmosOf(documents);
  const files: CrossSpaceFile[] = [];
  const unsupported: CrossSpaceRefusedFile[] = [];
  const translated = inputs.map((input, index) => {
    const document = documents[index];
    const from = crossSpaceSource(document, run);
    if (from === undefined) return input;
    const family = familyOf(document);
    const result = translateDocument(document, { source: from, target: run, spaces, customDmos });
    if ('unsupported' in result) {
      unsupported.push({ path: input.path, family, from, reason: result.unsupported });
      return input;
    }
    files.push({
      path: input.path,
      family,
      from,
      rewrites: result.rewrites,
      unresolved: result.unresolved,
    });
    return translatedDeployInput(input, result.document) as DeployInput;
  });
  return { inputs: translated, files, unsupported };
}

/**
 * The refusal of a plan that holds an unsupported file or a name it cannot place, or undefined.
 * @param {CrossSpacePlan} plan Translated selection.
 * @param {string} run The run's data space.
 * @param {(file: string) => string} shown How a file path is shown.
 * @returns {CrossSpaceError | undefined} Refusal with its explanation.
 */
export function crossSpaceRefusal(
  plan: CrossSpacePlan,
  run: string,
  shown: (file: string) => string,
): CrossSpaceError | undefined {
  if (plan.unsupported.length > 0)
    return explainInput(
      new CrossSpaceError('CROSS_DATASPACE_UNSUPPORTED'),
      `--allow-cross-dataspace cannot deploy these files into ${run} yet: ${plan.unsupported
        .map((file) => `${shown(file.path)} (${file.reason})`)
        .join(
          '; ',
        )}. Nothing was sent. Deploy them with --dataspace ${plan.unsupported[0].from}, or leave them out of this deploy.`,
    );
  const unresolved = plan.files.flatMap((file) =>
    file.unresolved.map(
      (entry) => `${shown(file.path)} ${entry.at} ${entry.name}: ${entry.reason}`,
    ),
  );
  if (unresolved.length > 0)
    return explainInput(
      new CrossSpaceError('CROSS_DATASPACE_UNRESOLVED'),
      `These names cannot be placed in ${run} exactly, so nothing was sent: ${unresolved.join('; ')}.`,
    );
  return undefined;
}

/**
 * The project root of an admitted file (`<root>/data360/<family folder>/<file>`).
 * @param {string} file Absolute file path.
 * @returns {string} Project root.
 */
function projectRootOf(file: string): string {
  return path.dirname(path.dirname(path.dirname(file)));
}

/** Where a copy file goes and what it holds, for a family whose name is known before the write. */
type PlannedCopy = { path: string; bytes: Buffer };

/**
 * The copy file of a translated DMO or segment, as retrieve would write it.
 * @param {DeployInput} input Translated input.
 * @returns {PlannedCopy | undefined} Path and bytes; undefined for another family.
 */
function plannedCopy(input: DeployInput): PlannedCopy | undefined {
  const document = input.document as unknown as Record<string, unknown>;
  const root = projectRootOf(input.path);
  const apiName = (document.identity as { apiName: string }).apiName;
  if (document.kind === 'dmo')
    return {
      path: path.join(root, 'data360', 'dmo', `${apiName}.dmo-meta.json`),
      bytes: Buffer.from(
        `${JSON.stringify(leanNativeDmoDocument(validateNativeDmoDocument(document, 'retrieve')), undefined, 2)}\n`,
      ),
    };
  if (document.kind === 'segment')
    return {
      path: path.join(root, 'data360', 'segments', `${apiName}.segment.json`),
      bytes: Buffer.from(serializeSegmentFiles(document, 'retrieve').json),
    };
  return undefined;
}

/**
 * Check, before any write, that the copy file of a translated DMO or segment can be written: a
 * new path, or an existing file with exactly the same content (reused). Mapping and
 * relationship copies are named by Salesforce, so they are checked when they are written.
 * @param {readonly DeployInput[]} inputs Translated inputs.
 * @param {(file: string) => string} shown How a file path is shown.
 * @returns {Promise<string[]>} Copy paths planned (new or reused).
 */
export async function precheckCopyFiles(
  inputs: readonly DeployInput[],
  shown: (file: string) => string,
): Promise<string[]> {
  const planned: string[] = [];
  for (const input of inputs) {
    const copy = plannedCopy(input);
    if (!copy) continue;
    let existing: Buffer | undefined;
    try {
      existing = await readFile(copy.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (
      existing !== undefined &&
      (path.resolve(copy.path) === path.resolve(input.path) || !existing.equals(copy.bytes))
    )
      throw explainInput(
        new CrossSpaceError('CROSS_DATASPACE_COPY_CONFLICT'),
        `The translated copy of ${shown(input.path)} would be written to ${shown(copy.path)}, but that file already exists with other content. Existing files are never changed, so nothing was sent. Move or remove that file, then rerun.`,
      );
    planned.push(copy.path);
  }
  return planned;
}

/** What happened to one copy file. */
export type CopyOutcome = {
  source: string;
  path?: string;
  outcome: 'written' | 'unchanged' | 'not-written';
  reason?: string;
};

/**
 * Write the translated copy of one deployed item, only to a new path; an existing file with the
 * same content is reused, one with other content is left alone and reported. A DLO gets no copy
 * (only its data space list changed in the org).
 * @param {DeployInput} input Translated input.
 * @param {string} [orgName] The name Salesforce returned, for a mapping or relationship.
 * @returns {Promise<CopyOutcome | undefined>} Outcome; undefined for a DLO.
 */
export async function writeCopyFile(
  input: DeployInput,
  orgName?: string,
): Promise<CopyOutcome | undefined> {
  const document = input.document as unknown as Record<string, unknown>;
  const root = projectRootOf(input.path);
  if (document.kind === 'dlo') return undefined;
  const named =
    document.kind === 'mapping' || document.kind === 'relationship'
      ? orgName === undefined
        ? undefined
        : { ...document, identity: { ...(document.identity as object), apiName: orgName } }
      : document;
  if (!named)
    return {
      source: input.path,
      outcome: 'not-written',
      reason: 'Salesforce returned no name for it',
    };
  try {
    const receipt =
      document.kind === 'dmo'
        ? await writeNativeDmoDocument(named, root, false)
        : document.kind === 'mapping'
          ? await writeNativeMappingDocument(named, root, false)
          : document.kind === 'relationship'
            ? await writeNativeRelationshipDocument(named, root, false)
            : await writeSegmentDocument(named, root, false);
    return {
      source: input.path,
      path: receipt.path,
      outcome: receipt.outcome === 'unchanged' ? 'unchanged' : 'written',
    };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return {
      source: input.path,
      outcome: 'not-written',
      reason:
        code === 'OVERWRITE_REQUIRED'
          ? 'a file of that name already exists with other content; existing files are never changed'
          : `the file could not be written (${typeof code === 'string' ? code : 'OUTPUT_FAILED'})`,
    };
  }
}
