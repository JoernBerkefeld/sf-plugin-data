# Command-only read-only deploy preview slice

Started 2026-10-25 approximately 18:46+01:00 from clean requested
`767f773b092568a0366ea019083ebf105a3899f5`. Fetch/status passed, no remote
configured. Written plan/simplicity check preceded edits; existing shared-plan
review remains applicable (Gates 1/2 complete). Gate 3 one small coupled command /
test slice; no resolver/model changes, extra workers, root edits or live org calls.
Whole-feature Gate 4 remains coordinator-owned. Normal focused commit follows
verification under the parent's per-finished-slice approval.

## Public CLI and exact result shape

`sf data360 deploy --preview` now requires exactly one repeatable/non-greedy source
mode: `-d/--source-dir` explicit authored JSON file OR directory, repeated as needed;
OR `-m/--metadata dmo:ExactName__dlm`, repeated, resolving project artifacts from
captured cwd. Existing resolver owns all strict authored-only JSON, no-link bounded
path, duplicate/missing/malformed selection semantics. No bare type, implicit all,
mixed modes or no-selection deploy. No model/resolver refactor in this slice.
Without --preview, DEPLOY_EXECUTION_NOT_IMPLEMENTED blocks before local/target work.

Core optionalOrg exposes -o/--target-org override/configured default. Core API flag
default 65.0, data-space default default; passed unchanged to service capability
checks. Command resolves/validates ALL sources before calling getOrgId/getConnection.
Core parser/auth flag errors may occur earlier and retain core formatting.
Protected injectable command seams: resolveInputs = readDeployInputs;
preflight = preflightDmoDeploy. No mutation, filesystem writer or report dependency.

Normal core JSON result wraps DeployEnvelope contract sf-data360-deploy, version
1.0.0; status success/blocked/failed; metadata {operation:'deploy',preview,plugin,
apiVersion}; diagnostics {warnings,errors:[{code,message,retryable:false}]};
provenance {producer,targetOrgId:null|string,pluginVersion,command,generatedAt};
result {scope:{dataSpace},selection:{sourceDir:string[],metadata:string[]},items}.
Each item {identity:{dataSpace,apiName},operation:'preview',path,outcome,target,
absenceProof,diagnostics} retains service classification/proof unchanged. create
means advisory absence by complete inventory only, never an executed operation.
unchanged means qualified equality. Any blocked-changes/blocked => aggregate
blocked/exit 1. Unexpected per-item error => static PREFLIGHT_FAILED item diagnostic,
aggregate failed/exit 1, retaining subsequent item results. Other unexpected local /
auth failures => static DEPLOY_PREVIEW_FAILED, no raw exception text. Human summary
always states no deployment executed. No local artifact/report/scratch writes.

## Verification / documentation / safety

Ten command seam regressions cover source modes/overrides/order, every outcome,
aggregation, malformed local admission, missing org, redaction, real resolver
no-write integration and explicit human wording. CLI smoke adds real parser
repeated flags/non-greedy/mixed/no-selector/bare-type/missing sources and defaults;
help assertions cover all deploy flags. Existing README/artifact/capabilities and
handover updated. Full verification and normal enabled-hook receipts follow in
coordinator response. Package inventory remains 24 entries, no new runtime module.

Every shell/test checks TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR absolute
normalized F:/Temp; process-only repair/recheck when necessary. New test fixture
uses mkdtemp under verified OS temp and is retained; no recursive cleanup. No live
calls, reference names, root edits, push/tag/release or version bump (0.1.0).
Gate 5 slice documentation propagation checked: sf-plugin-data360 done; language
catalog/parser/LSP/extensions/MCP/MSO and independent CMS/MCNext are N/A, no downstream
updates, wiki/site/listing/hover surface or npm changelog. Changed folder only
sf-plugin-data360, current 0.1.0, new version unassigned (no release prepared).

## Next bounded slice: guarded-create executor (not implemented)

Begin only with fresh authorized execution scope. Reuse authored resolver/preflight,
API65/default and complete-inventory absence proof. Build a small guarded-create
service/executor, never add broad update/PATCH/delete/recreate fallbacks. Actual
execution must not be enabled just by preview success: re-preflight selected authored
input at execution time, gate creation to proven supported semantics, handle
ambiguous mutation failures without blind retry and qualify readback before claiming
completion. Existing unchanged targets remain no-op; blocked-changes/blocked never
mutate. Establish the precise mutation/readback acceptance contract before edits;
no live calls are authorized by this handover. Add injected-transport regressions,
normal build/lint0/tests/smoke/package and own-path hook commit under current approval.
Whole-feature Gate 4 coordinator runs once after final feature integration.

# Bounded deploy authored-input resolver slice

Started 2026-10-25 approximately 18:37+01:00 from requested clean
`66c71fd7ddae51982b53f671be9c83a24cb2ba67`. Fetch/status clean main, no remote
configured. Inline temp preflight quoting initially failed closed before Git;
corrected invocation passed actual Node tmpdir and all nonempty environment checks.
Written slice plan/simplicity check preceded edits. Inherited reviewed shared plan
remains complete (Gates 1/2); one small coupled resolver/test slice applies Gate 3.
Whole-feature Gate 4 remains coordinator-owned. Master plan link named in the
existing deferred-plan handover is missing locally; its retained explicit-selection
contract, current user instructions and actual CMS source selector were inspected.

## Done and exact supported internal input semantics

New `src/artifacts/read-deploy-input.ts` exports:
`readDeployInputs(flags: {cwd: string; sourceDir?: readonly string[];
metadata?: readonly string[]}): Promise<Array<{path: string; document: DmoDocument}>>`
and payload-free `DeployInputError` with INVALID_SELECTION, UNSAFE_SOURCE,
INVALID_SOURCE or DUPLICATE_IDENTITY. Captured cwd must be absolute.
Exactly one nonempty mode: explicit file/directory paths (absolute or cwd-relative),
or repeated exact `dmo:ApiName__dlm` selectors resolving only
`<cwd>/data360/default/dmo/<ApiName>.json`. Identical paths/repeated selectors and
overlapping directory/file selections coalesce. Distinct files claiming the same
case-insensitive identity block; metadata basename and authored identity must match
exactly. Bare types, absent selection, mixed modes, parent traversal, wildcard and
drive-relative paths block. No implicit deploy-all or future contract redefinition.

Explicit directory traversal selects all descendants: unrelated non-JSON files
block rather than silently disappearing. Limits 256 files, 1024 visited entries,
16 levels, 1 MiB/file. Every ancestor checked by lstat/canonical path; links,
junctions, aliased ancestors and hardlinked files rejected. Bounded handle reads
check regular-file identity, size and timestamps; not a sandbox against malicious
concurrent local replacement. Strict UTF-8/BOM-free JSON, duplicate decoded key
rejection, authored validator and independent default mapper before returning.
No filesystem writes, reports, scratch roots, connection imports or org operations.
No recursive cleanup. Test roots retained under verified OS temp.

## Verification and propagation

Eight focused resolver cases added (directory budgets, repeated/multi selection,
exact conventional lookup, selector refusal, strict JSON, duplicate identities,
no writes, link/size safety). Full build and zero-warning lint passed; full tests
152/152 passed (13316.1318 ms). Smoke/package and enabled-hook receipts are recorded
in coordinator response after completion. Package smoke checks 24 entries including
resolver JS and declaration. Existing README, artifact-format, capabilities and
handover updated. Version remains 0.1.0, no release/tag/push or root changes.

Propagation: sf-plugin-data360 implementation/tests/package/docs done; language
catalogs/parsers/LSP/extensions/MCP/MSO, CMS and MCNext are independent (N/A, no
updates). Wiki/site/listing/hover have no changed surface. No npm changelog.
Changed folder: sf-plugin-data360 yes, current 0.1.0, new version not assigned
(no release prepared). All other tracked folders unchanged.

## Next execution slice: wire preview CLI (not implemented here)

`deploy` is still the existing NotImplemented stub. This is intentionally the
input-resolver-only fallback authorized by the parent to avoid oversized command +
filesystem + envelope work. Next worker starts in src/commands/data360/deploy.ts,
reads retrieve.ts envelope/core flags and preflight-dmo-deploy.ts. Add repeatable,
non-greedy `-d/--source-dir` string (file OR directory, NOT Flags.directory) OR
`-m/--metadata`; call resolver with captured cwd. No implicit selection/bare types.
Add --preview, core optionalOrg/API 65.0/default scope; preflight every validated
item with preflightDmoDeploy(document, connection, apiVersion, dataSpace). Read-only
versioned sf-data360-deploy envelope inside core JSON; create/unchanged are advisory
preview outcomes, blocked-changes/blocked/failures exit nonzero. Never mutation
transport, report/artifact writes, saved public plan or actual-deploy success claim.
Test public flags/default/overrides, all outcomes/redaction and no mutations/writes;
then normal full verification/smoke/package checks and approved own-path commit.
Preview selection cannot be claimed publicly until that slice lands. Repeat
TEMP/os.tmpdir/all nonempty TMP/TMPDIR absolute normalized F:/Temp preflight at every
shell/test entry, process-only repair and recheck; no recursive cleanup except fully
guarded run-owned registered strict descendants. No live calls/reference IDs.

# Internal read-only deploy preflight slice

Started 2026-10-25 approximately 18:26+01:00 from requested clean
`d190c6a2ad351e1bd394a73b0bf58c20b6691b48`. Fetch/status completed (no remote
configured). Written slice plan and explicit simplicity check preceded edits;
inherited common plan review 2873b976 complete, Gates 1/2 applied. Gate 3 one small
coupled service/test slice; whole-feature Gate 4 remains coordinator-owned.

## Interface, proof and comparison

`preflightDmoDeploy(document: unknown, connection: ReadConnection,
apiVersion: unknown, dataSpace: unknown): Promise<DmoDeployPreview>` in
src/services/preflight-dmo-deploy.ts. ReadConnection is core Connection's
instanceUrl/request/metadata/getApiVersion subset. Explicit API 65.0/default only.
Source independently common-mapped before reads, detached across awaits. No
CLI/filesystem discovery, org calls during development, mutation transport or
execution, saved public plan or generic framework.

