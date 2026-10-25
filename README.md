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
Relationships are not acquired; candidates must never be exported alone as
portable documents. This is not yet an export/deploy format; relationship
acquisition, generated-field replay, filesystem handling and other families
remain unimplemented. See the exact subset and evidence in the artifact document.
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
