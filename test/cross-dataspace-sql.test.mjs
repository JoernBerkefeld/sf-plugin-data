import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { translateSql } from '../lib/services/cross-dataspace-sql.js';
import {
  sqlNamer,
  translateCalculatedInsight,
  translateDocument,
} from '../lib/services/cross-dataspace-rename.js';
import { planCrossSpaceInputs } from '../lib/services/cross-dataspace-deploy.js';
import { calculatedInsightReference } from '../lib/artifacts/native-calculated-insight-document.js';

// The SQL rewrite of a cross-data-space deploy (Step 3a), on the rules of Steps 1 and 2.
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
];
const to = (target, source = 'default', extra = {}) => ({ source, target, spaces, ...extra });
const sql = (text, context = to(SPACE)) => translateSql(text, 'X.sql', sqlNamer(context));
const clean = (text, context) => {
  const result = sql(text, context);
  assert.deepEqual(result.unresolved, [], text);
  return result.sql;
};
const refused = (text, context) => {
  const result = sql(text, context);
  assert.ok(result.unresolved.length > 0, `expected a refusal: ${text}`);
  return result.unresolved;
};

test('tables and their columns, qualified by the table name, become the copy spelling', () => {
  assert.equal(
    clean(
      'SELECT COUNT(ssot__Individual__dlm.ssot__Id__c) AS cnt__c, ssot__Individual__dlm.ssot__FirstName__c AS fn__c FROM ssot__Individual__dlm GROUP BY ssot__Individual__dlm.ssot__FirstName__c',
    ),
    'SELECT COUNT(ds2_Individual__dlm.Id__c) AS cnt__c, ds2_Individual__dlm.FirstName__c AS fn__c FROM ds2_Individual__dlm GROUP BY ds2_Individual__dlm.FirstName__c',
  );
  // Every change carries its file, line and column, old and new name and the rule.
  const { rewrites } = sql('SELECT\n  i.ssot__Id__c AS id__c FROM ssot__Individual__dlm i');
  assert.deepEqual(rewrites, [
    { at: 'X.sql line 2:5', from: 'ssot__Id__c', to: 'Id__c', rule: 'field-ssot' },
    {
      at: 'X.sql line 2:31',
      from: 'ssot__Individual__dlm',
      to: 'ds2_Individual__dlm',
      rule: 'standard-copy',
    },
  ]);
});

test('texts and comments that hold names stay as they are', () => {
  assert.equal(
    clean(
      "SELECT i.ssot__Id__c AS id__c -- ssot__Individual__dlm\nFROM ssot__Individual__dlm i /* ssot__FirstName__c */ WHERE i.ssot__LastName__c = 'ssot__Individual__dlm.ssot__Id__c'",
    ),
    "SELECT i.Id__c AS id__c -- ssot__Individual__dlm\nFROM ds2_Individual__dlm i /* ssot__FirstName__c */ WHERE i.LastName__c = 'ssot__Individual__dlm.ssot__Id__c'",
  );
});

test('aliases, also of subqueries in FROM and in WHERE, place columns by their table', () => {
  assert.equal(
    clean(
      'SELECT a.ssot__Id__c AS id__c, o.Amount__c AS amt__c FROM ssot__Individual__dlm AS a JOIN Order__dlm o ON a.ssot__Id__c = o.Customer__c',
    ),
    'SELECT a.Id__c AS id__c, o.Amount__c AS amt__c FROM ds2_Individual__dlm AS a JOIN ds2_Order__dlm o ON a.Id__c = o.Customer__c',
  );
  assert.equal(
    clean(
      'SELECT x.ssot__Id__c AS id__c FROM (SELECT i.ssot__Id__c FROM ssot__Individual__dlm i) x WHERE x.ssot__Id__c IN (SELECT o.Customer__c FROM Order__dlm o WHERE o.Customer__c = x.ssot__Id__c)',
    ),
    'SELECT x.Id__c AS id__c FROM (SELECT i.Id__c FROM ds2_Individual__dlm i) x WHERE x.Id__c IN (SELECT o.Customer__c FROM ds2_Order__dlm o WHERE o.Customer__c = x.Id__c)',
  );
  // A column alias of the subquery is a user name; the outer query reads it as written.
  assert.equal(
    clean(
      'SELECT s.total__c AS t__c FROM (SELECT SUM(o.ssot__Amount__c) AS total__c FROM ssot__SalesOrder__dlm o) s',
    ),
    'SELECT s.total__c AS t__c FROM (SELECT SUM(o.Amount__c) AS total__c FROM ds2_SalesOrder__dlm o) s',
  );
});

