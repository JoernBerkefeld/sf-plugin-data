import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { link, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { retrieveRelationshipSourceMetadata } from '../lib/transport/project-metadata.js';

const name = 'Probe_Parent_relationship';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FieldSrcTrgtRelationship xmlns="http://soap.sforce.com/2006/04/metadata">
  <masterLabel>Probe &amp; parent</masterLabel>
  <relationshipCardinality>ManyToOne</relationshipCardinality>
</FieldSrcTrgtRelationship>
`;
const member = () => ({ type: 'FieldSrcTrgtRelationship', fullName: name, state: 'Created' });
const envelope = () => ({
  status: 0,
  result: { done: true, success: true, status: 'Succeeded', files: [member()] },
});
const receipt = (value = envelope(), exitCode = 0) => ({
  exitCode,
  stdout: JSON.stringify(value),
});
const output = (cwd) =>
  path.join(
    cwd,
    'force-app',
    'main',
    'default',
    'fieldSrcTrgtRelationships',
    `${name}.fieldSrcTrgtRelationship-meta.xml`,
  );

/**
 * Create the exact synthetic runner output inside its owned scratch project.
 * @param {string} cwd Run-owned project directory.
 * @returns {Promise<string>} Registered fixture output path, retained without cleanup.
 */
async function writeOutput(cwd) {
  const file = output(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, xml, { flag: 'wx' });
  return file;
}

// The only invoked operation is standard retrieve; no org connection or deploy seam exists.
test('relationship source retrieve uses exact API65 arguments and returns unchanged XML', async () => {
  let calls = 0;
  const runner = async (arguments_, cwd) => {
    calls++;
    assert.deepEqual(arguments_, [
      'project',
      'retrieve',
      'start',
      '--metadata',
      `FieldSrcTrgtRelationship:${name}`,
      '--target-org',
      'source',
      '--api-version',
      '65.0',
      '--wait',
      '5',
      '--json',
    ]);
    assert.equal(path.dirname(cwd), os.tmpdir());
    assert.match(await readFile(path.join(cwd, 'ownership'), 'utf8'), /^[\da-f-]{36}$/u);
    assert.deepEqual(JSON.parse(await readFile(path.join(cwd, 'sfdx-project.json'), 'utf8')), {
      packageDirectories: [{ path: 'force-app', default: true }],
      namespace: '',
      sourceApiVersion: '65.0',
    });
    await writeOutput(cwd);
    return receipt();
  };
  assert.equal(await retrieveRelationshipSourceMetadata('source', name, runner), xml);
  assert.equal(calls, 1);
});

for (const [org, apiName] of [
  ['', name],
  ['--target', name],
  ['source\nother', name],
  ['source', '../escape'],
  ['source', `${name}:Other`],
  ['source', '*'],
]) {
  test(`relationship rejects invalid selection ${JSON.stringify([org, apiName])} before runner`, async () => {
    let calls = 0;
    await assert.rejects(
      retrieveRelationshipSourceMetadata(org, apiName, async () => {
        calls++;
        return receipt();
      }),
      { code: 'INVALID_SELECTION' },
    );
    assert.equal(calls, 0);
  });
}

for (const [label, change] of Object.entries({
  failed: (value) => {
    value.result.success = false;
  },
  pending: (value) => {
    value.result.done = false;
  },
  failedStatus: (value) => {
    value.result.status = 'Failed';
  },
  outerFailure: (value) => {
    value.status = 1;
  },
  warning: (value) => {
    value.warnings = ['unconfirmed'];
  },
  message: (value) => {
    value.result.messages = ['unconfirmed'];
  },
  wrongType: (value) => {
    value.result.files[0].type = 'ObjectSourceTargetMap';
  },
  wrongIdentity: (value) => {
    value.result.files[0].fullName = 'Other';
  },
  wrongState: (value) => {
    value.result.files[0].state = 'Changed';
  },
  multiple: (value) => {
    value.result.files.push(member());
  },
  noMembers: (value) => {
    value.result.files = [];
  },
})) {
  test(`relationship source rejects ${label} receipt`, async () => {
    const value = envelope();
    change(value);
    await assert.rejects(
      retrieveRelationshipSourceMetadata('source', name, async (arguments_, cwd) => {
        await writeOutput(cwd);
        return receipt(value);
      }),
    );
  });
}

for (const [label, value] of Object.entries({
  invalidJson: { exitCode: 0, stdout: '{' },
  exitFailure: receipt(envelope(), 1),
})) {
  test(`relationship source rejects ${label}`, async () => {
    await assert.rejects(retrieveRelationshipSourceMetadata('source', name, async () => value));
  });
}

for (const mode of ['missing', 'wrongName', 'directory', 'hardlink']) {
  test(`relationship source rejects ${mode} exact output`, async () => {
    await assert.rejects(
      retrieveRelationshipSourceMetadata('source', name, async (arguments_, cwd) => {
        const file = output(cwd);
        if (mode === 'directory') await mkdir(file, { recursive: true });
        if (mode === 'wrongName') {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(
            path.join(path.dirname(file), 'Other.fieldSrcTrgtRelationship-meta.xml'),
            xml,
          );
        }
        if (mode === 'hardlink') {
          await writeOutput(cwd);
          await link(file, path.join(path.dirname(file), 'alias.xml'));
        }
        return receipt();
      }),
      { code: ['directory', 'hardlink'].includes(mode) ? 'INVALID_STANDARD_RETRIEVE' : 'ENOENT' },
    );
  });
}
