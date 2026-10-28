# Segment A1 live DBT checkpoint — 2026-10-28

This continuation supersedes the older A1 status immediately below. Gate1/Gate2
were already closed; Gate3 kept this to one A1 owner with stable serialized
verification. No A2 executor, public create/update, whole-feature Gate4 or broad
Gate5 was started. Fetch/status found main at origin/main
1762ac0ab2264fb78d30ad09165e1e815e62ce28, with only prior A1 owned inputs dirty;
no ahead commits existed to accidentally push. Version remains 0.1.0.

## Observed contract corrections and exact new interfaces

- `projectSegment(response, apiName)` now returns an independently
  `validateSegmentDocument`-admitted detached candidate plus private runtime.
  Exact observed DBT audit references (`createdBy`/`lastModifiedBy` with id only),
  audit dates, `segmentOnId`, and generated `segmentMembershipDmo` with exactly
  `historyTable`/`latestTable` are classified private observations, never authored
  content. Unknown fields still block. `segmentMembershipTable` was not observed
  on this DBT fixture and is deliberately NOT admitted from the earlier UI probe.
- Only empty `parameters:[]` is admitted; nonempty parameter semantics block.
  `validateSegmentCriteria(document:SegmentDocument, criteria:string,
  escaped=true):void` validates the runtime's redundant escaped DBT pipeline
  against the typed exact model/name/SQL. Divergence is SEGMENT_PAIR_MISMATCH;
  no silently dropped criteria or opaque parameter content.
- `writeSegmentDocument` retains its four existing arguments and adds optional
  fifth filesystem publication seam `{link,rename,unlink}` for deterministic
  failure/race tests. Production defaults are native fs/promises functions.
  A linked destination is counted as published BEFORE unlinking its staging
  hardlink; a staging unlink failure now correctly reports PARTIAL_SEGMENT_OUTPUT.
  First-publication failure remains OUTPUT_FAILED; a racing companion is preserved
  and diagnosed partial rather than overwritten or falsely reported complete.
- New regression count: four additional tests (observed DBT/private fields and
  divergent criteria/parameter refusal; staging-unlink failure; racing companion;
  first-publication failure). Existing synthetic coverage is retained.

## Exact source fixture ledger and evidence scope

Before probes, verification DB subjects `data360:segment.dbt.source-create-update.api65`
and `data360:segment.metadata-definition.runtime-absence.api65` were consulted.
MCP discover/describe CompanyProfileInfo followed by independent Organization
queries verified source 00Daj000010xkZNEAY and target 00Dfj00000bRQabEAG; CLI
StateAggregator/AuthInfo independently matched mcnext-sdo and mcnext-thuy.
Persistent validation projects were inspected but never edited. Target was not
mutated. Existing source PROFILE DMO UnifiedssotIndividualMkt__dlm was read-only
inspected as isSegmentable with primary field ssot__Id__c; not provisioned/modified.

Owned SOURCE fixture: A1Probe5952383596d846c6, created once with exact SQL
`SELECT UnifiedssotIndividualMkt__dlm.ssot__Id__c FROM UnifiedssotIndividualMkt__dlm WHERE 1 = 0`,
one model with matching name, NoRefresh, test-only description. Predeclared
budget: 12 minutes, <=20 live reads, <=1 create and <=1 delete, no mutation retry.
Ledger began 2026-10-28T00:12:44.436Z; final read ended 00:16:58.035Z (4m13.599s).
Direct ledger records four reads including prerequisite/detail/absence; public
plugin invocations performed three additional exact runtime GETs (one blocked
before Metadata), with two successful standard Metadata retrieves. No list sweep.

- One core-authenticated API65 POST accepted PROCESSING with NO_REFRESH/P90D.
  HTTP status is not asserted here: parsed-body receipts do not expose it.
- Separate exact GET initially confirmed persisted DBT semantics. Initial actual
  public retrieve blocked UNKNOWN_SEGMENT_CONFIGURATION, demonstrating the exact
  missing classification fixed above.
- Actual `node bin/run.js data360 retrieve -o mcnext-sdo -m segment:A1Probe5952383596d846c6
  -d <owned OS-temp output> --json` succeeded exit0/status success, one retrieved
  XML/JSON pair, errors=[]; public command with installed Metadata CLI 2.151.7.
  Both independently acquired representations passed exact pair correlation.
- Repeated same actual public command returned exit0/status success/unchanged for
  both paths. No overwrite flag, manual manifest/summary or authored request file.
- Separate runtime GET reached ACTIVE with original SQL, NO_REFRESH/P90D and
  lastSegmentMemberCount=0. Empty SQL/NoRefresh did not suppress processing.
- One qualified exact native DELETE resolved empty. Independent exact GET rejected
  ITEM_NOT_FOUND; saved error exposes name/errorCode, NOT HTTP status. No retry.
  Exact fixture is no longer readable. Metadata inventory absence and physical
  membership/generated-table cleanup were NOT checked; do not claim global cleanup
  or separately delete generated/shared objects. No retained readable Segment.

Run scratch `F:/Temp/data360-a1-live-pXMjF8` and test/transport/staging scratch
remain retained. No recursive cleanup or persistent-project edits. No tokens/raw
responses/customer data are committed. Sanitized durable atomic evidence lives in
root subject `data360:segment.dbt.a1-worktree-roundtrip.api65`; owned-subject schema
validation returned zero errors. Shared DB index/rebuild/validate/gaps remain the
coordinator's job. Evidence deliberately uses api-behavior/live-api rather than
plugin-acceptance: actual invocation used uncommitted A1 code based on the SHA
above, not an accepted committed revision or installed release.

## Verification, checkpoint preservation and resume

Stable final code: scoped ESLint autofix, full lint (zero warnings), explicit build,
focused regressions 49/49 (1.58669s test phase), full npm test 480/480 (110.331879s
node test phase; intrinsic build additionally ran), zero failures/skips. CLI smoke
and normal-hook commit receipt are recorded in the continuation final report after
completion. Earlier 476-test result below is historical, not acceptance of these
edits. Normal hooks remain enabled. Checkpoint execution began approximately
2026-10-28T00:08Z; elapsed at stable verification/handover was approximately 15min.
Only literal A1 source/test paths and this safe handover belong to the package
checkpoint. Root evidence subject remains a distinct coordinator-owned commit
input; unrelated root history is not pushed. No version bump/tag/release for A1.

Live one-fixture DBT pair round-trip and repeat-byte contract are now observed.
Two live selected fixtures were not attempted because the bounded create budget
was one (synthetic repeated-selection tests still cover dedupe/routing).
**Permission-aware general absence and exact Metadata-only shell-conflict
admission remain UNRESOLVED; A2 must keep create blocked.** A successful read and
subsequent ITEM_NOT_FOUND on this owned fixture do not prove permission behavior
for arbitrary names or shell absence. No Metadata-only fixture was created.

Next smallest A2 slice: pair disk-input/digest resolution and read-only Segment
preview against exact present runtime, using these document/acquisition interfaces;
retain explicit create-blocked diagnostics until a separate bounded permission/
shell-conflict qualification closes that gap. Defer executor/processing effects,
reference rebinding/expansion and Git pair integration to follow-on bounded slices.
No full A2, cross-org migration, deployment no-op or successful computation is
accepted here. Whole-feature review and public README/capability/artifact/Git/guide
propagation stay deferred to the coordinator; independent package has no language,
LSP, hover, wiki or workspace-consumer dependency changes.

# Segment A1 checkpoint — implementation verified, live acceptance incomplete

2026-10-28 execution follows the reviewed operational-routes plan (Gate1/Gate2
already complete). Fetch reconciled main to origin/main at
1762ac0ab2264fb78d30ad09165e1e815e62ce28, clean before edits; the previously
recorded ahead-eight state was stale. No commit, push, release, installation,
org mutation, recursive deletion, or persistent validation-project edit occurred.
Coordinator owns history preservation, once-whole-feature Gate4 and broad Gate5.

## Actual exported interfaces and ownership

- `src/artifacts/segment-document.ts`: `SegmentReference = {kind:'dmo',
dataSpace:'default', apiName:string}`; `SegmentDocument = {schemaVersion:1,
kind:'segment', identity:{dataSpace:'default',apiName}, spec:{displayName,
description, segmentType:'DBT', segmentOn:SegmentReference,
models:Array<{name,sql}>, dependencies:Array<SegmentReference & {fields:string[]}>,
publishInterval:'NO_REFRESH', lookbackPeriod:'P90D'}}`.
  `validateSegmentDocument(unknown):SegmentDocument`,
  `validateSegmentPair(unknown, xml:string):SegmentDocument`,
  `serializeSegmentDocument(unknown):string`,
  `segmentSqlDependencies(sql:string):SegmentDocument['spec']['dependencies']`.
  Validators detach and reject unknown keys. Only one ordered model and the
  qualified single-object `SELECT Object__dlm.Field__c FROM Object__dlm WHERE 1 = 0`
  grammar (whitespace/case differences admitted, original SQL retained) currently
  have dependency admission. This deliberately blocks all other SQL, not a claim
  of general SQL portability. P90D is preserved observed content, never generated
  as a writable default. Fixed escaped DBT XML grammar is admission only, not a
  Salesforce serializer. Divergent model/SQL/label/type and unknown XML block.
- `src/transport/project-metadata.ts`:
  `MetadataRunner = (arguments_:string[],cwd:string)=>Promise<{exitCode:number,
stdout:string}>`; `retrieveSegmentMetadata(targetOrg:string,apiName:string,
runner?:MetadataRunner):Promise<string>`; `runProjectMetadata` implements that
  runner. Explicit standard CLI exact API65 retrieve in an owned mkdtemp DX
  project, wait five minutes, child timeout 330 seconds, max output 4 MiB.
  Requires terminal done/success/Succeeded, no messages/warnings, exactly one
  Created MarketSegmentDefinition member, and bounded no-link decomposed XML.
  Nonterminal results stop unconfirmed; no guessed report contract or retries.
  Windows uses the installed npm CLI JavaScript entry via Node with argument
  arrays, no shell interpolation or installation. Exported
  `verifyTemporaryDirectory():void` and
  `inspectSegmentPath(file:string):Promise<Stats>` support the pair writer.
- `src/services/retrieve-segment.ts`:
  `retrieveSegment(connection,apiName:string,apiVersion:string|ApiVersionSelection,
dataSpace:string,metadata?:(targetOrg:string,name:string)=>Promise<string>)`
  returns `Promise<SegmentAcquisition>` with `{identity,candidate?,definitionXml?,
blockers:string[],expectations?:{runtime:Record<string,unknown>}}`. Connection
  needs instanceUrl/request/getApiVersion/getUsername. Exact fixed API65 GET
  reuses ConnectClient's no-refresh/retry/redirect guards; no transport modification
  or writes. Candidate exists only after independent XML correlation.
  `projectSegment(response:unknown,apiName:string)` returns private runtime and
  unvalidated portable projection; callers MUST use validateSegmentPair before
  publication. Current allowlisted runtime observations are segment/definition
  IDs, status and last member count only; other fields intentionally block until
  their exact DBT semantics are classified. Expectations stay private.
- `src/artifacts/write-segment.ts`:
  `writeSegmentDocument(value:unknown,definitionXml:string,projectRoot:string,
overwrite:boolean):Promise<{path:string,companionPath:string,
outcome:'retrieved'|'unchanged'}>`. XML path is configured/default package root
  plus `main/default/marketSegmentDefinitions/<name>.marketSegmentDefinition-meta.xml`;
  companion is `main/default/data360/segments/<name>.segment.json`. Both existing
  byte sets are checked before publication, staged/flushed under verified OS temp,
  rechecked and completion-validated. Two renames cannot be transactional;
  `PARTIAL_SEGMENT_OUTPUT` explicitly diagnoses post-first-publication failure.
  Normal no-clobber, unchanged byte preservation, no-link and single-link checks
  apply. Scratch roots retained; no recursive cleanup.
