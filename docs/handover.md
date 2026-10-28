# CI operational service boundary — 2026-10-28

Package ownership reconciled with fetch/status: clean HEAD/origin
`6bc744b37fe77ee73fc427ee13a7316045562dae`. Existing Segment, IR and CI
records below remain intact. Dedicated read-only plan review
`2e8719e0-10f4-405f-a326-f4e824146167` returned zero must-fix before edits.
Written scoped plan selected acquisition/binding -> preflight/execution -> tests;
one coupled service owner, no public command/file/Git integration. Am I
overengineering this? No generic adapter, SQL parser or state framework added.
Coordinator retains once-whole-feature review and final public-doc propagation.

New production-default interfaces (all use explicit ApiVersionSelection65.0,
Connection API65 and default space):

- `retrieveCalculatedInsight(connection, apiName, selection, dataSpace)` returns
  `{identity, candidate?, observations?, expectations?: {runtime, metadata}, blockers}`.
  Exact native GET plus independent guarded SOAP MktCalcInsightObjectDef read;
  one exact Metadata record, full correlation, no absence/create inference.
- `bindCalculatedInsightDependencies(value, connection, selection, dataSpace,
  acquire?)` returns private `{identity, targetId, fields}` for the exact fixed
  DMO and two mapped Text fields. Independent REST/CustomObject Metadata checks
  require Standard enabled ENGAGEMENT/default identity and unique fields; no
  first-match/name fallback or source-ID adoption.
- `preflightCalculatedInsightDeploy(value, connection, selection, dataSpace,
  acquire?, bind?)` returns update/unchanged/blocked, present/unknown, absenceProof
  none, fixed PATCH route and processing effect only for update. Create/shell
  conversion remain blocked, not absence-safe.
- `executeCalculatedInsightDeploy(value, connection, selection, dataSpace, options)`
  requires `allowProcessing`, `verifyInput()` and private async
  `recordObservation({phase,status,observations})`. Optional acquisition/binding/
  PATCH/read/clock/delay seams are synthetic test hooks. Fresh independent
  baseline+final prewrite captures and rebinding precede zero-write equality or
  forward expression-only mutation. At most one fixed API65 PATCH; no refresh,
  retry, redirect, publish, Metadata deploy job or rollback route. Twelve runtime
  polls (additional final runtime/Metadata/binding reads) share120s from before
  PATCH, with checks after awaited operations; PROCESSING alone never success.
  Independent ACTIVE pair and fresh unchanged binding required for confirmation.
- `observeCalculatedInsight(runtime)` validates complete PROCESSING/ACTIVE
  observations without fabricating Metadata; existing settled projector still
  requires ACTIVE plus independent Metadata. Baseline/echo/poll/settled derived
  attribution stays detached and visible privately, never dependency identity or
  a claim that derived attribution stays constant. Portable semantics compare in
  full; observed null/DeviceId/SoftwareApplicationId variations are retained.

Synthetic coverage adds42 tests (878 total): exact acquisition/correlation,
fixed-scope refusal, independent mapped field admission/ambiguity, preflight,
zero-dispatch unchanged/no-ack, one PATCH then independent settlement, input/
binding drift, pending/error/malformed/read failures, finite budget/deadline
including PATCH and final Metadata latency, and transport no-replay payload.
Initial focused75/75 passed before11 additional scope/deadline/binding tests.
Final lint:fix, zero-warning full lint, explicit build and full unfiltered
`npm test --no-workspaces`878/878 passed: Node118.431s; full npm including build
121.990s; combined shell142.930s. Initial compile caught the installed JSforce
Metadata type union omitting this supported type; narrowed only the guarded
SOAP call signature, not payload admission. Hook/commit/push receipts follow in
the worker result; do not infer them from this precommit handover.

No org requests, mutations, live acceptance, package install, release/tag,
registry publication, guide or root edits. This is a verified service boundary,
NOT public/live zero-write or cross-org CI acceptance. No source cleanup was
required. All shell/test entries used verified absolute TEMP/Node tmpdir and
nonempty TMP/TMPDIR F:/Temp, process-local only; no scratch or recursive cleanup.

**Minimal next:** one common integrator adds CI paired standard XML/companion
writer+strict reader/digest/Git selector and public retrieve/preview/deploy routes,
passing mandatory observation recorder and input verifier. Preserve exact
expression-only/ACTIVE/typed-dependency subset; do not predeploy Metadata shells.
Then separately justify bounded retained-source public acceptance (including
instrumented unchanged), not a new mutation merely to exercise services. Draft
create, labels/schedule, computation and broader SQL remain separately pending.
Graph/DLO continuation remains independent and uninvestigated here.

Propagation: sf-plugin-data0.1.0 unchanged, next release unassigned; internal
handover updated. README/capabilities/artifact/Git public claims stay unchanged
because no public route enabled; coordinator owns final propagation. No language,
LSP, hover, wiki, mcdev, site/tool-listing or other workspace consumer needs sync.

# Segment COUNTING continuation and retained public repeat — 2026-10-28

Fetched package HEAD `41e0ea500e2205a8d08161f42351d6bf907174db` equalled
origin/main; sole package editor preserved and reconciled BOTH the existing CI
contract checkpoint and SOURCE IR acceptance sections below. Those historical
results retain their original owners/scope. Graph `71399c4a` remains independent
qualification only, not integrated behavior. No target or guide action occurred.

Written narrow plan and dedicated read-only architect review
`2f408f12-5831-43b2-9034-1ba85e14e8dc` completed before edits, zero must-fix.
Am I overengineering this? No new framework, shared state machine, broader state
allowlist or extended budget is needed. One tiny coupled executor/test slice was
implemented serially; full verification inputs stayed stable. Coordinator owns
once-whole-feature Gate4 and final documentation propagation, not this chunk.

Changed `src/services/execute-segment-deploy.ts` polling only: exact COUNTING now
continues alongside PROCESSING. PATCH response qualification still admits only
PROCESSING/ACTIVE. Existing 12-read/120-second deadline, preservation comparison,
independent ACTIVE runtime/Metadata pair and fresh binding checks remain intact.
COUNTING alone is never success. Added three regressions: PROCESSING -> COUNTING
-> ACTIVE requires exactly one PATCH, three acquisitions and four binding checks;
persistent COUNTING exhausts unchanged bounds and stays unknown; COUNTING followed
by unknown/missing/ERROR/failed read stays unknown with no replay. Focused16/16.
The first focused attempt caught a test-only binding-count expectation5 vs actual4;
corrected before all green verification, not concealed as an initial pass.

Qualified prior evidence remains
`data360:segment.dbt.a2-owned-continuation-counting.api65`: original actual public
update exit1/unknown is NOT retroactively successful. Later ACTIVE plus complete
runtime/XML preservation is separate API evidence. COUNTING-to-ACTIVE was sampled
across9m19.496s; actual transition instant is unknown. This fix does not promise
live completion within the unchanged budget or authorize replaying that mutation.

Fresh verification: lint:fix, full zero-warning lint and explicit build passed.
Full `npm test --no-workspaces`836/836 passed, Node117.823s and full npm test
including build121.356s; focused/lint/build/full-test shell144.467s. Normal-hook
checkpoint receipts and final commit/push hash are returned by this worker.

Retained SOURCE acceptance: headless discover/describe consulted before org reads;
its SOQL recipe supplied no executable identity endpoint, so read-only SObject
Organization query plus independent CLI Organization query/core alias binding
verified SOURCE. Exact ownership ledger IDs and ACTIVE desired labels checked.
One actual public `node <repo>/bin/run.js data360 deploy -o <sourceAlias>
--api-version 65.0 -d <retainedCompanion> --allow-processing --json` returned
exit0/status success, unchanged/not-attempted, preflight unchanged/present,
requiredEffects[], diagnostics[]. No pair edit/new update/create/delete/refresh,
activation, cleanup or target request. Original unknown update was never replayed.
Run12:12:38.810Z–12:13:55.496Z,76.686s. JSforce/Undici/NodeHTTP+HTTPS observers
recorded35 local underlying reads total,31 repeat;34 transport observations total,
31 repeat (duplicate observations, not additional traffic). Four Metadata retrieves,
nine retrieve-status polls, zero mutations/Metadata deploy jobs. Plus one known MCP
identity read=36 known underlying reads; other MCP/auth internals not globally
counted.22 local logical nonpoll reads plus one MCP=23 known logical nonpoll reads.
Predeclared budget120 underlying/50 logical nonpoll/6 Metadata retrieves/5min,
zero mutation allowance; pair and code/test hashes unchanged during acceptance.
This is source-command repeat acceptance, NOT installed-package/cross-org/two-
selection/create/computation acceptance or a live test of the new transient path.

Private owned receipts retained at `F:/Temp/segment-counting-repeat-5qpIyT`;
original receipts `F:/Temp/segment-retest-Xwc6tY`. No recursive cleanup. All shell
entries verified process-local absolute normalized TEMP/actualNodeos.tmpdir and
nonemptyTMP/TMPDIR as F:/Temp. Any future worker must retain mkdtemp ownership
markers, registered strict-descendant/no-link cleanup safeguards; never recursive
repository/workspace cleanup. Source leftovers acceptable; cleanup not prerequisite.
Sanitized distinct evidence subject `data360:segment.dbt.counting-repeat-acceptance.api65`
was written after root fetch/status ahead5/not behind; no shared index rebuild.
Coordinator owns aggregate schema validation/index update and final GUI walkthrough.

**Next CI executor resume:** continue the existing contract checkpoint below:
API65 independent runtime/Metadata acquisition plus fixed typed dependency binding,
then family-local preflight/executor with allow-processing, at-most-one PATCH,
bounded settlement and complete readback including attribution observations;
add unchanged mutation-spy tests before common selector/file/command integration.
CI offline833-test checkpoint is not public acceptance. Broader Segment SQL edits,
DLO gaps, Graph/IR integration and cross-org milestone remain separately pending.
Package sf-plugin-data0.1.0, next release unassigned. No language-stack/workspace
consumers need updates; final README/capabilities/guide propagation coordinator-owned.

# Chunk C qualified CI expression comparison contract checkpoint — 2026-10-28

Reconciled fetched package HEAD `ec410fa6f8447cb0f74e0eae5b9ca1d96ecf32c5`
(equal to origin/main). The existing uncommitted SOURCE IR acceptance section
below is preserved, not claimed as this worker's output. No guide/index edits,
live org requests, mutation replay, installation or release were performed.

Written scoped contract-first plan and dedicated read-only architect review
`e5424a9e-46ec-4a5d-beb8-3d1c4297804b` completed before edits. Its sole must-fix
is incorporated: independently acquired ACTIVE runtime and matching Metadata
are required before unchanged or candidate evaluation. One coupled artifact/test
slice is the sizing boundary; no public-stack/framework expansion. Whole-feature
Gate4 and public-doc propagation stay with the coordinator.

Implemented `src/artifacts/calculated-insight-document.ts` and synthetic
`test/calculated-insight-document.test.mjs`:

- `validateCalculatedInsightDocument(value)` and
  `serializeCalculatedInsightDocument(value)` admit detached schemaVersion 1,
  kind `calculated-insight`, default-space `__cio` identity and the complete
  fixed semantic profile. This is an internal offline contract, not yet a public
  on-disk layout or retrievable/deployable CLI artifact.
- `projectCalculatedInsight(runtimeDetail, metadataDefinition)` takes exact API65
  detail body plus a separate `readMetadata` definition, checks ACTIVE and exact
  identity/label/creationType/expression correlation, then returns
  `{document, observations: {derivedAttribution: {dimensions: [value], measures: [value]}}}`.
  Attribution is explicit null or `{sourceApiName, type: STREAMING_DATA_MODEL}`
  for the two observed fields; unknown attribution structure blocks. It never
  defines dependencies. SQL/formulas fix both typed DMO field dependencies.
- Full ordered dimension/measure schema, aliases, roles, aggregability, formulas,
  creation type, enabled/type/definition status, label/description/subtype and
  schedule/bounds remain in complete semantic admission. Unknown/missing fields
  block rather than disappear. Only recorded error-free, never-run runtime
  profile is admitted; populated last-run fields remain unqualified.
- `buildCalculatedInsightUpdateDelta(desired, runtimeDetail, metadataDefinition,
  targetDataSpace)` returns payload-free blocked, unchanged with no patch, or
  candidate with exactly `{expression}` plus expected document and attribution
  observations. It has no connection/writer/dispatch seam. Synthetic zero-dispatch
  unchanged is not live repeated-deploy acceptance or network-provenance proof.
- SQL is exact-byte bounded to the recorded baseline and forward `DeviceId IS
  NOT NULL` addition after `WHERE 1 = 0`, preserving `APPROX_COUNT_DISTINCT` and
  Text/Number NONAGGREGATABLE output. Removal/reversal, formatting-only changes,
  COUNT, alternate predicates/aliases/schema/settings changes block. No arbitrary
  SQL parser, dependency resolver or general omitted-field replay is introduced.

The sanitized same-aggregation evidence did not embed nested attribution/full
key inventories; optional retained qualification receipts resolved that execution
checkpoint without new org calls. Tests use synthetic identities and authored
fixtures only; private wrappers/tenant data/receipts were not copied into Git.
The historical COUNT aggregability rejection remains valid and separately scoped.

Verification: focused 44/44 passed (Node phase 0.132s); lint:fix and explicit build
passed. Full zero-warning lint passed; complete `npm test --no-workspaces`
passed 833/833 (44 new; Node test phase 127.162s; full npm test including build
131.192s; lint plus full test shell 142.541s). Normal unchanged hooks passed lint,
833 tests (Node phase 135.158s) and 30 CLI smoke tests; hook/commit total
265.053s, smoke phase 111.111s.
Source/test checkpoint committed and pushed as
`41e0ea500e2205a8d08161f42351d6bf907174db`; only those two literal paths were staged.
Handover remains unstaged to avoid including the preexisting IR acceptance edit
without its owner's coordination. No release/tag/publication performed. All shell/test entries verified process-local TEMP/TMP/TMPDIR and
actual Node tmpdir as absolute normalized `F:/Temp`; no recursive cleanup.

**Remaining / exact resume:** CI public routes do not exist yet beyond internal
API67 draft-create transport. Next owner should add API65 exact independent
runtime/Metadata acquisition and target dependency compatibility using this fixed
projection, then family-local preflight/executor with fresh reads, allow-processing,
at-most-one PATCH, bounded settlement and complete readback (including explicit
attribution observations). Add unchanged mutation-spy tests at that service seam
before common selector/file/command integration. Do not infer draft/create/shell
absence safety, arbitrary SQL/schema support, successful computation, public CLI
acceptance or cross-org acceptance from this offline checkpoint.

Package stays `sf-plugin-data` 0.1.0, next release unassigned. No language-stack or
workspace consumers require updates. README/capability/artifact user claims remain
unchanged because no public behavior was enabled; coordinator owns once-whole-feature
review and final propagation. No sfmc.guide edit/staging/commit/push.

# SOURCE public IR acceptance completed — 2026-10-28

Accepted against clean fetched source revision
`ec410fa6f8447cb0f74e0eae5b9ca1d96ecf32c5`, using actual public
`node <repo>/bin/run.js data360` commands from the validation Salesforce project;
this is source-command acceptance, not installed-package or registry acceptance.
MCP headless discover/describe/dispatch and independent CLI Organization query
matched the expected SOURCE alias before mutation. Target was untouched.

- Exact retrieve: exit 0, portable schemaVersion 1 identity-resolution artifact.
- Edited only Individual `LastUpdated` -> `MostFrequent` before effect checks.
- Deploy `-d <portable> --api-version auto --preview --json`: exit 0, `update`,
  publication/generated-output-provisioning effects, 56 read dispatches, zero writes/jobs.
- Deploy without `--allow-processing`: exit 1, blocked acknowledgement diagnostic,
  `not-attempted`, 56 read dispatches, zero writes/jobs.
- Acknowledged deploy: exit 0, `updated` / `confirmed-updated`; exactly one API67
  `d360_ir_update`, 244 reads. Three private executor polls were
  `PUBLISHING`, `PUBLISHING`, `PUBLISHED`, recorded before classification.
- Independent complete facade comparison against baseline with only Individual
  ruleType changed passed; native API65 projection agreed. All other fields,
  ordered matches/reconciliation entries, flags and generated identities preserved.
- Identical acknowledged repeat: exit 0, `unchanged` / `not-attempted`; transport
  instrumentation proved 200 reads (16 facade, 100 native GET, 84 Metadata
  readMetadata), zero mutation/job dispatches, not merely an unchanged label.

Retrieve used `-m identity-resolution:<owned-ir> -d <portable>`; deploy used only
`-d <portable>` because deploy source-dir and metadata selectors are mutually
exclusive. Two harness argument mistakes failed locally `INVALID_SELECTION`
with no requests; not plugin bugs. No production code or tests changed.

One newly owned fixture was provisioned through the committed API67 facade
helper as TEST SETUP ONLY, automatic=false; product CREATE remains blocked.
Exact ownership guard preceded one delete; five cleanup polls reached facade
notfound, independent native owner and all twelve captured generated definitions
returned HTTP404 `ITEM_NOT_FOUND`. No separate generated-DMO deletes. No fixture
intentionally retained; physical records, retention, storage and credits remain
unknown. Source publication/provisioning was observed, no explicit resolution job.

Pre-provision arithmetic retained all repeated six-input/twelve-output guards:
650 logical nonpoll / 1000 underlying reads, 24 polls, 45 minutes, one create,
update and delete. Actual scoped live window 11:11:12.816Z–11:34:19.723Z,
23m06.907s; 589 instrumented dispatches/responses = 586 reads + three mutations;
11 polls (3 setup, 3 update, 5 cleanup), 575 nonpoll reads. Earlier MCP/CLI org
identity and auth internals are outside this instrumented total; it is not a
fabricated exact global count. Private marked OS-temp receipts are retained at
`F:/Temp/ir-public-PJpOTZ`; no recursive deletion. TEMP and actual Node tmpdir
were verified per shell entry.

**Standing SOURCE authorization clarification for future milestones:** SOURCE
is available for goal-directed experimentation and remaining test resources are
acceptable. Do not block provisioning/testing merely because cleanup feasibility
is uncertain. Exact-owned cleanup is best effort; report leftovers. Unknown
mutations still prohibit blind replay. TARGET's bounded permissions and local
filesystem cleanup safeguards are unchanged. Coordinator should revisit prior
self-imposed cleanup-blocked tests after the unattended pass, then conduct GUI
blocker walkthroughs one by one. Guide is under user review: no edits/staging/
commit/push. Other roadmap blockers and Graph VALUE debt remain unchanged.

Evidence subject: `data360:ir.public-plugin-acceptance.api65-67` (strictly schema
validated, source CLI plugin-acceptance proof). Coordinator owns final index
rebuild, aggregate validation/gaps, whole-feature review and public-doc propagation.
No root push or release. Package version remains 0.1.0, next release unassigned.
No language-stack/workspace consumers require updates for acceptance evidence.
Fresh verification after this handover: strict subject schema validation passed;
zero-warning lint passed; `npm test --no-workspaces` built successfully and passed
all 789 tests (Node test phase 123.110s; combined validation/lint/test 142.299s).
No production behavior changed, so no new synthetic regression was required;
the live workflow adds the missing public acceptance evidence. No commit/push
performed by this acceptance worker; only this handover is changed in the package.

# Chunk D coherent public IR retrieve/preview/deploy integration — 2026-10-28

## Recovery reconciliation and actual scope

Interrupted worker `9a9ca300-4abf-448d-8fe7-06df9532deab` was reconciled before
extension: its commit actually succeeded as `110cad1dec76f3c334f6409284a698edad0b4d0b`
and was already equal to fetched origin/main, with a clean index/worktree and no
ahead commits. No completed work, commit or push was repeated. Retained normal
unchanged hook receipt passed780 tests (Node phase122.108s),30 smoke tests
(113.993s), lint0; total hook/commit251.021s. Its earlier standalone full test
receipt was149.452s. These are distinct historical receipts, not new acceptance.

