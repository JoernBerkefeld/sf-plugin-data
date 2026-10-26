# Data360 Salesforce CLI plugin

`@joernberkefeld/sf-plugin-data360` is an independently authored TypeScript/ESM
plugin for portable Data360 configuration. **Bounded explicit DMO retrieval is
implemented; strictly read-only deployment preview, bounded guarded creation and label updates are available.** Current retrieval capability is
owned by the common service (API 65.0/default, qualified generated recipe and semantics),
not a permanent DMO architecture. This is not yet a general migration tool or a
published release.

```sh
sf data360 retrieve -o source --api-version 65.0 --data-space default -m dmo:Example__dlm -d ./project --json
sf data360 retrieve -o source -m dmo:Example__dlm -d ./project -x
```

`-m/--metadata` is repeatable/non-greedy: exact `dmo:ApiName` selectors coalesce
and sort without an inventory request. `-m dmo` retrieves all DMOs in the selected
space using complete inventory; omitting selectors retrieves all implemented
families (currently DMO only). There is no `--all` flag. Mixed type/exact selections
coalesce. Empty inventory succeeds with no files. Unsupported objects are not
silently skipped: diagnostics identify each object and precise capability/error
code, successful file receipts are retained, and the aggregate exits nonzero. `-o/--target-org` overrides the configured default org. `-d/--output-dir`
is a project root, default cwd; output is `data360/default/dmo/<api-name>.json`.
`-x/--overwrite` permits differing file replacement; identical bytes are unchanged.
Selectors and API 65.0/default scope are validated before core org resolution or
resource reads; the common service remains the per-object capability boundary.
`--json` uses Salesforce CLI's normal outer result wrapper containing a versioned
`sf-data360-retrieve` envelope with status, metadata, diagnostics, provenance and
result. Both retrieve and deploy resolve `metadata.plugin.version` and
`provenance.pluginVersion` from this plugin's own package metadata, not the host
Salesforce CLI version. Blocked/failed work exits 1, success exits 0. Parser/auth flag failures use
core CLI diagnostics; runtime errors never include remote payloads. No org mutation.

A common offline `joinDmoConnectMetadataFields` helper now joins arbitrary
nonempty field counts and all 12 authored types with exact identity, primary,
dynamic and explicit qualifier semantics. Generated fields stay outside authored
fields; unqualified replay semantics remain blockers. The common object projector
now qualifies complete acquired inputs before the service/command publishes an
authored candidate; no fixed authored count or fixture-specific command rule applies.

Internal `preflightDmoDeploy` now performs read-only target-aware comparison for
one explicitly supplied authored DMO and API 65.0/default connection. Complete
inventory alone proves absence; existing targets must pass common full retrieval.
Field reordering alone is unchanged. Public preview opts into qualified object and
existing non-primary field label updates; unsupported differences and unknown target semantics fail closed. Its preview
contains static diagnostics, never requests, raw org IDs or remote payloads.
`sf data360 deploy --preview` now uses this service for every explicitly selected
local authored input. API 65.0/default scope remains service-owned. Execution
admission requires Other category with a nondynamic Text primary key; other
portable offline schemas are blocked before target reads because current readback
cannot qualify them. Authored counts and other field types remain unrestricted.
Internal `executeDmoCreate` now performs fresh preflight, a single guarded create only
on proven absence, and independent qualified readback. Existing equality is a no-op;
existing differences remain blocked. HTTP success alone is not verified creation;
ambiguous failures retain `mutation: unknown` and require target inspection, never
automatic retry or rollback. Public CLI creation delegates to this service through `executeDmoDeploy`;
qualification remains synthetic only, not broader deployment or live acceptance.
Metadata SOAP reads refuse same-origin and cross-origin redirects through an
operation-local transport guard; core still owns credentials and SOAP parsing,
and the caller connection/global transport defaults are unchanged.

Internal offline `buildDmoUpdateDelta` constructs a minimal candidate PATCH and a
nondestructive expected overlay, or returns blockers only. It preserves target-only
fields and omitted descriptions; no removal/tombstone syntax exists. This is not
itself mutation authorization. Public preview and `executeDmoDeploy` now admit only object and existing
non-primary field label changes within the qualified Other/default/API 65 scope.
The selection is fully admitted before writes, then freshly qualified per item;
independent readback must match the overlay and preserve full runtime state. New
fields, descriptions, primary-key labels and other unproven changes block atomically.
Results distinguish `confirmed-updated`, `not-attempted` and `unknown`; ambiguity
stops the public selection without retry or rollback.
API 65 PATCH
routing is documented. Retained synthetic PATCH evidence now qualifies the observed
existing-field display override and complete authored overlay offline; the common
projector reconciles Connect labels with Metadata field overrides while preserving
base/master observations. This is one recorded checkpoint, not general update or
new-field preservation acceptance. HTTP 200 can contain old state, so
execution independently GETs and qualifies readback.

