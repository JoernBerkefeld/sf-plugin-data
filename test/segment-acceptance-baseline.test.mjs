import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  admitOriginalOwner,
  compareFinal,
  bindArtifact,
  assertArtifactUnchanged,
} from '../scripts/segment-acceptance-baseline.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const xmlEscape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const expected = () => ({
  apiName: 'Audience',
  dmoApiName: 'Person__dlm',
  fieldApiName: 'Id__c',
  displayName: 'Audience forward',
  description: 'Synthetic acceptance only',
});
const owner = () => ({
  apiName: 'Audience',
  marketSegmentId: 'segment-original',
  marketSegmentDefinitionId: 'definition-original',
  createdBy: { id: 'creator-original' },
  createdDate: '2026-01-01T00:00:00.000Z',
});
const independentAcquire = function independentAcquire() {
  return 'independent raw seam';
};
const installedAcquire = function installedAcquire() {
  return 'installed acquire';
};
const installedProject = function installedProject() {
  return 'installed project';
};
const installedCompare = function installedCompare() {
  return 'installed compare';
};
const proof = () => ({
  runId: 'synthetic-run',
  runStartedAt: '2026-01-03T00:00:00.000Z',
  observedAt: '2026-01-03T00:01:00.000Z',
  now: '2026-01-03T00:02:00.000Z',
  acquisition: {
    implementation: independentAcquire,
    sourcePath: 'F:/Temp/synthetic-run/independent.mjs',
    sourceSha256: sha('independent'),
  },
  installedServices: [installedAcquire, installedProject, installedCompare].map(
    (implementation, index) => ({
      implementation,
      sourcePath: `F:/Temp/synthetic-run/installed/lib/services/service-${index}.js`,
      sourceSha256: sha(`service-${index}`),
    }),
  ),
});
/**
 * Create complete synthetic acceptance evidence.
 * @returns {object} Detached synthetic input.
 */
function raw() {
  const sql =
    'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0 AND Person__dlm.Id__c IS NOT NULL';
  const criteria = xmlEscape(
    `<DbtPipeline xmlns=""><models><model><name>Audience</name><sql>${sql}</sql></model></models></DbtPipeline>`,
  );
  return {
    runtime: {
      segments: [
        {
          ...owner(),
          dataSpace: 'default',
          description: expected().description,
          displayName: expected().displayName,
          includeCriteria: criteria,
          includeDbt: { models: [{ name: 'Audience', sql }] },
          lastModifiedBy: { id: 'editor-forward' },
          lastModifiedDate: '2026-01-02T00:00:00.000Z',
          lastSegmentMemberCount: 0,
          lookbackPeriod: 'P90D',
          parameters: [],
          publishInterval: 'NO_REFRESH',
          segmentMembershipDmo: {
            historyTable: 'PersonHistory__dlm',
            latestTable: 'PersonLatest__dlm',
          },
          segmentOnApiName: 'Person__dlm',
          segmentOnId: 'person-local',
          segmentStatus: 'ACTIVE',
          segmentType: 'DBT',
        },
      ],
    },
    definitionXml: `<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>${criteria}</includeCriteria><masterLabel>Audience forward</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>`,
    dependency: {
      detail: {
        name: 'Person__dlm',
        id: 'person-local',
        dataSpaceName: 'default',
        category: 'PROFILE',
        label: 'Person',
        isSegmentable: true,
        fields: [{ name: 'Id__c', type: 'Text', isPrimaryKey: true, label: 'Person identifier' }],
      },
      metadata: [
        {
          fullName: 'Person__dlm',
          label: 'Person',
          mktDataModelAttributes: { dataSpaceName: 'default', isSegmentable: 'true' },
          fields: [
            {
              fullName: 'Id__c',
              type: 'Text',
              label: 'Person identifier',
              mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
            },
          ],
        },
      ],
    },
    bindings: [
      {
        identity: { kind: 'dmo', dataSpace: 'default', apiName: 'Person__dlm' },
        targetId: 'person-local',
        fields: [{ apiName: 'Id__c', dataType: 'Text', isPrimaryKey: true }],
      },
    ],
  };
}
const admit = (value = raw(), evidence = proof()) =>
  admitOriginalOwner(owner(), value, expected(), evidence);

