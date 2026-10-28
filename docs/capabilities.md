# Capability contract checklist

## Internal Graph root-only family services

The internal Graph document/acquisition/preflight/executor now admit only the
qualified default-space root-only NONE/DEFAULT configuration: unified Individual
logical root, ordered Text Id key/FirstName and the single forward non-key LastName
append, seven-day refresh and incremental disabled. They are not wired into public
selectors, file/Git input or artifact publication yet; create/delete remain blocked.
A strict GET inventory rejects unknown meaningful properties rather than dropping
them. Computed node/field/output identities stay in private expectations, separate
from the logical portable root. Missing GET `creationMode` requires explicit private
known DEFAULT creation intent bound to the exact returned owner id/name/default;
it is never inferred from desired input or presented as portable provenance.

Acquisition reads exact Graph, its returned day-zero transform, then a fresh identical
Graph. Eligibility requires ACTIVE/SUCCESS, a completed dated run and matching
load-field/key/output lineage; an existing completed run may predate invocation.
Preflight independently binds API65 REST/Metadata root identity, required Text fields
and explicit key. Only equality or the complete preserved LastName append is admitted.
Execution rechecks input, dependencies and owner baseline, acknowledges processing,
and attempts one full update with `editScheduleOnly: false`. A zero-mutation unchanged
result does not require processing acknowledgement. Unknown intent limits existing-owner
admission; it does not claim every Graph is unsupported.

Settlement defaults to a finite 40-minute window, at most 41 Graph poll reads spaced
60 seconds (eligibility/confirmation reads are additional bounded acquisitions).
`processing` and `editing_post_sync` remain pending even after transform SUCCESS.
Private detached application observations are recorded before status/error classification;
unknown status, nested errors, recorder failure, timeout or preserved-binding drift
stop without replay. Confirmation requires independent ready/complete equality, the
same exact owner transform with a later completed run and fresh dependency binding.
Clock/read/delay seams exercise approximately thirty minutes synthetically. No live
plugin, installed command, no-op computation or cross-org acceptance is claimed.

## Internal Graph transport boundary

The fixed API67 facade now admits semantically read-only `d360_transform_get`
with exact `dataTransformNameOrId`. It requires matching returned name/id,
explicit default space, `creationSource: 'Data Graph'`, status/run-status and
an explicitly null or dated last run. This is read adaptation, not eligibility:
family admission must require ACTIVE/SUCCESS and a completed dated run bound to
fresh Graph-returned `dayZeroTransformDevName`; an older completed run need not
postdate the current invocation.

`McpExecuteClient.read(operation, parameters, observe?)` optionally awaits a
private detached raw application-body observation before strict result/status/error
classification. Unknown Graph status and nested errors are recorded then rejected;
recorder failure fails closed. It does not expose observations in public results,
permit mutation recording, retry transport failures or weaken supported status guards.
The family services above consume this boundary. Public file/Git routing and live
zero-write acceptance remain unimplemented/unverified respectively.

## Public CI command boundary

Exact `calculated-insight:ApiName__cio` retrieve, preview and deploy are routed
through the qualified CI services at API65/default (`auto` selects that fixed route).
Retrieve requires independent native runtime/SOAP correlation, typed DMO binding,
and exact standard `MktCalcInsightObjectDef` project XML before whole-selection
publication through the strict pair writer. Git-selected CI pairs are captured,
compared to resolved inputs and freshly byte-verified before target execution.

Deployment is limited to existing ACTIVE Custom/CALCULATED_METRIC/IN_USE owners
with the qualified `APPROX_COUNT_DISTINCT` engagement expression, schema and
SYSTEM_MANAGED schedule. Only the forward false-predicate plus DeviceId IS NOT NULL
expression edit is writable; complete equality is unchanged. Creation, shell
conversion, label/schedule/reverse/arbitrary SQL and dependency expansion block.
Updates acknowledge processing; every pending CI is rebound and preflighted before
any next mixed write. Input digest guards and private detached observation recording
are mandatory executor options. The existing executor attempts at most one PATCH,
bounds settlement, independently correlates final readback, and never replays unknown
mutations. Public routing has synthetic regression coverage; fresh live command,
zero-write/computation and cross-org acceptance remain separate evidence gates.

