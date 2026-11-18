import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';
import { calculatedInsightReadContext } from '../lib/services/native-calculated-insight.js';

const origin = 'https://synthetic.my.salesforce.com';
const apiName = 'CliLcCi__cio';
const version = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
const present = {
  status: 200,
  body: { apiName, dataSpace: 'default', calculatedInsightStatus: 'DRAFT' },
};
// Live API 68 (2026-11-18): a 404 with this single REST error answered during a draft delete.
const deletedAnswer = {
  status: 404,
  body: [{ errorCode: 'ENTITY_IS_DELETED', message: 'entity is deleted' }],
};
const notFoundAnswer = {
  status: 404,
  body: [{ errorCode: 'ITEM_NOT_FOUND', message: 'The requested resource does not exist.' }],
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

const run = (connection, nativeClient) =>
  deleteCalculatedInsight({ apiName, dataSpace: 'default' }, connection, version, 'default', {
    context: calculatedInsightReadContext(connection, 'default'),
    ...(nativeClient ? { nativeClient } : {}),
    confirmDelete: true,
    verifyInput: async () => {},
    delay: async () => {},
  });

test('a settle read answering 404 ENTITY_IS_DELETED confirms the delete', async () => {
  // The live failed/unknown: this settle GET threw CI_RUNTIME_UNKNOWN (only ITEM_NOT_FOUND was
  // absence). A 404 on the DELETE itself would have been failed/rejected instead.
  const { connection, sent } = wire([present, deletedAnswer]);
  const deletes = [];
  const result = await run(connection, { delete: async (name) => deletes.push(name) });
  assert.deepEqual([result.outcome, result.mutation], ['deleted', 'confirmed-deleted']);
  assert.deepEqual(deletes, [apiName]);
  assert.deepEqual(sent, ['GET', 'GET']);
});

test('a read answering 404 ENTITY_IS_DELETED before the delete is absent', async () => {
  const { connection, sent } = wire([deletedAnswer]);
  const result = await run(connection, { delete: async () => assert.fail('no DELETE') });
  assert.deepEqual([result.outcome, result.mutation], ['unchanged', 'not-attempted']);
  assert.deepEqual(sent, ['GET']);
});

for (const [name, answer] of [
  ['ENTITY_IS_DELETED', deletedAnswer],
  ['ITEM_NOT_FOUND', notFoundAnswer],
])
  for (const [readName, read] of [
    ['ITEM_NOT_FOUND', notFoundAnswer],
    ['ENTITY_IS_DELETED', deletedAnswer],
  ])
    test(`a DELETE answering 404 ${name} goes on to the read; a ${readName} read confirms it`, async () => {
      const { connection, sent } = wire([present, answer, read]);
      const result = await run(connection);
      assert.deepEqual([result.outcome, result.mutation], ['deleted', 'confirmed-deleted']);
      // One DELETE, never resent.
      assert.deepEqual(sent, ['GET', 'DELETE', 'GET']);
    });

test('a DELETE 404 whose insight still reads present is not confirmed', async () => {
  const { connection } = wire([
    present,
    deletedAnswer,
    ...Array.from({ length: 12 }, () => present),
  ]);
  const result = await run(connection);
  assert.deepEqual([result.outcome, result.mutation], ['failed', 'unknown']);
  assert.equal(result.diagnostics[0].code, 'CI_DELETION_UNCONFIRMED');
});

test('another 4xx on the DELETE stays rejected', async () => {
  const { connection, sent } = wire([
    present,
    { status: 400, body: [{ errorCode: 'DELETE_FAILED', message: 'Delete failed.' }] },
  ]);
  const result = await run(connection);
  assert.deepEqual([result.outcome, result.mutation], ['failed', 'rejected']);
  assert.deepEqual(sent, ['GET', 'DELETE']);
});
