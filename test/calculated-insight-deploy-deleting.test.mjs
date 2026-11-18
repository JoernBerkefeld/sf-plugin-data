import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { observeNativeCalculatedInsight } from '../lib/artifacts/native-calculated-insight-document.js';
import { executeCalculatedInsightDeploy } from '../lib/services/execute-calculated-insight-deploy.js';

const origin = 'https://synthetic.my.salesforce.com';
const apiName = 'CliLcCi__cio';
const version = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
const table = 'ssot__Individual__dlm';
const present = {
  apiName,
  calculatedInsightStatus: 'DRAFT',
  creationType: 'Custom',
  dataSpace: 'default',
  definitionType: 'CALCULATED_METRIC',
  dimensions: [{ apiName: 'id__c' }],
  displayName: 'Cli lc ci',
  expression: `SELECT COUNT(${table}.ssot__Id__c) AS total__c, ${table}.ssot__Id__c AS id__c FROM ${table} GROUP BY id__c`,
  measures: [{ apiName: 'total__c' }],
  publishScheduleInterval: 'SYSTEM_MANAGED',
  queryDialect: 'ANSI_SQL',
};
const document = observeNativeCalculatedInsight(present);
// Live API 68 (2026-11-18): a GET answered this single REST error while the insight was deleting.
const deletedAnswer = {
  status: 404,
  body: [{ errorCode: 'ENTITY_IS_DELETED', message: 'entity is deleted' }],
};

/**
 * A Core connection whose wire answers each request from a script, in order.
 * @param {object[]} answers Status and JSON body per request.
 * @returns {object} Connection and the methods sent.
 */
function wire(answers) {
  const sent = [];
  const connection = Object.assign(Object.create(Connection.prototype), {
    instanceUrl: origin,
    version: '68.0',
    accessToken: 'synthetic-token',
    logger: { getRawLogger: () => ({ debug() {} }) },
    _propagators: [],
    _refreshDelegate: {
      isRefreshing: () => assert.fail('no refresh'),
      refresh: () => assert.fail('no refresh'),
    },
    _transport: {
      httpRequest(request) {
        sent.push(request.method);
        const answer = answers.shift() ?? assert.fail(`unexpected ${request.method}`);
        const pending = Promise.resolve({
          statusCode: answer.status,
          headers: answer.body === undefined ? {} : { 'content-type': 'application/json' },
          body: answer.body === undefined ? '' : JSON.stringify(answer.body),
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    },
  });
  return { connection, sent };
}

const deploy = (connection) =>
  executeCalculatedInsightDeploy(document, connection, version, 'default', {
    verifyInput: async () => {},
    delay: async () => {},
  });

test('a read answering 404 ENTITY_IS_DELETED makes deploy send one create; its refusal is reported as is', async () => {
  const refusal = {
    errorCode: 'SYNTHETIC_CREATE_REFUSED',
    message: 'Synthetic refusal while the insight is deleting.',
  };
  const { connection, sent } = wire([deletedAnswer, { status: 400, body: [refusal] }]);
  const result = await deploy(connection);
  assert.deepEqual([result.outcome, result.mutation], ['failed', 'rejected']);
  assert.equal(result.route.method, 'POST');
  // One GET, exactly one POST, never resent and not read again.
  assert.deepEqual(sent, ['GET', 'POST']);
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /SYNTHETIC_CREATE_REFUSED/u);
  assert.match(result.diagnostics[0].message, /Synthetic refusal while the insight is deleting\./u);
});

test('a read answering 404 ENTITY_IS_DELETED makes deploy send one create; its success is settled', async () => {
  const { connection, sent } = wire([
    deletedAnswer,
    { status: 201, body: present },
    { status: 200, body: present },
  ]);
  const result = await deploy(connection);
  assert.deepEqual([result.outcome, result.mutation], ['created', 'confirmed-created']);
  assert.deepEqual(sent, ['GET', 'POST', 'GET']);
});
