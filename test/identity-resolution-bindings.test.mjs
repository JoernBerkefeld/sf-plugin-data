import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { Connection } from '@salesforce/core';
import {
  projectIdentityResolution,
  projectNativeIdentityResolution,
} from '../lib/artifacts/identity-resolution-document.js';
import {
  bindIdentityResolutionDependencies,
  verifyIdentityResolutionOutputs,
} from '../lib/services/bind-identity-resolution-dependencies.js';
import { executeIdentityResolutionDeploy } from '../lib/services/execute-identity-resolution-deploy.js';
import {
  irFixture,
  expandedNativeIrFixture,
  selection,
  nativeIrFixture,
  nativeSelection,
} from './identity-resolution-fixtures.mjs';

const connection = {
  instanceUrl: 'https://synthetic.example',
  getApiVersion: () => '67.0',
  request: async () => {
    throw new Error('Unexpected request');
  },
};
const pair = irFixture();
const projection = projectIdentityResolution(pair.facade, pair.native, 'Individual_A1b2');
const document = projection.candidate;
const owner = { targetApiName: 'Individual_A1b2', targetId: pair.facade.id, dataSpace: 'default' };
const outputs = projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
  identity,
  targetApiName: sourceApiName,
}));
const acquireOwner = async () => ({
  identity: document.identity,
  ...structuredClone(projection),
  blockers: [],
});

/**
 * Build synthetic independent DMO representations, never captured org responses.
 * @param {string} name Exact synthetic DMO name.
 * @param {number} [index] Synthetic target identity index.
 * @param {string} [role] Generated output role.
 * @returns {object} Independent synthetic representations.
 */
