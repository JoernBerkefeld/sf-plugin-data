# Data360 Salesforce CLI plugin

`sf-plugin-data` is an independently authored TypeScript/ESM
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
Selectors and numeric API 65.0/default scope are validated before core org resolution or
resource reads; the common service remains the per-object capability boundary.

`--api-version latest` is an explicit experimental read-only option for retrieval
and deployment `--preview`; the default stays `65.0`. Each invocation performs one
fresh authenticated `GET /services/data`, without cache, fallback, retry or redirect,
to discover numeric SOAP evidence. REST retains literal `/services/data/latest/ssot/`;
SOAP alone is pinned numerically. Authentication initializes a command-owned core
connection at numeric bootstrap `65.0`, preventing core's implicit cached/network
version discovery before the guarded request. The capability boundary still requires SOAP
`65.0`: discovery of `68.0` (or any other version) blocks before DMO resource calls
and advises explicit `--api-version 65.0`. This is not API 68 support or live
qualification of the REST alias. Direct deployment with `latest` is refused before
preflight or mutation. `metadata.apiVersion` is the requested selector and optional
`metadata.soapApiVersion` is discovered/pinned numeric SOAP evidence, **not** the
actual version served by REST. Discovery errors omit remote payloads.
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

Deploy also accepts `--changed-since <ref>`, exclusive with `--metadata` and
`--source-dir`, for current canonical DMO files selected from the unique Git merge
base, staged/unstaged changes and relevant untracked files. It resolves the
repository root even from nested directories. Relevant renames/deletions block;
a relevant untracked DMO addition plus **any tracked worktree deletion** also
blocks conservatively. Stage intended changes to permit Git-inferred rename
detection; unsupported lifecycle changes still block. A valid empty selection
succeeds without downstream target/resource/service work, but existing parse-time
core authentication remains. Optional Git provenance records resolved commits,
not exact-byte binding. See [Git workflow](docs/git-workflow.md) for scope and
limitations; report files, CI delivery and SQL companions remain deferred.

An internal read-only `readDeployInputs` resolver now admits explicit authored JSON
files/directories or repeated exact `dmo:ApiName` project selectors. Identical paths
coalesce; different files claiming the same identity fail. No selection, bare types,
mixed modes, malformed JSON, duplicate JSON keys, runtime projections and linked
paths fail closed. Directory mode is bounded and strict: every descendant file must
be authored DMO JSON; unrelated files are not silently ignored. This input-only
resolver is wired to preview and execution; input admission alone never authorizes writes.

## Metadata examples: prerequisites and qualification

