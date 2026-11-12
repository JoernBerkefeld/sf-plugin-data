import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNativeIdentityResolution } from '../lib/artifacts/identity-resolution-document.js';
import {
  bindNativeIdentityResolutionPrecreate,
  buildNativeIdentityResolutionCreate,
  buildNativeIdentityResolutionUpdate,
  nativeIdentityResolutionConfigurationDelta,
  nativeIdentityResolutionDocument,
  preflightNativeIdentityResolutionDeploy,
} from '../lib/services/preflight-identity-resolution-deploy.js';
import { nativeIrFixture, nativeSelection } from './identity-resolution-fixtures.mjs';

/**
 * Build a logical source reference.
 * @param {string} apiName Target DLO API name.
 * @returns {object} Logical reference.
 */
const source = (apiName) => ({ kind: 'dlo', dataSpace: 'default', apiName });

/**
 * Build a native-only independent target harness with no mutation route.
 * @returns {object} Detached desired definition, connection and read counters.
 */
function harness() {
  const raw = nativeIrFixture();
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const calls = { inputs: 0, gets: 0 };
  const connection = {
    instanceUrl: 'https://synthetic.example.com',
    getApiVersion: () => '68.0',
    request: async (request) => {
      calls.gets++;
      assert.equal(request.method, 'GET');
      assert.equal(
        request.url,
        'https://synthetic.example.com/services/data/v68.0/ssot/identity-resolutions/Individual_A1b2',
      );
      return structuredClone(raw);
    },
  };
  const options = {
    verifyDependencies: async () => {
      calls.inputs++;
    },
  };
  const run = () =>
    preflightNativeIdentityResolutionDeploy(
      desired,
      connection,
      nativeSelection,
      'default',
      options,
    );
  return { raw, desired, calls, connection, options, run };
}

test('native68 API rejection survives target wrapping without qualifying absence', async () => {
  const h = harness();
  h.connection.request = async () => {
    throw {
      statusCode: 400,
      data: [
        {
          errorCode: 'FUNCTIONALITY_NOT_ENABLED',
          message: 'trustedSources is not enabled for this organization.',
        },
      ],
    };
  };
  const result = await h.run();
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.target, 'unknown');
  assert.equal(result.absenceProof, 'none');
  assert.equal(result.diagnostics[0].code, 'IDENTITY_RESOLUTION_TARGET_UNQUALIFIED');
  assert.match(
    result.diagnostics[0].message,
    /HTTP 400.*FUNCTIONALITY_NOT_ENABLED: trustedSources/u,
  );
  assert.match(result.diagnostics[0].message, /admission is incomplete/u);
});

test('native68 FirstName case-sensitive input is sent as authored; the API decides', async () => {
  const h = harness();
  h.desired.spec.matchRules[0].criteria[0].caseSensitiveMatch = true;
  for (const build of [buildNativeIdentityResolutionCreate, buildNativeIdentityResolutionUpdate])
    assert.equal(build(h.desired).matchRules[0].criteria[0].caseSensitiveMatch, true);
  const result = await h.run();
  assert.equal(result.outcome, 'update');
  assert.deepEqual(h.calls, { inputs: 1, gets: 1 });
});

test('native68 preflight independently reads exact name and verifies only input dependencies', async () => {
  const h = harness();
  const unchanged = await h.run();
  assert.equal(unchanged.outcome, 'unchanged');
  h.desired.spec.description = 'Description changed';
  const preview = await h.run();
  assert.equal(preview.outcome, 'update');
  assert.deepEqual(preview.requiredEffects, ['processing']);
  assert.deepEqual(preview.route, { apiVersion: '68.0', operation: 'identity-resolutions.patch' });
  assert.deepEqual(h.calls, { inputs: 2, gets: 2 });
  assert.equal(JSON.stringify(preview).includes('synthetic-owner-id'), false);
});

test('native68 preflight compares nonempty target filters as part of the document', async () => {
  const h = harness();
  h.raw.filters = [{ fieldName: 'ssot__FirstName__c', value: 'Meaningful' }];
  // Emptying the target's filters is an update; the PATCH sends the empty list.
  const preview = await h.run();
  assert.equal(preview.outcome, 'update');
  assert.equal(preview.target, 'present');
  h.desired.spec.filters = structuredClone(h.raw.filters);
  const unchanged = await h.run();
  assert.equal(unchanged.outcome, 'unchanged');
  h.desired.spec.filters.push({ fieldName: 'ssot__LastName__c', value: 'Other' });
  const update = await h.run();
  assert.equal(update.outcome, 'update');
  assert.deepEqual(h.calls, { inputs: 3, gets: 3 });
});

