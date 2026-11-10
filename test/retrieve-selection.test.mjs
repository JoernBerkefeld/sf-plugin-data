import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireRetrieveSelection } from '../lib/services/acquire-retrieve-selection.js';
import { NativeDmoError } from '../lib/artifacts/native-dmo-document.js';
import { bindSegmentDependencies } from '../lib/services/bind-segment-dependencies.js';
import { SegmentError } from '../lib/artifacts/segment-document.js';
import Retrieve from '../lib/commands/data360/retrieve.js';
import {
  apiDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../lib/transport/connect-diagnostic.js';
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
// Raw native read, as the DMO route returns it.
const dmo = (name, creationType = 'Custom') => ({
  name,
  dataSpaceName: 'default',
  label: name,
  category: 'OTHER',
  creationType,
  fields: [
    { name: 'Id__c', label: 'Id', type: 'Text', isPrimaryKey: true, creationType: 'Custom' },
  ],
});
const fixtures = () => {
  const calls = { segment: [], dmo: [], raw: [], bind: [] };
  const services = {
    segment: async (_, name) => {
      calls.segment.push(name);
      return { candidate: document(name), blockers: [] };
    },
    dmo: async (name) => {
      calls.dmo.push(name);
      return dmo(name);
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
test('the selection resolves shared references once without acquiring or publishing them', async () => {
  const { calls, services } = fixtures();
  const selected = await acquireRetrieveSelection([...roots, roots[0]], {}, version, services);
  assert.deepEqual(
    selected.map(({ document }) => document.identity.apiName),
    ['Alpha', 'Zulu'],
  );
  assert.deepEqual(calls.dmo, []);
  assert.deepEqual(calls.raw, ['Person__dlm']);
  assert.equal(calls.bind.length, 2);
  assert.equal(calls.segment.length, 2);
});
test('an explicitly selected DMO precedes its Segments in either selector order and isolated DMOs are retained', async () => {
  for (const ordered of [roots, roots.toReversed()]) {
    const { calls, services } = fixtures();
    const selected = await acquireRetrieveSelection(
      [...ordered, identity('dmo', 'Isolated__dlm'), identity('dmo', 'Person__dlm')],
      {},
      version,
      services,
    );
    assert.deepEqual(
      selected.map(({ document }) => document.identity.apiName),
      ['Isolated__dlm', 'Person__dlm', 'Alpha', 'Zulu'],
    );
    assert.deepEqual(calls.dmo.toSorted(), ['Isolated__dlm', 'Person__dlm']);
    assert.deepEqual(selected[1].document, {
      schemaVersion: 1,
      kind: 'dmo',
      identity: { apiName: 'Person__dlm', dataSpace: 'default' },
      spec: {
        label: 'Person__dlm',
        category: 'Other',
        fields: [
          {
            name: 'Id__c',
            label: 'Id',
            isPrimaryKey: true,
            creationType: 'Custom',
            dataType: 'Text',
          },
        ],
      },
    });
    assert.equal(calls.raw.length, 1);
  }
});
test('a missing or incompatible Segment prerequisite blocks and names the selected Segment', async () => {
  const { calls, services } = fixtures();
  services.bind = async () => {
    throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
  };
  await assert.rejects(acquireRetrieveSelection(roots, {}, version, services), (error) => {
    assert.equal(error.code, 'SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    assert.deepEqual(error.identity, roots[0]);
    assert.equal('reason' in error, false);
    return true;
  });
  // The referenced DMO is checked, never acquired for publication.
  assert.deepEqual(calls.dmo, []);
  const fresh = fixtures().services;
  fresh.dmo = async () => {
    throw new NativeDmoError('DMO_HTTP_ERROR', 404);
  };
  await assert.rejects(
    acquireRetrieveSelection([identity('dmo', 'Person__dlm')], {}, version, fresh),
    (error) => {
      assert.equal(error.code, 'DMO_HTTP_ERROR');
      assert.deepEqual(error.identity, identity('dmo', 'Person__dlm'));
      return true;
    },
  );
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
  const selected = await acquireRetrieveSelection(
    roots,
    { getApiVersion: () => '65.0' },
    version,
    services,
  );
  assert.equal(selected.length, 2);
  assert.doesNotMatch(JSON.stringify(selected), /private-source-id/u);
  services.raw = async () => ({ detail: { category: 'OTHER' }, metadata: [] });
  await assert.rejects(
    acquireRetrieveSelection(roots, { getApiVersion: () => '65.0' }, version, services),
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
  await assert.rejects(acquireRetrieveSelection([roots[0]], {}, version, services), {
    code: 'DEPENDENCY_CLOSURE_UNSUPPORTED',
  });
  services = fixtures().services;
  services.dmo = async () => dmo('Foreign__dlm');
  await assert.rejects(
    acquireRetrieveSelection([identity('dmo', 'Person__dlm')], {}, version, services),
    { code: 'DMO_TARGET_IDENTITY_MISMATCH' },
  );
  const fixture = fixtures();
  await assert.rejects(
    acquireRetrieveSelection(
      Array.from({ length: 257 }, (_, index) => identity('segment', `N${index}`)),
      {},
      version,
      fixture.services,
    ),
    { code: 'DEPENDENCY_LIMIT_EXCEEDED' },
  );
  assert.equal(fixture.calls.segment.length, 0);
  // One native read per DMO: five selections stay far inside the request budget.
  const five = await acquireRetrieveSelection(
    Array.from({ length: 5 }, (_, index) => identity('dmo', `N${index}__dlm`)),
    {},
    version,
    fixture.services,
  );
  assert.equal(five.length, 5);
  assert.equal(fixture.calls.dmo.length, 5);
});
test('explicitly selected standard or generated DMOs are retrieved; a Segment alone never acquires its DMO', async () => {
  for (const creationType of ['Standard', 'System']) {
    const { calls, services } = fixtures();
    services.dmo = async (apiName) => {
      calls.dmo.push(apiName);
      return dmo(apiName, creationType);
    };
    const explicit = await acquireRetrieveSelection(
      [roots[0], identity('dmo', 'Person__dlm')],
      {},
      version,
      services,
    );
    assert.deepEqual(
      explicit.map(({ document }) => document.kind),
      ['dmo', 'segment'],
    );
    calls.dmo.length = 0;
    const alone = await acquireRetrieveSelection([roots[0]], {}, version, services);
    assert.deepEqual(
      alone.map(({ document }) => document.kind),
      ['segment'],
    );
    assert.deepEqual(calls.dmo, []);
  }
});
test('a partial service override keeps the remaining services', async () => {
  const { calls, services } = fixtures();
  const selected = await acquireRetrieveSelection([identity('dmo', 'Person__dlm')], {}, version, {
    dmo: services.dmo,
  });
  assert.equal(selected.length, 1);
  assert.deepEqual(calls.dmo, ['Person__dlm']);
});
test('selection wrappers retain Segment and DMO evidence into human and JSON diagnostics', async () => {
  const evidence = apiDiagnostic(400, [
    { errorCode: 'INVALID_INPUT', message: 'The target configuration is unavailable.' },
  ]);
  const previous = process.exitCode;
  try {
    for (const kind of ['segment', 'dmo']) {
      for (const json of [true, false]) {
        const { services } = fixtures();
        const code = kind === 'segment' ? 'SOURCE_UNAVAILABLE' : 'DMO_HTTP_ERROR';
        services[kind] = async () => {
          if (kind === 'dmo')
            throw retainConnectDiagnostic(new NativeDmoError('DMO_HTTP_ERROR', 400), evidence);
          return retainConnectDiagnostic(
            { blockers: ['SOURCE_UNAVAILABLE'], status: 'blocked' },
            evidence,
          );
        };
        const root = identity(kind, kind === 'segment' ? 'Zulu' : 'Person__dlm');
        await assert.rejects(acquireRetrieveSelection([root], {}, version, services), (error) => {
          assert.equal(error.code, code);
          assert.equal(getConnectDiagnostic(error), evidence);
          assert.doesNotMatch(JSON.stringify(error), /INVALID_INPUT|statusCode/u);
          return true;
        });
        const command = Object.create(Retrieve.prototype);
        command.parse = async () => ({
          flags: {
            // A DMO alone uses the native route; pair it with a Segment to reach this path.
            metadata: kind === 'segment' ? ['segment:Zulu'] : ['dmo:Person__dlm', 'segment:Zulu'],
            'api-version': '65.0',
            'data-space': 'default',
          },
        });
        command.jsonEnabled = () => json;
        command.resolveOrg = async () => ({
          getOrgId: () => 'synthetic',
          getConnection: () => ({ getUsername: () => 'synthetic' }),
        });
        command.acquireSelection = (selected, conn, selection) =>
          acquireRetrieveSelection(selected, conn, selection, services);
        command.writeSegment = command.writeNativeDmo = () => assert.fail('no publication');
        const logs = [];
        command.log = (message) => logs.push(message);
        const result = await command.run();
        assert.equal(result.status, 'blocked');
        assert.equal(result.diagnostics.errors[0].code, code);
        assert.deepEqual(result.diagnostics.errors[0].identity, {
          dataSpace: 'default',
          apiName: root.apiName,
        });
        assert.match(result.diagnostics.errors[0].message, /INVALID_INPUT.*target configuration/u);
        if (json) assert.deepEqual(logs, []);
        else assert.match(logs.join('\n'), /INVALID_INPUT/u);
        process.exitCode = undefined;
      }
    }
  } finally {
    process.exitCode = previous;
  }
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
    command.acquireSelection = (selected, conn, selection) =>
      acquireRetrieveSelection(selected, conn, selection, services);
    command.writeSegment = () => assert.fail('no output');
    command.writeNativeDmo = () => assert.fail('no output');
    const result = await command.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics.errors[0].code, 'DEPENDENCY_ACQUISITION_FAILED');
    assert.equal(result.diagnostics.errors[0].identity.apiName, 'Zulu');
    assert.equal('dependencies' in result.result, false);
    assert.doesNotMatch(JSON.stringify(result), /private-response-payload/u);
  } finally {
    process.exitCode = previous;
  }
});
test('the retrieve command defines no dependency flag and publishes exactly the selected Segments', async () => {
  assert.equal('include-dependencies' in Retrieve.flags, false);
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    const flags = {
      metadata: ['segment:Zulu', 'segment:Alpha', 'segment:Zulu'],
      'api-version': '65.0',
      'data-space': 'default',
      'output-dir': 'synthetic-root',
      overwrite: true,
    };
    command.parse = async () => ({ flags });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'synthetic', getConnection: () => ({}) });
    command.listNativeNames = () => assert.fail('no inventory');
    const { calls, services } = fixtures();
    command.acquireSelection = (selected, conn, selection) =>
      acquireRetrieveSelection(selected, conn, selection, services);
    const written = [];
    command.writeNativeDmo = () => assert.fail('a referenced DMO is never published');
    command.writeSegment = async (document_, root, overwrite) => {
      assert.equal(root, 'synthetic-root');
      assert.equal(overwrite, true);
      written.push(document_.identity.apiName);
      return { path: `${document_.identity.apiName}.segment.json`, outcome: 'unchanged' };
    };
    const result = await command.run();
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Alpha', 'Zulu']);
    assert.deepEqual(calls.dmo, []);
    assert.deepEqual(result.result.selection, ['segment:Alpha', 'segment:Zulu']);
    assert.equal('dependencies' in result.result, false);
  } finally {
    process.exitCode = previous;
  }
});
test('an explicit Segment and DMO selection reads each family at its own version and publishes the DMO first', async () => {
  const previous = process.exitCode;
  try {
    for (const [requested, segmentVersion, dmoVersion] of [
      ['auto', '68.0', '68.0'],
      ['68.0', '68.0', '68.0'],
      ['65.0', '65.0', '65.0'],
    ]) {
      for (const metadata of [
        ['segment:Zulu', 'dmo:Person__dlm'],
        ['dmo:Person__dlm', 'segment:Zulu'],
      ]) {
        const command = Object.create(Retrieve.prototype);
        command.parse = async () => ({
          flags: {
            metadata,
            'api-version': requested,
            'output-dir': 'synthetic-root',
            overwrite: false,
          },
        });
        command.jsonEnabled = () => true;
        command.resolveOrg = async () => ({
          getOrgId: () => 'synthetic',
          getConnection: () => ({ getUsername: () => 'synthetic-user' }),
        });
        command.listNativeNames = () => assert.fail('no inventory');
        const clients = [];
        command.createDmoClient = (target, clientVersion) => {
          clients.push([target, clientVersion]);
          return { get: async (name) => dmo(name) };
        };
        const segmentVersions = [];
        // Keep the command-supplied native DMO read; replace only the remote Segment services.
        command.acquireSelection = (selected, conn, selection, supplied) => {
          assert.equal(typeof supplied.dmo, 'function');
          segmentVersions.push(selection.soapNumeric);
          return acquireRetrieveSelection(selected, conn, selection, {
            ...fixtures().services,
            ...supplied,
          });
        };
        const written = [];
        command.writeNativeDmo = async (value, root, overwrite) => {
          assert.equal(root, 'synthetic-root');
          assert.equal(overwrite, false);
          written.push(`dmo:${value.identity.apiName}`);
          assert.equal(value.spec.fields[0].dataType, 'Text');
          return { path: 'data360/dmo/Person__dlm.dmo-meta.json', outcome: 'retrieved' };
        };
        command.writeSegment = async (value) => {
          written.push(`segment:${value.identity.apiName}`);
          return { path: 'Zulu.segment.json', outcome: 'retrieved' };
        };
        const result = await command.run();
        assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
        assert.deepEqual(clients, [['synthetic-user', dmoVersion]]);
        assert.deepEqual(segmentVersions, [segmentVersion]);
        assert.deepEqual(written, ['dmo:Person__dlm', 'segment:Zulu']);
        assert.deepEqual(result.result.selection, ['dmo:Person__dlm', 'segment:Zulu']);
        assert.deepEqual(result.result.items[0], {
          identity: { apiName: 'Person__dlm', dataSpace: 'default' },
          routes: [{ operation: 'dmo.get', apiVersion: dmoVersion, transport: 'native' }],
          operation: 'retrieve',
          path: 'data360/dmo/Person__dlm.dmo-meta.json',
          outcome: 'retrieved',
        });
        assert.deepEqual(result.result.items[1].routes, [
          { operation: 'segment.get', apiVersion: segmentVersion, transport: 'native' },
        ]);
        process.exitCode = undefined;
      }
    }
  } finally {
    process.exitCode = previous;
  }
});
test('a DMO beside a Segment keeps the Segment version rule and a failed DMO output stops the Segment', async () => {
  const previous = process.exitCode;
  try {
    const refused = Object.create(Retrieve.prototype);
    refused.parse = async () => ({
      flags: { metadata: ['segment:Zulu', 'dmo:Person__dlm'], 'api-version': '67.0' },
    });
    refused.jsonEnabled = () => true;
    refused.resolveOrg = () => assert.fail('a Segment admits only auto, 68.0 or 65.0');
    const blocked = await refused.run();
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.diagnostics.errors[0].code, 'INVALID_SCOPE');
    process.exitCode = undefined;

    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['segment:Zulu', 'dmo:Person__dlm'], 'api-version': 'auto' },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic',
      getConnection: () => ({ getUsername: () => 'synthetic-user' }),
    });
    command.createDmoClient = () => ({ get: async (name) => dmo(name) });
    command.acquireSelection = (selected, conn, selection, supplied) =>
      acquireRetrieveSelection(selected, conn, selection, {
        ...fixtures().services,
        ...supplied,
      });
    command.writeNativeDmo = async () => {
      throw new NativeDmoError('OUTPUT_FAILED');
    };
    command.writeSegment = () => assert.fail('no Segment after a failed prerequisite output');
    const result = await command.run();
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics.errors[0].code, 'OUTPUT_FAILED');
    assert.deepEqual(result.result.items, []);
  } finally {
    process.exitCode = previous;
  }
});
test('a missing Segment prerequisite blocks the command before any file is written', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['segment:Zulu', 'dmo:Other__dlm'], 'api-version': 'auto' },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic',
      getConnection: () => ({ getUsername: () => 'synthetic-user' }),
    });
    command.createDmoClient = () => ({ get: async (name) => dmo(name) });
    command.acquireSelection = (selected, conn, selection, supplied) =>
      acquireRetrieveSelection(selected, conn, selection, {
        ...fixtures().services,
        ...supplied,
        bind: async () => {
          throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
        },
      });
    command.writeNativeDmo = command.writeSegment = () => assert.fail('no publication');
    const result = await command.run();
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostics.errors[0].code, 'SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    assert.deepEqual(result.diagnostics.errors[0].identity, {
      dataSpace: 'default',
      apiName: 'Zulu',
    });
    assert.deepEqual(result.result.items, []);
  } finally {
    process.exitCode = previous;
  }
});
test('a DMO type selector beside a Segment inventories natively and retrieves standard DMOs too', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['dmo', 'segment:Zulu'], 'api-version': 'auto' },
    });
    command.jsonEnabled = () => true;
    const connection = { getUsername: () => 'synthetic-user' };
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic',
      getConnection: () => connection,
    });
    command.listNativeNames = async (conn, listVersion, family, scope) => {
      assert.equal(conn, connection);
      assert.deepEqual([listVersion, family, scope], ['68.0', 'dmo', 'default']);
      return ['Zeta__dlm', 'ssot__Individual__dlm', 'Zeta__dlm'];
    };
    command.createDmoClient = () => ({
      get: async (name) => dmo(name, name.startsWith('ssot') ? 'Standard' : 'Custom'),
    });
    command.acquireSelection = (selected, conn, selection, supplied) =>
      acquireRetrieveSelection(selected, conn, selection, {
        ...fixtures().services,
        ...supplied,
      });
    const written = [];
    command.writeNativeDmo = async (value) => {
      written.push(value.identity.apiName);
      return { path: `${value.identity.apiName}.dmo-meta.json`, outcome: 'retrieved' };
    };
    command.writeSegment = async () => ({ path: 'Zulu.segment.json', outcome: 'retrieved' });
    const result = await command.run();
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Zeta__dlm', 'ssot__Individual__dlm']);
    assert.equal(result.result.items.at(-1).family, 'segment');
  } finally {
    process.exitCode = previous;
  }
});
