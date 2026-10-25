# Transport/authentication slice handover

## Current receipt: 2026-10-25T15:28+01:00

The bounded read-only transport slice follows bootstrap commit
`27501961eb595b77bf5da83bcba0bbff51acde43`. Gate 1/2 approval and zero-must-fix
review were inherited; Gate 3 remains one small sequential slice. No whole-feature
code review is claimed. Pagination is intentionally the following slice.

### Implemented interfaces

- `ConnectClient.create(aliasOrUsername: string, apiVersion: string): Promise<ConnectClient>`
  delegates existing CLI authentication to `Org.create` and `getConnection(version)`.
- `new ConnectClient(connection, apiVersion)` accepts the narrow Salesforce-core
  `Pick<Connection, 'instanceUrl' | 'request'>` seam for synthetic tests.
- `get<T = unknown>(path: string): Promise<T>` performs one GET and returns the
  untouched response. It does not claim list completeness or validate schemas.
- `ConnectError` exposes `code` (`INVALID_REQUEST`, `AUTHENTICATION_FAILED`, or
  `REQUEST_FAILED`) and optional numeric `statusCode`. Original messages, causes,
  headers, bodies, request URLs and credentials are discarded, not regex-filtered.
  Status is retained only if the underlying error supplies a valid numeric status;
  JSforce errors can omit it. Session-expiry names are classified as authentication.
- Paths must be root-relative or absolute on the authenticated HTTPS origin, under
  `/services/data/v<explicit-version>/ssot/`. Reject cross-origin, credential-bearing,
  wrong namespace/version, traversal, separator/nested encodings, controls, fragments
  and duplicate path separators. All redirects throw before forwarding a request.
- Salesforce core owns authentication/session refresh. There are no application-level
  retries, mutations, adapters, selectors, CLI changes or manually handled tokens.
  Dependency debug logging is not a plugin-owned diagnostic surface; callers must
  not deliberately place secrets into resource URLs.

### Official contract evidence

Official online lookup was expressly approved on 2026-10-25 after local mirrors
proved incomplete. Evidence was obtained using official-site web search; a direct
summary fetch timed out, but indexed full reference text was available.