test('independent original-owner baseline is detached, immutable and opaque; live proof remains false', () => {
  const input = raw();
  const baseline = admit(input);
  assert.equal(baseline.liveAcquisitionProven, false);
  assert.ok(Object.isFrozen(baseline.raw.dependency.metadata[0].fields[0]));
  input.runtime.segments[0].description = 'changed caller input';
  assert.equal(baseline.raw.runtime.segments[0].description, expected().description);
  const finalProof = proof();
  finalProof.observedAt = '2026-01-03T00:01:30.000Z';
  const result = compareFinal(baseline, raw(), finalProof);
  assert.equal(result.equal, true);
  assert.equal(result.liveAcquisitionProven, false);
  assert.throws(() => compareFinal(structuredClone(baseline), raw(), proof()));
});

test('all raw runtime fields are required, unknown configuration is refused, ownership correlates', () => {
  for (const key of Object.keys(raw().runtime.segments[0])) {
    const value = raw();
    delete value.runtime.segments[0][key];
    assert.throws(() => admit(value), key);
  }
  for (const key of Object.keys(owner())) {
    const original = owner();
    original[key] = key === 'createdBy' ? { id: 'replacement' } : 'replacement';
    assert.throws(() => admitOriginalOwner(original, raw(), expected(), proof()), key);
  }
  const mutations = [
    (v) => {
      v.runtime.segments[0].unknown = true;
    },
    (v) => {
      v.runtime.extra = [];
    },
    (v) => {
      v.runtime.segments.push(v.runtime.segments[0]);
    },
    (v) => {
      v.runtime.segments[0].createdBy.extra = true;
    },
    (v) => {
      v.runtime.segments[0].segmentMembershipDmo.extra = 'unknown';
    },
    (v) => {
      v.runtime.segments[0].segmentStatus = 'PROCESSING';
    },
    (v) => {
      v.runtime.segments[0].publishInterval = 'DAILY';
    },
    (v) => {
      v.runtime.segments[0].lookbackPeriod = 'P30D';
    },
    (v) => {
      v.runtime.segments[0].lastSegmentMemberCount = 1;
    },
    (v) => {
      v.runtime.segments[0].parameters = [{}];
    },
    (v) => {
      v.runtime.segments[0].includeDbt.models[0].sql =
        'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0';
    },
    (v) => {
      v.runtime.segments[0].includeDbt.models.push(v.runtime.segments[0].includeDbt.models[0]);
    },
    (v) => {
      v.runtime.segments[0].includeDbt.models[0].extra = true;
    },
    (v) => {
      v.runtime.segments[0].displayName = 'stale label';
    },
    (v) => {
      v.runtime.segments[0].lastModifiedDate = '2026-01-04T00:00:00.000Z';
    },
  ];
  for (const mutate of mutations) {
    const value = raw();
    mutate(value);
    assert.throws(() => admit(value));
  }
});

test('bounded redundant criteria and Metadata XML reject mismatches, injection and duplicate leaves', () => {
  const mutations = [
    (v) => {
      v.definitionXml = v.definitionXml.replace('Audience forward', 'other label');
    },
    (v) => {
      v.definitionXml = v.definitionXml.replace(
        '</MarketSegmentDefinition>',
        '<segmentType>DBT</segmentType></MarketSegmentDefinition>',
      );
    },
    (v) => {
      v.definitionXml = `<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]>${v.definitionXml}`;
    },
    (v) => {
      v.definitionXml = v.definitionXml.replace(
        'http://soap.sforce.com/2006/04/metadata',
        'https://invalid.example',
      );
    },
    (v) => {
      v.runtime.segments[0].includeCriteria = v.runtime.segments[0].includeCriteria.replace(
        'IS NOT NULL',
        'IS NULL',
      );
    },
    (v) => {
      v.definitionXml = v.definitionXml.replace('IS NOT NULL', 'IS NULL');
    },
    (v) => {
      v.definitionXml = v.definitionXml.replace('Audience forward', '&unknown;');
    },
  ];
  for (const mutate of mutations) {
    const value = raw();
    mutate(value);
    assert.throws(() => admit(value));
  }
});

