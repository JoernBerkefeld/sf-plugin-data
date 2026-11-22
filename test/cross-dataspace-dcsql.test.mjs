import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translateDocument } from '../lib/services/cross-dataspace-rename.js';
import {
  observeDataTransform,
  validateDataTransformDocument,
} from '../lib/artifacts/data-transform-document.js';

// DCSQL data transforms between data spaces: the SQL of each manifest node by the SQL rules, the
// output objects by their names (DLOs keep theirs). The file shape is the synthetic GET fixture
// as retrieve writes it.
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
];
const to = (target, source = 'default', extra = {}) => ({ source, target, spaces, ...extra });
const unresolvedAt = (result) => result.unresolved.map((entry) => entry.at);
const get = JSON.parse(
  readFileSync(new URL('fixtures/data-transform-dcsql-get.json', import.meta.url), 'utf8'),
);
const D = 'definition.definitions[0]';
const SQL = `${D}.manifest.nodes.model.input1.compiled_code`;

/**
 * The DCSQL transform file retrieve writes from the fixture, with another SQL.
 * @param {string} [sql] The node's compiled_code.
 * @returns {object} Transform file.
 */
const dcsqlFile = (sql) => {
  const { document } = observeDataTransform(structuredClone(get), {}, 'retrieve');
  if (sql !== undefined)
    document.definition.definitions[0].manifest.nodes['model.input1'].compiled_code = sql;
  return document;
};
const sqlOf = (document) =>
  document.definition.definitions[0].manifest.nodes['model.input1'].compiled_code;

test('a DLO-only DCSQL transform keeps its SQL and output; name and data space follow', () => {
  const file = dcsqlFile();
  const result = translateDocument(file, to(SPACE));
  assert.equal(result.unsupported, undefined);
  assert.deepEqual(result.unresolved, []);
  validateDataTransformDocument(result.document);
  const definition = result.document.definition;
  assert.equal(definition.name, 'ds2_SyntheticT2');
  assert.equal(definition.dataSpaceName, SPACE);
  assert.equal(definition.definitions[0].name, 'ds2_SyntheticT2');
  // DLOs are shared across data spaces and keep their names.
  assert.equal(sqlOf(result.document), 'SELECT Id__c, Name__c FROM SyntheticSrc__dll');
  assert.equal(
    definition.definitions[0].manifest.nodes['model.input1'].relation_name,
    'SyntheticNew__dll',
  );
  assert.deepEqual(
    definition.definitions[0].outputDataObjects,
    file.definition.definitions[0].outputDataObjects,
  );
  assert.ok(result.rewrites.every((entry) => !entry.at.startsWith(SQL)));
});

test('default to dataspace2 on a standard DMO with ssot__ fields, and back', () => {
  const sql =
    "SELECT i.ssot__Id__c AS Id__c, i.ssot__FirstName__c AS Name__c FROM ssot__Individual__dlm i WHERE i.ssot__LastName__c <> 'ssot__x'";
  const file = dcsqlFile(sql);
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  validateDataTransformDocument(result.document);
  // The text in quotes is data and stays, also for the full-coverage check.
  assert.equal(
    sqlOf(result.document),
    "SELECT i.Id__c AS Id__c, i.FirstName__c AS Name__c FROM ds2_Individual__dlm i WHERE i.LastName__c <> 'ssot__x'",
  );
  assert.ok(
    result.rewrites.some(
      (entry) =>
        entry.at === `${SQL} line 1:69` &&
        entry.from === 'ssot__Individual__dlm' &&
        entry.to === 'ds2_Individual__dlm',
    ),
    JSON.stringify(result.rewrites),
  );
  assert.ok(
    result.rewrites.some(
      (entry) =>
        entry.at === `${SQL} line 1:10` && entry.from === 'ssot__Id__c' && entry.to === 'Id__c',
    ),
  );
  // Back to default the standard copy could be the standard DMO or a custom one: not guessed.
  const back = translateDocument(result.document, to('default', SPACE));
  assert.deepEqual(unresolvedAt(back), [`${SQL} line 1:57`]);
  assert.match(back.unresolved[0].reason, /either the standard DMO ssot__Individual__dlm/u);
});

