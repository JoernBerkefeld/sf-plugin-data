import {
  deleteDataTransform,
  resolveDataTransformTargetId,
} from '../../services/delete-data-transform.js';
import { GitSelectionError, selectGitDeployInputs } from '../../artifacts/git-deploy-selection.js';
import type {
  GitDeleteCandidate,
  GitDeploySelection,
} from '../../artifacts/git-deploy-selection.js';
import type { NativeRelationshipDocument } from '../../artifacts/native-relationship-document.js';
import {
  createVerbatimDocument,
  isVerbatimDocument,
  verbatimDataSpace,
  verbatimReason,
} from '../../artifacts/verbatim-document.js';
import type { VerbatimDocument, VerbatimKind } from '../../artifacts/verbatim-document.js';
import { DataGraphError } from '../../artifacts/data-graph-document.js';
import { createDataTransformClient } from '../../transport/data-transform-rest.js';
import {
  DataTransformError,
  dataTransformSpaceMismatch,
  validateDataTransformDocument,
} from '../../artifacts/data-transform-document.js';
import { retrieveDataTransform } from '../../services/retrieve-data-transform.js';
import type { DataTransformDeployInput } from '../../artifacts/read-deploy-input.js';
import { deleteSegment } from '../../services/delete-segment.js';
import { SegmentError, validateSegmentDocument } from '../../artifacts/segment-document.js';
import {
  projectSegment,
  segmentChildNames,
  segmentSpaceMismatch,
} from '../../services/retrieve-segment.js';
import type { SegmentDeployInput } from '../../artifacts/read-deploy-input.js';
import { deleteIdentityResolution } from '../../services/delete-identity-resolution.js';
import {
  IdentityResolutionError,
  identityResolutionName,
  identityResolutionSpace,
  identityResolutionSpaceMismatch,
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../../artifacts/identity-resolution-document.js';
import type { IdentityResolutionDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  operateNativeDataGraph,
  nativeGraphLimitations,
} from '../../services/command-native-data-graph.js';
import { nativeDataGraphReadContext } from '../../services/native-data-graph-context.js';
import { proveNativeDataGraphAbsent } from '../../services/native-data-graph-crd.js';
import { createDataGraphClient } from '../../transport/data-graph-rest.js';
import {
  nativeDataGraphDocumentFromResponse,
  nativeDataGraphSpace,
  nativeDataGraphSpaceMismatch,
} from '../../artifacts/native-data-graph-document.js';
import type { NativeDataGraphDeployInput } from '../../artifacts/read-deploy-input.js';
import { DeployInputError } from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  CalculatedInsightError,
  calculatedInsightReference,
} from '../../artifacts/native-calculated-insight-document.js';
import type { CalculatedInsightReference } from '../../artifacts/native-calculated-insight-document.js';
import { deleteCalculatedInsight } from '../../services/delete-calculated-insight.js';
import {
  acquireCalculatedInsight,
  calculatedInsightReadContext,
} from '../../services/native-calculated-insight.js';
import { ConnectError } from '../../transport/connect-client.js';
import {
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../../transport/connect-diagnostic.js';
import {
  explainSpaceMismatch,
  operationDiagnostic,
  replaceExplanation,
} from '../../services/operation-diagnostic.js';
import { rejectedNextAction } from '../../services/deploy-result.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';
import { exitCodeOf } from '../../exit-code.js';
import {
  nativeDmoFieldName,
  nativeDmoName,
  NativeDmoError,
} from '../../artifacts/native-dmo-document.js';
import { writeNativeDmoDocument } from '../../artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../../artifacts/write-native-mapping.js';
import {
  NativeRelationshipError,
  nativeRelationshipName,
  relationshipDmoName,
} from '../../artifacts/native-relationship-document.js';
import { createRelationshipClient } from '../../transport/relationship-rest.js';
import {
  deleteNativeRelationship,
  findNativeRelationshipByName,
  preflightDeleteNativeRelationship,
} from '../../services/native-relationship.js';
import {
  dmoFieldLocalFiles,
  executeDmoFieldDelete,
  localFileExists,
  mappingLocalFile,
  planDmoFieldDelete,
  refreshDmoFieldFiles,
} from '../../services/delete-dmo-field.js';
import { localFilePresent, removeLocalFiles } from '../../services/local-file-removal.js';
import type { LocalFileCandidate } from '../../services/local-file-removal.js';
import type {
  DmoFieldDeleteClients,
  DmoFieldDeletePlan,
  DmoFieldDeleteProgress,
  DmoFieldPair,
} from '../../services/delete-dmo-field.js';
import type { NativeDmoSettle } from '../../services/native-dmo.js';
import path from 'node:path';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { createNativeDmoDeleteClient } from '../../transport/dmo-native-rest.js';
import { openBoundSsot } from '../../transport/bound-ssot.js';
import type { BoundSsot } from '../../transport/bound-ssot.js';
import { deleteNativeDmo, previewDeleteNativeDmo } from '../../services/native-dmo.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { DloError, dloName } from '../../artifacts/dlo-document.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { createNativeDloDeleteClient } from '../../transport/dlo-native-rest.js';
import type { DloDeleteClient } from '../../transport/dlo-native-rest.js';
import {
  admitDloDependents,
  deleteNativeDlo,
  previewDeleteNativeDlo,
  waitForDloDependents,
} from '../../services/native-dlo.js';
import { DataSpaceError, dataSpaceCheckOf } from '../../services/data-space-check.js';
import { reportedIdentity } from '../../artifacts/data-space-field.js';
import type { DloDependent } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';
import {
  nativeMappingName,
  NativeMappingError,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
  validateNativeMappingDocument,
} from '../../artifacts/native-mapping-document.js';
import type { NativeMappingDocument } from '../../artifacts/native-mapping-document.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import {
  confirmNativeMappingAbsent,
  deleteNativeMapping,
  preflightDeleteNativeMapping,
  resolveNativeMappingTarget,
} from '../../services/native-mapping.js';
import { lstat, readdir, readFile } from 'node:fs/promises';
import {
  nativeApiVersion,
  dataStreamApiVersion,
  operationApiVersion,
} from '../../transport/api-version.js';
import { DataStreamError } from '../../artifacts/data-stream-document.js';
import { ConnectClient } from '../../transport/connect-client.js';
import {
  createDataStreamClient,
  createDataStreamReferenceReader,
} from '../../transport/data-stream-rest.js';
import {
  preflightDeleteDataStream,
  executeDeleteDataStream,
  watchStreamAbsence,
} from '../../services/command-native-data-stream.js';
import { retrieveNativeDataStream } from '../../services/native-data-stream.js';
import type { StreamDependent } from '../../services/native-data-stream.js';
import type { DeployInput } from '../../artifacts/read-deploy-input.js';
import {
  inputKey,
  planDeleteStages,
  runCrudStages,
  selectedDependents,
} from '../../services/crud-plan.js';
import type { CrudStage, CrudStageResult, PlanInput } from '../../services/crud-plan.js';

/** Plugin family of one delete selector (its `family:` prefix). */
export type DeleteFamily =
  | 'data-transform'
  | 'segment'
  | 'identity-resolution'
  | 'data-graph'
  | 'calculated-insight'
  | 'data-stream'
  | 'dlo'
  | 'dmo'
  | 'mapping'
  | 'relationship';

/** Families whose definition a delete reads from the org by name (from the base file with Git). */
const sourceFamilies: ReadonlySet<DeleteFamily> = new Set([
  'data-transform',
  'segment',
  'identity-resolution',
  'data-graph',
  'calculated-insight',
]);
const nativeFamilies: ReadonlySet<DeleteFamily> = new Set([
  'dlo',
  'dmo',
  'mapping',
  'relationship',
]);
const developerName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

/**
 * Family of an exact `family:Name` delete selector.
 * @param {string} selector Raw -m value.
 * @param {boolean} [git] Selector built from a file deleted in a Git range.
 * @returns {DeleteFamily | undefined} The family; undefined for anything not exact.
 */