Returns `{outcome:'create'|'unchanged'|'blocked-changes'|'blocked',
target:'absent'|'present'|'unknown', absenceProof:'complete-inventory'|'none',
diagnostics:Array<{code:string,message:string}>}`. Static messages contain no raw
IDs, names, token bodies, requests or exception payloads. Complete successful
Connect inventory exhaustion plus exact default/name filtering is the only absence
proof; no HTTP 404/auth/network/malformed/incomplete failure means missing. Existing
entries require actual common retrieveDmo detail/Metadata/complete relationships,
strict projection and independent target mapping. Unknown generated semantics
block, never false no-op. Inventory isn't a transactional concurrency guarantee.

Fixed authored properties compare exactly (including optional absence vs empty).
Fields join by exact name, never array index; reorder alone is unchanged. Object,
category, field-set, field configuration and immutable type/primary differences
have deterministic reason codes; every difference appends UPDATE_UNSUPPORTED.
No PATCH or delete/recreate fallback. Authored-only artifact contract preserved.

## Verification and safety

Scoped autofix, explicit build, full zero-warning lint passed; focused preflight
15/15 and full suite 144/144 passed (12654.5176 ms test phase). Initial npx argument
routing did not apply autofix; direct local ESLint fixed line endings/style, with
four await-member lint issues repaired without suppression. Package smoke now
checks 22 packed entries including preflight JS/declarations. Smoke passed 6/6;
package installed outside repo and passed three help checks, retained at
F:/Temp/data360-package-zLdCd5. Verification sequence ended
2026-10-25T18:34:10.3731123+01:00. Enabled-hook commit receipt follows in coordinator
response; self-hash cannot be embedded here.

Every shell/test entry checks absolute normalized TEMP, actual os.tmpdir and
nonempty TMP/TMPDIR at F:/Temp, process-only repair/recheck. First inline Node
quoting failed closed before Git; corrected quoting passed. Scratch only existing
verified OS-temp mkdtemp package tooling; no recursive cleanup, global edits,
root edits, push/tag/release or reference names. Version unchanged 0.1.0.

Gate 5 slice documentation checked: existing README/artifact/capabilities/handover
updated; no npm changelog. No wiki/site/tool listing/hover or downstream surface.

| Component                                                                            | Needs update? | What to update                                          | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | preflight, regressions, package check and existing docs | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                             | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                      | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                            | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                    | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                             | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                             | not needed |

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

## Next bounded deploy preview command slice

Wire internal preflight to read-only deploy --preview for explicitly selected
one authored file/DMO, preserving approved CMS-style deploy explicit selection
rules (no no-selector/type-only discovery or implicit org/file search). Re-read
approved command/envelope contract, validate authored-only file safely, obtain an
explicit target core connection and pass API/default unchanged to preflight.
Payload-free preview envelope/nonzero blocked outcomes, no writes/mutations or
saved-plan infrastructure. Re-read selection details before implementation, not
inferred from this service. Whole-feature Gate 4 once after final integration.

# Common retrieval integration slice

Start: 2026-10-25T18:16:32.6761590+01:00, clean requested baseline
`54c9ddfce9c83a8893b0b907307af5492b378465`. Fetch/status completed; no remote
configured, so upstream cannot be verified. Written slice plan/simplicity preceded
edits; inherited reviewed shared-DMO plan complete (Gates 1/2). Gate 3 one small
coupled service/writer/command slice, no extra workers/root edits. Whole-feature
Gate 4 remains coordinator-owned, not claimed here.

## Exact interfaces and completed scope

`retrieveDmo(connection: ReadConnection, objectApiName: unknown, apiVersion: unknown,
dataSpace: unknown): Promise<DmoCommonProjection & { candidate: DmoDocument }>`
in src/services/retrieve-other-dmo.ts replaces the unpublished narrow export.
ReadConnection still uses actual core instanceUrl/request/metadata/getApiVersion.
Explicit API 65.0/matching connection, default scope and exact object binding
remain. Real `metadata.read('CustomObject', [objectApiName])` cardinality/fullName
checks and complete relationship acquisition are unchanged. Common projector
status must be projected, blockers empty and candidate present; common authored
mapper validates candidate before success. DmoRetrieveError carries a payload-free
code, preferring ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE when present, otherwise
the first specific blocker. Unknown malformed semantics remain DmoDocumentError.

`writeDmoDocument(value: unknown, projectRoot: string, overwrite: boolean)` in
src/artifacts/write-other-dmo.ts keeps Promise<{path:string,outcome:'retrieved'|
'unchanged'}>. It independently calls buildDmoCreateRequestFromDocument, not the
narrow two-field mapper. No new file/alias is needed for unpublished internals.
Command imports common names and refuses incomplete/nonempty-blocker/absent
candidate results before writer invocation; selection is syntax-only unchanged.
Authored-only canonical JSON path, overwrite/no-op, links/ancestor checks and atomic
publication remain intact. No new family, discovery, deployment or live acceptance.

Recognized generated recipe now passes actual acquisition -> command -> writer
for one and twelve authored fields (all twelve types across primary plus variants),
including dynamic/category/description values and unchanged replay. Profile and
Engagement generated semantics remain unqualified in this one common path; missing
event designation is explicit, never inferred. No sample/category implementation
tracks or fixed field count. Existing narrow offline compatibility helpers/tests
remain but are not used for retrieval.

## Verification and safety

Scoped autofix, explicit build and full zero-warning lint passed. Full tests:
129 passed, 0 failed/skipped, 14052.5083 ms excluding compile; standalone sequence
ended 2026-10-25T18:22:00.533+01:00. New regressions cover common service->writer/
command success, specific incomplete/absent candidate diagnostics with no output,
and existing acquisition failure/CLI envelope/path-safety regressions. Initial
lint caught an await-member style error, fixed without suppression. Smoke/package
and normal enabled hook commit receipts follow in coordinator response, including
exact hash/end/clean status; self-hash cannot live in this tracked document.

Every shell/test entry preflights TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
as absolute normalized F:/Temp, with process-only repair/recheck. Scratch uses
verified OS-temp mkdtemp and is retained; no recursive cleanup/global edits/live
org calls or mutations/push/tag/release. Package remains 0.1.0.

Gate 5 slice propagation: README/artifact/capability/handover updated after green
checks. Wiki/sites/tool listings/hover have no affected surface for unpublished
internal integration. Root release/dependency registration remains coordinator-only.

| Component                                                                            | Needs update? | What to update                                        | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | common service/writer/command/tests and existing docs | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                           | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                    | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                          | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                  | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                           | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                           | not needed |

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

## Next bounded deploy-preview slice

Read actual approved deploy/preview scope before edits. Independently acquire one
explicit target DMO through the common read-only service, validate an explicit
authored input through the common mapper, and compare canonical authored semantics
in memory with deterministic diagnostics. Establish absence versus acquisition
failure and generated/relationship qualification before classifying target changes.
No mutation transport, create/update execution, selector discovery, new family,
saved-plan framework or live org calls implicit. Stop on unqualified target state;
whole-feature Gate 4 still belongs to the coordinator after final slice.

# Common offline object projection slice

Start: 2026-10-25T18:06+01:00, clean requested baseline
`69a9eb41f2a51c46683f51032aaffe6130a005df`. Fetch/status completed; no remote
configured. Written slice plan/simplicity preceded edits; inherited reviewed
shared-DMO plan 2873b976 zero must-fix (Gates 1/2 complete). Gate 3 applied as
one coupled object/test slice; no additional workers/root edits. Whole-feature
Gate 4 remains coordinator-owned. Evidence read offline: original source-before
and comparison at F:/Temp/data360-other-replay-S4bRkD (full equality, no source
drift). No new online research or live org calls/writes.

## Exact interface and support boundary

`projectCommonDmoConnectMetadata(connect: unknown, metadata: unknown,
relationships: unknown): DmoCommonProjection` in src/artifacts/dmo-document.ts.
Returns `{status:'projected'|'incomplete', blockers:string[], candidate?:DmoDocument,
createIdentity:{status:'verified',name,sourceApiName}, qualifierBindings,
expectations:{connect,metadata,relationships}}`. Candidate absent only when
Engagement event designation is unavailable, rather than returning invalid authored
JSON. Any incomplete candidate is diagnostic, never an export/deploy artifact.

Composes existing exact field join; binds object identity/labels/descriptions and
explicit default scope, classifies taxonomy/category/execution/metrics/mapping
semantics, validates explicit Connect date references against exact authored
DateTime fields. Does not invent Metadata date properties or infer a lone date.
Unknown meaningful keys/source conflicts reject payload-free; empty auxiliary
Metadata collections checked. Caller must independently acquire complete inputs.
All admitted inputs, including unsupported nonempty relationships, survive as
fresh independent expectations. Foreign/malformed/unknown relationship shapes
reject. Nonempty valid relationships: RELATIONSHIP_REPLAY_UNSUPPORTED.

Recognized Other generated pattern uses the three observed system field identities
and explicit primary Text qualifier, observed labels/defaults/length-60 semantics.
Does not require two authored or six total fields. Positive synthetic counts
1/3/12/19 exercise all twelve types and dynamic/optional authored values. Original
live-fixture-shaped two-plus-four regression is projected without blanket generated
or length blockers. Recipe recognition removes only resolved generated/qualifier/
length blockers. Non-60 Text storage, required/distinct and unknown generated
semantics remain blocked; missing/unknown recipes never become successful by
absence of diagnostics. Profile/Engagement taxonomy/generated replay remain
unproven; Engagement missing event has ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE.
Exact authored event/modified references are handled, but don't clear unrelated
category/taxonomy blockers. Synthetic qualification is not broader live proof.

## Next retrieval integration slice

Common helper coexists with unchanged narrow projector/mappers/service/writer/
command. Integrate the common runtime projection into read-only retrieval next,
requiring status projected, no blockers and validated candidate before writing.
Retain exact API/default binding and complete relationship acquisition. Independently
validate candidate through common authored mapper at writer boundary (not narrow
2-field mapper). Plan any writer interface changes as a separate coherent slice.
No deployment/general category acceptance implicit. Whole-feature Gate 4 runs once
at coordinator after integration; root release/dependency registration also stays
coordinator-owned.

