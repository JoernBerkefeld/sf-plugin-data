import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translateDocument } from '../lib/services/cross-dataspace-rename.js';
import { validateDataTransformDocument } from '../lib/artifacts/data-transform-document.js';

// STL expression nodes between data spaces: formula, filter, sqlFilter, aggregate and appendV2.
// The node shapes come from a live probe (API 68, DB entry
// data360:dataspace-ci-spelling-stl-nodes-api68), sanitized into the fixture.
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
];
const to = (target, source = 'default', extra = {}) => ({ source, target, spaces, ...extra });
const unresolvedAt = (result) => result.unresolved.map((entry) => entry.at);
const probe = JSON.parse(
  readFileSync(new URL('fixtures/stl-expression-nodes.sanitized.json', import.meta.url), 'utf8'),
);
const clone = (value) => structuredClone(value);
const P = 'definition.definition.nodes';

/**
 * An STL transform file as retrieve writes it.
 * @param {object} nodes STL nodes.
 * @param {object[]} [outputDataObjects] Output objects.
 * @param {string} [space] Its data space.
 * @returns {object} Transform file.
 */
const transformFile = (nodes, outputDataObjects = [], space = 'default') => {
  const name = space === 'default' ? 'CliStl' : 'ds2_CliStl';
  return {
    schemaVersion: 1,
    kind: 'data-transform',
    apiVersion: '68.0',
    c__dataSpace: space,
    definition: {
      name,
      label: 'Stl',
      type: 'BATCH',
      ...(space === 'default' ? {} : { dataSpaceName: space }),
      definition: { name, label: 'Stl', type: 'STL', version: '68.0', nodes, outputDataObjects },
    },
  };
};

/**
 * A load node.
 * @param {string} name Object name.
 * @param {string[]} fields Loaded fields.
 * @param {string} [space] Sample data space.
 * @returns {object} Node.
 */
const load = (name, fields, space = 'default') => ({
  action: 'load',
  parameters: {
    dataset: { name, type: name.endsWith('__dll') ? 'dataLakeObject' : 'dataModelObject' },
    fields,
    sampleDetails: { dataspace: space, sortBy: [], type: 'TopN' },
  },
  sources: [],
});

/**
 * An output node into a DLO.
 * @param {string} source Source node.
 * @param {Array<[string, string]>} pairs Source and target fields.
 * @returns {object} Node.
 */
const output = (source, pairs) => ({
  action: 'outputD360',
  parameters: {
    dedupOrder: [],
    fieldsMappings: pairs.map(([sourceField, targetField]) => ({ sourceField, targetField })),
    name: 'CliOut__dll',
    type: 'dataLakeObject',
    writeMode: 'OVERWRITE',
  },
  sources: [source],
});

/**
 * A chain on one object, in the shapes of the probe: load, formula, filter, sqlFilter, aggregate
 * and output, plus an appendV2 of two loads of that object.
 * @param {object} options Spelling.
 * @param {string} options.object The loaded object.
 * @param {string} options.p The field prefix (`ssot__` or none).
 * @param {string} [options.space] Data space of the file.
 * @param {string} [options.formulaName] The formula's output column.
 * @param {string} [options.formulaExpression] The formula's SQL.
 * @param {string} [options.sqlFilterExpression] The SQL filter.
 * @returns {object} Transform file.
 */
