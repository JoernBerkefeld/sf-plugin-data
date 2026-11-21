import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { translateDocument } from '../lib/services/cross-dataspace-rename.js';
import {
  crossSpaceNeedsRulesets,
  crossSpaceRefusal,
  planCrossSpaceInputs,
  precheckCopyFiles,
  readRulesetEntries,
  writeCopyFile,
} from '../lib/services/cross-dataspace-deploy.js';
import { validateNativeDataGraphDocument } from '../lib/artifacts/native-data-graph-document.js';
import { validateIdentityResolutionDocument } from '../lib/artifacts/identity-resolution-document.js';
import { validateDataTransformDocument } from '../lib/artifacts/data-transform-document.js';
import { nativeDataGraphSpaceMismatch } from '../lib/artifacts/native-data-graph-document.js';
import { identityResolutionSpaceMismatch } from '../lib/artifacts/identity-resolution-document.js';
import { dataTransformSpaceMismatch } from '../lib/artifacts/data-transform-document.js';
import { explanationOf } from '../lib/services/operation-diagnostic.js';

// Data graphs, identity resolution rulesets and STL transforms between data spaces (live API 68,
// DB entries data360:dataspace2-graph-and-unified-fields-api68 and data360:plugin-cross-dataspace-*).
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
];
const to = (target, source = 'default', extra = {}) => ({ source, target, spaces, ...extra });
const unresolvedAt = (result) => result.unresolved.map((entry) => entry.at);

/**
 * A data graph file as retrieve writes it: root ContactPointPhone with a related Individual,
 * generated names included (they are left out by the translation).
 * @param {object} [options] Overrides.
 * @param {string} [options.space] c__dataSpace.
 * @param {string} [options.name] Graph name.
 * @param {string} [options.root] Root DMO.
 * @param {string} [options.child] Related DMO.
 * @param {string} [options.ssot] Field prefix (`ssot__` in default).
 * @returns {object} Graph file.
 */
const graphFile = ({
  space = 'default',
  name = 'CliPhoneGraph',
  root = 'ssot__ContactPointPhone__dlm',
  child = 'ssot__Individual__dlm',
  ssot = 'ssot__',
} = {}) => ({
  schemaVersion: 1,
  kind: 'native-data-graph',
  apiVersion: '68.0',
  c__dataSpace: space,
  definition: {
    name,
    label: 'Phone graph',
    description: 'ssot__ in a description is text',
    dataspaceName: space,
    primaryObjectName: root,
    type: 'NONE',
    idDmoName: `${name}_ID__dlm`,
    valuesDmoName: `${name}_VALUE__dlm`,
    dayZeroTransformDevName: `Dg_${name}_1`,
    sourceObject: {
      name: root,
      devName: `${name}_Root`,
      label: 'Phone',
      jsonPath: '$',
      path: [],
      type: 'standard',
      projectedName: root,
      referenceDeveloperName: 'ContactPointPhone',
      fragmentDMOName: `${name}_FRAGMENT__dlm`,
      recencyCriteria: [],
      filterCriteria: [
        { fieldApiName: `${ssot}TelephoneNumber__c`, operator: 'equals', value: 'x__c' },
      ],
      fields: [
        {
          devName: `${name}_F0`,
          sourceFieldName: `${ssot}Id__c`,
          dataType: 'Text',
          isKeyColumn: true,
          isProjected: true,
          usageTag: 'NONE',
          keyQualifierName: 'KQ_Id__c',
        },
        {
          devName: `${name}_F1`,
          sourceFieldName: `${ssot}TelephoneNumber__c`,
          dataType: 'Text',
          isKeyColumn: false,
          isProjected: true,
          usageTag: 'NONE',
        },
      ],
      relatedObjects: [
        {
          name: child,
          label: 'Individual',
          jsonPath: `$.${child}`,
          path: [
            { devName: 'J0', fieldName: `${ssot}Id__c`, parentFieldName: `${ssot}PartyId__c` },
          ],
          topKFilterCriteria: {
            limit: 5,
            orderCriteria: [{ fieldApiName: `${ssot}Id__c`, sortOrder: 'DESC' }],
          },
          fields: [
            {
              sourceFieldName: `${ssot}FirstName__c`,
              dataType: 'Text',
              isKeyColumn: false,
              isProjected: true,
              usageTag: 'NONE',
            },
          ],
          relatedObjects: [],
        },
      ],
    },
  },
});