Existing plan/review is closed; one coupled command/dependency/test owner continued
without spawning workers because shared command inputs and serialized verification
are the real dependency boundary. Am I overengineering this? No registry, kit,
public journal, new scratch infrastructure or transport was needed: reuse the
existing exact IR acquisition, safe writer, binder, preflight and executor. Goal
is coherent public existing-target integration, not seven-family completion.

## Public command interfaces and invariants

- Retrieve and fixed per-operation `operationApiVersion` interfaces remain those
  of110cad1 below. Default/numeric65 never upgrades to67. Exact IR retrieve uses
  auto or numeric67; mixed legacy/IR uses auto. Omitted selection remains DMO only.
- Deploy now routes admitted `IdentityResolutionDeployInput` by exact kind; no IR
  filtering or accidental DMO executor. IR numeric65/latest/unsupported numeric,
  non-default space and mixed numeric67 combinations refuse before target reads.
  `--include-dependencies` with any IR explicitly returns
  IDENTITY_RESOLUTION_DEPENDENCY_EXPANSION_UNSUPPORTED rather than dropping it.
- Existing exact authored API including actual suffix remains authoritative; no
  suffix construction, label fallback, legacy logicalName reinterpretation or
  CREATE path. Existing-target preflight allows equality or ONLY the qualified
  first reconciliation LastUpdated->MostFrequent delta; missing/unreadable or
  unsupported owner stays blocked, unknown target/absenceProof none.
- New protected command seams: `preflightIdentityResolution`,
  `executeIdentityResolution`, `verifyIdentityResolutionInput`,
  `bindIdentityResolution(input,connection,selection):Promise<string>`, and
  `recordIdentityResolutionPoll(path,evidence):Promise<void>`. Production binding
  independently checks six existing input DMOs and twelve owner-correlated output
  definitions before ANY selected mutation; its private fingerprint is refreshed
  for all pending IR before each dispatch. Changed/missing bindings block earlier
  DMO/Segment writes, not just the eventual IR write. Existing executor repeats
  its own fresh target/input/dependency/output checks and single-attempt settlement.
- `DependencyIdentity.kind` now additionally admits identity-resolution;
  `documentDependencyNode` validates its full document and extracts six exact
  reconciliation entities as DMO prerequisites. Existing topological ordering,
  cycles, isolated nodes and deterministic ready-node tie-break remain. This is
  ordering explicit selected inputs, not a claim of IR transitive expansion or
  generated-owner dependent-family support. Unavailable selected prerequisites
  block complete admission; no speculative provisioning.
- Immutable IR file/Git byte snapshots are preserved: captured Git owners must
  match exact admitted path, inputDigest AND full document; missing/replaced IR
  is INVALID_GIT_SELECTION. Segment Git checks now discriminate by kind rather
  than treating every inputDigest as a Segment. All mixed bytes are captured and
  rechecked before target reads and before dispatch; original expanded legacy
  verification remains unchanged. IR files retain their original recursive freeze.
- API67 operation-local receiver pins facade scope without mutating the shared
  legacy API65 receiver. IR native correlation/dependency/output REST/Metadata
  reads remain fixed65. Requested envelope version remains auto/numeric as given;
  per-item `routes` describes qualified get/native65/Metadata65/update67 routes,
  not proof each possible write ran. Existing mutation evidence remains decisive.
- Preview is read-only and includes required publication/generated-output effects.
  Execution requires `--allow-processing` for actual IR update and both expected
  effects in admission, before ANY batch writes. Equality needs no acknowledgement
  and existing executor performs zero mutations/Metadata deploy jobs.
- Batch still admits everything first, then executes sequential dependency order,
  stops on blocked/failure/unknown and retains prior results plus later
  not-attempted items. No rollback or atomic cross-component claim.
- Private status-only poll evidence is detached into invocation-owned protected
  `identityResolutionPolls:Map<path,IdentityResolutionPollEvidence[]>`; recorder is
  passed to existing executor and runs before its classification. No raw response,
  status observation or private fingerprint enters public envelope/logs. Evidence
  is in-memory for command lifetime, not a durable journal or a user file.

## Verification and remaining ownership

Owned implementation/test paths: existing deploy command and dependency-selection
helper; existing deploy-command and identity-resolution-files regressions; new
identity-resolution-deploy-command.test.mjs; this existing handover. No installs,
new live org calls/mutations, DB edits/index/root push, public documentation edits,
release/tag/version changes or history rewriting. Version remains0.1.0, next
version unassigned. Normal hooks unchanged; exact final full-suite/commit/push
receipts are reported in worker return, not guessed here.

Focused54 passed, build and full zero-warning lint passed. Added synthetic command
coverage for mixed IR/Segment/DMO, fixed/numeric/default routing, preview/effects,
acknowledgement0writes, late input/binding drift, partial unknown/unattempted items,
private recorder/no public leak, no-op0mutations/jobs, Git disappearance/digest
mismatch and unchanged legacy numeric/latest tests. Existing executor/transport/
file/Git/binder coverage remains essential; no safety regression was removed.
Full stable-tree `npm test --no-workspaces` passed789 with zero failures/skips/
cancellations/todo, end-to-end134.215s (Node phase130.105s). This includes build;
full zero-warning lint passed separately. Normal unchanged-hook commit/push
receipts follow in worker return.
Every shell/test entry preflighted absolute normalized TEMP/actual Node os.tmpdir/
nonempty TMP/TMPDIR F:/Temp. No recursive cleanup or persistent project edits.

NEXT coordinator: once-whole-feature review of integrated command surfaces, then
public README/capabilities/artifact/Git docs and final stable combined DB
rebuild/validate/gaps; existing114 unrelated SSJS drift is not this slice's proof.
Separately qualify source retrieve->authored files->target preview/apply->independent
readback->zero-mutation repeat with exact source/target org bindings and owned
fixtures. Synthetic integration is NOT live acceptance or family completion.
IR CREATE, broader rule/source-precedence variants and live revised-binder
acceptance remain blocked/unproved. Segment setup/permission/shell CREATE,
CI expression/no-op, DLO operational/source cleanup, Graph and broader DMO schema
requirements remain unchanged. Historical Graph VALUE cleanup debt remains below;
no physical/global/output cleanup claim is newly established.

Carry forward newest user direction: favor coherent end-to-end outcomes and maximum
safe unattended completion, not arbitrary tiny checkpoints. At the END of the
unattended plan pass, walk remaining blockers ONE BY ONE interactively with user
GUI observations. Prefer standard sf CLI; when insufficient investigate Connect
REST including CLI-authenticated requests explicitly. Missing CLI command does
not establish API unavailability. Do not begin live acceptance/mutations merely
because implementation is green.

Propagation: sf-plugin-data implementation/handover changed; no workspace consumers,
language/LSP/hover, mcdev/wiki, CMS or site update is required by a dependency.
Public docs/guide are pending coordinator review/propagation by existing ownership,
not silently completed. Do not release this unfinished roadmap checkpoint.

# Chunk D API-auto and exact IR RETRIEVE integration checkpoint — 2026-10-28

Fetched baseline `31cf00b8100f8385c0c7854f28920515818b1832` was clean and equal
to origin/main, with no ahead history to include. Existing plan/review remains
closed. This is one coupled command/routing checkpoint, NOT IR deploy integration,
family completion, live portability acceptance or a release. Coordinator owns the
once-whole-feature review, public docs, final DB rebuild/validate/gaps and aggregate
propagation/version tables. No nested workers or live org calls were used.

## Actual routing and result interfaces

- `operationApiVersion(requested:string,family:OperationalFamily):string` in
  `src/transport/api-version.ts`, where family is dmo/segment/identity-resolution,
  admits only fixed routes: auto -> DMO/Segment65 or IR67; numeric65 remains65;
  numeric67 admits IR only; latest retains existing DMO-only semantics. Existing
  `resolveApiVersion` stays unchanged: it resolves concrete operation selections,
  not auto. No version probing/fallback or runtime MCP dependency was introduced.
- Retrieve parser explicitly accepts auto, default remains65. The envelope's
  `metadata.apiVersion` retains the USER request; `soapApiVersion` describes the
  initialized primary selection, not every operation. Successful auto items and
  all IR items add `routes:Array<{operation,apiVersion,transport}>`. IR evidence is
  d360_ir_get /67.0/facade plus identity-resolutions.get /65.0/native. Legacy auto
  items report native65 and separately correlated Metadata65. Existing numeric/
  latest legacy result items retain their compatible shape.
- Exact `-m identity-resolution:ExactObjectApiName` (repeatable, deduplicated,
  deterministic order) uses protected `acquireIdentityResolution` and
  `writeIdentityResolution` seams bound to the EXISTING qualified acquisition and
  safe writer. It independently checks acquired identity, validated complete
  candidate identity and explicit default space before any output. Exact returned
  API including suffix is retained without construction, label fallback or IDs.
  Existing writer owns configured package path, overwrite/no-link/publication
  safety and canonical `<apiName>.identityResolution.json` content.
- Complete auto/mixed selection resolves legacy DMO/Segment dependencies and all
  IR candidates before first publication; errors retain explicit blockers, never
  omit unsupported IR. Writer failure retains earlier successful receipts and
  stops later publications. No transaction/rollback claim. Bare IR type returns
  IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED; omitted selectors still mean DMO
  inventory ONLY. IR `--include-dependencies` explicitly blocks with
  IDENTITY_RESOLUTION_DEPENDENCY_EXPANSION_UNSUPPORTED before authentication,
  rather than silently ignoring IR or claiming closure. Explicit numeric65,
  latest, wrong space and unqualified numeric/mixed combinations block before org
  resolution/output. Existing DMO numeric/latest, Segment, defaults and opt-in
  dependency selection tests remain green.
- Deploy parser accepts auto for its existing DMO/Segment65 routes only; request
  stays auto in metadata and concrete SOAP evidence is65. Existing IR selected
  input/Git guards still return IDENTITY_RESOLUTION_ROUTE_UNSUPPORTED before any
  DMO preflight/executor dispatch. NO IR deploy executor/effects integration was
  added. Existing-target IR service/executor remain internal future seams.

## Verification, evidence and exact resume

Owned files: `src/transport/api-version.ts`, both existing public command files,
`test/cli.test.mjs`, `test/deploy-command.test.mjs`,
`test/identity-resolution-files.test.mjs`, new
`test/identity-resolution-command.test.mjs`, and this existing handover.
Synthetic coverage includes fixed API matrix/no discovery, explicit65/latest/
unsupported numeric rejection before org/output, IR-only numeric67, one/two exact
IR selectors, no implicit inventory, mixed DMO/Segment/IR whole-selection
acquisition, candidate/acquisition identity/space mismatch, invalid/incomplete
candidate, writer failure retaining earlier output, default/overwrite forwarding,
per-operation evidence and deploy auto/IR anti-DMO-dispatch. Earlier safe writer,
exact facade/native correlation and filesystem/digest/Git tests remain intact.
These are synthetic results, NOT new live qualification or plugin acceptance.
No DB entries/index/root history were changed; coordinator owns final DB work.

Scoped ESLint autofix and full zero-warning lint passed; explicit build passed;
focused routing tests passed52 before the final added deploy regression. Full
stable-tree `npm test --no-workspaces` passed780, no skipped/cancelled/todo,
end-to-end149.452 seconds (Node test phase145.778 seconds). Normal unchanged-hook
checkpoint commit/push receipts are reported in worker return. No install,
release/version/tag/history rewrite/force/bypass, raw receipts or persistent-project
edits. Shell/test entries preflight absolute normalized TEMP/actual Node os.tmpdir/
nonempty TMP/TMPDIR against F:/Temp; process-only correction/recheck was applied
at entry. Existing tests own scratch roots; this slice performs no recursive
cleanup or new scratch infrastructure.

NEXT bounded owner: exact IR DEPLOY command integration, not broad research.
Consume automatic exact authored API binding in preflight/executor; admit complete
mixed family selection, immutable captured IR digests, target default space,
processing acknowledgement, fresh dependency/output binding, private poll recorder,
stop-on-unknown/not-attempted evidence and per-operation API-auto reporting. Keep
numeric65 from upgrading67 and prevent unsupported expanded IR dependencies from
disappearing. Extend existing input/Git/whole-selection guards; do not dispatch IR
through DMO branches. Then separately qualify actual source/cross-org plugin
retrieval/update/readback/zero-mutation acceptance. IR CREATE absence/conflict,
broader matching/reconciliation/source precedence and revised binder live acceptance
remain blocked/unproved. Segment live setup settlement/raw-evidence and permission/
shell CREATE, CI expression/no-op, DLO operational/source cleanup and broader DMO
schema gaps are unchanged. Graph VALUE debt remains unchanged:
`GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm` was readable at checkpoint D;
no new cleanup, eventual/physical/global absence or direct generated-DMO deletion
claim/authorization. Historical ledgers below remain authoritative only within
their original evidence scopes.

Propagation: sf-plugin-data changed only; version0.1.0 unchanged, next version
unassigned/checkpoint only. No workspace consumers, language/LSP/hover/wiki/mcdev/
CMS/site changes. Public README/capabilities/artifact/Git docs remain coordinator
owned; do not advertise full IR deploy or seven-family completion.

# Chunk D IR exact exposed owner API identity correction — 2026-10-28

User decision closes the identity-design checkpoint: the EXACT exposed IR owner
`objectApiName`, including its actual suffix, is a permitted portable authored API
reference. Source and target must expose the same API name in explicit default
space. This is NOT permission to infer/strip/build suffixes, copy source record IDs
or generated-output names, or fall back to labels/names after failed API lookup.
This current correction supersedes the arbitrary-logicalName contract and identity
blocker in historical sections below; those sections retain their original scope.

Fetched baseline `8f72f6404a3bd135018e98e6f57f130e2e71032b` was clean, pushed and
equal to origin/main; retained baseline was 767 tests. Existing plan/review remain
closed; one coupled artifact/retrieve/service/files/test owner, no nested workers.
Coordinator retains whole-feature review, public documentation and final DB
rebuild/validate/gaps. No live org calls/mutations or repeated qualification here.

## Exact corrected schema, refusal and interfaces

- `IdentityResolutionDocument` remains schemaVersion 1 / kind identity-resolution,
  but now strictly requires `identity:{dataSpace:'default',apiName:string}`.
  The exact-key discriminator is the smallest compatibility break: old top-level
  identity.logicalName (alone OR alongside apiName) explicitly throws
  `LEGACY_IDENTITY_RESOLUTION_IDENTITY_UNSUPPORTED`; no migration or reinterpretation.
  Output identities strictly use `{owner:{kind:'identity-resolution',
  dataSpace:'default',apiName},entity:{kind:'dmo',dataSpace:'default',apiName},role}`.
  Twelve ordered owner+space+entity+role references remain; generated names and
  record IDs exist only in private acquisition/target-verification expectations.
- `projectIdentityResolution(facade:unknown,native:unknown,apiName:string)` requires
  complete independent facade/native equality (only facade filters:[] omission
  qualified), exact returned objectApiName, default space, Individual supported
  configuration and PUBLISHED state. Candidate identity copies the observed
  objectApiName, never a constructed prefix/rulesetId combination. Private
  rulesetId remains bounded observed evidence, never an authored field or naming
  recipe. All previous matching/reconciliation/unsupported-field guards remain.
- `retrieveIdentityResolution(connection,apiName,selection,dataSpace)` removes the
  independently authored logicalName argument. Exact API67 facade get plus API65
  native exact GET produce the checked candidate; no inventory/name fallback.
- Existing-target resolver is the preflight's direct exact API acquisition:
  `preflightIdentityResolutionDeploy(value,connection,selection,dataSpace,options={})`.
  `options.targetApiName?:string` is now an optional compatibility assertion only;
  when supplied it MUST equal desired.identity.apiName before reads. Omission
  automatically resolves authored API, not label/rulesetId/generated output name.
  Acquired identity, complete reprojection, candidate and private outputs must agree.
  Different source/target record IDs are permitted; no source ID participates in
  authored identity. Missing/unreadable/unsupported/mismatched owners or spaces
  block with target unknown / absenceProof none. CREATE remains blocked.
- `executeIdentityResolutionDeploy` keeps its signature and existing bounded
  update/settlement semantics. Its optional targetApiName defaults to authored API;
  conflicting manual assertion blocks. Fresh input/dependency/output/readback
  guards, required processing acknowledgement and private poll recorder remain.
  Output verifier also requires every logical owner API to match the exact target
  and reacquires that owner before/after generated-DMO reads.
- Writer publishes `<package>/main/default/data360/identityResolution/
  <apiName>.identityResolution.json`; exact API filename/admission/selector/
  duplicate-identity checks replace logicalName checks. Original strict JSON,
  no-link/single-link bytes, immutable recursive freeze and SHA256 digest remain.
  Existing `readDeployInputs`, `verifyIdentityResolutionInputDigest`,
  `captureDeployInputDigest` and Git untracked/index/committed/worktree seams now
  validate the authored API schema. No command, transport, Git helper or public
  routing expansion is included: public IR selectors are still explicitly blocked.

## Verification boundary and next command-routing slice

Synthetic regressions cover explicit legacy refusal (validator/writer/file/Git),
exact observed API including suffix, no label fallback or suffix inference,
different target IDs/same owner API, conflicting API/candidate/owner-output,
missing/unreadable/unsupported owner and missing/wrong space, API-derived path,
immutable byte digest and all four Git selection states. Existing executor
single-attempt, no-op/readback, dependency/output and filesystem safety tests stay.
Scoped autofix/build/full zero-warning lint/focused/full npm tests and unchanged
normal-hook checkpoint receipts are reported with exact final counts/timing/hash
in the worker return. Synthetic tests are NOT live portability acceptance.
Every shell/test entry validates absolute normalized TEMP/actual Node os.tmpdir/
nonempty TMP/TMPDIR against F:/Temp, process-only repair/recheck. Fixtures/staging
use marker-owned mkdtemp roots; no recursive cleanup, persistent-project changes,
installs, DB writes/index/root history changes, release/version/tag or bypass.

Next bounded command/API-auto owner can consume the corrected apiName identity
without another identity decision: wire retrieve/deploy exact IR selection through
existing complete-selection guards, effects, immutable digest verification,
fresh automatic exact-owner binding, per-operation auto API routing and private
poll recorder. Keep numeric-version semantics honest; do not silently upgrade65.
Then separately run source/cross-org actual plugin retrieval/update/readback/
zero-mutation acceptance. Revised input-binder live acceptance remains unproved;
IR CREATE absence/conflict and broader matching/reconciliation/source precedence
remain blocked. Segment setup settlement/raw-evidence and permission/shell CREATE,
CI expression/no-op, DLO operational/source cleanup and broader DMO gaps remain.
Graph VALUE debt is unchanged: `GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm`
was readable at checkpoint D; no direct generated-DMO cleanup authorization or
physical/eventual/global cleanup claim. All historical resource ledgers remain.
This is NOT IR-family, Chunk D, cross-org or roadmap completion.

Propagation: sf-plugin-data internal schema/services/files/tests/handover only,
no workspace consumers/language/LSP/hover/wiki/mcdev/CMS/site changes. Public
README/capabilities/artifact/Git docs and aggregate propagation/version tables
remain coordinator-owned. Changed folder sf-plugin-data yes, package version0.1.0
unchanged; next version unassigned, checkpoint only, no internal release.

# Chunk B DLO source/cleanup feasibility checkpoint — BLOCKED — 2026-10-28

