import { ConnectError } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import type { BoundSsot } from '../transport/bound-ssot.js';
import { isDataSpaceName, sortedDataSpaces } from '../artifacts/data-space-field.js';
import { explainInput, printableKey } from './operation-diagnostic.js';

/** Opens the command's shared bound sender (resolving the target org) on first use. */
export type DataSpaceSender = () => Promise<Pick<BoundSsot, 'request'>>;

/** Payload-free refusal of the data space check. */
export class DataSpaceError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(`Data space check refused: ${code}.`);
    this.name = 'DataSpaceError';
  }
}

/** The route of the org's data space list (proven live on API 68, DB entry data360:dataspace-*). */
const dataSpacesRoute = '/services/data/v68.0/ssot/data-spaces';
const pageSize = 50;
// More pages than any org has data spaces; a server that keeps answering stops the read.
const pageLimit = 40;

/**
 * One data space of the org: its name, its label (the name when the list gives none) and, for
 * every space but `default`, the prefix Salesforce gives the copies of standard DMOs in it (`ds2`
 * for `ds2_Individual__dlm`). Only this route names the prefix (live API 68, DB entries
 * data360:dataspace-name-spelling-api68 and data360:dataspace-list-fields-api68).
 */
export type OrgDataSpace = { name: string; label: string; prefix?: string };

/**
 * Read the names of every data space of the org with `GET /ssot/data-spaces`, page by page
 * (`batchSize` and `offset`) until `totalSize` names are read. Anything else is not a complete
 * list: DATASPACE_READ_FAILED. A failure to open the sender (no target org) is thrown as it is.
 * @param {DataSpaceSender} open Opens the command's shared bound sender.
 * @returns {Promise<string[]>} Data space names.
 */
export async function readOrgDataSpaces(open: DataSpaceSender): Promise<string[]> {
  const entries = await readOrgDataSpaceEntries(open);
  return entries.map((entry) => entry.name);
}

/**
 * Read every data space of the org as readOrgDataSpaces does, keeping each one's label (the name
 * when the entry has no usable label) and its prefix when it names a usable one (letters and
 * digits).
 * @param {DataSpaceSender} open Opens the command's shared bound sender.
 * @returns {Promise<OrgDataSpace[]>} Data spaces.
 */
export async function readOrgDataSpaceEntries(open: DataSpaceSender): Promise<OrgDataSpace[]> {
  const sender = await open();
  const names: OrgDataSpace[] = [];
  for (let page = 0; page < pageLimit; page++) {
    let response: unknown;
    try {
      response = await sender.request(
        'GET',
        `${dataSpacesRoute}?batchSize=${pageSize}&offset=${names.length}`,
      );
    } catch (error) {
      // An expired or refused session keeps its own code; it is not a list problem.
      if (error instanceof ConnectError && error.code === 'AUTHENTICATION_FAILED') throw error;
      const status = error instanceof ConnectError ? error.statusCode : undefined;
      throw retainConnectDiagnostic(
        new DataSpaceError('DATASPACE_READ_FAILED', status),
        getConnectDiagnostic(error),
      );
    }
    const body = response as { dataSpaces?: unknown; totalSize?: unknown } | null;
    const entries = body?.dataSpaces;
    const total = body?.totalSize;
    if (
      !Array.isArray(entries) ||
      typeof total !== 'number' ||
      !Number.isSafeInteger(total) ||
      total < names.length + entries.length
    )
      throw new DataSpaceError('DATASPACE_READ_FAILED');
    for (const entry of entries) {
      const { name, label, prefix } = (entry ?? {}) as {
        name?: unknown;
        label?: unknown;
        prefix?: unknown;
      };
      if (!isDataSpaceName(name)) throw new DataSpaceError('DATASPACE_READ_FAILED');
      // A label is printed as it is: one without text or with control characters is not used.
      const shown =
        // eslint-disable-next-line no-control-regex -- control characters are refused, not matched
        typeof label === 'string' && label.trim() && !/[\u0000-\u001F\u007F]/u.test(label)
          ? label
          : name;
      names.push(
        typeof prefix === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/u.test(prefix)
          ? { name, label: shown, prefix }
          : { name, label: shown },
      );
    }
    if (names.length === total) return names;
    if (entries.length === 0) break;
  }
  throw new DataSpaceError('DATASPACE_READ_FAILED');
}

