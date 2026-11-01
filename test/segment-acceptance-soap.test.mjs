import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  parseSegmentSoapRequest,
  parseSegmentRetrieveResponse,
  parseSegmentRetrieveStatusResponse,
} from '../scripts/segment-acceptance-soap.mjs';
import { createSegmentAcceptance } from '../scripts/segment-acceptance-controls.mjs';

const require = createRequire(import.meta.url);
const { SOAP } = require('@jsforce/jsforce-node/lib/soap.js');
const { Connection } = require('@jsforce/jsforce-node');
const metadata = 'http://soap.sforce.com/2006/04/metadata';
const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const syntheticSession = 'SYNTHETIC_NOT_AUTH!session';
const profile = {
  executable: 'F:/Node/node.exe',
  cliEntry: 'F:/cli/bin/run.js',
  launcherEntry: 'F:/scratch/launcher.mjs',
  importOrigin: 'F:/installed/lib/index.js',
  cwd: 'F:/scratch/project',
  orgId: '00D000000000001AAA',
  targetOrg: 'source',
  origin: 'https://source.example',
  apiVersion: '65.0',
  segment: 'Selected',
  dmo: 'Profile__dlm',
  field: 'Id__c',
};
const jobId = '09S000000000001AAA';
const active = new Set([jobId]);
// The real installed serializer is used directly. No invoke/request/auth/network methods run.
const serializer = new SOAP(
  new Connection({ accessToken: syntheticSession, instanceUrl: profile.origin, version: '65.0' }),
  { xmlns: metadata, endpointUrl: `${profile.origin}/services/Soap/m/65.0` },
);
const wire = (message) => serializer._createEnvelope(message);
const retrieveMessage = () => ({
  retrieve: {
    request: {
      apiVersion: '65.0',
      singlePackage: true,
      unpackaged: {
        types: { members: profile.segment, name: 'MarketSegmentDefinition' },
        version: '65.0',
      },
    },
  },
});
const response = (operation, fields) =>
  `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="${soap}"><s:Body><${operation}Response xmlns="${metadata}"><result>${fields}</result></${operation}Response></s:Body></s:Envelope>`;
const identity = () =>
  response('retrieve', `<done>false</done><id>${jobId}</id><state>Queued</state>`);
const status = (fields = '<done>false</done><status>InProgress</status><success>false</success>') =>
  response('checkRetrieveStatus', `<id>${jobId}</id>${fields}`);
const parsedPoll = (includeZip) =>
  parseSegmentSoapRequest(
    profile,
    wire({ checkRetrieveStatus: { asyncProcessId: jobId, includeZip } }),
    active,
  );
const refused = (callback) =>
  assert.throws(
    callback,
    (error) =>
      error.message === 'SEGMENT_ACCEPTANCE: SOAP evidence refused' &&
      !error.message.includes(syntheticSession),
  );

test('installed JSforce serializer: SessionHeader read and exact selected retrieve', () => {
  const read = parseSegmentSoapRequest(
    profile,
    wire({ readMetadata: { type: 'CustomObject', fullNames: [profile.dmo] } }),
  );
  assert.deepEqual(read, {
    namespace: metadata,
    operation: 'readMetadata',
    type: 'CustomObject',
    fullNames: [profile.dmo],
  });
  const retrieve = parseSegmentSoapRequest(profile, wire(retrieveMessage()));
  assert.deepEqual(retrieve, {
    namespace: metadata,
    operation: 'retrieve',
    apiVersion: '65.0',
    singlePackage: true,
    types: [{ name: 'MarketSegmentDefinition', members: [profile.segment] }],
  });
  assert.equal(JSON.stringify([read, retrieve]).includes(syntheticSession), false);
  assert.ok(Object.isFrozen(retrieve.types[0].members));
});

test('installed serializer respects alternate object property order without extra fields', () => {
  const message = {
    retrieve: {
      request: {
        unpackaged: {
          version: '65.0',
          types: { name: 'MarketSegmentDefinition', members: [profile.segment] },
        },
        singlePackage: true,
        apiVersion: '65.0',
      },
    },
  };
  assert.equal(parseSegmentSoapRequest(profile, wire(message)).operation, 'retrieve');
});

test('actual omitted includeZip is true; explicit false and true map separately', () => {
  const omitted = parseSegmentSoapRequest(
    profile,
    wire({ checkRetrieveStatus: { asyncProcessId: jobId } }),
    active,
  );
  assert.deepEqual(omitted, {
    namespace: metadata,
    operation: 'retrieveResult',
    jobId,
    includeZip: true,
  });
  assert.equal(parsedPoll(false).operation, 'checkRetrieveStatus');
  assert.equal(parsedPoll(true).operation, 'retrieveResult');
  refused(() =>
    parseSegmentSoapRequest(profile, wire({ checkRetrieveStatus: { asyncProcessId: jobId } })),
  );
  refused(() =>
    parseSegmentSoapRequest(
      profile,
      wire({ checkRetrieveStatus: { asyncProcessId: jobId, includeZip: '1' } }),
      active,
    ),
  );
});