Fetched package baseline `e0786b417603dc8f633c433cea361a4b978f2039`,
clean and equal to origin/main, with no ahead history. Reused the approved
operational-routes plan Gates1/2; Gate3 is one narrow qualification/handover owner,
no nested worker or implementation expansion. IR decision and files are untouched.
Coordinator owns whole-feature review/public docs/final combined DB rebuild and
validation. This is a blocked checkpoint, not completion of B or a release.

## Exact question and answer

Can the documented candidate DLO create/update route close its source/stream/key
prerequisites on newly owned fixtures with qualified cleanup, preserving PK/KQ
and system semantics? **Not yet.** API67 facade operation metadata advertises
`d360_dlo_create`, `d360_dlo_update` and `d360_dlo_delete` through POST
`/services/data/v67.0/ssot/mcp/execute` with serialized `paramsJson`. These are
candidate contracts, not executed lifecycle proof. No native write endpoint or
version fallback was inferred. Raw standard Metadata replay remains blocked as
previously recorded; PK/KQ/system fields must not be stripped.

Create metadata exposes `{input:{name,label,category,dataspaceInfo,
dataLakeFieldInputRepresentations|fields,...}}`; field entries expose
`name,label,dataType,isPrimaryKey`. Its `dataSource` branch exposes `sourceId`,
`sourceType:SfDrive`, `sourceConfig` and directory/file details. No complete
SfDrive ownership/source closure or KQ replay contract was established. Update
metadata requires `{recordIdOrDeveloperName,input}` and exposes fields/label and
record-modified/org-unit fields, but does not qualify omission semantics, field
addition/type changes, KQ/system preservation or semantic no-op comparison.
The advertised delete operation is not evidence that its retained-instance
behavior differs from the historical failed Metadata deletion.

A bounded independent prerequisite read examined the Ingestion API stream variant:
`d360_datastream_create_ingestion_api` needs an existing connection developer name,
one connection-schema event, stream name and a primary-key schema field for a new
DLO. It does not accept a complete arbitrary field replay in place of source
schema. Two actual `d360_connection_list` calls with IngestApi/limit20/offset0
returned the same eight preexisting CONNECTED entries and totalSize8. None was
created by this run, selected for use, adopted or modified. This is a scoped
observation, not universal inventory completeness/permission-aware absence proof.

Crucially, a credential-free owned source is **advertised as possible**:
`d360_connection_create_ingestion_api` accepts label and optional three-character
alias, followed by connection-schema definition. Therefore missing external
credentials is NOT the established blocker for that variant. The blocker is the
unqualified owned connection/schema/stream/DLO lifecycle and cleanup gate.
Stream deletion advertises asynchronous settlement and optional
`shouldDeleteDataLakeObject:true`, followed by connection deletion only after
streams are gone. Those semantics are schema/local-reference observations, not
qualified cleanup. With historical DLO retention risk and no new debt permitted
before cleanup feasibility, zero mutation remains the correct stop. Third-party
stream metadata independently requires existing connection/object/field discovery;
no external connector was invented or business connection adopted.

## Binding, budget, effects and evidence

Headless discover/describe ran before org reads. Separate source-MCP and explicit
CLI `sf data query --query "SELECT Id FROM Organization WHERE Id != null LIMIT 1"
--target-org mcnext-sdo --json` (exit0) both matched the intended source org.
The persistent validation project's API65/force-app configuration was inspected
and preserved; its git state belongs to the dirty workspace root, not a separate
clean project repository. No project output or scratch was created.

Predeclared cap: 30 minutes and 30 logical read-only org operations; mutation
budget zero until route/prerequisite/cleanup feasibility. Completed four logical
reads (two identity queries, two connection lists), zero provisions/updates/
deletes/processing/publication calls, within the window ending
2026-10-28T08:35:34.895Z. Schema/discovery calls were separate; one Data360 search
rejected its advertised optional limit, then succeeded without it. Underlying
HTTP/auth/backing requests were not instrumented and are not claimed exact.
Operation metadata advertises API67, but both actual list responses expose
`currentPageUrl:/services/data/v68.0/ssot/connections?...`; MCP outer responseCode201
is not a captured HTTP status or controlled native API67 proof. No version sweep.

Sanitized actual evidence subject:
`data360:dlo.source-prerequisite-checkpoint.api67-68`, in the root verification DB.
It records the two real list observations with independent readback and an
explicit blocked prerequisite claim, not fabricated DLO mutation receipts or
plugin acceptance. No shared index edit or root staging/push. Root fetch/status
passed before the distinct subject write; unrelated staged/unstaged work preserved.
No runtime debt or local scratch cleanup is introduced. Historical retained DLO,
Graph debt and every prior blocker remain unchanged and unqueried by this slice.

## Resume, interfaces and verification boundary

No production interface, command, artifact format, dependency or public capability
changed. No definition-only exporter was added: the optional evidence checkpoint
remains unresolved and expanding code here would not answer it. Next owner needs
one explicit bounded owned-chain cleanup qualification decision before provisioning:
new Ingestion API connection + synthetic schema event + one stream/DLO, exact PK
and generated KQ/system readback, meaningful supported update, independent settled
comparison, then qualified asynchronous stream/DLO/connection removal. Do not
silently authorize that future mutation chain from these schema descriptions;
fix its fixture/operation/time budget and ownership/cleanup stop rules first.
If that gate cannot be met, retain this blocker rather than adopt a shared source,
retry historical cleanup, strip keys or resume broad API/kit research.

Only this package handover and the distinct root evidence subject change.
No behavior test is added for documentation-only work. Fresh explicit build,
zero-warning full lint, full package tests and unchanged normal commit hooks are
required; their actual receipts/hash/push are returned separately, not presumed
here. TEMP/Node os.tmpdir/nonempty TMP/TMPDIR are preflighted at each shell entry;
no install, release, version/tag, target call, recursive cleanup or IR edit.
Gate4 code review is inapplicable to this no-code slice; coordinator still owns
whole-feature review. Gate5 assessment: internal handover/evidence only, README,
capabilities, artifact docs, Git workflow, guide/site listings, mcdev wiki,
language/LSP/hover and all other consumers require no change. sf-plugin-data
changed, working version0.1.0; next version unassigned, blocked checkpoint only.

# Chunk D IR logical-owner identity checkpoint — BLOCKED — 2026-10-28

Reconciled interrupted worker `e2e43088-9be4-4079-af75-3c1c6b7cc34b`
and subsequent recovery transcript before extending work. Neither transcript
contains an implementation edit or history operation. Fresh package fetch/status
confirmed clean HEAD = origin/main =
`1ca88d9e00c387e36b1bbb58c56d1d9736e0cd78`, no ahead history or partial
package changes. Retained baseline verification is 767 tests/30 smoke tests;
fresh verification and checkpoint receipts are returned separately after execution.
Existing Gates1/2 remain closed; Gate3 is one small coupled contract/handover owner,
no nested workers. Coordinator owns whole-feature review/public docs/final DB
rebuild/validate/gaps. This checkpoint does not resolve IR owner binding.

## Concrete identity blocker, not a resolver implementation

Current `IdentityResolutionDocument` v1 identity is exactly
`{dataSpace:'default',logicalName:string}`. Both
`projectIdentityResolution(facade,native,sourceApiName,logicalName)` and
`retrieveIdentityResolution(connection,sourceApiName,logicalName,selection,dataSpace)`
accept caller-authored logicalName independently of source API name and label.
All twelve logical output identities repeat that same arbitrary logicalName.
Consequently neither logicalName==target label nor logicalName==target API name
is an established identity relation. Matching either would silently reinterpret
existing documents, not resolve them.

The local official IR list/get reference exposes `objectApiName`, `id`, `label`,
`configurationType` and `dataSpaceName`; create labels are display names, not a
verified unique immutable developer identity. API67 create schema also exposes
`rulesetId` and `sourceIrDevName`; schema availability alone establishes neither
cross-org identity semantics nor a reversible stable authored owner key. Existing
qualified lifecycle evidence has runtime `Individual_<suffix>` and a four-character
rulesetId. Projection currently correlates those two raw values privately; that
check is NOT permission to derive or persist the suffix as a portable owner key.

The proposed recovery-summary fallback is explicitly NOT adopted: failure to find
an API name is not evidence that a usable API name is genuinely unavailable.
Using spec.label or logicalName as a fallback after that failure violates the
approved API-first reference contract. A complete bounded inventory could prove
that one visible label matches today, but cannot establish that an unrelated
caller-authored logicalName denotes that label. Inventory omission would also
not establish permission-aware CREATE absence. No first-match, suffix guessing,
source-ID replay, manual manifest or generic identity registry is introduced.

**Required coordinator/user decision before command wiring:** either confirm that
exact owner API names are the intended portable identity under the roadmap's
matching-API-name assumption (and explicitly decide whether owner names containing
the observed suffix are allowed as authored API references), or authorize a
separately evidenced name-only owner identity contract for this family despite
the exposed API name. The first option needs a narrow discriminated/versioned
artifact correction, fresh retrieval-derived identity and explicit rejection of
old arbitrary-logicalName documents; never silently migrate by equating them to
labels or stripping suffixes. The second needs an explicit semantic exception
and bounded complete inventory/unique compatible match qualification. These are
alternative decisions, not implemented recommendations to choose silently.
No evidence currently justifies applying either automatically under the simultaneous
no-generated-suffix-persistence and API-first constraints.

## Actual operations, verification boundary and next resume

Prior worker transcript records source headless discover/describe/readonly
Organization verification, API67 list/get exploration and an interrupted native
CLI request construction. Recovery summary also records source MCP binding.
This continuation independently queried the explicit CLI alias mcnext-sdo:
Organization Id matched the expected source. Persistent project's declared
API65/force-app configuration was inspected and preserved. Its git status belongs
to the dirty workspace root, not a separate clean validation-project repository;
no project edits occurred. Operation schemas/local reference and existing IR DB
lifecycle evidence were inspected. No new resource list/detail probe, fixture,
mutation, target call or permission/inventory-completeness qualification was
performed by this continuation. No fresh live evidence subject is manufactured
from schema metadata or synthetic tests; historical API observations retain scope.
The earlier schema lookups/alias query do not constitute live resolver acceptance.

Only this handover changes. No production/test behavior changed, therefore no new
behavior regression is claimed or required for this documentation-only checkpoint.
Fresh explicit build, zero-warning lint, full tests and normal unchanged hooks
remain required before checkpoint preservation; exact counts/timings/hash/push
are reported in the worker return, never presumed here. Every shell/test entry
checks actual Node os.tmpdir/TEMP/nonempty TMP/TMPDIR against absolute normalized
F:/Temp with process-only repair/recheck. No new scratch or recursive deletion
was authored. No install, release, version/tag, root file/index/history change.

Next owner starts at the identity decision above, then narrowly corrects
`src/artifacts/identity-resolution-document.ts` and retrieval/projection callers
before implementing a family resolver. Add regressions for explicit old-shape
refusal, differing target IDs, missing/ambiguous/incompatible owner, malformed or
incomplete inventory/pagination, exact default space and no source-ID/suffix
replay. Keep command/API-auto integration separate. CREATE remains blocked.
Revised input-binder live acceptance, actual plugin source/cross-org IR update/
readback/zero-mutation acceptance, broader matching/reconciliation/source precedence,
Segment setup/create blockers, CI expression/no-op, DLO/broader DMO gaps and Graph
VALUE cleanup debt below are unchanged. This is NOT family/Chunk D/roadmap completion.

Propagation assessment: internal sf-plugin-data handover only; no public capability
or artifact change, no workspace consumers/language/LSP/hover/wiki/mcdev/CMS/site
update. Public docs/aggregate propagation table remain coordinator-owned. Changed
folder sf-plugin-data yes, current package version 0.1.0, next unassigned; no release.

# Chunk D IR safe files/input/Git checkpoint — 2026-10-28

Reconciled fetched baseline `8122f35179102045c9a2971afc3bfe6176ec3b06`,
clean/pushed and equal to origin/main before this checkpoint (750 prior tests).
Existing plan/review reused; one coupled filesystem/selection owner, no nested
workers. Coordinator retains whole-feature review, public docs and final DB
rebuild/validate/gaps. No live org calls, DB writes, installation or release.

## Exact interfaces and boundary

- `writeIdentityResolutionDocument(value: unknown, projectRoot: string,
  overwrite: boolean, publish = {link, rename, unlink})` returns
  `{path, outcome: 'retrieved' | 'unchanged'}`. Uses strict complete portable IR
  validation and configured/default package root, publishing
  `<package>/main/default/data360/identityResolution/<logicalName>.identityResolution.json`.
  The final optional seam exists for synthetic I/O failures, not CLI configuration.
  Byte-identical output is untouched; differing bytes require overwrite. Ancestor
  links/aliases, hardlinks, nonregular files, unsafe roots and package escapes
  fail closed. Bounded handle/path byte checks precede publication; complete
  flushed staging has an unguessable ownership marker under verified OS temp.
  Existing output uses atomic rename; new output uses link then exact staging-entry
  unlink. Final single-link bytes are revalidated; post-publication failures report
  `PARTIAL_IDENTITY_RESOLUTION_OUTPUT`. No recursive cleanup. Checks narrow races,
  not a filesystem transaction or protection against hostile concurrent replacement.
- `DeployInput` now additionally admits `IdentityResolutionDeployInput =
  {path, document: IdentityResolutionDocument, inputDigest}`. IR paths must have
  exact suffix/layout and matching logical filename; `identity-resolution:Name`
  resolves configured/default package selection. Strict duplicate-key UTF-8 JSON,
  no-link/single-link bounded reads, case-insensitive duplicate identity refusal,
  recursive document freeze and SHA256 of exact original bytes apply. Repeated
  exact selection coalesces. `verifyIdentityResolutionInputDigest(input)` and
  `captureDeployInputDigest(input)` re-admit unchanged bytes/content.
- `GitDeploySelection.identityResolutions?` adds frozen IR admissions without
  changing existing DMO/Segment receipt fields. Committed/index/worktree/untracked
  exact members bind digest; noncanonical IR suffix matches, deletions, inferred
  renames/copies and duplicate identities cannot silently disappear. Existing
  ambiguous untracked-addition plus tracked-deletion guard also covers IR.
- `SupportedDeployInput` / `isSupportedDeployInput` retain the existing executable
  DMO/Segment union. Public deploy refuses any admitted or Git-captured IR before
  target/service reads (`IDENTITY_RESOLUTION_ROUTE_UNSUPPORTED`), including when
  an older resolver drops captured IR. Retrieve explicitly refuses IR selectors
  before org resolution. No public IR executor, retrieval route or API-auto added.

## Verification and precise next checkpoint

Scoped ESLint autofix, explicit build, full zero-warning lint passed. New synthetic
file/writer/Git/command suite: 17/17; full npm test: 767/767, zero failures/skips/
cancellations, runner 115899.4678ms; npm test end-to-end 119.4262563s. Combined
scoped autofix/build/focused/lint/full verification wall 148.4238844s. Normal
unchanged commit hooks and push receipts are reported in the worker return.
Synthetic tests are NOT live qualification. Every shell/test entry uses the
existing absolute-normalized TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR check
against F:/Temp. Only new marker-owned OS-temp fixtures/staging were created;
no recursive cleanup or persistent project changes. One initial synthetic Git
fixture attempted a redundant commit; fixed with explicit fixture allow-empty.

Next command/API-auto slice must first resolve **logical owner target binding**:
the strict portable identity carries only `{dataSpace, logicalName}` while current
runtime acquisition/execution needs exact `targetApiName` (observed generated
`Individual_<suffix>`). No qualified reversible mapping is encoded. Do NOT derive
or persist a generated suffix, runtime/source ID or target name from logicalName.
Freeze an explicit safe identity/binding design before command wiring, then add
complete-selection routing/effects/per-operation auto versions and fresh target
binding/readback tests. Private poll-recorder wiring is still separate.

Revised input binder live acceptance remains UNPROVED despite the preceding
synthetic Lookup fix; original output-helper/cleanup evidence retains its scope.
IR CREATE absence/conflict, broader match/reconciliation/source precedence,
actual source/cross-org plugin retrieve/update/readback/zero-mutation acceptance
remain open. Existing Graph VALUE deletion/cleanup debt and all historical
blockers below remain unresolved. This is NOT IR-family, Chunk D or roadmap
completion. No release/version assignment: sf-plugin-data remains 0.1.0.
Propagation: internal sf-plugin-data only, no workspace consumers; no language,
LSP/hover, mcdev/wiki, CMS or site changes. Public docs and required aggregate
propagation/version tables remain coordinator-owned.

# Chunk D narrow IR Lookup attribute-bag fix — 2026-10-28

Fetched clean/pushed baseline `41b3530ab8149203ad090558a19011a82c0b0d87`,
exactly equal to origin/main. Existing plan/review reused; one small coupled
binder/test slice, no nested workers. Coordinator owns whole-feature review,
public documentation and final DB rebuild/validate/gaps. No live operations,
receipt replay, writer/command integration, install, release or root changes.

## Exact fix and evidence boundary

`compatible()` input primary-key enumeration now skips a Metadata field ONLY
when its type is exactly `Lookup` and it has no own
`mktDataModelFieldAttributes` property. This matches the independently observed
relationship inventory described by
`data360:ir.metadata-binding-qualification.api65-67`; it is not a blanket optional
attribute bag. A present Lookup bag still passes through `record()`, so null,
undefined, arrays and primitives fail closed. A present Lookup primary order
still participates in uniqueness checking. Missing bags on required/unrelated
Text, unknown and omitted types still fail closed. Required exact names,
explicit default spaces, Text Id/match fields, unique string primary order '1',
REST key flag when present, field/target-ID uniqueness, output creation types,
request bounds and fresh fingerprints are unchanged. No source/type/space/key
coercion or fabricated default was introduced.

Fifteen new synthetic regressions cover two omitted-bag relationships before
and after required fields across all six reads with explicit REST primary flag,
stable fingerprints, missing Text/unknown/omitted-type bags, six malformed
present Lookup bags, duplicate Text/Lookup primary evidence and numeric primary
order rejection. These are synthetic offline regressions, NOT live revised-helper
acceptance. The optional private 18-pair receipts were not opened or replayed;
no secrets/customer data or receipt payloads were copied into the repository.

## Verification and next coherent slice

Scoped ESLint autofix, explicit build and full zero-warning lint passed. Focused
binder suite 48/48 passed (runner 937.4605ms); full npm test 750/750 passed with
zero failures/skips/cancellations (runner 112977.191ms, end-to-end npm test wall
116.5049267s). Full verification command including autofix/build/focused/lint/test
completed in 134.640s. Normal unchanged checkpoint hook/commit/push receipts are
reported in the worker return. Every shell/test entry uses the existing absolute-normalized
TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR checker, process-only repair and
recheck against F:/Temp. Initial inline shell preflight quoting failed before
Git or workloads; corrected by using the existing checker. No scratch creation
or recursive deletion was authored.

Next slice remains safe IR file writer/read-input/Git selection using the
existing complete portable document validator: preserve exact bytes/overwrite
and selection safeguards; no command/executor integration until that boundary
is independently verified. Explicit logical-name-to-target owner binding,
commands/effects/API-auto and private poll recorder wiring remain separate.
Revised input-helper live acceptance is still unproven; previous output-helper
live evidence and owner cleanup evidence retain their original scope. IR CREATE
absence/conflict, broader matching/reconciliation/source precedence and actual
source/cross-org plugin retrieve/update/readback/zero-mutation acceptance remain
open. This fix is NOT IR-family, Chunk D or roadmap completion.

Propagation assessment: sf-plugin-data internal binder/tests and this handover
only; version 0.1.0 unchanged, next version unassigned, no release. No language,
LSP, hover, wiki, mcdev, CMS or workspace consumer updates. Public README/reference
propagation and the final required aggregate tables remain coordinator-owned.
Historical entries below are preserved, including the original binder failure.

# Chunk D live IR Metadata binding qualification — 2026-10-28