test('native68 preflight blocks changes PATCH cannot carry and writes over in-flight processing', async () => {
  for (const modify of [
    (d) => {
      d.spec.configurationType = 'Account';
    },
    (d) => {
      d.spec.secondaryDmo.apiName = 'ssot__Account__dlm';
    },
  ]) {
    const h = harness();
    modify(h.desired);
    const preview = await h.run();
    assert.equal(preview.outcome, 'blocked-changes');
    assert.equal(preview.diagnostics[0].code, 'IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED');
  }
  for (const status of ['PUBLISHING', 'DELETING']) {
    const h = harness();
    h.raw.rulesetStatus = status;
    const preview = await h.run();
    assert.equal(preview.outcome, 'blocked');
    assert.equal(preview.diagnostics[0].code, 'IDENTITY_RESOLUTION_NOT_SETTLED');
  }
  // An unpublished ruleset is an ordinary target.
  const h = harness();
  h.raw.rulesetStatus = 'NEW';
  const draft = await h.run();
  assert.equal(draft.outcome, 'unchanged');
  h.desired.spec.doesRunAutomatically = true;
  const automatic = await h.run();
  assert.equal(automatic.outcome, 'update');
});

test('native68 source migration and unsupported names stop before reads', async () => {
  for (const variant of ['legacy', 'name']) {
    const h = harness();
    if (variant === 'legacy') delete h.desired.spec.trustedSources;
    if (variant === 'name') h.desired.identity.apiName = 'Individual_TooLong';
    const preview = await h.run();
    assert.equal(preview.outcome, 'blocked');
    assert.equal(
      preview.diagnostics[0].code,
      variant === 'legacy'
        ? 'IDENTITY_RESOLUTION_TRUSTED_SOURCES_MIGRATION_REQUIRED'
        : 'IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED',
    );
    assert.deepEqual(h.calls, { inputs: 0, gets: 0 });
  }
});

test('native68 admits supported configuration deltas while identical settings are unchanged', async () => {
  const h = harness();
  assert.equal(nativeIdentityResolutionConfigurationDelta(h.desired, h.desired), false);
  const desired = structuredClone(h.desired);
  desired.spec.description = '';
  assert.equal(nativeIdentityResolutionConfigurationDelta(h.desired, desired), true);
  for (const modify of [
    (d) => {
      d.spec.label = 'Changed';
    },
    (d) => {
      d.spec.matchRules[0].label = 'Changed';
    },
  ]) {
    const changed = structuredClone(desired);
    modify(changed);
    assert.equal(nativeIdentityResolutionConfigurationDelta(h.desired, changed), true);
  }
  h.desired.spec.label = 'Changed';
  const blocked = await h.run();
  assert.equal(blocked.outcome, 'update');
});

test('native68 CREATE builder is complete and uses proven PascalCase without source/generated identities', () => {
  const h = harness();
  const body = buildNativeIdentityResolutionCreate(h.desired);
  assert.equal(body.rulesetId, 'A1b2');
  assert.equal(body.configurationType, 'Individual');
  assert.equal(body.doesRunAutomatically, false);
  assert.equal(Object.hasOwn(body, 'trustedSources'), false);
  assert.deepEqual(
    body.matchRules[0].criteria.map((c) => c.matchMethodType),
    ['Fuzzy', 'Exact', 'ExactNormalized'],
  );
  assert.equal(body.reconciliationRules.length, 6);
  assert.deepEqual(body.reconciliationRules[0], {
    entityName: 'ssot__Individual__dlm',
    ruleType: 'LastUpdated',
    shouldIgnoreEmptyValue: true,
    sources: [],
    fields: [],
  });
  for (const forbidden of [
    'synthetic-owner-id',
    'SyntheticUnified',
    'SyntheticLink',
    'objectApiName',
    'outputs',
  ])
    assert.equal(JSON.stringify(body).includes(forbidden), false);
  body.matchRules[0].criteria[0].fieldName = 'Changed__c';
  assert.equal(h.desired.spec.matchRules[0].criteria[0].field.apiName, 'ssot__FirstName__c');
  assert.deepEqual(h.desired.spec.trustedSources, []);
  assert.deepEqual(nativeIdentityResolutionDocument(h.desired), h.desired);
});

