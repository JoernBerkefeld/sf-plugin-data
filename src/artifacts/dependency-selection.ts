import { validateDataGraphDocument } from './data-graph-document.js';
import type { DataGraphDocument } from './data-graph-document.js';
import { validateCalculatedInsightDocument } from './calculated-insight-document.js';
import type { CalculatedInsightDocument } from './calculated-insight-document.js';
import { validateIdentityResolutionDocument } from './identity-resolution-document.js';
import type { IdentityResolutionDocument } from './identity-resolution-document.js';
import type { DmoDocument } from './dmo-document.js';
import { validateDmoDocument } from './dmo-document.js';
import type { SegmentDocument } from './segment-document.js';
import { validateSegmentDocument } from './segment-document.js';

export type DependencyIdentity = {
  kind: 'dmo' | 'segment' | 'identity-resolution' | 'calculated-insight' | 'data-graph';
  dataSpace: string;
  apiName: string;
};
export type SelectionReason = { explicit: boolean; chains: DependencyIdentity[][] };
export type DependencyNode = { identity: DependencyIdentity; dependencies: DependencyIdentity[] };
export const dependencyLimits = Object.freeze({
  nodes: 256,
  edges: 512,
  depth: 16,
  acquisitions: 256,
});

/** Payload-free complete-selection refusal. */
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
    !['dmo', 'segment', 'identity-resolution', 'calculated-insight', 'data-graph'].includes(
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
 * @param {DmoDocument | SegmentDocument | IdentityResolutionDocument} value Authored component.
 * @returns {DependencyNode} Exact component and dependencies.
 */
export function documentDependencyNode(
  value:
    | DmoDocument
    | SegmentDocument
    | IdentityResolutionDocument
    | CalculatedInsightDocument
    | DataGraphDocument,
): DependencyNode {
  if (value.kind === 'data-graph') {
    const document = validateDataGraphDocument(value);
    return {
      identity: { kind: 'data-graph', ...document.identity },
      dependencies: [
        { kind: 'dmo', dataSpace: 'default', apiName: document.spec.primaryObjectName },
      ],
    };
  }
  if (value.kind === 'calculated-insight') {
    const document = validateCalculatedInsightDocument(value);
    return {
      identity: { kind: 'calculated-insight', ...document.identity },
      dependencies: document.spec.dependencies.map(({ kind, dataSpace, apiName }) => ({
        kind,
        dataSpace,
        apiName,
      })),
    };
  }
  if (value.kind === 'identity-resolution') {
    const document = validateIdentityResolutionDocument(value);
    return {
      identity: { kind: 'identity-resolution', ...document.identity },
      dependencies: document.spec.reconciliationRules.map(({ entity }) => ({ ...entity })),
    };
  }
  if (value.kind === 'segment') {
    const document = validateSegmentDocument(value);
    return {
      identity: { kind: 'segment', ...document.identity },
      dependencies: document.spec.dependencies.map(({ kind, dataSpace, apiName }) => ({
        kind,
        dataSpace,
        apiName,
      })),
    };
  }
  if (value.kind !== 'dmo') throw new DependencySelectionError('DEPENDENCY_CLOSURE_UNSUPPORTED');
  const document = validateDmoDocument(value);
  // The authored DMO contract rejects relationships/generated resources rather than hiding them.
  return { identity: { kind: 'dmo', ...document.identity }, dependencies: [] };
}

/**
 * Order selected nodes dependency-first, retaining isolated roots and external prerequisites.
 * Family/space/name is a tie-break only among ready nodes. External nodes need target binding.
 * @param {DependencyNode[]} nodes Complete selected graph.
 * @returns {string[]} Ordered typed keys.
 */
export function orderDependencyNodes(nodes: DependencyNode[]): string[] {
  if (nodes.length > dependencyLimits.nodes)
    throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
  const remaining = new Map<string, Set<string>>();
  let edges = 0;
  for (const node of nodes) {
    const key = dependencyKey(node.identity);
    if (remaining.has(key)) throw new DependencySelectionError('DEPENDENCY_DUPLICATE_IDENTITY');
    const dependencies = new Set(node.dependencies.map((identity) => dependencyKey(identity)));
    edges += dependencies.size;
    if (edges > dependencyLimits.edges)
      throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
    remaining.set(key, dependencies);
  }
  const selected = new Set(remaining.keys());
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, dependencies]) =>
        [...dependencies].every((key) => !selected.has(key) || ordered.includes(key)),
      )
      .map(([key]) => key)
      // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh ready-node list within the existing TypeScript library target.
      .sort();
    if (ready.length === 0) throw new DependencySelectionError('DEPENDENCY_CYCLE');
    // Recompute readiness after each node so newly-ready nodes take part in the tie-break.
    const key = ready[0];
    ordered.push(key);
    remaining.delete(key);
  }
  return ordered;
}
