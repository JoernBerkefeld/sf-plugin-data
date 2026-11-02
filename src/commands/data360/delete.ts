import { nativeDmoName, NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { deleteNativeDmo, retrieveNativeDmo } from '../../services/native-dmo.js';
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
  public static readonly summary =
    'Delete exact Data360 DMO/DLO definitions; --preview is read-only.';
  public static readonly description =
    'Executes by default without confirmation. Exact DMO names use API65/default and name-based deletion; DLOs use API68/default and resolved target IDs. Mixed DMO/DLO deletion requires auto. No cascade, local deletion, retries or rollback. Already absent is unchanged. Use --preview for lookup/report only with zero mutations.';
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
    'api-version': Flags.string({
      summary: 'DMO65 or DLO68; omitted derives the selected family, auto permits both.',
    }),
    'data-space': Flags.string({ default: 'default' }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
  };
  protected createDmoClient = createDmoClient;
  protected retrieveDmo = retrieveNativeDmo;
  protected deleteDmo = deleteNativeDmo;
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
        apiVersion:
          flags['api-version'] ??
          (flags.metadata?.every((value) => value.startsWith('dmo:')) ? '65.0' : '68.0'),
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
        flags.metadata.some(
          (value) =>
            !(value.startsWith('dlo:') && dloName.test(value.slice(4))) &&
            !(value.startsWith('dmo:') && nativeDmoName.test(value.slice(4))),
        )
      )
        throw new DloError('INVALID_SELECTION');
      const families = new Set(flags.metadata.map((value) => value.slice(0, 3)));
      const version =
        flags['api-version'] ?? (families.has('dmo') && families.size === 1 ? '65.0' : '68.0');
      if (
        flags['data-space'] !== 'default' ||
        (version !== 'auto' &&
          (families.size > 1 || version !== (families.has('dmo') ? '65.0' : '68.0')))
      )
        throw new DloError('INVALID_SCOPE');
      const target = await this.resolveTarget(flags['target-org']);
      for (const selector of new Set(flags.metadata)) {
        const native = selector.startsWith('dmo:');
        const apiName = selector.slice(4);
        const baseClient = native
          ? (this.createDmoClient ?? createDmoClient)(target, '65.0')
          : this.createDloClient(target, '68.0');
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
            await (native
              ? (this.retrieveDmo ?? retrieveNativeDmo)(apiName, client)
              : this.retrieveDlo(apiName, client));
            item.outcome = 'delete';
          } else {
            await (native
              ? (this.deleteDmo ?? deleteNativeDmo)(apiName, client)
              : this.deleteDlo(apiName, client));
            item.outcome = 'deleted';
            item.mutation = 'confirmed-deleted';
          }
        } catch (error) {
          if (
            !dispatched &&
            (error instanceof DloError || error instanceof NativeDmoError) &&
            ['DLO_HTTP_ERROR', 'DMO_HTTP_ERROR'].includes(error.code) &&
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
        code:
          error instanceof DloError || error instanceof NativeDmoError
            ? error.code
            : 'DELETE_FAILED',
        message:
          'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry, cascade or rollback.',
        retryable: false,
      });
    }
    return finish();
  }
}
