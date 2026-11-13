import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  projectNativeIdentityResolution,
  serializeIdentityResolutionDocument,
  validateIdentityResolutionDocument,
} from '../lib/artifacts/identity-resolution-document.js';
import {
  expandedNativeIrFixture,
  irFixture,
  nativeIrFixture,
} from './identity-resolution-fixtures.mjs';

test('native68 sends FirstName case-sensitive matching as authored; the API decides', () => {
  const raw = nativeIrFixture();
  raw.matchRules[0].criteria[0].caseSensitiveMatch = true;
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  assert.equal(desired.spec.matchRules[0].criteria[0].caseSensitiveMatch, true);
  assert.deepEqual(validateIdentityResolutionDocument(desired), desired);
});

test('native68 keeps trusted sources and other settings as returned, without private owner/output identities', () => {
  const raw = nativeIrFixture();
  const projection = projectNativeIdentityResolution(raw, raw.objectApiName);
  assert.equal(projection.expectations.facade, undefined);
  assert.deepEqual(projection.expectations.native, raw);
  assert.deepEqual(projection.candidate.spec.trustedSources, []);
  const bytes = serializeIdentityResolutionDocument(projection.candidate);
  assert.ok(bytes.includes('"trustedSources": []'));
  for (const secret of [
    raw.id,
    raw.rulesetId,
    ...raw.reconciliationRules.flatMap((r) => [r.unifiedDmoName, r.linkDmoName]),
  ]) {
    // The owner suffix is authored identity; private rulesetId is not serialized as a property.
    if (secret !== raw.rulesetId) assert.equal(bytes.includes(secret), false);
  }
  raw.label = 'changed';
  assert.equal(projection.expectations.native.label, 'Synthetic owner');
  const accepted = nativeIrFixture();
  delete accepted.trustedSources;
  assert.deepEqual(
    projectNativeIdentityResolution(accepted, 'Individual_A1b2').candidate.spec.trustedSources,
    [],
  );
  const trusted = nativeIrFixture();
  trusted.trustedSources = [{ name: 'Synthetic__dll' }];
  trusted.reconciliationRules[0].ruleType = 'newruletype';
  trusted.matchRules[0].criteria[0].matchMethodType = 'Fuzzy';
  const kept = projectNativeIdentityResolution(trusted, 'Individual_A1b2').candidate;
  assert.deepEqual(kept.spec.trustedSources, [{ name: 'Synthetic__dll' }]);
  // Unknown API values are kept exactly; known ones get the document spelling in any casing.
  assert.equal(kept.spec.reconciliationRules[0].ruleType, 'newruletype');
  assert.equal(kept.spec.matchRules[0].criteria[0].matchMethodType, 'Fuzzy');
  for (const mutate of [
    (r) => {
      r.trustedSources = {};
    },
    (r) => {
      r.reconciliationRules[0].ruleType = '';
    },
    (r) => {
      r.matchRules[0].criteria[0].matchMethodType = 42;
    },
  ]) {
    const value = nativeIrFixture();
    mutate(value);
    assert.throws(() => projectNativeIdentityResolution(value, 'Individual_A1b2'));
  }
  const invalid = structuredClone(projection.candidate);
  invalid.spec.trustedSources = {};
  assert.throws(() => validateIdentityResolutionDocument(invalid));
});

