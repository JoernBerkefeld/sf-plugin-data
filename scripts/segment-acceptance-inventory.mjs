// BLOCKED: Node's path-based traversal cannot establish ancestor-swap safety.
// In particular, Windows reparse-point-safe directory-relative traversal is unavailable
// here. Do not replace this refusal with lstat/realpath checks followed by path reads.
// Dynamic oclif command resolution and a complete CLI installation are also unproven.

/**
 * Refuse artifact collection until bounded no-follow directory-relative traversal exists.
 * No input paths are accessed and no file or directory contents are allocated.
 * @param {object} options Untrusted collector options; deliberately not inspected.
 * @returns {never} Artifact collection is blocked on every platform.
 */
export function collectArtifactEvidence(options) {
  void options;
  throw new Error('SEGMENT_INVENTORY_REFUSED');
}

/**
 * Refuse binding while artifact collection is unavailable.
 * @param {object} options Untrusted collector options; deliberately not inspected.
 * @returns {object} No value is returned while collection remains blocked.
 */
export function bindCollectedArtifact(options) {
  return collectArtifactEvidence(options);
}
