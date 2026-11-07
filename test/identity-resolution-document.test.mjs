import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  projectIdentityResolution,
  projectNativeIdentityResolution,
  serializeIdentityResolutionDocument,
  validateIdentityResolutionDocument,
} from '../lib/artifacts/identity-resolution-document.js';
import {
  expandedNativeIrFixture,
  irFixture,
  nativeIrFixture,
} from './identity-resolution-fixtures.mjs';

test('native68 rejects demonstrated unsupported FirstName case-sensitive matching in documents and readback', () => {
  const raw = nativeIrFixture();
  const desired = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  desired.spec.matchRules[0].criteria[0].caseSensitiveMatch = true;
  assert.throws(() => validateIdentityResolutionDocument(desired), {
    code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION',
  });
  raw.matchRules[0].criteria[0].caseSensitiveMatch = true;
  assert.throws(() => projectNativeIdentityResolution(raw, raw.objectApiName), {
    code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION',
  });
});

test('native68 retains empty trustedSources and all admitted definition without private owner/output identities', () => {
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
  for (const mutate of [
    (r) => {
      delete r.trustedSources;
    },
    (r) => {
      r.trustedSources = [{}];
    },
    (r) => {
      r.trustedSources = {};
    },
    (r) => {
      r.rulesetId = 'Z9y8';
    },
    (r) => {
      r.reconciliationRules[0].ruleType = 'unsupported';
    },
    (r) => {
      r.matchRules[0].criteria[0].matchMethodType = 'Fuzzy';
    },
  ]) {
    const value = nativeIrFixture();
    mutate(value);
    assert.throws(() => projectNativeIdentityResolution(value, 'Individual_A1b2'));
  }
  const invalid = structuredClone(projection.candidate);
  invalid.spec.trustedSources = [{}];
  assert.throws(() => validateIdentityResolutionDocument(invalid));
});

test('native68 live-shaped GET preserves empty filters and complete raw comparison evidence', () => {
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
  raw.filters.push({ fieldName: 'ssot__FirstName__c', value: 'Meaningful' });
  assert.deepEqual(projection.expectations.native.filters, []);
  for (const filters of [raw.filters, {}, undefined, false])
    assert.throws(() => projectNativeIdentityResolution({ ...raw, filters }, raw.objectApiName), {
      code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION',
    });
});

test('native68 uses exact optional alphanumeric suffix mapping while historical Graph reads stay four-character', () => {
  for (const suffix of ['', 'A', 't1', 'Ab3', 'A1b2']) {
    const raw = nativeIrFixture();
    raw.objectApiName = suffix ? `Individual_${suffix}` : 'Individual';
    if (suffix) raw.rulesetId = suffix;
    else delete raw.rulesetId;
    const document = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
    assert.equal(document.identity.apiName, raw.objectApiName);
    assert.deepEqual(
      validateIdentityResolutionDocument(JSON.parse(serializeIdentityResolutionDocument(document))),
      document,
    );
    if (suffix.length !== 4) {
      const pair = irFixture();
      pair.facade.objectApiName = raw.objectApiName;
      if (suffix) pair.facade.rulesetId = suffix;
      else delete pair.facade.rulesetId;
      pair.native = structuredClone(pair.facade);
      delete pair.native.filters;
      assert.throws(() => projectIdentityResolution(pair.facade, pair.native, raw.objectApiName));
    }
  }
  for (const [apiName, suffix] of [
    ['Individual_', ''],
    ['Individual', ''],
    ['Individual', 0],
    ['Individual_A', undefined],
    ['Individual_A', 'a'],
    ['Individual_A1234', 'A1234'],
    ['Individual_A_b', 'A_b'],
    ['Individual_A-b', 'A-b'],
    ['Individual_A ', 'A '],
  ]) {
    const raw = nativeIrFixture();
    raw.objectApiName = apiName;
    if (suffix === undefined) delete raw.rulesetId;
    else raw.rulesetId = suffix;
    assert.throws(() => projectNativeIdentityResolution(raw, apiName));
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

const project = ({ facade, native } = irFixture()) =>
  projectIdentityResolution(facade, native, 'Individual_A1b2');

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
    input.facade.label = 'changed';
    assert.equal(result.expectations.facade.label, 'Synthetic owner');
  }
});