test('PROFILE Text PK dependency correlates all raw runtime, Metadata and binding identities', () => {
  const mutations = [
    (v) => {
      v.dependency.detail.id = 'other-local';
    },
    (v) => {
      v.dependency.detail.category = 'OTHER';
    },
    (v) => {
      v.dependency.detail.isSegmentable = false;
    },
    (v) => {
      v.dependency.metadata[0].mktDataModelAttributes.isSegmentable = 'false';
    },
    (v) => {
      v.dependency.metadata[0].fullName = 'Other__dlm';
    },
    (v) => {
      v.dependency.detail.fields[0].type = 'Number';
    },
    (v) => {
      v.dependency.detail.fields[0].isPrimaryKey = false;
    },
    (v) => {
      v.dependency.metadata[0].fields[0].mktDataModelFieldAttributes.primaryIndexOrder = '2';
    },
    (v) => {
      v.dependency.metadata[0].fields.push(v.dependency.metadata[0].fields[0]);
    },
    (v) => {
      v.dependency.detail.fields.push(v.dependency.detail.fields[0]);
    },
    (v) => {
      v.dependency.detail.unknown = true;
    },
    (v) => {
      v.dependency.metadata[0].unknown = true;
    },
    (v) => {
      v.dependency.metadata[0].fields[0].unknown = true;
    },
    (v) => {
      v.bindings[0].targetId = 'other-local';
    },
    (v) => {
      v.dependency.detail.label = 'incorrect';
    },
    (v) => {
      v.dependency.metadata[0].fields[0].label = 'incorrect field label';
    },
    (v) => {
      v.dependency.detail.fields[0].isPrimaryKey = 'true';
    },
    (v) => {
      v.dependency.detail.isEditable = {};
    },
  ];
  for (const mutate of mutations) {
    const value = raw();
    mutate(value);
    assert.throws(() => admit(value));
  }
});

test('every preserved observation and dependency byte/shape drift fails final equality', () => {
  const baseline = admit();
  const mutations = [
    (v) => {
      v.runtime.segments[0].lastModifiedBy.id = 'other-editor';
    },
    (v) => {
      v.runtime.segments[0].segmentMembershipDmo.historyTable = 'OtherHistory__dlm';
    },
    (v) => {
      v.dependency.detail.fields[0].label = 'changed';
    },
    (v) => {
      v.dependency.metadata[0].fields[0].label = 'changed';
    },
    (v) => {
      v.definitionXml += '\n';
    },
    (v) => {
      v.dependency.detail.description = 'new description';
    },
  ];
  for (const mutate of mutations) {
    const value = raw();
    mutate(value);
    const finalProof = proof();
    finalProof.observedAt = '2026-01-03T00:01:30.000Z';
    assert.throws(() => compareFinal(baseline, value, finalProof));
  }
});

test('fresh within-run actual seam identities are required; declarations never establish live acquisition', () => {
  const mutations = [
    (p) => {
      p.observedAt = '2026-01-02T00:00:00.000Z';
    },
    (p) => {
      p.observedAt = '2026-01-04T00:00:00.000Z';
    },
    (p) => {
      p.acquisition.implementation = installedAcquire;
    },
    (p) => {
      p.acquisition.sourcePath = p.installedServices[0].sourcePath;
    },
    (p) => {
      p.acquisition.sourceSha256 = p.installedServices[0].sourceSha256;
    },
    (p) => {
      p.acquisition.implementation = 'independent';
    },
    (p) => {
      p.installedServices = [];
    },
  ];
  for (const mutate of mutations) {
    const evidence = proof();
    mutate(evidence);
    assert.throws(() => admit(raw(), evidence));
  }
  const baseline = admit();
  const laterRun = proof();
  laterRun.runId = 'other-run';
  assert.throws(() => compareFinal(baseline, raw(), laterRun));
  const stale = proof();
  stale.observedAt = '2026-01-03T00:00:30.000Z';
  assert.throws(() => compareFinal(baseline, raw(), stale));
  const clonedSeam = proof();
  clonedSeam.acquisition.implementation = new Function(
    `return (${independentAcquire.toString()})`,
  )();
  assert.throws(() => compareFinal(baseline, raw(), clonedSeam));
});

