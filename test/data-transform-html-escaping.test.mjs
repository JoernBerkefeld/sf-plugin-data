import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observeDataTransform,
  sameDataTransformDefinition,
} from '../lib/artifacts/data-transform-document.js';
import { preflightDataTransformDeploy } from '../lib/services/preflight-data-transform-deploy.js';
import { deleteDataTransform } from '../lib/services/delete-data-transform.js';
import { translateDocument } from '../lib/services/cross-dataspace-rename.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

// Salesforce stores STL expressions and DCSQL SQL as sent and never decodes a write. Without the
// plain-text request header its GET returns them HTML-escaped, as older plugin versions wrote
// them into files; the client sends that header, so the GET is plain (live, DB entries
// data360:plugin-cross-dataspace-deploy-3b-api68 and
// data360:connect-rest-entity-encoding-header-api68). Shapes from those probes, names synthetic.
const id = '1dt000000000001AAA';
const formula = `CASE WHEN Amount__c > 0 AND Amount__c < 100 THEN upper("Name__c") ELSE 'n' END`;
const sqlFilter = "Amount__c > 1 AND Amount__c < 50 AND NameUp__c != 'x'";
const dcsql =
  "SELECT s.Id__c AS Id__c, CONCAT(s.Name__c, '>') AS Name__c FROM Src__dll s WHERE s.Amount__c > 0";
/**
 * HTML-escape a text the way Connect REST does without the plain-text header (older files).
 * @param {string} text Plain text.
 * @returns {string} Escaped text.
 */
const escape = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\\', '&#92;');

/**
 * An STL transform input: load, join, formula, sqlFilter, aggregate and output.
 * @param {object} [options] Expression texts and the aggregate's nodeType.
 * @param {string} [options.f] Formula expression.
 * @param {string} [options.s] SQL filter expression.
 * @param {string} [options.nodeType] Aggregate nodeType, if any.
 * @returns {object} Native input.
 */
const stlInput = ({ f = formula, s = sqlFilter, nodeType } = {}) => ({
  name: 'CliStl',
  label: 'CliStl',
  type: 'BATCH',
  dataSpaceName: 'default',
  fullRunFrequency: 'DAILY',
  definition: {
    name: 'CliStl',
    label: 'CliStl',
    type: 'STL',
    version: '68.0',
    nodes: {
      LOAD_DATASET0: {
        action: 'load',
        parameters: {
          dataset: { name: 'Src__dll', type: 'dataLakeObject' },
          fields: ['Id__c', 'Name__c', 'Amount__c'],
          sampleDetails: { dataspace: 'default', sortBy: [], type: 'TopN' },
        },
        sources: [],
      },
      FORMULA0: {
        action: 'formula',
        parameters: {
          expressionType: 'SQL',
          fields: [
            {
              defaultValue: '',
              formulaExpression: f,
              label: 'NameUp',
              name: 'NameUp__c',
              precision: 255,
              type: 'TEXT',
            },
          ],
        },
        sources: ['LOAD_DATASET0'],
      },
      SQLFILTER0: {
        action: 'sqlFilter',
        parameters: { expressionType: 'SQL', sqlFilterExpression: s },
        sources: ['FORMULA0'],
      },
      AGGREGATE0: {
        action: 'aggregate',
        parameters: {
          aggregations: [
            { action: 'SUM', label: 'SumAmount', name: 'SumAmount__c', source: 'Amount__c' },
          ],
          groupings: ['NameUp__c'],
          ...(nodeType === undefined ? {} : { nodeType }),
        },
        sources: ['SQLFILTER0'],
      },
      OUTPUT0: {
        action: 'outputD360',
        parameters: {
          dedupOrder: [],
          fieldsMappings: [{ sourceField: 'NameUp__c', targetField: 'Id__c' }],
          name: 'Out__dll',
          type: 'dataLakeObject',
          writeMode: 'OVERWRITE',
        },
        sources: ['AGGREGATE0'],
      },
    },
    outputDataObjects: [],
  },
});
/**
 * A DCSQL transform input.
 * @param {string} [sql] Model SQL.
 * @returns {object} Native input.
 */
