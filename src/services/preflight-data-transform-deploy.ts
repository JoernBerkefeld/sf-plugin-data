import {
  DataTransformError,
  refuseEscapedTransformExpressions,
  sameDataTransformDefinition,
  sameDataTransformSchedule,
  validateDataTransformDocument,
} from '../artifacts/data-transform-document.js';
import { refuseEscapedCopy } from './escaped-copy.js';
import type {
  DataTransformDocument,
  DataTransformObservation,
} from '../artifacts/data-transform-document.js';
import type { DataTransformClient } from '../transport/data-transform-rest.js';
import { retrieveDataTransform } from './retrieve-data-transform.js';
import { explainInput, printableKey } from './operation-diagnostic.js';
import { displayableApiText } from '../transport/connect-diagnostic.js';

/**
 * One validation issue as it may be shown: its error code when it is a code, and its message (plain
 * text: the client asks for it, plainTextHeaders) when it passes the display filter of REST
 * errors. A possessive `'s` reads as `’s`, so the filter does not take it
 * for a quoted value. Anything else is left out.
 * @param {unknown} issue Validation issue.
 * @returns {string | undefined} Displayable text, or none.
 */
function issueText(issue: unknown): string | undefined {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return undefined;
  const { errorCode, errorMessage } = issue as Record<string, unknown>;
  const code =
    typeof errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(errorCode)
      ? errorCode
      : undefined;
  const message =
    typeof errorMessage === 'string'
      ? displayableApiText(errorMessage.replaceAll(/(?<=[A-Za-z0-9_])'(?=s\b)/gu, '’'))
      : undefined;
  return code || message ? [code, message].filter(Boolean).join(': ') : undefined;
}

/**
 * TRANSFORM_VALIDATION_FAILED with Salesforce's issues: at most three, each as {@link issueText}
 * admits it.
 * @param {string} name Transform name.
 * @param {unknown[]} issues Validation issues (at least one).
 * @returns {DataTransformError} The refusal.
 */
function validationRefusal(name: string, issues: unknown[]): DataTransformError {
  const texts = [
    ...new Set(issues.map((issue) => issueText(issue)).filter((text) => text !== undefined)),
  ];
  const shown = `${texts.slice(0, 3).join('; ')}${texts.length > 3 ? `; and ${texts.length - 3} more` : ''}`;
  return explainInput(
    new DataTransformError('TRANSFORM_VALIDATION_FAILED'),
    `Salesforce validation rejected the data transform ${name}${shown ? `: ${shown}${/[.!?]$/u.test(shown) ? '' : '.'}` : ' without an issue text that can be shown.'} Nothing was created.`,
  );
}

export type DataTransformDeploySelection =
  { operation: 'create' } | { operation: 'update'; targetId: string };
export type DataTransformDeployPlan = {
  operation: 'create' | 'update' | 'unchanged';
  document: DataTransformDocument;
  targetId?: string;
  current?: DataTransformObservation;
  /** Whether the definition is sent (create POST or update PUT). */
  writeDefinition: boolean;
  /** Whether the schedule of the file is sent with the schedule PUT. */
  writeSchedule: boolean;
};

/**
 * Preflight a create, or an update of the target the deploy resolved by name. The definition is
 * unchanged when it equals the org's projected input (enum values ignoring letter case); the
 * schedule is unchanged when the file has none (left alone) or it equals the org's projected
 * schedule (a new transform has none). What differs is sent as written and Salesforce decides.
 * @param {unknown} value Portable artifact.
 * @param {DataTransformDeploySelection} selection Create, or update with the resolved target ID.
 * @param {DataTransformClient} client Native API68 transform transport.
 * @param {object} [options] Preview-only native validation control.
 * @param {boolean} [options.skipServerValidation] Skip validation POST for GET-only preview.
 * @returns {Promise<DataTransformDeployPlan>} Fresh target-bound plan, not a replay token.
 */
export async function preflightDataTransformDeploy(
  value: unknown,
  selection: DataTransformDeploySelection,
  client: DataTransformClient,
  options: { skipServerValidation?: boolean } = {},
): Promise<DataTransformDeployPlan> {
  const document = validateDataTransformDocument(value);
  refuseEscapedTransformExpressions(document);
  // A create can name its data space only through dataSpaceName; without it the data space of
  // the new transform is not proven, so a create outside default is refused before any write.
  if (
    selection.operation === 'create' &&
    document.c__dataSpace !== 'default' &&
    typeof document.definition.dataSpaceName !== 'string'
  )
    throw explainInput(
      new DataTransformError('TRANSFORM_DATASPACE_MISMATCH'),
      `Data transform ${String(document.definition.name)} does not exist yet and its definition names no dataSpaceName, so a create cannot put it into the data space ${printableKey(document.c__dataSpace)} (c__dataSpace). Add definition.dataSpaceName, or create it in Data Cloud; nothing was written.`,
    );
  let current: DataTransformObservation | undefined;
  if (selection.operation === 'update') {
    current = await retrieveDataTransform(selection.targetId, client);
    if (current.document.definition.name !== document.definition.name)
      throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
    // Names are unique in the org: the transform of that name must be in the file's data space.
    if (current.document.c__dataSpace !== document.c__dataSpace)
      throw explainInput(
        new DataTransformError('TRANSFORM_DATASPACE_MISMATCH'),
        `The org's data transform ${String(document.definition.name)} is in the data space ${printableKey(current.document.c__dataSpace)}, but the file names ${printableKey(document.c__dataSpace)} in c__dataSpace. A transform does not move between data spaces; nothing was written.`,
      );
  }
  if (current)
    refuseEscapedCopy(
      document.definition,
      current.document.definition,
      (code) => new DataTransformError(code),
    );
  const writeDefinition = !current || !sameDataTransformDefinition(current.document, document);
  const writeSchedule =
    document.schedule !== undefined &&
    !sameDataTransformSchedule(current?.document.schedule, document.schedule);
  if (current && !writeDefinition && !writeSchedule)
    return {
      operation: 'unchanged',
      document,
      targetId: current.targetId,
      current,
      writeDefinition,
      writeSchedule,
    };
  // The validation endpoint rejects an existing owner's own output (live-observed), so only create is validated.
  if (selection.operation === 'create' && !options.skipServerValidation) {
    const validation = await client.validate(document.definition);
    if (
      !validation ||
      typeof validation !== 'object' ||
      Array.isArray(validation) ||
      !Array.isArray((validation as Record<string, unknown>).issues)
    )
      throw new DataTransformError('TRANSFORM_VALIDATION_FAILED');
    const issues = (validation as Record<string, unknown>).issues as unknown[];
    if (issues.length > 0) throw validationRefusal(String(document.definition.name), issues);
  }
  return {
    operation: selection.operation,
    document,
    targetId: current?.targetId,
    current,
    writeDefinition,
    writeSchedule,
  };
}