test('WITH block names are never renamed, even when they equal an object name', () => {
  // DC_SQL style: several blocks, the second reads the first.
  assert.equal(
    clean(
      'WITH people AS (SELECT i.ssot__Id__c, i.ssot__FirstName__c AS first FROM ssot__Individual__dlm i), named AS (SELECT p.ssot__Id__c, p.first FROM people p WHERE p.first IS NOT NULL) SELECT COUNT(n.ssot__Id__c) AS cnt__c, n.first AS fn__c FROM named n GROUP BY n.first',
    ),
    'WITH people AS (SELECT i.Id__c, i.FirstName__c AS first FROM ds2_Individual__dlm i), named AS (SELECT p.Id__c, p.first FROM people p WHERE p.first IS NOT NULL) SELECT COUNT(n.Id__c) AS cnt__c, n.first AS fn__c FROM named n GROUP BY n.first',
  );
  // A block named like the object: inside its own body the name is the object, after it the block.
  assert.equal(
    clean(
      'WITH ssot__Individual__dlm AS (SELECT ssot__Id__c FROM ssot__Individual__dlm) SELECT ssot__Individual__dlm.ssot__Id__c AS id__c FROM ssot__Individual__dlm',
    ),
    'WITH ssot__Individual__dlm AS (SELECT Id__c FROM ds2_Individual__dlm) SELECT ssot__Individual__dlm.Id__c AS id__c FROM ssot__Individual__dlm',
  );
  // A recursive block reads itself by its first block's columns.
  assert.equal(
    clean(
      'WITH RECURSIVE tree AS (SELECT i.ssot__Id__c FROM ssot__Individual__dlm i UNION ALL SELECT t.ssot__Id__c FROM tree t) SELECT t.ssot__Id__c AS id__c FROM tree t',
    ),
    'WITH RECURSIVE tree AS (SELECT i.Id__c FROM ds2_Individual__dlm i UNION ALL SELECT t.Id__c FROM tree t) SELECT t.Id__c AS id__c FROM tree t',
  );
  // A star passes every column of its table through.
  assert.equal(
    clean('WITH c AS (SELECT * FROM ssot__Individual__dlm) SELECT c.ssot__Id__c AS id__c FROM c'),
    'WITH c AS (SELECT * FROM ds2_Individual__dlm) SELECT c.Id__c AS id__c FROM c',
  );
});

test('quoted names are placed like plain ones and keep their quotes', () => {
  assert.equal(
    clean('SELECT "i"."ssot__Id__c" AS "Id" FROM "ssot__Individual__dlm" "i"'),
    'SELECT "i"."Id__c" AS "Id" FROM "ds2_Individual__dlm" "i"',
  );
  assert.equal(
    clean('SELECT `ssot__Id__c` FROM `ssot__Individual__dlm`'),
    'SELECT `Id__c` FROM `ds2_Individual__dlm`',
  );
});

test('a column without a table in front: placed when every table agrees, else refused', () => {
  // Both tables drop ssot__ from default towards dataspace2: the spelling is certain.
  assert.equal(
    clean('SELECT ssot__Id__c FROM ssot__Individual__dlm, Order__dlm'),
    'SELECT Id__c FROM ds2_Individual__dlm, ds2_Order__dlm',
  );
  // Towards default a custom DMO keeps its field, a unified output gets ssot__ back.
  const context = to('default', SPACE, { customDmos: new Set(['ds2_Order__dlm']) });
  assert.equal(
    clean('SELECT u.FirstName__c AS fn__c FROM ds2_UnifiedIndividual__dlm u', context),
    'SELECT u.ssot__FirstName__c AS fn__c FROM UnifiedssotIndividual__dlm u',
  );
  const [ambiguous] = refused(
    'SELECT FirstName__c FROM ds2_UnifiedIndividual__dlm u JOIN ds2_Order__dlm o ON u.UnifiedRecordId__c = o.Customer__c',
    context,
  );
  assert.equal(ambiguous.name, 'FirstName__c');
  assert.match(ambiguous.reason, /spell it differently .*ssot__FirstName__c, FirstName__c/u);
  // No table at all.
  assert.match(refused('SELECT ssot__Id__c')[0].reason, /no table of this query can own/u);
});

