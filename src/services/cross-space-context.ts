import type { CrossSpaceContext } from 'salesforce-data360-rules';
import { pairedByRulesets } from 'salesforce-data360-rules';
import { sortedDataSpaces } from '../artifacts/data-space-field.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import { readRulesetEntries } from './cross-dataspace-deploy.js';
import type { CrossSpaceError } from './cross-dataspace-deploy.js';
import { DataSpaceError, readOrgDataSpaceEntries } from './data-space-check.js';
import type { LookupConnection } from './segment-lookup.js';
import { explainInput, printableKey } from './operation-diagnostic.js';

/**
 * The context the rename rules of `salesforce-data360-rules` need to turn names of one data
 * space into those of another (`placeDmo`, `translateSegmentName`, …): the
 * org's data spaces with their prefixes and, when needed, its identity resolution rulesets. The
 * rulesets are read when `names` is left out or one of them is an identity resolution output (the
 * unified DMO of another data space is named by that space's ruleset, not by a spelling rule).
 * @param {LookupConnection} connection Authenticated connection.
 * @param {{from: string, to: string, names?: readonly string[]}} options Source and target data
 * space, and the DMO names the caller will translate.
 * @param {string} options.from Source data space.
 * @param {string} options.to Target data space.
 * @param {readonly string[]} [options.names] DMO names of the source space to be translated.
 * @returns {Promise<CrossSpaceContext>} The context.
 * @throws {DataSpaceError} UNKNOWN_DATASPACE or DATASPACE_READ_FAILED.
 * @throws {CrossSpaceError} CROSS_DATASPACE_RULESETS_READ_FAILED.
 */
export async function crossSpaceContext(
  connection: LookupConnection,
  options: { from: string; to: string; names?: readonly string[] },
): Promise<CrossSpaceContext> {
  const sender = openBoundSsot('', '68.0', async () => connection);
  const open = async (): Promise<typeof sender> => sender;
  // The context names each space and its prefix only, as the rename rules read them.
  const entries = await readOrgDataSpaceEntries(open);
  const spaces = entries.map(({ name, prefix }) =>
    prefix === undefined ? { name } : { name, prefix },
  );
  const known = spaces.map((space) => space.name);
  const unknown = sortedDataSpaces([options.from, options.to].filter((s) => !known.includes(s)));
  if (unknown.length > 0)
    throw explainInput(
      new DataSpaceError('UNKNOWN_DATASPACE'),
      `The org has no data space named ${[...new Set(unknown)].map((space) => printableKey(space)).join(', ')}; its data spaces are ${sortedDataSpaces(
        known,
      )
        .map((space) => printableKey(space))
        .join(', ')}.`,
    );
  const context: CrossSpaceContext = { source: options.from, target: options.to, spaces };
  const needsRulesets =
    options.names === undefined || options.names.some((name) => pairedByRulesets(context, name));
  return needsRulesets ? { ...context, rulesets: await readRulesetEntries(open) } : context;
}
