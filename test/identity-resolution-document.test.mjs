import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  projectIdentityResolution,
  serializeIdentityResolutionDocument,
  validateIdentityResolutionDocument,
} from '../lib/artifacts/identity-resolution-document.js';
import { irFixture } from './identity-resolution-fixtures.mjs';

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
      d.spec.matchRules[0].criteria.reverse();
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