test('names it cannot place exactly are refused with their position, never guessed', () => {
  const [unknown] = refused('SELECT q.ssot__Id__c FROM ssot__Individual__dlm');
  assert.equal(unknown.at, 'X.sql line 1:10');
  assert.match(unknown.reason, /q names no table of this query/u);
  assert.match(
    refused(
      'SELECT x.ssot__Id__c FROM ssot__Individual__dlm i, ssot__Contact__dlm x WHERE ssot__Lead__dlm.ssot__Id__c = 1',
    )[0].reason,
    /not in the FROM clause/u,
  );
  // A namespaced table, a schema in front, a statement it cannot read.
  assert.match(refused('SELECT a.X__c FROM pkg__Thing__dlm a')[0].reason, /packaged/u);
  assert.match(refused('SELECT 1 FROM s.ssot__Individual__dlm')[0].reason, /schema in front/u);
  assert.match(refused('SELECT (1 FROM ssot__Individual__dlm')[0].reason, /parentheses/u);
  assert.match(
    refused(String.raw`SELECT 'C:\' FROM ssot__Individual__dlm`)[0].reason,
    /cannot be read exactly/u,
  );
  // A subquery column that the subquery does not put out under that name.
  assert.match(
    refused('SELECT s.ssot__Id__c FROM (SELECT COUNT(*) AS n__c FROM ssot__Individual__dlm) s')[0]
      .reason,
    /puts out no column of that name/u,
  );
});

test('the coverage check catches a name the rewrite did not place', () => {
  // A name in a place the rewrite does not read (a function name) is not covered.
  const [missed] = refused('SELECT Weird__c(1) AS x__c FROM ssot__Individual__dlm');
  assert.equal(missed.name, 'Weird__c');
  assert.match(missed.reason, /does not cover this name/u);
  // A rule engine that forgets a rename: the result still holds ssot__ and is refused.
  const forgetful = { ...sqlNamer(to(SPACE)), field: (_kind, field) => ({ name: field }) };
  const result = translateSql(
    'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i',
    'X.sql',
    forgetful,
  );
  assert.deepEqual(
    result.unresolved.map((entry) => [entry.name, entry.reason]),
    [['ssot__Id__c', 'it is still spelled as in default after the translation']],
  );
  // Another data space's prefix left over is refused too.
  assert.match(
    refused('SELECT 1 AS one__c FROM ds2_Thing__dlm', to('default', 'third'))[0].reason,
    /prefix of the data space dataspace2|still spelled/u,
  );
});

test('insights, DLOs and insights of other insights follow their own rules', () => {
  assert.equal(
    clean(
      'SELECT s.total__c AS t__c, d.Email__c AS e__c FROM Spend__cio s JOIN Raw__dll d ON s.id__c = d.Id__c',
    ),
    'SELECT s.total__c AS t__c, d.Email__c AS e__c FROM ds2_Spend__cio s JOIN Raw__dll d ON s.id__c = d.Id__c',
  );
  assert.equal(
    clean('SELECT s.total__c AS t__c FROM ds2_Spend__cio s', to('default', SPACE)),
    'SELECT s.total__c AS t__c FROM Spend__cio s',
  );
});

const insight = (overrides = {}) => ({
  apiName: 'CliSpend__cio',
  dataSpace: 'default',
  definitionType: 'CALCULATED_METRIC',
  displayName: 'Cli Spend',
  queryDialect: 'ANSI_SQL',
  publishScheduleInterval: 'NOT_SCHEDULED',
  expression:
    'SELECT COUNT(ssot__Individual__dlm.ssot__Id__c) AS cnt__c, ssot__Individual__dlm.ssot__FirstName__c AS fn__c FROM ssot__Individual__dlm GROUP BY ssot__Individual__dlm.ssot__FirstName__c',
  ...overrides,
});