test('a unified output with ssot__ fields goes to dataspace2 and back unchanged', () => {
  const sql =
    'SELECT u.ssot__Id__c AS Id__c, u.ssot__FirstName__c AS Name__c FROM UnifiedssotIndividualB__dlm u';
  const there = translateDocument(dcsqlFile(sql), to(SPACE));
  assert.deepEqual(there.unresolved, []);
  assert.equal(
    sqlOf(there.document),
    'SELECT u.Id__c AS Id__c, u.FirstName__c AS Name__c FROM ds2_UnifiedIndividualB__dlm u',
  );
  const back = translateDocument(there.document, to('default', SPACE));
  assert.deepEqual(back.unresolved, []);
  assert.equal(sqlOf(back.document), sql);
  assert.equal(back.document.definition.name, 'SyntheticT2');
  assert.equal(back.document.definition.dataSpaceName, 'default');
  // A custom DMO keeps its fields; its name follows the prefix rule.
  const custom = translateDocument(
    dcsqlFile('SELECT o.Amount__c AS Id__c FROM ds2_Order__dlm o'),
    to('default', SPACE, { customDmos: new Set(['ds2_Order__dlm']) }),
  );
  assert.deepEqual(custom.unresolved, []);
  assert.equal(sqlOf(custom.document), 'SELECT o.Amount__c AS Id__c FROM Order__dlm o');
});

test('an output column without an alias is placed only when its output field changes the same way', () => {
  // Into a DLO, whose fields keep their names: refused.
  const plain = translateDocument(
    dcsqlFile('SELECT ssot__Id__c FROM ssot__Individual__dlm'),
    to(SPACE),
  );
  assert.deepEqual(unresolvedAt(plain), [`${SQL} line 1:8`]);
  assert.match(
    plain.unresolved[0].reason,
    /has no alias.*names no field.*write the column with AS/u,
  );
  // Into a standard DMO whose field takes the same new name: placed.
  const file = dcsqlFile('SELECT ssot__Id__c FROM ssot__Individual__dlm');
  const definition = file.definition.definitions[0];
  definition.manifest.nodes['model.input1'].relation_name = 'ssot__Account__dlm';
  definition.outputDataObjects = [
    {
      category: 'Other',
      fields: [
        {
          isPrimaryKey: true,
          keyQualifierField: 'KQ_Id',
          label: 'Id',
          name: 'ssot__Id__c',
          type: 'Text',
        },
      ],
      label: 'Account',
      name: 'ssot__Account__dlm',
      dataspaceName: 'default',
      type: 'dataModelObject',
    },
  ];
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const after = result.document.definition.definitions[0];
  assert.equal(sqlOf(result.document), 'SELECT Id__c FROM ds2_Individual__dlm');
  assert.equal(after.manifest.nodes['model.input1'].relation_name, 'ds2_Account__dlm');
  assert.equal(after.outputDataObjects[0].name, 'ds2_Account__dlm');
  assert.equal(after.outputDataObjects[0].fields[0].name, 'Id__c');
  assert.equal(after.outputDataObjects[0].dataspaceName, SPACE);
});

/**
 * A DCSQL transform file whose one node writes into the given output object.
 * @param {string} sql The node's compiled_code.
 * @param {string} name Output object name (also the node's relation_name).
 * @param {string[]} fields Output field names.
 * @param {string} [space] The output object's dataspaceName.
 * @returns {object} Transform file.
 */
const intoObject = (sql, name, fields, space = 'default') => {
  const file = dcsqlFile(sql);
  const definition = file.definition.definitions[0];
  definition.manifest.nodes['model.input1'].relation_name = name;
  definition.outputDataObjects = [
    {
      category: 'Other',
      fields: fields.map((field, index) => ({
        isPrimaryKey: index === 0,
        label: field,
        name: field,
        type: 'Text',
      })),
      label: name,
      name,
      dataspaceName: space,
      type: 'dataModelObject',
    },
  ];
  return file;
};
const fieldsOf = (document) =>
  document.definition.definitions[0].outputDataObjects[0].fields.map((field) => field.name);
const ACCOUNT = ['ssot__Account__dlm', ['ssot__Id__c', 'ssot__Name__c']];

