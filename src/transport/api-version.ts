/** Separate the requested REST route selector from numeric SOAP version evidence. */
export type ApiVersionSelection = Readonly<{
  requested: string;
  restSelector: string;
  soapNumeric: string;
}>;

const numericVersion = /^\d{2,3}\.0$/u;

/**
 * Admit the qualified initial native stream pin without widening other families.
 * @param {string} requested Explicit pin or default/auto.
 * @returns {string} Fixed native stream version.
 */
export function dataStreamApiVersion(requested = 'auto'): string {
  if (requested === 'auto' || requested === '68.0') return '68.0';
  throw new Error('INVALID_SCOPE');
}

/**
 * Admit native DLO, DMO and mapping routes without discovery or upgrading numeric pins.
 * Admission is not a claim of live qualification at every admitted version.
 * @param {string} requested Explicit numeric version or default/auto.
 * @returns {string} Numeric route version.
 */
export function nativeApiVersion(requested = 'auto'): string {
  if (requested === 'auto') return '68.0';
  if (numericVersion.test(requested) && Number(requested) >= 61) return requested;
  throw new Error('INVALID_SCOPE');
}

/**
 * Admit only the bounded mapping deletion compatibility pins, after boundary normalization.
 * @param {string} version Exact numeric client version.
 * @returns {boolean} Whether deletion is admitted; intermediate pins are assumed compatible.
 */
export function isNativeMappingDeletionVersion(version: string): boolean {
  return ['61.0', '62.0', '63.0', '64.0', '65.0', '66.0', '67.0', '68.0'].includes(version);
}

/**
 * Keep historical IR deployment pinned until its independent native-write migration.
 * @param {string} requested Exact user selection.
 * @returns {string} Historical deployment version.
 */
export function legacyIdentityResolutionApiVersion(requested: string): string {
  if (requested === 'auto' || requested === '67.0') return '67.0';
  throw new Error('INVALID_SCOPE');
}

export type OperationalFamily =
  | 'dmo'
  | 'segment'
  | 'identity-resolution'
  | 'calculated-insight'
  | 'data-graph'
  | 'data-transform'
  | 'dlo';

/**
 * Select only fixed qualified family routes, never probe, upgrade a pin or fall back.
 * The caller retains the original requested mode separately from this effective selection.
 * @param {string} requested User-requested mode or numeric version.
 * @param {OperationalFamily} family Exact selected family.
 * @returns {string} Effective numeric version.
 */
export function operationApiVersion(requested: string, family: OperationalFamily): string {
  switch (family) {
    case 'data-transform':
    case 'dlo': {
      if (requested === 'auto' || requested === '68.0') return '68.0';

      break;
    }
    case 'segment': {
      if (requested === 'auto' || requested === '68.0') return '68.0';
      if (requested === '65.0') return '65.0';

      break;
    }
    case 'calculated-insight': {
      if (requested === 'auto' || requested === '65.0') return '65.0';
      if (requested === '68.0') return '68.0';

      break;
    }
    case 'identity-resolution': {
      if (requested === 'auto' || requested === '68.0') return '68.0';

      break;
    }
    case 'data-graph': {
      if (requested === 'auto' || requested === '67.0') return '67.0';

      break;
    }
    default: {
      if (requested === 'auto') return '65.0';
      if (requested === '65.0') return requested;
    }
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
