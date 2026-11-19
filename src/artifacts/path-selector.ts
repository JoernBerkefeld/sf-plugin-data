// Pure path rules shared by Git selection and editor integrations. Keep this module free of any
// import other than `node:path` so it can be bundled on its own.
import path from 'node:path';

/** Component family of a canonical `data360/` file; also the `-m` selector prefix. */
export type DeletedArtifactKind =
  | 'dmo'
  | 'dlo'
  | 'mapping'
  | 'relationship'
  | 'data-stream'
  | 'data-transform'
  | 'data-graph'
  | 'identity-resolution'
  | 'calculated-insight'
  | 'segment';

export const dloName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dll$/u;
export const nativeDmoName = /^[A-Za-z][A-Za-z0-9_]{0,199}__dlm$/u;
export const nativeMappingName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
export const nativeRelationshipName = /^[A-Za-z][A-Za-z0-9_]{0,239}$/u;
export const dataTransformName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
export const dataGraphName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
export const identityResolutionName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;
export const calculatedInsightName = /^[A-Za-z][A-Za-z0-9_]{0,194}__cio$/u;
export const segmentName = /^[A-Za-z][A-Za-z0-9_]{0,199}$/u;

export const ciJsonSuffix = '.calculatedInsight-meta.json';
export const ciSqlSuffix = '.calculatedInsight-meta.sql';

/** Family by file suffix; every family lives under `data360/` at the project root. */
export const families: ReadonlyArray<{
  kind: DeletedArtifactKind;
  suffix: string;
  directory: readonly string[];
  name: (value: string) => boolean;
}> = [
  {
    kind: 'dmo',
    suffix: '.dmo-meta.json',
    directory: ['data360', 'dmo'],
    name: (value) => nativeDmoName.test(value),
  },
  {
    kind: 'dlo',
    suffix: '.dlo-meta.json',
    directory: ['data360', 'dlo'],
    name: (value) => dloName.test(value) && value.endsWith('__dll'),
  },
  {
    kind: 'mapping',
    suffix: '.mapping-meta.json',
    directory: ['data360', 'mapping'],
    name: (value) => nativeMappingName.test(value),
  },
  {
    kind: 'relationship',
    suffix: '.relationship-meta.json',
    directory: ['data360', 'relationship'],
    name: (value) => nativeRelationshipName.test(value),
  },
  {
    kind: 'data-stream',
    suffix: '.data-stream-meta.json',
    directory: ['data360', 'data-stream'],
    name: (value) => /^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value),
  },
  {
    kind: 'data-transform',
    suffix: '.dataTransform.json',
    directory: ['data360', 'dataTransforms'],
    name: (value) => dataTransformName.test(value),
  },
  {
    kind: 'data-graph',
    suffix: '.native-dataGraph.json',
    directory: ['data360', 'dataGraphs'],
    name: (value) => dataGraphName.test(value),
  },
  {
    kind: 'identity-resolution',
    suffix: '.identityResolution.json',
    directory: ['data360', 'identityResolution'],
    name: (value) => identityResolutionName.test(value),
  },
  {
    kind: 'calculated-insight',
    suffix: ciJsonSuffix,
    directory: ['data360', 'calculatedInsights'],
    name: (value) => calculatedInsightName.test(value),
  },
  {
    kind: 'segment',
    suffix: '.segment.json',
    directory: ['data360', 'segments'],
    name: (value) => segmentName.test(value),
  },
];

// The SQL file of a calculated insight selects (or, deleted, deletes) the insight like its JSON.
export const ciSql = (file: string): boolean => /\.calculatedInsight-meta\.sql$/iu.test(file);
// A segment's SQL file (`<Name>.segment.<model>.sql`) selects the segment like its JSON.
export const segmentSql = (file: string): boolean => {
  const entry = path.posix.basename(file).toLowerCase();
  return entry.includes('.segment.') && entry.endsWith('.sql');
};
export const segmentSqlPattern =
  /^([A-Za-z][A-Za-z0-9_]*)\.segment\.([A-Za-z0-9][A-Za-z0-9_]*)\.sql$/u;

