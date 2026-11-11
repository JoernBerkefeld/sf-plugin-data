import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { explainMismatch, operationDiagnostic } from '../lib/services/operation-diagnostic.js';
import { executeDloDeploy } from '../lib/services/command-dlo.js';
import { executeDmo } from '../lib/services/command-native-dmo.js';
import { preflightNativeMapping } from '../lib/services/native-mapping.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import {
  apiDiagnostic,
  connectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';

const renderApi = (status, body, requestId) =>
  operationDiagnostic(
    retainConnectDiagnostic(
      new Error('unchanged plugin error'),
      apiDiagnostic(status, body, undefined, requestId),
    ),
    'IR preview failed; no write attempted.',
  );

test('structured API explanations retain unfamiliar actionable reasons and compatibility codes', () => {
  for (const [code, message] of [
    ['INVALID_INPUT', 'A maximum of 10 rulesets is supported. Reduce the ruleset count.'],
    ['FUNCTIONALITY_NOT_ENABLED', 'trustedSources is not enabled for this organization.'],
    ['INVALID_FIELD', 'Field FirstName is case-sensitive; use the exact schema field name.'],
    [
      'NEW_CAPACITY_REASON',
      'The matching stage requires fewer partitions. Reduce the partition count.',
    ],
  ]) {
    const error = Object.assign(new Error('fixed'), { code: 'REQUEST_FAILED' });
    retainConnectDiagnostic(error, apiDiagnostic(400, [{ errorCode: code, message }]));
    const output = operationDiagnostic(error, 'No write attempted.');
    assert.match(output, /HTTP 400/u);
    assert.ok(output.includes(`${code}: ${message}`));
    assert.equal(error.code, 'REQUEST_FAILED');
    assert.equal(error.message, 'fixed');
    assert.equal(JSON.stringify(error), '{"code":"REQUEST_FAILED"}');
  }
  assert.match(
    renderApi(500, {
      errorCode: 'NEW_REASON',
      message: 'Reduce the partition count before retrying.',
    }),
    /Reduce the partition count/u,
  );
});

test('unsafe echoes and generic errors keep status/code/request ID with contextual fallback', () => {
  for (const message of [
    'The matching stage requires fewer partitions. password=hunter2',
    'The matching stage requires fewer partitions. Private payload: customer-value',
    'Bearer abcdef',
    'Cookie: synthetic',
    'accessToken=abcdef',
    'Rejected customer@example.com',
    'Rejected https://host/path?key=abcdef',
    'Rejected {"customer":"abcdef"}',
    'SELECT Name FROM Account',
    'Rejected "Jane Smith"',
    '<html>abcdef</html>',
    'bad\u001B[31mtext',
    'bad\ntext',
    'bad\u202Etext',
    'x'.repeat(401),
    'Internal Server Error',
  ]) {
    const output = renderApi(500, { errorCode: 'INVALID_INPUT', message }, 'req-12345678');
    assert.match(output, /HTTP 500.*INVALID_INPUT; Request ID: req-12345678/u);
    assert.match(output, /IR preview failed; no write attempted/u);
    assert.ok(!output.includes(message));
  }
  for (const body of ['', 'not JSON', '<html>secret</html>', {}, undefined]) {
    assert.match(renderApi(500, body), /HTTP 500.*IR preview failed/u);
  }
  assert.doesNotMatch(
    renderApi(401, { errorCode: 'INVALID_SESSION_ID', message: 'secret' }),
    /secret/u,
  );
  assert.doesNotMatch(
    renderApi(400, { message: 'Safe explanation.' }, 'secret?value=abc'),
    /secret/u,
  );
});

