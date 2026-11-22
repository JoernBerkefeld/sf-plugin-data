import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { escapedCopyPath, refuseEscapedCopy } from '../lib/services/escaped-copy.js';

test('an escaped copy is a string that decodes once to exactly the org value', () => {
  assert.equal(escapedCopyPath({ label: 'A &amp; B' }, { label: 'A & B' }), 'label');
  assert.equal(
    escapedCopyPath(
      {
        spec: {
          fields: [
            { name: 'B', d: 'x' },
            { name: 'A', d: '&lt;a&gt;' },
          ],
        },
      },
      {
        spec: {
          fields: [
            { name: 'A', d: '<a>' },
            { name: 'B', d: 'x' },
          ],
        },
      },
    ),
    'spec.fields[1].d',
  );
  assert.equal(
    escapedCopyPath(
      [{ targetFieldName: 'T', formula: '&quot;x&quot;' }],
      [
        { targetFieldName: 'U', formula: 'y' },
        { targetFieldName: 'T', formula: '"x"' },
      ],
    ),
    '[0].formula',
  );
  // Equal (an entity Salesforce stores itself), another decoded text, or no entity: no match.
  for (const [file, org] of [
    ['A &amp; B', 'A &amp; B'],
    ['A &amp; B', 'A & C'],
    ['A & B', 'A & C'],
    ['&amp;lt;', '<'],
  ])
    assert.equal(escapedCopyPath({ v: file }, { v: org }), undefined, file);
  // A key only the file has is not compared.
  assert.equal(escapedCopyPath({ v: '&amp;' }, {}), undefined);
});

test('refuseEscapedCopy throws the given error with the path', () => {
  class Refusal extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  assert.throws(
    () => refuseEscapedCopy({ d: 'a &#39;b&#39;' }, { d: "a 'b'" }, (code) => new Refusal(code)),
    (error) =>
      error instanceof Refusal &&
      error.code === 'HTML_ESCAPED_FILE' &&
      /at d .*retrieve it again/iu.test(error.message),
  );
  refuseEscapedCopy({ d: 'same' }, { d: 'same' }, () => assert.fail('no refusal'));
});
