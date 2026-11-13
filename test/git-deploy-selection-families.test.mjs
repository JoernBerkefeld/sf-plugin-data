import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { GitSelectionError, selectGitDeployInputs } from '../lib/artifacts/git-deploy-selection.js';

const execute = promisify(execFile);
const git = async (cwd, ...arguments_) => {
  const { stdout } = await execute('git', arguments_, { cwd, windowsHide: true });
  return stdout.trim();
};
const put = async (cwd, file, value) => {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), typeof value === 'string' ? value : JSON.stringify(value));
};
const commit = async (cwd, ...files) => {
  if (files.length > 0) await git(cwd, 'add', '-A', '--', ...files);
  await git(cwd, 'commit', '-m', 'Synthetic family fixture');
  return git(cwd, 'rev-parse', 'HEAD');
};
const fixture = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-git-families-'));
  await writeFile(path.join(cwd, '.run-owner'), randomUUID());
  await git(cwd, 'init', '--initial-branch=main');
  await git(cwd, 'config', '--local', 'user.name', 'Jörn Berkefeld');
  await git(cwd, 'config', '--local', 'user.email', 'joern.berkefeld@gmail.com');
  await git(cwd, 'config', '--local', 'commit.gpgsign', 'false');
  await git(cwd, 'config', '--local', 'core.autocrlf', 'false');
  await commit(cwd, '.run-owner');
  return cwd;
};
const refusal = (code) => (error) => error instanceof GitSelectionError && error.code === code;

const graphFields = ['ssot__Id__c', 'KQ_Id__c', 'ssot__FirstName__c'];
/** One valid document and canonical path per family newly admitted by Git selection. */
const families = {
  dlo: {
    kind: 'dlo',
    file: 'data360/dlo/Example__dll.dlo-meta.json',
    apiName: 'Example__dll',
    value: {
      schemaVersion: 1,
      kind: 'dlo',
      identity: { dataSpace: 'default', apiName: 'Example__dll' },
      spec: {
        label: 'Example',
        category: 'Other',
        fields: [{ name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true }],
      },
    },
  },
  dmo: {
    kind: 'dmo',
    file: 'data360/dmo/Example__dlm.dmo-meta.json',
    apiName: 'Example__dlm',
    value: {
      schemaVersion: 1,
      kind: 'dmo',
      identity: { dataSpace: 'default', apiName: 'Example__dlm' },
      spec: {
        label: 'Example',
        category: 'Other',
        fields: [
          {
            name: 'Key__c',
            label: 'Key',
            dataType: 'Text',
            isPrimaryKey: true,
            isDynamicLookup: false,
          },
        ],
      },
    },
  },
  mapping: {
    kind: 'mapping',
    file: 'data360/mapping/SourceGenerated.mapping-meta.json',
    apiName: 'SourceGenerated',
    value: {
      schemaVersion: 1,
      kind: 'mapping',
      identity: { dataSpace: 'default', apiName: 'SourceGenerated' },
      spec: {
        sourceEntityDeveloperName: 'Example__dll',
        targetEntityDeveloperName: 'Example__dlm',
        fieldMappings: [{ sourceFieldDeveloperName: 'Id__c', targetFieldDeveloperName: 'Id__c' }],
      },
    },
  },
  relationship: {
    kind: 'relationship',
    file: 'data360/relationship/A_BRef_map_B_Id.relationship-meta.json',
    apiName: 'A_BRef_map_B_Id',
    value: {
      schemaVersion: 1,
      kind: 'relationship',
      identity: { apiName: 'A_BRef_map_B_Id', dataSpace: 'default' },
      spec: {
        sourceObjectName: 'A__dlm',
        sourceFieldName: 'BRef__c',
        targetObjectName: 'B__dlm',
        targetFieldName: 'Id__c',
        cardinality: 'ManyToOne',
        relationshipOwner: 'DataCloud',
      },
    },
  },
  'data-stream': {
    kind: 'data-stream',
    file: 'data360/data-stream/Example_Probe.data-stream-meta.json',
    apiName: 'Example_Probe',
    value: {
      schemaVersion: 1,
      kind: 'data-stream',
      identity: { apiName: 'Example_Probe', dataSpace: 'default' },
      spec: {
        connectorType: 'IngestApi',
        connectionName: 'Example_Connection',
        event: 'ProbeRecord',
        datastreamType: 'INGEST_API',
        refreshMode: 'UPSERT',
        label: 'Example-Probe',
        newDlo: {
          name: 'Example_Probe__dll',
          label: 'Requested stream',
          category: 'Other',
          primaryKey: { name: 'ProbeId', label: 'ProbeId', dataType: 'Text' },
        },
        additiveFieldMappings: [],
      },
    },
  },
  'data-transform': {
    kind: 'data-transform',
    file: 'data360/dataTransforms/SyntheticTransform.dataTransform.json',
    apiName: 'SyntheticTransform',
    value: {
      schemaVersion: 1,
      kind: 'data-transform',
      apiVersion: '68.0',
      definition: {
        name: 'SyntheticTransform',
        label: 'Synthetic transform',
        description: 'Synthetic definition',
        type: 'BATCH',
        dataSpaceName: 'default',
        definition: {
          type: 'STL',
          version: '56.0',
          nodes: {
            LOAD_DATASET0: {
              action: 'load',
              parameters: {
                dataset: { name: 'Source__dll', type: 'dataLakeObject' },
                fields: ['Id__c'],
                sampleDetails: { sortBy: [], type: 'TopN' },
              },
              sources: [],
            },
            OUTPUT0: {
              action: 'outputD360',
              parameters: {
                name: 'Output__dll',
                type: 'dataLakeObject',
                fieldsMappings: [{ sourceField: 'Id__c', targetField: 'Id__c' }],
              },
              sources: ['LOAD_DATASET0'],
            },
          },
        },
      },
    },
  },
  'data-graph': {
    kind: 'native-data-graph',
    file: 'force-app/main/default/data360/dataGraphs/SyntheticGraph.native-dataGraph.json',
    apiName: 'SyntheticGraph',
    value: {
      schemaVersion: 1,
      kind: 'native-data-graph',
      apiVersion: '68.0',
      definition: {
        name: 'SyntheticGraph',
        label: 'Synthetic graph',
        description: '',
        dataspaceName: 'default',
        primaryObjectName: 'ssot__Individual__dlm',
        type: 'NONE',
        sourceObject: {
          name: 'ssot__Individual__dlm',
          devName: 'AuthoredNode',
          label: 'Individual',
          jsonPath: '$',
          path: [],
          type: 'standard',
          relatedObjects: [],
          fields: graphFields.map((sourceFieldName, index) => ({
            devName: `Authored${index}`,
            sourceFieldName,
            dataType: 'Text',
            isKeyColumn: index === 0,
            isProjected: true,
            usageTag: index === 1 ? 'KEY_QUALIFIER' : 'NONE',
          })),
        },
      },
    },
  },
};