function fixture(name, index = 0, role) {
  const required = role
    ? [role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c']
    : [
        'ssot__Id__c',
        ...document.spec.matchRules[0].criteria
          .filter((item) => item.field.parentApiName === name)
          .map((item) => item.field.apiName),
      ];
  const creationType = role === 'unified' ? 'Derived' : role === 'link' ? 'Bridge' : 'Standard';
  return {
    detail: {
      name,
      id: `target-local-${index}`,
      dataSpaceName: 'default',
      creationType,
      fields: required.map((field) => ({ name: field, type: 'Text' })),
    },
    metadata: [
      {
        fullName: name,
        mktDataModelAttributes: { dataSpaceName: 'default', creationType },
        fields: required.map((field) => ({
          fullName: field,
          type: 'Text',
          mktDataModelFieldAttributes: field === 'ssot__Id__c' ? { primaryIndexOrder: '1' } : {},
        })),
      },
    ],
  };
}
/**
 * Build independent synthetic source DLO evidence.
 * @param {string} name Logical DLO API identity.
 * @returns {object} Native and Metadata definition evidence.
 */
function sourceFixture(name) {
  return {
    detail: {
      name,
      id: `target-${name}`,
      label: 'Unrelated label',
      category: 'Other',
      status: 'ACTIVE',
      dataSpaceInfo: [{ name: 'default' }],
      fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
    },
    metadata: [{ fullName: name, fields: [{ fullName: 'Id__c', type: 'Text' }] }],
  };
}

test('native binding reuses only completed raw pairs within one invocation, preserving exact priority fingerprints', async () => {
  const raw = expandedNativeIrFixture();
  const expanded = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const conn = { ...connection, getApiVersion: () => '68.0' };
  const reads = new Map();
  let drift = false;
  let reject = false;
  const failure = new Error('Synthetic Metadata acquisition failure');
  const acquire = async (name) => {
    reads.set(name, (reads.get(name) ?? 0) + 1);
    if (reject && name === 'SyntheticLead__dll') throw failure;
    const result = name.endsWith('__dll') ? sourceFixture(name) : await inputRead(name);
    if (drift) result.detail.id += '-drift';
    return result;
  };
  const bind = (value = expanded) =>
    bindIdentityResolutionDependencies(value, conn, nativeSelection, 'default', acquire);
  const first = await bind();
  assert.equal(
    first.fingerprint,
    '7445d1276e9003f73c36c2f135fb3f1e4927fee3cc60c33ed78d6afeb9eb3b58',
  );
  const names = [
    expanded.spec.reconciliationRules[0].entity.apiName,
    'SyntheticLead__dll',
    'SyntheticContact__dll',
    ...expanded.spec.reconciliationRules.slice(1).map((rule) => rule.entity.apiName),
  ];
  assert.deepEqual(
    [...reads],
    names.map((name) => [name, 1]),
  );
  assert.deepEqual(await bind(), first);
  assert.deepEqual(
    [...reads],
    names.map((name) => [name, 2]),
  );
  const reordered = structuredClone(expanded);
  reordered.spec.reconciliationRules[0].sources.reverse();
  const reversed = await bind(reordered);
  assert.equal(
    reversed.fingerprint,
    'cd7bc63e316f412b3dc5a6ad3e21d5e4d442c50c853381919ef6e3c2b3eaaf95',
  );
  drift = true;
  const changed = await bind();
  assert.notEqual(changed.fingerprint, first.fingerprint);
  assert.deepEqual(
    [...reads],
    names.map((name) => [name, 4]),
  );
  drift = false;
  reject = true;
  reads.clear();
  await assert.rejects(bind(), (error) => error === failure);
  assert.deepEqual(
    [...reads],
    names.slice(0, 2).map((name) => [name, 1]),
  );
  reject = false;
  reads.clear();
  assert.deepEqual(await bind(), first);
  assert.deepEqual(
    [...reads],
    names.map((name) => [name, 1]),
  );
});

test('expanded native binding checks every rule, override and ordered real target DLO priority', async () => {
  const raw = expandedNativeIrFixture();
  raw.matchRules[1].criteria[0].fieldName = 'AdditionalMatch__c';
  raw.reconciliationRules[5].fields = [
    {
      fieldName: 'OverrideOnly__c',
      ruleType: 'lastupdated',
      shouldIgnoreEmptyValue: true,
      sources: [],
    },
  ];
  const expanded = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const conn = { ...connection, getApiVersion: () => '68.0' };
  const acquire = async (name) => {
    if (name.endsWith('__dll')) return sourceFixture(name);
    const result = await inputRead(name);
    for (const field of [
      ...expanded.spec.matchRules.flatMap((r) => r.criteria.map((c) => c.field)),
      ...expanded.spec.reconciliationRules.flatMap((r) => r.fields.map((f) => f.field)),
    ]) {
      if (
        field.parentApiName !== name ||
        result.detail.fields.some((f) => f.name === field.apiName)
      )
        continue;
      result.detail.fields.push({ name: field.apiName, type: 'Text' });
      result.metadata[0].fields.push({
        fullName: field.apiName,
        type: 'Text',
        mktDataModelFieldAttributes: {},
      });
    }
    return result;
  };
  const first = await bindIdentityResolutionDependencies(
    expanded,
    conn,
    nativeSelection,
    'default',
    acquire,
  );
  const reordered = structuredClone(expanded);
  reordered.spec.reconciliationRules[0].sources.reverse();
  const changed = await bindIdentityResolutionDependencies(
    reordered,
    conn,
    nativeSelection,
    'default',
    acquire,
  );
  assert.notEqual(changed.fingerprint, first.fingerprint);
  for (const mutate of [
    (f, name) => {
      if (name.endsWith('__dll')) f.detail.dataSpaceInfo = [{ name: 'other' }];
    },
    (f, name) => {
      if (name.endsWith('__dll')) f.detail.name = 'Wrong__dll';
    },
    (f, name) => {
      if (name.endsWith('__dll')) f.metadata = [];
    },
    (f, name) => {
      if (name.endsWith('__dll'))
        f.metadata[0].fields.push(structuredClone(f.metadata[0].fields[0]));
    },
    (f, name) => {
      if (name.endsWith('__dll')) f.metadata[0].fields[0].type = 'Number';
    },
    (f, name) => {
      if (!name.endsWith('__dll'))
        f.detail.fields = f.detail.fields.filter((v) => v.name !== 'AdditionalMatch__c');
    },
    (f, name) => {
      if (!name.endsWith('__dll'))
        f.detail.fields = f.detail.fields.filter((v) => v.name !== 'OverrideOnly__c');
    },
  ])
    await assert.rejects(
      bindIdentityResolutionDependencies(
        expanded,
        conn,
        nativeSelection,
        'default',
        async (name) => {
          const f = await acquire(name);
          mutate(f, name);
          return f;
        },
      ),
    );
});
/**
 * Model the observed 78-field native wrapper and separately ordered Metadata inventory.
 * @param {string} name Synthetic source DLO name.
 * @returns {object} Detached live-shaped schema evidence without captured org data.
 */
function booleanSourceFixture(name) {
  const result = sourceFixture(name);
  const fields = result.detail.fields;
  fields.push({
    name: 'IdentityIsAMatch__c',
    label: 'Identity match',
    dataType: 'Boolean',
    isPrimaryKey: false,
  });
  for (let index = 0; index < 76; index++)
    fields.push({
      name: `SyntheticField${index}__c`,
      label: `Synthetic field ${index}`,
      dataType: index % 2 === 0 ? 'Text' : 'Number',
      isPrimaryKey: false,
    });
  result.metadata[0].fields = fields
    .map(({ name: fullName, dataType }) => ({
      fullName,
      type: dataType === 'Boolean' ? 'Checkbox' : dataType,
    }))
    .toReversed();
  result.detail.dataLakeFieldInfoRepresentation = fields;
  delete result.detail.fields;
  result.detail = { dataLakeObjects: [result.detail] };
  return result;
}

test('native68 source binding admits only observed Boolean/Checkbox correspondence without rewriting evidence or fingerprints', async () => {
  const raw = expandedNativeIrFixture();
  const expanded = projectNativeIdentityResolution(raw, raw.objectApiName).candidate;
  const conn = { ...connection, getApiVersion: () => '68.0' };
  const evidence = booleanSourceFixture('SyntheticLead__dll');
  const snapshot = structuredClone(evidence);
  const bind = (change = () => {}, document = expanded, scope = nativeSelection) =>
    bindIdentityResolutionDependencies(document, conn, scope, 'default', async (name) => {
      if (!name.endsWith('__dll')) return inputRead(name);
      const result = name === 'SyntheticLead__dll' ? evidence : booleanSourceFixture(name);
      change(result);
      return result;
    });
  const first = await bind();
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(evidence.detail.dataLakeObjects[0].dataLakeFieldInfoRepresentation.length, 78);
  assert.equal(evidence.metadata[0].fields.length, 78);
  assert.deepEqual(evidence, snapshot);
  const exactBoolean = await bind((result) => {
    result.metadata[0].fields.find((field) => field.fullName === 'IdentityIsAMatch__c').type =
      'Boolean';
  });
  assert.deepEqual(exactBoolean, first);
  assert.equal(
    evidence.detail.dataLakeObjects[0].dataLakeFieldInfoRepresentation[1].dataType,
    'Boolean',
  );
  Object.assign(evidence, structuredClone(snapshot));
  const changedNative = await bind((result) => {
    result.detail.dataLakeObjects[0].dataLakeFieldInfoRepresentation[1].dataType = 'Checkbox';
  });
  assert.notEqual(changedNative.fingerprint, first.fingerprint);
  for (const [nativeType, metadataType] of [
    ['Boolean', 'Text'],
    ['Boolean', 'Number'],
    ['Text', 'Checkbox'],
    ['Number', 'Checkbox'],
    ['Checkbox', 'Boolean'],
    ['boolean', 'Checkbox'],
    ['Boolean', 'checkbox'],
  ]) {
    Object.assign(evidence, structuredClone(snapshot));
    await assert.rejects(
      bind((result) => {
        result.detail.dataLakeObjects[0].dataLakeFieldInfoRepresentation[1].dataType = nativeType;
        result.metadata[0].fields.find((field) => field.fullName === 'IdentityIsAMatch__c').type =
          metadataType;
      }),
      { code: 'IDENTITY_RESOLUTION_BINDING_UNQUALIFIED' },
    );
  }
  for (const mutate of [
    (result) => result.metadata[0].fields.pop(),
    (result) => {
      result.metadata[0].fields[0].fullName = 'Different__c';
    },
    (result) => {
      result.metadata[0].fullName = 'Wrong__dll';
    },
    (result) => {
      result.detail.dataLakeObjects[0].dataSpaceInfo = [{ name: 'other' }];
    },
    (result) => {
      result.detail.dataLakeObjects[0].status = 'INACTIVE';
    },
  ]) {
    Object.assign(evidence, structuredClone(snapshot));
    await assert.rejects(bind(mutate));
  }
  Object.assign(evidence, structuredClone(snapshot));
  await assert.rejects(bind(() => {}, expanded, { ...nativeSelection, restSelector: 'v67.0' }));
  const changedId = await bind((result) => {
    result.detail.dataLakeObjects[0].id += '-drift';
  });
  assert.notEqual(changedId.fingerprint, first.fingerprint);
});

const inputRead = async (name) =>
  fixture(
    name,
    document.spec.reconciliationRules.findIndex((rule) => rule.entity.apiName === name),
  );
const outputRead = async (name) => {
  const index = outputs.findIndex((output) => output.targetApiName === name);
  return fixture(name, index, outputs[index].identity.role);
};

test('IR input fingerprints are stable, fresh and target-local, ignoring unrelated field ordering', async () => {
  let reads = 0;
  const acquire = async (name) => {
    reads++;
    return inputRead(name);
  };
  const first = await bindIdentityResolutionDependencies(
    document,
    connection,
    selection,
    'default',
    acquire,
  );
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    await bindIdentityResolutionDependencies(document, connection, selection, 'default', acquire),
    first,
  );
  assert.equal(reads, 12);
  const changed = await bindIdentityResolutionDependencies(
    document,
    connection,
    selection,
    'default',
    async (name) => {
      const f = await inputRead(name);
      f.detail.id = `different-${f.detail.id}`;
      return f;
    },
  );
  assert.notEqual(changed.fingerprint, first.fingerprint);
  assert.deepEqual(
    await bindIdentityResolutionDependencies(
      document,
      connection,
      selection,
      'default',
      async (name) => {
        const f = await inputRead(name);
        f.detail.fields.reverse();
        f.metadata[0].fields.reverse();
        return f;
      },
    ),
    first,
  );
});

