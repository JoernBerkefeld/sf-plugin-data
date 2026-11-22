import type { OrgDataSpace } from './data-space-check.js';
import { unescapeSalesforceHtml } from '../artifacts/native-calculated-insight-document.js';
import type { ExpressionNamer, OutputField, SqlNamer } from './cross-dataspace-sql.js';
import {
  htmlEntityOutsideTexts,
  translateSql,
  translateSqlExpression,
} from './cross-dataspace-sql.js';

/**
 * The rename rules of a cross-data-space deploy. Each one is a fixed spelling rule Salesforce
 * follows between data spaces (live API 68, DB entries data360:dataspace-*-api68); nothing is
 * read from the org beyond the one data space list a command reads anyway.
 * - `data-space`: the file's `c__dataSpace` becomes the run's data space.
 * - `dlo-membership`: the run's data space is added to a DLO's `c__dataSpace` list; nothing is renamed.
 * - `dmo-prefix`: a DMO name gets, loses or swaps its data space prefix (`Order__dlm` ↔ `ds2_Order__dlm`).
 * - `standard-copy`: a standard DMO and its copy (`ssot__Individual__dlm` ↔ `ds2_Individual__dlm`).
 * - `unified-output`: an identity resolution output (`UnifiedssotIndividual<Id>__dlm` ↔ `ds2_UnifiedIndividual<Id>__dlm`).
 * - `field-ssot`: a field of a standard DMO copy or unified output (`ssot__FirstName__c` ↔ `FirstName__c`).
 * - `segment-prefix`: a segment name gets, loses or swaps its data space prefix.
 * - `name-prefix`: a data graph, data transform or ruleset name gets, loses or swaps its data space prefix.
 * - `ruleset-read`: an identity resolution output named by the target data space's ruleset of the
 *   same type, from the one ruleset list read (its ruleset is not in this deploy). This also places
 *   the outputs of the oldest `default` ruleset, which carry no suffix (`UnifiedIndividual__dlm`).
 * - `generated`: a name Salesforce generates for one graph: its helper DMOs, transform and join and
 *   field names are left out (Salesforce generates new ones); a node developer name is rebuilt as
 *   Salesforce builds it, `<graph>_<object without __dlm>`.
 */
export type CrossSpaceRule =
  | 'data-space'
  | 'dlo-membership'
  | 'dmo-prefix'
  | 'standard-copy'
  | 'unified-output'
  | 'field-ssot'
  | 'segment-prefix'
  | 'name-prefix'
  | 'ruleset-read'
  | 'generated';

/** One value the translation changes: where in the file, from what, to what, by which rule. */
export type CrossSpaceRewrite = { at: string; from: string; to: string; rule: CrossSpaceRule };

/** A name the translation cannot place exactly; the file is refused before any write. */
export type CrossSpaceUnresolved = { at: string; name: string; reason: string };

/** The file translated into the run's data space, with every change and every unplaced name. */
export type CrossSpaceTranslation = {
  document: Record<string, unknown>;
  rewrites: CrossSpaceRewrite[];
  unresolved: CrossSpaceUnresolved[];
};

/** A file of a kind the translation does not cover yet. */
export type CrossSpaceUnsupported = { unsupported: string };

/** From which data space to which one, with the org's prefixes. */
export type CrossSpaceContext = {
  source: string;
  target: string;
  spaces: readonly OrgDataSpace[];
  /**
   * DMOs of a non-default source space that a selected DMO file shows to be custom (a field with
   * creationType Custom and none with Standard). Only these can be placed in `default`, where a
   * standard copy and a custom DMO of the same name would need different names.
   */
  customDmos?: ReadonlySet<string>;
  /**
   * The org's identity resolution rulesets as the one list read names them. When given, an
   * identity resolution output whose ruleset is not in this deploy is named by the target data
   * space's ruleset of the same type; without it the output is placed by rule.
   */
  rulesets?: readonly RulesetEntry[];
  /** The rulesets (source names) this deploy translates too: their outputs keep the rule. */
  selectedRulesets?: ReadonlySet<string>;
};

/** One identity resolution ruleset of the org, as the ruleset list names it. */
export type RulesetEntry = {
  apiName: string;
  dataSpace: string;
  configurationType: string;
  /** Per reconciliation entity: its unified and link output DMOs. */
  outputs: ReadonlyArray<{ entity: string; unified?: string; link?: string }>;
};

/** What kind of DMO a name is, as far as the fields rule needs to know. */
export type DmoKind = 'standard' | 'unified' | 'custom' | 'prefixed';

/** A name placed in the target data space, with the rule that placed it. */
export type Placed = { name: string; rule?: CrossSpaceRule; kind: DmoKind };
/** Why a name cannot be placed. */
export type NotPlaced = { reason: string };

const dmoSuffix = '__dlm';
// Link fields named the same in every data space (live API 68, entry data360:dataspace2-graph-and-unified-fields-api68).
const unifiedFieldsWithoutSsot = new Set(['UnifiedRecordId__c', 'SourceRecordId__c']);
const nameValue = /^[A-Za-z][A-Za-z0-9_]*__(?:c|dlm)$/u;
// A field named with the qualifier of a join side (`R.FirstName__c`).
const qualifiedField = /^([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*__c)$/u;

/**
 * The prefix of a data space, or a reason when a non-default one has none in the org's list.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} space Data space name.
 * @returns {string | undefined | NotPlaced} Prefix; undefined for default.
 */
function prefixOf(context: CrossSpaceContext, space: string): string | undefined | NotPlaced {
  if (space === 'default') return undefined;
  const prefix = context.spaces.find((entry) => entry.name === space)?.prefix;
  return prefix ?? { reason: `the org's data space list names no prefix for ${space}` };
}

/**
 * Both prefixes, or the reason one is missing.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {{source?: string; target?: string} | NotPlaced} Prefixes.
 */
function prefixes(context: CrossSpaceContext): { source?: string; target?: string } | NotPlaced {
  const source = prefixOf(context, context.source);
  if (typeof source === 'object') return source;
  const target = prefixOf(context, context.target);
  if (typeof target === 'object') return target;
  return { source, target };
}

/**
 * The data space whose prefix a name already carries, other than the allowed one.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Name to check.
 * @param {string} [own] The prefix the name may carry.
 * @returns {string | undefined} The owning data space.
 */
function foreignPrefix(context: CrossSpaceContext, name: string, own?: string): string | undefined {
  return context.spaces.find(
    (entry) =>
      entry.prefix !== undefined && entry.prefix !== own && name.startsWith(`${entry.prefix}_`),
  )?.name;
}

/**
 * Place a DMO name of the source data space in the target data space by rule. Never guesses: a
 * namespaced DMO, an identity resolution output without the `ssot` spelling (such as
 * `UnifiedIndividual__dlm`; only the ruleset list pairs it, see pairedByRulesets), and a
 * `<prefix>_<Name>__dlm` name towards `default` that no selected custom DMO file explains are not placed.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule, or why it cannot be placed.
 */
export function translateDmoName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  if (!name.endsWith(dmoSuffix) || name.length === dmoSuffix.length)
    return { reason: 'it is not a DMO name' };
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  const base = name.slice(0, -dmoSuffix.length);
  const toTarget = (rest: string): string =>
    target === undefined ? `${rest}${dmoSuffix}` : `${target}_${rest}${dmoSuffix}`;
  if (source === undefined) {
    // default -> another data space.
    const unifiedLink = /^UnifiedLinkssot(.+)$/u.exec(base);
    if (unifiedLink)
      return {
        name: toTarget(`UnifiedLink${unifiedLink[1]}`),
        rule: 'unified-output',
        kind: 'unified',
      };
    const unified = /^Unifiedssot(.+)$/u.exec(base);
    if (unified)
      return { name: toTarget(`Unified${unified[1]}`), rule: 'unified-output', kind: 'unified' };
    if (base.startsWith('ssot__')) {
      const rest = base.slice('ssot__'.length);
      if (!rest || rest.includes('__')) return { reason: 'no rule places this standard DMO name' };
      return { name: toTarget(rest), rule: 'standard-copy', kind: 'standard' };
    }
    if (base.includes('__')) return { reason: 'it is a packaged (namespaced) DMO' };
    if (/^Unified[A-Z]/u.test(base) || base.endsWith('IdentityLink'))
      return {
        reason:
          'it looks like an identity resolution output without the ssot spelling (the oldest ruleset of default); no rule names it in another data space, only the ruleset list pairs it',
      };
    const owner = foreignPrefix(context, base);
    if (owner !== undefined)
      return { reason: `its name already carries the prefix of the data space ${owner}` };
    return { name: toTarget(base), rule: 'dmo-prefix', kind: 'custom' };
  }
  if (base.includes('__') && !base.startsWith(`${source}_`))
    return { reason: 'it is a packaged (namespaced) DMO' };
  if (!base.startsWith(`${source}_`)) {
    // A custom DMO created without the prefix keeps its plain name in its data space.
    const owner = foreignPrefix(context, base);
    if (owner !== undefined)
      return { reason: `its name carries the prefix of the data space ${owner}` };
    return { name: toTarget(base), rule: 'dmo-prefix', kind: 'custom' };
  }
  const rest = base.slice(source.length + 1);
  if (!rest || rest.includes('__')) return { reason: 'no rule places this DMO name' };
  // A custom DMO file selected beside it is the evidence, also for a custom ds2_Unified… name.
  if (target === undefined && context.customDmos?.has(name))
    return { name: toTarget(rest), rule: 'dmo-prefix', kind: 'custom' };
  if (rest.startsWith('UnifiedLink') || rest.startsWith('Unified')) {
    const link = rest.startsWith('UnifiedLink');
    const entity = rest.slice((link ? 'UnifiedLink' : 'Unified').length);
    if (!entity) return { reason: 'no rule places this DMO name' };
    return {
      name:
        target === undefined
          ? `${link ? 'UnifiedLinkssot' : 'Unifiedssot'}${entity}${dmoSuffix}`
          : toTarget(rest),
      rule: 'unified-output',
      kind: 'unified',
    };
  }
  if (target !== undefined) return { name: toTarget(rest), rule: 'dmo-prefix', kind: 'prefixed' };
  return {
    reason: `in default it is either the standard DMO ssot__${rest}__dlm or ${rest}__dlm, or a custom DMO ${rest}__dlm; select its DMO file (a custom DMO's fields show creationType Custom), or deploy it into another data space`,
  };
}

