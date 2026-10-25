import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { inspect } from 'node:util';
import test from 'node:test';
import { Connection } from '@salesforce/core';
import { readDmoMetadata } from '../lib/services/retrieve-other-dmo.js';

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