test('IR input keys accept unrelated Lookup fields without attribute bags, retaining explicit Text key proof', async () => {
  const first = await bindIdentityResolutionDependencies(
    document,
    connection,
    selection,
    'default',
    inputRead,
  );
  let reads = 0;
  const proof = await bindIdentityResolutionDependencies(
    document,
    connection,
    selection,
    'default',
    async (name) => {
      reads++;
      const f = await inputRead(name);
      f.detail.fields[0].isPrimaryKey = true;
      f.metadata[0].fields.unshift({ fullName: 'RelatedRecord__c', type: 'Lookup' });
      f.metadata[0].fields.push({ fullName: 'OtherRelatedRecord__c', type: 'Lookup' });
      return f;
    },
  );
  assert.equal(reads, 6);
  assert.deepEqual(proof, first);
});

const inputAttributeFailures = {
  missingRequiredTextBag: (f) => {
    delete f.metadata[0].fields[0].mktDataModelFieldAttributes;
  },
  missingMatchTextBag: (f) => {
    if (f.metadata[0].fields.length > 1) delete f.metadata[0].fields[1].mktDataModelFieldAttributes;
  },
  missingUnrelatedTextBag: (f) => {
    f.metadata[0].fields.push({ fullName: 'Unrelated__c', type: 'Text' });
  },
  missingUnknownTypeBag: (f) => {
    f.metadata[0].fields.push({ fullName: 'Unrelated__c', type: 'Unknown' });
  },
  missingTypeAndBag: (f) => {
    f.metadata[0].fields.push({ fullName: 'Unrelated__c' });
  },
  duplicatePrimary: (f) => {
    f.metadata[0].fields.push({
      fullName: 'AnotherKey__c',
      type: 'Text',
      mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
    });
  },
  lookupPrimary: (f) => {
    f.metadata[0].fields.push({
      fullName: 'RelatedRecord__c',
      type: 'Lookup',
      mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
    });
  },
  numericPrimary: (f) => {
    f.metadata[0].fields[0].mktDataModelFieldAttributes.primaryIndexOrder = 1;
  },
};
for (const [name, value] of Object.entries({
  // eslint-disable-next-line unicorn/no-null -- Null is an explicitly malformed Metadata bag regression.
  null: null,
  array: [],
  string: '1',
  number: 1,
  boolean: false,
  undefined,
}))
  inputAttributeFailures[`malformedLookupBag-${name}`] = (f) => {
    f.metadata[0].fields.push({
      fullName: 'RelatedRecord__c',
      type: 'Lookup',
      mktDataModelFieldAttributes: value,
    });
  };
