import { DataTransformError, dataTransformName } from '../../artifacts/data-transform-document.js';
import { writeDataTransformDocument } from '../../artifacts/write-data-transform.js';
import { retrieveDataTransform } from '../../services/retrieve-data-transform.js';
import { createDataTransformClient } from '../../transport/data-transform-rest.js';
import { nativeDataGraphReadContext } from '../../services/native-data-graph-context.js';
import {
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../../transport/connect-diagnostic.js';
import { retrieveNativeDataGraph } from '../../services/command-native-data-graph.js';
import { operationDiagnostic } from '../../services/operation-diagnostic.js';
import { dataStreamApiVersion, nativeApiVersion } from '../../transport/api-version.js';
import { DataStreamError } from '../../artifacts/data-stream-document.js';
import { writeDataStreamDocument } from '../../artifacts/write-data-stream.js';
import { createDataStreamClient } from '../../transport/data-stream-rest.js';
import { retrieveNativeDataStream } from '../../services/native-data-stream.js';
import { listNativeNames, listNativeMappingNames } from '../../services/select-native-retrieve.js';
import { retrieveNativeMapping } from '../../services/native-mapping.js';
import { createMappingClient, createMappingInventoryReader } from '../../transport/mapping-rest.js';
import { writeNativeMappingDocument } from '../../artifacts/write-native-mapping.js';
import { NativeMappingError, nativeMappingName } from '../../artifacts/native-mapping-document.js';
import { nativeDmoName, NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { retrieveNativeDmo } from '../../services/native-dmo.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { writeNativeDmoDocument } from '../../artifacts/write-native-dmo.js';
import { dloName, DloError } from '../../artifacts/dlo-document.js';
import { retrieveNativeDlo } from '../../services/native-dlo.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { writeDloDocument } from '../../artifacts/write-dlo.js';
import {
  NativeRelationshipError,
  relationshipDmoName,
} from '../../artifacts/native-relationship-document.js';
import { writeNativeRelationshipDocument } from '../../artifacts/write-native-relationship.js';
import { retrieveNativeRelationships } from '../../services/native-relationship.js';
import { createRelationshipClient } from '../../transport/relationship-rest.js';
import { openBoundSsot } from '../../transport/bound-ssot.js';
import { MappingDefinitionError } from '../../artifacts/write-mapping-definition.js';
import { mappingName } from '../../artifacts/mapping-document.js';
import {
  dataGraphName,
  DataGraphError,
  validateDataGraphDocument,
} from '../../artifacts/data-graph-document.js';
import type { DataGraphDocument } from '../../artifacts/data-graph-document.js';
import { retrieveDataGraph } from '../../services/retrieve-data-graph.js';
import { discoverDataGraphOwner } from '../../services/discover-data-graph-owner.js';
import { McpExecuteClient } from '../../transport/mcp-execute.js';
import { isDeepStrictEqual } from 'node:util';
import { bindDataGraphDependencies } from '../../services/bind-data-graph-dependencies.js';
import { writeDataGraphDocument } from '../../artifacts/write-data-graph.js';
import path from 'node:path';
import {
  calculatedInsightName,
  CalculatedInsightError,
  validateCalculatedInsightPair,
} from '../../artifacts/calculated-insight-document.js';
import type { CalculatedInsightDocument } from '../../artifacts/calculated-insight-document.js';
import {
  retrieveCalculatedInsight,
  calculatedInsightReadContext,
  acquireExactCalculatedInsight,
} from '../../services/retrieve-calculated-insight.js';
import { bindCalculatedInsightDependencies } from '../../services/bind-calculated-insight-dependencies.js';
import { retrieveCalculatedInsightSourceMetadata } from '../../transport/project-metadata.js';
import { writeCalculatedInsightDocument } from '../../artifacts/write-calculated-insight.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import { operationApiVersion, resolveApiVersion } from '../../transport/api-version.js';
import {
  IdentityResolutionError,
  identityResolutionName,
  validateIdentityResolutionDocument,
} from '../../artifacts/identity-resolution-document.js';
import { retrieveIdentityResolution } from '../../services/retrieve-identity-resolution.js';
import { writeIdentityResolutionDocument } from '../../artifacts/write-identity-resolution.js';
import type { IdentityResolutionDocument } from '../../artifacts/identity-resolution-document.js';
import { MetadataReadError } from '../../services/read-metadata.js';
import { ConnectClient, ConnectError } from '../../transport/connect-client.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { SegmentError, segmentName } from '../../artifacts/segment-document.js';
import { writeSegmentDocument } from '../../artifacts/write-segment.js';
import { retrieveSegment } from '../../services/retrieve-segment.js';
import {
  acquireRetrieveSelection,
  RetrieveSelectionError,
} from '../../services/acquire-retrieve-selection.js';
import { DependencySelectionError } from '../../artifacts/dependency-selection.js';

export type RetrieveEnvelope = {
  contract: 'sf-data360-retrieve';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: {
    operation: 'retrieve';
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
      identity?: { dataSpace: string; apiName: string };
      family?: 'relationship' | 'mapping';
    }>;
  };
  provenance: {
    producer: string;
    sourceOrgId: string | null;
    pluginVersion: string;
    command: string;
    generatedAt: string;
  };
  result: {
    scope: { dataSpace: string; outputDir: string };
    selection: string[];
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
      companionPath?: string;
      paths?: string[];
      family?:
        | 'segment'
        | 'identity-resolution'
        | 'calculated-insight'
        | 'data-graph'
        | 'data-stream'
        | 'data-transform'
        | 'dlo'
        | 'relationship'
        | 'mapping';
      routes?: Array<{
        operation: string;
        apiVersion: string;
        transport: 'native' | 'facade' | 'metadata';
      }>;
    }>;
  };
};

