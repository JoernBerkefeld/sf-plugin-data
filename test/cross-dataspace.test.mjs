import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  customDmosOf,
  translateDmoName,
  translateDocument,
  translateFieldName,
  translateSegmentName,
} from '../lib/services/cross-dataspace-rename.js';
import { dataSpaceDirectory } from '../lib/services/data-space-check.js';
import { planCrossSpaceInputs } from '../lib/services/cross-dataspace-deploy.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
  verifyDloInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeNativeRelationshipDocument } from '../lib/artifacts/write-native-relationship.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import { writeDloDocument } from '../lib/artifacts/write-dlo.js';
import { preflightNativeDmo } from '../lib/services/native-dmo.js';
import { preflightNativeMapping } from '../lib/services/native-mapping.js';
import { preflightNativeRelationship } from '../lib/services/native-relationship.js';
import { preflightNativeDlo } from '../lib/services/native-dlo.js';

// Rename rules between data spaces (live API 68, DB entries data360:dataspace-*-api68).
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
  { name: 'bare' },
];
const failRead = async () => assert.fail('no read');
const to = (target, source = 'default', customDmos) => ({
  source,
  target,
  spaces,
  ...(customDmos ? { customDmos: new Set(customDmos) } : {}),
});

test('DMO names: custom, standard copy and unified outputs, in both directions', () => {
  // Custom DMO: the prefix on, off (with a custom DMO file as evidence) and swapped.
  assert.deepEqual(translateDmoName(to(SPACE), 'Order__dlm'), {
    name: 'ds2_Order__dlm',
    rule: 'dmo-prefix',
    kind: 'custom',
  });
  assert.equal(
    translateDmoName(to('default', SPACE, ['ds2_Order__dlm']), 'ds2_Order__dlm').name,
    'Order__dlm',
  );
  assert.equal(translateDmoName(to('third', SPACE), 'ds2_Order__dlm').name, 'th_Order__dlm');
  // A custom DMO created without the prefix in a non-default data space.
  assert.equal(translateDmoName(to('third', SPACE), 'Plain__dlm').name, 'th_Plain__dlm');
  assert.equal(translateDmoName(to('default', SPACE), 'Plain__dlm').name, 'Plain__dlm');
  // Standard DMO and its copy.
  assert.deepEqual(translateDmoName(to(SPACE), 'ssot__Individual__dlm'), {
    name: 'ds2_Individual__dlm',
    rule: 'standard-copy',
    kind: 'standard',
  });
  assert.equal(
    translateDmoName(to('third', SPACE), 'ds2_Individual__dlm').name,
    'th_Individual__dlm',
  );
  // Identity resolution outputs by rule.
  assert.deepEqual(translateDmoName(to(SPACE), 'UnifiedssotIndividualAb1__dlm'), {
    name: 'ds2_UnifiedIndividualAb1__dlm',
    rule: 'unified-output',
    kind: 'unified',
  });
  assert.equal(
    translateDmoName(to(SPACE), 'UnifiedLinkssotIndividualAb1__dlm').name,
    'ds2_UnifiedLinkIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedIndividualAb1__dlm').name,
    'UnifiedssotIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedLinkIndividualAb1__dlm').name,
    'UnifiedLinkssotIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('third', SPACE), 'ds2_UnifiedIndividualAb1__dlm').name,
    'th_UnifiedIndividualAb1__dlm',
  );
});

test('DMO names the rules cannot place are reported, never guessed', () => {
  // Towards default a prefixed name can be a standard copy or a custom DMO.
  assert.match(
    translateDmoName(to('default', SPACE), 'ds2_Order__dlm').reason,
    /either the standard DMO/u,
  );
  assert.match(translateDmoName(to(SPACE), 'ns__Thing__dlm').reason, /packaged/u);
  assert.match(
    translateDmoName(to(SPACE), 'UnifiedIndividual__dlm').reason,
    /identity resolution output/u,
  );
  assert.match(
    translateDmoName(to(SPACE), 'IndividualIdentityLink__dlm').reason,
    /identity resolution output/u,
  );
  assert.match(
    translateDmoName(to(SPACE), 'ds2_Order__dlm').reason,
    /already carries the prefix of the data space dataspace2/u,
  );
  assert.match(
    translateDmoName(to('third', SPACE), 'th_Order__dlm').reason,
    /prefix of the data space third/u,
  );
  assert.match(translateDmoName(to('bare'), 'Order__dlm').reason, /names no prefix for bare/u);
  assert.match(translateDmoName(to(SPACE), 'Order__dll').reason, /not a DMO name/u);
});

test('field names follow the ssot__ rule; KQ_ and link fields keep their names', () => {
  assert.deepEqual(translateFieldName(to(SPACE), 'standard', 'ssot__FirstName__c'), {
    name: 'FirstName__c',
    rule: 'field-ssot',
  });
  assert.deepEqual(translateFieldName(to(SPACE), 'standard', 'KQ_Id__c'), { name: 'KQ_Id__c' });
  assert.deepEqual(translateFieldName(to(SPACE), 'custom', 'Total__c'), { name: 'Total__c' });
  // Towards default a unified output gets ssot__ back, except its link fields.
  assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', 'FirstName__c'), {
    name: 'ssot__FirstName__c',
    rule: 'field-ssot',
  });
  // Already spelled with ssot__: no second ssot__.
  assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', 'ssot__FirstName__c'), {
    name: 'ssot__FirstName__c',
  });
  for (const kept of ['UnifiedRecordId__c', 'SourceRecordId__c', 'KQ_SourceRecordId__c'])
    assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', kept), { name: kept });
  assert.deepEqual(translateFieldName(to('default', SPACE), 'custom', 'Total__c'), {
    name: 'Total__c',
  });
  assert.deepEqual(translateFieldName(to('third', SPACE), 'prefixed', 'FirstName__c'), {
    name: 'FirstName__c',
  });
});

test('segment names get, lose or swap the prefix', () => {
  assert.equal(translateSegmentName(to(SPACE), 'Audience').name, 'ds2_Audience');
  assert.equal(translateSegmentName(to('default', SPACE), 'ds2_Audience').name, 'Audience');
  assert.equal(translateSegmentName(to('third', SPACE), 'ds2_Audience').name, 'th_Audience');
  assert.match(translateSegmentName(to('default', SPACE), 'Audience').reason, /ds2_<Name>/u);
  assert.match(translateSegmentName(to(SPACE), 'th_Audience').reason, /data space third/u);
});

