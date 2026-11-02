import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { DloError, dloName } from '../../artifacts/dlo-document.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';

export type DeleteEnvelope = {
  contract: 'sf-data360-delete';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: { operation: 'delete'; preview: boolean; apiVersion: string; plugin: typeof plugin };
  provenance: { command: 'sf data360 delete'; generatedAt: string };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
  };
  result: {
    items: Array<{
      identity: { dataSpace: 'default'; apiName: string };
      operation: 'preview' | 'delete';
      outcome: 'delete' | 'deleted' | 'unchanged' | 'blocked' | 'failed';
      mutation: 'not-attempted' | 'confirmed-deleted' | 'unknown';
    }>;
  };
};
/** Delete exact native DLO definitions, or preview without mutation. */
export default class Delete extends SfCommand<DeleteEnvelope> {
  public static readonly aliases = ['datacloud:delete', 'd360:delete', 'dc:delete'];
  public static readonly summary = 'Delete exact Data360 DLO definitions; --preview is read-only.';
  public static readonly description =
    'Executes by default without confirmation. Resolves the exact target name before deleting its target ID at API68/default. No cascade, local deletion, retries or rollback. Already absent is unchanged. Use --preview for lookup/report only with zero mutations.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated target org alias or username.',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      required: true,
      summary: 'Exact dlo:Name__dll selectors only.',
    }),
    'api-version': Flags.orgApiVersion({ default: '68.0' }),
    'data-space': Flags.string({ default: 'default' }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
  };
  protected createDloClient = createDloClient;
  protected retrieveDlo = retrieveNativeDlo;
  protected deleteDlo = deleteNativeDlo;
  protected resolveTarget = async (alias?: string): Promise<string> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = alias ?? aggregator.getPropertyValue<string>('target-org');
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({
        username: target ? state.aliases.resolveUsername(target) : undefined,
      }),
      connectionOptions: { version: '68.0' },
    });
    const username = connection.getUsername();
    if (!username) throw new DloError('TARGET_ORG_REQUIRED');
    return username;
  };
  /**
   * Execute exact selection sequentially, stopping on the first error.
   * @returns {Promise<DeleteEnvelope>} Payload-free deletion evidence.
   */
  public async run(): Promise<DeleteEnvelope> {
    const { flags } = await this.parse(Delete);
    const envelope: DeleteEnvelope = {
      contract: 'sf-data360-delete',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: {
        operation: 'delete',
        preview: flags.preview,
        apiVersion: flags['api-version'],
        plugin,
      },
      provenance: { command: 'sf data360 delete', generatedAt: new Date().toISOString() },
      diagnostics: { warnings: [], errors: [] },
      result: { items: [] },
    };
    const finish = (): DeleteEnvelope => {
      if (envelope.status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Delete${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
        for (const item of envelope.result.items)
          this.log(`dlo:${item.identity.apiName}: ${item.outcome}; mutation: ${item.mutation}.`);
      }
      return envelope;
    };
    try {
      if (
        !flags.metadata?.length ||
        flags.metadata.some((value) => !value.startsWith('dlo:') || !dloName.test(value.slice(4)))
      )
        throw new DloError('INVALID_SELECTION');
      if (flags['api-version'] !== '68.0' || flags['data-space'] !== 'default')
        throw new DloError('INVALID_SCOPE');
      const target = await this.resolveTarget(flags['target-org']);
      const baseClient = this.createDloClient(target, '68.0');
      for (const apiName of new Set(flags.metadata.map((value) => value.slice(4)))) {
        let dispatched = false;
        const client = {
          ...baseClient,
          delete: async (id: string): Promise<void> => {
            dispatched = true;
            await baseClient.delete(id);
          },
        };
        const item: DeleteEnvelope['result']['items'][number] = {
          identity: { dataSpace: 'default', apiName },
          operation: flags.preview ? 'preview' : 'delete',
          outcome: 'blocked',
          mutation: 'not-attempted',
        };
        envelope.result.items.push(item);
        try {
          if (flags.preview) {
            await this.retrieveDlo(apiName, client);
            item.outcome = 'delete';
          } else {
            await this.deleteDlo(apiName, client);
            item.outcome = 'deleted';
            item.mutation = 'confirmed-deleted';
          }
        } catch (error) {
          if (
            !dispatched &&
            error instanceof DloError &&
            error.code === 'DLO_HTTP_ERROR' &&
            error.status === 404
          ) {
            item.outcome = 'unchanged';
            continue;
          }
          item.outcome = dispatched ? 'failed' : 'blocked';
          item.mutation = dispatched ? 'unknown' : 'not-attempted';
          envelope.status = dispatched ? 'failed' : 'blocked';
          throw error;
        }
      }
      envelope.status = 'success';
    } catch (error) {
      envelope.diagnostics.errors.push({
        code: error instanceof DloError ? error.code : 'DLO_DELETE_FAILED',
        message:
          'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry, cascade or rollback.',
        retryable: false,
      });
    }
    return finish();
  }
}