## Verification and propagation

Scoped autofix, explicit build and full zero-warning lint passed. Full tests 126
passed, zero failed/skipped, 14160.2897 ms excluding compile. Packaged help passed
20 entries and 3 outside-repo help checks. Smoke/normal hook final receipts follow
in coordinator response; commit self-hash cannot live
inside this document. Every shell/test entry preflights TEMP, actual Node os.tmpdir
and nonempty TMP/TMPDIR as absolute normalized F:/Temp, repairing only process env
and rechecking. Initial inline quoting failed closed before Git and was corrected
by piped Node preflight. No recursive cleanup; existing package smoke retains
newly allocated verified OS-temp roots. No global edits, push/tag/release.

Gate 5 slice doc propagation checked: README/artifact/capabilities/handover updated;
no npm changelog/version bump. Wiki/sites/tool listings/hover have no affected
surface for this unpublished internal helper. No downstream consumers or language
coupling. Whole-feature Gate 4 remains pending coordinator, not claimed here.

| Component                                                                            | Needs update? | What to update                                  | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | common object projector/tests and existing docs | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                     | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                              | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                    | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                            | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                     | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                     | not needed |

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Common offline field join slice

Start: 2026-10-25T17:58+01:00; clean requested baseline
`5ef6cea3deab3fb50f1d4aa69ff437d847a08c69`. Fetch/status completed; no remote
configured, so upstream cannot be verified. Written slice plan/simplicity check
preceded edits; inherited revised review 2873b976 zero must-fix, Gate 1/2 complete.
Gate 3 applied: full object projection was split at the shared field-join boundary
rather than attempting taxonomy/designation integration in the same worker.
Whole-feature Gate 4 stays coordinator-owned. No extra workers or root edits.

## Exact interface and completed range

`joinDmoConnectMetadataFields(connectFields: unknown, metadataFields: unknown):
DmoJoinedFields` in src/artifacts/dmo-document.ts returns
`{ fields: DmoField[], qualifierBindings: {fieldName,qualifierFieldName}[],
blockers: string[], expectations: {connect: Record<string,unknown>[],
metadata: Record<string,unknown>[]} }`.

Exact case-sensitive qualified one-to-one collection joins, all 12 authored types,
any nonempty count, original authored order and optional description/category
presence. Creation type/label/type agree across sources. Metadata primaryIndexOrder
'1' designates exactly one authored primary; supplied Connect primary must agree.
Metadata string dynamic boolean or supplied Connect boolean supplies dynamic;
conflict or missing-both rejects. Missing primaryIndexOrder is nonprimary under
complete Metadata collection semantics, not Connect-only primary inference.
Explicit unique qualifier reference collection resolves each supplied authored
keyQualifierName to exact System fullName; all references consumed, no suffix
inference, zero/multiple qualifiers allowed. Generated fields never authored.

Unknown properties, unsupported creation/usage values, nonempty summary semantics,
invalid/dangling/duplicate references and source conflicts throw payload-free
DmoDocumentError. Known meaningful semantics classify into blockers instead of
being silently deleted: FIELD_REQUIRED_REPLAY_UNVERIFIED, FIELD_LENGTH_REPLAY_UNVERIFIED
(any positive integer Text storage length, no fixed 60 requirement),
FIELD_DISTINCT_REPLAY_UNVERIFIED, GENERATED_FIELD_REPLAY_UNVERIFIED,
GENERATED_QUALIFIER_REPLAY_UNVERIFIED and GENERATED_FIELD_SEMANTICS_REPLAY_UNVERIFIED.
Independent complete admitted collections remain expectations. Empty blockers
qualify only field joins, NEVER complete object projection/deploy acceptance.

Compatibility projector, service, command, writer and both mappers unchanged.
No new live calls, org writes, reference-plugin identifiers, frameworks or API
acceptance claims. No generated recipe is guessed from arbitrary System fields.

## Next coherent object integration slice

Compose this field join beside the narrow compatibility projector. Reconcile
exact object identity/default scope/category/taxonomy using approved official
contracts and retained evidence; preserve meaningful unknown object config as
specific blockers/rejections. Object eventDateTimeFieldName and
recordModifiedFieldName must come from a valid authoritative source and resolve
exactly to authored DateTime fields, with conflicts rejected. Missing required
Engagement event must return a specific blocker, not infer from a lone DateTime
or ban unrelated categories. Acquire complete relationships; unsupported nonempty
relationships remain diagnostic. No service/writer/command generalization until
common object projection and generated replay qualification are separately green.

## Verification and propagation

Synthetic regressions cover 1/3/12/19 authored counts, every type, reordered joins,
optional values, fresh independent output, dynamic source/absence/conflicts,
complete single/multiple qualifiers, arbitrary length/required/distinct blockers,
unknown extra generated properties and unsupported semantics. Scoped autofix,
explicit build and full zero-warning lint passed. Full tests: 120 passed, zero
failed/skipped, 13941.2236 ms excluding compile. Smoke: 6 passed, zero failed/skipped,
13313.8161 ms. Standalone sequence ended 2026-10-25T18:03:44.6231511+01:00.
Package-check and normal-hook commit receipt follow in the coordinator response
(no self-referential hash in tracked docs).

Every shell/test entry checks TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
against absolute normalized F:/Temp; process-only repair/recheck. Initial inline
PowerShell quoting failed closed before Git workload; piped Node source fixed it.
No recursive cleanup. Existing package-smoke retains owned OS-temp roots.

| Component                                                                            | Needs update? | What to update                                        | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | field join/tests, README/artifact/capability/handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                           | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                    | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                          | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                  | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                           | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                           | not needed |

Slice docs reviewed; whole-feature Gate 4/root release registration stay coordinator
responsibilities. Wiki/sites/tool listings/hover unchanged for unpublished internal
slice. No npm changelog/version bump/push/tag/release/global edits.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Common authored DMO mapper slice

Start: 2026-10-25T17:52+01:00; clean requested HEAD
`cb65e6e29af4450f44c725674d664a5c78e05ff3`. Fetch/status completed; no remote
configured. Written slice plan/simplicity check before edits; inherited revised
plan review 2873b976 zero must-fix. Gate 1/2 complete; Gate 3 one small coupled
mapper/test slice, no new workers. Whole-milestone Gate 4 remains coordinator-owned.

## Done and exact interface

`buildDmoCreateRequestFromDocument(value: unknown, targetDataSpace: unknown):
DmoCreateRequest` lives beside the old narrow helpers, which remain unchanged.
Request: name/label/description?, dataSpaceName:'default', category:
Profile|Other|Engagement, eventDateTimeFieldName?, recordModifiedFieldName?, fields:
{name,label,dataType,description?,category?,isPrimaryKey,isDynamicLookup}[].
Validate authored-only JSON first; map every property individually to a fresh
allowlisted object and fresh fields. Remove only validated terminal object __dlm;
preserve exact authored __c names, order, strings and optional presence. Source
and explicit target both remain default; scope errors precisely identify the
property without echoing values. No runtime projection keys or spec spread.

All 12 documented types, three categories, any nonempty authored field count,
optional field category/description and true/false dynamic lookup map. Existing
exact name/one-primary/exact DateTime-reference invariants remain; Engagement
requires its authored explicit event reference. Missing export designation is a
projector concern, not a reason to reject a documented authored reference.

## Evidence and boundaries

Local mirror search found no input contract. Approved official nested fetches
timed out; indexed full endpoint reference explicitly supplies category/fields/
event/recordModified input, with three title-case categories (do not copy its
uppercase example as enum). Official Data360 payload_examples metadata confirms
seven nested properties and all 12 types, optional string field category/description
and boolean flags without a false-only rule. No org dispatch occurred. That tool
schema omits object event/modified properties; endpoint text is authority for
those. Nested per-property versions are not supplied. No new API 65 runtime
acceptance, cross-space support or generalized generated-field replay is claimed.
The earlier exact qualified field-name evidence is retained, not expanded into a
claim of live acceptance for every combination. No service/projector/command or
writer was changed; they still use the narrow compatibility helpers.

## Verification

Scoped ESLint autofix, explicit build, full zero-warning lint all passed.
Full tests 115 passed, 0 failed/skipped, 14238.7415 ms excluding compile;
16 new common mapper tests cover all types/categories, 1/3/4/12/17 field counts,
optional absence/empty/nonempty, independent references, frozen input/fresh output,
19 invalid mutations, malformed/runtime inputs and exact source/target binding.
Smoke 6 passed, 0 failed/skipped, 12162.2436 ms. Sequence ended
2026-10-25T17:55:44.2826693+01:00. Packaged help and normal enabled hook/commit
receipts follow in coordinator output; no self-referential hash is embedded here.
Every shell/test entry checks actual Node tmpdir, TEMP and nonempty TMP/TMPDIR
against absolute normalized F:/Temp, repairing only process environment/rechecking.
No recursive cleanup; existing package smoke retains its owned OS-temp roots.

## Next bounded generalized projection slice

Generalize only the offline Connect/Metadata projector next: read the actual
Connect and Metadata contracts for arbitrary authored types/counts/categories;
join exact qualified object/field identities; retain unknown configuration as a
blocker rather than drop it. Bind primary/dynamic flags and generated qualifier
references from authoritative metadata, not naming patterns. Acquire complete
relationships as today. Stop the affected variant if generated replay, optional
field classification or designation cannot be proven. In particular Engagement
detail lacks its event designation: find an authoritative metadata designation
and map exact DateTime reference, never infer from a lone DateTime field. Do not
broaden service/writer/command before generalized projection is qualified. No
provenance/schema framework, deployment or live calls/writes implicit.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                          | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | mapper/regressions, README/artifact/capability/handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                             | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                      | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                            | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                    | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                             | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                             | not needed |

Gate 5 slice docs checked after green verification; whole-feature Gate 4/root
release registration stay coordinator-only. No wiki/site/tool listing/hover
change needed for unpublished internal slice. No npm changelog, bump, push, tag,
release, global/root edit, reference identifier copying or org calls/writes.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Explicit retrieve command wiring

