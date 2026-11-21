/**
 * One token of a SQL text. Every character of the text belongs to exactly one token, so joining
 * the `text` of all tokens gives the text back.
 * - `word`: an unquoted identifier or keyword (`[A-Za-z_][A-Za-z0-9_]*`).
 * - `quoted`: an identifier in double quotes or backticks; `value` is its name without quotes.
 * - `string`: a text literal in single quotes; never a name.
 * - `number`, `space`, `comment` (`--` to the end of the line, or `/* … *\/`).
 * - `punct`: any other single character (`.`, `,`, `(`, `)`, operators).
 */
export type SqlToken = {
  kind: 'word' | 'quoted' | 'string' | 'number' | 'space' | 'comment' | 'punct';
  text: string;
  /** Offset of the first character. */
  start: number;
  /** 1-based line and column of the first character. */
  line: number;
  column: number;
  /** For `quoted`: the name without quotes (a doubled quote stands for one). */
  value?: string;
  /** For `quoted`: the quote character. */
  quote?: '"' | '`';
};

/** A text the tokenizer cannot read exactly: where and why. */
export type SqlTokenProblem = { line: number; column: number; reason: string };

const wordStart = /[A-Za-z_]/u;
const wordPart = /[A-Za-z0-9_]/u;
const digit = /[0-9]/u;

/**
 * Split a SQL text into tokens. Single quotes are text, double quotes and backticks are
 * identifiers (`""` and ``` `` ``` stand for one quote), and comments are `--` lines and
 * `/* … *\/` blocks. What the dialects read differently is refused, never guessed: a backslash
 * before a quote in a text (an escape in Spark SQL, a plain character in ANSI SQL), a block
 * comment that opens another one inside (nested in some dialects only), and anything left open
 * at the end.
 * @param {string} sql SQL text.
 * @returns {SqlToken[] | SqlTokenProblem} Tokens, or where the text cannot be read exactly.
 */
export function tokenizeSql(sql: string): SqlToken[] | SqlTokenProblem {
  const tokens: SqlToken[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  const advance = (to: number): void => {
    for (let at = index; at < to; at++)
      if (sql[at] === '\n') {
        line++;
        column = 1;
      } else column++;
    index = to;
  };
  const push = (kind: SqlToken['kind'], end: number, extra: Partial<SqlToken> = {}): void => {
    tokens.push({ kind, text: sql.slice(index, end), start: index, line, column, ...extra });
    advance(end);
  };
  const problem = (reason: string): SqlTokenProblem => ({ line, column, reason });
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/u.test(char)) {
      let end = index + 1;
      while (end < sql.length && /\s/u.test(sql[end])) end++;
      push('space', end);
    } else if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      push('comment', end === -1 ? sql.length : end);
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) return problem('a block comment is not closed');
      if (sql.slice(index + 2, end).includes('/*'))
        return problem(
          'a block comment opens another one inside; SQL dialects disagree on where it ends',
        );
      push('comment', end + 2);
    } else if (char === "'") {
      let end = index + 1;
      for (;;) {
        if (end >= sql.length) return problem('a text in single quotes is not closed');
        if (sql[end] === '\\' && sql[end + 1] === "'")
          return problem(
            'a text in single quotes holds a backslash before a quote; SQL dialects disagree on where it ends',
          );
        if (sql[end] === "'") {
          if (sql[end + 1] === "'") {
            end += 2;
            continue;
          }
          break;
        }
        end++;
      }
      push('string', end + 1);
    } else if (char === '"' || char === '`') {
      let end = index + 1;
      let value = '';
      for (;;) {
        if (end >= sql.length) return problem(`a name in ${char} quotes is not closed`);
        if (sql[end] === char) {
          if (sql[end + 1] === char) {
            value += char;
            end += 2;
            continue;
          }
          break;
        }
        value += sql[end];
        end++;
      }
      push('quoted', end + 1, { value, quote: char });
    } else if (wordStart.test(char)) {
      let end = index + 1;
      while (end < sql.length && wordPart.test(sql[end])) end++;
      push('word', end);
    } else if (digit.test(char)) {
      let end = index + 1;
      while (end < sql.length && /[0-9.]/u.test(sql[end])) end++;
      if (/[eE]/u.test(sql[end] ?? '') && /[0-9+-]/u.test(sql[end + 1] ?? '')) {
        end += 2;
        while (end < sql.length && digit.test(sql[end])) end++;
      }
      // A number directly followed by letters (`1d`, `2L`) is one number token.
      while (end < sql.length && wordPart.test(sql[end])) end++;
      push('number', end);
    } else push('punct', index + 1);
  }
  return tokens;
}

/**
 * Whether a tokenizer answer is a problem.
 * @param {SqlToken[] | SqlTokenProblem} result Tokenizer answer.
 * @returns {boolean} Whether the text could not be read.
 */
export function isSqlTokenProblem(result: SqlToken[] | SqlTokenProblem): result is SqlTokenProblem {
  return !Array.isArray(result);
}

/**
 * The name a word or quoted token stands for.
 * @param {SqlToken} token Token.
 * @returns {string | undefined} Name; undefined for other kinds.
 */
export function tokenName(token: SqlToken): string | undefined {
  if (token.kind === 'word') return token.text;
  if (token.kind === 'quoted') return token.value;
  return undefined;
}

/**
 * The text of a name token spelled with a new name, in the token's own quotes.
 * @param {SqlToken} token Word or quoted token.
 * @param {string} name New name.
 * @returns {string} Token text.
 */
export function spellToken(token: SqlToken, name: string): string {
  if (token.kind !== 'quoted' || token.quote === undefined) return name;
  return `${token.quote}${name.replaceAll(token.quote, token.quote + token.quote)}${token.quote}`;
}
