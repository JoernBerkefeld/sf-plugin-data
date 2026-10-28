import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import { resolveApiVersion } from '../../transport/api-version.js';
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
  family?: SegmentDeployExecution['family'];
  route?: SegmentDeployExecution['route'];
  requiredEffects?: SegmentDeployPreview['requiredEffects'];
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
        identity: { kind: 'dmo' | 'segment'; dataSpace: string; apiName: string };
        reason: SelectionReason;
      }>;
    };
    items: Array<
      | ((DmoDeployPreview | SegmentDeployPreview) & {
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
    'Requires explicit files/directories OR exact dmo:ApiName selectors OR --changed-since Git selection. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Preview is strictly read-only. Execution preflights the whole selection, then creates or updates qualified DMO labels or existing Segment labels/descriptions sequentially with fresh checks and qualified readback. Segment updates require --allow-processing; Segment creation remains blocked. Other changes block before writes. Stops on first blocked or failed item; no retry or rollback. No local report/artifact writes.';
  public static readonly flags = {
    'target-org': Flags.custom<Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'> | undefined>(
      {
        char: 'o',
        noCacheDefault: true,
        summary: 'Authenticated org alias or username; defaults to the configured target org.',
        parse: async (input) => resolveTargetOrg(input),
        default: async () => resolveTargetOrg(),
        defaultHelp: async () => {
          const org = await resolveTargetOrg();
          return org?.getUsername();
        },
      },
    )(),
    'api-version': Flags.orgApiVersion({
      default: '65.0',
      summary: 'Numeric API version or experimental read-only latest (SOAP evidence must be 65.0).',
      parse: async (value, context, options) =>
        value === 'latest' ? value : Flags.orgApiVersion().parse(value, context, options),
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
      summary: 'Exact dmo:ApiName or existing segment:ApiName project member.',
      exclusive: ['changed-since'],
    }),
    'changed-since': Flags.string({
      summary:
        'Select canonical DMO and paired Segment Git changes since the merge base with a commit reference.',
      exclusive: ['source-dir', 'metadata'],
    }),
    'include-dependencies': Flags.boolean({
      default: false,
      summary:
        'Include supported local dependency artifacts; missing local inputs require compatible existing target prerequisites.',
    }),
    'allow-processing': Flags.boolean({
      default: false,
      summary: 'Acknowledge automatic processing for qualified existing Segment updates.',
    }),
    preview: Flags.boolean({
      default: false,
      summary: 'Strictly read-only target comparison; never executes deployment.',
    }),
  };

  protected resolveInputs = readDeployInputs;
  protected selectGitInputs = selectGitDeployInputs;
  protected preflight = preflightDmoDeploy;
  protected preflightSegment = preflightSegmentDeploy;
  protected verifySegmentInput = verifySegmentInputDigest;
  protected captureInput = captureDeployInputDigest;
  protected execute = executeDmoDeploy;
  protected executeSegment = executeSegmentDeploy;

  /**
   * Validate all inputs and preflight the whole selection before any sequential execution.
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
      let gitSegments: GitDeploySelection['segments'];
      if (changedSince !== undefined) {
        envelope.result.selection.changedSince = changedSince;
        const selected = await this.selectGitInputs({ cwd, ref: changedSince });
        envelope.provenance.git = selected.provenance;
        if (selected.paths.length === 0) return finish('success');
        sourceDirectories = selected.paths;
        gitSegments = selected.segments;
      }
      let inputs = await this.resolveInputs({
        cwd,
        sourceDir: sourceDirectories,
        metadata: flags.metadata,
      });
      if (gitSegments) {
        const current = inputs.filter(
          (input): input is SegmentDeployInput => 'inputDigest' in input,
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
        ? await selectDeployDependencies(inputs, cwd)
        : undefined;
      if (expanded) {
        inputs = expanded.inputs;
        envelope.result.selection.dependencies = inputs.map(({ document }) => {
          const identity = { kind: document.kind, ...document.identity };
          return { identity, reason: expanded.reasons.get(dependencyKey(identity))! };
        });
      }
      const hasSegments = inputs.some((input) => input.document.kind === 'segment');
      if (hasSegments) {
        const nodes = inputs.map((input) =>
          input.document.kind === 'segment'
            ? documentDependencyNode(input.document)
            : { identity: { kind: 'dmo' as const, ...input.document.identity }, dependencies: [] },
        );
        const byKey = new Map(
          inputs.map((input) => [
            dependencyKey({
              kind: input.document.kind === 'segment' ? 'segment' : 'dmo',
              ...input.document.identity,
            }),
            input,
          ]),
        );
        inputs = orderDependencyNodes(nodes).map((key) => byKey.get(key)!);
      }
      // Preserve original Segment pair snapshots and bind mixed-batch DMO bytes before target reads.
      const captured = hasSegments
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
        for (const { input, digest } of captured) {
          if (input.document.kind === 'segment')
            await this.verifySegmentInput(input as SegmentDeployInput);
          else if ((await this.captureInput(input)) !== digest)
            throw new DependencySelectionError('DEPENDENCY_INPUT_CHANGED');
        }
      };
      await verifyInputs();
      const org = flags['target-org'];
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
      let selection;
      try {
        selection = await resolveApiVersion(flags['api-version'], async () => {
          // Parse-time auth owns this numerically initialized connection; services have not used it.
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
      let failed = false;
      let blocked = false;
      for (const input of inputs) {
        try {
          const segment = input.document.kind === 'segment';
          if (segment) await this.verifySegmentInput(input as SegmentDeployInput);
          const preview = segment
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
                input.document.kind === 'segment'
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
      if (error instanceof DeployInputError || error instanceof DependencySelectionError)
        return finish('blocked', error.code);
      return finish('failed', flags.preview ? 'DEPLOY_PREVIEW_FAILED' : 'DEPLOY_EXECUTION_FAILED');
    }
  }
}
