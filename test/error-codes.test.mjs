import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  annotateDiagnostics,
  errorCodeInfo,
  errorFamilies,
  formatDiagnostic,
  registeredErrorCodes,
} from '../lib/errors/registry.js';
import { plugin } from '../lib/plugin.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const documentationRoot = path.join(root, 'docs', 'errors');

/**
 * Quoted SCREAMING_SNAKE literals in src that are not diagnostic codes: API enum values,
 * Salesforce's own codes, and internal values never shown as `{ code, message }`.
 */
const NOT_PLUGIN_CODES = new Set([
  'ANSI_SQL',
  'CALCULATED_METRIC',
  'DLO_PRIMARY_QUALIFIER_CORRELATION_UNVERIFIED',
  'INGEST_API',
  'INTERNAL_ERROR',
  'INVALID_SESSION_ID',
  'IN_USE',
  'ITEM_NOT_FOUND',
  'METADATA_ERROR_ENTITY_NOTFOUND',
  'NOT_SCHEDULED',
  'NO_REFRESH',
  'STREAMING_DATA_MODEL',
  'SYSTEM_MANAGED',
]);

const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );

const sourceLiterals = () => {
  const found = new Set();
  for (const file of files(path.join(root, 'src'))) {
    if (
      !file.endsWith('.ts') ||
      path.relative(path.join(root, 'src'), file).startsWith(`errors${path.sep}`)
    )
      continue;
    for (const match of readFileSync(file, 'utf8').matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)'/gu))
      found.add(match[1]);
  }
  return found;
};

const documentationPages = () =>
  files(documentationRoot)
    .filter(
      (file) => file.endsWith('.md') && path.relative(documentationRoot, file) !== 'README.md',
    )
    .map((file) => path.relative(documentationRoot, file).split(path.sep));

test('every code emitted in src has a registry entry', () => {
  const missing = [...sourceLiterals()].filter(
    (code) => !NOT_PLUGIN_CODES.has(code) && !errorCodeInfo(code),
  );
  assert.deepEqual(missing, [], 'add these codes to src/errors/codes/<family>.ts');
});

test('every registry entry is still emitted somewhere in src', () => {
  const emitted = sourceLiterals();
  const stale = registeredErrorCodes().filter((code) => !emitted.has(code));
  assert.deepEqual(stale, [], 'remove these codes from the registry and docs/errors');
  for (const code of NOT_PLUGIN_CODES) assert.equal(errorCodeInfo(code), undefined, code);
});

test('every code is registered once with a usable hint', () => {
  const seen = new Map();
  for (const [family, entries] of Object.entries(errorFamilies))
    for (const [code, hint] of Object.entries(entries)) {
      assert.equal(seen.get(code), undefined, `${code} is in ${seen.get(code)} and ${family}`);
      seen.set(code, family);
      assert.match(code, /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/u);
      assert.match(hint, /^\S.{9,250}[.!]$/u, `${code} hint`);
    }
});

test('every registry entry has a reference page with the standard sections', () => {
  for (const code of registeredErrorCodes()) {
    const { family, hint, docs } = errorCodeInfo(code);
    assert.equal(
      docs,
      `https://github.com/JoernBerkefeld/sf-plugin-data/blob/v${plugin.version}/docs/errors/${family}/${code}.md`,
    );
    let page;
    try {
      page = readFileSync(path.join(documentationRoot, family, `${code}.md`), 'utf8');
    } catch {
      assert.fail(`missing docs/errors/${family}/${code}.md`);
    }
    assert.ok(!page.startsWith('﻿') && !page.includes('\r'), `${code}: UTF-8 without BOM, LF`);
    assert.ok(page.startsWith(`# \`${code}\`\n\n> ${hint}\n`), `${code}: title and hint line`);
    let position = 0;
    for (const heading of [
      /^## What it means$/mu,
      /^## Why the plugin (?:stops|reports it)$/mu,
      /^## How to fix$/mu,
      /^## Example output$/mu,
      /^## Related codes$/mu,
    ]) {
      const match = heading.exec(page.slice(position));
      assert.ok(match, `${code}: ${heading.source}`);
      position += match.index + match[0].length;
    }
    for (const link of page.matchAll(/\]\(\.\.\/([a-z-]+)\/([A-Z0-9_]+)\.md\)/gu))
      assert.equal(errorCodeInfo(link[2])?.family, link[1], `${code}: link to ${link[2]}`);
  }
});

test('every reference page has a registry entry in the same family', () => {
  for (const parts of documentationPages()) {
    assert.equal(parts.length, 2, `unexpected page docs/errors/${parts.join('/')}`);
    const [family, file] = parts;
    const code = file.replace(/\.md$/u, '');
    assert.equal(errorCodeInfo(code)?.family, family, `docs/errors/${family}/${file}`);
  }
});

test('the docs index lists every code', () => {
  const index = readFileSync(path.join(documentationRoot, 'README.md'), 'utf8');
  for (const code of registeredErrorCodes())
    assert.ok(
      index.includes(`[\`${code}\`](${errorCodeInfo(code).family}/${code}.md)`),
      `${code} missing from docs/errors/README.md`,
    );
});

test('diagnostics get hint and docs in JSON and human output', () => {
  const [code] = registeredErrorCodes();
  const { hint, docs } = errorCodeInfo(code);
  const envelope = {
    diagnostics: { errors: [{ code, message: 'Salesforce said no.', retryable: false }] },
    result: {
      items: [
        {
          diagnostics: [{ code, message: 'm' }],
          preflight: { diagnostics: [{ code, message: 'p' }] },
        },
      ],
    },
    other: { code: 'NOT_A_REGISTERED_CODE', message: 'x' },
    file: { code, path: 'a.json' },
  };
  annotateDiagnostics(envelope);
  assert.deepEqual(envelope.diagnostics.errors[0], {
    code,
    message: 'Salesforce said no.',
    retryable: false,
    hint,
    docs,
  });
  assert.equal(envelope.result.items[0].diagnostics[0].hint, hint);
  assert.equal(envelope.result.items[0].preflight.diagnostics[0].docs, docs);
  assert.deepEqual(envelope.other, { code: 'NOT_A_REGISTERED_CODE', message: 'x' });
  assert.deepEqual(envelope.file, { code, path: 'a.json' });
  assert.equal(
    formatDiagnostic({ code, message: 'Salesforce said no.' }, 'dmo:X__dlm: '),
    `dmo:X__dlm: ${code}: Salesforce said no.\nHint: ${hint}\nDocs: ${docs}`,
  );
  assert.equal(formatDiagnostic({ code, message: hint }), `${code}: ${hint}\nDocs: ${docs}`);
  assert.equal(formatDiagnostic({ code: 'ENOENT', message: 'x' }), 'ENOENT: x');
});
