import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DataStreamHttpError } from '../lib/transport/data-stream-rest.js';
import { buildDataStreamCreateBody } from '../lib/artifacts/data-stream-document.js';
import {
  executeDataStream,
  executeDeleteDataStream,
  preflightDataStream,
} from '../lib/services/command-native-data-stream.js';
import {
  deleteNativeDataStream,
  retrieveNativeDataStream,
} from '../lib/services/native-data-stream.js';

// Ingestion API streams of any category, field type and formula, several per connection
// (research: verification DB data360:data-stream.asis-variants-crud.api68).
const connection = {
  name: 'CliConn_0f1e2d3c',
  id: '1WM000000000009AAA',
  connectorType: 'IngestApi',
  status: 'CONNECTED',
};
const typed = [
  ['EventId', 'Text'],
  ['EventTime', 'DateTime'],
  ['Score', 'Number'],
  ['IsOpen', 'Boolean'],
];
const encode = (formula) => formula.replaceAll("'", '&#39;').replaceAll('"', '&quot;');

const field = (name, dataType, isPrimaryKey = false) => ({
  name,
  label: name,
  dataType,
  isPrimaryKey,
});
const notFound = () => new DataStreamHttpError('STREAM_HTTP_ERROR', 404);

/**
 * An offline org holding one Ingestion API connection with two events. Create and PATCH behave
 * as the research observed: Salesforce names the stream, creates every schema field itself,
 * adds a formula by PATCH and refuses an empty formula with 400.
 * @returns {object} Clients, sent writes and the stream map.
 */
function org() {
  const streams = new Map();
  const writes = [];
  const lagging = [];
  // After a PATCH the next stream read shows the stream and its DLO PROCESSING (live behaviour).
  let processing = 0;
  let sequence = 0;
  const events = ['CliEvA', 'CliEvB'];
  const byId = (identity) =>
    [...streams.values()].find((stream) => [stream.name, stream.recordId].includes(identity));
  const clients = {
    streams: {
      get: async (identity) => {
        const stream = byId(identity);
        if (!stream) throw notFound();
        const read = structuredClone(stream);
        if (processing > 0) {
          processing--;
          read.status = 'PROCESSING';
          read.dataLakeObjectInfo.status = 'PROCESSING';
        }
        return read;
      },
      list: async (name) => {
        const listed = [...streams.values(), ...lagging.splice(0)];
        return listed
          .filter((stream) => stream.dataSource === name)
          .map((stream) => structuredClone(stream));
      },
      // The stream and its DLO answer 404 at once; the stream list still names it once.
      delete: async (recordId) => {
        const stream = byId(recordId);
        streams.delete(stream.name);
        lagging.push(stream);
      },
      create: async (document, sourceFields) => {
        const body = buildDataStreamCreateBody(document, sourceFields);
        writes.push({ method: 'POST', body });
        const event = body.connectorInfo.connectorDetails.events[0];
        sequence++;
        const name = `CliConn_${event}_${String(sequence).padStart(8, '0')}`;
        const info = body.dataLakeObjectInfo;
        const stream = {
          name,
          recordId: `1ds00000000000${sequence}AAA`,
          label: `CliConn-${event}`,
          dataSource: connection.name,
          dataStreamType: 'INGESTAPI',
          connectorInfo: { connectorType: 'IngestApi' },
          status: 'ACTIVE',
          refreshConfig: { refreshMode: 'UPSERT' },
          sourceFields: typed.map(([fieldName, datatype]) => ({ name: fieldName, datatype })),
          mappings: [
            ...typed.map(([fieldName]) => ({
              sourceFieldName: fieldName,
              targetFieldName: fieldName,
            })),
            { formula: `&quot;${connection.name}&quot;`, targetFieldName: 'DataSource' },
            { formula: `&quot;${name}&quot;`, targetFieldName: 'DataSourceObject' },
            {
              formula: 'DAYPRECISION(formulaField[&#39;EventTime__c&#39;])',
              targetFieldName: 'cdp_sys_PartitionDate',
            },
            ...body.mappings.map((mapping) => ({
              formula: encode(mapping.transformationFormula),
              targetFieldName: mapping.targetFieldName,
            })),
          ],
          dataLakeObjectInfo: {
            name: `${name}__dll`,
            label: info.label,
            category: info.category,
            eventDateTimeFieldName: info.eventDateTimeFieldName,
            status: 'ACTIVE',
            dataSpaceInfo: [{ name: 'default', label: 'default' }],
            fields: [
              ...typed.map(([fieldName, dataType]) =>
                field(fieldName, dataType, fieldName === 'EventId'),
              ),
              field('KQ_EventId', 'Text'),
              field('DataSource', 'Text'),
              field('DataSourceObject', 'Text'),
              field('cdp_sys_PartitionDate', 'DateTime'),
              field('cdp_sys_SourceVersion', 'Text'),
              ...body.mappings.map((mapping) =>
                field(mapping.targetFieldName, mapping.targetFieldReturntype),
              ),
            ],
          },
        };
        streams.set(name, stream);
        return { name, recordId: stream.recordId };
      },
      update: async () => assert.fail('formula and label changes use one PATCH body'),
      patch: async (recordId, body) => {
        writes.push({ method: 'PATCH', body: structuredClone(body) });
        processing = 1;
        const stream = byId(recordId);
        for (const mapping of body.mappings ?? []) {
          if (mapping.transformationFormula === '')
            throw new DataStreamHttpError('STREAM_HTTP_ERROR', 400);
          stream.mappings = stream.mappings.filter(
            (entry) => entry.targetFieldName !== mapping.targetFieldName,
          );
          stream.mappings.push({
            formula: encode(mapping.transformationFormula),
            targetFieldName: mapping.targetFieldName,
          });
          if (
            !stream.dataLakeObjectInfo.fields.some(
              (entry) => entry.name === mapping.targetFieldName,
            )
          )
            stream.dataLakeObjectInfo.fields.push(
              field(mapping.targetFieldName, mapping.targetFieldReturntype),
            );
        }
        // A label PATCH returns 200 and changes nothing.
        return { name: stream.name };
      },
    },
    connections: {
      list: async () => ({ connections: [structuredClone(connection)] }),
      get: async () => structuredClone(connection),
      schema: async () => ({
        schemas: events.map((event) => ({
          name: event,
          schemaType: 'IngestApi',
          availabilityStatus: [...streams.values(), ...lagging].some((stream) =>
            stream.label.endsWith(`-${event}`),
          )
            ? 'In Use'
            : 'Available',
          fields: typed.map(([fieldName, dataType]) => ({
            name: fieldName,
            label: fieldName,
            dataType,
          })),
        })),
      }),
    },
    dependencies: {
      stream: async () => ({ dependencies: [], totalSize: 0 }),
      dlo: async (name) => {
        const stream = [...streams.values()].find(
          (entry) => entry.dataLakeObjectInfo.name === name,
        );
        return {
          dependencies: [{ componentType: 'DataStream', id: stream.recordId, name: stream.label }],
          totalSize: 1,
        };
      },
    },
    dlo: {
      get: async (identity) => {
        const stream = [...streams.values()].find(
          (entry) =>
            entry.dataLakeObjectInfo.name === identity ||
            `1dl${entry.recordId.slice(3)}` === identity,
        );
        if (!stream) throw notFound();
        const info = stream.dataLakeObjectInfo;
        return {
          dataLakeObjects: [
            {
              name: info.name,
              label: info.label,
              category: info.category,
              status: 'ACTIVE',
              id: `1dl${stream.recordId.slice(3)}`,
              dataSpaceInfo: [{ name: 'default' }],
              fields: info.fields.map((entry) => ({ ...entry, name: `${entry.name}__c` })),
            },
          ],
        };
      },
    },
  };
  return { clients, writes, streams };
}