for (const [name, change] of Object.entries(inputAttributeFailures))
  test(`IR input attribute evidence fails closed: ${name}`, async () => {
    await assert.rejects(
      bindIdentityResolutionDependencies(
        document,
        connection,
        selection,
        'default',
        async (apiName) => {
          const f = await inputRead(apiName);
          f.metadata[0].fields.push({ fullName: 'AllowedRelationship__c', type: 'Lookup' });
          change(f);
          return f;
        },
      ),
      { code: 'IDENTITY_RESOLUTION_BINDING_UNQUALIFIED' },
    );
  });

const inputFailures = {
  missing: (f) => {
    f.metadata = [];
  },
  ambiguous: (f) => {
    f.metadata.push(structuredClone(f.metadata[0]));
  },
  duplicateField: (f) => {
    f.detail.fields.push(structuredClone(f.detail.fields[0]));
  },
  duplicateMetaField: (f) => {
    f.metadata[0].fields.push(structuredClone(f.metadata[0].fields[0]));
  },
  wrongSpace: (f) => {
    f.detail.dataSpaceName = 'other';
  },
  missingSpace: (f) => {
    delete f.metadata[0].mktDataModelAttributes.dataSpaceName;
  },
  wrongName: (f) => {
    f.metadata[0].fullName = 'Wrong__dlm';
  },
  wrongType: (f) => {
    f.detail.fields[0].type = 'Number';
  },
  wrongMetaType: (f) => {
    f.metadata[0].fields[0].type = 'Number';
  },
  missingKey: (f) => {
    delete f.metadata[0].fields[0].mktDataModelFieldAttributes.primaryIndexOrder;
  },
  falseKey: (f) => {
    f.detail.fields[0].isPrimaryKey = false;
  },
  bounds: (f) => {
    f.detail.fields = Array.from({ length: 4097 }, () => f.detail.fields[0]);
  },
};
for (const [name, change] of Object.entries(inputFailures))
  test(`IR inputs fail closed: ${name}`, async () => {
    await assert.rejects(
      bindIdentityResolutionDependencies(
        document,
        connection,
        selection,
        'default',
        async (apiName) => {
          const f = await inputRead(apiName);
          change(f);
          return f;
        },
      ),
    );
  });

