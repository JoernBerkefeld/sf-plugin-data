import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { projectMapping } from '../lib/artifacts/mapping-document.js';
import { retrieveMappingSourceMetadata } from '../lib/transport/project-metadata.js';

// Anonymized retained API65 shape, including the system qualifier absent from XML.
const fields = [
  'Note__c',
  'DataSource__c',
  'DataSourceObject__c',
  'Id__c',
  'InternalOrganization__c',
  'Name__c',
  'KQ_Id__c',
];
const runtime = () => ({
  developerName: 'Probe_map_Probe_123',
  fieldMappings: fields.map((field) => ({
    developerName: `${field}_fieldmap_${field}`,
    sourceFieldDeveloperName: field,
    targetFieldDeveloperName: field,
  })),
  sourceEntityDeveloperName: 'Probe__dll',
  status: 'ACTIVE',
  targetEntityDeveloperName: 'Probe__dlm',
});
const xml = () => `<?xml version="1.0" encoding="UTF-8"?>
<ObjectSourceTargetMap xmlns="http://soap.sforce.com/2006/04/metadata">
<creationType>Custom</creationType>
${fields
  .slice(0, 6)
  .map(
    (field) =>
      `<fieldSourceTargetMaps><creationType>${['Id__c', 'Name__c', 'Note__c'].includes(field) ? 'Custom' : 'System'}</creationType><filterApplied>false</filterApplied><filterOperationType>Equal</filterOperationType><isSourceFormula>false</isSourceFormula><sourceField>Probe__dll.${field}</sourceField><targetField>Probe__dlm.${field}</targetField></fieldSourceTargetMaps>`,
  )
  .join('\n')}
<masterLabel>Probe &amp; mapping</masterLabel><sourceObjectName>Probe__dll</sourceObjectName><targetObjectName>Probe__dlm</targetObjectName>
</ObjectSourceTargetMap>\n`;
const project = (value = runtime(), source = xml()) =>
  projectMapping(value, source, 'Probe_map_Probe_123');

test('retained six XML/seven runtime shape preserves every pair and exact input digest', () => {
  const result = project();
  assert.equal(result.spec.metadataPairs.length, 6);
  assert.equal(result.spec.pairs.length, 7);
  assert.deepEqual(result.spec.runtimeOnlyPairs, [
    {
      developerName: 'KQ_Id__c_fieldmap_KQ_Id__c',
      sourceField: 'KQ_Id__c',
      targetField: 'KQ_Id__c',
    },
  ]);
  assert.ok(result.spec.pairs.some((pair) => pair.sourceField === 'Id__c'));
  assert.equal(result.spec.displayName, 'Probe & mapping');
  assert.equal(result.spec.definitionDigest, createHash('sha256').update(xml()).digest('hex'));
  assert.notEqual(
    project(runtime(), xml() + '\n').spec.definitionDigest,
    result.spec.definitionDigest,
  );
  const original = runtime();
  const detached = project(original);
  original.fieldMappings[0].sourceFieldDeveloperName = 'Changed__c';
  assert.equal(detached.spec.pairs[0].sourceField, 'Note__c');
});

test('runtime-only pairs are explicit preservation requirements, never guessed generated qualifiers', () => {
  const value = runtime();
  value.fieldMappings[6] = {
    developerName: 'OtherPair',
    sourceFieldDeveloperName: 'Extra__c',
    targetFieldDeveloperName: 'Other__c',
  };
  assert.deepEqual(project(value).spec.runtimeOnlyPairs, [
    { developerName: 'OtherPair', sourceField: 'Extra__c', targetField: 'Other__c' },
  ]);
});