test('a calculated insight: its name, data space and SQL, in both directions', () => {
  const there = translateCalculatedInsight(insight(), to(SPACE));
  assert.deepEqual(there.unresolved, []);
  assert.equal(there.document.apiName, 'ds2_CliSpend__cio');
  assert.equal(there.document.dataSpace, SPACE);
  assert.equal(
    there.document.expression,
    'SELECT COUNT(ds2_Individual__dlm.Id__c) AS cnt__c, ds2_Individual__dlm.FirstName__c AS fn__c FROM ds2_Individual__dlm GROUP BY ds2_Individual__dlm.FirstName__c',
  );
  assert.deepEqual(there.rewrites.slice(0, 2), [
    { at: 'apiName', from: 'CliSpend__cio', to: 'ds2_CliSpend__cio', rule: 'name-prefix' },
    { at: 'c__dataSpace', from: 'default', to: SPACE, rule: 'data-space' },
  ]);
  assert.ok(
    there.rewrites.some(
      (entry) =>
        entry.at === 'CliSpend__cio.calculatedInsight-meta.sql line 1:14' &&
        entry.to === 'ds2_Individual__dlm',
    ),
  );
  // Back towards default: a custom DMO keeps its fields, the insight loses the prefix.
  const back = translateCalculatedInsight(
    insight({
      apiName: 'ds2_CliSpend__cio',
      dataSpace: SPACE,
      expression: 'SELECT SUM(o.Amount__c) AS total__c FROM ds2_Order__dlm o',
    }),
    to('default', SPACE, { customDmos: new Set(['ds2_Order__dlm']) }),
  );
  assert.deepEqual(back.unresolved, []);
  assert.equal(back.document.apiName, 'CliSpend__cio');
  assert.equal(back.document.expression, 'SELECT SUM(o.Amount__c) AS total__c FROM Order__dlm o');
  // A standard copy towards default cannot be placed (standard DMO or custom DMO).
  const copy = translateCalculatedInsight(
    insight({
      apiName: 'ds2_CliSpend__cio',
      dataSpace: SPACE,
      expression: 'SELECT COUNT(i.Id__c) AS n__c FROM ds2_Individual__dlm i',
    }),
    to('default', SPACE),
  );
  assert.deepEqual(
    copy.unresolved.map((entry) => [entry.at, entry.name]),
    [['ds2_CliSpend__cio.calculatedInsight-meta.sql line 1:36', 'ds2_Individual__dlm']],
  );
});

test('a DC_SQL insight with WITH blocks, and a source insight named in the file', () => {
  const result = translateCalculatedInsight(
    insight({
      queryDialect: 'DC_SQL',
      sourceCiDevName: 'CliBase__cio',
      expression:
        'WITH base AS (\n  SELECT i.ssot__Id__c AS pid, i.ssot__FirstName__c AS first\n  FROM ssot__Individual__dlm i\n)\nSELECT COUNT(base.pid) AS cnt__c, base.first AS fn__c\nFROM base\nGROUP BY base.first',
    }),
    to(SPACE),
  );
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.document.sourceCiDevName, 'ds2_CliBase__cio');
  assert.equal(
    result.document.expression,
    'WITH base AS (\n  SELECT i.Id__c AS pid, i.FirstName__c AS first\n  FROM ds2_Individual__dlm i\n)\nSELECT COUNT(base.pid) AS cnt__c, base.first AS fn__c\nFROM base\nGROUP BY base.first',
  );
  assert.ok(
    result.rewrites.some(
      (entry) => entry.at === 'CliSpend__cio.calculatedInsight-meta.sql line 3:8',
    ),
  );
  // A name-like value in another key of the file is not covered.
  const odd = translateCalculatedInsight(insight({ extra: 'ssot__Individual__dlm' }), to(SPACE));
  assert.deepEqual(
    odd.unresolved.map((entry) => entry.at),
    ['extra'],
  );
});

const dbtSegment = (sqlText) => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'CliSql' },
  spec: {
    displayName: 'Cli SQL',
    description: '',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', apiName: 'ssot__Individual__dlm' },
    models: [{ name: 'Audience', sql: sqlText }],
    lookbackPeriod: 'P90D',
  },
});

test('a DBT segment: its name, DMO and every SQL model', () => {
  const result = translateDocument(
    dbtSegment(
      "SELECT ssot__Individual__dlm.ssot__Id__c FROM ssot__Individual__dlm WHERE ssot__Individual__dlm.ssot__FirstName__c LIKE 'A%'",
    ),
    to(SPACE),
  );
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.document.identity.apiName, 'ds2_CliSql');
  assert.equal(result.document.spec.segmentOn.apiName, 'ds2_Individual__dlm');
  assert.equal(
    result.document.spec.models[0].sql,
    "SELECT ds2_Individual__dlm.Id__c FROM ds2_Individual__dlm WHERE ds2_Individual__dlm.FirstName__c LIKE 'A%'",
  );
  assert.ok(result.rewrites.some((entry) => entry.at === 'CliSql.segment.Audience.sql line 1:8'));
  const missed = translateDocument(
    dbtSegment('SELECT x.ssot__Id__c FROM ssot__Individual__dlm'),
    to(SPACE),
  );
  assert.deepEqual(
    missed.unresolved.map((entry) => [entry.at, entry.name]),
    [['CliSql.segment.Audience.sql line 1:10', 'ssot__Id__c']],
  );
});

