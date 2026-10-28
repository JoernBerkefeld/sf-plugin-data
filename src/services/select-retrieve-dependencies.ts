import type { Connection } from '@salesforce/core';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  dependencyKey,
  dependencyLimits,
  DependencySelectionError,
  documentDependencyNode,
  orderDependencyNodes,
} from '../artifacts/dependency-selection.js';
import type { DependencyIdentity, SelectionReason } from '../artifacts/dependency-selection.js';
import type { DmoDocument } from '../artifacts/dmo-document.js';
import { SegmentError } from '../artifacts/segment-document.js';
import type { SegmentAcquisition } from './retrieve-segment.js';
import { retrieveSegment } from './retrieve-segment.js';
import { retrieveDmo, readDmoMetadata, DmoRetrieveError } from './retrieve-other-dmo.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { ConnectClient } from '../transport/connect-client.js';

/** Payload-free dependency refusal retaining the affected logical identity and reason. */
export class RetrieveDependencyError extends Error {
  public constructor(
    public readonly code: string,
    public readonly identity: DependencyIdentity,
    public readonly reason: SelectionReason,
  ) {
    super(
      'Source prerequisite acquisition is unsupported or incomplete; no artifacts were published.',
    );
    this.name = 'RetrieveDependencyError';
  }
}

type RetrieveServices = {
  segment: typeof retrieveSegment;
  dmo: typeof retrieveDmo;
  bind: typeof bindSegmentDependencies;
  raw: (name: string) => Promise<{ detail: unknown; metadata: unknown }>;
};

export type RetrieveDependencyEntry =
  | { document: DmoDocument }
  | { document: NonNullable<SegmentAcquisition['candidate']>; definitionXml: string };

// Bound admitted transport operations: DMO detail + Metadata + at most 101
// relationship pages; Segment exact GET + one separately bounded standard Metadata job.
// CLI job-internal polling is bounded by the existing project transport, not this count.
export const retrieveDependencyLimits = Object.freeze({ requests: 512 });

/**
 * Resolve exact source references even without expansion, never manufacture portable prerequisites.
 * The connection and existing family services retain their transport/version/output admission.
 * @param {DependencyIdentity[]} roots Explicit exact roots (inventory already resolved by caller).
 * @param {Connection} connection Command-owned source connection.
 * @param {ApiVersionSelection} version Resolved API selection.
 * @param {boolean} include Publish supported prerequisites only when opted in.
 * @param {object} [injected] Existing service seams for offline verification.
 * @returns {Promise<object>} Complete ordered publication selection and payload-free reasons.
 */
export async function selectRetrieveDependencies(
  roots: DependencyIdentity[],
  connection: Connection,
  version: ApiVersionSelection,
  include: boolean,
  injected?: RetrieveServices,
): Promise<{ entries: RetrieveDependencyEntry[]; reasons: Map<string, SelectionReason> }> {
  const services = injected ?? {
    segment: retrieveSegment,
    dmo: retrieveDmo,
    bind: bindSegmentDependencies,
    raw: async (name: string): Promise<{ detail: unknown; metadata: unknown }> => ({
      detail: await new ConnectClient(connection, version).get(
        `/services/data/${version.restSelector}/ssot/data-model-objects/${name}`,
      ),
      metadata: await readDmoMetadata(connection, name),
    }),
  };
  const reasons = new Map<string, SelectionReason>();
  const identities = new Map<string, DependencyIdentity>();
  const entries = new Map<string, RetrieveDependencyEntry>();
  const nodes = new Map<string, ReturnType<typeof documentDependencyNode>>();
  const raw = new Map<string, Promise<{ detail: unknown; metadata: unknown }>>();
  let requests = 0;
  let acquisitions = 0;
  const reserve = (count: number): void => {
    requests += count;
    if (requests > retrieveDependencyLimits.requests)
      throw new DependencySelectionError('DEPENDENCY_REQUEST_LIMIT_EXCEEDED');
  };
  for (const identity of roots) {
    const key = dependencyKey(identity);
    if (identities.has(key)) continue;
    identities.set(key, identity);
    reasons.set(key, { explicit: true, chains: [[identity]] });
  }
  if (identities.size > dependencyLimits.nodes)
    throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
  for (const [key, identity] of identities) {
    if (++acquisitions > dependencyLimits.acquisitions)
      throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
    let entry: RetrieveDependencyEntry;
    try {
      if (identity.kind === 'segment') {
        reserve(2);
        const acquired = await services.segment(
          connection,
          identity.apiName,
          version,
          identity.dataSpace,
        );
        if (acquired.blockers.length > 0 || !acquired.candidate || !acquired.definitionXml)
          throw new SegmentError(acquired.blockers[0] ?? 'INCOMPLETE_SEGMENT');
        entry = { document: acquired.candidate, definitionXml: acquired.definitionXml };
      } else {
        reserve(103);
        const acquired = await services.dmo(
          connection,
          identity.apiName,
          version,
          identity.dataSpace,
        );
        if (acquired.status !== 'projected' || acquired.blockers.length > 0 || !acquired.candidate)
          throw new DmoRetrieveError(acquired.blockers[0] ?? 'INCOMPLETE_DMO_PROJECTION');
        entry = { document: acquired.candidate };
      }
      const node = documentDependencyNode(entry.document);
      if (dependencyKey(node.identity) !== key)
        throw new DependencySelectionError('DEPENDENCY_IDENTITY_UNSUPPORTED');
      entries.set(key, entry);
      nodes.set(key, node);
      if (entry.document.kind === 'segment') {
        for (const dependency of node.dependencies) {
          if (!raw.has(dependencyKey(dependency))) reserve(2);
        }
        await services.bind(
          entry.document,
          connection,
          version,
          identity.dataSpace,
          async (name) => {
            const dependency = {
              kind: 'dmo' as const,
              dataSpace: identity.dataSpace,
              apiName: name,
            };
            const rawKey = dependencyKey(dependency);
            if (!raw.has(rawKey)) raw.set(rawKey, services.raw(name));
            return raw.get(rawKey)!;
          },
        );
      }
      if (!include) continue;
      for (const dependency of node.dependencies) {
        const dependencyId = dependencyKey(dependency);
        if (dependency.kind !== 'dmo')
          throw new DependencySelectionError('DEPENDENCY_FAMILY_UNSUPPORTED');
        const chains = reasons.get(key)!.chains.map((chain) => [...chain, dependency]);
        if (chains.some((chain) => chain.length > dependencyLimits.depth))
          throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
        const reason = reasons.get(dependencyId);
        if (reason) reason.chains.push(...chains);
        else {
          reasons.set(dependencyId, { explicit: false, chains });
          identities.set(dependencyId, dependency);
        }
        if (identities.size > dependencyLimits.nodes)
          throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
      }
      // Check edge/cycle bounds incrementally, before further acquisition.
      orderDependencyNodes([...nodes.values()]);
    } catch (error: unknown) {
      throw new RetrieveDependencyError(
        error instanceof SegmentError ||
          error instanceof DmoRetrieveError ||
          error instanceof DependencySelectionError
          ? error.code
          : 'DEPENDENCY_ACQUISITION_FAILED',
        identity,
        reasons.get(key)!,
      );
    }
  }
  return {
    entries: orderDependencyNodes([...nodes.values()]).map((key) => entries.get(key)!),
    reasons,
  };
}
