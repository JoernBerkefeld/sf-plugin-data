import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { codeFilePath, joinCodeFields, splitCodeFields } from '../lib/artifacts/code-fields.js';
import {
  CalculatedInsightError,
  observeNativeCalculatedInsight,
  parseNativeCalculatedInsight,
  serializeNativeCalculatedInsight,
  unescapeSalesforceHtml,
  validateNativeCalculatedInsight,
} from '../lib/artifacts/native-calculated-insight-document.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import {
  acquireCalculatedInsight,
  listCalculatedInsightNames,
  retrieveNativeCalculatedInsight,
  visualDraftPlaceholder,
} from '../lib/services/native-calculated-insight.js';
import { ConnectError } from '../lib/transport/connect-client.js';

// eslint-disable-next-line unicorn/no-null -- The API 68 GET returns explicit nulls.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const escapedSql = `SELECT APPROX_COUNT_DISTINCT(${table}.ssot__DeviceId__c) AS device_count__c FROM ${table} WHERE ${table}.ssot__EngagementDateTm__c &gt;= date_sub(current_date(), 30) AND ${table}.ssot__EngagementChannelActionId__c = &#39;APP_OPEN&#39; GROUP BY app_id__c`;
const plainSql = escapedSql.replace('&gt;=', '>=').replaceAll('&#39;', "'");

/**
 * An API 68 GET body shaped like the live one (status, run history and derived schema included).
 * @param {string} apiName Insight name.
 * @returns {object} GET response.
 */
const getBody = (apiName = 'Synthetic__cio') => ({
  apiName,
  calculatedInsightStatus: 'ACTIVE',
  creationType: 'Custom',
  dataSpace: 'default',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: wireNull,
  dimensions: [{ apiName: 'app_id__c', fieldRole: 'DIMENSION' }],
  displayName: 'Synthetic',
  expression: escapedSql,
  historyPublishScheduleInterval: wireNull,
  historyPublishScheduleTimeZone: wireNull,
  historyPublishTime: wireNull,
  isEnabled: true,
  isFromPackage: false,
  lastCalcInsightStatusDateTime: '2026-08-30T20:19:25.000Z',
  lastCalcInsightStatusErrorCode: wireNull,
  lastRunDateTime: '2026-08-30T15:03:42.000Z',
  lastRunStatus: 'SUCCESS',
  lastRunStatusDateTime: '2026-08-30T15:05:07.000Z',
  lastRunStatusErrorCode: wireNull,
  measures: [{ apiName: 'device_count__c', fieldRole: 'MEASURE' }],
  publishScheduleEndDate: wireNull,
  publishScheduleInterval: 'NOT_SCHEDULED',
  publishScheduleStartDateTime: wireNull,
  publishScheduleTimeZone: wireNull,
  queryDialect: 'ANSI_SQL',
  sourceCiDevName: wireNull,
  sourceCiId: wireNull,
  sourceCiName: wireNull,
  subType: wireNull,
});
const kept = [
  'apiName',
  'dataSpace',
  'definitionType',
  'description',
  'displayName',
  'historyPublishScheduleInterval',
  'historyPublishScheduleTimeZone',
  'historyPublishTime',
  'isFromPackage',
  'publishScheduleEndDate',
  'publishScheduleInterval',
  'publishScheduleStartDateTime',
  'publishScheduleTimeZone',
  'queryDialect',
  'sourceCiDevName',
];
const root = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-retrieve-'));
  await writeFile(path.join(cwd, '.owner'), randomUUID());
  return cwd;
};
const invalid = () => new Error('invalid');

test('code fields: a single field splits out and joins back', () => {
  const fields = [{ path: ['expression'], extension: 'sql' }];
  const source = { apiName: 'A__cio', expression: 'SELECT 1' };
  const { document, files } = splitCodeFields(source, fields, invalid);
  assert.deepEqual(document, { apiName: 'A__cio' });
  assert.deepEqual(files, [{ extension: 'sql', text: 'SELECT 1' }]);
  assert.deepEqual(source.expression, 'SELECT 1', 'the input is not changed');
  assert.deepEqual(joinCodeFields(document, fields, files, invalid), source);
  assert.equal(
    codeFilePath('/p/X__cio.calculatedInsight-meta.json', files[0]),
    '/p/X__cio.calculatedInsight-meta.sql',
  );
});