const dcsqlInput = (sql = dcsql) => ({
  name: 'CliSql',
  label: 'CliSql',
  type: 'BATCH',
  dataSpaceName: 'default',
  fullRunFrequency: 'DAILY',
  definitions: [
    {
      name: 'CliSql',
      label: 'CliSql',
      type: 'DCSQL',
      manifest: {
        macros: {},
        nodes: {
          'model.out1': {
            compiled_code: sql,
            config: { materialized: 'table' },
            name: 'out1',
            relation_name: 'Out__dll',
          },
        },
        sources: {},
      },
      outputDataObjects: [],
    },
  ],
});
/**
 * A transform file.
 * @param {object} definition Native input.
 * @returns {object} File.
 */
const file = (definition) => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  c__dataSpace: 'default',
  definition,
});
/**
 * The GET of a stored input as the client reads it (plain text): server keys added, aggregate
 * nodeType STANDARD.
 * @param {object} body Stored input.
 * @returns {object} GET.
 */
const get = (body) => {
  const value = structuredClone(body);
  for (const definition of value.definitions ?? [value.definition])
    for (const node of Object.values(definition.nodes ?? {}))
      if (node.action === 'aggregate') node.parameters.nodeType = 'STANDARD';
  return { ...value, id, status: 'ACTIVE', lastRunStatus: 'SUCCESS' };
};
const noSchedule = () =>
  JSON.parse('{"frequency":"None","nextScheduledDate":null,"time":null,"type":"None"}');
/**
 * A transform client over one stored transform.
 * @param {object} raw GET of the stored transform.
 * @returns {{calls: Array<unknown[]>, client: object}} Recording fake.
 */
const harness = (raw) => {
  const calls = [];
  let deleted = false;
  return {
    calls,
    client: {
      get: async (selection) => {
        calls.push(['get', selection]);
        return structuredClone(raw);
      },
      schedule: async () => {
        calls.push(['schedule']);
        return noSchedule();
      },
      dataSpaces: async () => {
        calls.push(['dataSpaces']);
        return new Map([[raw.name, 'default']]);
      },
      validate: async (body) => {
        calls.push(['validate', structuredClone(body)]);
        return { issues: [] };
      },
      list: async () => {
        calls.push(['list']);
        return {
          totalSize: deleted ? 0 : 1,
          dataTransforms: deleted ? [] : [{ id, name: raw.name }],
        };
      },
      delete: async (target) => {
        calls.push(['delete', target]);
        deleted = true;
      },
    },
  };
};

test('retrieve keeps STL expressions, DCSQL SQL, labels and descriptions as read (plain text)', () => {
  const body = stlInput();
  body.label = `CliStl a&b <x> "q" 'y'`;
  body.description = `desc & <tag> "dq" 'sq' &amp; kept`;
  const stl = observeDataTransform(get(body), noSchedule(), 'retrieve', 'default');
  const definition = stl.document.definition;
  assert.equal(definition.label, body.label);
  assert.equal(definition.description, body.description);
  const nodes = definition.definition.nodes;
  assert.equal(nodes.FORMULA0.parameters.fields[0].formulaExpression, formula);
  assert.equal(nodes.SQLFILTER0.parameters.sqlFilterExpression, sqlFilter);
  const sql = observeDataTransform(get(dcsqlInput()), noSchedule(), 'retrieve', 'default');
  assert.equal(
    sql.document.definition.definitions[0].manifest.nodes['model.out1'].compiled_code,
    dcsql,
  );
  // Plain text is never decoded: a literal entity inside a text stays as stored.
  const raw = get(dcsqlInput("SELECT '&gt;' AS x__c FROM Src__dll"));
  raw.definitions[0].manifest.nodes['model.out1'].raw_code = "SELECT '&#39;' AS x__c";
  const node = observeDataTransform(raw, noSchedule(), 'retrieve', 'default').document.definition
    .definitions[0].manifest.nodes['model.out1'];
  assert.equal(node.compiled_code, "SELECT '&gt;' AS x__c FROM Src__dll");
  assert.equal(node.raw_code, "SELECT '&#39;' AS x__c");
});