test('native68 CREATE and PATCH builders send nonempty trusted sources and filters as authored', () => {
  const h = harness();
  h.desired.spec.trustedSources = [{ name: 'First__dll' }];
  h.desired.spec.filters = [{ fieldName: 'ssot__FirstName__c', value: 'Meaningful' }];
  for (const build of [buildNativeIdentityResolutionCreate, buildNativeIdentityResolutionUpdate]) {
    const body = build(h.desired);
    assert.deepEqual(body.trustedSources, [{ name: 'First__dll' }]);
    assert.deepEqual(body.filters, h.desired.spec.filters);
  }
});

test('native68 CREATE derives configuration type and ruleset ID from the document', () => {
  for (const [apiName, configurationType, rulesetId] of [
    ['Individual', 'Individual', undefined],
    ['Individual_MKT', 'Individual', 'MKT'],
    ['Individual_Ab12345', 'Individual', 'Ab12345'],
    ['Account_ab12', 'account', 'ab12'],
    // Everything after the type prefix, not after the last underscore.
    ['Individual_a_b', 'Individual', 'a_b'],
  ]) {
    const raw = nativeIrFixture();
    raw.objectApiName = apiName;
    raw.configurationType = configurationType.toLowerCase();
    raw.doesRunAutomatically = true;
    if (rulesetId === undefined) delete raw.rulesetId;
    else raw.rulesetId = rulesetId;
    raw.matchRules[0].criteria[0].partyIdentificationInfo = { partyName: 'Key', partyType: 'Id' };
    const desired = projectNativeIdentityResolution(raw, apiName).candidate;
    const body = buildNativeIdentityResolutionCreate(desired);
    assert.equal(body.configurationType, configurationType);
    assert.equal(body.rulesetId, rulesetId);
    assert.equal(Object.hasOwn(body, 'rulesetId'), rulesetId !== undefined);
    assert.equal(body.doesRunAutomatically, true);
    assert.deepEqual(body.matchRules[0].criteria[0].partyIdentificationInfo, {
      partyName: 'Key',
      partyType: 'Id',
    });
  }
});

test('native68 rich settings preserve ordered sources, flags, rules and explicit override reset', async () => {
  const h = harness();
  const rule = h.desired.spec.reconciliationRules[0];
  rule.ruleType = 'SourceSequence';
  rule.sources = [source('Second__dll'), source('First__dll')];
  rule.shouldIgnoreEmptyValue = false;
  rule.fields = [
    {
      field: structuredClone(h.desired.spec.matchRules[0].criteria[0].field),
      ruleType: 'SourceSequence',
      shouldIgnoreEmptyValue: true,
      sources: rule.sources.toReversed(),
    },
  ];
  h.desired.spec.reconciliationRules[5].ruleType = 'MostFrequent';
  h.desired.spec.matchRules[0].criteria[0].caseSensitiveMatch = false;
  h.desired.spec.matchRules[0].criteria[0].shouldMatchOnBlank = true;
  h.desired.spec.matchRules.push({
    label: 'Second ordered rule',
    criteria: [structuredClone(h.desired.spec.matchRules[0].criteria[1])],
  });
  const body = buildNativeIdentityResolutionCreate(h.desired);
  const richPatch = buildNativeIdentityResolutionUpdate(h.desired);
  for (const payload of [body, richPatch])
    assert.equal(Object.hasOwn(payload, 'trustedSources'), false);
  assert.deepEqual(richPatch.matchRules, body.matchRules);
  assert.deepEqual(richPatch.reconciliationRules, body.reconciliationRules);
  assert.deepEqual(h.desired.spec.trustedSources, []);
  assert.deepEqual(body.reconciliationRules[0].sources, [
    { name: 'Second__dll' },
    { name: 'First__dll' },
  ]);
  assert.deepEqual(body.reconciliationRules[0].fields[0], {
    fieldName: 'ssot__FirstName__c',
    ruleType: 'SourceSequence',
    shouldIgnoreEmptyValue: true,
    sources: [{ name: 'First__dll' }, { name: 'Second__dll' }],
  });
  assert.equal(body.reconciliationRules[5].ruleType, 'MostFrequent');
  assert.equal(body.matchRules.length, 2);
  assert.equal(body.matchRules[0].criteria[0].caseSensitiveMatch, false);
  assert.equal(body.matchRules[0].criteria[0].shouldMatchOnBlank, true);
  const preview = await h.run();
  assert.equal(preview.outcome, 'update');
  const override = structuredClone(body.reconciliationRules[0].fields);
  rule.ruleType = 'LastUpdated';
  rule.sources = [];
  assert.deepEqual(
    buildNativeIdentityResolutionUpdate(h.desired).reconciliationRules[0].fields,
    override,
  );
  rule.fields = [];
  assert.deepEqual(
    buildNativeIdentityResolutionUpdate(h.desired).reconciliationRules[0].fields,
    [],
  );
  rule.ruleType = 'MostFrequent';
  assert.deepEqual(
    buildNativeIdentityResolutionUpdate(h.desired).reconciliationRules[0].fields,
    [],
  );
  const patch = buildNativeIdentityResolutionUpdate(h.desired);
  for (const key of [
    'id',
    'objectApiName',
    'configurationType',
    'rulesetId',
    'secondaryDmo',
    'dataSpaceName',
    'trustedSources',
    'filters',
    'rulesetStatus',
  ])
    assert.equal(Object.hasOwn(patch, key), false);
});

