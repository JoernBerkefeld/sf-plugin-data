import { operatorWords, reservedWords } from './cross-dataspace-sql.js';
import type { SqlToken } from './sql-tokens.js';
import { isSqlTokenProblem, tokenizeSql } from './sql-tokens.js';

/** The warning code of SQL that Salesforce accepts on create and publish but cannot run. */
export const ciSqlFailsSilentlyCode = 'CI_SQL_FAILS_SILENTLY';

/** One construct of an insight's SQL that makes the insight fail after publish. */
export type CalculatedInsightSqlFinding = {
  line: number;
  column: number;
  /** What was found, for example `a -- comment`. */
  construct: string;
  /** How to write it instead. */
  fix: string;
};

/** The two dialects with proven silent failures; any other value is not checked. */
type Dialect = 'classic' | 'dc-sql';

// Words that end a select list or a FROM clause in the same query block.
const clauseEnd = new Set([
  'FROM',
  'WHERE',
  'GROUP',
  'HAVING',
  'QUALIFY',
  'WINDOW',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'MINUS',
]);
const objectLike = /__(?:dlm|cio|dll)$/iu;

/**
 * The dialect of a `queryDialect` value, in either spelling (`ANSI_SQL` or `AnsiSql`).
 * @param {unknown} value `queryDialect` of the file.
 * @returns {Dialect | undefined} Dialect, or undefined when missing or unknown.
 */
function dialectOf(value: unknown): Dialect | undefined {
  if (typeof value !== 'string') return undefined;
  const plain = value.replaceAll('_', '').toLowerCase();
  if (plain === 'ansisql') return 'classic';
  if (plain === 'dcsql') return 'dc-sql';
  return undefined;
}

/**
 * Find the constructs of a calculated insight's SQL that Salesforce accepts on create and publish
 * but then fails a few minutes later (ERROR, CREATE_FAILED, no message; live API 68):
 * - classic (`ANSI_SQL`): a table alias of an object in FROM or JOIN (with or without AS), a quoted
 *   column alias (double quotes or backticks), a text literal as a column, a `--` comment;
 * - SQL Insights Builder (`DC_SQL`): a column alias in backticks.
 * Texts and comments are never read as code. SQL the tokenizer cannot read, and a missing or
 * unknown dialect, give no findings.
 * @param {string} sql The insight's SQL.
 * @param {unknown} queryDialect The file's `queryDialect`.
 * @returns {CalculatedInsightSqlFinding[]} Findings in text order.
 */
