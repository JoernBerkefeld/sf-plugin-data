import path from 'node:path';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import { resolveApiVersion } from '../../transport/api-version.js';
import { DmoDocumentError } from '../../artifacts/dmo-document.js';
import { DmoWriteError, writeDmoDocument } from '../../artifacts/write-other-dmo.js';
import {
  DmoRetrieveError,
  retrieveDmo,
  selectDmos,
  validateDmoSelection,
} from '../../services/retrieve-other-dmo.js';
import { ConnectError } from '../../transport/connect-client.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { SegmentError, segmentName } from '../../artifacts/segment-document.js';
import { writeSegmentDocument } from '../../artifacts/write-segment.js';
import { retrieveSegment } from '../../services/retrieve-segment.js';
import {
  selectRetrieveDependencies,
  RetrieveDependencyError,
} from '../../services/select-retrieve-dependencies.js';
import { DependencySelectionError } from '../../artifacts/dependency-selection.js';
import type { DependencyIdentity, SelectionReason } from '../../artifacts/dependency-selection.js';

export type RetrieveEnvelope = {
  contract: 'sf-data360-retrieve';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: {
    operation: 'retrieve';
    plugin: { name: string; version: string };
    apiVersion: string;
    soapApiVersion?: string;
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{
      code: string;
      message: string;
      retryable: false;
      identity?: { dataSpace: string; apiName: string };
    }>;
  };
  provenance: {
    producer: string;
    sourceOrgId: string | null;
    pluginVersion: string;
    command: string;
    generatedAt: string;
  };
  result: {
    scope: { dataSpace: string; outputDir: string };
    selection: string[];
    dependencies?: Array<{ identity: DependencyIdentity; reason: SelectionReason }>;
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
      companionPath?: string;
      family?: 'segment';
    }>;
  };
};