/** Retrieve selected DMO configuration through existing service-owned capability checks. */
export default class Retrieve extends SfCommand<RetrieveEnvelope> {
  public static readonly aliases = ['datacloud:retrieve', 'd360:retrieve', 'dc:retrieve'];
  public static readonly summary =
    'Retrieve Data360 DMOs, exact Segments, calculated insights, Graph or identity resolution configuration.';
  public static readonly description =
    'Exact -m data-transform:Name retrieves qualified CUSTOM BATCH STL authored input at API68/default only into data360/dataTransforms/<Name>.dataTransform.json; observations are not deploy input. Transform inventory and mixed-family selections are unsupported. Exact -m data-stream:ApiName retrieves the qualified Ingestion API subset as portable JSON using native API68 and fixed API67 connection reads, in default space only. Stream inventory and mixed-family selections are unsupported. Native DLO, DMO and mapping retrieval writes canonical JSON under data360/<type>, retaining definition fields without source record IDs. Default/auto uses API68; explicit numeric versions >=61 are preserved, and <=60 is rejected before calls. Omit selectors for all three native families, use -m dlo, -m dmo or -m mapping for complete type inventory, or repeat type:ApiName for exact selections. Mapping JSON uses only native APIs, never Metadata fallback. DMOs retrieved beside other families use the same native JSON at the native version. Prerequisites are checked, never pulled in; select every component to retrieve explicitly. Every DMO selection uses this native route, and --api-version latest is not accepted. Exact -m relationship:Dmo__dlm writes every relationship whose source is that DMO as native JSON under data360/relationship/<Name>.relationship-meta.json; bare relationship inventory is unavailable. Repeat -m dmo:ApiName, -m segment:ApiName, -m calculated-insight:ApiName__cio, -m data-graph:ApiName or -m identity-resolution:ExactObjectApiName for exact selection. Explicit API68 Graph retrieval writes distinct *.native-dataGraph.json authored intent for the qualified root-only Individual NONE subset; no generated identities are replayed. Auto/numeric67 retain the facade Graph artifact and default space; only qualified ready root-only NONE configurations are portable. Graph inventory is blocked. CI requires default space and API65/auto or explicit API68, exporting ACTIVE configurations only as independently correlated standard XML/JSON pairs. Explicit API68 uses native runtime reads with fixed API65 Metadata, source XML and dependency reads; CI inventory is blocked. IR uses native API68 exact owner reads in default space; auto and explicit numeric68 are supported, while numeric67 is rejected. IR inventory is blocked. Auto selects fixed qualified routes, never probes or upgrades an explicit numeric pin. Segment uses auto/API68 or explicit65 in default space for the bounded single-model DBT subset and publishes same-version correlated XML/JSON pairs; API68 live qualification remains pending. Use -m dmo or omit selectors for existing DMO inventory; Segment inventory is unqualified and is not included. Unsupported objects produce per-object diagnostics and a nonzero aggregate while successful files are retained. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; defaults to the configured target org.',
    }),
    'api-version': Flags.orgApiVersion({
      default: 'auto',
      summary:
        'Native default/auto 68.0 or an explicit numeric pin (native minimum 61.0); other families keep their qualified versions.',
      parse: async (value, context, options) =>
        value === 'auto' ? value : Flags.orgApiVersion().parse(value, context, options),
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary:
        'Optional native data space; --data-space is a compatibility alias. Other families require default.',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Exact data-transform:Name API68/default authored input; native dlo/dmo/mapping type or type:ApiName JSON selections; omitted selects all native families. relationship:Dmo__dlm (relationships whose source is that DMO); segment:ApiName, calculated-insight:ApiName__cio, data-graph:ApiName and identity-resolution:ExactObjectApiName remain exact-only.',
    }),
    'output-dir': Flags.directory({
      char: 'd',
      exists: false,
      summary: 'Project root for JSON; defaults to the current directory.',
    }),
    overwrite: Flags.boolean({
      char: 'x',
      default: false,
      summary: 'Permit replacing differing selected files.',
    }),
  };

  protected acquireDataTransform = retrieveDataTransform;
  protected createDataTransformClient = createDataTransformClient;
  protected writeDataTransform = writeDataTransformDocument;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected retrieveNativeGraph = retrieveNativeDataGraph;
  protected acquireDataStream = retrieveNativeDataStream;
  protected writeDataStream = writeDataStreamDocument;
  protected createDataStreamClients = (
    connection: Connection,
    target: string,
    version: string,
  ): Parameters<typeof retrieveNativeDataStream>[1] => {
    const reader = new ConnectClient(connection, version);
    return {
      streams: createDataStreamClient(target, reader, version),
      facade: new McpExecuteClient(connection, {
        requested: '67.0',
        restSelector: 'v67.0',
        soapNumeric: '67.0',
      }),
      dlo: {
        get: (name) => reader.get(`/services/data/v${version}/ssot/data-lake-objects/${name}`),
      },
    };
  };
  protected acquireNativeDmo = retrieveNativeDmo;
  protected createDmoClient = createDmoClient;
  protected writeNativeDmo = writeNativeDmoDocument;
  protected acquireDlo = retrieveNativeDlo;
  protected createDloClient = createDloClient;
  protected writeDlo = writeDloDocument;
  protected acquireNativeMapping = retrieveNativeMapping;
  protected createMappingClient = createMappingClient;
  protected createMappingInventoryReader = createMappingInventoryReader;
  protected writeNativeMapping = writeNativeMappingDocument;
  protected listNativeNames = listNativeNames;
  protected listNativeMappingNames = listNativeMappingNames;
  protected acquireRelationships = retrieveNativeRelationships;
  protected createRelationshipClient = (
    connection: Connection,
    target: string,
    version: string,
    requestScope?: string,
  ): ReturnType<typeof createRelationshipClient> =>
    createRelationshipClient(
      target,
      version,
      undefined,
      requestScope,
      openBoundSsot(target, version, async () => connection),
    );
  protected writeRelationship = writeNativeRelationshipDocument;
  protected discoverDataGraphOwner = discoverDataGraphOwner;
  protected readRawDataGraph = async (
    connection: Parameters<typeof retrieveDataGraph>[0],
    apiName: string,
    selection: Parameters<typeof retrieveDataGraph>[2],
  ): Promise<unknown> =>
    new McpExecuteClient(connection, selection).read('d360_data_graph_get', {
      dataGraphName: apiName,
      includeCIDetails: true,
      includeSegmentDetails: true,
    });
  protected acquireDataGraph = retrieveDataGraph;
  protected bindDataGraph = bindDataGraphDependencies;
  protected writeDataGraph = writeDataGraphDocument;
  protected acquireCalculatedInsight = retrieveCalculatedInsight;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected acquireExactCalculatedInsight = acquireExactCalculatedInsight;
  protected bindCalculatedInsight = bindCalculatedInsightDependencies;
  protected acquireCalculatedInsightXml = retrieveCalculatedInsightSourceMetadata;
  protected writeCalculatedInsight = writeCalculatedInsightDocument;
  protected acquireIdentityResolution = retrieveIdentityResolution;
  protected writeIdentityResolution = writeIdentityResolutionDocument;
  protected acquireSegment = retrieveSegment;
  protected acquireSelection = acquireRetrieveSelection;
  protected writeSegment = writeSegmentDocument;
  protected resolveOrg = async (
    aliasOrUsername?: string,
  ): Promise<Pick<Org, 'getConnection' | 'getOrgId'>> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = aliasOrUsername ?? aggregator.getPropertyValue<string>('target-org');
    const username = target ? state.aliases.resolveUsername(target) : undefined;
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({ username }),
      connectionOptions: { version: '65.0' },
    });
    // Org.create also probes org traits using another unversioned connection; avoid it.
    return {
      getOrgId: () => connection.getAuthInfoFields().orgId!,
      getConnection: (version?: string) => {
        if (version) connection.setApiVersion(version);
        return connection;
      },
    };
  };
  /**
   * Retrieve every relationship whose source is one of the DMOs, one file each. Each DMO's
   * inventory is read completely before its files are written; failures stay per DMO or file.
   * @param {string[]} dmoNames Exact sorted source DMOs.
   * @param {Connection} connection Command-owned connection for the bound reads.
   * @param {string} target Resolved username.
   * @param {string} version Native API version.
   * @param {string | undefined} requestScope Optional request scope.
   * @param {string} root Project root.
   * @param {boolean} overwrite Permit replacing differing files.
   * @returns {Promise<object>} Items, diagnostics and whether a failure was not local.
   */
  private async retrieveRelationshipFamily(
    dmoNames: string[],
    connection: Connection,
    target: string,
    version: string,
    requestScope: string | undefined,
    root: string,
    overwrite: boolean,
  ): Promise<{
    items: RetrieveEnvelope['result']['items'];
    errors: RetrieveEnvelope['diagnostics']['errors'];
    failed: boolean;
  }> {
    const items: RetrieveEnvelope['result']['items'] = [];
    const errors: RetrieveEnvelope['diagnostics']['errors'] = [];
    let failed = false;
    const diagnose = (error: unknown, apiName: string): void => {
      const code = error instanceof NativeRelationshipError ? error.code : 'NATIVE_RETRIEVE_FAILED';
      if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH'].includes(code)) failed = true;
      errors.push({
        code,
        message: operationDiagnostic(
          error,
          'Relationship retrieval did not complete for this item; the org was not changed.',
        ),
        retryable: false,
        identity: { dataSpace: requestScope ?? 'default', apiName },
        family: 'relationship',
      });
    };
    for (const dmo of dmoNames) {
      let documents;
      try {
        documents = await (this.acquireRelationships ?? retrieveNativeRelationships)(
          dmo,
          this.createRelationshipClient(connection, target, version, requestScope),
          requestScope,
        );
      } catch (error) {
        diagnose(error, dmo);
        continue;
      }
      for (const document of documents)
        try {
          const receipt = await (this.writeRelationship ?? writeNativeRelationshipDocument)(
            document,
            root,
            overwrite,
          );
          items.push({
            identity: document.identity,
            operation: 'retrieve',
            family: 'relationship',
            routes: [{ operation: 'relationship.list', apiVersion: version, transport: 'native' }],
            ...receipt,
          });
        } catch (error) {
          diagnose(error, document.identity.apiName);
        }
    }
    return { items, errors, failed };
  }

  /**
   * Acquire the complete runtime projection, then publish only its authored candidate.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  public async run(): Promise<RetrieveEnvelope> {
    const { flags } = await this.parse(Retrieve);
    const requestScope = flags.dataspace;
    const effectiveScope = requestScope ?? 'default';
    const plugin = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };
    const envelope: RetrieveEnvelope = {
      contract: 'sf-data360-retrieve',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: { operation: 'retrieve', plugin, apiVersion: flags['api-version'] },
      diagnostics: { warnings: [], errors: [] },
      provenance: {
        producer: plugin.name,
        // eslint-disable-next-line unicorn/no-null -- Stable JSON envelope represents unresolved org identity explicitly.
        sourceOrgId: null,
        pluginVersion: plugin.version,
        command: 'sf data360 retrieve',
        generatedAt: new Date().toISOString(),
      },
      result: {
        scope: {
          dataSpace: effectiveScope,
          outputDir: path.resolve(flags['output-dir'] ?? process.cwd()),
        },
        selection: flags.metadata ?? [],
        items: [],
      },
    };
    const outputTypes = new Set<string>();
    const errorTypes = new Map<RetrieveEnvelope['diagnostics']['errors'][number], string>();
    const finish = (
      status: RetrieveEnvelope['status'],
      code?: string,
      error?: unknown,
    ): RetrieveEnvelope => {
      envelope.status = status;
      if (code)
        envelope.diagnostics.errors.push({
          code,
          message:
            error === undefined
              ? 'Retrieval did not complete. Check selection, authenticated org, service capability and output path.'
              : operationDiagnostic(
                  error,
                  'Retrieval did not complete. Check selection, authenticated org, service capability and output path.',
                ),
          retryable: false,
        });
      if (status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Retrieve: ${status}${code ? ` (${code})` : ''}.`);
        const groups = new Set([
          ...outputTypes,
          ...envelope.result.items.map((item) => item.family ?? 'dmo'),
        ]);
        const printError = (
          diagnostic: RetrieveEnvelope['diagnostics']['errors'][number],
        ): void => {
          this.log(
            `${diagnostic.identity ? `${errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo'}:${diagnostic.identity.apiName}: ` : ''}${diagnostic.code}: ${diagnostic.message}`,
          );
        };
        for (const family of groups) {
          const items = envelope.result.items.filter((item) => (item.family ?? 'dmo') === family);
          for (const item of items)
            this.log(`Downloaded ${family}:${item.identity.apiName} (${item.outcome}).`);
          for (const diagnostic of envelope.diagnostics.errors)
            if (
              diagnostic.identity &&
              (errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo') === family
            )
              printError(diagnostic);
          this.log(`Downloaded ${family}: ${items.length}`);
        }
        for (const diagnostic of envelope.diagnostics.errors)
          if (
            !diagnostic.identity ||
            !groups.has(errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo')
          )
            printError(diagnostic);
      }
      return envelope;
    };
    const selectors = flags.metadata ?? [];
    if (
      selectors.some((value) => value === 'data-transform' || value.startsWith('data-transform:'))
    ) {
      if (
        selectors.some(
          (value) =>
            !value.startsWith('data-transform:') || !dataTransformName.test(value.slice(15)),
        )
      )
        return finish('blocked', 'INVALID_SELECTION');
      try {
        operationApiVersion(flags['api-version'], 'data-transform');
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
      } catch {
        return finish('blocked', 'INVALID_SCOPE');
      }
      let org;
      try {
        org = await this.resolveOrg(flags['target-org']);
      } catch {
        return finish('blocked', 'TARGET_ORG_REQUIRED');
      }
      const connection = org.getConnection('68.0');
      envelope.provenance.sourceOrgId = org.getOrgId();
      envelope.metadata.soapApiVersion = '68.0';
      const names = [...new Set(selectors.map((value) => value.slice(15)))];
      names.sort();
      envelope.result.selection = names.map((name) => `data-transform:${name}`);
      outputTypes.add('data-transform');
      let failed = false;
      for (const apiName of names) {
        try {
          const observed = await this.acquireDataTransform(
            apiName,
            this.createDataTransformClient(connection, '68.0', effectiveScope),
          );
          if (observed.document.definition.name !== apiName)
            throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
          const receipt = await this.writeDataTransform(
            observed.document,
            path.resolve(flags['output-dir'] ?? process.cwd()),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: { dataSpace: effectiveScope, apiName },
            operation: 'retrieve',
            family: 'data-transform',
            routes: [
              { operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' },
              { operation: 'data-transform.schedule.get', apiVersion: '68.0', transport: 'native' },
            ],
            ...receipt,
          });
        } catch (error) {
          const code =
            error instanceof DataTransformError ? error.code : 'TRANSFORM_RETRIEVE_FAILED';
          if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
            failed = true;
          const diagnostic = {
            code,
            message: operationDiagnostic(
              error,
              'Transform retrieval did not complete; no org write attempted.',
            ),
            retryable: false as const,
            identity: { dataSpace: effectiveScope, apiName },
          };
          envelope.diagnostics.errors.push(diagnostic);
          errorTypes.set(diagnostic, 'data-transform');
        }
      }
      return finish(
        envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
      );
    }
    if (selectors.some((value) => value === 'data-stream' || value.startsWith('data-stream:'))) {
      if (selectors.some((value) => !/^data-stream:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value)))
        return finish('blocked', 'INVALID_SELECTION');
      let version: string;
      try {
        version = dataStreamApiVersion(flags['api-version']);
        if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
      } catch {
        return finish('blocked', 'INVALID_SCOPE');
      }
      let org;
      try {
        org = await this.resolveOrg(flags['target-org']);
      } catch {
        return finish('blocked', 'TARGET_ORG_REQUIRED');
      }
      const connection = org.getConnection(version);
      const target = flags['target-org'] ?? connection.getUsername();
      if (!target) return finish('blocked', 'TARGET_ORG_REQUIRED');
      envelope.provenance.sourceOrgId = org.getOrgId();
      envelope.metadata.soapApiVersion = version;
      const names = [...new Set(selectors.map((value) => value.slice('data-stream:'.length)))];
      names.sort();
      envelope.result.selection = names.map((name) => `data-stream:${name}`);
      outputTypes.add('data-stream');
      let failed = false;
      for (const apiName of names) {
        try {
          const document = await this.acquireDataStream(
            apiName,
            this.createDataStreamClients(connection, target, version),
            effectiveScope,
          );
          const receipt = await this.writeDataStream(
            document,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: document.identity,
            operation: 'retrieve',
            family: 'data-stream',
            routes: [
              { operation: 'data-stream.get', apiVersion: version, transport: 'native' },
              { operation: 'dlo.get', apiVersion: version, transport: 'native' },
              { operation: 'connection.read', apiVersion: '67.0', transport: 'facade' },
            ],
            ...receipt,
          });
        } catch (error) {
          const code =
            error instanceof DataStreamError ? error.code : 'DATA_STREAM_RETRIEVE_FAILED';
          if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
            failed = true;
          const diagnostic = {
            code,
            message: operationDiagnostic(
              error,
              'Data stream retrieval did not complete; no write attempted.',
            ),
            retryable: false as const,
            identity: { dataSpace: effectiveScope, apiName },
          };
          envelope.diagnostics.errors.push(diagnostic);
          errorTypes.set(diagnostic, 'data-stream');
        }
      }
      return finish(
        envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
      );
    }
    if (
      flags['api-version'] === '68.0' &&
      selectors.some((value) => value === 'data-graph' || value.startsWith('data-graph:'))
    ) {
      if (selectors.length !== 1 || !/^data-graph:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(selectors[0]))
        return finish('blocked', 'NATIVE_GRAPH_SELECTION_UNSUPPORTED');
      if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
      try {
        const org = await this.resolveOrg(flags['target-org']);
        const context = await this.nativeGraphContext(org.getConnection('68.0'), 'default');
        const apiName = selectors[0].slice(11);
        const document = await this.retrieveNativeGraph(apiName, context);
        const receipt = await this.writeDataGraph(
          document,
          flags['output-dir'] ?? process.cwd(),
          flags.overwrite,
        );
        envelope.provenance.sourceOrgId = context.orgId;
        envelope.metadata.soapApiVersion = '68.0';
        envelope.result.items.push({
          identity: { dataSpace: 'default', apiName },
          operation: 'retrieve',
          family: 'data-graph',
          routes: [{ operation: 'data-graph.get', apiVersion: '68.0', transport: 'native' }],
          ...receipt,
        });
        return finish('success');
      } catch (error) {
        return finish('blocked', 'NATIVE_GRAPH_RETRIEVE_BLOCKED', error);
      }
    }
    // A relationship is retrieved per source DMO; an inventory of all of them is not offered.
    if (selectors.includes('relationship'))
      return finish('blocked', 'RELATIONSHIP_INVENTORY_UNQUALIFIED');
    const nativeFamilies = ['dlo', 'dmo', 'mapping'] as const;
    const relationshipDmos = [
      ...new Set(
        selectors
          .filter((value) => value.startsWith('relationship:'))
          .map((value) => value.slice('relationship:'.length)),
      ),
    ];
    relationshipDmos.sort();
    if (
      selectors.every(
        (value) =>
          value.startsWith('relationship:') ||
          nativeFamilies.some((family) => value === family || value.startsWith(`${family}:`)),
      )
    ) {
      let version: string;
      try {
        version = nativeApiVersion(flags['api-version']);
        if (relationshipDmos.some((name) => !relationshipDmoName.test(name)))
          return finish('blocked', 'INVALID_SELECTION');
        for (const selector of selectors) {
          if (selector.startsWith('relationship:')) continue;
          const [family, name, extra] = selector.split(':');
          if (
            extra !== undefined ||
            (name !== undefined &&
              !(
                family === 'dlo' ? dloName : family === 'dmo' ? nativeDmoName : nativeMappingName
              ).test(name))
          )
            return finish('blocked', 'INVALID_SELECTION');
        }
      } catch {
        return finish('blocked', 'INVALID_SCOPE');
      }
      let org;
      try {
        org = await this.resolveOrg(flags['target-org']);
      } catch {
        return finish('blocked', 'TARGET_ORG_REQUIRED');
      }
      const connection = org.getConnection(version);
      const target = flags['target-org'] ?? connection.getUsername();
      if (!target) return finish('blocked', 'TARGET_ORG_REQUIRED');
      envelope.provenance.sourceOrgId = org.getOrgId();
      envelope.metadata.soapApiVersion = version;
      const selected = new Map<string, string[]>();
      try {
        let dmoInventory: string[] | undefined;
        // Finish every inventory before publishing any file.
        for (const family of nativeFamilies) {
          const all = selectors.length === 0 || selectors.includes(family);
          let names = selectors
            .filter((value) => value.startsWith(`${family}:`))
            .map((value) => value.slice(family.length + 1));
          if (all) {
            if (family === 'mapping') {
              dmoInventory ??= await this.listNativeNames(connection, version, 'dmo', requestScope);
              names.push(
                ...(await this.listNativeMappingNames(
                  dmoInventory,
                  this.createMappingInventoryReader(connection, version, requestScope),
                  requestScope,
                )),
              );
            } else {
              const inventory =
                family === 'dmo'
                  ? (dmoInventory ??= await this.listNativeNames(
                      connection,
                      version,
                      family,
                      requestScope,
                    ))
                  : await this.listNativeNames(connection, version, family, requestScope);
              names.push(...inventory);
            }
          }
          names = [...new Set(names)];
          names.sort();
          selected.set(family, names);
        }
      } catch (error) {
        return finish(
          'blocked',
          error instanceof NativeMappingError ? error.code : 'NATIVE_INVENTORY_FAILED',
          error,
        );
      }
      envelope.result.selection = [
        ...[...selected].flatMap(([family, names]) => names.map((name) => `${family}:${name}`)),
        ...relationshipDmos.map((name) => `relationship:${name}`),
      ];
      let failed = false;
      for (const family of nativeFamilies) {
        if (
          selectors.length === 0 ||
          selectors.some((selector) => selector === family || selector.startsWith(`${family}:`))
        )
          outputTypes.add(family);
        for (const apiName of selected.get(family) ?? []) {
          try {
            const document =
              family === 'mapping'
                ? await this.acquireNativeMapping(
                    apiName,
                    this.createMappingClient(target, version, undefined, requestScope),
                    requestScope,
                  )
                : family === 'dlo'
                  ? await this.acquireDlo(
                      apiName,
                      this.createDloClient(target, version),
                      requestScope,
                    )
                  : await (this.acquireNativeDmo ?? retrieveNativeDmo)(
                      apiName,
                      this.createDmoClient(target, version),
                      requestScope,
                    );
            const root = flags['output-dir'] ?? process.cwd();
            const receipt =
              document.kind === 'mapping'
                ? await this.writeNativeMapping(document, root, flags.overwrite)
                : document.kind === 'dlo'
                  ? await this.writeDlo(document, root, flags.overwrite)
                  : await (this.writeNativeDmo ?? writeNativeDmoDocument)(
                      document,
                      root,
                      flags.overwrite,
                    );
            envelope.result.items.push({
              identity: document.identity,
              operation: 'retrieve',
              ...(family === 'dmo' ? {} : { family }),
              routes: [{ operation: `${family}.get`, apiVersion: version, transport: 'native' }],
              ...receipt,
            });
          } catch (error) {
            const code =
              error instanceof NativeMappingError ||
              error instanceof NativeDmoError ||
              error instanceof MappingDefinitionError ||
              error instanceof DloError
                ? error.code
                : 'NATIVE_RETRIEVE_FAILED';
            if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
              failed = true;
            envelope.diagnostics.errors.push({
              code,
              message: operationDiagnostic(
                error,
                'Native component retrieval did not complete; no write attempted.',
              ),
              retryable: false,
              identity: { dataSpace: effectiveScope, apiName },
              ...(family === 'mapping' ? { family } : {}),
            });
            errorTypes.set(envelope.diagnostics.errors.at(-1)!, family);
          }
        }
      }
      if (relationshipDmos.length > 0) {
        outputTypes.add('relationship');
        const relationships = await this.retrieveRelationshipFamily(
          relationshipDmos,
          connection,
          target,
          version,
          requestScope,
          flags['output-dir'] ?? process.cwd(),
          flags.overwrite,
        );
        envelope.result.items.push(...relationships.items);
        envelope.diagnostics.errors.push(...relationships.errors);
        if (relationships.failed) failed = true;
      }
      return finish(
        envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
      );
    }
    if (effectiveScope !== 'default') return finish('blocked', 'INVALID_SCOPE');
    const dloSelectors = selectors.filter((value) => value.startsWith('dlo:'));
    const mappingSelectors = selectors.filter((value) => value.startsWith('mapping:'));
    const graphSelectors = selectors.filter((value) => value.startsWith('data-graph:'));
    const ciSelectors = selectors.filter((value) => value.startsWith('calculated-insight:'));
    const irSelectors = selectors.filter((value) => value.startsWith('identity-resolution:'));
    const segmentSelectors = selectors.filter((value) => value.startsWith('segment:'));
    const dmoSelectors = selectors.filter(
      (value) =>
        !value.startsWith('dlo:') &&
        !value.startsWith('mapping:') &&
        !value.startsWith('relationship:') &&
        !value.startsWith('data-graph:') &&
        !value.startsWith('segment:') &&
        !value.startsWith('identity-resolution:') &&
        !value.startsWith('calculated-insight:'),
    );
    const hasDmos = dmoSelectors.length > 0;
    let effectiveVersion: string;
    try {
      if (selectors.includes('dlo')) return finish('blocked', 'DLO_INVENTORY_UNSUPPORTED');
      if (dloSelectors.length > 0) {
        if (dloSelectors.some((value) => !dloName.test(value.slice(4))))
          return finish('blocked', 'INVALID_SELECTION');
        if (!['68.0', 'auto'].includes(flags['api-version']) || effectiveScope !== 'default')
          return finish('blocked', 'INVALID_SCOPE');
      }
      if (selectors.includes('mapping'))
        throw new MappingDefinitionError('MAPPING_INVENTORY_UNQUALIFIED');
      if (mappingSelectors.length > 0) {
        nativeApiVersion(flags['api-version']);
        if (effectiveScope !== 'default') throw new MappingDefinitionError('INVALID_SCOPE');
        if (mappingSelectors.some((value) => !mappingName.test(value.slice(8))))
          throw new MappingDefinitionError('INVALID_SELECTION');
      }
      if (relationshipDmos.length > 0) {
        nativeApiVersion(flags['api-version']);
        if (relationshipDmos.some((name) => !relationshipDmoName.test(name)))
          throw new NativeRelationshipError('INVALID_SELECTION');
      }
      if (selectors.includes('data-graph'))
        throw new DataGraphError('DATA_GRAPH_INVENTORY_UNQUALIFIED');
      if (graphSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'data-graph');
        if (effectiveScope !== 'default') throw new DataGraphError('INVALID_SCOPE');
        if (graphSelectors.some((value) => !dataGraphName.test(value.slice(11))))
          throw new DataGraphError('INVALID_SELECTION');
      }
      if (selectors.includes('calculated-insight'))
        throw new CalculatedInsightError('CI_INVENTORY_UNQUALIFIED');
      if (ciSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'calculated-insight');
        if (effectiveScope !== 'default') throw new CalculatedInsightError('INVALID_SCOPE');
        if (ciSelectors.some((value) => !calculatedInsightName.test(value.slice(19))))
          throw new CalculatedInsightError('INVALID_SELECTION');
      }
      if (selectors.includes('identity-resolution'))
        throw new IdentityResolutionError('IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED');
      if (irSelectors.some((value) => !identityResolutionName.test(value.slice(20))))
        throw new IdentityResolutionError('INVALID_SELECTION');
      if (irSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'identity-resolution');
        if (effectiveScope !== 'default') throw new IdentityResolutionError('INVALID_SCOPE');
      }
      if (segmentSelectors.length > 0) operationApiVersion(flags['api-version'], 'segment');
      // A DMO is read natively at its own version and never pins the other families.
      if (hasDmos) nativeApiVersion(flags['api-version']);
      const sharedFamily =
        segmentSelectors.length > 0
          ? 'segment'
          : ciSelectors.length > 0
            ? 'calculated-insight'
            : graphSelectors.length > 0
              ? 'data-graph'
              : irSelectors.length > 0
                ? 'identity-resolution'
                : undefined;
      effectiveVersion =
        dloSelectors.length === selectors.length && dloSelectors.length > 0
          ? '68.0'
          : mappingSelectors.length === selectors.length && selectors.length > 0
            ? '65.0'
            : sharedFamily
              ? operationApiVersion(flags['api-version'], sharedFamily)
              : hasDmos
                ? nativeApiVersion(flags['api-version'])
                : operationApiVersion(flags['api-version'], 'dlo');
    } catch (error: unknown) {
      return finish(
        'blocked',
        error instanceof MappingDefinitionError ||
          error instanceof NativeRelationshipError ||
          error instanceof DloError ||
          error instanceof DataGraphError ||
          error instanceof IdentityResolutionError ||
          error instanceof CalculatedInsightError
          ? error.code
          : 'INVALID_SCOPE',
      );
    }
    try {
      if (selectors.includes('segment')) throw new SegmentError('SEGMENT_INVENTORY_UNQUALIFIED');
      if (segmentSelectors.some((value) => !segmentName.test(value.slice(8))))
        throw new SegmentError('INVALID_SELECTION');
      if (
        segmentSelectors.length > 0 &&
        (!['65.0', '68.0'].includes(effectiveVersion) || effectiveScope !== 'default')
      )
        throw new SegmentError('INVALID_SCOPE');
      // Validate DMO selector syntax before auth; unknown families land here and are refused.
      if (
        dmoSelectors.some(
          (value) =>
            value !== 'dmo' && !(value.startsWith('dmo:') && nativeDmoName.test(value.slice(4))),
        )
      )
        return finish('blocked', 'INVALID_SELECTION');
    } catch (error: unknown) {
      return finish('blocked', error instanceof SegmentError ? error.code : 'INVALID_SELECTION');
    }
    let org: Pick<Org, 'getConnection' | 'getOrgId'>;
    try {
      org = await this.resolveOrg(flags['target-org']);
    } catch {
      return finish('blocked', 'TARGET_ORG_REQUIRED');
    }
    let failed = false;
    const diagnose = (error: unknown, apiName?: string, family = 'dmo'): void => {
      let code = 'RETRIEVE_FAILED';
      if (
        error instanceof DloError ||
        error instanceof DataGraphError ||
        error instanceof CalculatedInsightError ||
        error instanceof IdentityResolutionError ||
        error instanceof SegmentError ||
        error instanceof DependencySelectionError ||
        error instanceof RetrieveSelectionError ||
        error instanceof MetadataReadError ||
        error instanceof NativeDmoError ||
        error instanceof ConnectError
      )
        code = error.code;
      else failed = true;
      if (
        code === 'IDENTITY_RESOLUTION_ACQUISITION_FAILED' ||
        code === 'OUTPUT_FAILED' ||
        code === 'PARTIAL_DMO_OUTPUT' ||
        code === 'PARTIAL_SEGMENT_OUTPUT' ||
        code === 'SEGMENT_ACQUISITION_FAILED' ||
        code === 'DEPENDENCY_ACQUISITION_FAILED' ||
        code === 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' ||
        error instanceof ConnectError ||
        code === 'ACQUISITION_FAILED'
      )
        failed = true;
      if (error instanceof RetrieveSelectionError) {
        apiName = error.identity.apiName;
        family = error.identity.kind;
      }
      envelope.diagnostics.errors.push({
        code,
        message: getConnectDiagnostic(error)
          ? operationDiagnostic(
              error,
              'This component was not retrieved; no files were written for it.',
            )
          : apiName
            ? 'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.'
            : 'DMO inventory could not be resolved completely; no files were written.',
        retryable: false,
        ...(apiName ? { identity: { dataSpace: effectiveScope, apiName } } : {}),
      });
      errorTypes.set(envelope.diagnostics.errors.at(-1)!, family);
    };
    try {
      envelope.provenance.sourceOrgId = org.getOrgId();
      // Every remaining route is a fixed numeric pin; nothing is discovered from the org.
      const selection = await resolveApiVersion(effectiveVersion, async () => {
        throw new Error('Fixed route must not discover.');
      });
      envelope.metadata.soapApiVersion = selection.soapNumeric;
      // Definition-only members are independent; retain successes across read/output failures.

      const dlos = [...new Set(dloSelectors.map((value) => value.slice(4)))];
      dlos.sort();
      for (const apiName of dlos) {
        try {
          const target =
            flags['target-org'] ?? org.getConnection(flags['api-version']).getUsername();
          if (!target) throw new SegmentError('TARGET_ORG_REQUIRED');
          const document = await this.acquireDlo(apiName, this.createDloClient(target, '68.0'));
          const receipt = await this.writeDlo(
            document,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: { dataSpace: 'default', apiName },
            operation: 'retrieve',
            family: 'dlo',
            routes: [{ operation: 'dlo.get', apiVersion: '68.0', transport: 'native' }],
            ...receipt,
          });
        } catch (error: unknown) {
          diagnose(error, apiName, 'dlo');
          if (
            !(error instanceof SegmentError) ||
            ![
              'OVERWRITE_REQUIRED',
              'UNSAFE_PATH',
              'TARGET_ORG_REQUIRED',
              'INVALID_PROJECT',
            ].includes(error.code)
          )
            failed = true;
        }
      }
      const mappings = [...new Set(mappingSelectors.map((value) => value.slice(8)))];
      mappings.sort();
      for (const apiName of mappings) {
        try {
          const target = flags['target-org'] ?? org.getConnection('65.0').getUsername();
          if (!target) throw new MappingDefinitionError('TARGET_ORG_REQUIRED');
          const version = nativeApiVersion(flags['api-version']);
          const document = await this.acquireNativeMapping(
            apiName,
            this.createMappingClient(target, version, undefined, requestScope),
            requestScope,
          );
          const receipt = await this.writeNativeMapping(
            document,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: { dataSpace: 'default', apiName },
            operation: 'retrieve',
            family: 'mapping',
            routes: [{ operation: 'mapping.get', apiVersion: version, transport: 'native' }],
            ...receipt,
          });
        } catch (error: unknown) {
          const code = error instanceof MappingDefinitionError ? error.code : 'OUTPUT_FAILED';
          if (
            ![
              'INVALID_SELECTION',
              'INVALID_SCOPE',
              'OVERWRITE_REQUIRED',
              'UNSAFE_PATH',
              'TARGET_ORG_REQUIRED',
            ].includes(code)
          )
            failed = true;
          envelope.diagnostics.errors.push({
            code,
            family: 'mapping',
            identity: { dataSpace: 'default', apiName },
            message:
              'This mapping definition was not exported. Check the exact selection, acquisition and output path.',
            retryable: false,
          });
        }
      }
      if (relationshipDmos.length > 0) {
        const target = flags['target-org'] ?? org.getConnection().getUsername();
        if (target) {
          const relationships = await this.retrieveRelationshipFamily(
            relationshipDmos,
            org.getConnection(),
            target,
            nativeApiVersion(flags['api-version']),
            requestScope,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push(...relationships.items);
          envelope.diagnostics.errors.push(...relationships.errors);
          if (relationships.failed) failed = true;
        } else
          envelope.diagnostics.errors.push({
            code: 'TARGET_ORG_REQUIRED',
            family: 'relationship',
            message: 'Relationships were not retrieved; no target org username was resolved.',
            retryable: false,
          });
      }
      // Pin only this command-owned connection, before any service uses it.
      const connection = org.getConnection(selection.soapNumeric);
      // The family pin of this path does not apply to native DMO reads (auto is 68.0).
      const nativeDmoVersion = nativeApiVersion(flags['api-version']);
      let names: string[] = [];
      if (hasDmos) {
        names = dmoSelectors
          .filter((selector) => selector !== 'dmo')
          .map((selector) => selector.slice(4));
        if (dmoSelectors.includes('dmo'))
          names.push(
            ...(await this.listNativeNames(connection, nativeDmoVersion, 'dmo', effectiveScope)),
          );
        names = [...new Set(names)];
        names.sort();
      }
      if (hasDmos) outputTypes.add('dmo');
      for (const selector of selectors) outputTypes.add(selector.split(':')[0]);
      // eslint-disable-next-line unicorn/no-array-sort -- Deterministic ordering on a new deduplicated array.
      const segments = [...new Set(segmentSelectors.map((value) => value.slice(8)))].sort();
      envelope.result.selection = [
        ...dlos.map((name) => `dlo:${name}`),
        ...mappings.map((name) => `mapping:${name}`),
        ...relationshipDmos.map((name) => `relationship:${name}`),
        ...names.map((name) => `dmo:${name}`),
        ...segments.map((name) => `segment:${name}`),
      ];
      // Acquire and resolve the complete bounded selection before publishing any files.
      const selected =
        names.length > 0 || segments.length > 0
          ? await (this.acquireSelection ?? acquireRetrieveSelection)(
              [
                ...names.map((apiName) => ({
                  kind: 'dmo' as const,
                  dataSpace: effectiveScope,
                  apiName,
                })),
                ...segments.map((apiName) => ({
                  kind: 'segment' as const,
                  dataSpace: effectiveScope,
                  apiName,
                })),
              ],
              connection,
              selection,
              {
                dmo: async (apiName: string): Promise<unknown> => {
                  const target = flags['target-org'] ?? connection.getUsername();
                  if (!target) throw new NativeDmoError('TARGET_ORG_REQUIRED');
                  return (this.createDmoClient ?? createDmoClient)(target, nativeDmoVersion).get(
                    apiName,
                  );
                },
              },
            )
          : [];
      const calculatedInsights: Array<{
        document: CalculatedInsightDocument;
        definitionXml: string;
      }> = [];
      // Complete every CI admission before any selected output and before IR repins the receiver.
      const ciApiVersion =
        ciSelectors.length > 0
          ? operationApiVersion(flags['api-version'], 'calculated-insight')
          : '65.0';
      const ciVersion = Object.freeze({
        requested: ciApiVersion,
        restSelector: `v${ciApiVersion}`,
        soapNumeric: ciApiVersion,
      });
      // eslint-disable-next-line unicorn/no-array-sort -- Deterministic exact CI order.
      for (const apiName of [...new Set(ciSelectors.map((value) => value.slice(19)))].sort()) {
        const ciConnection = org.getConnection(ciApiVersion);
        const context =
          ciApiVersion === '68.0'
            ? this.calculatedInsightContext(ciConnection, effectiveScope)
            : undefined;
        const acquired = context
          ? await (async () => {
              const exact = await this.acquireExactCalculatedInsight(context, apiName);
              if (exact.state !== 'present' || exact.status !== 'ACTIVE')
                throw retainConnectDiagnostic(
                  new CalculatedInsightError('CI_ACQUISITION_FAILED'),
                  getConnectDiagnostic(exact),
                );
              return {
                identity: exact.document.identity,
                candidate: exact.document,
                blockers: [],
              };
            })()
          : await this.acquireCalculatedInsight(ciConnection, apiName, ciVersion, effectiveScope);
        if (!acquired.candidate || acquired.blockers.length > 0)
          throw retainConnectDiagnostic(
            new CalculatedInsightError(acquired.blockers[0] ?? 'CI_ACQUISITION_FAILED'),
            getConnectDiagnostic(acquired),
          );
        if (
          acquired.identity.apiName !== apiName ||
          acquired.identity.dataSpace !== 'default' ||
          acquired.candidate.identity.apiName !== apiName
        )
          throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
        await (context
          ? context.bind(acquired.candidate)
          : this.bindCalculatedInsight(
              acquired.candidate,
              ciConnection,
              ciVersion,
              effectiveScope,
            ));
        const target = flags['target-org'] ?? ciConnection.getUsername();
        if (!target) throw new CalculatedInsightError('TARGET_ORG_REQUIRED');
        const definitionXml = await this.acquireCalculatedInsightXml(target, apiName);
        const document = validateCalculatedInsightPair(
          acquired.candidate,
          definitionXml,
          apiName.slice(0, -5),
        );
        context?.check();
        calculatedInsights.push({ document, definitionXml });
      }
      const sourceGraphGuards: Array<() => Promise<void>> = [];
      const dataGraphs: Array<{ document: DataGraphDocument }> = [];
      if (graphSelectors.length > 0) {
        const graphVersion = await resolveApiVersion('67.0', async () => {
          throw new Error('Fixed route must not discover.');
        });
        const graphConnection = Object.create(connection) as Connection;
        Object.defineProperty(graphConnection, 'version', { value: '67.0' });
        Object.defineProperty(graphConnection, 'getApiVersion', { value: () => '67.0' });
        Object.defineProperty(graphConnection, '_refreshDelegate', { value: undefined });

        for (const apiName of [
          ...new Set(graphSelectors.map((value) => value.slice(11))),
          // eslint-disable-next-line unicorn/no-array-sort -- Sort the fresh array within the existing TypeScript library target.
        ].sort()) {
          let acquired = await this.acquireDataGraph(
            graphConnection,
            apiName,
            graphVersion,
            effectiveScope,
          );
          if (!acquired.candidate || acquired.blockers.length > 0) {
            let binding;
            try {
              const raw = await this.readRawDataGraph(graphConnection, apiName, graphVersion);
              binding = await this.discoverDataGraphOwner(
                raw,
                apiName,
                graphConnection,
                graphVersion,
                effectiveScope,
              );
            } catch {
              throw new DataGraphError('DATA_GRAPH_OWNER_DISCOVERY_FAILED');
            }
            if (!binding?.root) throw new DataGraphError('DATA_GRAPH_OWNER_DISCOVERY_FAILED');
            acquired = await this.acquireDataGraph(
              graphConnection,
              apiName,
              graphVersion,
              effectiveScope,
              { dependencyBinding: binding },
            );
            const ownerName = binding.root.identity.owner.apiName;
            if (irSelectors.length > 0 && !irSelectors.includes(`identity-resolution:${ownerName}`))
              throw new DataGraphError('DATA_GRAPH_SELECTED_OWNER_MISMATCH');
            if (acquired.candidate) {
              const document = acquired.candidate;
              sourceGraphGuards.push(async () => {
                const fresh = await this.bindDataGraph(
                  document,
                  graphConnection,
                  graphVersion,
                  effectiveScope,
                );
                if (!isDeepStrictEqual(fresh, binding))
                  throw new DataGraphError('DATA_GRAPH_SOURCE_BINDING_CHANGED');
                const current = await this.acquireDataGraph(
                  graphConnection,
                  apiName,
                  graphVersion,
                  effectiveScope,
                  { dependencyBinding: fresh },
                );
                if (!isDeepStrictEqual(current, acquired))
                  throw new DataGraphError('DATA_GRAPH_SOURCE_CONFIGURATION_CHANGED');
              });
            }
          }
          if (!acquired.candidate || acquired.blockers.length > 0)
            throw retainConnectDiagnostic(
              new DataGraphError(acquired.blockers[0] ?? 'DATA_GRAPH_ACQUISITION_FAILED'),
              getConnectDiagnostic(acquired),
            );
          const document = validateDataGraphDocument(acquired.candidate);
          if (
            acquired.identity.apiName !== apiName ||
            acquired.identity.dataSpace !== 'default' ||
            document.identity.apiName !== apiName
          )
            throw new DataGraphError('DATA_GRAPH_IDENTITY_CHANGED');
          await this.bindDataGraph(document, graphConnection, graphVersion, effectiveScope);
          dataGraphs.push({ document });
        }
      }
      const identityResolutions: Array<{ document: IdentityResolutionDocument }> = [];
      if (irSelectors.length > 0) {
        const irVersion = await resolveApiVersion('68.0', async () => {
          throw new Error('Fixed route must not discover.');
        });
        const irConnection = org.getConnection('68.0');

        for (const apiName of [
          ...new Set(irSelectors.map((value) => value.slice(20))),
          // eslint-disable-next-line unicorn/no-array-sort -- Sort a detached selector list within the ES2022 library target.
        ].sort()) {
          const acquired = await this.acquireIdentityResolution(
            irConnection,
            apiName,
            irVersion,
            effectiveScope,
          );
          if (acquired.blockers.length > 0 || !acquired.candidate)
            throw retainConnectDiagnostic(
              new IdentityResolutionError(acquired.blockers[0] ?? 'INCOMPLETE_IDENTITY_RESOLUTION'),
              getConnectDiagnostic(acquired),
            );
          const document = validateIdentityResolutionDocument(acquired.candidate);
          if (
            acquired.identity.apiName !== apiName ||
            acquired.identity.dataSpace !== effectiveScope ||
            document.identity.apiName !== apiName ||
            document.identity.dataSpace !== effectiveScope
          )
            throw new IdentityResolutionError('IDENTITY_RESOLUTION_IDENTITY_MISMATCH');
          identityResolutions.push({ document });
          if (graphSelectors.length > 0)
            sourceGraphGuards.push(async () => {
              const fresh = await this.acquireIdentityResolution(
                irConnection,
                apiName,
                irVersion,
                effectiveScope,
              );
              if (!isDeepStrictEqual(fresh, acquired))
                throw new IdentityResolutionError('IDENTITY_RESOLUTION_SOURCE_CHANGED');
            });
        }
      }
      for (const verify of sourceGraphGuards) await verify();
      const entries = [...selected, ...calculatedInsights, ...identityResolutions, ...dataGraphs];
      envelope.result.selection = [
        ...dlos.map((name) => `dlo:${name}`),
        ...mappings.map((name) => `mapping:${name}`),
        ...relationshipDmos.map((name) => `relationship:${name}`),
        ...entries.map(({ document }) => `${document.kind}:${document.identity.apiName}`),
      ];
      for (const entry of entries) {
        const { document } = entry;
        try {
          const receipt =
            document.kind === 'data-graph'
              ? await this.writeDataGraph(
                  document,
                  flags['output-dir'] ?? process.cwd(),
                  flags.overwrite,
                )
              : document.kind === 'calculated-insight'
                ? await this.writeCalculatedInsight(
                    document,
                    'definitionXml' in entry ? entry.definitionXml : '',
                    flags['output-dir'] ?? process.cwd(),
                    flags.overwrite,
                  )
                : document.kind === 'identity-resolution'
                  ? await this.writeIdentityResolution(
                      document,
                      flags['output-dir'] ?? process.cwd(),
                      flags.overwrite,
                    )
                  : document.kind === 'segment'
                    ? await this.writeSegment(
                        document,
                        flags['output-dir'] ?? process.cwd(),
                        flags.overwrite,
                      )
                    : await (this.writeNativeDmo ?? writeNativeDmoDocument)(
                        document,
                        flags['output-dir'] ?? process.cwd(),
                        flags.overwrite,
                      );
          envelope.result.items.push({
            identity: { ...document.identity },
            ...(document.kind === 'segment' ||
            document.kind === 'identity-resolution' ||
            document.kind === 'calculated-insight' ||
            document.kind === 'data-graph'
              ? { family: document.kind }
              : {}),
            ...(flags['api-version'] === 'auto' ||
            document.kind === 'segment' ||
            document.kind === 'identity-resolution' ||
            document.kind === 'calculated-insight' ||
            document.kind === 'data-graph'
              ? {
                  routes:
                    document.kind === 'data-graph'
                      ? [
                          {
                            operation: 'd360_data_graph_get',
                            apiVersion: '67.0',
                            transport: 'facade' as const,
                          },
                          {
                            operation: 'd360_transform_get',
                            apiVersion: '67.0',
                            transport: 'facade' as const,
                          },
                          {
                            operation: 'dependency.metadata',
                            apiVersion: '65.0',
                            transport: 'metadata' as const,
                          },
                        ]
                      : document.kind === 'identity-resolution'
                        ? [
                            {
                              operation: 'identity-resolutions.get',
                              apiVersion: '68.0',
                              transport: 'native' as const,
                            },
                          ]
                        : [
                            {
                              operation: `${document.kind}.get`,
                              apiVersion:
                                document.kind === 'calculated-insight'
                                  ? ciApiVersion
                                  : document.kind === 'segment'
                                    ? selection.soapNumeric
                                    : '65.0',
                              transport: 'native' as const,
                            },
                            ...(document.kind === 'segment'
                              ? []
                              : [
                                  {
                                    operation: `${document.kind}.metadata`,
                                    apiVersion: '65.0',
                                    transport: 'metadata' as const,
                                  },
                                ]),
                            ...(document.kind === 'calculated-insight' && ciApiVersion === '68.0'
                              ? [
                                  {
                                    operation: 'calculated-insight.source',
                                    apiVersion: '65.0',
                                    transport: 'metadata' as const,
                                  },
                                  {
                                    operation: 'dependency.get',
                                    apiVersion: '65.0',
                                    transport: 'native' as const,
                                  },
                                  {
                                    operation: 'dependency.metadata',
                                    apiVersion: '65.0',
                                    transport: 'metadata' as const,
                                  },
                                ]
                              : []),
                          ],
                }
              : {}),
            // A DMO here is always one native read.
            ...(document.kind === 'dmo'
              ? {
                  routes: [
                    {
                      operation: 'dmo.get',
                      apiVersion: nativeDmoVersion,
                      transport: 'native' as const,
                    },
                  ],
                }
              : {}),
            operation: 'retrieve',
            ...receipt,
          });
        } catch (error: unknown) {
          diagnose(error, document.identity.apiName, document.kind);
          // Do not publish dependents after an ambiguous prerequisite output failure.
          break;
        }
      }
    } catch (error: unknown) {
      diagnose(error);
    }
    return finish(
      envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
    );
  }
}
