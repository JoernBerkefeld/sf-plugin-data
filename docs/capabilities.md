# Capability contract checklist

General seven-family support is **unimplemented**; explicit bounded DMO retrieval
is available through current service-owned capability checks, not a permanent
fixture-specific architecture. No endpoint or writable variant is
claimed verified. Historical API observations are not implemented contracts.
Every family must complete all gates below before support can be declared.

## dlo: unimplemented

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

## Shared gates

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