Start: 2026-10-25T17:45:08+01:00, clean requested baseline
`f0c7e6b12ac5dbeaa8a5614f6cdaf3da9fb95d06`. Fetch/status completed; no remote is
configured. Actual CMS flags/base finalization and installed core org/API flags
read before edits. Written bounded plan and simplicity check preceded edits;
reviewed narrow Gate 1/2 inherited complete, Gate 3 one coupled command/test slice.
Whole-milestone Gate 4 remains coordinator-owned. Independent shared-DMO planning
worker owns model expansion; no artifact/service/writer model changes in this slice.

## Command and boundaries

`sf data360 retrieve [-o source] [--api-version 65.0] [--data-space default]
-m dmo:Name__dlm [-d project-root] [-x] [--json]`.

Actual CMS metadata/output/overwrite semantics mirrored: metadata repeatable and
multipleNonGreedy, currently exactly one explicit dmo member; output-dir directory
exists:false and default cwd; overwrite boolean default false. Core optionalOrg
supports -o override/configured default; missing org gets blocked envelope. Core
orgApiVersion defaults to explicit 65.0 and passes through unchanged, as does data
space. Command validates selector syntax only, not names/categories/field counts/
profile/version/data-space capability. Existing service owns those decisions.
Current fixture-specific service capability is temporary, not permanent design.
Type-only, no-selector and discovery retrieval remain pending future semantics.
Deploy unchanged/unimplemented; no new deploy path or artifact contract.

Protected acquire/writeDocument seams default to retrieveOtherDmo and
writeOtherDmoDocument. Actual authenticated core connection -> full strict runtime
projection -> candidate only -> independent writer mapper/serializer. Output stays
`<project-root>/data360/default/dmo/Name__dlm.json`; runtime expectations and org IDs
never enter that JSON. Source org identity belongs only to result provenance.

Versioned `sf-data360-retrieve` / 1.0.0 envelope: status success/blocked/failed,
metadata operation/plugin/version/API, diagnostics warnings/errors, provenance
producer/sourceOrgId/pluginVersion/command/time, result scope/selection/items.
Normal SfCommand --json outer wrapper contains this envelope in result; no custom
JSON emitter/framework. Blocked/failed exits 1, success normal exit 0. Parser/auth
flag failures retain core CLI errors. Service/document refusals are blocked;
writer OUTPUT_FAILED or unexpected exceptions are failed. No remote cause/body
is exposed, no silent partial success; publication ambiguity stays failure.

## Tests and verification

Six injected command tests cover full boundary invocation/candidate-only writing,
forward-compatible version/space pass-through without command schema checks,
explicit temporary selector refusal before acquisition/writes, missing org,
redacted acquisition/service failure and all writer failures. Existing CLI tests
now assert retrieve blocked envelope and help flags; deploy refusal unchanged.
Capability test now honestly distinguishes general unsupported families from
bounded implemented DMO retrieval. Scoped autofix, explicit build and full lint
passed with zero warnings. Full suite: 99 passed, 0 failed/skipped (12,514.017 ms
excluding compile). Smoke: 6 passed, 0 failed/skipped (12,380.0983 ms). Sequence
ended 2026-10-25T17:49:10.9918441+01:00. Packaged help and normal enabled hook
receipts are supplied in coordinator output after commit; no self hash embedded here.

## Next slice

Consume independent shared-common-DMO plan and approved scope before changing
models; do not make this command's current service shape permanent. Tests use
injected synthetic seams; no live org calls/writes occurred. Discovery/type-only/
no-selector future behavior stays pending. Preserve writer path/publication safety
and independently validated authored artifact. No deployment expansion implicit.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                                | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | command/tests/topic/help, README/artifact/capability/handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                                   | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                            | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                                  | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                          | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                                   | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                                   | not needed |

Gate 5 slice docs checked; whole-feature Gate 4 remains coordinator-owned. Root
release/dependency registration remains coordinator-only. No wiki/site/tool listing/
hover update needed for unpublished slice; no npm changelog/version/release prepared.
Every shell/test entry checks TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
as absolute normalized F:/Temp with process-only repair/recheck. Existing smoke
owns OS-temp fixtures; command tests require no scratch. No recursive cleanup,
root/global edits, org calls/writes, push/tag/release or additional workers.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Bounded authored Other file writer

Start: 2026-10-25T17:35:58+01:00, clean requested baseline
`b03857ee0191620650f2e9eb426284d2e111a3f9`. Read master plan, actual CMS retrieve
flags, service, serializer and mapper before edits. Written slice plan and
simplicity check preceded edits. Reviewed narrow Gate 1/2 inherited complete;
Gate 3 applied by splitting writer/test from dependent command wiring. Whole
milestone Gate 4 remains coordinator-owned; no new workers or root edits.

## Done and exact interface

`writeOtherDmoDocument(value: unknown, projectRoot: string, overwrite: boolean)`
returns `Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }>` from
src/artifacts/write-other-dmo.ts. Independently map authored candidate through
buildOtherDmoCreateRequestFromDocument(value, 'default'), validate and serialize
only schemaVersion/kind/identity/spec with existing canonical serializer. Exact
output: `<project-root>/data360/default/dmo/<api-name>.json`. Family is `dmo` per
master plan; no new artifact contract or request transport exists.

Identical bytes preserve file/mtime without overwrite; differing regular-file
bytes require overwrite. Directory destinations, file ancestors, links/junctions
at root/ancestors/destination reject. Ancestors and prior bytes rechecked before
publication. Stage flushed bytes in new verified OS-temp mkdtemp root, keep random
ownership marker; atomic rename for replacements, exclusive hard-link for new
files, then unlink only own staging file entry to remove alias. Cross-volume
publication deliberately fails closed, no non-atomic copy fallback. OUTPUT_FAILED
must never be reported as partial success: inspect destination before retrying
because a post-publication operation can fail. No hostile concurrent filesystem
sandbox guarantee; check-to-use races remain. No recursive cleanup; roots retained.

Six independent synthetic tests cover canonical exact path/authored-only bytes,
link count, identical true no-op, overwrite refusal/replacement, independent mapper
rejection before side effects, directory/file collisions, root/all ancestor
junctions and linked destination. Package allowlist inventory updated 18 -> 20
for writer JS/declaration pair. Initial Windows mkdir-on-existing-drive-root
failure fixed by lstat before creation; initial await-member lint issues fixed.
Scoped autofix, explicit build and full zero-warning lint passed. Focused writer
suite: 6/6 (174.2806 ms). Full suite: 93 passed, 0 failed/skipped
(12,839.9695 ms excluding compile); smoke: 6 passed, 0 failed/skipped
(11,024.286 ms). Sequence ended 2026-10-25T17:41:19.0242703+01:00.
Final package-help and normal enabled-hook receipts are supplied by coordinator
output after completion; no self-referential commit hash is embedded here.

## Next command slice (not implemented here)

Wire `sf data360 retrieve -m dmo:Name__dlm` only, with actual CMS definitions:
repeatable/non-greedy `-m, --metadata`; `-d, --output-dir` directory exists:false,
project-root default cwd; `-x, --overwrite` boolean default false. Add core default
org/`-o` override, explicit API 65.0 and default data space. Read actual CMS base
flag/envelope behavior first. Authenticate only after bounded selector validation;
acquire retrieveOtherDmo full strict runtime projection, then pass only candidate
to this writer (which independently maps it). Emit versioned contract/status/
metadata/diagnostics/provenance/result; failed/blocked nonzero exit and payload-free
errors. Inject acquisition/auth seam for tests; no live org calls required.
Discovery/type-only/no-selector retrieval remain temporarily unimplemented, NOT
removed from approved future semantics. Deploy remains unimplemented. Add CLI
regressions, full verification/smoke/package-help, normal enabled literal-path
commit under current approval. No new artifact contract, org write, push/tag/release.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                                        | Status     |
| ------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | writer/tests/package inventory, README/artifact/capabilities/handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                                           | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                                    | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                                          | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                                  | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                                           | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                                           | not needed |

Gate 5 slice docs audited; whole-feature Gate 4 remains coordinator-owned. No
wiki/site/tool listing/hover or Git workflow change needed. Root release/dependency
registration remains coordinator-only. Fetch/status passed; no remote configured.
Every shell/test entry preflights actual Node tmpdir/TEMP/nonempty TMP/TMPDIR for
absolute normalized F:/Temp, process-only repair/recheck. Initial inline quoting
failed closed before workload, corrected by piped Node source then existing script.
No live calls/writes, global settings, push/tag/release or recursive deletion.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Authored-only Other document mapper

Start: 2026-10-25T17:30:09+01:00, clean baseline
`d02eed6cad10c2f1c8fedb148ec22a546d938043`. Written slice plan and
simplicity check preceded edits. Final plan review d198e9ac had zero must-fix;
Gate 1/2 complete, Gate 3 one small coupled sequential mapper/test slice. No
additional review or worker; whole-feature Gate 4 remains coordinator-owned.

## Exact interface and approved artifact

`buildOtherDmoCreateRequestFromDocument(value: unknown, targetDataSpace: unknown):
OtherDmoCreateRequest` is a separate export in src/artifacts/dmo-document.ts.
It calls validateDmoDocument, then accepts only source/explicit target default,
category Other, exactly one Text primary and one DateTime nonprimary field,
both dynamicLookup false. Field description/category and event/record-modified
references reject. Unknown/relationship/runtime keys reject through validation.
The validated terminal __dlm rule derives the object base; exact authored __c
names, labels, order and optional object description presence survive. Outputs
are fresh and input is immutable. No framework, fabricated expectations or calls.

Approved Git JSON contains only schemaVersion/kind/identity/spec. Internal source
expectations remain in the runtime projection, not the Git file. Existing
buildOtherDmoCreateRequest strict projection revalidation and forged-projection
tests are intact. Deploy must independently validate the authored file, acquire
any necessary runtime expectations and later verify actual target readback.
This section supersedes earlier handover instructions to persist projections.
No deploy/CLI/transport/org behavior was added.

## Verification receipt

