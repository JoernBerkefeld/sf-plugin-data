import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRetrieveDependencies } from '../lib/services/select-retrieve-dependencies.js';
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
      // Published DMO entries are native definitions, not the replaced projection.
      assert.deepEqual(selected.entries[1].document, {
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
    throw new NativeDmoError('DMO_HTTP_ERROR', 404);
  };
  await assert.rejects(selectRetrieveDependencies(roots, {}, version, true, fresh), (error) => {
    assert.equal(error.code, 'DMO_HTTP_ERROR');
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
  services.dmo = async () => dmo('Foreign__dlm');
  await assert.rejects(
    selectRetrieveDependencies([identity('dmo', 'Person__dlm')], {}, version, true, services),
    { code: 'DMO_TARGET_IDENTITY_MISMATCH' },
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
  // One native read per DMO: five roots no longer exhaust the request budget.
  const five = await selectRetrieveDependencies(
    Array.from({ length: 5 }, (_, index) => identity('dmo', `N${index}__dlm`)),
    {},
    version,
    true,
    fixture.services,
  );
  assert.equal(five.entries.length, 5);
  assert.equal(fixture.calls.dmo.length, 5);
});
test('standard or generated DMO prerequisites block publication; explicit selections are retrieved', async () => {
  for (const creationType of ['Standard', 'System']) {
    const { services } = fixtures();
    services.dmo = async (apiName) => dmo(apiName, creationType);
    await assert.rejects(
      selectRetrieveDependencies([roots[0]], {}, version, true, services),
      (error) => {
        assert.equal(error.code, 'UNSUPPORTED_DMO_TARGET');
        assert.deepEqual(error.identity, identity('dmo', 'Person__dlm'));
        assert.equal(error.reason.explicit, false);
        return true;
      },
    );
    const explicit = await selectRetrieveDependencies(
      [roots[0], identity('dmo', 'Person__dlm')],
      {},
      version,
      true,
      services,
    );
    assert.deepEqual(
      explicit.entries.map(({ document }) => document.kind),
      ['dmo', 'segment'],
    );
    // Without the opt-in nothing is acquired, so the same Segment is retrieved alone.
    const alone = await selectRetrieveDependencies([roots[0]], {}, version, false, services);
    assert.deepEqual(
      alone.entries.map(({ document }) => document.kind),
      ['segment'],
    );
  }
  const { services } = fixtures();
  const standard = await selectRetrieveDependencies(
    [identity('dmo', 'ssot__Individual__dlm')],
    {},
    version,
    true,
    services,
  );
  assert.equal(standard.entries[0].document.identity.apiName, 'ssot__Individual__dlm');
});
test('a partial service override keeps the remaining services', async () => {
  const { calls, services } = fixtures();
  const selected = await selectRetrieveDependencies(
    [identity('dmo', 'Person__dlm')],
    {},
    version,
    true,
    { dmo: services.dmo },
  );
  assert.equal(selected.entries.length, 1);
  assert.deepEqual(calls.dmo, ['Person__dlm']);
});
test('dependency wrappers retain Segment and DMO evidence into human and JSON diagnostics', async () => {
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
        await assert.rejects(
          selectRetrieveDependencies([root], {}, version, false, services),
          (error) => {
            assert.equal(error.code, code);
            assert.equal(getConnectDiagnostic(error), evidence);
            assert.doesNotMatch(JSON.stringify(error), /INVALID_INPUT|statusCode/u);
            return true;
          },
        );
        const command = Object.create(Retrieve.prototype);
        command.parse = async () => ({
          flags: {
            metadata: [`${kind}:${root.apiName}`],
            'include-dependencies': true,
            'api-version': '65.0',
            'data-space': 'default',
          },
        });
        command.jsonEnabled = () => json;
        command.resolveOrg = async () => ({
          getOrgId: () => 'synthetic',
          getConnection: () => ({ getUsername: () => 'synthetic' }),
        });
        command.selectDependencies = (roots, conn, selection, include) =>
          selectRetrieveDependencies(roots, conn, selection, include, services);
        command.writeSegment = command.writeNativeDmo = () => assert.fail('no publication');
        const logs = [];
        command.log = (message) => logs.push(message);
        const result = await command.run();
        assert.equal(result.status, 'blocked');
        assert.equal(result.diagnostics.errors[0].code, code);
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
    command.selectDependencies = (roots, conn, version, include) =>
      selectRetrieveDependencies(roots, conn, version, include, services);
    command.writeSegment = () => assert.fail('no output');
    command.writeNativeDmo = () => assert.fail('no output');
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
      command.listNativeNames = () => assert.fail('no inventory');
      command.selectDependencies = (roots, conn, version, include) =>
        selectRetrieveDependencies(roots, conn, version, include, fixtures().services);
      const written = [];
      command.writeNativeDmo = async (document_, root, overwrite) => {
        assert.equal(document_.kind, 'dmo');
        assert.equal(root, 'synthetic-root');
        assert.equal(overwrite, true);
        throw new NativeDmoError('OUTPUT_FAILED');
      };
      command.writeSegment = async (document_, root, overwrite) => {
        assert.equal(root, 'synthetic-root');
        assert.equal(overwrite, true);
        written.push(document_.identity.apiName);
        return {
          path: `${document_.identity.apiName}.segment.json`,
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
test('command reads prerequisite DMOs on the native route and publishes native artifacts', async () => {
  const previous = process.exitCode;
  try {
    for (const [requested, expected] of [
      ['auto', '68.0'],
      ['65.0', '65.0'],
    ]) {
      const command = Object.create(Retrieve.prototype);
      command.parse = async () => ({
        flags: {
          metadata: ['segment:Zulu'],
          'include-dependencies': true,
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
      command.createDmoClient = (target, version) => {
        clients.push([target, version]);
        return { get: async (name) => dmo(name) };
      };
      // Keep the command-supplied native DMO read; replace only the remote Segment services.
      command.selectDependencies = (selected, conn, selection, include, supplied) => {
        assert.equal(typeof supplied.dmo, 'function');
        return selectRetrieveDependencies(selected, conn, selection, include, {
          ...fixtures().services,
          ...supplied,
        });
      };
      const written = [];
      command.writeNativeDmo = async (value, root, overwrite) => {
        assert.equal(root, 'synthetic-root');
        assert.equal(overwrite, false);
        written.push(value);
        return { path: 'data360/dmo/Person__dlm.dmo-meta.json', outcome: 'retrieved' };
      };
      command.writeSegment = async () => ({ path: 'Zulu.segment.json', outcome: 'retrieved' });
      const result = await command.run();
      assert.equal(result.status, 'success');
      assert.deepEqual(clients, [['synthetic-user', expected]]);
      assert.equal(written.length, 1);
      assert.equal(written[0].spec.fields[0].dataType, 'Text');
      assert.deepEqual(result.result.selection, ['dmo:Person__dlm', 'segment:Zulu']);
      assert.deepEqual(result.result.items[0], {
        identity: { apiName: 'Person__dlm', dataSpace: 'default' },
        routes: [{ operation: 'dmo.get', apiVersion: expected, transport: 'native' }],
        operation: 'retrieve',
        path: 'data360/dmo/Person__dlm.dmo-meta.json',
        outcome: 'retrieved',
      });
      process.exitCode = undefined;
    }
  } finally {
    process.exitCode = previous;
  }
});
test('command DMO inventory with dependency expansion uses the native listing', async () => {
  const previous = process.exitCode;
  try {
    const command = Object.create(Retrieve.prototype);
    command.parse = async () => ({
      flags: { metadata: ['dmo'], 'include-dependencies': true, 'api-version': 'auto' },
    });
    command.jsonEnabled = () => true;
    const connection = { getUsername: () => 'synthetic-user' };
    command.resolveOrg = async () => ({
      getOrgId: () => 'synthetic',
      getConnection: () => connection,
    });
    command.listNativeNames = async (conn, version, family, scope) => {
      assert.equal(conn, connection);
      assert.deepEqual([version, family, scope], ['68.0', 'dmo', 'default']);
      return ['Zeta__dlm', 'ssot__Individual__dlm', 'Zeta__dlm'];
    };
    command.createDmoClient = () => ({
      get: async (name) => dmo(name, name.startsWith('ssot') ? 'Standard' : 'Custom'),
    });
    command.selectDependencies = selectRetrieveDependencies;
    const written = [];
    command.writeNativeDmo = async (value) => {
      written.push(value.identity.apiName);
      return { path: `${value.identity.apiName}.dmo-meta.json`, outcome: 'retrieved' };
    };
    const result = await command.run();
    assert.equal(result.status, 'success');
    // Explicitly selected (inventoried) standard DMOs are retrieved like the native-only route.
    assert.deepEqual(written, ['Zeta__dlm', 'ssot__Individual__dlm']);
    assert.ok(result.result.dependencies.every(({ reason }) => reason.explicit));
  } finally {
    process.exitCode = previous;
  }
});
