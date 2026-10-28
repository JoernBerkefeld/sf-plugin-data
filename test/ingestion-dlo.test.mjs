import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ingestionAddition,
  validateIngestionDloDocument,
} from '../lib/artifacts/ingestion-dlo-document.js';
import {
  projectIngestionDlo,
  retrieveIngestionDlo,
} from '../lib/services/retrieve-ingestion-dlo.js';
import {
  executeIngestionDloDeploy,
  preflightIngestionDloDeploy,
} from '../lib/services/execute-ingestion-dlo-deploy.js';

const version = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };
const connection = {
  instanceUrl: 'https://synthetic.my.salesforce.com',
  getApiVersion: () => '67.0',
};
const apiName = 'ReturnedHash__dll';

/**
 * Independent synthetic full wire-schema fixture.
 * @param {number} phase Zero baseline, one source-only extension, two synced.
 * @returns {object} Private evidence.
 */
function baseline(phase = 0) {
  const source = ['ProbeId', 'ProbeValue', ...(phase === 2 ? ['ProbeExtra'] : [])];
  // eslint-disable-next-line unicorn/consistent-function-scoping -- Fixture-local definition keeps synthetic field semantics together.
  const field = (name) => ({
    name,
    label: name,
    dataType: 'Text',
    isPrimaryKey: name === 'ProbeId',
  });
  const fields = [
    ...source.map((name) => field(name)),
    ...['KQ_ProbeId', 'DataSourceObject', 'DataSource', 'cdp_sys_SourceVersion'].map((name) =>
      field(name),
    ),
  ];
  const dlo = {
    capabilities: {},
    category: 'Other',
    dataLakeFieldInfoRepresentation: fields,
    dataSpaceInfo: [{ name: 'default', label: 'default' }],
    fields,
    id: 'definition-id',
    label: 'Probe',
    name: apiName,
    status: 'ACTIVE',
  };
  return {
    connection: {
      connectorType: 'IngestApi',
      id: '1WM000000000001AAA',
      label: 'Probe',
      name: 'ReturnedConnection',
      status: 'CONNECTED',
      tenantSpecificEndpoint: 'private.invalid',
    },
    schema: {
      name: 'ProbeRecord',
      label: 'ProbeRecord',
      schemaType: 'IngestApi',
      availabilityStatus: 'In Use',
      fields: ['ProbeId', 'ProbeValue', ...(phase ? ['ProbeExtra'] : [])].map((name) => ({
        name,
        label: name,
        dataType: 'Text',
      })),
    },
    stream: {
      advancedAttributes: {},
      capabilities: {},
      connectorInfo: { connectorType: 'IngestApi' },
      dataAccessMode: 'INGEST',
      dataLakeObjectInfo: structuredClone(dlo),
      dataSource: 'ReturnedConnection',
      dataStreamType: 'INGESTAPI',
      isEnabled: true,
      label: 'Probe',
      name: 'ReturnedHash',
      recordId: 'stream-runtime-id',
      problemRecordDataLakeObjectName: 'PR_ReturnedHash__dll',
      status: 'ACTIVE',
      sourceFields: source.map((name) => ({ name, datatype: 'Text' })),
      mappings: [
        ...source.map((name) => ({ sourceFieldName: name, targetFieldName: name })),
        { formula: '&quot;ReturnedHash&quot;', targetFieldName: 'DataSourceObject' },
        { formula: '&quot;ReturnedConnection&quot;', targetFieldName: 'DataSource' },
      ],
      refreshConfig: {
        frequency: { hours: [], refreshDayOfMonth: [] },
        hasHeaders: false,
        isAccelerationEnabled: false,
        refreshMode: 'UPSERT',
        shouldFetchImmediately: false,
        shouldTreatMissingFilesAsFailures: false,
      },
    },
    dlo: {
      ...dlo,
      createdDate: 'preserved',
      id: 'runtime-id',
      namespace: '',
      fields: fields.map((item) => ({ ...item, name: `${item.name}__c` })),
      dataLakeFieldInfoRepresentation: fields.map((item) => ({ ...item, name: `${item.name}__c` })),
    },
    keyQualifiers: [],
  };
}

/**
 * Injectable independently bound acquisition.
 * @param {object} value Raw observations.
 * @param {boolean} pending Expected source-only phase.
 * @returns {object} Acquisition.
 */
