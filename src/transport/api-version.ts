/** Separate the requested REST route selector from numeric SOAP version evidence. */
export type ApiVersionSelection = Readonly<{
  requested: string;
  restSelector: string;
  soapNumeric: string;
}>;

const numericVersion = /^\d{2,3}\.0$/u;

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