test('a word after an operator keyword is an operand, never a column alias', () => {
  for (const [text, expected] of [
    [
      'SELECT NOT ssot__Flag__c FROM ssot__Individual__dlm',
      'SELECT NOT Flag__c FROM ds2_Individual__dlm',
    ],
    [
      'SELECT ssot__A__c IS NULL OR ssot__B__c AS x__c FROM ssot__Individual__dlm',
      'SELECT A__c IS NULL OR B__c AS x__c FROM ds2_Individual__dlm',
    ],
    [
      'SELECT ssot__A__c BETWEEN 1 AND ssot__B__c AS x__c FROM ssot__Individual__dlm',
      'SELECT A__c BETWEEN 1 AND B__c AS x__c FROM ds2_Individual__dlm',
    ],
    [
      'SELECT EXISTS ssot__A__c FROM ssot__Individual__dlm',
      'SELECT EXISTS A__c FROM ds2_Individual__dlm',
    ],
    [
      'SELECT i.ssot__A__c RLIKE ssot__B__c FROM ssot__Individual__dlm i',
      'SELECT i.A__c RLIKE B__c FROM ds2_Individual__dlm i',
    ],
    [
      'SELECT i.ssot__A__c DIV ssot__B__c FROM ssot__Individual__dlm i',
      'SELECT i.A__c DIV B__c FROM ds2_Individual__dlm i',
    ],
    [
      'SELECT CASE WHEN ssot__A__c = 1 THEN ssot__B__c ELSE ssot__C__c END AS x__c FROM ssot__Individual__dlm',
      'SELECT CASE WHEN A__c = 1 THEN B__c ELSE C__c END AS x__c FROM ds2_Individual__dlm',
    ],
  ])
    assert.equal(clean(text), expected);
  // After a complete operand a plain word is an alias; one that is not name-like stays.
  assert.equal(
    clean('SELECT CASE WHEN i.ssot__A__c = 1 THEN 2 END total FROM ssot__Individual__dlm i'),
    'SELECT CASE WHEN i.A__c = 1 THEN 2 END total FROM ds2_Individual__dlm i',
  );
});

test('a name-like column alias without AS is refused, not kept as a user name', () => {
  for (const text of [
    'SELECT -i.ssot__A__c ssot__B__c FROM ssot__Individual__dlm i',
    'SELECT IF(ssot__A__c, 1, 2) ssot__B__c FROM ssot__Individual__dlm',
    'SELECT COUNT(*) OVER (PARTITION BY ssot__A__c) cnt__c FROM ssot__Individual__dlm',
    'SELECT CAST(i.ssot__Id__c AS STRING) id__c FROM ssot__Individual__dlm i',
  ]) {
    const [first] = refused(text);
    assert.match(first.reason, /without AS/u, text);
  }
});

