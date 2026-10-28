import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import { preflightIdentityResolutionDeploy } from '../lib/services/preflight-identity-resolution-deploy.js';
import { irFixture, selection } from './identity-resolution-fixtures.mjs';

/**
 * Build independent synthetic acquisition and count all reads and mutations.
 * @param {string} method Current Individual rule type.
 * @returns {object} Synthetic test harness.
 */
function harness(method = 'lastupdated') {
  const pair = irFixture(method);
  const projection = projectIdentityResolution(
    pair.facade,
    pair.native,
    'Individual_A1b2',
    'CustomerResolution',
  );
  const acquisition = { identity: projection.candidate.identity, ...projection, blockers: [] };
  const calls = { acquire: 0, dependencies: 0, writes: 0 };
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '67.0',
    request: async () => {
      calls.writes++;
      throw new Error('No transport permitted');
    },
  };
  const options = {
    targetApiName: 'Individual_A1b2',
    acquire: async () => {
      calls.acquire++;
      return structuredClone(acquisition);
    },
    verifyDependencies: async () => {
      calls.dependencies++;
    },
  };
  const run = (document = projection.candidate, version = selection, space = 'default') =>
    preflightIdentityResolutionDeploy(document, connection, version, space, options);
  return { projection, acquisition, calls, connection, options, run };
}

test('IR preflight full equality needs fresh dependency verification but zero mutation calls', async () => {
  for (const method of ['lastupdated', 'mostfrequent']) {
    const h = harness(method);
    for (let index = 0; index < 2; index++) {
      const result = await h.run();
      assert.equal(result.outcome, 'unchanged');
      assert.equal(result.target, 'present');
      assert.deepEqual(result.requiredEffects, []);
      assert.equal(result.absenceProof, 'none');
      assert.equal(JSON.stringify(result).includes('synthetic-owner-id'), false);
    }
    assert.deepEqual(h.calls, { acquire: 2, dependencies: 2, writes: 0 });
  }
});

test('IR preview admits only LastUpdated to MostFrequent and reports publication/provisioning', async () => {
  const h = harness();
  const desired = structuredClone(h.projection.candidate);
  desired.spec.reconciliationRules[0].ruleType = 'MostFrequent';
  const result = await h.run(desired);
  assert.equal(result.outcome, 'update');
  assert.deepEqual(result.requiredEffects, ['publication', 'generated-output-provisioning']);
  assert.deepEqual(result.route, { apiVersion: '67.0', operation: 'd360_ir_update' });
  assert.equal(h.calls.writes, 0);
  assert.equal(h.acquisition.candidate.spec.reconciliationRules[0].ruleType, 'LastUpdated');
  assert.equal(h.acquisition.candidate.spec.reconciliationRules.length, 6);
});

test('IR refuses label/description/match-label edits and reverse reconciliation without qualification', async () => {
  for (const key of ['label', 'description', 'matchLabel', 'reverse']) {
    const h = harness(key === 'reverse' ? 'mostfrequent' : 'lastupdated');
    const desired = structuredClone(h.projection.candidate);
    if (key === 'reverse') desired.spec.reconciliationRules[0].ruleType = 'LastUpdated';
    else if (key === 'matchLabel') desired.spec.matchRules[0].label = 'Changed';
    else desired.spec[key] = 'Changed';
    const result = await h.run(desired);
    assert.equal(result.outcome, 'blocked-changes');
    assert.equal(h.calls.writes, 0);
  }
});

test('IR rejects invalid authored schema and version before any target reads', async () => {
  for (const mutate of [
    (d) => {
      d.schemaVersion = 2;
    },
    (d) => {
      d.spec.doesRunAutomatically = true;
    },
    (d) => {
      d.spec.matchRules[0].criteria.reverse();
    },
    (d) => {
      d.spec.reconciliationRules[5].sources = ['private'];
    },
    (d) => {
      d.spec.reconciliationRules[1].ruleType = 'MostFrequent';
    },
  ]) {
    const h = harness();
    const desired = structuredClone(h.projection.candidate);
    mutate(desired);
    const result = await h.run(desired);
    assert.equal(result.diagnostics[0].code, 'INVALID_SOURCE');
    assert.deepEqual(h.calls, { acquire: 0, dependencies: 0, writes: 0 });
  }
  for (const version of [
    undefined,
    { ...selection, requested: '65.0' },
    { ...selection, restSelector: 'latest' },
    { ...selection, soapNumeric: '65.0' },
  ]) {
    const h = harness();
    const result = await preflightIdentityResolutionDeploy(
      h.projection.candidate,
      h.connection,
      version,
      'default',
      h.options,
    );
    assert.equal(result.diagnostics[0].code, 'INVALID_SCOPE');
    assert.equal(h.calls.acquire + h.calls.dependencies + h.calls.writes, 0);
  }
});