Scoped ESLint autofix, explicit build and full zero-warning lint passed. Full
suite: 87 passed, 0 failed/skipped (11,654.072 ms excluding compile). There are
35 new tests: exact standalone JSON request, optional description presence,
frozen input/fresh independent output, 32 individual unsupported mutations,
and explicit target/malformed/projection/accessor refusals. Initial lint clone
heuristic was fixed by naming serialized bytes, keeping actual JSON parse tests.
Smoke: 6 passed, 0 failed/skipped (11,793.1526 ms); standalone sequence ended
2026-10-25T17:33:00.7611133+01:00. Normal enabled hook/commit final receipts follow
in coordinator output; self-referential commit hash is not embedded here.

Every shell/test entry verifies TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
as absolute normalized F:/Temp. Initial inline quoting failed closed; piped
preflight passed after process-only repair/recheck. No recursive cleanup or
scratch allocation by this slice. Existing smoke retains owned OS-temp fixtures.
Fetch/status done; no remote, so upstream unavailable. Personal Git identity
verified. Only literal own paths staged; no push/tag/release/root/global edits.

## Next CLI output slice

Wire one explicit Other/default retrieve command to retrieveOtherDmo using core
authentication and explicit API 65.0. Qualify full internal source projection,
then serialize only its authored candidate with serializeDmoDocument and validate
with the new authored mapper; never persist expectations or synthesize them.
Define deterministic safe output path and overwrite refusal before edits. Add
isolated verified OS-temp filesystem/CLI tests and payload-free refusals. Keep
deploy/write transport, discovery, broader categories/spaces and frameworks out.
Gate 4 and root release/dependency registration remain coordinator follow-ups.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                                  | Status     |
| ------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | mapper/tests, README, artifact contract, capabilities, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                                     | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                              | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                                    | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                            | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                                     | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                                     | not needed |

Gate 5 slice documentation checked after green checks; whole-feature Gate 4 is
coordinator-owned. Wiki/sites/tool listings/hover and Git workflow need no update.
No npm changelog. No release/version bump prepared; keep all commits local.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Internal read-only Other retrieval service

Start: 2026-10-25T17:15:49+01:00. Clean baseline
`df1dbbf20303bde36c2585e849db92c39fbc5cb5`. Written slice plan and simplicity
check preceded edits. Inherited reviewed narrow Gate 1/2 remains applicable;
Gate 3 is one small coupled sequential service/test slice. No extra reviewer or
whole-milestone Gate 4; that remains coordinator-owned.

## Exact interface and real acquisition seam

`retrieveOtherDmo(connection: ReadConnection, objectApiName: unknown,
apiVersion: unknown, dataSpace: unknown): Promise<DmoConnectMetadataProjection>`
uses Pick<Connection, instanceUrl | request | metadata | getApiVersion>.
Require explicit API 65.0 and matching connection version, exact supported local
custom __dlm identity and case-sensitive default. No version mutation/fallback.
Use ConnectClient detail GET, core connection.metadata.read('CustomObject',
[objectApiName]), then complete incoming/outgoing relationship acquisition.
Array read must return exactly one record with exact fullName. Missing, foreign,
ambiguous or wrapped results block; all Metadata content reaches the strict join.
Installed JSforce source establishes decoded records array and SOAP version from
connection; retained successful Other experiment establishes the actual core
metadata.read seam. Evidence inspected offline only, no new org calls.

Strict projectDmoConnectMetadata and buildOtherDmoCreateRequest both run before
success. Return full independent projection/expectations, identity and qualifier
bindings, never a detached candidate. Existing ConnectError/DmoDocumentError
remain payload-free; OtherDmoRetrieveError has INVALID_SCOPE, INVALID_METADATA
or ACQUISITION_FAILED, with no remote cause/payload. No partial success, writable
transport, CLI/file wiring, Profile/Engagement or general DMO claim. Bounded
profile stays two authored fields plus four expected generated fields.

## Verification

Scoped ESLint autofix, explicit build and full zero-warning lint passed.
Focused artifact/service suite: 24 passed, 0 failed (934.5759 ms).
Full tests: 52 passed, 0 failed/skipped (12,801.9002 ms excluding compile).
Smoke: 6 passed, 0 failed/skipped (12,992.8261 ms). Sequence completed
2026-10-25T17:20:10.2558445+01:00. Five added synthetic tests cover real adapter
calls, scope/version refusal before acquisition, missing/ambiguous envelopes,
exact joins/category/default checks, incomplete/nonempty relationships and
payload-free failures at every acquisition phase. Initial helper-scope lint and
fixture name-binding assertion failures were fixed, not suppressed.
Package smoke expected inventory updated to 18 for the new JS/declaration pair;
final checks and normal hook/commit receipt follow outside this self-referential
commit. Hook remains unmodified and enabled.

Every shell entry verifies TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
against absolute normalized F:/Temp; process-only repair/recheck. No recursive
cleanup. Existing smoke owns retained OS-temp roots. Fetch/status done; no remote
exists, so upstream state cannot be verified. Personal Git identity checked before
commit; only literal own paths staged. No push/tag/release, root edits, global
settings, live org call/mutation or reference-plugin identifiers.

## Next coherent CLI/file slice

Wire only an explicit single-object Other/default retrieve command to this service
using existing core authentication and explicit API 65.0. First define the full
projection envelope's deterministic file serialization/revalidation and safe output
path/overwrite contract; never persist only candidate or accept projection without
expectations. Add isolated OS-temp filesystem/CLI tests and payload-free refusal
checks. Keep deploy, writes, discovery, broader categories/spaces and general
artifact framework out. Root registration and whole-milestone Gate 4 remain
coordinator follow-ups, not completed here.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                                                      | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | service/tests, README, capabilities, artifact contract, handover, package inventory | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                                                         | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                                                  | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                                                        | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                                                                | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                                                         | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                                                         | not needed |

Gate 5 slice docs checked after green checks; Gate 4 deliberately remains with
coordinator. Wiki/sites/tool listings/hover and Git workflow need no update.
No npm changelog. Root release/dependency registration stays coordinator-only.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Bounded offline Other create-request mapper

Start: 2026-10-25T17:08:55+01:00. Clean baseline
`0f22dd522495e97d81ac06a4f9a0581651ce4602`. Written slice plan and simplicity
check preceded edits. Inherited reviewed narrowed Gate 1/2 applies; Gate 3 is one
small coupled sequential module/test slice. No new subagent or whole Gate 4;
whole-feature review remains coordinator-owned.

## Contract and exact interface

`buildOtherDmoCreateRequest(value: unknown, targetDataSpace: unknown):
OtherDmoCreateRequest` rechecks complete joined expectations through
projectDmoConnectMetadata and checks candidate, verified identity, qualifier binding
and empty blockers against the recomputed result. Detached documents and forged
unsupported profiles reject with payload-free DmoDocumentError. This validates
shape/semantics, not authenticity of JSON or proof of an org snapshot; acquisition
and complete relationship inventory remain the caller's prerequisite.

Source and explicit target both must equal case-sensitive default. No inferred
fallback, arbitrary space or cross-space acceptance. The fresh minimal request
contains name (verified object base), label, optional description, dataSpaceName,
category Other, and two authored fields containing exact name, label, dataType,
isPrimaryKey, isDynamicLookup. System fields, qualifiers, org IDs and read-only
metadata remain expectations only. No transport, org call/write, Profile,
Engagement, relationship, update/no-op or CLI generalization.

Local text mirrors had no nested contract. Approved official nested URL fetch
timed out, then indexed full official reference text was inspected. Its example
uses unsuffixed field inputs but does not prohibit qualified names. Existing
API 65 cross-org replay at F:/Temp/data360-other-replay-S4bRkD submitted authored
ContractKey__c and ObservedAt__c unchanged, matched all six exact readback field
identities and passed with no source drift (completed 2026-10-25T15:52:30.908Z).
Thus preserve proven authored __c names; no inversion or new blocker is needed.
Artifact-format documents source URL and evidence boundaries. No unrelated
mapping/stream search synthesis was treated as nested field contract.

## Verification receipt

Scoped ESLint autofix, explicit build and full zero-warning lint passed. One
initial unicorn/no-null fixture issue was fixed before verification. Full tests:
47 passed, 0 failed/skipped, 11,441.5985 ms excluding compile. Smoke: 6 passed,
0 failed/skipped, 10,733.2266 ms. Standalone sequence ended
2026-10-25T17:12:53.8143479+01:00. Four new synthetic tests cover exact minimal
body/no generated replay, independent output, explicit source/target binding,
16 forged-profile mutations, detached candidate refusal, exact authored names
and omitted optional description. Normal enabled hooks repeat lint/build/full
tests/smoke; final hook counts, commit hash/time/clean receipt follow outside
this self-referential commit.

Every shell entry checks TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR for
absolute normalized F:/Temp; process-only repair/recheck. Initial inline quoting
failed closed before Git/workload; piped Node source then passed. No scratch
allocation or recursive cleanup by this slice. Existing smoke retains owned OS
temp fixtures. Fetch/status completed; no remote exists, so upstream is unverifiable.
Personal Git identity verified. Only literal own paths staged. No push/tag/release,
root edits, global settings or live calls/writes.

## Next coherent retrieve-service slice

Implement one internal read-only Other/default retrieve service with an injected
Connect/Metadata acquisition seam. Require explicit object identity, API version
and data space; acquire detail, exact matching Metadata and complete relationships,
then run the strict projector and bounded mapper as offline validation. Return the
complete projection (including expectations), never a detached candidate as a
portable deploy artifact. Synthetic tests should cover scope/identity joins,
missing metadata, incomplete/failed relationships and propagated payload-free
errors. No filesystem/CLI/deploy/update changes or new live acceptance implicit.
Establish the Metadata read seam from actual source before editing; do not invent
unsupported SDK methods or discard unknown properties.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, capabilities, artifact contract, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                      | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                              | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

Gate 5 slice docs updated after green verification; Gate 4 deliberately deferred
to coordinator as instructed. README/artifact/capabilities/handover cover this
internal helper. Git workflow, wiki/sites/tool listings/hover and other packages
need no change. No npm changelog. Root release/dependency registration remains
coordinator-only; no whole-feature propagation completion claimed.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Autonomous offline Other create identity