/**
 * Place a field of a DMO by the `ssot__` rule. Key qualifier fields (`KQ_`) keep their names.
 * Towards another data space a standard copy or unified output drops `ssot__`; towards `default`
 * a unified output gets it back, except its link fields; custom DMOs keep every field name.
 * @param {CrossSpaceContext} context Translation context.
 * @param {DmoKind} kind What kind of DMO the field belongs to.
 * @param {string} field Field name in the source data space.
 * @returns {{name: string; rule?: CrossSpaceRule}} Target field name and rule.
 */
export function translateFieldName(
  context: CrossSpaceContext,
  kind: DmoKind,
  field: string,
): { name: string; rule?: CrossSpaceRule } {
  if (field.startsWith('KQ_')) return { name: field };
  if (context.source === 'default') {
    return field.startsWith('ssot__')
      ? { name: field.slice('ssot__'.length), rule: 'field-ssot' }
      : { name: field };
  }
  // A field already spelled with ssot__ is the default spelling (a mis-spelled file): kept.
  if (
    context.target === 'default' &&
    kind === 'unified' &&
    !field.startsWith('ssot__') &&
    !unifiedFieldsWithoutSsot.has(field)
  )
    return { name: `ssot__${field}`, rule: 'field-ssot' };
  return { name: field };
}

/**
 * Place a segment name: Salesforce stores a segment of a non-default data space as
 * `<prefix>_<Name>`, and one of `default` without any prefix.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Segment name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule.
 */
export function translateSegmentName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  let base = name;
  if (source === undefined) {
    const owner = foreignPrefix(context, name);
    if (owner !== undefined)
      return { reason: `its name already carries the prefix of the data space ${owner}` };
  } else {
    if (!name.startsWith(`${source}_`))
      return { reason: `a segment of ${context.source} is stored as ${source}_<Name>` };
    base = name.slice(source.length + 1);
  }
  return {
    name: target === undefined ? base : `${target}_${base}`,
    rule: 'segment-prefix',
    kind: 'custom',
  };
}

/**
 * Place the name of a data graph or data transform by the prefix rule (Step 1): in a non-default
 * data space it carries that space's prefix, in `default` none. A name of a non-default source
 * created without its prefix keeps its base; a name with another data space's prefix is not placed.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule.
 */
export function translateUniqueName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  const base =
    source !== undefined && name.startsWith(`${source}_`) ? name.slice(source.length + 1) : name;
  if (!base) return { reason: 'no rule places this name' };
  const owner = foreignPrefix(context, base);
  if (owner !== undefined)
    return { reason: `its name carries the prefix of the data space ${owner}` };
  return {
    name: target === undefined ? base : `${target}_${base}`,
    rule: 'name-prefix',
    kind: 'custom',
  };
}

/**
 * Place an identity resolution ruleset name: Salesforce names a ruleset `<type>_<rulesetId>` in
 * `default` and `<prefix>_<type>_<rulesetId>` elsewhere (live API 68); the ruleset ID is kept.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Ruleset name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule.
 */
export function translateRulesetName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  let base = name;
  if (source === undefined) {
    const owner = foreignPrefix(context, name);
    if (owner !== undefined)
      return { reason: `its name already carries the prefix of the data space ${owner}` };
  } else {
    if (!name.startsWith(`${source}_`))
      return { reason: `a ruleset of ${context.source} is named ${source}_<type>_<rulesetId>` };
    base = name.slice(source.length + 1);
  }
  return {
    name: target === undefined ? base : `${target}_${base}`,
    rule: 'name-prefix',
    kind: 'custom',
  };
}

/**
 * Name an identity resolution output in the target data space from the ruleset list: the source
 * ruleset that lists the output, then the one ruleset of the same type in the target data space
 * and its output for the same entity. An output of a ruleset this deploy translates too keeps its
 * rule name (the ruleset ID is kept); an output without a rule name (the oldest `default`
 * ruleset's, no suffix) is then not placed. None or several rulesets are not placed, with their names.
 * @param {CrossSpaceContext} context Translation context with the ruleset list.
 * @param {string} name Output DMO name in the source data space.
 * @param {Placed} [byRule] The name the rule gives it; none for an output without the `ssot` spelling.
 * @returns {Placed | NotPlaced} Target name, or why it cannot be placed.
 */
function pairUnifiedOutput(
  context: CrossSpaceContext,
  name: string,
  byRule?: Placed,
): Placed | NotPlaced {
  const rulesets = context.rulesets ?? [];
  const hits = rulesets.flatMap((ruleset) =>
    ruleset.dataSpace === context.source
      ? ruleset.outputs
          .filter((output) => output.unified === name || output.link === name)
          .map((output) => ({ ruleset, output, link: output.link === name }))
      : [],
  );
  if (hits.length === 0)
    return {
      reason: `no identity resolution ruleset of ${context.source} lists it as an output`,
    };
  if (hits.length > 1)
    return {
      reason: `the rulesets ${hits.map((hit) => hit.ruleset.apiName).join(', ')} of ${context.source} all list it`,
    };
  const [{ ruleset, output, link }] = hits;
  if (context.selectedRulesets?.has(ruleset.apiName))
    return (
      byRule ?? {
        reason: `it is an output of the ruleset ${ruleset.apiName}, which is in this deploy too; an output without a suffix (the oldest ruleset of ${context.source}) has no rule name in ${context.target}, so deploy the ruleset first and then the files that use its outputs`,
      }
    );
  const entity = translateDmoName(context, output.entity);
  if ('reason' in entity)
    return { reason: `its entity ${output.entity} cannot be placed: ${entity.reason}` };
  const type = ruleset.configurationType.toLowerCase();
  const targets = rulesets.filter(
    (entry) => entry.dataSpace === context.target && entry.configurationType.toLowerCase() === type,
  );
  if (targets.length !== 1)
    return {
      reason:
        targets.length === 0
          ? `it is an output of the ruleset ${ruleset.apiName}, and ${context.target} has no ruleset of the type ${ruleset.configurationType}; deploy that ruleset with this deploy, or create one in ${context.target}`
          : `it is an output of the ruleset ${ruleset.apiName}, and ${context.target} has several rulesets of the type ${ruleset.configurationType} (${targets.map((entry) => entry.apiName).join(', ')}); deploy that ruleset with this deploy to pick it`,
    };
  const counterpart = targets[0].outputs.find((entry) => entry.entity === entity.name);
  const paired = link ? counterpart?.link : counterpart?.unified;
  if (paired === undefined)
    return {
      reason: `the ruleset ${targets[0].apiName} of ${context.target} names no ${link ? 'link' : 'unified'} output for ${entity.name}`,
    };
  return { name: paired, rule: 'ruleset-read', kind: 'unified' };
}

/**
 * Whether a DMO name of `default` is an identity resolution output without the `ssot` spelling:
 * the oldest ruleset's outputs carry no suffix (`UnifiedIndividual__dlm`,
 * `IndividualIdentityLink__dlm`). No rule names them elsewhere; only the ruleset list pairs them.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name.
 * @returns {boolean} Whether it is such an output.
 */
function unsuffixedOutput(context: CrossSpaceContext, name: string): boolean {
  if (context.source !== 'default' || !name.endsWith(dmoSuffix)) return false;
  const base = name.slice(0, -dmoSuffix.length);
  return (
    !base.includes('__') &&
    !/^Unified(?:Link)?ssot/u.test(base) &&
    (/^Unified[A-Z]/u.test(base) || base.endsWith('IdentityLink'))
  );
}

/**
 * Whether a DMO name is placed from the org's ruleset list: an identity resolution output by
 * rule, or one of the oldest `default` ruleset without the `ssot` spelling.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name in the source data space.
 * @returns {boolean} Whether the ruleset list is needed for it.
 */
export function pairedByRulesets(context: CrossSpaceContext, name: string): boolean {
  const placed = translateDmoName(context, name);
  return 'reason' in placed ? unsuffixedOutput(context, name) : placed.rule === 'unified-output';
}

/**
 * Place a DMO name as the rules and, when it was read, the ruleset list place it: an identity
 * resolution output of a ruleset outside this deploy is paired from the ruleset list.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule, or why it cannot be placed.
 */
export function placeDmo(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const placed = translateDmoName(context, name);
  if (!context.rulesets) return placed;
  if (!('reason' in placed) && placed.rule === 'unified-output')
    return pairUnifiedOutput(context, name, placed);
  if ('reason' in placed && unsuffixedOutput(context, name))
    return pairUnifiedOutput(context, name);
  return placed;
}

/** Collects the rewrites and unplaced names of one file. */
class Recorder {
  public readonly rewrites: CrossSpaceRewrite[] = [];
  public readonly unresolved: CrossSpaceUnresolved[] = [];
  /** Every JSON path the translation looked at, changed or kept on purpose. */
  public readonly visited = new Set<string>();
  /** SQL texts, checked token by token by their own translation (not by the full-coverage check). */
  public readonly ownCheck = new Set<string>();

  public constructor(private readonly context: CrossSpaceContext) {}

  /**
   * Mark a value as looked at and kept as it is.
   * @param {string} at JSON path.
   */
  public keep(at: string): void {
    this.visited.add(at);
  }

  /**
   * Mark every value below a path as looked at and kept (compared values are data).
   * @param {unknown} value Value.
   * @param {string} at Its JSON path.
   */
  public keepAll(value: unknown, at: string): void {
    this.visited.add(at);
    if (Array.isArray(value))
      for (const [index, entry] of value.entries()) this.keepAll(entry, `${at}[${index}]`);
    else if (value && typeof value === 'object')
      for (const [key, entry] of Object.entries(value)) this.keepAll(entry, `${at}.${key}`);
  }

  /**
   * Record a name the translation leaves out (generated for one instance).
   * @param {Record<string, unknown>} node Object holding the key, changed in place.
   * @param {string} key Key to remove.
   * @param {string} at JSON path of the key.
   */
  public leaveOut(node: Record<string, unknown>, key: string, at: string): void {
    if (!Object.hasOwn(node, key)) return;
    const value = node[key];
    delete node[key];
    if (typeof value === 'string' && value)
      this.rewrites.push({ at, from: value, to: '(left out)', rule: 'generated' });
  }

