import { randomUUID } from 'node:crypto';
import { access, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Output format of a member export. */
export type MemberFormat = 'csv' | 'json';

/** Column delimiters of the CSV output. */
export const memberDelimiters = {
  COMMA: ',',
  SEMICOLON: ';',
  TAB: '\t',
  PIPE: '|',
  CARET: '^',
  BACKQUOTE: '`',
} as const;

/** `--column-delimiter` values: a name of memberDelimiters or the character itself (not TAB). */
export const memberDelimiterOptions = [
  ...Object.keys(memberDelimiters),
  ...Object.values(memberDelimiters).filter((character) => character !== '\t'),
];

/**
 * The delimiter character of a `--column-delimiter` value.
 * @param {string} value A name of memberDelimiters or the character itself.
 * @returns {string} Delimiter character.
 */
export function memberDelimiter(value: string): string {
  return (memberDelimiters as Record<string, string>)[value] ?? value;
}

/**
 * Column headers of the detail output: each column's label (an empty label falls back to its
 * API name) or its API name; a header used already gets a stable `_2`, `_3`, ... suffix in
 * column order.
 * @param {Array<{ name: string; label: string }>} columns Detail columns.
 * @param {'label' | 'api-name'} mode Header source.
 * @returns {string[]} One unique header per column.
 */
export function memberColumnHeaders(
  columns: ReadonlyArray<{ name: string; label: string }>,
  mode: 'label' | 'api-name',
): string[] {
  const used = new Set<string>();
  return columns.map(({ name, label }) => {
    const base = mode === 'label' ? label.trim() || name : name;
    let header = base;
    for (let suffix = 2; used.has(header); suffix++) header = `${base}_${suffix}`;
    used.add(header);
    return header;
  });
}

/**
 * A CSV cell: text as is, other values as JSON, quoted when needed.
 * @param {unknown} value Cell value.
 * @param {string} delimiter Column delimiter.
 * @returns {string} Cell text.
 */
export function csvCell(value: unknown, delimiter: string): string {
  const cell =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return cell.includes(delimiter) || /["\r\n]/u.test(cell)
    ? `"${cell.replaceAll('"', '""')}"`
    : cell;
}

/**
 * Two-digit number.
 * @param {number} value Number below 100.
 * @returns {string} Padded text.
 */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A file name part made from a segment name (letters, digits and underscores only).
 * @param {string} apiName Segment API name.
 * @param {Date} now Time of the export.
 * @returns {string} `<Name>-<YYYY-MM-DD_HH-mm-ss>`.
 */
function defaultStem(apiName: string, now: Date): string {
  return `${apiName}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

/**
 * The output file: the given path, or a new `data/<dataSpace>/<Name>-<timestamp>.<format>`
 * below the working directory (never a `data360/` definition folder).
 * @param {string | undefined} requested --output-file value.
 * @param {string} apiName Segment API name (already checked as an identifier).
 * @param {MemberFormat} format Output format.
 * @param {string} cwd Working directory.
 * @param {Date} [now] Time of the export.
 * @returns {Promise<string>} Absolute output path.
 */
export async function memberOutputFile(
  requested: string | undefined,
  apiName: string,
  format: MemberFormat,
  cwd: string,
  now = new Date(),
): Promise<string> {
  if (requested !== undefined) return path.resolve(cwd, requested);
  const directory = path.join(cwd, 'data', 'default');
  const stem = defaultStem(apiName, now);
  for (let suffix = 1; ; suffix++) {
    const candidate = path.join(directory, `${stem}${suffix === 1 ? '' : `_${suffix}`}.${format}`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
}

/** Receives the rows of each page in order. */
export type RowSink = {
  write: (rows: Array<Record<string, unknown>>) => Promise<void>;
};

/**
 * Stream rows into a temporary file beside the output and rename it into place only when
 * every page was read; on failure the temporary file is removed and no output is left.
 * @param {string} file Absolute output path (an existing file is replaced).
 * @param {MemberFormat} format CSV (header from the first row or the given columns) or a JSON array.
 * @param {string} delimiter CSV column delimiter.
 * @param {string[] | undefined} columns Fixed CSV header, or undefined to use the first row's keys.
 * @param {(sink: RowSink) => Promise<void>} produce Writes all rows through the sink.
 * @returns {Promise<number>} Rows written.
 */
export async function writeMemberExport(
  file: string,
  format: MemberFormat,
  delimiter: string,
  columns: string[] | undefined,
  produce: (sink: RowSink) => Promise<void>,
): Promise<number> {
  await mkdir(path.dirname(file), { recursive: true });
  const partial = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.partial`);
  const handle = await open(partial, 'wx');
  let rows = 0;
  let header = columns;
  try {
    if (format === 'json') await handle.appendFile('[', 'utf8');
    else if (header)
      await handle.appendFile(
        `${header.map((name) => csvCell(name, delimiter)).join(delimiter)}\n`,
        'utf8',
      );
    await produce({
      write: async (page) => {
        let chunk = '';
        for (const row of page) {
          if (format === 'json') chunk += `${rows === 0 ? '\n' : ',\n'}  ${JSON.stringify(row)}`;
          else {
            if (!header) {
              header = Object.keys(row);
              chunk += `${header.map((name) => csvCell(name, delimiter)).join(delimiter)}\n`;
            }
            chunk += `${header.map((name) => csvCell(row[name], delimiter)).join(delimiter)}\n`;
          }
          rows++;
        }
        if (chunk) await handle.appendFile(chunk, 'utf8');
      },
    });
    if (format === 'json') await handle.appendFile(rows === 0 ? ']\n' : '\n]\n', 'utf8');
    await handle.close();
    await rename(partial, file);
    return rows;
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(partial).catch(() => {});
    throw error;
  }
}
