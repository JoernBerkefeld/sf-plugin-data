import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../../../plugin.js';
import { segmentName } from '../../../../artifacts/segment-document.js';
import {
  memberDelimiters,
  memberOutputFile,
  writeMemberExport,
} from '../../../../artifacts/write-member-export.js';
import type { MemberFormat } from '../../../../artifacts/write-member-export.js';
import {
  discoverMemberDetails,
  readDetailPages,
  readMemberPages,
  readSegmentSummary,
  SegmentMembersError,
} from '../../../../services/segment-members.js';
import type { DetailColumn, SegmentSummary } from '../../../../services/segment-members.js';
import { operationDiagnostic } from '../../../../services/operation-diagnostic.js';
import { openBoundSsot } from '../../../../transport/bound-ssot.js';
import type { BoundSsot } from '../../../../transport/bound-ssot.js';
import { ConnectError } from '../../../../transport/connect-client.js';
import { annotateDiagnostics, formatDiagnostic } from '../../../../errors/registry.js';

export type SegmentMembersEnvelope = {
  contract: 'sf-data360-segment-members';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'segment-members-export'; apiVersion: string; plugin: typeof plugin };
  provenance: { command: 'sf data360 segment members export'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    segment?: Omit<SegmentSummary, 'membershipDmo' | 'segmentOn' | 'displayName'>;
    includeDetails: boolean;
    resultFormat: MemberFormat;
    outputFile?: string;
    rowsWritten: number;
    totalCount?: number;
    pages: number;
    columns?: DetailColumn[];
    routes: Array<{ operation: string; apiVersion: string; transport: 'native' }>;
  };
};

type ExportFlags = {
  'target-org'?: string;
  metadata?: string;
  'output-file'?: string;
  'result-format': MemberFormat;
  'include-details': boolean;
  fields?: string;
  filters?: string;
  'order-by'?: string;
  limit: number;
  offset: number;
  'column-delimiter': keyof typeof memberDelimiters;
  'api-version'?: string;
  dataspace?: string;
};

/**
 * Export the members of one published segment as CSV or JSON rows: a data export, written
 * outside the `data360/` definition folders.
 */