  /**
   * Place a name by a rule function, recording the rewrite or the unplaced name.
   * @param {string} at JSON path.
   * @param {string} name Source name.
   * @param {(context: CrossSpaceContext, name: string) => Placed | NotPlaced} rule Rule.
   * @returns {string} Target name (the source name when it is not placed).
   */
  public named(
    at: string,
    name: string,
    rule: (context: CrossSpaceContext, name: string) => Placed | NotPlaced,
  ): string {
    const placed = rule(this.context, name);
    if ('reason' in placed) {
      this.visited.add(at);
      this.unresolved.push({ at, name, reason: placed.reason });
      return name;
    }
    return this.change(at, name, placed.name, placed.rule);
  }

  /**
   * Record a value change.
   * @param {string} at JSON path.
   * @param {string} from Old value.
   * @param {string} to New value.
   * @param {CrossSpaceRule} [rule] Rule; none means unchanged.
   * @returns {string} The new value.
   */
  public change(at: string, from: string, to: string, rule?: CrossSpaceRule): string {
    this.visited.add(at);
    if (rule !== undefined && from !== to) this.rewrites.push({ at, from, to, rule });
    return to;
  }

  /**
   * Place a DMO name, recording the rewrite or the unplaced name.
   * @param {string} at JSON path.
   * @param {string} name Source name.
   * @returns {Placed | undefined} Placement, or undefined when not placed.
   */
  public dmo(at: string, name: string): Placed | undefined {
    const placed = placeDmo(this.context, name);
    this.visited.add(at);
    if ('reason' in placed) {
      this.unresolved.push({ at, name, reason: placed.reason });
      return undefined;
    }
    this.change(at, name, placed.name, placed.rule);
    return placed;
  }

  /**
   * Place a field name of a placed DMO.
   * @param {string} at JSON path.
   * @param {Placed | undefined} owner The placed DMO, or undefined when it was not placed.
   * @param {string} field Source field name.
   * @returns {string} Target field name (the source name when its DMO was not placed).
   */
  public field(at: string, owner: Placed | undefined, field: string): string {
    this.visited.add(at);
    if (!owner) return field;
    const placed = translateFieldName(this.context, owner.kind, field);
    return this.change(at, field, placed.name, placed.rule);
  }

  /**
   * Rewrite one SQL text by the rules (see translateSql), recording every change and every name
   * it cannot place with its file, line and column.
   * @param {string} at JSON path of the SQL.
   * @param {string} sql SQL text.
   * @param {string} file The SQL file it is read from, as positions are reported.
   * @param {string} item What the SQL belongs to, as a refusal names it (`data transform`).
   * @param {ReadonlyMap<string, {name: string; rule?: CrossSpaceRule}>} [outputs] When the columns
   * the SQL puts out land in the fields of its output object by name (a DCSQL node): each field of
   * that object (source name, lowercase) with its target name and rule. Each output column is then
   * checked against its field (see translateSql), and `*` over a table that is not a DLO is not
   * placed. For an object whose fields are not listed (an intermediate model's relation), the
   * field of each name by the object's rule and whether those fields can change.
   * @returns {string} The rewritten SQL.
   */
  public sql(
    at: string,
    sql: string,
    file: string,
    item: string,
    outputs?:
      | ReadonlyMap<string, { name: string; rule?: CrossSpaceRule }>
      | { field: OutputField; fieldsChange: boolean },
  ): string {
    this.visited.add(at);
    this.ownCheck.add(at);
    const listed = outputs instanceof Map ? outputs : undefined;
    const outputField: OutputField | undefined = listed
      ? (name): ReturnType<OutputField> => listed.get(name.toLowerCase())
      : outputs && 'field' in outputs
        ? outputs.field
        : undefined;
    const result = translateSql(sql, file, sqlNamer(this.context), outputField, item);
    this.rewrites.push(...result.rewrites);
    this.unresolved.push(...result.unresolved);
    if (outputs && result.outputs) {
      const fieldsChange = listed
        ? [...listed].some(([source, field]) => field.name.toLowerCase() !== source)
        : 'fieldsChange' in outputs && outputs.fieldsChange;
      for (const star of result.outputs.stars)
        if (!star.dlo || fieldsChange)
          this.unresolved.push({
            at: star.at,
            name: star.name,
            reason: star.dlo
              ? "this * puts out the columns of a DLO, which keep their names while the output object's fields change in the target data space; list the columns with AS and the output field name"
              : 'this * puts out the columns of a table that is not a DLO, whose names can change in the target data space while the output object keeps its fields; list the columns, each with AS and the output field name',
          });
    }
    return result.sql;
  }

  /**
   * Rewrite one SQL expression of an STL node (a formula, a SQL filter) by the node's lineage. A
   * value as an older retrieve wrote it, HTML-escaped as the GET returns it (`&quot;`, `&#39;`:
   * an entity outside texts), is read unescaped; a value that mixes both forms is not placed. The
   * result is always written plain: Salesforce stores what it is sent and never decodes entities.
   * Line and column positions refer to the unescaped expression.
   * @param {string} at JSON path of the expression.
   * @param {string} text Expression as the file holds it.
   * @param {Lineage} lineage Whose columns the node reads without a qualifier.
   * @param {ReadonlyMap<string, Lineage>} [qualifiers] The qualifiers of the join above the node.
   * @returns {string} The rewritten expression, plain.
   */
  public expression(
    at: string,
    text: string,
    lineage: Lineage,
    qualifiers?: ReadonlyMap<string, Lineage>,
  ): string {
    this.visited.add(at);
    const escaped = htmlEntityOutsideTexts(text) !== undefined;
    const plain = escaped ? unescapeSalesforceHtml(text) : text;
    if (escaped && escapeSalesforceHtml(plain) !== text) {
      this.unresolved.push({
        at,
        name: text,
        reason:
          'the expression mixes HTML-escaped and plain characters, so it cannot be decoded exactly; write it plain',
      });
      return text;
    }
    const base = sqlNamer(this.context);
    const namer: ExpressionNamer = {
      leftover: base.leftover,
      spelling: base.spelling,
      column: (field, qualifier) => {
        if (qualifier === undefined) return this.placeLineage(lineage, field);
        if (qualifiers?.has(qualifier)) return this.placeLineage(qualifiers.get(qualifier), field);
        return {
          reason: `the qualifier ${qualifier} names no side of the join this expression reads from, so the object of its field is not known and its spelling cannot be placed`,
        };
      },
    };
    const result = translateSqlExpression(plain, at, namer);
    this.rewrites.push(...result.rewrites);
    this.unresolved.push(...result.unresolved);
    return result.sql;
  }

  /**
   * Place a segment name.
   * @param {string} at JSON path.
   * @param {string} name Source name.
   * @returns {string} Target name (the source name when it is not placed).
   */
  public segment(at: string, name: string): string {
    return this.named(at, name, translateSegmentName);
  }

  /**
   * Place a field whose DMO may be unknown (a transform node after a join): towards another data
   * space every field drops `ssot__` whatever its DMO; otherwise the field must keep its name in
   * this direction whatever its DMO, or it is not placed.
   * A qualified field (`R.FirstName__c`, the qualifier of a join side) keeps its qualifier.
   * @param {string} at JSON path.
   * @param {Placed | 'dlo' | undefined} owner The placed DMO, `dlo` for a DLO, or undefined when unknown.
   * @param {string} field Source field name (without the qualifier).
   * @param {string} [qualifier] The join side qualifier written before the field.
   * @returns {string} Target value.
   */
  public lineageField(
    at: string,
    owner: Placed | 'dlo' | undefined,
    field: string,
    qualifier?: string,
  ): string {
    const placed = this.placeLineage(owner, field);
    const whole = qualifier === undefined ? field : `${qualifier}.${field}`;
    if ('reason' in placed) {
      this.visited.add(at);
      this.unresolved.push({ at, name: whole, reason: placed.reason });
      return whole;
    }
    return this.change(
      at,
      whole,
      qualifier === undefined ? placed.name : `${qualifier}.${placed.name}`,
      placed.rule,
    );
  }

  /**
   * The target spelling of a field by its lineage, without recording it.
   * @param {Placed | 'dlo' | undefined} owner The placed DMO, `dlo` for a DLO, or undefined when unknown.
   * @param {string} field Source field name.
   * @returns {{name: string; rule?: CrossSpaceRule} | NotPlaced} Target field name, or why not.
   */
  public placeLineage(
    owner: Placed | 'dlo' | undefined,
    field: string,
  ): { name: string; rule?: CrossSpaceRule } | NotPlaced {
    if (owner === 'dlo') return { name: field };
    if (owner) return translateFieldName(this.context, owner.kind, field);
    if (this.context.source === 'default') return translateFieldName(this.context, 'custom', field);
    if (!fieldNeverChanges(this.context, field))
      return {
        reason:
          'the object this field belongs to is not known here, so its spelling cannot be placed',
      };
    return { name: field };
  }
}

/**
 * HTML-escape a text the way Connect REST returns every string without the plain-text request
 * header (`&quot;`, `&#39;`, `&#92;`), as older plugin versions wrote STL expressions into files.
 * @param {string} text Plain text.
 * @returns {string} Escaped text.
 */
function escapeSalesforceHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\\', '&#92;');
}

/**
 * Whether a field name keeps its spelling for every kind of DMO in this direction, so it can be
 * placed without knowing its DMO.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} field Field name.
 * @returns {boolean} Whether it never changes.
 */
function fieldNeverChanges(context: CrossSpaceContext, field: string): boolean {
  if (field.startsWith('KQ_')) return true;
  if (context.source === 'default') return !field.startsWith('ssot__');
  return context.target !== 'default';
}

/**
 * Translate segment criteria: every `objectApiName` by the DMO rule and every `fieldApiName` by
 * the field rule of the DMO named beside it (or above it). Any other DMO or field name in the
 * criteria is placed the same way; a field name without a DMO to place it by is not placed,
 * unless it keeps its name in this direction whatever its DMO. Compared values (`values`,
 * `value`) are data and stay as they are.
 * @param {unknown} value Criteria node.
 * @param {string} at JSON path of the node.
 * @param {Placed | undefined} owner The nearest DMO above, placed.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {unknown} Translated node.
 */
