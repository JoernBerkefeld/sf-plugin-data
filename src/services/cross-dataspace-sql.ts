import type {
  CrossSpaceRewrite,
  CrossSpaceRule,
  CrossSpaceUnresolved,
  DmoKind,
  NotPlaced,
  Placed,
} from './cross-dataspace-rename.js';
import type { SqlToken } from './sql-tokens.js';
import { isSqlTokenProblem, spellToken, tokenName, tokenizeSql } from './sql-tokens.js';

/** How the SQL rewrite places names: the rule engine of the cross-data-space deploy. */
export type SqlNamer = {
  /** A table name: a DMO (`__dlm`), an insight (`__cio`) or a DLO (`__dll`, kept as it is). */
  object(name: string): Placed | NotPlaced | 'dlo';
  /** A field of a placed DMO or insight. */
  field(kind: DmoKind, field: string): { name: string; rule?: CrossSpaceRule };
  /** A field of a table the rules do not know (a table function), placed only when it never changes. */
  anyField(field: string): { name: string; rule?: CrossSpaceRule } | NotPlaced;
  /** Why a name is still in the source spelling after the rewrite, or undefined. */
  leftover(name: string): string | undefined;
  /** Why a name of the source is not in the spelling the rules read (its case), or undefined. */
  spelling(name: string): string | undefined;
};

/** The SQL in the target data space, with every change and every name it cannot place. */
export type SqlTranslation = {
  sql: string;
  rewrites: CrossSpaceRewrite[];
  unresolved: CrossSpaceUnresolved[];
  /**
   * The `*` the outermost query of each statement puts out, with whether it reads only DLOs (whose
   * columns keep their names). Only translateSql fills it in.
   */
  outputs?: {
    stars: Array<{ at: string; name: string; dlo: boolean }>;
  };
};

/**
 * The output field a column the SQL puts out lands in, by its source name (a DCSQL transform):
 * the field's target name and the rule that placed it, or undefined when no field has that name.
 */
export type OutputField = (name: string) => { name: string; rule?: CrossSpaceRule } | undefined;

/** What a table in scope answers for a column name. */
type FieldAnswer =
  | { owns: false }
  | { owns: true; skip: true }
  | { owns: true; name: string; rule?: CrossSpaceRule }
  | { owns: true; reason: string };

/** A table in the FROM clause of one query: its qualifiers and how its columns are named. */
type Source = {
  /** Alias and table name, lowercase. */
  qualifiers: string[];
  /** The table name token, when the source is a placed object (it can qualify a column too). */
  objectName?: string;
  objectTo?: { name: string; rule?: CrossSpaceRule };
  /** The table could not be placed (already reported): its columns are left as they are. */
  refused?: boolean;
  /** A DLO: every column keeps its name. */
  keeps?: boolean;
  columns: (field: string) => FieldAnswer;
};

/** One query block's tables, its select aliases (with their uses), and the enclosing block. */
type Scope = {
  sources: Source[];
  aliases: Set<string>;
  aliasUses?: Map<string, number[]>;
  parent?: Scope;
};

/**
 * The columns a WITH block or subquery puts out: old name (lowercase) to answer, and `*` sources.
 * `names` holds the token of each named column (its alias, or the column itself when it has
 * none), `starAt` the `*` tokens with their tables.
 */
type Columns = {
  named: Map<string, FieldAnswer>;
  stars: Source[];
  names?: Array<{ token: number; aliased: boolean }>;
  /** Token indices of each alias's uses after the select list of its block (alias lowercase). */
  aliasUses?: Map<string, number[]>;
  /** The alias uses of the ordering clauses only (ORDER BY, SORT BY, DISTRIBUTE BY, CLUSTER BY). */
  orderUses?: Map<string, number[]>;
  starAt?: Array<{ token: number; sources: Source[] }>;
};

/** A WITH block visible to a query. */
type Cte = { name: string; columns: Columns };

/** Where the analysis writes; swapped for a dry run. */
type Collector = {
  edits: Map<number, { to: string; rule?: CrossSpaceRule }>;
  unresolved: Map<number, string>;
  seen: Set<number>;
  userNames: Set<number>;
};

const clauseWords = new Set([
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
  'CLUSTER',
  'DISTRIBUTE',
  'SORT',
]);
// The clauses in which a name equal to a select alias reads the alias.
const aliasClauseWords = new Set(['HAVING', 'QUALIFY', 'ORDER', 'CLUSTER', 'DISTRIBUTE', 'SORT']);
const setWords = new Set(['UNION', 'INTERSECT', 'EXCEPT', 'MINUS']);
const joinWords = new Set([
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'NATURAL',
  'SEMI',
  'ANTI',
  'LATERAL',
]);
// Words that end an expression but are never an alias.
export const reservedWords: ReadonlySet<string> = new Set([
  ...clauseWords,
  ...setWords,
  ...joinWords,
  'ALL',
  'AND',
  'AS',
  'ASC',
  'BETWEEN',
  'BY',
  'CASE',
  'DAY',
  'DESC',
  'DISTINCT',
  'ELSE',
  'END',
  'FALSE',
  'FIRST',
  'FOLLOWING',
  'HOUR',
  'IN',
  'INTERVAL',
  'IS',
  'LAST',
  'LIKE',
  'MINUTE',
  'MONTH',
  'NOT',
  'NULL',
  'NULLS',
  'ON',
  'OR',
  'OVER',
  'PARTITION',
  'PRECEDING',
  'RANGE',
  'ROW',
  'ROWS',
  'SECOND',
  'SELECT',
  'THEN',
  'TRUE',
  'UNBOUNDED',
  'USING',
  'VALUES',
  'WEEK',
  'WHEN',
  'WITH',
  'YEAR',
]);

// A join word that is never a function name, so it starts a join also before a parenthesis.
const joinOnlyWords = new Set([
  'JOIN',
  'INNER',
  'OUTER',
  'CROSS',
  'NATURAL',
  'FULL',
  'SEMI',
  'ANTI',
]);
// Words after which the next word is an operand, never a column alias (NULL, TRUE, FALSE and END
// end an operand, so a word after them can be an alias).
export const operatorWords: ReadonlySet<string> = new Set([
  'ALL',
  'AND',
  'ANY',
  'AS',
  'BETWEEN',
  'BY',
  'CASE',
  'COLLATE',
  'DISTINCT',
  'DIV',
  'ELSE',
  'ESCAPE',
  'EXISTS',
  'ILIKE',
  'IN',
  'INTERVAL',
  'IS',
  'LIKE',
  'MOD',
  'NOT',
  'ON',
  'OR',
  'OVER',
  'REGEXP',
  'RLIKE',
  'SIMILAR',
  'SOME',
  'THEN',
  'TO',
  'WHEN',
  'XOR',
  'ZONE',
]);