test('API normalization bounds known containers without getters, coercion or recursive enumeration', () => {
  const entry = { errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' };
  for (const body of [
    entry,
    [entry],
    { data: entry },
    { errors: [entry] },
    JSON.stringify([entry]),
    { message: JSON.stringify([entry]) },
  ])
    assert.match(renderApi(400, body), /Reduce the ruleset count to 10/u);
  const getter = Object.defineProperty({}, 'message', {
    get() {
      throw new Error('getter invoked');
    },
  });
  const headers = Object.defineProperty({}, 'Retry-After', {
    get() {
      throw new Error('header getter invoked');
    },
  });
  assert.equal(apiDiagnostic(429, getter, headers).retryAfter, undefined);
  const cycle = {};
  cycle.data = cycle;
  const proxy = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        assert.fail('proxy');
      },
      get() {
        assert.fail('proxy');
      },
    },
  );
  for (const body of [
    getter,
    proxy,
    cycle,
    new Error('Reduce the ruleset count to 10.'),
    { unknown: entry },
    { data: { data: { data: { data: entry } } } },
    Array.from({ length: 4 }, () => entry),
    ' '.repeat(16_384) + JSON.stringify(entry),
  ])
    assert.doesNotMatch(renderApi(400, body), /Reduce the ruleset count/u);
  assert.equal(apiDiagnostic('400', entry), undefined);
  assert.equal(apiDiagnostic(200, entry), undefined);
  assert.equal(apiDiagnostic(600, entry), undefined);
  assert.match(
    operationDiagnostic(
      Object.defineProperty({}, 'status', {
        get() {
          throw new Error('status getter invoked');
        },
      }),
      'Stop.',
    ),
    /no Salesforce rejection was confirmed/u,
  );
  const diagnostic = apiDiagnostic(400, entry);
  assert.ok(Object.isFrozen(diagnostic.errors[0]));
  assert.ok(Object.isFrozen(diagnostic.errors));
});

for (const status of [429, 503])
  test(`API detail preserves HTTP${status} guidance and delay`, () => {
    const error = retainConnectDiagnostic(
      new Error('fixed'),
      apiDiagnostic(
        status,
        { errorCode: 'CAPACITY_ERROR', message: 'Reduce the partition count.' },
        { 'Retry-After': '7' },
      ),
    );
    const output = operationDiagnostic(error, 'Stop.');
    assert.match(output, /CAPACITY_ERROR: Reduce the partition count/u);
    assert.match(output, /Server Retry-After: 7/u);
    assert.match(output, /no automatic replay/u);
    assert.ok(output.length < 1500);
  });

for (const status of [429, 503]) {
  test(`Connect HTTP ${status} guidance is safe, explicit and server-delay only`, () => {
    for (const retry of [undefined, '0', '120', 'Bearer secret']) {
      const error = retainConnectDiagnostic(
        new Error('<html>secret</html>'),
        connectDiagnostic(status, { 'Retry-After': retry }),
      );
      const message = operationDiagnostic(error, 'No write attempted.');
      assert.match(
        message,
        status === 429 ? /429 Too Many Requests/u : /503.*POSSIBLE Connect rate limit/u,
      );
      assert.match(message, /Reduce request frequency and try later/u);
      assert.match(message, /limits can vary with load and change/u);
      assert.match(message, /Inspect the target.*no automatic replay/u);
      assert.doesNotMatch(JSON.stringify({ message }), /secret|html|quota|reset/iu);
      assert.equal(message.includes('Server Retry-After:'), retry === '0' || retry === '120');
      assert.match(message, /No write attempted/u);
    }
    assert.doesNotMatch(operationDiagnostic({ statusCode: status }, 'Stop.'), /Connect API/u);
  });
}

const fields = [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }];
const raw = (name) => ({
  name,
  id: '1dl000000000001AAA',
  label: 'Probe',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields,
});
const rawDmo = (name) => ({
  ...raw(name),
  dataSpaceName: 'default',
  creationType: 'Custom',
  fields: fields.map((field) => ({ ...field, type: field.dataType })),
});
const document = (kind, name) => ({
  schemaVersion: 1,
  kind,
  identity: { apiName: name, dataSpace: 'default' },
  spec: { label: 'Probe', category: 'Other', fields: structuredClone(fields) },
});