test('a data graph is translated completely: root, related objects, fields, joins, criteria', () => {
  const result = translateDocument(graphFile(), to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const d = result.document.definition;
  assert.equal(result.document.c__dataSpace, SPACE);
  assert.equal(d.name, 'ds2_CliPhoneGraph');
  assert.equal(d.dataspaceName, SPACE);
  assert.equal(d.primaryObjectName, 'ds2_ContactPointPhone__dlm');
  // Generated helper names are never written.
  for (const key of ['idDmoName', 'valuesDmoName', 'dayZeroTransformDevName'])
    assert.equal(Object.hasOwn(d, key), false, key);
  const root = d.sourceObject;
  assert.equal(root.name, 'ds2_ContactPointPhone__dlm');
  assert.equal(root.projectedName, 'ds2_ContactPointPhone__dlm');
  assert.equal(Object.hasOwn(root, 'fragmentDMOName'), false);
  assert.equal(Object.hasOwn(root, 'referenceDeveloperName'), false);
  assert.deepEqual(
    root.fields.map((field) => [field.sourceFieldName, field.devName]),
    [
      ['Id__c', undefined],
      ['TelephoneNumber__c', undefined],
    ],
  );
  assert.equal(root.fields[0].keyQualifierName, 'KQ_Id__c');
  assert.deepEqual(root.filterCriteria, [
    { fieldApiName: 'TelephoneNumber__c', operator: 'equals', value: 'x__c' },
  ]);
  const child = root.relatedObjects[0];
  assert.equal(child.name, 'ds2_Individual__dlm');
  assert.equal(child.jsonPath, '$.ds2_Individual__dlm');
  assert.deepEqual(child.path, [{ fieldName: 'Id__c', parentFieldName: 'PartyId__c' }]);
  assert.equal(child.topKFilterCriteria.orderCriteria[0].fieldApiName, 'Id__c');
  assert.equal(child.fields[0].sourceFieldName, 'FirstName__c');
  assert.ok(
    result.rewrites.some(
      (entry) =>
        entry.at === 'definition.idDmoName' &&
        entry.to === '(left out)' &&
        entry.rule === 'generated',
    ),
  );
  // The translated file is still a valid graph file.
  validateNativeDataGraphDocument(result.document);
  assert.doesNotMatch(JSON.stringify({ ...d, description: '' }), /ssot__/u);
});

test('a data graph between two non-default data spaces swaps the prefix, back to default strips it', () => {
  const ds2 = graphFile({
    space: SPACE,
    name: 'ds2_CliPhoneGraph',
    root: 'ds2_CliOrder__dlm',
    child: 'ds2_CliItem__dlm',
    ssot: '',
  });
  const third = translateDocument(ds2, to('third', SPACE));
  assert.deepEqual(third.unresolved, []);
  assert.equal(third.document.definition.name, 'th_CliPhoneGraph');
  assert.equal(third.document.definition.sourceObject.devName, 'th_CliPhoneGraph_Root');
  assert.equal(
    third.document.definition.sourceObject.relatedObjects[0].jsonPath,
    '$.th_CliItem__dlm',
  );
  // Custom DMOs back to default, shown custom by their DMO files.
  const back = translateDocument(
    ds2,
    to('default', SPACE, { customDmos: new Set(['ds2_CliOrder__dlm', 'ds2_CliItem__dlm']) }),
  );
  assert.deepEqual(back.unresolved, []);
  assert.equal(back.document.definition.name, 'CliPhoneGraph');
  assert.equal(back.document.definition.primaryObjectName, 'CliOrder__dlm');
  assert.equal(back.document.definition.sourceObject.devName, 'CliPhoneGraph_Root');
});

test('full coverage: a graph reference the translation does not cover is refused, never left', () => {
  // A deliberately missed reference: a name in a key the translation does not know.
  const missed = graphFile();
  missed.definition.sourceObject.fields[0].fieldRoles = ['ssot__Id__c'];
  const result = translateDocument(missed, to(SPACE));
  assert.deepEqual(unresolvedAt(result), ['definition.sourceObject.fields[0].fieldRoles[0]']);
  assert.match(result.unresolved[0].reason, /still spelled as in default/u);
  // An unknown reference that does not even look like the source spelling.
  const unknown = graphFile();
  unknown.definition.sourceObject.fields[1].fieldRoles = ['Other__c'];
  assert.deepEqual(unresolvedAt(translateDocument(unknown, to(SPACE))), [
    'definition.sourceObject.fields[1].fieldRoles[0]',
  ]);
  // A DMO no rule places: its node, fields and join are not placed, and nothing is sent.
  const namespaced = graphFile({ child: 'ns__Thing__dlm' });
  const refused = translateDocument(namespaced, to(SPACE));
  assert.ok(unresolvedAt(refused).includes('definition.sourceObject.relatedObjects[0].name'));
  const plan = {
    inputs: [],
    files: [{ path: '/p/data360/dataGraphs/g.json', unresolved: refused.unresolved }],
    unsupported: [],
  };
  assert.equal(crossSpaceRefusal(plan, SPACE, (file) => file).code, 'CROSS_DATASPACE_UNRESOLVED');
});

/**
 * The org's ruleset list as readRulesetEntries returns it.
 * @param {Array<[string, string, string]>} entries Name, data space and output suffix per ruleset.
 * @returns {object[]} Ruleset entries.
 */
const rulesets = (entries) =>
  entries.map(([apiName, dataSpace, suffix]) => ({
    apiName,
    dataSpace,
    configurationType: 'individual',
    outputs: ['Individual', 'ContactPointPhone'].map((entity) =>
      dataSpace === 'default'
        ? {
            entity: `ssot__${entity}__dlm`,
            unified: `Unifiedssot${entity}${suffix}__dlm`,
            link: `UnifiedLinkssot${entity}${suffix}__dlm`,
          }
        : {
            entity: `ds2_${entity}__dlm`,
            unified: `ds2_Unified${entity}${suffix}__dlm`,
            link: `ds2_UnifiedLink${entity}${suffix}__dlm`,
          },
    ),
  }));

test('identity resolution outputs are paired from the ruleset list: none, one, two, same deploy', () => {
  const unifiedGraph = () =>
    graphFile({ root: 'UnifiedssotIndividualT1__dlm', child: 'UnifiedLinkssotIndividualT1__dlm' });
  const source = rulesets([['Individual_t1', 'default', 'T1']]);
  // None in the target data space.
  const none = translateDocument(unifiedGraph(), to(SPACE, 'default', { rulesets: source }));
  assert.match(none.unresolved[0].reason, /dataspace2 has no ruleset of the type individual/u);
  // Exactly one: its output for the same entity, from the read.
  const one = translateDocument(
    unifiedGraph(),
    to(SPACE, 'default', {
      rulesets: [...source, ...rulesets([['ds2_Individual_X9', SPACE, 'X9']])],
    }),
  );
  assert.deepEqual(one.unresolved, []);
  assert.equal(one.document.definition.primaryObjectName, 'ds2_UnifiedIndividualX9__dlm');
  assert.equal(
    one.document.definition.sourceObject.relatedObjects[0].name,
    'ds2_UnifiedLinkIndividualX9__dlm',
  );
  assert.ok(one.rewrites.some((entry) => entry.rule === 'ruleset-read'));
  // Two: refused with both names.
  const two = translateDocument(
    unifiedGraph(),
    to(SPACE, 'default', {
      rulesets: [
        ...source,
        ...rulesets([
          ['ds2_Individual_A1', SPACE, 'A1'],
          ['ds2_Individual_B2', SPACE, 'B2'],
        ]),
      ],
    }),
  );
  assert.match(two.unresolved[0].reason, /ds2_Individual_A1, ds2_Individual_B2/u);
  // The ruleset is in the same deploy: its translated outputs by rule (the ruleset ID is kept).
  const same = translateDocument(
    unifiedGraph(),
    to(SPACE, 'default', { rulesets: source, selectedRulesets: new Set(['Individual_t1']) }),
  );
  assert.deepEqual(same.unresolved, []);
  assert.equal(same.document.definition.primaryObjectName, 'ds2_UnifiedIndividualT1__dlm');
  // An output no ruleset of the source lists, and the oldest default ruleset without suffix.
  assert.match(
    translateDocument(
      graphFile({ root: 'UnifiedssotIndividualZz__dlm' }),
      to(SPACE, 'default', { rulesets: source }),
    ).unresolved[0].reason,
    /no identity resolution ruleset of default lists it/u,
  );
  assert.deepEqual(
    unresolvedAt(
      translateDocument(
        graphFile({ root: 'UnifiedIndividual__dlm' }),
        to(SPACE, 'default', { rulesets: source }),
      ),
    ).slice(0, 1),
    ['definition.sourceObject.name'],
  );
});

const input = (document) => ({ path: '/p/data360/dataGraphs/g.native-dataGraph.json', document });

test('the ruleset list is read only when a file names an output; the read is parsed per entry', async () => {
  assert.equal(crossSpaceNeedsRulesets([input(graphFile())], SPACE, spaces), false);
  assert.equal(
    crossSpaceNeedsRulesets(
      [input(graphFile({ root: 'UnifiedssotIndividualT1__dlm' }))],
      SPACE,
      spaces,
    ),
    true,
  );
  // A file of the run's own data space never needs it.
  assert.equal(
    crossSpaceNeedsRulesets(
      [input(graphFile({ space: SPACE, root: 'ds2_UnifiedIndividualT1__dlm' }))],
      SPACE,
      spaces,
    ),
    false,
  );
  const routes = [];
  const read = await readRulesetEntries(async () => ({
    request: async (method, route) => {
      routes.push(`${method} ${route}`);
      return {
        identityResolutions: [
          {
            objectApiName: 'Individual_t1',
            dataSpaceName: 'default',
            configurationType: 'individual',
            reconciliationRules: [
              {
                entityName: 'ssot__Individual__dlm',
                unifiedDmoName: 'UnifiedssotIndividualT1__dlm',
                linkDmoName: 'UnifiedLinkssotIndividualT1__dlm',
              },
            ],
          },
          { objectApiName: 'NoSpace', configurationType: 'individual' },
        ],
      };
    },
  }));
  assert.deepEqual(routes, ['GET /services/data/v68.0/ssot/identity-resolutions']);
  assert.deepEqual(read, [
    {
      apiName: 'Individual_t1',
      dataSpace: 'default',
      configurationType: 'individual',
      outputs: [
        {
          entity: 'ssot__Individual__dlm',
          unified: 'UnifiedssotIndividualT1__dlm',
          link: 'UnifiedLinkssotIndividualT1__dlm',
        },
      ],
    },
  ]);
  await assert.rejects(
    readRulesetEntries(async () => ({ request: async () => ({}) })),
    { code: 'CROSS_DATASPACE_RULESETS_READ_FAILED' },
  );
});

const field = (entity, name) => ({
  kind: 'dmo-field',
  parentApiName: `ssot__${entity}__dlm`,
  apiName: `ssot__${name}__c`,
});
const entity = (name) => ({ kind: 'dmo', apiName: `ssot__${name}__dlm` });

/**
 * A ruleset file of default as retrieve writes it.
 * @returns {object} Ruleset file.
 */
const rulesetFile = () => {
  const owner = { kind: 'identity-resolution', apiName: 'Individual_t1' };
  return {
    schemaVersion: 1,
    kind: 'identity-resolution',
    c__dataSpace: 'default',
    identity: { apiName: 'Individual_t1' },
    spec: {
      configurationType: 'Individual',
      label: 'T1',
      description: '',
      doesRunAutomatically: false,
      isCaseSensitive: false,
      secondaryDmo: entity('Individual'),
      filters: [],
      matchRules: [
        {
          label: 'Rule',
          criteria: [
            {
              field: field('Individual', 'FirstName'),
              matchMethodType: 'Exact',
              caseSensitiveMatch: false,
              shouldMatchOnBlank: false,
            },
          ],
        },
      ],
      reconciliationRules: [
        {
          entity: entity('Individual'),
          ruleType: 'SourceSequence',
          shouldIgnoreEmptyValue: true,
          sources: [{ kind: 'dlo', apiName: 'CliSource__dll' }],
          fields: [
            {
              field: field('Individual', 'LastName'),
              ruleType: 'LastUpdated',
              shouldIgnoreEmptyValue: true,
              sources: [],
            },
          ],
          outputs: [
            { owner, entity: entity('Individual'), role: 'unified' },
            { owner, entity: entity('Individual'), role: 'link' },
          ],
        },
      ],
    },
  };
};

test('an identity resolution ruleset is renamed by rule and its references follow the DMO rules', () => {
  const result = translateDocument(rulesetFile(), to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const { document } = result;
  assert.equal(document.identity.apiName, 'ds2_Individual_t1');
  assert.equal(document.spec.secondaryDmo.apiName, 'ds2_Individual__dlm');
  assert.deepEqual(document.spec.matchRules[0].criteria[0].field, {
    kind: 'dmo-field',
    parentApiName: 'ds2_Individual__dlm',
    apiName: 'FirstName__c',
  });
  const rule = document.spec.reconciliationRules[0];
  assert.equal(rule.entity.apiName, 'ds2_Individual__dlm');
  assert.equal(rule.fields[0].field.apiName, 'LastName__c');
  assert.equal(rule.sources[0].apiName, 'CliSource__dll');
  assert.deepEqual(
    rule.outputs.map((output) => [output.owner.apiName, output.entity.apiName]),
    [
      ['ds2_Individual_t1', 'ds2_Individual__dlm'],
      ['ds2_Individual_t1', 'ds2_Individual__dlm'],
    ],
  );
  validateIdentityResolutionDocument(document);
  // Between two non-default data spaces the prefix is swapped.
  const third = translateDocument(document, to('third', SPACE));
  assert.deepEqual(third.unresolved, []);
  assert.equal(third.document.identity.apiName, 'th_Individual_t1');
  assert.equal(third.document.spec.secondaryDmo.apiName, 'th_Individual__dlm');
  // A ruleset of dataspace2 without its prefix cannot be placed.
  const bare = structuredClone(document);
  bare.identity.apiName = 'Individual_t1';
  assert.equal(unresolvedAt(translateDocument(bare, to('third', SPACE)))[0], 'identity.apiName');
  // A filter that names a field is not covered yet: refused, never left in default spelling.
  const filtered = rulesetFile();
  filtered.spec.filters = [{ fieldName: 'ssot__FirstName__c' }];
  assert.deepEqual(unresolvedAt(translateDocument(filtered, to(SPACE))), [
    'spec.filters[0].fieldName',
  ]);
});

/**
 * An STL transform file on DLOs as retrieve writes it.
 * @param {object} [nodes] Extra nodes.
 * @returns {object} Transform file.
 */
const transformFile = (nodes = {}) => ({
  schemaVersion: 1,
  kind: 'data-transform',
  apiVersion: '68.0',
  c__dataSpace: 'default',
  definition: {
    name: 'CliCopy',
    label: 'Copy',
    type: 'BATCH',
    fullRunFrequency: 'DAILY',
    definition: {
      name: 'CliCopy',
      label: 'Copy',
      type: 'STL',
      version: '68.0',
      nodes: {
        LOAD0: {
          action: 'load',
          parameters: {
            dataset: { name: 'CliSrc__dll', type: 'dataLakeObject' },
            fields: ['Id__c'],
            sampleDetails: { dataspace: 'default', sortBy: [], type: 'TopN' },
          },
          sources: [],
        },
        OUT0: {
          action: 'outputD360',
          parameters: {
            dedupOrder: [],
            name: 'CliOut__dll',
            type: 'dataLakeObject',
            fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
            writeMode: 'OVERWRITE',
          },
          sources: ['LOAD0'],
        },
        ...nodes,
      },
      outputDataObjects: [
        {
          category: 'Other',
          label: 'Out',
          name: 'CliOut__dll',
          type: 'dataLakeObject',
          fields: [
            {
              isPrimaryKey: true,
              keyQualifierField: 'KQ_Id',
              label: 'Id',
              name: 'Id__c',
              type: 'Text',
            },
          ],
        },
      ],
    },
  },
});

test('an STL transform on DLOs gets the prefix, its data space and the sample data space', () => {
  const result = translateDocument(transformFile(), to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const input = result.document.definition;
  assert.equal(input.name, 'ds2_CliCopy');
  assert.equal(input.definition.name, 'ds2_CliCopy');
  // A create outside default needs dataSpaceName.
  assert.equal(input.dataSpaceName, SPACE);
  assert.equal(input.definition.nodes.LOAD0.parameters.sampleDetails.dataspace, SPACE);
  assert.equal(input.definition.nodes.LOAD0.parameters.dataset.name, 'CliSrc__dll');
  assert.equal(input.definition.nodes.OUT0.parameters.name, 'CliOut__dll');
  validateDataTransformDocument(result.document);
  const back = translateDocument(result.document, to('default', SPACE));
  assert.deepEqual(back.unresolved, []);
  assert.equal(back.document.definition.name, 'CliCopy');
  assert.equal(back.document.definition.dataSpaceName, 'default');
});

test('an STL transform on DMOs: load fields, output mappings and join keys by lineage', () => {
  const file = transformFile({
    LOAD1: {
      action: 'load',
      parameters: {
        dataset: { name: 'ssot__Individual__dlm', type: 'dataModelObject' },
        fields: ['ssot__Id__c', 'ssot__FirstName__c'],
        sampleDetails: { dataspace: 'default', sortBy: [], type: 'TopN' },
      },
      sources: [],
    },
    JOIN0: {
      action: 'join',
      parameters: { joinType: 'LEFT', leftKeys: ['Id__c'], rightKeys: ['ssot__Id__c'] },
      sources: ['LOAD0', 'LOAD1'],
    },
    OUT1: {
      action: 'outputD360',
      parameters: {
        name: 'CliPerson__dlm',
        type: 'dataModelObject',
        fieldsMappings: [{ sourceField: 'ssot__FirstName__c', targetField: 'First__c' }],
      },
      sources: ['LOAD1'],
    },
  });
  const result = translateDocument(file, to(SPACE));
  assert.deepEqual(result.unresolved, []);
  const nodes = result.document.definition.definition.nodes;
  assert.equal(nodes.LOAD1.parameters.dataset.name, 'ds2_Individual__dlm');
  assert.deepEqual(nodes.LOAD1.parameters.fields, ['Id__c', 'FirstName__c']);
  assert.deepEqual(nodes.JOIN0.parameters.rightKeys, ['Id__c']);
  assert.equal(nodes.JOIN0.parameters.joinType, 'LEFT');
  assert.equal(nodes.OUT1.parameters.name, 'ds2_CliPerson__dlm');
  assert.deepEqual(nodes.OUT1.parameters.fieldsMappings, [
    { sourceField: 'FirstName__c', targetField: 'First__c' },
  ]);
});

test('an STL transform with an expression node, or a SQL transform, is refused as not supported yet', () => {
  const formula = transformFile({
    CALC0: { action: 'formula', parameters: { expression: 'UPPER(Id__c)' }, sources: ['LOAD0'] },
  });
  assert.match(
    translateDocument(formula, to(SPACE)).unsupported,
    /STL node CALC0 \(formula\).*expressions come in a later step/u,
  );
  const sql = transformFile();
  sql.definition.definition.type = 'DCSQL';
  assert.match(
    translateDocument(sql, to(SPACE)).unsupported,
    /type DCSQL cannot be translated yet/u,
  );
});

test('graph, ruleset and transform copy files are planned before the write and written after', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'sfpd-cross-2b-'));
  const inputs = [
    {
      path: path.join(cwd, 'data360', 'dataGraphs', 'CliPhoneGraph.native-dataGraph.json'),
      document: graphFile(),
    },
    {
      path: path.join(
        cwd,
        'data360',
        'identityResolution',
        'Individual_t1.identityResolution.json',
      ),
      document: rulesetFile(),
    },
    {
      path: path.join(cwd, 'data360', 'dataTransforms', 'CliCopy.dataTransform.json'),
      document: transformFile(),
    },
  ];
  const plan = planCrossSpaceInputs(inputs, SPACE, spaces);
  assert.equal(
    crossSpaceRefusal(plan, SPACE, (file) => file),
    undefined,
  );
  const planned = await precheckCopyFiles(plan.inputs, (file) => file);
  assert.deepEqual(
    planned.map((file) => path.relative(cwd, file).replaceAll('\\', '/')),
    [
      'data360/dataGraphs/ds2_CliPhoneGraph.native-dataGraph.json',
      'data360/identityResolution/ds2_Individual_t1.identityResolution.json',
      'data360/dataTransforms/ds2_CliCopy.dataTransform.json',
    ],
  );
  for (const input of plan.inputs) {
    const copy = await writeCopyFile(input);
    assert.equal(copy.outcome, 'written', JSON.stringify(copy));
  }
  const graph = JSON.parse(await readFile(planned[0], 'utf8'));
  assert.equal(graph.definition.primaryObjectName, 'ds2_ContactPointPhone__dlm');
  assert.equal(Object.hasOwn(graph.definition, 'idDmoName'), false);
  // A second run reuses the identical copies.
  assert.deepEqual(await precheckCopyFiles(plan.inputs, (file) => file), planned);
});

test('without -c the graph, ruleset and STL transform refusals name the flag', () => {
  for (const error of [
    nativeDataGraphSpaceMismatch('G', 'default', SPACE, 'file', true),
    identityResolutionSpaceMismatch('R', 'default', SPACE, 'file', true),
    dataTransformSpaceMismatch('T', 'default', SPACE, true),
  ])
    assert.match(explanationOf(error), /add --allow-cross-dataspace \(-c\)/u);
  assert.doesNotMatch(explanationOf(dataTransformSpaceMismatch('T', 'default', SPACE)), /-c\)/u);
});
