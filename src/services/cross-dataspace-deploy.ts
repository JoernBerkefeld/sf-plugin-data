import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeployInput } from '../artifacts/read-deploy-input.js';
import type { NativeMappingDocument } from '../artifacts/native-mapping-document.js';
import { translatedDeployInput } from '../artifacts/read-deploy-input.js';
import {
  leanNativeDmoDocument,
  validateNativeDmoDocument,
} from '../artifacts/native-dmo-document.js';
import { serializeSegmentFiles } from '../artifacts/segment-document.js';
import { codeFilePath } from '../artifacts/code-fields.js';
import {
  calculatedInsightReference,
  serializeNativeCalculatedInsight,
} from '../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../artifacts/native-calculated-insight-document.js';
import { writeNativeCalculatedInsightDocument } from '../artifacts/write-native-calculated-insight.js';
import { validateNativeDataGraphDocument } from '../artifacts/native-data-graph-document.js';
import {
  serializeIdentityResolutionDocument,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import {
  serializeDataTransformDocument,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import { writeDataGraphDocument } from '../artifacts/write-data-graph.js';
import { writeIdentityResolutionDocument } from '../artifacts/write-identity-resolution.js';
import { writeDataTransformDocument } from '../artifacts/write-data-transform.js';
import { dataTransformArtifactPath } from './retrieve-data-transform.js';
import { writeNativeDmoDocument } from '../artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../artifacts/write-native-mapping.js';
import { writeNativeRelationshipDocument } from '../artifacts/write-native-relationship.js';
import { writeSegmentDocument } from '../artifacts/write-segment.js';
import type { DataSpaceSender, OrgDataSpace } from './data-space-check.js';
import type {
  CrossSpaceRewrite,
  CrossSpaceUnresolved,
  RulesetEntry,
} from './cross-dataspace-rename.js';
import {
  customDmosOf,
  pairedByRulesets,
  translateCalculatedInsight,
  translateDocument,
} from './cross-dataspace-rename.js';
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
 * The name of the item a file describes: `definition.name` for a data graph or transform,
 * `identity.apiName` otherwise.
 * @param {Record<string, unknown>} document Admitted file.
 * @returns {string} Name.
 */
function documentName(document: Record<string, unknown>): string {
  return document.kind === 'native-data-graph' || document.kind === 'data-transform'
    ? String((document.definition as { name?: unknown }).name)
    : (document.identity as { apiName: string }).apiName;
}

/**
 * Every string of a value, for the scan of names before translation.
 * @param {unknown} value Value.
 * @param {string[]} into Receives the strings.
 * @returns {string[]} The strings.
 */
function stringsOf(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const entry of value) stringsOf(entry, into);
  else if (value && typeof value === 'object')
    for (const entry of Object.values(value)) stringsOf(entry, into);
  return into;
}

/**
 * Whether a selected file of another data space names an identity resolution output (by the
 * rule's spelling, or an output of the oldest default ruleset without suffix such as
 * `UnifiedIndividual__dlm`): only then does the deploy read the ruleset list, once.
 * @param {readonly DeployInput[]} inputs The admitted selection.
 * @param {string} run The run's data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces.
 * @returns {boolean} Whether the ruleset list is needed.
 */
export function crossSpaceNeedsRulesets(
  inputs: readonly DeployInput[],
  run: string,
  spaces: readonly OrgDataSpace[],
): boolean {
  return inputs.some((input) => {
    const document = input.document as unknown as Record<string, unknown>;
    const from = crossSpaceSource(document, run);
    if (from === undefined) return false;
    const context = { source: from, target: run, spaces };
    // A SQL text (an insight's dependencies, a segment model) is read name by name.
    return stringsOf(document).some((value) =>
      (value.match(/[A-Za-z0-9_]+__dlm\b/gu) ?? []).some((name) => pairedByRulesets(context, name)),
    );
  });
}

const rulesetsRead = 'CROSS_DATASPACE_RULESETS_READ_FAILED';

/**
 * The refusal when the ruleset list cannot be read.
 * @returns {CrossSpaceError} CROSS_DATASPACE_RULESETS_READ_FAILED with an explanation.
 */
function rulesetsReadFailed(): CrossSpaceError {
  return explainInput(
    new CrossSpaceError(rulesetsRead),
    'A file names an identity resolution output, and the identity resolution ruleset list that places it could not be read. Nothing was sent; rerun the deploy.',
  );
}

/**
 * A nonempty text value, or undefined.
 * @param {unknown} value Candidate.
 * @returns {string | undefined} The text.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** The route of the identity resolution ruleset list (every data space at once, API 68). */
const rulesetsRoute = '/services/data/v68.0/ssot/identity-resolutions';

/**
 * Read the org's identity resolution rulesets with one `GET /ssot/identity-resolutions`: each
 * one's name, data space, type and the unified and link output of each reconciliation entity.
 * The list answers every data space at once (live API 68). An entry without a name, data space or
 * type is left out; a malformed answer is CROSS_DATASPACE_RULESETS_READ_FAILED.
 * @param {DataSpaceSender} open Opens the command's shared bound sender.
 * @returns {Promise<RulesetEntry[]>} Rulesets.
 */
export async function readRulesetEntries(open: DataSpaceSender): Promise<RulesetEntry[]> {
  const sender = await open();
  let response: unknown;
  try {
    response = await sender.request('GET', rulesetsRoute);
  } catch (error) {
    if ((error as { code?: unknown }).code === 'AUTHENTICATION_FAILED') throw error;
    throw rulesetsReadFailed();
  }
  const entries = (response as { identityResolutions?: unknown } | null)?.identityResolutions;
  if (!Array.isArray(entries)) throw rulesetsReadFailed();
  const rulesets: RulesetEntry[] = [];
  for (const entry of entries as Array<Record<string, unknown> | null>) {
    const apiName = text(entry?.objectApiName);
    const dataSpace = text(entry?.dataSpaceName);
    const configurationType = text(entry?.configurationType);
    if (!apiName || !dataSpace || !configurationType) continue;
    const rules = Array.isArray(entry?.reconciliationRules)
      ? (entry.reconciliationRules as Array<Record<string, unknown> | null>)
      : [];
    rulesets.push({
      apiName,
      dataSpace,
      configurationType,
      outputs: rules.flatMap((rule) => {
        const entity = text(rule?.entityName);
        return entity
          ? [{ entity, unified: text(rule?.unifiedDmoName), link: text(rule?.linkDmoName) }]
          : [];
      }),
    });
  }
  return rulesets;
}

/**
 * Translate every selected file of another data space into the run's data space, in memory. The
 * files on disk never change; each translated input still checks the file's own bytes.
 * @param {readonly DeployInput[]} inputs The admitted selection.
 * @param {string} run The run's data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces with their prefixes.
 * @param {readonly RulesetEntry[]} [rulesets] The ruleset list, read when a file names an
 * identity resolution output (crossSpaceNeedsRulesets).
 * @returns {CrossSpacePlan} The translated selection and its report.
 */
export function planCrossSpaceInputs(
  inputs: readonly DeployInput[],
  run: string,
  spaces: readonly OrgDataSpace[],
  rulesets?: readonly RulesetEntry[],
): CrossSpacePlan {
  const documents = inputs.map((input) => input.document as unknown as Record<string, unknown>);
  // Custom DMO evidence per source data space: only DMO files of that data space count.
  const customDmos = new Map<string, Set<string>>();
  const customDmosFrom = (source: string): Set<string> => {
    let found = customDmos.get(source);
    if (!found) {
      found = customDmosOf(documents, source);
      customDmos.set(source, found);
    }
    return found;
  };
  // Rulesets this deploy translates too: their outputs keep the rule names (the ID is kept).
  const selectedRulesets = new Set(
    documents
      .filter(
        (document) =>
          document.kind === 'identity-resolution' && crossSpaceSource(document, run) !== undefined,
      )
      .map((document) => (document.identity as { apiName: string }).apiName),
  );
  const files: CrossSpaceFile[] = [];
  const unsupported: CrossSpaceRefusedFile[] = [];
  const translated = inputs.map((input, index) => {
    const document = documents[index];
    const from = crossSpaceSource(document, run);
    if (from === undefined) return input;
    const family = familyOf(document);
    const context = {
      source: from,
      target: run,
      spaces,
      customDmos: customDmosFrom(from),
      selectedRulesets,
      ...(rulesets ? { rulesets } : {}),
    };
    if (document.kind === 'calculated-insight') {
      // An insight is translated from its JSON with the SQL joined, then planned again from it.
      const insight = translateCalculatedInsight(
        (input as { native: Record<string, unknown> }).native,
        context,
      );
      files.push({
        path: input.path,
        family,
        from,
        rewrites: insight.rewrites,
        unresolved: insight.unresolved,
      });
      return translatedDeployInput(
        input,
        calculatedInsightReference(insight.document as NativeCalculatedInsight),
        insight.document,
      ) as DeployInput;
    }
    const result = translateDocument(document, context);
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
  return duplicateTargets(plan, run, shown);
}

/**
 * The keys under which an input reaches an org item: family and API name, and for a mapping its
 * source DLO and target DMO, for a relationship both its sides (their org names differ from the
 * file's).
 * @param {DeployInput} input Input, translated or not.
 * @returns {string[]} Lowercase target keys.
 */
function targetKeys(input: DeployInput): string[] {
  const document = input.document as unknown as Record<string, unknown>;
  const keys = [`${familyOf(document)}:${documentName(document)}`];
  const spec = document.spec as Record<string, string>;
  if (document.kind === 'mapping')
    keys.push(
      `mapping-binding:${spec.sourceEntityDeveloperName}:${spec.targetEntityDeveloperName}`,
    );
  if (document.kind === 'relationship')
    keys.push(
      `relationship-binding:${spec.sourceObjectName}.${spec.sourceFieldName}:${spec.targetObjectName}.${spec.targetFieldName}`,
    );
  return keys.map((key) => key.toLowerCase());
}

/**
 * Refuse two inputs that reach the same org item once translated (a copy file selected beside
 * its original), before any write: both would deploy over each other.
 * @param {CrossSpacePlan} plan Translated selection.
 * @param {string} run The run's data space.
 * @param {(file: string) => string} shown How a file path is shown.
 * @returns {CrossSpaceError | undefined} DUPLICATE_IDENTITY with both files named.
 */
function duplicateTargets(
  plan: CrossSpacePlan,
  run: string,
  shown: (file: string) => string,
): CrossSpaceError | undefined {
  const seen = new Map<string, string>();
  for (const input of plan.inputs)
    for (const key of targetKeys(input)) {
      const prior = seen.get(key);
      if (prior !== undefined && prior !== input.path)
        return explainInput(
          new CrossSpaceError('DUPLICATE_IDENTITY'),
          `${shown(prior)} and ${shown(input.path)} describe the same ${familyOf(input.document as unknown as Record<string, unknown>)} once translated into ${run}, so nothing was sent. Select only one of them, for example leave out the copy file of an earlier --allow-cross-dataspace deploy, then rerun.`,
        );
      seen.set(key, input.path);
    }
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

/** Where the files of a copy go and what they hold, for a family whose name is known before the write. */
type PlannedCopy = Array<{ path: string; bytes: Buffer }>;

/**
 * The JSON file and its SQL files, as one copy.
 * @param {string} jsonPath JSON file path.
 * @param {{json: string; files: Array<{extension: string; name?: string; text: string}>}} serialized Serialized files.
 * @param {string} serialized.json JSON text.
 * @param {Array<{extension: string; name?: string; text: string}>} serialized.files Code files.
 * @returns {PlannedCopy} Paths and bytes.
 */
function withCode(
  jsonPath: string,
  serialized: { json: string; files: Array<{ extension: string; name?: string; text: string }> },
): PlannedCopy {
  return [
    { path: jsonPath, bytes: Buffer.from(serialized.json) },
    ...serialized.files.map((file) => ({
      path: codeFilePath(jsonPath, file),
      bytes: Buffer.from(file.text),
    })),
  ];
}

/**
 * The copy files of a translated DMO, segment (with its SQL files), calculated insight (JSON and
 * SQL), data graph, ruleset or transform, as retrieve would write them.
 * @param {DeployInput} input Translated input.
 * @returns {PlannedCopy | undefined} Paths and bytes; undefined for another family.
 */
function plannedCopy(input: DeployInput): PlannedCopy | undefined {
  const document = input.document as unknown as Record<string, unknown>;
  const root = projectRootOf(input.path);
  const apiName = documentName(document);
  if (document.kind === 'calculated-insight')
    return withCode(
      path.join(root, 'data360', 'calculatedInsights', `${apiName}.calculatedInsight-meta.json`),
      serializeNativeCalculatedInsight((input as { native: unknown }).native),
    );
  if (document.kind === 'native-data-graph')
    return [
      {
        path: path.join(root, 'data360', 'dataGraphs', `${apiName}.native-dataGraph.json`),
        bytes: Buffer.from(
          `${JSON.stringify(validateNativeDataGraphDocument(document, 'retrieve'), undefined, 2)}\n`,
        ),
      },
    ];
  if (document.kind === 'identity-resolution')
    return [
      {
        path: path.join(
          root,
          'data360',
          'identityResolution',
          `${apiName}.identityResolution.json`,
        ),
        bytes: Buffer.from(
          serializeIdentityResolutionDocument(
            validateIdentityResolutionDocument(document, 'retrieve'),
            'retrieve',
          ),
        ),
      },
    ];
  if (document.kind === 'data-transform')
    return [
      {
        path: path.join(root, dataTransformArtifactPath(apiName)),
        bytes: Buffer.from(
          serializeDataTransformDocument(
            validateDataTransformDocument(document, 'retrieve'),
            'retrieve',
          ),
        ),
      },
    ];
  if (document.kind === 'dmo')
    return [
      {
        path: path.join(root, 'data360', 'dmo', `${apiName}.dmo-meta.json`),
        bytes: Buffer.from(
          `${JSON.stringify(leanNativeDmoDocument(validateNativeDmoDocument(document, 'retrieve')), undefined, 2)}\n`,
        ),
      },
    ];
  if (document.kind === 'segment')
    return withCode(
      path.join(root, 'data360', 'segments', `${apiName}.segment.json`),
      serializeSegmentFiles(document, 'retrieve'),
    );
  return undefined;
}

/**
 * Check, before any write, that the copy file of a translated item named before the write (DMO,
 * segment, data graph, ruleset, transform) can be written: a
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
  for (const input of inputs)
    for (const copy of plannedCopy(input) ?? []) {
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

/**
 * The key of one mapping pair: its source and target field.
 * @param {{sourceFieldDeveloperName: string, targetFieldDeveloperName: string}} pair Pair.
 * @param {string} pair.sourceFieldDeveloperName DLO field.
 * @param {string} pair.targetFieldDeveloperName DMO field.
 * @returns {string} Pair key.
 */
function pairKey(pair: {
  sourceFieldDeveloperName: string;
  targetFieldDeveloperName: string;
}): string {
  return `${pair.sourceFieldDeveloperName}:${pair.targetFieldDeveloperName}`;
}

/**
 * The copy file of a deployed mapping as a retrieve of the target writes it: the mapping as read
 * back (its name and the pair selectors Salesforce holds), with the deployed pairs only (no pair
 * Salesforce generated) and the label the file set, unless that equals the name.
 * @param {NativeMappingDocument} deployed Translated mapping that was deployed.
 * @param {NativeMappingDocument} org The mapping as the deploy read it back.
 * @returns {NativeMappingDocument} Copy document.
 */
function mappingCopy(
  deployed: NativeMappingDocument,
  org: NativeMappingDocument,
): NativeMappingDocument {
  const authored = new Set(deployed.spec.fieldMappings.map((pair) => pairKey(pair)));
  const label = deployed.spec.label;
  return {
    ...org,
    spec: {
      ...org.spec,
      fieldMappings: org.spec.fieldMappings.filter((pair) => authored.has(pairKey(pair))),
      ...(label === undefined || label === org.identity.apiName ? {} : { label }),
    },
  };
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
 * @param {string} [orgName] The name Salesforce returned, for a relationship.
 * @param {NativeMappingDocument} [orgMapping] For a mapping, the document the deploy read back.
 * @returns {Promise<CopyOutcome | undefined>} Outcome; undefined for a DLO.
 */
export async function writeCopyFile(
  input: DeployInput,
  orgName?: string,
  orgMapping?: NativeMappingDocument,
): Promise<CopyOutcome | undefined> {
  const document = input.document as unknown as Record<string, unknown>;
  const root = projectRootOf(input.path);
  if (document.kind === 'dlo') return undefined;
  const named =
    document.kind === 'mapping'
      ? orgMapping === undefined
        ? undefined
        : mappingCopy(document as unknown as NativeMappingDocument, orgMapping)
      : document.kind === 'relationship'
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
      document.kind === 'calculated-insight'
        ? await writeNativeCalculatedInsightDocument(
            (input as { native: unknown }).native,
            root,
            false,
          )
        : document.kind === 'dmo'
          ? await writeNativeDmoDocument(named, root, false)
          : document.kind === 'mapping'
            ? await writeNativeMappingDocument(named, root, false)
            : document.kind === 'relationship'
              ? await writeNativeRelationshipDocument(named, root, false)
              : document.kind === 'native-data-graph'
                ? await writeDataGraphDocument(named, root, false)
                : document.kind === 'identity-resolution'
                  ? await writeIdentityResolutionDocument(named, root, false)
                  : document.kind === 'data-transform'
                    ? await writeDataTransformDocument(named, root, false)
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
