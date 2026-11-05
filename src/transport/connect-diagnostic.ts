export type ConnectDiagnostic = Readonly<{
  statusCode: 429 | 503;
  kind: 'rate-limit' | 'service-unavailable';
  retryAfter?: string;
}>;

const evidence = new WeakMap<object, ConnectDiagnostic>();

/**
 * Admit only a bounded server delay or canonical HTTP-date, never arbitrary header text.
 * @param {unknown} headers Actual response headers.
 * @returns {string | undefined} Safe Retry-After value, if uniquely supplied.
 */
function retryAfter(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return;
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === 'retry-after');
  if (entries.length !== 1) return;
  const value: unknown = entries[0][1];
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
