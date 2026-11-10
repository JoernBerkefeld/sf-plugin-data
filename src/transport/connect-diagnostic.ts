import { types } from 'node:util';

export type ConnectDiagnostic = Readonly<{
  statusCode: number;
  kind: 'rate-limit' | 'service-unavailable' | 'api-error';
  retryAfter?: string;
  errors?: ReadonlyArray<Readonly<{ code?: string; message?: string }>>;
  requestId?: string;
}>;

const evidence = new WeakMap<object, ConnectDiagnostic>();

/**
 * Read data properties only; never invoke remote accessors or proxy traps.
 * @param {unknown} value Candidate record.
 * @param {string} key Proven transport field.
 * @returns {unknown} Own data value, if present.
 */
export function diagnosticDataProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/**
 * Admit bounded prose, not arbitrary response serialization or sensitive echoes.
 * This is conservative display filtering, not a guarantee that free text contains no PII.
 * @param {unknown} value Structured API message leaf.
 * @returns {string | undefined} Useful explanation without recognized sensitive material.
 */
function safeMessage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 400) return;
  // Reject controls before whitespace normalization, including terminal and bidi controls.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) return;
  if (
    /[<>{}[\]\\]|https?:|www\.|\b(?:bearer|authorization|cookie|password|secret|token|accessToken|refreshToken|session|credential|payload|private|email|phone|address|ssn)\b|\bselect\b.+\bfrom\b|\bat\s+\S+\s*\(/iu.test(
      value,
    ) ||
    /[\w.+-]+@[\w.-]+|\b\d[\d ()+-]{7,}\d\b|\b[A-Za-z0-9+/=_-]{48,}\b|\b\w+\s*=\s*\S+/u.test(value)
  )
    return;
  // A quoted token can be a credential or record value, not just a schema identifier.
  // Without independent schema evidence, use the caller's contextual fallback instead.
  if (/["'`]/u.test(value)) return;
  // Personal-record and credential/value contexts can echo data even without quotes.
  // These filters deliberately do not claim to establish confidentiality for all free text.
  if (
    /\b(?:api[ -]?key|customer|contact|subscriber|person)\b|\b(?:invalid|rejected)\s+value\b/iu.test(
      value,
    )
  )
    return;
  const message = value.replaceAll(/\s+/gu, ' ').trim();
  if (
    !message ||
    /^(?:internal server error|bad request|unknown error|error|service unavailable|too many requests|unauthorized|forbidden)[.! ]*$/iu.test(
      message,
    )
  )
    return;
  if (/^[\d\W_]+$/u.test(message)) return;
  return message;
}

/**
 * Normalize only REST error records/arrays and their known data/errors containers.
 * No arbitrary keys, native Error.message, causes or raw objects are retained.
 * @param {unknown} candidate Parsed error data, or a bounded JSON error body.
 * @returns {ReadonlyArray<object> | undefined} At most three immutable safe entries.
 */
function apiErrors(candidate: unknown): ConnectDiagnostic['errors'] {
  let budget = 16_384;
  const result: Array<Readonly<{ code?: string; message?: string }>> = [];
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number, parsed: boolean): void => {
    if (depth > 3 || result.length >= 3) return;
    if (typeof value === 'string') {
      budget -= value.length;
      if (budget < 0 || parsed || !/^[\s]*[[{]/u.test(value)) return;
      try {
        visit(JSON.parse(value), depth + 1, true);
      } catch {
        /* Not display evidence. */
      }
      return;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      types.isProxy(value) ||
      types.isNativeError(value) ||
      seen.has(value)
    )
      return;
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 3) return;
      for (let index = 0; index < value.length; index++)
        visit(diagnosticDataProperty(value, String(index)), depth + 1, parsed);
      return;
    }
    const rawCode = diagnosticDataProperty(value, 'errorCode');
    const rawMessage = diagnosticDataProperty(value, 'message');
    for (const leaf of [rawCode, rawMessage]) if (typeof leaf === 'string') budget -= leaf.length;
    if (budget < 0) return;
    const code =
      typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(rawCode) ? rawCode : undefined;
    const message = safeMessage(rawMessage);
    const size = result.reduce(
      (total, entry) => total + (entry.code?.length ?? 0) + (entry.message?.length ?? 0) + 4,
      0,
    );
    if ((code || message) && size + (code?.length ?? 0) + (message?.length ?? 0) + 4 <= 1300)
      result.push(Object.freeze({ ...(code ? { code } : {}), ...(message ? { message } : {}) }));
    if (typeof rawMessage === 'string' && /^[\s]*[[{]/u.test(rawMessage))
      visit(rawMessage, depth + 1, parsed);
    if (rawCode === undefined && rawMessage === undefined) {
      for (const key of ['data', 'errors'])
        visit(diagnosticDataProperty(value, key), depth + 1, parsed);
    }
  };
  visit(candidate, 0, false);
  return result.length > 0 ? Object.freeze(result) : undefined;
}

/**
 * Admit only a bounded server delay or canonical HTTP-date, never arbitrary header text.
 * @param {unknown} headers Actual response headers.
 * @returns {string | undefined} Safe Retry-After value, if uniquely supplied.
 */
function retryAfter(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return;
  if (types.isProxy(headers)) return;
  const keys = Object.getOwnPropertyNames(headers);
  if (keys.length > 100) return;
  const entries = keys.filter((key) => key.toLowerCase() === 'retry-after');
  if (entries.length !== 1) return;
  const value = diagnosticDataProperty(headers, entries[0]);
  if (typeof value !== 'string' || value.length > 64) return;
  if (/^(?:0|[1-9]\d{0,9})$/u.test(value)) return value;
  if (
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(
      value,
    )
  ) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && date.toUTCString() === value) return value;
  }
}

/**
 * Classify only actual HTTP429/503; 503 never proves throttling, even with Retry-After.
 * @param {unknown} statusCode Actual wire status.
 * @param {unknown} [headers] Actual wire headers, not exception message text.
 * @returns {ConnectDiagnostic | undefined} Immutable payload-free evidence.
 */
export function connectDiagnostic(
  statusCode: unknown,
  headers?: unknown,
): ConnectDiagnostic | undefined {
  if (statusCode !== 429 && statusCode !== 503) return;
  const wait = retryAfter(headers);
  return Object.freeze({
    statusCode,
    kind: statusCode === 429 ? 'rate-limit' : 'service-unavailable',
    ...(wait === undefined ? {} : { retryAfter: wait }),
  });
}

/**
 * Normalize display evidence after a transport has independently confirmed HTTP failure.
 * Callers pass parsed REST error data (not an Error), and an optional extracted request ID.
 * Authentication responses never disclose server prose.
 * @param {unknown} statusCode Actual wire status, never inferred from prose.
 * @param {unknown} body Parsed error data or bounded JSON body.
 * @param {unknown} [headers] Actual headers for existing Retry-After handling only.
 * @param {unknown} [requestId] Separately extracted server correlation identifier.
 * @returns {ConnectDiagnostic | undefined} Immutable display-only evidence.
 */
export function apiDiagnostic(
  statusCode: unknown,
  body: unknown,
  headers?: unknown,
  requestId?: unknown,
): ConnectDiagnostic | undefined {
  if (
    typeof statusCode !== 'number' ||
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  )
    return;
  const admitted = apiErrors(body);
  const errors =
    statusCode === 401 || statusCode === 403
      ? admitted &&
        Object.freeze(
          admitted.filter(({ code }) => code).map(({ code }) => Object.freeze({ code })),
        )
      : admitted;
  const id =
    typeof requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{7,79}$/u.test(requestId)
      ? requestId
      : undefined;
  return Object.freeze({
    ...(connectDiagnostic(statusCode, headers) ?? { statusCode, kind: 'api-error' as const }),
    ...(errors ? { errors } : {}),
    ...(id ? { requestId: id } : {}),
  });
}

/**
 * Extract one correlation ID from demonstrated HTTP header names, never arbitrary headers.
 * @param {unknown} headers Actual response headers.
 * @returns {unknown} Candidate ID, validated by apiDiagnostic before retention.
 */
export function diagnosticRequestId(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object' || types.isProxy(headers)) return undefined;
  const keys = Object.getOwnPropertyNames(headers);
  if (keys.length > 100) return undefined;
  const matches = keys.filter((key) =>
    ['x-sfdc-request-id', 'x-request-id'].includes(key.toLowerCase()),
  );
  return matches.length === 1 ? diagnosticDataProperty(headers, matches[0]) : undefined;
}

/**
 * Normalize only a bounded failed installed-CLI HTTP receipt, not stdout/stderr envelopes.
 * Successful receipts and unproven HTTP failures never produce display evidence.
 * @param {string} receipt Actual --include stdout.
 * @returns {ConnectDiagnostic | undefined} Safe detached evidence only.
 */
export function apiReceiptDiagnostic(receipt: string): ConnectDiagnostic | undefined {
  const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt.slice(0, 256));
  if (!match) return;
  const status = Number(match[1]);
  if (status < 400 || status > 599) return;
  const headerBlock = receipt.slice(0, 16_384);
  const headers: Record<string, string> = {};
  let offset = match[0].length;
  const duplicates = new Set<string>();
  while (offset < headerBlock.length) {
    const line = /^([^\r\n]*)\r?\n/u.exec(headerBlock.slice(offset));
    if (!line) break;
    const header = /^([^:\s]+):[ \t]*(.*)$/u.exec(line[1]);
    if (!line[1]) {
      offset += line[0].length;
      break;
    }
    if (!header) break;
    const key = header[1].toLowerCase();
    if (['retry-after', 'x-sfdc-request-id', 'x-request-id'].includes(key)) {
      if (Object.hasOwn(headers, key)) duplicates.add(key);
      headers[key] = header[2];
    }
    offset += line[0].length;
  }
  const requestId =
    duplicates.has('x-request-id') || duplicates.has('x-sfdc-request-id')
      ? undefined
      : diagnosticRequestId(headers);
  if (duplicates.has('retry-after')) delete headers['retry-after'];
  return apiDiagnostic(
    status,
    receipt.length - offset <= 16_384 ? receipt.slice(offset) : undefined,
    headers,
    requestId,
  );
}

