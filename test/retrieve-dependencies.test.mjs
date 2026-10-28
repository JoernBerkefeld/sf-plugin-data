import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRetrieveDependencies } from '../lib/services/select-retrieve-dependencies.js';
import { DmoRetrieveError } from '../lib/services/retrieve-other-dmo.js';
import { bindSegmentDependencies } from '../lib/services/bind-segment-dependencies.js';
import { SegmentError } from '../lib/artifacts/segment-document.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import { DmoWriteError } from '../lib/artifacts/write-other-dmo.js';
const identity = (kind, apiName) => ({ kind, dataSpace: 'default', apiName });
const version = { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' };
const document = (name) => ({
  schemaVersion: 1,
  kind: 'segment',
  identity: { dataSpace: 'default', apiName: name },
  spec: {
    displayName: name,
    description: '',
    segmentType: 'DBT',
    segmentOn: identity('dmo', 'Person__dlm'),
    models: [{ name, sql: 'SELECT Person__dlm.Id__c FROM Person__dlm WHERE 1 = 0' }],
    dependencies: [{ ...identity('dmo', 'Person__dlm'), fields: ['Id__c'] }],
    publishInterval: 'NO_REFRESH',
    lookbackPeriod: 'P90D',
  },
});
const dmo = (name) => ({
  schemaVersion: 1,
  kind: 'dmo',
  identity: { dataSpace: 'default', apiName: name },
  spec: {
    label: name,
    category: 'Other',
    fields: [
      { name: 'Id__c', label: 'Id', dataType: 'Text', isPrimaryKey: true, isDynamicLookup: false },
    ],
  },
});
const fixtures = () => {
  const calls = { segment: [], dmo: [], raw: [], bind: [] };
  const services = {
    segment: async (_, name) => {
      calls.segment.push(name);
      return { candidate: document(name), definitionXml: '<paired/>', blockers: [] };
    },
    dmo: async (_, name) => {
      calls.dmo.push(name);
      return { status: 'projected', blockers: [], candidate: dmo(name) };
    },
    raw: async (name) => {
      calls.raw.push(name);
      return { detail: {}, metadata: [] };
    },
    bind: async (value, _, __, ___, acquire) => {
      calls.bind.push(value.identity.apiName);
      await acquire('Person__dlm');
      return [];
    },
  };
  return { calls, services };
};
const roots = [identity('segment', 'Zulu'), identity('segment', 'Alpha')];
test('default resolves shared references once without acquiring or publishing extra artifacts', async () => {
  const { calls, services } = fixtures();
  const selected = await selectRetrieveDependencies(
    [...roots, roots[0]],
    {},
    version,
    false,
    services,
  );
  assert.deepEqual(
    selected.entries.map(({ document }) => document.identity.apiName),
    ['Alpha', 'Zulu'],
  );
  assert.deepEqual(calls.dmo, []);
  assert.deepEqual(calls.raw, ['Person__dlm']);
  assert.equal(calls.bind.length, 2);
  assert.equal(calls.segment.length, 2);
});
test('opt-in shared dependencies, explicit dedupe, reverse selectors and isolated roots retain reasons', async () => {
  for (const explicit of [false, true]) {
    for (const ordered of [roots, roots.toReversed()]) {
      const { calls, services } = fixtures();
      const selected = await selectRetrieveDependencies(
        [
          ...ordered,
          identity('dmo', 'Isolated__dlm'),
          ...(explicit ? [identity('dmo', 'Person__dlm')] : []),
        ],
        {},
        version,
        true,
        services,
      );
      assert.deepEqual(
        selected.entries.map(({ document }) => document.identity.apiName),
        ['Isolated__dlm', 'Person__dlm', 'Alpha', 'Zulu'],
      );
      assert.equal(calls.dmo.filter((name) => name === 'Person__dlm').length, 1);
      assert.equal(calls.raw.length, 1);
      const reason = selected.reasons.get('dmo:default:Person__dlm');
      assert.equal(reason.explicit, explicit);
      assert.equal(reason.chains.filter((chain) => chain.length === 2).length, 2);
    }
  }
});
test('missing compatibility and unsupported PROFILE export block rather than manufacture Other artifacts', async () => {
  const { services } = fixtures();
  services.bind = async () => {
    throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
  };
  await assert.rejects(selectRetrieveDependencies(roots, {}, version, false, services), {
    code: 'SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING',
  });
  const fresh = fixtures().services;
  fresh.dmo = async () => {
    throw new DmoRetrieveError('GENERATED_FIELD_REPLAY_UNVERIFIED');
  };
  await assert.rejects(selectRetrieveDependencies(roots, {}, version, true, fresh), (error) => {
    assert.equal(error.code, 'GENERATED_FIELD_REPLAY_UNVERIFIED');
    assert.deepEqual(error.identity, identity('dmo', 'Person__dlm'));
    assert.equal(error.reason.explicit, false);
    assert.equal(error.reason.chains.length, 2);
    return true;
  });
});
test('actual source compatibility binder requires PROFILE, not synthetic portable Other stand-ins', async () => {
  const { services } = fixtures();
  services.bind = bindSegmentDependencies;
  services.raw = async () => ({
    detail: {
      name: 'Person__dlm',
      dataSpaceName: 'default',
      id: 'private-source-id',
      category: 'PROFILE',
      isSegmentable: true,
      fields: [{ name: 'Id__c', type: 'Text', isPrimaryKey: true }],
    },
    metadata: [
      {
        fullName: 'Person__dlm',
        mktDataModelAttributes: { dataSpaceName: 'default', isSegmentable: 'true' },
        fields: [
          {
            fullName: 'Id__c',
            type: 'Text',
            mktDataModelFieldAttributes: { primaryIndexOrder: '1' },
          },
        ],
      },
    ],
  });
  const selected = await selectRetrieveDependencies(
    roots,
    { getApiVersion: () => '65.0' },
    version,
    false,
    services,
  );
  assert.equal(selected.entries.length, 2);
  assert.doesNotMatch(JSON.stringify(selected.entries), /private-source-id/u);
  services.raw = async () => ({ detail: { category: 'OTHER' }, metadata: [] });
  await assert.rejects(
    selectRetrieveDependencies(roots, { getApiVersion: () => '65.0' }, version, false, services),
    { code: 'SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING' },
  );
});
test('unknown closure, foreign identities, node and request limits fail closed before excess reads', async () => {
  let { services } = fixtures();
  services.segment = async () => ({
    candidate: { ...document('Zulu'), kind: 'graph' },
    definitionXml: '<paired/>',
    blockers: [],
  });
  await assert.rejects(selectRetrieveDependencies([roots[0]], {}, version, true, services), {
    code: 'DEPENDENCY_CLOSURE_UNSUPPORTED',
  });
  services = fixtures().services;
  services.dmo = async () => ({
    status: 'projected',
    blockers: [],
    candidate: dmo('Foreign__dlm'),
  });
  await assert.rejects(
    selectRetrieveDependencies([identity('dmo', 'Person__dlm')], {}, version, true, services),
    { code: 'DEPENDENCY_IDENTITY_UNSUPPORTED' },
  );
  const fixture = fixtures();
  await assert.rejects(
    selectRetrieveDependencies(
      Array.from({ length: 257 }, (_, index) => identity('segment', `N${index}`)),
      {},
      version,
      true,
      fixture.services,
    ),
    { code: 'DEPENDENCY_LIMIT_EXCEEDED' },
  );
  assert.equal(fixture.calls.segment.length, 0);
  await assert.rejects(
    selectRetrieveDependencies(
      Array.from({ length: 5 }, (_, index) => identity('dmo', `N${index}__dlm`)),
      {},
      version,
      true,
      fixture.services,
    ),
    { code: 'DEPENDENCY_REQUEST_LIMIT_EXCEEDED' },
  );
  assert.equal(fixture.calls.dmo.length, 4);
});
test('unexpected acquisition failure is sanitized and prevents every output', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['segment:Zulu'], 'api-version': '65.0', 'data-space': 'default' },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'synthetic', getConnection: () => ({}) });
    const { services } = fixtures();
    services.raw = async () => {
      throw new Error('private-response-payload');
    };
    command.selectDependencies = (roots, conn, version, include) =>
      selectRetrieveDependencies(roots, conn, version, include, services);
    command.writeSegment = () => assert.fail('no output');
    command.writeDocument = () => assert.fail('no output');
    const result = await command.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics.errors[0].code, 'DEPENDENCY_ACQUISITION_FAILED');
    assert.equal(result.result.dependencies[0].reason.explicit, true);
    assert.doesNotMatch(JSON.stringify(result), /private-response-payload/u);
  } finally {
    process.exitCode = previous;
  }
});
test('command opt-in emits reasons; prerequisite output failure prevents Segment pair publication', async () => {
  const previous = process.exitCode;
  try {
    for (const include of [false, true]) {
      const command = Object.create(Retrieve.prototype);
      const flags = {
        metadata: ['segment:Zulu', 'segment:Alpha', 'segment:Zulu'],
        'include-dependencies': include,
        'api-version': '65.0',
        'data-space': 'default',
        'output-dir': 'synthetic-root',
        overwrite: true,
      };
      command.parse = async () => ({ flags });
      command.jsonEnabled = () => true;
      command.resolveOrg = async () => ({ getOrgId: () => 'synthetic', getConnection: () => ({}) });
      command.selectDocuments = () => assert.fail('no inventory');
      command.selectDependencies = (roots, conn, version, include) =>
        selectRetrieveDependencies(roots, conn, version, include, fixtures().services);
      const written = [];
      command.writeDocument = async () => {
        throw new DmoWriteError('OUTPUT_FAILED');
      };
      command.writeSegment = async (document_, xml, root, overwrite) => {
        assert.equal(root, 'synthetic-root');
        assert.equal(overwrite, true);
        assert.equal(xml, '<paired/>');
        written.push(document_.identity.apiName);
        return {
          path: `${document_.identity.apiName}.xml`,
          companionPath: `${document_.identity.apiName}.json`,
          outcome: 'unchanged',
        };
      };
      const result = await command.run();
      assert.equal(result.status, include ? 'failed' : 'success');
      assert.deepEqual(written, include ? [] : ['Alpha', 'Zulu']);
      assert.equal(Boolean(result.result.dependencies), include);
      if (include)
        assert.equal(
          result.result.dependencies.find(({ identity }) => identity.kind === 'dmo').reason
            .explicit,
          false,
        );
      process.exitCode = undefined;
    }
  } finally {
    process.exitCode = previous;
  }
});
