import { validateDloDocument } from './dlo-document.js';
import type { DloDocument } from './dlo-document.js';
import { calculatedInsightName } from './native-calculated-insight-document.js';
import type { CalculatedInsightReference as CalculatedInsightReference } from './native-calculated-insight-document.js';
import { validateIdentityResolutionDocument } from './identity-resolution-document.js';
import type { IdentityResolutionDocument } from './identity-resolution-document.js';
import type { NativeDmoDocument } from './native-dmo-document.js';
import { validateNativeDmoDocument } from './native-dmo-document.js';
import type { DocumentMode } from './verbatim-document.js';
import type { OtherSegmentSpec, SegmentDocument } from './segment-document.js';
import { unnamedChildSegment, validateSegmentDocument } from './segment-document.js';

export type DependencyIdentity = {
  kind: 'dmo' | 'segment' | 'identity-resolution' | 'calculated-insight' | 'dlo';
  dataSpace: string;
  apiName: string;
};
export type DependencyNode = { identity: DependencyIdentity; dependencies: DependencyIdentity[] };
export const dependencyLimits = Object.freeze({
  nodes: 256,
  edges: 512,
});

/** Payload-free selection refusal. */
export class DependencySelectionError extends Error {
  public constructor(public readonly code: string) {
    super('Dependency selection is incomplete or unsupported; no deployment was executed.');
    this.name = 'DependencySelectionError';
  }
}

/**
 * Key exact typed identities; API names are mandatory, never label fallbacks.
 * @param {DependencyIdentity} identity Logical identity.
 * @returns {string} Unambiguous typed key.
 */
export function dependencyKey(identity: DependencyIdentity): string {
  if (
    !['dmo', 'segment', 'identity-resolution', 'calculated-insight', 'dlo'].includes(
      identity.kind,
    ) ||
    identity.dataSpace !== 'default' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(identity.apiName)
  )
    throw new DependencySelectionError('DEPENDENCY_IDENTITY_UNSUPPORTED');
  return `${identity.kind}:${identity.dataSpace}:${identity.apiName}`;
}

/**
 * Extract only admitted family structures; unknown closure must not become an empty leaf.
 * @param {NativeDmoDocument | SegmentDocument | IdentityResolutionDocument} value Authored component.
 * @param {DocumentMode} [mode] `retrieve` checks a DLO or DMO only for its identity.
 * @returns {DependencyNode} Exact component and dependencies.
 */
export function documentDependencyNode(
  value:
    | NativeDmoDocument
    | SegmentDocument
    | IdentityResolutionDocument
    | CalculatedInsightReference
    | DloDocument,
  mode: DocumentMode = 'deploy',
): DependencyNode {
  if (value.kind === 'dlo') {
    const document = validateDloDocument(value, mode);
    // Source ownership is freshly admitted by its family service, never provisioned. The ordered
    // batch is default-space only (dependencyKey), so a DLO is keyed in default when it lists it.
    const dataSpace = document.c__dataSpace.includes('default')
      ? 'default'
      : document.c__dataSpace[0];
    return {
      identity: { kind: 'dlo', dataSpace, apiName: document.identity.apiName },
      dependencies: [],
    };
  }
  if (value.kind === 'calculated-insight') {
    // The DMOs and insights its SQL names (calculatedInsightReference): ordering edges only.
    if (!calculatedInsightName.test(value.identity.apiName))
      throw new DependencySelectionError('DEPENDENCY_IDENTITY_UNSUPPORTED');
    return {
      identity: { kind: 'calculated-insight', ...value.identity },
      dependencies: value.spec.dependencies.map(({ kind, dataSpace, apiName }) => ({
        kind,
        dataSpace,
        apiName,
      })),
    };
  }
  if (value.kind === 'identity-resolution') {
    const document = validateIdentityResolutionDocument(value, mode);
    return {
      identity: { kind: 'identity-resolution', ...document.identity },
      dependencies: document.spec.reconciliationRules.map(({ entity }) => ({ ...entity })),
    };
  }
  if (value.kind === 'segment') {
    const document = validateSegmentDocument(value, mode);
    const { kind, dataSpace, apiName } = document.spec.segmentOn;
    // A Waterfall runs after the child segments it names (a stand-in for an unnamed child is none).
    const children = ((document.spec as OtherSegmentSpec).childSegments ?? [])
      .filter((child) => child !== unnamedChildSegment)
      .map((child) => ({ kind: 'segment' as const, dataSpace: 'default', apiName: child }));
    return {
      identity: { kind: 'segment', ...document.identity },
      dependencies: [{ kind, dataSpace, apiName }, ...children],
    };
  }
  if (value.kind !== 'dmo') throw new DependencySelectionError('DEPENDENCY_CLOSURE_UNSUPPORTED');
  let document: NativeDmoDocument;
  try {
    document = validateNativeDmoDocument(value, mode);
  } catch {
    throw new DependencySelectionError('DEPENDENCY_CLOSURE_UNSUPPORTED');
  }
  // A native DMO definition names no other component; it is always a leaf.
  return {
    identity: { kind: 'dmo', dataSpace: document.c__dataSpace, apiName: document.identity.apiName },
    dependencies: [],
  };
}

/**
 * Order selected nodes dependency-first, retaining isolated roots and external prerequisites.
 * Family/space/name is a tie-break only among ready nodes. External nodes need target binding.
 * @param {DependencyNode[]} nodes Complete selected graph.
 * @param {{nodes: number, edges: number}} [limits] Node and edge caps; deploy keeps the default,
 * retrieve passes unbounded caps (it writes files and provisions nothing).
 * @returns {string[]} Ordered typed keys.
 */
export function orderDependencyNodes(
  nodes: DependencyNode[],
  limits: Readonly<{ nodes: number; edges: number }> = dependencyLimits,
): string[] {
  if (nodes.length > limits.nodes) throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
  const remaining = new Map<string, Set<string>>();
  let edges = 0;
  for (const node of nodes) {
    const key = dependencyKey(node.identity);
    if (remaining.has(key)) throw new DependencySelectionError('DEPENDENCY_DUPLICATE_IDENTITY');
    const dependencies = new Set(node.dependencies.map((identity) => dependencyKey(identity)));
    edges += dependencies.size;
    if (edges > limits.edges) throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
    remaining.set(key, dependencies);
  }
  const selected = new Set(remaining.keys());
  const ordered: string[] = [];
  const done = new Set<string>();
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, dependencies]) =>
        [...dependencies].every((key) => !selected.has(key) || done.has(key)),
      )
      .map(([key]) => key)
      // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh ready-node list within the existing TypeScript library target.
      .sort();
    if (ready.length === 0) throw new DependencySelectionError('DEPENDENCY_CYCLE');
    // Recompute readiness after each node so newly-ready nodes take part in the tie-break.
    const key = ready[0];
    ordered.push(key);
    done.add(key);
    remaining.delete(key);
  }
  return ordered;
}
