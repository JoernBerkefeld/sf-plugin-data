/** The input shape the plan needs; deploy passes its admitted inputs. */
export type PlanInput = { path: string; document: { kind: string } };
import type { IdentityResolutionDocument } from '../artifacts/identity-resolution-document.js';

/**
 * Phases in create order. P0: data streams (each creates its landing DLO). P1: native DLO,
 * DMO, mapping, relationship. P2: data transforms. P3: identity resolution, calculated insight,
 * Segment. P4: data graphs. Delete runs them in reverse.
 */
export type CrudPhase = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type CrudStage<T extends PlanInput = PlanInput> = { phase: CrudPhase; inputs: T[] };
export type CrudStageResult = {
  status: 'success' | 'blocked' | 'failed';
  code?: string;
  error?: unknown;
  /** Preview only: component keys this stage plans to create (or could not compare yet). */
  planned?: string[];
};
export type CrudStageHandler<T extends PlanInput = PlanInput> = (
  stage: CrudStage<T>,
  planned: ReadonlySet<string>,
) => Promise<CrudStageResult>;

/**
 * Case-insensitive component key shared by every phase.
 * @param {string} kind Component family (dlo, dmo, identity-resolution, ...).
 * @param {string} apiName Component API name.
 * @returns {string} Key such as `dmo:person__dlm`.
 */
export function componentKey(kind: string, apiName: string): string {
  return `${kind}:${apiName}`.toLowerCase();
}

/**
 * Phase of one admitted deploy input.
 * @param {PlanInput} input Admitted input.
 * @returns {CrudPhase | undefined} The phase; undefined for an unknown kind.
 */
export function crudPhase(input: PlanInput): CrudPhase | undefined {
  const kind = input.document.kind;
  if (kind === 'data-stream') return 'P0';
  if (kind === 'data-transform') return 'P2';
  if (kind === 'native-data-graph') return 'P4';
  if (kind === 'dlo' || kind === 'dmo' || kind === 'mapping' || kind === 'relationship')
    return 'P1';
  if (kind === 'identity-resolution' || kind === 'calculated-insight' || kind === 'segment')
    return 'P3';
  return undefined;
}

/**
 * Unified and link DMO names an identity resolution ruleset creates, derived from its document.
 * Salesforce names a ruleset `<type>` or `<type>_<rulesetId>` and its outputs
 * `Unified<entity><rulesetId>__dlm` / `UnifiedLink<entity><rulesetId>__dlm`, where `<entity>` is
 * the reconciliation DMO name without `__dlm` and underscores (`ssot__Individual__dlm` with
 * ruleset `Individual_5810` gives `UnifiedssotIndividual5810__dlm`). A name that does not follow
 * the type pattern derives nothing.
 * @param {IdentityResolutionDocument} document Authored ruleset.
 * @returns {string[]} Derived output DMO names.
 */
export function unifiedDmoNames(document: IdentityResolutionDocument): string[] {
  // Edges are derived before the family validates the file; a malformed file derives nothing.
  const name: unknown = document.identity?.apiName;
  const type: unknown = document.spec?.configurationType;
  const rules: unknown = document.spec?.reconciliationRules;
  if (typeof name !== 'string' || typeof type !== 'string' || !Array.isArray(rules)) return [];
  const rulesetId =
    name.toLowerCase() === type.toLowerCase()
      ? ''
      : name.toLowerCase().startsWith(`${type.toLowerCase()}_`) && name.length > type.length + 1
        ? name.slice(type.length + 1)
        : undefined;
  if (rulesetId === undefined) return [];
  return (rules as Array<{ entity?: { apiName?: unknown } }>).flatMap((rule) => {
    const apiName = rule?.entity?.apiName;
    if (typeof apiName !== 'string') return [];
    const entity = apiName.replace(/__dlm$/u, '').replaceAll('_', '');
    return [`Unified${entity}${rulesetId}__dlm`, `UnifiedLink${entity}${rulesetId}__dlm`];
  });
}

/**
 * Collect the object names of a graph node tree (root and related objects).
 * @param {unknown} node Graph definition or node.
 * @param {string[]} names Accumulator.
 * @returns {string[]} The accumulator.
 */
function graphObjectNames(node: unknown, names: string[] = []): string[] {
  if (!node || typeof node !== 'object') return names;
  const record = node as Record<string, unknown>;
  if (typeof record.primaryObjectName === 'string') names.push(record.primaryObjectName);
  if (Array.isArray(record.relatedObjects) && typeof record.name === 'string')
    names.push(record.name);
  for (const value of Object.values(record))
    if (value && typeof value === 'object') graphObjectNames(value, names);
  return names;
}