test('an output alias spelled like an output field follows the field', () => {
  const result = translateDocument(
    intoObject(
      'SELECT i.ssot__Id__c AS ssot__Id__c, i.ssot__FirstName__c AS ssot__Name__c FROM ssot__Individual__dlm i',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(fieldsOf(result.document), ['Id__c', 'Name__c']);
  assert.equal(
    sqlOf(result.document),
    'SELECT i.Id__c AS Id__c, i.FirstName__c AS Name__c FROM ds2_Individual__dlm i',
  );
  // The alias rewrite is in the preview like any other edit.
  assert.ok(
    result.rewrites.some(
      (entry) =>
        entry.at === `${SQL} line 1:25` &&
        entry.from === 'ssot__Id__c' &&
        entry.to === 'Id__c' &&
        entry.rule === 'field-ssot',
    ),
    JSON.stringify(result.rewrites),
  );
  // Through a subquery: the outer columns follow the subquery, the aliases follow the fields.
  const nested = translateDocument(
    intoObject(
      'SELECT s.ssot__Id__c AS ssot__Id__c, s.ssot__FirstName__c AS ssot__Name__c FROM (SELECT i.ssot__Id__c, i.ssot__FirstName__c FROM ssot__Individual__dlm i) s',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.deepEqual(nested.unresolved, []);
  assert.equal(
    sqlOf(nested.document),
    'SELECT s.Id__c AS Id__c, s.FirstName__c AS Name__c FROM (SELECT i.Id__c, i.FirstName__c FROM ds2_Individual__dlm i) s',
  );
  // A subquery alias is not an output column: only the outer one follows the field.
  const inner = translateDocument(
    intoObject(
      'SELECT s.ssot__Id__c AS ssot__Id__c FROM (SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i) s',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.ok(
    inner.unresolved.some((entry) => entry.at === `${SQL} line 1:10`),
    JSON.stringify(inner.unresolved),
  );
  // Reverse: from dataspace2 into a unified output, whose fields take ssot__ in default; a use of
  // the alias in ORDER BY follows it.
  const back = translateDocument(
    intoObject(
      'SELECT s.Id__c AS Id__c, s.Name__c AS Name__c FROM SyntheticSrc__dll s ORDER BY Name__c',
      'ds2_UnifiedIndividualB__dlm',
      ['Id__c', 'Name__c'],
      SPACE,
    ),
    to('default', SPACE),
  );
  assert.deepEqual(back.unresolved, []);
  assert.deepEqual(fieldsOf(back.document), ['ssot__Id__c', 'ssot__Name__c']);
  assert.equal(
    sqlOf(back.document),
    'SELECT s.Id__c AS ssot__Id__c, s.Name__c AS ssot__Name__c FROM SyntheticSrc__dll s ORDER BY ssot__Name__c',
  );
});

test('an output column without an alias that keeps its name while its field changes is refused', () => {
  const result = translateDocument(
    intoObject(
      'SELECT Id__c FROM SyntheticSrc__dll',
      'ds2_UnifiedIndividualB__dlm',
      ['Id__c'],
      SPACE,
    ),
    to('default', SPACE),
  );
  assert.deepEqual(unresolvedAt(result), [`${SQL} line 1:8`]);
  assert.equal(result.unresolved[0].name, 'Id__c');
  assert.match(
    result.unresolved[0].reason,
    /keeps its name.*spelled ssot__Id__c there.*write the column with AS Id__c/u,
  );
  // Written with AS and the field name, the alias follows the field.
  const aliased = translateDocument(
    intoObject(
      'SELECT Id__c AS Id__c FROM SyntheticSrc__dll',
      'ds2_UnifiedIndividualB__dlm',
      ['Id__c'],
      SPACE,
    ),
    to('default', SPACE),
  );
  assert.deepEqual(aliased.unresolved, []);
  assert.equal(sqlOf(aliased.document), 'SELECT Id__c AS ssot__Id__c FROM SyntheticSrc__dll');
  // Reverse: from default into the unified output, whose ssot__ field drops it.
  const there = translateDocument(
    intoObject('SELECT ssot__Id__c FROM SyntheticSrc__dll', 'UnifiedssotIndividualB__dlm', [
      'ssot__Id__c',
    ]),
    to(SPACE),
  );
  assert.deepEqual(unresolvedAt(there), [`${SQL} line 1:8`]);
  assert.match(there.unresolved[0].reason, /spelled Id__c there.*AS ssot__Id__c/u);
  // A DMO column renamed the same way as its field is placed.
  const same = translateDocument(
    intoObject('SELECT ssot__Id__c FROM ssot__Individual__dlm', 'UnifiedssotIndividualB__dlm', [
      'ssot__Id__c',
    ]),
    to(SPACE),
  );
  assert.deepEqual(same.unresolved, []);
  assert.equal(sqlOf(same.document), 'SELECT Id__c FROM ds2_Individual__dlm');
  // Only the first UNION branch names the output columns.
  const union = translateDocument(
    intoObject(
      'SELECT Id__c FROM SyntheticSrc__dll UNION ALL SELECT Id__c AS Id__c FROM SyntheticSrc__dll',
      'ds2_UnifiedIndividualB__dlm',
      ['Id__c'],
      SPACE,
    ),
    to('default', SPACE),
  );
  assert.deepEqual(unresolvedAt(union), [`${SQL} line 1:8`]);
});

test('a * over a DLO is refused when the output fields change, and kept when they do not', () => {
  const cases = [
    ['SELECT * FROM SyntheticSrc__dll', `${SQL} line 1:8`],
    ['SELECT s.* FROM SyntheticSrc__dll s', `${SQL} line 1:8`],
  ];
  for (const [sql, at] of cases) {
    const back = translateDocument(
      intoObject(sql, 'ds2_UnifiedIndividualB__dlm', ['Id__c'], SPACE),
      to('default', SPACE),
    );
    assert.deepEqual(unresolvedAt(back), [at], sql);
    assert.match(back.unresolved[0].reason, /columns of a DLO, which keep their names/u);
  }
  const there = translateDocument(
    intoObject('SELECT * FROM SyntheticSrc__dll', ...ACCOUNT),
    to(SPACE),
  );
  assert.deepEqual(unresolvedAt(there), [`${SQL} line 1:8`]);
  assert.match(there.unresolved[0].reason, /list the columns with AS/u);
  // Into an output DLO, whose fields keep their names, the * stays.
  const kept = translateDocument(dcsqlFile('SELECT * FROM SyntheticSrc__dll'), to(SPACE));
  assert.deepEqual(kept.unresolved, []);
  assert.equal(sqlOf(kept.document), 'SELECT * FROM SyntheticSrc__dll');
});

test('an output alias reused in ORDER BY follows its field; WHERE and GROUP BY read the table', () => {
  // The ORDER BY name is the alias (Spark reads select aliases there first), not the column.
  const ordered = translateDocument(
    intoObject(
      'SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i ORDER BY ssot__Id__c',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.deepEqual(ordered.unresolved, []);
  assert.equal(
    sqlOf(ordered.document),
    'SELECT i.Id__c AS Id__c FROM ds2_Individual__dlm i ORDER BY Id__c',
  );
  // A WHERE or GROUP BY name equal to an alias is the table's column: the DLO column keeps its
  // name while the alias and its ORDER BY and HAVING uses take the field's target name.
  const back = translateDocument(
    intoObject(
      "SELECT s.Id__c AS Id__c FROM SyntheticSrc__dll s WHERE Id__c <> 'x' GROUP BY Id__c HAVING Id__c <> 'y' ORDER BY Id__c",
      'ds2_UnifiedIndividualB__dlm',
      ['Id__c'],
      SPACE,
    ),
    to('default', SPACE),
  );
  assert.deepEqual(back.unresolved, []);
  assert.equal(
    sqlOf(back.document),
    "SELECT s.Id__c AS ssot__Id__c FROM SyntheticSrc__dll s WHERE Id__c <> 'x' GROUP BY Id__c HAVING ssot__Id__c <> 'y' ORDER BY ssot__Id__c",
  );
  // After UNION the ORDER BY reads the first branch's names: a use of an alias the first branch
  // has too follows it; an alias of the last branch only is refused.
  const union = translateDocument(
    intoObject(
      'SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i UNION ALL SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i ORDER BY ssot__Id__c',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.deepEqual(union.unresolved, []);
  assert.match(sqlOf(union.document), /ORDER BY Id__c$/u);
  const lastOnly = translateDocument(
    intoObject(
      'SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i UNION ALL SELECT i.ssot__Id__c AS Other__c FROM ssot__Individual__dlm i ORDER BY Other__c',
      ...ACCOUNT,
    ),
    to(SPACE),
  );
  assert.deepEqual(unresolvedAt(lastOnly), [`${SQL} line 1:147`]);
  assert.match(lastOnly.unresolved[0].reason, /alias of a later branch only/u);
});

const nodeOf = (document) => document.definition.definitions[0].manifest.nodes['model.input1'];

test('a DCSQL node whose relation_name names no output object is an intermediate model', () => {
  // Its columns land by name in its relation; a DLO relation keeps its name and its fields, so an
  // alias stays and an unaliased column whose name changes is refused.
  const file = dcsqlFile('SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i');
  nodeOf(file).relation_name = 'Other__dll';
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  assert.equal(sqlOf(result.document), 'SELECT i.Id__c AS ssot__Id__c FROM ds2_Individual__dlm i');
  assert.equal(nodeOf(result.document).relation_name, 'Other__dll');
  const plain = dcsqlFile('SELECT ssot__Id__c FROM ssot__Individual__dlm');
  nodeOf(plain).relation_name = 'Other__dll';
  assert.deepEqual(unresolvedAt(translateDocument(plain, to(SPACE))), [`${SQL} line 1:8`]);
  // A node reading an intermediate DMO relation and the node writing it agree on its columns:
  // the writer's alias follows the relation's field rule like the reader's column.
  const staged = intoObject(
    'SELECT m.ssot__Id__c AS ssot__Id__c FROM Stage__dlm m',
    'ssot__Account__dlm',
    ['ssot__Id__c'],
  );
  staged.definition.definitions[0].manifest.nodes['model.stage'] = {
    compiled_code: 'SELECT i.ssot__Id__c AS ssot__Id__c FROM ssot__Individual__dlm i',
    config: { materialized: 'table' },
    name: 'stage',
    relation_name: 'Stage__dlm',
  };
  const chained = translateDocument(staged, to(SPACE));
  assert.deepEqual(chained.unresolved, []);
  const chainedNodes = chained.document.definition.definitions[0].manifest.nodes;
  assert.equal(
    chainedNodes['model.stage'].compiled_code,
    'SELECT i.Id__c AS Id__c FROM ds2_Individual__dlm i',
  );
  assert.equal(chainedNodes['model.stage'].relation_name, 'ds2_Stage__dlm');
  assert.equal(sqlOf(chained.document), 'SELECT m.Id__c AS Id__c FROM ds2_Stage__dlm m');
  // A DMO name is placed by the object rules.
  const dmo = dcsqlFile();
  nodeOf(dmo).relation_name = 'ssot__Account__dlm';
  const placed = translateDocument(dmo, to(SPACE));
  assert.deepEqual(placed.unresolved, []);
  assert.equal(nodeOf(placed.document).relation_name, 'ds2_Account__dlm');
  // Back to default the standard copy could be the standard DMO or a custom one: refused.
  const back = dcsqlFile();
  nodeOf(back).relation_name = 'ds2_Account__dlm';
  assert.deepEqual(unresolvedAt(translateDocument(back, to('default', SPACE))), [
    `${D}.manifest.nodes.model.input1.relation_name`,
  ]);
  // A missing or non-string relation_name is still refused.
  for (const relation of [undefined, 3]) {
    const missing = dcsqlFile();
    if (relation === undefined) delete nodeOf(missing).relation_name;
    else nodeOf(missing).relation_name = relation;
    const refused = translateDocument(missing, to(SPACE));
    assert.ok(
      refused.unresolved.some(
        (entry) =>
          entry.at === `${D}.manifest.nodes.model.input1.relation_name` &&
          /relation_name is missing/u.test(entry.reason),
      ),
      JSON.stringify(refused.unresolved),
    );
  }
});

test('a DCSQL node config is kept unless a value holds a name', () => {
  const file = dcsqlFile();
  const node = file.definition.definitions[0].manifest.nodes['model.input1'];
  node.config = { materialized: 'table', unique_key: 'Id__c', tags: ['nightly'] };
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(unresolvedAt(result), [`${D}.manifest.nodes.model.input1.config.unique_key`]);
  assert.match(result.unresolved[0].reason, /holds an object or field name/u);
  assert.deepEqual(
    result.document.definition.definitions[0].manifest.nodes['model.input1'].config,
    node.config,
  );
  // A name in a list value is refused too.
  node.config = { materialized: 'table', unique_key: ['ssot__Id__c'] };
  assert.deepEqual(unresolvedAt(translateDocument(file, to(SPACE))), [
    `${D}.manifest.nodes.model.input1.config.unique_key[0]`,
  ]);
});

test('DCSQL SQL the translation cannot place exactly is refused', () => {
  const cases = [
    ['SELECT * FROM ssot__Individual__dlm', `${SQL} line 1:8`, /this \* puts out the columns/u],
    ['SELECT x.ssot__Id__c AS Id__c FROM Nope__c x', `${SQL} line 1:36`, /no rule places/u],
    [
      'SELECT i.ssot__Id__c AS Id__c FROM ssot__Individual__dlm i WHERE i.ssot__A__c &lt; 3',
      `${SQL} line 1:79`,
      /HTML entity outside texts/u,
    ],
    [
      'SELECT SSOT__Id__c AS Id__c FROM ssot__Individual__dlm',
      `${SQL} line 1:8`,
      /SQL ignores the case/u,
    ],
  ];
  for (const [sql, at, reason] of cases) {
    const result = translateDocument(dcsqlFile(sql), to(SPACE));
    assert.ok(
      result.unresolved.some((entry) => entry.at === at && reason.test(entry.reason)),
      `${sql}: ${JSON.stringify(result.unresolved)}`,
    );
  }
  // Towards default a field without a table in front, after a join, has no spelling to place.
  const joined = translateDocument(
    dcsqlFile(
      'SELECT Id__c AS Id__c FROM ds2_UnifiedIndividualB__dlm u JOIN SyntheticSrc__dll s ON u.Id__c = s.Id__c',
    ),
    to('default', SPACE),
  );
  assert.ok(
    joined.unresolved.some(
      (entry) => entry.at === `${SQL} line 1:8` && /spell it differently/u.test(entry.reason),
    ),
    JSON.stringify(joined.unresolved),
  );
  // A name the translation does not read (a macro) falls to the full-coverage check.
  const macro = dcsqlFile();
  macro.definition.definitions[0].manifest.macros = {
    'macro.m': { macro_sql: 'select ssot__Id__c from ssot__Individual__dlm' },
  };
  assert.deepEqual(unresolvedAt(translateDocument(macro, to(SPACE))), [
    `${D}.manifest.macros.macro.m.macro_sql`,
  ]);
});

test('a DCSQL definition without SQL, or a transform of another type, is not supported', () => {
  const empty = dcsqlFile();
  empty.definition.definitions[0].manifest.nodes = {};
  assert.match(
    translateDocument(empty, to(SPACE)).unsupported,
    /DCSQL definition holds no manifest nodes/u,
  );
  const noCode = dcsqlFile();
  delete noCode.definition.definitions[0].manifest.nodes['model.input1'].compiled_code;
  assert.match(
    translateDocument(noCode, to(SPACE)).unsupported,
    /node model\.input1 holds no SQL in compiled_code/u,
  );
  const other = dcsqlFile();
  other.definition.definitions[0].type = 'SQL';
  assert.match(
    translateDocument(other, to(SPACE)).unsupported,
    /type SQL cannot be translated; only STL and DCSQL transforms can/u,
  );
  // raw_code, when present, is translated like compiled_code.
  const raw = dcsqlFile('SELECT i.ssot__Id__c AS Id__c FROM ssot__Individual__dlm i');
  raw.definition.definitions[0].manifest.nodes['model.input1'].raw_code =
    'SELECT i.ssot__Id__c AS Id__c FROM ssot__Individual__dlm i';
  const result = translateDocument(raw, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  assert.equal(
    result.document.definition.definitions[0].manifest.nodes['model.input1'].raw_code,
    'SELECT i.Id__c AS Id__c FROM ds2_Individual__dlm i',
  );
});