test('IR input match fields require exact Text compatibility, not just keys', async () => {
  await assert.rejects(
    bindIdentityResolutionDependencies(document, connection, selection, 'default', async (name) => {
      const f = await inputRead(name);
      if (f.detail.fields.length > 1) f.detail.fields[1].type = 'Number';
      return f;
    }),
  );
  await assert.rejects(
    bindIdentityResolutionDependencies(document, connection, selection, 'default', async (name) => {
      const f = await inputRead(name);
      f.detail.id = 'same';
      return f;
    }),
  );
});

test('IR outputs resolve twelve target owner-returned names and IDs, not source IDs or suffixes', async () => {
  const proof = await verifyIdentityResolutionOutputs(
    owner,
    outputs,
    connection,
    selection,
    outputRead,
    acquireOwner,
  );
  assert.equal(proof.length, 12);
  assert.deepEqual(
    proof.map((item) => item.targetApiName),
    outputs.map((item) => item.targetApiName),
  );
  assert.equal(new Set(proof.map((item) => item.targetId)).size, 12);
  assert.ok(proof.every((item) => item.targetId.startsWith('target-local-')));
  assert.deepEqual(proof[1].fields, [{ apiName: 'UnifiedRecordId__c', dataType: 'Text' }]);
});

const outputFailures = Object.fromEntries(
  Object.entries(inputFailures).filter(([name]) => !['missingKey', 'falseKey'].includes(name)),
);
for (const [name, change] of Object.entries({
  ...outputFailures,
  wrongCreation: (f) => {
    f.detail.creationType = 'Custom';
  },
  wrongMetadataCreation: (f) => {
    f.metadata[0].mktDataModelAttributes.creationType = 'Custom';
  },
  missingField: (f) => {
    f.detail.fields = [];
  },
}))
  test(`IR generated outputs fail closed: ${name}`, async () => {
    await assert.rejects(
      verifyIdentityResolutionOutputs(
        owner,
        outputs,
        connection,
        selection,
        async (apiName) => {
          const f = await outputRead(apiName);
          change(f);
          return f;
        },
        acquireOwner,
      ),
    );
  });