test('native68 CREATE of a name that does not follow <type>_<rulesetId> is refused before any write', async () => {
  const h = harness();
  h.options.verifyPrecreateInputs = async () => ({ fingerprint: 'a'.repeat(64) });
  h.desired.spec.configurationType = 'Account';
  h.connection.request = async () => {
    throw {
      statusCode: 404,
      name: 'ITEM_NOT_FOUND',
      errorCode: 'ITEM_NOT_FOUND',
      data: { errorCode: 'ITEM_NOT_FOUND', message: 'No item' },
    };
  };
  const preview = await h.run();
  assert.equal(preview.outcome, 'blocked');
  assert.equal(preview.diagnostics[0].code, 'IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH');
});

test('native68 exact absence and compatible inputs preview CREATE without predicting outputs', async () => {
  const h = harness();
  h.options.verifyPrecreateInputs = async () => ({ fingerprint: 'a'.repeat(64) });
  h.connection.request = async (request) => {
    assert.equal(request.url.includes('/data-model-objects?'), false);
    throw {
      statusCode: 404,
      name: 'ITEM_NOT_FOUND',
      errorCode: 'ITEM_NOT_FOUND',
      data: { errorCode: 'ITEM_NOT_FOUND', message: 'No item' },
    };
  };
  const preview = await h.run();
  assert.equal(preview.outcome, 'create');
  assert.equal(preview.target, 'absent');
  assert.equal(preview.absenceProof, 'exact-item-not-found');
  assert.deepEqual(preview.route, { apiVersion: '68.0', operation: 'identity-resolutions.post' });
  assert.deepEqual(preview.requiredEffects, ['processing', 'generated-output-provisioning']);
  assert.deepEqual(preview.diagnostics, []);
  assert.equal(preview.precreateBinding.phase, 'precreate');
  assert.deepEqual(Object.keys(preview.precreateBinding).toSorted(), [
    'fingerprint',
    'inputsFingerprint',
    'phase',
  ]);
  assert.equal(preview.precreateBinding.inputsFingerprint, 'a'.repeat(64));
  assert.equal(JSON.stringify(preview).includes('SyntheticUnified'), false);
});

for (const suffix of ['', 'A', 't1', 'Ab3', 'A1b2'])
  test(`native68 suffix length ${suffix.length} survives projection, preview and CREATE serialization`, async () => {
    const h = harness();
    h.raw.objectApiName = suffix ? `Individual_${suffix}` : 'Individual';
    if (suffix) h.raw.rulesetId = suffix;
    else delete h.raw.rulesetId;
    const desired = projectNativeIdentityResolution(h.raw, h.raw.objectApiName).candidate;
    const body = buildNativeIdentityResolutionCreate(desired);
    assert.equal(Object.hasOwn(body, 'rulesetId'), Boolean(suffix));
    if (suffix) assert.equal(body.rulesetId, suffix);
    h.connection.request = async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(request.url.includes('/data-model-objects?'), false);
      assert.equal(request.url.endsWith(`/identity-resolutions/${h.raw.objectApiName}`), true);
      return structuredClone(h.raw);
    };
    const run = () =>
      preflightNativeIdentityResolutionDeploy(desired, h.connection, nativeSelection, 'default', {
        verifyDependencies: async () => {},
        verifyPrecreateInputs: async () => ({ fingerprint: 'a'.repeat(64) }),
      });
    const unchanged = await run();
    assert.equal(unchanged.outcome, 'unchanged');
    desired.spec.description = 'new description';
    const update = await run();
    assert.equal(update.outcome, 'update');
    h.connection.request = async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(request.url.includes('/data-model-objects?'), false);
      throw {
        statusCode: 404,
        name: 'ITEM_NOT_FOUND',
        errorCode: 'ITEM_NOT_FOUND',
        data: { errorCode: 'ITEM_NOT_FOUND', message: 'No item' },
      };
    };
    const create = await run();
    assert.equal(create.outcome, 'create');
  });