/**
 * Retain safe metadata privately without changing an existing error or response shape.
 * @template {object} T
 * @param {T} target Existing error or detached native Graph read result.
 * @param {ConnectDiagnostic | undefined} diagnostic Classified wire evidence.
 * @returns {T} Unchanged target identity.
 */
export function retainConnectDiagnostic<T extends object>(
  target: T,
  diagnostic: ConnectDiagnostic | undefined,
): T {
  if (diagnostic) evidence.set(target, diagnostic);
  return target;
}

const metadataProblems = new WeakMap<object, readonly string[]>();

/**
 * Retain at most three Metadata API problem texts that pass the same display filter as REST errors.
 * A text that does not pass is dropped, never truncated or echoed.
 * @template {object} T
 * @param {T} target Existing error.
 * @param {unknown[]} problems Candidate problem texts from a Metadata deployment receipt.
 * @returns {T} Unchanged target identity.
 */
export function retainMetadataProblems<T extends object>(target: T, problems: unknown[]): T {
  const safe: string[] = [];
  for (const problem of problems.slice(0, 20)) {
    const message = safeMessage(problem);
    if (message && !safe.includes(message) && safe.length < 3) safe.push(message);
  }
  metadataProblems.set(target, Object.freeze(safe));
  return target;
}

/**
 * Read retained Metadata API problem texts.
 * @param {unknown} target Existing error.
 * @returns {ReadonlyArray<string> | undefined} Safe texts (possibly none), or undefined when no Metadata deployment failed.
 */