/**
 * Component references of one input as `[kind, apiName]` pairs: Segment and CI dependencies,
 * the Segment's `segmentOn`, IR reconciliation DMOs and graph root/related objects (as DMOs).
 * @param {PlanInput} input Admitted input.
 * @returns {Array<[string, string]>} Referenced components.
 */
function references(input: PlanInput): Array<[string, string]> {
  const document = input.document as { kind: string; spec?: Record<string, unknown> };
  const spec = document.spec ?? {};
  const listed = (value: unknown): Array<[string, string]> =>
    Array.isArray(value)
      ? value
          .filter(
            (item): item is { kind: string; apiName: string } =>
              !!item &&
              typeof (item as { kind?: unknown }).kind === 'string' &&
              typeof (item as { apiName?: unknown }).apiName === 'string',
          )
          .map((item) => [item.kind, item.apiName])
      : [];
  if (document.kind === 'segment')
    return [...listed([spec.segmentOn]), ...listed(spec.dependencies)];
  if (document.kind === 'calculated-insight') return listed(spec.dependencies);
  if (document.kind === 'identity-resolution')
    return listed(
      (spec.reconciliationRules as Array<{ entity?: unknown }> | undefined)?.map(
        (rule) => rule.entity,
      ),
    );
  if (document.kind === 'native-data-graph')
    return graphObjectNames((input.document as { definition?: unknown }).definition).map((name) => [
      'dmo',
      name,
    ]);
  if (document.kind === 'data-transform')
    return transformDloNames(input).map((name) => ['dlo', name]);
  return [];
}

/**
 * DLOs a data transform reads and writes: the `load` dataset and the `outputD360` target.
 * @param {PlanInput} input Data transform input.
 * @returns {string[]} DLO names found in the definition; a malformed file yields fewer or none.
 */
export function transformDloNames(input: PlanInput): string[] {
  const definition = (input.document as { definition?: { definition?: { nodes?: unknown } } })
    .definition?.definition;
  const nodes = definition?.nodes;
  if (!nodes || typeof nodes !== 'object') return [];
  const names: string[] = [];
  for (const node of Object.values(nodes as Record<string, unknown>)) {
    const record = (node ?? {}) as { action?: unknown; parameters?: Record<string, unknown> };
    const name =
      record.action === 'load'
        ? (record.parameters?.dataset as { name?: unknown } | undefined)?.name
        : record.action === 'outputD360'
          ? record.parameters?.name
          : undefined;
    if (typeof name === 'string') names.push(name);
  }
  return names;
}

/**
 * Name of the DLO a data stream creates and owns (`spec.newDlo.name`).
 * @param {PlanInput} input Data stream input.
 * @returns {string | undefined} The landing DLO name.
 */
export function streamLandingDlo(input: PlanInput): string | undefined {
  const name = (input.document as { spec?: { newDlo?: { name?: unknown } } }).spec?.newDlo?.name;
  return typeof name === 'string' ? name : undefined;
}

/**
 * Selected DLO files that name the landing DLO of a selected data stream. The stream creates and
 * owns that DLO, so deploying both would write one object from two files.
 * @param {PlanInput[]} inputs Whole admitted selection.
 * @returns {string[]} Colliding DLO API names, as written in the DLO files.
 */
export function streamDloCollisions(inputs: PlanInput[]): string[] {
  const landing = new Set(
    inputs
      .filter((input) => input.document.kind === 'data-stream')
      .map((input) => streamLandingDlo(input)?.toLowerCase())
      .filter((name): name is string => name !== undefined),
  );
  return inputs
    .filter((input) => input.document.kind === 'dlo')
    .map((input) =>
      String((input.document as { identity?: { apiName?: unknown } }).identity?.apiName),
    )
    .filter((name) => landing.has(name.toLowerCase()));
}

/**
 * Edges from graph, CI and Segment inputs onto the selected identity resolution rulesets whose
 * derived unified/link DMO they reference (root, `segmentOn`, dependencies or graph objects).
 * @param {PlanInput[]} inputs Whole admitted selection.
 * @returns {Map<string, string[]>} Dependent input path to the API names of the rulesets it needs.
 */
export function identityResolutionEdges(inputs: PlanInput[]): Map<string, string[]> {
  const owners = new Map<string, string>();
  for (const input of inputs)
    if (input.document.kind === 'identity-resolution')
      for (const name of unifiedDmoNames(input.document as IdentityResolutionDocument))
        owners.set(
          name.toLowerCase(),
          (input.document as IdentityResolutionDocument).identity.apiName,
        );
  const edges = new Map<string, string[]>();
  if (owners.size === 0) return edges;
  for (const input of inputs) {
    if (
      input.document.kind !== 'segment' &&
      input.document.kind !== 'calculated-insight' &&
      input.document.kind !== 'native-data-graph'
    )
      continue;
    const needed = new Set<string>();
    for (const [kind, apiName] of references(input)) {
      const owner = kind === 'dmo' ? owners.get(apiName.toLowerCase()) : undefined;
      if (owner) needed.add(owner);
    }
    if (needed.size > 0) edges.set(input.path, [...needed]);
  }
  return edges;
}

