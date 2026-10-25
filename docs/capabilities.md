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
- [ ] Complete pagination, loop/truncation detection and synthetic fixtures.
- [ ] Qualified logical references and verified data-space binding.
- [ ] Versioned deterministic artifacts, safe paths and unknown-field blocking.
- [ ] Whole-selection dependency/diff preflight and input/target drift guards.
- [ ] Read-back verification and partial/uncertain failure handling.
- [ ] Bounded opt-in live acceptance with explicit fixture ownership ledger.

No live fixtures were created, claimed, modified or removed by this slice.
