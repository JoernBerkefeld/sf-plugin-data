import assert from 'node:assert/strict';
import test from 'node:test';
import { placeDmo, translateDmoName } from 'salesforce-data360-rules';
import { crossSpaceContext, CrossSpaceError, DataSpaceError } from 'sf-plugin-data/api';

const instanceUrl = 'https://synthetic.example';

const rulesets = [
  {
    objectApiName: 'Individual_MKT',
    dataSpaceName: 'default',
    configurationType: 'Individual',
    reconciliationRules: [
      {
        entityName: 'ssot__Individual__dlm',
        unifiedDmoName: 'UnifiedssotIndividualMkt__dlm',
        linkDmoName: 'UnifiedLinkssotIndividualMkt__dlm',
      },
    ],
  },
  {
    objectApiName: 'ds2_Individual_mk2',
    dataSpaceName: 'dataspace2',
    configurationType: 'Individual',
    reconciliationRules: [
      {
        entityName: 'ds2_Individual__dlm',
        unifiedDmoName: 'ds2_UnifiedIndividualMk2__dlm',
        linkDmoName: 'ds2_UnifiedLinkIndividualMk2__dlm',
      },
    ],
  },
];

/**
 * A connection over a synthetic org with two data spaces and one ruleset in each.
 * @param {string[]} urls Receives every requested path.
 * @param {object} [options] Failure switches.
 * @param {boolean} [options.rulesetsFail] Answer the ruleset list with a malformed body.
 * @returns {object} Connection.
 */
const orgOf = (urls, options = {}) => ({
  instanceUrl,
  request: async (request) => {
    const url = new URL(typeof request === 'string' ? request : request.url);
    urls.push(url.pathname);
    if (url.pathname === '/services/data/v68.0/ssot/data-spaces')
      return {
        totalSize: 2,
        dataSpaces: [{ name: 'default' }, { name: 'dataspace2', prefix: 'ds2' }],
      };
    if (url.pathname === '/services/data/v68.0/ssot/identity-resolutions')
      return options.rulesetsFail ? {} : { identityResolutions: structuredClone(rulesets) };
    throw new Error(`unexpected ${url.pathname}`);
  },
});

test('crossSpaceContext reads the data spaces with prefixes and the rulesets a unified DMO needs', async () => {
  const urls = [];
  const context = await crossSpaceContext(orgOf(urls), {
    from: 'default',
    to: 'dataspace2',
    names: ['UnifiedssotIndividualMkt__dlm'],
  });
  assert.deepEqual(context.spaces, [{ name: 'default' }, { name: 'dataspace2', prefix: 'ds2' }]);
  assert.equal(context.rulesets.length, 2);
  assert.deepEqual(urls, [
    '/services/data/v68.0/ssot/data-spaces',
    '/services/data/v68.0/ssot/identity-resolutions',
  ]);
  assert.equal(
    placeDmo(context, 'UnifiedssotIndividualMkt__dlm').name,
    'ds2_UnifiedIndividualMk2__dlm',
  );
  assert.equal(translateDmoName(context, 'ssot__Individual__dlm').name, 'ds2_Individual__dlm');
});

test('crossSpaceContext skips the ruleset read when no name needs it, and reads it without names', async () => {
  const urls = [];
  const context = await crossSpaceContext(orgOf(urls), {
    from: 'default',
    to: 'dataspace2',
    names: ['ssot__Individual__dlm'],
  });
  assert.equal(context.rulesets, undefined);
  assert.deepEqual(urls, ['/services/data/v68.0/ssot/data-spaces']);
  const all = await crossSpaceContext(orgOf([]), { from: 'default', to: 'dataspace2' });
  assert.equal(all.rulesets.length, 2);
});

test('crossSpaceContext refuses a data space the org does not have', async () => {
  await assert.rejects(
    crossSpaceContext(orgOf([]), { from: 'default', to: 'dataspace9' }),
    (error) => {
      assert.ok(error instanceof DataSpaceError);
      assert.equal(error.code, 'UNKNOWN_DATASPACE');
      assert.match(error.message, /no data space named dataspace9/u);
      return true;
    },
  );
});

test('crossSpaceContext reports a ruleset list it cannot read', async () => {
  await assert.rejects(
    crossSpaceContext(orgOf([], { rulesetsFail: true }), { from: 'default', to: 'dataspace2' }),
    (error) =>
      error instanceof CrossSpaceError && error.code === 'CROSS_DATASPACE_RULESETS_READ_FAILED',
  );
});