- `src/commands/data360/retrieve.ts`: additive protected `acquireSegment` and
  `writeSegment` seams. Exact repeated segment selectors dedupe/sort, no implicit
  DMO inventory for Segment-only selection, existing DMO flow retained. Results
  add optional `family:'segment'` and `companionPath`; DMO response items unchanged.
  Bare segment inventory refuses; omitted/type DMO inventory retains existing
  behavior and help explicitly states Segment inventory is excluded. Numeric65 /
  default only for Segment, with failure before auth for latest/unsupported scope.
- Tests owned: `test/segment-document.test.mjs` (28 tests) and additions to
  `test/retrieve-command.test.mjs` (17 total). Deploy/read-deploy-input/Git files
  remain untouched for A2. No package/dependency/version changes; version 0.1.0.

## Verification and evidence

Final code: scoped ESLint autofix passed, full lint passed with zero warnings,
explicit build passed, focused tests 45/45 (1.431 s test-runner time), full
`npm test --no-workspaces` passed 476/476, no skips/failures. Full npm-test wall
110.413 s including intrinsic build; node test phase 106.960 s. Combined final
lint/build/focused/full shell 125.212 s. This is synthetic package verification,
not complete A1 live acceptance or package-install smoke. No automatic installs.
TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR were checked at shell entries;
initial malformed shell quoting was corrected before fetch/workload; process-only
repair used F:/Temp. All created scratch roots use verified OS-temp mkdtemp and
are retained; no deletion authorization is presumed from placement.

Verification DB lookup before qualification consulted
`data360:segment.dbt.source-create-update.api65` and
`data360:segment.metadata-definition.runtime-absence.api65`. These are historical
API evidence, not current plugin acceptance. No new database acceptance claim
was created. Headless discover -> describe CompanyProfileInfo -> dispatch_readonly
Organization query verified both MCP org IDs against the user-provided expected
bindings. CLI StateAggregator/AuthInfo independently matched both explicit aliases.
Persistent validation project package directories were read, not altered.

Bounded current read-only evidence: installed CLI 2.151.7 standard exact retrieve
of the existing documented source UI Segment returned exit0/status0,
done/success/Succeeded, no warnings, and one Created MarketSegmentDefinition.
Its result keys are done/fileProperties/id/status/success/messages/files; member
keys fullName/type/state/filePath. The source-decomposed XML was 3448 characters.
An independent exact API65 runtime GET exposed one UI/P2Y/NO_REFRESH component,
not the supported DBT/P90D variant. Runtime keys include audit fields, parameters,
publishStatus, segmentMembershipDmo/Table and segmentOnId, in addition to core
identity/configuration. These must not be generically allowlisted for DBT from
this UI observation; runtime-only meaningful fields need specific classification.
No member data was queried or published; only field names/state categories were
reported. Initial Node --input-type invocation conflicted with a core worker and
was corrected to dynamic import without --input-type; successful read followed.

## Concrete unfinished checkpoints and A2 resume

A1 is NOT fully accepted: no current supported DBT pair exists in the newly owned
fixture ledger (historical owned fixtures were removed). Read-only A1 cannot
create one; successful synthetic acquisition/pair tests and UI definition transport
do not prove current DBT plugin round-trip. Need a bounded authorized fixture
qualification in A2 or a specifically provided compatible existing exact DBT name
(read-only acquisition only), classify its complete API65 runtime meaningful fields,
then verify actual plugin one/two exact retrieval and repeated byte equality.
Unknown fields and unsupported SQL stay blocked; do not weaken admission to make
an existing UI segment pass. Source/current target write acceptance remains absent.

Permission-aware exact absence and independent exact Metadata shell-conflict
admission remain UNRESOLVED. Generic404 returns SEGMENT_ACQUISITION_FAILED and
never absent; no complete inventory/list/pagination claim. A2 must block create
until its specific absence/permission/shell evidence is qualified. The standard
terminal retrieve/decomposition checkpoint is resolved for installed CLI, but
nonterminal jobs deliberately remain unconfirmed rather than guessed success.

A2 starts at these exact document/service interfaces, reconciles the current
worktree, and owns preview/execute, processing acknowledgement, target reference
binding and dependency expansion, paired disk input/digest, command/deploy/Git
integration, source owned fixtures and bounded independent readback. No Segment
runtime write transport is enabled here. Add remaining safety tests for pair
publication I/O/race failures and broader meaningful-field classification before
claiming full acceptance. Do not predeploy XML before runtime create, invent
writable schedule/lookback defaults, strip IDs without typed binding, or treat
historical cleanup as fixture ownership.

Fixture ledger: no newly created or adopted org resources; no existing business
resource modified. Shared source UI Segment was read only. Target binding verified
only; no target resource API changes or new fixture. Scratch projects/staging/test
roots under F:/Temp retained with no recursive deletion. No persistent project
files modified. Coordinator retains broad docs propagation; README/capability/
artifact/Git public contracts must be updated accurately before milestone A release.
No language/LSP/hover/wiki/workspace consumer updates are needed for this independent
package. No A1 release is permitted; coordinator owns any checkpoint commit/push.

# Internal DLO raw inventory acquisition — Gate5 documentation handover

Parent Gate4 reviewer ba84604a reviewed actual code with zero must-fix and zero
optional findings. Gate5 is limited to `docs/capabilities.md` and this handover;
existing source/test changes are preserved. Fetch/status confirmed main at
b832bd5d0209bbeadd25aa97aac4a42aa613b34e, ahead six and not behind, with only
`src/transport/connect-client.ts` and `test/connect-client.test.mjs` modified
before documentation edits. TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
were normalized absolute F:/Temp before shell workloads; no cleanup is needed.

Internal interface:
`ConnectClient.listDataLakeObjects(): Promise<DloInventoryAcquisition>` starts
at `GET /services/data/v65.0/ssot/data-lake-objects?limit=20`. Its schemaVersion 1,
kind `dlo-inventory-acquisition`, apiVersion `65.0` envelope retains raw `pages`,
always has status `incomplete` and blocker `INVENTORY_COMPLETENESS_UNVERIFIED`.
Optional page/entry metadata survives. Pagination is `no-next-observed` when the
next link is absent/empty or `request-budget-reached` after the local 100-request
budget. This budget is not a documented server ceiling; neither termination
state proves completeness, default-space scope or absence, even for empty pages
or optional totals. There is no complete-inventory or portable-export admission.

Continuations must be same-origin on the exact API65 collection route with only
unique allowlisted positive numeric limit/offset or ASC/DESC orderBy parameters.
Malformed envelopes, unsafe continuations and repeated requests fail closed;
query ordering is canonicalized for loop detection. Existing operation-local
no-refresh, no-retry and no-redirect guards are reused. API68 official-reference
annotations showing list/detail availability from API60 are reference evidence,
not live API65 qualification. Detail completeness, stream/connector acquisition,
lineage, generated replay, public CLI and write blockers remain unchanged.

Verification receipt supplied by the coordinator, not rerun by this docs slice:
explicit build green, full lint zero warnings, focused transport tests 81/81,
full suite 445/445 and CLI smoke 30/30. The older 397/397 receipt below belongs to
the prior exact-name acquisition slice and is not the current inventory receipt.
Gate5 documentation verification: scoped Prettier check passed for both approved
files after formatting this handover; tooling tests passed 12/12, including the
required capability-heading check; git diff --check passed. These checks do not
repeat or replace the supplied full-suite receipt. The final combined exact tree still requires
binding and full verification through the normal enabled pre-commit hook before
any authorized commit; this handover does not claim that hook has run.

Propagation assessment: capabilities and handover updated; public README needs no
change because no public command surface changes. No npm CHANGELOG is created
(release notes belong to GitHub Releases). sf-plugin-data has no workspace
consumers; language data/LSP/hover URLs, mcdev wiki, sfmc.guide and
joernberkefeld.com listings are unrelated and need no update. No dependency,
root, version or release bookkeeping files are modified. Working package version
is 0.1.0; next version remains unassigned until fresh release approval. No org,
network documentation, artifact output, staging, commit, push or release is
performed. Git fetch is the only remote operation in this documentation slice.

# Internal DLO exact-name acquisition — historical receipt

Gate1 and parent Gate2 e082ac4e completed before implementation (zero must-fix,
zero optional). Gate3 used one small coupled artifact/service/test slice; no nested
workers or root edits. Pre-edit TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR
checks passed at F:/Temp; fetch/status confirmed clean main at
1a10abc46050d441d55900e9709a7ae92f5b8945, ahead five.

New internal interfaces:

- `retrieveDlo(connection, apiName, apiVersion, dataSpace): Promise<DloAcquisition>`
  in `src/services/retrieve-dlo.ts`; existing connection only, explicit API65 and
  default-space/name guards before its sole fixed Connect detail GET. Connection
  version mismatch fails before GET. ConnectClient's landed operation-local
  no-refresh GET receiver is reused, not reimplemented.
- `validateDloAcquisition(value: unknown): DloAcquisition` in
  `src/artifacts/dlo-acquisition.ts`; detached JSON-safe clone, exact returned
  name and explicit matching default-space evidence, strict boolean typing,
  retained generated/unknown fields, metadata, all spaces and filters.
- Envelope: schemaVersion 1, kind dlo-acquisition, apiVersion 65.0,
  identity `{ dataSpace: 'default', apiName }`, status always incomplete,
  blockers string[], detail raw record. Four mandatory blockers:
  GENERATED_FIELD_REPLAY_UNVERIFIED, EXTERNAL_BINDINGS_NOT_ACQUIRED,
  LINEAGE_NOT_ACQUIRED, DETAIL_COLLECTION_COMPLETENESS_UNVERIFIED.
- Extra derived blockers: UNKNOWN_CONFIGURATION, MULTIPLE_DATA_SPACES,
  DATA_SPACE_FILTER_REPLAY_UNVERIFIED, EMPTY_FIELD_COLLECTION,
  SCHEMA_VARIANT_UNVERIFIED. Existing caller blocker codes remain retained.

Tests live in `test/dlo-acquisition.test.mjs` and `test/dlo-retrieve.test.mjs`.
Verification: scoped ESLint autofix passed; explicit build passed; full lint
passed with zero warnings; focused DLO tests 33/33; full tests 397/397
(106.756 seconds), CLI smoke 30/30 (103.298 seconds), git diff --check passed.
Combined final verification workload completed with exit 0 in 226.603 seconds.
Implementation plus verification took approximately nine minutes. Parent owns whole-feature
Gate4/Gate5 and any later explicitly approved commit. No live org/auth/API network
calls, artifact output, CLI exposure, deploy admission, list, stream, lineage,
write, version/tag/release, commit or push occurred. Git fetch was the sole remote
operation.

Next read-only contract gaps: prove API65 detail collection completeness and
schema variants; classify generated replay versus authored fields; separately
acquire external connector/data-stream bindings and lineage. Confirm API65 PATCH
field payload discrepancy and connector prerequisites before write planning.
Current API67 additions are not evidence of API65 write support. Nothing here
claims empty fields mean empty ingested records or portable configuration.

Propagation assessment for parent Gate5: sf-plugin-data internal code, tests and
capabilities/handover docs updated. No workspace consumers; language packages,
mcdev wiki, guide/site listings and hover URL data are unrelated. Public README
command surface remains unchanged. Working package version remains 0.1.0;
new version unassigned until fresh release approval. Keep all work local.

# Internal DMO DELETE transport — verified, parent review pending

Started clean at fb6968bda21f6c107107f26868265cde2b077977; fetch/status passed,
main ahead four. Written bounded DELETE plan and parent Gate2 reviewer 4e5593ea
completed with zero must-fix; optional test-placement suggestion was not adopted.
Gate3 kept this coupled transport/test slice small. No enabled service/CLI or DLO
acquisition was added; parent owns Gate4/Gate5 before coordinated commit.

ConnectClient.deleteDataModelObject(dataModelObjectName: string): Promise<unknown>
in src/transport/connect-client.ts requires requested numeric 65.0 and the existing
non-namespaced custom-subset spelling (no ssot prefix); it sends exactly DELETE
/services/data/v65.0/ssot/data-model-objects/{name}, without body/query/cascade option.
It reuses noRefreshReceiver/send for no refresh/replay, retry or redirect and
payload-free errors. Name syntax cannot establish target Custom kind, ownership,
default-space binding or dependency safety. Response remains untrusted; 204/404
are not confirmed deletion or absence. No dependency, artifact or fixture cleanup.

