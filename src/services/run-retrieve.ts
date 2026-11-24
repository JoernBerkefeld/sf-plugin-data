import type { Config } from '@oclif/core';
import type { Connection, Org } from '@salesforce/core';
import Retrieve from '../commands/data360/retrieve.js';
import type { RetrieveEnvelope } from '../commands/data360/retrieve.js';

/** The flags of `sf data360 retrieve`, for a caller that holds its own Connection. */
export type RetrieveOptions = {
  /** Run data space (`--dataspace`); default `default`. */
  dataspace?: string;
  /** Selectors (`-m`); omitted or empty selects every family. */
  metadata?: string[];
  /** Project root (`--output-dir`); default the current directory. */
  outputDir?: string;
  /** `--api-version`; default `auto`. */
  apiVersion?: string;
};

/** The retrieve command over a Connection the caller holds; it never prints or exits. */
class ConnectionRetrieve extends Retrieve {
  // The caller's Connection answers every family, at the version each family pins.
  protected resolveOrg = async (): Promise<Pick<Org, 'getConnection' | 'getOrgId'>> => ({
    getOrgId: () => this.connection.getAuthInfoFields().orgId!,
    getConnection: (version?: string) => {
      // Only a numeric version reaches the connection; @salesforce/core rejects `auto`.
      if (version && /^[1-9]\d\.0$/u.test(version)) this.connection.setApiVersion(version);
      return this.connection;
    },
  });

  public constructor(private readonly connection: Connection) {
    // No oclif configuration: the command is never parsed, logged or rendered here.
    super([], {} as Config);
  }

  /**
   * Retrieve as the command does with these options.
   * @param {RetrieveOptions} options Flags of the run.
   * @returns {Promise<RetrieveEnvelope>} The envelope the command returns.
   */
  public async retrieveFor(options: RetrieveOptions): Promise<RetrieveEnvelope> {
    return this.retrieveEnvelope({
      'api-version': options.apiVersion ?? 'auto',
      dataspace: options.dataspace,
      metadata: options.metadata,
      'output-dir': options.outputDir,
    });
  }
}

/**
 * Run `sf data360 retrieve` over a Connection the caller holds and return its envelope (what
 * `--json` shows). Nothing is printed and `process.exitCode` is left alone; use exitCodeOf on the
 * envelope for the Salesforce CLI exit code. A local file whose bytes differ from the retrieved
 * component is replaced; identical bytes are left unchanged. The Connection's API version is
 * restored afterwards.
 * @param {Connection} connection Authenticated @salesforce/core Connection of the source org.
 * @param {RetrieveOptions} [options] The command's flags.
 * @returns {Promise<RetrieveEnvelope>} The retrieve envelope.
 */
export async function runRetrieve(
  connection: Connection,
  options: RetrieveOptions = {},
): Promise<RetrieveEnvelope> {
  const version = connection.getApiVersion();
  try {
    return await new ConnectionRetrieve(connection).retrieveFor(options);
  } finally {
    connection.setApiVersion(version);
  }
}