test('native68 live-shaped GET keeps filters as returned and complete raw comparison evidence', () => {
  const raw = nativeIrFixture();
  const projection = projectNativeIdentityResolution(raw, raw.objectApiName);
  assert.deepEqual(projection.candidate.spec.filters, []);
  assert.deepEqual(projection.expectations.native, raw);
  assert.deepEqual(
    validateIdentityResolutionDocument(
      JSON.parse(serializeIdentityResolutionDocument(projection.candidate)),
    ),
    projection.candidate,
  );
  const omitted = structuredClone(raw);
  delete omitted.filters;
  const normalized = projectNativeIdentityResolution(omitted, omitted.objectApiName);
  assert.deepEqual(normalized.candidate, projection.candidate);
  assert.notDeepEqual(normalized.expectations.native, projection.expectations.native);
  const filtered = structuredClone(raw);
  filtered.filters.push({ fieldName: 'ssot__FirstName__c', value: 'Meaningful' });
  assert.deepEqual(
    projectNativeIdentityResolution(filtered, raw.objectApiName).candidate.spec.filters,
    filtered.filters,
  );
  for (const filters of [{}, undefined, false])
    assert.throws(() => projectNativeIdentityResolution({ ...raw, filters }, raw.objectApiName), {
      code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION',
    });
});

test('native68 admits any owner name and ruleset ID while historical Graph reads stay four-character', () => {
  for (const [apiName, rulesetId] of [
    ['Individual', undefined],
    ['Individual_A', 'A'],
    ['Individual_mce', 'mce'],
    ['Individual_MKT', 'MKT'],
    ['Individual_A1b2', 'A1b2'],
    ['Individual_A1234', 'A1234'],
    ['Individual_A_b', 'A_b'],
    ['Account_ab12', 'ab12'],
  ]) {
    const raw = nativeIrFixture();
    raw.objectApiName = apiName;
    if (rulesetId === undefined) delete raw.rulesetId;
    else raw.rulesetId = rulesetId;
    const document = projectNativeIdentityResolution(raw, apiName).candidate;
    assert.equal(document.identity.apiName, apiName);
    assert.deepEqual(
      validateIdentityResolutionDocument(JSON.parse(serializeIdentityResolutionDocument(document))),
      document,
    );
  }
  for (const [apiName, rulesetId, requested = apiName] of [
    ['Individual_', ''],
    ['Individual', '  '],
    ['Individual', 0],
    ['Individual_A-b', 'A-b'],
    ['Individual_A1b2', 'A1b2', 'Individual_Other'],
  ]) {
    const raw = nativeIrFixture();
    raw.objectApiName = apiName;
    raw.rulesetId = rulesetId;
    assert.throws(() => projectNativeIdentityResolution(raw, requested));
  }
});

const nativeSettings = (r) => ({
  ruleType: r.ruleType.toLowerCase(),
  shouldIgnoreEmptyValue: r.shouldIgnoreEmptyValue,
  sources: r.sources.map((s) => ({ name: s.apiName })),
});
test('expanded native GET roundtrips ordered settings into input-shaped semantics without inherited overrides', () => {
  const raw = expandedNativeIrFixture();
  const projection = projectNativeIdentityResolution(raw, raw.objectApiName);
  const saved = JSON.parse(serializeIdentityResolutionDocument(projection.candidate));
  assert.deepEqual(
    saved.spec.matchRules.map((r) => ({
      label: r.label,
      criteria: r.criteria.map((c) => ({
        entityName: c.field.parentApiName,
        fieldName: c.field.apiName,
        matchMethodType: c.matchMethodType.toLowerCase(),
        caseSensitiveMatch: c.caseSensitiveMatch,
        shouldMatchOnBlank: c.shouldMatchOnBlank,
      })),
    })),
    raw.matchRules,
  );
  assert.deepEqual(
    saved.spec.reconciliationRules.map((r) => ({
      entityName: r.entity.apiName,
      ...nativeSettings(r),
      fields: r.fields.map((f) => ({ fieldName: f.field.apiName, ...nativeSettings(f) })),
    })),
    raw.reconciliationRules.map((r) => ({
      entityName: r.entityName,
      ruleType: r.ruleType,
      shouldIgnoreEmptyValue: r.shouldIgnoreEmptyValue,
      sources: r.sources,
      fields: r.fields,
    })),
  );
  assert.deepEqual(projection.expectations.native, raw);
  assert.equal(projection.expectations.outputs.length, 12);
  assert.deepEqual(saved.spec.reconciliationRules[5].fields, []);
  for (const mutate of [
    (d) => d.spec.matchRules.push(structuredClone(d.spec.matchRules[0])),
    (d) => d.spec.matchRules[0].criteria.push(structuredClone(d.spec.matchRules[0].criteria[0])),
    (d) =>
      d.spec.reconciliationRules[0].fields.push(
        structuredClone(d.spec.reconciliationRules[0].fields[0]),
      ),
    (d) =>
      d.spec.reconciliationRules[0].sources.push(
        structuredClone(d.spec.reconciliationRules[0].sources[0]),
      ),
    (d) => {
      d.spec.reconciliationRules[0].fields[0].unknown = true;
    },
    (d) => {
      d.spec.reconciliationRules[0].sources[0].dataSpace = 'other';
    },
  ]) {
    const invalid = structuredClone(saved);
    mutate(invalid);
    assert.throws(() => validateIdentityResolutionDocument(invalid));
  }
  const reset = structuredClone(raw);
  reset.reconciliationRules[0].fields = [];
  assert.deepEqual(
    projectNativeIdentityResolution(reset, reset.objectApiName).candidate.spec
      .reconciliationRules[0].fields,
    [],
  );
});

