import select from '@inquirer/select';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../../../plugin.js';
import { isDataSpaceName } from '../../../../artifacts/data-space-field.js';
import { dataSpaceCheckOf } from '../../../../services/data-space-check.js';
import {
  formatMemberValue,
  memberColumnHeaders,
  memberDelimiter,
  memberDelimiterOptions,
  memberOutputFile,
  writeMemberExport,
} from '../../../../artifacts/write-member-export.js';
import type { MemberFormat } from '../../../../artifacts/write-member-export.js';
import {
  describeCandidate,
  discoverMemberDetails,
  readDetailPages,
  readMemberPages,
  resolveSegmentSelection,
  SegmentMembersError,
} from '../../../../services/segment-members.js';
import type {
  DetailColumn,
  SegmentCandidate,
  SegmentSummary,
} from '../../../../services/segment-members.js';
import { operationDiagnostic } from '../../../../services/operation-diagnostic.js';
import { openBoundSsot } from '../../../../transport/bound-ssot.js';
import type { BoundSsot } from '../../../../transport/bound-ssot.js';
import { ConnectError } from '../../../../transport/connect-client.js';
import { annotateDiagnostics, formatDiagnostic } from '../../../../errors/registry.js';
import { exitCodeOf } from '../../../../exit-code.js';

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
    columnHeaders?: ColumnHeaders;
    columns?: Array<DetailColumn & { header: string }>;
    routes: Array<{ operation: string; apiVersion: string; transport: 'native' }>;
  };
};