test('request rejects multiple operations, wrong bindings, unknown fields, unauthenticated/header operations', () => {
  const valid = wire(retrieveMessage());
  const variants = [
    valid.replace('</soapenv:Body>', '<deleteMetadata></deleteMetadata></soapenv:Body>'),
    valid.replace(
      '</soapenv:Header>',
      '<CallOptions><client>other</client></CallOptions></soapenv:Header>',
    ),
    valid.replace(
      '</SessionHeader>',
      '</SessionHeader><SessionHeader><sessionId>other</sessionId></SessionHeader>',
    ),
    valid.replace('<sessionId>', '<sessionId unexpected="true">'),
    valid.replace('<SessionHeader>', '<SessionHeader xmlns="urn:wrong">'),
    valid.replace(/<SessionHeader>.*?<\/SessionHeader>/u, ''),
    valid.replace(metadata, 'urn:wrong'),
    valid.replace('MarketSegmentDefinition', 'CustomObject'),
    valid.replace('<members>Selected</members>', '<members>Other</members>'),
    valid.replace('<apiVersion>65.0</apiVersion>', '<apiVersion>66.0</apiVersion>'),
    valid.replace('<version>65.0</version>', '<version>64.0</version>'),
    valid.replace('<singlePackage>true</singlePackage>', '<singlePackage>false</singlePackage>'),
    valid.replace('</request>', '<unknown>true</unknown></request>'),
    valid.replace('</types>', '<members>Other</members></types>'),
    valid.replace('<request>', '<retrieveRequest>').replace('</request>', '</retrieveRequest>'),
    valid.replace('</soapenv:Envelope>', '</soapenv:Envelope><extra xmlns="urn:extra"/>'),
    valid.replace('</request>', '</request><!--comment-->'),
    valid.replace('Selected', 'Select&#101;d'),
    '<!DOCTYPE root [<!ENTITY bad "Selected">]>' + valid,
  ];
  for (const xml of variants) refused(() => parseSegmentSoapRequest(profile, xml));
});

test('request rejects wrong read selection, status IDs, nested values and duplicate includeZip', () => {
  for (const message of [
    { readMetadata: { type: 'CustomField', fullNames: profile.dmo } },
    { readMetadata: { type: 'CustomObject', fullNames: [profile.dmo, 'Other'] } },
    { readMetadata: { type: 'CustomObject', fullNames: { nested: profile.dmo } } },
    { checkRetrieveStatus: { asyncProcessId: '09S000000000002AAA', includeZip: true } },
    { checkRetrieveStatus: { asyncProcessId: jobId, includeZip: [true, false] } },
    { checkStatus: { asyncProcessId: jobId } },
  ])
    refused(() => parseSegmentSoapRequest(profile, wire(message), active));
});

test('response registers only a raw uniquely bound retrieve identity and rejects replay', () => {
  const result = parseSegmentRetrieveResponse(profile, identity(), {
    operationId: 'read-1',
    seenJobs: new Set(),
  });
  assert.deepEqual(result, {
    operationId: 'read-1',
    jobId,
    orgId: profile.orgId,
    apiVersion: '65.0',
  });
  refused(() =>
    parseSegmentRetrieveResponse(profile, identity(), { operationId: 'read-2', seenJobs: active }),
  );
  refused(() => parseSegmentRetrieveResponse(profile, identity(), { operationId: 'read-2' }));
  for (const xml of [
    identity().replace(`<id>${jobId}</id>`, `<id>${jobId}</id><id>${jobId}</id>`),
    identity().replace('Queued', 'Failed'),
    identity().replace('<done>false</done>', '<done>true</done>'),
    identity().replace('</result>', '<unknown>value</unknown></result>'),
    identity().replace(
      '</s:Body>',
      '<retrieveResponse xmlns="' + metadata + '"><result/></retrieveResponse></s:Body>',
    ),
    identity().replace(metadata, 'urn:wrong'),
    identity().replace('</result>', '<status>Queued</status></result>'),
    identity().replace('</result>', '<zipFile>UEs=</zipFile></result>'),
    identity().replace(`<id>${jobId}</id>`, '<id>not-a-job</id>'),
  ])
    refused(() =>
      parseSegmentRetrieveResponse(profile, xml, { operationId: 'read-2', seenJobs: new Set() }),
    );
});

test('raw response namespace resolution is prefix independent and rejects ambiguity/entities/faults', () => {
  const xml = `<env:Envelope xmlns:env="${soap}" xmlns:m="${metadata}"><env:Header/><env:Body><m:retrieveResponse><m:result><m:done>false</m:done><m:id>${jobId}</m:id><m:state>Queued</m:state></m:result></m:retrieveResponse></env:Body></env:Envelope>`;
  assert.equal(
    parseSegmentRetrieveResponse(profile, xml, { operationId: 'r', seenJobs: new Set() }).jobId,
    jobId,
  );
  for (const bad of [
    xml.replace('<m:id>', '<m:id xmlns:m="urn:wrong">'),
    xml.replace('<m:state>', '<m:state xsi:nil="true">'),
    xml.replace('Queued', 'Queu&amp;ed'),
    xml.replace('<env:Header/>', '<env:Header><m:Other/></env:Header>'),
    '<!DOCTYPE x>' + xml,
    xml.replace('retrieveResponse', 'Fault'),
  ])
    refused(() =>
      parseSegmentRetrieveResponse(profile, bad, { operationId: 'r', seenJobs: new Set() }),
    );
});

