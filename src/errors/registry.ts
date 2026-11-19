import { plugin } from '../plugin.js';
import { hints as calculatedInsight } from './codes/calculated-insight.js';
import { hints as dataGraph } from './codes/data-graph.js';
import { hints as dataStream } from './codes/data-stream.js';
import { hints as dataTransform } from './codes/data-transform.js';
import { hints as dependency } from './codes/dependency.js';
import { hints as dlo } from './codes/dlo.js';
import { hints as dmo } from './codes/dmo.js';
import { hints as general } from './codes/general.js';
import { hints as identityResolution } from './codes/identity-resolution.js';
import { hints as mapping } from './codes/mapping.js';
import { hints as relationship } from './codes/relationship.js';
import { hints as segment } from './codes/segment.js';

/** One entry per docs/errors/<family>/ folder. */
export const errorFamilies = {
  'calculated-insight': calculatedInsight,
  'data-graph': dataGraph,
  'data-stream': dataStream,
  'data-transform': dataTransform,
  dependency,
  dlo,
  dmo,
  general,
  'identity-resolution': identityResolution,
  mapping,
  relationship,
  segment,
} as const;

export type ErrorFamily = keyof typeof errorFamilies;

export type ErrorCodeInfo = Readonly<{ family: ErrorFamily; hint: string; docs: string }>;

const registry = new Map<string, ErrorCodeInfo>();
for (const [family, entries] of Object.entries(errorFamilies) as Array<
  [ErrorFamily, Readonly<Record<string, string>>]
>)
  for (const [code, hint] of Object.entries(entries))
    registry.set(
      code,
      Object.freeze({
        family,
        hint,
        docs: `https://github.com/JoernBerkefeld/sf-plugin-data/blob/v${plugin.version}/docs/errors/${family}/${code}.md`,
      }),
    );

/** Cause-specific hints registered by the plugin's own code (see {@link registerCauseHint}). */
const causeHints = new Set<string>();

/**
 * Register a cause-specific hint, which then replaces the hint of its code where a diagnostic
 * carries it. A hint any other object carries (a raw or verbatim payload) is never kept.
 * @param {string} hint Static plugin-built sentence.
 */
export function registerCauseHint(hint: string): void {
  causeHints.add(hint);
}

/**
 * The hint to show for a diagnostic: its own when the plugin registered it, otherwise the
 * registered hint of its code.
 * @param {unknown} own The diagnostic's hint property.
 * @param {string} registered Hint of the code.
 * @returns {string} Hint.
 */
function hintFor(own: unknown, registered: string): string {
  return typeof own === 'string' && causeHints.has(own) ? own : registered;
}

/**
 * Look up the CLI hint and reference page of a plugin error code.
 * @param {string} code Plugin diagnostic code.
 * @returns {ErrorCodeInfo | undefined} Registered hint, family and docs URL.
 */
export function errorCodeInfo(code: string): ErrorCodeInfo | undefined {
  return registry.get(code);
}

/**
 * All registered codes, for tests and the docs index.
 * @returns {string[]} Registered codes.
 */
export function registeredErrorCodes(): string[] {
  return [...registry.keys()];
}

/**
 * Add `hint` and `docs` to every `{ code, message }` diagnostic with a registered code,
 * wherever it sits in a command result (top-level errors, items, preflight results). A
 * registered cause-specific hint the diagnostic already carries is kept; any other is replaced.
 * @template T
 * @param {T} value Command result envelope.
 * @returns {T} The same envelope, annotated in place.
 */
export function annotateDiagnostics<T>(value: T): T {
  const seen = new Set<object>();
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 12 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      const info = registry.get(record.code);
      if (info && Object.isExtensible(record)) {
        record.hint = hintFor(record.hint, info.hint);
        record.docs = info.docs;
      }
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(value, 0);
  return value;
}

/**
 * Human output for one diagnostic: `CODE: message`, then the hint and the docs link.
 * The hint line is left out when the message already says it; a registered cause-specific hint
 * the diagnostic carries replaces the hint of its code.
 * @param {{ code: string; message: string; hint?: string }} diagnostic Diagnostic to print.
 * @param {string} [prefix] Text before the code, such as `dmo:Name__dlm: `.
 * @returns {string} One or more lines.
 */
export function formatDiagnostic(
  diagnostic: Readonly<{ code: string; message: string; hint?: unknown }>,
  prefix = '',
): string {
  const lines = [`${prefix}${diagnostic.code}: ${diagnostic.message}`];
  const info = registry.get(diagnostic.code);
  if (info) {
    const hint = hintFor(diagnostic.hint, info.hint);
    if (!diagnostic.message.includes(hint)) lines.push(`Hint: ${hint}`);
    lines.push(`Docs: ${info.docs}`);
  }
  return lines.join('\n');
}