test('a retrieved file is unchanged against the org, also without the aggregate nodeType', async () => {
  for (const body of [stlInput(), stlInput({ nodeType: 'STANDARD' }), dcsqlInput()]) {
    const h = harness(get(body));
    const plan = await preflightDataTransformDeploy(
      file(body),
      { operation: 'update', targetId: id },
      h.client,
    );
    assert.equal(plan.operation, 'unchanged', JSON.stringify(body.name));
    assert.equal(
      h.calls.some(([op]) => op === 'validate'),
      false,
    );
  }
  // A changed expression is an update; another nodeType is a change too.
  const changed = harness(get(stlInput()));
  const update = await preflightDataTransformDeploy(
    file(stlInput({ s: 'Amount__c > 2' })),
    { operation: 'update', targetId: id },
    changed.client,
  );
  assert.equal(update.operation, 'update');
  const observed = observeDataTransform(get(stlInput()), noSchedule()).document;
  assert.equal(sameDataTransformDefinition(observed, file(stlInput({ nodeType: 'OTHER' }))), false);
});

test('a file with HTML-escaped expressions (an older retrieve) is refused before anything is sent', async () => {
  for (const [body, at] of [
    [
      stlInput({ s: escape(sqlFilter) }),
      'definition.definition.nodes.SQLFILTER0.parameters.sqlFilterExpression',
    ],
    [
      stlInput({ f: escape(formula) }),
      'definition.definition.nodes.FORMULA0.parameters.fields[0].formulaExpression',
    ],
    [
      dcsqlInput(escape(dcsql)),
      'definition.definitions[0].manifest.nodes.model.out1.compiled_code',
    ],
  ]) {
    for (const selection of [{ operation: 'create' }, { operation: 'update', targetId: id }]) {
      const h = harness(get(body));
      await assert.rejects(
        preflightDataTransformDeploy(file(body), selection, h.client),
        (error) => {
          assert.equal(error.code, 'UNSUPPORTED_TRANSFORM_INPUT');
          assert.ok(error.message.includes(at), error.message);
          assert.match(error.message, /HTML entity &(?:gt|#39);/u);
          assert.match(
            error.message,
            /Write the character itself in the file\. If a fresh retrieve of the data transform still shows the entity, Salesforce stores the expression that way/u,
          );
          return true;
        },
      );
      assert.deepEqual(h.calls, []);
    }
  }
  // A plain expression with an entity inside a text is plain SQL: sent as written.
  const literal = stlInput({ s: "NameUp__c != '&amp;'" });
  const h = harness(get(literal));
  const plan = await preflightDataTransformDeploy(file(literal), { operation: 'create' }, h.client);
  assert.equal(plan.operation, 'create');
  assert.equal(
    h.calls.find(([op]) => op === 'validate')[1].definition.nodes.SQLFILTER0.parameters
      .sqlFilterExpression,
    "NameUp__c != '&amp;'",
  );
});

test('a cross-space copy of an older escaped STL file is written plain', () => {
  const old = file(stlInput({ f: escape(formula), s: escape(sqlFilter) }));
  const result = translateDocument(old, {
    source: 'default',
    target: 'dataspace2',
    spaces: [{ name: 'default' }, { name: 'dataspace2', prefix: 'ds2' }],
  });
  assert.deepEqual(result.unresolved, []);
  const nodes = result.document.definition.definition.nodes;
  assert.equal(result.document.definition.name, 'ds2_CliStl');
  assert.equal(nodes.FORMULA0.parameters.fields[0].formulaExpression, formula);
  assert.equal(nodes.SQLFILTER0.parameters.sqlFilterExpression, sqlFilter);
});

test('TRANSFORM_VALIDATION_FAILED shows the issue texts Salesforce gives, within the display filter', async () => {
  const body = stlInput();
  const h = harness(get(body));
  h.client.validate = async () => ({
    issues: [
      {
        errorCode: 'INVALID_DATA_TRANSFORM_DATA_OBJECTS',
        errorMessage:
          'Output objects Out are already in use. Select a different object or create a new one for this data transform’s output.',
        errorSeverity: 'ERROR',
        type: 'TRANSFORM',
      },
      {
        definitionName: 'CliStl',
        errorCode: 'INVALID_DATA_TRANSFORM_DEFINITION',
        errorMessage:
          "There's a syntax error in the filter node SQLFILTER0's SQL expression at row 1, column 11. Update your syntax.",
        errorSeverity: 'ERROR',
        type: 'DEFINITION',
      },
      // A message the filter does not admit shows its code only.
      { errorCode: 'OTHER_ISSUE', errorMessage: 'See https://example.invalid/x for value=1' },
    ],
  });
  await assert.rejects(
    preflightDataTransformDeploy(file(body), { operation: 'create' }, h.client),
    (error) => {
      assert.equal(error.code, 'TRANSFORM_VALIDATION_FAILED');
      const shown = operationDiagnostic(error, 'Fix it, then rerun.');
      assert.match(
        shown,
        /^Salesforce validation rejected the data transform CliStl: INVALID_DATA_TRANSFORM_DATA_OBJECTS: Output objects Out are already in use\./u,
      );
      assert.match(
        shown,
        /INVALID_DATA_TRANSFORM_DEFINITION: There’s a syntax error in the filter node SQLFILTER0’s SQL expression at row 1, column 11\./u,
      );
      assert.match(shown, /; OTHER_ISSUE\. Nothing was created\. Fix it, then rerun\.$/u);
      assert.doesNotMatch(shown, /example\.invalid|no Salesforce rejection was confirmed/u);
      return true;
    },
  );
  assert.equal(
    h.calls.some(([op]) => op === 'create'),
    false,
  );
});

test('deleting with a file an older retrieve wrote escaped is no drift', async () => {
  const body = stlInput();
  const h = harness(get(body));
  const old = file(stlInput({ f: escape(formula), s: escape(sqlFilter) }));
  const result = await deleteDataTransform(old, h.client, {
    targetId: id,
    confirmDelete: true,
    verifyInput: async () => {},
    now: () => 0,
    delay: async () => {},
  });
  assert.equal(result.outcome, 'deleted');
  // Another expression is still drift.
  const other = harness(get(body));
  await assert.rejects(
    deleteDataTransform(file(stlInput({ s: 'Amount__c > 2' })), other.client, {
      targetId: id,
      confirmDelete: true,
      verifyInput: async () => {},
    }),
    /TRANSFORM_TARGET_DRIFT/u,
  );
});

test('a transform Salesforce stores with a literal entity retrieves and deletes without drift', async () => {
  // A plain-text GET still holds &quot; when Salesforce stores the expression so.
  const stored = stlInput({ f: 'upper(&quot;Name__c&quot;)' });
  const retrieved = observeDataTransform(get(stored), noSchedule(), 'retrieve', 'default');
  assert.equal(
    retrieved.document.definition.definition.nodes.FORMULA0.parameters.fields[0].formulaExpression,
    'upper(&quot;Name__c&quot;)',
  );
  const h = harness(get(stored));
  const result = await deleteDataTransform(file(retrieved.document.definition), h.client, {
    targetId: id,
    confirmDelete: true,
    verifyInput: async () => {},
    now: () => 0,
    delay: async () => {},
  });
  assert.equal(result.outcome, 'deleted');
});

test('an update of a file holding an HTML-escaped copy of the org label is refused', async () => {
  const body = stlInput();
  body.label = `CliStl a&b "q"`;
  const escaped = { ...stlInput(), label: 'CliStl a&amp;b &quot;q&quot;' };
  const h = harness(get(body));
  await assert.rejects(
    preflightDataTransformDeploy(file(escaped), { operation: 'update', targetId: id }, h.client),
    (error) => {
      assert.equal(error.code, 'HTML_ESCAPED_FILE');
      assert.match(error.message, /HTML-escaped text at label/u);
      return true;
    },
  );
  assert.equal(
    h.calls.some(([op]) => op === 'validate'),
    false,
  );
});