/** Retrieve selected DMO configuration through existing service-owned capability checks. */
export default class Retrieve extends SfCommand<RetrieveEnvelope> {
  public static readonly aliases = ['datacloud:retrieve', 'd360:retrieve', 'dc:retrieve'];
  public static readonly summary =
    'Retrieve Data360 DMOs or exact DBT Segments into a local project.';
  public static readonly description =
    'Repeat -m dmo:ApiName or -m segment:ApiName for exact selection. Segment supports only the qualified API65/default single-model DBT subset and publishes correlated XML/JSON pairs. Use -m dmo or omit selectors for existing DMO inventory; Segment inventory is unqualified and is not included. Unsupported objects produce per-object diagnostics and a nonzero aggregate while successful files are retained. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; defaults to the configured target org.',
    }),
    'api-version': Flags.orgApiVersion({
      default: '65.0',
      summary: 'Numeric API version or experimental read-only latest (SOAP evidence must be 65.0).',
      parse: async (value, context, options) =>
        value === 'latest' ? value : Flags.orgApiVersion().parse(value, context, options),
    }),
    'data-space': Flags.string({
      default: 'default',
      summary: 'Logical data space (current service supports default).',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary: 'Repeat dmo[:ApiName] or segment:ApiName; omitted selectors retain DMO inventory.',
    }),
    'output-dir': Flags.directory({
      char: 'd',
      exists: false,
      summary: 'Project root for JSON; defaults to the current directory.',
    }),
    'include-dependencies': Flags.boolean({
      default: false,
      summary:
        'Include supported source prerequisites; unsupported dependency acquisition blocks publication.',
    }),
    overwrite: Flags.boolean({
      char: 'x',
      default: false,
      summary: 'Permit replacing differing selected files.',
    }),
  };

  protected acquireSegment = retrieveSegment;
  protected selectDependencies = selectRetrieveDependencies;
  protected writeSegment = writeSegmentDocument;
  protected acquire = retrieveDmo;
  protected selectDocuments = selectDmos;
  protected resolveOrg = async (
    aliasOrUsername?: string,
  ): Promise<Pick<Org, 'getConnection' | 'getOrgId'>> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = aliasOrUsername ?? aggregator.getPropertyValue<string>('target-org');
    const username = target ? state.aliases.resolveUsername(target) : undefined;
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({ username }),
      connectionOptions: { version: '65.0' },
    });
    // Org.create also probes org traits using another unversioned connection; avoid it.
    return {
      getOrgId: () => connection.getAuthInfoFields().orgId!,
      getConnection: (version?: string) => {
        if (version) connection.setApiVersion(version);
        return connection;
      },
    };
  };
  protected writeDocument = writeDmoDocument;

  /**
   * Acquire the complete runtime projection, then publish only its authored candidate.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  public async run(): Promise<RetrieveEnvelope> {
    const { flags } = await this.parse(Retrieve);
    const plugin = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };
    const envelope: RetrieveEnvelope = {
      contract: 'sf-data360-retrieve',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: { operation: 'retrieve', plugin, apiVersion: flags['api-version'] },
      diagnostics: { warnings: [], errors: [] },
      provenance: {
        producer: plugin.name,
        // eslint-disable-next-line unicorn/no-null -- Stable JSON envelope represents unresolved org identity explicitly.
        sourceOrgId: null,
        pluginVersion: plugin.version,
        command: 'sf data360 retrieve',
        generatedAt: new Date().toISOString(),
      },
      result: {
        scope: {
          dataSpace: flags['data-space'],
          outputDir: path.resolve(flags['output-dir'] ?? process.cwd()),
        },
        selection: flags.metadata ?? [],
        items: [],
      },
    };
    const finish = (status: RetrieveEnvelope['status'], code?: string): RetrieveEnvelope => {
      envelope.status = status;
      if (code)
        envelope.diagnostics.errors.push({
          code,
          message:
            'Retrieval did not complete. Check selection, authenticated org, service capability and output path.',
          retryable: false,
        });
      if (status !== 'success') process.exitCode = 1;
      if (!this.jsonEnabled()) {
        this.log(`Retrieve: ${status}${code ? ` (${code})` : ''}.`);
        for (const diagnostic of envelope.diagnostics.errors)
          this.log(
            `${diagnostic.identity ? `dmo:${diagnostic.identity.apiName}: ` : ''}${diagnostic.code}: ${diagnostic.message}`,
          );
      }
      return envelope;
    };
    const selectors = flags.metadata ?? [];
    const segmentSelectors = selectors.filter((value) => value.startsWith('segment:'));
    const dmoSelectors = selectors.filter((value) => !value.startsWith('segment:'));
    try {
      if (selectors.includes('segment')) throw new SegmentError('SEGMENT_INVENTORY_UNQUALIFIED');
      if (segmentSelectors.some((value) => !segmentName.test(value.slice(8))))
        throw new SegmentError('INVALID_SELECTION');
      if (
        segmentSelectors.length > 0 &&
        (flags['api-version'] !== '65.0' || flags['data-space'] !== 'default')
      )
        throw new SegmentError('INVALID_SCOPE');
      // Validate syntax/scope before auth; latest capability evidence arrives after discovery.
      validateDmoSelection(
        dmoSelectors,
        flags['api-version'] === 'latest' ? '65.0' : flags['api-version'],
        flags['data-space'],
      );
    } catch (error: unknown) {
      return finish(
        'blocked',
        error instanceof DmoRetrieveError || error instanceof SegmentError
          ? error.code
          : 'INVALID_SELECTION',
      );
    }
    let org: Pick<Org, 'getConnection' | 'getOrgId'>;
    try {
      org = await this.resolveOrg(flags['target-org']);
    } catch {
      return finish('blocked', 'TARGET_ORG_REQUIRED');
    }
    let failed = false;
    const diagnose = (error: unknown, apiName?: string): void => {
      let code = 'RETRIEVE_FAILED';
      if (
        error instanceof SegmentError ||
        error instanceof DependencySelectionError ||
        error instanceof RetrieveDependencyError ||
        error instanceof DmoWriteError ||
        error instanceof DmoRetrieveError ||
        error instanceof ConnectError
      )
        code = error.code;
      else if (error instanceof DmoDocumentError) code = 'UNSUPPORTED_DMO_DOCUMENT';
      else failed = true;
      if (
        code === 'OUTPUT_FAILED' ||
        code === 'PARTIAL_SEGMENT_OUTPUT' ||
        code === 'SEGMENT_ACQUISITION_FAILED' ||
        code === 'DEPENDENCY_ACQUISITION_FAILED' ||
        code === 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' ||
        error instanceof ConnectError ||
        code === 'ACQUISITION_FAILED'
      )
        failed = true;
      if (error instanceof RetrieveDependencyError) {
        apiName = error.identity.apiName;
        envelope.result.dependencies = [{ identity: error.identity, reason: error.reason }];
      }
      envelope.diagnostics.errors.push({
        code,
        message: apiName
          ? 'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.'
          : 'DMO inventory could not be resolved completely; no files were written.',
        retryable: false,
        ...(apiName ? { identity: { dataSpace: flags['data-space'], apiName } } : {}),
      });
    };
    try {
      envelope.provenance.sourceOrgId = org.getOrgId();
      let selection;
      try {
        selection = await resolveApiVersion(flags['api-version'], async () => {
          // This command owns the initialized connection; suppress refresh replay and redirects.
          const receiver = Object.create(org.getConnection()) as Connection;
          Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
          return receiver.request({ method: 'GET', url: '/services/data' }, {
            retry: { maxRetries: 0 },
            followRedirect: () => {
              throw new Error('Discovery redirect refused.');
            },
          } as unknown as Parameters<Connection['request']>[1]);
        });
      } catch {
        envelope.diagnostics.errors.push({
          code: 'API_VERSION_DISCOVERY_FAILED',
          message:
            'Version discovery failed or returned invalid data. Check org access or use --api-version 65.0.',
          retryable: false,
        });
        return finish('blocked');
      }
      envelope.metadata.soapApiVersion = selection.soapNumeric;
      try {
        validateDmoSelection(dmoSelectors, selection, flags['data-space']);
      } catch {
        envelope.diagnostics.errors.push({
          code: 'INVALID_SCOPE',
          message:
            'DMO support requires numeric SOAP evidence 65.0. Use --api-version 65.0; newer API versions are not qualified.',
          retryable: false,
        });
        return finish('blocked');
      }
      // Pin only this command-owned connection, before any service uses it.
      const connection = org.getConnection(selection.soapNumeric);
      const names =
        segmentSelectors.length > 0 && dmoSelectors.length === 0
          ? []
          : await this.selectDocuments(connection, dmoSelectors, selection, flags['data-space']);
      // eslint-disable-next-line unicorn/no-array-sort -- Deterministic ordering on a new deduplicated array.
      const segments = [...new Set(segmentSelectors.map((value) => value.slice(8)))].sort();
      envelope.result.selection = [
        ...names.map((name) => `dmo:${name}`),
        ...segments.map((name) => `segment:${name}`),
      ];
      if (segments.length > 0 || flags['include-dependencies']) {
        // Acquire and resolve the complete bounded selection before publishing any files.
        const selected = await (this.selectDependencies ?? selectRetrieveDependencies)(
          [
            ...names.map((apiName) => ({
              kind: 'dmo' as const,
              dataSpace: flags['data-space'],
              apiName,
            })),
            ...segments.map((apiName) => ({
              kind: 'segment' as const,
              dataSpace: flags['data-space'],
              apiName,
            })),
          ],
          connection,
          selection,
          flags['include-dependencies'] ?? false,
        );
        if (flags['include-dependencies'])
          envelope.result.dependencies = [...selected.reasons].map(([key, reason]) => {
            const [kind, dataSpace, apiName] = key.split(':');
            return {
              identity: { kind: kind as DependencyIdentity['kind'], dataSpace, apiName },
              reason,
            };
          });
        envelope.result.selection = selected.entries.map(
          ({ document }) => `${document.kind}:${document.identity.apiName}`,
        );
        for (const entry of selected.entries) {
          const { document } = entry;
          try {
            const receipt =
              'definitionXml' in entry
                ? await this.writeSegment(
                    document,
                    entry.definitionXml,
                    flags['output-dir'] ?? process.cwd(),
                    flags.overwrite,
                  )
                : await this.writeDocument(
                    document,
                    flags['output-dir'] ?? process.cwd(),
                    flags.overwrite,
                  );
            envelope.result.items.push({
              identity: { ...document.identity },
              ...(document.kind === 'segment' ? { family: 'segment' as const } : {}),
              operation: 'retrieve',
              ...receipt,
            });
          } catch (error: unknown) {
            diagnose(error, document.identity.apiName);
            // Do not publish dependents after an ambiguous prerequisite output failure.
            break;
          }
        }
        return finish(
          envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
        );
      }
      for (const apiName of names) {
        try {
          const projection = await this.acquire(
            connection,
            apiName,
            selection,
            flags['data-space'],
          );
          if (
            projection.status !== 'projected' ||
            projection.blockers.length > 0 ||
            !projection.candidate
          )
            throw new DmoRetrieveError(projection.blockers[0] ?? 'INCOMPLETE_DMO_PROJECTION');
          if (
            projection.candidate.identity.apiName !== apiName ||
            projection.candidate.identity.dataSpace !== flags['data-space']
          )
            throw new DmoRetrieveError('INVALID_METADATA');
          const receipt = await this.writeDocument(
            projection.candidate,
            flags['output-dir'] ?? process.cwd(),
            flags.overwrite,
          );
          envelope.result.items.push({
            identity: { ...projection.candidate.identity },
            operation: 'retrieve',
            ...receipt,
          });
        } catch (error: unknown) {
          diagnose(error, apiName);
        }
      }
    } catch (error: unknown) {
      diagnose(error);
    }
    return finish(
      envelope.diagnostics.errors.length === 0 ? 'success' : failed ? 'failed' : 'blocked',
    );
  }
}
