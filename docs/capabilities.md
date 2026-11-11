## Public native Data Graph CRD — 2026-11-05

Explicit API68/default retrieval exports a distinct `.native-dataGraph.json`
(`kind: native-data-graph`, `apiVersion: 68.0`), not the existing API67 facade
`.dataGraph.json`. Scope is one root-only NONE graph on enabled standard
`ssot__Individual__dlm`, with ordered Text Id, key-qualifier and FirstName fields.
Deploy/delete accept auto/API68 for this native artifact; auto/API67 facade
retrieval and the existing bounded LastName update remain unchanged.

Absent create requires independent absence/root checks and --allow-processing;
creation automatically generates supporting resources and defaults to daily full
refresh with incremental refresh disabled, despite omitting schedule input. Identical deploy is
zero-write unchanged; a different existing definition blocks because native UPDATE
is not implemented. GUI UPDATE evidence is not native REST/plugin support.
Preview is read-only. Native Git selection, mixed families,
other roots/graphs and cascade are unsupported.

Delete needs an exact selector, matching local native artifact, --confirm-delete
and fresh ready/identity/created-date/definition/root checks, with explicitly empty
known dependency/related-segment arrays. Unknown/nonempty dependencies block;
exhaustive external-consumer exclusion remains unverified. Live API68 create/read/
delete evidence ultimately confirmed independent graph-definition absence after
stale-metadata reconciliation. No generated DMO/mapping/transform/internal-state,
storage/credits cleanup or computation claim. Installed package smoke verifies
offline routing only, not live installed cross-org acceptance. README's 14-resource
row records Partial native create/delete and retains the separate facade update.

## Public native calculated insight lifecycle — 2026-11-05

This current contract supersedes the historical CI-only boundaries below. Explicit
API68/default supports paired draft create/edit, separate NOT_SCHEDULED publish,
qualified bidirectional expression edits on ACTIVE, exact ACTIVE retrieval and
source-paired confirmed deletion. Default/auto retains legacy65 existing-ACTIVE
behavior. Internal native64–68 feasibility does not qualify public lifecycle at
those other versions. Native68 runtime and fixed65 XML/Metadata/dependency routes
remain distinct. No general SQL, schedule conversion, populated/ran owner or
Metadata-shell conversion is admitted.

Create needs exact dual absence and --draft; draft edits retain draft:true.
Publication is explicit; ACTIVE expression PATCH omits draft. Full equality is
GET-only unchanged without processing acknowledgement. Present-owner delete needs
its matching XML/JSON pair, exact selector, --confirm-delete, fresh never-run
NOT_SCHEDULED content and dependencies. No cascade/local removal/retry/rollback.
Bounded independent settlement, not response echoes, confirms mutations.

Installed cross-org create/publish, byte-identical XML/JSON retrieval, GET-only no-op,
and ACTIVE edit passed. Two initial installed deletes returned
CI_DELETION_UNCONFIRMED despite later confirmed runtime/Metadata absence; their
causes remain unexplained. A later installed delete passed after six DELETING polls
and dual absence on poll seven (35.2 seconds). This is not reliable-every-time or
version-specific-defect proof. All CI fixtures are independently absent. ACTIVE is
not calculation proof; physical storage/credits and computation remain unknown.
The README 14-resource table now records scoped Partial create/update/delete,
not general CRUD or released-package qualification. Private evidence has a recovered
observer-journal finalization gap; see the current handover for its exact limits.

## Installed API61 mapping create and single addition — 2026-11-04

Fresh empty custom Other/Text fixtures passed installed public mapping create, exact
canonical retrieval, filtered target binding lookup, one additive Text identity pair
and a GET-only unchanged repeat at explicit API61, with `--dataspace` omitted.
Captured native routes retained v61.0 and omitted the dataspace query; mapping write
bodies carried no scope field. Independent reads confirmed ACTIVE mapping settlement,
all prior pairs/selectors, the full DLO and DMO field/key definitions; only the added
Extra__c isMapped flag changed during update. Create/update previews were read-only.

This covers the exercised API61 create, read and one-pair addition with omitted
scope, not general CRUD or inventory pagination. API60 GET404 is separate evidence,
not POST/PATCH/DELETE rejection proof. Pair removal (desired-state) is admitted at
every native version the plugin accepts and is observed through the plugin at API 61,
64 and 68. No nondefault space, ingestion, populated data
or released-package qualification follows. The fresh sole mapping and both parents
are deliberately retained under the accepted last-mapping limitation; no delete,
parent cascade or terminal cleanup was attempted.

# Capability contract checklist

## Installed mapping cross-org acceptance — 2026-11-04

API68/default empty Other/Text fixtures passed exact source mapping retrieval,
portable JSON transport changing only logical source-DLO/target-DMO bindings,
target-local mapping creation and canonical retrieval. One additive Extra Text
identity pair persisted; repeated preview/execution was GET-only and unchanged.
Explicit create/update previews were independently checked as nonmutating.