Existing test/connect-client.test.mjs contains all synthetic coverage: exact route
and retained response, malformed/runtime/known-standard/namespaced-name rejection,
64/66/latest refusal before requests, sanitized 400/401/403/404/409/network-timeout
errors, actual-core DELETE 401/503/204 one-attempt/no-refresh/no-replay and unchanged
caller descriptors/prototype. Actual-core redirect refusal covers same/cross-origin.
Existing GET/POST/PATCH, path/version and relationship-204 regressions remain green.
Capabilities and artifact-format notes retain blockers A-C: unknown REST collateral
and complete dependency admission, unapproved public interface, and absent scoped
disposable-fixture live-delete approval. No non-cascading/live/async-contract claim.

Verification: initial scoped lint flagged the intentionally invalid null test input;
a named one-line suppression documents that precise test reason. Corrected scoped
autofix, explicit build and focused tests passed 59/59 (1.239s Node; 7.500s pipeline /
7.974s shell). Full zero-warning lint, npm test --no-workspaces 364/364 (105.548s),
CLI smoke 30/30 (101.972s), git diff --check passed, exit 0: full pipeline 217.094s /
218.668s shell. TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR passed F:/Temp
checks at every shell entry. Only this handover receipt followed green code.
No org/auth/API calls, live deletion, recursive cleanup, root/dependency/version
changes, stage/commit/push/tag/release. Existing fixtures remain preserved.
Next: parent review/propagation and coordinated commit; then separately approved
DLO acquisition with constant-incomplete detail blocker and explicit default-space
evidence constraints. Enabled DMO deletion remains blocked, not silently complete.

# GET single-attempt prerequisite — verified, parent review pending

Started from clean 1983e07aa8d105af947fd69a0c082c4dceffa905; fetch/status succeeded
(main ahead three). Separate written GET plan and parent Gate2 reviewer 936fdbf9
completed with zero must-fix/optional findings; Gate3 selected one small coupled slice.
No DELETE transport, DLO acquisition, root, dependency or version changes.

src/transport/connect-client.ts renames the private writeReceiver to
noRefreshReceiver and uses a fresh receiver for read() as well as POST/PATCH.
Public interfaces, paths, version selection, response parsing, noContentResponse,
retry/redirect guards and payload-free errors are unchanged. Only operation-local
_refreshDelegate is masked; caller connection, credentials, version and globals
are not modified. Expired ConnectClient SSOT authentication now fails immediately
rather than refreshing/replaying; repair auth before a new explicit invocation.
This does not cover version discovery or change the separate Metadata/SOAP guard.

test/connect-client.test.mjs extends installed Connection.prototype.request stack
regressions with GET 401/503/200 on synthetic DMO and DLO routes. They prove one
HTTP attempt, no delegate/OAuth refresh/replay, inherited original bearer token,
exact method/path/no body, secret-free errors and unchanged connection descriptors
and prototype. Actual-core GET redirect callback refusal covers same/cross-origin
with no second request. Existing path/version and relationship-204 tests stay green.
Generic DLO transport coverage is not a DLO acquisition/support claim.

Verification: scoped ESLint autofix, explicit build and focused regressions passed
52/52 (1.314s test runtime; 9.528s focused pipeline / 10.055s shell). Full zero-warning
lint, npm test --no-workspaces 357/357 (117.676s Node runtime), CLI smoke 30/30
(113.473s), and git diff --check all passed: 243.528s measured full pipeline /
245.468s shell, exit 0. TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR passed
F:/Temp preflight at every shell entry. No live org/API calls, recursive cleanup,
fixture deletion, stage/commit/push/release or root edits occurred. Only this
handover receipt was added after green verification; production code stayed fixed.

Parent owns Gate4 review and Gate5 propagation before any coordinated commit.
Next sequence: commit this guard only after those gates; separately approved DELETE
transport; then DLO acquisition. DLO constant-incomplete detail blocking and explicit
default-space evidence constraints are unchanged. Existing live fixtures preserved.

# Gate4 iteration1 Git status remediation — iteration2 review pending

Parent reviewer e38670f7 returned one must-fix: tokens(worktree).includes('D')
matched a pathname D, not only deletion status records. Fixed only that finding:
collect now returns whether a parsed status is exactly D, recording it before
relevance filtering; worktree ambiguity policy consumes that boolean. Both rename
paths remain parsed correctly. No change to the approved conservative policy.
Two regressions prove modified unrelated tracked file D plus untracked canonical
DMO selects successfully, while genuine unrelated tracked deletion still blocks.
Only src/artifacts/git-deploy-selection.ts, test/git-deploy-selection.test.mjs
and this handover changed in remediation. No CLI/docs expansion or other edits.

Optional reviewer note about README wording listing two versus three selection
modes was reported but NOT accepted or implemented. Parent must return to the
same reviewer for iteration2; no final review-green or commit is claimed here.
Remediation verification exit 0: scoped ESLint autofix, explicit build, full lint
zero warnings, focused selector tests 23/23 (31.836s), full npm test
--no-workspaces 350/350 (119.247s Node duration), smoke 30/30 (106.296s), and
scoped git diff --check. Full test/smoke portion 234.635s; entire shell including
focused checks/build/lint 282.618s. TEMP, actual Node os.tmpdir and nonempty
TMP/TMPDIR checked against F:/Temp before the shell. Only this handover receipt
changed after green code; no org calls, cleanup, commit/push/tag/release or root
edits. Feature remains parked pending parent's same-reviewer iteration2.

# API65 Git-selection boundary — parked for parent review

User priority changed to component retrieve/deploy/delete on 2026-10-26 23:41.
Stop Git-convenience expansion at this coherent boundary; parent is independently
planning the DMO delete contract read-only. No shared-source concurrency is needed.
Current commit approval exists but parent Gate4 must clear before any commit.
No package history operation was performed by this worker.

The previously reported ambiguity policy is now explicitly user-approved: relevant
untracked DMO additions plus ANY tracked worktree deletion block. Staging intended
changes permits Git-inferred rename detection, never historical intent guarantees.

Command integration is implemented in src/commands/data360/deploy.ts:

- --changed-since string flag, parser/runtime exclusive with metadata/source-dir.
- protected selectGitInputs seam delegates to selectGitDeployInputs({cwd, ref}).
- Nonempty selected absolute paths pass through existing resolveInputs sourceDir
  admission and unchanged API65 preflight/execution. Existing selectors unchanged.
- Empty valid selection returns success/no items before downstream org identity,
  connection, discovery, preflight or execution; parse-time core auth remains.
- Optional provenance.git uses the helper provenance verbatim; result.selection
  gains changedSince only in Git mode. No file-byte binding claim.
- Both GitSelectionError codes return actionable blocked/nonzero envelopes;
  lifecycle diagnostics explain conservative ambiguity and staging guidance.

New test/git-deploy-command.test.mjs covers eight injected command cases. Existing
cli.test.mjs now checks --changed-since help across canonical/aliases and parser
exclusivity metadata. Focused command regressions passed 27/27 (1.345s Node,
8.976s shell including autofix/build). README.md, docs/git-workflow.md and
capabilities.md document current scope, approved ambiguity policy, auth/provenance
limits and unfinished reports/CI/exact-byte binding/SQL companions. Roadmap chunk6
is partial. No new dependencies, API policy, live org work or root edits.
Final verification passed: scoped ESLint autofix, explicit build, full zero-warning
lint, full npm test --no-workspaces 348/348 (109.024s Node duration), smoke 30/30
(102.416s), git diff --check. Pipeline exit 0, 223.865s measured workload /
225.435s shell. Initial scoped lint found one variable abbreviation and one
contract-null assertion; fixed both then focused and full verification passed.
Only this handover receipt changed after green code. TEMP/actual Node os.tmpdir
and nonempty TMP/TMPDIR were verified against F:/Temp at every shell entry.

Park/resume: do not add more Git functionality. Parent reviews the entire helper
and command feature once (Gate4), then documentation propagation (Gate5), then may
commit approved literal paths with normal enabled hooks and personal identity.
No reset, stash, removal or selective rollback was used: CLI integration is already
coherent, so separating it from the helper would add risk without advancing the
new priority. Resume actual portability on parent's DMO delete contract plan.

# API65 roadmap chunk 6a — historical selector-only handover

Parent Gate2 review b7128a56 completed; both must-fixes incorporated before edits.
Gate3 deliberately split selector/admission tests from command integration to keep
this chunk bounded. Clean starting HEAD ef1e460, main ahead two; package fetch
succeeded and status was clean. Root bookkeeping remains deferred and untouched.

New src/artifacts/git-deploy-selection.ts exports:

- selectGitDeployInputs({ cwd: string, ref: string }): Promise<GitDeploySelection>.
- GitDeploySelection: { paths: string[], provenance: { repositoryRoot,
  requestedRef, referenceCommit, headCommit, mergeBase } }, all provenance strings.
- GitSelectionError.code: INVALID_GIT_SELECTION or BLOCKED_GIT_LIFECYCLE.

The helper resolves repository root from nested cwd, resolves requested ref and
HEAD once into commits, requires exactly one merge base, then uses SHAs for the
committed/index comparisons. Argument-array bounded Git subprocesses return strict
UTF-8/NUL name-status data. Explicit --find-renames overrides diff.renames=false
for committed/index/worktree reads; both rename endpoints are inspected before
filtering. Relevant rename/deletion blocks the whole selection. Current paths
coalesce across committed, staged, unstaged and relevant untracked changes.
Only canonical data360/default/dmo/ApiName.json paths reach the existing
readDeployInputs metadata mode: same filename, identity, default-space, no-link,
regular-file and authored JSON validation; no second JSON parser or admission seam.
Empty selection returns paths=[] without invoking the nonempty input resolver.

Execution-discovered checkpoint for parent: ordinary Git worktree diff cannot
infer a tracked deletion moved to an untracked destination. The helper therefore
conservatively blocks a relevant untracked addition combined with ANY worktree
deletion (including an unrelated deletion). This prevents inbound cross-boundary
moves silently becoming creates, but is broader than ignoring unrelated changes.
Parent must explicitly resolve/approve this conservative behavior before CLI
integration; no claim of complete historical rename-intent detection is made.
Git-inferred rename detection remains heuristic, not proof of historical intent.

New test/git-deploy-selection.test.mjs uses newly allocated OS-temp synthetic Git
repositories with run ownership markers and personal local Git identity. Tests
cover nested cwd, merge-base divergence, committed/index/worktree/untracked union,
empty selection, Unicode/space paths, all nine phase/direction rename combinations
with diff.renames=false, three deletion phases, wrong filename/space/invalid JSON,
and no-link admission/invalid refs. Synthetic fixture commits only; no package
history operations, org/auth/network requests, API changes, cleanup or release.
Verification: scoped ESLint autofix passed, explicit build and full lint passed
with zero warnings; focused regressions 21/21 (30.288s Node duration; 39.229s
shell including formatting/build). Full npm test --no-workspaces passed 339/339
(121.152s Node duration, intrinsic build included in pipeline); smoke passed 29/29
(115.025s). Full build/lint/test/smoke/diff-check pipeline exit 0, 252.022s measured
workload / 253.926s shell. TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR
checked before each shell. An initial npm/npx option-order error did not apply
fixes; corrected to the local ESLint executable, resolved lint findings and reran
all required checks green. Only this handover receipt changed after green code.

Next chunk: after parent's behavior decision, wire --changed-since exclusively
against metadata/source-dir in deploy.ts; propagate optional Git provenance;
translate selector errors into blocked envelope; empty valid selection succeeds
with no downstream org/service work (existing parse-time auth is not redesigned).
Add deploy-command/CLI regressions, then README/git-workflow/capability updates.
Parent owns once-whole-feature Gate4 and Gate5 after final integration; no review
or whole-feature completion is claimed by this internal-only chunk.

Propagation checkpoint: sf-plugin-data implementation/tests/handover only; no
workspace consumers or language/SDK/CMS/MCNext dependency changes. Public docs
remain unchanged because no new CLI behavior is exposed. No npm changelog.
Package sf-plugin-data remains 0.1.0; new version unassigned, release paused.

# Gate4 iteration1 core-bootstrap remediation — iteration2 review pending