export function getMetadataProblems(target: unknown): readonly string[] | undefined {
  if (target && typeof target === 'object') return metadataProblems.get(target);
}

/**
 * Read transport evidence without disclosing raw remote bodies, headers or causes.
 * @param {unknown} target Existing error or native Graph read result.
 * @returns {ConnectDiagnostic | undefined} Immutable safe evidence, if present.
 */
export function getConnectDiagnostic(target: unknown): ConnectDiagnostic | undefined {
  if (target && typeof target === 'object') return evidence.get(target);
}

/**
 * Extract only unique Retry-After headers from the leading CLI HTTP receipt header block.
 * @param {string} receipt Installed CLI --include stdout.
 * @returns {ConnectDiagnostic | undefined} Safe evidence; never retains stdout or body.
 */
export function connectReceiptDiagnostic(receipt: string): ConnectDiagnostic | undefined {
  const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt);
  if (!match) return;
  const headers: Record<string, string> = {};
  let duplicates = false;
  for (const line of receipt.slice(match[0].length).split(/\r?\n/u)) {
    if (!line) break;
    const header = /^([^:\s]+):[ \t]*(.*)$/u.exec(line);
    if (!header) break;
    if (header[1].toLowerCase() === 'retry-after') {
      if ('retry-after' in headers) duplicates = true;
      headers['retry-after'] = header[2];
    }
  }
  return connectDiagnostic(Number(match[1]), duplicates ? undefined : headers);
}