Whole-mapping deletion is specified under
[Native mapping targets](#dmo-native-route-bounded-live-verification) below. The
last mapping of a custom DMO is not deleted, so the exact owned source and target
final mappings and their parents remain; DMO object deletion/cascade was not tested.
This is not general schema portability, populated-object, lower-version,
inventory-completeness or released-package proof.

## Native standalone DMO unchanged deployment — 2026-11-04

Historical record of the 2026-11-04 scope. Its limits (Other category, Text fields,
label and additive Text updates only) no longer apply; current behaviour is in the
[dmo section](#dmo-native-route-bounded-live-verification) below.

Exact native `dmo:Name__dlm` deployment compared the existing target only after
all scope, key and field-preservation checks. Equal labels with no additions returned
`unchanged` / `not-attempted`, without POST or PATCH. Field order is immaterial;
the deliberate omission of ordinary generated System `KQ_Id__c` from saved JSON
is not a removal. At that time other field edits were blocked, and label changes and
ordinary nonprimary Text additions used independent post-write GET confirmation.

Fresh isolated-installed API68 acceptance transported an exact source-retrieved
portable Other/default empty Text DMO into the target with a different local ID.
Raw generated-field and primary-key definitions were preserved; portable source
and target definitions matched. Label plus additive Text update persisted; actual
repeat was GET-only. All create/update/delete previews were explicitly selected
and independently checked as nonmutating. Both exact owned fixtures were deleted
without cascade and independently absent by name. Protected returned inventory
subsets were preserved; 200 returned entries without count/page metadata do not
establish complete inventories. Scoped mapping/relationship checks are not
exhaustive dependency discovery. No ingestion, populated-object, lower-version,
mixed-family or released-package qualification is earned.

## Native standalone DLO unchanged deployment — 2026-11-04

Exact native `dlo:Name__dll` deployment now compares the existing target after all
category, data-space, primary-key and field-preservation admission. Equal labels
and no added fields return `unchanged` / `not-attempted`, without POST or PATCH.
Field order is immaterial. A file may omit the fields Salesforce generated
(`cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`,
`InternalOrganization__c` and the key qualifier of the primary key, `KQ_<Key>__c`,
for example `KQ_Id__c`); they stay as they are, so a hand-written file with only the
authored fields deploys onto its existing DLO. Any other omitted field is refused
(`UNSUPPORTED_DLO_FIELD_CHANGE`). A listed field is compared on the keys the file
states; keys only the org's copy carries are ignored, and a differing stated key is
refused with the same code. Label changes and ordinary nonprimary Text additions
retain the existing update route.

Fresh isolated-installed API68 acceptance retrieved an empty standalone Other/default
DLO from the source and deployed the exact saved file into the target, with differing
org-local IDs and independent full generated/primary-key preservation. A label and
additive Text update persisted; repeated deploy captured only GET, no mutation.
Both exact owned fixtures were independently confirmed absent after guarded deletion.
This does not close mixed-family dependency acceptance, ingestion, populated-object,
lower-version or released-package qualification.

## Qualified Segment forward predicate update — 2026-10-30

Existing ACTIVE API65/default single-model DBT owners now admit the isolated forward
addition `AND <same selected object.field> IS NOT NULL` to the existing `WHERE 1 = 0`
SQL. Exact object/field, model, labels, settings and bindings must remain unchanged.
Reverse transitions, other predicates, combined SQL/label edits and arbitrary SQL
remain blocked. Equality of either admitted form remains zero-write and needs no
processing acknowledgement; an actual update requires `--allow-processing`.

One source existing-owner PATCH independently settled ACTIVE with exact desired
runtime/Metadata SQL and preserved IDs, generated references, NO_REFRESH/P90D and
PROFILE primary-field binding. This is a persisted definition change, not audience
membership, computation, CREATE or cross-org proof. Fresh public current-worktree
unchanged-deploy acceptance is recorded in the handover separately from historical
installed-package acceptance. No new fixture, rollback or cleanup was performed.

## Installed Segment source-only acceptance — 2026-10-29

The installed public plugin passed exact retained ACTIVE existing-owner acceptance on
source only, API65/default: independently correlated runtime/XML and compatible PROFILE
binding; exact retrieval and byte-stable repeated JSON/XML retrieval; unchanged preview
with empty requiredEffects; unchanged deploy WITHOUT --allow-processing returning
unchanged/not-attempted with empty requiredEffects; independent final full preservation.
This qualifies installed source-only existing-owner behavior, not cross-org, CREATE,
two-selection, meaningful DBT-definition updates or computation.
The original unknown update remains historical; no PATCH was replayed.

Whole run9m58.020s including owned snapshot build/prepack/install/final audit:39/100
observable logical read events,15/16 conservatively counted org-facing processes
(including9 standard children; actual Salesforce CLI commands13),9/9 permitted read-only
Metadata retrieval jobs with status polls. Child/auth HTTP counts remain unknown;
100 is an observable-event stop threshold, not a global wire cap. Zero configuration
mutations, processing/deployment/activation jobs or target calls. Read-only Metadata
retrieval jobs are not configuration deployment jobs. README's14-resource Segment
qualification was reconciled without changing ratings or icons. Current acceptance is
bound to132 frozen inputs and118 installed files; exact provenance is in the handover.

## Public existing-target Ingestion API DLO

Exact `ingestion-dlo:Name__dll` selectors, canonical JSON files and Git-selected
members support retrieve/preview/deploy at fixed API67/default space (`auto` or
numeric67; mixed API65 families require auto). No inventory, creation, deletion,
connector provisioning. Acquisition binds exact returned
DLO/stream/connection identities through complete inventories and a single schema
event; never parses generated names. Shared sources, multi-event schemas, unknown
meaningful properties, additional pending fields and unsupported variants block.

Portable configuration contains logical connection name and complete Text event.
Equality is zero mutations without acknowledgement. Only exactly one Text addition
is admitted, with `--allow-processing`: one complete source schema PUT followed by
one stream sync, never a direct DLO patch. Private independent observations establish
old field/mapping/PK/KQ/system/refresh preservation and ACTIVE settlement. The finite
default poll window is six reads at60 seconds within360 seconds; no replay/rollback.

Whole-selection admission checks every family/version/input/effect before writes;
fresh full pending binding fingerprints precede dispatch. The executor's input
verifier checks local/Git bytes only, including after legitimate schema PUT; its
phase-specific independent target checks own source/sync preservation. Public
adapters retain diagnostic codes, stage, mutation certainty and both write routes.
Synthetic regressions exercise real public command dispatch and two-stage executor;
installed/live public and cross-org acceptance remain pending independent gates.

## Public Graph root-only workflow

Exact repeatable `data-graph:ApiName` selectors support public retrieve, preview,
guarded deploy and canonical file/Git selection. Use `--api-version auto` or numeric
67.0, default space; mixed Graph/API65 families require auto. Numeric65, latest,
inventory block before service reads or writes.
The admitted scope is the qualified root-only NONE configuration: unified Individual
logical root, ordered Text Id key/FirstName and the single forward non-key LastName
append, seven-day refresh and incremental disabled. Create/delete, nesting,
reverse projection, label/description and settings changes remain blocked.
A strict GET inventory rejects unknown meaningful properties rather than dropping
them. Computed node/field/output identities stay private. Portable JSON excludes
request-only `creationMode`; absent GET mode requires no historical receipt or
creation intent. A returned mode must explicitly be DEFAULT; DRAFT/null/unknown
values block. Update sends mode absent, not null or DEFAULT. This proves only the
qualified existing-owner omission variant, not arbitrary historical-mode preservation.

Acquisition reads exact Graph, its returned day-zero transform, then a fresh identical
Graph. Eligibility requires ACTIVE/SUCCESS, a completed dated run and matching
load-field/key/output lineage; an existing completed run may predate invocation.
Preflight independently binds API65 REST/Metadata root identity, required Text fields
and explicit key. Only equality or the complete preserved LastName append is admitted.
Execution rechecks input, dependencies and owner baseline, acknowledges processing,
and attempts one full update with `editScheduleOnly: false`. A zero-mutation unchanged
result does not require processing acknowledgement. Complete local selection admission,
digests, independent dependency/owner bindings and all-pending fresh checks precede
any mixed-batch mutation; one blocked Graph prevents every batch write.

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
The public family workflow above consumes this boundary. Installed/live public
zero-write acceptance remains separate from synthetic implementation verification.

## Internal native CI transport and feasibility — 2026-11-04

Direct native configuration lifecycles were independently exercised at API65–67
in one source org, using fresh default-space fixtures and the bounded engagement
expression. Draft POST, expression PATCH, explicit `NotScheduled` publication and
GET settlement succeeded; exact DELETE was confirmed by runtime `ITEM_NOT_FOUND`
and Metadata absence. API65 edited the ACTIVE expression; API66–67 edited the draft
before publication. Parsed DELETE responses did not retain raw HTTP status, so
no live DELETE204 claim follows. No calculation was explicitly run.

The separate standard CLI baseline retrieved the same definition sequentially at
API65–68: all four XML files were byte-identical, 678 bytes. Standard API65
Metadata definition create/read/update/delete also passed, while runtime reads
still returned `ITEM_NOT_FOUND` after create and update. Definition CRUD is not
runtime creation; these observations do not establish universal runtime absence.
All four owned qualification fixtures were independently confirmed deleted; physical
storage/credit cleanup is unknown. The four-fixture ceiling is exhausted. Native
API68, plausible lower versions and unchanged-source cross-org acceptance remain
unqualified; no introduction-version or public minimum-version claim follows.

`createCalculatedInsightClient` is an internal-only API65–67/default adapter,
not wired into public commands or lifecycle execution. It reuses guarded Connect
transport without refresh, retries or redirects. Create sends only the validated
minimal draft payload; update sends expression only; explicit publish separately
sends label, `draft: false` and `NotScheduled`. Full saved configuration is not
replayed as a write body. Item names are exact `__cio` identities. Responses,
including undefined DELETE and PROCESSING, remain untrusted; the lifecycle owner
must independently establish target ownership, dependencies, absence, settlement,
schema/schedule preservation and deletion. There is no automatic publication,
upsert, polling, no-op orchestration or public create/delete support in this slice.
The README's 14-resource CRUD table was checked and left unchanged.

## Public CI command boundary

Exact `calculated-insight:ApiName__cio` retrieve, preview and deploy are routed
through the qualified CI services at API65/default (`auto` selects that fixed route).
Retrieve requires independent native runtime/SOAP correlation, typed DMO binding,
and exact standard `MktCalcInsightObjectDef` project XML before whole-selection
publication through the strict pair writer. Git-selected CI pairs are captured,
compared to resolved inputs and freshly byte-verified before target execution.

Deployment is limited to existing ACTIVE Custom/CALCULATED_METRIC/IN_USE owners
with the qualified `APPROX_COUNT_DISTINCT` engagement expression, schema and
exact `SYSTEM_MANAGED` or `NOT_SCHEDULED` schedule with null schedule bounds.
Desired and target schedules must match; no schedule adaptation is performed. Only
the forward false-predicate plus DeviceId IS NOT NULL expression edit is writable;
complete equality is unchanged. Creation, shell conversion,
label/schedule/reverse and arbitrary SQL changes block.

The target-bound workflow starts from the target's retrieved correlated XML/JSON
pair, then edits only the qualified expression in both members. Two-profile
admission/preservation has synthetic coverage. Installed target-bound `NOT_SCHEDULED`
acceptance passed on October 29, 2026: one expression-only PATCH returned HTTP 200,
ACTIVE remained ACTIVE, and the qualified SQL changed from 324 to 397 bytes. Independent
runtime/Metadata/dependency readback confirmed schedule and nonexpression preservation;
the actual public repeat returned unchanged/not-attempted with zero mutations/jobs.
Last-run fields and error codes remained null; no successful computation is claimed.
This does not complete unchanged-source-artifact cross-org acceptance;
a `SYSTEM_MANAGED` source artifact still blocks against a `NOT_SCHEDULED` target.
The existing never-run/error-free runtime restriction is unchanged, so a source
reporting `SUCCESS` remains inadmissible. ACTIVE admission does not require a
successful target calculation run. CRUD ratings and operation scope are unchanged.
Updates acknowledge processing; every pending CI is rebound and preflighted before
any next mixed write. Input digest guards and private detached observation recording
are mandatory executor options. The existing executor attempts at most one PATCH,
bounds settlement, independently correlates final readback, and never replays unknown
mutations. The installed target-bound run consumed 8m52.853s including pack/install,
65/100 logical reads, 5/12 org-facing CLI invocations including the standard child,
2/12 settlement polls and 1/1 PATCH; explicit jobs/schedule writes/source calls were
zero. Child/auth HTTP traffic remains unknown, not a global wire-count claim.
Unchanged-source cross-org and successful-computation acceptance remain separate gates.

General seven-family support is **unimplemented**. Each family section below
states its own bounded scope; verified behaviour is named there and nothing beyond
it is claimed. Historical API observations are not implemented contracts.
Every family must complete all gates below before support can be declared.

`--api-version latest` is not accepted. Default/`auto` and explicit numeric pins
select the family-specific routes described in each section.

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

The unused internal API65 raw-page DLO evidence inventory helper and its
incomplete-evidence type have been removed. Current native DLO inventory remains
in `listNativeNames`, using the guarded GET transport and bounded offset/count
reconciliation. This internal cleanup changes no public command or native
retrieval behavior; the historical evidence below does not qualify ingestion,
stream/connector bindings, lineage or generated replay.

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

## dmo: native route, bounded live verification

The plugin has one DMO route, the native one. Default/`auto` uses API 68; numeric
pins from 61 are kept. The artifact is `data360/dmo/<ApiName>__dlm.dmo-meta.json`;
its format is described in [artifact formats](artifact-format.md). DMOs use only
this file location.

The plugin keeps no local allowlists. Category, field data types, label length,
object and field descriptions and extra keys are sent as authored; Salesforce
decides and its error is reported. Retrieval supports exact names, the bare type
and omitted selectors; standard, namespaced and generated DMOs can be retrieved. A
definition may omit generated and system fields. Keys only returned by reads
(`creationType`, `isDistinct`, `usageTag`, `keyQualifierName`) are kept in
retrieved files and never sent. After a write the plugin polls reads (up to 6,
5 seconds apart) to confirm the requested definition and the absence of removed
fields; a write is never repeated.

Observed at API 68 on two orgs with empty, unmapped custom DMOs in the default data
space:

- [x] Create with the categories Profile, Engagement and Other. Segment_Membership
      is internal-only; the other ten schema values are rejected. Input spelling is
      case-insensitive, reads return upper case, the plugin saves
      `Profile`/`Engagement`/`Other`. Engagement needs no event date key;
      `eventDateTimeFieldName` is rejected as unknown input.
- [x] Ten field data types: Number, Text, Date, DateTime, Url, Phone, Email,
      Percent, Boolean, Currency. ArrayOfFloats and ArrayOfTexts are rejected by the
      API. A Currency field adds the generated system field
      `cdp_sys_record_currency__c`.
- [x] Salesforce limits object and field labels to 40 characters, requires exactly
      one primary key (any accepted type), generates the key qualifier
      (`KQ_<key>__c`, `keyQualifierName`) and rejects input keys outside its schema.
- [x] Object `description` round-trips. Field `description` and `isDynamicLookup`
      are accepted but never returned by reads, and a field description does not
      appear in the Data Model UI either: the plugin sends them when a field is
      created or otherwise edited, and cannot detect or confirm a change to them
      alone.
- [x] Update by PATCH: change the object label, set or clear the object description
      (absent `spec.description` is not managed; an empty string clears it), change
      existing field labels, add fields of any accepted type.

Refused by the plugin before any write, because the native DMO API cannot do it:

- Changing an existing field's data type or moving the primary key (the API answers
  200 and silently ignores it): `UNSUPPORTED_DMO_FIELD_CHANGE`.
- Removing a field without `--allow-field-removal` (no native route):
  `UNSUPPORTED_DMO_FIELD_CHANGE`. Omitting a custom field that exists in the target
  counts as a removal. Omitting the target's primary-key field is refused with the
  same code, with or without the flag.
- Adding a generated field or a second primary key:
  `UNSUPPORTED_DMO_FIELD_ADDITION`.

Field removal with `--allow-field-removal` (deploy only, native DMO inputs only):

- Custom target fields missing from the file are removed with one Metadata API
  destructive change per DMO: `sf project deploy start --metadata-dir` with an empty
  `package.xml` and a `destructiveChanges.xml` listing `CustomField` members
  `<ObjectName>__dlm.<FieldName>__c`. The manifest version is the native API version
  in use. Names are validated before they are written into the manifest.
- Order: the PATCH for other changes first (skipped when removals are the only
  change), then the removal, then readback, which also requires every removed field
  to be absent. No write is retried.
- The DMO deploys in its normal position (DLO, DMO, mapping), also beside selected
  mappings that target it: PATCH, a wait until the PATCH is readable, then the
  removal. One result item per file.
- Salesforce drops a field's mapping pairs itself when the field is removed through
  the Metadata API. Observed at API 68, also with the field mapped by two mappings:
  exactly that field's pairs disappear, every other pair keeps its selector, both
  mappings stay ACTIVE, and the DMO's properties and other fields are unchanged. The
  plugin therefore removes a mapped field with the one destructive change and does
  not delete pairs one by one.
- The primary key and generated fields are never removed.
- A mapped field is removed with one command,
  `sf data360 deploy -m mapping:<MappingApiName> -m dmo:<Dmo__dlm> --allow-field-removal`,
  when the DMO file omits the field and the mapping file omits its pair. Before the
  first write the plugin lists the mappings that target the DMO read-only; every
  mapping holding a pair for the field must be reconciled by a selected mapping file
  (same source and target object) without that pair. A field held by several
  mappings needs every one of them selected without its pair.
- Otherwise the batch is refused with `DMO_FIELD_REMOVAL_MAPPED` before any write.
  The refusal names every mapped field with its mappings (`mappedFields` in JSON) and
  prints the retrieve command, the file edits and the single deploy command; without
  an identifiable mapping, or when the list request fails, it keeps the generic
  instruction. An unmapped field on a mapped DMO is removed normally. The `isMapped`
  marker on fields is never sent, compared or required.
- Right before the destructive change the plugin reads the DMO and all of its
  mappings again. A pair for a removed field held by a mapping that is not selected
  with a file, or targeting a field the admission did not cover, stops the DMO item
  with `DMO_FIELD_REMOVAL_MAPPED` before the destructive change; an earlier PATCH
  stays in place.
- After the destructive change: polled reads (up to 6, 5 seconds apart) until the
  fields are absent and every mapping equals its earlier state minus exactly the
  removed fields' pairs, ACTIVE. Any other change (another pair, field, DMO property,
  mapping or status) stops with `DMO_FIELD_REMOVAL_SIDE_EFFECT`. Not settled in time:
  `DMO_PERSISTENCE_UNCONFIRMED` (field still readable) or
  `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a pair still listed). Never retried, never
  rolled back; the DMO item is `failed` with mutation `unknown` and the batch stops.
- The DMO item lists `removedFields` and `droppedPairs` (`mapping`,
  `sourceFieldDeveloperName`, `targetFieldDeveloperName`). The selected mapping files
  deploy afterwards and find those pairs already gone; a file whose only change was
  dropping them reports `unchanged`. Deploying the mapping files first and the DMO
  file in a second command works as well.
- Observed at API 68 through the plugin on a custom DMO field mapped by two mappings:
  one deploy of both mapping files plus the DMO file removed the field, Salesforce
  dropped both pairs, and a repeat reported unchanged. A mapped custom field of a
  standard DMO is covered by synthetic tests only.
- Observed at API 68 on empty custom DMOs in two orgs; removal of mapped fields in one
  org only. Not verified: other API versions, non-default data spaces, fields that
  hold data or are referenced by a segment, calculated insight, relationship or other
  component.
- Preview reports the planned removals (`removeFields`,
  `DMO_FIELD_REMOVAL_PLANNED`) and writes nothing. For a mapped field the diagnostic
  says that Salesforce drops its pairs together with the field, so the selected
  mapping files find them already gone. A removal-only deploy reports `updated`; a
  repeat with the same file reports `unchanged`.
- A deployment that does not report every member as deleted fails with
  `DMO_FIELD_REMOVAL_FAILED` and Salesforce's problem text; the mutation is reported
  as unknown.
- The destructive change is observed on empty, unmapped custom DMOs with a manifest
  at version 65.

A category change is sent, and Salesforce rejects it ("Data Object Category cannot
be updated"). On a standard DMO the category is ignored.

Write scope, decided from the raw read of the existing target
(`nativeDmoWriteScope`):

- `creationType` `Custom` and a name without a double underscore before `__dlm`:
  everything above, whole-DMO delete and field-level delete.
- `creationType` `Standard` (for example `ssot__Brand__dlm`): deploy writes custom
  fields (add, relabel, remove with `--allow-field-removal` under the same rules),
  the object label (sent only when it differs) and the object description (absent is
  not managed, an empty string clears it). Field-level delete removes custom fields.
  The DMO is never created and never deleted.
- Anything else, that is a platform-generated DMO (`Adg`, `Bridge`, `Derived`,
  `Segment_Membership` or any other `creationType`), a read without `creationType`
  or a custom `creationType` under a namespaced name: deploy, delete, delete preview
  and field-level delete are refused with `UNSUPPORTED_DMO_TARGET`.

Standard DMO rules:

- Standard and system fields (field `creationType` other than `Custom`) are never
  sent and never removed, and may be absent from the file. One that the file lists
  and that differs from the target in a comparable property is refused with
  `UNSUPPORTED_DMO_FIELD_CHANGE`, naming field and property. `isMapped` and
  `keyQualifierName` are not compared on these fields.
- A new field must be a plain custom field: no double underscore before `__c` and no
  `creationType` other than `Custom`. Otherwise `UNSUPPORTED_DMO_FIELD_ADDITION`.
- The category is neither sent nor compared nor required at readback. Mapping a
  standard DMO for the first time changes its category from `UNASSIGNED` to `OTHER`,
  enables it, adds the system field `KQ_Id__c` and sets `keyQualifierName` on the
  standard primary key; none of this causes a write or a refusal, so a retrieved file
  deploys back `unchanged`, also to an org where the DMO is not mapped yet.
- PATCH body for one added custom field: `{"fields":[{"name","label","dataType",
"isPrimaryKey"}]}`; for a label change: `{"label"}`; `dataSpaceName` only with
  `--dataspace`.
- Readback confirms the label, a managed description, the custom fields of the file
  and the absence of removed fields.
- [x] Observed at API 68 through the plugin on one standard DMO in two orgs, active in
      only one of them: add and relabel a custom field; remove it with
      `--allow-field-removal` and with `delete --field` (local file refreshed);
      object description set and cleared; a changed standard field refused;
      whole-object delete refused; a file retrieved in one org deploys unchanged to
      the other.
- [x] Observed at API 68 on one standard DMO: object label changed and reverted;
      Salesforce rejects an edit of a standard field ("Data model fields cannot start
      with ssot__").
- [ ] Not tested: a category change on a standard DMO, standard DMOs in active use
      (data-bearing, referenced), anything on platform-generated DMOs. Removal of a
      mapped custom field of a standard DMO is covered by synthetic tests only.

Native mapping targets, decided from the same raw read:

- A mapping deploys onto a custom DMO or a standard DMO. Any other target
  (platform-generated, no `creationType`, custom under a namespaced name) is refused
  with `MAPPING_TARGET_UNSUPPORTED`.
- Create and update, custom and standard target alike: the plugin sends the pairs the
  file lists and Salesforce decides. No local rule on field data types, source and
  target names, `KQ_` names, one source field onto several targets or a target another
  mapping of the DMO also holds. Pairs whose data types differ are sent; the preview
  adds the non-blocking diagnostic `MAPPING_FIELD_TYPES_DIFFER`
  (`Source (Type) -> Target (Type)`). A pair naming a missing field is refused with
  `MAPPING_FIELD_NOT_FOUND`, naming the pair, the field and its object. A new mapping
  without a pair joining the two primary keys is rejected by Salesforce (HTTP 400
  `MISSING_ARGUMENT: Unable to find Primary Key of DLO in POST request of Mapping Creation`, reported as `MAPPING_HTTP_ERROR`). Pair removal and whole-mapping delete
  are admitted at every native API version the plugin accepts (61 and up, default 68).
- Standard target, create: authored pairs may target standard and custom fields; the
  primary-key pair joins the two keys (for example `Id__c` to `ssot__Id__c`). The
  body carries the authored pairs only.
- Standard target, generated pairs: a system pair is recognised when its target is
  the source's namesake or `ssot__<Name>Id__c` and the target read reports the field
  as `System`, or as `Standard` for `DataSource`, `DataSourceObject` and
  `InternalOrganization`. The key qualifier pair is `KQ_<Key>__c` on both sides for
  the source primary key `<Key>__c`; on a DMO that is not yet enabled its target
  field may still be absent. Generated pairs are never sent and, with the key pair,
  never unmapped by a deploy.
- Mapping file and existing mapping, custom and standard target alike: the file may
  list only the authored pairs. The pairs Salesforce generated (the three system
  pairs and the key qualifier pair) are taken from the org's copy and treated as part
  of the file, so a hand-written file deploys back `unchanged`, can add pairs, and
  removes exactly the authored pairs it drops. The authored primary-key pair must
  stay in the file (`MAPPING_PROTECTED_PAIR_REQUIRED`). A retrieved file, which lists
  the generated pairs, behaves the same.
- Activation notice: when the raw target read of a standard DMO does not say
  `isEnabled: true`, the preview item and the created item carry
  `MAPPING_ACTIVATES_STANDARD_DMO`. The first mapping enables the object for good
  (category `OTHER`, system field `KQ_Id__c`, `keyQualifierName` on the primary key);
  deleting the mapping does not undo it. The notice changes neither outcome nor exit
  status.
- Pair removal by deploy (a pair the file no longer lists), custom and standard
  target alike: any authored pair is removed, including a pair onto a standard field
  of a standard DMO (for example `Name__c` to `ssot__Name__c`), a pair whose source
  and target names differ, and any data type; Salesforce decides. The three system
  pairs, the key qualifier pair of the target's primary key and the key pair (source
  primary key onto target primary key, any name and type, from the org's
  `isPrimaryKey` flags) are never removed. A file that omits one is refused with
  `MAPPING_PROTECTED_PAIR_REQUIRED`; when the key pair cannot be identified, removal
  is refused with `MAPPING_PROTECTED_LAYOUT_UNPROVEN` before any write, and so is a dropped
  pair onto a system or key-qualifier field not recognised as generated.
- Whole-mapping delete (`sf data360 delete -m mapping:<Name>`), native API 61 and up,
  default 68: one Metadata API destructive deployment, type
  `ObjectSourceTargetMap`, member the mapping developer name. No pair is unmapped
  first and no native DELETE is sent. Any mapping is deleted this way, whatever pairs
  it holds, on a custom or a standard DMO.
  - Reads before the write: the mapping, all mappings of the target DMO, the DMO.
  - Only refusal, without a write: the last mapping of a custom DMO
    (`MAPPING_LAST_MAPPING_DELETE_BLOCKED`). Salesforce does not delete it (Metadata
    API: internal error; native DELETE: HTTP 500). The message names the DMO and the
    way out, `sf data360 delete --metadata dmo:<Dmo__dlm>`, which removes the mapping
    with the DMO. The last mapping of a standard DMO is deleted; the DMO stays
    enabled with its generated `KQ_Id__c` field and no mapped fields.
  - `--preview` is read-only and reports the single planned step `delete`.
  - The deployment is sent once and never retried. Not confirmed by Salesforce:
    `MAPPING_DELETE_FAILED` with Salesforce's problem text.
  - Readback: up to 6 reads, 5 seconds apart, until the mapping reads 404
    (`MAPPING_DELETION_UNCONFIRMED` otherwise); then the DMO's other mappings (pairs
    and selectors) and the DMO's field names must be exactly what they were
    (`MAPPING_DELETE_SIDE_EFFECT` otherwise).
- Shared target field: a pair is removed even when another mapping of the same DMO
  targets the same field. The field must then keep `isMapped: true`; it loses the
  marker with the last such pair. A pair onto a field another mapping targets is sent
  like any other addition.
- [x] Observed through the plugin on empty synthetic fixtures in one org: a mapping
      created with a Number pair, a renamed pair (`Note__c` to `Other__c`) and one
      Number source onto a Number and a Text target, ACTIVE (66 seconds for two data
      lake objects, the DMO and the mapping); its preview `noop` with
      `MAPPING_FIELD_TYPES_DIFFER`, a repeat deploy and a deploy of the retrieved
      file `unchanged` (5 seconds each); a pair removed at API 64 (16 seconds) and
      API 61 (17 seconds); a file dropping the key pair refused with
      `MAPPING_PROTECTED_PAIR_REQUIRED`, nothing written.
- [x] Observed at API 68 through the plugin: a mapping created onto one already active
      standard DMO, together with its data lake object, from a hand-written file with
      the pairs `Id__c` to `ssot__Id__c` and `Name__c` to `ssot__Name__c`; the four
      generated pairs added by Salesforce; the retrieved mapping deploying back with
      no change; the activation notice in a mapping preview against a second org where
      the same standard DMO is not active, with nothing changed.
- [x] Observed at API 68 through the plugin: a first mapping onto the inactive
      standard DMO `ssot__Brand__dlm` (outcome created, with
      `MAPPING_ACTIVATES_STANDARD_DMO`; the DMO then enabled with category `OTHER` and
      `KQ_Id__c`).
- [x] Observed at API 68 through the plugin: the pair onto the standard field
      `ssot__Name__c` removed by deploying the retrieved mapping file without it.
- [x] Observed at API 68 through the plugin, whole-mapping delete: a non-last mapping
      of a custom DMO with two mappings (21 seconds; the other mapping and all 8 DMO
      fields unchanged); the last mapping of the same DMO refused with nothing
      written; the only mapping of `ssot__Brand__dlm` deleted in two orgs, one of them
      still holding the pair onto `ssot__Name__c`.
- [x] Observed at API 68 through the plugin on a custom DMO field mapped by two
      mappings: `delete --field` removed the field with one destructive change and
      Salesforce dropped both pairs (28 seconds); one deploy of both mapping files
      plus the DMO file with `--allow-field-removal` did the same (29 seconds) and a
      repeat reported unchanged. Both mappings stayed ACTIVE with their other pairs.
- [x] Observed at API 68 through the raw API: activation by the first mapping onto one
      unused standard DMO (HTTP 201, object enabled, category from Unassigned to
      Other, `KQ_Id__c` added and referenced by the standard primary key, not undone
      by deleting the mapping) and HTTP 500 on a native DELETE of the only mapping of
      a custom DMO.
- [x] Observed at API 68 through the plugin in one org, hand-written files with
      authored fields and pairs only: a data lake object, a custom DMO and their
      mapping created (45 seconds) and deployed again, all three `unchanged` with no
      write; with one field added to the data lake object and to the DMO, one pair
      added and one authored pair dropped in the mapping file, all three `updated`
      (64 seconds), the mapping then holding the two kept authored pairs, the new
      pair, the key pair and the four generated pairs; a data lake object and a
      mapping onto `ssot__Brand__dlm` with the pairs `Id__c` to `ssot__Id__c` and
      `Name__c` to `ssot__Name__c` created and deployed again, `unchanged`.
- [x] Measured at API 68 in one org on empty synthetic fixtures: create a data lake
      object, a custom DMO and their mapping, 45 s; unchanged redeploy of 2 data lake
      objects, a DMO and 2 mappings, 9 s; mapping deploy removing one pair, 17 s; two
      mapping deploys each adding one pair, 32 s; one field added to data lake object
      and DMO with one pair added and one dropped, 64 s; mapping file plus DMO file
      with `--allow-field-removal` removing a mapped field, 29 s; `delete --field` on
      a field mapped by two mappings, 28 s; delete of a non-last mapping of a custom
      DMO, 21 s; delete of two custom DMOs, 24 s. During deploy, data lake object, DMO
      and mapping reads use one authenticated connection per org and API version;
      writes run through the Salesforce CLI. Settle reads after a data lake object,
      DMO or mapping write: up to 6, 3 seconds apart; DMO readback after a DMO write
      and field-removal readback: up to 6, 5 seconds apart.
- [ ] Not run live through the plugin: removal of a pair for a custom field of a
      standard DMO (covered by synthetic tests), whole-mapping delete at API 61 to
      67, populated objects.

Whole-DMO delete: exact name, no dependency preflight, no prompt, no local file read
or written. Salesforce may cascade to the DMO's mapping. Deletion resolves the exact
target through `deleteNativeDmo` and uses `DmoClient.delete`.

Field-level delete,
`sf data360 delete -m dmo:<Name__dlm> --field <Field__c> --confirm-delete`:

- Removes named custom fields from one DMO together with their mapping pairs. It is
  the one delete operation that writes project files, and it changes mappings the
  command line does not name; execution requires `--confirm-delete`
  (`DMO_FIELD_DELETE_CONFIRMATION_REQUIRED` before any org call).
- `--field` is repeatable and needs exactly one `dmo:` selector. Any other selector,
  `--source-dir`, `--delete-dlo`, `--transform-target-id`, or `--output-dir` without
  `--field` is refused with `INVALID_FIELD_DELETE_SELECTION` before any org call.
- Admission is read-only: custom or standard DMO (`UNSUPPORTED_DMO_TARGET`
  otherwise); each field exists (`DMO_FIELD_NOT_FOUND`), is custom, not the primary
  key and not generated (`UNSUPPORTED_DMO_FIELD_CHANGE`; on a standard DMO the field
  must be marked `creationType` `Custom`); the mappings targeting the DMO are listed and
  every pair targeting a named field is collected. A mapped field without an
  identified pair, including a failed list request, is refused with
  `DMO_FIELD_REMOVAL_MAPPED`. Every collected pair must be identified on an ACTIVE
  mapping whose detail read equals its list entry.
- Right before the write the plugin reads the DMO and all of its mappings again; the
  pairs must still be exactly the planned ones (`MAPPING_UNMAP_PLAN_CHANGED`
  otherwise, nothing written).
- Write, once and never retried: one Metadata API destructive change for all fields.
  Salesforce drops the collected pairs with the fields; no request is sent per pair.
- Readback: polled reads (up to 6, 5 seconds apart) until the fields are absent and
  every mapping equals its earlier state minus exactly the collected pairs, ACTIVE.
  Any other change stops with `DMO_FIELD_REMOVAL_SIDE_EFFECT`; not settled in time
  stops with `DMO_PERSISTENCE_UNCONFIRMED` (field still readable) or
  `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a pair still listed). Nothing is rolled
  back. Outcomes: a stop before the write is `blocked`/`not-attempted`; a sent but
  unconfirmed destructive change is `failed`/`unknown`; an unconfirmed readback is
  `deletion-unconfirmed`/`acknowledged`.
