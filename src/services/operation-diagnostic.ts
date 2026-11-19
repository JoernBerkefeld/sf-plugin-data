import { isDeepStrictEqual } from 'node:util';
import {
  diagnosticDataProperty,
  getConnectDiagnostic,
  getMetadataProblems,
} from '../transport/connect-diagnostic.js';
import { registerCauseHint } from '../errors/registry.js';

const details = new WeakMap<Error, string>();
const hints = new WeakMap<Error, string>();
const visibleKeys = new Set([
  'name',
  'apiName',
  'dataSpace',
  'dataSpaceName',
  'connectionName',
  'event',
  'availabilityStatus',
  'availability',
  'status',
  'dataType',
  'datatype',
  'category',
  'isPrimaryKey',
  'isMapped',
  'isDynamicLookup',
  'creationType',
  'usageTag',
  'refreshMode',
  'connectorType',
  'dataStreamType',
  'sourceFieldName',
  'targetFieldName',
  'sourceFieldDeveloperName',
  'targetFieldDeveloperName',
  'sourceEntityDeveloperName',
  'targetEntityDeveloperName',
]);

/**
 * Render only bounded schema identifiers, enums and flags; never raw objects or free text.
 * @param {unknown} value Compared leaf.
 * @param {string} key Leaf property name.
 * @returns {string} Safe diagnostic value.
 */
function safeValue(value: unknown, key: string): string {
  if (value === undefined) return '[missing]';
  if (value === null) return 'null';
  if (!visibleKeys.has(key)) return '[redacted]';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_ -]{0,119}$/u.test(value))
    return JSON.stringify(value);
  return '[redacted]';
}

/**
 * Describe the first concrete mismatch without serializing snapshots or secret-bearing fields.
 * @param {unknown} expected Expected protected state.
 * @param {unknown} observed Freshly observed state.
 * @param {string} path Logical field path supplied by the check.
 * @param {number} [depth] Bounded traversal depth.
 * @returns {string} Safe first differing path and leaf values.
 */
function difference(expected: unknown, observed: unknown, path: string, depth = 0): string {
  if (
    depth < 12 &&
    expected &&
    observed &&
    typeof expected === 'object' &&
    typeof observed === 'object'
  ) {
    const a = expected as Record<string, unknown>;
    const b = observed as Record<string, unknown>;
    if (Array.isArray(expected) && Array.isArray(observed) && expected.length !== observed.length)
      return `${path}.length: expected ${expected.length}; observed ${observed.length}`;
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].slice(0, 500)) {
      if (!isDeepStrictEqual(a[key], b[key])) {
        // Do not blame an admitted native mapping permutation when another field drifted.
        if (key === 'mappings' && Array.isArray(a[key]) && Array.isArray(b[key])) {
          const remaining = [...(b[key] as unknown[])];
          if (
            (a[key] as unknown[]).length === remaining.length &&
            (a[key] as unknown[]).every((entry) => {
              const index = remaining.findIndex((item) => isDeepStrictEqual(entry, item));
              if (index === -1) return false;
              remaining.splice(index, 1);
              return true;
            })
          )
            continue;
        }
        // Unknown keys can themselves contain secrets; never echo them.
        const safeKey =
          visibleKeys.has(key) ||
          /^\d{1,5}$/u.test(key) ||
          [
            'identity',
            'spec',
            'fields',
            'sourceFields',
            'mappings',
            'fieldMappings',
            'binding',
            'target',
            'observed',
            'inventory',
            'dataLakeObjectInfo',
            'dataSpaceInfo',
            'parents',
            'document',
            'body',
            'newDlo',
            'primaryKey',
            'connectorInfo',
            'refreshConfig',
            'source',
            'connectionId',
            'recordId',
            'id',
            'label',
          ].includes(key)
            ? key
            : '[other property]';
        if (safeKey === '[other property]')
          return `${path}.${safeKey}: protected value changed (values redacted)`;
        return difference(a[key], b[key], `${path}.${safeKey}`, depth + 1);
      }
    }
  }
  if (expected && observed && typeof expected === 'object' && typeof observed === 'object')
    return `${path}: protected content differs (values redacted; diagnostic traversal limit or admitted ordering difference)`;
  const key = path.split('.').at(-1)!;
  return `${path}: expected ${safeValue(expected, key)}; observed ${safeValue(observed, key)}`;
}

/**
 * Add an explanation only after the existing safety predicate rejects; never changes its outcome.
 * @template {Error} T
 * @param {T} error Existing typed error and compatibility code.
 * @param {string} check Static operation/check description.
 * @param {unknown} resource Resource API name where independently known.
 * @param {unknown} expected Expected protected state (not retained).
 * @param {unknown} observed Observed protected state (not retained).
 * @param {string} [path] Logical comparison root.
 * @param {string} [hint] Static sentence naming the way forward.
 * @returns {T} The original error with a bounded, safe human explanation.
 */
export function explainMismatch<T extends Error>(
  error: T,
  check: string,
  resource: unknown,
  expected: unknown,
  observed: unknown,
  path = 'state',
  hint?: string,
): T {
  const identity = safeValue(resource, 'apiName');
  const message = `Plugin verification failed during ${check} for ${identity}: ${difference(expected, observed, path)}.${hint ? ` ${hint}` : ''}`;
  details.set(error, message);
  error.message = `${error.message} ${message}`;
  return error;
}

/**
 * Replace the explanation of an already refused operation with complete plugin-built
 * instructions. A text ending in a line break keeps the next action on its own line.
 * @param {Error} error Existing typed refusal; its code and outcome are untouched.
 * @param {string} message Bounded text built only from validated identifiers.
 */
