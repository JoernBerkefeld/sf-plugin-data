import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { plugin } from '../../../plugin.js';
import { DataSpaceError } from '../../../services/data-space-check.js';
import { listDataSpaces } from '../../../services/list-data-spaces.js';
import type { DataSpaceListing } from '../../../services/list-data-spaces.js';
import type { LookupConnection } from '../../../services/segment-lookup.js';
import { operationDiagnostic } from '../../../services/operation-diagnostic.js';
import { annotateDiagnostics, formatDiagnostic } from '../../../errors/registry.js';
import { exitCodeOf } from '../../../exit-code.js';

export type ListDataSpaceEnvelope = {
  contract: 'sf-data360-list-dataspace';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'list-dataspace'; apiVersion: '68.0'; plugin: typeof plugin };
  provenance: { command: 'sf data360 list dataspace'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: { items: DataSpaceListing[] };
};

type ListFlags = { 'target-org'?: string };

/**
 * List the data spaces of the org: the names `--dataspace` takes in every other command.
 */
export default class ListDataSpace extends SfCommand<ListDataSpaceEnvelope> {
  public static readonly aliases = [
    'datacloud:list:dataspace',
    'd360:list:dataspace',
    'dc:list:dataspace',
  ];
  public static readonly summary = 'List the data spaces of the org.';
  public static readonly description =
    'Reads every Data360 data space of the org (GET /ssot/data-spaces at API 68, page by page until the list is complete) and shows its name, label and prefix. The name is what --dataspace takes in the other sf data360 commands; the prefix (every data space but default has one) is what Salesforce puts in front of some names in that data space, such as ds2_Individual__dlm. A list that cannot be read completely is DATASPACE_READ_FAILED and nothing is shown. Read-only: nothing in the org changes.';
  public static readonly examples = [
    'sf data360 list dataspace -o source',
    'sf data360 list dataspace -o source --json',
  ];
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
  };
  protected resolveConnection = async (alias?: string): Promise<LookupConnection> => {
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
   * Read the org's data spaces.
   * @returns {Promise<ListDataSpaceEnvelope>} List receipt.
   */
  public async run(): Promise<ListDataSpaceEnvelope> {
    const { flags } = (await this.parse(ListDataSpace)) as unknown as { flags: ListFlags };
    const envelope: ListDataSpaceEnvelope = {
      contract: 'sf-data360-list-dataspace',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: { operation: 'list-dataspace', apiVersion: '68.0', plugin },
      provenance: { command: 'sf data360 list dataspace', generatedAt: new Date().toISOString() },
      diagnostics: { warnings: [], errors: [] },
      result: { items: [] },
    };
    let connection: LookupConnection;
    try {
      connection = await this.resolveConnection(flags['target-org']);
    } catch {
      // A given --target-org that cannot be used is an authentication failure.
      envelope.diagnostics.errors.push(
        flags['target-org'] === undefined
          ? {
              code: 'TARGET_ORG_REQUIRED',
              message:
                'No usable target org: pass -o with an authenticated alias or username, or set target-org.',
              retryable: false,
            }
          : {
              code: 'AUTHENTICATION_FAILED',
              message:
                'The target org given with -o is unknown or not authenticated: log in to it with sf org login web, or pass another alias or username.',
              retryable: false,
            },
      );
      return this.finish(envelope);
    }
    try {
      envelope.result.items = await listDataSpaces(connection);
      envelope.status = 'success';
    } catch (error) {
      envelope.status = 'failed';
      envelope.diagnostics.errors.push({
        code: error instanceof DataSpaceError ? error.code : 'DATASPACE_READ_FAILED',
        message: operationDiagnostic(
          error,
          'The data space list was not read completely. Nothing in the org changed.',
        ),
        retryable: false,
      });
    }
    return this.finish(envelope);
  }

  /**
   * Set the exit code and print the human list.
   * @param {ListDataSpaceEnvelope} envelope Filled receipt.
   * @returns {ListDataSpaceEnvelope} The same receipt.
   */
  private finish(envelope: ListDataSpaceEnvelope): ListDataSpaceEnvelope {
    const exitCode = exitCodeOf(envelope);
    if (exitCode !== 0) process.exitCode = exitCode;
    annotateDiagnostics(envelope);
    if (!this.jsonEnabled()) {
      if (envelope.status === 'success') {
        const rows = [
          ['Name', 'Label', 'Prefix'],
          ...envelope.result.items.map((item) => [item.name, item.label, item.prefix ?? '']),
        ];
        const widths = [0, 1].map((column) => Math.max(...rows.map((row) => row[column].length)));
        for (const row of rows)
          this.log(`${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2]}`.trimEnd());
      } else this.log(`List data spaces: ${envelope.status}.`);
      for (const diagnostic of envelope.diagnostics.errors) this.log(formatDiagnostic(diagnostic));
    }
    return envelope;
  }
}
