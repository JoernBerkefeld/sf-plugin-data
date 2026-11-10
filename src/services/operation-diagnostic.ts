import { isDeepStrictEqual } from 'node:util';
import {
  diagnosticDataProperty,
  getConnectDiagnostic,
  getMetadataProblems,
} from '../transport/connect-diagnostic.js';

const details = new WeakMap<Error, string>();
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
  const remote = apiDetail ? ` Salesforce API detail: ${apiDetail}.` : '';
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
  if (connect && (status === 401 || status === 403))
    return `Salesforce API authentication or authorization failed (HTTP ${status}); no authentication response is disclosed.${remote} ${nextAction}`;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599)
    return `Salesforce API rejected the request (HTTP ${status}); no response payload is disclosed.${remote} ${nextAction}`;
  return `Plugin verification or request completion failed; no Salesforce rejection was confirmed. ${nextAction}`;
}
