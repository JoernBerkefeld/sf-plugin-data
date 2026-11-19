import type { Connection } from '@salesforce/core';
import { nativeApiVersion } from '../transport/api-version.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import {
  dependencyKey,
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
import { retrieveNativeDmo } from './native-dmo.js';
import { bindSegmentDependencies } from './bind-segment-dependencies.js';
import { explainInput } from './operation-diagnostic.js';
import { ConnectClient } from '../transport/connect-client.js';
import { createDmoClient } from '../transport/dmo-rest.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import {
  carriedNativeResponse,
  carryNativeResponse,
  createVerbatimDocument,
  verbatimReason,
} from '../artifacts/verbatim-document.js';
import type { VerbatimDocument } from '../artifacts/verbatim-document.js';

/** Payload-free refusal retaining the affected selected identity. */
export class RetrieveSelectionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly identity: DependencyIdentity,
  ) {
    super('A selected component could not be acquired completely; it was not retrieved.');
    this.name = 'RetrieveSelectionError';
  }
}

export type RetrieveServices = {
  segment: typeof retrieveSegment;
  /** One raw native read of an exact DMO, at the native API version rather than the Segment's. */
  dmo: (apiName: string) => Promise<unknown>;
  bind: typeof bindSegmentDependencies;
  raw: (name: string) => Promise<unknown>;
};

export type RetrieveSelectionEntry =
  | { document: NativeDmoDocument }
  | { document: NonNullable<SegmentAcquisition['candidate']> }
  | { document: VerbatimDocument };

// Retrieve writes files and provisions nothing: no node, edge or request cap (deploy keeps its).
const unbounded = Object.freeze({
  nodes: Number.POSITIVE_INFINITY,
  edges: Number.POSITIVE_INFINITY,
});

/**
 * Acquire exactly the selected DMOs and Segments and check each Segment's source references.
 * Referenced components are validated, never added to the selection or published.
 * The connection and existing family services retain their transport/version/output admission.
 * @param {DependencyIdentity[]} selected Explicit exact identities (inventory already resolved by caller).
 * @param {Connection} connection Command-owned source connection.
 * @param {ApiVersionSelection} version Resolved API selection for Segment reads.
 * @param {object} [injected] Service overrides; the command supplies its native DMO read.
 * @param {Function} [onFailure] Receives each component that could not be acquired; the others
 * are still acquired. Without it, the first failure is thrown.
 * @param {Function} [onWarning] Receives a warning for each Segment whose DMO could not be bound;
 * the Segment is still retrieved (retrieve checks prerequisites, it never refuses on them).
 * @returns {Promise<RetrieveSelectionEntry[]>} Acquired selection, referenced DMOs first.
 */
export async function acquireRetrieveSelection(
  selected: DependencyIdentity[],
  connection: Connection,
  version: ApiVersionSelection,
  injected?: Partial<RetrieveServices>,
  onFailure?: (error: RetrieveSelectionError) => void,
  onWarning?: (message: string) => void,
): Promise<RetrieveSelectionEntry[]> {
  const services: RetrieveServices = {
    segment: retrieveSegment,
    // The DMO read rides the command's connection: no child CLI process.
    dmo: async (name: string): Promise<unknown> => {
      const username = connection.getUsername() ?? '';
      return createDmoClient(
        username,
        nativeApiVersion(),
        undefined,
        openBoundSsot(username, nativeApiVersion(), async () => connection),
      ).get(name);
    },
    bind: bindSegmentDependencies,
    raw: async (name: string): Promise<unknown> =>
      new ConnectClient(connection, version).get(
        `/services/data/${version.restSelector}/ssot/data-model-objects/${name}`,
      ),
    ...injected,
  };
  const identities = new Map<string, DependencyIdentity>();
  const entries = new Map<string, RetrieveSelectionEntry>();
  const nodes = new Map<string, ReturnType<typeof documentDependencyNode>>();
  const raw = new Map<string, Promise<unknown>>();
  for (const identity of selected) identities.set(dependencyKey(identity), identity);
  // Components the document cannot represent: written as Salesforce returned them, outside the
  // dependency order (they bind nothing).
  const verbatim: RetrieveSelectionEntry[] = [];
  for (const [key, identity] of identities) {
    let entry: RetrieveSelectionEntry;
    // The raw GET response of this component, once read.
    let read: { native: unknown } | undefined;
    try {
      if (identity.kind === 'segment') {
        const acquired = await services.segment(
          connection,
          identity.apiName,
          version,
          identity.dataSpace,
          'retrieve',
        );
        read = carriedNativeResponse(acquired);
        if (acquired.blockers.length > 0 || !acquired.candidate) {
          const refusal = new SegmentError(acquired.blockers[0] ?? 'INCOMPLETE_SEGMENT');
          throw retainConnectDiagnostic(
            acquired.explanation === undefined
              ? refusal
              : explainInput(refusal, acquired.explanation),
            getConnectDiagnostic(acquired),
          );
        }
        entry = { document: acquired.candidate };
      } else {
        const document = await retrieveNativeDmo(
          identity.apiName,
          {
            get: async (name) => {
              const native = await services.dmo(name);
              read ??= { native };
              return native;
            },
          },
          identity.dataSpace,
          'retrieve',
        );
        entry = { document: read ? carryNativeResponse(document, read.native) : document };
      }
      const node = documentDependencyNode(entry.document, 'retrieve');
      if (dependencyKey(node.identity) !== key)
        throw new DependencySelectionError('DEPENDENCY_IDENTITY_UNSUPPORTED');
      entries.set(key, entry);
      nodes.set(key, node);
      if (entry.document.kind === 'segment') {
        const segmentOn = entry.document.spec.segmentOn.apiName;
        try {
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
            'retrieve',
          );
        } catch (error: unknown) {
          // A prerequisite that cannot be bound is a warning on retrieve: the file is still
          // written, and deploy binds the DMO in the target org again.
          const code =
            error instanceof SegmentError ? error.code : 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED';
          onWarning?.(
            `segment:${identity.apiName}: its DMO ${segmentOn} could not be checked (${code}); the segment was retrieved anyway, and deploy needs that DMO in the target org.`,
          );
        }
      }
    } catch (error: unknown) {
      // A component that failed after its node was built (its binding) is left out entirely.
      const bound = nodes.delete(key);
      entries.delete(key);
      const reason = verbatimReason(error);
      const document =
        reason === undefined || read === undefined || bound
          ? undefined
          : createVerbatimDocument(
              identity.kind,
              { dataSpace: identity.dataSpace, apiName: identity.apiName },
              reason,
              read.native,
            );
      if (document) {
        verbatim.push({ document });
        continue;
      }
      const failure = retainConnectDiagnostic(
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
      // One component failing never blocks the others when the caller collects failures.
      if (!onFailure) throw failure;
      onFailure(failure);
    }
  }
  return [
    ...orderDependencyNodes([...nodes.values()], unbounded).map((key) => entries.get(key)!),
    ...verbatim,
  ];
}