test('includeZip pending poll is read-success but MUST NOT close the active job', () => {
  for (const includeZip of [false, true]) {
    assert.deepEqual(
      parseSegmentRetrieveStatusResponse(profile, status(), parsedPoll(includeZip)),
      { jobId, includeZip, done: false, outcome: 'success', zipPresent: false, closeJob: false },
    );
  }
});

test('completed status-only remains open, only successful ZIP completion closes', () => {
  const complete = '<done>true</done><status>Succeeded</status><success>true</success>';
  assert.equal(
    parseSegmentRetrieveStatusResponse(profile, status(complete), parsedPoll(false)).closeJob,
    false,
  );
  assert.deepEqual(
    parseSegmentRetrieveStatusResponse(
      profile,
      status(complete + '<zipFile>UEs=</zipFile>'),
      parsedPoll(true),
    ),
    { jobId, includeZip: true, done: true, outcome: 'success', zipPresent: true, closeJob: true },
  );
  refused(() => parseSegmentRetrieveStatusResponse(profile, status(complete), parsedPoll(true)));
  refused(() =>
    parseSegmentRetrieveStatusResponse(
      profile,
      status(complete + '<zipFile>UEs=</zipFile>'),
      parsedPoll(false),
    ),
  );
});

test('terminal failure is redacted and contradictions/wrong job/result shape fail closed', () => {
  const failed = status(
    '<done>true</done><status>Failed</status><success>false</success><errorMessage>private server detail</errorMessage>',
  );
  const result = parseSegmentRetrieveStatusResponse(profile, failed, parsedPoll(true));
  assert.equal(result.outcome, 'failure');
  assert.equal(result.closeJob, false);
  assert.equal(JSON.stringify(result).includes('private'), false);
  for (const xml of [
    status().replace(jobId, '09S000000000002AAA'),
    status().replace('</result>', '<id>' + jobId + '</id></result>'),
    status().replace('InProgress', 'Succeeded'),
    status().replace('<success>false</success>', '<success>true</success>'),
    status().replace('</result>', '<zipFile>UEs=</zipFile></result>'),
    failed.replace('<success>false</success>', '<success>true</success>'),
    status(
      '<done>true</done><status>Succeeded</status><success>true</success><zipFile>***</zipFile>',
    ),
    status().replace('</result>', '<messages><unexpected>no</unexpected></messages></result>'),
  ])
    refused(() => parseSegmentRetrieveStatusResponse(profile, xml, parsedPoll(true)));
});

test('synthetic ledger consumes request and raw registration with exact counters', () => {
  const ledger = createSegmentAcceptance(profile, { now: () => 0 });
  ledger.beginPhase(
    'inspection',
    { orgProcesses: 1, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 },
    { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 },
  );
  const descriptor = (id, body) => ({
    id,
    body,
    method: 'POST',
    url: `${profile.origin}/services/Soap/m/65.0/${profile.orgId}`,
    orgId: profile.orgId,
    apiVersion: '65.0',
    redirect: 'error',
  });
  ledger.dispatchRead(
    descriptor('retrieve', parseSegmentSoapRequest(profile, wire(retrieveMessage()))),
  );
  ledger.registerMetadataJob(
    parseSegmentRetrieveResponse(profile, identity(), {
      operationId: 'retrieve',
      seenJobs: new Set(),
    }),
  );
  ledger.dispatchRead(descriptor('poll', parsedPoll(false)));
  const evidence = parseSegmentRetrieveStatusResponse(profile, status(), parsedPoll(false));
  ledger.observeResult({ id: 'poll', outcome: evidence.outcome });
  assert.deepEqual(ledger.audit().used, { orgProcesses: 0, metadataJobs: 1, logicalReads: 2 });
  assert.deepEqual(ledger.audit().activeJobs, [jobId]);
  ledger.dispatchRead(descriptor('result', parsedPoll(true)));
  const complete = parseSegmentRetrieveStatusResponse(
    profile,
    status(
      '<done>true</done><status>Succeeded</status><success>true</success><zipFile>UEs=</zipFile>',
    ),
    parsedPoll(true),
  );
  assert.equal(complete.closeJob, true);
  ledger.observeResult({ id: 'result', outcome: complete.outcome, completion: complete });
  assert.deepEqual(ledger.audit().activeJobs, []);
  assert.deepEqual(ledger.audit().pending, []);
  assert.equal(ledger.audit().used.logicalReads, 3);
});
