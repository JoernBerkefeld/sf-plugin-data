import {
  DataTransformError,
  dataTransformSpaceMismatch,
} from '../../artifacts/data-transform-document.js';
import { createDataTransformClient } from '../../transport/data-transform-rest.js';
import { preflightDataTransformDeploy } from '../../services/preflight-data-transform-deploy.js';
import {
  DataTransformScheduleError,
  executeDataTransformDeploy,
  rejectedTransformWrite,
} from '../../services/execute-data-transform-deploy.js';
import { resolveDataTransformTargetId } from '../../services/delete-data-transform.js';
import { verifyDataTransformInputDigest } from '../../artifacts/read-deploy-input.js';
import type { DataTransformDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  operateNativeDataGraph,
  nativeGraphLimitations,
} from '../../services/command-native-data-graph.js';
import { nativeDataGraphReadContext } from '../../services/native-data-graph-context.js';
import { createDataGraphClient } from '../../transport/data-graph-rest.js';
import { verifyNativeDataGraphInputDigest } from '../../artifacts/read-deploy-input.js';
import type { NativeDataGraphDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  explainInput,
  explainSpaceMismatch,
  explanationOf,
  hintOf,
  operationDiagnostic,
} from '../../services/operation-diagnostic.js';
import { SegmentError } from '../../artifacts/segment-document.js';
import type { OtherSegmentSpec, SegmentDocument } from '../../artifacts/segment-document.js';
import { bindSegmentChildren } from '../../services/bind-segment-dependencies.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';
import {
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../../transport/connect-diagnostic.js';
import {
  preflightDataStream,
  executeDataStream,
} from '../../services/command-native-data-stream.js';
import { verifyDataStreamInputDigest } from '../../artifacts/read-deploy-input.js';
import { DataStreamError } from '../../artifacts/data-stream-document.js';
import type { DataStreamDeployInput } from '../../artifacts/read-deploy-input.js';
import { dataStreamApiVersion } from '../../transport/api-version.js';
import { ConnectClient } from '../../transport/connect-client.js';
import {
  createDataStreamClient,
  createDataStreamReferenceReader,
} from '../../transport/data-stream-rest.js';
import { preflightMapping, executeMapping } from '../../services/command-native-mapping.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import { openBoundSsot } from '../../transport/bound-ssot.js';
import type { BoundSsot } from '../../transport/bound-ssot.js';
import { NativeMappingError } from '../../artifacts/native-mapping-document.js';
import type { NativeMappingDocument } from '../../artifacts/native-mapping-document.js';
import {
  preflightRelationship,
  executeRelationship,
} from '../../services/command-native-relationship.js';
import { createRelationshipClient } from '../../transport/relationship-rest.js';
import { NativeRelationshipError } from '../../artifacts/native-relationship-document.js';
import type { NativeRelationshipDocument } from '../../artifacts/native-relationship-document.js';
import {
  preflightDmo,
  executeDmo,
  admitDmoFieldRemoval,
  refusedDmo,
  mappedFieldMappings,
} from '../../services/command-native-dmo.js';
import type { DmoCommandOptions, MappedField } from '../../services/command-native-dmo.js';
import { checkFieldRemoval, removeFieldsChecked } from '../../services/delete-dmo-field.js';
import { paceReadback, readbackPace } from '../../services/readback-pace.js';
import { nativeDmoConfirmed } from '../../services/native-dmo.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { isNativeDmoInput } from '../../artifacts/read-deploy-input.js';
import type { NativeDmoDeployInput } from '../../artifacts/read-deploy-input.js';
import { NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { preflightDloDeploy, executeDloDeploy } from '../../services/command-dlo.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { normalizeDlo, unwrapDlo, validateDloDocument } from '../../artifacts/dlo-document.js';
import { reportedIdentity } from '../../artifacts/data-space-field.js';
import {
  DataSpaceError,
  dataSpaceCheckCode,
  dataSpaceCheckOf,
} from '../../services/data-space-check.js';
import {
  nativeDmoWriteScope,
  normalizeNativeDmo,
  unwrapNativeDmo,
} from '../../artifacts/native-dmo-document.js';
import { isDeepStrictEqual } from 'node:util';
import {
  prefixMismatch,
  prefixMismatchError,
  prefixMismatchWarning,
  prefixRuleCoversName,
  prefixRuleCoversRead,
} from '../../services/data-space-prefix.js';
import type { PrefixType } from '../../services/data-space-prefix.js';
import path from 'node:path';
import {
  CrossSpaceError,
  crossSpaceNeedsRulesets,
  crossSpaceRefusal,
  crossSpaceSource,
  fileDataSpaces,
  planCrossSpaceInputs,
  precheckCopyFiles,
  readRulesetEntries,
  writeCopyFile,
} from '../../services/cross-dataspace-deploy.js';
import { crossSpaceUnsupported } from '../../services/cross-dataspace-rename.js';
import type {
  CopyOutcome,
  CrossSpaceFile,
  CrossSpacePlan,
} from '../../services/cross-dataspace-deploy.js';
import {
  authoredDocument,
  authoredNative,
  verifyDloInputDigest,
} from '../../artifacts/read-deploy-input.js';
import type { DloDeployInput } from '../../artifacts/read-deploy-input.js';
import {
  calculatedInsightReadContext,
  readCalculatedInsight,
} from '../../services/native-calculated-insight.js';
import type { CalculatedInsightReadContext } from '../../services/native-calculated-insight.js';
import { preflightCalculatedInsightDeploy } from '../../services/preflight-calculated-insight-deploy.js';
import type { CalculatedInsightPreview } from '../../services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../../services/execute-calculated-insight-deploy.js';
import type { CalculatedInsightExecution } from '../../services/execute-calculated-insight-deploy.js';
import {
  CalculatedInsightError,
  calculatedInsightSpaceMismatch,
} from '../../artifacts/native-calculated-insight-document.js';
import { requireRunSpace, streamFailureCause } from '../../services/native-data-stream.js';
import {
  IdentityResolutionError,
  identityResolutionSpaceMismatch,
} from '../../artifacts/identity-resolution-document.js';
import { DataGraphError } from '../../artifacts/data-graph-document.js';
import { nativeDataGraphSpaceMismatch } from '../../artifacts/native-data-graph-document.js';
import { verifyCalculatedInsightInputDigest } from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import { nativeApiVersion, operationApiVersion } from '../../transport/api-version.js';
import {
  preflightNativeIdentityResolutionDeploy,
  nativeIdentityResolutionDocument,
} from '../../services/preflight-identity-resolution-deploy.js';
import type { NativeIdentityResolutionPreview as IdentityResolutionDeployPreview } from '../../services/preflight-identity-resolution-deploy.js';
import { executeNativeIdentityResolutionDeploy } from '../../services/execute-native-identity-resolution-deploy.js';
import type { NativeIdentityResolutionDeployExecution as IdentityResolutionDeployExecution } from '../../services/execute-native-identity-resolution-deploy.js';
import { createHash } from 'node:crypto';
import { retrieveIdentityResolution } from '../../services/retrieve-identity-resolution.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from '../../services/bind-identity-resolution-dependencies.js';
import type {
  DeployInput,
  IdentityResolutionDeployInput,
} from '../../artifacts/read-deploy-input.js';
import { verifyIdentityResolutionInputDigest } from '../../artifacts/read-deploy-input.js';
import type { ApiVersionSelection } from '../../transport/api-version.js';
import {
  captureDeployInputDigest,
  DeployInputError,
  readDeployInputs,
  skippedVerbatimWarnings,
} from '../../artifacts/read-deploy-input.js';
import { executeSegmentDeploy } from '../../services/execute-segment-deploy.js';
import type { SegmentDeployExecution } from '../../services/execute-segment-deploy.js';
import { preflightSegmentDeploy } from '../../services/preflight-segment-deploy.js';
import type { SegmentDeployPreview } from '../../services/preflight-segment-deploy.js';
import { verifySegmentInputDigest } from '../../artifacts/read-deploy-input.js';
import type { SegmentDeployInput } from '../../artifacts/read-deploy-input.js';
import type { DeployExecutionResult, DeployPreviewResult } from '../../services/deploy-result.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { GitSelectionError, selectGitDeployInputs } from '../../artifacts/git-deploy-selection.js';
import type { GitDeploySelection } from '../../artifacts/git-deploy-selection.js';
import {
  componentKey,
  crudPhase,
  identityResolutionEdges,
  inputDependencies,
  inputKey,
  planDeployStages,
  runCrudStages,
  streamDloCollisions,
  streamLandingDlo,
  transformDloNames,
} from '../../services/crud-plan.js';
import type { CrudStageResult } from '../../services/crud-plan.js';
import {
  dependencyKey,
  DependencySelectionError,
  documentDependencyNode,
  orderDependencyNodes,
} from '../../artifacts/dependency-selection.js';

/**
 * Resolve optional target auth with an explicit bootstrap version before core initialization.
 * @param {string} [aliasOrUsername] Explicit target or configured default when omitted.
 * @returns {Promise<object | undefined>} Command-owned target connection or absent optional auth.
 */
const resolveTargetOrg = async (
  aliasOrUsername?: string,
): Promise<Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'> | undefined> => {
  try {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = aliasOrUsername ?? aggregator.getPropertyValue<string>('target-org');
    const username = target ? state.aliases.resolveUsername(target) : undefined;
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({ username }),
      connectionOptions: { version: '68.0' },
    });
    // Org.create would probe org traits through another unversioned connection.
    return {
      getOrgId: () => connection.getAuthInfoFields().orgId!,
      getUsername: () => connection.getUsername(),
      getConnection: (version?: string) => {
        if (version) connection.setApiVersion(version);
        return connection;
      },
    };
  } catch (error: unknown) {
    if (aliasOrUsername) throw error;
    return undefined;
  }
};

type NativeDmoPreview = Omit<Awaited<ReturnType<typeof preflightDmo>>, 'diagnostics'> & {
  diagnostics: Array<{ code: string; message: string }>;
};

/**
 * Notice for a transform schedule the deploy sends: a schedule copied from another org makes the
 * transform run in this one.
 * @param {Record<string, unknown> | undefined} schedule Schedule of the file.
 * @returns {{code: string, message: string}} TRANSFORM_SCHEDULE_CHANGE notice.
 */
function transformScheduleNotice(schedule: Record<string, unknown> | undefined): {
  code: string;
  message: string;
} {
  const frequency = typeof schedule?.frequency === 'string' ? schedule.frequency : undefined;
  return {
    code: 'TRANSFORM_SCHEDULE_CHANGE',
    message:
      frequency?.toLowerCase() === 'none'
        ? 'The schedule of the file turns the transform schedule off in this org.'
        : `The schedule of the file (${frequency ?? 'as written'}) replaces the transform schedule in this org; the transform then runs on it there.`,
  };
}

/**
 * Native route order: relationships need mapped DMOs, so they follow DLOs, DMOs and mappings.
 * @param {DeployInput} input Native input.
 * @returns {number} Rank.
 */
const rank = (input: DeployInput): number =>
  input.document.kind === 'dlo'
    ? 0
    : input.document.kind === 'dmo'
      ? 1
      : input.document.kind === 'mapping'
        ? 2
        : 3;

type PlannedDependencyFamily =
  | 'identity-resolution'
  | 'calculated-insight'
  | 'segment'
  | 'dlo'
  | 'dmo'
  | 'data-transform'
  | 'data-graph';

type ExecutionItem = Omit<DeployExecutionResult, 'outcome'> & {
  family?:
    | SegmentDeployExecution['family']
    | IdentityResolutionDeployExecution['family']
    | CalculatedInsightExecution['family']
    | 'data-graph'
    | 'dlo'
    | 'dmo'
    | 'mapping'
    | 'relationship'
    | 'data-stream'
    | 'data-transform';
  serverProcessing?: true;
  /** Native DMO fields removed through the Metadata API in this execution. */
  removedFields?: string[];
  targetApiName?: string;
  targetDloName?: string;
  route?:
    | SegmentDeployExecution['route']
    | IdentityResolutionDeployExecution['route']
    | CalculatedInsightExecution['route'];
  requiredEffects?:
    SegmentDeployPreview['requiredEffects'] | IdentityResolutionDeployPreview['requiredEffects'];
  routes?: Array<{
    operation: string;
    apiVersion: string;
    transport: 'native' | 'metadata';
  }>;
  outcome: DeployExecutionResult['outcome'] | 'not-attempted';
  identity: { dataSpace: string; apiName: string };
  operation: 'execute';
  path: string;
};

export type DeployEnvelope = {
  contract: 'sf-data360-deploy';
  contractVersion: '1.1.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: {
    operation: 'deploy';
    preview: boolean;
    plugin: { name: string; version: string };
    apiVersion: string;
    soapApiVersion?: string;
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{
      code: string;
      message: string;
      retryable: false;
      /** Mapped fields a refused removal names, each with the mappings holding its pair. */
      mappedFields?: MappedField[];
    }>;
  };
  provenance: {
    producer: string;
    targetOrgId: string | null;
    pluginVersion: string;
    command: string;
    generatedAt: string;
    git?: GitDeploySelection['provenance'];
  };
  result: {
    scope: { dataSpace: string };
    /**
     * With --allow-cross-dataspace: every file of another data space translated into the run's
     * one (each rewrite and each name that cannot be placed), the copy files planned before any
     * write, and after the deploy what happened to each copy file.
     */
    crossDataSpace?: {
      files: CrossSpaceFile[];
      plannedCopies: string[];
      copies?: CopyOutcome[];
    };
    selection: {
      sourceDir: string[];
      metadata: string[];
      changedSince?: string;
      /** Files deleted in the Git range: reported, never deleted by deploy. */
      deletions?: Array<{ family: string; apiName: string; path: string }>;
    };
    items: Array<
      | ((
          | {
              family: 'data-transform';
              outcome: 'create' | 'update' | 'unchanged';
              diagnostics: Array<{ code: string; message: string }>;
            }
          | DeployPreviewResult
          | SegmentDeployPreview
          | IdentityResolutionDeployPreview
          | CalculatedInsightPreview
          | {
              family: 'data-graph';
              outcome: 'create' | 'update' | 'unchanged' | 'blocked';
              target: 'absent' | 'present' | 'unknown';
              absenceProof: 'none';
              diagnostics: Array<{ code: string; message: string }>;
            }
          | Awaited<ReturnType<typeof preflightDataStream>>
          | {
              family: 'data-stream';
              outcome: 'blocked';
              target: 'unknown';
              absenceProof: 'none';
              requiredEffects: string[];
              diagnostics: Array<{ code: string; message: string }>;
            }
          | NativeDmoPreview
          | Awaited<ReturnType<typeof preflightMapping>>
          | Awaited<ReturnType<typeof preflightRelationship>>
          | {
              family: 'relationship';
              outcome: 'planned-dependencies';
              target: string;
              absenceProof: string;
              diagnostics: Array<{ code: string; message: string }>;
            }
          | {
              family: PlannedDependencyFamily;
              outcome: 'planned-dependencies';
              target: string;
              absenceProof: string;
              diagnostics: Array<{ code: string; message: string }>;
            }
          | {
              family: 'mapping';
              outcome: 'planned-dependencies';
              target: string;
              absenceProof: string;
              diagnostics: Array<{ code: string; message: string }>;
            }
          | import('../../services/command-dlo.js').DloPreview
        ) & {
          routes?: ExecutionItem['routes'];
          identity: { dataSpace: string; apiName: string };
          operation: 'preview';
          path: string;
        })
      | ExecutionItem
    >;
  };
};

/**
 * Add the run's data space prefix to the DMO options, if there is one.
 * @param {[] | [DmoCommandOptions]} options DMO options (field removal).
 * @param {object} prefix The prefix option, or none.
 * @param {string} [prefix.dataSpacePrefix] The run's data space prefix.
 * @returns {[] | [DmoCommandOptions]} Options with the prefix.
 */
function withDataSpacePrefix(
  options: [] | [DmoCommandOptions],
  prefix: { dataSpacePrefix?: string },
): [] | [DmoCommandOptions] {
  if (options.length > 0) return [{ ...options[0], ...prefix }];
  return prefix.dataSpacePrefix === undefined ? [] : [prefix];
}

