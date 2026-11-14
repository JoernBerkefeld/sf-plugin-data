/**
 * A string field of a document that lives in its own code file next to the JSON (mcdev query
 * style: `<Name>.<type>-meta.json` plus `<Name>.<type>-meta.sql`).
 * - `{ path, extension }`: the string at `path` is one code file.
 * - `{ path, each, key, extension }`: `path` names an array; the `each` string of every element
 *   is one code file, named by that element's `key` string.
 */
export type CodeField = {
  path: readonly string[];
  extension: string;
  each?: string;
  key?: string;
};

/** One code file: `name` is set for array elements (their `key`), absent for a single field. */
export type CodeFile = { extension: string; name?: string; text: string };

const safeName = /^[A-Za-z0-9][A-Za-z0-9_]*$/u;
const safeExtension = /^[a-z]+$/u;

type Bag = Record<string, unknown>;

/**
 * Whether a value is a plain JSON object.
 * @param {unknown} value Candidate.
 * @returns {boolean} Object and not an array.
 */
function isBag(value: unknown): value is Bag {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The object holding a field's last path segment.
 * @param {Bag} document Document.
 * @param {readonly string[]} path Field path.
 * @param {() => Error} invalid Error for a missing or non-object step.
 * @returns {Bag} Parent object.
 */
function parent(document: Bag, path: readonly string[], invalid: () => Error): Bag {
  let current: unknown = document;
  for (const step of path.slice(0, -1)) {
    if (!isBag(current)) throw invalid();
    current = current[step];
  }
  if (!isBag(current) || path.length === 0) throw invalid();
  return current;
}

/**
 * The array elements of an `each` field, every one a plain object.
 * @param {Bag} holder Parent object.
 * @param {string} last Array property.
 * @param {() => Error} invalid Error for a malformed array.
 * @returns {Bag[]} Elements.
 */
function elements(holder: Bag, last: string, invalid: () => Error): Bag[] {
  const list = holder[last];
  if (!Array.isArray(list) || !list.every((element) => isBag(element))) throw invalid();
  return list as Bag[];
}

/**
 * Take the declared code fields out of a document (the document itself is not changed).
 * @param {unknown} value Complete document.
 * @param {readonly CodeField[]} fields Declared code fields.
 * @param {() => Error} invalid Error for a missing, non-string or ambiguous code field.
 * @returns {{document: Record<string, unknown>; files: CodeFile[]}} Document without the code fields and the code files, in declaration and array order.
 */
export function splitCodeFields(
  value: unknown,
  fields: readonly CodeField[],
  invalid: () => Error,
): { document: Record<string, unknown>; files: CodeFile[] } {
  if (!isBag(value)) throw invalid();
  const document = structuredClone(value);
  const files: CodeFile[] = [];
  for (const field of fields) {
    if (!safeExtension.test(field.extension)) throw invalid();
    const holder = parent(document, field.path, invalid);
    const last = field.path.at(-1)!;
    if (field.each === undefined) {
      const text = holder[last];
      if (typeof text !== 'string') throw invalid();
      delete holder[last];
      files.push({ extension: field.extension, text });
      continue;
    }
    const names = new Set<string>();
    for (const element of elements(holder, last, invalid)) {
      const name = element[field.key ?? ''];
      const text = element[field.each];
      if (typeof name !== 'string' || !safeName.test(name) || typeof text !== 'string')
        throw invalid();
      if (names.has(name.toLowerCase())) throw invalid();
      names.add(name.toLowerCase());
      delete element[field.each];
      files.push({ extension: field.extension, name, text });
    }
  }
  return { document, files };
}

/**
 * Put code files back into a document split by `splitCodeFields`; every declared field needs
 * exactly its file and no file may be left over.
 * @param {unknown} value Document without the code fields.
 * @param {readonly CodeField[]} fields Declared code fields.
 * @param {readonly CodeFile[]} files Code file contents.
 * @param {() => Error} invalid Error for a missing, extra or already present code field.
 * @returns {Record<string, unknown>} Complete document.
 */
export function joinCodeFields(
  value: unknown,
  fields: readonly CodeField[],
  files: readonly CodeFile[],
  invalid: () => Error,
): Record<string, unknown> {
  if (!isBag(value)) throw invalid();
  const document = structuredClone(value);
  const pending = new Map<string, string>();
  for (const file of files) {
    const id = `${file.extension}:${file.name ?? ''}`.toLowerCase();
    if (pending.has(id) || typeof file.text !== 'string') throw invalid();
    pending.set(id, file.text);
  }
  const take = (extension: string, name?: string): string => {
    const id = `${extension}:${name ?? ''}`.toLowerCase();
    const text = pending.get(id);
    if (text === undefined) throw invalid();
    pending.delete(id);
    return text;
  };
  for (const field of fields) {
    const holder = parent(document, field.path, invalid);
    const last = field.path.at(-1)!;
    if (field.each === undefined) {
      if (Object.hasOwn(holder, last)) throw invalid();
      holder[last] = take(field.extension);
      continue;
    }
    for (const element of elements(holder, last, invalid)) {
      const name = element[field.key ?? ''];
      if (typeof name !== 'string' || !safeName.test(name) || Object.hasOwn(element, field.each))
        throw invalid();
      element[field.each] = take(field.extension, name);
    }
  }
  if (pending.size > 0) throw invalid();
  return document;
}

/**
 * Path of a code file next to its JSON file: `X.type-meta.json` → `X.type-meta.sql`, or
 * `X.type-meta.<name>.sql` for an array element.
 * @param {string} jsonPath Path of the JSON file, ending in `-meta.json`.
 * @param {Pick<CodeFile, 'extension' | 'name'>} file Code file.
 * @returns {string} Code file path.
 */
export function codeFilePath(jsonPath: string, file: Pick<CodeFile, 'extension' | 'name'>): string {
  if (!jsonPath.endsWith('-meta.json')) throw new Error('Code files sit next to -meta.json files.');
  return `${jsonPath.slice(0, -'json'.length)}${file.name === undefined ? '' : `${file.name}.`}${file.extension}`;
}