- After success the existing `data360/dmo/<Name__dlm>.dmo-meta.json` and
  `data360/mapping/<MappingApiName>.mapping-meta.json` files under `--output-dir`
  (default: current directory) are overwritten with fresh reads. Absent files are
  not created (`not-present`); no file is deleted. A failed refresh keeps outcome
  `deleted`, reports the file as `failed` and `LOCAL_REFRESH_FAILED`, and exits
  nonzero.
- `--preview` writes nothing and reports one `unmap` step per pair (the pair
  Salesforce drops with the field), one `delete-field` step per field and
  `localFiles` with `exists`. Human preview line per pair:
  `Planned pair drop (Salesforce removes it with the field): ...`.
- Result item: operation `delete-field`, `removedFields`, `unmappedPairs` (the pairs
  Salesforce dropped), `refreshedFiles`. Human output per pair:
  `dropped pair <Source> -> <Target> in mapping <Mapping>`. A repeat after success is
  refused with `DMO_FIELD_NOT_FOUND`.
- Observed at API 68: a field mapped by two mappings of a custom DMO (one destructive
  change, both pairs dropped by Salesforce, 28 seconds), a custom field of a standard
  DMO in two orgs, and unmapped fields in a second org.

Git selection (`--changed-since`) uses the native DMO file. A native DMO changed
since a Git reference, or selected beside Segment/CI/Graph/IR inputs, joins the
ordered batch. Prerequisites are checked, not pulled in: each must be selected
explicitly or already exist in the target. On retrieve, a DMO beside other families
is read at the native version while each other family keeps its own version rule.