/**
 * Map one project-relative POSIX path to its family and canonical name.
 * @param {string} file Project-relative POSIX path.
 * @returns {object | undefined} Family and canonical name (`__cio` included for calculated
 * insights), or undefined when the path is not a canonical component file.
 */
export function classifyComponentPath(
  file: string,
): { kind: DeletedArtifactKind; name: string } | undefined {
  if (ciSql(file)) {
    const name = path.posix.basename(file).slice(0, -ciSqlSuffix.length);
    if (
      !calculatedInsightName.test(name) ||
      file !== `data360/calculatedInsights/${name}${ciSqlSuffix}`
    )
      return undefined;
    return { kind: 'calculated-insight', name };
  }
  if (segmentSql(file)) {
    const match = segmentSqlPattern.exec(path.posix.basename(file));
    if (!match || !segmentName.test(match[1]) || file !== `data360/segments/${match[0]}`)
      return undefined;
    return { kind: 'segment', name: match[1] };
  }
  const family = families.find(({ suffix }) => file.toLowerCase().endsWith(suffix.toLowerCase()));
  if (!family) return undefined;
  const name = path.posix.basename(file).slice(0, -family.suffix.length);
  if (!family.name(name) || file !== [...family.directory, `${name}${family.suffix}`].join('/'))
    return undefined;
  return { kind: family.kind, name };
}

/**
 * The `sf data360 deploy/retrieve -m` selector of a component file. A calculated insight's SQL
 * file and a segment's `<Name>.segment.<model>.sql` file map to their owner. Only POSIX paths
 * (`/` separators) relative to the project root are recognised; anything else is undefined.
 * @param {string} relativePath Project-relative POSIX path.
 * @returns {object | undefined} Family, name and `kind:name` selector, or undefined; never throws.
 */
export function selectorForPath(
  relativePath: string,
): { kind: DeletedArtifactKind; name: string; selector: string } | undefined {
  if (typeof relativePath !== 'string') return undefined;
  const component = classifyComponentPath(relativePath);
  return component && { ...component, selector: `${component.kind}:${component.name}` };
}

/**
 * The source DMO a relationship file names: `spec.sourceObjectName` of a normal document, or
 * `verbatim.native.sourceObject.name` of one retrieved as-is.
 * @param {unknown} document Parsed file content.
 * @returns {string | undefined} A valid DMO API name, or undefined.
 */
function relationshipSourceDmo(document: unknown): string | undefined {
  const bag = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const root = bag(document);
  const source =
    bag(root?.spec)?.sourceObjectName ?? bag(bag(bag(root?.verbatim)?.native)?.sourceObject)?.name;
  return typeof source === 'string' && nativeDmoName.test(source) ? source : undefined;
}

/**
 * The exact `sf data360 delete -m` selector of a component file. Every family deletes by its
 * deploy selector except a relationship, which also names its source DMO
 * (`relationship:<SourceDmo__dlm>:<Name>`), read from the file's content.
 * @param {string} relativePath Project-relative POSIX path.
 * @param {string} documentText The file's text (only read for a relationship).
 * @returns {string | undefined} The selector, or undefined (unknown path, or a relationship whose
 * text is not JSON or names no valid source DMO); never throws.
 */
export function deleteSelectorFor(relativePath: string, documentText: string): string | undefined {
  const component = selectorForPath(relativePath);
  if (!component) return undefined;
  if (component.kind !== 'relationship') return component.selector;
  if (typeof documentText !== 'string') return undefined;
  let document: unknown;
  try {
    document = JSON.parse(documentText);
  } catch {
    return undefined;
  }
  const source = relationshipSourceDmo(document);
  return source && `relationship:${source}:${component.name}`;
}
