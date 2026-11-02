import { preflightMapping, executeMapping } from '../../services/command-native-mapping.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import { NativeMappingError } from '../../artifacts/native-mapping-document.js';
import { preflightDmo, executeDmo } from '../../services/command-native-dmo.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { isNativeDmoInput } from '../../artifacts/read-deploy-input.js';
import { NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { preflightDloDeploy, executeDloDeploy } from '../../services/command-dlo.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { normalizeDlo, unwrapDlo, validateDloDocument } from '../../artifacts/dlo-document.js';
import { normalizeNativeDmo, unwrapNativeDmo } from '../../artifacts/native-dmo-document.js';
import { isDeepStrictEqual } from 'node:util';
import { verifyDloInputDigest } from '../../artifacts/read-deploy-input.js';
import type { DloDeployInput } from '../../artifacts/read-deploy-input.js';
import { preflightDataGraphDeploy } from '../../services/preflight-data-graph-deploy.js';
import type { DataGraphDeployPreview } from '../../services/preflight-data-graph-deploy.js';
import { executeDataGraphDeploy } from '../../services/execute-data-graph-deploy.js';
import type {
  DataGraphDeployExecution,
  DataGraphObservation,
} from '../../services/execute-data-graph-deploy.js';
import { graphCanonicalObject, retrieveDataGraph } from '../../services/retrieve-data-graph.js';
import { bindDataGraphDependencies } from '../../services/bind-data-graph-dependencies.js';
import { validateDataGraphDocument } from '../../artifacts/data-graph-document.js';
import { verifyDataGraphInputDigest } from '../../artifacts/read-deploy-input.js';
import type { DataGraphDeployInput } from '../../artifacts/read-deploy-input.js';
import { preflightCalculatedInsightDeploy } from '../../services/preflight-calculated-insight-deploy.js';
import type { CalculatedInsightPreview } from '../../services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../../services/execute-calculated-insight-deploy.js';
import type {
  CalculatedInsightExecution,
  CalculatedInsightObservation,
} from '../../services/execute-calculated-insight-deploy.js';
import { bindCalculatedInsightDependencies } from '../../services/bind-calculated-insight-dependencies.js';
import { validateCalculatedInsightDocument } from '../../artifacts/calculated-insight-document.js';
import { verifyCalculatedInsightInputDigest } from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import {
  nativeApiVersion,
  operationApiVersion,
  resolveApiVersion,
} from '../../transport/api-version.js';
import { preflightIdentityResolutionDeploy } from '../../services/preflight-identity-resolution-deploy.js';
import type { IdentityResolutionDeployPreview } from '../../services/preflight-identity-resolution-deploy.js';
import { executeIdentityResolutionDeploy } from '../../services/execute-identity-resolution-deploy.js';
import type {
  IdentityResolutionDeployExecution,
  IdentityResolutionPollEvidence,
} from '../../services/execute-identity-resolution-deploy.js';
import { createHash } from 'node:crypto';
import { retrieveIdentityResolution } from '../../services/retrieve-identity-resolution.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from '../../services/bind-identity-resolution-dependencies.js';
import { validateIdentityResolutionDocument } from '../../artifacts/identity-resolution-document.js';
import type {
  DeployInput,
  IdentityResolutionDeployInput,
} from '../../artifacts/read-deploy-input.js';
import { verifyIdentityResolutionInputDigest } from '../../artifacts/read-deploy-input.js';
import type { ApiVersionSelection } from '../../transport/api-version.js';
import { dmoApiSelection, DmoRetrieveError } from '../../services/retrieve-other-dmo.js';
import {
  captureDeployInputDigest,
  DeployInputError,
  readDeployInputs,
} from '../../artifacts/read-deploy-input.js';
import { executeSegmentDeploy } from '../../services/execute-segment-deploy.js';
import type { SegmentDeployExecution } from '../../services/execute-segment-deploy.js';
import { preflightDmoDeploy } from '../../services/preflight-dmo-deploy.js';
import { preflightSegmentDeploy } from '../../services/preflight-segment-deploy.js';
import type { SegmentDeployPreview } from '../../services/preflight-segment-deploy.js';
import type { DmoDocument } from '../../artifacts/dmo-document.js';
import { verifySegmentInputDigest } from '../../artifacts/read-deploy-input.js';
import type { SegmentDeployInput } from '../../artifacts/read-deploy-input.js';
import type { DmoDeployPreview } from '../../services/preflight-dmo-deploy.js';
import { executeDmoDeploy } from '../../services/execute-dmo-deploy.js';
import type { DmoDeployExecution } from '../../services/execute-dmo-deploy.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { GitSelectionError, selectGitDeployInputs } from '../../artifacts/git-deploy-selection.js';
import type { GitDeploySelection } from '../../artifacts/git-deploy-selection.js';
import { selectDeployDependencies } from '../../services/select-deploy-dependencies.js';
import {
  dependencyKey,
  DependencySelectionError,
  documentDependencyNode,
  orderDependencyNodes,
} from '../../artifacts/dependency-selection.js';
import type { SelectionReason } from '../../artifacts/dependency-selection.js';

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

type ExecutionItem = Omit<DmoDeployExecution, 'outcome'> & {
  family?:
    | SegmentDeployExecution['family']
    | IdentityResolutionDeployExecution['family']
    | CalculatedInsightExecution['family']
    | DataGraphDeployExecution['family']
    | 'dlo'
    | 'dmo'
    | 'mapping';
  route?:
    | SegmentDeployExecution['route']
    | IdentityResolutionDeployExecution['route']
    | CalculatedInsightExecution['route']
    | DataGraphDeployExecution['route'];
  requiredEffects?:
    SegmentDeployPreview['requiredEffects'] | IdentityResolutionDeployPreview['requiredEffects'];
  routes?: Array<{
    operation: string;
    apiVersion: string;
    transport: 'facade' | 'native' | 'metadata';
  }>;
  outcome: DmoDeployExecution['outcome'] | 'not-attempted';
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
    errors: Array<{ code: string; message: string; retryable: false }>;
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
      dependencies?: Array<{
        identity: {
          kind:
            'dmo' | 'segment' | 'identity-resolution' | 'calculated-insight' | 'data-graph' | 'dlo';
          dataSpace: string;
          apiName: string;
        };
        reason: SelectionReason;
      }>;
    };
    items: Array<
      | ((
          | DmoDeployPreview
          | SegmentDeployPreview
          | IdentityResolutionDeployPreview
          | CalculatedInsightPreview
          | DataGraphDeployPreview
          | Awaited<ReturnType<typeof preflightDmo>>
          | Awaited<ReturnType<typeof preflightMapping>>
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
    'Requires explicit files/directories OR exact family:ApiName selectors OR --changed-since Git selection. Canonical native DLO/DMO/mapping JSON defaults to API68 (auto); numeric pins >=61 are retained without upgrade. Native mixed selections execute DLO then DMO then mapping, independently settling parents before mapping dependency checks. Mapping uses exact mapping:ApiName from data360/mapping/ApiName.mapping-meta.json, unique target binding lookup and server-generated target names; create, one-pair additive update and unchanged repeats are supported, not removal or retargeting. Preview never writes and reports planned dependencies without claiming nonexistent parents are ready. Native Git and dependency expansion remain blocked. Native DMO target-name lookup selects confirmed-404 POST or existing-name PATCH with independent GET confirmation. Native DLOs use dlo:Name__dll from data360/dlo/Name__dll.dlo-meta.json. Target lookup selects PATCH by target ID, or POST only on confirmed HTTP404; auth/permission/lookup failures stop. Preview is read-only; native DLO deploy does not require --allow-processing. Inventory and dependency expansion are unavailable. Graph supports exact data-graph:ApiName, auto or numeric67/default, only existing ready root-only NONE LastName append or unchanged; updates require --allow-processing. Graph create, inventory, nesting, reverse/settings changes and dependency expansion are blocked. Calculated insights support only API65/default existing ACTIVE qualified forward same-aggregation expression updates or unchanged repeats, with --allow-processing for updates. CI creation, shell conversion and dependency expansion are blocked. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Preview is strictly read-only. Legacy execution preflights the whole legacy selection; native DLO/DMO/mapping execution admits each ordered item only after earlier parents settle. Qualified legacy DMO labels or existing Segment labels/descriptions execute sequentially with fresh checks and qualified readback. Segment updates and existing-owner IR reconciliation updates require --allow-processing; IR also acknowledges publication and generated-output provisioning. Exact IR requires auto or numeric67, while mixed IR/legacy selections require auto. Segment and IR creation remain blocked. IR dependency expansion is not supported. Other changes block before writes. Stops on first blocked or failed item; no retry or rollback. No local report/artifact writes.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; resolved only after local admission.',
    }),
    'api-version': Flags.orgApiVersion({
      default: 'auto',
      summary:
        'Native DLO/DMO/mapping default or auto68, numeric >=61 retained; legacy routes keep their qualified versions.',
      parse: async (value, context, options) =>
        value === 'latest' || value === 'auto'
          ? value
          : Flags.orgApiVersion().parse(value, context, options),
    }),
    'data-space': Flags.string({
      default: 'default',
      summary: 'Target logical data space (currently default).',
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
        'Exact mapping:ApiName, dlo:Name__dll, dmo:ApiName, segment:ApiName, calculated-insight:ApiName__cio, data-graph:ApiName or identity-resolution:ExactObjectApiName member.',
      exclusive: ['changed-since'],
    }),
    'changed-since': Flags.string({
      summary:
        'Select canonical DMO, paired Segment/CI, Graph and IR Git changes since the merge base with a commit reference.',
      exclusive: ['source-dir', 'metadata'],
    }),
    'include-dependencies': Flags.boolean({
      default: false,
      summary:
        'Include supported local dependency artifacts; missing local inputs require compatible existing target prerequisites.',
    }),
    'allow-processing': Flags.boolean({
      default: false,
      summary:
        'Acknowledge qualified Segment/CI/Graph processing and IR publication/generated-output effects.',
    }),
    preview: Flags.boolean({
      default: false,
      summary: 'Strictly read-only target comparison; never executes deployment.',
    }),
  };

  protected createMappingClient = createMappingClient;
  protected preflightMapping = preflightMapping;
  protected executeMapping = executeMapping;
  protected resolveTargetOrg = resolveTargetOrg;
  protected createDmoClient = createDmoClient;
  protected preflightNativeDmo = preflightDmo;
  protected executeNativeDmo = executeDmo;
  protected preflightDlo = preflightDloDeploy;
  protected executeDlo = executeDloDeploy;
  protected verifyDloInput = verifyDloInputDigest;
  protected createDloClient = createDloClient;

  protected graphConfigurations?: Map<string, string>;
  protected preflightDataGraph = preflightDataGraphDeploy;
  protected executeDataGraph = executeDataGraphDeploy;
  protected verifyDataGraphInput = verifyDataGraphInputDigest;
  protected dataGraphObservations?: Map<string, DataGraphObservation[]>;

  /**
   * Retain detached private observations before classification, never in output files.
   * @param {string} key Exact input path.
   * @param {DataGraphObservation} observation Raw private observation.
   * @returns {Promise<void>} Resolves after capture.
   */
  protected async recordDataGraphObservation(
    key: string,
    observation: DataGraphObservation,
  ): Promise<void> {
    this.dataGraphObservations ??= new Map();
    const entries = this.dataGraphObservations.get(key) ?? [];
    entries.push(structuredClone(observation));
    this.dataGraphObservations.set(key, entries);
  }

  /**
   * Bind independent root dependencies and full current owner configuration before batch writes.
   * @param {DataGraphDeployInput} input Captured local content.
   * @param {Connection} connection Operation-local API67 receiver.
   * @param {ApiVersionSelection} selection Fixed family route.
   * @returns {Promise<string>} Private fingerprint.
   */
  protected async bindDataGraph(
    input: DataGraphDeployInput,
    connection: Connection,
    selection: ApiVersionSelection,
  ): Promise<string> {
    const dependencies = await bindDataGraphDependencies(
      input.document,
      connection,
      selection,
      'default',
    );
    const acquired = await retrieveDataGraph(
      connection,
      input.document.identity.apiName,
      selection,
      'default',
      { dependencyBinding: dependencies },
    );
    if (!acquired.candidate || !acquired.expectations || acquired.blockers.length > 0)
      throw new Error('Graph binding unavailable');
    const configuration = JSON.stringify(
      graphCanonicalObject({
        graph: acquired.expectations,
        preservationFingerprint: dependencies.preservationFingerprint,
      }),
    );
    const prior = this.graphConfigurations?.get(input.path);
    if (prior !== undefined && prior !== configuration)
      throw new Error('Graph configuration drift');
    this.graphConfigurations?.set(input.path, configuration);
    return createHash('sha256')
      .update(
        JSON.stringify(graphCanonicalObject({ dependencies, expectations: acquired.expectations })),
      )
      .digest('hex');
  }

  protected preflightCalculatedInsight = preflightCalculatedInsightDeploy;
  protected executeCalculatedInsight = executeCalculatedInsightDeploy;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected bindCalculatedInsight = bindCalculatedInsightDependencies;
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
  protected preflight = preflightDmoDeploy;
  protected preflightSegment = preflightSegmentDeploy;
  protected verifySegmentInput = verifySegmentInputDigest;
  protected captureInput = captureDeployInputDigest;
  protected execute = executeDmoDeploy;
  protected executeSegment = executeSegmentDeploy;
  protected preflightIdentityResolution = preflightIdentityResolutionDeploy;
  protected executeIdentityResolution = executeIdentityResolutionDeploy;
  protected verifyIdentityResolutionInput = verifyIdentityResolutionInputDigest;
  /**
   * Bind complete existing owner dependencies and generated outputs before any batch mutation.
   * @param {IdentityResolutionDeployInput} input Immutable authored IR input.
   * @param {Connection} connection Fixed API67 operation receiver.
   * @param {ApiVersionSelection} selection Fixed per-operation selection.
   * @returns {Promise<string>} Private stable target fingerprint.
   */
  protected async bindIdentityResolution(
    input: IdentityResolutionDeployInput,
    connection: Connection,
    selection: ApiVersionSelection,
  ): Promise<string> {
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
      throw new Error('IR target binding unavailable');
    const outputs = await verifyIdentityResolutionOutputs(
      {
        targetApiName: input.document.identity.apiName,
        targetId: acquired.expectations.facade.id as string,
        dataSpace: 'default',
      },
      acquired.expectations.outputs.map(({ identity, sourceApiName }) => ({
        identity,
        targetApiName: sourceApiName,
      })),
      connection,
      selection,
    );
    return createHash('sha256').update(JSON.stringify({ dependencies, outputs })).digest('hex');
  }
  protected identityResolutionPolls?: Map<string, IdentityResolutionPollEvidence[]>;

  /**
   * Preserve bounded private status observations before executor classification, never in results.
   * @param {string} key Exact local selected input path.
   * @param {IdentityResolutionPollEvidence} evidence Private status-only observation.
   * @returns {Promise<void>} Resolves after detached preservation.
   */
  protected async recordIdentityResolutionPoll(
    key: string,
    evidence: IdentityResolutionPollEvidence,
  ): Promise<void> {
    this.identityResolutionPolls ??= new Map();
    const observations = this.identityResolutionPolls.get(key) ?? [];
    observations.push(structuredClone(evidence));
    this.identityResolutionPolls.set(key, observations);
  }

  /**
   * Validate inputs, then admit native items in dependency order or preflight the legacy selection
   * before sequential execution.
   * @returns {Promise<DeployEnvelope>} Versioned preview or execution outcomes with mutation evidence.
   */
  public async run(): Promise<DeployEnvelope> {
    const { flags } = await this.parse(Deploy);
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
        scope: { dataSpace: flags['data-space'] },
        selection: { sourceDir: flags['source-dir'] ?? [], metadata: flags.metadata ?? [] },
        items: [],
      },
    };
    const finish = (status: DeployEnvelope['status'], code?: string): DeployEnvelope => {
      envelope.status = status;
      if (code)
        envelope.diagnostics.errors.push({
          code,
          message: flags.preview
            ? 'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.'
            : 'Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.',
          retryable: false,
        });
      if (status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(
          flags.preview
            ? `Deploy preview: ${status}${code ? ` (${code})` : ''}. No deployment executed.`
            : `Deploy execution: ${status}${code ? ` (${code})` : ''}. No automatic retry or rollback performed.`,
        );
        for (const item of envelope.result.items) {
          this.log(
            item.operation === 'preview'
              ? `Preview: ${item.outcome}.`
              : `Execution: ${item.outcome}; mutation: ${item.mutation}.`,
          );
          if (item.operation === 'execute' && item.mutation === 'unknown')
            this.log('Mutation may have occurred. Inspect target before any further attempt.');
        }
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
      let gitDataGraphs: GitDeploySelection['dataGraphs'];
      let gitCalculatedInsights: GitDeploySelection['calculatedInsights'];
      let gitSegments: GitDeploySelection['segments'];
      let gitIdentityResolutions: GitDeploySelection['identityResolutions'];
      if (changedSince !== undefined) {
        envelope.result.selection.changedSince = changedSince;
        const selected = await this.selectGitInputs({ cwd, ref: changedSince });
        envelope.provenance.git = selected.provenance;
        if (selected.paths.length === 0) return finish('success');
        sourceDirectories = selected.paths;
        gitDlos = selected.dlos;
        gitDataGraphs = selected.dataGraphs;
        gitCalculatedInsights = selected.calculatedInsights;
        gitSegments = selected.segments;
        gitIdentityResolutions = selected.identityResolutions;
      }
      const resolvedInputs = await this.resolveInputs({
        cwd,
        sourceDir: sourceDirectories,
        metadata: flags.metadata,
      });
      if (resolvedInputs.length === 0 && changedSince === undefined)
        return finish('blocked', 'INVALID_SELECTION');
      const nativeInputs = resolvedInputs.filter(
        (input) =>
          isNativeDmoInput(input) ||
          input.document.kind === 'mapping' ||
          input.document.kind === 'dlo',
      );
      if (
        nativeInputs.some(
          (input) => isNativeDmoInput(input) || input.document.kind === 'mapping',
        ) ||
        (nativeInputs.length === resolvedInputs.length && changedSince === undefined)
      ) {
        if (nativeInputs.length !== resolvedInputs.length || changedSince !== undefined)
          return finish('blocked', 'NATIVE_MIXED_SELECTION_UNSUPPORTED');
        let version: string;
        try {
          version = nativeApiVersion(flags['api-version']);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (flags['data-space'] !== 'default') return finish('blocked', 'INVALID_SCOPE');
        if (flags['include-dependencies'])
          return finish('blocked', 'DMO_DEPENDENCY_EXPANSION_UNSUPPORTED');
        const rank = (input: DeployInput): number =>
          input.document.kind === 'dlo' ? 0 : input.document.kind === 'dmo' ? 1 : 2;
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
        const source = (this.createDloClient ?? createDloClient)(target, version);
        const dmo = (this.createDmoClient ?? createDmoClient)(target, version);
        const mapping = (): ReturnType<typeof createMappingClient> =>
          (this.createMappingClient ?? createMappingClient)(target, version);
        const hasMappings = nativeInputs.some((input) => input.document.kind === 'mapping');
        const plannedParents = new Set<string>();
        for (const input of nativeInputs) {
          await verify();
          const kind = input.document.kind;
          const identity = input.document.identity;
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
                ? await (this.preflightMapping ?? preflightMapping)(input.document, mapping(), {
                    source,
                    target: dmo,
                  })
                : kind === 'dlo'
                  ? await (this.preflightDlo ?? preflightDloDeploy)(input.document, source)
                  : await (this.preflightNativeDmo ?? preflightDmo)(input.document, dmo);
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
            kind === 'mapping'
              ? await (this.executeMapping ?? executeMapping)(input.document, mapping(), {
                  source,
                  target: dmo,
                })
              : kind === 'dlo'
                ? await (this.executeDlo ?? executeDloDeploy)(input.document, source)
                : await (this.executeNativeDmo ?? executeDmo)(input.document, dmo);
          envelope.result.items.push({
            ...result,
            family: kind as 'mapping' | 'dlo' | 'dmo',
            identity,
            operation: 'execute',
            path: input.path,
          });
          if (result.outcome === 'blocked' || result.outcome === 'failed')
            return finish(result.outcome);
          if (hasMappings && kind !== 'mapping') {
            // Independently verify definitions; only DLO reads expose an ACTIVE settlement status.
            let settled = false;
            try {
              for (let attempt = 0; attempt < 3; attempt++) {
                const raw =
                  kind === 'dlo'
                    ? unwrapDlo(await source.get(identity.apiName))
                    : unwrapNativeDmo(await dmo.get(identity.apiName));
                const actual = kind === 'dlo' ? normalizeDlo(raw) : normalizeNativeDmo(raw);
                if (actual.identity.apiName !== identity.apiName) break;
                const desired = input.document
                  .spec as import('../../artifacts/dlo-document.js').DloDocument['spec'];
                const fields = new Map(actual.spec.fields.map((field) => [field.name, field]));
                if (
                  (kind !== 'dlo' || raw.status === 'ACTIVE') &&
                  actual.spec.label === desired.label &&
                  actual.spec.category === desired.category &&
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
      const admitted = resolvedInputs.filter(
        (
          input,
        ): input is Exclude<
          DeployInput,
          | import('../../artifacts/read-deploy-input.js').NativeDmoDeployInput
          | import('../../artifacts/read-deploy-input.js').MappingDeployInput
        > => !isNativeDmoInput(input) && input.document.kind !== 'mapping',
      );
      const hasDlos = admitted.some((input) => input.document.kind === 'dlo');
      if (hasDlos) {
        try {
          for (const input of admitted)
            operationApiVersion(flags['api-version'], input.document.kind);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (flags['data-space'] !== 'default') return finish('blocked', 'INVALID_SCOPE');
        if (flags['include-dependencies'])
          return finish('blocked', 'DLO_DEPENDENCY_EXPANSION_UNSUPPORTED');
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
      const hasDataGraphs = admitted.some((input) => input.document.kind === 'data-graph');
      if (hasDataGraphs) {
        try {
          for (const input of admitted)
            operationApiVersion(flags['api-version'], input.document.kind);
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (flags['data-space'] !== 'default') return finish('blocked', 'INVALID_SCOPE');
        for (const input of admitted)
          if (input.document.kind === 'data-graph') {
            const document = validateDataGraphDocument(input.document);
            if (
              flags['include-dependencies'] &&
              typeof document.spec.primaryObjectName === 'string'
            )
              return finish('blocked', 'DATA_GRAPH_DEPENDENCY_EXPANSION_UNSUPPORTED');
          }
      }
      if (gitDataGraphs) {
        const current = admitted.filter(
          (input): input is DataGraphDeployInput => input.document.kind === 'data-graph',
        );
        if (
          current.length !== gitDataGraphs.length ||
          gitDataGraphs.some(
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
        for (const captured of gitDataGraphs) await this.verifyDataGraphInput(captured);
      }
      const hasCalculatedInsights = admitted.some(
        (input) => input.document.kind === 'calculated-insight',
      );
      if (hasCalculatedInsights) {
        try {
          operationApiVersion(flags['api-version'], 'calculated-insight');
        } catch {
          return finish('blocked', 'INVALID_SCOPE');
        }
        if (flags['data-space'] !== 'default') return finish('blocked', 'INVALID_SCOPE');
        if (flags['include-dependencies'])
          return finish('blocked', 'CI_DEPENDENCY_EXPANSION_UNSUPPORTED');
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
                  : input.document.kind === 'data-graph'
                    ? 'data-graph'
                    : input.document.kind === 'dlo'
                      ? 'dlo'
                      : 'dmo';
          try {
            operationApiVersion(flags['api-version'], family);
          } catch {
            return finish('blocked', 'INVALID_SCOPE');
          }
          if (family === 'identity-resolution') validateIdentityResolutionDocument(input.document);
        }
        if (flags['data-space'] !== 'default') return finish('blocked', 'INVALID_SCOPE');
        if (flags['include-dependencies'] && !hasDataGraphs)
          return finish('blocked', 'IDENTITY_RESOLUTION_DEPENDENCY_EXPANSION_UNSUPPORTED');
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
                  input.path === captured.path &&
                  input.companionPath === captured.companionPath &&
                  input.inputDigest === captured.inputDigest,
              ),
          )
        )
          throw new GitSelectionError('INVALID_GIT_SELECTION');
        for (const captured of gitSegments) await this.verifySegmentInput(captured);
      }
      if (inputs.length === 0) return finish('blocked', 'INVALID_SELECTION');
      const expanded = flags['include-dependencies']
        ? await selectDeployDependencies(
            inputs.filter(
              (
                input,
              ): input is Exclude<typeof input, CalculatedInsightDeployInput | DloDeployInput> =>
                input.document.kind !== 'calculated-insight' && input.document.kind !== 'dlo',
            ),
            cwd,
          )
        : undefined;
      if (expanded) {
        inputs = expanded.inputs;
        envelope.result.selection.dependencies = inputs.map(({ document }) => {
          const identity = { kind: document.kind, ...document.identity };
          return { identity, reason: expanded.reasons.get(dependencyKey(identity))! };
        });
      }
      const hasSegments = inputs.some((input) => input.document.kind === 'segment');
      if (
        hasSegments ||
        hasIdentityResolutions ||
        hasCalculatedInsights ||
        hasDataGraphs ||
        hasDlos
      ) {
        const nodes = inputs.map((input) =>
          input.document.kind === 'segment' ||
          input.document.kind === 'identity-resolution' ||
          input.document.kind === 'calculated-insight' ||
          input.document.kind === 'data-graph' ||
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
                      : input.document.kind === 'data-graph'
                        ? 'data-graph'
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
      for (const input of inputs) {
        if (input.document.kind !== 'data-graph') continue;
        const root = input.document.spec.primaryObjectName;
        if (typeof root === 'string') continue;
        const owners = inputs.filter(
          (candidate) => candidate.document.kind === 'identity-resolution',
        );
        if (
          owners.length > 0 &&
          !owners.some((owner) => owner.document.identity.apiName === root.owner.apiName)
        )
          throw new DependencySelectionError('DATA_GRAPH_SELECTED_OWNER_MISMATCH');
      }
      // Preserve original Segment pair snapshots and bind mixed-batch DMO bytes before target reads.
      const captured =
        hasSegments || hasIdentityResolutions || hasCalculatedInsights || hasDataGraphs || hasDlos
          ? await Promise.all(
              inputs.map(async (input) => ({
                input,
                digest:
                  input.document.kind === 'segment' ? undefined : await this.captureInput(input),
              })),
            )
          : [];
      const verifyInputs = async (): Promise<void> => {
        await expanded?.verify();
        for (const input of gitDlos ?? []) await this.verifyDloInput(input);
        for (const input of gitDataGraphs ?? []) await this.verifyDataGraphInput(input);
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
        input.document.kind === 'dlo'
          ? Object.freeze({ requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' })
          : input.document.kind === 'identity-resolution' || input.document.kind === 'data-graph'
            ? Object.freeze({ requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' })
            : selection;
      const routes = (input: DeployInput): ExecutionItem['routes'] =>
        input.document.kind === 'dlo'
          ? [
              {
                operation: 'dlo.deploy',
                apiVersion: '68.0',
                transport: 'native',
              },
            ]
          : input.document.kind === 'data-graph'
            ? [
                { operation: 'd360_data_graph_get', apiVersion: '67.0', transport: 'facade' },
                { operation: 'd360_transform_get', apiVersion: '67.0', transport: 'facade' },
                { operation: 'dependency.metadata', apiVersion: '65.0', transport: 'metadata' },
                { operation: 'd360_data_graph_update', apiVersion: '67.0', transport: 'facade' },
              ]
            : input.document.kind === 'identity-resolution'
              ? [
                  { operation: 'd360_ir_get', apiVersion: '67.0', transport: 'facade' },
                  {
                    operation: 'identity-resolutions.get',
                    apiVersion: '65.0',
                    transport: 'native',
                  },
                  {
                    operation: 'dependency-and-output.metadata',
                    apiVersion: '65.0',
                    transport: 'metadata',
                  },
                  { operation: 'd360_ir_update', apiVersion: '67.0', transport: 'facade' },
                ]
              : flags['api-version'] === 'auto'
                ? [
                    {
                      operation: `${input.document.kind ?? 'dmo'}.deploy`,
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
      if (flags['api-version'] === 'latest' && !flags.preview) {
        envelope.diagnostics.errors.push({
          code: 'LATEST_READ_ONLY',
          message:
            'latest is experimental and read-only. Use --preview, or explicitly select --api-version 65.0 for guarded deployment.',
          retryable: false,
        });
        return finish('blocked');
      }
      let selection: ApiVersionSelection;
      try {
        selection = await resolveApiVersion(
          flags['api-version'] === 'auto' ? '65.0' : flags['api-version'],
          async () => {
            // Parse-time auth owns this numerically initialized connection; services have not used it.
            const receiver = Object.create(org.getConnection()) as Connection;
            Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
            return receiver.request({ method: 'GET', url: '/services/data' }, {
              retry: { maxRetries: 0 },
              followRedirect: () => {
                throw new Error('Discovery redirect refused.');
              },
            } as unknown as Parameters<Connection['request']>[1]);
          },
        );
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
        if (
          inputs.some(
            (input) =>
              input.document.kind !== 'identity-resolution' &&
              input.document.kind !== 'data-graph' &&
              input.document.kind !== 'dlo',
          )
        )
          dmoApiSelection(selection);
      } catch (error: unknown) {
        if (!(error instanceof DmoRetrieveError)) throw error;
        envelope.diagnostics.errors.push({
          code: 'INVALID_SCOPE',
          message:
            'DMO support requires numeric SOAP evidence 65.0. Use --api-version 65.0; newer API versions are not qualified.',
          retryable: false,
        });
        return finish('blocked');
      }
      const connection = org.getConnection(selection.soapNumeric);
      // Core Org may reuse and mutate one receiver; pin a distinct operation-local view instead.
      const connectionFor = (input: DeployInput): Connection => {
        if (
          input.document.kind !== 'identity-resolution' &&
          input.document.kind !== 'data-graph' &&
          input.document.kind !== 'dlo'
        )
          return connection;
        const receiver = Object.create(connection) as Connection;
        Object.defineProperty(receiver, 'version', { value: '67.0' });
        Object.defineProperty(receiver, 'getApiVersion', { value: () => '67.0' });
        Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
        return receiver;
      };
      const dloClient = (): ReturnType<typeof createDloClient> => {
        const username = org.getUsername();
        if (!username) throw new Error('TARGET_ORG_REQUIRED');
        return this.createDloClient(username, '68.0');
      };
      this.graphConfigurations = new Map();
      const graphBindings = new Map<string, string>();
      const verifyGraphBinding = async (input: DeployInput): Promise<void> => {
        if (input.document.kind !== 'data-graph') return;
        const fingerprint = await this.bindDataGraph(
          input as DataGraphDeployInput,
          connectionFor(input),
          familySelection(input),
        );
        const prior = graphBindings.get(input.path);
        if (prior !== undefined && prior !== fingerprint) throw new Error('Graph binding drift');
        graphBindings.set(input.path, fingerprint);
      };
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
      const ciBindings = new Map<string, string>();
      const verifyCiBinding = async (input: DeployInput): Promise<void> => {
        if (input.document.kind !== 'calculated-insight') return;
        const bound = await this.bindCalculatedInsight(
          input.document,
          connection,
          selection,
          flags['data-space'],
        );
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
              : input.document.kind === 'data-graph'
                ? await this.preflightDataGraph(
                    input.document,
                    connectionFor(input),
                    familySelection(input),
                    flags['data-space'],
                  )
                : input.document.kind === 'calculated-insight'
                  ? await this.preflightCalculatedInsight(
                      input.document,
                      connection,
                      selection,
                      flags['data-space'],
                    )
                  : input.document.kind === 'identity-resolution'
                    ? await this.preflightIdentityResolution(
                        input.document,
                        connectionFor(input),
                        familySelection(input),
                        flags['data-space'],
                      )
                    : segment
                      ? await this.preflightSegment(
                          input.document,
                          connection,
                          selection,
                          flags['data-space'],
                        )
                      : await this.preflight(
                          input.document,
                          connection,
                          selection,
                          flags['data-space'],
                          true,
                        );
          if (input.document.kind === 'dlo') await this.verifyDloInput(input as DloDeployInput);
          if (input.document.kind === 'data-graph') {
            await this.verifyDataGraphInput(input as DataGraphDeployInput);
            if (preview.outcome === 'update' || preview.outcome === 'unchanged')
              await verifyGraphBinding(input);
            if (
              !flags.preview &&
              preview.outcome === 'update' &&
              (flags['allow-processing'] !== true ||
                !(preview as DataGraphDeployPreview).requiredEffects.includes('processing'))
            ) {
              blocked = true;
              preview.diagnostics.push({
                code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                message:
                  'Graph processing requires explicit --allow-processing. No batch writes were attempted.',
              });
            }
          }
          if (input.document.kind === 'identity-resolution') {
            await this.verifyIdentityResolutionInput(input as IdentityResolutionDeployInput);
            if (preview.outcome === 'update' || preview.outcome === 'unchanged')
              await verifyIrBinding(input);
            const effects = (preview as IdentityResolutionDeployPreview).requiredEffects;
            if (
              !flags.preview &&
              preview.outcome === 'update' &&
              (flags['allow-processing'] !== true ||
                !effects?.includes('publication') ||
                !effects.includes('generated-output-provisioning'))
            ) {
              blocked = true;
              preview.diagnostics.push({
                code: 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                message:
                  'IR publication and generated effects require explicit --allow-processing. No batch writes were attempted.',
              });
            }
          }
          if (input.document.kind === 'calculated-insight') {
            await this.verifyCalculatedInsightInput(input as CalculatedInsightDeployInput);
            if (preview.outcome === 'update' || preview.outcome === 'unchanged')
              await verifyCiBinding(input);
            if (
              !flags.preview &&
              preview.outcome === 'update' &&
              (flags['allow-processing'] !== true ||
                !(preview as CalculatedInsightPreview).requiredEffects.includes('processing'))
            ) {
              blocked = true;
              preview.diagnostics.push({
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
              (preview.outcome === 'create' ||
                (preview.outcome === 'update' &&
                  (flags['allow-processing'] !== true || !effects?.includes('processing'))))
            ) {
              blocked = true;
              preview.diagnostics.push({
                code:
                  preview.outcome === 'create'
                    ? 'SEGMENT_CREATE_AND_TARGET_UNQUALIFIED'
                    : 'PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
                message:
                  'Segment creation is unavailable; qualified updates require explicit --allow-processing. No batch writes were attempted.',
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
        } catch {
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
                code: 'PREFLIGHT_FAILED',
                message: 'Target preview failed; no deployment was executed.',
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
          ] as DmoDeployPreview;
          return {
            identity: { ...input.document.identity },
            operation: 'execute',
            path: input.path,
            outcome: 'not-attempted',
            mutation: 'not-attempted',
            preflight: { outcome, target, absenceProof, diagnostics },
            ...(routes(input) ? { routes: routes(input) } : {}),
            ...(input.document.kind === 'dlo' ? { family: 'dlo' as const } : {}),
            ...(input.document.kind === 'data-graph'
              ? {
                  family: 'data-graph' as const,
                  route: {
                    apiVersion: '67.0' as const,
                    operation: 'd360_data_graph_update' as const,
                  },
                  requiredEffects: (envelope.result.items[index] as DataGraphDeployPreview)
                    .requiredEffects,
                }
              : {}),
            ...(input.document.kind === 'identity-resolution'
              ? {
                  family: 'identity-resolution' as const,
                  route: { apiVersion: '67.0' as const, operation: 'd360_ir_update' as const },
                  requiredEffects: (envelope.result.items[index] as IdentityResolutionDeployPreview)
                    .requiredEffects,
                }
              : {}),
            ...(input.document.kind === 'calculated-insight'
              ? {
                  family: 'calculated-insight' as const,
                  route: {
                    apiVersion: '65.0' as const,
                    method: 'PATCH' as const,
                    resource: 'calculated-insights' as const,
                  },
                  requiredEffects: (envelope.result.items[index] as CalculatedInsightPreview)
                    .requiredEffects,
                }
              : {}),
            ...(input.document.kind === 'segment'
              ? {
                  family: 'segment' as const,
                  route: {
                    apiVersion: '65.0' as const,
                    method: 'PATCH' as const,
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
                if (pending.document.kind === 'data-graph') {
                  await verifyGraphBinding(pending);
                  const fresh = await this.preflightDataGraph(
                    pending.document,
                    connectionFor(pending),
                    familySelection(pending),
                    flags['data-space'],
                  );
                  if (
                    !['unchanged', 'update'].includes(fresh.outcome) ||
                    (fresh.outcome === 'update' &&
                      (flags['allow-processing'] !== true ||
                        !fresh.requiredEffects.includes('processing')))
                  )
                    throw new DependencySelectionError('DATA_GRAPH_FRESH_ADMISSION_BLOCKED');
                  continue;
                }
                if (pending.document.kind === 'identity-resolution') {
                  await verifyIrBinding(pending);
                  const fresh = await this.preflightIdentityResolution(
                    pending.document,
                    connectionFor(pending),
                    familySelection(pending),
                    flags['data-space'],
                  );
                  if (
                    !['unchanged', 'update'].includes(fresh.outcome) ||
                    (fresh.outcome === 'update' &&
                      (flags['allow-processing'] !== true ||
                        !fresh.requiredEffects.includes('publication') ||
                        !fresh.requiredEffects.includes('generated-output-provisioning')))
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
                    connection,
                    selection,
                    flags['data-space'],
                  );
                  if (
                    !['unchanged', 'update'].includes(fresh.outcome) ||
                    (fresh.outcome === 'update' &&
                      (flags['allow-processing'] !== true ||
                        !fresh.requiredEffects.includes('processing')))
                  )
                    throw new DependencySelectionError('CI_FRESH_ADMISSION_BLOCKED');
                  continue;
                }
                if (pending.document.kind !== 'segment') continue;
                const fresh = await this.preflightSegment(
                  pending.document,
                  connection,
                  selection,
                  flags['data-space'],
                );
                if (
                  !['unchanged', 'update'].includes(fresh.outcome) ||
                  (fresh.outcome === 'update' &&
                    (flags['allow-processing'] !== true ||
                      !fresh.requiredEffects.includes('processing')))
                )
                  throw new DependencySelectionError('SEGMENT_FRESH_ADMISSION_BLOCKED');
              }
              await verifyInputs();
            } catch {
              item.outcome = 'blocked';
              item.diagnostics = [
                {
                  code: 'DEPLOY_FRESH_ADMISSION_BLOCKED',
                  message:
                    'Fresh input or dependency admission failed before this item. No further writes were attempted.',
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
                  : input.document.kind === 'data-graph'
                    ? await this.executeDataGraph(
                        input.document,
                        connectionFor(input),
                        familySelection(input),
                        flags['data-space'],
                        {
                          allowProcessing: flags['allow-processing'] === true,
                          verifyInput: verifyInputs,
                          recordObservation: async (observation) =>
                            this.recordDataGraphObservation(input.path, observation),
                        },
                      )
                    : input.document.kind === 'calculated-insight'
                      ? await this.executeCalculatedInsight(
                          input.document,
                          connection,
                          selection,
                          flags['data-space'],
                          {
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
                            flags['data-space'],
                            {
                              allowProcessing: flags['allow-processing'] === true,
                              verifyInput: verifyInputs,
                              recordPoll: async (evidence) =>
                                this.recordIdentityResolutionPoll(input.path, evidence),
                            },
                          )
                        : input.document.kind === 'segment'
                          ? await this.executeSegment(
                              input.document,
                              connection,
                              selection,
                              flags['data-space'],
                              {
                                allowProcessing: flags['allow-processing'] === true,
                                verifyInput: verifyInputs,
                              },
                            )
                          : await this.execute(
                              input.document as DmoDocument,
                              connection,
                              selection,
                              flags['data-space'],
                            );
              Object.assign(item, result);
            } catch {
              item.diagnostics = [
                {
                  code: 'EXECUTION_UNCONFIRMED',
                  message:
                    'Mutation may have occurred. Inspect target before any further attempt; no retry or rollback was performed.',
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
            if (
              input.document.kind === 'identity-resolution' &&
              item.outcome === 'updated' &&
              item.mutation === 'confirmed-updated'
            ) {
              // Only a verified selected-owner settlement authorizes a new dependency baseline.
              // Protected binding still rejects any change to the full pending Graph/transform.
              try {
                await verifyInputs();
                for (const pending of inputs.slice(index + 1)) {
                  if (pending.document.kind !== 'data-graph') continue;
                  const root = pending.document.spec.primaryObjectName;
                  if (
                    typeof root === 'string' ||
                    root.owner.apiName !== input.document.identity.apiName
                  )
                    continue;
                  const fingerprint = await this.bindDataGraph(
                    pending as DataGraphDeployInput,
                    connectionFor(pending),
                    familySelection(pending),
                  );
                  graphBindings.set(pending.path, fingerprint);
                }
                await verifyInputs();
              } catch {
                blocked = true;
                break;
              }
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
              ? 'Git selection blocks DMO or Segment member renames/deletions and a relevant untracked addition combined with any tracked worktree deletion. Stage intended changes to permit Git-inferred rename detection, then resolve unsupported lifecycle changes. Git cannot guarantee historical rename intent.'
              : 'Git selection failed. Use a valid commit reference and canonical DMO files or complete Segment XML/JSON pairs under the configured package directory with matching identities and unchanged admitted bytes.',
          retryable: false,
        });
        return finish('blocked');
      }
      if (error instanceof NativeDmoError || error instanceof NativeMappingError)
        return finish('blocked', error.code);
      if (error instanceof DeployInputError || error instanceof DependencySelectionError)
        return finish('blocked', error.code);
      return finish('failed', flags.preview ? 'DEPLOY_PREVIEW_FAILED' : 'DEPLOY_EXECUTION_FAILED');
    }
  }
}
