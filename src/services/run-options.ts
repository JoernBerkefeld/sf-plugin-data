/**
 * Flag misuse the Salesforce CLI refuses while parsing (exit 2, no envelope), raised by the library
 * calls before anything is read: options that cannot be combined or a value the flag does not
 * take. `code` is `INVALID_OPTION`; `exitCode` is the CLI's 2. The message uses the CLI's wording.
 */
export class OptionError extends Error {
  public readonly code = 'INVALID_OPTION';
  public readonly exitCode = 2;

  public constructor(message: string) {
    super(message);
    this.name = 'OptionError';
  }
}

/**
 * Refuse flags that cannot be given together, as oclif's `exclusive` does.
 * @param {Record<string, unknown>} flags Flags with their values (undefined when not given).
 * @param {Array<[string, string]>} pairs Flag names that exclude each other.
 */
export function exclusiveOptions(
  flags: Record<string, unknown>,
  pairs: Array<[string, string]>,
): void {
  for (const [first, second] of pairs)
    if (flags[first] !== undefined && flags[second] !== undefined)
      throw new OptionError(
        `--${first}=${String(flags[first])} cannot also be provided when using --${second}`,
      );
}

/**
 * Run a command and leave `process.exitCode` as it was before.
 * @template T
 * @param {Function} call The command run.
 * @returns {Promise<T>} Its result.
 */
export async function keepExitCode<T>(call: () => Promise<T>): Promise<T> {
  const exitCode = process.exitCode;
  try {
    return await call();
  } finally {
    process.exitCode = exitCode;
  }
}