test('IR legacy arbitrary logicalName artifacts are explicitly refused, never reinterpreted', () => {
  const document = project().candidate;
  for (const keepApiName of [false, true]) {
    const legacy = structuredClone(document);
    legacy.identity.logicalName = 'ArbitraryOwner';
    if (!keepApiName) delete legacy.identity.apiName;
    assert.throws(() => validateIdentityResolutionDocument(legacy), {
      code: 'LEGACY_IDENTITY_RESOLUTION_IDENTITY_UNSUPPORTED',
    });
  }
});

test('IR projects exact exposed API bytes without suffix inference, labels or generated names', () => {
  const pair = irFixture();
  pair.facade.objectApiName = 'ExposedOwner_ActualSuffix';
  pair.native.objectApiName = pair.facade.objectApiName;
  const projected = projectIdentityResolution(pair.facade, pair.native, pair.facade.objectApiName);
  assert.equal(projected.candidate.identity.apiName, 'ExposedOwner_ActualSuffix');
  assert.throws(() => projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2'));
  assert.throws(() => projectIdentityResolution(pair.facade, pair.native, pair.facade.label));
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

const unsupported = [
  (r) => {
    r.extra = true;
  },
  (r) => {
    r.filters = [{}];
  },
  (r) => {
    delete r.description;
  },
  (r) => {
    r.doesRunAutomatically = true;
  },
  (r) => {
    r.isCaseSensitive = false;
  },
  (r) => {
    r.secondaryDmo = 'Unknown__dlm';
  },
  (r) => {
    r.configurationType = 'Individual';
  },
  (r) => {
    r.matchRules[0].criteria.reverse();
  },
  (r) => {
    r.matchRules[0].criteria[0].caseSensitiveMatch = true;
  },
  (r) => {
    r.matchRules[0].criteria[0].shouldMatchOnBlank = true;
  },
  (r) => {
    r.matchRules[0].criteria[0].unknown = [];
  },
  (r) => {
    r.reconciliationRules.reverse();
  },
  (r) => {
    r.reconciliationRules[1].ruleType = 'mostfrequent';
  },
  (r) => {
    r.reconciliationRules[0].fields = [{}];
  },
  (r) => {
    r.reconciliationRules[0].sources = [{}];
  },
  (r) => {
    r.reconciliationRules[0].shouldIgnoreEmptyValue = false;
  },
  (r) => {
    r.reconciliationRules[0].unifiedDmoName = r.reconciliationRules[0].linkDmoName;
  },
  (r) => {
    r.reconciliationRules[0].unifiedDmoName = 'invalid';
  },
  (r) => {
    r.rulesetId = 'wrong';
  },
  (r) => {
    r.dataSpaceName = 'other';
  },
];
for (const [index, mutate] of unsupported.entries())
  test(`IR rejects unsupported complete shape ${index}`, () => {
    const input = irFixture();
    mutate(input.facade);
    input.native = structuredClone(input.facade);
    delete input.native.filters;
    assert.throws(() => project(input), { code: 'UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION' });
  });

test('IR rejects native divergence, missing fields, extra filters and arbitrary wrappers', () => {
  for (const mutate of [
    (n) => {
      n.label = 'different';
    },
    (n) => {
      delete n.description;
    },
    (n) => {
      n.filters = [];
    },
    (n) => {
      n.matchRules[0].criteria[0].matchMethodType = 'Fuzzy';
    },
  ]) {
    const input = irFixture();
    mutate(input.native);
    assert.throws(() => project(input));
  }
  assert.throws(() =>
    project({ facade: { result: irFixture().facade }, native: irFixture().native }),
  );
});

for (const status of ['PUBLISHING', 'DELETING', 'UNKNOWN', 42])
  test(`IR refuses unsettled state ${status}`, () => {
    const input = irFixture();
    input.facade.rulesetStatus = status;
    input.native.rulesetStatus = status;
    assert.throws(() => project(input), { code: 'IDENTITY_RESOLUTION_NOT_SETTLED' });
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
      d.spec.matchRules[0].criteria[0].matchMethodType = 'Unknown';
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
