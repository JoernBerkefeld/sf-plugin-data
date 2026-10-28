/** Separate the requested REST route selector from numeric SOAP version evidence. */
export type ApiVersionSelection = Readonly<{
  requested: string;
  restSelector: string;
  soapNumeric: string;
}>;

const numericVersion = /^\d{2,3}\.0$/u;

export type OperationalFamily = 'dmo' | 'segment' | 'identity-resolution' | 'calculated-insight';

/**
 * Select only fixed qualified family routes, never probe, upgrade a pin or fall back.
 * The caller retains the original requested mode separately from this effective selection.
 * @param {string} requested User-requested mode or numeric version.
 * @param {OperationalFamily} family Exact selected family.
 * @returns {string} Effective numeric version or unchanged legacy latest selector.
 */
export function operationApiVersion(requested: string, family: OperationalFamily): string {
  if (family === 'identity-resolution') {
    if (requested === 'auto' || requested === '67.0') return '67.0';
  } else {
    if (requested === 'auto') return '65.0';
    if (requested === '65.0' || (family === 'dmo' && requested === 'latest')) return requested;
  }
  throw new Error('INVALID_SCOPE');
}

/**
 * Preserve numeric pinning or resolve numeric SOAP evidence for literal REST latest.
 * Discovery freshness belongs to the caller; this helper never caches or retries.
 * @param {string} requested Exact latest selector or supported numeric syntax.
 * @param {Function} discover Fresh advertised-version discovery supplied by the caller.
 * @returns {Promise<ApiVersionSelection>} Immutable REST selector and numeric SOAP version.
 */
export async function resolveApiVersion(
  requested: string,
  discover: () => Promise<unknown>,
): Promise<ApiVersionSelection> {
  if (numericVersion.test(requested)) {
    return Object.freeze({ requested, restSelector: `v${requested}`, soapNumeric: requested });
  }
  if (requested !== 'latest') {
    throw new Error('Use latest or an explicit numeric API version such as 65.0.');
  }

  let advertised: unknown;
  try {
    advertised = await discover();
  } catch {
    throw new Error(
      'API version discovery failed. Check org access or use an explicit numeric version.',
    );
  }
  if (!Array.isArray(advertised) || advertised.length === 0) {
    throw new Error(
      'API version discovery returned invalid data. Use an explicit numeric version.',
    );
  }
  let soapNumeric = '';
  for (const entry of advertised) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.version !== 'string' ||
      !numericVersion.test(entry.version)
    ) {
      throw new Error(
        'API version discovery returned invalid data. Use an explicit numeric version.',
      );
    }
    if (!soapNumeric || Number(entry.version) > Number(soapNumeric)) soapNumeric = entry.version;
  }
  return Object.freeze({ requested, restSelector: 'latest', soapNumeric });
}
