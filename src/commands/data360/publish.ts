import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../plugin.js';
import {
  DeployInputError,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../../artifacts/read-deploy-input.js';
import type { CalculatedInsightDeployInput } from '../../artifacts/read-deploy-input.js';
import { validateCalculatedInsightDocument } from '../../artifacts/calculated-insight-document.js';
import { publishCalculatedInsight } from '../../services/publish-calculated-insight.js';
import type { CalculatedInsightPublishResult } from '../../services/publish-calculated-insight.js';
import { calculatedInsightReadContext } from '../../services/retrieve-calculated-insight.js';
import type { CalculatedInsightObservation } from '../../services/execute-calculated-insight-deploy.js';

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

/** Publish one exactly paired native Calculated Insight without deploying or scheduling it. */
export default class Publish extends SfCommand<PublishEnvelope> {
  public static readonly aliases = ['datacloud:publish', 'd360:publish', 'dc:publish'];
  public static readonly summary = 'Publish one paired Data360 Calculated Insight draft.';
  public static readonly description =
    'Requires one exact --source-dir XML or JSON member of a matching Calculated Insight pair, explicit --api-version 68.0 and default space (--dataspace; --data-space is a compatibility alias). Only NOT_SCHEDULED, never-run matching DRAFT configuration is publishable. --preview is read-only; an equal ACTIVE target is unchanged without acknowledgement or writes. DRAFT publication requires --allow-processing and uses a separate NotScheduled publication PATCH, never an SQL edit, create or schedule engine. Native publication/read routes use API68; independent Metadata and dependency reads remain API65. Completion requires bounded independent ACTIVE settlement; an unknown mutation is not retried or rolled back. No compute, ingestion or populated-object guarantee.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    'source-dir': Flags.string({ char: 'd', summary: 'One exact paired CI XML or JSON member.' }),
    'api-version': Flags.string({ summary: 'Required explicit native lifecycle pin: 68.0.' }),
    dataspace: Flags.string({ aliases: ['data-space'], summary: 'Default space only.' }),
    preview: Flags.boolean({ default: false, summary: 'Read and report only; never publish.' }),
    'allow-processing': Flags.boolean({
      default: false,
      summary: 'Acknowledge publication processing.',
    }),
  };
  protected resolveInputs = readDeployInputs;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected publishCalculatedInsight = publishCalculatedInsight;
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

  /**
   * Validate exact paired intent before auth and delegate one guarded publication.
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
        !/\.(?:calculatedInsight\.json|mktCalcInsightObjectDef-meta\.xml)$/u.test(source)
      )
        throw new Error('Selection');
      code = 'INVALID_SCOPE';
      if (flags['api-version'] !== '68.0' || (flags.dataspace ?? 'default') !== 'default')
        throw new Error('Scope');
      const snapshot = JSON.stringify(flags);
      code = 'INVALID_SOURCE';
      const inputs = await this.resolveInputs({ cwd: process.cwd(), sourceDir: [source] });
      if (inputs.length !== 1 || inputs[0].document.kind !== 'calculated-insight')
        throw new Error('Selection');
      const input = inputs[0] as CalculatedInsightDeployInput;
      const desired = validateCalculatedInsightDocument(input.document);
      if (desired.spec.publishScheduleInterval !== 'NOT_SCHEDULED') throw new Error('Schedule');
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
      // Keep raw attribution private and detached, following the existing deploy recorder contract.
      this.calculatedInsightObservations = [];
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
          allowProcessing: flags['allow-processing'] === true,
          verifyInput,
          recordObservation: async (observation) => {
            this.calculatedInsightObservations.push(structuredClone(observation));
          },
        },
      );
      envelope.result.items.push({
        ...result,
        identity: desired.identity,
        operation: flags.preview ? 'preview' : 'publish',
        routes: [
          { operation: 'calculated-insight.publish', apiVersion: '68.0', transport: 'native' },
          { operation: 'calculated-insight.get', apiVersion: '68.0', transport: 'native' },
          { operation: 'calculated-insight.metadata', apiVersion: '65.0', transport: 'metadata' },
          { operation: 'dependency.get', apiVersion: '65.0', transport: 'native' },
          { operation: 'dependency.metadata', apiVersion: '65.0', transport: 'metadata' },
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
          'Publication stopped. Verify the exact paired source, explicit API68/default scope and target access. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
        retryable: false,
      });
    }
    if (envelope.status !== 'success') process.exitCode = 1;
    if (!this.jsonEnabled()) {
      this.log(`Publish${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
      for (const item of envelope.result.items)
        this.log(`${item.outcome}: ${item.identity.apiName}; mutation: ${item.mutation}.`);
      for (const diagnostic of envelope.diagnostics.errors)
        if (/HTTP (?:429|503)/u.test(diagnostic.message))
          this.log(`${diagnostic.code}: ${diagnostic.message}`);
    }
    return envelope;
  }
}
