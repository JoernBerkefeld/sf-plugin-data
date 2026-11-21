import type { OrgDataSpace } from './data-space-check.js';

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
 */
export type CrossSpaceRule =
  | 'data-space'
  | 'dlo-membership'
  | 'dmo-prefix'
  | 'standard-copy'
  | 'unified-output'
  | 'field-ssot'
  | 'segment-prefix';

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
};

/** What kind of DMO a name is, as far as the fields rule needs to know. */
type DmoKind = 'standard' | 'unified' | 'custom' | 'prefixed';

type Placed = { name: string; rule?: CrossSpaceRule; kind: DmoKind };
type NotPlaced = { reason: string };

const dmoSuffix = '__dlm';
// Link fields named the same in every data space (live API 68, entry data360:dataspace2-graph-and-unified-fields-api68).
const unifiedFieldsWithoutSsot = new Set(['UnifiedRecordId__c', 'SourceRecordId__c']);
const nameValue = /^[A-Za-z][A-Za-z0-9_]*__(?:c|dlm)$/u;

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
 * `UnifiedIndividual__dlm`, paired by ruleset reads later), and a `<prefix>_<Name>__dlm` name
 * towards `default` that no selected custom DMO file explains are not placed.
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
          'it looks like an identity resolution output without the ssot spelling; such outputs are paired by their rulesets, which this deploy does not read',
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
  if (context.customDmos?.has(name))
    return { name: toTarget(rest), rule: 'dmo-prefix', kind: 'custom' };
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
  if (context.target === 'default' && kind === 'unified' && !unifiedFieldsWithoutSsot.has(field))
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

/** Collects the rewrites and unplaced names of one file. */
class Recorder {
  public readonly rewrites: CrossSpaceRewrite[] = [];
  public readonly unresolved: CrossSpaceUnresolved[] = [];

  public constructor(private readonly context: CrossSpaceContext) {}

  /**
   * Record a value change.
   * @param {string} at JSON path.
   * @param {string} from Old value.
   * @param {string} to New value.
   * @param {CrossSpaceRule} [rule] Rule; none means unchanged.
   * @returns {string} The new value.
   */
  public change(at: string, from: string, to: string, rule?: CrossSpaceRule): string {
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
    const placed = translateDmoName(this.context, name);
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
    if (!owner) return field;
    const placed = translateFieldName(this.context, owner.kind, field);
    return this.change(at, field, placed.name, placed.rule);
  }

  /**
   * Place a segment name.
   * @param {string} at JSON path.
   * @param {string} name Source name.
   * @returns {string} Target name (the source name when it is not placed).
   */
  public segment(at: string, name: string): string {
    const placed = translateSegmentName(this.context, name);
    if ('reason' in placed) {
      this.unresolved.push({ at, name, reason: placed.reason });
      return name;
    }
    return this.change(at, name, placed.name, placed.rule);
  }
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

/** Segment types whose names the translation can place: no SQL in the file. */
const supportedSegmentTypes = new Set(['UI', 'Waterfall']);

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
        : `segments of type ${String(type)} (SQL or other criteria) cannot be translated yet; only UI and Waterfall segments can`;
    }
    case 'native-data-graph': {
      return 'data graphs cannot be translated into another data space yet';
    }
    case 'identity-resolution': {
      return 'identity resolution rulesets cannot be translated into another data space yet';
    }
    case 'data-transform': {
      return 'data transforms cannot be translated into another data space yet';
    }
    case 'calculated-insight': {
      return 'calculated insights (SQL) cannot be translated into another data space yet';
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
 * The DMOs of a non-default data space that a selected DMO file shows to be custom: a field with
 * creationType Custom and none with Standard (as retrieve writes them).
 * @param {ReadonlyArray<Record<string, unknown>>} documents Admitted files.
 * @returns {Set<string>} DMO names.
 */
export function customDmosOf(documents: ReadonlyArray<Record<string, unknown>>): Set<string> {
  const names = new Set<string>();
  for (const document of documents) {
    if (document.kind !== 'dmo') continue;
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
    default: {
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
    }
  }
  return { document: copy, rewrites: recorder.rewrites, unresolved: recorder.unresolved };
}