/**
 * Reads the org's data spaces; tests replace `read` with an offline fake, which may answer plain
 * names (no labels, no prefixes).
 */
export const dataSpaceDirectory: {
  read: (open: DataSpaceSender) => Promise<Array<string | OrgDataSpace>>;
} = { read: readOrgDataSpaceEntries };

/**
 * The code a command reports when its data space check stops it: the check's own code, otherwise
 * the code the failure carries (an expired session, for example), otherwise the fallback.
 * @param {unknown} error Failure of the check.
 * @param {string} fallback Code for a failure without one.
 * @returns {string} Diagnostic code.
 */
export function dataSpaceCheckCode(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/u.test(code)
    ? code
    : fallback;
}

const commandChecks = new WeakMap<object, DataSpaceCheck>();

/**
 * The data space check of one command run, created on first use.
 * @param {object} run The running command.
 * @param {DataSpaceSender} sender Opens the command's shared bound sender on first use.
 * @returns {DataSpaceCheck} The run's check.
 */
export function dataSpaceCheckOf(run: object, sender: DataSpaceSender): DataSpaceCheck {
  let check = commandChecks.get(run);
  if (!check) {
    check = new DataSpaceCheck(sender);
    commandChecks.set(run, check);
  }
  return check;
}

/**
 * The live data space check of one command run: the org's list is read once, on first use, and
 * reused for every item and type the command carries.
 */
export class DataSpaceCheck {
  private known?: Promise<OrgDataSpace[]>;

  /**
   * @param {DataSpaceSender} sender Opens the command's shared bound sender on first use.
   */
  public constructor(private readonly sender: DataSpaceSender) {}

  /**
   * Refuse with UNKNOWN_DATASPACE when a named data space is not in the org.
   * @param {Iterable<string>} spaces The run's data space and every space a selected file names.
   * @returns {Promise<void>} Resolves when every one exists.
   */
  public async require(spaces: Iterable<string>): Promise<void> {
    const entries = await this.spaces();
    const known = entries.map((entry) => entry.name);
    const unknown = sortedDataSpaces([...spaces].filter((space) => !known.includes(space)));
    if (unknown.length > 0)
      throw explainInput(
        new DataSpaceError('UNKNOWN_DATASPACE'),
        `The org has no data space named ${unknown.map((space) => printableKey(space)).join(', ')}; its data spaces are ${sortedDataSpaces(
          known,
        )
          .map((space) => printableKey(space))
          .join(', ')}.`,
      );
  }

  /**
   * The prefix of a data space as the org's list names it (the same single read).
   * @param {string} space Data space name.
   * @returns {Promise<string | undefined>} Its prefix, or undefined when the list names none.
   */
  public async prefixOf(space: string): Promise<string | undefined> {
    const entries = await this.spaces();
    return entries.find((entry) => entry.name === space)?.prefix;
  }

  /**
   * Every data space of the org with its prefix (the same single read).
   * @returns {Promise<OrgDataSpace[]>} Data spaces.
   */
  public async entries(): Promise<OrgDataSpace[]> {
    return this.spaces();
  }

  /**
   * The org's data spaces, read once.
   * @returns {Promise<OrgDataSpace[]>} Data spaces.
   */
  private async spaces(): Promise<OrgDataSpace[]> {
    this.known ??= dataSpaceDirectory
      .read(this.sender)
      .then((entries) =>
        entries.map((entry) => (typeof entry === 'string' ? { name: entry, label: entry } : entry)),
      );
    return this.known;
  }
}
