import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Deploy from '../lib/commands/data360/deploy.js';
import { GitSelectionError } from '../lib/artifacts/git-deploy-selection.js';

const provenance = {
  repositoryRoot: process.cwd(),
  requestedRef: 'main',
  referenceCommit: 'a'.repeat(40),
  headCommit: 'b'.repeat(40),
  mergeBase: 'c'.repeat(40),
};
const invocation = (overrides = {}, paths = ['selected.json']) => {
  const calls = [];
  const flags = {
    'changed-since': 'main',
    'api-version': '65.0',
    'data-space': 'default',
    preview: true,
    'target-org': {
      getOrgId: () => {
        calls.push('org');
        return 'synthetic';
      },
      getConnection: (version) => {
        assert.equal(version, '65.0');
        calls.push('connection');
        return {};
      },
    },
    ...overrides,
  };
  const command = Object.create(Deploy.prototype);
  command.parse = async () => ({ flags });
  command.jsonEnabled = () => true;
  command.selectGitInputs = async (options) => {
    calls.push('git');
    assert.deepEqual(options, { cwd: process.cwd(), ref: 'main' });
    return { paths, provenance };
  };
  command.resolveInputs = async (options) => {
    calls.push('inputs');
    assert.deepEqual(options, { cwd: process.cwd(), sourceDir: paths, metadata: undefined });
    return [
      {
        path: paths[0],
        document: { identity: { dataSpace: 'default', apiName: 'Selected__dlm' } },
      },
    ];
  };
  command.preflight = async (document, connection, selection, space) => {
    calls.push('preflight');
    assert.equal(document.identity.apiName, 'Selected__dlm');
    assert.deepEqual(selection, { requested: '65.0', restSelector: 'v65.0', soapNumeric: '65.0' });
    assert.equal(space, 'default');
    return { outcome: 'unchanged', target: 'present', absenceProof: 'none', diagnostics: [] };
  };
  command.execute = async () => {
    calls.push('execute');
    return { outcome: 'unchanged', mutation: 'not-attempted', diagnostics: [] };
  };
  return { command, calls };
};
const run = async (command) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return { result: await command.run(), exitCode: process.exitCode };
  } finally {
    process.exitCode = previous;
  }
};

for (const preview of [true, false]) {
  test(`Git selected paths delegate through unchanged API65 pipeline preview=${preview}`, async () => {
    const { command, calls } = invocation({ preview });
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(exitCode, undefined);
    assert.deepEqual(result.provenance.git, provenance);
    assert.equal(result.result.selection.changedSince, 'main');
    assert.deepEqual(calls, [
      'git',
      'inputs',
      'org',
      'connection',
      'preflight',
      ...(preview ? [] : ['execute']),
    ]);
  });
  test(`empty Git selection succeeds before input/org/service work preview=${preview}`, async () => {
    const { command, calls } = invocation({ preview, 'target-org': undefined }, []);
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'success');
    assert.equal(exitCode, undefined);
    assert.deepEqual(result.result.items, []);
    assert.deepEqual(calls, ['git']);
    assert.deepEqual(result.provenance.git, provenance);
    // eslint-disable-next-line unicorn/no-null -- The public JSON contract represents unresolved target identity as null.
    assert.equal(result.provenance.targetOrgId, null);
  });
}
for (const other of [{ metadata: ['dmo:Selected__dlm'] }, { 'source-dir': ['explicit.json'] }]) {
  test(`Git selector runtime exclusivity blocks before Git/services ${JSON.stringify(other)}`, async () => {
    const { command, calls } = invocation(other);
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.equal(result.diagnostics.errors[0].code, 'INVALID_SELECTION');
  });
}
for (const code of ['INVALID_GIT_SELECTION', 'BLOCKED_GIT_LIFECYCLE']) {
  test(`Git error ${code} becomes actionable blocked envelope before services`, async () => {
    const { command, calls } = invocation();
    command.selectGitInputs = async () => {
      throw new GitSelectionError(code);
    };
    const { result, exitCode } = await run(command);
    assert.equal(result.status, 'blocked');
    assert.equal(exitCode, 1);
    assert.deepEqual(calls, []);
    assert.equal(result.diagnostics.errors[0].code, code);
    if (code === 'BLOCKED_GIT_LIFECYCLE') {
      assert.match(result.diagnostics.errors[0].message, /any tracked worktree deletion/u);
      assert.match(result.diagnostics.errors[0].message, /Stage intended changes/u);
    }
  });
}