The chapters below document **standard Salesforce CLI Metadata API retrieval**
and separately bounded mapping deployment, owned-DMO deletion and custom relationship
lifecycle qualified at API `65.0` on 2026-10-27. These `sf project` commands are provided by
Salesforce CLI, not additional `sf data360` plugin commands. Successful retrieval
proves a source export, **not full CRUD, cross-org portability or safe replay**.
The plugin's separately bounded DMO JSON retrieval, creation and label-update
capabilities remain as described above and under [Read-only deploy preview](#read-only-deploy-preview).

**Intended user workflow (not yet implemented across these families):** retrieve
or deploy one or multiple selected components in one command, without hand-authored
manifest, deployment-summary or Data Kit files. Any generated manifests/kits must
remain internal, hidden from users and excluded from Git. The raw standard CLI
examples below establish qualified mechanisms, not completion of that broader
plugin UX. The kit manifest example is low-level diagnostic evidence only, not a
required step in the intended workflow. Current plugin capabilities remain bounded
as described above; no new wrapper commands are implied.

Before running the retrieval examples:

- Install Salesforce CLI and authenticate your source org. Replace `SOURCE_ALIAS`
  in every command with that org's authenticated alias or username.
- Run from a Salesforce source-format project containing `sfdx-project.json` and
  an **existing** package directory. For example, use the following project
  configuration and create its `force-app` directory before retrieving. A missing
  package directory produces `MissingPackageDirectoryError`.
- `65.0` is the qualified API version used here; keep it explicit. The member names
  are actual examples from the qualification source org, not assets guaranteed to
  exist in your org. Substitute exact member names from your own source org.
- Retrieval writes local files. Use a dedicated project or inspect existing local
  changes first. Retrieval examples do not deploy, start ingestion or run computation.

Example `sfdx-project.json`:

```json
{
  "packageDirectories": [{ "path": "force-app", "default": true }],
  "namespace": "",
  "sourceApiVersion": "65.0"
}
```

### Data Model Object (DMO): `CustomObject` with `__dlm`

`__dlm` identifies a Data Model Object. Standard retrieval writes the object and
its decomposed field XML under `force-app/main/default/objects/`.

#### Read / Retrieve

Retrieve the standard, namespaced Account DMO **for inspection only**:

```sh
sf project retrieve start --metadata CustomObject:ssot__Account__dlm --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Or retrieve the unmanaged custom qualification DMO:

```sh
sf project retrieve start --metadata CustomObject:McpMappingProbe_20261027__dlm --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Account retrieval included field definitions and lookup references, but an object
export alone is not a complete mapping, relationship or ingestion export. Do not
use the managed/standard Account example as a create, update or delete fixture.

#### Create

Standard Metadata API creation is **not yet verified**. The combined target
check-only test of the custom DLO, DMO and mapping failed with primary-key,
key-qualifier and mapping internal errors. Provisional component successes in a
failed dry-run are not persisted objects. No runnable standard create example is
qualified; this does not negate the plugin's separately bounded guarded create.

#### Update

Standard Metadata API update is **not yet verified**. The plugin's existing
object/existing non-primary field label-update subset is separate from Metadata
XML deployment and does not establish general schema updates.

#### Delete

**Standard API 65 deletion succeeded for the exact test-owned empty custom DMO**
`McpMappingProbe_20261027__dlm`. The deployment selected only that DMO; its sole
owned mapping was removed by the observed parent cascade. Terminal deployment
success and independent exact Metadata plus Connect readbacks established both
DMO and mapping absence. The DLO remained the same ID, `ACTIVE`, with eight fields,
unchanged Metadata and zero dependencies.

**Destructive low-level qualification mechanism, not the final user workflow:**
from an isolated source project, the qualification internally generated two
ephemeral files. Their contents are shown for transparency, **not as a requirement
for users to hand-author manifests**. Future orchestration must keep such files
internal and excluded from Git; no turnkey delete wrapper is implemented here.

Internally generated `package.xml` (no business component selected):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <version>65.0</version>
</Package>
```

Internally generated `destructiveChangesPost.xml` (exact owned DMO only):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>McpMappingProbe_20261027__dlm</members>
    <name>CustomObject</name>
  </types>
  <version>65.0</version>
</Package>
```

The exact tested command shape, with the authenticated target alias substituted:

```sh
sf project deploy start --manifest package.xml --post-destructive-changes destructiveChangesPost.xml --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

**Do not rerun against this now-deleted fixture or substitute business assets.**
Admission used fresh exact identity/ownership and schema reads, the sole owned
mapping, no relationships, and the DLO's sole dependency being that owned DMO.
Deletion can cascade mappings/relationships; downstream calculated insights,
segments, identity resolution or activations can block deletion. This result does
not establish universal downstream dependency visibility, unrestricted cascade
safety, populated/business-object deletion, or a whole-org unchanged-state guarantee.
No DLO was selected for deletion.

`sf project delete source` was **not live-qualified** here and also deletes local
source files; it is not offered as an interchangeable tested example.

### Data Lake Object (DLO): `CustomObject` with `__dll`

`__dll` identifies a Data Lake Object, distinct from a DMO. The source sample is
an unmanaged custom object, not a complete source connector or ingestion pipeline.

#### Read / Retrieve

```sh
sf project retrieve start --metadata CustomObject:McpMappingProbe_20261027__dll --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

The retrieved XML includes fields and observed primary/key-qualifier attributes.
Preserve them; retrieval does not justify stripping system fields to make a
deployment pass.

#### Create

Standard Metadata API creation is **not yet verified**; the combined target
dry-run failed, including the DLO primary-key field.

#### Update

DLO updates are **not yet verified**.

#### Delete

Standard API 65 deletion of the exact owned DLO definition was **attempted and
refused**, not successfully qualified. The server reported that the definition was
referenced elsewhere and identified its own retained Data Lake Object instance.
The dependency list was empty and a complete inspected stream listing contained
no reference to this fixture; neither observation bypassed that instance reference.
Independent exact Metadata, Connect and instance-record comparisons confirmed the
same DLO ID, `ACTIVE` state and eight fields unchanged, with zero reported dependencies.
This is not proof that all standard DLO deletion is unsupported or that an unknown
business dependency exists. No successful delete sample, instance-delete workaround
or Connect fallback is qualified here; the original DLO remains retained.

### DLO-to-DMO mapping: `ObjectSourceTargetMap`

#### Read / Retrieve

```sh
sf project retrieve start --metadata ObjectSourceTargetMap:McpMappingProbe_20261027_map_McpMappingProbe_20261027_1793094371706 --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

The output is under `force-app/main/default/objectSourceTargetMaps/`. This mapping
references the custom DLO and DMO above and their exact fields. Its Metadata XML
contains six pairs. In the later bounded target creation, the system key-qualifier
pair was regenerated: independent API 65 readbacks matched all seven source runtime
pairs, including `KQ_Id__c`, and retained the exact DLO/DMO identities. Subsequent
Metadata retrieval still contained six pairs. This qualifies this exact fixture,
not arbitrary filters, formulas or universal mapping fidelity. Use the returned/listed
mapping name, not a guessed timestamp or selector.

#### Create

Standard API 65 mapping-only dry-run **and actual creation succeeded** after the
exact test-owned DLO and DMO had been separately created through MCP and independently
verified. All 15 target object field XML files matched the retained source fields,
including primary-key and system qualifier attributes. This is **not** standard
Metadata API object-creation proof; the earlier combined object/map dry-run remains
failed and does not independently reject this mapping shape.

**Conditional low-level diagnostic, not a turnkey setup or implemented wrapper:**
the following is the successful mapping-only deployment command. It mutates the
target. It requires the retained mapping XML in the current source project and
already-created, test-owned `McpMappingProbe_20261027__dll` and
`McpMappingProbe_20261027__dlm` in the target, with independently verified matching
fields/PK/KQ and no existing mapping of that identity. Replace `TARGET_ALIAS` with
the authenticated, deliberately selected target alias. Do not run it against a
business org or repeat it as a create retry. This creation receipt is historical:
the target DMO and mapping were later deleted by the bounded parent-DMO operation
above; only the DLO remains. No prerequisite creation command or general safe-cleanup
route is qualified here.

```sh
sf project deploy start --metadata ObjectSourceTargetMap:McpMappingProbe_20261027_map_McpMappingProbe_20261027_1793094371706 --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

The DMO's `isEnabled` changed from `false` to `true` after mapping. The flag's
semantics are undefined in the retained contract; readiness is plausible, but the
observation is **not proof of activation, computation or a no-computation boundary
breach**. No explicit run, ingest or publish action was issued. Neither that fact
nor this flag establishes inertness or absence of internal processing.

#### Update

A standard API 65 deployment of the exact retrieved mapping file with **only its
`masterLabel` changed** succeeded. Independent Metadata retrieval confirmed the
new label; API 65 runtime readback preserved all seven mappings and the same object
identities. Repeating the identical file deployment succeeded with `changed=false`
and unchanged independent runtime readback. This is observed configuration
no-change, **not** proof of zero internal writes/work or general mapping update
support. Arbitrary retargeting, filter/formula changes and field removal remain
unqualified.

#### Delete

Standard mapping deletion was attempted and **failed with a server internal error**;
independent readback retained the active seven-pair map. Exact MCP cleanup was also
refused because the DMO had only one mapped DLO; GUI **Remove mappings** was disabled.
A later exact owned **parent-DMO deletion succeeded and cascaded this mapping**,
with independent Metadata and Connect absence checks, as documented in the DMO
Delete subsection. That does not turn the standalone mapping delete failure into
a success or qualify arbitrary parent cascades. Current target state retains only
the DLO; the test DMO and map are gone. No standalone mapping-delete example,
guessed field-delete path, extra dependency workaround or potentially collection-wide
delete is provided.

### DMO field relationship: `FieldSrcTrgtRelationship`

#### Read / Retrieve

```sh
sf project retrieve start --metadata FieldSrcTrgtRelationship:ssot__ReturnOrder_CustomerAccountId_map_Account_Id_N_1 --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

This standard, DataCloud-owned example serializes the ReturnOrder-to-Account
field references and `ManyToOne` cardinality. It supplements object lookup XML;
referenced objects/fields are dependencies, not automatically proven portable.
Treat this standard relationship as retrieve-only evidence.

#### Create

Standard API 65 creation succeeded for a **separate custom `ManyToOne` relationship**
between two fresh, test-owned empty DMOs in `default`. These DMOs were separately
facade-created, not standard Metadata-created: source `McpRelA_20261027_1524__dlm`
with Text `Id__c` primary and Text `ParentId__c`, and target
`McpRelB_20261027_1524__dlm` with Text `Id__c` primary. Actual object names, primary
keys and system qualifiers were independently verified before deployment. The
managed/standard example above was not modified.

**Historical low-level fixture reproduction, not a turnkey wrapper:** an isolated
source project contained the following owned lookup prerequisite at
`force-app/main/default/objects/McpRelA_20261027_1524__dlm/fields/ParentLookup__c.field-meta.xml`.
The explicit `fullName` is required; the initial local omission failed validation.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
  <fullName>ParentLookup__c</fullName>
  <label>Parent Lookup</label>
  <referenceTo>McpRelB_20261027_1524__dlm</referenceTo>
  <relationshipName>McpRelChildren</relationshipName>
  <type>Lookup</type>
</CustomField>
```

Relationship XML at
`force-app/main/default/fieldSrcTrgtRelationships/McpRel_20261027_1524.fieldSrcTrgtRelationship-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FieldSrcTrgtRelationship xmlns="http://soap.sforce.com/2006/04/metadata">
  <definitionCreationType>Custom</definitionCreationType>
  <lookupFieldName>McpRelA_20261027_1524__dlm.ParentLookup__c</lookupFieldName>
  <masterLabel>MCP Relationship 20261027 1524</masterLabel>
  <owner>DataCloud</owner>
  <relationshipCardinality>ManyToOne</relationshipCardinality>
  <sourceFieldName>McpRelA_20261027_1524__dlm.ParentId__c</sourceFieldName>
  <targetFieldName>McpRelB_20261027_1524__dlm.Id__c</targetFieldName>
</FieldSrcTrgtRelationship>
```

The exact tested two-selector command shape creates both components; `TARGET_ALIAS`
is the authenticated, deliberately selected qualification target. This mutates the
org and requires the matching existing owned DMO prerequisites—not business assets.

```sh
sf project deploy start --metadata CustomField:McpRelA_20261027_1524__dlm.ParentLookup__c --metadata FieldSrcTrgtRelationship:McpRel_20261027_1524 --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

Independent exact Metadata reads confirmed the lookup and every relationship value;
API 65 relationship reads on both DMOs returned the same single custom relationship,
source/target, `ManyToOne` cardinality and observed `INACTIVE` status. No processing
or activation action was issued; this is not general lifecycle or inertness proof.

#### Update

Changing **only** the relationship XML's `masterLabel` to
`MCP Relationship Updated 20261027 1524` and running the following command succeeded:

```sh
sf project deploy start --metadata FieldSrcTrgtRelationship:McpRel_20261027_1524 --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

Exact Metadata readback confirmed the changed label and same relationship ID.
Independent API readbacks preserved the source, target, cardinality and `INACTIVE`
status; DMO schemas/PK/KQ were preserved. Repeating the identical command reported
`changed=false` / `Unchanged` with equal independent readbacks. This is persisted
configuration idempotency, not proof of zero internal writes/work. Retargeting,
cardinality changes, `OneToOne`, managed/shared/business relationships and general
cross-org fidelity remain unqualified.

#### Delete

Exact standard API 65 relationship deletion succeeded. It **also removed the newly
owned, sole-use lookup field**, without an explicit field-delete request. Both DMO
identities remained, exact relationship Metadata was absent, and both relationship
API endpoints independently returned empty HTTP 204 responses.

The tested command used an internally generated version-only `package.xml` as in
the DMO Delete subsection and an ephemeral `relationship-delete.xml` containing:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>McpRel_20261027_1524</members>
    <name>FieldSrcTrgtRelationship</name>
  </types>
  <version>65.0</version>
</Package>
```

```sh
sf project deploy start --manifest package.xml --post-destructive-changes relationship-delete.xml --target-org TARGET_ALIAS --api-version 65.0 --test-level NoTestRun --wait 5 --json
```

These manifests describe the qualified internal mechanism, **not a user
hand-authoring requirement**; intended orchestration keeps them internal and out of
Git. No public relationship wrapper is implemented. Do not apply the observed
lookup cascade to a shared or pre-existing field or rerun against the deleted fixture.

Both empty DMO prerequisites were subsequently deleted using the bounded standard
DMO route and independently confirmed absent. An isolated empty cleanup project
was necessary: stale local lookup XML after the cascade caused the first DMO cleanup
to fail; provisional component successes were not trusted. The final cleanup was
terminally successful with independent Metadata and Connect absence. No new fixture
from this relationship test remains; the original DLO was untouched and retained.

### Source object configuration: `DataSourceObject`

#### Read / Retrieve

```sh
sf project retrieve start --metadata DataSourceObject:Contact_Home --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

The inspected sample contains a source reference, external record identifier,
label, storage type and template version, but no field definitions. It is not a
complete connector/credential export. This sample and the stream below are
independent examples, **not one validated ingestion chain**.

#### Create

Source object creation is **not yet verified**.

#### Update

Source object updates are **not yet verified**.

#### Delete

Source object deletion is **not yet verified**; no destructive command is provided.

### Data stream configuration: `DataStreamDefinition`

#### Read / Retrieve

```sh
sf project retrieve start --metadata DataStreamDefinition:MessagingChannel_Home --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

The inspected sample references a Salesforce connector, source, DLO and transform
and records `FULL_REFRESH` extraction. Retrieving that definition does not start
the stream, supply target connector bindings or prove dependency closure.

#### Create

Stream creation is **not yet verified**.

#### Update

Stream updates are **not yet verified**; no activation or refresh example is qualified.

#### Delete

Stream deletion is **not yet verified**; no destructive command is provided.

### Calculated insight: `MktCalcInsightObjectDef`

#### Read / Retrieve

The following **single command with two selected components** was qualified at
API `65.0`: it retrieves the calculated insight and the segment documented in the
next chapter without a hand-authored manifest.

```sh
sf project retrieve start --metadata MktCalcInsightObjectDef:E360PushActiveUserCountV2 --metadata MarketSegmentDefinition:Annual_Promo_Segment_1789248847753 --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

The calculated insight file is written under
`force-app/main/default/mktCalcInsightObjectDefs/`. Use the Metadata member name
`E360PushActiveUserCountV2`, not its runtime `__cio` API name. Decoded XML SQL,
label and creation type matched independent API 65 readback. The XML **omits live
`isEnabled`, schedule, definition type, dimensions/measures and dataspace**.
The source insight was enabled and active; neither retrieval nor its unscheduled
state proves that a later deployment would be inert. SQL references source DMO
fields, whose presence and compatibility remain target dependencies. This is
selected-field equality, not complete configuration or cross-org fidelity.

#### Create

**Source-only Metadata definition creation succeeded**, not live CI instantiation.
For these historical synthetic examples, `SOURCE_ALIAS` must identify the explicitly
processing-authorized source org. The restricted target was untouched. Existing
referenced DMOs/fields must match; `WHERE 1 = 0` does not guarantee zero scans or
processing. These fixtures were subsequently deleted; do not adopt business assets
or blindly recreate the historical names.

The qualified source file was
`force-app/main/default/mktCalcInsightObjectDefs/McpCiParallel_20261027_1536.mktCalcInsightObjectDef-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MktCalcInsightObjectDef xmlns="http://soap.sforce.com/2006/04/metadata">
  <creationType>Custom</creationType>
  <expression>SELECT APPROX_COUNT_DISTINCT(ssot__DeviceApplicationEngagement__dlm.ssot__DeviceId__c) AS device_count__c, ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c AS app_id__c FROM ssot__DeviceApplicationEngagement__dlm WHERE 1 = 0 GROUP BY app_id__c</expression>
  <masterLabel>McpCiParallel_20261027_1536</masterLabel>
</MktCalcInsightObjectDef>
```

```sh
sf project deploy start --source-dir force-app/main/default/mktCalcInsightObjectDefs/McpCiParallel_20261027_1536.mktCalcInsightObjectDef-meta.xml --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
sf project retrieve start --metadata MktCalcInsightObjectDef:McpCiParallel_20261027_1536 --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Independent retrieval confirmed SQL, label and creation type. Follow-up source
qualification established that a Metadata-only definition **reserved the API name
without adding an operational CI**: the complete runtime collection still contained
only the original insight, supported operational create rejected the reserved name,
and PATCH of the metadata shell's `__cio` name returned `ITEM_NOT_FOUND`.
No in-place metadata-shell-to-runtime binding operation was found in the bounded
contracts. After exact owned shell deletion released the name, operational draft
creation succeeded and generated its own Metadata definition with a new ID. Do not
delete existing business definitions to imitate that diagnostic sequence; create
a separately owned operational CI instead. Use the operational workflow below,
not Metadata deploy followed by an inferred publish.

#### Update

Changing only `masterLabel` to `McpCiParallel_20261027_1536 Updated` and repeating
the deploy/retrieve commands above succeeded with the same Metadata ID and unchanged
SQL/creation type. Expression mutation, runtime update, materialization and unchanged
redeployment were **not tested**. No nonprocessing target admission is qualified.

#### Delete

Exact source Metadata definition deletion succeeded using an internally generated
version-only `manifest/package.xml` and `manifest/destructiveChangesPost.xml` with
only this selection (root/namespace/version as in the DMO Delete example):

```xml
<types>
  <members>McpCiParallel_20261027_1536</members>
  <name>MktCalcInsightObjectDef</name>
</types>
```

```sh
sf project deploy start --manifest manifest/package.xml --post-destructive-changes manifest/destructiveChangesPost.xml --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Terminal deletion and independent inventory confirmed the synthetic Metadata absent;
the original CI remained. This is definition cleanup, not proof of runtime CI CRUD.
Manifests are internal low-level transport evidence, not required user-authored files.

#### Operational CI — create a draft

The following generic recipe combines two separately qualified source fixtures:
one established draft creation using **standard CLI transport to the documented
API 67 MCP execute facade**; the other established API 65 publication, update and
asynchronous deletion after supported facade creation. It is not a claim that one
fixture traversed every step using only CLI, nor a direct public API 65 POST proof.
There is no dedicated built-in calculated-insight create command implied here.

`SOURCE_ALIAS` must be the processing-authorized source. The target was untouched;
this evidence does not qualify noncomputing target admission or cross-org fidelity.
The referenced DMO and fields must already exist and be compatible. Choose an owned,
unused name such as `ExampleInsight__cio`, and check the runtime collection **and**
Metadata inventory first: Metadata-only name reservations can block creation.

Save `ci-create.json` with this facade envelope. `paramsJson` is a **JSON string**,
not an object; the create inputs inside it are wrapped in `input`:

```json
{
  "toolName": "d360_ci_create",
  "paramsJson": "{\"input\":{\"apiName\":\"ExampleInsight__cio\",\"displayName\":\"Example Insight\",\"expression\":\"SELECT APPROX_COUNT_DISTINCT(ssot__DeviceApplicationEngagement__dlm.ssot__DeviceId__c) AS device_count__c, ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c AS app_id__c FROM ssot__DeviceApplicationEngagement__dlm GROUP BY ssot__DeviceApplicationEngagement__dlm.ssot__SoftwareApplicationId__c\",\"definitionType\":\"CalculatedMetric\",\"dataSpaceName\":\"default\",\"draft\":true}}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @ci-create.json --target-org SOURCE_ALIAS --stream-to-file ci-create-response.json
```

Inspect the saved response's nested result/error, not just CLI exit status or the
facade envelope status. The successful source result returned `DRAFT`,
`isEnabled:true`, empty dimensions/measures, `NOT_SCHEDULED` and null last-run fields.
`NOT_SCHEDULED` is **not disabled**. Use the server-returned `apiName` for all further
operations; the examples assume it is `ExampleInsight__cio`. Creation via this
API 67 facade is distinct from direct API 65 operational requests below.

#### Operational CI — read and correlate Metadata

```sh
sf api request rest /services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio --method GET --target-org SOURCE_ALIAS --stream-to-file ci-read-response.json
sf project retrieve start --metadata MktCalcInsightObjectDef:ExampleInsight --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Independent API 65 GET confirmed the returned draft identity and SQL. Metadata
retrieval supplied its definition ID, matching creation timestamp and SQL/label/type;
the Metadata full name omits the runtime `__cio` suffix. This correlates runtime
creation to its own Metadata definition, not an attachment to a previously deployed
shell. Direct REST semantic errors can be present in a saved body even with CLI
exit zero; inspect every response.

#### Operational CI — publish, then update label/schedule

Source publication was qualified using `ci-publish.json`:

```json
{
  "displayName": "Example Insight",
  "draft": false,
  "publishScheduleInterval": "SystemManaged"
}
```

```sh
sf api request rest /services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio --method PATCH --body @ci-publish.json --target-org SOURCE_ALIAS --stream-to-file ci-publish-response.json
sf api request rest /services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio --method GET --target-org SOURCE_ALIAS --stream-to-file ci-published-read.json
```

PATCH returned `PROCESSING`; independent GET later returned `ACTIVE`, with the
expected dimension and measure schema. **No materialized computation or successful
run is claimed:** last-run fields remained null. Publishing may initiate processing;
source authorization does not extend to the restricted target. Omit `definitionType`
on update; it is present only in the create input above.

A subsequent label/schedule update used `ci-update.json`:

```json
{
  "displayName": "Example Insight Updated",
  "publishScheduleInterval": "NotScheduled"
}
```

```sh
sf api request rest /services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio --method PATCH --body @ci-update.json --target-org SOURCE_ALIAS --stream-to-file ci-update-response.json
sf api request rest /services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio --method GET --target-org SOURCE_ALIAS --stream-to-file ci-updated-read.json
```

The update returned `PROCESSING`; independent readback confirmed the changed label,
`NOT_SCHEDULED` and retained SQL/dimensions/measures. Semantic SQL changes and no-op
updates were not tested; this is not an arbitrary-update or zero-processing promise.

#### Operational CI — delete and confirm settlement

Save `ci-delete.json` for the CLI's qualified empty-body DELETE transport:

```json
{
  "url": "/services/data/v65.0/ssot/calculated-insights/ExampleInsight__cio",
  "method": "DELETE",
  "body": { "mode": "raw", "raw": "" }
}
```

```sh
sf api request rest --file ci-delete.json --target-org SOURCE_ALIAS --stream-to-file ci-delete-response.json
sf api request rest /services/data/v65.0/ssot/calculated-insights --method GET --target-org SOURCE_ALIAS --stream-to-file ci-final-inventory.json
sf org list metadata --metadata-type MktCalcInsightObjectDef --target-org SOURCE_ALIAS --api-version 65.0 --json
```

An empty DELETE response was not terminal proof: the earlier lifecycle initially
showed `DELETING` and retained Metadata. Subsequent independent complete runtime
collection and Metadata inventory confirmed the owned CI absent from **both**;
the original source insight remained unchanged. Follow any collection pagination
before claiming absence, and reconcile pending deletion rather than repeating the
DELETE blindly. All owned source fixtures were removed; no computation/run success
or target mutation is implied by this operational definition lifecycle.

### Segment: `MarketSegmentDefinition`

#### Read / Retrieve

Run the combined command in the preceding chapter to retrieve
`MarketSegmentDefinition:Annual_Promo_Segment_1789248847753` alongside the insight.
This is a directly retrieved segment definition, separate from a kit template
snapshot. Its file is written under `force-app/main/default/marketSegmentDefinitions/`.

Parsed nested selection criteria, label, target (`segmentOn`) and segment type
matched independent API 65 readback. The XML **omits live `P2Y` lookback, schedule,
state and dataspace**. Referenced unified/link DMOs, source objects, fields and
relationships remain dependencies. Live `NO_REFRESH` and active/success state do
not prove draft behavior or absence of initial computation after deployment.
The selected-field comparison does not establish full lifecycle or replay fidelity.
Retrieval itself does not publish, count or activate the segment.

#### Create — Metadata definition only

**Source-only API 65 Metadata definition creation succeeded.** Use the authorized
source alias and existing DMO prerequisites described above; this does not qualify
a nonprocessing target route. The historical, subsequently deleted source file was
`force-app/main/default/marketSegmentDefinitions/McpSegParallel_20261027_Empty.marketSegmentDefinition-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MarketSegmentDefinition xmlns="http://soap.sforce.com/2006/04/metadata">
  <includeCriteria>&lt;DbtPipeline xmlns=""&gt;&lt;models&gt;&lt;model&gt;&lt;name&gt;McpSegParallel_20261027_Empty&lt;/name&gt;&lt;sql&gt;SELECT UnifiedssotIndividualMkt__dlm.ssot__Id__c FROM UnifiedssotIndividualMkt__dlm WHERE 1 = 0&lt;/sql&gt;&lt;/model&gt;&lt;/models&gt;&lt;/DbtPipeline&gt;</includeCriteria>
  <masterLabel>McpSegParallel 20261027 Empty</masterLabel>
  <segmentType>DBT</segmentType>
</MarketSegmentDefinition>
```

In a source project containing only this owned fixture:

```sh
sf project deploy start --source-dir force-app --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
sf project retrieve start --metadata MarketSegmentDefinition:McpSegParallel_20261027_Empty --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Independent readback matched decoded criteria, label and type. Two runtime GETs
for this name returned HTTP 404 `ITEM_NOT_FOUND` while the Metadata existed. Saved
definition transport is **not** live segment instantiation or guaranteed inertness.

#### Update — Metadata definition only

Changing only `masterLabel` to `McpSegParallel 20261027 Empty Updated`, then repeating
the commands above succeeded. An identical redeployment reported the segment
component `Unchanged`; a deployment job still occurred and `package.xml` changed.
This is not a zero-write promise or proof of live runtime update.

#### Delete — Metadata definition only

Exact destructive deployment succeeded with an internally generated empty
`manifest/package.xml` and `manifest/destructiveChangesPost.xml` selecting only:

```xml
<types>
  <members>McpSegParallel_20261027_Empty</members>
  <name>MarketSegmentDefinition</name>
</types>
```

Use the same full Package wrapper/version shown in the DMO Delete example and run:

```sh
sf project deploy start --manifest manifest/package.xml --post-destructive-changes manifest/destructiveChangesPost.xml --target-org SOURCE_ALIAS --api-version 65.0 --wait 5 --json
```

Independent inventory confirmed absence. These diagnostic manifests are internal,
not the intended user-facing workflow.

### Live segment: standard REST API 65

This is a **separate source-only operational lifecycle**, not `sf data360` or
Metadata deployment. POST **and PATCH** returned `PROCESSING`, followed by independent
GET `ACTIVE`, even with `NoRefresh` / `NO_REFRESH` and empty-result SQL. No explicit
publish/count/activate command was run. The target was untouched: its no-processing
restriction prevents applying these operations there without additional permission
or a separately proven nonprocessing admission route. No segment-member operations
are documented here; those are outside this plugin's scope.

#### Create

Save the exact qualified body as `rest-create.json` in an authorized source scratch
project (historical fixture name; establish ownership/absence before any reproduction):

```json
{
  "developerName": "McpSegParallel_20261027_Live",
  "displayName": "McpSegParallel 20261027 Live",
  "description": "Isolated source-only qualification, empty SQL audience",
  "segmentOnApiName": "UnifiedssotIndividualMkt__dlm",
  "segmentType": "Dbt",
  "includeDbt": {
    "models": {
      "models": [
        {
          "name": "McpSegParallel_20261027_Live",
          "sql": "SELECT UnifiedssotIndividualMkt__dlm.ssot__Id__c FROM UnifiedssotIndividualMkt__dlm WHERE 1 = 0"
        }
      ]
    }
  },
  "publishSchedule": "NoRefresh"
}
```

```sh
sf api request rest /services/data/v65.0/ssot/segments --method POST --body @rest-create.json --target-org SOURCE_ALIAS --json
```

The qualified API 65 **input** requires nested `includeDbt.models.models`; an
array directly under the first `models` failed with `JSON_PARSER_ERROR`. The
**output** instead has `includeDbt.models` as an array: do not replay it unchanged
as input. POST returned HTTP 201 and runtime IDs, not merely a Metadata definition.

#### Read / Retrieve

```sh
sf api request rest /services/data/v65.0/ssot/segments/McpSegParallel_20261027_Live --method GET --target-org SOURCE_ALIAS --json
```

HTTP 200 returned a `segments` array with the same IDs, `ACTIVE`, `NO_REFRESH`,
`P90D` lookback and the preserved DMO/SQL definition. This is live readback, not
complete cross-org fidelity or authorization to trigger processing elsewhere.

#### Update

Save this complete preserved-definition body as `rest-update.json`. Both schedule
fields are deliberately omitted; the tested existing no-refresh schedule survived.

```json
{
  "displayName": "McpSegParallel 20261027 Live Updated",
  "description": "Source-only updated definition, empty SQL audience",
  "segmentOnApiName": "UnifiedssotIndividualMkt__dlm",
  "segmentType": "Dbt",
  "includeDbt": {
    "models": {
      "models": [
        {
          "name": "McpSegParallel_20261027_Live",
          "sql": "SELECT UnifiedssotIndividualMkt__dlm.ssot__Id__c FROM UnifiedssotIndividualMkt__dlm WHERE 1 = 0"
        }
      ]
    }
  }
}
```

```sh
sf api request rest /services/data/v65.0/ssot/segments/McpSegParallel_20261027_Live --method PATCH --body @rest-update.json --target-org SOURCE_ALIAS --json
```

HTTP 200 returned `PROCESSING`; independent GET then confirmed `ACTIVE`, updated
label/description and unchanged IDs/SQL/DMO/schedule/lookback. Sparse label-only
PATCH failed, as did adding only `segmentType`; resending `NoRefresh` failed with
`publishScheduleInfo` validation, and an attempted `None` subtype was rejected.
Only the shown preserved-definition PATCH is qualified, not arbitrary sparse
updates or general omitted-field preservation.

#### Delete

The tested CLI required a request file for an empty DELETE body. Save this as
`rest-delete-request.json`:

```json
{
  "url": "/services/data/v65.0/ssot/segments/McpSegParallel_20261027_Live",
  "method": "DELETE",
  "body": { "mode": "raw", "raw": "" }
}
```

```sh
sf api request rest --file rest-delete-request.json --target-org SOURCE_ALIAS --json
```

HTTP 204 and independent exact GET HTTP 404 confirmed deletion. Both synthetic
segment definitions were removed; original source inventory remained, and shared
unified DMOs/membership tables were deliberately untouched. Do not infer a cleanup
of every generated/shared artifact or absence of automatic processing.

### Runtime data graph: standard CLI facade transport

This **source-only runtime CRUD** workflow is separate from Metadata template
transport in the next chapter. The qualified commands use standard
`sf api request rest` against the documented **API 67 MCP execute facade**;
they do not establish independent native graph CRUD parity, a dedicated built-in
graph command or template-to-graph instantiation.

`SOURCE_ALIAS` must identify the explicitly processing-authorized source. The target
was untouched; no nonprocessing target admission or cross-org fidelity is qualified.
Use an owned, unused name such as `ExampleGraph` and compatible existing root DMO
fields. The source unified root was referenced read-only, not ingested or modified.
**Creation itself starts processing and generates supporting metadata.** Update
also processed; no zero-cost, zero-row or blanket materialized-output guarantee is
provided. No standalone activation was needed for the measured lifecycle.

#### Create

Save `graph-create.json` below. `paramsJson` must be a JSON **string**, wrapping
`input`; its contents preserve the qualified root-only, two-field definition and
seven-day schedule. This is a scheduled runtime graph, not a draft template:

```json
{
  "toolName": "d360_data_graph_create",
  "paramsJson": "{\"input\":{\"name\":\"ExampleGraph\",\"label\":\"ExampleGraph\",\"description\":\"Source graph creation example\",\"creationMode\":\"DEFAULT\",\"dataspaceName\":\"default\",\"primaryObjectName\":\"UnifiedssotIndividualMkt__dlm\",\"type\":\"NONE\",\"fullRefreshConfig\":{\"schedule\":{\"frequency\":7,\"timeGranularity\":\"Day\"}},\"incrementalRefreshConfig\":{\"enabled\":false},\"sourceObject\":{\"name\":\"UnifiedssotIndividualMkt__dlm\",\"devName\":\"UnifiedssotIndividualMkt__dlm\",\"label\":\"Unified Individual MKT\",\"path\":[],\"fields\":[{\"sourceFieldName\":\"ssot__Id__c\",\"dataType\":\"Text\",\"isKeyColumn\":true,\"isProjected\":true},{\"sourceFieldName\":\"ssot__FirstName__c\",\"dataType\":\"Text\",\"isKeyColumn\":false,\"isProjected\":true}],\"relatedObjects\":[]}}}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-create.json --target-org SOURCE_ALIAS --json
```

Inspect nested results/errors, not just the CLI exit or facade transport status.
Creation returned `creating`; the automatically generated transform subsequently
reported `SUCCESS`. A native refresh attempted while the automatic run was in
progress returned `success:false` / `DG_REFRESH_NOT_ALLOWED`; it did not establish
an accepted explicit refresh. Do not issue refreshes merely to unlock updates.

#### Read / Retrieve

Save `graph-get.json`:

```json
{
  "toolName": "d360_data_graph_get",
  "paramsJson": "{\"dataGraphName\":\"ExampleGraph\",\"includeCIDetails\":true,\"includeSegmentDetails\":true}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-get.json --target-org SOURCE_ALIAS --json
```

This is a read through the facade even though its HTTP transport method is POST.
Independent graph readback confirmed the definition. The measured public state
`ready` did not directly expose edit-gate eligibility: earlier attempts before
initial automatic processing completed were rejected. Do not equate `ready` with
an observed state named `Active` or a general guarantee that any update is allowed.

#### Update

Save `graph-update.json`. It retains the original definition while changing the
description and adding the projected Text `ssot__LastName__c` field. The flag
`editScheduleOnly:false` makes this a substantive graph update, not schedule-only:

```json
{
  "toolName": "d360_data_graph_update",
  "paramsJson": "{\"input\":{\"name\":\"ExampleGraph\",\"label\":\"ExampleGraph\",\"description\":\"Source graph semantic update verified\",\"creationMode\":\"DEFAULT\",\"dataspaceName\":\"default\",\"primaryObjectName\":\"UnifiedssotIndividualMkt__dlm\",\"type\":\"NONE\",\"fullRefreshConfig\":{\"schedule\":{\"frequency\":7,\"timeGranularity\":\"Day\"}},\"incrementalRefreshConfig\":{\"enabled\":false},\"sourceObject\":{\"name\":\"UnifiedssotIndividualMkt__dlm\",\"devName\":\"UnifiedssotIndividualMkt__dlm\",\"label\":\"Unified Individual MKT\",\"path\":[],\"fields\":[{\"sourceFieldName\":\"ssot__Id__c\",\"dataType\":\"Text\",\"isKeyColumn\":true,\"isProjected\":true},{\"sourceFieldName\":\"ssot__FirstName__c\",\"dataType\":\"Text\",\"isKeyColumn\":false,\"isProjected\":true},{\"sourceFieldName\":\"ssot__LastName__c\",\"dataType\":\"Text\",\"isKeyColumn\":false,\"isProjected\":true}],\"relatedObjects\":[]}},\"editScheduleOnly\":false}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-update.json --target-org SOURCE_ALIAS --json
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-get.json --target-org SOURCE_ALIAS --json
```

The update returned `processing`, version `1`; later readbacks passed through
`editing_post_sync` to `ready`. Separate CLI and independent MCP GETs confirmed the
changed description and all three field shapes, with root/schedule/incremental
settings preserved. These selected **actual observed values** are response excerpts,
not complete envelopes or promises about generated IDs:

```json
{
  "sourceFieldName": "ssot__LastName__c",
  "dataType": "Text",
  "isProjected": true,
  "isKeyColumn": false
}
```

After the graph stabilized, replaying the exact update command once returned
`ready`, version `1`, with the same graph/node/three-field IDs; independent GET
confirmed unchanged semantics. This measured repeat caused no observed duplicate
or version bump, but is **not** a zero-write/zero-processing guarantee or proof for
arbitrary replay. No consumer was created; empty returned dependency arrays and
related-segment/object lists are not an exhaustive external-consumer audit.

#### Delete

Save `graph-delete.json` with the exact owned name:

```json
{
  "toolName": "d360_data_graph_delete",
  "paramsJson": "{\"dataGraphName\":\"ExampleGraph\"}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-delete.json --target-org SOURCE_ALIAS --json
sf api request rest /services/data/v67.0/ssot/mcp/execute --method POST --body @graph-get.json --target-org SOURCE_ALIAS --json
```

The actual successful deletion body was:

```json
{
  "result": { "success": true }
}
```

Independent graph GET then returned not found. The three individually inspected
owned generated ID/VALUE/fragment DMOs, previously readable under the same auth,
subsequently returned API 64 `ITEM_NOT_FOUND`; the generated transform also returned
not found. The DMO error wording permits missing **or inaccessible**, so these are
bounded before/after observations, not proof of universal cleanup.
**Independent generated mapping absence and graph-specific internal state cleanup
were not verified.** Shared `DataGraphStateTable__dlm` was deliberately untouched;
no shared-state cleanup command is provided. Do not generalize this deletion into
an all-artifacts/materialization/consumer-cleanup guarantee.

### Runtime identity resolution: standard CLI facade transport

This source-only runtime IR lifecycle uses standard `sf api request rest` through
the documented **API 67 MCP execute facade**. It is distinct from Metadata kit and
template CRUD below, and does **not** prove native API 65 create/PATCH/DELETE parity.
No custom installed data plugin, hand-authored kit or manifest was needed for this
operational route. Native API 65 GET is documented separately under Read.

`SOURCE_ALIAS` must be the explicitly publishing/processing-authorized source.
The target was untouched and its no-publishing restriction remains. **Create and
update automatically enter `PUBLISHING` despite `doesRunAutomatically:false`.**
No separate publish/run was called; that flag is not draft or zero-effects admission.
No successful explicit data run or profile computation is claimed.

Choose an owned, unused four-character ruleset suffix such as `ir01`, a private
label such as `ExampleIR`, and compatible existing source DMOs/fields. The examples
use the corresponding returned identity `Individual_ir01`; use the actual server
`objectApiName` from create if different. Do not reuse shared rulesets or alter
business metadata to make these examples fit.

#### Create

Save `ir-create.json`. `paramsJson` is a JSON **string**, not an object; preserve the
`input` wrapper and nested `criteria.criteria` structure:

```json
{
  "toolName": "d360_ir_create",
  "paramsJson": "{\"input\":{\"configurationType\":\"Individual\",\"dataSpaceName\":\"default\",\"label\":\"ExampleIR\",\"description\":\"Owned standard CLI facade transport example\",\"rulesetId\":\"ir01\",\"doesRunAutomatically\":false,\"matchRules\":{\"rules\":[{\"label\":\"Owned name and normalized email\",\"criteria\":{\"criteria\":[{\"entityName\":\"ssot__Individual__dlm\",\"fieldName\":\"ssot__FirstName__c\",\"matchMethodType\":\"Fuzzy\",\"shouldMatchOnBlank\":false},{\"entityName\":\"ssot__Individual__dlm\",\"fieldName\":\"ssot__LastName__c\",\"matchMethodType\":\"Exact\",\"shouldMatchOnBlank\":false},{\"entityName\":\"ssot__ContactPointEmail__dlm\",\"fieldName\":\"ssot__EmailAddress__c\",\"matchMethodType\":\"ExactNormalized\",\"shouldMatchOnBlank\":false}]}}]},\"reconciliationRules\":{\"rules\":[{\"entityName\":\"ssot__Individual__dlm\",\"ruleType\":\"LastUpdated\",\"shouldIgnoreEmptyValue\":true}]}}}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-create.json' --json
```

Successful source creation returned an IR identity and `PUBLISHING`, with six output/
link pairs provisioned. **HTTP 201 and CLI exit 0 can also contain a nested
`body.error` rather than success.** Inspect the actual nested result/error for every
operation before proceeding; the transport envelope alone does not prove creation.

#### Read / Retrieve

Save `ir-get.json`:

```json
{
  "toolName": "d360_ir_get",
  "paramsJson": "{\"identityResolution\":\"Individual_ir01\"}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-get.json' --json
```

The facade uses POST transport even for this read. Poll this exact owned identity
with bounded checks until `PUBLISHED` before attempting an update; stop and inspect
an error/unexpected state rather than blindly replaying writes. A first update
while still `PUBLISHING` returned a nested error despite HTTP 201 / exit 0. Later
GET confirmed `PUBLISHED`, and only then did the same substantive update succeed.

The separately qualified **native API 65 read** is:

```sh
sf api request rest /services/data/v65.0/ssot/identity-resolutions/Individual_ir01 --target-org SOURCE_ALIAS --method GET --json
```

This direct GET does not establish equivalent native write endpoints or request
shapes. The create/update/delete proof uses the API 67 facade throughout.

#### Update

Save `ir-update.json`. This complete tested shape preserves the label and match
criteria while changing the Individual reconciliation rule to `MostFrequent` and
the description. Do not infer arbitrary sparse PATCH support:

```json
{
  "toolName": "d360_ir_update",
  "paramsJson": "{\"identityResolution\":\"Individual_ir01\",\"input\":{\"label\":\"ExampleIR\",\"description\":\"Updated through standard CLI API67 facade\",\"doesRunAutomatically\":false,\"matchRules\":{\"rules\":[{\"label\":\"Owned name and normalized email\",\"criteria\":{\"criteria\":[{\"entityName\":\"ssot__Individual__dlm\",\"fieldName\":\"ssot__FirstName__c\",\"matchMethodType\":\"Fuzzy\",\"shouldMatchOnBlank\":false},{\"entityName\":\"ssot__Individual__dlm\",\"fieldName\":\"ssot__LastName__c\",\"matchMethodType\":\"Exact\",\"shouldMatchOnBlank\":false},{\"entityName\":\"ssot__ContactPointEmail__dlm\",\"fieldName\":\"ssot__EmailAddress__c\",\"matchMethodType\":\"ExactNormalized\",\"shouldMatchOnBlank\":false}]}}]},\"reconciliationRules\":{\"rules\":[{\"entityName\":\"ssot__Individual__dlm\",\"ruleType\":\"MostFrequent\",\"shouldIgnoreEmptyValue\":true}]}}}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-update.json' --json
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-get.json' --json
```

The successful source result retained the same IR ID, returned the Individual
reconciliation rule as `mostfrequent` and entered `PUBLISHING` again with automatic
run false. Read/reconcile state after mutation; do not mistake automatic publishing
for an inert configuration-only change or an explicit successful computation.

#### Delete

Save `ir-delete.json` with only the exact owned runtime identity:

```json
{
  "toolName": "d360_ir_delete",
  "paramsJson": "{\"identityResolution\":\"Individual_ir01\"}"
}
```

```sh
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-delete.json' --json
sf api request rest /services/data/v67.0/ssot/mcp/execute --target-org SOURCE_ALIAS --method POST --body '@ir-get.json' --json
```

Nested `result.success:true` was followed by `DELETING`, not immediate absence.
Subsequent facade GET returned not found and native API 65 GET returned HTTP 404
`ITEM_NOT_FOUND`; do not repeatedly delete while asynchronous cleanup is pending.
Some generated DMOs remained readable during deletion. Final exact-name checks of
all 12 generated output/link DMOs returned HTTP 404 `ITEM_NOT_FOUND` with wording
allowing **missing or inaccessible**. This is bounded identity-availability evidence,
not permission-independent physical deletion, a profile-row audit or broad cleanup
guarantee. No separate DMO/shared-state deletion was performed or is prescribed.

### Data kit templates: `DataKitObjectTemplate`

#### Read / Retrieve

The qualified kit snapshot includes substantive JSON payloads for a data graph,
identity resolution ruleset and segment, rather than only their names. **Low-level
diagnostic reproduction only:** the retained qualification used the following
`manifest/package.xml` in the source project. This is not a required hand-authored
file in the intended user workflow described above. The manifest explicitly
includes both templates and the kit definition/member links; a diagnostic
reproduction must use the source kit's actual members together, not only its display name.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>Annual_Promo_Segment_1789248847753</members>
    <members>Individual_MKT</members>
    <members>Marketing</members>
    <name>DataKitObjectTemplate</name>
  </types>
  <types>
    <members>MVP_DevOps_Test</members>
    <name>DataPackageKitDefinition</name>
  </types>
  <types>
    <members>MVP_DevOps_Test_1789482446919</members>
    <members>MVP_DevOps_Test_1789482462272</members>
    <members>MVP_DevOps_Test_1789483055431</members>
    <name>DataPackageKitObject</name>
  </types>
  <version>65.0</version>
</Package>
```

Retrieve all seven explicit members:

```sh
sf project retrieve start --manifest manifest/package.xml --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
```

Templates are written under `force-app/main/default/dataKitObjectTemplates/`.
The graph snapshot contains projected fields, joins and weekly refresh settings;
the identity resolution snapshot includes match/reconciliation rules and automatic
run settings. The segment snapshot contains selection criteria but **omits segment
publish schedule/status** observed in live readback. Selected semantic comparisons
matched, but runtime counts/dates were stale: an existing kit is a snapshot, not an
automatically refreshed export of current live configuration.

Payloads include source IDs, generated DMOs/transforms and external DLO references.
Seven retrieved members do not prove dependency closure, target readiness or full
schedule fidelity. Kit `isEnabled=false` does not guarantee inactive downstream
behavior: graph refresh and identity-resolution automatic-run settings remain in
the payload. Retrieval itself does not run them; safe deployment without
computation has **not** been established.

#### Create

**Source-only graph template creation succeeded** from an authored
`DataKitObjectTemplate` in the source project, without a parent kit:

```sh
sf project deploy start --metadata DataKitObjectTemplate:McpGraphParallel_20261027_T --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
sf project retrieve start --metadata DataKitObjectTemplate:McpGraphParallel_20261027_T --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
```

These selectors require the corresponding local source file; they do not construct
an arbitrary graph from its name. Readback preserved the JSON root, two projected
fields, key flags and draft setting by inspection. A GET of the intended graph
still returned not found: **template deployment did not instantiate a graph**.
This is not runtime Data Graph CRUD or cross-org replay. Initial runtime updates
were rejected by a status gate; later source qualification established actual
runtime CRUD through standard CLI facade transport, documented in
[Runtime data graph](#runtime-data-graph-standard-cli-facade-transport).
Independent native CRUD parity remains unproven; Metadata template deployment
still does not instantiate the runtime graph.

The IR template/container source create/delete qualification below is also
transport only. No successful graph/IR kit-instantiation replay is established;
the later accepted-but-failed minimal IR job is qualified in the kit chapter.
Do not invent additional kit fields or substitute a direct Metadata type.

#### Update

Changing only the graph template JSON `entityPayload` description and repeating
the selector commands above succeeded; readback contained the changed description.
Refreshing a stored kit automatically from current runtime configuration is **not
verified**.

For IR, the isolated template `masterLabel` update succeeded:

```sh
sf project deploy start --metadata DataKitObjectTemplate:McpIrParallel_20261027_Template --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
```

A full-container repeat containing the unchanged `DataPackageKitDefinition` failed
with an internal error and rollback. Per-component template success inside that
failed deployment is not committed success. Only the later isolated label update
is qualified, not IR payload mutation or repeatable full-kit update.

#### Delete

The exact owned graph template was deleted through standard Metadata deletion;
subsequent retrieve reported the entity missing even though the outer CLI exit was
zero. Inspect per-file state/errors, not just exit status.

IR template/container/link deletion succeeded together using the exact destructive
selection in the kit definition chapter below. All historical synthetic Metadata
fixtures were removed. Later runtime graph/IR sections record bounded inspections
of generated objects; complete generated-artifact cleanup is still not claimed.

### Kit definition: `DataPackageKitDefinition`

#### Read / Retrieve

Run the manifest command in the preceding chapter to retrieve the definition and
its members/templates together. The qualified definition is `MVP_DevOps_Test`.
Its output directory is `force-app/main/default/dataPackageKitDefinitions/`.
The definition records template ordering and state. Metadata type/command existence
and a successful snapshot export are not full CRUD.

#### Create

An isolated **source-only IR container, substantive template and member link**
were created together with the following command in a source project containing
only those three authored fixtures:

```sh
sf project deploy start --source-dir force-app --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
```

The exact members were `DataPackageKitDefinition:McpIrParallel_20261027_Kit`,
`DataKitObjectTemplate:McpIrParallel_20261027_Template` and
`DataPackageKitObject:McpIrParallel_20261027_Member`. Kit readback recognized the
stored Identity Resolution template. This is container/template transport, not
installation, target replay or runtime IR instantiation.

Standard `sf project` transports kit metadata; instantiating an installed kit is
a separate asynchronous Connect deployment with a job result to reconcile. A bounded
source API 65 experiment submitted `components:[{type:"IdentityResolution",config:{}}]`
to `/ssot/data-kits/{ownedKitName}?asyncMode=true`: the job was accepted, then its
status endpoint `/ssot/datakit-deployment-job/{jobId}` reported `Error`. That experiment
used a manually constructed template, not a complete canonical server-generated
export. It proves neither successful IR instantiation nor universal failure of valid
IR kits. The private Metadata kit/template/link were subsequently deleted; the failed
job remains an audit artifact.

The inspected current kit contract did not expose canonical template generation
or adding components to a new kit. A later private-kit GUI export is optional
research for successful canonical kit replay, **not a prerequisite** for the direct
CLI facade runtime route documented under
[Runtime identity resolution](#runtime-identity-resolution-standard-cli-facade-transport).
That API 67 route now has source create/read/substantive update/delete proof,
automatic publishing and terminal ruleset-unavailable readback. Native API 65 write
parity and cross-org kit fidelity remain unproven. The target was untouched and its
no-processing/no-publishing restriction remains.

#### Update

The unchanged-container repeat failed with an internal error and rollback as
noted above. General container update/redeployment remains **not qualified**;
the isolated template label update does not establish container update support.

#### Delete

Source-only deletion of the exact three owned IR Metadata fixtures succeeded.
The low-level internally generated `manifest/destructiveChangesPost.xml` was:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>McpIrParallel_20261027_Template</members>
    <name>DataKitObjectTemplate</name>
  </types>
  <types>
    <members>McpIrParallel_20261027_Member</members>
    <name>DataPackageKitObject</name>
  </types>
  <types>
    <members>McpIrParallel_20261027_Kit</members>
    <name>DataPackageKitDefinition</name>
  </types>
  <version>65.0</version>
</Package>
```

With a version-only `manifest/empty.xml` (same Package namespace, no `types`):

```sh
sf project deploy start --manifest manifest/empty.xml --post-destructive-changes manifest/destructiveChangesPost.xml --target-org SOURCE_ALIAS --api-version 65.0 --wait 10 --json
```

All three components reported deletion; independent kit GET reported not found.
This does not qualify runtime undeployment, generated-object deletion or shared
kit cleanup. The intended UX still generates these transport files internally.

### Kit membership: `DataPackageKitObject`

#### Read / Retrieve

Run the same seven-member manifest command to retrieve the three exact
`MVP_DevOps_Test_...` members listed there, together with their definition and
templates. Member files link the kit to its templates and are written under
`force-app/main/default/DataPackageKitObjects/`. This is snapshot retrieval,
not proof of independent member portability.

#### Create

The exact owned IR link was created with its container/template using the source
command in the preceding chapter. Independent member portability is **not verified**.

#### Update

Kit member updates are **not yet verified**.

#### Delete

The owned IR member link was deleted together with its template/container using
the exact selection above. Independent deletion of arbitrary member links or
runtime component undeployment is **not verified**.

## Package identity and command aliases

The user-selected current npm identity is **`sf-plugin-data`**, unscoped, at
version `0.1.0`. The repository is
[`JoernBerkefeld/sf-plugin-data`](https://github.com/JoernBerkefeld/sf-plugin-data),
and the local directory is `sf-plugin-data`. Repository metadata uses the same
identity. This repository/folder rename does not change command topics, version
or published artifacts; release finalization and npm trusted-publisher setup
remain separate work.

Canonical commands remain `sf data360 retrieve` and `sf data360 deploy`.
`datacloud`, `d360` and `dc` are equivalent topic aliases for both operations,
including their flags and help. There are only two command implementations and
no `sf data` registrations. Aliases retain canonical `sf-data360-*` envelopes,
provenance command strings, `data360/...` layout and DMO schema/kind; only plugin
identity metadata changes. API 65.0/default limitations remain unchanged.

Historical evidence: the old unscoped `sf-plugin-data360` lookup returned `E404`
on 2026-10-26, but its later manual publication was rejected with npm `E403`
spam detection. Earlier scoped artifacts and the rejected unscoped artifacts
remain historical evidence only and must not be reused for the current name.
An earlier `v0.1.0` tag at `a328066` identified `sf-plugin-data360`; the subsequently
authorized replacement now points to `8bcbe63` with npm identity `sf-plugin-data`.
The repository/folder rename leaves that tag unchanged. Earlier approvals do not
authorize further history changes. Future release work requires fresh explicit
approval and a tree-bound inspected artifact.

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
binary. The package's oclif metadata exposes `data360` and the `datacloud`, `d360`,
`dc` alias topics to Salesforce CLI. Each supports bare topic help and command help.
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
resolve and validate before runtime target inspection; core optional-org flag authentication
still happens during parsing, before input resolution. Core `-o/--target-org` supports the
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
selection and only same-origin `/services/data/v<version>/ssot/` or experimental
literal `/services/data/latest/ssot/` reads; latest never permits writes. It rejects
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