export function replaceExplanation(error: Error, message: string): void {
  details.set(error, message);
}

/**
 * The plugin-built explanation of a refusal, if one was attached.
 * @param {unknown} error Caught error.
 * @returns {string | undefined} Explanation text.
 */
export function explanationOf(error: unknown): string | undefined {
  return error instanceof Error ? details.get(error) : undefined;
}

/**
 * A key of an authored file as it may appear in a message: a plain identifier, otherwise a
 * placeholder, so free text in a key is never echoed.
 * @param {string} key Object key.
 * @returns {string} Printable key.
 */
export function printableKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$-]{0,79}$/u.test(key) ? key : '[unnamed key]';
}

/**
 * Attach an explanation that names the offending key path of an authored file.
 * @template {Error} T
 * @param {T} error Typed refusal; its code is untouched.
 * @param {string} detail Sentence built only from printable keys and static text.
 * @returns {T} The same error.
 */
export function explainInput<T extends Error>(error: T, detail: string): T {
  details.set(error, detail);
  error.message = `${error.message} ${detail}`;
  return error;
}

/**
 * Give a refusal a cause-specific hint in place of the registered hint of its code, for a code
 * with several causes.
 * @template {Error} T
 * @param {T} error Typed refusal.
 * @param {string} hint Static sentence naming the way forward for this cause.
 * @returns {T} The same error.
 */
export function withHint<T extends Error>(error: T, hint: string): T {
  registerCauseHint(hint);
  hints.set(error, hint);
  return error;
}

/**
 * The cause-specific hint of a refusal, as a diagnostic property, or none.
 * @param {unknown} error Caught error.
 * @returns {{hint?: string}} `{ hint }` or an empty object.
 */
export function hintOf(error: unknown): { hint?: string } {
  const hint = error instanceof Error ? hints.get(error) : undefined;
  return hint === undefined ? {} : { hint };
}

/**
 * Explain a refusal of a file whose data space is not the run's, naming both.
 * @template {Error} T
 * @param {T} error Typed refusal (a *_DATASPACE_MISMATCH or UNSUPPORTED_RELATIONSHIP_DATASPACE).
 * @param {string} apiName The file's validated component name.
 * @param {string} fileSpace The data space the file names in c__dataSpace.
 * @param {string} runSpace The run's data space.
 * @returns {T} The same error with the explanation.
 */
export function explainSpaceMismatch<T extends Error>(
  error: T,
  apiName: string,
  fileSpace: string,
  runSpace: string,
): T {
  return explainInput(
    error,
    `${apiName} names the data space ${printableKey(fileSpace)} in c__dataSpace, but the run's data space is ${printableKey(runSpace)} (--dataspace, default "default"). Run the command with --dataspace ${printableKey(fileSpace)}, or correct the file.`,
  );
}

/**
 * Reuse existing diagnostic messages while distinguishing local verification from API rejection.
 * Arbitrary exception messages, bodies and stack traces are never forwarded.
 * @param {unknown} error Caught error.
 * @param {string} nextAction Existing outcome-specific safe next action.
 * @returns {string} Bounded diagnostic suitable for console and JSON.
 */
export function operationDiagnostic(error: unknown, nextAction: string): string {
  const connect = getConnectDiagnostic(error);
  const apiDetail = connect
    ? [
        ...(connect.errors ?? []).map(({ code, message }) =>
          [code, message].filter(Boolean).join(': '),
        ),
        ...(connect.requestId ? [`Request ID: ${connect.requestId}`] : []),
      ].join('; ')
    : '';
  // Salesforce's own sentence may already end the detail; never add a second period.
  const remote = apiDetail
    ? ` Salesforce API detail: ${apiDetail}${/[.!?]$/u.test(apiDetail) ? '' : '.'}`
    : '';
  if (connect && connect.kind !== 'api-error') {
    const explanation =
      connect.statusCode === 429
        ? 'Connect API rate limiting: HTTP 429 Too Many Requests.'
        : 'Connect API HTTP 503 Service Unavailable: POSSIBLE Connect rate limit; maintenance, load or other availability issues are also possible. The cause is not confirmed.';
    const wait =
      connect.retryAfter === undefined ? '' : ` Server Retry-After: ${connect.retryAfter}.`;
    return `${explanation} Reduce request frequency and try later; effective limits can vary with load and change.${wait}${remote} Inspect the target before rerunning a write whose outcome is unknown; no automatic replay was performed. ${nextAction}`;
  }
  const problems = getMetadataProblems(error);
  if (problems)
    return `Salesforce Metadata API did not confirm the destructive deployment${problems.length > 0 ? `: ${problems.join('; ')}` : '; no problem text is disclosed'}. ${nextAction}`;
  if (error instanceof Error && details.has(error)) {
    const detail = details.get(error)!;
    return `${detail}${detail.endsWith('\n') ? '' : ' '}${nextAction}`;
  }
  const status =
    connect?.statusCode ??
    diagnosticDataProperty(error, 'status') ??
    diagnosticDataProperty(error, 'statusCode');
  // A 403 with Salesforce's text is a refusal of the request (the text was admitted only for
  // codes that do not concern access), not an authentication failure.
  const refusal = status === 403 && (connect?.errors ?? []).some(({ message }) => message);
  if (connect && (status === 401 || (status === 403 && !refusal)))
    return `Salesforce API authentication or authorization failed (HTTP ${status}); no authentication response is disclosed.${remote} ${nextAction}`;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599)
    return `Salesforce API rejected the request (HTTP ${status}); no response payload is disclosed.${remote} ${nextAction}`;
  return `Plugin verification or request completion failed; no Salesforce rejection was confirmed. ${nextAction}`;
}
