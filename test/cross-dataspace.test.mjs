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
import { captureDeployInputDigest, readDeployInputs } from '../lib/artifacts/read-deploy-input.js';
import { writeNativeDmoDocument } from '../lib/artifacts/write-native-dmo.js';
import { writeNativeMappingDocument } from '../lib/artifacts/write-native-mapping.js';
import { writeSegmentDocument } from '../lib/artifacts/write-segment.js';
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
    { kind: 'native-data-graph', c__dataSpace: 'default', definition: { name: 'G' } },
    { kind: 'identity-resolution', c__dataSpace: 'default', identity: { apiName: 'R' } },
    { kind: 'data-transform', c__dataSpace: 'default', definition: { name: 'T' } },
    { kind: 'calculated-insight', identity: { dataSpace: 'default', apiName: 'C__cio' } },
    { kind: 'data-stream', c__dataSpace: ['default'] },
    segmentFile({ spec: { ...segmentFile().spec, segmentType: 'DBT' } }),
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
      ...customDmosOf([
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
      ]),
    ],
    ['ds2_A__dlm'],
  );
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
          : document.kind === 'dlo'
            ? writeDloDocument
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
      if (named && step === 'execute' && document.kind === 'mapping') rest[5]?.('Org_Mapping_ds2');
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
  command.captureInput = captureDeployInputDigest;
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
  try {
    return { result: await command.run(), calls, logs, cwd, files };
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
    assert.deepEqual(
      unnamed.result.result.crossDataSpace.copies.map((entry) => entry.outcome),
      ['not-written'],
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

test('a graph, transform or insight file of another data space is refused as not supported yet', async () =>
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
        kind: 'native-data-graph',
        c__dataSpace: 'default',
        definition: { name: 'G' },
      },
      {
        schemaVersion: 1,
        kind: 'data-transform',
        c__dataSpace: 'default',
        definition: { name: 'T' },
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
        /cannot be translated into another data space yet/u,
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
