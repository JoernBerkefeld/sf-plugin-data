import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../plugin.js';
import {
  DeployInputError,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import { publishCalculatedInsight } from '../../services/publish-calculated-insight.js';
import type { CalculatedInsightPublishResult } from '../../services/publish-calculated-insight.js';
import { calculatedInsightReadContext } from '../../services/native-calculated-insight.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';

export type PublishEnvelope = {
  contract: 'sf-data360-publish';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'publish'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: { command: 'sf data360 publish'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    items: Array<
      CalculatedInsightPublishResult & {
        identity: { apiName: string; dataSpace: string };
        operation: 'preview' | 'publish';
        routes: Array<{ operation: string; apiVersion: string; transport: 'native' | 'metadata' }>;
      }
    >;
  };
};

/** Publish one native Calculated Insight (JSON plus SQL file) without deploying or scheduling it. */
export default class Publish extends SfCommand<PublishEnvelope> {
  public static readonly aliases = ['datacloud:publish', 'd360:publish', 'dc:publish'];
  public static readonly summary = 'Publish one Data360 Calculated Insight draft.';
  public static readonly description =
    'Requires one exact --source-dir data360/calculatedInsights/Name__cio.calculatedInsight-meta.json or its .calculatedInsight-meta.sql file (the JSON is joined with its SQL; a missing SQL file or another Name__cio.calculatedInsight-meta.* file beside them is refused with INVALID_SOURCE), --api-version auto (68.0) or 68.0 and default space (--dataspace; --data-space is a compatibility alias). The insight must exist (create it with sf data360 deploy, --draft for a draft). An ACTIVE insight that holds every key of the file is unchanged; otherwise one API 68 PATCH sends the file (translated like deploy) with draft: false, and the insight is read until it is ACTIVE with the file. Salesforce decides; a 4xx answer is reported as rejected. --preview is read-only. An unknown outcome is not retried or rolled back.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    'source-dir': Flags.string({
      char: 'd',
      summary: 'One exact CI JSON file or its SQL file.',
    }),
    'api-version': Flags.string({ summary: 'Native lifecycle route: auto (68.0) or 68.0.' }),
    dataspace: Flags.string({ aliases: ['data-space'], summary: 'Default space only.' }),
    preview: Flags.boolean({ default: false, summary: 'Read and report only; never publish.' }),
  };
  protected resolveInputs = readDeployInputs;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected publishCalculatedInsight = publishCalculatedInsight;
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

  /**
   * Validate exact intent before auth and delegate one guarded publication.
   * @returns {Promise<PublishEnvelope>} Payload-free publication receipt.
   */
  public async run(): Promise<PublishEnvelope> {
    const { flags } = await this.parse(Publish);
    const envelope: PublishEnvelope = {
      contract: 'sf-data360-publish',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: {
        operation: 'publish',
        preview: flags.preview,
        apiVersion: flags['api-version'] ?? 'auto',
        plugin,
      },
      provenance: { command: 'sf data360 publish', generatedAt: new Date().toISOString() },
      diagnostics: { warnings: [], errors: [] },
      result: { items: [] },
    };
    let code = 'INVALID_SELECTION';
    try {
      const source = flags['source-dir'];
      if (
        typeof source !== 'string' ||
        !source ||
        !/\.calculatedInsight-meta\.(?:json|sql)$/u.test(source)
      )
        throw new Error('Selection');
      code = 'INVALID_SCOPE';
      if (
        !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
        (flags.dataspace ?? 'default') !== 'default'
      )
        throw new Error('Scope');
      const snapshot = JSON.stringify(flags);
      code = 'INVALID_SOURCE';
      const inputs = await this.resolveInputs({ cwd: process.cwd(), sourceDir: [source] });
      if (inputs.length !== 1 || inputs[0].document.kind !== 'calculated-insight')
        throw new Error('Selection');
      const input = inputs[0] as CalculatedInsightDeployInput;
      const desired = input.native;
      const verifyInput = async (): Promise<void> => {
        if (JSON.stringify(flags) !== snapshot) throw new Error('Intent drift');
        await this.verifyCalculatedInsightInput(input);
      };
      await verifyInput();
      code = 'TARGET_ORG_REQUIRED';
      const connection = await this.resolveConnection(flags['target-org']);
      code = 'CI_ADMISSION_FAILED';
      const context = this.calculatedInsightContext(connection, 'default');
      await verifyInput();
      const result = await this.publishCalculatedInsight(
        desired,
        connection,
        {
          requested: '68.0',
          restSelector: 'v68.0',
          soapNumeric: '68.0',
        },
        'default',
        {
          context,
          preview: flags.preview,
          verifyInput,
        },
      );
      envelope.result.items.push({
        ...result,
        identity: { apiName: desired.apiName, dataSpace: desired.dataSpace },
        operation: flags.preview ? 'preview' : 'publish',
        routes: [
          { operation: 'calculated-insight.publish', apiVersion: '68.0', transport: 'native' },
          { operation: 'calculated-insight.get', apiVersion: '68.0', transport: 'native' },
        ],
      });
      envelope.status =
        result.outcome === 'failed'
          ? 'failed'
          : result.outcome === 'blocked'
            ? 'blocked'
            : 'success';
      envelope.diagnostics.errors.push(
        ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
      );
    } catch (error) {
      envelope.diagnostics.errors.push({
        code: error instanceof DeployInputError ? error.code : code,
        message:
          'Publication stopped. Verify the exact JSON and SQL source, API 68 and default data space, and target access. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
        retryable: false,
      });
    }
    if (envelope.status !== 'success') process.exitCode = 1;
    annotateDiagnostics(envelope);
    if (!this.jsonEnabled()) {
      this.log(`Publish${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
      for (const item of envelope.result.items)
        this.log(`${item.outcome}: ${item.identity.apiName}; mutation: ${item.mutation}.`);
      for (const diagnostic of envelope.diagnostics.errors) this.log(formatDiagnostic(diagnostic));
    }
    return envelope;
  }
}
