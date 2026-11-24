/**
 * Salesforce CLI exit code for a command envelope's top-level status.
 * success and accepted (--async) are 0, partial is 68, processing is 69, anything else is 1.
 * @param {object} envelope Command envelope (or any object with its status).
 * @param {string} envelope.status Top-level envelope status.
 * @returns {0 | 1 | 68 | 69} The exit code.
 */
export function exitCodeOf(envelope: { status: string }): 0 | 1 | 68 | 69 {
  switch (envelope.status) {
    case 'success':
    case 'accepted': {
      return 0;
    }
    case 'partial': {
      return 68;
    }
    case 'processing': {
      return 69;
    }
    default: {
      return 1;
    }
  }
}
