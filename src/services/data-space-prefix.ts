import { nativeDmoWriteScope, unwrapNativeDmo } from '../artifacts/native-dmo-document.js';
import type { OrgDataSpace } from './data-space-check.js';
import { explainInput } from './operation-diagnostic.js';

/**
 * The four kinds of component whose names are unique in the whole org, whatever their data
 * space: custom DMOs, calculated insights, data transforms and data graphs.
 */
export type PrefixType = 'dmo' | 'calculated-insight' | 'data-transform' | 'data-graph';

/** The code of a prefix mismatch, per type: an error on create, a warning on retrieve and update. */
export const prefixMismatchCodes: Readonly<Record<PrefixType, string>> = {
  dmo: 'DMO_PREFIX_MISMATCH',
  'calculated-insight': 'CI_PREFIX_MISMATCH',
  'data-transform': 'TRANSFORM_PREFIX_MISMATCH',
  'data-graph': 'DATA_GRAPH_PREFIX_MISMATCH',
};

const labels: Readonly<Record<PrefixType, string>> = {
  dmo: 'DMO',
  'calculated-insight': 'Calculated insight',
  'data-transform': 'Data transform',
  'data-graph': 'Data graph',
};

/** A name that does not carry the prefix its data space asks for. */
export type PrefixMismatch = {
  code: string;
  type: PrefixType;
  name: string;
  space: string;
  /** The prefix the name must start with (`missing`) or must not start with (`foreign`). */
  prefix: string;
  /** `missing`: a non-default space's name without its prefix; `foreign`: a name in default with another space's prefix. */
  reason: 'missing' | 'foreign';
  /** The data space whose prefix a `foreign` name carries. */
  owner?: string;
  /** The name that follows the rule. */
  suggestion: string;
};

/**
 * Check a name against the prefix rule of its data space. In a non-default data space the name
 * must start with that space's own prefix and an underscore (`ds2_Order__dlm`); in `default` it
 * must not start with the prefix of any other data space. Spaces without a prefix in the org's
 * list are never checked, so an org with only `default` never has a mismatch.
 * @param {string} name The component's name (a DMO or insight with its suffix).
 * @param {PrefixType} type Kind of component.
 * @param {string} space Its data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces, as the one space list read names them.
 * @returns {PrefixMismatch | undefined} The mismatch, or undefined when the name follows the rule.
 */
export function prefixMismatch(
  name: string,
  type: PrefixType,
  space: string,
  spaces: readonly OrgDataSpace[],
): PrefixMismatch | undefined {
  const others = spaces.filter(
    (entry) => entry.name !== space && entry.name !== 'default' && entry.prefix !== undefined,
  );
  const carried = others.find((entry) => name.startsWith(`${entry.prefix}_`));
  const base = { code: prefixMismatchCodes[type], type, name, space };
  if (space === 'default') {
    if (!carried) return undefined;
    return {
      ...base,
      prefix: carried.prefix!,
      reason: 'foreign',
      owner: carried.name,
      suggestion: name.slice(carried.prefix!.length + 1),
    };
  }
  const own = spaces.find((entry) => entry.name === space)?.prefix;
  if (own === undefined || name.startsWith(`${own}_`)) return undefined;
  return {
    ...base,
    prefix: own,
    reason: 'missing',
    suggestion: `${own}_${carried ? name.slice(carried.prefix!.length + 1) : name}`,
  };
}

/**
 * Whether the prefix rule covers a name before any read: every graph, insight and transform, and
 * every DMO but a namespaced or standard one (`ns__X__dlm`, `ssot__X__dlm`).
 * @param {PrefixType} type Kind of component.
 * @param {string} name The component's name.
 * @returns {boolean} Whether its name is checked.
 */
export function prefixRuleCoversName(type: PrefixType, name: string): boolean {
  return type !== 'dmo' || !name.slice(0, -'__dlm'.length).includes('__');
}

/**
 * Whether the prefix rule covers a component as the org read it: only what users make
 * themselves. A DMO with creationType Custom and no namespace; an insight or transform with
 * creationType Custom (any letter case); every graph. Standard DMOs and their copies, generated
 * objects (`Dg_` transforms, Adg and other generated DMOs) and packaged ones are left out.
 * @param {PrefixType} type Kind of component.
 * @param {unknown} native The raw read.
 * @returns {boolean} Whether the read component is checked.
 */
export function prefixRuleCoversRead(type: PrefixType, native: unknown): boolean {
  if (type === 'data-graph') return true;
  if (!native || typeof native !== 'object' || Array.isArray(native)) return false;
  if (type === 'dmo') {
    try {
      return nativeDmoWriteScope(unwrapNativeDmo(native)) === 'custom';
    } catch {
      return false;
    }
  }
  const { creationType } = native as { creationType?: unknown };
  return typeof creationType === 'string' && creationType.toLowerCase() === 'custom';
}

/**
 * The sentence that explains a mismatch.
 * @param {PrefixMismatch} mismatch The mismatch.
 * @param {'create' | 'existing'} stage A new component (refused) or one that exists (warned).
 * @returns {string} Explanation.
 */
export function prefixMismatchMessage(
  mismatch: PrefixMismatch,
  stage: 'create' | 'existing',
): string {
  const { type, name, space, prefix, owner, suggestion } = mismatch;
  const subject = `${labels[type]} ${name} ${stage === 'create' ? 'is new in' : 'is in'} the data space ${space}`;
  const problem =
    mismatch.reason === 'missing'
      ? `its name does not start with ${prefix}_, the prefix of that data space`
      : `its name starts with ${prefix}_, the prefix of the data space ${owner}`;
  return stage === 'create'
    ? `${subject}, but ${problem}. Name it ${suggestion} in the file and its file name, then rerun.`
    : `${subject}, but ${problem}. Names of this kind are unique in the org; ${suggestion} would follow the rule. The plugin does not rename it.`;
}

/** Refusal of a new component whose name breaks the prefix rule. */
export class DataSpacePrefixError extends Error {
  public constructor(public readonly code: string) {
    super(`Data space prefix check refused: ${code}.`);
    this.name = 'DataSpacePrefixError';
  }
}

/**
 * The refusal of a new component whose name breaks the prefix rule.
 * @param {PrefixMismatch} mismatch The mismatch.
 * @returns {DataSpacePrefixError} Refusal with its explanation.
 */
export function prefixMismatchError(mismatch: PrefixMismatch): DataSpacePrefixError {
  return explainInput(
    new DataSpacePrefixError(mismatch.code),
    prefixMismatchMessage(mismatch, 'create'),
  );
}

/**
 * The warning for a component that exists (retrieve, deploy update) and breaks the prefix rule.
 * @param {PrefixMismatch} mismatch The mismatch.
 * @returns {string} Warning text, starting with its code.
 */
export function prefixMismatchWarning(mismatch: PrefixMismatch): string {
  return `${mismatch.code}: ${prefixMismatchMessage(mismatch, 'existing')}`;
}
