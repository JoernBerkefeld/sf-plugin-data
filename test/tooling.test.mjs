import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';

const require = createRequire(import.meta.url);
const package_ = require('../package.json');
const workflow = await readFile('.github/workflows/npm-publish.yml', 'utf8');
const source = workflow.split("          node <<'NODE'\n")[1]?.split('          NODE')[0];
assert.ok(source, 'Publication guard must remain executable offline.');
const present = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
const absent = { status: 1, stdout: JSON.stringify({ error: { code: 'E404' } }), stderr: '' };

/**
 * Execute the actual workflow guard with offline npm responses.
 * @param {object[]} responses - Ordered synthetic subprocess results.
 * @returns {string[][]} Captured npm arguments.
 */
function runPublication(responses) {
  const calls = [];
  const context = {
    require: (id) => {
      if (id === './package.json') return package_;
      if (id === 'node:child_process')
        return {
          spawnSync: (_command, arguments_) => {
            calls.push(arguments_);
            assert.ok(responses.length, 'Unexpected npm call');
            return responses.shift();
          },
        };
      return require(id);
    },
    console: { log() {} },
    process: { stdout: { write() {} }, stderr: { write() {} } },
  };
  vm.runInNewContext(source, context);
  return calls;
}

test('publication skips only the exact existing version', () => {
  const calls = runPublication([present(package_.version)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], `${package_.name}@${package_.version}`);
  assert.throws(() => runPublication([present('99.0.0')]), /different identity/u);
});

test('publication permits an unpublished version of an existing package', () => {
  const calls = runPublication([absent, present(package_.name), present({})]);
  assert.equal(calls.length, 3);
  assert.equal(calls[1][1], package_.name);
  assert.equal(calls[2][0], 'publish');
  assert.ok(calls[2].includes('--provenance'));
  assert.ok(calls[2].includes('--registry=https://registry.npmjs.org/'));
});

test('publication blocks a first-ever package until user bootstrap', () => {
  assert.throws(() => runPublication([absent, absent]), /manually by the user/u);
  assert.throws(() => runPublication([absent, present('another-package')]), /different identity/u);
});

for (const failure of [
  { status: 1, stdout: JSON.stringify({ error: { code: 'E401' } }), stderr: '' },
  { status: 1, stdout: JSON.stringify({ error: { code: 'E403' } }), stderr: '' },
  { status: 1, stdout: JSON.stringify({ error: { code: 'ENETUNREACH' } }), stderr: '' },
  { status: 1, stdout: 'E404 not structured JSON', stderr: '' },
  { status: 1, stdout: '{invalid', stderr: '' },
  { status: 0, stdout: '{invalid', stderr: '' },
]) {
  test(`publication fails closed for ${failure.stdout}`, () => {
    assert.throws(() => runPublication([failure]));
    assert.throws(() => runPublication([absent, failure]));
  });
}

test('publication accepts structured E404 on stderr and pins trusted-publishing npm', () => {
  const calls = runPublication([
    { status: 1, stdout: '', stderr: absent.stdout },
    present(package_.name),
    present({}),
  ]);
  assert.equal(calls.length, 3);
  assert.match(workflow, /npm install --global npm@11\.5\.1/u);
  assert.ok(workflow.indexOf('npm@11.5.1') < workflow.indexOf('npm ci'));
});

test('ESLint autofix preserves standard starred JSDoc', async () => {
  const eslint = new ESLint({ fix: true });
  const source = '/**\n * Bootstrap documentation.\n */\nexport const example = true;\n';
  const [result] = await eslint.lintText(source, { filePath: 'src/example.ts' });
  assert.match(result.output ?? source, /\n \* Bootstrap documentation\./u);
  const configuration = await eslint.calculateConfigForFile('src/example.ts');
  assert.equal(configuration.rules['unicorn/no-asterisk-prefix-in-documentation-comments'][0], 0);
});

test('capability checklist accurately distinguishes bounded DMO retrieval from general support', async () => {
  const checklist = await readFile('docs/capabilities.md', 'utf8');
  for (const family of [
    'dlo',
    'dmo',
    'mapping',
    'identity-resolution',
    'data-graph',
    'segment',
    'calculated-insight',
  ]) {
    assert.ok(
      checklist.includes(
        family === 'dmo'
          ? '## dmo: general support unimplemented; bounded explicit retrieval available'
          : `## ${family}: unimplemented`,
      ),
      family,
    );
  }
});
