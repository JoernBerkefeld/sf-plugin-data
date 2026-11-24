import path from 'node:path';
import type { Config, Interfaces } from '@oclif/core';
import type { Connection, Org } from '@salesforce/core';
import Deploy from '../commands/data360/deploy.js';
import type { DeployEnvelope } from '../commands/data360/deploy.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import type { BoundSsot } from '../transport/bound-ssot.js';
import { setRetryWarn } from '../transport/connect-client.js';
import { exclusiveOptions, keepExitCode, OptionError } from './run-options.js';

/** The flags of `sf data360 deploy`, for a caller that holds its own Connection. */
export type DeployOptions = {
  /** `--preview`: read-only comparison, nothing written; default false. */
  preview?: boolean;
  /** Selectors (`-m`), e.g. `dlo:Name__dll`; not with `changedSince`. */
  metadata?: string[];
  /** Files or directories (`--source-dir`), relative to `projectDir`; not with `changedSince`. */
  sourceDir?: string[];
  /** `--changed-since`: Git reference; selects the plugin files changed since its merge base. */
  changedSince?: string;
  /** Run data space (`--dataspace`); default `default`. */
  dataspace?: string;
  /** `--api-version`; default `auto`. */
  apiVersion?: string;
  /** Project root holding data360/ and the Git repository; default the current directory. */
  projectDir?: string;
  /** `--allow-cross-dataspace`; default false. */
  allowCrossDataspace?: boolean;
  /** `--allow-processing`; default false. */
  allowProcessing?: boolean;
  /** `--allow-field-removal`; default false. */
  allowFieldRemoval?: boolean;
  /** `--allow-dataspace-removal`; default false. */
  allowDataspaceRemoval?: boolean;
  /** `--async` (identity resolution only); default false. */
  async?: boolean;
  /** `--draft` (calculated insights only); default false. */
  draft?: boolean;
  /** `--wait` in whole minutes (data graphs only, at least 1); default 30 for each graph. */
  wait?: number;
};

type DeployFlags = Interfaces.InferredFlags<typeof Deploy.flags>;

/**
 * The flags the CLI would parse from these options, with every CLI default; flag misuse oclif
 * refuses with exit 2 throws OptionError.
 * @param {DeployOptions} options Library options.
 * @returns {DeployFlags} Parsed flags.
 */
function deployFlags(options: DeployOptions): DeployFlags {
  const listed = (values?: string[]): string[] | undefined =>
    values && values.length > 0 ? values : undefined;
  const flags = {
    'target-org': undefined,
    'api-version': options.apiVersion ?? 'auto',
    dataspace: options.dataspace,
    'source-dir': listed(options.sourceDir),
    metadata: listed(options.metadata),
    'changed-since': options.changedSince,
    'allow-processing': options.allowProcessing ?? false,
    'allow-field-removal': options.allowFieldRemoval ?? false,
    'allow-cross-dataspace': options.allowCrossDataspace ?? false,
    'allow-dataspace-removal': options.allowDataspaceRemoval ?? false,
    async: options.async ?? false,
    wait: options.wait,
    draft: options.draft ?? false,
    preview: options.preview ?? false,
  };
  exclusiveOptions(flags, [
    ['changed-since', 'source-dir'],
    ['changed-since', 'metadata'],
  ]);
  if (flags['api-version'] !== 'auto' && !/^[1-9]\d\.0$/u.test(flags['api-version']))
    throw new OptionError(`--api-version=${flags['api-version']} is not a valid API version.`);
  if (flags.wait !== undefined && (!Number.isSafeInteger(flags.wait) || flags.wait < 1))
    throw new OptionError(`--wait=${String(flags.wait)} must be a whole number of at least 1.`);
  return flags as DeployFlags;
}

/** The deploy command over a Connection the caller holds; it never prints, prompts or exits. */
class ConnectionDeploy extends Deploy {
  // The caller's Connection is the target org; each family sets the version it pins.
  protected resolveTargetOrg = async (): Promise<
    Pick<Org, 'getConnection' | 'getOrgId' | 'getUsername'>
  > => ({
    getOrgId: () => this.connection.getAuthInfoFields().orgId!,
    getUsername: () => this.connection.getUsername(),
    getConnection: (version?: string) => {
      // Only a numeric version reaches the connection; @salesforce/core rejects `auto`.
      if (version && /^[1-9]\d\.0$/u.test(version)) this.connection.setApiVersion(version);
      return this.connection;
    },
  });

  // Every bound SSOT request (and its Metadata API reads/updates) goes over the caller's Connection.
  protected createSsotSender = (target: string, version: string): BoundSsot =>
    openBoundSsot(target, version, async () => this.connection);

  public constructor(
    private readonly connection: Connection,
    private readonly flagValues: DeployFlags,
    private readonly root: string,
  ) {
    // No oclif configuration: the command is never parsed, logged or rendered here.
    super([], {} as Config);
    // Retries of the requests over the caller's Connection are not printed either.
    setRetryWarn(connection, () => {});
  }

  public jsonEnabled(): boolean {
    return true;
  }

  // Graph readiness progress is not printed.
  protected graphProgress(): void {}

  protected projectDirectory(): string {
    return this.root;
  }

  // The flags as the CLI would have parsed them; never is assignable to oclif's generic result.
  protected async parse(): Promise<never> {
    return { flags: this.flagValues } as never;
  }
}

/**
 * Run `sf data360 deploy` over a Connection the caller holds and return its envelope (what
 * `--json` shows). Nothing is printed, nothing is asked and `process.exitCode` is left alone; use
 * exitCodeOf on the envelope for the Salesforce CLI exit code. A refusal is returned as a blocked
 * envelope, not thrown. The Connection's API version is restored afterwards.
 *
 * Every REST and Metadata API call goes over the given Connection. The one exception: a native
 * DMO field removal (`allowFieldRemoval`) and a mapping pair removal send their Metadata API
 * destructive change through the Salesforce CLI child `sf project deploy start -o <username>`,
 * so they need a global `sf` and a stored sf CLI authorization for the Connection's username.
 * @param {Connection} connection Authenticated @salesforce/core Connection of the target org.
 * @param {DeployOptions} [options] The command's flags.
 * @returns {Promise<DeployEnvelope>} The deploy envelope.
 * @throws {OptionError} For flag misuse the CLI refuses at parse time (exit 2): `changedSince`
 * with `sourceDir` or `metadata`, an `apiVersion` that is neither `auto` nor `NN.0`, a `wait`
 * that is not a whole number of at least 1.
 */
export async function runDeploy(
  connection: Connection,
  options: DeployOptions = {},
): Promise<DeployEnvelope> {
  const flags = deployFlags(options);
  const root = path.resolve(options.projectDir ?? process.cwd());
  const version = connection.getApiVersion();
  try {
    return await keepExitCode(async () => new ConnectionDeploy(connection, flags, root).run());
  } finally {
    connection.setApiVersion(version);
  }
}