Start: 2026-10-25T17:04:30+01:00. Clean baseline
`2b7766331238abe69e3dc19d6f46a36b65fb8103`. Written narrow slice plan and
simplicity check preceded edits. Inherited approved Gate 2 applies; one small
coupled sequential module/test slice satisfies Gate 3. Whole-milestone Gate 4
remains coordinator-owned, not claimed here.

## Exact interface and semantics

`projectDmoConnectMetadata(connect: unknown, metadata: unknown, relationships:
unknown): DmoConnectMetadataProjection` keeps every prior strict Other profile,
exact object/field join and explicit qualifier binding check. Its result now has
`status: 'projected'`, `blockers: []`, and
`createIdentity: { status: 'verified'; name: string; sourceApiName: string }`.
After all profile checks and candidate validation, `name` removes exactly one
terminal case-sensitive __dlm. The existing validated base grammar requires a
leading ASCII letter, ASCII alphanumerics/internal single underscores, no trailing
or double underscores and no case-insensitive SSOT prefix. Case is preserved;
no sanitization, namespaces, internal replacement or retained-request subsystem.
Candidate identity, Connect name and Metadata fullName remain qualified and exact.
No developerName is invented. Generated fields/readback expectations and qualifier
joins are unchanged. projectDmoRawFields remains explicitly incomplete unchanged.

Official naming research supplied by the coordinator resolves the paired custom
create/read name and documented name restrictions; artifact-format records the
exact official input URL. No new online lookup or live org call occurred.
No request builder: nested field create-name suffix evidence is still unresolved.
Projected means this offline shape/identity only, not deployment, writable Metadata,
CLI, Profile/Engagement, update/no-op or general schema support.

## Verification and commit receipt

Scoped ESLint autofix, explicit build and full zero-warning lint passed.
Full tests: 43 passed, 0 failed/skipped, 10,952.087 ms excluding compile.
Smoke: 6 passed, 0 failed/skipped, 11,498.0891 ms. Standalone sequence ended
2026-10-25T17:06:05.7988945+01:00. Two new naming tests cover ordinary/mixed-case/
internal-single-underscore names and 18 malformed/unsupported names; existing
strict joins, malformed profile and qualifier tests remain unchanged except the
expected identity/status. Normal enabled hooks repeat lint/build/full tests/smoke;
exact hook counts, commit hash/end time/clean state are supplied in the receipt
outside this commit (a commit cannot embed its own hash).

Every shell/test entry verifies TEMP, actual Node tmpdir and nonempty TMP/TMPDIR
against absolute normalized F:/Temp, with process-only repair/recheck. The initial
inline Node quoting failed closed before Git/workload; piped code corrected it.
No recursive cleanup or scratch allocation by this slice, root edits, remote/global
settings, push, tags, release or org mutation. No remote exists, so fetch cannot
verify upstream. Only literal own paths are staged under focused-slice approval.

## Next smallest implementation slice

Resolve only the nested custom field request-name contract from authoritative
input/readback evidence, then construct a tiny bounded offline Other create
request from this exact validated projection and verified base object identity.
Keep target data-space binding explicit. Stop if field identity inversion cannot
be proved; do not expand to deployment orchestration, Profile/Engagement, update,
CLI or org calls. No retained create-request/provenance framework is needed.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, capabilities, artifact contract, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                      | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                              | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

README/capability/artifact surfaces updated. Wiki/sites/tool listings/hover and
Git workflow need no change. No npm changelog. Gate 5 slice propagation done;
root registration/release dependency map remain coordinator-only follow-ups.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Strict offline Other Connect/Metadata projection

Start: 2026-10-25T16:54:34+01:00. Clean baseline
`dfec01f2983ceb8be725120a3445fd2b07673975`. Inherited approved master/narrowed
plan review a2f47117 and one-fixture semantic-equivalence evidence. Written
bounded slice plan preceded edits; smallest-design check rejected a general
framework. One sequential slice with shared join invariants; no additional
worker or whole-milestone Gate 4 (coordinator responsibility).

## Evidence and interfaces

Read only existing experiment comparison and source snapshot at
`F:/Temp/data360-other-replay-S4bRkD`. The comparison reports full equality,
excluding Connect ID and field-array ordering, no source drift, for ONLY one
Other fixture. No live org calls or mutation in this slice. Synthetic test
names/labels/data space are independently authored, not copied fixture values.

`projectDmoConnectMetadata(connect: unknown, metadata: unknown, relationships:
unknown): DmoConnectMetadataProjection` is internal/offline. Exact DMO and field
identities join Connect to Metadata; no case folding/suffix guessing. Qualifiers
resolve keyQualifierName -> refAttrDeveloperName -> exact generated fullName.
Metadata primaryIndexOrder '1' and explicit dynamic 'false' supply candidate
flags; any supplied Connect flags must agree. Only the observed disabled,
unsegmentable, unmapped Other variant with Text primary/DateTime authored
fields, four System Text fields and empty relationships is accepted. Metadata
required/length presence, usage/distinctness, labels, creation types, taxonomy,
empty auxiliary collections and unknown keys are checked, not presumed writable.

Result: status incomplete; blockers ['CREATE_IDENTITY_UNVERIFIED']; two-field
DmoDocument candidate; createIdentity {status: 'unverified', sourceApiName};
qualifierBindings [{fieldName, qualifierFieldName}]; complete independent
expectations {connect, metadata}. Generated fields and all admitted readback
properties remain in expectations, never writable Metadata API input. Source
identity is not verified autonomous request-name provenance; no portable/export
or deploy claim, public command wiring or transport writes. Profile/Engagement,
relationships, other shapes, repeat no-op/update remain pending.

## Verification and next slice

Two new synthetic tests cover successful field-order-independent joins,
non-suffix qualifier binding, authoritative omitted Connect flags, independent
expectations, nondeployable envelope and 22 unsupported/malformed cases. Scoped
ESLint autofix, build, zero-warning lint, full tests and smoke run before normal
enabled focused commit hooks. Exact counts/hash/timestamps/clean state are in
the coordinator receipt. An initial npm argument placement incorrectly passed
--no-workspaces to ESLint and stopped; corrected npm exec scoped autofix. One
clone-style lint error was resolved with structuredClone, no suppression.

Next smallest actionable slice: preserve verified create-name provenance as an
explicit input/evidence binding, then construct a bounded offline Other request
only when that binding exists. Stop rather than derive a request name from the
readback suffix. No new live proof/writes implicit; Profile needs its own semantic
equivalence gate and Engagement designation remains separate.

Every shell/test entry checks absolute normalized TEMP, actual os.tmpdir and
nonempty TMP/TMPDIR against F:/Temp, repairing/rechecking process-only if needed.
No recursive cleanup, scratch allocation, root edits, push/tag/release or global
configuration change. No remote configured; upstream cannot be verified. Version
read directly from package.json: @joernberkefeld/sf-plugin-data360 0.1.0, unchanged.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, capabilities, artifact evidence, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                      | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                              | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

Wiki/sites/tool listings/hover and Git workflow need no update. No npm changelog.
Root registration is coordinator-only and remains outside this slice. Gate 5
slice docs are applied; whole-milestone review is deliberately not claimed.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Live API 65 relationship contract correction

Start: 2026-10-25T16:12:47+01:00. Clean baseline:
`0e096f96d5890e974f1442a0a8a23637f47d99d6`. Approved Gate 1/2 and sized Gate 3
inherited and explicitly confirmed. One sequential evidence-first slice; no
additional workers, saved plans, whole-feature review or root edits. Smallest
design check rejected a general binding framework and guessed event designation.

## Read-only live evidence

Salesforce source org MCP discover/describe ran first (`data360-schema-get`);
its recipe exposed no dispatch operations and recommended credential-displaying
CLI output, which was not used. Existing Salesforce core auth verified exactly
`00Daj000010xkZNEAY` for `mcnext-sdo` before metadata reads, without tokens.
All requests used explicit API 65.0 and dataspace default. Our ConnectClient
performed detail and relationship reads. A CLI GET status-only check confirmed
HTTP 204; response headers were not printed. No org/customer payload was saved.

- Prior-run synthetic DMO: zero relationships, HTTP 204 with no JSON envelope.
- Standard Individual DMO: totalSize 142; limit 1 returned one record, limit 20
  returned 20 at offsets 0/20 and two at offset 140. Complete corrected helper
  returned all 142 across eight pages. No count/sortBy properties were returned.
  Nonterminal pages have nextPageUrl; terminal page does not. No link was followed.
- Relationship keys: cardinality, creationType, id, name, owner, sourceField,
  sourceObject, status, targetField, targetObject. Field objects have label/name/
  type; endpoint objects have keyQualifierField/label/name. All 284 endpoint
  qualifier properties were null; no populated-qualifier contract is inferred.
  All inspected records had targetField; absence remains preserved, not invented.
- Synthetic detail: category ENGAGEMENT, two custom and four system fields.
  Primary key qualifier reference omits __c while the generated field has it;
  that observation is not a generally proven suffix binding rule.
- Critical blocker: detail omits eventDateTimeFieldName. Even a single DateTime
  field does not prove designation. Existing projection correctly throws
  DmoDocumentError; a new independent regression locks in refusal to guess.
  No usable portable export is claimed. Generated replay also remains unverified.

## Implemented correction and exact interface

`ConnectClient.listDataModelObjectRelationships(name, dataSpace)` retains its
Promise<Array<Record<string, unknown>>> interface, but validates the actual
sourceObject/targetObject identities. totalSize remains mandatory/stable;
count is optional but checked when supplied. The private read method passes a
private Symbol through JSforce noContentResponse: only actual HTTP 204 becomes
empty initial inventory. Undefined JSON still fails INVALID_PAGE; 204 after a
nonzero advertised total fails INCOMPLETE_LIST. Existing same-origin/redirect/
budget/overlap guards remain. All record metadata is returned untouched.
`get` and field projection public interfaces are unchanged; no new scaffolding.

## Verification and next slice

Standalone lint:fix, explicit build and zero-warning lint passed. Full final
suite and smoke counts/commit/clean receipt follow in coordinator output.
No remote is configured; git fetch returned successfully but cannot verify
upstream. Personal repo email verified. Initial inline PowerShell quoting failed
before execution; piped Node source resolved it. requestRaw is not available on
this core connection, so CLI GET supplied status evidence; our client exercised
all actual metadata retrieval and final complete pagination.