const project = ({ native } = irFixture()) =>
  projectNativeIdentityResolution(native, 'Individual_A1b2');

test('IR projects both observed reconciliation variants losslessly and detaches private correlation', () => {
  for (const method of ['lastupdated', 'mostfrequent']) {
    const input = irFixture(method);
    const result = project(input);
    const document = result.candidate;
    assert.equal(document.spec.reconciliationRules.length, 6);
    assert.equal(result.expectations.outputs.length, 12);
    assert.deepEqual(
      document.spec.matchRules[0].criteria.map((item) => item.matchMethodType),
      ['Fuzzy', 'Exact', 'ExactNormalized'],
    );
    assert.equal(
      document.spec.reconciliationRules[0].ruleType,
      method === 'lastupdated' ? 'LastUpdated' : 'MostFrequent',
    );
    assert.deepEqual(document.spec.reconciliationRules[5].outputs[1], {
      owner: {
        kind: 'identity-resolution',
        dataSpace: 'default',
        apiName: 'Individual_A1b2',
      },
      entity: { kind: 'dmo', dataSpace: 'default', apiName: 'ssot__PartyIdentification__dlm' },
      role: 'link',
    });
    const bytes = serializeIdentityResolutionDocument(document);
    assert.equal(bytes.endsWith('\n'), true);
    for (const secret of [
      'synthetic-owner-id',
      'SyntheticUnified',
      'SyntheticLink',
      'rulesetId',
      'rulesetStatus',
      'PUBLISHED',
    ])
      assert.equal(bytes.includes(secret), false);
    assert.deepEqual(validateIdentityResolutionDocument(JSON.parse(bytes)), document);
    assert.equal(serializeIdentityResolutionDocument(JSON.parse(bytes)), bytes);
    input.native.label = 'changed';
    assert.equal(result.expectations.native.label, 'Synthetic owner');
  }
});

test('IR identity with a logicalName key is refused as an invalid file, never reinterpreted', () => {
  const document = project().candidate;
  for (const keepApiName of [false, true]) {
    const legacy = structuredClone(document);
    legacy.identity.logicalName = 'ArbitraryOwner';
    if (!keepApiName) delete legacy.identity.apiName;
    assert.throws(() => validateIdentityResolutionDocument(legacy), {
      code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION',
    });
  }
});

