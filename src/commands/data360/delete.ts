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
  createDataTransformClient,
  createDataTransformDloReader,
} from '../../transport/data-transform-rest.js';
import {
  DataTransformError,
  dataTransformId,
  validateDataTransformDocument,
} from '../../artifacts/data-transform-document.js';
import { verifyDataTransformInputDigest } from '../../artifacts/read-deploy-input.js';
import type { DataTransformDeployInput } from '../../artifacts/read-deploy-input.js';
import { deleteSegment } from '../../services/delete-segment.js';
import { validateSegmentDocument } from '../../artifacts/segment-document.js';
import { verifySegmentInputDigest } from '../../artifacts/read-deploy-input.js';
import type { SegmentDeployInput } from '../../artifacts/read-deploy-input.js';
import { deleteIdentityResolution } from '../../services/delete-identity-resolution.js';
import { nativeIdentityResolutionDocument } from '../../services/preflight-identity-resolution-deploy.js';
import { identityResolutionName } from '../../artifacts/identity-resolution-document.js';
import { verifyIdentityResolutionInputDigest } from '../../artifacts/read-deploy-input.js';
import type { IdentityResolutionDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  operateNativeDataGraph,
  nativeGraphLimitations,
} from '../../services/command-native-data-graph.js';
import { nativeDataGraphReadContext } from '../../services/native-data-graph-context.js';
import { createDataGraphClient } from '../../transport/data-graph-rest.js';
import { verifyNativeDataGraphInputDigest } from '../../artifacts/read-deploy-input.js';
import type { NativeDataGraphDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  DeployInputError,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import { validateCalculatedInsightDocument } from '../../artifacts/calculated-insight-document.js';
import { deleteCalculatedInsight } from '../../services/delete-calculated-insight.js';
import { calculatedInsightReadContext } from '../../services/retrieve-calculated-insight.js';
import type { CalculatedInsightObservation } from '../../services/execute-calculated-insight-deploy.js';
import { operationDiagnostic, replaceExplanation } from '../../services/operation-diagnostic.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';
import {
  nativeDmoFieldName,
  nativeDmoName,
  NativeDmoError,
} from '../../artifacts/native-dmo-document.js';
import { writeNativeDmoDocument } from '../../artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../../artifacts/write-native-mapping.js';
import { lstat } from 'node:fs/promises';
import {
  NativeRelationshipError,
  nativeRelationshipName,
} from '../../artifacts/native-relationship-document.js';
import { createRelationshipClient } from '../../transport/relationship-rest.js';
import {
  deleteNativeRelationship,
  preflightDeleteNativeRelationship,
} from '../../services/native-relationship.js';
import { readRelationshipInput } from '../../artifacts/read-deploy-input.js';
import {
  dmoFieldLocalFiles,
  executeDmoFieldDelete,
  localFileExists,
  mappingLocalFile,
  planDmoFieldDelete,
  refreshDmoFieldFiles,
} from '../../services/delete-dmo-field.js';
import { localFilePresent, removeLocalFiles, samePath } from '../../services/local-file-removal.js';
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
  retrieveNativeDlo,
  waitForDloDependents,
} from '../../services/native-dlo.js';
import type { DloDependent } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';
import {
  nativeMappingName,
  NativeMappingError,
  normalizeNativeMapping,
  unwrapNativeMappingCollection,
} from '../../artifacts/native-mapping-document.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import {
  deleteNativeMapping,
  preflightDeleteNativeMapping,
} from '../../services/native-mapping.js';
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
} from '../../services/command-native-data-stream.js';
import { retrieveNativeDataStream } from '../../services/native-data-stream.js';
import type { DeployInput } from '../../artifacts/read-deploy-input.js';
import {
  crudPhase,
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

/** Families deleted from an exact --source-dir input. */
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
/** The --source-dir value a source family needs; a graph accepts its file or a folder. */
const sourcePatterns: Partial<Record<DeleteFamily, RegExp>> = {
  segment: /\.segment\.json$/u,
  'identity-resolution': /\.identityResolution\.json$/u,
  'calculated-insight': /\.(?:calculatedInsight\.json|mktCalcInsightObjectDef-meta\.xml)$/u,
  'data-graph': /./u,
};
const developerName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

/**
 * Family of an exact `family:Name` delete selector.
 * @param {string} selector Raw -m value.
 * @returns {DeleteFamily | undefined} The family; undefined for anything not exact.
 */
function deleteFamily(selector: string): DeleteFamily | undefined {
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
      return nativeRelationshipName.test(name) ? family : undefined;
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
  return new DloError('INVALID_SELECTION');
}

/**
 * Name part of an exact selector.
 * @param {string} selector Exact `family:Name` selector.
 * @returns {string} The name.
 */
function selectorName(selector: string): string {
  return selector.slice(selector.indexOf(':') + 1);
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
  const document = await retrieveNativeDataStream(apiName, clients);
  return document.spec.newDlo.name;
}

type AdmittedSource = { input: DeployInput; desired: unknown };
type DeletePlanInput = PlanInput & {
  selector: string;
  source?: AdmittedSource;
  /** Selected with --changed-since: the file deleted in the Git range, read from the base. */
  git?: GitDeleteCandidate;
  /** A transform deleted in the Git range: its target ID, resolved by name during admission. */
  transformTargetId?: string;
};
type StageStatus = 'success' | 'blocked' | 'failed';

/**
 * Validate one --source-dir input and name the selector it answers.
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
      const desired = validateDataTransformDocument(transform.document);
      return {
        family: 'data-transform',
        selector: `data-transform:${String(transform.document.definition.name)}`,
        desired,
      };
    }
    case 'segment': {
      const desired = validateSegmentDocument((input as SegmentDeployInput).document);
      return { family: 'segment', selector: `segment:${desired.identity.apiName}`, desired };
    }
    case 'identity-resolution': {
      const desired = nativeIdentityResolutionDocument(
        (input as IdentityResolutionDeployInput).document,
      );
      return {
        family: 'identity-resolution',
        selector: `identity-resolution:${desired.identity.apiName}`,
        desired,
      };
    }
    case 'calculated-insight': {
      const desired = validateCalculatedInsightDocument(
        (input as CalculatedInsightDeployInput).document,
      );
      // Only a configuration without a publish schedule is deletable.
      if (desired.spec.publishScheduleInterval !== 'NOT_SCHEDULED')
        throw new DloError('INVALID_SELECTION');
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
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'delete'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: {
    command: 'sf data360 delete';
    generatedAt: string;
    /** --changed-since: the resolved commits of the Git range. */
    git?: GitDeploySelection['provenance'];
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
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
      /** Preview: why the item is planned rather than checked. */
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
      prerequisitesPreserved?: true;
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

type FieldDeleteFlags = {
  metadata?: string[];
  field?: string[];
  preview: boolean;
  'target-org'?: string;
  'api-version'?: string;
  dataspace?: string;
  'output-dir'?: string;
  'source-dir'?: string | string[];
  'changed-since'?: string;
  'confirm-delete'?: boolean;
  'transform-target-id'?: string;
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
    "One delete can carry any mix of families. It runs them in reverse dependency order, one phase after the other: graphs, then identity resolution, calculated insights and Segments (a dependent before the component it needs, including a graph or CI/Segment on the unified DMO of a selected IR), then the transform, then relationships, mappings, DMOs and DLOs, then data streams. A phase starts only after every item of the previous one settled; a blocked, failed or unconfirmed item stops the run, and an item Salesforce is still processing stops the later phases with DELETE_PHASE_NOT_SETTLED. A selection spanning more than one phase needs --confirm-delete (DESTRUCTIVE_CONFIRMATION_REQUIRED otherwise). --changed-since <ref> selects the canonical plugin files deleted since the merge base with that reference (every family; changed files are ignored) and deletes their components in the same phase order. Identity comes from each file's base content; a path present again is not a delete, while a rename (also one split across commit, index and worktree), an unstaged deletion or a deleted file of no known family blocks before any org call (BLOCKED_GIT_LIFECYCLE). It always needs --confirm-delete (--preview runs without it), takes no -m, --source-dir, --transform-target-id or --delete-dlo, and removes no local file. A deleted data transform is resolved by its name to exactly one target ID (TRANSFORM_TARGET_NOT_RESOLVED otherwise); a relationship takes its source DMO from the base content; a stream file deleted together with its landing DLO file deletes the stream with its DLO. --preview runs every phase read-only and reports an item whose selected dependents an earlier phase deletes as planned-dependencies (DEPENDENCIES_PLANNED) without reading it. A stream selected together with its landing DLO is deleted with --delete-dlo semantics and the DLO item reports removedWith the stream; the last mapping of a custom DMO selected together with that DMO is not sent on its own and reports removedWith the DMO. Each source-backed family (Transform, Segment, IR, CI, Graph) needs its own --source-dir file. Exact data-transform:Name requires one matching .dataTransform.json --source-dir, exact --transform-target-id, auto/API68/default space and --confirm-delete. Preview is GET-only. A guarded exact CUSTOM/BATCH/ACTIVE unscheduled target is deleted with one native DELETE; settlement needs complete bounded inventory omission of both ID and name plus preserved source/output DLOs, otherwise the result is deletion-unconfirmed (never replay). No DLO, run or data cleanup; exhaustive external-consumer exclusion is not established. Exact segment:Name requires one matching .segment.json --source-dir, auto/API68/default and --confirm-delete. Preview performs zero writes; fresh source bindings and exact runtime/private identity are checked before one native DELETE. Only independent absence or a preserved DELETING/PROCESSING read acknowledges the result; HTTP204 alone is insufficient. No replay, Segment XML, shared-DMO deletion or physical-output cleanup guarantee. Exact identity-resolution:ObjectApiName requires one matching .identityResolution.json --source-dir, auto/API68/default space and --confirm-delete for a present matching owner that is not PUBLISHING or DELETING. Preview and verified absent targets are read-only without confirmation. A fresh target-local ID is resolved before one native68 DELETE; bounded exact ID/name absence confirms owner-definition deletion only. Exhaustive external-consumer exclusion and physical profile/output cleanup remain unverified. IR never cascades, runs processing, replays writes or falls back to another API. Exact data-graph:Name uses auto/API68/default with one matching native Graph --source-dir artifact and --confirm-delete. Fresh identity, created date, definition, root and ready checks plus explicit empty native dependency/related-segment arrays are mandatory. Exhaustive external-consumer exclusion remains unverified; no generated-resource cleanup, storage or credit guarantee. A Graph delete never cascades. Exact calculated-insight:Name__cio requires one matching --source-dir paired XML or JSON member, --api-version auto (68.0) or 68.0 and default space. Only exact matching NOT_SCHEDULED, never-run DRAFT/ACTIVE configuration is deletable; --confirm-delete explicitly acknowledges destructive CI deletion. CI --preview and already dual-absent targets are read-only without confirmation. Native CI DELETE/read uses API68; independent Metadata and dependency reads remain API65. Bounded independent runtime and Metadata absence is required, not a mutation echo. CI never cascades; no compute, storage or credits guarantee. Other families retain their existing confirmation behavior. Exact data-stream:ApiName selects guarded IngestApi stream deletion at auto/API68/default space only. The linked DLO is preserved by default; --delete-dlo explicitly acknowledges deleting that exclusively linked DLO. Selected stream and linked DLO checks only, not unrelated-org preservation. Definition deletion is noninteractive and requires no processing acknowledgement. Native DLO/DMO/mapping/relationship and stream selections that stay in one phase run without confirmation. Native routes default to API68; explicit numeric pins are preserved. Relationship deletion (relationship:Name) runs first in the batch, before mappings, DMOs and DLOs, and needs the local file data360/relationship/<Name>.relationship-meta.json in the current project to learn the source DMO. The relationships of the source DMO are listed: a relationship with that name must carry the binding of the file; when the name is absent but the binding exists under another name the delete is refused with RELATIONSHIP_NAME_MISMATCH and nothing is deleted; when neither is present the result is unchanged. Otherwise one DELETE is sent and its absence confirmed by listing again; a 4xx answer is reported as rejected. --preview only lists. Mapping deletion runs at native API 61 and up (default 68) and deletes the whole mapping with one Metadata API destructive deployment (ObjectSourceTargetMap), whatever pairs it holds, also onto a standard DMO. Afterwards the mapping must read absent and the other mappings and the fields of the DMO must be unchanged. The last mapping of a custom DMO is refused before any write (MAPPING_LAST_MAPPING_DELETE_BLOCKED) because Salesforce does not delete it; delete the DMO instead, which removes its mapping. Qualification uses empty custom fixtures, not populated-data guarantees. --preview performs zero writes and reports the planned step. Any partial failure stops the batch; no retries or rollback. Whole-DMO deletion applies to custom DMOs only; standard, namespaced and platform-generated DMOs are refused with UNSUPPORTED_DMO_TARGET, in the preview as well. Field-level delete: exactly one dmo:Name__dlm with one or more --field Name__c and --confirm-delete removes the named custom fields from that DMO. It is the one delete operation that changes mappings it was not given and writes project files. Reads first: custom or standard DMO only (platform-generated DMOs are refused); every field must exist, be custom, not the primary key and not generated, so the standard and system fields of a standard DMO are never removed; every mapping pair targeting a named field is collected, and a mapped field whose pair cannot be identified is refused. Then one Metadata API destructive change for all fields, sent once and never retried; Salesforce drops the mapping pairs of the removed fields itself. Fresh reads right before it must still match the plan, and polled reads afterwards must show the fields absent, exactly the collected pairs gone and every other mapping, pair, DMO property and field unchanged; any other difference fails with DMO_FIELD_REMOVAL_SIDE_EFFECT. Nothing is rolled back. After success the existing data360/dmo and data360/mapping files under --output-dir (default: current directory) are overwritten with the current definitions; absent files are not created and no file is deleted. A failed file refresh keeps the confirmed org result and exits nonzero. --field --preview writes nothing and reports pairs, fields and files. --field cannot be combined with another selector, --source-dir, --changed-since, --delete-dlo or --transform-target-id. Local files: after a confirmed deletion (deleted, or a DLO, DMO, segment or IR Salesforce accepted and is still deleting) the component's own local file is removed by default, one regular file at a time and never a folder: data360/dlo, data360/dmo, data360/relationship and data360/data-stream files under the current directory (with --delete-dlo also the linked DLO's file), the mapping file of that name or the one whose binding matches, and the --source-dir file of a Transform, Segment, IR or Graph (both members of a CI pair). Links, hard-linked files and paths outside the project's data360 folder or the given --source-dir file are refused. Nothing is removed on --preview, which lists the files instead, nor for unchanged, blocked, failed, rejected or unconfirmed deletions. --keep-local-files keeps them. A failed removal keeps the confirmed org result and exits nonzero with LOCAL_FILE_REMOVAL_FAILED.";
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
        'Exact data-transform:Name (source and --transform-target-id required), segment:Name, identity-resolution:ObjectApiName or calculated-insight:Name__cio (source required), data-stream:ApiName, dlo:Name__dll, dmo:Name__dlm (alone with --field), mapping:ApiName or relationship:Name (reads data360/relationship/Name.relationship-meta.json).',
    }),
    'api-version': Flags.string({
      summary: 'Native numeric route >=61, default/auto68.',
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary: 'Optional native data space; --data-space is a compatibility alias.',
    }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
    'source-dir': Flags.string({
      char: 'd',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Transform, Segment, IR, CI or native Graph: the exact local file of each selected one (a Graph also from a folder); repeatable.',
      exclusive: ['changed-since'],
    }),
    'changed-since': Flags.string({
      summary:
        'Delete in the org the components whose canonical plugin files were deleted since the merge base with a commit reference; needs --confirm-delete (not with --preview).',
      exclusive: ['source-dir', 'metadata'],
    }),
    'confirm-delete': Flags.boolean({
      default: false,
      summary:
        'Transform, Segment, IR, CI, native Graph, --field, or a selection spanning more than one phase: explicitly acknowledge destructive deletion.',
    }),
    'transform-target-id': Flags.string({
      summary: 'Transform-only exact native dataTransformId to delete (required).',
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
        'Field-level delete: exact custom field Name__c to remove from the one selected dmo:Name__dlm, together with its mapping pairs; repeatable. Requires --confirm-delete.',
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
  protected createDataTransformDloReader = createDataTransformDloReader;
  protected verifyDataTransformInput = verifyDataTransformInputDigest;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
  protected verifyNativeDataGraphInput = verifyNativeDataGraphInputDigest;
  protected resolveInputs = readDeployInputs;
  protected selectGitInputs = selectGitDeployInputs;
  protected deleteIdentityResolution = deleteIdentityResolution;
  protected deleteSegment = deleteSegment;
  protected verifySegmentInput = verifySegmentInputDigest;
  protected verifyIdentityResolutionInput = verifyIdentityResolutionInputDigest;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected deleteCalculatedInsight = deleteCalculatedInsight;
  protected calculatedInsightObservations: CalculatedInsightObservation[] = [];
  protected resolveConnection = async (alias?: string): Promise<Connection> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = alias ?? aggregator.getPropertyValue<string>('target-org');
    return Connection.create({
      authInfo: await AuthInfo.create({
        username: target ? state.aliases.resolveUsername(target) : undefined,
      }),
      connectionOptions: { version: '68.0' },
    });
  };
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
        undefined,
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
  protected retrieveDlo = retrieveNativeDlo;
  protected deleteDlo = deleteNativeDlo;
  protected resolveTarget = async (alias?: string): Promise<string> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = alias ?? aggregator.getPropertyValue<string>('target-org');
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({
        username: target ? state.aliases.resolveUsername(target) : undefined,
      }),
      connectionOptions: { version: '68.0' },
    });
    const username = connection.getUsername();
    if (!username) throw new DloError('TARGET_ORG_REQUIRED');
    return username;
  };
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
      flags['source-dir'] !== undefined ||
      flags['changed-since'] !== undefined ||
      flags['delete-dlo'] ||
      flags['transform-target-id'] !== undefined
    )
      return refuse(
        'INVALID_FIELD_DELETE_SELECTION',
        '--field removes fields from exactly one -m dmo:<Name__dlm> and cannot be combined with another selector, --source-dir, --changed-since, --delete-dlo or --transform-target-id; --output-dir is valid only with --field. No org call was made.',
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
    const requestScope = flags.dataspace;
    const root = path.resolve(flags['output-dir'] ?? process.cwd());
    const item: DeleteItem = {
      family: 'dmo',
      identity: { dataSpace: requestScope ?? 'default', apiName },
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
    if (!flags.preview && flags['confirm-delete'] !== true)
      return refuse(
        'DMO_FIELD_DELETE_CONFIRMATION_REQUIRED',
        'Pass --confirm-delete to delete the field(s) together with their mapping pairs; nothing was changed.',
      );
    const fieldError = (error: unknown, nextAction: string): void =>
      refuse(
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
      clients = {
        dmo: this.createDmoNativeDeleteClient(target, version),
        remover: (this.createDmoClient ?? createDmoClient)(target, version),
        mappings: (this.createMappingClient ?? createMappingClient)(
          target,
          version,
          undefined,
          requestScope,
          this.createMappingSender(target, version),
        ),
        // Read only to refresh a mapping file without the pairs Salesforce generated.
        source: (this.createDloNativeDeleteClient ?? createNativeDloDeleteClient)(target, version),
      };
      plan = await planDmoFieldDelete(apiName, fields, clients, requestScope);
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
      await executeDmoFieldDelete(plan, clients, progress, requestScope, this.fieldRemovalSettle);
    } catch (error) {
      item.unmappedPairs = [];
      item.removedFields = [];
      if (progress.step === 'readback') {
        item.outcome = 'deletion-unconfirmed';
        item.mutation = 'acknowledged';
      } else if (progress.removalSent) {
        item.outcome = 'failed';
        item.mutation = 'unknown';
      }
      envelope.status = item.outcome === 'blocked' ? 'blocked' : 'failed';
      return fieldError(error, fieldDeleteStop(progress, plan));
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
      requestScope,
    );
    const failed = item.refreshedFiles.filter((file) => file.outcome === 'failed');
    if (failed.length === 0) {
      envelope.status = 'success';
      return;
    }
    envelope.status = 'failed';
    refuse(
      'LOCAL_REFRESH_FAILED',
      `The field(s) ${fields.join(', ')} were deleted from ${apiName} in the org, but ${failed.length === 1 ? 'this project file was' : 'these project files were'} not refreshed: ${failed.map((file) => `${file.path} (${file.code})`).join('; ')}. Do not repeat the delete; refresh with sf data360 retrieve and --overwrite.`,
    );
  }

  /**
   * Delete or preview one relationship by name. The local relationship file names the source DMO
   * whose inventory proves presence before, and absence after, the single DELETE.
   * @param {string} selector Exact relationship:Name selector.
   * @param {string} target Resolved username.
   * @param {string} version Native API version.
   * @param {boolean} preview Read-only when true.
   * @param {string | undefined} requestScope Optional request scope.
   * @param {DeleteEnvelope} envelope Envelope receiving the item.
   * @param {Map<DeleteItem, string>} selectorsByItem Human labels.
   * @param {Function} track Registers the item's local file for removal or preview.
   * @param {NativeRelationshipDocument} [baseDocument] Git delete: the file's base content, used
   * instead of the (deleted) local file.
   * @returns {Promise<void>} Resolves when the item settled; throws to stop the batch.
   */
  private async deleteOneRelationship(
    selector: string,
    target: string,
    version: string,
    preview: boolean,
    requestScope: string | undefined,
    envelope: DeleteEnvelope,
    selectorsByItem: Map<DeleteItem, string>,
    track: (item: DeleteItem, candidates: LocalFileCandidate[]) => Promise<void>,
    baseDocument?: NativeRelationshipDocument,
  ): Promise<void> {
    const apiName = selector.slice('relationship:'.length);
    const item: DeleteItem = {
      family: 'relationship',
      identity: { dataSpace: requestScope ?? 'default', apiName },
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
      const file = path.join(
        process.cwd(),
        'data360',
        'relationship',
        `${apiName}.relationship-meta.json`,
      );
      try {
        if (baseDocument === undefined) await lstat(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const missing = new NativeRelationshipError('RELATIONSHIP_FILE_REQUIRED');
        replaceExplanation(
          missing,
          `Deleting ${selector} needs the local file ${file}, which names the source DMO; retrieve it with sf data360 retrieve --metadata relationship:<SourceDmo__dlm>. Nothing was deleted.`,
        );
        throw missing;
      }
      let document = baseDocument;
      if (document === undefined) ({ document } = await readRelationshipInput(file));
      const base = (this.createRelationshipClient ?? createRelationshipClient)(
        target,
        version,
        undefined,
        requestScope,
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
      if (preview) {
        const plan = await (this.preflightDeleteRelationship ?? preflightDeleteNativeRelationship)(
          apiName,
          document,
          client,
          requestScope,
        );
        item.outcome = plan.present ? 'delete' : 'unchanged';
        await track(item, [{ path: file, boundary: path.join(process.cwd(), 'data360') }]);
        return;
      }
      const result = await (this.deleteRelationship ?? deleteNativeRelationship)(
        apiName,
        document,
        client,
        requestScope,
      );
      item.outcome = result.outcome;
      if (result.outcome === 'deleted') item.mutation = 'confirmed-deleted';
      await track(item, [{ path: file, boundary: path.join(process.cwd(), 'data360') }]);
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
    const requestScope = flags.dataspace;
    const effectiveScope = requestScope ?? 'default';
    const envelope: DeleteEnvelope = {
      contract: 'sf-data360-delete',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: {
        operation: 'delete',
        preview: flags.preview,
        apiVersion: flags['api-version'] ?? 'auto',
        plugin,
      },
      provenance: { command: 'sf data360 delete', generatedAt: new Date().toISOString() },
      diagnostics: { warnings: [], errors: [] },
      result: { items: [] },
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
    const sourceDirectories = ((): string[] => {
      const given = flags['source-dir'] as string | string[] | undefined;
      return given === undefined ? [] : Array.isArray(given) ? given : [given];
    })();
    // The input files of a --source-dir family, only when --source-dir names one of them exactly.
    const sourceFiles = (paths: string[]): LocalFileCandidate[] => {
      if (gitMode) return [];
      const given = sourceDirectories.map((value) => path.resolve(process.cwd(), value));
      if (paths.some((file) => given.some((value) => samePath(file, value))))
        return paths.map((file) => ({ path: file, boundary: file, exact: true as const }));
      envelope.diagnostics.warnings.push(
        `--source-dir names a folder, not the file; no local file is removed for ${paths.map((file) => path.basename(file)).join(', ')}.`,
      );
      return [];
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
    const finish = async (): Promise<DeleteEnvelope> => {
      await removeConfirmedFiles();
      if (envelope.status !== 'success') process.exitCode = 1;
      annotateDiagnostics(envelope);
      if (!this.jsonEnabled()) {
        this.log(`Delete${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
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
                : 'The Git range holds a change the delete cannot take as a deletion: a rename (also one split across commit, index and worktree), a conflict, an unstaged deletion of a plugin file, a deleted file of no known family, a half-deleted calculated insight pair, or a deleted file that is present again. Nothing was deleted; stage or resolve the change, then rerun.'
              : 'Git selection failed. Use a valid commit reference and run the delete inside the Git repository; deleted files must be canonical plugin files whose base content is valid. Nothing was deleted.',
          retryable: false,
        });
        return;
      }
      envelope.diagnostics.errors.push({
        code:
          error instanceof DeployInputError ||
          error instanceof DloError ||
          error instanceof NativeDmoError ||
          error instanceof NativeMappingError ||
          error instanceof NativeRelationshipError ||
          error instanceof DataStreamError ||
          error instanceof DataTransformError
            ? error.code
            : 'DELETE_FAILED',
        message: operationDiagnostic(
          error,
          'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
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
        if (flags.metadata !== undefined || flags['source-dir'] !== undefined)
          throw new DloError('INVALID_SELECTION');
        // A transform deleted in the range resolves its ID by name; streams follow their DLO file.
        if (flags['transform-target-id'] !== undefined)
          throw new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
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
      for (const selector of selectors) if (!deleteFamily(selector)) throw selectorError(selector);
      if (selectors.length === 0) throw new DloError('INVALID_SELECTION');
      const familyOf = (selector: string): DeleteFamily => deleteFamily(selector) as DeleteFamily;
      const has = (family: DeleteFamily): boolean =>
        selectors.some((selector) => familyOf(selector) === family);
      const sourceSelectors = selectors.filter((selector) =>
        sourceFamilies.has(familyOf(selector)),
      );
      const targetId = flags['transform-target-id'];
      if (has('data-transform')) {
        if (
          !gitMode &&
          (selectors.filter((selector) => familyOf(selector) === 'data-transform').length !== 1 ||
            !sourceDirectories.some((value) => value.endsWith('.dataTransform.json')) ||
            typeof targetId !== 'string' ||
            !dataTransformId.test(targetId))
        )
          throw new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
        if (
          !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
          effectiveScope !== 'default'
        )
          throw new DataTransformError('INVALID_TRANSFORM_SCOPE');
      } else if (targetId !== undefined) throw new DloError('INVALID_SELECTION');
      if (flags['delete-dlo'] && !has('data-stream'))
        throw new DataStreamError('STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION');
      if (new Set(sourceSelectors).size !== sourceSelectors.length)
        throw new DloError('INVALID_SELECTION');
      if (!gitMode)
        for (const selector of sourceSelectors) {
          const pattern = sourcePatterns[familyOf(selector)];
          if (pattern && !sourceDirectories.some((value) => pattern.test(value)))
            throw new DloError('INVALID_SELECTION');
        }
      if (sourceSelectors.length === 0 && sourceDirectories.length > 0)
        throw new DloError('INVALID_SELECTION');
      if (
        (has('segment') || has('identity-resolution') || has('calculated-insight')) &&
        (!['auto', '68.0'].includes(flags['api-version'] ?? 'auto') || effectiveScope !== 'default')
      )
        throw new DloError('INVALID_SCOPE');
      if (has('data-graph')) {
        try {
          operationApiVersion(flags['api-version'] ?? 'auto', 'data-graph');
        } catch {
          throw new DloError('INVALID_SCOPE');
        }
        if (effectiveScope !== 'default') throw new DloError('INVALID_SCOPE');
      }
      const streamSelectors = Object.freeze(
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh selection within the ES2022 library target.
        [...new Set(selectors.filter((selector) => familyOf(selector) === 'data-stream'))].sort(),
      );
      let streamVersion = '68.0';
      if (streamSelectors.length > 0) {
        if (effectiveScope !== 'default') throw new DataStreamError('INVALID_STREAM_BINDING');
        streamVersion = dataStreamApiVersion(flags['api-version']);
      }
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
      // Each source family selector is backed by exactly one --source-dir input, and every input
      // is named by a selector.
      const admitted = new Map<string, AdmittedSource>();
      // A file deleted in the range names its component in its own (base) data space.
      for (const candidate of gitDeletions)
        if (candidate.identity.dataSpace !== effectiveScope) throw new DloError('INVALID_SCOPE');
      const familyError = (family: DeleteFamily): Error =>
        family === 'data-transform'
          ? new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION')
          : new DloError('INVALID_SELECTION');
      if (gitMode)
        // The base document stands in for the file: the same family checks as --source-dir.
        for (const [selector, candidate] of gitBySelector) {
          if (!sourceFamilies.has(candidate.family)) continue;
          const input = {
            path: candidate.path,
            ...(candidate.companionPath === undefined
              ? {}
              : { companionPath: candidate.companionPath }),
            document: candidate.document,
            inputDigest: candidate.baseDigest,
          } as DeployInput;
          const source = admitSourceInput(input);
          if (source.selector !== selector) throw familyError(source.family);
          admitted.set(selector, { input, desired: source.desired });
        }
      else if (sourceSelectors.length > 0) {
        for (const input of await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: sourceDirectories,
        })) {
          const source = admitSourceInput(input);
          if (!sourceSelectors.includes(source.selector) || admitted.has(source.selector))
            throw familyError(source.family);
          admitted.set(source.selector, { input, desired: source.desired });
        }
        for (const selector of sourceSelectors)
          if (!admitted.has(selector)) throw familyError(familyOf(selector));
      }
      const planInputs: DeletePlanInput[] = [
        ...[...admitted].map(([selector, source]) => ({
          path: source.input.path,
          document: source.input.document,
          selector,
          source,
          ...(gitBySelector.has(selector) ? { git: gitBySelector.get(selector) } : {}),
        })),
        ...[...streamSelectors, ...nativeSelectors].map((selector) => ({
          path: selector,
          selector,
          document: { kind: familyOf(selector), identity: { apiName: selectorName(selector) } },
          ...(gitBySelector.has(selector) ? { git: gitBySelector.get(selector) } : {}),
        })),
      ];
      // A Git delete, or a delete that spans more than one phase, is never an implicit
      // destructive run.
      if (
        !flags.preview &&
        flags['confirm-delete'] !== true &&
        (gitMode || new Set(planInputs.map((input) => crudPhase(input))).size > 1)
      ) {
        const error = new DloError('DESTRUCTIVE_CONFIRMATION_REQUIRED');
        replaceExplanation(
          error,
          gitMode
            ? 'Files deleted in the Git range are deleted in the org only with --confirm-delete. Check the selection with --preview, then rerun with --confirm-delete. Nothing was deleted.'
            : 'This delete spans more than one phase (streams, native DLO/DMO/mapping/relationship, transforms, identity resolution/calculated insight/Segment, graphs). Check it with --preview, then rerun with --confirm-delete. Nothing was deleted.',
        );
        throw error;
      }
      // Right before each stage: a file deleted in the range must still be gone.
      const stillDeleted = async (candidate: GitDeleteCandidate | undefined): Promise<void> => {
        if (candidate === undefined) return;
        for (const file of [candidate.path, candidate.companionPath])
          if (file !== undefined && (await localFilePresent(file)))
            throw new GitSelectionError('BLOCKED_GIT_LIFECYCLE');
      };
      let connection: Connection | undefined;
      const connect = async (): Promise<Connection> => {
        connection ??= await this.resolveConnection(flags['target-org']);
        return connection;
      };
      let username: string | undefined;
      const resolveUsername = async (): Promise<string> => {
        username ??= await this.resolveTarget(flags['target-org']);
        return username;
      };
      // A transform deleted in the Git range has no --transform-target-id: its name from the base
      // content must match exactly one transform in the org. Resolved here (read-only, preview
      // too), so a refusal comes before any phase deletes anything.
      for (const input of planInputs)
        if (input.git && familyOf(input.selector) === 'data-transform') {
          const target = await connect();
          if (!target.getUsername()) throw new DloError('TARGET_ORG_REQUIRED');
          input.transformTargetId = await resolveDataTransformTargetId(
            this.createDataTransformClient(target, '68.0', 'default'),
            selectorName(input.selector),
          );
        }
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

      const runGraph = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const input = entry.source?.input as NativeDataGraphDeployInput;
        const name = selectorName(entry.selector);
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await (entry.git
            ? stillDeleted(entry.git)
            : (this.verifyNativeDataGraphInput ?? verifyNativeDataGraphInputDigest)(input));
        };
        await verifyInput();
        const target = await connect();
        const context = await this.nativeGraphContext(target, 'default');
        envelope.metadata.apiVersion = '68.0';
        warn(nativeGraphLimitations);
        const result = await this.operateNativeGraph(
          input.document,
          context,
          this.nativeGraphClient(target, '68.0', 'default'),
          {
            operation: 'delete',
            preview: flags.preview,
            confirmed: flags['confirm-delete'] === true,
            verifyInput,
          },
        );
        const item: DeleteItem = {
          family: 'data-graph',
          identity: { dataSpace: 'default', apiName: name },
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
        await track(item, sourceFiles([input.path]));
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
              'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
            ),
            retryable: false,
          });
        return status;
      };

      const runTransform = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const input = entry.source?.input as DataTransformDeployInput;
        const desired = entry.source?.desired as ReturnType<typeof validateDataTransformDocument>;
        const name = selectorName(entry.selector);
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot)
            throw new DataTransformError('TRANSFORM_DELETE_INPUT_DRIFT');
          await (entry.git ? stillDeleted(entry.git) : this.verifyDataTransformInput(input));
        };
        await verifyInput();
        const item: DeleteItem = {
          family: 'data-transform',
          identity: { dataSpace: 'default', apiName: name },
          operation: flags.preview ? 'preview' : 'delete',
          outcome: 'blocked',
          mutation: 'not-attempted',
          routes: flags.preview
            ? [
                { operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' },
                { operation: 'dlo.get', apiVersion: '68.0', transport: 'native' },
              ]
            : [
                { operation: 'data-transform.delete', apiVersion: '68.0', transport: 'native' },
                { operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' },
                { operation: 'dlo.get', apiVersion: '68.0', transport: 'native' },
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
          const base = this.createDataTransformClient(target, '68.0', 'default');
          const client = {
            ...base,
            delete: async (value: string): Promise<void> => {
              dispatched = true;
              await base.delete(value);
            },
          };
          warn(
            'Transform definition deletion only. Settlement uses bounded visible inventory and preserved source/output DLOs; exhaustive external-consumer exclusion is not established. No DLO, run, schedule or data cleanup; no retry, atomic concurrency guarantee or fallback.',
          );
          const result = await this.deleteDataTransform(
            desired,
            client,
            this.createDataTransformDloReader(target),
            {
              // A transform deleted in the Git range: the ID resolved during admission.
              targetId: entry.transformTargetId ?? (targetId as string),
              preview: flags.preview,
              confirmDelete: flags['confirm-delete'] === true,
              verifyInput,
            },
          );
          item.outcome = result.outcome === 'preview' ? 'delete' : result.outcome;
          item.mutation = result.mutation;
          if (result.prerequisitesPreserved) item.prerequisitesPreserved = true;
          await track(item, sourceFiles([input.path]));
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
              code: 'TRANSFORM_DELETE_CONFIRMATION_REQUIRED',
              message: 'Pass --confirm-delete to delete; nothing was changed.',
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
        const input = entry.source?.input as SegmentDeployInput;
        const desired = entry.source?.desired as ReturnType<typeof validateSegmentDocument>;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await (entry.git ? stillDeleted(entry.git) : this.verifySegmentInput(input));
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
          'default',
          { preview: flags.preview, confirmDelete: flags['confirm-delete'] === true, verifyInput },
        );
        const item = {
          ...result,
          family: 'segment' as const,
          identity: desired.identity,
          operation: flags.preview ? ('preview' as const) : ('delete' as const),
          routes: [
            { operation: 'segments.delete', apiVersion: '68.0', transport: 'native' as const },
            { operation: 'segments.get', apiVersion: '68.0', transport: 'native' as const },
            { operation: 'dependency.read', apiVersion: '68.0', transport: 'native' as const },
            {
              operation: 'dependency.metadata',
              apiVersion: '68.0',
              transport: 'metadata' as const,
            },
          ],
        };
        return settleOwner(result, item, entry.selector, sourceFiles([input.path]));
      };

      const runIdentityResolution = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const input = entry.source?.input as IdentityResolutionDeployInput;
        const desired = entry.source?.desired as ReturnType<
          typeof nativeIdentityResolutionDocument
        >;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await (entry.git ? stillDeleted(entry.git) : this.verifyIdentityResolutionInput(input));
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
          'default',
          {
            preview: flags.preview,
            confirmDelete: flags['confirm-delete'] === true,
            verifyInput,
          },
        );
        const item = {
          ...result,
          family: 'identity-resolution' as const,
          identity: desired.identity,
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
            {
              operation: 'dependency.metadata',
              apiVersion: '68.0',
              transport: 'metadata' as const,
            },
          ],
        };
        return settleOwner(result, item, entry.selector, sourceFiles([input.path]));
      };

      const runCalculatedInsight = async (entry: DeletePlanInput): Promise<StageStatus> => {
        const input = entry.source?.input as CalculatedInsightDeployInput;
        const desired = entry.source?.desired as ReturnType<
          typeof validateCalculatedInsightDocument
        >;
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('CI_INPUT_DRIFT');
          await (entry.git ? stillDeleted(entry.git) : this.verifyCalculatedInsightInput(input));
        };
        await verifyInput();
        const target = await connect();
        const context = this.calculatedInsightContext(target, 'default');
        await verifyInput();
        this.calculatedInsightObservations = [];
        const result = await this.deleteCalculatedInsight(
          desired,
          target,
          { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
          'default',
          {
            context,
            preview: flags.preview,
            confirmDelete: flags['confirm-delete'] === true,
            verifyInput,
            recordObservation: async (observation) => {
              this.calculatedInsightObservations.push(structuredClone(observation));
            },
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
            {
              operation: 'calculated-insight.metadata',
              apiVersion: '65.0',
              transport: 'metadata' as const,
            },
            { operation: 'dependency.get', apiVersion: '65.0', transport: 'native' as const },
            {
              operation: 'dependency.metadata',
              apiVersion: '65.0',
              transport: 'metadata' as const,
            },
          ],
        };
        return settleOwner(
          result,
          item,
          entry.selector,
          sourceFiles([input.path, input.companionPath]),
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
            identity: { apiName, dataSpace: 'default' },
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
              identity: { dataSpace: 'default', apiName: selectorName(ownedDlo) },
              operation: item.operation,
              outcome: item.outcome,
              mutation: item.mutation,
              removedWith: selector,
            };
            selectorsByItem.set(owned, ownedDlo);
            envelope.result.items.push(owned);
          };
          await verifyInput();
          const options = { deleteDlo, verifyInput };
          if (flags.preview) {
            const preview = await this.preflightDeleteDataStream(apiName, clients, options);
            await verifyInput();
            item.outcome = preview.outcome;
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
            if (result.outcome !== 'deleted') {
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
              const reader = (this.createMappingClient ?? createMappingClient)(
                target,
                version,
                undefined,
                requestScope,
                this.createMappingSender(target, version),
              );
              names = unwrapNativeMappingCollection(
                await reader.list(dependent.name, dlo),
                requestScope,
              ).map((entry) => String(entry.developerName));
            } catch {
              return false;
            }
            return (
              names.length > 0 && names.every((name) => nativeSelectors.includes(`mapping:${name}`))
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
        const withDmo: Array<{ item: DeleteItem; files: LocalFileCandidate[] }> = [];
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
            await track(entry.item, entry.files);
          }
        };
        try {
          for (const selector of ordered) {
            if (selector.startsWith('relationship:')) {
              await this.deleteOneRelationship(
                selector,
                target,
                version,
                flags.preview,
                requestScope,
                envelope,
                selectorsByItem,
                track,
                gitBySelector.get(selector)?.document as NativeRelationshipDocument | undefined,
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
                  requestScope,
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
            try {
              if (mapping) {
                const mappingBase = baseClient as ReturnType<typeof createMappingClient>;
                // The first read of the mapping names its binding, which finds a hand-written file.
                let firstRead: unknown;
                const mappingClient = {
                  ...client,
                  get: async (name: string): Promise<unknown> => {
                    const value = await mappingBase.get(name);
                    if (name === apiName && firstRead === undefined) firstRead = value;
                    return value;
                  },
                  remove: async (name: string): Promise<void> => {
                    dispatched = true;
                    await mappingBase.remove(name);
                  },
                } as ReturnType<typeof createMappingClient>;
                // The DMO read uses the bound single-attempt GET client.
                const dependencies = { target: this.createDmoNativeDeleteClient(target, version) };
                // The file named after the mapping, otherwise the one whose binding matches it.
                const mappingFiles = async (): Promise<LocalFileCandidate[]> => {
                  const canonical = inProject('mapping', `${apiName}.mapping-meta.json`);
                  try {
                    const found = await mappingLocalFile(
                      normalizeNativeMapping(firstRead, requestScope),
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
                    dmo = normalizeNativeMapping(firstRead, requestScope).spec
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
                      apiName,
                      mappingClient,
                      dependencies,
                      requestScope,
                    );
                    item.plan = [{ operation: 'delete', apiName }];
                    item.outcome = 'delete';
                  } else
                    await (this.deleteMapping ?? deleteNativeMapping)(
                      apiName,
                      mappingClient,
                      dependencies,
                      requestScope,
                    );
                } catch (error) {
                  const owner = ownerDmo(error);
                  if (owner === undefined) throw error;
                  item.removedWith = owner;
                  withDmo.push({ item, files: await mappingFiles() });
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
                        requestScope,
                      )
                    : this.retrieveDlo(apiName, definitionClient, requestScope));
                  item.identity = document.identity;
                  item.outcome = 'delete';
                } else {
                  const receipt = await (native
                    ? (this.deleteDmo ?? deleteNativeDmo)(apiName, definitionClient, requestScope)
                    : this.deleteDlo(apiName, definitionClient, requestScope));
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
                refusal !== undefined && refusal === error
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
              identity: {
                dataSpace: nativeFamilies.has(familyOf(input.selector))
                  ? effectiveScope
                  : 'default',
                apiName: selectorName(input.selector),
              },
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
              status =
                family === 'data-graph'
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
