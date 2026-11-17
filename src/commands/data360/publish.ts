import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../plugin.js';
import {
  DeployInputError,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
  verifySegmentInputDigest,
} from '../../artifacts/read-deploy-input.js';
import type {
  CalculatedInsightDeployInput,
  SegmentDeployInput,
} from '../../artifacts/read-deploy-input.js';
import { segmentName } from '../../artifacts/segment-document.js';
import type { SegmentDocument } from '../../artifacts/segment-document.js';
import { publishSegment, segmentPublishWait } from '../../services/publish-segment.js';
import type { SegmentPublishResult } from '../../services/publish-segment.js';
import { publishCalculatedInsight } from '../../services/publish-calculated-insight.js';
import type { CalculatedInsightPublishResult } from '../../services/publish-calculated-insight.js';
import { calculatedInsightReadContext } from '../../services/native-calculated-insight.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';

export type PublishEnvelope = {
  contract: 'sf-data360-publish';
  contractVersion: '1.0.0';
  status: 'success' | 'processing' | 'blocked' | 'failed';
  metadata: { operation: 'publish'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: { command: 'sf data360 publish'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    items: Array<
      (CalculatedInsightPublishResult | SegmentPublishResult) & {
        identity: { apiName: string; dataSpace: string };
        operation: 'preview' | 'publish';
        routes: Array<{ operation: string; apiVersion: string; transport: 'native' | 'metadata' }>;
      }
    >;
  };
};

/**
 * Publish one native Calculated Insight draft (JSON plus SQL file) without deploying or
 * scheduling it, or publish one segment and wait for the result.
 */
export default class Publish extends SfCommand<PublishEnvelope> {
  public static readonly aliases = ['datacloud:publish', 'd360:publish', 'dc:publish'];
  public static readonly summary = 'Publish one Data360 Calculated Insight draft or one segment.';
  public static readonly description =
    'Segment: -m segment:Name (the segment as the org holds it) or -d data360/segments/Name.segment.json (or one of its .segment.<model>.sql files; the org must hold the definition of the file, otherwise SEGMENT_PUBLISH_DEFINITION_MISMATCH: deploy it first). A file retrieved as-is (verbatim) is refused with VERBATIM_NOT_DEPLOYABLE. --api-version auto (68.0) or 68.0, default space. The segment is read by name (absent is SEGMENT_PUBLISH_ADMISSION_FAILED), then one API 68 POST /ssot/segments/{marketSegmentId}/actions/publish without a body starts the publish; it runs on command, needs no acknowledgement flag and is never resent. Salesforce decides whether the segment can be published now, also while it is PROCESSING or COUNTING; a 4xx answer is reported with its text (SEGMENT_PUBLISH_REJECTED). The segment is then read every 30 seconds (progress on stderr) until publishStatus is SUCCESS (published) or FAILED (SEGMENT_PUBLISH_FAILED) for this publish. --wait-timeout sets that wait in whole seconds (default 1800; a publish took about 15 minutes in a test); when it runs out the result is publishing (status processing, exit 0, SEGMENT_PUBLISH_STILL_PROCESSING): still processing, not failed, and not resent. Members are readable only after SUCCESS. --preview reads the segment and reports what would be published without publishing. Calculated insight: requires one exact --source-dir data360/calculatedInsights/Name__cio.calculatedInsight-meta.json or its .calculatedInsight-meta.sql file (the JSON is joined with its SQL; a missing SQL file or another Name__cio.calculatedInsight-meta.* file beside them is refused with INVALID_SOURCE), --api-version auto (68.0) or 68.0 and default space (--dataspace; --data-space is a compatibility alias). The insight must exist (create it with sf data360 deploy, --draft for a draft). An ACTIVE insight that holds every key of the file is unchanged; otherwise one API 68 PATCH sends the file (translated like deploy) with draft: false, and the insight is read until it is ACTIVE with the file. Salesforce decides; a 4xx answer is reported as rejected. --preview is read-only. An unknown outcome is not retried or rolled back.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    'source-dir': Flags.string({
      char: 'd',
      summary: 'One exact CI JSON file or its SQL file, or one segment JSON or SQL file.',
    }),
    metadata: Flags.string({
      char: 'm',
      summary: 'One segment to publish as the org holds it: segment:Name.',
      exclusive: ['source-dir'],
    }),
    'wait-timeout': Flags.integer({
      summary: `Segment only: seconds to wait for SUCCESS or FAILED (default ${segmentPublishWait.timeoutSeconds}).`,
    }),
    'api-version': Flags.string({ summary: 'Native lifecycle route: auto (68.0) or 68.0.' }),
    dataspace: Flags.string({ aliases: ['data-space'], summary: 'Default space only.' }),
    preview: Flags.boolean({ default: false, summary: 'Read and report only; never publish.' }),
  };
  protected resolveInputs = readDeployInputs;
  protected verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  protected calculatedInsightContext = calculatedInsightReadContext;
  protected publishCalculatedInsight = publishCalculatedInsight;
  protected verifySegmentInput = verifySegmentInputDigest;
  protected publishSegment = publishSegment;
  protected segmentProgress = (message: string): void => {
    // oclif logToStderr suppresses output in JSON mode; progress must remain visible.
    process.stderr.write(`${message}
`);
  };
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
      const member = flags.metadata;
      const segmentFile =
        typeof source === 'string' && /\.segment\.(?:json|[A-Za-z0-9_]+\.sql)$/u.test(source);
      const segmentMember =
        typeof member === 'string' &&
        member.startsWith('segment:') &&
        segmentName.test(member.slice(8));
      if (member !== undefined && (!segmentMember || source !== undefined))
        throw new Error('Selection');
      if (
        member === undefined &&
        (typeof source !== 'string' ||
          !source ||
          (!segmentFile && !/\.calculatedInsight-meta\.(?:json|sql)$/u.test(source)))
      )
        throw new Error('Selection');
      const segment = segmentMember || segmentFile;
      code = 'INVALID_WAIT_TIMEOUT_SCOPE';
      const waitTimeout = flags['wait-timeout'];
      if (
        waitTimeout !== undefined &&
        (!segment || !Number.isSafeInteger(waitTimeout) || waitTimeout < 1)
      )
        throw new Error('Wait timeout');
      code = 'INVALID_SCOPE';
      if (
        !['auto', '68.0'].includes(flags['api-version'] ?? 'auto') ||
        (flags.dataspace ?? 'default') !== 'default'
      )
        throw new Error('Scope');
      const snapshot = JSON.stringify(flags);
      if (segment) {
        await this.runSegment(envelope, flags, snapshot, segmentMember ? member : undefined);
        return this.finish(envelope, flags.preview);
      }
      code = 'INVALID_SOURCE';
      const inputs = await this.resolveInputs({
        cwd: process.cwd(),
        sourceDir: [source as string],
      });
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
        // A verbatim file (retrieved as-is) is named with its kind, name and reason.
        message:
          error instanceof DeployInputError && error.code === 'VERBATIM_NOT_DEPLOYABLE'
            ? error.message
            : 'Publication stopped. Verify the exact JSON and SQL source, API 68 and default data space, and target access. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
        retryable: false,
      });
    }
    return this.finish(envelope, flags.preview);
  }

  /**
   * Publish one segment, named by -m segment:Name or by its file, and wait for the result.
   * @param {PublishEnvelope} envelope Receipt to fill.
   * @param {PublishFlags} flags Parsed flags.
   * @param {string} snapshot Flags as parsed, to detect drift.
   * @param {string} [member] The -m segment:Name selector, when given.
   */
  private async runSegment(
    envelope: PublishEnvelope,
    flags: PublishFlags,
    snapshot: string,
    member?: string,
  ): Promise<void> {
    let code = 'INVALID_SOURCE';
    try {
      let apiName: string;
      let desired: SegmentDocument | undefined;
      let input: SegmentDeployInput | undefined;
      if (member) apiName = member.slice(8);
      else {
        const inputs = await this.resolveInputs({
          cwd: process.cwd(),
          sourceDir: [flags['source-dir']!],
        });
        if (inputs.length !== 1 || inputs[0].document.kind !== 'segment')
          throw new Error('Selection');
        input = inputs[0] as SegmentDeployInput;
        desired = input.document;
        apiName = desired.identity.apiName;
      }
      const verifyInput = async (): Promise<void> => {
        if (JSON.stringify(flags) !== snapshot) throw new Error('Intent drift');
        if (input) await this.verifySegmentInput(input);
      };
      await verifyInput();
      code = 'TARGET_ORG_REQUIRED';
      const connection = await this.resolveConnection(flags['target-org']);
      const result = await this.publishSegment(
        apiName,
        connection,
        { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' },
        {
          preview: flags.preview,
          waitTimeoutSeconds: flags['wait-timeout'] ?? segmentPublishWait.timeoutSeconds,
          desired,
          verifyInput,
          progress: this.segmentProgress,
        },
      );
      envelope.result.items.push({
        ...result,
        identity: { apiName, dataSpace: 'default' },
        operation: flags.preview ? 'preview' : 'publish',
        routes: [
          { operation: 'segments.get', apiVersion: '68.0', transport: 'native' },
          { operation: 'segments.publish', apiVersion: '68.0', transport: 'native' },
        ],
      });
      envelope.status =
        result.outcome === 'failed'
          ? 'failed'
          : result.outcome === 'blocked'
            ? 'blocked'
            : result.outcome === 'publishing'
              ? 'processing'
              : 'success';
      // Still processing is reported on the item, not as an error.
      if (result.outcome !== 'publishing')
        envelope.diagnostics.errors.push(
          ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, retryable: false as const })),
        );
    } catch (error) {
      envelope.diagnostics.errors.push({
        code: error instanceof DeployInputError ? error.code : code,
        message:
          error instanceof DeployInputError && error.code === 'VERBATIM_NOT_DEPLOYABLE'
            ? error.message
            : 'Publication stopped. Verify the segment selection (-m segment:Name or its .segment.json file), API 68 and default data space, and target access. Nothing was published.',
        retryable: false,
      });
    }
  }

  /**
   * Set the exit code and print the human summary.
   * @param {PublishEnvelope} envelope Filled receipt.
   * @param {boolean} preview Whether this was a preview.
   * @returns {PublishEnvelope} The same receipt.
   */
  private finish(envelope: PublishEnvelope, preview: boolean): PublishEnvelope {
    if (envelope.status !== 'success' && envelope.status !== 'processing') process.exitCode = 1;
    annotateDiagnostics(envelope);
    if (!this.jsonEnabled()) {
      this.log(`Publish${preview ? ' preview' : ''}: ${envelope.status}.`);
      for (const item of envelope.result.items) {
        this.log(`${item.outcome}: ${item.identity.apiName}; mutation: ${item.mutation}.`);
        if (item.family === 'segment') {
          if (item.segment?.publishStatus)
            this.log(
              `publishStatus: ${item.segment.publishStatus}${item.waitedSeconds === undefined ? '' : ` after ${item.waitedSeconds} s`}.`,
            );
          if (item.outcome === 'publishing')
            for (const diagnostic of item.diagnostics) this.log(formatDiagnostic(diagnostic));
        }
      }
      for (const diagnostic of envelope.diagnostics.errors) this.log(formatDiagnostic(diagnostic));
    }
    return envelope;
  }
}

type PublishFlags = {
  'target-org'?: string;
  'source-dir'?: string;
  metadata?: string;
  'wait-timeout'?: number;
  'api-version'?: string;
  dataspace?: string;
  preview: boolean;
};