test('IR projects exact exposed API bytes without suffix inference, labels or generated names', () => {
  const pair = irFixture();
  pair.native.objectApiName = 'ExposedOwner_ActualSuffix';
  const projected = projectNativeIdentityResolution(pair.native, pair.native.objectApiName);
  assert.equal(projected.candidate.identity.apiName, 'ExposedOwner_ActualSuffix');
  assert.throws(() => projectNativeIdentityResolution(pair.native, 'Individual_A1b2'));
  assert.throws(() => projectNativeIdentityResolution(pair.native, pair.native.label));
  const bytes = serializeIdentityResolutionDocument(projected.candidate);
  assert.equal(bytes.includes('ActualSuffix'), true);
  for (const privateValue of [
    'synthetic-owner-id',
    'SyntheticUnified',
    'SyntheticLink',
    'rulesetId',
    'logicalName',
  ])
    assert.equal(bytes.includes(privateValue), false);
});

test('IR portable validation refuses identity drift, unknown settings and executable JSON', () => {
  const document = project().candidate;
  for (const mutate of [
    (d) => {
      d.spec.reconciliationRules[0].outputs[0].owner.apiName = 'Other';
    },
    (d) => {
      d.spec.unknown = true;
    },
    (d) => {
      delete d.spec.filters;
    },
    (d) => {
      d.identity.id = 'source';
    },
    (d) => {
      d.spec.matchRules[0].criteria[0].matchMethodType = '';
    },
    (d) => {
      d.spec.doesRunAutomatically = 'yes';
    },
    (d) => {
      d.spec.reconciliationRules.push(structuredClone(d.spec.reconciliationRules[0]));
    },
  ]) {
    const value = structuredClone(document);
    mutate(value);
    assert.throws(() => validateIdentityResolutionDocument(value));
  }
  let calls = 0;
  const getter = { ...document };
  Object.defineProperty(getter, 'spec', {
    enumerable: true,
    get() {
      calls++;
      return document.spec;
    },
  });
  assert.throws(() => validateIdentityResolutionDocument(getter));
  assert.equal(calls, 0);
  const cyclic = structuredClone(document);
  cyclic.spec.filters.push(cyclic);
  assert.throws(() => validateIdentityResolutionDocument(cyclic));
});

/**
 * Build a ruleset shaped like the recorded API68 list entries (runtime statistics, no
 * description, a party identifier criterion, automatic runs).
 * @returns {object} Synthetic native owner.
 */
function runningIrFixture() {
  const raw = nativeIrFixture();
  delete raw.description;
  Object.assign(raw, {
    objectApiName: 'Individual_mce',
    rulesetId: 'mce',
    doesRunAutomatically: true,
    anonymousUnifiedProfiles: 0,
    consolidationRate: 3,
    knownUnifiedProfiles: 504,
    lastJobCompleted: '2026-08-18T11:27:21.000Z',
    lastJobStatus: 'SUCCESS',
    matchedSourceProfiles: 36,
    sourceProfiles: 522,
    totalUnifiedProfiles: 504,
  });
  raw.matchRules = [
    {
      label: 'Subscriber key',
      criteria: [
        {
          caseSensitiveMatch: false,
          entityName: 'ssot__PartyIdentification__dlm',
          fieldName: 'ssot__IdentificationNumber__c',
          matchMethodType: 'exact',
          partyIdentificationInfo: { partyName: 'Subscriber Key', partyType: 'Person Identifier' },
          shouldMatchOnBlank: false,
        },
      ],
    },
  ];
  return raw;
}

test('native68 automatic ruleset with run statistics, party identifier and no description round-trips', () => {
  const raw = runningIrFixture();
  const projection = projectNativeIdentityResolution(raw, 'Individual_mce');
  const document = projection.candidate;
  assert.equal(document.spec.doesRunAutomatically, true);
  assert.equal(document.spec.description, '');
  assert.deepEqual(document.spec.matchRules[0].criteria[0].partyIdentificationInfo, {
    partyName: 'Subscriber Key',
    partyType: 'Person Identifier',
  });
  const bytes = serializeIdentityResolutionDocument(document);
  for (const statistic of ['lastJobStatus', 'knownUnifiedProfiles', 'SUCCESS'])
    assert.equal(bytes.includes(statistic), false);
  // Statistics change between reads, so they are not owner comparison evidence either.
  assert.equal(Object.hasOwn(projection.expectations.native, 'lastJobStatus'), false);
  const later = runningIrFixture();
  later.knownUnifiedProfiles = 999;
  later.lastJobStatus = 'FAILURE';
  assert.deepEqual(projectNativeIdentityResolution(later, 'Individual_mce'), projection);
  assert.deepEqual(validateIdentityResolutionDocument(JSON.parse(bytes)), document);
  const party = structuredClone(document);
  party.spec.matchRules[0].criteria[0].partyIdentificationInfo = 'Subscriber Key';
  assert.throws(() => validateIdentityResolutionDocument(party));
  const unknown = runningIrFixture();
  unknown.unknownSetting = true;
  assert.throws(() => projectNativeIdentityResolution(unknown, 'Individual_mce'));
});

