import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findSilentSqlFailures,
  silentSqlFailureWarnings,
} from '../lib/services/calculated-insight-sql-checks.js';

// Live API 68 (DB entries data360:ci-sql-alias-without-as-api68 and
// data360:plugin-cross-dataspace-deploy-3a-api68): these insights are accepted, then end in ERROR.
const full = 'ssot__Individual__dlm';
const found = (sql, dialect) =>
  findSilentSqlFailures(sql, dialect).map(
    (finding) => `${finding.line}:${finding.column} ${finding.construct}`,
  );

test('classic: a table alias in FROM and JOIN warns, with and without AS', () => {
  for (const dialect of ['ANSI_SQL', 'AnsiSql']) {
    assert.deepEqual(found(`SELECT COUNT(i.ssot__Id__c) AS cnt__c FROM ${full} i`, dialect), [
      `1:${45 + full.length} the table alias i of ${full}`,
    ]);
    assert.deepEqual(
      found(
        `SELECT COUNT(i.ssot__Id__c) AS cnt__c\nFROM ${full} AS i\nJOIN Other__dlm o ON i.ssot__Id__c = o.Id__c`,
        dialect,
      ),
      [
        `2:${10 + full.length} the table alias i of ${full}`,
        '3:17 the table alias o of Other__dlm',
      ],
    );
  }
  assert.deepEqual(
    found(
      `SELECT a.x__c FROM One__dlm a LEFT JOIN Two__cio AS b ON a.x__c = b.x__c, Three__dll c`,
      'ANSI_SQL',
    ),
    [
      '1:29 the table alias a of One__dlm',
      '1:53 the table alias b of Two__cio',
      '1:86 the table alias c of Three__dll',
    ],
  );
});

test('classic: quoted column aliases warn, with and without AS', () => {
  const base = `FROM ${full} GROUP BY ${full}.ssot__FirstName__c`;
  assert.deepEqual(found(`SELECT COUNT(${full}.ssot__Id__c) AS "cnt__c" ${base}`, 'ANSI_SQL'), [
    `1:${31 + full.length} a quoted column alias "cnt__c"`,
  ]);
  assert.deepEqual(found(`SELECT COUNT(${full}.ssot__Id__c) "cnt__c" ${base}`, 'ANSI_SQL'), [
    `1:${28 + full.length} a quoted column alias "cnt__c"`,
  ]);
  assert.deepEqual(found(`SELECT COUNT(${full}.ssot__Id__c) AS \`cnt__c\` ${base}`, 'ANSI_SQL'), [
    `1:${31 + full.length} a quoted column alias \`cnt__c\``,
  ]);
});

test('classic: a text literal column warns, with and without AS', () => {
  assert.deepEqual(
    found(`SELECT 'x' AS lbl__c, COUNT(${full}.ssot__Id__c) AS cnt__c FROM ${full}`, 'ANSI_SQL'),
    ["1:8 a text literal 'x' as a column"],
  );
  assert.deepEqual(found(`SELECT 'x' lbl__c FROM ${full}`, 'ANSI_SQL'), [
    "1:8 a text literal 'x' as a column",
  ]);
  assert.deepEqual(found(`SELECT 'x' FROM ${full}`, 'ANSI_SQL'), [
    "1:8 a text literal 'x' as a column",
  ]);
});

test('classic: a -- comment line warns, even one naming nothing; a block comment does not', () => {
  assert.deepEqual(
    found(
      `-- spend per person\nSELECT COUNT(${full}.ssot__Id__c) AS cnt__c FROM ${full}`,
      'ANSI_SQL',
    ),
    ['1:1 a -- comment'],
  );
  assert.deepEqual(
    found(`SELECT COUNT(${full}.ssot__Id__c) AS cnt__c -- x\nFROM ${full}`, 'ANSI_SQL'),
    [`1:${38 + full.length} a -- comment`],
  );
  assert.deepEqual(
    found(`/* note */ SELECT COUNT(${full}.ssot__Id__c) AS cnt__c FROM ${full}`, 'ANSI_SQL'),
    [],
  );
});

test('classic: the forms Salesforce runs do not warn', () => {
  for (const sql of [
    // Full object names, with and without AS; aliases without AS after ), a field and a number.
    `SELECT COUNT(${full}.ssot__Id__c) AS cnt__c, ${full}.ssot__FirstName__c AS fn__c FROM ${full} GROUP BY ${full}.ssot__FirstName__c`,
    `SELECT COUNT(${full}.ssot__Id__c) cnt__c, ${full}.ssot__FirstName__c fn__c FROM ${full} GROUP BY ${full}.ssot__FirstName__c`,
    `SELECT SUM(1) total__c FROM ${full}`,
    `SELECT COUNT(${full}.ssot__Id__c) * 1 cnt__c FROM ${full}`,
    // Look-alikes in texts and comments: a text holding --, quotes and an alias.
    `SELECT COUNT(${full}.ssot__Id__c) AS cnt__c FROM ${full} WHERE ${full}.ssot__LastName__c = '-- "x" i'`,
    `/* -- 'x' "y" */ SELECT COUNT(${full}.ssot__Id__c) AS cnt__c FROM ${full}`,
    // A text inside an expression, a WITH block name and a function in FROM are no table alias.
    `SELECT CONCAT('a', ${full}.ssot__FirstName__c) AS fn__c FROM ${full}`,
    `WITH people AS (SELECT ${full}.ssot__Id__c AS pid__c FROM ${full}) SELECT COUNT(p.pid__c) AS cnt__c FROM people p`,
    // A quoted name used as a column, not as an alias.
    `SELECT ${full}."ssot__Id__c" AS id__c FROM ${full}`,
  ])
    assert.deepEqual(found(sql, 'ANSI_SQL'), [], sql);
});