/**
 *
 * @param {object} packageJson Synthetic package identity.
 * @param {object[]} entries Synthetic additional tar members.
 * @returns {Buffer} Synthetic compressed tar bytes.
 */
function tarball(packageJson, entries = []) {
  const members = [
    { path: 'package.json', bytes: Buffer.from(JSON.stringify(packageJson)) },
    ...entries,
  ];
  const blocks = members.map(({ path, bytes: content }) => {
    const header = Buffer.alloc(512);
    header.write(`package/${path}`);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512)]);
  });
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
/**
 * Create complete synthetic acceptance evidence.
 * @returns {object} Detached synthetic input.
 */
function artifact() {
  const packageIdentity = { name: 'sf-plugin-data', version: '0.1.0' };
  const entries = [
    { path: 'lib/commands/data360/deploy.js', bytes: Buffer.from('synthetic deploy') },
    { path: 'lib/commands/data360/retrieve.js', bytes: Buffer.from('synthetic retrieve') },
  ];
  return {
    manifestBytes: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        files: entries.map(({ path, bytes }) => ({ path, sha256: sha(bytes), size: bytes.length })),
      }),
    ),
    entries,
    tarballBytes: tarball(packageIdentity, entries),
    packageIdentity,
    inventory: [
      {
        ...packageIdentity,
        root: 'F:/Temp/synthetic-install/plugin',
        packageSha256: sha(JSON.stringify(packageIdentity)),
      },
      {
        name: 'other-plugin',
        version: '1.0.0',
        root: 'F:/Temp/synthetic-install/other',
        packageSha256: sha('other'),
      },
    ],
    commandOrigins: Object.fromEntries(
      ['retrieve', 'deploy'].map((command) => [
        command,
        {
          packageRoot: 'F:/Temp/synthetic-install/plugin',
          resolvedPath: `F:/Temp/synthetic-install/plugin/lib/commands/data360/${command}.js`,
          sha256: sha(`synthetic ${command}`),
        },
      ]),
    ),
  };
}

test('artifact immutable binding includes bytes, tar identity, exact inventory and resolved command origins', () => {
  const input = artifact();
  const bound = bindArtifact(input);
  assert.ok(Object.isFrozen(bound.inventory[0]));
  assert.equal(assertArtifactUnchanged(bound, artifact()), true);
  assert.throws(() => assertArtifactUnchanged(structuredClone(bound), artifact()));
  const mutations = [
    (v) => {
      v.entries[0].bytes[0] = 0;
    },
    (v) => {
      v.manifestBytes = Buffer.from(v.manifestBytes.toString() + '\n');
    },
    (v) => {
      v.tarballBytes = tarball({ name: 'wrong-package', version: '0.1.0' });
    },
    (v) => {
      v.inventory.push({
        name: 'extra',
        version: '1.0.0',
        root: 'F:/Temp/synthetic-install/extra',
        packageSha256: sha('extra'),
      });
    },
    (v) => {
      v.inventory.pop();
    },
    (v) => {
      v.inventory[1].version = '2.0.0';
    },
    (v) => {
      v.commandOrigins.retrieve.resolvedPath = 'F:/Temp/elsewhere/retrieve.js';
    },
    (v) => {
      v.commandOrigins.deploy.sha256 = sha('drift');
    },
  ];
  for (const mutate of mutations) {
    const value = artifact();
    mutate(value);
    assert.throws(() => assertArtifactUnchanged(bound, value));
  }
  input.entries[0].bytes[0] = 0;
  assert.equal(assertArtifactUnchanged(bound, artifact()), true);
});

