import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSqlTokenProblem,
  spellToken,
  tokenName,
  tokenizeSql,
} from '../lib/services/sql-tokens.js';

const kinds = (sql) =>
  tokenizeSql(sql)
    .filter((token) => token.kind !== 'space')
    .map((token) => [token.kind, token.text]);

test('tokens join back to the exact text, with line and column', () => {
  const sql = "SELECT a.x__c, 'it''s'\n  FROM t -- note\n/* block\n */ WHERE 1.5e3 > 2";
  const tokens = tokenizeSql(sql);
  assert.equal(tokens.map((token) => token.text).join(''), sql);
  const from = tokens.find((token) => token.text === 'FROM');
  assert.deepEqual([from.line, from.column], [2, 3]);
  const where = tokens.find((token) => token.text === 'WHERE');
  assert.deepEqual([where.line, where.column], [4, 5]);
  assert.deepEqual(
    tokens.filter((token) => token.kind === 'number').map((token) => token.text),
    ['1.5e3', '2'],
  );
});

test('single quotes are text: a doubled quote stays inside, names in it are no names', () => {
  assert.deepEqual(kinds("x = 'O''Brien ssot__Id__c' AND y"), [
    ['word', 'x'],
    ['punct', '='],
    ['string', "'O''Brien ssot__Id__c'"],
    ['word', 'AND'],
    ['word', 'y'],
  ]);
});

test('comments run to the end of the line or the closing mark', () => {
  assert.deepEqual(kinds('a -- ssot__X__dlm\nb /* ssot__Y__dlm */ c'), [
    ['word', 'a'],
    ['comment', '-- ssot__X__dlm'],
    ['word', 'b'],
    ['comment', '/* ssot__Y__dlm */'],
    ['word', 'c'],
  ]);
  // A comment at the very end without a line break.
  assert.deepEqual(kinds('a --x'), [
    ['word', 'a'],
    ['comment', '--x'],
  ]);
});

test('double quotes and backticks are names; a doubled quote stands for one', () => {
  const tokens = tokenizeSql('"ssot__Id__c" `My``Name` "a""b"').filter(
    (token) => token.kind === 'quoted',
  );
  assert.deepEqual(
    tokens.map((token) => [tokenName(token), token.quote]),
    [
      ['ssot__Id__c', '"'],
      ['My`Name', '`'],
      ['a"b', '"'],
    ],
  );
  assert.equal(spellToken(tokens[0], 'Id__c'), '"Id__c"');
  assert.equal(spellToken(tokens[2], 'x"y'), '"x""y"');
  assert.equal(spellToken(tokenizeSql('plain')[0], 'other'), 'other');
});

test('what the dialects read differently, or what is left open, is refused', () => {
  for (const [sql, reason] of [
    [String.raw`x = 'C:\' OR y`, /backslash before a quote/u],
    ['/* a /* b */ c */', /opens another one inside/u],
    ['/* open', /block comment is not closed/u],
    ["'open", /single quotes is not closed/u],
    ['"open', /" quotes is not closed/u],
    ['`open', /` quotes is not closed/u],
  ]) {
    const result = tokenizeSql(sql);
    assert.ok(isSqlTokenProblem(result), sql);
    assert.match(result.reason, reason, sql);
  }
  const problem = tokenizeSql("SELECT\n  'x\\'");
  assert.deepEqual([problem.line, problem.column], [2, 3]);
  // A backslash elsewhere in a text is a plain character.
  assert.ok(!isSqlTokenProblem(tokenizeSql(String.raw`'a\b'`)));
});