// An HTML character reference as Salesforce writes it into returned SQL.
const htmlEntity = /&(?:#\d+|#x[\da-f]+|quot|amp|lt|gt|apos);/iu;

// Spark and Data Cloud SQL read names without regard to case.
const fieldLike = /__c$/iu;
const objectLike = /__(?:dlm|cio|dll)$/iu;

/**
 * Whether a name looks like a Data Cloud object or field name the rewrite must account for.
 * @param {string} name Name.
 * @returns {boolean} Name-like.
 */
function nameLike(name: string): boolean {
  return fieldLike.test(name) || objectLike.test(name) || name.toLowerCase().includes('ssot__');
}

/**
 * Combine what every table that may own a column answers: no owner, a refusal, one name, or a
 * refusal when the owners would spell it differently.
 * @param {FieldAnswer[]} answers Answers.
 * @param {string} field Column name.
 * @returns {FieldAnswer} Combined answer.
 */
function agree(answers: FieldAnswer[], field: string): FieldAnswer {
  const owners = answers.filter((answer) => answer.owns);
  if (owners.length === 0) return { owns: false };
  const refusal = owners.find((answer) => 'reason' in answer);
  if (refusal) return refusal;
  const named = owners.filter(
    (answer): answer is { owns: true; name: string; rule?: CrossSpaceRule } => 'name' in answer,
  );
  if (named.length === 0) return { owns: true, skip: true };
  const names = new Set(named.map((answer) => answer.name));
  if (names.size > 1)
    return {
      owns: true,
      reason: `${field} has no table name in front, and the tables that could own it spell it differently in the target data space (${[...names].join(', ')}); write the table or alias in front of it`,
    };
  return named.find((answer) => answer.rule !== undefined) ?? named[0];
}

/**
 * The columns of a WITH block or subquery as a table answers them.
 * @param {Columns} columns Its columns.
 * @returns {(field: string) => FieldAnswer} Column lookup.
 */
function derivedColumns(columns: Columns): (field: string) => FieldAnswer {
  return (field) => {
    const named = columns.named.get(field.toLowerCase());
    if (named) return named;
    if (columns.stars.length === 0) return { owns: false };
    return agree(
      columns.stars.map((source) => source.columns(field)),
      field,
    );
  };
}

/** One SQL text under analysis. */
class SqlAnalysis {
  private readonly sig: number[];
  private readonly match = new Map<number, number>();
  private out: Collector = {
    edits: new Map(),
    unresolved: new Map(),
    seen: new Set(),
    userNames: new Set(),
  };
  /** The columns the outermost query of each statement puts out. */
  public readonly statements: Columns[] = [];

  public constructor(
    private readonly tokens: SqlToken[],
    private readonly namer: SqlNamer,
  ) {
    this.sig = tokens.flatMap((token, index) =>
      token.kind === 'space' || token.kind === 'comment' ? [] : [index],
    );
  }

  /**
   * Run the analysis over the whole text.
   * @returns {Collector | string} What was found, or why the text has no readable structure.
   */
  public run(): Collector | string {
    const open: number[] = [];
    for (let p = 0; p < this.sig.length; p++) {
      const text = this.tok(p).text;
      if (this.tok(p).kind !== 'punct') continue;
      if (text === '(') open.push(p);
      else if (text === ')') {
        const start = open.pop();
        if (start === undefined) return 'its parentheses do not match';
        this.match.set(start, p);
      }
    }
    if (open.length > 0) return 'its parentheses do not match';
    let start = 0;
    for (let p = 0; p <= this.sig.length; p++)
      if (p === this.sig.length || this.isPunct(p, ';')) {
        if (p > start) this.statements.push(this.query(start, p, undefined, []));
        start = p + 1;
      }
    return this.out;
  }

  private tok(p: number): SqlToken {
    return this.tokens[this.sig[p]];
  }

  private upper(p: number, end: number): string {
    return p < end && this.tok(p).kind === 'word' ? this.tok(p).text.toUpperCase() : '';
  }

  private isPunct(p: number, text: string, end = this.sig.length): boolean {
    return p < end && this.tok(p).kind === 'punct' && this.tok(p).text === text;
  }

  private isName(p: number, end: number): boolean {
    return p < end && (this.tok(p).kind === 'word' || this.tok(p).kind === 'quoted');
  }

  private nameAt(p: number): string {
    return tokenName(this.tok(p)) ?? '';
  }

  /**
   * The position after a token, jumping over a parenthesis group.
   * @param {number} p Position among the significant tokens.
   * @returns {number} The next position.
   */
  private skip(p: number): number {
    return this.isPunct(p, '(') ? this.match.get(p)! + 1 : p + 1;
  }

  private refuse(p: number, reason: string): void {
    const index = this.sig[p];
    if (!this.out.unresolved.has(index)) this.out.unresolved.set(index, reason);
    this.out.seen.add(index);
  }

  private keep(p: number, userName = false): void {
    this.out.seen.add(this.sig[p]);
    if (userName) this.out.userNames.add(this.sig[p]);
  }

  private edit(p: number, to: { name: string; rule?: CrossSpaceRule }): void {
    this.out.seen.add(this.sig[p]);
    if (to.name !== this.nameAt(p)) this.out.edits.set(this.sig[p], { to: to.name, rule: to.rule });
  }

  /**
   * Whether a parenthesis group holds a query.
   * @param {number} p Position among the significant tokens.
   * @returns {boolean} Whether it starts with SELECT or WITH.
   */
  private holdsQuery(p: number): boolean {
    const inner = p + 1;
    const end = this.match.get(p)!;
    return ['SELECT', 'WITH'].includes(this.upper(inner, end));
  }

  /**
   * A query: an optional WITH list, then select blocks joined by set operators.
   * @param {number} from First position of the range.
   * @param {number} to End of the range (exclusive).
   * @param {Scope | undefined} outer The enclosing query block, if any.
   * @param {readonly Cte[]} ctes The WITH blocks visible here.
   * @returns {Columns} The columns of its first block.
   */
  private query(from: number, to: number, outer: Scope | undefined, ctes: readonly Cte[]): Columns {
    let p = from;
    let visible = [...ctes];
    if (this.upper(p, to) === 'WITH') {
      p++;
      const recursive = this.upper(p, to) === 'RECURSIVE';
      if (recursive) p++;
      for (;;) {
        if (!this.isName(p, to)) return this.expressionQuery(p, to, outer, visible);
        const nameAt = p;
        const name = this.nameAt(p);
        this.keep(p, true);
        p++;
        let listed: string[] | undefined;
        if (this.isPunct(p, '(', to)) {
          listed = [];
          const close = this.match.get(p)!;
          for (let q = p + 1; q < close; q++)
            if (this.isName(q, close)) {
              listed.push(this.nameAt(q));
              this.keep(q, true);
            }
          p = close + 1;
        }
        if (this.upper(p, to) !== 'AS') return this.expressionQuery(nameAt, to, outer, visible);
        p++;
        while (['NOT', 'MATERIALIZED'].includes(this.upper(p, to))) p++;
        if (!this.isPunct(p, '(', to)) return this.expressionQuery(p, to, outer, visible);
        const close = this.match.get(p)!;
        let columns: Columns;
        if (recursive) {
          // Its own name inside its body: the columns of its first block, from a dry run.
          const real = this.out;
          this.out = {
            edits: new Map(),
            unresolved: new Map(),
            seen: new Set(),
            userNames: new Set(),
          };
          const anchor = this.query(p + 1, close, outer, visible);
          this.out = real;
          columns = this.query(p + 1, close, outer, [
            ...visible,
            { name, columns: listed ? listedColumns(listed) : anchor },
          ]);
        } else columns = this.query(p + 1, close, outer, visible);
        visible = [...visible, { name, columns: listed ? listedColumns(listed) : columns }];
        p = close + 1;
        if (this.isPunct(p, ',', to)) {
          p++;
          continue;
        }
        break;
      }
    }
    return this.setOperations(p, to, outer, visible);
  }

  /**
   * A range that does not read as a query: its names are checked as an expression.
   * @param {number} from First position of the range.
   * @param {number} to End of the range (exclusive).
   * @param {Scope | undefined} outer The enclosing query block, if any.
   * @param {readonly Cte[]} ctes The WITH blocks visible here.
   * @returns {Columns} No known columns.
   */
  private expressionQuery(
    from: number,
    to: number,
    outer: Scope | undefined,
    ctes: readonly Cte[],
  ): Columns {
    this.expression(from, to, outer ?? { sources: [], aliases: new Set() }, ctes);
    return { named: new Map(), stars: [] };
  }

  private setOperations(
    from: number,
    to: number,
    outer: Scope | undefined,
    ctes: readonly Cte[],
  ): Columns {
    const parts: Array<[number, number]> = [];
    let start = from;
    for (let p = from; p < to; p = this.skip(p))
      if (setWords.has(this.upper(p, to))) {
        parts.push([start, p]);
        start = p + 1;
        while (['ALL', 'DISTINCT'].includes(this.upper(start, to))) start++;
      }
    parts.push([start, to]);
    let first: Columns | undefined;
    for (const [begin, end] of parts) {
      let columns: Columns;
      if (this.isPunct(begin, '(', end) && this.holdsQuery(begin)) {
        const close = this.match.get(begin)!;
        columns = this.query(begin + 1, close, outer, ctes);
        if (close + 1 < end)
          this.expression(close + 1, end, outer ?? { sources: [], aliases: new Set() }, ctes);
      } else if (this.upper(begin, end) === 'SELECT')
        columns = this.selectBlock(begin, end, outer, ctes);
      else columns = this.expressionQuery(begin, end, outer, ctes);
      if (first && columns.orderUses) this.setOrderUses(first, columns.orderUses);
      first ??= columns;
    }
    return first!;
  }

  /**
   * The ORDER BY (SORT BY, …) at the end of a set operation reads the columns the operation puts
   * out, which its first branch names, not the aliases of the last branch it is written in. A use
   * of a last-branch alias the first branch also has as an alias follows that one; any other is
   * not placed.
   * @param {Columns} first The columns of the first branch, changed in place.
   * @param {ReadonlyMap<string, number[]>} uses Alias uses in the trailing clauses (token indices).
   */
  private setOrderUses(first: Columns, uses: ReadonlyMap<string, number[]>): void {
    const firstAliases = new Set(
      (first.names ?? [])
        .filter((entry) => entry.aliased)
        .map((entry) => (tokenName(this.tokens[entry.token]) ?? '').toLowerCase()),
    );
    for (const [name, indices] of uses) {
      if (firstAliases.has(name)) {
        first.aliasUses ??= new Map();
        first.aliasUses.set(name, [...(first.aliasUses.get(name) ?? []), ...indices]);
        continue;
      }
      for (const index of indices) {
        this.out.userNames.delete(index);
        if (!this.out.unresolved.has(index))
          this.out.unresolved.set(
            index,
            'after a set operation (UNION, …) this clause reads the columns the first branch names, and this name is an alias of a later branch only, so its spelling cannot be placed: give the first branch the same alias',
          );
      }
    }
  }

  private selectBlock(
    from: number,
    to: number,
    outer: Scope | undefined,
    ctes: readonly Cte[],
  ): Columns {
    const clauses: Array<{ word: string; at: number }> = [];
    for (let p = from + 1; p < to; p = this.skip(p)) {
      const word = this.upper(p, to);
      if (clauseWords.has(word)) clauses.push({ word, at: p });
    }
    const endOf = (index: number): number => clauses[index + 1]?.at ?? to;
    const scope: Scope = { sources: [], aliases: new Set(), ...(outer ? { parent: outer } : {}) };
    const deferred: Array<() => void> = [];
    const fromIndex = clauses.findIndex((clause) => clause.word === 'FROM');
    if (fromIndex !== -1)
      this.fromClause(clauses[fromIndex].at + 1, endOf(fromIndex), outer, ctes, scope, deferred);
    for (const run of deferred) run();
    const columns = this.selectList(from + 1, clauses[0]?.at ?? to, scope, ctes);
    // Spark reads a name equal to a select alias as that alias only in the clauses above the
    // projection (ORDER BY, SORT BY, DISTRIBUTE BY, CLUSTER BY, and HAVING, which is read against
    // the aggregate's output first; QUALIFY where the dialect has it); there its uses are recorded. WHERE, GROUP BY (a table column
    // wins over an alias there) and WINDOW read the tables' columns.
    // The ordering clauses are kept apart: after a set operation they read its output instead.
    scope.aliasUses = new Map();
    const ordering: Scope = { ...scope, aliasUses: new Map() };
    const tablesOnly: Scope = { ...scope, aliases: new Set() };
    delete tablesOnly.aliasUses;
    for (const [index, clause] of clauses.entries()) {
      if (clause.word === 'FROM') continue;
      const inScope = aliasClauseWords.has(clause.word)
        ? ['HAVING', 'QUALIFY'].includes(clause.word)
          ? scope
          : ordering
        : tablesOnly;
      this.expression(clause.at + 1, endOf(index), inScope, ctes);
    }
    const orderUses = ordering.aliasUses!;
    for (const [name, indices] of orderUses)
      scope.aliasUses.set(name, [...(scope.aliasUses.get(name) ?? []), ...indices]);
    if (scope.aliasUses.size > 0) columns.aliasUses = scope.aliasUses;
    if (orderUses.size > 0) columns.orderUses = orderUses;
    return columns;
  }

  private fromClause(
    from: number,
    to: number,
    outer: Scope | undefined,
    ctes: readonly Cte[],
    scope: Scope,
    deferred: Array<() => void>,
  ): void {
    let p = from;
    // LEFT, RIGHT and LATERAL before a parenthesis are a function; the other join words never are.
    const isJoinStart = (q: number): boolean =>
      joinWords.has(this.upper(q, to)) &&
      (joinOnlyWords.has(this.upper(q, to)) || !this.isPunct(q + 1, '(', to));
    while (p < to) {
      while (isJoinStart(p)) {
        if (this.upper(p, to) === 'LATERAL' && this.upper(p + 1, to) === 'VIEW') p++;
        p++;
      }
      if (this.upper(p, to) === 'OUTER') p++;
      if (p >= to) break;
      const source: Source = { qualifiers: [], columns: () => ({ owns: false }) };
      let tableName: string | undefined;
      if (this.isPunct(p, '(', to)) {
        const close = this.match.get(p)!;
        if (this.holdsQuery(p)) {
          const columns = this.query(p + 1, close, outer, ctes);
          source.columns = derivedColumns(columns);
        } else this.fromClause(p + 1, close, outer, ctes, scope, deferred);
        p = close + 1;
      } else if (this.isName(p, to) && this.isPunct(p + 1, '(', to)) {
        // A table function: its arguments are expressions, its columns unknown.
        const close = this.match.get(p + 1)!;
        this.expression(p + 2, close, outer ?? { sources: [], aliases: new Set() }, ctes);
        source.columns = (field) => this.unknownColumn(field);
        p = close + 1;
      } else if (this.isName(p, to) && this.isPunct(p + 1, '.', to)) {
        // A table name with a schema: not a Data Cloud object the rules know.
        let q = p;
        while (this.isName(q, to) && this.isPunct(q + 1, '.', to)) q += 2;
        for (let r = p; r <= q; r += 2)
          if (nameLike(this.nameAt(r)))
            this.refuse(r, 'a table name with a schema in front is not a name the rules place');
        source.refused = true;
        source.columns = () => ({ owns: true, skip: true });
        p = q + 1;
      } else if (this.isName(p, to)) {
        tableName = this.nameAt(p);
        this.table(p, tableName, ctes, source);
        p++;
      } else {
        p++;
        continue;
      }
      if (tableName !== undefined) source.qualifiers.push(tableName.toLowerCase());
      if (this.upper(p, to) === 'AS') p++;
      if (
        this.isName(p, to) &&
        !reservedWords.has(this.upper(p, to)) &&
        !['ON', 'USING', 'TABLESAMPLE'].includes(this.upper(p, to))
      ) {
        source.qualifiers.unshift(this.nameAt(p).toLowerCase());
        // An alias that looks like a name (`FROM ssot__Individual__dlm ssot__Individual__dlm`)
        // cannot be told apart from the table name it qualifies: refused, not kept.
        if (nameLike(this.nameAt(p)))
          this.refuse(
            p,
            'a table alias that looks like an object or field name cannot be told apart from a name to place; use a short alias such as i',
          );
        else this.keep(p, true);
        p++;
        if (this.isPunct(p, '(', to)) {
          const close = this.match.get(p)!;
          const listed: string[] = [];
          for (let q = p + 1; q < close; q++)
            if (this.isName(q, close)) {
              listed.push(this.nameAt(q));
              this.keep(q, true);
            }
          source.columns = derivedColumns(listedColumns(listed));
          p = close + 1;
        }
      }
      scope.sources.push(source);
      // Up to the next table: ON and USING conditions, and anything else, are read in scope.
      let end = p;
      while (end < to && !this.isPunct(end, ',', to) && !isJoinStart(end)) end = this.skip(end);
      const conditionFrom = p;
      deferred.push(() => this.expression(conditionFrom, end, scope, ctes));
      p = this.isPunct(end, ',', to) ? end + 1 : end;
    }
  }

  /**
   * Place a table name of a FROM clause: a WITH block, an object, or another table.
   * @param {number} p Position among the significant tokens.
   * @param {string} name Table name.
   * @param {readonly Cte[]} ctes The WITH blocks visible here.
   * @param {Source} source The table entry to fill in.
   */
  private table(p: number, name: string, ctes: readonly Cte[], source: Source): void {
    // The latest WITH block of that name hides an earlier one.
    let cte: Cte | undefined;
    for (const entry of ctes) if (entry.name.toLowerCase() === name.toLowerCase()) cte = entry;
    if (cte) {
      this.keep(p, true);
      source.columns = derivedColumns(cte.columns);
      return;
    }
    if (!objectLike.test(name)) {
      if (nameLike(name)) this.refuse(p, 'no rule places this table name');
      source.columns = (field) => this.unknownColumn(field);
      return;
    }
    const placed = this.namer.object(name);
    if (placed === 'dlo') {
      this.keep(p);
      source.keeps = true;
      source.objectName = name.toLowerCase();
      source.objectTo = { name };
      source.columns = (field) => ({ owns: true, name: field });
      return;
    }
    if ('reason' in placed) {
      this.refuse(p, placed.reason);
      source.refused = true;
      source.objectName = name.toLowerCase();
      source.columns = () => ({ owns: true, skip: true });
      return;
    }
    this.edit(p, placed);
    source.objectName = name.toLowerCase();
    source.objectTo = { name: placed.name, ...(placed.rule ? { rule: placed.rule } : {}) };
    source.columns = (field) => ({ owns: true, ...this.namer.field(placed.kind, field) });
  }

  private unknownColumn(field: string): FieldAnswer {
    const placed = this.namer.anyField(field);
    return 'reason' in placed
      ? {
          owns: true,
          reason: `the table in front of it is not one the rules know (${placed.reason})`,
        }
      : { owns: true, ...placed };
  }

  private selectList(from: number, to: number, scope: Scope, ctes: readonly Cte[]): Columns {
    let p = from;
    while (['DISTINCT', 'ALL'].includes(this.upper(p, to))) p++;
    const columns: Columns = { named: new Map(), stars: [] };
    const items: Array<[number, number]> = [];
    let start = p;
    for (; p < to; p = this.skip(p))
      if (this.isPunct(p, ',', to)) {
        items.push([start, p]);
        start = p + 1;
      }
    if (start < to) items.push([start, to]);
    for (const [begin, end] of items) {
      const last = end - 1;
      const before = last - 1;
      const hasAs = before >= begin && this.upper(before, end) === 'AS';
      // Without AS a word is an alias only after a complete operand, not after `NOT`, `OR`, ….
      const operand =
        this.isPunct(before, ')', end) ||
        ['number', 'string', 'quoted'].includes(this.tok(before).kind) ||
        (this.tok(before).kind === 'word' && !operatorWords.has(this.upper(before, end)));
      const aliased =
        last > begin &&
        this.isName(last, end) &&
        !this.isPunct(before, '.', end) &&
        (hasAs || (!reservedWords.has(this.upper(last, end)) && operand));
      if (aliased) {
        const alias = this.nameAt(last);
        // Salesforce accepts a name-like alias without AS after a complete operand; it is a user
        // name, but still goes through the leftover check (`COUNT(x) ssot__Bad__c` is refused).
        this.keep(last, hasAs || !nameLike(alias));
        scope.aliases.add(alias.toLowerCase());
        columns.named.set(alias.toLowerCase(), { owns: true, name: alias });
        (columns.names ??= []).push({ token: this.sig[last], aliased: true });
        this.expression(begin, hasAs ? before : last, scope, ctes);
        continue;
      }
      if (this.isPunct(begin, '*', end) && end === begin + 1) {
        columns.stars.push(...scope.sources);
        (columns.starAt ??= []).push({ token: this.sig[begin], sources: [...scope.sources] });
        continue;
      }
      if (
        end === begin + 3 &&
        this.isName(begin, end) &&
        this.isPunct(begin + 1, '.', end) &&
        this.isPunct(begin + 2, '*', end)
      ) {
        const source = this.qualifier(begin, scope);
        if (source) columns.stars.push(source);
        (columns.starAt ??= []).push({ token: this.sig[begin], sources: source ? [source] : [] });
        continue;
      }
      const single = end === begin + 1 && this.isName(begin, end);
      const qualified =
        end === begin + 3 &&
        this.isName(begin, end) &&
        this.isPunct(begin + 1, '.', end) &&
        this.isName(begin + 2, end);
      if (single || qualified) {
        const fieldAt = single ? begin : begin + 2;
        const field = this.nameAt(fieldAt);
        const answer = single ? this.unqualified(begin, scope) : this.qualified(begin, scope);
        if (answer && answer.owns) columns.named.set(field.toLowerCase(), answer);
        (columns.names ??= []).push({ token: this.sig[fieldAt], aliased: false });
        continue;
      }
      this.expression(begin, end, scope, ctes);
    }
    return columns;
  }

  /**
   * The table a qualifier names in this scope or an enclosing one, marking the qualifier.
   * @param {number} p Position among the significant tokens.
   * @param {Scope} scope The query block the names are read in.
   * @returns {Source | undefined} The table, or undefined when no table of the scope has that qualifier.
   */
  private qualifier(p: number, scope: Scope): Source | undefined {
    const name = this.nameAt(p);
    for (let current: Scope | undefined = scope; current; current = current.parent) {
      const source = current.sources.find((entry) => entry.qualifiers.includes(name.toLowerCase()));
      if (!source) continue;
      // The table name itself (with or without an alias) is spelled like the table.
      if (source.objectName === name.toLowerCase()) {
        if (source.refused) this.refuse(p, 'its table cannot be placed');
        else this.edit(p, source.objectTo!);
      } else this.keep(p, true);
      return source;
    }
    if (objectLike.test(name))
      this.refuse(p, 'it names a table that is not in the FROM clause of this query');
    return undefined;
  }

  /**
   * A column written as `qualifier.column`.
   * @param {number} p Position among the significant tokens.
   * @param {Scope} scope The query block the names are read in.
   * @returns {FieldAnswer | undefined} The answer for the column, or undefined when it is not placed.
   */
  private qualified(p: number, scope: Scope): FieldAnswer | undefined {
    const fieldAt = p + 2;
    const field = this.nameAt(fieldAt);
    const source = this.qualifier(p, scope);
    if (!source) {
      if (nameLike(field) || nameLike(this.nameAt(p)))
        this.refuse(
          fieldAt,
          `${this.nameAt(p)} names no table of this query, so the object of the column is not known`,
        );
      return undefined;
    }
    const answer = source.columns(field);
    return this.applyAnswer(fieldAt, field, answer, `${this.nameAt(p)}.${field}`);
  }

  /**
   * A column without a table in front.
   * @param {number} p Position among the significant tokens.
   * @param {Scope} scope The query block the names are read in.
   * @returns {FieldAnswer | undefined} The answer for the column, or undefined when it is not placed.
   */
  private unqualified(p: number, scope: Scope): FieldAnswer | undefined {
    const field = this.nameAt(p);
    if (!nameLike(field)) return undefined;
    if (objectLike.test(field)) {
      // An object name where a column is expected: it is placed by the object rules.
      const placed = this.namer.object(field);
      if (placed === 'dlo') this.keep(p);
      else if ('reason' in placed) this.refuse(p, placed.reason);
      else this.edit(p, placed);
      return undefined;
    }
    const uses = scope.aliasUses;
    if (uses && scope.aliases.has(field.toLowerCase())) {
      // A clause that reads select aliases (ORDER BY): the alias wins over a table column, and
      // the use follows the alias (see translateSql).
      this.keep(p, true);
      uses.set(field.toLowerCase(), [...(uses.get(field.toLowerCase()) ?? []), this.sig[p]]);
      return { owns: true, name: field };
    }
    const answers: FieldAnswer[] = [];
    // In the select list a later item may read an earlier alias (lateral alias) or the table's
    // column of that name: both readings must agree.
    if (scope.aliases.has(field.toLowerCase())) answers.push({ owns: true, name: field });
    for (let current: Scope | undefined = scope; current; current = current.parent)
      for (const source of current.sources) answers.push(source.columns(field));
    const answer = agree(answers, field);
    if (!answer.owns) {
      this.refuse(
        p,
        'no table of this query can own this column, so its spelling cannot be placed',
      );
      return undefined;
    }
    if (scope.aliases.has(field.toLowerCase()) && 'name' in answer && answer.name === field)
      this.keep(p, true);
    return this.applyAnswer(p, field, answer, field);
  }

  private applyAnswer(
    p: number,
    field: string,
    answer: FieldAnswer,
    shown: string,
  ): FieldAnswer | undefined {
    if (!answer.owns) {
      if (nameLike(field))
        this.refuse(
          p,
          `${shown}: the WITH block or subquery in front of it puts out no column of that name the rewrite can place`,
        );
      else this.keep(p);
      return undefined;
    }
    if ('reason' in answer) {
      this.refuse(p, answer.reason);
      return answer;
    }
    if ('skip' in answer) {
      this.keep(p);
      return answer;
    }
    this.edit(p, answer);
    return answer;
  }

  /**
   * Names in an expression: columns, qualified columns, subqueries.
   * @param {number} from First position of the range.
   * @param {number} to End of the range (exclusive).
   * @param {Scope} scope The query block the names are read in.
   * @param {readonly Cte[]} ctes The WITH blocks visible here.
   */
  private expression(from: number, to: number, scope: Scope, ctes: readonly Cte[]): void {
    let p = from;
    while (p < to) {
      if (this.isPunct(p, '(', to) && this.holdsQuery(p)) {
        const close = this.match.get(p)!;
        this.query(p + 1, close, scope, ctes);
        p = close + 1;
        continue;
      }
      if (!this.isName(p, to)) {
        p++;
        continue;
      }
      if (
        this.isPunct(p + 1, '.', to) &&
        (this.isName(p + 2, to) || this.isPunct(p + 2, '*', to))
      ) {
        let end = p + 2;
        while (this.isPunct(end + 1, '.', to) && this.isName(end + 2, to)) end += 2;
        if (end > p + 2) {
          for (let q = p; q <= end; q += 2)
            if (nameLike(this.nameAt(q)))
              this.refuse(q, 'a name of more than two parts is not one the rules place');
        } else if (this.isPunct(p + 2, '*', to)) this.qualifier(p, scope);
        else if (this.isPunct(end + 1, '(', to)) {
          if (nameLike(this.nameAt(p)) || nameLike(this.nameAt(end)))
            this.refuse(p, 'a function call on a name is not something the rules place');
        } else this.qualified(p, scope);
        p = end + 1;
        continue;
      }
      if (this.isPunct(p + 1, '(', to)) {
        p++;
        continue;
      }
      this.unqualified(p, scope);
      p++;
    }
  }
}

/**
 * The columns of a WITH block or alias with a column list: the listed user names.
 * @param {string[]} listed Column names.
 * @returns {Columns} Columns.
 */
function listedColumns(listed: string[]): Columns {
  return {
    named: new Map(listed.map((name) => [name.toLowerCase(), { owns: true, name }])),
    stars: [],
  };
}

/**
 * The first HTML character reference outside texts, comments and quoted names. `&#39;` outside a
 * text reads as `&`, `#`, `39`, `;`: the `;` would split the statement and a name meant as text
 * would be renamed. Such SQL is an HTML-escaped copy, not SQL to translate.
 * @param {SqlToken[]} tokens Tokens.
 * @returns {{token: SqlToken; text: string} | undefined} The token it starts in and the reference.
 */
function entityOutsideTexts(tokens: SqlToken[]): { token: SqlToken; text: string } | undefined {
  const code = tokens.map((token) =>
    ['string', 'comment', 'quoted'].includes(token.kind)
      ? ' '.repeat(token.text.length)
      : token.text,
  );
  const entity = htmlEntity.exec(code.join(''));
  if (!entity) return undefined;
  let offset = 0;
  const token = tokens.find((_entry, index) => (offset += code[index].length) > entity.index)!;
  return { token, text: entity[0] };
}

/**
 * Rewrite the names of one SQL text into the target data space. Texts in single quotes and
 * comments are never changed; WITH block names, table aliases and column aliases are user names
 * and stay. A table is placed by the object rules, a column by the rules of its table (through
 * its alias, a WITH block or a subquery); a column without a table in front is placed only when
 * every table that could own it spells it the same way. Anything it cannot place exactly is
 * reported with its line and column. Afterwards every name-like token of the result is checked:
 * a name the rewrite did not account for, or one still in the source spelling, is reported too.
 *
 * With `outputField` (a DCSQL transform, whose output columns land in output fields by name) each
 * named column the outermost query of a statement puts out (its first set branch) is checked
 * against the field of its source name: an alias spelled like that field takes the field's target
 * name, and so do its uses in the clauses that read select aliases (ORDER BY, HAVING); a column without an alias is placed only when its name in the target equals the field's
 * target name, or when it changes from no field's name to none.
 * @param {string} sql SQL text.
 * @param {string} label What the positions are reported against (the SQL file name).
 * @param {SqlNamer} namer The rule engine.
 * @param {OutputField} [outputField] The output field of a column name, for a DCSQL transform.
 * @returns {SqlTranslation} Rewritten SQL, its changes and every name it cannot place.
 */
export function translateSql(
  sql: string,
  label: string,
  namer: SqlNamer,
  outputField?: OutputField,
): SqlTranslation {
  const tokens = tokenizeSql(sql);
  if (isSqlTokenProblem(tokens))
    return {
      sql,
      rewrites: [],
      unresolved: [
        {
          at: `${label} line ${tokens.line}:${tokens.column}`,
          name: label,
          reason: `the SQL cannot be read exactly: ${tokens.reason}`,
        },
      ],
    };
  const at = (token: SqlToken): string => `${label} line ${token.line}:${token.column}`;
  const entity = entityOutsideTexts(tokens);
  if (entity)
    return {
      sql,
      rewrites: [],
      unresolved: [
        {
          at: at(entity.token),
          name: entity.text,
          reason:
            'the SQL holds an HTML entity outside texts and comments, so it is an HTML-escaped copy, not SQL that can be read exactly: write the character itself (an older plugin version wrote the model SQL of a DBT segment so from Salesforce; retrieve the segment again and deploy the retrieved file)',
        },
      ],
    };
  const analysis = new SqlAnalysis(tokens, namer);
  const found = analysis.run();
  if (typeof found === 'string')
    return {
      sql,
      rewrites: [],
      unresolved: [
        { at: `${label} line 1:1`, name: label, reason: `the SQL cannot be read: ${found}` },
      ],
    };
  // A name the rules read in another case (`SSOT__ID__C`, `ssot__Individual__DLM`) is not placed.
  for (const [index, token] of tokens.entries()) {
    const name = tokenName(token);
    if (name === undefined || found.userNames.has(index) || !nameLike(name)) continue;
    const reason = namer.spelling(name);
    if (reason === undefined) continue;
    found.unresolved.set(index, reason);
    found.edits.delete(index);
  }
  if (outputField)
    for (const columns of analysis.statements)
      for (const { token, aliased } of columns.names ?? []) {
        if (found.unresolved.has(token)) continue;
        const reason = outputColumn(token, aliased, tokens, found, outputField, columns.aliasUses);
        if (reason === undefined) continue;
        found.unresolved.set(token, reason);
        found.edits.delete(token);
      }
  const rewrites: CrossSpaceRewrite[] = [];
  const unresolved: CrossSpaceUnresolved[] = [];
  const parts = tokens.map((token, index) => {
    const edit = found.edits.get(index);
    if (!edit) return token.text;
    rewrites.push({
      at: at(token),
      from: tokenName(token)!,
      to: edit.to,
      rule: edit.rule ?? 'field-ssot',
    });
    return spellToken(token, edit.to);
  });
  // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array within the ES2022 library target.
  for (const [index, reason] of [...found.unresolved].sort(([left], [right]) => left - right))
    unresolved.push({ at: at(tokens[index]), name: tokenName(tokens[index]) ?? '', reason });
  const result = parts.join('');
  // The coverage check over the result: positions are the same token for token.
  const after = tokenizeSql(result);
  if (isSqlTokenProblem(after) || after.length !== tokens.length) {
    unresolved.push({
      at: `${label} line 1:1`,
      name: label,
      reason: 'the rewritten SQL does not read back token for token',
    });
    return { sql, rewrites, unresolved };
  }
  for (const [index, token] of after.entries()) {
    const name = tokenName(token);
    if (name === undefined || found.unresolved.has(index) || found.userNames.has(index)) continue;
    const leftover = namer.leftover(name);
    if (leftover !== undefined) unresolved.push({ at: at(tokens[index]), name, reason: leftover });
    else if (nameLike(name) && !found.seen.has(index))
      unresolved.push({
        at: at(tokens[index]),
        name,
        reason: 'the rewrite does not cover this name, so it cannot be placed',
      });
  }
  const outputs: NonNullable<SqlTranslation['outputs']> = { stars: [] };
  for (const columns of analysis.statements)
    for (const star of columns.starAt ?? [])
      outputs.stars.push({
        at: at(tokens[star.token]),
        name: tokens[star.token].text,
        dlo: star.sources.length > 0 && star.sources.every((source) => source.keeps),
      });
  return { sql: result, rewrites, unresolved, outputs };
}

/**
 * Check one column the outermost query puts out against the output field of its source name (see
 * translateSql). An alias spelled like the field is rewritten to the field's target name.
 * @param {number} token Token index of the alias, or of the column without an alias.
 * @param {boolean} aliased Whether the token is an alias.
 * @param {SqlToken[]} tokens Tokens.
 * @param {Collector} found The analysis result, changed in place.
 * @param {OutputField} outputField The output field of a column name.
 * @param {ReadonlyMap<string, number[]>} [aliasUses] The uses of each alias in its query block.
 * @returns {string | undefined} Why the column cannot be placed, or undefined.
 */
function outputColumn(
  token: number,
  aliased: boolean,
  tokens: SqlToken[],
  found: Collector,
  outputField: OutputField,
  aliasUses?: ReadonlyMap<string, number[]>,
): string | undefined {
  const from = tokenName(tokens[token]) ?? '';
  const field = outputField(from);
  if (aliased) {
    if (field && field.name.toLowerCase() !== from.toLowerCase())
      // The alias and every use of it in its query block (ORDER BY ssot__Id__c) take the new name.
      for (const index of [token, ...(aliasUses?.get(from.toLowerCase()) ?? [])])
        found.edits.set(index, { to: field.name, rule: field.rule });
    return undefined;
  }
  const to = found.edits.get(token)?.to ?? from;
  const same = to.toLowerCase() === (field?.name ?? from).toLowerCase();
  if (same) return undefined;
  const way = `write the column with AS ${from}, and the alias then takes the output field's target name`;
  if (!field)
    return `this column has no alias, so it puts out a column named ${from}, which names no field of the output object; the translation spells it ${to}, which could land it in another field, so it cannot be placed: write the column with AS and the name of the output field it is meant for`;
  if (to === from)
    return `this column has no alias, so it puts out a column named ${from} into the output field ${from}; the column keeps its name in the target data space while the field is spelled ${field.name} there, so it cannot be placed: ${way}`;
  return `this column has no alias, so it puts out a column named ${from} into the output field ${from}; the translation spells the column ${to} while the field is spelled ${field.name} in the target data space, so it cannot be placed: ${way}`;
}

/** How an SQL expression of an STL node (a formula, a SQL filter) places its column names. */
export type ExpressionNamer = Pick<SqlNamer, 'leftover' | 'spelling'> & {
  /**
   * A column the node reads, with the join side qualifier written before it (`R.Name__c`).
   * @param {string} field Column name.
   * @param {string} [qualifier] Join side qualifier.
   */
  column(field: string, qualifier?: string): { name: string; rule?: CrossSpaceRule } | NotPlaced;
};

// A qualified column inside one quoted name, as STL writes it (`"R.Name__c"`).
const quotedQualified = /^([A-Za-z_][A-Za-z0-9_]*)\.([^.]+)$/u;

/**
 * Rewrite the column names of one SQL expression (an STL formula or SQL filter: no FROM, no
 * tables) into the target data space. Texts in single quotes and comments never change; a
 * function name stays. A column is placed by `namer.column`, alone (`Name__c`) or with its join
 * side qualifier, unquoted (`R.Name__c`) or inside one quoted name (`"R.Name__c"`). An object
 * name, a longer dotted chain, or any name-like token it cannot place exactly is reported with
 * its line and column. Afterwards every name-like token of the result is checked as in
 * translateSql.
 * @param {string} sql Expression text (HTML entities already undone).
 * @param {string} label What the positions are reported against (the JSON path).
 * @param {ExpressionNamer} namer The rule engine for this node.
 * @returns {SqlTranslation} Rewritten expression, its changes and every name it cannot place.
 */
export function translateSqlExpression(
  sql: string,
  label: string,
  namer: ExpressionNamer,
): SqlTranslation {
  const tokens = tokenizeSql(sql);
  if (isSqlTokenProblem(tokens))
    return {
      sql,
      rewrites: [],
      unresolved: [
        {
          at: `${label} line ${tokens.line}:${tokens.column}`,
          name: label,
          reason: `the expression cannot be read exactly: ${tokens.reason}`,
        },
      ],
    };
  const at = (token: SqlToken): string => `${label} line ${token.line}:${token.column}`;
  const entity = entityOutsideTexts(tokens);
  if (entity)
    return {
      sql,
      rewrites: [],
      unresolved: [
        {
          at: at(entity.token),
          name: entity.text,
          reason:
            'the expression holds an HTML entity outside texts after its escaping was undone (escaped twice), so it cannot be read exactly',
        },
      ],
    };
  const edits = new Map<number, { from: string; to: string; rule?: CrossSpaceRule }>();
  const unresolved = new Map<number, string>();
  const seen = new Set<number>();
  const sig = tokens.flatMap((token, index) =>
    token.kind === 'space' || token.kind === 'comment' ? [] : [index],
  );
  const isPunct = (position: number, text: string): boolean =>
    tokens[sig[position]]?.kind === 'punct' && tokens[sig[position]].text === text;
  // Place one column; `whole` spells the qualifier into the same quoted token.
  const place = (index: number, field: string, qualifier?: string, whole = false): void => {
    seen.add(index);
    if (objectLike.test(field)) {
      unresolved.set(index, 'an object name inside an expression cannot be placed');
      return;
    }
    if (!nameLike(field)) return;
    const spelling = namer.spelling(field);
    if (spelling !== undefined) {
      unresolved.set(index, spelling);
      return;
    }
    const answer = namer.column(field, qualifier);
    if ('reason' in answer) {
      unresolved.set(index, answer.reason);
      return;
    }
    const from = whole ? `${qualifier}.${field}` : field;
    const to = whole ? `${qualifier}.${answer.name}` : answer.name;
    if (to !== from) edits.set(index, { from, to, rule: answer.rule });
  };
  for (let position = 0; position < sig.length; position++) {
    const index = sig[position];
    const name = tokenName(tokens[index]);
    if (name === undefined || seen.has(index)) continue;
    if (isPunct(position + 1, '.')) {
      // `R.Name__c`: a qualifier and its column; a longer chain is not placed.
      const fieldIndex = sig[position + 2];
      const field = fieldIndex === undefined ? undefined : tokenName(tokens[fieldIndex]);
      if (field === undefined || isPunct(position + 3, '.')) {
        seen.add(index);
        unresolved.set(index, 'a dotted name other than <qualifier>.<field> cannot be placed');
        continue;
      }
      seen.add(index);
      place(fieldIndex, field, name);
      position += 2;
      continue;
    }
    if (tokens[index].kind === 'word' && isPunct(position + 1, '(')) {
      if (nameLike(name)) {
        seen.add(index);
        unresolved.set(index, 'a function named like a field or object cannot be placed');
      }
      continue;
    }
    if (tokens[index].kind === 'quoted' && name.includes('.')) {
      const qualified = quotedQualified.exec(name);
      if (!qualified) {
        seen.add(index);
        unresolved.set(index, 'a dotted name other than <qualifier>.<field> cannot be placed');
        continue;
      }
      place(index, qualified[2], qualified[1], true);
      continue;
    }
    place(index, name);
  }
  const rewrites: CrossSpaceRewrite[] = [];
  const parts = tokens.map((token, index) => {
    const edit = edits.get(index);
    if (!edit || unresolved.has(index)) return token.text;
    rewrites.push({ at: at(token), from: edit.from, to: edit.to, rule: edit.rule ?? 'field-ssot' });
    return spellToken(token, edit.to);
  });
  const result: CrossSpaceUnresolved[] = [];
  // eslint-disable-next-line unicorn/no-array-sort -- Sorting a new array within the ES2022 library target.
  for (const [index, reason] of [...unresolved].sort(([left], [right]) => left - right))
    result.push({ at: at(tokens[index]), name: tokenName(tokens[index]) ?? '', reason });
  const text = parts.join('');
  const after = tokenizeSql(text);
  if (isSqlTokenProblem(after) || after.length !== tokens.length) {
    result.push({
      at: `${label} line 1:1`,
      name: label,
      reason: 'the rewritten expression does not read back token for token',
    });
    return { sql, rewrites, unresolved: result };
  }
  for (const [index, token] of after.entries()) {
    const name = tokenName(token);
    if (name === undefined || unresolved.has(index)) continue;
    const leftover = namer.leftover(name);
    if (leftover !== undefined) result.push({ at: at(tokens[index]), name, reason: leftover });
    else if (nameLike(name) && !seen.has(index))
      result.push({
        at: at(tokens[index]),
        name,
        reason: 'the rewrite does not cover this name, so it cannot be placed',
      });
  }
  return { sql: text, rewrites, unresolved: result };
}