Not qualified:

- [ ] Data-bearing DMOs and standard DMOs in active use.
- [ ] A real first mapping onto an inactive standard DMO through the plugin.
- [ ] Field removal of data-bearing or otherwise referenced fields.
- [ ] Non-default data spaces.
- [ ] API versions other than 68 for the behaviour listed above.
- [ ] Relationships and SQL/flex DMOs.
- [ ] Released-package acceptance.

## relationship: exact definition-only export

- [x] Public `sf data360 retrieve -m relationship:ExactDeveloperName` supports one/multiple
      sorted unique exact names in default space, with default/65.0/auto fixed to Metadata API65.
- [x] Export exact standard XML to the configured package's `fieldSrcTrgtRelationships`
      directory; support unchanged repeat and explicit differing-file overwrite consent.
- [x] Report `family: relationship`, `definitionOnly: true`, `deployable: false` and the
      actual Metadata route. This excludes this plugin's operational deploy, not standard
      Metadata deployment elsewhere. Retain successful members after independent failures.
- [x] Reject inventory and operational file/Git deploy input admission.
      Synthetic tests cover output safety, version/mixed-family routing and zero-mutation rejection.
- [x] Isolated installed source-only definition export on mcnext-sdo, October 29, 2026:
      exact independent standard XML comparison, configured root, unchanged repeat,
      API65/auto requested/actual routes, duplicate selection and local deploy-input rejection.
      Multiple distinct members/failure continuation remain synthetic only; no semantic
      or cross-org portability claim. Binding and finite-call receipts are in docs/handover.md.