Fetched clean/pushed baseline `6206f26b41047bd6ea91146cbaeaf365aa5f68cd`.
Existing plan/review reused; one bounded source-only qualification worker, no
nested workers. Coordinator retains whole-feature review/public docs/final DB
rebuild/validate/gaps. This checkpoint preserves a precise input-binding blocker;
NOT IR-family, cross-org, public-command or installed-plugin acceptance.

## Actual helper results and independent schema

Source MCP discover/describe/Organization identity, explicit CLI alias and core
org binding matched the expected source before writes. Persistent validation
project configuration/status inspected, no project edits. DB find/show before
probes. One newly owned Individual/default fixture, automatic=false, published
asynchronously; two independent publication polls PUBLISHING then PUBLISHED.
No update/run/explicit publish/target operation or historical fixture adoption.

Actual exported helpers from committed baseline invoked with real guarded API65
REST plus CustomObject Metadata acquisitions (not fabricated attribute fixtures):

- `bindIdentityResolutionDependencies` failed closed with
  `IDENTITY_RESOLUTION_BINDING_UNQUALIFIED` on its first Individual pair.
  `compatible()` scans EVERY Metadata field for primary key and calls
  `record(field.mktDataModelFieldAttributes)`; independently observed relationship
  Lookup fields omit that attribute bag. Required Id itself has explicit Text and
  string `primaryIndexOrder: '1'`; no missing-space/key/type default is needed.
  All six input pairs were independently inspected despite helper short-circuit.
- `verifyIdentityResolutionOutputs` PASSED all twelve private target bindings,
  including independent initial/final facade/native owner acquisitions and full
  owner projection equality. Names came only from this owner's ordered outputs.
  Each exact REST name/Metadata fullName/default space and distinct ID checked.
  Unified REST/Metadata creationType Derived, Text ssot__Id__c in both; link
  creationType Bridge, Text UnifiedRecordId__c in both. No link key/foreign-key
  semantics inferred. Generated Metadata has primaryIndexOrder string 1 on
  unified Id; this is observed, not an extra output-helper requirement.

Six input REST/Metadata creationType Standard and dataSpaceName default; unique
Metadata primaryIndexOrder string 1 on Text ssot__Id__c, REST isPrimaryKey true.
Individual FirstName/LastName and Email EmailAddress are Text in both. Input
REST/Metadata field counts, in fixed six-entity order: 146/163 initially
(Individual fresh helper read 146/164 after publication), 38/45, 47/58, 55/71,
39/50, 23/29. Inventories need not be equal: Metadata includes relationships.
Generated unified counts in the same order: 19/19, 8/9, 8/9, 15/16, 10/11, 6/7;
link counts: 9/10 then five 8/9. Metadata attribute keys on generated records:
creationType, dataModelTaxonomy, dataSpaceName, isEnabled, isSegmentable,
isUsedForMetrics, labelOverride, masterLabel, objectCategory, referenceEntityName.
Metadata booleans are strings; space/type/creation values need no normalization.
Input primary order is a string; do not coerce absent/malformed key evidence.

No production code/test change or safety-check weakening applied. Narrow next
fix: qualify absent attribute bags specifically on observed relationship Lookup
fields, preserving required Id/match proof, malformed-bag rejection, duplicate
field/key ambiguity and explicit space/type/creation safeguards. Add synthetic
mixed scalar/relationship regressions and full verification before using the
binder. Writer/commands remain blocked on this compatibility fix plus existing
safe file/input/Git/logical-target/effects/API-auto integration work.

## Budget, cleanup and evidence

Precreate ceiling: 35min, one create, zero updates, one exact qualified delete,
90 logical nonpoll reads, 200 underlying reservation, 24 polls. Setup/pairs/helper
owner doublechecks/fresh-repeat reserve/cleanup calculated before create; actual
live 2026-10-28T06:01:11.269Z to 06:08:50.970Z = 459.701s (7m40s).
59 counted nonpoll service reads plus two external identity/setup units, five
polls, 66 observed service wire requests. Auth/discovery internals not claimed
an exact wire count; additional 40-request reserve retained, below 200.
Actual one create/zero updates/one delete. Per-call raw receipts persisted before
classification; every poll records presence/type/value/exact identity/errors.
No retry/replay after unknown, no separately generated deletes.

Fresh exact id/name/label/automatic=false/PUBLISHED guard before owner deletion.
One delete success; two DELETING polls then facade explicit notfound. Independent
native owner plus all twelve captured generated outputs: HTTP404 ITEM_NOT_FOUND
by 06:08:50.970Z. Transport's public REQUEST_FAILED omitted statusCode, so private
wire/error receipts independently corroborated all thirteen 404s; not a generic
error-as-absence assertion. Exact definitions missing-or-inaccessible only, NOT
physical/profile/storage/global cleanup or credit accounting proof. No known
readable owned fixture retained; scratch retained without recursive deletion.

Sanitized distinct atomic subject:
`data360:ir.metadata-binding-qualification.api65-67`, status partial, strict
subject validator passed. API65 REST/Metadata and API67 facade, actual helper
revision/invocation, independent readback/effects/cleanup recorded. Root fetched
before DB edit: ahead5/not behind; unrelated staged files/index/tests preserved.
No shared index rebuild or root history/push. No install/release/version bump.
Normal package verification/hook receipts follow in worker return.
Propagation: package handover and root evidence only, version 0.1.0 unchanged;
no language/LSP/hover/wiki/mcdev/CMS/workspace consumer updates. Public reference
and whole-feature review remain coordinator-owned. Earlier checkpoint claims
below retain historical scope.

# Chunk D production IR dependency/output binding checkpoint — 2026-10-28

Baseline `143a0ec7cd8a1545cc20447ac1537e69c2b2377a` fetched clean and equal to
origin/main; no ahead history or unrelated package work. Existing plan/review gates
remain closed; one coherent family-local worker, no nested workers. Coordinator
retains whole-feature review, public docs and final DB rebuild/validate/gaps.
No live org calls/writes, historical fixture adoption, DB edits/index rebuild,
commands/writer/Git-selection/API-auto integration, installs, releases or root push.
This is NOT IR-family, Chunk D, cross-org or roadmap completion.

## Exact production interfaces and conservative scope

`src/services/bind-identity-resolution-dependencies.ts` exports:

- `bindIdentityResolutionDependencies(value:unknown,
  connection:IdentityResolutionTargetConnection,selection:ApiVersionSelection,
  dataSpace:string,acquire?:(name:string)=>Promise<{detail:unknown;metadata:unknown}>)
  :Promise<{fingerprint:string}>`. Validate the complete portable document, then
  freshly read all six exact reconciliation input names, bounded to six REST plus
  six Metadata reads per invocation. No source IDs, list/first-match/name fallback,
  cache or dependency creation. Require explicit normalized `default` on caller,
  detail and Metadata; missing/case-altered/other space blocks, never defaults.
- Inputs require exact detail.name/Metadata.fullName, nonempty distinct target IDs,
  unique bounded field inventories (1..4096 each), Text match fields in both reads,
  and an explicit unique Metadata primaryIndexOrder='1' on Text ssot__Id__c.
  REST isPrimaryKey, when present, must be true. All six input Id fields must be
  Text; only Individual FirstName/LastName and ContactPointEmail EmailAddress are
  match-field requirements. No other input schema/foreign-key semantics invented.
- Fingerprint is SHA256 of fixed logical-entity order plus target-local IDs,
  exact required Text fields and explicit key; unrelated field ordering does not
  change it. Fresh acquisition each callback; executor compares fingerprints
  across admission/pre-dispatch/settlement. This is required compatibility only,
  NOT a complete DMO schema/relationship fingerprint or cross-org acceptance.
- `verifyIdentityResolutionOutputs(owner,outputs,connection,selection,acquire?,
  acquireOwner?=retrieveIdentityResolution):Promise<IdentityResolutionOutputBinding[]>`
  exactly matches the executor callback. Owner is explicit target API name/ID/
  default space. Outputs are the ordered 12 logical owner+space+entity+role and
  targetApiName mappings. Independently reacquire facade/native PUBLISHED owner,
  re-project the strict full variant, require exact ID and complete ordered mapping,
  then read only those owner-returned names. Verify exact DMO names/default space,
  distinct target IDs, REST AND Metadata Derived(unified)/Bridge(link), and Text
  ssot__Id__c(unified)/UnifiedRecordId__c(link) in BOTH reads. Return only private
  target identity/creationType/qualified fields. No guessed suffix/generated names,
  source-name replay, independently provisioned/deleted outputs or broader schema.
  Reacquire and deeply compare complete owner again AFTER all twelve DMO reads.
  Bounds: two owner acquisitions (four HTTP reads), twelve detail and twelve
  Metadata reads. This bounds requests, not network wall-clock cancellation.
- Default REST uses guarded ConnectClient API65. Default Metadata uses existing
  guarded readDmoMetadata with operation-local version='65.0' and disabled refresh;
  installed JSforce SOAP endpoint reads receiver.version. The command-owned API67
  connection, Metadata._conn, transport and refresh delegate remain unchanged.
  Existing transport redirect refusal/maxRetries=0 is preserved.

Executor and preflight now default to these concrete fresh helpers; injectable
seams remain. Explicit invalid nonfunction executor callbacks still block.
Preflight passes its supplied callback or the concrete dependency binder. Neither
omission nor unavailable Metadata can become a permissive no-op. Input byte guard,
update processing acknowledgement and private poll recorder remain required;
CREATE still has no admitted absence/conflict route.

## Evidence limitation and exact small read-only checkpoint

DB find/show and the existing IR lifecycle subject were read before implementation.
Historical qualification proves the twelve REST role-specific required fields and
creation types, not complete generated schemas or their Metadata representations.
No new live qualification is claimed and no DB row is manufactured from tests.
The implementation is the defensible fail-closed intersection: unknown/omitted
Metadata space/type/creation/key attributes block. It does NOT assert those
attributes are populated for every real IR output/input. No undocumented link
keys, foreign keys, extra match fields or generated-field lists are assumed.

Before live acceptance needs this subset, the narrow checkpoint is read-only:
DB lookup first; verify actual MCP source org binding to plan source project;
read API65 detail plus CustomObject Metadata for the six exact existing logical
inputs to confirm Text match/Id and explicit primary key representation. For a
separately owned and independently PUBLISHED target owner supplied by acceptance,
read its exact owner mappings and API65 detail plus CustomObject Metadata for
those twelve outputs; confirm exact names, default space, role creation types and
only the two role-required Text fields. No write/new fixture is authorized in
this slice; do not resurrect deleted historical owners or adopt fixture ownership.
If no independently owned readable owner exists, output live acceptance stays
blocked pending separately scoped acceptance provisioning, not schema invention.

## Verification and remaining integration

New `test/identity-resolution-bindings.test.mjs` has 33 synthetic regressions:
source/target identity separation, stable fresh fingerprints, field/key/space/type
mismatch, duplicate/missing/ambiguous Metadata and fields, field/request bounds,
owner mapping/order/ID drift, target output creation types, duplicate target IDs,
no suffix/source replay, no permissive defaults, and installed-core API65 SOAP/
REST receiver/refresh/redirect invariants. Existing preflight test now asserts
missing callback invokes an independent GET, not the old callback-gap behavior.
Scoped autofix, explicit build, focused 82 tests and full zero-warning lint passed.
Full stable-tree npm test passed 735/735, zero failures/skips/cancellations;
runner 113316.2737ms, npm test wall 117.15894s, combined verification 133.361s.
Normal-hook/checkpoint receipts are in worker return.
Every shell entry checks TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR against
absolute normalized F:/Temp, process-only repair/recheck. No scratch/deletion authored.

Remaining: safe writer/read-input/Git selection, explicit logical-name-to-target
owner binding, commands/effects/API-auto, private recorder instrumentation, source
and cross-org actual plugin retrieval/update/readback/zero-mutation acceptance.
Existing family blockers remain: IR CREATE absence/conflict qualification, broader
matching/reconciliation/source precedence; Segment setup-state/raw-evidence and
create permission/shell blockers; CI expression/no-op, DLO operational/broader DMO.
Graph VALUE debt unchanged: `GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm` was
readable at checkpoint D; no direct generated-DMO cleanup authority or eventual/
physical cleanup claim. All historical blockers/ledgers below remain preserved.

Propagation: sf-plugin-data internal services/tests/handover only, version 0.1.0
unchanged, next version unassigned, no release. Public docs/guide remain coordinator
owned; no workspace consumers/language/LSP/hover/wiki/mcdev/CMS updates needed.
Earlier no-production-verifier statements below describe historical checkpoints.

# Chunk D bounded existing-target IR EXECUTOR checkpoint — 2026-10-28

Baseline `4ee243218c3c23dd5265999a480cdc0a76bbb899` fetched equal to
origin/main; no prior ahead commits or unrelated package edits. Existing plan and
review reused, Gate3 remains one bounded executor/test owner; coordinator retains
once-whole-feature Gate4, public documentation and final DB rebuild/validate/gaps.
This is NOT IR-family, Chunk D, cross-org or roadmap completion. No org calls,
command/writer/Git-selection/API-auto integration, installs, DB edits or release.

## Executor interface and required proofs

New `src/services/execute-identity-resolution-deploy.ts` exports:

- `executeIdentityResolutionDeploy(value:unknown,
  connection:IdentityResolutionTargetConnection,apiVersion:ApiVersionSelection,
  dataSpace:string,options:IdentityResolutionExecutionOptions):
  Promise<IdentityResolutionDeployExecution>`.
- Options require `targetApiName:string`, `allowProcessing:boolean`,
  `verifyInput:()=>Promise<void>`. Required runtime callbacks (optional in the
  type only to support fail-closed invocation) are `verifyDependencies` and
  `verifyOutputs`; no production implementation or silent no-op exists.
- `verifyDependencies(document,connection,selection,dataSpace)` must independently
  verify fresh compatible target input DMOs/fields each time and return
  `Promise<{fingerprint:string}>`. Nonempty stable fingerprint is compared across
  preflight, pre-dispatch and settled boundaries; changed proof blocks/fails.
- `verifyOutputs(owner,outputs,connection,selection)` returns
  `Promise<IdentityResolutionOutputBinding[]>`. Owner is
  `{targetApiName,targetId,dataSpace:'default'}`; ordered requested outputs are
  `{identity:IdentityResolutionOutputIdentity,targetApiName:string}[]`, from
  target-owned PUBLISHED reconciliation names, never source guesses. Each proof
  is `{identity,targetApiName,targetId,creationType:'Derived'|'Bridge',
  fields:Array<{apiName:string,dataType:'Text'}>}`. Exactly 12 ordered bindings,
  distinct nonempty IDs, exact names/owner+space+entity+role and role-specific
  creation types/required Text fields are enforced. Unified requires
  `ssot__Id__c`; link requires `UnifiedRecordId__c`. Callback must independently
  inspect target definitions and exact default space; returned proof is not
  itself evidence of live field qualification. Proof remains stable before and
  after update. Generated objects are never directly provisioned/deleted.
- Update additionally requires private `recordPoll(evidence):Promise<void>`.
  Evidence is `{attempt,timestamp,statusPresent,statusType,statusValue}`;
  classification occurs AFTER awaited recorder, even for missing/unknown values.
  If frozen McpExecuteClient rejects an invalid response before returning a body,
  executor records status as unavailable (`statusPresent:false`,
  `statusType:'unavailable'`, `statusValue:undefined`), never fabricates raw status
  proof. Raw wire-status recording before transport rejection requires later
  integration-owned transport instrumentation; shared transport is unchanged.
- Synthetic seams: `acquire?:typeof retrieveIdentityResolution`,
  `readFacade?:(targetApiName:string)=>Promise<unknown>`,
  `readNative?:(targetApiName:string)=>Promise<unknown>`,
  `mutate?:(parameters:unknown)=>Promise<unknown>`, `now?:()=>number`,
  `delay?:(milliseconds:number)=>Promise<void>`. Callbacks/routing/options and
  desired document are captured before asynchronous work.
- `identityResolutionPollBudget` is frozen at 12 facade reads, 1000ms between
  reads and 120000ms elapsed deadline. Awaited I/O is not forcibly cancelled;
  completion after deadline cannot succeed. Independent native API65 full owner
  read follows facade PUBLISHED; native omission of filters:[] only is admitted.
- Public result: `{family:'identity-resolution',route:{apiVersion:'67.0',
  operation:'d360_ir_update'},outcome:'unchanged'|'blocked'|'updated'|'failed',
  mutation:'not-attempted'|'confirmed-updated'|'unknown',diagnostics}`. No raw
  owner/output identities, payloads or exception text enter public results.

Equality needs neither acknowledgement nor recorder and performs zero mutations,
publication/run calls or Metadata jobs, while still requiring fresh dependency
and output proof. Only existing fully correlated PUBLISHED targets qualify;
CREATE always blocks. Only Individual LastUpdated -> MostFrequent is admitted,
with all six ordered reconciliation entries, matching/labels/description and
automatic=false preserved. Actual frozen wire input has ONE Individual rule,
complete nested matching and preserved labels/description/automatic=false, as
qualification requires; six generated entries are verified in complete readback,
not sent as generated source names. Explicit `allowProcessing:true` acknowledges
publication and generated-output provisioning even with automatic=false.

Fresh preflight/input/dependency/output checks plus final exact target acquisition
precede dispatch. Exactly one allowlisted update attempt; 401, network, nested201,
malformed echo, polling/deadline/readback/verification errors retain mutation
uncertainty, without retry/replay/rollback. Echo is never settlement evidence.

## Verification and exact remaining slice

Synthetic tests in `test/execute-identity-resolution-deploy.test.mjs` exercise
zero-write equality/ack failures, missing verifiers, exact payload, input/version/
dependency/owner/output drift, actual core-authenticated 401/network/nested201
single-attempt transport, finite PUBLISHING polling and successful transition,
recorder-before-classification, unavailable status, native/full six-rule/matching
mismatch, required output fields/types/roles/names/distinct IDs and failures.
Final scoped autofix, explicit build, full zero-warning lint, 40 focused tests
and full npm test passed on stable final source/tests: 702 passed, zero failed,
skipped or cancelled; runner 114110.5443ms, full npm test wall 117.560s,
combined verification 133.769s. Normal unchanged-hook receipts and exact commit/
push are reported in the worker return. Initial 696-test run was superseded by
this fresh full run after adding six output/transition regressions. Every shell/test entry validates TEMP/actual Node os.tmpdir and
nonempty TMP/TMPDIR against absolute normalized F:/Temp; only process-local repair.
No scratch or recursive deletion authored.

Next bounded slice is PRODUCTION BINDING ONLY: implement independently fresh
input-DMO/field compatibility and stable fingerprint, and target-owned output
lookup/field/type proof callbacks. Inspect exact definition contracts and fail
closed on missing/ambiguous/default-space mismatch; do not infer qualification
from these synthetic tests. Separately integrate safe writer/read-input/Git,
logical-to-target owner binding, commands/effects/API-auto routing and private
recording. Later actual plugin source and cross-org acceptance must prove
retrieve/update/readback/zero-write repeat. CREATE still needs separately
qualified absence/conflict/binding evidence.

Graph VALUE cleanup debt remains unchanged:
`GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm` was readable at checkpoint D;
no direct generated-DMO cleanup authority or physical/eventual cleanup claim.
Segment setup-state/raw-evidence and create permission/shell blockers, CI
expression/no-op limitations, DLO operational/broader DMO gaps remain unchanged.

Propagation: sf-plugin-data internal executor/tests/handover only; version 0.1.0
unchanged, next version unassigned, no release. Public README/capabilities/
artifact/Git docs and sfmc.guide remain coordinator-owned. No language data/LSP,
hover/wiki/site listing/mcdev/CMS/downstream updates needed. Earlier checkpoints
below are historical, not current executor absence claims.