test('artifact admission binds every manifest entry to actual tar member bytes before initial admission', () => {
  for (const command of ['retrieve', 'deploy']) {
    const input = artifact();
    const entryPath = `lib/commands/data360/${command}.js`;
    const missing = input.entries.filter((entry) => entry.path !== entryPath);
    input.tarballBytes = tarball(input.packageIdentity, missing);
    assert.throws(() => bindArtifact(input), `${command} tar member missing`);
    const divergent = artifact();
    const members = divergent.entries.map((entry) => ({
      ...entry,
      bytes: entry.path === entryPath ? Buffer.alloc(entry.bytes.length, 120) : entry.bytes,
    }));
    divergent.tarballBytes = tarball(divergent.packageIdentity, members);
    assert.throws(() => bindArtifact(divergent), `${command} tar bytes mismatch`);
  }
  const additional = artifact();
  additional.entries.push({
    path: 'lib/independent.js',
    bytes: Buffer.from('manifest-only source'),
  });
  additional.manifestBytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      files: additional.entries.map(({ path, bytes }) => ({
        path,
        sha256: sha(bytes),
        size: bytes.length,
      })),
    }),
  );
  assert.throws(() => bindArtifact(additional), 'non-command manifest member missing');
  additional.tarballBytes = tarball(additional.packageIdentity, additional.entries);
  assert.doesNotThrow(() => bindArtifact(additional));
});

test('initial artifact admission refuses every unmanifested member except independently bound package.json', () => {
  for (const extraPath of ['lib/services/extra.js', 'bin/extra', 'README.md', 'package.json.js']) {
    const input = artifact();
    input.tarballBytes = tarball(input.packageIdentity, [
      ...input.entries,
      { path: extraPath, bytes: Buffer.from('unmanifested executable bytes') },
    ]);
    assert.throws(() => bindArtifact(input), extraPath);
  }
  const input = artifact();
  input.tarballBytes = tarball(
    { ...input.packageIdentity, scripts: { preinstall: 'extra' } },
    input.entries,
  );
  assert.throws(() => bindArtifact(input), 'packaging-only exception must match inventory hash');
});

test('complete manifest inventory admits runtime and packaging files without changing binding shape', () => {
  const input = artifact();
  input.entries.push(
    { path: 'lib/services/extra.js', bytes: Buffer.from('manifested executable bytes') },
    { path: 'README.md', bytes: Buffer.from('manifested package documentation') },
    { path: 'package.json', bytes: Buffer.from(JSON.stringify(input.packageIdentity)) },
  );
  input.entries.sort((left, right) => (left.path < right.path ? -1 : 1));
  input.manifestBytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      files: input.entries.map(({ path, bytes }) => ({
        path,
        sha256: sha(bytes),
        size: bytes.length,
      })),
    }),
  );
  input.tarballBytes = tarball(
    input.packageIdentity,
    input.entries.filter((entry) => entry.path !== 'package.json'),
  );
  const binding = bindArtifact(input);
  assert.equal(binding.entries.length, 5);
  assert.deepEqual(
    binding.entries.map((entry) => entry.path),
    input.entries.map((entry) => entry.path),
  );
  assert.equal(assertArtifactUnchanged(binding, input), true);
});

test('artifact admission refuses path escapes, duplicate manifests, malformed tar and package mismatch', () => {
  const mutations = [
    (v) => {
      const manifest = JSON.parse(v.manifestBytes);
      manifest.files[0].path = '../escape';
      v.manifestBytes = Buffer.from(JSON.stringify(manifest));
    },
    (v) => {
      const manifest = JSON.parse(v.manifestBytes);
      manifest.files[1] = manifest.files[0];
      v.manifestBytes = Buffer.from(JSON.stringify(manifest));
    },
    (v) => {
      v.tarballBytes = Buffer.from('not a tarball');
    },
    (v) => {
      v.packageIdentity.version = '9.0.0';
    },
    (v) => {
      v.inventory.push({ ...v.inventory[0] });
    },
  ];
  for (const mutate of mutations) {
    const value = artifact();
    mutate(value);
    assert.throws(() => bindArtifact(value));
  }
});

test('accessors and non-JSON hidden fields are refused without invoking getters', () => {
  const value = raw();
  let accessed = false;
  Object.defineProperty(value.runtime.segments[0], 'apiName', {
    enumerable: true,
    get() {
      accessed = true;
      return 'Audience';
    },
  });
  assert.throws(() => admit(value));
  assert.equal(accessed, false);
  const hidden = raw();
  hidden.dependency.detail[Symbol('hidden')] = true;
  assert.throws(() => admit(hidden));
  const nonenumerable = raw();
  Object.defineProperty(nonenumerable.runtime.segments[0], 'apiName', {
    value: 'Audience',
    enumerable: false,
  });
  assert.throws(() => admit(nonenumerable));
});