const dmoFile = (apiName = 'CliOrder__dlm', space = 'default', fields) => ({
  schemaVersion: 1,
  kind: 'dmo',
  c__dataSpace: space,
  identity: { apiName },
  spec: {
    label: 'Cli Order',
    category: 'Other',
    fields: fields ?? [
      { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, creationType: 'Custom' },
      {
        name: 'Name__c',
        label: 'Name',
        dataType: 'Text',
        isPrimaryKey: false,
        creationType: 'Custom',
      },
    ],
  },
});
const segmentFile = (overrides = {}) => ({
  schemaVersion: 1,
  kind: 'segment',
  c__dataSpace: 'default',
  identity: { apiName: 'CliAudience' },
  spec: {
    displayName: 'Cli Audience',
    description: 'Probe',
    segmentType: 'UI',
    segmentOn: { kind: 'dmo', apiName: 'CliOrder__dlm' },
    includeCriteria: {
      type: 'LogicalComparison',
      operator: 'and',
      filters: [
        {
          type: 'TextComparison',
          subject: { objectApiName: 'CliOrder__dlm', fieldApiName: 'Name__c' },
          operator: 'equal',
          values: ['Keep__c'],
        },
        {
          type: 'TextComparison',
          subject: { objectApiName: 'ssot__Individual__dlm', fieldApiName: 'ssot__FirstName__c' },
          path: [{ objectApiName: 'ssot__Individual__dlm', fieldApiName: 'KQ_Id__c' }],
          operator: 'equal',
          values: ['x'],
        },
      ],
    },
    lookbackPeriod: 'P90D',
  },
  ...overrides,
});
const mappingFile = (target = 'ssot__Individual__dlm') => ({
  schemaVersion: 1,
  kind: 'mapping',
  c__dataSpace: 'default',
  identity: { apiName: 'Source_Map' },
  spec: {
    sourceEntityDeveloperName: 'CliSource__dll',
    targetEntityDeveloperName: target,
    fieldMappings: [
      { sourceFieldDeveloperName: 'ssot__Keep__c', targetFieldDeveloperName: 'ssot__FirstName__c' },
      { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'KQ_Id__c' },
    ],
  },
});
const dloFile = (spaces = ['default']) => ({
  schemaVersion: 1,
  kind: 'dlo',
  c__dataSpace: spaces,
  identity: { apiName: 'CliSource__dll' },
  spec: {
    label: 'Cli Source',
    category: 'Other',
    fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
  },
});

