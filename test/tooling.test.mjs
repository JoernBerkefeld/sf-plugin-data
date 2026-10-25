import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ESLint } from 'eslint';

test('ESLint autofix preserves standard starred JSDoc', async () => {
  const eslint = new ESLint({ fix: true });
  const source = '/**\n * Bootstrap documentation.\n */\nexport const example = true;\n';
  const [result] = await eslint.lintText(source, { filePath: 'src/example.ts' });
  assert.match(result.output ?? source, /\n \* Bootstrap documentation\./u);
  const configuration = await eslint.calculateConfigForFile('src/example.ts');
  assert.equal(configuration.rules['unicorn/no-asterisk-prefix-in-documentation-comments'][0], 0);
});

test('capability checklist keeps every family unimplemented', async () => {
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
    assert.ok(checklist.includes(`## ${family}: unimplemented`), family);
  }
});
