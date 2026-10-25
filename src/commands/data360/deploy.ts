import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { DeployInputError, readDeployInputs } from '../../artifacts/read-deploy-input.js';
import { preflightDmoDeploy } from '../../services/preflight-dmo-deploy.js';
import type { DmoDeployPreview } from '../../services/preflight-dmo-deploy.js';

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
      DmoDeployPreview & {
        identity: { dataSpace: string; apiName: string };
        operation: 'preview';
        path: string;
      }
    >;
  };
};

/** Read-only target preview of explicitly selected authored Data360 configuration. */
export default class Deploy extends SfCommand<DeployEnvelope> {
  public static readonly summary = 'Preview explicit authored Data360 deployment without writes.';
  public static readonly description =
    'Requires --preview and explicit files/directories OR exact dmo:ApiName selectors. Repeated selections coalesce. Bare types and implicit deploy-all are forbidden. Create is advisory only; actual deployment is not implemented. No org mutations or local report/artifact writes.';
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
      summary: 'Read-only target comparison; required until execution is implemented.',
    }),
  };

  protected resolveInputs = readDeployInputs;
  protected preflight = preflightDmoDeploy;

  /**
   * Resolve every local input before inspecting the target, then preview each item without writes.
   * @returns {Promise<DeployEnvelope>} Versioned advisory outcomes, never mutation receipts.
   */
  public async run(): Promise<DeployEnvelope> {
    const { flags } = await this.parse(Deploy);
    const cwd = process.cwd();
    const plugin = {
      name: '@joernberkefeld/sf-plugin-data360',
      version: this.config.pjson.version,
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
          message:
            'Preview did not complete. Check explicit authored inputs, target authentication and supported scope. Actual deployment is not implemented.',
          retryable: false,
        });
      if (status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Deploy preview: ${status}${code ? ` (${code})` : ''}. No deployment executed.`);
        for (const item of envelope.result.items) this.log(`Preview: ${item.outcome}.`);
      }
      return envelope;
    };
    if (!flags.preview) return finish('blocked', 'DEPLOY_EXECUTION_NOT_IMPLEMENTED');
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
      return finish(
        failed ? 'failed' : blocked ? 'blocked' : 'success',
        failed ? 'PREFLIGHT_FAILED' : blocked ? 'DEPLOY_PREVIEW_BLOCKED' : undefined,
      );
    } catch (error: unknown) {
      if (error instanceof DeployInputError) return finish('blocked', error.code);
      return finish('failed', 'DEPLOY_PREVIEW_FAILED');
    }
  }
}
