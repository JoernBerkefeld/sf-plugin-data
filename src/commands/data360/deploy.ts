import { dataTransformId, DataTransformError } from '../../artifacts/data-transform-document.js';
import {
  createDataTransformClient,
  createDataTransformDloReader,
} from '../../transport/data-transform-rest.js';
import { preflightDataTransformDeploy } from '../../services/preflight-data-transform-deploy.js';
import { executeDataTransformDeploy } from '../../services/execute-data-transform-deploy.js';
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
import { operationDiagnostic } from '../../services/operation-diagnostic.js';
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
import {
  nativeDmoWriteScope,
  normalizeNativeDmo,
  unwrapNativeDmo,
} from '../../artifacts/native-dmo-document.js';
import { isDeepStrictEqual } from 'node:util';
import { verifyDloInputDigest } from '../../artifacts/read-deploy-input.js';
import type { DloDeployInput } from '../../artifacts/read-deploy-input.js';
import { calculatedInsightReadContext } from '../../services/retrieve-calculated-insight.js';
import type { CalculatedInsightReadContext } from '../../services/retrieve-calculated-insight.js';
import { preflightCalculatedInsightDeploy } from '../../services/preflight-calculated-insight-deploy.js';
import type { CalculatedInsightPreview } from '../../services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../../services/execute-calculated-insight-deploy.js';
import type {
  CalculatedInsightExecution,
  CalculatedInsightObservation,
} from '../../services/execute-calculated-insight-deploy.js';
import { validateCalculatedInsightDocument } from '../../artifacts/calculated-insight-document.js';
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
      connectionOptions: { version: '65.0' },
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
  contractVersion: '1.0.0';
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