test('IR output owner/mapping identity drift and bounds block before DMO reads', async () => {
  for (const change of [
    (o) => {
      o.reverse();
    },
    (o) => {
      o.pop();
    },
    (o) => {
      o.push(o[0]);
    },
    (o) => {
      o[0].targetApiName = 'SourceGeneratedName__dlm';
    },
    (o) => {
      o[0].identity.owner.apiName = 'WrongOwner';
    },
    (o) => {
      o[0].identity.entity.dataSpace = 'other';
    },
    (o) => {
      o[1].targetApiName = o[0].targetApiName;
    },
  ]) {
    const changed = structuredClone(outputs);
    change(changed);
    let reads = 0;
    await assert.rejects(
      verifyIdentityResolutionOutputs(
        owner,
        changed,
        connection,
        selection,
        async () => {
          reads++;
          throw new Error('No reads');
        },
        acquireOwner,
      ),
    );
    assert.equal(reads, 0);
  }
  await assert.rejects(
    verifyIdentityResolutionOutputs(
      { ...owner, targetId: 'source-owner-id' },
      outputs,
      connection,
      selection,
      outputRead,
      acquireOwner,
    ),
  );
  await assert.rejects(
    verifyIdentityResolutionOutputs(
      owner,
      outputs,
      connection,
      selection,
      async (name) => {
        const f = await outputRead(name);
        f.detail.id = 'duplicate';
        return f;
      },
      acquireOwner,
    ),
  );
});

test('IR binders reject wrong scope and never default a missing space', async () => {
  await assert.rejects(
    bindIdentityResolutionDependencies(document, connection, selection, undefined, inputRead),
  );
  await assert.rejects(
    bindIdentityResolutionDependencies(
      document,
      connection,
      { ...selection, requested: 'auto' },
      'default',
      inputRead,
    ),
  );
  await assert.rejects(
    verifyIdentityResolutionOutputs(
      { ...owner, dataSpace: undefined },
      outputs,
      connection,
      selection,
      outputRead,
      acquireOwner,
    ),
  );
});

test('IR executor production defaults do not turn missing metadata into permissive success', async () => {
  let mutations = 0;
  const result = await executeIdentityResolutionDeploy(document, connection, selection, 'default', {
    targetApiName: owner.targetApiName,
    allowProcessing: true,
    verifyInput: async () => {},
    acquire: acquireOwner,
    mutate: async () => {
      mutations++;
    },
  });
  assert.equal(result.outcome, 'blocked');
  assert.equal(mutations, 0);
});

test('IR output owner is rechecked after twelve DMO reads to detect concurrent drift', async () => {
  let reads = 0;
  await assert.rejects(
    verifyIdentityResolutionOutputs(owner, outputs, connection, selection, outputRead, async () => {
      const result = await acquireOwner();
      if (reads++ > 0) result.expectations.facade.id = 'changed-owner';
      return result;
    }),
  );
  assert.equal(reads, 2);
});

test('native68 output binding reprojects only the returned owner and preserves independent dependency checks', async () => {
  const raw = nativeIrFixture();
  const nativeProjection = projectNativeIdentityResolution(raw, raw.objectApiName);
  const nativeConnection = { ...connection, getApiVersion: () => '68.0' };
  let owners = 0;
  const acquire = async () => {
    owners++;
    return {
      identity: nativeProjection.candidate.identity,
      ...structuredClone(nativeProjection),
      blockers: [],
    };
  };
  const proof = await verifyIdentityResolutionOutputs(
    owner,
    outputs,
    nativeConnection,
    nativeSelection,
    outputRead,
    acquire,
  );
  assert.equal(proof.length, 12);
  assert.equal(owners, 2);
  await assert.rejects(
    verifyIdentityResolutionOutputs(
      { ...owner, targetId: 'wrong-owner' },
      outputs,
      nativeConnection,
      nativeSelection,
      outputRead,
      acquire,
    ),
  );
  await assert.rejects(
    verifyIdentityResolutionOutputs(
      owner,
      outputs,
      nativeConnection,
      nativeSelection,
      outputRead,
      async () => {
        const result = await acquire();
        result.expectations.native.rulesetId = 'Z9y8';
        return result;
      },
    ),
  );
});

