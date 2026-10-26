import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { resolveApiVersion } from '../lib/transport/api-version.js';

for (const requested of ['65.0', '68.0', '99.0', '100.0']) {
  test(`numeric ${requested} is preserved without discovery`, async () => {
    const result = await resolveApiVersion(requested, () => assert.fail('Unexpected discovery'));
    assert.deepEqual(result, {
      requested,
      restSelector: `v${requested}`,
      soapNumeric: requested,
    });
    assert.ok(Object.isFrozen(result));
  });
}

test('latest discovers once and selects numerically without replacing the REST alias', async () => {
  let calls = 0;
  const result = await resolveApiVersion('latest', async () => {
    calls += 1;
    return [{ version: '99.0' }, { version: '68.0' }, { version: '100.0' }];
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { requested: 'latest', restSelector: 'latest', soapNumeric: '100.0' });
  assert.ok(Object.isFrozen(result));
});

test('invalid selectors fail before discovery', async () => {
  for (const requested of [
    '',
    'LATEST',
    ' latest',
    'latest ',
    'v68.0',
    '68',
    '68.1',
    '1.0',
    '1000.0',
    '68.0/ssot',
  ]) {
    await assert.rejects(
      resolveApiVersion(requested, () => assert.fail('Unexpected discovery')),
      { message: 'Use latest or an explicit numeric API version such as 65.0.' },
    );
  }
});

test('empty or malformed discovery fails closed without exposing response content', async () => {
  const secret = 'synthetic-sensitive-payload';
  const jsonNull = JSON.parse('null');
  for (const response of [
    jsonNull,
    undefined,
    {},
    secret,
    [],
    [jsonNull],
    [[]],
    [{}],
    [{ version: 68 }],
    [{ version: 'latest' }],
    [{ version: '68.1' }],
    [{ version: '68.0' }, { version: secret }],
  ]) {
    let calls = 0;
    await assert.rejects(
      resolveApiVersion('latest', async () => {
        calls += 1;
        return response;
      }),
      (error) => {
        assert.equal(
          error.message,
          'API version discovery returned invalid data. Use an explicit numeric version.',
        );
        assert.ok(!inspect(error).includes(secret));
        assert.equal(error.cause, undefined);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test('discovery rejection has fixed diagnostics without fallback or retry', async () => {
  const secret = 'synthetic-sensitive-auth-error';
  let calls = 0;
  await assert.rejects(
    resolveApiVersion('latest', async () => {
      calls += 1;
      throw new Error(secret);
    }),
    (error) => {
      assert.equal(
        error.message,
        'API version discovery failed. Check org access or use an explicit numeric version.',
      );
      assert.ok(!inspect(error).includes(secret));
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('independent resolutions do not cache discovery results', async () => {
  let calls = 0;
  const discover = async () => [{ version: `${67 + ++calls}.0` }];
  const first = await resolveApiVersion('latest', discover);
  const second = await resolveApiVersion('latest', discover);
  assert.equal(first.soapNumeric, '68.0');
  assert.equal(second.soapNumeric, '69.0');
  assert.equal(calls, 2);
});