const chain = ({
  object,
  p,
  space = 'default',
  formulaName = 'FullName__c',
  formulaExpression = `upper(&quot;${p}FirstName__c&quot;) || &#39;-&#39; || ${p}LastName__c`,
  sqlFilterExpression = `${p}FirstName__c = 'x'`,
}) => {
  const fields = ['UnifiedRecordId__c', `${p}FirstName__c`, `${p}LastName__c`, `${p}Amount__c`];
  const formula = clone(probe.stored.nodes.FORMULA0);
  formula.sources = ['LOAD0'];
  formula.parameters.fields[0].name = formulaName;
  formula.parameters.fields[0].formulaExpression = formulaExpression;
  const filter = clone(probe.stored.nodes.FILTER0);
  filter.sources = ['FORMULA0'];
  filter.parameters.filterExpressions[0].field = `${p}Amount__c`;
  const sqlFilter = clone(probe.validatedOnly.sqlFilter);
  sqlFilter.sources = ['FILTER0'];
  sqlFilter.parameters.sqlFilterExpression = sqlFilterExpression;
  const aggregate = clone(probe.validatedOnly.aggregate);
  aggregate.sources = ['SQLFILTER0'];
  aggregate.parameters.aggregations[0].source = `${p}Amount__c`;
  aggregate.parameters.groupings = [`${p}FirstName__c`, formulaName];
  const append = clone(probe.validatedOnly.appendV2);
  append.sources = ['LOAD0', 'LOAD1'];
  append.parameters.fieldMappings = [
    { top: 'UnifiedRecordId__c', bottom: 'UnifiedRecordId__c' },
    { top: `${p}FirstName__c`, bottom: `${p}LastName__c` },
  ];
  return transformFile(
    {
      LOAD0: load(object, fields, space),
      LOAD1: load(object, fields, space),
      FORMULA0: formula,
      FILTER0: filter,
      SQLFILTER0: sqlFilter,
      AGGREGATE0: aggregate,
      OUTPUT0: output('AGGREGATE0', [
        [`${p}FirstName__c`, 'First__c'],
        ['SumAmount__c', 'Sum__c'],
      ]),
      APPEND0: append,
      OUTPUT1: output('APPEND0', [['UnifiedRecordId__c', 'Id__c']]),
    },
    [],
    space,
  );
};

test('the probe transform (load, join, formula, filter, output on DLOs) is translated both ways', () => {
  const file = transformFile(clone(probe.stored.nodes), clone(probe.stored.outputDataObjects));
  const result = translateDocument(file, to(SPACE));
  assert.equal(result.unsupported, undefined);
  assert.deepEqual(result.unresolved, []);
  validateDataTransformDocument(result.document);
  const nodes = result.document.definition.definition.nodes;
  assert.equal(result.document.definition.name, 'ds2_CliStl');
  assert.equal(nodes.LOAD_DATASET0.parameters.sampleDetails.dataspace, SPACE);
  // DLO fields keep their names; the escaped expression is written back unchanged.
  assert.deepEqual(nodes.FORMULA0.parameters, probe.stored.nodes.FORMULA0.parameters);
  assert.deepEqual(nodes.FILTER0.parameters, probe.stored.nodes.FILTER0.parameters);
  const back = translateDocument(result.document, to('default', SPACE));
  assert.deepEqual(back.unresolved, []);
  assert.deepEqual(back.document.definition.definition.nodes, probe.stored.nodes);
});

/**
 * The probe's DLO field names in the spelling of a standard DMO of default.
 * @param {string} text JSON text.
 * @returns {string} Text with `ssot__` fields.
 */
const ssot = (text) => text.replaceAll(/\b(Id|Name|ParentId|Amount)__c\b/gu, 'ssot__$1__c');