/**
 * Every component key one input depends on: its authored references plus derived IR edges.
 * @param {PlanInput} input Admitted input.
 * @param {Map<string, string[]>} edges Result of {@link identityResolutionEdges}.
 * @returns {string[]} Component keys.
 */
export function inputDependencies(input: PlanInput, edges: Map<string, string[]>): string[] {
  const spec = (input.document as { spec?: Record<string, unknown> }).spec ?? {};
  const keys = references(input).map(([kind, apiName]) => componentKey(kind, apiName));
  if (input.document.kind === 'mapping')
    keys.push(
      componentKey('dlo', String(spec.sourceEntityDeveloperName)),
      componentKey('dmo', String(spec.targetEntityDeveloperName)),
    );
  if (input.document.kind === 'relationship')
    keys.push(
      componentKey('dmo', String(spec.sourceObjectName)),
      componentKey('dmo', String(spec.targetObjectName)),
    );
  for (const owner of edges.get(input.path) ?? [])
    keys.push(componentKey('identity-resolution', owner));
  return keys;
}

/**
 * Key of one input as other inputs reference it.
 * @param {PlanInput} input Admitted input.
 * @returns {string} Component key.
 */
export function inputKey(input: PlanInput): string {
  const document = input.document as {
    identity?: { apiName?: unknown };
    definition?: { name?: unknown };
  };
  // Graphs and transforms carry their name in the definition, not in an identity block.
  return componentKey(
    input.document.kind,
    String(document.identity?.apiName ?? document.definition?.name),
  );
}

/**
 * Selected dependents of each input: the inputs whose references (or derived IR edges) name it.
 * @param {PlanInput[]} inputs Whole selection.
 * @returns {Map<PlanInput, string[]>} Input to the component keys of the selected inputs that need it.
 */
export function selectedDependents<T extends PlanInput>(inputs: T[]): Map<T, string[]> {
  const edges = identityResolutionEdges(inputs);
  const byKey = new Map(inputs.map((input) => [inputKey(input), input]));
  const dependents = new Map<T, string[]>();
  for (const input of inputs)
    for (const key of inputDependencies(input, edges)) {
      const parent = byKey.get(key);
      if (!parent || parent === input) continue;
      const known = dependents.get(parent) ?? [];
      if (!known.includes(inputKey(input))) dependents.set(parent, [...known, inputKey(input)]);
    }
  return dependents;
}

/**
 * Split a delete selection into ordered stages, the reverse of the deploy order: P4 graphs, then
 * the P3 batch with every dependent in an earlier stage than the identity resolution, calculated
 * insight or Segment it needs (unified-DMO edges included), then P2 transforms, P1 native inputs
 * and P0 streams.
 * @param {PlanInput[]} inputs Whole delete selection.
 * @returns {CrudStage[]} Non-empty stages in run order.
 */
export function planDeleteStages<T extends PlanInput>(inputs: T[]): Array<CrudStage<T>> {
  const stages: Array<CrudStage<T>> = [];
  const of = (phase: CrudPhase): T[] => inputs.filter((input) => crudPhase(input) === phase);
  const graphs = of('P4');
  if (graphs.length > 0) stages.push({ phase: 'P4', inputs: graphs });
  const batch = of('P3');
  const dependents = selectedDependents(batch);
  const byKey = new Map(batch.map((input) => [inputKey(input), input]));
  // Height: the longest chain of selected dependents above an input. An input with no selected
  // dependent goes first; every input runs in a later stage than all of its dependents.
  const heights = new Map<T, number>();
  const visiting = new Set<T>();
  const height = (input: T): number => {
    const known = heights.get(input);
    if (known !== undefined) return known;
    // A cycle is refused by the family checks; never recurse forever here.
    if (visiting.has(input)) return 0;
    visiting.add(input);
    let result = 0;
    for (const key of dependents.get(input) ?? []) {
      const dependent = byKey.get(key);
      if (dependent) result = Math.max(result, height(dependent) + 1);
    }
    visiting.delete(input);
    heights.set(input, result);
    return result;
  };
  const grouped = new Map<number, T[]>();
  for (const input of batch) {
    const value = height(input);
    grouped.set(value, [...(grouped.get(value) ?? []), input]);
  }
  const tallest = batch.length === 0 ? -1 : Math.max(...grouped.keys());
  for (let value = 0; value <= tallest; value++) {
    const group = grouped.get(value);
    if (group) stages.push({ phase: 'P3', inputs: group });
  }
  for (const phase of ['P2', 'P1', 'P0'] as const) {
    const group = of(phase);
    if (group.length > 0) stages.push({ phase, inputs: group });
  }
  return stages;
}

