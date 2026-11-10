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
import type { DependencyIdentity } from '../artifacts/dependency-selection.js';
import { NativeDmoError } from '../artifacts/native-dmo-document.js';
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

/** Payload-free refusal retaining the affected selected identity. */
export class RetrieveSelectionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly identity: DependencyIdentity,
  ) {
    super('A selected component could not be acquired completely; no artifacts were published.');
    this.name = 'RetrieveSelectionError';
  }
}

export type RetrieveServices = {
  segment: typeof retrieveSegment;
  /** One raw native read of an exact DMO, at the native API version rather than the Segment's. */
  dmo: (apiName: string) => Promise<unknown>;
  bind: typeof bindSegmentDependencies;
  raw: (name: string) => Promise<{ detail: unknown; metadata: unknown }>;
};

export type RetrieveSelectionEntry =
  { document: NativeDmoDocument } | { document: NonNullable<SegmentAcquisition['candidate']> };

// Bound admitted transport operations: one native DMO GET; Segment exact GET.
// Segment prerequisite detail and Metadata compatibility checks remain separate.
// CLI job-internal polling is bounded by the existing project transport, not this count.
export const retrieveSelectionLimits = Object.freeze({ requests: 512 });

/**
 * Acquire exactly the selected DMOs and Segments and check each Segment's source references.
 * Referenced components are validated, never added to the selection or published.
 * The connection and existing family services retain their transport/version/output admission.
 * @param {DependencyIdentity[]} selected Explicit exact identities (inventory already resolved by caller).
 * @param {Connection} connection Command-owned source connection.
 * @param {ApiVersionSelection} version Resolved API selection for Segment reads.
 * @param {object} [injected] Service overrides; the command supplies its native DMO read.
 * @returns {Promise<RetrieveSelectionEntry[]>} Complete publication selection, referenced DMOs first.
 */
export async function acquireRetrieveSelection(
  selected: DependencyIdentity[],
  connection: Connection,
  version: ApiVersionSelection,
  injected?: Partial<RetrieveServices>,
): Promise<RetrieveSelectionEntry[]> {
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
  const identities = new Map<string, DependencyIdentity>();
  const entries = new Map<string, RetrieveSelectionEntry>();
  const nodes = new Map<string, ReturnType<typeof documentDependencyNode>>();
  const raw = new Map<string, Promise<{ detail: unknown; metadata: unknown }>>();
  let requests = 0;
  const reserve = (count: number): void => {
    requests += count;
    if (requests > retrieveSelectionLimits.requests)
      throw new DependencySelectionError('DEPENDENCY_REQUEST_LIMIT_EXCEEDED');
  };
  for (const identity of selected) identities.set(dependencyKey(identity), identity);
  if (identities.size > dependencyLimits.nodes)
    throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
  for (const [key, identity] of identities) {
    let entry: RetrieveSelectionEntry;
    try {
      reserve(1);
      if (identity.kind === 'segment') {
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
        entry = {
          document: await retrieveNativeDmo(
            identity.apiName,
            { get: async (name) => services.dmo(name) },
            identity.dataSpace,
          ),
        };
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
            const rawKey = dependencyKey({
              kind: 'dmo',
              dataSpace: identity.dataSpace,
              apiName: name,
            });
            if (!raw.has(rawKey)) raw.set(rawKey, services.raw(name));
            return raw.get(rawKey)!;
          },
        );
      }
      // Check edge/cycle bounds incrementally, before further acquisition.
      orderDependencyNodes([...nodes.values()]);
    } catch (error: unknown) {
      throw retainConnectDiagnostic(
        new RetrieveSelectionError(
          error instanceof SegmentError ||
            error instanceof NativeDmoError ||
            error instanceof DependencySelectionError
            ? error.code
            : 'DEPENDENCY_ACQUISITION_FAILED',
          identity,
        ),
        getConnectDiagnostic(error),
      );
    }
  }
  return orderDependencyNodes([...nodes.values()]).map((key) => entries.get(key)!);
}
