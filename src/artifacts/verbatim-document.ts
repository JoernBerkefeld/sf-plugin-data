import { getConnectDiagnostic } from '../transport/connect-diagnostic.js';

/**
 * The normal document kind of each family. A verbatim document carries the kind of the document
 * it stands in for, so it lives at the same path and a later retrieve replaces it cleanly.
 */
export type VerbatimKind =
  | 'dlo'
  | 'dmo'
  | 'mapping'
  | 'relationship'
  | 'data-stream'
  | 'data-transform'
  | 'native-data-graph'
  | 'calculated-insight'
  | 'identity-resolution'
  | 'segment';

/**
 * An org object written as Salesforce returned it, because the plugin cannot represent it.
 * `native` is the raw GET response with its keys sorted recursively. Deploy never sends it.
 */
export type VerbatimDocument = {
  schemaVersion: 1;
  kind: VerbatimKind;
  identity: { dataSpace: string; apiName: string };
  verbatim: { reason: string; native: unknown };
};

const kinds = new Set<string>([
  'dlo',
  'dmo',
  'mapping',
  'relationship',
  'data-stream',
  'data-transform',
  'native-data-graph',
  'calculated-insight',
  'identity-resolution',
  'segment',
]);
// File-name safe: no separators, dots or spaces, so the normal path stays inside its folder.
const safeName = /^[A-Za-z0-9_]{1,255}$/u;
const safeReason = /^[A-Z][A-Z0-9_]{0,99}$/u;
// Codes that stay item failures: HTTP errors, absence, identity/target mismatch, dependency
// binding, and the selection, scope and output checks around the projection.
const itemFailure =
  /NOT_FOUND|MISMATCH|IDENTITY_CHANGED|DEPENDENCY|TARGET_ORG|HTTP|RUNTIME_UNKNOWN|INVALID_SCOPE|INVALID_SELECTION|INVALID_PROJECT|UNSAFE|OUTPUT|OVERWRITE|PARTIAL|COLLISION|LIMIT_EXCEEDED|ACQUISITION_FAILED|RETRIEVE_FAILED/u;

type Bag = Record<string, unknown>;

/**
 * How strictly a document is checked: `deploy` (the default everywhere) admits only what the
 * plugin can send; `retrieve` keeps what the org returned and checks only what names and places
 * the file, so the deploy of such a file refuses and names the key.
 */
export type DocumentMode = 'retrieve' | 'deploy';

/**
 * Whether a value is a plain JSON object.
 * @param {unknown} value Candidate.
 * @returns {boolean} Object and not an array.
 */
function isBag(value: unknown): value is Bag {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether an object has exactly these own keys.
 * @param {Bag} value Object.
 * @param {string[]} keys Expected keys.
 * @returns {boolean} Exact key set.
 */
function exactKeys(value: Bag, keys: string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * A copy of a JSON value with the keys of every object sorted; array order is kept.
 * @param {unknown} value JSON value.
 * @returns {unknown} Copy with sorted keys.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sortKeysDeep(entry));
  if (!isBag(value)) return value;
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh key array within the ES2022 library target.
  const keys = Object.keys(value).sort();
  return Object.fromEntries(keys.map((key) => [key, sortKeysDeep(value[key])]));
}

/**
 * Whether a value is a verbatim document, optionally of one kind.
 * @param {unknown} value Candidate.
 * @param {VerbatimKind} [kind] Required kind.
 * @returns {boolean} Exact verbatim shape.
 */
export function isVerbatimDocument(value: unknown, kind?: VerbatimKind): value is VerbatimDocument {
  if (!isBag(value) || !exactKeys(value, ['schemaVersion', 'kind', 'identity', 'verbatim']))
    return false;
  const { identity, verbatim } = value;
  return (
    value.schemaVersion === 1 &&
    typeof value.kind === 'string' &&
    kinds.has(value.kind) &&
    (kind === undefined || value.kind === kind) &&
    isBag(identity) &&
    exactKeys(identity, ['dataSpace', 'apiName']) &&
    typeof identity.dataSpace === 'string' &&
    safeName.test(identity.dataSpace) &&
    typeof identity.apiName === 'string' &&
    safeName.test(identity.apiName) &&
    isBag(verbatim) &&
    exactKeys(verbatim, ['reason', 'native']) &&
    typeof verbatim.reason === 'string' &&
    safeReason.test(verbatim.reason)
  );
}