General seven-family support is **unimplemented**; explicit bounded DMO retrieval
is available through current service-owned capability checks, not a permanent
fixture-specific architecture. No endpoint or writable variant is
claimed verified. Historical API observations are not implemented contracts.
Every family must complete all gates below before support can be declared.

Explicit `--api-version latest` is experimental and read-only (retrieve or deploy
`--preview`); numeric `65.0` remains the default. Commands discover advertised
versions once with authenticated `/services/data`, without cache/fallback/retry,
retain literal REST `/latest/ssot/`, and pin SOAP to the numeric maximum. Auth
initialization uses explicit numeric bootstrap `65.0` so core cannot perform an
earlier unguarded cached/network version discovery (including optional target auth). Existing
DMO capability evidence must still be `65.0`; any newer evidence, including `68.0`,
blocks before DMO calls. No API 68 or actual REST-version qualification is claimed.
Direct latest deployment is refused before preflight/mutation; exported execution
and transport guards remain. Envelope `apiVersion` reports the request, optional
`soapApiVersion` reports numeric SOAP evidence only. Failed discovery is payload-free.

## dlo: unimplemented

Internal `retrieveDlo(connection, apiName, apiVersion, dataSpace)` now acquires one
exact non-namespaced custom `__dll` detail with explicit numeric API65/default
scope and matching connection version before HTTP. The existing guarded GET
transport disables refresh, retry and redirects using an operation-local receiver.
The detached `dlo-acquisition` snapshot is always `incomplete`: generated replay,
external bindings, lineage and detail collection completeness remain unqualified.
Unknown configuration, generated fields and observation metadata are retained;
unknown keys add a blocker. Explicit default-space evidence is required; filtered
or multiple spaces remain retained and blocked, not silently treated as portable.
No stream/lineage acquisition, public artifact, deploy admission or CLI wiring exists.
An empty field collection is diagnostic only, never proof of portable empty data.

Internal `ConnectClient.listDataLakeObjects(): Promise<DloInventoryAcquisition>`
now acquires bounded raw API65 collection pages, beginning with
`GET /services/data/v65.0/ssot/data-lake-objects?limit=20`. The envelope retains
raw `pages` and optional page/entry metadata; status is always `incomplete` with
`INVENTORY_COMPLETENESS_UNVERIFIED`. Pagination records `no-next-observed` when
no next link is observed, or `request-budget-reached` at the local 100-request
budget; neither means complete inventory. Continuations must remain same-origin
on the exact API65 collection route, with only unique allowlisted numeric
limit/offset or ASC/DESC orderBy parameters. Malformed envelopes, unsafe
continuations and loops fail closed; existing no-refresh/retry/redirect guards
remain. No completeness, default-space binding or absence proof follows from
these pages, an empty collection, optional totals or observed termination.
Detail completeness, stream/connector bindings, lineage and generated replay
blockers are unchanged; this helper enables no public CLI, artifact or write path.