test('shared diagnostics preserve errors and expose only approved bounded leaf values', () => {
  const original = new DloError('UNCHANGED_CODE');
  const error = explainMismatch(
    original,
    'field preservation',
    'Probe__dll',
    { dataType: 'Text' },
    { dataType: 'Number' },
    'fields.Id__c',
  );
  assert.equal(error, original);
  assert.equal(error.code, 'UNCHANGED_CODE');
  assert.match(
    operationDiagnostic(error, 'No write attempted.'),
    /Plugin verification.*Probe__dll.*fields.Id__c.dataType: expected "Text"; observed "Number"/u,
  );
  for (const key of ['accessToken', 'formula', 'label', 'recordId', 'password']) {
    const secret = `Bearer secret-${'x'.repeat(1000)}`;
    const protectedError = explainMismatch(
      new Error('safe'),
      'check',
      'Probe',
      { [key]: 'before' },
      { [key]: secret },
    );
    const message = operationDiagnostic(protectedError, 'Stop.');
    assert.ok(!message.includes(secret));
    assert.ok(message.length < 500);
    assert.match(message, /redacted/u);
  }
  assert.ok(!operationDiagnostic(new Error('token=secret'), 'Stop.').includes('token=secret'));
  assert.match(
    operationDiagnostic(new DloError('DLO_HTTP_ERROR', 403), 'No write attempted.'),
    /Salesforce API rejected.*HTTP 403/u,
  );
});

for (const [kind, name, execute] of [
  ['dlo', 'Probe__dll', executeDloDeploy],
  ['dmo', 'Probe__dlm', executeDmo],
]) {
  test(`${kind} field drift identifies property and retains pre-dispatch outcome`, async () => {
    const desired = document(kind, name);
    desired.spec.fields[0].dataType = 'Number';
    let writes = 0;
    const result = await execute(desired, {
      get: async () => (kind === 'dlo' ? { dataLakeObjects: [raw(name)] } : rawDmo(name)),
      create: async () => {
        writes++;
      },
      update: async () => {
        writes++;
      },
    });
    assert.equal(writes, 0);
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mutation, 'not-attempted');
    assert.equal(result.diagnostics[0].code, `UNSUPPORTED_${kind.toUpperCase()}_FIELD_CHANGE`);
    assert.match(
      result.diagnostics[0].message,
      /update field preservation.*fields.Id__c.dataType: expected "Text"; observed "Number"/u,
    );
    assert.match(result.diagnostics[0].message, /no write attempted/iu);
  });
}

test('mapping missing field reports the exact pair, field and object', async () => {
  const desired = {
    schemaVersion: 1,
    kind: 'mapping',
    identity: { apiName: 'ProbeMapping', dataSpace: 'default' },
    spec: {
      sourceEntityDeveloperName: 'Probe__dll',
      targetEntityDeveloperName: 'Probe__dlm',
      fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Code__c' }],
    },
  };
  const dependencies = {
    source: { get: async () => ({ dataLakeObjects: [raw('Probe__dll')] }) },
    target: { get: async () => rawDmo('Probe__dlm') },
  };
  await assert.rejects(preflightNativeMapping(desired, {}, dependencies), (error) => {
    assert.equal(error.code, 'MAPPING_FIELD_NOT_FOUND');
    assert.match(
      operationDiagnostic(error, 'No write attempted.'),
      /The mapping pair Id__c -> Code__c names the field Code__c, which does not exist on Probe__dlm\..*No write attempted\./su,
    );
    return true;
  });
  desired.spec.fieldMappings[0] = {
    sourceFieldDeveloperName: 'Gone__c',
    targetFieldDeveloperName: 'Id__c',
  };
  await assert.rejects(preflightNativeMapping(desired, {}, dependencies), (error) => {
    assert.equal(error.code, 'MAPPING_FIELD_NOT_FOUND');
    assert.match(
      operationDiagnostic(error, ''),
      /names the field Gone__c, which does not exist on Probe__dll\./u,
    );
    return true;
  });
});
