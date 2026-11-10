/** Payload-free preview classification shared by the per-item deploy routes. */
export type DeployPreviewResult = {
  outcome: 'create' | 'update' | 'unchanged' | 'blocked-changes' | 'blocked';
  target: 'absent' | 'present' | 'unknown';
  absenceProof: 'complete-inventory' | 'none';
  diagnostics: Array<{ code: string; message: string }>;
};

/** Per-item execution outcome with explicit mutation evidence, shared by the deploy routes. */
export type DeployExecutionResult = {
  outcome: 'unchanged' | 'blocked' | 'created' | 'failed' | 'updated' | 'not-attempted';
  mutation: 'not-attempted' | 'confirmed-created' | 'confirmed-updated' | 'unknown';
  preflight?: DeployPreviewResult;
  diagnostics: Array<{ code: string; message: string }>;
};
