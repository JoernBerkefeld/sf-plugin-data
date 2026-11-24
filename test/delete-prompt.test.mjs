import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Delete from '../lib/commands/data360/delete.js';
import { DloError } from '../lib/artifacts/dlo-document.js';
import { deleteNativeDlo, retrieveNativeDlo } from '../lib/services/native-dlo.js';

const name = 'Example__dll';
const runtime = {
  id: '1dl000000000001AAA',
  name,
  label: 'Example',
  category: 'Other',
  dataSpaceInfo: [{ name: 'default' }],
  fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
};

/**
 * Run one DLO delete with a controlled terminal and answer.
 * @param {object} options Harness options.
 * @param {object} [options.flags] Flag overrides.
 * @param {boolean} [options.interactive] Whether stdin and stdout are terminals.
 * @param {boolean} [options.json] Whether --json is on.
 * @param {boolean|Error} [options.answer] The answer, or an error the question throws.
 * @param {boolean} [options.present] Whether the org holds the DLO.
 * @param {number} [options.readStatus] HTTP status every DLO read fails with, if any.
 * @returns {Promise<{result: object, calls: string[], asked: string[], lines: string[], exitCode: unknown}>} Run evidence.
 */
async function run({
  flags = {},
  interactive = true,
  json = false,
  answer,
  present = true,
  readStatus,
}) {
  const calls = [];
  const asked = [];
  const lines = [];
  let deleted = !present;
  const command = Object.create(Delete.prototype);
  command.parse = async () => ({ flags: { metadata: [`dlo:${name}`], preview: false, ...flags } });
  command.jsonEnabled = () => json;
  command.log = (line) => lines.push(line);
  command.interactiveTerminal = () => interactive;
  command.confirmDeletion = async (message) => {
    asked.push(message);
    if (answer instanceof Error) throw answer;
    if (answer === undefined) assert.fail('the delete must not ask');
    return answer;
  };
  command.resolveTarget = async () => {
    calls.push('auth');
    return 'target';
  };
  command.createDataSpaceSender = () => {
    calls.push('dataspace');
    return {};
  };
  command.retrieveDlo = retrieveNativeDlo;
  command.deleteDlo = deleteNativeDlo;
  command.createDloNativeDeleteClient = () => ({
    get: async () => {
      calls.push('get');
      if (readStatus !== undefined) throw new DloError('DLO_HTTP_ERROR', readStatus);
      if (deleted) throw new DloError('DLO_HTTP_ERROR', 404);
      return structuredClone(runtime);
    },
    delete: async () => {
      calls.push('delete');
      deleted = true;
    },
    dependencies: async () => ({ dependencies: [], totalSize: 0 }),
  });
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    const result = await command.run();
    return { result, calls, asked, lines, exitCode: process.exitCode };
  } finally {
    process.exitCode = before;
  }
}

const codes = (result) => result.diagnostics.errors.map(({ code }) => code);

test('without a terminal a delete is refused before any org call', async () => {
  const { result, calls, asked, lines, exitCode } = await run({ interactive: false });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(codes(result), ['CONFIRMATION_REQUIRED']);
  assert.match(result.diagnostics.errors[0].message, /--no-prompt/u);
  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(asked, []);
  assert.deepEqual(result.result.items, []);
  assert.equal(lines[0], 'Delete: blocked.');
  assert.ok(lines.some((line) => line.startsWith('CONFIRMATION_REQUIRED: ')));
});

test('with --json a delete is refused before any org call, also in a terminal', async () => {
  const { result, calls, asked, exitCode } = await run({ json: true });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(codes(result), ['CONFIRMATION_REQUIRED']);
  assert.ok(result.diagnostics.errors[0].docs.endsWith('/general/CONFIRMATION_REQUIRED.md'));
  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(asked, []);
});

test('--no-prompt deletes without asking, also without a terminal and with --json', async () => {
  for (const json of [false, true]) {
    const { result, calls, asked } = await run({
      flags: { 'no-prompt': true },
      interactive: false,
      json,
    });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.result.items[0].outcome, 'deleted');
    assert.equal(calls.filter((call) => call === 'delete').length, 1);
    assert.deepEqual(asked, []);
  }
});