- [ ] Relationship prerequisite compatibility, operational preview/create/update/repeat.

## mapping: unimplemented operational semantics; exact definition-only export available

- [x] Public exact `mapping:ApiName` opaque XML retrieval, sorted unique members,
      default space, default/65.0/auto fixed Metadata API65 with requested version retained.
- [x] Configured `objectSourceTargetMaps/<name>.objectSourceTargetMap-meta.xml`, exact
      bytes, unchanged repeat, explicit differing-file overwrite and path/link safeguards.
- [x] Definition-only/non-operational-deploy classification; independent per-member
      failure continuation and payload-free mapping labels. No semantic/KQ inference.
- [x] Retrieve syntax/version/inventory/dependency refusals before auth. Local deploy
      XML refusal before target use/mutation, not before authentication. Git XML non-admission:
      mapping-only selects no inputs, mixed changes select only supported operational inputs.
- [x] Installed source-only exact mapping export acceptance: independent standard API65
      XML equality, configured source root, retrieved/unchanged repeat, auto actual65,
      duplicate deduplication, definition-only classification, local deploy-input refusal
      before target use (not authentication) and Git non-admission. Seven total org-facing
      CLI invocations including children, four Metadata operations; zero writes/processing/target calls.
      Multiple distinct members/failure continuation remain synthetic-only. No semantic
      PK/KQ compatibility or cross-org operational deploy acceptance. Retrieve remains Partial/API.