type ColumnHeaders = 'label' | 'api-name';

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
  'column-delimiter': string;
  'column-headers': ColumnHeaders;
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
    'Reads the members of the segment named by -m segment:<API name, record ID or display name> (in the run data space, --dataspace, default: default; --api-version auto (68.0), 67.0 or 68.0) and writes them as data rows to --output-file, by default data/<data space>/<display name>-<YYYY-MM-DD_HH-mm-ss>.csv below the working directory (data/default/... in the default data space) (the display name made file-safe like the mcnext export: control characters and < > : " / \\ | ? * become -, whitespace runs -, leading and trailing dots and spaces dropped; the API name when the segment has no display name; a later file in the same second gets _2, _3, ...; never a data360/ definition folder; an existing --output-file is replaced). The segment is read first: an API name directly (GET /ssot/segments/{Name}); otherwise the segment list (GET /ssot/segments) is searched for the exact MarketSegment record ID or the exact display name, as the Data Cloud UI shows them (case matters; no match is SEGMENT_MEMBERS_NOT_FOUND). When several segments share that display name, a terminal asks which one ("Multiple segments match that name. Choose one:"); with --json or without a terminal the export stops with SEGMENT_SELECTION_AMBIGUOUS and lists each name, API name and ID. Basic mode reads GET /ssot/segments/{Name}/members page by page with limit (--limit rows per request, default 1000; Salesforce decides the maximum, 2000 worked in a test) and offset (--offset first row, default 0) until totalCount rows are read; --fields, --filters and --order-by are sent as given and Salesforce decides (its default is the member ID and a few membership columns). A member count that changes during the read (a publish finished) is SEGMENT_MEMBERS_CHANGED. --include-details instead joins the latest membership DMO to the DMO the segment is built on and writes every field of that DMO per member, through one Data 360 SQL query (POST /ssot/query-sql, rows read page by page up to the row count); a member with more than one detail row is SEGMENT_MEMBER_DETAILS_AMBIGUOUS. Its CSV header and JSON keys are the field labels (--column-headers label, default; an empty label uses the API name, a repeated header gets _2, _3, ...) or the field API names (--column-headers api-name); basic mode always uses the names Salesforce returns. Detail values of DATE fields are written as YYYY-MM-DD and of DATE_TIME fields with a space instead of the T (offset kept); basic mode writes values as Salesforce returns them. Members exist only after a publish finished (sf data360 publish); before that the export is empty with a warning. Reads retry after network errors, HTTP 429 and 503; any other Salesforce error ends the export (SEGMENT_MEMBERS_READ_FAILED) and no file is left. --result-format csv (default; basic mode: header from the first row, so a segment without members gives an empty file; --include-details: header from the DMO fields, written even without members; --column-delimiter as a name or the character: COMMA or ",", SEMICOLON or ";", TAB, PIPE or "|", CARET or "^", BACKQUOTE or "`") or json (an array of row objects). Read-only: nothing in the org changes.';
  public static readonly examples = [
    'sf data360 segment members export -o target -m segment:My_Segment',
    'sf data360 segment members export -o target -m "segment:My Segment" --column-delimiter ";"',
    'sf data360 segment members export -o target -m segment:1sgXXXXXXXXXXXXXXX',
    'sf data360 segment members export -o target -m segment:My_Segment --include-details --column-headers api-name',
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
      summary: 'The segment to export: segment:<API name, record ID or display name>.',
    }),
    'output-file': Flags.string({
      char: 'f',
      summary: 'File to write; default data/default/<display name>-<timestamp>.<format>.',
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
      options: memberDelimiterOptions,
      default: 'COMMA',
      summary: 'CSV column delimiter: a name (COMMA, SEMICOLON, TAB, ...) or the character.',
    })(),
    'column-headers': Flags.option({
      options: ['label', 'api-name'] as const,
      default: 'label' as const,
      summary: '--include-details: header from field labels (default) or API names.',
    })(),
    'api-version': Flags.string({ summary: 'auto (68.0), 67.0 or 68.0.' }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary:
        "The run's data space (default: default): the segment must be in it, and the detail query runs in it.",
    }),
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
   * A person can answer a prompt: a terminal on stdin and no --json.
   * @returns {boolean} Whether to ask.
   */
  protected interactive(): boolean {
    return Boolean(process.stdin.isTTY) && !this.jsonEnabled();
  }

  /**
   * Ask which of several segments to export.
   * @param {SegmentCandidate[]} candidates Segments sharing the selection.
   * @returns {Promise<SegmentCandidate>} The chosen segment.
   */
  protected async chooseSegment(candidates: SegmentCandidate[]): Promise<SegmentCandidate> {
    const index = await select({
      message: 'Multiple segments match that name. Choose one:',
      choices: candidates.map((candidate, value) => ({
        name: describeCandidate(candidate),
        value,
      })),
    });
    return candidates[index];
  }

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
    const selection = member?.startsWith('segment:') ? member.slice(8) : undefined;
    // eslint-disable-next-line no-control-regex -- control characters are refused, not matched
    if (!selection?.trim() || selection.length > 255 || /[\u0000-\u001F\u007F]/u.test(selection))
      return fail(
        'INVALID_SELECTION',
        'Name exactly one segment with -m segment:<API name, record ID or display name>.',
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
    const dataSpace = flags.dataspace ?? 'default';
    if (!['67.0', '68.0'].includes(version) || !isDataSpaceName(dataSpace))
      return fail(
        'INVALID_SCOPE',
        'Segment members are read at --api-version auto (68.0), 67.0 or 68.0 in one data space (--dataspace).',
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
      const interactive = this.interactive();
      // The data space of a segment the API name names elsewhere, for the not-found message.
      let elsewhere: string | undefined;
      const segment = await resolveSegmentSelection(sender, version, selection, {
        dataSpace,
        elsewhere: (space) => {
          elsewhere = space;
        },
        listed: () => route('segments.list'),
        ...(interactive
          ? {
              choose: async (candidates: SegmentCandidate[]): Promise<SegmentCandidate> => {
                try {
                  return await this.chooseSegment(candidates);
                } catch {
                  throw new SegmentMembersError(
                    'SEGMENT_SELECTION_AMBIGUOUS',
                    `"${selection}" matches ${candidates.length} segments in the data space ${dataSpace} and none was chosen.`,
                  );
                }
              },
            }
          : {}),
      });
      if (!segment) {
        // Salesforce stores a segment of a non-default data space as <prefix>_<Name>.
        let prefix: string | undefined;
        if (dataSpace !== 'default')
          try {
            prefix = await dataSpaceCheckOf(this, async () => sender).prefixOf(dataSpace);
          } catch {
            prefix = undefined;
          }
        return fail(
          'SEGMENT_MEMBERS_NOT_FOUND',
          `No segment in the data space ${dataSpace} of the org has the API name, record ID or display name "${selection}".${elsewhere === undefined ? '' : ` A segment of that API name is in the data space ${elsewhere}; run the command with --dataspace ${elsewhere} to export it.`} Check the exact value (case matters${dataSpace === 'default' ? '' : `; a segment of the data space ${dataSpace} is stored as ${prefix ?? '<prefix>'}_<Name>`}).`,
        );
      }
      const apiName = segment.apiName;
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
        segment.displayName ?? apiName,
        flags['result-format'],
        this.cwd(),
        undefined,
        dataSpace,
      );
      const delimiter = memberDelimiter(flags['column-delimiter']);
      const report = (read: number, total: number): void => {
        envelope.result.pages++;
        envelope.result.totalCount = total;
        this.reportProgress(`Segment ${apiName}: ${read} of ${total} members read.`);
      };
      let rows: number;
      if (flags['include-details']) {
        route('metadata.get');
        const { sql, columns } = await discoverMemberDetails(sender, version, segment, dataSpace);
        const headers = memberColumnHeaders(columns, flags['column-headers']);
        envelope.result.columnHeaders = flags['column-headers'];
        envelope.result.columns = columns.map((column, index) => ({
          ...column,
          header: headers[index],
        }));
        route('query-sql.post');
        route('query-sql.rows');
        rows = await writeMemberExport(
          file,
          flags['result-format'],
          delimiter,
          flags['result-format'] === 'csv' ? headers : undefined,
          async (sink) => {
            let read = 0;
            for await (const page of readDetailPages(
              sender,
              version,
              sql,
              columns.length,
              flags.limit,
              this.pause,
              dataSpace,
            )) {
              await sink.write(
                page.rows.map((row) =>
                  Object.fromEntries(
                    headers.map((header, index) => [
                      header,
                      formatMemberValue(row[index], columns[index].dataType),
                    ]),
                  ),
                ),
              );
              read += page.rows.length;
              report(read, page.totalCount);
            }
          },
        );
      } else {
        envelope.result.columnHeaders = 'api-name';
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
    const exitCode = exitCodeOf(envelope);
    if (exitCode !== 0) process.exitCode = exitCode;
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
