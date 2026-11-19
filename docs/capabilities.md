## Mixed retrieve — 2026-11-14

One retrieve may hold any mix of selectors: `dlo`, `dmo`, `mapping`, `relationship:<Dmo__dlm>`,
`data-stream:`, `data-transform:`, `data-graph:` (several), `calculated-insight:`,
`identity-resolution:` and `segment:`, plus the existing type-inventory forms. Every family's
selector, version and data-space checks run before any org read; one refusal blocks the
whole run; with several families selected its diagnostic names the family (for example `--api-version 67.0` with a
transform, which reads at API 68 only). The families then run one after another: DLO, DMO,
mapping, relationship, Segment, calculated insight and identity resolution first, then data
streams, data transforms and data graphs. Each keeps its own rules (inventory refusals,
`--overwrite`, identical bytes `unchanged`). A failing component or family does not stop
the others; their files are kept and the result is the worst status (`failed` over
`blocked` over `success`). A failing graph gets its own diagnostic and the next graph still
runs. Retrieve only reads.

Live on `isolated-source` (2026-11-14, `auto`): one retrieve of a DMO, an Ingestion API
stream, a transform, two graphs and an identity resolution ruleset retrieved all six in one
`success` result. A repeat reported the DMO, ruleset, transform and graphs `unchanged`; the
stream was refused with `OVERWRITE_REQUIRED` because Salesforce returns its field mappings in a
different order on each read, and the file keeps that order (also for a stream retrieved alone).

## Delete phases — 2026-11-14

One delete may hold any mix of families, selected by name with `-m` only (no
`--source-dir`). Delete runs the deploy
phases in reverse: P4 data graphs, P3 identity resolution, calculated insight and Segment
(every dependent in an earlier stage than the component it needs, including a graph, CI or
Segment on the unified/link DMO of a selected ruleset), P2 data transforms, P1
relationships, mappings, DMOs and DLOs (in that order), P0 data streams. Each family keeps
its own delete checks. A phase starts only after every item of the previous one settled; a
blocked, failed or unconfirmed item stops the run, and an item Salesforce accepted but still
processes (`deletion-processing`) stops the later phases (`DELETE_PHASE_NOT_SETTLED`;
rerun the same delete once it reads absent). A `-m` delete needs no confirmation flag;
`--confirm-delete` is accepted only with `--changed-since`. Every item carries `family`.

- Before the first delete (read-only, preview too) each selected transform, Segment, IR,
  CI and graph is read from the org by name with the existing readers: transform through
  the complete transform list (name ignoring case → record ID; no match `unchanged`, 2+
  `TRANSFORM_TARGET_NOT_RESOLVED`) and `retrieveDataTransform`; Segment and IR by exact
  GET (only `ITEM_NOT_FOUND` is absence); CI by the API 68 GET
  (`acquireCalculatedInsight`, any status); graph by the
  item GET; absence needs the item's exact "not found" answer, a metadata 404
  `METADATA_ERROR_ENTITY_NOTFOUND`, a complete graph list without the name and an empty
  SOQL read. Metadata, list or SOQL still holding it stops the delete before any deletion. An absent component reports
  `unchanged` / `not-attempted` without calling its executor. The read definition is what
  the family executor compares against; every executor guard is unchanged.
- Relationships are selected as `relationship:<SourceDmo__dlm>:<Name>`; a bare
  `relationship:<Name>` (or more or fewer parts) is refused with `INVALID_SELECTION`. The
  source DMO's relationships are listed and the name is matched ignoring case: no match
  `unchanged` (also when the source DMO itself does not exist: its list answers HTTP 404
  `ITEM_NOT_FOUND`; any other list error stops the delete), 2+ `AMBIGUOUS_RELATIONSHIP_TARGET`, a match whose source object is another
  DMO `RELATIONSHIP_TARGET_BINDING_MISMATCH`. No local file is read.
- Local files after a confirmed deletion are removed at their canonical paths by name:
  `data360/dataTransforms/<Name>.dataTransform.json`, the Segment, IR and graph file and
  both CI members under `data360/` in the current directory. `--keep-local-files` keeps them. The name in those paths and in the
  result item is the org's spelling when the read matched ignoring case (absent: the
  selector's spelling).

- Preview runs every phase read-only (also after a blocked phase). An item whose selected
  dependents an earlier phase plans to delete is reported `planned-dependencies`
  (`DEPENDENCIES_PLANNED`, naming the dependents) without being read: an IR beside a graph
  on its unified DMO, a DMO beside a graph on it, a DLO beside a transform reading it.