Next implementable slice: use approved read-only authoritative metadata inspection
to locate the designated Engagement event field and record-modified designation
(e.g. selected-version metadata entity contract), reconcile by qualified DMO/field
identity, then project the explicitly relationship-free synthetic profile. Stop
if no authoritative designation exists; do not infer it from field type/name.
Populated qualifier resolution and generated-field replay require separate proof
before a portable deployment artifact can be accepted. No writes to prior-run
fixtures, rows, compute or activation are authorized.

All shell/test entries checked TEMP, actual os.tmpdir and nonempty TMP/TMPDIR
against absolute normalized F:/Temp, with process-only repair/recheck. No recursive
cleanup, scratch allocation, push, tag, publication or global config changes.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                  | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, capability, artifact evidence, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                     | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                              | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                    | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                            | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                     | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                     | not needed |

Wiki/sites/hover and Git workflow need no update. No npm changelog or release.
Root registration remains coordinator-only and was not edited.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Read-only DMO relationship acquisition slice

Start: 2026-10-25T16:05:03+01:00. Clean baseline:
`a077193c1c92ed4b3830dc423d82fc819b03d40f`. Gate 1/2 complete and Gate 3 sized
were inherited and explicitly confirmed. One small sequential transport slice;
no additional workers, whole-feature review or root edits. Smallest design check:
no universal relationship/schema framework, CLI, discovery or mutation added.

## Evidence and exact interface

