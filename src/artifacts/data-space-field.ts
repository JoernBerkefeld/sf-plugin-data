/**
 * The `c__dataSpace` key of a plugin file: the data space (or, for a DLO, the data spaces) the
 * component belongs to. It replaces `identity.dataSpace`; pre-alpha, so a file that still has the
 * old key is refused instead of migrated.
 */
export const dataSpaceKey = 'c__dataSpace';

/** Builds the family's refusal for a key path of the file. */
export type DataSpaceRefusal = (code: string, keyPath: string, problem: string) => Error;

/**
 * Whether a value is a usable data space name: non-empty, without surrounding blanks or control
 * characters. Whether the org knows it is checked live, once per command.
 * @param {unknown} value Untrusted value.
 * @returns {boolean} Usable name.
 */
export function isDataSpaceName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value === value.trim() &&
    ![...value].some(
      (character) => character.codePointAt(0)! < 32 || character.codePointAt(0)! === 127,
    )
  );
}

/**
 * Refuse the old `identity.dataSpace` key (files are not migrated).
 * @param {Record<string, unknown>} identity The `identity` object of the file.
 * @param {DataSpaceRefusal} refuse Family refusal.
 */
export function refuseLegacyDataSpace(
  identity: Record<string, unknown>,
  refuse: DataSpaceRefusal,
): void {
  if (Object.hasOwn(identity, 'dataSpace'))
    throw refuse(
      'LEGACY_DATASPACE_KEY',
      'identity.dataSpace',
      `is the old place of the data space; move it to the top-level key ${dataSpaceKey}, or retrieve the component again`,
    );
}

/**
 * Read the single data space of a file (every type except DLOs and streams).
 * @param {Record<string, unknown>} document The file.
 * @param {DataSpaceRefusal} refuse Family refusal.
 * @returns {string} The data space name.
 */
export function readSingleDataSpace(
  document: Record<string, unknown>,
  refuse: DataSpaceRefusal,
): string {
  const value = document[dataSpaceKey];
  if (!isDataSpaceName(value))
    throw refuse('INVALID_DATASPACE_FIELD', dataSpaceKey, 'must be a data space name');
  return value;
}

/**
 * Read the data space list of a DLO (or stream) file: at least one entry, each a data space
 * name, none repeated. An entry `{ "name": …, "filter": … }` (a filtered membership) is
 * recognised but refused until a live round-trip of a filter is proven.
 * @param {Record<string, unknown>} document The file.
 * @param {DataSpaceRefusal} refuse Family refusal.
 * @returns {string[]} The data space names, in file order.
 */
export function readDataSpaceList(
  document: Record<string, unknown>,
  refuse: DataSpaceRefusal,
): string[] {
  const value = document[dataSpaceKey];
  if (!Array.isArray(value))
    throw refuse('INVALID_DATASPACE_FIELD', dataSpaceKey, 'must be a list of data space names');
  if (value.length === 0)
    throw refuse('INVALID_DATASPACE_FIELD', dataSpaceKey, 'must list at least one data space');
  const names: string[] = [];
  for (const [index, entry] of value.entries()) {
    const at = `${dataSpaceKey}[${index}]`;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const keys = Object.keys(entry);
      if (keys.includes('name') && keys.includes('filter') && keys.length === 2)
        throw refuse(
          'UNSUPPORTED_DATASPACE_FILTER',
          at,
          'is a filtered membership, which the plugin does not deploy yet',
        );
    }
    if (!isDataSpaceName(entry))
      throw refuse('INVALID_DATASPACE_FIELD', at, 'must be a data space name');
    if (names.includes(entry))
      throw refuse('INVALID_DATASPACE_FIELD', at, 'repeats another data space of the list');
    names.push(entry);
  }
  return names;
}

/**
 * The deterministic file order of a data space list: sorted by code point.
 * @param {Iterable<string>} names Data space names.
 * @returns {string[]} Sorted copy without repeats.
 */
export function sortedDataSpaces(names: Iterable<string>): string[] {
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh copy within the ES2022 library target.
  return [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The identity a result item reports for a document: its API name and its data space, from
 * `c__dataSpace` when the file names one, otherwise from `identity.dataSpace` (the kinds not
 * converted yet), otherwise (a DLO: no single data space in its file) the run's data space.
 * @param {object} document Document or verbatim document.
 * @param {object} document.identity Its identity.
 * @param {string} document.identity.apiName API name.
 * @param {string} [document.identity.dataSpace] Data space, when the file keeps it there.
 * @param {unknown} [document.c__dataSpace] The file's c__dataSpace (a text for a single space).
 * @param {string} dataSpace The run's data space.
 * @returns {{dataSpace: string; apiName: string}} Reported identity.
 */
export function reportedIdentity(
  document: { identity: { apiName: string; dataSpace?: string }; c__dataSpace?: unknown },
  dataSpace: string,
): { dataSpace: string; apiName: string } {
  return {
    dataSpace:
      typeof document.c__dataSpace === 'string'
        ? document.c__dataSpace
        : (document.identity.dataSpace ?? dataSpace),
    apiName: document.identity.apiName,
  };
}