test('code fields: array elements split into one file each, named by their key', () => {
  const fields = [{ path: ['spec', 'models'], each: 'sql', key: 'name', extension: 'sql' }];
  const source = {
    spec: {
      models: [
        { name: 'first', sql: 'SELECT 1' },
        { name: 'second', sql: 'SELECT 2' },
      ],
    },
  };
  const { document, files } = splitCodeFields(source, fields, invalid);
  assert.deepEqual(document, { spec: { models: [{ name: 'first' }, { name: 'second' }] } });
  assert.deepEqual(
    files.map(({ name, text }) => [name, text]),
    [
      ['first', 'SELECT 1'],
      ['second', 'SELECT 2'],
    ],
  );
  assert.deepEqual(joinCodeFields(document, fields, files.toReversed(), invalid), source);
  assert.equal(codeFilePath('/p/S.segment-meta.json', files[1]), '/p/S.segment-meta.second.sql');
  for (const bad of [
    {
      spec: {
        models: [
          { name: 'a', sql: 'x' },
          { name: 'A', sql: 'y' },
        ],
      },
    },
    { spec: { models: [{ name: '../x', sql: 'x' }] } },
    { spec: { models: [{ name: 'a', sql: 1 }] } },
    { spec: { models: 'x' } },
  ])
    assert.throws(() => splitCodeFields(bad, fields, invalid), /invalid/u);
});

test('code fields: join refuses a missing, extra or already present code', () => {
  const fields = [{ path: ['expression'], extension: 'sql' }];
  assert.throws(() => joinCodeFields({ apiName: 'A' }, fields, [], invalid), /invalid/u);
  assert.throws(
    () =>
      joinCodeFields(
        { apiName: 'A' },
        fields,
        [
          { extension: 'sql', text: 'a' },
          { extension: 'sql', name: 'extra', text: 'b' },
        ],
        invalid,
      ),
    /invalid/u,
  );
  assert.throws(
    () => joinCodeFields({ expression: 'x' }, fields, [{ extension: 'sql', text: 'a' }], invalid),
    /invalid/u,
  );
  assert.throws(() => splitCodeFields({ apiName: 'A' }, fields, invalid), /invalid/u);
});

test('unescape: the entities Salesforce writes into the GET expression', () => {
  assert.equal(unescapeSalesforceHtml(escapedSql), plainSql);
  assert.equal(
    unescapeSalesforceHtml('a &lt; b &amp;&amp; c &gt; d &quot;q&quot; &apos;x&#x27; &#65;'),
    'a < b && c > d "q" \'x\' A',
  );
  // One pass: an escaped entity stays an entity.
  assert.equal(unescapeSalesforceHtml('&amp;lt;'), '&lt;');
  for (const unchanged of ['&nbsp;', '&#55296;', '&#1114112;', 'a & b', '&lt'])
    assert.equal(unescapeSalesforceHtml(unchanged), unchanged);
});

test('module: observe keeps the GET body as returned without server fields, SQL unescaped', () => {
  const document = observeNativeCalculatedInsight(getBody());
  assert.deepEqual(Object.keys(document), [...kept, 'expression'].toSorted());
  assert.equal(document.expression, plainSql);
  assert.equal(document.dataSpace, 'default');
  assert.equal(document.definitionType, 'CALCULATED_METRIC');
  assert.equal(document.publishScheduleInterval, 'NOT_SCHEDULED');
  const { json, files } = serializeNativeCalculatedInsight(document);
  assert.ok(!json.includes('expression'));
  assert.deepEqual(Object.keys(JSON.parse(json)), kept);
  assert.ok(json.endsWith('}\n'));
  assert.deepEqual(files, [{ extension: 'sql', text: `${plainSql}\n` }]);
  assert.deepEqual(parseNativeCalculatedInsight(json, files), document);
  // Keys Salesforce adds later are kept as returned.
  assert.equal(observeNativeCalculatedInsight({ ...getBody(), newField: 1 }).newField, 1);
});