function translateCriteria(
  value: unknown,
  at: string,
  owner: Placed | undefined,
  recorder: Recorder,
  context: CrossSpaceContext,
): unknown {
  if (Array.isArray(value))
    return value.map((entry, index) =>
      translateCriteria(entry, `${at}[${index}]`, owner, recorder, context),
    );
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string' || !nameValue.test(value)) return value;
    if (value.endsWith(dmoSuffix)) return recorder.dmo(at, value)?.name ?? value;
    if (owner) return recorder.field(at, owner, value);
    if (!fieldNeverChanges(context, value))
      recorder.unresolved.push({
        at,
        name: value,
        reason: 'no DMO is named beside or above this field, so its spelling cannot be placed',
      });
    return value;
  }
  const node = value as Record<string, unknown>;
  const object = node.objectApiName;
  let here = owner;
  const result: Record<string, unknown> = {};
  if (typeof object === 'string') {
    const placed = recorder.dmo(`${at}.objectApiName`, object);
    here = placed;
    // A DMO that could not be placed: its fields are not placed either (already refused).
    if (!placed) here = undefined;
  }
  for (const [key, child] of Object.entries(node)) {
    const path = `${at}.${key}`;
    if (key === 'objectApiName' && typeof child === 'string') {
      result[key] = here?.name ?? child;
      continue;
    }
    // Compared values are data, not names.
    if (key === 'values' || key === 'value') {
      recorder.keepAll(child, path);
      result[key] = child;
      continue;
    }
    // The DMO beside it was not placed (already refused): its field is left as it is.
    if (key === 'fieldApiName' && typeof object === 'string' && !here) {
      result[key] = child;
      continue;
    }
    result[key] = translateCriteria(child, path, here, recorder, context);
  }
  return result;
}

/**
 * STL node actions the translation can place: loads, joins and outputs, and the expression nodes
 * whose shapes are known (live API 68, DB entry data360:dataspace-ci-spelling-stl-nodes-api68).
 */
const translatableNodes = new Set([
  'load',
  'outputD360',
  'join',
  'formula',
  'filter',
  'sqlFilter',
  'aggregate',
  'appendV2',
]);

/**
 * The definitions of a transform file: its `definition`, or each entry of `definitions`.
 * @param {Record<string, unknown>} document Transform file.
 * @returns {Array<Record<string, unknown>>} Definitions.
 */
function transformDefinitions(document: Record<string, unknown>): Array<Record<string, unknown>> {
  const input = document.definition as Record<string, unknown>;
  if (Array.isArray(input.definitions)) return input.definitions as Array<Record<string, unknown>>;
  return [input.definition as Record<string, unknown>];
}

/** The keys of a DCSQL manifest node that hold SQL text. */
const dcsqlSqlKeys = ['compiled_code', 'raw_code'];

/**
 * The model nodes of a DCSQL definition (`manifest.nodes`), or undefined when it has none.
 * @param {Record<string, unknown>} definition DCSQL definition.
 * @returns {Record<string, Record<string, unknown>> | undefined} Nodes by key.
 */
function dcsqlNodes(
  definition: Record<string, unknown>,
): Record<string, Record<string, unknown>> | undefined {
  const manifest = definition.manifest as { nodes?: unknown } | null | undefined;
  const nodes = manifest?.nodes;
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return undefined;
  return nodes as Record<string, Record<string, unknown>>;
}

/**
 * Why a DCSQL definition cannot be translated: no model nodes, or a node without SQL text.
 * @param {Record<string, unknown>} definition DCSQL definition.
 * @returns {string | undefined} Reason.
 */
function dcsqlUnsupported(definition: Record<string, unknown>): string | undefined {
  const nodes = dcsqlNodes(definition);
  if (!nodes || Object.keys(nodes).length === 0)
    return 'the DCSQL definition holds no manifest nodes the translation can read';
  for (const [key, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
      return `the DCSQL manifest node ${key} is not an object the translation can read`;
    if (typeof node.compiled_code !== 'string')
      return `the DCSQL manifest node ${key} holds no SQL in compiled_code`;
    for (const sqlKey of dcsqlSqlKeys)
      if (node[sqlKey] !== undefined && typeof node[sqlKey] !== 'string')
        return `the DCSQL manifest node ${key} holds a ${sqlKey} that is not SQL text`;
  }
  return undefined;
}

/**
 * Why a transform file cannot be translated yet: neither STL nor DCSQL, a DCSQL definition without
 * SQL to read, or an STL node whose action the translation does not know.
 * @param {Record<string, unknown>} document Transform file.
 * @returns {string | undefined} Reason.
 */
function transformUnsupported(document: Record<string, unknown>): string | undefined {
  for (const definition of transformDefinitions(document)) {
    const type = definition?.type;
    if (type === 'DCSQL') {
      const reason = dcsqlUnsupported(definition);
      if (reason !== undefined) return reason;
      continue;
    }
    if (type !== 'STL')
      return `data transforms of type ${String(type)} cannot be translated; only STL and DCSQL transforms can`;
    const nodes = definition.nodes;
    if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes))
      return 'the STL definition holds no nodes the translation can read';
    for (const [key, node] of Object.entries(nodes as Record<string, unknown>)) {
      const action = (node as { action?: unknown } | null)?.action;
      if (typeof action !== 'string' || !translatableNodes.has(action))
        return `the STL node ${key} (${String(action)}) is of a kind the translation does not know; only load, join, formula, filter, sqlFilter, aggregate, appendV2 and output nodes can be translated`;
    }
  }
  return undefined;
}

/** Segment types whose names the translation can place: criteria, child segments or SQL models. */
const supportedSegmentTypes = new Set(['UI', 'Waterfall', 'DBT']);

/**
 * Why a file of this kind cannot be translated yet, or undefined when it can.
 * @param {Record<string, unknown>} document Admitted file.
 * @returns {string | undefined} Reason.
 */
export function crossSpaceUnsupported(document: Record<string, unknown>): string | undefined {
  switch (document.kind) {
    case 'dmo':
    case 'mapping':
    case 'relationship':
    case 'dlo': {
      return undefined;
    }
    case 'segment': {
      const type = (document.spec as { segmentType?: unknown } | undefined)?.segmentType;
      return typeof type === 'string' && supportedSegmentTypes.has(type)
        ? undefined
        : `segments of type ${String(type)} cannot be translated; only UI, Waterfall and SQL (DBT) segments can`;
    }
    case 'native-data-graph':
    case 'identity-resolution': {
      return undefined;
    }
    case 'data-transform': {
      return transformUnsupported(document);
    }
    case 'calculated-insight': {
      return undefined;
    }
    case 'data-stream': {
      return 'data streams cannot be deployed into another data space with this option yet';
    }
    default: {
      return `files of kind ${String(document.kind)} cannot be translated into another data space`;
    }
  }
}

/**
 * The DMOs of a non-default data space that a selected DMO file of that same data space shows to
 * be custom: a field with creationType Custom and none with Standard (as retrieve writes them). A
 * DMO file of another data space is no evidence.
 * @param {ReadonlyArray<Record<string, unknown>>} documents Admitted files.
 * @param {string} source The data space of the files being translated.
 * @returns {Set<string>} DMO names.
 */
export function customDmosOf(
  documents: ReadonlyArray<Record<string, unknown>>,
  source: string,
): Set<string> {
  const names = new Set<string>();
  for (const document of documents) {
    if (document.kind !== 'dmo' || document.c__dataSpace !== source) continue;
    const fields = (document.spec as { fields?: unknown } | undefined)?.fields;
    const name = (document.identity as { apiName?: unknown } | undefined)?.apiName;
    if (!Array.isArray(fields) || typeof name !== 'string') continue;
    const types = new Set(
      fields.map((field) => (field as { creationType?: unknown } | null)?.creationType),
    );
    if (types.has('Custom') && !types.has('Standard')) names.add(name);
  }
  return names;
}

/** Graph-level names Salesforce generates for one graph instance (helper DMOs, mapping, transform). */
const graphGeneratedKeys = [
  'idDmoName',
  'valuesDmoName',
  'dayZeroMappingDevName',
  'dayZeroTransformDevName',
  'incrementalMappingDevName',
  'incrementalTransformDevName',
];

/**
 * Translate one data graph node and the nodes below it: its object, joins, fields, criteria and
 * top-K order. The node's JSON path is rebuilt from the translated object names, and its developer
 * name as Salesforce builds it, `<graph>_<object without __dlm>` (live API 68: a create replaces
 * an authored one with that, and a retrieve reads it back so); other generated names (fragment
 * DMO, join and field developer names) and the reference name Salesforce sets are left out.
 * @param {Record<string, unknown>} node Node, changed in place.
 * @param {string} at JSON path of the node.
 * @param {Placed | undefined} parent The parent node's placed DMO.
 * @param {string | undefined} parentJsonPath The parent's translated jsonPath (undefined for the root).
 * @param {string | undefined} graph The graph's target name, or undefined when it was not placed.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {Placed | undefined} The node's placed DMO.
 */
function translateGraphNode(
  node: Record<string, unknown>,
  at: string,
  parent: Placed | undefined,
  parentJsonPath: string | undefined,
  graph: string | undefined,
  recorder: Recorder,
  context: CrossSpaceContext,
): Placed | undefined {
  const owner = recorder.dmo(`${at}.name`, String(node.name));
  if (owner) node.name = owner.name;
  if (typeof node.projectedName === 'string')
    node.projectedName =
      recorder.dmo(`${at}.projectedName`, node.projectedName)?.name ?? node.projectedName;
  const jsonPath = parentJsonPath === undefined ? '$' : `${parentJsonPath}.${String(node.name)}`;
  if (typeof node.jsonPath === 'string')
    node.jsonPath = recorder.change(`${at}.jsonPath`, node.jsonPath, jsonPath, owner?.rule);
  if (typeof node.devName === 'string') {
    // Not placed (its object or the graph name is already refused): it is kept as it is.
    if (owner && graph !== undefined)
      node.devName = recorder.change(
        `${at}.devName`,
        node.devName,
        `${graph}_${owner.name.slice(0, -dmoSuffix.length)}`,
        'generated',
      );
    else recorder.keep(`${at}.devName`);
  }
  recorder.leaveOut(node, 'fragmentDMOName', `${at}.fragmentDMOName`);
  recorder.leaveOut(node, 'referenceDeveloperName', `${at}.referenceDeveloperName`);
  for (const [index, field] of ((node.fields as Array<Record<string, unknown>>) ?? []).entries()) {
    const fieldAt = `${at}.fields[${index}]`;
    recorder.leaveOut(field, 'devName', `${fieldAt}.devName`);
    for (const key of ['sourceFieldName', 'keyQualifierName'])
      if (typeof field[key] === 'string')
        field[key] = recorder.field(`${fieldAt}.${key}`, owner, field[key] as string);
  }
  for (const [index, join] of ((node.path as Array<Record<string, unknown>>) ?? []).entries()) {
    const joinAt = `${at}.path[${index}]`;
    recorder.leaveOut(join, 'devName', `${joinAt}.devName`);
    if (typeof join.fieldName === 'string')
      join.fieldName = recorder.field(`${joinAt}.fieldName`, owner, join.fieldName);
    if (typeof join.parentFieldName === 'string')
      join.parentFieldName = recorder.field(
        `${joinAt}.parentFieldName`,
        parent,
        join.parentFieldName,
      );
  }
  for (const key of ['recencyCriteria', 'filterCriteria'])
    if (node[key] !== undefined && node[key] !== null)
      node[key] = translateCriteria(node[key], `${at}.${key}`, owner, recorder, context);
  const top = node.topKFilterCriteria as { orderCriteria?: unknown } | null | undefined;
  if (top && Array.isArray(top.orderCriteria))
    for (const [index, order] of (top.orderCriteria as Array<Record<string, unknown>>).entries())
      if (typeof order.fieldApiName === 'string')
        order.fieldApiName = recorder.field(
          `${at}.topKFilterCriteria.orderCriteria[${index}].fieldApiName`,
          owner,
          order.fieldApiName,
        );
  for (const [index, child] of (
    (node.relatedObjects as Array<Record<string, unknown>>) ?? []
  ).entries())
    translateGraphNode(
      child,
      `${at}.relatedObjects[${index}]`,
      owner,
      jsonPath,
      graph,
      recorder,
      context,
    );
  return owner;
}

