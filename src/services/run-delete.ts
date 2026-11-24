import path from 'node:path';
import type { Config, Interfaces } from '@oclif/core';
import type { Connection } from '@salesforce/core';
import Delete from '../commands/data360/delete.js';
import type { DeleteEnvelope } from '../commands/data360/delete.js';
import { nativeApiVersion } from '../transport/api-version.js';
import { openBoundSsot } from '../transport/bound-ssot.js';
import type { BoundSsot } from '../transport/bound-ssot.js';
import { createNativeDloDeleteClient } from '../transport/dlo-native-rest.js';
import { createNativeDmoDeleteClient } from '../transport/dmo-native-rest.js';
import { createDmoClient } from '../transport/dmo-rest.js';
import { exclusiveOptions, keepExitCode } from './run-options.js';
import type { OptionError } from './run-options.js';

/** The flags of `sf data360 delete`, for a caller that holds its own Connection. */
export type DeleteOptions = {
  /** `--preview`: look up and report only, nothing deleted; default false. */
  preview?: boolean;
  /** Selectors (`-m`), e.g. `dlo:Name__dll`; not with `changedSince`. */
  metadata?: string[];
  /** `--changed-since`: Git reference; deletes the components whose files were deleted since. */
  changedSince?: string;
  /** Run data space (`--dataspace`); default `default`. */
  dataspace?: string;
  /** `--api-version`; default `auto`. */
  apiVersion?: string;
  /** Project root holding data360/ and the Git repository; default the current directory. */
  projectDir?: string;
  /** `--delete-dlo` (data streams only); default false. */
  deleteDlo?: boolean;
  /** `--field`: custom fields removed from the one selected `dmo:Name__dlm`. */
  field?: string[];
  /** `--keep-local-files`; default false (a confirmed deletion removes its local file). */
  keepLocalFiles?: boolean;
  /** `--output-dir` (with `field` only), relative to `projectDir`; default `projectDir`. */
  outputDir?: string;
};

type DeleteFlags = Interfaces.InferredFlags<typeof Delete.flags>;

/**
 * The flags the CLI would parse from these options, with every CLI default and `--no-prompt`:
 * the caller confirmed the delete. Flag misuse oclif refuses with exit 2 throws OptionError.
 * @param {DeleteOptions} options Library options.
 * @returns {DeleteFlags} Parsed flags.
 */
function deleteFlags(options: DeleteOptions): DeleteFlags {
  const listed = (values?: string[]): string[] | undefined =>
    values && values.length > 0 ? values : undefined;
  const flags = {
    'target-org': undefined,
    metadata: listed(options.metadata),
    'api-version': options.apiVersion,
    dataspace: options.dataspace,
    preview: options.preview ?? false,
    'changed-since': options.changedSince,
    'no-prompt': true,
    'delete-dlo': options.deleteDlo ?? false,
    field: listed(options.field),
    'output-dir': options.outputDir,
    'keep-local-files': options.keepLocalFiles ?? false,
  };
  exclusiveOptions(flags, [['changed-since', 'metadata']]);
  return flags as DeleteFlags;
}

/** The delete command over a Connection the caller holds; it never prints, prompts or exits. */
class ConnectionDelete extends Delete {
  // The caller's Connection is the target org; the delete services run at API 68.0.
  protected resolveConnection = async (): Promise<Connection> => {
    this.connection.setApiVersion('68.0');
    return this.connection;
  };

  protected streamConnection = async (): Promise<Connection> => this.connection;

  // Every bound SSOT request (and its Metadata API reads/updates) goes over the caller's Connection.
  protected createMappingSender = (target: string, version: string): BoundSsot =>
    this.bound(target, version);
  protected createRelationshipSender = (target: string, version: string): BoundSsot =>
    this.bound(target, version);
  protected createDataSpaceSender = (target: string, version: string): BoundSsot =>
    this.bound(target, version);
  protected createDmoNativeDeleteClient = (
    target: string,
    apiVersion?: string,
  ): ReturnType<typeof createNativeDmoDeleteClient> =>
    createNativeDmoDeleteClient(target, apiVersion, async () => this.connection);
  protected createDloNativeDeleteClient = (
    target: string,
    apiVersion?: string,
  ): ReturnType<typeof createNativeDloDeleteClient> =>
    createNativeDloDeleteClient(target, apiVersion, async () => this.connection);
  // Field-level delete: reads on the caller's Connection; the removal itself is the CLI child.
  protected createDmoClient = (
    ...[target, apiVersion, runner, sender, listed]: Parameters<typeof createDmoClient>
  ): ReturnType<typeof createDmoClient> =>
    createDmoClient(
      target,
      apiVersion,
      runner,
      sender ?? this.bound(target, nativeApiVersion(apiVersion)),
      listed,
    );

  public constructor(
    private readonly connection: Connection,
    private readonly flagValues: DeleteFlags,
    private readonly root: string,
  ) {
    // No oclif configuration: the command is never parsed, logged or rendered here.
    super([], {} as Config);
  }

  public jsonEnabled(): boolean {
    return true;
  }

  protected projectDirectory(): string {
    return this.root;
  }

  // The flags as the CLI would have parsed them; never is assignable to oclif's generic result.
  protected async parse(): Promise<never> {
    return { flags: this.flagValues } as never;
  }

  /**
   * A bound sender over the caller's Connection.
   * @param {string} target Username of the Connection.
   * @param {string} version Numeric API version of the routes.
   * @returns {BoundSsot} Sender.
   */
  private bound(target: string, version: string): BoundSsot {
    return openBoundSsot(target, version, async () => this.connection);
  }
}

/**
 * Run `sf data360 delete` over a Connection the caller holds and return its envelope (what
 * `--json` shows). It never asks: the caller confirmed the delete (as `--no-prompt`). Nothing is
 * printed and `process.exitCode` is left alone; use exitCodeOf on the envelope for the Salesforce
 * CLI exit code. A refusal is returned as a blocked envelope, not thrown. The delete services run
 * at API 68.0 on the Connection; its API version is restored afterwards.
 *
 * Every REST and Metadata API call goes over the given Connection. The one exception: a mapping
 * delete and a field-level delete (`field`) send their Metadata API destructive change through
 * the Salesforce CLI child `sf project deploy start -o <username>`, so they need a global `sf`
 * and a stored sf CLI authorization for the Connection's username.
 * @param {Connection} connection Authenticated @salesforce/core Connection of the target org.
 * @param {DeleteOptions} [options] The command's flags.
 * @returns {Promise<DeleteEnvelope>} The delete envelope.
 * @throws {OptionError} For flag misuse the CLI refuses at parse time (exit 2): `changedSince`
 * with `metadata`.
 */
export async function runDelete(
  connection: Connection,
  options: DeleteOptions = {},
): Promise<DeleteEnvelope> {
  const flags = deleteFlags(options);
  const root = path.resolve(options.projectDir ?? process.cwd());
  const version = connection.getApiVersion();
  try {
    return await keepExitCode(async () => new ConnectionDelete(connection, flags, root).run());
  } finally {
    connection.setApiVersion(version);
  }
}