test('classic: a subquery and a join inside it are scanned too', () => {
  assert.deepEqual(
    found(
      `SELECT COUNT(x.id__c) AS cnt__c FROM (SELECT i.ssot__Id__c AS id__c, "lbl" AS "q__c" FROM ${full} i) x`,
      'ANSI_SQL',
    ),
    ['1:79 a quoted column alias "q__c"', `1:${92 + full.length} the table alias i of ${full}`],
  );
});

test('DC_SQL: only a backtick-quoted column alias warns', () => {
  for (const dialect of ['DC_SQL', 'DcSql'])
    assert.deepEqual(found(`SELECT COUNT(i.ssot__Id__c) AS \`cnt__c\` FROM ${full} i`, dialect), [
      '1:32 a column alias in backticks `cnt__c`',
    ]);
  assert.deepEqual(found(`SELECT COUNT(i.ssot__Id__c) \`cnt__c\` FROM ${full} i`, 'DC_SQL'), [
    '1:29 a column alias in backticks `cnt__c`',
  ]);
  for (const sql of [
    `SELECT COUNT(i.ssot__Id__c) AS cnt__c, i.ssot__FirstName__c fn__c FROM ${full} i GROUP BY i.ssot__FirstName__c`,
    `SELECT COUNT(i.ssot__Id__c) AS "cnt__c" FROM ${full} i`,
    `SELECT COUNT(i.ssot__Id__c) "cnt__c" FROM ${full} i`,
    `SELECT 'x' lbl__c, COUNT(i.ssot__Id__c) AS cnt__c FROM ${full} i`,
    `-- a comment\nSELECT COUNT(i.ssot__Id__c) AS cnt__c FROM ${full} i`,
  ])
    assert.deepEqual(found(sql, 'DC_SQL'), [], sql);
});

test('a missing or unknown dialect, and SQL the tokenizer cannot read, give no findings', () => {
  const sql = `-- x\nSELECT 'x' AS "a" FROM ${full} i`;
  assert.equal(found(sql, 'ANSI_SQL').length, 4);
  for (const dialect of [undefined, '', 'SPARK_SQL', 42]) assert.deepEqual(found(sql, dialect), []);
  assert.deepEqual(found(`SELECT 'open FROM ${full} i`, 'ANSI_SQL'), []);
});

test('each warning names the code, SQL file, line:column, the construct and the fix', () => {
  const file = 'data360/calculatedInsights/CliSpend__cio.calculatedInsight-meta.sql';
  assert.deepEqual(
    silentSqlFailureWarnings(
      `-- x\nSELECT COUNT(i.ssot__Id__c) AS cnt__c FROM ${full} i`,
      'ANSI_SQL',
      file,
    ),
    [
      `CI_SQL_FAILS_SILENTLY: ${file} line 1:1: a -- comment in a classic (ANSI_SQL) insight. Salesforce accepts it on deploy and publish, but the insight then ends in ERROR (CREATE_FAILED) without a message; remove the comment.`,
      `CI_SQL_FAILS_SILENTLY: ${file} line 2:${45 + full.length}: the table alias i of ${full} in a classic (ANSI_SQL) insight. Salesforce accepts it on deploy and publish, but the insight then ends in ERROR (CREATE_FAILED) without a message; write the full object name in front of each field (${full}.Field__c) and drop the alias.`,
    ],
  );
  assert.match(
    silentSqlFailureWarnings(`SELECT 1 AS "a" FROM ${full}`, 'ANSI_SQL', file)[0],
    /a quoted column alias "a" in a classic \(ANSI_SQL\) insight\. .*; write the alias without quotes \(a\)\.$/u,
  );
  assert.match(
    silentSqlFailureWarnings(`SELECT 'x' FROM ${full}`, 'ANSI_SQL', file)[0],
    /; remove it, or build the insight in the SQL Insights Builder \(DC_SQL\)\.$/u,
  );
  assert.match(
    silentSqlFailureWarnings(`SELECT 1 AS \`a\` FROM ${full}`, 'DC_SQL', file)[0],
    /a column alias in backticks `a` in a DC_SQL insight\. .*; write the alias without quotes \(a\)\.$/u,
  );
});