/**
 * A hand-written Engagement stream file with a formula.
 * @param {string} event Event name.
 * @returns {object} Stream document.
 */
function file(event) {
  return {
    schemaVersion: 1,
    kind: 'data-stream',
    identity: { apiName: `CliConn_${event}_FFFFFFFF`, dataSpace: 'default' },
    spec: {
      connectorType: 'IngestApi',
      connectionName: connection.name,
      event,
      datastreamType: 'INGEST_API',
      refreshMode: 'UPSERT',
      label: `CliConn-${event}`,
      newDlo: {
        name: `CliConn_${event}_FFFFFFFF__dll`,
        label: event,
        category: 'Engagement',
        eventDateTimeFieldName: 'EventTime',
        primaryKey: { name: 'EventId', label: 'EventId', dataType: 'Text' },
      },
      additiveFieldMappings: [],
      formulaMappings: [
        {
          targetFieldName: 'ScoreX2',
          formula: "sourceField['Score'] * 2",
          targetFieldReturntype: 'Number',
        },
      ],
    },
  };
}

const options = { allowProcessing: true, verifyInput: async () => {}, wait: async () => {} };

test('two Engagement streams on one connection create, repeat unchanged, add a formula, refuse a removal and notice a label', async () => {
  const { clients, writes } = org();
  // Create: only the key as DLO field, the event time, the formula and the typed source fields.
  const first = await executeDataStream(file('CliEvA'), clients, options);
  assert.equal(first.outcome, 'created', JSON.stringify(first.diagnostics));
  assert.deepEqual(first.diagnostics, []);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body.dataLakeObjectInfo.dataLakeFieldInputRepresentations, [
    { name: 'EventId', label: 'EventId', dataType: 'Text', isPrimaryKey: true },
  ]);
  assert.equal(writes[0].body.dataLakeObjectInfo.category, 'Engagement');
  assert.equal(writes[0].body.dataLakeObjectInfo.eventDateTimeFieldName, 'EventTime');
  assert.deepEqual(writes[0].body.mappings, [
    {
      targetFieldName: 'ScoreX2',
      transformationFormula: "sourceField['Score'] * 2",
      targetFieldReturntype: 'Number',
    },
  ]);
  assert.deepEqual(
    writes[0].body.sourceFields,
    typed.map(([name, dataType]) => ({ name, dataType })),
  );
  // A second stream on the same connection, for the other event.
  const second = await executeDataStream(file('CliEvB'), clients, options);
  assert.equal(second.outcome, 'created', JSON.stringify(second.diagnostics));
  assert.equal(second.targetApiName, 'CliConn_CliEvB_00000002');
  assert.equal(writes.length, 2);

  // Retrieve: a normal stream file, formula decoded; its repeat deploy sends nothing.
  const retrieved = await retrieveNativeDataStream(
    first.targetApiName,
    clients,
    'default',
    false,
    'retrieve',
  );
  assert.equal(retrieved.spec.event, 'CliEvA');
  assert.deepEqual(retrieved.spec.formulaMappings, file('CliEvA').spec.formulaMappings);
  const preview = await preflightDataStream(retrieved, clients);
  assert.equal(preview.outcome, 'unchanged');
  const repeat = await executeDataStream(retrieved, clients, options);
  assert.equal(repeat.outcome, 'unchanged', JSON.stringify(repeat.diagnostics));
  assert.equal(writes.length, 2);

  // Update: one PATCH with the added formula only.
  const added = structuredClone(retrieved);
  added.spec.formulaMappings.push({
    targetFieldName: 'ScoreX3',
    formula: "sourceField['Score'] * 3",
    targetFieldReturntype: 'Number',
  });
  const updatePreview = await preflightDataStream(added, clients);
  assert.equal(updatePreview.outcome, 'update');
  const update = await executeDataStream(added, clients, options);
  assert.equal(update.outcome, 'updated', JSON.stringify(update.diagnostics));
  assert.deepEqual(writes[2], {
    method: 'PATCH',
    body: {
      datastreamType: 'INGEST_API',
      mappings: [
        {
          targetFieldName: 'ScoreX3',
          transformationFormula: "sourceField['Score'] * 3",
          targetFieldReturntype: 'Number',
        },
      ],
    },
  });
  const again = await executeDataStream(added, clients, options);
  assert.equal(again.outcome, 'unchanged');

  // Removal is sent; Salesforce's 400 is reported as its refusal.
  const removed = structuredClone(added);
  removed.spec.formulaMappings = removed.spec.formulaMappings.filter(
    (entry) => entry.targetFieldName !== 'ScoreX3',
  );
  const refusal = await executeDataStream(removed, clients, options);
  assert.equal(refusal.outcome, 'failed');
  assert.equal(refusal.mutation, 'rejected');
  assert.deepEqual(writes.at(-1).body, {
    datastreamType: 'INGEST_API',
    mappings: [{ targetFieldName: 'ScoreX3', transformationFormula: '' }],
  });

  // A label change is sent; Salesforce keeps its label, which is a notice.
  const relabelled = structuredClone(added);
  relabelled.spec.label = 'Another label';
  const label = await executeDataStream(relabelled, clients, options);
  assert.equal(label.outcome, 'updated', JSON.stringify(label.diagnostics));
  assert.deepEqual(writes.at(-1).body, { datastreamType: 'INGEST_API', label: 'Another label' });
  assert.deepEqual(
    label.diagnostics.map((entry) => entry.code),
    ['STREAM_CHANGE_NOT_APPLIED'],
  );
});