# Chunk D existing-target IR PREFLIGHT-ONLY checkpoint — 2026-10-28

Baseline `f046d1de183f22f04d00cd96ae3517c345c0f1d7` fetched equal to
origin/main; no preexisting tracked changes or ahead commits. Existing Gate1/2
remain closed; Gate3 uses the explicitly permitted coherent preflight-only split.
One owner, no nested workers. Coordinator retains once-whole-feature Gate4,
public documentation propagation and final DB rebuild/validate/gaps. This is NOT
executor, IR-family, Chunk D or roadmap completion. No live calls/mutations,
installs, release/version/tag, shared transport, commands, writer or DB edits.

## Exact new exported interface

`src/services/preflight-identity-resolution-deploy.ts` exports:

- `IdentityResolutionTargetConnection = Pick<Connection,
  'instanceUrl'|'request'|'getApiVersion'>`.
- `IdentityResolutionPreflightOptions = {targetApiName:string,
  verifyDependencies?:(document:IdentityResolutionDocument,
  connection:IdentityResolutionTargetConnection,apiVersion:ApiVersionSelection,
  dataSpace:string)=>Promise<void>, acquire?:typeof retrieveIdentityResolution}`.
  Although optional in the options type for fail-closed callers, the dependency
  verifier is REQUIRED at runtime. No verifier means blocked before reads. It must
  independently verify fresh exact target logical input-DMO/field compatibility;
  production binder remains unimplemented/unqualified, not supplied as a no-op.
- `preflightIdentityResolutionDeploy(value:unknown,
  connection:IdentityResolutionTargetConnection,apiVersion:ApiVersionSelection,
  dataSpace:string,options:IdentityResolutionPreflightOptions):
  Promise<IdentityResolutionDeployPreview>`.
- Preview is `{family:'identity-resolution',
  outcome:'update'|'unchanged'|'blocked-changes'|'blocked',
  target:'present'|'unknown',absenceProof:'none',
  route:{apiVersion:'67.0',operation:'d360_ir_update'},
  requiredEffects:Array<'publication'|'generated-output-provisioning'>,
  diagnostics:Array<{code:string,message:string}>}`. No raw expectations or
  target IDs/names/payloads escape. Preview is NOT execution authorization.

Validate/detach complete document before reads; explicit numeric API67 selection,
matching connection and default space only. Exact target `Individual_` plus four
alphanumeric characters is separately supplied, never inferred from logicalName.
Snapshot routing/options across awaits. Fresh injected dependency verification
runs on every call, even equality; then independently acquire full facade/native
representations through the existing service. Re-project both complete raw reads,
validate candidate/identity and all 12 ordered owner/entity/role output bindings.
Only native omission of facade filters:[] is qualified. Unknown/malformed/error,
non-PUBLISHED, missing candidate/expectations, output divergence or verifier
failure block with payload-free diagnostics. Missing/unreadable is NEVER absence;
CREATE has no admitted path.

Complete ordered portable equality yields unchanged with no effects and ZERO
mutation calls. The sole admitted difference is Individual LastUpdated to
MostFrequent, preserving label/description, ordered matching/flags/automatic=false,
all six ordered reconciliation entries and logical generated-output semantics.
It reports both publication and generated-output-provisioning. Label/description
EDITS, reverse reconciliation and every other difference remain blocked: evidence
proves preservation, not their edit qualification. Generated-name correlation is
not independent output-DMO field/type qualification or completed target rebinding.

## Exact next bounded executor slice — NOT implemented

Start at `src/services/execute-identity-resolution-deploy.ts` and synthetic
`test/execute-identity-resolution-deploy.test.mjs`; consume the exact contracts
above and frozen McpExecuteClient, do not broaden shared transport.

1. Required injected immutable `verifyInput:()=>Promise<void>` and explicit
   `allowProcessing:boolean`; missing acknowledgement before ANY update, equality
   needs no acknowledgement and performs zero mutations. Revalidate captured
   input, fresh exact acquisition and independently compatible logical target
   dependencies immediately before dispatch; never trust preview/cache. Compare
   stable private target identity/generated baseline across these boundaries.
2. Map only the qualified complete wire payload: preserved label/description,
   automatic=false and complete nested ordered matches; reconciliation input has
   ONE Individual MostFrequent/ignore-empty rule as frozen transport/evidence
   require. Preserve and verify all SIX generated reconciliation entries in
   independent output, not by replaying generated names/IDs/suffixes in input.
3. One allowlisted `d360_ir_update` attempt only, never retry/replay/rollback.
   Mark uncertain attempts honestly. Explicit finite read-count/interval/deadline
   PUBLISHING polling; only PUBLISHED can advance, no inferred state aliases.
   Record private per-poll evidence safely BEFORE classification where needed;
   nested201/errors/unknown/malformed observations fail closed without raw leaks.
4. Independent settled facade/native full semantic readback, owner identity and
   all preserved fields must correlate, not merely echo/status. Rebind 12 target
   outputs by target owner/default space/reconciliation entity/unified-or-link
   role from settled owner-returned names, then independently verify required
   target definitions/fields/types. Do not claim this is qualified until evidence
   exists; never provision/delete generated DMOs independently.
5. Regressions: no-op0 mutations, missing ack0 writes, exact full wire payload and
   six-entry preservation, invalid input/version/nested errors, actual-core
   401/network no-replay, finite polling/error/unknown/full-readback mismatch,
   late byte/input/dependency/target drift. Full scoped autofix/build/lint0/tests
   over stable inputs, then normal-hook checkpoint under existing authorization.

Later separate integration owns safe file writer/read-input/Git selection,
explicit IR logical-name-to-target binding, existing retrieve/deploy command
routing/effects and API auto selection. Separate bounded live source and cross-org
plugin acceptance must prove actual retrieval/update/readback/zero-write repeat;
synthetic tests and historical API receipts are NOT those passes. CREATE remains
blocked until separate IR permission-aware absence/conflict/binding evidence;
never borrow Segment absence semantics. No field qualification is inferred.

## Verification, retained debt and propagation

New synthetic file `test/identity-resolution-preflight.test.mjs`: nine tests cover
repeated equality/no mutations, sole admitted delta/effects, refused edits,
input/version/scope guards, missing/unreadable/nested201 redaction, independent
full-raw/candidate/output mismatches, fresh verifier failures and async caller
input/options detachment. Scoped autofix, explicit build, focused nine tests,
full zero-warning lint and full npm test passed: 662 passed, zero failures,
skips or cancellations. Runner 113932.2902 ms; full npm test wall 117.443 seconds;
combined verification wall 131.152 seconds. Source/tests stayed unchanged during
verification; only this handover was then updated. Normal unchanged-hook counts,
wall-clock, checkpoint commit and push receipts appear in the worker return.
Every shell entry runs check-temporary.mjs, repairing only process-local env to
F:/Temp then rechecking when needed. No scratch or recursive deletion authored.

Graph generated VALUE debt is UNCHANGED: owner-generated
`GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm` remained readable in checkpoint D.
No new ownership/delete authority, no direct generated-DMO cleanup, eventual or
physical cleanup unknown. Segment A2 unexpected setup-state/raw-evidence gap and
create permission/shell blocker, CI meaningful expression/no-op limitation,
DLO operational and broader DMO/schema gaps remain as recorded below.

Changed folder sf-plugin-data, current package version 0.1.0 unchanged; new version
unassigned, internal checkpoint only, no release. Propagation: internal service,
tests and handover updated. Public README/capabilities/artifact/Git docs and guide
remain coordinator-owned (no public capability enabled); no language data/LSP/
hover/wiki/site/mcdev/CMS/downstream consumer update is required.

# Chunk D bounded IR document/acquisition checkpoint — 2026-10-28

Baseline `6a622a110251b5e73b64e3c809bff509475864ae` fetched equal to
origin/main; no preexisting tracked changes or ahead commits. Existing Gate1/2
reused; Gate3 is one bounded IR document/service/test owner. No nested workers,
org requests/writes, command integration, writer, preview, executor, installs,
release, shared transport/version edits, root history or DB/index edits. Coordinator
retains once-feature review and public documentation/propagation.

## Exact exported follow-on contracts

- `src/artifacts/identity-resolution-document.ts` exports
  `IdentityResolutionDocument`, `IdentityResolutionIdentity`,
  `IdentityResolutionDmoReference`, `IdentityResolutionFieldReference`,
  `IdentityResolutionOutputIdentity`, `IdentityResolutionProjection`,
  `IdentityResolutionError`, `identityResolutionName`,
  `validateIdentityResolutionDocument(value: unknown): IdentityResolutionDocument`,
  `serializeIdentityResolutionDocument(value: unknown): string`, and
  `projectIdentityResolution(facade: unknown, native: unknown, sourceApiName: string,
  logicalName: string): IdentityResolutionProjection`.
- Document v1 kind `identity-resolution` has identity `{dataSpace:'default',
  logicalName}`. Explicit authored logicalName is supplied separately from source
  objectApiName; it is never inferred from runtime suffixes. Spec preserves label,
  description, Individual configuration, automatic=false, isCaseSensitive=true,
  typed secondary DMO, filters=[], one labelled match rule with all three ordered
  typed parent/field references and matching flags, and all six ordered
  reconciliation entities with ruleType/ignore-empty/fields=[]/sources=[].
  Individual allows LastUpdated or MostFrequent; the five generated reconciliation
  entries remain LastUpdated. Every entity has unified/link output identities
  `{owner:{kind:'identity-resolution',dataSpace:'default',logicalName},
  entity:{kind:'dmo',dataSpace:'default',apiName},role:'unified'|'link'}`.
- Only observed response lower-case enum spellings are mapped to portable enum
  spellings. Full native API65 and facade API67 representations must compare
  deeply equal after removing facade filters:[] only. Exact keys/ordering/settings
  are validated; no invented defaults or omission normalization. Nonempty filters,
  fields, sources, unknown keys/meaningful structures, alternate criteria/order,
  duplicate or malformed generated names and missing values fail closed.
- Projection returns `{candidate, expectations:{facade,native,outputs}}` with
  detached complete private raw correlation baselines and 12 owner-returned
  `{identity,sourceApiName}` mappings. These expectations must NEVER be serialized
  as portable content. Serializer accepts only the complete validated document,
  emits stable pretty JSON plus LF, and rejects wrapper/private payloads. No owner
  source ID/name, ruleset suffix/status, generated name or raw receipt is placed in
  the document. Display label/description are preserved intentionally.
- `src/services/retrieve-identity-resolution.ts` exports
  `IdentityResolutionAcquisition` and
  `retrieveIdentityResolution(connection: Pick<Connection,
  'instanceUrl'|'request'|'getApiVersion'>, sourceApiName: string,
  logicalName: string, apiVersion: ApiVersionSelection, dataSpace: string):
  Promise<IdentityResolutionAcquisition>`.
  Selection and numeric connection must explicitly be API67/default; invalid scope
  throws payload-free INVALID_SCOPE before requests. Frozen McpExecuteClient reads
  `d360_ir_get` with `{identityResolution:sourceApiName}` at API67, then independently
  ConnectClient GETs the exact owner at API65. No runtime MCP-server dependency,
  fallback, retry, mutation or polling. Non-PUBLISHED blocks with
  IDENTITY_RESOLUTION_NOT_SETTLED; unsupported configuration blocks with
  UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION; other errors produce
  IDENTITY_RESOLUTION_ACQUISITION_FAILED. Blocked results contain identity/blockers
  only, never candidate or raw expectations. No 404/absence claim is made.

Source owner correlation is NOT independent generated-DMO field/type admission,
permission-aware target absence, target binding or cross-org acceptance. Follow-on
must independently inspect output definitions/fields/types and bind target outputs
after the target owner settles PUBLISHED; never infer suffixes or separately
provision/delete generated objects. Preview, complete comparison with explicit target
bindings, at-most-one qualified executor, effect acknowledgement, bounded settlement,
zero-mutation repeat instrumentation, safe file writer and common commands remain
unimplemented. No IR-family or roadmap completion claim.

## Evidence reconciliation and private retention ledger

Read subjects `data360:ir.lifecycle-qualification.api65-67` and
`data360:graph.qualification-checkpoint-d.api67` before implementation. The former
contains the full sanitized final shape, not just a shortened schema. It proves
ordered FirstName/Fuzzy, LastName/Exact, EmailAddress/ExactNormalized; automatic=false;
Individual LastUpdated -> MostFrequent with all five generated entries unchanged;
PUBLISHING -> PUBLISHED and independent facade/native equality except filters:[].
It proves API behavior only, not this plugin's live/cross-org/no-op acceptance.

Graph checkpoint D supersedes the older generalized cleanup expectation below:
creating -> ready and exact output correlation were observed, but ready is NOT
initial-transform success or edit eligibility. Projection update was not attempted;
complete comparison/update remains blocked (creationMode absent, source devName
generated). Exact owner delete independently succeeded. ID and fragment were
missing-or-inaccessible, but owner-generated VALUE DMO
`GraphDd23cf3b3eb6372_1793161702141_VALUE__dlm` remained readable at final observation.
This is a private retention ledger, not a new ownership grant. Do not directly
delete that DMO or shared state; eventual/physical cleanup is unknown. No fixture
identifier has been added to public user docs.

Verification: synthetic-only family tests cover qualified variants, private-output
separation, strict unsupported shapes, native divergence, nonsettlement, fixed
routes/version guards and nested errors. Scoped autofix, explicit build, full
zero-warning lint and standalone full npm test passed: 653 passed, zero
failed/skipped/cancelled (31 new IR tests), runner 112398.1134 ms, full npm test
wall-clock 116.210 seconds; combined verification shell 131.828 seconds. Normal
unchanged hook counts/wall-clock, checkpoint commit and push are recorded in the
worker return; no live evidence DB claims were added. Every shell entry uses existing check-temporary.mjs and
process-only F:/Temp repair/recheck; no scratch or recursive deletion authored.
Changed folder: sf-plugin-data, version 0.1.0 unchanged, next version unassigned.
Public README/capabilities/artifact/Git docs remain integration-owned because no
public capability was enabled. No language/LSP/hover/wiki/site/mcdev/CMS consumer
updates are needed; independent standalone package.

# Chunk C API67 facade transport checkpoint — 2026-10-28

Baseline `b7173083721b96c09f5347859fd69ddd8d33960e` fetched clean, equal to
origin/main, with no ahead history to accidentally publish. Existing plan/review
reused; one transport/test owner, no nested workers. No live mutations, installs,
release/tag, family documents/services/commands, shared DB/index edits or version
routing changes. Whole-feature review/public docs/combined DB remain coordinator-owned.

## Frozen internal interface

`src/transport/mcp-execute.ts` exports:

- `McpExecuteClient(connection: Pick<Connection, 'instanceUrl' | 'request'>,
selection: ApiVersionSelection)`; selection must be exactly requested `67.0`,
  restSelector `v67.0`, soapNumeric `67.0`. Default65, explicit65 and latest are
  rejected, never silently upgraded. Existing ConnectClient/API-version files untouched.
- `read(operation: McpReadOperation, parameters: unknown): Promise<Record<string, unknown>>`
  for only `d360_data_graph_get` and `d360_ir_get`; semantic reads use POST transport.
- `mutate(operation: McpMutationOperation, parameters: unknown): Promise<Record<string, unknown>>`
  for only CI create and Graph/IR create/update/delete. There is no arbitrary writable
  URL, arbitrary tool, run/publish/refresh, retry or network fallback API.

Both methods validate strict operation-specific keys and qualified nested shapes,
reject executable/accessor/cyclic/non-JSON inputs, serialize paramsJson once as a
string and send one core-authenticated POST to the fixed API67 endpoint. CI accepts
only default-space CalculatedMetric draft input; SQL is preserved, not rewritten or
qualified by transport. Graph accepts the recorded root-only ordered Id/FirstName
(optional third LastName) Text projections, seven-Day schedule, incremental=false,
DEFAULT/NONE; update requires editScheduleOnly=false. IR admits the recorded ordered
three matching criteria and one Individual reconciliation rule, automatic=false,
create LastUpdated/update MostFrequent; creation uses a four-character suffix.
These are internal transport subsets, not complete family/dependency/effects admission.

Per-call inherited core receiver masks refresh without modifying the connection.
Core's existing transport is wrapped per call only to inspect actual HTTP status
before core removes it: only HTTP200/201 can reach success parsing; redirects,
204/other statuses, malformed status and network failure fail closed. Core retains
credentials and JSON parsing; retry maxRetries=0 and redirect callback throws.
No-refresh/no-replay actual-core tests cover mutation and semantic-read 401/503/
disconnect. Errors reuse payload-free ConnectError; failures do not prove no effects.

The admitted direct-wire wrapper is strictly `{result: object}` (recorded core CI
receipt; documented facade result/error schema; fresh read-only MCP Graph/IR results
confirmed matching identity/state vocabulary). CLI `body/statusCode` and MCP
`defaultExc/responseCode` are separate adapters, deliberately NOT guessed wire
success variants. Unexpected wrappers, any outer error/hint/unknown key, nested
error/errors/errorCode/body/result or success:false fail closed. Delete requires
exact `{result:{success:true}}`. Other operations bind exact expected name, default
space and known observed status; Graph/IR also require a nonempty returned id.
Return is the validated application result, never settlement, ownership, permission,
configuration fidelity, absence or computation proof. Any future valid-but-unsupported
wrapper/state is a bounded evidence checkpoint, not permission to relax parsing.

## Verification and next seams

Synthetic test file `test/mcp-execute.test.mjs`: 59 new regressions, including all
nine operations, actual core transport counts, params string/bytes, semantic split,
version/origin guards, malformed/contradictory/missing outcomes and nested HTTP201
errors. Scoped ESLint autofix, explicit build, full zero-warning lint and standalone
full npm test passed: **622 passed, zero failed/skipped/cancelled**, runner
122435.4392 ms; combined autofix/build/lint/test shell 141189 ms. Normal unchanged
checkpoint hooks independently rerun lint/full tests/smoke; their final outcome,
commit and push are recorded in the worker return. All shell/test entries checked
TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR against F:/Temp. No scratch created
or recursively removed. No synthetic result is recorded as live/plugin acceptance.

Next Graph and IR workers may own their separate family document/service/test files
listed in Chunk D; neither edits this frozen shared transport or common commands.
One later integrator owns command/API auto routing and effect acknowledgement.
Graph eligibility/complete comparison/generated output correlation remain blocked
until separately qualified; IR settlement/complete no-op/generated binding likewise.
CI rejected aggregability-changing expression edit and meaningful expression/no-op
blockers below remain unchanged. All Segment source setup/acceptance/budget blockers
below are preserved. No full-product or cross-org completion claim.

Changed-folder bookkeeping: sf-plugin-data changed, current version 0.1.0, next
unassigned (internal unfinished checkpoint, no release). Propagation: internal
handover updated; README/capabilities/artifacts/Git/guide remain coordinator-owned,
with no public capability enabled. No language/catalog/LSP/hover/wiki/site listing,
mcdev, CMS or downstream consumer changes needed (independent CLI package).

# Chunk C independent CI qualification — AGGREGABILITY EDIT BLOCKED — 2026-10-28

Baseline `8cd6f55bf245925dcadcea0914f967232d4d4660` fetched clean and equal
to origin/main. Existing roadmap/Gates 1–2 reused; one bounded qualification and
handover owner, no implementation expansion or nested workers. Segment A remains
blocked exactly as recorded below; no Segment evidence subjects changed. Coordinator
retains whole-feature review, public documentation and shared DB rebuild/validation.

## Fixed scope and measured usage

