import path from 'node:path';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Org } from '@salesforce/core';
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
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
    }>;
  };
};

/** Retrieve selected DMO configuration through existing service-owned capability checks. */
export default class Retrieve extends SfCommand<RetrieveEnvelope> {
  public static readonly summary = 'Retrieve Data360 DMOs into a local project.';
  public static readonly description =
    'Repeat -m dmo:ApiName for exact selection, use -m dmo for all DMOs in the selected space, or omit selectors for all implemented families (currently DMO only). Unsupported objects produce per-object diagnostics and a nonzero aggregate while successful files are retained. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; defaults to the configured target org.',
    }),
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
      summary: 'Repeat dmo[:ApiName]; omitted selectors retrieve all implemented families.',
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

  protected acquire = retrieveDmo;
  protected selectDocuments = selectDmos;
  protected resolveOrg = (aliasOrUsername?: string): Promise<Org> =>
    Org.create({ aliasOrUsername });
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
    try {
      validateDmoSelection(selectors, flags['api-version'], flags['data-space']);
    } catch (error: unknown) {
      return finish(
        'blocked',
        error instanceof DmoRetrieveError ? error.code : 'INVALID_SELECTION',
      );
    }
    let org: Org;
    try {
      org = await this.resolveOrg(flags['target-org']);
    } catch {
      return finish('blocked', 'TARGET_ORG_REQUIRED');
    }
    let failed = false;
    const diagnose = (error: unknown, apiName?: string): void => {
      let code = 'RETRIEVE_FAILED';
      if (
        error instanceof DmoWriteError ||
        error instanceof DmoRetrieveError ||
        error instanceof ConnectError
      )
        code = error.code;
      else if (error instanceof DmoDocumentError) code = 'UNSUPPORTED_DMO_DOCUMENT';
      else failed = true;
      if (
        code === 'OUTPUT_FAILED' ||
        error instanceof ConnectError ||
        code === 'ACQUISITION_FAILED'
      )
        failed = true;
      envelope.diagnostics.errors.push({
        code,
        message: apiName
          ? 'This DMO was not retrieved. Resolve its capability, acquisition or output diagnostic.'
          : 'DMO inventory could not be resolved completely; no files were written.',
        retryable: false,
        ...(apiName ? { identity: { dataSpace: flags['data-space'], apiName } } : {}),
      });
    };
    try {
      envelope.provenance.sourceOrgId = org.getOrgId();
      const connection = org.getConnection(flags['api-version']);
      const names = await this.selectDocuments(
        connection,
        selectors,
        flags['api-version'],
        flags['data-space'],
      );
      envelope.result.selection = names.map((name) => `dmo:${name}`);
      for (const apiName of names) {
        try {
          const projection = await this.acquire(
            connection,
            apiName,
            flags['api-version'],
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
