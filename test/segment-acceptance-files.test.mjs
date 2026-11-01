import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPairReader } from '../scripts/segment-acceptance-files.mjs';

const supported = process.platform === 'linux';

test('unsupported platforms refuse rather than assert reparse safety', { skip: supported }, () => {
  assert.throws(() => createPairReader({ root: path.resolve('synthetic'), segment: 'Audience' }));
});

test(
  'synthetic receipt binds and correlates the exact pair; links and substitutions are refused',
  { skip: !supported },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'segment-pair-'));
    const base = path.join(root, 'force-app', 'main', 'default');
    const xmlDirectory = path.join(base, 'marketSegmentDefinitions');
    const jsonDirectory = path.join(base, 'data360', 'segments');
    await mkdir(xmlDirectory, { recursive: true });
    await mkdir(jsonDirectory, { recursive: true });
    const xmlPath = path.join(xmlDirectory, 'Audience.marketSegmentDefinition-meta.xml');
    const jsonPath = path.join(jsonDirectory, 'Audience.segment.json');
    const xml =
      '<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata"><includeCriteria>&lt;DbtPipeline xmlns=&quot;&quot;&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;Audience&lt;/name&gt;&lt;sql&gt;SELECT 1&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;</includeCriteria><masterLabel>Audience</masterLabel><segmentType>DBT</segmentType></MarketSegmentDefinition>';
    const json = JSON.stringify({
      kind: 'segment',
      identity: { apiName: 'Audience', dataSpace: 'default' },
      spec: {
        displayName: 'Audience',
        segmentType: 'DBT',
        models: [{ name: 'Audience', sql: 'SELECT 1' }],
      },
    });
    await writeFile(xmlPath, xml);
    await writeFile(jsonPath, json);
    const item = {
      family: 'segment',
      operation: 'retrieve',
      outcome: 'retrieved',
      identity: { apiName: 'Audience', dataSpace: 'default' },
      path: xmlPath,
      companionPath: jsonPath,
    };
    const receipt = {
      evidence: { stdout: JSON.stringify({ result: { result: { items: [item] } } }) },
    };
    const readPair = createPairReader({ root, segment: 'Audience' });
    const pair = await readPair({ phase: 'retrieve', receipt, item });
    assert.equal(pair.jsonBytes.toString(), json);
    assert.equal(pair.xmlBytes.toString(), xml);
    await assert.rejects(
      readPair({ phase: 'retrieve', receipt, item: { ...item, companionPath: xmlPath } }),
    );
    await writeFile(jsonPath, json.replace('SELECT 1', 'SELECT 2'));
    await assert.rejects(readPair({ phase: 'retrieve', receipt, item }));
    await rename(jsonPath, `${jsonPath}.real`);
    await symlink(`${jsonPath}.real`, jsonPath);
    await assert.rejects(readPair({ phase: 'retrieve', receipt, item }));
  },
);