- [Data360 Connect REST reference](https://developer.salesforce.com/docs/data/connectapi/references):
  `GET /ssot/data-model-objects` and detail routes; current examples use
  `/services/data/v68.0/ssot/`. This is the **data/connectapi** reference, not an
  assumed equivalent platform/connectapi specification.
- [Official DMO mapping use case](https://developer.salesforce.com/docs/data/connectapi/guide/dmo-use-case.html):
  example mapping requests explicitly use `/services/data/v65.0/ssot/`.
- [Custom application API overview](https://developer.salesforce.com/docs/data/data-cloud-dev/guide/custom-app-dev):
  distinguishes Salesforce OAuth/My Domain Connect REST from tenant-specific Direct
  API token exchange. The transport uses the core connection origin, never a URL
  supplied by a response or a Direct API token exchange.

Consequently `/connect/ssot/` is rejected. Explicit versions must match `NN.0` or
`NNN.0`; there is no latest/default discovery, upgrade, downgrade or version retry.
Current reference v68 examples are not proof of v65 field/operation support.
Future adapters must establish endpoint/feature availability at the selected
version. Tests use independently authored shapes, not copied official examples.

### Verification and next boundary

- `npm run lint:fix`, `npm run lint`: exit 0, zero warnings/errors.
- Explicit `npm run build`: exit 0.
- `npm test`: 14 passed, 0 failed/skipped (6 transport, 6 CLI, 2 tooling),
  11,407.3291 ms excluding compilation.
- `npm run smoke`: 6 passed, 0 failed/skipped, 10,522.6068 ms.
- Normal enabled pre-commit repeats registry-only lock validation, zero-warning
  lint, build/full tests and six-case smoke. Final hash/hook receipt is returned
  after commit; a commit cannot embed its own hash.
- No live calls, fixtures, root edits or recursive cleanup. No scratch was allocated
  by this slice. All test fixtures are inline synthetic objects; CLI help smoke
  retains its own verified OS-temp roots. No pushes/tags/publication authorized.

Next smallest slice: document actual DMO list pagination response contract, then
add bounded pagination completion/loop/truncation regressions. No adapters yet.
No transport blocker remains; endpoint-specific minimum versions and response
contracts are future adapter evidence checkpoints.

Propagation: README and capability checklist updated; artifact/Git workflow docs
unchanged because no artifact or command behavior changed. This independent package
has no downstream consumers: language/data/parser/LSP/extensions/MCP/MSO, CMS and
MCNext are N/A. Wiki/sites/hover data need no updates for this unpublished internal
slice. Root release/dependency-map registration remains a coordinator follow-up,
not an authorized edit here. Package remains 0.1.0, no prior release/tags; no bump.

## Historical bootstrap receipt

## Scope and timing

Start: 2026-10-25T15:03:32+01:00. Implementation/initial checks completed at
2026-10-25T15:09:27+01:00; final commit receipt is returned to the coordinator.
This is tooling/bootstrap only, not completion of the portable Data360 feature.
The approved plan and fresh zero-must-fix plan review preceded this slice.
Worker sizing was limited to this repository; no code reviewer was dispatched.
The whole-feature review loop remains deferred until all development slices land.

## Done and interfaces

- Independent `main` Git repo, local personal author identity, no remote.
- npm `@joernberkefeld/sf-plugin-data360@0.1.0`, native ESM, Node
  `^22.22.2 || ^24.15.0`; no prior release or version tags.
- oclif command directory `lib/commands`, space-separated `sf data360` topic.
- `Retrieve` and `Deploy` extend `SfCommand<void>`; `run(): Promise<void>` always
  throws `SfError` named `NotImplemented`. No flags, transport or org calls exist.
- TypeScript strict NodeNext output, package allowlist, own registry lockfile,
  ESLint/Prettier/JSDoc/Unicorn, starred-JSDoc regression, Husky hooks, Dependabot,
  Node 22/24 Linux CI and hosted-only release workflow.
- Files: package/lock/config/license/README, `bin/run.js`, two command sources,
  two test files, three scripts, three hooks, three GitHub YAML files and four
  requested documentation pages. Build outputs and dependencies are ignored.
- Seven capability families remain unimplemented; each has an explicit evidence
  checklist. No artifact schema or adapter interface has been prematurely frozen.

## Exact verification evidence

Local runtime: Node 24.21.0, npm 11.19.0, Windows. Initial registry install added
427 packages, audit 428 packages, zero vulnerabilities. Node 22/Linux coverage is
configured in CI but not claimed locally executed.

- `npm run lint:fix`, then `npm run lint`: exit 0, zero errors/warnings.
- `npm run build`: exit 0, strict TypeScript compilation.
- `npm test`: 8 passed, 0 failed/skipped; includes 3 help cases, 2 JSON refusals,
  exact oclif discovery, JSDoc preservation and seven-family status regression.
  Initial full run duration 12,177.8692 ms (excluding compile).
- `npm run smoke`: 6 passed, 0 failed/skipped; initial duration 10,842.727 ms.
- `npm pack --dry-run --json`: allowlist inspected; no source, tests, hooks,
  credentials or dependency tree bundled. Final allowlist includes all four docs,
  license, README, runner, four compiled JS/declaration files and package.json
  (12 entries). No recursive cleanup was performed.
- `npm run smoke:package`: packs actual tarball into a new OS-temp root, installs
  it into an isolated prefix and runs topic/retrieve/deploy help outside the repo
  (3 assertions). This is packaged oclif loading, not global `sf plugins install`.
- Registry-only lockfile check passes. Normal enabled pre-commit repeats lockfile
  check, zero-warning lint, full tests and six-case smoke. Its successful exit and
  exact commit hash are recorded in the coordinator receipt after commit.
- Root setup audit executed read-only: 14 unrelated existing issues, plus legacy
  warnings; **no finding for sf-plugin-data360**. No unrelated files were fixed.

Initial nine-entry package smoke passed at `F:/Temp/data360-package-StnAez` before
expanding the allowlist to include the remaining requested docs. Final 12-entry
package smoke passed at `F:/Temp/data360-package-0fPJAf` (3/3 help checks), and the
full suite passed again (8/8, 10,948.4505 ms excluding compile), at
2026-10-25T15:11:38+01:00. Any subsequent documentation-only receipt changes are
repacked before committing. All scratch is retained under
newly allocated OS-temp roots; no live fixture or org resource was created.

## Commit boundary

One focused bootstrap commit is authorized, with enabled normal hooks and literal
path staging: `feat: bootstrap portable Data360 CLI tooling`.
The hash cannot be embedded inside the same commit's own tracked content without
a self-reference. Resolve this receipt using `git log -1 --format=fuller`; the
coordinator also receives the exact hash, completion timestamp and clean status.
No push, tag, remote creation, publication or global CLI changes are authorized.

## Setup decisions and limitations

No npm-package CHANGELOG was created: the workspace release rule places release
notes exclusively in GitHub Releases. No message files are needed for these two
static bootstrap summaries. Registry dependency metadata is pinned to the actual
installed lockfile. ESLint 9 emits an upstream deprecation notice at install;
it remains the compatible pinned tooling baseline, not a lint warning.

Transport, API/version evidence, pagination fixtures, schemas, adapters, selectors,
preview/deploy semantics, CLI installed-profile acceptance and live acceptance are
not implemented. A future approved release must verify npm scope ownership,
configure hosted trusted publishing and establish its remote; none is assumed.

## Next bounded slice: transport/authentication

1. Read official local contracts; establish explicit API-version policy and exact
   safe endpoints before authoring network requests. Ask before external lookup.
2. Implement one small Salesforce-core authenticated Connect REST client with
   redacted structured errors and complete bounded pagination.
3. Add independently authored synthetic fixtures for authentication failure,
   token redaction, API errors, pagination completion/loops/truncation. No live
   calls, adapters or org writes unless separately authorized for that slice.
4. Run build, zero-warning lint and full tests; update this handover and commit
   only if that slice has current explicit approval.

Do not invent public plan commands, saved-plan persistence or broad frameworks.
Freeze adapter interfaces only after DMO evidence. Preserve all safety and
independent-authoring requirements. Windows shell/test entries verify actual
Node tmpdir and TEMP/nonempty TMP/TMPDIR against absolute normalized `F:/Temp`.

## Propagation audit

Primary component `sf-plugin-data360`: done for bootstrap only. It has no workspace
consumers or language-data coupling. All language/data/parser/LSP/extension/MCP/MSO
components are N/A; CMS and MCNext need no implementation change. Wiki, guide/site
tool listings and hover/doc-URL data need no change for an unpublished bootstrap.
README, capability status, artifact-format status and Git workflow are documented.

Coordinator follow-ups (root edits deliberately out of scope): register the new
Tier 4 package in release-tracking and the dependency map, add its propagation row,
and determine whether workspace/audit registration needs updating. The audit
already discovers this directory automatically. Do not run root npm install.
Strongly recommend completing those bookkeeping updates in the coordinating task
before reporting whole-project propagation complete.
