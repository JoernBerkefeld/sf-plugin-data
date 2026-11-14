# Git workflow status

## Git selection (`--changed-since`)

`sf data360 deploy --changed-since <ref>` selects the plugin files that changed between
the unique merge base of `<ref>` and HEAD, plus staged, unstaged and untracked changes.
It resolves the repository root even from a nested directory and is exclusive with
`--metadata` and `--source-dir`.

Selected files, by family (each file's content identity must equal its file name):

| Family | Canonical file |
| --- | --- |
| DLO | `data360/dlo/<Name>__dll.dlo-meta.json` |
| DMO | `data360/dmo/<Name>__dlm.dmo-meta.json` |
| Mapping | `data360/mapping/<Name>.mapping-meta.json` |
| Relationship | `data360/relationship/<Name>.relationship-meta.json` |
| Data stream | `data360/data-stream/<Name>.data-stream-meta.json` |
| Data transform | `data360/dataTransforms/<Name>.dataTransform.json` |
| Data graph | `<package>/main/default/data360/dataGraphs/<Name>.native-dataGraph.json` |
| Identity resolution | `<package>/main/default/data360/identityResolution/<Name>.identityResolution.json` |
| Calculated insight | `<package>/main/default/mktCalcInsightObjectDefs/<Name>.mktCalcInsightObjectDef-meta.xml` and `<package>/main/default/data360/calculatedInsights/<Name>__cio.calculatedInsight.json` (either member selects the pair) |
| Segment | `<package>/main/default/data360/segments/<Name>.segment.json` |

The first six live under the repository root; the others under the default package
directory from `sfdx-project.json` (`force-app` when absent). A changed file of a known
family in another place, an invalid document or Segment XML refuses the whole selection
(`INVALID_GIT_SELECTION`). Each admitted file's bytes are captured and checked again
before the target is read and before each write.

The selected files run in phases, like an explicit selection; each phase starts only
after every item of the previous one settled:

1. Data streams.
2. Native DLO, DMO, mapping and relationship files (the native route when a mapping or
   relationship is in the range; DLO/DMO files beside Segment, calculated insight or
   identity resolution files only join the ordered dependency batch instead).
3. Identity resolution, calculated insight and Segment files in the ordered dependency
   batch; an identity resolution runs before a calculated insight or Segment on its
   unified DMO, which start only once the ruleset is published.
4. Data graphs, after the ruleset whose unified DMO they use is published.
   `--wait-timeout` applies to each graph and is refused when the range holds none.

A data transform changed in the range is refused (`INVALID_TRANSFORM_SELECTION`): a
transform deploy needs `--transform-operation`, which is not accepted with
`--changed-since`. Deploy it with an explicit selection. A DLO file named like the
landing DLO of a stream in the range that does not exist in the target yet is refused
before any write (`DATA_STREAM_DLO_COLLISION`).

### Deleted files

A file present at the merge base and absent from the working tree now, with the
deletion committed or staged (`git rm`), is a delete candidate. An unstaged deletion of a
plugin file blocks (`BLOCKED_GIT_LIFECYCLE`): Git cannot see where an unstaged file moved. Its family and identity come from the merge-base content (`git show
<base>:<path>`), not from the file name; a relationship candidate also carries its
source DMO and a data transform its API name from that content. A path deleted and then
added again (in the index or working tree) is not a delete. A deleted file of no known
family in a `data360` folder, or one calculated insight pair member deleted without the
other, blocks the selection (`BLOCKED_GIT_LIFECYCLE`). A file added after the merge base
and deleted again is ignored.

Deploy does not delete: candidates are listed in `result.selection.deletions` (family,
API name, path) and as `Not deleted: <family>:<name>` lines that name the matching
`sf data360 delete --changed-since <ref> --confirm-delete` command, and nothing is
written for them.

### Deleting with `sf data360 delete --changed-since`

`sf data360 delete --changed-since <ref>` takes the same Git selection and deletes the
components of the files deleted in the range; files changed or added in the range are
not part of a delete. It is exclusive with `--metadata` and refuses `--delete-dlo`
(`INVALID_STREAM_DELETE_SELECTION`). Execution always needs `--confirm-delete`
(`DESTRUCTIVE_CONFIRMATION_REQUIRED` otherwise, before any org call), even for one
family; `--preview` runs without it. `--confirm-delete` belongs to `--changed-since`
only: a delete by name with `-m` runs without it.

- The candidates run through the same phases as any delete, in reverse order: graphs,
  then identity resolution, calculated insights and Segments (a dependent before what it
  needs), then data transforms, then relationships, mappings, DMOs and DLOs, then data
  streams. Each phase starts only after the previous one settled.
- Every family runs from its merge-base document (not from an org read by name, as a
  `-m` delete does) with the checks of an explicit delete.
  Right before each phase, and before each write of a source-backed family, every
  candidate path must still be absent; a file present again blocks
  (`BLOCKED_GIT_LIFECYCLE`). Each candidate's data space must equal the requested one
  (`INVALID_SCOPE`).
- A relationship takes its source DMO from the base content; no local file is read.
- A data transform has no target ID in the range: its API name from the base content is
  looked up in the complete transform list (ignoring case). No match reports `unchanged`
  / `not-attempted`, also when the delete is run again after the transform was deleted;
  two or more matches delete nothing (`TRANSFORM_TARGET_NOT_RESOLVED`).
- A stream file deleted together with the file of its landing DLO is one stream delete
  that also deletes that DLO; the DLO is never deleted on its own. A stream deleted
  alone keeps its DLO.
- A custom DMO deleted together with its last mapping is deleted alone; Salesforce
  removes the mapping with it and the mapping item reports `removedWith` the DMO.
- No local file is listed or removed: the files are already gone.
- A range without deleted plugin files succeeds without any org call.

`result.selection.changedSince` and `provenance.git` record the reference and the
resolved commits.

### What blocks

Renames, copies and merge conflicts of plugin files block the whole selection
(`BLOCKED_GIT_LIFECYCLE`). Rename detection is on regardless of `diff.renames`, but
Git-inferred renames do not prove historical intent. A new untracked plugin file
combined with **any tracked worktree deletion** also blocks, including an unrelated
deletion: Git cannot infer an inbound move to an untracked destination. A file of one
component deleted at one stage (for example committed) while a file of the same
component is added under a different path at another stage (index, working tree or
untracked) is a rename Git cannot pair; it blocks too, since it would delete and create
the same component. Stage intended changes so Git can detect renames.

A valid empty selection succeeds without target inspection, preflight or execution
(existing Salesforce parse-time authentication still applies). Optional
`provenance.git` records the repository root, requested ref and resolved
reference/HEAD/merge-base commits. Nonempty selections use the same preflight and
execution as explicit selections of the same families. Preview remains advisory.

## Repository and release

Current npm identity and local directory are `sf-plugin-data`; the repository is
[`JoernBerkefeld/sf-plugin-data`](https://github.com/JoernBerkefeld/sf-plugin-data).
The `origin` remote points to `https://github.com/JoernBerkefeld/sf-plugin-data.git`.
The repository/folder rename preserves history, canonical commands and the
existing `v0.1.0` tag at `8bcbe63`. It does not authorize a commit, push,
publication or further tag change. Release finalization is paused while npm
trusted-publisher configuration is updated for the renamed repository.

The repository implements native DMO retrieval, read-only deployment preview,
creation, update and exact-name deletion, with the scope and limits described in
the README's Public DMO workflow. Offline CI
builds, lints, tests and inspects the package allowlist. It does not authenticate
to Salesforce. No workflow deploys or provisions org resources.

The future review flow is retrieve to a branch, inspect portable configuration,
review the exact commit, optionally preview against an authorized target, then
deploy that approved commit with fresh whole-selection preflight. Preview is
advisory, not an executable saved plan or a promise of identical future actions.
Never expose org credentials to untrusted pull-request code.

Deployment jobs, report files, approved-commit binding and approval-bound execution
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
