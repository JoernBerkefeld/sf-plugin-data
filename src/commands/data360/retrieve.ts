import path from 'node:path';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { DmoDocumentError } from '../../artifacts/dmo-document.js';
import { DmoWriteError, writeOtherDmoDocument } from '../../artifacts/write-other-dmo.js';
import { OtherDmoRetrieveError, retrieveOtherDmo } from '../../services/retrieve-other-dmo.js';
import { ConnectError } from '../../transport/connect-client.js';

export type RetrieveEnvelope = {
  contract: 'sf-data360-retrieve';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: {
    operation: 'retrieve';
    plugin: { name: string; version: string };
    apiVersion: string;
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{ code: string; message: string; retryable: false }>;
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
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
    }>;
  };
};

/** Retrieve explicit DMO configuration through existing service-owned capability checks. */
export default class Retrieve extends SfCommand<RetrieveEnvelope> {
  public static readonly summary = 'Retrieve an explicit Data360 DMO into a local project.';
  public static readonly description =
    'Currently supports one explicit -m dmo:ApiName selector through the bounded retrieval service. Type-only, discovery and no-selector retrieval are pending, not permanently excluded. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.optionalOrg(),
    'api-version': Flags.orgApiVersion({
      default: '65.0',
      summary: 'Explicit Salesforce API version (current service supports 65.0).',
    }),
    'data-space': Flags.string({
      default: 'default',
      summary: 'Logical data space (current service supports default).',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary: 'Type[:ApiName]; currently one explicit dmo:ApiName only.',
    }),
    'output-dir': Flags.directory({
      char: 'd',
      exists: false,
      summary: 'Project root for JSON; defaults to the current directory.',
    }),
    overwrite: Flags.boolean({
      char: 'x',
      default: false,
      summary: 'Permit replacing differing selected files.',
    }),
  };

  protected acquire = retrieveOtherDmo;
  protected writeDocument = writeOtherDmoDocument;

  /**
   * Acquire the complete runtime projection, then publish only its authored candidate.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  public async run(): Promise<RetrieveEnvelope> {
    const { flags } = await this.parse(Retrieve);
    const plugin = {
      name: '@joernberkefeld/sf-plugin-data360',
      version: this.config.pjson.version,
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
      if (!this.jsonEnabled()) this.log(`Retrieve: ${status}${code ? ` (${code})` : ''}.`);
      return envelope;
    };
    // Selection shape only: the service owns every schema/profile/version/space capability check.
    const selectors = flags.metadata ?? [];
    if (selectors.length !== 1 || !/^dmo:[^:\s]+$/u.test(selectors[0]))
      return finish('blocked', 'RETRIEVE_SELECTION_NOT_IMPLEMENTED');
    const apiName = selectors[0].slice(4);
    const org = flags['target-org'];
    if (!org) return finish('blocked', 'TARGET_ORG_REQUIRED');
    try {
      envelope.provenance.sourceOrgId = org.getOrgId();
      const projection = await this.acquire(
        org.getConnection(flags['api-version']),
        apiName,
        flags['api-version'],
        flags['data-space'],
      );
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
      return finish('success');
    } catch (error: unknown) {
      if (error instanceof DmoWriteError)
        return finish(error.code === 'OUTPUT_FAILED' ? 'failed' : 'blocked', error.code);
      if (error instanceof OtherDmoRetrieveError || error instanceof ConnectError)
        return finish('blocked', error.code);
      if (error instanceof DmoDocumentError) return finish('blocked', 'UNSUPPORTED_DMO_DOCUMENT');
      return finish('failed', 'RETRIEVE_FAILED');
    }
  }
}