/** Preview or sequential guarded deployment of explicitly selected authored configuration. */
export default class Deploy extends SfCommand<DeployEnvelope> {
  public static readonly aliases = ['datacloud:deploy', 'd360:deploy', 'dc:deploy'];
  public static readonly summary =
    'Deploy explicit authored Data360 configuration or preview without writes.';
  public static readonly description =
    'Exact data-transform:Name deploys one canonical data360/dataTransforms/Name.dataTransform.json using auto/API68/default only, with explicit --transform-operation create|update and exact --transform-target-id for update. GET-only preview leaves server validation pending; create does not prove absence. Changed execution requires --allow-processing. Updates change label/description only; no upsert, mixed/Git selection or run/schedule writes. Exact data-stream:ApiName deploys canonical data360/data-stream/ApiName.data-stream-meta.json using auto/API68 and default space only. Stream-only selections support guarded PK-only create, additive existing-source Text mappings or unchanged; create/update requires --allow-processing. Labels, source/schema changes and destructive reconciliation are unsupported. Omitted additive mappings never remove target fields. Generated target identities are independently resolved; mismatching label intent blocks. Requires explicit files/directories OR exact family:ApiName selectors OR --changed-since Git selection (every family; files deleted in the range are reported in result.selection.deletions and never deleted by deploy; transforms stay refused there because --transform-operation is not accepted with it). Canonical native DLO/DMO/mapping/relationship JSON defaults to API68 (auto); numeric pins >=61 are retained without upgrade. Native mixed selections execute DLO then DMO then mapping then relationship, independently settling parents before mapping and relationship dependency checks. A relationship (relationship:Name, data360/relationship/Name.relationship-meta.json) is matched to the org by its binding (source and target DMO and field), not by its generated name: absent is created with one POST and read back until ACTIVE, present with equal cardinality and owner is unchanged, and a different cardinality or owner is refused with RELATIONSHIP_CHANGE_UNSUPPORTED (no update route exists; delete and deploy again). Deploy never deletes relationships. Both DMOs must be mapped; otherwise Salesforce answers 400 and that answer is reported. Mapping uses exact mapping:ApiName from data360/mapping/ApiName.mapping-meta.json, unique target binding lookup and server-generated target names; create and unchanged repeats are supported; desired-state updates at native API 61 and up remove the authored pairs the file drops, one at a time, then add the new pairs in one batch; any data type, same-name or not, and one source onto several targets are sent as listed and Salesforce decides (preview names pairs of different data types with MAPPING_FIELD_TYPES_DIFFER). The key pair, its key-qualifier pair and the system pairs are never removed (MAPPING_PROTECTED_PAIR_REQUIRED when a file drops one; MAPPING_PROTECTED_LAYOUT_UNPROVEN when the key pair cannot be identified). Generated/key pairs and retained selectors are protected. A pair is removed even when another mapping of the same DMO targets the same field; the field stays mapped until the last such pair is gone. The mapping target is a custom DMO or a standard DMO (creationType Standard); platform-generated and namespaced custom DMOs are refused (MAPPING_TARGET_UNSUPPORTED). On a standard DMO the generated system and key qualifier pairs are recognised from the target read and never sent, and the first mapping onto a DMO that is not yet enabled activates it permanently: preview and create carry the notice MAPPING_ACTIVATES_STANDARD_DMO without changing outcome or exit status. Qualification is limited to empty custom fixtures; populated-data behavior is not established. Preview never writes and reports planned dependencies without claiming nonexistent parents are ready. A native DMO changed since a Git reference or selected beside Segment/CI/IR inputs joins the ordered batch on the native route. Prerequisites are checked, never pulled in: each must be selected explicitly or already exist in the target. Native DMO target-name lookup selects confirmed-404 POST or existing-name PATCH with independent GET confirmation. A custom DMO field missing from the file blocks the update unless --allow-field-removal is set; then one Metadata API destructive change for CustomField removes those fields after the PATCH, and readback confirms their absence. A mapped field is removed only when the same selection contains every mapping holding its pair and each mapping file omits that pair; all-native selections check this before the first write (DMO_FIELD_REMOVAL_MAPPED otherwise), then remove the field in the DMO position with one Metadata API destructive change. Salesforce drops the mapping pairs of the field with it; reads before and after confirm that exactly those pairs went and nothing else changed (DMO_FIELD_REMOVAL_SIDE_EFFECT otherwise), and the mappings deployed afterwards find the pairs already gone. The primary key and generated fields are never removed. An existing standard DMO (creationType Standard) takes custom-field additions, label edits and removals plus object label and description changes only: its standard and system fields are never sent or removed, may be absent from the file and must match the target when listed (UNSUPPORTED_DMO_FIELD_CHANGE); a new field must be a plain custom field (UNSUPPORTED_DMO_FIELD_ADDITION); its category is ignored and its label is sent only when it differs. Platform-generated DMOs and new namespaced names are refused (UNSUPPORTED_DMO_TARGET). Native DLOs use dlo:Name__dll from data360/dlo/Name__dll.dlo-meta.json. Target lookup selects PATCH by target ID, or POST only on confirmed HTTP404; auth/permission/lookup failures stop. Preview is read-only; native DLO deploy does not require --allow-processing. Inventory is unavailable. Graph artifacts (*.native-dataGraph.json) use native API68 (auto or explicit 68.0; other versions are rejected) and default space: confirmed absence creates with --allow-processing; qualified NONE label/description and additive fields/recursive children update with independent ready confirmation. Omitted existing fields/branches are retained; root, keys, joins and settings changes block. Identical ready configuration is unchanged without acknowledgement. --wait-timeout sets the native Graph invocation budget in integer seconds (default 1800); readiness retries wait at least 20 seconds with stderr progress. Processing can take seconds to many minutes, up to 30 minutes depending on objects, fields, data volume and service load. Graph mixed-family selections are blocked. Calculated insights use auto or numeric68/default (no other version); paired NOT_SCHEDULED configuration: --draft creates or edits DRAFT without publication; without --draft only existing ACTIVE qualified expression edits are admitted. State conversion and arbitrary SQL/schema/label/schedule changes are blocked. CI create/update requires --allow-processing; identical deploy is read-only without acknowledgement. Native68 uses fixed API65 Metadata and dependency reads; input XML is local paired ownership, not a SOAP write. Publication is never implicit. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Preview is strictly read-only. Batches containing Segment, CI or IR inputs preflight the whole selection before the first write; all-native DLO/DMO/mapping execution admits each ordered item only after earlier parents settle. Existing Segment labels/descriptions execute sequentially with fresh checks and qualified readback. Segment uses one portable *.segment.json with auto/API68 or explicit65 in default space. Segment acquisition uses native runtime JSON only; separate same-version DMO detail and Metadata reads validate dependency compatibility. Existing label/description and qualified forward empty-audience selected-ID IS NOT NULL updates require --allow-processing; identical configuration is unchanged without acknowledgement. Segment XML is unsupported input. Bounded absent-target Segment CREATE supports auto/API68 in default space and requires --allow-processing. Segment deletion is separate: sf data360 delete requires --confirm-delete and fresh source-backed checks. Native IR uses auto or numeric68/default: confirmed exact absence supports CREATE with --allow-processing acknowledging processing and generated-output provisioning; existing settled owners support complete matching and reconciliation PATCH with --allow-processing or read-only identical no-op without acknowledgement. Ordered source priorities, object defaults and explicit field overrides are preserved; fields:[] restores inheritance. Automatic run, explicit run and delete are unsupported; no API67 fallback is attempted. --async (IR only) returns as soon as Salesforce accepts an IR create or update (creation-processing / update-processing, mutation acknowledged-processing) instead of waiting minutes for PUBLISHED: publish, settings and generated outputs are not confirmed; rerun the same deploy to check (IDENTITY_RESOLUTION_NOT_SETTLED while in flight, unchanged once settled). Selections mixing IR with other non-native families require auto. Other changes block before writes. Stops on first blocked or failed item; no retry or rollback. No local report/artifact writes.';
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
        'Optional native data space; --data-space is a compatibility alias. Other families require default.',
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
        'Select canonical plugin files of every family changed since the merge base with a commit reference; deleted files are reported, not deleted.',
      exclusive: ['source-dir', 'metadata'],
    }),
    'allow-processing': Flags.boolean({
      default: false,
      summary:
        'Acknowledge Transform/stream create/update, Graph create/update and Segment/CI/IR processing; IR CREATE also provisions generated outputs.',
    }),
    'allow-field-removal': Flags.boolean({
      default: false,
      summary:
        'Native DMO only: remove custom target fields missing from the file with a Metadata API destructive change. A mapped field needs every mapping holding its pair, without the pair, in the same selection; Salesforce drops the pair together with the field. The primary key and generated fields are never removed.',
    }),
    'transform-operation': Flags.string({
      options: ['create', 'update'],
      summary: 'Transform-only explicit create or exact-ID update; never upsert.',
    }),
    'transform-target-id': Flags.string({
      summary:
        'Exact native dataTransformId required for Transform update and forbidden for create.',
    }),
    async: Flags.boolean({
      default: false,
      summary:
        'IR only: return once Salesforce accepts the IR create/update instead of waiting for PUBLISHED. Skips confirming publish, settings and generated outputs; rerun the same deploy to check.',
    }),
    'wait-timeout': Flags.integer({
      min: 1,
      summary:
        'Native Graph-only invocation wait budget in seconds; default 1800, no write retries.',
    }),
    draft: Flags.boolean({
      default: false,
      summary:
        'CI-only (auto or 68.0): create or edit DRAFT without publishing; never converts ACTIVE.',
    }),
    preview: Flags.boolean({
      default: false,
      summary: 'Strictly read-only target comparison; never executes deployment.',
    }),
  };

  protected createDataTransformClient = createDataTransformClient;
  protected createDataTransformDloReader = createDataTransformDloReader;
  protected preflightDataTransform = preflightDataTransformDeploy;
  protected executeDataTransform = executeDataTransformDeploy;
  protected verifyDataTransformInput = verifyDataTransformInputDigest;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
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
      streams: createDataStreamClient(target, reader, version),
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
  protected createDmoClient = createDmoClient;
  protected preflightNativeDmo = preflightDmo;
  protected executeNativeDmo = executeDmo;
  protected admitNativeDmoRemoval = admitDmoFieldRemoval;
  protected preflightDlo = preflightDloDeploy;
  protected executeDlo = executeDloDeploy;
  protected verifyDloInput = verifyDloInputDigest;
  protected createDloClient = createDloClient;
  // Native DLO/DMO/mapping reads share one bound Connection per org and version instead of one
  // CLI process per read; writes stay on the CLI runner. Tests replace this seam.
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
  protected calculatedInsightObservations?: Map<string, CalculatedInsightObservation[]>;

  /**
   * Retain detached bounded attribution evidence privately, never in portable files or results.
   * @param {string} key Exact local component path.
   * @param {CalculatedInsightObservation} observation Validated executor observation.
   * @returns {Promise<void>} Resolves after preserving the observation.
   */
  protected async recordCalculatedInsightObservation(
    key: string,
    observation: CalculatedInsightObservation,
  ): Promise<void> {
    this.calculatedInsightObservations ??= new Map();
    const entries = this.calculatedInsightObservations.get(key) ?? [];
    entries.push(structuredClone(observation));
    this.calculatedInsightObservations.set(key, entries);
  }
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
    const preview = await this.preflightIdentityResolution(
      input.document,
      connection,
      selection,
      'default',
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
      'default',
    );
    const acquired = await retrieveIdentityResolution(
      connection,
      input.document.identity.apiName,
      selection,
      'default',
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
        dataSpace: 'default',
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
   * Validate inputs, then admit native items in dependency order or preflight the whole remaining
   * selection before sequential execution.
   * @returns {Promise<DeployEnvelope>} Versioned preview or execution outcomes with mutation evidence.
   */
  public async run(): Promise<DeployEnvelope> {
    const { flags } = await this.parse(Deploy);
    const requestScope = flags.dataspace;
    const effectiveScope = requestScope ?? 'default';
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
                ...(requestScope === undefined ? {} : { dataspace: requestScope }),
              },
              // Reads before and after the one removal: fields gone, exactly their pairs dropped
              // by Salesforce, every other mapping, pair and field unchanged.
              precheckRemoval: async (apiName, fields, coverage) => {
                await checkFieldRemoval(
                  apiName,
                  fields,
                  { dmo: dmoReader(), mappings: mappings() },
                  coverage,
                  requestScope,
                );
              },
              removeChecked: async (apiName, fields, remove, coverage) => {
                const dropped = await removeFieldsChecked(
                  apiName,
                  fields,
                  { dmo: dmoReader(), mappings: mappings() },
                  remove,
                  coverage,
                  requestScope,
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
    const cwd = process.cwd();
    const plugin = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };
    const envelope: DeployEnvelope = {
      contract: 'sf-data360-deploy',
      contractVersion: '1.0.0',
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
        envelope.diagnostics.errors.push({
          code,
          message: operationDiagnostic(
            error,
            flags.preview
              ? 'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.'
              : 'Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.',
          ),
          retryable: false,
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
        for (const deletion of envelope.result.selection.deletions ?? [])
          this.log(
            `Not deleted: ${deletion.family}:${deletion.apiName} (file deleted in the Git range; deploy never deletes).`,
          );
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
          }
          if (item.operation === 'preview' && 'plan' in item)
            for (const step of item.plan)
              this.log(
                `Planned field ${step.operation}: ${step.sourceFieldDeveloperName} -> ${step.targetFieldDeveloperName}${'developerName' in step ? ` (${step.developerName})` : ''}.`,
              );
          for (const diagnostic of [
            ...item.diagnostics,
            ...(item.operation === 'execute' && 'preflight' in item
              ? (item.preflight?.diagnostics ?? [])
              : []),
          ])
            this.log(formatDiagnostic(diagnostic));
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
        (flags['transform-operation'] !== undefined || flags['transform-target-id'] !== undefined)
      )
        return finish('blocked', 'INVALID_TRANSFORM_SELECTION');
      if (flags['wait-timeout'] !== undefined && changedSince !== undefined)
        return finish('blocked', 'INVALID_WAIT_TIMEOUT_SCOPE');
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
      const resolvedInputs = await this.resolveInputs({
        cwd,
        sourceDir: sourceDirectories,
        metadata: flags.metadata,
      });
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
      if (
        flags.async &&
        !resolvedInputs.some((input) => input.document.kind === 'identity-resolution')
      )
        return finish('blocked', 'INVALID_ASYNC_SCOPE');
      const transformInputs = resolvedInputs.filter(
        (input): input is DataTransformDeployInput => input.document.kind === 'data-transform',
      );
      const transformOperation = flags['transform-operation'];
      const transformTargetId = flags['transform-target-id'];
      if (
        transformInputs.length === 0 &&
        (transformOperation !== undefined || transformTargetId !== undefined)
      )
        return finish('blocked', 'INVALID_TRANSFORM_FLAG_SCOPE');
      if (transformInputs.length > 0) {
        if (
          transformInputs.length !== 1 ||
          resolvedInputs.length !== 1 ||
          changedSince !== undefined ||
          flags.draft ||
          flags['wait-timeout'] !== undefined ||
          (flags.metadata !== undefined && flags.metadata.length !== 1) ||
          (flags['source-dir'] !== undefined &&
            (flags['source-dir'].length !== 1 ||
              !flags['source-dir'][0].endsWith('.dataTransform.json')))
        )
          return finish('blocked', 'INVALID_TRANSFORM_SELECTION');
        if (!['auto', '68.0'].includes(flags['api-version']) || effectiveScope !== 'default')
          return finish('blocked', 'INVALID_TRANSFORM_SCOPE');
        if (
          (transformOperation !== 'create' && transformOperation !== 'update') ||
          (transformOperation === 'create' && transformTargetId !== undefined) ||
          (transformOperation === 'update' &&
            (typeof transformTargetId !== 'string' || !dataTransformId.test(transformTargetId)))
        )
          return finish('blocked', 'INVALID_TRANSFORM_DEPLOY_SELECTION');
        const input = transformInputs[0];
        families.set(input.path, 'data-transform');
        const identity = {
          dataSpace: 'default',
          apiName: input.document.definition.name as string,
        };
        const selection =
          transformOperation === 'create'
            ? { operation: 'create' as const }
            : { operation: 'update' as const, targetId: transformTargetId! };
        const routes: ExecutionItem['routes'] = [
          { operation: 'data-transform.deploy', apiVersion: '68.0', transport: 'native' },
          { operation: 'dlo.get', apiVersion: '68.0', transport: 'native' },
        ];
        let dispatched = false;
        try {
          const verifyInput = async (): Promise<void> => this.verifyDataTransformInput(input);
          await verifyInput();
          const injected = flags['target-org'] as unknown;
          const org =
            injected && typeof injected === 'object'
              ? (injected as Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>)
              : await this.resolveTargetOrg(flags['target-org']);
          if (!org?.getUsername()) return finish('blocked', 'TARGET_ORG_REQUIRED');
          envelope.provenance.targetOrgId = org.getOrgId();
          envelope.metadata.soapApiVersion = '68.0';
          const connection = org.getConnection('68.0');
          const client = this.createDataTransformClient(connection, '68.0', 'default');
          const dlos = this.createDataTransformDloReader(connection);
          if (flags.preview) {
            const plan = await this.preflightDataTransform(
              input.document,
              selection,
              client,
              dlos,
              { skipServerValidation: true },
            );
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
                    'GET-only preview; server validation pending. Explicit create does not prove name absence; the create-only POST arbitrates collisions.',
                },
              ],
            });
          } else {
            const result = await this.executeDataTransform(
              input.document,
              selection,
              client,
              dlos,
              {
                verifyInput,
                onDispatch: () => {
                  dispatched = true;
                },
                allowProcessing: flags['allow-processing'] === true,
              },
            );
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
              diagnostics: result.serverProcessing
                ? [
                    {
                      code: 'TRANSFORM_SERVER_PROCESSING',
                      message:
                        'Definition independently verified; server is still processing. Computation completion is not established.',
                    },
                  ]
                : [],
            });
          }
          return finish('success');
        } catch (error) {
          if (!flags.preview)
            envelope.result.items.push({
              family: 'data-transform',
              identity,
              routes,
              operation: 'execute',
              path: input.path,
              outcome: 'failed',
              mutation: dispatched ? 'unknown' : 'not-attempted',
              diagnostics: [],
            });
          return finish(
            dispatched ? 'failed' : 'blocked',
            error instanceof DataTransformError ? error.code : 'TRANSFORM_DEPLOY_FAILED',
            error,
          );
        }
      }
      if (
        flags.draft &&
        (!['auto', '68.0'].includes(flags['api-version']) ||
          effectiveScope !== 'default' ||
          resolvedInputs.length === 0 ||
          resolvedInputs.some((input) => input.document.kind !== 'calculated-insight'))
      )
        return finish('blocked', 'INVALID_DRAFT_SCOPE');
      for (const input of resolvedInputs) families.set(input.path, input.document.kind);
      if (resolvedInputs.length === 0 && changedSince === undefined)
        return finish('blocked', 'INVALID_SELECTION');
      const graphInputs = resolvedInputs.filter(
        (input): input is NativeDataGraphDeployInput => input.document.kind === 'native-data-graph',
      );
      if (
        flags['wait-timeout'] !== undefined &&
        (graphInputs.length !== 1 ||
          resolvedInputs.length !== 1 ||
          !Number.isSafeInteger(flags['wait-timeout']) ||
          flags['wait-timeout'] < 1)
      )
        return finish('blocked', 'INVALID_WAIT_TIMEOUT_SCOPE');
      if (graphInputs.length > 0) {
        if (graphInputs.length !== 1 || resolvedInputs.length !== 1 || flags.draft)
          return finish('blocked', 'NATIVE_GRAPH_SELECTION_UNSUPPORTED');
        try {
          operationApiVersion(flags['api-version'], 'data-graph');
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
        const input = graphInputs[0];
        families.set(input.path, 'data-graph');
        const snapshot = JSON.stringify(flags);
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new Error('Input drift');
          await verifyNativeDataGraphInputDigest(input);
        };
        await verifyInput();
        const org = await this.resolveTargetOrg(flags['target-org']);
        if (!org) return finish('blocked', 'TARGET_ORG_REQUIRED');
        const connection = org.getConnection('68.0');
        const context = await this.nativeGraphContext(connection, 'default');
        envelope.provenance.targetOrgId = context.orgId;
        envelope.metadata.soapApiVersion = '68.0';
        envelope.diagnostics.warnings.push(nativeGraphLimitations);
        const result = await this.operateNativeGraph(
          input.document,
          context,
          this.nativeGraphClient(connection, '68.0', 'default'),
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
        const identity = {
          dataSpace: 'default',
          apiName: input.document.definition.name as string,
        };
        const routes = [
          { operation: 'data-graph.deploy', apiVersion: '68.0', transport: 'native' as const },
        ];
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
                  : 'unknown',
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
                    : 'not-attempted',
            diagnostics: result.failedCheck
              ? [
                  {
                    code: 'DATA_GRAPH_CREATE_UNCONFIRMED',
                    message: `The create request was sent but ${result.failedCheck === 'deadline' ? '--wait-timeout ran out before the graph was confirmed' : `the ${result.failedCheck} check could not confirm the graph`}; it may exist. Retrieve it or deploy again to reconcile.`,
                  },
                ]
              : [],
            routes,
          });
        return finish(
          result.outcome === 'blocked'
            ? 'blocked'
            : result.outcome === 'failed'
              ? 'failed'
              : 'success',
          result.outcome === 'blocked' || result.outcome === 'failed'
            ? flags.preview
              ? 'DEPLOY_PREVIEW_FAILED'
              : 'DEPLOY_EXECUTION_FAILED'
            : undefined,
          result,
        );
      }
      const streamInputs = resolvedInputs.filter(
        (input): input is DataStreamDeployInput => input.document.kind === 'data-stream',
      );
      if (streamInputs.length > 0) {
        if (streamInputs.length !== resolvedInputs.length)
          return finish('blocked', 'DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED');
        let version: string;
        try {
          version = dataStreamApiVersion(flags['api-version']);
          if (
            effectiveScope !== 'default' ||
            streamInputs.some((input) => input.document.identity.dataSpace !== 'default')
          )
            return finish('blocked', 'INVALID_SCOPE');
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
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
        if (!org?.getUsername()) return finish('blocked', 'TARGET_ORG_REQUIRED');
        envelope.provenance.targetOrgId = org.getOrgId();
        envelope.metadata.soapApiVersion = version;
        const clients = this.createDataStreamClients(
          org.getConnection(version),
          org.getUsername()!,
          version,
        );
        for (const input of streamInputs) {
          await verify();
          const routes: ExecutionItem['routes'] = [
            { operation: 'data-stream.deploy', apiVersion: version, transport: 'native' },
            { operation: 'dlo.get', apiVersion: version, transport: 'native' },
            { operation: 'connection.read', apiVersion: version, transport: 'native' },
          ];
          if (flags.preview) {
            const preview = await this.preflightDataStream(input.document, clients);
            await verify();
            envelope.result.items.push({
              ...preview,
              routes,
              identity: input.document.identity,
              operation: 'preview',
              path: input.path,
            });
          } else {
            const result = await this.executeDataStream(input.document, clients, {
              allowProcessing: flags['allow-processing'] === true,
              verifyInput: verify,
            });
            envelope.result.items.push({
              ...result,
              routes,
              identity: input.document.identity,
              operation: 'execute',
              path: input.path,
            });
            if (result.outcome === 'blocked' || result.outcome === 'failed')
              return finish(result.outcome);
          }
        }
        await verify();
        return finish('success');
      }
      const legacyInputs = resolvedInputs.filter(
        (
          input,
        ): input is Exclude<
          DeployInput,
          | NativeDataGraphDeployInput
          | import('../../artifacts/read-deploy-input.js').DataTransformDeployInput
        > =>
          input.document.kind !== 'native-data-graph' && input.document.kind !== 'data-transform',
      );
      const nativeInputs = legacyInputs.filter(
        (input) =>
          isNativeDmoInput(input) ||
          input.document.kind === 'mapping' ||
          input.document.kind === 'relationship' ||
          input.document.kind === 'dlo',
      );
      // A native DLO/DMO-only Git selection, or one beside Segment/CI/IR inputs, joins the ordered
      // dependency batch below; selections with a mapping or relationship (explicit or Git) and
      // all-native explicit selections stay on this route.
      if (
        nativeInputs.some(
          (input) => input.document.kind === 'mapping' || input.document.kind === 'relationship',
        ) ||
        (nativeInputs.length === resolvedInputs.length && changedSince === undefined)
      ) {
        if (nativeInputs.length !== resolvedInputs.length)
          return finish('blocked', 'NATIVE_MIXED_SELECTION_UNSUPPORTED');
        let version: string;
        try {
          version = nativeApiVersion(flags['api-version']);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        // Relationships need mapped DMOs, so they follow DLOs, DMOs and mappings.
        const rank = (input: DeployInput): number =>
          input.document.kind === 'dlo'
            ? 0
            : input.document.kind === 'dmo'
              ? 1
              : input.document.kind === 'mapping'
                ? 2
                : 3;
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
        if (!org || !org.getUsername()) return finish('blocked', 'TARGET_ORG_REQUIRED');
        const target = org.getUsername()!;
        envelope.provenance.targetOrgId = org.getOrgId();
        envelope.metadata.apiVersion = flags['api-version'] ?? 'auto';
        envelope.metadata.soapApiVersion = version;
        const source = (this.createDloClient ?? createDloClient)(
          target,
          version,
          undefined,
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
            requestScope,
            this.ssotSender(target, version),
          );
        const relationship = (): ReturnType<typeof createRelationshipClient> =>
          (this.createRelationshipClient ?? createRelationshipClient)(
            target,
            version,
            undefined,
            requestScope,
            this.ssotSender(target, version),
          );
        // Parents settle before dependents: mappings and relationships need their DMOs.
        const hasMappings = nativeInputs.some(
          (input) => input.document.kind === 'mapping' || input.document.kind === 'relationship',
        );
        const plannedParents = new Set<string>();
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
            const identity = input.document.identity;
            try {
              const admission = await (this.admitNativeDmoRemoval ?? admitDmoFieldRemoval)(
                input.document,
                dmo,
                requestScope,
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
              return finish('blocked');
            }
          }
          await verify();
        }
        for (const input of nativeInputs) {
          await verify();
          const kind = input.document.kind;
          const identity = input.document.identity;
          const dmoOptions = removal
            ? [
                {
                  ...removal,
                  coveredMappedFields: covered.get(input.path)?.fields ?? [],
                  coveredMappingSources: covered.get(input.path)?.sources ?? [],
                },
              ]
            : [];
          if (flags.preview) {
            const spec =
              kind === 'mapping'
                ? (input.document
                    .spec as import('../../artifacts/native-mapping-document.js').NativeMappingDocument['spec'])
                : undefined;
            const planned =
              spec &&
              (plannedParents.has(`dlo:${spec.sourceEntityDeveloperName}`) ||
                plannedParents.has(`dmo:${spec.targetEntityDeveloperName}`));
            if (kind === 'relationship') {
              const binding = (input.document as NativeRelationshipDocument).spec;
              // A DMO this batch creates cannot be listed yet; nothing is asserted about it.
              const relationshipPreview =
                plannedParents.has(`dmo:${binding.sourceObjectName}`) ||
                plannedParents.has(`dmo:${binding.targetObjectName}`)
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
                      requestScope,
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
                    {
                      source,
                      target: dmo,
                    },
                    requestScope,
                  )
                : kind === 'dlo'
                  ? await (this.preflightDlo ?? preflightDloDeploy)(
                      input.document,
                      source,
                      requestScope,
                    )
                  : await (this.preflightNativeDmo ?? preflightDmo)(
                      input.document,
                      dmo,
                      requestScope,
                      ...dmoOptions,
                    );
            await verify();
            envelope.result.items.push({
              ...preview,
              identity,
              operation: 'preview',
              path: input.path,
            });
            if (preview.outcome === 'blocked') return finish('blocked');
            if (preview.outcome === 'create') plannedParents.add(`${kind}:${identity.apiName}`);
            continue;
          }
          // Each executor independently admits and settles this item before the next dependency read.
          const result =
            kind === 'relationship'
              ? await (this.executeRelationship ?? executeRelationship)(
                  input.document,
                  relationship(),
                  requestScope,
                )
              : kind === 'mapping'
                ? await (this.executeMapping ?? executeMapping)(
                    input.document,
                    mapping(),
                    {
                      source,
                      target: dmo,
                    },
                    (changes) => mappingChanges.set(input.path, changes),
                    requestScope,
                    (apiName) => mappingNames.set(input.path, apiName),
                  )
                : kind === 'dlo'
                  ? await (this.executeDlo ?? executeDloDeploy)(
                      input.document,
                      source,
                      requestScope,
                    )
                  : await (this.executeNativeDmo ?? executeDmo)(
                      input.document,
                      dmo,
                      requestScope,
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
            return finish(result.outcome);
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
                    ? normalizeDlo(raw, requestScope)
                    : normalizeNativeDmo(raw, requestScope);
                if (
                  actual.identity.apiName !== identity.apiName ||
                  actual.identity.dataSpace !== identity.dataSpace
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
              return finish('failed');
            }
          }
        }
        await verify();
        return finish('success');
      }
      // The flag parser admits only auto or a numeric version; refuse anything else unparsed.
      if (effectiveScope !== 'default' || !/^(?:auto|\d{2,3}\.0)$/u.test(flags['api-version']))
        return finish('blocked', 'INVALID_SCOPE');
      const admitted = legacyInputs.filter(
        (
          input,
        ): input is Exclude<
          DeployInput,
          | import('../../artifacts/read-deploy-input.js').MappingDeployInput
          | import('../../artifacts/read-deploy-input.js').RelationshipDeployInput
          | DataStreamDeployInput
          | NativeDataGraphDeployInput
          | import('../../artifacts/read-deploy-input.js').DataTransformDeployInput
        > =>
          input.document.kind !== 'mapping' &&
          input.document.kind !== 'relationship' &&
          input.document.kind !== 'data-stream',
      );
      // Native DMO items keep the native version rule (auto is 68.0), not another family's pin.
      const admitVersion = (input: (typeof admitted)[number]): void => {
        if (isNativeDmoInput(input)) nativeApiVersion(flags['api-version']);
        else if (input.document.kind === 'identity-resolution')
          operationApiVersion(flags['api-version'], 'identity-resolution');
        else operationApiVersion(flags['api-version'], input.document.kind);
      };
      const hasDlos = admitted.some((input) => input.document.kind === 'dlo');
      if (hasDlos) {
        try {
          for (const input of admitted) admitVersion(input);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
        for (const input of admitted)
          if (input.document.kind === 'dlo') validateDloDocument(input.document);
      }
      if (gitDlos) {
        const current = admitted.filter(
          (input): input is DloDeployInput => input.document.kind === 'dlo',
        );
        if (
          current.length !== gitDlos.length ||
          gitDlos.some(
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
        for (const input of gitDlos) await this.verifyDloInput(input);
      }
      const hasCalculatedInsights = admitted.some(
        (input) => input.document.kind === 'calculated-insight',
      );
      if (hasCalculatedInsights) {
        try {
          for (const input of admitted) admitVersion(input);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
        for (const input of admitted)
          if (input.document.kind === 'calculated-insight')
            validateCalculatedInsightDocument(input.document);
      }
      if (gitCalculatedInsights) {
        const current = admitted.filter(
          (input): input is CalculatedInsightDeployInput =>
            input.document.kind === 'calculated-insight',
        );
        if (
          current.length !== gitCalculatedInsights.length ||
          gitCalculatedInsights.some(
            (captured) =>
              !current.some(
                (input) =>
                  input.path === captured.path &&
                  input.companionPath === captured.companionPath &&
                  input.inputDigest === captured.inputDigest &&
                  JSON.stringify(input.document) === JSON.stringify(captured.document),
              ),
          )
        )
          throw new GitSelectionError('INVALID_GIT_SELECTION');
        for (const captured of gitCalculatedInsights)
          await this.verifyCalculatedInsightInput(captured);
      }
      // Bind every captured Git owner to the original immutable authored bytes, never drop IR.
      if (gitIdentityResolutions) {
        const current = admitted.filter(
          (input) => input.document.kind === 'identity-resolution',
        ) as IdentityResolutionDeployInput[];
        if (
          current.length !== gitIdentityResolutions.length ||
          gitIdentityResolutions.some(
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
        for (const captured of gitIdentityResolutions)
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
            return finish('blocked', 'INVALID_SCOPE');
          }
          if (family === 'identity-resolution') {
            try {
              nativeIdentityResolutionDocument(input.document);
            } catch (error) {
              return finish(
                'blocked',
                error instanceof Error && /^IDENTITY_RESOLUTION_[A-Z0-9_]+$/u.test(error.message)
                  ? error.message
                  : 'INVALID_SOURCE',
              );
            }
          }
        }
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
      }
      if (gitSegments) {
        const current = inputs.filter(
          (input): input is SegmentDeployInput => input.document.kind === 'segment',
        );
        if (
          current.length !== gitSegments.length ||
          gitSegments.some(
            (captured) =>
              !current.some(
                (input) =>
                  input.path === captured.path && input.inputDigest === captured.inputDigest,
              ),
          )
        )
          throw new GitSelectionError('INVALID_GIT_SELECTION');
        for (const captured of gitSegments) await this.verifySegmentInput(captured);
      }
      if (inputs.length === 0) return finish('blocked', 'INVALID_SELECTION');
      const hasNativeDmos = inputs.some((input) => isNativeDmoInput(input));
      let nativeDmoVersion = '68.0';
      try {
        if (hasNativeDmos) nativeDmoVersion = nativeApiVersion(flags['api-version']);
      } catch {
        return finish('blocked', 'INVALID_SCOPE');
      }
      const hasSegments = inputs.some((input) => input.document.kind === 'segment');
      if (hasSegments || hasIdentityResolutions || hasCalculatedInsights || hasDlos) {
        const nodes = inputs.map((input) =>
          input.document.kind === 'segment' ||
          input.document.kind === 'identity-resolution' ||
          input.document.kind === 'calculated-insight' ||
          input.document.kind === 'dlo'
            ? documentDependencyNode(input.document)
            : { identity: { kind: 'dmo' as const, ...input.document.identity }, dependencies: [] },
        );
        const byKey = new Map(
          inputs.map((input) => [
            dependencyKey({
              kind:
                input.document.kind === 'identity-resolution'
                  ? 'identity-resolution'
                  : input.document.kind === 'segment'
                    ? 'segment'
                    : input.document.kind === 'calculated-insight'
                      ? 'calculated-insight'
                      : input.document.kind === 'dlo'
                        ? 'dlo'
                        : 'dmo',
              ...input.document.identity,
            }),
            input,
          ]),
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
        for (const input of gitDlos ?? []) await this.verifyDloInput(input);
        for (const input of gitCalculatedInsights ?? [])
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
              {
                operation: 'dependency.metadata',
                apiVersion: familySelection(input).soapNumeric,
                transport: 'metadata',
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
                  {
                    operation:
                      irAdmissions.get(input.path)?.outcome === 'create'
                        ? 'dependency.metadata'
                        : 'dependency-and-output.metadata',
                    apiVersion: '68.0',
                    transport: 'metadata',
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
                      irAdmissions.get(input.path)?.route.operation ?? 'identity-resolutions.patch',
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
                    {
                      operation: 'calculated-insight.metadata',
                      apiVersion: '65.0',
                      transport: 'metadata',
                    },
                    { operation: 'dependency.get', apiVersion: '65.0', transport: 'native' },
                    {
                      operation: 'dependency.metadata',
                      apiVersion: '65.0',
                      transport: 'metadata',
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
                  : flags['api-version'] === 'auto'
                    ? [
                        {
                          operation: `${input.document.kind}.deploy`,
                          apiVersion: '65.0',
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
      if (!org) return finish('blocked', 'TARGET_ORG_REQUIRED');
      envelope.provenance.targetOrgId = org.getOrgId();
      // Batches of only Segments, CIs and native DMOs default to 68.0; other families keep 65.0.
      const batchVersion =
        flags['api-version'] === 'auto'
          ? inputs.every(
              (input) =>
                input.document.kind === 'segment' ||
                input.document.kind === 'calculated-insight' ||
                isNativeDmoInput(input),
            )
            ? '68.0'
            : '65.0'
          : flags['api-version'];
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
        // A CI context derives its fixed API65 Metadata receiver from this one by repinning
        // `version`; a constant getApiVersion would hide that pin, so CI keeps the core getter.
        if (input.document.kind !== 'calculated-insight')
          Object.defineProperty(receiver, 'getApiVersion', { value: () => version });
        Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
        return receiver;
      };
      const dloClient = (): ReturnType<typeof createDloClient> => {
        const username = org.getUsername();
        if (!username) throw new Error('TARGET_ORG_REQUIRED');
        return this.createDloClient(username, '68.0', undefined, this.ssotSender(username, '68.0'));
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
          requestScope,
          this.ssotSender(username, nativeDmoVersion),
        );
      };
      const previewNativeDmo = async (input: NativeDmoDeployInput): Promise<NativeDmoPreview> =>
        (this.preflightNativeDmo ?? preflightDmo)(
          input.document,
          dmoClient(),
          requestScope,
          ...fieldRemoval(dmoMappings, dmoClient),
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
      const ciBindings = new Map<string, string>();
      const verifyCiBinding = async (input: DeployInput): Promise<void> => {
        if (input.document.kind !== 'calculated-insight') return;
        const context = ciIntent(input).context!;
        const bound = await context.bind(input.document, context.check);
        context.check();
        const fingerprint = createHash('sha256').update(JSON.stringify(bound)).digest('hex');
        const prior = ciBindings.get(input.path);
        if (prior !== undefined && prior !== fingerprint) throw new Error('CI binding drift');
        ciBindings.set(input.path, fingerprint);
      };
      let failed = false;
      let blocked = false;
      for (const input of inputs) {
        try {
          const segment = input.document.kind === 'segment';
          if (segment) await this.verifySegmentInput(input as SegmentDeployInput);
          const preview =
            input.document.kind === 'dlo'
              ? await this.preflightDlo(input.document, dloClient())
              : input.document.kind === 'calculated-insight'
                ? await this.preflightCalculatedInsight(
                    input.document,
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
          if (input.document.kind === 'calculated-insight') {
            await this.verifyCalculatedInsightInput(input as CalculatedInsightDeployInput);
            if (['create', 'update', 'unchanged'].includes(preview.outcome))
              await verifyCiBinding(input);
            if (
              !flags.preview &&
              (preview.outcome === 'create' || preview.outcome === 'update') &&
              (flags['allow-processing'] !== true ||
                !(preview as CalculatedInsightPreview).requiredEffects.includes('processing'))
            ) {
              blocked = true;
              (preview.diagnostics as Array<{ code: string; message: string }>).push({
                code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                message:
                  'CI processing requires explicit --allow-processing. No batch writes were attempted.',
              });
            }
          }
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
                  'Qualified Segment creates and updates require explicit --allow-processing. No batch writes were attempted.',
              });
            }
          }
          envelope.result.items.push({
            ...preview,
            ...(routes(input) ? { routes: routes(input) } : {}),
            identity: { ...input.document.identity },
            operation: 'preview',
            path: input.path,
          });
          if (preview.outcome === 'blocked' || preview.outcome === 'blocked-changes')
            blocked = true;
        } catch (error) {
          failed = true;
          envelope.result.items.push({
            identity: { ...input.document.identity },
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
                ...(mappedFieldMappings(error) ? { mappedFields: mappedFieldMappings(error) } : {}),
              },
            ],
          });
        }
      }
      if (flags.preview && !failed) await verifyInputs();
      if (!flags.preview) {
        const items: ExecutionItem[] = inputs.map((input, index) => {
          const { outcome, target, absenceProof, diagnostics } = envelope.result.items[
            index
          ] as DeployPreviewResult;
          return {
            identity: { ...input.document.identity },
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
                  route: (envelope.result.items[index] as IdentityResolutionDeployPreview).route,
                  requiredEffects: (envelope.result.items[index] as IdentityResolutionDeployPreview)
                    .requiredEffects,
                }
              : {}),
            ...(input.document.kind === 'calculated-insight'
              ? {
                  family: 'calculated-insight' as const,
                  route: (envelope.result.items[index] as CalculatedInsightPreview).route,
                  requiredEffects: (envelope.result.items[index] as CalculatedInsightPreview)
                    .requiredEffects,
                }
              : {}),
            ...(input.document.kind === 'segment'
              ? {
                  family: 'segment' as const,
                  route: {
                    apiVersion: familySelection(input).soapNumeric,
                    method:
                      (envelope.result.items[index] as SegmentDeployPreview).outcome === 'create'
                        ? ('POST' as const)
                        : ('PATCH' as const),
                    resource: 'segments' as const,
                  },
                  requiredEffects: (envelope.result.items[index] as SegmentDeployPreview)
                    .requiredEffects,
                }
              : {}),
            diagnostics: [],
          };
        });
        // Keep whole-selection evidence, but never mistake admission for attempted execution.
        envelope.result.items = items;
        if (!failed && !blocked) {
          for (const [index, input] of inputs.entries()) {
            const item = items[index];
            try {
              await verifyInputs();
              // Re-admit every pending dependent before any next write, including a DMO write.
              for (const pending of inputs.slice(index)) {
                if (pending.document.kind === 'dlo') {
                  await this.preflightDlo(pending.document, dloClient());
                  continue;
                }
                if (pending.document.kind === 'identity-resolution') {
                  await verifyIrBinding(pending);
                  const fresh = await this.preflightIdentityResolution(
                    pending.document,
                    connectionFor(pending),
                    familySelection(pending),
                    effectiveScope,
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
                if (pending.document.kind === 'calculated-insight') {
                  await verifyCiBinding(pending);
                  const fresh = await this.preflightCalculatedInsight(
                    pending.document,
                    connectionFor(pending),
                    familySelection(pending),
                    effectiveScope,
                    ciIntent(pending),
                  );
                  if (
                    ![
                      'unchanged',
                      'update',
                      ...(selection.soapNumeric === '68.0' ? ['create'] : []),
                    ].includes(fresh.outcome) ||
                    ((fresh.outcome === 'update' || fresh.outcome === 'create') &&
                      (flags['allow-processing'] !== true ||
                        !fresh.requiredEffects.includes('processing')))
                  )
                    throw new DependencySelectionError('CI_FRESH_ADMISSION_BLOCKED');
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
                  ? await this.executeDlo(input.document, dloClient())
                  : input.document.kind === 'calculated-insight'
                    ? await this.executeCalculatedInsight(
                        input.document,
                        connectionFor(input),
                        familySelection(input),
                        effectiveScope,
                        {
                          ...ciIntent(input),
                          allowProcessing: flags['allow-processing'] === true,
                          verifyInput: verifyInputs,
                          recordObservation: async (observation) =>
                            this.recordCalculatedInsightObservation(input.path, observation),
                        },
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
                            requestScope,
                            ...fieldRemoval(dmoMappings, dmoClient),
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
      return finish(
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
      );
    } catch (error: unknown) {
      if (error instanceof GitSelectionError) {
        envelope.diagnostics.errors.push({
          code: error.code,
          message:
            error.code === 'BLOCKED_GIT_LIFECYCLE'
              ? 'Git selection blocks renames, conflicts, unstaged or unidentifiable deletions of plugin files, half-deleted calculated insight pairs and a relevant untracked addition combined with any tracked worktree deletion. Stage intended changes to permit Git-inferred rename detection, then resolve unsupported lifecycle changes. Git cannot guarantee historical rename intent.'
              : 'Git selection failed. Use a valid commit reference and canonical files under data360/ (DLO, DMO, mapping, relationship, data stream, data transform) or the configured package directory (data graph, identity resolution, calculated insight, Segment JSON) with matching identities and unchanged admitted bytes.',
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
