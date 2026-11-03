import { nativeDmoName, NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { deleteNativeDmo, retrieveNativeDmo } from '../../services/native-dmo.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, StateAggregator } from '@salesforce/core';
import { DloError, dloName } from '../../artifacts/dlo-document.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../../services/native-dlo.js';
import { plugin } from '../../plugin.js';
import { nativeMappingName, NativeMappingError } from '../../artifacts/native-mapping-document.js';
import { createMappingClient } from '../../transport/mapping-rest.js';
import {
  deleteNativeMapping,
  preflightDeleteNativeMapping,
} from '../../services/native-mapping.js';
import { isNativeMappingDeletionVersion, nativeApiVersion } from '../../transport/api-version.js';

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
      plan?: Array<{
        operation: 'unmap' | 'delete';
        apiName: string;
        sourceFieldDeveloperName?: string;
        targetFieldDeveloperName?: string;
        developerName?: string;
      }>;
    }>;
  };
};
/** Delete exact native DLO definitions, or preview without mutation. */
export default class Delete extends SfCommand<DeleteEnvelope> {
  public static readonly aliases = ['datacloud:delete', 'd360:delete', 'dc:delete'];
  public static readonly summary =
    'Delete exact Data360 DLO, DMO or qualified non-last mapping definitions.';
  public static readonly description =
    'Executes explicit type:ApiName selections without confirmation. Native routes default to API68; explicit numeric pins are preserved. Mapping deletion admits API61..68/default68 (API62..67 assumed compatible): qualified authored identity Text/Number pairs are unmapped first, then the protected-only mapping is deleted. The last mapping for a DMO is blocked before any unmaps; another source must independently cover all five metadata-qualified protected pairs. Full parent schemas and survivor content are checked after each write. Qualification uses empty custom fixtures, not populated-data guarantees. --preview performs zero writes and reports the ordered plan. Any partial failure stops the batch; no local deletion, parent DELETE, retries or rollback.';
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
      summary: 'Exact dlo:Name__dll, dmo:Name__dlm or mapping:ApiName selections only.',
    }),
    'api-version': Flags.string({
      summary: 'Native numeric route >=61, default/auto68; mapping deletion admits61..68.',
    }),
    'data-space': Flags.string({ default: 'default' }),
    preview: Flags.boolean({ default: false, summary: 'Look up and report only; never delete.' }),
  };
  protected createMappingClient = createMappingClient;
  protected preflightDeleteMapping = preflightDeleteNativeMapping;
  protected deleteMapping = deleteNativeMapping;
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
        apiVersion: flags['api-version'] ?? 'auto',
        plugin,
      },
      provenance: { command: 'sf data360 delete', generatedAt: new Date().toISOString() },
      diagnostics: { warnings: [], errors: [] },
      result: { items: [] },
    };
    const selectorsByItem = new Map<DeleteEnvelope['result']['items'][number], string>();
    const finish = (): DeleteEnvelope => {
      if (envelope.status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Delete${flags.preview ? ' preview' : ''}: ${envelope.status}.`);
        for (const item of envelope.result.items) {
          const action =
            item.operation === 'preview'
              ? `Planned ${item.outcome}`
              : item.outcome === 'deleted'
                ? 'Deleted'
                : item.outcome === 'unchanged'
                  ? 'Unchanged'
                  : item.outcome === 'failed'
                    ? 'Failed'
                    : 'Blocked';
          this.log(`${action}: ${selectorsByItem.get(item)}; mutation: ${item.mutation}.`);
          if (item.operation === 'preview')
            for (const step of item.plan ?? [])
              this.log(
                step.operation === 'unmap'
                  ? `Planned field unmap: ${step.sourceFieldDeveloperName} -> ${step.targetFieldDeveloperName}.`
                  : `Planned mapping delete: ${item.identity.apiName}.`,
              );
        }
      }
      return envelope;
    };
    try {
      if (
        !flags.metadata?.length ||
        flags.metadata.some(
          (value) =>
            !(value.startsWith('dlo:') && dloName.test(value.slice(4))) &&
            !(value.startsWith('dmo:') && nativeDmoName.test(value.slice(4))) &&
            !(value.startsWith('mapping:') && nativeMappingName.test(value.slice(8))),
        )
      )
        throw new DloError('INVALID_SELECTION');
      if (flags['data-space'] !== 'default') throw new DloError('INVALID_SCOPE');
      let version: string;
      try {
        version = nativeApiVersion(flags['api-version']);
      } catch {
        throw new DloError('INVALID_SCOPE');
      }
      const selectors = [...new Set(flags.metadata)];
      // Never upgrade explicit pins for the qualified mapping deletion route.
      if (
        selectors.some((selector) => selector.startsWith('mapping:')) &&
        !isNativeMappingDeletionVersion(version)
      )
        throw new NativeMappingError('MAPPING_DELETE_VERSION_UNQUALIFIED');
      const target = await this.resolveTarget(flags['target-org']);
      for (const selector of selectors) {
        const native = selector.startsWith('dmo:');
        const mapping = selector.startsWith('mapping:');
        const apiName = selector.slice(selector.indexOf(':') + 1);
        const baseClient = mapping
          ? (this.createMappingClient ?? createMappingClient)(target, version)
          : native
            ? (this.createDmoClient ?? createDmoClient)(target, version)
            : this.createDloClient(target, version);
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
        selectorsByItem.set(item, selector);
        envelope.result.items.push(item);
        try {
          if (mapping) {
            const mappingBase = baseClient as ReturnType<typeof createMappingClient>;
            const mappingClient = {
              ...client,
              deleteField: async (name: string, observedSelector: string): Promise<void> => {
                dispatched = true;
                await mappingBase.deleteField(name, observedSelector);
              },
            } as ReturnType<typeof createMappingClient>;
            const dependencies = {
              source: (this.createDloClient ?? createDloClient)(target, version),
              target: (this.createDmoClient ?? createDmoClient)(target, version),
            };
            if (flags.preview) {
              const plan = await (this.preflightDeleteMapping ?? preflightDeleteNativeMapping)(
                apiName,
                mappingClient,
                dependencies,
              );
              item.plan = [
                ...plan.removals.map((pair) => ({ operation: 'unmap' as const, apiName, ...pair })),
                { operation: 'delete', apiName },
              ];
            } else
              await (this.deleteMapping ?? deleteNativeMapping)(
                apiName,
                mappingClient,
                dependencies,
              );
          } else {
            const definitionClient = client as ReturnType<typeof createDloClient>;
            if (flags.preview)
              await (native
                ? (this.retrieveDmo ?? retrieveNativeDmo)(apiName, definitionClient)
                : this.retrieveDlo(apiName, definitionClient));
            else
              await (native
                ? (this.deleteDmo ?? deleteNativeDmo)(apiName, definitionClient)
                : this.deleteDlo(apiName, definitionClient));
          }
          item.outcome = flags.preview ? 'delete' : 'deleted';
          if (!flags.preview) item.mutation = 'confirmed-deleted';
        } catch (error) {
          if (
            !dispatched &&
            (error instanceof DloError ||
              error instanceof NativeDmoError ||
              error instanceof NativeMappingError) &&
            !mapping &&
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
          error instanceof DloError ||
          error instanceof NativeDmoError ||
          error instanceof NativeMappingError
            ? error.code
            : 'DELETE_FAILED',
        message:
          'Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.',
        retryable: false,
      });
    }
    return finish();
  }
}