test('module: structural validation only', () => {
  const valid = observeNativeCalculatedInsight(getBody());
  for (const [value, code] of [
    [[], 'INVALID_CI_DOCUMENT'],
    [{ ...valid, apiName: 'NoSuffix' }, 'INVALID_CI_NAME'],
    [{ ...valid, dataSpace: '' }, 'INVALID_CI_DOCUMENT'],
    [{ ...valid, expression: '  ' }, 'INVALID_CI_DOCUMENT'],
    [{ ...valid, expression: undefined }, 'INVALID_CI_DOCUMENT'],
  ])
    assert.throws(
      () => validateNativeCalculatedInsight(value),
      (error) => error instanceof CalculatedInsightError && error.code === code,
    );
  // Any status, schedule or SQL is the org's to decide.
  assert.equal(
    validateNativeCalculatedInsight({ ...valid, publishScheduleInterval: 'SYSTEM_MANAGED' })
      .publishScheduleInterval,
    'SYSTEM_MANAGED',
  );
  assert.throws(() => parseNativeCalculatedInsight('{', []), /could not be admitted/u);
});

test('writer: JSON and SQL files; repeat is unchanged with identical bytes', async () => {
  const cwd = await root();
  const document = observeNativeCalculatedInsight(getBody());
  const first = await writeNativeCalculatedInsightDocument(document, cwd, false);
  const directory = path.join(cwd, 'data360', 'calculatedInsights');
  assert.deepEqual(first, {
    path: path.join(directory, 'Synthetic__cio.calculatedInsight-meta.json'),
    companionPath: path.join(directory, 'Synthetic__cio.calculatedInsight-meta.sql'),
    outcome: 'retrieved',
  });
  const listed = await readdir(directory);
  assert.deepEqual(listed.toSorted(), [
    'Synthetic__cio.calculatedInsight-meta.json',
    'Synthetic__cio.calculatedInsight-meta.sql',
  ]);
  assert.equal(await readFile(first.companionPath, 'utf8'), `${plainSql}\n`);
  const before = await Promise.all([readFile(first.path), readFile(first.companionPath)]);
  const second = await writeNativeCalculatedInsightDocument(
    observeNativeCalculatedInsight(getBody()),
    cwd,
    false,
  );
  assert.equal(second.outcome, 'unchanged');
  const after = await Promise.all([readFile(first.path), readFile(first.companionPath)]);
  assert.ok(before.every((bytes, index) => bytes.equals(after[index])));
  const changed = { ...document, expression: `${plainSql} ` };
  await assert.rejects(
    writeNativeCalculatedInsightDocument(changed, cwd, false),
    (error) => error.code === 'OVERWRITE_REQUIRED',
  );
  const replaced = await writeNativeCalculatedInsightDocument(changed, cwd, true);
  assert.equal(replaced.outcome, 'retrieved');

  assert.equal(await readFile(first.companionPath, 'utf8'), `${plainSql} \n`);
});

test('module: the SQL file ends with one LF; trailing line breaks are not part of expression', () => {
  const document = observeNativeCalculatedInsight(getBody());
  const json = serializeNativeCalculatedInsight(document).json;
  for (const text of [plainSql, `${plainSql}\n`, `${plainSql}\r\n`, `${plainSql}\n\r\n\n`])
    assert.equal(
      parseNativeCalculatedInsight(json, [{ extension: 'sql', text }]).expression,
      plainSql,
    );
  // Only trailing line breaks: inner ones and trailing blanks stay.
  assert.equal(
    parseNativeCalculatedInsight(json, [{ extension: 'sql', text: 'SELECT 1\nFROM x \n' }])
      .expression,
    'SELECT 1\nFROM x ',
  );
  for (const expression of [plainSql, `${plainSql}\n\n`, `${plainSql}\r\n`])
    assert.deepEqual(serializeNativeCalculatedInsight({ ...document, expression }).files, [
      { extension: 'sql', text: `${plainSql}\n` },
    ]);
});

