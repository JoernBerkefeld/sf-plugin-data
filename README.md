# Data360 Salesforce CLI plugin

`@joernberkefeld/sf-plugin-data360` is an independently authored TypeScript/ESM
plugin for portable Data360 configuration. **Bounded explicit DMO retrieval is
implemented; deployment remains unimplemented.** Current retrieval capability is
owned by the existing service (API 65.0/default, evidenced two-field Other profile),
not a permanent DMO architecture. This is not yet a general migration tool or a
published release.

```sh
sf data360 retrieve -o source --api-version 65.0 --data-space default -m dmo:Example__dlm -d ./project --json
sf data360 retrieve -o source -m dmo:Example__dlm -d ./project -x
```

`-m/--metadata` is repeatable/non-greedy but currently requires exactly one explicit
`dmo:ApiName`; type-only, discovery and no-selector retrieval remain pending future
semantics. `-o/--target-org` overrides the configured default org. `-d/--output-dir`
is a project root, default cwd; output is `data360/default/dmo/<api-name>.json`.
`-x/--overwrite` permits differing file replacement; identical bytes are unchanged.
Core API/version flags are passed unchanged to the service capability boundary.
`--json` uses Salesforce CLI's normal outer result wrapper containing a versioned
`sf-data360-retrieve` envelope with status, metadata, diagnostics, provenance and
result. Blocked/failed work exits 1, success exits 0. Parser/auth flag failures use
core CLI diagnostics; runtime errors never include remote payloads. No org mutation.

## Local development

Requires Node `^22.22.2 || ^24.15.0` and npm. Run from this independent repository:

```sh
npm ci --no-workspaces
npm run lint
npm test
npm run smoke
npm run smoke:package
node bin/run.js data360 --help
node bin/run.js data360 retrieve --help
node bin/run.js data360 deploy --help
npm pack --dry-run --json
```

The `bin/run.js` executable is a development/help runner, not a replacement `sf`
binary. The package's oclif metadata exposes the `data360` topic to Salesforce CLI.
Do not install into a shared CLI profile for acceptance: other installed plugins
may own the same topic. Packaged CLI installation acceptance will use a dedicated
profile and exact unsigned-package allowlist in a later slice.

The intended interface is `sf data360 retrieve` and `sf data360 deploy`, with
`deploy --preview` for read-only target-aware comparison. Deployment selectors and
preview are **not implemented** yet. Explicit retrieve selectors/org flags/files
are implemented only within the current service capability. There
is no public plan command or saved-plan infrastructure.

## Scope and safety

Seven planned families are tracked in [capabilities](docs/capabilities.md).
An internal read-only Salesforce-core transport now accepts an explicit API
version and only same-origin `/services/data/v<version>/ssot/` requests. It rejects
redirects and emits payload-free structured errors. Explicit DMO retrieval is now wired to the CLI;
no resource-family support is implied. Internal DMO list pagination now uses the
official offset contract, rejects malformed/overlapping pages and unexpected next
links, and fails closed at the documented offset ceiling rather than returning a
partial inventory. It does not provide a consistent snapshot during concurrent
org changes. An internal portable DMO validator/serializer now covers a narrow,
offline custom schema with all 12 nested input field types, dynamic lookup and
field category, strict unknown-field rejection and ordered-field preservation.
Raw projection produces an explicitly incomplete diagnostic candidate, retaining
qualifiers, semantic metadata and generated fields in separate configuration.
A separate internal relationship helper now acquires incoming/outgoing raw metadata
in an explicit data space, requiring total-size consistency and bounded offset
completion. API 65.0 live inspection confirmed HTTP 204 for an empty initial list,
optional count metadata, and sourceObject/targetObject endpoint records. Unknown envelopes block; raw entry fields are preserved. It is not yet
bound to field projection: candidates still carry RELATIONSHIPS_NOT_ACQUIRED and
must never be exported alone from that incomplete helper. Qualified
relationship projection, broader generated-field replay and filesystem handling remain
unimplemented. A second offline helper joins exact Connect/Metadata identities for
one proven relationship-free Other shape, binds qualifiers by explicit metadata
reference, and uses authoritative primary/dynamic flags. It retains full readback
expectations and now verifies the autonomous create identity for that exact local
profile: remove one terminal case-sensitive `__dlm` from a validated non-namespaced
custom name, preserving case and internal single underscores. It returns an offline
`projected` result with no identity blocker, not a deployable artifact or request.
A pure internal Other create-request mapper now rechecks the complete joined
projection and explicitly binds only evidenced source/target `default` space.
It preserves authored `__c` field names and excludes generated fields, org IDs
and read-only metadata. It performs no transport. An internal read-only
`retrieveOtherDmo` service now acquires detail, Metadata CustomObject and complete
relationships using an existing Salesforce core connection, explicitly at API
65.0/default only. It validates both projection and mapper, returning the full
projection/expectations rather than a detached candidate. Missing/ambiguous
Metadata or incomplete relationships fail without partial results. The retrieve
command delegates to this service and passes only its candidate to the writer. The approved Git artifact contains only
`schemaVersion`, `kind`, `identity` and `spec`; runtime source expectations remain
internal. A separate `buildOtherDmoCreateRequestFromDocument` mapper accepts this
standalone authored JSON with explicit default target binding, validates it and
maps only Other with one Text primary and one DateTime nonprimary field, both
without dynamic lookup. It preserves exact names, labels, field order and optional
object description; unsupported semantics and runtime keys reject. This offline
mapping is not deploy acceptance: deployment must separately validate the authored
file and later verify target readback. Profile and Engagement remain
pending; no writable Metadata projection or CLI mutation is provided. See the exact subset and evidence in the artifact document.
An internal `writeOtherDmoDocument(candidate, projectRoot, overwrite)` now validates
standalone Other/default authored JSON independently, serializes canonically and
writes `data360/default/dmo/<api-name>.json` beneath the project root. Identical
bytes are unchanged; differing regular files require overwrite. Linked ancestors,
linked destinations and directory/file collisions reject. Complete flushed staging
uses OS temp and atomic rename/exclusive hard-link publication; cross-volume
publication fails closed, with no copy fallback. There is a residual concurrent
filesystem replacement race between path validation and publication; this is not
a hostile-process filesystem sandbox. The command now delegates output here unchanged.
No org was contacted or changed by synthetic tests. Smoke tests retain isolated
state in newly allocated OS-temp roots; they never delete recursively. Windows
contributors on this workspace machine must use `F:/Temp` for TEMP, TMP (when set),
TMPDIR (when set), and actual Node `os.tmpdir()`. Verification rejects mismatches.
Linux CI uses its normal OS temp directory.

See [artifact format status](docs/artifact-format.md),
[Git workflow](docs/git-workflow.md), and [handover](docs/handover.md).
Release notes belong in GitHub Releases; this npm package has no changelog file.
The release workflow is prepared but requires a future approved remote, npm
ownership/trusted-publisher configuration and release verification. No publication
or remote creation is authorized by this bootstrap.