export function findSilentSqlFailures(
  sql: string,
  queryDialect: unknown,
): CalculatedInsightSqlFinding[] {
  const dialect = dialectOf(queryDialect);
  if (dialect === undefined) return [];
  const tokens = tokenizeSql(sql);
  if (isSqlTokenProblem(tokens)) return [];
  const findings: CalculatedInsightSqlFinding[] = [];
  const add = (token: SqlToken, construct: string, fix: string): void => {
    findings.push({ line: token.line, column: token.column, construct, fix });
  };
  if (dialect === 'classic')
    for (const token of tokens)
      if (token.kind === 'comment' && token.text.startsWith('--'))
        add(token, 'a -- comment', 'remove the comment');
  const sig = tokens.filter((token) => token.kind !== 'space' && token.kind !== 'comment');
  const match = new Map<number, number>();
  const open: number[] = [];
  for (const [p, token] of sig.entries())
    if (token.kind === 'punct' && token.text === '(') open.push(p);
    else if (token.kind === 'punct' && token.text === ')') {
      const start = open.pop();
      if (start === undefined) return sortFindings(findings);
      match.set(start, p);
    }
  if (open.length > 0) return sortFindings(findings);
  const upper = (p: number, end: number): string =>
    p < end && sig[p].kind === 'word' ? sig[p].text.toUpperCase() : '';
  const isPunct = (p: number, text: string, end: number): boolean =>
    p < end && sig[p].kind === 'punct' && sig[p].text === text;
  const isName = (p: number, end: number): boolean =>
    p < end && (sig[p].kind === 'word' || sig[p].kind === 'quoted');
  const skip = (p: number): number => (isPunct(p, '(', sig.length) ? match.get(p)! + 1 : p + 1);
  const isClauseEnd = (p: number, end: number): boolean =>
    clauseEnd.has(upper(p, end)) || isPunct(p, ';', end);

  const selectItem = (begin: number, end: number): void => {
    const last = end - 1;
    const before = last - 1;
    const hasAs = before >= begin && upper(before, end) === 'AS';
    const operand =
      before >= begin &&
      (isPunct(before, ')', end) ||
        ['number', 'string', 'quoted'].includes(sig[before].kind) ||
        (sig[before].kind === 'word' && !operatorWords.has(upper(before, end))));
    const aliased =
      last > begin &&
      isName(last, end) &&
      !isPunct(before, '.', end) &&
      (hasAs || (!reservedWords.has(upper(last, end)) && operand));
    const alias = aliased ? sig[last] : undefined;
    if (alias?.kind === 'quoted') {
      const unquoted = `write the alias without quotes (${alias.value ?? ''})`;
      if (dialect === 'classic') add(alias, `a quoted column alias ${alias.text}`, unquoted);
      else if (alias.quote === '`')
        add(alias, `a column alias in backticks ${alias.text}`, unquoted);
    }
    // A text literal alone as a column, with or without an alias.
    if (
      dialect === 'classic' &&
      sig[begin].kind === 'string' &&
      (end === begin + 1 || (aliased && (hasAs ? before === begin + 1 : last === begin + 1)))
    )
      add(
        sig[begin],
        `a text literal ${sig[begin].text} as a column`,
        'remove it, or build the insight in the SQL Insights Builder (DC_SQL)',
      );
  };

  const selectList = (from: number, to: number): void => {
    let p = from;
    while (['DISTINCT', 'ALL'].includes(upper(p, to))) p++;
    let start = p;
    for (; p < to; p = skip(p))
      if (isPunct(p, ',', to)) {
        if (p > start) selectItem(start, p);
        start = p + 1;
      }
    if (start < to) selectItem(start, to);
  };

  const fromClause = (from: number, to: number): void => {
    let tableStart = true;
    for (let p = from; p < to; p = skip(p)) {
      if (isPunct(p, ',', to) || upper(p, to) === 'JOIN') {
        tableStart = true;
        continue;
      }
      if (!tableStart) continue;
      tableStart = false;
      if (
        !isName(p, to) ||
        !objectLike.test(sig[p].kind === 'quoted' ? (sig[p].value ?? '') : sig[p].text) ||
        isPunct(p + 1, '(', to) ||
        isPunct(p + 1, '.', to)
      )
        continue;
      let aliasAt = p + 1;
      if (upper(aliasAt, to) === 'AS') aliasAt++;
      if (
        isName(aliasAt, to) &&
        !reservedWords.has(upper(aliasAt, to)) &&
        !['ON', 'USING', 'TABLESAMPLE'].includes(upper(aliasAt, to))
      ) {
        const table = sig[p].kind === 'quoted' ? (sig[p].value ?? '') : sig[p].text;
        add(
          sig[aliasAt],
          `the table alias ${sig[aliasAt].text} of ${table}`,
          `write the full object name in front of each field (${table}.Field__c) and drop the alias`,
        );
      }
    }
  };

  // Every query block, at every depth: its select list and, in classic SQL, its FROM clause.
  const scan = (from: number, to: number): void => {
    for (let p = from; p < to; p = skip(p)) {
      if (isPunct(p, '(', to)) scan(p + 1, match.get(p)!);
      if (upper(p, to) !== 'SELECT') continue;
      let end = p + 1;
      while (end < to && !isClauseEnd(end, to)) end = skip(end);
      selectList(p + 1, end);
      if (dialect !== 'classic' || upper(end, to) !== 'FROM') continue;
      let fromEnd = end + 1;
      while (fromEnd < to && !isClauseEnd(fromEnd, to)) fromEnd = skip(fromEnd);
      fromClause(end + 1, fromEnd);
    }
  };
  scan(0, sig.length);
  return sortFindings(findings);
}

/**
 * Findings in text order.
 * @param {CalculatedInsightSqlFinding[]} findings Findings.
 * @returns {CalculatedInsightSqlFinding[]} The same, sorted by line and column.
 */
function sortFindings(findings: CalculatedInsightSqlFinding[]): CalculatedInsightSqlFinding[] {
  // eslint-disable-next-line unicorn/no-array-sort -- Sorting the array built here.
  return findings.sort((left, right) => left.line - right.line || left.column - right.column);
}

/**
 * The deploy warnings of one calculated insight: one per finding, naming its SQL file, line and
 * column, the construct and the fix. The deploy goes ahead; Salesforce decides.
 * @param {string} sql The insight's SQL.
 * @param {unknown} queryDialect The file's `queryDialect`.
 * @param {string} file The SQL file as shown to the user.
 * @returns {string[]} Warnings.
 */
export function silentSqlFailureWarnings(
  sql: string,
  queryDialect: unknown,
  file: string,
): string[] {
  const dialect = dialectOf(queryDialect);
  const kind = dialect === 'classic' ? 'a classic (ANSI_SQL) insight' : 'a DC_SQL insight';
  return findSilentSqlFailures(sql, queryDialect).map(
    (finding) =>
      `${ciSqlFailsSilentlyCode}: ${file} line ${finding.line}:${finding.column}: ${finding.construct} in ${kind}. Salesforce accepts it on deploy and publish, but the insight then ends in ERROR (CREATE_FAILED) without a message; ${finding.fix}.`,
  );
}