Fixed the reviewer's single must-fix only: prevent implicit core version discovery
before guarded command discovery, including deploy parse-time/default-help auth.
Actual Connection.create initialization is covered offline with absent API config
and absent/stale version-cache evidence. The subprocess spies at the request/save/DNS
boundaries rather than mocking resolveOrg or command parse-time auth construction;
16 cases assert numeric zero discovery, latest exactly one guarded discovery,
payload-free failed discovery, and zero cache save or DNS calls. Existing guarded
request and capability boundaries remain unchanged. Actual core connection
initialization runs; AuthInfo persistence/credentials are synthetic and isolated.

Remediation files: src/commands/data360/{retrieve,deploy}.ts, test/cli.test.mjs,
README.md, docs/capabilities.md and this handover. Existing 19-path dirty state
preserved. No shared abstraction, global config/env default changes, live network,
cleanup, history/version/tag/release changes or root edits.

Verification: scoped lint:fix 0 (7.468s), explicit build 0 (2.769s), lint 0 warnings
(6.784s), npm test 318/318 (105.959s including build), smoke 29/29 (103.400s).
Pipeline 226.383s; shell end-to-end 226.754s. Focused actual-core initialization
regression 1/1 (1.652s test runtime). Only explanatory comments and handover receipt
were corrected after that full green run; final lint (0 warnings), build,
focused regression (1/1) and git diff --check all passed, combined shell 11.969s.
Parent must return to the same reviewer for iteration2; this is not final review green.

# Command version-selection chunk 3b — whole-feature review pending

Retrieve and deploy now accept exact opt-in `--api-version latest`; numeric input
uses the existing core flag parser (including retired-version refusal), and default
`65.0` remains unchanged. Retrieve preserves pre-auth selector/default-space
validation. Deploy retains optionalOrg parse-time auth and local-input-before-runtime
target inspection. Latest direct execution returns `LATEST_READ_ONLY` before
preflight/discovery/mutation; exported service and POST/PATCH guards remain.

For latest reads/previews each command calls authenticated `GET /services/data`
once through an operation-local receiver with refresh replay disabled, maxRetries
zero and redirect refusal. No cached versions, fallback, remote payload diagnostics
or live calls. The resolver's immutable selection passes unchanged to every
command/service handoff. Capability validation requires numeric SOAP evidence
`65.0` before selecting/reading DMOs; discovered `68.0` blocks with actionable
explicit-65 guidance, not an API68 support claim. Metadata `apiVersion` remains
the requested selector; additive optional `soapApiVersion` is numeric SOAP evidence,
not the version actually served by REST latest.

Corrected ownership inspection (Gate4 iteration1): @salesforce/core 8.31.3
Org.create can initialize an unversioned connection, and its determineOrg probe can
create a second unversioned connection even when supplied one. Both commands now
resolve target/default configuration and aliases with core, load AuthInfo, and
construct Connection.create with explicit bootstrap version 65.0 before initialization.
They expose only the existing connection/identity methods needed by commands;
no Org.create trait probe or shared connection is involved. Deploy's optional flag
retains parse-time auth, configured-default resolution, explicit-invalid-auth errors
and absent-default tolerance; default help also uses the numeric bootstrap.
The single guarded latest discovery remains separate and later pins numeric SOAP
before any service receives the connection. No global config/environment change.

Changed in this chunk only: src/commands/data360/{retrieve,deploy}.ts,
test/{retrieve-command,deploy-command,cli}.test.mjs, README.md,
docs/capabilities.md and this handover. Prior chunks' dirty inputs are preserved.
Tests cover once-only discovery, payload-free failures, malformed/newer refusal,
zero downstream DMO/file/mutation calls on refusal, literal REST inventory with
numeric SOAP pinning, immutable same-selection handoffs, numeric compatibility,
flag parsing and topic aliases. Parent must run Gate 4 over all chunks then Gate 5;
no commit/push/version/tag/release, root edits or live org qualification authorized.

Verification for exact chunk-3b code: scoped lint:fix exit 0 (7.619s), build exit 0
(2.535s), zero-warning lint exit 0 (7.228s), full npm test 317/317 exit 0
(110.196s including compile; Node test duration 106.976s), smoke 28/28 exit 0
(104.747s). Full verification pipeline exit 0, wall time 232.746s. Focused command
suite also passed 33/33 (1.722s test duration). Five new tests versus chunk3a's
312/27 baseline. TEMP, nonempty TMP/TMPDIR and actual Node os.tmpdir checked via
existing scripts/check-temporary.mjs before every shell workload; no cleanup ran.
Only this evidence/handover text changed after the green pipeline.

# Service version-selection chunk 3a — historical handover

Existing service version arguments now accept resolved selections alongside
numeric compatibility inputs. Exported `dmoApiSelection(value: unknown)` snapshots
and validates current API65 evidence: either numeric `65.0`/`v65.0`/`65.0` or
`latest`/`latest`/`65.0`. Newer SOAP evidence and inconsistent selections fail scope
checks before DMO requests. Retrieval/inventory/preflight use the retained REST
selector, while Metadata qualification checks the connection's numeric SOAP version.
The helper does not claim REST actually served the discovered numeric version.

Exported create, deploy and selection executors refuse latest before execution,
including SOAP65 selections. Numeric provenance is retained across preflight,
readback and create delegation; PATCH no longer constructs a hardcoded API65 client.
Current numeric API65 mutation behavior remains supported. No command flags,
auth/discovery behavior, service capability widening or defaults changed.

Chunk 3b must resolve once in command-owned discovery, pin only numeric SOAP
connections, preserve one selection through all service calls/envelope reporting,
and refuse latest direct deployment before mutation. Inspect core's shared
connection behavior; never call `Org.getConnection('latest')` or silently repin a
connection already in use. Parent owns the final whole-feature review.

Chunk 3a verification: scoped autofix, build, zero-warning lint, full tests
312/312 and smoke 27/27 passed; pipeline exit 0 in 243.817 seconds. Five new
service regressions cover latest retrieval/preview, unsupported numeric evidence,
connection mismatch, exported mutation refusals and numeric selection creation.
No commit, push, release, root edits or live calls occurred.

# Literal REST latest transport chunk — no public integration yet

`ConnectClient(connection, selection)` now accepts `ApiVersionSelection` and
copies/freezes its validated fields. Numeric string constructor compatibility is
retained temporarily for existing service/test callers and immediately normalized
to the same selection representation; bare `latest` strings are rejected.
Numeric selections require matching requested/SOAP values and `v${numeric}` REST
selector. Latest requires exact requested/REST `latest` and numeric SOAP evidence.
The prefix is `/services/data/${selection.restSelector}/ssot/`, so literal latest
never becomes `/vlatest/` or numeric REST. Endpoint minimums use SOAP numeric
evidence, not an assertion of the version actually served by the REST alias.

POST/PATCH require requested numeric `65.0`; literal latest rejects before any
request even with SOAP numeric `65.0`. Existing redirect/no-retry, same-origin,
namespace, traversal, pagination and payload-free error safeguards remain intact.
Lists and relationships reconstruct every page from the chosen fixed prefix.
Commands, API65 service gates/defaults and production discovery are unchanged.
Chunk 3 must thread one selection through callers and refuse latest at exported
mutation entries so the existing hardcoded numeric PATCH construction cannot
bypass requested-selector provenance. The static `create(alias, numeric)` helper
remains numeric-only; command-owned discovery must never pass latest to core.

Chunk 2 verification: scoped autofix, build, zero-warning lint, full tests
307/307 and CLI smoke 27/27 passed; pipeline exit 0 in 234.025 seconds.
No commands/services, live org state, root files, history or releases changed.

# API version resolver chunk — no public integration yet

`src/transport/api-version.ts` exports `ApiVersionSelection = Readonly<{
requested: string; restSelector: string; soapNumeric: string }>` and
`resolveApiVersion(requested: string, discover: () => Promise<unknown>): Promise<ApiVersionSelection>`.
Numeric selectors preserve the requested value, produce `v${numeric}` for REST,
and perform no discovery. Exact `latest` invokes the supplied discovery once,
validates a nonempty advertised-version array, selects the numeric maximum for
SOAP, and keeps REST selector `latest`. Results are frozen. Invalid input and
failed/malformed discovery have fixed payload-free errors; no cache, fallback,
retry or logging is introduced. Fresh discovery is the future caller's duty.
Numeric SOAP evidence is not attestation of the version served by REST latest.

This helper is not wired into commands or transport. Current API65 defaults,
capability gates, commands and mutation behavior are unchanged. Next chunks must
pass one selection through transport/retrieval/preflight, pin only numeric SOAP
connections, and refuse latest at command and exported mutation entry points.
Preserve literal `/services/data/latest/ssot/` REST routes; never call
`Org.getConnection('latest')`. Parent owns final review after integration.

Chunk verification on 2026-10-26: scoped ESLint autofix, explicit build,
zero-warning full lint, full tests 300/300 and CLI smoke 27/27 passed. The final
pipeline exited 0 in 241.155 seconds. Nine new resolver tests exercise numeric
pinning, numeric maximum selection, exact latest, malformed input/discovery,
redacted failure and no cross-invocation caching. Initial lint findings in the
new tests were fixed before the successful run. No production discovery, command
integration, root edits, live calls, commit, push or release occurred.

# Current repository and directory identity — release paused