Before mutation: 35-minute ceiling, one newly owned CI fixture, one create, two
PATCH attempts, one qualified exact delete, 40 logical nonpoll reads and 24 polls.
Actual precheck-to-cleanup: **163.671 seconds**, one create, two PATCH attempts
(publication success then expression rejection), one delete, 11 logical nonpoll
reads and two polls. Counts include one MCP identity query, actual standard CLI org
display, inventories, DMO detail, runtime details and Metadata read/list calls.
CLI/auth/MCP underlying wire traffic was not instrumented: these are logical
operations, not an exact underlying network count. No silent budget expansion.
Source MCP discover/describe and readonly Organization query, actual explicit-alias
CLI display (exit 0) and core AuthInfo independently matched the expected source.
Target untouched; persistent validation project inspected/preserved. TEMP, actual
Node os.tmpdir and nonempty TMP/TMPDIR checked against absolute normalized F:/Temp
at every shell entry. Private ownership marker/ledger/receipts retained under the
new run-owned OS-temp root; no recursive cleanup, global CLI edits or installs.

## Proven observations and exact blocker

One API67 POST `/ssot/mcp/execute`, `toolName:d360_ci_create`, with `paramsJson`
serialized once as a JSON string containing `input`, created the owned default-space
CalculatedMetric draft. Original SQL (preserved exactly, not a product rewrite):

```sql
SELECT APPROX_COUNT_DISTINCT(ssot__DeviceApplicationEngagement__dlm.ssot__DeviceId__c) AS device_count__c, ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c AS app_id__c FROM ssot__DeviceApplicationEngagement__dlm WHERE 1 = 0 GROUP BY ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c
```

Independent API65 detail GET and Metadata `readMetadata MktCalcInsightObjectDef`
matched owned identity (Metadata name without `__cio`), SQL, label and Custom type;
draft had empty dimensions/measures. No Metadata shell was predeployed. Exact
runtime and Metadata inventories had no owned-name conflict before creation.
HTTP status was not retained by the core client adapter; parsed result/error,
request route and independent readbacks were retained. Outer success alone was
never acceptance. Direct core-authenticated API calls are not plugin commands.

First API65 PATCH: `{displayName:'Owned CI C qualification',draft:false,
publishScheduleInterval:'SystemManaged'}`; expression/definitionType/schema omitted.
PROCESSING settled to ACTIVE on one independent poll, preserving exact SQL and
returning SYSTEM_MANAGED, IN_USE, Custom, CALCULATED_METRIC, default and isEnabled:true.
Description/subType/schedule bounds/status error were null. Complete bounded schema:

- Dimension: apiName app_id__c, creationType Custom, dataSource null, dataType Text,
  dateGranularity null, displayName app_id, fieldRole DIMENSION, formula
  `ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c`.
- Measure: apiName device_count__c, creationType Custom, dataSource null, dataType
  Number, displayName device_count, fieldAggregationType NONAGGREGATABLE, fieldRole
  MEASURE, formula
  `APPROX_COUNT_DISTINCT(ssot__DeviceApplicationEngagement__dlm.ssot__DeviceId__c)`.

Second and final API65 PATCH supplied the same displayName, exact SQL changed only
from `APPROX_COUNT_DISTINCT(...)` to `COUNT(...)`, and
`publishScheduleInterval:'NotScheduled'`; draft/definitionType/schema omitted.
It rejected with name/errorCode/data.errorCode **ENTITY_SAVE_ERROR**, message and
data.message (owned identity sanitized):

> CI <owned-ci> cannot be edited because the aggregability of measure device_count__c has changed. Expecting the measure to be non-aggregatable

No write replay or alternative SQL attempted. Independent API65 detail and Metadata
reads retained original SQL/label, full original dimension/measure schema and
SYSTEM_MANAGED (not requested COUNT/NOT_SCHEDULED). This proves the observed rejection
and retained definition, **not** general omission/atomicity, successful semantic edit
or complete no-op comparison. Subsequent lastRunStatus was PENDING with
lastRunDateTime/statusDateTime `2026-10-28T03:39:41.000Z`; no computation success or
materialized output proved. Pending work cannot be attributed to the rejected PATCH;
publication/empty-result SQL is not an inertness guarantee.

## Dependencies, comparison and cleanup

Exact prerequisite DMO GET confirmed enabled Standard ENGAGEMENT
`ssot__DeviceApplicationEngagement__dlm`; referenced DeviceId and SoftwareApplicationId
fields were mapped Text, with KQ_DeviceId/KQ_SoftwareApplicationId qualifiers. Shared
prerequisite was never changed. This is a simple single-DMO/no-alias/no-CTE/no-join
SQL shape, not arbitrary dependency discovery. Future extraction must preserve SQL
bytes, parse only admitted syntax and independently bind compatible target fields.
Owned CI dataSource attribution was null. A preexisting read-only CI's unchanged
SQL/formulas had sourceApiName attribution shift between the two referenced fields
across collection reads; never use that field alone as dependency identity.

For a future comparison, retain exact expression, identity/space, label, type,
creationType, enabled/description/subType, schedule/bounds and complete ordered
schema/roles/types/aggregability/formulas; keep volatile processing/last-run fields
separate. Do not silently discard unknown meaningful fields or normalize unstable
attribution without a qualified rule. This checkpoint does NOT establish a complete
successful-update/no-op contract. No CI plugin implementation or repeat deploy ran.

Cleanup freshly verified exact owned identity, ACTIVE state, original SQL, label,
Custom/CALCULATED_METRIC/default/SYSTEM_MANAGED before one qualified API65 DELETE.
Empty/undefined response at `03:40:25Z` was not terminal proof. Independent complete
runtime collection at `03:40:37Z` (count=total=1, nextPageToken/nextPageUrl null)
and Metadata inventory excluded owned identity; original shared CI remained with
stable definition. Exact runtime/Metadata fixture debt cleared. Generated/physical
storage, pending-work and credit cleanup remain unknown; no global-cleanup claim.
No intermediate DELETING sample was captured in this run; qualified async contract
was respected by independent settlement and no repeated DELETE.

Durable sanitized atomic subject:
`data360:ci.expression-update-qualification.api65-67` in the root verification DB.
Root fetched before distinct subject edit; unrelated dirty index/worktree preserved,
no shared-index rebuild/root history publication. Evidence uses live-api/api-behavior,
never plugin-acceptance. No validator/API_DISABLED retry or route/version sweep.

## Resume and verification boundary

Next fresh C implementation slice: narrow allowlisted API67 `mcp-execute.ts` facade
boundary, core auth/no refresh/retry/replay, exactly once paramsJson serialization,
strict supported wrapper/result identity validation and nested-error/unknown tests.
Do not enable the rejected aggregate-changing update, arbitrary SQL, native65 create
or zero-write repeat from this evidence. A same-aggregability meaningful edit would
need a separate bounded qualification decision; this error does not prove all SQL
edits impossible. Draft/label bounded routes remain historical qualified subsets.
No service/transport/source/test behavior changed here, so no new regression case;
full package build, zero-warning lint and full tests still apply to this handover
edit and are recorded in the checkpoint return. Distinct CI subject strict validator
returned zero errors; combined DB gaps scanned 482 entries with zero missing
entry/checklist fields (five existing language isConfirmed warnings). Combined DB
validate exits 1 due to unrelated SSJS dataWrites/reconciliation drift; no CI schema
error was reported. No unrelated DB repairs/index rebuild. Standalone verification passed: lint:fix,
full lint with zero warnings, explicit build, and full npm test: 563 passed, zero
failed/skipped/cancelled; test-runner duration 113372.957 ms. Changed-file IDE
lint clean and git diff --check passed. Normal checkpoint hooks run independently;
their final outcome/commit/push is recorded in the checkpoint return. No release/version/tag/install.
Changed folder sf-plugin-data yes, current version 0.1.0, next version unassigned.
No downstream/language/LSP/hover/wiki/site update needed; README/capabilities/artifact/
Git/guide propagation remains coordinator-owned because no implemented capability
changed. Whole-feature review deferred to coordinator, not claimed completed here.

# Segment A2 source acceptance resume — LIVE SETUP SETTLEMENT BLOCKED — 2026-10-28

Requested baseline `dbddaeb9c566753143fbfc91024bf751971634fd` fetched clean and equal
to origin/main. Existing roadmap/planning/review gates reused; one bounded worker,
no new architecture or nested workers. Source MCP discover -> describe -> readonly
Organization query matched expected org, as did core AuthInfo and actual standard
CLI org display (exit 0). Target untouched. Persistent validation project inspected
and preserved. The previous budget-blocked section below is historical, not a pass.

## Reservation before provisioning

Revised explicit ceilings: 160 logical nonpoll operations, 500 underlying reads
including standard CLI polling, 24 runtime settlement polls, two provisions, two
updates, two qualified exact deletes, 35-minute live phase. No safety caching or
poll-limit change. Current source lower bounds remain 50/108 workflow logical
acquisitions for one/two fixtures. One fixture entails 12 standard Segment Metadata
retrievals; two entail 26 (retrieve 2, preview 2, missing-ack 2, update 11, repeat 9).
A conservative 16 underlying-read allowance per standard retrieval yields 416 for
two; the remaining 82 non-Metadata workflow acquisitions plus 24 runtime polls
already total 522 before identity/setup/cleanup/instrumentation overhead. This is
reservation arithmetic, not measured traffic or a universal CLI polling bound.
The explicitly permitted ONE-fixture fallback was therefore selected; two-selection
acceptance stays pending. One reservation was 90 logical nonpoll and 400 underlying
reads, with 24 polls; its 12*16 + 38 remaining workflow reads + 24 polls leaves 146
requests inside that reservation for identity/setup/cleanup and uncertainty.
The historical 50/108 figures are lower bounds: current retrieve also binds the
unselected PROFILE prerequisite (two additional logical reads per unique dependency
per invocation), and the requested extra independent pair readback needs another
standard retrieval. Those are overhead inside the 90/400 reservation, not omitted
from the proposed run cap. No standard Metadata polling was reached in this run;
16 per job was a conservative allocation, not measured maximum or guarantee.

A run-owned external harness observed JSforce request-stream operations and Node
Undici diagnostic request creation in both local core and standard CLI processes.
It saved only method/path/SOAP operation in traces, not headers/tokens/bodies.
Precheck observed four wire requests: CLI display made two API68 root GETs; dependency
qualification used API65 Connect detail and Metadata readMetadata. No route sweep
or API68 Segment operation occurred. Dependency compatibility passed before setup.
The observer is supported runtime instrumentation, not proof of all possible
network stacks. It does not permit globally exact counts for MCP internals/auth.

## Actual live result and qualified cleanup

Live fixture phase: `2026-10-28T03:23:32.483Z` to
`2026-10-28T03:23:43.274Z` = **10.791 seconds**. One provision, zero updates,
one exact qualified delete, four settlement polls; eight logical nonpoll operations
including MCP identity, CLI identity, dependency detail/Metadata, provision and
cleanup qualification/delete/absence. Local trace: 12 transport events and 12
matching underlying Undici requests, zero uncorrelated events: 10 semantic reads
(including polls) and two writes (POST/DELETE). Add one known MCP org identity read
outside that trace = 11 known underlying reads; extra MCP/internal network overhead
is unknown, not fabricated. All measured usage is well below the revised caps.

Native API65 DBT setup used the already qualified wrapped-model, NoRefresh,
empty-audience syntax and preexisting PROFILE dependency. Parsed create response
matched the exact newly generated identity, PROCESSING/DBT/default/NO_REFRESH/P90D
and requested complete model/SQL. HTTP status was not retained. Four exact runtime
polls followed; the fourth returned a state outside qualified PROCESSING/ACTIVE.
The harness stopped immediately. **The precise unexpected state and poll bodies
were not saved**, so root cause is unknown. No second provision or blind retry.

No public retrieve, preview, missing-ack, acknowledged update, independent update
preservation or repeat command was invoked. All corresponding command exits and
zero-write acceptance evidence are N/A, not passes. Harness exit was 1. Native
fixture setup is not plugin create acceptance. Do not broaden states, change SQL,
activate, reprovision or replay to get green without a new scoped decision.

Cleanup used a fresh exact runtime read, requiring matching returned segment and
definition IDs, original segment-on, NO_REFRESH and complete original model/SQL.
One native DELETE completed; independent exact GET rejected ITEM_NOT_FOUND.
Runtime-owned fixture debt cleared. Metadata inventory and physical/generated-table
cleanup remain **unknown**, not claimed clean; shared dependencies untouched.
Private accountability ledger/receipts/trace are retained under the run-owned
`F:\Temp\segment-a2-XgNty2` root, with ownership marker. No recursive cleanup.
TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR verified on every shell entry;
only process-local repair applied where needed. No global CLI settings/install.

Durable sanitized distinct subject:
`data360:segment.dbt.a2-source-setup-settlement-blocked.api65` (root DB). It records
actual native setup/readback/cleanup and NOT-INVOKED plugin workflow, bound in prose
to the requested baseline without false plugin-acceptance provenance. Historical
budget-blocked row unchanged. Root fetched before evidence edit; unrelated dirty
index/worktree preserved, no shared index edit/rebuild or root history push.

Resume point: decide whether/how to capture the actual unqualified settlement
state in a future separately scoped diagnostic task; do not silently spend the
remaining provision allowance after this unknown stop. Creation absence/shell
admission remains blocked and closed to re-investigation. No release. Independent
B/C work may proceed with separate owners and existing safety/acceptance gates;
this blocker does not qualify those families. Coordinator retains whole-feature
review, public docs propagation and final DB rebuild/validate/gaps.

Documentation-only checkpoint; no production/test behavior changed. Package build,
zero-warning lint and full tests are required for this handover edit and recorded
with the checkpoint return. Changed folder sf-plugin-data yes, current version
0.1.0, next version unassigned/no release. No consumer/language/LSP/wiki/hover change;
public README/capabilities/artifact/Git/guide propagation remains coordinator-owned.

# Segment A2 source live acceptance — PRE-LIVE BUDGET BLOCKED — 2026-10-28

Baseline `75afe7f400e8233bd5c7856ae5a1d380feef0a30` reconciled clean and equal
to origin/main after fetch. Existing planning/review stays closed. This is one
bounded acceptance worker, not implementation or another research branch.
Source MCP identity was verified through discover -> describe -> readonly dispatch;
actual `sf org display --target-org mcnext-sdo --json` exited 0 and matched the
expected source org. Core AuthInfo via aliases.resolveUsername independently
matched too. An initial aliases.get lookup failed locally because it was the wrong
lookup method, not absent authentication; no auth settings were changed. The
persistent validation project's API65/package-directory configuration was inspected;
its contents and unrelated root work were preserved. No target operations occurred.

## Hard blocker before fixture provisioning

The predeclared limits remain <=20 minutes, <=2 provisions, <=2 updates, <=2 exact
qualified cleanup deletes, <=40 nonpoll reads, <=24 polls. Service poll limits stay
12 reads / 1000ms / 120000ms per update. Static current-source accounting proves
that even ONE fixture's full requested workflow exceeds 40 nonpoll logical reads:

- retrieve: 2 (runtime detail plus standard Metadata acquisition);
- preview: 4 (dependency detail/Metadata plus Segment detail/Metadata);
- no-ack deploy: 4 (whole-selection preflight, then blocked before executor);
- acknowledged update: 22 (initial preflight 4 + pending fresh admission 4 + service
  14, including independent post-settlement pair/dependency readback);
- repeated deploy: 18 (initial 4 + pending fresh admission 4 + service 10).

Total lower bound: **50 nonpoll logical acquisitions**, excluding setup settlement,
dependency precheck, cleanup/absence reads and underlying standard Metadata job
wire overhead. Two fixtures require at least **108**, since pending admission
rechecks both before the first item and the second before its execution. This is
static lower-bound accounting, NOT measured live HTTP traffic. Do not raise the
budget, cache across guard boundaries or weaken safety checks silently.

Actual Segment setup/update/delete attempts, Segment reads and polls: **0 each**.
The source MCP identity check was one recorded readonly org query; CLI org display
and private AuthInfo binding were identity checks, not Segment API65 acceptance.
No public Segment command was invoked; therefore command exits and independent
mutation/job transport counts for the requested workflow are **N/A**, not a claimed
zero-write repeat. No observer was attached. Public-flow success, preserved live
semantics, settlement, dependency compatibility and no-op transport proof remain
unexecuted. Live-fixture clock never started; local preflight reached this stop at
2026-10-28T03:06:40.523Z (about six minutes after the task timestamp).

Ownership ledger: **empty**. No provision attempts, new fixtures, historical fixture
adoption, generated resources or new cleanup debt. Exact cleanup is N/A because
nothing was created. No replay, rollback, shared-resource mutation or deletion.
TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR preflight passed on shell entries;
no disposable acceptance project was created and no recursive cleanup was run.

Durable sanitized blocked evidence subject:
`data360:segment.dbt.a2-source-acceptance-budget-blocked.api65` in the root
verification database, bound to the exact committed baseline above. It records
NOT-INVOKED command/readback/processing/cleanup states without manufacturing live
receipts. Existing native create/update, A1 roundtrip and permission/shell evidence
were consulted; none is relabelled current successful A2 acceptance. Root evidence
is left for the coordinator; no shared-index rebuild or root history publication.

Resume requires coordinator/user direction: explicitly revise the read budget, or
scope a narrow redundancy reduction with regression and full verification before
restarting bounded acceptance. Do not provision while the unchanged workflow cannot
fit. Creation remains BLOCKED; no release. Once-feature review, public docs, final
DB rebuild/validate/gaps and cross-org acceptance remain with the coordinator.
Independent B/C family work may proceed under separate owners; common command and
transport edits and full-suite inputs must still be serialized. Remaining family
gaps include DLO operational creation/update, broader DMO schema, Segment meaningful
DBT changes/create admission, CI expression/update/no-op, Graph eligibility and IR
complete comparison/generated binding; this stop changes none of those contracts.

Propagation: handover plus distinct blocked DB subject only. No behavior change,
new code or test case required. README/capabilities/artifact/Git/guide propagation
remains coordinator-owned and is not marked complete. No language/LSP/hover/wiki/
site-listing or consumer update is needed. Changed folder sf-plugin-data yes,
current version 0.1.0, new version unassigned; no release/tag/install.

# Segment A2 command integration checkpoint — 2026-10-28

Started at 2026-10-28T02:38Z (03:38+01:00), from exact clean pushed baseline
`200e6a9a9830784391c468f1a6419bd5d4472456`. Fetch/status and ahead-history
audit found main equal to origin/main with no unrelated package changes. Existing
plan/Gates1/2 remain closed; Gate3 is one bounded command/test owner, no nested
workers. Coordinator retains once-feature Gate4, public docs propagation and final
verification-DB rebuild/validate/gaps. This checkpoint is NOT A2/A or roadmap
completion. No live calls, mutations, installs, release/version/tag or DB edits.

## Command interfaces and behavior

- `Deploy.flags['allow-processing']` is an exact boolean, default false. Existing
  aliases/DMO flags, API65 default, latest write refusal and contractVersion 1.0.0
  remain unchanged. `executeSegment = executeSegmentDeploy` and
  `captureInput = captureDeployInputDigest` are protected injection seams.
- Dispatch is by document.kind. Segment service receives
  `(document, connection, apiSelection, dataSpace, {allowProcessing, verifyInput})`;
  production verifyInput preserves original Segment pair digests, mixed DMO byte
  digests and opt-in expansion snapshots. Existing DMO executor signature stays
  unchanged. Git roots keep their captured pair snapshots/provenance.
- Whole-selection artifact/target/effects/dependency admission precedes any write,
  including DMO. Missing explicit acknowledgement for processing updates blocks
  every item with mutation not-attempted. No-op Segment needs no acknowledgement
  and invokes no PATCH, poll or Metadata deploy job. Independent Metadata retrieve
  remains a read operation, not a claim of no read jobs.
- Mixed selections use existing dependency graph ordering, with deterministic
  ready-node tie-breaks. Every next item rechecks all captured bytes and all pending
  Segment prerequisites/target admission before dispatch; the Segment service then
  performs its own fresh binding and preservation checks immediately before PATCH.
