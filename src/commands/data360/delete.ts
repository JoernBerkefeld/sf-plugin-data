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
import { nativeDmoName, NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { deleteNativeDmo, retrieveNativeDmo } from '../../services/native-dmo.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { DloError, dloName } from '../../artifacts/dlo-document.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';
import { nativeMappingName, NativeMappingError } from '../../artifacts/native-mapping-document.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import {
  deleteNativeMapping,
  preflightDeleteNativeMapping,
} from '../../services/native-mapping.js';
import {
  isNativeMappingDeletionVersion,
  nativeApiVersion,
  dataStreamApiVersion,
} from '../../transport/api-version.js';
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
      operation: 'preview' | 'delete';
      deleteDlo?: boolean;
      targetApiName?: string;
      targetDloName?: string;
      routes?: Array<{
        operation: string;
        transport: 'native' | 'facade' | 'metadata';
        apiVersion: string;
      }>;
      outcome: 'delete' | 'deleted' | 'unchanged' | 'blocked' | 'failed';
      mutation: 'not-attempted' | 'confirmed-deleted' | 'unknown';
      plan?: Array<{
        operation: 'unmap' | 'delete';
        apiName: string;
        sourceFieldDeveloperName?: string;
        targetFieldDeveloperName?: string;
        developerName?: string;
      }>;
    }>;
  };
};
/** Delete exact native DLO definitions, or preview without mutation. */
export default class Delete extends SfCommand<DeleteEnvelope> {
  public static readonly aliases = ['datacloud:delete', 'd360:delete', 'dc:delete'];
  public static readonly summary =
    'Delete exact Data360 streams, DLOs, DMOs or qualified non-last mappings.';
  public static readonly description =
    'Exact data-graph:Name uses auto/API68/default with one matching native Graph --source-dir artifact and --confirm-delete. Fresh identity, created date, definition, root and ready checks plus explicit empty native dependency/related-segment arrays are mandatory. Exhaustive external-consumer exclusion remains unverified; no generated-resource cleanup, storage or credit guarantee. Graph selections cannot mix families or cascade. Exact calculated-insight:Name__cio requires one matching --source-dir paired XML or JSON member, explicit --api-version 68.0 and default space. Only exact matching NOT_SCHEDULED, never-run DRAFT/ACTIVE configuration is deletable; --confirm-delete explicitly acknowledges destructive CI deletion. CI --preview and already dual-absent targets are read-only without confirmation. Native CI DELETE/read uses API68; independent Metadata and dependency reads remain API65. Bounded independent runtime and Metadata absence is required, not a mutation echo. CI cannot mix families or use --delete-dlo; no cascade, compute, storage or credits guarantee. Other families retain their existing confirmation behavior. Exact data-stream:ApiName selects guarded IngestApi stream deletion at auto/API68/default space only. The linked DLO is preserved by default; --delete-dlo explicitly acknowledges deleting that exclusively linked DLO. Selected stream and linked DLO checks only, not unrelated-org preservation. Stream selections cannot mix with other families. Definition deletion is noninteractive and requires no processing acknowledgement. Non-CI explicit type:ApiName selections retain execution without confirmation. Native routes default to API68; explicit numeric pins are preserved. Mapping deletion admits API61..68/default68 (API62..67 assumed compatible): qualified authored identity Text/Number pairs are unmapped first, then the protected-only mapping is deleted. The last mapping for a DMO is blocked before any unmaps; another source must independently cover all five metadata-qualified protected pairs. Full parent schemas and survivor content are checked after each write. Qualification uses empty custom fixtures, not populated-data guarantees. --preview performs zero writes and reports the ordered plan. Any partial failure stops the batch; no local deletion, parent DELETE, retries or rollback.';
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
        'Exact calculated-insight:Name__cio (paired source required), data-stream:ApiName, dlo:Name__dll, dmo:Name__dlm or mapping:ApiName.',
    }),
    'api-version': Flags.string({
      summary: 'Native numeric route >=61, default/auto68; mapping deletion admits61..68.',
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary: 'Optional native data space; --data-space is a compatibility alias.',
    }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
    'source-dir': Flags.string({
      char: 'd',
      summary: 'CI or native Graph: one exact local source expectation.',
    }),
    'confirm-delete': Flags.boolean({
      default: false,
      summary: 'CI or native Graph: explicitly acknowledge destructive deletion.',
    }),
    'delete-dlo': Flags.boolean({
      default: false,
      summary:
        'Stream-only acknowledgement: delete the exclusively linked DLO; otherwise preserve it.',
    }),
  };
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected nativeGraphClient = createDataGraphClient;
  protected operateNativeGraph = operateNativeDataGraph;
  protected resolveInputs = readDeployInputs;
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
      streams: createDataStreamClient(target, reader, version),
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
  protected preflightDeleteMapping = preflightDeleteNativeMapping;
  protected deleteMapping = deleteNativeMapping;
  protected createDmoClient = createDmoClient;
  protected retrieveDmo = retrieveNativeDmo;
  protected deleteDmo = deleteNativeDmo;
  protected createDloClient = createDloClient;
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
          const action =
            item.operation === 'preview'
              ? `Planned ${item.outcome}`
              : item.outcome === 'deleted'
                ? 'Deleted'
                : item.outcome === 'unchanged'
                  ? 'Unchanged'
                  : item.outcome === 'failed'
                    ? 'Failed'
                    : 'Blocked';
          this.log(`${action}: ${selectorsByItem.get(item)}; mutation: ${item.mutation}.`);
          if (item.operation === 'preview')
            for (const step of item.plan ?? [])
              this.log(
                step.operation === 'unmap'
                  ? `Planned field unmap: ${step.sourceFieldDeveloperName} -> ${step.targetFieldDeveloperName}.`
                  : `Planned mapping delete: ${item.identity.apiName}.`,
              );
        }
      }
      return envelope;
    };
    try {
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
      // Never upgrade explicit pins for the qualified mapping deletion route.
      if (
        selectors.some((selector) => selector.startsWith('mapping:')) &&
        !isNativeMappingDeletionVersion(version)
      )
        throw new NativeMappingError('MAPPING_DELETE_VERSION_UNQUALIFIED');
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
            )
          : native
            ? (this.createDmoClient ?? createDmoClient)(target, version)
            : this.createDloClient(target, version);
        let dispatched = false;
        const client = {
          ...baseClient,
          delete: async (id: string): Promise<void> => {
            dispatched = true;
            await baseClient.delete(id);
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
              deleteField: async (name: string, observedSelector: string): Promise<void> => {
                dispatched = true;
                await mappingBase.deleteField(name, observedSelector);
              },
            } as ReturnType<typeof createMappingClient>;
            const dependencies = {
              source: (this.createDloClient ?? createDloClient)(target, version),
              target: (this.createDmoClient ?? createDmoClient)(target, version),
            };
            if (flags.preview) {
              const plan = await (this.preflightDeleteMapping ?? preflightDeleteNativeMapping)(
                apiName,
                mappingClient,
                dependencies,
                requestScope,
              );
              item.plan = [
                ...plan.removals.map((pair) => ({ operation: 'unmap' as const, apiName, ...pair })),
                { operation: 'delete', apiName },
              ];
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
                ? (this.retrieveDmo ?? retrieveNativeDmo)(apiName, definitionClient, requestScope)
                : this.retrieveDlo(apiName, definitionClient, requestScope));
              item.identity = document.identity;
            } else {
              const receipt = await (native
                ? (this.deleteDmo ?? deleteNativeDmo)(apiName, definitionClient, requestScope)
                : this.deleteDlo(apiName, definitionClient, requestScope));
              item.identity.dataSpace = receipt.dataSpace;
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
          error instanceof DataStreamError
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