test('IR exact target scope and mandatory dependency verifier fail closed', async () => {
  for (const variant of [
    'missingVerifier',
    'wrongOwner',
    'wrongSpace',
    'wrongConnection',
    'badBinding',
  ]) {
    const h = harness();
    if (variant === 'missingVerifier') delete h.options.verifyDependencies;
    if (variant === 'wrongOwner') h.options.targetApiName = '../private';
    if (variant === 'wrongConnection') h.connection.getApiVersion = () => '65.0';
    if (variant === 'badBinding') h.options.targetApiName = undefined;
    const result = await h.run(
      undefined,
      selection,
      variant === 'wrongSpace' ? 'other' : 'default',
    );
    assert.equal(result.outcome, 'blocked');
    assert.deepEqual(h.calls, { acquire: 0, dependencies: 0, writes: 0 });
  }
});

test('IR missing, unreadable and nested201 target errors never authorize CREATE or leak diagnostics', async () => {
  for (const variant of ['missing', 'error', 'nested', 'noExpectations', 'blockers']) {
    const h = harness();
    h.options.acquire = async () => {
      h.calls.acquire++;
      if (variant === 'error') throw new Error('private 401 network raw');
      if (variant === 'missing')
        return { identity: h.acquisition.identity, blockers: ['private 404'] };
      const result = structuredClone(h.acquisition);
      if (variant === 'nested')
        result.expectations.facade = { result: { error: 'private nested201' } };
      if (variant === 'noExpectations') delete result.expectations;
      if (variant === 'blockers') result.blockers = ['private'];
      return result;
    };
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.target, 'unknown');
    assert.equal(result.absenceProof, 'none');
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(h.calls.acquire, 1);
    assert.equal(h.calls.writes, 0);
  }
});

test('IR complete native/facade, candidate and generated-output correlation cannot be bypassed', async () => {
  for (const mutate of [
    (a) => {
      a.expectations.native.id = 'other';
    },
    (a) => {
      a.expectations.native.label = 'other';
    },
    (a) => {
      a.expectations.facade.extra = true;
    },
    (a) => {
      a.expectations.facade.rulesetStatus = 'PUBLISHING';
      a.expectations.native.rulesetStatus = 'PUBLISHING';
    },
    (a) => {
      a.expectations.facade.rulesetStatus = 'UNKNOWN';
      a.expectations.native.rulesetStatus = 'UNKNOWN';
    },
    (a) => {
      a.candidate.spec.label = 'forged';
    },
    (a) => {
      a.identity.logicalName = 'Other';
    },
    (a) => {
      a.expectations.outputs[0].sourceApiName = 'Forged__dlm';
    },
    (a) => {
      a.expectations.outputs.reverse();
    },
    (a) => {
      a.expectations.facade.reconciliationRules[5].sources = ['private'];
      a.expectations.native.reconciliationRules[5].sources = ['private'];
    },
  ]) {
    const h = harness();
    mutate(h.acquisition);
    const result = await h.run();
    assert.equal(result.outcome, 'blocked');
    assert.equal(h.calls.writes, 0);
  }
});

test('IR verifies dependencies on every preview and blocks fresh failure without retries', async () => {
  const h = harness();
  const initial = await h.run();
  assert.equal(initial.outcome, 'unchanged');
  h.options.verifyDependencies = async () => {
    h.calls.dependencies++;
    throw new Error('private changed dependency');
  };
  const result = await h.run();
  assert.equal(result.outcome, 'blocked');
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(h.calls, { acquire: 1, dependencies: 2, writes: 0 });
});

test('IR detached desired input and exact binding survive caller edits during async verification', async () => {
  const h = harness();
  const desired = structuredClone(h.projection.candidate);
  h.options.verifyDependencies = async (document) => {
    document.spec.label = 'callback edit';
    desired.spec.label = 'caller edit';
    h.options.targetApiName = 'Individual_Z9z9';
    h.options.acquire = async () => {
      throw new Error('replaced');
    };
  };
  const result = await h.run(desired);
  assert.equal(result.outcome, 'unchanged');
  assert.equal(h.calls.acquire, 1);
});