API68 official-reference annotations mark list/detail routes available from API60;
that reference availability is not live API65 qualification.
Official routes are documented from API60, but this internal read does not qualify
API65 create/update/delete or connector-specific behavior. The current reference
marks DLO `dataSource` and atomic `dataModelObjectConfig` inputs as API67-only.
[Official DLO reference](https://developer.salesforce.com/docs/data/connectapi/references/spec#tag/Data-Lake-Objects).

- [ ] Record official list/detail/create/update endpoints and API versions.
- [ ] Prove pagination, complete schema and stream/connection/lineage bindings.
- [ ] Classify writable/read-only/unknown fields and connector prerequisites.
- [ ] Prove configuration-only create/update/no-op without starting ingestion.

## dmo: general support unimplemented; bounded explicit retrieval available

`sf data360 retrieve -m dmo:ApiName` delegates capability checks to the existing
service, then writes authored-only canonical JSON through the existing writer.
No command-level category/field-count restriction is added. Current service
supports API 65.0/default through the common DMO projector with recognized generated
recipe, exact semantics and arbitrary nonempty authored counts/types. Only projected,
blocker-free, validated candidates reach the independently common-mapped writer.
Incomplete or unknown variants diagnose without publication. Repeatable exact selectors,
`-m dmo`, and omitted selectors (all currently implemented families: DMO only) now
resolve deduplicated sorted selection. Type/all reads complete inventory before
writing and filters the explicit default space; exact-only does not list. Each
unsupported or failed object has an identity-bearing diagnostic, retained successful
receipts, and a nonzero aggregate. Empty inventory succeeds without files. API 65.0/default
and selection validation precede authentication. General deployment remains unimplemented.
Internal `readDeployInputs` now resolves explicit files/directories or exact project
DMO members with bounded no-link authored-only JSON admission. Repeated identical
inputs coalesce; conflicting identities block. Public `deploy --preview` now wires
this resolver and per-item target preflight with core org/API/default scope flags.
Preview returns advisory create/update/unchanged/blocked-changes/blocked results without writes.
Shared execution preflight rejects authored categories other than Other and primary
keys that are non-Text or dynamic before target reads: these cannot qualify through
the current generated-recipe readback contract. Offline mapping remains broader;
no authored field-count or unrelated field-type restriction is introduced.
Without preview the command preflights the whole selection before sequential executor
calls, stopping on first blocked/failure/unknown mutation and retaining completed and
explicitly unattempted item receipts. Each executor still preflights independently. Internal `executeDmoCreate` now adds a fixed-endpoint
API65/default guarded POST following fresh complete-inventory absence proof. No-op
and blocked differences never POST. Independent common retrieval must qualify
identity, generated/qualifier integrity, relationships and authored meaning before
confirmed-created; missing/mismatched qualification or POST errors retain unknown
possible mutation with no retry/rollback. Public bounded execution is wired; artifact/report
writes and new live acceptance are not introduced. The common mapper remains more
permissive than the demonstrated projector; unqualified recipes never verify.

The pure offline `buildDmoUpdateDelta` helper constructs an allowlisted candidate
PATCH/expected overlay without authorizing updates. API 65 PATCH uses the exact
qualified DMO name; its documented response can contain old state. Separate GET
qualification is mandatory for future execution. Retained synthetic PATCH2 evidence
now qualifies the full expected overlay offline, including effective field-label
override with distinct unchanged Metadata base/master labels and complete raw
expectations. This single checkpoint does not prove general omission/new-field
preservation. Only the bounded label subset below is enabled publicly. Candidate tests alone
are not server evidence.

Public CLI label execution is now available through `executeDmoDeploy`; the command
admits the whole selection before writes and the service freshly qualifies each target/delta.
Preview explicitly opts into label deltas. Only object and existing non-primary
field labels within qualified Other/default/API 65 scope execute. New fields,
descriptions, primary-key labels and other unproven mixed changes block before writes.
Independent full readback verifies authored overlay plus raw runtime preservation;
HTTP 200 alone never confirms success. Ambiguity stops without retry or rollback.
Recorded Other evidence does not establish other categories or general updates.

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve keys, qualifiers, attributes, relationships, category and data space.
- [ ] Distinguish standalone custom versus standard/system/generated variants.
- [ ] Prove export-to-target create, nondestructive update and unchanged replay.

Internal `ConnectClient.deleteDataModelObject(name)` now provides a fixed API65
DELETE transport only, with non-namespaced custom-subset name syntax, no body/query,
refresh, retry or redirect. It has no enabled service or CLI. Syntax does not prove
Custom kind, default-space binding, ownership or dependency safety; 204/404 do not
confirm deletion. Dependency/collateral admission, public interface approval and
explicit disposable-fixture live-delete approval remain blockers. No live deletion,
non-cascading behavior or asynchronous status contract is claimed.

## mapping: unimplemented

- [ ] Record official endpoints, versions, pagination and inventory scope.
- [ ] Preserve deterministic source/target identity, fields and qualifier mappings.
- [ ] Verify replacement/update semantics cannot silently remove existing mappings.
- [ ] Prove schema-reference validation and supported create/update/no-op.

## identity-resolution: unimplemented

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve matching/reconciliation order, precedence, case and secondary objects.
- [ ] Classify generated-schema dependencies and automatic-run side effects.
- [ ] Prove configuration-only behavior without running resolution.

## data-graph: unimplemented

- [ ] Record official endpoints, versions, pagination and nested writable contracts.
- [ ] Preserve nested graph references and external dependencies.
- [ ] Establish a safe documented update route or explicitly block existing changes.
- [ ] Prove create/read-back/no-op without refresh, activation or delete/recreate.

## segment: unimplemented

- [ ] Record official endpoints, versions, pagination and supported variants.
- [ ] Preserve visual/SQL criteria, parameters, exclusions, identity and lookback.
- [ ] Classify schedule, publication and count side effects before mutation.
- [ ] Prove safe configuration-only create/update/no-op for declared variants.

## calculated-insight: unimplemented

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve exact SQL, dimensions, measures, relationships and settings.
- [ ] Classify implicit compute/enable/schedule side effects and block unsafe routes.
- [ ] Prove safe export-to-target create/update/no-op without computation.

## Bounded Git deployment selection

`deploy --changed-since <ref>` is exclusive with metadata/source-dir and supports
only current canonical default-space DMO JSON, admitted through the existing input
resolver. Repository-root resolution, unique merge-base/HEAD changes, index,
worktree and untracked selection are local. Relevant rename/delete blocks the
whole selection, regardless of diff.renames configuration. Git inference is not
historical rename-intent proof. A relevant untracked DMO addition plus any tracked
worktree deletion blocks conservatively; staging intended changes permits Git
rename inference, not unsupported lifecycle deployment. Empty selection succeeds
before downstream target inspection/services, without changing core parse-time auth.
Optional Git provenance records commits, not file-byte hashes or executable plans.
API65 preflight/execution guards are unchanged. Reports, CI delivery, exact-byte
binding and SQL companion selection remain unimplemented; roadmap chunk 6 is partial.

## Shared gates

ConnectClient SSOT GETs now use an operation-local no-refresh receiver, like guarded
writes: expired authentication fails immediately without OAuth refresh or replay.
Repair authentication before a new explicit invocation. Retry and redirect refusal
remain in place; the caller's connection and unrelated consumers are unchanged.
This does not change API-version discovery or the separate Metadata/SOAP guard.

- [x] Internal single-authored-DMO read-only deploy preflight independently maps
      source, proves absence through complete scoped inventory, and retrieves
      existing target through full common semantics. Identity-keyed field comparison
      ignores reorder only; differences are blocked with static reasons until PATCH
      is proven. Unknown target semantics and acquisition failures fail closed.
      No CLI preview wiring, filesystem discovery, mutation or live acceptance.

- [x] Common offline object projector composes the shared field join with exact
      custom identity/default scope, category/taxonomy classification, explicit
      DateTime references and complete retained relationships. Recognized Other
      generated defaults project with varied authored counts/types; unproven
      recipes/storage/taxonomy remain blockers. Missing Engagement event is a
      specific diagnostic; nonempty relationships are unsupported. Actual retrieval
      now uses this common path; no broader live acceptance is implied.

- [x] Internal common DMO/default authored-document writer with canonical JSON,
      independent persisted-candidate mapping validation, exact `default/dmo` path,
      unchanged-byte no-op, explicit overwrite and link/directory refusal tests.
      OS-temp flushed staging uses atomic publication on the same volume; cross-volume
      output fails closed. Concurrent filesystem replacement is not fully guarded.
      Exact/type/all retrieve selection now delegates here; each object still qualifies independently.

- [x] Read-only authenticated Connect REST transport, structured errors and redaction.
      Explicit DMO CLI integration is implemented; broader resource contracts remain pending.
- [x] DMO-only offset pagination, duplicate/loop and ceiling detection, synthetic tests.
      Official list endpoint is available from API 61.0: `limit` (default 50),
      `offset` (maximum 2000), `orderBy`; response array is `dataModelObject`.
      Internal helper requires `name` and `dataSpaceName`, returns raw entries,
      and requires a short terminal page. Non-null next URLs/tokens are rejected,
      never followed. No snapshot consistency under concurrent changes is claimed.
      [Official endpoint reference](https://developer.salesforce.com/docs/data/connectapi/references/spec)
      checked 2026-10-25; endpoint-specific text, not search-result synthesis.
      Other resource pagination and live API/version acceptance remain pending.
- [x] Internal incoming/outgoing raw relationship acquisition with synthetic tests.
      API 64.0 endpoint: `GET /ssot/data-model-objects/{dataModelObjectName}/relationships`.
      Explicit `dataspace`, unfiltered status/creation type, offset/limit pagination;
      totalSize must prove completion; count, when present, must match page length.
      API 65.0 read-only acceptance confirmed HTTP 204 for empty initial results
      and 142 relationships across eight pages for a standard DMO. Records use
      sourceObject/targetObject; qualifier objects remain raw, never guessed.
      Unknown envelopes and inconsistencies block; all entry metadata survives.
      Continuation links are never followed. Local offset budget is 2000.
      Qualified portable projection and replay remain blocked: the prior synthetic
      Engagement DMO detail omits eventDateTimeFieldName, despite a DateTime field.
      No inference or portable export is permitted from that response.
- [x] Common offline field join, independent of the compatibility projector.
      All 12 authored types, varied counts, exact one-to-one identity joins,
      authoritative primary/dynamic semantics and explicit multi-qualifier joins.
      Generated fields are excluded from authored candidates, not silently accepted:
      generated/qualifier/length/required/distinct replay remains diagnostic.
      Common object taxonomy/designations and complete relationships are now joined
      at the service boundary; incomplete projections never reach publication.
- [x] Offline strict Connect/Metadata projection for one relationship-free Other shape.
      Exact object/field joins, explicit qualifier binding and Metadata-authoritative
      primary/dynamic semantics; two authored fields and complete generated/readback
      expectations. Independently authored synthetic refusals cover unsupported variants.
      A separate experiment proved semantic equivalence only for one Other fixture.
      Autonomous create identity is verified only for this exact local profile:
      remove one terminal case-sensitive __dlm from the validated non-namespaced
      custom name. Result is offline projected with no identity blocker, retaining
      qualified readback identity and case; invalid names are rejected, not repaired.
      A pure bounded Other request mapper revalidates the complete projection,
      preserves proven authored __c names and excludes generated/read-only fields.
      Source and explicit target must both be default; arbitrary space acceptance
      is unproven. No public wiring, writable Metadata projection or transport
      mutation. Profile and Engagement remain pending; dmo family gates remain open.
- [x] Internal common read-only DMO retrieval at explicit API 65.0/default scope.
      Existing core Connection supplies Connect GET and Metadata CustomObject read;
      Metadata uses an operation-local connection/transport receiver that refuses
      all redirects without changing the caller or global defaults. Installed
      core/Metadata/SOAP/HTTP stack regressions cover same/cross-origin redirects,
      no second request, payload-free errors and retained core SOAP parsing;
      exact identity/cardinality, complete relationships, strict joined projection
      and offline mapper are required before returning full expectations. Synthetic
      acquisition/failure tests plus injected CLI/file boundary tests; no write transport added.
- [x] Separate offline authored-document Other/default request mapping.
      Approved Git shape is schemaVersion/kind/identity/spec only; runtime source
      expectations remain internal. Standalone JSON validates without a projection:
      exactly one Text primary and one DateTime nonprimary, dynamic lookup false,
      no field description/category or event/modified references. Names, labels,
      order and optional object description survive; unknown/runtime keys reject.
      Existing strict projection mapper and forged-profile refusals remain intact.
      Deploy still needs independent authored-file validation and target readback;
      no CLI, filesystem or transport write is implemented by this mapper.
- [x] Common offline authored DMO request mapper alongside unchanged narrow helpers.
      All 12 types, three categories, varied nonempty field counts, optional field
      category/description, true/false dynamic flags and exact DateTime references
      map individually into fresh allowlisted output. Source/explicit target default
      only. Unknown/runtime JSON rejects. Schema mapping is not selected-version live
      acceptance. Common projection/service/writer integration is synthetic-tested;
      deployment remains pending.
- [ ] Qualified logical references and verified data-space binding.
- [ ] Versioned deterministic artifacts, safe paths and unknown-field blocking.
      Partial internal DMO-only contract: qualified identity, all 12 nested input
      field types, dynamic lookup, field category, deterministic JSON and strict
      unknown-field validation are synthetic-tested. Raw field projection retains
      qualifiers/distinctness/usage and generated fields separately; every result
      is explicitly incomplete until separate relationships are acquired. Generated
      field/qualifier replay is unverified. No published schema, safe paths,
      filesystem discovery or live portable round trip yet.
      See [current contract and official evidence](artifact-format.md).
- [ ] Whole-selection dependency/diff preflight and input/target drift guards.
- [ ] Read-back verification and partial/uncertain failure handling.
- [ ] Bounded opt-in live acceptance with explicit fixture ownership ledger.

No live fixtures were created, claimed, modified or removed by this slice.
