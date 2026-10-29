import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MappingAcquisitionError, retrieveMapping } from '../lib/services/retrieve-mapping.js';

const fields = ['Id__c', 'KQ_Id__c'];
const name = 'Probe_map_Probe';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ObjectSourceTargetMap xmlns="http://soap.sforce.com/2006/04/metadata">
<creationType>Custom</creationType>
<fieldSourceTargetMaps><creationType>Custom</creationType><filterApplied>false</filterApplied><filterOperationType>Equal</filterOperationType><isSourceFormula>false</isSourceFormula><sourceField>Probe__dll.Id__c</sourceField><targetField>Probe__dlm.Id__c</targetField></fieldSourceTargetMaps>
<masterLabel>Probe</masterLabel><sourceObjectName>Probe__dll</sourceObjectName><targetObjectName>Probe__dlm</targetObjectName>
</ObjectSourceTargetMap>\n`;

/**
 * Build independent synthetic exact-read seams, recording all transport calls.
 * @returns {object} Mutable evidence and readonly test seams.
 */
function fixture() {
  const mapping = {
    developerName: name,
    fieldMappings: fields.map((field) => ({
      developerName: `${field}_pair`,
      sourceFieldDeveloperName: field,
      targetFieldDeveloperName: field,
    })),
    sourceEntityDeveloperName: 'Probe__dll',
    targetEntityDeveloperName: 'Probe__dlm',
    status: 'ACTIVE',
  };
  const source = {
    name: 'Probe__dll',
    dataLakeFieldInfoRepresentation: fields.map((field) => ({
      name: field,
      future: { kept: true },
    })),
    unknown: { retain: [1, false] },
  };
  const target = { name: 'Probe__dlm', fields: fields.map((field) => ({ name: field })) };
  const schemas = Object.fromEntries(
    ['Probe__dll', 'Probe__dlm'].map((fullName) => [
      fullName,
      [
        {
          fullName,
          fields: fields.map((field) => ({
            fullName: field,
            unknownSemantics: { preserve: true },
          })),
          unknownObjectSemantics: 'retained',
        },
      ],
    ]),
  );
  const calls = [];
  const connection = {
    instanceUrl: 'https://example.my.salesforce.com',
    getApiVersion: () => '65.0',
    getUsername: () => 'source',
    request: async (request) => {
      calls.push(request);
      assert.equal(request.method, 'GET');
      if (request.url.endsWith(`/data-model-object-mappings/${name}`)) return mapping;
      if (request.url.endsWith('/data-lake-objects/Probe__dll')) return source;
      if (request.url.endsWith('/data-model-objects/Probe__dlm')) return target;
      assert.fail('Unexpected route');
    },
  };
  const metadata = async (org, selected) => {
    assert.equal(org, 'source');
    assert.equal(selected, name);
    return xml;
  };
  const soap = async (selected) => {
    calls.push({ method: 'SOAP_READ', selected });
    return schemas[selected];
  };
  return { mapping, source, target, schemas, calls, connection, metadata, soap };
}
const acquire = (f) => retrieveMapping(f.connection, name, '65.0', 'default', f.metadata, f.soap);

test('captures lossless correlated evidence, exact XML/hash and runtime-only pairs without candidate or writes', async () => {
  const f = fixture();
  const result = await acquire(f);
  assert.equal(Object.hasOwn(result, 'candidate'), false);
  assert.deepEqual(result.blockers, ['DLO_PRIMARY_QUALIFIER_CORRELATION_UNVERIFIED']);
  assert.equal(result.definitionXml, xml);
  assert.equal(
    result.expectations.projection.spec.definitionDigest,
    createHash('sha256').update(xml).digest('hex'),
  );
  assert.equal(result.expectations.projection.spec.runtimeOnlyPairs[0].sourceField, 'KQ_Id__c');
  assert.deepEqual(result.expectations.rawConnect, {
    mapping: f.mapping,
    source: f.source,
    target: f.target,
  });
  assert.deepEqual(result.expectations.rawSoap, {
    source: f.schemas.Probe__dll,
    target: f.schemas.Probe__dlm,
  });
  assert.equal(f.calls.length, 5);
  assert.deepEqual(
    f.calls.filter((call) => call.method === 'SOAP_READ').map((call) => call.selected),
    ['Probe__dll', 'Probe__dlm'],
  );
});

for (const [label, change] of Object.entries({
  mappingIdentity: (f) => {
    f.mapping.developerName = 'Other';
  },
  runtimePair: (f) => {
    f.mapping.fieldMappings.push(f.mapping.fieldMappings[0]);
  },
  xmlMismatch: (f) => {
    f.metadata = async () => xml.replace('Probe__dll.Id__c', 'Probe__dll.Other__c');
  },
  sourceIdentity: (f) => {
    f.source.name = 'Other__dll';
  },
  targetIdentity: (f) => {
    f.target.name = 'Other__dlm';
  },
  soapIdentity: (f) => {
    f.schemas.Probe__dll[0].fullName = 'Other__dll';
  },
  missingSoap: (f) => {
    f.schemas.Probe__dll = [];
  },
  ambiguousSoap: (f) => {
    f.schemas.Probe__dlm.push(f.schemas.Probe__dlm[0]);
  },
  malformedFields: (f) => {
    f.source.dataLakeFieldInfoRepresentation = {};
  },
  ambiguousFields: (f) => {
    f.schemas.Probe__dll[0].fields.push(f.schemas.Probe__dll[0].fields[0]);
  },
  missingRuntimeOnlyEndpoint: (f) => {
    f.source.dataLakeFieldInfoRepresentation.pop();
  },
  readFailure: (f) => {
    f.soap = async () => {
      throw new Error('secret remote payload');
    };
  },
})) {
  test(`rejects ${label} with typed payload-free error, not blocked success`, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(acquire(f), (error) => {
      assert.ok(error instanceof MappingAcquisitionError);
      assert.equal(error.message, 'Mapping evidence acquisition failed.');
      assert.ok(!JSON.stringify(error).includes('secret remote payload'));
      return true;
    });
  });
}

test('default SOAP seam reads exact CustomObject members through guarded independent receiver', async () => {
  const f = fixture();
  f.connection._transport = { httpRequest: () => assert.fail('No synthetic HTTP') };
  f.connection.metadata = {
    read: async function (type, names) {
      assert.equal(type, 'CustomObject');
      assert.equal(names.length, 1);
      assert.notEqual(this._conn, f.connection);
      assert.notEqual(this._conn._transport, f.connection._transport);
      f.calls.push({ method: 'SOAP_READ', selected: names[0] });
      return f.schemas[names[0]];
    },
  };
  const result = await retrieveMapping(f.connection, name, '65.0', 'default', f.metadata);
  assert.deepEqual(
    f.calls.filter((call) => call.method === 'SOAP_READ').map((call) => call.selected),
    ['Probe__dll', 'Probe__dlm'],
  );
  assert.equal(Object.hasOwn(result, 'candidate'), false);
});

test('invalid scope rejects before any reads', async () => {
  const f = fixture();
  await assert.rejects(
    retrieveMapping(f.connection, name, '67.0', 'default', f.metadata, f.soap),
    MappingAcquisitionError,
  );
  assert.equal(f.calls.length, 0);
});
