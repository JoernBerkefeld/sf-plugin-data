import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
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
const version = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
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
      return { name, id: 'source-local' };
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
// Lenient retrieve step 6: a prerequisite that cannot be bound was a refusal; retrieve now
// writes the Segment and warns (deploy still binds and refuses).
test('a missing or incompatible Segment prerequisite is a warning naming the Segment; a failing DMO read still fails', async () => {
  const { calls, services } = fixtures();
  services.bind = async () => {
    throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
  };
  const warnings = [];
  const selected = await acquireRetrieveSelection(
    roots,
    {},
    version,
    services,
    () => assert.fail('no failure'),
    (warning) => warnings.push(warning),
  );
  assert.deepEqual(
    selected.map(({ document }) => document.identity.apiName),
    ['Alpha', 'Zulu'],
  );
  assert.equal(warnings.length, 2);
  assert.match(
    warnings[0],
    /^segment:Zulu: its DMO Person__dlm could not be checked \(SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING\)/u,
  );
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
test('the source binder reads the segmentOn DMO by exact name; its kind is not judged locally', async () => {
  const { services } = fixtures();
  services.bind = bindSegmentDependencies;
  services.raw = async (name) => ({ name, id: 'private-source-id', category: 'OTHER' });
  const selected = await acquireRetrieveSelection(
    roots,
    { getApiVersion: () => '68.0' },
    version,
    services,
  );
  assert.equal(selected.length, 2);
  assert.doesNotMatch(JSON.stringify(selected), /private-source-id/u);
  services.raw = async () => ({ name: 'Other__dlm', id: 'x' });
  // Lenient retrieve step 6: another DMO was a refusal; it is now a warning per Segment.
  const warnings = [];
  const kept = await acquireRetrieveSelection(
    roots,
    { getApiVersion: () => '68.0' },
    version,
    services,
    undefined,
    (warning) => warnings.push(warning),
  );
  assert.equal(kept.length, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING/u);
});
test('unknown closure and foreign identities fail; retrieve has no node or request cap', async () => {
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
  // More than the deploy caps (256 nodes, 512 requests): every DMO and Segment is acquired.
  const fixture = fixtures();
  const many = await acquireRetrieveSelection(
    [
      ...Array.from({ length: 300 }, (_, index) => identity('dmo', `N${index}__dlm`)),
      ...Array.from({ length: 300 }, (_, index) => identity('segment', `S${index}`)),
    ],
    {},
    version,
    fixture.services,
  );
  assert.equal(many.length, 600);
  assert.equal(fixture.calls.dmo.length, 300);
  assert.equal(fixture.calls.segment.length, 300);
});
test('one failing DMO or Segment is reported alone; the others are still acquired', async () => {
  const { services } = fixtures();
  services.dmo = async (name) => {
    if (name === 'Broken__dlm') throw new NativeDmoError('DMO_HTTP_ERROR', 500);
    return dmo(name);
  };
  const segment = services.segment;
  services.segment = async (connection, name, ...rest) => {
    if (name === 'Zulu') return { blockers: ['SOURCE_UNAVAILABLE'] };
    return segment(connection, name, ...rest);
  };
  const bind = services.bind;
  services.bind = async (value, ...rest) => {
    if (value.identity.apiName === 'Bravo')
      throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
    return bind(value, ...rest);
  };
  const failures = [];
  const warnings = [];
  const selected = await acquireRetrieveSelection(
    [
      identity('dmo', 'Broken__dlm'),
      identity('dmo', 'Person__dlm'),
      identity('segment', 'Zulu'),
      identity('segment', 'Bravo'),
      identity('segment', 'Alpha'),
    ],
    {},
    version,
    services,
    (error) => failures.push([error.identity.apiName, error.code]),
    (warning) => warnings.push(warning),
  );
  // Lenient retrieve step 6: Bravo's unbound prerequisite was a failure; now a warning.
  assert.deepEqual(
    selected.map(({ document }) => document.identity.apiName),
    ['Person__dlm', 'Alpha', 'Bravo'],
  );
  assert.deepEqual(failures, [
    ['Broken__dlm', 'DMO_HTTP_ERROR'],
    ['Zulu', 'SOURCE_UNAVAILABLE'],
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^segment:Bravo: .*SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING/u);
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
            'api-version': '68.0',
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

// Lenient retrieve step 6: an unreadable prerequisite blocked the Segment; it is now written
// with a sanitized warning.
test('an unexpected prerequisite read failure is a sanitized warning; the Segment is written', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['segment:Zulu'], 'api-version': '68.0', 'data-space': 'default' },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'synthetic', getConnection: () => ({}) });
    const { services } = fixtures();
    services.raw = async () => {
      throw new Error('private-response-payload');
    };
    command.acquireSelection = (selected, conn, selection, supplied, ...rest) =>
      acquireRetrieveSelection(selected, conn, selection, services, ...rest);
    const written = [];
    command.writeSegment = async (document) => {
      written.push(document.identity.apiName);
      return { path: 'synthetic.segment.json', codePaths: [], outcome: 'retrieved' };
    };
    command.writeNativeDmo = () => assert.fail('no output');
    const result = await command.run();
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Zulu']);
    assert.deepEqual(result.diagnostics.errors, []);
    assert.equal(result.diagnostics.warnings.length, 1);
    assert.match(
      result.diagnostics.warnings[0],
      /^segment:Zulu: its DMO Person__dlm could not be checked \(SEGMENT_DEPENDENCY_ACQUISITION_FAILED\)/u,
    );
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
      'api-version': '68.0',
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
      assert.equal(root, path.resolve('synthetic-root'));
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
test('the retrieve command writes every other Segment when one fails to read or to write', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: {
        metadata: ['segment:Zulu', 'segment:Alpha', 'segment:Bravo', 'segment:Charlie'],
        'api-version': '68.0',
        'data-space': 'default',
        'output-dir': 'synthetic-root',
        overwrite: true,
      },
    });
    command.jsonEnabled = () => true;
    command.resolveOrg = async () => ({ getOrgId: () => 'synthetic', getConnection: () => ({}) });
    const { services } = fixtures();
    const segment = services.segment;
    services.segment = async (connection, name, ...rest) =>
      name === 'Bravo' ? { blockers: ['SOURCE_UNAVAILABLE'] } : segment(connection, name, ...rest);
    command.acquireSelection = (selected, conn, selection, _injected, onFailure) =>
      acquireRetrieveSelection(selected, conn, selection, services, onFailure);
    const written = [];
    command.writeSegment = async (document_) => {
      if (document_.identity.apiName === 'Alpha') throw new SegmentError('OUTPUT_FAILED');
      written.push(document_.identity.apiName);
      return { path: `${document_.identity.apiName}.segment.json`, outcome: 'retrieved' };
    };
    const result = await command.run();
    assert.equal(result.status, 'failed');
    assert.deepEqual(written, ['Charlie', 'Zulu']);
    assert.deepEqual(
      result.diagnostics.errors.map(({ code, identity }) => [code, identity?.apiName]),
      [
        ['SOURCE_UNAVAILABLE', 'Bravo'],
        ['OUTPUT_FAILED', 'Alpha'],
      ],
    );
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
          assert.equal(root, path.resolve('synthetic-root'));
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
    for (const pin of ['67.0', '65.0']) {
      refused.parse = async () => ({
        flags: { metadata: ['segment:Zulu', 'dmo:Person__dlm'], 'api-version': pin },
      });
      refused.jsonEnabled = () => true;
      refused.resolveOrg = () => assert.fail('a Segment admits only auto or 68.0');
      const blocked = await refused.run();
      assert.equal(blocked.status, 'blocked');
      assert.equal(blocked.diagnostics.errors[0].code, 'INVALID_SCOPE');
      process.exitCode = undefined;
    }

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
// Lenient retrieve step 6: a missing prerequisite blocked the command; the Segment is now
// written with a warning.
test('a missing Segment prerequisite is a warning; the Segment and the DMO are written', async () => {
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
    command.acquireSelection = (selected, conn, selection, supplied, ...rest) =>
      acquireRetrieveSelection(
        selected,
        conn,
        selection,
        {
          ...fixtures().services,
          ...supplied,
          bind: async () => {
            throw new SegmentError('SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING');
          },
        },
        ...rest,
      );
    const written = [];
    command.writeNativeDmo = command.writeSegment = async (document) => {
      written.push(document.identity.apiName);
      return { path: 'synthetic.json', outcome: 'retrieved' };
    };
    const result = await command.run();
    assert.equal(result.status, 'success');
    assert.deepEqual(written, ['Other__dlm', 'Zulu']);
    assert.deepEqual(result.diagnostics.errors, []);
    assert.match(
      result.diagnostics.warnings.join('\n'),
      /segment:Zulu: .*SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING/u,
    );
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