/**
 * Translate a data graph file: its name (prefix rule), data space, root and every node below it.
 * The graph-level generated names are left out.
 * @param {Record<string, unknown>} copy Graph file copy, changed in place.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 */
function translateGraph(
  copy: Record<string, unknown>,
  recorder: Recorder,
  context: CrossSpaceContext,
): void {
  const definition = copy.definition as Record<string, unknown>;
  const graph = translateUniqueName(context, String(definition.name));
  definition.name = recorder.named('definition.name', String(definition.name), translateUniqueName);
  if (typeof definition.dataspaceName === 'string')
    definition.dataspaceName = recorder.change(
      'definition.dataspaceName',
      definition.dataspaceName,
      context.target,
      'data-space',
    );
  for (const key of graphGeneratedKeys) recorder.leaveOut(definition, key, `definition.${key}`);
  const root = definition.sourceObject as Record<string, unknown>;
  const placed = translateGraphNode(
    root,
    'definition.sourceObject',
    undefined,
    undefined,
    'reason' in graph ? undefined : graph.name,
    recorder,
    context,
  );
  recorder.change(
    'definition.primaryObjectName',
    String(definition.primaryObjectName),
    String(root.name),
    placed?.rule,
  );
  definition.primaryObjectName = root.name;
}

/**
 * Place one field reference of a ruleset (`{parentApiName, apiName}`): its DMO, then its field.
 * @param {Record<string, unknown>} field Field reference, changed in place.
 * @param {string} at JSON path.
 * @param {Recorder} recorder Collects changes.
 */
function translateRulesetField(
  field: Record<string, unknown>,
  at: string,
  recorder: Recorder,
): void {
  const parent = recorder.dmo(`${at}.parentApiName`, String(field.parentApiName));
  if (parent) field.parentApiName = parent.name;
  field.apiName = recorder.field(`${at}.apiName`, parent, String(field.apiName));
}

/**
 * Mark the DLO sources of a reconciliation setting as kept: a DLO keeps its name in every data space.
 * @param {Record<string, unknown>} setting Reconciliation rule or field override.
 * @param {string} at JSON path.
 * @param {Recorder} recorder Collects changes.
 */
function keepSources(setting: Record<string, unknown>, at: string, recorder: Recorder): void {
  for (const [index] of ((setting.sources as unknown[]) ?? []).entries())
    recorder.keep(`${at}.sources[${index}].apiName`);
}

/**
 * Translate an identity resolution ruleset file: its name (`<prefix>_<type>_<rulesetId>`, the
 * ruleset ID kept), secondary DMO, match and reconciliation rules and the owner and entity of
 * each output by the standard DMO rules. DLO sources keep their names.
 * @param {Record<string, unknown>} copy Ruleset file copy, changed in place.
 * @param {Recorder} recorder Collects changes.
 */
function translateRuleset(copy: Record<string, unknown>, recorder: Recorder): void {
  const identity = copy.identity as { apiName: string };
  const from = identity.apiName;
  identity.apiName = recorder.named('identity.apiName', from, translateRulesetName);
  const spec = copy.spec as Record<string, unknown>;
  const secondary = spec.secondaryDmo as { apiName: string };
  secondary.apiName =
    recorder.dmo('spec.secondaryDmo.apiName', secondary.apiName)?.name ?? secondary.apiName;
  for (const [ruleIndex, rule] of (
    (spec.matchRules as Array<Record<string, unknown>>) ?? []
  ).entries())
    for (const [index, criterion] of (
      (rule.criteria as Array<Record<string, unknown>>) ?? []
    ).entries())
      translateRulesetField(
        criterion.field as Record<string, unknown>,
        `spec.matchRules[${ruleIndex}].criteria[${index}].field`,
        recorder,
      );
  for (const [ruleIndex, rule] of (
    (spec.reconciliationRules as Array<Record<string, unknown>>) ?? []
  ).entries()) {
    const at = `spec.reconciliationRules[${ruleIndex}]`;
    const entity = rule.entity as { apiName: string };
    entity.apiName = recorder.dmo(`${at}.entity.apiName`, entity.apiName)?.name ?? entity.apiName;
    keepSources(rule, at, recorder);
    for (const [index, override] of (
      (rule.fields as Array<Record<string, unknown>>) ?? []
    ).entries()) {
      translateRulesetField(
        override.field as Record<string, unknown>,
        `${at}.fields[${index}].field`,
        recorder,
      );
      keepSources(override, `${at}.fields[${index}]`, recorder);
    }
    for (const [index, output] of (
      (rule.outputs as Array<Record<string, unknown>>) ?? []
    ).entries()) {
      const owner = output.owner as { apiName: string };
      owner.apiName = recorder.change(
        `${at}.outputs[${index}].owner.apiName`,
        owner.apiName,
        owner.apiName === from ? identity.apiName : owner.apiName,
        'name-prefix',
      );
      const outputEntity = output.entity as { apiName: string };
      outputEntity.apiName =
        recorder.dmo(`${at}.outputs[${index}].entity.apiName`, outputEntity.apiName)?.name ??
        outputEntity.apiName;
    }
  }
}

/** What a transform node's rows come from: a placed DMO, a DLO, or unknown (after a join). */
type Lineage = Placed | 'dlo' | undefined;

/**
 * Place a DLO or DMO name of a transform node: a DLO keeps its name in every data space.
 * @param {string} at JSON path.
 * @param {string} name Object name.
 * @param {Recorder} recorder Collects changes.
 * @returns {{name: string; lineage: Lineage}} Target name and lineage.
 */
function transformObject(
  at: string,
  name: string,
  recorder: Recorder,
): { name: string; lineage: Lineage } {
  if (name.endsWith('__dll')) {
    recorder.keep(at);
    return { name, lineage: 'dlo' };
  }
  const placed = recorder.dmo(at, name);
  return { name: placed?.name ?? name, lineage: placed };
}

/**
 * Translate every field name in a value (a string or a list of them) by its lineage. A field
 * written with a join side's qualifier (`R.FirstName__c`) is placed by that side's lineage; a
 * qualifier that names no side of the join the value comes from is not placed.
 * @param {unknown} value Field name or list.
 * @param {string} at JSON path.
 * @param {Lineage} lineage Whose fields they are.
 * @param {Recorder} recorder Collects changes.
 * @param {Map<string, Lineage>} [qualifiers] The qualifiers of the join the value comes from.
 * @returns {unknown} Translated value.
 */
function lineageFields(
  value: unknown,
  at: string,
  lineage: Lineage,
  recorder: Recorder,
  qualifiers?: ReadonlyMap<string, Lineage>,
): unknown {
  if (typeof value === 'string') {
    if (nameValue.test(value)) return recorder.lineageField(at, lineage, value);
    const qualified = qualifiedField.exec(value);
    if (!qualified) return value;
    const [, qualifier, field] = qualified;
    if (qualifiers?.has(qualifier))
      return recorder.lineageField(at, qualifiers.get(qualifier), field, qualifier);
    recorder.visited.add(at);
    recorder.unresolved.push({
      at,
      name: value,
      reason: `the qualifier ${qualifier} names no side of the join this value comes from, so the object of its field is not known and its spelling cannot be placed`,
    });
    return value;
  }
  if (Array.isArray(value))
    return value.map((entry, index) =>
      lineageFields(entry, `${at}[${index}]`, lineage, recorder, qualifiers),
    );
  return value;
}

/**
 * Place the name of a column a node adds (a formula field, an aggregation). It is a user name, but
 * every later node reads it by the lineage rule of its node (see lineageFields), so it takes that
 * spelling too: from `default` an `ssot__` name drops it like any field, a plain name stays. Where
 * the lineage rule would give a plain new name a spelling of the source object's own fields (an
 * identity resolution output towards `default` gets `ssot__`), the new name is not placed: it is
 * not a field of that object, and keeping it would leave the later references apart from it.
 * @param {unknown} value Column name.
 * @param {string} at JSON path.
 * @param {Lineage} input Lineage of the node's one source.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {unknown} Target name.
 */
function addedColumn(
  value: unknown,
  at: string,
  input: Lineage,
  recorder: Recorder,
  context: CrossSpaceContext,
): unknown {
  if (typeof value !== 'string' || !nameValue.test(value))
    return lineageFields(value, at, input, recorder);
  const placed = recorder.placeLineage(input, value);
  const own = translateFieldName(context, 'custom', value);
  if (!('reason' in placed) && placed.name !== own.name) {
    recorder.visited.add(at);
    recorder.unresolved.push({
      at,
      name: value,
      reason: `this node adds the column ${value}, and the later nodes read it by the rule of the object the rows come from, which would spell it ${placed.name}, a field of that object it is not; deploy this transform in its own data space`,
    });
    return value;
  }
  return recorder.lineageField(at, input, value);
}