test('names are read without regard to case: another case of a rule part is refused', () => {
  for (const [text, names] of [
    [
      'SELECT I.SSOT__ID__C AS x__c FROM SSOT__INDIVIDUAL__DLM I',
      ['SSOT__ID__C', 'SSOT__INDIVIDUAL__DLM'],
    ],
    ['SELECT i.Ssot__Id__C AS x__c FROM ssot__Individual__dlm i', ['Ssot__Id__C']],
    ['SELECT i.SSOT__Id__c AS x__c FROM ssot__Individual__dlm i', ['SSOT__Id__c']],
    // The column of a table that is not placed stays in the source spelling, so it is refused too.
    [
      'SELECT i.ssot__Id__c AS x__c FROM ssot__Individual__DLM i',
      ['ssot__Individual__DLM', 'ssot__Id__c'],
    ],
    ['SELECT o.kq_Id__c AS x__c FROM Order__dlm o', ['kq_Id__c']],
    ['SELECT u.Id__c AS x__c FROM unifiedssotIndividual__dlm u', ['unifiedssotIndividual__dlm']],
  ])
    assert.deepEqual(
      refused(text).map((entry) => entry.name),
      names,
      text,
    );
  // The prefix of a data space in another case.
  assert.deepEqual(
    refused('SELECT o.Amount__c AS x__c FROM DS2_Order__dlm o', to('default', SPACE)).map(
      (entry) => entry.name,
    ),
    ['DS2_Order__dlm'],
  );
  // The leftover check reads the case-insensitive spelling too.
  const namer = sqlNamer(to(SPACE));
  assert.match(namer.leftover('SSOT__Id__c'), /still spelled/u);
  assert.match(sqlNamer(to('default', 'third')).leftover('DS2_Order__dlm'), /still spelled/u);
  // Lower-case table and field bodies with the rule parts in their case are placed.
  assert.equal(
    clean('SELECT i.ssot__ID__c AS x__c FROM ssot__INDIVIDUAL__dlm i'),
    'SELECT i.ID__c AS x__c FROM ds2_INDIVIDUAL__dlm i',
  );
});

test('a parenthesis after JOIN is a subquery or a table group, not a table function', () => {
  assert.equal(
    clean(
      'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i JOIN (SELECT ssot__Id__c FROM ssot__Account__dlm) a ON a.ssot__Id__c = i.ssot__Id__c',
    ),
    'SELECT i.Id__c FROM ds2_Individual__dlm i JOIN (SELECT Id__c FROM ds2_Account__dlm) a ON a.Id__c = i.Id__c',
  );
  // The subquery has its own scope: its column is placed by its own table.
  assert.equal(
    clean(
      'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i WHERE EXISTS (SELECT 1 FROM Order__dlm o JOIN (SELECT ssot__Name__c FROM ssot__Account__dlm) a ON 1=1)',
    ),
    'SELECT i.Id__c FROM ds2_Individual__dlm i WHERE EXISTS (SELECT 1 FROM ds2_Order__dlm o JOIN (SELECT Name__c FROM ds2_Account__dlm) a ON 1=1)',
  );
  assert.equal(
    clean(
      'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i LEFT OUTER JOIN (ssot__Account__dlm a) ON a.ssot__Id__c = i.ssot__Id__c',
    ),
    'SELECT i.Id__c FROM ds2_Individual__dlm i LEFT OUTER JOIN (ds2_Account__dlm a) ON a.Id__c = i.Id__c',
  );
  assert.equal(
    clean(
      'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i CROSS JOIN (SELECT o.Cust__c FROM Order__dlm o) x',
    ),
    'SELECT i.Id__c FROM ds2_Individual__dlm i CROSS JOIN (SELECT o.Cust__c FROM ds2_Order__dlm o) x',
  );
  // LEFT(...) in a join condition stays a function.
  assert.equal(
    clean(
      'SELECT i.ssot__Id__c FROM ssot__Individual__dlm i JOIN Order__dlm o ON LEFT(o.Cust__c, 3) = i.ssot__Id__c',
    ),
    'SELECT i.Id__c FROM ds2_Individual__dlm i JOIN ds2_Order__dlm o ON LEFT(o.Cust__c, 3) = i.Id__c',
  );
});

test('planCrossSpaceInputs translates an insight and plans it from the translated SQL', () => {
  const native = insight();
  const input = {
    path: '/project/data360/calculatedInsights/CliSpend__cio.calculatedInsight-meta.json',
    companionPath: '/project/data360/calculatedInsights/CliSpend__cio.calculatedInsight-meta.sql',
    native,
    document: calculatedInsightReference(native),
    inputDigest: 'x',
  };
  const plan = planCrossSpaceInputs([input], SPACE, spaces);
  assert.deepEqual(plan.unsupported, []);
  const [translated] = plan.inputs;
  assert.equal(translated.native.apiName, 'ds2_CliSpend__cio');
  assert.deepEqual(translated.document.identity, {
    dataSpace: SPACE,
    apiName: 'ds2_CliSpend__cio',
  });
  assert.deepEqual(
    translated.document.spec.dependencies.map((entry) => entry.apiName),
    ['ds2_Individual__dlm'],
  );
  assert.equal(plan.files[0].family, 'calculated-insight');
  assert.equal(input.native.apiName, 'CliSpend__cio', 'the admitted input is not changed');
});