/**
 * Build a verbatim document, or undefined when the name, data space or reason is unusable (the
 * item then stays a failure).
 * @param {VerbatimKind} kind Normal document kind.
 * @param {object} identity Normal identity.
 * @param {string} identity.dataSpace Data space.
 * @param {string} identity.apiName API name.
 * @param {string} reason Error code of the refused projection.
 * @param {unknown} native Raw GET response.
 * @returns {VerbatimDocument | undefined} Document with sorted native keys.
 */
export function createVerbatimDocument(
  kind: VerbatimKind,
  identity: { dataSpace: string; apiName: string },
  reason: string,
  native: unknown,
): VerbatimDocument | undefined {
  const document = {
    schemaVersion: 1 as const,
    kind,
    identity: { dataSpace: identity.dataSpace, apiName: identity.apiName },
    // eslint-disable-next-line unicorn/no-null -- An empty response is written as JSON null.
    verbatim: { reason, native: sortKeysDeep(native ?? null) },
  };
  return isVerbatimDocument(document) ? document : undefined;
}

/**
 * File bytes of a verbatim document: two-space JSON with a final line break.
 * @param {VerbatimDocument} document Verbatim document.
 * @returns {string} JSON text.
 */
export function serializeVerbatimDocument(document: VerbatimDocument): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: document.kind,
      identity: { dataSpace: document.identity.dataSpace, apiName: document.identity.apiName },
      verbatim: {
        reason: document.verbatim.reason,
        native: sortKeysDeep(document.verbatim.native),
      },
    },
    undefined,
    2,
  )}\n`;
}

/**
 * The verbatim document in JSON text, if it is one.
 * @param {string} text File text.
 * @returns {VerbatimDocument | undefined} Verbatim document, or undefined for anything else.
 */
export function parseVerbatimDocument(text: string): VerbatimDocument | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isVerbatimDocument(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Family name of a kind, as selectors and messages use it.
 * @param {VerbatimKind} kind Document kind.
 * @returns {string} Family such as `data-graph`.
 */
export function verbatimFamily(kind: VerbatimKind): string {
  return kind === 'native-data-graph' ? 'data-graph' : kind;
}

/**
 * Why deploy and publish refuse a verbatim file that was named explicitly.
 * @param {VerbatimDocument} document Verbatim document.
 * @returns {string} Message naming kind, name and reason.
 */
export function verbatimRefusalMessage(document: VerbatimDocument): string {
  return `The ${verbatimFamily(document.kind)} ${document.identity.apiName} was retrieved as-is (verbatim, reason ${document.verbatim.reason}) because the plugin cannot represent it, so it cannot be deployed or published. Change it in the org, or deploy a file the plugin can represent.`;
}

/**
 * Warning for a verbatim file that a folder or Git-range deploy left out.
 * @param {VerbatimDocument} document Verbatim document.
 * @param {string} file File path.
 * @returns {string} Warning text.
 */
export function verbatimSkipWarning(document: VerbatimDocument, file: string): string {
  return `Skipped ${file}: the ${verbatimFamily(document.kind)} ${document.identity.apiName} was retrieved as-is (verbatim, reason ${document.verbatim.reason}) and cannot be deployed.`;
}

const carried = new WeakMap<object, { native: unknown }>();

/**
 * Remember the raw GET response an object (a projected document, an acquisition or an error) was
 * built from, so a later projection or validation failure can still write it verbatim.
 * @template T
 * @param {T} carrier Object.
 * @param {unknown} native Raw GET response.
 * @returns {T} The same object.
 */
export function carryNativeResponse<T>(carrier: T, native: unknown): T {
  if (carrier && typeof carrier === 'object') carried.set(carrier, { native });
  return carrier;
}

/**
 * The raw GET response remembered for an object.
 * @param {unknown} carrier Object.
 * @returns {{native: unknown} | undefined} Response, or undefined when none was remembered.
 */
export function carriedNativeResponse(carrier: unknown): { native: unknown } | undefined {
  return carrier && typeof carrier === 'object' ? carried.get(carrier) : undefined;
}

/** The raw GET responses read through wrapped clients, by name. */
export type NativeReadRecorder = {
  /** Wrap a client; its first successful `get` of each name is remembered. */
  wrap: <T>(client: T) => T;
  nativeOf: (name: string) => { native: unknown } | undefined;
};

/**
 * Remember the first successful `get` of each name through the clients it wraps. A client
 * without `get` is returned unchanged; every other member is reached through the prototype.
 * @param {(response: unknown) => {native: unknown} | undefined} [pick] The raw response inside
 * a read result, or undefined when the read did not succeed.
 * @returns {NativeReadRecorder} Recorder.
 */
export function nativeReadRecorder(
  pick: (response: unknown) => { native: unknown } | undefined = (response) => ({
    native: response,
  }),
): NativeReadRecorder {
  const reads = new Map<string, { native: unknown }>();
  const wrap = <T>(client: T): T => {
    if (!client || typeof client !== 'object') return client;
    const original = (client as { get?: unknown }).get;
    if (typeof original !== 'function') return client;
    const wrapped = Object.create(client as object) as Record<string, unknown>;
    wrapped.get = async (name: unknown, ...rest: unknown[]): Promise<unknown> => {
      const response: unknown = await (original as (...values: unknown[]) => Promise<unknown>).call(
        client,
        name,
        ...rest,
      );
      if (typeof name === 'string' && !reads.has(name)) {
        const picked = pick(response);
        if (picked) reads.set(name, picked);
      }
      return response;
    };
    return wrapped as T;
  };
  return { wrap, nativeOf: (name) => reads.get(name) };
}

/**
 * Wrap one read client so the first successful `get` of each name is remembered.
 * @template T
 * @param {T} client Read client.
 * @param {(response: unknown) => {native: unknown} | undefined} [pick] The raw response inside
 * a read result, or undefined when the read did not succeed.
 * @returns {{client: T; nativeOf: (name: string) => {native: unknown} | undefined}} Wrapped client.
 */
export function recordNativeReads<T>(
  client: T,
  pick?: (response: unknown) => { native: unknown } | undefined,
): { client: T; nativeOf: (name: string) => { native: unknown } | undefined } {
  const recorder = nativeReadRecorder(pick);
  return { client: recorder.wrap(client), nativeOf: recorder.nativeOf };
}

/**
 * The reason a failed projection or validation is written verbatim: the error's code. HTTP
 * errors, absence, identity/target mismatch, scope, selection and output failures, and errors
 * without a code stay item failures.
 * @param {unknown} error Caught error.
 * @returns {string | undefined} Reason code, or undefined when the item stays a failure.
 */
export function verbatimReason(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name === 'ConnectError') return undefined;
  const { code, status, statusCode } = error as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  if (typeof status === 'number' || typeof statusCode === 'number') return undefined;
  if (getConnectDiagnostic(error)) return undefined;
  if (typeof code !== 'string' || !safeReason.test(code) || itemFailure.test(code))
    return undefined;
  return code;
}

/**
 * Identity of the file a writer is about to replace: the strict document's when it validates,
 * otherwise a verbatim file's or a non-strict JSON object's (`{}` when it names none). Text that
 * is not a JSON object is refused with the strict validator's error.
 * @param {string} text Existing file text.
 * @param {(value: unknown) => {dataSpace?: string; apiName?: string}} strict Strict validator,
 * returning the identity.
 * @returns {{dataSpace?: string; apiName?: string}} Identity of the existing file.
 */
export function previousIdentity(
  text: string,
  strict: (value: unknown) => { dataSpace?: string; apiName?: string },
): { dataSpace?: string; apiName?: string } {
  const value: unknown = JSON.parse(text);
  try {
    return strict(value);
  } catch (error) {
    if (!isBag(value)) throw error;
    const { identity } = value;
    if (!isBag(identity)) return {};
    return {
      ...(typeof identity.dataSpace === 'string' ? { dataSpace: identity.dataSpace } : {}),
      ...(typeof identity.apiName === 'string' ? { apiName: identity.apiName } : {}),
    };
  }
}