test('acquire: GET by name, 404 is CI_NOT_FOUND, another name is CI_IDENTITY_CHANGED', async () => {
  const document = await retrieveNativeCalculatedInsight(
    { get: async (name) => getBody(name) },
    'Synthetic__cio',
    'default',
  );
  assert.equal(document.expression, plainSql);
  for (const [get, code] of [
    [
      async () => {
        throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
      },
      'CI_NOT_FOUND',
    ],
    [
      async () => {
        throw new ConnectError('REQUEST_FAILED', 500);
      },
      'CI_RUNTIME_UNKNOWN',
    ],
    [async () => getBody('Other__cio'), 'CI_IDENTITY_CHANGED'],
    [async () => ({ ...getBody(), dataSpace: 'other' }), 'CI_IDENTITY_CHANGED'],
  ])
    await assert.rejects(
      retrieveNativeCalculatedInsight({ get }, 'Synthetic__cio', 'default'),
      (error) => error.code === code,
    );
});

test('retrieve refuses a Visual Builder draft whose GET has a placeholder instead of SQL', async () => {
  const draft = {
    ...getBody(),
    calculatedInsightStatus: 'DRAFT',
    expression: visualDraftPlaceholder,
  };
  await assert.rejects(
    retrieveNativeCalculatedInsight({ get: async () => draft }, 'Synthetic__cio', 'default'),
    (error) => error.code === 'CI_VISUAL_DRAFT_WITHOUT_SQL',
  );
  // Delete, deploy and publish read the same insight through acquire, which still works.
  const acquired = await acquireCalculatedInsight(
    { dataSpace: 'default', get: async () => draft },
    'Synthetic__cio',
  );
  assert.equal(acquired.state, 'present');
  assert.equal(acquired.document.expression, visualDraftPlaceholder);
});

test('inventory: every page of the API 68 list up to total', async () => {
  const urls = [];
  const pages = [['B__cio', 'A__cio'], ['C__cio']];
  const connection = {
    instanceUrl: 'https://synthetic.my.salesforce.com',
    request: async ({ url }) => {
      urls.push(url);
      const items = pages[urls.length - 1].map((apiName) => ({ apiName }));
      return { collection: { count: items.length, items, total: 3 } };
    },
  };
  assert.deepEqual(await listCalculatedInsightNames(connection, 'default'), [
    'A__cio',
    'B__cio',
    'C__cio',
  ]);
  assert.deepEqual(
    urls.map((url) => new URL(url).search),
    ['?dataspace=default&batchSize=25&offset=0', '?dataspace=default&batchSize=25&offset=2'],
  );
  for (const body of [{}, { collection: { items: [{ apiName: 'Bad' }], total: 1 } }])
    await assert.rejects(
      listCalculatedInsightNames(
        { instanceUrl: connection.instanceUrl, request: async () => body },
        'default',
      ),
      (error) => error.code === 'CI_ACQUISITION_FAILED',
    );
});

/**
 * A retrieve command with a stub org whose GET returns `getBody`, writing into a real folder.
 * @param {string[]} metadata Selectors.
 * @param {string} cwd Output project root.
 * @returns {{command: object, reads: string[]}} Command and the names read.
 */
const command = (metadata, cwd) => {
  const instance = Object.create(Retrieve.prototype);
  const reads = [];
  instance.parse = async () => ({
    flags: {
      metadata,
      'api-version': 'auto',
      'target-org': 'synthetic',
      'output-dir': cwd,
      overwrite: false,
    },
  });
  instance.jsonEnabled = () => true;
  // Class fields are not on the prototype: wire the real acquire and writer.
  instance.acquireCalculatedInsight = retrieveNativeCalculatedInsight;
  instance.writeCalculatedInsight = writeNativeCalculatedInsightDocument;
  const connection = { getApiVersion: () => '68.0' };
  instance.resolveOrg = async () => ({
    getOrgId: () => 'synthetic',
    getConnection: (pin) => {
      assert.equal(pin, '68.0');
      return connection;
    },
  });
  instance.createCalculatedInsightClient = (receiver, version, space) => {
    assert.equal(receiver, connection);
    assert.deepEqual([version, space], ['68.0', 'default']);
    return {
      get: async (name) => {
        reads.push(name);
        return getBody(name);
      },
    };
  };
  instance.listCalculatedInsightNames = async (receiver, space) => {
    assert.equal(receiver, connection);
    assert.equal(space, 'default');
    return ['Listed_Two__cio', 'Listed_One__cio'];
  };
  return { command: instance, reads };
};
const run = async (instance) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return await instance.run();
  } finally {
    process.exitCode = previous;
  }
};