- A stream and its landing DLO both selected: one stream delete with `--delete-dlo`
  semantics (the stream's linked DLO is looked up read-only before any write). The DLO is
  never deleted on its own; its item reports `removedWith: data-stream:<Name>` and the
  stream's outcome.
- A DMO and its last mapping both selected: the mapping guard
  (`MAPPING_LAST_MAPPING_DELETE_BLOCKED`, before any write) hands the mapping to the DMO.
  Only the DMO is deleted; the mapping item reports `removedWith: dmo:<Name>` and the DMO's
  outcome, and its local file is removed with it. No read confirms the mapping's absence
  separately: deleting a custom DMO removes its last mapping (observed at API68), while
  that mapping's own delete fails with an internal error. Without the DMO in the selection the last
  mapping stays refused.
- `--changed-since <ref>`: the components of the canonical plugin files deleted in the
  range (committed or staged) are deleted through the same phases; changed and added files
  are not part of a delete. Exclusive with `-m`; `--delete-dlo` is refused. Execution
  always needs `--confirm-delete`; preview does not. Each family runs from its merge-base document (identity from content), every
  deleted path must still be absent right before each phase and before each source-family
  write (`BLOCKED_GIT_LIFECYCLE`), and each candidate's data space must equal the requested
  one. A relationship takes its source DMO from the base content; a data transform resolves
  its target ID by name from the complete transform list, ignoring case: no match is
  `unchanged` / `not-attempted` (also on a rerun), 2+ is refused
  (`TRANSFORM_TARGET_NOT_RESOLVED`). A deleted stream
  file plus its landing DLO file is one stream delete with that DLO. No local file is
  listed or removed. A rename split across commit, index and worktree (one component
  deleted at one path, added at another) blocks the selection before any org call.

## Deploy phases — 2026-11-13

One deploy may hold any mix of families. They run in phases: P0 data streams, P1 native
DLO/DMO/mapping/relationship, P2 the data transform, P3 identity resolution, calculated
insight and Segment, P4 data graphs. A phase starts only after every item of the previous
one settled, and a blocked, failed or unknown item stops the run. With a mapping,
relationship or transform in the selection, P1 runs on the native route; DLO/DMO files
beside P3 files only stay in the ordered batch. A calculated insight, Segment or graph on
an identity resolution's unified or link DMO (name derived from the ruleset file) runs
after that ruleset is `PUBLISHED`. Before the first write, P3 inputs pass their local
file, version and dependency checks and the stream, transform and graph scope is checked.
A deploy takes any number of transforms, each created or updated by name, of any owner
(Salesforce refuses writes to system transforms, reported as `rejected`); a transform
file's optional `schedule` is sent with its own schedule PUT when it differs, and a file
without it leaves the schedule alone. A
DLO file named like the landing DLO of a stream the deploy creates is refused after the
stream's read-only comparison, before any write (`DATA_STREAM_DLO_COLLISION`); beside an
existing stream it deploys. `--wait-timeout` applies to every selected graph and needs
one. Preview runs every phase read-only (also after a blocked phase) and reports items
whose parents an earlier phase creates as `planned-dependencies` (`DEPENDENCIES_PLANNED`,
`MAPPING_DEPENDENCIES_PLANNED`): a mapping or transform on a new stream's landing DLO, a
graph on a new DMO or ruleset output. Live (isolated-source, 2026-11-13): one
`--changed-since` deploy of an existing probe stream, DMO and mapping reported all three
`unchanged` with no write. The IR + graph create in one deploy is not yet run live.

## Public native Data Graph CRUD

Default/`auto` or `68.0` retrieval exports `.native-dataGraph.json`
(`kind: native-data-graph`, `apiVersion: 68.0`); other versions are `INVALID_SCOPE`. The
API67 graph route and its `.dataGraph.json` file are gone. Every graph shape the API returns is admitted: any root (standard or
unified), related objects with joins, all field types, any refresh schedule. Checks are
structural only (closed keys, names, tree and join shape, `c__dataSpace` agreeing with
`definition.dataspaceName`, root equals `primaryObjectName`); the root is bound by the
document's own `primaryObjectName`, read with `?dataspace=` of the run's data space.
Lowercase API values are stored as `NONE`, `KEY_QUALIFIER`, `DESC`, `Day`; node `type`
stays lowercase. All six graphs in `isolated-source` retrieve at `auto` and preview
`unchanged` on route 68.0. Deploy runs graphs as the last phase of any selection,
explicit or `--changed-since`.

Create waits up to `--wait-timeout` while the graph builds: `creating` with empty
generated names (empty names on a non-ready read are not authored values), then `ready`
before the day-zero names exist, then metadata `Inprogress` for about 5 minutes,
sometimes briefly missing. The POST is resent only after a 429/503 answer. A create the plugin cannot confirm
reports `failed`/`unknown` with `DATA_GRAPH_CREATE_UNCONFIRMED` naming the step
(`request`, `response`, `settlement`, `identity`, `deadline`); an unchanged repeat deploy or a
retrieve confirms the graph. Retrieve resolves a relative
`-d`/`--output-dir` against the current directory for every family.

Create sends the authored root, related objects, fields and schedule and needs
`--allow-processing`; Salesforce adds key-qualifier fields to related objects and can
report a different node `type`. A node without `type` is sent without one and Salesforce
assigns it (live at API 68, 2026-11-18, a create without node types answered 201). A
related object added by an update without `type` is sent without one; not verified live. A graph with a related object took about 17 minutes to
build (metadata `Inprogress` most of it). Builds pass a brief `processing` status
between `creating` and `ready`, which settlement accepts. Update sends the file as the
desired state in one PUT (label, description, schedule, incremental refresh, the fields
and related objects as listed, field settings, the root object); Salesforce decides and an
API 4xx answer is `failed`/`rejected`, with Salesforce's answer as the item diagnostic
(`REQUEST_FAILED`). Live at API 68 (2026-11-18) it refuses with 400 a
removed field (also `isProjected: false`), a removed related object, another related
object in place of an existing one and a root change; key-qualifier fields it added are
kept when the file leaves them out. A join change of an existing related object answers
200 but keeps the old join, so the plugin refuses it before any write
(`DATA_GRAPH_JOIN_CHANGE`; preview reports the graph `present` and the run
`DEPLOY_PREVIEW_BLOCKED`), and a graph read back with another join than sent is
`DATA_GRAPH_CHANGE_NOT_APPLIED`. A changed node type, reference or projected name of an
existing node is refused (Salesforce assigns them). Name and data space identify the
graph: a renamed file creates or addresses another graph and the old graph is not renamed, because a PUT cannot rename one (400
`INVALID_API_INPUT`). Identical deploy is zero-write `unchanged`. Preview is read-only. Cascade is unsupported.
Preview (only) checks the root DMO and, for a derived
root, its IR owner via `GET /ssot/identity-resolutions` (`DATA_GRAPH_ROOT_NOT_FOUND`,
`DATA_GRAPH_OWNER_NOT_FOUND`, `DATA_GRAPH_OWNER_NOT_PUBLISHED`, info `DATA_GRAPH_OWNER`).

Delete needs an exact selector (the definition is read from the org by name) and fresh
ready/identity/created-date/definition/root checks, with explicitly empty
known dependency/related-segment arrays. Unknown/nonempty dependencies block;
exhaustive external-consumer exclusion remains unverified. Live API68 create/read/
delete evidence confirmed independent graph-definition absence. The DELETE answer
decides (2xx deleted, API 4xx rejected, other 5xx/transport unknown); 429/503 means not
processed: create, update and delete wait (Retry-After or 20 s) and resend within the wait
budget, then report `failed`/`not-attempted`. There is no
read-back, because the by-name metadata read serves a stale copy of a deleted graph for
about 11-12 minutes, alternating with not found. No generated DMO/mapping/transform/internal-state,
storage/credits cleanup or computation claim. Installed package smoke verifies
offline routing only, not live installed cross-org acceptance.

## Public native identity resolution

Retrieve, deploy (POST create, full-settings PATCH) and delete use native API68 in the
run's data space for every ruleset the API returns or accepts: any configuration type
and name, automatic run on or off, case sensitivity, secondary DMO, filters, trusted
sources, any match and reconciliation rules, unpublished rulesets. Kept refusals:
structural checks; one reconciliation entry per entity (outputs are keyed by entity);
the `1ir…` ID check before DELETE; configuration type or secondary DMO changes
(`blocked-changes`, PATCH cannot carry them); a create name other than `<type>` or
`<type>_<rulesetId>`, outside `default` `<prefix>_<type>` or `<prefix>_<type>_<rulesetId>`
(`IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH`); PATCH or
DELETE while `PUBLISHING`/`DELETING` (`IDENTITY_RESOLUTION_NOT_SETTLED`). Run statistics
are not part of the file. The API 67 IR routes are gone.

By default deploy waits after a create or update until the ruleset is `PUBLISHED`
with equal settings and verified generated outputs. `deploy --async` (IR only;
`INVALID_ASYNC_SCOPE` without an IR) runs all checks before the write, sends the one
POST/PATCH, requires the immediate answer to name the ruleset (API name, or the
existing ID on PATCH) and returns `creation-processing` /
`update-processing` with mutation `acknowledged-processing`, exit 0, with no
settlement reads. `--changed-since` with no IR in the change set is also
`INVALID_ASYNC_SCOPE` (exit 1); with `--preview` the flag has no effect. A selection
holding a calculated insight, Segment or data graph on the ruleset's derived unified or
link DMO is refused with `--async` (`IDENTITY_RESOLUTION_ASYNC_DEPENDENTS`); without
it, those dependents run after the ruleset reads `PUBLISHED`.

- Helps: no wait for publishing (one to four minutes after the write) or for the
  checks after it; several rulesets can be deployed in a row and checked later.
- Does not save the checks before the write, which take most of the time: live, an
  `--async` create took 570 s (default create 695 s; a read-only `unchanged` rerun
  663 s).
- Hurts: no confirmation that publishing succeeded, the settings stuck or the
  outputs exist; dependent steps run right after fail (a Data Graph on the unified
  DMO needs a `PUBLISHED` owner, preview reports `DATA_GRAPH_OWNER_NOT_PUBLISHED`);
  rerunning the same file is refused with `IDENTITY_RESOLUTION_NOT_SETTLED` until it
  settles; a failed publish looks like a slow one until you rerun.
- Status check: deploy the same file again (full checks, so as slow as a deploy).
  `IDENTITY_RESOLUTION_NOT_SETTLED` = still publishing; `unchanged` = settled as
  written with verified outputs.

## Data stream reference reads on native API 68

Data stream retrieve, deploy and delete read connections (`/ssot/connections` list, by id
and `/schema`) and dependencies (`/ssot/data-streams/{name}/dependencies`,
`/ssot/data-lake-objects/{name}/dependencies`) through native API 68 GETs; route output
says `transport: native`. The API 67 tool layer (`mcp-execute.ts`) is gone. The native
bodies matched the tool results minus the `{result}` wrapper in live probes.

Stream create and update send the file as written and Salesforce decides (live, API 68:
it refuses changing or removing an existing Ingestion API mapping, a new field type and an
Ingestion API create other than `UPSERT`; it accepts additive mappings at create, from the
primary key and of any type). Streams of every connector other than the Ingestion API use
the GET-shaped file; only Salesforce CRM is tested live. The file format is in
[artifact-format.md](artifact-format.md#public-data-stream-document).

## Public native calculated insight lifecycle

Calculated insights use API 68 for retrieve, deploy (including `--draft`), publish and
delete; every other version is refused with `INVALID_SCOPE`. In the run's data space
(`c__dataSpace`; another is `CI_DATASPACE_MISMATCH`). No
Metadata API or dependency reads; no command needs `--allow-processing`.

Retrieve writes `data360/calculatedInsights/<Name>__cio.calculatedInsight-meta.json`
(the GET body minus status, run history, record links and the SQL-derived dimensions
and measures) and `<Name>__cio.calculatedInsight-meta.sql` (the expression as plain
SQL). Deploy, publish and delete read the same two files.

Deploy: one GET by name; 404 creates (POST), a present insight holding every key of the
file is `unchanged`, otherwise one PATCH. A 404 `ENTITY_IS_DELETED` (an insight
Salesforce is still deleting) reads absent as well: one POST, Salesforce's answer
reported as is. The file is sent as written with only the input key names
(`dataSpaceName`, `createdFromPackage`, `sourceDeveloperName`) and PascalCase enums translated and null values left out
(`calculatedInsightInputBody`); a PATCH leaves out an unchanged `definitionType`. Live
API 68 (2026-11-15): `dataSpace`/`isFromPackage` are rejected as unrecognised,
`publishScheduleInterval` must be PascalCase, `definitionType`/`queryDialect` pass in
either form on POST, any `definitionType` on PATCH is refused, and a PATCH without
`draft` activates a DRAFT (deploy sends `draft: true` for one). A 4xx answer is `rejected`; otherwise bounded reads (12, one second apart,
120 s) confirm the file is held and the insight is not `PROCESSING`. `--draft` sends
`draft: true`; a DRAFT insight stays a draft on update. Publish sends the file with
`draft: false` and waits for ACTIVE. Delete: GET (identity must match), one DELETE,
reads until 404. Ordering: the `<Name>__dlm` and `<Name>__cio` tokens of the SQL are
the insight's dependencies (`calculatedInsightReference`).

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
`InternalOrganization__c` and the key qualifier `KQ_<Name>__c` of another field,
for example `KQ_Id__c` for the primary key or `KQ_RefId__c` for a relationship
source field); they stay as they are, so a hand-written file with only the
authored fields deploys onto its existing DLO. Any other omitted field is refused
(`UNSUPPORTED_DLO_FIELD_CHANGE`). A listed field is compared on the keys the file
states; keys only the org's copy carries are ignored, and a differing stated key is
refused with the same code. On Engagement DLOs the file may also omit
`cdp_sys_PartitionDate__c`, the DateTime field Salesforce adds with the event field.
Retrieve leaves all of these generated fields out of the file; the fields named by
`eventDateTimeFieldName` and `recordModifiedFieldName` are always saved, so retrieved files redeploy `unchanged`.
Label changes and nonprimary field additions of any type Salesforce accepts use the
update route; changed or removed existing fields are refused with the same code.
Create sends the category as the file states it, and for Engagement the event field
`spec.eventDateTimeFieldName`; neither can change afterwards, so a changed category
is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE` and a changed event field with
`UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`, before any write. Observed at API 68 through
the plugin on 2026-11-11: a Profile and an Engagement DLO created, redeployed and
round-tripped through retrieval unchanged, a field added to the Engagement DLO, and
a changed event field refused with nothing written.

The optional `spec.recordModifiedFieldName` is carried through retrieve, create and
update. Observed at API 68 on 2026-11-16: create set it, an update set it on a DLO
without one, a repeat deploy of the retrieved file was `unchanged`, and a changed
value was answered by Salesforce with HTTP 400 `Record modified field already present`
(reported as `DLO_HTTP_ERROR`). A hand-written DLO, DMO and mapping file deployed
`unchanged` after a relationship made Salesforce add `KQ_RefId__c` and its mapping
pair. `capabilities` (DLO) and `isSegmentable` (DMO) are not authorable: Salesforce
answers HTTP 403 to non-empty `capabilities` and HTTP 400 `JSON_PARSER_ERROR` to
`isSegmentable` on create and update, so neither is saved in a file.

Fresh isolated-installed API68 acceptance retrieved an empty standalone Other/default
DLO from the source and deployed the exact saved file into the target, with differing
org-local IDs and independent full generated/primary-key preservation. A label and
additive Text update persisted; repeated deploy captured only GET, no mutation.
Both exact owned fixtures were independently confirmed absent after guarded deletion.
This does not close mixed-family dependency acceptance, ingestion, populated-object,
lower-version or released-package qualification.

General seven-family support is **unimplemented**. Each family section below
states its own bounded scope; verified behaviour is named there and nothing beyond
it is claimed. Historical API observations are not implemented contracts.
Every family must complete all gates below before support can be declared.

`--api-version latest` is not accepted. Default/`auto` and explicit numeric pins
select the family-specific routes described in each section.

## dlo: unimplemented

Data spaces (2026-11-18): every command checks its data space and the `c__dataSpace` names of
the selected files with one `GET /ssot/data-spaces` before any read or write. A DLO file lists
all its data spaces. Deploy adds the DLO to a listed data space with one
`PUT /ssot/data-spaces/<space>/members` naming only this DLO; the PUT adds and keeps every
other member (live API 68, DB entry `data360:dataspace-members-put-semantics-api68`), so no
member list is read or resent (a data space whose list cannot be read completely, such as
`default`, is no longer refused; proven on a custom data space). It removes the DLO from an unlisted data space
with `DELETE …/members?memberNames=<Name>__dll` only with `--allow-dataspace-removal`, then
reads the DLO until it lists the planned data spaces. A member write that Salesforce answers
without success is `DLO_MEMBERSHIP_UPDATE_REJECTED`. Create sends the run's data space only;
the others follow through the member route. Delete refuses a DLO in other data spaces too
(`DLO_DELETE_OTHER_DATASPACES`), also as the landing DLO of a stream deleted with
`--delete-dlo`. Routes proven live at API 68 (verification DB entries
`data360:dlo-dataspace-membership-20261118.api68`,
`data360:dataspace-followups-20261118.api68`); the plugin's own run of them is not yet
verified live.

Data spaces of DMOs, mappings and relationships (2026-11-19, D1b): each file names its one
data space in a top-level `c__dataSpace` string (the old `identity.dataSpace` is
`LEGACY_DATASPACE_KEY`), and deploy and delete refuse a file of another data space than the
run's (`DMO_DATASPACE_MISMATCH`, `MAPPING_DATASPACE_MISMATCH`,
`UNSUPPORTED_RELATIONSHIP_DATASPACE`). Every mapping and relationship REST request sends
`?dataspace=` with the run's data space and every DMO create and update `dataSpaceName`, also
for `default`. The DMO list holds every data space and is kept by each entry's
`dataSpaceName`; an entry without one stops the listing (`NATIVE_INVENTORY_UNCONFIRMED`).
Files carry the names Salesforce stores (`ds2_Individual__dlm` and `FirstName__c` for a
standard DMO copy in `dataspace2`). The first mapping onto a copy that does not exist yet is
sent once more with the default spelling (`ssot__X__dlm`, `ssot__` target fields, the prefix
from `GET /ssot/data-spaces`) when Salesforce answers the copy spelling with 404, and read back
under the copy name; proven live through the raw API (DB entry
`data360:dataspace-identity-resolution-api68`), not yet through the plugin. The
`*_DATASPACE_COLLISION` codes of DMOs, mappings and relationships are gone: their names are
unique in the org.

Data spaces of data streams and calculated insights (2026-11-19, D2): a stream file lists the
data spaces of its landing DLO in `c__dataSpace` (read from the DLO on retrieve) and deploy
only checks it: it must hold the run's data space and equal the DLO's data spaces, and a new
stream lists the run's data space alone, sent as the DLO's `dataspaceInfo` in the create
(`STREAM_DATASPACE_MISMATCH`). Spaces change only through the DLO file. A stream belongs to the
run's data space when its DLO lists it; the stream list is kept by each entry's
`dataLakeObjectInfo.dataSpaceInfo`, and a stream outside the run's data space is
`UNSUPPORTED_STREAM_DATASPACE`. `STREAM_DATASPACE_COLLISION` is gone. A calculated insight file
names its data space in a top-level `c__dataSpace` string instead of Salesforce's `dataSpace`;
deploy sends it as `dataSpaceName` in create and update, retrieve lists with `?dataspace=` and
checks each GET, and deploy, publish and delete refuse a file of another data space
(`CI_DATASPACE_MISMATCH`). The ordered batch keys components by data space; CI SQL names
carry no data space, so an insight's dependencies are taken from its own data space. Neither family has run live outside `default` through the
plugin yet.

Data spaces of segments and data transforms (2026-11-19, D3): a segment file names its data
space in a top-level `c__dataSpace` string (`identity.dataSpace` and `spec.segmentOn.dataSpace`
are `LEGACY_DATASPACE_KEY`); its DMO and Waterfall children are in the same data space
(`SEGMENT_DEPENDENCY_OTHER_DATASPACE`). Files carry the stored name (`ds2_<Name>` in
`dataspace2`), sent unchanged as `developerName` with `POST /ssot/segments?dataspace=<space>`;
a non-default file without the org's prefix is `SEGMENT_NAME_NOT_STORED`. Item routes (GET,
PATCH, DELETE, publish by ID) take no data space; the segment list is kept by each entry's
`dataSpace`. Retrieve, deploy, delete, publish and `segment members export` (detail query with
`dataspace=`) work in the run's data space and refuse another (`SEGMENT_DATASPACE_MISMATCH`). A
data transform file names its data space in `c__dataSpace`, equal to `definition.dataSpaceName`
when it names one; otherwise the data space comes from the transform's MktDataTransform record
(one SOQL read per command, `TRANSFORM_DATASPACE_UNREADABLE` on failure), and a transform without
any data space there is handled in `default` only. Retrieve, deploy and delete resolve it before
any projection, verbatim file, write or DELETE and refuse another
(`TRANSFORM_DATASPACE_MISMATCH`); a create outside `default` needs `dataSpaceName`. Neither family has
run live outside `default` through the plugin yet.

Data spaces of data graphs and identity resolution (2026-11-19, D4): with them every family works
in any data space, and every default-only refusal is gone. A graph file names its data space in
`c__dataSpace`, equal to `definition.dataspaceName` when the definition names it (deploy fills
it otherwise; the create body sends it). Graph names are unique in the org, so retrieve, deploy
and delete read the graph by name and check its `dataspaceName` before anything is projected
(`DATA_GRAPH_DATASPACE_MISMATCH`, `DATA_GRAPH_DATASPACE_UNREADABLE`); the metadata and inventory
reads send `?dataspace=<run>`, the `DataSpace` SOQL names the run's data space, and the root DMO
read names it too (a root of another data space is `DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE`;
related objects are sent as written). An identity resolution file names its data space in
`c__dataSpace`; its references carry none (`LEGACY_DATASPACE_KEY` for the old keys) and use the
stored spelling (`ds2_Individual_<id>`, `ds2_Individual__dlm`, `FirstName__c`; DB
`data360:dataspace-identity-resolution-api68`). Deploy refuses a non-default file without the
org's prefix before any write (`IDENTITY_RESOLUTION_NAME_NOT_STORED`) and creates with the ruleset
ID after `<prefix>_<type>_` and `dataSpaceName`; the prefix is the one the org's data space list
names, also in the create itself. A ruleset named `<prefix>_<type>` (no ruleset ID) outside
`default` is untested. The item GET reads a ruleset of any data space,
so each read checks `dataSpaceName` first (`IDENTITY_RESOLUTION_DATASPACE_MISMATCH`); the list
ignores `?dataspace=` and is kept by each entry's `dataSpaceName`. Entity and output DMOs are
read with `?dataspace=`; one of another data space, or a DLO source outside it, is
`IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE`. The mixed retrieve and the deploy batch take
every family in any one data space. Neither family has run live outside `default` through the
plugin yet.

Native DLO retrieve and delete read one exact `__dll` detail at API 68 (or an explicit
numeric pin of 61 and up) through the guarded GET transport without refresh, retry or
redirects. Stream/connector bindings, lineage and generated replay remain unqualified.

The unused internal raw-page DLO evidence inventory helper and its
incomplete-evidence type have been removed. Native DLO inventory is
`listNativeNames`: it takes every DLO the list pages return (live, `totalSize` can exceed
the entries returned) and keeps those of the run's data space; the file of each lists every
data space the DLO belongs to (`c__dataSpace`), so a DLO in several data spaces retrieves
from any of them into the same file. This internal cleanup changes no public command or native
retrieval behavior; the historical evidence below does not qualify ingestion,
stream/connector bindings, lineage or generated replay.

API68 official-reference annotations mark list/detail routes available from API60;
that reference availability is not live qualification at every version, nor of
connector-specific behavior. The current reference
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
definition may omit generated and system fields, and retrieve leaves them out: fields
read as `System`, `DataSource__c`, `DataSourceObject__c`, `InternalOrganization__c`
and `KQ_` names. Primary keys and the standard fields of a standard DMO are always
saved. Deploy keeps the generated fields from the org. Keys only returned by reads
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
- A deploy never removes the primary key or a generated field (a missing one is
  kept); `delete --field` removes generated fields on request.
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
- Before the DMO's first write (its PATCH, or the destructive change when there is no
  PATCH) the same read-only check runs (fields present, mappings ACTIVE, every pair on
  a removed field covered); a removal that would be refused stops the item as
  `blocked`/`not-attempted` with nothing written.
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
- Everything else (standard scope): `creationType` `Standard` (for example
  `ssot__Brand__dlm`), a platform-generated DMO (`Adg`, `Bridge`, `Derived`,
  `Segment_Membership` or any other `creationType`), a custom `creationType` under a
  namespaced name and a read without `creationType`. Deploy writes custom fields
  (add, relabel, remove with `--allow-field-removal` under the same rules; a field
  that reads mapped while no mapping lists a pair for it, as on generated DMOs, has
  no pair to lose and is removed), the labels
  of the other fields, the object label (sent only when it differs) and the object
  description (absent is not managed, an empty string clears it). Field-level delete
  removes any named field but the primary key. Whole-DMO delete is sent for every
  DMO, a standard one and a read without `creationType` included, and Salesforce
  decides (a 4xx answer is reported as rejected); a standard DMO is never created.

Standard-scope rules:

- Standard, system and generated fields (field `creationType` other than `Custom`)
  are never removed by a deploy and may be absent from the file (retrieve leaves the
  generated ones out, so a missing one is kept). One that the file lists with another
  `label` gets that label alone sent (`{"fields":[{"name","label","dataType"}]}`);
  Salesforce decides (API 68: system and graph fields relabelled, an `ssot__` field
  refused with 400 `INVALID_INPUT`). Any other difference in a comparable property is
  refused with `UNSUPPORTED_DMO_FIELD_CHANGE`, naming field and property. `isMapped`
  and `keyQualifierName` are not compared on these fields. Salesforce does not protect
  these fields itself (API 68 relabels and deletes them), so this rule is the
  plugin's.
- A new field must be a plain custom field: no double underscore before `__c` and no
  `creationType` other than `Custom`. Otherwise `UNSUPPORTED_DMO_FIELD_ADDITION`.
- The category is neither sent nor compared nor required at readback. Mapping a
  standard DMO for the first time changes its category from `UNASSIGNED` to `OTHER`,
  enables it, adds the system field `KQ_Id__c` and sets `keyQualifierName` on the
  standard primary key; none of this causes a write or a refusal, so a retrieved file
  deploys back `unchanged`, also to an org where the DMO is not mapped yet.
- PATCH body for one added custom field: `{"fields":[{"name","label","dataType",
"isPrimaryKey"}]}`; for a label change: `{"label"}`; every create and update also
  names the run's data space in `dataSpaceName` (`default` when `--dataspace` is left out).
- Readback confirms the label, a managed description, the custom fields of the file,
  the labels of the other listed fields and the absence of removed fields.
- [x] Observed at API 68 through the plugin on one standard DMO in two orgs, active in
      only one of them: add and relabel a custom field; remove it with
      `--allow-field-removal` and with `delete --field` (local file refreshed);
      object description set and cleared; a changed standard field refused;
      whole-object delete refused; a file retrieved in one org deploys unchanged to
      the other.
- [x] Observed at API 68 on one standard DMO: object label changed and reverted;
      Salesforce rejects an edit of a standard field ("Data model fields cannot start
      with ssot__").
- [x] Observed at API 68 through the raw API on `Derived`/`Bridge` (identity
      resolution) and `Adg` (data graph) DMOs: object label/description, added custom
      fields, custom-field relabels and Metadata API field deletes accepted; system
      and graph fields relabelled and deleted; `ssot__` field relabel refused (400);
      mapping POST refused (400 "Unsupported DMO Creation Type used for mapping");
      DMO DELETE refused while the owner exists (412 `MATCH_PRECONDITION_FAILED`).
- [ ] Not tested: a category change on a standard DMO, standard DMOs in active use
      (data-bearing, referenced), whole-DMO delete of a standard DMO, namespaced
      custom DMOs. The plugin's writes to platform-generated DMOs and the removal of a
      mapped custom field of a standard DMO are covered by synthetic tests only.

Native mapping targets, decided from the same raw read:

- A mapping deploys onto any DMO and Salesforce decides; at API 68 it refuses
  platform-generated targets (400 `INVALID_INPUT`), and that answer is reported.
  `MAPPING_ACTIVATES_STANDARD_DMO` is shown only for a `creationType` `Standard`
  target.
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
  field may still be absent. A relationship from a non-key target field adds a key
  qualifier pair whose names differ: `KQ_<S>__c` onto the `System` key-qualifier field that the
  target field names in `keyQualifierName`, where the mapping maps `<S>__c` onto
  that target field (seen at API 68: `KQ_RefId__c` to `KQ_Name__c` for `RefId__c` to
  `ssot__Name__c`; custom DMOs are treated the same way). Generated pairs are never
  sent and, with the key pair, never unmapped by a deploy.
- Mapping file and existing mapping, custom and standard target alike: the file may
  list only the authored pairs. The pairs Salesforce generated (the three system
  pairs and the key qualifier pair) are taken from the org's copy and treated as part
  of the file, so a hand-written file deploys back `unchanged`, can add pairs, and
  removes exactly the authored pairs it drops. The authored primary-key pair must
  stay in the file (`MAPPING_PROTECTED_PAIR_REQUIRED`). Retrieve writes the authored
  pairs only. One rule (`isGeneratedMappingPair`), applied to fresh reads of the
  source data lake object and the target DMO, decides for retrieve which pairs to
  leave out and for deploy which org pairs to keep, so a pair a retrieved file omits
  is never read as a removal. When those reads fail, retrieve refuses the mapping with
  `MAPPING_GENERATED_PAIRS_UNPROVEN` and writes nothing for it.
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
    with the DMO. Selected together with that DMO, the mapping is reported
    `removedWith` the DMO instead. The last mapping of a standard DMO is deleted; the DMO stays
    enabled with its generated `KQ_Id__c` field and no mapped fields.
  - `--preview` is read-only and reports the single planned step `delete`.
  - The deployment is sent once and never retried. Not confirmed by Salesforce:
    `MAPPING_DELETE_FAILED` with Salesforce's problem text.
  - Readback: up to 6 reads, 5 seconds apart, until the mapping reads 404
    (`MAPPING_DELETION_UNCONFIRMED` otherwise); then the DMO's other mappings (pairs
    and selectors) and the DMO's field names must be exactly what they were
    (`MAPPING_DELETE_SIDE_EFFECT` otherwise). On a standard DMO copy in another data
    space the fields only the deleted mapping targeted may be gone (Salesforce drops a
    copy field with its last mapping); every other field must stay.
- Shared target field: a pair is removed even when another mapping of the same DMO
  targets the same field. The field must then keep `isMapped: true`; it loses the
  marker with the last such pair. A pair onto a field another mapping targets is sent
  like any other addition.
- [x] Observed through the plugin on empty synthetic fixtures in one org: a mapping
      created with a Number pair, a renamed pair (`Note__c` to `Other__c`) and one
      Number source onto a Number and a Text target, ACTIVE (66 seconds for two data
      lake objects, the DMO and the mapping); its preview `unchanged` with
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
- [x] Observed at API 68 through the plugin in one org, lean retrieve: a data lake
      object, a custom DMO and their mapping plus a data lake object and a mapping onto
      `ssot__Brand__dlm` created (90 s) and retrieved; the files held the authored
      fields and pairs only (custom mapping: three authored pairs and the key pair;
      standard mapping: `Name__c` to `ssot__Name__c` and `Id__c` to `ssot__Id__c`).
      All five files deployed back `unchanged` (10 s) and the org still held every
      generated pair.
- [x] Observed at API 68 through the plugin, local files on delete: the preview listed
      the mapping file (`exists: true`); the mapping delete removed its file (27 s);
      a data lake object delete with `--keep-local-files` kept its file; a DMO plus
      data lake object delete removed both files (28 s).
- [ ] Not run live through the plugin: removal of a pair for a custom field of a
      standard DMO (covered by synthetic tests), whole-mapping delete at API 61 to
      67, populated objects.

Whole-DMO delete: exact name, no dependency preflight, no prompt, no local file read.
After a confirmed deletion the DMO's local file is removed (see Local files after
delete in [artifact formats](artifact-format.md)); `--keep-local-files` keeps it.
Salesforce may cascade to the DMO's mapping. Deletion resolves the exact
target through `deleteNativeDmo` and uses `DmoClient.delete`.

Field-level delete,
`sf data360 delete -m dmo:<Name__dlm> --field <Field__c>`:

- Removes named custom fields from one DMO together with their mapping pairs. It is
  the one delete operation that rewrites project files (it removes none), and it changes mappings the
  command line does not name; check it with `--preview` first.
- `--field` is repeatable and needs exactly one `dmo:` selector. Any other selector,
  `--changed-since`, `--delete-dlo`, or `--output-dir` without
  `--field` is refused with `INVALID_FIELD_DELETE_SELECTION` before any org call.
- Admission is read-only: any DMO; each field exists (`DMO_FIELD_NOT_FOUND`) and is
  not the primary key (`UNSUPPORTED_DMO_FIELD_CHANGE`); standard, system and
  generated fields may be named and Salesforce decides (a Metadata API refusal is
  reported with mutation `rejected`); the mappings targeting the DMO are listed and
  every pair targeting a named field is collected. A mapped field is refused with
  `DMO_FIELD_REMOVAL_MAPPED` only when the list request fails (other than 404); a
  mapped field that no mapping lists a pair for has none to lose and is removed. Every collected pair must be identified on an ACTIVE
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
  (default: current directory) are overwritten with fresh reads. A mapping file with
  another name is found by its binding (source DLO, target DMO, data space) and keeps
  its name. Absent files are not created (`not-present`); no file is deleted. A failed refresh keeps outcome
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

Git selection (`--changed-since`) uses the native DMO file. A native DMO selected
beside Segment/CI/IR inputs, explicitly or through Git, joins the ordered batch. Prerequisites are checked, not pulled in: each must be selected
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

## relationship: native definition retrieve, create, update and delete

- [x] File `data360/relationship/<Name>.relationship-meta.json`: `schemaVersion: 1`,
      `kind: relationship`, `c__dataSpace`, `identity` (`apiName`) and `spec` with
      `sourceObjectName`, `sourceFieldName`, `targetObjectName`, `targetFieldName`,
      `cardinality` and `relationshipOwner`, plus an optional `label`. Cardinality,
      owner and label are sent as written.
- [x] Native route only, default/auto API68; numeric pins from 61 are kept.
- [x] Retrieve `-m relationship:<Dmo__dlm>`: every relationship whose source is that
      DMO, one file each. Bare `relationship` reads those of every listed DMO,
      one DMO after another. The list is read in pages of 200 by
      offset and must add up to `totalSize` without duplicate names
      (`RELATIONSHIP_INVENTORY_INCOMPLETE` otherwise). The label comes from the
      Metadata API (`FieldSrcTrgtRelationship` read, ten per call, same connection).
- [x] Deploy matches by the file's name, then by binding (source object and field, target object and field), so
      a hand-written file may use any name; Salesforce generates the name on create.
      Present with the file's values: `unchanged`. Absent: one create,
      then reads until ACTIVE (`RELATIONSHIP_PERSISTENCE_UNCONFIRMED`, at once on a
      status other than ACTIVE or CREATING), then a label update when the file states one.
      Other values: one Metadata API `updateMetadata` of the whole record over the
      command's connection, read back until it holds the file (`updated`,
      `confirmed-updated`); Salesforce's refusal is `RELATIONSHIP_UPDATE_REJECTED`,
      mutation `rejected`.
- [x] Native batches run DLOs, DMOs, mappings, then relationships; a preview of a
      relationship whose DMO the batch creates reports `planned-dependencies`.
- [x] Salesforce requires both DMOs to be mapped (HTTP 400, reported as
      `RELATIONSHIP_HTTP_ERROR`, mutation `rejected`); no local check.
- [x] Delete `-m relationship:<SourceDmo__dlm>:<Name>` lists the source DMO's
      relationships and finds the name ignoring case (`unchanged` when absent or when
      the source DMO itself does not exist, list HTTP 404 `ITEM_NOT_FOUND`,
      `AMBIGUOUS_RELATIONSHIP_TARGET` for 2+, `RELATIONSHIP_TARGET_BINDING_MISMATCH` when
      its source is another DMO); a bare `relationship:<Name>` is `INVALID_SELECTION`. With
      `--changed-since` the base content gives the source DMO and binding
      (`RELATIONSHIP_NAME_MISMATCH`, nothing deleted, when the binding exists only
      under another name). It sends one DELETE and confirms absence
      (`RELATIONSHIP_DELETION_UNCONFIRMED`). HTTP 4xx: mutation `rejected`.
      Relationships run first in a delete command. `--preview` only reads.
- [x] Observed at API68 through the plugin in one org on empty custom DMOs: combined
      create of two DLOs, two DMOs, two mappings and the relationship, unchanged
      repeat, retrieve by DMO with unchanged redeploy, read-only delete preview,
      confirmed delete and unchanged repeat delete.
- [x] Update observed at API68 through the plugin on an active relationship between
      mapped custom DMOs: label and cardinality changed, retrieved back, unchanged
      repeat. Raw probes: source field change accepted; target field, target object and
      owner refused (`UNKNOWN_EXCEPTION`).
- [ ] Standard and data-bearing DMOs, non-default data spaces, other API versions,
      cardinalities other than ManyToOne.

## mapping: native API 68 route

- [x] Mappings retrieve, deploy and delete on the native route (default/auto API 68, numeric
      pins from 61 kept); see the README CRUD table. There is no Metadata API mapping export.
- [x] Mapping label (`spec.label`): the native routes carry none (GET without label; mapping
      PATCH/PUT 405; field-mappings PATCH and create ignore `label`; live API 68). Retrieve
      reads it with Metadata API `readMetadata` (10 names per call, warning and no label when
      the read fails); deploy sets a different label with one `updateMetadata` after the pair
      writes, carrying every pair the mapping currently has and no other (a pair left out is
      kept, a pair sent is added), and reads the label and pairs back.
- [ ] Record official endpoints, versions, pagination and inventory scope.
- [ ] Preserve deterministic source/target identity, fields and qualifier mappings.
- [ ] Verify replacement/update semantics cannot silently remove existing mappings.
- [ ] Prove schema-reference validation and supported create/update/no-op.

## identity-resolution: unimplemented

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve matching/reconciliation order, precedence, case and secondary objects.
- [ ] Classify generated-schema dependencies and automatic-run side effects.
- [ ] Prove configuration-only behavior without running resolution.

## data-graph: native API 68 route

- [x] Native API68 retrieve, create, PUT update and delete; see the top section.
- [ ] Prove create/read-back/no-op without refresh, activation or delete/recreate.

## segment: native API 68 route

- [x] Native API68 retrieve, create, PATCH update, delete and publish by exact name in the
      default data space.
- [x] DBT SQL models, UI criteria and other types (Waterfall, Dynamic,
      EinsteinGptSegmentsUI) are sent as written with their lookback; Salesforce decides
      (live API 68, 2026-11-18: lookbacks P7D to P1Y accepted, P0D, `30` and P400D refused).
- [x] Refresh schedule: the optional `schedule` key in write shape is sent on create and,
      when a key it states differs, on update; absent leaves the schedule alone. A left-out
      start date is kept (verified); a left-out end date is checked by the readback. A UI schedule is cleared
      with `{"frequency": "None"}`; Salesforce refuses every clearing body for a DBT segment
      and that 400 is reported. Preview and deploy report `SEGMENT_SCHEDULE_CHANGE`.
- [x] Parameters are not segment input at API 68 (create answers 400 for the key); a
      segment with parameters is retrieved as-is.
- [x] Waterfall child segments: retrieve writes them by name (`childSegments`, one segment
      list read names the org-specific definition IDs); deploy binds each child in the
      target (children outside the selection are read before the first write of the run;
      `SEGMENT_CHILD_NOT_FOUND` before any write when missing), sends them as
      `includeCriteria` on create and PATCH, deploys selected children first and reads the
      children back by name. Live API 68 (2026-11-18): create with children 201; a PATCH
      without them keeps the children (200).
- [x] Updates of other types are sent as written: a Waterfall and a Dynamic PATCH answered
      200 and kept the rest (live API 68); Salesforce refuses every EinsteinGptSegmentsUI
      update with 400, reported as rejected.
- [ ] A Waterfall PATCH that changes the children is sent as written, not verified live.
      Waterfalls with DBT children on an empty probe DMO ended `ERROR`
      (`PROCESSING_FAILED`, cause not investigated).
- [ ] End dates and an hourly `publishInterval` are kept and sent as written, not verified
      live.
- [ ] Criteria of dynamic and Einstein segments, real-time segments on a data graph and
      lookalike segments with a real seed are not verified.

## calculated-insight: unimplemented

The bounded native lifecycle above does not close general lifecycle or
cross-org support.

- [ ] Record official endpoints, versions, pagination and writable contracts.
- [ ] Preserve exact SQL, dimensions, measures, relationships and settings.
- [ ] Classify implicit compute/enable/schedule side effects and block unsafe routes.
- [ ] Prove safe export-to-target create/update/no-op without computation.

## Bounded Git deployment selection

`deploy --changed-since <ref>` is exclusive with metadata/source-dir. It selects current
canonical files of every family (DLO, DMO, mapping, relationship, data stream, data
transform, data graph, identity resolution, calculated insight, Segment JSON), admitted
through the existing input resolver with byte capture, and routes them as explicit
selections of the same families and runs them in the same phases, data transforms included. Files deleted in the range become delete candidates (family and identity
from the merge-base content; relationship source DMO and transform API name included),
reported in `result.selection.deletions` and never deleted by deploy (`delete
--changed-since` deletes them). A path deleted and re-added is not a delete; one
component deleted at one path and added at another across commit, index and worktree
blocks. Repository-root resolution, unique merge-base/HEAD changes,
index, worktree and untracked selection are local. Renames, conflicts, unstaged deletions, deleted
files of no known family and half-deleted calculated insight pairs block the whole selection,
regardless of diff.renames configuration. Git inference is not historical rename-intent
proof. A relevant untracked addition plus any tracked worktree deletion blocks
conservatively. Empty selection succeeds before downstream target inspection/services,
without changing core parse-time auth. File list: [Git workflow](git-workflow.md).

## Shared gates

ConnectClient SSOT GETs now use an operation-local no-refresh receiver, like guarded
writes: expired authentication fails immediately without OAuth refresh or replay.
Repair authentication before a new explicit invocation. Retry and redirect refusal
remain in place; the caller's connection and unrelated consumers are unchanged.
This does not change API-version discovery or the separate Metadata/SOAP guard.

- [x] Read-only authenticated Connect REST transport, structured errors and redaction.
      Broader resource contracts remain pending.
- [x] Native DMO route as described in the dmo section above. The items formerly
      listed here for the Metadata API DMO adapter (deploy preflight, common projector,
      file writer, DMO pagination, relationship acquisition, field join
      and request mappers) were removed together with that adapter.
- [ ] Qualified logical references and verified data-space binding.
- [ ] Versioned deterministic artifacts, safe paths and unknown-field blocking.
      See [artifact formats](artifact-format.md) for the current documents.
- [ ] Whole-selection dependency/diff preflight and input/target drift guards.
- [ ] Read-back verification and partial/uncertain failure handling.
- [ ] Bounded opt-in live acceptance with explicit fixture ownership ledger.

No live fixtures were created, claimed, modified or removed by this slice.

Deploy items of DLOs, DMOs and mappings report mutation `rejected` when Salesforce
answered the item's first write with an HTTP 4xx status: nothing was written for the
item. A failure after a completed write stays `unknown`.

DLO delete reads the DLO's dependency list (`GET ssot/data-lake-objects/{name}/dependencies`)
before the DELETE, in preview too. Salesforce refuses to delete a DLO with dependents (HTTP 412
`DEPENDENCY_EXISTS`; a mapped DLO lists the DMO). All selected DLOs are checked before the command's first write; a dependent the same command does not delete stops the command with `DLO_DEPENDENCY_EXISTS`, naming each one, before anything is deleted. A DMO
dependent is covered by `dmo:<Name>` or by selecting every mapping between the DLO and the
DMO. Delete selections run mappings, then DMOs, then DLOs; the DLO waits (6 reads, 3 seconds
apart) for the list to empty, otherwise `DLO_DEPENDENCY_PENDING`. Observed at API 68: a mapped
DLO refused with the DMO named; DLO plus its mapping deleted in one command (32 s); DLO plus
its DMO deleted in one command (15 s). DMOs have no dependency route (`/dependencies` answers
404), so DMO delete checks no dependents.

After a confirmed deletion (`deleted`/`confirmed-deleted`, or
`deletion-processing`/`acknowledged-processing`) delete removes the component's local
file at its canonical path by name, one regular file at a time and only inside the
project's `data360` folder. Results list `removedLocalFiles` (`removed`, `not-present`,
`kept`, `failed`); a failed removal keeps the org outcome and exits nonzero with
`LOCAL_FILE_REMOVAL_FAILED`. `--keep-local-files` keeps the files and `--preview` lists
them as `localFiles`. Details are in [artifact formats](artifact-format.md).
