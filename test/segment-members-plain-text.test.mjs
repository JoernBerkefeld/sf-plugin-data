import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { openBoundSsot } from '../lib/transport/bound-ssot.js';
import { readDetailPages, readMemberPages } from '../lib/services/segment-members.js';

// Connect REST HTML-escapes every response string unless the request turns it off (live API 68,
// DB entry data360:connect-rest-entity-encoding-header-api68): the segment members export reads
// member rows and detail rows with that header too.
test('the members export asks for plain text on the members read and on query-sql', async () => {
  const requests = [];
  const sender = openBoundSsot('target', '68.0', async () => ({
    instanceUrl: 'https://synthetic.my.salesforce.com',
    request: async (request) => {
      requests.push(request);
      return request.method === 'POST'
        ? { status: { queryId: 'q1', completionStatus: 'Finished', rowCount: 0 } }
        : { data: [], totalCount: 0 };
    },
  }));
  const pages = [];
  for await (const page of readMemberPages(sender, '68.0', 'Audience', { offset: 0, limit: 10 }))
    pages.push(page);
  for await (const page of readDetailPages(sender, '68.0', 'SELECT 1', 1, 10)) pages.push(page);
  assert.equal(pages.length, 1);
  const [members, sql] = requests;
  assert.equal(members.method, 'GET');
  assert.match(members.url, /\/services\/data\/v68\.0\/ssot\/segments\/Audience\/members\?/u);
  assert.deepEqual(members.headers, { 'X-Chatter-Entity-Encoding': 'false' });
  assert.equal(sql.method, 'POST');
  assert.match(sql.url, /\/services\/data\/v68\.0\/ssot\/query-sql\?dataspace=default$/u);
  assert.deepEqual(sql.headers, {
    'content-type': 'application/json',
    'X-Chatter-Entity-Encoding': 'false',
  });
});