for (const [ownerVersion, dependencyVersion, versionSelection, expanded] of [
  ['67.0', '65.0', selection, false],
  ['68.0', '68.0', nativeSelection, false],
  ['68.0', '68.0', nativeSelection, true],
])
  test(`IR default binding uses core API${dependencyVersion} REST and SOAP without mutating API${ownerVersion} connection (expanded: ${expanded})`, async () => {
    const raw = expandedNativeIrFixture();
    const bindingDocument = expanded
      ? projectNativeIdentityResolution(raw, raw.objectApiName).candidate
      : document;
    const acquisitions = { rest: new Map(), metadata: new Map() };
    const core = Object.create(Connection.prototype);
    Object.assign(core, {
      instanceUrl: 'https://synthetic.example',
      version: ownerVersion,
      accessToken: 'synthetic-token',
      _propagators: [],
      logger: { getRawLogger: () => ({ debug: () => {} }) },
    });
    const initialized = new Connection({
      authInfo: { getUsername: () => 'synthetic' },
      connectionOptions: {
        instanceUrl: core.instanceUrl,
        version: ownerVersion,
        accessToken: 'synthetic-token',
      },
    });
    Object.defineProperty(core, 'metadata', { value: initialized.metadata });
    core.metadata._conn = core;
    let reads = 0;
    const originalMetadata = core.metadata;
    const refresh = {
      isRefreshing: () => assert.fail('refresh consulted'),
      refresh: () => assert.fail('refresh attempted'),
    };
    core._refreshDelegate = refresh;
    core._transport = {
      httpRequest: (request, options) => {
        reads++;
        assert.equal(options.retry.maxRetries, 0);
        assert.throws(() => options.followRedirect(), /failed/u);
        let body;
        let type;
        if (request.method === 'GET') {
          const name = request.url.split('/').at(-1);
          assert.ok(
            request.url.includes(
              `/services/data/v${dependencyVersion}/ssot/${name.endsWith('__dll') ? 'data-lake-objects' : 'data-model-objects'}/`,
            ),
          );
          acquisitions.rest.set(name, (acquisitions.rest.get(name) ?? 0) + 1);
          body = JSON.stringify(
            name.endsWith('__dll')
              ? sourceFixture(name).detail
              : fixture(
                  name,
                  document.spec.reconciliationRules.findIndex(
                    (rule) => rule.entity.apiName === name,
                  ),
                ).detail,
          );
          type = 'application/json';
        } else {
          assert.equal(request.method, 'POST');
          assert.equal(
            request.url,
            `https://synthetic.example/services/Soap/m/${dependencyVersion}`,
          );
          assert.match(request.body, /<readMetadata>/u);
          const name = /<fullNames>([^<]+)<\/fullNames>/u.exec(request.body)[1];
          acquisitions.metadata.set(name, (acquisitions.metadata.get(name) ?? 0) + 1);
          const f = (name.endsWith('__dll') ? sourceFixture(name) : fixture(name)).metadata[0];
          const fieldXml = f.fields
            .map(
              (field) =>
                `<fields><fullName>${field.fullName}</fullName><type>Text</type><mktDataModelFieldAttributes><definitionCreationType>Standard</definitionCreationType>${field.fullName === 'ssot__Id__c' ? '<primaryIndexOrder>1</primaryIndexOrder>' : ''}</mktDataModelFieldAttributes></fields>`,
            )
            .join('');
          body = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><readMetadataResponse xmlns="http://soap.sforce.com/2006/04/metadata"><result><records xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CustomObject"><fullName>${name}</fullName><mktDataModelAttributes><dataSpaceName>default</dataSpaceName></mktDataModelAttributes>${fieldXml}</records></result></readMetadataResponse></soapenv:Body></soapenv:Envelope>`;
          type = 'text/xml';
        }
        const pending = Promise.resolve({
          statusCode: 200,
          headers: { 'content-type': type },
          body,
        });
        pending.stream = () => new PassThrough();
        return pending;
      },
    };
    const transport = core._transport;
    const proof = await bindIdentityResolutionDependencies(
      bindingDocument,
      core,
      versionSelection,
      'default',
    );
    assert.match(proof.fingerprint, /^[a-f0-9]{64}$/u);
    const names = bindingDocument.spec.reconciliationRules.map((rule) => rule.entity.apiName);
    if (expanded) {
      names.push('SyntheticLead__dll', 'SyntheticContact__dll');
      assert.equal(
        proof.fingerprint,
        '7445d1276e9003f73c36c2f135fb3f1e4927fee3cc60c33ed78d6afeb9eb3b58',
      );
    }
    for (const acquired of Object.values(acquisitions)) {
      assert.equal(acquired.size, names.length);
      for (const name of names) assert.equal(acquired.get(name), 1);
    }
    assert.equal(reads, names.length * 2);
    assert.equal(core.getApiVersion(), ownerVersion);
    assert.equal(core.metadata, originalMetadata);
    assert.equal(core.metadata._conn, core);
    assert.equal(core._transport, transport);
    assert.equal(core._refreshDelegate, refresh);
  });
