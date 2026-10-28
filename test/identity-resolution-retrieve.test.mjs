import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retrieveIdentityResolution } from '../lib/services/retrieve-identity-resolution.js';
import { irFixture, selection } from './identity-resolution-fixtures.mjs';

/**
 * Mock core request without network traffic.
 * @param {object} input Synthetic owner responses.
 * @returns {object} Connection and recorded requests.
 */
function connection(input = irFixture()) {
  const requests = [];
  const conn = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '67.0',
    _transport: {
      httpRequest() {
        throw new Error('Offline mock only');
      },
    },
    async request(request, options) {
      requests.push({ request, options, refresh: this._refreshDelegate });
      return request.method === 'POST' ? { result: input.facade } : input.native;
    },
    _refreshDelegate: { synthetic: true },
  };
  return { conn, requests };
}

test('IR acquisition uses frozen facade67 plus independent native65 with zero mutations', async () => {
  const { conn, requests } = connection();
  const result = await retrieveIdentityResolution(conn, 'Individual_A1b2', selection, 'default');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.candidate.identity.apiName, 'Individual_A1b2');
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].request.url,
    'https://synthetic.example.com/services/data/v67.0/ssot/mcp/execute',
  );
  assert.deepEqual(JSON.parse(requests[0].request.body), {
    toolName: 'd360_ir_get',
    paramsJson: JSON.stringify({ identityResolution: 'Individual_A1b2' }),
  });
  assert.equal(requests[1].request.method, 'GET');
  assert.equal(
    requests[1].request.url,
    'https://synthetic.example.com/services/data/v65.0/ssot/identity-resolutions/Individual_A1b2',
  );
  for (const call of requests) {
    assert.equal(call.refresh, undefined);
    assert.equal(call.options.retry.maxRetries, 0);
    assert.throws(() => call.options.followRedirect());
  }
  assert.deepEqual(conn._refreshDelegate, { synthetic: true });
});

test('IR acquisition blocks transport/nested201 errors without payload, retry or fallback', async () => {
  for (const reply of [
    { error: 'private raw detail', hint: 'private' },
    { result: { error: 'private', rulesetStatus: 'PUBLISHED' } },
    undefined,
  ]) {
    const { conn, requests } = connection();
    conn.request = async (r) => {
      requests.push(r);
      return reply;
    };
    const result = await retrieveIdentityResolution(conn, 'Individual_A1b2', selection, 'default');
    assert.deepEqual(result.blockers, ['IDENTITY_RESOLUTION_ACQUISITION_FAILED']);
    assert.equal(result.candidate, undefined);
    assert.equal(result.expectations, undefined);
    assert.equal(requests.length, 1);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('IR acquisition requires complete correlated published native owner', async () => {
  for (const variant of ['missing', 'mismatch', 'publishing']) {
    const input = irFixture();
    if (variant === 'mismatch') input.native.id = 'different';
    if (variant === 'publishing') {
      input.facade.rulesetStatus = 'PUBLISHING';
      input.native.rulesetStatus = 'PUBLISHING';
    }
    const { conn, requests } = connection(input);
    if (variant === 'missing') {
      const original = conn.request;
      conn.request = async function (r, o) {
        if (r.method === 'GET') throw new Error('private 404');
        return original.call(this, r, o);
      };
    }
    const result = await retrieveIdentityResolution(conn, 'Individual_A1b2', selection, 'default');
    assert.equal(result.candidate, undefined);
    assert.equal(result.expectations, undefined);
    assert.equal(result.blockers.length, 1);
    if (variant === 'publishing')
      assert.deepEqual(result.blockers, ['IDENTITY_RESOLUTION_NOT_SETTLED']);
    assert.ok(requests.length <= 2);
  }
});

test('IR rejects invalid scope before any read and never upgrades versions', async () => {
  for (const [version, space, source, numeric] of [
    ['65.0', 'default', 'Individual_A1b2', '67.0'],
    ['latest', 'default', 'Individual_A1b2', '67.0'],
    ['67.0', 'other', 'Individual_A1b2', '67.0'],
    ['67.0', 'default', '../escape', '67.0'],
    ['67.0', 'default', '', '67.0'],
    ['67.0', 'default', undefined, '67.0'],
    ['67.0', 'default', 'Individual_A1b2', '65.0'],
  ]) {
    const { conn, requests } = connection();
    conn.getApiVersion = () => numeric;
    await assert.rejects(
      retrieveIdentityResolution(
        conn,
        source,
        { requested: version, restSelector: `v${version}`, soapNumeric: version },
        space,
      ),
      { code: 'INVALID_SCOPE' },
    );
    assert.equal(requests.length, 0);
  }
});