/**
 * Split an admitted selection into ordered stages: P0 streams, P1 native inputs, P2 transforms,
 * the P3 dependency batch and P4 graphs. With `nativeRoute`, P1 inputs form one stage on the
 * native route; otherwise they stay in the P3 dependency batch. The batch is split further so
 * that an input needing a selected IR's unified DMO (directly or through another selected input)
 * runs in a later stage than that IR. Graphs come last, so a graph on a selected IR's unified DMO
 * starts only after that IR settled.
 * @param {PlanInput[]} inputs Whole admitted selection.
 * @param {object} options Routing choice.
 * @param {boolean} options.nativeRoute Run P1 inputs on the native route as their own stage.
 * @returns {CrudStage[]} Non-empty stages in run order.
 */
export function planDeployStages<T extends PlanInput>(
  inputs: T[],
  options: { nativeRoute: boolean },
): Array<CrudStage<T>> {
  const stages: Array<CrudStage<T>> = [];
  const of = (phase: CrudPhase): T[] => inputs.filter((input) => crudPhase(input) === phase);
  const streams = of('P0');
  if (streams.length > 0) stages.push({ phase: 'P0', inputs: streams });
  const native = options.nativeRoute ? of('P1') : [];
  if (native.length > 0) stages.push({ phase: 'P1', inputs: native });
  const transforms = of('P2');
  if (transforms.length > 0) stages.push({ phase: 'P2', inputs: transforms });
  const batch = inputs.filter(
    (input) => (crudPhase(input) === 'P1' || crudPhase(input) === 'P3') && !native.includes(input),
  );
  const edges = identityResolutionEdges(batch);
  const byKey = new Map(batch.map((input) => [inputKey(input), input]));
  const levels = new Map<T, number>();
  const visiting = new Set<T>();
  const level = (input: T): number => {
    const known = levels.get(input);
    if (known !== undefined) return known;
    // A cycle is refused later by the dependency order; never recurse forever here.
    if (visiting.has(input)) return 0;
    visiting.add(input);
    const owners = new Set(
      (edges.get(input.path) ?? []).map((name) => componentKey('identity-resolution', name)),
    );
    let result = 0;
    for (const key of inputDependencies(input, edges)) {
      const parent = byKey.get(key);
      if (parent && parent !== input)
        result = Math.max(result, level(parent) + (owners.has(key) ? 1 : 0));
    }
    visiting.delete(input);
    levels.set(input, result);
    return result;
  };
  const grouped = new Map<number, T[]>();
  for (const input of batch) {
    const value = level(input);
    grouped.set(value, [...(grouped.get(value) ?? []), input]);
  }
  const deepest = batch.length === 0 ? -1 : Math.max(...grouped.keys());
  for (let value = 0; value <= deepest; value++) {
    const group = grouped.get(value);
    if (group) stages.push({ phase: 'P3', inputs: group });
  }
  const graphs = of('P4');
  if (graphs.length > 0) stages.push({ phase: 'P4', inputs: graphs });
  return stages;
}

/**
 * Run stages in order. A stage starts only after the previous one returned success (every
 * item settled); a blocked or failed stage stops the run. With `continueAfterBlocked`
 * (read-only preview) every stage runs and the first non-success result is returned. Preview keys a stage plans to create
 * are handed to later stages, which report their dependents as planned instead of comparing.
 * @param {CrudStage[]} stages Result of {@link planDeployStages}.
 * @param {CrudStageHandler} handler Runs one stage with the family preflight/executors.
 * @param {object} [options] Run options.
 * @param {boolean} [options.continueAfterBlocked] Preview: run later stages anyway.
 * @returns {Promise<CrudStageResult>} First non-success result, or success.
 */
export async function runCrudStages<T extends PlanInput>(
  stages: Array<CrudStage<T>>,
  handler: CrudStageHandler<T>,
  options: { continueAfterBlocked?: boolean } = {},
): Promise<CrudStageResult> {
  const planned = new Set<string>();
  let first: CrudStageResult | undefined;
  for (const stage of stages) {
    const result = await handler(stage, planned);
    for (const key of result.planned ?? []) planned.add(key);
    if (result.status === 'success') continue;
    first ??= result;
    if (!options.continueAfterBlocked) break;
  }
  return first ?? { status: 'success' };
}