/**
 * Translate the names of a formula, filter, sqlFilter or aggregate node by the lineage of its one
 * source: whole values (filter fields, aggregate sources and groupings) as fields, SQL text
 * (formula and SQL filter expressions) name by name. The columns a node adds (formula field
 * names, aggregation names) are user names: see addedColumn.
 * @param {unknown} action Node action.
 * @param {Record<string, unknown>} parameters Node parameters, changed in place.
 * @param {string} at JSON path of the parameters.
 * @param {Lineage} input Lineage of the node's one source; undefined after a join or with several.
 * @param {ReadonlyMap<string, Lineage>} [qualifiers] The qualifiers of the join above the node.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 */
function translateExpressionNode(
  action: unknown,
  parameters: Record<string, unknown>,
  at: string,
  input: Lineage,
  qualifiers: ReadonlyMap<string, Lineage> | undefined,
  recorder: Recorder,
  context: CrossSpaceContext,
): void {
  const entries = (key: string): Array<Record<string, unknown>> =>
    Array.isArray(parameters[key]) ? (parameters[key] as Array<Record<string, unknown>>) : [];
  switch (action) {
    case 'formula': {
      const sql = parameters.expressionType === 'SQL';
      for (const [index, field] of entries('fields').entries()) {
        const fieldAt = `${at}.fields[${index}]`;
        field.name = addedColumn(field.name, `${fieldAt}.name`, input, recorder, context);
        if (typeof field.formulaExpression !== 'string') continue;
        if (sql)
          field.formulaExpression = recorder.expression(
            `${fieldAt}.formulaExpression`,
            field.formulaExpression,
            input,
            qualifiers,
          );
        else {
          recorder.visited.add(`${fieldAt}.formulaExpression`);
          recorder.unresolved.push({
            at: `${fieldAt}.formulaExpression`,
            name: field.formulaExpression,
            reason: `formula expressions of type ${String(parameters.expressionType)} cannot be translated; only SQL expressions can`,
          });
        }
      }
      return;
    }
    case 'filter': {
      for (const [index, expression] of entries('filterExpressions').entries())
        expression.field = lineageFields(
          expression.field,
          `${at}.filterExpressions[${index}].field`,
          input,
          recorder,
          qualifiers,
        );
      return;
    }
    case 'sqlFilter': {
      if (typeof parameters.sqlFilterExpression === 'string')
        parameters.sqlFilterExpression = recorder.expression(
          `${at}.sqlFilterExpression`,
          parameters.sqlFilterExpression,
          input,
          qualifiers,
        );
      return;
    }
    case 'aggregate': {
      for (const [index, aggregation] of entries('aggregations').entries()) {
        aggregation.source = lineageFields(
          aggregation.source,
          `${at}.aggregations[${index}].source`,
          input,
          recorder,
          qualifiers,
        );
        aggregation.name = addedColumn(
          aggregation.name,
          `${at}.aggregations[${index}].name`,
          input,
          recorder,
          context,
        );
      }
      parameters.groupings = lineageFields(
        parameters.groupings,
        `${at}.groupings`,
        input,
        recorder,
        qualifiers,
      );
      return;
    }
    default: {
      return;
    }
  }
}

/**
 * Translate one STL definition: load and output objects and fields, output field mappings, join
 * keys and the sample data space, the names in formula, filter, sqlFilter, aggregate and appendV2
 * nodes; output object definitions by their name.
 * @param {Record<string, unknown>} definition STL definition, changed in place.
 * @param {string} at JSON path.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 */
function translateStl(
  definition: Record<string, unknown>,
  at: string,
  recorder: Recorder,
  context: CrossSpaceContext,
): void {
  // The STL definition repeats the transform's name.
  if (typeof definition.name === 'string')
    definition.name = recorder.named(`${at}.name`, definition.name, translateUniqueName);
  const nodes = definition.nodes as Record<string, Record<string, unknown>>;
  const lineage = new Map<string, Lineage>();
  const sourcesOf = (node: Record<string, unknown>): string[] =>
    Array.isArray(node.sources) ? (node.sources as string[]) : [];
  for (const [key, node] of Object.entries(nodes)) {
    if (node.action !== 'load') continue;
    const nodeAt = `${at}.nodes.${key}.parameters`;
    const parameters = node.parameters as Record<string, unknown>;
    const dataset = parameters.dataset as Record<string, unknown> | undefined;
    const object =
      typeof dataset?.name === 'string'
        ? transformObject(`${nodeAt}.dataset.name`, dataset.name, recorder)
        : undefined;
    if (dataset && object) dataset.name = object.name;
    lineage.set(key, object?.lineage);
    parameters.fields = lineageFields(
      parameters.fields,
      `${nodeAt}.fields`,
      object?.lineage,
      recorder,
    );
    const sample = parameters.sampleDetails as Record<string, unknown> | undefined;
    if (sample && typeof sample.dataspace === 'string')
      sample.dataspace = recorder.change(
        `${nodeAt}.sampleDetails.dataspace`,
        sample.dataspace,
        context.target,
        'data-space',
      );
    if (sample && sample.sortBy !== undefined)
      sample.sortBy = lineageFields(
        sample.sortBy,
        `${nodeAt}.sampleDetails.sortBy`,
        object?.lineage,
        recorder,
      );
  }
  // A node takes the lineage of its one source. A join or append mixes its sources: its columns
  // keep one spelling only when every source is a DLO, or every source a DMO of the same kind
  // (the field rule reads nothing else); otherwise its lineage is unknown. Each node's lineage is
  // worked out once (the loads are all placed above); a result reached through a cycle is not kept.
  const memo = new Map<string, Lineage>();
  let cycles = 0;
  const lineageOf = (key: string, seen = new Set<string>()): Lineage => {
    if (lineage.has(key)) return lineage.get(key);
    if (memo.has(key)) return memo.get(key);
    const node = nodes[key];
    if (!node) return undefined;
    if (seen.has(key)) {
      cycles++;
      return undefined;
    }
    seen.add(key);
    const before = cycles;
    const sides = sourcesOf(node).map((source) => lineageOf(source, new Set(seen)));
    const [first] = sides;
    const same =
      first !== undefined &&
      sides.every((side) =>
        side === 'dlo' || first === 'dlo' ? side === first : side?.kind === first.kind,
      );
    const result = same ? first : undefined;
    if (cycles === before) memo.set(key, result);
    return result;
  };
  // The qualifiers of the nearest join above a node (`leftQualifier`, `rightQualifier`), each with
  // the lineage of its side.
  const qualifiersOf = (
    key: string,
    seen = new Set<string>(),
  ): ReadonlyMap<string, Lineage> | undefined => {
    const node = nodes[key];
    if (!node || seen.has(key)) return undefined;
    seen.add(key);
    const sources = sourcesOf(node);
    if (node.action !== 'join')
      return sources.length === 1 ? qualifiersOf(sources[0], seen) : undefined;
    const parameters = (node.parameters ?? {}) as Record<string, unknown>;
    const found = new Map<string, Lineage>();
    for (const [side, name] of ['leftQualifier', 'rightQualifier'].entries()) {
      const qualifier = parameters[name];
      if (typeof qualifier === 'string' && qualifier)
        found.set(qualifier, lineageOf(sources[side] ?? ''));
    }
    return found;
  };
  for (const [key, node] of Object.entries(nodes)) {
    const nodeAt = `${at}.nodes.${key}.parameters`;
    const parameters = (node.parameters ?? {}) as Record<string, unknown>;
    const sources = sourcesOf(node);
    if (node.action === 'join')
      for (const [name, value] of Object.entries(parameters)) {
        const side = /left/iu.test(name) ? 0 : /right/iu.test(name) ? 1 : undefined;
        parameters[name] = lineageFields(
          value,
          `${nodeAt}.${name}`,
          side === undefined ? undefined : lineageOf(sources[side] ?? ''),
          recorder,
          side === undefined ? undefined : qualifiersOf(sources[side] ?? ''),
        );
      }
    const input = sources.length === 1 ? lineageOf(sources[0]) : undefined;
    const qualifiers = sources.length === 1 ? qualifiersOf(sources[0]) : undefined;
    if (node.action === 'appendV2') {
      for (const [index, pair] of (
        (parameters.fieldMappings as Array<Record<string, unknown>>) ?? []
      ).entries())
        for (const [side, name] of ['top', 'bottom'].entries())
          pair[name] = lineageFields(
            pair[name],
            `${nodeAt}.fieldMappings[${index}].${name}`,
            lineageOf(sources[side] ?? ''),
            recorder,
            qualifiersOf(sources[side] ?? ''),
          );
      continue;
    }
    if (node.action !== 'outputD360') {
      translateExpressionNode(
        node.action,
        parameters,
        nodeAt,
        input,
        qualifiers,
        recorder,
        context,
      );
      continue;
    }
    const output =
      typeof parameters.name === 'string'
        ? transformObject(`${nodeAt}.name`, parameters.name, recorder)
        : undefined;
    if (output) parameters.name = output.name;
    for (const [index, pair] of (
      (parameters.fieldsMappings as Array<Record<string, unknown>>) ?? []
    ).entries()) {
      pair.sourceField = lineageFields(
        pair.sourceField,
        `${nodeAt}.fieldsMappings[${index}].sourceField`,
        input,
        recorder,
        qualifiers,
      );
      pair.targetField = lineageFields(
        pair.targetField,
        `${nodeAt}.fieldsMappings[${index}].targetField`,
        output?.lineage,
        recorder,
      );
    }
    if (parameters.dedupOrder !== undefined)
      parameters.dedupOrder = lineageFields(
        parameters.dedupOrder,
        `${nodeAt}.dedupOrder`,
        output?.lineage,
        recorder,
      );
  }
  translateOutputObjects(definition, at, recorder, context);
}

/**
 * Translate the output object definitions of a transform definition by their name: a DLO keeps
 * its name and fields, a DMO is placed with its fields; a `dataspaceName` names the target.
 * @param {Record<string, unknown>} definition Transform definition, changed in place.
 * @param {string} at JSON path of the definition.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {Map<string, Map<string, {name: string; rule?: CrossSpaceRule}>>} Per output object
 * (source name, lowercase) each field (source name, lowercase) with its target name and rule.
 */