The repository is now [JoernBerkefeld/sf-plugin-data](https://github.com/JoernBerkefeld/sf-plugin-data),
with local path `F:/Git/ide-root/sf-plugin-data` and matching `origin` remote.
Repository ID `R_kgDOVXr9kA`, HEAD `8bcbe6374ace9f6a55580b3efb48c02f16726abb`
and the existing `v0.1.0` tag were preserved by the rename. Package identity stays
`sf-plugin-data@0.1.0`; canonical commands and aliases are unchanged. The user
reported manual publication processing; registry/install verification and release
finalization remain paused while trusted-publisher configuration is updated.
This rename task does not authorize commits, pushes, publication or tag changes.
The earlier receipts below describe their original state and remain historical.

## Historical local identity and alias update — no release authorization

User selection on 2026-10-26: unscoped npm **`sf-plugin-data`** at `0.1.0`.
Repository/path remain `sf-plugin-data360`. Canonical `data360:retrieve` and
`data360:deploy` have full-ID `datacloud`, `d360` and `dc` aliases, eight IDs
resolving to exactly two classes. All four topics have explicit help descriptions.
No `data` IDs, wrappers, API expansion, artifact/schema changes or capability
expansion. Envelope producer/plugin names follow the new package; contract and
provenance command strings stay canonical. API 65.0/default remains unchanged.

The former unscoped `sf-plugin-data360` manual publish was rejected with `E403`
spam detection, following the scoped `E404Scope` failure recorded below. This
product-naming choice is not a restriction bypass or a publishability guarantee.
At 14:42 local time on 2026-10-26 the user explicitly authorized committing and
pushing these 13 reviewed package files to `main` with normal enabled hooks.
This supersedes the local-only commit/push restriction for this change only.
No new-name registry queries, publication, login, GitHub release or tag edits are
authorized. Root registrations/plans remain outside this package commit/push.
Resolve npm restrictions separately. The existing
`v0.1.0` at `a328066` still carries the old identity; previous tag-replacement
approval is historical and cannot be reused. All previous artifacts are invalid
for this new identity. Fresh local verification receipts follow this section;
historical live acceptance does not qualify the renamed package.

## Local verification and propagation

Build, scoped ESLint autofix and full lint passed with zero warnings. Full tests
passed 290/290 (18 above the 272-test baseline); final-tree smoke and retained
installed-package artifact receipts are reported by the coordinator. Checks cover
four bare topics, all eight full command help paths, alias listings/flag parity,
eight IDs backed by two identical class references, injected pre-auth validation,
canonical JSON contracts/provenance, new package metadata and offline workflow
E403 rejection. Tests strip inherited SF_/SFDX_ settings, isolate HOME/state in
verified F:/Temp run roots and perform no org work or recursive cleanup.

| Component                                                                               | Needs update? | What to update                                             | Status     |
| --------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------- | ---------- |
| sf-plugin-data360                                                                       | Yes           | Package identity, aliases, help, regressions, current docs | done       |
| ampscript-data / ssjs-data / csv-parser / ampscript-parser / sfmc-language-lsp          | N/A           | No dependency or language behavior change                  | not needed |
| vscode-sfmc-language / mcp-server-sfmc / mcp-server-mcdev                               | N/A           | No consumer relationship                                   | not needed |
| sf-plugin-mcnext / sf-plugin-cms                                                        | N/A           | Independent plugins                                        | not needed |
| eslint-plugin-sfmc / eslint-plugin-mcdev / prettier-plugin-sfmc                         | N/A           | No consumer relationship                                   | not needed |
| ssjs.guide / mso-conditional-parser / eslint-plugin-mso-email / vscode-mso-conditionals | N/A           | No consumer relationship                                   | not needed |

Root release/dependency registration and the existing plan record the new current
identity; unrelated root changes, CSV work and author-identity rules are preserved.
README and Git workflow are current. Artifact/capability docs, mcdev wiki, public
sites/tool listings and hover/doc-URL catalogs need no edits: this local-only
naming/alias change does not expand capability or change artifact schemas.

| Folder              | Changed? | Current version | New version                                     |
| ------------------- | -------- | --------------- | ----------------------------------------------- |
| ./sf-plugin-data360 | Yes      | 0.1.0           | Unassigned; fresh release/tag approval required |

# Historical unscoped npm identity correction — approved tag replacement

On 2026-10-26 the user superseded the scoped-name correction and selected
`sf-plugin-data360` if absent from npm. One authorized read-only exact-name lookup
at 10:07 UTC returned structured `E404` from
`https://registry.npmjs.org/sf-plugin-data360`. No accessible package was found;
reserved-name/security restrictions and final publishability remain unverified.
The earlier manual scoped publication failed with `E404Scope`; no successful
publication is known. GitHub owner `JoernBerkefeld` is unchanged.

Current local package/lock metadata, workflow guard, package-smoke installation
path, command-envelope expectations, README and root registrations now use the
unscoped identity. Version stays `0.1.0`; API-version work remains deferred.
Historical scoped identities and hashes below describe old artifacts only, not
the corrected release candidate. Every prior scoped tarball is invalid for the
new npm identity; fresh packaging/integrity and release-tree binding are required.

At 11:53 local time on 2026-10-26 the user explicitly approved committing and
pushing the correction and replacing local/remote `v0.1.0` with the corrected
commit, retaining version `0.1.0`. The observed old annotated tag object is
`2865ef032290872f7e049c67c9f395df0edc39e9`, peeled to
`b2d18d45b44a302888c3abfbdb1236831f13051c` (old scoped identity). Replace only
that tag using its observed object ID as the remote force-with-lease condition;
push `main` without force. Require staged-tree/commit equality, successful normal
hooks, remote branch/tag equality and a clean package tree before handoff.
The external execution receipt records actual commit/tag results and fresh
artifact integrity; this paragraph records approval and requirements, not a
prediction of success. Root changes remain outside the package commit/push.
No GitHub release, login, global auth change, registry lookup or publication is
authorized by this step. First npm publication remains user-executed.
Verification runs offline with isolated HOME/state and stripped inherited
SF_/SFDX_ overrides; retained artifact evidence is reported separately.

# Approved commit-and-push execution checkpoint

On 2026-10-26 the user confirmed creation of
https://github.com/JoernBerkefeld/sf-plugin-data360 and authorized committing and
pushing this reviewed baseline. The empty hosted repository was verified through
GitHub CLI with owner administration access, then attached as `origin` using
`https://github.com/JoernBerkefeld/sf-plugin-data360.git`; fetch succeeded. This
supersedes historical no-remote statements below, not their qualification limits.
The package remains `0.1.0`; API-version discovery/latest-version work is deferred
to the next release. No tag, GitHub release, npm publication, registry lookup or
new live-org operation is part of this execution. Root changes remain untouched.

All 60 acceptance input hashes and the retained acceptance tarball SHA-256 matched
before commit splitting. Implementation, regression tests, package smoke and
primary docs were committed together as `6dc2406` after fresh isolated autofix,
build, zero-warning lint, full tests, smoke and package checks, then normal enabled
pre-commit verification. Workflow, its offline tests and release documentation
form the next coherent commit. Final commit IDs, fresh verification outcomes,
artifact integrity and push status are reported by the coordinator after the
commands complete rather than predicted in this document. Documentation changes
mean a freshly packed tarball differs from the historical acceptance archive;
compare runtime bytes before carrying its bounded acceptance forward.

# Local release-workflow preparation checkpoint

This slice preserves the prior reviewed bounded DMO code and its 263-test / nine-smoke
baseline at HEAD 5b0ed1b432417c364f3eae87532fe41c0125cd49. Root fetch/status showed
main ahead two, not behind; package fetch/status showed main with no configured
remote or local tags. Upstream package publication state is deliberately unqueried.
No remote, version baseline, published release or consumer chain is inferred.

Written simplicity-first plan and dedicated read-only senior plan review
8fd7ceab-1b1a-4bf4-83b8-99c6b29f36c7 returned zero must-fix before edits. One small
coupled workflow/test/docs slice, not a generic release framework. The workflow
pins npm 11.5.1, checks the exact scoped name/version using structured JSON, skips
only a matching returned version and treats only structured E404 as absent.
A second package-name lookup distinguishes first-ever package absence (user-only
manual bootstrap) from a later unpublished version (approved hosted publication).
Auth/network/malformed or mismatched responses fail closed. It never retries a
publication automatically. Tests execute the actual inline block in a VM with
synthetic npm responses; no registry or publication subprocess is reachable.

Git workflow documentation now describes bounded retrieval/preview/create/label
updates rather than unsupported-only entry points, and separates manual bootstrap,
verified trusted-publisher binding and post-acceptance availability/install checks.
Root release-tracking and cross-component sync rules register exactly
`@joernberkefeld/sf-plugin-data360` as independent Tier 4 with external Salesforce
CLI dependencies only, no workspace consumers, configured remote or release tags.
Prior CSV/parser/root rule edits were retained. No production DMO file was edited.

## Completed bounded packaged-CLI acceptance receipt

Installed packaged-CLI cross-org acceptance passed on 2026-10-26, as recorded in
`F:/Temp/data360-live-G6R8BE/accept-complete.json`. This final receipt supersedes
`accept-timeboxed-handover.json`, which stopped before PATCH. The accepted local
`@joernberkefeld/sf-plugin-data360` `0.1.0` tarball has SHA-256
`a923a30ab11f992fa569e863e52f89152f9541961cdfb9496f1ff01a35819f4a`;
all 60 recorded input hashes remained unchanged. This binds acceptance to that
packaged baseline, not a newly packed artifact after this documentation edit.

Source `00Daj000010xkZNEAY` retrieval completed. Complete target inventory (1,102
objects) proved absence before CREATE in target `00Dfj00000bRQabEAG`. CREATE was
confirmed, followed by independent authored readback equality and an unchanged
replay. Label-update preview and UPDATE were confirmed, followed by independent
complete authored equality/full raw runtime preservation and a final unchanged
replay. Fixture `Preservedfc5841d3a141b__dlm` remains undeleted in the target as
`0gjfj00000HQpt7AAD`. Reported mutations: source 0, target CREATE 1, target PATCH 1,
DELETE 0; both unchanged replays reported `not-attempted`. Underlying transport
and historical OAuth counts were not independently instrumented.

Qualified scope is API 65.0, `default` data space, `Other` category, object label
and existing nonprimary `FirstValue__c` label only. Field additions, description
changes, primary-label changes and other APIs/data spaces/categories remain
unproven and blocked. The optional unsupported-change preview was not exercised.
All launched acceptance processes completed; no retry, rollback or cleanup ran.
This is bounded local installed-tarball acceptance, not general DMO qualification
or registry publication verification.

Release remains blocked pending approved hosted repository setup, publisher
ownership and verified trusted binding, normal release qualification, user-only
first npm publication and post-publication registry artifact/integrity verification.
No remote or local tags are configured, and `package.json` has no `repository`
field or expected hosted URL; the user must choose the destination and authorize
creation/setup. The prepared workflow distinguishes user-manual first publication
from later trusted-publisher releases and skips only a returned exact version;
that skip is not registry/install/integrity verification. No login/bootstrap
executable commands are handed off before release qualification; broader DMO
support is not complete. The candidate remains `0.1.0`; next version is unassigned.

The factual receipt update changes only this existing handover. Source, runtime,
tests and workflows are unchanged by this documentation slice; the historical
verification below belongs to the prior package baseline.
No registry query, npm publish, GitHub command, remote creation, org call, commit,
push, tag, release or global setting change was performed by this slice. Scratch
roots are retained without recursive cleanup.

Final release-slice verification on 2026-10-26 completed exit 0 in 164.740s:
scoped ESLint autofix, explicit build, full zero-warning lint, full tests 272/272
(57.084s; nine new workflow guard tests), smoke 9/9 (53.905s), registry-only lock
check and package smoke (32 entries, three help and six installed injected-envelope
checks). HOME/USERPROFILE/XDG isolation: `F:/Temp/data360-release-hO8TK8`;
retained package installation: `F:/Temp/data360-package-dq3Xpo`. All shell/test
entries verified TEMP, actual Node os.tmpdir and nonempty TMP/TMPDIR against
absolute normalized F:/Temp; inherited SF_/SFDX_ overrides were stripped.
An initial autofix-generated incomplete JSDoc produced lint warnings and stopped
verification before tests; fixed documentation, then reran the full sequence green.
LF/no-BOM checks and package/root scoped git diff --check passed. Root changes are
only rule files, so no root tests/build were required. Package identity/version
remain `@joernberkefeld/sf-plugin-data360` / `0.1.0`, with no version assignment or
release inferred from the absent tags/remote.

Dedicated read-only release-slice code review
67c0e30b-24ed-4a3b-8f08-5d814b6ff4aa returned zero must-fix. Optional subprocess
error/signal/nonzero-publish-exit regression expansion was reported, not applied.
The coordinator's existing whole-feature review remains undisturbed.

## Release-slice propagation

| Component                 | Needs update? | What to update                                        | Status     |
| ------------------------- | ------------- | ----------------------------------------------------- | ---------- |
| `sf-plugin-data360`       | Yes           | Workflow, offline regressions and release status docs | done       |
| `ampscript-data`          | N/A           | —                                                     | not needed |
| `ssjs-data`               | N/A           | —                                                     | not needed |
| `csv-parser`              | No            | Reference workflow read only                          | not needed |
| `ampscript-parser`        | N/A           | —                                                     | not needed |
| `sfmc-language-lsp`       | N/A           | —                                                     | not needed |
| `vscode-sfmc-language`    | N/A           | —                                                     | not needed |
| `mcp-server-sfmc`         | N/A           | —                                                     | not needed |
| `mcp-server-mcdev`        | N/A           | —                                                     | not needed |
| `sf-plugin-mcnext`        | N/A           | —                                                     | not needed |
| `sf-plugin-cms`           | N/A           | —                                                     | not needed |
| `eslint-plugin-sfmc`      | N/A           | —                                                     | not needed |
| `eslint-plugin-mcdev`     | N/A           | —                                                     | not needed |
| `prettier-plugin-sfmc`    | N/A           | —                                                     | not needed |
| `ssjs.guide`              | N/A           | —                                                     | not needed |
| `mso-conditional-parser`  | N/A           | —                                                     | not needed |
| `eslint-plugin-mso-email` | N/A           | —                                                     | not needed |
| `vscode-mso-conditionals` | N/A           | —                                                     | not needed |

README reviewed: already states unpublished bounded capability and hosted setup
limitations; no change needed for this release-only slice. No npm CHANGELOG.
Wiki, sfmc.guide, joernberkefeld.com, hover/doc-URL data: unrelated, no updates.
Both root registration/dependency-map surfaces updated; no pending propagation.

| Folder                | Changed? | Current version | New version                                             |
| --------------------- | -------- | --------------- | ------------------------------------------------------- |
| `./sf-plugin-data360` | Yes      | `0.1.0`         | Unassigned; no remote/local tags, publication unqueried |

All other tracked package folders were unchanged by this release-preparation slice.
Keep everything local as explicitly requested; push/GitHub release may be offered
only after the remaining acceptance/setup gates and fresh explicit approval.

# Public bounded DMO label-update CLI checkpoint

Started 2026-10-26 from HEAD 5b0ed1b432417c364f3eae87532fe41c0125cd49;
fetch/status succeeded (main, no configured upstream), preserving all eleven dirty
paths from the service checkpoint. Written simplicity-first plan and dedicated
read-only senior plan review 304c2ce8-cb2b-4cb2-9799-4029963291c1 completed before edits,
with zero must-fix. One small coupled CLI/test slice; no new architecture or flags.
The coordinator must still run the once-whole-feature code review after this checkpoint.

Public `deploy --preview` passes `allowLabelUpdates: true` (fifth positional argument)
to `preflightDmoDeploy`. Nonpreview delegates each admitted item to `executeDmoDeploy`
instead of `executeDmoCreate`; whole-selection admission, exact CMS-style selectors,
sequential fresh checks and stop-on-block/failure/unknown remain command-owned.
`ExecutionItem` uses `DmoDeployExecution`, preserving the version 1.0.0 envelope with
`updated` / `confirmed-updated`, honest unchanged/not-attempted/blocked/failed evidence,
and generic unknown-mutation diagnostics covering creation or update. No raw payloads.
Qualified Other/default/API65 object and existing non-primary field labels are public;
primary labels, additions, descriptions and other mixed unsupported deltas block
before writes. No arbitrary fixture-name restriction, new category architecture,
live call/mutation/third PATCH, root edit, commit, push, tag, version or release.
No field-addition preservation proof exists yet; it needs separate authorization.

Regressions cover injected command and installed envelopes for preview update,
confirmed update/noop, whole-selection zero execution on mixed blockers and honest
unknown-stop/redaction; a real command+guarded-service fixture additionally proves
label update/readback and mixed description refusal. Existing create tests remain.
README, capabilities and artifact contract now describe public narrow support and
limitations. Package stays 0.1.0. Final isolated verification completed
2026-10-26T00:52:11.856Z (155.915s): scoped ESLint autofix, explicit build, full
zero-warning lint, tests 263/263 (56.404s), smoke 9/9 (53.105s), registry-only
lock check, package smoke with 32 entries / three help / six installed injected
envelope checks, Markdown formatting and git diff --check all passed exit0.
Retained isolated HOME/USERPROFILE/XDG F:/Temp/data360-cli-ArCjNW and packaged
installation F:/Temp/data360-package-cdfXW4; inherited SF_/SFDX_ overrides stripped
before explicit offline settings. Every shell entry verified TEMP/actual Node
os.tmpdir/nonempty TMP/TMPDIR against F:/Temp. Scratch retained without cleanup.
Initial full run also passed 262/262 before adding the real-service regression;
final 263/263 run supersedes it. No hooks altered or commit attempted.
Propagation: independent CLI only; all language-data/parser/LSP/MCP/MSO/CMS/MCNext,
wiki/site/listing/hover surfaces are unrelated and need no update. No changelog.

# Internal bounded DMO label-update service checkpoint

Started 2026-10-26 from HEAD 5b0ed1b with the existing eight verified dirty files;
fetch/status succeeded (main, not behind). Preserved effective-label reconciliation
and guarded PATCH transport. Written plan, explicit simplicity check and dedicated
read-only senior plan review d1c090d8-7d90-4d2b-a0ea-174fefb72ed9 preceded edits.
One must-fix incorporated: primary-key label changes block because the current
generated qualifier recipe derives its label from the primary label. No generic
category architecture or synthetic-name execution gate was introduced. This is a
coherent service-only checkpoint; CLI integration and once-whole-feature Gate 4
remain coordinator-owned, not represented as complete here.

## Exact interfaces and bounded execution

`preflightDmoDeploy(document: unknown, connection: ReadConnection, apiVersion:
unknown, dataSpace: unknown, allowLabelUpdates = false): Promise<DmoDeployPreview>`
retains create-only defaults and adds opt-in `update` classification. Exported
`buildExecutableDmoDelta(desired: unknown, current: DmoDocument)` wraps the broader
offline candidate with the narrow execution gate. New service exports:
`executeDmoDeploy(document: unknown, connection: TargetConnection, apiVersion:
unknown, dataSpace: unknown): Promise<DmoDeployExecution>` and
`executeDmoDeploySelection(documents: unknown[], connection: TargetConnection,
apiVersion: unknown, dataSpace: unknown): Promise<DmoDeployExecution[]>`.
Connection requires instanceUrl/request/metadata/getApiVersion. Result outcome is
unchanged/blocked/created/failed/updated/not-attempted; mutation is
not-attempted/confirmed-created/confirmed-updated/unknown, with optional preflight
and static payload-free diagnostics. No candidate/PATCH/runtime payload escapes.

All inputs validate/detach synchronously, duplicate identities reject. Whole
selection admission precedes any write; sequential execution reacquires target
qualification and derives delta from fresh target immediately before its one
mutation. Create reuses the existing guarded-create executor and fresh absence
proof. Unsupported/fresh drift blocks before dispatch. Unknown mutation stops
with remaining selection items not attempted. PATCH return body is ignored;
independent retrieveDmo obtains detail, Metadata and full relationship inventory.
Confirmation requires expected authored overlay plus full raw runtime equality,
normalizing only Connect/Metadata field order by exact identity. Allowed raw
changes are changed object label at Connect label, Metadata label and object
labelOverride/masterLabel, and changed existing non-primary field Connect label
plus Metadata labelOverride. All other values/presence/generated qualifiers remain.
Attempt evidence is marked before dispatch; no retry/rollback.

Only qualified supported custom Other/default/API 65 with nondynamic Text primary
key executes. Object and existing non-primary field labels are enabled internally.
New fields, object/field descriptions, primary labels and all other unproven changes
(including mixed label edits) remain atomically blocked. Omitted target-only fields
and descriptions preserve; field reordering is noop. This policy is grounded in
retained Other preservation evidence F:/Temp/data360-preserve-mO2XMa and effective
label offline replay F:/Temp/data360-label-MdL05T/replay-receipt.json. It does not
prove other categories or new-field semantics. No live call, mutation, third PATCH,
commit/push/version/release/publication was performed by this slice.

## Verification and remaining work

Focused document/service suite 131/131 passed after scoped autofix/build. Full
isolated verification completed 2026-10-26T00:41:49.853Z, pipeline 162.544s:
explicit build exit0, full zero-warning lint exit0, full tests 260/260 (57.840s),
smoke 9/9 (54.781s), registry-only lock check exit0, package smoke exit0 with
32 artifact entries, three installed help checks and two installed injected envelope
checks. Normal hook command sequence was executed standalone, hooks unchanged;
no commit/hook invocation. Retained isolated HOME/USERPROFILE/XDG root
F:/Temp/data360-executor-hVeEx6, inherited SF_/SFDX_ overrides stripped. Every
shell entry checked TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR against F:/Temp;
scratch retained without cleanup. Changed Markdown format and git diff --check pass. Added regressions cover
mixed unsupported changes/no writes, omissions/noop, fresh target drift, stale PATCH
body versus independently confirmed update, raw runtime/generated/read failures,
selection validation/admission and stop-on-ambiguity. Existing create tests retained.

Remaining: a separately planned CLI slice can opt into service selection execution,
update command/envelope/human diagnostics and preview contract deliberately, then
run its verification. Current CLI remains create-only and cannot misreport an update
as created. Run coordinator-owned whole-feature review only once all planned slices
land. No new live experiment is authorized.

Propagation: README/artifact-format/capabilities and this handover updated. No
changelog/version change; package stays 0.1.0. No language data, parser, LSP, MCP,
MSO, CMS/MCNext, wiki/site/listing/hover dependency or changed surface; no downstream
propagation needed. Scope remains local and unreleased.

# DMO API 65 effective field-label reconciliation

Started 2026-10-26 from clean 5b0ed1b; fetch/status succeeded. Written plan,
explicit simplicity check and dedicated read-only senior plan review preceded
edits (zero must-fix). One small coupled field-join/test slice; no transport,
public update enablement, live calls, writes, new org fixture, third PATCH,
commits, pushes, versions or releases.

Local documentation search found no effective-label contract. With prior approval
for official online documentation, fetched the official
[CustomField reference](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm),
MktDataModelFieldAttributes section: API 65 `labelOverride` replaces the default
field display label when specified, otherwise the default applies; maximum 255
characters. `masterLabel` is separately documented. The schema MCP returned no
nested-type content and supplied no additional evidence. Search summaries omitted
these newer attributes; the fetched English reference explicitly contains them.

The common join now validates a present override as nonblank text <=255 characters
and compares Connect label to that override, falling back only on absence.
Metadata base label validation and optional masterLabel===base qualification are
retained independently. The latter remains this projector's narrow acceptance
constraint, not a universal Salesforce identity claim. Raw observations remain
unchanged and detached in expectations. Narrow compatibility helpers and generated
recipe gates are unchanged. Tests cover observed split, absence fallback, present
malformed values and Connect/effective/base/master disagreements.

Offline replay of retained diagnosis snapshots for the existing owned synthetic
Preservedfc5841d3a141b__dlm returns projected with zero blockers, exactly matches the
entire patch-2-intent authored expected overlay, retains the entire raw runtime
expectations and leaves inputs unchanged. Receipt retained under
F:/Temp/data360-label-MdL05T/replay-receipt.json; this is offline qualification of
the recorded checkpoint, not a new live observation or proof of new-field behavior.
Third PATCH remains unattempted. Next smallest integration step is separately
reviewed guarded PATCH transport plus independent GET/common qualification; any
new-field preservation experiment still needs explicit separate authorization.

Verification complete: focused 113/113; full 235/235 (57.004s); smoke 9/9
(54.984s); explicit build, lint autofix and full zero-warning lint exit0;
registry-only lock check exit0; packaged 30-entry artifact with three installed
help checks and two installed injected envelope checks exit0. Full verification
pipeline 153.953s. Normal pre-commit command sequence was run standalone with
hooks unchanged; no commit/hook invocation was authorized. Changed Markdown
Prettier check and git diff --check pass. Verification used marked isolated
F:/Temp/data360-label-MdL05T USERPROFILE/HOME/XDG with inherited SF_/SFDX_ variables
stripped; package harness retained F:/Temp/data360-package-aXz4QJ. No cleanup.
Final read-only senior code review ae6f91e1-c22b-47ad-aee2-3fa91f933a1f returned
zero must-fix. Optional exact-255 acceptance regression was reported, not auto-added.
An earlier review invocation aborted without a result; a fresh review completed.
Documentation propagation: README, artifact-format, capabilities and this handover
explain bounded checkpoint qualification without claiming public update support. No changelog/version change. All language packages, wiki/sites/listings,
hover data, CMS/MCNext and other packages have no dependency or changed surface.

# DMO pure offline update-delta slice

Started 2026-10-26 00:44+01:00 from clean
dc5ae81b275c6f28a34a3cedd5eb4409139d72b5; fetch/status completed, main clean.
Existing common/recovery reviews apply; written slice plan and explicit simplicity
check preceded edits. One coupled helper/test slice fits a single worker; no
additional reviewer dispatched. Whole finished DMO Gate 4 stays coordinator-owned.

`src/artifacts/dmo-update-delta.ts` exports
`buildDmoUpdateDelta(desired: unknown, current: unknown, targetDataSpace: unknown): DmoUpdateDelta`.
Both authored documents validate independently; current qualification is a caller
precondition, not proven by fabricated JSON. Exact default/default/default scope
and qualified object identity required. Invalid shapes throw DmoDocumentError;
blocked returns only status/blockers. Unchanged returns detached expected target;
candidate returns minimal patch plus detached expected overlay. No partial
payload escapes on any unsupported overlap. Public preflight/executor unchanged,
existing differences still blocked; no PATCH transport or update-enabled outcome.

Object label and changed explicit nonblank description map; omitted descriptions
preserve. Existing labels map exact name/unchanged dataType provisionally. New
nonprimary/nondynamic fields map only name/label/dataType and explicit nonblank
description/category. Overlay retains target-only fields, order and omitted
values, appending sorted additions. Missing desired fields never imply deletion;
a different name adds while old identity survives, case-only collisions block.
Unsupported type/primary/dynamic/field-description/category/date differences
block atomically. Unknown status/relationships/generated/tombstone keys reject.
No input/output aliasing or mutation; candidate entries are exact-name sorted.

Supplied authoritative PATCH checkpoint establishes API65 qualified __dlm route,
forbids name/type changes, and warns HTTP200 can contain old state. Existing field
label encoding and server omission preservation remain UNPROVEN. The expected
overlay describes local nondestructive policy only, not server evidence. Next
minimal slice: separately authorized synthetic preservation/label experiment,
then narrowly guarded transport plus independent GET/common qualification only
if evidence supports it. Do not wire candidate status into public execution.
No live org calls/writes, Windows harness detour, root edits, release/tag/push or
publication. Package remains 0.1.0; first release waits for completed DMO milestone.

Propagation checked: README, artifact-format, capabilities and this existing
handover updated; package inventory includes the helper JS/declarations. No npm
changelog or version change. Language catalogs/parsers/LSP/extensions/MCP/MSO,
CMS/MCNext, wiki and public sites/listings/hover have no dependency or changed
surface; no downstream update is needed. Full verification/normal enabled-hook,
exact tree and clean commit receipts are returned to coordinator below task output.
All verification uses fresh marked OS-temp homes, stripped inherited SF_/SFDX_
overrides and isolated USERPROFILE/HOME/XDG. TEMP/actual os.tmpdir/nonempty TMP/
TMPDIR check F:/Temp at every shell entry; scratch retained, no recursive cleanup.

Verification checkpoint 2026-10-26 00:52+01:00: scoped ESLint autofix, explicit
build and full zero-warning lint exit0; final focused update tests 25/25. Initial
isolated full suite 217/217 (57.296s), smoke 9/9 (53.202s), packaged artifact
30 entries with helper JS/declarations, three installed help and two injected
installed envelope checks exit0 (157.036s pipeline). Three additional focused
regressions landed during that first run; the normal enabled commit hook reruns
the final full suite and smoke. Verification roots retained:
F:/Temp/data360-delta-W1oNTG and F:/Temp/data360-package-8M3qhO. Final hook counts,
commit hash and staged-tree/HEAD equality are reported in the coordinator handover.

# DMO retrieve selector/discovery slice

Started 2026-10-26 00:08+01:00 from clean
ce85828a6f6d59237a88e640d9a526c01a50e105; fetch/status completed (main, no remote
configured). Existing common/recovery reviews 2873b976 and 1922fc5a had no
must-fix; written bounded slice plan/simplicity check preceded edits. One coupled
service/command slice, no subworker/reviewer; whole-DMO Gate 4 stays coordinator-owned.
No Windows containment investigation or intentional live org operation was authorized.
The earlier verification isolation incident below supersedes the initial no-live claim.

`validateDmoSelection(selectors: string[], apiVersion: string, dataSpace: string): void`
checks syntax and unchanged API65/default before authentication.
`selectDmos(connection, selectors, apiVersion, dataSpace): Promise<string[]>`
reuses complete offset-paginated Connect inventory only for `-m dmo` or omitted
selectors. Exact-only repeated `-m dmo:ApiName__dlm` avoids inventory. Mixed selectors
coalesce and sort exact identities. No-selector means all implemented families,
currently DMO only, not seven-family support; no `--all` flag. Nondefault-space
inventory entries are excluded by explicit scope; unsupported identities within
scope are retained for precise `UNSUPPORTED_DMO_IDENTITY` object diagnostics,
not silently skipped. Unprovable inventory fails before any object writes.

CLI `-o` is parsed as a string and then resolved with core `Org.create` only after
selection/scope validation; core still owns aliases/configured target-org/auth.
The existing per-object `retrieveDmo` projector and `writeDmoDocument` remain the
only acquisition/publication path. `-d` project root, `-x` differing-byte permission,
canonical authored-only files, plugin-owned version provenance and standard outer
CLI envelope are unchanged. Envelope selection is expanded exact names; diagnostics
add optional per-object identity, static safe code/message. All selected objects
are attempted sequentially. Successful item receipts survive later failures.
Unsupported-only is blocked/exit1, transport/unexpected/output failures failed/exit1;
empty inventory is success/no files. Human output includes object/code diagnostics.
No deploy bare-type or deployment behavior changes.

Synthetic regressions cover exact/type/none/mixed/duplicates, complete multipage
inventory, explicit scope, empty/malformed/incomplete inventory, validation before
auth, default-org absence, partial receipts and precise unsupported failures,
human diagnostics, existing actual projector/writer integration and installed
plugin provenance. Offline CLI subprocesses now await completion without wrapper
forced timeout. Test/package CLI environments isolate USERPROFILE/HOME and use an
unconfigured synthetic default alias, because installed core derives its auth state
from os.homedir rather than SF_STATE_FOLDER alone. Existing README/capabilities/artifact notes updated.

Next safe bounded slice: establish the documented existing-DMO PATCH contract from
local authoritative evidence, separately qualify request/response/update/no-op
semantics with synthetic fixtures, and leave unproven category/relationship/event
variants explicitly blocked. Do not infer update support from CREATE mapping.
First release waits for complete DMO milestone and coordinator Gate 4; user performs
manual npm login/publish bootstrap and npm GUI configuration before GitHub release;
existing-version hosted workflow skip remains a later separate task. No root-rule
edits, push/tag/release/publication, package remains 0.1.0.

Verification checkpoint 2026-10-26 00:28:21+01:00: explicit build, scoped autofix,
full lint zero warnings, focused selectors 17/17, isolated CLI 8/8, current full
suite 194/194 (54.589s) and smoke 8/8 (54.439s), package smoke 28 entries,
3 installed help checks and 2 injected installed envelope checks all exit0.
Current-tree full pipeline completed in 152.620s. An earlier full-suite invocation started before auth-home isolation was
corrected finished 2026-10-26 00:29:14+01:00 (733.484s, exit1). Its no-org CLI
tests unexpectedly reached the configured org: observed diagnostic
ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE instead of TARGET_ORG_REQUIRED and one
untracked output path data360/default/dmo/SchemaOther59062c54c9d6__dlm.json.
The earlier invocation is NOT a green receipt. It ran from 00:17:00.709 to
00:29:14.193+01:00; the failure output proves unintended real-org acquisition.
Reconcile started 00:30:44.815+01:00; no relevant node/sf/npm/cmd test process was
still running. No workload was killed. Core 8.31.3 Global.SF_DIR/SFDX_DIR are
os.homedir()/.sf and /.sfdx; SF_STATE_FOLDER alone did not isolate authentication.
All offline subprocess environments now also drop inherited SF_/SFDX_ overrides
before setting a synthetic nonexistent target, fresh USERPROFILE/HOME and XDG paths.
A real subprocess regression asserts os.homedir and core SF/SFDX directories plus
the exact allowed override keys. Full verification and normal enabled hooks run
inside a separate marked mkdtemp home; no user/global environment is modified.

Only the literal untracked incident artifact was inspected locally for file/link
status, timestamps and top-level authored-document shape, without dumping payload.
It was a 675-byte regular non-link schemaVersion 1/kind dmo document whose identity
matched the filename/default scope, created 00:22:16.023+01:00 during the failed
run. This corroborates prior-run ownership; it was removed using the specialized
single-file Delete operation, never staged. Existing user files, directory parents
and all F:/Temp evidence were preserved; no recursive deletion occurred.
The implicated path is retrieve-only: Connect inventory/detail/relationship GETs,
core Metadata CustomObject read and local document writer, not the deploy/create
executor. Auth refresh remains core-owned. This is source-path evidence, not a
remote audit or a claim that zero remote state mutations occurred.

Reconcile verification completed 00:36:06.657+01:00 (209.878s pipeline): scoped
ESLint autofix, explicit build and full zero-warning lint exit0; focused selection,
command and CLI tests 26/26 (53.806s); full tests 195/195 (55.381s); smoke 9/9
(52.282s); installed package 28 entries, three help checks, two injected envelope
checks exit0. Verification home F:/Temp/data360-reconcile-vOyW26; package evidence
F:/Temp/data360-package-hp5zGJ. No relevant workloads remained at 00:36:19+01:00.
The final documentation receipt is repacked, then all eleven literal changed
source/test/script/docs paths are staged and bound to a recorded Git tree.
Normal enabled pre-commit independently reruns temporary/lockfile guards, lint,
full build/tests and smoke in a fresh isolated home. Commit hash, hook counts,
exact tree equality and final clean status are returned to the coordinator, not
self-referentially embedded here. No hooks are changed or bypassed.

Propagation: primary sf-plugin-data360 source/tests/README/existing capability,
artifact and handover docs updated. Other language catalogs/parsers/LSP/extensions,
MCP/MSO, independent CMS/MCNext repos, wiki and public guides/tool listings are N/A;
no dependency propagation. Verification/commit receipts are returned to coordinator.
All shell/test entries preflight actual os.tmpdir plus TEMP/nonempty TMP/TMPDIR at
absolute normalized F:/Temp, process-only repair/recheck; scratch retained, no
recursive deletion. No independent live-acceptance or full-DMO completion claim.

# Recovery slice 2: plugin-owned version provenance

Started 2026-10-25 23:31:28+01:00 from clean b58d8e6205418cdf771acd9aa060ce467e98859d.
Bounded recovery plan review 1922fc5a completed with no planning must-fix;
this worker does not dispatch a self-review. Whole-feature Gate 4 remains with
coordinator after recovery chunks.

`src/plugin.ts` reads `../package.json` relative to `import.meta.url`; both source
`src/` and built/installed `lib/` are direct package-root children. Both commands
copy its name/version into metadata and provenance. No host-config fallback,
hardcoded runtime version, upward search or dependency change. Envelope contracts,
statuses, diagnostics and exit behavior are unchanged.

Command regressions inject host pjson version 2.151.7 and assert plugin 0.1.0 in
both envelope fields. Package smoke retains the actual npm tarball and isolated
npm installation, checks the two additional compiled metadata-module entries,
and imports BOTH installed command implementations for injected offline blocked
selection envelopes. Parsing and service calls are replaced; unexpected service
entry fails. This proves installed package metadata attribution, not actual host
CLI dispatch or live org acceptance. Three installed help checks remain separate.
Package smoke child processes have no wrapper timeouts and are awaited to
completion; retained scratch is never recursively removed.

Live dispatch remains blocked: Windows descendant termination is unproven. This
slice does not solve that harness, run live commands, access credentials, or claim
help-only checks establish provenance or remote safety.

Propagation: sf-plugin-data360 source/tests/package smoke and README/handover
updated; catalogs, parsers, language service, extensions, MCPs, MSO, other CLI
plugins, wiki and public guide/tool listings are unrelated (N/A). No root-rule
edits or downstream dependency changes. Working package version stays 0.1.0;
release/version assignment deferred, no push, tag, release or publication.
Verification receipt follows in coordinator handoff (build, scoped autofix, full
zero-warning lint, full tests, smoke, installed package checks, enabled-hook commit).

# Gate 4 remediation slice 2: operation-local SOAP redirect refusal

Started 2026-10-25 19:28+01:00 from clean admission commit ec15e2d.
Installed stack inspection: jsforce MetadataApi._invoke constructs SOAP with its
_conn; SOAP/HttpApi selects conn._transport instead of Connection.request.
Transport defaults followRedirect true, request-helper retains request headers in
its follow-up path. A Connect request-option guard alone therefore cannot protect
Metadata reads.

`readDmoMetadata(connection: ReadConnection, objectApiName: string): Promise<unknown>`
in retrieve-other-dmo.ts shadows a per-operation receiver and Metadata _conn,
wrapping the existing transport with a throwing followRedirect callback and zero
transport retries. No caller/global defaults are changed; no token extraction,
manual SOAP serialization, parser replacement or dependency addition. Missing
transport fails closed. Existing retrieveDmo now calls this helper; raw failures
are static ACQUISITION_FAILED, redirect refusal METADATA_REDIRECT_REFUSED.

Actual core Connection construction + installed Metadata/SOAP/HTTP/request against
loopback servers proves all 301/302/303/307/308 same/cross-origin redirects issue
exactly one request and zero requests to redirect destination, with payload-free
errors and unchanged caller transport/Metadata receiver/refresh delegate. SOAP
session header and readMetadata body are verified; separate 200 XML fixture proves
core cardinality/fullName/label parsing survives. Focused tests 100/100 passed.
All fixture traffic is loopback only, no live org calls or writes.

README, artifact contract, capabilities and this handover updated, no optional
findings or stale-doc cleanup. Normal full verification and enabled-hook commit
receipt are recorded in coordinator handoff. Gate 4 round 2 belongs to original
read-only reviewer; this worker does not launch another review. Propagation:
primary sf-plugin-data360 done; catalogs/parsers/LSP/extensions/MCP/MSO and other
independent CLI repos N/A. Package 0.1.0 unchanged; no root edits/push/tag/release.
Full verification completed 2026-10-25 19:31:55+01:00: explicit build, scoped
autofix, full lint zero warnings, full tests 183/183 (27.718s), smoke 7/7 (25.411s),
package smoke 26 entries / 3 installed isolated help checks, all exit 0 (96.624s).
Temp checks at each shell/test entry use actual os.tmpdir and absolute normalized
TEMP/nonempty TMP/TMPDIR F:/Temp, process repair/recheck only; scratch retained,
no recursive cleanup.

# Gate 4 remediation slice 1: execution admission

Started 2026-10-25 19:19+01:00 from clean 6bb18fe; fetch/status confirmed.
Only round-1 must-fix admission addressed. Shared `preflightDmoDeploy` now blocks
non-Other category and non-Text/dynamic primary keys with payload-free
SOURCE_EXECUTION_UNSUPPORTED before target reads. Offline mapper remains unchanged;
no field-count or unrelated authored-type restriction. Executor and public batch
already reuse this preflight, so a later unsupported selection prevents earlier POSTs.

Verification 2026-10-25 19:26+01:00: explicit build, scoped autofix, full lint zero
warnings, full tests 181/181 (26.530s), smoke 7/7 (24.796s), package smoke 26 entries /
3 isolated installed help checks all exit 0. Normal enabled-hook commit follows.
README/capabilities updated; independent package 0.1.0 unchanged, no releases.
Propagation: sf-plugin-data360 done; all language catalogs/parsers/LSP/extensions/
MCP/MSO and independent CLI repos N/A. No root edits or live org calls. Scratch
retained under verified OS temp, no recursive deletion. Original reviewer remains
coordinator-owned; no separate review claimed. Next slice: operation-local Metadata
SOAP redirect refusal with actual installed stack regression and unchanged caller.

# Public bounded execution integration slice

Started 2026-10-25 19:05+01:00 from clean requested
`c83e39c7757ef8d1f1d8221a8fd32b5f5b2f292e`. Fetch/status clean main, no
remote configured. Inline temp-check quoting failed closed, corrected before Git.
Written slice plan and simplicity check preceded edits; inherited common-plan
review has zero must-fix (Gates 1/2 complete). Gate 3 one small coupled command/test
slice, no model/resolver/executor refactor or extra worker. Whole-milestone Gate 4
remains coordinator-owned, not claimed here.

## Exact public execution and aggregate semantics

`sf data360 deploy` now invokes existing `executeDmoCreate` unless `--preview`.
Explicit repeatable file/directory OR exact project member mode, no bare type or
implicit all, API65/default and core org flags are unchanged. ALL local documents
resolve/validate before command-owned target inspection. ALL selected items get
read-only preflight before any executor call; any blocked-changes/blocked/error
prevents the entire selection from execution. This prevents known avoidable
partial deployment, not concurrent races or transactional partial writes.

After admission executor calls are sequential, each still independently runs fresh
preflight. Unchanged is mutation not-attempted, no POST. First blocked/failed/unknown
mutation stops calls. Earlier completed receipts remain; later selection members
are outcome not-attempted and mutation not-attempted, with admission preflight.
Unexpected executor throws conservatively become failed/unknown with static
EXECUTION_UNCONFIRMED; no raw exception, remote payload or token enters output.
Known earlier creation evidence is never replaced by a batch failure receipt.

Core JSON wraps sf-data360-deploy version 1.0.0. Existing preview item shape is
unchanged and executor is never called. New discriminant operation execute adds
outcome created/unchanged/blocked/failed/not-attempted, mutation confirmed-created/
not-attempted/unknown, optional preflight and diagnostics to identity/path. Aggregate
success/exit 0 only after all executions created/unchanged. Blocked => blocked/exit 1;
failed/unknown => failed/exit 1, even after prior creation. Whole-selection errors
carry DEPLOY_EXECUTION_FAILED, blockers DEPLOY_EXECUTION_BLOCKED. Human output
reports each mutation and warns creation may have occurred for unknown; manual
inspection before another attempt, no retry/rollback/PATCH/update/saved plan.
No local artifact or report is written.

## Verification and next bounded acceptance

Command tests cover preview never executor, created envelope, all-selection
preflight ordering, unchanged no-op, later blocked/error prevents all execution,
partial blocked/failure/unknown/throw retains earlier creation, remaining unattempted,
redaction, exit and human guidance, plus both-mode local admission before inspection.
CLI invalid no-selection execution now reports INVALID_SELECTION, not unimplemented.
Final explicit build, scoped autofix, full zero-warning lint, full 179/179 tests
(25655.9307 ms), CLI smoke 7/7 (23438.1903 ms) and package smoke (26 entries,
3 installed help checks) passed 2026-10-25 about 19:13+01:00, command exit 0.
Normal enabled-hook commit receipt is recorded in coordinator response. Existing README, artifact
contract, capabilities and handover updated; package remains 0.1.0, no version bump,
tag/push/release. Initial autofix invocation did not pass npm's fix flag; corrected
by direct local eslint CLI before final verification. No live org calls/writes.

Gate 5 slice propagation: primary sf-plugin-data360 done; catalogs/parsers/LSP/
extensions/MCP/MSO and independent CLI projects N/A, no downstream code, wiki/site
listing/hover changes. No root edits. All shell/test entry temp checks validate
absolute normalized TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR F:/Temp with
process-only repair/recheck. Existing OS-temp run-owned scratch is retained, no
recursive cleanup. Whole-milestone review remains coordinator-owned.

NEXT recommend LIVE bounded acceptance only after coordinator authorization and
whole-milestone review: isolated CLI profile/unsigned allowlist, explicit API65/
default source-target and one approved qualified authored DMO. First read-only
preview, then separately authorized single create, independent target inspection,
unchanged replay/no writes, and one deliberate authored difference blocked/no writes.
Capture versioned envelopes and target evidence without payloads/tokens. Stop on
any unknown mutation and inspect manually; never retry or rollback automatically.
Do not start live acceptance, installations or org actions from this slice.

# Internal guarded-create executor slice

Started 2026-10-25 18:54+01:00 from clean requested
`89079fd06204097c0250d7bce1ee1111218139e7`. Fetch/status clean main; no remote
configured. Initial inline temp check quoting failed closed, corrected before
workload. Written slice plan and explicit simplicity check preceded edits;
inherited reviewed shared-DMO plan applies (Gates 1/2 complete). Gate 3 one small
coupled transport/executor/test slice; no additional worker or root edit.
Whole-feature Gate 4 remains coordinator-owned, not claimed complete here.

## Exact executor and mutation interface

New `src/services/execute-dmo-create.ts` exports
`executeDmoCreate(document: unknown, connection: TargetConnection, apiVersion: unknown,
dataSpace: unknown): Promise<DmoCreateExecution>`. TargetConnection is actual core
Connection instanceUrl/request/metadata/getApiVersion subset, explicit API65/default.
Result `{outcome:'unchanged'|'blocked'|'created'|'failed',
mutation:'not-attempted'|'confirmed-created'|'unknown',
preflight?:DmoDeployPreview,diagnostics:Array<{code:string,message:string}>}`.
No public command execution wiring, saved preview input, file discovery or reports.

Independently authored-maps and reconstructs a private detached snapshot/request
synchronously before first await. No caller document references survive into
execution. Fresh `preflightDmoDeploy` runs, never trusts prior preview. Unchanged
is not-attempted no-op; differences/unqualified existing/inventory/scope/input
failures block without POST. Only complete-inventory exact scoped absence permits
one create. Existing `compareDmoMeaning` is exported/reused (exact name-keyed fields,
reorder ignored; optional absence distinct, all authored fixed fields compared).

`ConnectClient.createDataModelObject(document:unknown):Promise<unknown>` independently
maps input to JSON and fixed API65 SSOT data-model-objects POST only. Existing
same-origin/path/redirect/error-redaction protections reused, retry.maxRetries=0.
Actual core JSforce automatically replays on 401 unless its refresh delegate is
masked: per-call receiver inherits original connection, shadows _refreshDelegate
only, original connection unchanged. Synthetic actual Connection.prototype request
stack regression proves one POST/401 and no refresh; no credential extraction or
runtime dependency addition. No generic arbitrary writes/PATCH/delete/rollback.

POST body is untrusted and not completion evidence; malformed/empty success still
needs independent exact authored identity `retrieveDmo` Connect detail + core
Metadata + complete relationships. Common projector must establish actual generated
recipe and qualifier integrity, then common mapped authored meaning must match.
Only this yields created/confirmed-created. POST errors -> failed/unknown with
CREATE_UNCONFIRMED; failed/unqualified readback -> READBACK_UNQUALIFIED; qualified
meaning mismatch -> READBACK_MISMATCH. All explicitly retain creation-may-have-
occurred evidence and manual inspect-before-retry guidance; no automatic retry.
Inventory absence is not a concurrency transaction; a racing creator cannot be
ruled out. Common mapper admits wider semantics than demonstrated projector;
unsupported recipes cannot report verified. No broader/live deployment acceptance.

## Verification, propagation and next slice

Ten executor regressions use actual existing independent common schema fixtures:
fresh preflight/equality/differences, invalid source/scope/preview, mutation during
await, successful independently verified empty POST body, status/network errors,
readback missing/malformed/mismatched/generated/qualifier errors, no retries.
Two transport cases cover invalid admission and actual core-stack 401 replay guard.
Focused 97 document + 8 transport tests passed. Explicit build, scoped ESLint
--fix, full zero-warning lint, full 175/175 tests (25524.0349 ms), 7/7 CLI smoke
(23770.1966 ms), package smoke (26 entries, 3 installed help checks) all passed
2026-10-25 at approximately 19:03+01:00 (complete verification command exit 0,
90869 ms). Normal enabled-hook commit receipt follows in coordinator response. Package
inventory updated to 26 entries, including executor JS/declarations. Existing
README/artifact-format/capabilities/handover updated; no npm changelog.

Every shell/test checks absolute normalized TEMP/actual Node os.tmpdir/nonempty
TMP/TMPDIR F:/Temp, process-only repair/recheck. Package/test scratch uses existing
verified OS-temp mkdtemp scripts and is retained; no recursive cleanup. No live org
calls, reference names, push/tag/release/version bump. Current package remains 0.1.0,
new version unassigned. Gate 5 slice propagation: sf-plugin-data360 done; language
catalog/parser/LSP/extensions/MCP/MSO and independent CMS/MCNext N/A, no downstream
updates, wiki/site/listing/hover changes. Whole-feature review still parent-owned.

NEXT bounded CLI executor slice: begin from this committed clean tree, read this
interface and existing deploy command. Keep explicit source-dir/metadata selection
and preview behavior. Only wire actual execution under fresh authorized scope;
resolve and validate all selected authored inputs first, then call executor per
selection with actual core API65/default target connection. Extend versioned public
envelope to carry truthful mutation evidence, failed/unknown exit status, human
no-retry/manual-inspection guidance, and never present HTTP success as deployment
success. Preserve preview-only no-mutation tests and add actual-execution seam tests.
Do not invent all-or-nothing transaction, whole-selection atomicity or rollback;
preflight per item is not a batch concurrency guarantee. Reassess whole-selection
fresh preflight acceptance with coordinator before CLI semantics if needed. Normal
build/scoped-autofix/lint0/full-tests/smoke/package/enabled-hook own-path commit only
under current approval. No public execution is enabled by this internal slice.

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
