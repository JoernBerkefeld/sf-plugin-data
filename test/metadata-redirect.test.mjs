import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { inspect } from 'node:util';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import {
  MetadataReadError,
  readCalculatedInsightMetadata,
  readDmoMetadata,
} from '../lib/services/read-metadata.js';
import { getConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { operationDiagnostic } from '../lib/services/operation-diagnostic.js';

// Loopback HTTP fixtures exercise installed core -> Metadata -> SOAP -> transport -> request.
const listen = async (handler) => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
};
const close = (server) => new Promise((resolve) => server.close(resolve));
const coreConnection = (origin) => {
  const connection = new Connection({
    authInfo: { getUsername: () => 'synthetic' },
    connectionOptions: {
      instanceUrl: origin,
      version: '65.0',
      accessToken: 'synthetic-soap-secret',
    },
  });
  // The machine may have a proxy configured; only this fixture bypasses it for loopback.
  const transport = connection._transport;
  connection._transport = Object.create(transport);
  connection._transport.httpRequest = (request, options) =>
    transport.httpRequest(request, { ...options, httpProxy: '' });
  return connection;
};

test('installed core SOAP stack refuses every same/cross-origin redirect without a second request', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    for (const crossOrigin of [false, true]) {
      let requests = 0;
      let escaped = 0;
      const foreign = await listen((_request, response) => {
        escaped++;
        response.end('secret-foreign-payload');
      });
      const local = await listen(async (request, response) => {
        requests++;
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString();
        assert.match(body, /<sessionId>synthetic-soap-secret<\/sessionId>/u);
        assert.match(body, /<readMetadata>/u);
        assert.match(body, /<fullNames>Fixture__dlm<\/fullNames>/u);
        response.writeHead(status, {
          location: `${crossOrigin ? foreign.origin : local.origin}/secret-location`,
        });
        response.end('secret-redirect-payload');
      });
      try {
        const connection = coreConnection(local.origin);
        const metadata = connection.metadata;
        const transport = connection._transport;
        const refresh = connection._refreshDelegate;
        await assert.rejects(readDmoMetadata(connection, 'Fixture__dlm'), (error) => {
          assert.equal(error.code, 'METADATA_REDIRECT_REFUSED');
          assert.ok(!/secret|location|payload/u.test(inspect(error)));
          return true;
        });
        assert.equal(requests, 1);
        assert.equal(escaped, 0);
        assert.equal(connection.metadata, metadata);
        assert.equal(metadata._conn, connection);
        assert.equal(connection._transport, transport);
        assert.equal(connection._refreshDelegate, refresh);
      } finally {
        await close(local.server);
        await close(foreign.server);
      }
    }
  }
});

for (const message of ['Reduce the ruleset count to 10.', 'Bearer private-credential'])
  test(`actual Metadata SOAP fault privately retains safe structured leaves: ${message}`, async () => {
    let requests = 0;
    const local = await listen(async (request, response) => {
      requests++;
      for await (const chunk of request) assert.ok(chunk.length > 0);
      response.writeHead(500, { 'content-type': 'text/xml', 'x-sfdc-request-id': 'req-12345678' });
      response.end(
        `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>INVALID_INPUT</faultcode><faultstring>${message}</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`,
      );
    });
    try {
      await assert.rejects(
        readDmoMetadata(coreConnection(local.origin), 'Fixture__dlm'),
        (error) => {
          assert.equal(error.code, 'ACQUISITION_FAILED');
          assert.equal(getConnectDiagnostic(error).statusCode, 500);
          assert.equal(getConnectDiagnostic(error).errors[0].code, 'INVALID_INPUT');
          const rendered = operationDiagnostic(error, 'Metadata acquisition failed.');
          assert.match(rendered, /Request ID: req-12345678/u);
          if (!message.startsWith('Bearer')) assert.match(rendered, /ruleset count to 10/u);
          assert.doesNotMatch(
            rendered + inspect(error) + JSON.stringify(error),
            /private-credential|synthetic-soap-secret/u,
          );
          return true;
        },
      );
      assert.equal(requests, 1);
    } finally {
      await close(local.server);
    }
  });

test('Metadata thrown data without actual HTTP failure is not admitted', async () => {
  const connection = coreConnection('http://127.0.0.1');
  connection.metadata.read = async () => {
    throw Object.assign(new Error('private-credential'), {
      data: { errorCode: 'INVALID_INPUT', message: 'Reduce the ruleset count to 10.' },
    });
  };
  await assert.rejects(readDmoMetadata(connection, 'Fixture__dlm'), (error) => {
    assert.equal(error.code, 'ACQUISITION_FAILED');
    assert.equal(getConnectDiagnostic(error), undefined);
    assert.doesNotMatch(inspect(error), /private-credential|ruleset/u);
    return true;
  });
});

test('guarded actual Metadata SOAP preserves successful core parsing and caller transport', async () => {
  const local = await listen(async (request, response) => {
    for await (const chunk of request) assert.ok(chunk.length > 0);
    response.writeHead(200, { 'content-type': 'text/xml' });
    response.end(
      '<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><readMetadataResponse xmlns="http://soap.sforce.com/2006/04/metadata"><result><records xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CustomObject"><fullName>Fixture__dlm</fullName><label>Fixture</label></records></result></readMetadataResponse></soapenv:Body></soapenv:Envelope>',
    );
  });
  try {
    const connection = coreConnection(local.origin);
    const transport = connection._transport;
    const records = await readDmoMetadata(connection, 'Fixture__dlm');
    assert.equal(records.length, 1);
    assert.equal(records[0].fullName, 'Fixture__dlm');
    assert.equal(records[0].label, 'Fixture');
    assert.equal(connection._transport, transport);
    assert.equal(connection.metadata._conn, connection);
  } finally {
    await close(local.server);
  }
});

test('calculated insight Metadata read admits only a qualified name on API65 and uses the fixed type', async () => {
  const reads = [];
  const connection = coreConnection('http://127.0.0.1');
  connection.metadata.read = async (type, fullNames) => {
    reads.push([type, fullNames]);
    return [{ fullName: fullNames[0] }];
  };
  assert.deepEqual(await readCalculatedInsightMetadata(connection, 'Synthetic_Insight'), [
    { fullName: 'Synthetic_Insight' },
  ]);
  assert.deepEqual(reads, [['MktCalcInsightObjectDef', ['Synthetic_Insight']]]);
  const pinned68 = Object.create(connection);
  pinned68.getApiVersion = () => '68.0';
  for (const [receiver, fullName] of [
    [connection, ''],
    [connection, '../Synthetic'],
    [connection, 'Synthetic Insight'],
    [connection, '1Synthetic'],
    [pinned68, 'Synthetic_Insight'],
  ])
    await assert.rejects(readCalculatedInsightMetadata(receiver, fullName), (error) => {
      assert.ok(error instanceof MetadataReadError);
      assert.equal(error.name, 'MetadataReadError');
      assert.equal(error.code, 'INVALID_SCOPE');
      return true;
    });
  assert.equal(reads.length, 1);
});

test('Metadata read without an observable transport fails closed before any read', async () => {
  const connection = {
    getApiVersion: () => '65.0',
    metadata: { read: () => assert.fail('no unguarded read') },
  };
  for (const read of [
    () => readDmoMetadata(connection, 'Fixture__dlm'),
    () => readCalculatedInsightMetadata(connection, 'Synthetic_Insight'),
  ])
    await assert.rejects(read(), (error) => {
      assert.ok(error instanceof MetadataReadError);
      assert.equal(error.code, 'ACQUISITION_FAILED');
      return true;
    });
});
