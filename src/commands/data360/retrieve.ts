import {
  ingestionName,
  IngestionDloError,
  validateIngestionDloDocument,
} from '../../artifacts/ingestion-dlo-document.js';
import type { IngestionDloDocument } from '../../artifacts/ingestion-dlo-document.js';
import { retrieveIngestionDlo } from '../../services/retrieve-ingestion-dlo.js';
import { writeIngestionDloDocument } from '../../artifacts/write-ingestion-dlo.js';
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
import { retrieveCalculatedInsight } from '../../services/retrieve-calculated-insight.js';
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
import type { RetrieveDependencyEntry } from '../../services/select-retrieve-dependencies.js';
import { DmoDocumentError } from '../../artifacts/dmo-document.js';
import { DmoWriteError, writeDmoDocument } from '../../artifacts/write-other-dmo.js';
import {
  DmoRetrieveError,
  retrieveDmo,
  selectDmos,
  validateDmoSelection,
} from '../../services/retrieve-other-dmo.js';
import { ConnectError } from '../../transport/connect-client.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { SegmentError, segmentName } from '../../artifacts/segment-document.js';
import { writeSegmentDocument } from '../../artifacts/write-segment.js';
import { retrieveSegment } from '../../services/retrieve-segment.js';
import {
  selectRetrieveDependencies,
  RetrieveDependencyError,
} from '../../services/select-retrieve-dependencies.js';
import { DependencySelectionError } from '../../artifacts/dependency-selection.js';
import type { DependencyIdentity, SelectionReason } from '../../artifacts/dependency-selection.js';

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
    dependencies?: Array<{ identity: DependencyIdentity; reason: SelectionReason }>;
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
      companionPath?: string;
      family?:
        'segment' | 'identity-resolution' | 'calculated-insight' | 'data-graph' | 'ingestion-dlo';
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
    'Exact -m ingestion-dlo:Name__dll supports API67/auto default-space sole-source single-event Ingestion API Text configuration, without inventory or dependency expansion. Repeat -m dmo:ApiName, -m segment:ApiName, -m calculated-insight:ApiName__cio, -m data-graph:ApiName or -m identity-resolution:ExactObjectApiName for exact selection. Graph requires auto or numeric67 and default space; only qualified ready root-only NONE configurations are portable. Graph inventory and dependency expansion are blocked. CI requires API65 or auto/default and independently correlated standard XML/JSON pairs; CI inventory and dependency expansion are blocked. IR requires auto or numeric67, default space and independent API67 facade/API65 native correlation; IR inventory and dependency expansion are blocked. Auto selects fixed qualified routes, never probes or upgrades an explicit numeric pin. Segment supports only the qualified API65/default single-model DBT subset and publishes correlated XML/JSON pairs. Use -m dmo or omit selectors for existing DMO inventory; Segment inventory is unqualified and is not included. Unsupported objects produce per-object diagnostics and a nonzero aggregate while successful files are retained. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; defaults to the configured target org.',
    }),
    'api-version': Flags.orgApiVersion({
      default: '65.0',
      summary:
        'Explicit numeric pin, fixed qualified per-operation auto, or experimental DMO-only latest.',
      parse: async (value, context, options) =>
        value === 'latest' || value === 'auto'
          ? value
          : Flags.orgApiVersion().parse(value, context, options),
    }),
    'data-space': Flags.string({
      default: 'default',
      summary: 'Logical data space (current service supports default).',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Repeat dmo[:ApiName], segment:ApiName, calculated-insight:ApiName__cio, data-graph:ApiName or identity-resolution:ExactObjectApiName; omitted retains DMO inventory.',
    }),
    'output-dir': Flags.directory({
      char: 'd',
      exists: false,
      summary: 'Project root for JSON; defaults to the current directory.',
    }),
    'include-dependencies': Flags.boolean({
      default: false,
      summary:
        'Include supported source prerequisites; unsupported dependency acquisition blocks publication.',
    }),
    overwrite: Flags.boolean({
      char: 'x',
      default: false,
      summary: 'Permit replacing differing selected files.',
    }),
  };

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
  protected bindCalculatedInsight = bindCalculatedInsightDependencies;
  protected acquireCalculatedInsightXml = retrieveCalculatedInsightSourceMetadata;
  protected writeCalculatedInsight = writeCalculatedInsightDocument;
  protected acquireIdentityResolution = retrieveIdentityResolution;
  protected writeIdentityResolution = writeIdentityResolutionDocument;
  protected acquireSegment = retrieveSegment;
  protected selectDependencies = selectRetrieveDependencies;
  protected writeSegment = writeSegmentDocument;
  protected acquire = retrieveDmo;
  protected selectDocuments = selectDmos;
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
  protected writeDocument = writeDmoDocument;
  protected acquireIngestionDlo = retrieveIngestionDlo;
  protected writeIngestionDlo = writeIngestionDloDocument;

  /**
   * Acquire the complete runtime projection, then publish only its authored candidate.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  public async run(): Promise<RetrieveEnvelope> {
    const { flags } = await this.parse(Retrieve);
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
          dataSpace: flags['data-space'],
          outputDir: path.resolve(flags['output-dir'] ?? process.cwd()),
        },
        selection: flags.metadata ?? [],
        items: [],
      },
    };
    const finish = (status: RetrieveEnvelope['status'], code?: string): RetrieveEnvelope => {
      envelope.status = status;
      if (code)
        envelope.diagnostics.errors.push({
          code,
          message:
            'Retrieval did not complete. Check selection, authenticated org, service capability and output path.',
          retryable: false,
        });
      if (status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Retrieve: ${status}${code ? ` (${code})` : ''}.`);
        for (const diagnostic of envelope.diagnostics.errors)
          this.log(
            `${diagnostic.identity ? `dmo:${diagnostic.identity.apiName}: ` : ''}${diagnostic.code}: ${diagnostic.message}`,
          );
      }
      return envelope;
    };
    const selectors = flags.metadata ?? [];
    const ingestionSelectors = selectors.filter((value) => value.startsWith('ingestion-dlo:'));
    const graphSelectors = selectors.filter((value) => value.startsWith('data-graph:'));
    const ciSelectors = selectors.filter((value) => value.startsWith('calculated-insight:'));
    const irSelectors = selectors.filter((value) => value.startsWith('identity-resolution:'));
    const segmentSelectors = selectors.filter((value) => value.startsWith('segment:'));
    const dmoSelectors = selectors.filter(
      (value) =>
        !value.startsWith('ingestion-dlo:') &&
        !value.startsWith('data-graph:') &&
        !value.startsWith('segment:') &&
        !value.startsWith('identity-resolution:') &&
        !value.startsWith('calculated-insight:'),
    );
    const hasDmos = dmoSelectors.length > 0 || selectors.length === 0;
    let effectiveVersion: string;
    try {
      if (selectors.includes('ingestion-dlo'))
        throw new IngestionDloError('INGESTION_DLO_INVENTORY_UNQUALIFIED');
      if (ingestionSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'ingestion-dlo');
        if (flags['data-space'] !== 'default') throw new IngestionDloError('INVALID_SCOPE');
        if (
          ingestionSelectors.some(
            (value) => !ingestionName(value.slice(14)) || !value.endsWith('__dll'),
          )
        )
          throw new IngestionDloError('INVALID_SELECTION');
        if (flags['include-dependencies'])
          throw new IngestionDloError('INGESTION_DLO_DEPENDENCY_EXPANSION_UNSUPPORTED');
      }
      if (selectors.includes('data-graph'))
        throw new DataGraphError('DATA_GRAPH_INVENTORY_UNQUALIFIED');
      if (graphSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'data-graph');
        if (flags['data-space'] !== 'default') throw new DataGraphError('INVALID_SCOPE');
        if (graphSelectors.some((value) => !dataGraphName.test(value.slice(11))))
          throw new DataGraphError('INVALID_SELECTION');
      }
      if (selectors.includes('calculated-insight'))
        throw new CalculatedInsightError('CI_INVENTORY_UNQUALIFIED');
      if (ciSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'calculated-insight');
        if (flags['data-space'] !== 'default') throw new CalculatedInsightError('INVALID_SCOPE');
        if (ciSelectors.some((value) => !calculatedInsightName.test(value.slice(19))))
          throw new CalculatedInsightError('INVALID_SELECTION');
        if (flags['include-dependencies'])
          throw new CalculatedInsightError('CI_DEPENDENCY_EXPANSION_UNSUPPORTED');
      }
      if (selectors.includes('identity-resolution'))
        throw new IdentityResolutionError('IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED');
      if (irSelectors.some((value) => !identityResolutionName.test(value.slice(20))))
        throw new IdentityResolutionError('INVALID_SELECTION');
      if (irSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'identity-resolution');
        if (flags['data-space'] !== 'default') throw new IdentityResolutionError('INVALID_SCOPE');
        if (flags['include-dependencies'] && graphSelectors.length === 0)
          throw new IdentityResolutionError('IDENTITY_RESOLUTION_DEPENDENCY_EXPANSION_UNSUPPORTED');
      }
      if (segmentSelectors.length > 0) operationApiVersion(flags['api-version'], 'segment');
      if (hasDmos) operationApiVersion(flags['api-version'], 'dmo');
      effectiveVersion = operationApiVersion(
        flags['api-version'],
        hasDmos
          ? 'dmo'
          : segmentSelectors.length > 0
            ? 'segment'
            : ciSelectors.length > 0
              ? 'calculated-insight'
              : graphSelectors.length > 0
                ? 'data-graph'
                : irSelectors.length > 0
                  ? 'identity-resolution'
                  : 'ingestion-dlo',
      );
    } catch (error: unknown) {
      return finish(
        'blocked',
        error instanceof IngestionDloError ||
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
        (effectiveVersion !== '65.0' || flags['data-space'] !== 'default')
      )
        throw new SegmentError('INVALID_SCOPE');
      // Validate syntax/scope before auth; latest capability evidence arrives after discovery.
      if (hasDmos)
        validateDmoSelection(
          dmoSelectors,
          effectiveVersion === 'latest' ? '65.0' : effectiveVersion,
          flags['data-space'],
        );
    } catch (error: unknown) {
      return finish(
        'blocked',
        error instanceof DmoRetrieveError || error instanceof SegmentError
          ? error.code
          : 'INVALID_SELECTION',
      );
    }
    let org: Pick<Org, 'getConnection' | 'getOrgId'>;
    try {
      org = await this.resolveOrg(flags['target-org']);
    } catch {
      return finish('blocked', 'TARGET_ORG_REQUIRED');
    }
    let failed = false;
    const diagnose = (error: unknown, apiName?: string): void => {
      let code = 'RETRIEVE_FAILED';
      if (
        error instanceof IngestionDloError ||
        error instanceof DataGraphError ||
        error instanceof CalculatedInsightError ||
        error instanceof IdentityResolutionError ||
        error instanceof SegmentError ||
        error instanceof DependencySelectionError ||
        error instanceof RetrieveDependencyError ||
        error instanceof DmoWriteError ||
        error instanceof DmoRetrieveError ||
        error instanceof ConnectError
      )
        code = error.code;
      else if (error instanceof DmoDocumentError) code = 'UNSUPPORTED_DMO_DOCUMENT';
      else failed = true;
      if (
        code === 'IDENTITY_RESOLUTION_ACQUISITION_FAILED' ||
        code === 'OUTPUT_FAILED' ||
        code === 'PARTIAL_SEGMENT_OUTPUT' ||
        code === 'SEGMENT_ACQUISITION_FAILED' ||
        code === 'DEPENDENCY_ACQUISITION_FAILED' ||
        code === 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' ||
        error instanceof ConnectError ||
        code === 'ACQUISITION_FAILED'
      )
        failed = true;
      if (error instanceof RetrieveDependencyError) {
        apiName = error.identity.apiName;
        envelope.result.dependencies = [{ identity: error.identity, reason: error.reason }];
      }
      envelope.diagnostics.errors.push({
        code,
        message: apiName
          ? 'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.'
          : 'DMO inventory could not be resolved completely; no files were written.',
        retryable: false,
        ...(apiName ? { identity: { dataSpace: flags['data-space'], apiName } } : {}),
      });
    };
    try {
      envelope.provenance.sourceOrgId = org.getOrgId();
      let selection;
      try {
        selection = await resolveApiVersion(effectiveVersion, async () => {
          // This command owns the initialized connection; suppress refresh replay and redirects.
          const receiver = Object.create(org.getConnection()) as Connection;
          Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
          return receiver.request({ method: 'GET', url: '/services/data' }, {
            retry: { maxRetries: 0 },
            followRedirect: () => {
              throw new Error('Discovery redirect refused.');
            },
          } as unknown as Parameters<Connection['request']>[1]);
        });
      } catch {
        envelope.diagnostics.errors.push({
          code: 'API_VERSION_DISCOVERY_FAILED',
          message:
            'Version discovery failed or returned invalid data. Check org access or use --api-version 65.0.',
          retryable: false,
        });
        return finish('blocked');
      }
      envelope.metadata.soapApiVersion = selection.soapNumeric;
      try {
        if (hasDmos) validateDmoSelection(dmoSelectors, selection, flags['data-space']);
      } catch {
        envelope.diagnostics.errors.push({
          code: 'INVALID_SCOPE',
          message:
            'DMO support requires numeric SOAP evidence 65.0. Use --api-version 65.0; newer API versions are not qualified.',
          retryable: false,
        });
        return finish('blocked');
      }
      // Pin only this command-owned connection, before any service uses it.
      const connection = org.getConnection(selection.soapNumeric);
      const names = hasDmos
        ? await this.selectDocuments(connection, dmoSelectors, selection, flags['data-space'])
        : [];
      // eslint-disable-next-line unicorn/no-array-sort -- Deterministic ordering on a new deduplicated array.
      const segments = [...new Set(segmentSelectors.map((value) => value.slice(8)))].sort();
      envelope.result.selection = [
        ...names.map((name) => `dmo:${name}`),
        ...segments.map((name) => `segment:${name}`),
      ];
      if (
        segments.length > 0 ||
        ciSelectors.length > 0 ||
        flags['include-dependencies'] ||
        irSelectors.length > 0 ||
        graphSelectors.length > 0 ||
        ingestionSelectors.length > 0 ||
        flags['api-version'] === 'auto'
      ) {
        // Acquire and resolve the complete bounded selection before publishing any files.
        const selected =
          names.length > 0 || segments.length > 0
            ? await (this.selectDependencies ?? selectRetrieveDependencies)(
                [
                  ...names.map((apiName) => ({
                    kind: 'dmo' as const,
                    dataSpace: flags['data-space'],
                    apiName,
                  })),
                  ...segments.map((apiName) => ({
                    kind: 'segment' as const,
                    dataSpace: flags['data-space'],
                    apiName,
                  })),
                ],
                connection,
                selection,
                flags['include-dependencies'] ?? false,
              )
            : {
                entries: [] as RetrieveDependencyEntry[],
                reasons: new Map<string, SelectionReason>(),
              };
        const calculatedInsights: Array<{
          document: CalculatedInsightDocument;
          definitionXml: string;
        }> = [];
        // Complete every CI admission before any selected output and before IR repins the receiver.
        const ciVersion = Object.freeze({
          requested: '65.0',
          restSelector: 'v65.0',
          soapNumeric: '65.0',
        });
        // eslint-disable-next-line unicorn/no-array-sort -- Deterministic exact CI order.
        for (const apiName of [...new Set(ciSelectors.map((value) => value.slice(19)))].sort()) {
          const ciConnection = org.getConnection('65.0');
          const acquired = await this.acquireCalculatedInsight(
            ciConnection,
            apiName,
            ciVersion,
            flags['data-space'],
          );
          if (!acquired.candidate || acquired.blockers.length > 0)
            throw new CalculatedInsightError(acquired.blockers[0] ?? 'CI_ACQUISITION_FAILED');
          if (
            acquired.identity.apiName !== apiName ||
            acquired.identity.dataSpace !== 'default' ||
            acquired.candidate.identity.apiName !== apiName
          )
            throw new CalculatedInsightError('CI_IDENTITY_CHANGED');
          await this.bindCalculatedInsight(
            acquired.candidate,
            ciConnection,
            ciVersion,
            flags['data-space'],
          );
          const target = flags['target-org'] ?? ciConnection.getUsername();
          if (!target) throw new CalculatedInsightError('TARGET_ORG_REQUIRED');
          const definitionXml = await this.acquireCalculatedInsightXml(target, apiName);
          const document = validateCalculatedInsightPair(
            acquired.candidate,
            definitionXml,
            apiName.slice(0, -5),
          );
          calculatedInsights.push({ document, definitionXml });
        }
        const ingestionDlos: Array<{ document: IngestionDloDocument }> = [];
        if (ingestionSelectors.length > 0) {
          const version = await resolveApiVersion('67.0', async () => {
            throw new Error('Fixed route');
          });
          const receiver = Object.create(connection) as Connection;
          Object.defineProperty(receiver, 'version', { value: '67.0' });
          Object.defineProperty(receiver, 'getApiVersion', { value: () => '67.0' });
          Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });

          for (const apiName of [
            ...new Set(ingestionSelectors.map((value) => value.slice(14))),
            // eslint-disable-next-line unicorn/no-array-sort -- Sort detached exact selectors within the ES2022 library target.
          ].sort()) {
            const acquired = await this.acquireIngestionDlo(
              receiver,
              apiName,
              version,
              flags['data-space'],
            );
            if (!acquired.candidate || acquired.blockers.length > 0)
              throw new IngestionDloError(
                acquired.blockers[0] ?? 'INGESTION_DLO_ACQUISITION_FAILED',
              );
            const document = validateIngestionDloDocument(acquired.candidate);
            if (
              acquired.identity.apiName !== apiName ||
              acquired.identity.dataSpace !== 'default' ||
              document.identity.apiName !== apiName
            )
              throw new IngestionDloError('INGESTION_DLO_IDENTITY_CHANGED');
            ingestionDlos.push({ document });
          }
        }
        const discoveredOwners = new Set<string>();
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
              flags['data-space'],
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
                  flags['data-space'],
                );
              } catch {
                throw new DataGraphError('DATA_GRAPH_OWNER_DISCOVERY_FAILED');
              }
              if (!binding?.root) throw new DataGraphError('DATA_GRAPH_OWNER_DISCOVERY_FAILED');
              acquired = await this.acquireDataGraph(
                graphConnection,
                apiName,
                graphVersion,
                flags['data-space'],
                { dependencyBinding: binding },
              );
              const ownerName = binding.root.identity.owner.apiName;
              if (
                irSelectors.length > 0 &&
                !irSelectors.includes(`identity-resolution:${ownerName}`)
              )
                throw new DataGraphError('DATA_GRAPH_SELECTED_OWNER_MISMATCH');
              if (flags['include-dependencies']) discoveredOwners.add(ownerName);
              if (acquired.candidate) {
                const document = acquired.candidate;
                sourceGraphGuards.push(async () => {
                  const fresh = await this.bindDataGraph(
                    document,
                    graphConnection,
                    graphVersion,
                    flags['data-space'],
                  );
                  if (!isDeepStrictEqual(fresh, binding))
                    throw new DataGraphError('DATA_GRAPH_SOURCE_BINDING_CHANGED');
                  const current = await this.acquireDataGraph(
                    graphConnection,
                    apiName,
                    graphVersion,
                    flags['data-space'],
                    { dependencyBinding: fresh },
                  );
                  if (!isDeepStrictEqual(current, acquired))
                    throw new DataGraphError('DATA_GRAPH_SOURCE_CONFIGURATION_CHANGED');
                });
              }
            }
            if (!acquired.candidate || acquired.blockers.length > 0)
              throw new DataGraphError(acquired.blockers[0] ?? 'DATA_GRAPH_ACQUISITION_FAILED');
            const document = validateDataGraphDocument(acquired.candidate);
            if (
              flags['include-dependencies'] &&
              typeof document.spec.primaryObjectName === 'string'
            )
              throw new DataGraphError('DATA_GRAPH_DEPENDENCY_EXPANSION_UNSUPPORTED');
            if (
              acquired.identity.apiName !== apiName ||
              acquired.identity.dataSpace !== 'default' ||
              document.identity.apiName !== apiName
            )
              throw new DataGraphError('DATA_GRAPH_IDENTITY_CHANGED');
            await this.bindDataGraph(document, graphConnection, graphVersion, flags['data-space']);
            dataGraphs.push({ document });
          }
        }
        const identityResolutions: Array<{ document: IdentityResolutionDocument }> = [];
        if (irSelectors.length > 0 || discoveredOwners.size > 0) {
          const irVersion = await resolveApiVersion('67.0', async () => {
            throw new Error('Fixed route must not discover.');
          });
          const irConnection = org.getConnection('67.0');

          for (const apiName of [
            ...new Set([...irSelectors.map((value) => value.slice(20)), ...discoveredOwners]),
            // eslint-disable-next-line unicorn/no-array-sort -- Sort a detached selector list within the ES2022 library target.
          ].sort()) {
            const acquired = await this.acquireIdentityResolution(
              irConnection,
              apiName,
              irVersion,
              flags['data-space'],
            );
            if (acquired.blockers.length > 0 || !acquired.candidate)
              throw new IdentityResolutionError(
                acquired.blockers[0] ?? 'INCOMPLETE_IDENTITY_RESOLUTION',
              );
            const document = validateIdentityResolutionDocument(acquired.candidate);
            if (
              acquired.identity.apiName !== apiName ||
              acquired.identity.dataSpace !== flags['data-space'] ||
              document.identity.apiName !== apiName ||
              document.identity.dataSpace !== flags['data-space']
            )
              throw new IdentityResolutionError('IDENTITY_RESOLUTION_IDENTITY_MISMATCH');
            identityResolutions.push({ document });
            if (graphSelectors.length > 0)
              sourceGraphGuards.push(async () => {
                const fresh = await this.acquireIdentityResolution(
                  irConnection,
                  apiName,
                  irVersion,
                  flags['data-space'],
                );
                if (!isDeepStrictEqual(fresh, acquired))
                  throw new IdentityResolutionError('IDENTITY_RESOLUTION_SOURCE_CHANGED');
              });
          }
        }
        if (flags['include-dependencies']) {
          for (const { document } of dataGraphs) {
            const identity = { kind: 'data-graph' as const, ...document.identity };
            selected.reasons.set(`data-graph:default:${identity.apiName}`, {
              explicit: true,
              chains: [[identity]],
            });
            const root = document.spec.primaryObjectName;
            if (typeof root === 'string') continue;
            const key = `identity-resolution:default:${root.owner.apiName}`;
            const prior = selected.reasons.get(key);
            const chain = [identity, root.owner];
            if (prior) prior.chains.push(chain);
            else
              selected.reasons.set(key, {
                explicit: irSelectors.includes(`identity-resolution:${root.owner.apiName}`),
                chains: [chain],
              });
          }
        }
        if (flags['include-dependencies'])
          envelope.result.dependencies = [...selected.reasons].map(([key, reason]) => {
            const [kind, dataSpace, apiName] = key.split(':');
            return {
              identity: { kind: kind as DependencyIdentity['kind'], dataSpace, apiName },
              reason,
            };
          });
        for (const verify of sourceGraphGuards) await verify();
        const entries = [
          ...selected.entries,
          ...calculatedInsights,
          ...identityResolutions,
          ...dataGraphs,
          ...ingestionDlos,
        ];
        envelope.result.selection = entries.map(
          ({ document }) => `${document.kind}:${document.identity.apiName}`,
        );
        for (const entry of entries) {
          const { document } = entry;
          try {
            const receipt =
              document.kind === 'ingestion-dlo'
                ? await this.writeIngestionDlo(
                    document,
                    flags['output-dir'] ?? process.cwd(),
                    flags.overwrite,
                  )
                : document.kind === 'data-graph'
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
                      : 'definitionXml' in entry
                        ? await this.writeSegment(
                            document,
                            entry.definitionXml,
                            flags['output-dir'] ?? process.cwd(),
                            flags.overwrite,
                          )
                        : await this.writeDocument(
                            document,
                            flags['output-dir'] ?? process.cwd(),
                            flags.overwrite,
                          );
            envelope.result.items.push({
              identity: { ...document.identity },
              ...(document.kind === 'segment' ||
              document.kind === 'identity-resolution' ||
              document.kind === 'calculated-insight' ||
              document.kind === 'data-graph' ||
              document.kind === 'ingestion-dlo'
                ? { family: document.kind }
                : {}),
              ...(flags['api-version'] === 'auto' ||
              document.kind === 'identity-resolution' ||
              document.kind === 'calculated-insight' ||
              document.kind === 'data-graph' ||
              document.kind === 'ingestion-dlo'
                ? {
                    routes:
                      document.kind === 'ingestion-dlo'
                        ? [
                            {
                              operation: 'ingestion-dlo.source-binding.read',
                              apiVersion: '67.0',
                              transport: 'facade' as const,
                            },
                          ]
                        : document.kind === 'data-graph'
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
                                  operation: 'd360_ir_get',
                                  apiVersion: '67.0',
                                  transport: 'facade' as const,
                                },
                                {
                                  operation: 'identity-resolutions.get',
                                  apiVersion: '65.0',
                                  transport: 'native' as const,
                                },
                              ]
                            : [
                                {
                                  operation: `${document.kind}.get`,
                                  apiVersion: '65.0',
                                  transport: 'native' as const,
                                },
                                {
                                  operation: `${document.kind}.metadata`,
                                  apiVersion: '65.0',
                                  transport: 'metadata' as const,
                                },
                              ],
                  }
                : {}),
              operation: 'retrieve',
              ...receipt,
            });
          } catch (error: unknown) {
            diagnose(error, document.identity.apiName);
            // Do not publish dependents after an ambiguous prerequisite output failure.
            break;
          }
        }
        return finish(
          envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
        );
      }
      for (const apiName of names) {
        try {
          const projection = await this.acquire(
            connection,
            apiName,
            selection,
            flags['data-space'],
          );
          if (
            projection.status !== 'projected' ||
            projection.blockers.length > 0 ||
            !projection.candidate
          )
            throw new DmoRetrieveError(projection.blockers[0] ?? 'INCOMPLETE_DMO_PROJECTION');
          if (
            projection.candidate.identity.apiName !== apiName ||
            projection.candidate.identity.dataSpace !== flags['data-space']
          )
            throw new DmoRetrieveError('INVALID_METADATA');
          const receipt = await this.writeDocument(
            projection.candidate,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: { ...projection.candidate.identity },
            operation: 'retrieve',
            ...(flags['api-version'] === 'auto'
              ? {
                  routes: [
                    { operation: 'dmo.get', apiVersion: '65.0', transport: 'native' as const },
                    {
                      operation: 'dmo.metadata',
                      apiVersion: '65.0',
                      transport: 'metadata' as const,
                    },
                  ],
                }
              : {}),
            ...receipt,
          });
        } catch (error: unknown) {
          diagnose(error, apiName);
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
