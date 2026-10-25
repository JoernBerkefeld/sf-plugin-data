# Data360 Salesforce CLI plugin

`@joernberkefeld/sf-plugin-data360` is an independently authored TypeScript/ESM
bootstrap for portable Data360 configuration. **No retrieval or deployment is
implemented.** Both entry points fail explicitly without authentication or network
calls. This is not yet a usable migration tool or a published release.

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
`deploy --preview` for read-only target-aware comparison. Selectors, org flags,
preview and filesystem artifacts are deliberately **not implemented** yet. There
is no public plan command or saved-plan infrastructure.

## Scope and safety

Seven planned families are tracked in [capabilities](docs/capabilities.md).
An internal read-only Salesforce-core transport now accepts an explicit API
version and only same-origin `/services/data/v<version>/ssot/` requests. It rejects
redirects and emits payload-free structured errors. It is not wired to the CLI;
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
must never be exported alone. This is not yet an export/deploy format; qualified
relationship projection, generated-field replay and filesystem handling remain
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
Metadata or incomplete relationships fail without partial results. No CLI or
filesystem wiring exists. Profile and Engagement remain
pending; no writable Metadata projection or CLI mutation is provided. See the exact subset and evidence in the artifact document.
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