test('translateDocument: DMO, mapping, relationship and DLO', () => {
  const dmo = translateDocument(dmoFile(), to(SPACE));
  assert.equal(dmo.document.identity.apiName, 'ds2_CliOrder__dlm');
  assert.equal(dmo.document.c__dataSpace, SPACE);
  assert.deepEqual(dmo.rewrites, [
    { at: 'c__dataSpace', from: 'default', to: SPACE, rule: 'data-space' },
    { at: 'identity.apiName', from: 'CliOrder__dlm', to: 'ds2_CliOrder__dlm', rule: 'dmo-prefix' },
  ]);
  const standard = translateDocument(
    dmoFile('ssot__Individual__dlm', 'default', [
      { name: 'ssot__Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true },
      { name: 'KQ_Id__c', label: 'KQ', dataType: 'Text', isPrimaryKey: false },
    ]),
    to(SPACE),
  );
  assert.deepEqual(
    standard.document.spec.fields.map((field) => field.name),
    ['Id__c', 'KQ_Id__c'],
  );
  assert.deepEqual(standard.rewrites.at(-1), {
    at: 'spec.fields[0].name',
    from: 'ssot__Id__c',
    to: 'Id__c',
    rule: 'field-ssot',
  });
  const mapping = translateDocument(mappingFile(), to(SPACE));
  assert.equal(mapping.document.spec.targetEntityDeveloperName, 'ds2_Individual__dlm');
  // The DLO side and the mapping's own name stay; only target fields follow the rule.
  assert.equal(mapping.document.spec.sourceEntityDeveloperName, 'CliSource__dll');
  assert.equal(mapping.document.identity.apiName, 'Source_Map');
  assert.deepEqual(mapping.document.spec.fieldMappings, [
    { sourceFieldDeveloperName: 'ssot__Keep__c', targetFieldDeveloperName: 'FirstName__c' },
    { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'KQ_Id__c' },
  ]);
  const relationship = translateDocument(
    {
      schemaVersion: 1,
      kind: 'relationship',
      c__dataSpace: 'default',
      identity: { apiName: 'Rel' },
      spec: {
        sourceObjectName: 'CliOrder__dlm',
        sourceFieldName: 'Person__c',
        targetObjectName: 'ssot__Individual__dlm',
        targetFieldName: 'ssot__Id__c',
        cardinality: 'ManyToOne',
        relationshipOwner: 'Source',
      },
    },
    to(SPACE),
  );
  assert.equal(relationship.document.spec.sourceObjectName, 'ds2_CliOrder__dlm');
  assert.equal(relationship.document.spec.sourceFieldName, 'Person__c');
  assert.equal(relationship.document.spec.targetObjectName, 'ds2_Individual__dlm');
  assert.equal(relationship.document.spec.targetFieldName, 'Id__c');
  // A CRM object target has no data space and keeps its names.
  const crm = translateDocument(
    {
      ...relationship.document,
      c__dataSpace: 'default',
      spec: {
        ...relationship.document.spec,
        sourceObjectName: 'CliOrder__dlm',
        targetObjectName: 'Account',
        targetFieldName: 'Id',
      },
    },
    to(SPACE),
  );
  assert.equal(crm.document.spec.targetObjectName, 'Account');
  assert.equal(crm.document.spec.targetFieldName, 'Id');
  const dlo = translateDocument(dloFile(), to(SPACE));
  assert.deepEqual(dlo.document.c__dataSpace, ['default', SPACE]);
  assert.deepEqual(dlo.rewrites, [
    { at: 'c__dataSpace', from: 'default', to: `default, ${SPACE}`, rule: 'dlo-membership' },
  ]);
  assert.equal(dlo.document.identity.apiName, 'CliSource__dll');
});

test('translateDocument: UI criteria names and Waterfall children; compared values stay', () => {
  const ui = translateDocument(segmentFile(), to(SPACE));
  assert.deepEqual(ui.unresolved, []);
  assert.equal(ui.document.identity.apiName, 'ds2_CliAudience');
  assert.equal(ui.document.spec.segmentOn.apiName, 'ds2_CliOrder__dlm');
  const [first, second] = ui.document.spec.includeCriteria.filters;
  assert.deepEqual(first.subject, { objectApiName: 'ds2_CliOrder__dlm', fieldApiName: 'Name__c' });
  assert.deepEqual(first.values, ['Keep__c']);
  assert.deepEqual(second.subject, {
    objectApiName: 'ds2_Individual__dlm',
    fieldApiName: 'FirstName__c',
  });
  assert.deepEqual(second.path, [
    { objectApiName: 'ds2_Individual__dlm', fieldApiName: 'KQ_Id__c' },
  ]);
  assert.ok(
    ui.rewrites.some(
      (rewrite) =>
        rewrite.at === 'spec.includeCriteria.filters[1].subject.fieldApiName' &&
        rewrite.rule === 'field-ssot',
    ),
  );
  // A field without a DMO beside or above it cannot be placed towards a prefix change.
  const orphan = translateDocument(
    segmentFile({
      spec: {
        ...segmentFile().spec,
        includeCriteria: {
          type: 'TextComparison',
          subject: { fieldApiName: 'ssot__FirstName__c' },
        },
      },
    }),
    to(SPACE),
  );
  assert.deepEqual(
    orphan.unresolved.map((entry) => entry.at),
    ['spec.includeCriteria.subject.fieldApiName'],
  );
  const waterfall = translateDocument(
    segmentFile({
      spec: {
        displayName: 'Fall',
        description: '',
        segmentType: 'Waterfall',
        segmentOn: { kind: 'dmo', apiName: 'ssot__Individual__dlm' },
        childSegments: ['First', 'Second'],
      },
    }),
    to(SPACE),
  );
  assert.deepEqual(waterfall.document.spec.childSegments, ['ds2_First', 'ds2_Second']);
  const back = translateDocument(waterfall.document, to('default', SPACE));
  assert.deepEqual(back.document.spec.childSegments, ['First', 'Second']);
  // The segment DMO back in default is a standard copy or a custom DMO: not placed.
  assert.deepEqual(
    back.unresolved.map((entry) => entry.at),
    ['spec.segmentOn.apiName'],
  );
});

test('translateDocument refuses every kind it does not cover yet', () => {
  for (const document of [
    {
      kind: 'data-transform',
      c__dataSpace: 'default',
      definition: { name: 'T', definition: { type: 'SQL' } },
    },
    { kind: 'data-stream', c__dataSpace: ['default'] },
    segmentFile({ spec: { ...segmentFile().spec, segmentType: 'Dynamic' } }),
  ])
    assert.match(
      translateDocument(document, to(SPACE)).unsupported,
      /cannot be (?:translated|deployed)/u,
      String(document.kind),
    );
});

test('a custom DMO file is evidence only with Custom fields and no Standard one', () => {
  assert.deepEqual(
    [
      ...customDmosOf(
        [
          dmoFile('ds2_A__dlm', SPACE),
          dmoFile('ds2_B__dlm', SPACE, [
            {
              name: 'Id__c',
              label: 'Id',
              dataType: 'Text',
              isPrimaryKey: true,
              creationType: 'Standard',
            },
            {
              name: 'X__c',
              label: 'X',
              dataType: 'Text',
              isPrimaryKey: false,
              creationType: 'Custom',
            },
          ]),
          dmoFile('ds2_C__dlm', SPACE, [
            { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true },
          ]),
          // A custom DMO file of another data space is no evidence for this one.
          dmoFile('ds2_D__dlm', 'third'),
        ],
        SPACE,
      ),
    ],
    ['ds2_A__dlm'],
  );
});

test('towards default a custom ds2_Unified DMO keeps its custom translation, not the output rule', () => {
  const custom = translateDmoName(
    to('default', SPACE, ['ds2_UnifiedOrders__dlm']),
    'ds2_UnifiedOrders__dlm',
  );
  assert.deepEqual(custom, { name: 'UnifiedOrders__dlm', rule: 'dmo-prefix', kind: 'custom' });
  // Without the evidence it is an identity resolution output by rule.
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedOrders__dlm').name,
    'UnifiedssotOrders__dlm',
  );
});

test('only DMO files of the translated file own data space are custom DMO evidence', () => {
  const standard = [
    { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, creationType: 'Standard' },
  ];
  const inputs = [
    { path: '/p/data360/dmo/a.json', document: dmoFile('ds2_Shared__dlm', SPACE, standard) },
    // A custom DMO of the same name in another data space says nothing about dataspace2's one.
    { path: '/p/data360/dmo/b.json', document: dmoFile('ds2_Shared__dlm', 'third') },
  ];
  const plan = planCrossSpaceInputs(inputs, 'default', spaces);
  assert.deepEqual(
    plan.files[0].unresolved.map((entry) => entry.at),
    ['identity.apiName'],
  );
  // The same file with dataspace2 evidence of its own is placed.
  const own = planCrossSpaceInputs(
    [{ path: '/p/data360/dmo/a.json', document: dmoFile('ds2_Shared__dlm', SPACE) }],
    'default',
    spaces,
  );
  assert.deepEqual(own.files[0].unresolved, []);
});

test('without the flag a file of another data space is refused and the message names the flag', async () => {
  const sentence = /To deploy it into dataspace2 instead, add --allow-cross-dataspace \(-c\)\./u;
  const never = new Proxy({}, { get: () => failRead });
  await assert.rejects(preflightNativeDmo(dmoFile(), never, SPACE), {
    code: 'DMO_DATASPACE_MISMATCH',
    message: sentence,
  });
  await assert.rejects(preflightNativeMapping(mappingFile(), never, {}, SPACE), {
    code: 'MAPPING_DATASPACE_MISMATCH',
    message: sentence,
  });
  await assert.rejects(
    preflightNativeRelationship(
      {
        schemaVersion: 1,
        kind: 'relationship',
        c__dataSpace: 'default',
        identity: { apiName: 'Rel' },
        spec: {
          sourceObjectName: 'A__dlm',
          sourceFieldName: 'B__c',
          targetObjectName: 'C__dlm',
          targetFieldName: 'D__c',
          cardinality: 'ManyToOne',
          relationshipOwner: 'Source',
        },
      },
      never,
      SPACE,
    ),
    { code: 'UNSUPPORTED_RELATIONSHIP_DATASPACE', message: sentence },
  );
  await assert.rejects(preflightNativeDlo(dloFile(), never, SPACE), {
    code: 'DLO_DATASPACE_MISMATCH',
    message: sentence,
  });
});