An internal read-only `readDeployInputs` resolver now admits explicit authored JSON
files/directories or repeated exact `dmo:ApiName` project selectors. Identical paths
coalesce; different files claiming the same identity fail. No selection, bare types,
mixed modes, malformed JSON, duplicate JSON keys, runtime projections and linked
paths fail closed. Directory mode is bounded and strict: every descendant file must
be authored DMO JSON; unrelated files are not silently ignored. This input-only
resolver is wired to preview and execution; input admission alone never authorizes writes.

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

### Read-only deploy preview

```sh
sf data360 deploy --preview -o target -d ./project/data360/default/dmo --json
sf data360 deploy --preview -o target -d ./authored.json -d ./more-authored.json
sf data360 deploy --preview -o target -m dmo:Example__dlm -m dmo:Another__dlm --json
```

Exactly one repeatable/non-greedy mode is required: `-d/--source-dir` selects explicit
files or directories; `-m/--metadata` selects exact project members from cwd.
No bare type, omitted selection or implicit deploy-all is allowed. All sources
resolve and validate before target inspection. Core `-o/--target-org` supports the
configured default org and explicit override; `--api-version` defaults to 65.0 and
`--data-space` to default, with capability checks delegated to preflight.

The normal core JSON wrapper contains `sf-data360-deploy` contract version 1.0.0,
status/metadata/diagnostics/provenance/result and one advisory `preview` item per
input. `create` means complete-inventory absence, not an executed create;
`update` means an admitted object/existing non-primary field label delta, not an executed update;
`unchanged` means qualified no-op. `blocked-changes` and `blocked` make aggregate
status blocked/exit 1; unexpected failures make status failed/exit 1. Mixed results
remain visible. Preview writes no local artifact/report and performs no mutations.
Without `--preview`, the same explicit selection performs guarded creation or bounded label updates. The whole
selection is preflighted before any executor call; a known blocker or preflight failure
prevents all writes. Each executor independently repeats fresh preflight; unchanged
items do not write. Execution is sequential and stops on the first blocked, failed or
unknown-mutation item. This is not atomic and provides no concurrency guarantee.
Execution items use `operation: execute`, `outcome: created|updated|unchanged|blocked|failed|not-attempted`,
`mutation: confirmed-created|confirmed-updated|not-attempted|unknown`, optional preflight and diagnostics.
Prior completed receipts remain visible; remaining items are explicitly not-attempted.
Only all-created/updated/unchanged results yield aggregate success/exit 0; blocked/failed
execution exits 1 even after prior mutations. Unknown mutation means creation or update may have
occurred: inspect target before another attempt. No retry or rollback. Additions, descriptions,
primary-key labels and other unproven changes (including mixed edits) block before writes.
Parser/auth flag errors retain core formatting. No public plan or saved-plan infrastructure.

## Scope and safety

`projectCommonDmoConnectMetadata` now composes the shared offline field join and
object semantics in one common implementation used by actual retrieval. Recognized Other generated defaults retain a successful projection across
varied authored counts/types; unproven generated recipes, taxonomy, storage or
execution semantics remain explicit blockers. Explicit date references resolve
exactly to authored DateTime fields; missing Engagement event designation is a
specific blocker, never inferred. Complete nonempty relationships are retained
but unsupported. Incomplete status, blockers or absent candidates prevent publication;
no new live replay acceptance is claimed.

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
relationship replay and broader generated-field replay remain unimplemented;
qualified authored filesystem publication is available below. A second offline helper joins exact Connect/Metadata identities for
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
`retrieveDmo` service now acquires detail, Metadata CustomObject and complete
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
pending; no writable Metadata projection is provided. Public creation uses the guarded common executor, not this narrow mapper alone. See the exact subset and evidence in the artifact document.
The separate common `buildDmoCreateRequestFromDocument` offline mapper accepts
all 12 documented field types, Profile/Other/Engagement, any nonempty authored
field count, boolean dynamic lookup, optional field category/description and
explicit exact DateTime event/record-modified references. It constructs a fresh
allowlisted request from authored JSON; source and explicit target remain default.
Actual retrieval now uses the common projector and mapper; unknown or incomplete
semantic variants return specific blockers and no file. Profile/Engagement generated
replay remains unqualified, not a separate category implementation. No general
export/deployment or new live API acceptance is claimed.

An internal `writeDmoDocument(candidate, projectRoot, overwrite)` validates
standalone DMO/default authored JSON independently through the common mapper, serializes canonically and
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