test('a DLO setting the PATCH cannot change stays refused before any write', async () => {
  const { clients, writes } = org();
  const created = await executeDataStream(file('CliEvA'), clients, options);
  const retrieved = await retrieveNativeDataStream(created.targetApiName, clients);
  const changed = structuredClone(retrieved);
  changed.spec.newDlo.category = 'Other';
  const result = await executeDataStream(changed, clients, options);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.diagnostics[0].code, 'UNSUPPORTED_STREAM_SETTINGS_CHANGE');
  assert.equal(writes.length, 1);
});

test('a new return type for an existing formula is refused before any write', async () => {
  const { clients, writes } = org();
  const created = await executeDataStream(file('CliEvA'), clients, options);
  const retrieved = await retrieveNativeDataStream(created.targetApiName, clients);
  const changed = structuredClone(retrieved);
  changed.spec.formulaMappings[0].targetFieldReturntype = 'Text';
  await assert.rejects(preflightDataStream(changed, clients), (error) => {
    assert.equal(error.code, 'UNSUPPORTED_STREAM_SETTINGS_CHANGE');
    assert.match(error.message, /spec\.formulaMappings\[ScoreX2\]\.targetFieldReturntype/u);
    return true;
  });
  const result = await executeDataStream(changed, clients, options);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(result.diagnostics[0].code, 'UNSUPPORTED_STREAM_SETTINGS_CHANGE');
  assert.equal(writes.length, 1);
});

