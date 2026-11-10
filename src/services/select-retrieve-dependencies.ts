import type { Connection } from '@salesforce/core';
import { nativeApiVersion } from '../transport/api-version.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  dependencyKey,
  dependencyLimits,
  DependencySelectionError,
  documentDependencyNode,
  orderDependencyNodes,
} from '../artifacts/dependency-selection.js';
import type { DependencyIdentity, SelectionReason } from '../artifacts/dependency-selection.js';
import {
  isCustomNativeDmo,
  NativeDmoError,
  unwrapNativeDmo,
} from '../artifacts/native-dmo-document.js';
import type { NativeDmoDocument } from '../artifacts/native-dmo-document.js';
import { SegmentError } from '../artifacts/segment-document.js';
import type { SegmentAcquisition } from './retrieve-segment.js';
import { retrieveSegment } from './retrieve-segment.js';
import { readDmoMetadata } from './read-metadata.js';
import { retrieveNativeDmo } from './native-dmo.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { ConnectClient } from '../transport/connect-client.js';
import { createDmoClient } from '../transport/dmo-rest.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';

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

export type RetrieveServices = {
  segment: typeof retrieveSegment;
  /** One raw native read of an exact DMO, at the native API version rather than the root's. */
  dmo: (apiName: string) => Promise<unknown>;
  bind: typeof bindSegmentDependencies;
  raw: (name: string) => Promise<{ detail: unknown; metadata: unknown }>;
};

export type RetrieveDependencyEntry =
  { document: NativeDmoDocument } | { document: NonNullable<SegmentAcquisition['candidate']> };

// Bound admitted transport operations: one native DMO GET; Segment exact GET.
// Segment dependency detail and Metadata compatibility checks remain separate.
// CLI job-internal polling is bounded by the existing project transport, not this count.
export const retrieveDependencyLimits = Object.freeze({ requests: 512 });

/**
 * Resolve exact source references even without expansion, never manufacture portable prerequisites.
 * The connection and existing family services retain their transport/version/output admission.
 * @param {DependencyIdentity[]} roots Explicit exact roots (inventory already resolved by caller).
 * @param {Connection} connection Command-owned source connection.
 * @param {ApiVersionSelection} version Resolved API selection.
 * @param {boolean} include Publish supported prerequisites only when opted in.
 * @param {object} [injected] Service overrides; the command supplies its native DMO read.
 * @returns {Promise<object>} Complete ordered publication selection and payload-free reasons.
 */
export async function selectRetrieveDependencies(
  roots: DependencyIdentity[],
  connection: Connection,
  version: ApiVersionSelection,
  include: boolean,
  injected?: Partial<RetrieveServices>,
): Promise<{ entries: RetrieveDependencyEntry[]; reasons: Map<string, SelectionReason> }> {
  const services: RetrieveServices = {
    segment: retrieveSegment,
    dmo: async (name: string): Promise<unknown> =>
      createDmoClient(connection.getUsername() ?? '', nativeApiVersion()).get(name),
    bind: bindSegmentDependencies,
    raw: async (name: string): Promise<{ detail: unknown; metadata: unknown }> => ({
      detail: await new ConnectClient(connection, version).get(
        `/services/data/${version.restSelector}/ssot/data-model-objects/${name}`,
      ),
      metadata: await readDmoMetadata(connection, name),
    }),
    ...injected,
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
        reserve(1);
        const acquired = await services.segment(
          connection,
          identity.apiName,
          version,
          identity.dataSpace,
        );
        if (acquired.blockers.length > 0 || !acquired.candidate)
          throw retainConnectDiagnostic(
            new SegmentError(acquired.blockers[0] ?? 'INCOMPLETE_SEGMENT'),
            getConnectDiagnostic(acquired),
          );
        entry = { document: acquired.candidate };
      } else {
        reserve(1);
        let read: unknown;
        const document = await retrieveNativeDmo(
          identity.apiName,
          { get: async (name) => (read = await services.dmo(name)) },
          identity.dataSpace,
        );
        // A standard, namespaced or generated DMO pulled in only as a prerequisite is never
        // published as a deployable artifact; an explicitly selected one is the user's request.
        if (!reasons.get(key)!.explicit && !isCustomNativeDmo(unwrapNativeDmo(read)))
          throw new NativeDmoError('UNSUPPORTED_DMO_TARGET');
        entry = { document };
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
      throw retainConnectDiagnostic(
        new RetrieveDependencyError(
          error instanceof SegmentError ||
            error instanceof NativeDmoError ||
            error instanceof DependencySelectionError
            ? error.code
            : 'DEPENDENCY_ACQUISITION_FAILED',
          identity,
          reasons.get(key)!,
        ),
        getConnectDiagnostic(error),
      );
    }
  }
  return {
    entries: orderDependencyNodes([...nodes.values()]).map((key) => entries.get(key)!),
    reasons,
  };
}