/** Preview or sequential guarded deployment of explicitly selected authored configuration. */
export default class Deploy extends SfCommand<DeployEnvelope> {
  public static readonly aliases = ['datacloud:deploy', 'd360:deploy', 'dc:deploy'];
  public static readonly summary =
    'Deploy explicit authored Data360 configuration or preview without writes.';
  public static readonly description =
    'Data transforms (data-transform:Name, data360/dataTransforms/Name.dataTransform.json, auto/API68, in the run data space: c__dataSpace must name it and equal definition.dataSpaceName when the definition names one; TRANSFORM_DATASPACE_MISMATCH otherwise, also for an org transform of that name in another data space, resolved from its dataSpaceName or, without one, from its MktDataTransform record read with SOQL (one without any data space is handled in default only); a create outside default needs definition.dataSpaceName) deploy by name: the complete transform list is read, no match creates, one match updates or is unchanged (the file equals the transform as retrieve writes it), a match that differs only in letter case is refused (TRANSFORM_IDENTITY_MISMATCH), two or more are refused (TRANSFORM_TARGET_NOT_RESOLVED). The file is sent as written and Salesforce decides, for a transform of any owner (Salesforce refuses writes to system transforms; a 4xx answer to the first write is reported as rejected); --allow-processing is not needed. Create is validated by Salesforce first; preview is GET-only. The optional schedule key of the file is the desired schedule: absent leaves the schedule alone; otherwise, when it differs from the org schedule as retrieve projects it, it is sent with one schedule PUT after the definition and read back, and an explicit {"frequency":"None"} turns it off (retrieve leaves the key out for a transform without a schedule). A deployed schedule makes the transform run in the target org (TRANSFORM_SCHEDULE_CHANGE in preview and deploy). No run writes. Several transforms deploy one after another in their phase, selected by member, file, directory or --changed-since. Exact data-stream:ApiName deploys canonical data360/data-stream/ApiName.data-stream-meta.json using auto/API68 in the run data space: its c__dataSpace list must name it and, for an existing stream, equal the data spaces of its DLO (a new stream lists the run data space alone, sent as the DLO dataspaceInfo of the create); data spaces change only through the DLO file (STREAM_DATASPACE_MISMATCH). An Ingestion API stream file is sent as written and Salesforce decides: create carries the primary key, the additive and formula mappings and the refresh mode (Salesforce creates UPSERT only); update sends new, changed and removed additive and formula mappings in one PATCH, a removed one as an empty formula (Salesforce refuses changing or removing an existing mapping; reported as rejected). Refused before any write: an additive mapping whose source label names no event field, or several (UNSUPPORTED_STREAM_MAPPING_SOURCE; Salesforce would store a mapping that never carries data), and a change of the refresh mode, DLO label, category, event time field or primary key (UNSUPPORTED_STREAM_SETTINGS_CHANGE; Salesforce answers 200 and keeps the old value). Create/update requires --allow-processing. A stream file of any other connector (connectorInfo.connectorType, for example SalesforceDotCom; only Salesforce CRM is tested live) is translated into the create input (GET spellings renamed, plain field mappings left out) and sent as written: absent (404) creates, otherwise one PATCH of datastreamType and the changed parts, or unchanged; Salesforce decides and its answer is reported (it refuses a CRM refresh mode change); a plain mapping change cannot be sent (UNSUPPORTED_STREAM_SETTINGS_CHANGE). A stream label change (CRM and Ingestion API) is sent as one Metadata API updateMetadata of the DataStreamDefinition of the stream (refusal STREAM_LABEL_UPDATE_REJECTED; a failed read of the record before it STREAM_LABEL_READ_FAILED, with nothing sent; a label still unchanged is STREAM_CHANGE_NOT_APPLIED). Generated target identities are independently resolved; mismatching label intent blocks. Requires explicit files/directories OR exact family:ApiName selectors OR --changed-since Git selection (every family; files deleted in the range are reported in result.selection.deletions and never deleted by deploy (sf data360 delete --changed-since deletes them)). Canonical native DLO/DMO/mapping/relationship JSON defaults to API68 (auto); numeric pins >=61 are retained without upgrade. Any mix of families runs in phases: data streams, then native DLO/DMO/mapping/relationship, then data transforms, then IR/CI/Segment, then data graphs; a phase starts only after every item of the previous phase settled, and the first blocked or failed item stops the run. A DLO file named like the landing DLO of a stream this deploy creates is refused after the read-only comparison of that stream and before any write (DATA_STREAM_DLO_COLLISION); beside an existing stream it deploys and Salesforce decides. Native mixed selections execute DLO then DMO then mapping then relationship, independently settling parents before mapping and relationship dependency checks. A selection with a mapping or relationship may also hold IR, CI and Segment inputs: they run afterwards in the ordered batch, only once every native item settled; preview reports items whose parent an earlier phase creates as planned-dependencies (DEPENDENCIES_PLANNED; MAPPING_DEPENDENCIES_PLANNED for a mapping): a mapping or transform on the landing DLO of a stream preview creates, items on a DLO or DMO the native phase creates, and a graph on a DMO or IR output created earlier. An IR runs before a CI or Segment that uses its unified or link DMO (name derived from the ruleset file), and those start only after the IR is PUBLISHED. A relationship (relationship:Name, data360/relationship/Name.relationship-meta.json) is matched to the org by the name in the file, otherwise by its binding (source DMO and field, target object and field; the target may be a DMO or a CRM object with owner SObject): absent is created with one POST and read back until ACTIVE (a stated label is then set), present with the values of the file (and stated label) is unchanged, and other values are sent as one Metadata API updateMetadata of the whole FieldSrcTrgtRelationship record over the connection of the command and read back (updated); Salesforce decides, and its refusal is RELATIONSHIP_UPDATE_REJECTED (it accepts label, cardinality, source and target field, not target object or owner); after an UNKNOWN_EXCEPTION answer the relationship is read again and, if unchanged, the update is sent once more. Deploy never deletes relationships. The source DMO and a target DMO must be mapped; otherwise Salesforce answers 400 and that answer is reported. Mapping uses exact mapping:ApiName from data360/mapping/ApiName.mapping-meta.json, unique target binding lookup and server-generated target names; create and unchanged repeats are supported; desired-state updates at native API 61 and up remove the authored pairs the file drops, one at a time, then add the new pairs in one batch; any data type, same-name or not, and one source onto several targets are sent as listed and Salesforce decides (preview names pairs of different data types with MAPPING_FIELD_TYPES_DIFFER). The key pair, its key-qualifier pair and the system pairs are never removed (MAPPING_PROTECTED_PAIR_REQUIRED when a file drops one; MAPPING_PROTECTED_LAYOUT_UNPROVEN when the key pair cannot be identified). Generated/key pairs and retained selectors are protected. A pair is removed even when another mapping of the same DMO targets the same field; the field stays mapped until the last such pair is gone. The optional label of a mapping file (spec.label; absent leaves the org label alone) is compared with the org label read through the Metadata API; when it differs, one Metadata API updateMetadata of the ObjectSourceTargetMap record is sent after the create or pair writes settled, carrying the new label and every pair the mapping currently has and no other (a pair left out is kept, a pair sent is added), and the label and pairs are read back; preview shows the planned change (labelChange). A refusal is MAPPING_LABEL_UPDATE_REJECTED (rejected when the label is the only change, unknown after other writes); a failed read MAPPING_LABEL_READ_FAILED. Any DMO may be the mapping target and Salesforce decides (it refuses platform-generated DMOs; that answer is reported). On a target other than an unprefixed custom DMO the generated system and key qualifier pairs are recognised from the target read and never sent, and the first mapping onto a standard DMO (creationType Standard) that is not yet enabled activates it permanently: preview and create carry the notice MAPPING_ACTIVATES_STANDARD_DMO without changing outcome or exit status. Qualification is limited to empty custom fixtures; populated-data behavior is not established. Preview never writes and reports planned dependencies without claiming nonexistent parents are ready. A native DMO changed since a Git reference or selected beside Segment/CI/IR inputs joins the ordered batch on the native route. Prerequisites are checked, never pulled in: each must be selected explicitly or already exist in the target. Native DMO target-name lookup selects confirmed-404 POST or existing-name PATCH with independent GET confirmation. A custom DMO field missing from the file blocks the update unless --allow-field-removal is set; then one Metadata API destructive change for CustomField removes those fields after the PATCH, and readback confirms their absence. A mapped field is removed only when the same selection contains every mapping holding its pair and each mapping file omits that pair; all-native selections check this before the first write (DMO_FIELD_REMOVAL_MAPPED otherwise), then remove the field in the DMO position with one Metadata API destructive change. Salesforce drops the mapping pairs of the field with it; reads before and after confirm that exactly those pairs went and nothing else changed (DMO_FIELD_REMOVAL_SIDE_EFFECT otherwise), and the mappings deployed afterwards find the pairs already gone. A deploy never removes the primary key or a standard, system or generated field: retrieve leaves generated fields out of the file, so a field missing from the file is kept. Platform-owned fields are removed only with sf data360 delete --field. An existing DMO other than an unprefixed custom one (a standard DMO, a platform-generated one such as Derived, Bridge or Adg, or a namespaced custom DMO) takes custom-field additions, label edits and removals plus object label and description changes only: its standard, system and generated fields are never sent or removed by a deploy, may be absent from the file and must match the target when listed (UNSUPPORTED_DMO_FIELD_CHANGE); a new field must be a plain custom field (UNSUPPORTED_DMO_FIELD_ADDITION); its category is ignored and its label is sent only when it differs. A new namespaced name is refused (UNSUPPORTED_DMO_TARGET); Salesforce answers for the rest. Native DLOs use dlo:Name__dll from data360/dlo/Name__dll.dlo-meta.json, whose top-level c__dataSpace list names every data space of the DLO and must hold the run data space (DLO_DATASPACE_MISMATCH); before any read or write the run data space and every listed name are checked against the org (one GET /ssot/data-spaces; UNKNOWN_DATASPACE). A new DLO is created in the run data space, then added to the other listed ones; an existing one is added to listed data spaces it is not in (one PUT naming only this DLO, which keeps every other member, then the DLO is read until it lists them) and removed from unlisted ones only with --allow-dataspace-removal (DLO_DATASPACE_REMOVAL_NOT_ALLOWED otherwise). Target lookup selects PATCH by target ID, or POST only on confirmed HTTP404; auth/permission/lookup failures stop. Preview is read-only; native DLO deploy does not require --allow-processing. Inventory is unavailable. Graph artifacts (*.native-dataGraph.json) use native API68 (auto or explicit 68.0; other versions are rejected) in the run data space (c__dataSpace; definition.dataspaceName, when present, must equal it, and the create sends it; a file of another data space, or an org graph of that name in another one, is DATA_GRAPH_DATASPACE_MISMATCH before any write; a root DMO the read names in another data space is DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE): confirmed absence creates with --allow-processing; an existing graph is updated with one PUT of the file as written, confirmed by independent ready reads; Salesforce decides and a 4xx answer is reported as rejected (it refuses removed fields and related objects, a root change and another related object in place of an existing one). Key-qualifier fields Salesforce added are kept when the file leaves them out. A join change of an existing related object is refused before any write (DATA_GRAPH_JOIN_CHANGE), because Salesforce accepts it but keeps the old join; a graph read back with another join than sent is DATA_GRAPH_CHANGE_NOT_APPLIED. Settings the file leaves out keep their org values; clearing one needs an explicit value. Name and data space identify the graph: a file with another name creates or addresses another graph, and the old graph is not renamed. Identical ready configuration is unchanged without acknowledgement. --wait-timeout sets the native Graph invocation budget in integer seconds (default 1800); readiness retries wait at least 20 seconds with stderr progress. Processing can take seconds to many minutes, up to 30 minutes depending on objects, fields, data volume and service load. In a mixed deploy graphs run last; a graph whose root or related object is the unified or link DMO of a selected IR starts only after that IR is PUBLISHED. --wait-timeout applies to every graph and needs at least one graph in the selection. Calculated insights (calculated-insight:Name__cio, data360/calculatedInsights/Name__cio.calculatedInsight-meta.json joined with its .calculatedInsight-meta.sql) use auto or 68.0 in the run data space, which c__dataSpace in the JSON must name (CI_DATASPACE_MISMATCH); c__dataSpace is sent as dataSpaceName in every create and update. The insight is read by name: absent (HTTP 404) creates it with one POST, present is unchanged when the org holds every key of the file and is updated with one PATCH otherwise; afterwards it is read until it holds the file. The file is sent as written and Salesforce decides (a 4xx answer is reported as rejected); only what the create/update input names differently is translated: dataSpace as dataSpaceName, isFromPackage as createdFromPackage, sourceCiDevName as sourceDeveloperName, UPPER_SNAKE values of definitionType, publishScheduleInterval, historyPublishScheduleInterval and queryDialect as PascalCase, null values are left out, and a PATCH leaves out a definitionType equal to the org value (Salesforce refuses any definitionType on PATCH). The insight runs after the selected DMOs, IRs and insights its SQL names. --draft creates a draft and sends draft: true on update; an update of a DRAFT insight stays a draft. Publication is never implicit (sf data360 publish). --allow-processing is not needed. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Preview is strictly read-only. Each phase stage preflights all of its own items before its first write: a batch of Segment, CI or IR inputs (with DLO/DMO beside them when no mapping or relationship is selected) is preflighted as a whole, and an IR dependent stage only after the IR is PUBLISHED; all-native DLO/DMO/mapping execution admits each ordered item only after earlier parents settle. In a selection that also holds a mapping or relationship, only the local checks of the IR/CI/Segment inputs (version, data space, file shape, dependency identities and order) run before the native writes; their Git snapshot, prerequisite and target checks run in their later stage, so a blocker there can follow earlier native writes, which stay reported. Preview runs every stage read-only, also after a blocked one. Segment (segment:Name, the portable Name.segment.json joined with one Name.segment.<model>.sql per model; a missing or extra SQL file or SQL left in the JSON is INVALID_SOURCE) uses auto or 68.0 in the run data space, which c__dataSpace must name (SEGMENT_DATASPACE_MISMATCH); its segmentOn DMO and Waterfall children are in the same data space (SEGMENT_DEPENDENCY_OTHER_DATASPACE). The file carries the name Salesforce stores (<prefix>_<Name> in a non-default data space; a name without the prefix is SEGMENT_NAME_NOT_STORED), sent unchanged; the create names the data space (?dataspace=). Other versions are refused (INVALID_SCOPE). It is read by its exact name: absent (HTTP 404 ITEM_NOT_FOUND) creates it with one POST, present updates it with one PATCH or is unchanged. The authored definition (label, description, segmentOn DMO, DBT SQL models, UI criteria or another segment type, lookback) is sent as written and Salesforce decides; its error is reported. The optional schedule key of the file is the desired refresh schedule: absent leaves the schedule alone; otherwise, when it differs from the org schedule as retrieve projects it, the POST or PATCH carries it, and an explicit {"frequency":"None"} turns it off (Salesforce refuses that for DBT segments; retrieve leaves the key out for a segment without a schedule). A deployed schedule makes the segment publish in the target org (SEGMENT_SCHEDULE_CHANGE in preview and deploy). The segmentOn DMO must exist (one native read binds its ID for the readback). A Waterfall file lists its child segments by API name (childSegments): each is read in the target and sent by its ID there, a selected child is deployed first (preview: planned-dependencies), and the children the selection does not hold are read before the first write of the run, so a child neither in the target nor selected stops it before any write (SEGMENT_CHILD_NOT_FOUND); a file without childSegments keeps the children of the org segment. Create and update require --allow-processing; identical configuration is unchanged without acknowledgement. Parameters have no write in the API, so a segment with parameters is retrieved as-is (UNSUPPORTED_SEGMENT_VARIANT). Segment XML is unsupported input. Segment deletion is separate: sf data360 delete -m segment:Name reads the segment from the org by name and runs fresh checks. Native IR uses auto or numeric68 in the run data space (c__dataSpace; every DMO, field, DLO source and output it names is in that data space, named as stored there, ds2_Individual__dlm with FirstName__c outside default; the ruleset name is <prefix>_<type>_<rulesetId> outside default, IDENTITY_RESOLUTION_NAME_NOT_STORED before any write otherwise; a ruleset or component of another data space is IDENTITY_RESOLUTION_DATASPACE_MISMATCH or IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE): confirmed exact absence supports CREATE with --allow-processing acknowledging processing and generated-output provisioning; existing settled owners support complete matching and reconciliation PATCH with --allow-processing or read-only identical no-op without acknowledgement. Ordered source priorities, object defaults and explicit field overrides are preserved; fields:[] restores inheritance. Automatic run, explicit run and delete are unsupported; no API67 fallback is attempted. --async (IR only) returns as soon as Salesforce accepts an IR create or update (creation-processing / update-processing, mutation acknowledged-processing) instead of waiting minutes for PUBLISHED: publish, settings and generated outputs are not confirmed; rerun the same deploy to check (IDENTITY_RESOLUTION_NOT_SETTLED while in flight, unchanged once settled). --async is refused when the selection holds a graph, CI or Segment on the unified DMO of that IR (IDENTITY_RESOLUTION_ASYNC_DEPENDENTS). Selections mixing IR with other non-native families require auto. Other changes block before writes. Stops on first blocked or failed item; no retry or rollback. No local report/artifact writes.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; resolved only after local admission.',
    }),
    'api-version': Flags.orgApiVersion({
      default: 'auto',
      summary:
        'Native DLO/DMO/mapping default or auto68, numeric >=61 retained; other families keep their qualified versions.',
      parse: async (value, context, options) =>
        value === 'auto' ? value : Flags.orgApiVersion().parse(value, context, options),
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary:
        'The run data space; omitted means default, and the org must have it. --data-space is a compatibility alias. A DLO or data stream file must list it in c__dataSpace; every other file must name it in c__dataSpace (or use --allow-cross-dataspace).',
    }),
    'source-dir': Flags.string({
      char: 'd',
      multiple: true,
      multipleNonGreedy: true,
      summary: 'Explicit authored JSON file or directory; repeatable.',
      exclusive: ['changed-since'],
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Exact data-transform:Name, data-stream:ApiName, mapping:ApiName, relationship:Name, dlo:Name__dll, dmo:ApiName, segment:ApiName, calculated-insight:ApiName__cio, data-graph:ApiName or identity-resolution:ExactObjectApiName member.',
      exclusive: ['changed-since'],
    }),
    'changed-since': Flags.string({
      summary:
        'Select canonical plugin files of every family changed since the merge base with a commit reference; deleted files are reported, not deleted (use sf data360 delete --changed-since).',
      exclusive: ['source-dir', 'metadata'],
    }),
    'allow-processing': Flags.boolean({
      default: false,
      summary:
        'Acknowledge stream create/update, Graph create/update and Segment/IR processing; IR CREATE also provisions generated outputs. Data transforms and calculated insights do not need it.',
    }),
    'allow-field-removal': Flags.boolean({
      default: false,
      summary:
        'Native DMO only: remove custom target fields missing from the file with a Metadata API destructive change. A mapped field needs every mapping holding its pair, without the pair, in the same selection; Salesforce drops the pair together with the field. The primary key and standard, system or generated fields missing from the file are kept, never removed (retrieve leaves generated fields out); sf data360 delete --field removes those.',
    }),
    'allow-cross-dataspace': Flags.boolean({
      char: 'c',
      default: false,
      summary:
        'Only with more than one data space: deploy files of another data space into --dataspace. DMO, mapping, relationship, DLO (membership only), UI, Waterfall and SQL (DBT) segment, calculated insight, data graph, identity resolution and STL transform (load, join and output nodes only) files are translated in memory by rule, the SQL of insights and DBT segments name by name (prefix, ssot__; identity resolution outputs from the ruleset list when their ruleset is not deployed with them); each translated file gets a copy file under its new name after it deployed. Other kinds and any name that cannot be placed exactly are refused before any write. With --preview it lists every rewrite (for SQL with its file, line and column).',
    }),
    'allow-dataspace-removal': Flags.boolean({
      default: false,
      summary:
        'DLO only: remove a DLO from the org data spaces its c__dataSpace list no longer names (DELETE of that data space member). Without it such a removal is refused before any write.',
    }),
    async: Flags.boolean({
      default: false,
      summary:
        'IR only: return once Salesforce accepts the IR create/update instead of waiting for PUBLISHED. Skips confirming publish, settings and generated outputs; rerun the same deploy to check.',
    }),
    'wait-timeout': Flags.integer({
      min: 1,
      summary:
        'Wait budget in seconds for each selected native data graph; default 1800, no write retries.',
    }),
    draft: Flags.boolean({
      default: false,
      summary:
        'CI only (auto or 68.0): create as a draft and send draft: true on update; never publishes.',
    }),
    preview: Flags.boolean({
      default: false,
      summary: 'Strictly read-only target comparison; never executes deployment.',
    }),
  };

  protected createDataTransformClient = createDataTransformClient;
  protected preflightDataTransform = preflightDataTransformDeploy;
  protected executeDataTransform = executeDataTransformDeploy;
  protected resolveDataTransformTarget = resolveDataTransformTargetId;
  protected verifyDataTransformInput = verifyDataTransformInputDigest;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
  protected verifyNativeDataGraphInput = verifyNativeDataGraphInputDigest;
  protected preflightDataStream = preflightDataStream;
  protected executeDataStream = executeDataStream;
  protected verifyDataStreamInput = verifyDataStreamInputDigest;
  protected createDataStreamClients = (
    connection: Connection,
    target: string,
    version: string,
  ): Parameters<typeof executeDataStream>[1] => {
    const reader = new ConnectClient(connection, version);
    return {
      // Writes go over the command's shared bound sender, never a child CLI process.
      streams: createDataStreamClient(target, reader, version, this.ssotSender(target, version)),
      ...createDataStreamReferenceReader(reader, version),
      dlo: {
        get: (name) =>
          reader.get(
            `/services/data/v${version}/ssot/data-lake-objects/${encodeURIComponent(name)}`,
          ),
      },
    };
  };
  protected createMappingClient = createMappingClient;
  protected preflightMapping = preflightMapping;
  protected executeMapping = executeMapping;
  protected createRelationshipClient = createRelationshipClient;
  protected preflightRelationship = preflightRelationship;
  protected executeRelationship = executeRelationship;
  protected resolveTargetOrg = resolveTargetOrg;
  /** Read-only binding of the Waterfall child segments a deploy does not select. */
  protected bindChildSegments = bindSegmentChildren;
  protected createDmoClient = createDmoClient;
  protected preflightNativeDmo = preflightDmo;
  protected executeNativeDmo = executeDmo;
  protected admitNativeDmoRemoval = admitDmoFieldRemoval;
  protected preflightDlo = preflightDloDeploy;
  protected executeDlo = executeDloDeploy;
  protected verifyDloInput = verifyDloInputDigest;
  protected createDloClient = createDloClient;
  // Native DLO/DMO/mapping/relationship/stream reads and writes share one bound Connection per
  // org and version instead of one CLI process per call. Only the Metadata API destructive
  // deploys (DMO field removal, mapping remove) still start `sf project deploy start`.
  // Tests replace this seam.
  protected createSsotSender = (target: string, version: string): BoundSsot =>
    openBoundSsot(target, version);
  private ssotSenders?: Map<string, BoundSsot>;
  /**
   * One shared bound sender per org and API version.
   * @param {string} target Resolved username.
   * @param {string} version Numeric API version.
   * @returns {BoundSsot} Lazily opened sender.
   */
  protected ssotSender(target: string, version: string): BoundSsot {
    const key = `${target}\n${version}`;
    // Tests build commands without field initializers, so both fields may be absent.
    this.ssotSenders ??= new Map();
    let sender = this.ssotSenders.get(key);
    if (!sender) {
      sender = (this.createSsotSender ?? openBoundSsot)(target, version);
      this.ssotSenders.set(key, sender);
    }
    return sender;
  }

  protected calculatedInsightContext = calculatedInsightReadContext;
  protected preflightCalculatedInsight = preflightCalculatedInsightDeploy;
  protected executeCalculatedInsight = executeCalculatedInsightDeploy;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected resolveInputs = readDeployInputs;
  protected selectGitInputs = selectGitDeployInputs;
  protected preflightSegment = preflightSegmentDeploy;
  protected verifySegmentInput = verifySegmentInputDigest;
  protected captureInput = captureDeployInputDigest;
  protected executeSegment = executeSegmentDeploy;
  protected preflightIdentityResolution = preflightNativeIdentityResolutionDeploy;
  protected executeIdentityResolution = executeNativeIdentityResolutionDeploy;
  protected verifyIdentityResolutionInput = verifyIdentityResolutionInputDigest;
  /**
   * Bind exact CREATE absence or independently settled owner/outputs before batch mutation.
   * @param {IdentityResolutionDeployInput} input Immutable authored IR input.
   * @param {Connection} connection Fixed API68 operation receiver.
   * @param {ApiVersionSelection} selection Fixed per-operation selection.
   * @returns {Promise<string>} Private stable target fingerprint.
   */
  protected async bindIdentityResolution(
    input: IdentityResolutionDeployInput,
    connection: Connection,
    selection: ApiVersionSelection,
  ): Promise<string> {
    // The ruleset's data space: deploy refused a file outside the run's before any stage.
    const dataSpace = input.document.c__dataSpace;
    const dataSpacePrefix =
      dataSpace === 'default'
        ? undefined
        : await dataSpaceCheckOf(this, async () => {
            throw new DataSpaceError('TARGET_ORG_REQUIRED');
          }).prefixOf(dataSpace);
    const preview = await this.preflightIdentityResolution(
      input.document,
      connection,
      selection,
      dataSpace,
      dataSpacePrefix === undefined ? {} : { dataSpacePrefix },
    );
    if (preview.outcome === 'create')
      return createHash('sha256')
        .update(
          JSON.stringify({
            phase: 'precreate',
            absenceProof: preview.absenceProof,
            binding: preview.precreateBinding,
          }),
        )
        .digest('hex');
    if (!['update', 'unchanged'].includes(preview.outcome))
      throw retainConnectDiagnostic(
        new Error('IR target binding unavailable'),
        getConnectDiagnostic(preview),
      );
    const dependencies = await bindIdentityResolutionDependencies(
      input.document,
      connection,
      selection,
      dataSpace,
    );
    const acquired = await retrieveIdentityResolution(
      connection,
      input.document.identity.apiName,
      selection,
      dataSpace,
    );
    if (!acquired.candidate || !acquired.expectations || acquired.blockers.length > 0)
      throw retainConnectDiagnostic(
        new Error('IR target binding unavailable'),
        getConnectDiagnostic(acquired),
      );
    const outputs = await verifyIdentityResolutionOutputs(
      {
        targetApiName: input.document.identity.apiName,
        targetId: acquired.expectations.native.id as string,
        dataSpace,
      },
      acquired.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity,
        targetApiName: sourceApiName,
      })),
      connection,
      selection,
    );
    return createHash('sha256')
      .update(
        JSON.stringify({ phase: 'existing', dependencies, owner: acquired.expectations, outputs }),
      )
      .digest('hex');
  }

  /**
   * Read one component whose name breaks the data space prefix rule, to tell a create from an
   * update before the first write of the run, the way each type's own stage tells them apart: a
   * DMO's GET 404, an insight's 404 with a Salesforce error code, a transform's name missing from
   * the complete inventory (ignoring case), a graph's exact not-found answer. Any other failure
   * stops the run.
   * @param {PrefixType} type Kind of component.
   * @param {string} name Its name.
   * @param {string} space The run's data space.
   * @param {unknown} targetOrg The --target-org flag value.
   * @returns {Promise<{native: unknown} | undefined>} The raw read, or undefined when absent.
   */
  protected async readPrefixTarget(
    type: PrefixType,
    name: string,
    space: string,
    targetOrg: unknown,
  ): Promise<{ native: unknown } | undefined> {
    const org =
      targetOrg && typeof targetOrg === 'object'
        ? (targetOrg as Pick<Org, 'getConnection' | 'getUsername'>)
        : await (this.resolveTargetOrg ?? resolveTargetOrg)(targetOrg as string | undefined);
    const target = org?.getUsername();
    if (!org || !target) throw new DataSpaceError('TARGET_ORG_REQUIRED');
    if (type === 'dmo')
      try {
        return {
          native: await (this.createDmoClient ?? createDmoClient)(
            target,
            '68.0',
            undefined,
            this.ssotSender(target, '68.0'),
          ).get(name),
        };
      } catch (error) {
        if (
          error instanceof NativeDmoError &&
          error.code === 'DMO_HTTP_ERROR' &&
          error.status === 404
        )
          return undefined;
        throw error;
      }
    const connection = org.getConnection('68.0');
    if (type === 'calculated-insight') {
      const read = await readCalculatedInsight(
        (this.calculatedInsightContext ?? calculatedInsightReadContext)(connection, space),
        name,
      );
      return read.state === 'absent' ? undefined : { native: read.raw };
    }
    if (type === 'data-transform') {
      const client = (this.createDataTransformClient ?? createDataTransformClient)(
        connection,
        '68.0',
        space,
      );
      const targetId = await (this.resolveDataTransformTarget ?? resolveDataTransformTargetId)(
        client,
        name,
      );
      return targetId === undefined ? undefined : { native: await client.get(targetId) };
    }
    const context = await (this.nativeGraphContext ?? nativeDataGraphReadContext)(
      connection,
      space,
    );
    const read = await context.get(name);
    if (read.status === 200) return { native: read.body };
    // The item route's exact not-found answer (live API 68; HTTP 400, not 404).
    if (
      read.status === 400 &&
      isDeepStrictEqual(read.body, [
        { errorCode: 'INTERNAL_ERROR', message: `Data Graph not found with name ${name}` },
      ])
    )
      return undefined;
    throw retainConnectDiagnostic(new Error('Data graph read failed'), getConnectDiagnostic(read));
  }

  /**
   * Validate inputs, then admit native items in dependency order or preflight the whole remaining
   * selection before sequential execution.
   * @returns {Promise<DeployEnvelope>} Versioned preview or execution outcomes with mutation evidence.
   */
  public async run(): Promise<DeployEnvelope> {
    const { flags } = await this.parse(Deploy);
    // The run's data space: every request of a converted family names it explicitly.
    const effectiveScope = flags.dataspace ?? 'default';
    const dloOptions = { allowDataspaceRemoval: flags['allow-dataspace-removal'] };
    // Passed to the native DMO services only when the removal was explicitly allowed.
    // A refused removal of a mapped field names its mappings through this read-only inventory and
    // repeats the target org and data space exactly as they were passed.
    const passedOrg = flags['target-org'] as unknown;
    const fieldRemoval = (
      mappings: () => Pick<ReturnType<typeof createMappingClient>, 'list' | 'get'>,
      dmoReader: () => Pick<ReturnType<typeof createDmoClient>, 'get'>,
    ): [] | [DmoCommandOptions] =>
      flags['allow-field-removal'] === true
        ? [
            {
              allowFieldRemoval: true,
              mappedFieldGuide: {
                mappings,
                ...(typeof passedOrg === 'string' ? { targetOrg: passedOrg } : {}),
                ...(flags.dataspace === undefined ? {} : { dataspace: flags.dataspace }),
              },
              // Reads before and after the one removal: fields gone, exactly their pairs dropped
              // by Salesforce, every other mapping, pair and field unchanged.
              precheckRemoval: async (apiName, fields, coverage) => {
                await checkFieldRemoval(
                  apiName,
                  fields,
                  { dmo: dmoReader(), mappings: mappings() },
                  coverage,
                  effectiveScope,
                );
              },
              removeChecked: async (apiName, fields, remove, coverage) => {
                const dropped = await removeFieldsChecked(
                  apiName,
                  fields,
                  { dmo: dmoReader(), mappings: mappings() },
                  remove,
                  coverage,
                  effectiveScope,
                );
                return dropped.map(
                  ({ mapping, sourceFieldDeveloperName, targetFieldDeveloperName }) => ({
                    mapping,
                    sourceFieldDeveloperName,
                    targetFieldDeveloperName,
                  }),
                );
              },
            },
          ]
        : [];
    /**
     * The run's data space prefix as an option, read from the run's one data space check (already
     * done before any stage); none in the default data space or when the list names none.
     * @returns {Promise<{dataSpacePrefix?: string}>} The option.
     */
    const dataSpacePrefixOption = async (): Promise<{ dataSpacePrefix?: string }> => {
      if (effectiveScope === 'default') return {};
      const prefix = await dataSpaceCheckOf(this, async () => {
        throw new DataSpaceError('TARGET_ORG_REQUIRED');
      }).prefixOf(effectiveScope);
      return prefix === undefined ? {} : { dataSpacePrefix: prefix };
    };
    const cwd = process.cwd();
    /**
     * A file path as the output shows it: relative to the working directory.
     * @param {string} file Absolute path.
     * @returns {string} Shown path.
     */
    const shown = (file: string): string => path.relative(cwd, file) || file;
    // Opens the shared bound sender for the run's one data space list read.
    const openSpaceSender = async (): Promise<BoundSsot> => {
      const checkOrg =
        passedOrg && typeof passedOrg === 'object'
          ? (passedOrg as Pick<Org, 'getUsername'>)
          : flags['target-org'] === undefined && !this.resolveTargetOrg
            ? undefined
            : await (this.resolveTargetOrg ?? resolveTargetOrg)(flags['target-org']);
      const checkTarget = checkOrg?.getUsername();
      if (!checkTarget) throw new DataSpaceError('TARGET_ORG_REQUIRED');
      return this.ssotSender(checkTarget, '68.0');
    };
    let crossPlan: CrossSpacePlan | undefined;
    // The mapping as Salesforce holds it (also an unchanged one), read back, for its copy file.
    const mappingTargets = new Map<string, NativeMappingDocument>();
    const plugin = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };
    const envelope: DeployEnvelope = {
      contract: 'sf-data360-deploy',
      contractVersion: '1.1.0',
      status: 'blocked',
      metadata: {
        operation: 'deploy',
        preview: flags.preview,
        plugin,
        apiVersion: flags['api-version'],
      },
      diagnostics: { warnings: [], errors: [] },
      provenance: {
        producer: plugin.name,
        // eslint-disable-next-line unicorn/no-null -- Stable JSON represents unresolved target identity explicitly.
        targetOrgId: null,
        pluginVersion: plugin.version,
        command: 'sf data360 deploy',
        generatedAt: new Date().toISOString(),
      },
      result: {
        scope: { dataSpace: effectiveScope },
        selection: { sourceDir: flags['source-dir'] ?? [], metadata: flags.metadata ?? [] },
        items: [],
      },
    };
    const families = new Map<string, string>();
    // Prefix rule warnings of existing components, shown in the human output too.
    const prefixWarnings = new Set<string>();
    const mappingNames = new Map<string, string>();
    const processingDlos = new Set<string>();
    const mappingChanges = new Map<
      string,
      Parameters<NonNullable<Parameters<typeof executeMapping>[3]>>[0]
    >();
    const finish = (
      status: DeployEnvelope['status'],
      code?: string,
      error?: unknown,
    ): DeployEnvelope => {
      envelope.status = status;
      if (code) {
        const mappedFields = mappedFieldMappings(error);
        const mutations = envelope.result.items.map((item) =>
          'mutation' in item ? item.mutation : undefined,
        );
        // Without an unknown write, say plainly what happened instead of the generic warning.
        const rejected =
          'Deployment did not complete: Salesforce rejected a write and nothing was written for that item. Read its diagnostic, correct the input and rerun. No automatic retry or rollback was performed.';
        const settled =
          error !== undefined || mutations.includes('unknown')
            ? undefined
            : code === 'INVALID_SCOPE'
              ? `${flags.preview ? 'Preview' : 'Deployment'} did not start: the requested --api-version or --dataspace is not supported for a selected family, and nothing was sent to the org. Use a supported version and data space, then rerun.`
              : flags.preview
                ? code === 'DEPLOY_PREVIEW_BLOCKED'
                  ? 'Preview found an item the deploy would refuse or could not check; nothing was sent to the org. Read the item diagnostics, fix the cause, then preview again. No deployment executed.'
                  : undefined
                : mutations.includes('rejected')
                  ? rejected
                  : mutations.every(
                        (mutation) => mutation === undefined || mutation === 'not-attempted',
                      )
                    ? 'Deployment did not complete and nothing was written to the org. Read the item diagnostics, fix the cause, then rerun.'
                    : undefined;
        envelope.diagnostics.errors.push({
          code,
          message:
            settled ??
            operationDiagnostic(
              error,
              flags.preview
                ? 'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.'
                : // A rejected write without any unknown one wrote nothing: no unknown mutation to inspect.
                  mutations.includes('rejected') && !mutations.includes('unknown')
                  ? rejected
                  : // A blocked run whose items wrote nothing was refused before any write; a
                    // failed run may have written before its error, so it keeps the warning.
                    status === 'blocked' &&
                      mutations.every(
                        (mutation) => mutation === undefined || mutation === 'not-attempted',
                      )
                    ? 'Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.'
                    : 'Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.',
            ),
          retryable: false,
          ...hintOf(error),
          ...(mappedFields ? { mappedFields } : {}),
        });
      }
      if (status !== 'success') process.exitCode = 1;
      annotateDiagnostics(envelope);
      if (!this.jsonEnabled()) {
        this.log(
          flags.preview
            ? `Deploy preview: ${status}${code ? ` (${code})` : ''}. No deployment executed.`
            : `Deploy execution: ${status}${code ? ` (${code})` : ''}. No automatic retry or rollback performed.`,
        );
        // The default data space goes without saying; any other is named.
        if (effectiveScope !== 'default') this.log(`Data space: ${effectiveScope}.`);
        const crossDataSpace = envelope.result.crossDataSpace;
        for (const translated of crossDataSpace?.files ?? []) {
          this.log(
            `Translated from ${translated.from}: ${shown(translated.path)} (${translated.family}).`,
          );
          for (const rewrite of translated.rewrites)
            this.log(`  ${rewrite.at}: ${rewrite.from} -> ${rewrite.to} (${rewrite.rule}).`);
          for (const entry of translated.unresolved)
            this.log(`  Cannot place ${entry.at}: ${entry.name} (${entry.reason}).`);
        }
        if (flags.preview)
          for (const copy of crossDataSpace?.plannedCopies ?? [])
            this.log(`Planned copy file: ${shown(copy)}.`);
        for (const copy of crossDataSpace?.copies ?? [])
          this.log(
            copy.outcome === 'not-written'
              ? `Copy file not written for ${shown(copy.source)}: ${copy.reason}.`
              : `Copy file ${copy.outcome === 'written' ? 'written' : 'unchanged (same content)'}: ${shown(copy.path!)}.`,
          );
        for (const deletion of envelope.result.selection.deletions ?? [])
          this.log(
            `Not deleted: ${deletion.family}:${deletion.apiName} (file deleted in the Git range; deploy never deletes; delete it with sf data360 delete --changed-since ${envelope.result.selection.changedSince ?? '<ref>'} --confirm-delete after a --preview).`,
          );
        for (const warning of envelope.diagnostics.warnings)
          if (warning.startsWith('Skipped ') || prefixWarnings.has(warning))
            this.log(`Warning: ${warning}`);
        for (const item of envelope.result.items) {
          const family =
            families.get(item.path) ?? ('family' in item ? item.family : undefined) ?? 'dmo';
          const apiName =
            mappingNames.get(item.path) ??
            (item.operation === 'execute' && item.targetApiName
              ? item.targetApiName
              : item.identity.apiName);
          const component = `${family}:${apiName}`;
          if (
            item.operation === 'execute' &&
            ((item.outcome === 'created' && item.mutation === 'confirmed-created') ||
              (item.outcome === 'updated' && item.mutation === 'confirmed-updated'))
          )
            this.log(
              `${item.outcome} ${family} ${apiName}${processingDlos.has(item.path) ? ' (server is still processing)' : ''}`,
            );
          else if (item.operation === 'execute' && item.mutation === 'acknowledged-processing')
            this.log(
              `${item.outcome} ${family} ${apiName} (accepted; publish not confirmed - rerun the same deploy to check)`,
            );
          else
            this.log(
              item.operation === 'preview'
                ? `Planned ${item.outcome}: ${component}.`
                : `${item.outcome === 'created' ? 'Created' : item.outcome === 'updated' ? 'Updated' : item.outcome === 'unchanged' ? 'Unchanged' : item.outcome === 'failed' ? 'Failed' : item.outcome === 'blocked' ? 'Blocked' : 'Not attempted'}: ${component}; mutation: ${item.mutation}.`,
            );
          if (
            item.operation === 'execute' &&
            item.outcome === 'updated' &&
            item.mutation === 'confirmed-updated'
          ) {
            const changes = mappingChanges.get(item.path);
            for (const [label, pairs] of [
              ['Deleted', changes?.deleted],
              ['Added', changes?.added],
            ] as const)
              if (pairs?.length)
                this.log(
                  `${label} field mappings: ${pairs.map((pair) => `${pair.sourceFieldDeveloperName} -> ${pair.targetFieldDeveloperName}`).join(', ')}.`,
                );
            if (changes?.label !== undefined)
              this.log(`Label set to ${JSON.stringify(changes.label)}.`);
          }
          if (item.operation === 'preview' && 'labelChange' in item && item.labelChange)
            this.log(
              `Planned label change: ${item.labelChange.from === undefined ? '' : `${JSON.stringify(item.labelChange.from)} -> `}${JSON.stringify(item.labelChange.to)}.`,
            );
          if ('dataSpaceChanges' in item && item.dataSpaceChanges)
            for (const [label, done, spaces] of [
              ['add the DLO to', 'added the DLO to', item.dataSpaceChanges.add],
              ['remove the DLO from', 'removed the DLO from', item.dataSpaceChanges.remove],
            ] as const)
              if (spaces.length > 0)
                this.log(
                  item.operation === 'preview'
                    ? `Planned data space change: ${label} ${spaces.join(', ')}.`
                    : `Data space change: ${done} ${spaces.join(', ')}.`,
                );
          if (item.operation === 'preview' && 'plan' in item)
            for (const step of item.plan)
              this.log(
                `Planned field ${step.operation}: ${step.sourceFieldDeveloperName} -> ${step.targetFieldDeveloperName}${'developerName' in step ? ` (${step.developerName})` : ''}.`,
              );
          // The same diagnostic can come from the preflight and the execution of one item.
          const logged = new Set<string>();
          for (const diagnostic of [
            ...item.diagnostics,
            ...(item.operation === 'execute' && 'preflight' in item
              ? (item.preflight?.diagnostics ?? [])
              : []),
          ]) {
            const line = formatDiagnostic(diagnostic);
            if (logged.has(line)) continue;
            logged.add(line);
            this.log(line);
          }
          if (item.operation === 'execute' && item.mutation === 'unknown')
            this.log('Mutation may have occurred. Inspect target before any further attempt.');
        }
        if (!flags.preview) {
          const created = envelope.result.items.filter(
            (item) =>
              item.operation === 'execute' &&
              item.outcome === 'created' &&
              item.mutation === 'confirmed-created',
          ).length;
          const updated = envelope.result.items.filter(
            (item) =>
              item.operation === 'execute' &&
              item.outcome === 'updated' &&
              item.mutation === 'confirmed-updated',
          ).length;
          const failed = envelope.result.items.filter(
            (item) => item.operation === 'execute' && item.outcome === 'failed',
          ).length;
          const processing = envelope.result.items.filter(
            (item) => item.operation === 'execute' && item.mutation === 'acknowledged-processing',
          ).length;
          this.log(
            `Deployed: ${created + updated} (${created} created / ${updated} updated / ${failed} failed)${processing ? `; accepted, still processing: ${processing}` : ''}`,
          );
        }
        for (const diagnostic of envelope.diagnostics.errors)
          this.log(formatDiagnostic(diagnostic));
      }
      return envelope;
    };
    try {
      const changedSince = flags['changed-since'];
      if (
        changedSince !== undefined &&
        (flags['source-dir'] !== undefined || flags.metadata !== undefined)
      )
        return finish('blocked', 'INVALID_SELECTION');
      let sourceDirectories = flags['source-dir'];
      let gitDlos: GitDeploySelection['dlos'];
      let gitCalculatedInsights: GitDeploySelection['calculatedInsights'];
      let gitSegments: GitDeploySelection['segments'];
      let gitIdentityResolutions: GitDeploySelection['identityResolutions'];
      let gitCaptured: GitDeploySelection['capturedInputs'];
      if (changedSince !== undefined) {
        envelope.result.selection.changedSince = changedSince;
        const selected = await this.selectGitInputs({ cwd, ref: changedSince });
        envelope.provenance.git = selected.provenance;
        envelope.diagnostics.warnings.push(...(selected.warnings ?? []));
        if (selected.deletions?.length)
          envelope.result.selection.deletions = selected.deletions.map((deletion) => ({
            family: deletion.family,
            apiName: deletion.identity.apiName,
            path: deletion.path,
          }));
        if (selected.paths.length === 0) return finish('success');
        gitCaptured = selected.capturedInputs ?? [];
        sourceDirectories = selected.paths;
        gitDlos = selected.dlos;
        gitCalculatedInsights = selected.calculatedInsights;
        gitSegments = selected.segments;
        gitIdentityResolutions = selected.identityResolutions;
      }
      const authoredInputs = await this.resolveInputs({
        cwd,
        sourceDir: sourceDirectories,
        metadata: flags.metadata,
      });
      let resolvedInputs = authoredInputs;
      // Verbatim files (retrieved as-is) in a selected folder were skipped with a warning.
      const skipped = skippedVerbatimWarnings(resolvedInputs);
      envelope.diagnostics.warnings.push(...skipped);
      // Bind every resolved input, of every family, to the bytes the Git selection admitted.
      if (gitCaptured) {
        if (resolvedInputs.length !== gitCaptured.length)
          throw new GitSelectionError('INVALID_GIT_SELECTION');
        for (const input of resolvedInputs)
          if (
            !gitCaptured.some(
              (captured) =>
                captured.path === input.path &&
                captured.inputDigest === input.inputDigest &&
                JSON.stringify(captured.document) === JSON.stringify(input.document),
            )
          )
            throw new GitSelectionError('INVALID_GIT_SELECTION');
      }
      // --allow-cross-dataspace: files of another data space are translated into the run's one, in
      // memory, before any other check. Only then is the space list read early (the same single
      // read the data space check below reuses); a selection of the run's data space reads nothing.
      if (
        flags['allow-cross-dataspace'] === true &&
        authoredInputs.some(
          (input) =>
            crossSpaceSource(
              input.document as unknown as Record<string, unknown>,
              effectiveScope,
            ) !== undefined,
        )
      ) {
        let plan: CrossSpacePlan;
        try {
          const check = dataSpaceCheckOf(this, openSpaceSender);
          await check.require([
            effectiveScope,
            ...authoredInputs.flatMap((input) =>
              fileDataSpaces(input.document as unknown as Record<string, unknown>),
            ),
          ]);
          const spaces = await check.entries();
          // The ruleset list is read once, only when a file names an identity resolution output.
          const rulesets = crossSpaceNeedsRulesets(authoredInputs, effectiveScope, spaces)
            ? await readRulesetEntries(openSpaceSender)
            : undefined;
          plan = planCrossSpaceInputs(authoredInputs, effectiveScope, spaces, rulesets);
        } catch (error) {
          return finish('blocked', dataSpaceCheckCode(error, 'TARGET_ORG_REQUIRED'), error);
        }
        crossPlan = plan;
        envelope.result.crossDataSpace = { files: plan.files, plannedCopies: [] };
        const refusal = crossSpaceRefusal(plan, effectiveScope, shown);
        if (refusal) return finish('blocked', refusal.code, refusal);
        try {
          envelope.result.crossDataSpace.plannedCopies = await precheckCopyFiles(
            plan.inputs.filter((input) => plan.files.some((entry) => entry.path === input.path)),
            shown,
          );
        } catch (error) {
          return finish(
            'blocked',
            error instanceof CrossSpaceError ? error.code : 'OUTPUT_FAILED',
            error,
          );
        }
        resolvedInputs = plan.inputs;
      }
      if (
        flags.async &&
        !resolvedInputs.some((input) => input.document.kind === 'identity-resolution')
      )
        return finish('blocked', 'INVALID_ASYNC_SCOPE');
      // An IR that returns before PUBLISHED cannot be the parent of a graph, CI or Segment
      // selected beside it (they read its unified DMO).
      if (flags.async && identityResolutionEdges(resolvedInputs).size > 0)
        return finish('blocked', 'IDENTITY_RESOLUTION_ASYNC_DEPENDENTS');
      const transformInputs = resolvedInputs.filter(
        (input): input is DataTransformDeployInput => input.document.kind === 'data-transform',
      );
      if (transformInputs.length > 0 && !['auto', '68.0'].includes(flags['api-version']))
        return finish('blocked', 'INVALID_TRANSFORM_SCOPE');
      if (
        flags.draft &&
        (!['auto', '68.0'].includes(flags['api-version']) ||
          resolvedInputs.length === 0 ||
          resolvedInputs.some((input) => input.document.kind !== 'calculated-insight'))
      )
        return finish('blocked', 'INVALID_DRAFT_SCOPE');
      for (const input of resolvedInputs)
        families.set(
          input.path,
          input.document.kind === 'native-data-graph' ? 'data-graph' : input.document.kind,
        );
      // Every selected file was a skipped verbatim file: nothing to deploy.
      if (resolvedInputs.length === 0 && skipped.length > 0) return finish('success');
      if (resolvedInputs.length === 0 && changedSince === undefined)
        return finish('blocked', 'INVALID_SELECTION');
      const graphInputs = resolvedInputs.filter(
        (input): input is NativeDataGraphDeployInput => input.document.kind === 'native-data-graph',
      );
      if (
        flags['wait-timeout'] !== undefined &&
        (graphInputs.length === 0 ||
          !Number.isSafeInteger(flags['wait-timeout']) ||
          flags['wait-timeout'] < 1)
      )
        return finish('blocked', 'INVALID_WAIT_TIMEOUT_SCOPE');
      if (graphInputs.length > 0) {
        try {
          operationApiVersion(flags['api-version'], 'data-graph');
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
      }
      const streamInputs = resolvedInputs.filter(
        (input): input is DataStreamDeployInput => input.document.kind === 'data-stream',
      );
      let streamVersion = '68.0';
      if (streamInputs.length > 0) {
        try {
          streamVersion = dataStreamApiVersion(flags['api-version']);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
      }
      const legacyInputs = resolvedInputs.filter(
        (
          input,
        ): input is Exclude<
          DeployInput,
          | NativeDataGraphDeployInput
          | import('../../artifacts/read-deploy-input.js').DataTransformDeployInput
          | DataStreamDeployInput
        > =>
          input.document.kind !== 'native-data-graph' &&
          input.document.kind !== 'data-transform' &&
          input.document.kind !== 'data-stream',
      );
      const isP1 = (input: DeployInput): boolean => crudPhase(input) === 'P1';
      // Selections with a mapping or relationship (explicit or Git) and all-native explicit
      // selections run their P1 inputs (DLO, DMO, mapping, relationship) on the native route as
      // the first stage; P3 inputs (IR, CI, Segment) follow in the dependency batch. A native
      // DLO/DMO-only Git selection, or one beside P3 inputs only, stays in the batch as before.
      // A transform reads and writes DLOs, so selected DLOs must settle before it (P1 before P2).
      const nativeRoute =
        legacyInputs.some(
          (input) => input.document.kind === 'mapping' || input.document.kind === 'relationship',
        ) ||
        transformInputs.length > 0 ||
        (legacyInputs.every((input) => isP1(input)) && changedSince === undefined);
      const edges = identityResolutionEdges(legacyInputs);
      const stageResult = (
        status: CrudStageResult['status'],
        code?: string,
        error?: unknown,
      ): CrudStageResult => ({
        status,
        ...(code === undefined ? {} : { code }),
        ...(error === undefined ? {} : { error }),
      });
      const runNativeStage = async (
        nativeInputs: typeof legacyInputs,
        earlier: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        let version: string;
        try {
          version = nativeApiVersion(flags['api-version']);
        } catch {
          return stageResult('blocked', 'INVALID_SCOPE');
        }
        // Sort the freshly admitted selection, never preflight dependent mappings before parents settle.

        nativeInputs.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
        const verify = async (): Promise<void> => {
          for (const input of nativeInputs) await captureDeployInputDigest(input);
        };
        await verify();
        const injected = flags['target-org'] as unknown;
        const org =
          injected && typeof injected === 'object'
            ? (injected as Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>)
            : flags['target-org'] === undefined && !this.resolveTargetOrg
              ? undefined
              : await (this.resolveTargetOrg ?? resolveTargetOrg)(flags['target-org']);
        if (!org || !org.getUsername()) return stageResult('blocked', 'TARGET_ORG_REQUIRED');
        const target = org.getUsername()!;
        envelope.provenance.targetOrgId = org.getOrgId();
        envelope.metadata.apiVersion = flags['api-version'] ?? 'auto';
        envelope.metadata.soapApiVersion = version;
        const source = (this.createDloClient ?? createDloClient)(
          target,
          version,
          this.ssotSender(target, version),
        );
        const dmo = (this.createDmoClient ?? createDmoClient)(
          target,
          version,
          undefined,
          this.ssotSender(target, version),
        );
        const mapping = (): ReturnType<typeof createMappingClient> =>
          (this.createMappingClient ?? createMappingClient)(
            target,
            version,
            undefined,
            effectiveScope,
            this.ssotSender(target, version),
          );
        const relationship = (): ReturnType<typeof createRelationshipClient> =>
          (this.createRelationshipClient ?? createRelationshipClient)(
            target,
            version,
            effectiveScope,
            this.ssotSender(target, version),
          );
        // The run's data space prefix: a mapping onto a standard DMO copy that is not activated yet
        // is sent in the default spelling once, and a DMO file for such a copy is refused.
        const dataSpacePrefix = await dataSpacePrefixOption();
        // Parents settle before dependents: mappings and relationships need their DMOs.
        const hasMappings = nativeInputs.some(
          (input) => input.document.kind === 'mapping' || input.document.kind === 'relationship',
        );
        // Lower-case component keys planned for creation: by earlier stages (a stream's landing
        // DLO) and by this stage.
        const plannedParents = new Set<string>(earlier);
        // Field removal beside mappings. Every selected DMO is admitted read-only before the first
        // write of the batch: a mapped field it omits must lose all its pairs through selected
        // mapping files, otherwise the whole batch is refused. An admitted DMO removes such a
        // field in its normal position; Salesforce drops the pairs with it, so the mapping files
        // deployed afterwards find them already gone.
        const [removal] = fieldRemoval(mapping, () => dmo);
        const covered = new Map<string, { fields: string[]; sources: string[] }>();
        if (removal) {
          const selectedMappings = nativeInputs
            .filter((input) => input.document.kind === 'mapping')
            .map((input) => {
              const spec = input.document
                .spec as import('../../artifacts/native-mapping-document.js').NativeMappingDocument['spec'];
              return {
                apiName: input.document.identity.apiName,
                path: input.path,
                source: spec.sourceEntityDeveloperName,
                target: spec.targetEntityDeveloperName,
                targetFields: spec.fieldMappings.map((pair) => pair.targetFieldDeveloperName),
              };
            });
          for (const input of nativeInputs) {
            if (input.document.kind !== 'dmo') continue;
            const identity = reportedIdentity(input.document, effectiveScope);
            try {
              const admission = await (this.admitNativeDmoRemoval ?? admitDmoFieldRemoval)(
                input.document,
                dmo,
                effectiveScope,
                removal.mappedFieldGuide,
                selectedMappings,
              );
              if (admission.coveredMappedFields.length > 0)
                covered.set(input.path, {
                  fields: admission.coveredMappedFields,
                  sources: selectedMappings
                    .filter((entry) => entry.target === identity.apiName)
                    .map((entry) => entry.source),
                });
            } catch (error) {
              // Preview reports the refusal as its error; execution as the one blocked item.
              if (flags.preview) throw error;
              envelope.result.items.push({
                ...refusedDmo(error),
                family: 'dmo',
                identity,
                operation: 'execute',
                path: input.path,
              });
              return stageResult('blocked');
            }
          }
          await verify();
        }
        for (const input of nativeInputs) {
          await verify();
          const kind = input.document.kind;
          const identity = reportedIdentity(input.document, effectiveScope);
          const dmoOptions = withDataSpacePrefix(
            removal
              ? [
                  {
                    ...removal,
                    coveredMappedFields: covered.get(input.path)?.fields ?? [],
                    coveredMappingSources: covered.get(input.path)?.sources ?? [],
                  },
                ]
              : [],
            dataSpacePrefix,
          );
          if (flags.preview) {
            const spec =
              kind === 'mapping'
                ? (input.document
                    .spec as import('../../artifacts/native-mapping-document.js').NativeMappingDocument['spec'])
                : undefined;
            const planned =
              spec &&
              (plannedParents.has(componentKey('dlo', spec.sourceEntityDeveloperName)) ||
                plannedParents.has(componentKey('dmo', spec.targetEntityDeveloperName)));
            if (kind === 'relationship') {
              const binding = (input.document as NativeRelationshipDocument).spec;
              // A DMO this batch creates cannot be listed yet; nothing is asserted about it.
              const relationshipPreview =
                plannedParents.has(componentKey('dmo', binding.sourceObjectName)) ||
                plannedParents.has(componentKey('dmo', binding.targetObjectName))
                  ? {
                      family: 'relationship' as const,
                      outcome: 'planned-dependencies' as const,
                      target: 'unknown',
                      absenceProof: 'none',
                      diagnostics: [
                        {
                          code: 'RELATIONSHIP_DEPENDENCIES_PLANNED',
                          message:
                            'Selected DMO creation must settle before relationship comparison; no relationship existence or write outcome is asserted.',
                        },
                      ],
                    }
                  : await (this.preflightRelationship ?? preflightRelationship)(
                      input.document,
                      relationship(),
                      effectiveScope,
                    );
              await verify();
              envelope.result.items.push({
                ...relationshipPreview,
                identity,
                operation: 'preview',
                path: input.path,
              });
              continue;
            }
            const preview = planned
              ? {
                  family: 'mapping' as const,
                  outcome: 'planned-dependencies' as const,
                  target: 'unknown',
                  absenceProof: 'none',
                  diagnostics: [
                    {
                      code: 'MAPPING_DEPENDENCIES_PLANNED',
                      message:
                        'Selected parent creation must settle before mapping comparison; no mapping existence or write outcome is asserted.',
                    },
                  ],
                }
              : kind === 'mapping'
                ? await (this.preflightMapping ?? preflightMapping)(
                    input.document,
                    mapping(),
                    { source, target: dmo, ...dataSpacePrefix },
                    effectiveScope,
                  )
                : kind === 'dlo'
                  ? await (this.preflightDlo ?? preflightDloDeploy)(
                      input.document,
                      source,
                      effectiveScope,
                      dloOptions,
                    )
                  : await (this.preflightNativeDmo ?? preflightDmo)(
                      input.document,
                      dmo,
                      effectiveScope,
                      ...dmoOptions,
                    );
            await verify();
            envelope.result.items.push({
              ...preview,
              identity,
              operation: 'preview',
              path: input.path,
            });
            if (preview.outcome === 'blocked')
              // Later preview stages still run; hand on what this stage plans so far.
              return {
                ...stageResult('blocked'),
                planned: [...plannedParents],
              };
            if (preview.outcome === 'create')
              plannedParents.add(componentKey(kind, identity.apiName));
            continue;
          }
          // Each executor independently admits and settles this item before the next dependency read.
          const result =
            kind === 'relationship'
              ? await (this.executeRelationship ?? executeRelationship)(
                  input.document,
                  relationship(),
                  effectiveScope,
                )
              : kind === 'mapping'
                ? await (this.executeMapping ?? executeMapping)(
                    input.document,
                    mapping(),
                    { source, target: dmo, ...dataSpacePrefix },
                    (changes) => mappingChanges.set(input.path, changes),
                    effectiveScope,
                    (apiName) => mappingNames.set(input.path, apiName),
                    (_apiName, document) => mappingTargets.set(input.path, document),
                  )
                : kind === 'dlo'
                  ? await (this.executeDlo ?? executeDloDeploy)(
                      input.document,
                      source,
                      effectiveScope,
                      dloOptions,
                    )
                  : await (this.executeNativeDmo ?? executeDmo)(
                      input.document,
                      dmo,
                      effectiveScope,
                      ...dmoOptions,
                    );
          const { serverProcessing, ...execution } = result as typeof result & {
            serverProcessing?: true;
          };
          if (kind === 'dlo' && serverProcessing) processingDlos.add(input.path);
          envelope.result.items.push({
            ...execution,
            family: kind as 'mapping' | 'relationship' | 'dlo' | 'dmo',
            identity,
            operation: 'execute',
            path: input.path,
          });
          if (result.outcome === 'blocked' || result.outcome === 'failed')
            return stageResult(result.outcome);
          if (hasMappings && kind !== 'mapping' && kind !== 'relationship') {
            // Independently verify definitions; only DLO reads expose an ACTIVE settlement status.
            let settled = false;
            try {
              for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
                await paceReadback(attempt);
                const raw =
                  kind === 'dlo'
                    ? unwrapDlo(await source.get(identity.apiName))
                    : unwrapNativeDmo(await dmo.get(identity.apiName));
                const actual =
                  kind === 'dlo'
                    ? normalizeDlo(raw, effectiveScope)
                    : normalizeNativeDmo(raw, effectiveScope);
                if (
                  actual.identity.apiName !== identity.apiName ||
                  (actual.kind === 'dmo' && actual.c__dataSpace !== identity.dataSpace)
                )
                  break;
                const desired = input.document
                  .spec as import('../../artifacts/dlo-document.js').DloDocument['spec'];
                const fields = new Map(actual.spec.fields.map((field) => [field.name, field]));
                if (
                  kind === 'dmo'
                    ? // Same comparison the DMO executor used: category case and write-only keys.
                      nativeDmoConfirmed(
                        input.document as import('../../artifacts/native-dmo-document.js').NativeDmoDocument,
                        actual as import('../../artifacts/native-dmo-document.js').NativeDmoDocument,
                        [],
                        nativeDmoWriteScope(raw) === 'standard',
                      )
                    : raw.status === 'ACTIVE' &&
                      actual.spec.label === desired.label &&
                      actual.spec.category === desired.category &&
                      (desired.eventDateTimeFieldName === undefined ||
                        actual.spec.eventDateTimeFieldName === desired.eventDateTimeFieldName) &&
                      (desired.recordModifiedFieldName === undefined ||
                        actual.spec.recordModifiedFieldName === desired.recordModifiedFieldName) &&
                      desired.fields.every((field) => {
                        const found = fields.get(field.name);
                        return (
                          found &&
                          Object.entries(field).every(
                            ([key, value]) =>
                              (key === 'isDynamicLookup' &&
                                value === false &&
                                found[key] === undefined) ||
                              isDeepStrictEqual(found[key], value),
                          )
                        );
                      })
                ) {
                  settled = true;
                  processingDlos.delete(input.path);
                  break;
                }
              }
            } catch {
              /* An unconfirmed independent parent read stops dependent writes. */
            }
            if (!settled) {
              Object.assign(envelope.result.items.at(-1)!, {
                outcome: 'failed',
                mutation: 'unknown',
                diagnostics: [
                  {
                    code: 'NATIVE_PARENT_SETTLEMENT_UNCONFIRMED',
                    message:
                      'Selected parent did not independently confirm its requested definition and family-specific readiness; dependent deployment stopped.',
                  },
                ],
              });
              return stageResult('failed');
            }
          }
        }
        await verify();
        // Preview: parents this stage plans to create; later stages report dependents as planned.
        return { status: 'success', planned: [...plannedParents] };
      };
      const runBatchStage = async (
        stageInputs: typeof legacyInputs,
        planned: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        const base = envelope.result.items.length;
        // Git snapshots minus those another stage owns; a snapshot missing from the whole
        // selection stays, so its count check still blocks.
        const stagePaths = new Set(stageInputs.map((input) => input.path));
        const otherPaths = new Set(
          legacyInputs.map((input) => input.path).filter((file) => !stagePaths.has(file)),
        );
        const own = <T extends { path: string }>(list: readonly T[] | undefined): T[] | undefined =>
          list?.filter((item) => !otherPaths.has(item.path));
        const stageGitDlos = own(gitDlos);
        const stageGitCalculatedInsights = own(gitCalculatedInsights);
        const stageGitSegments = own(gitSegments);
        const stageGitIdentityResolutions = own(gitIdentityResolutions);
        // The flag parser admits only auto or a numeric version; refuse anything else unparsed.
        if (!/^(?:auto|\d{2,3}\.0)$/u.test(flags['api-version']))
          return stageResult('blocked', 'INVALID_SCOPE');
        const admitted = stageInputs.filter(
          (
            input,
          ): input is Exclude<
            DeployInput,
            | import('../../artifacts/read-deploy-input.js').MappingDeployInput
            | import('../../artifacts/read-deploy-input.js').RelationshipDeployInput
            | DataStreamDeployInput
            | NativeDataGraphDeployInput
            | import('../../artifacts/read-deploy-input.js').DataTransformDeployInput
          > => input.document.kind !== 'mapping' && input.document.kind !== 'relationship',
        );
        // Native DMO items keep the native version rule (auto is 68.0), not another family's pin.
        const admitVersion = (input: (typeof admitted)[number]): void => {
          if (isNativeDmoInput(input)) nativeApiVersion(flags['api-version']);
          else if (input.document.kind === 'identity-resolution')
            operationApiVersion(flags['api-version'], 'identity-resolution');
          else operationApiVersion(flags['api-version'], input.document.kind);
        };
        // A Segment runs on API68 only; any other pin is refused before the first target read.
        if (admitted.some((input) => input.document.kind === 'segment'))
          try {
            operationApiVersion(flags['api-version'], 'segment');
          } catch {
            return stageResult('blocked', 'INVALID_SCOPE');
          }
        const hasDlos = admitted.some((input) => input.document.kind === 'dlo');
        if (hasDlos) {
          try {
            for (const input of admitted) admitVersion(input);
          } catch {
            return stageResult('blocked', 'INVALID_SCOPE');
          }
          for (const input of admitted)
            if (input.document.kind === 'dlo') validateDloDocument(input.document);
        }
        if (stageGitDlos) {
          const current = admitted.filter(
            (input): input is DloDeployInput => input.document.kind === 'dlo',
          );
          if (
            current.length !== stageGitDlos.length ||
            stageGitDlos.some(
              (captured) =>
                !current.some(
                  (input) =>
                    input.path === captured.path &&
                    input.inputDigest === captured.inputDigest &&
                    // A translated DLO (-c) still binds to the file's own document.
                    JSON.stringify(authoredDocument(input)) === JSON.stringify(captured.document),
                ),
            )
          )
            throw new GitSelectionError('INVALID_GIT_SELECTION');
          for (const input of stageGitDlos) await this.verifyDloInput(input);
        }
        const hasCalculatedInsights = admitted.some(
          (input) => input.document.kind === 'calculated-insight',
        );
        if (hasCalculatedInsights) {
          try {
            for (const input of admitted) admitVersion(input);
          } catch {
            return stageResult('blocked', 'INVALID_SCOPE');
          }
        }
        if (stageGitCalculatedInsights) {
          const current = admitted.filter(
            (input): input is CalculatedInsightDeployInput =>
              input.document.kind === 'calculated-insight',
          );
          if (
            current.length !== stageGitCalculatedInsights.length ||
            stageGitCalculatedInsights.some(
              (captured) =>
                !current.some(
                  (input) =>
                    input.path === captured.path &&
                    input.companionPath === captured.companionPath &&
                    input.inputDigest === captured.inputDigest &&
                    // A translated insight (-c) still binds to the files' own insight.
                    JSON.stringify(authoredNative(input)) === JSON.stringify(captured.native),
                ),
            )
          )
            throw new GitSelectionError('INVALID_GIT_SELECTION');
          for (const captured of stageGitCalculatedInsights)
            await this.verifyCalculatedInsightInput(captured);
        }
        // Bind every captured Git owner to the original immutable authored bytes, never drop IR.
        if (stageGitIdentityResolutions) {
          const current = admitted.filter(
            (input) => input.document.kind === 'identity-resolution',
          ) as IdentityResolutionDeployInput[];
          if (
            current.length !== stageGitIdentityResolutions.length ||
            stageGitIdentityResolutions.some(
              (captured) =>
                !current.some(
                  (input) =>
                    input.path === captured.path &&
                    input.inputDigest === captured.inputDigest &&
                    JSON.stringify(input.document) === JSON.stringify(captured.document),
                ),
            )
          )
            throw new GitSelectionError('INVALID_GIT_SELECTION');
          for (const captured of stageGitIdentityResolutions)
            await this.verifyIdentityResolutionInput(captured);
        }
        let inputs = admitted;
        const hasIdentityResolutions = inputs.some(
          (input) => input.document.kind === 'identity-resolution',
        );
        if (hasIdentityResolutions) {
          for (const input of inputs) {
            const family =
              input.document.kind === 'identity-resolution'
                ? 'identity-resolution'
                : input.document.kind === 'segment'
                  ? 'segment'
                  : input.document.kind === 'calculated-insight'
                    ? 'calculated-insight'
                    : input.document.kind === 'dlo'
                      ? 'dlo'
                      : 'dmo';
            try {
              admitVersion(input);
            } catch {
              return stageResult('blocked', 'INVALID_SCOPE');
            }
            if (family === 'identity-resolution') {
              try {
                nativeIdentityResolutionDocument(input.document);
              } catch (error) {
                return stageResult(
                  'blocked',
                  error instanceof Error && /^IDENTITY_RESOLUTION_[A-Z0-9_]+$/u.test(error.message)
                    ? error.message
                    : 'INVALID_SOURCE',
                );
              }
            }
          }
        }
        if (stageGitSegments) {
          const current = inputs.filter(
            (input): input is SegmentDeployInput => input.document.kind === 'segment',
          );
          if (
            current.length !== stageGitSegments.length ||
            stageGitSegments.some(
              (captured) =>
                !current.some(
                  (input) =>
                    input.path === captured.path && input.inputDigest === captured.inputDigest,
                ),
            )
          )
            throw new GitSelectionError('INVALID_GIT_SELECTION');
          for (const captured of stageGitSegments) await this.verifySegmentInput(captured);
        }
        if (inputs.length === 0) return stageResult('blocked', 'INVALID_SELECTION');
        const hasNativeDmos = inputs.some((input) => isNativeDmoInput(input));
        let nativeDmoVersion = '68.0';
        try {
          if (hasNativeDmos) nativeDmoVersion = nativeApiVersion(flags['api-version']);
        } catch {
          return stageResult('blocked', 'INVALID_SCOPE');
        }
        const hasSegments = inputs.some((input) => input.document.kind === 'segment');
        // Ordered in the run's data space: a calculated insight after the DMOs and insights its
        // SQL names (in its own space; a reference into another space is refused).
        if (hasSegments || hasIdentityResolutions || hasCalculatedInsights || hasDlos) {
          const nodes = inputs.map((input) =>
            input.document.kind === 'segment' ||
            input.document.kind === 'identity-resolution' ||
            input.document.kind === 'calculated-insight' ||
            input.document.kind === 'dlo'
              ? documentDependencyNode(input.document, 'deploy', effectiveScope)
              : {
                  identity: {
                    kind: 'dmo' as const,
                    ...reportedIdentity(input.document, effectiveScope),
                  },
                  dependencies: [],
                },
          );
          // Keyed like the nodes, so a DLO uses the space its node names.
          const byKey = new Map(
            inputs.map((input, index) => [dependencyKey(nodes[index].identity), input]),
          );
          inputs = orderDependencyNodes(nodes).map((key) => byKey.get(key)!);
        }
        // Preserve original Segment JSON snapshots and bind mixed-batch DMO bytes before target reads.
        const captured =
          hasSegments || hasIdentityResolutions || hasCalculatedInsights || hasDlos || hasNativeDmos
            ? await Promise.all(
                inputs.map(async (input) => ({
                  input,
                  digest:
                    input.document.kind === 'segment' ? undefined : await this.captureInput(input),
                })),
              )
            : [];
        const verifyInputs = async (): Promise<void> => {
          for (const input of stageGitDlos ?? []) await this.verifyDloInput(input);
          for (const input of stageGitCalculatedInsights ?? [])
            await this.verifyCalculatedInsightInput(input);
          for (const { input, digest } of captured) {
            if (input.document.kind === 'calculated-insight')
              await this.verifyCalculatedInsightInput(input as CalculatedInsightDeployInput);
            if (input.document.kind === 'identity-resolution')
              await this.verifyIdentityResolutionInput(input as IdentityResolutionDeployInput);
            if (input.document.kind === 'segment')
              await this.verifySegmentInput(input as SegmentDeployInput);
            else if ((await this.captureInput(input)) !== digest)
              throw new DependencySelectionError('DEPENDENCY_INPUT_CHANGED');
          }
        };
        await verifyInputs();
        const familySelection = (input: DeployInput): ApiVersionSelection =>
          input.document.kind === 'segment'
            ? (() => {
                const version = operationApiVersion(flags['api-version'], 'segment');
                return Object.freeze({
                  requested: version,
                  restSelector: `v${version}`,
                  soapNumeric: version,
                });
              })()
            : input.document.kind === 'dlo' ||
                input.document.kind === 'identity-resolution' ||
                input.document.kind === 'calculated-insight'
              ? Object.freeze({ requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' })
              : isNativeDmoInput(input)
                ? Object.freeze({
                    requested: nativeDmoVersion,
                    restSelector: `v${nativeDmoVersion}`,
                    soapNumeric: nativeDmoVersion,
                  })
                : selection;
        const routes = (input: DeployInput): ExecutionItem['routes'] =>
          input.document.kind === 'segment'
            ? [
                {
                  operation: 'segment.deploy',
                  apiVersion: familySelection(input).soapNumeric,
                  transport: 'native',
                },
                {
                  operation: 'dependency.get',
                  apiVersion: familySelection(input).soapNumeric,
                  transport: 'native',
                },
              ]
            : input.document.kind === 'dlo'
              ? [
                  {
                    operation: 'dlo.deploy',
                    apiVersion: '68.0',
                    transport: 'native',
                  },
                ]
              : input.document.kind === 'identity-resolution'
                ? [
                    {
                      operation: 'identity-resolutions.get',
                      apiVersion: '68.0',
                      transport: 'native',
                    },
                    {
                      operation:
                        irAdmissions.get(input.path)?.outcome === 'create'
                          ? 'dependency.get'
                          : 'dependency-and-output.get',
                      apiVersion: '68.0',
                      transport: 'native',
                    },
                    ...(irAdmissions.get(input.path)?.outcome === 'create'
                      ? [
                          {
                            operation: 'data-model-objects.list',
                            apiVersion: '68.0',
                            transport: 'native' as const,
                          },
                        ]
                      : []),
                    {
                      operation:
                        irAdmissions.get(input.path)?.route.operation ??
                        'identity-resolutions.patch',
                      apiVersion: '68.0',
                      transport: 'native',
                    },
                  ]
                : input.document.kind === 'calculated-insight'
                  ? [
                      {
                        operation: 'calculated-insight.deploy',
                        apiVersion: '68.0',
                        transport: 'native',
                      },
                      {
                        operation: 'calculated-insight.get',
                        apiVersion: '68.0',
                        transport: 'native',
                      },
                    ]
                  : isNativeDmoInput(input)
                    ? [
                        {
                          operation: 'dmo.deploy',
                          apiVersion: nativeDmoVersion,
                          transport: 'native',
                        },
                      ]
                    : undefined;
        const injectedOrg = flags['target-org'] as unknown;
        const org =
          injectedOrg && typeof injectedOrg === 'object'
            ? (injectedOrg as Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>)
            : flags['target-org'] === undefined && !this.resolveTargetOrg
              ? undefined
              : await (this.resolveTargetOrg ?? resolveTargetOrg)(flags['target-org']);
        if (!org) return stageResult('blocked', 'TARGET_ORG_REQUIRED');
        envelope.provenance.targetOrgId = org.getOrgId();
        // auto is 68.0; each family below still pins its own version.
        const batchVersion = flags['api-version'] === 'auto' ? '68.0' : flags['api-version'];
        const selection: ApiVersionSelection = Object.freeze({
          requested: batchVersion,
          restSelector: `v${batchVersion}`,
          soapNumeric: batchVersion,
        });
        envelope.metadata.soapApiVersion = inputs.every(
          (input) => input.document.kind === 'identity-resolution',
        )
          ? '68.0'
          : selection.soapNumeric;
        const connection = org.getConnection(selection.soapNumeric);
        // Core Org may reuse and mutate one receiver; pin a distinct operation-local view instead.
        const connectionFor = (input: DeployInput): Connection => {
          if (
            input.document.kind !== 'identity-resolution' &&
            input.document.kind !== 'segment' &&
            input.document.kind !== 'calculated-insight' &&
            input.document.kind !== 'dlo'
          )
            return connection;
          const receiver = Object.create(connection) as Connection;
          const version = familySelection(input).soapNumeric;
          Object.defineProperty(receiver, 'version', { value: version });
          Object.defineProperty(receiver, 'getApiVersion', { value: () => version });
          Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
          return receiver;
        };
        const dloClient = (): ReturnType<typeof createDloClient> => {
          const username = org.getUsername();
          if (!username) throw new Error('TARGET_ORG_REQUIRED');
          return this.createDloClient(username, '68.0', this.ssotSender(username, '68.0'));
        };
        const dmoClient = (): ReturnType<typeof createDmoClient> => {
          const username = org.getUsername();
          if (!username) throw new Error('TARGET_ORG_REQUIRED');
          return (this.createDmoClient ?? createDmoClient)(
            username,
            nativeDmoVersion,
            undefined,
            this.ssotSender(username, nativeDmoVersion),
          );
        };
        // Read-only mapping inventory for a refused mapped-field removal; built only on refusal.
        const dmoMappings = (): ReturnType<typeof createMappingClient> => {
          const username = org.getUsername();
          if (!username) throw new Error('TARGET_ORG_REQUIRED');
          return (this.createMappingClient ?? createMappingClient)(
            username,
            nativeDmoVersion,
            undefined,
            effectiveScope,
            this.ssotSender(username, nativeDmoVersion),
          );
        };
        const previewNativeDmo = async (input: NativeDmoDeployInput): Promise<NativeDmoPreview> =>
          (this.preflightNativeDmo ?? preflightDmo)(
            input.document,
            dmoClient(),
            effectiveScope,
            ...withDataSpacePrefix(
              fieldRemoval(dmoMappings, dmoClient),
              await dataSpacePrefixOption(),
            ),
          );
        const irAdmissions = new Map<string, IdentityResolutionDeployPreview>();
        const irBindings = new Map<string, string>();
        const verifyIrBinding = async (input: DeployInput): Promise<void> => {
          if (input.document.kind !== 'identity-resolution') return;
          const fingerprint = await this.bindIdentityResolution(
            input as IdentityResolutionDeployInput,
            connectionFor(input),
            familySelection(input),
          );
          const prior = irBindings.get(input.path);
          if (prior !== undefined && prior !== fingerprint) throw new Error('IR binding drift');
          irBindings.set(input.path, fingerprint);
        };
        const ciContexts = new Map<string, CalculatedInsightReadContext>();
        const ciIntent = (
          input: DeployInput,
        ): { context?: CalculatedInsightReadContext; draft?: true } => {
          if (input.document.kind !== 'calculated-insight') return {};
          let context = ciContexts.get(input.path);
          if (!context) {
            context = this.calculatedInsightContext(connectionFor(input), effectiveScope);
            ciContexts.set(input.path, context);
          }
          context.check();
          return { context, ...(flags.draft ? { draft: true as const } : {}) };
        };
        let failed = false;
        let blocked = false;
        for (const input of inputs) {
          // A parent created by an earlier stage of this preview does not exist yet: report the
          // item as planned instead of comparing it against a target that cannot hold it.
          const parents = inputDependencies(input, edges).filter((key) => planned.has(key));
          if (parents.length > 0) {
            envelope.result.items.push({
              family: input.document.kind as PlannedDependencyFamily,
              outcome: 'planned-dependencies',
              target: 'unknown',
              absenceProof: 'none',
              diagnostics: [
                {
                  code: 'DEPENDENCIES_PLANNED',
                  message: `Selected parent ${parents.join(', ')} is created earlier in this deploy and must settle before this item is compared; no existence or write outcome is asserted.`,
                },
              ],
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'preview',
              path: input.path,
            });
            continue;
          }
          try {
            const segment = input.document.kind === 'segment';
            if (segment) await this.verifySegmentInput(input as SegmentDeployInput);
            const preview =
              input.document.kind === 'dlo'
                ? await this.preflightDlo(input.document, dloClient(), effectiveScope, dloOptions)
                : input.document.kind === 'calculated-insight'
                  ? await this.preflightCalculatedInsight(
                      (input as CalculatedInsightDeployInput).native,
                      connectionFor(input),
                      familySelection(input),
                      effectiveScope,
                      ciIntent(input),
                    )
                  : input.document.kind === 'identity-resolution'
                    ? await this.preflightIdentityResolution(
                        input.document,
                        connectionFor(input),
                        familySelection(input),
                        effectiveScope,
                        await dataSpacePrefixOption(),
                      )
                    : segment
                      ? await this.preflightSegment(
                          input.document,
                          connectionFor(input),
                          familySelection(input),
                          effectiveScope,
                        )
                      : await previewNativeDmo(input as NativeDmoDeployInput);
            if (input.document.kind === 'dlo') await this.verifyDloInput(input as DloDeployInput);
            if (input.document.kind === 'identity-resolution') {
              await this.verifyIdentityResolutionInput(input as IdentityResolutionDeployInput);
              irAdmissions.set(input.path, preview as IdentityResolutionDeployPreview);
              if (['create', 'update', 'unchanged'].includes(preview.outcome))
                await verifyIrBinding(input);
              const effects: readonly string[] = (preview as IdentityResolutionDeployPreview)
                .requiredEffects;
              if (
                !flags.preview &&
                (preview.outcome === 'create' || preview.outcome === 'update') &&
                (flags['allow-processing'] !== true ||
                  !effects?.includes('processing') ||
                  (preview.outcome === 'create' &&
                    !effects.includes('generated-output-provisioning')))
              ) {
                blocked = true;
                (preview.diagnostics as Array<{ code: string; message: string }>).push({
                  code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                  message:
                    'IR processing and CREATE generated-output provisioning require explicit --allow-processing. No batch writes were attempted.',
                });
              }
            }
            if (input.document.kind === 'calculated-insight')
              await this.verifyCalculatedInsightInput(input as CalculatedInsightDeployInput);
            if (segment) {
              await this.verifySegmentInput(input as SegmentDeployInput);
              const effects = (preview as SegmentDeployPreview).requiredEffects;
              if (
                !flags.preview &&
                ['create', 'update'].includes(preview.outcome) &&
                (flags['allow-processing'] !== true || !effects?.includes('processing'))
              ) {
                blocked = true;
                (preview.diagnostics as Array<{ code: string; message: string }>).push({
                  code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                  message:
                    'Segment create and update start processing in Data Cloud and need --allow-processing. Nothing was written.',
                });
              }
            }
            envelope.result.items.push({
              ...preview,
              ...(routes(input) ? { routes: routes(input) } : {}),
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'preview',
              path: input.path,
            });
            if (preview.outcome === 'blocked' || preview.outcome === 'blocked-changes')
              blocked = true;
          } catch (error) {
            failed = true;
            envelope.result.items.push({
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'preview',
              path: input.path,
              outcome: 'blocked',
              target: 'unknown',
              absenceProof: 'none',
              diagnostics: [
                {
                  // A native DMO refusal names its own reason (for example a standard target).
                  code: error instanceof NativeDmoError ? error.code : 'PREFLIGHT_FAILED',
                  message: operationDiagnostic(
                    error,
                    'Target preview failed; no deployment was executed.',
                  ),
                  ...(mappedFieldMappings(error)
                    ? { mappedFields: mappedFieldMappings(error) }
                    : {}),
                },
              ],
            });
          }
        }
        if (flags.preview && !failed) await verifyInputs();
        if (!flags.preview) {
          const items: ExecutionItem[] = inputs.map((input, index) => {
            const { outcome, target, absenceProof, diagnostics } = envelope.result.items[
              base + index
            ] as DeployPreviewResult;
            return {
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'execute',
              path: input.path,
              outcome: 'not-attempted',
              mutation: 'not-attempted',
              preflight: { outcome, target, absenceProof, diagnostics },
              ...(routes(input) ? { routes: routes(input) } : {}),
              ...(input.document.kind === 'dlo' ? { family: 'dlo' as const } : {}),
              ...(input.document.kind === 'identity-resolution'
                ? {
                    family: 'identity-resolution' as const,
                    route: (envelope.result.items[base + index] as IdentityResolutionDeployPreview)
                      .route,
                    requiredEffects: (
                      envelope.result.items[base + index] as IdentityResolutionDeployPreview
                    ).requiredEffects,
                  }
                : {}),
              ...(input.document.kind === 'calculated-insight'
                ? {
                    family: 'calculated-insight' as const,
                    route: (envelope.result.items[base + index] as CalculatedInsightPreview).route,
                  }
                : {}),
              ...(input.document.kind === 'segment'
                ? {
                    family: 'segment' as const,
                    route: {
                      apiVersion: familySelection(input).soapNumeric,
                      method:
                        (envelope.result.items[base + index] as SegmentDeployPreview).outcome ===
                        'create'
                          ? ('POST' as const)
                          : ('PATCH' as const),
                      resource: 'segments' as const,
                    },
                    requiredEffects: (envelope.result.items[base + index] as SegmentDeployPreview)
                      .requiredEffects,
                  }
                : {}),
              diagnostics: [],
            };
          });
          // Keep whole-selection evidence, but never mistake admission for attempted execution.
          envelope.result.items.splice(base, items.length, ...items);
          if (!failed && !blocked) {
            for (const [index, input] of inputs.entries()) {
              const item = items[index];
              try {
                await verifyInputs();
                // Re-admit every pending dependent before any next write, including a DMO write.
                for (const pending of inputs.slice(index)) {
                  if (pending.document.kind === 'dlo') {
                    await this.preflightDlo(
                      pending.document,
                      dloClient(),
                      effectiveScope,
                      dloOptions,
                    );
                    continue;
                  }
                  if (pending.document.kind === 'identity-resolution') {
                    await verifyIrBinding(pending);
                    const fresh = await this.preflightIdentityResolution(
                      pending.document,
                      connectionFor(pending),
                      familySelection(pending),
                      effectiveScope,
                      await dataSpacePrefixOption(),
                    );
                    if (
                      (irAdmissions.get(pending.path)?.outcome === 'create') !==
                        (fresh.outcome === 'create') ||
                      !['create', 'unchanged', 'update'].includes(fresh.outcome) ||
                      ((fresh.outcome === 'update' || fresh.outcome === 'create') &&
                        (flags['allow-processing'] !== true ||
                          !fresh.requiredEffects.includes('processing') ||
                          (fresh.outcome === 'create' &&
                            !fresh.requiredEffects.includes('generated-output-provisioning'))))
                    )
                      throw new DependencySelectionError(
                        'IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED',
                      );
                    continue;
                  }
                  if (pending.document.kind !== 'segment') continue;
                  const fresh = await this.preflightSegment(
                    pending.document,
                    connectionFor(pending),
                    familySelection(pending),
                    effectiveScope,
                  );
                  if (
                    !['unchanged', 'update', 'create'].includes(fresh.outcome) ||
                    (['update', 'create'].includes(fresh.outcome) &&
                      (flags['allow-processing'] !== true ||
                        !fresh.requiredEffects.includes('processing')))
                  )
                    throw new DependencySelectionError('SEGMENT_FRESH_ADMISSION_BLOCKED');
                }
                await verifyInputs();
              } catch (error) {
                item.outcome = 'blocked';
                item.diagnostics = [
                  {
                    code: 'DEPLOY_FRESH_ADMISSION_BLOCKED',
                    message: operationDiagnostic(
                      error,
                      'Fresh input or dependency admission failed before this item. No further writes were attempted.',
                    ),
                  },
                ];
                blocked = true;
                break;
              }
              // Set conservative evidence only at dispatch; admission failures cannot imply a write.
              item.outcome = 'failed';
              item.mutation = 'unknown';
              try {
                const result =
                  input.document.kind === 'dlo'
                    ? await this.executeDlo(input.document, dloClient(), effectiveScope, dloOptions)
                    : input.document.kind === 'calculated-insight'
                      ? await this.executeCalculatedInsight(
                          (input as CalculatedInsightDeployInput).native,
                          connectionFor(input),
                          familySelection(input),
                          effectiveScope,
                          { ...ciIntent(input), verifyInput: verifyInputs },
                        )
                      : input.document.kind === 'identity-resolution'
                        ? await this.executeIdentityResolution(
                            input.document,
                            connectionFor(input),
                            familySelection(input),
                            effectiveScope,
                            {
                              allowProcessing: flags['allow-processing'] === true,
                              verifyInput: async () => {
                                await verifyInputs();
                                await verifyIrBinding(input);
                              },
                              allowGeneratedOutputProvisioning: flags['allow-processing'] === true,
                              ...(flags.async ? { async: true } : {}),
                              ...(await dataSpacePrefixOption()),
                            },
                          )
                        : input.document.kind === 'segment'
                          ? await this.executeSegment(
                              input.document,
                              connectionFor(input),
                              familySelection(input),
                              effectiveScope,
                              {
                                allowProcessing: flags['allow-processing'] === true,
                                verifyInput: verifyInputs,
                              },
                            )
                          : await (this.executeNativeDmo ?? executeDmo)(
                              (input as NativeDmoDeployInput).document,
                              dmoClient(),
                              effectiveScope,
                              ...withDataSpacePrefix(
                                fieldRemoval(dmoMappings, dmoClient),
                                await dataSpacePrefixOption(),
                              ),
                            );
                const { serverProcessing, ...execution } = result as typeof result & {
                  serverProcessing?: true;
                };
                if (['dlo', 'segment'].includes(input.document.kind) && serverProcessing)
                  processingDlos.add(input.path);
                Object.assign(item, execution);
              } catch (error) {
                item.diagnostics = [
                  {
                    code: 'EXECUTION_UNCONFIRMED',
                    message: operationDiagnostic(
                      error,
                      'Mutation may have occurred. Inspect target before any further attempt; no retry or rollback was performed.',
                    ),
                  },
                ];
              }
              if (item.mutation === 'unknown' || item.outcome === 'failed') {
                failed = true;
                break;
              }
              if (item.outcome === 'blocked') {
                blocked = true;
                break;
              }
            }
          }
        }
        return {
          ...stageResult(
            failed ? 'failed' : blocked ? 'blocked' : 'success',
            failed
              ? flags.preview
                ? 'PREFLIGHT_FAILED'
                : 'DEPLOY_EXECUTION_FAILED'
              : blocked
                ? flags.preview
                  ? 'DEPLOY_PREVIEW_BLOCKED'
                  : 'DEPLOY_EXECUTION_BLOCKED'
                : undefined,
          ),
          // Preview: what this stage creates, or could not compare, is planned for later stages.
          ...(flags.preview
            ? {
                planned: inputs
                  .filter((_, index) =>
                    ['create', 'planned-dependencies'].includes(
                      envelope.result.items[base + index]?.outcome,
                    ),
                  )
                  .map((input) => inputKey(input)),
              }
            : {}),
        };
      };
      const runStreamStage = async (
        streamInputs: DataStreamDeployInput[],
      ): Promise<CrudStageResult> => {
        const version = streamVersion;
        const verify = async (): Promise<void> => {
          for (const input of streamInputs)
            await (this.verifyDataStreamInput ?? verifyDataStreamInputDigest)(input);
        };
        await verify();
        const injected = flags['target-org'] as unknown;
        const org =
          injected && typeof injected === 'object'
            ? (injected as Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>)
            : await (this.resolveTargetOrg ?? resolveTargetOrg)(flags['target-org']);
        if (!org?.getUsername()) return stageResult('blocked', 'TARGET_ORG_REQUIRED');
        envelope.provenance.targetOrgId = org.getOrgId();
        envelope.metadata.soapApiVersion = version;
        const clients = this.createDataStreamClients(
          org.getConnection(version),
          org.getUsername()!,
          version,
        );
        const created: string[] = [];
        const routes: ExecutionItem['routes'] = [
          { operation: 'data-stream.deploy', apiVersion: version, transport: 'native' },
          { operation: 'dlo.get', apiVersion: version, transport: 'native' },
          { operation: 'connection.read', apiVersion: version, transport: 'native' },
        ];
        // The read-only comparison of one stream. A check that refuses the stream (for example
        // a connection that already has a stream) is reported on the stream's item.
        const comparison = async (
          input: DataStreamDeployInput,
        ): Promise<
          { check: Awaited<ReturnType<typeof preflightDataStream>> } | { blocked: CrudStageResult }
        > => {
          try {
            return {
              check: await this.preflightDataStream(input.document, clients, effectiveScope),
            };
          } catch (error) {
            if (!(error instanceof DataStreamError)) throw error;
            const message = operationDiagnostic(
              error,
              flags.preview
                ? 'Preview stopped; nothing was written. Correct the reported check before another attempt.'
                : 'No write attempted; correct the reported check before another attempt.',
            );
            envelope.result.items.push(
              flags.preview
                ? {
                    family: 'data-stream',
                    outcome: 'blocked',
                    target: 'unknown',
                    absenceProof: 'none',
                    requiredEffects: [],
                    diagnostics: [{ code: error.code, message }],
                    routes,
                    identity: reportedIdentity(input.document, effectiveScope),
                    operation: 'preview',
                    path: input.path,
                  }
                : {
                    family: 'data-stream',
                    outcome: 'blocked',
                    mutation: 'not-attempted',
                    diagnostics: [{ code: error.code, message }],
                    routes,
                    identity: reportedIdentity(input.document, effectiveScope),
                    operation: 'execute',
                    path: input.path,
                  },
            );
            return { blocked: stageResult('blocked', error.code, error) };
          }
        };
        // A new stream creates and owns its landing DLO: a selected DLO file of the same name
        // would write that object a second time. P0 is the first stage, so this read-only
        // check refuses the pair before any write. An existing stream's DLO file is a normal
        // sibling and Salesforce decides.
        const colliding = new Set(
          streamDloCollisions(resolvedInputs).map((name) => name.toLowerCase()),
        );
        for (const input of streamInputs) {
          const landing = streamLandingDlo(input);
          if (!landing || !colliding.has(landing.toLowerCase())) continue;
          await verify();
          const compared = await comparison(input);
          if ('blocked' in compared) return compared.blocked;
          if (compared.check.outcome !== 'create') continue;
          envelope.diagnostics.warnings.push(
            `DLO ${landing} is the landing DLO of new data stream ${input.document.identity.apiName}; remove the DLO file from the selection.`,
          );
          return stageResult('blocked', 'DATA_STREAM_DLO_COLLISION');
        }
        for (const input of streamInputs) {
          await verify();
          if (flags.preview) {
            const compared = await comparison(input);
            if ('blocked' in compared) return compared.blocked;
            const preview = compared.check;
            await verify();
            envelope.result.items.push({
              ...preview,
              routes,
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'preview',
              path: input.path,
            });
            // The landing DLO does not exist before the stream is created.
            const landing = streamLandingDlo(input);
            if (preview.outcome === 'create' && landing) created.push(componentKey('dlo', landing));
          } else {
            const result = await this.executeDataStream(input.document, clients, {
              allowProcessing: flags['allow-processing'] === true,
              verifyInput: verify,
              dataSpace: effectiveScope,
            });
            envelope.result.items.push({
              ...result,
              routes,
              identity: reportedIdentity(input.document, effectiveScope),
              operation: 'execute',
              path: input.path,
            });
            // The error behind the item, so the command's message carries its explanation too.
            if (result.outcome === 'blocked' || result.outcome === 'failed')
              return stageResult(
                result.outcome,
                result.diagnostics[0]?.code,
                streamFailureCause(result),
              );
          }
        }
        await verify();
        return { status: 'success', planned: created };
      };
      const runTransformStage = async (
        input: DataTransformDeployInput,
        planned: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        const identity = {
          dataSpace: input.document.c__dataSpace,
          apiName: input.document.definition.name as string,
        };
        const routes: ExecutionItem['routes'] = [
          { operation: 'data-transform.deploy', apiVersion: '68.0', transport: 'native' },
        ];
        let dispatched = false;
        try {
          const verifyInput = async (): Promise<void> => this.verifyDataTransformInput(input);
          await verifyInput();
          // A DLO this transform reads or writes is created earlier in this preview: it does not
          // exist yet, so the transform is reported as planned instead of compared.
          const parents = transformDloNames(input)
            .map((name) => componentKey('dlo', name))
            .filter((key) => planned.has(key));
          if (flags.preview && parents.length > 0) {
            envelope.result.items.push({
              family: 'data-transform',
              outcome: 'planned-dependencies',
              target: 'unknown',
              absenceProof: 'none',
              diagnostics: [
                {
                  code: 'DEPENDENCIES_PLANNED',
                  message: `Selected parent ${parents.join(', ')} is created earlier in this deploy and must settle before this item is compared; no existence or write outcome is asserted.`,
                },
              ],
              identity,
              operation: 'preview',
              path: input.path,
            });
            return stageResult('success');
          }
          const injected = flags['target-org'] as unknown;
          const org =
            injected && typeof injected === 'object'
              ? (injected as Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>)
              : await this.resolveTargetOrg(flags['target-org']);
          if (!org?.getUsername()) return stageResult('blocked', 'TARGET_ORG_REQUIRED');
          envelope.provenance.targetOrgId = org.getOrgId();
          envelope.metadata.soapApiVersion = '68.0';
          const connection = org.getConnection('68.0');
          const client = this.createDataTransformClient(connection, '68.0', effectiveScope);
          // Create or update by name: the complete inventory names at most one target (two or
          // more matches ignoring case are refused); none means create.
          const targetId = await (this.resolveDataTransformTarget ?? resolveDataTransformTargetId)(
            client,
            identity.apiName,
          );
          const selection =
            targetId === undefined
              ? { operation: 'create' as const }
              : { operation: 'update' as const, targetId };
          if (flags.preview) {
            const plan = await this.preflightDataTransform(input.document, selection, client, {
              skipServerValidation: true,
            });
            await verifyInput();
            envelope.result.items.push({
              family: 'data-transform',
              outcome: plan.operation,
              identity,
              routes,
              operation: 'preview',
              path: input.path,
              diagnostics: [
                {
                  code: 'TRANSFORM_PREVIEW_LIMITATIONS',
                  message:
                    'GET-only preview; server validation pending. The target was chosen by name from the current transform list; Salesforce decides at deploy time.',
                },
                ...(plan.writeSchedule ? [transformScheduleNotice(plan.document.schedule)] : []),
              ],
            });
          } else {
            const result = await this.executeDataTransform(input.document, selection, client, {
              verifyInput,
              onDispatch: () => {
                dispatched = true;
              },
            });
            if (result.serverProcessing) processingDlos.add(input.path);
            envelope.result.items.push({
              ...(result.serverProcessing ? { serverProcessing: true as const } : {}),
              family: 'data-transform',
              identity,
              routes,
              operation: 'execute',
              path: input.path,
              outcome:
                result.operation === 'create'
                  ? 'created'
                  : result.operation === 'update'
                    ? 'updated'
                    : 'unchanged',
              mutation:
                result.operation === 'create'
                  ? 'confirmed-created'
                  : result.operation === 'update'
                    ? 'confirmed-updated'
                    : 'not-attempted',
              diagnostics: [
                ...(result.scheduleWritten
                  ? [transformScheduleNotice(input.document.schedule)]
                  : []),
                ...(result.serverProcessing
                  ? [
                      {
                        code: 'TRANSFORM_SERVER_PROCESSING',
                        message:
                          'Definition written and read back; server is still processing. Computation completion is not established.',
                      },
                    ]
                  : []),
              ],
            });
          }
          return stageResult('success');
        } catch (error) {
          // The definition was written and confirmed; only the schedule was not.
          if (error instanceof DataTransformScheduleError) {
            const written = error.definition === 'create' ? 'created' : 'updated';
            envelope.result.items.push({
              family: 'data-transform',
              identity,
              routes,
              operation: 'execute',
              path: input.path,
              outcome: 'failed',
              mutation: error.definition === 'create' ? 'confirmed-created' : 'confirmed-updated',
              diagnostics: [
                {
                  code: error.code,
                  message:
                    error.code === 'TRANSFORM_SCHEDULE_REJECTED'
                      ? operationDiagnostic(
                          error.cause,
                          `The transform definition was ${written}; Salesforce rejected the schedule of the file, so the schedule in the org is unchanged. Correct the schedule, then rerun the deploy.`,
                        )
                      : `The transform definition was ${written}, but the transform was still processing at the end of the wait, so the schedule was not sent. Rerun the deploy once the transform is ACTIVE.`,
                },
              ],
            });
            return stageResult('failed', error.code, error.cause ?? error);
          }
          if (!flags.preview)
            envelope.result.items.push({
              family: 'data-transform',
              identity,
              routes,
              operation: 'execute',
              path: input.path,
              outcome: 'failed',
              mutation: rejectedTransformWrite(error)
                ? 'rejected'
                : dispatched
                  ? 'unknown'
                  : 'not-attempted',
              diagnostics: [],
            });
          return stageResult(
            dispatched ? 'failed' : 'blocked',
            error instanceof DataTransformError ? error.code : 'TRANSFORM_DEPLOY_FAILED',
            error,
          );
        }
      };
      // Several transforms deploy one after another; execution stops at the first that does not
      // succeed, preview compares every one.
      const runTransformsStage = async (
        inputs: DataTransformDeployInput[],
        planned: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        let first: CrudStageResult | undefined;
        for (const input of inputs) {
          const result = await runTransformStage(input, planned);
          if (result.status === 'success') continue;
          first ??= result;
          if (!flags.preview) break;
        }
        return first ?? stageResult('success');
      };
      const runGraphStage = async (
        graphs: NativeDataGraphDeployInput[],
        planned: ReadonlySet<string>,
      ): Promise<CrudStageResult> => {
        const snapshot = JSON.stringify(flags);
        const graphEdges = identityResolutionEdges(resolvedInputs);
        let target:
          | {
              connection: Connection;
              context: Awaited<ReturnType<typeof nativeDataGraphReadContext>>;
            }
          | undefined;
        for (const input of graphs) {
          const verifyInput = async (): Promise<void> => {
            if (JSON.stringify(flags) !== snapshot) throw new Error('Input drift');
            await (this.verifyNativeDataGraphInput ?? verifyNativeDataGraphInputDigest)(input);
          };
          await verifyInput();
          const identity = {
            dataSpace: input.document.c__dataSpace,
            apiName: input.document.definition.name as string,
          };
          const routes = [
            { operation: 'data-graph.deploy', apiVersion: '68.0', transport: 'native' as const },
          ];
          // A root or related DMO (or the IR that creates it) is created earlier in this preview:
          // the graph is reported as planned instead of compared against a target without it.
          const parents = inputDependencies(input, graphEdges).filter((key) => planned.has(key));
          if (flags.preview && parents.length > 0) {
            envelope.result.items.push({
              family: 'data-graph',
              outcome: 'planned-dependencies',
              target: 'unknown',
              absenceProof: 'none',
              diagnostics: [
                {
                  code: 'DEPENDENCIES_PLANNED',
                  message: `Selected parent ${parents.join(', ')} is created earlier in this deploy and must settle before this item is compared; no existence or write outcome is asserted.`,
                },
              ],
              identity,
              operation: 'preview',
              path: input.path,
              routes,
            });
            continue;
          }
          if (!target) {
            const org = await this.resolveTargetOrg(flags['target-org']);
            if (!org) return stageResult('blocked', 'TARGET_ORG_REQUIRED');
            const connection = org.getConnection('68.0');
            const context = await this.nativeGraphContext(connection, effectiveScope);
            envelope.provenance.targetOrgId = context.orgId;
            envelope.metadata.soapApiVersion = '68.0';
            envelope.diagnostics.warnings.push(nativeGraphLimitations);
            target = { connection, context };
          }
          const { connection, context } = target;
          const result = await this.operateNativeGraph(
            input.document,
            context,
            this.nativeGraphClient(connection, '68.0', effectiveScope),
            {
              operation: 'deploy',
              preview: flags.preview,
              confirmed: flags['allow-processing'] === true,
              waitTimeoutSeconds: flags['wait-timeout'] ?? 1800,
              progress: (message) => {
                // oclif logToStderr suppresses output in JSON mode; progress must remain visible.
                process.stderr.write(`${message}\n`);
              },
              verifyInput,
            },
          );
          if (flags.preview)
            envelope.result.items.push({
              identity,
              path: input.path,
              family: 'data-graph' as const,
              operation: 'preview',
              outcome:
                result.outcome === 'create'
                  ? 'create'
                  : result.outcome === 'update'
                    ? 'update'
                    : result.outcome === 'unchanged'
                      ? 'unchanged'
                      : 'blocked',
              target:
                result.outcome === 'create'
                  ? 'absent'
                  : result.outcome === 'unchanged' || result.outcome === 'update'
                    ? 'present'
                    : (result.target ?? 'unknown'),
              absenceProof: 'none',
              diagnostics: result.diagnostics ?? [],
              routes,
            });
          else
            envelope.result.items.push({
              identity,
              path: input.path,
              family: 'data-graph',
              operation: 'execute',
              outcome:
                result.outcome === 'created'
                  ? 'created'
                  : result.outcome === 'updated'
                    ? 'updated'
                    : result.outcome === 'unchanged'
                      ? 'unchanged'
                      : result.outcome === 'failed'
                        ? 'failed'
                        : 'blocked',
              mutation:
                result.mutation === 'confirmed-created'
                  ? 'confirmed-created'
                  : result.mutation === 'confirmed-updated'
                    ? 'confirmed-updated'
                    : result.mutation === 'unknown'
                      ? 'unknown'
                      : result.mutation === 'rejected'
                        ? 'rejected'
                        : 'not-attempted',
              diagnostics: result.failedCheck
                ? [
                    {
                      code: 'DATA_GRAPH_CREATE_UNCONFIRMED',
                      message: `The create request was sent but ${result.failedCheck === 'deadline' ? '--wait-timeout ran out before the graph was confirmed' : `the ${result.failedCheck} check could not confirm the graph`}; it may exist. Retrieve it or deploy again to reconcile.`,
                    },
                  ]
                : (result.diagnostics ?? []),
              routes,
            });
          if (result.outcome === 'blocked' || result.outcome === 'failed') {
            // A block that names its cause on the item needs no generic explanation.
            const named = result.outcome === 'blocked' && (result.diagnostics?.length ?? 0) > 0;
            // A named block reads as a block in preview and deploy alike.
            return stageResult(
              result.outcome,
              named
                ? flags.preview
                  ? 'DEPLOY_PREVIEW_BLOCKED'
                  : 'DEPLOY_EXECUTION_BLOCKED'
                : flags.preview
                  ? 'DEPLOY_PREVIEW_FAILED'
                  : 'DEPLOY_EXECUTION_FAILED',
              named ? undefined : result,
            );
          }
        }
        return stageResult('success');
      };
      const stages = planDeployStages(resolvedInputs, { nativeRoute });
      if (stages.length === 0) {
        if (changedSince === undefined) return finish('blocked', 'INVALID_SELECTION');
        // An empty Git admission still checks its captured snapshots in the batch.
        stages.push({ phase: 'P3', inputs: [] });
      }
      // A P3 stage after an earlier writing stage (P0 streams, P1 native, P2 transform) must be
      // admissible before that first write: its version, data space and every local (no org
      // access) file and dependency shape check.
      if (stages[0]?.phase !== 'P3' && stages.some((stage) => stage.phase === 'P3')) {
        try {
          for (const input of legacyInputs)
            if (crudPhase(input) === 'P3')
              operationApiVersion(
                flags['api-version'],
                input.document.kind as Parameters<typeof operationApiVersion>[1],
              );
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        const later = legacyInputs.filter((input) => crudPhase(input) === 'P3');
        try {
          for (const input of later)
            if (input.document.kind === 'identity-resolution')
              nativeIdentityResolutionDocument(input.document);
          orderDependencyNodes(
            later.map((input) =>
              documentDependencyNode(
                input.document as Parameters<typeof documentDependencyNode>[0],
                'deploy',
                effectiveScope,
              ),
            ),
          );
        } catch (error) {
          return finish(
            'blocked',
            // Same codes as the batch path, plus the validators' own codes.
            error instanceof DependencySelectionError ||
              error instanceof CalculatedInsightError ||
              error instanceof IdentityResolutionError
              ? error.code
              : error instanceof Error && /^IDENTITY_RESOLUTION_[A-Z0-9_]+$/u.test(error.message)
                ? error.message
                : 'INVALID_SOURCE',
          );
        }
      }
      // The run's data space and every data space a selected file names must exist in the org:
      // one read per run, before the first stage reads or writes anything (preview too).
      try {
        await dataSpaceCheckOf(this, openSpaceSender).require([
          effectiveScope,
          ...resolvedInputs.flatMap((input) => {
            const named = (input.document as { c__dataSpace?: unknown }).c__dataSpace;
            // A DLO or stream file lists spaces; a calculated insight names one in its identity.
            return Array.isArray(named)
              ? (named as string[])
              : typeof named === 'string'
                ? [named]
                : input.document.kind === 'calculated-insight'
                  ? [input.document.identity.dataSpace]
                  : [];
          }),
        ]);
      } catch (error) {
        // The check's own code, or the failure's (an expired session keeps its own code).
        return finish('blocked', dataSpaceCheckCode(error, 'TARGET_ORG_REQUIRED'), error);
      }
      // A stream file must list the run's data space and every single-space file (calculated
      // insight, segment, data transform, data graph, identity resolution) must name it: checked
      // for every selected file before any stage writes anything. In a non-default data space
      // Salesforce stores a segment as <prefix>_<Name> (it adds the prefix to a name without it)
      // and an identity resolution ruleset as <prefix>_<type>_<rulesetId>, so their files there
      // must carry that name.
      try {
        const { dataSpacePrefix: prefix } = await dataSpacePrefixOption();
        for (const input of resolvedInputs)
          if (input.document.kind === 'data-stream')
            requireRunSpace(input.document, effectiveScope);
          else if (
            input.document.kind === 'calculated-insight' &&
            input.document.identity.dataSpace !== effectiveScope
          )
            throw calculatedInsightSpaceMismatch(input.document.identity, effectiveScope, true);
          else if (input.document.kind === 'segment') {
            const { apiName } = input.document.identity;
            if (input.document.c__dataSpace !== effectiveScope)
              throw explainSpaceMismatch(
                new SegmentError('SEGMENT_DATASPACE_MISMATCH'),
                apiName,
                input.document.c__dataSpace,
                effectiveScope,
                true,
              );
            // Without the prefix the stored name cannot be checked: refused, never guessed.
            if (effectiveScope !== 'default' && prefix === undefined)
              throw explainInput(
                new SegmentError('SEGMENT_NAME_NOT_STORED'),
                `The org's data space list names no prefix for the data space ${effectiveScope}, so the name Salesforce would store for segment ${apiName} (<prefix>_<Name>) cannot be checked. Nothing was sent; check the data space in Data Cloud.`,
              );
            if (prefix !== undefined && !apiName.startsWith(`${prefix}_`))
              throw explainInput(
                new SegmentError('SEGMENT_NAME_NOT_STORED'),
                `Salesforce stores a segment of the data space ${effectiveScope} as ${prefix}_<Name>, so segment ${apiName} would be created as ${prefix}_${apiName} and not be found again under the name of the file. Name the file and identity.apiName ${prefix}_${apiName}, or retrieve the segment.`,
              );
          } else if (
            input.document.kind === 'data-transform' &&
            input.document.c__dataSpace !== effectiveScope
          )
            throw dataTransformSpaceMismatch(
              String(input.document.definition.name),
              input.document.c__dataSpace,
              effectiveScope,
              crossSpaceUnsupported(input.document as unknown as Record<string, unknown>) ===
                undefined,
            );
          else if (
            input.document.kind === 'native-data-graph' &&
            input.document.c__dataSpace !== effectiveScope
          )
            throw nativeDataGraphSpaceMismatch(
              String(input.document.definition.name),
              input.document.c__dataSpace,
              effectiveScope,
              'file',
              true,
            );
          else if (input.document.kind === 'identity-resolution') {
            const { apiName } = input.document.identity;
            // A file without its data space is not an admitted file (INVALID_SOURCE).
            if (typeof input.document.c__dataSpace !== 'string')
              throw new Error('Identity resolution file without c__dataSpace');
            if (input.document.c__dataSpace !== effectiveScope)
              throw identityResolutionSpaceMismatch(
                apiName,
                input.document.c__dataSpace,
                effectiveScope,
                'file',
                true,
              );
            // Outside default Salesforce names a ruleset <prefix>_<type>_<rulesetId>: a file name
            // without the org's prefix could not be read back after its create. Never guessed.
            if (effectiveScope !== 'default' && prefix === undefined)
              throw explainInput(
                new IdentityResolutionError('IDENTITY_RESOLUTION_NAME_NOT_STORED'),
                `The org's data space list names no prefix for the data space ${effectiveScope}, so the name Salesforce stores for ruleset ${apiName} (<prefix>_<type>_<rulesetId>) cannot be checked. Nothing was sent; check the data space in Data Cloud.`,
              );
            if (prefix !== undefined && !apiName.startsWith(`${prefix}_`))
              throw explainInput(
                new IdentityResolutionError('IDENTITY_RESOLUTION_NAME_NOT_STORED'),
                `Salesforce names a ruleset of the data space ${effectiveScope} ${prefix}_<type>_<rulesetId>, so ruleset ${apiName} would be stored as ${prefix}_${apiName} and not be found again under the name of the file. Name the file and identity.apiName ${prefix}_${apiName}, or retrieve the ruleset.`,
              );
          }
      } catch (error) {
        return finish(
          'blocked',
          error instanceof DataStreamError ||
            error instanceof CalculatedInsightError ||
            error instanceof SegmentError ||
            error instanceof DataTransformError ||
            error instanceof DataGraphError ||
            error instanceof IdentityResolutionError
            ? error.code
            : 'INVALID_SOURCE',
          error,
        );
      }
      // Names unique in the org (custom DMOs, calculated insights, transforms, graphs) carry the
      // prefix of their data space. Every selected file is checked locally before the first
      // write of the run; only a name that breaks the rule is read: absent is refused (a create),
      // present is a warning (an update goes ahead). An org with only default reads nothing here.
      try {
        const spaces = await dataSpaceCheckOf(this, async () => {
          throw new DataSpaceError('TARGET_ORG_REQUIRED');
        }).entries();
        for (const input of resolvedInputs) {
          const { document } = input;
          const named: { type: PrefixType; name: string } | undefined =
            document.kind === 'dmo'
              ? { type: 'dmo', name: document.identity.apiName }
              : document.kind === 'calculated-insight'
                ? { type: 'calculated-insight', name: document.identity.apiName }
                : document.kind === 'data-transform'
                  ? { type: 'data-transform', name: String(document.definition.name) }
                  : document.kind === 'native-data-graph'
                    ? { type: 'data-graph', name: String(document.definition.name) }
                    : undefined;
          if (!named || !prefixRuleCoversName(named.type, named.name)) continue;
          // A DMO file of another data space is refused in its own stage, before any write.
          if (document.kind === 'dmo' && document.c__dataSpace !== effectiveScope) continue;
          const mismatch = prefixMismatch(named.name, named.type, effectiveScope, spaces);
          if (!mismatch) continue;
          const read = await this.readPrefixTarget(
            named.type,
            named.name,
            effectiveScope,
            flags['target-org'],
          );
          if (read === undefined) throw prefixMismatchError(mismatch);
          if (prefixRuleCoversRead(named.type, read.native)) {
            const warning = prefixMismatchWarning(mismatch);
            prefixWarnings.add(warning);
            envelope.diagnostics.warnings.push(warning);
          }
        }
      } catch (error) {
        return finish('blocked', dataSpaceCheckCode(error, 'PREFLIGHT_FAILED'), error);
      }
      // A Waterfall names child segments that must exist in the target or be selected. Its own
      // stage may follow writing stages, so the children it does not find in the selection are
      // read (read-only) before the first stage: a missing one stops the run before any write.
      // Selection matches the exact name, as the child read in the Waterfall's own stage does.
      const selectedSegments = new Set(
        resolvedInputs
          .filter((input) => input.document.kind === 'segment')
          .map((input) =>
            String((input.document as { identity?: { apiName?: unknown } }).identity?.apiName),
          ),
      );
      const waterfalls = resolvedInputs.flatMap((input) => {
        if (input.document.kind !== 'segment') return [];
        const document = input.document as SegmentDocument;
        // The family checks refuse a malformed file later; only a listed name is read here.
        const listed = (document.spec as Partial<OtherSegmentSpec> | undefined)?.childSegments;
        const unselected = (Array.isArray(listed) ? listed : []).filter(
          (child): child is string => typeof child === 'string' && !selectedSegments.has(child),
        );
        return unselected.length > 0
          ? [
              {
                input,
                document: { ...document, spec: { ...document.spec, childSegments: unselected } },
              },
            ]
          : [];
      });
      if (waterfalls.length > 0) {
        const org = await this.resolveTargetOrg(flags['target-org']);
        if (!org) return finish('blocked', 'TARGET_ORG_REQUIRED');
        envelope.provenance.targetOrgId = org.getOrgId();
        const receiver = Object.create(org.getConnection('68.0')) as Connection;
        Object.defineProperty(receiver, 'version', { value: '68.0' });
        Object.defineProperty(receiver, 'getApiVersion', { value: () => '68.0' });
        Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
        for (const { input, document } of waterfalls) {
          try {
            await this.bindChildSegments(document, receiver, '68.0');
          } catch (error) {
            const code =
              error instanceof SegmentError ? error.code : 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED';
            const diagnostics = [
              {
                code,
                message: operationDiagnostic(
                  error,
                  'The child segments of this Waterfall were checked before any write; nothing was written.',
                ),
              },
            ];
            envelope.result.items.push(
              (flags.preview
                ? {
                    family: 'segment',
                    identity: reportedIdentity(document, effectiveScope),
                    operation: 'preview',
                    path: input.path,
                    outcome: 'blocked',
                    target: 'unknown',
                    absenceProof: 'none',
                    diagnostics,
                  }
                : {
                    family: 'segment',
                    identity: reportedIdentity(document, effectiveScope),
                    operation: 'execute',
                    path: input.path,
                    outcome: 'blocked',
                    mutation: 'not-attempted',
                    diagnostics,
                  }) as unknown as DeployEnvelope['result']['items'][number],
            );
            return finish(
              'blocked',
              flags.preview ? 'DEPLOY_PREVIEW_BLOCKED' : 'DEPLOY_EXECUTION_BLOCKED',
            );
          }
        }
      }
      // Preview runs every stage read-only, even after a blocked one; execution stops there.
      const outcome = await runCrudStages(
        stages,
        async (stage, planned) =>
          stage.phase === 'P0'
            ? runStreamStage(stage.inputs as DataStreamDeployInput[])
            : stage.phase === 'P1'
              ? runNativeStage(stage.inputs as typeof legacyInputs, planned)
              : stage.phase === 'P2'
                ? runTransformsStage(stage.inputs as DataTransformDeployInput[], planned)
                : stage.phase === 'P4'
                  ? runGraphStage(stage.inputs as NativeDataGraphDeployInput[], planned)
                  : runBatchStage(stage.inputs as typeof legacyInputs, planned),
        { continueAfterBlocked: flags.preview },
      );
      // Each translated item that deployed gets its copy file, only now and only to a new path.
      if (crossPlan && envelope.result.crossDataSpace && !flags.preview) {
        const copies: CopyOutcome[] = [];
        for (const input of crossPlan.inputs) {
          if (!crossPlan.files.some((entry) => entry.path === input.path)) continue;
          const item = envelope.result.items.find(
            (entry) => entry.path === input.path && entry.operation === 'execute',
          ) as { outcome?: string; mutation?: string; targetApiName?: string } | undefined;
          if (
            !item ||
            !['created', 'updated', 'unchanged'].includes(String(item.outcome)) ||
            item.mutation === 'unknown'
          )
            continue;
          const copy = await writeCopyFile(
            input,
            input.document.kind === 'relationship' ? item.targetApiName : undefined,
            mappingTargets.get(input.path),
          );
          if (copy) copies.push(copy);
          // A copy that was not written does not fail the deploy; --json still shows it.
          if (copy?.outcome === 'not-written')
            envelope.diagnostics.warnings.push(
              `Copy file not written for ${shown(copy.source)}: ${copy.reason ?? 'unknown reason'}.`,
            );
        }
        envelope.result.crossDataSpace.copies = copies;
      }
      return finish(outcome.status, outcome.code, outcome.error);
    } catch (error: unknown) {
      if (error instanceof GitSelectionError) {
        envelope.diagnostics.errors.push({
          code: error.code,
          message:
            error.code === 'BLOCKED_GIT_LIFECYCLE'
              ? 'Git selection blocks renames, conflicts, unstaged or unidentifiable deletions of plugin files, half-deleted calculated insight pairs and a relevant untracked addition combined with any tracked worktree deletion. Stage intended changes to permit Git-inferred rename detection, then resolve unsupported lifecycle changes. Git cannot guarantee historical rename intent.'
              : 'Git selection failed. Use a valid commit reference and canonical files under data360/ (DLO, DMO, mapping, relationship, data stream, data transform, data graph, identity resolution, calculated insight, Segment JSON and SQL) with matching identities and unchanged admitted bytes.',
          retryable: false,
        });
        return finish('blocked');
      }
      if (
        error instanceof NativeDmoError ||
        error instanceof NativeMappingError ||
        error instanceof NativeRelationshipError
      )
        return finish('blocked', error.code, error);
      // A named verbatim file names its kind, name and reason; an invalid authored file its key.
      if (
        error instanceof DeployInputError &&
        (error.code === 'VERBATIM_NOT_DEPLOYABLE' || explanationOf(error) !== undefined)
      )
        return finish('blocked', error.code, error);
      if (error instanceof DeployInputError || error instanceof DependencySelectionError)
        return finish('blocked', error.code);
      return finish(
        'failed',
        flags.preview ? 'DEPLOY_PREVIEW_FAILED' : 'DEPLOY_EXECUTION_FAILED',
        error,
      );
    }
  }
}
