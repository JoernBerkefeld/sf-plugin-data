import { deleteDataTransform } from '../../services/delete-data-transform.js';
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
import { operationDiagnostic } from '../../services/operation-diagnostic.js';
import {
  nativeDmoFieldName,
  nativeDmoName,
  NativeDmoError,
} from '../../artifacts/native-dmo-document.js';
import { writeNativeDmoDocument } from '../../artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../../artifacts/write-native-mapping.js';
import {
  dmoFieldLocalFiles,
  executeDmoFieldDelete,
  localFileExists,
  planDmoFieldDelete,
  refreshDmoFieldFiles,
} from '../../services/delete-dmo-field.js';
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
import { deleteNativeDlo, retrieveNativeDlo } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';
import { nativeMappingName, NativeMappingError } from '../../artifacts/native-mapping-document.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import {
  deleteNativeMapping,
  preflightDeleteNativeMapping,
} from '../../services/native-mapping.js';
import { nativeApiVersion, dataStreamApiVersion } from '../../transport/api-version.js';
import { DataStreamError } from '../../artifacts/data-stream-document.js';
import { ConnectClient } from '../../transport/connect-client.js';
import { createDataStreamClient } from '../../transport/data-stream-rest.js';
import { McpExecuteClient } from '../../transport/mcp-execute.js';
import {
  preflightDeleteDataStream,
  executeDeleteDataStream,
} from '../../services/command-native-data-stream.js';