for (const [family, { kind, file, value }] of Object.entries(families)) {
  test(`Git selection admits a changed ${family} file with byte capture`, async () => {
    const cwd = await fixture();
    await put(cwd, file, value);
    const selected = await selectGitDeployInputs({ cwd, ref: 'HEAD' });
    const absolute = path.join(cwd, ...file.split('/'));
    assert.deepEqual(selected.paths, [absolute]);
    assert.equal(selected.capturedInputs.length, 1);
    assert.equal(selected.capturedInputs[0].path, absolute);
    assert.equal(selected.capturedInputs[0].document.kind, kind);
    assert.equal(
      selected.capturedInputs[0].inputDigest,
      createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    );
    assert.ok(Object.isFrozen(selected.capturedInputs));
    assert.equal(selected.deletions, undefined);
  });
}

test('an invalid changed data graph refuses the Git selection instead of being dropped', async () => {
  const cwd = await fixture();
  await put(cwd, families['data-graph'].file, { kind: 'native-data-graph' });
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});

test('a changed family file outside its canonical folder refuses the selection', async () => {
  const cwd = await fixture();
  await put(
    cwd,
    'data360/mapping/nested/SourceGenerated.mapping-meta.json',
    families.mapping.value,
  );
  await assert.rejects(
    selectGitDeployInputs({ cwd, ref: 'HEAD' }),
    refusal('INVALID_GIT_SELECTION'),
  );
});

for (const phase of ['committed', 'index']) {
  for (const [family, { kind, file, value, apiName }] of Object.entries(families)) {
    test(`${phase} deletion of a ${family} file is a delete candidate from base content`, async () => {
      const cwd = await fixture();
      await put(cwd, file, value);
      const base = await commit(cwd, file);
      await git(cwd, 'rm', '-q', '--', file);
      if (phase === 'committed') await commit(cwd);
      const selected = await selectGitDeployInputs({ cwd, ref: base });
      assert.deepEqual(selected.paths, []);
      assert.equal(selected.deletions.length, 1);
      const [deletion] = selected.deletions;
      assert.equal(deletion.family, family);
      assert.equal(deletion.path, path.join(cwd, ...file.split('/')));
      assert.deepEqual(deletion.identity, { dataSpace: 'default', apiName });
      assert.equal(
        deletion.baseDigest,
        createHash('sha256').update(JSON.stringify(value)).digest('hex'),
      );
      assert.equal(
        deletion.sourceObjectName,
        family === 'relationship' ? value.spec.sourceObjectName : undefined,
      );
      assert.ok(Object.isFrozen(selected.deletions));
      // The base document travels with the candidate, deeply frozen.
      assert.equal(deletion.document.kind, kind);
      assert.ok(Object.isFrozen(deletion.document));
    });
  }
}