test('retrieve writes the JSON and SQL files; a repeat retrieve is unchanged', async () => {
  const cwd = await root();
  const first = command(['calculated-insight:Synthetic__cio'], cwd);
  const result = await run(first.command);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.result.selection, ['calculated-insight:Synthetic__cio']);
  const [item] = result.result.items;
  assert.equal(item.family, 'calculated-insight');
  assert.equal(item.outcome, 'retrieved');
  assert.deepEqual(item.routes, [
    { operation: 'calculated-insight.get', apiVersion: '68.0', transport: 'native' },
  ]);
  assert.equal(await readFile(item.companionPath, 'utf8'), `${plainSql}\n`);
  const json = JSON.parse(await readFile(item.path, 'utf8'));
  assert.deepEqual(Object.keys(json), kept);
  const bytes = await Promise.all([readFile(item.path), readFile(item.companionPath)]);
  const again = await run(command(['calculated-insight:Synthetic__cio'], cwd).command);
  assert.equal(again.status, 'success');
  assert.equal(again.result.items[0].outcome, 'unchanged');
  const after = await Promise.all([readFile(item.path), readFile(item.companionPath)]);
  assert.ok(bytes.every((content, index) => content.equals(after[index])));
});

test('bare calculated-insight retrieves every insight the API lists', async () => {
  const cwd = await root();
  const { command: instance, reads } = command(
    ['calculated-insight', 'calculated-insight:Listed_One__cio'],
    cwd,
  );
  const result = await run(instance);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(reads, ['Listed_One__cio', 'Listed_Two__cio']);
  assert.deepEqual(result.result.selection, [
    'calculated-insight:Listed_One__cio',
    'calculated-insight:Listed_Two__cio',
  ]);
  const listed = await readdir(path.join(cwd, 'data360', 'calculatedInsights'));
  assert.deepEqual(listed.toSorted(), [
    'Listed_One__cio.calculatedInsight-meta.json',
    'Listed_One__cio.calculatedInsight-meta.sql',
    'Listed_Two__cio.calculatedInsight-meta.json',
    'Listed_Two__cio.calculatedInsight-meta.sql',
  ]);
});

test('a missing insight is CI_NOT_FOUND with its identity and nothing is written', async () => {
  const cwd = await root();
  const { command: instance } = command(['calculated-insight:Missing__cio'], cwd);
  instance.createCalculatedInsightClient = () => ({
    get: async () => {
      throw new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');
    },
  });
  const result = await run(instance);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.diagnostics.errors.map(({ code, identity }) => [code, identity]),
    [['CI_NOT_FOUND', { dataSpace: 'default', apiName: 'Missing__cio' }]],
  );
  assert.deepEqual(await readdir(cwd), ['.owner']);
});

for (const overrides of [
  { 'api-version': '65.0' },
  { 'api-version': '67.0' },
  { dataspace: 'other' },
  { metadata: ['calculated-insight:Invalid'] },
])
  test(`CI retrieve refuses ${JSON.stringify(overrides)} before auth`, async () => {
    const { command: instance } = command(['calculated-insight:Synthetic__cio'], os.tmpdir());
    const { flags } = await instance.parse();
    instance.parse = async () => ({ flags: { ...flags, ...overrides } });
    instance.resolveOrg = async () => assert.fail('auth');
    const result = await run(instance);
    assert.equal(result.status, 'blocked');
  });