export default class SegmentMembersExport extends SfCommand<SegmentMembersEnvelope> {
  public static readonly aliases = [
    'datacloud:segment:members:export',
    'd360:segment:members:export',
    'dc:segment:members:export',
  ];
  public static readonly summary = 'Export the members of one published segment as CSV or JSON.';
  public static readonly description =
    'Reads the members of -m segment:Name (exact API name, default data space; --api-version auto (68.0), 67.0 or 68.0) and writes them as data rows to --output-file, by default data/default/<Name>-<YYYY-MM-DD_HH-mm-ss>.csv below the working directory (never a data360/ definition folder; an existing --output-file is replaced). The segment is read first (absent is SEGMENT_MEMBERS_NOT_FOUND). Basic mode reads GET /ssot/segments/{Name}/members page by page with limit (--limit rows per request, default 1000; Salesforce decides the maximum, 2000 worked in a test) and offset (--offset first row, default 0) until totalCount rows are read; --fields, --filters and --order-by are sent as given and Salesforce decides (its default is the member ID and a few membership columns). A member count that changes during the read (a publish finished) is SEGMENT_MEMBERS_CHANGED. --include-details instead joins the latest membership DMO to the DMO the segment is built on and writes every field of that DMO per member, through one Data 360 SQL query (POST /ssot/query-sql, rows read page by page up to the row count); a member with more than one detail row is SEGMENT_MEMBER_DETAILS_AMBIGUOUS. Members exist only after a publish finished (sf data360 publish); before that the export is empty with a warning. Reads retry after network errors, HTTP 429 and 503; any other Salesforce error ends the export (SEGMENT_MEMBERS_READ_FAILED) and no file is left. --result-format csv (default; header from the first row, --column-delimiter) or json (an array of row objects). Read-only: nothing in the org changes.';
  public static readonly examples = [
    'sf data360 segment members export -o target -m segment:My_Segment',
    'sf data360 segment members export -o target -m segment:My_Segment --result-format json --output-file members.json',
    'sf data360 segment members export -o target -m segment:My_Segment --include-details',
  ];
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    metadata: Flags.string({
      char: 'm',
      summary: 'The segment to export: segment:Name (exact API name).',
    }),
    'output-file': Flags.string({
      char: 'f',
      summary: 'File to write; default data/default/<Name>-<timestamp>.<format>.',
    }),
    'result-format': Flags.option({
      options: ['csv', 'json'] as const,
      default: 'csv' as const,
      summary: 'Output format: csv or json.',
    })(),
    'include-details': Flags.boolean({
      default: false,
      summary: 'Write every field of the DMO the segment is built on per member (SQL query).',
    }),
    fields: Flags.string({ summary: 'Basic mode: fields parameter of the members route.' }),
    filters: Flags.string({ summary: 'Basic mode: filters parameter of the members route.' }),
    'order-by': Flags.string({ summary: 'Basic mode: orderBy parameter of the members route.' }),
    limit: Flags.integer({ default: 1000, min: 1, summary: 'Rows per request.' }),
    offset: Flags.integer({ default: 0, min: 0, summary: 'Basic mode: first row to read.' }),
    'column-delimiter': Flags.option({
      options: Object.keys(memberDelimiters) as Array<keyof typeof memberDelimiters>,
      default: 'COMMA' as const,
      summary: 'CSV column delimiter.',
    })(),
    'api-version': Flags.string({ summary: 'auto (68.0), 67.0 or 68.0.' }),
    dataspace: Flags.string({ aliases: ['data-space'], summary: 'Default space only.' }),
  };
  protected createSender?: (connection: Connection, version: string) => BoundSsot;
  protected reportProgress = (message: string): void => {
    // oclif logToStderr suppresses output in JSON mode; progress must remain visible.
    process.stderr.write(`${message}\n`);
  };
  protected pause?: (milliseconds: number) => Promise<void>;
  protected cwd = (): string => process.cwd();
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
   * Validate the selection before auth, then read and write the members.
   * @returns {Promise<SegmentMembersEnvelope>} Export receipt.
   */
  public async run(): Promise<SegmentMembersEnvelope> {
    const { flags } = (await this.parse(SegmentMembersExport)) as unknown as { flags: ExportFlags };
    const requested = flags['api-version'] ?? 'auto';
    const version = requested === 'auto' ? '68.0' : requested;
    const envelope: SegmentMembersEnvelope = {
      contract: 'sf-data360-segment-members',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: { operation: 'segment-members-export', apiVersion: requested, plugin },
      provenance: {
        command: 'sf data360 segment members export',
        generatedAt: new Date().toISOString(),
      },
      diagnostics: { warnings: [], errors: [] },
      result: {
        includeDetails: flags['include-details'],
        resultFormat: flags['result-format'],
        rowsWritten: 0,
        pages: 0,
        routes: [],
      },
    };
    const fail = (code: string, message: string): SegmentMembersEnvelope => {
      envelope.diagnostics.errors.push({ code, message, retryable: false });
      return this.finish(envelope);
    };
    const member = flags.metadata;
    const apiName = member?.startsWith('segment:') ? member.slice(8) : undefined;
    if (!apiName || !segmentName.test(apiName))
      return fail(
        'INVALID_SELECTION',
        'Name exactly one segment with -m segment:Name (its exact API name).',
      );
    if (
      flags['include-details'] &&
      (flags.fields !== undefined ||
        flags.filters !== undefined ||
        flags['order-by'] !== undefined ||
        flags.offset !== 0)
    )
      return fail(
        'INVALID_SELECTION',
        '--fields, --filters, --order-by and --offset apply to basic mode only, not with --include-details.',
      );
    if (!['67.0', '68.0'].includes(version) || (flags.dataspace ?? 'default') !== 'default')
      return fail(
        'INVALID_SCOPE',
        'Segment members are read at --api-version auto (68.0), 67.0 or 68.0 in the default data space.',
      );
    let connection: Connection;
    try {
      connection = await this.resolveConnection(flags['target-org']);
    } catch {
      return fail(
        'TARGET_ORG_REQUIRED',
        'No usable target org: pass -o with an authenticated alias or username, or set target-org.',
      );
    }
    const sender = this.createSender
      ? this.createSender(connection, version)
      : openBoundSsot(connection.getUsername() ?? '', version, async () => connection);
    const route = (operation: string): void => {
      envelope.result.routes.push({ operation, apiVersion: version, transport: 'native' });
    };
    try {
      route('segments.get');
      const segment = await readSegmentSummary(sender, version, apiName);
      if (!segment)
        return fail(
          'SEGMENT_MEMBERS_NOT_FOUND',
          `Segment ${apiName} does not exist in the default data space of the org (HTTP 404 ITEM_NOT_FOUND). Check the exact API name.`,
        );
      envelope.result.segment = {
        apiName: segment.apiName,
        marketSegmentId: segment.marketSegmentId,
        dataSpace: segment.dataSpace,
        ...(segment.publishStatus ? { publishStatus: segment.publishStatus } : {}),
        ...(segment.lastPublishedEndDateTime
          ? { lastPublishedEndDateTime: segment.lastPublishedEndDateTime }
          : {}),
        ...(segment.lastSegmentMemberCount === undefined
          ? {}
          : { lastSegmentMemberCount: segment.lastSegmentMemberCount }),
      };
      const file = await memberOutputFile(
        flags['output-file'],
        apiName,
        flags['result-format'],
        this.cwd(),
      );
      const delimiter = memberDelimiters[flags['column-delimiter']];
      const report = (read: number, total: number): void => {
        envelope.result.pages++;
        envelope.result.totalCount = total;
        this.reportProgress(`Segment ${apiName}: ${read} of ${total} members read.`);
      };
      let rows: number;
      if (flags['include-details']) {
        route('metadata.get');
        const { sql, columns } = await discoverMemberDetails(sender, version, segment);
        envelope.result.columns = columns;
        route('query-sql.post');
        route('query-sql.rows');
        rows = await writeMemberExport(
          file,
          flags['result-format'],
          delimiter,
          flags['result-format'] === 'csv' ? columns.map(({ name }) => name) : undefined,
          async (sink) => {
            let read = 0;
            for await (const page of readDetailPages(
              sender,
              version,
              sql,
              columns.length,
              flags.limit,
              this.pause,
            )) {
              await sink.write(
                page.rows.map((row) =>
                  Object.fromEntries(columns.map(({ name }, index) => [name, row[index]])),
                ),
              );
              read += page.rows.length;
              report(read, page.totalCount);
            }
          },
        );
      } else {
        route('segments.members');
        rows = await writeMemberExport(
          file,
          flags['result-format'],
          delimiter,
          undefined,
          async (sink) => {
            let read = 0;
            for await (const page of readMemberPages(sender, version, apiName, {
              fields: flags.fields,
              filters: flags.filters,
              orderBy: flags['order-by'],
              limit: flags.limit,
              offset: flags.offset,
            })) {
              await sink.write(page.rows);
              read += page.rows.length;
              report(read, page.totalCount);
            }
          },
        );
      }
      envelope.result.rowsWritten = rows;
      envelope.result.outputFile = file;
      envelope.status = 'success';
      if (rows === 0 && segment.publishStatus !== 'SUCCESS')
        envelope.diagnostics.warnings.push(
          `Segment ${apiName} has no members to read: Salesforce fills them only after a publish finished (publishStatus ${segment.publishStatus ?? 'not reported'}). Publish it with sf data360 publish -m segment:${apiName}.`,
        );
    } catch (error) {
      envelope.status = envelope.result.segment ? 'failed' : 'blocked';
      const output = !(error instanceof SegmentMembersError || error instanceof ConnectError);
      envelope.diagnostics.errors.push({
        code:
          error instanceof SegmentMembersError
            ? error.code
            : error instanceof ConnectError
              ? error.code === 'REQUEST_FAILED'
                ? 'SEGMENT_MEMBERS_READ_FAILED'
                : error.code
              : 'SEGMENT_MEMBERS_OUTPUT_FAILED',
        message: operationDiagnostic(
          error,
          output
            ? 'The output file could not be written; no output file was left. Nothing in the org changed.'
            : 'No output file was left. Nothing in the org changed.',
        ),
        retryable: false,
      });
    }
    return this.finish(envelope);
  }

  /**
   * Set the exit code and print the human summary.
   * @param {SegmentMembersEnvelope} envelope Filled receipt.
   * @returns {SegmentMembersEnvelope} The same receipt.
   */
  private finish(envelope: SegmentMembersEnvelope): SegmentMembersEnvelope {
    if (envelope.status !== 'success') process.exitCode = 1;
    annotateDiagnostics(envelope);
    if (!this.jsonEnabled()) {
      const { result } = envelope;
      if (envelope.status === 'success')
        this.log(`Saved ${result.rowsWritten} segment members to ${result.outputFile}.`);
      else this.log(`Segment members export: ${envelope.status}.`);
      for (const warning of envelope.diagnostics.warnings) this.log(`Warning: ${warning}`);
      for (const diagnostic of envelope.diagnostics.errors) this.log(formatDiagnostic(diagnostic));
    }
    return envelope;
  }
}
