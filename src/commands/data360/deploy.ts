import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { DeployInputError, readDeployInputs } from '../../artifacts/read-deploy-input.js';
import { preflightDmoDeploy } from '../../services/preflight-dmo-deploy.js';
import type { DmoDeployPreview } from '../../services/preflight-dmo-deploy.js';
import { executeDmoDeploy } from '../../services/execute-dmo-deploy.js';
import type { DmoDeployExecution } from '../../services/execute-dmo-deploy.js';
import { plugin as packageMetadata } from '../../plugin.js';

type ExecutionItem = Omit<DmoDeployExecution, 'outcome'> & {
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
  };
  result: {
    scope: { dataSpace: string };
    selection: { sourceDir: string[]; metadata: string[] };
    items: Array<
      | (DmoDeployPreview & {
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
    'Requires explicit files/directories OR exact dmo:ApiName selectors. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Preview is strictly read-only. Execution preflights the whole selection, then creates or updates only object and existing non-primary field labels sequentially with fresh checks and qualified readback. Other changes block before writes. Stops on first blocked or failed item; no retry or rollback. No local report/artifact writes.';
  public static readonly flags = {
    'target-org': Flags.optionalOrg(),
    'api-version': Flags.orgApiVersion({
      default: '65.0',
      summary: 'Target API version (currently 65.0).',
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
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary: 'Exact dmo:ApiName project member; repeatable.',
    }),
    preview: Flags.boolean({
      default: false,
      summary: 'Strictly read-only target comparison; never executes deployment.',
    }),
  };

  protected resolveInputs = readDeployInputs;
  protected preflight = preflightDmoDeploy;
  protected execute = executeDmoDeploy;

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
      const inputs = await this.resolveInputs({
        cwd,
        sourceDir: flags['source-dir'],
        metadata: flags.metadata,
      });
      if (inputs.length === 0) return finish('blocked', 'INVALID_SELECTION');
      const org = flags['target-org'];
      if (!org) return finish('blocked', 'TARGET_ORG_REQUIRED');
      envelope.provenance.targetOrgId = org.getOrgId();
      const connection = org.getConnection(flags['api-version']);
      let failed = false;
      let blocked = false;
      for (const input of inputs) {
        try {
          const preview = await this.preflight(
            input.document,
            connection,
            flags['api-version'],
            flags['data-space'],
            true,
          );
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
            diagnostics: [],
          };
        });
        // Keep whole-selection evidence, but never mistake admission for attempted execution.
        envelope.result.items = items;
        if (!failed && !blocked) {
          for (const [index, input] of inputs.entries()) {
            const item = items[index];
            // Set conservative evidence before awaiting; an unexpected throw cannot erase it.
            item.outcome = 'failed';
            item.mutation = 'unknown';
            try {
              const result = await this.execute(
                input.document,
                connection,
                flags['api-version'],
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
      if (error instanceof DeployInputError) return finish('blocked', error.code);
      return finish('failed', flags.preview ? 'DEPLOY_PREVIEW_FAILED' : 'DEPLOY_EXECUTION_FAILED');
    }
  }
}
