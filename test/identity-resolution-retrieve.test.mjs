import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retrieveIdentityResolution } from '../lib/services/retrieve-identity-resolution.js';
import {
  expandedNativeIrFixture,
  nativeIrFixture,
  nativeSelection,
} from './identity-resolution-fixtures.mjs';

import { getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';

test('IR acquisition privately carries safe HTTP rejection without changing blockers', async () => {
  const { conn, requests } = connection();
  conn.request = async () => {
    requests.push({});
    throw {
      statusCode: 400,
      data: [{ errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' }],
    };
  };
  const result = await retrieveIdentityResolution(
    conn,
    'Individual_A1b2',
    nativeSelection,
    'default',
  );
  assert.deepEqual(result.blockers, ['IDENTITY_RESOLUTION_ACQUISITION_FAILED']);
  assert.equal(result.candidate, undefined);
  assert.equal(requests.length, 1);
  assert.equal(getConnectDiagnostic(result).errors[0].message, 'Reduce the ruleset count to 10.');
  assert.doesNotMatch(JSON.stringify(result), /INVALID_INPUT|ruleset count/u);
});

const connection = (reply = nativeIrFixture()) => {
  const requests = [];
  const conn = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    async request(request, options) {
      requests.push({ request, options, refresh: this._refreshDelegate });
      return reply;
    },
    _refreshDelegate: { synthetic: true },
  };
  return { conn, requests };
};

test('IR acquisition uses one genuine native68 GET without facade duplicates or writes', async () => {
  const { conn, requests } = connection();
  const result = await retrieveIdentityResolution(
    conn,
    'Individual_A1b2',
    nativeSelection,
    'default',
  );
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.candidate.spec.trustedSources, []);
  assert.equal(result.expectations.facade, undefined);
  assert.equal(result.expectations.outputs.length, 12);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.method, 'GET');
  assert.equal(
    requests[0].request.url,
    'https://synthetic.example.com/services/data/v68.0/ssot/identity-resolutions/Individual_A1b2',
  );
  assert.equal(requests[0].refresh, undefined);
  assert.equal(requests[0].options.retry.maxRetries, 0);
  assert.throws(() => requests[0].options.followRedirect());
  assert.deepEqual(conn._refreshDelegate, { synthetic: true });
});

test('expanded native retrieval preserves all settings and twelve returned owner bindings in one read', async () => {
  const raw = expandedNativeIrFixture();
  const { conn, requests } = connection(raw);
  const result = await retrieveIdentityResolution(
    conn,
    raw.objectApiName,
    nativeSelection,
    'default',
  );
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.expectations.native, raw);
  assert.equal(result.candidate.spec.matchRules.length, 2);
  assert.equal(result.candidate.spec.reconciliationRules[0].fields.length, 1);
  assert.deepEqual(result.candidate.spec.reconciliationRules[5].fields, []);
  assert.deepEqual(
    result.expectations.outputs.map((o) => o.sourceApiName),
    raw.reconciliationRules.flatMap((r) => [r.unifiedDmoName, r.linkDmoName]),
  );
  assert.equal(requests.length, 1);
});

test('IR native68 acquisition retrieves every ruleset shape and state the API returns', async () => {
  for (const mutate of [
    (r) => ({ ...r, rulesetId: 'Z9y8' }),
    (r) => ({ ...r, trustedSources: [{ name: 'Synthetic__dll' }] }),
    (r) => ({ ...r, filters: [{ fieldName: 'ssot__FirstName__c', value: 'Meaningful' }] }),
    (r) => ({ ...r, rulesetStatus: 'PUBLISHING' }),
    (r) => ({ ...r, rulesetStatus: 'NEW', matchRules: [] }),
    (r) => ({ ...r, doesRunAutomatically: true, lastJobStatus: 'SUCCESS', sourceProfiles: 522 }),
    (r) => ({ ...r, reconciliationRules: r.reconciliationRules.slice(0, 1) }),
  ]) {
    const reply = mutate(nativeIrFixture());
    const { conn, requests } = connection(reply);
    const result = await retrieveIdentityResolution(
      conn,
      'Individual_A1b2',
      nativeSelection,
      'default',
    );
    assert.deepEqual(result.blockers, []);
    assert.equal(result.candidate.identity.apiName, 'Individual_A1b2');
    assert.equal(requests.length, 1);
  }
});

test('IR native68 acquisition refuses errors, unknown forms and owner correlation drift without fallback', async () => {
  for (const mutate of [
    () => {},
    () => ({ error: 'private raw detail' }),
    (r) => ({ ...r, id: '' }),
    (r) => ({ ...r, objectApiName: 'Individual_Other' }),
    (r) => ({ ...r, extra: true }),
  ]) {
    const reply = mutate(nativeIrFixture());
    const { conn, requests } = connection(reply);
    // Explicit undefined must not trigger the fixture default.
    if (reply === undefined)
      conn.request = async () => {
        requests.push({});
        return;
      };
    const result = await retrieveIdentityResolution(
      conn,
      'Individual_A1b2',
      nativeSelection,
      'default',
    );
    assert.equal(result.candidate, undefined);
    assert.equal(result.expectations, undefined);
    assert.equal(result.blockers.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('IR native68 requires exact route, connection, name and explicit space before reads', async () => {
  for (const [version, space, name, numeric] of [
    ['65.0', 'default', 'Individual_A1b2', '68.0'],
    ['67.0', 'default', 'Individual_A1b2', '67.0'],
    ['latest', 'default', 'Individual_A1b2', '68.0'],
    ['68.0', 'other', 'Individual_A1b2', '68.0'],
    ['68.0', 'default', '../escape', '68.0'],
    ['68.0', 'default', '', '68.0'],
    ['68.0', 'default', undefined, '68.0'],
    ['68.0', 'default', 'Individual_A1b2', '67.0'],
  ]) {
    const { conn, requests } = connection();
    conn.getApiVersion = () => numeric;
    await assert.rejects(
      retrieveIdentityResolution(
        conn,
        name,
        { requested: version, restSelector: `v${version}`, soapNumeric: version },
        space,
      ),
      { code: 'INVALID_SCOPE' },
    );
    assert.equal(requests.length, 0);
  }
});
