# Git workflow status

## Graph exact file selection

`--changed-since` includes canonical
`<package>/main/default/data360/dataGraphs/ApiName.dataGraph.json` members, with
configured/default source package resolution. Git capture retains the original
immutable Graph document and SHA256 byte digest. Public deploy rebinds path,
identity, content and digest before target reads and revalidates throughout the
invocation. Deletions, renames, noncanonical paths and ambiguous inbound moves
block the whole selection. No historical rename guarantee or saved-plan contract
is implied. Exact `data-graph:ApiName` and explicit file modes use the same reader.

Graph requires auto or numeric67; mixed legacy selections require auto. Complete
preview and all-pending fresh dependency/owner/input admission precede every mixed
write. Update effects require `--allow-processing`; unchanged is zero mutation.
Raw Graph/transform bodies and poll observations remain private, never Git artifacts
or public results. Installed/live zero-write acceptance remains separately scoped.

## Calculated insight pair selection

`--changed-since` includes canonical calculated insight XML/JSON pairs under the
configured source package. Either member's change coalesces to one CI component;
both must remain present and correlated. The selector captures immutable CI
admissions separately from Segment and IR, and the public command checks captured
path, companion path, complete document and two-file digest against resolved input.
Every captured/resolved pair is byte-revalidated before preview completion and
before sequential execution. Missing/divergent/noncanonical pairs and either-member
rename/deletion block the complete selection. This is invocation-local byte binding,
not a persisted approved plan or a guarantee of historical rename intent.

CI preview is read-only. Deployment preserves complete-selection preflight, explicit
processing acknowledgement, all-pending target binding/effects re-admission before
mixed writes, bounded independent settlement and stop-on-unknown/no-replay behavior.
CI creation and dependency expansion remain unsupported. Hosted offline tests do not
perform Salesforce acceptance; fresh live zero-write evidence remains separately scoped.

Current npm identity and local directory are `sf-plugin-data`; the repository is
[`JoernBerkefeld/sf-plugin-data`](https://github.com/JoernBerkefeld/sf-plugin-data).
The `origin` remote points to `https://github.com/JoernBerkefeld/sf-plugin-data.git`.
The repository/folder rename preserves history, canonical commands and the
existing `v0.1.0` tag at `8bcbe63`. It does not authorize a commit, push,
publication or further tag change. Release finalization is paused while npm
trusted-publisher configuration is updated for the renamed repository.

The repository implements bounded DMO retrieval, read-only deployment preview,
guarded creation and qualified object/existing non-primary field label updates.
Broader DMO deployment and other resource families remain unsupported. Offline CI
builds, lints, tests and inspects the package allowlist. It does not authenticate
to Salesforce. No workflow deploys or provisions org resources.

The future review flow is retrieve to a branch, inspect portable configuration,
review the exact commit, optionally preview against an authorized target, then
deploy that approved commit with fresh whole-selection preflight. Preview is
advisory, not an executable saved plan or a promise of identical future actions.
Never expose org credentials to untrusted pull-request code.

`sf data360 deploy --changed-since <ref> --preview --api-version 65.0` selects
current canonical `data360/default/dmo/ApiName.json` files relative to the Git
repository root, even from a nested working directory. It is exclusive with
`--metadata` and `--source-dir`. Selection includes changes from the unique merge
base to HEAD, staged/unstaged edits and relevant untracked files. Each file's
default-space document identity must exactly match its filename. Other resource
families and SQL companion pairs are not selected.

Relevant renames and deletions block the whole selection. Explicit Git rename
detection is enabled regardless of repository configuration and inspects both
endpoints, but Git-inferred renames cannot establish historical intent. A relevant
untracked DMO addition combined with **any tracked worktree deletion** also blocks,
including an unrelated deletion: Git cannot infer an inbound move to an untracked
destination. Stage intended changes to permit Git-inferred rename detection, then
resolve unsupported lifecycle changes. This conservative ambiguity policy is intentional.

A valid empty selection succeeds without downstream target inspection, preflight
or execution. Existing Salesforce core parse-time authentication behavior remains;
this is not an authentication-free invocation guarantee. Selection failures return
blocked diagnostics. Optional `provenance.git` records repository root, requested
ref and resolved reference/HEAD/merge-base commits; it is not exact-byte binding.
Nonempty selections use the existing whole-selection preflight and guarded API65
execution unchanged. Preview remains advisory.

Deployment jobs, report files, exact-byte/approved-commit binding and approval-bound execution
remain deferred. This implements only the Git-selection portion of roadmap chunk 6. No repository, branch protection, remote or npm publisher is
configured automatically. Release publication requires separate explicit approval
and verified hosted trusted-publisher configuration. Hosted publication uses npm
11.5.1 and an exact `name@version` registry check: an existing matching version
is skipped; only structured JSON `E404` proves absence. If the entire package is
absent, the user must perform its first public npm publication manually after all
release checks pass. Later unpublished versions of an existing package may use
the approved hosted workflow. Package existence does not verify the trusted
publisher: its actual repository/workflow/environment binding must be configured
and verified separately. Authentication, network and malformed registry responses
fail closed; publication is never retried automatically. After publish acceptance,
registry availability (first check at five minutes, then once per minute through
15 minutes), fresh isolated installation and applicable provenance/integrity
verification remain separate gates. No bootstrap commands or release-ready
artifact are handed off by this local preparation.