test('native68 projects a non-default reconciliation set, count and configuration type', () => {
  const raw = nativeIrFixture();
  raw.configurationType = 'account';
  raw.secondaryDmo = 'ssot__Account__dlm';
  raw.isCaseSensitive = false;
  raw.matchRules = [
    {
      label: 'Account name',
      criteria: [
        {
          caseSensitiveMatch: true,
          entityName: 'ssot__Account__dlm',
          fieldName: 'ssot__Name__c',
          matchMethodType: 'fuzzy',
          shouldMatchOnBlank: true,
        },
      ],
    },
  ];
  raw.reconciliationRules = [
    {
      entityName: 'ssot__Account__dlm',
      fields: [],
      linkDmoName: 'SyntheticLinkAccount__dlm',
      ruleType: 'sourcesequence',
      shouldIgnoreEmptyValue: false,
      sources: [],
      unifiedDmoName: 'SyntheticUnifiedAccount__dlm',
    },
    {
      entityName: 'Custom_Contact__dlm',
      fields: [
        {
          fieldName: 'Phone__c',
          ruleType: 'lastupdated',
          shouldIgnoreEmptyValue: true,
          sources: [{ name: 'Custom_Source__dll' }],
        },
      ],
      linkDmoName: 'SyntheticLinkContact__dlm',
      ruleType: 'mostfrequent',
      shouldIgnoreEmptyValue: true,
      sources: [{ name: 'Other_Source' }],
      unifiedDmoName: 'SyntheticUnifiedContact__dlm',
    },
  ];
  const projection = projectNativeIdentityResolution(raw, raw.objectApiName);
  const document = projection.candidate;
  assert.equal(document.spec.configurationType, 'account');
  assert.deepEqual(document.spec.secondaryDmo.apiName, 'ssot__Account__dlm');
  assert.deepEqual(
    document.spec.reconciliationRules.map((rule) => [rule.entity.apiName, rule.ruleType]),
    [
      ['ssot__Account__dlm', 'SourceSequence'],
      ['Custom_Contact__dlm', 'MostFrequent'],
    ],
  );
  assert.equal(projection.expectations.outputs.length, 4);
  assert.deepEqual(
    validateIdentityResolutionDocument(JSON.parse(serializeIdentityResolutionDocument(document))),
    document,
  );
});

test('native68 projects an unpublished (NEW) ruleset without match rules or generated outputs', () => {
  const raw = nativeIrFixture();
  raw.rulesetStatus = 'NEW';
  raw.matchRules = [];
  for (const rule of raw.reconciliationRules) {
    delete rule.unifiedDmoName;
    // eslint-disable-next-line unicorn/no-null -- The API may answer JSON null for an absent output.
    rule.linkDmoName = null;
  }
  const projection = projectNativeIdentityResolution(raw, raw.objectApiName);
  assert.deepEqual(projection.candidate.spec.matchRules, []);
  assert.deepEqual(projection.expectations.outputs, []);
  assert.equal(projection.expectations.native.rulesetStatus, 'NEW');
  assert.equal(serializeIdentityResolutionDocument(projection.candidate).includes('NEW'), false);
});