function acquisition(value, pending = false) {
  return {
    identity: { dataSpace: 'default', apiName },
    candidate: projectIngestionDlo(value, apiName, pending),
    expectations: structuredClone(value),
    blockers: [],
  };
}

const current = projectIngestionDlo(baseline(), apiName);
const desired = projectIngestionDlo(baseline(2), apiName);

test('document retains returned identities, strict labels and unsuffixed source fields', () => {
  assert.equal(desired.identity.apiName, apiName);
  assert.equal(ingestionAddition(current, desired).name, 'ProbeExtra');
  for (const edit of [
    (x) => {
      x.spec.event.label = 'Probe Record';
    },
    (x) => {
      x.spec.event.fields[0].name = 'ProbeId__c';
    },
    (x) => {
      x.spec.event.fields[0].dataType = 'Number';
    },
    (x) => {
      x.spec.event.fields[0].unknown = true;
    },
    (x) => {
      x.spec.event.fields.push(x.spec.event.fields[0]);
    },
  ]) {
    const copy = structuredClone(desired);
    edit(copy);
    assert.throws(() => validateIngestionDloDocument(copy));
  }
});

test('full preserved source, field, key, formula and refresh admission rejects lossy candidates', () => {
  for (const edit of [
    (x) => {
      x.stream.mappings.pop();
    },
    (x) => {
      x.stream.refreshConfig.shouldFetchImmediately = true;
    },
    (x) => {
      x.dlo.fields[0].isPrimaryKey = false;
    },
    (x) => {
      x.stream.unqualified = {};
    },
    (x) => {
      x.keyQualifiers.push({ name: 'Custom' });
    },
    (x) => {
      x.schema.fields.push({ name: 'Unrelated', label: 'Unrelated', dataType: 'Text' });
    },
  ]) {
    const value = baseline();
    edit(value);
    assert.throws(() => projectIngestionDlo(value, apiName));
  }
  const reordered = baseline();
  for (const object of [reordered.dlo, reordered.stream.dataLakeObjectInfo]) {
    object.fields.reverse();
    object.dataLakeFieldInfoRepresentation.reverse();
  }
  reordered.schema.fields.reverse();
  reordered.stream.mappings.reverse();
  reordered.stream.sourceFields.reverse();
  assert.deepEqual(projectIngestionDlo(reordered, apiName), current);
});

test('source-only partial state refuses reentry instead of replaying schema or sync', async () => {
  let writes = 0;
  const result = await executeIngestionDloDeploy(desired, connection, version, 'default', {
    acquire: async () => acquisition(baseline(1)),
    verifyInput: async () => {},
    recordObservation: async () => {},
    allowProcessing: true,
    mutate: async () => {
      writes++;
    },
  });
  assert.equal(result.outcome, 'blocked');
  assert.equal(writes, 0);
});