test('default to dataspace2: the probe on standard DMOs, a qualified formula field included', () => {
  const nodes = clone(probe.stored.nodes);
  for (const key of ['LOAD_DATASET0', 'LOAD_DATASET1', 'JOIN0', 'FORMULA0', 'FILTER0'])
    nodes[key] = JSON.parse(ssot(JSON.stringify(nodes[key])));
  nodes.LOAD_DATASET0.parameters.dataset = {
    name: 'ssot__Individual__dlm',
    type: 'dataModelObject',
  };
  nodes.LOAD_DATASET1.parameters.dataset = { name: 'ssot__Account__dlm', type: 'dataModelObject' };
  nodes.OUTPUT0.parameters.fieldsMappings[0].sourceField = 'ssot__Id__c';
  assert.equal(
    nodes.FORMULA0.parameters.fields[0].formulaExpression,
    'upper(&quot;R.ssot__Name__c&quot;) || &#39;-&#39; || ssot__Name__c',
  );
  const result = translateDocument(transformFile(nodes), to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const after = result.document.definition.definition.nodes;
  assert.equal(after.LOAD_DATASET0.parameters.dataset.name, 'ds2_Individual__dlm');
  assert.equal(after.LOAD_DATASET1.parameters.dataset.name, 'ds2_Account__dlm');
  assert.deepEqual(after.JOIN0.parameters.leftKeys, ['ParentId__c']);
  assert.deepEqual(after.JOIN0.parameters.rightKeys, ['Id__c']);
  const formula = after.FORMULA0.parameters.fields[0];
  // The qualified field is placed by the right side; the form stays HTML-escaped.
  assert.equal(formula.formulaExpression, 'upper(&quot;R.Name__c&quot;) || &#39;-&#39; || Name__c');
  assert.equal(formula.name, 'NameUp__c');
  assert.equal(after.FILTER0.parameters.filterExpressions[0].field, 'Amount__c');
  assert.equal(after.OUTPUT0.parameters.fieldsMappings[0].sourceField, 'Id__c');
  assert.ok(
    result.rewrites.some(
      (entry) =>
        entry.at === `${P}.FORMULA0.parameters.fields[0].formulaExpression line 1:7` &&
        entry.from === 'R.ssot__Name__c' &&
        entry.to === 'R.Name__c',
    ),
  );
  // Unqualified and quoted alike; an unquoted qualified field too.
  nodes.FORMULA0.parameters.fields[0].formulaExpression =
    'concat(R.ssot__Name__c, "ssot__Name__c")';
  const unquoted = translateDocument(transformFile(nodes), to(SPACE));
  assert.deepEqual(unquoted.unresolved, []);
  assert.equal(
    unquoted.document.definition.definition.nodes.FORMULA0.parameters.fields[0].formulaExpression,
    'concat(R.Name__c, "Name__c")',
  );
});

test('default to dataspace2: formula, filter, sqlFilter, aggregate and appendV2 by lineage', () => {
  const file = chain({
    object: 'ssot__Individual__dlm',
    p: 'ssot__',
    formulaName: 'ssot__FullName__c',
  });
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  validateDataTransformDocument(result.document);
  const nodes = result.document.definition.definition.nodes;
  assert.equal(nodes.LOAD0.parameters.dataset.name, 'ds2_Individual__dlm');
  const formula = nodes.FORMULA0.parameters.fields[0];
  assert.equal(
    formula.formulaExpression,
    'upper(&quot;FirstName__c&quot;) || &#39;-&#39; || LastName__c',
  );
  // A new column named in the source spelling follows the renamed fields.
  assert.equal(formula.name, 'FullName__c');
  assert.equal(formula.label, 'NameUp');
  assert.equal(nodes.FILTER0.parameters.filterExpressions[0].field, 'Amount__c');
  assert.deepEqual(nodes.FILTER0.parameters.filterExpressions[0].operands, ['0']);
  // An unescaped expression stays unescaped; the text in quotes is data.
  assert.equal(nodes.SQLFILTER0.parameters.sqlFilterExpression, "FirstName__c = 'x'");
  assert.deepEqual(nodes.AGGREGATE0.parameters.aggregations[0], {
    action: 'SUM',
    source: 'Amount__c',
    name: 'SumAmount__c',
    label: 'SumAmount',
  });
  assert.deepEqual(nodes.AGGREGATE0.parameters.groupings, ['FirstName__c', 'FullName__c']);
  assert.deepEqual(nodes.APPEND0.parameters.fieldMappings, [
    { top: 'UnifiedRecordId__c', bottom: 'UnifiedRecordId__c' },
    { top: 'FirstName__c', bottom: 'LastName__c' },
  ]);
  assert.equal(nodes.OUTPUT0.parameters.fieldsMappings[0].sourceField, 'FirstName__c');
});

test('dataspace2 to default: every node of a chain on a custom DMO, and back', () => {
  const file = chain({ object: 'ds2_Order__dlm', p: '', space: SPACE });
  const context = to('default', SPACE, { customDmos: new Set(['ds2_Order__dlm']) });
  const result = translateDocument(file, context);
  assert.deepEqual(result.unresolved, []);
  const nodes = result.document.definition.definition.nodes;
  assert.equal(result.document.definition.name, 'CliStl');
  assert.equal(nodes.LOAD0.parameters.dataset.name, 'Order__dlm');
  assert.equal(nodes.LOAD0.parameters.sampleDetails.dataspace, 'default');
  // A custom DMO keeps every field name, so the nodes are unchanged.
  for (const key of ['FORMULA0', 'FILTER0', 'SQLFILTER0', 'AGGREGATE0', 'APPEND0'])
    assert.deepEqual(nodes[key], file.definition.definition.nodes[key], key);
  const there = translateDocument(result.document, to(SPACE));
  assert.deepEqual(there.unresolved, []);
  assert.deepEqual(
    there.document.definition.definition.nodes.LOAD0.parameters.dataset.name,
    'ds2_Order__dlm',
  );
});

test('dataspace2 to default on a unified output: references get ssot__, added columns are refused', () => {
  const file = chain({ object: 'ds2_UnifiedIndividualB__dlm', p: '', space: SPACE });
  const result = translateDocument(file, to('default', SPACE));
  // The columns the formula and the aggregate add would take ssot__ by the rule of the unified
  // output, whose fields they are not: refused, never guessed (so the file is not deployed).
  assert.deepEqual(unresolvedAt(result), [
    `${P}.FORMULA0.parameters.fields[0].name`,
    `${P}.AGGREGATE0.parameters.aggregations[0].name`,
  ]);
  assert.match(result.unresolved[0].reason, /adds the column FullName__c.*ssot__FullName__c/u);
  // Every field the nodes read is placed.
  const nodes = result.document.definition.definition.nodes;
  assert.equal(nodes.LOAD0.parameters.dataset.name, 'UnifiedssotIndividualB__dlm');
  assert.equal(
    nodes.FORMULA0.parameters.fields[0].formulaExpression,
    'upper(&quot;ssot__FirstName__c&quot;) || &#39;-&#39; || ssot__LastName__c',
  );
  assert.equal(nodes.FILTER0.parameters.filterExpressions[0].field, 'ssot__Amount__c');
  assert.equal(nodes.SQLFILTER0.parameters.sqlFilterExpression, "ssot__FirstName__c = 'x'");
  assert.equal(nodes.AGGREGATE0.parameters.aggregations[0].source, 'ssot__Amount__c');
  assert.equal(nodes.AGGREGATE0.parameters.groupings[0], 'ssot__FirstName__c');
  assert.deepEqual(nodes.APPEND0.parameters.fieldMappings, [
    { top: 'UnifiedRecordId__c', bottom: 'UnifiedRecordId__c' },
    { top: 'ssot__FirstName__c', bottom: 'ssot__LastName__c' },
  ]);
});

test('HTML-escaped expressions are read unescaped and written back escaped; a mixed form is refused', () => {
  const escaped = chain({
    object: 'ssot__Individual__dlm',
    p: 'ssot__',
    sqlFilterExpression:
      'ssot__Amount__c &gt; 1 AND &quot;ssot__FirstName__c&quot; &lt;&gt; &#39;a&amp;b&#39;',
  });
  const result = translateDocument(escaped, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  assert.equal(
    result.document.definition.definition.nodes.SQLFILTER0.parameters.sqlFilterExpression,
    'Amount__c &gt; 1 AND &quot;FirstName__c&quot; &lt;&gt; &#39;a&amp;b&#39;',
  );
  const mixed = chain({
    object: 'ssot__Individual__dlm',
    p: 'ssot__',
    sqlFilterExpression: '"ssot__FirstName__c" = &#39;a&#39;',
  });
  const refused = translateDocument(mixed, to(SPACE));
  // The full-coverage check reports the leftover ssot__ at the same place too.
  assert.deepEqual(
    new Set(unresolvedAt(refused)),
    new Set([`${P}.SQLFILTER0.parameters.sqlFilterExpression`]),
  );
  assert.match(refused.unresolved[0].reason, /mixes HTML-escaped and plain characters/u);
});

test('an expression name the translation cannot place exactly is refused', () => {
  const at = `${P}.SQLFILTER0.parameters.sqlFilterExpression`;
  const cases = [
    // No join above the node: the qualifier names no side.
    ['"X.ssot__FirstName__c" = 1', /qualifier X names no side of the join/u],
    [
      'ssot__FirstName__c IN (SELECT 1 FROM ssot__Individual__dlm)',
      /object name inside an expression/u,
    ],
    ['a.b.ssot__FirstName__c = 1', /dotted name other than <qualifier>\.<field>/u],
    ['SSOT__FirstName__c = 1', /SQL ignores the case/u],
    [String.raw`ssot__FirstName__c = 'it\'s'`, /cannot be read exactly/u],
  ];
  for (const [sql, reason] of cases) {
    const result = translateDocument(
      chain({ object: 'ssot__Individual__dlm', p: 'ssot__', sqlFilterExpression: sql }),
      to(SPACE),
    );
    assert.ok(result.unresolved.length > 0, sql);
    assert.ok(
      result.unresolved.every((entry) => entry.at.startsWith(at)),
      `${sql}: ${JSON.stringify(result.unresolved)}`,
    );
    assert.ok(
      result.unresolved.some((entry) => reason.test(entry.reason)),
      `${sql}: ${JSON.stringify(result.unresolved)}`,
    );
  }
  // A formula in another expression language is not translated.
  const other = chain({ object: 'ssot__Individual__dlm', p: 'ssot__' });
  other.definition.definition.nodes.FORMULA0.parameters.expressionType = 'SAQL';
  const refused = translateDocument(other, to(SPACE));
  assert.deepEqual(
    new Set(unresolvedAt(refused)),
    new Set([`${P}.FORMULA0.parameters.fields[0].formulaExpression`]),
  );
  assert.match(refused.unresolved[0].reason, /type SAQL cannot be translated/u);
  // A filter operand that names a field is not a value the translation reads: refused.
  const operand = chain({ object: 'ssot__Individual__dlm', p: 'ssot__' });
  operand.definition.definition.nodes.FILTER0.parameters.filterExpressions[0].operands = [
    'ssot__LastName__c',
  ];
  assert.deepEqual(unresolvedAt(translateDocument(operand, to(SPACE))), [
    `${P}.FILTER0.parameters.filterExpressions[0].operands[0]`,
  ]);
  // After a join of a DLO and a unified output, an unqualified field towards default has no
  // object to place it by; the qualified one is placed by its side.
  const joined = transformFile(clone(probe.stored.nodes), [], SPACE);
  joined.definition.definition.nodes.LOAD_DATASET1 = load(
    'ds2_UnifiedIndividualB__dlm',
    ['Id__c', 'Name__c'],
    SPACE,
  );
  joined.definition.definition.nodes.FORMULA0.parameters.fields[0].formulaExpression =
    'upper(&quot;R.Name__c&quot;) || Name__c';
  const unknown = translateDocument(joined, to('default', SPACE));
  assert.ok(
    unknown.unresolved.some(
      (entry) =>
        entry.at === `${P}.FORMULA0.parameters.fields[0].formulaExpression line 1:23` &&
        /not known here/u.test(entry.reason),
    ),
    JSON.stringify(unknown.unresolved),
  );
  assert.equal(
    unknown.document.definition.definition.nodes.FORMULA0.parameters.fields[0].formulaExpression,
    'upper(&quot;R.ssot__Name__c&quot;) || Name__c',
  );
});

test('the lineage of each node is worked out once per transform', () => {
  // A chain of appends, each reading the one before twice: walked again per path, the lineage of
  // the last node would take 2^40 steps.
  const nodes = { LOAD0: load('ssot__Individual__dlm', ['ssot__FirstName__c']) };
  let previous = 'LOAD0';
  for (let index = 0; index < 40; index++) {
    const append = clone(probe.validatedOnly.appendV2);
    append.parameters.fieldMappings = [];
    append.sources = [previous, previous];
    previous = `APPEND${index}`;
    nodes[previous] = append;
  }
  const sqlFilter = clone(probe.validatedOnly.sqlFilter);
  sqlFilter.sources = [previous];
  sqlFilter.parameters.sqlFilterExpression = "ssot__FirstName__c = 'x'";
  nodes.SQLFILTER0 = sqlFilter;
  const result = translateDocument(transformFile(nodes), to(SPACE));
  assert.deepEqual(result.unresolved, []);
  assert.equal(
    result.document.definition.definition.nodes.SQLFILTER0.parameters.sqlFilterExpression,
    "FirstName__c = 'x'",
  );
});
