import type { IngestionDloExecution, IngestionDloPreview } from './execute-ingestion-dlo-deploy.js';

/**
 * Adapt payload-free family diagnostic codes without losing their machine-readable identity.
 * @param {string[]} codes Internal codes.
 * @returns {Array<{code: string; message: string}>} Public diagnostics.
 */
function diagnostics(codes: string[]): Array<{ code: string; message: string }> {
  return codes.map((code) => ({
    code,
    message:
      'Source-backed ingestion DLO admission or execution did not complete. Inspect the stage and mutation certainty; no replay or rollback was performed.',
  }));
}

/**
 * Adapt read-only admission to the shared envelope without inventing absence proof.
 * @param {IngestionDloPreview} value Family admission.
 * @returns {object} Typed public preview.
 */
export function publicIngestionDloPreview(value: IngestionDloPreview): Omit<
  IngestionDloPreview,
  'diagnostics'
> & {
  target: 'present' | 'unknown';
  absenceProof: 'none';
  diagnostics: Array<{ code: string; message: string }>;
} {
  return {
    ...value,
    target: value.outcome === 'blocked' ? 'unknown' : 'present',
    absenceProof: 'none',
    diagnostics: diagnostics(value.diagnostics),
  };
}

/**
 * Retain both mutation stages and certainty when adapting the public execution result.
 * @param {IngestionDloExecution} value Family execution.
 * @returns {object} Typed public execution.
 */
export function publicIngestionDloExecution(value: IngestionDloExecution): Omit<
  IngestionDloExecution,
  'diagnostics'
> & {
  diagnostics: Array<{ code: string; message: string }>;
} {
  return { ...value, diagnostics: diagnostics(value.diagnostics) };
}
