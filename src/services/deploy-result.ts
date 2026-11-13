/** Payload-free preview classification shared by the per-item deploy routes. */
export type DeployPreviewResult = {
  outcome: 'create' | 'update' | 'unchanged' | 'blocked-changes' | 'blocked';
  target: 'absent' | 'present' | 'unknown';
  absenceProof: 'complete-inventory' | 'none';
  diagnostics: Array<{ code: string; message: string }>;
};

/** Per-item execution outcome with explicit mutation evidence, shared by the deploy routes. */
export type DeployExecutionResult = {
  outcome:
    | 'unchanged'
    | 'blocked'
    | 'created'
    | 'failed'
    | 'updated'
    | 'creation-processing'
    | 'update-processing'
    | 'not-attempted';
  mutation:
    | 'not-attempted'
    | 'confirmed-created'
    | 'confirmed-updated'
    | 'acknowledged-processing'
    | 'unknown'
    | 'rejected';
  preflight?: DeployPreviewResult;
  diagnostics: Array<{ code: string; message: string }>;
};

/** Next action when Salesforce refused the item's first write: nothing was applied for it. */
export const rejectedNextAction =
  'Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.';

/**
 * Count the writes of one item, so a failure can say whether anything was applied. Only the
 * item's first write, answered by Salesforce with an HTTP 4xx status, is known to have changed
 * nothing; every other failure after the first dispatch stays unknown.
 */
export class WriteLedger {
  private started = 0;
  private completed = 0;
  private refusal: unknown;

  /**
   * Whether any write was sent.
   * @returns {boolean} True after the first dispatch.
   */
  public get dispatched(): boolean {
    return this.started > 0;
  }

  /**
   * Run one write and record how it ended.
   * @template T
   * @param {Function} write The single write.
   * @returns {Promise<T>} Its result.
   */
  public async run<T>(write: () => Promise<T>): Promise<T> {
    this.started++;
    try {
      const result = await write();
      this.completed++;
      return result;
    } catch (error) {
      const status = (error as { status?: unknown; code?: unknown } | null)?.status;
      const code = (error as { code?: unknown } | null)?.code;
      if (
        this.started === 1 &&
        typeof code === 'string' &&
        code.endsWith('_HTTP_ERROR') &&
        typeof status === 'number' &&
        status >= 400 &&
        status < 500
      )
        this.refusal = error;
      throw error;
    }
  }

  /**
   * Classify a failure of the item.
   * @param {unknown} error The error that ended the item.
   * @returns {object} Outcome and mutation for the result item.
   */
  public failure(error: unknown): {
    outcome: 'failed' | 'blocked';
    mutation: 'rejected' | 'unknown' | 'not-attempted';
  } {
    if (this.refusal !== undefined && this.refusal === error)
      return { outcome: 'failed', mutation: 'rejected' };
    return this.dispatched
      ? { outcome: 'failed', mutation: 'unknown' }
      : { outcome: 'blocked', mutation: 'not-attempted' };
  }
}