test('complete equality makes zero mutations and requires no processing acknowledgement', async () => {
  const options = {
    acquire: async () => acquisition(baseline()),
    verifyInput: async () => {},
    recordObservation: async () => {},
    allowProcessing: false,
    mutate: async () => assert.fail('write'),
  };
  assert.equal(
    await preflightIngestionDloDeploy(current, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
  assert.equal(
    await executeIngestionDloDeploy(current, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
});

test('two-stage source PUT then sync preserves all independent definitions and zero-write repeat', async () => {
  let phase = 0;
  const writes = [];
  const observations = [];
  const options = {
    allowProcessing: true,
    verifyInput: async () => {},
    recordObservation: async (value) => observations.push(value),
    acquire: async (_c, _n, _v, _s, options_) => acquisition(baseline(phase), options_.pending),
    mutate: async (operation, parameters) => {
      writes.push({ operation, parameters });
      if (operation === 'd360_connection_schema_put_ingestion_api') {
        phase = 1;
        return { schemas: [baseline(1).schema] };
      }
      phase = 2;
      return {
        dataLakeObjectInfo: baseline(2).stream.dataLakeObjectInfo,
        id: 'definition',
        label: 'Probe',
        name: 'ReturnedHash',
        recordId: 'stream-runtime-id',
        status: 'PROCESSING',
      };
    },
  };
  const result = await executeIngestionDloDeploy(desired, connection, version, 'default', options);
  assert.deepEqual(
    [result.outcome, result.stage, result.mutation],
    ['updated', 'settled', 'confirmed-updated'],
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].parameters.objects, [desired.spec.event]);
  assert.deepEqual(writes[1].parameters, {
    recordIdOrDeveloperName: 'ReturnedHash',
    syncSchema: true,
  });
  assert.ok(observations.length >= 3);
  assert.equal(
    await executeIngestionDloDeploy(desired, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'unchanged',
  );
  assert.equal(writes.length, 2);
});

for (const failure of ['schema-error', 'sync-error', 'input-drift', 'source-drift']) {
  test(`partial failure ${failure} never retries or rolls back`, async () => {
    let phase = 0;
    let writes = 0;
    let inputChecks = 0;
    const result = await executeIngestionDloDeploy(desired, connection, version, 'default', {
      allowProcessing: true,
      verifyInput: async () => {
        inputChecks++;
        if (failure === 'input-drift' && inputChecks > 3) throw new Error('drift');
      },
      recordObservation: async () => {},
      acquire: async (_c, _n, _v, _s, options) => {
        const value = baseline(phase);
        if (failure === 'source-drift' && phase) value.connection.label = 'changed';
        return acquisition(value, options.pending);
      },
      mutate: async (operation) => {
        writes++;
        if (operation === 'd360_connection_schema_put_ingestion_api') {
          phase = 1;
          if (failure === 'schema-error') return { error: 'nested despite201' };
          return { schemas: [baseline(1).schema] };
        }
        throw new Error('sync disconnect');
      },
    });
    assert.equal(result.mutation, 'unknown');
    assert.equal(writes, failure === 'sync-error' ? 2 : 1);
  });
}

test('no acknowledgement and changed type/removal block before writes', async () => {
  const options = {
    allowProcessing: false,
    verifyInput: async () => {},
    recordObservation: async () => {},
    acquire: async () => acquisition(baseline()),
    mutate: async () => assert.fail('write'),
  };
  assert.equal(
    await executeIngestionDloDeploy(desired, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'blocked',
  );
  const removed = structuredClone(current);
  removed.spec.event.fields.pop();
  assert.equal(
    await preflightIngestionDloDeploy(removed, connection, version, 'default', options).then(
      (value) => value.outcome,
    ),
    'blocked',
  );
});

test('actual acquisition binds returned DLO owner to complete connection inventory, never generated-name parsing', async () => {
  const raw = baseline();
  const calls = [];
  const read = async (operation, parameters) => {
    calls.push({ operation, params: parameters });
    switch (operation) {
      case 'd360_connection_list': {
        return { connections: [raw.connection], totalSize: 1 };
      }
      case 'd360_datastream_list': {
        return { dataStreams: [raw.stream], totalSize: 1 };
      }
      case 'd360_datastream_get': {
        return raw.stream;
      }
      case 'd360_connection_get': {
        return raw.connection;
      }
      case 'd360_connection_schema_get': {
        return { schemas: [raw.schema] };
      }
      case 'd360_dlo_get': {
        return { dataLakeObjects: [raw.dlo] };
      }
      default: {
        return { keyQualifiers: [] };
      }
    }
  };
  const acquired = await retrieveIngestionDlo(connection, apiName, version, 'default', { read });
  assert.deepEqual(acquired.candidate, current);
  assert.equal(calls.length, 8);
  assert.equal(calls[2].params.connectionName, 'ReturnedConnection');
  for (const defect of ['shared', 'multiple-events', 'truncated']) {
    const bad = async (op, parameters) => {
      const value = structuredClone(await read(op, parameters));
      if (defect === 'shared' && op === 'd360_datastream_list' && parameters.connectionName) {
        value.dataStreams.push({ ...raw.stream, name: 'OtherStream' });
        value.totalSize = 2;
      }
      if (defect === 'multiple-events' && op === 'd360_connection_schema_get')
        value.schemas.push({ ...raw.schema, name: 'Other' });
      if (defect === 'truncated' && op === 'd360_connection_list') value.nextPageUrl = '/more';
      return value;
    };
    assert.ok(
      await retrieveIngestionDlo(connection, apiName, version, 'default', { read: bad }).then(
        (value) => value.blockers.length,
      ),
    );
  }
});