- [ ] Record official endpoints, versions, pagination and inventory scope.
- [ ] Preserve deterministic source/target identity, fields and qualifier mappings.
- [ ] Verify replacement/update semantics cannot silently remove existing mappings.
- [ ] Prove schema-reference validation and supported create/update/no-op.

## identity-resolution: unimplemented

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve matching/reconciliation order, precedence, case and secondary objects.
- [ ] Classify generated-schema dependencies and automatic-run side effects.
- [ ] Prove configuration-only behavior without running resolution.

## data-graph: bounded existing-owner support above; broader scope pending

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

The existing public predicate-edit workflow and internal native transport above
have distinct boundaries; neither closes general lifecycle or cross-org support.

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve exact SQL, dimensions, measures, relationships and settings.
- [ ] Classify implicit compute/enable/schedule side effects and block unsafe routes.
- [ ] Prove safe export-to-target create/update/no-op without computation.

## Bounded Git deployment selection

`deploy --changed-since <ref>` is exclusive with metadata/source-dir. For DMOs it
selects current native `data360/dmo/<ApiName>__dlm.dmo-meta.json` files, admitted
through the existing input resolver; a selected native DMO joins the ordered batch
on the native route. The other selectable families are
described in the [Git workflow](git-workflow.md). Repository-root resolution, unique
merge-base/HEAD changes, index, worktree and untracked selection are local. Relevant
rename/delete blocks the whole selection, regardless of diff.renames configuration.
Git inference is not historical rename-intent proof. A relevant untracked DMO
addition plus any tracked worktree deletion blocks conservatively; staging intended
changes permits Git rename inference, not unsupported lifecycle deployment. Empty
selection succeeds before downstream target inspection/services, without changing
core parse-time auth. Optional Git provenance records commits, not file-byte hashes
or executable plans. Reports, CI delivery, exact-byte binding and
SQL companion selection remain unimplemented; roadmap chunk 6 is partial.

## Shared gates

ConnectClient SSOT GETs now use an operation-local no-refresh receiver, like guarded
writes: expired authentication fails immediately without OAuth refresh or replay.
Repair authentication before a new explicit invocation. Retry and redirect refusal
remain in place; the caller's connection and unrelated consumers are unchanged.
This does not change API-version discovery or the separate Metadata/SOAP guard.

- [x] Read-only authenticated Connect REST transport, structured errors and redaction.
      Broader resource contracts remain pending.
- [x] Native DMO route as described in the dmo section above. The items formerly
      listed here for the API 65 DMO adapter (deploy preflight, common projector,
      file writer, DMO pagination, relationship acquisition, field join
      and request mappers) were removed together with that adapter.
- [ ] Qualified logical references and verified data-space binding.
- [ ] Versioned deterministic artifacts, safe paths and unknown-field blocking.
      See [artifact formats](artifact-format.md) for the current documents.
- [ ] Whole-selection dependency/diff preflight and input/target drift guards.
- [ ] Read-back verification and partial/uncertain failure handling.
- [ ] Bounded opt-in live acceptance with explicit fixture ownership ledger.

No live fixtures were created, claimed, modified or removed by this slice.