Local mirrors had no relationship response contract. Approved official online
lookup supplied the full endpoint-specific section of the
[Connect REST reference](https://developer.salesforce.com/docs/data/connectapi/references/spec),
checked 2026-10-25. GET `/ssot/data-model-objects/{dataModelObjectName}/relationships`
is available from API 64.0 and covers the DMO as source OR target. Documented query:
creationType, dataspace, limit (default 20), offset, orderBy, sortBy, status.
Response example: relationships/count/totalSize/sortBy plus current/next/previous
URL/token pairs. The sample's URLs reference a different v63 legacy route; do not
follow them or infer its equivalence. The example abbreviates records relative to
count, so count-as-page-length validation is intentionally conservative and needs
selected-version live acceptance; incompatible responses block, never get silently
reinterpreted. No org call was necessary. An MCP search initially supplied an
unsupported limit argument despite its advertised schema; removing it succeeded.
No tool execution or customer-row access occurred.

- `ConnectClient.listDataModelObjectRelationships(dataModelObjectName: string,
dataSpace: string): Promise<Array<Record<string, unknown>>>` returns complete
  raw metadata under validated pagination assumptions or throws payload-free
  ConnectError. Version <64 and unsupported identifier scope reject before calls.
- Requests documented route, explicit dataspace, limit 20, offsets 0..2000,
  orderBy ASC and sortBy DeveloperName. No status/creation filtering. Offset 2000
  is our local safety budget, NOT a documented relationship server ceiling.
- Completion requires stable nonnegative integer totalSize, count equal page
  length, accumulated total equality and no truthy next URL/token. A full page
  can terminate when total proves exhaustion; short nonterminal pages block.
  Unknown envelope keys, malformed metadata, duplicates, foreign DMO records,
  total drift, budget exhaustion and transport errors never return partial data.
- Raw records retain ALL metadata including unknown nested fields, qualifiers,
  generated names, status and optional/absent targetField. Source/target names
  must exist and one must match the requested DMO. Query establishes data-space
  scope; no undocumented per-entry dataspace property is invented. No consistent
  snapshot or detection of equal-total concurrent changes is claimed.
- Existing `projectDmoRawFields` stays unchanged and ALWAYS incomplete with
  RELATIONSHIPS_NOT_ACQUIRED. No portable binding, replay or deploy support claimed.

## Verification and commit boundary

Standalone lint:fix, explicit build, zero-warning lint all exit 0. Full tests:
37 passed, 0 failed/skipped (12,807.7177 ms excluding compile). CLI smoke:
6 passed, 0 failed/skipped (12,468.1862 ms). Six new independently authored
synthetic tests cover directions/scope/raw fidelity, pagination, terminal pages,
malformed/unknown envelopes, overlap/drift/budget/failure and invalid inputs.
Initial lint found null fixture style and await-member style; fixed without
suppressions. Package smoke and normal enabled commit hook receipt follow in the
coordinator response, including exact commit hash and clean state.
All shell/test entries verified TEMP, actual Node tmpdir and nonempty TMP/TMPDIR
against F:/Temp; process-local repair/recheck only. No recursive cleanup.
No push/tag/publication, remote/global settings, tokens or live fixtures.

## Next smallest slice

Bind acquired relationships to qualified DMO/field identities in a lossless
incomplete projection, including calculated-insight endpoints and absent target
fields as explicit blockers where replay is unverified. Decide portable schema
only from full authoritative input schema; do not guess generated-name/qualifier
replay or remove existing incompleteness prematurely. A later bounded read-only
primary-org check can validate selected-version count/total assumptions if needed.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, capabilities, artifact evidence, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumers                                      | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                              | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

Wiki/sites/hover and Git workflow need no update for this unpublished internal
transport helper. No npm changelog; whole-feature review and root registration
remain coordinator follow-ups outside this slice.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

# Nested DMO field projection slice

Start: 2026-10-25T15:51:01+01:00. Clean baseline:
`8508b58261a40cca6da9744c0195503737fd2474`. Approved Gate 1/2 and sized Gate 3
inherited; one coherent small sequential contract/projection slice. No additional
worker, whole-feature review, public plan infrastructure or root edits.

## Evidence and exact interfaces

Local mirrors lacked the nested contract. Official reference HTML linked
`/static/datacloud/connectapi/spec/cdp-connect-api-Swagger.yaml`; the linked
asset returned 404, nested rendering timed out. Search summaries crossed API
boundaries and were not used as contract evidence. Official Salesforce Data360
MCP `payload_examples('d360_dmo_create')` exposed the complete nested field
schema of `DataModelObjectInputRepresentation`: category/string, dataType/enum,
description/string, isDynamicLookup/boolean, isPrimaryKey/boolean, label/string,
name/string; no nested required list. Enum: Number, Text, Date, DateTime, Url,
Phone, Email, Percent, Boolean, Currency, ArrayOfFloats, ArrayOfTexts. This is
current tool metadata, not selected-version live acceptance. Name-suffix example
and description disagree; request-name conversion remains unimplemented.
See artifact-format for official URL, schema distinction and limits.

- `DmoField.dataType` now covers those 12 values; optional `category: string` and
  `isDynamicLookup: boolean` are preserved. Existing validator/serializer
  signatures and other authored subset invariants remain unchanged.
- `projectDmoRawFields(value: unknown): DmoFieldProjection` returns exactly
  `{ status: 'incomplete', blockers: string[], candidate: DmoDocument,
configuration: Record<string, unknown> }`. Candidate is diagnostic only, never
  an export/deploy artifact. Configuration retains all admitted raw config,
  original spelling/presence/order and every generated field; records are copied.
- Read type maps to candidate dataType; absent flags default false in candidate
  only; explicit malformed flags block. Uppercase categories normalize only in
  candidate. Unknown fields/variants/nested semantic objects/accessors/duplicates
  throw payload-free DmoDocumentError rather than discarding data.
- Qualifiers, usage tags, distinctness remain verbatim in configuration and add
  FIELD_SEMANTICS_REPLAY_UNVERIFIED. System fields remain verbatim and add
  GENERATED_FIELD_REPLAY_UNVERIFIED. No guessed generated-field deletion or
  creation recipe. No arbitrary field IDs are stripped.
- Every result has RELATIONSHIPS_NOT_ACQUIRED. Official
  `payload_examples('d360_dmo_relationship_list')` describes a separate list
  covering source or target, required dataModelObjectName, optional dataspace,
  status and creationType. No relationship response/pagination contract yet.
  No complete portability, replay, qualifier-reference resolution or deploy claim.
- Object observations excluded from configuration are exactly id,
  hasExternalDataLakeObjectMappings, isEditable, isEnabled, isSegmentable.
  These still require future target preflight handling. No org call or customer
  row access, credential inspection or mutation occurred.

## Verification and boundary

Standalone build, lint:fix and zero-warning lint exit 0; full tests 31 passed,
0 failed/skipped (10,708.6355 ms excluding compile); CLI smoke 6 passed,
0 failed/skipped (10,751.2654 ms). Three new synthetic tests exercise all 12 types,
category/dynamic flags, retained qualifier/generated fields, independent copies,
explicit incompleteness, unknown/duplicate/invalid input and accessor refusal.
Initial lint caught a null style issue and compile caught an autofix-induced
includes type narrowing; both corrected before green verification.
Packaged installation/help smoke passed: 16 entries, 3 help checks, retained root
`F:/Temp/data360-package-0lTI3a`. Normal enabled commit hooks repeat lock check,
zero-warning lint, build/full tests and smoke; exact hook counts/hash/end/clean
state supplied in coordinator receipt. Personal identity verified. No recursive
cleanup. Every executing shell/test checked actual Node tmpdir and TEMP/nonempty
TMP/TMPDIR; process-only repair/recheck when necessary. One inline PowerShell
quoting error stopped before workload and was corrected.

## Next smallest slice

Relationship contract/acquisition only: establish exact endpoint, source-or-target
scope, pagination envelope and complete termination; implement read-only transport
with synthetic completeness/unknown-field tests. Then separately bind qualified
relationship identities and verified generated-key replay to a portable artifact.
Do not remove incomplete blockers until evidence and tests replace them. No CLI,
discovery, request construction or org mutation is implicit.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, artifact evidence, capabilities, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumer                                       | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent packages                              | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

Wiki/sites/hover need no update for this unpublished helper. Git workflow unchanged;
no npm changelog. Whole-feature review and root release/dependency registration
remain coordinator-only follow-ups, not claimed complete or edited here.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

No push/tag/publication or remote/global settings change. Keep this slice local
under the user's explicit no-push instruction.

# Portable DMO document slice handover

Start: 2026-10-25T15:40:16+01:00. Clean baseline:
`df649d00c0b0f0f40df252b38bc9f22667c94a5a`. Approved Gate 1/2 and sized Gate 3
were inherited and applied: one coherent offline module/test slice, no additional
workers or whole-feature review. No saved-plan or root edits.

## Interfaces and evidence

- `validateDmoDocument(value: unknown): DmoDocument` validates without projection,
  coercion or mutation; `serializeDmoDocument(value: unknown): string` produces
  recursively sorted object keys, two-space JSON, final LF and unchanged arrays
  and string values. `DmoDocumentError` carries a payload-free constant message.
- `classifyDmoRawField(level: 'object' | 'field', key: string)` returns
  `configuration | observation | unknown`. This is key classification only, not
  an adapter or approval to discard observations during target preflight.
- Exact version-1 shape: `kind: 'dmo'`,
  `identity: { dataSpace, apiName }`, `spec: { label, description?, category,
eventDateTimeFieldName?, recordModifiedFieldName?, fields }`. Canonical custom
  object/field names end `__dlm`/`__c`; non-namespaced local identifier subset only.
  Categories: `Profile | Other | Engagement`. Fields preserve original order:
  `{ name, label, description?, dataType: 'Date' | 'DateTime', isPrimaryKey:
boolean, isDynamicLookup: false }`. Exactly one primary key, unique names
  ignoring case; date-time references must resolve exactly to a DateTime field.
  Engagement requires the event reference. Unknown keys at every level block.
- [Official endpoint reference](https://developer.salesforce.com/docs/data/connectapi/references/spec),
  checked 2026-10-25 after local mirror gap: custom DMO POST/PATCH available from
  61.0; table lists dataSpaceName/description/label/name/category/event date/fields/
  record-modified/type/status. The table uses title-case categories, its example
  uppercase; no server normalization or selected-version support is claimed.
  Independent synthetic fixtures use the documented Date/DateTime sample types.
  Nested Data Object Field Input rendering was unavailable (direct fetch timed
  out); therefore broader field types are blocked, not guessed. This small subset
  is intentionally not a universal schema and publishes no JSON Schema yet.
- Object raw observations: id/hasExternalDataLakeObjectMappings/isEditable/
  isEnabled/isSegmentable. Object configuration: name/dataSpaceName/label/
  description/category/eventDateTimeFieldName/recordModifiedFieldName/fields/
  creationType. Field configuration: name/label/description/type/isPrimaryKey/
  isDynamicLookup/creationType/keyQualifierName/isDistinct/usageTag. All other
  keys are unknown; no generic field-ID exemption. Qualifiers/distinctness/usage
  remain meaningful even though not admitted to this authored subset. A future
  raw exporter must preserve/resolve them or block, never drop them.
- Input-versus-output name suffixes, dataType-versus-type, generated qualifiers,
  relationships and safe PATCH semantics are explicit future adapter checkpoints.
  No round trip or deployability is claimed. No filesystem/CLI/live changes.

## Verification receipt

Standalone build, lint:fix and zero-warning lint passed; full package tests
28 passed, 0 failed/skipped; CLI smoke 6 passed, 0 failed/skipped. Packaged install
and all 3 outside-repository help checks passed with exactly 16 package entries.
Seven new synthetic tests cover accepted
shape, deterministic bytes/order/string fidelity, identity/version/unknown-field
rejection, duplicate/primary keys/references/types, accessors/hooks and raw key
classification. The package smoke now checks 16 files (previous transport had
already expanded the bootstrap's stale 12-file assertion), explicitly including
the new JS/declaration module; no public schema exists to package.

The first lint surfaced JSDoc/style issues and the build caught the existing
TypeScript library target's lack of toSorted declarations; both fixed without
config/runtime changes. One rule-scoped documented suppression sorts a fresh
entries array, preserving input. Initial package smoke exposed the stale count;
dry-run inventory confirmed the exact 16 shipped files. Nothing recursively
removed. All scratch is retained in script-owned OS-temp roots. Shell/test entry
checks actual Node tmpdir plus TEMP/nonempty TMP/TMPDIR; only process environment
repair was used. Initial inline PowerShell quoting failed closed before workload,
then the existing repository preflight script was used consistently.

## Next coherent slice

Evidence-first DMO raw projection: establish full nested writable field schema,
raw field attributes, qualifier generation and separate relationship retrieval;
then implement a bounded lossless projection or explicit unsupported-variant
blocker with synthetic detail fixtures. Do not broaden this artifact enum on SQL
or unrelated object evidence. If evidence requires extending the subset, evolve
it here before publishing JSON Schema. No discovery/CLI/live mutation is implicit.

## Propagation Table

| Component                                                                            | Needs update? | What to update                                    | Status     |
| ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                    | Yes           | README, artifact contract, capabilities, handover | done       |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser                              | N/A           | No coupling                                       | not needed |
| sfmc-language-lsp, vscode-sfmc-language                                              | N/A           | No language change                                | not needed |
| mcp-server-sfmc, mcp-server-mcdev                                                    | N/A           | No consumer                                       | not needed |
| sf-plugin-mcnext, sf-plugin-cms                                                      | N/A           | Independent package                               | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc                        | N/A           | No coupling                                       | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A           | No coupling                                       | not needed |

Wiki/sites/hover data need no update for this unpublished internal module. Git
workflow unchanged; no changelog under npm-package policy. Coordinator-only root
release/dependency registration remains pending, explicitly outside this slice.
No full-feature propagation/review completion is claimed.

| Folder            | Changed? | Current version | New version                  |
| ----------------- | -------- | --------------- | ---------------------------- |
| sf-plugin-data360 | Yes      | 0.1.0           | No bump; no release prepared |

No push, tag, publication, remote/global configuration or org call was performed.
The personal local Git identity was verified. Final commit hash/clean status and
hook counts are supplied in the coordinator receipt (self-hash cannot be stored).

# DMO pagination slice handover

## Current bounded slice: 2026-10-25

Start: 2026-10-25T15:33:29+01:00. Baseline clean HEAD:
`a9a01d8f473dd06920420a715c9257455a3e951a`. Gate 1/2 and sized Gate 3 were
inherited approved; no whole-feature review is claimed. This slice changes only
transport, synthetic tests, README, capability checklist and this handover.

### Official evidence and interface

Local authoritative text mirrors had no DMO list contract. Approved official-site
lookup supplied the full endpoint-specific reference section:
[Data360 Connect REST reference](https://developer.salesforce.com/docs/data/connectapi/references/spec).
Checked 2026-10-25: `GET /ssot/data-model-objects` (available 61.0), `limit`
(default 50), `offset`, `orderBy` (ASC/DESC), response `dataModelObject` array.
The documented 400 diagnostic identifies a maximum offset of 2000. The reference
sample includes `name`, `dataSpaceName` and fields on each entry, with no total,
page-token or next-link envelope. Search-result synthesis initially mixed in
another endpoint's pagination; only the full DMO-specific section was used.
No org inspection was needed; no live calls or org fixtures exist for this slice.

- `ConnectClient.listDataModelObjects(): Promise<Array<Record<string, unknown>>>`
  requests 50 entries at offsets 0, 50, ... 2000 with `orderBy=ASC`, using only
  guarded `get`. Returns raw objects without canonical projection or filtering.
- A short page (including empty) establishes exhaustion under limit/offset
  semantics. An exactly full page requires another request. A full offset-2000
  page fails closed; there is no illegal offset-2050 request or partial return.
- Requires a valid array, maximum 50 items, and nonempty string `name` and
  `dataSpaceName` identities. Duplicate qualified identities within/across pages
  fail rather than accepting overlap/repetition. No stable snapshot is promised
  during concurrent org changes; offset pagination cannot detect every omission.
- New payload-free `ConnectError.code` values: `INVALID_PAGE` for malformed pages
  or non-null continuation URLs/tokens, `INCOMPLETE_LIST` for overlap or exhausted
  safe offset range. No response-supplied link is followed, even same-origin.
  Existing authentication/request diagnostics remain unchanged.
- API-version selection remains explicit. The reference's minimum endpoint
  version is evidence, not live acceptance of every field at every version;
  adapter availability preflight is still pending.

### Verification / commit receipt

Standalone verification completed 2026-10-25T15:37:11+01:00:
`npm run lint:fix`, explicit build and zero-warning lint all exit 0;
full `npm test` 21 passed, 0 failed/skipped (11,612.0617 ms excluding compile);
`npm run smoke` 6 passed, 0 failed/skipped (11,327.6367 ms).
Seven new pagination test cases cover completion, empty/exact-multiple endings,
malformed later pages, unsafe/unexpected next links, overlaps/loops, ceiling
truncation, terminal ceiling page and mid-list transport failure. Normal hooks
repeat registry lock validation, zero-warning lint, build/full tests and smoke.
The coordinator receipt records their exact counts, successful commit exit,
commit hash and clean status after commit (the commit cannot embed its own hash).
Normal hooks remain enabled. No pushes, tags,
publication, remote setup, root edits, recursive cleanup or scratch allocation by
this slice. Existing CLI smoke owns retained OS-temp fixtures. All shell/test
entries checked actual Node tmpdir and TEMP/nonempty TMP/TMPDIR against F:/Temp;
the initial shell quoting failure stopped before Git/workload execution, then
process-only environment recheck succeeded.

### Next smallest artifact slice

Implement only portable DMO identity/document validation and deterministic JSON
serialization with synthetic fixtures: `schemaVersion`, `kind`, qualified
`identity`, and the smallest evidence-backed `spec`. Establish writable/read-only
field classification before freezing that spec; stop if evidence is insufficient.
No filesystem discovery, adapters, CLI changes or writes yet. Avoid a seven-family
schema framework. Do not extend this pagination helper to unrelated envelopes.

Propagation: package README/capabilities/handover updated; artifact-format and Git
workflow remain accurate (no artifacts/CLI behavior delivered). No downstream
consumers. Language/data/parser/LSP/extensions/MCP/MSO, CMS and MCNext are N/A;
wiki/sites/hover data need no changes for an unpublished internal helper. Root
release/dependency registration remains a coordinator-only follow-up, not an
approved edit. Package stays 0.1.0; no release/version bump is being prepared.

# Previous transport/authentication slice handover

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