export type DeleteEnvelope = {
  contract: 'sf-data360-delete';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'delete'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: { command: 'sf data360 delete'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'preview' | 'delete' | 'delete-field';
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
      /** Field-level delete preview: project files an execution would refresh. */
      localFiles?: Array<{ path: string; exists: boolean }>;
      targetApiName?: string;
      targetDloName?: string;
      routes?: Array<{
        operation: string;
        transport: 'native' | 'facade' | 'metadata';
        apiVersion: string;
      }>;
      outcome:
        | 'delete'
        | 'deleted'
        | 'deletion-processing'
        | 'deletion-unconfirmed'
        | 'unchanged'
        | 'blocked'
        | 'failed';
      mutation:
        | 'not-attempted'
        | 'confirmed-deleted'
        | 'acknowledged-processing'
        | 'acknowledged'
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
  'source-dir'?: string;
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
    'Exact data-transform:Name requires one matching .dataTransform.json --source-dir, exact --transform-target-id, auto/API68/default space and --confirm-delete. Preview is GET-only. A guarded exact CUSTOM/BATCH/ACTIVE unscheduled target is deleted with one native DELETE; settlement needs complete bounded inventory omission of both ID and name plus preserved source/output DLOs, otherwise the result is deletion-unconfirmed (never replay). No DLO, run or data cleanup; exhaustive external-consumer exclusion is not established. Exact segment:Name requires one matching .segment.json --source-dir, auto/API68/default and --confirm-delete. Preview performs zero writes; fresh source bindings and exact runtime/private identity are checked before one native DELETE. Only independent absence or a preserved DELETING/PROCESSING read acknowledges the result; HTTP204 alone is insufficient. No replay, Segment XML, shared-DMO deletion or physical-output cleanup guarantee. Exact identity-resolution:Individual_suffix (1..4 alphanumeric suffix, or Individual) requires one matching .identityResolution.json --source-dir, auto/API68/default space and --confirm-delete for a present matching PUBLISHED nonautomatic owner. Preview and verified absent targets are read-only without confirmation. A fresh target-local ID is resolved before one native68 DELETE; bounded exact ID/name absence confirms owner-definition deletion only. Exhaustive external-consumer exclusion and physical profile/output cleanup remain unverified. IR never cascades, runs processing, replays writes or falls back to another API. Exact data-graph:Name uses auto/API68/default with one matching native Graph --source-dir artifact and --confirm-delete. Fresh identity, created date, definition, root and ready checks plus explicit empty native dependency/related-segment arrays are mandatory. Exhaustive external-consumer exclusion remains unverified; no generated-resource cleanup, storage or credit guarantee. Graph selections cannot mix families or cascade. Exact calculated-insight:Name__cio requires one matching --source-dir paired XML or JSON member, explicit --api-version 68.0 and default space. Only exact matching NOT_SCHEDULED, never-run DRAFT/ACTIVE configuration is deletable; --confirm-delete explicitly acknowledges destructive CI deletion. CI --preview and already dual-absent targets are read-only without confirmation. Native CI DELETE/read uses API68; independent Metadata and dependency reads remain API65. Bounded independent runtime and Metadata absence is required, not a mutation echo. CI cannot mix families or use --delete-dlo; no cascade, compute, storage or credits guarantee. Other families retain their existing confirmation behavior. Exact data-stream:ApiName selects guarded IngestApi stream deletion at auto/API68/default space only. The linked DLO is preserved by default; --delete-dlo explicitly acknowledges deleting that exclusively linked DLO. Selected stream and linked DLO checks only, not unrelated-org preservation. Stream selections cannot mix with other families. Definition deletion is noninteractive and requires no processing acknowledgement. Non-CI explicit type:ApiName selections retain execution without confirmation. Native routes default to API68; explicit numeric pins are preserved. Mapping deletion runs at native API 61 and up (default 68) and deletes the whole mapping with one Metadata API destructive deployment (ObjectSourceTargetMap), whatever pairs it holds, also onto a standard DMO. Afterwards the mapping must read absent and the other mappings and the fields of the DMO must be unchanged. The last mapping of a custom DMO is refused before any write (MAPPING_LAST_MAPPING_DELETE_BLOCKED) because Salesforce does not delete it; delete the DMO instead, which removes its mapping. Qualification uses empty custom fixtures, not populated-data guarantees. --preview performs zero writes and reports the planned step. Any partial failure stops the batch; no local deletion, retries or rollback. Whole-DMO deletion applies to custom DMOs only; standard, namespaced and platform-generated DMOs are refused with UNSUPPORTED_DMO_TARGET, in the preview as well. Field-level delete: exactly one dmo:Name__dlm with one or more --field Name__c and --confirm-delete removes the named custom fields from that DMO. It is the one delete operation that changes mappings it was not given and writes project files. Reads first: custom or standard DMO only (platform-generated DMOs are refused); every field must exist, be custom, not the primary key and not generated, so the standard and system fields of a standard DMO are never removed; every mapping pair targeting a named field is collected, and a mapped field whose pair cannot be identified is refused. Then one Metadata API destructive change for all fields, sent once and never retried; Salesforce drops the mapping pairs of the removed fields itself. Fresh reads right before it must still match the plan, and polled reads afterwards must show the fields absent, exactly the collected pairs gone and every other mapping, pair, DMO property and field unchanged; any other difference fails with DMO_FIELD_REMOVAL_SIDE_EFFECT. Nothing is rolled back. After success the existing data360/dmo and data360/mapping files under --output-dir (default: current directory) are overwritten with the current definitions; absent files are not created and no file is deleted. A failed file refresh keeps the confirmed org result and exits nonzero. --field --preview writes nothing and reports pairs, fields and files. --field cannot be combined with another selector, --source-dir, --delete-dlo or --transform-target-id.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      required: true,
      summary:
        'Exact data-transform:Name (source and --transform-target-id required), segment:Name, identity-resolution:Individual_suffix or calculated-insight:Name__cio (source required), data-stream:ApiName, dlo:Name__dll, dmo:Name__dlm (alone with --field) or mapping:ApiName.',
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
      summary: 'Transform, Segment, IR, CI or native Graph: one exact local source expectation.',
    }),
    'confirm-delete': Flags.boolean({
      default: false,
      summary:
        'Transform, Segment, IR, CI, native Graph or --field: explicitly acknowledge destructive deletion.',
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
  };
  protected deleteDataTransform = deleteDataTransform;
  protected createDataTransformClient = createDataTransformClient;
  protected createDataTransformDloReader = createDataTransformDloReader;
  protected verifyDataTransformInput = verifyDataTransformInputDigest;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
  protected resolveInputs = readDeployInputs;
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
      facade: new McpExecuteClient(connection, {
        requested: '67.0',
        restSelector: 'v67.0',
        soapNumeric: '67.0',
      }),
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
      flags['delete-dlo'] ||
      flags['transform-target-id'] !== undefined
    )
      return refuse(
        'INVALID_FIELD_DELETE_SELECTION',
        '--field removes fields from exactly one -m dmo:<Name__dlm> and cannot be combined with another selector, --source-dir, --delete-dlo or --transform-target-id; --output-dir is valid only with --field. No org call was made.',
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
   * Execute exact selection sequentially, stopping on the first error.
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
    const finish = (): DeleteEnvelope => {
      if (envelope.status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Delete${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
        for (const item of envelope.result.items) {
          if (item.fields) {
            for (const line of fieldDeleteLines(item)) this.log(line);
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
        }
        for (const diagnostic of envelope.diagnostics.errors)
          this.log(`${diagnostic.code}: ${diagnostic.message}`);
      }
      return envelope;
    };
    try {
      if (flags.field?.length || flags['output-dir'] !== undefined) {
        await this.deleteDmoFields(flags, envelope);
        return finish();
      }
      if (
        flags.metadata?.some(
          (selector) => selector === 'data-transform' || selector.startsWith('data-transform:'),
        )
      ) {
        const targetId = flags['transform-target-id'];
        if (
          flags.metadata.length !== 1 ||
          !/^data-transform:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(flags.metadata[0]) ||
          flags['delete-dlo'] ||
          typeof flags['source-dir'] !== 'string' ||
          !flags['source-dir'].endsWith('.dataTransform.json') ||
          typeof targetId !== 'string' ||
          !dataTransformId.test(targetId)
        )
          throw new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
        if (
          !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
          effectiveScope !== 'default'
        )
          throw new DataTransformError('INVALID_TRANSFORM_SCOPE');
        const snapshot = JSON.stringify(flags);
        const inputs = await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: [flags['source-dir']],
        });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'data-transform')
          throw new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
        const input = inputs[0] as DataTransformDeployInput;
        const name = input.document.definition.name as string;
        if (flags.metadata[0] !== `data-transform:${name}`)
          throw new DataTransformError('INVALID_TRANSFORM_DELETE_SELECTION');
        const desired = validateDataTransformDocument(input.document);
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot)
            throw new DataTransformError('TRANSFORM_DELETE_INPUT_DRIFT');
          await this.verifyDataTransformInput(input);
        };
        await verifyInput();
        const item: DeleteEnvelope['result']['items'][number] = {
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
        selectorsByItem.set(item, flags.metadata[0]);
        envelope.result.items.push(item);
        envelope.metadata.apiVersion = '68.0';
        let dispatched = false;
        try {
          const connection = await this.resolveConnection(flags['target-org']);
          const username = connection.getUsername();
          if (!username) throw new DloError('TARGET_ORG_REQUIRED');
          await verifyInput();
          const base = this.createDataTransformClient(connection, '68.0', 'default');
          const client = {
            ...base,
            delete: async (value: string): Promise<void> => {
              dispatched = true;
              await base.delete(value);
            },
          };
          envelope.diagnostics.warnings.push(
            'Transform definition deletion only. Settlement uses bounded visible inventory and preserved source/output DLOs; exhaustive external-consumer exclusion is not established. No DLO, run, schedule or data cleanup; no retry, atomic concurrency guarantee or fallback.',
          );
          const result = await this.deleteDataTransform(
            desired,
            client,
            this.createDataTransformDloReader(connection),
            {
              targetId,
              preview: flags.preview,
              confirmDelete: flags['confirm-delete'] === true,
              verifyInput,
            },
          );
          item.outcome = result.outcome === 'preview' ? 'delete' : result.outcome;
          item.mutation = result.mutation;
          if (result.prerequisitesPreserved) item.prerequisitesPreserved = true;
          if (result.outcome === 'deletion-unconfirmed') {
            envelope.status = 'failed';
            envelope.diagnostics.errors.push({
              code: 'TRANSFORM_DELETE_UNCONFIRMED',
              message:
                'DELETE outcome is not confirmed. Do not replay; reconcile by reading the Transform inventory before any further action.',
              retryable: false,
            });
          } else envelope.status = result.outcome === 'blocked' ? 'blocked' : 'success';
          if (result.outcome === 'blocked')
            envelope.diagnostics.errors.push({
              code: 'TRANSFORM_DELETE_CONFIRMATION_REQUIRED',
              message: 'Pass --confirm-delete to delete; nothing was changed.',
              retryable: false,
            });
          return finish();
        } catch (error) {
          item.outcome = dispatched ? 'failed' : 'blocked';
          item.mutation = dispatched ? 'unknown' : 'not-attempted';
          envelope.status = dispatched ? 'failed' : 'blocked';
          throw error;
        }
      }
      if (flags['transform-target-id'] !== undefined) throw new DloError('INVALID_SELECTION');
      if (
        flags.metadata?.some(
          (selector) => selector === 'segment' || selector.startsWith('segment:'),
        )
      ) {
        if (
          flags.metadata.length !== 1 ||
          !/^segment:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(flags.metadata[0]) ||
          flags['delete-dlo'] ||
          typeof flags['source-dir'] !== 'string' ||
          !flags['source-dir'].endsWith('.segment.json')
        )
          throw new DloError('INVALID_SELECTION');
        if (
          !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
          effectiveScope !== 'default'
        )
          throw new DloError('INVALID_SCOPE');
        const snapshot = JSON.stringify(flags);
        const inputs = await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: [flags['source-dir']],
        });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'segment')
          throw new DloError('INVALID_SELECTION');
        const input = inputs[0] as SegmentDeployInput;
        const desired = validateSegmentDocument(input.document);
        if (flags.metadata[0] !== `segment:${desired.identity.apiName}`)
          throw new DloError('INVALID_SELECTION');
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await this.verifySegmentInput(input);
        };
        await verifyInput();
        const connection = await this.resolveConnection(flags['target-org']);
        await verifyInput();
        envelope.metadata.apiVersion = '68.0';
        envelope.diagnostics.warnings.push(
          'Segment definition deletion only. Selected source compatibility is checked; exhaustive external-consumer exclusion and physical membership/output cleanup remain unverified. No shared DMO is deleted.',
        );
        const result = await this.deleteSegment(
          desired,
          connection,
          { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
          'default',
          { preview: flags.preview, confirmDelete: flags['confirm-delete'] === true, verifyInput },
        );
        const item = {
          ...result,
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
        envelope.result.items.push(item);
        selectorsByItem.set(item, flags.metadata[0]);
        envelope.status =
          result.outcome === 'failed'
            ? 'failed'
            : result.outcome === 'blocked'
              ? 'blocked'
              : 'success';
        envelope.diagnostics.errors.push(
          ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
        );
        return finish();
      }
      if (
        flags.metadata?.some(
          (selector) =>
            selector === 'identity-resolution' || selector.startsWith('identity-resolution:'),
        )
      ) {
        if (
          flags.metadata.length !== 1 ||
          !/^identity-resolution:Individual(?:_[A-Za-z0-9]{1,4})?$/u.test(flags.metadata[0]) ||
          flags['delete-dlo'] ||
          typeof flags['source-dir'] !== 'string' ||
          !flags['source-dir'].endsWith('.identityResolution.json')
        )
          throw new DloError('INVALID_SELECTION');
        if (
          !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
          effectiveScope !== 'default'
        )
          throw new DloError('INVALID_SCOPE');
        const snapshot = JSON.stringify(flags);
        const inputs = await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: [flags['source-dir']],
        });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'identity-resolution')
          throw new DloError('INVALID_SELECTION');
        const input = inputs[0] as IdentityResolutionDeployInput;
        const desired = nativeIdentityResolutionDocument(input.document);
        if (flags.metadata[0] !== `identity-resolution:${desired.identity.apiName}`)
          throw new DloError('INVALID_SELECTION');
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await this.verifyIdentityResolutionInput(input);
        };
        await verifyInput();
        const connection = await this.resolveConnection(flags['target-org']);
        await verifyInput();
        envelope.metadata.apiVersion = '68.0';
        envelope.diagnostics.warnings.push(
          'IR owner-definition deletion only. Exhaustive external-consumer exclusion and physical profile/output cleanup remain unverified; no generated DMO or source DMO/DLO is manually deleted.',
        );
        const result = await this.deleteIdentityResolution(
          desired,
          connection,
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
        envelope.result.items.push(item);
        selectorsByItem.set(item, flags.metadata[0]);
        envelope.status =
          result.outcome === 'failed'
            ? 'failed'
            : result.outcome === 'blocked'
              ? 'blocked'
              : 'success';
        envelope.diagnostics.errors.push(
          ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
        );
        return finish();
      }
      if (
        flags.metadata?.some(
          (selector) => selector === 'data-graph' || selector.startsWith('data-graph:'),
        )
      ) {
        if (
          flags.metadata.length !== 1 ||
          !/^data-graph:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(flags.metadata[0]) ||
          flags['delete-dlo'] ||
          !flags['source-dir']
        )
          throw new DloError('INVALID_SELECTION');
        if (
          !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
          effectiveScope !== 'default'
        )
          throw new DloError('INVALID_SCOPE');
        const inputs = await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: [flags['source-dir']],
        });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'native-data-graph')
          throw new DloError('INVALID_SELECTION');
        const input = inputs[0] as NativeDataGraphDeployInput;
        const name = input.document.definition.name as string;
        if (flags.metadata[0] !== `data-graph:${name}`) throw new DloError('INVALID_SELECTION');
        const snapshot = JSON.stringify(flags);
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('INVALID_SELECTION');
          await verifyNativeDataGraphInputDigest(input);
        };
        await verifyInput();
        const connection = await this.resolveConnection(flags['target-org']);
        const context = await this.nativeGraphContext(connection, 'default');
        envelope.metadata.apiVersion = '68.0';
        envelope.diagnostics.warnings.push(nativeGraphLimitations);
        const result = await this.operateNativeGraph(
          input.document,
          context,
          this.nativeGraphClient(connection, '68.0', 'default'),
          {
            operation: 'delete',
            preview: flags.preview,
            confirmed: flags['confirm-delete'] === true,
            verifyInput,
          },
        );
        const item: DeleteEnvelope['result']['items'][number] = {
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
              : result.mutation === 'unknown'
                ? 'unknown'
                : 'not-attempted',
          routes: [{ operation: 'data-graph.delete', apiVersion: '68.0', transport: 'native' }],
        };
        envelope.result.items.push(item);
        selectorsByItem.set(item, flags.metadata[0]);
        envelope.status =
          result.outcome === 'failed'
            ? 'failed'
            : result.outcome === 'blocked'
              ? 'blocked'
              : 'success';
        if (result.outcome === 'failed' || result.outcome === 'blocked')
          envelope.diagnostics.errors.push({
            code: 'DELETE_FAILED',
            message: operationDiagnostic(
              result,
              'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
            ),
            retryable: false,
          });
        return finish();
      }
      const ciSelection = flags.metadata?.some(
        (selector) =>
          selector === 'calculated-insight' || selector.startsWith('calculated-insight:'),
      );
      if (ciSelection) {
        if (
          flags.metadata.length !== 1 ||
          !/^calculated-insight:[A-Za-z][A-Za-z0-9_]*__cio$/u.test(flags.metadata[0]) ||
          flags['delete-dlo']
        )
          throw new DloError('INVALID_SELECTION');
        if (flags['api-version'] !== '68.0' || effectiveScope !== 'default')
          throw new DloError('INVALID_SCOPE');
        const source = flags['source-dir'];
        if (
          typeof source !== 'string' ||
          !source ||
          !/\.(?:calculatedInsight\.json|mktCalcInsightObjectDef-meta\.xml)$/u.test(source)
        )
          throw new DloError('INVALID_SELECTION');
        const snapshot = JSON.stringify(flags);
        const inputs = await this.resolveInputs({ cwd: process.cwd(), sourceDir: [source] });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'calculated-insight')
          throw new DloError('INVALID_SELECTION');
        const input = inputs[0] as CalculatedInsightDeployInput;
        const desired = validateCalculatedInsightDocument(input.document);
        if (
          flags.metadata[0] !== `calculated-insight:${desired.identity.apiName}` ||
          desired.spec.publishScheduleInterval !== 'NOT_SCHEDULED'
        )
          throw new DloError('INVALID_SELECTION');
        const verifyInput = async (): Promise<void> => {
          if (JSON.stringify(flags) !== snapshot) throw new DloError('CI_INPUT_DRIFT');
          await this.verifyCalculatedInsightInput(input);
        };
        await verifyInput();
        const connection = await this.resolveConnection(flags['target-org']);
        const context = this.calculatedInsightContext(connection, 'default');
        await verifyInput();
        this.calculatedInsightObservations = [];
        const result = await this.deleteCalculatedInsight(
          desired,
          connection,
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
        envelope.result.items.push(item);
        selectorsByItem.set(item, flags.metadata[0]);
        envelope.status =
          result.outcome === 'failed'
            ? 'failed'
            : result.outcome === 'blocked'
              ? 'blocked'
              : 'success';
        envelope.diagnostics.errors.push(
          ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
        );
        return finish();
      }
      if (flags['source-dir'] !== undefined || flags['confirm-delete'])
        throw new DloError('INVALID_SELECTION');
      const streamSelection = flags.metadata?.some(
        (selector) => selector === 'data-stream' || selector.startsWith('data-stream:'),
      );
      if (streamSelection) {
        if (
          !flags.metadata.every((selector) =>
            /^data-stream:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(selector),
          )
        )
          throw new DataStreamError('INVALID_STREAM_DELETE_SELECTION');
        if (effectiveScope !== 'default') throw new DataStreamError('INVALID_STREAM_BINDING');
        const version = dataStreamApiVersion(flags['api-version']);
        envelope.metadata.apiVersion = version;
        // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh selection within the ES2022 library target.
        const selected = Object.freeze([...new Set(flags.metadata)].sort());
        const snapshot = JSON.stringify({
          metadata: flags.metadata,
          version: flags['api-version'],
          scope: flags.dataspace,
          cascade: flags['delete-dlo'],
          preview: flags.preview,
          target: flags['target-org'],
        });
        const verifyInput = async (): Promise<void> => {
          if (
            JSON.stringify({
              metadata: flags.metadata,
              version: flags['api-version'],
              scope: flags.dataspace,
              cascade: flags['delete-dlo'],
              preview: flags.preview,
              target: flags['target-org'],
            }) !== snapshot
          )
            throw new DataStreamError('STREAM_DELETE_INPUT_DRIFT');
        };
        await verifyInput();
        const target = await this.resolveTarget(flags['target-org']);
        const clients = await this.createDataStreamClients(target, version);
        for (const selector of selected) {
          const apiName = selector.slice('data-stream:'.length);
          const item: DeleteEnvelope['result']['items'][number] = {
            identity: { apiName, dataSpace: 'default' },
            operation: flags.preview ? 'preview' : 'delete',
            outcome: 'blocked',
            mutation: 'not-attempted',
            deleteDlo: flags['delete-dlo'] === true,
            routes: [
              { operation: 'data-stream.delete', transport: 'native', apiVersion: version },
              { operation: 'dlo.get', transport: 'native', apiVersion: version },
              { operation: 'dependency.read', transport: 'facade', apiVersion: '67.0' },
            ],
          };
          selectorsByItem.set(item, selector);
          envelope.result.items.push(item);
          await verifyInput();
          const options = { deleteDlo: flags['delete-dlo'] === true, verifyInput };
          if (flags.preview) {
            const preview = await this.preflightDeleteDataStream(apiName, clients, options);
            await verifyInput();
            item.outcome = preview.outcome;
          } else {
            const result = await this.executeDeleteDataStream(apiName, clients, options);
            item.outcome = result.outcome;
            item.mutation = result.mutation;
            if ('targetApiName' in result) item.targetApiName = result.targetApiName;
            if ('targetDloName' in result) item.targetDloName = result.targetDloName;
            if (result.outcome !== 'deleted') {
              envelope.status = result.outcome;
              envelope.diagnostics.errors.push(...result.diagnostics);
              return finish();
            }
          }
        }
        envelope.status = 'success';
        return finish();
      }
      if (flags['delete-dlo'])
        throw new DataStreamError('STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION');
      if (
        !flags.metadata?.length ||
        flags.metadata.some(
          (value) =>
            !(value.startsWith('dlo:') && dloName.test(value.slice(4))) &&
            !(value.startsWith('dmo:') && nativeDmoName.test(value.slice(4))) &&
            !(value.startsWith('mapping:') && nativeMappingName.test(value.slice(8))),
        )
      )
        throw new DloError('INVALID_SELECTION');
      let version: string;
      try {
        version = nativeApiVersion(flags['api-version']);
      } catch {
        throw new DloError('INVALID_SCOPE');
      }
      const selectors = [...new Set(flags.metadata)];
      const target = await this.resolveTarget(flags['target-org']);
      for (const selector of selectors) {
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
        const client = mapping
          ? baseClient
          : {
              ...baseClient,
              delete: async (id: string): Promise<void> => {
                dispatched = true;
                await (baseClient as ReturnType<typeof createDloClient>).delete(id);
              },
            };
        const item: DeleteEnvelope['result']['items'][number] = {
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
            const mappingClient = {
              ...client,
              remove: async (name: string): Promise<void> => {
                dispatched = true;
                await mappingBase.remove(name);
              },
            } as ReturnType<typeof createMappingClient>;
            // The DMO read uses the bound single-attempt GET client.
            const dependencies = { target: this.createDmoNativeDeleteClient(target, version) };
            if (flags.preview) {
              await (this.preflightDeleteMapping ?? preflightDeleteNativeMapping)(
                apiName,
                mappingClient,
                dependencies,
                requestScope,
              );
              item.plan = [{ operation: 'delete', apiName }];
            } else
              await (this.deleteMapping ?? deleteNativeMapping)(
                apiName,
                mappingClient,
                dependencies,
                requestScope,
              );
          } else {
            const definitionClient = client as ReturnType<typeof createDloClient>;
            if (flags.preview) {
              const document = await (native
                ? (this.retrieveDmo ?? previewDeleteNativeDmo)(
                    apiName,
                    definitionClient,
                    requestScope,
                  )
                : this.retrieveDlo(apiName, definitionClient, requestScope));
              item.identity = document.identity;
            } else {
              const receipt = await (native
                ? (this.deleteDmo ?? deleteNativeDmo)(apiName, definitionClient, requestScope)
                : this.deleteDlo(apiName, definitionClient, requestScope));
              item.identity.dataSpace = receipt.dataSpace;
              if ('processing' in receipt && receipt.processing) {
                // DLO/DMO read back in a DELETING state: acknowledged, server still processing.
                item.outcome = 'deletion-processing';
                item.mutation = 'acknowledged-processing';
                continue;
              }
            }
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
            envelope.status = 'failed';
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
            return finish();
          }
          item.outcome = dispatched ? 'failed' : 'blocked';
          item.mutation = dispatched ? 'unknown' : 'not-attempted';
          envelope.status = dispatched ? 'failed' : 'blocked';
          throw error;
        }
      }
      envelope.status = 'success';
    } catch (error) {
      envelope.diagnostics.errors.push({
        code:
          error instanceof DeployInputError ||
          error instanceof DloError ||
          error instanceof NativeDmoError ||
          error instanceof NativeMappingError ||
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
    }
    return finish();
  }
}