/**
 * Deploy files written to a fresh project with synthetic native services.
 * @param {object[]} documents Files to write and select.
 * @param {object} [flags] Flag overrides.
 * @param {(cwd: string) => Promise<void>} [prepare] Runs after the files are written.
 * @param {boolean} [named] Whether the mapping executor reports the org's mapping name.
 * @returns {Promise<object>} Envelope, calls, logs, project root and the files written.
 */
const deploy = async (documents, flags = {}, prepare, named = true) => {
  const calls = [];
  const logs = [];
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-cross-'));
  const files = [];
  for (const document of documents) {
    const writer =
      document.kind === 'dmo'
        ? writeNativeDmoDocument
        : document.kind === 'mapping'
          ? writeNativeMappingDocument
          : document.kind === 'relationship'
            ? writeNativeRelationshipDocument
            : document.kind === 'dlo'
              ? writeDloDocument
              : document.kind === undefined
                ? writeNativeCalculatedInsightDocument
                : writeSegmentDocument;
    const receipt = await writer(document, cwd, false);
    files.push(receipt.path);
  }
  if (prepare) await prepare(cwd);
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({
    flags: {
      preview: false,
      'api-version': 'auto',
      dataspace: SPACE,
      'allow-processing': true,
      'allow-cross-dataspace': true,
      'target-org': {
        getOrgId: () => 'synthetic',
        getUsername: () => 'target',
        getConnection: () => ({ getApiVersion: () => '68.0' }),
      },
      ...flags,
    },
  });
  command.jsonEnabled = () => false;
  command.log = (line) => logs.push(line);
  command.resolveInputs = async () => readDeployInputs({ cwd, sourceDir: files });
  // --changed-since: the Git selection admits exactly these files, as read now.
  command.selectGitInputs = async () => {
    const captured = await readDeployInputs({ cwd, sourceDir: files });
    calls.push('git');
    return {
      paths: files,
      capturedInputs: captured,
      dlos: captured.filter((input) => input.document.kind === 'dlo'),
      segments: captured.filter((input) => input.document.kind === 'segment'),
      provenance: {
        repositoryRoot: cwd,
        requestedRef: 'main',
        referenceCommit: 'a'.repeat(40),
        headCommit: 'b'.repeat(40),
        mergeBase: 'c'.repeat(40),
      },
    };
  };
  command.createSsotSender = () => ({ request: async () => assert.fail('no bound sender') });
  command.createDmoClient = () => ({});
  command.createDloClient = () => ({});
  command.createMappingClient = () => ({});
  command.readPrefixTarget = async (type, name) => {
    calls.push(`read:${type}:${name}`);
    return;
  };
  const record =
    (step) =>
    async (document, ...rest) => {
      calls.push(
        `${step}:${document.kind}:${document.identity.apiName}:${JSON.stringify(document.c__dataSpace)}`,
      );
      // The mapping as Salesforce holds it: its own name and pair selectors, plus a pair it
      // generated (KQ_), never the selectors of the source org's file.
      if (named && step === 'execute' && document.kind === 'mapping')
        rest[5]?.('Org_Mapping_ds2', {
          ...document,
          identity: { apiName: 'Org_Mapping_ds2' },
          spec: {
            sourceEntityDeveloperName: document.spec.sourceEntityDeveloperName,
            targetEntityDeveloperName: document.spec.targetEntityDeveloperName,
            fieldMappings: [
              ...document.spec.fieldMappings.map((pair, index) => ({
                sourceFieldDeveloperName: pair.sourceFieldDeveloperName,
                targetFieldDeveloperName: pair.targetFieldDeveloperName,
                developerName: `OrgPair${index}`,
              })),
              {
                sourceFieldDeveloperName: 'Generated__c',
                targetFieldDeveloperName: 'KQ_Generated__c',
                developerName: 'OrgGenerated',
              },
            ],
          },
        });
      return step === 'preflight'
        ? { family: document.kind, outcome: 'create', target: 'absent', diagnostics: [] }
        : { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
    };
  command.preflightNativeDmo = record('preflight');
  command.executeNativeDmo = record('execute');
  command.preflightMapping = record('preflight');
  command.executeMapping = record('execute');
  command.preflightDlo = record('preflight');
  command.executeDlo = record('execute');
  command.preflightCalculatedInsight = async (native) => {
    calls.push(`preflight:calculated-insight:${native.apiName}:${native.dataSpace}`);
    return { family: 'calculated-insight', outcome: 'create', target: 'absent', diagnostics: [] };
  };
  command.executeCalculatedInsight = async (native) => {
    calls.push(`execute:calculated-insight:${native.apiName}:${native.expression}`);
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  command.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  command.calculatedInsightContext = () => ({ check: () => {} });
  command.captureInput = captureDeployInputDigest;
  command.verifyDloInput = verifyDloInputDigest;
  command.verifySegmentInput = async () => {};
  command.preflightSegment = async (document) => {
    calls.push(`preflight:segment:${document.identity.apiName}:${document.c__dataSpace}`);
    return {
      family: 'segment',
      outcome: 'create',
      target: 'absent',
      absenceProof: 'none',
      diagnostics: [],
      requiredEffects: ['processing'],
    };
  };
  command.executeSegment = async (input) => {
    const document = input.document ?? input;
    calls.push(`execute:segment:${document.identity.apiName}`);
    return { outcome: 'created', mutation: 'confirmed-created', diagnostics: [] };
  };
  const previous = process.exitCode;
  const previousCwd = process.cwd();
  process.chdir(cwd);
  process.exitCode = undefined;
  try {
    const result = await command.run();
    return { result, calls, logs, cwd, files, exitCode: process.exitCode };
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previous;
  }
};

/**
 * Every file below the project's data360 folder, with its content.
 * @param {string} cwd Project root.
 * @returns {Promise<Record<string, string>>} Relative path to content.
 */
const tree = async (cwd) => {
  const found = {};
  const root = path.join(cwd, 'data360');
  for (const folder of await readdir(root))
    for (const file of await readdir(path.join(root, folder)))
      found[`${folder}/${file}`] = await readFile(path.join(root, folder, file), 'utf8');
  return found;
};

const withSpaces = async (body) => {
  const restore = dataSpaceDirectory.read;
  let reads = 0;
  dataSpaceDirectory.read = async () => {
    reads++;
    return spaces;
  };
  try {
    return await body(() => reads);
  } finally {
    dataSpaceDirectory.read = restore;
  }
};

test('--preview -c lists every rewrite and planned copy file and writes nothing', async () =>
  withSpaces(async (reads) => {
    const { result, calls, logs, cwd } = await deploy([dmoFile(), segmentFile()], {
      preview: true,
    });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(reads(), 1);
    assert.deepEqual(Object.keys(await tree(cwd)).toSorted(), [
      'dmo/CliOrder__dlm.dmo-meta.json',
      'segments/CliAudience.segment.json',
    ]);
    assert.ok(calls.includes(`preflight:dmo:ds2_CliOrder__dlm:"${SPACE}"`), calls.join(', '));
    assert.ok(calls.includes(`preflight:segment:ds2_CliAudience:${SPACE}`), calls.join(', '));
    assert.ok(calls.every((call) => !call.startsWith('execute')));
    const { crossDataSpace } = result.result;
    assert.deepEqual(
      crossDataSpace.files.map((file) => [path.basename(file.path), file.from, file.family]),
      [
        ['CliOrder__dlm.dmo-meta.json', 'default', 'dmo'],
        ['CliAudience.segment.json', 'default', 'segment'],
      ],
    );
    assert.deepEqual(
      crossDataSpace.plannedCopies.map((file) => path.relative(cwd, file).replaceAll('\\', '/')),
      [
        'data360/dmo/ds2_CliOrder__dlm.dmo-meta.json',
        'data360/segments/ds2_CliAudience.segment.json',
      ],
    );
    assert.ok(
      logs.includes('  identity.apiName: CliOrder__dlm -> ds2_CliOrder__dlm (dmo-prefix).'),
    );
    assert.ok(
      logs.includes(
        '  spec.includeCriteria.filters[1].subject.fieldApiName: ssot__FirstName__c -> FirstName__c (field-ssot).',
      ),
      logs.join('\n'),
    );
    assert.ok(
      logs.some((line) =>
        /^Planned copy file: data360.dmo.ds2_CliOrder__dlm\.dmo-meta\.json\.$/u.test(line),
      ),
    );
  }));

test('deploy -c writes each copy file after its item deployed; originals never change', async () =>
  withSpaces(async () => {
    const { result, calls, cwd } = await deploy([dmoFile(), segmentFile()]);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(
      calls.filter((call) => call.startsWith('execute')),
      [`execute:dmo:ds2_CliOrder__dlm:"${SPACE}"`, 'execute:segment:ds2_CliAudience'],
    );
    const files = await tree(cwd);
    assert.deepEqual(JSON.parse(files['dmo/CliOrder__dlm.dmo-meta.json']), dmoFile());
    const copy = JSON.parse(files['dmo/ds2_CliOrder__dlm.dmo-meta.json']);
    assert.equal(copy.c__dataSpace, SPACE);
    assert.equal(copy.identity.apiName, 'ds2_CliOrder__dlm');
    const segment = JSON.parse(files['segments/ds2_CliAudience.segment.json']);
    assert.equal(segment.c__dataSpace, SPACE);
    assert.equal(segment.spec.segmentOn.apiName, 'ds2_CliOrder__dlm');
    assert.equal(JSON.parse(files['segments/CliAudience.segment.json']).c__dataSpace, 'default');
    assert.deepEqual(
      result.result.crossDataSpace.copies.map((entry) => entry.outcome),
      ['written', 'written'],
    );
  }));

test('an existing copy path: identical content is reused, other content refuses before any write', async () =>
  withSpaces(async () => {
    const translated = { ...dmoFile('ds2_CliOrder__dlm', SPACE) };
    const same = await deploy([dmoFile()], {}, async (cwd) => {
      await writeNativeDmoDocument(translated, cwd, false);
    });
    assert.equal(same.result.status, 'success', JSON.stringify(same.result.diagnostics));
    assert.deepEqual(same.result.result.crossDataSpace.copies, [
      {
        source: same.files[0],
        path: path.join(same.cwd, 'data360', 'dmo', 'ds2_CliOrder__dlm.dmo-meta.json'),
        outcome: 'unchanged',
      },
    ]);
    const other = await deploy([dmoFile()], {}, async (cwd) => {
      await writeNativeDmoDocument(
        { ...translated, spec: { ...translated.spec, label: 'Other' } },
        cwd,
        false,
      );
    });
    assert.equal(other.result.status, 'blocked');
    assert.equal(other.result.diagnostics.errors[0].code, 'CROSS_DATASPACE_COPY_CONFLICT');
    assert.match(other.result.diagnostics.errors[0].message, /already exists with other content/u);
    assert.deepEqual(other.calls, []);
  }));

test('a DLO gets only the membership change and no copy; a mapping copy takes the name Salesforce returned', async () =>
  withSpaces(async () => {
    const dlo = await deploy([dloFile(), dmoFile('CliTarget__dlm')]);
    assert.equal(dlo.result.status, 'success', JSON.stringify(dlo.result.result.items));
    assert.ok(
      dlo.calls.includes(`execute:dlo:CliSource__dll:["default","${SPACE}"]`),
      dlo.calls.join(', '),
    );
    const parents = await tree(dlo.cwd);
    assert.deepEqual(Object.keys(parents).toSorted(), [
      'dlo/CliSource__dll.dlo-meta.json',
      'dmo/CliTarget__dlm.dmo-meta.json',
      'dmo/ds2_CliTarget__dlm.dmo-meta.json',
    ]);
    assert.deepEqual(JSON.parse(parents['dlo/CliSource__dll.dlo-meta.json']).c__dataSpace, [
      'default',
    ]);
    // The mapping is written after its deploy, under the name Salesforce holds it by.
    const { result, calls, cwd } = await deploy([mappingFile('CliTarget__dlm')]);
    assert.equal(result.status, 'success', JSON.stringify(result.result.items));
    assert.ok(calls.includes(`execute:mapping:Source_Map:"${SPACE}"`), calls.join(', '));
    const files = await tree(cwd);
    assert.deepEqual(Object.keys(files).toSorted(), [
      'mapping/Org_Mapping_ds2.mapping-meta.json',
      'mapping/Source_Map.mapping-meta.json',
    ]);
    const mapping = JSON.parse(files['mapping/Org_Mapping_ds2.mapping-meta.json']);
    assert.equal(mapping.identity.apiName, 'Org_Mapping_ds2');
    assert.equal(mapping.c__dataSpace, SPACE);
    assert.equal(mapping.spec.targetEntityDeveloperName, 'ds2_CliTarget__dlm');
    assert.equal(mapping.spec.sourceEntityDeveloperName, 'CliSource__dll');
    // Without a name from Salesforce no copy is written, and the output says so.
    const unnamed = await deploy([mappingFile('CliTarget__dlm')], {}, undefined, false);
    // The deploy succeeded but its copy file was not written: partial, exit 68.
    assert.equal(unnamed.result.status, 'partial', JSON.stringify(unnamed.result.diagnostics));
    assert.equal(unnamed.exitCode, 68);
    assert.deepEqual(
      unnamed.result.result.crossDataSpace.copies.map((entry) => entry.outcome),
      ['not-written'],
    );
    assert.ok(
      unnamed.result.diagnostics.warnings.some((line) =>
        line.startsWith('Copy file not written for '),
      ),
      JSON.stringify(unnamed.result.diagnostics.warnings),
    );
    // Another file at the copy path: the mapping still deploys, the copy is reported as not written.
    const clash = await deploy([mappingFile('CliTarget__dlm')], {}, async (cwd) => {
      await writeNativeMappingDocument(
        { ...mappingFile('Other__dlm'), identity: { apiName: 'Org_Mapping_ds2' } },
        cwd,
        false,
      );
    });
    assert.equal(clash.result.status, 'partial', JSON.stringify(clash.result.diagnostics));
    assert.equal(clash.exitCode, 68);
    assert.deepEqual(
      clash.result.result.crossDataSpace.copies.map((entry) => entry.outcome),
      ['not-written'],
    );
    assert.ok(
      clash.result.diagnostics.warnings.some((line) =>
        /Copy file not written for .*already exists with other content/u.test(line),
      ),
      JSON.stringify(clash.result.diagnostics.warnings),
    );
  }));

test('under the flag unsupported kinds and unplaceable names refuse the deploy before any write', async () =>
  withSpaces(async () => {
    const foreign = await deploy([
      dmoFile(),
      {
        ...segmentFile(),
        spec: {
          ...segmentFile().spec,
          segmentType: 'Waterfall',
          childSegments: ['th_Child'],
          includeCriteria: undefined,
        },
      },
    ]);
    assert.equal(foreign.result.status, 'blocked');
    assert.equal(foreign.result.diagnostics.errors[0].code, 'CROSS_DATASPACE_UNRESOLVED');
    assert.match(
      foreign.result.diagnostics.errors[0].message,
      /spec\.childSegments\[0\] th_Child/u,
    );
    assert.deepEqual(foreign.calls, []);
    const unresolved = await deploy([dmoFile('ns__Thing__dlm')]);
    assert.equal(unresolved.result.diagnostics.errors[0].code, 'CROSS_DATASPACE_UNRESOLVED');
    assert.ok(
      unresolved.logs.some((line) => /Cannot place identity\.apiName: ns__Thing__dlm/u.test(line)),
    );
    assert.deepEqual(unresolved.calls, []);
  }));

test('a streaming SQL transform or an STL transform with an unknown node is refused as not supported yet', async () =>
  withSpaces(async () => {
    const command = Object.create(Deploy.prototype);
    command.parse = async () => ({
      flags: {
        preview: true,
        'api-version': 'auto',
        dataspace: SPACE,
        'allow-cross-dataspace': true,
        'target-org': { getOrgId: () => 'synthetic', getUsername: () => 'target' },
      },
    });
    command.jsonEnabled = () => true;
    command.log = () => {};
    command.createSsotSender = () => ({ request: async () => assert.fail('no bound sender') });
    for (const document of [
      {
        schemaVersion: 1,
        kind: 'data-transform',
        c__dataSpace: 'default',
        definition: { name: 'T', definition: { type: 'SQL' } },
      },
      {
        schemaVersion: 1,
        kind: 'data-transform',
        c__dataSpace: 'default',
        definition: {
          name: 'T',
          definition: { type: 'STL', nodes: { F: { action: 'extension' } } },
        },
      },
    ]) {
      command.resolveInputs = async () => [{ path: '/project/data360/x/file.json', document }];
      const previous = process.exitCode;
      const result = await command.run();
      process.exitCode = previous;
      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostics.errors[0].code, 'CROSS_DATASPACE_UNSUPPORTED');
      assert.match(
        result.diagnostics.errors[0].message,
        /cannot be translated; only STL and DCSQL|of a kind the translation does not know/u,
      );
    }
  }));

test('the flag in a selection of the run data space changes nothing and reads nothing extra', async () => {
  const restore = dataSpaceDirectory.read;
  let reads = 0;
  dataSpaceDirectory.read = async () => {
    reads++;
    return [{ name: 'default' }];
  };
  try {
    const { result, calls } = await deploy([dmoFile()], { dataspace: 'default' });
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.equal(result.result.crossDataSpace, undefined);
    assert.deepEqual(calls, ['execute:dmo:CliOrder__dlm:"default"']);
    assert.equal(reads, 1);
  } finally {
    dataSpaceDirectory.read = restore;
  }
});

test('a segment file of another data space without the flag names the flag', async () =>
  withSpaces(async () => {
    const { result } = await deploy([segmentFile()], { 'allow-cross-dataspace': false });
    assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_DATASPACE_MISMATCH');
    assert.match(result.diagnostics.errors[0].message, /add --allow-cross-dataspace \(-c\)/u);
  }));

test('--changed-since -c: a DLO, DMO and segment of another data space deploy on the batch route', async () =>
  withSpaces(async () => {
    const { result, calls } = await deploy([dloFile(), dmoFile(), segmentFile()], {
      'changed-since': 'main',
    });
    assert.equal(result.status, 'success', JSON.stringify(result.result.items));
    assert.equal(result.result.selection.changedSince, 'main');
    assert.deepEqual(
      calls.filter((call) => call === 'git' || call.startsWith('execute')).toSorted(),
      [
        `execute:dlo:CliSource__dll:["default","${SPACE}"]`,
        `execute:dmo:ds2_CliOrder__dlm:"${SPACE}"`,
        'execute:segment:ds2_CliAudience',
        'git',
      ],
    );
  }));

test('--changed-since -c: a mapping of another data space deploys on the native route', async () =>
  withSpaces(async () => {
    const { result, calls, cwd } = await deploy([mappingFile('CliTarget__dlm')], {
      'changed-since': 'main',
    });
    assert.equal(result.status, 'success', JSON.stringify(result.result.items));
    assert.deepEqual(
      calls.filter((call) => call === 'git' || call.startsWith('execute')),
      ['git', `execute:mapping:Source_Map:"${SPACE}"`],
    );
    assert.ok('mapping/Org_Mapping_ds2.mapping-meta.json' in (await tree(cwd)));
  }));

test('a mapping copy is the mapping Salesforce holds: its selectors, never the source file ones', async () =>
  withSpaces(async () => {
    const authored = mappingFile('CliTarget__dlm');
    authored.spec.fieldMappings = authored.spec.fieldMappings.map((pair, index) => ({
      ...pair,
      developerName: `SourcePair${index}`,
    }));
    authored.spec.label = 'Cli Map';
    const { result, cwd } = await deploy([authored]);
    assert.equal(result.status, 'success', JSON.stringify(result.result.items));
    const files = await tree(cwd);
    assert.deepEqual(JSON.parse(files['mapping/Org_Mapping_ds2.mapping-meta.json']), {
      schemaVersion: 1,
      kind: 'mapping',
      c__dataSpace: SPACE,
      identity: { apiName: 'Org_Mapping_ds2' },
      spec: {
        sourceEntityDeveloperName: 'CliSource__dll',
        targetEntityDeveloperName: 'ds2_CliTarget__dlm',
        // The generated pair Salesforce added is left out, as retrieve does.
        fieldMappings: [
          {
            sourceFieldDeveloperName: 'ssot__Keep__c',
            targetFieldDeveloperName: 'FirstName__c',
            developerName: 'OrgPair0',
          },
          {
            sourceFieldDeveloperName: 'Id__c',
            targetFieldDeveloperName: 'KQ_Id__c',
            developerName: 'OrgPair1',
          },
        ],
        label: 'Cli Map',
      },
    });
    assert.deepEqual(JSON.parse(files['mapping/Source_Map.mapping-meta.json']), authored);
  }));

const relationshipFile = (overrides) => ({
  schemaVersion: 1,
  kind: 'relationship',
  c__dataSpace: 'default',
  identity: { apiName: 'Rel' },
  spec: {
    sourceObjectName: 'CliOrder__dlm',
    sourceFieldName: 'Person__c',
    targetObjectName: 'ssot__Individual__dlm',
    targetFieldName: 'ssot__Id__c',
    cardinality: 'ManyToOne',
    relationshipOwner: 'Source',
  },
  ...overrides,
});

test('a file selected beside its translated copy is DUPLICATE_IDENTITY before any write', async () =>
  withSpaces(async () => {
    const dmo = await deploy([dmoFile(), dmoFile('ds2_CliOrder__dlm', SPACE)]);
    assert.equal(dmo.result.status, 'blocked');
    assert.equal(dmo.result.diagnostics.errors[0].code, 'DUPLICATE_IDENTITY');
    assert.match(dmo.result.diagnostics.errors[0].message, /CliOrder__dlm\.dmo-meta\.json and /u);
    assert.deepEqual(dmo.calls, []);
    // A mapping copy has the org's name: the same DLO and translated DMO make it the same item.
    const copy = {
      ...mappingFile('ds2_CliTarget__dlm'),
      c__dataSpace: SPACE,
      identity: { apiName: 'Org_Mapping_ds2' },
    };
    copy.spec.fieldMappings = [
      { sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'KQ_Id__c' },
    ];
    const mapping = await deploy([mappingFile('CliTarget__dlm'), copy], { preview: true });
    assert.equal(mapping.result.status, 'blocked');
    assert.equal(mapping.result.diagnostics.errors[0].code, 'DUPLICATE_IDENTITY');
    assert.deepEqual(mapping.calls, []);
    const both = await deploy([
      relationshipFile(),
      relationshipFile({
        c__dataSpace: SPACE,
        identity: { apiName: 'Org_Rel' },
        spec: {
          ...relationshipFile().spec,
          sourceObjectName: 'ds2_CliOrder__dlm',
          targetObjectName: 'ds2_Individual__dlm',
          targetFieldName: 'Id__c',
        },
      }),
    ]);
    assert.equal(both.result.status, 'blocked');
    assert.equal(both.result.diagnostics.errors[0].code, 'DUPLICATE_IDENTITY');
    assert.deepEqual(both.calls, []);
  }));

// Step 3a: a calculated insight (JSON and SQL) and a DBT segment (JSON and a SQL file per model).
const insightFile = (expression) => ({
  apiName: 'CliSpend__cio',
  dataSpace: 'default',
  definitionType: 'CALCULATED_METRIC',
  displayName: 'Cli Spend',
  publishScheduleInterval: 'NOT_SCHEDULED',
  queryDialect: 'ANSI_SQL',
  expression,
});
const dbtSegmentFile = () => ({
  ...segmentFile(),
  identity: { apiName: 'CliSql' },
  spec: {
    displayName: 'Cli SQL',
    description: '',
    segmentType: 'DBT',
    segmentOn: { kind: 'dmo', apiName: 'ssot__Individual__dlm' },
    models: [
      {
        name: 'Audience',
        sql: 'SELECT ssot__Individual__dlm.ssot__Id__c FROM ssot__Individual__dlm',
      },
    ],
    lookbackPeriod: 'P90D',
  },
});

test('--preview -c lists the SQL rewrites of an insight and a DBT segment with file and line', async () =>
  withSpaces(async () => {
    const { result, calls, logs, cwd } = await deploy(
      [
        insightFile('SELECT COUNT(i.ssot__Id__c) AS cnt__c\nFROM ssot__Individual__dlm i'),
        dbtSegmentFile(),
      ],
      { preview: true },
    );
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.ok(
      calls.includes(`preflight:calculated-insight:ds2_CliSpend__cio:${SPACE}`),
      calls.join(','),
    );
    assert.ok(calls.every((call) => !call.startsWith('execute')));
    for (const line of [
      '  CliSpend__cio.calculatedInsight-meta.sql line 1:16: ssot__Id__c -> Id__c (field-ssot).',
      '  CliSpend__cio.calculatedInsight-meta.sql line 2:6: ssot__Individual__dlm -> ds2_Individual__dlm (standard-copy).',
      '  CliSql.segment.Audience.sql line 1:30: ssot__Id__c -> Id__c (field-ssot).',
    ])
      assert.ok(logs.includes(line), `${line}\n${logs.join('\n')}`);
    assert.deepEqual(
      result.result.crossDataSpace.plannedCopies
        .map((file) => path.relative(cwd, file).replaceAll('\\', '/'))
        .toSorted(),
      [
        'data360/calculatedInsights/ds2_CliSpend__cio.calculatedInsight-meta.json',
        'data360/calculatedInsights/ds2_CliSpend__cio.calculatedInsight-meta.sql',
        'data360/segments/ds2_CliSql.segment.Audience.sql',
        'data360/segments/ds2_CliSql.segment.json',
      ],
    );
    assert.equal(Object.keys(await tree(cwd)).length, 4, 'preview writes nothing');
  }));

test('deploy -c sends the translated insight SQL and writes its JSON and SQL copy files', async () =>
  withSpaces(async () => {
    const { result, calls, cwd } = await deploy([
      insightFile('SELECT COUNT(i.ssot__Id__c) AS cnt__c FROM ssot__Individual__dlm i'),
      dbtSegmentFile(),
    ]);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.ok(
      calls.includes(
        'execute:calculated-insight:ds2_CliSpend__cio:SELECT COUNT(i.Id__c) AS cnt__c FROM ds2_Individual__dlm i',
      ),
      calls.join(','),
    );
    const files = await tree(cwd);
    assert.equal(
      files['calculatedInsights/ds2_CliSpend__cio.calculatedInsight-meta.sql'],
      'SELECT COUNT(i.Id__c) AS cnt__c FROM ds2_Individual__dlm i\n',
    );
    assert.equal(
      JSON.parse(files['calculatedInsights/ds2_CliSpend__cio.calculatedInsight-meta.json'])
        .c__dataSpace,
      SPACE,
    );
    assert.equal(
      files['calculatedInsights/CliSpend__cio.calculatedInsight-meta.sql'],
      'SELECT COUNT(i.ssot__Id__c) AS cnt__c FROM ssot__Individual__dlm i\n',
      'the original is not changed',
    );
    assert.equal(
      files['segments/ds2_CliSql.segment.Audience.sql'],
      'SELECT ds2_Individual__dlm.Id__c FROM ds2_Individual__dlm',
    );
  }));

test('an insight whose SQL holds a name it cannot place is refused before any write', async () =>
  withSpaces(async () => {
    const { result, calls } = await deploy([
      insightFile('SELECT COUNT(x.ssot__Id__c) AS cnt__c FROM ssot__Individual__dlm i'),
    ]);
    assert.equal(result.diagnostics.errors[0].code, 'CROSS_DATASPACE_UNRESOLVED');
    assert.match(
      result.diagnostics.errors[0].message,
      /CliSpend__cio\.calculatedInsight-meta\.sql line 1:16 ssot__Id__c/u,
    );
    assert.deepEqual(calls, []);
  }));

test('an insight file of another data space without the flag names the flag', async () =>
  withSpaces(async () => {
    const { result } = await deploy([insightFile('SELECT 1 AS one__c')], {
      'allow-cross-dataspace': false,
    });
    assert.equal(result.diagnostics.errors[0].code, 'CI_DATASPACE_MISMATCH');
    assert.match(result.diagnostics.errors[0].message, /add --allow-cross-dataspace \(-c\)/u);
  }));

// SQL Salesforce accepts but fails a few minutes after publish (live API 68, DB entry
// data360:ci-sql-alias-without-as-api68): a warning per finding, and the deploy goes ahead.
const sqlFile = path.join(
  'data360',
  'calculatedInsights',
  'CliSpend__cio.calculatedInsight-meta.sql',
);
const silent = (result) =>
  result.diagnostics.warnings.filter((line) => line.startsWith('CI_SQL_FAILS_SILENTLY: '));

test('--preview -c warns about classic insight SQL that fails silently, at the authored file position', async () =>
  withSpaces(async () => {
    const { result, calls, logs } = await deploy(
      [
        insightFile(
          '-- spend\nSELECT COUNT(i.ssot__Id__c) AS cnt__c\nFROM ssot__Individual__dlm i',
        ),
      ],
      { preview: true },
    );
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.ok(calls.includes(`preflight:calculated-insight:ds2_CliSpend__cio:${SPACE}`));
    const warnings = silent(result);
    assert.equal(warnings.length, 2, JSON.stringify(warnings));
    assert.ok(warnings[0].startsWith(`CI_SQL_FAILS_SILENTLY: ${sqlFile} line 1:1: a -- comment`));
    assert.ok(
      warnings[1].startsWith(
        `CI_SQL_FAILS_SILENTLY: ${sqlFile} line 3:28: the table alias i of ssot__Individual__dlm`,
      ),
    );
    for (const warning of warnings)
      assert.ok(logs.includes(`Warning: ${warning}`), logs.join('\n'));
  }));

/**
 * An insight file of the run's data space, so no translation happens.
 * @param {string} expression SQL.
 * @param {string} [queryDialect] Dialect; 'none' leaves the key out.
 * @returns {object} Insight document.
 */
const own = (expression, queryDialect = 'ANSI_SQL') => {
  const file = { ...insightFile(expression), apiName: 'ds2_CliSpend__cio', dataSpace: SPACE };
  if (queryDialect === 'none') delete file.queryDialect;
  else file.queryDialect = queryDialect;
  return file;
};

test('deploy without -c warns and still sends the insight; accepted forms and DC_SQL aliases do not warn', async () =>
  withSpaces(async () => {
    const quoted = await deploy(
      [own('SELECT COUNT(ds2_Individual__dlm.Id__c) AS "cnt__c" FROM ds2_Individual__dlm')],
      { 'allow-cross-dataspace': false },
    );
    assert.equal(quoted.result.status, 'success', JSON.stringify(quoted.result.diagnostics));
    assert.ok(
      quoted.calls.some((call) => call.startsWith('execute:calculated-insight:ds2_CliSpend__cio:')),
    );
    assert.equal(silent(quoted.result).length, 1);
    assert.match(silent(quoted.result)[0], /line 1:44: a quoted column alias "cnt__c"/u);
    for (const [expression, dialect] of [
      ['SELECT COUNT(ds2_Individual__dlm.Id__c) cnt__c FROM ds2_Individual__dlm', 'ANSI_SQL'],
      ['SELECT \'x\' lbl__c, COUNT(i.Id__c) AS "cnt__c" FROM ds2_Individual__dlm i', 'DC_SQL'],
      ['-- x\nSELECT 1 AS "a" FROM ds2_Individual__dlm i', 'none'],
    ]) {
      const clean = await deploy([own(expression, dialect)], { 'allow-cross-dataspace': false });
      assert.equal(clean.result.status, 'success', JSON.stringify(clean.result.diagnostics));
      assert.deepEqual(silent(clean.result), [], expression);
      assert.ok(clean.logs.every((line) => !line.includes('CI_SQL_FAILS_SILENTLY')));
    }
  }));