test('a deleted file keeps its base identity beside current changes', async () => {
  const cwd = await fixture();
  await put(cwd, families.relationship.file, families.relationship.value);
  const base = await commit(cwd, families.relationship.file);
  await git(cwd, 'rm', '-q', '--', families.relationship.file);
  await put(cwd, families.dmo.file, families.dmo.value);
  await commit(cwd, families.dmo.file);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(selected.paths, [path.join(cwd, ...families.dmo.file.split('/'))]);
  assert.deepEqual(
    selected.deletions.map((deletion) => [deletion.family, deletion.sourceObjectName]),
    [['relationship', 'A__dlm']],
  );
});

test('an unstaged deletion blocks until it is staged, then is a delete candidate', async () => {
  const cwd = await fixture();
  await put(cwd, families.mapping.file, families.mapping.value);
  const base = await commit(cwd, families.mapping.file);
  await unlink(path.join(cwd, families.mapping.file));
  // Git cannot tell where an unstaged file went (for example an untracked rename target).
  await assert.rejects(selectGitDeployInputs({ cwd, ref: base }), refusal('BLOCKED_GIT_LIFECYCLE'));
  await git(cwd, 'rm', '-q', '--cached', '--', families.mapping.file);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(
    selected.deletions.map((deletion) => deletion.identity.apiName),
    ['SourceGenerated'],
  );
});

for (const phase of ['untracked', 'index']) {
  test(`a path deleted in a commit and re-added (${phase}) is not a delete`, async () => {
    const cwd = await fixture();
    const { file, value } = families.dmo;
    await put(cwd, file, value);
    const base = await commit(cwd, file);
    await git(cwd, 'rm', '-q', '--', file);
    await commit(cwd);
    await put(cwd, file, { ...value, spec: { ...value.spec, label: 'Again' } });
    if (phase === 'index') await git(cwd, 'add', '--', file);
    const selected = await selectGitDeployInputs({ cwd, ref: base });
    assert.deepEqual(selected.paths, [path.join(cwd, ...file.split('/'))]);
    assert.equal(selected.deletions, undefined);
  });
}

test('a file added after the merge base and deleted again is ignored', async () => {
  const cwd = await fixture();
  const base = await git(cwd, 'rev-parse', 'HEAD');
  await put(cwd, families.dmo.file, families.dmo.value);
  await commit(cwd, families.dmo.file);
  await git(cwd, 'rm', '-q', '--', families.dmo.file);
  await commit(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(selected.paths, []);
  assert.equal(selected.deletions, undefined);
});

for (const file of ['data360/unknown/Thing.json', 'data360/default/dmo/Legacy__dlm.json']) {
  test(`deleting ${file} (no known family) blocks the selection`, async () => {
    const cwd = await fixture();
    await put(cwd, file, { kind: 'unknown' });
    const base = await commit(cwd, file);
    await git(cwd, 'rm', '-q', '--', file);
    await commit(cwd);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: base }),
      refusal('BLOCKED_GIT_LIFECYCLE'),
    );
  });
}

test('a deleted file whose base content names another component refuses the selection', async () => {
  const cwd = await fixture();
  const { file, value } = families.mapping;
  await put(cwd, file, { ...value, identity: { ...value.identity, apiName: 'Other' } });
  const base = await commit(cwd, file);
  await git(cwd, 'rm', '-q', '--', file);
  await commit(cwd);
  await assert.rejects(selectGitDeployInputs({ cwd, ref: base }), refusal('INVALID_GIT_SELECTION'));
});

test('an unrelated deleted file outside data360 is ignored', async () => {
  const cwd = await fixture();
  await put(cwd, 'notes.txt', 'before');
  const base = await commit(cwd, 'notes.txt');
  await git(cwd, 'rm', '-q', '--', 'notes.txt');
  await commit(cwd);
  const selected = await selectGitDeployInputs({ cwd, ref: base });
  assert.deepEqual(selected.paths, []);
  assert.equal(selected.deletions, undefined);
});

for (const family of ['mapping', 'data-graph', 'data-stream']) {
  test(`a committed rename of a ${family} file still blocks`, async () => {
    const cwd = await fixture();
    const { file, value } = families[family];
    await put(cwd, file, value);
    const base = await commit(cwd, file);
    const target = file.replace(/\/([^/]+)$/u, '/Renamed$1');
    await rename(path.join(cwd, file), path.join(cwd, target));
    await commit(cwd, file, target);
    await assert.rejects(
      selectGitDeployInputs({ cwd, ref: base }),
      refusal('BLOCKED_GIT_LIFECYCLE'),
    );
  });
}