test('deleting the last stream of a connection waits while the list still names it after its 404', async () => {
  const { clients, streams } = org();
  const created = await executeDataStream(file('CliEvA'), clients, options);
  const result = await deleteNativeDataStream(created.targetApiName, clients, {
    deleteDlo: true,
    verifyInput: async () => {},
    survivorDloNames: [],
    wait: async () => {},
  });
  assert.equal(result.operation, 'delete');
  assert.equal(streams.size, 0);
});

/**
 * The org of `org()` with the live delete sequence of `F:/Temp/fx-live-Bb46v5/logs/i17-delete.json`:
 * after the DELETE the stream still reads three times (DELETING, disabled) while the list returns its
 * earlier ACTIVE entry, then reads 404 while the list still names it and the event stays In Use,
 * and its DLO still reads once (DELETING) after the stream's 404.
 * @returns {object} Clients, the deleted stream count and the DELETE calls.
 */
async function deletingOrg() {
  const { clients, streams } = org();
  const created = await executeDataStream(file('CliEvA'), clients, options);
  const before = structuredClone(streams.get(created.targetApiName));
  const deletes = [];
  let deleted = false;
  let deleting = 3;
  let listed = 3;
  let inUse = 4;
  let dloReads = 1;
  const base = clients;
  const wrapped = {
    ...base,
    streams: {
      ...base.streams,
      get: async (identity) => {
        if (deleted && deleting > 0 && [before.name, before.recordId].includes(identity)) {
          deleting--;
          return {
            ...structuredClone(before),
            status: 'DELETING',
            isEnabled: false,
            dataLakeObjectInfo: {
              ...structuredClone(before.dataLakeObjectInfo),
              status: 'DELETING',
            },
          };
        }
        return base.streams.get(identity);
      },
      list: async (name) => {
        if (deleted && listed > 0) {
          listed--;
          return [structuredClone(before)];
        }
        return base.streams.list(name);
      },
      delete: async (recordId, cascade) => {
        deletes.push([recordId, cascade]);
        deleted = true;
        await base.streams.delete(recordId, cascade);
      },
    },
    connections: {
      ...base.connections,
      schema: async (id) => {
        const result = await base.connections.schema(id);
        if (deleted && inUse > 0) {
          inUse--;
          result.schemas.find((entry) => entry.name === 'CliEvA').availabilityStatus = 'In Use';
        }
        return result;
      },
    },
    dlo: {
      get: async (identity) => {
        if (deleted && deleting === 0 && dloReads > 0) {
          dloReads--;
          return {
            dataLakeObjects: [
              {
                name: before.dataLakeObjectInfo.name,
                status: 'DELETING',
                id: '1dl000000000001AAA',
              },
            ],
          };
        }
        return base.dlo.get(identity);
      },
    },
  };
  return { clients: wrapped, streams, deletes, apiName: created.targetApiName };
}

test('a stream and DLO deleted with --delete-dlo through DELETING reads is reported as deleted', async () => {
  const { clients, streams, deletes, apiName } = await deletingOrg();
  const result = await executeDeleteDataStream(apiName, clients, {
    deleteDlo: true,
    verifyInput: async () => {},
    wait: async () => {},
  });
  assert.equal(result.outcome, 'deleted', JSON.stringify(result.diagnostics));
  assert.equal(result.mutation, 'confirmed-deleted');
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0][1], true);
  assert.equal(streams.size, 0);
});

test('list and detail of a stream that disagree before the DELETE still refuse it', async () => {
  const { clients, deletes, apiName } = await deletingOrg();
  const drifted = {
    ...clients,
    streams: {
      ...clients.streams,
      get: async (identity) => ({ ...(await clients.streams.get(identity)), isEnabled: false }),
    },
  };
  const result = await executeDeleteDataStream(apiName, drifted, {
    deleteDlo: true,
    verifyInput: async () => {},
    wait: async () => {},
  });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.mutation, 'not-attempted');
  assert.equal(result.diagnostics[0].code, 'STREAM_BINDING_DRIFT');
  assert.equal(deletes.length, 0);
});