test('a yes deletes after listing the components once', async () => {
  const { result, calls, asked } = await run({ answer: true });
  assert.deepEqual(asked, [
    [
      'Delete 1 component(s) from data space default?',
      `  dlo:${name}`,
      'Dependent mappings, DLOs and fields may be found during the run.',
    ].join('\n'),
  ]);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.metadata.preview, false);
  assert.equal(result.result.items[0].operation, 'delete');
  assert.equal(result.result.items[0].outcome, 'deleted');
  // The preview reads first; the question comes before the one DELETE.
  assert.equal(calls.filter((call) => call === 'delete').length, 1);
  assert.ok(calls.indexOf('get') < calls.indexOf('delete'));
});

test('no, no answer or a failed question sends nothing and reports DELETE_CANCELLED', async () => {
  for (const answer of [false, new Error('Prompt timed out.')]) {
    const { result, calls, asked, lines, exitCode } = await run({ answer });
    assert.equal(asked.length, 1);
    assert.ok(!calls.includes('delete'));
    assert.equal(result.status, 'success');
    assert.equal(exitCode, undefined);
    assert.equal(result.metadata.preview, false);
    assert.deepEqual(codes(result), []);
    assert.match(result.diagnostics.warnings[0], /^DELETE_CANCELLED: /u);
    assert.equal(result.result.items.length, 1);
    const [item] = result.result.items;
    assert.equal(item.mutation, 'not-attempted');
    assert.equal(item.operation, 'preview');
    assert.deepEqual(
      item.diagnostics.map(({ code }) => code),
      ['DELETE_CANCELLED'],
    );
    assert.ok(item.diagnostics[0].docs.endsWith('/general/DELETE_CANCELLED.md'));
    assert.deepEqual(lines, [
      'Delete: cancelled; nothing was deleted.',
      `Not deleted: dlo:${name}.`,
    ]);
  }
});

test('nothing to delete asks nothing and runs the delete', async () => {
  const { result, calls, asked } = await run({ present: false });
  assert.deepEqual(asked, []);
  assert.ok(!calls.includes('delete'));
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.equal(result.result.items[0].operation, 'delete');
  assert.equal(result.result.items[0].outcome, 'unchanged');
});

test('--preview never asks, also without a terminal or with --json', async () => {
  for (const json of [false, true]) {
    const { result, calls, asked } = await run({
      flags: { preview: true },
      interactive: false,
      json,
    });
    assert.deepEqual(asked, []);
    assert.ok(!calls.includes('delete'));
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.result.items[0].operation, 'preview');
  }
});

test('the default question waits 30 seconds and defaults to no', async () => {
  const command = Object.create(Delete.prototype);
  let inputs;
  command.confirm = async (value) => {
    inputs = value;
    return false;
  };
  assert.equal(await command.confirmDeletion('Delete?'), false);
  assert.deepEqual(inputs, { message: 'Delete?', ms: 30_000, defaultAnswer: false });
});

test('--confirm-delete is gone; -r is --no-prompt', () => {
  assert.equal('confirm-delete' in Delete.flags, false);
  assert.equal(Delete.flags['no-prompt'].char, 'r');
});

test('a preview that is refused asks nothing and returns its refusal', async () => {
  const { result, calls, asked, lines, exitCode } = await run({ readStatus: 403 });
  assert.deepEqual(asked, []);
  assert.ok(!calls.includes('delete'));
  assert.equal(result.status, 'blocked');
  assert.equal(exitCode, 1);
  assert.equal(result.metadata.preview, false);
  // The same refusal --preview reports.
  const preview = await run({ readStatus: 403, flags: { preview: true } });
  assert.equal(preview.result.status, 'blocked');
  assert.deepEqual(codes(result), codes(preview.result));
  assert.equal(codes(result).length, 1);
  assert.equal(result.result.items[0].outcome, 'blocked');
  assert.equal(result.result.items[0].mutation, 'not-attempted');
  assert.equal(lines[0], 'Delete: blocked; nothing was deleted.');
  assert.ok(lines.some((line) => line.startsWith(`${codes(result)[0]}: `)));
});