for (const [label, change] of Object.entries({
  unknown: (value) => {
    value.unknown = true;
  },
  identity: (value) => {
    value.developerName = 'Other';
  },
  inactive: (value) => {
    value.status = 'PROCESSING';
  },
  missing: (value) => {
    delete value.fieldMappings;
  },
  empty: (value) => {
    value.fieldMappings = [];
  },
  duplicate: (value) => {
    value.fieldMappings.push(value.fieldMappings[0]);
  },
  ambiguousSource: (value) => {
    value.fieldMappings[1].sourceFieldDeveloperName = 'Note__c';
  },
  ambiguousTarget: (value) => {
    value.fieldMappings[1].targetFieldDeveloperName = 'Note__c';
  },
  unknownPair: (value) => {
    value.fieldMappings[0].formula = 'x';
  },
  missingXmlPair: (value) => {
    value.fieldMappings.shift();
  },
})) {
  test(`runtime rejects ${label} rather than lossy projection`, () => {
    const value = runtime();
    change(value);
    assert.throws(() => project(value));
  });
}

for (const [label, source] of Object.entries({
  filter: xml().replace('<filterApplied>false', '<filterApplied>true'),
  formula: xml().replace('<isSourceFormula>false', '<isSourceFormula>true'),
  operation: xml().replace('<filterOperationType>Equal', '<filterOperationType>Other'),
  unknown: xml().replace('</ObjectSourceTargetMap>', '<extra>true</extra></ObjectSourceTargetMap>'),
  dtd: '<!DOCTYPE x>' + xml(),
  retarget: xml().replace('Probe__dlm.Note__c', 'Other__dlm.Note__c'),
  duplicate: xml().replace('<masterLabel>', '<creationType>Custom</creationType><masterLabel>'),
  entity: xml().replace('Probe &amp; mapping', 'Probe &unknown; mapping'),
  crlf: xml().replaceAll('\n', '\r\n'),
})) {
  test(`XML rejects ${label}`, () => assert.throws(() => project(runtime(), source)));
}

test('exact standard mapping retrieve uses installed grammar and unchanged terminal receipt contract', async () => {
  let calls = 0;
  const runner = async (arguments_, cwd) => {
    calls++;
    assert.deepEqual(arguments_, [
      'project',
      'retrieve',
      'start',
      '--metadata',
      'ObjectSourceTargetMap:Probe_map_Probe_123',
      '--target-org',
      'source',
      '--api-version',
      '65.0',
      '--wait',
      '5',
      '--json',
    ]);
    const directory = path.join(cwd, 'force-app', 'main', 'default', 'objectSourceTargetMaps');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'Probe_map_Probe_123.objectSourceTargetMap-meta.xml'),
      xml(),
    );
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        status: 0,
        result: {
          done: true,
          success: true,
          status: 'Succeeded',
          files: [
            { type: 'ObjectSourceTargetMap', fullName: 'Probe_map_Probe_123', state: 'Created' },
          ],
        },
      }),
    };
  };
  assert.equal(await retrieveMappingSourceMetadata('source', 'Probe_map_Probe_123', runner), xml());
  assert.equal(calls, 1);
  await assert.rejects(retrieveMappingSourceMetadata('source', '../escape', runner));
  assert.equal(calls, 1);
});

for (const [label, receipt] of Object.entries({
  malformed: { exitCode: 0, stdout: '{}' },
  pending: {
    exitCode: 0,
    stdout: JSON.stringify({
      status: 0,
      result: { done: false, success: true, status: 'Succeeded' },
    }),
  },
  warning: {
    exitCode: 0,
    stdout: JSON.stringify({
      status: 0,
      warnings: ['x'],
      result: { done: true, success: true, status: 'Succeeded' },
    }),
  },
  wrongMember: {
    exitCode: 0,
    stdout: JSON.stringify({
      status: 0,
      result: {
        done: true,
        success: true,
        status: 'Succeeded',
        files: [{ type: 'ObjectSourceTargetMap', fullName: 'Other', state: 'Created' }],
      },
    }),
  },
})) {
  test(`standard mapping retrieve rejects ${label}`, async () => {
    await assert.rejects(
      retrieveMappingSourceMetadata('source', 'Probe_map_Probe_123', async () => receipt),
    );
  });
}
