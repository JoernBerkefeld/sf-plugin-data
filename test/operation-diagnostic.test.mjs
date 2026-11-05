import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { explainMismatch, operationDiagnostic } from '../lib/services/operation-diagnostic.js';
import { executeDloDeploy } from '../lib/services/command-dlo.js';
import { executeDmo } from '../lib/services/command-native-dmo.js';
import { preflightNativeMapping } from '../lib/services/native-mapping.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

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

test('mapping dependency mismatch reports the exact paired field and types', async () => {
  const desired = {
    schemaVersion: 1,
    kind: 'mapping',
    identity: { apiName: 'ProbeMapping', dataSpace: 'default' },
    spec: {
      sourceEntityDeveloperName: 'Probe__dll',
      targetEntityDeveloperName: 'Probe__dlm',
      fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
    },
  };
  await assert.rejects(
    preflightNativeMapping(
      desired,
      {},
      {
        source: { get: async () => ({ dataLakeObjects: [raw('Probe__dll')] }) },
        target: {
          get: async () => ({
            ...rawDmo('Probe__dlm'),
            fields: [{ ...fields[0], dataType: 'Number', type: 'Number' }],
          }),
        },
      },
    ),
    (error) => {
      assert.equal(error.code, 'MAPPING_FIELD_TYPE_MISMATCH');
      assert.match(
        operationDiagnostic(error, 'No write attempted.'),
        /mapping source\/target type compatibility.*ProbeMapping.*Id__c.target.Id__c.dataType: expected "Text"; observed "Number"/u,
      );
      return true;
    },
  );
});