function translateOutputObjects(
  definition: Record<string, unknown>,
  at: string,
  recorder: Recorder,
  context: CrossSpaceContext,
): Map<string, Map<string, { name: string; rule?: CrossSpaceRule }>> {
  const objects = new Map<string, Map<string, { name: string; rule?: CrossSpaceRule }>>();
  for (const [index, object] of (
    (definition.outputDataObjects as Array<Record<string, unknown>>) ?? []
  ).entries()) {
    const objectAt = `${at}.outputDataObjects[${index}]`;
    const fields = new Map<string, { name: string; rule?: CrossSpaceRule }>();
    if (typeof object.name === 'string') objects.set(object.name.toLowerCase(), fields);
    const placed =
      typeof object.name === 'string'
        ? transformObject(`${objectAt}.name`, object.name, recorder)
        : undefined;
    if (placed) object.name = placed.name;
    if (typeof object.dataspaceName === 'string')
      object.dataspaceName = recorder.change(
        `${objectAt}.dataspaceName`,
        object.dataspaceName,
        context.target,
        'data-space',
      );
    for (const [fieldIndex, field] of (
      (object.fields as Array<Record<string, unknown>>) ?? []
    ).entries()) {
      const source = field.name;
      field.name = lineageFields(
        field.name,
        `${objectAt}.fields[${fieldIndex}].name`,
        placed?.lineage,
        recorder,
      );
      if (typeof source === 'string' && typeof field.name === 'string') {
        const rule = recorder.rewrites.find(
          (entry) => entry.at === `${objectAt}.fields[${fieldIndex}].name`,
        )?.rule;
        fields.set(source.toLowerCase(), { name: field.name, ...(rule ? { rule } : {}) });
      }
      for (const key of ['keyQualifierField', 'keyQualifierName'])
        if (typeof field[key] === 'string')
          recorder.keep(`${objectAt}.fields[${fieldIndex}].${key}`);
    }
  }
  return objects;
}

/**
 * Translate one DCSQL definition: its name, the output objects (see translateOutputObjects), and
 * per manifest node the SQL (`compiled_code`, and `raw_code` when present) by the SQL rules and
 * the output object (`relation_name`) by its name. The columns a node's SQL puts out land by name
 * in the fields of the output object its `relation_name` names, so each is checked against that
 * object's fields (see translateSql). A node whose `relation_name` names no output object of the
 * definition is an intermediate model: its `relation_name` follows the object rules, and its
 * columns are checked against the fields of that relation by its own rule (other nodes read them
 * so). A node without a `relation_name` is not placed. The
 * node's `name` is kept, its `config` checked (see dcsqlConfig); anything else name-like is left
 * to the full-coverage check.
 * @param {Record<string, unknown>} definition DCSQL definition, changed in place.
 * @param {string} at JSON path.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 */
function translateDcsql(
  definition: Record<string, unknown>,
  at: string,
  recorder: Recorder,
  context: CrossSpaceContext,
): void {
  if (typeof definition.name === 'string')
    definition.name = recorder.named(`${at}.name`, definition.name, translateUniqueName);
  const objects = translateOutputObjects(definition, at, recorder, context);
  for (const [key, node] of Object.entries(dcsqlNodes(definition) ?? {})) {
    const nodeAt = `${at}.manifest.nodes.${key}`;
    const relation = typeof node.relation_name === 'string' ? node.relation_name : undefined;
    const placedRelation =
      relation === undefined
        ? undefined
        : transformObject(`${nodeAt}.relation_name`, relation, recorder);
    // A relation_name that names no output object is an intermediate model: its columns land by
    // name in that relation, whose fields other nodes read by the relation's own rule, so each
    // column is checked against that rule (a DLO or custom DMO relation keeps every name).
    const lineage = placedRelation?.lineage;
    const fields =
      relation === undefined
        ? new Map()
        : (objects.get(relation.toLowerCase()) ?? {
            field: (name: string): ReturnType<OutputField> => {
              const placed = recorder.placeLineage(lineage, name);
              return 'reason' in placed ? undefined : placed;
            },
            fieldsChange: lineage !== 'dlo' && lineage?.kind !== 'custom',
          });
    if (relation === undefined)
      recorder.unresolved.push({
        at: `${nodeAt}.relation_name`,
        name: '(none)',
        reason:
          "the node's relation_name is missing, so it is not known whether its SQL columns land in an output object, and the column names cannot be placed",
      });
    for (const sqlKey of dcsqlSqlKeys)
      if (typeof node[sqlKey] === 'string')
        node[sqlKey] = recorder.sql(
          `${nodeAt}.${sqlKey}`,
          node[sqlKey] as string,
          `${nodeAt}.${sqlKey}`,
          'data transform',
          fields,
        );
    if (placedRelation) node.relation_name = placedRelation.name;
    if (typeof node.name === 'string') recorder.keep(`${nodeAt}.name`);
    if (node.config !== undefined) dcsqlConfig(node.config, `${nodeAt}.config`, recorder);
  }
}

// An object or field name inside a DCSQL config value.
const configNameLike = /__(?:c|dlm|dll|cio)\b|ssot__/iu;

/**
 * Check the `config` of a DCSQL node. The only key retrieve shows is `materialized` (`table`),
 * which holds no name; a name-like value under any key (`unique_key: 'Id__c'`) is not placed,
 * since which object's field it means is not known to the translation. Everything else is kept.
 * @param {unknown} value The config value, or a part of it.
 * @param {string} at Its JSON path.
 * @param {Recorder} recorder Collects changes.
 */
function dcsqlConfig(value: unknown, at: string, recorder: Recorder): void {
  recorder.keep(at);
  if (Array.isArray(value))
    for (const [index, entry] of value.entries()) dcsqlConfig(entry, `${at}[${index}]`, recorder);
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) dcsqlConfig(entry, `${at}.${key}`, recorder);
  else if (typeof value === 'string' && configNameLike.test(value))
    recorder.unresolved.push({
      at,
      name: value,
      reason:
        "this DCSQL config value holds an object or field name; the translation does not place names in a node's config, so it cannot be placed",
    });
}

/**
 * Translate an STL data transform file: its name (prefix rule), data space (a create in a
 * non-default data space needs `dataSpaceName`) and each STL definition.
 * @param {Record<string, unknown>} copy Transform file copy, changed in place.
 * @param {Recorder} recorder Collects changes.
 * @param {CrossSpaceContext} context Translation context.
 */
function translateTransform(
  copy: Record<string, unknown>,
  recorder: Recorder,
  context: CrossSpaceContext,
): void {
  const input = copy.definition as Record<string, unknown>;
  input.name = recorder.named('definition.name', String(input.name), translateUniqueName);
  if (typeof input.dataSpaceName === 'string' || context.target !== 'default')
    input.dataSpaceName = recorder.change(
      'definition.dataSpaceName',
      typeof input.dataSpaceName === 'string' ? input.dataSpaceName : '(none)',
      context.target,
      'data-space',
    );
  const translate = (definition: Record<string, unknown>, at: string): void => {
    if (definition.type === 'DCSQL') translateDcsql(definition, at, recorder, context);
    else translateStl(definition, at, recorder, context);
  };
  if (Array.isArray(input.definitions))
    for (const [index, entry] of (input.definitions as Array<Record<string, unknown>>).entries())
      translate(entry, `definition.definitions[${index}]`);
  else translate(input.definition as Record<string, unknown>, 'definition.definition');
}

/**
 * The full-coverage check of a translated graph, ruleset or transform: Salesforce accepts a graph
 * left in the source spelling in another data space (live API 68), so a missed reference would
 * not fail. Every value with a name-like part (`…__c`, `…__dlm`, also inside `R.FirstName__c`)
 * the translation did not look at, and every value with a part still in the source spelling
 * (`ssot__` towards a non-default data space, another data space's prefix), is a name that
 * cannot be placed. Labels and descriptions are text.
 * @param {unknown} value Translated document or part of it.
 * @param {string} at JSON path.
 * @param {Recorder} recorder The translation's record.
 * @param {CrossSpaceContext} context Translation context.
 * @param {Set<string>} reported Paths already reported.
 */
function coverageGaps(
  value: unknown,
  at: string,
  recorder: Recorder,
  context: CrossSpaceContext,
  reported: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries())
      coverageGaps(entry, `${at}[${index}]`, recorder, context, reported);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'label' || key === 'description') continue;
      coverageGaps(entry, at ? `${at}.${key}` : key, recorder, context, reported);
    }
    return;
  }
  if (typeof value !== 'string' || reported.has(at)) return;
  // A compound value (`R.FirstName__c`, an expression) is checked token by token.
  const tokens = value.split(/[^A-Za-z0-9_]+/u).filter(Boolean);
  const foreign = tokens.some((token) =>
    context.spaces.some(
      (space) =>
        space.prefix !== undefined &&
        space.name !== context.target &&
        token.startsWith(`${space.prefix}_`) &&
        !token.endsWith('__dll'),
    ),
  );
  const leftover = (context.target !== 'default' && value.includes('ssot__')) || foreign;
  if (!leftover && (recorder.visited.has(at) || !tokens.some((token) => nameValue.test(token))))
    return;
  reported.add(at);
  recorder.unresolved.push({
    at,
    name: value,
    reason: leftover
      ? `it is still spelled as in ${context.source} after the translation`
      : 'the translation does not cover this reference, so it cannot be placed',
  });
}

/**
 * The rule engine as the SQL rewrite uses it. A `__dlm` table is placed by the DMO rules (and the
 * ruleset list), a `__cio` table by the prefix rule of insights, and a `__dll` table keeps its
 * name. A column of a table the rules do not know is placed only when it never changes in this
 * direction. A name still holding `ssot__` towards a non-default data space, or another data
 * space's prefix, is left over.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {SqlNamer} The namer.
 */
export function sqlNamer(context: CrossSpaceContext): SqlNamer {
  return {
    object: (name) => {
      if (name.endsWith('__dll')) return 'dlo';
      if (name.endsWith('__cio')) return translateUniqueName(context, name);
      return placeDmo(context, name);
    },
    field: (kind, field) => translateFieldName(context, kind, field),
    anyField: (field) => {
      if (context.source === 'default') return translateFieldName(context, 'custom', field);
      if (!fieldNeverChanges(context, field))
        return { reason: 'its spelling depends on the object it belongs to' };
      return { name: field };
    },
    // SQL reads names without regard to case, so the leftover check does too.
    leftover: (name) => {
      const lower = name.toLowerCase();
      const foreign = context.spaces.some(
        (space) =>
          space.prefix !== undefined &&
          space.name !== context.target &&
          lower.startsWith(`${space.prefix.toLowerCase()}_`) &&
          !lower.endsWith('__dll'),
      );
      return (context.target !== 'default' && lower.includes('ssot__')) || foreign
        ? `it is still spelled as in ${context.source} after the translation`
        : undefined;
    },
    spelling: (name) => {
      const marker = caseMarker(context, name);
      return marker === undefined
        ? undefined
        : `it holds ${marker.written} where the rules read ${marker.rule}; SQL ignores the case, the rules do not, so the name is not placed: write ${marker.rule}`;
    },
  };
}

