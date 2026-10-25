# Capability contract checklist

All seven families are **unimplemented**. No endpoint or writable variant is
claimed verified. Historical API observations are not implemented contracts.
Every family must complete all gates below before support can be declared.

## dlo: unimplemented

- [ ] Record official list/detail/create/update endpoints and API versions.
- [ ] Prove pagination, complete schema and stream/connection/lineage bindings.
- [ ] Classify writable/read-only/unknown fields and connector prerequisites.
- [ ] Prove configuration-only create/update/no-op without starting ingestion.

## dmo: unimplemented

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

- [x] Read-only authenticated Connect REST transport, structured errors and redaction.
      Synthetic verification only; CLI integration and resource contracts remain pending.
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
- [x] Offline strict Connect/Metadata projection for one relationship-free Other shape.
      Exact object/field joins, explicit qualifier binding and Metadata-authoritative
      primary/dynamic semantics; two authored fields and complete generated/readback
      expectations. Independently authored synthetic refusals cover unsupported variants.
      A separate experiment proved semantic equivalence only for one Other fixture.
      Always incomplete with CREATE_IDENTITY_UNVERIFIED; no create-name guessing,
      public wiring, writable Metadata projection or transport mutation. Profile and
      Engagement remain pending. This does not complete the dmo family gates.
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