- Segment execution items add family segment, fixed route
  `{apiVersion:'65.0',method:'PATCH',resource:'segments'}`, requiredEffects and
  retained whole-batch preflight. Sequential execution stops on block/fail/unknown;
  completed items remain intact and the tail stays not-attempted. An unexpected
  dispatch exception is conservatively failed/unknown. No rollback/transaction or
  cross-component atomicity is claimed.
- Creation, missing/unreadable/shell targets, unsupported definition edits and
  selected unsupported PROFILE prerequisites remain blocked before batch writes.

## Verification and follow-up

Scoped autofix, explicit build, zero-warning full lint and 57 focused tests passed
(6.9197707s Node phase). Full npm test passed 563/563 with zero failures/skips:
113.1272436s Node phase, 116.4215219s complete npm wall including build. Separate
CLI smoke passed 30/30 (105.4493042s). Normal unchanged hook/commit/push receipts
follow in the worker return; they are not presumed here. All shell/test entries
verify absolute normalized TEMP,
actual Node os.tmpdir and nonempty TMP/TMPDIR against F:/Temp; only process-local
repair/recheck is allowed. Synthetic OS-temp fixtures retained, no recursive cleanup.

Next task: source live acceptance only. First lookup DB and MCP-first verify actual
source org/CLI binding. Use at most two NEW owned fixture identities with explicit
ledger, <=2 provision/create attempts, <=2 update attempts, <=2 exact cleanup
deletes, <=40 nonpoll reads, <=24 polls and <=20 minutes. Provision solely through
separately qualified native route, never public create admission or existing business
resource mutation. Actual command retrieve both -> label/description edits ->
acknowledged batch update -> independent complete preservation readback -> repeated
deploy with zero mutation calls/jobs. Stop unknown; read-only reconcile, never write
retry/rollback. Cleanup only exact owned fixtures via qualified routes; report
retention/generated-resource uncertainty. Service settlement budget remains frozen
at 12 reads, 1000ms interval and 120000ms timeout per update. No target acceptance
or cross-org proof in this checkpoint.

Propagation: command help and this handover updated. Public README/capabilities/
artifact/Git docs and guide are pending coordinator propagation with the accepted
feature, not declared complete here. No workspace consumers or language/LSP/hover/
wiki/site-listing dependencies. Changed folder sf-plugin-data yes, current 0.1.0,
new version unassigned/internal checkpoint; other components N/A/not needed.

# Segment A2 existing-target SERVICE/TRANSPORT checkpoint — 2026-10-28

Started from exact clean pushed baseline `0d443258e4d2bb317c9643df4180c74a6f8a455a`.
Fetch/status and ahead-history audit passed. Existing plan/Gates1/2 remain closed;
Gate3 uses the explicitly permitted service+transport split to avoid exhausting a
single worker with command/batch integration. Coordinator retains once-feature
Gate4, public docs and final verification-DB rebuild/validate/gaps. This is NOT
complete A2 or A. CREATE REMAINS BLOCKED; do not restart absence qualification.
No live org calls/writes, installs, release/version/tag changes or DB/index edits.

## Exact interfaces and preservation contract

- `src/transport/connect-client.ts` adds `patchSegment(value:unknown):Promise<unknown>`.
  It independently validates a complete bounded Segment document, requires numeric
  requested API65, builds only fixed `/services/data/v65.0/ssot/segments/{apiName}`
  PATCH and reuses no-refresh/no-retry/no-redirect receiver. Payload contains only
  displayName, description, segmentOnApiName, segmentType `Dbt` and complete
  `includeDbt:{models:{models:[{name,sql}]}}`. BOTH publishSchedule and
  publishScheduleInfo are absent; lookback is never written or invented.
- `src/services/execute-segment-deploy.ts` exports
  `executeSegmentDeploy(value,connection,apiVersion,dataSpace,options)` returning
  `Promise<SegmentDeployExecution>` (existing DMO execution vocabulary plus
  family segment/fixed API65 PATCH route). Connection needs instanceUrl/request/
  getApiVersion/getUsername. Required options are `{allowProcessing:boolean,
verifyInput:()=>Promise<void>}`; optional offline seams are acquire (retrieveSegment
  signature), bind (bindSegmentDependencies signature), read(name):Promise<unknown>,
  patch(document):Promise<unknown>, now():number, delay(ms):Promise<void>.
- Fresh preflight always binds dependencies. A second exact runtime+independent
  Metadata acquisition must admit ACTIVE and agree with its candidate. Fresh binding
  snapshots after prerequisite settlement are compared again after acquisition and
  after settled readback. Pair digest callback runs before admission and twice after
  acquisition/binding, immediately before dispatch. Later command owner MUST supply
  the actual immutable original pair verifier, never a no-op in production.
- Equality returns unchanged/not-attempted with zero PATCH or Metadata DEPLOY jobs,
  no acknowledgement required. Independent Metadata retrieve jobs remain reads.
  Only label/description deltas pass; missing/unreadable/shell/unsupported targets
  cannot create. Update requires explicit true processing acknowledgement.
- One write attempt maximum. Mutation echo must admit exact desired semantics and
  identity for confirmation, but never substitutes for independent settlement.
  Timeout/disconnect/error/malformed echo remains failed/unknown even when bounded
  independent reconciliation sees the expected target. No replay or rollback.
- Frozen `segmentPollBudget={reads:12,intervalMs:1000,timeoutMs:120000}` bounds
  read attempts independently of clock progress; first poll immediate, subsequent
  polls delayed. Error/unknown state fails closed. ACTIVE poll is followed by a
  separate full runtime+Metadata acquisition and dependency binding. Runtime/definition
  IDs, ordered exact SQL/models, type, space, segment-on, schedule/lookback and all
  other admitted nonvolatile fields must preserve. Only displayName/description,
  segmentStatus, lastModifiedBy/Date and lastSegmentMemberCount are excluded from
  private preservation comparison. Missing exact runtime/definition IDs block.
- `test/execute-segment-deploy.test.mjs` covers service no-op/ack, exact payload,
  single-attempt unknowns, finite frozen-clock polls/deadlines/errors, semantic and
  final-pair mismatch, late pair/binding drift, and actual installed core PATCH
  401/503/200 no-refresh/replay with unchanged caller connection descriptors.

## Verification and checkpoint boundaries

Final scoped autofix, explicit build, zero-warning full lint and focused 13/13
passed. Full package npm test passed 558/558, zero failures/skips: Node phase
112.1575007s, complete npm wall including build 115.4818379s. Normal unchanged
hook repeats full lint/tests plus smoke before checkpoint commit; exact hook and
commit/push receipts are reported in the finishing worker return, never presumed. All shell entries verify TEMP, actual
Node os.tmpdir and nonempty TMP/TMPDIR against absolute normalized F:/Temp; two
initial inline Node-quoting attempts failed closed before Git, then piped Node and
existing check-temporary.mjs succeeded. Process-only repair/recheck, no recursive
cleanup. Synthetic fixtures retained by existing tests; no live ownership ledger.

## Ordered remaining work and exact resume point

1. Command integration in `src/commands/data360/deploy.ts`: add --allow-processing,
   protected executeSegment seam, whole-selection effects/admission before ANY
   writes including DMO; route existing-target Segment execution only. Keep current
   disabled command guard until integration and its synthetic tests pass. Retain
   exact pair/Git/expanded digests and pass actual verifier into the service.
2. Synthetic command regressions: mixed missing ack zero writes, no-op needs no ack,
   late digest/prerequisite drift, failure/unknown stop with earlier results and
   unattempted tail, unchanged DMO envelopes/API65/latest safeguards. Unsupported
   selected PROFILE/prerequisite creation stays blocked before any writes.
3. Separate source live acceptance task ONLY after command integration: first lookup
   DB, MCP-first verify actual source org/CLI binding; choose at most two NEW owned
   fixture identities with explicit ledger, <=2 provision/create attempts, <=2 update
   attempts, <=2 exact cleanup deletes, <=40 nonpoll reads, <=24 polls, <=20 minutes.
   Provision solely for acceptance via separately qualified native route, never
   public create admission or existing business-resource mutation. Actual command
   retrieve both -> label/description edits -> acknowledged batch update -> independent
   complete preservation readback -> repeat deploy zero mutation calls/jobs. Stop
   on unknown; read-only reconcile, no write retry/rollback. Qualified exact cleanup
   only, report retention/generated-resource uncertainty. No target acceptance here.

Public README/capabilities/artifact/Git docs and guide remain unchanged because no
public execution is enabled. Coordinator must propagate them with the integrated
feature. No workspace consumers, language/LSP/hover/wiki/site-listing dependencies.
Changed folder sf-plugin-data yes, current 0.1.0, new version unassigned/internal
checkpoint; all other tracked components N/A/not needed. Full-product creation,
meaningful DBT definition updates, broad SQL, seven-family and cross-org gates remain
explicitly unfinished. No release is authorized for this partial milestone.

# Segment permission/shell LIVE qualification checkpoint — 2026-10-28

Bounded source-only checkpoint from clean pushed baseline
`9c42d7fb42181b7e8bd04c228c48f610daade831`; fetch/status rechecked before edits,
no ahead history. Existing Gates1/2 remain closed; one small evidence/handover
owner, no code changes or nested workers. Coordinator retains once-feature Gate4,
public documentation propagation and shared DB rebuild/validate/gaps.

## Concrete contract and remaining feasibility blocker

- MCP discover/describe/dispatch identity workflow and independent CLI core alias
  resolution matched authorized source `mcnext-sdo`, org `00Daj000010xkZNEAY`.
  No target calls/changes. Persistent validation-project contents were preserved.
- API65 core permission inspection returned all 138 assignments with done=true
  and a completed profile permission query. Explicit assigned grants include
  `PermissionsAccessSegment`, `PermissionsAccessCdpApp`,
  `PermissionsManageDataspaceScope`, `PermissionsConfigureDataspaceScope`;
  Metadata/ViewAllData/ModifyAllData flags were true in assigned/profile data.
  These are actual permission observations, NOT inferred from the admin label.
  They do not evaluate all group muting/per-dataspace/per-record authorization.
- API65 default-space runtime inventory returned three entries, totalSize=3,
  batchSize=200, offset=0. Two independent Metadata list operations returned four
  definitions. The extra existing DBT definition independently read through
  Metadata (exact fullName, type, label and criteria) while exact runtime GET
  returned name/errorCode ITEM_NOT_FOUND. This existing definition was read-only:
  no ownership adoption, redeploy, cleanup or create-conflict POST.
- A newly chosen never-created identity omitted from both observed Metadata lists
  returned the same runtime ITEM_NOT_FOUND. Core errors did not expose numeric
  HTTP status; do not fabricate a fresh HTTP404 receipt. Local documentation
  separately documents 401 INVALID_SESSION_ID and 404 ITEM_NOT_FOUND, but supplies
  no universal Segment visibility or denied-versus-missing guarantee.
- **CREATE REMAINS BLOCKED.** Positive exact Metadata presence is sufficient to
  refuse runtime create as a definition conflict, without deleting/overwriting
  the shell. Inventory omission, runtime ITEM_NOT_FOUND and observed grants are
  still insufficient for permission-aware arbitrary-name absence. No public
  completeness/authorization attestation or denied-resource control was found.
  Four-entry SOAP list is well below known truncation concerns but has no explicit
  all-user/dataspace completeness attestation. No new owned fixture can establish
  visibility of arbitrary unrelated records; repeating historical create/delete
  would not close that gap. Auth/permission/network/generic errors stay blockers.

## Independent next executable slice — existing targets only

Proceed independently with a bounded existing-target update/no-op executor, NOT
create. Reuse fresh `preflightSegmentDeploy` and exact runtime + independent
Metadata pair qualification plus `bindSegmentDependencies`. Require supported
ACTIVE DBT/default/API65, complete admitted semantics and compatible existing
PROFILE dependency. Equality must produce zero mutations/jobs without needing
processing acknowledgement. Only label/description deltas may issue a single
full-preserved-definition PATCH, with explicit allow-processing acknowledgement,
DBT models doubly wrapped and BOTH schedule properties omitted. Preserve SQL,
identity, data-space, segment-on, NO_REFRESH and P90D; bound settlement and compare
independent post-settlement readback against the complete preservation baseline.
Stop unknown without retry/rollback. Freshly bind after any prerequisite settlement;
unsupported selected prerequisite creation still blocks the whole selection.
Missing/unreadable/shell targets remain blocked. This is the next implementable
contract based on existing qualified API behavior, not current executor acceptance:
all Segment execution remains disabled in this checkpoint.

## Budget, fixture ledger, evidence and verification boundary

Predeclared limits: 45 minutes; <=40 nonpoll reads; <=20 poll reads; <=2 newly
owned fixtures; <=4 create/update attempts plus <=1 qualified delete per fixture.
Live phase ended at 2026-10-28T02:11:02.541Z, approximately six minutes from dispatch.
Used 13 nonpoll remote read operations (two MCP identity reads, one MCP runtime
inventory, five permission/Metadata reads, five exact/inventory corroborations),
zero polls, zero create/update/delete, zero newly owned org fixtures. MCP discovery,
operation-schema lookup and local auth resolution are not resource reads; no
implicit core request telemetry is claimed. No credential/token payload published.
Existing extra definition retained untouched; no new org retention or cleanup debt.
New owned scratch `F:/Temp/data360-absence-2g0Rni` retained, no recursive cleanup.
Every shell entry checked TEMP/actual os.tmpdir/nonempty TMP/TMPDIR against F:/Temp.

Sanitized distinct root subject:
`data360:segment.create-admission.permission-shell.api65` (two proven API
observations, one blocked authorization claim, overall partial). Evidence uses
live-api/client, NOT plugin-acceptance; package revision is the baseline above.
Subject-only schema checks and final package verification/normal-hook commit/push
receipts are returned by the worker after completion, never presumed here. No
source/tests/transport/API admission changes, installs, version/tag/release or
shared-index writes. Root fetch found ahead-five unrelated history and dirty
inputs; only the distinct subject is added, root history is not pushed.

Propagation: this handover and root operational evidence updated; README,
capabilities, artifact/Git docs intentionally unchanged because public behavior
is unchanged. Whole-feature public docs/review remain coordinator-owned. No
workspace consumers or language/LSP/hover/wiki/site-listing changes. Changed
folder sf-plugin-data yes, current 0.1.0, new version unassigned; all other tracked
packages N/A/not needed. Package verification uses existing offline tests and
normal unchanged hooks; no automatic installation/package-install smoke.

# Segment A2c2 retrieve dependency selection checkpoint — 2026-10-28

This completes the bounded retrieve-side selection checkpoint, NOT Segment A,
A2 execution, cross-org acceptance or the seven-family roadmap. Existing plan and
review remain closed; one owner kept service/command/tests coupled. Coordinator
retains whole-feature Gate4, public documentation propagation and shared database
rebuild/validate/gaps. Fetch/status reconciled clean pushed baseline
`cf9735745037fc1dcd3b96b1bac81871978a07c8`; ahead history was empty. No live calls,
org mutation, installs, evidence rows, shared-index edits, release or version bump.

## Implemented interfaces and owned files

- `src/services/select-retrieve-dependencies.ts` exports
  `selectRetrieveDependencies(roots:DependencyIdentity[], connection:Connection,
version:ApiVersionSelection, include:boolean, injected?:RetrieveServices)`:
  `Promise<{entries:RetrieveDependencyEntry[],reasons:Map<string,SelectionReason>}>`.
  Entries are `{document:DmoDocument}` or `{document:SegmentDocument,
definitionXml:string}`. Optional offline seams are `segment`, `dmo`, `bind` and
  `raw(name):Promise<{detail:unknown,metadata:unknown}>`; defaults reuse existing
  family acquisition, reference binder and guarded Connect/Metadata reads.
- Default exact Segment retrieval always runs `bindSegmentDependencies` against
  raw source DMO detail plus Metadata. Shared raw reads are invocation-cached by
  typed identity; no target/source IDs enter exported files. Without opt-in,
  unselected prerequisites are inspected but never acquired as portable DMO
  artifacts or published. Only existing qualified one-object/one-field SQL is
  admitted; SQL bytes are unchanged.
- Opt-in recursively acquires supported DMO prerequisites through `retrieveDmo`,
  retaining its original blockers and authored contract. PROFILE compatibility is
  NOT PROFILE portability: real qualified Segment dependencies require PROFILE,
  and unsupported PROFILE/generated acquisition blocks the COMPLETE selection
  before any file publication. Successful expansion tests use synthetic admitted
  family-service seams; they do not qualify production PROFILE export as Other.
- Reuses `dependencyKey`, `documentDependencyNode`, `orderDependencyNodes` and
  `dependencyLimits`: 256 nodes/acquisitions, 512 edges, 16 chain depth; unknown
  closure, wrong identity, duplicates/cycles/limits fail closed. Current admitted
  Segment-to-DMO/leaf-DMO shapes cannot form real cycles; shared graph regressions
  cover cycle rejection. Isolated roots remain. Reasons retain explicit versus
  added selection and root-to-prerequisite chains, including shared references.
- `retrieveDependencyLimits.requests = 512` bounds admitted transport operation
  reservations conservatively: 103 per DMO (detail, Metadata, at most 101
  relationship pages), two per Segment (exact GET, bounded standard Metadata job)
  and two per unique raw binding. CLI-internal polling is separately bounded by
  existing `project-metadata.ts`, not counted as individual requests here. Budget
  reservations happen before binder error sanitization so limit codes survive.
- `RetrieveDependencyError(code,identity,reason)` carries payload-free refusal
  context. `src/commands/data360/retrieve.ts` adds `--include-dependencies` and
  optional `result.dependencies:[{identity,reason}]`; failures retain the affected
  reason even without opt-in. Mixed/Segment selections admit the complete graph
  before output; publication is dependency-first and stops at the first output
  failure, retaining earlier receipts without claiming a batch transaction.
  Existing DMO-only default path/per-item behavior remains unchanged. Existing
  DMO writer and Segment pair writer own paths, overwrite and pair integrity.
- `test/retrieve-dependencies.test.mjs` adds seven regressions for default versus
  opt-in, shared binding/acquisition, reversed/repeated/explicit/isolated roots,
  honest PROFILE blockers, actual PROFILE compatibility binder, missing/foreign/
  unknown/limited acquisition, sanitized failure and output-stop behavior.
  `test/retrieve-command.test.mjs` updates the selection seam and complete-selection
  blocker expectation. Existing path/overwrite/pair writer tests remain unchanged.

## Verification and environment

Scoped ESLint autofix, explicit build, full zero-warning lint and focused 24/24
retrieve tests passed. Full package run passed 545/545, zero failures/skips:
114.9802881s Node phase, 118.3304045s complete npm wall including build on the
final source/test tree after the request-budget placement correction. Normal
enabled unchanged hook repeats full verification before commit. Hook/full-suite/smoke and commit/push receipts are reported after they
actually complete, never presumed. TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR
preflight ran at every shell entry; all normalize absolutely to F:/Temp. No
recursive cleanup. No package install smoke or live qualification in this slice.

## Remaining and exact next resume point

Retrieve and deploy opt-in dependency selection are implemented within their
existing supported family contracts. This does not enable dependent selected
PROFILE creation, unsupported PROFILE export or Segment execution. Next bounded
slice: qualify permission-aware Segment absence/shell conflict policy, then the
existing executor seam's single-attempt processing acknowledgement, bounded
settlement, independent semantic readback and fresh post-prerequisite binding.
Use compatible preexisting PROFILE dependencies; do not broaden DMO portability
to make expansion pass. Any live evidence requires database lookup first,
MCP-first identity verification and a newly owned bounded fixture ledger.