function deleteFamily(selector: string, git = false): DeleteFamily | undefined {
  const index = selector.indexOf(':');
  if (index === -1) return undefined;
  const family = selector.slice(0, index);
  const name = selector.slice(index + 1);
  switch (family) {
    case 'data-transform':
    case 'segment':
    case 'data-graph':
    case 'data-stream': {
      return developerName.test(name) ? family : undefined;
    }
    case 'identity-resolution': {
      return identityResolutionName.test(name) ? family : undefined;
    }
    case 'calculated-insight': {
      return /^[A-Za-z][A-Za-z0-9_]*__cio$/u.test(name) ? family : undefined;
    }
    case 'dlo': {
      return dloName.test(name) ? family : undefined;
    }
    case 'dmo': {
      return nativeDmoName.test(name) ? family : undefined;
    }
    case 'mapping': {
      return nativeMappingName.test(name) ? family : undefined;
    }
    case 'relationship': {
      // -m names the source DMO too (relationship:<SourceDmo__dlm>:<Name>); a file deleted in a
      // Git range carries it in its base content, so its selector is relationship:<Name>.
      const parts = name.split(':');
      return git
        ? parts.length === 1 && nativeRelationshipName.test(name)
          ? family
          : undefined
        : parts.length === 2 &&
            relationshipDmoName.test(parts[0]) &&
            nativeRelationshipName.test(parts[1])
          ? family
          : undefined;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * The refusal for a selector that is not exact, in the code of the family it names.
 * @param {string} selector Raw -m value.
 * @returns {Error} Coded refusal.
 */
function selectorError(selector: string): Error {
  if (selector === 'data-transform' || selector.startsWith('data-transform:'))
    return new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
  if (selector === 'data-stream' || selector.startsWith('data-stream:'))
    return new DataStreamError('INVALID_STREAM_DELETE_SELECTION');
  const error = new DloError('INVALID_SELECTION');
  if (selector === 'relationship' || selector.startsWith('relationship:'))
    replaceExplanation(
      error,
      'A relationship is deleted as -m relationship:<SourceDmo__dlm>:<Name>, naming its source DMO and its exact name. Nothing was deleted.',
    );
  return error;
}

/**
 * Name part of an exact selector (of relationship:<SourceDmo__dlm>:<Name>, the relationship name).
 * @param {string} selector Exact `family:Name` selector.
 * @returns {string} The name.
 */
function selectorName(selector: string): string {
  return selector.slice(selector.lastIndexOf(':') + 1);
}

/**
 * The data space list a DLO or data stream file names (every space of the DLO), or undefined
 * for a file with a single data space (or a verbatim file).
 * @param {unknown} document Deleted file's base document.
 * @returns {string[] | undefined} Its list.
 */
function spaceListOf(document: unknown): string[] | undefined {
  if (isVerbatimDocument(document)) return undefined;
  const listed = (document as { c__dataSpace?: unknown } | null)?.c__dataSpace;
  return Array.isArray(listed) ? (listed as string[]) : undefined;
}

/**
 * Native delete order inside P1. Dependents go first: relationships (which need their DMOs),
 * mappings, then DMOs (which take their mappings along), then DLOs.
 * @param {string} selector Exact native selector.
 * @returns {number} Rank.
 */
function nativeOrder(selector: string): number {
  return selector.startsWith('relationship:')
    ? 0
    : selector.startsWith('mapping:')
      ? 1
      : selector.startsWith('dmo:')
        ? 2
        : 3;
}

/**
 * Read-only: the landing DLO a data stream owns, read from the stream itself.
 * @param {string} apiName Exact stream name.
 * @param {object} clients Native stream readers.
 * @returns {Promise<string | undefined>} The linked DLO name.
 */
async function readStreamLinkedDlo(
  apiName: string,
  clients: Parameters<typeof retrieveNativeDataStream>[1],
): Promise<string | undefined> {
  const watched = watchStreamAbsence(apiName, clients);
  try {
    const document = await retrieveNativeDataStream(apiName, watched.clients);
    return document.spec.newDlo.name;
  } catch (error) {
    // A stream that is already gone links no DLO; its delete reports it unchanged.
    if (watched.absent()) return undefined;
    // A stream the plugin cannot model names its DLO in the raw GET.
    if (verbatimReason(error) === undefined) throw error;
    const raw = (await watched.clients.streams.get(apiName)) as {
      name?: unknown;
      dataLakeObjectInfo?: { name?: unknown };
    } | null;
    if (raw?.name !== apiName) throw error;
    const dlo = raw.dataLakeObjectInfo?.name;
    return typeof dlo === 'string' ? dlo : undefined;
  }
}

/**
 * A source-family component read before any delete: its definition, or `absent` when the org has
 * none of that name. A transform also carries the target ID its name resolved to.
 */
type AdmittedSource =
  { absent?: false; desired: unknown; transformTargetId?: string } | { absent: true };
type DeletePlanInput = PlanInput & {
  selector: string;
  source?: AdmittedSource;
  /** Selected with --changed-since: the file deleted in the Git range, read from the base. */
  git?: GitDeleteCandidate;
};
type StageStatus = 'success' | 'blocked' | 'failed';

/**
 * Document kind of a source family, as the plan names it.
 * @param {DeleteFamily} family Source family.
 * @returns {string} The document kind.
 */
const documentKind = (family: DeleteFamily): string =>
  family === 'data-graph' ? 'native-data-graph' : family;

/**
 * Read-only: the current definition of one source-family component, read from the org by name.
 * A transform name must match exactly one transform (ignoring case); none is absent.
 * @param {DeleteFamily} family Source family of the selector.
 * @param {string} name Exact name from the selector.
 * @param {Connection} connection API68 connection of the target org.
 * @param {object} readers Command seams used for the transform, CI and graph reads.
 * @param {Function} readers.transformClient Transform client factory.
 * @param {Function} readers.ciContext CI read context factory.
 * @param {Function} readers.graphContext Native graph read context factory.
 * @param {string} dataSpace The run's data space (a component of another data space is refused).
 * @returns {Promise<AdmittedSource>} The definition, or absent.
 */
async function readOrgSource(
  family: DeleteFamily,
  name: string,
  connection: Connection,
  readers: {
    transformClient: typeof createDataTransformClient;
    ciContext: typeof calculatedInsightReadContext;
    graphContext: typeof nativeDataGraphReadContext;
  },
  dataSpace: string,
): Promise<AdmittedSource> {
  // A GET the plugin cannot model is deleted by type and name, like a verbatim file: the
  // service then checks only identity, scope, protection and dependents. Read failures,
  // absence and identity mismatches stay refusals.
  const byName = (kind: VerbatimKind, error: unknown): { desired: unknown } => {
    const reason = verbatimReason(error);
    const document =
      reason === undefined
        ? undefined
        : createVerbatimDocument(kind, { dataSpace, apiName: name }, reason);
    if (document === undefined) throw error;
    return { desired: document };
  };
  const project = (kind: VerbatimKind, projection: () => unknown): AdmittedSource => {
    try {
      return { desired: projection() };
    } catch (error) {
      return byName(kind, error);
    }
  };
  // Segment and IR: an exact GET; only ITEM_NOT_FOUND is absence.
  const exact = async (route: string): Promise<unknown> => {
    try {
      return await new ConnectClient(connection, '68.0').get(route);
    } catch (error) {
      if (
        error instanceof ConnectError &&
        error.statusCode === 404 &&
        error.nativeCode === 'ITEM_NOT_FOUND'
      )
        return undefined;
      throw error;
    }
  };
  switch (family) {
    case 'data-transform': {
      const client = readers.transformClient(connection, '68.0', dataSpace);
      const targetId = await resolveDataTransformTargetId(client, name);
      if (targetId === undefined) return { absent: true };
      try {
        // The data space is resolved before anything is projected: a transform of another data
        // space is refused (never a verbatim stand-in) before any phase deletes anything.
        const observed = await retrieveDataTransform(
          targetId,
          client,
          'retrieve',
          undefined,
          dataSpace,
        );
        return { desired: observed.document, transformTargetId: targetId };
      } catch (error) {
        return { ...byName('data-transform', error), transformTargetId: targetId };
      }
    }
    case 'segment': {
      const raw = await exact(`/services/data/v68.0/ssot/segments/${name}`);
      if (raw === undefined) return { absent: true };
      // A Waterfall names its children, so the plan deletes it before its selected children.
      // A segment of another data space is refused before any phase deletes anything.
      const found = (
        (raw as { segments?: unknown[] } | undefined)?.segments?.[0] as
          { dataSpace?: unknown } | undefined
      )?.dataSpace;
      if (found !== dataSpace) throw segmentSpaceMismatch(name, found, dataSpace);
      const children = await segmentChildNames(connection, raw);
      return project('segment', () => projectSegment(raw, name, 'retrieve', children).candidate);
    }
    case 'identity-resolution': {
      const raw = await exact(`/services/data/v68.0/ssot/identity-resolutions/${name}`);
      if (raw === undefined) return { absent: true };
      // The item route reads a ruleset of any data space by name: one of another data space is
      // refused before anything is projected or any phase deletes anything.
      const found = identityResolutionSpace(raw);
      if (found !== dataSpace) throw identityResolutionSpaceMismatch(name, found, dataSpace, 'org');
      return project(
        'identity-resolution',
        () => projectNativeIdentityResolution(raw, name, 'retrieve').candidate,
      );
    }
    case 'calculated-insight': {
      // The API 68 GET in any status; the delete itself reads it again by name. The planning
      // view orders it before the selected DMOs and insights its SQL names.
      let acquired: Awaited<ReturnType<typeof acquireCalculatedInsight>>;
      try {
        acquired = await acquireCalculatedInsight(readers.ciContext(connection, dataSpace), name);
      } catch (error) {
        return byName('calculated-insight', error);
      }
      return acquired.state === 'absent'
        ? { absent: true }
        : { desired: calculatedInsightReference(acquired.document) };
    }
    default: {
      const context = await readers.graphContext(connection, dataSpace);
      const read = await context.get(name);
      if (read.status === 200) {
        // A GET answering with another graph is never deleted, also not by name.
        const body = read.body as { name?: unknown } | null;
        if (body?.name !== name) throw new DataGraphError('DATA_GRAPH_IDENTITY_MISMATCH');
        // Graph names are unique in the org: a graph of another data space is refused before
        // anything is projected or any phase deletes anything.
        const found = nativeDataGraphSpace(body);
        if (found !== dataSpace) throw nativeDataGraphSpaceMismatch(name, found, dataSpace, 'org');
        // A draft is retrieved as-is, so it is deleted by name like its verbatim file.
        if ((body as { status?: unknown }).status === 'draft')
          return byName('native-data-graph', new DataGraphError('DATA_GRAPH_DRAFT'));
        const admitted = project('native-data-graph', () =>
          nativeDataGraphDocumentFromResponse(read.body, 'retrieve'),
        );
        const definition = (admitted as { desired: { definition?: { name?: unknown } } }).desired
          .definition;
        if (definition !== undefined && definition.name !== name)
          throw new DataGraphError('DATA_GRAPH_IDENTITY_MISMATCH');
        return admitted;
      }
      // HTTP400 alone is never absence: the item, metadata, inventory and SOQL reads must agree.
      const proof = await proveNativeDataGraphAbsent(context, name, read);
      if (proof.state === 'absent') return { absent: true };
      const error = retainConnectDiagnostic(
        new Error('Native Graph read unavailable'),
        getConnectDiagnostic(proof) ?? getConnectDiagnostic(read),
      );
      if (proof.state === 'pending')
        replaceExplanation(
          error,
          `The Data Graph ${name} reads as not found, but its metadata, the graph inventory or SOQL still holds it: it is still being created or removed. Nothing was deleted; rerun once it has settled.`,
        );
      throw error;
    }
  }
}

/**
 * Validate the base content of one source-family file deleted in a Git range and name the
 * selector it answers. The file is read as retrieve writes it (retrieve mode).
 * @param {DeployInput} input Resolved input.
 * @returns {{family: DeleteFamily, selector: string, desired: unknown}} Admitted source.
 */
function admitSourceInput(input: DeployInput): {
  family: DeleteFamily;
  selector: string;
  desired: unknown;
} {
  switch (input.document.kind) {
    case 'data-transform': {
      const transform = input as DataTransformDeployInput;
      const desired = validateDataTransformDocument(transform.document, 'retrieve');
      return {
        family: 'data-transform',
        selector: `data-transform:${String(transform.document.definition.name)}`,
        desired,
      };
    }
    case 'segment': {
      const desired = validateSegmentDocument((input as SegmentDeployInput).document, 'retrieve');
      return { family: 'segment', selector: `segment:${desired.identity.apiName}`, desired };
    }
    case 'identity-resolution': {
      const desired = validateIdentityResolutionDocument(
        (input as IdentityResolutionDeployInput).document,
        'retrieve',
      );
      return {
        family: 'identity-resolution',
        selector: `identity-resolution:${desired.identity.apiName}`,
        desired,
      };
    }
    case 'calculated-insight': {
      // The planning view of the base content; any status, schedule and SQL is deletable.
      const desired = (input as CalculatedInsightDeployInput).document;
      return {
        family: 'calculated-insight',
        selector: `calculated-insight:${desired.identity.apiName}`,
        desired,
      };
    }
    case 'native-data-graph': {
      const graph = input as NativeDataGraphDeployInput;
      return {
        family: 'data-graph',
        selector: `data-graph:${String(graph.document.definition.name)}`,
        desired: graph.document,
      };
    }
    default: {
      throw new DloError('INVALID_SELECTION');
    }
  }
}

export type DeleteEnvelope = {
  contract: 'sf-data360-delete';
  contractVersion: '1.1.0';
  status: 'success' | 'processing' | 'partial' | 'blocked' | 'failed';
  metadata: { operation: 'delete'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: {
    command: 'sf data360 delete';
    generatedAt: string;
    /** The resolved target org's ID; null when the run stopped before an org was resolved. */
    targetOrgId: string | null;
    /** --changed-since: the resolved commits of the Git range. */
    git?: GitDeploySelection['provenance'];
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    /** The run's data space (--dataspace, default `default`). */
    scope: { dataSpace: string };
    /** --changed-since: the requested reference; the items are the files deleted in the range. */
    selection?: { changedSince: string };
    items: Array<{
      /** Plugin family of the item, as in its selector. */
      family: DeleteFamily;
      identity: { dataSpace: string; apiName: string };
      operation: 'preview' | 'delete' | 'delete-field';
      /**
       * Selector of the item whose deletion removes this one too (a stream's landing DLO, the last
       * mapping of a DMO); no request is sent for this item, and it reports the owner's outcome.
       */
      removedWith?: string;
      /** Why the item is planned rather than checked, or why a data stream delete was refused. */
      diagnostics?: Array<{ code: string; message: string }>;
      deleteDlo?: boolean;
      /** Field-level delete: the DMO fields named with --field. */
      fields?: string[];
      /** Field-level delete: fields whose absence a read confirmed. */
      removedFields?: string[];
      /** Field-level delete: mapping pairs whose removal a read confirmed. */
      unmappedPairs?: Array<{
        mapping: string;
        sourceFieldDeveloperName: string;
        targetFieldDeveloperName: string;
      }>;
      /** Field-level delete: project files and what happened to each. */
      refreshedFiles?: Array<{
        path: string;
        outcome: 'refreshed' | 'unchanged' | 'not-present' | 'failed';
        code?: string;
      }>;
      /**
       * Preview: project files an execution would refresh (--field) or remove (every other
       * deletion, unless --keep-local-files).
       */
      localFiles?: Array<{ path: string; exists: boolean }>;
      /** Confirmed deletion: the item's own local files and what happened to each. */
      removedLocalFiles?: Array<{
        path: string;
        outcome: 'removed' | 'not-present' | 'kept' | 'failed';
        code?: string;
      }>;
      targetApiName?: string;
      targetDloName?: string;
      routes?: Array<{
        operation: string;
        transport: 'native' | 'metadata';
        apiVersion: string;
      }>;
      outcome:
        | 'delete'
        | 'deleted'
        | 'deletion-processing'
        | 'deletion-unconfirmed'
        | 'unchanged'
        | 'planned-dependencies'
        | 'blocked'
        | 'failed';
      mutation:
        | 'not-attempted'
        | 'confirmed-deleted'
        | 'acknowledged-processing'
        | 'acknowledged'
        | 'rejected'
        | 'unknown';
      plan?: Array<{
        operation: 'unmap' | 'delete' | 'delete-field';
        apiName: string;
        fieldName?: string;
        sourceFieldDeveloperName?: string;
        targetFieldDeveloperName?: string;
        developerName?: string;
      }>;
    }>;
  };
};
type DeleteItem = DeleteEnvelope['result']['items'][number];

/** Codes that mean Salesforce is still processing a deletion, not a failure. */
const notSettledCodes: ReadonlySet<string> = new Set([
  'DELETE_PHASE_NOT_SETTLED',
  'IDENTITY_RESOLUTION_NOT_SETTLED',
]);

/**
 * Salesforce is still processing this item's deletion, or the item waits for one in flight.
 * @param {DeleteItem} item Executed item.
 * @returns {boolean} True when the item is still processing.
 */
const stillProcessing = (item: DeleteItem): boolean =>
  item.outcome === 'deletion-processing' ||
  (item.diagnostics ?? []).some((diagnostic) => notSettledCodes.has(diagnostic.code));

type FieldDeleteFlags = {
  metadata?: string[];
  field?: string[];
  preview: boolean;
  'target-org'?: string;
  'api-version'?: string;
  dataspace?: string;
  'output-dir'?: string;
  'changed-since'?: string;
  'delete-dlo'?: boolean;
};

/**
 * Reduce a pair to the names reported in the result; the selector stays internal.
 * @param {DmoFieldPair} pair Planned or removed pair.
 * @returns {{mapping: string, sourceFieldDeveloperName: string, targetFieldDeveloperName: string}} Reported pair.
 */
function reportedPair(pair: DmoFieldPair): NonNullable<DeleteItem['unmappedPairs']>[number] {
  return {
    mapping: pair.mapping,
    sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
    targetFieldDeveloperName: pair.targetFieldDeveloperName,
  };
}

/**
 * Say what a stopped field-level delete had already written and what it had not.
 * @param {DmoFieldDeleteProgress} progress State at the failure.
 * @param {DmoFieldDeletePlan} plan Admitted plan.
 * @returns {string} Next action built only from validated identifiers.
 */
function fieldDeleteStop(progress: DmoFieldDeleteProgress, plan: DmoFieldDeletePlan): string {
  const fields = plan.fields.join(', ');
  const stop =
    progress.step === 'recheck'
      ? 'Nothing was written; no field or mapping pair was removed.'
      : progress.step === 'remove'
        ? `The Metadata API destructive change for ${fields} was sent once and is not confirmed; read the DMO and its mappings before another attempt.`
        : `The Metadata API destructive change for ${fields} was acknowledged, but the result was not confirmed: the field(s) gone, exactly their mapping pairs dropped, everything else unchanged. Read the DMO and its mappings before another attempt.`;
  return `${stop} No local file was refreshed. No retry or rollback.`;
}

/**
 * Word the human output of one field-level delete item.
 * @param {DeleteItem} item Item carrying `fields`.
 * @returns {string[]} Lines in the order the work ran.
 */
function fieldDeleteLines(item: DeleteItem): string[] {
  const name = item.identity.apiName;
  const fields = (item.fields ?? []).join(', ');
  const lines: string[] = [];
  if (item.operation === 'preview') {
    if (item.outcome !== 'delete')
      lines.push(`Blocked: dmo:${name} field ${fields}; mutation: ${item.mutation}.`);
    for (const step of item.plan ?? [])
      lines.push(
        step.operation === 'unmap'
          ? `Planned pair drop (Salesforce removes it with the field): ${step.sourceFieldDeveloperName} -> ${step.targetFieldDeveloperName} in mapping ${step.apiName}.`
          : `Planned field delete: ${step.fieldName} from dmo ${name}.`,
      );
    for (const file of item.localFiles ?? [])
      lines.push(
        file.exists
          ? `Planned file refresh: ${file.path}`
          : `Not present locally, not created: ${file.path}`,
      );
    return lines;
  }
  for (const pair of item.unmappedPairs ?? [])
    lines.push(
      `dropped pair ${pair.sourceFieldDeveloperName} -> ${pair.targetFieldDeveloperName} in mapping ${pair.mapping}`,
    );
  if (item.removedFields?.length)
    lines.push(`deleted field ${item.removedFields.join(', ')} from dmo ${name}`);
  else
    lines.push(
      `${item.outcome === 'blocked' ? 'Blocked' : item.outcome === 'deletion-unconfirmed' ? 'Unconfirmed' : 'Failed'}: dmo:${name} field ${fields}; mutation: ${item.mutation}.`,
    );
  for (const file of item.refreshedFiles ?? [])
    lines.push(
      file.outcome === 'refreshed'
        ? `refreshed ${file.path}`
        : file.outcome === 'unchanged'
          ? `unchanged ${file.path}`
          : file.outcome === 'not-present'
            ? `not present locally, not created: ${file.path}`
            : `refresh failed (${file.code}): ${file.path}`,
    );
  return lines;
}

/** Delete exact native DLO definitions, or preview without mutation. */
export default class Delete extends SfCommand<DeleteEnvelope> {
  public static readonly aliases = ['datacloud:delete', 'd360:delete', 'dc:delete'];
  public static readonly summary =
    'Delete exact Data360 Transforms, Segments, IR owners, streams, DLOs, DMOs, single custom DMO fields or mappings.';
  public static readonly description =
    "One delete can carry any mix of families, each named exactly with -m. It runs them in reverse dependency order, one phase after the other: graphs, then identity resolution, calculated insights and Segments (a dependent before the component it needs, including a graph or CI/Segment on the unified DMO of a selected IR), then data transforms, then relationships, mappings, DMOs and DLOs, then data streams. A phase starts only after every item of the previous one settled; a blocked, failed or unconfirmed item stops the run, and an item Salesforce is still processing stops the later phases with DELETE_PHASE_NOT_SETTLED (status processing, exit 69, when nothing failed). A -m delete needs no confirmation flag: check the selection with --preview first. Before the first delete, the current definition of each selected transform, Segment, IR, CI and graph is read from the org by its name (read-only); one the org does not have reports unchanged. A transform name resolves to its target ID through the complete transform list: no match is unchanged, two or more matches (ignoring case) are refused with TRANSFORM_TARGET_NOT_RESOLVED. --changed-since <ref> selects the canonical plugin files deleted since the merge base with that reference (every family; changed files are ignored) and deletes their components in the same phase order. Identity and definition come from each file's base content; a path present again is not a delete, while a rename (also one split across commit, index and worktree), an unstaged deletion or a deleted file of no known family blocks before any org call (BLOCKED_GIT_LIFECYCLE). A --changed-since delete needs --confirm-delete (--preview runs without it; --confirm-delete is accepted only with --changed-since), takes no -m or --delete-dlo, and removes no local file. A deleted data transform is resolved by its name like a -m one; a relationship takes its source DMO from the base content; a stream file deleted together with its landing DLO file deletes the stream with its DLO. --preview runs every phase read-only and reports an item whose selected dependents an earlier phase deletes as planned-dependencies (DEPENDENCIES_PLANNED) without checking it further. A stream selected together with its landing DLO is deleted with --delete-dlo semantics and the DLO item reports removedWith the stream; the last mapping of a custom DMO selected together with that DMO is not sent on its own and reports removedWith the DMO; it reports deleted only once its own read answers 404 after the DMO deletion, otherwise deletion-unconfirmed (MAPPING_DELETION_UNCONFIRMED). data-transform:Name uses auto/API68 in the run data space (TRANSFORM_DATASPACE_MISMATCH for another). Preview is GET-only. A target of any owner or namespace is deleted with one native DELETE (Salesforce decides; a 4xx answer is reported as rejected); one whose status is PROCESSING is refused before it (TRANSFORM_DELETE_PROCESSING, in --preview too); settlement needs complete bounded inventory omission of both ID and name, otherwise the result is deletion-unconfirmed (never replay). No DLO, run or data cleanup; exhaustive external-consumer exclusion is not established. segment:Name uses auto/API68 in the run data space (the stored name, <prefix>_<Name> outside default; SEGMENT_DATASPACE_MISMATCH for another). Fresh source bindings and exact runtime/private identity are checked before one native DELETE. Only independent absence or a preserved DELETING/PROCESSING read acknowledges the result; HTTP204 alone is insufficient. No replay, Segment XML, shared-DMO deletion or physical-output cleanup guarantee. identity-resolution:ObjectApiName uses auto/API68 in the run data space (the stored name, <prefix>_<type>_<rulesetId> outside default; IDENTITY_RESOLUTION_DATASPACE_MISMATCH for another) and deletes a present owner that is not PUBLISHING or DELETING. A fresh target-local ID is resolved before one native68 DELETE; bounded exact ID/name absence confirms owner-definition deletion only. Exhaustive external-consumer exclusion and physical profile/output cleanup remain unverified. IR never cascades, runs processing, replays writes or falls back to another API. data-graph:Name uses auto/API68 in the run data space (graph names are unique in the org; DATA_GRAPH_DATASPACE_MISMATCH for a graph of another). Fresh identity, created date, definition, root and ready checks plus explicit empty native dependency/related-segment arrays are mandatory. A draft graph (never built, retrieved as-is) is deleted by name with the same scope and dependency checks. Exhaustive external-consumer exclusion remains unverified; no generated-resource cleanup, storage or credit guarantee. A Graph delete never cascades. calculated-insight:Name__cio uses --api-version auto (68.0) or 68.0 in the run data space (the GET must name it, CI_IDENTITY_CHANGED otherwise). The insight is read by name with the API 68 GET (absent is unchanged; it must answer with that name and data space), deleted with one DELETE in any status, schedule or SQL (Salesforce decides; a 4xx answer is reported as rejected), then read until it answers 404. CI never cascades; no compute, storage or credits guarantee. Exact data-stream:ApiName selects guarded IngestApi stream deletion at auto/API68 in the run data space (its DLO must belong to it). The linked DLO is preserved by default; --delete-dlo explicitly acknowledges deleting that exclusively linked DLO. Selected stream and linked DLO checks only, not unrelated-org preservation. Native routes default to API68; explicit numeric pins are preserved. Relationship deletion (relationship:SourceDmo__dlm:Name; a bare relationship:Name is refused with INVALID_SELECTION) runs first in its phase, before mappings, DMOs and DLOs. The relationships of the named source DMO are listed and the name is looked up ignoring letter case: no match is unchanged, two matches are refused (AMBIGUOUS_RELATIONSHIP_TARGET), and a match whose source object is another DMO is refused (RELATIONSHIP_TARGET_BINDING_MISMATCH). In a --changed-since delete the source DMO and binding come from the deleted file, and when its name is absent but the binding exists under another name the delete is refused with RELATIONSHIP_NAME_MISMATCH. Otherwise one DELETE is sent and its absence confirmed by listing again; a 4xx answer is reported as rejected. --preview only lists. A mapping:Name with a valid local data360/mapping/Name.mapping-meta.json file (with --changed-since, the deleted file's base content) is found in the org the way deploy finds it: by the file's source DLO and target DMO, whatever Salesforce named it (the org name is reported as targetApiName). No org mapping with that binding is unchanged; two or more are refused with AMBIGUOUS_MAPPING_TARGET before any write. Otherwise the exact name is read, and a mapping that reads absent (404) reports unchanged. Mapping deletion runs at native API 61 and up (default 68) and deletes the whole mapping with one Metadata API destructive deployment (ObjectSourceTargetMap), whatever pairs it holds, also onto a standard DMO (Salesforce refuses the last mapping onto a standard DMO copy in a data space other than default; a Failed destructive deployment is reported as rejected). Afterwards the mapping must read absent and the other mappings and the fields of the DMO must be unchanged. The last mapping of a custom DMO is refused before any write (MAPPING_LAST_MAPPING_DELETE_BLOCKED) because Salesforce does not delete it; delete the DMO instead, which removes its mapping. Qualification uses empty custom fixtures, not populated-data guarantees. --preview performs zero writes and reports the planned step. Any partial failure stops the batch; no retries or rollback. Whole-DMO deletion is sent for every DMO, a standard one (creationType Standard) and one read without a creationType included, and Salesforce decides: a 4xx answer is reported as rejected (for example, Salesforce refuses to delete a platform-generated DMO while the identity resolution or graph that owns it exists). Field-level delete: exactly one dmo:Name__dlm with one or more --field Name__c removes the named fields from that DMO. It is the one delete operation that changes mappings it was not given and writes project files. Reads first: every field must exist on the DMO. Any field but the primary key may be named, also the standard, system and generated fields of any DMO: Salesforce decides, and a refused destructive change is reported as rejected. This is the only command that removes such platform-owned fields; every mapping pair targeting a named field is collected, and a mapped field is refused only when the mapping list fails; one that no mapping lists a pair for has no pair to lose and is removed. Then one Metadata API destructive change for all fields, sent once and never retried; Salesforce drops the mapping pairs of the removed fields itself. Fresh reads right before it must still match the plan, and polled reads afterwards must show the fields absent, exactly the collected pairs gone and every other mapping, pair, DMO property and field unchanged; any other difference fails with DMO_FIELD_REMOVAL_SIDE_EFFECT. Nothing is rolled back. After success the existing data360/dmo and data360/mapping files under --output-dir (default: current directory) are overwritten with the current definitions; absent files are not created and no file is deleted. A failed file refresh keeps the confirmed org result and the run is partial (exit 68, LOCAL_REFRESH_FAILED). --field --preview writes nothing and reports pairs, fields and files. --field cannot be combined with another selector, --changed-since or --delete-dlo. Local files: after a confirmed deletion (deleted, or a DLO, DMO, Segment or IR Salesforce accepted and is still deleting) the component's own local file is removed by default, one regular file at a time at its canonical path and never a folder: data360/dlo, data360/dmo, data360/relationship, data360/data-stream, data360/dataTransforms, data360/identityResolution and data360/dataGraphs files, both files of a CI (data360/calculatedInsights/Name__cio.calculatedInsight-meta.json and .calculatedInsight-meta.sql) and the Segment files (data360/segments/Name.segment.json and every Name.segment.*.sql beside it) under the current directory (with --delete-dlo also the linked DLO's file), and the mapping file of that name or the one whose binding matches. Links, hard-linked files and paths outside those folders are refused. Nothing is removed on --preview, which lists the files instead, nor for unchanged, blocked, failed, rejected or unconfirmed deletions. --keep-local-files keeps them. A failed removal keeps the confirmed org result and the run is partial (exit 68) with LOCAL_FILE_REMOVAL_FAILED when a deletion is confirmed, otherwise processing (exit 69).";
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      exclusive: ['changed-since'],
      summary:
        'Exact data-transform:Name, segment:Name, identity-resolution:ObjectApiName, calculated-insight:Name__cio, data-graph:Name, data-stream:ApiName, dlo:Name__dll, dmo:Name__dlm (alone with --field), mapping:ApiName or relationship:SourceDmo__dlm:Name; repeatable.',
    }),
    'api-version': Flags.string({
      summary: 'Native numeric route >=61, default/auto68.',
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary:
        'The run data space; omitted means default, and the org must have it. --data-space is a compatibility alias. A component of another data space is refused, a stream is deleted when its DLO belongs to the run data space, and a DLO that also belongs to another data space is not deleted, also with --delete-dlo (DLO_DELETE_OTHER_DATASPACES).',
    }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
    'changed-since': Flags.string({
      summary:
        'Delete in the org the components whose canonical plugin files were deleted since the merge base with a commit reference; needs --confirm-delete (not with --preview).',
      exclusive: ['metadata'],
    }),
    'confirm-delete': Flags.boolean({
      dependsOn: ['changed-since'],
      summary:
        'With --changed-since only: delete the components of the files deleted in the Git range. Not needed with --preview.',
    }),
    'delete-dlo': Flags.boolean({
      default: false,
      summary:
        'Stream-only acknowledgement: delete the exclusively linked DLO; otherwise preserve it.',
    }),
    field: Flags.string({
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Field-level delete: exact custom field Name__c to remove from the one selected dmo:Name__dlm, together with its mapping pairs; repeatable.',
    }),
    'output-dir': Flags.directory({
      exists: false,
      summary:
        'With --field only: project root whose existing DMO and mapping files are refreshed; defaults to the current directory.',
    }),
    'keep-local-files': Flags.boolean({
      default: false,
      summary:
        'Keep the local file of each deleted component. By default a confirmed deletion removes it; no effect with --field.',
    }),
  };
  protected deleteDataTransform = deleteDataTransform;
  protected createDataTransformClient = createDataTransformClient;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
  protected selectGitInputs = selectGitDeployInputs;
  protected deleteIdentityResolution = deleteIdentityResolution;
  protected deleteSegment = deleteSegment;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected deleteCalculatedInsight = deleteCalculatedInsight;
  /** The org ID of the connection this run resolved (provenance only); unset before that. */
  private resolvedOrgId?: string;
  // No configured or resolvable org is TARGET_ORG_REQUIRED, as in publish.
  protected resolveConnection = async (alias?: string): Promise<Connection> => {
    try {
      const aggregator = await ConfigAggregator.create();
      const state = await StateAggregator.getInstance();
      const target = alias ?? aggregator.getPropertyValue<string>('target-org');
      return await Connection.create({
        authInfo: await AuthInfo.create({
          username: target ? state.aliases.resolveUsername(target) : undefined,
        }),
        connectionOptions: { version: '68.0' },
      });
    } catch {
      throw new DloError('TARGET_ORG_REQUIRED');
    }
  };
  /**
   * Resolve the target org's connection and remember its org ID for the envelope's provenance.
   * @param {string} [alias] Target org alias or username.
   * @returns {Promise<Connection>} The resolved connection.
   */
  private async connectTarget(alias?: string): Promise<Connection> {
    const connection = await this.resolveConnection(alias);
    // A test seam may return a connection without auth info fields: no org ID then.
    const seam = connection as Partial<Pick<Connection, 'getAuthInfoFields'>>;
    this.resolvedOrgId = seam.getAuthInfoFields?.().orgId;
    return connection;
  }
  // Read-only: the landing DLO a selected stream owns, when its DLO is selected too.
  protected readStreamLinkedDlo = readStreamLinkedDlo;
  protected preflightDeleteDataStream = preflightDeleteDataStream;
  protected executeDeleteDataStream = executeDeleteDataStream;
  protected createDataStreamClients = async (
    target: string,
    version: string,
  ): Promise<Parameters<typeof executeDeleteDataStream>[1]> => {
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({ username: target }),
      connectionOptions: { version },
    });
    const reader = new ConnectClient(connection, version);
    return {
      // DELETE (including the DLO cascade) is sent once on this same bound Connection.
      streams: createDataStreamClient(
        target,
        reader,
        version,
        openBoundSsot(target, version, async () => connection),
      ),
      ...createDataStreamReferenceReader(reader, version),
      dlo: {
        get: (identity) =>
          reader.get(
            `/services/data/v${version}/ssot/data-lake-objects/${encodeURIComponent(identity)}`,
          ),
      },
    };
  };
  protected createMappingClient = createMappingClient;
  // Mapping delete GET/DELETE share one bound Connection per selector; tests replace this seam.
  protected createMappingSender = (target: string, version: string): BoundSsot =>
    openBoundSsot(target, version);
  protected preflightDeleteMapping = preflightDeleteNativeMapping;
  protected deleteMapping = deleteNativeMapping;
  // A mapping removed with its DMO reports deleted only once its own read answers 404.
  protected confirmMappingAbsent = confirmNativeMappingAbsent;
  /**
   * The authored mapping file of that name, if one is there: its binding names the org mapping.
   * Like deploy, its identity.apiName must be its file name; a file that is there but is not a
   * valid mapping is refused (INVALID_SOURCE) instead of falling back to the exact org name.
   * @param {string} file Canonical path data360/mapping/<name>.mapping-meta.json.
   * @returns {Promise<NativeMappingDocument | undefined>} The validated file; undefined without one.
   */
  protected async readAuthoredMapping(file: string): Promise<NativeMappingDocument | undefined> {
    let present: boolean;
    try {
      const stat = await lstat(file);
      present = stat.isFile();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      present = false;
    }
    const name = path.basename(file).slice(0, -'.mapping-meta.json'.length);
    try {
      if (!present) throw new Error('Not a file');
      const value = JSON.parse(await readFile(file, 'utf8')) as unknown;
      // A verbatim file (retrieved as-is) names no binding: the mapping is deleted by its name.
      if (isVerbatimDocument(value, 'mapping') && value.identity.apiName === name) return undefined;
      const document = validateNativeMappingDocument(value, 'retrieve');
      if (document.identity.apiName !== name) throw new Error('Identity mismatch');
      return document;
    } catch {
      const error = new DeployInputError('INVALID_SOURCE');
      replaceExplanation(
        error,
        `The mapping file ${file} is not a valid mapping whose identity.apiName is ${name}, so it names no org mapping. Correct or remove the file, then rerun.`,
      );
      throw error;
    }
  }
  protected createRelationshipClient = createRelationshipClient;
  protected preflightDeleteRelationship = preflightDeleteNativeRelationship;
  protected deleteRelationship = deleteNativeRelationship;
  // Relationship list/DELETE share one bound Connection per selector; tests replace this seam.
  protected createRelationshipSender = (target: string, version: string): BoundSsot =>
    openBoundSsot(target, version);
  // Field-level delete: the only DMO client with the Metadata API route for removeFields.
  protected createDmoClient = createDmoClient;
  protected writeNativeDmo = writeNativeDmoDocument;
  protected writeNativeMapping = writeNativeMappingDocument;
  // Field-level delete readback attempts and spacing; tests replace it to avoid waiting.
  protected fieldRemovalSettle: NativeDmoSettle | undefined;
  protected createDmoNativeDeleteClient = createNativeDmoDeleteClient;
  protected retrieveDmo = previewDeleteNativeDmo;
  protected deleteDmo = deleteNativeDmo;
  protected createDloClient = createDloClient;
  protected createDloNativeDeleteClient = createNativeDloDeleteClient;
  // The once-per-run data space list read; tests replace this seam or the directory read.
  protected createDataSpaceSender = (target: string, version: string): BoundSsot =>
    openBoundSsot(target, version);
  protected retrieveDlo = previewDeleteNativeDlo;
  protected deleteDlo = deleteNativeDlo;
  protected resolveTarget = async (alias?: string): Promise<string> => {
    const connection = await this.connectTarget(alias);
    const username = connection.getUsername();
    if (!username) throw new DloError('TARGET_ORG_REQUIRED');
    return username;
  };
  /**
   * Read-only: a -m source-family component's current definition, read from the org by name.
   * @param {DeleteFamily} family Source family of the selector.
   * @param {string} name Exact name from the selector.
   * @param {Connection} connection API68 connection of the target org.
   * @param {string} [dataSpace] The run's data space.
   * @returns {Promise<AdmittedSource>} The definition, or absent.
   */
  protected async readDeleteSource(
    family: DeleteFamily,
    name: string,
    connection: Connection,
    dataSpace = 'default',
  ): Promise<AdmittedSource> {
    return readOrgSource(
      family,
      name,
      connection,
      {
        transformClient: this.createDataTransformClient ?? createDataTransformClient,
        ciContext: this.calculatedInsightContext ?? calculatedInsightReadContext,
        graphContext: this.nativeGraphContext ?? nativeDataGraphReadContext,
      },
      dataSpace,
    );
  }

  /**
   * Read-only: what a verbatim file deleted in a Git range deletes. It is the file itself (type,
   * data space and name); a transform also carries the target ID its name resolves to.
   * @param {VerbatimDocument} document Base content of the deleted verbatim file.
   * @param {Connection} connection API68 connection of the target org.
   * @returns {Promise<AdmittedSource>} The verbatim definition, or absent.
   */
  protected async verbatimDeleteSource(
    document: VerbatimDocument,
    connection: Connection,
  ): Promise<AdmittedSource> {
    if (document.kind !== 'data-transform') return { desired: document };
    const targetId = await resolveDataTransformTargetId(
      (this.createDataTransformClient ?? createDataTransformClient)(
        connection,
        '68.0',
        verbatimDataSpace(document),
      ),
      document.identity.apiName,
    );
    return targetId === undefined
      ? { absent: true }
      : { desired: document, transformTargetId: targetId };
  }

  /**
   * Field-level delete: remove the named custom fields from one DMO, their mapping pairs first,
   * then refresh the project files that already exist. Never throws; the envelope is completed.
   * @param {FieldDeleteFlags} flags Parsed flags.
   * @param {DeleteEnvelope} envelope Envelope to complete.
   * @returns {Promise<void>} Resolves when the envelope is final.
   */
  private async deleteDmoFields(flags: FieldDeleteFlags, envelope: DeleteEnvelope): Promise<void> {
    const refuse = (code: string, message: string): void => {
      envelope.diagnostics.errors.push({ code, message, retryable: false });
    };
    const selector = flags.metadata?.[0] ?? '';
    if (
      !flags.field?.length ||
      flags.metadata?.length !== 1 ||
      !selector.startsWith('dmo:') ||
      !nativeDmoName.test(selector.slice(4)) ||
      flags['changed-since'] !== undefined ||
      flags['delete-dlo']
    )
      return refuse(
        'INVALID_FIELD_DELETE_SELECTION',
        '--field removes fields from exactly one -m dmo:<Name__dlm> and cannot be combined with another selector, --changed-since or --delete-dlo; --output-dir is valid only with --field. No org call was made.',
      );
    if (flags.field.some((name) => !nativeDmoFieldName.test(name)))
      return refuse(
        'INVALID_DMO_FIELD',
        '--field takes exact custom field API names ending in __c. No org call was made.',
      );
    let version: string;
    try {
      version = nativeApiVersion(flags['api-version']);
    } catch {
      return refuse(
        'INVALID_SCOPE',
        '--api-version must be auto or a numeric version from 61.0. No org call was made.',
      );
    }
    envelope.metadata.apiVersion = version;
    const apiName = selector.slice(4);
    const fields = [...new Set(flags.field)];
    // The run's data space, always explicit: --dataspace, or default.
    const effectiveScope = flags.dataspace ?? 'default';
    const root = path.resolve(flags['output-dir'] ?? process.cwd());
    const item: DeleteItem = {
      family: 'dmo',
      identity: { dataSpace: effectiveScope, apiName },
      operation: flags.preview ? 'preview' : 'delete-field',
      fields,
      outcome: 'blocked',
      mutation: 'not-attempted',
      routes: [
        { operation: 'dmo.get', transport: 'native', apiVersion: version },
        { operation: 'mapping.list', transport: 'native', apiVersion: version },
        { operation: 'mapping.get', transport: 'native', apiVersion: version },
        { operation: 'dmo.field.delete', transport: 'metadata', apiVersion: version },
      ],
    };
    envelope.result.items.push(item);
    const fieldError = (error: unknown, nextAction: string): void =>
      refuse(
        error instanceof DataSpaceError ||
          error instanceof DloError ||
          error instanceof NativeDmoError ||
          error instanceof NativeMappingError
          ? error.code
          : 'DELETE_FAILED',
        operationDiagnostic(error, nextAction),
      );
    let clients: DmoFieldDeleteClients;
    let plan: DmoFieldDeletePlan;
    try {
      const target = await this.resolveTarget(flags['target-org']);
      if (this.resolvedOrgId) envelope.provenance.targetOrgId = this.resolvedOrgId;
      // The run's data space must exist in the org: one read, before any other read.
      await dataSpaceCheckOf(this, async () =>
        (this.createDataSpaceSender ?? openBoundSsot)(target, '68.0'),
      ).require([effectiveScope]);
      clients = {
        dmo: this.createDmoNativeDeleteClient(target, version),
        remover: (this.createDmoClient ?? createDmoClient)(target, version),
        mappings: (this.createMappingClient ?? createMappingClient)(
          target,
          version,
          undefined,
          effectiveScope,
          this.createMappingSender(target, version),
        ),
        // Read only to refresh a mapping file without the pairs Salesforce generated.
        source: (this.createDloNativeDeleteClient ?? createNativeDloDeleteClient)(target, version),
      };
      plan = await planDmoFieldDelete(apiName, fields, clients, effectiveScope);
      item.identity.dataSpace = plan.dataSpace;
      if (flags.preview) {
        const files = await dmoFieldLocalFiles(plan, root);
        const present = await Promise.all(files.map(async (file) => localFileExists(file.path)));
        item.plan = [
          ...plan.mappings.flatMap(({ pairs }) =>
            pairs.map((pair) => ({
              operation: 'unmap' as const,
              apiName: pair.mapping,
              sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
              targetFieldDeveloperName: pair.targetFieldDeveloperName,
              developerName: pair.developerName,
            })),
          ),
          ...fields.map((fieldName) => ({
            operation: 'delete-field' as const,
            apiName,
            fieldName,
          })),
        ];
        item.localFiles = files.map((file, index) => ({
          path: file.path,
          exists: present[index],
        }));
        item.outcome = 'delete';
        envelope.status = 'success';
        return;
      }
    } catch (error) {
      return fieldError(
        error,
        'No write attempted; correct the reported check before another attempt.',
      );
    }
    const progress: DmoFieldDeleteProgress = {
      step: 'recheck',
      unmappedPairs: [],
      removalSent: false,
    };
    try {
      await executeDmoFieldDelete(plan, clients, progress, effectiveScope, this.fieldRemovalSettle);
    } catch (error) {
      item.unmappedPairs = [];
      item.removedFields = [];
      if (progress.step === 'readback') {
        item.outcome = 'deletion-unconfirmed';
        item.mutation = 'acknowledged';
      } else if (progress.removalSent) {
        item.outcome = 'failed';
        // Salesforce's refusal of the destructive change applied nothing.
        item.mutation =
          progress.step === 'remove' && error instanceof NativeDmoError && error.rejected
            ? 'rejected'
            : 'unknown';
      }
      envelope.status = item.outcome === 'blocked' ? 'blocked' : 'failed';
      return fieldError(
        error,
        item.mutation === 'rejected'
          ? 'Salesforce refused the Metadata API destructive change; nothing was removed. No local file was refreshed. No retry or rollback.'
          : fieldDeleteStop(progress, plan),
      );
    }
    item.outcome = 'deleted';
    item.mutation = 'confirmed-deleted';
    item.removedFields = fields;
    item.unmappedPairs = progress.unmappedPairs.map((pair) => reportedPair(pair));
    // Only now, after every org step is confirmed, are existing project files refreshed.
    item.refreshedFiles = await refreshDmoFieldFiles(
      plan,
      root,
      clients,
      {
        dmo: this.writeNativeDmo ?? writeNativeDmoDocument,
        mapping: this.writeNativeMapping ?? writeNativeMappingDocument,
      },
      effectiveScope,
    );
    const failed = item.refreshedFiles.filter((file) => file.outcome === 'failed');
    if (failed.length === 0) {
      envelope.status = 'success';
      return;
    }
    envelope.status = 'failed';
    refuse(
      'LOCAL_REFRESH_FAILED',
      `The field(s) ${fields.join(', ')} were deleted from ${apiName} in the org, but ${failed.length === 1 ? 'this project file was' : 'these project files were'} not refreshed: ${failed.map((file) => `${file.path} (${file.code})`).join('; ')}. Do not repeat the delete; refresh with sf data360 retrieve.`,
    );
  }

  /**
   * Delete or preview one relationship by name. The source DMO, named in the selector (or with
   * Git in the deleted file's base content), is listed to find it before, and to confirm its
   * absence after, the single DELETE.
   * @param {string} selector Exact relationship:SourceDmo__dlm:Name (Git: relationship:Name) selector.
   * @param {string} target Resolved username.
   * @param {string} version Native API version.
   * @param {boolean} preview Read-only when true.
   * @param {string} effectiveScope The run's data space.
   * @param {DeleteEnvelope} envelope Envelope receiving the item.
   * @param {Map<DeleteItem, string>} selectorsByItem Human labels.
   * @param {Function} track Registers the item's local file for removal or preview.
   * @param {NativeRelationshipDocument} [baseDocument] Git delete: the file's base content.
   * @param {object} [baseNames] Git delete of a verbatim file: the relationship is then found by
   * name under its source DMO, like -m.
   * @param {string} baseNames.sourceDmo Source DMO the verbatim file keeps.
   * @param {string} baseNames.apiName Relationship name.
   * @returns {Promise<void>} Resolves when the item settled; throws to stop the batch.
   */
  private async deleteOneRelationship(
    selector: string,
    target: string,
    version: string,
    preview: boolean,
    effectiveScope: string,
    envelope: DeleteEnvelope,
    selectorsByItem: Map<DeleteItem, string>,
    track: (item: DeleteItem, candidates: LocalFileCandidate[]) => Promise<void>,
    baseDocument?: NativeRelationshipDocument,
    baseNames?: { sourceDmo: string; apiName: string },
  ): Promise<void> {
    const [sourceDmo, selectedName] =
      baseDocument === undefined
        ? baseNames === undefined
          ? selector.slice('relationship:'.length).split(':')
          : [baseNames.sourceDmo, baseNames.apiName]
        : [baseDocument.spec.sourceObjectName, baseDocument.identity.apiName];
    const item: DeleteItem = {
      family: 'relationship',
      identity: { dataSpace: effectiveScope, apiName: selectedName },
      operation: preview ? 'preview' : 'delete',
      outcome: 'blocked',
      mutation: 'not-attempted',
    };
    selectorsByItem.set(item, selector);
    envelope.result.items.push(item);
    let dispatched = false;
    // Salesforce's own 4xx answer to the DELETE means nothing was deleted.
    let refusal: unknown;
    try {
      const base = (this.createRelationshipClient ?? createRelationshipClient)(
        target,
        version,
        effectiveScope,
        (this.createRelationshipSender ?? openBoundSsot)(target, version),
      );
      const client = {
        list: base.list,
        remove: async (name: string): Promise<void> => {
          dispatched = true;
          try {
            await base.remove(name);
          } catch (error) {
            if (
              error instanceof NativeRelationshipError &&
              error.code === 'RELATIONSHIP_HTTP_ERROR' &&
              typeof error.status === 'number' &&
              error.status >= 400 &&
              error.status < 500
            )
              refusal = error;
            throw error;
          }
        },
      };
      // -m: the relationship as the org lists it under its source DMO; none of that name is absent.
      const document =
        baseDocument ??
        (await findNativeRelationshipByName(sourceDmo, selectedName, client, effectiveScope));
      if (document === undefined) {
        item.outcome = 'unchanged';
        return;
      }
      const apiName = document.identity.apiName;
      item.identity.apiName = apiName;
      const files = [
        {
          path: path.join(
            process.cwd(),
            'data360',
            'relationship',
            `${apiName}.relationship-meta.json`,
          ),
          boundary: path.join(process.cwd(), 'data360'),
        },
      ];
      if (preview) {
        const plan = await (this.preflightDeleteRelationship ?? preflightDeleteNativeRelationship)(
          apiName,
          document,
          client,
          effectiveScope,
        );
        item.outcome = plan.present ? 'delete' : 'unchanged';
        await track(item, files);
        return;
      }
      const result = await (this.deleteRelationship ?? deleteNativeRelationship)(
        apiName,
        document,
        client,
        effectiveScope,
      );
      item.outcome = result.outcome;
      if (result.outcome === 'deleted') item.mutation = 'confirmed-deleted';
      await track(item, files);
    } catch (error) {
      item.outcome = dispatched ? 'failed' : 'blocked';
      item.mutation =
        refusal !== undefined && refusal === error
          ? 'rejected'
          : dispatched
            ? 'unknown'
            : 'not-attempted';
      envelope.status = dispatched ? 'failed' : 'blocked';
      throw error;
    }
  }

  /**
   * Execute the selection in dependency order (relationships, mappings, DMOs, DLOs), stopping on
   * the first error.
   * @returns {Promise<DeleteEnvelope>} Payload-free deletion evidence.
   */
  public async run(): Promise<DeleteEnvelope> {
    const { flags } = await this.parse(Delete);
    const effectiveScope = flags.dataspace ?? 'default';
    const envelope: DeleteEnvelope = {
      contract: 'sf-data360-delete',
      contractVersion: '1.1.0',
      status: 'blocked',
      metadata: {
        operation: 'delete',
        preview: flags.preview,
        apiVersion: flags['api-version'] ?? 'auto',
        plugin,
      },
      provenance: {
        command: 'sf data360 delete',
        generatedAt: new Date().toISOString(),
        // eslint-disable-next-line unicorn/no-null -- Stable JSON represents unresolved target identity explicitly.
        targetOrgId: null,
      },
      diagnostics: { warnings: [], errors: [] },
      result: { scope: { dataSpace: effectiveScope }, items: [] },
    };
    const selectorsByItem = new Map<DeleteEnvelope['result']['items'][number], string>();
    const keepLocalFiles = flags['keep-local-files'];
    const changedSince = flags['changed-since'];
    // A file deleted in the Git range is already gone: no local file is listed or removed.
    const gitMode = changedSince !== undefined;
    const projectData = path.join(process.cwd(), 'data360');
    // The local files of each item; removed once its deletion is confirmed.
    const localFiles = new Map<DeleteItem, LocalFileCandidate[]>();
    const inProject = (...segments: string[]): LocalFileCandidate => ({
      path: path.join(projectData, ...segments),
      boundary: projectData,
    });
    // The canonical local files of a transform, CI (JSON and SQL), Segment, IR or graph, by name,
    // all under data360/ of the current directory.
    const sourceFiles = async (
      family: DeleteFamily,
      name: string,
    ): Promise<LocalFileCandidate[]> => {
      if (gitMode) return [];
      switch (family) {
        case 'data-transform': {
          return [inProject('dataTransforms', `${name}.dataTransform.json`)];
        }
        case 'calculated-insight': {
          return [
            inProject('calculatedInsights', `${name}.calculatedInsight-meta.json`),
            inProject('calculatedInsights', `${name}.calculatedInsight-meta.sql`),
          ];
        }
        case 'segment': {
          // The JSON and every `<Name>.segment.<model>.sql` beside it.
          const directory = path.join(projectData, 'segments');
          let entries: string[] = [];
          try {
            entries = await readdir(directory);
          } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          // Matched ignoring case, like the reader and the writer.
          const prefix = `${name}.segment.`.toLowerCase();
          const sql = entries.filter((entry) => {
            const lower = entry.toLowerCase();
            return lower.startsWith(prefix) && lower.endsWith('.sql');
          });

          sql.sort();
          return [
            inProject('segments', `${name}.segment.json`),
            ...sql.map((entry) => inProject('segments', entry)),
          ];
        }
        case 'identity-resolution': {
          return [inProject('identityResolution', `${name}.identityResolution.json`)];
        }
        default: {
          return [inProject('dataGraphs', `${name}.native-dataGraph.json`)];
        }
      }
    };
    const track = async (item: DeleteItem, candidates: LocalFileCandidate[]): Promise<void> => {
      if (gitMode) return;
      if (item.operation !== 'preview') {
        localFiles.set(item, candidates);
        return;
      }
      if (keepLocalFiles || item.outcome !== 'delete' || candidates.length === 0) return;
      item.localFiles = await Promise.all(
        candidates.map(async (file) => ({
          path: file.path,
          exists: await localFilePresent(file.path),
        })),
      );
    };
    // Confirmed: Salesforce deleted it, or accepted the deletion and is still processing it.
    const removeConfirmedFiles = async (): Promise<void> => {
      for (const [item, candidates] of localFiles) {
        const confirmed =
          (item.outcome === 'deleted' && item.mutation === 'confirmed-deleted') ||
          (item.outcome === 'deletion-processing' && item.mutation === 'acknowledged-processing');
        if (confirmed && candidates.length > 0)
          item.removedLocalFiles = await removeLocalFiles(candidates, keepLocalFiles);
      }
      localFiles.clear();
      const failed = envelope.result.items.flatMap((item) =>
        (item.removedLocalFiles ?? []).filter((file) => file.outcome === 'failed'),
      );
      if (failed.length === 0) return;
      envelope.status = 'failed';
      envelope.diagnostics.errors.push({
        code: 'LOCAL_FILE_REMOVAL_FAILED',
        message: `The deletion in the org is confirmed, but ${failed.length === 1 ? 'this local file was' : 'these local files were'} not removed: ${failed.map((file) => `${file.path} (${file.code})`).join('; ')}. Do not repeat the delete; remove the file yourself.`,
        retryable: false,
      });
    };
    /**
     * Final status of an executed run: an unknown or unconfirmed mutation keeps the run status, a
     * success becoming failed;
     * an item confirmed deleted beside a failed or blocked one is partial, as is a confirmed
     * deletion whose local file was not removed; otherwise a deletion Salesforce is still
     * processing (an item, a phase not settled, an identity resolution in flight) is processing.
     * @returns {string} Envelope status (one of DeleteEnvelope status values).
     */
    const settledStatus = (): DeleteEnvelope['status'] => {
      const { status } = envelope;
      if (flags.preview) return status;
      const executed = envelope.result.items.filter((item) => item.operation !== 'preview');
      if (
        executed.some(
          (item) =>
            item.mutation === 'unknown' ||
            item.mutation === 'acknowledged' ||
            item.outcome === 'deletion-unconfirmed',
        )
      )
        // An unknown mutation never reads as success (exit 1).
        return status === 'success' ? 'failed' : status;
      const { errors } = envelope.diagnostics;
      const written = executed.some((item) => item.mutation === 'confirmed-deleted');
      const failed =
        executed.some(
          (item) =>
            (item.outcome === 'failed' || item.outcome === 'blocked') && !stillProcessing(item),
        ) ||
        // A stop is a failure unless only a deletion still processing or a local file caused it.
        (status !== 'success' &&
          (errors.length === 0 ||
            errors.some(
              (error) =>
                !notSettledCodes.has(error.code) && error.code !== 'LOCAL_FILE_REMOVAL_FAILED',
            )));
      if (failed) return written ? 'partial' : status;
      // Partial needs a confirmed deletion; a file of a deletion still processing waits for it.
      if (written && errors.some((error) => error.code === 'LOCAL_FILE_REMOVAL_FAILED'))
        return 'partial';
      return executed.some((item) => stillProcessing(item)) ||
        errors.some((error) => notSettledCodes.has(error.code))
        ? 'processing'
        : status;
    };
    const finish = async (): Promise<DeleteEnvelope> => {
      await removeConfirmedFiles();
      envelope.status = settledStatus();
      const exitCode = exitCodeOf(envelope);
      if (exitCode !== 0) process.exitCode = exitCode;
      annotateDiagnostics(envelope);
      if (!this.jsonEnabled()) {
        this.log(`Delete${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
        // The default data space goes without saying; any other is named.
        if (effectiveScope !== 'default') this.log(`Data space: ${effectiveScope}.`);
        if (gitMode && envelope.result.items.length === 0 && envelope.status === 'success')
          this.log('No plugin file was deleted in the Git range; nothing to delete.');
        for (const item of envelope.result.items) {
          if (item.fields) {
            for (const line of fieldDeleteLines(item)) this.log(line);
            continue;
          }
          if (item.removedWith) {
            this.log(
              item.operation === 'preview'
                ? `Planned removal with ${item.removedWith}: ${selectorsByItem.get(item)}.`
                : ['deleted', 'deletion-processing'].includes(item.outcome)
                  ? `removed with ${item.removedWith}: ${selectorsByItem.get(item)}`
                  : item.outcome === 'deletion-unconfirmed'
                    ? `Removal with ${item.removedWith} unconfirmed: ${selectorsByItem.get(item)}.`
                    : `Not removed (${item.removedWith} ${item.outcome}): ${selectorsByItem.get(item)}.`,
            );
            for (const file of item.removedLocalFiles ?? [])
              if (file.outcome === 'removed') this.log(`removed local file ${file.path}`);
            continue;
          }
          if (item.outcome === 'planned-dependencies') {
            this.log(`Planned after its dependents: ${selectorsByItem.get(item)}.`);
            for (const diagnostic of item.diagnostics ?? [])
              this.log(`${diagnostic.code}: ${diagnostic.message}`);
            continue;
          }
          const action =
            item.operation === 'preview'
              ? `Planned ${item.outcome}`
              : item.outcome === 'deleted'
                ? 'Deleted'
                : item.outcome === 'unchanged'
                  ? 'Unchanged'
                  : item.outcome === 'failed'
                    ? 'Failed'
                    : item.outcome === 'deletion-unconfirmed'
                      ? 'Unconfirmed'
                      : 'Blocked';
          if (
            ['identity-resolution', 'segment', 'dlo', 'dmo'].includes(
              selectorsByItem.get(item)?.split(':')[0] ?? '',
            ) &&
            ['deleted', 'deletion-processing'].includes(item.outcome)
          )
            this.log(
              `deleted ${selectorsByItem.get(item)?.split(':')[0]} ${item.identity.apiName}${item.mutation === 'acknowledged-processing' ? ' (server is still processing)' : ''}`,
            );
          else if (item.operation !== 'preview' && item.outcome === 'deleted')
            this.log(
              `deleted ${selectorsByItem.get(item)?.split(':')[0]} ${item.identity.apiName}`,
            );
          else this.log(`${action}: ${selectorsByItem.get(item)}; mutation: ${item.mutation}.`);
          if (item.operation === 'preview' && item.plan?.length)
            this.log(`Planned mapping delete: ${item.identity.apiName}.`);
          for (const file of item.localFiles ?? [])
            if (file.exists) this.log(`Planned local file removal: ${file.path}`);
          for (const file of item.removedLocalFiles ?? [])
            switch (file.outcome) {
              case 'removed': {
                this.log(`removed local file ${file.path}`);
                break;
              }
              case 'kept': {
                this.log(`kept local file ${file.path}`);
                break;
              }
              case 'failed': {
                this.log(`local file removal failed (${file.code}): ${file.path}`);
                // No default
                break;
              }
            }
        }
        for (const diagnostic of envelope.diagnostics.errors)
          this.log(formatDiagnostic(diagnostic));
      }
      return envelope;
    };
    const pushError = (error: unknown): void => {
      if (error instanceof GitSelectionError) {
        envelope.diagnostics.errors.push({
          code: error.code,
          message:
            error.code === 'BLOCKED_GIT_LIFECYCLE'
              ? // Raised before a phase starts, after earlier phases may already have deleted items.
                envelope.result.items.some(
                  (item) => item.outcome === 'deleted' || item.mutation === 'confirmed-deleted',
                )
                ? 'A file deleted in the Git range is present again, so this phase and the later ones did not start. The items listed before it were deleted. Stage or resolve the change, then rerun; items already deleted report unchanged.'
                : 'The Git range holds a change the delete cannot take as a deletion: a rename (also one split across commit, index and worktree), a conflict, an unstaged deletion of a plugin file, a deleted file of no known family, a calculated insight with only one of its JSON and SQL files deleted, or a deleted file that is present again. Nothing was deleted; stage or resolve the change, then rerun.'
              : 'Git selection failed. Use a valid commit reference and run the delete inside the Git repository; deleted files must be canonical plugin files whose base content is valid. Nothing was deleted.',
          retryable: false,
        });
        return;
      }
      envelope.diagnostics.errors.push({
        code:
          error instanceof DeployInputError ||
          error instanceof DataSpaceError ||
          error instanceof DloError ||
          error instanceof NativeDmoError ||
          error instanceof NativeMappingError ||
          error instanceof NativeRelationshipError ||
          error instanceof DataStreamError ||
          error instanceof DataTransformError ||
          error instanceof SegmentError ||
          error instanceof IdentityResolutionError ||
          error instanceof DataGraphError ||
          error instanceof CalculatedInsightError
            ? error.code
            : 'DELETE_FAILED',
        message: operationDiagnostic(
          error,
          flags.preview
            ? 'Preview stopped; nothing was deleted. Correct the reported check before another attempt.'
            : // Stopped before any delete was sent (every item not attempted): nothing to inspect.
              envelope.result.items.every((item) => item.mutation === 'not-attempted')
              ? 'Deletion stopped before any delete was sent; nothing was deleted. Correct the reported check before another attempt.'
              : 'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
        ),
        retryable: false,
      });
    };
    const warn = (text: string): void => {
      if (!envelope.diagnostics.warnings.includes(text)) envelope.diagnostics.warnings.push(text);
    };
    try {
      if (flags.field?.length || flags['output-dir'] !== undefined) {
        await this.deleteDmoFields(flags, envelope);
        return finish();
      }
      // Admission: every check below runs before the first org call.
      if (gitMode) {
        if (flags.metadata !== undefined) throw new DloError('INVALID_SELECTION');
        // A stream follows its DLO file in the range.
        if (flags['delete-dlo']) throw new DataStreamError('INVALID_STREAM_DELETE_SELECTION');
      }
      let gitDeletions: readonly GitDeleteCandidate[] = [];
      if (changedSince !== undefined) {
        envelope.result.selection = { changedSince };
        const selected = await this.selectGitInputs({ cwd: process.cwd(), ref: changedSince });
        envelope.provenance.git = selected.provenance;
        gitDeletions = selected.deletions ?? [];
        if (gitDeletions.length === 0) {
          envelope.status = 'success';
          return await finish();
        }
      }
      const gitBySelector = new Map(
        gitDeletions.map((candidate) => [
          `${candidate.family}:${candidate.identity.apiName}`,
          candidate,
        ]),
      );
      const selectors = gitMode ? [...gitBySelector.keys()] : (flags.metadata ?? []);
      for (const selector of selectors)
        if (!deleteFamily(selector, gitMode)) throw selectorError(selector);
      if (selectors.length === 0) throw new DloError('INVALID_SELECTION');
      const familyOf = (selector: string): DeleteFamily =>
        deleteFamily(selector, gitMode) as DeleteFamily;
      const has = (family: DeleteFamily): boolean =>
        selectors.some((selector) => familyOf(selector) === family);
      const sourceSelectors = selectors.filter((selector) =>
        sourceFamilies.has(familyOf(selector)),
      );
      if (has('data-transform') && !['auto', '68.0'].includes(flags['api-version'] ?? 'auto'))
        throw new DataTransformError('INVALID_TRANSFORM_SCOPE');
      if (flags['delete-dlo'] && !has('data-stream'))
        throw new DataStreamError('STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION');
      if (new Set(sourceSelectors).size !== sourceSelectors.length)
        throw new DloError('INVALID_SELECTION');
      // Every family is deleted in the run's data space.
      if (
        (has('segment') || has('identity-resolution') || has('calculated-insight')) &&
        !['auto', '68.0'].includes(flags['api-version'] ?? 'auto')
      )
        throw new DloError('INVALID_SCOPE');
      if (has('data-graph'))
        try {
          operationApiVersion(flags['api-version'] ?? 'auto', 'data-graph');
        } catch {
          throw new DloError('INVALID_SCOPE');
        }
      const streamSelectors = Object.freeze(
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh selection within the ES2022 library target.
        [...new Set(selectors.filter((selector) => familyOf(selector) === 'data-stream'))].sort(),
      );
      let streamVersion = '68.0';
      if (streamSelectors.length > 0) streamVersion = dataStreamApiVersion(flags['api-version']);
      const nativeSelectors = [
        ...new Set(selectors.filter((selector) => nativeFamilies.has(familyOf(selector)))),
      ];
      let nativeVersion = '68.0';
      if (nativeSelectors.length > 0)
        try {
          nativeVersion = nativeApiVersion(flags['api-version']);
        } catch {
          throw new DloError('INVALID_SCOPE');
        }
      const snapshot = JSON.stringify(flags);
      // The definition each source-family selector deletes: from the org by name, or with Git
      // from the base content of the deleted file.
      const admitted = new Map<string, AdmittedSource>();
      // A file deleted in the range names its component in its own (base) data space.
      // A DLO or stream file lists every data space of the DLO; it must list the run's.
      for (const candidate of gitDeletions) {
        const listed = spaceListOf(candidate.document);
        if (
          listed === undefined
            ? candidate.identity.dataSpace !== effectiveScope
            : !listed.includes(effectiveScope)
        ) {
          // A segment or transform names its own refusal, with both data spaces.
          const named = String(candidate.identity.dataSpace);
          if (candidate.family === 'segment')
            throw segmentSpaceMismatch(candidate.identity.apiName, named, effectiveScope);
          if (candidate.family === 'data-transform')
            throw dataTransformSpaceMismatch(candidate.identity.apiName, named, effectiveScope);
          if (candidate.family === 'data-graph')
            throw nativeDataGraphSpaceMismatch(
              candidate.identity.apiName,
              named,
              effectiveScope,
              'file',
            );
          if (candidate.family === 'identity-resolution')
            throw identityResolutionSpaceMismatch(
              candidate.identity.apiName,
              named,
              effectiveScope,
              'file',
            );
          throw new DloError('INVALID_SCOPE');
        }
      }
      if (gitMode)
        for (const [selector, candidate] of gitBySelector) {
          // A verbatim file (retrieved as-is) is read from the org by name below, like -m.
          if (!sourceFamilies.has(candidate.family) || isVerbatimDocument(candidate.document))
            continue;
          const source = admitSourceInput({
            path: candidate.path,
            ...(candidate.companionPath === undefined
              ? {}
              : { companionPath: candidate.companionPath }),
            document: candidate.document,
            inputDigest: candidate.baseDigest,
          } as DeployInput);
          if (source.selector !== selector)
            throw source.family === 'data-transform'
              ? new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION')
              : new DloError('INVALID_SELECTION');
          admitted.set(selector, { desired: source.desired });
        }
      // A Git delete is never an implicit destructive run; a -m delete needs no confirmation.
      if (gitMode && !flags.preview && flags['confirm-delete'] !== true) {
        const error = new DloError('DESTRUCTIVE_CONFIRMATION_REQUIRED');
        replaceExplanation(
          error,
          'Files deleted in the Git range are deleted in the org only with --confirm-delete. Check the selection with --preview, then rerun with --confirm-delete. Nothing was deleted.',
        );
        throw error;
      }
      // Right before each stage: a file deleted in the range must still be gone.
      const stillDeleted = async (candidate: GitDeleteCandidate | undefined): Promise<void> => {
        if (candidate === undefined) return;
        for (const file of [
          candidate.path,
          candidate.companionPath,
          ...(candidate.codePaths ?? []),
        ])
          if (file !== undefined && (await localFilePresent(file)))
            throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
      };
      let connection: Connection | undefined;
      const connect = async (): Promise<Connection> => {
        connection ??= await this.connectTarget(flags['target-org']);
        if (this.resolvedOrgId) envelope.provenance.targetOrgId = this.resolvedOrgId;
        return connection;
      };
      let username: string | undefined;
      const resolveUsername = async (): Promise<string> => {
        username ??= await this.resolveTarget(flags['target-org']);
        if (this.resolvedOrgId) envelope.provenance.targetOrgId = this.resolvedOrgId;
        return username;
      };
      // The run's data space and every space a selected file names must exist in the org: one
      // read per run, before any phase deletes anything (preview too).
      await dataSpaceCheckOf(this, async () =>
        (this.createDataSpaceSender ?? openBoundSsot)(await resolveUsername(), '68.0'),
      ).require([
        effectiveScope,
        ...gitDeletions.flatMap((candidate) => spaceListOf(candidate.document) ?? []),
      ]);
      // A DELETE removes a DLO from every data space it belongs to, so a selected DLO that also
      // belongs to another data space than the run's is refused here, before any phase deletes
      // anything (preview too). An absent DLO is reported unchanged by its phase.
      for (const selector of nativeSelectors.filter((value) => value.startsWith('dlo:'))) {
        const name = selectorName(selector);
        try {
          // The delete preview's own read: the same membership checks, nothing deleted.
          await (this.retrieveDlo ?? previewDeleteNativeDlo)(
            name,
            this.createDloNativeDeleteClient(await resolveUsername(), nativeVersion),
            effectiveScope,
          );
        } catch (error) {
          if (error instanceof DloError && error.code === 'DLO_HTTP_ERROR' && error.status === 404)
            continue;
          const blocked: DeleteItem = {
            family: 'dlo',
            identity: { dataSpace: effectiveScope, apiName: name },
            operation: flags.preview ? 'preview' : 'delete',
            outcome: 'blocked',
            mutation: 'not-attempted',
          };
          selectorsByItem.set(blocked, selector);
          envelope.result.items.push(blocked);
          throw error;
        }
      }
      // Read-only, preview too, before any phase deletes anything: each -m source-family
      // component's current definition by name, and the target ID of a Git-deleted transform.
      for (const selector of sourceSelectors) {
        const verbatim = isVerbatimDocument(gitBySelector.get(selector)?.document);
        if (gitMode && !verbatim && familyOf(selector) !== 'data-transform') continue;
        const target = await connect();
        if (familyOf(selector) === 'data-transform' && !target.getUsername())
          throw new DloError('TARGET_ORG_REQUIRED');
        if (verbatim) {
          // Deleted by type and name: the services check identity, scope, protection and
          // dependents on the raw GET and never project it into the plugin's model.
          admitted.set(
            selector,
            await this.verbatimDeleteSource(
              gitBySelector.get(selector)!.document as VerbatimDocument,
              target,
            ),
          );
          continue;
        }
        if (!gitMode) {
          admitted.set(
            selector,
            await this.readDeleteSource(
              familyOf(selector),
              selectorName(selector),
              target,
              effectiveScope,
            ),
          );
          continue;
        }
        const source = admitted.get(selector) as { desired: unknown };
        const targetId = await resolveDataTransformTargetId(
          this.createDataTransformClient(target, '68.0', effectiveScope),
          selectorName(selector),
        );
        // No transform of that name (also on a rerun after it was deleted): nothing to delete.
        admitted.set(
          selector,
          targetId === undefined ? { absent: true } : { ...source, transformTargetId: targetId },
        );
      }
      const planInputs: DeletePlanInput[] = [
        ...sourceSelectors.map((selector) => {
          const source = admitted.get(selector) as AdmittedSource;
          return {
            path: selector,
            selector,
            // An absent component has no definition: it carries only its kind and name.
            document: (source.absent
              ? {
                  kind: documentKind(familyOf(selector)),
                  identity: { apiName: selectorName(selector) },
                }
              : source.desired) as PlanInput['document'],
            source,
            ...(gitBySelector.has(selector) ? { git: gitBySelector.get(selector) } : {}),
          };
        }),
        ...[...streamSelectors, ...nativeSelectors].map((selector) => ({
          path: selector,
          selector,
          document: { kind: familyOf(selector), identity: { apiName: selectorName(selector) } },
          ...(gitBySelector.has(selector) ? { git: gitBySelector.get(selector) } : {}),
        })),
      ];
      let streamClients: Parameters<typeof executeDeleteDataStream>[1] | undefined;
      const streamClientsFor = async (): Promise<Parameters<typeof executeDeleteDataStream>[1]> => {
        streamClients ??= await this.createDataStreamClients(
          await resolveUsername(),
          streamVersion,
        );
        return streamClients;
      };
      // A selected stream owns its landing DLO: when both are selected, the stream is deleted
      // with --delete-dlo semantics and the DLO is never deleted on its own (read-only lookup).
      const pairedDlo = new Map<string, string>();
      if (streamSelectors.length > 0 && nativeSelectors.some((value) => value.startsWith('dlo:')))
        for (const selector of streamSelectors) {
          const linked = await (this.readStreamLinkedDlo ?? readStreamLinkedDlo)(
            selectorName(selector),
            await streamClientsFor(),
          );
          const dlo = nativeSelectors.find(
            (value) =>
              value.startsWith('dlo:') &&
              typeof linked === 'string' &&
              selectorName(value).toLowerCase() === linked.toLowerCase(),
          );
          if (dlo) pairedDlo.set(selectorName(selector), dlo);
        }
      const pairedSelectors = new Set(pairedDlo.values());
      const stageInputs = planInputs.filter((input) => !pairedSelectors.has(input.selector));
      const stages = planDeleteStages(stageInputs);
      const dependents = selectedDependents(stageInputs);
      const keyOfSelector = new Map(planInputs.map((input) => [input.selector, inputKey(input)]));

      // The definition a source-family item deletes (read from the org, or the Git base content).
      const desiredOf = (
        entry: DeletePlanInput,
      ): { desired: unknown; transformTargetId?: string } =>
        entry.source as { desired: unknown; transformTargetId?: string };
      // The org's spelling of a transform or graph name (a by-name read may match ignoring
      // case); the item and the local files use it, as the delete never renames anything.
      const definitionName = (desired: unknown, fallback: string): string => {
        const name = (desired as { definition?: { name?: unknown } }).definition?.name;
        return typeof name === 'string' && name !== '' ? name : fallback;
      };
      // A source-family component the org does not have: nothing to delete, no request sent.
      const reportAbsent = (entry: DeletePlanInput): StageStatus => {
        const item: DeleteItem = {
          family: familyOf(entry.selector),
          identity: { dataSpace: effectiveScope, apiName: selectorName(entry.selector) },
          operation: flags.preview ? 'preview' : 'delete',
          outcome: 'unchanged',
          mutation: 'not-attempted',
        };
        selectorsByItem.set(item, entry.selector);
        envelope.result.items.push(item);
        return 'success';
      };

      const runGraph = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const { desired } = desiredOf(entry);
        const name = definitionName(desired, selectorName(entry.selector));
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await stillDeleted(entry.git);
        };
        await verifyInput();
        const target = await connect();
        const context = await this.nativeGraphContext(target, effectiveScope);
        envelope.metadata.apiVersion = '68.0';
        warn(nativeGraphLimitations);
        const result = await this.operateNativeGraph(
          desired,
          context,
          this.nativeGraphClient(target, '68.0', effectiveScope),
          {
            operation: 'delete',
            preview: flags.preview,
            confirmed: true,
            verifyInput,
          },
        );
        const item: DeleteItem = {
          family: 'data-graph',
          identity: { dataSpace: effectiveScope, apiName: name },
          operation: flags.preview ? 'preview' : 'delete',
          outcome:
            result.outcome === 'delete'
              ? 'delete'
              : result.outcome === 'deleted'
                ? 'deleted'
                : result.outcome === 'unchanged'
                  ? 'unchanged'
                  : result.outcome === 'failed'
                    ? 'failed'
                    : 'blocked',
          mutation:
            result.mutation === 'confirmed-deleted'
              ? 'confirmed-deleted'
              : result.mutation === 'rejected'
                ? 'rejected'
                : result.mutation === 'unknown'
                  ? 'unknown'
                  : 'not-attempted',
          routes: [{ operation: 'data-graph.delete', apiVersion: '68.0', transport: 'native' }],
        };
        envelope.result.items.push(item);
        selectorsByItem.set(item, entry.selector);
        await track(item, await sourceFiles('data-graph', name));
        const status =
          result.outcome === 'failed'
            ? 'failed'
            : result.outcome === 'blocked'
              ? 'blocked'
              : 'success';
        if (status !== 'success')
          envelope.diagnostics.errors.push({
            code: 'DELETE_FAILED',
            message: operationDiagnostic(
              result,
              // No delete was sent for this graph: nothing to inspect for it. The run-wide
              // wording only when no item of the run sent a delete either.
              item.mutation === 'not-attempted'
                ? envelope.result.items.every((entry) => entry.mutation === 'not-attempted')
                  ? 'Deletion stopped before any delete was sent; nothing was deleted. Correct the reported check before another attempt.'
                  : 'This data graph was not deleted; no delete was sent for it. Correct the reported check before another attempt; check the outcomes of the other items.'
                : 'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
            ),
            retryable: false,
          });
        return status;
      };

      const runTransform = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const { desired, transformTargetId } = desiredOf(entry);
        const name = definitionName(desired, selectorName(entry.selector));
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot)
            throw new DataTransformError('TRANSFORM_DELETE_INPUT_DRIFT');
          await stillDeleted(entry.git);
        };
        await verifyInput();
        const item: DeleteItem = {
          family: 'data-transform',
          identity: { dataSpace: effectiveScope, apiName: name },
          operation: flags.preview ? 'preview' : 'delete',
          outcome: 'blocked',
          mutation: 'not-attempted',
          routes: flags.preview
            ? [{ operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' }]
            : [
                { operation: 'data-transform.delete', apiVersion: '68.0', transport: 'native' },
                { operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' },
              ],
        };
        selectorsByItem.set(item, entry.selector);
        envelope.result.items.push(item);
        envelope.metadata.apiVersion = '68.0';
        let dispatched = false;
        try {
          const target = await connect();
          if (!target.getUsername()) throw new DloError('TARGET_ORG_REQUIRED');
          await verifyInput();
          const base = this.createDataTransformClient(target, '68.0', effectiveScope);
          const client = {
            ...base,
            delete: async (value: string): Promise<void> => {
              dispatched = true;
              await base.delete(value);
            },
          };
          warn(
            'Transform definition deletion only, for a transform of any owner (Salesforce decides; its 4xx refusal is reported as rejected). Settlement is the absence of the transform from the bounded visible inventory; exhaustive external-consumer exclusion is not established. No DLO, run or data cleanup; no retry, atomic concurrency guarantee or fallback.',
          );
          const result = await this.deleteDataTransform(desired, client, {
            // Resolved from the transform's name during admission.
            targetId: transformTargetId as string,
            preview: flags.preview,
            confirmDelete: true,
            verifyInput,
          });
          item.outcome = result.outcome === 'preview' ? 'delete' : result.outcome;
          item.mutation = result.mutation;
          await track(item, await sourceFiles('data-transform', name));
          if (result.mutation === 'rejected') {
            envelope.diagnostics.errors.push({
              code: 'REQUEST_FAILED',
              message: operationDiagnostic(result.error, rejectedNextAction),
              retryable: false,
            });
            return 'failed';
          }
          if (result.outcome === 'deletion-unconfirmed') {
            envelope.diagnostics.errors.push({
              code: 'TRANSFORM_DELETE_UNCONFIRMED',
              message:
                'DELETE outcome is not confirmed. Do not replay; reconcile by reading the Transform inventory before any further action.',
              retryable: false,
            });
            return 'failed';
          }
          if (result.outcome === 'blocked') {
            envelope.diagnostics.errors.push({
              code: 'DESTRUCTIVE_CONFIRMATION_REQUIRED',
              message: 'The transform delete was not confirmed; nothing was changed.',
              retryable: false,
            });
            return 'blocked';
          }
          return 'success';
        } catch (error) {
          item.outcome = dispatched ? 'failed' : 'blocked';
          item.mutation = dispatched ? 'unknown' : 'not-attempted';
          envelope.status = dispatched ? 'failed' : 'blocked';
          throw error;
        }
      };

      // Record an owner-family result (Segment, IR, CI) as its item; map it to the stage status.
      const settleOwner = async (
        result: { outcome: string; diagnostics: Array<{ code: string; message: string }> },
        item: DeleteItem,
        selector: string,
        files: LocalFileCandidate[],
      ): Promise<StageStatus> => {
        envelope.result.items.push(item);
        selectorsByItem.set(item, selector);
        await track(item, files);
        envelope.diagnostics.errors.push(
          ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
        );
        return result.outcome === 'failed'
          ? 'failed'
          : result.outcome === 'blocked'
            ? 'blocked'
            : 'success';
      };

      const runSegment = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const desired = desiredOf(entry).desired as ReturnType<typeof validateSegmentDocument>;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await stillDeleted(entry.git);
        };
        await verifyInput();
        const target = await connect();
        await verifyInput();
        envelope.metadata.apiVersion = '68.0';
        warn(
          'Segment definition deletion only. Selected source compatibility is checked; exhaustive external-consumer exclusion and physical membership/output cleanup remain unverified. No shared DMO is deleted.',
        );
        const result = await this.deleteSegment(
          desired,
          target,
          { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
          effectiveScope,
          { preview: flags.preview, confirmDelete: true, verifyInput },
        );
        const item = {
          ...result,
          family: 'segment' as const,
          identity: reportedIdentity(desired, effectiveScope),
          operation: flags.preview ? ('preview' as const) : ('delete' as const),
          routes: [
            { operation: 'segments.delete', apiVersion: '68.0', transport: 'native' as const },
            { operation: 'segments.get', apiVersion: '68.0', transport: 'native' as const },
            { operation: 'dependency.read', apiVersion: '68.0', transport: 'native' as const },
          ],
        };
        return settleOwner(
          result,
          item,
          entry.selector,
          await sourceFiles('segment', desired.identity.apiName),
        );
      };

      const runIdentityResolution = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const desired = desiredOf(entry).desired as ReturnType<
          typeof validateIdentityResolutionDocument
        >;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await stillDeleted(entry.git);
        };
        await verifyInput();
        const target = await connect();
        await verifyInput();
        envelope.metadata.apiVersion = '68.0';
        warn(
          'IR owner-definition deletion only. Exhaustive external-consumer exclusion and physical profile/output cleanup remain unverified; no generated DMO or source DMO/DLO is manually deleted.',
        );
        const result = await this.deleteIdentityResolution(
          desired,
          target,
          { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
          effectiveScope,
          {
            preview: flags.preview,
            confirmDelete: true,
            verifyInput,
          },
        );
        const item = {
          ...result,
          family: 'identity-resolution' as const,
          identity: { dataSpace: effectiveScope, apiName: desired.identity.apiName },
          operation: flags.preview ? ('preview' as const) : ('delete' as const),
          routes: [
            {
              operation: 'identity-resolutions.delete',
              apiVersion: '68.0',
              transport: 'native' as const,
            },
            {
              operation: 'identity-resolutions.get',
              apiVersion: '68.0',
              transport: 'native' as const,
            },
            { operation: 'dependency.get', apiVersion: '68.0', transport: 'native' as const },
          ],
        };
        return settleOwner(
          result,
          item,
          entry.selector,
          await sourceFiles('identity-resolution', desired.identity.apiName),
        );
      };

      const runCalculatedInsight = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const desired = desiredOf(entry).desired as CalculatedInsightReference;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('CI_INPUT_DRIFT');
          await stillDeleted(entry.git);
        };
        await verifyInput();
        const target = await connect();
        const context = this.calculatedInsightContext(target, effectiveScope);
        await verifyInput();
        const result = await this.deleteCalculatedInsight(
          desired.identity,
          target,
          { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
          effectiveScope,
          {
            context,
            preview: flags.preview,
            confirmDelete: true,
            verifyInput,
          },
        );
        const item = {
          ...result,
          family: 'calculated-insight' as const,
          identity: desired.identity,
          operation: flags.preview ? ('preview' as const) : ('delete' as const),
          routes: [
            {
              operation: 'calculated-insight.delete',
              apiVersion: '68.0',
              transport: 'native' as const,
            },
            {
              operation: 'calculated-insight.get',
              apiVersion: '68.0',
              transport: 'native' as const,
            },
          ],
        };
        return settleOwner(
          result,
          item,
          entry.selector,
          await sourceFiles('calculated-insight', desired.identity.apiName),
        );
      };

      const streamSnapshot = (): string =>
        JSON.stringify({
          metadata: flags.metadata,
          version: flags['api-version'],
          scope: flags.dataspace,
          cascade: flags['delete-dlo'],
          preview: flags.preview,
          target: flags['target-org'],
        });
      // The stream's file, and when its DLO goes too, the file of that DLO.
      const streamFiles = (
        apiName: string,
        deleteDlo: boolean,
        dlo: unknown,
      ): LocalFileCandidate[] => [
        inProject('data-stream', `${apiName}.data-stream-meta.json`),
        ...(deleteDlo && typeof dlo === 'string' && dloName.test(dlo)
          ? [inProject('dlo', `${dlo}.dlo-meta.json`)]
          : []),
      ];
      // Preview: a dependent of a stream or its DLO is planned when an earlier phase of this delete
      // plans to delete it: a selected DMO, a DMO whose every mapping from the landing DLO is a
      // selected mapping, or a selected mapping. The real run checks the org after those phases.
      const planned = (family: DeleteFamily): Set<string> =>
        new Set(
          envelope.result.items
            .filter(
              (item) =>
                item.family === family &&
                item.operation === 'preview' &&
                (item.outcome === 'delete' || item.outcome === 'planned-dependencies'),
            )
            .flatMap((item) => [
              item.identity.apiName,
              ...(item.targetApiName === undefined ? [] : [item.targetApiName]),
            ])
            .map((value) => value.toLowerCase()),
        );
      const plannedStreamDependent = async (
        dependent: StreamDependent,
        dloName: string,
      ): Promise<boolean> => {
        const name = dependent.name.toLowerCase();
        const mappings = planned('mapping');
        if (dependent.componentType !== 'DataModelObject')
          return /mapping/iu.test(dependent.componentType) && mappings.has(name);
        if (planned('dmo').has(name)) return true;
        if (mappings.size === 0 || !nativeDmoName.test(dependent.name)) return false;
        try {
          const target = await resolveUsername();
          const names = unwrapNativeMappingCollection(
            await (this.createMappingClient ?? createMappingClient)(
              target,
              nativeVersion,
              undefined,
              effectiveScope,
              this.createMappingSender(target, nativeVersion),
            ).list(dependent.name, dloName),
            effectiveScope,
          ).map((entry) => String(entry.developerName).toLowerCase());
          return names.length > 0 && names.every((value) => mappings.has(value));
        } catch {
          return false;
        }
      };
      const runStreams = async (selected: string[]): Promise<StageStatus> => {
        envelope.metadata.apiVersion = streamVersion;
        const expected = streamSnapshot();
        const verifyInput = async (): Promise<void> => {
          if (streamSnapshot() !== expected) throw new DataStreamError('STREAM_DELETE_INPUT_DRIFT');
        };
        await verifyInput();
        const clients = await streamClientsFor();
        for (const selector of selected) {
          const apiName = selectorName(selector);
          const ownedDlo = pairedDlo.get(apiName);
          const deleteDlo = flags['delete-dlo'] === true || ownedDlo !== undefined;
          const item: DeleteItem = {
            family: 'data-stream',
            identity: { apiName, dataSpace: effectiveScope },
            operation: flags.preview ? 'preview' : 'delete',
            outcome: 'blocked',
            mutation: 'not-attempted',
            deleteDlo,
            routes: [
              { operation: 'data-stream.delete', transport: 'native', apiVersion: streamVersion },
              { operation: 'dlo.get', transport: 'native', apiVersion: streamVersion },
              { operation: 'dependency.read', transport: 'native', apiVersion: streamVersion },
            ],
          };
          selectorsByItem.set(item, selector);
          envelope.result.items.push(item);
          // The selected landing DLO is reported with the stream's outcome; no separate call.
          const reportOwnedDlo = (): void => {
            if (ownedDlo === undefined) return;
            const owned: DeleteItem = {
              family: 'dlo',
              identity: { dataSpace: effectiveScope, apiName: selectorName(ownedDlo) },
              operation: item.operation,
              outcome: item.outcome,
              mutation: item.mutation,
              removedWith: selector,
            };
            selectorsByItem.set(owned, ownedDlo);
            envelope.result.items.push(owned);
          };
          await verifyInput();
          const options = { deleteDlo, verifyInput, dataSpace: effectiveScope };
          if (flags.preview) {
            let preview: Awaited<ReturnType<typeof preflightDeleteDataStream>>;
            try {
              preview = await this.preflightDeleteDataStream(apiName, clients, {
                ...options,
                covered: plannedStreamDependent,
              });
            } catch (error) {
              // A refused stream names its cause on its item too; the command reports it as well.
              if (error instanceof DataStreamError)
                item.diagnostics = [
                  {
                    code: error.code,
                    message: operationDiagnostic(
                      error,
                      'Preview stopped; nothing was deleted. Correct the reported check before another attempt.',
                    ),
                  },
                ];
              throw error;
            }
            await verifyInput();
            item.outcome = preview.outcome;
            if ('plannedDependencies' in preview && preview.plannedDependencies)
              item.diagnostics = [
                {
                  code: 'DEPENDENCIES_PLANNED',
                  message: `Selected dependent ${preview.plannedDependencies.map((dependent) => `${dependent.componentType} ${dependent.name}`).join(', ')} is deleted earlier in this delete and must settle before this item is checked; no existence or delete outcome is asserted.`,
                },
              ];
            await track(
              item,
              streamFiles(
                apiName,
                deleteDlo,
                'targetDloName' in preview ? preview.targetDloName : undefined,
              ),
            );
            reportOwnedDlo();
          } else {
            const result = await this.executeDeleteDataStream(apiName, clients, options);
            item.outcome = result.outcome;
            item.mutation = result.mutation;
            if ('targetApiName' in result) item.targetApiName = result.targetApiName;
            if ('targetDloName' in result) item.targetDloName = result.targetDloName;
            await track(item, streamFiles(apiName, deleteDlo, item.targetDloName));
            reportOwnedDlo();
            // Already gone (a rerun after it was deleted): nothing to delete.
            if (result.outcome === 'unchanged') continue;
            if (result.outcome !== 'deleted') {
              // The refusal is reported on the stream's item as well as on the command.
              item.diagnostics = result.diagnostics.map(({ code, message }) => ({ code, message }));
              envelope.diagnostics.errors.push(...result.diagnostics);
              return result.outcome;
            }
          }
        }
        return 'success';
      };

      const runNative = async (selected: string[]): Promise<StageStatus> => {
        const version = nativeVersion;
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh array within the ES2022 library target.
        const ordered = [...selected].sort((a, b) => nativeOrder(a) - nativeOrder(b));
        const target = await resolveUsername();
        const mappingReader = (): ReturnType<typeof createMappingClient> =>
          (this.createMappingClient ?? createMappingClient)(
            target,
            version,
            undefined,
            effectiveScope,
            this.createMappingSender(target, version),
          );
        // Like deploy, an authored mapping (the file of that name, or with --changed-since its base
        // content) names the org mapping by its binding, whatever Salesforce named it; absent when
        // the org has no mapping with that binding. Resolved before the stage's first write.
        const orgMappingNames = new Map<string, string>();
        const absentMappings = new Set<string>();
        for (const selector of ordered.filter((value) => value.startsWith('mapping:'))) {
          const name = selector.slice(selector.indexOf(':') + 1);
          try {
            const base = gitBySelector.get(selector)?.document;
            // A verbatim base file names no binding: the mapping is deleted by its name.
            const binding = gitMode
              ? isVerbatimDocument(base)
                ? undefined
                : (base as NativeMappingDocument | undefined)
              : await this.readAuthoredMapping(
                  path.join(projectData, 'mapping', `${name}.mapping-meta.json`),
                );
            if (binding === undefined) continue;
            if (binding.c__dataSpace !== effectiveScope)
              throw explainSpaceMismatch(
                new NativeMappingError('MAPPING_DATASPACE_MISMATCH'),
                binding.identity.apiName,
                binding.c__dataSpace,
                effectiveScope,
              );
            const found = await resolveNativeMappingTarget(binding, mappingReader());
            if (found) orgMappingNames.set(selector, found.identity.apiName);
            else absentMappings.add(selector);
          } catch (error) {
            const blocked: DeleteItem = {
              family: 'mapping',
              identity: { dataSpace: effectiveScope, apiName: name },
              operation: flags.preview ? 'preview' : 'delete',
              outcome: 'blocked',
              mutation: 'not-attempted',
            };
            selectorsByItem.set(blocked, selector);
            envelope.result.items.push(blocked);
            throw error;
          }
        }
        const resolvedMappings = new Set(orgMappingNames.values());
        // A DLO dependent is covered when this command deletes it: its DMO, or every mapping
        // between the DLO and that DMO.
        const coveredBySelection =
          (dlo: string) =>
          async (dependent: DloDependent): Promise<boolean> => {
            if (dependent.componentType !== 'DataModelObject') return false;
            if (nativeSelectors.includes(`dmo:${dependent.name}`)) return true;
            if (!nativeDmoName.test(dependent.name)) return false;
            let names: string[] = [];
            try {
              names = unwrapNativeMappingCollection(
                await mappingReader().list(dependent.name, dlo),
                effectiveScope,
              ).map((entry) => String(entry.developerName));
            } catch {
              return false;
            }
            return (
              names.length > 0 &&
              names.every(
                (name) => nativeSelectors.includes(`mapping:${name}`) || resolvedMappings.has(name),
              )
            );
          };
        // Every DLO of this stage has its dependents checked before the stage's first write.
        const admittedDependents = new Map<string, DloDependent[]>();
        for (const selector of ordered.filter((value) => value.startsWith('dlo:'))) {
          const name = selector.slice(4);
          try {
            admittedDependents.set(
              name,
              await admitDloDependents(
                name,
                this.createDloNativeDeleteClient(target, version) as DloDeleteClient,
                coveredBySelection(name),
              ),
            );
          } catch (error) {
            // An absent DLO has nothing to check; the item loop reports it unchanged.
            if (
              error instanceof DloError &&
              error.code === 'DLO_HTTP_ERROR' &&
              error.status === 404
            ) {
              admittedDependents.set(name, []);
              continue;
            }
            const blocked: DeleteItem = {
              family: 'dlo',
              identity: { dataSpace: effectiveScope, apiName: name },
              operation: flags.preview ? 'preview' : 'delete',
              outcome: 'blocked',
              mutation: 'not-attempted',
            };
            selectorsByItem.set(blocked, selector);
            envelope.result.items.push(blocked);
            throw error;
          }
        }
        // The last mapping of a custom DMO selected with that DMO goes with the DMO delete.
        // No request deletes it; a confirmed DMO deletion counts for it only once its own read
        // answers 404, otherwise it is unconfirmed.
        const withDmo: Array<{
          item: DeleteItem;
          files: LocalFileCandidate[];
          name: string;
          reader: ReturnType<typeof createMappingClient>;
        }> = [];
        let withDmoUnconfirmed = false;
        const settleWithDmo = async (): Promise<void> => {
          for (const entry of withDmo) {
            const owner = envelope.result.items.find(
              (candidate) =>
                selectorsByItem.get(candidate)?.toLowerCase() ===
                entry.item.removedWith?.toLowerCase(),
            );
            if (owner) {
              entry.item.outcome = owner.outcome;
              entry.item.mutation = owner.mutation;
            }
            if (entry.item.mutation === 'confirmed-deleted') {
              let absent = false;
              let failure: unknown;
              try {
                absent = await (this.confirmMappingAbsent ?? confirmNativeMappingAbsent)(
                  entry.name,
                  entry.reader,
                  effectiveScope,
                );
              } catch (error) {
                failure = error;
              }
              if (!absent) {
                withDmoUnconfirmed = true;
                entry.item.outcome = 'deletion-unconfirmed';
                entry.item.mutation = 'acknowledged';
                const text = `${owner ? selectorsByItem.get(owner) : 'The DMO'} was deleted, but mapping ${entry.name} ${failure === undefined ? 'was still readable afterwards' : 'could not be read back'}. Do not replay; read the mapping again before any further action.`;
                envelope.diagnostics.errors.push({
                  code: 'MAPPING_DELETION_UNCONFIRMED',
                  message: failure === undefined ? text : operationDiagnostic(failure, text),
                  retryable: false,
                });
              }
            }
            await track(entry.item, entry.files);
          }
        };
        try {
          for (const selector of ordered) {
            if (selector.startsWith('relationship:')) {
              const base = gitBySelector.get(selector);
              // A verbatim base file: the relationship is found by name under its source DMO.
              const verbatim = isVerbatimDocument(base?.document);
              await this.deleteOneRelationship(
                selector,
                target,
                version,
                flags.preview,
                effectiveScope,
                envelope,
                selectorsByItem,
                track,
                verbatim ? undefined : (base?.document as NativeRelationshipDocument | undefined),
                verbatim && base?.sourceObjectName !== undefined
                  ? { sourceDmo: base.sourceObjectName, apiName: base.identity.apiName }
                  : undefined,
              );
              continue;
            }
            const native = selector.startsWith('dmo:');
            const mapping = selector.startsWith('mapping:');
            const apiName = selector.slice(selector.indexOf(':') + 1);
            const baseClient = mapping
              ? (this.createMappingClient ?? createMappingClient)(
                  target,
                  version,
                  undefined,
                  effectiveScope,
                  this.createMappingSender(target, version),
                )
              : native
                ? this.createDmoNativeDeleteClient(target, version)
                : this.createDloNativeDeleteClient(target, version);
            let dispatched = false;
            // Salesforce's own 4xx answer to the DELETE means nothing was deleted.
            let refusal: unknown;
            const client = mapping
              ? baseClient
              : {
                  ...baseClient,
                  delete: async (id: string): Promise<void> => {
                    dispatched = true;
                    try {
                      await (baseClient as ReturnType<typeof createDloClient>).delete(id);
                    } catch (error) {
                      const status = (error as { status?: unknown }).status;
                      if (
                        (error instanceof DloError || error instanceof NativeDmoError) &&
                        error.code.endsWith('_HTTP_ERROR') &&
                        typeof status === 'number' &&
                        status >= 400 &&
                        status < 500
                      )
                        refusal = error;
                      throw error;
                    }
                  },
                };
            const item: DeleteItem = {
              family: mapping ? 'mapping' : native ? 'dmo' : 'dlo',
              identity: { dataSpace: effectiveScope, apiName },
              operation: flags.preview ? 'preview' : 'delete',
              outcome: 'blocked',
              mutation: 'not-attempted',
            };
            selectorsByItem.set(item, selector);
            envelope.result.items.push(item);
            // The first read of the mapping names its binding, which finds a hand-written file.
            let firstRead: unknown;
            // The org mapping: the one the authored binding resolved to, otherwise the exact name.
            const resolved = orgMappingNames.get(selector);
            const orgName = resolved ?? apiName;
            try {
              if (mapping) {
                if (absentMappings.has(selector)) {
                  // No org mapping has the authored binding: nothing to delete.
                  item.outcome = 'unchanged';
                  continue;
                }
                if (orgName !== apiName) item.targetApiName = orgName;
                const mappingBase = baseClient as ReturnType<typeof createMappingClient>;
                const mappingClient = {
                  ...client,
                  get: async (name: string): Promise<unknown> => {
                    const value = await mappingBase.get(name);
                    if (name === orgName && firstRead === undefined) firstRead = value;
                    return value;
                  },
                  remove: async (name: string): Promise<void> => {
                    dispatched = true;
                    await mappingBase.remove(name);
                  },
                } as ReturnType<typeof createMappingClient>;
                // The DMO read uses the bound single-attempt GET client. The prefix (from the run's
                // one data space read) tells a standard DMO copy, which drops a field with its
                // last mapping.
                const dataSpacePrefix =
                  effectiveScope === 'default'
                    ? undefined
                    : await dataSpaceCheckOf(this, async () =>
                        (this.createDataSpaceSender ?? openBoundSsot)(target, '68.0'),
                      ).prefixOf(effectiveScope);
                const dependencies = {
                  target: this.createDmoNativeDeleteClient(target, version),
                  ...(dataSpacePrefix === undefined ? {} : { dataSpacePrefix }),
                };
                // The file named after the mapping, otherwise the one whose binding matches it.
                const mappingFiles = async (): Promise<LocalFileCandidate[]> => {
                  const canonical = inProject('mapping', `${apiName}.mapping-meta.json`);
                  // The authored file whose binding named the org mapping.
                  if (resolved !== undefined) return [canonical];
                  try {
                    const found = await mappingLocalFile(
                      normalizeNativeMapping(firstRead, effectiveScope, 'retrieve'),
                      process.cwd(),
                    );
                    return [{ path: found.path, boundary: projectData }];
                  } catch {
                    // Without a readable binding or folder only the canonical name is considered.
                    return [canonical];
                  }
                };
                // The selected DMO this mapping is the last mapping of, if the guard refused it.
                const ownerDmo = (error: unknown): string | undefined => {
                  if (
                    dispatched ||
                    !(error instanceof NativeMappingError) ||
                    error.code !== 'MAPPING_LAST_MAPPING_DELETE_BLOCKED'
                  )
                    return undefined;
                  let dmo: string;
                  try {
                    dmo = normalizeNativeMapping(firstRead, effectiveScope, 'retrieve').spec
                      .targetEntityDeveloperName;
                  } catch {
                    return undefined;
                  }
                  return nativeSelectors.find(
                    (value) => value.toLowerCase() === `dmo:${dmo}`.toLowerCase(),
                  );
                };
                try {
                  if (flags.preview) {
                    await (this.preflightDeleteMapping ?? preflightDeleteNativeMapping)(
                      orgName,
                      mappingClient,
                      dependencies,
                      effectiveScope,
                    );
                    item.plan = [{ operation: 'delete', apiName: orgName }];
                    item.outcome = 'delete';
                  } else
                    await (this.deleteMapping ?? deleteNativeMapping)(
                      orgName,
                      mappingClient,
                      dependencies,
                      effectiveScope,
                    );
                } catch (error) {
                  const owner = ownerDmo(error);
                  if (owner === undefined) throw error;
                  item.removedWith = owner;
                  withDmo.push({
                    item,
                    files: await mappingFiles(),
                    name: orgName,
                    reader: mappingBase,
                  });
                  continue;
                }
                await track(item, await mappingFiles());
              } else {
                const definitionClient = client as ReturnType<typeof createDloClient>;
                // Dependents were admitted before the first write; execution waits for them to clear.
                if (!native && !flags.preview)
                  await waitForDloDependents(
                    apiName,
                    baseClient as DloDeleteClient,
                    admittedDependents.get(apiName) ?? [],
                  );
                if (flags.preview) {
                  const document = await (native
                    ? (this.retrieveDmo ?? previewDeleteNativeDmo)(
                        apiName,
                        definitionClient,
                        effectiveScope,
                      )
                    : this.retrieveDlo(apiName, definitionClient, effectiveScope));
                  // A DLO is reported in the run's data space.
                  item.identity = native
                    ? (document.identity as DeleteItem['identity'])
                    : { dataSpace: effectiveScope, apiName: document.identity.apiName };
                  item.outcome = 'delete';
                } else {
                  const receipt = await (native
                    ? (this.deleteDmo ?? deleteNativeDmo)(apiName, definitionClient, effectiveScope)
                    : this.deleteDlo(apiName, definitionClient, effectiveScope));
                  item.identity.dataSpace = receipt.dataSpace;
                  if ('processing' in receipt && receipt.processing) {
                    // DLO/DMO read back in a DELETING state: acknowledged, server still processing.
                    item.outcome = 'deletion-processing';
                    item.mutation = 'acknowledged-processing';
                  }
                }
                await track(
                  item,
                  native
                    ? [inProject('dmo', `${apiName}.dmo-meta.json`)]
                    : [inProject('dlo', `${apiName}.dlo-meta.json`)],
                );
                if (item.outcome === 'deletion-processing') continue;
              }
              item.outcome = flags.preview ? 'delete' : 'deleted';
              if (!flags.preview) item.mutation = 'confirmed-deleted';
            } catch (error) {
              if (
                !dispatched &&
                (error instanceof DloError ||
                  error instanceof NativeDmoError ||
                  error instanceof NativeMappingError) &&
                !mapping &&
                ['DLO_HTTP_ERROR', 'DMO_HTTP_ERROR'].includes(error.code) &&
                error.status === 404
              ) {
                item.outcome = 'unchanged';
                continue;
              }
              // The mapping's own first read answered 404: it is already gone, like a DLO or DMO.
              if (
                mapping &&
                !dispatched &&
                firstRead === undefined &&
                error instanceof NativeMappingError &&
                error.code === 'MAPPING_HTTP_ERROR' &&
                error.status === 404
              ) {
                item.outcome = 'unchanged';
                continue;
              }
              if (
                dispatched &&
                ((error instanceof DloError && error.code === 'DLO_DELETE_NOT_CONFIRMED') ||
                  (error instanceof NativeDmoError && error.code === 'DMO_DELETE_NOT_CONFIRMED'))
              ) {
                const noun = native ? 'DMO' : 'DLO';
                item.outcome = 'deletion-unconfirmed';
                item.mutation = 'acknowledged';
                envelope.diagnostics.errors.push({
                  code: error.code,
                  message:
                    error.status === 200
                      ? `Salesforce acknowledged the DELETE, but the ${noun} was still readable afterwards. Do not replay; read the ${noun} again before any further action.`
                      : operationDiagnostic(
                          error,
                          `Salesforce acknowledged the DELETE, but its absence could not be confirmed. Do not replay; read the ${noun} again before any further action.`,
                        ),
                  retryable: false,
                });
                return 'failed';
              }
              item.outcome = dispatched ? 'failed' : 'blocked';
              item.mutation =
                (refusal !== undefined && refusal === error) ||
                (dispatched &&
                  error instanceof NativeMappingError &&
                  error.code === 'MAPPING_DELETE_FAILED' &&
                  error.rejected === true)
                  ? 'rejected'
                  : dispatched
                    ? 'unknown'
                    : 'not-attempted';
              envelope.status = dispatched ? 'failed' : 'blocked';
              throw error;
            }
          }
        } finally {
          await settleWithDmo();
        }
        if (withDmoUnconfirmed) {
          envelope.status = 'failed';
          return 'failed';
        }
        return 'success';
      };

      // One stage: items whose selected dependents an earlier preview stage plans to delete are
      // reported as planned; the rest run through their family's executor.
      const runStage = async (
        stage: CrudStage<DeletePlanInput>,
        planned: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        const before = envelope.result.items.length;
        envelope.status = 'blocked';
        let status: StageStatus = 'success';
        try {
          for (const input of stage.inputs) await stillDeleted(input.git);
          const ready: DeletePlanInput[] = [];
          for (const input of stage.inputs) {
            const waiting = flags.preview
              ? (dependents.get(input) ?? []).filter((key) => planned.has(key))
              : [];
            if (waiting.length === 0) {
              ready.push(input);
              continue;
            }
            const item: DeleteItem = {
              family: familyOf(input.selector),
              identity: { dataSpace: effectiveScope, apiName: selectorName(input.selector) },
              operation: 'preview',
              outcome: 'planned-dependencies',
              mutation: 'not-attempted',
              diagnostics: [
                {
                  code: 'DEPENDENCIES_PLANNED',
                  message: `Selected dependent ${waiting.join(', ')} is deleted earlier in this delete and must settle before this item is checked; no existence or delete outcome is asserted.`,
                },
              ],
            };
            selectorsByItem.set(item, input.selector);
            envelope.result.items.push(item);
          }
          if (stage.phase === 'P1') {
            if (ready.length > 0) status = await runNative(ready.map((input) => input.selector));
          } else if (stage.phase === 'P0') {
            if (ready.length > 0) status = await runStreams(ready.map((input) => input.selector));
          } else
            for (const input of ready) {
              const family = familyOf(input.selector);
              status = input.source?.absent
                ? reportAbsent(input)
                : family === 'data-graph'
                  ? await runGraph(input)
                  : family === 'data-transform'
                    ? await runTransform(input)
                    : family === 'segment'
                      ? await runSegment(input)
                      : family === 'identity-resolution'
                        ? await runIdentityResolution(input)
                        : await runCalculatedInsight(input);
              if (status !== 'success') break;
            }
        } catch (error) {
          pushError(error);
          // A handler marks the envelope failed when its request was sent before the error.
          status = (envelope.status as StageStatus) === 'failed' ? 'failed' : 'blocked';
        }
        const added = envelope.result.items.slice(before);
        const processing = added.filter((item) => item.outcome === 'deletion-processing');
        // A later phase starts only after this one settled; accepted-but-processing has not.
        if (
          status === 'success' &&
          !flags.preview &&
          stage !== stages.at(-1) &&
          processing.length > 0
        ) {
          envelope.diagnostics.errors.push({
            code: 'DELETE_PHASE_NOT_SETTLED',
            message: `Salesforce accepted the deletion of ${processing.map((item) => selectorsByItem.get(item)).join(', ')} and is still processing it, so the later phases of this delete were not started. Rerun the same delete once it reads absent; items already deleted report unchanged.`,
            retryable: false,
          });
          status = 'blocked';
        }
        return {
          status,
          planned: added
            .filter((item) => item.outcome === 'delete' || item.outcome === 'planned-dependencies')
            .flatMap((item) => {
              const key = keyOfSelector.get(selectorsByItem.get(item) ?? '');
              return key ? [key] : [];
            }),
        };
      };
      // Preview runs every stage read-only, even after a blocked one; execution stops there.
      const outcome = await runCrudStages(stages, runStage, {
        continueAfterBlocked: flags.preview,
      });
      envelope.status = outcome.status;
    } catch (error) {
      pushError(error);
    }
    return finish();
  }
}