test('native68 absent target with incompatible precreate inputs remains blocked', async () => {
  const h = harness();
  h.options.verifyPrecreateInputs = async () => {
    throw new Error('incompatible');
  };
  h.connection.request = async () => {
    throw {
      statusCode: 404,
      name: 'ITEM_NOT_FOUND',
      errorCode: 'ITEM_NOT_FOUND',
      data: { errorCode: 'ITEM_NOT_FOUND', message: 'No item' },
    };
  };
  const preview = await h.run();
  assert.equal(preview.outcome, 'blocked');
  assert.equal(preview.target, 'absent');
  assert.equal(Object.hasOwn(preview, 'precreateBinding'), false);
});

test('native68 precreate fingerprints desired configuration and inputs without enumeration', async () => {
  const h = harness();
  let input = 'a'.repeat(64);
  h.connection.request = async () => assert.fail('Precreate binding must not enumerate DMOs');
  const bind = () =>
    bindNativeIdentityResolutionPrecreate(
      h.desired,
      h.connection,
      nativeSelection,
      'default',
      async () => ({ fingerprint: input }),
    );
  const initial = await bind();
  assert.equal(initial.phase, 'precreate');
  assert.equal(initial.inputsFingerprint, input);
  assert.deepEqual(Object.keys(initial).toSorted(), ['fingerprint', 'inputsFingerprint', 'phase']);
  assert.deepEqual(await bind(), initial);
  input = 'b'.repeat(64);
  const changedInput = await bind();
  assert.notEqual(changedInput.inputsFingerprint, initial.inputsFingerprint);
  assert.notEqual(changedInput.fingerprint, initial.fingerprint);
  input = 'a'.repeat(64);
  h.desired.spec.description = 'Changed desired configuration';
  const changedDesired = await bind();
  assert.equal(changedDesired.inputsFingerprint, initial.inputsFingerprint);
  assert.notEqual(changedDesired.fingerprint, initial.fingerprint);
});

test('native68 precreate detects scope drift and invalid input binding without enumeration', async () => {
  const h = harness();
  h.connection.request = async () => assert.fail('Precreate binding must not enumerate DMOs');
  await assert.rejects(
    bindNativeIdentityResolutionPrecreate(
      h.desired,
      h.connection,
      nativeSelection,
      'default',
      async () => ({ fingerprint: '' }),
    ),
    /BINDING_UNQUALIFIED/u,
  );
  const selection = { ...nativeSelection };
  await assert.rejects(
    bindNativeIdentityResolutionPrecreate(
      h.desired,
      h.connection,
      selection,
      'default',
      async () => {
        selection.requested = '67.0';
        return { fingerprint: 'a'.repeat(64) };
      },
    ),
    /INVALID_SCOPE/u,
  );
});

test('native68 auth, generic404, malformed and unknown failures never imply absence', async () => {
  for (const failure of [
    { statusCode: 401, name: 'INVALID_SESSION_ID' },
    { statusCode: 403 },
    { statusCode: 404 },
    { statusCode: 404, name: 'ITEM_NOT_FOUND', errorCode: 'ITEM_NOT_FOUND', data: [] },
    new Error('private unknown'),
    undefined,
    { objectApiName: 'Individual_A1b2' },
  ]) {
    const h = harness();
    h.connection.request = async () => {
      if (failure === undefined || failure?.objectApiName) return failure;
      throw failure;
    };
    const preview = await h.run();
    assert.equal(preview.outcome, 'blocked');
    assert.equal(preview.target, 'unknown');
    assert.equal(preview.absenceProof, 'none');
    assert.equal(JSON.stringify(preview).includes('private'), false);
  }
});

test('native68 scope and fresh dependency failure block reads without lower-version fallback', async () => {
  const h = harness();
  const wrongScope = await preflightNativeIdentityResolutionDeploy(
    h.desired,
    h.connection,
    { ...nativeSelection, requested: '67.0' },
    'default',
    h.options,
  );
  assert.equal(wrongScope.outcome, 'blocked');
  assert.deepEqual(h.calls, { inputs: 0, gets: 0 });
  h.options.verifyDependencies = async () => {
    throw new Error('input unavailable');
  };
  const blocked = await h.run();
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(h.calls.gets, 0);
});