Coordinator owns once-whole-feature Gate4 and README/capability/artifact/Git-guide
and public guide propagation; no workspace consumers, language/hover/wiki/site
listing changes arise here. Changed folder: sf-plugin-data yes, current 0.1.0,
new version unassigned (internal checkpoint, no release). All other tracked
components N/A/not needed.

# Segment A2c2 deploy dependency selection checkpoint — 2026-10-28

This is a coherent DEPLOY-ONLY subcheckpoint, NOT complete A2c2/A2c. Existing
Gate1/2 remain closed; a single owner kept the graph/service/command/tests coupled.
Coordinator retains once-whole-feature Gate4, public docs propagation and shared
verification-DB rebuild/validate/gaps. Initial and final fetch/status confirmed
HEAD = origin/main = bc9aa50d06445149c9a24b6dbcb9c12e963543c6 before commit, no
ahead commits or unrelated package changes. Package remains sf-plugin-data 0.1.0;
no release/version bump, installs, live calls, evidence rows or shared-index edits.

## Implemented interfaces and owned files

- `src/artifacts/dependency-selection.ts`: exports `DependencyIdentity` =
  `{kind:'dmo'|'segment',dataSpace:string,apiName:string}`, `SelectionReason` =
  `{explicit:boolean,chains:DependencyIdentity[][]}`, `DependencyNode`,
  `dependencyKey`, `documentDependencyNode`, `orderDependencyNodes`,
  `DependencySelectionError` and frozen `dependencyLimits` (256 nodes, 512 edges,
  16 depth, 256 local acquisitions). Exact default-space API-name identity only;
  no name-only fallback, SQL rewriting or generic adapter registry. DMO contract
  admission rejects unsupported relationships/generated closure. Graph ordering
  retains isolated roots and sorts family/space/name only among currently ready
  nodes, recomputing readiness after each emission; cycles/duplicates/limits block.
- `src/services/select-deploy-dependencies.ts`: exports
  `selectDeployDependencies(roots:DeployInput[],cwd:string)` returning
  `Promise<{inputs:DeployInput[],reasons:Map<string,SelectionReason>,
verify:()=>Promise<void>}>`. Expands Segment references only to exact conventional
  local `data360/default/dmo/<ApiName>.json` inputs via existing `readDeployInputs`
  admission. Dedupes explicit/added identities and records root-to-dependency
  chains. Explicit roots retain their original objects/pair digests. Missing local
  artifacts remain EXTERNAL target prerequisites, not claimed selected closure;
  A2c1 fresh binding still blocks missing/incompatible target profile DMOs even
  when a local DMO is selected for creation. Malformed/present unsupported local
  artifacts fail closed. No unsupported profile export/create is fabricated.
- `src/artifacts/read-deploy-input.ts`: additive
  `captureDeployInputDigest(input:DeployInput):Promise<string>` captures DMO exact
  byte SHA256 and verifies/retains Segment immutable original XML/JSON pair digests.
  Expanded selection captures all input digests and `verify()` checks them before
  preflight and again before each execution item. Existing admission stays intact.
- `src/commands/data360/deploy.ts`: opt-in `--include-dependencies` adds ordered
  inputs and `result.selection.dependencies:[{identity,reason}]`. No flag means
  unchanged explicit-only selection/output, while A2c1 binding reads remain.
  Git original pair digest comparison and provenance are retained. All Segment
  execution/create remains `SEGMENT_EXECUTION_NOT_IMPLEMENTED`, including mixed
  selections: this checkpoint adds no Segment executor or settlement semantics.
- `test/dependency-selection.test.mjs`: six regressions cover reverse selector
  order, ready-only/same-family graph ordering, isolated roots, cycles, duplicate
  identities, unknown closure/limits, explicit prerequisite dedupe, missing external
  dependencies, malformed local admission, immutable Git roots, DMO byte tampering,
  command default versus opt-in selection and no Segment writes. Same-family graph
  utility tests do not claim new admitted same-family artifact support.

## Verification and environment receipts

Scoped ESLint autofix, explicit build and full lint (zero warnings) passed.
Full `npm test --no-workspaces`: 538/538, zero failures/skips/cancellations;
136.5551629s Node phase and 140.7507343s full npm wall including build. Normal
unchanged enabled pre-commit hook runs lockfile check, full lint/build/tests and
30 CLI smoke tests; commit/push receipts are reported separately after completion,
not presumed here. No package smoke/install or live qualification was performed.
Every shell/test workload checked absolute normalized TEMP/actual Node os.tmpdir/
nonempty TMP/TMPDIR against F:/Temp, with process-only repair/recheck where needed.
Scratch uses verified OS-temp mkdtemp; fixtures are retained, no recursive cleanup.

## Exact remainder and next qualification slice

`retrieve --include-dependencies` is NOT implemented: retrieve command/service and
source acquisition selection still need bounded opt-in expansion, explicit versus
added reasons, deduped acquisition/request budgeting and default no-extra-output
regressions. Reuse only supported DMO acquisitions; unsupported profile/generated
prerequisites must produce concrete blockers rather than manufactured artifacts.
Reuse the typed graph where suitable, but do not imply the deploy-only graph
qualifies source acquisition. Public README/artifact/capabilities/Git guide updates
remain coordinator-owned with the complete feature review.

Then separately qualify guarded Segment executor: absence/shell conflict policy,
effects acknowledgement, post-prerequisite-settlement fresh binding using A2c1's
sixth preflight seam, bounded processing/readback and independent acceptance must
close before any Segment runtime write. Selected-create downstream binding is
still blocked; no live cross-org acceptance or release is bundled here.

Propagation: sf-plugin-data service/command/tests/handover updated; no workspace
consumers or language/LSP/hover/wiki/site-listing changes. Coordinator owns the
whole-feature Propagation Table/public docs. Changed folder sf-plugin-data: yes;
current version 0.1.0; new version unassigned (internal checkpoint). All other
tracked components N/A/not needed.

# Segment A2c1 exact target binding checkpoint — 2026-10-28

This is a binding-only subcheckpoint, NOT complete A2c. Existing Gate1/2 remain
closed; one owner kept the service/preflight/tests coupled. Coordinator retains
whole-feature Gate4 and public documentation propagation. Fetch/status confirmed
clean HEAD = origin/main = e466f6c713d138cf87efe50fdc4c80b35522bc21; personal Git
identity verified. Package remains sf-plugin-data 0.1.0, no release/version bump.

## Interfaces and implemented semantics

- New `src/services/bind-segment-dependencies.ts` exports
  `bindSegmentDependencies(value, connection, apiVersion, dataSpace, acquire?)`:
  `Promise<SegmentDependencyBinding[]>`. Connection needs instanceUrl/request/
  getApiVersion. Optional raw-read seam is `(name:string) => Promise<{detail:
unknown, metadata:unknown}>`. Production reuses guarded Connect exact detail
  GET and existing guarded `readDmoMetadata`, not portable DMO retrieval/create.
  Each private binding contains `{identity:{kind:'dmo',dataSpace:'default',apiName},
targetId:string, fields:[{apiName,dataType:'Text',isPrimaryKey:true}]}`. Target ID
  is independently acquired; never sourced from a portable artifact or exposed
  in the public preview. SQL is untouched.
- Admission remains A1's one-object/one-field qualified empty-audience SQL.
  Require exact DMO/fullName/default scope across Connect and Metadata, explicit
  Connect PROFILE/segmentable and Metadata segmentable agreement, nonempty
  target-local ID, unique exact field identities, matching Text type and exactly
  one Metadata primary field matching the referenced field. Optional Connect
  primary flag must agree. Each field collection is bounded at 4096 entries;
  acquisition is one exact Connect and one exact Metadata operation, no inventory.
  Unqualified variants fail closed, not generic profile portability acceptance.
- `preflightSegmentDeploy` keeps its first five arguments and adds optional sixth
  `bind = bindSegmentDependencies`. It invokes fresh binding before exact Segment
  acquisition, including unchanged previews. No cache or previous binding is
  trusted. This is the future post-prerequisite-settlement rebinding seam, not
  implementation of settlement/execution. Missing/incompatible prerequisites block
  even when selected for creation; no absent prerequisite admission was invented.
- `test/segment-deploy.test.mjs` adds three cases with many mutations covering
  differing refreshed target IDs, exact missing/name-label refusal, ambiguous
  object/field metadata, scope/segmentability/type/primary mismatch, collection
  bounds, acquisition failure and unsupported SQL/API before reads. Existing
  mixed execution/digest and all DMO/Git regressions remain green.

## Verification and constraints

Scoped ESLint autofix, explicit build and full lint (zero warnings) passed.
Final focused tests 13/13 (3.5735119s); final full npm test 532/532, zero failures/
skips/cancellations, 115.4361064s Node phase, 118.8063813s full npm wall time
including build. An earlier full 532/532 preceded tightening independent Metadata
scope/segmentability checks; the final rerun above supersedes it. Normal enabled
hook commit/push receipts are returned by the worker after completion, not presumed
by this record. Hook runs full lint/build/tests and 30 CLI smoke tests unchanged.
No installs or package smoke (its script installs), live org calls, evidence rows,
shared-index changes or org mutations occurred. No live qualification is claimed.
Every workload checked TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR against
absolute normalized F:/Temp; initial malformed inline preflight stopped before Git
and was corrected. All accepted workloads use the existing check script with
process-only repair/recheck. Test scratch is retained; no recursive cleanup.

## Exact remaining A2c and guarded-executor resume

`--include-dependencies` is NOT implemented on retrieve or deploy. No selection
graph, reasons/result additions, cycle/order handling or expansion was introduced.
Default remains explicit-only; compatibility reads add no artifacts/writes.
A1 typed references ALWAYS require API names; genuinely-missing-name fallback is
unrepresentable and intentionally not invented. Failed API lookup never falls
back to labels. Unique/ambiguous fallback tests must accompany a future separately
admitted name-only reference shape, not fabricate one in this checkpoint.
Next owner: implement bounded opt-in selection using available local DMO inputs and
existing source DMO service admission only. DMO profile export/create limitations
must remain blockers; do not expand generated/unsupported prerequisites. Retain
Git roots/digests, typed dedupe, finite traversal, reason chains, isolated roots,
cycles and same-family/unsupported-edge refusal. Then add guarded Segment executor
only after absence/shell conflict, effects acknowledgement, fresh post-settlement
binding, bounded processing/readback and independent acceptance gates close.
ALL Segment execution/create remain blocked, including unchanged and mixed DMO
selections. Existing API guards, DMO behavior and Git pair digests are unchanged.

Propagation assessment: this package service/tests/handover changed; public README,
capabilities/artifact/Git/guide propagation remains coordinator-owned before a
milestone claim. No language/LSP/hover/wiki/site listing or workspace consumers.
Changed folder sf-plugin-data: yes; current version 0.1.0; new version unassigned,
internal checkpoint only. All other tracked components N/A/not needed.

# Segment A2b Git pair selection checkpoint — 2026-10-28

Bounded Git-selection-only checkpoint. Gate1/2 were already closed; the single
owner kept the tightly coupled selector/command contract together. Coordinator
retains once-whole-feature Gate4, public docs propagation and verification-DB
rebuild/validate/gaps. No DB claims/index changes, org calls, dependency expansion,
executor changes, installs, release or version bump. Package remains `0.1.0`.
Initial fetch/status confirmed clean HEAD = origin/main =
`3a3f7b5ad510004598132f513f724ad7df8799ee`, no ahead history.

## Exact interfaces and owned files

- `src/artifacts/git-deploy-selection.ts`: `selectGitDeployInputs({cwd,ref})`
  still returns `{paths,provenance}` for legacy DMO-only/empty selection, with
  additive `segments?: readonly SegmentDeployInput[]` only when a Segment is
  selected. Each frozen entry is the existing A2a `{path,companionPath,document,
inputDigest}`; digest length-prefixes both original XML/JSON byte sets, not a
  semantic JSON hash. `paths` contains one canonical XML path per Segment, plus
  legacy DMO paths. Either/both members coalesce via existing strict admission.
  Fixed default/configured package paths are checked against exact Git spelling;
  nested/alternate-package/case-suffix aliases do not silently select a different
  file. Either-endpoint rename/copy/delete/conflict detection and ambiguous
  tracked-worktree-deletion plus untracked-addition protection now include pair
  members. Missing members, bad identities, duplicate keys, links/hardlinks and
  competing paths fail the whole selection before an otherwise valid DMO deploy.
- `src/commands/data360/deploy.ts`: consumes optional captured `segments`, checks
  exact path/companion/digest/count against re-admitted inputs and verifies captured
  bytes before target access, then retains A2a before/after preflight verification.
  Help/errors mention paired Segment selection. Public result/provenance shapes
  are unchanged; no source document/digest is added to the public envelope.
- `test/git-deploy-selection.test.mjs`: synthetic Git fixtures cover either/both
  members in committed/index/worktree/untracked states; complete pair binding,
  missing/delete/rename cases alongside DMO; configured package and path/identity/
  duplicate-key/link refusal. Existing DMO tests are retained.
- `test/git-deploy-command.test.mjs`: mixed Git-selected Segment+DMO preview and
  whole-selection execution blocking, captured/re-admitted byte/path/count drift,
  plus unchanged legacy DMO/empty-selection/API65 behavior.
- `docs/handover.md`: this checkpoint record; no other files owned by this slice.

## Verification and checkpoint state

Scoped ESLint autofix passed; full `npm run lint --no-workspaces` passed with
zero warnings; explicit `npm run build --no-workspaces` passed. Full
`npm test --no-workspaces`: 529/529 passed, zero failed/skipped/cancelled,
119.3801981s Node phase and 122.6927267s complete npm wall time including build.
Normal-hook commit/push receipts follow in the finishing worker's return; this
record does not presume their success. Scratch fixtures are run-owned
`mkdtemp` directories under verified `F:/Temp`; they are retained, not recursively
cleaned. One early PowerShell Node quoting attempt failed before Git/workloads;
a later shell accidentally referenced a nonpersisted preflight function and
continued focused tests. That focused run is not acceptance evidence; all accepted
full verification and commit-hook workloads use explicit successful TEMP/actual
Node os.tmpdir/nonempty TMP/TMPDIR checks with process-only repair/recheck.

## Remaining A2 checkpoints (not implemented here)

Segment execution/create remain blocked exactly as in A2a, including unchanged
Segments and mixed DMO+Segment execution. Permission-aware absence and Metadata-only
shell conflict admission remain unresolved. Next checkpoints: qualified always-on
target dependency binding and opt-in selection expansion/order; bounded runtime
executor, effects/processing acknowledgement, settlement and independent readback;
source fixture acceptance and distinct cross-org acceptance under existing evidence
and authorization gates. No generalized SQL, schedule, dependency graph or executor
framework is introduced. Coordinator owns once-whole-feature review and public
README/capability/artifact/Git/guide propagation before milestone publication.

# Segment A2a read-only deploy checkpoint — 2026-10-28

Bounded A2a implementation, not the complete operational Segment milestone. Existing
Gate1/2 were reused; one owner handled all package inputs and serialized verification.
Coordinator retains once-whole-feature Gate4 and public documentation propagation.
Fetch succeeded; baseline HEAD/origin/main was
`41615b4f469b741b1bae8b2991014a99fd0e7d77`, with no ahead history. Only the owned
A2a files listed below were changed. Version remains `0.1.0`; no release/tag.

## Implemented interfaces and ownership

- `src/artifacts/read-deploy-input.ts`: `DeployInput` is the existing DMO shape
  union `SegmentDeployInput = {path:string, companionPath:string,
document:SegmentDocument, inputDigest:string}`. `readDeployInputs(flags)` accepts
  exact `segment:Name` or either canonical pair member, coalesces overlapping pair
  selections, rejects duplicate logical identities and correlates strict UTF-8
  duplicate-key-free JSON against XML/name/label/type/exact model SQL. Both members
  receive bounded handle/path/ancestor/single-link admission. Captured document,
  nested arrays/objects and input are frozen. SHA256 binds lengths and exact XML/JSON
  bytes. `verifySegmentInputDigest(input):Promise<void>` re-admits both and refuses
  any byte drift, including semantically irrelevant whitespace changes.
- `src/artifacts/write-segment.ts`: exports reused
  `segmentSourceRoot(root:string):Promise<string>`; writer behavior is unchanged.
- `src/services/preflight-segment-deploy.ts`:
  `preflightSegmentDeploy(value,connection,apiVersion,dataSpace,acquire=retrieveSegment)`
  returns `SegmentDeployPreview` (existing outcome/target/absence vocabulary plus
  `family:'segment'`, fixed API65 GET route and `requiredEffects:Array<'processing'>`).
  Only independently admitted exact present ACTIVE targets qualify. Label/description
  differences report update + processing; equality reports unchanged + no effects;
  definition differences report blocked-changes. Invalid scope, errors, generic404,
  permissions, missing candidate/expectations or shell ambiguity never prove absence.
- `src/commands/data360/deploy.ts`: protected seams `preflightSegment` and
  `verifySegmentInput`; discriminates by document.kind and rechecks pair digest
  before and after target preflight. Every selected Segment blocks execution with
  SEGMENT_EXECUTION_NOT_IMPLEMENTED, even unchanged. Mixed DMO+Segment selection
  therefore cannot perform DMO writes. Existing DMO API65/latest guards remain.
- `test/segment-deploy.test.mjs`: ten synthetic tests cover either member, selector,
  configured package, pair corruption, digest drift, junction/hardlink refusal,
  semantic/effect comparison, create blocking, invalid scopes and mixed-command
  whole-selection blocking/read-only preview.

## Fresh verification and limits

Process-local TEMP/actual Node os.tmpdir/nonempty TMP/TMPDIR were verified against
absolute normalized `F:/Temp` before shell workloads. No live calls, org mutations,
installs or persistent-project edits. Synthetic OS-temp fixtures are retained;
no recursive cleanup. Verification DB A1 roundtrip and Metadata-only runtime404
subjects were looked up; historical evidence was not relabelled A2a acceptance.
No new live qualification row or shared DB index changes were made.

- Scoped autofix, explicit build and full zero-warning lint passed.
- Focused new regressions: 10/10, 4.0294876s test phase.
- Full `npm test --no-workspaces`: 490/490, zero failed/skipped; 112.5175007s Node
  phase, 116.5626928s complete npm test wall-clock including intrinsic build.
- `npm run smoke --no-workspaces`: 30/30, zero failed/skipped; 103.8177112s Node
  phase, 104.3193081s wall-clock.
- First full run exposed two test-harness failures (Object.create bypassed the new
  class-field seam); the harness now explicitly injects verifySegmentInputDigest.
  Complete verification above was rerun afterward, not inferred from focused checks.
- `smoke:package` was not run: existing script installs dependencies and this task
  prohibits automatic installs; its retained exact package-entry-count assertion is
  also from the earlier DMO-only package. CLI smoke is not installed-package proof.
- Checkpoint commit/push and normal-hook receipts are reported by the finishing
  worker/coordinator; this text does not presume their success.

## Locked blockers and next A2b resume

CREATE MUST REMAIN BLOCKED: permission-aware absence and exact Metadata-only shell
conflict admission are unresolved. No executor, acknowledgement flag, target dependency
binding/expansion, Git pair selection, broad SQL/DBT/schedule support or cross-org
acceptance is claimed. Two-live-fixture proof remains pending. A1 bounded single-model
DBT/NO_REFRESH/P90D/default-space grammar is unchanged.

A2b starts at `deploy.ts`, `git-deploy-selection.ts` and the new preflight service:
add qualified dependency binding and digest-aware Git pair handling, then bounded
executor/effects acknowledgement only under the existing plan's evidence gates.
Do not use current label-preview advice as execution authorization or generic404 as
absence. Once-feature code review and README/capability/artifact/Git/guide propagation
remain coordinator-owned. No language/LSP/hover/wiki/workspace consumers changed.

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
