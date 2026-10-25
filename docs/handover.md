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

| Component | Needs update? | What to update | Status |
| --- | --- | --- | --- |
| sf-plugin-data360 | Yes | README, capabilities, artifact evidence, handover | done |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser | N/A | No coupling | not needed |
| sfmc-language-lsp, vscode-sfmc-language | N/A | No language change | not needed |
| mcp-server-sfmc, mcp-server-mcdev | N/A | No consumers | not needed |
| sf-plugin-mcnext, sf-plugin-cms | N/A | Independent packages | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc | N/A | No coupling | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A | No coupling | not needed |

Wiki/sites/tool listings/hover and Git workflow need no update. No npm changelog.
Root registration is coordinator-only and remains outside this slice. Gate 5
slice docs are applied; whole-milestone review is deliberately not claimed.

| Folder | Changed? | Current version | New version |
| --- | --- | --- | --- |
| sf-plugin-data360 | Yes | 0.1.0 | No bump; no release prepared |

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

| Component | Needs update? | What to update | Status |
| --- | --- | --- | --- |
| sf-plugin-data360 | Yes | README, capability, artifact evidence, handover | done |
| ampscript-data, ssjs-data, csv-parser, ampscript-parser | N/A | No coupling | not needed |
| sfmc-language-lsp, vscode-sfmc-language | N/A | No language change | not needed |
| mcp-server-sfmc, mcp-server-mcdev | N/A | No consumers | not needed |
| sf-plugin-mcnext, sf-plugin-cms | N/A | Independent packages | not needed |
| eslint-plugin-sfmc, eslint-plugin-mcdev, prettier-plugin-sfmc | N/A | No coupling | not needed |
| ssjs.guide, mso-conditional-parser, eslint-plugin-mso-email, vscode-mso-conditionals | N/A | No coupling | not needed |

Wiki/sites/hover and Git workflow need no update. No npm changelog or release.
Root registration remains coordinator-only and was not edited.

| Folder | Changed? | Current version | New version |
| --- | --- | --- | --- |
| sf-plugin-data360 | Yes | 0.1.0 | No bump; no release prepared |

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