/**
 * The part of a name the rules read (`__c`, `__dlm`, `ssot__`, `KQ_`, `Unified`, a data space
 * prefix) when it is written in another case, such as `SSOT__ID__C`.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Name as written.
 * @returns {{written: string; rule: string} | undefined} The part as written and as the rules read it.
 */
function caseMarker(
  context: CrossSpaceContext,
  name: string,
): { written: string; rule: string } | undefined {
  const lower = name.toLowerCase();
  const suffix = /__(?:c|dlm|cio|dll)$/iu.exec(name)?.[0];
  if (suffix !== undefined && suffix !== suffix.toLowerCase())
    return { written: suffix, rule: suffix.toLowerCase() };
  for (let at = lower.indexOf('ssot__'); at !== -1; at = lower.indexOf('ssot__', at + 1))
    if (name.slice(at, at + 6) !== 'ssot__')
      return { written: name.slice(at, at + 6), rule: 'ssot__' };
  if (lower.startsWith('kq_') && !name.startsWith('KQ_'))
    return { written: name.slice(0, 3), rule: 'KQ_' };
  if (!lower.endsWith('__dlm') && !lower.endsWith('__cio')) return undefined;
  if (lower.startsWith('unified') && !name.startsWith('Unified'))
    return { written: name.slice(0, 7), rule: 'Unified' };
  if (lower.startsWith('unifiedlink') && !name.startsWith('UnifiedLink'))
    return { written: name.slice(0, 11), rule: 'UnifiedLink' };
  const base = name.slice(0, -5);
  if (base.toLowerCase().endsWith('identitylink') && !base.endsWith('IdentityLink'))
    return { written: base.slice(-12), rule: 'IdentityLink' };
  for (const space of context.spaces) {
    if (space.prefix === undefined) continue;
    const prefix = `${space.prefix}_`;
    if (lower.startsWith(prefix.toLowerCase()) && !name.startsWith(prefix))
      return { written: name.slice(0, prefix.length), rule: prefix };
  }
  return undefined;
}

/** Keys of a calculated insight file that hold no names: settings and text. */
const insightPlainKeys = [
  'definitionType',
  'description',
  'displayName',
  'historyPublishScheduleInterval',
  'historyPublishScheduleTimeZone',
  'historyPublishTime',
  'isFromPackage',
  'publishScheduleEndDate',
  'publishScheduleInterval',
  'publishScheduleStartDateTime',
  'publishScheduleTimeZone',
  'queryDialect',
];

/**
 * Translate one calculated insight (its JSON with the SQL joined) into the target data space: its
 * name and a source insight by the prefix rule, its data space, and every table and column of its
 * SQL (classic and DC_SQL alike). Salesforce accepts an insight left in the source spelling and
 * then fails it a few minutes after activation without a message (live API 68), so every name-like
 * value the translation does not account for is a name it cannot place.
 * @param {Record<string, unknown>} native Insight document (not changed).
 * @param {CrossSpaceContext} context From which data space to which one.
 * @returns {CrossSpaceTranslation} The translated insight.
 */
export function translateCalculatedInsight(
  native: Record<string, unknown>,
  context: CrossSpaceContext,
): CrossSpaceTranslation {
  const recorder = new Recorder(context);
  const copy = structuredClone(native);
  const source = String(native.apiName);
  copy.apiName = recorder.named('apiName', source, translateUniqueName);
  copy.dataSpace = recorder.change(
    'c__dataSpace',
    String(native.dataSpace),
    context.target,
    'data-space',
  );
  recorder.keep('dataSpace');
  if (typeof copy.sourceCiDevName === 'string' && copy.sourceCiDevName)
    copy.sourceCiDevName = recorder.named(
      'sourceCiDevName',
      copy.sourceCiDevName,
      translateUniqueName,
    );
  else recorder.keep('sourceCiDevName');
  copy.expression = recorder.sql(
    'expression',
    String(native.expression),
    `${source}.calculatedInsight-meta.sql`,
    'calculated insight',
  );
  for (const key of insightPlainKeys) recorder.keep(key);
  // The SQL had its own token-level check; the other keys are checked here.
  const keys = { ...copy };
  delete keys.expression;
  coverageGaps(keys, '', recorder, context, new Set(recorder.unresolved.map((entry) => entry.at)));
  return { document: copy, rewrites: recorder.rewrites, unresolved: recorder.unresolved };
}

/**
 * Translate one admitted file of the source data space into the target data space, in memory.
 * DMO: its name and field names. Mapping: its target DMO and target fields (the source DLO side
 * and the mapping's own name stay; the mapping is found by its binding). Relationship: both
 * sides. DLO: the target data space is added to its list. UI segment: its name, DMO and criteria
 * names; Waterfall: its name, DMO and child segments.
 * @param {Record<string, unknown>} document Admitted file (not changed).
 * @param {CrossSpaceContext} context From which data space to which one.
 * @returns {CrossSpaceTranslation | CrossSpaceUnsupported} The translated copy, or why not.
 */
export function translateDocument(
  document: Record<string, unknown>,
  context: CrossSpaceContext,
): CrossSpaceTranslation | CrossSpaceUnsupported {
  const unsupported = crossSpaceUnsupported(document);
  if (unsupported !== undefined) return { unsupported };
  const recorder = new Recorder(context);
  const copy = structuredClone(document);
  if (copy.kind === 'dlo') {
    const listed = copy.c__dataSpace as string[];
    if (!listed.includes(context.target)) {
      copy.c__dataSpace = [...listed, context.target];
      recorder.change(
        'c__dataSpace',
        listed.join(', '),
        [...listed, context.target].join(', '),
        'dlo-membership',
      );
    }
    return { document: copy, rewrites: recorder.rewrites, unresolved: recorder.unresolved };
  }
  copy.c__dataSpace = recorder.change(
    'c__dataSpace',
    String(document.c__dataSpace),
    context.target,
    'data-space',
  );
  if (
    copy.kind === 'native-data-graph' ||
    copy.kind === 'identity-resolution' ||
    copy.kind === 'data-transform'
  ) {
    if (copy.kind === 'native-data-graph') translateGraph(copy, recorder, context);
    else if (copy.kind === 'identity-resolution') translateRuleset(copy, recorder);
    else translateTransform(copy, recorder, context);
    // Structural keys that hold no names are looked at by the shape: kind and versions.
    for (const key of ['schemaVersion', 'kind', 'apiVersion']) recorder.keep(key);
    coverageGaps(
      copy,
      '',
      recorder,
      context,
      new Set([...recorder.unresolved.map((entry) => entry.at), ...recorder.ownCheck]),
    );
    return { document: copy, rewrites: recorder.rewrites, unresolved: recorder.unresolved };
  }
  const identity = copy.identity as { apiName: string };
  const spec = copy.spec as Record<string, unknown>;
  switch (copy.kind) {
    case 'dmo': {
      const owner = recorder.dmo('identity.apiName', identity.apiName);
      if (owner) identity.apiName = owner.name;
      const fields = spec.fields as Array<Record<string, unknown>>;
      for (const [index, field] of fields.entries())
        for (const [key, value] of Object.entries(field))
          if (typeof value === 'string' && nameValue.test(value) && value.endsWith('__c'))
            field[key] = recorder.field(`spec.fields[${index}].${key}`, owner, value);

      break;
    }
    case 'mapping': {
      const target = recorder.dmo(
        'spec.targetEntityDeveloperName',
        String(spec.targetEntityDeveloperName),
      );
      if (target) spec.targetEntityDeveloperName = target.name;
      const pairs = spec.fieldMappings as Array<Record<string, unknown>>;
      for (const [index, pair] of pairs.entries())
        pair.targetFieldDeveloperName = recorder.field(
          `spec.fieldMappings[${index}].targetFieldDeveloperName`,
          target,
          String(pair.targetFieldDeveloperName),
        );

      break;
    }
    case 'relationship': {
      for (const side of ['source', 'target'] as const) {
        const objectKey = `${side}ObjectName`;
        const fieldKey = `${side}FieldName`;
        const object = String(spec[objectKey]);
        // The target of a relationship may be a CRM object (Account), which has no data space.
        if (side === 'target' && !object.endsWith(dmoSuffix)) continue;
        const placed = recorder.dmo(`spec.${objectKey}`, object);
        if (placed) spec[objectKey] = placed.name;
        spec[fieldKey] = recorder.field(`spec.${fieldKey}`, placed, String(spec[fieldKey]));
      }

      break;
    }
    case 'calculated-insight': {
      return {
        unsupported: 'a calculated insight is translated from its JSON and SQL together',
      };
    }
    default: {
      const sourceName = identity.apiName;
      identity.apiName = recorder.segment('identity.apiName', identity.apiName);
      const segmentOn = spec.segmentOn as { apiName: string };
      const on = recorder.dmo('spec.segmentOn.apiName', segmentOn.apiName);
      if (on) segmentOn.apiName = on.name;
      if (spec.includeCriteria !== undefined)
        spec.includeCriteria = translateCriteria(
          spec.includeCriteria,
          'spec.includeCriteria',
          undefined,
          recorder,
          context,
        );
      if (Array.isArray(spec.childSegments))
        spec.childSegments = (spec.childSegments as string[]).map((child, index) =>
          recorder.segment(`spec.childSegments[${index}]`, child),
        );
      if (spec.segmentType === 'DBT' && Array.isArray(spec.models))
        for (const [index, model] of (spec.models as Array<Record<string, unknown>>).entries()) {
          recorder.keep(`spec.models[${index}].name`);
          model.sql = recorder.sql(
            `spec.models[${index}].sql`,
            String(model.sql),
            `${sourceName}.segment.${String(model.name)}.sql`,
            'DBT segment',
          );
        }
    }
  }
  return { document: copy, rewrites: recorder.rewrites, unresolved: recorder.unresolved };
}
