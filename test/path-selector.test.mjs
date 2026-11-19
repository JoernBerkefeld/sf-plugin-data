import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deleteSelectorFor, selectorForPath } from '../lib/artifacts/path-selector.js';

/** One canonical project-relative path per family, with the selector deploy/retrieve accept. */
const families = [
  ['data360/dmo/Example__dlm.dmo-meta.json', 'dmo', 'Example__dlm'],
  ['data360/dlo/Example__dll.dlo-meta.json', 'dlo', 'Example__dll'],
  ['data360/mapping/SourceGenerated.mapping-meta.json', 'mapping', 'SourceGenerated'],
  [
    'data360/relationship/A_BRef_map_B_Id.relationship-meta.json',
    'relationship',
    'A_BRef_map_B_Id',
  ],
  ['data360/data-stream/Example_Probe.data-stream-meta.json', 'data-stream', 'Example_Probe'],
  ['data360/dataTransforms/Synthetic.dataTransform.json', 'data-transform', 'Synthetic'],
  ['data360/dataGraphs/SyntheticGraph.native-dataGraph.json', 'data-graph', 'SyntheticGraph'],
  [
    'data360/identityResolution/Synthetic_Ruleset.identityResolution.json',
    'identity-resolution',
    'Synthetic_Ruleset',
  ],
  [
    'data360/calculatedInsights/Synthetic__cio.calculatedInsight-meta.json',
    'calculated-insight',
    'Synthetic__cio',
  ],
  ['data360/segments/Synthetic.segment.json', 'segment', 'Synthetic'],
];

for (const [file, kind, name] of families) {
  test(`selectorForPath maps a ${kind} file to its selector`, () => {
    assert.deepEqual(selectorForPath(file), { kind, name, selector: `${kind}:${name}` });
  });
}

test('the SQL siblings of a calculated insight and a segment select their owner', () => {
  assert.deepEqual(
    selectorForPath('data360/calculatedInsights/Synthetic__cio.calculatedInsight-meta.sql'),
    {
      kind: 'calculated-insight',
      name: 'Synthetic__cio',
      selector: 'calculated-insight:Synthetic__cio',
    },
  );
  assert.deepEqual(selectorForPath('data360/segments/Synthetic.segment.Model_1.sql'), {
    kind: 'segment',
    name: 'Synthetic',
    selector: 'segment:Synthetic',
  });
});

for (const file of [
  // Wrong or nested folder.
  'data360/dlo/Example__dlm.dmo-meta.json',
  'data360/mapping/nested/SourceGenerated.mapping-meta.json',
  'force-app/data360/dmo/Example__dlm.dmo-meta.json',
  'data360/segments/nested/Synthetic.segment.Model.sql',
  'data360/dataTransforms/Synthetic__cio.calculatedInsight-meta.sql',
  // Names the family refuses.
  'data360/dmo/Example__dll.dmo-meta.json',
  'data360/dlo/Example.dlo-meta.json',
  'data360/calculatedInsights/Synthetic.calculatedInsight-meta.json',
  'data360/calculatedInsights/Synthetic.calculatedInsight-meta.sql',
  'data360/segments/1Bad.segment.json',
  'data360/segments/Synthetic.segment..sql',
  'data360/mapping/Bad-Name.mapping-meta.json',
  // Suffix in another case is not canonical.
  'data360/dmo/Example__dlm.DMO-meta.json',
  // Not a component file.
  'data360/segments/Synthetic.marketSegmentDefinition-meta.xml',
  'data360/ingestionDlos/Example__dll.ingestionDlo.json',
  'README.md',
  'data360/dmo/',
  '',
  // Only POSIX, project-relative paths are recognised.
  String.raw`data360\dmo\Example__dlm.dmo-meta.json`,
  '/data360/dmo/Example__dlm.dmo-meta.json',
  './data360/dmo/Example__dlm.dmo-meta.json',
  'data360/dmo/../dmo/Example__dlm.dmo-meta.json',
]) {
  test(`selectorForPath returns undefined for ${JSON.stringify(file)}`, () => {
    assert.equal(selectorForPath(file), undefined);
  });
}

test('selectorForPath never throws on a non-string', () => {
  for (const value of [undefined, 42, {}, ['data360']])
    assert.equal(selectorForPath(value), undefined);
});

const relationshipFile = 'data360/relationship/A_BRef_map_B_Id.relationship-meta.json';

test('deleteSelectorFor names the source DMO of a relationship from its spec', () => {
  const text = JSON.stringify({
    schemaVersion: 1,
    kind: 'relationship',
    c__dataSpace: 'default',
    identity: { apiName: 'A_BRef_map_B_Id' },
    spec: { sourceObjectName: 'A__dlm', sourceFieldName: 'BRef__c' },
  });
  assert.equal(deleteSelectorFor(relationshipFile, text), 'relationship:A__dlm:A_BRef_map_B_Id');
});

test('deleteSelectorFor reads the source DMO of a verbatim relationship from its native entry', () => {
  const text = JSON.stringify({
    schemaVersion: 1,
    kind: 'relationship',
    c__dataSpace: 'default',
    identity: { apiName: 'A_BRef_map_B_Id' },
    verbatim: { reason: 'X', native: { sourceObject: { name: 'A__dlm' } } },
  });
  assert.equal(deleteSelectorFor(relationshipFile, text), 'relationship:A__dlm:A_BRef_map_B_Id');
});

for (const [label, text] of [
  ['text that is not JSON', '{ not json'],
  ['an empty text', ''],
  ['JSON null', 'null'],
  ['an array', '[]'],
  ['a missing spec', '{"schemaVersion":1}'],
  ['a missing sourceObjectName', '{"spec":{}}'],
  ['a non-string sourceObjectName', '{"spec":{"sourceObjectName":42}}'],
  ['a source that is not a DMO', '{"spec":{"sourceObjectName":"A__dll"}}'],
  ['a source with a colon', '{"spec":{"sourceObjectName":"X:A__dlm"}}'],
])
  test(`deleteSelectorFor returns undefined for a relationship with ${label}`, () => {
    assert.equal(deleteSelectorFor(relationshipFile, text), undefined);
  });

test('deleteSelectorFor returns the deploy selector of every other family, ignoring the text', () => {
  for (const [file, kind, name] of families.filter(([, kind]) => kind !== 'relationship'))
    assert.equal(deleteSelectorFor(file, 'not json'), `${kind}:${name}`);
  assert.equal(
    deleteSelectorFor('data360/segments/Synthetic.segment.Model_1.sql', ''),
    'segment:Synthetic',
  );
});

test('deleteSelectorFor never throws on an unknown path or non-string input', () => {
  assert.equal(deleteSelectorFor('README.md', '{}'), undefined);
  for (const value of [undefined, 42, {}]) {
    assert.equal(deleteSelectorFor(value, '{}'), undefined);
    assert.equal(deleteSelectorFor(relationshipFile, value), undefined);
  }
});

test('the built path-selector module imports nothing but node:path', async () => {
  const source = await readFile(
    new URL('../lib/artifacts/path-selector.js', import.meta.url),
    'utf8',
  );
  const specifiers = [
    ...source.matchAll(/\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/gu),
  ].map((match) => match[1]);
  assert.deepEqual(specifiers, ['node:path']);
});
